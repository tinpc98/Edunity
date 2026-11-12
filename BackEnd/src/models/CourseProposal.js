const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_LEVELS, COURSE_LEVELS } = require("./constants");
const { reviewablePlugin } = require("./plugins");

const proposalUnitDraftSchema = new Schema(
  {
    unitOrder: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    learningObjectives: { type: String, default: "", trim: true },
    durationMinutes: { type: Number, default: null, min: 0 },
    topics: { type: [String], default: [] },
  },
  { _id: false }
);

const proposalRevisionSchema = new Schema(
  {
    revisionNumber: { type: Number, required: true, min: 1 },
    action: {
      type: String,
      enum: ["SUBMITTED", "RESUBMITTED", "NEED_CHANGES", "APPROVED", "REJECTED"],
      required: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, enum: ["TEACHER", "ADMIN"], required: true },
    note: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const courseProposalSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // = createdBy, không cần field riêng
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },

    title: { type: String, required: true, trim: true },
    description: String,
    learningObjectives: String,
    syllabus: String,
    syllabusDraft: {
      summary: { type: String, default: "", trim: true },
      units: { type: [proposalUnitDraftSchema], default: [] },
    },
    pricingExpectation: {
      suggestedClassType: { type: String, enum: ["FREE", "PAID"], default: null },
      suggestedMinPrice: { type: Number, min: 0, default: null },
      suggestedMaxPrice: { type: Number, min: 0, default: null },
      estimatedSessions: { type: Number, min: 1, default: null },
      notes: { type: String, default: "", trim: true },
    },
    level: { type: String, enum: COURSE_LEVELS },
    gradeLevel: { type: String, enum: GRADE_LEVELS, default: null }, // BR-44: chọn từ select box, không nhập tự do
    prerequisites: String,
    estimatedDuration: String,
    curriculumReference: { type: String, trim: true, default: null },

    status: {
      type: String,
      enum: ["PENDING_REVIEW", "NEED_CHANGES", "APPROVED", "REJECTED"],
      default: "PENDING_REVIEW",
    },
    submittedAt: { type: Date, default: Date.now },
    revisionNumber: { type: Number, default: 1, min: 1 },
    revisionHistory: { type: [proposalRevisionSchema], default: [] },
    approvedCourseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
  },
  { timestamps: true }
);

courseProposalSchema.plugin(reviewablePlugin); // reviewedBy / reviewedAt / reviewNote

courseProposalSchema.index({ status: 1, createdAt: 1 });
courseProposalSchema.index({ teacherId: 1 });

module.exports = mongoose.model("CourseProposal", courseProposalSchema);
