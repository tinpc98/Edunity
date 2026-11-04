const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * SESSION CONTENT
 * Nội dung/tài liệu/bài tập thuộc một Session, hiển thị theo `order`.
 * Chỉ tồn tại trong phạm vi Session (không cần quản lý độc lập) => embed.
 */
const sessionContentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["LESSON", "MATERIAL", "ASSIGNMENT"], required: true },
    description: String,
    // Tham chiếu file/tài nguyên đính kèm (nếu có). Dùng private storage key,
    // không lưu public URL trực tiếp — thống nhất với VerificationDocument.
    storageKey: { type: String, default: null },
    order: { type: Number, required: true, min: 1 },
  },
  { _id: true }
);

/**
 * RECORDING
 * Bản ghi của một buổi học LIVE đã diễn ra (không phải video quay sẵn).
 *
 * Quyết định thiết kế (MVP): embed 1 recording/Session vì:
 *  - Tài liệu đặc tả xác nhận mỗi Session tối đa 1 recording trong phạm vi MVP.
 *  - Recording luôn được đọc kèm Session (Session Detail hiển thị nút Watch Recording),
 *    không có truy vấn độc lập nào cần tới recording mà không qua Session.
 * Cần tách thành collection `SessionRecording` riêng nếu về sau:
 *  - Video Provider trả về nhiều file/nhiều chất lượng cho 1 Session, hoặc
 *  - Recording cần vòng đời/quyền quản lý độc lập (ví dụ xoá để tiết kiệm storage
 *    mà không ảnh hưởng Session, hoặc webhook cập nhật trạng thái tần suất cao).
 */
const recordingSchema = new Schema(
  {
    providerRecordingId: { type: String, default: null }, // ID recording từ Video Provider (nếu có)
    storageKey: { type: String, default: null }, // private storage key — không lưu public URL
    status: { type: String, enum: ["RECORDING", "PROCESSING", "AVAILABLE", "FAILED", "EXPIRED"], default: "PROCESSING" },
    durationSeconds: { type: Number, default: null, min: 0 },
    availableAt: { type: Date, default: null }, // thời điểm chuyển sang AVAILABLE
    failureReason: { type: String, default: null }, // lý do khi status = FAILED
    startedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null }, // file đã bị xoá theo chính sách lưu trữ (status = EXPIRED)
  },
  { _id: false }
);
// Vòng đời: RECORDING (đang ghi) → PROCESSING (đã dừng, Egress đang xuất file) → AVAILABLE | FAILED → EXPIRED

const recordingSegmentSchema = new Schema(
  {
    segmentIndex: { type: Number, required: true, min: 1 },
    providerRecordingId: { type: String, default: null },
    storageKey: { type: String, default: null },
    status: { type: String, enum: ["RECORDING", "PROCESSING", "AVAILABLE", "FAILED", "EXPIRED"], default: "PROCESSING" },
    startedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    availableAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: null, min: 0 },
    failureReason: { type: String, default: null },
  },
  { _id: false }
);

const teacherPresenceSchema = new Schema(
  {
    firstPreOpenJoinAt: { type: Date, default: null },
    firstTeachingJoinAt: { type: Date, default: null },
    lastConnectedAt: { type: Date, default: null },
    lastDisconnectedAt: { type: Date, default: null },
    isCurrentlyConnected: { type: Boolean, default: false },
    totalOnlineSeconds: { type: Number, default: 0, min: 0 },
    scheduledOnlineSeconds: { type: Number, default: 0, min: 0 },
    currentAbsenceStartedAt: { type: Date, default: null },
    maxContinuousAbsenceSeconds: { type: Number, default: 0, min: 0 },
    yellowWarningTriggeredAt: { type: Date, default: null },
    redViolationTriggeredAt: { type: Date, default: null },
    noShowCancelledAt: { type: Date, default: null },
    earlyLeaveTriggeredAt: { type: Date, default: null },
    overtimeRemindedAt: { type: Date, default: null },
    briefPresenceFlaggedAt: { type: Date, default: null },
  },
  { _id: false }
);

const rescheduleMetadataSchema = new Schema(
  {
    rescheduledFromSessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    rescheduledToSessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    rescheduleRequestId: { type: Schema.Types.ObjectId, ref: "SessionRescheduleRequest", default: null },
    isMakeupSession: { type: Boolean, default: false },
    rescheduleCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const sessionSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    className: { type: String, required: true }, // denormalized
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // denormalized

    title: { type: String, required: true, trim: true },
    description: String, // mô tả/tổng quan buổi học

    contents: { type: [sessionContentSchema], default: [] },

    startDatetime: { type: Date, required: true },
    endDatetime: { type: Date, required: true },

    // Live Room: Session → meetingRoomId → Video Provider → Embedded Classroom
    meetingRoomId: String, // internal Video Provider room id — never an external Meet/Zoom URL
    status: {
      type: String,
      enum: ["SCHEDULED", "WAITING", "IN_PROGRESS", "INTERRUPTED", "COMPLETED", "CANCELLED"],
      default: "SCHEDULED",
    },
    roomState: {
      type: String,
      enum: ["NOT_OPEN", "WAITING", "LIVE", "TEACHER_DISCONNECTED", "INTERRUPTED", "GRACE_PERIOD", "ENDED", "CANCELLED"],
      default: "NOT_OPEN",
    },
    lifecycleState: {
      type: String,
      enum: [
        "SCHEDULED",
        "WAITING",
        "IN_PROGRESS",
        "INTERRUPTED",
        "COMPLETED",
        "AUTO_COMPLETED",
        "CANCELLED",
        "RESCHEDULED",
      ],
      default: "SCHEDULED",
    },
    preOpenedAt: { type: Date, default: null },
    actualStartAt: { type: Date, default: null },
    actualEndAt: { type: Date, default: null },
    endReason: {
      type: String,
      enum: [
        "TEACHER_ENDED",
        "AUTO_COMPLETED",
        "TEACHER_NO_SHOW",
        "TEACHER_LEFT_EARLY",
        "INCIDENT_CANCELLED",
        "RESCHEDULED",
        "ADMIN_CANCELLED",
        null,
      ],
      default: null,
    },
    teacherPresence: { type: teacherPresenceSchema, default: () => ({}) },
    presenceTrackingActive: { type: Boolean, default: false },
    attendanceFinalizedAt: { type: Date, default: null },
    rescheduleMetadata: { type: rescheduleMetadataSchema, default: () => ({}) },

    // Recording: Session → recording → Playback (độc lập với meetingRoomId, không dùng chung identifier)
    recording: { type: recordingSchema, default: null },
    recordingSegments: { type: [recordingSegmentSchema], default: [] },
  },
  { timestamps: true }
);

sessionSchema.index({ classId: 1, startDatetime: 1 });
sessionSchema.index({ teacherId: 1, startDatetime: 1 });
sessionSchema.index({ status: 1, startDatetime: 1, endDatetime: 1 });

module.exports = mongoose.model("Session", sessionSchema);
