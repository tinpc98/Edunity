const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const {
  Report,
  TeacherIncidentReport,
  SessionRefundReview,
  SessionRescheduleRequest,
  Payment,
  Payout,
} = require("../src/models");

describe("EDUNITY V3 — Admin Complaints & Incidents Localization V2", () => {
  let dbConnected = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
      dbConnected = true;
    }
  });

  afterAll(async () => {
    if (dbConnected && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it("1. Backend Report status and type enums remain intact", async () => {
    const reports = await Report.find({}).limit(10).lean();
    expect(Array.isArray(reports)).toBe(true);

    const validStatuses = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"];
    reports.forEach((r) => {
      expect(validStatuses).toContain(r.status);
    });
  });

  it("2. TeacherIncidentReport incidentType and requestedAction enums remain intact", async () => {
    const incidents = await TeacherIncidentReport.find({}).limit(10).lean();
    expect(Array.isArray(incidents)).toBe(true);

    const validTypes = [
      "DEVICE_FAILURE",
      "INTERNET_FAILURE",
      "POWER_OUTAGE",
      "HEALTH_ISSUE",
      "PERSONAL_EMERGENCY",
      "PLATFORM_FAILURE",
      "OTHER",
    ];
    const validActions = [
      "EXCUSE_LATE",
      "CANCEL_SESSION",
      "RESCHEDULE_SESSION",
      "EXCUSE_INTERRUPTION",
    ];

    incidents.forEach((inc) => {
      expect(validTypes).toContain(inc.incidentType);
      expect(validActions).toContain(inc.requestedAction);
    });
  });

  it("3. SessionRefundReview triggerReason and status enums remain intact", async () => {
    const reviews = await SessionRefundReview.find({}).limit(20).lean();
    expect(Array.isArray(reviews)).toBe(true);

    const validReasons = [
      "TEACHER_NO_SHOW",
      "UNEXCUSED_TEACHER_CANCELLATION",
      "INCIDENT_CANCELLED_NO_MAKEUP",
      "RESCHEDULE_DECLINED_BY_STUDENT",
      "TEACHER_LEFT_EARLY",
    ];
    const validStatuses = [
      "NEEDS_FINANCIAL_REVIEW",
      "RESCHEDULED_WAIVED",
      "APPROVED_FOR_PAYMENT_TEAM",
      "REJECTED",
    ];

    reviews.forEach((rev) => {
      expect(validReasons).toContain(rev.triggerReason);
      expect(validStatuses).toContain(rev.status);
    });
  });

  it("4. Financial safety invariants: Order 100000008, 100000009 and TEST payouts untouched", async () => {
    const payment8 = await Payment.findOne({ orderCode: 100000008 }).lean();
    if (payment8) {
      expect(payment8.paymentStatus).toBe("COMPLETED");
    }

    const payment9 = await Payment.findOne({ orderCode: 100000009 }).lean();
    if (payment9) {
      expect(payment9.paymentStatus).toBe("COMPLETED");
    }

    const testPayouts = await Payout.find({ isTestData: true }).lean();
    expect(testPayouts.length).toBeGreaterThanOrEqual(4);
    testPayouts.forEach((tp) => {
      expect(tp.isTestData).toBe(true);
    });
  });
});
