const request = require("supertest");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  Enrollment,
  SessionAttendance,
  Review,
  SessionReview,
  TeacherViolation,
  TeacherDisciplineCase,
  TeacherEarning,
  Notification,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

let admin;
let teacher1;
let teacher2;
let studentAttended;
let studentAbsent;
let studentUnenrolled;
let tokens;
let cls;
let completedSession;
let scheduledSession;
let cancelledSession;
let enrollmentAttended;
let enrollmentAbsent;
let attendancePresent;

const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

afterAll(disconnectDB);

beforeEach(async () => {
  await clearDB();
  const make = (email, role, extra = {}) =>
    User.create({ email, passwordHash: hashPassword("password1"), role, status: "ACTIVE", ...extra });

  admin = await make("admin@lms10.test", "ADMIN");
  teacher1 = await make("t1@lms10.test", "TEACHER", {
    teacherProfile: { fullName: "Teacher Review 1", verificationStatus: "VERIFIED" },
  });
  teacher2 = await make("t2@lms10.test", "TEACHER", {
    teacherProfile: { fullName: "Teacher Review 2", verificationStatus: "VERIFIED" },
  });
  studentAttended = await make("s_ok@lms10.test", "STUDENT", {
    studentProfile: { fullName: "Student Attended" },
  });
  studentAbsent = await make("s_abs@lms10.test", "STUDENT", {
    studentProfile: { fullName: "Student Absent" },
  });
  studentUnenrolled = await make("s_stranger@lms10.test", "STUDENT", {
    studentProfile: { fullName: "Stranger" },
  });

  tokens = {
    admin: signAccessToken(admin),
    teacher1: signAccessToken(teacher1),
    teacher2: signAccessToken(teacher2),
    studentAttended: signAccessToken(studentAttended),
    studentAbsent: signAccessToken(studentAbsent),
    studentUnenrolled: signAccessToken(studentUnenrolled),
  };

  const category = await Category.create({ name: "Ly", slug: "ly", createdBy: admin._id });
  const subject = await Subject.create({
    categoryId: category._id,
    categoryName: category.name,
    name: "Vat Ly",
    slug: "vat-ly",
    createdBy: admin._id,
  });
  const course = await Course.create({
    subjectId: subject._id,
    subjectName: subject.name,
    categoryId: category._id,
    categoryName: category.name,
    title: "Vat Ly 10",
    slug: "vat-ly-10",
    level: "BEGINNER",
    gradeLevel: "GRADE_10",
    createdBy: admin._id,
  });

  cls = await Class.create({
    courseId: course._id,
    courseTitle: course.title,
    teacherId: teacher1._id,
    teacherName: "Teacher Review 1",
    categoryId: category._id,
    subjectId: subject._id,
    gradeLevel: "GRADE_10",
    level: "BEGINNER",
    className: "Lop Vat Ly 10A",
    classType: "FREE",
    price: 0,
    capacity: 20,
    status: "IN_PROGRESS",
  });

  completedSession = await Session.create({
    classId: cls._id,
    className: cls.className,
    teacherId: teacher1._id,
    title: "Buoi 1: Co hoc",
    startDatetime: new Date(NOW - 3 * HOUR),
    endDatetime: new Date(NOW - 2 * HOUR),
    actualStartAt: new Date(NOW - 3 * HOUR),
    actualEndAt: new Date(NOW - 2 * HOUR),
    status: "COMPLETED",
    lifecycleState: "COMPLETED",
    attendanceFinalizedAt: new Date(NOW - 2 * HOUR),
  });

  scheduledSession = await Session.create({
    classId: cls._id,
    className: cls.className,
    teacherId: teacher1._id,
    title: "Buoi 2: Chua dien ra",
    startDatetime: new Date(NOW + 2 * HOUR),
    endDatetime: new Date(NOW + 3 * HOUR),
    status: "SCHEDULED",
    lifecycleState: "SCHEDULED",
  });

  cancelledSession = await Session.create({
    classId: cls._id,
    className: cls.className,
    teacherId: teacher1._id,
    title: "Buoi 3: Bi huy",
    startDatetime: new Date(NOW - 5 * HOUR),
    endDatetime: new Date(NOW - 4 * HOUR),
    status: "CANCELLED",
    lifecycleState: "CANCELLED",
  });

  enrollmentAttended = await Enrollment.create({
    classId: cls._id,
    courseId: course._id,
    teacherId: teacher1._id,
    studentId: studentAttended._id,
    enrollmentStatus: "CONFIRMED",
    paymentSource: "FREE",
  });

  enrollmentAbsent = await Enrollment.create({
    classId: cls._id,
    courseId: course._id,
    teacherId: teacher1._id,
    studentId: studentAbsent._id,
    enrollmentStatus: "CONFIRMED",
    paymentSource: "FREE",
  });

  attendancePresent = await SessionAttendance.create({
    sessionId: completedSession._id,
    classId: cls._id,
    studentId: studentAttended._id,
    attendanceStatus: "PRESENT",
    hasVerifiedConnection: true,
    evaluationStatus: "FINALIZED",
  });

  await SessionAttendance.create({
    sessionId: completedSession._id,
    classId: cls._id,
    studentId: studentAbsent._id,
    attendanceStatus: "ABSENT",
    hasVerifiedConnection: false,
    evaluationStatus: "FINALIZED",
  });
});

describe("LMS-10: Session & Class Reviews, Participation Verification & Traceability", () => {
  it("enforces completed session timing, verified SessionAttendance participation, anti-duplicate, traceability & zero disciplinary impact", async () => {
    // 1. Pre-completion or CANCELLED sessions cannot be reviewed
    const beforeEnd = await request(app)
      .post(`/api/sessions/${scheduledSession._id}/reviews`)
      .set(as("studentAttended"))
      .send({ rating: 5, comment: "Review qua som" });
    expect(beforeEnd.statusCode).toBe(409);
    expect(beforeEnd.body.error).toBe("SESSION_REVIEW_NOT_OPEN");

    const cancelled = await request(app)
      .post(`/api/sessions/${cancelledSession._id}/reviews`)
      .set(as("studentAttended"))
      .send({ rating: 2, comment: "Buoi huy" });
    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.body.error).toBe("SESSION_REVIEW_NOT_OPEN");

    // 2. Unenrolled student blocked (403)
    const unenrolled = await request(app)
      .post(`/api/sessions/${completedSession._id}/reviews`)
      .set(as("studentUnenrolled"))
      .send({ rating: 5, comment: "Nguoi la" });
    expect(unenrolled.statusCode).toBe(403);
    expect(unenrolled.body.error).toBe("REVIEW_NOT_ALLOWED");

    // 3. Enrolled student marked ABSENT with no verified connection blocked (403)!
    const absentTry = await request(app)
      .post(`/api/sessions/${completedSession._id}/reviews`)
      .set(as("studentAbsent"))
      .send({ rating: 1, comment: "Khong di hoc nhung danh gia 1 sao" });
    expect(absentTry.statusCode).toBe(403);
    expect(absentTry.body.error).toBe("REVIEW_NOT_ALLOWED");

    // Same ABSENT student is also blocked from Class review when attendance was finalized and they never attended!
    const absentClassReview = await request(app)
      .post(`/api/classes/${cls._id}/reviews`)
      .set(as("studentAbsent"))
      .send({ rating: 1, comment: "Chua tham gia buoi nao" });
    expect(absentClassReview.statusCode).toBe(403);
    expect(absentClassReview.body.error).toBe("REVIEW_NOT_ALLOWED");

    // 4. Attended student submits low SessionReview (1 star) -> succeeds cleanly with full traceability, ZERO teacher discipline/earning penalty!
    const okReview = await request(app)
      .post(`/api/sessions/${completedSession._id}/reviews`)
      .set(as("studentAttended"))
      .send({
        rating: 1,
        teacherPreparednessRating: 2,
        clarityRating: 2,
        comment: "Can giang cham hon mot chut",
      });
    expect(okReview.statusCode).toBe(201);
    expect(okReview.body.data.sessionId).toBe(completedSession._id.toString());
    expect(okReview.body.data.classId).toBe(cls._id.toString());
    expect(okReview.body.data.enrollmentId).toBe(enrollmentAttended._id.toString());
    expect(okReview.body.data.attendanceId).toBe(attendancePresent._id.toString());
    expect(okReview.body.data.attendanceStatusSnapshot).toBe("PRESENT");

    // Verify zero TeacherViolation, TeacherDisciplineCase, TeacherEarning mutations created by low review
    expect(await TeacherViolation.countDocuments({ teacherId: teacher1._id })).toBe(0);
    expect(await TeacherDisciplineCase.countDocuments({ teacherId: teacher1._id })).toBe(0);
    expect(await TeacherEarning.countDocuments({ teacherId: teacher1._id })).toBe(0);
    expect(await Notification.countDocuments({ userId: teacher1._id, type: "SESSION_REVIEW_CREATED" })).toBe(1);

    // 5. Duplicate SessionReview rejected (409 DUPLICATE_REVIEW)
    const dupSessionReview = await request(app)
      .post(`/api/sessions/${completedSession._id}/reviews`)
      .set(as("studentAttended"))
      .send({ rating: 5, comment: "Review lan 2" });
    expect(dupSessionReview.statusCode).toBe(409);
    expect(dupSessionReview.body.error).toBe("DUPLICATE_REVIEW");

    // 6. Reading session reviews respects RBAC and masks student email
    const sList = await request(app).get(`/api/sessions/${completedSession._id}/reviews`).set(as("studentAttended"));
    expect(sList.statusCode).toBe(200);
    expect(sList.body.data.total).toBe(1);
    expect(sList.body.data.ratingAverage).toBe(1);
    expect(JSON.stringify(sList.body)).not.toContain("s_ok@lms10.test");

    // Teacher2 cannot inspect Teacher1's session reviews; studentUnenrolled cannot inspect
    expect((await request(app).get(`/api/sessions/${completedSession._id}/reviews`).set(as("teacher2"))).statusCode).toBe(403);
    expect((await request(app).get(`/api/sessions/${completedSession._id}/reviews`).set(as("studentUnenrolled"))).statusCode).toBe(403);

    // 7. Backwards-compatible Class-level Review succeeds independently for studentAttended and updates Class/Teacher rating aggregates
    const clsRev = await request(app)
      .post(`/api/classes/${cls._id}/reviews`)
      .set(as("studentAttended"))
      .send({ rating: 5, comment: "Tong the lop hoc rat bo ich" });
    expect(clsRev.statusCode).toBe(201);
    expect(await Review.countDocuments({ classId: cls._id })).toBe(1);
    expect(await SessionReview.countDocuments({ classId: cls._id })).toBe(1);

    const publicClassReviews = await request(app).get(`/api/classes/${cls._id}/reviews`);
    expect(publicClassReviews.statusCode).toBe(200);
    expect(publicClassReviews.body.data.ratingAverage).toBe(5);
    expect(publicClassReviews.body.data.ratingCount).toBe(1);
    expect(publicClassReviews.body.data.sessionReviewSummary).toEqual({ ratingAverage: 1, ratingCount: 1 });

    // 8. Admin can soft-delete a violating SessionReview while keeping traceability record + AuditLog
    const adminDel = await request(app)
      .delete(`/api/admin/session-reviews/${okReview.body.data.id}`)
      .set(as("admin"))
      .send({ reason: "Spam review" });
    expect(adminDel.statusCode).toBe(200);
    const afterDel = await request(app).get(`/api/sessions/${completedSession._id}/reviews`).set(as("admin"));
    expect(afterDel.body.data.total).toBe(0);
    expect(afterDel.body.data.ratingCount).toBe(0);
  });
});

