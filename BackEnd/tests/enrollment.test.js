const request = require("supertest");
const app = require("../src/app");
const mongoose = require("mongoose");
const Class = require("../src/models/Class");
const Enrollment = require("../src/models/Enrollment");
const User = require("../src/models/User");
const Course = require("../src/models/Course");
const Category = require("../src/models/Category");
const Subject = require("../src/models/Subject");
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

describe("Enrollment API on Real DB", () => {
  let student1, student2, teacher, category, subject, course;

  beforeEach(async () => {
    student1 = await User.create({ name: "S1", email: "s1@test.com", password: "123", role: "STUDENT" });
    student2 = await User.create({ name: "S2", email: "s2@test.com", password: "123", role: "STUDENT" });
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
  });

  const createClass = async (type, price, status, capacity) => {
    return await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: teacher.name,
      categoryId: category._id,
      subjectId: subject._id,
      className: `Class ${type}`,
      classType: type,
      price: price,
      capacity: capacity,
      status: status
    });
  };

  describe("POST /api/classes/:classId/enrollments", () => {
    it("should successfully enroll in a FREE class (CONFIRMED)", async () => {
      const cls = await createClass("FREE", 0, "OPEN", 10);

      const res = await request(app)
        .post(`/api/classes/${cls._id}/enrollments`)
        .set("x-user-id", student1._id.toString());

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrollmentStatus).toBe("CONFIRMED");
      expect(res.body.data.paymentSource).toBe("FREE");

      const updatedCls = await Class.findById(cls._id);
      expect(updatedCls.enrolledCount).toBe(1);
    });

    it("should successfully enroll in a PAID class (PENDING_PAYMENT)", async () => {
      const cls = await createClass("PAID", 100, "OPEN", 10);

      const res = await request(app)
        .post(`/api/classes/${cls._id}/enrollments`)
        .set("x-user-id", student1._id.toString());

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrollmentStatus).toBe("PENDING_PAYMENT");
      expect(res.body.data.holdExpiresAt).toBeDefined();

      const updatedCls = await Class.findById(cls._id);
      expect(updatedCls.enrolledCount).toBe(1);
    });

    it("should fail if class is not OPEN", async () => {
      const cls = await createClass("PAID", 100, "DRAFT", 10);

      const res = await request(app)
        .post(`/api/classes/${cls._id}/enrollments`)
        .set("x-user-id", student1._id.toString());

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("CLASS_NOT_OPEN");
    });

    it("should fail if role is not STUDENT", async () => {
      const cls = await createClass("PAID", 100, "OPEN", 10);

      const res = await request(app)
        .post(`/api/classes/${cls._id}/enrollments`)
        .set("x-user-id", teacher._id.toString()); // Teacher trying to enroll

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe("FORBIDDEN");
    });

    it("should handle race conditions: capacity 1, 5 requests -> 1 success, 4 full", async () => {
      const cls = await createClass("PAID", 100, "OPEN", 1);
      
      const students = await User.insertMany([
        { name: "S3", email: "s3@test.com", password: "123", role: "STUDENT" },
        { name: "S4", email: "s4@test.com", password: "123", role: "STUDENT" },
        { name: "S5", email: "s5@test.com", password: "123", role: "STUDENT" },
      ]);
      const allStudents = [student1, student2, ...students];

      const promises = allStudents.map(st => 
        request(app)
          .post(`/api/classes/${cls._id}/enrollments`)
          .set("x-user-id", st._id.toString())
      );

      const responses = await Promise.all(promises);
      const successes = responses.filter(r => r.statusCode === 201);
      const conflicts = responses.filter(r => r.statusCode === 409 && r.body.error === "CLASS_FULL");

      expect(successes.length).toBe(1);
      expect(conflicts.length).toBe(4);

      const updatedCls = await Class.findById(cls._id);
      expect(updatedCls.enrolledCount).toBe(1);
    });

    it("should handle duplicate enrollments: 2 same requests -> 1 success, 1 duplicate", async () => {
      const cls = await createClass("PAID", 100, "OPEN", 5);

      const promises = [
        request(app).post(`/api/classes/${cls._id}/enrollments`).set("x-user-id", student1._id.toString()),
        request(app).post(`/api/classes/${cls._id}/enrollments`).set("x-user-id", student1._id.toString())
      ];

      const responses = await Promise.all(promises);
      const successes = responses.filter(r => r.statusCode === 201);
      const duplicates = responses.filter(r => r.statusCode === 409 && r.body.error === "DUPLICATE_ENROLLMENT");

      expect(successes.length).toBe(1);
      expect(duplicates.length).toBe(1);
    });

    it("should allow enrollment again if old enrollment is EXPIRED", async () => {
      const cls = await createClass("PAID", 100, "OPEN", 5);
      
      // Force an expired enrollment
      await Enrollment.create({
        studentId: student1._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "EXPIRED",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("100")
      });

      const res = await request(app)
        .post(`/api/classes/${cls._id}/enrollments`)
        .set("x-user-id", student1._id.toString());

      expect(res.statusCode).toBe(201);
    });

    it("should fallback and expire old pending enrollment if hold is past", async () => {
      const cls = await createClass("PAID", 100, "OPEN", 5);
      
      // Old pending enrollment with hold past
      await Enrollment.create({
        studentId: student1._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("100"),
        holdExpiresAt: new Date(Date.now() - 1000) // expired 1s ago
      });
      // Increment class manually to match db state
      await Class.updateOne({ _id: cls._id }, { $inc: { enrolledCount: 1 } });

      const res = await request(app)
        .post(`/api/classes/${cls._id}/enrollments`)
        .set("x-user-id", student1._id.toString());

      expect(res.statusCode).toBe(201);
      // Wait, let's verify if enrolledCount is 1 (1 old expired -> 1 new created)
      const updatedCls = await Class.findById(cls._id);
      expect(updatedCls.enrolledCount).toBe(1);
    });
  });

  describe("POST /api/enrollments/:id/cancel", () => {
    it("should cancel PENDING_PAYMENT enrollment", async () => {
      const cls = await createClass("PAID", 100, "OPEN", 5);
      await Class.updateOne({ _id: cls._id }, { $inc: { enrolledCount: 1 } });
      const enrollment = await Enrollment.create({
        studentId: student1._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("100"),
      });

      const res = await request(app)
        .post(`/api/enrollments/${enrollment._id}/cancel`)
        .set("x-user-id", student1._id.toString());

      expect(res.statusCode).toBe(200);
      const updatedCls = await Class.findById(cls._id);
      expect(updatedCls.enrolledCount).toBe(0);
    });

    it("should return 409 if trying to cancel CONFIRMED enrollment", async () => {
      const cls = await createClass("PAID", 100, "OPEN", 5);
      const enrollment = await Enrollment.create({
        studentId: student1._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "CONFIRMED", // not cancellable
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("100"),
      });

      const res = await request(app)
        .post(`/api/enrollments/${enrollment._id}/cancel`)
        .set("x-user-id", student1._id.toString());

      expect(res.statusCode).toBe(409);
    });
  });
});
