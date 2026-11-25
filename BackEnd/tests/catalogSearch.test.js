const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}

const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { User, Category, Subject, Course, Class, Session, Enrollment, SessionAttendance, Payment } = require("../src/models");
const studentService = require("../src/services/studentService");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("TIN-04A: Catalog Search, Filtering, Pagination & Stable Sorting Test Suite", () => {
  let admin, teacher, student;
  let categoryIT, categoryDesign;
  let subjectNode, subjectReact;
  let courseNode, courseReact;
  let classFree1, classFree2, classPaid1, classPaid2, classPaid3;

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
      teacherProfile: { fullName: "Teacher Test", verificationStatus: "VERIFIED" },
    });
    student = await User.create({
      email: "student@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student Test" },
    });

    categoryIT = await Category.create({ name: "Information Technology", slug: "it", createdBy: admin._id, status: "ACTIVE" });
    categoryDesign = await Category.create({ name: "Graphic Design", slug: "design", createdBy: admin._id, status: "ACTIVE" });

    subjectNode = await Subject.create({
      name: "NodeJS Programming",
      slug: "nodejs-prog",
      categoryId: categoryIT._id,
      categoryName: categoryIT.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    subjectReact = await Subject.create({
      name: "React Frontend",
      slug: "react-frontend",
      categoryId: categoryIT._id,
      categoryName: categoryIT.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });

    courseNode = await Course.create({
      title: "Complete NodeJS Bootcamp",
      slug: "complete-nodejs",
      categoryId: categoryIT._id,
      categoryName: categoryIT.name,
      subjectId: subjectNode._id,
      subjectName: subjectNode.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    courseReact = await Course.create({
      title: "React Fundamentals",
      slug: "react-fundamentals",
      categoryId: categoryIT._id,
      categoryName: categoryIT.name,
      subjectId: subjectReact._id,
      subjectName: subjectReact.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });

    // Seed classes
    // Class 1: Free (price = 0), Category IT, Subject Node
    classFree1 = await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectNode._id,
      className: "NodeJS Free Intro",
      classType: "FREE",
      price: 0,
      capacity: 20,
      status: "OPEN",
    });

    // Class 2: Free (price = 0), Category Design (different category)
    classFree2 = await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryDesign._id,
      subjectId: subjectNode._id,
      className: "Design Free Workshop",
      classType: "FREE",
      price: 0,
      capacity: 25,
      status: "OPEN",
    });

    // Class 3: Paid 150,000, Category IT, Subject Node
    classPaid1 = await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectNode._id,
      className: "NodeJS Mastery Paid 150k",
      classType: "PAID",
      price: 150000,
      capacity: 30,
      status: "OPEN",
    });

    // Class 4: Paid 300,000, Category IT, Subject React
    classPaid2 = await Class.create({
      courseId: courseReact._id,
      courseTitle: courseReact.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectReact._id,
      className: "React Pro Paid 300k",
      classType: "PAID",
      price: 300000,
      capacity: 15,
      status: "OPEN",
    });

    // Class 5: Paid 800,000, Category IT, Subject Node
    classPaid3 = await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectNode._id,
      className: "NodeJS Advanced Paid 800k",
      classType: "PAID",
      price: 800000,
      capacity: 10,
      status: "OPEN",
    });
  });

  // CAT-04A-01: FREE + minPrice=0 + maxPrice=5000000. Expected: Chá»‰ cÃ³ lá»›p miá»…n phÃ­.
  it("returns only timetable fields for public class sessions", async () => {
    const startDatetime = new Date("2026-12-01T12:00:00Z");
    const endDatetime = new Date("2026-12-01T13:00:00Z");
    const session = await Session.create({
      classId: classFree1._id,
      className: classFree1.className,
      teacherId: teacher._id,
      title: "Intro timetable",
      startDatetime,
      endDatetime,
      meetingRoomId: "test-room",
      recording: { status: "AVAILABLE", storageKey: "test-main", providerRecordingId: "test-main-id" },
      recordingSegments: [{ segmentIndex: 1, storageKey: "test-segment", providerRecordingId: "test-segment-id" }],
      contents: [{ title: "Materials", type: "MATERIAL", order: 1, storageKey: "test-material" }],
    });

    const response = await request(app).get(`/api/classes/${classFree1._id}/sessions`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{
      _id: session._id.toString(),
      id: session._id.toString(),
      classId: classFree1._id.toString(),
      className: classFree1.className,
      teacherId: teacher._id.toString(),
      title: "Intro timetable",
      sessionNumber: null,
      startDatetime: startDatetime.toISOString(),
      endDatetime: endDatetime.toISOString(),
      status: "SCHEDULED",
    }]);
    expect((await Session.findById(session._id)).recordingSegments[0].storageKey).toBe("test-segment");
  });

  it.each([{ status: "INACTIVE" }, { isDeleted: true }, null])("hides courses with unavailable categories from public endpoints %j", async (state) => {
    if (state) await Category.updateOne({ _id: categoryIT._id }, { $set: state });
    else await Category.deleteOne({ _id: categoryIT._id });
    const publicList = await request(app).get("/api/courses").query({ categoryId: categoryIT._id.toString() });
    expect(publicList.body.data.total).toBe(0);
    expect((await request(app).get(`/api/courses/${courseNode._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/courses/${courseNode._id}/classes`)).status).toBe(404);
    const syllabus = await request(app).get(`/api/courses/${courseNode._id}/syllabus`);
    expect(syllabus.body.error).toBe("COURSE_NOT_FOUND");
    const subjectUrl = `/api/subjects/${courseNode.subjectId}`;
    const subject = await request(app).get(subjectUrl);
    expect(subject.body.data.courses).toEqual([]);
    const adminSubject = await request(app).get(subjectUrl).set(as(admin));
    expect(adminSubject.body.data.courses).toContainEqual(expect.objectContaining({ title: courseNode.title }));
    const filters = await request(app).get("/api/catalog/filters");
    expect(filters.body.data.courses).not.toContainEqual(expect.objectContaining({ id: courseNode._id.toString() }));
    expect((await request(app).get(`/api/admin/courses/${courseNode._id}`).set(as(admin))).status).toBe(200);
    expect((await request(app).get(`/api/classes/${classFree1._id}`)).status).toBe(200);
  });

  it("paginates the student's complete tuition history and preserves the unpaged response", async () => {
    const fixture = { classId: classFree1._id, teacherId: teacher._id, courseId: courseNode._id, studentId: student._id, enrollmentStatus: "EXPIRED", paymentSource: "DIRECT_PAYMENT", tuitionAmount: 100000 };
    const enrollments = await Enrollment.insertMany(Array.from({ length: 102 }, () => fixture));
    await Payment.insertMany(enrollments.map((enrollment, index) => ({
      enrollmentId: enrollment._id, payerUserId: student._id, gateway: "SANDBOX",
      gatewayReference: `history-${index}`, amount: 100000, paymentStatus: "FAILED",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })));
    const other = await User.create({ email: "other-history@example.test", passwordHash: hashPassword("password123"), role: "STUDENT" });
    await Payment.create({ enrollmentId: enrollments[0]._id, payerUserId: other._id, gateway: "SANDBOX", gatewayReference: "other-history", amount: 100000 });
    const list = (query) => request(app).get("/api/me/payments").set(as(student)).query(query);
    const [one, two, legacy] = await Promise.all([list({ page: 1, pageSize: 100 }), list({ page: 2, pageSize: 100 }), list({})]);
    for (const response of [one, two, legacy]) expect(response.status).toBe(200);
    expect(one.body.data).toMatchObject({ total: 102, page: 1, totalPages: 2 });
    expect(two.body.data.items).toHaveLength(2);
    expect(two.body.data.items[0].className).toBe(classFree1.className);
    expect([...one.body.data.items, ...two.body.data.items].map(({ _id }) => _id)).toEqual(legacy.body.data.map(({ _id }) => _id));
    expect(new Set(legacy.body.data.map(({ _id }) => _id)).size).toBe(102);
  });

  it.each(["teacherId", "categoryId", "subjectId"])("shows a deleted class with a missing %s but blocks its restoration", async (field) => {
    await Class.updateOne({ _id: classFree1._id }, { $set: { isDeleted: true, status: "CANCELLED", [field]: new mongoose.Types.ObjectId() } });
    const url = `/api/admin/trash/CLASS/${classFree1._id}`;
    const detail = await request(app).get(url).set(as(admin));
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ canRestore: false, restoreBlockReason: expect.any(String) });
    const restore = await request(app).post(`${url}/restore`).set(as(admin));
    expect(restore.status).toBe(409);
    expect(restore.body).toMatchObject({ error: "RESTORE_CONFLICT", details: { [field]: expect.any(String) } });
    expect((await Class.findById(classFree1._id)).isDeleted).toBe(true);
  });

  it("uses midnight in Vietnam for the default schedule over a year boundary", async () => {
    await Enrollment.create({ classId: classFree1._id, courseId: courseNode._id, teacherId: teacher._id, studentId: student._id, enrollmentStatus: "CONFIRMED", paymentSource: "FREE", tuitionAmount: 0 });
    const common = { classId: classFree1._id, className: classFree1.className, teacherId: teacher._id, status: "COMPLETED" };
    for (const [title, date] of [["Previous day", "2026-12-31T16:59:00Z"], ["January midnight", "2026-12-31T17:00:00Z"], ["January end of day", "2027-01-01T16:59:00Z"]]) {
      const startDatetime = new Date(date);
      await Session.create({ ...common, title, startDatetime, endDatetime: new Date(startDatetime.getTime() + 60000) });
    }
    const now = new Date("2026-12-31T17:01:00Z");
    const result = await studentService.getMySessions(student._id, undefined, undefined, now);
    expect(result.map(({ title }) => title)).toEqual(["January midnight", "January end of day"]);
    const explicit = await studentService.getMySessions(student._id, "2027-01-01", "2027-01-01T23:59:00+07:00", now);
    expect(explicit.map(({ title }) => title)).toEqual(["January midnight", "January end of day"]);
  });

  it("lists inactive categories only in the admin catalog and leaves deleted categories in trash", async () => {
    const [inactive] = await Category.create([
      { name: "Former Program", slug: "former-program", createdBy: admin._id, status: "INACTIVE" },
      { name: "Deleted Program", slug: "deleted-program", createdBy: admin._id, isDeleted: true },
    ]);

    const adminResponse = await request(app).get("/api/admin/categories").set(as(admin));
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data).toHaveLength(3);
    expect(adminResponse.body.data).toContainEqual(expect.objectContaining({ _id: inactive._id.toString(), status: "INACTIVE" }));
    const studentResponse = await request(app).get("/api/admin/categories").set(as(student));
    expect(studentResponse.status).toBe(403);

    const publicResponse = await request(app).get("/api/categories");
    expect(publicResponse.body.data.map(({ _id }) => _id)).toEqual([categoryDesign._id.toString(), categoryIT._id.toString()]);
  });

  it("lists subjects across categories for admins, including inactive subjects and excluding trash", async () => {
    const [inactiveSubject] = await Subject.create([
      { name: "Design Basics", slug: "design-basics", categoryId: categoryDesign._id, categoryName: categoryDesign.name, createdBy: admin._id, status: "INACTIVE" },
      { name: "Archived NodeJS", slug: "archived-nodejs", categoryId: categoryIT._id, categoryName: categoryIT.name, createdBy: admin._id, isDeleted: true },
    ]);

    const adminResponse = await request(app).get("/api/admin/subjects").set(as(admin));
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.map(({ _id }) => _id)).toEqual([
      inactiveSubject._id.toString(),
      subjectNode._id.toString(),
      subjectReact._id.toString(),
    ]);

    const studentResponse = await request(app).get("/api/admin/subjects").set(as(student));
    expect(studentResponse.status).toBe(403);

    const publicResponse = await request(app).get(`/api/categories/${categoryDesign._id}/subjects`);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.data).toEqual([]);
  });

  it("scopes course management to the selected school subjects and foreign languages before pagination", async () => {
    const [middleSchool, languages] = await Category.create([
      { name: "Trung học cơ sở", slug: "trung-hoc-co-so", createdBy: admin._id },
      { name: "Ngoại ngữ", slug: "ngoai-ngu", createdBy: admin._id },
    ]);
    const makeSubject = (name, slug, category) => ({
      name, slug, categoryId: category._id, categoryName: category.name, createdBy: admin._id,
    });
    const [math, science, english] = await Subject.create([
      makeSubject("Toán THCS", "toan-thcs", middleSchool),
      makeSubject("Khoa học tự nhiên", "khtn-thcs", middleSchool),
      makeSubject("IELTS", "ielts", languages),
    ]);
    const makeCourse = (title, slug, subject, gradeLevel) => ({
      title, slug, subjectId: subject._id, subjectName: subject.name,
      categoryId: subject.categoryId, categoryName: subject.categoryName, gradeLevel, createdBy: admin._id,
    });
    await Course.create([
      makeCourse("Toán 8", "toan-8", math, "GRADE_8"),
      makeCourse("Toán ngoài khối", "toan-5-legacy", math, "GRADE_5"),
      makeCourse("Khoa học tự nhiên 8", "khtn-8", science, "GRADE_8"),
      makeCourse("IELTS Foundation", "ielts-foundation", english, null),
    ]);

    const scope = "school-and-languages";
    const courseList = (query = {}) => request(app).get("/api/admin/courses").set(as(admin)).query({ scope, ...query });
    const result = await courseList({ pageSize: 1 });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ total: 2, totalPages: 2, items: [expect.any(Object)] });

    const search = await courseList({ search: "Toán" });
    expect(search.body.data.items.map(({ title }) => title)).toEqual(["Toán 8"]);
    const languageFilter = await courseList({ subjectId: english._id.toString() });
    expect(languageFilter.body.data.items.map(({ title }) => title)).toEqual(["IELTS Foundation"]);

    const subjectResult = await request(app).get("/api/admin/subjects").set(as(admin)).query({ scope });
    expect(subjectResult.body.data.map(({ _id }) => _id)).toEqual([english._id.toString(), math._id.toString()]);
    const unscoped = await request(app).get("/api/admin/courses").set(as(admin));
    expect(unscoped.body.data.total).toBe(6);
  });

  it("CAT-04A-01: FREE + minPrice=0 + maxPrice=5000000 returns only free classes (price = 0)", async () => {
    const res = await request(app).get("/api/classes?classTypes=FREE&minPrice=0&maxPrice=5000000");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    for (const cls of res.body.data.items) {
      expect(Number(cls.price)).toBe(0);
      expect(cls.classType).toBe("FREE");
    }
    // Verify paid classes are NOT included
    const ids = res.body.data.items.map((c) => c._id);
    expect(ids).not.toContain(classPaid1._id.toString());
    expect(ids).not.toContain(classPaid2._id.toString());
    expect(ids).not.toContain(classPaid3._id.toString());
  });

  // CAT-04A-02: FREE + minPrice=100000. Expected: KhÃ´ng cÃ³ káº¿t quáº£.
  it("CAT-04A-02: FREE + minPrice=100000 returns empty result (items=[], total=0)", async () => {
    const res = await request(app).get("/api/classes?classTypes=FREE&minPrice=100000");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });

  // CAT-04A-03: PAID + maxPrice=0. Expected: KhÃ´ng cÃ³ káº¿t quáº£.
  it("CAT-04A-03: PAID + maxPrice=0 returns empty result (items=[], total=0)", async () => {
    const res = await request(app).get("/api/classes?classTypes=PAID&maxPrice=0");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });

  // CAT-04A-04: PAID + price range. Expected: Chá»‰ cÃ³ lá»›p PAID trong khoáº£ng giÃ¡.
  it("CAT-04A-04: PAID + price range (100k - 500k) returns only paid classes within range", async () => {
    const res = await request(app).get("/api/classes?classTypes=PAID&minPrice=100000&maxPrice=500000");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const ids = res.body.data.items.map((c) => c._id);
    expect(ids).toContain(classPaid1._id.toString()); // 150k
    expect(ids).toContain(classPaid2._id.toString()); // 300k
    expect(ids).not.toContain(classPaid3._id.toString()); // 800k (exceeds 500k)
    expect(ids).not.toContain(classFree1._id.toString()); // Free
  });

  // CAT-04A-05: KhÃ´ng cÃ³ classTypes, minPrice=0. Expected: Káº¿t quáº£ Ä‘Ãºng.
  it("CAT-04A-05: No classTypes specified, minPrice=0 returns all classes (price >= 0)", async () => {
    const res = await request(app).get("/api/classes?minPrice=0");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(5);
  });

  // CAT-04A-06: maxPrice=0. Expected: Chá»‰ cÃ³ lá»›p giÃ¡ 0.
  it("CAT-04A-06: maxPrice=0 returns only classes with price 0", async () => {
    const res = await request(app).get("/api/classes?maxPrice=0");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBe(2);
    for (const cls of res.body.data.items) {
      expect(Number(cls.price)).toBe(0);
    }
  });

  // CAT-04A-07: minPrice > maxPrice. Expected: Xá»­ lÃ½ an toÃ n, khÃ´ng HTTP 500.
  it("CAT-04A-07: minPrice > maxPrice handled safely without HTTP 500 (items=[], total=0)", async () => {
    const res = await request(app).get("/api/classes?minPrice=500000&maxPrice=100000");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });

  // CAT-04A-08: minPrice Ã¢m. Expected: Xá»­ lÃ½ an toÃ n.
  it("CAT-04A-08: Negative minPrice clamped to 0 safely without HTTP 500", async () => {
    const res = await request(app).get("/api/classes?minPrice=-50000");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(5);
  });

  // CAT-04A-09: minPrice=abc. Expected: KhÃ´ng táº¡o NaN query.
  it("CAT-04A-09: Non-numeric minPrice=abc ignored safely without NaN query", async () => {
    const res = await request(app).get("/api/classes?minPrice=abc");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(5);
  });

  // CAT-04A-10: maxPrice=Infinity. Expected: KhÃ´ng táº¡o Infinity query.
  it("CAT-04A-10: maxPrice=Infinity ignored safely without creating invalid query", async () => {
    const res = await request(app).get("/api/classes?maxPrice=Infinity");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(5);
  });

  // CAT-04A-11: categoryId há»£p lá»‡ cÃ³ dá»¯ liá»‡u. Expected: ÄÃºng category.
  it("CAT-04A-11: Valid categoryId with data returns only classes in that category", async () => {
    const res = await request(app).get(`/api/classes?categoryId=${categoryDesign._id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0]._id).toBe(classFree2._id.toString());
    expect(res.body.data.items[0].categoryId).toBe(categoryDesign._id.toString());
  });

  // CAT-04A-12: categoryId há»£p lá»‡ nhÆ°ng khÃ´ng cÃ³ dá»¯ liá»‡u. Expected: items=[], total=0.
  it("CAT-04A-12: Valid categoryId without data returns empty array items=[] and total=0", async () => {
    const emptyCategoryId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/classes?categoryId=${emptyCategoryId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });

  // CAT-04A-13: categoryId sai Ä‘á»‹nh dáº¡ng. Expected: KhÃ´ng HTTP 500.
  it("CAT-04A-13: Malformed categoryId returns 400 validation error without HTTP 500", async () => {
    const res = await request(app).get("/api/classes?categoryId=not-a-valid-object-id");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  // CAT-04A-14: categoryId káº¿t há»£p subjectId. Expected: Lá»c Ä‘Ãºng cáº£ hai.
  it("CAT-04A-14: Combines categoryId and subjectId correctly", async () => {
    const res = await request(app).get(`/api/classes?categoryId=${categoryIT._id}&subjectId=${subjectReact._id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0]._id).toBe(classPaid2._id.toString());
  });

  // CAT-04A-15: categoryId káº¿t há»£p price. Expected: Lá»c Ä‘Ãºng.
  it("CAT-04A-15: Combines categoryId and price filters correctly", async () => {
    const res = await request(app).get(`/api/classes?categoryId=${categoryIT._id}&classTypes=PAID&minPrice=200000`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const ids = res.body.data.items.map((c) => c._id);
    expect(ids).toContain(classPaid2._id.toString()); // 300k
    expect(ids).toContain(classPaid3._id.toString()); // 800k
    expect(ids).not.toContain(classPaid1._id.toString()); // 150k (< 200k)
    expect(ids).not.toContain(classFree1._id.toString()); // Free
  });

  // CAT-04A-16: categoryId káº¿t há»£p search thÃ´ng thÆ°á»ng. Expected: Lá»c Ä‘Ãºng.
  it("CAT-04A-16: Combines categoryId and standard search query correctly", async () => {
    const res = await request(app).get(`/api/classes?categoryId=${categoryIT._id}&search=NodeJS`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    for (const item of res.body.data.items) {
      expect(item.categoryId).toBe(categoryIT._id.toString());
    }
  });

  // CAT-04A-17: page=-1. Expected: KhÃ´ng HTTP 500.
  it("CAT-04A-17: Negative page=-1 clamped safely to page 1 without HTTP 500", async () => {
    const res = await request(app).get("/api/classes?page=-1");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.page).toBe(1);
  });

  // CAT-04A-18: page=0. Expected: Xá»­ lÃ½ Ä‘Ãºng.
  it("CAT-04A-18: Zero page=0 clamped safely to page 1 without HTTP 500", async () => {
    const res = await request(app).get("/api/classes?page=0");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.page).toBe(1);
  });

  // CAT-04A-19: pageSize=-10. Expected: KhÃ´ng HTTP 500.
  it("CAT-04A-19: Negative pageSize=-10 safely defaulted without HTTP 500", async () => {
    const res = await request(app).get("/api/classes?pageSize=-10");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pageSize).toBe(12);
  });

  // CAT-04A-20: pageSize=500. Expected: KhÃ´ng vÆ°á»£t giá»›i háº¡n 100.
  it("CAT-04A-20: Overlarge pageSize=500 capped at 100", async () => {
    const res = await request(app).get("/api/classes?pageSize=500");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pageSize).toBe(100);
  });

  // CAT-04A-21: pageSize lÃ  chuá»—i khÃ´ng há»£p lá»‡. Expected: KhÃ´ng HTTP 500.
  it("CAT-04A-21: Invalid string pageSize defaulted safely to 12 without HTTP 500", async () => {
    const res = await request(app).get("/api/classes?pageSize=invalid");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pageSize).toBe(12);
  });

  // CAT-04A-22: Sáº¯p xáº¿p nhiá»u lá»›p cÃ³ cÃ¹ng giÃ¡. Expected: Thá»© tá»± á»•n Ä‘á»‹nh.
  it("CAT-04A-22: Sorting multiple classes with same price produces stable deterministic order", async () => {
    // Create multiple classes with exact same price
    await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectNode._id,
      className: "Same Price Class Alpha",
      classType: "PAID",
      price: 250000,
      capacity: 10,
      status: "OPEN",
    });
    await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectNode._id,
      className: "Same Price Class Beta",
      classType: "PAID",
      price: 250000,
      capacity: 10,
      status: "OPEN",
    });
    await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectNode._id,
      className: "Same Price Class Gamma",
      classType: "PAID",
      price: 250000,
      capacity: 10,
      status: "OPEN",
    });

    const res1 = await request(app).get("/api/classes?sort=price_asc");
    const res2 = await request(app).get("/api/classes?sort=price_asc");

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    const order1 = res1.body.data.items.map((c) => c._id);
    const order2 = res2.body.data.items.map((c) => c._id);
    expect(order1).toEqual(order2);
  });

  // CAT-04A-23: Pagination trang 1 vÃ  trang 2. Expected: KhÃ´ng trÃ¹ng dá»¯ liá»‡u khi dá»¯ liá»‡u khÃ´ng thay Ä‘á»•i.
  it("CAT-04A-23: Pagination page 1 and page 2 have no overlapping items", async () => {
    const page1 = await request(app).get("/api/classes?page=1&pageSize=2");
    const page2 = await request(app).get("/api/classes?page=2&pageSize=2");

    expect(page1.statusCode).toBe(200);
    expect(page2.statusCode).toBe(200);
    const ids1 = page1.body.data.items.map((c) => c._id);
    const ids2 = page2.body.data.items.map((c) => c._id);

    expect(ids1.length).toBe(2);
    expect(ids2.length).toBe(2);
    for (const id of ids1) {
      expect(ids2).not.toContain(id);
    }
  });

  // CAT-04A-24: KhÃ´ng lÃ m lá»™ lá»›p DRAFT hoáº·c PENDING_APPROVAL trong Public Catalog.
  it("CAT-04A-24: Never exposes DRAFT, PENDING_APPROVAL, or REJECTED classes in Public Catalog", async () => {
    await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectNode._id,
      className: "Secret Draft Class",
      classType: "FREE",
      price: 0,
      capacity: 10,
      status: "DRAFT",
    });
    await Class.create({
      courseId: courseNode._id,
      courseTitle: courseNode.title,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: categoryIT._id,
      subjectId: subjectNode._id,
      className: "Secret Pending Class",
      classType: "FREE",
      price: 0,
      capacity: 10,
      status: "PENDING_APPROVAL",
    });

    const res = await request(app).get("/api/classes");
    expect(res.statusCode).toBe(200);
    const names = res.body.data.items.map((c) => c.className);
    expect(names).not.toContain("Secret Draft Class");
    expect(names).not.toContain("Secret Pending Class");
  });

  // CAT-04A-25: API response schema khÃ´ng thay Ä‘á»•i.
  it("CAT-04A-25: Response contract adheres strictly to { success: true, data: { items, total, page, pageSize, totalPages } }", async () => {
    const res = await request(app).get("/api/classes");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body.data).toHaveProperty("items");
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data).toHaveProperty("total");
    expect(typeof res.body.data.total).toBe("number");
    expect(res.body.data).toHaveProperty("page");
    expect(typeof res.body.data.page).toBe("number");
    expect(res.body.data).toHaveProperty("pageSize");
    expect(typeof res.body.data.pageSize).toBe("number");
    expect(res.body.data).toHaveProperty("totalPages");
    expect(typeof res.body.data.totalPages).toBe("number");
  });

  // CAT-04A-26: Regression cÃ¡c chá»©c nÄƒng Catalog cÅ©.
  it("CAT-04A-26: Regression - legacy catalog routes work properly", async () => {
    const catRes = await request(app).get("/api/catalog/categories");
    expect(catRes.statusCode).toBe(200);
    expect(catRes.body.success).toBe(true);

    const filterRes = await request(app).get("/api/catalog/filters");
    expect(filterRes.statusCode).toBe(200);
    expect(filterRes.body.success).toBe(true);

    const classDetail = await request(app).get(`/api/classes/${classFree1._id}`);
    expect(classDetail.statusCode).toBe(200);
    expect(classDetail.body.data.className).toBe("NodeJS Free Intro");
    expect(classDetail.body.data.teacher).toBeDefined();

    const classSessions = await request(app).get(`/api/classes/${classFree1._id}/sessions`);
    expect(classSessions.statusCode).toBe(200);
  });

  // CAT-04A-27: Regression TIN-01.
  it("CAT-04A-27: TIN-01 regression - user without embedded profile can upload avatar without PROFILE_NOT_EDITABLE", async () => {
    const rawStudent = await User.create({ email: "raw_student_cat@test.com", passwordHash: hashPassword("password123"), role: "STUDENT" });
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("test png")]);
    const res = await request(app)
      .post("/api/me/avatar")
      .set(as(rawStudent))
      .attach("file", PNG, { filename: "me.png", contentType: "image/png" });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.avatarUrl).toMatch(/\/uploads\/avatar\//);
  });

  // CAT-04A-28: Regression TIN-02A.
  it("CAT-04A-28: TIN-02A regression - storageService / upload avatar accepts MIME image/jpg", async () => {
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("test jpeg data")]);
    const res = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", JPEG, { filename: "photo.jpg", contentType: "image/jpg" });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.avatarUrl).toMatch(/\.jpg$/);
  });

  // CAT-04A-29: Regression TIN-03A.
  it("CAT-04A-29: TIN-03A regression - GET /api/student/sessions/:id/join is strictly read-only (returns 405) and canJoin checks status", async () => {
    await Enrollment.create({
      classId: classFree1._id,
      courseId: classFree1.courseId,
      teacherId: teacher._id,
      studentId: student._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
    });

    const scheduledSession = await Session.create({
      classId: classFree1._id,
      className: classFree1.className,
      teacherId: teacher._id,
      title: "Scheduled Test Session",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() - 5 * 60 * 1000),
      endDatetime: new Date(Date.now() + 55 * 60 * 1000),
    });

    // 1. GET join rejected with 405 and has zero mutation side-effects
    const getRes = await request(app).get(`/api/student/sessions/${scheduledSession._id}/join`).set(as(student));
    expect(getRes.statusCode).toBe(405);
    expect(getRes.body.error).toBe("METHOD_NOT_ALLOWED");

    const attendanceCount = await SessionAttendance.countDocuments({ sessionId: scheduledSession._id, studentId: student._id });
    expect(attendanceCount).toBe(0); // Zero side effects!

    // 2. canJoin checks status via GET /api/me/sessions
    const mySessions = await request(app).get("/api/me/sessions").set(as(student));
    expect(mySessions.statusCode).toBe(200);
    const sessionItem = mySessions.body.data.find((s) => s._id === scheduledSession._id.toString());
    // Not started by the Teacher yet: a Student cannot join
    expect(sessionItem.canJoin).toBe(false);
    await Session.updateOne({ _id: scheduledSession._id }, { $set: { status: "IN_PROGRESS", roomState: "LIVE" } });
    const afterStart = await request(app).get("/api/me/sessions").set(as(student));
    expect(afterStart.body.data.find((s) => s._id === scheduledSession._id.toString()).canJoin).toBe(true);

    // 3. completed session canJoin = false
    const completedSession = await Session.create({
      classId: classFree1._id,
      className: classFree1.className,
      teacherId: teacher._id,
      title: "Completed Test Session",
      status: "COMPLETED",
      startDatetime: new Date(Date.now() - 60 * 60 * 1000),
      endDatetime: new Date(Date.now() - 10 * 60 * 1000),
    });

    const mySessions2 = await request(app).get("/api/me/sessions").set(as(student))
      .query({ from: completedSession.startDatetime.toISOString() });
    const completedItem = mySessions2.body.data.find((s) => s._id === completedSession._id.toString());
    expect(completedItem.canJoin).toBe(false);
  });
});
