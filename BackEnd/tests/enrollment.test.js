const request = require("supertest");
const app = require("../src/app");
const Class = require("../src/models/Class");
const Enrollment = require("../src/models/Enrollment");
const mongoose = require("mongoose");

// Mock mongoose models
jest.mock("../src/models/Class");
jest.mock("../src/models/Enrollment");

// Mock mongoose startSession
mongoose.startSession = jest.fn();

describe("Enrollment API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/classes/:classId/enrollments", () => {
    it("should successfully enroll in a FREE class", async () => {
      const studentId = new mongoose.Types.ObjectId().toString();
      const classId = new mongoose.Types.ObjectId().toString();

      const mockSession = {
        withTransaction: jest.fn(async (cb) => {
          await cb();
        }),
        endSession: jest.fn(),
      };
      mongoose.startSession.mockResolvedValue(mockSession);

      const mockClass = {
        _id: classId,
        status: "OPEN",
        classType: "FREE",
        price: 0,
        capacity: 10,
        enrolledCount: 0,
      };

      Class.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockClass),
      });

      Class.findOneAndUpdate.mockResolvedValue({
        ...mockClass,
        enrolledCount: 1,
      });

      const saveMock = jest.fn().mockResolvedValue({
        enrollmentStatus: "CONFIRMED",
        paymentSource: "FREE",
        toObject: function() { return this; },
        tuitionAmount: { toString: () => "0" },
        amountPaidViaPayment: { toString: () => "0" },
        amountPaidViaScholarship: { toString: () => "0" },
      });
      Enrollment.mockImplementation(() => ({ save: saveMock }));

      const res = await request(app)
        .post(`/api/classes/${classId}/enrollments`)
        .set("x-user-id", studentId);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrollmentStatus).toBe("CONFIRMED");
      expect(res.body.data.paymentSource).toBe("FREE");
    });

    it("should successfully enroll in a PAID class and set PENDING_PAYMENT", async () => {
      const studentId = new mongoose.Types.ObjectId().toString();
      const classId = new mongoose.Types.ObjectId().toString();

      const mockSession = {
        withTransaction: jest.fn(async (cb) => {
          await cb();
        }),
        endSession: jest.fn(),
      };
      mongoose.startSession.mockResolvedValue(mockSession);

      const mockClass = {
        _id: classId,
        status: "OPEN",
        classType: "PAID",
        price: 100,
        capacity: 10,
        enrolledCount: 0,
      };

      Class.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockClass),
      });

      Class.findOneAndUpdate.mockResolvedValue({
        ...mockClass,
        enrolledCount: 1,
      });

      const saveMock = jest.fn().mockResolvedValue({
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        holdExpiresAt: new Date(),
        toObject: function() { return this; },
        tuitionAmount: { toString: () => "100" },
        amountPaidViaPayment: { toString: () => "0" },
        amountPaidViaScholarship: { toString: () => "0" },
      });
      Enrollment.mockImplementation(() => ({ save: saveMock }));

      const res = await request(app)
        .post(`/api/classes/${classId}/enrollments`)
        .set("x-user-id", studentId);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrollmentStatus).toBe("PENDING_PAYMENT");
      expect(res.body.data.holdExpiresAt).toBeDefined();
    });

    it("should fail if class is not OPEN", async () => {
      const studentId = new mongoose.Types.ObjectId().toString();
      const classId = new mongoose.Types.ObjectId().toString();

      const mockSession = {
        withTransaction: jest.fn(async (cb) => {
          await cb();
        }),
        endSession: jest.fn(),
      };
      mongoose.startSession.mockResolvedValue(mockSession);

      Class.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          status: "DRAFT", // Not OPEN
        }),
      });

      const res = await request(app)
        .post(`/api/classes/${classId}/enrollments`)
        .set("x-user-id", studentId);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("CLASS_NOT_OPEN");
    });

    it("should handle race conditions correctly by catching CLASS_FULL", async () => {
      const studentId = new mongoose.Types.ObjectId().toString();
      const classId = new mongoose.Types.ObjectId().toString();

      const mockSession = {
        withTransaction: jest.fn(async (cb) => {
          await cb();
        }),
        endSession: jest.fn(),
      };
      mongoose.startSession.mockResolvedValue(mockSession);

      Class.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          status: "OPEN",
          classType: "PAID",
          price: 100,
        }),
      });

      // Mock findOneAndUpdate returning null (meaning atomic condition failed)
      Class.findOneAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/classes/${classId}/enrollments`)
        .set("x-user-id", studentId);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("CLASS_FULL");
    });
  });
});
