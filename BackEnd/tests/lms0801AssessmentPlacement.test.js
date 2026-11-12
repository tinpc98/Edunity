const os = require("os");
const path = require("path");
const fs = require("fs");

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-lms0801-"));

const request = require("supertest");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Enrollment,
  Assessment,
  Question,
  Attempt,
  PlacementResult,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

let admin;
let teacher1;
let teacher2;
let student1;
let student2;
let tokens;
let category;
let subject;
let beginnerCourse;
let intermediateCourse;
let advancedCourse;
let class1;

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

  admin = await make("admin@lms08.test", "ADMIN");
  teacher1 = await make("t1@lms08.test", "TEACHER", {
    teacherProfile: { fullName: "Teacher LMS08", verificationStatus: "VERIFIED" },
  });
  teacher2 = await make("t2@lms08.test", "TEACHER", {
    teacherProfile: { fullName: "Other Teacher", verificationStatus: "VERIFIED" },
  });
  student1 = await make("s1@lms08.test", "STUDENT", { studentProfile: { fullName: "Student 1" } });
  student2 = await make("s2@lms08.test", "STUDENT", { studentProfile: { fullName: "Student 2" } });

  tokens = {
    admin: signAccessToken(admin),
    teacher1: signAccessToken(teacher1),
    teacher2: signAccessToken(teacher2),
    student1: signAccessToken(student1),
    student2: signAccessToken(student2),
  };

  category = await Category.create({ name: "Ngoai ngu", slug: "ngoai-ngu", createdBy: admin._id });
  subject = await Subject.create({
    categoryId: category._id,
    categoryName: category.name,
    name: "Tieng Anh",
    slug: "tieng-anh",
    createdBy: admin._id,
  });

  const makeCourse = (title, slug, level) =>
    Course.create({
      subjectId: subject._id,
      subjectName: subject.name,
      categoryId: category._id,
      categoryName: category.name,
      title,
      slug,
      level,
      gradeLevel: "GRADE_10",
      status: "ACTIVE",
      createdBy: admin._id,
    });

  beginnerCourse = await makeCourse("Tieng Anh 10 Co ban", "ta-10-cb", "BEGINNER");
  intermediateCourse = await makeCourse("Tieng Anh 10 Trung cap", "ta-10-tc", "INTERMEDIATE");
  advancedCourse = await makeCourse("Tieng Anh 10 Nang cao", "ta-10-nc", "ADVANCED");

  class1 = await Class.create({
    courseId: beginnerCourse._id,
    courseTitle: beginnerCourse.title,
    teacherId: teacher1._id,
    teacherName: "Teacher LMS08",
    categoryId: category._id,
    subjectId: subject._id,
    gradeLevel: "GRADE_10",
    level: "BEGINNER",
    className: "Lop TA10 T1",
    classType: "FREE",
    price: 0,
    capacity: 20,
    status: "IN_PROGRESS",
  });

  await Enrollment.create({
    classId: class1._id,
    courseId: beginnerCourse._id,
    teacherId: teacher1._id,
    studentId: student1._id,
    enrollmentStatus: "CONFIRMED",
    paymentSource: "FREE",
  });
});

describe("LMS-08: Assessment, Question & Attempt", () => {
  it("supports mixed auto+manual grading, redacts answer keys from students, prevents double start/submit under concurrency & enforces time limits", async () => {
    // Teacher creates CLASS quiz (blocked for PLACEMENT or other teacher's class)
    const forbidPlacement = await request(app)
      .post("/api/teacher/assessments")
      .set(as("teacher1"))
      .send({ title: "Unauthorized placement", purpose: "PLACEMENT", scopeType: "GLOBAL_PLACEMENT" });
    expect(forbidPlacement.statusCode).toBe(403);

    const quizRes = await request(app)
      .post("/api/teacher/assessments")
      .set(as("teacher1"))
      .send({
        title: "Kiem tra Unit 1",
        purpose: "QUIZ",
        scopeType: "CLASS",
        classId: class1._id.toString(),
        timeLimitMinutes: 30,
        maxAttempts: 2,
        passingScore: 7,
      });
    expect(quizRes.statusCode).toBe(201);
    const quizId = quizRes.body.data.id;

    // Add Q1 SINGLE_CHOICE (4 pts), Q2 MULTIPLE_CHOICE (3 pts), Q3 ESSAY (3 pts) -> total 10 pts, MIXED mode
    const q1 = await request(app)
      .post(`/api/teacher/assessments/${quizId}/questions`)
      .set(as("teacher1"))
      .send({
        questionType: "SINGLE_CHOICE",
        prompt: "Choose the correct tense",
        options: [
          { optionId: "A", text: "go" },
          { optionId: "B", text: "goes" },
        ],
        correctOptionIds: ["B"],
        explanation: "He/She/It + V-s/es",
        points: 4,
      });
    expect(q1.statusCode).toBe(201);

    const q2 = await request(app)
      .post(`/api/teacher/assessments/${quizId}/questions`)
      .set(as("teacher1"))
      .send({
        questionType: "MULTIPLE_CHOICE",
        prompt: "Select vowels",
        options: [
          { optionId: "A", text: "a" },
          { optionId: "B", text: "b" },
          { optionId: "C", text: "e" },
        ],
        correctOptionIds: ["A", "C"],
        points: 3,
      });
    expect(q2.statusCode).toBe(201);

    const q3 = await request(app)
      .post(`/api/teacher/assessments/${quizId}/questions`)
      .set(as("teacher1"))
      .send({
        questionType: "ESSAY",
        prompt: "Write 3 sentences introducing yourself",
        points: 3,
      });
    expect(q3.statusCode).toBe(201);

    const published = await request(app).post(`/api/teacher/assessments/${quizId}/publish`).set(as("teacher1"));
    expect(published.statusCode).toBe(200);
    expect(published.body.data.totalMaxScore).toBe(10);
    expect(published.body.data.gradingMode).toBe("MIXED");

    // Questions cannot be added/modified after PUBLISH
    const addAfterPublish = await request(app)
      .post(`/api/teacher/assessments/${quizId}/questions`)
      .set(as("teacher1"))
      .send({ questionType: "ESSAY", prompt: "Extra", points: 1 });
    expect(addAfterPublish.statusCode).toBe(409);

    // Unenrolled student2 gets 403
    expect((await request(app).get(`/api/me/assessments/${quizId}`).set(as("student2"))).statusCode).toBe(403);
    expect((await request(app).post(`/api/me/assessments/${quizId}/attempts`).set(as("student2")).send({})).statusCode).toBe(403);

    // Student1 views quiz -> answer keys completely redacted!
    const s1Quiz = await request(app).get(`/api/me/assessments/${quizId}`).set(as("student1"));
    expect(s1Quiz.statusCode).toBe(200);
    expect(s1Quiz.body.data.questions).toHaveLength(3);
    expect(JSON.stringify(s1Quiz.body)).not.toContain("correctOptionIds");
    expect(JSON.stringify(s1Quiz.body)).not.toContain("He/She/It + V-s/es");

    // Concurrent startAttempt calls without idempotency key -> ONLY 1 IN_PROGRESS attempt created!
    const [start1, start2] = await Promise.all([
      request(app).post(`/api/me/assessments/${quizId}/attempts`).set(as("student1")).send({}),
      request(app).post(`/api/me/assessments/${quizId}/attempts`).set(as("student1")).send({}),
    ]);
    expect([start1.statusCode, start2.statusCode].sort()).toEqual([201, 409]);
    const activeAttempt = start1.statusCode === 201 ? start1.body.data : start2.body.data;
    expect(await Attempt.countDocuments({ assessmentId: quizId, studentId: student1._id, status: "IN_PROGRESS" })).toBe(1);

    // Concurrent submitAttempt calls -> ONLY 1 successful submission, second fails 409 ATTEMPT_ALREADY_SUBMITTED!
    const submitPayload = {
      answers: [
        { questionId: q1.body.data.id, selectedOptionIds: ["B"] },
        { questionId: q2.body.data.id, selectedOptionIds: ["A", "C"] },
        { questionId: q3.body.data.id, textAnswer: "My name is An. I am 16 years old." },
      ],
    };
    const [sub1, sub2] = await Promise.all([
      request(app).post(`/api/me/attempts/${activeAttempt.id}/submit`).set(as("student1")).send(submitPayload),
      request(app).post(`/api/me/attempts/${activeAttempt.id}/submit`).set(as("student1")).send(submitPayload),
    ]);
    expect([sub1.statusCode, sub2.statusCode].sort()).toEqual([200, 409]);
    const submitted = sub1.statusCode === 200 ? sub1.body.data : sub2.body.data;
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.gradingStatus).toBe("PENDING_MANUAL");
    expect(submitted.autoScore).toBe(7);

    // Teacher manually grades essay question (2.5 / 3) -> total = 9.5/10, status GRADED, passed = true!
    const manualGraded = await request(app)
      .post(`/api/teacher/attempts/${activeAttempt.id}/grade`)
      .set(as("teacher1"))
      .send({
        questionGrades: [{ questionId: q3.body.data.id, awardedPoints: 2.5, comment: "Good grammar" }],
        feedback: "Well done",
      });
    expect(manualGraded.statusCode).toBe(200);
    expect(manualGraded.body.data.status).toBe("GRADED");
    expect(manualGraded.body.data.autoScore).toBe(7);
    expect(manualGraded.body.data.manualScore).toBe(2.5);
    expect(manualGraded.body.data.totalScore).toBe(9.5);
    expect(manualGraded.body.data.percentage).toBe(95);
    expect(manualGraded.body.data.passed).toBe(true);

    // Teacher2 cannot grade Teacher1's attempt
    expect(
      (
        await request(app)
          .post(`/api/teacher/attempts/${activeAttempt.id}/grade`)
          .set(as("teacher2"))
          .send({ questionGrades: [{ questionId: q3.body.data.id, awardedPoints: 1 }] })
      ).statusCode
    ).toBe(403);

    // Attempt #2 expires when past expiresAt
    const attempt2 = await request(app)
      .post(`/api/me/assessments/${quizId}/attempts`)
      .set(as("student1"))
      .send({});
    expect(attempt2.statusCode).toBe(201);
    await Attempt.updateOne({ _id: attempt2.body.data.id }, { $set: { expiresAt: new Date(Date.now() - 5000) } });

    const expiredSubmit = await request(app)
      .post(`/api/me/attempts/${attempt2.body.data.id}/submit`)
      .set(as("student1"))
      .send({ answers: [] });
    expect(expiredSubmit.statusCode).toBe(409);
    expect(expiredSubmit.body.error).toBe("ATTEMPT_EXPIRED");
    expect((await Attempt.findById(attempt2.body.data.id)).status).toBe("EXPIRED");

    // Attempt #3 blocked (maxAttempts = 2 reached!)
    const overLimit = await request(app)
      .post(`/api/me/assessments/${quizId}/attempts`)
      .set(as("student1"))
      .send({});
    expect(overLimit.statusCode).toBe(409);
    expect(overLimit.body.error).toBe("MAX_ATTEMPTS_EXCEEDED");
  });
});

describe("LMS-01: Placement Assessment & Real Course Recommendations", () => {
  it("generates PlacementResult strictly from real GRADED Attempt, recommends matching active Courses, and rejects ungraded attempts", async () => {
    const placementRes = await request(app)
      .post("/api/admin/assessments")
      .set(as("admin"))
      .send({
        title: "Kiem tra dau vao Tieng Anh 10",
        purpose: "PLACEMENT",
        scopeType: "GLOBAL_PLACEMENT",
        subjectId: subject._id.toString(),
        gradeLevel: "GRADE_10",
        targetCourseLevels: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
        maxAttempts: 2,
        placementConfig: {
          autoRecommendCourses: true,
          bands: [
            { minPercentage: 0, maxPercentage: 49.99, recommendedLevel: "BEGINNER", summary: "Nen tang co ban" },
            { minPercentage: 50, maxPercentage: 79.99, recommendedLevel: "INTERMEDIATE", summary: "Trinh do trung cap" },
            { minPercentage: 80, maxPercentage: 100, recommendedLevel: "ADVANCED", summary: "Trinh do nang cao" },
          ],
        },
      });
    expect(placementRes.statusCode).toBe(201);
    const placementId = placementRes.body.data.id;

    // 2 auto-gradable questions of 5 points each (total 10)
    const pq1 = await request(app)
      .post(`/api/admin/assessments/${placementId}/questions`)
      .set(as("admin"))
      .send({
        questionType: "TRUE_FALSE",
        prompt: "English nouns can be countable or uncountable",
        options: [
          { optionId: "T", text: "True" },
          { optionId: "F", text: "False" },
        ],
        correctOptionIds: ["T"],
        points: 5,
      });
    const pq2 = await request(app)
      .post(`/api/admin/assessments/${placementId}/questions`)
      .set(as("admin"))
      .send({
        questionType: "SHORT_TEXT",
        prompt: "Past participle of 'write'",
        acceptedAnswers: ["written"],
        points: 5,
      });
    expect(pq1.statusCode).toBe(201);
    expect(pq2.statusCode).toBe(201);

    expect((await request(app).post(`/api/admin/assessments/${placementId}/publish`).set(as("admin"))).statusCode).toBe(200);

    // Student lists placement assessments filtered by subject & gradeLevel
    const catalog = await request(app)
      .get(`/api/me/placement-assessments?subjectId=${subject._id}&gradeLevel=GRADE_10`)
      .set(as("student2"));
    expect(catalog.statusCode).toBe(200);
    expect(catalog.body.data.total).toBe(1);

    // Non-student roles refused on /api/me/placement-assessments (403)
    expect((await request(app).get("/api/me/placement-assessments").set(as("teacher1"))).statusCode).toBe(403);

    // Student2 starts placement attempt
    const started = await request(app)
      .post(`/api/me/assessments/${placementId}/attempts`)
      .set(as("student2"))
      .send({});
    expect(started.statusCode).toBe(201);
    const attemptId = started.body.data.id;

    // Attempting to evaluate BEFORE grading -> fails closed 409 PLACEMENT_ATTEMPT_NOT_GRADED (never mocks!)
    const preEval = await request(app)
      .post(`/api/me/placement-attempts/${attemptId}/evaluate`)
      .set(as("student2"))
      .send({});
    expect(preEval.statusCode).toBe(409);
    expect(preEval.body.error).toBe("PLACEMENT_ATTEMPT_NOT_GRADED");
    expect(await PlacementResult.countDocuments({ studentId: student2._id })).toBe(0);

    // Submit answers: 1 right, 1 wrong -> 5/10 = 50% -> INTERMEDIATE!
    const submitted = await request(app)
      .post(`/api/me/attempts/${attemptId}/submit`)
      .set(as("student2"))
      .send({
        answers: [
          { questionId: pq1.body.data.id, selectedOptionIds: ["T"] },
          { questionId: pq2.body.data.id, textAnswer: "wrote" },
        ],
      });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.body.data.status).toBe("GRADED");
    expect(submitted.body.data.percentage).toBe(50);

    // Evaluate placement result from real graded attempt
    const evaluated = await request(app)
      .post("/api/me/placement-results")
      .set(as("student2"))
      .send({ attemptId });
    expect(evaluated.statusCode).toBe(201);
    expect(evaluated.body.data.recommendedLevel).toBe("INTERMEDIATE");
    expect(evaluated.body.data.percentage).toBe(50);
    expect(evaluated.body.data.suggestedCourses.map((c) => c.slug)).toEqual(["ta-10-tc"]);
    expect(evaluated.body.data.idempotent).toBe(false);

    // Re-evaluating same attemptId returns idempotent result without duplicate DB document
    const evalAgain = await request(app)
      .post(`/api/me/placement-attempts/${attemptId}/evaluate`)
      .set(as("student2"))
      .send({});
    expect(evalAgain.statusCode).toBe(201);
    expect(evalAgain.body.data.idempotent).toBe(true);
    expect(await PlacementResult.countDocuments({ studentId: student2._id, attemptId })).toBe(1);

    // Retaking attempt #2 with 100% -> supersedes old GENERATED result and suggests ADVANCED!
    const attempt2 = await request(app)
      .post(`/api/me/assessments/${placementId}/attempts`)
      .set(as("student2"))
      .send({});
    await request(app)
      .post(`/api/me/attempts/${attempt2.body.data.id}/submit`)
      .set(as("student2"))
      .send({
        answers: [
          { questionId: pq1.body.data.id, selectedOptionIds: ["T"] },
          { questionId: pq2.body.data.id, textAnswer: "WRITTEN" },
        ],
      });
    const eval2 = await request(app)
      .post("/api/me/placement-results")
      .set(as("student2"))
      .send({ attemptId: attempt2.body.data.id });
    expect(eval2.statusCode).toBe(201);
    expect(eval2.body.data.recommendedLevel).toBe("ADVANCED");
    expect(eval2.body.data.suggestedCourses.map((c) => c.slug)).toEqual(["ta-10-nc"]);

    const oldResult = await PlacementResult.findOne({ attemptId }).lean();
    expect(oldResult.status).toBe("SUPERSEDED");
    const listRes = await request(app).get("/api/me/placement-results").set(as("student2"));
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.data.total).toBe(2);
    // Uninvolved Student1 cannot evaluate or read Student2's attempt/result
    expect((await request(app).get(`/api/me/placement-results/${eval2.body.data.id}`).set(as("student1"))).statusCode).toBe(404);
  });
});

