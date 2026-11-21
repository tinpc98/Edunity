# EDUNITY V3 — RATING AGGREGATION & DATA INTEGRITY

**Task ID:** `EDUNITY-ADMIN-REVIEW-COMMENT-MODERATION-V1`  
**Workspace:** `D:\Dự Án\Edunity`  

---

## 1. Công thức và Điều kiện tổng hợp Rating

Điểm xếp hạng sao trung bình (`ratingAverage`) và tổng số đánh giá (`ratingCount`) của Lớp học (`Class`) và Hồ sơ Giảng viên (`User.teacherProfile`) được tính toán lại tự động thông qua hàm `recalculateRating(classId, teacherId, session)` trong `BackEnd/src/services/reviewService.js`.

### Bộ lọc hợp lệ cho Public Visible:
```javascript
const PUBLIC_VISIBLE = {
  isDeleted: { $ne: true },
  isHidden: { $ne: true },
};
```

Chỉ những đánh giá thỏa mãn:
1. `isDeleted !== true` (Không bị xóa mềm)
2. `isHidden !== true` (Không bị quản trị viên ẩn)

mới được đưa vào tập dữ liệu tính trung bình:
```javascript
const [classStats, teacherStats] = await Promise.all([
  Review.aggregate([
    { $match: { classId: new mongoose.Types.ObjectId(classId), ...PUBLIC_VISIBLE } },
    { $group: { _id: "$classId", avgRating: { $avg: "$rating" }, totalReviews: { $sum: 1 } } },
  ]),
  Review.aggregate([
    { $match: { teacherId: new mongoose.Types.ObjectId(teacherId), ...PUBLIC_VISIBLE } },
    { $group: { _id: "$teacherId", avgRating: { $avg: "$rating" }, totalReviews: { $sum: 1 } } },
  ]),
]);
```

---

## 2. Bảo toàn tính toàn vẹn dữ liệu gốc (Zero Data Distortion)

1. **Không sửa đổi số sao gốc của người dùng:**
   - Khi Admin ẩn một đánh giá vi phạm, trường `rating` (ví dụ 1 sao, 2 sao, ...) của bản ghi đó **hoàn toàn giữ nguyên** trong cơ sở dữ liệu.
   - Khi Admin chọn `[Hiện lại]` (Unhide), hệ thống chỉ cần kích hoạt lại `recalculateRating` mà không làm mất hoặc thay đổi bất kỳ thuộc tính ban đầu nào do học viên đã đánh giá.

2. **Đồng bộ hóa tức thì (Real-time Synchronization):**
   - Hành động `hideReview`: Lập tức tính lại điểm lớp & giáo viên loại trừ review này.
   - Hành động `unhideReview`: Lập tức tính lại điểm lớp & giáo viên cộng lại review này.
   - Hành động `deleteReview` (xóa mềm): Lập tức loại trừ khỏi điểm trung bình.
   - Hành động `restoreReview` (khôi phục): Tự động khôi phục và tính lại điểm nếu review không ở trạng thái ẩn.

3. **Danh sách công khai (Public Endpoints):**
   - API `GET /api/classes/:id/reviews` và `GET /api/teachers/:id/reviews` áp dụng filter `PUBLIC_VISIBLE`, bảo đảm người dùng bên ngoài không bao giờ thấy nội dung và số sao của đánh giá đã bị ẩn hoặc xóa mềm.
