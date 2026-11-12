const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_LEVELS, COURSE_LEVELS, LEARNING_PATH_STATUSES } = require("./constants");
const { adminManagedPlugin, softDeletePlugin } = require("./plugins");

const learningPathStepSchema = new Schema(
  {
    stepOrder: { type: Number, required: true, min: 1 },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    isRequired: { type: Boolean, default: true },
    prerequisiteCourseIds: { type: [Schema.Types.ObjectId], ref: "Course", default: [] },
    notes: { type: String, default: "", trim: true },
  },
  { _id: false }
);

/**
 * LearningPath (CUR-03)
 * Lộ trình học tập có thứ tự gồm các Course kèm điều kiện tiên quyết theo bậc.
 */
const learningPathSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "", trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    gradeLevel: { type: String, enum: GRADE_LEVELS, default: null },
    targetLevel: { type: String, enum: COURSE_LEVELS, default: null },

    steps: { type: [learningPathStepSchema], default: [] },

    status: {
      type: String,
      enum: LEARNING_PATH_STATUSES,
      default: "DRAFT",
    },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

learningPathSchema.plugin(adminManagedPlugin);
learningPathSchema.plugin(softDeletePlugin);

learningPathSchema.index({ status: 1, categoryId: 1, gradeLevel: 1 });
learningPathSchema.index({ "steps.courseId": 1 });

module.exports = mongoose.model("LearningPath", learningPathSchema);

