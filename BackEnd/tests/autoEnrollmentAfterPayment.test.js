const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  Enrollment,
  Payment,
  ScholarshipCampaign,
  Scholarship,
  ScholarshipUsage,
  Transaction,
  TeacherEarning,
  BankTransferEvent,
  PaymentReconciliation,
} = require("../src/models");
const payosService = require("../src/services/payosService");
const payosWebhookService = require("../src/services/payosWebhookService");
const financialDispatchService = require("../src/services/financialDispatchService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({
  "x-user-id": user._id.toString(),
  "x-user-role": user.role,
});

describe("TIN-FIN-AUTO-ENROLLMENT-AFTER-REAL-PAYMENT: End-to-End Automated Access Verification", () => {
  const originalEnv = { ...process.env };
  let admin, teacher, student, otherStudent;
  let category, subject, course, paidClass, session1;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  }, 30000);

  afterAll(async () => {
    process.env = originalEnv;
    await disconnectDB();
  });

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      ENABLE_PAYMENT_SANDBOX: "true",
      PAYOS_ENABLED: "false",
      PAYOS_TUITION_CLIENT_ID: "tuition_client_id_test",
      PAYOS_TUITION_API_KEY: "tuition_api_key_test",
      PAYOS_TUITION_CHECKSUM_KEY: "tuition_checksum_key_test_12345678",
    };
    payosService.resetPayosClient();
    await clearDB();

    admin = await User.create({
      email: "admin_auto@test.com",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    });

    teacher = await User.create({
      email: "teacher_auto@test.com",
      passwordHash: "x",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Thầy Giáo Viên", verificationStatus: "VERIFIED" },
    });

    student = await User.create({
      email: "student_auto@test.com",
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học Sinh Tự Động" },
    });

    otherStudent = await User.create({
      email: "other_student@test.com",
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học Sinh Chưa Mua" },
    });

    const seedTimestamp = Date.now();
    category = await Category.create({
      name: "Lập trình",
      slug: "lap-trinh-" + seedTimestamp,
      createdBy: admin._id,
    });
    subject = await Subject.create({
      name: "Node.js",
      slug: "nodejs-" + seedTimestamp,
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
    });
    course = await Course.create({
      title: "Khóa học Fullstack",
      slug: "fullstack-" + seedTimestamp,
      subjectId: subject._id,
      subjectName: subject.name,
      categoryId: category._id,
      categoryName: category.name,
      teacherId: teacher._id,
      gradeLevel: "GRADE_12",
      createdBy: admin._id,
    });

    const now = new Date();
    paidClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      subjectId: subject._id,
      categoryId: category._id,
      teacherId: teacher._id,
      teacherName: "Thầy Giáo Viên",
      className: "Lớp Fullstack Chuyên Sâu",
      classType: "PAID",
      tuitionFee: 1000000,
      price: 1000000,
      capacity: 20,
      enrolledCount: 1,
      status: "OPEN",
      startDate: new Date(now.getTime() - 3600000),
      endDate: new Date(now.getTime() + 86400000 * 30),
      enrollmentStart: new Date(now.getTime() - 86400000),
      enrollmentEnd: new Date(now.getTime() + 86400000 * 7),
    });

    session1 = await Session.create({
      classId: paidClass._id,
      className: paidClass.className,
      teacherId: teacher._id,
      title: "Buổi 1: Tổng quan Kiến trúc",
      startDatetime: new Date(now.getTime() - 300000), // Started 5 mins ago (within 20m first-join window)
      endDatetime: new Date(now.getTime() + 3600000),
      status: "IN_PROGRESS",
    });
  });

  // TEST 1: Direct Tuition Payment -> Automatic Enrollment Confirmation & Instant Classroom Access
  it("Flow 1: Real payment webhook automatically moves Enrollment to CONFIRMED and opens Protected Session Access without Admin approval", async () => {
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const enrollment = await Enrollment.create({
      studentId: student._id,
      classId: paidClass._id,
      courseId: course._id,
      teacherId: teacher._id,
      tuitionAmount: 1000000,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
      holdExpiresAt,
    });

    // 1. Student creates Payment Intent
    const createRes = await request(app)
      .post(`/api/enrollments/${enrollment._id}/payments`)
      .set(as(student));
    expect(createRes.status).toBe(201);
    const orderCode = createRes.body.data.orderCode;
    expect(orderCode).toBeGreaterThan(0);

    // 2. Before payment: Student cannot access Protected Session (joinSession returns 403 Forbidden)
    const earlyJoinRes = await request(app)
      .post(`/api/sessions/${session1._id}/join`)
      .set(as(student));
    expect([400, 403]).toContain(earlyJoinRes.status);

    // 3. payOS sends authenticated Webhook to TUITION route
    const webhookData = {
      orderCode,
      amount: 1000000,
      description: `EDUNITY HP ${orderCode}`,
      accountNumber: "12345678",
      reference: "BANK_REF_AUTO_001",
      transactionDateTime: new Date().toISOString(),
      currency: "VND",
      paymentLinkId: createRes.body.data.paymentLinkId,
      code: "00",
    };

    const signature = await payosService.signWebhookDataForChannel("TUITION", webhookData);
    const webhookBody = {
      code: "00",
      desc: "Success",
      data: webhookData,
      signature,
    };

    const webhookRes = await request(app)
      .post("/api/payments/webhooks/payos/tuition")
      .send(webhookBody);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.success).toBe(true);
    expect(webhookRes.body.data.acknowledged).toBe(true);
    expect(webhookRes.body.data.dispatched).toBe(true);

    // 4. Verify MongoDB State: Payment is COMPLETED, Enrollment is CONFIRMED, Transaction created
    const updatedPayment = await Payment.findOne({ orderCode });
    expect(updatedPayment.paymentStatus).toBe("COMPLETED");

    const updatedEnrollment = await Enrollment.findById(enrollment._id);
    expect(updatedEnrollment.enrollmentStatus).toBe("CONFIRMED");
    expect(updatedEnrollment.holdExpiresAt).toBeNull();
    expect(Number(updatedEnrollment.amountPaidViaPayment.toString())).toBe(1000000);

    const tx = await Transaction.findOne({ relatedPaymentId: updatedPayment._id, transactionType: "ENROLLMENT_PAYMENT" });
    expect(tx).not.toBeNull();
    expect(tx.status).toBe("COMPLETED");

    const earning = await TeacherEarning.findOne({ enrollmentId: enrollment._id });
    expect(earning).not.toBeNull();
    expect(earning.status).toBe("PENDING"); // 7-day hold required

    // 5. Automatic Access: Student can now join session immediately without Admin approval
    const joinRes = await request(app)
      .post(`/api/sessions/${session1._id}/join`)
      .set(as(student));
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.success).toBe(true);

    // 6. Security verification: Other student who has NOT paid is strictly rejected
    const otherJoinRes = await request(app)
      .post(`/api/sessions/${session1._id}/join`)
      .set(as(otherStudent));
    expect([400, 403]).toContain(otherJoinRes.status);
  });

  // TEST 2: Underpaid payment -> NEVER auto-confirms Enrollment, opens PaymentReconciliation
  it("Flow 2: Underpaid payment records reconciliation, never auto-confirms Enrollment, and denies session access", async () => {
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const enrollment = await Enrollment.create({
      studentId: student._id,
      classId: paidClass._id,
      courseId: course._id,
      teacherId: teacher._id,
      tuitionAmount: 1000000,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
      holdExpiresAt,
    });

    const createRes = await request(app)
      .post(`/api/enrollments/${enrollment._id}/payments`)
      .set(as(student));
    const orderCode = createRes.body.data.orderCode;

    // payOS sends underpaid webhook (only 500.000 VNĐ instead of 1.000.000 VNĐ)
    const webhookData = {
      orderCode,
      amount: 500000,
      description: `EDUNITY HP ${orderCode}`,
      accountNumber: "12345678",
      reference: "BANK_REF_UNDERPAID_002",
      transactionDateTime: new Date().toISOString(),
      currency: "VND",
      paymentLinkId: createRes.body.data.paymentLinkId,
      code: "00",
    };

    const signature = await payosService.signWebhookDataForChannel("TUITION", webhookData);
    const webhookRes = await request(app)
      .post("/api/payments/webhooks/payos/tuition")
      .send({ code: "00", desc: "Success", data: webhookData, signature });
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.data.reconciliationReason).toBe("AMOUNT_MISMATCH");

    // Enrollment must NOT be confirmed
    const unconfirmedEnrollment = await Enrollment.findById(enrollment._id);
    expect(unconfirmedEnrollment.enrollmentStatus).toBe("PENDING_PAYMENT");

    // Access to live session must be DENIED
    const joinRes = await request(app)
      .post(`/api/sessions/${session1._id}/join`)
      .set(as(student));
    expect([400, 403]).toContain(joinRes.status);

    // PaymentReconciliation record exists
    const recon = await PaymentReconciliation.findOne({ orderCode });
    expect(recon).not.toBeNull();
    expect(recon.reason).toBe("AMOUNT_MISMATCH");
  });

  // TEST 3: Late payment after hold expired -> Never reopens Enrollment, records UNAPPLIED_TUITION_RECEIPT and REFUND PENDING
  it("Flow 3: Late payment arriving after hold expiration never reopens Enrollment and records accounting ledger safely", async () => {
    // Hold expired 5 minutes ago
    const expiredHold = new Date(Date.now() - 5 * 60 * 1000);
    const enrollment = await Enrollment.create({
      studentId: student._id,
      classId: paidClass._id,
      courseId: course._id,
      teacherId: teacher._id,
      tuitionAmount: 1000000,
      enrollmentStatus: "EXPIRED",
      paymentSource: "DIRECT_PAYMENT",
      holdExpiresAt: expiredHold,
    });

    const payment = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      enrollmentId: enrollment._id,
      studentId: student._id,
      payerUserId: student._id,
      amount: 1000000,
      orderCode: 88812301,
      paymentStatus: "PENDING",
      expiredAt: expiredHold,
      paymentMethod: "PAYOS",
      gateway: "PAYOS",
      gatewayReference: "PAYOS-T-88812301",
    });

    const webhookData = {
      orderCode: 88812301,
      amount: 1000000,
      description: "EDUNITY HP 88812301",
      accountNumber: "12345678",
      reference: "BANK_REF_LATE_003",
      transactionDateTime: new Date().toISOString(),
      currency: "VND",
      paymentLinkId: "plink_late_003",
      code: "00",
    };

    const signature = await payosService.signWebhookDataForChannel("TUITION", webhookData);
    const webhookRes = await request(app)
      .post("/api/payments/webhooks/payos/tuition")
      .send({ code: "00", desc: "Success", data: webhookData, signature });
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.data.reconciliationReason).toBe("LATE_PAYMENT_REVIEW");

    // Enrollment MUST remain EXPIRED
    const stillExpiredEnrollment = await Enrollment.findById(enrollment._id);
    expect(stillExpiredEnrollment.enrollmentStatus).toBe("EXPIRED");

    // Access must be DENIED
    const joinRes = await request(app)
      .post(`/api/sessions/${session1._id}/join`)
      .set(as(student));
    expect([400, 403]).toContain(joinRes.status);

    // Ledger records: UNAPPLIED_TUITION_RECEIPT (COMPLETED) & REFUND (PENDING)
    const receiptTx = await Transaction.findOne({ relatedPaymentId: payment._id, transactionType: "UNAPPLIED_TUITION_RECEIPT" });
    expect(receiptTx).not.toBeNull();
    expect(receiptTx.status).toBe("COMPLETED");

    const refundTx = await Transaction.findOne({ relatedPaymentId: payment._id, transactionType: "REFUND" });
    expect(refundTx).not.toBeNull();
    expect(refundTx.status).toBe("PENDING");
  });
});
