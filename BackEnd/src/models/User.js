const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin } = require("./plugins");

const studentProfileSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    dateOfBirth: Date,
    avatarUrl: String,
    bio: String,
  },
  { _id: false }
);

// BAO-02/04: declared identity (as on the CCCD). Number and address are stored encrypted only (utils/pii).
const teacherIdentitySchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    idNumberEnc: { type: String, required: true },
    idNumberHash: { type: String, required: true }, // blind index: uniqueness without decrypting
    idNumberLast4: { type: String, required: true },
    addressEnc: { type: String, required: true },
    issueDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null }, // null = no expiry printed on the card
    submittedAt: { type: Date, required: true },
  },
  { _id: false }
);

const teacherProfileSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    avatarUrl: String,
    biography: String,
    verificationStatus: {
      type: String,
      enum: ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"],
      default: "UNVERIFIED",
    },
    // REVIEWABLE: quyết định của Admin khi verify Teacher (FR-ADM-02, BR-01)
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },

    identity: { type: teacherIdentitySchema, default: undefined },

    qualificationSummary: String,
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const sponsorProfileSchema = new Schema(
  {
    sponsorType: { type: String, enum: ["INDIVIDUAL", "ORGANIZATION"], required: true },
    organizationName: String,
    representativeName: String,
    avatarUrl: String,
    description: String,
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    tokenVersion: { type: Number, default: 0 }, // bumped to invalidate every access token already issued
    role: { type: String, enum: ["STUDENT", "TEACHER", "SPONSOR", "ADMIN"], required: true },
    status: { type: String, enum: ["ACTIVE", "PENDING", "SUSPENDED", "BANNED"], default: "ACTIVE" },

    studentProfile: studentProfileSchema,
    teacherProfile: teacherProfileSchema,
    sponsorProfile: sponsorProfileSchema,
  },
  { timestamps: true }
);

userSchema.plugin(softDeletePlugin); // Admin gỡ tài khoản gian lận nhưng vẫn giữ lịch sử Enrollment/Review liên quan

userSchema.index({ role: 1, status: 1 });
userSchema.index({ "teacherProfile.verificationStatus": 1 });
// One CCCD, one teacher account
userSchema.index(
  { "teacherProfile.identity.idNumberHash": 1 },
  { unique: true, partialFilterExpression: { "teacherProfile.identity.idNumberHash": { $type: "string" } }, name: "unique_teacher_id_number" }
);

module.exports = mongoose.model("User", userSchema);
