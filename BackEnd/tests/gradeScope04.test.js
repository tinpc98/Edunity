// Edunity offers grades 6-12 and university exam preparation. Older records keep their grade.
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  CourseProposal,
  TeacherSubjectAuthorization,
  TeacherContract,
} = require("../src/models");
const { GRADE_LEVELS } = require("../src/models/constants");
const { allowedGradeLevelsForCategory } = require("../src/utils/gradeLevel");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const EXAM = "UNIVERSITY_EXAM_PREP";
const OFFERED = ["GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12", EXAM];
const OLDER = ["PRE_PRIMARY", "GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "UNIVERSITY", "COLLEGE"];

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days, extra = 0) => new Date(Date.now() + days * DAY + extra);

let admin, teacher, category, subject;

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});
afterAll(disconnectDB);

beforeEach(async () => {
  await clearDB();
  admin = await User.create({ email: "admin@grade04.test", passwordHash: "x", role: "ADMIN", status: "ACTIVE" });
  teacher = await User.create({
    email: "teacher@grade04.test",
    passwordHash: "x",
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: { fullName: "Giáo viên", verificationStatus: "VERIFIED" },
  });
  // No grade group of its own, so only the platform rule limits the grade
  category = await Category.create({ name: "Ngoại ngữ", slug: "ngoai-ngu", createdBy: admin._id });
  subject = await Subject.create({
    name: "Tiếng Anh",
    slug: "tieng-anh",
    categoryId: category._id,
    categoryName: category.name,
    createdBy: admin._id,
  });
});

const call = (user, method, url, body) => {
  const req = request(app)[method](`/api${url}`).set({ "x-user-id": user._id.toString() });
  return body === undefined ? req : req.send(body);
};

const addCourse = (gradeLevel, title = "Khóa gốc") =>
  Course.create({
    title,
    slug: `khoa-${Math.random().toString(36).slice(2)}`,
    categoryId: category._id,
    categoryName: category.name,
    subjectId: subject._id,
    subjectName: subject.name,
    gradeLevel: gradeLevel || null,
    level: "BEGINNER",
    createdBy: admin._id,
  });

const newClass = (courseId, extra = {}) =>
  call(teacher, "post", "/teacher/classes", { courseId, className: "Lớp", classType: "PAID", price: 500000, capacity: 20, ...extra });
const register = (gradeLevel) =>
  call(teacher, "post", "/teacher/subject-authorizations", { subjectId: subject._id, gradeLevel, level: "BEGINNER" });
const propose = (gradeLevel) =>
  call(teacher, "post", "/teacher/course-proposals", {
    categoryId: category._id,
    subjectId: subject._id,
    title: "Khóa đề xuất",
    description: "Mô tả",
    level: "BEGINNER",
    gradeLevel,
  });

// A class with everything approval needs
const completeClass = async (gradeLevel) => {
  const course = await addCourse(gradeLevel);
  const created = await newClass(course._id, {
    description: "Mô tả",
    enrollmentStart: inDays(-1),
    enrollmentEnd: inDays(2),
    startDate: inDays(3),
    endDate: inDays(30),
    schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
  });
  expect(created.statusCode).toBe(201);
  const id = created.body.data.id;
  const sessions = await call(teacher, "post", `/teacher/classes/${id}/sessions`, {
    sessions: [{ title: "Buổi 1", startDatetime: inDays(4), endDatetime: inDays(4, 60 * 60 * 1000) }],
  });
  expect(sessions.statusCode).toBe(201);
  await TeacherContract.create({
    contractCode: "HD-GRADE04",
    teacherId: teacher._id,
    status: "ACTIVE",
    effectiveFrom: inDays(-1),
    expiresAt: inDays(365),
    provider: { name: "SANDBOX", envelopeId: "SBX-GRADE04" },
    createdBy: admin._id,
    sentAt: new Date(),
    signedAt: new Date(),
  });
  await TeacherSubjectAuthorization.create({
    teacherId: teacher._id,
    subjectId: subject._id,
    categoryId: category._id,
    gradeLevel,
    level: "BEGINNER",
    status: "APPROVED",
    createdBy: admin._id,
  });
  return { id, course };
};

// What a record saved before this rule looks like
const makeOlder = async ({ id, course }, gradeLevel) => {
  await Course.updateOne({ _id: course._id }, { $set: { gradeLevel } });
  await Class.updateOne({ _id: id }, { $set: { gradeLevel } });
  await TeacherSubjectAuthorization.updateMany({}, { $set: { gradeLevel } });
};

describe("The offered grades", () => {
  test.each(OFFERED)("%s works for registration, course, proposal and class", async (grade) => {
    expect((await register(grade)).statusCode).toBe(201);

    const course = await call(admin, "post", "/admin/courses", {
      subjectId: subject._id,
      title: "Khóa Admin",
      gradeLevel: grade,
      level: "BEGINNER",
    });
    expect(course.statusCode).toBe(201);

    expect((await propose(grade)).statusCode).toBe(201);
    const proposal = await CourseProposal.findOne();
    const approved = await call(admin, "post", `/admin/course-proposals/${proposal._id}/approve`, {});
    expect(approved.statusCode).toBe(200);
    expect(approved.body.data.course.gradeLevel).toBe(grade);

    const created = await newClass((await Course.findOne({ title: "Khóa Admin" }))._id);
    expect(created.statusCode).toBe(201);
    expect(created.body.data.gradeLevel).toBe(grade);
  });

  test.each([...OLDER, null, "", undefined])("%p is refused on every new write", async (grade) => {
    const code = grade ? "GRADE_LEVEL_NOT_SUPPORTED" : "GRADE_LEVEL_REQUIRED";
    const granted = await call(admin, "post", "/admin/subject-authorizations", {
      teacherId: teacher._id,
      subjectId: subject._id,
      gradeLevel: grade,
      level: "BEGINNER",
    });
    const course = await call(admin, "post", "/admin/courses", { subjectId: subject._id, title: "Khóa Admin", gradeLevel: grade });

    for (const res of [await register(grade), granted, course, await propose(grade)]) {
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe(code);
    }
    expect(await TeacherSubjectAuthorization.countDocuments()).toBe(0);
    expect(await CourseProposal.countDocuments()).toBe(0);
    expect(await Course.countDocuments()).toBe(0);

    // A class takes its grade from the course, so there is nothing to choose
    const older = await addCourse(grade);
    const cls = await newClass(older._id);
    expect(cls.statusCode).toBe(400);
    expect(cls.body.error).toBe("GRADE_LEVEL_NOT_SUPPORTED");
    expect(await Class.countDocuments()).toBe(0);
  });

  test("category groups: exam preparation belongs to THPT and to an exam-preparation category", () => {
    const bounds = (name) => allowedGradeLevelsForCategory({ name, slug: "" });
    expect(bounds("Trung học phổ thông")).toEqual(["GRADE_10", "GRADE_11", "GRADE_12", EXAM]);
    expect(bounds("Trung học cơ sở")).toEqual(["GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"]);
    expect(bounds("Ôn thi đại học")).toEqual([EXAM]);
    expect(bounds("Luyện thi vào đại học")).toEqual([EXAM]);
    expect(allowedGradeLevelsForCategory({ name: "Ôn thi đại học", slug: "on-thi-dai-hoc" })).toEqual([EXAM]);
    expect(allowedGradeLevelsForCategory({ name: "Luyện thi đại học THPT", slug: "luyen-thi-dai-hoc-thpt" })).toEqual([
      "GRADE_10",
      "GRADE_11",
      "GRADE_12",
      EXAM,
    ]);
    expect(bounds("Đại học")).toEqual(["UNIVERSITY"]);
  });

  test("a class for exam preparation opens and is public", async () => {
    const { id } = await completeClass(EXAM);

    expect((await call(teacher, "post", `/teacher/classes/${id}/submit`)).statusCode).toBe(200);
    const opened = await call(admin, "post", `/admin/classes/${id}/approve`, {});
    expect(opened.statusCode).toBe(200);
    expect(opened.body.data.status).toBe("OPEN");

    expect(JSON.stringify((await request(app).get("/api/classes")).body)).toContain(id);
    const found = await request(app).get(`/api/courses?gradeLevel=${EXAM}`);
    expect(found.statusCode).toBe(200);
    expect(found.body.data.total).toBe(1);
  });
});

describe("Records from before the rule", () => {
  test.each([...OLDER, null])("a %p class can be edited but not submitted", async (grade) => {
    const target = await completeClass("GRADE_8");
    await makeOlder(target, grade);

    expect((await call(teacher, "patch", `/teacher/classes/${target.id}`, { className: "Tên mới" })).statusCode).toBe(200);

    const readiness = await call(teacher, "get", `/teacher/classes/${target.id}/readiness`);
    const check = readiness.body.data.checks.find((item) => item.key === "COURSE");
    expect(check).toMatchObject({
      status: expect.not.stringMatching("PASSED"),
      code: "GRADE_LEVEL_NOT_SUPPORTED",
      message: "Khóa học ngoài phạm vi Lớp 6–12 và Ôn thi đại học",
    });

    expect((await call(teacher, "post", `/teacher/classes/${target.id}/submit`)).statusCode).toBe(400);
    expect((await Class.findById(target.id)).status).toBe("DRAFT");
  });

  test("a waiting class cannot be opened, an open one is left alone", async () => {
    const target = await completeClass("GRADE_8");
    expect((await call(teacher, "post", `/teacher/classes/${target.id}/submit`)).statusCode).toBe(200);
    await makeOlder(target, "PRE_PRIMARY");

    const res = await call(admin, "post", `/admin/classes/${target.id}/approve`, {});
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toContain("GRADE_LEVEL_NOT_SUPPORTED");
    expect((await Class.findById(target.id)).status).toBe("PENDING_APPROVAL");

    await Class.updateOne({ _id: target.id }, { $set: { status: "OPEN" } });
    const open = await Class.findById(target.id);
    open.className = "Vẫn lưu được";
    await open.save();
    expect(open.toObject()).toMatchObject({ status: "OPEN", gradeLevel: "PRE_PRIMARY" });
  });

  test("a class cannot be moved to an older course", async () => {
    const { id, course } = await completeClass("GRADE_8");
    const older = await addCourse("GRADE_4", "Khóa cũ");

    const res = await call(teacher, "patch", `/teacher/classes/${id}`, { courseId: older._id });

    expect(res.body.error).toBe("GRADE_LEVEL_NOT_SUPPORTED");
    expect(String((await Class.findById(id)).courseId)).toBe(String(course._id));
  });

  test.each([...OLDER, null])("a %p course can be maintained or moved into scope", async (grade) => {
    const course = await addCourse(grade);
    const patch = (body) => call(admin, "patch", `/admin/courses/${course._id}`, body);

    expect((await patch({ title: "Tên mới", gradeLevel: grade })).statusCode).toBe(200);
    expect((await patch({ status: "INACTIVE" })).statusCode).toBe(200);
    expect((await Course.findById(course._id)).gradeLevel).toBe(grade);

    const another = grade === "GRADE_1" ? "GRADE_2" : "GRADE_1";
    expect((await patch({ gradeLevel: another })).body.error).toBe("GRADE_LEVEL_NOT_SUPPORTED");
    expect((await patch({ gradeLevel: "GRADE_9" })).statusCode).toBe(200);
    expect((await patch({ gradeLevel: null })).body.error).toBe("GRADE_LEVEL_REQUIRED");
    expect((await Course.findById(course._id)).gradeLevel).toBe("GRADE_9");
  });

  test.each([null, "GRADE_4"])("a proposal waiting with %p needs an offered grade", async (grade) => {
    expect((await propose("GRADE_8")).statusCode).toBe(201);
    const proposal = await CourseProposal.findOne();
    await CourseProposal.updateOne({ _id: proposal._id }, { $set: { gradeLevel: grade } });
    const code = grade ? "GRADE_LEVEL_NOT_SUPPORTED" : "GRADE_LEVEL_REQUIRED";
    const approve = (body) => call(admin, "post", `/admin/course-proposals/${proposal._id}/approve`, body);

    expect((await call(teacher, "patch", `/teacher/course-proposals/${proposal._id}`, { title: "Sửa" })).body.error).toBe(code);
    expect((await approve({})).body.error).toBe(code);
    expect((await CourseProposal.findById(proposal._id)).status).toBe("PENDING_REVIEW"); // rolled back
    expect(await Course.countDocuments()).toBe(0);

    expect((await approve({ gradeLevel: "GRADE_8" })).statusCode).toBe(200);
  });

  test("a registration already waiting can still be decided", async () => {
    const auth = await TeacherSubjectAuthorization.create({
      teacherId: teacher._id,
      subjectId: subject._id,
      categoryId: category._id,
      gradeLevel: null,
      level: "BEGINNER",
      status: "PENDING",
      createdBy: teacher._id,
    });
    expect((await call(admin, "post", `/admin/subject-authorizations/${auth._id}/approve`, {})).statusCode).toBe(200);
  });
});

test("Backend and Frontend share both grade lists", () => {
  const { SUPPORTED_GRADE_LEVELS } = require("../src/models/constants");
  const source = fs.readFileSync(path.join(__dirname, "../../FrontEnd/src/types/catalog.ts"), "utf8");
  const listed = (name) =>
    [...new RegExp(`export const ${name}\\b[^=]*= *\\[([^\\]]*)\\]`).exec(source)[1].matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]);

  expect(SUPPORTED_GRADE_LEVELS).toEqual(OFFERED);
  expect([...GRADE_LEVELS].sort()).toEqual([...OLDER, ...OFFERED].sort()); // older values stay storable
  expect(listed("GRADE_LEVELS")).toEqual(GRADE_LEVELS);
  expect(listed("SUPPORTED_GRADE_LEVELS")).toEqual(SUPPORTED_GRADE_LEVELS);
});
