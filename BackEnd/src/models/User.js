const mongoose = require("mongoose");
const { Schema } = mongoose;

const studentProfileSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    dateOfBirth: Date,
    avatarUrl: String,
    bio: String,
  },
  { _id: false }
);

const teacherProfileSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    biography: String,
    verificationStatus: {
      type: String,
      enum: ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"],
      default: "UNVERIFIED",
    },
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
    description: String,
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["STUDENT", "TEACHER", "SPONSOR", "ADMIN"], required: true },
    status: { type: String, enum: ["ACTIVE", "PENDING", "SUSPENDED", "BANNED"], default: "ACTIVE" },

    studentProfile: studentProfileSchema,
    teacherProfile: teacherProfileSchema,
    sponsorProfile: sponsorProfileSchema,
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ "teacherProfile.verificationStatus": 1 });

module.exports = mongoose.model("User", userSchema);
