const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_LEVELS } = require("./constants");

const scheduleEntrySchema = new Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true },
  },
  { _id: false }
);

const classSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    courseTitle: { type: String, required: true }, // denormalized
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teacherName: { type: String, required: true }, // denormalized
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    gradeLevel: { type: String, enum: GRADE_LEVELS, default: null },

    className: { type: String, required: true, trim: true },
    coverImage: String,
    classType: { type: String, enum: ["FREE", "PAID"], required: true }, // BR-08
    price: { type: Schema.Types.Decimal128, required: true, default: 0 }, // BR-09/BR-10
    capacity: { type: Number, required: true, min: 1 },
    enrolledCount: { type: Number, default: 0, min: 0 }, // maintained counter, BR-11

    enrollmentStart: Date,
    enrollmentEnd: Date,
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "DRAFT",
    },

    schedule: [scheduleEntrySchema],

    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

classSchema.index({ courseId: 1 });
classSchema.index({ teacherId: 1, status: 1 });
classSchema.index({ categoryId: 1, subjectId: 1, gradeLevel: 1, classType: 1, status: 1 });
classSchema.index({ className: "text" });

// BR-09 / BR-10
classSchema.pre("validate", function classPriceRule(next) {
  const price = this.price ? Number(this.price.toString()) : 0;
  if (this.classType === "FREE" && price !== 0) {
    return next(new Error("FREE class must have price = 0"));
  }
  if (this.classType === "PAID" && price <= 0) {
    return next(new Error("PAID class must have price > 0"));
  }
  next();
});

module.exports = mongoose.model("Class", classSchema);
