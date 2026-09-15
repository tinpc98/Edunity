const mongoose = require("mongoose");
const { Schema } = mongoose;

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
  { timestamps: { createdAt: true, updatedAt: false } }
);

paymentSchema.index({ enrollmentId: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
