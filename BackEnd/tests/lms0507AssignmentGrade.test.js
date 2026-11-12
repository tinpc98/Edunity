const os = require("os");
const path = require("path");
const fs = require("fs");

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-lms0507-"));

const request = require("supertest");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Enrollment,
  Assignment,
  Submission,
  Grade,
  GradeHistory,
  Notification,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const DAY = 24 * 60 * 60 * 1000;

let admin;
let teacher1;
let teacher2;
let student1;
let student2;
let tokens;
let class1;

const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });
const stripOrigin = (url) => String(url).replace(/^https?:\/\/[^/]+/, "");

const uploadPrivatePdf = async (roleKey) => {
  const res = await request(app)
    .post("/api/uploads/private")
    .set(as(roleKey))
    .field("purpose", "INCIDENT_EVIDENCE")
    .attach("file", PDF_BYTES, { filename: "homework.pdf", contentType: "application/pdf" });
  expect(res.statusCode).toBe(201);
  return res.body.data;
};

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

afterAll(disconnectDB);

beforeEach(async () => {
  await clearDB();
  const make = (email, role, extra = {}) =>
    User.create({ email, passwordHash: hashPassword("password1"), role, status: "ACTIVE", ...extra });

  admin = await make("admin@lms05.test", "ADMIN");
  teacher1 = await make("t1@lms05.test", "TEACHER", {
    teacherProfile: { fullName: "Giao Vien 1", verificationStatus: "VERIFIED" },
  });
  teacher2 = await make("t2@lms05.test", "TEACHER", {
    teacherProfile: { fullName: "Giao Vien 2", verificationStatus: "VERIFIED" },
  });
  student1 = await make("s1@lms05.test", "STUDENT", { studentProfile: { fullName: "Hoc Vien 1" } });
  student2 = await make("s2@lms05.test", "STUDENT", { studentProfile: { fullName: "Hoc Vien 2" } });

  tokens = {
    admin: signAccessToken(admin),
    teacher1: signAccessToken(teacher1),
    teacher2: signAccessToken(teacher2),
    student1: signAccessToken(student1),
    student2: signAccessToken(student2),
  };

  const category = await Category.create({ name: "Van", slug: "van", createdBy: admin._id });
  const subject = await Subject.create({
    categoryId: category._id,
    categoryName: category.name,
    name: "Ngu Van",
    slug: "ngu-van",
    createdBy: admin._id,
  });
  const course = await Course.create({
    subjectId: subject._id,
    subjectName: subject.name,
    categoryId: category._id,
    categoryName: category.name,
    title: "Ngu Van 9",
    slug: "ngu-van-9",
    level: "BEGINNER",
    gradeLevel: "GRADE_9",
    createdBy: admin._id,
  });

  class1 = await Class.create({
    courseId: course._id,
    courseTitle: course.title,
    teacherId: teacher1._id,
    teacherName: "Giao Vien 1",
    categoryId: category._id,
    subjectId: subject._id,
    gradeLevel: "GRADE_9",
    level: "BEGINNER",
    className: "Lop Van 9A",
    classType: "FREE",
    price: 0,
    capacity: 20,
    status: "IN_PROGRESS",
  });

  await Enrollment.create({
    classId: class1._id,
    courseId: course._id,
    teacherId: teacher1._id,
    studentId: student1._id,
    enrollmentStatus: "CONFIRMED",
    paymentSource: "FREE",
  });
});

describe("LMS-05 & LMS-07: Assignments, Submissions, Grading, Rubric & Append-Only GradeHistory", () => {
  it("handles assignment lifecycle, submission statuses (open/submitted/late/graded), file ownership, idempotency & no auto late-penalty", async () => {
    const s1File = await uploadPrivatePdf("student1");
    const s2File = await uploadPrivatePdf("student2");

    // Create assignment in DRAFT with optional rubric matching maxScore = 10
    const created = await request(app)
      .post(`/api/teacher/classes/${class1._id}/assignments`)
      .set(as("teacher1"))
      .send({
        title: "Bai luan giua ky",
        description: "Viet bai luan 500 tu",
        dueAt: new Date(Date.now() - 3600000).toISOString(), // already past due to test late status cleanly
        allowLateSubmission: true,
        maxAttempts: 2,
        maxScore: 10,
        rubricCriteria: [
          { criterionCode: "CONTENT", title: "Noi dung", maxPoints: 6 },
          { criterionCode: "STYLE", title: "Trinh bay", maxPoints: 4 },
        ],
      });
    expect(created.statusCode).toBe(201);
    const assignmentId = created.body.data.id;

    // Student cannot see DRAFT assignment
    expect((await request(app).get(`/api/me/assignments/${assignmentId}`).set(as("student1"))).statusCode).toBe(404);

    // Publish assignment
    const published = await request(app)
      .post(`/api/teacher/assignments/${assignmentId}/publish`)
      .set(as("teacher1"));
    expect(published.statusCode).toBe(200);
    expect(published.body.data.status).toBe("PUBLISHED");

    // Student1 sees studentStatus = "open" before any submission
    const s1View = await request(app).get(`/api/me/assignments/${assignmentId}`).set(as("student1"));
    expect(s1View.statusCode).toBe(200);
    expect(s1View.body.data.studentStatus).toBe("open");
    expect(s1View.body.data.isPastDue).toBe(true);

    // Unenrolled student2 blocked (403)
    const s2Submit = await request(app)
      .post(`/api/me/assignments/${assignmentId}/submissions`)
      .set(as("student2"))
      .send({ textAnswer: "Unenrolled try" });
    expect(s2Submit.statusCode).toBe(403);

    // Student1 cannot attach Student2's uploaded private file
    const spoofedSubmit = await request(app)
      .post(`/api/me/assignments/${assignmentId}/submissions`)
      .set(as("student1"))
      .send({ attachments: [{ storageKey: s2File.storageKey, originalName: "stolen.pdf" }] });
    expect(spoofedSubmit.statusCode).toBe(400);

    // Student1 submits late with Idempotency-Key + own attachment -> status "late", currentScore: null (no auto deduction!)
    const submitRes = await request(app)
      .post(`/api/me/assignments/${assignmentId}/submissions`)
      .set({ ...as("student1"), "Idempotency-Key": "sub-attempt-1" })
      .send({
        textAnswer: "Bai lam hoan chinh cua hoc vien 1",
        attachments: [{ storageKey: s1File.storageKey, mimeType: s1File.mimeType, originalName: "homework.pdf" }],
      });
    expect(submitRes.statusCode).toBe(201);
    expect(submitRes.body.data.status).toBe("late");
    expect(submitRes.body.data.isLate).toBe(true);
    expect(submitRes.body.data.lateSeconds).toBeGreaterThan(0);
    expect(submitRes.body.data.currentScore).toBeNull();
    expect(submitRes.body.data.attemptNumber).toBe(1);
    const submissionId = submitRes.body.data.id;

    // Replay same Idempotency-Key returns same submission idempotently (no attempt #2 created!)
    const replayRes = await request(app)
      .post(`/api/me/assignments/${assignmentId}/submissions`)
      .set({ ...as("student1"), "Idempotency-Key": "sub-attempt-1" })
      .send({
        textAnswer: "Bai lam hoan chinh cua hoc vien 1",
        attachments: [{ storageKey: s1File.storageKey, mimeType: s1File.mimeType, originalName: "homework.pdf" }],
      });
    expect(replayRes.statusCode).toBe(201);
    expect(replayRes.body.data.idempotent).toBe(true);
    expect(replayRes.body.data.attemptNumber).toBe(1);
    expect(await Submission.countDocuments({ assignmentId, studentId: student1._id })).toBe(1);

    // Teacher views submissions and downloads student attachment signed URL cleanly
    const tSubs = await request(app).get(`/api/teacher/assignments/${assignmentId}/submissions`).set(as("teacher1"));
    expect(tSubs.statusCode).toBe(200);
    expect(tSubs.body.data.total).toBe(1);
    const dlRes = await request(app).get(stripOrigin(tSubs.body.data.items[0].attachments[0].downloadUrl));
    expect(dlRes.statusCode).toBe(200);

    // Teacher2 cannot view or grade Student1's submission
    expect((await request(app).get(`/api/teacher/submissions/${submissionId}`).set(as("teacher2"))).statusCode).toBe(403);
    expect(
      (await request(app).post(`/api/teacher/submissions/${submissionId}/grade`).set(as("teacher2")).send({ score: 8 })).statusCode
    ).toBe(403);

    // Rubric mismatch rejected cleanly
    const badRubric = await request(app)
      .post(`/api/teacher/submissions/${submissionId}/grade`)
      .set(as("teacher1"))
      .send({
        score: 9,
        rubricBreakdown: [
          { criterionCode: "CONTENT", score: 5 },
          { criterionCode: "STYLE", score: 3 },
        ],
      });
    expect(badRubric.statusCode).toBe(400);
    expect(badRubric.body.error).toBe("RUBRIC_SCORE_MISMATCH");

    // Initial Grade succeeds (Rev 1): 8.5/10 WITHOUT any auto penalty subtracted from late submission!
    const graded = await request(app)
      .post(`/api/teacher/submissions/${submissionId}/grade`)
      .set(as("teacher1"))
      .send({
        feedback: "Lap luan tot, chu y trinh bay",
        rubricBreakdown: [
          { criterionCode: "CONTENT", score: 5.5, comment: "Y sau sac" },
          { criterionCode: "STYLE", score: 3, comment: "Can chia doan" },
        ],
      });
    expect(graded.statusCode).toBe(201);
    expect(graded.body.data.grade.score).toBe(8.5);
    expect(graded.body.data.grade.revisionNumber).toBe(1);
    expect(graded.body.data.submissionStatus).toBe("graded");

    // Duplicate POST /grade without regrade endpoint returns 409 ALREADY_GRADED
    const dupGrade = await request(app)
      .post(`/api/teacher/submissions/${submissionId}/grade`)
      .set(as("teacher1"))
      .send({ score: 9 });
    expect(dupGrade.statusCode).toBe(409);

    // Regrade without reason -> 400
    const noReasonRegrade = await request(app)
      .patch(`/api/teacher/submissions/${submissionId}/grade`)
      .set(as("teacher1"))
      .send({ score: 9.5, rubricBreakdown: [{ criterionCode: "CONTENT", score: 6 }, { criterionCode: "STYLE", score: 3.5 }] });
    expect(noReasonRegrade.statusCode).toBe(400);

    // Regrade with reason -> Rev 2 atomic sync across Grade, GradeHistory, Submission
    const regraded = await request(app)
      .patch(`/api/teacher/submissions/${submissionId}/grade`)
      .set(as("teacher1"))
      .send({
        feedback: "Bo sung diem y phan tich",
        reason: "Hoc sinh bo sung dan chung hop le",
        rubricBreakdown: [
          { criterionCode: "CONTENT", score: 6, comment: "Dat toi da" },
          { criterionCode: "STYLE", score: 3.5, comment: "Tot" },
        ],
      });
    expect(regraded.statusCode).toBe(200);
    expect(regraded.body.data.grade.score).toBe(9.5);
    expect(regraded.body.data.grade.status).toBe("REGRADED");
    expect(regraded.body.data.grade.revisionNumber).toBe(2);

    // Verify consistency across Submission, Grade, and append-only GradeHistory
    const dbSub = await Submission.findById(submissionId).lean();
    const dbGrade = await Grade.findOne({ submissionId }).lean();
    const dbHistory = await GradeHistory.find({ submissionId }).sort({ revisionNumber: 1 }).lean();
    expect(dbSub.status).toBe("graded");
    expect(dbSub.currentScore).toBe(9.5);
    expect(dbGrade.score).toBe(9.5);
    expect(dbHistory).toHaveLength(2);
    expect(dbHistory[0].action).toBe("INITIAL_GRADE");
    expect(dbHistory[0].newScore).toBe(8.5);
    expect(dbHistory[1].action).toBe("REGRADE");
    expect(dbHistory[1].previousScore).toBe(8.5);
    expect(dbHistory[1].newScore).toBe(9.5);
    expect(dbHistory[1].reason).toBe("Hoc sinh bo sung dan chung hop le");

    // GradeHistory append-only guard blocks updates and deletes at Mongoose level!
    await expect(GradeHistory.updateOne({ _id: dbHistory[0]._id }, { $set: { newScore: 0 } })).rejects.toMatchObject({
      code: "GRADE_HISTORY_IMMUTABLE",
    });
    await expect(GradeHistory.findOneAndUpdate({ _id: dbHistory[0]._id }, { $set: { reason: "tampered" } })).rejects.toMatchObject({
      code: "GRADE_HISTORY_IMMUTABLE",
    });
    await expect(GradeHistory.deleteOne({ _id: dbHistory[0]._id })).rejects.toMatchObject({
      code: "GRADE_HISTORY_IMMUTABLE",
    });

    // Student & Admin grade views work cleanly and respect RBAC
    const myGrade = await request(app).get(`/api/me/submissions/${submissionId}/grade`).set(as("student1"));
    expect(myGrade.statusCode).toBe(200);
    expect(myGrade.body.data.grade.score).toBe(9.5);
    expect(myGrade.body.data.grade.history).toHaveLength(2);
    expect(myGrade.body.data.grade.teacherName).toBe("Giao Vien 1");
    expect(JSON.stringify(myGrade.body)).not.toContain(admin._id.toString());

    const adminAudit = await request(app).get(`/api/admin/submissions/${submissionId}/grade-history`).set(as("admin"));
    expect(adminAudit.statusCode).toBe(200);
    expect(adminAudit.body.data.history).toHaveLength(2);
    expect(await Notification.countDocuments({ userId: student1._id, type: { $in: ["ASSIGNMENT_GRADED", "ASSIGNMENT_REGRADED"] } })).toBe(2);
  });

  it("blocks late submission when allowLateSubmission=false and prevents exceeding maxAttempts under concurrent requests", async () => {
    const strictClosed = await request(app)
      .post(`/api/teacher/classes/${class1._id}/assignments`)
      .set(as("teacher1"))
      .send({
        title: "Bai kiem tra nhanh",
        dueAt: new Date(Date.now() - 60000).toISOString(),
        allowLateSubmission: false,
        maxAttempts: 1,
        status: "PUBLISHED",
      });
    const lateReject = await request(app)
      .post(`/api/me/assignments/${strictClosed.body.data.id}/submissions`)
      .set(as("student1"))
      .send({ textAnswer: "Too late" });
    expect(lateReject.statusCode).toBe(409);
    expect(lateReject.body.error).toBe("LATE_SUBMISSION_NOT_ALLOWED");

    const concurrentAssignment = await request(app)
      .post(`/api/teacher/classes/${class1._id}/assignments`)
      .set(as("teacher1"))
      .send({
        title: "Bai tap 1 lan nop",
        dueAt: new Date(Date.now() + DAY).toISOString(),
        allowLateSubmission: false,
        maxAttempts: 1,
        status: "PUBLISHED",
      });
    const aid = concurrentAssignment.body.data.id;

    const [r1, r2] = await Promise.all([
      request(app).post(`/api/me/assignments/${aid}/submissions`).set(as("student1")).send({ textAnswer: "Lan 1" }),
      request(app).post(`/api/me/assignments/${aid}/submissions`).set(as("student1")).send({ textAnswer: "Lan 1b" }),
    ]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    expect(await Submission.countDocuments({ assignmentId: aid, studentId: student1._id })).toBe(1);
  });
});

