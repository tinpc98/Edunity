const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin } = require("./plugins");
const { SUPPORTED_GRADE_LEVELS, TEACHER_DEGREES } = require("./constants");

const studentProfileSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    dateOfBirth: Date,
    avatarUrl: String,
    bio: String,
  },
  { _id: false },
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
  { _id: false },
);

// BAO-09: the one account payouts go to. Number stored encrypted; every change is re-reviewed and locks payouts for a while.
const teacherBankAccountSchema = new Schema(
  {
    bankName: { type: String, required: true, trim: true },
    accountNumberEnc: { type: String, required: true },
    accountNumberLast4: { type: String, required: true },
    accountHolderName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["PENDING_REVIEW", "VERIFIED", "REJECTED"],
      required: true,
    },
    submittedAt: { type: Date, required: true },
    payoutLockedUntil: { type: Date, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },
  },
  { _id: false },
);

// Registration step 2: what the teacher teaches and their background, read by the Admin reviewing the dossier
const teachingProfileSchema = new Schema(
  {
    degree: { type: String, enum: TEACHER_DEGREES, required: true },
    major: { type: String, trim: true, default: null },
    school: { type: String, trim: true, default: null },
    certificates: {
      type: [
        new Schema(
          {
            name: { type: String, required: true, trim: true },
            year: { type: Number, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    achievements: { type: String, default: null },
    subjects: { type: [String], default: [] },
    gradeLevels: {
      type: [{ type: String, enum: SUPPORTED_GRADE_LEVELS }],
      default: [],
    },
    studentNote: { type: String, default: null },
    yearsOfExperience: { type: Number, min: 0, max: 60, required: true },
  },
  { _id: false },
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
    // BAO-10: a verification lasts 6 months. Past this date the teacher keeps teaching existing classes
    // but cannot open new ones until a re-verification is approved (status stays VERIFIED meanwhile).
    verifiedUntil: { type: Date, default: null },
    reverificationStatus: {
      type: String,
      enum: ["PENDING", "REJECTED", null],
      default: null,
    },
    bankAccount: { type: teacherBankAccountSchema, default: undefined },

    qualificationSummary: String,
    teachingProfile: { type: teachingProfileSchema, default: undefined },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const sponsorProfileSchema = new Schema(
  {
    sponsorType: {
      type: String,
      enum: ["INDIVIDUAL", "ORGANIZATION"],
      required: true,
    },
    organizationName: String,
    representativeName: String,
    avatarUrl: String,
    description: String,
  },
  { _id: false },
);

const adminProfileSchema = new Schema(
  {
    permissions: { type: [String], default: [] },
    isSuperAdmin: { type: Boolean, default: false },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    tokenVersion: { type: Number, default: 0 }, // bumped to invalidate every access token already issued
    passwordResetHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER", "SPONSOR", "ADMIN", "VERIFIER"],
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "PENDING", "SUSPENDED", "BANNED"],
      default: "ACTIVE",
    },
    statusReason: { type: String, default: null },
    statusChangedAt: { type: Date, default: null },
    statusChangedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    studentProfile: studentProfileSchema,
    teacherProfile: teacherProfileSchema,
    sponsorProfile: sponsorProfileSchema,
    adminProfile: adminProfileSchema,
  },
  { timestamps: true },
);

userSchema.plugin(softDeletePlugin); // Admin gỡ tài khoản gian lận nhưng vẫn giữ lịch sử Enrollment/Review liên quan

userSchema.index({ role: 1, status: 1 });
userSchema.index({ passwordResetHash: 1 }, { sparse: true });
userSchema.index({ status: 1, statusChangedAt: -1 });
userSchema.index({ "teacherProfile.verificationStatus": 1 });
userSchema.index({
  "teacherProfile.verificationStatus": 1,
  "teacherProfile.verifiedUntil": 1,
});
userSchema.index({ "teacherProfile.bankAccount.status": 1 });
// One CCCD, one teacher account
userSchema.index(
  { "teacherProfile.identity.idNumberHash": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "teacherProfile.identity.idNumberHash": { $type: "string" },
    },
    name: "unique_teacher_id_number",
  },
);

module.exports = mongoose.model("User", userSchema);
