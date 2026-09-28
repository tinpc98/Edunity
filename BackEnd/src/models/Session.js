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
    status: { type: String, enum: ["PROCESSING", "AVAILABLE", "FAILED"], default: "PROCESSING" },
    durationSeconds: { type: Number, default: null, min: 0 },
    availableAt: { type: Date, default: null }, // thời điểm chuyển sang AVAILABLE
    failureReason: { type: String, default: null }, // lý do khi status = FAILED
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
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "SCHEDULED",
    },

    // Recording: Session → recording → Playback (độc lập với meetingRoomId, không dùng chung identifier)
    recording: { type: recordingSchema, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ classId: 1, startDatetime: 1 });
sessionSchema.index({ teacherId: 1, startDatetime: 1 });

module.exports = mongoose.model("Session", sessionSchema);
