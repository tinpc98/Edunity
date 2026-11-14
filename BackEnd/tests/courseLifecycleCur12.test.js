const { EventEmitter } = require("events");
const mongoose = require("mongoose");
const app = require("../src/app");
const User = require("../src/models/User");
const Course = require("../src/models/Course");
const Category = require("../src/models/Category");
const Subject = require("../src/models/Subject");
const Class = require("../src/models/Class");
const Enrollment = require("../src/models/Enrollment");
const ScholarshipCampaign = require("../src/models/ScholarshipCampaign");
const LearningPath = require("../src/models/LearningPath");
const CoursePricingPolicy = require("../src/models/CoursePricingPolicy");
const SessionRefundReview = require("../src/models/SessionRefundReview");
const SyllabusVersion = require("../src/models/SyllabusVersion");
const CurriculumUnit = require("../src/models/CurriculumUnit");
const AuditLog = require("../src/models/AuditLog");
const {
  adminListCourses,
  adminGetCourse,
  getCourse,
  searchCourses,
  updateCourse,
  deleteCourse,
} = require("../src/services/courseCatalogService");
const { getClassSyllabus } = require("../src/services/syllabusService");

// Helper: invokes real Express app in-memory without TCP socket
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

describe("TASK CHAU-COURSE-LIFECYCLE: CUR-04, CUR-12 & Course Safe Delete Suite", () => {
  const adminId = new mongoose.Types.ObjectId().toString();
  const teacherId = new mongoose.Types.ObjectId().toString();
  const studentId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.spyOn(mongoose, "startSession").mockResolvedValue({
      withTransaction: async (fn) => fn(),
      endSession: jest.fn(),
    });

    jest.spyOn(Course, "findOneAndUpdate").mockImplementation((filter) => Course.findOne(filter));

    jest.spyOn(User, "findById").mockImplementation((id) => ({
      lean: async () => {
        const idStr = id ? id.toString() : "";
        if (idStr === adminId) return { _id: id, role: "ADMIN", status: "ACTIVE", isDeleted: false };
        if (idStr === teacherId) return { _id: id, role: "TEACHER", status: "ACTIVE", isDeleted: false };
        return { _id: id, role: "STUDENT", status: "ACTIVE", isDeleted: false };
      },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // TASK 1: CUR-04 Admin Course Management
  // =========================================================================
  describe("Task 1: CUR-04 Admin Course Management", () => {
    test("CUR-04.1: adminListCourses returns both ACTIVE and INACTIVE courses when no status filter is passed", async () => {
      let capturedFilter = null;
      jest.spyOn(Course, "find").mockImplementationOnce((filter) => {
        capturedFilter = filter;
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [
                  { _id: new mongoose.Types.ObjectId(), title: "Course Active", status: "ACTIVE" },
                  { _id: new mongoose.Types.ObjectId(), title: "Course Inactive", status: "INACTIVE" },
                ],
              }),
            }),
          }),
        };
      });
      jest.spyOn(Course, "countDocuments").mockResolvedValueOnce(2);

      const result = await adminListCourses({}, { skip: 0, pageSize: 20, page: 1 });

      expect(capturedFilter.status).toBeUndefined(); // No status constraint, returns all
      expect(capturedFilter.isDeleted).toEqual({ $ne: true });
      expect(result.items).toHaveLength(2);
      expect(result.items.some((c) => c.status === "ACTIVE")).toBe(true);
      expect(result.items.some((c) => c.status === "INACTIVE")).toBe(true);
    });

    test("CUR-04.2: adminListCourses filters strictly by status (INACTIVE / ACTIVE)", async () => {
      let capturedFilterInactive = null;
      jest.spyOn(Course, "find").mockImplementationOnce((filter) => {
        capturedFilterInactive = filter;
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [{ _id: new mongoose.Types.ObjectId(), title: "Inactive Course", status: "INACTIVE" }],
              }),
            }),
          }),
        };
      });
      jest.spyOn(Course, "countDocuments").mockResolvedValueOnce(1);

      const resultInactive = await adminListCourses({ status: "INACTIVE" }, { skip: 0, pageSize: 20, page: 1 });
      expect(capturedFilterInactive.status).toBe("INACTIVE");
      expect(resultInactive.items[0].status).toBe("INACTIVE");
    });

    test("CUR-04.3: adminListCourses searches across title, slug, description, curriculumReference", async () => {
      let capturedFilter = null;
      jest.spyOn(Course, "find").mockImplementationOnce((filter) => {
        capturedFilter = filter;
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [{ _id: new mongoose.Types.ObjectId(), title: "Toán 10 Chân Trời" }],
              }),
            }),
          }),
        };
      });
      jest.spyOn(Course, "countDocuments").mockResolvedValueOnce(1);

      await adminListCourses({ search: "Chân Trời" }, { skip: 0, pageSize: 20, page: 1 });
      expect(capturedFilter.$or).toBeDefined();
      expect(capturedFilter.$or).toHaveLength(4);
      expect(capturedFilter.$or[0].title.$regex).toBe("Chân Trời");
      expect(capturedFilter.$or[1].slug.$regex).toBe("Chân Trời");
    });

    test("CUR-04.4: adminListCourses filters by categoryId, subjectId, and applies stable sort", async () => {
      const catId = new mongoose.Types.ObjectId();
      const subId = new mongoose.Types.ObjectId();
      let capturedFilter = null;
      let capturedSort = null;

      jest.spyOn(Course, "find").mockImplementationOnce((filter) => {
        capturedFilter = filter;
        return {
          sort: (s) => {
            capturedSort = s;
            return {
              skip: () => ({
                limit: () => ({
                  lean: async () => [],
                }),
              }),
            };
          },
        };
      });
      jest.spyOn(Course, "countDocuments").mockResolvedValueOnce(0);

      await adminListCourses(
        { categoryId: catId.toString(), subjectId: subId.toString(), sortBy: "title", sortOrder: "asc" },
        { skip: 0, pageSize: 10, page: 1 }
      );

      expect(capturedFilter.categoryId).toBe(catId.toString());
      expect(capturedFilter.subjectId).toBe(subId.toString());
      expect(capturedSort).toEqual({ title: 1, _id: 1 });
    });

    test("CUR-04.5: adminGetCourse returns course detail even when status is INACTIVE", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Khóa Luyện Thi (Tạm Dừng)",
        status: "INACTIVE",
        isDeleted: false,
        toObject() {
          return { ...this };
        },
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(0).mockResolvedValueOnce(2);

      const result = await adminGetCourse(courseId.toString());
      expect(result._id).toBe(courseId);
      expect(result.status).toBe("INACTIVE");
      expect(result.totalClassCount).toBe(2);
      expect(result.openClassCount).toBe(0);
    });

    test("CUR-04.6: Public getCourse on an INACTIVE course throws 404 COURSE_NOT_FOUND", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Khóa Tạm Ẩn",
        status: "INACTIVE",
        isDeleted: false,
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);

      await expect(getCourse(courseId.toString())).rejects.toThrow("Course not found");
    });

    test("CUR-04.7: Public searchCourses strictly limits results to ACTIVE status", async () => {
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

      await searchCourses({}, { skip: 0, pageSize: 20, page: 1 });
      expect(capturedFilter.status).toBe("ACTIVE");
    });

    test("CUR-04.8: updateCourse reactivates INACTIVE course to ACTIVE when Subject is active", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const subId = new mongoose.Types.ObjectId();
      const catId = new mongoose.Types.ObjectId();

      const mockCourse = {
        _id: courseId,
        subjectId: subId,
        categoryId: catId,
        title: "Lý 11 Nâng Cao",
        status: "INACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
        toObject() {
          return { ...this };
        },
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Category, "findOne").mockResolvedValueOnce({ _id: catId, name: "THPT" });
      jest.spyOn(Subject, "findOne").mockResolvedValueOnce({ _id: subId, name: "Vật lý", status: "ACTIVE" });
      jest.spyOn(Class, "updateMany").mockResolvedValue({ acknowledged: true });
      jest.spyOn(AuditLog, "create").mockResolvedValue([]);

      const updated = await updateCourse(adminId, courseId.toString(), { status: "ACTIVE" });
      expect(updated.status).toBe("ACTIVE");
      expect(mockCourse.save).toHaveBeenCalled();
    });

    test("CUR-04.9: updateCourse reactivation fails if Subject is inactive", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const subId = new mongoose.Types.ObjectId();
      const catId = new mongoose.Types.ObjectId();

      const mockCourse = {
        _id: courseId,
        subjectId: subId,
        categoryId: catId,
        title: "Hóa 10 Chuyên",
        status: "INACTIVE",
        isDeleted: false,
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Category, "findOne").mockResolvedValueOnce({ _id: catId, name: "THPT" });
      jest.spyOn(Subject, "findOne").mockResolvedValueOnce({ _id: subId, name: "Hóa học", status: "INACTIVE" });

      await expect(
        updateCourse(adminId, courseId.toString(), { status: "ACTIVE" })
      ).rejects.toThrow("Cannot activate course under an inactive subject");
    });

    test("CUR-04.10: HTTP GET /api/admin/courses returns 403 for non-admin roles", async () => {
      const res = await invokeApp({
        method: "GET",
        url: "/api/admin/courses",
        headers: { "x-user-id": studentId, "x-user-role": "STUDENT" },
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("FORBIDDEN");
    });

    test("CUR-04.11: HTTP GET /api/admin/courses/:id returns 200 for Admin even on INACTIVE course", async () => {
      const courseId = new mongoose.Types.ObjectId();
      jest.spyOn(Course, "findOne").mockResolvedValueOnce({
        _id: courseId,
        title: "Admin Inactive Course",
        status: "INACTIVE",
        isDeleted: false,
        toObject() {
          return { ...this };
        },
      });
      jest.spyOn(Class, "countDocuments").mockResolvedValue(0);

      const res = await invokeApp({
        method: "GET",
        url: `/api/admin/courses/${courseId}`,
        headers: { "x-user-id": adminId, "x-user-role": "ADMIN" },
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("INACTIVE");
    });
  });

  // =========================================================================
  // TASK 2: CUR-12 Syllabus Snapshot for Class
  // =========================================================================
  describe("Task 2: CUR-12 Syllabus Snapshot for Class", () => {
    test("CUR-12.1 (Mandatory 1): Class uses Syllabus V1. Course published V2 later. API Class STILL returns V1", async () => {
      const classId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const v1Id = new mongoose.Types.ObjectId();
      const v2Id = new mongoose.Types.ObjectId();

      const mockClass = {
        _id: classId,
        className: "Lớp Toán 10 V1",
        courseId,
        courseTitle: "Toán 10 Chuẩn",
        syllabusVersionId: v1Id, // Locked snapshot to V1
        syllabusVersionNumber: 1,
        status: "OPEN",
        teacherId: new mongoose.Types.ObjectId(),
      };

      const mockVersion1 = {
        _id: v1Id,
        courseId,
        versionNumber: 1,
        title: "Syllabus Toán 10 Phiên bản 1.0",
        summary: "Nội dung cũ V1",
        status: "ARCHIVED", // Even if archived when V2 arrived
        publishedAt: new Date("2026-01-01"),
      };

      const mockUnitsV1 = [
        {
          _id: new mongoose.Types.ObjectId(),
          syllabusVersionId: v1Id,
          unitOrder: 1,
          title: "Chương 1: Mệnh đề toán học (V1)",
          durationMinutes: 45,
          topics: ["Mệnh đề", "Tập hợp"],
        },
      ];

      jest.spyOn(Class, "findOne").mockReturnValueOnce({
        lean: async () => mockClass,
      });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({
        lean: async () => mockVersion1,
      });
      jest.spyOn(CurriculumUnit, "find").mockReturnValueOnce({
        sort: () => ({
          lean: async () => mockUnitsV1,
        }),
      });

      const res = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.syllabusVersionId).toBe(v1Id.toString());
      expect(res.body.data.versionNumber).toBe(1);
      expect(res.body.data.title).toBe("Syllabus Toán 10 Phiên bản 1.0");
      expect(res.body.data.units).toHaveLength(1);
      expect(res.body.data.units[0].title).toBe("Chương 1: Mệnh đề toán học (V1)");
    });

    test("CUR-12.2 (Mandatory 2): Course is INACTIVE but older Class still reads valid syllabus", async () => {
      const classId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const v1Id = new mongoose.Types.ObjectId();

      const mockClass = {
        _id: classId,
        className: "Lớp Sử 12 (Khóa học đã đóng)",
        courseId,
        courseTitle: "Lịch Sử 12",
        syllabusVersionId: v1Id,
        syllabusVersionNumber: 1,
        status: "IN_PROGRESS",
        teacherId: new mongoose.Types.ObjectId(),
      };

      const mockVersion = {
        _id: v1Id,
        courseId,
        versionNumber: 1,
        title: "Syllabus Lịch Sử 12",
        status: "PUBLISHED",
        publishedAt: new Date("2026-02-01"),
      };

      const mockUnits = [
        {
          _id: new mongoose.Types.ObjectId(),
          syllabusVersionId: v1Id,
          unitOrder: 1,
          title: "Bài 1: Thế giới sau Chiến tranh thế giới thứ hai",
          durationMinutes: 90,
          topics: ["Hội nghị Ianta"],
        },
      ];

      jest.spyOn(Class, "findOne").mockReturnValueOnce({
        lean: async () => mockClass,
      });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({
        lean: async () => mockVersion,
      });
      jest.spyOn(CurriculumUnit, "find").mockReturnValueOnce({
        sort: () => ({
          lean: async () => mockUnits,
        }),
      });

      const syllabus = await getClassSyllabus(classId.toString());
      expect(syllabus.versionNumber).toBe(1);
      expect(syllabus.units).toHaveLength(1);
      expect(syllabus.units[0].title).toContain("Bài 1");
    });

    test("CUR-12.3 (Mandatory 3): Class without syllabusVersionId returns structured error, does NOT fallback to V2 or latest", async () => {
      const classId = new mongoose.Types.ObjectId();

      const mockClassNoSnapshot = {
        _id: classId,
        className: "Lớp cũ chưa có syllabus snapshot",
        courseId: new mongoose.Types.ObjectId(),
        courseTitle: "Văn 10",
        syllabusVersionId: null, // Missing snapshot!
        status: "OPEN",
        teacherId: new mongoose.Types.ObjectId(),
      };

      jest.spyOn(Class, "findOne").mockReturnValueOnce({
        lean: async () => mockClassNoSnapshot,
      });

      const res = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("CLASS_SYLLABUS_SNAPSHOT_NOT_FOUND");
      expect(res.body.message).toContain("Class does not have a linked syllabus version snapshot");
    });

    test("CUR-12.4 (Mandatory 4): Role-based access for non-public class syllabus (DRAFT)", async () => {
      const classId = new mongoose.Types.ObjectId();
      const teacherOwnerId = new mongoose.Types.ObjectId();
      const v1Id = new mongoose.Types.ObjectId();

      const mockDraftClass = {
        _id: classId,
        className: "Lớp Draft",
        courseId: new mongoose.Types.ObjectId(),
        courseTitle: "Lý 10",
        syllabusVersionId: v1Id,
        status: "DRAFT",
        teacherId: teacherOwnerId,
      };

      // 1. Unauthenticated -> 401
      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockDraftClass });
      const resUnauth = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
      });
      expect(resUnauth.status).toBe(401);
      expect(resUnauth.body.error).toBe("UNAUTHORIZED");

      // 2. Random student -> 403
      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockDraftClass });
      jest.spyOn(Enrollment, "exists").mockResolvedValueOnce(false);
      const resStudent = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
        headers: { "x-user-id": studentId, "x-user-role": "STUDENT" },
      });
      expect(resStudent.status).toBe(403);
      expect(resStudent.body.error).toBe("FORBIDDEN");

      // 3. Teacher Owner -> 200
      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockDraftClass });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({
        lean: async () => ({ _id: v1Id, courseId: mockDraftClass.courseId, versionNumber: 1, title: "V1", status: "DRAFT" }),
      });
      jest.spyOn(CurriculumUnit, "find").mockReturnValueOnce({
        sort: () => ({ lean: async () => [] }),
      });
      const resOwner = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
        headers: { "x-user-id": teacherOwnerId.toString(), "x-user-role": "TEACHER" },
      });
      expect(resOwner.status).toBe(200);

      // 4. Admin -> 200
      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockDraftClass });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({
        lean: async () => ({ _id: v1Id, courseId: mockDraftClass.courseId, versionNumber: 1, title: "V1", status: "DRAFT" }),
      });
      jest.spyOn(CurriculumUnit, "find").mockReturnValueOnce({
        sort: () => ({ lean: async () => [] }),
      });
      const resAdmin = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
        headers: { "x-user-id": adminId, "x-user-role": "ADMIN" },
      });
      expect(resAdmin.status).toBe(200);
    });

    test("CUR-12.5 (Snapshot Integrity): rejects with 409 SYLLABUS_VERSION_COURSE_MISMATCH when syllabusVersion belongs to different course", async () => {
      const classId = new mongoose.Types.ObjectId();
      const courseA = new mongoose.Types.ObjectId();
      const courseB = new mongoose.Types.ObjectId();
      const vId = new mongoose.Types.ObjectId();

      const mockClass = {
        _id: classId,
        className: "Lớp Toán 10",
        courseId: courseA,
        courseTitle: "Toán 10",
        syllabusVersionId: vId,
        status: "OPEN",
        teacherId: new mongoose.Types.ObjectId(),
      };

      const mockVersionOfCourseB = {
        _id: vId,
        courseId: courseB, // Different course!
        versionNumber: 1,
        title: "Syllabus của môn khác",
        status: "PUBLISHED",
      };

      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockClass });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({ lean: async () => mockVersionOfCourseB });

      const res = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SYLLABUS_VERSION_COURSE_MISMATCH");
      expect(res.body.message).toContain("does not belong to the class course");
    });

    test("CUR-12.6 (Snapshot Integrity): rejects with 409 SYLLABUS_VERSION_NUMBER_MISMATCH when versionNumber does not match class snapshot", async () => {
      const classId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const vId = new mongoose.Types.ObjectId();

      const mockClass = {
        _id: classId,
        className: "Lớp Lý 11",
        courseId: courseId,
        courseTitle: "Lý 11",
        syllabusVersionId: vId,
        syllabusVersionNumber: 2, // Class snapshotted version 2
        status: "OPEN",
        teacherId: new mongoose.Types.ObjectId(),
      };

      const mockVersion = {
        _id: vId,
        courseId: courseId,
        versionNumber: 3, // Database version record has version 3
        title: "Lý 11 V3",
        status: "PUBLISHED",
      };

      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockClass });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({ lean: async () => mockVersion });

      const res = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SYLLABUS_VERSION_NUMBER_MISMATCH");
      expect(res.body.message).toContain("expected 2, found 3");
    });

    test("CUR-12.7 (Safe teacherId handling): null/undefined teacherId does not crash with TypeError", async () => {
      const classId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const vId = new mongoose.Types.ObjectId();

      // Case A: OPEN class without assigned teacher returns 200 without TypeError
      const mockOpenClassNoTeacher = {
        _id: classId,
        className: "Lớp Hóa Chưa Có GV",
        courseId: courseId,
        courseTitle: "Hóa 10",
        syllabusVersionId: vId,
        syllabusVersionNumber: 1,
        status: "OPEN",
        teacherId: null, // null teacher!
      };

      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockOpenClassNoTeacher });
      jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({
        lean: async () => ({ _id: vId, courseId: courseId, versionNumber: 1, title: "Hóa 10", status: "PUBLISHED" }),
      });
      jest.spyOn(CurriculumUnit, "find").mockReturnValueOnce({ sort: () => ({ lean: async () => [] }) });

      const resOpen = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
      });
      expect(resOpen.status).toBe(200);

      // Case B: DRAFT class without assigned teacher rejects 401 for guest and 403 for student without TypeError
      const mockDraftClassNoTeacher = {
        ...mockOpenClassNoTeacher,
        status: "DRAFT",
      };

      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockDraftClassNoTeacher });
      const resGuestDraft = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
      });
      expect(resGuestDraft.status).toBe(401);

      jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockDraftClassNoTeacher });
      const resStudentDraft = await invokeApp({
        method: "GET",
        url: `/api/classes/${classId}/syllabus`,
        headers: { "x-user-id": studentId, "x-user-role": "STUDENT" },
      });
      expect(resStudentDraft.status).toBe(403);
    });

    test("CUR-12.8 (Unified RBAC): PENDING_APPROVAL and REJECTED classes are strictly accessible only by Teacher Owner and Admin", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const teacherOwnerId = new mongoose.Types.ObjectId();
      const otherTeacherId = new mongoose.Types.ObjectId();
      const vId = new mongoose.Types.ObjectId();

      for (const restrictedStatus of ["PENDING_APPROVAL", "REJECTED"]) {
        const classId = new mongoose.Types.ObjectId();
        const mockClass = {
          _id: classId,
          className: `Lớp ${restrictedStatus}`,
          courseId,
          courseTitle: "Môn học",
          syllabusVersionId: vId,
          status: restrictedStatus,
          teacherId: teacherOwnerId,
        };

        // 1. Guest -> 401
        jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockClass });
        const resGuest = await invokeApp({
          method: "GET",
          url: `/api/classes/${classId}/syllabus`,
        });
        expect(resGuest.status).toBe(401);

        // 2. Student -> 403
        jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockClass });
        const resStudent = await invokeApp({
          method: "GET",
          url: `/api/classes/${classId}/syllabus`,
          headers: { "x-user-id": studentId, "x-user-role": "STUDENT" },
        });
        expect(resStudent.status).toBe(403);

        // 3. Other Teacher -> 403
        jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockClass });
        const resOtherTeacher = await invokeApp({
          method: "GET",
          url: `/api/classes/${classId}/syllabus`,
          headers: { "x-user-id": otherTeacherId.toString(), "x-user-role": "TEACHER" },
        });
        expect(resOtherTeacher.status).toBe(403);

        // 4. Teacher Owner -> 200
        jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockClass });
        jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({
          lean: async () => ({ _id: vId, courseId, versionNumber: 1, title: "V1", status: "DRAFT" }),
        });
        jest.spyOn(CurriculumUnit, "find").mockReturnValueOnce({ sort: () => ({ lean: async () => [] }) });
        const resOwner = await invokeApp({
          method: "GET",
          url: `/api/classes/${classId}/syllabus`,
          headers: { "x-user-id": teacherOwnerId.toString(), "x-user-role": "TEACHER" },
        });
        expect(resOwner.status).toBe(200);

        // 5. Admin -> 200
        jest.spyOn(Class, "findOne").mockReturnValueOnce({ lean: async () => mockClass });
        jest.spyOn(SyllabusVersion, "findOne").mockReturnValueOnce({
          lean: async () => ({ _id: vId, courseId, versionNumber: 1, title: "V1", status: "DRAFT" }),
        });
        jest.spyOn(CurriculumUnit, "find").mockReturnValueOnce({ sort: () => ({ lean: async () => [] }) });
        const resAdmin = await invokeApp({
          method: "GET",
          url: `/api/classes/${classId}/syllabus`,
          headers: { "x-user-id": adminId, "x-user-role": "ADMIN" },
        });
        expect(resAdmin.status).toBe(200);
      }
    });
  });

  // =========================================================================
  // TASK 3: Course Safe Delete
  // =========================================================================
  describe("Task 3: Course Safe Delete", () => {
    test("SAFE-DEL.1: Course with NO dependencies is soft-deleted successfully", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Khóa học thử nghiệm",
        status: "ACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(Enrollment, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(SessionRefundReview, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(ScholarshipCampaign, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(LearningPath, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(CoursePricingPolicy, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(SyllabusVersion, "updateMany").mockResolvedValue({ acknowledged: true });
      jest.spyOn(CurriculumUnit, "updateMany").mockResolvedValue({ acknowledged: true });
      jest.spyOn(AuditLog, "create").mockResolvedValue([]);

      const result = await deleteCourse(adminId, courseId.toString());

      expect(result.success).toBe(true);
      expect(result.message).toContain("Course soft-deleted successfully");
      expect(mockCourse.isDeleted).toBe(true);
      expect(mockCourse.status).toBe("INACTIVE");
      expect(mockCourse.deletedBy).toBe(adminId);
      expect(mockCourse.save).toHaveBeenCalled();
    });

    test("SAFE-DEL.2: Course with existing Class is REJECTED with 409 COURSE_HAS_CLASSES and recommendedAction SET_INACTIVE", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Toán 9 Ôn Thi Vào 10",
        status: "ACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(3); // 3 classes exist!

      await expect(deleteCourse(adminId, courseId.toString())).rejects.toMatchObject({
        statusCode: 409,
        code: "COURSE_HAS_CLASSES",
        details: { classCount: 3, recommendedAction: "SET_INACTIVE" },
      });
      expect(mockCourse.isDeleted).toBe(false);
      expect(mockCourse.status).toBe("ACTIVE"); // Restored back after dependency check failure
    });

    test("SAFE-DEL.3: Course with existing Enrollment is REJECTED with 409 COURSE_HAS_ENROLLMENTS", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Anh Văn Giao Tiếp",
        status: "ACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(Enrollment, "countDocuments").mockResolvedValueOnce(5); // 5 enrollments!

      await expect(deleteCourse(adminId, courseId.toString())).rejects.toMatchObject({
        statusCode: 409,
        code: "COURSE_HAS_ENROLLMENTS",
      });
      expect(mockCourse.isDeleted).toBe(false);
      expect(mockCourse.status).toBe("ACTIVE");
    });

    test("SAFE-DEL.3b: Course with SessionRefundReview records is REJECTED with 409 COURSE_HAS_REFUND_REVIEWS", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Toán 12 Luyện Đề",
        status: "ACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(Enrollment, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(SessionRefundReview, "countDocuments").mockResolvedValueOnce(2); // 2 refund reviews!

      await expect(deleteCourse(adminId, courseId.toString())).rejects.toMatchObject({
        statusCode: 409,
        code: "COURSE_HAS_REFUND_REVIEWS",
        details: { refundReviewCount: 2, recommendedAction: "SET_INACTIVE" },
      });
      expect(mockCourse.isDeleted).toBe(false);
      expect(mockCourse.status).toBe("ACTIVE");
    });

    test("SAFE-DEL.4: Course in ScholarshipCampaign is REJECTED with 409 COURSE_IN_SCHOLARSHIP_CAMPAIGN", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Toán Học Bổng",
        status: "ACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(Enrollment, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(SessionRefundReview, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(ScholarshipCampaign, "countDocuments").mockResolvedValueOnce(1);

      await expect(deleteCourse(adminId, courseId.toString())).rejects.toMatchObject({
        statusCode: 409,
        code: "COURSE_IN_SCHOLARSHIP_CAMPAIGN",
      });
      expect(mockCourse.isDeleted).toBe(false);
      expect(mockCourse.status).toBe("ACTIVE");
    });

    test("SAFE-DEL.5: Course in LearningPath is REJECTED with 409 COURSE_IN_LEARNING_PATH", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Nhập môn lập trình",
        status: "ACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(Enrollment, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(SessionRefundReview, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(ScholarshipCampaign, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(LearningPath, "countDocuments").mockResolvedValueOnce(2);

      await expect(deleteCourse(adminId, courseId.toString())).rejects.toMatchObject({
        statusCode: 409,
        code: "COURSE_IN_LEARNING_PATH",
      });
      expect(mockCourse.isDeleted).toBe(false);
      expect(mockCourse.status).toBe("ACTIVE");
    });

    test("SAFE-DEL.6: Course with active CoursePricingPolicy is REJECTED with 409 COURSE_HAS_ACTIVE_PRICING_POLICY", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Luyện Thi Chuyên",
        status: "ACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(Enrollment, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(SessionRefundReview, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(ScholarshipCampaign, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(LearningPath, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(CoursePricingPolicy, "countDocuments").mockResolvedValueOnce(1);

      await expect(deleteCourse(adminId, courseId.toString())).rejects.toMatchObject({
        statusCode: 409,
        code: "COURSE_HAS_ACTIVE_PRICING_POLICY",
      });
      expect(mockCourse.isDeleted).toBe(false);
      expect(mockCourse.status).toBe("ACTIVE");
    });

    test("SAFE-DEL.7: Soft-delete on already deleted course throws 404 COURSE_NOT_FOUND", async () => {
      const courseId = new mongoose.Types.ObjectId();
      jest.spyOn(Course, "findOne").mockResolvedValueOnce(null);

      await expect(deleteCourse(adminId, courseId.toString())).rejects.toThrow("Course not found");
    });

    test("SAFE-DEL.8: HTTP DELETE /api/admin/courses/:id returns 403 for non-admin user", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const res = await invokeApp({
        method: "DELETE",
        url: `/api/admin/courses/${courseId}`,
        headers: { "x-user-id": teacherId, "x-user-role": "TEACHER" },
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("FORBIDDEN");
    });

    test("SAFE-DEL.9: AuditLog failure is NOT silently swallowed and propagates error", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const mockCourse = {
        _id: courseId,
        title: "Khóa học audit fail",
        status: "ACTIVE",
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Course, "findOne").mockResolvedValueOnce(mockCourse);
      jest.spyOn(Class, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(Enrollment, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(SessionRefundReview, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(ScholarshipCampaign, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(LearningPath, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(CoursePricingPolicy, "countDocuments").mockResolvedValueOnce(0);
      jest.spyOn(SyllabusVersion, "updateMany").mockResolvedValue({ acknowledged: true });
      jest.spyOn(CurriculumUnit, "updateMany").mockResolvedValue({ acknowledged: true });
      jest.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("Audit DB write failure"));

      await expect(deleteCourse(adminId, courseId.toString())).rejects.toThrow("Audit DB write failure");
    });
  });
});

