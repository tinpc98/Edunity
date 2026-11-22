# 05. API contract

Mọi response thành công vẫn theo envelope `{ "success": true, "data": ... }`.

## Mới: readiness

- `GET /api/teacher/classes/:id/readiness`: TEACHER, chỉ lớp của mình.
- `GET /api/admin/classes/:id/readiness`: ADMIN.

```json
{
  "success": true,
  "data": {
    "classId": "6b02d066afbd21b3ae89feaa",
    "status": "PENDING_APPROVAL",
    "canSaveDraft": false,
    "canSubmit": false,
    "canApprove": false,
    "checks": [
      {
        "key": "TEACHING_AUTHORIZATION",
        "label": "Quyền giảng dạy",
        "code": "SUBJECT_AUTHORIZATION_REQUIRED",
        "status": "PENDING",
        "blocksSubmit": false,
        "message": "Giáo viên chưa có quyền giảng dạy được duyệt cho môn, khối và cấp độ này"
      }
    ]
  }
}
```

- `checks` luôn có 7 phần tử (ví dụ trên rút gọn). `status` là `PASSED` hoặc `PENDING`. `code` là `null` khi đạt.
- `canSaveDraft` và `canSubmit` chỉ có thể `true` ở DRAFT, NEED_CHANGES. `canApprove` chỉ ở PENDING_APPROVAL.
- Mã lỗi dùng lại mã sẵn có, nên là `SUBJECT_AUTHORIZATION_REQUIRED`, không phải `TEACHING_AUTHORIZATION_REQUIRED` như ví dụ trong yêu cầu.

## Thay đổi ở API hiện có

| API | Thay đổi | Tương thích |
|---|---|---|
| `POST`, `PATCH /teacher/classes` | Không còn trả lỗi quyền dạy, hợp đồng, policy | Nới lỏng. `pricingPolicy*` là `null` khi chưa thỏa policy |
| `POST /teacher/classes` | `courseId` sai định dạng trả 404 `COURSE_NOT_FOUND` | Đổi mã lỗi cho input sai |
| `POST /teacher/classes/:id/submit` | Thêm `approvalWarnings[]` (cùng dạng `checks`); bỏ `reviewedBy` | Thêm trường; bỏ một trường nội bộ |
| `POST /admin/classes/:id/approve` | Lỗi có thêm `details.pendingChecks[]` | Thêm trường. Mã và HTTP status của lỗi đầu tiên giữ nguyên |

## Lỗi khi gửi duyệt hoặc phê duyệt

`error` là điều kiện chặn đầu tiên. `details.pendingChecks` liệt kê mọi điều kiện chặn của thao tác đó.

```json
{
  "success": false,
  "error": "TEACHER_CONTRACT_NOT_FOUND",
  "message": "Teacher does not have an active teaching contract",
  "details": {
    "pendingChecks": [
      {
        "key": "TEACHER_CONTRACT",
        "label": "Hợp đồng giảng dạy",
        "code": "TEACHER_CONTRACT_NOT_FOUND",
        "status": "PENDING",
        "blocksSubmit": false,
        "message": "Giáo viên chưa có hợp đồng giảng dạy"
      }
    ]
  }
}
```

## Mã lỗi mới

| Mã | HTTP | Ý nghĩa |
|---|:-:|---|
| `CLASS_START_DATE_REACHED` | 400 | Đã tới ngày khai giảng, không còn gửi hoặc duyệt được |
| `CLASS_DATES_INVALID` | 400 | Ngày bắt đầu sau ngày kết thúc |
| `SCHEDULE_OVERLAP` | 400 | Các ca trong tuần trùng giờ |
