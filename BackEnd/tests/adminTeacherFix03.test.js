// EDUNITY-ADMIN-TEACHER-FIX-03: fixed class price limits and safe course proposal approval.
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
  SyllabusVersion,
  CurriculumUnit,
  AuditLog,
  Notification,
  TeacherSubjectAuthorization,
  TeacherContract,
  CoursePricingPolicy,
} = require("../src/models");
const { toDec, toNum } = require("../src/utils/money");
const catalog = require("../src/services/courseCatalogService");
const teacherClassService = require("../src/services/teacherClassService");
const gate = require("../src/services/classCreationGateService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days, extra = 0) => new Date(Date.now() + days * DAY + extra);

let admin, admin2, teacher, otherTeacher, student, category, subject, course;

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});
afterAll(disconnectDB);
afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  await clearDB();
  const user = (name, role, extra = {}) =>
    User.create({ email: `${name}@fix03.test`, passwordHash: "x", role, status: "ACTIVE", ...extra });
  const verified = (fullName) => ({ teacherProfile: { fullName, verificationStatus: "VERIFIED" } });

  admin = await user("admin", "ADMIN");
  admin2 = await user("admin2", "ADMIN");
  teacher = await user("teacher", "TEACHER", verified("Giáo viên Fix03"));
  otherTeacher = await user("other", "TEACHER", verified("Giáo viên Khác"));
  student = await user("student", "STUDENT", { studentProfile: { fullName: "Học viên" } });

  category = await Category.create({ name: "THPT", slug: "thpt-fix03", createdBy: admin._id });
  subject = await Subject.create({
    name: "Toán",
    slug: "toan-fix03",
    categoryId: category._id,
    categoryName: category.name,
    createdBy: admin._id,
  });
  course = await Course.create({
    title: "Toán 12",
    slug: "toan-12-fix03",
    categoryId: category._id,
    categoryName: category.name,
    subjectId: subject._id,
    subjectName: subject.name,
    gradeLevel: "GRADE_12",
    level: "ADVANCED",
    createdBy: admin._id,
  });
});

const call = (user, method, url, body) => {
  const req = request(app)[method](`/api${url}`).set({ "x-user-id": user._id.toString() });
  return body === undefined ? req : req.send(body);
};

describe("Class price limits", () => {
  const createClass = (body = {}) =>
    call(teacher, "post", "/teacher/classes", {
      courseId: course._id,
      className: "Lớp Học Phí",
      classType: "PAID",
      price: 500000,
      capacity: 20,
      ...body,
    });

  const completeDraft = async (body = {}) => {
    const created = await createClass({
      description: "Ôn thi",
      enrollmentStart: inDays(-1),
      enrollmentEnd: inDays(2),
      startDate: inDays(3),
      endDate: inDays(30),
      schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      ...body,
    });
    expect(created.statusCode).toBe(201);
    const id = created.body.data.id;
    const sessions = await call(teacher, "post", `/teacher/classes/${id}/sessions`, {
      sessions: [{ title: "Buổi 1", startDatetime: inDays(4), endDatetime: inDays(4, 60 * 60 * 1000) }],
    });
    expect(sessions.statusCode).toBe(201);
    return id;
  };

  const allowTeaching = () =>
    Promise.all([
      TeacherSubjectAuthorization.create({
        teacherId: teacher._id,
        subjectId: subject._id,
        categoryId: category._id,
        gradeLevel: "GRADE_12",
        level: "ADVANCED",
        status: "APPROVED",
        createdBy: admin._id,
      }),
      TeacherContract.create({
        contractCode: "HD-FIX03",
        teacherId: teacher._id,
        status: "ACTIVE",
        effectiveFrom: inDays(-1),
        expiresAt: inDays(365),
        provider: { name: "SANDBOX", envelopeId: "SBX-FIX03" },
        createdBy: admin._id,
        sentAt: new Date(),
        signedAt: new Date(),
      }),
    ]);

  const submit = (id) => call(teacher, "post", `/teacher/classes/${id}/submit`);
  const approve = (id) => call(admin, "post", `/admin/classes/${id}/approve`, {});

  test.each([
    ["PAID", 1000],
    ["PAID", 500000],
    ["PAID", 3000000],
    ["PAID", 5000000],
    ["FREE", 0],
  ])("%s = %p passes create, submit and approval without any pricing policy", async (classType, price) => {
    await allowTeaching();
    const id = await completeDraft({ classType, price });

    expect((await submit(id)).statusCode).toBe(200);
    const opened = await approve(id);

    expect(opened.statusCode).toBe(200);
    expect(opened.body.data.status).toBe("OPEN");
    expect(toNum((await Class.findById(id).lean()).price)).toBe(price); // never adjusted
    expect(await CoursePricingPolicy.countDocuments()).toBe(0);
  });

  test.each([
    ["PAID", 999],
    ["PAID", 5000001],
    ["PAID", 1000.5],
    ["PAID", 0],
    ["FREE", 1000],
  ])("%s = %p is refused on create and update", async (classType, price) => {
    const refused = await createClass({ classType, price });
    expect(refused.statusCode).toBe(400);
    expect(refused.body.error).toBe("CLASS_PRICE_OUT_OF_RANGE");
    expect(await Class.countDocuments()).toBe(0);

    const id = (await createClass()).body.data.id;
    const edited = await call(teacher, "patch", `/teacher/classes/${id}`, { classType, price });
    expect(edited.body.error).toBe("CLASS_PRICE_OUT_OF_RANGE");
    expect(toNum((await Class.findById(id).lean()).price)).toBe(500000);
  });

  test.each([-1, "-1", "NaN", "Infinity", "", "abc", null, true, [1000], { $gt: 0 }])(
    "a malformed price %p is refused",
    async (price) => {
      expect((await createClass({ price })).statusCode).toBe(400);
      expect(await Class.countDocuments()).toBe(0);
    }
  );

  test.each([NaN, Infinity, -Infinity])("a non-finite number %p is refused by the service", async (price) => {
    await expect(
      teacherClassService.createClass(teacher._id, {
        courseId: String(course._id),
        className: "Lớp Học Phí",
        classType: "PAID",
        capacity: 20,
        price,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("a PAID class is never given a price by the Backend", async () => {
    expect((await createClass({ price: undefined })).body.error).toBe("CLASS_PRICE_OUT_OF_RANGE");
    const free = await createClass({ classType: "FREE", price: 0 });
    const edited = await call(teacher, "patch", `/teacher/classes/${free.body.data.id}`, { classType: "PAID" });
    expect(edited.body.error).toBe("CLASS_PRICE_OUT_OF_RANGE");
  });

  test.each([
    ["PAID", "999"],
    ["PAID", "8000000"],
    ["PAID", "1000.5"],
    ["PAID", "NaN"],
    ["FREE", "1000"],
  ])("a stored %s price of %s blocks submission and approval", async (classType, price) => {
    await allowTeaching();
    const id = await completeDraft();
    await Class.updateOne({ _id: id }, { $set: { classType, price: toDec(price) } });

    expect((await submit(id)).body.error).toBe("CLASS_PRICE_OUT_OF_RANGE");
    expect((await Class.findById(id).lean()).status).toBe("DRAFT");

    await Class.updateOne({ _id: id }, { $set: { status: "PENDING_APPROVAL" } });
    expect((await approve(id)).body.error).toBe("CLASS_PRICE_OUT_OF_RANGE");
    expect((await Class.findById(id).lean()).status).toBe("PENDING_APPROVAL");
  });

  test("an old policy neither blocks a class nor loses its stored data", async () => {
    await allowTeaching();
    const policy = await CoursePricingPolicy.create({
      policyKey: "GLOBAL:ALL:FIX03",
      version: 1,
      name: "Khung giá cũ",
      scopeType: "GLOBAL",
      classType: "ALL",
      minPrice: 900000,
      maxPrice: 2000000,
      minSessions: 10,
      maxSessions: 20,
      effectiveFrom: inDays(-1),
      createdBy: admin._id,
    });
    const id = await completeDraft();
    const history = { pricingPolicyId: policy._id, pricingPolicyKey: policy.policyKey, pricingPolicyVersion: 1 };
    await Class.updateOne({ _id: id }, { $set: history });

    expect((await call(teacher, "patch", `/teacher/classes/${id}`, { price: 3000000 })).statusCode).toBe(200);
    expect((await submit(id)).statusCode).toBe(200);
    expect((await approve(id)).statusCode).toBe(200);

    expect(await Class.findById(id).lean()).toMatchObject(history);
    expect((await CoursePricingPolicy.findById(policy._id).lean()).status).toBe("ACTIVE");
  });

  test("readiness shows the price, its range and why it fails", async () => {
    const id = await completeDraft();
    await Class.updateOne({ _id: id }, { $set: { price: toDec(999) } });

    const { body } = await call(teacher, "get", `/teacher/classes/${id}/readiness`);
    const check = body.data.checks.find((item) => item.key === "CLASS_PRICE_RANGE");

    expect(body.data.tuition).toEqual({ current: 999, minPrice: 1000, maxPrice: 5000000 });
    expect(check).toMatchObject({ label: "Học phí", status: "PENDING", blocksSubmit: true });
    expect(check.message).toContain("1.000");
    expect(check.message).toContain("5.000.000");
    expect(body.data.canSubmit).toBe(false);
  });

  const readClassForm = () => fs.readFileSync(path.resolve(__dirname, "../../FrontEnd/src/utils/classForm.ts"), "utf8");

  // The FrontEnd has no unit runner; this body is plain JS
  test.each([
    ["1000", 1000],
    [1000, 1000],
    ["500.000", 500000],
    ["5.000.000", 5000000],
    ["5,000,000", 5000000],
    ["5.000.000đ", NaN],
    ["5 000 000", NaN],
    ["5.000.00", NaN],
    ["5000k", NaN],
    ["1000.5", NaN],
    ["1000.500", NaN],
    ["5.000,000", NaN],
    ["-1", NaN],
    ["", NaN],
  ])("the price field reads %p as %p, never as another amount", (typed, expected) => {
    const body = readClassForm().match(/parsePrice = \(value: unknown\) => \{([\s\S]*?)\r?\n\};/)[1];
    expect(new Function("value", body)(typed)).toBe(expected);
  });

  test("Frontend and Backend use the same limits", () => {
    const source = readClassForm();
    const limit = (name) => Number(source.match(new RegExp(`${name} = ([\\d_]+)`))?.[1].replace(/_/g, ""));
    expect([gate.MIN_CLASS_PRICE, gate.MAX_CLASS_PRICE]).toEqual([1000, 5000000]);
    expect([limit("MIN_CLASS_PRICE"), limit("MAX_CLASS_PRICE")]).toEqual([1000, 5000000]);
  });
});

describe("Course proposal approval", () => {
  const propose = async (body = {}) => {
    const res = await call(teacher, "post", "/teacher/course-proposals", {
      categoryId: category._id,
      subjectId: subject._id,
      title: "Giải tích 12 chuyên sâu",
      description: "Chuyên đề",
      level: "ADVANCED",
      gradeLevel: "GRADE_12",
      syllabusDraft: { summary: "Hai chương", units: [{ title: "Giới hạn" }, { title: "Đạo hàm" }] },
      ...body,
    });
    expect(res.statusCode).toBe(201);
    return res.body.data.id;
  };
  const approve = (id, body = {}, user = admin) => call(user, "post", `/admin/course-proposals/${id}/approve`, body);
  const stateOf = async (id) => (await CourseProposal.findById(id).lean()).status;
  const expectNothingCreated = async (id) => {
    expect(await Course.countDocuments({ sourceProposalId: id })).toBe(0);
    expect(await SyllabusVersion.countDocuments()).toBe(0);
    expect(await CurriculumUnit.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: "COURSE_PROPOSAL_APPROVED" })).toBe(0);
    expect(await Notification.countDocuments({ type: "COURSE_PROPOSAL_APPROVED" })).toBe(0);
  };

  test("1-4, 9. approval creates one ACTIVE Course with its syllabus, links it and notifies its teacher only", async () => {
    const id = await propose();

    const res = await approve(id, { reviewNote: "Đạt", revisionNumber: 1 });

    expect(res.statusCode).toBe(200);
    const created = await Course.findOne({ sourceProposalId: id }).lean();
    expect(created).toMatchObject({ status: "ACTIVE", gradeLevel: "GRADE_12", level: "ADVANCED" });
    expect(String(created.categoryId)).toBe(String(category._id));
    expect(String(created.subjectId)).toBe(String(subject._id));

    const proposal = await CourseProposal.findById(id).lean();
    expect(proposal.status).toBe("APPROVED");
    expect(String(proposal.approvedCourseId)).toBe(String(created._id));
    expect(String(res.body.data.proposal.approvedCourseId)).toBe(String(created._id));

    const version = await SyllabusVersion.findOne({ courseId: created._id }).lean();
    expect(version).toMatchObject({ status: "PUBLISHED", versionNumber: 1 });
    expect(String(created.publishedSyllabusVersionId)).toBe(String(version._id));
    expect(await CurriculumUnit.countDocuments({ syllabusVersionId: version._id })).toBe(2);

    const notices = await Notification.find({ type: "COURSE_PROPOSAL_APPROVED" }).lean();
    expect(notices.map((notice) => String(notice.userId))).toEqual([String(teacher._id)]);
    expect(await AuditLog.countDocuments({ action: "COURSE_PROPOSAL_APPROVED" })).toBe(1);

    expect(JSON.stringify((await request(app).get("/api/courses")).body)).toContain(String(created._id));
    const draft = await call(otherTeacher, "post", "/teacher/classes", {
      courseId: created._id,
      className: "Lớp từ khóa mới",
      classType: "PAID",
      price: 1000,
      capacity: 10,
    });
    expect(draft.statusCode).toBe(201);
  });

  test.each([2, 3, 6])("5. %i simultaneous approvals create one Course", async (count) => {
    const id = await propose();

    const results = await Promise.all(Array.from({ length: count }, (_, i) => approve(id, {}, i % 2 ? admin2 : admin)));

    expect(results.filter((res) => res.statusCode === 200)).toHaveLength(1);
    expect(results.filter((res) => res.statusCode !== 200).map((res) => res.body.error)).toEqual(
      Array(count - 1).fill("COURSE_PROPOSAL_NOT_PENDING")
    );
    expect(await Course.countDocuments({ sourceProposalId: id })).toBe(1);
    expect(await SyllabusVersion.countDocuments()).toBe(1);
    expect(await AuditLog.countDocuments({ action: "COURSE_PROPOSAL_APPROVED" })).toBe(1);
    expect(await Notification.countDocuments({ type: "COURSE_PROPOSAL_APPROVED" })).toBe(1);
  });

  test("5b. approve racing reject leaves one decision", async () => {
    const id = await propose();

    const results = await Promise.all([approve(id), call(admin2, "post", `/admin/course-proposals/${id}/reject`, {})]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409]);
    expect(await Course.countDocuments({ sourceProposalId: id })).toBe((await stateOf(id)) === "APPROVED" ? 1 : 0);
  });

  test.each([
    ["the syllabus units", () => CurriculumUnit, "insertMany"],
    ["the audit log", () => AuditLog, "create"],
  ])("6. a failure writing %s rolls everything back", async (_name, model, method) => {
    const id = await propose();
    jest.spyOn(model(), method).mockRejectedValueOnce(new Error("write failed"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    expect((await approve(id)).statusCode).toBe(500);

    expect(await CourseProposal.findById(id).lean()).toMatchObject({ status: "PENDING_REVIEW", approvedCourseId: null });
    await expectNothingCreated(id);
  });

  test.each(["REJECTED", "NEED_CHANGES", "APPROVED"])("7. a %s proposal cannot be approved", async (status) => {
    const id = await propose();
    await CourseProposal.updateOne({ _id: id }, { $set: { status } });

    const res = await approve(id);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("COURSE_PROPOSAL_NOT_PENDING");
    await expectNothingCreated(id);
  });

  test("8. only an Admin can approve", async () => {
    const id = await propose();
    for (const user of [teacher, otherTeacher, student]) expect((await approve(id, {}, user)).statusCode).toBe(403);
    expect(await stateOf(id)).toBe("PENDING_REVIEW");
    await expectNothingCreated(id);
  });

  test.each([
    ["category is INACTIVE", () => Category.updateOne({ _id: category._id }, { status: "INACTIVE" }), "PROPOSAL_CATALOG_INACTIVE"],
    ["subject is INACTIVE", () => Subject.updateOne({ _id: subject._id }, { status: "INACTIVE" }), "PROPOSAL_CATALOG_INACTIVE"],
    ["category is deleted", () => Category.updateOne({ _id: category._id }, { isDeleted: true }), "CATEGORY_NOT_FOUND"],
    [
      "subject moved to another category",
      async () => {
        const other = await Category.create({ name: "Ngoại ngữ", slug: "ngoai-ngu-fix03", createdBy: admin._id });
        await Subject.updateOne({ _id: subject._id }, { categoryId: other._id });
      },
      "SUBJECT_CATEGORY_MISMATCH",
    ],
    ["title is taken", () => Course.updateOne({ _id: course._id }, { title: "Giải tích 12 chuyên sâu" }), "DUPLICATE_COURSE"],
  ])("is refused when the %s", async (_name, change, code) => {
    const id = await propose();
    await change();

    expect((await approve(id)).body.error).toBe(code);

    expect(await stateOf(id)).toBe("PENDING_REVIEW");
    await expectNothingCreated(id);
  });

  test.each([
    ["outside the category", "GRADE_1", "GRADE_LEVEL_CATEGORY_MISMATCH"],
    ["missing where the category requires one", null, "GRADE_LEVEL_REQUIRED"],
  ])("a grade %s is refused", async (_name, gradeLevel, code) => {
    const id = await propose();
    expect((await approve(id, { gradeLevel })).body.error).toBe(code);
    await expectNothingCreated(id);
  });

  test("the grade is required in a category without grade groups too", async () => {
    await Category.updateOne({ _id: category._id }, { name: "Ngoại ngữ", slug: "ngoai-ngu-fix03" });
    const id = await propose();

    const res = await approve(id, { gradeLevel: null });

    expect(res.body.error).toBe("GRADE_LEVEL_REQUIRED");
    await expectNothingCreated(id);
  });

  test("an invalid syllabus is refused", async () => {
    const id = await propose();
    const units = [{ unitOrder: 1, title: "A" }, { unitOrder: 1, title: "B" }];
    expect((await approve(id, { syllabusDraft: { units } })).body.error).toBe("DUPLICATE_UNIT_ORDER");
    await expectNothingCreated(id);
  });

  test("a revision the Admin has not seen is not approved", async () => {
    const id = await propose();
    expect((await call(teacher, "patch", `/teacher/course-proposals/${id}`, { description: "Bản 2" })).statusCode).toBe(200);

    expect((await approve(id, { revisionNumber: 1 })).body.error).toBe("COURSE_PROPOSAL_CHANGED");

    await expectNothingCreated(id);
    expect((await approve(id, { revisionNumber: 2 })).statusCode).toBe(200);
  });

  test("an edit during the approval checks stops the approval", async () => {
    const id = await propose();
    const read = catalog.getCategoryOrThrow;
    jest.spyOn(catalog, "getCategoryOrThrow").mockImplementationOnce(async (categoryId) => {
      await call(teacher, "patch", `/teacher/course-proposals/${id}`, { title: "Tên vừa sửa" });
      return read(categoryId);
    });

    expect((await approve(id)).body.error).toBe("COURSE_PROPOSAL_CHANGED");

    expect(await stateOf(id)).toBe("PENDING_REVIEW");
    await expectNothingCreated(id);
  });

  test("an edit still in flight cannot change an approved proposal", async () => {
    const id = await propose();
    const save = CourseProposal.prototype.save;
    jest.spyOn(CourseProposal.prototype, "save").mockImplementationOnce(async function (...args) {
      expect((await approve(id)).statusCode).toBe(200);
      return save.apply(this, args);
    });

    const res = await call(teacher, "patch", `/teacher/course-proposals/${id}`, { title: "Tên sửa muộn" });

    expect(res.body.error).toBe("COURSE_PROPOSAL_NOT_EDITABLE");
    expect(await CourseProposal.findById(id).lean()).toMatchObject({ status: "APPROVED", title: "Giải tích 12 chuyên sâu" });
  });
});
