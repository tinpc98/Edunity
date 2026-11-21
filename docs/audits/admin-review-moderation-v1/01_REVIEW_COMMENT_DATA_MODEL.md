# EDUNITY V3 — REVIEW & COMMENT DATA MODEL AUDIT

**Task ID:** `EDUNITY-ADMIN-REVIEW-COMMENT-MODERATION-V1`  
**Workspace:** `D:\Dự Án\Edunity`  
**Branch:** `feature/teacher-admin`  
**Date:** 2026-11-21  

---

## 1. Storage of Comments & Ratings in Source

Thực tế kiểm tra trong source code EDUNITY V3 (`BackEnd/src/models/`):
- **Không tồn tại Comment Model riêng biệt.**
- Đánh giá (Star Rating: 1 - 5) và Bình luận phản hồi (Comment Text: String) được lưu trữ cùng nhau trong **`Review` Model** (`BackEnd/src/models/Review.js`).

### Schema định nghĩa của Review:
```javascript
const reviewSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 2000 },

    // Content Moderation (V1)
    isHidden: { type: Boolean, default: false, index: true },
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    hideReason: { type: String, default: null },
  },
  { timestamps: true }
);

reviewSchema.plugin(softDeletePlugin);
```

---

## 2. Distinction: Review vs Comment vs Message

| Tiêu chí | Review & Comment (`Review.js`) | Message (`Message.js`) |
| :--- | :--- | :--- |
| **Bản chất dữ liệu** | Đánh giá sao (1-5) kèm nhận xét của học viên cho lớp học & giáo viên | Tin nhắn trao đổi trực tiếp giữa các người dùng trong phòng chat / hội thoại |
| **Phạm vi hiển thị** | Công khai trên trang chi tiết Lớp học (`/classes/:id`) và Giáo viên (`/teachers/:id`) | Riêng tư giữa các thành viên tham gia hội thoại |
| **Cơ chế Ẩn (Hide)** | Hỗ trợ `isHidden = true`, loại khỏi hiển thị công khai và rating trung bình | Không áp dụng (áp dụng trạng thái thu hồi `RECALLED`) |
| **Cơ chế Xóa mềm** | Sử dụng `softDeletePlugin` (`isDeleted = true`, đưa vào Thùng rác) | Có chính sách thu hồi / ẩn riêng, không cho xóa tùy tiện làm sai lệch ngữ cảnh hội thoại |
| **Tác động xếp hạng** | Trực tiếp tác động lên `ratingAverage` và `ratingCount` của `Class` và `Teacher` | Không tác động lên xếp hạng |

---

## 3. Relationship with Reports and Evidence Protection

- Khi người dùng gửi khiếu nại về một đánh giá hoặc hành vi phản cảm, hệ thống ghi nhận vào `Report` (`BackEnd/src/models/Report.js`) với:
  - `targetType: "REVIEW"`
  - `targetId: Review._id`
  - `status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED"`
- **Bảo vệ bằng chứng (Evidence Integrity):**
  - Đánh giá đang có `Report` mở (`OPEN` hoặc `IN_REVIEW`) bị chặn xóa vĩnh viễn (`trashService.permanentDelete` trả về mã lỗi 409 `DEPENDENCY_CONFLICT`).
  - Đánh giá chỉ có thể bị ẩn (`isHidden: true`) hoặc xóa mềm (`isDeleted: true`) để lưu giữ nguyên vẹn bằng chứng phục vụ công tác thanh tra, giải quyết khiếu nại.
