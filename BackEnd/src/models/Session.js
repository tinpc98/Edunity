const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    className: { type: String, required: true }, // denormalized
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // denormalized

    title: { type: String, required: true, trim: true },
    startDatetime: { type: Date, required: true },
    endDatetime: { type: Date, required: true },
    meetingRoomId: String, // internal Video Provider room id — never an external Meet/Zoom URL
    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "SCHEDULED",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

sessionSchema.index({ classId: 1, startDatetime: 1 });
sessionSchema.index({ teacherId: 1, startDatetime: 1 });

module.exports = mongoose.model("Session", sessionSchema);
