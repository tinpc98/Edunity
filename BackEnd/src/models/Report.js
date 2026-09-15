const mongoose = require("mongoose");
const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },

    type: { type: String, required: true },
    description: String,
    status: { type: String, enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"], default: "OPEN" },
    handledByAdminId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
