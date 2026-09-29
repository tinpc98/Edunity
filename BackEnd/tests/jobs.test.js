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
    const admin = await User.create({ email: "admin@test.com", passwordHash: "hashed", role: "ADMIN" });
    student = await User.create({ email: "s1@test.com", passwordHash: "hashed", role: "STUDENT" });
    teacher = await User.create({ email: "t1@test.com", passwordHash: "hashed", role: "TEACHER" });

    category = await Category.create({ name: "Cat1", slug: "cat-1", createdBy: admin._id });
    subject = await Subject.create({
      name: "Sub1",
      slug: "sub-1",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id
    });
    course = await Course.create({
      title: "Course 1",
      slug: "course-1",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: admin._id
    });
    cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher One",
      categoryId: category._id,
      subjectId: subject._id,
      className: `Class 1`,
      classType: "PAID",
      price: 100,
      capacity: 10,
      enrolledCount: 1, // manually set to 1 for tests
      status: "OPEN"
    });
    // campaignId/applicationId don't need to resolve to real documents here —
    // Mongoose doesn't enforce ref existence, and this test only exercises the
    // expire/release-on-refund path, not the Campaign/Application workflow.
    scholarship = await Scholarship.create({
      campaignId: new mongoose.Types.ObjectId(),
      applicationId: new mongoose.Types.ObjectId(),
      studentId: student._id,
      allocatedAmount: 50,
      remainingAmount: 0, // Assume fully used initially for testing refund
      expiresAt: new Date(Date.now() + 10000)
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
      classId: cls._id,
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
