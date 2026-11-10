const mongoose = require("mongoose");
const Course = require("../src/models/Course");
const CourseProposal = require("../src/models/CourseProposal");
const Category = require("../src/models/Category");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../src/models/constants");
const {
  normalizeLevel,
  resolveLevel,
  searchCourses,
  createCourse,
  updateCourse,
  insertCourse,
} = require("../src/services/courseCatalogService");
const { allowedGradeLevelsForCategory, resolveGradeLevel } = require("../src/utils/gradeLevel");
const courseProposalService = require("../src/services/courseProposalService");

describe("TASK CUR-01: Course Grade Level, Curriculum Reference & Hierarchy Suite", () => {
  // =========================================================================
  // 1. Schema Extensions & Invariant Verifications
  // =========================================================================
  describe("1. Schema Extensions & Invariants (Course & CourseProposal)", () => {
    test("CUR-01.SCH.1: Course schema contains curriculumReference as optional String", () => {
      const field = Course.schema.paths.curriculumReference;
      expect(field).toBeDefined();
      expect(field.instance).toBe("String");
      expect(field.options.default).toBeNull();
      expect(field.options.trim).toBe(true);
    });

    test("CUR-01.SCH.2: CourseProposal schema contains curriculumReference as optional String", () => {
      const field = CourseProposal.schema.paths.curriculumReference;
      expect(field).toBeDefined();
      expect(field.instance).toBe("String");
      expect(field.options.default).toBeNull();
      expect(field.options.trim).toBe(true);
    });

    test("CUR-01.SCH.3: Course schema maintains strict COURSE_LEVELS enum (BEGINNER, not BASIC)", () => {
      const levelField = Course.schema.paths.level;
      expect(levelField).toBeDefined();
      expect(levelField.options.enum).toEqual(COURSE_LEVELS);
      expect(COURSE_LEVELS).toContain("BEGINNER");
      expect(COURSE_LEVELS).toContain("INTERMEDIATE");
      expect(COURSE_LEVELS).toContain("ADVANCED");
      expect(COURSE_LEVELS).not.toContain("BASIC"); // Schema enum must never contain BASIC
    });

    test("CUR-01.SCH.4: Course schema maintains GRADE_LEVELS enum with 15 standardized grades", () => {
      const gradeField = Course.schema.paths.gradeLevel;
      expect(gradeField).toBeDefined();
      expect(gradeField.options.enum).toEqual(GRADE_LEVELS);
      expect(GRADE_LEVELS).toHaveLength(15);
      expect(GRADE_LEVELS).toContain("PRE_PRIMARY");
      expect(GRADE_LEVELS).toContain("GRADE_1");
      expect(GRADE_LEVELS).toContain("GRADE_12");
      expect(GRADE_LEVELS).toContain("UNIVERSITY");
      expect(GRADE_LEVELS).toContain("COLLEGE");
    });

    test("CUR-01.SCH.5: Course schema indexes include categoryId+gradeLevel and curriculumReference", () => {
      const indexes = Course.schema.indexes();

      // Index { categoryId: 1, gradeLevel: 1, status: 1 }
      const gradeIndex = indexes.find(
        (idx) => idx[0].categoryId === 1 && idx[0].gradeLevel === 1 && idx[0].status === 1
      );
      expect(gradeIndex).toBeDefined();

      // Index { curriculumReference: 1 }
      const currIndex = indexes.find((idx) => idx[0].curriculumReference === 1);
      expect(currIndex).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Ingress Level Normalization & Backward Compatibility
  // =========================================================================
  describe("2. Ingress Level Normalization (BASIC -> BEGINNER)", () => {
    test("CUR-01.LVL.1: normalizeLevel maps legacy 'BASIC' (case-insensitive) to 'BEGINNER'", () => {
      expect(normalizeLevel("BASIC")).toBe("BEGINNER");
      expect(normalizeLevel("basic")).toBe("BEGINNER");
      expect(normalizeLevel("Basic")).toBe("BEGINNER");
      expect(normalizeLevel("  basic  ")).toBe("BEGINNER");
    });

    test("CUR-01.LVL.2: normalizeLevel preserves canonical COURSE_LEVELS", () => {
      expect(normalizeLevel("BEGINNER")).toBe("BEGINNER");
      expect(normalizeLevel("INTERMEDIATE")).toBe("INTERMEDIATE");
      expect(normalizeLevel("ADVANCED")).toBe("ADVANCED");
    });

    test("CUR-01.LVL.3: normalizeLevel returns undefined for blank or null inputs", () => {
      expect(normalizeLevel(undefined)).toBeUndefined();
      expect(normalizeLevel(null)).toBeUndefined();
      expect(normalizeLevel("")).toBeUndefined();
    });

    test("CUR-01.LVL.4: resolveLevel validates and maps BASIC to BEGINNER successfully", () => {
      expect(resolveLevel("BASIC")).toBe("BEGINNER");
      expect(resolveLevel("BEGINNER")).toBe("BEGINNER");
      expect(resolveLevel("INTERMEDIATE")).toBe("INTERMEDIATE");
      expect(resolveLevel("ADVANCED")).toBe("ADVANCED");
      expect(resolveLevel(null)).toBeUndefined();
    });

    test("CUR-01.LVL.5: resolveLevel rejects invalid level with 400 VALIDATION_ERROR", () => {
      expect(() => resolveLevel("EXPERT")).toThrow(/level must be one of BEGINNER/);
      expect(() => resolveLevel("MASTER")).toThrow(/level must be one of BEGINNER/);
    });
  });

  // =========================================================================
  // 3. Category - Grade Level Binding & Validation
  // =========================================================================
  describe("3. Category - Grade Level Binding (BR-43, BR-44, BR-45)", () => {
    const catTHCS = { name: "Trung học cơ sở", slug: "trung-hoc-co-so" };
    const catTieuHoc = { name: "Tiểu học", slug: "tieu-hoc" };
    const catNgoaiNgu = { name: "Ngoại ngữ", slug: "ngoai-ngu" };

    test("CUR-01.CAT.1: allowedGradeLevelsForCategory derives allowed grades from category name/slug", () => {
      expect(allowedGradeLevelsForCategory(catTHCS)).toEqual([
        "GRADE_6",
        "GRADE_7",
        "GRADE_8",
        "GRADE_9",
      ]);
      expect(allowedGradeLevelsForCategory(catTieuHoc)).toEqual([
        "GRADE_1",
        "GRADE_2",
        "GRADE_3",
        "GRADE_4",
        "GRADE_5",
      ]);
      expect(allowedGradeLevelsForCategory(catNgoaiNgu)).toBeNull(); // Unrestricted
    });

    test("CUR-01.CAT.2: resolveGradeLevel allows matching grade level", () => {
      expect(resolveGradeLevel(catTHCS, "GRADE_7")).toBe("GRADE_7");
      expect(resolveGradeLevel(catTieuHoc, "GRADE_3")).toBe("GRADE_3");
      expect(resolveGradeLevel(catNgoaiNgu, null)).toBeNull();
      expect(resolveGradeLevel(catNgoaiNgu, "GRADE_10")).toBe("GRADE_10");
    });

    test("CUR-01.CAT.3: resolveGradeLevel throws GRADE_LEVEL_CATEGORY_MISMATCH when grade outside category", () => {
      expect(() => resolveGradeLevel(catTHCS, "GRADE_12")).toThrow(
        /gradeLevel does not match the selected category/
      );
      expect(() => resolveGradeLevel(catTieuHoc, "GRADE_9")).toThrow(
        /gradeLevel does not match the selected category/
      );
    });

    test("CUR-01.CAT.4: resolveGradeLevel throws INVALID_GRADE_LEVEL for non-existent grade enum", () => {
      expect(() => resolveGradeLevel(catTHCS, "GRADE_99")).toThrow(
        /gradeLevel is not a standard grade level/
      );
    });
  });

  // =========================================================================
  // 4. Course Catalog Service Integration (Curriculum Reference & Search)
  // =========================================================================
  describe("4. Course Catalog Service Integration", () => {
    let mockCategory, mockSubject;

    beforeEach(() => {
      jest.restoreAllMocks();

      mockCategory = {
        _id: new mongoose.Types.ObjectId(),
        name: "Trung học cơ sở",
        slug: "trung-hoc-co-so",
        status: "ACTIVE",
      };

      mockSubject = {
        _id: new mongoose.Types.ObjectId(),
        categoryId: mockCategory._id,
        name: "Toán học",
        slug: "toan-hoc",
        status: "ACTIVE",
      };
    });

    test("CUR-01.SVC.1: insertCourse includes curriculumReference and normalizes level: 'BASIC' -> 'BEGINNER'", async () => {
      let createdDoc = null;
      jest.spyOn(Course, "findOne").mockResolvedValue(null);
      jest.spyOn(Course, "exists").mockResolvedValue(false);
      jest.spyOn(Course, "create").mockImplementationOnce(async ([doc]) => {
        createdDoc = { ...doc, _id: new mongoose.Types.ObjectId() };
        return [createdDoc];
      });

      await insertCourse({
        adminId: new mongoose.Types.ObjectId(),
        subject: mockSubject,
        category: mockCategory,
        data: {
          title: "Toán 6 - Bộ Cánh Diều",
          level: "BASIC", // Legacy enum to be normalized
          gradeLevel: "GRADE_6",
          curriculumReference: "Cánh Diều",
          description: "Khóa học bám sát SGK Cánh Diều",
        },
      });

      expect(createdDoc.curriculumReference).toBe("Cánh Diều");
      expect(createdDoc.level).toBe("BEGINNER"); // Successfully normalized!
      expect(createdDoc.gradeLevel).toBe("GRADE_6");
      expect(createdDoc.subjectName).toBe("Toán học");
      expect(createdDoc.categoryName).toBe("Trung học cơ sở");
    });

    test("CUR-01.SVC.2: searchCourses filters by curriculumReference with case-insensitive regex", async () => {
      let capturedFilter = null;
      jest.spyOn(Course, "find").mockImplementationOnce((filter) => {
        capturedFilter = filter;
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [
                  {
                    _id: new mongoose.Types.ObjectId(),
                    title: "Toán 7 - Cánh Diều",
                    curriculumReference: "Cánh Diều",
                  },
                ],
              }),
            }),
          }),
        };
      });
      jest.spyOn(Course, "countDocuments").mockResolvedValueOnce(1);

      const result = await searchCourses(
        { curriculumReference: "Cánh Diều" },
        { skip: 0, pageSize: 20, page: 1 }
      );

      expect(capturedFilter.curriculumReference).toBeDefined();
      expect(capturedFilter.curriculumReference.$regex).toBe("Cánh Diều");
      expect(capturedFilter.curriculumReference.$options).toBe("i");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].curriculumReference).toBe("Cánh Diều");
    });

    test("CUR-01.SVC.3: searchCourses general search ($or) includes curriculumReference", async () => {
      let capturedFilter = null;
      jest.spyOn(Course, "find").mockImplementationOnce((filter) => {
        capturedFilter = filter;
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [],
              }),
            }),
          }),
        };
      });
      jest.spyOn(Course, "countDocuments").mockResolvedValueOnce(0);

      await searchCourses({ search: "Kết Nối Tri Thức" }, { skip: 0, pageSize: 20, page: 1 });

      expect(capturedFilter.$or).toBeDefined();
      expect(capturedFilter.$or).toHaveLength(3);
      expect(capturedFilter.$or).toContainEqual({
        title: { $regex: "Kết Nối Tri Thức", $options: "i" },
      });
      expect(capturedFilter.$or).toContainEqual({
        description: { $regex: "Kết Nối Tri Thức", $options: "i" },
      });
      expect(capturedFilter.$or).toContainEqual({
        curriculumReference: { $regex: "Kết Nối Tri Thức", $options: "i" },
      });
    });

    test("CUR-01.SVC.4: updateCourse allows updating curriculumReference and level", async () => {
      const mockCourseDoc = {
        _id: new mongoose.Types.ObjectId(),
        categoryId: mockCategory._id,
        subjectId: mockSubject._id,
        title: "Toán 6",
        level: "BEGINNER",
        gradeLevel: "GRADE_6",
        curriculumReference: "Cánh Diều",
        save: jest.fn().mockResolvedValue(true),
        toObject: function () {
          return { ...this };
        },
      };

      jest.spyOn(Course, "findOne").mockResolvedValue(mockCourseDoc);
      jest.spyOn(Category, "findOne").mockResolvedValue(mockCategory);

      const Class = require("../src/models/Class");
      jest.spyOn(Class, "updateMany").mockResolvedValue({ modifiedCount: 1 });

      const updated = await updateCourse(new mongoose.Types.ObjectId(), mockCourseDoc._id, {
        curriculumReference: "Chân Trời Sáng Tạo",
        level: "ADVANCED",
      });

      expect(mockCourseDoc.curriculumReference).toBe("Chân Trời Sáng Tạo");
      expect(mockCourseDoc.level).toBe("ADVANCED");
      expect(mockCourseDoc.save).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. Course Proposal Workflow (Teacher submission & Admin approval)
  // =========================================================================
  describe("5. Course Proposal Workflow (Curriculum Reference & Approval)", () => {
    test("CUR-01.PROP.1: Teacher proposal accepts curriculumReference and normalizes level: 'BASIC'", async () => {
      const mockCategory = {
        _id: new mongoose.Types.ObjectId(),
        name: "Trung học cơ sở",
        slug: "trung-hoc-co-so",
        status: "ACTIVE",
      };
      const mockSubject = {
        _id: new mongoose.Types.ObjectId(),
        categoryId: mockCategory._id,
        name: "Ngữ văn",
        status: "ACTIVE",
      };

      const courseCatalog = require("../src/services/courseCatalogService");
      jest.spyOn(courseCatalog, "getCategoryOrThrow").mockResolvedValue(mockCategory);
      jest.spyOn(courseCatalog, "getSubjectOrThrow").mockResolvedValue(mockSubject);

      const User = require("../src/models/User");
      const teacherId = new mongoose.Types.ObjectId();
      jest.spyOn(User, "findById").mockResolvedValue({
        _id: teacherId,
        role: "TEACHER",
        status: "ACTIVE",
        isDeleted: false,
        teacherProfile: { verificationStatus: "VERIFIED" },
      });
      jest.spyOn(User, "find").mockImplementation(() => ({
        select: () => ({
          lean: async () => [],
        }),
      }));

      const notificationService = require("../src/services/notificationService");
      jest.spyOn(notificationService, "notifyAdmins").mockResolvedValue(true);

      let createdProposal = null;
      jest.spyOn(CourseProposal, "create").mockImplementationOnce(async (data) => {
        createdProposal = { ...data, _id: new mongoose.Types.ObjectId(), toObject: () => data };
        return createdProposal;
      });

      await courseProposalService.createProposal(teacherId, {
        categoryId: mockCategory._id,
        subjectId: mockSubject._id,
        title: "Ngữ văn 8 - Chân Trời Sáng Tạo",
        description: "Khóa học ngữ văn theo bộ Chân Trời Sáng Tạo",
        level: "BASIC", // Legacy level to normalize
        gradeLevel: "GRADE_8",
        curriculumReference: "Chân Trời Sáng Tạo",
      });

      expect(createdProposal.curriculumReference).toBe("Chân Trời Sáng Tạo");
      expect(createdProposal.level).toBe("BEGINNER"); // Normalized!
      expect(createdProposal.gradeLevel).toBe("GRADE_8");
    });

    test("CUR-01.PROP.2: approveProposal passes curriculumReference to insertCourse in catalog", async () => {
      const mockCategory = {
        _id: new mongoose.Types.ObjectId(),
        name: "Trung học cơ sở",
        status: "ACTIVE",
      };
      const mockSubject = {
        _id: new mongoose.Types.ObjectId(),
        categoryId: mockCategory._id,
        name: "Toán học",
        status: "ACTIVE",
      };

      const proposalDoc = {
        _id: new mongoose.Types.ObjectId(),
        teacherId: new mongoose.Types.ObjectId(),
        categoryId: mockCategory._id,
        subjectId: mockSubject._id,
        title: "Toán 7 - Cánh Diều",
        description: "Mô tả",
        level: "BEGINNER",
        gradeLevel: "GRADE_7",
        curriculumReference: "Cánh Diều",
        status: "PENDING_REVIEW",
        toObject: function () {
          return { ...this };
        },
      };

      jest.spyOn(CourseProposal, "findById").mockResolvedValue(proposalDoc);
      jest.spyOn(CourseProposal, "findOne").mockResolvedValue(proposalDoc);

      jest.spyOn(Category, "find").mockImplementation(() => ({ select: () => ({ lean: async () => [] }) }));
      jest.spyOn(Subject, "find").mockImplementation(() => ({ select: () => ({ lean: async () => [] }) }));
      jest.spyOn(User, "find").mockImplementation(() => ({ select: () => ({ lean: async () => [] }) }));

      const courseCatalog = require("../src/services/courseCatalogService");
      jest.spyOn(courseCatalog, "getCategoryOrThrow").mockResolvedValue(mockCategory);
      jest.spyOn(courseCatalog, "getSubjectOrThrow").mockResolvedValue(mockSubject);

      let capturedInsertData = null;
      jest.spyOn(courseCatalog, "insertCourse").mockImplementationOnce(async (args) => {
        capturedInsertData = args.data;
        return {
          _id: new mongoose.Types.ObjectId(),
          ...args.data,
          toObject: function () {
            return { ...this };
          },
        };
      });

      // Mock transaction session
      jest.spyOn(mongoose, "startSession").mockResolvedValue({
        withTransaction: async (cb) => cb(),
        endSession: jest.fn(),
      });
      jest.spyOn(CourseProposal, "updateOne").mockResolvedValue({ modifiedCount: 1 });

      const AuditLog = require("../src/models/AuditLog");
      jest.spyOn(AuditLog, "create").mockResolvedValue([{}]);

      const Notification = require("../src/models/Notification");
      jest.spyOn(Notification, "create").mockResolvedValue({});

      const adminId = new mongoose.Types.ObjectId();
      await courseProposalService.approveProposal(adminId, proposalDoc._id, {
        curriculumReference: "Cánh Diều (Bộ chuẩn)", // Admin confirms/overrides
      });

      expect(capturedInsertData.curriculumReference).toBe("Cánh Diều (Bộ chuẩn)");
      expect(capturedInsertData.gradeLevel).toBe("GRADE_7");
    });
  });

  // =========================================================================
  // 6. Category -> Subject -> Course Hierarchy Invariants
  // =========================================================================
  describe("6. Category -> Subject -> Course Hierarchy Invariants", () => {
    test("CUR-01.HIER.1: Subject and Course schemas retain references to Category and Subject", () => {
      // Subject -> Category
      expect(Subject.schema.paths.categoryId).toBeDefined();
      expect(Subject.schema.paths.categoryName).toBeDefined();

      // Course -> Subject & Category
      expect(Course.schema.paths.subjectId).toBeDefined();
      expect(Course.schema.paths.subjectName).toBeDefined();
      expect(Course.schema.paths.categoryId).toBeDefined();
      expect(Course.schema.paths.categoryName).toBeDefined();
    });
  });
});

