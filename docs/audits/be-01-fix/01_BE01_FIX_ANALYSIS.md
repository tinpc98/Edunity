# PHÂN TÍCH NGUYÊN NHÂN VÀ RỦI RO KỸ THUẬT (BE-01-FIX — ANALYSIS REPORT)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 1 Hardening — Class NEED_CHANGES Transaction & Audit Consistency  
**Chịu trách nhiệm:** Senior Backend Engineer (Châu)  
**Ngày thực hiện:** 21/11/2026  
**Trạng thái:** HOÀN TẤT PHÂN TÍCH & XÁC MINH SOURCE CODE  

---

## 1. BỐI CẢNH & HIỆN TRẠNG TRƯỚC KHI SỬA ĐỔI

Trong đợt triển khai Task BE-01 ban đầu, luồng yêu cầu chỉnh sửa lớp học (`NEED_CHANGES`) được thực hiện trong [BackEnd/src/services/adminClassService.js](file:///c:/CODE/Edunity/BackEnd/src/services/adminClassService.js) qua hàm `requestChanges`:

```javascript
// CODE CŨ TRƯỚC KHI FIX:
const requestChanges = async (adminId, classId, body = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  if (isBlank(body.reviewNote)) throw validationError("reviewNote is required when requesting changes");
  const reviewNote = body.reviewNote.trim();

  // BƯỚC 1: Cập nhật Class ngoài transaction
  const updated = await Class.findOneAndUpdate(
    { _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED },
    { $set: { status: "NEED_CHANGES", reviewedBy: adminId, reviewedAt: new Date(), reviewNote, updatedBy: adminId } },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await Class.exists({ _id: classId, ...NOT_DELETED });
    if (!exists) throw CLASS_NOT_FOUND();
    throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
  }

  // BƯỚC 2: Ghi audit log ngoài transaction
  await audit({
    actorAdminId: adminId,
    action: "CLASS_CHANGES_REQUESTED",
    targetType: "Class",
    targetId: updated._id,
    beforeState: { status: "PENDING_APPROVAL" },
    afterState: { status: "NEED_CHANGES", reviewNote: updated.reviewNote },
  });

  // BƯỚC 3: Gửi notification
  await notify(updated.teacherId, "Lớp học cần chỉnh sửa", updated.reviewNote, "CLASS_CHANGES_REQUESTED");
  return updated;
};
```

---

## 2. PHÂN TÍCH CÁC NGUY CƠ & LỖ HỔNG (ROOT CAUSE ANALYSIS)

### 2.1. Nguy cơ Ghi dữ liệu không hoàn chỉnh (Partial Writes / Inconsistent State)
- **Cơ chế lỗi:** Thao tác `Class.findOneAndUpdate` được thực hiện trước và độc lập với thao tác `await audit(...)`. Không có session transaction nào bao bọc hai thao tác này.
- **Kịch bản sự cố:**
  1. `Class.findOneAndUpdate` thành công: Tài liệu `Class` trong cơ sở dữ liệu đã chuyển sang trạng thái `NEED_CHANGES`.
  2. Quá trình `audit(...)` gặp sự cố (ví dụ: mất kết nối DB tạm thời, lỗi validation của AuditLog schema, timeout, v.v.).
  3. Lỗi ném ra ngoài khiến Express Global Error Handler bắt lỗi và trả về HTTP 500 `INTERNAL_SERVER_ERROR` cho Admin.
- **Hệ quả nghiêm trọng:**
  - Phía Admin nhận thông báo lỗi và tin rằng thao tác yêu cầu chỉnh sửa thất bại.
  - Tuy nhiên, trong database, lớp học **ĐÃ BỊ CHUYỂN THÀNH `NEED_CHANGES`**.
  - **KHÔNG CÓ BẢN GHI `AuditLog` NÀO ĐƯỢC TẠO RA**, vi phạm nghiêm trọng quy định tuân thủ kiểm toán (BR-35 / NFR-15: mọi thao tác phê duyệt/từ chối/yêu cầu sửa của Admin phải có audit trail).

### 2.2. Nguy cơ Thông báo không đồng bộ (Notification Out-of-Sync)
- **Cơ chế lỗi:** Lệnh `notify(...)` được đặt sau `audit(...)`.
- **Kịch bản sự cố 1:** Nếu `audit` thất bại, exception ném ra khiến `notify` không bao giờ được gọi. Lớp đã sang `NEED_CHANGES` nhưng giáo viên hoàn toàn không nhận được thông báo hay ghi chú yêu cầu sửa đổi.
- **Kịch bản sự cố 2:** Nếu `notify` bị lỗi mạng ngoại vi (ví dụ timeout đến push service hoặc socket queue) và ném lỗi unhandled, API có thể trả về lỗi cho Admin mặc dù cả Class và AuditLog đã được lưu thành công. Admin sẽ hiểu nhầm rằng yêu cầu chỉnh sửa chưa được lưu.

### 2.3. Nguy cơ Tương tranh (Concurrency & State Transition Collision)
- Hai Admin cùng mở một lớp học `PENDING_APPROVAL`.
- Admin 1 gửi yêu cầu chỉnh sửa (`requestChanges`), trong khi Admin 2 đồng thời bấm phê duyệt (`approveClass`) hoặc từ chối (`rejectClass`).
- Nếu không có cơ chế conditional update kèm transaction session, hai thao tác có thể ghi đè trạng thái lẫn nhau hoặc tạo ra các bản ghi audit mâu thuẫn.

---

## 3. GIẢI PHÁP THIẾT KẾ ĐỀ XUẤT

1. **MongoDB Multi-Document Transaction Fail-Closed:**
   - Khởi tạo `mongoose.startSession()`. Nếu không thể khởi tạo session hoặc transaction không khả dụng, trả ngay `503 DATABASE_TRANSACTION_UNAVAILABLE` (fail-closed, không fallback ngoài transaction).
   - Đưa cả `Class.findOneAndUpdate({ _id, status: "PENDING_APPROVAL" })` và `auditService.audit(..., session)` vào bên trong `session.withTransaction(...)`.
   - Nếu `audit` thất bại, `session.withTransaction` sẽ tự động hủy (abort) transaction, rollback toàn bộ cập nhật trên `Class`. Trạng thái lớp vẫn giữ nguyên là `PENDING_APPROVAL`.
2. **Post-Commit Notification:**
   - Tuyệt đối không gửi notification bên trong transaction.
   - Chỉ kích hoạt `notify(...)` sau khi transaction đã commit thành công 100%.
   - Bao bọc `notify(...)` trong khối `try...catch` riêng biệt: nếu gửi thông báo thất bại, chỉ log lỗi warning/error mà **không làm crash request** và **không trả lỗi 500** về phía Admin (vì dữ liệu nghiệp vụ thực tế đã commit thành công).
3. **Conditional Atomic State Lock:**
   - Điều kiện `status: "PENDING_APPROVAL"` kết hợp khóa phiên transaction đảm bảo chỉ duy nhất 1 thao tác (giữa `requestChanges`, `approveClass`, `rejectClass`) có thể thành công, thao tác còn lại nhận `409 Conflict`.
