const mongoose = require("mongoose");
const {
  handle,
  parsePaging,
  paged,
  assertId,
  validationError,
  parseDate,
  parseImageUrl,
} = require("../src/utils/http");
const {
  AppError,
  FORBIDDEN,
  VALIDATION_ERROR,
  CLASS_NOT_FOUND,
  ENROLLMENT_NOT_FOUND,
  PAYMENT_NOT_FOUND,
} = require("../src/utils/errors");
const { serializeDecimal128 } = require("../src/utils/serialize");
const requireRole = require("../src/middlewares/requireRole");

// Route modules
const catalogRoutes = require("../src/routes/catalogRoutes");
const courseCatalogRoutes = require("../src/routes/courseCatalogRoutes");
const teachingRoutes = require("../src/routes/teachingRoutes");
const studentRoutes = require("../src/routes/studentRoutes");
const accountRoutes = require("../src/routes/accountRoutes");
const scholarshipRoutes = require("../src/routes/scholarshipRoutes");

// Helper to inspect registered routes on an Express router
const extractRoutes = (router) => {
  const routes = [];
  for (const layer of router.stack) {
    if (layer.route) {
      const path = layer.route.path;
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path, methods });
    }
  }
  return routes;
};

describe("TASK G0-10: Academic API Contract Standardization (CUR / LMS / AID)", () => {
  // =========================================================================
  // 1. Core Envelope, Serialization & Pagination Contracts
  // =========================================================================
  describe("1. Core Envelope & Serialization Contract", () => {
    test("G0-10.ENV.1: handle() wraps returned data in { success: true, data }", async () => {
      const mockReq = {};
      const mockRes = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.payload = payload;
          return this;
        },
      };
      const mockNext = jest.fn();

      const controllerFn = handle(async () => ({ message: "Hello Edunity" }), 201);
      await controllerFn(mockReq, mockRes, mockNext);

      expect(mockRes.statusCode).toBe(201);
      expect(mockRes.payload).toEqual({
        success: true,
        data: { message: "Hello Edunity" },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("G0-10.ENV.2: handle() forwards thrown AppError to global error handler via next()", async () => {
      const mockReq = {};
      const mockRes = {};
      const mockNext = jest.fn();

      const controllerFn = handle(async () => {
        throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
      });
      await controllerFn(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const err = mockNext.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe("COURSE_NOT_FOUND");
      expect(err.statusCode).toBe(404);
    });

    test("G0-10.ENV.3: Decimal128 values are converted to string format across objects and arrays", () => {
      const input = {
        tuitionAmount: new mongoose.Types.Decimal128("500000"),
        contributions: [
          { amount: new mongoose.Types.Decimal128("1000000.50") },
          { amount: new mongoose.Types.Decimal128("0") },
        ],
        regularField: 42,
      };

      const serialized = serializeDecimal128(input);
      expect(serialized.tuitionAmount).toBe("500000");
      expect(serialized.contributions[0].amount).toBe("1000000.50");
      expect(serialized.contributions[1].amount).toBe("0");
      expect(serialized.regularField).toBe(42);
    });

    test("G0-10.ENV.4: parsePaging() handles defaults, limit alias, negative values and clamping", () => {
      // Default case
      const def = parsePaging({});
      expect(def).toEqual({ page: 1, pageSize: 20, skip: 0 });

      // Custom page and pageSize
      const custom = parsePaging({ page: "3", pageSize: "15" });
      expect(custom).toEqual({ page: 3, pageSize: 15, skip: 30 });

      // Support limit as alias
      const alias = parsePaging({ page: "2", limit: "25" });
      expect(alias).toEqual({ page: 2, pageSize: 25, skip: 25 });

      // Clamp upper limit to 100
      const clamped = parsePaging({ page: "1", pageSize: "500" });
      expect(clamped.pageSize).toBe(100);

      // Lower boundary protection
      const lower = parsePaging({ page: "-5", pageSize: "-10" });
      expect(lower.page).toBe(1);
      expect(lower.pageSize).toBe(1); // Math.max(-10, 1) = 1
    });

    test("G0-10.ENV.5: paged() returns standardized { items, total, page, pageSize, totalPages }", () => {
      const items = [{ id: 1 }, { id: 2 }];
      const total = 55;
      const paging = { page: 2, pageSize: 20 };

      const result = paged(items, total, paging);
      expect(result).toEqual({
        items,
        total: 55,
        page: 2,
        pageSize: 20,
        totalPages: 3,
      });
    });

    test("G0-10.ENV.6: assertId() throws 404 NOT_FOUND for invalid ObjectId", () => {
      expect(() => assertId("invalid-id", "Resource not found", "NOT_FOUND")).toThrow(AppError);
      try {
        assertId("not-a-mongo-id", "Category not found", "CATEGORY_NOT_FOUND");
      } catch (err) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe("CATEGORY_NOT_FOUND");
      }
    });

    test("G0-10.ENV.7: validationError() sets VALIDATION_ERROR code and details", () => {
      const err = validationError("Missing fields", { missing: ["title"] });
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details).toEqual({ missing: ["title"] });
    });

    test("G0-10.ENV.8: parseDate() validates date string and throws 400 on invalid format", () => {
      expect(parseDate(null, "fundingStart")).toBeNull();
      const valid = parseDate("2026-11-07T14:00:00.000Z", "startDate");
      expect(valid).toBeInstanceOf(Date);
      expect(valid.toISOString()).toBe("2026-11-07T14:00:00.000Z");

      expect(() => parseDate("not-a-date", "deadline")).toThrow(AppError);
    });

    test("G0-10.ENV.9: parseImageUrl() accepts only http(s) or /uploads/ paths", () => {
      expect(parseImageUrl(null, "coverImage")).toBeUndefined();
      expect(parseImageUrl("https://cdn.edunity.vn/img.png", "coverImage")).toBe("https://cdn.edunity.vn/img.png");
      expect(parseImageUrl("/uploads/avatar.jpg", "avatarUrl")).toBe("/uploads/avatar.jpg");

      expect(() => parseImageUrl("javascript:alert(1)", "avatarUrl")).toThrow(AppError);
      expect(() => parseImageUrl("data:text/html;base64,abc", "coverImage")).toThrow(AppError);
    });
  });

  // =========================================================================
  // 2. Global Error Code & RBAC Middleware Standards
  // =========================================================================
  describe("2. Error Codes & RBAC Middleware Enforcement", () => {
    test("G0-10.ERR.1: Standard error factory AppError properties match contract", () => {
      const err = new AppError("Invalid input", "VALIDATION_ERROR", 400);
      expect(err.message).toBe("Invalid input");
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.statusCode).toBe(400);

      const forbiddenErr = FORBIDDEN("Forbidden action");
      expect(forbiddenErr.statusCode).toBe(403);
      expect(forbiddenErr.code).toBe("FORBIDDEN");

      const notFoundErr = CLASS_NOT_FOUND("Lớp không tồn tại");
      expect(notFoundErr.statusCode).toBe(404);
      expect(notFoundErr.code).toBe("CLASS_NOT_FOUND");

      const enrollNotFound = ENROLLMENT_NOT_FOUND();
      expect(enrollNotFound.statusCode).toBe(404);
      expect(enrollNotFound.code).toBe("ENROLLMENT_NOT_FOUND");

      const payNotFound = PAYMENT_NOT_FOUND();
      expect(payNotFound.statusCode).toBe(404);
      expect(payNotFound.code).toBe("PAYMENT_NOT_FOUND");
    });

    test("G0-10.RBAC.1: requireRole() allows authorized role and calls next()", () => {
      const mw = requireRole("ADMIN");
      const req = { user: { role: "ADMIN" } };
      const res = {};
      const next = jest.fn();

      mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    test("G0-10.RBAC.2: requireRole() rejects unauthorized role with 403 FORBIDDEN", () => {
      const mw = requireRole("TEACHER");
      const req = { user: { role: "STUDENT" } };
      const res = {};
      const next = jest.fn();

      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("FORBIDDEN");
      expect(err.message).toBe("Only TEACHER can perform this action");
    });

    test("G0-10.RBAC.3: requireRole() supports multiple roles (STUDENT or TEACHER)", () => {
      const mw = requireRole("STUDENT", "TEACHER");
      const nextStudent = jest.fn();
      const nextTeacher = jest.fn();
      const nextSponsor = jest.fn();

      mw({ user: { role: "STUDENT" } }, {}, nextStudent);
      mw({ user: { role: "TEACHER" } }, {}, nextTeacher);
      mw({ user: { role: "SPONSOR" } }, {}, nextSponsor);

      expect(nextStudent).toHaveBeenCalledWith();
      expect(nextTeacher).toHaveBeenCalledWith();
      expect(nextSponsor).toHaveBeenCalledWith(expect.any(AppError));
      expect(nextSponsor.mock.calls[0][0].statusCode).toBe(403);
    });
  });

  // =========================================================================
  // 3. CUR (Curriculum & Catalog) Contract Verification
  // =========================================================================
  describe("3. CUR (Curriculum & Catalog) Contract Routes", () => {
    test("G0-10.CUR.1: catalogRoutes registers all legacy public catalog endpoints", () => {
      const routes = extractRoutes(catalogRoutes);
      const paths = routes.map((r) => r.path);

      expect(paths).toContain("/catalog/categories");
      expect(paths).toContain("/catalog/filters");
      expect(paths).toContain("/classes");
      expect(paths).toContain("/classes/:id");
      expect(paths).toContain("/classes/:id/sessions");
      expect(paths).toContain("/teachers");
      expect(paths).toContain("/teachers/:id");
    });

    test("G0-10.CUR.2: courseCatalogRoutes registers all V3 Category, Subject, Course & Proposal endpoints", () => {
      const routes = extractRoutes(courseCatalogRoutes);
      const routeMap = new Map(routes.map((r) => [`${r.methods.join(",")}:${r.path}`, true]));

      // Categories
      expect(routeMap.has("GET:/categories")).toBe(true);
      expect(routeMap.has("POST:/admin/categories")).toBe(true);
      expect(routeMap.has("PATCH:/admin/categories/:id")).toBe(true);

      // Subjects
      expect(routeMap.has("GET:/categories/:id/subjects")).toBe(true);
      expect(routeMap.has("GET:/subjects/:id")).toBe(true);
      expect(routeMap.has("POST:/admin/subjects")).toBe(true);
      expect(routeMap.has("PATCH:/admin/subjects/:id")).toBe(true);

      // Courses
      expect(routeMap.has("GET:/courses")).toBe(true);
      expect(routeMap.has("GET:/courses/:id")).toBe(true);
      expect(routeMap.has("GET:/courses/:id/classes")).toBe(true);
      expect(routeMap.has("POST:/admin/courses")).toBe(true);
      expect(routeMap.has("PATCH:/admin/courses/:id")).toBe(true);

      // Teacher Course Proposals
      expect(routeMap.has("POST:/teacher/course-proposals")).toBe(true);
      expect(routeMap.has("GET:/teacher/course-proposals")).toBe(true);
      expect(routeMap.has("PATCH:/teacher/course-proposals/:id")).toBe(true);

      // Admin Course Proposals
      expect(routeMap.has("GET:/admin/course-proposals")).toBe(true);
      expect(routeMap.has("GET:/admin/course-proposals/:id")).toBe(true);
      expect(routeMap.has("POST:/admin/course-proposals/:id/approve")).toBe(true);
      expect(routeMap.has("POST:/admin/course-proposals/:id/reject")).toBe(true);
      expect(routeMap.has("POST:/admin/course-proposals/:id/request-changes")).toBe(true);
    });
  });

  // =========================================================================
  // 4. LMS (Learning Management System & Classroom) Contract Verification
  // =========================================================================
  describe("4. LMS (Learning Management System) Contract Routes", () => {
    test("G0-10.LMS.1: studentRoutes explicitly blocks GET /sessions/:id/join with 405 (BUG-TIN03-01)", () => {
      const routes = extractRoutes(studentRoutes);
      const joinRoute = routes.find((r) => r.path === "/sessions/:id/join" && r.methods.includes("GET"));
      expect(joinRoute).toBeDefined();

      // Test handler directly
      const layer = studentRoutes.stack.find(
        (l) => l.route && l.route.path === "/sessions/:id/join" && l.route.methods.get
      );
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };

      // Handler is the last item in layer.route.stack
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      handler({}, res);

      expect(res.statusCode).toBe(405);
      expect(res.body).toEqual({
        success: false,
        error: "METHOD_NOT_ALLOWED",
        message: "GET method is not allowed for joining a session. Use POST /api/sessions/:id/join instead.",
      });
    });

    test("G0-10.LMS.2: teachingRoutes registers complete Classroom, Session, Incident & Reschedule endpoints", () => {
      const routes = extractRoutes(teachingRoutes);
      const routeMap = new Map(routes.map((r) => [`${r.methods.join(",")}:${r.path}`, true]));

      // Teacher Class
      expect(routeMap.has("GET:/teacher/classes")).toBe(true);
      expect(routeMap.has("POST:/teacher/classes")).toBe(true);
      expect(routeMap.has("GET:/teacher/classes/:id")).toBe(true);
      expect(routeMap.has("PATCH:/teacher/classes/:id")).toBe(true);
      expect(routeMap.has("POST:/teacher/classes/:id/submit")).toBe(true);
      expect(routeMap.has("GET:/teacher/classes/:id/students")).toBe(true);
      expect(routeMap.has("GET:/teacher/classes/:id/planned-sessions")).toBe(true);

      // Sessions & Classroom Join
      expect(routeMap.has("POST:/teacher/classes/:classId/sessions")).toBe(true);
      expect(routeMap.has("PATCH:/teacher/sessions/:id")).toBe(true);
      expect(routeMap.has("DELETE:/teacher/sessions/:id")).toBe(true);
      expect(routeMap.has("POST:/teacher/sessions/:id/start")).toBe(true);
      expect(routeMap.has("POST:/teacher/sessions/:id/end")).toBe(true);
      expect(routeMap.has("GET:/teacher/sessions/:id/attendance")).toBe(true);
      expect(routeMap.has("POST:/sessions/:id/join")).toBe(true);
      expect(routeMap.has("GET:/sessions/:id/live-status")).toBe(true);

      // Presence Telemetry
      expect(routeMap.has("POST:/sessions/:id/presence/connect")).toBe(true);
      expect(routeMap.has("POST:/sessions/:id/presence/heartbeat")).toBe(true);
      expect(routeMap.has("POST:/sessions/:id/presence/leave")).toBe(true);
      expect(routeMap.has("POST:/sessions/:id/presence/disconnect")).toBe(true);
      expect(routeMap.has("POST:/sessions/livekit-webhook")).toBe(true);

      // Incident Reports & Reschedule (TIN-05E)
      expect(routeMap.has("GET:/teacher/discipline-overview")).toBe(true);
      expect(routeMap.has("POST:/teacher/sessions/:id/incident-reports")).toBe(true);
      expect(routeMap.has("POST:/teacher/incident-reports/:id/appeal")).toBe(true);
      expect(routeMap.has("POST:/teacher/sessions/:id/reschedule-requests")).toBe(true);
      expect(routeMap.has("POST:/student/reschedule-requests/:id/respond")).toBe(true);

      // Admin Review
      expect(routeMap.has("GET:/admin/classes/pending")).toBe(true);
      expect(routeMap.has("GET:/admin/classes/:id")).toBe(true);
      expect(routeMap.has("POST:/admin/classes/:id/approve")).toBe(true);
      expect(routeMap.has("POST:/admin/classes/:id/reject")).toBe(true);
      expect(routeMap.has("GET:/admin/smart-classroom/overview")).toBe(true);
      expect(routeMap.has("POST:/admin/incident-reports/:id/review")).toBe(true);
      expect(routeMap.has("POST:/admin/teacher-violations/:id/review")).toBe(true);
      expect(routeMap.has("POST:/admin/discipline-cases/:id/review")).toBe(true);
      expect(routeMap.has("POST:/admin/reschedule-requests/:id/review")).toBe(true);
      expect(routeMap.has("POST:/admin/session-refund-reviews/:id/review")).toBe(true);
    });

    test("G0-10.LMS.3: accountRoutes registers Review endpoints with proper RBAC", () => {
      const routes = extractRoutes(accountRoutes);
      const routeMap = new Map(routes.map((r) => [`${r.methods.join(",")}:${r.path}`, true]));

      expect(routeMap.has("POST:/classes/:id/reviews")).toBe(true);
      expect(routeMap.has("GET:/classes/:id/reviews")).toBe(true);
      expect(routeMap.has("GET:/teachers/:id/reviews")).toBe(true);
    });
  });

  // =========================================================================
  // 5. AID (Financial Aid / Scholarship & Sponsor) Contract Verification
  // =========================================================================
  describe("5. AID (Scholarship & Sponsor) Contract Routes", () => {
    test("G0-10.AID.1: scholarshipRoutes registers all Campaign, Sponsor & Scholarship endpoints", () => {
      const routes = extractRoutes(scholarshipRoutes);
      const routeMap = new Map(routes.map((r) => [`${r.methods.join(",")}:${r.path}`, true]));

      // Campaign — Public
      expect(routeMap.has("GET:/campaigns")).toBe(true);
      expect(routeMap.has("GET:/campaigns/:id")).toBe(true);

      // Campaign — Admin
      expect(routeMap.has("GET:/admin/campaigns")).toBe(true);
      expect(routeMap.has("POST:/admin/campaigns")).toBe(true);
      expect(routeMap.has("GET:/admin/campaigns/:id")).toBe(true);
      expect(routeMap.has("PATCH:/admin/campaigns/:id")).toBe(true);
      expect(routeMap.has("POST:/admin/campaigns/:id/publish")).toBe(true);
      expect(routeMap.has("POST:/admin/campaigns/:id/close")).toBe(true);
      expect(routeMap.has("GET:/admin/campaigns/:id/contributions")).toBe(true);

      // Sponsor Contribution
      expect(routeMap.has("POST:/campaigns/:id/contributions")).toBe(true);
      expect(routeMap.has("GET:/sponsor/contributions")).toBe(true);
      expect(routeMap.has("GET:/sponsor/campaigns/:id/impact")).toBe(true);

      // Scholarship — Student
      expect(routeMap.has("POST:/campaigns/:id/applications")).toBe(true);
      expect(routeMap.has("GET:/me/scholarship-applications")).toBe(true);
      expect(routeMap.has("POST:/me/scholarship-applications/:id/resubmit")).toBe(true);
      expect(routeMap.has("GET:/me/scholarships")).toBe(true);
      expect(routeMap.has("POST:/enrollments/:id/scholarship-payment")).toBe(true);

      // Scholarship — Admin
      expect(routeMap.has("GET:/admin/scholarship-applications")).toBe(true);
      expect(routeMap.has("GET:/admin/scholarship-applications/:id")).toBe(true);
      expect(routeMap.has("POST:/admin/scholarship-applications/:id/approve")).toBe(true);
      expect(routeMap.has("POST:/admin/scholarship-applications/:id/reject")).toBe(true);
      expect(routeMap.has("POST:/admin/scholarship-applications/:id/request-information")).toBe(true);
    });
  });
});
