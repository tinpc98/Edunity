const mongoose = require("mongoose");
const { Schema } = mongoose;

const teacherEarningSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true, unique: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },

    grossAmount: { type: Schema.Types.Decimal128, required: true },
    commissionAmount: { type: Schema.Types.Decimal128, required: true }, // grossAmount * commissionRate (10%)
    netAmount: { type: Schema.Types.Decimal128, required: true }, // grossAmount - commissionAmount
    status: { type: String, enum: ["PENDING", "AVAILABLE", "PAID_OUT"], default: "PENDING" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

teacherEarningSchema.index({ teacherId: 1, createdAt: -1 });

module.exports = mongoose.model("TeacherEarning", teacherEarningSchema);
