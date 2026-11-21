# EDUNITY V3 — ADMIN REFUND AUDIT
## Document 01: Root Cause Analysis — 0 VNĐ Eligible Amount Issue

### 1. Hiện tượng báo cáo
Trên giao diện quản lý hoàn tiền Admin (`/admin/refunds`):
- Hồ sơ hoàn tiền trùng học phí lớp: **TEST PAYOS 3K - Toán 12 THPT**
- Đơn thanh toán gốc: **100000008** (Mã hồ sơ: `REF-20261120-F7304D`)
- Khoản chuyển dư theo lịch sử: **3.000 VNĐ**
- Hiện tượng lỗi: Bảng danh sách hoàn tiền hiển thị: **"Số tiền đủ điều kiện: 0đ"**

---

### 2. Dữ liệu thực tế trong MongoDB
Truy vấn trực tiếp cơ sở dữ liệu MongoDB:
```javascript
db.refundcases.findOne({ caseNumber: "REF-20261120-F7304D" });
```

Kết quả:
```json
{
  "_id": "6afff0d91c819e11be06a8fb",
  "caseNumber": "REF-20261120-F7304D",
  "purpose": "TUITION",
  "sourcePaymentId": "6affb173c018a7f472908143",
  "beneficiaryBankAccount": {
    "bankName": "MBBank",
    "accountNumber": "76828051998",
    "accountHolderName": "PHAM CONG TIN"
  },
  "originalAmount": { "$numberDecimal": "3000" },
  "eligibleAmount": { "$numberDecimal": "3000" },
  "approvedAmount": null,
  "currency": "VND",
  "reason": "OVERPAYMENT",
  "status": "NEEDS_REVIEW"
}
```

**Kết luận về mặt dữ liệu:**
1. Trong MongoDB, số tiền đủ điều kiện `eligibleAmount` **ĐÃ LÀ 3.000 VNĐ** ngay từ lúc khởi tạo.
2. Hồ sơ hoàn tiền không hề bị chặn về mặt nghiệp vụ hay có số dư bằng 0.

---

### 3. Nguyên nhân gốc rễ (Root Cause)

Lỗi bắt nguồn từ chuỗi tuần tự hóa (serialization) giữa MongoDB `Decimal128`, Backend API và hàm định dạng tiền tệ phía Frontend:

1. **Backend Serialization (`.lean()` query):**
   - File model `BackEnd/src/models/RefundCase.js` định nghĩa các trường `originalAmount`, `eligibleAmount`, `approvedAmount` dưới dạng `Schema.Types.Decimal128`.
   - Hàm `listRefundCases` và `getRefundCaseById` trong `refundService.js` sử dụng `.lean()` để tối ưu hiệu năng.
   - Khi truy vấn qua `.lean()`, các trường `Decimal128` giữ nguyên đối tượng BSON `Decimal128`. Khi Express chuyển thành JSON (`res.json()`), đối tượng này được serialize thành:
     ```json
     { "eligibleAmount": { "$numberDecimal": "3000" } }
     ```

2. **Frontend `formatVND` Failure:**
   - Hàm `formatVND` trong `FrontEnd/src/types/payment.ts` trước đây được định nghĩa như sau:
     ```typescript
     export const formatVND = (amount: number | string | undefined | null): string => {
       const num = typeof amount === "number" ? amount : parseFloat(String(amount || 0));
       return `${(isNaN(num) ? 0 : num).toLocaleString("vi-VN")} đ`;
     };
     ```
   - Khi nhận đối tượng `{ "$numberDecimal": "3000" }`:
     - `String({ "$numberDecimal": "3000" })` trở thành chuỗi `"[object Object]"`.
     - `parseFloat("[object Object]")` trả về `NaN`.
     - Điều kiện `isNaN(num)` trở thành `true`, khiến hàm fallback về `0`.
     - Kết quả in ra giao diện: **"0 đ"**!

---

### 4. Giải pháp khắc phục triệt để (Two-Layer Defense)

1. **Tại Backend (`refundService.js` & `RefundCase.js`):**
   - Thêm hàm `serializeRefundCase(doc)` chuẩn hóa mọi trường `originalAmount`, `eligibleAmount`, `approvedAmount` thành kiểu `Number` thuần túy bằng hàm `toNum` trước khi trả về qua API.
   - Cấu hình `toJSON` transform trong Mongoose schema `RefundCase.js`.
2. **Tại Frontend (`payment.ts`):**
   - Nâng cấp hàm bóc tách dữ liệu số `parseAmountValue(val)` để nhận diện và trích xuất an toàn cả `val.$numberDecimal`, `number`, chuỗi số hoặc fallback có kiểm soát.
