const os = require("os");
const path = require("path");
const fs = require("fs");

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-phase4-"));

const mongoose = require("mongoose");
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
  LearningResource,
  Assignment,
  Submission,
  Grade,
  GradeHistory,
  Assessment,
  Question,
  Attempt,
  PlacementResult,
  AuditLog,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { signAccessToken } = require("../src/utils/jwt");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

describe("Phase 4 Real MongoMemoryReplSet Verification (LMS-03, LMS-05, LMS-07, LMS-08, LMS-01)", () => {
  let admin;
  let teacher1;
  let teacher2;
  let student1;
  let student2;
  let tokens;
  let category;
  let subjectMath;
  let courseMath;
  let courseInt;
  let courseAdv;
  let class1;
  let session1;

  const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
  const stripOrigin = (url) => String(url).replace(/^https?:\/\/[^/]+/, "");

  const uploadPrivatePdf = async (roleKey) => {
    const res = await request(app)
      .post("/api/uploads/private")
      .set(as(roleKey))
      .field("purpose", "INCIDENT_EVIDENCE")
      .attach("file", PDF_BYTES, { filename: "phase4.pdf", contentType: "application/pdf" });
    expect(res.statusCode).toBe(201);
    return res.body.data;
  };

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
    fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearDB();
    const passwordHash = hashPassword("Password@123");

    [admin, teacher1, teacher2, student1, student2] = await User.create([
      { email: "admin_p4@test.com", passwordHash, role: "ADMIN", status: "ACTIVE" },
      {
        email: "teacher1_p4@test.com",
        passwordHash,
        role: "TEACHER",
        status: "ACTIVE",
        teacherProfile: { fullName: "Teacher One P4", verificationStatus: "VERIFIED" },
      },
      {
        email: "teacher2_p4@test.com",
        passwordHash,
        role: "TEACHER",
        status: "ACTIVE",
        teacherProfile: { fullName: "Teacher Two P4", verificationStatus: "VERIFIED" },
      },
      {
        email: "student1_p4@test.com",
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Student One P4" },
      },
      {
        email: "student2_p4@test.com",
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Student Two P4" },
      },
    ]);

    tokens = {
      admin: signAccessToken(admin),
      teacher1: signAccessToken(teacher1),
      teacher2: signAccessToken(teacher2),
      student1: signAccessToken(student1),
      student2: signAccessToken(student2),
    };

    category = await Category.create({ name: "Toan P4", slug: "toan-p4", createdBy: admin._id });
    subjectMath = await Subject.create({
      categoryId: category._id,
      categoryName: category.name,
      name: "Toan Hoc P4",
      slug: "toan-hoc-p4",
      createdBy: admin._id,
    });

    const makeCourse = (title, slug, level) =>
      Course.create({
        subjectId: subjectMath._id,
        subjectName: subjectMath.name,
        categoryId: category._id,
        categoryName: category.name,
        title,
        slug,
        level,
        gradeLevel: "GRADE_10",
        status: "ACTIVE",
        createdBy: admin._id,
      });

    courseMath = await makeCourse("Toan 10 Co Ban", "toan-10-cb", "BEGINNER");
    courseInt = await makeCourse("Toan 10 Trung Cap", "toan-10-tc", "INTERMEDIATE");
    courseAdv = await makeCourse("Toan 10 Nang Cao", "toan-10-nc", "ADVANCED");

    class1 = await Class.create({
      courseId: courseMath._id,
      courseTitle: courseMath.title,
      teacherId: teacher1._id,
      teacherName: "Teacher One P4",
      categoryId: category._id,
      subjectId: subjectMath._id,
      gradeLevel: "GRADE_10",
      level: "BEGINNER",
      className: "Lop Toan 10A",
      classType: "FREE",
      price: 0,
      capacity: 25,
      status: "IN_PROGRESS",
    });

    const tFile = await uploadPrivatePdf("teacher1");
    session1 = await Session.create({
      classId: class1._id,
      className: class1.className,
      teacherId: teacher1._id,
      title: "Buoi 1: Menh de & Tap hop",
      startDatetime: new Date(NOW + DAY),
      endDatetime: new Date(NOW + DAY + 3600000),
      status: "SCHEDULED",
      contents: [
        {
          title: "Slide Menh de",
          type: "LESSON",
          description: "Slide PDF cu",
          storageKey: tFile.storageKey,
          order: 1,
        },
        {
          title: "Bai tap tap hop",
          type: "ASSIGNMENT",
          description: "Lam 5 cau",
          order: 2,
        },
      ],
    });

    await Enrollment.create({
      classId: class1._id,
      courseId: courseMath._id,
      teacherId: teacher1._id,
      studentId: student1._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
    });
  });

  it("LMS-03: serializes delete vs update/delete without resurrection, handles concurrent legacy migration idempotently, and enforces query/status filters", async () => {
    const createRes = await request(app)
      .post("/api/teacher/learning-resources")
      .set(as("teacher1"))
      .send({
        scopeType: "CLASS",
        classId: class1._id.toString(),
        title: "Tai lieu concurrent",
        sourceType: "TEXT_CONTENT",
        contentText: "Noi dung goc",
        status: "DRAFT",
      });
    expect(createRes.statusCode).toBe(201);
    const resId = createRes.body.data.id;

    // Concurrent delete + update: never leaves deleted doc resurrected (isDeleted must stay true, no 500)
    const [delRes, updRes] = await Promise.all([
      request(app).delete(`/api/teacher/learning-resources/${resId}`).set(as("teacher1")),
      request(app).patch(`/api/teacher/learning-resources/${resId}`).set(as("teacher1")).send({ title: "Edited title" }),
    ]);
    expect(delRes.statusCode).toBe(200);
    expect([200, 404]).toContain(updRes.statusCode);
    const afterDb = await LearningResource.findById(resId).lean();
    expect(afterDb.isDeleted).toBe(true);

    // Second delete fails cleanly with 404
    const dupDel = await request(app).delete(`/api/teacher/learning-resources/${resId}`).set(as("teacher1"));
    expect(dupDel.statusCode).toBe(404);

    // Migrate only first legacy item by direct call? Migrate concurrently as teacher & admin -> exact 2 docs created once
    const [mig1, mig2] = await Promise.all([
      request(app).post(`/api/teacher/sessions/${session1._id}/learning-resources/migrate`).set(as("teacher1")).send({}),
      request(app).post(`/api/admin/sessions/${session1._id}/learning-resources/migrate`).set(as("admin")).send({}),
    ]);
    expect(mig1.statusCode).toBe(200);
    expect(mig2.statusCode).toBe(200);
    expect(await LearningResource.countDocuments({ sessionId: session1._id, ...{ isDeleted: { $ne: true } } })).toBe(2);
    expect(await AuditLog.countDocuments({ action: "LEARNING_RESOURCE_MIGRATE_SESSION", targetId: session1._id })).toBe(1);

    // Filtering by ?status=DRAFT after migration must NOT resurrect published migrated docs
    const draftSessionView = await request(app)
      .get(`/api/sessions/${session1._id}/learning-resources?status=DRAFT`)
      .set(as("teacher1"));
    expect(draftSessionView.statusCode).toBe(200);
    expect(draftSessionView.body.data.items).toHaveLength(0);

    // Reject repeated-array / invalid enum / malformed query & boolean params with 400
    expect(
      (await request(app).get("/api/admin/learning-resources?status=DRAFT&status=PUBLISHED").set(as("admin"))).statusCode
    ).toBe(400);
    expect(
      (await request(app).get("/api/admin/learning-resources?status=INVALID").set(as("admin"))).statusCode
    ).toBe(400);
    expect(
      (await request(app).get("/api/teacher/learning-resources?classId=a&classId=b").set(as("teacher1"))).statusCode
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/teacher/sessions/${session1._id}/learning-resources/migrate`)
          .set(as("teacher1"))
          .send({ dryRun: "false" })
      ).statusCode
    ).toBe(400);

    // Session.contents[] untouched
    const freshSession = await Session.findById(session1._id).lean();
    expect(freshSession.contents).toHaveLength(2);
  });

  it("LMS-05: masks raw storageKey for students, preserves delete-vs-submit atomicity inside tx, and rejects boolean/empty numeric coercion", async () => {
    const s1File = await uploadPrivatePdf("student1");

    // Reject boolean / empty-string numeric or boolean coercion
    expect(
      (
        await request(app)
          .post(`/api/teacher/classes/${class1._id}/assignments`)
          .set(as("teacher1"))
          .send({ title: "Bad bool", maxScore: true })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/teacher/classes/${class1._id}/assignments`)
          .set(as("teacher1"))
          .send({ title: "Bad str", allowLateSubmission: "true" })
      ).statusCode
    ).toBe(400);

    const aRes = await request(app)
      .post(`/api/teacher/classes/${class1._id}/assignments`)
      .set(as("teacher1"))
      .send({
        title: "Bai tap P4",
        dueAt: new Date(NOW + DAY).toISOString(),
        allowLateSubmission: false,
        maxAttempts: 2,
        maxScore: 10,
        status: "PUBLISHED",
      });
    expect(aRes.statusCode).toBe(201);
    const aid = aRes.body.data.id;

    // Submit with attachment -> student views mask raw storageKey while downloadUrl still works!
    const subRes = await request(app)
      .post(`/api/me/assignments/${aid}/submissions`)
      .set(as("student1"))
      .send({
        textAnswer: "Bai giai chi tiet",
        attachments: [{ storageKey: s1File.storageKey, mimeType: s1File.mimeType, originalName: "giai.pdf" }],
      });
    expect(subRes.statusCode).toBe(201);
    expect(subRes.body.data.attachments[0].storageKey).toBeUndefined();
    expect(subRes.body.data.attachments[0].downloadUrl).toContain("/api/files/download?");
    const dlCheck = await request(app).get(stripOrigin(subRes.body.data.attachments[0].downloadUrl));
    expect(dlCheck.statusCode).toBe(200);

    const mySubRes = await request(app).get(`/api/me/submissions/${subRes.body.data.id}`).set(as("student1"));
    expect(mySubRes.statusCode).toBe(200);
    expect(mySubRes.body.data.attachments[0].storageKey).toBeUndefined();

    // Teacher still sees storageKey
    const teacherSub = await request(app).get(`/api/teacher/submissions/${subRes.body.data.id}`).set(as("teacher1"));
    expect(teacherSub.statusCode).toBe(200);
    expect(teacherSub.body.data.attachments[0].storageKey).toBe(s1File.storageKey);

    // Assignment with existing submission cannot be deleted (409)
    const delWithSub = await request(app).delete(`/api/teacher/assignments/${aid}`).set(as("teacher1"));
    expect(delWithSub.statusCode).toBe(409);

    // Concurrent delete vs submit on fresh assignment: NEVER leaves deleted=true with submissions > 0
    const a2Res = await request(app)
      .post(`/api/teacher/classes/${class1._id}/assignments`)
      .set(as("teacher1"))
      .send({ title: "Race assignment", dueAt: new Date(NOW + DAY).toISOString(), status: "PUBLISHED" });
    const a2Id = a2Res.body.data.id;

    const [delRace, subRace] = await Promise.all([
      request(app).delete(`/api/teacher/assignments/${a2Id}`).set(as("teacher1")),
      request(app).post(`/api/me/assignments/${a2Id}/submissions`).set(as("student1")).send({ textAnswer: "Attempt" }),
    ]);
    expect([200, 409]).toContain(delRace.statusCode);
    expect([201, 404, 409]).toContain(subRace.statusCode);
    const dbA2 = await Assignment.findById(a2Id).lean();
    const dbA2Subs = await Submission.countDocuments({ assignmentId: a2Id });
    expect(dbA2.isDeleted && dbA2Subs > 0).toBe(false);

    // Cancelled enrollment blocks future submissions immediately inside tx
    const a3Res = await request(app)
      .post(`/api/teacher/classes/${class1._id}/assignments`)
      .set(as("teacher1"))
      .send({ title: "Enrollment gate", dueAt: new Date(NOW + DAY).toISOString(), status: "PUBLISHED" });
    await Enrollment.updateOne({ classId: class1._id, studentId: student1._id }, { $set: { enrollmentStatus: "CANCELLED" } });
    const blockedRes = await request(app)
      .post(`/api/me/assignments/${a3Res.body.data.id}/submissions`)
      .set(as("student1"))
      .send({ textAnswer: "Should fail" });
    expect(blockedRes.statusCode).toBe(403);
  });

  it("LMS-07: serializes concurrent regrade via CAS without duplicates, preserves append-only GradeHistory, and blocks coerced inputs", async () => {
    const aRes = await request(app)
      .post(`/api/teacher/classes/${class1._id}/assignments`)
      .set(as("teacher1"))
      .send({ title: "LMS07 Assignment", dueAt: new Date(NOW + DAY).toISOString(), maxScore: 10, status: "PUBLISHED" });
    const subRes = await request(app)
      .post(`/api/me/assignments/${aRes.body.data.id}/submissions`)
      .set(as("student1"))
      .send({ textAnswer: "Answer for grading" });
    const subId = subRes.body.data.id;

    // Reject coerced boolean/empty scores
    expect(
      (await request(app).post(`/api/teacher/submissions/${subId}/grade`).set(as("teacher1")).send({ score: true })).statusCode
    ).toBe(400);
    expect(
      (await request(app).post(`/api/teacher/submissions/${subId}/grade`).set(as("teacher1")).send({ score: "" })).statusCode
    ).toBe(400);

    const g1 = await request(app)
      .post(`/api/teacher/submissions/${subId}/grade`)
      .set(as("teacher1"))
      .send({ score: 7, feedback: "Initial" });
    expect(g1.statusCode).toBe(201);

    // Concurrent regrade CAS race -> strictly 1 succeeds (200) and 1 fails (409 REGRADE_CONFLICT), zero 500s
    const [r1, r2] = await Promise.all([
      request(app)
        .patch(`/api/teacher/submissions/${subId}/grade`)
        .set(as("teacher1"))
        .send({ score: 8, reason: "Regrade R1" }),
      request(app)
        .patch(`/api/teacher/submissions/${subId}/grade`)
        .set(as("teacher1"))
        .send({ score: 9, reason: "Regrade R2" }),
    ]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const conflict = r1.statusCode === 409 ? r1 : r2;
    expect(conflict.body.error).toBe("REGRADE_CONFLICT");

    const dbGrade = await Grade.findOne({ submissionId: subId }).lean();
    const dbSub = await Submission.findById(subId).lean();
    const history = await GradeHistory.find({ submissionId: subId }).sort({ revisionNumber: 1 }).lean();
    expect(dbGrade.revisionNumber).toBe(2);
    expect(dbGrade.score).toBe(dbSub.currentScore);
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.revisionNumber)).toEqual([1, 2]);

    // Reject repeated-array / operator query filters (400) and invalid ObjectId string (404 via assertId)
    expect((await request(app).get("/api/admin/grades/history?classId=a&classId=b").set(as("admin"))).statusCode).toBe(400);
    expect((await request(app).get("/api/admin/grades/history?assignmentId=a&assignmentId=b").set(as("admin"))).statusCode).toBe(400);
    expect((await request(app).get("/api/admin/grades/history?assignmentId=invalid-id").set(as("admin"))).statusCode).toBe(404);
    expect((await request(app).get("/api/me/grades?classId=a&classId=b").set(as("student1"))).statusCode).toBe(400);
    const gradeService = require("../src/services/gradeService");
    await expect(
      gradeService.adminListGradeHistory({ classId: { $ne: null } }, { page: 1, pageSize: 20, skip: 0 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("LMS-08: serializes concurrent addQuestion/publish inside tx, validates manual grades strictly, and preserves answer-key redaction", async () => {
    const qzRes = await request(app)
      .post("/api/teacher/assessments")
      .set(as("teacher1"))
      .send({
        title: "Quiz Concurrent",
        purpose: "QUIZ",
        scopeType: "CLASS",
        classId: class1._id.toString(),
        shuffleQuestions: true,
        maxAttempts: 1,
        passingScore: 6,
      });
    expect(qzRes.statusCode).toBe(201);
    const aid = qzRes.body.data.id;

    // Concurrent addQuestion WITHOUT explicit questionOrder -> locked Assessment tx produces unique orders [1, 2] and exact totalMaxScore=10, mode=MIXED!
    const [qAdd1, qAdd2] = await Promise.all([
      request(app)
        .post(`/api/teacher/assessments/${aid}/questions`)
        .set(as("teacher1"))
        .send({
          questionType: "SINGLE_CHOICE",
          prompt: "2+2=?",
          options: [
            { optionId: "A", text: "3" },
            { optionId: "B", text: "4" },
          ],
          correctOptionIds: ["B"],
          explanation: "Basic arithmetic",
          points: 4,
        }),
      request(app)
        .post(`/api/teacher/assessments/${aid}/questions`)
        .set(as("teacher1"))
        .send({
          questionType: "ESSAY",
          prompt: "Explain prime numbers",
          explanation: "Divisible only by 1 and itself",
          points: 6,
        }),
    ]);
    expect(qAdd1.statusCode).toBe(201);
    expect(qAdd2.statusCode).toBe(201);
    expect([qAdd1.body.data.questionOrder, qAdd2.body.data.questionOrder].sort()).toEqual([1, 2]);

    const qAutoId = qAdd1.body.data.id;
    const qEssayId = qAdd2.body.data.id;
    const dbAssessAfterAdd = await Assessment.findById(aid).lean();
    expect(dbAssessAfterAdd.totalMaxScore).toBe(10);
    expect(dbAssessAfterAdd.gradingMode).toBe("MIXED");

    // Concurrent addQuestion WITH identical explicit questionOrder=5 -> 1 wins (201), 1 conflicts (409)
    const [dupOrd1, dupOrd2] = await Promise.all([
      request(app)
        .post(`/api/teacher/assessments/${aid}/questions`)
        .set(as("teacher1"))
        .send({ questionType: "ESSAY", prompt: "Order 5 A", questionOrder: 5, points: 2 }),
      request(app)
        .post(`/api/teacher/assessments/${aid}/questions`)
        .set(as("teacher1"))
        .send({ questionType: "ESSAY", prompt: "Order 5 B", questionOrder: 5, points: 2 }),
    ]);
    expect([dupOrd1.statusCode, dupOrd2.statusCode].sort()).toEqual([201, 409]);

    const winnerId = dupOrd1.statusCode === 201 ? dupOrd1.body.data.id : dupOrd2.body.data.id;
    expect(
      (await request(app).delete(`/api/teacher/assessments/${aid}/questions/${winnerId}`).set(as("teacher1"))).statusCode
    ).toBe(200);
    expect((await Assessment.findById(aid).lean()).totalMaxScore).toBe(10);

    expect((await request(app).post(`/api/teacher/assessments/${aid}/publish`).set(as("teacher1"))).statusCode).toBe(200);

    const startRes = await request(app)
      .post(`/api/me/assessments/${aid}/attempts`)
      .set({ ...as("student1"), "Idempotency-Key": "start-p4-1" })
      .send({});
    expect(startRes.statusCode).toBe(201);
    const attemptId = startRes.body.data.id;

    // Malformed submit inputs rejected with 400
    expect(
      (
        await request(app)
          .post(`/api/me/attempts/${attemptId}/submit`)
          .set(as("student1"))
          .send({ answers: [{ questionId: qAutoId, selectedOptionIds: "B" }] })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/me/attempts/${attemptId}/submit`)
          .set(as("student1"))
          .send({ answers: [{ questionId: qEssayId, textAnswer: { $ne: null } }] })
      ).statusCode
    ).toBe(400);

    const subOk = await request(app)
      .post(`/api/me/attempts/${attemptId}/submit`)
      .set(as("student1"))
      .send({
        answers: [
          { questionId: qAutoId, selectedOptionIds: ["B"] },
          { questionId: qEssayId, textAnswer: "Prime numbers have two divisors" },
        ],
      });
    expect(subOk.statusCode).toBe(200);
    expect(subOk.body.data.status).toBe("SUBMITTED");

    // Manual grade rejects duplicate questionId, unknown questionId, and boolean/empty awardedPoints
    const fakeQId = new mongoose.Types.ObjectId().toString();
    expect(
      (
        await request(app)
          .post(`/api/teacher/attempts/${attemptId}/grade`)
          .set(as("teacher1"))
          .send({
            questionGrades: [
              { questionId: qEssayId, awardedPoints: 4 },
              { questionId: qEssayId, awardedPoints: 5 },
            ],
          })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/teacher/attempts/${attemptId}/grade`)
          .set(as("teacher1"))
          .send({ questionGrades: [{ questionId: fakeQId, awardedPoints: 1 }] })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/teacher/attempts/${attemptId}/grade`)
          .set(as("teacher1"))
          .send({ questionGrades: [{ questionId: qEssayId, awardedPoints: true }] })
      ).statusCode
    ).toBe(400);

    // Concurrent valid manualGradeAttempt calls -> both resolve 200 via tx Attempt write-lock retry without VersionError!
    const [mg1, mg2] = await Promise.all([
      request(app)
        .post(`/api/teacher/attempts/${attemptId}/grade`)
        .set(as("teacher1"))
        .send({ questionGrades: [{ questionId: qEssayId, awardedPoints: 5 }], feedback: "Graded" }),
      request(app)
        .post(`/api/teacher/attempts/${attemptId}/grade`)
        .set(as("teacher1"))
        .send({ questionGrades: [{ questionId: qEssayId, awardedPoints: 5 }], feedback: "Graded" }),
    ]);
    expect(mg1.statusCode).toBe(200);
    expect(mg2.statusCode).toBe(200);

    // Student reads graded attempt -> still zero answer keys or explanations leaked!
    const sAttempt = await request(app).get(`/api/me/attempts/${attemptId}`).set(as("student1"));
    expect(sAttempt.statusCode).toBe(200);
    expect(sAttempt.body.data.totalScore).toBe(9);
    const serialized = JSON.stringify(sAttempt.body);
    expect(serialized).not.toContain("correctOptionIds");
    expect(serialized).not.toContain("Basic arithmetic");
    expect(serialized).not.toContain("gradedBy");
  });

  it("LMS-01: enforces partial unique active GENERATED PlacementResult under concurrent different-attempt evaluations & blocks query injection", async () => {
    const placeRes = await request(app)
      .post("/api/admin/assessments")
      .set(as("admin"))
      .send({
        title: "Placement Toan 10 Concurrent",
        purpose: "PLACEMENT",
        scopeType: "GLOBAL_PLACEMENT",
        subjectId: subjectMath._id.toString(),
        gradeLevel: "GRADE_10",
        maxAttempts: 5,
        placementConfig: {
          autoRecommendCourses: true,
          bands: [
            { minPercentage: 0, maxPercentage: 49.99, recommendedLevel: "BEGINNER", summary: "Basic" },
            { minPercentage: 50, maxPercentage: 79.99, recommendedLevel: "INTERMEDIATE", summary: "Mid" },
            { minPercentage: 80, maxPercentage: 100, recommendedLevel: "ADVANCED", summary: "Adv" },
          ],
        },
      });
    expect(placeRes.statusCode).toBe(201);
    const pid = placeRes.body.data.id;

    const qRes = await request(app)
      .post(`/api/admin/assessments/${pid}/questions`)
      .set(as("admin"))
      .send({
        questionType: "TRUE_FALSE",
        prompt: "2 is prime",
        options: [
          { optionId: "T", text: "True" },
          { optionId: "F", text: "False" },
        ],
        correctOptionIds: ["T"],
        points: 10,
      });
    expect(qRes.statusCode).toBe(201);
    const pqid = qRes.body.data.id;
    expect((await request(app).post(`/api/admin/assessments/${pid}/publish`).set(as("admin"))).statusCode).toBe(200);

    // Student2 completes 2 distinct graded attempts (one 0%, one 100%)
    const a1 = await request(app).post(`/api/me/assessments/${pid}/attempts`).set(as("student2")).send({});
    expect(a1.statusCode).toBe(201);
    await request(app)
      .post(`/api/me/attempts/${a1.body.data.id}/submit`)
      .set(as("student2"))
      .send({ answers: [{ questionId: pqid, selectedOptionIds: ["F"] }] });

    const a2 = await request(app).post(`/api/me/assessments/${pid}/attempts`).set(as("student2")).send({});
    expect(a2.statusCode).toBe(201);
    await request(app)
      .post(`/api/me/attempts/${a2.body.data.id}/submit`)
      .set(as("student2"))
      .send({ answers: [{ questionId: pqid, selectedOptionIds: ["T"] }] });

    // Concurrent evaluation on SAME attempt -> 0 duplicates, 1 doc
    const [same1, same2] = await Promise.all([
      request(app).post(`/api/me/placement-attempts/${a1.body.data.id}/evaluate`).set(as("student2")).send({}),
      request(app).post(`/api/me/placement-attempts/${a1.body.data.id}/evaluate`).set(as("student2")).send({}),
    ]);
    expect(same1.statusCode).toBe(201);
    expect(same2.statusCode).toBe(201);
    expect([same1.body.data.idempotent, same2.body.data.idempotent].sort()).toEqual([false, true]);
    expect(await PlacementResult.countDocuments({ studentId: student2._id, attemptId: a1.body.data.id })).toBe(1);

    // Concurrent evaluation of a1 AND a2 (plus a third retryable attempt a3) -> partial unique index MUST allow ONLY ONE GENERATED result!
    const a3 = await request(app).post(`/api/me/assessments/${pid}/attempts`).set(as("student2")).send({});
    await request(app)
      .post(`/api/me/attempts/${a3.body.data.id}/submit`)
      .set(as("student2"))
      .send({ answers: [{ questionId: pqid, selectedOptionIds: ["T"] }] });

    const [diff1, diff2] = await Promise.all([
      request(app).post("/api/me/placement-results").set(as("student2")).send({ attemptId: a2.body.data.id }),
      request(app).post("/api/me/placement-results").set(as("student2")).send({ attemptId: a3.body.data.id }),
    ]);
    expect(diff1.statusCode).toBe(201);
    expect(diff2.statusCode).toBe(201);

    const activeCount = await PlacementResult.countDocuments({
      studentId: student2._id,
      subjectId: subjectMath._id,
      gradeLevel: "GRADE_10",
      status: "GENERATED",
    });
    const supersededCount = await PlacementResult.countDocuments({
      studentId: student2._id,
      subjectId: subjectMath._id,
      gradeLevel: "GRADE_10",
      status: "SUPERSEDED",
    });
    expect(activeCount).toBe(1);
    expect(supersededCount).toBe(2);

    // Reject invalid / repeated HTTP query enums and direct Mongo operator injection
    expect(
      (await request(app).get("/api/me/placement-assessments?gradeLevel=INVALID").set(as("student2"))).statusCode
    ).toBe(400);
    expect(
      (await request(app).get("/api/me/placement-results?status=GENERATED&status=SUPERSEDED").set(as("student2"))).statusCode
    ).toBe(400);
    expect(
      (await request(app).get("/api/admin/placement-results?recommendedLevel=HACK").set(as("admin"))).statusCode
    ).toBe(400);
    const placementService = require("../src/services/placementService");
    await expect(
      placementService.listMyPlacementResults(student2._id, { status: { $ne: "SUPERSEDED" } }, { page: 1, pageSize: 20, skip: 0 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
