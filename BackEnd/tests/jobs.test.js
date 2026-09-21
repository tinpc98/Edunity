const mongoose = require("mongoose");
const Class = require("../src/models/Class");
const Enrollment = require("../src/models/Enrollment");
const ScholarshipUsage = require("../src/models/ScholarshipUsage");
const Scholarship = require("../src/models/Scholarship");
const { expireEnrollmentTransaction } = require("../src/jobs/expireEnrollmentsJob");

// Mock mongoose models
jest.mock("../src/models/Class");
jest.mock("../src/models/Enrollment");
jest.mock("../src/models/ScholarshipUsage");
jest.mock("../src/models/Scholarship");

mongoose.startSession = jest.fn();

describe("Background Job: Expire Enrollments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Idempotency Test", () => {
    it("should process expiry and release scholarship, and skip if already processed", async () => {
      const classId = new mongoose.Types.ObjectId().toString();
      const enrollmentId = new mongoose.Types.ObjectId().toString();
      const scholarshipId = new mongoose.Types.ObjectId().toString();

      const mockSession = {
        withTransaction: jest.fn(async (cb) => {
          await cb();
        }),
        endSession: jest.fn(),
      };
      mongoose.startSession.mockResolvedValue(mockSession);

      // Mocks for first run (successfully finds and processes)
      const mockEnrollment = {
        _id: enrollmentId,
        classId: classId,
        enrollmentStatus: "PENDING_PAYMENT",
      };

      Enrollment.findOneAndUpdate.mockResolvedValueOnce(mockEnrollment);

      const saveMock = jest.fn();
      ScholarshipUsage.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([
          { scholarshipId, amount: 50, status: "PENDING", save: saveMock }
        ])
      });

      Class.updateOne.mockResolvedValue({ modifiedCount: 1 });
      Scholarship.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const res1 = await expireEnrollmentTransaction(enrollmentId);
      expect(res1).toBe(true);

      expect(Class.updateOne).toHaveBeenCalledWith(
        { _id: classId },
        { $inc: { enrolledCount: -1 } },
        expect.anything()
      );
      
      expect(saveMock).toHaveBeenCalled();
      expect(Scholarship.updateOne).toHaveBeenCalledWith(
        { _id: scholarshipId },
        { $inc: { remainingAmount: 50 } },
        expect.anything()
      );

      // Mocks for second run (already processed, should return gracefully without updates)
      Enrollment.findOneAndUpdate.mockResolvedValueOnce(null);
      Class.updateOne.mockClear(); // Reset the call count for assertions
      
      const res2 = await expireEnrollmentTransaction(enrollmentId);
      expect(res2).toBe(true);
      expect(Class.updateOne).not.toHaveBeenCalled(); // Should not decrement again
    });
  });

  describe("Race Condition Test (Job vs Webhook)", () => {
    it("should prevent job from modifying if webhook confirms it first", async () => {
      const classId = new mongoose.Types.ObjectId().toString();
      const enrollmentId = new mongoose.Types.ObjectId().toString();

      const mockSession = {
        withTransaction: jest.fn(async (cb) => {
          await cb();
        }),
        endSession: jest.fn(),
      };
      mongoose.startSession.mockResolvedValue(mockSession);

      // Simulate a concurrent webhook that already updated the status to CONFIRMED
      // The findOneAndUpdate with condition `enrollmentStatus: "PENDING_PAYMENT"` will return null
      Enrollment.findOneAndUpdate.mockResolvedValueOnce(null);

      const res = await expireEnrollmentTransaction(enrollmentId);
      expect(res).toBe(true); // Should return true to indicate no error occurred, it was just idempotent

      // Check that it did NOT decrement capacity
      expect(Class.updateOne).not.toHaveBeenCalled();
    });
  });
});
