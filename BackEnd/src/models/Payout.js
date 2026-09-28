const mongoose = require("mongoose");
const { Schema } = mongoose;

// Financial/History entity: không soft-delete, dùng status + timestamp nghiệp vụ.
// Các TeacherEarning được gộp vào một Payout tham chiếu ngược qua TeacherEarning.payoutId
// (xem ghi chú trong TeacherEarning.js) — Payout không giữ mảng earningIds để tránh trùng nguồn sự thật.
const bankAccountSnapshotSchema = new Schema(
  {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountHolderName: { type: String, required: true },
  },
  { _id: false }
);

const payoutSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Schema.Types.Decimal128, required: true },

    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REJECTED"],
      default: "PENDING",
    },
    payoutMethod: { type: String, enum: ["BANK_TRANSFER"], default: "BANK_TRANSFER" },
    bankAccountSnapshot: { type: bankAccountSnapshotSchema, required: true }, // snapshot tại thời điểm yêu cầu, không đọc lại profile

    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    processedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // Admin xử lý thủ công

    failureReason: { type: String, default: null }, // khi status = FAILED
    reviewNote: { type: String, default: null }, // khi Admin reject/ghi chú
  },
  { timestamps: true }
);

payoutSchema.index({ teacherId: 1, status: 1 });
payoutSchema.index({ status: 1, requestedAt: 1 }); // hàng đợi xử lý cho Admin

module.exports = mongoose.model("Payout", payoutSchema);
