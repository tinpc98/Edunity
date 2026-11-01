const mongoose = require("mongoose");
const crypto = require("crypto");
const paymentController = require("../src/controllers/paymentController");
const paymentService = require("../src/services/paymentService");
const contributionService = require("../src/services/contributionService");
const scholarshipPaymentService = require("../src/services/scholarshipPaymentService");
const Payment = require("../src/models/Payment");
const SponsorContribution = require("../src/models/SponsorContribution");
const Enrollment = require("../src/models/Enrollment");
const { ScholarshipCampaign, Scholarship, Class, ScholarshipUsage, Transaction, TeacherEarning } = require("../src/models");
const campaignService = require("../src/services/campaignService");
const { AppError } = require("../src/utils/errors");

// Tắt cơ chế đệm lệnh của mongoose trong unit test để các truy vấn không bị treo
mongoose.set("bufferCommands", false);

const mockReq = (overrides = {}) => ({
  headers: {},
  body: {},
  params: {},
  user: { id: "507f1f77bcf86cd799439011", role: "STUDENT" },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((payload) => {
    res.body = payload;
    return res;
  });
  return res;
};

describe("PAY-01: Gateway Webhook Verification (Fail-Closed & timingSafeEqual)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("PAY-01.1: Fail-closed when PAYMENT_WEBHOOK_SECRET is not configured in env", async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const req = mockReq({
      headers: { "x-webhook-secret": "some-secret" },
      body: { gatewayReference: "GW-123", status: "SUCCESS" },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain("Webhook secret is not configured");
  });

  test("PAY-01.2: Fail-closed when x-webhook-secret header is missing", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "super-secret-key-123";
    const req = mockReq({
      headers: {},
      body: { gatewayReference: "GW-123", status: "SUCCESS" },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain("Invalid webhook signature");
  });

  test("PAY-01.3: Fail-closed when x-webhook-secret header is wrong", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "super-secret-key-123";
    const req = mockReq({
      headers: { "x-webhook-secret": "wrong-secret-key" },
      body: { gatewayReference: "GW-123", status: "SUCCESS" },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
  });

  test("PAY-01.4: Validation error when body lacks gatewayReference or status", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "super-secret-key-123";
    const req = mockReq({
      headers: { "x-webhook-secret": "super-secret-key-123" },
      body: { gatewayReference: "GW-123", status: "INVALID_STATUS" },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
  });

  test("PAY-01.5: Valid signature passes and calls service", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "super-secret-key-123";
    const spy = jest.spyOn(paymentService, "processWebhook").mockResolvedValueOnce({
      paymentStatus: "COMPLETED",
      result: "PAYMENT_SUCCESS",
    });
    const spyContrib = jest.spyOn(contributionService, "processWebhook").mockResolvedValueOnce(null);

    const req = mockReq({
      headers: { "x-webhook-secret": "super-secret-key-123" },
      body: { gatewayReference: "GW-123", status: "SUCCESS" },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.result).toBe("PAYMENT_SUCCESS");

    spy.mockRestore();
    spyContrib.mockRestore();
  });
});

describe("PAY-02: Sandbox Endpoint Protection (Danh sách môi trường cho phép & cờ tường minh)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("PAY-02.1: Chặn sandbox webhook trên production kể cả khi cờ ENABLE_PAYMENT_SANDBOX=true", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    const req = mockReq({ body: { gatewayReference: "SBX-123", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("Sandbox payment is disabled");
  });

  test("PAY-02.2: Chặn createSandboxPayment trên production", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    const req = mockReq({ params: { id: "507f1f77bcf86cd799439011" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.createSandboxPayment(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
  });

  test("PAY-02.3: Chặn sandbox webhook khi cờ ENABLE_PAYMENT_SANDBOX bị thiếu hoặc false", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.ENABLE_PAYMENT_SANDBOX;

    const req = mockReq({ body: { gatewayReference: "SBX-123", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
  });

  test("PAY-02.4: Chặn payload sandbox không hợp lệ (thiếu status)", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    const req = mockReq({ body: { gatewayReference: "SBX-123" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
  });

  test("PAY-02.5: Chặn sandbox webhook trên staging kể cả khi cờ ENABLE_PAYMENT_SANDBOX=true", async () => {
    process.env.NODE_ENV = "staging";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    const req = mockReq({ body: { gatewayReference: "SBX-123", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("Sandbox payment is disabled");
  });

  test("PAY-02.6: Chặn sandbox webhook trên môi trường lạ khác (ví dụ: uat) kể cả khi cờ true", async () => {
    process.env.NODE_ENV = "uat";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    const req = mockReq({ body: { gatewayReference: "SBX-123", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
  });

  test("PAY-02.7: Cho phép sandbox webhook trên development khi ENABLE_PAYMENT_SANDBOX=true", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    jest.spyOn(paymentService, "processWebhook").mockResolvedValueOnce({
      paymentStatus: "COMPLETED",
      result: "PAYMENT_SUCCESS",
    });
    jest.spyOn(contributionService, "processWebhook").mockResolvedValueOnce(null);

    const req = mockReq({ body: { gatewayReference: "SBX-123", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);

    paymentService.processWebhook.mockRestore();
    contributionService.processWebhook.mockRestore();
  });

  test("PAY-02.8: Cho phép sandbox webhook trên test khi ENABLE_PAYMENT_SANDBOX=true", async () => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    jest.spyOn(paymentService, "processWebhook").mockResolvedValueOnce({
      paymentStatus: "COMPLETED",
      result: "PAYMENT_SUCCESS",
    });
    jest.spyOn(contributionService, "processWebhook").mockResolvedValueOnce(null);

    const req = mockReq({ body: { gatewayReference: "SBX-123", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);

    paymentService.processWebhook.mockRestore();
    contributionService.processWebhook.mockRestore();
  });
});

describe("PAY-05: Sponsor Sandbox 404 Resolution & Explicit Routing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      ENABLE_PAYMENT_SANDBOX: "true",
      PAYMENT_WEBHOOK_SECRET: "test-webhook-secret-12345"
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // --- Nhóm Sandbox Webhook ---
  test("PAY-05.1: Sandbox - Định tuyến webhook tài trợ (SBX-C-...) sang contributionService và trả về 200", async () => {
    const spyContrib = jest.spyOn(contributionService, "processWebhook").mockResolvedValueOnce({
      contributionStatus: "COMPLETED",
      result: "CONTRIBUTION_SUCCESS",
    });
    const spyPayment = jest.spyOn(paymentService, "processWebhook");

    const req = mockReq({ body: { gatewayReference: "SBX-C-uuid-1234", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(spyContrib).toHaveBeenCalledWith("SBX-C-uuid-1234", "SUCCESS");
    expect(spyPayment).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.result).toBe("CONTRIBUTION_SUCCESS");

    spyContrib.mockRestore();
    spyPayment.mockRestore();
  });

  test("PAY-05.2: Sandbox - Định tuyến webhook học phí (SBX-...) sang paymentService và trả về 200", async () => {
    const spyContrib = jest.spyOn(contributionService, "processWebhook");
    const spyPayment = jest.spyOn(paymentService, "processWebhook").mockResolvedValueOnce({
      paymentStatus: "COMPLETED",
      result: "PAYMENT_SUCCESS",
    });

    const req = mockReq({ body: { gatewayReference: "SBX-enrollment-uuid", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(spyPayment).toHaveBeenCalledWith("SBX-enrollment-uuid", "SUCCESS");
    expect(spyContrib).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.result).toBe("PAYMENT_SUCCESS");

    spyContrib.mockRestore();
    spyPayment.mockRestore();
  });

  test("PAY-05.3: Sandbox - Webhook tài trợ không tồn tại trả về 404 PAYMENT_NOT_FOUND", async () => {
    jest.spyOn(contributionService, "processWebhook").mockResolvedValueOnce(null);

    const req = mockReq({ body: { gatewayReference: "SBX-C-not-found", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PAYMENT_NOT_FOUND");

    contributionService.processWebhook.mockRestore();
  });

  test("PAY-05.4: Sandbox - Webhook học phí không tồn tại trả về 404 PAYMENT_NOT_FOUND", async () => {
    jest.spyOn(paymentService, "processWebhook").mockRejectedValueOnce(
      require("../src/utils/errors").PAYMENT_NOT_FOUND()
    );

    const req = mockReq({ body: { gatewayReference: "SBX-not-found", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PAYMENT_NOT_FOUND");

    paymentService.processWebhook.mockRestore();
  });

  test("PAY-05.5: Sandbox - Webhook tham chiếu sai tiền tố (ví dụ C-1234 không có SBX-C-) định tuyến sang paymentService và trả về 404", async () => {
    jest.spyOn(paymentService, "processWebhook").mockRejectedValueOnce(
      require("../src/utils/errors").PAYMENT_NOT_FOUND()
    );
    const spyContrib = jest.spyOn(contributionService, "processWebhook");

    const req = mockReq({ body: { gatewayReference: "C-1234-wrong-prefix", status: "SUCCESS" } });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(spyContrib).not.toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PAYMENT_NOT_FOUND");

    paymentService.processWebhook.mockRestore();
    spyContrib.mockRestore();
  });

  // --- Nhóm Production Webhook ---
  test("PAY-05.6: Production - Định tuyến webhook tài trợ (CONTRIB-...) sang contributionService và trả về 200", async () => {
    const spyContrib = jest.spyOn(contributionService, "processWebhook").mockResolvedValueOnce({
      contributionStatus: "COMPLETED",
      result: "CONTRIBUTION_SUCCESS",
    });
    const spyPayment = jest.spyOn(paymentService, "processWebhook");

    const req = mockReq({
      headers: { "x-webhook-secret": "test-webhook-secret-12345" },
      body: { gatewayReference: "CONTRIB-prod-1234", status: "SUCCESS" }
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(spyContrib).toHaveBeenCalledWith("CONTRIB-prod-1234", "SUCCESS");
    expect(spyPayment).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.result).toBe("CONTRIBUTION_SUCCESS");

    spyContrib.mockRestore();
    spyPayment.mockRestore();
  });

  test("PAY-05.7: Production - Định tuyến webhook học phí sang paymentService và trả về 200", async () => {
    const spyContrib = jest.spyOn(contributionService, "processWebhook");
    const spyPayment = jest.spyOn(paymentService, "processWebhook").mockResolvedValueOnce({
      paymentStatus: "COMPLETED",
      result: "PAYMENT_SUCCESS",
    });

    const req = mockReq({
      headers: { "x-webhook-secret": "test-webhook-secret-12345" },
      body: { gatewayReference: "PAY-prod-tuition-999", status: "SUCCESS" }
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(spyPayment).toHaveBeenCalledWith("PAY-prod-tuition-999", "SUCCESS");
    expect(spyContrib).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.result).toBe("PAYMENT_SUCCESS");

    spyContrib.mockRestore();
    spyPayment.mockRestore();
  });

  test("PAY-05.8: Production - Webhook tài trợ không tồn tại trả về 404 PAYMENT_NOT_FOUND", async () => {
    jest.spyOn(contributionService, "processWebhook").mockResolvedValueOnce(null);

    const req = mockReq({
      headers: { "x-webhook-secret": "test-webhook-secret-12345" },
      body: { gatewayReference: "CONTRIB-not-found", status: "SUCCESS" }
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PAYMENT_NOT_FOUND");

    contributionService.processWebhook.mockRestore();
  });

  test("PAY-05.9: Production - Webhook học phí không tồn tại trả về 404 PAYMENT_NOT_FOUND", async () => {
    jest.spyOn(paymentService, "processWebhook").mockRejectedValueOnce(
      require("../src/utils/errors").PAYMENT_NOT_FOUND()
    );

    const req = mockReq({
      headers: { "x-webhook-secret": "test-webhook-secret-12345" },
      body: { gatewayReference: "PAY-not-found", status: "SUCCESS" }
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PAYMENT_NOT_FOUND");

    paymentService.processWebhook.mockRestore();
  });

  test("PAY-05.10: Production - Webhook tài trợ sai tiền tố (ví dụ SPONSOR-1234 thiếu CONTRIB-/SBX-C-) bị định tuyến nhầm sang paymentService và trả về 404", async () => {
    jest.spyOn(paymentService, "processWebhook").mockRejectedValueOnce(
      require("../src/utils/errors").PAYMENT_NOT_FOUND()
    );
    const spyContrib = jest.spyOn(contributionService, "processWebhook");

    const req = mockReq({
      headers: { "x-webhook-secret": "test-webhook-secret-12345" },
      body: { gatewayReference: "SPONSOR-1234-wrong-prefix", status: "SUCCESS" }
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.processGatewayWebhook(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(spyContrib).not.toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PAYMENT_NOT_FOUND");

    paymentService.processWebhook.mockRestore();
    spyContrib.mockRestore();
  });
});

describe("PAY-04: Late SUCCESS after FAILED Handling", () => {
  let sessionMock;

  beforeEach(() => {
    sessionMock = {
      withTransaction: jest.fn().mockImplementation(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(sessionMock);
  });

  afterEach(() => {
    mongoose.startSession.mockRestore();
  });

  test("PAY-04.1: Late SUCCESS for Payment does NOT switch FAILED to COMPLETED and flags for review", async () => {
    // Payment.findOneAndUpdate trả về null (Payment hiện không ở trạng thái PENDING)
    jest.spyOn(Payment, "findOneAndUpdate").mockResolvedValueOnce(null);

    // Payment.findOne trả về bản ghi hiện tại đang có status là FAILED
    jest.spyOn(Payment, "findOne").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        gatewayReference: "GW-LATE-123",
        paymentStatus: "FAILED",
        enrollmentId: new mongoose.Types.ObjectId(),
      }),
    });
    jest.spyOn(Enrollment, "findById").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce({ enrollmentStatus: "FAILED" }),
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await paymentService.processWebhook("GW-LATE-123", "SUCCESS");

    expect(result.paymentStatus).toBe("FAILED");
    expect(result.result).toBe("LATE_SUCCESS_FLAGGED_FOR_REVIEW");
    expect(warnSpy).toHaveBeenCalled();

    Payment.findOneAndUpdate.mockRestore();
    Payment.findOne.mockRestore();
    Enrollment.findById.mockRestore();
    warnSpy.mockRestore();
  });

  test("PAY-04.2: Late SUCCESS for Contribution does NOT switch FAILED to COMPLETED and flags for review", async () => {
    jest.spyOn(SponsorContribution, "findOne").mockResolvedValueOnce({
      _id: new mongoose.Types.ObjectId(),
      paymentReference: "SBX-C-LATE-456",
      contributionStatus: "FAILED",
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await contributionService.processWebhook("SBX-C-LATE-456", "SUCCESS");

    expect(result.contributionStatus).toBe("FAILED");
    expect(result.result).toBe("LATE_SUCCESS_FLAGGED_FOR_REVIEW");
    expect(warnSpy).toHaveBeenCalled();

    SponsorContribution.findOne.mockRestore();
    warnSpy.mockRestore();
  });

  test("PAY-04.3: Webhook SUCCESS khi giữ chỗ đã hết hạn - không tạo TeacherEarning, không đổi Enrollment sang CONFIRMED, trả về LATE_PAYMENT_PENDING_REVIEW", async () => {
    const paymentId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const teacherId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();

    const paymentDoc = {
      _id: paymentId,
      gatewayReference: "GW-LATE-HOLD-1",
      paymentStatus: "COMPLETED",
      payerUserId: studentId,
      enrollmentId,
      amount: mongoose.Types.Decimal128.fromString("1000000"),
    };

    // Payment ban đầu là PENDING -> chuyển thành COMPLETED
    jest.spyOn(Payment, "findOneAndUpdate").mockResolvedValueOnce(paymentDoc);

    // Mock pending scholarship usages qua ScholarshipUsage.find
    const scholarshipFindSpy = jest.spyOn(ScholarshipUsage, "find").mockReturnValue({
      session: jest.fn().mockResolvedValue([]),
    });

    // Enrollment.updateOne thất bại vì holdExpiresAt đã hết hạn (modifiedCount === 0)
    jest.spyOn(Enrollment, "updateOne").mockResolvedValueOnce({ modifiedCount: 0 });

    // Đọc Enrollment hiện tại (vẫn là EXPIRED)
    jest.spyOn(Enrollment, "findById").mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: enrollmentId,
        studentId,
        teacherId,
        classId,
        enrollmentStatus: "EXPIRED",
      }),
    });

    const txSaveSpy = jest.spyOn(Transaction.prototype, "save").mockResolvedValue({});
    const earningSaveSpy = jest.spyOn(TeacherEarning.prototype, "save").mockResolvedValue({});

    const result = await paymentService.processWebhook("GW-LATE-HOLD-1", "SUCCESS");

    // 1. Kết quả trả về đúng mã trung tính
    expect(result.paymentStatus).toBe("COMPLETED");
    expect(result.enrollmentStatus).toBe("EXPIRED");
    expect(result.result).toBe("LATE_PAYMENT_PENDING_REVIEW");

    // 2. Tuyệt đối KHÔNG tạo TeacherEarning cho giáo viên
    expect(earningSaveSpy).not.toHaveBeenCalled();

    // 3. Có tạo bản ghi Transaction REFUND (PENDING) để lưu vết đối soát
    expect(txSaveSpy).toHaveBeenCalledTimes(1);

    Payment.findOneAndUpdate.mockRestore();
    scholarshipFindSpy.mockRestore();
    Enrollment.updateOne.mockRestore();
    Enrollment.findById.mockRestore();
    txSaveSpy.mockRestore();
    earningSaveSpy.mockRestore();
  });
});

describe("PAY-03: Idempotency & Concurrency Safety", () => {
  let sessionMock;

  beforeEach(() => {
    sessionMock = {
      withTransaction: jest.fn().mockImplementation(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(sessionMock);
  });

  afterEach(() => {
    mongoose.startSession.mockRestore();
  });

  test("PAY-03.1: Duplicate webhook call returns IDEMPOTENT and avoids duplicate ledger writes", async () => {
    jest.spyOn(Payment, "findOneAndUpdate").mockResolvedValueOnce(null);

    jest.spyOn(Payment, "findOne").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        gatewayReference: "GW-ALREADY-DONE",
        paymentStatus: "COMPLETED",
        enrollmentId: new mongoose.Types.ObjectId(),
      }),
    });
    jest.spyOn(Enrollment, "findById").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce({ enrollmentStatus: "CONFIRMED" }),
    });

    const result = await paymentService.processWebhook("GW-ALREADY-DONE", "SUCCESS");

    expect(result.paymentStatus).toBe("COMPLETED");
    expect(result.result).toBe("IDEMPOTENT");

    Payment.findOneAndUpdate.mockRestore();
    Payment.findOne.mockRestore();
    Enrollment.findById.mockRestore();
  });

  test("PAY-03.2 [Unit (mock)]: 2 concurrent webhook SUCCESS calls result in 1 SUCCESS, 1 IDEMPOTENT, 1 Transaction, 1 TeacherEarning, 0 REFUND", async () => {
    const paymentId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const teacherId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();

    const paymentDoc = {
      _id: paymentId,
      gatewayReference: "GW-RACE-123",
      paymentStatus: "COMPLETED",
      payerUserId: studentId,
      enrollmentId,
      amount: mongoose.Types.Decimal128.fromString("1000000"),
    };

    // Call 1 thắng (match PENDING -> COMPLETED), Call 2 thua (trả về null vì đã thành COMPLETED)
    jest.spyOn(Payment, "findOneAndUpdate")
      .mockResolvedValueOnce(paymentDoc)
      .mockResolvedValueOnce(null);

    // Call 2 khi không match sẽ findOne để kiểm tra trạng thái
    jest.spyOn(Payment, "findOne").mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: paymentId,
        gatewayReference: "GW-RACE-123",
        paymentStatus: "COMPLETED",
        enrollmentId,
      }),
    });

    // Mock Enrollment
    jest.spyOn(Enrollment, "updateOne").mockResolvedValue({ modifiedCount: 1 });
    jest.spyOn(Enrollment, "findById").mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: enrollmentId,
        studentId,
        teacherId,
        classId,
        enrollmentStatus: "CONFIRMED",
      }),
    });

    // Mock pending scholarship usages qua ScholarshipUsage.find
    const scholarshipFindSpy = jest.spyOn(ScholarshipUsage, "find").mockReturnValue({
      session: jest.fn().mockResolvedValue([]),
    });

    const txSaveSpy = jest.spyOn(Transaction.prototype, "save").mockResolvedValue({});
    const earningSaveSpy = jest.spyOn(TeacherEarning.prototype, "save").mockResolvedValue({});
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Chạy song song 2 webhook cùng lúc
    const [res1, res2] = await Promise.all([
      paymentService.processWebhook("GW-RACE-123", "SUCCESS"),
      paymentService.processWebhook("GW-RACE-123", "SUCCESS"),
    ]);

    const results = [res1.result, res2.result];
    expect(results).toContain("PAYMENT_SUCCESS");
    expect(results).toContain("IDEMPOTENT");

    // Chỉ có đúng 1 Transaction ghi sổ được tạo (0 REFUND)
    expect(txSaveSpy).toHaveBeenCalledTimes(1);
    expect(earningSaveSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();

    Payment.findOneAndUpdate.mockRestore();
    Payment.findOne.mockRestore();
    Enrollment.updateOne.mockRestore();
    Enrollment.findById.mockRestore();
    scholarshipFindSpy.mockRestore();
    txSaveSpy.mockRestore();
    earningSaveSpy.mockRestore();
  });

  test("PAY-03.5 [Unit (mock)]: Idempotency cho contributionService - webhook SUCCESS gọi trùng 2 lần, fundedAmount chỉ cộng đúng 1 lần", async () => {
    const contributionId = new mongoose.Types.ObjectId();
    const campaignId = new mongoose.Types.ObjectId();
    const sponsorId = new mongoose.Types.ObjectId();

    const pendingContribution = {
      _id: contributionId,
      campaignId,
      sponsorId,
      amount: mongoose.Types.Decimal128.fromString("500000"),
      paymentReference: "SBX-C-DUP-1",
      contributionStatus: "PENDING",
    };

    const completedContribution = {
      ...pendingContribution,
      contributionStatus: "COMPLETED",
    };

    // Lần 1: findOne ra PENDING. updateOne thành công.
    // Lần 2: findOne ra COMPLETED.
    jest.spyOn(SponsorContribution, "findOne")
      .mockResolvedValueOnce(pendingContribution)
      .mockResolvedValueOnce(completedContribution);

    jest.spyOn(SponsorContribution, "updateOne").mockResolvedValueOnce({ modifiedCount: 1 });
    const campaignUpdateSpy = jest.spyOn(ScholarshipCampaign, "updateOne").mockResolvedValueOnce({ modifiedCount: 1 });
    const txCreateSpy = jest.spyOn(Transaction, "create").mockResolvedValueOnce([]);
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Gọi lần 1
    const res1 = await contributionService.processWebhook("SBX-C-DUP-1", "SUCCESS");
    expect(res1.contributionStatus).toBe("COMPLETED");
    expect(res1.result).toBe("CONTRIBUTION_SUCCESS");

    // Gọi lần 2 (trùng lặp)
    const res2 = await contributionService.processWebhook("SBX-C-DUP-1", "SUCCESS");
    expect(res2.contributionStatus).toBe("COMPLETED");
    expect(res2.result).toBe("IDEMPOTENT");

    // Campaign fundedAmount chỉ được cập nhật đúng 1 lần
    expect(campaignUpdateSpy).toHaveBeenCalledTimes(1);
    expect(campaignUpdateSpy).toHaveBeenCalledWith(
      { _id: campaignId },
      { $inc: { fundedAmount: pendingContribution.amount } },
      expect.anything()
    );
    // Transaction chỉ tạo đúng 1 lần
    expect(txCreateSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
    SponsorContribution.findOne.mockRestore();
    SponsorContribution.updateOne.mockRestore();
    campaignUpdateSpy.mockRestore();
    txCreateSpy.mockRestore();
  });

  const hasIsolatedReplSet = Boolean(process.env.ISOLATED_TEST_REPLSET_URI);

  (hasIsolatedReplSet ? test : test.skip)(
    "PAY-03.3 [BLOCKED: Cần MongoDB Replica Set cô lập]: 2 webhook SUCCESS đồng thời - kiểm tra thực tế DB cô lập (1 Transaction, 1 Enrollment, 1 TeacherEarning, 0 REFUND)",
    async () => {
      // Test suite thực thi trên Replica Set cô lập khi có ISOLATED_TEST_REPLSET_URI
    }
  );

  (hasIsolatedReplSet ? test : test.skip)(
    "PAY-03.4 [BLOCKED: Cần MongoDB Replica Set cô lập]: 10 webhook SUCCESS đồng thời - kiểm tra thực tế DB cô lập (1 Transaction, 1 Enrollment, 1 TeacherEarning, 0 REFUND)",
    async () => {
      // Test suite thực thi trên Replica Set cô lập khi có ISOLATED_TEST_REPLSET_URI
    }
  );
});

describe("PAY-06: Money Validation & Limit Controls", () => {
  let sessionMock;

  beforeEach(() => {
    sessionMock = {
      withTransaction: jest.fn().mockImplementation(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(sessionMock);
  });

  afterEach(() => {
    mongoose.startSession.mockRestore();
  });

  test("PAY-06.1: Reject negative amount for sponsor contribution", async () => {
    await expect(
      contributionService.createContribution("sponsor_1", "507f1f77bcf86cd799439011", { amount: -50000 })
    ).rejects.toThrow(AppError);
  });

  test("PAY-06.2: Reject zero amount for sponsor contribution", async () => {
    await expect(
      contributionService.createContribution("sponsor_1", "507f1f77bcf86cd799439011", { amount: 0 })
    ).rejects.toThrow(AppError);
  });

  test("PAY-06.3: Reject NaN string amount for sponsor contribution", async () => {
    await expect(
      contributionService.createContribution("sponsor_1", "507f1f77bcf86cd799439011", { amount: "abc" })
    ).rejects.toThrow(AppError);
  });

  test("PAY-06.4: Reject abnormally large amount (> 1e12) for sponsor contribution", async () => {
    await expect(
      contributionService.createContribution("sponsor_1", "507f1f77bcf86cd799439011", { amount: 1e13 })
    ).rejects.toThrow(AppError);
  });

  test("PAY-06.5: Reject weird format amounts for sponsor contribution", async () => {
    for (const invalid of [[50000], {}, true, null, undefined, "1e15"]) {
      await expect(
        contributionService.createContribution("sponsor_1", "507f1f77bcf86cd799439011", { amount: invalid })
      ).rejects.toThrow(AppError);
    }
  });

  test("PAY-06.6: Scholarship payment rejects when tuition exceeds campaign available fund by 1 unit", async () => {
    const studentId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();
    const scholarshipId = new mongoose.Types.ObjectId();
    const campaignId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();

    // Học phí là 1,000,001
    jest.spyOn(Enrollment, "findOne").mockResolvedValueOnce({
      _id: enrollmentId,
      studentId,
      classId,
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: new Date(Date.now() + 600000),
      tuitionAmount: mongoose.Types.Decimal128.fromString("1000001"),
    });

    jest.spyOn(Class, "findById").mockResolvedValueOnce({
      _id: classId,
      className: "Math 101",
    });

    // Học bổng có 2,000,000 nhưng Campaign chỉ có 1,000,000 khả dụng (vượt đúng 1 đơn vị)
    jest.spyOn(Scholarship, "findOne").mockResolvedValueOnce({
      _id: scholarshipId,
      studentId,
      campaignId,
      status: "ACTIVE",
      validFrom: new Date(Date.now() - 600000),
      expiresAt: new Date(Date.now() + 600000),
      remainingAmount: mongoose.Types.Decimal128.fromString("2000000"),
    });

    jest.spyOn(ScholarshipCampaign, "findById").mockResolvedValueOnce({
      _id: campaignId,
      scope: {},
      fundedAmount: mongoose.Types.Decimal128.fromString("1000000"),
      usedAmount: mongoose.Types.Decimal128.fromString("0"),
    });

    await expect(
      scholarshipPaymentService.payWithScholarship(studentId, enrollmentId, scholarshipId)
    ).rejects.toThrow("Campaign fund is not available");

    Enrollment.findOne.mockRestore();
    Class.findById.mockRestore();
    Scholarship.findOne.mockRestore();
    ScholarshipCampaign.findById.mockRestore();
  });

  test("PAY-06.7: Scholarship payment succeeds when tuition is exactly equal to available balance", async () => {
    const studentId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();
    const scholarshipId = new mongoose.Types.ObjectId();
    const campaignId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();

    // Học phí đúng bằng số dư khả dụng (1,000,000)
    jest.spyOn(Enrollment, "findOne").mockResolvedValueOnce({
      _id: enrollmentId,
      studentId,
      classId,
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: new Date(Date.now() + 600000),
      tuitionAmount: mongoose.Types.Decimal128.fromString("1000000"),
    });

    jest.spyOn(Class, "findById").mockResolvedValueOnce({
      _id: classId,
      className: "Math 101",
    });

    jest.spyOn(Scholarship, "findOne").mockResolvedValueOnce({
      _id: scholarshipId,
      studentId,
      campaignId,
      status: "ACTIVE",
      validFrom: new Date(Date.now() - 600000),
      expiresAt: new Date(Date.now() + 600000),
      remainingAmount: mongoose.Types.Decimal128.fromString("1000000"),
    });

    jest.spyOn(ScholarshipCampaign, "findById").mockResolvedValueOnce({
      _id: campaignId,
      scope: {},
      fundedAmount: mongoose.Types.Decimal128.fromString("1000000"),
      usedAmount: mongoose.Types.Decimal128.fromString("0"),
    });

    // Session mocks
    jest.spyOn(ScholarshipUsage, "findOne").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce(null),
    });

    jest.spyOn(ScholarshipCampaign, "findOne").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce({ _id: campaignId }),
    });

    // findOneAndUpdate trừ quỹ học bổng thành công
    jest.spyOn(Scholarship, "findOneAndUpdate").mockResolvedValueOnce({
      _id: scholarshipId,
      remainingAmount: mongoose.Types.Decimal128.fromString("0"),
    });

    jest.spyOn(Enrollment, "updateOne").mockResolvedValueOnce({ modifiedCount: 1 });
    jest.spyOn(Payment, "updateMany").mockResolvedValueOnce({ modifiedCount: 0 });

    const createdUsage = {
      _id: new mongoose.Types.ObjectId(),
      scholarshipId,
      enrollmentId,
      amount: mongoose.Types.Decimal128.fromString("1000000"),
      status: "PENDING",
      save: jest.fn().mockResolvedValue(),
    };
    jest.spyOn(ScholarshipUsage, "create").mockResolvedValueOnce([createdUsage]);

    jest.spyOn(Scholarship, "findById").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce({
        _id: scholarshipId,
        campaignId,
        remainingAmount: mongoose.Types.Decimal128.fromString("0"),
        save: jest.fn().mockResolvedValue(),
      }),
    });
    jest.spyOn(ScholarshipCampaign, "updateOne").mockResolvedValueOnce({ modifiedCount: 1 });
    jest.spyOn(Transaction, "create").mockResolvedValueOnce([]);
    jest.spyOn(TeacherEarning, "create").mockResolvedValueOnce([]);
    const Notification = require("../src/models/Notification");
    const notifySpy = jest.spyOn(Notification, "create").mockImplementation(() => Promise.resolve({}));

    jest.spyOn(Enrollment, "findById").mockReturnValueOnce({
      lean: jest.fn().mockResolvedValueOnce({
        _id: enrollmentId,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "SCHOLARSHIP",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1000000"),
        holdExpiresAt: null,
      }),
    });

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await scholarshipPaymentService.payWithScholarship(studentId, enrollmentId, scholarshipId);

    expect(result.enrollmentStatus).toBe("CONFIRMED");
    expect(result.paymentSource).toBe("SCHOLARSHIP");
    expect(result.remainingDue.toString()).toBe("0");

    consoleSpy.mockRestore();

    Enrollment.findOne.mockRestore();
    Class.findById.mockRestore();
    Scholarship.findOne.mockRestore();
    ScholarshipCampaign.findById.mockRestore();
    ScholarshipUsage.findOne.mockRestore();
    ScholarshipCampaign.findOne.mockRestore();
    Scholarship.findOneAndUpdate.mockRestore();
    Enrollment.updateOne.mockRestore();
    Payment.updateMany.mockRestore();
    ScholarshipUsage.create.mockRestore();
    Scholarship.findById.mockRestore();
    ScholarshipCampaign.updateOne.mockRestore();
    Transaction.create.mockRestore();
    TeacherEarning.create.mockRestore();
    Enrollment.findById.mockRestore();
    notifySpy.mockRestore();
  });

  test("PAY-06.8: Scholarship payment rejects when scholarship deduction findOneAndUpdate fails", async () => {
    const studentId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();
    const scholarshipId = new mongoose.Types.ObjectId();
    const campaignId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();

    jest.spyOn(Enrollment, "findOne").mockResolvedValueOnce({
      _id: enrollmentId,
      studentId,
      classId,
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: new Date(Date.now() + 600000),
      tuitionAmount: mongoose.Types.Decimal128.fromString("500000"),
    });

    jest.spyOn(Class, "findById").mockResolvedValueOnce({
      _id: classId,
      className: "Math 101",
    });

    jest.spyOn(Scholarship, "findOne").mockResolvedValueOnce({
      _id: scholarshipId,
      studentId,
      campaignId,
      status: "ACTIVE",
      validFrom: new Date(Date.now() - 600000),
      expiresAt: new Date(Date.now() + 600000),
      remainingAmount: mongoose.Types.Decimal128.fromString("500000"),
    });

    jest.spyOn(ScholarshipCampaign, "findById").mockResolvedValueOnce({
      _id: campaignId,
      scope: {},
      fundedAmount: mongoose.Types.Decimal128.fromString("1000000"),
      usedAmount: mongoose.Types.Decimal128.fromString("0"),
    });

    jest.spyOn(ScholarshipUsage, "findOne").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce(null),
    });

    jest.spyOn(ScholarshipCampaign, "findOne").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce({ _id: campaignId }),
    });

    // findOneAndUpdate trả về null do số dư không còn đủ (bị trừ bởi request song song)
    jest.spyOn(Scholarship, "findOneAndUpdate").mockResolvedValueOnce(null);

    await expect(
      scholarshipPaymentService.payWithScholarship(studentId, enrollmentId, scholarshipId)
    ).rejects.toThrow("Scholarship balance is no longer available");

    Enrollment.findOne.mockRestore();
    Class.findById.mockRestore();
    Scholarship.findOne.mockRestore();
    ScholarshipCampaign.findById.mockRestore();
    ScholarshipUsage.findOne.mockRestore();
    ScholarshipCampaign.findOne.mockRestore();
    Scholarship.findOneAndUpdate.mockRestore();
  });

  test("PAY-06.9: Scholarship payment rejects abnormally large tuition (> 1e12) or NaN tuition", async () => {
    const studentId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();
    const scholarshipId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();

    // Học phí vượt trần kỹ thuật 1e12
    jest.spyOn(Enrollment, "findOne").mockResolvedValueOnce({
      _id: enrollmentId,
      studentId,
      classId,
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: new Date(Date.now() + 600000),
      tuitionAmount: mongoose.Types.Decimal128.fromString("1000000000001"),
    });

    jest.spyOn(Class, "findById").mockResolvedValueOnce({ _id: classId, className: "Math 101" });
    jest.spyOn(Scholarship, "findOne").mockResolvedValueOnce({
      _id: scholarshipId,
      studentId,
      status: "ACTIVE",
      validFrom: new Date(Date.now() - 600000),
      expiresAt: new Date(Date.now() + 600000),
      remainingAmount: mongoose.Types.Decimal128.fromString("1000000"),
    });
    jest.spyOn(ScholarshipCampaign, "findById").mockResolvedValueOnce({
      _id: new mongoose.Types.ObjectId(),
      scope: {},
    });

    await expect(
      scholarshipPaymentService.payWithScholarship(studentId, enrollmentId, scholarshipId)
    ).rejects.toThrow("Invalid tuition amount");

    Enrollment.findOne.mockRestore();
    Class.findById.mockRestore();
    Scholarship.findOne.mockRestore();
    ScholarshipCampaign.findById.mockRestore();
  });

  test("PAY-06.10: Payment intent rejects when remaining tuition is zero or negative", async () => {
    const studentId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();

    jest.spyOn(Enrollment, "findOne").mockResolvedValueOnce({
      _id: enrollmentId,
      studentId,
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: new Date(Date.now() + 600000),
      tuitionAmount: mongoose.Types.Decimal128.fromString("500000"),
    });

    // Payment intent đã PENDING không có
    jest.spyOn(Payment, "findOne").mockResolvedValueOnce(null);

    // Học bổng đã giữ đúng 500,000 (hết sạch số dư nợ)
    jest.spyOn(ScholarshipUsage, "find").mockReturnValueOnce({
      session: jest.fn().mockResolvedValueOnce([{ amount: mongoose.Types.Decimal128.fromString("500000") }]),
    });

    await expect(
      paymentService.createSandboxPayment(studentId, enrollmentId)
    ).rejects.toThrow("No remaining tuition amount to pay");

    Enrollment.findOne.mockRestore();
    Payment.findOne.mockRestore();
    ScholarshipUsage.find.mockRestore();
  });
});

describe("PAY-OWNERSHIP: Quyền sở hữu và kiểm soát truy cập cho endpoint GET thanh toán", () => {
  const studentAId = new mongoose.Types.ObjectId().toString();
  const studentBId = new mongoose.Types.ObjectId().toString();
  const paymentOfBId = new mongoose.Types.ObjectId().toString();
  const enrollmentOfBId = new mongoose.Types.ObjectId().toString();

  test("PAY-OWNERSHIP.1: Học viên A không đọc được thanh toán của học viên B qua GET /api/payments/:id (404)", async () => {
    // Payment thuộc về studentB
    jest.spyOn(Payment, "findById").mockReturnValueOnce({
      lean: jest.fn().mockResolvedValueOnce({
        _id: paymentOfBId,
        payerUserId: studentBId,
        amount: mongoose.Types.Decimal128.fromString("1000000"),
        paymentStatus: "COMPLETED",
        enrollmentId: enrollmentOfBId,
      }),
    });

    const req = mockReq({
      user: { id: studentAId, role: "STUDENT" },
      params: { id: paymentOfBId },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.getPaymentById(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PAYMENT_NOT_FOUND");

    Payment.findById.mockRestore();
  });

  test("PAY-OWNERSHIP.2: ADMIN đọc được thanh toán của bất kỳ học viên nào qua GET /api/payments/:id (200)", async () => {
    jest.spyOn(Payment, "findById").mockReturnValueOnce({
      lean: jest.fn().mockResolvedValueOnce({
        _id: paymentOfBId,
        payerUserId: studentBId,
        amount: mongoose.Types.Decimal128.fromString("1000000"),
        paymentStatus: "COMPLETED",
        enrollmentId: enrollmentOfBId,
      }),
    });
    jest.spyOn(Enrollment, "findById").mockReturnValueOnce({
      select: jest.fn().mockReturnValueOnce({
        lean: jest.fn().mockResolvedValueOnce({
          enrollmentStatus: "CONFIRMED",
          paymentSource: "DIRECT",
        }),
      }),
    });

    const req = mockReq({
      user: { id: "admin_user_id", role: "ADMIN" },
      params: { id: paymentOfBId },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.getPaymentById(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    Payment.findById.mockRestore();
    Enrollment.findById.mockRestore();
  });

  test("PAY-OWNERSHIP.3: Học viên A đọc được thanh toán của chính mình qua GET /api/payments/:id (200)", async () => {
    const paymentOfAId = new mongoose.Types.ObjectId().toString();
    jest.spyOn(Payment, "findById").mockReturnValueOnce({
      lean: jest.fn().mockResolvedValueOnce({
        _id: paymentOfAId,
        payerUserId: studentAId,
        amount: mongoose.Types.Decimal128.fromString("500000"),
        paymentStatus: "COMPLETED",
        enrollmentId: new mongoose.Types.ObjectId(),
      }),
    });
    jest.spyOn(Enrollment, "findById").mockReturnValueOnce({
      select: jest.fn().mockReturnValueOnce({
        lean: jest.fn().mockResolvedValueOnce({
          enrollmentStatus: "CONFIRMED",
          paymentSource: "DIRECT",
        }),
      }),
    });

    const req = mockReq({
      user: { id: studentAId, role: "STUDENT" },
      params: { id: paymentOfAId },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.getPaymentById(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    Payment.findById.mockRestore();
    Enrollment.findById.mockRestore();
  });

  test("PAY-OWNERSHIP.4: Học viên A không đọc được lịch sử thanh toán của đơn ghi danh thuộc học viên B (404)", async () => {
    // Enrollment không khớp với studentAId
    jest.spyOn(Enrollment, "findOne").mockResolvedValueOnce(null);

    const req = mockReq({
      user: { id: studentAId, role: "STUDENT" },
      params: { id: enrollmentOfBId },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.getPaymentHistory(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ENROLLMENT_NOT_FOUND");

    Enrollment.findOne.mockRestore();
  });

  test("PAY-OWNERSHIP.5: Role không phải STUDENT bị từ chối khi gọi GET /api/enrollments/:id/payments (403)", async () => {
    const req = mockReq({
      user: { id: "teacher_id", role: "TEACHER" },
      params: { id: enrollmentOfBId },
    });
    const res = mockRes();
    const next = jest.fn();

    await paymentController.getPaymentHistory(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });
});
