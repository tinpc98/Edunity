const { EventEmitter } = require("events");
const mongoose = require("mongoose");
const app = require("../src/app");
const modelsIndex = require("../src/models");
const { TEACHER_SUBJECT_AUTH_STATUSES } = require("../src/models/constants");
const TeacherSubjectAuthorization = require("../src/models/TeacherSubjectAuthorization");
const Category = require("../src/models/Category");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const AuditLog = require("../src/models/AuditLog");
const Notification = require("../src/models/Notification");
const teacherSubjectAuthService = require("../src/services/teacherSubjectAuthorizationService");

const invokeApp = ({ method = "GET", url, headers = {}, body = {}, nodeEnv = "test" }) =>
  new Promise((resolve) => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = nodeEnv;

    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const req = Object.assign(new EventEmitter(), {
      method,
      url,
      headers: normalizedHeaders,
      _body: true,
      body,
    });

    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return this.headers[k.toLowerCase()];
      },
      removeHeader(k) {
        delete this.headers[k.toLowerCase()];
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        process.env.NODE_ENV = prevEnv;
        resolve({ status: this.statusCode, body: payload, headers: this.headers });
        return this;
      },
      end(data) {
        if (data !== undefined && !this.body) this.body = data;
        process.env.NODE_ENV = prevEnv;
        resolve({ status: this.statusCode, body: this.body, headers: this.headers });
      },
    });

    app(req, res, () => {
      process.env.NODE_ENV = prevEnv;
      resolve({ status: 404, body: { success: false, error: "NOT_FOUND" } });
    });
  });

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

describe("TASK TEA-07: Teacher Subject Authorization Suite", () => {
  const teacherA = new mongoose.Types.ObjectId();
  const teacherB = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const catThpt = new mongoose.Types.ObjectId();
  const catLang = new mongoose.Types.ObjectId();
  const subMath = new mongoose.Types.ObjectId();
  const subEng = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Notification, "insertMany").mockResolvedValue([]);
    jest.spyOn(Notification, "create").mockResolvedValue({});
  });

  // =========================================================================
  // 1. Schema & Registry
  // =========================================================================
  describe("1. Schema, Enum & Unique Compound Index", () => {
    test("TEA-07.SCH.1: Constants and models registry export TeacherSubjectAuthorization cleanly", () => {
      expect(TEACHER_SUBJECT_AUTH_STATUSES).toEqual(["PENDING", "APPROVED", "SUSPENDED"]);
      expect(modelsIndex.TeacherSubjectAuthorization).toBe(TeacherSubjectAuthorization);

      const paths = TeacherSubjectAuthorization.schema.paths;
      expect(paths.teacherId.isRequired).toBe(true);
      expect(paths.subjectId.isRequired).toBe(true);
      expect(paths.categoryId.isRequired).toBe(true);
      expect(paths.gradeLevel).toBeDefined();
      expect(paths.level.options.enum).toEqual(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
      expect(paths.status.options.enum).toEqual(["PENDING", "APPROVED", "SUSPENDED"]);
      expect(paths.status.options.default).toBe("PENDING");
      expect(paths.approvedBy).toBeDefined();
      expect(paths.suspendedBy).toBeDefined();
      expect(paths.suspensionReason).toBeDefined();
      expect(paths.reviewedBy).toBeDefined(); // reviewablePlugin
    });

    test("TEA-07.SCH.2: Unique index { teacherId, subjectId, gradeLevel, level } is non-sparse so gradeLevel: null is unique", () => {
      const indexes = TeacherSubjectAuthorization.schema.indexes();
      const uniqueTupleIdx = indexes.find(
        ([keys, opts]) =>
          keys.teacherId === 1 &&
          keys.subjectId === 1 &&
          keys.gradeLevel === 1 &&
          keys.level === 1 &&
          opts.unique === true
      );
      expect(uniqueTupleIdx).toBeDefined();
      expect(uniqueTupleIdx[1].sparse).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. Teacher Self-Service, Anti-Spoofing, Normalization & Duplicate Prevention
  // =========================================================================
  describe("2. Teacher Request, Anti-Spoofing, Validation & Redaction", () => {
    const stubActiveTeacher = (id = teacherA) =>
      jest.spyOn(User, "findById").mockReturnValue(
        mockQuery({
          _id: id,
          email: "teacher@test.com",
          role: "TEACHER",
          status: "ACTIVE",
          teacherProfile: { fullName: "Teacher A", verificationStatus: "VERIFIED" },
        })
      );

    test("TEA-07.REQ.1: Rejects spoofed teacherId in request body with 403 FORBIDDEN", async () => {
      await expect(
        teacherSubjectAuthService.requestAuthorization(teacherA, {
          teacherId: teacherB.toString(),
          subjectId: subMath.toString(),
          gradeLevel: "GRADE_10",
          level: "INTERMEDIATE",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    });

    test("TEA-07.REQ.2: Rejects missing gradeLevel for formal THPT category and rejects mismatched gradeLevel", async () => {
      stubActiveTeacher();
      jest.spyOn(Subject, "findOne").mockReturnValue(
        mockQuery({ _id: subMath, categoryId: catThpt, name: "Toán", status: "ACTIVE" })
      );
      jest.spyOn(Category, "findOne").mockReturnValue(
        mockQuery({ _id: catThpt, name: "Toán THPT", slug: "toan-thpt", status: "ACTIVE" })
      );

      await expect(
        teacherSubjectAuthService.requestAuthorization(teacherA, {
          subjectId: subMath.toString(),
          level: "BEGINNER",
        })
      ).rejects.toMatchObject({ code: "GRADE_LEVEL_REQUIRED", statusCode: 400 });

      await expect(
        teacherSubjectAuthService.requestAuthorization(teacherA, {
          subjectId: subMath.toString(),
          gradeLevel: "GRADE_6",
          level: "BEGINNER",
        })
      ).rejects.toMatchObject({ code: "GRADE_LEVEL_CATEGORY_MISMATCH", statusCode: 400 });
    });

    test("TEA-07.REQ.3: Normalizes BASIC->BEGINNER, supports gradeLevel=null for open categories, redacts admin fields", async () => {
      stubActiveTeacher();
      jest.spyOn(Subject, "findOne").mockImplementation(() =>
        mockQuery({ _id: subEng, categoryId: catLang, name: "IELTS", status: "ACTIVE" })
      );
      jest.spyOn(Category, "findOne").mockReturnValue(
        mockQuery({ _id: catLang, name: "Ngoại ngữ", slug: "ngoai-ngu", status: "ACTIVE" })
      );
      jest.spyOn(TeacherSubjectAuthorization, "findOne").mockReturnValue(mockQuery(null));
      jest.spyOn(User, "find").mockReturnValue(mockQuery([]));

      let capturedDoc = null;
      const authId = new mongoose.Types.ObjectId();
      jest.spyOn(TeacherSubjectAuthorization, "create").mockImplementationOnce(async (doc) => {
        capturedDoc = { ...doc, _id: authId };
        return { toObject: () => ({ ...capturedDoc }) };
      });
      jest.spyOn(Subject, "find").mockReturnValue(mockQuery([{ _id: subEng, name: "IELTS" }]));
      jest.spyOn(Category, "find").mockReturnValue(mockQuery([{ _id: catLang, name: "Ngoại ngữ" }]));

      const res = await teacherSubjectAuthService.requestAuthorization(teacherA, {
        subjectId: subEng.toString(),
        level: "BASIC",
        requestNote: "Có chứng chỉ IELTS 8.0",
      });

      expect(capturedDoc.level).toBe("BEGINNER");
      expect(capturedDoc.gradeLevel).toBeNull();
      expect(capturedDoc.status).toBe("PENDING");
      expect(res.level).toBe("BEGINNER");
      expect(res.status).toBe("PENDING");
      expect(res.reviewedBy).toBeUndefined();
      expect(res.createdBy).toBeUndefined();
      expect(res.decisionHistory[0].actorId).toBeUndefined();
    });

    test("TEA-07.REQ.4: Blocks duplicate (PENDING/APPROVED) and blocks re-requesting SUSPENDED authorization with 409", async () => {
      stubActiveTeacher();
      jest.spyOn(Subject, "findOne").mockReturnValue(
        mockQuery({ _id: subMath, categoryId: catThpt, name: "Toán", status: "ACTIVE" })
      );
      jest.spyOn(Category, "findOne").mockReturnValue(
        mockQuery({ _id: catThpt, name: "Toán THPT", slug: "toan-thpt", status: "ACTIVE" })
      );

      jest
        .spyOn(TeacherSubjectAuthorization, "findOne")
        .mockReturnValueOnce(mockQuery({ _id: new mongoose.Types.ObjectId(), status: "PENDING" }))
        .mockReturnValueOnce(mockQuery({ _id: new mongoose.Types.ObjectId(), status: "SUSPENDED" }));

      await expect(
        teacherSubjectAuthService.requestAuthorization(teacherA, {
          subjectId: subMath.toString(),
          gradeLevel: "GRADE_11",
          level: "INTERMEDIATE",
        })
      ).rejects.toMatchObject({ code: "DUPLICATE_SUBJECT_AUTHORIZATION", statusCode: 409 });

      await expect(
        teacherSubjectAuthService.requestAuthorization(teacherA, {
          subjectId: subMath.toString(),
          gradeLevel: "GRADE_11",
          level: "INTERMEDIATE",
        })
      ).rejects.toMatchObject({ code: "SUBJECT_AUTHORIZATION_SUSPENDED", statusCode: 409 });
    });

    test("TEA-07.REQ.5: Enforces IDOR protection on getMyAuthorization and ignores query.teacherId in listMyAuthorizations", async () => {
      stubActiveTeacher(teacherA);
      const authId = new mongoose.Types.ObjectId();

      jest.spyOn(TeacherSubjectAuthorization, "findById").mockReturnValue(
        mockQuery({ _id: authId, teacherId: teacherB, subjectId: subMath, categoryId: catThpt, status: "APPROVED" })
      );
      await expect(teacherSubjectAuthService.getMyAuthorization(teacherA, authId.toString())).rejects.toMatchObject({
        code: "FORBIDDEN",
        statusCode: 403,
      });

      const findSpy = jest.spyOn(TeacherSubjectAuthorization, "find").mockReturnValue(mockQuery([]));
      jest.spyOn(TeacherSubjectAuthorization, "countDocuments").mockResolvedValue(0);

      await teacherSubjectAuthService.listMyAuthorizations(teacherA, { teacherId: teacherB.toString() }, { page: 1, pageSize: 20, skip: 0 });
      expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ teacherId: teacherA }));
    });
  });

  // =========================================================================
  // 3. Admin Review Workflow (Approve / Suspend), AuditLog & Isolation from KYC
  // =========================================================================
  describe("3. Admin Approval/Suspend Lifecycle & Separation from verificationStatus", () => {
    test("TEA-07.ADM.1: approveAuthorization transitions PENDING -> APPROVED, logs AuditLog, notifies Teacher", async () => {
      const authId = new mongoose.Types.ObjectId();
      const existing = {
        _id: authId,
        teacherId: teacherA,
        subjectId: subMath,
        categoryId: catThpt,
        gradeLevel: "GRADE_12",
        level: "ADVANCED",
        status: "PENDING",
      };
      const updated = { ...existing, status: "APPROVED", approvedBy: adminId, approvedAt: new Date() };

      jest.spyOn(TeacherSubjectAuthorization, "findById").mockReturnValue(mockQuery(existing));
      jest.spyOn(TeacherSubjectAuthorization, "findOneAndUpdate").mockReturnValue(mockQuery(updated));
      const auditSpy = jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);
      jest.spyOn(Subject, "find").mockReturnValue(mockQuery([{ _id: subMath, name: "Toán" }]));
      jest.spyOn(Category, "find").mockReturnValue(mockQuery([{ _id: catThpt, name: "THPT" }]));
      jest.spyOn(User, "find").mockReturnValue(mockQuery([{ _id: teacherA, email: "t@test.com", teacherProfile: { fullName: "A" } }]));

      const res = await teacherSubjectAuthService.approveAuthorization(adminId, authId.toString(), { reviewNote: "Đủ điều kiện" });

      expect(res.status).toBe("APPROVED");
      expect(auditSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ action: "TEACHER_SUBJECT_AUTHORIZATION_APPROVED", targetId: authId })],
        { session: undefined }
      );
    });

    test("TEA-07.ADM.2: suspendAuthorization requires non-blank reason, sets SUSPENDED without touching User.verificationStatus", async () => {
      const authId = new mongoose.Types.ObjectId();
      const userUpdateSpy = jest.spyOn(User, "updateOne");
      const userFindUpdateSpy = jest.spyOn(User, "findOneAndUpdate");

      await expect(teacherSubjectAuthService.suspendAuthorization(adminId, authId.toString(), { reason: "   " })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });

      const existing = {
        _id: authId,
        teacherId: teacherA,
        subjectId: subMath,
        categoryId: catThpt,
        gradeLevel: "GRADE_12",
        level: "ADVANCED",
        status: "APPROVED",
      };
      const suspended = { ...existing, status: "SUSPENDED", suspendedBy: adminId, suspensionReason: "Vi phạm chất lượng" };

      jest.spyOn(TeacherSubjectAuthorization, "findById").mockReturnValue(mockQuery(existing));
      jest.spyOn(TeacherSubjectAuthorization, "findOneAndUpdate").mockReturnValue(mockQuery(suspended));
      const auditSpy = jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);
      jest.spyOn(Subject, "find").mockReturnValue(mockQuery([{ _id: subMath, name: "Toán" }]));
      jest.spyOn(Category, "find").mockReturnValue(mockQuery([{ _id: catThpt, name: "THPT" }]));
      jest.spyOn(User, "find").mockReturnValue(mockQuery([{ _id: teacherA, email: "t@test.com", teacherProfile: { fullName: "A" } }]));

      const res = await teacherSubjectAuthService.suspendAuthorization(adminId, authId.toString(), {
        reason: "Vi phạm chất lượng",
      });

      expect(res.status).toBe("SUSPENDED");
      expect(res.suspensionReason).toBe("Vi phạm chất lượng");
      expect(auditSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ action: "TEACHER_SUBJECT_AUTHORIZATION_SUSPENDED" })],
        { session: undefined }
      );
      expect(userUpdateSpy).not.toHaveBeenCalled();
      expect(userFindUpdateSpy).not.toHaveBeenCalled();
    });

    test("TEA-07.ADM.3: Concurrent approve/suspend race detected by atomic CAS ($in) throws 409", async () => {
      const authId = new mongoose.Types.ObjectId();
      jest.spyOn(TeacherSubjectAuthorization, "findById").mockReturnValue(
        mockQuery({ _id: authId, teacherId: teacherA, status: "PENDING" })
      );
      jest.spyOn(TeacherSubjectAuthorization, "findOneAndUpdate").mockReturnValue(mockQuery(null));

      await expect(
        teacherSubjectAuthService.approveAuthorization(adminId, authId.toString(), {})
      ).rejects.toMatchObject({ code: "SUBJECT_AUTHORIZATION_CONFLICT", statusCode: 409 });
    });
  });

  // =========================================================================
  // 4. HTTP Route RBAC via real Express App
  // =========================================================================
  describe("4. HTTP Routes & RBAC Middleware Enforcement", () => {
    test("TEA-07.HTTP.1: Rejects unauthenticated callers (401) and wrong roles (403)", async () => {
      const unauth = await invokeApp({
        method: "POST",
        url: "/api/teacher/subject-authorizations",
        nodeEnv: "production",
        body: { subjectId: subMath.toString(), gradeLevel: "GRADE_10", level: "BEGINNER" },
      });
      expect(unauth.status).toBe(401);

      jest.spyOn(User, "findById").mockImplementation((id) => {
        if (String(id) === String(teacherA)) return mockQuery({ _id: teacherA, role: "TEACHER", status: "ACTIVE" });
        if (String(id) === String(studentId)) return mockQuery({ _id: studentId, role: "STUDENT", status: "ACTIVE" });
        return mockQuery(null);
      });

      const teacherCallsAdmin = await invokeApp({
        method: "POST",
        url: `/api/admin/subject-authorizations/${new mongoose.Types.ObjectId()}/approve`,
        headers: { "x-user-id": teacherA.toString() },
        body: {},
      });
      expect(teacherCallsAdmin.status).toBe(403);
      expect(teacherCallsAdmin.body.error).toBe("FORBIDDEN");

      const studentCallsTeacher = await invokeApp({
        method: "GET",
        url: "/api/teacher/subject-authorizations",
        headers: { "x-user-id": studentId.toString() },
      });
      expect(studentCallsTeacher.status).toBe(403);
      expect(studentCallsTeacher.body.error).toBe("FORBIDDEN");
    });

    test("TEA-07.HTTP.2: TEACHER creates request (201) and ADMIN approves (200) through Express routing", async () => {
      const authId = new mongoose.Types.ObjectId();
      jest.spyOn(User, "findById").mockImplementation((id) => {
        if (String(id) === String(teacherA)) {
          return mockQuery({ _id: teacherA, role: "TEACHER", status: "ACTIVE", email: "t@test.com", teacherProfile: { fullName: "T" } });
        }
        if (String(id) === String(adminId)) {
          return mockQuery({ _id: adminId, role: "ADMIN", status: "ACTIVE" });
        }
        return mockQuery(null);
      });
      jest.spyOn(Subject, "findOne").mockReturnValue(mockQuery({ _id: subMath, categoryId: catThpt, name: "Toán", status: "ACTIVE" }));
      jest.spyOn(Category, "findOne").mockReturnValue(mockQuery({ _id: catThpt, name: "THPT", slug: "thpt", status: "ACTIVE" }));
      jest.spyOn(TeacherSubjectAuthorization, "findOne").mockReturnValue(mockQuery(null));
      jest.spyOn(TeacherSubjectAuthorization, "create").mockResolvedValue({
        toObject: () => ({
          _id: authId,
          teacherId: teacherA,
          subjectId: subMath,
          categoryId: catThpt,
          gradeLevel: "GRADE_10",
          level: "INTERMEDIATE",
          status: "PENDING",
          createdBy: teacherA,
          decisionHistory: [{ actorId: teacherA, action: "REQUESTED", newStatus: "PENDING" }],
        }),
      });
      jest.spyOn(Subject, "find").mockReturnValue(mockQuery([{ _id: subMath, name: "Toán" }]));
      jest.spyOn(Category, "find").mockReturnValue(mockQuery([{ _id: catThpt, name: "THPT" }]));
      jest.spyOn(User, "find").mockReturnValue(mockQuery([{ _id: teacherA, email: "t@test.com", teacherProfile: { fullName: "T" } }]));

      const reqRes = await invokeApp({
        method: "POST",
        url: "/api/teacher/subject-authorizations",
        headers: { "x-user-id": teacherA.toString() },
        body: { subjectId: subMath.toString(), gradeLevel: "GRADE_10", level: "INTERMEDIATE" },
      });
      expect(reqRes.status).toBe(201);
      expect(reqRes.body.success).toBe(true);
      expect(reqRes.body.data.status).toBe("PENDING");
      expect(reqRes.body.data.createdBy).toBeUndefined();

      jest.spyOn(TeacherSubjectAuthorization, "findById").mockReturnValue(
        mockQuery({ _id: authId, teacherId: teacherA, subjectId: subMath, categoryId: catThpt, gradeLevel: "GRADE_10", level: "INTERMEDIATE", status: "PENDING" })
      );
      jest.spyOn(TeacherSubjectAuthorization, "findOneAndUpdate").mockReturnValue(
        mockQuery({ _id: authId, teacherId: teacherA, subjectId: subMath, categoryId: catThpt, gradeLevel: "GRADE_10", level: "INTERMEDIATE", status: "APPROVED" })
      );
      jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);

      const appRes = await invokeApp({
        method: "POST",
        url: `/api/admin/subject-authorizations/${authId}/approve`,
        headers: { "x-user-id": adminId.toString() },
        body: { reviewNote: "Approved" },
      });
      expect(appRes.status).toBe(200);
      expect(appRes.body.success).toBe(true);
      expect(appRes.body.data.status).toBe("APPROVED");
    });
  });
});

