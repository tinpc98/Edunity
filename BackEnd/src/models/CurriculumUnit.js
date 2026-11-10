const mongoose = require("mongoose");
const { Schema } = mongoose;
const { adminManagedPlugin, softDeletePlugin } = require("./plugins");

/**
 * CurriculumUnit (CUR-02)
 * Đơn vị bài học / chuyên đề thuộc một SyllabusVersion cụ thể.
 * Thuộc tính unitOrder là duy nhất trong mỗi SyllabusVersion (đối với bản ghi chưa soft-delete).
 */
const curriculumUnitSchema = new Schema(
  {
    syllabusVersionId: { type: Schema.Types.ObjectId, ref: "SyllabusVersion", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    unitOrder: { type: Number, required: true, min: 1 },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    learningObjectives: { type: String, default: "", trim: true },
    durationMinutes: { type: Number, default: null, min: 0 },
    topics: { type: [String], default: [] },

    migratedFromLegacy: { type: Boolean, default: false },
  },
  { timestamps: true }
);

curriculumUnitSchema.plugin(adminManagedPlugin);
curriculumUnitSchema.plugin(softDeletePlugin);

// Enforce unique ordering within a syllabus version for active units
curriculumUnitSchema.index(
  { syllabusVersionId: 1, unitOrder: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);
curriculumUnitSchema.index({ courseId: 1, syllabusVersionId: 1 });

module.exports = mongoose.model("CurriculumUnit", curriculumUnitSchema);

