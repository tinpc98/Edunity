const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  LEARNING_RESOURCE_SCOPES,
  LEARNING_RESOURCE_KINDS,
  LEARNING_RESOURCE_SOURCE_TYPES,
  LEARNING_RESOURCE_STATUSES,
} = require("./constants");
const { adminManagedPlugin, softDeletePlugin } = require("./plugins");

const legacySessionContentSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    contentItemId: { type: Schema.Types.ObjectId, default: null },
    legacyType: { type: String, enum: ["LESSON", "MATERIAL", "ASSIGNMENT", null], default: null },
    migratedAt: { type: Date, default: null },
  },
  { _id: false }
);

/**
 * LearningResource (LMS-03)
 * Tài liệu học tập gắn theo Course / Class / Session.
 * File lưu ở private storage được truy cập qua signed URL từ storageService sau khi kiểm tra RBAC/Enrollment.
 * Hỗ trợ ánh xạ/di trú dần từ Session.contents[] mà không xóa dữ liệu lịch sử của Session.
 */
const learningResourceSchema = new Schema(
  {
    scopeType: { type: String, enum: LEARNING_RESOURCE_SCOPES, required: true },

    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    syllabusVersionId: { type: Schema.Types.ObjectId, ref: "SyllabusVersion", default: null },
    curriculumUnitId: { type: Schema.Types.ObjectId, ref: "CurriculumUnit", default: null },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    resourceKind: { type: String, enum: LEARNING_RESOURCE_KINDS, default: "DOCUMENT" },
    sourceType: { type: String, enum: LEARNING_RESOURCE_SOURCE_TYPES, required: true },

    storageKey: { type: String, default: null },
    mimeType: { type: String, default: null },
    originalName: { type: String, default: null },
    fileSizeBytes: { type: Number, default: null, min: 0 },

    externalUrl: { type: String, default: null, trim: true },
    contentText: { type: String, default: null },

    order: { type: Number, default: 1, min: 1 },
    isDownloadable: { type: Boolean, default: true },
    status: { type: String, enum: LEARNING_RESOURCE_STATUSES, default: "PUBLISHED" },

    legacySessionContent: { type: legacySessionContentSchema, default: () => ({}) },
  },
  { timestamps: true }
);

learningResourceSchema.plugin(adminManagedPlugin, { createdByRequired: true });
learningResourceSchema.plugin(softDeletePlugin);

learningResourceSchema.index({ scopeType: 1, courseId: 1, status: 1, order: 1 });
learningResourceSchema.index({ scopeType: 1, classId: 1, status: 1, order: 1 });
learningResourceSchema.index({ scopeType: 1, sessionId: 1, status: 1, order: 1 });
learningResourceSchema.index({ teacherId: 1, scopeType: 1, status: 1 });
learningResourceSchema.index(
  { "legacySessionContent.sessionId": 1, "legacySessionContent.contentItemId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "legacySessionContent.contentItemId": { $type: "objectId" },
      isDeleted: false,
    },
  }
);

module.exports = mongoose.model("LearningResource", learningResourceSchema);

