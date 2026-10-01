const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  Enrollment,
  Payment,
  Scholarship,
  ScholarshipCampaign,
  ScholarshipUsage,
  TeacherEarning,
  Transaction,
  AuditLog,
  Notification,
  SessionAttendance,
} = require("../src/models");
const { runJob } = require("../src/jobs/expireEnrollmentsJob");
const { verifyRoomToken } = require("../src/utils/roomToken");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const DAY = 24 * 60 * 60 * 1000;
const as = (user) => ({ "x-user-id": user._id.toString() });
const dec = (value) => mongoose.Types.Decimal128.fromString(String(value));

const PDF = Buffer.from("%PDF-1.4\n% test document\n");
const stripOrigin = (url) => new URL(url).pathname + new URL(url).search;

// Uploads a private document as `user` and returns its storage key
const uploadDoc = async (user, purpose) => {
  const res = await request(app)
    .post("/api/uploads/private")
    .set(as(user))
    .field("purpose", purpose)
    .attach("file", PDF, { filename: "document.pdf", contentType: "application/pdf" });
  if (res.statusCode !== 201) throw new Error("upload failed: " + JSON.stringify(res.body));
  return res.body.data.storageKey;
};
const proofFor = async (user) => [{ files: [{ storageKey: await uploadDoc(user, "SCHOLARSHIP_PROOF"), mimeType: "application/pdf" }] }];

let admin, teacher, otherTeacher, student, student2, sponsor;
let category, subject, course;

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

afterAll(async () => {
  await disconnectDB();
});

beforeEach(async () => {
  await clearDB();

  admin = await User.create({ email: "admin@test.com", passwordHash: "x", role: "ADMIN" });
  teacher = await User.create({
    email: "teacher@test.com",
    passwordHash: "x",
    role: "TEACHER",
    teacherProfile: { fullName: "Teacher One", verificationStatus: "VERIFIED" },
  });
  otherTeacher = await User.create({
    email: "teacher2@test.com",
    passwordHash: "x",
    role: "TEACHER",
    teacherProfile: { fullName: "Teacher Two", verificationStatus: "VERIFIED" },
  });
  student = await User.create({ email: "s1@test.com", passwordHash: "x", role: "STUDENT", studentProfile: { fullName: "Student One" } });
  student2 = await User.create({ email: "s2@test.com", passwordHash: "x", role: "STUDENT", studentProfile: { fullName: "Student Two" } });
  sponsor = await User.create({
    email: "sponsor@test.com",
    passwordHash: "x",
    role: "SPONSOR",
    sponsorProfile: { sponsorType: "ORGANIZATION", representativeName: "Sponsor One" },
  });

  category = await Category.create({ name: "Trung học cơ sở", slug: "trung-hoc-co-so", createdBy: admin._id });
  subject = await Subject.create({
    name: "Toán",
    slug: "toan",
    categoryId: category._id,
    categoryName: category.name,
    createdBy: admin._id,
  });
  course = await Course.create({
    title: "Toán 6",
    slug: "toan-6",
    categoryId: category._id,
    categoryName: category.name,
    subjectId: subject._id,
    subjectName: subject.name,
    gradeLevel: "GRADE_6",
    createdBy: admin._id,
  });
});

const createOpenClass = (price, overrides = {}) =>
  Class.create({
    courseId: course._id,
    courseTitle: course.title,
    teacherId: teacher._id,
    teacherName: "Teacher One",
    categoryId: category._id,
    subjectId: subject._id,
    className: "Lớp Toán 6",
    classType: price > 0 ? "PAID" : "FREE",
    price,
    capacity: 10,
    status: "OPEN",
    ...overrides,
  });

describe("Auth", () => {
  it("registers TEACHER and SPONSOR, never ADMIN", async () => {
    const t = await request(app).post("/api/auth/register").send({ fullName: "New Teacher", email: "nt@test.com", password: "secret1", role: "TEACHER" });
    expect(t.statusCode).toBe(201);
    const created = await User.findOne({ email: "nt@test.com" });
    expect(created.teacherProfile.verificationStatus).toBe("UNVERIFIED");

    const s = await request(app).post("/api/auth/register").send({ fullName: "New Sponsor", email: "ns@test.com", password: "secret1", role: "SPONSOR" });
    expect(s.statusCode).toBe(201);
    expect(s.body.data.fullName).toBe("New Sponsor");

    const a = await request(app).post("/api/auth/register").send({ fullName: "Hacker", email: "h@test.com", password: "secret1", role: "ADMIN" });
    expect(a.statusCode).toBe(400);
  });

  it("login issues a refresh token that rotates and can be revoked", async () => {
    await request(app).post("/api/auth/register").send({ fullName: "Stu", email: "stu@test.com", password: "secret1", role: "STUDENT" });

    const bad = await request(app).post("/api/auth/login").send({ email: "stu@test.com", password: "wrong" });
    expect(bad.statusCode).toBe(401);

    const login = await request(app).post("/api/auth/login").send({ email: "stu@test.com", password: "secret1" });
    expect(login.statusCode).toBe(200);
    // a real JWT, not the dev token
    expect(jwt.decode(login.body.data.accessToken).role).toBe("STUDENT");
    expect(login.body.data.expiresIn).toBe("15m");
    const firstToken = login.body.data.refreshToken;

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(me.body.data.email).toBe("stu@test.com");

    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken: firstToken });
    expect(refreshed.statusCode).toBe(200);
    const secondToken = refreshed.body.data.refreshToken;
    expect(secondToken).not.toBe(firstToken);

    // the rotated token is dead, and reusing it revokes the whole family
    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken: firstToken });
    expect(reuse.statusCode).toBe(401);
    const afterReuse = await request(app).post("/api/auth/refresh").send({ refreshToken: secondToken });
    expect(afterReuse.statusCode).toBe(401);

    const login2 = await request(app).post("/api/auth/login").send({ email: "stu@test.com", password: "secret1" });
    const logout = await request(app).post("/api/auth/logout").send({ refreshToken: login2.body.data.refreshToken });
    expect(logout.statusCode).toBe(200);
    const afterLogout = await request(app).post("/api/auth/refresh").send({ refreshToken: login2.body.data.refreshToken });
    expect(afterLogout.statusCode).toBe(401);
  });
});

describe("Catalog", () => {
  it("admin manages categories, subjects and courses; gradeLevel must match the category", async () => {
    const forbidden = await request(app).post("/api/admin/categories").set(as(student)).send({ name: "X" });
    expect(forbidden.statusCode).toBe(403);

    const cat = await request(app).post("/api/admin/categories").set(as(admin)).send({ name: "Ngoại ngữ" });
    expect(cat.statusCode).toBe(201);
    expect(cat.body.data.slug).toBe("ngoai-ngu");
    expect(cat.body.data.allowedGradeLevels).toBeNull();

    const dup = await request(app).post("/api/admin/categories").set(as(admin)).send({ name: "ngoại ngữ" });
    expect(dup.statusCode).toBe(409);

    const sub = await request(app).post("/api/admin/subjects").set(as(admin)).send({ categoryId: cat.body.data.id, name: "Tiếng Anh" });
    expect(sub.statusCode).toBe(201);
    expect(sub.body.data.categoryName).toBe("Ngoại ngữ");

    const renamed = await request(app).patch(`/api/admin/categories/${cat.body.data.id}`).set(as(admin)).send({ name: "Ngôn ngữ" });
    expect(renamed.statusCode).toBe(200);
    expect((await Subject.findById(sub.body.data.id)).categoryName).toBe("Ngôn ngữ");

    const list = await request(app).get("/api/categories");
    expect(list.body.data).toHaveLength(2);
    const thcs = list.body.data.find((c) => c.slug === "trung-hoc-co-so");
    expect(thcs.allowedGradeLevels).toEqual(["GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"]);

    const subjects = await request(app).get(`/api/categories/${category._id}/subjects`);
    expect(subjects.body.data).toHaveLength(1);
    const subjectDetail = await request(app).get(`/api/subjects/${subject._id}`);
    expect(subjectDetail.body.data.courses).toHaveLength(1);

    // BR-45: GRADE_12 does not belong to "Trung học cơ sở"
    const mismatch = await request(app).post("/api/admin/courses").set(as(admin)).send({ subjectId: subject._id, title: "Toán 12", gradeLevel: "GRADE_12" });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.body.error).toBe("GRADE_LEVEL_CATEGORY_MISMATCH");

    const created = await request(app).post("/api/admin/courses").set(as(admin)).send({ subjectId: subject._id, title: "Toán 7", gradeLevel: "GRADE_7", level: "BEGINNER" });
    expect(created.statusCode).toBe(201);

    const ielts = await request(app).post("/api/admin/courses").set(as(admin)).send({ subjectId: sub.body.data.id, title: "IELTS 6.5" });
    expect(ielts.statusCode).toBe(201);
    expect(ielts.body.data.gradeLevel).toBeNull();

    const byGrade = await request(app).get("/api/courses?gradeLevel=GRADE_6");
    expect(byGrade.body.data.total).toBe(1);
    expect(byGrade.body.data.items[0].title).toBe("Toán 6");
    const invalidGrade = await request(app).get("/api/courses?gradeLevel=GRADE_99");
    expect(invalidGrade.statusCode).toBe(400);
    const search = await request(app).get("/api/courses?search=ielts");
    expect(search.body.data.total).toBe(1);

    await createOpenClass(0);
    await createOpenClass(0, { status: "DRAFT", className: "Draft" });
    const detail = await request(app).get(`/api/courses/${course._id}`);
    expect(detail.body.data.openClassCount).toBe(1);
    const classes = await request(app).get(`/api/courses/${course._id}/classes`);
    expect(classes.body.data.total).toBe(1);
  });

  it("teacher proposes a course and admin approves it into the catalog", async () => {
    const otherCategory = await Category.create({ name: "IT", slug: "it", createdBy: admin._id });

    const wrongSubject = await request(app)
      .post("/api/teacher/course-proposals")
      .set(as(teacher))
      .send({ categoryId: otherCategory._id, subjectId: subject._id, title: "X", description: "d" });
    expect(wrongSubject.body.error).toBe("SUBJECT_CATEGORY_MISMATCH");

    const wrongGrade = await request(app)
      .post("/api/teacher/course-proposals")
      .set(as(teacher))
      .send({ categoryId: category._id, subjectId: subject._id, title: "Toán 10", description: "d", gradeLevel: "GRADE_10" });
    expect(wrongGrade.statusCode).toBe(400);

    const proposal = await request(app)
      .post("/api/teacher/course-proposals")
      .set(as(teacher))
      .send({ categoryId: category._id, subjectId: subject._id, title: "Toán 8 nâng cao", description: "d", gradeLevel: "GRADE_8", level: "ADVANCED" });
    expect(proposal.statusCode).toBe(201);
    expect(proposal.body.data.status).toBe("PENDING_REVIEW");
    expect(await Notification.countDocuments({ userId: admin._id })).toBe(1);

    const pending = await request(app).get("/api/admin/course-proposals?status=PENDING_REVIEW").set(as(admin));
    expect(pending.body.data.total).toBe(1);
    expect(pending.body.data.items[0].teacherName).toBe("Teacher One");

    const changes = await request(app).post(`/api/admin/course-proposals/${proposal.body.data.id}/request-changes`).set(as(admin)).send({ reviewNote: "Bổ sung syllabus" });
    expect(changes.body.data.status).toBe("NEED_CHANGES");

    const resubmitted = await request(app).patch(`/api/teacher/course-proposals/${proposal.body.data.id}`).set(as(teacher)).send({ syllabus: "Chương 1..." });
    expect(resubmitted.body.data.status).toBe("PENDING_REVIEW");

    const approved = await request(app).post(`/api/admin/course-proposals/${proposal.body.data.id}/approve`).set(as(admin)).send({});
    expect(approved.statusCode).toBe(200);
    expect(approved.body.data.proposal.status).toBe("APPROVED");
    expect(approved.body.data.course.gradeLevel).toBe("GRADE_8");
    expect(approved.body.data.course.sourceProposalId).toBe(proposal.body.data.id);

    const again = await request(app).post(`/api/admin/course-proposals/${proposal.body.data.id}/approve`).set(as(admin)).send({});
    expect(again.statusCode).toBe(409);
    expect(await AuditLog.countDocuments({ action: "COURSE_PROPOSAL_APPROVED" })).toBe(1);
  });
});

describe("Public catalog", () => {
  it("exposes only verified teachers, with their profile fields", async () => {
    await User.updateOne({ _id: teacher._id }, { $set: { "teacherProfile.biography": "10 năm dạy Toán", "teacherProfile.reviewNote": "internal" } });
    await User.create({ email: "unverified@test.com", passwordHash: "x", role: "TEACHER", teacherProfile: { fullName: "Unverified" } });

    const list = await request(app).get("/api/teachers?limit=10");
    expect(list.body.data.map((t) => t.fullName).sort()).toEqual(["Teacher One", "Teacher Two"]);
    expect(list.body.data[0].passwordHash).toBeUndefined();
    expect(list.body.data[0].teacherProfile).toBeUndefined();

    await createOpenClass(0);
    const detail = await request(app).get(`/api/teachers/${teacher._id}`);
    expect(detail.body.data.fullName).toBe("Teacher One");
    expect(detail.body.data.biography).toBe("10 năm dạy Toán");
    expect(detail.body.data.reviewNote).toBeUndefined();
    expect(detail.body.data.classes).toHaveLength(1);

    const unverified = await User.findOne({ email: "unverified@test.com" });
    const hidden = await request(app).get(`/api/teachers/${unverified._id}`);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.body.error).toBe("TEACHER_NOT_FOUND");
    expect(hidden.body.message).toBe("Teacher not found");
  });

  it("never exposes classes that are not approved yet", async () => {
    const open = await createOpenClass(0);
    const hiddenClasses = [];
    for (const status of ["DRAFT", "PENDING_APPROVAL", "REJECTED"]) {
      hiddenClasses.push(await createOpenClass(0, { status, className: status }));
    }

    const detail = await request(app).get(`/api/classes/${open._id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.body.data.teacher.fullName).toBe("Teacher One");

    const forced = await request(app).get("/api/classes?statuses=DRAFT,PENDING_APPROVAL,REJECTED");
    expect(forced.body.data.total).toBe(0);
    const mixed = await request(app).get("/api/classes?statuses=DRAFT,OPEN");
    expect(mixed.body.data.total).toBe(1);
    expect((await request(app).get("/api/classes")).body.data.total).toBe(1);

    for (const cls of hiddenClasses) {
      const res = await request(app).get(`/api/classes/${cls._id}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe("CLASS_NOT_FOUND");
      expect((await request(app).get(`/api/classes/${cls._id}/sessions`)).statusCode).toBe(404);
    }
    expect((await request(app).get(`/api/classes/${open._id}/sessions`)).statusCode).toBe(200);
  });

  it("GET /sessions/:id/join returns a room token instead of a meeting URL", async () => {
    const cls = await createOpenClass(0);
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Buổi 1",
      startDatetime: new Date(Date.now() - 60000),
      endDatetime: new Date(Date.now() + 3600000),
    });

    const notEnrolled = await request(app).get(`/api/sessions/${session._id}/join`).set(as(student));
    expect(notEnrolled.statusCode).toBe(403);
    expect(notEnrolled.body.error).toBe("NOT_ENROLLED");
    const byTeacher = await request(app).get(`/api/sessions/${session._id}/join`).set(as(teacher));
    expect(byTeacher.statusCode).toBe(403);
    expect(byTeacher.body.error).toBe("FORBIDDEN");

    await request(app).post(`/api/classes/${cls._id}/enrollments`).set(as(student));
    const joined = await request(app).get(`/api/sessions/${session._id}/join`).set(as(student));
    expect(joined.statusCode).toBe(200);
    expect(joined.body.data.joinUrl).toBeUndefined();
    expect(joined.body.data.role).toBe("PARTICIPANT");
    expect(verifyRoomToken(joined.body.data.accessToken).sessionId).toBe(session._id.toString());
  });
});

describe("Teacher verification, class approval and classroom", () => {
  it("runs the whole class lifecycle", async () => {
    const newTeacher = await User.create({ email: "new@test.com", passwordHash: "x", role: "TEACHER", teacherProfile: { fullName: "New Teacher" } });
    const start = new Date(Date.now() - 5 * 60 * 1000);
    const end = new Date(Date.now() + 60 * 60 * 1000);
    const classBody = {
      courseId: course._id,
      className: "Toán 6 - Tối thứ 2",
      classType: "PAID",
      price: 500000,
      capacity: 5,
    };

    // BR-01: an unverified teacher cannot create a class
    const blocked = await request(app).post("/api/teacher/classes").set(as(newTeacher)).send(classBody);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.body.error).toBe("TEACHER_NOT_VERIFIED");

    const noQualification = await request(app)
      .post("/api/teacher/verification")
      .set(as(newTeacher))
      .send({ documents: [{ documentType: "IDENTITY", files: [{ side: "FRONT", storageKey: "private/id-front.png" }] }] });
    expect(noQualification.statusCode).toBe(400);

    const submitted = await request(app)
      .post("/api/teacher/verification")
      .set(as(newTeacher))
      .send({
        qualificationSummary: "Cử nhân Sư phạm Toán",
        documents: [
          {
            documentType: "IDENTITY",
            files: [
              { side: "FRONT", storageKey: await uploadDoc(newTeacher, "IDENTITY") },
              { side: "BACK", storageKey: await uploadDoc(newTeacher, "IDENTITY") },
            ],
          },
          { documentType: "QUALIFICATION", files: [{ storageKey: await uploadDoc(newTeacher, "QUALIFICATION") }] },
        ],
      });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.body.data.verificationStatus).toBe("PENDING");

    const queue = await request(app).get("/api/admin/teacher-verifications").set(as(admin));
    expect(queue.body.data.total).toBe(1);
    const verified = await request(app).post(`/api/admin/teacher-verifications/${newTeacher._id}/approve`).set(as(admin)).send({});
    expect(verified.body.data.verificationStatus).toBe("VERIFIED");
    expect(verified.body.data.documents.every((d) => d.status === "APPROVED")).toBe(true);

    // BR-09 / BR-10
    const freeWithPrice = await request(app).post("/api/teacher/classes").set(as(newTeacher)).send({ ...classBody, classType: "FREE" });
    expect(freeWithPrice.statusCode).toBe(400);

    // BR-47: a new class is a DRAFT, with catalog data copied from the Course
    const created = await request(app).post("/api/teacher/classes").set(as(newTeacher)).send(classBody);
    expect(created.statusCode).toBe(201);
    expect(created.body.data.status).toBe("DRAFT");
    expect(created.body.data.gradeLevel).toBe("GRADE_6");
    expect(created.body.data.teacherName).toBe("New Teacher");
    expect(created.body.data.price).toBe("500000");
    const classId = created.body.data.id;

    // BR-15
    const notOwner = await request(app).patch(`/api/teacher/classes/${classId}`).set(as(teacher)).send({ capacity: 9 });
    expect(notOwner.statusCode).toBe(403);

    // BR-48: cannot submit an incomplete class
    const incomplete = await request(app).post(`/api/teacher/classes/${classId}/submit`).set(as(newTeacher));
    expect(incomplete.statusCode).toBe(400);
    expect(incomplete.body.details.missing).toEqual(expect.arrayContaining(["description", "startDate", "schedule", "sessions"]));

    const updated = await request(app)
      .patch(`/api/teacher/classes/${classId}`)
      .set(as(newTeacher))
      .send({
        description: "Lớp ôn tập Toán 6",
        enrollmentStart: new Date(Date.now() - DAY),
        enrollmentEnd: new Date(Date.now() + 7 * DAY),
        startDate: new Date(Date.now() - DAY),
        endDate: new Date(Date.now() + 30 * DAY),
        schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      });
    expect(updated.statusCode).toBe(200);

    const planned = await request(app).get(`/api/teacher/classes/${classId}/planned-sessions`).set(as(newTeacher));
    expect(planned.body.data.length).toBeGreaterThanOrEqual(4);
    expect(new Date(planned.body.data[0].startDatetime).getUTCHours()).toBe(12); // 19:00 UTC+7

    // BR-32
    const outOfRange = await request(app)
      .post(`/api/teacher/classes/${classId}/sessions`)
      .set(as(newTeacher))
      .send({ title: "Quá hạn", startDatetime: new Date(Date.now() + 60 * DAY), endDatetime: new Date(Date.now() + 60 * DAY + 3600000) });
    expect(outOfRange.body.error).toBe("SESSION_OUT_OF_CLASS_RANGE");

    const sessions = await request(app)
      .post(`/api/teacher/classes/${classId}/sessions`)
      .set(as(newTeacher))
      .send({
        sessions: [
          { title: "Buổi 1 - Số tự nhiên", startDatetime: start, endDatetime: end },
          { title: "Buổi 2 - Phân số", startDatetime: new Date(Date.now() + 7 * DAY), endDatetime: new Date(Date.now() + 7 * DAY + 7200000) },
        ],
      });
    expect(sessions.statusCode).toBe(201);
    expect(sessions.body.data).toHaveLength(2);
    const sessionId = sessions.body.data[0].id;

    const edited = await request(app).patch(`/api/teacher/sessions/${sessions.body.data[1].id}`).set(as(newTeacher)).send({ title: "Buổi 2 - Phân số (tt)" });
    expect(edited.body.data.title).toBe("Buổi 2 - Phân số (tt)");

    // BR-49
    const submit = await request(app).post(`/api/teacher/classes/${classId}/submit`).set(as(newTeacher));
    expect(submit.statusCode).toBe(200);
    expect(submit.body.data.status).toBe("PENDING_APPROVAL");

    const locked = await request(app).patch(`/api/teacher/classes/${classId}`).set(as(newTeacher)).send({ capacity: 9 });
    expect(locked.body.error).toBe("CLASS_NOT_EDITABLE");
    const notOpen = await request(app).post(`/api/classes/${classId}/enrollments`).set(as(student));
    expect(notOpen.body.error).toBe("CLASS_NOT_OPEN");

    // BR-50
    const teacherApprove = await request(app).post(`/api/admin/classes/${classId}/approve`).set(as(newTeacher));
    expect(teacherApprove.statusCode).toBe(403);
    const pending = await request(app).get("/api/admin/classes/pending").set(as(admin));
    expect(pending.body.data.total).toBe(1);
    expect(pending.body.data.items[0].sessionCount).toBe(2);
    const review = await request(app).get(`/api/admin/classes/${classId}`).set(as(admin));
    expect(review.body.data.teacher.verificationStatus).toBe("VERIFIED");
    expect(review.body.data.sessions).toHaveLength(2);

    const rejected = await request(app).post(`/api/admin/classes/${classId}/reject`).set(as(admin)).send({ reviewNote: "Bổ sung mô tả" });
    expect(rejected.body.data.status).toBe("REJECTED");

    // BR-51: REJECTED → edit → resubmit
    const fixed = await request(app).patch(`/api/teacher/classes/${classId}`).set(as(newTeacher)).send({ description: "Mô tả đầy đủ hơn" });
    expect(fixed.statusCode).toBe(200);
    expect(fixed.body.data.status).toBe("REJECTED");
    await request(app).post(`/api/teacher/classes/${classId}/submit`).set(as(newTeacher));

    const approved = await request(app).post(`/api/admin/classes/${classId}/approve`).set(as(admin)).send({});
    expect(approved.body.data.status).toBe("OPEN");
    const twice = await request(app).post(`/api/admin/classes/${classId}/approve`).set(as(admin)).send({});
    expect(twice.body.error).toBe("CLASS_NOT_PENDING_APPROVAL");
    expect(await AuditLog.countDocuments({ targetType: "Class" })).toBe(2);
    expect(await Notification.countDocuments({ userId: newTeacher._id, type: "CLASS_APPROVED" })).toBe(1);

    const mine = await request(app).get("/api/teacher/classes?status=OPEN").set(as(newTeacher));
    expect(mine.body.data.total).toBe(1);

    // Enroll + pay, then the student appears in the teacher's student list
    const enrollment = await request(app).post(`/api/classes/${classId}/enrollments`).set(as(student));
    expect(enrollment.statusCode).toBe(201);
    const payment = await request(app).post(`/api/enrollments/${enrollment.body.data.id}/payments`).set(as(student));
    const status = await request(app).get(`/api/payments/${payment.body.data.paymentId}`).set(as(student));
    expect(status.body.data.paymentStatus).toBe("PENDING");
    const foreign = await request(app).get(`/api/payments/${payment.body.data.paymentId}`).set(as(student2));
    expect(foreign.statusCode).toBe(404);
    const webhook = await request(app).post("/api/payments/webhook").send({ gatewayReference: payment.body.data.gatewayReference, status: "SUCCESS" });
    expect(webhook.body.data.result).toBe("PAYMENT_SUCCESS");

    const students = await request(app).get(`/api/teacher/classes/${classId}/students`).set(as(newTeacher));
    expect(students.body.data).toHaveLength(1);
    expect(students.body.data[0].fullName).toBe("Student One");

    // Review is not allowed before any learning happened (BR-30)
    const early = await request(app).post(`/api/classes/${classId}/reviews`).set(as(student)).send({ rating: 5 });
    expect(early.body.error).toBe("REVIEW_NOT_ALLOWED");

    // Join: BR-12 not enrolled, BR-15 not owner
    const stranger = await request(app).post(`/api/sessions/${sessionId}/join`).set(as(student2));
    expect(stranger.body.error).toBe("NOT_ENROLLED");
    const wrongTeacher = await request(app).post(`/api/sessions/${sessionId}/join`).set(as(teacher));
    expect(wrongTeacher.statusCode).toBe(403);
    const tooEarly = await request(app).post(`/api/sessions/${sessions.body.data[1].id}/join`).set(as(student));
    expect(tooEarly.body.error).toBe("SESSION_NOT_JOINABLE");

    const host = await request(app).post(`/api/sessions/${sessionId}/join`).set(as(newTeacher));
    expect(host.statusCode).toBe(200);
    expect(host.body.data.role).toBe("HOST");
    expect(host.body.data.joinUrl).toBeUndefined();
    expect((await Session.findById(sessionId)).status).toBe("IN_PROGRESS");

    const participant = await request(app).post(`/api/sessions/${sessionId}/join`).set(as(student));
    expect(participant.body.data.roomId).toBe(host.body.data.roomId);
    const token = verifyRoomToken(participant.body.data.accessToken);
    expect(token.role).toBe("PARTICIPANT");
    expect(token.userId).toBe(student._id.toString());
    expect(verifyRoomToken(participant.body.data.accessToken + "x")).toBeNull();

    const ended = await request(app).post(`/api/teacher/sessions/${sessionId}/end`).set(as(newTeacher));
    expect(ended.body.data.status).toBe("COMPLETED");
    expect(await SessionAttendance.countDocuments({ sessionId, attendanceStatus: "PRESENT" })).toBe(1);
    const afterEnd = await request(app).post(`/api/sessions/${sessionId}/join`).set(as(student));
    expect(afterEnd.body.error).toBe("SESSION_ENDED");

    // Reviews
    const invalid = await request(app).post(`/api/classes/${classId}/reviews`).set(as(student)).send({ rating: 9 });
    expect(invalid.statusCode).toBe(400);
    const reviewed = await request(app).post(`/api/classes/${classId}/reviews`).set(as(student)).send({ rating: 4, comment: "Dễ hiểu" });
    expect(reviewed.statusCode).toBe(201);
    const duplicate = await request(app).post(`/api/classes/${classId}/reviews`).set(as(student)).send({ rating: 5 });
    expect(duplicate.body.error).toBe("DUPLICATE_REVIEW");
    const notEnrolled = await request(app).post(`/api/classes/${classId}/reviews`).set(as(student2)).send({ rating: 5 });
    expect(notEnrolled.statusCode).toBe(403);

    const classReviews = await request(app).get(`/api/classes/${classId}/reviews`);
    expect(classReviews.body.data.total).toBe(1);
    expect(classReviews.body.data.ratingAverage).toBe(4);
    expect(classReviews.body.data.items[0].student.fullName).toBe("Student One");
    const teacherReviews = await request(app).get(`/api/teachers/${newTeacher._id}/reviews`);
    expect(teacherReviews.body.data.ratingCount).toBe(1);

    const notifications = await request(app).get("/api/me/notifications?unread=true").set(as(student));
    expect(notifications.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    const readAll = await request(app).post("/api/me/notifications/read-all").set(as(student));
    expect(readAll.body.data.updated).toBe(notifications.body.data.unreadCount);
  });
});

describe("Scholarship campaign, contribution, application and usage", () => {
  const campaignBody = () => ({
    title: "Học bổng Toán THCS",
    description: "Hỗ trợ học sinh khó khăn",
    eligibilityCriteria: "Hộ nghèo",
    targetBudget: 1000000,
    expectedSlots: 2,
    awardAmountPerStudent: 300000,
    fundingStart: new Date(Date.now() - DAY),
    fundingEnd: new Date(Date.now() + 30 * DAY),
    applicationStart: new Date(Date.now() - DAY),
    applicationEnd: new Date(Date.now() + 30 * DAY),
    scope: { courseIds: [course._id] },
  });

  const openCampaign = async () => {
    const created = await request(app).post("/api/admin/campaigns").set(as(admin)).send(campaignBody());
    await request(app).post(`/api/admin/campaigns/${created.body.data.id}/publish`).set(as(admin));
    return created.body.data.id;
  };

  const contribute = async (campaignId, amount) => {
    const intent = await request(app).post(`/api/campaigns/${campaignId}/contributions`).set(as(sponsor)).send({ amount });
    await request(app).post("/api/payments/webhook").send({ gatewayReference: intent.body.data.gatewayReference, status: "SUCCESS" });
    return intent;
  };

  const award = async (campaignId, user) => {
    const application = await request(app).post(`/api/campaigns/${campaignId}/applications`).set(as(user)).send({ statement: "Hoàn cảnh khó khăn", documents: await proofFor(user) });
    return request(app).post(`/api/admin/scholarship-applications/${application.body.data.id}/approve`).set(as(admin)).send({});
  };

  it("only admin creates campaigns; sponsors fund OPEN campaigns through the webhook", async () => {
    const bySponsor = await request(app).post("/api/admin/campaigns").set(as(sponsor)).send(campaignBody());
    expect(bySponsor.statusCode).toBe(403); // BR-16

    const overBudget = await request(app).post("/api/admin/campaigns").set(as(admin)).send({ ...campaignBody(), expectedSlots: 5 });
    expect(overBudget.statusCode).toBe(400);

    const created = await request(app).post("/api/admin/campaigns").set(as(admin)).send(campaignBody());
    expect(created.statusCode).toBe(201);
    expect(created.body.data.status).toBe("DRAFT");
    const campaignId = created.body.data.id;

    // DRAFT is not public and cannot be funded (BR-17)
    expect((await request(app).get(`/api/campaigns/${campaignId}`)).statusCode).toBe(404);
    expect((await request(app).get("/api/campaigns")).body.data.total).toBe(0);
    const draftFunding = await request(app).post(`/api/campaigns/${campaignId}/contributions`).set(as(sponsor)).send({ amount: 100000 });
    expect(draftFunding.body.error).toBe("CAMPAIGN_NOT_ACCEPTING_FUNDING");

    const patched = await request(app).patch(`/api/admin/campaigns/${campaignId}`).set(as(admin)).send({ title: "Học bổng Toán 6" });
    expect(patched.body.data.title).toBe("Học bổng Toán 6");

    const published = await request(app).post(`/api/admin/campaigns/${campaignId}/publish`).set(as(admin));
    expect(published.body.data.status).toBe("OPEN_FOR_FUNDING");
    const lockedField = await request(app).patch(`/api/admin/campaigns/${campaignId}`).set(as(admin)).send({ awardAmountPerStudent: 1 });
    expect(lockedField.body.error).toBe("CAMPAIGN_FIELD_LOCKED");

    const byStudent = await request(app).post(`/api/campaigns/${campaignId}/contributions`).set(as(student)).send({ amount: 100000 });
    expect(byStudent.statusCode).toBe(403);
    const invalidAmount = await request(app).post(`/api/campaigns/${campaignId}/contributions`).set(as(sponsor)).send({ amount: -5 });
    expect(invalidAmount.statusCode).toBe(400);

    const intent = await request(app).post(`/api/campaigns/${campaignId}/contributions`).set(as(sponsor)).send({ amount: 400000 });
    expect(intent.statusCode).toBe(201);
    expect(intent.body.data.contributionStatus).toBe("PENDING");
    // money is not counted before the gateway confirms it
    expect((await request(app).get(`/api/campaigns/${campaignId}`)).body.data.fundedAmount).toBe("0");
    const noImpactYet = await request(app).get(`/api/sponsor/campaigns/${campaignId}/impact`).set(as(sponsor));
    expect(noImpactYet.statusCode).toBe(403);

    const webhook = await request(app).post("/api/payments/webhook").send({ gatewayReference: intent.body.data.gatewayReference, status: "SUCCESS" });
    expect(webhook.body.data.result).toBe("CONTRIBUTION_SUCCESS");
    const duplicate = await request(app).post("/api/payments/webhook").send({ gatewayReference: intent.body.data.gatewayReference, status: "SUCCESS" });
    expect(duplicate.body.data.result).toBe("IDEMPOTENT");

    const detail = await request(app).get(`/api/campaigns/${campaignId}`);
    expect(detail.body.data.fundedAmount).toBe("400000");
    expect(detail.body.data.availableFund).toBe("400000");
    expect(detail.body.data.fundingProgress).toBe(40);
    expect(detail.body.data.scopeDetail.courses[0].title).toBe("Toán 6");
    expect(await Transaction.countDocuments({ transactionType: "SPONSOR_CONTRIBUTION" })).toBe(1);

    const history = await request(app).get("/api/sponsor/contributions").set(as(sponsor));
    expect(history.body.data.total).toBe(1);
    expect(history.body.data.totalContributed).toBe("400000");
    expect(history.body.data.items[0].campaignTitle).toBe("Học bổng Toán 6");
    const monitor = await request(app).get(`/api/admin/campaigns/${campaignId}/contributions`).set(as(admin));
    expect(monitor.body.data.total).toBe(1);

    const closed = await request(app).post(`/api/admin/campaigns/${campaignId}/close`).set(as(admin));
    expect(closed.body.data.status).toBe("CLOSED");
    const afterClose = await request(app).post(`/api/campaigns/${campaignId}/contributions`).set(as(sponsor)).send({ amount: 100000 });
    expect(afterClose.statusCode).toBe(409);
  });

  it("application review allocates exactly the campaign award, within the available fund", async () => {
    const campaignId = await openCampaign();
    await contribute(campaignId, 400000);

    const noDocs = await request(app).post(`/api/campaigns/${campaignId}/applications`).set(as(student)).send({ statement: "x" });
    expect(noDocs.statusCode).toBe(400);
    const publicUrl = await request(app)
      .post(`/api/campaigns/${campaignId}/applications`)
      .set(as(student))
      .send({ statement: "x", documents: [{ files: [{ storageKey: "https://cdn.example.com/a.pdf" }] }] });
    expect(publicUrl.statusCode).toBe(400);

    // BR-36: an amount sent by the student is ignored
    const applied = await request(app)
      .post(`/api/campaigns/${campaignId}/applications`)
      .set(as(student))
      .send({ statement: "Hoàn cảnh khó khăn", documents: await proofFor(student), amount: 99999999, allocatedAmount: 99999999 });
    expect(applied.statusCode).toBe(201);
    expect(applied.body.data.status).toBe("SUBMITTED");
    expect(applied.body.data.awardAmountPerStudent).toBe("300000");
    const applicationId = applied.body.data.id;

    // BR-29
    const again = await request(app).post(`/api/campaigns/${campaignId}/applications`).set(as(student)).send({ statement: "again", documents: await proofFor(student) });
    expect(again.body.error).toBe("DUPLICATE_APPLICATION");

    const list = await request(app).get("/api/admin/scholarship-applications?status=SUBMITTED").set(as(admin));
    expect(list.body.data.items[0].studentName).toBe("Student One");
    const detail = await request(app).get(`/api/admin/scholarship-applications/${applicationId}`).set(as(admin));
    expect(detail.body.data.documents).toHaveLength(1);

    // NFR-04: the document is only reachable through a short-lived signed URL
    const file = detail.body.data.documents[0].files[0];
    const download = await request(app).get(stripOrigin(file.url));
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe("application/pdf");
    expect(download.body.toString()).toContain("%PDF");
    const tampered = await request(app).get(stripOrigin(file.url).replace(/signature=.{4}/, "signature=0000"));
    expect(tampered.statusCode).toBe(403);

    // a student cannot attach a file uploaded by someone else
    const stolenKey = await request(app)
      .post(`/api/campaigns/${campaignId}/applications`)
      .set(as(student2))
      .send({ statement: "x", documents: [{ files: [{ storageKey: file.storageKey }] }] });
    expect(stolenKey.statusCode).toBe(400);
    const peek = await request(app).get(`/api/admin/scholarship-applications/${applicationId}`).set(as(student2));
    expect(peek.statusCode).toBe(403); // NFR-04

    const needNote = await request(app).post(`/api/admin/scholarship-applications/${applicationId}/request-information`).set(as(admin)).send({});
    expect(needNote.statusCode).toBe(400);
    const needInfo = await request(app).post(`/api/admin/scholarship-applications/${applicationId}/request-information`).set(as(admin)).send({ reviewNote: "Bổ sung giấy xác nhận" });
    expect(needInfo.body.data.status).toBe("NEED_MORE_INFORMATION");
    const notReady = await request(app).post(`/api/admin/scholarship-applications/${applicationId}/approve`).set(as(admin)).send({});
    expect(notReady.statusCode).toBe(409);
    const resubmitted = await request(app)
      .post(`/api/me/scholarship-applications/${applicationId}/resubmit`)
      .set(as(student))
      .send({ documents: await proofFor(student) });
    expect(resubmitted.body.data.status).toBe("SUBMITTED");

    // BR-37: the admin cannot choose the allocation
    const approved = await request(app).post(`/api/admin/scholarship-applications/${applicationId}/approve`).set(as(admin)).send({ allocatedAmount: 999999 });
    expect(approved.statusCode).toBe(200);
    expect(approved.body.data.scholarship.allocatedAmount).toBe("300000");
    expect(approved.body.data.scholarship.remainingAmount).toBe("300000");
    expect((await ScholarshipCampaign.findById(campaignId)).allocatedAmount.toString()).toBe("300000");
    expect(await AuditLog.countDocuments({ action: "SCHOLARSHIP_APPLICATION_APPROVED" })).toBe(1);

    // BR-26: only 100k left unallocated → a second 300k award is refused and nothing changes
    const second = await award(campaignId, student2);
    expect(second.body.error).toBe("INSUFFICIENT_CAMPAIGN_FUND");
    expect(await Scholarship.countDocuments()).toBe(1);
    expect((await ScholarshipCampaign.findById(campaignId)).allocatedAmount.toString()).toBe("300000");

    const rejected = await request(app)
      .post(`/api/admin/scholarship-applications/${(await request(app).get("/api/me/scholarship-applications").set(as(student2))).body.data.items[0].id}/reject`)
      .set(as(admin))
      .send({ reviewNote: "Hết quỹ" });
    expect(rejected.body.data.status).toBe("REJECTED");

    const myApps = await request(app).get("/api/me/scholarship-applications").set(as(student));
    expect(myApps.body.data.items[0].status).toBe("APPROVED");
    const myScholarships = await request(app).get("/api/me/scholarships").set(as(student));
    expect(myScholarships.body.data).toHaveLength(1);
    expect(myScholarships.body.data[0].isUsable).toBe(true);
    expect(await Notification.countDocuments({ userId: student._id, type: "SCHOLARSHIP_APPROVED" })).toBe(1);
  });

  it("scholarship covering the whole tuition confirms the enrollment (SCHOLARSHIP)", async () => {
    const campaignId = await openCampaign();
    await contribute(campaignId, 600000);
    await award(campaignId, student);

    const cls = await createOpenClass(200000);
    const enrollment = await request(app).post(`/api/classes/${cls._id}/enrollments`).set(as(student));
    const staleIntent = await request(app).post(`/api/enrollments/${enrollment.body.data.id}/payments`).set(as(student));

    const paid = await request(app).post(`/api/enrollments/${enrollment.body.data.id}/scholarship-payment`).set(as(student)).send({});
    expect(paid.statusCode).toBe(200);
    expect(paid.body.data.enrollmentStatus).toBe("CONFIRMED");
    expect(paid.body.data.paymentSource).toBe("SCHOLARSHIP");
    expect(paid.body.data.scholarshipAmount).toBe("200000");
    expect(paid.body.data.remainingDue).toBe("0");

    const scholarship = await Scholarship.findOne({ studentId: student._id });
    expect(scholarship.remainingAmount.toString()).toBe("100000");
    expect(scholarship.status).toBe("ACTIVE");
    expect((await ScholarshipCampaign.findById(campaignId)).usedAmount.toString()).toBe("200000");
    expect(await ScholarshipUsage.countDocuments({ status: "CONFIRMED" })).toBe(1);
    expect(await Transaction.countDocuments({ transactionType: "SCHOLARSHIP_USAGE", status: "COMPLETED" })).toBe(1); // BR-28

    // BR-27: teacher still earns, with the platform commission
    const earning = await TeacherEarning.findOne({ enrollmentId: enrollment.body.data.id });
    expect(earning.grossAmount.toString()).toBe("200000");
    expect(earning.commissionAmount.toString()).toBe("20000");
    expect(earning.netAmount.toString()).toBe("180000");

    // the payment intent created before the scholarship is dead
    const late = await request(app).post("/api/payments/webhook").send({ gatewayReference: staleIntent.body.data.gatewayReference, status: "SUCCESS" });
    expect(late.body.data.result).toBe("IDEMPOTENT");
    expect(await TeacherEarning.countDocuments()).toBe(1);

    const twice = await request(app).post(`/api/enrollments/${enrollment.body.data.id}/scholarship-payment`).set(as(student)).send({});
    expect(twice.statusCode).toBe(409);

    const impact = await request(app).get(`/api/sponsor/campaigns/${campaignId}/impact`).set(as(sponsor));
    expect(impact.statusCode).toBe(200);
    expect(impact.body.data.myContribution.total).toBe("600000");
    expect(impact.body.data.impact).toEqual({
      sponsoredStudentCount: 1,
      studentsUsingScholarshipCount: 1,
      enrollmentsFundedCount: 1,
      classesSupportedCount: 1,
    });
    expect(impact.body.data.fundUsage.usedAmount).toBe("200000");
  });

  it("partial scholarship uses MIXED co-payment and confirms only when the remainder is paid", async () => {
    const campaignId = await openCampaign();
    await contribute(campaignId, 600000);
    await award(campaignId, student);

    const cls = await createOpenClass(500000);
    const enrollment = await request(app).post(`/api/classes/${cls._id}/enrollments`).set(as(student));
    const enrollmentId = enrollment.body.data.id;

    const mixed = await request(app).post(`/api/enrollments/${enrollmentId}/scholarship-payment`).set(as(student)).send({});
    expect(mixed.statusCode).toBe(200);
    expect(mixed.body.data.enrollmentStatus).toBe("PENDING_PAYMENT");
    expect(mixed.body.data.paymentSource).toBe("MIXED");
    expect(mixed.body.data.scholarshipAmount).toBe("300000");
    expect(mixed.body.data.remainingDue).toBe("200000");

    // held, not yet officially used
    expect((await Scholarship.findOne({ studentId: student._id })).remainingAmount.toString()).toBe("0");
    expect((await ScholarshipCampaign.findById(campaignId)).usedAmount.toString()).toBe("0");
    expect(await TeacherEarning.countDocuments()).toBe(0);

    const payment = await request(app).post(`/api/enrollments/${enrollmentId}/payments`).set(as(student));
    expect(payment.body.data.amount).toBe("200000");

    const failed = await request(app).post("/api/payments/webhook").send({ gatewayReference: payment.body.data.gatewayReference, status: "FAILED" });
    expect(failed.body.data.enrollmentStatus).toBe("PENDING_PAYMENT");
    const retry = await request(app).post(`/api/enrollments/${enrollmentId}/payments`).set(as(student));
    expect(retry.body.data.amount).toBe("200000");

    const webhook = await request(app).post("/api/payments/webhook").send({ gatewayReference: retry.body.data.gatewayReference, status: "SUCCESS" });
    expect(webhook.body.data.result).toBe("PAYMENT_SUCCESS");

    const confirmed = await Enrollment.findById(enrollmentId);
    expect(confirmed.enrollmentStatus).toBe("CONFIRMED");
    expect(confirmed.paymentSource).toBe("MIXED");
    expect(confirmed.amountPaidViaPayment.toString()).toBe("200000");
    expect(confirmed.amountPaidViaScholarship.toString()).toBe("300000");

    const scholarship = await Scholarship.findOne({ studentId: student._id });
    expect(scholarship.status).toBe("EXHAUSTED");
    expect((await ScholarshipCampaign.findById(campaignId)).usedAmount.toString()).toBe("300000");
    expect(await ScholarshipUsage.countDocuments({ enrollmentId, status: "CONFIRMED" })).toBe(1);
    expect(await Transaction.countDocuments({ relatedEnrollmentId: enrollmentId, status: "COMPLETED" })).toBe(2);

    // Teacher Earning on the whole tuition (BR-41)
    const earning = await TeacherEarning.findOne({ enrollmentId });
    expect(earning.grossAmount.toString()).toBe("500000");
    expect(earning.netAmount.toString()).toBe("450000");
  });

  it("releases the held scholarship when the seat hold expires, and enforces campaign scope", async () => {
    const campaignId = await openCampaign();
    await contribute(campaignId, 600000);
    await award(campaignId, student);

    // BR-24: a class of another course is outside the campaign scope
    const otherCourse = await Course.create({
      title: "Toán 7",
      slug: "toan-7",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: admin._id,
    });
    const outside = await createOpenClass(500000, { courseId: otherCourse._id, className: "Ngoài phạm vi" });
    const outsideEnrollment = await request(app).post(`/api/classes/${outside._id}/enrollments`).set(as(student));
    const noScholarship = await request(app).post(`/api/enrollments/${outsideEnrollment.body.data.id}/scholarship-payment`).set(as(student)).send({});
    expect(noScholarship.body.error).toBe("NO_ELIGIBLE_SCHOLARSHIP");
    const scholarship = await Scholarship.findOne({ studentId: student._id });
    const explicit = await request(app)
      .post(`/api/enrollments/${outsideEnrollment.body.data.id}/scholarship-payment`)
      .set(as(student))
      .send({ scholarshipId: scholarship._id });
    expect(explicit.body.error).toBe("CLASS_OUT_OF_SCHOLARSHIP_SCOPE");

    // someone else's enrollment / scholarship
    const stolen = await request(app).post(`/api/enrollments/${outsideEnrollment.body.data.id}/scholarship-payment`).set(as(student2)).send({});
    expect(stolen.statusCode).toBe(404);

    const cls = await createOpenClass(500000);
    const enrollment = await request(app).post(`/api/classes/${cls._id}/enrollments`).set(as(student));
    await request(app).post(`/api/enrollments/${enrollment.body.data.id}/scholarship-payment`).set(as(student)).send({});
    expect((await Scholarship.findById(scholarship._id)).remainingAmount.toString()).toBe("0");

    await Enrollment.updateOne({ _id: enrollment.body.data.id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await runJob();

    expect((await Enrollment.findById(enrollment.body.data.id)).enrollmentStatus).toBe("EXPIRED");
    expect((await Scholarship.findById(scholarship._id)).remainingAmount.toString()).toBe("300000");
    expect((await ScholarshipUsage.findOne({ enrollmentId: enrollment.body.data.id })).status).toBe("RELEASED");
    expect((await Class.findById(cls._id)).enrolledCount).toBe(0);
    expect((await ScholarshipCampaign.findById(campaignId)).usedAmount.toString()).toBe("0");

    // BR-23: an expired scholarship cannot be used
    await Scholarship.updateOne({ _id: scholarship._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const reEnrollment = await request(app).post(`/api/classes/${cls._id}/enrollments`).set(as(student));
    const expired = await request(app)
      .post(`/api/enrollments/${reEnrollment.body.data.id}/scholarship-payment`)
      .set(as(student))
      .send({ scholarshipId: scholarship._id });
    expect(expired.body.error).toBe("SCHOLARSHIP_EXPIRED");
    expect(await Payment.countDocuments()).toBe(0);
  });
});
