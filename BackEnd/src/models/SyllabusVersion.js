const mongoose = require("mongoose");
const { Schema } = mongoose;
const { SYLLABUS_VERSION_STATUSES } = require("./constants");
const { adminManagedPlugin, softDeletePlugin } = require("./plugins");
const { AppError } = require("../utils/errors");

/**
 * SyllabusVersion (CUR-02)
 * Quản lý phiên bản giáo trình của một Course với vòng đời DRAFT -> PUBLISHED -> ARCHIVED.
 * Các bản ghi đã PUBLISHED hoặc ARCHIVED bị bất biến nội dung nhằm bảo toàn lịch sử học thuật.
 */
const syllabusVersionSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    versionNumber: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: SYLLABUS_VERSION_STATUSES,
      default: "DRAFT",
    },

    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    clonedFromVersionId: { type: Schema.Types.ObjectId, ref: "SyllabusVersion", default: null },
    migratedFromLegacy: { type: Boolean, default: false },
  },
  { timestamps: true }
);

syllabusVersionSchema.plugin(adminManagedPlugin);
syllabusVersionSchema.plugin(softDeletePlugin);

// Monotonic unique version numbers per Course
syllabusVersionSchema.index({ courseId: 1, versionNumber: 1 }, { unique: true });
// At most one active PUBLISHED version per Course
syllabusVersionSchema.index(
  { courseId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PUBLISHED", isDeleted: false },
  }
);
syllabusVersionSchema.index({ courseId: 1, status: 1 });

// Track original DB status when hydrated/loaded
syllabusVersionSchema.post("init", function recordInitialSyllabusStatus(doc) {
  doc.$locals.initialStatus = doc.status;
});

// Enforce immutability of PUBLISHED and ARCHIVED versions on save
const ALLOWED_ARCHIVE_TRANSITION_FIELDS = new Set([
  "status",
  "archivedAt",
  "archivedBy",
  "updatedBy",
  "updatedAt",
]);

syllabusVersionSchema.pre("validate", function enforceSyllabusVersionImmutability() {
  if (this.isNew) return;

  const prevStatus =
    this.$locals.initialStatus ||
    (!this.isModified("status") ? this.status : null) ||
    (this.publishedAt || this.publishedBy ? "PUBLISHED" : null) ||
    (this.archivedAt || this.archivedBy ? "ARCHIVED" : null);

  if (prevStatus === "ARCHIVED") {
    throw new AppError(
      "Archived syllabus version is immutable and cannot be modified",
      "SYLLABUS_VERSION_IMMUTABLE",
      409
    );
  }

  if (prevStatus === "PUBLISHED") {
    const modified = this.modifiedPaths();
    const isArchiveOnlyTransition =
      this.status === "ARCHIVED" &&
      modified.length > 0 &&
      modified.every((path) => ALLOWED_ARCHIVE_TRANSITION_FIELDS.has(path));

    if (!isArchiveOnlyTransition) {
      throw new AppError(
        "Published syllabus version is immutable and cannot be modified or reverted to DRAFT",
        "SYLLABUS_VERSION_IMMUTABLE",
        409
      );
    }
  }
});

module.exports = mongoose.model("SyllabusVersion", syllabusVersionSchema);
