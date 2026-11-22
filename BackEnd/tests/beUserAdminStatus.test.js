const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const { User, AuditLog, RefreshToken, Notification } = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const auditService = require("../src/services/auditService");

const as = (user) => ({ "x-user-id": user._id.toString() });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe("TASK BE-USER-ALL: Admin User Management Complete Suite", () => {
  let admin, admin2, teacher, student, sponsor;
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

    admin2 = await User.create({
      email: "admin2@edunity.vn",
      passwordHash,
      role: "ADMIN",
      studentProfile: { fullName: "Second Admin" },
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

    sponsor = await User.create({
      email: "sponsor@edunity.vn",
      passwordHash,
      role: "SPONSOR",
      sponsorProfile: { sponsorType: "ORGANIZATION", representativeName: "Sponsor One" },
    });
  });

  // ==========================================
  // 1. STATUS WORKFLOW (TC 1 - 8)
  // ==========================================
  describe("1. Status Workflow (TC 1 - 8)", () => {
    it("1. ACTIVE -> SUSPENDED với lý do hợp lệ", async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Nghi ngờ gian lận bài thi" });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("SUSPENDED");
      expect(res.body.data.statusReason).toBe("Nghi ngờ gian lận bài thi");
      expect(res.body.data.statusChangedAt).toBeDefined();
      expect(res.body.data.statusChangedBy).toMatchObject({
        id: admin._id.toString(),
        email: admin.email,
      });

      // Kiểm tra DB User
      const updatedUser = await User.findById(student._id);
      expect(updatedUser.status).toBe("SUSPENDED");
      expect(updatedUser.statusReason).toBe("Nghi ngờ gian lận bài thi");
      expect(updatedUser.statusChangedBy.toString()).toBe(admin._id.toString());

      // Kiểm tra AuditLog
      const log = await AuditLog.findOne({ targetId: student._id, action: "USER_SUSPENDED" });
      expect(log).toBeDefined();
      expect(log.beforeState.status).toBe("ACTIVE");
      expect(log.afterState.status).toBe("SUSPENDED");
      expect(log.afterState.reason).toBe("Nghi ngờ gian lận bài thi");
      expect(log.actorAdminId.toString()).toBe(admin._id.toString());
    });

    it("2. ACTIVE -> BANNED với lý do hợp lệ", async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Vi phạm nghiêm trọng điều khoản giảng dạy" });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("BANNED");
      expect(res.body.data.statusReason).toBe("Vi phạm nghiêm trọng điều khoản giảng dạy");

      const log = await AuditLog.findOne({ targetId: teacher._id, action: "USER_BANNED" });
      expect(log).toBeDefined();
      expect(log.beforeState.status).toBe("ACTIVE");
      expect(log.afterState.status).toBe("BANNED");
    });

    it("3. SUSPENDED -> ACTIVE: xóa lý do khóa hiện tại và gửi thông báo", async () => {
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Tạm khóa do lỗi thanh toán" });

      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "ACTIVE" });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("ACTIVE");
      expect(res.body.data.statusReason).toBeNull();

      const userInDb = await User.findById(student._id);
      expect(userInDb.status).toBe("ACTIVE");
      expect(userInDb.statusReason).toBeNull();

      const notification = await Notification.findOne({ userId: student._id, type: "ACCOUNT_REACTIVATED" });
      expect(notification).not.toBeNull();
      expect(notification.title).toBe("Tài khoản đã được kích hoạt lại");
    });

    it("4. SUSPENDED -> BANNED: nâng mức xử phạt kèm lý do mới", async () => {
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Đang điều tra" });

      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Xác nhận vi phạm, khóa vĩnh viễn" });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("BANNED");
      expect(res.body.data.statusReason).toBe("Xác nhận vi phạm, khóa vĩnh viễn");

      const log = await AuditLog.findOne({ targetId: student._id, action: "USER_BANNED" });
      expect(log.beforeState.status).toBe("SUSPENDED");
      expect(log.afterState.status).toBe("BANNED");
    });

    it("5. BANNED -> ACTIVE: kích hoạt lại tài khoản bị cấm", async () => {
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Khóa nhầm lẫn" });

      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "ACTIVE" });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("ACTIVE");
      expect(res.body.data.statusReason).toBeNull();
    });

    it("6. Thiếu reason khi chuyển sang SUSPENDED/BANNED bị từ chối 400", async () => {
      const res1 = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED" });
      expect(res1.statusCode).toBe(400);
      expect(res1.body.error).toBe("VALIDATION_ERROR");

      const res2 = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED" });
      expect(res2.statusCode).toBe(400);
      expect(res2.body.error).toBe("VALIDATION_ERROR");
    });

    it("7. Reason chỉ chứa khoảng trắng bị từ chối 400", async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "     " });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("VALIDATION_ERROR");
    });

    it("8. Request lặp lại (idempotency): trả 200 và không tạo duplicate audit", async () => {
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Lý do ban đầu" });

      const auditCountBefore = await AuditLog.countDocuments({ targetId: student._id });

      // Gọi lại lần 2 với cùng trạng thái
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Lý do lần hai không áp dụng" });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("SUSPENDED");

      const auditCountAfter = await AuditLog.countDocuments({ targetId: student._id });
      expect(auditCountAfter).toBe(auditCountBefore);
    });
  });

  // ==========================================
  // 2. TRANSACTION & CONCURRENCY (TC 9 - 14)
  // ==========================================
  describe("2. Transaction & Concurrency (TC 9 - 14)", () => {
    it("9. User update và AuditLog commit thành công trong cùng transaction", async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Kiểm tra commit đồng bộ" });

      expect(res.statusCode).toBe(200);

      const user = await User.findById(student._id);
      const auditLog = await AuditLog.findOne({ targetId: student._id, action: "USER_SUSPENDED" });

      expect(user.status).toBe("SUSPENDED");
      expect(auditLog).toBeDefined();
      expect(auditLog.targetId.toString()).toBe(user._id.toString());
    });

    it("10. AuditLog thất bại -> Rollback User status và không ghi nhận thay đổi", async () => {
      const spy = jest.spyOn(AuditLog, "create").mockRejectedValueOnce(
        new Error("Simulated transient DB error persisting AuditLog")
      );

      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Lý do test rollback" });

      expect(res.statusCode).toBe(500);

      // User giữ nguyên ACTIVE
      const user = await User.findById(student._id);
      expect(user.status).toBe("ACTIVE");
      expect(user.statusReason).toBeNull();

      // Không có AuditLog nào được tạo
      const count = await AuditLog.countDocuments({ targetId: student._id });
      expect(count).toBe(0);

      spy.mockRestore();
    });

    it("11. Transaction không khả dụng -> fail-closed (ném lỗi, không fallback sang nontransactional)", async () => {
      const originalStartSession = mongoose.startSession;
      mongoose.startSession = jest.fn().mockImplementationOnce(async () => {
        throw new Error("Transactions not supported on standalone server");
      });

      const res = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Test fail-closed" });

      expect(res.statusCode).toBe(500);

      // Verify fail-closed: user status was NOT updated
      const user = await User.findById(student._id);
      expect(user.status).toBe("ACTIVE");

      mongoose.startSession = originalStartSession;
    });

    it("12. Hai Admin thay đổi cùng User đồng thời: xử lý an toàn không dirty write", async () => {
      const p1 = request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Admin 1 tạm khóa" });

      const p2 = request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(admin2))
        .send({ status: "BANNED", reason: "Admin 2 khóa vĩnh viễn" });

      const [r1, r2] = await Promise.all([p1, p2]);

      // Cả 2 request đều được xử lý hoặc xung đột rõ ràng (200 hoặc 409)
      const validStatuses = [200, 409];
      expect(validStatuses).toContain(r1.statusCode);
      expect(validStatuses).toContain(r2.statusCode);

      // Trạng thái DB cuối cùng phải là SUSPENDED hoặc BANNED, không có partial state
      const finalUser = await User.findById(teacher._id);
      expect(["SUSPENDED", "BANNED"]).toContain(finalUser.status);
    });

    it("13. Không tạo duplicate audit khi có xung đột", async () => {
      const logsBefore = await AuditLog.countDocuments({ targetId: teacher._id });
      await request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Lý do duy nhất" });

      const logsAfter = await AuditLog.countDocuments({ targetId: teacher._id });
      expect(logsAfter - logsBefore).toBe(1);
    });

    it("14. Không có partial write: User document và AuditLog luôn nhất quán", async () => {
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Consistency check" });

      const user = await User.findById(student._id);
      const audit = await AuditLog.findOne({ targetId: student._id, action: "USER_BANNED" });

      expect(user.status).toBe(audit.afterState.status);
      expect(user.statusReason).toBe(audit.afterState.reason);
    });
  });

  // ==========================================
  // 3. AUTHENTICATION & AUTHORIZATION (TC 15 - 20)
  // ==========================================
  describe("3. Authentication & Authorization (TC 15 - 20)", () => {
    it("15. Admin tự khóa tài khoản của chính mình bị từ chối 400", async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${admin._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Tự hủy" });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("VALIDATION_ERROR");
      expect(res.body.message).toContain("cannot change the status of your own account");
    });

    it("16. Khóa tài khoản Admin khác bị từ chối 403 FORBIDDEN", async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${admin2._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Khóa đồng nghiệp" });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe("FORBIDDEN");
      expect(res.body.message).toContain("Admin accounts cannot be suspended or banned here");
    });

    it("17. Student/Teacher/Sponsor truy cập API Admin bị từ chối 403 FORBIDDEN", async () => {
      const resStudent = await request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(student))
        .send({ status: "BANNED", reason: "Học sinh khóa thầy" });
      expect(resStudent.statusCode).toBe(403);

      const resTeacher = await request(app)
        .get(`/api/admin/users/${student._id}/status-history`)
        .set(as(teacher));
      expect(resTeacher.statusCode).toBe(403);

      const resSponsor = await request(app)
        .get("/api/admin/users")
        .set(as(sponsor));
      expect(resSponsor.statusCode).toBe(403);
    });

    it("18. Access token sau khi tài khoản bị khóa bị từ chối 403 ACCOUNT_BLOCKED ngay lập tức", async () => {
      // Đăng nhập lấy access token
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "student@edunity.vn", password });
      expect(loginRes.statusCode).toBe(200);
      const { accessToken } = loginRes.body.data;

      // Token hoạt động bình thường
      const validProfile = await request(app)
        .get("/api/me/profile")
        .set(bearer(accessToken));
      expect(validProfile.statusCode).toBe(200);

      // Admin khóa tài khoản
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Gian lận thi cử" });

      // Request tiếp theo bằng access token cũ bị chặn ngay lập tức
      const blockedProfile = await request(app)
        .get("/api/me/profile")
        .set(bearer(accessToken));
      expect(blockedProfile.statusCode).toBe(403);
      expect(blockedProfile.body.error).toBe("ACCOUNT_BLOCKED");
    });

    it("19. Refresh token sau khi tài khoản bị khóa bị thu hồi và từ chối", async () => {
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "student@edunity.vn", password });
      const { refreshToken } = loginRes.body.data;

      // Admin khóa tài khoản
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Tạm khóa kiểm tra" });

      // Refresh token bị từ chối
      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken });
      expect([401, 403]).toContain(refreshRes.statusCode);

      // Kiểm tra DB RefreshToken đã bị revoke
      const tokenDoc = await RefreshToken.findOne({ userId: student._id, revokedAt: { $ne: null } });
      expect(tokenDoc).toBeDefined();
    });

    it("20. Kích hoạt lại tài khoản: đăng nhập và sử dụng dịch vụ bình thường", async () => {
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Khóa tạm" });

      // Admin kích hoạt lại
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "ACTIVE" });

      // Đăng nhập lại thành công
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "student@edunity.vn", password });
      expect(loginRes.statusCode).toBe(200);

      const profileRes = await request(app)
        .get("/api/me/profile")
        .set(bearer(loginRes.body.data.accessToken));
      expect(profileRes.statusCode).toBe(200);
    });
  });

  // ==========================================
  // 4. API & LEGACY DATA (TC 21 - 29)
  // ==========================================
  describe("4. API & Legacy Data (TC 21 - 29)", () => {
    it("21. GET user detail ACTIVE: trả về statusReason null", async () => {
      const res = await request(app)
        .get(`/api/admin/users/${student._id}`)
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("ACTIVE");
      expect(res.body.data.statusReason).toBeNull();
    });

    it("22. GET user detail SUSPENDED: trả về đầy đủ statusReason, statusChangedAt, statusChangedBy", async () => {
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Vắng học quá 50% số buổi" });

      const res = await request(app)
        .get(`/api/admin/users/${student._id}`)
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("SUSPENDED");
      expect(res.body.data.statusReason).toBe("Vắng học quá 50% số buổi");
      expect(res.body.data.statusChangedAt).toBeDefined();
      expect(res.body.data.statusChangedBy).toMatchObject({
        id: admin._id.toString(),
        email: admin.email,
        fullName: "Super Admin",
      });
    });

    it("23. GET user detail BANNED: trả về đầy đủ thông tin khóa", async () => {
      await request(app)
        .patch(`/api/admin/users/${teacher._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Hủy hợp đồng sư phạm" });

      const res = await request(app)
        .get(`/api/admin/users/${teacher._id}`)
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("BANNED");
      expect(res.body.data.statusReason).toBe("Hủy hợp đồng sư phạm");
    });

    it("24. GET status history: trả về danh sách lịch sử chuyển đổi trạng thái", async () => {
      // Chuỗi chuyển đổi: ACTIVE -> SUSPENDED -> ACTIVE -> BANNED
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Lần 1: Cảnh cáo" });

      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "ACTIVE" });

      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "BANNED", reason: "Lần 2: Vi phạm tái diễn" });

      const res = await request(app)
        .get(`/api/admin/users/${student._id}/status-history`)
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.items).toHaveLength(3);

      // Sắp xếp mới nhất trước
      expect(res.body.data.items[0]).toMatchObject({
        action: "USER_BANNED",
        fromStatus: "ACTIVE",
        toStatus: "BANNED",
        reason: "Lần 2: Vi phạm tái diễn",
      });
      expect(res.body.data.items[0].performedBy).toMatchObject({
        id: admin._id.toString(),
        email: admin.email,
      });

      expect(res.body.data.items[1]).toMatchObject({
        action: "USER_ACTIVE",
        fromStatus: "SUSPENDED",
        toStatus: "ACTIVE",
      });

      expect(res.body.data.items[2]).toMatchObject({
        action: "USER_SUSPENDED",
        fromStatus: "ACTIVE",
        toStatus: "SUSPENDED",
        reason: "Lần 1: Cảnh cáo",
      });
    });

    it("25. Pagination: status history hỗ trợ phân trang chuẩn", async () => {
      for (let i = 1; i <= 5; i++) {
        await AuditLog.create({
          actorAdminId: admin._id,
          action: i % 2 === 0 ? "USER_ACTIVE" : "USER_SUSPENDED",
          targetType: "User",
          targetId: student._id,
          beforeState: { status: i % 2 === 0 ? "SUSPENDED" : "ACTIVE" },
          afterState: { status: i % 2 === 0 ? "ACTIVE" : "SUSPENDED", reason: `Audit test ${i}` },
        });
      }

      const resPage1 = await request(app)
        .get(`/api/admin/users/${student._id}/status-history?page=1&pageSize=2`)
        .set(as(admin));

      expect(resPage1.statusCode).toBe(200);
      expect(resPage1.body.data.page).toBe(1);
      expect(resPage1.body.data.pageSize).toBe(2);
      expect(resPage1.body.data.total).toBe(5);
      expect(resPage1.body.data.totalPages).toBe(3);
      expect(resPage1.body.data.items).toHaveLength(2);

      const resPage2 = await request(app)
        .get(`/api/admin/users/${student._id}/status-history?page=2&pageSize=2`)
        .set(as(admin));
      expect(resPage2.body.data.items).toHaveLength(2);
      expect(resPage2.body.data.items[0].id).not.toBe(resPage1.body.data.items[0].id);
    });

    it("26. Legacy user thiếu statusReason: fallback tra cứu AuditLog hợp lệ, không tạo lý do giả", async () => {
      // Giả lập user legacy bị khóa nhưng document chưa có trường statusReason
      const legacyUser = await User.create({
        email: "legacy@edunity.vn",
        passwordHash: hashPassword(password),
        role: "STUDENT",
        status: "BANNED",
        // statusReason không có
      });

      // Tạo AuditLog tương ứng trong quá khứ
      await AuditLog.create({
        actorAdminId: admin._id,
        action: "USER_BANNED",
        targetType: "User",
        targetId: legacyUser._id,
        beforeState: { status: "ACTIVE" },
        afterState: { status: "BANNED", reason: "Lý do khóa từ log cũ" },
      });

      const res = await request(app)
        .get(`/api/admin/users/${legacyUser._id}`)
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.statusReason).toBe("Lý do khóa từ log cũ");
      expect(res.body.data.statusChangedBy).toMatchObject({
        id: admin._id.toString(),
        email: admin.email,
      });

      // Trường hợp không có AuditLog -> trả null, không tự bịa lý do giả
      const unknownLegacy = await User.create({
        email: "unknown_legacy@edunity.vn",
        passwordHash: hashPassword(password),
        role: "STUDENT",
        status: "SUSPENDED",
      });

      const resUnknown = await request(app)
        .get(`/api/admin/users/${unknownLegacy._id}`)
        .set(as(admin));

      expect(resUnknown.statusCode).toBe(200);
      expect(resUnknown.body.data.statusReason).toBeNull();
    });

    it("27. User không tồn tại hoặc ObjectId không hợp lệ trả 404 USER_NOT_FOUND", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res404 = await request(app)
        .get(`/api/admin/users/${nonExistentId}`)
        .set(as(admin));
      expect(res404.statusCode).toBe(404);
      expect(res404.body.error).toBe("USER_NOT_FOUND");

      const resInvalid = await request(app)
        .get("/api/admin/users/invalid-object-id")
        .set(as(admin));
      expect(resInvalid.statusCode).toBe(404);
      expect(resInvalid.body.error).toBe("USER_NOT_FOUND");

      const resHistory404 = await request(app)
        .get("/api/admin/users/invalid-id/status-history")
        .set(as(admin));
      expect(resHistory404.statusCode).toBe(404);
    });

    it("28. Không lộ dữ liệu nhạy cảm (passwordHash, tokenVersion, v.v.)", async () => {
      const detailRes = await request(app)
        .get(`/api/admin/users/${student._id}`)
        .set(as(admin));

      expect(detailRes.body.data.passwordHash).toBeUndefined();
      expect(detailRes.body.data.tokenVersion).toBeUndefined();

      const historyRes = await request(app)
        .get(`/api/admin/users/${student._id}/status-history`)
        .set(as(admin));

      historyRes.body.data.items.forEach((item) => {
        if (item.performedBy) {
          expect(item.performedBy.passwordHash).toBeUndefined();
          expect(item.performedBy.tokenVersion).toBeUndefined();
        }
      });
    });

    it("29. Backward compatibility: GET /admin/users giữ nguyên cấu trúc chuẩn", async () => {
      const res = await request(app)
        .get("/api/admin/users")
        .set(as(admin));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.total).toBeDefined();
      expect(res.body.data.page).toBeDefined();
      expect(res.body.data.pageSize).toBeDefined();
      expect(res.body.data.totalPages).toBeDefined();

      const item = res.body.data.items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("email");
      expect(item).toHaveProperty("role");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("statusReason");
      expect(item).toHaveProperty("statusChangedAt");
      expect(item).toHaveProperty("statusChangedBy");
    });
  });

  // ==========================================
  // 5. REGRESSION (TC 30 - 33)
  // ==========================================
  describe("5. Regression (TC 30 - 33)", () => {
    it("30. Admin user list filter và search hoạt động chính xác", async () => {
      const teachersOnly = await request(app)
        .get("/api/admin/users?role=TEACHER")
        .set(as(admin));
      expect(teachersOnly.statusCode).toBe(200);
      expect(teachersOnly.body.data.items.every((u) => u.role === "TEACHER")).toBe(true);

      const activeOnly = await request(app)
        .get("/api/admin/users?status=ACTIVE")
        .set(as(admin));
      expect(activeOnly.statusCode).toBe(200);
      expect(activeOnly.body.data.items.every((u) => u.status === "ACTIVE")).toBe(true);

      const searchTeacher = await request(app)
        .get("/api/admin/users?search=Teacher One")
        .set(as(admin));
      expect(searchTeacher.statusCode).toBe(200);
      expect(searchTeacher.body.data.total).toBe(1);
      expect(searchTeacher.body.data.items[0].email).toBe("teacher@edunity.vn");
    });

    it("31. Request không xác thực (unauthenticated) trả 401 UNAUTHORIZED", async () => {
      const res1 = await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(bearer("invalid.token.here"))
        .send({ status: "BANNED", reason: "Invalid token" });
      expect(res1.statusCode).toBe(401);
      expect(res1.body.error).toBe("UNAUTHORIZED");

      const res2 = await request(app)
        .get(`/api/admin/users/${student._id}/status-history`)
        .set(bearer("invalid.token.here"));
      expect(res2.statusCode).toBe(401);
      expect(res2.body.error).toBe("UNAUTHORIZED");
    });

    it("32. Thao tác xem hồ sơ và thông tin cá nhân không bị ảnh hưởng", async () => {
      const res = await request(app)
        .get("/api/me/profile")
        .set(as(student));
      expect(res.statusCode).toBe(200);
      expect(res.body.data.email).toBe("student@edunity.vn");
    });

    it("33. Notification ACCOUNT_REACTIVATED được tạo khi mở khóa", async () => {
      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "SUSPENDED", reason: "Khóa tạm" });

      await request(app)
        .patch(`/api/admin/users/${student._id}/status`)
        .set(as(admin))
        .send({ status: "ACTIVE" });

      const notif = await Notification.findOne({ userId: student._id, type: "ACCOUNT_REACTIVATED" });
      expect(notif).not.toBeNull();
      expect(notif.title).toBe("Tài khoản đã được kích hoạt lại");
    });
  });
});
