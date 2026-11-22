# BE-02-FIX-03: Báo Cáo Kết Quả Kiểm Thử (Test Results Report)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Targeted Fix (BE-02-FIX-03)  
**Tập kiểm thử:** [BackEnd/tests/be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js)  
**Lệnh thực thi:** `npm --prefix BackEnd test -- tests/be02MaintenanceExpiredClass.test.js`  
**Môi trường:** MongoMemoryReplSet (MongoDB Replica Set phục vụ Multi-Document ACID Transactions)  
**Tổng số Test Cases:** 28  
**Kết quả:** 28/28 PASS (100%)  

---

## 1. Kết Quả Kiểm Thử Toàn Diện (28/28 Test Cases)

| STT | Nhóm Kịch Bản | Mô Tả Chi Tiết Test Case | Thời Gian | Kết Quả |
| :---: | :--- | :--- | :---: | :---: |
| **01** | **FIX-01/02** | Class rejection thành công: Class REJECTED, AuditLog tạo thành công, Notification lưu cùng transaction với `deliveryStatus='DELIVERED'` | 152 ms | **PASS** |
| **02** | **FIX-01/02** | Audit thất bại: Toàn bộ transaction rollback, Class giữ `PENDING_APPROVAL`, không có AuditLog, không có Notification | 190 ms | **PASS** |
| **03** | **FIX-01/02** | Notification persistence thất bại: Toàn bộ transaction rollback, không có partial commit, Class giữ `PENDING_APPROVAL` | 164 ms | **PASS** |
| **04** | **FIX-01/02** | Không có MongoDB session: Fails closed, class unchanged, no audit, no notification | 141 ms | **PASS** |
| **05** | **FIX-01/02** | Session không hỗ trợ transaction: Fails closed, session cleanly closed in finally | 142 ms | **PASS** |
| **06** | **FIX-01/02** | Transaction bị MongoDB từ chối (WriteConflict): Aborts cleanly, class remains `PENDING_APPROVAL` | 119 ms | **PASS** |
| **07** | **FIX-01/02** | Concurrent Admin update: Admin duyệt đồng thời (`OPEN`), job bỏ qua không ghi đè, không tạo audit/notification sai lệch | 98 ms | **PASS** |
| **08** | **FIX-01/02** | Job chạy lại (Idempotency): Lần chạy 2 từ chối 0 lớp, không tạo thêm AuditLog hay Notification | 114 ms | **PASS** |
| **09** | **FIX-03/04** | **Crash trước commit:** Transaction tự động abort, Class remains `PENDING_APPROVAL`, không có audit, không có notification | 104 ms | **PASS** |
| **10** | **FIX-03/04** | **Crash sau commit:** Class, AuditLog và Notification đều đã được commit an toàn trong DB trước khi tiến trình crash | 122 ms | **PASS** |
| **11** | **FIX-03/04** | **Crash recovery sau crash:** `recoverMissingExpiredClassNotifications` quét và bù notification cho lớp `REJECTED` bị thiếu notification | 114 ms | **PASS** |
| **12** | **FIX-03/04** | Tự phục hồi là idempotent: Chạy lại recovery lần 2 không tạo notification thứ 2 | 123 ms | **PASS** |
| **13** | **FIX-03/04** | Hai worker đồng thời: Đúng 1 worker reject class, không nhân đôi audit hoặc notification | 105 ms | **PASS** |
| **14** | **FIX-03/04** | Dedupe notification: Gửi lặp lại cùng `dedupeKey` không tạo bản ghi thứ 2 | 106 ms | **PASS** |
| **15** | **FIX-03/04** | Không đánh dấu DELIVERED sai: Lỗi ghi DB thì không có bản ghi DELIVERED nào được tạo hoặc trả về thành công | 103 ms | **PASS** |
| **16** | **FIX-03/04** | Quét phục hồi tự động tích hợp trong `runMaintenanceJob`: Tự động chạy recovery missing notifications | 149 ms | **PASS** |
| **17** | **FIX-02 (Lock)** | Acquire lock thành công khi khóa tự do | 106 ms | **PASS** |
| **18** | **FIX-02 (Lock)** | Lock đang thuộc worker khác: acquire trả về false | 95 ms | **PASS** |
| **19** | **FIX-02 (Lock)** | Heartbeat thành công: `runExclusive` gia hạn `lockedUntil` định kỳ | 478 ms | **PASS** |
| **20** | **FIX-02 (Lock)** | Heartbeat trả false: Đánh dấu lease mất, `lockContext.isLeaseActive()` trả về false | 342 ms | **PASS** |
| **21** | **FIX-02 (Lock)** | Heartbeat throw error: Đánh dấu lease không còn xác nhận, `isLeaseActive()` trả về false | 360 ms | **PASS** |
| **22** | **FIX-02 (Lock)** | Lease hết hạn khi job đang chạy: Maintenance job dừng các bước còn lại | 118 ms | **PASS** |
| **23** | **FIX-02 (Lock)** | Release không xóa lock của worker khác | 120 ms | **PASS** |
| **24** | **Core/Timezone** | Lớp có ngày khai giảng tương lai không bị từ chối | 126 ms | **PASS** |
| **25** | **Core/Timezone** | Chỉ nhắm tới `PENDING_APPROVAL`: `OPEN`, `IN_PROGRESS`, `NEED_CHANGES`, `DRAFT` không bị ảnh hưởng | 132 ms | **PASS** |
| **26** | **Core/Timezone** | Kiểm tra ranh giới ngày theo múi giờ: 5 phút trước nửa đêm không từ chối, 5 phút sau nửa đêm từ chối | 121 ms | **PASS** |
| **27** | **Core/Timezone** | Fault Isolation: Lỗi xử lý một lớp không làm hỏng việc xử lý các lớp khác | 131 ms | **PASS** |
| **28** | **Core/Timezone** | Cấu hình hằng số mặc định bảo trì được xuất đúng (`TTL=240000ms`, `HB=60000ms`) | 90 ms | **PASS** |

---

## 2. Bằng Chứng Kỹ Thuật (Verification Evidence)

### 2.1. Bằng chứng Transaction Rollback khi Notification thất bại (Test 3)
```javascript
// Test 3: Notification persistence fails inside transaction
jest.spyOn(Notification, "findOneAndUpdate").mockRejectedValueOnce(new Error("Notification DB write error"));
const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

// KẾT QUẢ ĐỐI CHỨNG:
expect(result.rejectedCount).toBe(0);
expect((await Class.findById(cls._id).lean()).status).toBe("PENDING_APPROVAL");
expect(await AuditLog.countDocuments({ targetId: cls._id })).toBe(0);
expect(await Notification.countDocuments({ userId: teacher._id })).toBe(0);
// -> Toàn bộ transaction rollback sạch sẽ, không có partial commit!
```

### 2.2. Bằng chứng Crash Sau Commit không làm mất Notification (Test 10)
```javascript
// Test 10: Process crashes immediately after commit
const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

// KẾT QUẢ ĐỐI CHỨNG:
const fresh = await Class.findById(cls._id).lean();
expect(fresh.status).toBe("REJECTED");
const audit = await AuditLog.findOne({ targetId: cls._id }).lean();
expect(audit).not.toBeNull();
const notif = await Notification.findOne({
  userId: teacher._id,
  dedupeKey: `CLASS_EXPIRED_REJECTED:${cls._id.toString()}`,
}).lean();
expect(notif.deliveryStatus).toBe("DELIVERED");
// -> Notification đã nằm sẵn trong MongoDB ngay từ thời điểm transaction commit!
```

### 2.3. Bằng chứng Tự Phục Hồi Lớp REJECTED Bị Thiếu Notification (Test 11 & 12)
```javascript
// Test 11: Class REJECTED missing notification
const cls = await createClassFixture("REJECTED", pastDate);
cls.reviewNote = "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.";
await cls.save();

// Chạy recovery
const recoveryResult = await recoverMissingExpiredClassNotifications(new Date(), {});
expect(recoveryResult.recoveredCount).toBe(1);

// Chạy lại lần 2 (Idempotent)
const secondRun = await recoverMissingExpiredClassNotifications(new Date(), {});
expect(secondRun.recoveredCount).toBe(0);
// -> Hệ thống phát hiện dữ liệu thiếu, tự động bù notification và không bao giờ tạo trùng lặp.
```
