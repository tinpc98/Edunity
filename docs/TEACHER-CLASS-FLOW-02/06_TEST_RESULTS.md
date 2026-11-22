# 06. Kết quả kiểm thử (22/11/2026)

## Môi trường

- Backend: Jest, MongoMemoryReplSet 7.0.14, chạy trong bản sao không có `.env`.
- Frontend E2E: Microsoft Edge headless, bản build Vite, Express thật, MongoDB in-memory. Không mock API.
- Script E2E là script tạm, không thêm vào repo.

## Tổng hợp

| Hạng mục | Kết quả |
|---|---|
| `teacherClassFlow02.test.js` (mới) | **PASS 54/54** |
| 5 suite mới hoặc đã sửa, chạy lại ngay trong repo | **PASS 81/81** |
| Toàn bộ suite dùng DB in-memory | **1215/1219**. 4 lỗi có sẵn, xem 07 |
| E2E trình duyệt | **PASS 25/25 bước** |
| Typecheck `tsconfig.app.json`, `tsconfig.node.json` | **PASS** |
| Production build (`tsc -b`, `vite build`) | **PASS** |
| oxlint | Exit 0 |

Đối chứng: bản đầu của suite mới (51 test) chạy trên code cũ thì fail 44.

## 24 ca yêu cầu

| # | Ca | Bằng chứng | Kết quả |
|:-:|---|---|:-:|
| 1 | Thiếu quyền, tạo DRAFT | Jest `1.` | PASS |
| 2 | Thiếu hợp đồng, tạo DRAFT | Jest `2.` | PASS |
| 3 | Thiếu policy, tạo DRAFT | Jest `3.` | PASS |
| 4 | Thiếu lịch, lưu DRAFT | Jest `4.` | PASS |
| 5 | Thiếu lịch, gửi duyệt thất bại | Jest `5.`, `5b.` | PASS |
| 6 | Đủ dữ liệu, thiếu quyền, gửi được | Jest `6.`, E2E | PASS |
| 7 | Duyệt khi thiếu quyền bị chặn | Jest `7.` | PASS |
| 8 | Duyệt khi thiếu hợp đồng bị chặn | Jest `8.` | PASS |
| 9 | Duyệt khi thiếu policy bị chặn | Jest `9.` | PASS |
| 10 | Đủ điều kiện, duyệt được | Jest `10.`, E2E | PASS |
| 11 | Giáo viên khác không sửa được | Jest `11.` | PASS |
| 12 | Student không tạo lớp | Jest `12.` | PASS |
| 13 | DRAFT không công khai | Jest `13.`: danh sách, chi tiết, buổi học, giáo trình, trang giáo viên | PASS, trừ endpoint availability (B-2 trong 08) |
| 14 | NEED_CHANGES, sửa, gửi lại | Jest `14.`, E2E | PASS |
| 15 | Duyệt đồng thời | Jest `15.`, `15b.` | PASS |
| 16 | Job không từ chối lớp đã duyệt | Jest `16.`, `16b.` | PASS |
| 17 | Không quyền vẫn thấy khóa ACTIVE | E2E, 105 khóa qua 2 trang API | PASS |
| 18 | Chọn khóa, chuyển bước | E2E | PASS |
| 19 | Lưu DRAFT | E2E, gồm bấm 3 lần chỉ tạo 1 lớp | PASS |
| 20 | Sửa tiếp DRAFT | E2E: ngày, thứ, giờ, tạo buổi học | PASS |
| 21 | Validation đúng | E2E | PASS |
| 22 | Admin thấy điều kiện thiếu | E2E | PASS |
| 23 | Không báo thành công sai | E2E: lưu lỗi, gửi lỗi, duyệt lỗi | PASS |
| 24 | Typecheck và build | Lệnh ở bảng tổng hợp | PASS |

## Test cũ đã sửa

Các test này khẳng định luật cũ mà yêu cầu đảo ngược. Phần chứng minh "bị chặn" được dời sang phê duyệt, không bỏ.

| Suite | Thay đổi |
|---|---|
| `cur10ClassCreationGate` | 10.2, 10.4, 10.5: fail-closed, quyền, giá, hợp đồng kiểm ở approve. 10.3: alias cấp độ tạo được DRAFT |
| `phase2ReplSet` | Tạo nháp được; thêm bước approve bị chặn vì giá; gọi `assertPricingPolicyGate` thay hàm đã xóa |
| `cur11ScheduleCollisionReplSet` | Thiếu policy hoặc hợp đồng kiểm ở approve |
| `platform` | Tạo nháp không cần hợp đồng; ngày khai giảng dời sang ngày mai; đếm đúng audit gửi duyệt |

## Chạy lại an toàn

**Không chạy `npm test` trần trong `BackEnd`**: 14 suite kết nối và ghi vào DB trong `.env` (B-3 trong 08). Lệnh sau chỉ dùng DB in-memory (Git Bash):

```bash
cd BackEnd
MONGODB_URI=mongodb://127.0.0.1:1/disabled MONGO_URI=mongodb://127.0.0.1:1/disabled \
  npx jest tests/teacherClassFlow02.test.js tests/cur10ClassCreationGate.test.js \
  tests/phase2ReplSet.test.js tests/cur11ScheduleCollisionReplSet.test.js tests/platform.test.js
```

## Sự cố trong lúc kiểm thử

Lần baseline đầu đã chạy toàn bộ Jest trước khi kiểm tra xong `.env`, nên 14 suite trên thử kết nối Atlas. Cả 96 test của chúng dừng ở `querySrv ECONNREFUSED`, không kết nối nào thành công, nên không có dữ liệu nào bị đọc hay ghi. Mọi lần chạy sau đều cô lập.
