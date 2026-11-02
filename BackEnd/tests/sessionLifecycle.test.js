const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}

const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { User, Category, Subject, Course, Class, Session, SessionAttendance, Enrollment } = require("../src/models");
const sessionService = require("../src/services/sessionService");
const videoProvider = require("../src/services/videoProvider");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("TIN-05A: Session End Data Integrity, Idempotency & Lifecycle Test Suite", () => {
  let admin, teacher, teacherOther, student1, student2, student3, student4, cls;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    const passwordHash = hashPassword("password123");

    admin = await User.create({ email: "admin@test.com", passwordHash, role: "ADMIN" });
    teacher = await User.create({
      email: "teacher@test.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Lead Teacher", verificationStatus: "VERIFIED" },
    });
    teacherOther = await User.create({
      email: "other@test.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Other Teacher", verificationStatus: "VERIFIED" },
    });

    student1 = await User.create({
      email: "s1@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student One" },
    });
    student2 = await User.create({
      email: "s2@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student Two" },
    });
    student3 = await User.create({
      email: "s3@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student Three" },
    });
    student4 = await User.create({
      email: "s4@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student Four" },
    });

    const category = await Category.create({ name: "IT", slug: "it", createdBy: admin._id, status: "ACTIVE" });
    const subject = await Subject.create({
      name: "Programming",
      slug: "prog",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    const course = await Course.create({
      title: "NodeJS Mastery",
      slug: "nodejs-mastery",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });

    cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Lead Teacher",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Backend Engineering 101",
      classType: "FREE",
      price: 0,
      capacity: 10,
      status: "OPEN",
    });

    // 3 students CONFIRMED
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student1._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
    });
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student2._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
    });
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student3._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
    });

    // 1 student CANCELLED
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student4._id,
      enrollmentStatus: "CANCELLED",
      paymentSource: "FREE",
    });
  });

  const createActiveSession = async () => {
    const now = new Date();
    return Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Session 1: Introduction",
      sessionNumber: 1,
      status: "IN_PROGRESS",
      meetingRoomId: `room_${new mongoose.Types.ObjectId()}`,
      startDatetime: new Date(now.getTime() - 20 * 60 * 1000),
      endDatetime: new Date(now.getTime() + 40 * 60 * 1000),
    });
  };

  // LIFE-FIX-01: Teacher End Session hợp lệ
  it("LIFE-FIX-01: Teacher ends an IN_PROGRESS session successfully", async () => {
    const session = await createActiveSession();

    // Student 1 attended
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "PRESENT",
      joinedAt: new Date(),
    });

    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("COMPLETED");
    expect(res.body.data.attendance).toEqual({ present: 1, absent: 2 });

    const updated = await Session.findById(session._id);
    expect(updated.status).toBe("COMPLETED");
  });

  // LIFE-FIX-02: End tạo ABSENT cho học viên chưa join
  it("LIFE-FIX-02: End session creates ABSENT records for confirmed enrolled students who did not join", async () => {
    const session = await createActiveSession();

    // Only student1 joined
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "PRESENT",
      joinedAt: new Date(),
    });

    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);

    const attendances = await SessionAttendance.find({ sessionId: session._id }).lean();
    expect(attendances.length).toBe(3); // student1 (PRESENT), student2 (ABSENT), student3 (ABSENT)

    const s1Record = attendances.find((a) => a.studentId.toString() === student1._id.toString());
    const s2Record = attendances.find((a) => a.studentId.toString() === student2._id.toString());
    const s3Record = attendances.find((a) => a.studentId.toString() === student3._id.toString());

    expect(s1Record.attendanceStatus).toBe("PRESENT");
    expect(s2Record.attendanceStatus).toBe("ABSENT");
    expect(s3Record.attendanceStatus).toBe("ABSENT");
  });

  // LIFE-FIX-03: Không tạo ABSENT cho Enrollment PENDING_PAYMENT hoặc CANCELLED
  it("LIFE-FIX-03: Does not create ABSENT records for students with CANCELLED or PENDING_PAYMENT enrollment", async () => {
    const session = await createActiveSession();

    // Student 5 with PENDING_PAYMENT
    const student5 = await User.create({
      email: "s5@test.com",
      passwordHash: hashPassword("x"),
      role: "STUDENT",
    });
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student5._id,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
    });

    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);

    // student4 (CANCELLED) and student5 (PENDING_PAYMENT) must NOT have attendance records
    const s4Record = await SessionAttendance.findOne({ sessionId: session._id, studentId: student4._id });
    const s5Record = await SessionAttendance.findOne({ sessionId: session._id, studentId: student5._id });

    expect(s4Record).toBeNull();
    expect(s5Record).toBeNull();
  });

  // LIFE-FIX-04: End lần thứ hai không tạo dữ liệu trùng
  it("LIFE-FIX-04: Ending an already COMPLETED session returns 409 and does not alter attendance", async () => {
    const session = await createActiveSession();
    await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));

    const countBefore = await SessionAttendance.countDocuments({ sessionId: session._id });

    const retryRes = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(retryRes.statusCode).toBe(409);
    expect(retryRes.body.error).toBe("SESSION_NOT_IN_PROGRESS");

    const countAfter = await SessionAttendance.countDocuments({ sessionId: session._id });
    expect(countAfter).toBe(countBefore);
  });

  // LIFE-FIX-05: DB insert ABSENT thất bại (Transaction aborts)
  it("LIFE-FIX-05: When database failure occurs during attendance finalization, transaction aborts", async () => {
    const session = await createActiveSession();

    const originalBulkWrite = SessionAttendance.bulkWrite;
    SessionAttendance.bulkWrite = async () => {
      throw new Error("Simulated Database Outage during bulkWrite");
    };

    let caughtError = null;
    try {
      await sessionService.endSession(teacher._id, session._id);
    } catch (err) {
      caughtError = err;
    } finally {
      SessionAttendance.bulkWrite = originalBulkWrite;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toContain("Simulated Database Outage");

    // Session status must NOT be COMPLETED! It must remain IN_PROGRESS!
    const sessionAfter = await Session.findById(session._id);
    expect(sessionAfter.status).toBe("IN_PROGRESS");
  });

  // LIFE-FIX-06: Sau DB failure, dữ liệu có thể được phục hồi an toàn (Retry)
  it("LIFE-FIX-06: After a database failure, retry endSession succeeds and finalizes attendance cleanly", async () => {
    const session = await createActiveSession();

    const originalBulkWrite = SessionAttendance.bulkWrite;
    SessionAttendance.bulkWrite = async () => {
      throw new Error("Temporary DB glitch");
    };

    try {
      await sessionService.endSession(teacher._id, session._id);
    } catch (_) {}

    // Restore normal DB operations
    SessionAttendance.bulkWrite = originalBulkWrite;

    // Retry endSession
    const retryRes = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.body.data.status).toBe("COMPLETED");

    const sessionFinal = await Session.findById(session._id);
    expect(sessionFinal.status).toBe("COMPLETED");

    // Attendance is now completely and cleanly finalized!
    const absentCount = await SessionAttendance.countDocuments({ sessionId: session._id, attendanceStatus: "ABSENT" });
    expect(absentCount).toBe(3);
  });

  // LIFE-FIX-07: Session không bị COMPLETED giả khi Attendance chưa hoàn tất
  it("LIFE-FIX-07: Session status is never falsely set to COMPLETED when attendance mutation fails", async () => {
    const session = await createActiveSession();

    const originalUpdateMany = SessionAttendance.updateMany;
    SessionAttendance.updateMany = async () => {
      throw new Error("Failure during updateMany leftAt");
    };

    try {
      await sessionService.endSession(teacher._id, session._id);
    } catch (_) {}

    SessionAttendance.updateMany = originalUpdateMany;

    const sessionInDb = await Session.findById(session._id);
    expect(sessionInDb.status).toBe("IN_PROGRESS");
  });

  // LIFE-FIX-08: Attendance PRESENT/LATE không bị ghi đè
  it("LIFE-FIX-08: Students with PRESENT or LATE attendance are never overwritten by ABSENT", async () => {
    const session = await createActiveSession();

    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "PRESENT",
      joinedAt: new Date(),
    });
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student2._id,
      attendanceStatus: "LATE",
      joinedAt: new Date(),
    });

    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);

    const s1 = await SessionAttendance.findOne({ sessionId: session._id, studentId: student1._id });
    const s2 = await SessionAttendance.findOne({ sessionId: session._id, studentId: student2._id });
    const s3 = await SessionAttendance.findOne({ sessionId: session._id, studentId: student3._id });

    expect(s1.attendanceStatus).toBe("PRESENT");
    expect(s2.attendanceStatus).toBe("LATE");
    expect(s3.attendanceStatus).toBe("ABSENT");
  });

  // LIFE-FIX-09: Attendance đã có từ trước không bị thay đổi sai
  it("LIFE-FIX-09: Existing attendance records remain untouched during endSession", async () => {
    const session = await createActiveSession();
    const joinedTime = new Date(Date.now() - 15 * 60 * 1000);

    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "PRESENT",
      joinedAt: joinedTime,
    });

    await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));

    const s1 = await SessionAttendance.findOne({ sessionId: session._id, studentId: student1._id });
    expect(s1.joinedAt.getTime()).toBe(joinedTime.getTime());
    expect(s1.attendanceStatus).toBe("PRESENT");
  });

  // LIFE-FIX-10: Concurrency CASE A & C: Student Join cùng thời điểm Teacher End
  it("LIFE-FIX-10: Handles race condition when student joins concurrently with teacher ending session", async () => {
    const session = await createActiveSession();

    // Student 2 calls joinSession concurrently with Teacher calling endSession
    const [joinRes, endRes] = await Promise.all([
      request(app).post(`/api/sessions/${session._id}/join`).set(as(student2)),
      request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher)),
    ]);

    expect(endRes.statusCode).toBe(200);
    expect([200, 409]).toContain(joinRes.statusCode);

    const s2 = await SessionAttendance.findOne({ sessionId: session._id, studentId: student2._id });
    expect(s2).not.toBeNull();
    expect(["PRESENT", "LATE", "ABSENT"]).toContain(s2.attendanceStatus);
  });

  // LIFE-FIX-11: Concurrency CASE D: Hai request Teacher End đồng thời
  it("LIFE-FIX-11: Two concurrent endSession requests are handled safely without corrupting data", async () => {
    const session = await createActiveSession();

    // Send two concurrent requests
    const [res1, res2] = await Promise.all([
      request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher)),
      request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher)),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // Exactly one succeeds (200) and the other is rejected (409)
    expect(statuses).toEqual([200, 409]);

    const sessionInDb = await Session.findById(session._id);
    expect(sessionInDb.status).toBe("COMPLETED");

    // Total attendance records must equal total confirmed enrollments (3)
    const totalCount = await SessionAttendance.countDocuments({ sessionId: session._id });
    expect(totalCount).toBe(3);
  });

  // LIFE-FIX-12: Concurrency CASE F: MongoDB duplicate key E11000 được xử lý an toàn
  it("LIFE-FIX-12: E11000 duplicate key is handled gracefully without 500 error", async () => {
    const session = await createActiveSession();

    // Pre-insert an ABSENT record for student2
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student2._id,
      attendanceStatus: "ABSENT",
    });

    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.attendance).toEqual({ present: 0, absent: 3 });
  });

  // LIFE-FIX-13: LiveKit closeRoom thất bại
  it("LIFE-FIX-13: When LiveKit closeRoom fails, DB transaction still commits safely and returns 200", async () => {
    const session = await createActiveSession();

    const originalCloseRoom = videoProvider.closeRoom;
    videoProvider.closeRoom = async () => {
      // LiveKit server offline/unreachable
      return false;
    };

    try {
      const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("COMPLETED");
    } finally {
      videoProvider.closeRoom = originalCloseRoom;
    }

    const sessionInDb = await Session.findById(session._id);
    expect(sessionInDb.status).toBe("COMPLETED");
  });

  // LIFE-FIX-14: Concurrency CASE B: Session COMPLETED không được cấp token Join mới
  it("LIFE-FIX-14: Joining a COMPLETED session is rejected with 409 SESSION_ENDED", async () => {
    const session = await createActiveSession();
    await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student1));
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("SESSION_ENDED");
  });

  // LIFE-FIX-15: Regression TIN-03A GET Join = 405
  it("LIFE-FIX-15: Regression TIN-03A - GET /api/student/sessions/:id/join returns 405 METHOD_NOT_ALLOWED", async () => {
    const session = await createActiveSession();
    const res = await request(app).get(`/api/student/sessions/${session._id}/join`).set(as(student1));
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe("METHOD_NOT_ALLOWED");
  });

  // LIFE-FIX-16: Regression canJoin theo Session status
  it("LIFE-FIX-16: Regression - canJoin is true for IN_PROGRESS and false for COMPLETED/CANCELLED", async () => {
    const session = await createActiveSession();

    // 1. IN_PROGRESS session within time window -> canJoin = true
    const mySessions1 = await request(app).get("/api/me/sessions").set(as(student1));
    expect(mySessions1.statusCode).toBe(200);
    const item1 = mySessions1.body.data.find((s) => s._id === session._id.toString());
    expect(item1.canJoin).toBe(true);

    // 2. End session -> COMPLETED -> canJoin = false
    await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));

    const mySessions2 = await request(app).get("/api/me/sessions").set(as(student1));
    const item2 = mySessions2.body.data.find((s) => s._id === session._id.toString());
    expect(item2.canJoin).toBe(false);
  });

  // LIFE-FIX-17: Regression TIN-01 (Avatar) & TIN-02A (JPG MIME)
  it("LIFE-FIX-17: Regression TIN-01 and TIN-02A avatar upload remains fully functional", async () => {
    // TIN-01: User without embedded profile
    const rawUser = await User.create({
      email: "raw_user@test.com",
      passwordHash: hashPassword("x"),
      role: "STUDENT",
    });
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("test png")]);
    const res1 = await request(app)
      .post("/api/me/avatar")
      .set(as(rawUser))
      .attach("file", PNG, { filename: "avatar.png", contentType: "image/png" });
    expect(res1.statusCode).toBe(200);
    expect(res1.body.data.avatarUrl).toMatch(/\/uploads\/avatar\//);

    // TIN-02A: JPG MIME
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("test jpg")]);
    const res2 = await request(app)
      .post("/api/me/avatar")
      .set(as(student1))
      .attach("file", JPEG, { filename: "photo.jpg", contentType: "image/jpg" });
    expect(res2.statusCode).toBe(200);
    expect(res2.body.data.avatarUrl).toMatch(/\.jpg$/);
  });

  // LIFE-FIX-18: Regression TIN-04A (Catalog filter, pagination, stable sort)
  it("LIFE-FIX-18: Regression TIN-04A catalog filters, categoryId and pagination work properly", async () => {
    // Category filter
    const resCat = await request(app).get(`/api/classes?categoryId=${cls.categoryId}`);
    expect(resCat.statusCode).toBe(200);
    expect(resCat.body.data.total).toBe(1);

    // Safe negative page
    const resPage = await request(app).get("/api/classes?page=-5");
    expect(resPage.statusCode).toBe(200);
    expect(resPage.body.data.page).toBe(1);

    // Price FREE filter
    const resFree = await request(app).get("/api/classes?classTypes=FREE&minPrice=0&maxPrice=5000000");
    expect(resFree.statusCode).toBe(200);
    expect(resFree.body.data.items.length).toBe(1);
    expect(Number(resFree.body.data.items[0].price)).toBe(0);
  });

  // =======================================================================
  // SECTION 2 & 4: ATTENDANCE STATISTICS & CONCURRENCY SPECIALIZED TESTS
  // =======================================================================

  it("STAT-01: Correct statistics when nobody joined (0 PRESENT, 3 ABSENT)", async () => {
    const session = await createActiveSession();
    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);
    expect(res.body.data.attendance).toEqual({ present: 0, absent: 3 });
  });

  it("STAT-02: Correct statistics with 1 PRESENT and 2 not joined", async () => {
    const session = await createActiveSession();
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "PRESENT",
      joinedAt: new Date(),
    });
    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);
    expect(res.body.data.attendance).toEqual({ present: 1, absent: 2 });
  });

  it("STAT-03: Correct statistics with 1 LATE and 2 not joined", async () => {
    const session = await createActiveSession();
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "LATE",
      joinedAt: new Date(),
    });
    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);
    expect(res.body.data.attendance).toEqual({ present: 1, absent: 2 });
  });

  it("STAT-04: Correct statistics when an ABSENT record already existed prior to endSession", async () => {
    const session = await createActiveSession();
    // student1 was pre-marked ABSENT
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "ABSENT",
    });
    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);
    // Must NOT treat existing ABSENT as present!
    expect(res.body.data.attendance).toEqual({ present: 0, absent: 3 });
  });

  it("STAT-05: Attendance from unconfirmed enrollment does not distort class attendance count", async () => {
    const session = await createActiveSession();
    // student4 is CANCELLED but has an attendance record
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student4._id,
      attendanceStatus: "PRESENT",
    });
    const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(res.statusCode).toBe(200);
    // Only the 3 CONFIRMED enrollments are counted in class attendance
    expect(res.body.data.attendance).toEqual({ present: 0, absent: 3 });
  });

  it("CONC-E: MongoDB WriteConflict is caught and auto-retried by withTransaction", async () => {
    const session = await createActiveSession();

    let attempts = 0;
    const originalBulkWrite = SessionAttendance.bulkWrite;
    SessionAttendance.bulkWrite = async function (...args) {
      attempts++;
      if (attempts === 1) {
        // Create real MongoServerError with TransientTransactionError label
        const error = new mongoose.mongo.MongoServerError({ message: "WriteConflict" });
        error.addErrorLabel("TransientTransactionError");
        throw error;
      }
      return originalBulkWrite.apply(this, args);
    };

    try {
      const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
      expect(res.statusCode).toBe(200);
      expect(attempts).toBeGreaterThanOrEqual(2); // Proves withTransaction retried the callback!
      expect(res.body.data.status).toBe("COMPLETED");
    } finally {
      SessionAttendance.bulkWrite = originalBulkWrite;
    }
  });
});
