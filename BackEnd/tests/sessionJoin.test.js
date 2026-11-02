const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}

const request = require("supertest");
const app = require("../src/app");
const { User, Category, Subject, Course, Class, Session, Enrollment, SessionAttendance } = require("../src/models");
const studentService = require("../src/services/studentService");
const storageService = require("../src/services/storageService");
const profileService = require("../src/services/profileService");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("TIN-03A: Session Join, canJoin status & GET side effect regression suite", () => {
  let admin, teacher, teacher2, student, student2, cls;

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
      teacherProfile: { fullName: "Teacher Lead", verificationStatus: "VERIFIED" },
    });
    teacher2 = await User.create({
      email: "teacher2@test.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Teacher Other", verificationStatus: "VERIFIED" },
    });
    student = await User.create({
      email: "student@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student One" },
    });
    student2 = await User.create({
      email: "student2@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student Two" },
    });

    const category = await Category.create({ name: "IT", slug: "it", createdBy: admin._id });
    const subject = await Subject.create({
      name: "Lap trinh",
      slug: "lap-trinh",
      categoryId: category._id,
      categoryName: "IT",
      createdBy: admin._id,
    });
    const course = await Course.create({
      title: "NodeJS",
      slug: "nodejs",
      categoryId: category._id,
      categoryName: "IT",
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: admin._id,
    });
    cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher Lead",
      categoryId: category._id,
      subjectId: subject._id,
      className: "NodeJS co ban",
      classType: "FREE",
      price: 0,
      capacity: 10,
      status: "OPEN",
    });

    // Student 1 has CONFIRMED enrollment in cls
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
    });
  });

  // TC-01: Session CANCELLED trong time window. Expected: canJoin = false.
  it("TC-01: Session CANCELLED in time window has canJoin = false", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Cancelled Session",
      status: "CANCELLED",
      startDatetime: new Date(Date.now() + 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 65 * 60 * 1000),
    });

    const list = await studentService.getMySessions(student._id);
    const item = list.find((s) => s.id === session._id.toString());
    expect(item).toBeDefined();
    expect(item.status).toBe("CANCELLED");
    expect(item.canJoin).toBe(false);
  });

  // TC-02: Session COMPLETED trong time window. Expected: canJoin = false.
  it("TC-02: Session COMPLETED in time window has canJoin = false", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Completed Session",
      status: "COMPLETED",
      startDatetime: new Date(Date.now() - 10 * 60 * 1000),
      endDatetime: new Date(Date.now() + 50 * 60 * 1000),
    });

    const list = await studentService.getMySessions(student._id);
    const item = list.find((s) => s.id === session._id.toString());
    expect(item).toBeDefined();
    expect(item.status).toBe("COMPLETED");
    expect(item.canJoin).toBe(false);
  });

  // TC-03: Session SCHEDULED, chưa tới join window. Expected: canJoin = false.
  it("TC-03: Session SCHEDULED before join window (>15 mins) has canJoin = false", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Future Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() + 45 * 60 * 1000),
      endDatetime: new Date(Date.now() + 105 * 60 * 1000),
    });

    const list = await studentService.getMySessions(student._id);
    const item = list.find((s) => s.id === session._id.toString());
    expect(item).toBeDefined();
    expect(item.canJoin).toBe(false);
  });

  // TC-04: Session SCHEDULED, trong join window. Expected: canJoin = true.
  it("TC-04: Session SCHEDULED inside join window (within 15 mins) has canJoin = true", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Soon Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() + 10 * 60 * 1000),
      endDatetime: new Date(Date.now() + 70 * 60 * 1000),
    });

    const list = await studentService.getMySessions(student._id);
    const item = list.find((s) => s.id === session._id.toString());
    expect(item).toBeDefined();
    expect(item.canJoin).toBe(true);
  });

  // TC-05: Session IN_PROGRESS, trong join window. Expected: canJoin = true.
  it("TC-05: Session IN_PROGRESS inside window has canJoin = true", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Live Session",
      status: "IN_PROGRESS",
      startDatetime: new Date(Date.now() - 10 * 60 * 1000),
      endDatetime: new Date(Date.now() + 50 * 60 * 1000),
    });

    const list = await studentService.getMySessions(student._id);
    const item = list.find((s) => s.id === session._id.toString());
    expect(item).toBeDefined();
    expect(item.canJoin).toBe(true);
  });

  // TC-06: GET /api/student/sessions/:id/join không ghi Attendance.
  it("TC-06: GET /api/sessions/:id/join is rejected with 405 and records NO Attendance", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Active Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    const res = await request(app).get(`/api/sessions/${session._id}/join`).set(as(student));
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe("METHOD_NOT_ALLOWED");

    const attendanceCount = await SessionAttendance.countDocuments({ sessionId: session._id });
    expect(attendanceCount).toBe(0);
  });

  // TC-07: GET /api/student/sessions/:id/join không thay đổi meetingRoomId.
  it("TC-07: GET /api/sessions/:id/join does not mutate session meetingRoomId", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "No Room Session",
      status: "SCHEDULED",
      meetingRoomId: null,
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    await request(app).get(`/api/sessions/${session._id}/join`).set(as(student));
    const reloaded = await Session.findById(session._id);
    expect(reloaded.meetingRoomId).toBeFalsy();
  });

  // TC-08: POST /api/sessions/:id/join với Student hợp lệ giữ nguyên chức năng join.
  it("TC-08: POST /api/sessions/:id/join works as expected for confirmed student", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Valid Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student));
    expect(res.statusCode).toBe(200);
    expect(res.body.data.role).toBe("PARTICIPANT");
    expect(res.body.data.accessToken).toBeDefined();

    const attendance = await SessionAttendance.findOne({ sessionId: session._id, studentId: student._id });
    expect(attendance).toBeDefined();
    expect(attendance.attendanceStatus).toBe("PRESENT");
  });

  // TC-09: Student chưa ghi danh không được cấp quyền join.
  it("TC-09: Student without enrollment is rejected with 403 NOT_ENROLLED", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Enrolled Only",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student2));
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("NOT_ENROLLED");
  });

  // TC-10: Student PENDING_PAYMENT không được cấp quyền join.
  it("TC-10: Student with PENDING_PAYMENT is rejected with 403 NOT_ENROLLED", async () => {
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student2._id,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
    });

    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Pending Payment Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student2));
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("NOT_ENROLLED");
  });

  // TC-11: Student CANCELLED Enrollment không được cấp quyền join.
  it("TC-11: Student with CANCELLED enrollment is rejected with 403 NOT_ENROLLED", async () => {
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student2._id,
      enrollmentStatus: "CANCELLED",
      paymentSource: "DIRECT_PAYMENT",
    });

    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Cancelled Enrollment Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student2));
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("NOT_ENROLLED");
  });

  // TC-12: Teacher khác lớp bị từ chối.
  it("TC-12: Teacher of another class is rejected with 403 FORBIDDEN", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Teacher Ownership Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher2));
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });

  // TC-13: Session COMPLETED gọi POST join bị từ chối.
  it("TC-13: Session COMPLETED called with POST join is rejected with 409 SESSION_ENDED", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Ended Session",
      status: "COMPLETED",
      startDatetime: new Date(Date.now() - 50 * 60 * 1000),
      endDatetime: new Date(Date.now() + 10 * 60 * 1000),
    });

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student));
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("SESSION_ENDED");
  });

  // TC-14: Session CANCELLED gọi POST join bị từ chối.
  it("TC-14: Session CANCELLED called with POST join is rejected with 409 SESSION_CANCELLED", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Cancelled POST Session",
      status: "CANCELLED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student));
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("SESSION_CANCELLED");
  });

  // TC-15: Join nhiều lần không tạo bản ghi Attendance trùng.
  it("TC-15: Repeated join calls do not duplicate attendance records", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Idempotent Join Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    const join1 = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student));
    expect(join1.statusCode).toBe(200);

    const join2 = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student));
    expect(join2.statusCode).toBe(200);

    const count = await SessionAttendance.countDocuments({ sessionId: session._id, studentId: student._id });
    expect(count).toBe(1);
  });

  // TC-16: Regression TIN-01 Avatar. Expected: PASS.
  it("TC-16: TIN-01 regression - user without embedded profile can upload avatar without PROFILE_NOT_EDITABLE", async () => {
    const rawStudent = await User.create({ email: "raw_student@test.com", passwordHash: hashPassword("password123"), role: "STUDENT" });
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("test png")]);
    const res = await request(app)
      .post("/api/me/avatar")
      .set(as(rawStudent))
      .attach("file", PNG, { filename: "me.png", contentType: "image/png" });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.avatarUrl).toMatch(/\/uploads\/avatar\//);
  });

  // TC-17: Regression TIN-02A JPG Upload. Expected: PASS.
  it("TC-17: TIN-02A regression - storageService / upload avatar accepts MIME image/jpg", async () => {
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("test jpeg data")]);
    const res = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", JPEG, { filename: "photo.jpg", contentType: "image/jpg" });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.avatarUrl).toMatch(/\.jpg$/);
  });

  // TC-18: Kiểm tra canJoin và joinSession có khác nhau về giới hạn thời gian kết thúc hay không.
  it("TC-18: canJoin and joinSession both reject joins when now > endDatetime", async () => {
    // Session that ended 5 minutes ago
    const pastSession = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Past Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 65 * 60 * 1000),
      endDatetime: new Date(Date.now() - 5 * 60 * 1000),
    });

    // 1. studentService.getMySessions calculates canJoin
    const list = await studentService.getMySessions(student._id, new Date(Date.now() - 2 * 3600 * 1000));
    const item = list.find((s) => s.id === pastSession._id.toString());
    expect(item).toBeDefined();
    expect(item.canJoin).toBe(false);

    // 2. POST /api/sessions/:id/join also rejects with 409 SESSION_NOT_JOINABLE
    const res = await request(app).post(`/api/sessions/${pastSession._id}/join`).set(as(student));
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("SESSION_NOT_JOINABLE");
  });

  describe("TIN-03A Final Verification: Deep Zero Side Effects & Cases A, B, C, D", () => {
    // Section 3 Deep Verification
    it("VERIFY-01: Deep check GET /api/sessions/:id/join has absolute zero side effects", async () => {
      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Side Effect Verification Session",
        status: "SCHEDULED",
        meetingRoomId: null,
        recording: null,
        startDatetime: new Date(Date.now() - 5 * 60 * 1000),
        endDatetime: new Date(Date.now() + 55 * 60 * 1000),
      });

      const initialSession = await Session.findById(session._id).lean();
      const initialAttendanceCount = await SessionAttendance.countDocuments({});

      // Execute GET request
      const res = await request(app).get(`/api/sessions/${session._id}/join`).set(as(student));

      // 1. HTTP status
      expect(res.statusCode).toBe(405);
      // 2. Error code
      expect(res.body.error).toBe("METHOD_NOT_ALLOWED");
      // 3. SessionAttendance count before & after
      const afterAttendanceCount = await SessionAttendance.countDocuments({});
      expect(afterAttendanceCount).toBe(initialAttendanceCount);
      // 4. meetingRoomId before & after
      const afterSession = await Session.findById(session._id).lean();
      expect(afterSession.meetingRoomId).toBeFalsy();
      // 5. Session updatedAt before & after
      expect(afterSession.updatedAt.getTime()).toBe(initialSession.updatedAt.getTime());
      // 6. No LiveKit token issued
      expect(res.body.data).toBeUndefined();
      // 7. No recording created
      expect(afterSession.recording).toBeNull();
    });

    it("VERIFY-02: Deep check GET /api/student/sessions/:id/join also has zero side effects and returns 405", async () => {
      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Student Route Side Effect Session",
        status: "SCHEDULED",
        meetingRoomId: null,
        startDatetime: new Date(Date.now() - 5 * 60 * 1000),
        endDatetime: new Date(Date.now() + 55 * 60 * 1000),
      });

      const countBefore = await SessionAttendance.countDocuments({});
      const res = await request(app).get(`/api/student/sessions/${session._id}/join`).set(as(student));
      expect(res.statusCode).toBe(405);
      expect(res.body.error).toBe("METHOD_NOT_ALLOWED");
      const countAfter = await SessionAttendance.countDocuments({});
      expect(countAfter).toBe(countBefore);
    });

    // Section 4 Verification: CASE A
    it("CASE A: Session SCHEDULED, startDatetime and endDatetime in past", async () => {
      const sessionA = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Case A Past Scheduled Session",
        status: "SCHEDULED",
        startDatetime: new Date(Date.now() - 60 * 60 * 1000),
        endDatetime: new Date(Date.now() - 10 * 60 * 1000),
      });

      // 1. getMySessions canJoin check
      const list = await studentService.getMySessions(student._id, new Date(Date.now() - 2 * 3600 * 1000));
      const item = list.find((s) => s.id === sessionA._id.toString());
      expect(item).toBeDefined();
      expect(item.canJoin).toBe(false);

      // 2. POST joinSession call
      const countBefore = await SessionAttendance.countDocuments({});
      const res = await request(app).post(`/api/sessions/${sessionA._id}/join`).set(as(student));
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("SESSION_NOT_JOINABLE");

      // 3. Attendance changed?
      const countAfter = await SessionAttendance.countDocuments({});
      expect(countAfter).toBe(countBefore);

      // 4. Token issued?
      expect(res.body.data?.accessToken).toBeUndefined();
    });

    // Section 4 Verification: CASE B
    it("CASE B: Session IN_PROGRESS, startDatetime and endDatetime in past, teacher has NOT called endSession", async () => {
      const sessionB = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Case B Past In-Progress Session",
        status: "IN_PROGRESS",
        meetingRoomId: "room_case_b",
        startDatetime: new Date(Date.now() - 90 * 60 * 1000),
        endDatetime: new Date(Date.now() - 15 * 60 * 1000),
      });

      // 1. getMySessions canJoin check
      const list = await studentService.getMySessions(student._id, new Date(Date.now() - 2 * 3600 * 1000));
      const item = list.find((s) => s.id === sessionB._id.toString());
      expect(item).toBeDefined();
      expect(item.canJoin).toBe(false);

      // 2. POST joinSession call
      const countBefore = await SessionAttendance.countDocuments({});
      const res = await request(app).post(`/api/sessions/${sessionB._id}/join`).set(as(student));
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("SESSION_NOT_JOINABLE");

      // 3. Attendance changed?
      const countAfter = await SessionAttendance.countDocuments({});
      expect(countAfter).toBe(countBefore);

      // 4. Token issued?
      expect(res.body.data?.accessToken).toBeUndefined();
    });

    // Section 4 Verification: CASE C
    it("CASE C: Session COMPLETED, endDatetime in past", async () => {
      const sessionC = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Case C Completed Session",
        status: "COMPLETED",
        meetingRoomId: "room_case_c",
        startDatetime: new Date(Date.now() - 90 * 60 * 1000),
        endDatetime: new Date(Date.now() - 15 * 60 * 1000),
      });

      // 1. getMySessions canJoin check
      const list = await studentService.getMySessions(student._id, new Date(Date.now() - 2 * 3600 * 1000));
      const item = list.find((s) => s.id === sessionC._id.toString());
      expect(item).toBeDefined();
      expect(item.canJoin).toBe(false);

      // 2. POST joinSession call (status COMPLETED checked before time window)
      const countBefore = await SessionAttendance.countDocuments({});
      const res = await request(app).post(`/api/sessions/${sessionC._id}/join`).set(as(student));
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("SESSION_ENDED");

      // 3. Attendance changed?
      const countAfter = await SessionAttendance.countDocuments({});
      expect(countAfter).toBe(countBefore);

      // 4. Token issued?
      expect(res.body.data?.accessToken).toBeUndefined();
    });

    // Section 4 Verification: CASE D
    it("CASE D: Session CANCELLED, endDatetime in future", async () => {
      const sessionD = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Case D Cancelled Session",
        status: "CANCELLED",
        startDatetime: new Date(Date.now() + 10 * 60 * 1000),
        endDatetime: new Date(Date.now() + 70 * 60 * 1000),
      });

      // 1. getMySessions canJoin check
      const list = await studentService.getMySessions(student._id);
      const item = list.find((s) => s.id === sessionD._id.toString());
      expect(item).toBeDefined();
      expect(item.canJoin).toBe(false);

      // 2. POST joinSession call (status CANCELLED checked before time window)
      const countBefore = await SessionAttendance.countDocuments({});
      const res = await request(app).post(`/api/sessions/${sessionD._id}/join`).set(as(student));
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("SESSION_CANCELLED");

      // 3. Attendance changed?
      const countAfter = await SessionAttendance.countDocuments({});
      expect(countAfter).toBe(countBefore);

      // 4. Token issued?
      expect(res.body.data?.accessToken).toBeUndefined();
    });
  });
});
