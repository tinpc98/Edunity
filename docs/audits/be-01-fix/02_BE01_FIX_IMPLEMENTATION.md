# BÁO CÁO THỰC THI TRANSACTION & AUDIT CONSISTENCY (BE-01-FIX — IMPLEMENTATION REPORT)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 1 Hardening — Class NEED_CHANGES Transaction & Audit Consistency  
**Chịu trách nhiệm:** Senior Backend Engineer (Châu)  
**Ngày thực hiện:** 21/11/2026  
**Trạng thái:** HOÀN THÀNH IMPLEMENTATION  

---

## 1. CÁC TỆP NGUỒN ĐÃ THAY ĐỔI

1. [BackEnd/src/services/adminClassService.js](file:///c:/CODE/Edunity/BackEnd/src/services/adminClassService.js):
   - Refactor hàm `requestChanges` sử dụng MongoDB Transaction Session Fail-Closed.
   - Đưa cập nhật `Class` và `AuditLog` vào cùng một transaction session.
   - Tách biệt `notify` thành post-commit side-effect có bảo vệ `try/catch`.
   - Export alias `requestClassChanges: requestChanges`.
2. [BackEnd/tests/be01ClassNeedChanges.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be01ClassNeedChanges.test.js):
   - Bổ sung 5 ca kiểm thử tích hợp chuyên biệt: Test 10, Test 11, Test 12, Test 13, Test 14.

---

## 2. CHI TIẾT THỰC THI TRONG `adminClassService.js`

### 2.1. Cấu trúc hàm `requestChanges` mới

```javascript
// BE-01.2: Admin requests changes on pending class with mandatory reviewNote and transactional consistency
const requestChanges = async (adminId, classId, body = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();

  if (isBlank(body.reviewNote)) {
    throw validationError("reviewNote is required when requesting changes");
  }

  const reviewNote = body.reviewNote.trim();

  // 1. Fail-closed transaction session initialization
  if (typeof mongoose.startSession !== "function") {
    throw new AppError(
      "Database session is unavailable; request-changes requires transaction support",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503
    );
  }

  let session;
  try {
    session = await mongoose.startSession();
  } catch (sessionErr) {
    throw new AppError(
      "Failed to start database transaction session for request-changes",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503,
      { originalError: sessionErr.message }
    );
  }

  let updated;
  try {
    if (!session || typeof session.withTransaction !== "function") {
      throw new AppError(
        "Database session is unavailable; request-changes requires transaction support",
        "DATABASE_TRANSACTION_UNAVAILABLE",
        503
      );
    }

    await session.withTransaction(async () => {
      // 2. Conditional atomic update inside transaction for concurrency safety
      const doc = await Class.findOneAndUpdate(
        { _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED },
        {
          $set: {
            status: "NEED_CHANGES",
            reviewedBy: adminId,
            reviewedAt: new Date(),
            reviewNote,
            updatedBy: adminId,
          },
        },
        { session, returnDocument: "after" }
      ).lean();

      if (!doc) {
        const exists = await Class.exists({ _id: classId, ...NOT_DELETED }).session(session);
        if (!exists) throw CLASS_NOT_FOUND();
        throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
      }

      // 3. AuditLog recorded within the exact same transaction session (no partial writes!)
      await audit(
        {
          actorAdminId: adminId,
          action: "CLASS_CHANGES_REQUESTED",
          targetType: "Class",
          targetId: doc._id,
          beforeState: { status: "PENDING_APPROVAL" },
          afterState: { status: "NEED_CHANGES", reviewNote: doc.reviewNote },
        },
        session
      );

      updated = doc;
    });
  } finally {
    if (session && typeof session.endSession === "function") {
      await session.endSession();
    }
  }

  // 4. Post-commit side-effect: Notification is sent strictly AFTER transaction commits
  try {
    await notify(
      updated.teacherId,
      "Lớp học cần chỉnh sửa",
      updated.reviewNote,
      "CLASS_CHANGES_REQUESTED",
      {
        dedupeKey: `CLASS_CHANGES_REQUESTED:${updated._id.toString()}:${updated.reviewedAt ? new Date(updated.reviewedAt).getTime() : Date.now()}`,
      }
    );
  } catch (notifyErr) {
    // Notification failure must NOT invalidate a successfully committed transaction
    console.error(
      `[adminClassService] Failed to send notification for class ${updated._id}:`,
      notifyErr.message
    );
  }

  return updated;
};
```

---

## 3. CÁC NGUYÊN TẮC THIẾT KẾ BẢO ĐẢM TÍNH TOÀN VẸN

### 3.1. Tính Nguyên tử (Atomicity & Consistency)
- Cả `Class.findOneAndUpdate` và `AuditLog.create` đều nhận `{ session }`.
- Nếu có bất kỳ lỗi nào xảy ra trong khối `withTransaction` (kể cả lỗi ghi audit log), MongoDB driver tự động gửi lệnh `abortTransaction()`. Cập nhật trạng thái của Class lập tức được hủy bỏ hoàn toàn.
- Phiên transaction luôn được đóng (`session.endSession()`) trong khối `finally`.

### 3.2. Tính Phân lập khi Thông báo (Post-Commit Notification Isolation)
- Hàm `notify(...)` được đặt ngoài phạm vi `session.withTransaction`.
- Điều này bảo đảm:
  1. Không có side-effect gửi thông báo nếu transaction rollback.
  2. Lỗi mạng khi tạo bản ghi thông báo không gây rollback một transaction đã commit thành công.
  3. API trả về `200 OK` cho Admin với dữ liệu lớp học chính xác, tránh gây hiểu nhầm về trạng thái lớp.
  4. Sử dụng `dedupeKey` chống trùng lặp nếu hệ thống có cơ chế retry sau này.

### 3.3. An toàn tương tranh (Concurrency Protection)
- Điều kiện truy vấn `{ _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED }` đóng vai trò là một khóa điều kiện (Compare-And-Swap / Optimistic Concurrency Check).
- Khi có hai request gửi đến cùng lúc (ví dụ Admin A bấm Request Changes và Admin B bấm Approve):
  - Request đầu tiên giành được khóa ghi trên document và cập nhật trạng thái.
  - Request thứ hai vào sau sẽ thấy `status !== "PENDING_APPROVAL"`, `findOneAndUpdate` trả về `null`, và hệ thống lập tức ném `409 CLASS_NOT_PENDING_APPROVAL`.
  - Không xảy ra tình trạng trạng thái bị đè lẫn nhau hoặc tạo ra 2 audit log đối nghịch.
