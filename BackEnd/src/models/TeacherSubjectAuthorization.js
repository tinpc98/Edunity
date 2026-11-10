const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_LEVELS, COURSE_LEVELS, TEACHER_SUBJECT_AUTH_STATUSES } = require("./constants");
const { reviewablePlugin } = require("./plugins");

const decisionHistoryEntrySchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      enum: ["REQUESTED", "CREATED_APPROVED", "APPROVED", "SUSPENDED"],
      required: true,
    },
    previousStatus: {
      type: String,
      enum: [...TEACHER_SUBJECT_AUTH_STATUSES, null],
      default: null,
    },
    newStatus: {
      type: String,
      enum: TEACHER_SUBJECT_AUTH_STATUSES,
      required: true,
    },
    reason: { type: String, trim: true, default: null },
    decidedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * TEA-07: Teacher Subject Authorization
 * Phân quyền giảng dạy theo (Teacher, Subject, GradeLevel, Level) với vòng đời PENDING / APPROVED / SUSPENDED.
 * Độc lập hoàn toàn với User.teacherProfile.verificationStatus (KYC) và TEA-12 (hợp đồng giảng viên).
 */
const teacherSubjectAuthorizationSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    gradeLevel: { type: String, enum: GRADE_LEVELS, default: null },
    level: { type: String, enum: COURSE_LEVELS, required: true },

    status: {
      type: String,
      enum: TEACHER_SUBJECT_AUTH_STATUSES,
      default: "PENDING",
      required: true,
    },

    requestNote: { type: String, trim: true, default: null },
    requestedAt: { type: Date, default: Date.now },

    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    suspendedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, trim: true, default: null },

    decisionHistory: { type: [decisionHistoryEntrySchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

teacherSubjectAuthorizationSchema.plugin(reviewablePlugin); // reviewedBy / reviewedAt / reviewNote

// Unique index on exact tuple; omits sparse so gradeLevel: null is also strictly unique per (teacher, subject, level).
teacherSubjectAuthorizationSchema.index(
  { teacherId: 1, subjectId: 1, gradeLevel: 1, level: 1 },
  { unique: true }
);
teacherSubjectAuthorizationSchema.index({ teacherId: 1, status: 1, createdAt: -1 });
teacherSubjectAuthorizationSchema.index({ status: 1, createdAt: -1 });
teacherSubjectAuthorizationSchema.index({ subjectId: 1, gradeLevel: 1, level: 1, status: 1 });

module.exports = mongoose.model("TeacherSubjectAuthorization", teacherSubjectAuthorizationSchema);

