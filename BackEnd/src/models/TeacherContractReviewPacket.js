const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  CONTRACT_REVIEW_PACKET_STATUSES,
  CONTRACT_REVIEW_RECOMMENDED_ACTIONS,
  CONTRACT_REVIEW_TRIGGER_SOURCES,
} = require("./constants");

const packetHistoryEntrySchema = new Schema(
  {
    action: {
      type: String,
      enum: ["CREATED", "STATUS_UPDATED", "CORRELATION_REFRESHED", "EXECUTION_BLOCKED"],
      required: true,
    },
    previousStatus: {
      type: String,
      enum: [...CONTRACT_REVIEW_PACKET_STATUSES, null],
      default: null,
    },
    newStatus: {
      type: String,
      enum: CONTRACT_REVIEW_PACKET_STATUSES,
      required: true,
    },
    note: { type: String, default: null, trim: true, maxlength: 2000 },
    tea12DependencyStatus: { type: String, enum: ["BLOCKED", "VERIFIED"], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, required: true },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true }
);

const auditTrailRefSchema = new Schema(
  {
    auditLogId: { type: Schema.Types.ObjectId, ref: "AuditLog", required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

const reviewMetricsSnapshotSchema = new Schema(
  {
    capturedAt: { type: Date, required: true },
    confirmedYellowCount: { type: Number, default: 0, min: 0 },
    confirmedRedCount: { type: Number, default: 0, min: 0 },
    confirmedNoShowCount: { type: Number, default: 0, min: 0 },
    confirmedEarlyLeaveCount: { type: Number, default: 0, min: 0 },
    openDisciplineCasesCount: { type: Number, default: 0, min: 0 },
    pendingIncidentsCount: { type: Number, default: 0, min: 0 },
    approvedSubjectAuthCount: { type: Number, default: 0, min: 0 },
    suspendedSubjectAuthCount: { type: Number, default: 0, min: 0 },
    pendingRefundReviewCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/**
 * TeacherContractReviewPacket (TEA-16)
 * Hồ sơ điều phối rà soát hợp đồng giảng viên dựa trên sự cố/vi phạm TIN-05E và quyền giảng dạy TEA-07.
 * Fail-closed khi TEA-12 (hợp đồng giảng viên của Bảo) chưa tích hợp; không tự động chấm dứt hợp đồng.
 */
const teacherContractReviewPacketSchema = new Schema(
  {
    packetCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    triggerSource: { type: String, enum: CONTRACT_REVIEW_TRIGGER_SOURCES, required: true },
    recommendedContractAction: { type: String, enum: CONTRACT_REVIEW_RECOMMENDED_ACTIONS, required: true },
    severitySummary: { type: String, default: "", trim: true, maxlength: 2000 },
    coordinationSummary: { type: String, required: true, trim: true, maxlength: 4000 },

    status: {
      type: String,
      enum: CONTRACT_REVIEW_PACKET_STATUSES,
      default: "DRAFT",
      required: true,
    },

    tea12DependencyStatus: { type: String, enum: ["BLOCKED", "VERIFIED"], default: "BLOCKED", required: true },
    tea12BlockerCode: { type: String, default: "CONTRACT_DEPENDENCY_BLOCKED" },
    tea12BlockerNote: {
      type: String,
      default:
        "TEA-12 (TeacherContract by Bao) is not integrated yet; contract lifecycle changes remain strictly blocked until contract service handoff.",
    },
    contractSnapshot: { type: Schema.Types.Mixed, default: null },

    autoExecutionBlocked: { type: Boolean, default: true, required: true },
    autoContractMutationApplied: { type: Boolean, default: false, required: true },

    linkedDisciplineCaseIds: [{ type: Schema.Types.ObjectId, ref: "TeacherDisciplineCase" }],
    linkedViolationIds: [{ type: Schema.Types.ObjectId, ref: "TeacherViolation" }],
    linkedIncidentReportIds: [{ type: Schema.Types.ObjectId, ref: "TeacherIncidentReport" }],
    linkedSubjectAuthIds: [{ type: Schema.Types.ObjectId, ref: "TeacherSubjectAuthorization" }],
    linkedRefundReviewIds: [{ type: Schema.Types.ObjectId, ref: "SessionRefundReview" }],

    metricsSnapshot: { type: reviewMetricsSnapshotSchema, required: true },
    auditTrailSnapshot: { type: [auditTrailRefSchema], default: [] },
    history: { type: [packetHistoryEntrySchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: null, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

teacherContractReviewPacketSchema.index({ teacherId: 1, status: 1, createdAt: -1 });
teacherContractReviewPacketSchema.index({ status: 1, createdAt: -1 });
teacherContractReviewPacketSchema.index(
  { teacherId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["DRAFT", "READY_FOR_CONTRACT_TEAM", "ACKNOWLEDGED_PENDING_TEA12", "ON_HOLD"] },
    },
  }
);

module.exports = mongoose.model("TeacherContractReviewPacket", teacherContractReviewPacketSchema);

