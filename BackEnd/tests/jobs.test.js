const mongoose = require("mongoose");
const Class = require("../src/models/Class");
const Enrollment = require("../src/models/Enrollment");
const ScholarshipUsage = require("../src/models/ScholarshipUsage");
const Scholarship = require("../src/models/Scholarship");
const User = require("../src/models/User");
const Course = require("../src/models/Course");
const Category = require("../src/models/Category");
const Subject = require("../src/models/Subject");
const { runJob, expireEnrollmentTransaction } = require("../src/jobs/expireEnrollmentsJob");
const { cancelEnrollment } = require("../src/services/enrollmentService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

afterAll(async () => {
  await disconnectDB();
});

beforeEach(async () => {
  await clearDB();
});

describe("Background Job & Concurrency on Real DB", () => {
  let student, teacher, category, subject, course, cls, scholarship;

  beforeEach(async () => {
    student = await User.create({ name: "S1", email: "s1@test.com", password: "123", role: "STUDENT" });
    teacher = await User.create({ name: "T1", email: "t1@test.com", password: "123", role: "TEACHER" });
    category = await Category.create({ name: "Cat1" });
    subject = await Subject.create({ name: "Sub1", categoryId: category._id });
    course = await Course.create({
      title: "Course 1",
      teacherId: teacher._id,
      categoryId: category._id,
      subjectId: subject._id,
      price: 100
    });
    cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: teacher.name,
      categoryId: category._id,
      subjectId: subject._id,
      className: `Class 1`,
      classType: "PAID",
      price: 100,
      capacity: 10,
      enrolledCount: 1, // manually set to 1 for tests
      status: "OPEN"
    });
    scholarship = await Scholarship.create({
      name: "Scholar",
      code: "SCHOLAR",
      amountType: "FIXED",
      amountValue: 50,
      minPurchase: 0,
      maxDiscount: 50,
      validFrom: new Date(Date.now() - 10000),
      validTo: new Date(Date.now() + 10000),
      remainingAmount: 0 // Assume fully used initially for testing refund
    });
  });

  it("should run job 2 times consecutively and only decrement enrolledCount by 1", async () => {
    const enrollment = await Enrollment.create({
      studentId: student._id,
      classId: cls._id,
      courseId: course._id,
      teacherId: teacher._id,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: mongoose.Types.Decimal128.fromString("100"),
      holdExpiresAt: new Date(Date.now() - 1000) // expired
    });

    // Run first time
    await expireEnrollmentTransaction(enrollment._id);
    // Run second time
    await expireEnrollmentTransaction(enrollment._id);

    const updatedCls = await Class.findById(cls._id);
    expect(updatedCls.enrolledCount).toBe(0); // Decremented from 1 to 0, but only once
  });

  it("job and cancel simultaneously should ensure only one wins", async () => {
    const enrollment = await Enrollment.create({
      studentId: student._id,
      classId: cls._id,
      courseId: course._id,
      teacherId: teacher._id,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: mongoose.Types.Decimal128.fromString("100"),
      holdExpiresAt: new Date(Date.now() - 1000)
    });

    const promises = [
      expireEnrollmentTransaction(enrollment._id),
      cancelEnrollment(student._id, enrollment._id).catch(() => false) // Catch error to prevent test crash
    ];

    await Promise.all(promises);

    const updatedCls = await Class.findById(cls._id);
    expect(updatedCls.enrolledCount).toBe(0); // Should only decrement once
  });

  it("should release scholarship and refund remainingAmount", async () => {
    const enrollment = await Enrollment.create({
      studentId: student._id,
      classId: cls._id,
      courseId: course._id,
      teacherId: teacher._id,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: mongoose.Types.Decimal128.fromString("100"),
      holdExpiresAt: new Date(Date.now() - 1000)
    });

    await ScholarshipUsage.create({
      scholarshipId: scholarship._id,
      enrollmentId: enrollment._id,
      studentId: student._id,
      amount: 50,
      status: "PENDING"
    });

    await expireEnrollmentTransaction(enrollment._id);

    const updatedUsage = await ScholarshipUsage.findOne({ enrollmentId: enrollment._id });
    expect(updatedUsage.status).toBe("RELEASED");

    const updatedScholarship = await Scholarship.findById(scholarship._id);
    expect(updatedScholarship.remainingAmount.toString()).toBe("50");
  });
});
