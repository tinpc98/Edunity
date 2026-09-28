const mongoose = require("mongoose");
const { Schema } = mongoose;

// Cho phép logout từng thiết bị và Admin force-logout ngay khi suspend/ban tài khoản
// (JWT access token không tự thu hồi được, nhưng luồng refresh sẽ bị chặn nếu record ở đây revoked/hết hạn).
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true }, // không lưu token thô

    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenId: { type: Schema.Types.ObjectId, ref: "RefreshToken", default: null }, // token rotation

    userAgent: String,
    ip: String,
  },
  { timestamps: true }
);

refreshTokenSchema.index({ userId: 1, revokedAt: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL: tự xoá sau khi hết hạn

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
