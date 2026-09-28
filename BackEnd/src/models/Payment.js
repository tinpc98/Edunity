const mongoose = require("mongoose");
const { Schema } = mongoose;

// Enrollment 1 — N Payment: một Enrollment có thể có nhiều lần thử thanh toán
// (FAILED rồi retry) trước khi có một Payment COMPLETED. Vì vậy KHÔNG đặt unique
// trên enrollmentId — chỉ gatewayReference là unique để đảm bảo idempotency webhook.
const paymentSchema = new Schema(
  {
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    payerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    gateway: { type: String, required: true },
    gatewayReference: { type: String, required: true, unique: true }, // idempotency key for webhook
    amount: { type: Schema.Types.Decimal128, required: true },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "REFUNDED"],
      default: "PENDING",
    },
    paidAt: Date,
  },
  { timestamps: true }
);

paymentSchema.index({ enrollmentId: 1, createdAt: -1 }); // lịch sử các lần thử thanh toán của 1 Enrollment

module.exports = mongoose.model("Payment", paymentSchema);
