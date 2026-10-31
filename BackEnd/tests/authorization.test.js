const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User, Category, Subject, Course, Class, Session, Enrollment, Payment, Notification, Report, Conversation, Message,
  ScholarshipCampaign, ScholarshipApplication, Scholarship, SponsorContribution, CourseProposal,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const ROUTES_DIR = path.join(__dirname, "../src/routes");
const MOUNTS = { "authRoutes.js": "/api/auth" };
const fakeId = () => new mongoose.Types.ObjectId().toString();

/** Every route the app really declares, read from the routers so a new route cannot escape these checks. */
const declaredRoutes = () =>
  fs.readdirSync(ROUTES_DIR).flatMap((file) => {
    const router = require(path.join(ROUTES_DIR, file));
    return router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map((method) => ({ method, path: `${MOUNTS[file] || "/api"}${layer.route.path}` }))
      );
  });

// Deliberately reachable without a token. Anything else must answer 401, so adding to this list is a conscious decision.
const PUBLIC_ROUTES = new Set([
  "post /api/auth/register",
  "post /api/auth/login",
  "post /api/auth/refresh",
  "post /api/auth/logout",
  "post /api/auth/dev-login", // test-only; 404 elsewhere (security.test.js)
  "get /api/catalog/categories",
  "get /api/catalog/filters",
  "get /api/classes",
  "get /api/classes/:id",
  "get /api/classes/:id/sessions",
  "get /api/classes/:classId/availability",
  "get /api/classes/:id/reviews",
  "get /api/teachers",
  "get /api/teachers/:id",
  "get /api/teachers/:id/reviews",
  "get /api/categories",
  "get /api/categories/:id/subjects",
  "get /api/subjects/:id",
  "get /api/courses",
  "get /api/courses/:id",
  "get /api/courses/:id/classes",
  "get /api/campaigns",
  "get /api/campaigns/:id",
  "get /api/files/download", // the signature is the credential
  "post /api/payments/sandbox/webhook", // development/test only (security.test.js)
  "post /api/payments/webhook", // shared secret (security.test.js)
  "post /api/sessions/livekit-webhook", // signed by LiveKit (security.test.js)
]);

const routeKey = (route) => `${route.method} ${route.path}`;
const fill = (routePath) => routePath.replace(/:[A-Za-z]+/g, () => fakeId());

let users, tokens, data;

const as = (name) => ({ Authorization: `Bearer ${tokens[name]}` });
const call = (name, method, url) => {
  const req = request(app)[method](url);
  return name ? req.set(as(name)) : req;
};

const makeUser = (key, role, profile) =>
  User.create({ email: `${key}@test.com`, passwordHash: hashPassword("password1"), role, status: "ACTIVE", ...profile });

const WINDOW = { start: new Date(Date.now() - 864e5), end: new Date(Date.now() + 30 * 864e5) };

beforeAll(async () => {
  // jest runs with a dedicated in-memory database
  await connectDB();
  await syncIndexes();
  await clearDB();

  users = {
    admin: await makeUser("admin", "ADMIN"),
    studentA: await makeUser("studentA", "STUDENT", { studentProfile: { fullName: "Học viên A" } }),
    studentB: await makeUser("studentB", "STUDENT", { studentProfile: { fullName: "Học viên B" } }),
    teacherA: await makeUser("teacherA", "TEACHER", { teacherProfile: { fullName: "Giáo viên A", verificationStatus: "VERIFIED" } }),
    teacherB: await makeUser("teacherB", "TEACHER", { teacherProfile: { fullName: "Giáo viên B", verificationStatus: "VERIFIED" } }),
    sponsorA: await makeUser("sponsorA", "SPONSOR", { sponsorProfile: { sponsorType: "INDIVIDUAL", representativeName: "Tài trợ A" } }),
    sponsorB: await makeUser("sponsorB", "SPONSOR", { sponsorProfile: { sponsorType: "INDIVIDUAL", representativeName: "Tài trợ B" } }),
  };
  tokens = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, signAccessToken(user)]));

  const category = await Category.create({ name: "Danh mục", slug: "danh-muc", createdBy: users.admin._id });
  const subject = await Subject.create({ categoryId: category._id, categoryName: category.name, name: "Môn", slug: "mon", createdBy: users.admin._id });
  const course = await Course.create({ subjectId: subject._id, subjectName: subject.name, categoryId: category._id, categoryName: category.name, title: "Khóa", slug: "khoa", createdBy: users.admin._id });

  const makeClass = (teacherKey, name, extra = {}) =>
    Class.create({
      courseId: course._id, courseTitle: course.title, categoryId: category._id, subjectId: subject._id,
      teacherId: users[teacherKey]._id, teacherName: teacherKey, className: name, classType: "PAID", price: 200000,
      capacity: 10, enrollmentStart: WINDOW.start, enrollmentEnd: WINDOW.end, startDate: WINDOW.start, endDate: WINDOW.end,
      status: "OPEN", reviewedBy: users.admin._id, reviewNote: "ghi chú nội bộ của admin", ...extra,
    });
  const classA = await makeClass("teacherA", "Lớp của giáo viên A");
  const classB = await makeClass("teacherB", "Lớp của giáo viên B");
  const draftA = await makeClass("teacherA", "Lớp nháp A", { status: "DRAFT" });

  const session = await Session.create({
    classId: classA._id, className: classA.className, teacherId: users.teacherA._id, title: "Buổi 1",
    startDatetime: new Date(Date.now() - 60e3), endDatetime: new Date(Date.now() + 36e5), status: "SCHEDULED",
    recording: { status: "AVAILABLE", storageKey: `private/${users.teacherA._id}/RECORDING/00000000-0000-0000-0000-000000000000.mp4` },
  });

  const enrollmentOf = (studentKey, cls, status = "CONFIRMED", extra = {}) =>
    Enrollment.create({
      classId: cls._id, courseId: course._id, teacherId: cls.teacherId, studentId: users[studentKey]._id,
      enrollmentStatus: status, tuitionAmount: 200000, paymentSource: "DIRECT_PAYMENT", ...extra,
    });
  const enrollmentA = await enrollmentOf("studentA", classA);
  const pendingA = await enrollmentOf("studentA", classB, "PENDING_PAYMENT", { holdExpiresAt: new Date(Date.now() + 6e5)});

  const payment = await Payment.create({ enrollmentId: enrollmentA._id, payerUserId: users.studentA._id, gateway: "SANDBOX", gatewayReference: "SBX-a", amount: 200000, paymentStatus: "COMPLETED" });

  const campaign = await ScholarshipCampaign.create({
    createdBy: users.admin._id, title: "HB", targetBudget: 1000000, expectedSlots: 2, awardAmountPerStudent: 100000, status: "OPEN_FOR_FUNDING",
    fundedAmount: 500000, applicationStart: WINDOW.start, applicationEnd: WINDOW.end, fundingStart: WINDOW.start, fundingEnd: WINDOW.end,
  });
  const application = await ScholarshipApplication.create({
    campaignId: campaign._id, studentId: users.studentA._id, statement: "bí mật hoàn cảnh của A", status: "NEED_MORE_INFORMATION",
    reviewedBy: users.admin._id, reviewNote: "bổ sung", submittedAt: new Date(),
  });
  const scholarship = await Scholarship.create({
    campaignId: campaign._id, applicationId: application._id, studentId: users.studentA._id, allocatedAmount: 100000, remainingAmount: 100000,
    validFrom: WINDOW.start, expiresAt: WINDOW.end, status: "ACTIVE",
  });
  const contribution = await SponsorContribution.create({ campaignId: campaign._id, sponsorId: users.sponsorA._id, amount: 500000, contributionStatus: "COMPLETED", paymentReference: "CTR-a" });

  const conversation = await Conversation.create({ participantIds: [users.studentA._id, users.teacherA._id], classId: classA._id });
  const message = await Message.create({ conversationId: conversation._id, senderId: users.studentA._id, content: "tin nhắn riêng tư" });
  const notification = await Notification.create({ userId: users.studentA._id, title: "Riêng của A" });
  const report = await Report.create({ reporterId: users.studentA._id, classId: classA._id, type: "TEACHING_QUALITY", description: "khiếu nại của A", reviewedBy: users.admin._id, status: "IN_REVIEW" });
  const proposal = await CourseProposal.create({ teacherId: users.teacherA._id, categoryId: category._id, subjectId: subject._id, title: "Đề xuất của A", status: "PENDING_REVIEW", reviewedBy: users.admin._id });
  await User.updateOne({ _id: users.teacherA._id }, { $set: { "teacherProfile.reviewedBy": users.admin._id, "teacherProfile.reviewNote": "đã duyệt" } });

  data = { category, subject, course, classA, classB, draftA, session, enrollmentA, pendingA, payment, campaign, application, scholarship, contribution, conversation, message, notification, report, proposal };
});

afterAll(disconnectDB);

describe("Route matrix: read from the routers themselves", () => {
  const routes = declaredRoutes();

  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(90);
    expect([...PUBLIC_ROUTES].filter((key) => !routes.some((route) => routeKey(route) === key))).toEqual([]);
  });

  it("every non-public route refuses a request without a token", async () => {
    const open = [];
    process.env.NODE_ENV = "development"; // "test" keeps its own auth shortcut, which would hide a missing guard
    try {
      for (const route of routes.filter((r) => !PUBLIC_ROUTES.has(routeKey(r)))) {
        const res = await call(null, route.method, fill(route.path));
        if (res.statusCode !== 401) open.push(`${routeKey(route)} -> ${res.statusCode}`);
      }
    } finally {
      process.env.NODE_ENV = "test";
    }
    expect(open).toEqual([]);
  });

  it.each([
    ["/api/admin/", ["studentA", "teacherA", "sponsorA"]],
    ["/api/teacher/", ["studentA", "sponsorA", "admin"]],
    ["/api/sponsor/", ["studentA", "teacherA", "admin"]],
  ])("routes under %s refuse the other roles", async (prefix, roles) => {
    const leaks = [];
    for (const route of routes.filter((r) => r.path.startsWith(prefix))) {
      for (const role of roles) {
        const res = await call(role, route.method, fill(route.path)).send({});
        if (res.statusCode !== 403) leaks.push(`${role} ${routeKey(route)} -> ${res.statusCode}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it.each([
    ["get", "/api/me/scholarships"],
    ["get", "/api/me/scholarship-applications"],
    ["get", "/api/me/sessions"],
    ["get", "/api/me/payments"],
  ])("student data route %s %s refuses other roles", async (method, url) => {
    for (const role of ["teacherA", "sponsorA", "admin"]) {
      expect((await call(role, method, url)).statusCode).toBe(403);
    }
  });
});

describe("Another student's data", () => {
  const OTHER = "studentB";

  it("enrollment", async () => {
    const id = data.enrollmentA._id;
    expect((await call(OTHER, "get", `/api/enrollments/${id}`)).statusCode).toBe(404);
    expect((await call(OTHER, "post", `/api/enrollments/${data.pendingA._id}/cancel`)).statusCode).toBe(404);
    expect((await Enrollment.findById(data.pendingA._id)).enrollmentStatus).toBe("PENDING_PAYMENT");
    expect((await call(OTHER, "get", `/api/enrollments/${id}/payments`)).statusCode).toBe(404);
    expect((await call(OTHER, "post", `/api/enrollments/${data.pendingA._id}/payments`)).statusCode).toBe(404);
    expect((await call(OTHER, "post", `/api/enrollments/${data.pendingA._id}/scholarship-payment`).send({})).statusCode).toBe(404);
  });

  it("payment", async () => {
    expect((await call(OTHER, "get", `/api/payments/${data.payment._id}`)).statusCode).toBe(404);
    expect((await call("teacherA", "get", `/api/payments/${data.payment._id}`)).statusCode).toBe(404);
    expect((await call("studentA", "get", `/api/payments/${data.payment._id}`)).statusCode).toBe(200);
  });

  it("another student's scholarship cannot pay for my enrollment", async () => {
    const session = await call(OTHER, "post", `/api/classes/${data.classB._id}/enrollments`);
    expect(session.statusCode).toBe(201);
    const enrollmentId = session.body.data._id || session.body.data.id;
    const res = await call(OTHER, "post", `/api/enrollments/${enrollmentId}/scholarship-payment`).send({ scholarshipId: data.scholarship._id });
    expect(res.statusCode).toBe(404);
    expect((await Scholarship.findById(data.scholarship._id)).remainingAmount.toString()).toBe("100000");
  });

  it("scholarship applications", async () => {
    const list = await call(OTHER, "get", "/api/me/scholarship-applications");
    expect(JSON.stringify(list.body)).not.toContain("bí mật hoàn cảnh");
    const resubmit = await call(OTHER, "post", `/api/me/scholarship-applications/${data.application._id}/resubmit`).send({ statement: "bị sửa" });
    expect(resubmit.statusCode).toBe(404);
    expect((await ScholarshipApplication.findById(data.application._id)).statement).toBe("bí mật hoàn cảnh của A");
    expect((await call(OTHER, "get", "/api/me/scholarships")).body.data).toEqual([]);
  });

  it("conversations and messages", async () => {
    const id = data.conversation._id;
    expect((await call(OTHER, "get", `/api/conversations/${id}/messages`)).statusCode).toBe(404);
    expect((await call("teacherB", "get", `/api/conversations/${id}/messages`)).statusCode).toBe(404);
    expect((await call(OTHER, "post", `/api/conversations/${id}/messages`).send({ content: "chen vào" })).statusCode).toBe(404);
    expect((await call(OTHER, "delete", `/api/messages/${data.message._id}`)).statusCode).toBe(404);
    expect((await call("teacherA", "delete", `/api/messages/${data.message._id}`)).statusCode).toBe(403);
    expect((await Message.findById(data.message._id)).isDeleted).toBeFalsy();
    expect((await call(OTHER, "get", "/api/conversations")).body.data.total).toBe(0);
  });

  it("notifications", async () => {
    expect((await call(OTHER, "post", `/api/me/notifications/${data.notification._id}/read`)).statusCode).toBe(404);
    expect((await Notification.findById(data.notification._id)).isRead).toBeFalsy();
    await call(OTHER, "post", "/api/me/notifications/read-all");
    expect((await Notification.findById(data.notification._id)).isRead).toBeFalsy();
    expect(JSON.stringify((await call(OTHER, "get", "/api/me/notifications")).body)).not.toContain("Riêng của A");
  });

  it("reports", async () => {
    expect(JSON.stringify((await call(OTHER, "get", "/api/me/reports")).body)).not.toContain("khiếu nại của A");
  });

  it("classroom and recording need a confirmed enrollment", async () => {
    const id = data.session._id;
    expect((await call(OTHER, "post", `/api/sessions/${id}/join`)).statusCode).toBe(403);
    expect((await call(OTHER, "get", `/api/sessions/${id}/join`)).statusCode).toBe(403);
    expect((await call(OTHER, "get", `/api/sessions/${id}/recording`)).statusCode).toBe(403);
    expect((await call("teacherB", "post", `/api/sessions/${id}/join`)).statusCode).toBe(403);
    expect((await call("sponsorA", "post", `/api/sessions/${id}/join`)).statusCode).toBe(403);
    expect((await call("studentA", "post", `/api/sessions/${id}/join`)).statusCode).toBe(200);
  });

  it("a review needs an enrollment", async () => {
    const res = await call("studentB", "post", `/api/classes/${data.classA._id}/reviews`).send({ rating: 1, comment: "x" });
    expect(res.statusCode).toBe(403);
  });
});

describe("Another teacher's data", () => {
  const OTHER = "teacherB";

  it("classes", async () => {
    const id = data.classA._id;
    expect((await call(OTHER, "get", `/api/teacher/classes/${id}`)).statusCode).toBe(403);
    expect((await call(OTHER, "patch", `/api/teacher/classes/${data.draftA._id}`).send({ className: "bị sửa" })).statusCode).toBe(403);
    expect((await call(OTHER, "post", `/api/teacher/classes/${data.draftA._id}/submit`)).statusCode).toBe(403);
    expect((await call(OTHER, "get", `/api/teacher/classes/${id}/students`)).statusCode).toBe(403);
    expect((await call(OTHER, "get", `/api/teacher/classes/${id}/planned-sessions`)).statusCode).toBe(403);
    expect((await call(OTHER, "post", `/api/teacher/classes/${id}/sessions`).send({ title: "x" })).statusCode).toBe(403);
    expect((await Class.findById(data.draftA._id)).className).toBe("Lớp nháp A");
    expect(JSON.stringify((await call(OTHER, "get", "/api/teacher/classes")).body)).not.toContain("Lớp nháp A");
  });

  it("sessions", async () => {
    const id = data.session._id;
    expect((await call(OTHER, "patch", `/api/teacher/sessions/${id}`).send({ title: "bị sửa" })).statusCode).toBe(403);
    expect((await call(OTHER, "post", `/api/teacher/sessions/${id}/end`)).statusCode).toBe(403);
    expect((await call(OTHER, "delete", `/api/teacher/sessions/${id}`)).statusCode).toBe(403);
    expect((await call(OTHER, "get", `/api/teacher/sessions/${id}/attendance`)).statusCode).toBe(403);
    expect((await Session.findById(id)).title).toBe("Buổi 1");
  });

  it("course proposals", async () => {
    const res = await call(OTHER, "patch", `/api/teacher/course-proposals/${data.proposal._id}`).send({ title: "bị sửa" });
    expect(res.statusCode).toBe(404);
    expect((await CourseProposal.findById(data.proposal._id)).title).toBe("Đề xuất của A");
    expect(JSON.stringify((await call(OTHER, "get", "/api/teacher/course-proposals")).body)).not.toContain("Đề xuất của A");
  });

  it("earnings only ever show the caller's", async () => {
    const res = await call(OTHER, "get", `/api/teacher/earnings?teacherId=${users.teacherA._id}`);
    expect(JSON.stringify(res.body)).not.toContain(users.teacherA._id.toString());
  });
});

describe("Another sponsor's data", () => {
  it("impact and contributions", async () => {
    expect((await call("sponsorB", "get", `/api/sponsor/campaigns/${data.campaign._id}/impact`)).statusCode).toBe(403);
    expect((await call("sponsorA", "get", `/api/sponsor/campaigns/${data.campaign._id}/impact`)).statusCode).toBe(200);
    expect((await call("sponsorB", "get", "/api/sponsor/contributions")).body.data.total).toBe(0);
  });
});

describe("Private files", () => {
  it("only the owner or an admin can sign a URL", async () => {
    const key = `private/${users.studentA._id}/IDENTITY/00000000-0000-0000-0000-000000000000.pdf`;
    const sign = (name) => call(name, "post", "/api/files/signed-url").send({ storageKey: key });
    expect((await sign("studentB")).statusCode).toBe(404);
    expect((await sign("teacherA")).statusCode).toBe(404);
    expect((await sign("studentA")).statusCode).toBe(200);
    expect((await sign("admin")).statusCode).toBe(200);
  });

  it("refuses path tricks in the key", async () => {
    const res = await call("studentB", "post", "/api/files/signed-url").send({ storageKey: `private/${users.studentB._id}/IDENTITY/../../../.env` });
    expect(res.statusCode).toBe(404);
  });

  it("a document cannot reference someone else's file", async () => {
    const key = `private/${users.studentA._id}/SCHOLARSHIP_PROOF/00000000-0000-0000-0000-000000000000.pdf`;
    const res = await call("studentB", "post", `/api/campaigns/${data.campaign._id}/applications`).send({ statement: "x", documents: [{ files: [{ storageKey: key }] }] });
    expect(res.statusCode).toBe(400);
  });

  it("clients cannot upload under the server-only RECORDING purpose", async () => {
    const res = await call("studentA", "post", "/api/uploads/private")
      .field("purpose", "RECORDING")
      .attach("file", Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom0000")]), { filename: "x.mp4", contentType: "video/mp4" });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/purpose/);
  });

  it("students and sponsors cannot upload class cover images", async () => {
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const upload = (name, purpose) => call(name, "post", "/api/uploads/public").field("purpose", purpose).attach("file", PNG, { filename: "x.png", contentType: "image/png" });
    expect((await upload("studentA", "COVER_IMAGE")).statusCode).toBe(403);
    expect((await upload("sponsorA", "COVER_IMAGE")).statusCode).toBe(403);
    expect((await upload("teacherA", "COVER_IMAGE")).statusCode).toBe(201);
    expect((await upload("studentA", "AVATAR")).statusCode).toBe(201);
  });
});

describe("Messaging needs a relationship", () => {
  it("a teacher cannot open a conversation with a student they do not teach", async () => {
    const res = await call("teacherB", "post", "/api/conversations").send({ participantId: users.studentB._id });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("MESSAGING_NOT_ALLOWED");
  });

  it("a teacher can open one with their own student", async () => {
    const res = await call("teacherA", "post", "/api/conversations").send({ participantId: users.studentA._id });
    expect(res.statusCode).toBe(200);
  });

  it("a teacher can answer a student who wrote first", async () => {
    const opened = await call("studentB", "post", "/api/conversations").send({ participantId: users.teacherB._id });
    expect(opened.statusCode).toBe(200);
    const answer = await call("teacherB", "post", "/api/conversations").send({ participantId: users.studentB._id });
    expect(answer.statusCode).toBe(200);
    await Conversation.deleteMany({ participantIds: users.studentB._id });
  });

  it("the class of a conversation must belong to the teacher", async () => {
    const res = await call("studentA", "post", "/api/conversations").send({ participantId: users.teacherA._id, classId: data.classB._id });
    expect(res.statusCode).toBe(404);
  });
});

describe("Mass assignment", () => {
  it("a profile update cannot change role, status or verification", async () => {
    const res = await call("teacherB", "patch", "/api/me/profile").send({
      role: "ADMIN", status: "ACTIVE", email: "x@x.com", passwordHash: "x", tokenVersion: 99,
      verificationStatus: "VERIFIED", ratingAverage: 5, teacherProfile: { verificationStatus: "VERIFIED", ratingAverage: 5 },
      fullName: "Giáo viên B",
    });
    expect(res.statusCode).toBe(200);
    const fresh = await User.findById(users.teacherB._id);
    expect(fresh.role).toBe("TEACHER");
    expect(fresh.email).toBe("teacherB@test.com".toLowerCase());
    expect(fresh.teacherProfile.ratingAverage).toBe(0);
    expect(fresh.tokenVersion || 0).toBe(0);
  });

  it("a class update cannot change its status or owner", async () => {
    const res = await call("teacherA", "patch", `/api/teacher/classes/${data.draftA._id}`).send({
      status: "OPEN", teacherId: users.teacherB._id, enrolledCount: 9, reviewNote: "x", ratingAverage: 5,
    });
    expect(res.statusCode).toBe(200);
    const fresh = await Class.findById(data.draftA._id);
    expect(fresh.status).toBe("DRAFT");
    expect(fresh.teacherId.toString()).toBe(users.teacherA._id.toString());
    expect(fresh.enrolledCount).toBe(0);
  });

  it("a class cover image must be an image location, not arbitrary content", async () => {
    for (const coverImage of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", { $gt: "" }]) {
      const res = await call("teacherA", "patch", `/api/teacher/classes/${data.draftA._id}`).send({ coverImage });
      expect(res.statusCode).toBe(400);
    }
    const ok = await call("teacherA", "patch", `/api/teacher/classes/${data.draftA._id}`).send({ coverImage: "/uploads/cover_image/a.png" });
    expect(ok.statusCode).toBe(200);
  });

  it("an application decides nothing about its own review", async () => {
    await ScholarshipApplication.deleteMany({ studentId: users.studentB._id });
    const up = await call("studentB", "post", "/api/uploads/private")
      .field("purpose", "SCHOLARSHIP_PROOF")
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF\n"), { filename: "p.pdf", contentType: "application/pdf" });
    const res = await call("studentB", "post", `/api/campaigns/${data.campaign._id}/applications`).send({
      statement: "x", status: "APPROVED", awardAmountPerStudent: 999999, documents: [{ files: [{ storageKey: up.body.data.storageKey }] }],
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.data.status).toBe("SUBMITTED");
    expect(Number(res.body.data.awardAmountPerStudent)).toBe(100000);
  });
});

describe("Responses do not leak", () => {
  const sensitive = () => [
    "passwordHash", "tokenHash", "tokenVersion", "scrypt$",
    users.admin._id.toString(),
    "admin@test.com",
    "ghi chú nội bộ",
  ];
  const SCANS = () => [
    [null, "/api/classes"],
    [null, `/api/classes/${data.classA._id}`],
    [null, `/api/classes/${data.classA._id}/sessions`],
    [null, `/api/classes/${data.classA._id}/reviews`],
    [null, "/api/teachers"],
    [null, `/api/teachers/${users.teacherA._id}`],
    [null, "/api/courses"],
    [null, `/api/courses/${data.course._id}`],
    [null, `/api/courses/${data.course._id}/classes`],
    [null, "/api/categories"],
    [null, `/api/categories/${data.category._id}/subjects`],
    [null, `/api/subjects/${data.subject._id}`],
    [null, "/api/campaigns"],
    [null, `/api/campaigns/${data.campaign._id}`],
    ["studentA", "/api/auth/me"],
    ["studentA", "/api/me/profile"],
    ["studentA", "/api/me/enrollments"],
    ["studentA", "/api/me/enrollments?include=class"],
    ["studentA", `/api/enrollments/${data.enrollmentA._id}`],
    ["studentA", "/api/me/sessions"],
    ["studentA", "/api/me/payments"],
    ["studentA", `/api/payments/${data.payment._id}`],
    ["studentA", "/api/me/scholarship-applications"],
    ["studentA", "/api/me/scholarships"],
    ["studentA", "/api/me/reports"],
    ["studentA", "/api/conversations"],
    ["sponsorA", "/api/sponsor/contributions"],
    ["sponsorA", `/api/sponsor/campaigns/${data.campaign._id}/impact`],
    ["teacherA", `/api/teacher/classes/${data.classA._id}/students`],
    ["teacherA", "/api/conversations"],
  ];

  it("no staff id, review note or secret in what public and regular users receive", async () => {
    const found = [];
    for (const [who, url] of SCANS()) {
      const res = await call(who, "get", url);
      if (res.statusCode !== 200) found.push(`${who || "public"} ${url} -> HTTP ${res.statusCode}`);
      const body = JSON.stringify(res.body);
      sensitive().filter((text) => body.includes(text)).forEach((text) => found.push(`${who || "public"} ${url} lộ "${text.length > 20 ? "id admin" : text}"`));
    }
    expect(found).toEqual([]);
  });

  it("teachers do not see which admin reviewed their work", async () => {
    const found = [];
    for (const url of [
      "/api/teacher/classes",
      `/api/teacher/classes/${data.classA._id}`,
      "/api/teacher/verification",
      "/api/teacher/course-proposals",
      "/api/teacher/earnings",
    ]) {
      const res = await call("teacherA", "get", url);
      if (res.statusCode !== 200) found.push(`${url} -> HTTP ${res.statusCode}`);
      if (JSON.stringify(res.body).includes(users.admin._id.toString())) found.push(`${url} lộ id admin`);
    }
    expect(found).toEqual([]);
  });

  it("the people who need them keep the review note and the outcome", async () => {
    const own = await call("teacherA", "get", `/api/teacher/classes/${data.classA._id}`);
    expect(own.body.data.reviewNote).toBe("ghi chú nội bộ của admin");
    const applications = await call("studentA", "get", "/api/me/scholarship-applications");
    expect(applications.body.data.items[0].reviewNote).toBe("bổ sung");
    const verification = await call("teacherA", "get", "/api/teacher/verification");
    expect(verification.body.data.reviewNote).toBe("đã duyệt");
    const adminView = await call("admin", "get", `/api/admin/reports/${data.report._id}`);
    expect(adminView.body.data.handledBy.id).toBe(users.admin._id.toString());
    const adminVerification = await call("admin", "get", `/api/admin/teacher-verifications/${users.teacherA._id}`);
    expect(adminVerification.body.data.reviewedBy).toBe(users.admin._id.toString());
  });

  it("a student never sees another student's email through the public API", async () => {
    for (const url of [`/api/classes/${data.classA._id}/reviews`, `/api/classes/${data.classA._id}`]) {
      expect(JSON.stringify((await request(app).get(url)).body)).not.toContain("studenta@test.com");
    }
  });
});

describe("Hostile query input on public search", () => {
  it.each(["(", "[", "a{1,", ".*", "(a+)+$"])("search=%s is treated as plain text", async (search) => {
    const res = await request(app).get("/api/classes").query({ search });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it("finds a class by its literal name", async () => {
    const res = await request(app).get("/api/classes").query({ search: "giáo viên A" });
    expect(res.body.data.total).toBeGreaterThan(0);
  });

  it.each([
    "statuses=OPEN&statuses=CANCELLED",
    "classTypes=FREE&classTypes=PAID",
    "search=a&search=b",
    "minPrice=abc",
    "maxPrice=abc",
    "sort=a&sort=b",
    "page=-1",
    "pageSize=-5",
  ])("?%s is not a server error", async (qs) => {
    const res = await request(app).get(`/api/classes?${qs}`);
    expect(res.statusCode).toBeLessThan(500);
  });

  it.each([
    ["studentA", "/api/me/enrollments?page=-1&limit=-5"],
    ["admin", "/api/admin/payments?page=-1&limit=-5"],
    ["admin", "/api/admin/transactions?page=abc&limit=abc"],
    [null, "/api/teachers?limit=-5"],
    [null, "/api/courses?page=-1"],
    [null, "/api/campaigns?page=-1&pageSize=-1"],
  ])("%s %s is not a server error", async (who, url) => {
    expect((await call(who, "get", url)).statusCode).toBe(200);
  });

  it("page sizes are capped", async () => {
    const res = await request(app).get("/api/classes?pageSize=100000");
    expect(res.body.data.pageSize).toBe(100);
  });

  it("?statuses cannot reach unpublished classes", async () => {
    const res = await request(app).get("/api/classes?statuses=DRAFT,PENDING_APPROVAL,REJECTED");
    expect(res.statusCode).toBeLessThan(500);
    expect(JSON.stringify(res.body)).not.toContain("Lớp nháp A");
  });

  it.each(["/api/classes/not-an-id", "/api/classes/not-an-id/sessions", "/api/teachers/not-an-id"])("%s is not a server error", async (url) => {
    expect((await request(app).get(url)).statusCode).toBeLessThan(500);
  });

  it("a suspended teacher's profile is not public", async () => {
    await User.updateOne({ _id: users.teacherB._id }, { $set: { status: "SUSPENDED" } });
    expect((await request(app).get(`/api/teachers/${users.teacherB._id}`)).statusCode).toBe(404);
    await User.updateOne({ _id: users.teacherB._id }, { $set: { status: "ACTIVE" } });
    expect((await request(app).get(`/api/teachers/${users.teacherB._id}`)).statusCode).toBe(200);
  });

  it("a soft-deleted class keeps its sessions hidden", async () => {
    await Class.updateOne({ _id: data.classB._id }, { $set: { isDeleted: true } });
    expect((await request(app).get(`/api/classes/${data.classB._id}/sessions`)).statusCode).toBe(404);
    await Class.updateOne({ _id: data.classB._id }, { $set: { isDeleted: false } });
  });

  it("unpublished classes stay hidden by id", async () => {
    expect((await request(app).get(`/api/classes/${data.draftA._id}`)).statusCode).toBe(404);
    expect((await request(app).get(`/api/classes/${data.draftA._id}/sessions`)).statusCode).toBe(404);
  });
});
