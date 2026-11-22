# 07. Regression

So từng test với baseline `89387a4` trong cùng môi trường cô lập:

| | Baseline | Sau sửa |
|---|:-:|:-:|
| Suite | 70 | 71 |
| Test | 1165 | 1219 |
| Pass | 1161 | 1215 |
| Fail | 4 | 4, cùng các test đó |
| Test từ pass thành fail (cùng tên) | - | **0** |

Ba test CUR-10 được đổi tên theo luật mới và đều pass. Tám test cũ từng fail giữa chừng vì khẳng định gate cũ; cách sửa ghi trong 06.

## Phạm vi yêu cầu

| Khu vực | Suite | Kết quả |
|---|---|:-:|
| BE-01 NEED_CHANGES | `be01ClassNeedChanges` | 14/14 |
| BE-02 Maintenance | `be02MaintenanceExpiredClass` | 17/17 |
| BE-03 Soft delete | `be03AcademicSoftDelete` | 22/22 |
| Khóa tạo lớp và xóa khóa học | `chauSafeDeleteConcurrencyReplSet` | 14/14 |
| Teacher verification | `teacherVerificationAccess`, `teacherBankAndReverification`, `teacherIdentity` | 31/31 |
| Teacher authorization | `tea07SubjectAuthorization` | 12/12 |
| Teacher contract | `teacherContract` | 12/12 |
| Pricing policy | `phase1ReplSet`, `cur10ClassCreationGate` | 11/11 |
| Admin approval | `phase2ReplSet`, `platform` | 16/16 |
| Lịch và buổi học | `cur11ScheduleCollisionReplSet` | 5/5 |
| Public class listing | `catalogSearch`, `publicClassRegistration` | 37/37 |
| Student enrollment | `enrollment`, `cur09EnrollmentSnapshotFinance` | 13/13 |
| Vòng đời lớp | `classLifecycleRegression` | 6/6 |
| Route contract | `academicContract` | 19/19 |

## 4 lỗi có sẵn, chưa sửa

| Suite | Test | Triệu chứng |
|---|---|---|
| `authorization` | finds a class by its literal name | Kỳ vọng > 0, nhận 0 |
| `adminFinance.pr6` | 2.1 overview metrics | Thiếu thuộc tính `disclaimer` |
| `payosUnifiedIntent.pr1` | TUI-01 | Kỳ vọng hạn > 800 giây, nhận 599 |
| `schemaInventory` | G0-02.1.1 | Kỳ vọng 50 model, có 51 |

## 14 suite phụ thuộc `.env`

Đã chạy trên DB in-memory trống cho cả code cũ và mới: **53 pass, 43 fail ở cả hai, giống nhau từng test**. Các suite này cần dữ liệu có sẵn trên DB thật, nên **không được tính là PASS**, chỉ chứng minh không có khác biệt trước và sau.
