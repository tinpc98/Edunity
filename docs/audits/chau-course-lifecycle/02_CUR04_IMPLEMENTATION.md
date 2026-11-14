# BÁO CÁO 02: TRIỂN KHAI QUẢN TRỊ KHÓA HỌC DÀNH CHO ADMIN (TASK CUR-04 IMPLEMENTATION)

- **Dự án:** Edunity V3
- **Chế độ:** IMPLEMENTATION REPORT & ARCHITECTURAL VERIFICATION
- **Người thực hiện:** Châu (Senior Backend Engineer)
- **Thời gian lập:** 13/11/2026

---

## 1. MỤC TIÊU VÀ NGUYÊN TẮC THIẾT KẾ

Task CUR-04 có mục tiêu giải phóng năng lực quản trị của Admin đối với toàn bộ vòng đời của Khóa học (`Course`), bao gồm các khóa học đang hoạt động (`ACTIVE`), tạm dừng (`INACTIVE`), tìm kiếm theo tên hoặc mã (`slug`), lọc đa tiêu chí, phân trang và kích hoạt lại khóa học một cách an toàn.

### Nguyên tắc bất biến (Invariants):
1. **Phân quyền tuyệt đối (Strict RBAC):** Chỉ tài khoản có vai trò `ADMIN` mới được truy cập các endpoint `/api/admin/courses*`. Học viên và giáo viên bị từ chối ngay ở tầng middleware với mã lỗi `403 FORBIDDEN`.
2. **Bảo vệ toàn vẹn Public API:** Các API công khai dành cho khách và học viên (`GET /api/courses`, `GET /api/courses/:id`) tiếp tục bị khóa cứng ở điều kiện `status: "ACTIVE"` và chưa bị xóa mềm (`isDeleted: false`). Khóa học `INACTIVE` tuyệt đối không được hiển thị ra ngoài.
3. **Sắp xếp ổn định (Stable Sort):** Mọi truy vấn phân trang phải luôn kèm theo khóa thứ cấp `_id` để ngăn hiện tượng trùng/nhảy trang (pagination jitter) khi các bản ghi có cùng timestamp `createdAt`.

---

## 2. CHI TIẾT HIỆN THỰC KỸ THUẬT

### 2.1. Đăng ký Định tuyến (Routes)
Trong file [`BackEnd/src/routes/courseCatalogRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js):
```javascript
const admin = [authMiddleware, requireRole("ADMIN")];

// Courses (CUR-04 & Safe Delete)
router.get("/courses", controller.searchCourses);
router.get("/courses/:id", controller.getCourse);
router.get("/courses/:id/classes", controller.getCourseClasses);
router.get("/admin/courses", admin, controller.adminListCourses);
router.get("/admin/courses/:id", admin, controller.adminGetCourse);
router.post("/admin/courses", admin, controller.createCourse);
router.patch("/admin/courses/:id", admin, controller.updateCourse);
router.delete("/admin/courses/:id", admin, controller.deleteCourse);
```

### 2.2. Service Danh sách Khóa học cho Admin (`adminListCourses`)
Trong file [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js):
```javascript
const adminListCourses = async (query, paging) => {
  const filter = { ...NOT_DELETED };

  // 1. Bộ lọc trạng thái: Hỗ trợ "ALL", "ACTIVE", "INACTIVE"
  if (query.status && query.status !== "ALL") {
    filter.status = resolveStatus(query.status);
  }

  // 2. Tìm kiếm đa trường: tiêu đề, mã slug, mô tả, sách tham chiếu
  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search.trim()), $options: "i" };
    filter.$or = [
      { title: pattern },
      { slug: pattern },
      { description: pattern },
      { curriculumReference: pattern },
    ];
  }

  // 3. Bộ lọc theo phân cấp học thuật
  for (const field of ["categoryId", "subjectId"]) {
    if (query[field]) {
      if (!mongoose.isValidObjectId(query[field])) throw validationError(`${field} is invalid`);
      filter[field] = query[field];
    }
  }

  if (query.gradeLevel) {
    if (!GRADE_LEVELS.includes(query.gradeLevel)) {
      throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
    }
    filter.gradeLevel = query.gradeLevel;
  }

  if (query.level) filter.level = resolveLevel(query.level);
  if (query.curriculumReference) {
    filter.curriculumReference = { $regex: escapeRegex(query.curriculumReference.trim()), $options: "i" };
  }

  // 4. Cơ chế sắp xếp ổn định chống nhảy trang
  let sort = { createdAt: -1, _id: -1 };
  if (query.sortBy) {
    const validSortFields = ["title", "createdAt", "updatedAt", "status"];
    const sortField = validSortFields.includes(query.sortBy) ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder === "asc" || query.sortOrder === "1" ? 1 : -1;
    sort = { [sortField]: sortOrder, _id: sortOrder };
  }

  const [items, total] = await Promise.all([
    Course.find(filter).sort(sort).skip(paging.skip).limit(paging.pageSize).lean(),
    Course.countDocuments(filter),
  ]);

  return paged(items, total, paging);
};
```

### 2.3. Service Chi tiết Khóa học cho Admin (`adminGetCourse`)
Khác với API công khai của học viên, `adminGetCourse` cho phép Admin đọc đầy đủ thông tin của Khóa học ngay cả khi khóa học đang ở trạng thái `INACTIVE`, đồng thời bổ sung thêm các số liệu phục vụ quyết định quản trị:
```javascript
const adminGetCourse = async (courseId) => {
  const course = await getCourseOrThrow(courseId);
  // Trả về khóa học bất kể trạng thái ACTIVE hay INACTIVE
  const [openClassCount, totalClassCount] = await Promise.all([
    Class.countDocuments({ courseId: course._id, status: "OPEN", ...NOT_DELETED }),
    Class.countDocuments({ courseId: course._id, ...NOT_DELETED }),
  ]);
  return { ...course.toObject(), openClassCount, totalClassCount };
};
```

### 2.4. Kích hoạt lại Khóa học an toàn (`updateCourse` Reactivation Gate)
Khi Admin chuyển trạng thái từ `INACTIVE` sang `ACTIVE`:
- Hệ thống áp dụng **Chốt chặn phân cấp (Hierarchy Safety Gate)**: Kiểm tra Môn học cha (`Subject`) có đang `ACTIVE` và chưa bị xóa hay không.
- Nếu Môn học cha đã bị tắt hoặc xóa mềm, hệ thống lập tức từ chối kích hoạt với lỗi `SUBJECT_INACTIVE` (400) để ngăn chặn việc tạo ra các khóa học mồ côi ngoài danh mục chuẩn.
- Ghi nhận `AuditLog` lưu vết ai đã sửa, thời điểm và trạng thái trước/sau khi thay đổi.

```javascript
  if (body.status !== undefined) {
    const nextStatus = resolveStatus(body.status);
    if (nextStatus === "ACTIVE" && course.status !== "ACTIVE") {
      const subject = await Subject.findOne({ _id: course.subjectId, ...NOT_DELETED });
      if (!subject) throw new AppError("Subject not found or deleted", "SUBJECT_NOT_FOUND", 400);
      if (subject.status !== "ACTIVE") {
        throw new AppError("Cannot activate course under an inactive subject", "SUBJECT_INACTIVE", 400);
      }
    }
    course.status = nextStatus;
  }
```

---

## 3. KẾT QUẢ ĐẠT ĐƯỢC

1. Admin có giao diện quản lý toàn diện đối với tất cả các trạng thái khóa học.
2. Tìm kiếm linh hoạt theo cả từ khóa tên lẫn slug/mã khóa học.
3. Học viên không thể nhìn thấy hoặc ghi danh vào các khóa học `INACTIVE`.
4. Toàn bộ logic đã được kiểm chứng bằng 11 bài kiểm thử tự động trong `tests/courseLifecycleCur12.test.js` (**PASS 11/11**).

