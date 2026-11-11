const request = require("supertest");
const mongoose = require("mongoose");
const { PayOS, ConnectionTimeoutError } = require("@payos/node");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Enrollment,
  Payment,
  ScholarshipCampaign,
  Scholarship,
  ScholarshipUsage,
  SponsorContribution,
  Transaction,
  TeacherEarning,
} = require("../src/models");
const payosService = require("../src/services/payosService");
const paymentService = require("../src/services/paymentService");
const contributionService = require("../src/services/contributionService");
const scholarshipPaymentService = require("../src/services/scholarshipPaymentService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({
  "x-user-id": user._id.toString(),
  "x-user-role": user.role,
});

describe("TIN-FIN-PR1: Unified payOS Payment Intent Engine (TUITION + DONATION)", () => {
  const originalEnv = { ...process.env };
  let admin, teacher, student, student2, sponsor, sponsor2;
  let category, subject, course, paidClass, freeClass, openCampaign;

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
    };
    payosService.resetPayosClient();
    await clearDB();

    admin = await User.create({
      email: "admin_pr1@test.com",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    });
    teacher = await User.create({
      email: "teacher_pr1@test.com",
      passwordHash: "x",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Teacher PR1", verificationStatus: "VERIFIED" },
    });
    student = await User.create({
      email: "student_pr1@test.com",
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student PR1" },
    });
    student2 = await User.create({
      email: "student2_pr1@test.com",
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student 2 PR1" },
    });
    sponsor = await User.create({
      email: "sponsor_pr1@test.com",
      passwordHash: "x",
      role: "SPONSOR",
      status: "ACTIVE",
      sponsorProfile: {
        sponsorType: "ORGANIZATION",
        organizationName: "Quỹ Vì Tương Lai",
        representativeName: "Nguyễn Văn A",
      },
    });
    sponsor2 = await User.create({
      email: "sponsor2_pr1@test.com",
      passwordHash: "x",
      role: "SPONSOR",
      status: "ACTIVE",
      sponsorProfile: {
        sponsorType: "INDIVIDUAL",
        representativeName: "Trần Thị B",
      },
    });

    category = await Category.create({
      name: "Toán học PR1",
      slug: "toan-pr1-" + Date.now(),
      createdBy: admin._id,
    });
    subject = await Subject.create({
      name: "Đại số PR1",
      slug: "dai-so-pr1-" + Date.now(),
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
    });
    course = await Course.create({
      title: "Toán 9 Nâng cao PR1",
      slug: "toan-9-pr1-" + Date.now(),
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      gradeLevel: "GRADE_9",
      createdBy: admin._id,
    });

    const now = Date.now();
    paidClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher PR1",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Toán 9 PAID",
      classType: "PAID",
      price: 600000,
      capacity: 20,
      status: "OPEN",
      enrollmentStart: new Date(now - 3600000),
      enrollmentEnd: new Date(now + 7 * 86400000),
      startDate: new Date(now + 10 * 86400000),
      endDate: new Date(now + 40 * 86400000),
    });

    freeClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher PR1",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Toán 9 FREE",
      classType: "FREE",
      price: 0,
      capacity: 20,
      status: "OPEN",
      enrollmentStart: new Date(now - 3600000),
      enrollmentEnd: new Date(now + 7 * 86400000),
      startDate: new Date(now + 10 * 86400000),
      endDate: new Date(now + 40 * 86400000),
    });

    openCampaign = await ScholarshipCampaign.create({
      createdBy: admin._id,
      title: "Chiến dịch Học bổng Vùng Cao",
      targetBudget: mongoose.Types.Decimal128.fromString("10000000"),
      fundedAmount: mongoose.Types.Decimal128.fromString("1000000"),
      allocatedAmount: mongoose.Types.Decimal128.fromString("0"),
      usedAmount: mongoose.Types.Decimal128.fromString("0"),
      expectedSlots: 10,
      awardAmountPerStudent: mongoose.Types.Decimal128.fromString("1000000"),
      status: "OPEN_FOR_FUNDING",
      fundingStart: new Date(now - 3600000),
      fundingEnd: new Date(now + 7 * 86400000),
      applicationStart: new Date(now - 3600000),
      applicationEnd: new Date(now + 7 * 86400000),
      scope: { courseIds: [course._id] },
    });
  });

  // ============================================================================
  // 1. LUỒNG TUITION (Học sinh đóng học phí)
  // ============================================================================
  describe("1. TUITION Flow (Học sinh đóng học phí)", () => {
    test("TUI-01: Tạo QR học phí hợp lệ cho lớp PAID với đúng amount, channel TUITION, hạn 15 phút khớp holdExpiresAt, không tự CONFIRMED Enrollment", async () => {
      const enrollRes = await request(app)
        .post(`/api/classes/${paidClass._id}/enrollments`)
        .set(as(student));
      expect(enrollRes.statusCode).toBe(201);
      const enrollmentId = enrollRes.body.data.id;

      // Client cố tình truyền amount=1, channelKey="DONATION", accountNumber="9999" để thử phá bảo mật
      const payRes = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student))
        .send({
          amount: 1,
          channelKey: "DONATION",
          purpose: "DONATION",
          accountNumber: "99999999",
        });

      expect(payRes.statusCode).toBe(201);
      const data = payRes.body.data;
      expect(data.paymentId).toBeDefined();
      expect(data.purpose).toBe("TUITION");
      expect(data.channelKey).toBe("TUITION");
      expect(data.provider).toBe("PAYOS");
      expect(data.amount).toBe("600000"); // Lấy đúng snapshot học phí từ Backend, bỏ qua amount=1 của client
      expect(data.currency).toBe("VND");
      expect(Number.isSafeInteger(data.orderCode)).toBe(true);
      expect(data.orderCode).toBeGreaterThan(100000000);
      expect(data.orderCode).toBeLessThan(200000000);
      expect(typeof data.qrCode).toBe("string");
      expect(data.qrCode).toContain("000201"); // Chuẩn EMVCo VietQR payload
      expect(typeof data.checkoutUrl).toBe("string");
      expect(data.paymentStatus).toBe("PENDING");
      expect(new Date(data.expiredAt).getTime()).toBe(new Date(data.holdExpiresAt).getTime());
      expect(data.remainingSeconds).toBeGreaterThan(800);
      expect(data.remainingSeconds).toBeLessThanOrEqual(900);

      // Tạo QR tuyệt đối KHÔNG làm Enrollment chuyển sang CONFIRMED hay sinh TeacherEarning / Transaction
      const dbEnrollment = await Enrollment.findById(enrollmentId);
      expect(dbEnrollment.enrollmentStatus).toBe("PENDING_PAYMENT");
      expect(await TeacherEarning.countDocuments({ enrollmentId })).toBe(0);
      expect(await Transaction.countDocuments({ relatedEnrollmentId: enrollmentId })).toBe(0);
    });

    test("TUI-02: Học bổng MIXED chỉ tạo QR thu đúng phần học phí còn thiếu (remainingDue)", async () => {
      const scholarship = await Scholarship.create({
        campaignId: openCampaign._id,
        applicationId: new mongoose.Types.ObjectId(),
        studentId: student._id,
        allocatedAmount: mongoose.Types.Decimal128.fromString("250000"),
        remainingAmount: mongoose.Types.Decimal128.fromString("250000"),
        validFrom: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        status: "ACTIVE",
      });

      const enrollRes = await request(app)
        .post(`/api/classes/${paidClass._id}/enrollments`)
        .set(as(student));
      const enrollmentId = enrollRes.body.data.id;

      const mixedRes = await request(app)
        .post(`/api/enrollments/${enrollmentId}/scholarship-payment`)
        .set(as(student))
        .send({ scholarshipId: scholarship._id });
      expect(mixedRes.statusCode).toBe(200);
      expect(mixedRes.body.data.paymentSource).toBe("MIXED");
      expect(mixedRes.body.data.remainingDue).toBe("350000");

      const payRes = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student));
      expect(payRes.statusCode).toBe(201);
      expect(payRes.body.data.amount).toBe("350000");
      expect(payRes.body.data.purpose).toBe("TUITION");
      expect(payRes.body.data.channelKey).toBe("TUITION");
    });

    test("TUI-03: Không tạo QR khi Enrollment đã hết hạn giữ chỗ (holdExpiresAt <= now) hoặc trạng thái EXPIRED/CONFIRMED", async () => {
      const expiredEnrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("600000"),
        holdExpiresAt: new Date(Date.now() - 1000),
      });

      const resExpired = await request(app)
        .post(`/api/enrollments/${expiredEnrollment._id}/payments`)
        .set(as(student));
      expect(resExpired.statusCode).toBe(409);
      expect(resExpired.body.error).toBe("ENROLLMENT_EXPIRED");

      // Lớp FREE không được tạo QR thanh toán
      const freeEnrollment = await Enrollment.create({
        classId: freeClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student2._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "FREE",
        tuitionAmount: mongoose.Types.Decimal128.fromString("0"),
        holdExpiresAt: new Date(Date.now() + 900000),
      });

      const resFree = await request(app)
        .post(`/api/enrollments/${freeEnrollment._id}/payments`)
        .set(as(student2));
      expect(resFree.statusCode).toBe(400);
    });

    test("TUI-04: Idempotency — học viên bấm tạo QR nhiều lần liên tiếp tái sử dụng đúng 1 Payment Intent đang hợp lệ, không kéo dài holdExpiresAt", async () => {
      const enrollRes = await request(app)
        .post(`/api/classes/${paidClass._id}/enrollments`)
        .set(as(student));
      const enrollmentId = enrollRes.body.data.id;

      const first = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student));
      const second = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student));
      const third = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student));

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(third.statusCode).toBe(201);

      expect(second.body.data.paymentId).toBe(first.body.data.paymentId);
      expect(third.body.data.paymentId).toBe(first.body.data.paymentId);
      expect(second.body.data.orderCode).toBe(first.body.data.orderCode);
      expect(second.body.data.holdExpiresAt).toBe(first.body.data.holdExpiresAt);

      const countInDb = await Payment.countDocuments({ enrollmentId });
      expect(countInDb).toBe(1);
    });
  });

  // ============================================================================
  // 2. LUỒNG DONATION (Mạnh Thường Quân chuyển khoản tài trợ)
  // ============================================================================
  describe("2. DONATION Flow (MTQ chuyển khoản tài trợ)", () => {
    test("DON-01: Tạo QR tài trợ hợp lệ với đúng amount, đúng channel DONATION, gắn đúng Campaign, hạn 15 phút độc lập với Enrollment, không tăng quỹ trước khi có webhook", async () => {
      const beforeCampaign = await ScholarshipCampaign.findById(openCampaign._id);
      expect(beforeCampaign.fundedAmount.toString()).toBe("1000000");

      // Sponsor cố tình truyền channelKey="TUITION" để kiểm tra Backend tự chọn kênh DONATION
      const res = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({
          amount: 500000,
          channelKey: "TUITION",
          purpose: "TUITION",
        });

      expect(res.statusCode).toBe(201);
      const data = res.body.data;
      expect(data.paymentId).toBeDefined();
      expect(data.contributionId).toBeDefined();
      expect(data.purpose).toBe("DONATION");
      expect(data.channelKey).toBe("DONATION");
      expect(data.provider).toBe("PAYOS");
      expect(data.amount).toBe("500000");
      expect(data.campaignId).toBe(openCampaign._id.toString());
      expect(data.enrollmentId).toBeNull();
      expect(Number.isSafeInteger(data.orderCode)).toBe(true);
      expect(data.orderCode).toBeGreaterThan(200000000);
      expect(typeof data.qrCode).toBe("string");
      expect(data.qrCode).toContain("DONATION");
      expect(typeof data.checkoutUrl).toBe("string");
      expect(data.paymentStatus).toBe("PENDING");
      expect(data.contributionStatus).toBe("PENDING");
      expect(data.remainingSeconds).toBeGreaterThan(800);
      expect(data.remainingSeconds).toBeLessThanOrEqual(900);

      // Quỹ chiến dịch tuyệt đối KHÔNG tăng khi chỉ mới tạo QR
      const afterCampaign = await ScholarshipCampaign.findById(openCampaign._id);
      expect(afterCampaign.fundedAmount.toString()).toBe("1000000");

      // Không bao giờ tạo Enrollment hay TeacherEarning từ DONATION
      expect(await Enrollment.countDocuments()).toBe(0);
      expect(await TeacherEarning.countDocuments()).toBe(0);
      expect(await Transaction.countDocuments({ transactionType: "SPONSOR_CONTRIBUTION" })).toBe(0);
    });

    test("DON-02: Hỗ trợ MTQ ẩn danh (isAnonymous=true) không làm lộ thông tin Sponsor trong response, và cho phép polling GET /api/payments/:id", async () => {
      const res = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({
          amount: 300000,
          isAnonymous: true,
        });

      expect(res.statusCode).toBe(201);
      const data = res.body.data;
      expect(data.isAnonymous).toBe(true);
      expect(data.donorDisplayName).toBe("Nhà tài trợ ẩn danh");

      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain(sponsor.email);
      expect(rawJson).not.toContain("Nguyễn Văn A");
      expect(rawJson).not.toContain("Quỹ Vì Tương Lai");
      expect(rawJson).not.toContain(sponsor._id.toString());

      // Sponsor sở hữu có thể polling GET /api/payments/:id, trạng thái vẫn là PENDING (không fake success)
      const pollOwn = await request(app)
        .get(`/api/payments/${data.paymentId}`)
        .set(as(sponsor));
      expect(pollOwn.statusCode).toBe(200);
      expect(pollOwn.body.data.purpose).toBe("DONATION");
      expect(pollOwn.body.data.channelKey).toBe("DONATION");
      expect(pollOwn.body.data.paymentStatus).toBe("PENDING");

      // Sponsor khác không xem được Payment Intent này (404)
      const pollOther = await request(app)
        .get(`/api/payments/${data.paymentId}`)
        .set(as(sponsor2));
      expect(pollOther.statusCode).toBe(404);
    });

    test("DON-03: Nhấn tạo QR tài trợ nhiều lần với cùng số tiền và chiến dịch tái sử dụng intent đang hợp lệ", async () => {
      const first = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 750000 });
      const second = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 750000 });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.body.data.paymentId).toBe(first.body.data.paymentId);
      expect(second.body.data.contributionId).toBe(first.body.data.contributionId);
      expect(second.body.data.orderCode).toBe(first.body.data.orderCode);

      expect(await SponsorContribution.countDocuments({ campaignId: openCampaign._id })).toBe(1);
    });
  });

  // ============================================================================
  // 3. SHARED ENGINE: 2 KÊNH PAYOS ĐỘC LẬP, CONCURRENCY 20 REQUESTS, TIMEOUT, NO SECRET LEAK
  // ============================================================================
  describe("3. Shared Payment Engine & Dual-Channel Security", () => {
    test("SHR-01: Hai channel TUITION và DONATION sử dụng bộ credentials độc lập, không nhầm channel khi retry và không lộ API key/checksumKey", async () => {
      process.env.PAYOS_ENABLED = "true";
      process.env.PAYOS_TUITION_CLIENT_ID = "tuition-client-id-secret-111";
      process.env.PAYOS_TUITION_API_KEY = "tuition-api-key-secret-222";
      process.env.PAYOS_TUITION_CHECKSUM_KEY = "tuition-checksum-secret-333";
      process.env.PAYOS_DONATION_CLIENT_ID = "donation-client-id-secret-444";
      process.env.PAYOS_DONATION_API_KEY = "donation-api-key-secret-555";
      process.env.PAYOS_DONATION_CHECKSUM_KEY = "donation-checksum-secret-666";
      payosService.resetPayosClient();

      const capturedCalls = [];
      const tuitionClient = payosService.getPayosClient("TUITION").client;
      const donationClient = payosService.getPayosClient("DONATION").client;

      expect(tuitionClient.clientId).toBe("tuition-client-id-secret-111");
      expect(tuitionClient.apiKey).toBe("tuition-api-key-secret-222");
      expect(donationClient.clientId).toBe("donation-client-id-secret-444");
      expect(donationClient.apiKey).toBe("donation-api-key-secret-555");
      expect(tuitionClient).not.toBe(donationClient);

      const spyTuition = jest
        .spyOn(tuitionClient.paymentRequests, "create")
        .mockImplementation(async (payload) => {
          capturedCalls.push({ channel: "TUITION", clientId: tuitionClient.clientId, payload });
          return {
            orderCode: payload.orderCode,
            paymentLinkId: `real_tuition_${payload.orderCode}`,
            qrCode: `000201010212_REAL_TUITION_${payload.orderCode}`,
            checkoutUrl: `https://pay.payos.vn/web/real_tuition_${payload.orderCode}`,
            expiredAt: payload.expiredAt,
            status: "PENDING",
            currency: "VND",
          };
        });

      const spyDonation = jest
        .spyOn(donationClient.paymentRequests, "create")
        .mockImplementation(async (payload) => {
          capturedCalls.push({ channel: "DONATION", clientId: donationClient.clientId, payload });
          return {
            orderCode: payload.orderCode,
            paymentLinkId: `real_donation_${payload.orderCode}`,
            qrCode: `000201010212_REAL_DONATION_${payload.orderCode}`,
            checkoutUrl: `https://pay.payos.vn/web/real_donation_${payload.orderCode}`,
            expiredAt: payload.expiredAt,
            status: "PENDING",
            currency: "VND",
          };
        });

      const enrollRes = await request(app)
        .post(`/api/classes/${paidClass._id}/enrollments`)
        .set(as(student));
      const enrollmentId = enrollRes.body.data.id;

      const tuitionRes = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student));
      expect(tuitionRes.statusCode).toBe(201);
      expect(tuitionRes.body.data.channelKey).toBe("TUITION");
      expect(tuitionRes.body.data.qrCode).toContain("REAL_TUITION");

      const donationRes = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 250000 });
      expect(donationRes.statusCode).toBe(201);
      expect(donationRes.body.data.channelKey).toBe("DONATION");
      expect(donationRes.body.data.qrCode).toContain("REAL_DONATION");

      // Giả lập TUITION payment đầu tiên FAILED rồi học viên retry -> vẫn dùng đúng channel TUITION
      await Payment.updateOne(
        { _id: tuitionRes.body.data.paymentId },
        { $set: { paymentStatus: "FAILED" } }
      );
      const tuitionRetryRes = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student));
      expect(tuitionRetryRes.statusCode).toBe(201);
      expect(tuitionRetryRes.body.data.channelKey).toBe("TUITION");
      expect(tuitionRetryRes.body.data.orderCode).not.toBe(tuitionRes.body.data.orderCode);

      expect(capturedCalls).toHaveLength(3);
      expect(capturedCalls[0].channel).toBe("TUITION");
      expect(capturedCalls[1].channel).toBe("DONATION");
      expect(capturedCalls[2].channel).toBe("TUITION");

      // Kiểm tra tuyệt đối không lộ bất kỳ secret nào trong mọi response
      const combinedResponseText = JSON.stringify({
        tuition: tuitionRes.body,
        donation: donationRes.body,
        retry: tuitionRetryRes.body,
      });
      for (const secret of [
        "tuition-client-id-secret-111",
        "tuition-api-key-secret-222",
        "tuition-checksum-secret-333",
        "donation-client-id-secret-444",
        "donation-api-key-secret-555",
        "donation-checksum-secret-666",
      ]) {
        expect(combinedResponseText).not.toContain(secret);
      }

      spyTuition.mockRestore();
      spyDonation.mockRestore();
    });

    test("SHR-02: 20 yêu cầu đồng thời (concurrent requests) không bao giờ tạo orderCode trùng và không tạo duplicate intent cho cùng Enrollment", async () => {
      // Phần A: 20 requests đồng thời vào CÙNG 1 Enrollment -> chỉ tạo đúng 1 Payment Intent & 1 orderCode
      const enrollRes = await request(app)
        .post(`/api/classes/${paidClass._id}/enrollments`)
        .set(as(student));
      const enrollmentId = enrollRes.body.data.id;

      const sameEnrollmentResults = await Promise.all(
        Array.from({ length: 20 }, () =>
          paymentService.createTuitionPaymentIntent(student._id, enrollmentId)
        )
      );

      const uniquePaymentIds = new Set(sameEnrollmentResults.map((p) => p._id.toString()));
      const uniqueOrderCodesSame = new Set(sameEnrollmentResults.map((p) => p.orderCode));
      expect(uniquePaymentIds.size).toBe(1);
      expect(uniqueOrderCodesSame.size).toBe(1);
      expect(await Payment.countDocuments({ enrollmentId, paymentStatus: "PENDING" })).toBe(1);

      // Phần B: 20 lần cấp phát orderCode đồng thời (10 TUITION + 10 DONATION) -> 20 orderCode hoàn toàn duy nhất
      const allocatedCodes = await Promise.all(
        Array.from({ length: 20 }, (_, idx) =>
          paymentService.allocateOrderCode(idx % 2 === 0 ? "TUITION" : "DONATION")
        )
      );
      const uniqueAllocated = new Set(allocatedCodes);
      expect(uniqueAllocated.size).toBe(20);
      for (const code of allocatedCodes) {
        expect(Number.isSafeInteger(code)).toBe(true);
        expect(code).toBeGreaterThan(0);
      }
    });

    test("SHR-03: Provider timeout & Provider error được xử lý an toàn (504 / 502), không lưu bản ghi PENDING lỗi và không lộ API key trong thông báo lỗi", async () => {
      process.env.PAYOS_ENABLED = "true";
      process.env.PAYOS_TUITION_CLIENT_ID = "tuition-cid-secret-999";
      process.env.PAYOS_TUITION_API_KEY = "tuition-apikey-secret-999";
      process.env.PAYOS_TUITION_CHECKSUM_KEY = "tuition-csum-secret-999";
      payosService.resetPayosClient();

      const enrollRes = await request(app)
        .post(`/api/classes/${paidClass._id}/enrollments`)
        .set(as(student));
      const enrollmentId = enrollRes.body.data.id;

      const tuitionClient = payosService.getPayosClient("TUITION").client;
      const spyCreate = jest
        .spyOn(tuitionClient.paymentRequests, "create")
        .mockRejectedValueOnce(new ConnectionTimeoutError({ message: "Request timed out" }))
        .mockRejectedValueOnce(
          new Error("Auth failed for key tuition-apikey-secret-999 on gateway")
        );

      // Lần 1: Timeout -> 504 PAYOS_TIMEOUT
      const timeoutRes = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student));
      expect(timeoutRes.statusCode).toBe(504);
      expect(timeoutRes.body.error).toBe("PAYOS_TIMEOUT");

      // Lần 2: Provider Error có chứa chuỗi secret -> 502 PAYOS_PROVIDER_ERROR và đã redact secret
      const errorRes = await request(app)
        .post(`/api/enrollments/${enrollmentId}/payments`)
        .set(as(student));
      expect(errorRes.statusCode).toBe(502);
      expect(errorRes.body.error).toBe("PAYOS_PROVIDER_ERROR");
      expect(JSON.stringify(errorRes.body)).not.toContain("tuition-apikey-secret-999");
      expect(errorRes.body.message).toContain("[REDACTED]");

      // Không có bản ghi Payment rác nào được lưu trong DB và Enrollment vẫn là PENDING_PAYMENT
      expect(await Payment.countDocuments({ enrollmentId })).toBe(0);
      const dbEnrollment = await Enrollment.findById(enrollmentId);
      expect(dbEnrollment.enrollmentStatus).toBe("PENDING_PAYMENT");

      spyCreate.mockRestore();
    });
  });
});
