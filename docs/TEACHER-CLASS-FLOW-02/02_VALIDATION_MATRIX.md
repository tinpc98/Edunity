# 02. Validation matrix

**Chặn**: request bị từ chối. **Cảnh báo**: request thành công và ghi nhận điều kiện thiếu. **-**: không kiểm tra.

| Điều kiện | Tạo / sửa DRAFT | Gửi duyệt | Phê duyệt | Nhóm (`key`) |
|---|:-:|:-:|:-:|---|
| Role TEACHER, ACTIVE, chưa xóa | Chặn | Chặn | Chặn | `TEACHER_VERIFICATION` |
| VERIFIED và còn hạn | Chặn | Chặn | Chặn | `TEACHER_VERIFICATION` |
| Đúng chủ sở hữu (khi sửa, gửi) | Chặn | Chặn | - | - |
| Khóa ACTIVE, môn và danh mục hợp lệ, có cấp độ | Chặn | Chặn | Chặn | `COURSE` |
| Thuộc tính lớp khớp khóa chuẩn | Chặn | Chặn | Chặn | `COURSE` |
| Dữ liệu đã nhập đúng kiểu và ràng buộc (kiểm khi ghi) | Chặn | - | - | - |
| Đủ mô tả và 4 mốc ngày | - | Chặn | Chặn | `CLASS_INFORMATION` |
| Ngày bắt đầu không sau ngày kết thúc | Chặn | Chặn | Chặn | `CLASS_INFORMATION` |
| Chưa tới ngày khai giảng (UTC+7, cùng hàm với BE-02) | - | Chặn | Chặn | `CLASS_INFORMATION` |
| Có lịch, các ca không trùng giờ | - | Chặn | Chặn | `SCHEDULE_SESSIONS` |
| Có buổi học, nằm trong thời gian lớp | - | Chặn | Chặn | `SCHEDULE_SESSIONS` |
| Số buổi trong khung policy (nếu có policy) | - | Chặn | Chặn | `SCHEDULE_SESSIONS` |
| Quyền dạy APPROVED đúng môn, khối, cấp độ | - | **Cảnh báo** | Chặn | `TEACHING_AUTHORIZATION` |
| Có policy, học phí và loại lớp hợp lệ | - | **Cảnh báo** | Chặn | `PRICING_POLICY` |
| Hợp đồng ACTIVE còn hiệu lực | - | **Cảnh báo** | Chặn | `TEACHER_CONTRACT` |
| Trạng thái nguồn | DRAFT, NEED_CHANGES | DRAFT, NEED_CHANGES | PENDING_APPROVAL | - |

Readiness, gửi duyệt và phê duyệt dùng chung `teacherClassService.evaluateClass`. Cảnh báo không tạo quyền, hợp đồng hay chính sách.

## State machine

Source dùng `OPEN` thay cho `APPROVED`. Không thêm trạng thái.

```text
DRAFT ------------> PENDING_APPROVAL ------> OPEN
                      |   ^    |
         Admin yêu cầu|   |    +-----------> REJECTED (Admin hoặc job BE-02; trạng thái cuối)
                      v   | Teacher gửi lại
                   NEED_CHANGES
```

## Quyết định diễn giải, cần Product xác nhận

1. **"Buổi học đầy đủ"** = có ít nhất một buổi và nằm trong `minSessions..maxSessions` nếu đã có policy. Không bắt khớp tuyệt đối với số buổi suy ra từ lịch tuần, vì sẽ chặn trường hợp nghỉ lễ và lớp hợp lệ hiện có.
2. **Số buổi ngoài khung thì chặn gửi duyệt**, dù khung nằm trong policy, vì đây là tính đầy đủ của lớp và giáo viên tự sửa được. Thiếu policy hoặc sai khung giá chỉ cảnh báo.
3. **DRAFT vẫn cần** tên, loại lớp, học phí, sĩ số vì schema bắt buộc. Wizard điền sẵn và cho sửa. Không đổi schema.
