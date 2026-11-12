const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_LEVELS, COURSE_LEVELS } = require("./constants");
const { softDeletePlugin, adminManagedPlugin } = require("./plugins");

const courseSchema = new Schema(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    subjectName: { type: String, required: true }, // denormalized
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    categoryName: { type: String, required: true }, // denormalized

    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    learningObjectives: String,
    syllabus: String,
    publishedSyllabusVersionId: { type: Schema.Types.ObjectId, ref: "SyllabusVersion", default: null },
    level: { type: String, enum: COURSE_LEVELS }, // BR-42: khác gradeLevel
    gradeLevel: { type: String, enum: GRADE_LEVELS, default: null }, // BR-43, nullable
    curriculumReference: { type: String, trim: true, default: null }, // Sách/chương trình tham chiếu (ví dụ: "Cánh Diều", "Kết Nối Tri Thức", "Cambridge")
    prerequisites: String,
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },

    sourceProposalId: { type: Schema.Types.ObjectId, ref: "CourseProposal", default: null }, // nếu tạo từ Course Proposal đã duyệt
  },
  { timestamps: true }
);

courseSchema.plugin(adminManagedPlugin);
courseSchema.plugin(softDeletePlugin);

courseSchema.index({ subjectId: 1 });
courseSchema.index({ categoryId: 1, gradeLevel: 1, status: 1 }); // FR-STU-29
courseSchema.index({ curriculumReference: 1 });
courseSchema.index({ title: "text", description: "text" }); // FR-STU-06

module.exports = mongoose.model("Course", courseSchema);
