# 08. GO / NO-GO

| Mốc | Quyết định |
|---|---|
| Code review, merge, staging | **GO** |
| Production | **NO-GO** cho tới khi xử lý B-1 và smoke test trên staging |

## Đã sửa và kiểm tra thành công

- Giáo viên VERIFIED tạo, lưu, sửa DRAFT khi chưa có quyền dạy, hợp đồng, policy.
- Gửi duyệt chặn dữ liệu thiếu hoặc sai; thiếu quyền, hợp đồng, giá chỉ cảnh báo và được ghi nhận.
- Phê duyệt vẫn chặn đủ mọi điều kiện, thêm hạn duyệt, transaction và chống ghi chồng.
- NEED_CHANGES sửa và gửi lại được trên UI. REJECTED là trạng thái cuối.
- Admin thấy từng điều kiện và giữ đủ ba thao tác.
- 24 ca yêu cầu PASS. Riêng ca 13 có ngoại lệ B-2. 0 regression.

## Đã sửa nhưng chưa kiểm thử

- Chưa chạy với dữ liệu staging hoặc Atlas, chưa smoke test có đăng nhập trên server dùng DB thật.
- Chưa thử Safari, Firefox, thiết bị thật. Trang Admin chưa thử ở bề rộng điện thoại.
- Câu chữ mới ở thẻ Quyền giảng dạy chỉ qua typecheck và build.

## Chưa sửa hoặc BLOCKED

### B-1. Lớp chưa mở vẫn bị phạt vắng dạy (chặn production)

- **Hiện tượng (đã tái hiện):** job vòng đời buổi học không xét trạng thái lớp. Buổi học của lớp DRAFT, PENDING_APPROVAL, NEED_CHANGES, REJECTED quá giờ 30 phút bị hủy, ghi vi phạm `NO_SHOW` và báo Admin. Giáo viên không thể tránh vì `startSession` trả 403 `CLASS_NOT_ACTIVE`.
- **Vì sao gấp hơn sau task này:** lỗi có sẵn, nhưng nay nhiều lớp sẽ nằm ở trạng thái chưa mở. Lớp chờ hợp đồng bị BE-02 tự từ chối vẫn còn nguyên buổi học. Ba vi phạm được xác nhận dẫn tới đề xuất kỷ luật.
- **BLOCKED:** `sessionPresenceService.js` ngoài phạm vi được phép sửa, cần chủ module đồng ý.
- **Bản vá đề xuất:** đặt trong `evaluateSessionLifecycleAt`, trước dòng `Reconcile with trusted LiveKit room state...`. Đã thử trong bản sao: hết vi phạm ở 4 trạng thái trên, OPEN vẫn phạt đúng, regression không đổi (1215/1219). Chưa áp dụng vào repo.

```js
// A class that was never opened has nobody to teach, and its teacher is not allowed to start the session
if (await mongoose.model("Class").exists({ _id: session.classId, status: { $in: ["DRAFT", "PENDING_APPROVAL", "NEED_CHANGES", "REJECTED"] } })) {
  return session.toObject();
}
```

- Cần rà các `TeacherViolation` đã ghi cho lớp chưa từng mở.

### B-2. Availability trả dữ liệu lớp DRAFT

`GET /api/classes/:id/availability` không cần đăng nhập và trả giá, sĩ số của lớp DRAFT nếu biết ID (đã tái hiện, `enrollmentOpen: false`). **BLOCKED** bởi ràng buộc "không thay đổi public enrollment". Đề xuất trả 404 cho lớp chưa công khai.

### B-3. Test có thể ghi vào DB thật

14 suite nạp `BackEnd/.env` rồi tạo, sửa, xóa trên DB đó. Cần chuyển sang `tests/helpers/db.js` trước khi ai đó chạy `npm test`.

### Việc nhỏ hơn, phát hiện khi đọc source, chưa sửa

| # | Vấn đề |
|---|---|
| O-1 | "Hạn chót tuyển sinh" chọn theo ngày được lưu 00:00, nên đóng từ đầu ngày đó |
| O-2 | Đổi cấp độ khóa học không cập nhật lớp NEED_CHANGES hoặc PENDING, các lớp này sẽ báo lệch khóa chuẩn |
| O-3 | Một DRAFT bất kỳ chặn xóa khóa học. Admin vẫn chuyển INACTIVE được |
| O-4 | Tab "Tất cả" của Admin dùng API công khai, chỉ thấy lớp OPEN |
| O-5 | Tạo lớp chưa có idempotency phía server (hai tab có thể tạo hai nháp); gửi duyệt chưa có rate limit |
| O-6 | Chi tiết lớp của giáo viên còn trả `updatedBy`, có thể là ID Admin |

## Trước khi lên production

1. Quyết định và xử lý B-1.
2. Xác nhận ba diễn giải trong `02_VALIDATION_MATRIX.md`.
3. Đếm lớp PENDING đã tới ngày khai giảng hoặc trùng ca, vì sẽ không duyệt được nữa.
4. Smoke test trên staging: tạo, gửi, yêu cầu sửa, gửi lại, duyệt.

Không có migration. Chưa commit, push hay deploy.
