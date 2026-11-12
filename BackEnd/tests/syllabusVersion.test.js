const { EventEmitter } = require("events");
const mongoose = require("mongoose");
const app = require("../src/app");
const Course = require("../src/models/Course");
const Category = require("../src/models/Category");
const Class = require("../src/models/Class");
const User = require("../src/models/User");
const SyllabusVersion = require("../src/models/SyllabusVersion");
const CurriculumUnit = require("../src/models/CurriculumUnit");
const AuditLog = require("../src/models/AuditLog");
const modelsIndex = require("../src/models");
const { SYLLABUS_VERSION_STATUSES } = require("../src/models/constants");
const syllabusService = require("../src/services/syllabusService");
const courseCatalogService = require("../src/services/courseCatalogService");
const {
  assertSafeMigrationTarget,
  parseLegacySyllabusLines,
  runSyllabusPreflight,
  migrateForward,
  migrateBackward,
} = require("../scripts/migrateSyllabusVersions");

// Helper: invokes real Express app middleware/routes in-memory without binding a TCP socket
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
        if (data !== undefined && !this.body) {
          this.body = data;
        }
        process.env.NODE_ENV = prevEnv;
        resolve({ status: this.statusCode, body: this.body, headers: this.headers });
      },
    });

    app(req, res, () => {
      process.env.NODE_ENV = prevEnv;
      resolve({ status: 404, body: { success: false, error: "NOT_FOUND" } });
    });
  });

// Helper: creates a chainable Mongoose-like query stub
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

describe("TASK CUR-02: SyllabusVersion & CurriculumUnit Suite", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. Schema, Constants, Plugins & Indexes
  // =========================================================================
  describe("1. Schema, Constants, Plugins & Indexes", () => {
    test("CUR-02.SCH.1: SYLLABUS_VERSION_STATUSES and models/index.js export expected values", () => {
      expect(SYLLABUS_VERSION_STATUSES).toEqual(["DRAFT", "PUBLISHED", "ARCHIVED"]);
      expect(modelsIndex.SyllabusVersion).toBe(SyllabusVersion);
      expect(modelsIndex.CurriculumUnit).toBe(CurriculumUnit);
    });

    test("CUR-02.SCH.2: SyllabusVersion schema defines all required fields, enums, and unique partial indexes", () => {
      const paths = SyllabusVersion.schema.paths;
      expect(paths.courseId).toBeDefined();
      expect(paths.versionNumber).toBeDefined();
      expect(paths.title).toBeDefined();
      expect(paths.summary).toBeDefined();
      expect(paths.status.options.enum).toEqual(["DRAFT", "PUBLISHED", "ARCHIVED"]);
      expect(paths.status.options.default).toBe("DRAFT");
      expect(paths.publishedAt).toBeDefined();
      expect(paths.publishedBy).toBeDefined();
      expect(paths.archivedAt).toBeDefined();
      expect(paths.archivedBy).toBeDefined();
      expect(paths.clonedFromVersionId).toBeDefined();
      expect(paths.migratedFromLegacy).toBeDefined();
      // Plugins
      expect(paths.createdBy).toBeDefined();
      expect(paths.updatedBy).toBeDefined();
      expect(paths.isDeleted).toBeDefined();

      const indexes = SyllabusVersion.schema.indexes();
      const versionNumberIdx = indexes.find(
        ([keys, opts]) => keys.courseId === 1 && keys.versionNumber === 1 && opts.unique === true
      );
      expect(versionNumberIdx).toBeDefined();

      const singlePublishedIdx = indexes.find(
        ([keys, opts]) =>
          keys.courseId === 1 &&
          Object.keys(keys).length === 1 &&
          opts.unique === true &&
          opts.partialFilterExpression &&
          opts.partialFilterExpression.status === "PUBLISHED"
      );
      expect(singlePublishedIdx).toBeDefined();
    });

    test("CUR-02.SCH.3: CurriculumUnit schema defines fields, soft-delete plugin, and partial unique order index", () => {
      const paths = CurriculumUnit.schema.paths;
      expect(paths.syllabusVersionId).toBeDefined();
      expect(paths.courseId).toBeDefined();
      expect(paths.unitOrder).toBeDefined();
      expect(paths.title).toBeDefined();
      expect(paths.learningObjectives).toBeDefined();
      expect(paths.durationMinutes).toBeDefined();
      expect(paths.topics).toBeDefined();
      expect(paths.isDeleted).toBeDefined();

      const indexes = CurriculumUnit.schema.indexes();
      const orderIdx = indexes.find(
        ([keys, opts]) =>
          keys.syllabusVersionId === 1 &&
          keys.unitOrder === 1 &&
          opts.unique === true &&
          opts.partialFilterExpression
      );
      expect(orderIdx).toBeDefined();
    });

    test("CUR-02.SCH.4: Course schema adds publishedSyllabusVersionId while preserving legacy syllabus field", () => {
      expect(Course.schema.paths.publishedSyllabusVersionId).toBeDefined();
      expect(Course.schema.paths.publishedSyllabusVersionId.options.ref).toBe("SyllabusVersion");
      expect(Course.schema.paths.publishedSyllabusVersionId.options.default).toBeNull();
      expect(Course.schema.paths.syllabus).toBeDefined();
      expect(Course.schema.paths.syllabus.instance).toBe("String");
    });
  });

  // =========================================================================
  // 2. Mongoose Schema Hook Immutability
  // =========================================================================
  describe("2. Schema Hook Immutability (PUBLISHED & ARCHIVED)", () => {
    const id = () => new mongoose.Types.ObjectId();

    test("CUR-02.HOOK.1: Mutating title or reverting status to DRAFT on a PUBLISHED SyllabusVersion fails validation with 409", async () => {
      const doc = SyllabusVersion.hydrate({
        _id: id(),
        courseId: id(),
        versionNumber: 1,
        title: "Phiên bản 1.0",
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedBy: id(),
        createdBy: id(),
      });
      doc.$locals.initialStatus = "PUBLISHED";

      // Attempt content mutation
      doc.title = "Sửa trái phép";
      await expect(doc.validate()).rejects.toMatchObject({
        code: "SYLLABUS_VERSION_IMMUTABLE",
        statusCode: 409,
      });

      // Attempt revert PUBLISHED -> DRAFT
      const docRevert = SyllabusVersion.hydrate({
        _id: id(),
        courseId: id(),
        versionNumber: 1,
        title: "Phiên bản 1.0",
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedBy: id(),
        createdBy: id(),
      });
      docRevert.$locals.initialStatus = "PUBLISHED";
      docRevert.status = "DRAFT";
      await expect(docRevert.validate()).rejects.toMatchObject({
        code: "SYLLABUS_VERSION_IMMUTABLE",
        statusCode: 409,
      });
    });

    test("CUR-02.HOOK.2: Transitioning PUBLISHED -> ARCHIVED with archive metadata passes validation", async () => {
      const doc = SyllabusVersion.hydrate({
        _id: id(),
        courseId: id(),
        versionNumber: 1,
        title: "Phiên bản 1.0",
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedBy: id(),
        createdBy: id(),
      });
      doc.$locals.initialStatus = "PUBLISHED";

      doc.status = "ARCHIVED";
      doc.archivedAt = new Date();
      doc.archivedBy = id();
      doc.updatedBy = id();

      await expect(doc.validate()).resolves.toBeUndefined();
    });

    test("CUR-02.HOOK.3: ARCHIVED SyllabusVersion rejects any mutation", async () => {
      const doc = SyllabusVersion.hydrate({
        _id: id(),
        courseId: id(),
        versionNumber: 1,
        title: "Phiên bản lưu trữ",
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedBy: id(),
        createdBy: id(),
      });
      doc.$locals.initialStatus = "ARCHIVED";

      doc.summary = "Thay đổi tóm tắt";
      await expect(doc.validate()).rejects.toMatchObject({
        code: "SYLLABUS_VERSION_IMMUTABLE",
        statusCode: 409,
      });
    });

    test("CUR-02.HOOK.4: DRAFT SyllabusVersion allows editing title and summary", async () => {
      const doc = SyllabusVersion.hydrate({
        _id: id(),
        courseId: id(),
        versionNumber: 2,
        title: "Bản nháp v2",
        status: "DRAFT",
        createdBy: id(),
      });
      doc.$locals.initialStatus = "DRAFT";

      doc.title = "Bản nháp v2 (Cập nhật)";
      doc.summary = "Bổ sung bài tập thực hành";
      await expect(doc.validate()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // 3. Draft Creation, Cloning & Conflict Handling
  // =========================================================================
  describe("3. Draft Creation, Cloning & Concurrency", () => {
    test("CUR-02.CREATE.1: createDraftVersion creates versionNumber=1 with initial units and audit log", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, title: "Toán 9", status: "ACTIVE" }));
      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(mockQuery(null));

      let insertedVersion = null;
      jest.spyOn(SyllabusVersion, "create").mockImplementationOnce(async ([doc]) => {
        insertedVersion = { ...doc, _id: new mongoose.Types.ObjectId(), toObject: () => ({ ...doc, _id: insertedVersion._id }) };
        return [insertedVersion];
      });

      let insertedUnits = [];
      jest.spyOn(CurriculumUnit, "insertMany").mockImplementationOnce(async (docs) => {
        insertedUnits = docs.map((d) => ({ ...d, _id: new mongoose.Types.ObjectId() }));
        return insertedUnits;
      });

      const auditSpy = jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);

      const res = await syllabusService.createDraftVersion(adminId, courseId.toString(), {
        title: "Giáo trình Toán 9 v1",
        summary: "Khung chương trình chuẩn",
        units: [
          { title: "Căn bậc hai", durationMinutes: 90, topics: ["Định nghĩa", "Phép biến đổi"] },
          { title: "Hàm số bậc nhất", durationMinutes: 90 },
        ],
      });

      expect(res.versionNumber).toBe(1);
      expect(res.status).toBe("DRAFT");
      expect(res.units).toHaveLength(2);
      expect(res.units[0].unitOrder).toBe(1);
      expect(res.units[1].unitOrder).toBe(2);
      expect(auditSpy).toHaveBeenCalledTimes(1);
      expect(auditSpy.mock.calls[0][0][0].action).toBe("SYLLABUS_VERSION_CREATED");
    });

    test("CUR-02.CREATE.2: createDraftVersion clones units cleanly from an existing PUBLISHED version", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const sourceVersionId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, title: "Vật lý 11", status: "ACTIVE" }));
      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });

      jest
        .spyOn(SyllabusVersion, "findOne")
        .mockReturnValueOnce(
          mockQuery({
            _id: sourceVersionId,
            courseId,
            versionNumber: 1,
            title: "Vật lý 11 v1",
            summary: "Dao động & Sóng",
            status: "PUBLISHED",
          })
        )
        .mockReturnValueOnce(mockQuery({ versionNumber: 1 }));

      jest.spyOn(CurriculumUnit, "find").mockReturnValue(
        mockQuery([
          {
            _id: new mongoose.Types.ObjectId(),
            unitOrder: 1,
            title: "Dao động điều hòa",
            description: "Chương 1",
            learningObjectives: "Nắm phương trình li độ",
            durationMinutes: 60,
            topics: ["Con lắc lò xo"],
          },
        ])
      );

      let clonedVersion = null;
      jest.spyOn(SyllabusVersion, "create").mockImplementationOnce(async ([doc]) => {
        const oid = new mongoose.Types.ObjectId();
        clonedVersion = { ...doc, _id: oid };
        return [{ ...clonedVersion, toObject: () => ({ ...clonedVersion }) }];
      });

      let insertedUnits = [];
      jest.spyOn(CurriculumUnit, "insertMany").mockImplementationOnce(async (docs) => {
        insertedUnits = docs.map((d) => ({ ...d, _id: new mongoose.Types.ObjectId() }));
        return insertedUnits;
      });
      jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);

      const result = await syllabusService.createDraftVersion(adminId, courseId.toString(), {
        cloneFromVersionId: sourceVersionId.toString(),
      });

      expect(result.versionNumber).toBe(2);
      expect(result.status).toBe("DRAFT");
      expect(result.clonedFromVersionId.toString()).toBe(sourceVersionId.toString());
      expect(result.units).toHaveLength(1);
      expect(result.units[0].title).toBe("Dao động điều hòa");
      expect(result.units[0].migratedFromLegacy).toBe(false);
    });

    test("CUR-02.CREATE.3: Concurrent E11000 versionNumber collision raises 409 SYLLABUS_VERSION_CONFLICT", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, title: "Hóa 12", status: "ACTIVE" }));
      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(mockQuery({ versionNumber: 2 }));
      jest.spyOn(SyllabusVersion, "create").mockRejectedValueOnce({ code: 11000 });

      await expect(
        syllabusService.createDraftVersion(adminId, courseId.toString(), { title: "v3" })
      ).rejects.toMatchObject({
        code: "SYLLABUS_VERSION_CONFLICT",
        statusCode: 409,
      });
    });

    test("CUR-02.CREATE.4: Rejects blank title and rejects passing both cloneFromVersionId and units", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const sourceVersionId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, title: "Anh 12", status: "ACTIVE" }));

      await expect(
        syllabusService.createDraftVersion(adminId, courseId.toString(), { title: "   " })
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });

      await expect(
        syllabusService.createDraftVersion(adminId, courseId.toString(), {
          cloneFromVersionId: sourceVersionId.toString(),
          units: [{ title: "Unit 1" }],
        })
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    });
  });

  // =========================================================================
  // 4. Unit CRUD, Reordering & Published Immutability Enforcement
  // =========================================================================
  describe("4. CurriculumUnit CRUD, Reorder & Service Immutability", () => {
    test("CUR-02.UNIT.1: Mutating metadata or units on PUBLISHED or ARCHIVED version throws 409 SYLLABUS_VERSION_IMMUTABLE", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const versionId = new mongoose.Types.ObjectId();
      const unitId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, status: "ACTIVE" }));
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(
        mockQuery({ _id: versionId, courseId, status: "PUBLISHED" })
      );

      await expect(
        syllabusService.updateDraftVersion(adminId, courseId, versionId, { title: "New" })
      ).rejects.toMatchObject({ code: "SYLLABUS_VERSION_IMMUTABLE", statusCode: 409 });

      await expect(
        syllabusService.addUnit(adminId, courseId, versionId, { title: "Extra Unit" })
      ).rejects.toMatchObject({ code: "SYLLABUS_VERSION_IMMUTABLE", statusCode: 409 });

      await expect(
        syllabusService.updateUnit(adminId, courseId, versionId, unitId, { title: "Edit Unit" })
      ).rejects.toMatchObject({ code: "SYLLABUS_VERSION_IMMUTABLE", statusCode: 409 });

      await expect(
        syllabusService.deleteUnit(adminId, courseId, versionId, unitId)
      ).rejects.toMatchObject({ code: "SYLLABUS_VERSION_IMMUTABLE", statusCode: 409 });

      await expect(
        syllabusService.reorderUnits(adminId, courseId, versionId, { unitIds: [unitId.toString()] })
      ).rejects.toMatchObject({ code: "SYLLABUS_VERSION_IMMUTABLE", statusCode: 409 });
    });

    test("CUR-02.UNIT.2: reorderUnits validates exact active unit set and performs two-phase offset bulkWrite", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const versionId = new mongoose.Types.ObjectId();
      const u1 = new mongoose.Types.ObjectId();
      const u2 = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, status: "ACTIVE" }));
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(
        mockQuery({ _id: versionId, courseId, status: "DRAFT" })
      );

      jest
        .spyOn(CurriculumUnit, "find")
        .mockReturnValueOnce(mockQuery([{ _id: u1 }, { _id: u2 }]))
        .mockReturnValueOnce(mockQuery([{ _id: u2, unitOrder: 1 }, { _id: u1, unitOrder: 2 }]));

      // Missing u2 -> must reject 400
      await expect(
        syllabusService.reorderUnits(adminId, courseId, versionId, { unitIds: [u1.toString()] })
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });

      // Reset find spy for valid reorder
      jest.restoreAllMocks();
      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, status: "ACTIVE" }));
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(
        mockQuery({ _id: versionId, courseId, status: "DRAFT" })
      );
      jest
        .spyOn(CurriculumUnit, "find")
        .mockReturnValueOnce(mockQuery([{ _id: u1 }, { _id: u2 }]))
        .mockReturnValueOnce(mockQuery([{ _id: u2, unitOrder: 1 }, { _id: u1, unitOrder: 2 }]));

      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });

      const updateManySpy = jest.spyOn(CurriculumUnit, "updateMany").mockResolvedValue({ modifiedCount: 2 });
      const bulkWriteSpy = jest.spyOn(CurriculumUnit, "bulkWrite").mockResolvedValue({ modifiedCount: 2 });

      const reordered = await syllabusService.reorderUnits(adminId, courseId, versionId, {
        unitIds: [u2.toString(), u1.toString()],
      });

      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({ syllabusVersionId: versionId }),
        { $inc: { unitOrder: 100000 } },
        expect.objectContaining({ session: expect.anything() })
      );
      expect(bulkWriteSpy).toHaveBeenCalledTimes(1);
      const ops = bulkWriteSpy.mock.calls[0][0];
      expect(ops[0].updateOne.filter._id).toBe(u2.toString());
      expect(ops[0].updateOne.update.$set.unitOrder).toBe(1);
      expect(ops[1].updateOne.filter._id).toBe(u1.toString());
      expect(ops[1].updateOne.update.$set.unitOrder).toBe(2);
      expect(reordered[0]._id).toBe(u2);
    });
  });

  // =========================================================================
  // 5. Publish & Archive Transactions & Concurrency
  // =========================================================================
  describe("5. Publish, Archive Transactions & Concurrent Index Enforcement", () => {
    test("CUR-02.PUB.1: Cannot publish an empty DRAFT version (0 units)", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const versionId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, status: "ACTIVE" }));
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(mockQuery({ _id: versionId, courseId, status: "DRAFT" }));
      jest.spyOn(CurriculumUnit, "find").mockReturnValue(mockQuery([]));

      await expect(syllabusService.publishVersion(adminId, courseId, versionId)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    });

    test("CUR-02.PUB.2: publishVersion atomically archives old PUBLISHED version, promotes DRAFT, syncs Course pointer & logs AuditLog", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const priorId = new mongoose.Types.ObjectId();
      const draftId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(
        mockQuery({ _id: courseId, title: "IELTS 6.5", publishedSyllabusVersionId: priorId, status: "ACTIVE" })
      );
      jest
        .spyOn(SyllabusVersion, "findOne")
        .mockReturnValueOnce(
          mockQuery({
            _id: draftId,
            courseId,
            versionNumber: 2,
            title: "IELTS 6.5 v2",
            status: "DRAFT",
            toObject: () => ({ _id: draftId, courseId, versionNumber: 2, title: "IELTS 6.5 v2", status: "DRAFT" }),
          })
        )
        .mockReturnValueOnce(
          mockQuery({ _id: priorId, courseId, versionNumber: 1, status: "PUBLISHED" })
        );

      jest.spyOn(CurriculumUnit, "find").mockReturnValue(
        mockQuery([
          { _id: new mongoose.Types.ObjectId(), unitOrder: 1, title: "Listening Strategies" },
          { _id: new mongoose.Types.ObjectId(), unitOrder: 2, title: "Writing Task 2" },
        ])
      );

      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });

      const svUpdateSpy = jest
        .spyOn(SyllabusVersion, "updateOne")
        .mockResolvedValueOnce({ modifiedCount: 1 }) // archive v1
        .mockResolvedValueOnce({ modifiedCount: 1 }); // publish v2
      const courseUpdateSpy = jest.spyOn(Course, "updateOne").mockResolvedValue({ modifiedCount: 1 });
      const auditSpy = jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);

      const published = await syllabusService.publishVersion(adminId, courseId.toString(), draftId.toString());

      expect(published.status).toBe("PUBLISHED");
      expect(svUpdateSpy).toHaveBeenNthCalledWith(
        1,
        { _id: priorId, status: "PUBLISHED" },
        expect.objectContaining({ $set: expect.objectContaining({ status: "ARCHIVED", archivedBy: adminId }) }),
        expect.any(Object)
      );
      expect(svUpdateSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ _id: draftId, status: "DRAFT" }),
        expect.objectContaining({ $set: expect.objectContaining({ status: "PUBLISHED", publishedBy: adminId }) }),
        expect.any(Object)
      );
      expect(courseUpdateSpy).toHaveBeenCalledWith(
        { _id: courseId },
        {
          $set: {
            publishedSyllabusVersionId: draftId,
            syllabus: "1. Listening Strategies\n2. Writing Task 2",
            updatedBy: adminId,
          },
        },
        expect.any(Object)
      );
      expect(auditSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ action: "SYLLABUS_VERSION_PUBLISHED", targetId: draftId })],
        expect.any(Object)
      );
    });

    test("CUR-02.PUB.3: Concurrent partial-unique index violation (11000) maps cleanly to 409 SYLLABUS_PUBLISH_CONFLICT", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const draftId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, status: "ACTIVE" }));
      jest
        .spyOn(SyllabusVersion, "findOne")
        .mockReturnValueOnce(mockQuery({ _id: draftId, courseId, versionNumber: 1, status: "DRAFT" }))
        .mockReturnValueOnce(mockQuery(null));
      jest.spyOn(CurriculumUnit, "find").mockReturnValue(mockQuery([{ _id: new mongoose.Types.ObjectId(), unitOrder: 1, title: "Unit 1" }]));
      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });
      jest.spyOn(SyllabusVersion, "updateOne").mockRejectedValueOnce({ code: 11000 });

      await expect(syllabusService.publishVersion(adminId, courseId, draftId)).rejects.toMatchObject({
        code: "SYLLABUS_PUBLISH_CONFLICT",
        statusCode: 409,
      });
    });

    test("CUR-02.PUB.4: archiveVersion archives active PUBLISHED version and clears Course.publishedSyllabusVersionId while preserving Course.syllabus", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const versionId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, publishedSyllabusVersionId: versionId, status: "ACTIVE" }));
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(
        mockQuery({
          _id: versionId,
          courseId,
          status: "PUBLISHED",
          toObject: () => ({ _id: versionId, courseId, status: "PUBLISHED" }),
        })
      );
      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });
      jest.spyOn(SyllabusVersion, "updateOne").mockResolvedValue({ modifiedCount: 1 });
      const courseUpdateSpy = jest.spyOn(Course, "updateOne").mockResolvedValue({ modifiedCount: 1 });
      const auditSpy = jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);

      const archived = await syllabusService.archiveVersion(adminId, courseId, versionId);
      expect(archived.status).toBe("ARCHIVED");
      expect(courseUpdateSpy).toHaveBeenCalledWith(
        { _id: courseId, publishedSyllabusVersionId: versionId },
        { $set: { publishedSyllabusVersionId: null, updatedBy: adminId } },
        expect.any(Object)
      );
      expect(auditSpy.mock.calls[0][0][0].action).toBe("SYLLABUS_VERSION_ARCHIVED");
    });
  });

  // =========================================================================
  // 6. Backward Compatibility & Legacy Course Guard
  // =========================================================================
  describe("6. Backward Compatibility & Legacy Guard", () => {
    test("CUR-02.COMPAT.1: getPublishedSyllabus redacts internal fields and returns VERSIONED data", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const versionId = new mongoose.Types.ObjectId();
      const staffId = new mongoose.Types.ObjectId();

      jest.spyOn(Course, "findOne").mockReturnValue(
        mockQuery({
          _id: courseId,
          title: "Python Cơ Bản",
          status: "ACTIVE",
          publishedSyllabusVersionId: versionId,
          syllabus: "1. Biến & Kiểu dữ liệu",
        })
      );
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(
        mockQuery({
          _id: versionId,
          courseId,
          versionNumber: 1,
          title: "Python v1",
          status: "PUBLISHED",
          publishedBy: staffId,
          createdBy: staffId,
          clonedFromVersionId: null,
          migratedFromLegacy: false,
        })
      );
      jest.spyOn(CurriculumUnit, "find").mockReturnValue(
        mockQuery([
          {
            _id: new mongoose.Types.ObjectId(),
            unitOrder: 1,
            title: "Biến & Kiểu dữ liệu",
            createdBy: staffId,
            migratedFromLegacy: false,
          },
        ])
      );

      const res = await syllabusService.getPublishedSyllabus(courseId.toString());
      expect(res.source).toBe("VERSIONED");
      expect(res.version.publishedBy).toBeUndefined();
      expect(res.version.createdBy).toBeUndefined();
      expect(res.units[0].createdBy).toBeUndefined();
      expect(res.units[0].migratedFromLegacy).toBeUndefined();
    });

    test("CUR-02.COMPAT.2: getPublishedSyllabus falls back cleanly to legacy Course.syllabus and never leaks DRAFT/ARCHIVED", async () => {
      const courseId = new mongoose.Types.ObjectId();
      jest.spyOn(Course, "findOne").mockReturnValue(
        mockQuery({
          _id: courseId,
          title: "Khóa học Legacy",
          status: "ACTIVE",
          publishedSyllabusVersionId: null,
          syllabus: "Tuần 1: Nhập môn\nTuần 2: Thực hành",
        })
      );
      const findSpy = jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(mockQuery(null));

      const res = await syllabusService.getPublishedSyllabus(courseId.toString());
      expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ status: "PUBLISHED" }));
      expect(res.source).toBe("LEGACY");
      expect(res.version).toBeNull();
      expect(res.legacySyllabus).toBe("Tuần 1: Nhập môn\nTuần 2: Thực hành");
    });

    test("CUR-02.COMPAT.3: courseCatalogService.updateCourse blocks overwriting syllabus once publishedSyllabusVersionId is set", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const catId = new mongoose.Types.ObjectId();
      const versionId = new mongoose.Types.ObjectId();

      const mockCourse = {
        _id: courseId,
        categoryId: catId,
        subjectId: new mongoose.Types.ObjectId(),
        title: "Toán 12",
        syllabus: "1. Đạo hàm",
        publishedSyllabusVersionId: versionId,
        save: jest.fn().mockResolvedValue(true),
        toObject: function () {
          return { ...this };
        },
      };

      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery(mockCourse));
      jest.spyOn(Category, "findOne").mockReturnValue(mockQuery({ _id: catId, name: "THPT", slug: "thpt" }));
      jest.spyOn(Class, "updateMany").mockResolvedValue({ modifiedCount: 0 });

      await expect(
        courseCatalogService.updateCourse(adminId, courseId.toString(), { syllabus: "Ghi đè trực tiếp" })
      ).rejects.toMatchObject({
        code: "SYLLABUS_VERSION_IMMUTABLE",
        statusCode: 409,
      });

      // Updating other metadata without changing syllabus still succeeds
      await expect(
        courseCatalogService.updateCourse(adminId, courseId.toString(), { description: "Mô tả mới" })
      ).resolves.toMatchObject({ description: "Mô tả mới" });
    });
  });

  // =========================================================================
  // 7. End-to-End HTTP Express App (RBAC, Envelopes & IDOR Protection)
  // =========================================================================
  describe("7. HTTP API Routes, RBAC Authorization & IDOR Enforcement", () => {
    const courseId = new mongoose.Types.ObjectId();
    const versionId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();

    test("CUR-02.HTTP.1: Rejects unauthenticated callers with 401 and non-ADMIN roles with 403", async () => {
      // Unauthenticated (production mode -> requires Bearer JWT)
      const unauthRes = await invokeApp({
        method: "GET",
        url: `/api/admin/courses/${courseId}/syllabus-versions`,
        nodeEnv: "production",
      });
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.error).toBe("UNAUTHORIZED");

      // TEACHER trying Admin route -> 403 FORBIDDEN
      const teacherRes = await invokeApp({
        method: "POST",
        url: `/api/admin/courses/${courseId}/syllabus-versions`,
        headers: { "x-user-role": "TEACHER" },
        body: { title: "Hacked Draft" },
      });
      expect(teacherRes.status).toBe(403);
      expect(teacherRes.body.error).toBe("FORBIDDEN");

      // STUDENT trying Admin publish route -> 403 FORBIDDEN
      const studentRes = await invokeApp({
        method: "POST",
        url: `/api/admin/courses/${courseId}/syllabus-versions/${versionId}/publish`,
        headers: { "x-user-role": "STUDENT" },
      });
      expect(studentRes.status).toBe(403);
      expect(studentRes.body.error).toBe("FORBIDDEN");
    });

    test("CUR-02.HTTP.2: Enforces IDOR check when versionId belongs to a different Course -> 404 SYLLABUS_VERSION_NOT_FOUND", async () => {
      jest.spyOn(User, "findById").mockReturnValue(
        mockQuery({ _id: adminId, role: "ADMIN", status: "ACTIVE", isDeleted: false })
      );
      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, title: "Course A", status: "ACTIVE" }));
      // Query filters by { _id: versionId, courseId }, so mismatch returns null
      const svSpy = jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(mockQuery(null));

      const res = await invokeApp({
        method: "GET",
        url: `/api/admin/courses/${courseId}/syllabus-versions/${versionId}`,
        headers: { "x-user-role": "ADMIN", "x-user-id": adminId.toString() },
      });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        error: "SYLLABUS_VERSION_NOT_FOUND",
      });
      expect(svSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: versionId.toString(),
          courseId,
        })
      );
    });

    test("CUR-02.HTTP.4: Admin POST /api/admin/courses/:id/syllabus-versions returns 201 envelope with serialized id", async () => {
      jest.spyOn(User, "findById").mockReturnValue(
        mockQuery({ _id: adminId, role: "ADMIN", status: "ACTIVE", isDeleted: false })
      );
      jest.spyOn(Course, "findOne").mockReturnValue(mockQuery({ _id: courseId, title: "Toán 10", status: "ACTIVE" }));
      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(mockQuery(null));
      jest.spyOn(SyllabusVersion, "create").mockImplementationOnce(async ([doc]) => {
        const created = { ...doc, _id: versionId, toObject: () => ({ ...doc, _id: versionId }) };
        return [created];
      });
      jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);

      const res = await invokeApp({
        method: "POST",
        url: `/api/admin/courses/${courseId}/syllabus-versions`,
        headers: { "x-user-role": "ADMIN", "x-user-id": adminId.toString() },
        body: { title: "Giáo trình Toán 10 v1", summary: "Bản khởi tạo" },
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(versionId.toString());
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.versionNumber).toBe(1);
    });

    test("CUR-02.HTTP.3: Public GET /api/courses/:id/syllabus returns standardized envelope without auth", async () => {
      jest.spyOn(Course, "findOne").mockReturnValue(
        mockQuery({
          _id: courseId,
          title: "Toán 10",
          status: "ACTIVE",
          publishedSyllabusVersionId: versionId,
          syllabus: "1. Tập hợp",
        })
      );
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValue(
        mockQuery({
          _id: versionId,
          courseId,
          versionNumber: 1,
          title: "Toán 10 v1",
          status: "PUBLISHED",
          publishedBy: adminId,
        })
      );
      jest.spyOn(CurriculumUnit, "find").mockReturnValue(
        mockQuery([{ _id: new mongoose.Types.ObjectId(), unitOrder: 1, title: "Tập hợp" }])
      );

      const res = await invokeApp({
        method: "GET",
        url: `/api/courses/${courseId}/syllabus`,
        nodeEnv: "production",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.source).toBe("VERSIONED");
      expect(res.body.data.version.id).toBe(versionId.toString());
      expect(res.body.data.version.publishedBy).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Migration Forward / Backward, Dry-Run, Preflight & DB Guardrails
  // =========================================================================
  describe("8. Syllabus Migration Engine & Safety Guardrails", () => {
    test("CUR-02.MIG.1: parseLegacySyllabusLines strips numbering/bullets and normalizes multiline syllabus", () => {
      const parsed = parseLegacySyllabusLines("1. Mệnh đề tập hợp\r\n2) Hàm số bậc hai\n- Vectơ trong mặt phẳng\n\n* Tích vô hướng");
      expect(parsed).toEqual([
        "Mệnh đề tập hợp",
        "Hàm số bậc hai",
        "Vectơ trong mặt phẳng",
        "Tích vô hướng",
      ]);
      expect(parseLegacySyllabusLines(null)).toEqual([]);
      expect(parseLegacySyllabusLines("   ")).toEqual([]);
    });

    test("CUR-02.MIG.2: assertSafeMigrationTarget blocks remote production 'edunity' DB without explicit override", () => {
      expect(() =>
        assertSafeMigrationTarget("edunity", "mongodb+srv://cluster.example.net/edunity", false)
      ).toThrow(/SECURITY BLOCKER/);

      expect(() =>
        assertSafeMigrationTarget("edunity_demo_v3", "mongodb+srv://cluster.example.net/edunity_demo_v3", false)
      ).not.toThrow();

      expect(() =>
        assertSafeMigrationTarget("edunity", "mongodb://127.0.0.1:27017/edunity", false)
      ).not.toThrow();
    });

    test("CUR-02.MIG.3: migrateForward dryRun performs zero writes; execute is idempotent and preserves Course.syllabus", async () => {
      const c1 = new mongoose.Types.ObjectId();
      const adminId = new mongoose.Types.ObjectId();

      const fakeCourses = [
        { _id: c1, title: "Toán 10", syllabus: "1. Tập hợp\n2. Hàm số", publishedSyllabusVersionId: null, createdBy: adminId },
      ];
      const fakeVersions = [];
      const fakeUnits = [];

      const mockModels = {
        Course: {
          find: () => ({ select: () => ({ lean: async () => fakeCourses.map((c) => ({ ...c })) }) }),
          updateOne: async ({ _id }, { $set }) => {
            const target = fakeCourses.find((c) => c._id.toString() === _id.toString());
            if (target && $set.publishedSyllabusVersionId !== undefined) {
              target.publishedSyllabusVersionId = $set.publishedSyllabusVersionId;
            }
            return { modifiedCount: 1 };
          },
        },
        SyllabusVersion: {
          findOne: ({ courseId, status }) => ({
            sort: () => ({ select: () => ({ lean: async () => null }) }),
            lean: async () =>
              fakeVersions.find(
                (v) => v.courseId.toString() === courseId.toString() && (!status || v.status === status)
              ) || null,
          }),
          create: async ([doc]) => {
            const created = { ...doc, _id: new mongoose.Types.ObjectId() };
            fakeVersions.push(created);
            return [created];
          },
        },
        CurriculumUnit: {
          insertMany: async (docs) => {
            const created = docs.map((d) => ({ ...d, _id: new mongoose.Types.ObjectId() }));
            fakeUnits.push(...created);
            return created;
          },
        },
      };

      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });

      // Dry-run -> 0 writes
      const dryStats = await migrateForward({ dryRun: true, models: mockModels, logger: () => {} });
      expect(dryStats.migrated).toBe(1);
      expect(dryStats.unitsCreated).toBe(2);
      expect(fakeVersions).toHaveLength(0);
      expect(fakeCourses[0].publishedSyllabusVersionId).toBeNull();

      // Execute pass 1
      const run1 = await migrateForward({ dryRun: false, models: mockModels, logger: () => {} });
      expect(run1.migrated).toBe(1);
      expect(fakeVersions).toHaveLength(1);
      expect(fakeVersions[0].status).toBe("PUBLISHED");
      expect(fakeVersions[0].migratedFromLegacy).toBe(true);
      expect(fakeUnits).toHaveLength(2);
      expect(fakeCourses[0].publishedSyllabusVersionId).toBe(fakeVersions[0]._id);
      expect(fakeCourses[0].syllabus).toBe("1. Tập hợp\n2. Hàm số"); // Preserved!

      // Execute pass 2 (idempotent!)
      const run2 = await migrateForward({ dryRun: false, models: mockModels, logger: () => {} });
      expect(run2.migrated).toBe(0);
      expect(run2.skippedAlreadyMigrated).toBe(1);
      expect(fakeVersions).toHaveLength(1);
      expect(fakeUnits).toHaveLength(2);
    });

    test("CUR-02.MIG.4: migrateBackward removes ONLY migratedFromLegacy records and keeps user-created versions & Course.syllabus", async () => {
      const c1 = new mongoose.Types.ObjectId();
      const migVerId = new mongoose.Types.ObjectId();
      const userVerId = new mongoose.Types.ObjectId();

      const fakeCourses = [
        { _id: c1, syllabus: "1. Tập hợp", publishedSyllabusVersionId: migVerId },
      ];
      let fakeVersions = [
        { _id: migVerId, courseId: c1, migratedFromLegacy: true },
        { _id: userVerId, courseId: new mongoose.Types.ObjectId(), migratedFromLegacy: false },
      ];
      let fakeUnits = [
        { _id: new mongoose.Types.ObjectId(), syllabusVersionId: migVerId, migratedFromLegacy: true },
        { _id: new mongoose.Types.ObjectId(), syllabusVersionId: userVerId, migratedFromLegacy: false },
      ];

      const mockModels = {
        Course: {
          updateMany: async () => {
            let modified = 0;
            for (const c of fakeCourses) {
              if (c.publishedSyllabusVersionId && c.publishedSyllabusVersionId.toString() === migVerId.toString()) {
                c.publishedSyllabusVersionId = null;
                modified += 1;
              }
            }
            return { modifiedCount: modified };
          },
        },
        SyllabusVersion: {
          find: ({ migratedFromLegacy }) => ({
            select: () => ({
              lean: async () => fakeVersions.filter((v) => v.migratedFromLegacy === migratedFromLegacy),
            }),
          }),
          deleteMany: async ({ migratedFromLegacy }) => {
            fakeVersions = fakeVersions.filter((v) => v.migratedFromLegacy !== migratedFromLegacy);
            return { deletedCount: 1 };
          },
        },
        CurriculumUnit: {
          countDocuments: async () => fakeUnits.filter((u) => u.migratedFromLegacy).length,
          deleteMany: async () => {
            fakeUnits = fakeUnits.filter((u) => !u.migratedFromLegacy);
            return { deletedCount: 1 };
          },
        },
      };

      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });

      const rb = await migrateBackward({ dryRun: false, models: mockModels, logger: () => {} });
      expect(rb.coursesCleared).toBe(1);
      expect(rb.versionsToRemove).toBe(1);
      expect(rb.unitsToRemove).toBe(1);
      expect(fakeCourses[0].publishedSyllabusVersionId).toBeNull();
      expect(fakeCourses[0].syllabus).toBe("1. Tập hợp");
      expect(fakeVersions).toHaveLength(1);
      expect(fakeVersions[0]._id).toBe(userVerId);
      expect(fakeUnits).toHaveLength(1);
    });

    test("CUR-02.MIG.5: runSyllabusPreflight detects duplicate PUBLISHED versions and orphan CurriculumUnits", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const v1 = new mongoose.Types.ObjectId();
      const v2 = new mongoose.Types.ObjectId();

      const mockModels = {
        Course: { find: () => ({ select: () => ({ lean: async () => [{ _id: courseId, title: "Toán 8", syllabus: "A" }] }) }) },
        SyllabusVersion: {
          find: () => ({
            select: () => ({
              lean: async () => [
                { _id: v1, courseId, versionNumber: 1, status: "PUBLISHED" },
                { _id: v2, courseId, versionNumber: 2, status: "PUBLISHED" },
              ],
            }),
          }),
        },
        CurriculumUnit: {
          find: () => ({
            select: () => ({
              lean: async () => [{ _id: new mongoose.Types.ObjectId(), syllabusVersionId: new mongoose.Types.ObjectId(), unitOrder: 1 }],
            }),
          }),
        },
      };

      const preflight = await runSyllabusPreflight({ models: mockModels });
      expect(preflight.passed).toBe(false);
      expect(preflight.blockers.map((b) => b.rule)).toContain("DUPLICATE_PUBLISHED_SYLLABUS");
      expect(preflight.blockers.map((b) => b.rule)).toContain("ORPHAN_CURRICULUM_UNITS");
    });
  });
});
