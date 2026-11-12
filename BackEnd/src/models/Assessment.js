const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  ASSESSMENT_PURPOSES,
  ASSESSMENT_SCOPES,
  ASSESSMENT_STATUSES,
  ASSESSMENT_GRADING_MODES,
  COURSE_LEVELS,
  GRADE_LEVELS,
} = require("./constants");
const { adminManagedPlugin, softDeletePlugin } = require("./plugins");

const placementBandSchema = new Schema(
  {
    minPercentage: { type: Number, required: true, min: 0, max: 100 },
    maxPercentage: { type: Number, required: true, min: 0, max: 100 },
    recommendedLevel: { type: String, enum: COURSE_LEVELS, required: true },
    summary: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { _id: false }
);

const placementConfigSchema = new Schema(
  {
    bands: { type: [placementBandSchema], default: [] },
    recommendedCourseIds: { type: [{ type: Schema.Types.ObjectId, ref: "Course" }], default: [] },
    autoRecommendCourses: { type: Boolean, default: true },
  },
  { _id: false }
);

/**
 * Assessment (LMS-08 & LMS-01)
 * Bài kiểm tra (QUIZ, PRACTICE, EXAM, PLACEMENT) gắn theo Course, Class, Session hoặc Global Placement.
 */
const assessmentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    instructions: { type: String, default: "", trim: true, maxlength: 4000 },

    purpose: { type: String, enum: ASSESSMENT_PURPOSES, default: "QUIZ" },
    scopeType: { type: String, enum: ASSESSMENT_SCOPES, required: true },

    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    gradeLevel: { type: String, enum: [...GRADE_LEVELS, null], default: null },
    targetCourseLevels: { type: [{ type: String, enum: COURSE_LEVELS }], default: [] },

    status: { type: String, enum: ASSESSMENT_STATUSES, default: "DRAFT" },
    timeLimitMinutes: { type: Number, default: null, min: 1, max: 300 },
    maxAttempts: { type: Number, default: 1, min: 1, max: 20 },
    totalMaxScore: { type: Number, default: 0, min: 0 },
    passingScore: { type: Number, default: null, min: 0 },

    gradingMode: { type: String, enum: ASSESSMENT_GRADING_MODES, default: "AUTO" },
    shuffleQuestions: { type: Boolean, default: false },
    showResultImmediately: { type: Boolean, default: true },

    availableFrom: { type: Date, default: null },
    availableUntil: { type: Date, default: null },

    placementConfig: { type: placementConfigSchema, default: () => ({ bands: [], recommendedCourseIds: [], autoRecommendCourses: true }) },

    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

assessmentSchema.plugin(adminManagedPlugin, { createdByRequired: true });
assessmentSchema.plugin(softDeletePlugin);

assessmentSchema.index({ purpose: 1, scopeType: 1, status: 1 });
assessmentSchema.index({ classId: 1, status: 1 });
assessmentSchema.index({ courseId: 1, status: 1 });
assessmentSchema.index({ subjectId: 1, gradeLevel: 1, purpose: 1, status: 1 });
assessmentSchema.index({ teacherId: 1, status: 1 });

module.exports = mongoose.model("Assessment", assessmentSchema);

