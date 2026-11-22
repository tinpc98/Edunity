# EDUNITY V3 — TEACHER PAYOUT AUDIT
## Document 01: Current Payout State Analysis

### 1. Bối cảnh điều tra
Người dùng báo cáo trường hợp:
- Giáo viên: **Nguyễn Văn Đức** (UserId: `6ae9eea27281b039f5b4a871`)
- Yêu cầu rút tiền: **250.000đ**
- Trạng thái trên giao diện Admin: Hiển thị **"Đã phê duyệt"**
- Vấn đề: Yêu cầu này không xuất hiện trong danh sách "Chờ chuyển tiền" của Admin và không hiển thị trong mục "Chờ nhận tiền" của Giảng viên.

---

### 2. Trạng thái thực tế trong cơ sở dữ liệu MongoDB

Truy vấn trực tiếp collection `payouts` trong cơ sở dữ liệu MongoDB:
```javascript
db.payouts.find({ teacherId: ObjectId("6ae9eea27281b039f5b4a871") }).pretty();
```

#### Dữ liệu bản ghi Payout 250.000đ (`_id: ObjectId("6b007b2ed7739dadbda3cf5b")`):
```json
{
  "_id": "6b007b2ed7739dadbda3cf5b",
  "payoutCode": "PO-TEST-001",
  "teacherId": "6ae9eea27281b039f5b4a871",
  "amount": 250000,
  "status": "APPROVED",
  "bankAccountSnapshot": {
    "bankName": "NGAN HANG KIEM THU",
    "accountNumber": "0000000000",
    "accountHolder": "NGUYEN VAN DUC"
  },
  "approvedBy": "6a99eea27281b039f5b4a899",
  "approvedAt": "2026-11-20T10:00:00.000Z",
  "isTestData": true,
  "testDataTag": "TEST_TEACHER_PAYOUT_UI_V1",
  "notes": "Bản ghi kiểm thử UI rút tiền giáo viên V1",
  "createdAt": "2026-11-20T09:30:00.000Z",
  "updatedAt": "2026-11-20T10:00:00.000Z"
}
```

#### Các bản ghi kiểm thử khác trong cùng nhóm (`testDataTag: TEST_TEACHER_PAYOUT_UI_V1`):
1. **500.000đ** (`status: "PENDING"`, `isTestData: true`): Chờ phê duyệt.
2. **180.000đ** (`status: "PROCESSING"`, `isTestData: true`): Đang chuyển khoản ngân hàng.
3. **320.000đ** (`status: "REJECTED"`, `isTestData: true`): Đã bị từ chối do thông tin sai lệch.

---

### 3. Phân tích tính toàn vẹn dữ liệu (Data Integrity Analysis)

1. **Nguồn gốc dữ liệu**:
   - Các bản ghi này được khởi tạo trực tiếp trong cơ sở dữ liệu MongoDB phục vụ mục đích kiểm thử giao diện (UI Testing).
   - Bản ghi được gán nhãn `isTestData: true` và `testDataTag: "TEST_TEACHER_PAYOUT_UI_V1"`.

2. **Thiếu liên kết thực tế**:
   - **TeacherEarning / TeacherSettlement**: Bản ghi Payout 250.000đ không gắn với bất kỳ bản ghi `TeacherEarning` nào có trạng thái `ELIGIBLE_FOR_WITHDRAWAL`. Do đó, không có thù lao thực tế nào bị khấu trừ hoặc giữ chân cho yêu cầu rút tiền này.
   - **Tài khoản ngân hàng**: Sử dụng thông tin giả lập (`NGAN HANG KIEM THU`, số tài khoản `0000000000`), không có tài khoản ngân hàng chính thức nào được kích hoạt/xác minh trong bảng `TeacherBankAccount`.

3. **Nguy cơ an toàn tài chính**:
   - Nếu hệ thống hoặc Admin bấm xác nhận chuyển tiền (Complete Payout) cho bản ghi này, hệ thống tuyệt đối **KHÔNG ĐƯỢC** cho phép hoàn tất như một payout thật vì đây là dữ liệu TEST.
   - Cơ chế bảo vệ tài chính (Financial Safety Guard) đã được triển khai để chặn đứng bất kỳ hành động giải ngân thực tế nào đối với các bản ghi kiểm thử (`isTestData: true`).
