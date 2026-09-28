const mongoose = require("mongoose");
const { Schema } = mongoose;

// Một document có thể gồm nhiều file (CCCD cần cả mặt trước/sau; Qualification có thể nhiều trang).
// Dùng chung một mảng `files` thay vì một storageKey duy nhất để tối ưu cho mọi documentType.
const documentFileSchema = new Schema(
  {
    side: { type: String, enum: ["FRONT", "BACK", "SINGLE"], required: true },
    storageKey: { type: String, required: true }, // private object storage key — never a public URL
    mimeType: String,
  },
  { _id: false }
);

const verificationDocumentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: "ScholarshipApplication", default: null },

    documentType: { type: String, enum: ["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF"], required: true },
    // IDENTITY (CCCD) => 2 phần tử (FRONT + BACK); các loại khác thường chỉ có 1 phần tử (SINGLE).
    files: {
      type: [documentFileSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "files must contain at least one item",
      },
    },

    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // Admin
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },

    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

verificationDocumentSchema.index({ userId: 1, documentType: 1 });
verificationDocumentSchema.index({ applicationId: 1 });
verificationDocumentSchema.index({ status: 1 });

module.exports = mongoose.model("VerificationDocument", verificationDocumentSchema);
