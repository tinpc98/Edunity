const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const { User, AuditLog, RefreshToken, Notification, TokenRevocationTask } = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const authTokenService = require("../src/services/authTokenService");
const tokenRevocationService = require("../src/services/tokenRevocationService");
const { signAccessToken } = require("../src/utils/jwt");

const as = (user) => ({ "x-user-id": user._id.toString() });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe("TASK BE-USER-FIX-02: Durable Token Revocation & Concurrency Suite", () => {
  let admin, teacher, student;
  const password = "password123";

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    const passwordHash = hashPassword(password);

    admin = await User.create({
      email: "admin@edunity.vn",
      passwordHash,
      role: "ADMIN",
      studentProfile: { fullName: "Super Admin" },
    });

    teacher = await User.create({
      email: "teacher@edunity.vn",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Teacher One", verificationStatus: "VERIFIED" },
    });

    student = await User.create({
      email: "student@edunity.vn",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student One" },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. TOKEN REVOCATION & WORKER (TC 1 - 8)
  // =========================================================================
  describe("1. Token Revocation & Worker (TC 1 - 8)", () => {
    it("1. Khóa User -> tạo task durable và revoke thành công", async () => {
      // Cấp refresh token cho sinh viên
      await authTokenService.issueRefreshToken(student._id);
      const activeTokensBefore = await RefreshToken.find({ userId: student._id, revokedAt: null });
      expect(activeTokensBefore.length).toBe(1);

      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Vi phạm nghiêm trọng chính sách bảo mật" });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("BANNED");

      // Kiểm tra task được tạo trong DB và hoàn thành
      const task = await TokenRevocationTask.findOne({ userId: student._id });
      expect(task).not.toBeNull();
      expect(task.targetStatus).toBe("BANNED");
      expect(task.status).toBe("COMPLETED");
      expect(task.revokedCount).toBe(1);
      expect(task.completedAt).toBeDefined();

      // Refresh token đã bị thu hồi
      const activeTokensAfter = await RefreshToken.find({ userId: student._id, revokedAt: null });
      expect(activeTokensAfter.length).toBe(0);
    });

    it("2. Tạm ngưng User -> tạo task durable và revoke thành công", async () => {
      await authTokenService.issueRefreshToken(teacher._id);

      const res = await request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Tạm ngưng để điều tra điểm danh" });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("SUSPENDED");

      const task = await TokenRevocationTask.findOne({ userId: teacher._id });
      expect(task).not.toBeNull();
      expect(task.targetStatus).toBe("SUSPENDED");
      expect(task.status).toBe("COMPLETED");

      const activeTokens = await RefreshToken.find({ userId: teacher._id, revokedAt: null });
      expect(activeTokens.length).toBe(0);
    });

    it("3. Revoke thất bại tạm thời -> retry thành công qua worker sweep", async () => {
      await authTokenService.issueRefreshToken(student._id);

      // Tạo một task PENDING nhân tạo
      const task = await tokenRevocationService.recordRevocationTask({
        userId: student._id,
        targetStatus: "BANNED",
        reason: "Test transient failure",
        revokeBefore: new Date(),
      });

      // Lần 1: Giả lập RefreshToken.updateMany bị lỗi mạng
      jest.spyOn(RefreshToken, "updateMany").mockRejectedValueOnce(new Error("Mongo socket timeout"));

      const res1 = await tokenRevocationService.processTask(task);
      expect(res1.success).toBe(false);

      const taskAfterFail = await TokenRevocationTask.findById(task._id);
      expect(taskAfterFail.status).toBe("PENDING");
      expect(taskAfterFail.attempts).toBe(1);
      expect(taskAfterFail.lastError).toBe("Mongo socket timeout");
      expect(taskAfterFail.nextRunAt.getTime()).toBeGreaterThan(Date.now() - 1000);

      // Lần 2: Chạy worker sweep (với time đẩy lên để vượt qua backoff)
      const sweepNow = new Date(Date.now() + 5000);
      const sweepRes = await tokenRevocationService.runTokenRevocationSweep(sweepNow);
      expect(sweepRes.processed).toBe(1);

      const taskAfterSuccess = await TokenRevocationTask.findById(task._id);
      expect(taskAfterSuccess.status).toBe("COMPLETED");
      expect(taskAfterSuccess.revokedCount).toBe(1);

      const activeTokens = await RefreshToken.find({ userId: student._id, revokedAt: null });
      expect(activeTokens.length).toBe(0);
    });

    it("4. Revoke thất bại liên tục -> chuyển trạng thái FAILED và giữ nguyên log lỗi", async () => {
      const task = await tokenRevocationService.recordRevocationTask({
        userId: student._id,
        targetStatus: "BANNED",
        reason: "Persistent failure test",
        revokeBefore: new Date(),
        maxAttempts: 3,
      });

      // Giả lập lỗi liên tục
      jest.spyOn(RefreshToken, "updateMany").mockRejectedValue(new Error("Persistent database corruption"));

      // Chạy 3 lần
      for (let i = 1; i <= 3; i++) {
        await tokenRevocationService.processTask(task);
      }

      const finalTask = await TokenRevocationTask.findById(task._id);
      expect(finalTask.status).toBe("FAILED");
      expect(finalTask.attempts).toBe(3);
      expect(finalTask.lastError).toBe("Persistent database corruption");
      // Task không bao giờ bị xóa khỏi DB
      expect(finalTask).toBeDefined();
    });

    it("5. Server restart -> worker mới quét và xử lý thành công task còn tồn tại trong DB", async () => {
      await authTokenService.issueRefreshToken(student._id);

      // Tạo một task PENDING lưu trong DB (mô phỏng server bị crash ngay sau commit)
      await tokenRevocationService.recordRevocationTask({
        userId: student._id,
        targetStatus: "BANNED",
        reason: "Crash recovery test",
        revokeBefore: new Date(),
      });

      // Worker mới tinh (không có context cũ trong RAM) quét DB
      const freshWorkerNow = new Date();
      const sweepRes = await tokenRevocationService.runTokenRevocationSweep(freshWorkerNow, {
        workerId: "worker-after-reboot",
      });

      expect(sweepRes.processed).toBe(1);

      const taskInDb = await TokenRevocationTask.findOne({ userId: student._id });
      expect(taskInDb.status).toBe("COMPLETED");
      expect(taskInDb.revokedCount).toBe(1);
    });

    it("6. Hai worker xử lý đồng thời không xung đột và không xử lý trùng", async () => {
      // Tạo 2 task pending
      const task1 = await tokenRevocationService.recordRevocationTask({
        userId: student._id,
        targetStatus: "BANNED",
        revokeBefore: new Date(),
      });
      const task2 = await tokenRevocationService.recordRevocationTask({
        userId: teacher._id,
        targetStatus: "SUSPENDED",
        revokeBefore: new Date(),
      });

      // Worker 1 và Worker 2 cùng claim
      const claim1 = tokenRevocationService.claimNextPendingTask(new Date(), 30000, "worker-1");
      const claim2 = tokenRevocationService.claimNextPendingTask(new Date(), 30000, "worker-2");

      const [claimed1, claimed2] = await Promise.all([claim1, claim2]);

      expect(claimed1).not.toBeNull();
      expect(claimed2).not.toBeNull();
      // Phải claim 2 task khác nhau
      expect(claimed1._id.toString()).not.toBe(claimed2._id.toString());
      expect([claimed1.lockedBy, claimed2.lockedBy].sort()).toEqual(["worker-1", "worker-2"]);
    });

    it("7. Request khóa lặp lại: flush task cũ, không tạo duplicate task hoặc duplicate audit", async () => {
      // Khóa lần 1
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Khóa lần 1" });

      const taskCount1 = await TokenRevocationTask.countDocuments({ userId: student._id });
      const auditCount1 = await AuditLog.countDocuments({ targetId: student._id, action: "USER_BANNED" });
      expect(taskCount1).toBe(1);
      expect(auditCount1).toBe(1);

      // Cấp 1 refresh token mới nhân tạo (giả lập sót token)
      await authTokenService.issueRefreshToken(student._id);

      // Gửi lại request khóa lần 2 (lặp lại)
      const res2 = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Khóa lần 1 lặp lại" });

      expect(res2.statusCode).toBe(200);

      // Không tạo thêm task mới hay audit mới
      const taskCount2 = await TokenRevocationTask.countDocuments({ userId: student._id });
      const auditCount2 = await AuditLog.countDocuments({ targetId: student._id, action: "USER_BANNED" });
      expect(taskCount2).toBe(1);
      expect(auditCount2).toBe(1);

      // Token sót đã được thu hồi
      const activeTokens = await RefreshToken.find({ userId: student._id, revokedAt: null });
      expect(activeTokens.length).toBe(0);
    });

    it("8. Revoke idempotent: gọi processTask nhiều lần trên cùng 1 task cho kết quả nhất quán", async () => {
      await authTokenService.issueRefreshToken(student._id);

      const task = await tokenRevocationService.recordRevocationTask({
        userId: student._id,
        targetStatus: "BANNED",
        revokeBefore: new Date(),
      });

      const res1 = await tokenRevocationService.processTask(task);
      expect(res1.success).toBe(true);
      expect(res1.revokedCount).toBe(1);

      // Chạy lại lần 2
      const res2 = await tokenRevocationService.processTask(task);
      expect(res2.success).toBe(true);
      expect(res2.alreadyCompleted).toBe(true);
    });
  });

  // =========================================================================
  // 2. TRANSACTION INTEGRITY (TC 9 - 12)
  // =========================================================================
  describe("2. Transaction Integrity (TC 9 - 12)", () => {
    it("9. User update thất bại -> không tạo TokenRevocationTask", async () => {
      // Gửi request thiếu lý do khi khóa tài khoản (validation error)
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED" }); // Thiếu reason

      expect(res.statusCode).toBe(400);

      const taskCount = await TokenRevocationTask.countDocuments({ userId: student._id });
      expect(taskCount).toBe(0);
    });

    it("10. AuditLog thất bại -> rollback toàn bộ User status và TokenRevocationTask", async () => {
      // Giả lập lỗi tại AuditLog bên trong transaction
      jest.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("Audit database failure"));

      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Lý do gây lỗi" });

      expect(res.statusCode).toBe(500);

      // User status không đổi
      const userInDb = await User.findById(student._id);
      expect(userInDb.status).toBe("ACTIVE");

      // Task không tồn tại
      const tasks = await TokenRevocationTask.find({ userId: student._id });
      expect(tasks.length).toBe(0);
    });

    it("11. Transaction commit thành công -> TokenRevocationTask chắc chắn tồn tại", async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Khóa hợp lệ" });

      expect(res.statusCode).toBe(200);

      const task = await TokenRevocationTask.findOne({ userId: student._id });
      expect(task).not.toBeNull();
      expect(task.targetStatus).toBe("BANNED");
      expect(task.reason).toBe("Khóa hợp lệ");
    });

    it("12. Không có partial write: User document, AuditLog, và TokenRevocationTask luôn nhất quán", async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Đang kiểm tra tính nhất quán" });

      expect(res.statusCode).toBe(200);

      const user = await User.findById(student._id);
      const audit = await AuditLog.findOne({ targetId: student._id, action: "USER_SUSPENDED" });
      const task = await TokenRevocationTask.findOne({ userId: student._id });

      expect(user.status).toBe("SUSPENDED");
      expect(audit).not.toBeNull();
      expect(task).not.toBeNull();
      expect(task.targetStatus).toBe("SUSPENDED");
    });
  });

  // =========================================================================
  // 3. AUTHENTICATION & SESSION ISOLATION (TC 13 - 18)
  // =========================================================================
  describe("3. Authentication & Session Isolation (TC 13 - 18)", () => {
    it("13. Access token của BANNED bị authMiddleware từ chối 403 ACCOUNT_BLOCKED", async () => {
      const accessToken = signAccessToken(student);

      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Bị khóa" });

      const res = await request(app)
        .get("/api/me/profile")
        .set(bearer(accessToken));

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe("ACCOUNT_BLOCKED");
    });

    it("14. Refresh token của BANNED bị từ chối 401 INVALID_REFRESH_TOKEN hoặc 403 ACCOUNT_BLOCKED", async () => {
      const { token } = await authTokenService.issueRefreshToken(student._id);

      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Bị khóa" });

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: token });

      expect([401, 403]).toContain(res.statusCode);
      expect(["INVALID_REFRESH_TOKEN", "ACCOUNT_BLOCKED"]).toContain(res.body.error);
    });

    it("15. Access token của SUSPENDED bị authMiddleware từ chối 403 ACCOUNT_BLOCKED", async () => {
      const accessToken = signAccessToken(teacher);

      await request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Tạm đình chỉ" });

      const res = await request(app)
        .get("/api/me/profile")
        .set(bearer(accessToken));

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe("ACCOUNT_BLOCKED");
    });

    it("16. Refresh token của SUSPENDED bị từ chối 401 INVALID_REFRESH_TOKEN hoặc 403 ACCOUNT_BLOCKED", async () => {
      const { token } = await authTokenService.issueRefreshToken(teacher._id);

      await request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Tạm đình chỉ" });

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: token });

      expect([401, 403]).toContain(res.statusCode);
      expect(["INVALID_REFRESH_TOKEN", "ACCOUNT_BLOCKED"]).toContain(res.body.error);
    });

    it("17. User ACTIVE đăng nhập và sử dụng token bình thường", async () => {
      const accessToken = signAccessToken(student);
      const res = await request(app)
        .get("/api/me/profile")
        .set(bearer(accessToken));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.email).toBe("student@edunity.vn");
    });

    it("18. Kích hoạt lại tài khoản sau khi khóa: worker cũ KHÔNG thu hồi nhầm token của phiên mới", async () => {
      // T1: User bị khóa tại thời điểm t1
      const t1 = new Date(Date.now() - 60000); // 1 phút trước
      student.status = "BANNED";
      await student.save();

      // Giả lập task revocation được tạo tại T1 nhưng bị pending
      const pendingTask = await tokenRevocationService.recordRevocationTask({
        userId: student._id,
        targetStatus: "BANNED",
        reason: "Cũ",
        revokeBefore: t1,
      });

      // T2: Admin mở khóa tài khoản
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "ACTIVE" });

      // T3: Sinh viên đăng nhập lại và nhận RefreshToken mới (thời gian phát hành > T1)
      const { token: newRefreshToken, record: newRecord } = await authTokenService.issueRefreshToken(student._id);
      expect(newRecord.createdAt.getTime()).toBeGreaterThan(t1.getTime());

      // T4: Worker cũ chạy lại để xử lý task còn sót từ T1
      const resTask = await tokenRevocationService.processTask(pendingTask);
      expect(resTask.success).toBe(true);

      // KIỂM TRA QUYẾT ĐỊNH: Token mới tại T3 KHÔNG bị thu hồi!
      const refreshedDoc = await RefreshToken.findById(newRecord._id);
      expect(refreshedDoc.revokedAt).toBeNull();

      // Sinh viên vẫn có thể refresh token mới thành công!
      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: newRefreshToken });

      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
    });
  });
});
