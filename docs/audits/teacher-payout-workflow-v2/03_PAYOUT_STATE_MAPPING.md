# EDUNITY V3 — TEACHER PAYOUT AUDIT
## Document 03: Payout State Machine & State Mapping

### 1. Ma trận đối soát trạng thái (State Mapping Matrix)

Hệ thống phân định rạch ròi giữa góc nhìn của **Quản trị viên (Admin)** và **Giảng viên (Teacher)** để tối ưu hóa trải nghiệm người dùng và tính minh bạch tài chính:

| Backend Database Status | Phân loại Tab Admin | Nhãn Admin (ADMIN_PAYOUT_STATUS_LABELS) | Nhãn Giảng viên (TEACHER_PAYOUT_STATUS_LABELS) | Ý nghĩa nghiệp vụ |
| :--- | :--- | :--- | :--- | :--- |
| `PENDING` | **Chờ phê duyệt** | Chờ duyệt | Chờ Admin duyệt | Giảng viên đã gửi yêu cầu, Admin đang thẩm định điều kiện số dư & tài khoản |
| `APPROVED` | **Chờ chuyển tiền** | Chờ chuyển tiền | **Chờ nhận tiền** | Admin đã phê duyệt yêu cầu, chờ chuyển khoản qua ngân hàng |
| `SCHEDULED` | **Chờ chuyển tiền** | Đã lên lịch | **Chờ nhận tiền** | Đã lên lịch lệnh chi tự động theo chu kỳ |
| `PENDING_BANK_TRANSFER` | **Chờ chuyển tiền** | Chờ chuyển khoản | **Chờ nhận tiền** | Lệnh chi đang chờ cổng ngân hàng/kế toán thực hiện |
| `PROCESSING` | **Chờ chuyển tiền** | Đang chuyển tiền | **Chờ nhận tiền** | Đang trong tiến trình giao dịch chuyển tiền liên ngân hàng |
| `COMPLETED` | **Đã chi trả** | Đã chi trả | Đã nhận tiền | Tiền đã chuyển thành công vào tài khoản ngân hàng của Giảng viên |
| `REJECTED` | **Không thành công / Từ chối** | Đã từ chối | Bị từ chối | Yêu cầu bị Admin từ chối phê duyệt (thông tin sai, chưa đủ điều kiện) |
| `FAILED` | **Không thành công / Từ chối** | Chuyển tiền thất bại | Thất bại | Lệnh chi ngân hàng bị lỗi (sai số tài khoản, ngân hàng bảo trì...) |
| `CANCELLED` | **Không thành công / Từ chối** | Đã hủy | Đã hủy | Yêu cầu bị hủy theo quy định |

---

### 2. Quy tắc chuyển trạng thái hợp lệ (Permitted State Transitions)

```
                    ┌───────────────────────────┐
                    │          PENDING          │ (Giảng viên yêu cầu rút)
                    └─────────────┬─────────────┘
                                  │
                 ┌────────────────┴────────────────┐
       (Admin Từ chối)                     (Admin Phê duyệt)
                 │                                 │
                 ▼                                 ▼
    ┌───────────────────────────┐     ┌───────────────────────────┐
    │         REJECTED          │     │         APPROVED          │ (Chờ chuyển tiền)
    └───────────────────────────┘     └─────────────┬─────────────┘
                                                    │
                                      ┌─────────────┴─────────────┐
                                      ▼                           ▼
                        ┌───────────────────────────┐   ┌───────────────────────────┐
                        │   PROCESSING / SCHEDULED  │   │  COMPLETED (Thành công)   │
                        └─────────────┬─────────────┘   └───────────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
           ┌───────────────────────────┐ ┌───────────────────────────┐
           │          FAILED           │ │         COMPLETED         │
           └───────────────────────────┘ └───────────────────────────┘
```

#### Quy tắc bảo vệ nghiệp vụ (State Guards):
1. **Từ chối (Reject Guard)**:
   - Chỉ được phép từ chối khi trạng thái đang là `PENDING`.
   - Nếu Payout đã là `APPROVED`, `PROCESSING` hoặc `COMPLETED`, backend ném lỗi `PAYOUT_NOT_REJECTABLE` (HTTP 400).
2. **Chi trả (Complete Guard)**:
   - Chỉ được phép xác nhận chuyển tiền thành công khi trạng thái là `APPROVED`, `PROCESSING`, `SCHEDULED` hoặc `PENDING_BANK_TRANSFER`.
   - Không được phép chuyển tiền trực tiếp từ `PENDING` nếu chưa qua bước phê duyệt.
   - Bắt buộc phải có chứng từ đối soát (`bankTransactionReference`, `proofUrl` hoặc ghi chú kế toán).
3. **Chặn dữ liệu kiểm thử (Financial Safety Guard for Test Data)**:
   - Nếu bản ghi có cờ `isTestData: true`, backend lập tức chặn hoàn tất với mã lỗi `TEST_DATA_PAYOUT_BLOCKED` (HTTP 400).
   - Ngăn chặn triệt để nguy cơ thất thoát tiền hoặc ghi nhận chi khống trên sổ cái kế toán.
