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

    // Gắn với Payout khi earning được gộp vào một lần rút tiền (status -> PAID_OUT).
    // Nguồn sự thật duy nhất là field này; Payout không lưu lại danh sách earningIds
    // để tránh hai nơi cùng giữ quan hệ và có thể lệch nhau.
    payoutId: { type: Schema.Types.ObjectId, ref: "Payout", default: null },
  },
  { timestamps: true }
);

teacherEarningSchema.index({ teacherId: 1, createdAt: -1 });
teacherEarningSchema.index({ teacherId: 1, status: 1 }); // tìm các earning AVAILABLE để gộp vào Payout mới

module.exports = mongoose.model("TeacherEarning", teacherEarningSchema);
