# TÀI LIỆU BACKEND FINANCE ANALYTICS API — V2
**Task ID:** EDUNITY-ADMIN-FINANCE-OVERVIEW-V2  
**Hệ thống:** EDUNITY V3 — Phân hệ Kế toán & Đối soát  
**Tác giả:** Tín — Senior Financial Systems Architect  

---

## 1. Mục tiêu và Thiết kế Kiến trúc
Endpoint `GET /api/admin/overview` (cùng các alias `/api/finance/admin/overview`, `/api/admin/finance/overview`) được mở rộng với tính năng **read-only analytics**, hỗ trợ bộ lọc thời gian tương tác thực tế với múi giờ Việt Nam (`Asia/Ho_Chi_Minh` — UTC+7).

### Nguyên tắc Bất biến Tài chính:
- **Chỉ đọc (Read-only):** Không thực hiện bất kỳ mutation nào lên `Transaction`, `Payment`, `PaymentReconciliation`, `RefundCase` hay `TeacherEarning`.
- **Chống tính trùng (Anti-Double Counting):** Số liệu doanh thu học phí chỉ tính từ sổ cái append-only `Transaction` (`transactionType === "ENROLLMENT_PAYMENT"`, `status === "COMPLETED"`). Không cộng dồn với bảng `Payment`.
- **Tách biệt dòng tiền:** Nguồn quỹ tài trợ học bổng (`SPONSOR_CONTRIBUTION`) được hạch toán độc lập, không gộp chung vào doanh thu học phí.
- **Ranh giới thời gian nửa mở `[fromUtc, toUtc)`:** Tránh bỏ sót hoặc trùng lặp dữ liệu tại ranh giới giao giữa các ngày.

---

## 2. Chi tiết Tham số Truy vấn (Query Parameters)
| Tham số | Kiểu dữ liệu | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `period` | `string` | `"7d"` | Các lựa chọn: `today`, `yesterday`, `3d`, `7d`, `30d`, `custom`. |
| `from` | `string` (YYYY-MM-DD) | `undefined` | Ngày bắt đầu khi chọn `period = custom`. |
| `to` | `string` (YYYY-MM-DD) | `undefined` | Ngày kết thúc khi chọn `period = custom`. |

---

## 3. Cấu trúc Dữ liệu Phản hồi (API Response Schema)

```typescript
{
  success: true,
  data: {
    // 1. Metadata kỳ lọc
    period: {
      key: "7d",
      from: "2026-11-13T17:00:00.000Z", // 00:00:00 ICT 14/11/2026
      to: "2026-11-20T17:00:00.000Z",   // 24:00:00 ICT 20/11/2026
      label: "7 ngày qua (14/11 - 20/11/2026)",
      granularity: "day" | "hour" | "month"
    },

    // 2. 6 Thẻ KPI tài chính theo kỳ & thời điểm thực
    kpis: {
      tuitionRevenue: {
        title: "Doanh thu Học phí",
        value: "3000",
        previousValue: "0",
        deltaPercent: null,
        hasComparison: false,
        trendDirection: "up",
        trendLabel: "Không có dữ liệu kỳ trước",
        subtext: "Khoản thu học phí hợp lệ trong kỳ",
        variant: "teal"
      },
      donationRevenue: {
        title: "Quỹ Tài trợ Học bổng",
        value: "0",
        previousValue: "6000000",
        deltaPercent: -100,
        hasComparison: true,
        trendDirection: "down",
        trendLabel: "-100% so với kỳ trước",
        subtext: "Nguồn quỹ học bổng độc lập",
        variant: "mint"
      },
      reconciliationPending: {
        title: "Khoản cần Đối soát",
        value: "6000",
        count: 2,
        isSnapshot: true,
        subtext: "Hiện có 2 sự vụ cần kiểm tra",
        variant: "amber"
      },
      refundLiability: {
        title: "Nghĩa vụ Hoàn tiền",
        value: "3000",
        completedValue: "0",
        openCasesCount: 1,
        isSnapshot: true,
        subtext: "Đang có 1 hồ sơ chờ xử lý",
        variant: "rose"
      },
      teacherPendingPayout: {
        title: "Thù lao GV chờ chi trả",
        value: "148200000",
        pendingHold: "148200000",
        availableToWithdraw: "0",
        isSnapshot: true,
        subtext: "Khả dụng: 0 ₫",
        variant: "indigo"
      },
      teacherPaidOut: {
        title: "Đã chi trả Giáo viên",
        value: "0",
        previousValue: "0",
        deltaPercent: null,
        hasComparison: false,
        trendDirection: "neutral",
        trendLabel: "Không có dữ liệu kỳ trước",
        subtext: "Giải ngân thành công trong kỳ",
        variant: "emerald"
      }
    },

    // 3. Dữ liệu các biểu đồ tương tác
    charts: {
      // Biểu đồ 1 & 2: Chuỗi thời gian theo giờ/ngày/tháng
      revenueTimeSeries: [
        {
          key: "2026-11-14",
          label: "14/11",
          tuition: 0,
          donation: 0,
          total: 0
        },
        ...
        {
          key: "2026-11-20",
          label: "20/11",
          tuition: 3000,
          donation: 0,
          total: 3000
        }
      ],

      // Biểu đồ 3: Cơ cấu nguồn tiền (Donut)
      fundStructure: {
        tuition: 3000,
        donation: 0,
        other: 3000,
        total: 6000,
        tuitionPercent: 50,
        donationPercent: 0,
        otherPercent: 50
      },

      // Biểu đồ 4: Phân bố tình trạng đối soát
      reconciliationDistribution: [
        { key: "needsReview", status: "NEEDS_REVIEW", label: "Cần kiểm tra", count: 2, amount: 6000, percent: 66.7, color: "#DC2626" },
        { key: "inReview", status: "IN_REVIEW", label: "Đang kiểm tra", count: 0, amount: 0, percent: 0, color: "#D97706" },
        { key: "resolvedApproved", status: "RESOLVED_APPROVED", label: "Đã đối soát", count: 1, amount: 3000, percent: 33.3, color: "#15803D" },
        { key: "resolvedRefunded", status: "RESOLVED_REFUNDED", label: "Đã hoàn tiền", count: 0, amount: 0, percent: 0, color: "#7C3AED" },
        { key: "resolvedIgnored", status: "RESOLVED_IGNORED", label: "Đã đóng", count: 0, amount: 0, percent: 0, color: "#64748B" }
      ]
    },

    // 4. Bảng giao dịch gần đây (5-10 giao dịch mới nhất)
    recentTransactions: [
      {
        id: "6aff...",
        code: "100000009",
        type: "Thu học phí",
        rawType: "ENROLLMENT_PAYMENT",
        amount: 3000,
        formattedAmount: "+ 3.000 ₫",
        isDebit: false,
        isCredit: true,
        createdAt: "2026-11-20T07:03:53.331Z",
        formattedDate: "20/11/2026 14:03",
        status: "Hoàn tất",
        statusType: "success",
        actorName: "Lê Minh Tuấn"
      },
      ...
    ],

    // 5. Tổng quan vận hành tài chính (100% tiếng Việt)
    operationsSummary: {
      syncStatus: "Đang hoạt động" | "Đang chờ tác vụ" | "Cần kiểm tra",
      syncStatusType: "success" | "neutral" | "error",
      isRunning: false,
      processedCount: 0,
      pendingCount: 0,
      attentionCount: 0,
      refundCasesOpen: 1
    },

    // 6. Các trường tương thích ngược (Backward-compatible fields)
    revenue: { ... },
    teacherEarnings: { ... },
    reconciliations: { ... },
    bankEvents: { ... },
    outboxWorker: { ... }
  }
}
```
