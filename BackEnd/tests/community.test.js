const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { User, Category, Subject, Course, Class, Session, Enrollment, TeacherEarning, Notification, AuditLog, RefreshToken } = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { getSecret } = require("../src/utils/jwt");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const PDF = Buffer.from("%PDF-1.4\n% test document\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("test image")]);

let admin, teacher, student, student2, sponsor, cls;

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

afterAll(async () => {
  await disconnectDB();
});

beforeEach(async () => {
  await clearDB();
  const passwordHash = hashPassword("password");

  admin = await User.create({ email: "admin@test.com", passwordHash, role: "ADMIN" });
  teacher = await User.create({
    email: "teacher@test.com",
    passwordHash,
    role: "TEACHER",
    teacherProfile: { fullName: "Teacher One", verificationStatus: "VERIFIED" },
  });
  student = await User.create({ email: "s1@test.com", passwordHash, role: "STUDENT", studentProfile: { fullName: "Student One" } });
  student2 = await User.create({ email: "s2@test.com", passwordHash, role: "STUDENT", studentProfile: { fullName: "Student Two" } });
  sponsor = await User.create({
    email: "sponsor@test.com",
    passwordHash,
    role: "SPONSOR",
    sponsorProfile: { sponsorType: "ORGANIZATION", representativeName: "Sponsor One" },
  });

  const category = await Category.create({ name: "IT", slug: "it", createdBy: admin._id });
  const subject = await Subject.create({ name: "Lập trình", slug: "lap-trinh", categoryId: category._id, categoryName: "IT", createdBy: admin._id });
  const course = await Course.create({
    title: "NodeJS",
    slug: "nodejs",
    categoryId: category._id,
    categoryName: "IT",
    subjectId: subject._id,
    subjectName: subject.name,
    createdBy: admin._id,
  });
  cls = await Class.create({
    courseId: course._id,
    courseTitle: course.title,
    teacherId: teacher._id,
    teacherName: "Teacher One",
    categoryId: category._id,
    subjectId: subject._id,
    className: "NodeJS cơ bản",
    classType: "FREE",
    price: 0,
    capacity: 10,
    status: "OPEN",
  });
});

const login = (email, password = "password") => request(app).post("/api/auth/login").send({ email, password });

describe("JWT authentication", () => {
  it("accepts a valid access token and rejects expired, forged or blocked ones", async () => {
    const res = await login("s1@test.com");
    const { accessToken } = res.body.data;

    const me = await request(app).get("/api/auth/me").set(bearer(accessToken));
    expect(me.statusCode).toBe(200);
    expect(me.body.data.email).toBe("s1@test.com");

    // role comes from the account, not from whatever the client sends
    const escalate = await request(app).get("/api/admin/dashboard").set(bearer(accessToken)).set("x-user-role", "ADMIN");
    expect(escalate.statusCode).toBe(403);

    const forged = jwt.sign({ role: "ADMIN" }, "wrong-secret", { subject: admin._id.toString(), issuer: "edunity" });
    const forgedRes = await request(app).get("/api/admin/dashboard").set(bearer(forged));
    expect(forgedRes.statusCode).toBe(401);
    expect(forgedRes.body.error).toBe("UNAUTHORIZED");

    const expired = jwt.sign({ role: "STUDENT" }, getSecret(), { subject: student._id.toString(), issuer: "edunity", expiresIn: -10 });
    const expiredRes = await request(app).get("/api/auth/me").set(bearer(expired));
    expect(expiredRes.statusCode).toBe(401);
    expect(expiredRes.body.error).toBe("TOKEN_EXPIRED");

    // the refresh token gives a new working access token
    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken: res.body.data.refreshToken });
    const again = await request(app).get("/api/me/profile").set(bearer(refreshed.body.data.accessToken));
    expect(again.statusCode).toBe(200);

    // banning the account cuts access immediately and kills its refresh tokens
    const banned = await request(app).patch(`/api/admin/users/${student._id}/status`).set(as(admin)).send({ status: "BANNED", reason: "Gian lận" });
    expect(banned.body.data.status).toBe("BANNED");
    const blocked = await request(app).get("/api/me/profile").set(bearer(refreshed.body.data.accessToken));
    expect(blocked.statusCode).toBe(403);
    expect(blocked.body.error).toBe("ACCOUNT_BLOCKED");
    const noRefresh = await request(app).post("/api/auth/refresh").send({ refreshToken: refreshed.body.data.refreshToken });
    expect(noRefresh.statusCode).toBe(401);
    expect((await login("s1@test.com")).statusCode).toBe(403);
  });
});

describe("File upload and signed URLs", () => {
  it("stores private documents behind signed URLs and public images as static files", async () => {
    const badPurpose = await request(app).post("/api/uploads/private").set(as(student)).field("purpose", "AVATAR").attach("file", PDF, { filename: "a.pdf", contentType: "application/pdf" });
    expect(badPurpose.statusCode).toBe(400);

    // content must match the declared type
    const disguised = await request(app)
      .post("/api/uploads/private")
      .set(as(student))
      .field("purpose", "IDENTITY")
      .attach("file", Buffer.from("<script>alert(1)</script>"), { filename: "a.pdf", contentType: "application/pdf" });
    expect(disguised.body.error).toBe("UNSUPPORTED_FILE_TYPE");

    const uploaded = await request(app)
      .post("/api/uploads/private")
      .set(as(student))
      .field("purpose", "SCHOLARSHIP_PROOF")
      .attach("file", PDF, { filename: "proof.pdf", contentType: "application/pdf" });
    expect(uploaded.statusCode).toBe(201);
    const { storageKey } = uploaded.body.data;
    expect(storageKey).toMatch(new RegExp(`^private/${student._id}/SCHOLARSHIP_PROOF/`));

    // not reachable as a static file
    expect((await request(app).get(`/uploads/${storageKey}`)).statusCode).toBe(404);
    expect((await request(app).get(`/${storageKey}`)).statusCode).toBe(404);

    const foreign = await request(app).post("/api/files/signed-url").set(as(student2)).send({ storageKey });
    expect(foreign.statusCode).toBe(404);
    const traversal = await request(app).post("/api/files/signed-url").set(as(admin)).send({ storageKey: "private/../../package.json" });
    expect(traversal.statusCode).toBe(404);

    for (const user of [student, admin]) {
      const signed = await request(app).post("/api/files/signed-url").set(as(user)).send({ storageKey });
      expect(signed.statusCode).toBe(200);
      const file = await request(app).get(signed.body.data.url.replace(/^https?:\/\/[^/]+/, ""));
      expect(file.statusCode).toBe(200);
      expect(file.headers["content-type"]).toBe("application/pdf");
    }

    const expired = await request(app).get("/api/files/download").query({ key: storageKey, expires: Date.now() - 1000, signature: "0".repeat(64) });
    expect(expired.statusCode).toBe(403);

    const cover = await request(app)
      .post("/api/uploads/public")
      .set(as(teacher))
      .field("purpose", "COVER_IMAGE")
      .attach("file", PNG, { filename: "cover.png", contentType: "image/png" });
    expect(cover.statusCode).toBe(201);
    const served = await request(app).get(cover.body.data.path);
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");

    const pdfAsPublic = await request(app)
      .post("/api/uploads/public")
      .set(as(teacher))
      .field("purpose", "COVER_IMAGE")
      .attach("file", PDF, { filename: "a.pdf", contentType: "application/pdf" });
    expect(pdfAsPublic.body.error).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("TIN-02A: validates secure file uploads and verifies JPG fix (TC-01 to TC-17)", async () => {
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("valid jpeg payload")]);
    const WEBP = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from("WEBP", "ascii"), Buffer.from("test webp payload")]);
    const FAKE_TEXT = Buffer.from("This is plain text pretending to be an image");
    const DOCX_ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("docx zip contents")]);
    const MP4_PAYLOAD = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypisom", "ascii"), Buffer.from("mp4 video stream")]);

    // TC-01: JPEG hợp lệ với MIME image/jpeg
    const tc01 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", JPEG, { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(tc01.statusCode).toBe(200);
    expect(tc01.body.data.avatarUrl).toMatch(/\.jpg$/);

    // TC-02: JPEG hợp lệ với MIME image/jpg (TIN-02A fix)
    const tc02 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", JPEG, { filename: "photo.jpg", contentType: "image/jpg" });
    expect(tc02.statusCode).toBe(200);
    expect(tc02.body.data.avatarUrl).toMatch(/\.jpg$/);

    // TC-03: JPEG với MIME application/octet-stream (bị từ chối theo chính sách strict MIME)
    const tc03 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", JPEG, { filename: "photo.jpg", contentType: "application/octet-stream" });
    expect(tc03.statusCode).toBe(400);
    expect(tc03.body.error).toBe("UNSUPPORTED_FILE_TYPE");

    // TC-04: JPEG với MIME rỗng / không thể xác định từ filename (default application/octet-stream)
    const tc04 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", JPEG, { filename: "blob" });
    expect(tc04.statusCode).toBe(400);
    expect(tc04.body.error).toBe("UNSUPPORTED_FILE_TYPE");

    // TC-05: PNG hợp lệ
    const tc05 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", PNG, { filename: "photo.png", contentType: "image/png" });
    expect(tc05.statusCode).toBe(200);
    expect(tc05.body.data.avatarUrl).toMatch(/\.png$/);

    // TC-06: WebP hợp lệ
    const tc06 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", WEBP, { filename: "photo.webp", contentType: "image/webp" });
    expect(tc06.statusCode).toBe(200);
    expect(tc06.body.data.avatarUrl).toMatch(/\.webp$/);

    // TC-07: PDF hợp lệ với purpose private
    const tc07 = await request(app)
      .post("/api/uploads/private")
      .set(as(student))
      .field("purpose", "IDENTITY")
      .attach("file", PDF, { filename: "id.pdf", contentType: "application/pdf" });
    expect(tc07.statusCode).toBe(201);
    expect(tc07.body.data.storageKey).toMatch(/\.pdf$/);

    // TC-08: Text giả mạo file JPG
    const tc08 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", FAKE_TEXT, { filename: "fake.jpg", contentType: "image/jpg" });
    expect(tc08.statusCode).toBe(400);
    expect(tc08.body.error).toBe("UNSUPPORTED_FILE_TYPE");

    // TC-09: PDF giả mạo PNG
    const tc09 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", PDF, { filename: "fake.png", contentType: "image/png" });
    expect(tc09.statusCode).toBe(400);
    expect(tc09.body.error).toBe("UNSUPPORTED_FILE_TYPE");

    // TC-10: MIME image/jpeg nhưng nội dung text giả mạo
    const tc10 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", FAKE_TEXT, { filename: "fake.jpeg", contentType: "image/jpeg" });
    expect(tc10.statusCode).toBe(400);
    expect(tc10.body.error).toBe("UNSUPPORTED_FILE_TYPE");

    // TC-11: File rỗng (0 bytes)
    const tc11 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", Buffer.alloc(0), { filename: "empty.jpg", contentType: "image/jpeg" });
    expect(tc11.statusCode).toBe(400);

    // TC-12: File vượt giới hạn dung lượng (> 5MB cho avatar)
    const bigHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const bigPayload = Buffer.alloc(5 * 1024 * 1024 + 1);
    bigHeader.copy(bigPayload, 0);
    const tc12 = await request(app)
      .post("/api/me/avatar")
      .set(as(student))
      .attach("file", bigPayload, { filename: "large.jpg", contentType: "image/jpeg" });
    expect(tc12.statusCode).toBe(413);
    expect(tc12.body.error).toBe("FILE_TOO_LARGE");

    // TC-13: Request thiếu file (không attach field file)
    const tc13 = await request(app).post("/api/me/avatar").set(as(student));
    expect(tc13.statusCode).toBe(400);

    // TC-14: Upload không có JWT hợp lệ (invalid access token)
    const tc14 = await request(app)
      .post("/api/me/avatar")
      .set(bearer("invalid.jwt.token"))
      .attach("file", JPEG, { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(tc14.statusCode).toBe(401);
    expect(tc14.body.error).toBe("UNAUTHORIZED");

    // TC-15: Không có quyền truy cập file private (User khác)
    const uploadPrivate = await request(app)
      .post("/api/uploads/private")
      .set(as(student))
      .field("purpose", "QUALIFICATION")
      .attach("file", PDF, { filename: "cert.pdf", contentType: "application/pdf" });
    expect(uploadPrivate.statusCode).toBe(201);
    const foreignKey = uploadPrivate.body.data.storageKey;
    const tc15 = await request(app).post("/api/files/signed-url").set(as(student2)).send({ storageKey: foreignKey });
    expect(tc15.statusCode).toBe(404);

    // TC-16: File DOC/DOCX khi chưa được hỗ trợ
    const tc16 = await request(app)
      .post("/api/uploads/private")
      .set(as(student))
      .field("purpose", "QUALIFICATION")
      .attach("file", DOCX_ZIP, { filename: "essay.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    expect(tc16.statusCode).toBe(400);
    expect(tc16.body.error).toBe("UNSUPPORTED_FILE_TYPE");

    // TC-17: Không thay đổi hành vi MP4 hiện tại (chưa mở rộng trong TIN-02A)
    const tc17 = await request(app)
      .post("/api/uploads/private")
      .set(as(student))
      .field("purpose", "QUALIFICATION")
      .attach("file", MP4_PAYLOAD, { filename: "session.mp4", contentType: "video/mp4" });
    expect(tc17.statusCode).toBe(400);
    expect(tc17.body.error).toBe("UNSUPPORTED_FILE_TYPE");
  });
});

describe("Profile", () => {
  it("lets each role edit only its own profile fields", async () => {
    const mine = await request(app).get("/api/me/profile").set(as(student));
    expect(mine.body.data).toMatchObject({ email: "s1@test.com", fullName: "Student One", role: "STUDENT" });
    expect(mine.body.data.passwordHash).toBeUndefined();

    const updated = await request(app)
      .patch("/api/me/profile")
      .set(as(student))
      .send({ fullName: "Student Renamed", bio: "Thích học Toán", dateOfBirth: "2010-05-01", role: "ADMIN", email: "x@x.com", status: "BANNED" });
    expect(updated.body.data).toMatchObject({ fullName: "Student Renamed", bio: "Thích học Toán", role: "STUDENT", email: "s1@test.com", status: "ACTIVE" });

    const future = await request(app).patch("/api/me/profile").set(as(student)).send({ dateOfBirth: "2999-01-01" });
    expect(future.statusCode).toBe(400);

    // a teacher cannot verify themself or edit ratings; renaming updates the denormalized class
    await User.updateOne({ _id: teacher._id }, { $set: { "teacherProfile.verificationStatus": "PENDING" } });
    const t = await request(app)
      .patch("/api/me/profile")
      .set(as(teacher))
      .send({ fullName: "Thầy Một", biography: "10 năm kinh nghiệm", verificationStatus: "VERIFIED", ratingAverage: 5 });
    expect(t.body.data).toMatchObject({ fullName: "Thầy Một", biography: "10 năm kinh nghiệm", verificationStatus: "PENDING", ratingAverage: 0 });
    expect((await Class.findById(cls._id)).teacherName).toBe("Thầy Một");

    const s = await request(app).patch("/api/me/profile").set(as(sponsor)).send({ organizationName: "Quỹ ABC", description: "Tài trợ giáo dục" });
    expect(s.body.data).toMatchObject({ organizationName: "Quỹ ABC", sponsorType: "ORGANIZATION" });

    const avatar = await request(app).post("/api/me/avatar").set(as(student)).attach("file", PNG, { filename: "me.png", contentType: "image/png" });
    expect(avatar.statusCode).toBe(200);
    expect(avatar.body.data.avatarUrl).toMatch(/\/uploads\/avatar\//);
    expect((await request(app).get("/api/me/profile").set(as(student))).body.data.avatarUrl).toBe(avatar.body.data.avatarUrl);
    const script = await request(app).patch("/api/me/profile").set(as(student)).send({ avatarUrl: "javascript:alert(1)" });
    expect(script.statusCode).toBe(400);
  });

  it("TIN-01: allows new users without embedded profile to upload avatar", async () => {
    const passwordHash = hashPassword("password");

    // 1. Student without studentProfile
    const rawStudent = await User.create({ email: "raw_student@test.com", passwordHash, role: "STUDENT" });
    const stuRes = await request(app).post("/api/me/avatar").set(as(rawStudent)).attach("file", PNG, { filename: "me.png", contentType: "image/png" });
    expect(stuRes.statusCode).toBe(200);
    expect(stuRes.body.data.avatarUrl).toMatch(/\/uploads\/avatar\//);
    const stuProfile = await request(app).get("/api/me/profile").set(as(rawStudent));
    expect(stuProfile.body.data.fullName).toBe("raw_student@test.com");
    expect(stuProfile.body.data.avatarUrl).toBe(stuRes.body.data.avatarUrl);

    // 2. Teacher without teacherProfile
    const rawTeacher = await User.create({ email: "raw_teacher@test.com", passwordHash, role: "TEACHER" });
    const teaRes = await request(app).post("/api/me/avatar").set(as(rawTeacher)).attach("file", PNG, { filename: "tea.png", contentType: "image/png" });
    expect(teaRes.statusCode).toBe(200);
    expect(teaRes.body.data.avatarUrl).toMatch(/\/uploads\/avatar\//);
    const teaProfile = await request(app).get("/api/me/profile").set(as(rawTeacher));
    expect(teaProfile.body.data.fullName).toBe("raw_teacher@test.com");
    expect(teaProfile.body.data.verificationStatus).toBe("UNVERIFIED");

    // 3. Sponsor without sponsorProfile
    const rawSponsor = await User.create({ email: "raw_sponsor@test.com", passwordHash, role: "SPONSOR" });
    const spoRes = await request(app).post("/api/me/avatar").set(as(rawSponsor)).attach("file", PNG, { filename: "spo.png", contentType: "image/png" });
    expect(spoRes.statusCode).toBe(200);
    expect(spoRes.body.data.avatarUrl).toMatch(/\/uploads\/avatar\//);
    const spoProfile = await request(app).get("/api/me/profile").set(as(rawSponsor));
    expect(spoProfile.body.data.sponsorType).toBe("INDIVIDUAL");

    // 4. Admin cannot update avatar
    const adminRes = await request(app).post("/api/me/avatar").set(as(admin)).attach("file", PNG, { filename: "admin.png", contentType: "image/png" });
    expect(adminRes.statusCode).toBe(400);
    expect(adminRes.body.error).toBe("PROFILE_NOT_EDITABLE");

    // 5. Preserves existing profile data on update
    await request(app).patch("/api/me/profile").set(as(rawStudent)).send({ fullName: "Updated Name", bio: "My Bio" });
    const stuRes2 = await request(app).post("/api/me/avatar").set(as(rawStudent)).attach("file", PNG, { filename: "me2.png", contentType: "image/png" });
    expect(stuRes2.statusCode).toBe(200);
    const stuProfile2 = await request(app).get("/api/me/profile").set(as(rawStudent));
    expect(stuProfile2.body.data.fullName).toBe("Updated Name");
    expect(stuProfile2.body.data.bio).toBe("My Bio");
    expect(stuProfile2.body.data.avatarUrl).toBe(stuRes2.body.data.avatarUrl);

    // 6. Invalid file format
    const badFile = await request(app).post("/api/me/avatar").set(as(rawStudent)).attach("file", PDF, { filename: "test.pdf", contentType: "application/pdf" });
    expect(badFile.statusCode).toBe(400);
    expect(badFile.body.error).toBe("UNSUPPORTED_FILE_TYPE");

    // 7. Missing file
    const noFile = await request(app).post("/api/me/avatar").set(as(rawStudent));
    expect(noFile.statusCode).toBe(400);

    // 8. TC-08: Avatar vượt 5MB phải bị từ chối 413 FILE_TOO_LARGE
    const bigPNGHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const bigPayload = Buffer.alloc(5 * 1024 * 1024 + 1); // 5MB + 1 byte
    bigPNGHeader.copy(bigPayload, 0);
    const tooLarge = await request(app)
      .post("/api/me/avatar")
      .set(as(rawStudent))
      .attach("file", bigPayload, { filename: "large.png", contentType: "image/png" });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.body.error).toBe("FILE_TOO_LARGE");

    // 9. TC-09: Giả lập storage lưu file thành công nhưng user.save() thất bại
    const beforeUser = await User.findById(rawStudent._id);
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const saveSpy = jest.spyOn(User.prototype, "save").mockRejectedValueOnce(new Error("Simulated DB save failure"));
    const failedSaveRes = await request(app)
      .post("/api/me/avatar")
      .set(as(rawStudent))
      .attach("file", PNG, { filename: "fail_save.png", contentType: "image/png" });
    saveSpy.mockRestore();
    consoleSpy.mockRestore();
    expect(failedSaveRes.statusCode).toBe(500);
    expect(failedSaveRes.body.error).toBe("INTERNAL_SERVER_ERROR");
    const afterUser = await User.findById(rawStudent._id);
    expect(afterUser.studentProfile?.avatarUrl).toBe(beforeUser.studentProfile?.avatarUrl);

    // 10. TC-10: Giáo viên cập nhật avatar không làm thay đổi teacherName hoặc dữ liệu lớp học liên quan
    const beforeClass = await Class.findById(cls._id).lean();
    const teaAvatarRes = await request(app)
      .post("/api/me/avatar")
      .set(as(teacher))
      .attach("file", PNG, { filename: "teacher_new_avatar.png", contentType: "image/png" });
    expect(teaAvatarRes.statusCode).toBe(200);
    expect(teaAvatarRes.body.data.avatarUrl).toMatch(/\/uploads\/avatar\//);

    const afterClass = await Class.findById(cls._id).lean();
    expect(afterClass.teacherName).toBe(beforeClass.teacherName);
    expect(afterClass.title).toBe(beforeClass.title);
    expect(afterClass.status).toBe(beforeClass.status);

    const teaProfileAfter = await request(app).get("/api/me/profile").set(as(teacher));
    expect(teaProfileAfter.body.data.fullName).toBe("Teacher One");
    expect(teaProfileAfter.body.data.avatarUrl).toBe(teaAvatarRes.body.data.avatarUrl);
  });

  it("changes the password and signs the account out everywhere", async () => {
    const session = await login("s1@test.com");

    const wrong = await request(app).post("/api/me/password").set(as(student)).send({ currentPassword: "nope", newPassword: "newpass1" });
    expect(wrong.body.error).toBe("INVALID_PASSWORD");
    const short = await request(app).post("/api/me/password").set(as(student)).send({ currentPassword: "password", newPassword: "123" });
    expect(short.statusCode).toBe(400);

    const changed = await request(app).post("/api/me/password").set(as(student)).send({ currentPassword: "password", newPassword: "newpass1" });
    expect(changed.statusCode).toBe(200);
    expect((await login("s1@test.com", "password")).statusCode).toBe(401);
    expect((await login("s1@test.com", "newpass1")).statusCode).toBe(200);
    const oldRefresh = await request(app).post("/api/auth/refresh").send({ refreshToken: session.body.data.refreshToken });
    expect(oldRefresh.statusCode).toBe(401);
    // the session issued to the device that changed the password + the login above
    expect(await RefreshToken.countDocuments({ userId: student._id, revokedAt: null })).toBe(2);
  });
});

describe("Messaging", () => {
  it("supports student-teacher conversations, private to their participants", async () => {
    const notAllowed = await request(app).post("/api/conversations").set(as(student)).send({ participantId: student2._id });
    expect(notAllowed.body.error).toBe("MESSAGING_NOT_ALLOWED");
    const withSponsor = await request(app).post("/api/conversations").set(as(sponsor)).send({ participantId: teacher._id });
    expect(withSponsor.statusCode).toBe(403);

    const opened = await request(app).post("/api/conversations").set(as(student)).send({ participantId: teacher._id, classId: cls._id });
    expect(opened.statusCode).toBe(200);
    expect(opened.body.data.participant).toMatchObject({ fullName: "Teacher One", role: "TEACHER" });
    expect(opened.body.data.className).toBe("NodeJS cơ bản");
    const conversationId = opened.body.data.id;

    // opening again from the other side returns the same conversation
    const sameFromTeacher = await request(app).post("/api/conversations").set(as(teacher)).send({ participantId: student._id, classId: cls._id });
    expect(sameFromTeacher.body.data.id).toBe(conversationId);
    expect(sameFromTeacher.body.data.participant.fullName).toBe("Student One");

    const empty = await request(app).post(`/api/conversations/${conversationId}/messages`).set(as(student)).send({ content: "   " });
    expect(empty.statusCode).toBe(400);
    const first = await request(app).post(`/api/conversations/${conversationId}/messages`).set(as(student)).send({ content: "Thầy ơi lớp học mấy giờ ạ?" });
    expect(first.statusCode).toBe(201);
    await request(app).post(`/api/conversations/${conversationId}/messages`).set(as(teacher)).send({ content: "19h tối thứ 2 nhé" });
    expect(await Notification.countDocuments({ userId: teacher._id, type: "NEW_MESSAGE" })).toBe(1);

    // outsiders can neither read nor write
    const peek = await request(app).get(`/api/conversations/${conversationId}/messages`).set(as(student2));
    expect(peek.statusCode).toBe(404);
    const inject = await request(app).post(`/api/conversations/${conversationId}/messages`).set(as(student2)).send({ content: "hi" });
    expect(inject.statusCode).toBe(404);
    expect((await request(app).get("/api/conversations").set(as(student2))).body.data.total).toBe(0);

    const messages = await request(app).get(`/api/conversations/${conversationId}/messages`).set(as(teacher));
    expect(messages.body.data.items.map((m) => m.content)).toEqual(["Thầy ơi lớp học mấy giờ ạ?", "19h tối thứ 2 nhé"]);
    const page = await request(app).get(`/api/conversations/${conversationId}/messages?limit=1`).set(as(teacher));
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.data.hasMore).toBe(true);
    const older = await request(app).get(`/api/conversations/${conversationId}/messages`).query({ limit: 1, before: page.body.data.nextBefore }).set(as(teacher));
    expect(older.body.data.items[0].content).toBe("Thầy ơi lớp học mấy giờ ạ?");

    const inbox = await request(app).get("/api/conversations").set(as(student));
    expect(inbox.body.data.items[0].lastMessagePreview).toBe("19h tối thứ 2 nhé");

    // recall: only your own message
    const notMine = await request(app).delete(`/api/messages/${first.body.data.id}`).set(as(teacher));
    expect(notMine.statusCode).toBe(403);
    const recalled = await request(app).delete(`/api/messages/${first.body.data.id}`).set(as(student));
    expect(recalled.body.data).toMatchObject({ isDeleted: true, content: null });
    const after = await request(app).get(`/api/conversations/${conversationId}/messages`).set(as(teacher));
    expect(after.body.data.items[0].content).toBeNull();
  });
});

describe("Complaints", () => {
  it("lets users report and admins handle the complaint", async () => {
    const invalid = await request(app).post("/api/reports").set(as(student)).send({ type: "WHATEVER", description: "x", classId: cls._id });
    expect(invalid.statusCode).toBe(400);
    const noTarget = await request(app).post("/api/reports").set(as(student)).send({ type: "OTHER", description: "x" });
    expect(noTarget.statusCode).toBe(400);

    const created = await request(app)
      .post("/api/reports")
      .set(as(student))
      .send({ type: "TEACHER_ABSENT", description: "Giáo viên vắng buổi 2", reportedUserId: teacher._id, classId: cls._id });
    expect(created.statusCode).toBe(201);
    expect(created.body.data.status).toBe("OPEN");
    const reportId = created.body.data.id;

    expect((await request(app).get("/api/me/reports").set(as(student))).body.data.total).toBe(1);
    expect((await request(app).get("/api/me/reports").set(as(student2))).body.data.total).toBe(0);
    expect((await request(app).get("/api/admin/reports").set(as(student))).statusCode).toBe(403);

    const list = await request(app).get("/api/admin/reports?status=OPEN").set(as(admin));
    expect(list.body.data.items[0]).toMatchObject({ reporter: { fullName: "Student One" }, reportedUser: { fullName: "Teacher One" }, class: { className: "NodeJS cơ bản" } });

    const needNote = await request(app).patch(`/api/admin/reports/${reportId}`).set(as(admin)).send({ status: "RESOLVED" });
    expect(needNote.statusCode).toBe(400);
    const inReview = await request(app).patch(`/api/admin/reports/${reportId}`).set(as(admin)).send({ status: "IN_REVIEW" });
    expect(inReview.body.data.status).toBe("IN_REVIEW");
    const resolved = await request(app).patch(`/api/admin/reports/${reportId}`).set(as(admin)).send({ status: "RESOLVED", reviewNote: "Đã nhắc nhở giáo viên và bù buổi" });
    expect(resolved.body.data).toMatchObject({ status: "RESOLVED", handledBy: { role: "ADMIN" } });
    const reopen = await request(app).patch(`/api/admin/reports/${reportId}`).set(as(admin)).send({ status: "IN_REVIEW" });
    expect(reopen.body.error).toBe("INVALID_REPORT_STATUS");

    expect(await AuditLog.countDocuments({ targetType: "Report" })).toBe(2);
    expect(await Notification.countDocuments({ userId: student._id, type: "REPORT_RESOLVED" })).toBe(1);
  });
});

describe("Admin users and dashboard", () => {
  it("lists users, guards status changes and aggregates the dashboard", async () => {
    expect((await request(app).get("/api/admin/users").set(as(teacher))).statusCode).toBe(403);

    const all = await request(app).get("/api/admin/users").set(as(admin));
    expect(all.body.data.total).toBe(5);
    expect(all.body.data.items.every((u) => u.passwordHash === undefined)).toBe(true);
    const teachers = await request(app).get("/api/admin/users?role=TEACHER").set(as(admin));
    expect(teachers.body.data.items[0]).toMatchObject({ fullName: "Teacher One", verificationStatus: "VERIFIED" });
    const search = await request(app).get("/api/admin/users?search=student two").set(as(admin));
    expect(search.body.data.total).toBe(1);

    await Enrollment.create({ classId: cls._id, courseId: cls.courseId, teacherId: teacher._id, studentId: student._id, enrollmentStatus: "CONFIRMED", paymentSource: "FREE" });
    const detail = await request(app).get(`/api/admin/users/${teacher._id}`).set(as(admin));
    expect(detail.body.data.activity).toMatchObject({ classes: 1, students: 1 });
    expect(detail.body.data.passwordHash).toBeUndefined();

    const self = await request(app).patch(`/api/admin/users/${admin._id}/status`).set(as(admin)).send({ status: "BANNED", reason: "x" });
    expect(self.statusCode).toBe(400);
    const noReason = await request(app).patch(`/api/admin/users/${teacher._id}/status`).set(as(admin)).send({ status: "SUSPENDED" });
    expect(noReason.statusCode).toBe(400);
    const suspended = await request(app).patch(`/api/admin/users/${teacher._id}/status`).set(as(admin)).send({ status: "SUSPENDED", reason: "Vắng dạy nhiều lần" });
    expect(suspended.body.data.status).toBe("SUSPENDED");
    expect((await request(app).get("/api/teacher/classes").set(as(teacher))).statusCode).toBe(403);
    const restored = await request(app).patch(`/api/admin/users/${teacher._id}/status`).set(as(admin)).send({ status: "ACTIVE" });
    expect(restored.body.data.status).toBe("ACTIVE");
    expect((await request(app).get("/api/teacher/classes").set(as(teacher))).statusCode).toBe(200);
    expect(await AuditLog.countDocuments({ targetType: "User" })).toBe(2);

    await TeacherEarning.create({ teacherId: teacher._id, enrollmentId: (await Enrollment.findOne())._id, classId: cls._id, grossAmount: 500000, commissionAmount: 50000, netAmount: 450000 });
    await User.updateOne({ _id: teacher._id }, { $set: { "teacherProfile.verificationStatus": "PENDING" } });
    await Class.updateOne({ _id: cls._id }, { $set: { status: "PENDING_APPROVAL" } });

    const dashboard = await request(app).get("/api/admin/dashboard").set(as(admin));
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body.data.users).toMatchObject({ total: 5, students: 2, teachers: 1, sponsors: 1, verifiedTeachers: 0 });
    expect(dashboard.body.data.pending).toMatchObject({ teacherVerifications: 1, classApprovals: 1, reports: 0 });
    expect(dashboard.body.data.training).toMatchObject({ courses: 1, classes: 1, activeClasses: 0, confirmedEnrollments: 1 });
    expect(dashboard.body.data.finance).toMatchObject({ revenue: "500000", commission: "50000", revenueThisMonth: "500000" });
    expect(dashboard.body.data.finance.monthly).toHaveLength(6);
    expect(dashboard.body.data.finance.monthly[5].revenue).toBe("500000");
    expect(dashboard.body.data.recentActivities[0].actorEmail).toBe("admin@test.com");
  });
});

describe("Video provider", () => {
  afterEach(() => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
  });

  it("issues LiveKit access tokens when the provider is configured", async () => {
    process.env.LIVEKIT_URL = "wss://edunity.livekit.invalid";
    process.env.LIVEKIT_API_KEY = "APItestkey";
    process.env.LIVEKIT_API_SECRET = "test-livekit-secret";

    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Buổi 1",
      startDatetime: new Date(Date.now() - 60000),
      endDatetime: new Date(Date.now() + 3600000),
    });
    await request(app).post(`/api/classes/${cls._id}/enrollments`).set(as(student));

    const host = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
    expect(host.body.data).toMatchObject({ provider: "LIVEKIT", serverUrl: "wss://edunity.livekit.invalid", role: "HOST" });
    const hostToken = jwt.verify(host.body.data.accessToken, "test-livekit-secret");
    expect(hostToken).toMatchObject({ iss: "APItestkey", sub: teacher._id.toString(), name: "Teacher One" });
    expect(hostToken.video).toMatchObject({ room: host.body.data.roomId, roomJoin: true, roomAdmin: true });

    const participant = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student));
    const participantToken = jwt.verify(participant.body.data.accessToken, "test-livekit-secret");
    expect(participantToken.video).toMatchObject({ room: host.body.data.roomId, roomJoin: true, roomAdmin: false });
    expect(participantToken.exp).toBeLessThanOrEqual(Math.ceil(session.endDatetime.getTime() / 1000) + 1);

    // The room was only opened by joining; the provider is unreachable here, so mark teaching as started directly
    expect((await Session.findById(session._id)).status).toBe("WAITING");
    await Session.updateOne({ _id: session._id }, { $set: { status: "IN_PROGRESS" } });
    // ending the session still succeeds when the provider cannot be reached
    const ended = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(ended.body.data.status).toBe("COMPLETED");
  });

  it("falls back to the local dev token without provider configuration", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Buổi 1",
      startDatetime: new Date(Date.now() - 60000),
      endDatetime: new Date(Date.now() + 3600000),
    });
    const host = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
    expect(host.body.data).toMatchObject({ provider: "EDUNITY_DEV", serverUrl: null });
  });
});
