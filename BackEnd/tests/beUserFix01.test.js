const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const { User, AuditLog, RefreshToken, Notification } = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const auditService = require("../src/services/auditService");
const authTokenService = require("../src/services/authTokenService");
const { signAccessToken } = require("../src/utils/jwt");

const as = (user) => ({ "x-user-id": user._id.toString() });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe("TASK BE-USER-FIX-01: Legacy Status Reason & Post-Commit Reliability", () => {
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
  // FIX-01: LEGACY AUDIT MATCHING
  // =========================================================================
  describe("FIX-01: Legacy Audit Matching", () => {
    it("1. Legacy user với 1 chu kỳ khóa duy nhất: lấy lý do và admin từ AuditLog", async () => {
      const legacyUser = await User.create({
        email: "legacy1@edunity.vn",
        passwordHash: hashPassword(password),
        role: "STUDENT",
        status: "BANNED",
      });

      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_BANNED",
        targetType: "User",
        targetId: legacyUser._id,
        beforeState: { status: "ACTIVE" },
        afterState: { status: "BANNED", reason: "Legacy single cycle ban reason" },
        createdAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/admin/users/${legacyUser._id}`)
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.statusReason).toBe("Legacy single cycle ban reason");
      expect(res.body.data.statusChangedBy).toMatchObject({
        id: admin._id.toString(),
        email: admin.email,
      });
    });

    it("2. Legacy user với nhiều chu kỳ (ACTIVE -> BANNED -> ACTIVE -> BANNED): lấy lý do từ chu kỳ hiện tại, không lấy lý do cũ", async () => {
      const multiCycleUser = await User.create({
        email: "multicycle@edunity.vn",
        passwordHash: hashPassword(password),
        role: "STUDENT",
        status: "BANNED",
      });

      const now = Date.now();
      // Chu kỳ 1: Khóa đợt 1
      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_BANNED",
        targetType: "User",
        targetId: multiCycleUser._id,
        beforeState: { status: "ACTIVE" },
        afterState: { status: "BANNED", reason: "Lý do khóa đợt 1 (Cũ)" },
        createdAt: new Date(now - 3600000 * 3), // 3 hours ago
      });

      // Mở khóa giữa kỳ
      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_ACTIVE",
        targetType: "User",
        targetId: multiCycleUser._id,
        beforeState: { status: "BANNED" },
        afterState: { status: "ACTIVE", reason: null },
        createdAt: new Date(now - 3600000 * 2), // 2 hours ago
      });

      // Chu kỳ 2: Khóa đợt 2 (mới nhất)
      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_BANNED",
        targetType: "User",
        targetId: multiCycleUser._id,
        beforeState: { status: "ACTIVE" },
        afterState: { status: "BANNED", reason: "Lý do khóa đợt 2 (Hiện tại)" },
        createdAt: new Date(now - 3600000), // 1 hour ago
      });

      const res = await request(app)
        .get(`/api/admin/users/${multiCycleUser._id}`)
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.statusReason).toBe("Lý do khóa đợt 2 (Hiện tại)");
      expect(res.body.data.statusReason).not.toBe("Lý do khóa đợt 1 (Cũ)");
    });

    it("3. Legacy audit không khớp trạng thái hiện tại (BANNED -> ACTIVE trong audit nhưng DB là BANNED): trả null", async () => {
      const inconsistentUser = await User.create({
        email: "inconsistent@edunity.vn",
        passwordHash: hashPassword(password),
        role: "STUDENT",
        status: "BANNED", // User trong DB là BANNED
      });

      const now = Date.now();
      // Audit 1: BANNED với lý do cũ
      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_BANNED",
        targetType: "User",
        targetId: inconsistentUser._id,
        beforeState: { status: "ACTIVE" },
        afterState: { status: "BANNED", reason: "Lý do khóa thời xa xưa" },
        createdAt: new Date(now - 7200000),
      });

      // Audit 2: Mở khóa USER_ACTIVE (log trạng thái gần nhất)
      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_ACTIVE",
        targetType: "User",
        targetId: inconsistentUser._id,
        beforeState: { status: "BANNED" },
        afterState: { status: "ACTIVE", reason: null },
        createdAt: new Date(now - 3600000),
      });

      // User bị khóa mà không có audit log tương ứng cho chu kỳ này
      const res = await request(app)
        .get(`/api/admin/users/${inconsistentUser._id}`)
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      // Phải trả null, tuyệt đối không lấy "Lý do khóa thời xa xưa" xuyên qua lần USER_ACTIVE
      expect(res.body.data.statusReason).toBeNull();

      // Trường hợp tương tự: User là SUSPENDED nhưng log gần nhất là USER_BANNED
      const mismatchUser = await User.create({
        email: "mismatch@edunity.vn",
        passwordHash: hashPassword(password),
        role: "STUDENT",
        status: "SUSPENDED",
      });

      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_BANNED",
        targetType: "User",
        targetId: mismatchUser._id,
        beforeState: { status: "ACTIVE" },
        afterState: { status: "BANNED", reason: "Bị cấm vĩnh viễn lúc trước" },
        createdAt: new Date(),
      });

      const resMismatch = await request(app)
        .get(`/api/admin/users/${mismatchUser._id}`)
        .set(as(admin));

      expect(resMismatch.statusCode).toBe(200);
      expect(resMismatch.body.data.statusReason).toBeNull();
    });
  });

  // =========================================================================
  // FIX-02: POST-COMMIT SIDE-EFFECTS & RELIABILITY
  // =========================================================================
  describe("FIX-02: Post-Commit Side Effects & Reliability", () => {
    it("4. Post-commit revoke token failure: Status đã commit, API trả 200, access token bị chặn với 403 ACCOUNT_BLOCKED", async () => {
      // 1. Tạo JWT access token cho sinh viên
      const accessToken = signAccessToken(student);

      // Kiểm tra access token hoạt động trước khi khóa
      const profileBefore = await request(app)
        .get("/api/me/profile")
        .set(bearer(accessToken));
      expect(profileBefore.statusCode).toBe(200);

      // 2. Giả lập lỗi tại authTokenService.revokeAllForUser sau commit
      jest.spyOn(authTokenService, "revokeAllForUser").mockRejectedValue(
        new Error("Redis/Mongo timeout during token revocation")
      );

      // 3. Khóa tài khoản
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Gian lận thi cử có tổ chức" });

      // API phải thành công 200 OK (không bị 500 unhandled)
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("BANNED");

      // Trạng thái trong DB đã commit
      const userInDb = await User.findById(student._id);
      expect(userInDb.status).toBe("BANNED");
      expect(userInDb.statusReason).toBe("Gian lận thi cử có tổ chức");

      // AuditLog đã được ghi thành công
      const audit = await AuditLog.findOne({ targetId: student._id, action: "USER_BANNED" });
      expect(audit).not.toBeNull();

      // 4. Access token của người dùng bị authMiddleware chặn ngay lập tức với 403 ACCOUNT_BLOCKED
      const profileAfter = await request(app)
        .get("/api/me/profile")
        .set(bearer(accessToken));
      expect(profileAfter.statusCode).toBe(403);
      expect(profileAfter.body.error).toBe("ACCOUNT_BLOCKED");
    });

    it("5. Retry revoke token: safeRevokeAllForUser thử lại thành công sau lần đầu lỗi", async () => {
      // Tạo refresh token cho sinh viên
      await authTokenService.issueRefreshToken(student._id);
      const tokensBefore = await RefreshToken.find({ userId: student._id, revokedAt: null });
      expect(tokensBefore.length).toBe(1);

      // Mock revokeAllForUser: lần 1 lỗi, lần 2 thành công
      let attempts = 0;
      const realRevoke = authTokenService.revokeAllForUser;
      jest.spyOn(authTokenService, "revokeAllForUser").mockImplementation(async (userId) => {
        attempts++;
        if (attempts === 1) {
          throw new Error("Transient network glitch");
        }
        return realRevoke(userId);
      });

      const result = await authTokenService.safeRevokeAllForUser(student._id, 3, 10);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);

      // Refresh token đã được thu hồi
      const tokensAfter = await RefreshToken.find({ userId: student._id, revokedAt: null });
      expect(tokensAfter.length).toBe(0);
    });

    it("6. Post-commit notification failure: Kích hoạt lại tài khoản thành công, không rollback trạng thái", async () => {
      // Đặt user thành SUSPENDED trước
      student.status = "SUSPENDED";
      student.statusReason = "Lỗi tạm thời";
      student.statusChangedAt = new Date();
      student.statusChangedBy = admin._id;
      await student.save();

      // Giả lập Notification.create bị lỗi
      jest.spyOn(Notification, "create").mockRejectedValue(new Error("Notification DB write failure"));

      // Kích hoạt lại tài khoản
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "ACTIVE" });

      // Phản hồi vẫn thành công 200 OK
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("ACTIVE");
      expect(res.body.data.statusReason).toBeNull();

      // DB đã commit trạng thái ACTIVE
      const userInDb = await User.findById(student._id);
      expect(userInDb.status).toBe("ACTIVE");
      expect(userInDb.statusReason).toBeNull();

      // AuditLog USER_ACTIVE đã được tạo
      const audit = await AuditLog.findOne({ targetId: student._id, action: "USER_ACTIVE" });
      expect(audit).not.toBeNull();
    });

    it("7. Repeated request sau post-commit failure (Idempotent Recovery): thu hồi token còn sót, không tạo duplicate audit", async () => {
      // Đặt user là BANNED
      student.status = "BANNED";
      student.statusReason = "Lý do đã khóa";
      student.statusChangedAt = new Date();
      student.statusChangedBy = admin._id;
      await student.save();

      // Tạo AuditLog ban đầu cho lần khóa này
      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_BANNED",
        targetType: "User",
        targetId: student._id,
        beforeState: { status: "ACTIVE" },
        afterState: { status: "BANNED", reason: "Lý do đã khóa" },
      });

      // Tạo 1 RefreshToken chưa thu hồi (sót lại từ lỗi post-commit lần trước)
      await authTokenService.issueRefreshToken(student._id);
      const unrevokedBefore = await RefreshToken.countDocuments({ userId: student._id, revokedAt: null });
      expect(unrevokedBefore).toBe(1);

      const auditCountBefore = await AuditLog.countDocuments({ targetId: student._id, action: "USER_BANNED" });
      expect(auditCountBefore).toBe(1);

      // Gửi lại request khóa tài khoản (lặp lại)
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Lặp lại request khóa" });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("BANNED");

      // Idempotent recovery đã thu hồi token còn sót
      const unrevokedAfter = await RefreshToken.countDocuments({ userId: student._id, revokedAt: null });
      expect(unrevokedAfter).toBe(0);

      // Không tạo duplicate AuditLog
      const auditCountAfter = await AuditLog.countDocuments({ targetId: student._id, action: "USER_BANNED" });
      expect(auditCountAfter).toBe(1);
    });

    it("8. Transaction rollback khi lỗi trong transaction: Rollback User status, không tạo AuditLog", async () => {
      // Giả lập lỗi trong User.findOneAndUpdate khi đang chạy transaction
      jest.spyOn(User, "findOneAndUpdate").mockRejectedValueOnce(new Error("Mongo connection error in transaction"));

      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Lý do gây lỗi transaction" });

      expect(res.statusCode).toBe(500);

      // Trạng thái trong DB phải được rollback về ACTIVE
      const userInDb = await User.findById(student._id);
      expect(userInDb.status).toBe("ACTIVE");
      expect(userInDb.statusReason).toBeNull();

      // Không có AuditLog nào được tạo
      const auditLogs = await AuditLog.find({ targetId: student._id });
      expect(auditLogs.length).toBe(0);
    });

    it("9. Concurrent status update: Conditional update ngăn chặn dirty write conflict", async () => {
      // Giả lập Admin 1 và Admin 2 cùng cố gắng thay đổi trạng thái đồng thời
      // Admin 1 sửa thành SUSPENDED
      const p1 = request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Admin 1 tạm khóa" });

      // Admin 2 sửa thành BANNED
      const p2 = request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Admin 2 khóa vĩnh viễn" });

      const [res1, res2] = await Promise.all([p1, p2]);

      // Cả hai request không được làm corrupt dữ liệu: 1 request thành công, request còn lại hoặc 200 hoặc 409 conflict
      const statuses = [res1.statusCode, res2.statusCode];
      expect(statuses).toContain(200);

      const userInDb = await User.findById(student._id);
      expect(["SUSPENDED", "BANNED"]).toContain(userInDb.status);
    });

    it("10. Authentication and Authorization regression", async () => {
      // 10.1 Request không xác thực (invalid token) trả 401 UNAUTHORIZED
      const resUnauth = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(bearer("invalid.jwt.token"))
        .send({ status: "BANNED", reason: "No auth" });
      expect(resUnauth.statusCode).toBe(401);
      expect(resUnauth.body.error).toBe("UNAUTHORIZED");

      // 10.2 Request từ non-admin (STUDENT) trả 403 FORBIDDEN
      const resNonAdmin = await request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(student))
        .send({ status: "BANNED", reason: "Học sinh không thể ban giáo viên" });
      expect(resNonAdmin.statusCode).toBe(403);
      expect(resNonAdmin.body.error).toBe("FORBIDDEN");

      // 10.3 Request từ user ACTIVE xem thông tin cá nhân bình thường
      const resActive = await request(app)
        .get("/api/me/profile")
        .set(as(student));
      expect(resActive.statusCode).toBe(200);
      expect(resActive.body.data.email).toBe("student@edunity.vn");
    });
  });
});
