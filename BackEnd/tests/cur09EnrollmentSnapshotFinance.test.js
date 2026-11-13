const mongoose = require("mongoose");
const { User, Category, Subject, Course, Class, Enrollment, Payment, TeacherEarning, Transaction } = require("../src/models");
const { createEnrollment } = require("../src/services/enrollmentService");
const paymentService = require("../src/services/paymentService");
const { toDec, toNum } = require("../src/utils/money");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

describe("CUR-09: Enrollment Snapshot Integration with Payment and Transaction", () => {
  let studentUser, teacherUser, adminUser;
  let category, subject, course;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";
    process.env.REAL_LOCAL_RUNTIME = "false";
    process.env.PAYOS_ENABLED = "false";
    await connectDB();
    await syncIndexes();
  }, 60000);

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();

    studentUser = await User.create({
      email: "cur09.student@edunity.test",
      passwordHash: "hash123",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student CUR-09" },
    });

    teacherUser = await User.create({
      email: "cur09.teacher@edunity.test",
      passwordHash: "hash123",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Teacher CUR-09" },
    });

    adminUser = await User.create({
      email: "cur09.admin@edunity.test",
      passwordHash: "hash123",
      role: "ADMIN",
      status: "ACTIVE",
      studentProfile: { fullName: "Admin CUR-09" },
    });

    category = await Category.create({ name: "Math Category", slug: "math-cur09", createdBy: adminUser._id });
    subject = await Subject.create({
      name: "Calculus",
      code: "CALC09",
      slug: "calc-cur09",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: adminUser._id,
    });
    course = await Course.create({
      title: "Calculus I",
      slug: "calc-1-cur09",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: teacherUser._id,
    });
  });

  test("1. createEnrollment captures immutable Class tuitionAmount snapshot at enrollment time", async () => {
    const fakePolicyId = new mongoose.Types.ObjectId();
    const fakeSyllabusId = new mongoose.Types.ObjectId();

    const cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacherUser._id,
      teacherName: "Teacher CUR-09",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Calculus Fall 2026",
      classType: "PAID",
      capacity: 20,
      enrolledCount: 0,
      status: "OPEN",
      price: toDec(500000),
      syllabusVersionId: fakeSyllabusId,
      syllabusVersionNumber: 1,
      pricingPolicyId: fakePolicyId,
      pricingPolicyKey: "MATH-STD-2026",
      pricingPolicyVersion: 1,
    });

    const enrollment = await createEnrollment(studentUser._id, cls._id);

    expect(enrollment).toBeDefined();
    expect(enrollment.enrollmentStatus).toBe("PENDING_PAYMENT");
    expect(toNum(enrollment.tuitionAmount)).toBe(500000);
    expect(enrollment.holdExpiresAt).toBeDefined();
    expect(String(enrollment.classId)).toBe(String(cls._id));
    expect(String(enrollment.teacherId)).toBe(String(teacherUser._id));
  });

  test("2. Changing Class tuition fee afterwards NEVER alters existing Enrollment snapshot or Payment amount", async () => {
    const cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacherUser._id,
      teacherName: "Teacher CUR-09",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Calculus Fall 2026 (Price Change Test)",
      classType: "PAID",
      capacity: 20,
      enrolledCount: 0,
      status: "OPEN",
      price: toDec(500000),
    });

    // Student creates enrollment at 500,000 VND
    const enrollment = await createEnrollment(studentUser._id, cls._id);
    expect(toNum(enrollment.tuitionAmount)).toBe(500000);

    // Admin now updates Class price to 750,000 VND
    await Class.updateOne({ _id: cls._id }, { $set: { price: toDec(750000) } });
    const refreshedCls = await Class.findById(cls._id).lean();
    expect(toNum(refreshedCls.price)).toBe(750000);

    // Student requests payment intent -> MUST be based on locked enrollment tuition (500,000 VND), NOT 750,000 VND
    const payment = await paymentService.createTuitionPaymentIntent(studentUser._id, enrollment._id);
    expect(payment).toBeDefined();
    expect(toNum(payment.amount)).toBe(500000);
    expect(toNum(payment.amount)).not.toBe(750000);

    // Verify the enrollment record remains unchanged at 500,000 VND
    const refreshedEnrollment = await Enrollment.findById(enrollment._id).lean();
    expect(toNum(refreshedEnrollment.tuitionAmount)).toBe(500000);
  });

  test("3. Legacy Class creates Enrollment gracefully and locks initial tuition", async () => {
    const legacyCls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacherUser._id,
      teacherName: "Teacher CUR-09",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Legacy Class 2025",
      classType: "PAID",
      capacity: 10,
      enrolledCount: 0,
      status: "OPEN",
      price: toDec(300000),
    });

    const enrollment = await createEnrollment(studentUser._id, legacyCls._id);
    expect(enrollment).toBeDefined();
    expect(toNum(enrollment.tuitionAmount)).toBe(300000);
  });
});
