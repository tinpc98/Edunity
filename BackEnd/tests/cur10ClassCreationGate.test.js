const mongoose = require("mongoose");
const Class = require("../src/models/Class");
const Course = require("../src/models/Course");
const Category = require("../src/models/Category");
const Subject = require("../src/models/Subject");
const Session = require("../src/models/Session");
const TeacherSubjectAuthorization = require("../src/models/TeacherSubjectAuthorization");
const User = require("../src/models/User");
const Notification = require("../src/models/Notification");
const teacherClassService = require("../src/services/teacherClassService");
const classCreationGateService = require("../src/services/classCreationGateService");

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
    jest.spyOn(Subject, "findOne").mockReturnValue(
      mockQuery({ _id: subId, categoryId: catId, name: "Toán", status: "ACTIVE" })
    );
    jest.spyOn(Category, "findOne").mockReturnValue(
      mockQuery({ _id: catId, name: "Toán THPT", slug: "toan-thpt", status: "ACTIVE" })
    );
    jest.spyOn(TeacherSubjectAuthorization, "findOne").mockReturnValue(mockQuery(auth));
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    classCreationGateService.resetDependencyVerifiers();
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

    expect(classCreationGateService.getDependencyStatus()).toEqual({
      cur07PricingPolicyReady: false,
      tea12ContractReady: false,
    });
  });

  // =========================================================================
  // 2. Fail-Closed Proof: VERIFIED !== Contract ACTIVE & CUR-07 Missing
  // =========================================================================
  test("CUR-10.2: Fails closed (503) when CUR-07 or TEA-12 contract dependencies are missing, NEVER substituting VERIFIED for ACTIVE", async () => {
    mockCatalogAndAuth();
    const saveSpy = jest.spyOn(Class.prototype, "save");

    // Both missing -> blocked at CUR-07 first
    await expect(teacherClassService.createClass(teacherId, validBody)).rejects.toMatchObject({
      code: "PRICING_POLICY_DEPENDENCY_BLOCKED",
      statusCode: 503,
    });

    // Inject CUR-07 only -> still MUST fail closed on TEA-12 contract even though verificationStatus === "VERIFIED"
    mockCatalogAndAuth();
    await expect(
      teacherClassService.createClass(teacherId, validBody, {
        pricingPolicyVerifier: async () => ({ valid: true }),
      })
    ).rejects.toMatchObject({
      code: "CONTRACT_DEPENDENCY_BLOCKED",
      statusCode: 503,
    });

    // Inject TEA-12 only -> still fails closed on CUR-07
    mockCatalogAndAuth();
    await expect(
      teacherClassService.createClass(teacherId, validBody, {
        contractVerifier: async () => ({ status: "ACTIVE" }),
      })
    ).rejects.toMatchObject({
      code: "PRICING_POLICY_DEPENDENCY_BLOCKED",
      statusCode: 503,
    });

    expect(saveSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 3. Course Attribute Mismatch & Missing Course Level
  // =========================================================================
  test("CUR-10.3: Rejects Course missing level (400) and rejects mismatched subjectId/categoryId/gradeLevel/level (400)", async () => {
    mockCatalogAndAuth({ course: { ...baseCourse, level: undefined } });
    await expect(teacherClassService.createClass(teacherId, validBody)).rejects.toMatchObject({
      code: "COURSE_LEVEL_REQUIRED",
      statusCode: 400,
    });

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

    // BASIC alias normalizes to BEGINNER and passes alignment check cleanly (stops at missing CUR-07)
    mockCatalogAndAuth();
    await expect(
      teacherClassService.createClass(teacherId, { ...validBody, level: "BASIC" })
    ).rejects.toMatchObject({
      code: "PRICING_POLICY_DEPENDENCY_BLOCKED",
      statusCode: 503,
    });
  });

  // =========================================================================
  // 4. TEA-07 Enforced Across createClass, updateClass, AND submitClass (No Bypass)
  // =========================================================================
  test("CUR-10.4: TEA-07 blocks create, update, AND submit when missing (403), PENDING (403), or SUSPENDED (403)", async () => {
    // Missing authorization -> createClass blocked
    mockCatalogAndAuth({ auth: null });
    await expect(teacherClassService.createClass(teacherId, validBody)).rejects.toMatchObject({
      code: "SUBJECT_AUTHORIZATION_REQUIRED",
      statusCode: 403,
    });

    // PENDING authorization -> updateClass blocked
    const draftClass = Class.hydrate({
      _id: new mongoose.Types.ObjectId(),
      courseId,
      courseTitle: baseCourse.title,
      teacherId,
      teacherName: "T",
      categoryId: catId,
      subjectId: subId,
      gradeLevel: "GRADE_10",
      level: "BEGINNER",
      className: "Draft",
      classType: "PAID",
      price: 500000,
      capacity: 15,
      status: "DRAFT",
    });
    draftClass.save = jest.fn();

    mockCatalogAndAuth({ auth: { _id: new mongoose.Types.ObjectId(), status: "PENDING" } });
    jest.spyOn(Class, "findOne").mockReturnValue(mockQuery(draftClass));

    await expect(
      teacherClassService.updateClass(teacherId, draftClass._id.toString(), { className: "Edited" })
    ).rejects.toMatchObject({
      code: "SUBJECT_AUTHORIZATION_PENDING",
      statusCode: 403,
    });
    expect(draftClass.save).not.toHaveBeenCalled();

    // SUSPENDED authorization -> submitClass blocked immediately
    const updateCAS = jest.spyOn(Class, "findOneAndUpdate");
    mockCatalogAndAuth({ auth: { _id: new mongoose.Types.ObjectId(), status: "SUSPENDED" } });
    jest.spyOn(Class, "findOne").mockReturnValue(mockQuery(draftClass));

    await expect(
      teacherClassService.submitClass(teacherId, draftClass._id.toString())
    ).rejects.toMatchObject({
      code: "SUBJECT_AUTHORIZATION_SUSPENDED",
      statusCode: 403,
    });
    expect(updateCAS).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 5. Injected CUR-07 & TEA-12 Gates + End-to-End Pass When Satisfied
  // =========================================================================
  test("CUR-10.5: Enforces injected pricing policy & contract ACTIVE rules across create, update & submit", async () => {
    const classId = new mongoose.Types.ObjectId();

    // Pricing policy violation
    mockCatalogAndAuth();
    await expect(
      teacherClassService.createClass(teacherId, validBody, {
        pricingPolicyVerifier: async ({ price }) =>
          price < 1000000
            ? { valid: false, code: "PRICE_OUT_OF_POLICY_RANGE", message: "Price below min", statusCode: 400 }
            : { valid: true },
        contractVerifier: async () => ({ status: "ACTIVE" }),
      })
    ).rejects.toMatchObject({ code: "PRICE_OUT_OF_POLICY_RANGE", statusCode: 400 });

    // Contract expired
    mockCatalogAndAuth();
    await expect(
      teacherClassService.createClass(teacherId, validBody, {
        pricingPolicyVerifier: async () => ({ valid: true }),
        contractVerifier: async () => ({ status: "ACTIVE", expiresAt: new Date(Date.now() - 10000) }),
      })
    ).rejects.toMatchObject({ code: "TEACHER_CONTRACT_EXPIRED", statusCode: 403 });

    // Contract terminated / suspended -> NOT_ACTIVE
    mockCatalogAndAuth();
    await expect(
      teacherClassService.createClass(teacherId, validBody, {
        pricingPolicyVerifier: async () => ({ valid: true }),
        contractVerifier: async () => ({ status: "TERMINATED" }),
      })
    ).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_ACTIVE", statusCode: 403 });

    // Full valid pass on createClass, updateClass, and submitClass
    mockCatalogAndAuth();
    jest.spyOn(Class.prototype, "save").mockImplementation(async function () {
      this._id = this._id || classId;
      return this;
    });

    const okOptions = {
      pricingPolicyVerifier: async () => ({ valid: true, policyVersion: 1 }),
      contractVerifier: async () => ({ status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) }),
    };

    const created = await teacherClassService.createClass(teacherId, validBody, okOptions);
    expect(created.status).toBe("DRAFT");
    expect(created.level).toBe("BEGINNER");

    // Now test submitClass passing session count into pricingPolicyVerifier
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
      startDate: new Date(Date.now() + 100000),
      endDate: new Date(Date.now() + 20000000),
      schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      status: "DRAFT",
    });

    mockCatalogAndAuth();
    jest.spyOn(Class, "findOne").mockReturnValue(mockQuery(fullDraft));
    jest.spyOn(Session, "find").mockReturnValue(
      mockQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          startDatetime: new Date(Date.now() + 200000),
          endDatetime: new Date(Date.now() + 300000),
        },
      ])
    );
    const seenCounts = [];
    jest.spyOn(Class, "findOneAndUpdate").mockReturnValue(mockQuery({ ...fullDraft.toObject(), status: "PENDING_APPROVAL" }));

    const submitted = await teacherClassService.submitClass(teacherId, classId.toString(), {
      pricingPolicyVerifier: async ({ totalSessions }) => {
        seenCounts.push(totalSessions);
        return { valid: true };
      },
      contractVerifier: async () => ({ status: "ACTIVE" }),
    });
    expect(seenCounts).toEqual([1]);
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

