const mongoose = require("mongoose");
const Class = require("../src/models/Class");
const Course = require("../src/models/Course");
const Category = require("../src/models/Category");
const Subject = require("../src/models/Subject");
const Session = require("../src/models/Session");
const TeacherSubjectAuthorization = require("../src/models/TeacherSubjectAuthorization");
const User = require("../src/models/User");
const Notification = require("../src/models/Notification");
const AuditLog = require("../src/models/AuditLog");
const adminClassService = require("../src/services/adminClassService");
const teacherClassService = require("../src/services/teacherClassService");
const classCreationGateService = require("../src/services/classCreationGateService");
const sessionService = require("../src/services/sessionService");

const mockQuery = (result) => {
  const q = {
    sort: () => q,
    select: () => q,
    skip: () => q,
    limit: () => q,
    session: () => q,
    lean: async () => (result && typeof result.toObject === "function" ? result.toObject() : result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve(result).catch(onRejected),
  };
  return q;
};

describe("TASK CUR-10: Teacher Class Creation, Update & Submit Gate Suite", () => {
  const teacherId = new mongoose.Types.ObjectId();
  const otherTeacherId = new mongoose.Types.ObjectId();
  const catId = new mongoose.Types.ObjectId();
  const subId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();

  const verifiedTeacher = {
    _id: teacherId,
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: { fullName: "Teacher Verified", verificationStatus: "VERIFIED" },
  };

  const baseCourse = {
    _id: courseId,
    title: "Toán 10 - Cơ bản",
    categoryId: catId,
    subjectId: subId,
    gradeLevel: "GRADE_10",
    level: "BEGINNER",
    status: "ACTIVE",
    isDeleted: false,
  };

  const validBody = {
    courseId: courseId.toString(),
    className: "Toán 10 - K1",
    classType: "PAID",
    price: 500000,
    capacity: 20,
  };

  const mockCatalogAndAuth = ({
    teacher = verifiedTeacher,
    course = baseCourse,
    auth = { _id: new mongoose.Types.ObjectId(), status: "APPROVED" },
  } = {}) => {
    jest.spyOn(User, "findById").mockReturnValue(mockQuery(teacher));
    jest.spyOn(Course, "findOne").mockReturnValue(mockQuery(course));
    jest.spyOn(Course, "findOneAndUpdate").mockReturnValue(mockQuery(course));
    jest.spyOn(Subject, "findOne").mockReturnValue(
      mockQuery({ _id: subId, categoryId: catId, name: "Toán", status: "ACTIVE" })
    );
    jest.spyOn(Category, "findOne").mockReturnValue(
      mockQuery({ _id: catId, name: "Toán THPT", slug: "toan-thpt", status: "ACTIVE" })
    );
    // Authorization is looked up per (teacher, subject, grade), every level at once
    jest.spyOn(TeacherSubjectAuthorization, "find").mockReturnValue(mockQuery(auth ? [auth] : []));
    jest.spyOn(Subject, "findById").mockReturnValue(mockQuery({ _id: subId, categoryId: catId, name: "Toán", status: "ACTIVE" }));
  };

  const DAY = 86400000;
  const mockCompleteClass = (status, fields = {}) => {
    const cls = Class.hydrate({
      _id: new mongoose.Types.ObjectId(),
      courseId,
      courseTitle: baseCourse.title,
      teacherId,
      teacherName: "Teacher Verified",
      categoryId: catId,
      subjectId: subId,
      gradeLevel: "GRADE_10",
      level: "BEGINNER",
      className: "Toán 10 - K1",
      description: "Full syllabus desc",
      classType: "PAID",
      price: 500000,
      capacity: 20,
      enrollmentStart: new Date(Date.now() + 100000),
      enrollmentEnd: new Date(Date.now() + DAY),
      startDate: new Date(Date.now() + 2 * DAY),
      endDate: new Date(Date.now() + 20 * DAY),
      schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      status,
      ...fields,
    });
    jest.spyOn(Class, "findOne").mockReturnValue(mockQuery(cls));
    jest.spyOn(Session, "find").mockReturnValue(
      mockQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          startDatetime: new Date(Date.now() + 3 * DAY),
          endDatetime: new Date(Date.now() + 3 * DAY + 3600000),
        },
      ])
    );
    return cls;
  };
  const approve = (options, fields) => {
    const cls = mockCompleteClass("PENDING_APPROVAL", fields);
    return adminClassService.approveClass(new mongoose.Types.ObjectId(), cls._id.toString(), {}, options);
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    classCreationGateService.resetDependencyVerifiers();
    // Creating a class needs a signed contract; its sessions are planned from the schedule afterwards
    classCreationGateService.setDependencyVerifiers({ contractVerifier: async () => ({ id: "c-signed", status: "ACTIVE" }) });
    jest.spyOn(sessionService, "replanSessions").mockResolvedValue({ generatedCount: 0, sessions: [] });
    jest.spyOn(mongoose, "startSession").mockResolvedValue({
      withTransaction: async (fn) => fn(),
      endSession: jest.fn(),
    });
    jest.spyOn(Notification, "insertMany").mockResolvedValue([]);
    jest.spyOn(User, "find").mockReturnValue(mockQuery([]));
  });

  afterEach(() => {
    classCreationGateService.resetDependencyVerifiers();
  });

  // =========================================================================
  // 1. Class Schema Alignment & Dependency Status
  // =========================================================================
  test("CUR-10.1: Class schema adds nullable level aligned with COURSE_LEVELS; dependencies fail closed by default", async () => {
    expect(Class.schema.paths.level).toBeDefined();
    expect(Class.schema.paths.level.options.enum).toEqual(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
    expect(Class.schema.paths.level.options.default).toBeNull();

    const docNull = Class.hydrate({
      courseId,
      courseTitle: "Legacy Class",
      teacherId,
      teacherName: "T",
      categoryId: catId,
      subjectId: subId,
      className: "Legacy",
      classType: "FREE",
      price: 0,
      capacity: 10,
      level: null,
    });
    await expect(docNull.validate()).resolves.toBeUndefined();

    expect(Class.schema.paths.syllabusVersionId).toBeDefined();
    expect(Class.schema.paths.pricingPolicyVersion).toBeDefined();

    expect(classCreationGateService.getDependencyStatus()).toEqual({
      tea12ContractReady: true, // TEA-12 wired to teacherContractService.verifyContract
    });
  });

  // =========================================================================
  // 2. Fail-Closed Proof: VERIFIED !== Contract ACTIVE & CUR-07 Port
  // =========================================================================
  test("CUR-10.2: Approval fails closed (503) when the TEA-12 contract dependency is missing, NEVER substituting VERIFIED for ACTIVE", async () => {
    const approveCAS = jest.spyOn(Class, "findOneAndUpdate").mockReturnValue(mockQuery(null));

    // TEA-12 verifier missing -> MUST fail closed even though verificationStatus === "VERIFIED"
    mockCatalogAndAuth();
    await expect(approve({ contractVerifier: null })).rejects.toMatchObject({
      code: "CONTRACT_DEPENDENCY_BLOCKED",
      statusCode: 503,
    });

    expect(approveCAS).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 3. Course Attribute Mismatch & Missing Course Level
  // =========================================================================
  test("CUR-10.3: A Course without level is accepted; mismatched subjectId/categoryId/gradeLevel/level are rejected (400)", async () => {
    // The course level no longer gates a class: it is stored as null
    mockCatalogAndAuth({ course: { ...baseCourse, level: undefined } });
    const save = jest.spyOn(Class.prototype, "save").mockImplementation(async function () {
      return this;
    });
    const withoutLevel = await teacherClassService.createClass(teacherId, validBody);
    expect(withoutLevel.status).toBe("DRAFT");
    expect(withoutLevel.level).toBeNull();
    save.mockRestore();

    // Spoofed gradeLevel / level / subjectId
    for (const badFields of [
      { subjectId: new mongoose.Types.ObjectId().toString() },
      { categoryId: new mongoose.Types.ObjectId().toString() },
      { gradeLevel: "GRADE_12" },
      { level: "ADVANCED" },
    ]) {
      mockCatalogAndAuth();
      await expect(
        teacherClassService.createClass(teacherId, { ...validBody, ...badFields })
      ).rejects.toMatchObject({
        code: "COURSE_ATTRIBUTE_MISMATCH",
        statusCode: 400,
      });
    }

    // BASIC alias normalizes to BEGINNER and passes alignment; a DRAFT does not need TEA-12
    mockCatalogAndAuth();
    jest.spyOn(Class.prototype, "save").mockImplementation(async function () {
      return this;
    });
    const created = await teacherClassService.createClass(teacherId, { ...validBody, level: "BASIC" });
    expect(created.level).toBe("BEGINNER");
  });

  // =========================================================================
  // 4. TEA-07: advisory for create, update & submit; enforced at approval (TEACHER-CLASS-FLOW-02)
  // =========================================================================
  test("CUR-10.4: TEA-07 missing, PENDING or SUSPENDED blocks create, submit & approval (403); an existing draft stays editable", async () => {
    const okOptions = { contractVerifier: async () => ({ status: "ACTIVE" }) };
    jest.spyOn(Class.prototype, "save").mockImplementation(async function () {
      return this;
    });

    // Create: no bypass, whatever the authorization is missing for
    for (const [auth, code] of [
      [null, "SUBJECT_AUTHORIZATION_REQUIRED"],
      [{ status: "PENDING" }, "SUBJECT_AUTHORIZATION_PENDING"],
      [{ status: "SUSPENDED" }, "SUBJECT_AUTHORIZATION_SUSPENDED"],
    ]) {
      mockCatalogAndAuth({ auth });
      await expect(teacherClassService.createClass(teacherId, validBody)).rejects.toMatchObject({ code, statusCode: 403 });
    }
    expect(Class.prototype.save).not.toHaveBeenCalled();

    // PENDING authorization -> editing a draft that already exists (same course) is allowed
    mockCatalogAndAuth({ auth: { _id: new mongoose.Types.ObjectId(), status: "PENDING" } });
    const draftClass = mockCompleteClass("DRAFT");
    draftClass.save = jest.fn();
    jest.spyOn(Session, "updateMany").mockResolvedValue({});
    await teacherClassService.updateClass(teacherId, draftClass._id.toString(), { className: "Edited" });
    expect(draftClass.save).toHaveBeenCalled();

    // SUSPENDED authorization -> submitClass refused
    mockCatalogAndAuth({ auth: { _id: new mongoose.Types.ObjectId(), status: "SUSPENDED" } });
    const toSubmit = mockCompleteClass("DRAFT");
    const updateCAS = jest
      .spyOn(Class, "findOneAndUpdate")
      .mockReturnValue(mockQuery({ ...toSubmit.toObject(), status: "PENDING_APPROVAL" }));
    jest.spyOn(AuditLog, "create").mockResolvedValue([]);
    await expect(teacherClassService.submitClass(teacherId, toSubmit._id.toString(), okOptions)).rejects.toMatchObject({
      code: "SUBJECT_AUTHORIZATION_SUSPENDED",
    });
    expect(updateCAS).not.toHaveBeenCalled();

    // Approval: no bypass
    for (const [auth, code] of [
      [null, "SUBJECT_AUTHORIZATION_REQUIRED"],
      [{ status: "PENDING" }, "SUBJECT_AUTHORIZATION_PENDING"],
      [{ status: "SUSPENDED" }, "SUBJECT_AUTHORIZATION_SUSPENDED"],
    ]) {
      mockCatalogAndAuth({ auth });
      await expect(approve(okOptions)).rejects.toMatchObject({ code, statusCode: 403 });
    }
    expect(updateCAS).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 5. Fixed Price Range & TEA-12 Gate + End-to-End Pass When Satisfied
  // =========================================================================
  test("CUR-10.5: Enforces the price range & contract ACTIVE rules at approval; create & submit pass", async () => {
    const classId = new mongoose.Types.ObjectId();

    // Price out of range
    mockCatalogAndAuth();
    await expect(
      approve({ contractVerifier: async () => ({ status: "ACTIVE" }) }, { price: 999 })
    ).rejects.toMatchObject({ code: "CLASS_PRICE_OUT_OF_RANGE", statusCode: 400 });

    // Contract expired
    mockCatalogAndAuth();
    await expect(
      approve({
        contractVerifier: async () => ({ status: "ACTIVE", expiresAt: new Date(Date.now() - 10000) }),
      })
    ).rejects.toMatchObject({ code: "TEACHER_CONTRACT_EXPIRED", statusCode: 403 });

    // Contract terminated / suspended -> NOT_ACTIVE
    mockCatalogAndAuth();
    await expect(
      approve({
        contractVerifier: async () => ({ status: "TERMINATED" }),
      })
    ).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_ACTIVE", statusCode: 403 });

    // Full valid pass on createClass, updateClass, and submitClass
    mockCatalogAndAuth();
    jest.spyOn(Class.prototype, "save").mockImplementation(async function () {
      this._id = this._id || classId;
      return this;
    });

    const created = await teacherClassService.createClass(teacherId, validBody);
    expect(created.status).toBe("DRAFT");
    expect(created.level).toBe("BEGINNER");

    // Now test submitClass on a complete draft
    const fullDraft = Class.hydrate({
      _id: classId,
      courseId,
      courseTitle: baseCourse.title,
      teacherId,
      teacherName: "Teacher Verified",
      categoryId: catId,
      subjectId: subId,
      gradeLevel: "GRADE_10",
      level: "BEGINNER",
      className: "Toán 10 - K1",
      description: "Full syllabus desc",
      classType: "PAID",
      price: 500000,
      capacity: 20,
      enrollmentStart: new Date(Date.now() + 100000),
      enrollmentEnd: new Date(Date.now() + 5000000),
      startDate: new Date(Date.now() + 2 * DAY),
      endDate: new Date(Date.now() + 20 * DAY),
      schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      status: "DRAFT",
    });

    mockCatalogAndAuth();
    jest.spyOn(Class, "findOne").mockReturnValue(mockQuery(fullDraft));
    jest.spyOn(Session, "find").mockReturnValue(
      mockQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          startDatetime: new Date(Date.now() + 3 * DAY),
          endDatetime: new Date(Date.now() + 3 * DAY + 100000),
        },
      ])
    );
    jest.spyOn(AuditLog, "create").mockResolvedValue([]);
    jest.spyOn(Class, "findOneAndUpdate").mockReturnValue(mockQuery({ ...fullDraft.toObject(), status: "PENDING_APPROVAL" }));

    const submitted = await teacherClassService.submitClass(teacherId, classId.toString(), {
      contractVerifier: async () => ({ status: "ACTIVE" }),
    });
    expect(submitted.status).toBe("PENDING_APPROVAL");
  });

  // =========================================================================
  // 6. Preserves Legacy Verification & Ownership Error Precedence
  // =========================================================================
  test("CUR-10.6: Preserves TEACHER_NOT_VERIFIED and ownership FORBIDDEN error precedence", async () => {
    jest.spyOn(User, "findById").mockReturnValue(
      mockQuery({
        _id: teacherId,
        role: "TEACHER",
        status: "ACTIVE",
        teacherProfile: { verificationStatus: "PENDING" },
      })
    );
    await expect(teacherClassService.createClass(teacherId, validBody)).rejects.toMatchObject({
      code: "TEACHER_NOT_VERIFIED",
      statusCode: 403,
    });

    jest.spyOn(User, "findById").mockReturnValue(mockQuery(verifiedTeacher));
    jest.spyOn(Class, "findOne").mockReturnValue(mockQuery({ _id: new mongoose.Types.ObjectId(), teacherId: otherTeacherId, status: "DRAFT" }));
    await expect(
      teacherClassService.updateClass(teacherId, new mongoose.Types.ObjectId().toString(), { className: "Hack" })
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });
});

