const os = require("os");
const path = require("path");
const fs = require("fs");

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-lms03-"));

const request = require("supertest");
const mongoose = require("mongoose");
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
  AuditLog,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

let admin;
let teacher1;
let teacher2;
let student1;
let student2;
let tokens;
let category;
let subject;
let course;
let class1;
let class2;
let session1;
let legacyItem1Id;
let legacyItem2Id;

const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });
const stripOrigin = (url) => String(url).replace(/^https?:\/\/[^/]+/, "");

const uploadPrivatePdf = async (roleKey) => {
  const res = await request(app)
    .post("/api/uploads/private")
    .set(as(roleKey))
    .field("purpose", "INCIDENT_EVIDENCE")
    .attach("file", PDF_BYTES, { filename: "resource.pdf", contentType: "application/pdf" });
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

  admin = await make("admin@lms03.test", "ADMIN");
  teacher1 = await make("t1@lms03.test", "TEACHER", {
    teacherProfile: { fullName: "Teacher One", verificationStatus: "VERIFIED" },
  });
  teacher2 = await make("t2@lms03.test", "TEACHER", {
    teacherProfile: { fullName: "Teacher Two", verificationStatus: "VERIFIED" },
  });
  student1 = await make("s1@lms03.test", "STUDENT", { studentProfile: { fullName: "Student One" } });
  student2 = await make("s2@lms03.test", "STUDENT", { studentProfile: { fullName: "Student Two" } });

  tokens = {
    admin: signAccessToken(admin),
    teacher1: signAccessToken(teacher1),
    teacher2: signAccessToken(teacher2),
    student1: signAccessToken(student1),
    student2: signAccessToken(student2),
  };

  category = await Category.create({ name: "Toan", slug: "toan", createdBy: admin._id });
  subject = await Subject.create({
    categoryId: category._id,
    categoryName: category.name,
    name: "Dai so",
    slug: "dai-so",
    createdBy: admin._id,
  });
  course = await Course.create({
    subjectId: subject._id,
    subjectName: subject.name,
    categoryId: category._id,
    categoryName: category.name,
    title: "Dai so co ban 8",
    slug: "dai-so-8",
    level: "BEGINNER",
    gradeLevel: "GRADE_8",
    createdBy: admin._id,
  });

  class1 = await Class.create({
    courseId: course._id,
    courseTitle: course.title,
    teacherId: teacher1._id,
    teacherName: "Teacher One",
    categoryId: category._id,
    subjectId: subject._id,
    gradeLevel: "GRADE_8",
    level: "BEGINNER",
    className: "Lop Dai So T1",
    classType: "FREE",
    price: 0,
    capacity: 20,
    status: "IN_PROGRESS",
  });

  class2 = await Class.create({
    courseId: course._id,
    courseTitle: course.title,
    teacherId: teacher2._id,
    teacherName: "Teacher Two",
    categoryId: category._id,
    subjectId: subject._id,
    gradeLevel: "GRADE_8",
    level: "BEGINNER",
    className: "Lop Dai So T2",
    classType: "FREE",
    price: 0,
    capacity: 20,
    status: "OPEN",
  });

  const teacherFile = await uploadPrivatePdf("teacher1");
  session1 = await Session.create({
    classId: class1._id,
    className: class1.className,
    teacherId: teacher1._id,
    title: "Buoi 1: Phuong trinh bac nhat",
    startDatetime: new Date(NOW + DAY),
    endDatetime: new Date(NOW + DAY + 3600000),
    status: "SCHEDULED",
    contents: [
      {
        title: "Bai giang PDF buoi 1",
        type: "LESSON",
        description: "Tai lieu ly thuyet buoi 1",
        storageKey: teacherFile.storageKey,
        order: 1,
      },
      {
        title: "Bai tap luyen tap cu",
        type: "ASSIGNMENT",
        description: "Lam cau 1-5 SGK",
        order: 2,
      },
    ],
  });
  legacyItem1Id = session1.contents[0]._id;
  legacyItem2Id = session1.contents[1]._id;

  await Enrollment.create({
    classId: class1._id,
    courseId: course._id,
    teacherId: teacher1._id,
    studentId: student1._id,
    enrollmentStatus: "CONFIRMED",
    paymentSource: "FREE",
  });
});

describe("LMS-03: LearningResource Access & Legacy Session.contents Bridge", () => {
  it("supports Course/Class/Session scoping, RBAC ownership, signed URL downloads, and storageKey masking", async () => {
    const adminFile = await uploadPrivatePdf("admin");
    const t1File = await uploadPrivatePdf("teacher1");
    const t2File = await uploadPrivatePdf("teacher2");

    // Admin creates COURSE resource (PUBLISHED) + AuditLog
    const courseRes = await request(app)
      .post("/api/admin/learning-resources")
      .set(as("admin"))
      .send({
        scopeType: "COURSE",
        courseId: course._id.toString(),
        title: "De cuong mon Dai So",
        resourceKind: "DOCUMENT",
        sourceType: "STORAGE_FILE",
        storageKey: adminFile.storageKey,
        mimeType: adminFile.mimeType,
        originalName: adminFile.originalName,
        status: "PUBLISHED",
      });
    expect(courseRes.statusCode).toBe(201);
    expect(await AuditLog.countDocuments({ action: "LEARNING_RESOURCE_CREATE", targetId: courseRes.body.data.id })).toBe(1);

    // Teacher1 cannot manage COURSE resources or teacher2's class resources
    const forbiddenCourse = await request(app)
      .post("/api/teacher/learning-resources")
      .set(as("teacher1"))
      .send({
        scopeType: "COURSE",
        courseId: course._id.toString(),
        title: "Teacher course doc",
        sourceType: "TEXT_CONTENT",
        contentText: "ABC",
      });
    expect(forbiddenCourse.statusCode).toBe(403);

    const forbiddenOtherClass = await request(app)
      .post("/api/teacher/learning-resources")
      .set(as("teacher1"))
      .send({
        scopeType: "CLASS",
        classId: class2._id.toString(),
        title: "Cross teacher",
        sourceType: "TEXT_CONTENT",
        contentText: "ABC",
      });
    expect(forbiddenOtherClass.statusCode).toBe(403);

    // Teacher1 cannot attach Teacher2's private storageKey (spoofing blocked)
    const spoofedFile = await request(app)
      .post("/api/teacher/learning-resources")
      .set(as("teacher1"))
      .send({
        scopeType: "CLASS",
        classId: class1._id.toString(),
        title: "Spoofed file",
        sourceType: "STORAGE_FILE",
        storageKey: t2File.storageKey,
      });
    expect(spoofedFile.statusCode).toBe(400);

    // Teacher1 creates CLASS PUBLISHED resource & a DRAFT resource
    const classPublished = await request(app)
      .post("/api/teacher/learning-resources")
      .set(as("teacher1"))
      .send({
        scopeType: "CLASS",
        classId: class1._id.toString(),
        title: "Slide lop T1",
        resourceKind: "SLIDE",
        sourceType: "STORAGE_FILE",
        storageKey: t1File.storageKey,
        mimeType: t1File.mimeType,
        originalName: "slide1.pdf",
        status: "PUBLISHED",
      });
    expect(classPublished.statusCode).toBe(201);

    const classDraft = await request(app)
      .post("/api/teacher/learning-resources")
      .set(as("teacher1"))
      .send({
        scopeType: "CLASS",
        classId: class1._id.toString(),
        title: "Ban nhap an",
        sourceType: "TEXT_CONTENT",
        contentText: "Chi giao vien xem",
        status: "DRAFT",
      });
    expect(classDraft.statusCode).toBe(201);

    // Enrolled student1 views Class resources -> only PUBLISHED, raw storageKey masked!
    const s1ClassList = await request(app)
      .get(`/api/classes/${class1._id}/learning-resources`)
      .set(as("student1"));
    expect(s1ClassList.statusCode).toBe(200);
    expect(s1ClassList.body.data.total).toBe(1);
    expect(s1ClassList.body.data.items[0].title).toBe("Slide lop T1");
    expect(s1ClassList.body.data.items[0].storageKey).toBeUndefined();

    // Student1 gets signed download URL & actually downloads PDF bytes cleanly!
    const dlMeta = await request(app)
      .get(`/api/learning-resources/${classPublished.body.data.id}/download-url`)
      .set(as("student1"));
    expect(dlMeta.statusCode).toBe(200);
    expect(dlMeta.body.data.downloadUrl).toContain("/api/files/download?");
    const fileRes = await request(app).get(stripOrigin(dlMeta.body.data.downloadUrl));
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.headers["content-type"]).toContain("application/pdf");

    // Student2 (NOT enrolled) cannot view Course/Class/Session resources or download URL
    expect((await request(app).get(`/api/classes/${class1._id}/learning-resources`).set(as("student2"))).statusCode).toBe(403);
    expect((await request(app).get(`/api/courses/${course._id}/learning-resources`).set(as("student2"))).statusCode).toBe(403);
    expect((await request(app).get(`/api/learning-resources/${classPublished.body.data.id}/download-url`).set(as("student2"))).statusCode).toBe(403);

    // Student1 DOES see Course resource because student1 is enrolled in class1 of course
    const s1CourseList = await request(app)
      .get(`/api/courses/${course._id}/learning-resources`)
      .set(as("student1"));
    expect(s1CourseList.statusCode).toBe(200);
    expect(s1CourseList.body.data.total).toBe(1);

    // Teacher2 cannot read Teacher1's class resources or download URL
    expect((await request(app).get(`/api/classes/${class1._id}/learning-resources`).set(as("teacher2"))).statusCode).toBe(403);
    expect((await request(app).get(`/api/learning-resources/${classPublished.body.data.id}`).set(as("teacher2"))).statusCode).toBe(403);
  });

  it("bridges Session.contents[] non-destructively and migrates idempotently without losing legacy history", async () => {
    // 1. Before migration: session learning view merges legacy items with signed URLs
    const preView = await request(app)
      .get(`/api/sessions/${session1._id}/learning-resources`)
      .set(as("student1"));
    expect(preView.statusCode).toBe(200);
    expect(preView.body.data.legacyContentsCount).toBe(2);
    expect(preView.body.data.unmigratedLegacyCount).toBe(2);
    expect(preView.body.data.items).toHaveLength(2);
    expect(preView.body.data.items[0].source).toBe("LEGACY_SESSION_CONTENT");
    expect(preView.body.data.items[0].downloadUrl).toContain("/api/files/download?");
    expect(preView.body.data.items[0].storageKey).toBeUndefined();

    // 2. Dry-run migration returns pending count without creating docs
    const dryRun = await request(app)
      .post(`/api/teacher/sessions/${session1._id}/learning-resources/migrate`)
      .set(as("teacher1"))
      .send({ dryRun: true });
    expect(dryRun.statusCode).toBe(200);
    expect(dryRun.body.data.dryRun).toBe(true);
    expect(dryRun.body.data.pendingMigrationCount).toBe(2);
    expect(await LearningResource.countDocuments({ sessionId: session1._id })).toBe(0);

    // 3. Execute real migration -> creates 2 LearningResource docs
    const migrated = await request(app)
      .post(`/api/teacher/sessions/${session1._id}/learning-resources/migrate`)
      .set(as("teacher1"))
      .send({});
    expect(migrated.statusCode).toBe(200);
    expect(migrated.body.data.createdCount).toBe(2);
    expect(migrated.body.data.legacyPreserved).toBe(true);
    expect(await LearningResource.countDocuments({ sessionId: session1._id })).toBe(2);

    // 4. Repeat migration (idempotent -> 0 duplicates)
    const migratedAgain = await request(app)
      .post(`/api/admin/sessions/${session1._id}/learning-resources/migrate`)
      .set(as("admin"))
      .send({});
    expect(migratedAgain.statusCode).toBe(200);
    expect(migratedAgain.body.data.createdCount).toBe(0);
    expect(migratedAgain.body.data.skippedAlreadyMigratedCount).toBe(2);
    expect(await LearningResource.countDocuments({ sessionId: session1._id })).toBe(2);

    // 5. Critical check: Session.contents[] is completely untouched in DB!
    const freshSession = await Session.findById(session1._id).lean();
    expect(freshSession.contents).toHaveLength(2);
    expect(String(freshSession.contents[0]._id)).toBe(String(legacyItem1Id));
    expect(String(freshSession.contents[1]._id)).toBe(String(legacyItem2Id));

    // 6. Post-migration view shows 2 migrated LearningResources without duplicating legacy items
    const postView = await request(app)
      .get(`/api/sessions/${session1._id}/learning-resources`)
      .set(as("student1"));
    expect(postView.statusCode).toBe(200);
    expect(postView.body.data.migratedCount).toBe(2);
    expect(postView.body.data.unmigratedLegacyCount).toBe(0);
    expect(postView.body.data.items).toHaveLength(2);
    expect(postView.body.data.items.every((i) => i.source === "LEARNING_RESOURCE")).toBe(true);
  });
});

