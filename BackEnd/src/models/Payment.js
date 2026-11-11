const mongoose = require("mongoose");
const { Schema } = mongoose;

// Unified Payment Intent cho cả 2 mục đích (purpose):
// 1. TUITION — Học sinh đóng học phí (gắn với enrollmentId)
// 2. DONATION — Mạnh Thường Quân chuyển khoản tài trợ (gắn với campaignId, contributionId, sponsorId)
// Một Enrollment hoặc một Sponsor tại một thời điểm chỉ có tối đa 1 intent đang PENDING tương ứng,
// nhưng có thể có nhiều lần thử thanh toán (FAILED rồi retry) trước khi COMPLETED.
const paymentSchema = new Schema(
  {
    purpose: {
      type: String,
      enum: ["TUITION", "DONATION"],
      default: "TUITION",
    },
    channelKey: {
      type: String,
      enum: ["TUITION", "DONATION"],
      default: function defaultChannelKey() {
        return this.purpose === "DONATION" ? "DONATION" : "TUITION";
      },
    },

    // Liên kết cho TUITION (required khi purpose === "TUITION")
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      default: null,
      required: function isTuition() {
        return !this.purpose || this.purpose === "TUITION";
      },
    },

    // Liên kết cho DONATION (required khi purpose === "DONATION")
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "ScholarshipCampaign",
      default: null,
      required: function isDonation() {
        return this.purpose === "DONATION";
      },
    },
    contributionId: {
      type: Schema.Types.ObjectId,
      ref: "SponsorContribution",
      default: null,
    },
    sponsorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    donorDisplayName: {
      type: String,
      default: null,
      trim: true,
    },

    payerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    gateway: { type: String, required: true },
    provider: {
      type: String,
      enum: ["PAYOS", "SANDBOX"],
      default: "PAYOS",
    },
    gatewayReference: { type: String, required: true, unique: true }, // idempotency key for webhook
    orderCode: {
      type: Number,
      validate: {
        validator: (v) => v === null || v === undefined || (Number.isSafeInteger(v) && v > 0),
        message: "orderCode must be a positive safe integer",
      },
    },
    paymentLinkId: { type: String, default: null },
    qrCode: { type: String, default: null },
    checkoutUrl: { type: String, default: null },
    expiredAt: { type: Date, default: null },
    providerStatus: { type: String, default: "PENDING" },
    providerCreatedAt: { type: Date, default: null },
    providerMetadata: { type: Schema.Types.Mixed, default: null },
    currency: { type: String, default: "VND" },

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
paymentSchema.index({ campaignId: 1, sponsorId: 1, createdAt: -1 }); // lịch sử intent tài trợ
paymentSchema.index(
  { orderCode: 1 },
  {
    unique: true,
    partialFilterExpression: { orderCode: { $type: "number" } },
  }
);
paymentSchema.index(
  { enrollmentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      paymentStatus: "PENDING",
      enrollmentId: { $type: "objectId" },
    },
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
