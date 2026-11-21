# EDUNITY V3 — TEACHER PAYOUT AUDIT
## Document 05: Teacher Status Integration & Metric Calculation

### 1. Đồng bộ nhãn trạng thái thân thiện với Giảng viên (Teacher UI)

Trong phiên bản trước, giao diện Giảng viên sử dụng nhãn chung của hệ thống kế toán (`APPROVED` hiển thị thành "Đã phê duyệt"), gây hiểu nhầm cho giảng viên rằng tiền đã được giải ngân nhưng tài khoản ngân hàng chưa nhận được.

Hệ thống đã chuẩn hóa bảng ánh xạ nhãn trạng thái riêng cho Giảng viên trong `FrontEnd/src/types/payment.ts` và áp dụng tại `FrontEnd/src/features/teacher/revenue/TeacherPayoutSection.tsx`:

```typescript
export const TEACHER_PAYOUT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ Admin duyệt",
  APPROVED: "Chờ nhận tiền",
  SCHEDULED: "Chờ nhận tiền",
  PENDING_BANK_TRANSFER: "Chờ nhận tiền",
  PROCESSING: "Chờ nhận tiền",
  COMPLETED: "Đã nhận tiền",
  REJECTED: "Bị từ chối",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
};
```

#### Trải nghiệm người dùng được cải thiện:
- Khi yêu cầu mới tạo: Giảng viên thấy nhãn **"Chờ Admin duyệt"**.
- Khi Admin bấm phê duyệt: Trạng thái hiển thị chuyển ngay thành **"Chờ nhận tiền"** (màu xanh dương nhạt / badge nổi bật). Giảng viên an tâm rằng yêu cầu đã được chấp thuận và bộ phận tài chính đang thực hiện chuyển khoản.
- Khi ngân hàng báo chuyển tiền thành công: Trạng thái chuyển thành **"Đã nhận tiền"** (màu xanh lá cây).

---

### 2. Tinh chỉnh thuật toán tổng hợp thù lao trong `settlementService.js`

Trong hàm `getTeacherSettlementSummary(teacherId)` tại `BackEnd/src/services/settlementService.js`, số tiền đang trong tiến trình rút tiền (`inWithdrawalRequest`) được tối ưu hóa:

```javascript
// Tính tổng các khoản rút tiền đang xử lý (In-flight Payouts)
const activePayouts = await Payout.find({
  teacherId: new mongoose.Types.ObjectId(teacherId),
  status: { $in: ["PENDING", "PROCESSING", "APPROVED", "SCHEDULED", "PENDING_BANK_TRANSFER"] }
});

const activePayoutTotal = activePayouts.reduce((sum, p) => sum + (p.amount || 0), 0);

// Đảm bảo số liệu hiển thị trên Card Giảng viên luôn phản ánh đúng các lệnh rút tiền đang lưu chuyển
const inWithdrawalRequest = Math.max(earningsInPayoutSum, activePayoutTotal);
```

#### Hiệu quả đạt được:
- Ngay khi Payout 250.000đ được phê duyệt, chỉ số "Đang chờ giải ngân / Đang rút" trên Dashboard Giảng viên lập tức phản ánh con số 250.000đ.
- Giảng viên thấy rõ cả con số tổng quan và dòng chi tiết "Chờ nhận tiền" trong bảng lịch sử.
