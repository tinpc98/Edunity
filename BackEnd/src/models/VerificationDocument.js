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
    checklistItemCode: { type: String, trim: true, uppercase: true, default: null },
    title: { type: String, trim: true, default: null },
    submissionSource: { type: String, enum: ["ONLINE_UPLOAD", "PAPER_SCAN"], default: "ONLINE_UPLOAD" },
    paperReceiptId: { type: Schema.Types.ObjectId, ref: "PaperDossierReceipt", default: null },

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

    // BAO-03: OCR of the CCCD front, compared with the declared identity. Admin-only review aid.
    // Never stores the number read: only whether it matched, and its last 4 digits.
    ocr: {
      type: new Schema(
        {
          status: { type: String, enum: ["MATCHED", "MISMATCHED", "UNAVAILABLE"], required: true },
          provider: { type: String, default: null },
          mismatches: { type: [String], default: [] }, // fullName, idNumber, dateOfBirth, expiryDate, cardExpired
          readFullName: { type: String, default: null },
          readIdNumberLast4: { type: String, default: null },
          note: { type: String, default: null },
          checkedAt: { type: Date, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },

    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    rejectionReason: { type: String, default: null, maxlength: 1000 }, // why THIS document was refused (BAO-05)
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // Admin
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },

    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

verificationDocumentSchema.index({ userId: 1, documentType: 1 });
verificationDocumentSchema.index({ applicationId: 1 });
verificationDocumentSchema.index({ applicationId: 1, checklistItemCode: 1 });
verificationDocumentSchema.index({ status: 1 });

module.exports = mongoose.model("VerificationDocument", verificationDocumentSchema);
