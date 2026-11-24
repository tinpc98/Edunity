// TEACHER-CLASS-FLOW-02: drafting needs a signed contract and a teaching authorization, approval enforces both again.
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
  AuditLog,
  Notification,
  TeacherSubjectAuthorization,
  TeacherContract,
} = require("../src/models");
const teacherClassService = require("../src/services/teacherClassService");
const adminClassService = require("../src/services/adminClassService");
const auditService = require("../src/services/auditService");
const { rejectExpiredPendingClasses } = require("../src/jobs/maintenanceJob");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days, extra = 0) => new Date(Date.now() + days * DAY + extra);
const as = (user) => ({ "x-user-id": user._id.toString() });
const codes = (checks) => checks.map((check) => check.code);

let admin, admin2, teacher, otherTeacher, student, category, subject, course;

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});
afterAll(disconnectDB);
afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  await clearDB();
  const user = (email, role, extra = {}) =>
    User.create({ email: `${email}@flow02.test`, passwordHash: "x", role, status: "ACTIVE", ...extra });
  const verified = (fullName) => ({ teacherProfile: { fullName, verificationStatus: "VERIFIED" } });

  admin = await user("admin", "ADMIN");
  admin2 = await user("admin2", "ADMIN");
  teacher = await user("teacher", "TEACHER", verified("Giáo viên Flow"));
  otherTeacher = await user("other", "TEACHER", verified("Giáo viên Khác"));
  student = await user("student", "STUDENT", { studentProfile: { fullName: "Học viên" } });

  category = await Category.create({ name: "THPT", slug: "thpt-flow02", createdBy: admin._id });
  subject = await Subject.create({
    name: "Toán",
    slug: "toan-flow02",
    categoryId: category._id,
    categoryName: category.name,
    createdBy: admin._id,
  });
  await signContract();
  await grant.authorization();
  course = await Course.create({
    title: "Toán 12",
    slug: "toan-12-flow02",
    categoryId: category._id,
    categoryName: category.name,
    subjectId: subject._id,
    subjectName: subject.name,
    gradeLevel: "GRADE_12",
    level: "ADVANCED",
    createdBy: admin._id,
  });
});

// The teacher starts authorized for the course's subject and grade; a test changes or withdraws that one record
const grant = {
  authorization: (overrides = {}) =>
    TeacherSubjectAuthorization.findOneAndUpdate(
      { teacherId: teacher._id, subjectId: subject._id },
      {
        $set: { categoryId: category._id, gradeLevel: "GRADE_12", level: "ADVANCED", status: "APPROVED", ...overrides },
        $setOnInsert: { createdBy: admin._id },
      },
      { upsert: true }
    ),
  contract: (overrides = {}) =>
    TeacherContract.updateOne({ teacherId: teacher._id }, { $set: { status: "ACTIVE", ...overrides } }),
};
const signContract = () =>
  TeacherContract.create({
      contractCode: "HD-FLOW02",
      teacherId: teacher._id,
      status: "ACTIVE",
      effectiveFrom: inDays(-1),
      expiresAt: inDays(365),
      provider: { name: "SANDBOX", envelopeId: "SBX-FLOW02" },
      createdBy: admin._id,
      sentAt: new Date(),
      signedAt: new Date(),
    });
const revokeContract = () => TeacherContract.deleteMany({ teacherId: teacher._id });
const revokeAuthorization = () => TeacherSubjectAuthorization.deleteMany({ teacherId: teacher._id });
const revoke = { authorization: revokeAuthorization, contract: revokeContract };
const grantAllExcept = async (...skipped) => {
  for (const [name, create] of Object.entries(grant)) if (!skipped.includes(name)) await create();
};

const call = (user, method, url, body) => {
  const req = request(app)[method](`/api${url}`).set(as(user));
  return body === undefined ? req : req.send(body);
};
const create = (body = {}, user = teacher) =>
  call(user, "post", "/teacher/classes", {
    courseId: course._id,
    className: "Lớp Bí Mật Flow02",
    classType: "PAID",
    price: 500000,
    capacity: 20,
    ...body,
  });
const completeFields = () => ({
  description: "Ôn thi",
  enrollmentStart: inDays(-1),
  enrollmentEnd: inDays(2),
  startDate: inDays(3),
  endDate: inDays(30),
  schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
});
const completeDraft = async (fields = {}) => {
  const created = await create({ ...completeFields(), ...fields });
  expect(created.statusCode).toBe(201);
  expect(created.body.data.sessionPlan.generatedCount).toBeGreaterThan(0); // planned from the weekly schedule
  return created.body.data.id;
};
const submit = (id) => call(teacher, "post", `/teacher/classes/${id}/submit`);
const approve = (id, user = admin) => call(user, "post", `/admin/classes/${id}/approve`, {});
const pendingClass = async () => {
  const id = await completeDraft();
  expect((await submit(id)).statusCode).toBe(200);
  return id;
};
const statusOf = async (id) => (await Class.findById(id).lean()).status;
const auditsOf = (id, action) => AuditLog.countDocuments({ targetId: id, action });

describe("Creating and saving a DRAFT", () => {
  test("3. without a pricing policy", async () => {
    const res = await create();

    expect(res.statusCode).toBe(201);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.pricingPolicyId).toBeNull();
  });

  test.each([
    ["no authorization", () => revokeAuthorization(), "SUBJECT_AUTHORIZATION_REQUIRED"],
    ["an authorization for another grade", () => grant.authorization({ gradeLevel: "GRADE_11" }), "SUBJECT_AUTHORIZATION_REQUIRED"],
    ["an authorization awaiting Admin", () => grant.authorization({ status: "PENDING" }), "SUBJECT_AUTHORIZATION_PENDING"],
    ["a suspended authorization", () => grant.authorization({ status: "SUSPENDED" }), "SUBJECT_AUTHORIZATION_SUSPENDED"],
  ])("1. a teacher with %s cannot create a class", async (_name, setAuthorization, code) => {
    await setAuthorization();
    const res = await create();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe(code);
    expect(await Class.countDocuments()).toBe(0);
  });

  test("1b. a class cannot be moved to a course the teacher is not authorized for", async () => {
    const id = (await create()).body.data.id;
    const other = await Course.create({
      title: "Toán 11",
      slug: "toan-11-flow02",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      gradeLevel: "GRADE_11",
      createdBy: admin._id,
    });
    const res = await call(teacher, "patch", `/teacher/classes/${id}`, { courseId: other._id });
    expect(res.body.error).toBe("SUBJECT_AUTHORIZATION_REQUIRED");
    expect(String((await Class.findById(id).lean()).courseId)).toBe(String(course._id));
  });

  test.each([
    ["no contract", () => revokeContract(), "TEACHER_CONTRACT_NOT_FOUND"],
    ["a contract awaiting signature", () => grant.contract({ status: "PENDING_SIGNATURE", signedAt: null }), "TEACHER_CONTRACT_NOT_ACTIVE"],
    ["an expired contract", () => grant.contract({ effectiveFrom: inDays(-9), expiresAt: inDays(-1) }), "TEACHER_CONTRACT_EXPIRED"],
  ])("2. a teacher with %s cannot create a class", async (_name, setContract, code) => {
    await setContract();
    const res = await create();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe(code);
    expect(await Class.countDocuments()).toBe(0);
  });

  test("a saved DRAFT gets one session per weekly slot, rebuilt when the schedule changes", async () => {
    const id = (await create(completeFields())).body.data.id;
    const planned = await Session.find({ classId: id }).sort({ startDatetime: 1 }).lean();
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.map((p) => p.sessionNumber)).toEqual(planned.map((_, i) => i + 1));
    expect(planned.every((p) => p.scheduleSource === "SCHEDULE_GENERATED" && p.status === "SCHEDULED")).toBe(true);

    const twice = await call(teacher, "patch", `/teacher/classes/${id}`, {
      schedule: [
        { dayOfWeek: 1, startTime: "19:00", endTime: "21:00" },
        { dayOfWeek: 3, startTime: "19:00", endTime: "21:00" },
      ],
    });
    expect(twice.body.data.sessionPlan.generatedCount).toBeGreaterThan(planned.length);
    expect(await Session.countDocuments({ classId: id })).toBe(twice.body.data.sessionPlan.generatedCount);

    const none = await call(teacher, "patch", `/teacher/classes/${id}`, { schedule: [] });
    expect(none.body.data.sessionPlan.generatedCount).toBe(0);
    expect(await Session.countDocuments({ classId: id })).toBe(0);
  });

  test("a renamed session keeps its name when the class is edited without touching its schedule", async () => {
    const id = await completeDraft();
    const first = await Session.findOne({ classId: id }).sort({ startDatetime: 1 }).lean();
    const renamed = await call(teacher, "patch", `/teacher/sessions/${first._id}`, { title: "Buổi mở đầu: Đa thức" });
    expect(renamed.statusCode).toBe(200);

    const edited = await call(teacher, "patch", `/teacher/classes/${id}`, { description: "Mô tả mới", capacity: 25 });
    expect(edited.statusCode).toBe(200);
    expect(edited.body.data.sessionPlan).toBeUndefined();
    expect((await Session.findById(first._id).lean()).title).toBe("Buổi mở đầu: Đa thức");

    // the same schedule sent again is not a change either
    await call(teacher, "patch", `/teacher/classes/${id}`, { schedule: completeFields().schedule });
    expect((await Session.findById(first._id).lean()).title).toBe("Buổi mở đầu: Đa thức");
  });

  test("the teacher's busy sessions are listed for checking a schedule before saving", async () => {
    const id = await completeDraft();
    const own = await Session.find({ classId: id }).lean();
    const range = { from: inDays(0).toISOString(), to: inDays(40).toISOString() };
    const busy = (query) => call(teacher, "get", `/teacher/sessions/busy?${new URLSearchParams(query)}`);

    const all = await busy(range);
    expect(all.statusCode).toBe(200);
    expect(all.body.data).toHaveLength(own.length);
    expect(Object.keys(all.body.data[0]).sort()).toEqual(["_id", "classId", "className", "endDatetime", "id", "startDatetime", "title"]);
    expect((await busy({ ...range, excludeClassId: id })).body.data).toHaveLength(0);
    expect((await call(otherTeacher, "get", `/teacher/sessions/busy?${new URLSearchParams(range)}`)).body.data).toHaveLength(0);

    for (const bad of [{}, { from: "x", to: range.to }, { from: range.to, to: range.from }, { ...range, excludeClassId: "nope" }, { from: inDays(0).toISOString(), to: inDays(500).toISOString() }]) {
      expect((await busy(bad)).statusCode).toBe(400);
    }
    expect((await call(student, "get", `/teacher/sessions/busy?${new URLSearchParams(range)}`)).statusCode).toBe(403);
  });

  test("a schedule clashing with another class saves the class and reports why no session was planned", async () => {
    await completeDraft();
    const res = await create(completeFields());
    expect(res.statusCode).toBe(201);
    expect(res.body.data.sessionPlan).toMatchObject({ generatedCount: 0, error: { code: "SESSION_TIME_CONFLICT" } });
    expect(await Session.countDocuments({ classId: res.body.data.id })).toBe(0);
  });

  test("4. a DRAFT without schedule, dates or sessions is saved and can be saved again", async () => {
    const res = await create();
    expect(res.statusCode).toBe(201);
    expect(res.body.data.schedule).toEqual([]);

    const edited = await call(teacher, "patch", `/teacher/classes/${res.body.data.id}`, { description: "Đang soạn" });
    expect(edited.statusCode).toBe(200);
    expect(edited.body.data.status).toBe("DRAFT");
  });

  test("entered data is still validated and cannot set status or owner", async () => {
    for (const bad of [
      { price: -1 },
      { capacity: 0 },
      { classType: "FREE", price: 5000 },
      { startDate: "not-a-date" },
      { startDate: inDays(5), endDate: inDays(4) },
      { schedule: [{ dayOfWeek: 8, startTime: "19:00", endTime: "20:00" }] },
    ]) {
      expect((await create(bad)).statusCode).toBe(400);
    }
    expect((await create({ courseId: { $ne: null } })).body.error).toBe("COURSE_NOT_FOUND");
    expect(await Class.countDocuments()).toBe(0);

    const res = await create({ status: "OPEN", teacherId: otherTeacher._id });
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.teacherId).toBe(teacher._id.toString());
  });

  test("an INACTIVE course is refused", async () => {
    await Course.updateOne({ _id: course._id }, { $set: { status: "INACTIVE" } });
    expect((await create()).body.error).toBe("COURSE_NOT_FOUND");
  });

  test("an expired verification blocks create, edit, submit and approval", async () => {
    await grantAllExcept();
    const draft = await completeDraft();
    const expire = () => User.updateOne({ _id: teacher._id }, { $set: { "teacherProfile.verifiedUntil": inDays(-1) } });

    await expire();
    for (const res of [await create(), await call(teacher, "patch", `/teacher/classes/${draft}`, {}), await submit(draft)]) {
      expect(res.body.error).toBe("TEACHER_REVERIFICATION_REQUIRED");
    }

    await Class.updateOne({ _id: draft }, { $set: { status: "PENDING_APPROVAL" } });
    expect((await approve(draft)).body.error).toBe("TEACHER_REVERIFICATION_REQUIRED");
  });

  test("11. another teacher cannot read, edit or submit the DRAFT", async () => {
    const id = await completeDraft();

    expect((await call(otherTeacher, "get", `/teacher/classes/${id}`)).statusCode).toBe(403);
    expect((await call(otherTeacher, "get", `/teacher/classes/${id}/readiness`)).statusCode).toBe(403);
    expect((await call(otherTeacher, "patch", `/teacher/classes/${id}`, { capacity: 9 })).statusCode).toBe(403);
    expect((await call(otherTeacher, "post", `/teacher/classes/${id}/submit`)).statusCode).toBe(403);
    expect((await Class.findById(id).lean()).capacity).toBe(20);
  });

  test("12. a student cannot create a class, and a teacher cannot approve one", async () => {
    expect((await create({}, student)).statusCode).toBe(403);
    expect(await Class.countDocuments()).toBe(0);

    await grantAllExcept();
    const id = await pendingClass();
    expect((await approve(id, teacher)).statusCode).toBe(403);
    expect((await call(teacher, "get", `/admin/classes/${id}/readiness`)).statusCode).toBe(403);
    expect(await statusOf(id)).toBe("PENDING_APPROVAL");
  });

  test("13. DRAFT, PENDING_APPROVAL and NEED_CHANGES stay out of every public listing and detail", async () => {
    const id = await completeDraft();

    for (const status of ["DRAFT", "PENDING_APPROVAL", "NEED_CHANGES"]) {
      await Class.updateOne({ _id: id }, { $set: { status } });
      for (const url of [
        "/classes",
        `/classes?statuses=${status}`,
        `/classes/${id}`,
        `/classes/${id}/sessions`,
        `/classes/${id}/syllabus`,
        `/courses/${course._id}/classes`,
        `/teachers/${teacher._id}`,
      ]) {
        const res = await request(app).get(`/api${url}`);
        expect(res.statusCode).toBeLessThan(500);
        expect(JSON.stringify(res.body)).not.toContain(id);
        expect(JSON.stringify(res.body)).not.toContain("Lớp Bí Mật Flow02");
      }
      expect((await call(student, "post", `/classes/${id}/enrollments`)).body.error).toBe("CLASS_NOT_OPEN");
    }
  });
});

describe("Submitting", () => {
  test("5. a DRAFT without schedule is refused, with everything that is missing", async () => {
    const id = (await create()).body.data.id;

    const res = await submit(id);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("CLASS_INCOMPLETE");
    expect(res.body.details.missing).toEqual(
      ["description", "enrollmentStart", "enrollmentEnd", "startDate", "endDate", "schedule", "sessions"]
    );
    // governance is never a reason to refuse a submission
    expect(res.body.details.pendingChecks.every((check) => check.blocksSubmit)).toBe(true);
    expect(await statusOf(id)).toBe("DRAFT");
    expect(await auditsOf(id, "CLASS_SUBMITTED")).toBe(0);
    expect(await Notification.countDocuments({ type: "CLASS_SUBMITTED" })).toBe(0);
  });

  test("5b. only the schedule missing is still refused", async () => {
    const id = await completeDraft();
    await call(teacher, "patch", `/teacher/classes/${id}`, { schedule: [] });
    const res = await submit(id);
    expect(res.body.error).toBe("CLASS_INCOMPLETE");
    expect(res.body.details.missing).toEqual(["schedule", "sessions"]);
  });

  test("6a. a class whose authorization was withdrawn after drafting cannot be submitted", async () => {
    const id = await completeDraft();
    await revokeAuthorization();

    const res = await submit(id);

    expect(res.body.error).toBe("SUBJECT_AUTHORIZATION_REQUIRED");
    expect(await statusOf(id)).toBe("DRAFT");
    expect(await auditsOf(id, "CLASS_SUBMITTED")).toBe(0);
    expect(await TeacherSubjectAuthorization.countDocuments()).toBe(0);
  });

  test.each([
    ["contract", "TEACHER_CONTRACT_NOT_FOUND"],
  ])("6. a complete class missing %s is submitted with a warning and grants nothing", async (skipped, code) => {
    const id = await completeDraft();
    await revokeContract();

    const res = await submit(id);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe("PENDING_APPROVAL");
    expect(codes(res.body.data.approvalWarnings)).toEqual([code]);

    const log = await AuditLog.findOne({ targetId: id, action: "CLASS_SUBMITTED" }).lean();
    expect(log.actorType).toBe("SYSTEM");
    expect(log.afterState).toMatchObject({ submittedBy: teacher._id.toString(), pendingConditions: [code] });
    expect(await Notification.countDocuments({ type: "CLASS_SUBMITTED" })).toBe(2); // one per admin

    expect(await TeacherContract.countDocuments()).toBe(0);
  });

  test.each([
    ["the start day has come", () => ({ startDate: new Date() }), "CLASS_START_DATE_REACHED"],
    ["start is after end", () => ({ startDate: inDays(40) }), "CLASS_DATES_INVALID"],
    ["sessions fall outside the dates", () => ({ startDate: inDays(10) }), "SESSION_OUT_OF_CLASS_RANGE"],
    [
      "weekly slots overlap",
      () => ({
        schedule: [
          { dayOfWeek: 1, startTime: "19:00", endTime: "21:00" },
          { dayOfWeek: 1, startTime: "20:00", endTime: "22:00" },
        ],
      }),
      "SCHEDULE_OVERLAP",
    ],
    ["the class no longer matches its course", () => ({ gradeLevel: "GRADE_10" }), "COURSE_ATTRIBUTE_MISMATCH"],
  ])("is refused when %s", async (_name, change, code) => {
    const id = await completeDraft();
    await Class.updateOne({ _id: id }, { $set: change() });
    expect((await submit(id)).body.error).toBe(code);
    expect(await statusOf(id)).toBe("DRAFT");
  });
});

describe("Approving", () => {
  test.each([
    ["7. authorization", "authorization", "SUBJECT_AUTHORIZATION_REQUIRED", 403],
    ["8. contract", "contract", "TEACHER_CONTRACT_NOT_FOUND", 403],
  ])("%s missing is refused", async (_name, skipped, code, statusCode) => {
    const id = await pendingClass();
    await revoke[skipped]();

    const res = await approve(id);

    expect(res.statusCode).toBe(statusCode);
    expect(res.body.error).toBe(code);
    expect(codes(res.body.details.pendingChecks)).toEqual([code]);
    expect(await statusOf(id)).toBe("PENDING_APPROVAL");
    expect(await auditsOf(id, "CLASS_APPROVED")).toBe(0);
    expect(await Notification.countDocuments({ type: "CLASS_APPROVED" })).toBe(0);
  });

  test("lists every failed condition at once", async () => {
    const id = await pendingClass();
    await revokeAuthorization();
    await revokeContract();
    expect(codes((await approve(id)).body.details.pendingChecks)).toEqual([
      "SUBJECT_AUTHORIZATION_REQUIRED",
      "TEACHER_CONTRACT_NOT_FOUND",
    ]);
  });

  test.each([
    ["authorization is for another grade", "authorization", { gradeLevel: "GRADE_11" }, "SUBJECT_AUTHORIZATION_REQUIRED"],
    ["authorization is for another grade", "authorization", { gradeLevel: "GRADE_11" }, "SUBJECT_AUTHORIZATION_REQUIRED"],
    ["authorization is pending", "authorization", { status: "PENDING" }, "SUBJECT_AUTHORIZATION_PENDING"],
    ["contract is terminated", "contract", { status: "TERMINATED" }, "TEACHER_CONTRACT_NOT_ACTIVE"],
    ["contract has expired", "contract", { effectiveFrom: inDays(-9), expiresAt: inDays(-1) }, "TEACHER_CONTRACT_EXPIRED"],
    ["contract is not effective yet", "contract", { effectiveFrom: inDays(9) }, "TEACHER_CONTRACT_NOT_ACTIVE"],
  ])("is refused when the %s", async (_name, which, overrides, code) => {
    await grantAllExcept(which);
    const id = await pendingClass();
    await grant[which](overrides);
    expect((await approve(id)).body.error).toBe(code);
    expect(await statusOf(id)).toBe("PENDING_APPROVAL");
  });

  test("is refused once the start day has come, before the maintenance job runs", async () => {
    await grantAllExcept();
    const id = await pendingClass();
    await Class.updateOne({ _id: id }, { $set: { startDate: new Date() } });

    expect((await approve(id)).body.error).toBe("CLASS_START_DATE_REACHED");
    expect(await statusOf(id)).toBe("PENDING_APPROVAL");
  });

  test("is refused when the course went INACTIVE", async () => {
    await grantAllExcept();
    const id = await pendingClass();
    await Course.updateOne({ _id: course._id }, { $set: { status: "INACTIVE" } });
    const res = await approve(id);
    expect(res.body.error).toBe("COURSE_NOT_ACTIVE");
    expect(codes(res.body.details.pendingChecks)).toEqual(["COURSE_NOT_ACTIVE"]);
  });

  test("10. with every condition met the class opens, once audited and notified", async () => {
    await grantAllExcept();
    const id = await pendingClass();

    const res = await approve(id);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe("OPEN");
    expect(await auditsOf(id, "CLASS_APPROVED")).toBe(1);
    expect(await Notification.countDocuments({ userId: teacher._id, type: "CLASS_APPROVED" })).toBe(1);
    expect(JSON.stringify((await request(app).get("/api/classes")).body)).toContain(id);
    expect((await call(teacher, "patch", `/teacher/classes/${id}`, { capacity: 9 })).body.error).toBe("CLASS_NOT_EDITABLE");
  });

  test("the course level does not matter: an authorization of another level opens the class", async () => {
    await grant.authorization({ level: "BEGINNER" });
    const id = await pendingClass();

    expect((await approve(id)).body.data.status).toBe("OPEN");
  });

  describe("the approved teaching profile is the authorization", () => {
    const withProfile = (subjects, gradeLevels, verificationStatus = "VERIFIED") =>
      User.updateOne(
        { _id: teacher._id },
        {
          $set: {
            "teacherProfile.verificationStatus": verificationStatus,
            "teacherProfile.reviewedBy": admin._id,
            "teacherProfile.teachingProfile": { degree: "BACHELOR", subjects, gradeLevels, studentNote: "x", yearsOfExperience: 3 },
          },
        }
      );

    test("a profile covering the subject and grade opens the class and records the grant", async () => {
      const id = await pendingClass();
      await revokeAuthorization();
      await withProfile(["toán "], ["GRADE_12"]);

      expect((await approve(id)).body.data.status).toBe("OPEN");
      const auth = await TeacherSubjectAuthorization.findOne({ teacherId: teacher._id, subjectId: subject._id }).lean();
      expect(auth).toMatchObject({ status: "APPROVED", gradeLevel: "GRADE_12", level: null, approvedBy: admin._id });
    });

    test.each([
      ["another subject", ["Vật lý"], ["GRADE_12"], "VERIFIED"],
      ["another grade", ["Toán"], ["GRADE_11"], "VERIFIED"],
    ])("a profile with %s grants nothing", async (_name, subjects, grades, status) => {
      const id = await pendingClass();
      await revokeAuthorization();
      await withProfile(subjects, grades, status);

      expect((await approve(id)).body.error).toBe("SUBJECT_AUTHORIZATION_REQUIRED");
      expect(await TeacherSubjectAuthorization.countDocuments({})).toBe(0);
    });

    test("a suspension still blocks a teacher whose profile covers the class", async () => {
      const id = await pendingClass();
      await grant.authorization({ status: "SUSPENDED" });
      await withProfile(["Toán"], ["GRADE_12"]);

      expect((await approve(id)).body.error).toBe("SUBJECT_AUTHORIZATION_SUSPENDED");
      expect(await statusOf(id)).toBe("PENDING_APPROVAL");
    });
  });

  test("14. NEED_CHANGES, then edit, then resubmit, then approval", async () => {
    await grantAllExcept();
    const id = await pendingClass();

    await call(admin, "post", `/admin/classes/${id}/request-changes`, { reviewNote: "Bổ sung mục tiêu" });
    const seen = await call(teacher, "get", `/teacher/classes/${id}`);
    expect(seen.body.data.status).toBe("NEED_CHANGES");
    expect(seen.body.data.reviewNote).toBe("Bổ sung mục tiêu");

    expect((await call(teacher, "patch", `/teacher/classes/${id}`, { description: "Đã bổ sung" })).statusCode).toBe(200);
    const again = await submit(id);
    expect(again.body.data.status).toBe("PENDING_APPROVAL");
    expect(again.body.data.reviewedBy).toBeUndefined();
    expect((await approve(id)).body.data.status).toBe("OPEN");
    expect(await auditsOf(id, "CLASS_SUBMITTED")).toBe(2);
  });

  test("REJECTED works with conditions missing and is terminal", async () => {
    const id = await pendingClass();
    expect((await call(admin, "post", `/admin/classes/${id}/reject`, {})).body.data.status).toBe("REJECTED");
    expect((await submit(id)).body.error).toBe("CLASS_NOT_SUBMITTABLE");
    const note = await Notification.findOne({ userId: teacher._id, type: "CLASS_REJECTED" }).lean();
    expect(note.content).not.toMatch(/gửi duyệt lại/);
    const missing = new mongoose.Types.ObjectId();
    expect((await call(admin, "post", `/admin/classes/${missing}/reject`, {})).body.error).toBe("CLASS_NOT_FOUND");
  });
});

describe("Concurrency and atomicity", () => {
  test("15. concurrent approvals open the class once", async () => {
    await grantAllExcept();
    const id = await pendingClass();

    const results = await Promise.all([admin, admin2, admin, admin2].map((user) => approve(id, user)));

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409, 409, 409]);
    expect(await statusOf(id)).toBe("OPEN");
    expect(await auditsOf(id, "CLASS_APPROVED")).toBe(1);
    expect(await Notification.countDocuments({ userId: teacher._id, type: "CLASS_APPROVED" })).toBe(1);
  });

  test("15b. approve racing reject leaves one decision", async () => {
    await grantAllExcept();
    const id = await pendingClass();

    const results = await Promise.all([approve(id), call(admin2, "post", `/admin/classes/${id}/reject`, {})]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409]);
    const opened = (await statusOf(id)) === "OPEN";
    expect(await auditsOf(id, "CLASS_APPROVED")).toBe(opened ? 1 : 0);
    expect(await auditsOf(id, "CLASS_REJECTED")).toBe(opened ? 0 : 1);
  });

  test("concurrent submissions notify each admin once", async () => {
    const id = await completeDraft();
    const results = await Promise.all([submit(id), submit(id), submit(id)]);
    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409, 409]);
    expect(await auditsOf(id, "CLASS_SUBMITTED")).toBe(1);
    expect(await Notification.countDocuments({ type: "CLASS_SUBMITTED" })).toBe(2);
  });

  test("a class changed during the approval checks is not opened", async () => {
    await grantAllExcept();
    const id = await pendingClass();
    const contractVerifier = async () => {
      await Class.updateOne({ _id: id }, { $set: { price: mongoose.Types.Decimal128.fromString("9") } });
      return { status: "ACTIVE" };
    };

    await expect(adminClassService.approveClass(admin._id, id, {}, { contractVerifier })).rejects.toMatchObject({
      code: "CLASS_NOT_PENDING_APPROVAL",
    });
    expect(await statusOf(id)).toBe("PENDING_APPROVAL");
  });

  test("a class changed during the submission checks is not submitted", async () => {
    const id = await completeDraft();
    const contractVerifier = async () => {
      await Class.updateOne({ _id: id }, { $set: { schedule: [] } });
      return { status: "ACTIVE" };
    };

    await expect(teacherClassService.submitClass(teacher._id, id, { contractVerifier })).rejects.toMatchObject({
      code: "CLASS_NOT_SUBMITTABLE",
    });
    expect(await statusOf(id)).toBe("DRAFT");
  });

  test("an edit still in flight cannot change a class that opened meanwhile", async () => {
    const id = await completeDraft();
    const save = Class.prototype.save;
    jest.spyOn(Class.prototype, "save").mockImplementationOnce(async function (...args) {
      await Class.updateOne({ _id: id }, { $set: { status: "OPEN" } });
      return save.apply(this, args);
    });

    const res = await call(teacher, "patch", `/teacher/classes/${id}`, { price: 999999 });

    expect(res.body.error).toBe("CLASS_NOT_EDITABLE");
    expect(Number((await Class.findById(id).lean()).price.toString())).toBe(500000);
  });

  test.each(["submit", "approve", "reject"])("%s rolls back, and notifies nobody, when the audit fails", async (action) => {
    await grantAllExcept();
    const id = action === "submit" ? await completeDraft() : await pendingClass();
    const before = await statusOf(id);
    await Notification.deleteMany({});
    jest.spyOn(auditService, "audit").mockRejectedValueOnce(new Error("audit down"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await (action === "submit" ? submit(id) : call(admin, "post", `/admin/classes/${id}/${action}`, {}));

    expect(res.statusCode).toBe(500);
    expect(await statusOf(id)).toBe(before);
    expect(await Notification.countDocuments()).toBe(0);
  });

  test("16. the maintenance job never rejects an approved class", async () => {
    await grantAllExcept();
    const id = await pendingClass();
    expect((await approve(id)).statusCode).toBe(200);

    const { rejected } = await rejectExpiredPendingClasses(inDays(10));

    expect(rejected).toEqual([]);
    expect(await statusOf(id)).toBe("OPEN");
    expect(await auditsOf(id, "CLASS_EXPIRED_REJECTED")).toBe(0);
  });

  test("16b. the maintenance job racing an approval leaves one decision", async () => {
    await grantAllExcept();
    const id = await pendingClass();

    const [approved] = await Promise.all([approve(id), rejectExpiredPendingClasses(inDays(10))]);

    const opened = approved.statusCode === 200;
    expect(await statusOf(id)).toBe(opened ? "OPEN" : "REJECTED");
    expect(await auditsOf(id, "CLASS_EXPIRED_REJECTED")).toBe(opened ? 0 : 1);
  });
});

describe("Readiness", () => {
  test("says what submit and approve will do", async () => {
    const id = (await create()).body.data.id;
    let res = await call(teacher, "get", `/teacher/classes/${id}/readiness`);
    expect(res.body.data).toMatchObject({ canSaveDraft: true, canSubmit: false, canApprove: false });

    await Class.deleteMany({});
    const ready = await completeDraft();
    res = await call(teacher, "get", `/teacher/classes/${ready}/readiness`);
    expect(res.body.data).toMatchObject({ canSaveDraft: true, canSubmit: true, canApprove: false });
    expect(res.body.data.checks).toHaveLength(7);
    expect(res.body.data.checks.filter((check) => check.status === "PENDING").every((check) => !check.blocksSubmit)).toBe(true);

    expect((await submit(ready)).statusCode).toBe(200);
    await revokeContract();
    res = await call(admin, "get", `/admin/classes/${ready}/readiness`);
    expect(res.body.data).toMatchObject({ canSaveDraft: false, canSubmit: false, canApprove: false });

    await signContract();
    res = await call(admin, "get", `/admin/classes/${ready}/readiness`);
    expect(res.body.data.canApprove).toBe(true);
    expect((await approve(ready)).statusCode).toBe(200);
  });

  test("no session yet is a blocking schedule failure, never shown as a tuition one", async () => {
    await grantAllExcept();
    const id = (await create(completeFields())).body.data.id;
    await Session.deleteMany({ classId: id });

    const { body } = await call(teacher, "get", `/teacher/classes/${id}/readiness`);
    const check = (key) => body.data.checks.find((item) => item.key === key);

    expect(check("SCHEDULE_SESSIONS")).toMatchObject({ status: "PENDING", blocksSubmit: true });
    expect(check("CLASS_PRICE_RANGE").status).toBe("PASSED");
    expect(body.data.canSubmit).toBe(false);
  });

  test("tells Admin why a contract is not active", async () => {
    const id = await pendingClass();
    await grant.contract({ status: "PENDING_SIGNATURE", signedAt: null });
    const { body } = await call(admin, "get", `/admin/classes/${id}/readiness`);
    expect(body.data.checks.find((check) => check.key === "TEACHER_CONTRACT").message).toMatch(/chờ giáo viên ký/);
  });

  test("exposes only the status and message of each condition", async () => {
    await grantAllExcept();
    const id = await completeDraft();
    const { body } = await call(teacher, "get", `/teacher/classes/${id}/readiness`);
    for (const check of body.data.checks) {
      expect(Object.keys(check).sort()).toEqual(["blocksSubmit", "code", "key", "label", "message", "status"]);
    }
    expect((await call(student, "get", `/teacher/classes/${id}/readiness`)).statusCode).toBe(403);
    expect((await call(admin, "get", "/admin/classes/not-an-id/readiness")).statusCode).toBe(404);
  });
});
