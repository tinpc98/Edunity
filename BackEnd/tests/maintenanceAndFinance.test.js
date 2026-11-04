const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}

const request = require("supertest");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  Enrollment,
  TeacherEarning,
  Transaction,
  Notification,
  Scholarship,
  ScholarshipCampaign,
  ScholarshipApplication,
  SessionRefundReview,
} = require("../src/models");
const { runMaintenanceJob } = require("../src/jobs/maintenanceJob");
const jobLock = require("../src/jobs/jobLock");
const JobLock = require("../src/models/JobLock");
const { toDec } = require("../src/utils/money");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("Maintenance, scheduling rules and finance (C01-C05, F02-F04, L16, H03, N03)", () => {
  let admin, teacher, student, category, subject, course;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });
  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    const passwordHash = hashPassword("password123");
    admin = await User.create({ email: "admin@test.com", passwordHash, role: "ADMIN" });
    teacher = await User.create({
      email: "teacher@test.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Teacher", verificationStatus: "VERIFIED" },
    });
    student = await User.create({
      email: "s@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student" },
    });
    category = await Category.create({ name: "IT", slug: "it", createdBy: admin._id, status: "ACTIVE" });
    subject = await Subject.create({
      name: "Prog",
      slug: "prog",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    course = await Course.create({
      title: "Node",
      slug: "node",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
  });

  const makeClass = (overrides = {}) =>
    Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Class X",
      classType: "PAID",
      price: 400000,
      capacity: 10,
      status: "OPEN",
      startDate: new Date(Date.now() - 10 * DAY),
      endDate: new Date(Date.now() + 30 * DAY),
      ...overrides,
    });

  const makeSession = (cls, overrides = {}) =>
    Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "S",
      startDatetime: new Date(Date.now() + DAY),
      endDatetime: new Date(Date.now() + DAY + HOUR),
      ...overrides,
    });

  const enroll = (cls, overrides = {}) =>
    Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: toDec(400000),
      amountPaidViaPayment: toDec(400000),
      ...overrides,
    });

  describe("C01: class lifecycle", () => {
    it("moves OPEN → IN_PROGRESS once a session started, and → COMPLETED when all sessions are final and the period ended", async () => {
      const cls = await makeClass({ endDate: new Date(Date.now() - HOUR) });
      const enrollment = await enroll(cls);
      await TeacherEarning.create({
        teacherId: teacher._id,
        enrollmentId: enrollment._id,
        classId: cls._id,
        grossAmount: toDec(400000),
        commissionAmount: toDec(40000),
        netAmount: toDec(360000),
      });
      const s1 = await makeSession(cls, {
        startDatetime: new Date(Date.now() - 3 * HOUR),
        endDatetime: new Date(Date.now() - 2 * HOUR),
        status: "IN_PROGRESS",
      });

      await runMaintenanceJob(new Date());
      expect((await Class.findById(cls._id)).status).toBe("IN_PROGRESS");

      await Session.updateOne({ _id: s1._id }, { $set: { status: "COMPLETED" } });
      await runMaintenanceJob(new Date());

      expect((await Class.findById(cls._id)).status).toBe("COMPLETED");
      expect((await Enrollment.findById(enrollment._id)).enrollmentStatus).toBe("COMPLETED");
      expect((await TeacherEarning.findOne({ enrollmentId: enrollment._id })).status).toBe("AVAILABLE");
    });

    it("keeps an OPEN class whose sessions have not started open for enrollment", async () => {
      const cls = await makeClass();
      await makeSession(cls);
      await runMaintenanceJob(new Date());
      expect((await Class.findById(cls._id)).status).toBe("OPEN");
    });
  });

  describe("C02-C05: schedule rules", () => {
    it("locks the schedule of an OPEN class: no time change, cancel or new session — title edits still allowed", async () => {
      const cls = await makeClass();
      const s = await makeSession(cls);

      const move = await request(app)
        .patch(`/api/teacher/sessions/${s._id}`)
        .set(as(teacher))
        .send({ startDatetime: new Date(Date.now() + 2 * DAY), endDatetime: new Date(Date.now() + 2 * DAY + HOUR) });
      expect(move.body.error).toBe("RESCHEDULE_REQUIRED");

      const cancel = await request(app).patch(`/api/teacher/sessions/${s._id}`).set(as(teacher)).send({ status: "CANCELLED" });
      expect(cancel.body.error).toBe("RESCHEDULE_REQUIRED");

      const add = await request(app)
        .post(`/api/teacher/classes/${cls._id}/sessions`)
        .set(as(teacher))
        .send({ title: "Extra", startDatetime: new Date(Date.now() + 3 * DAY), endDatetime: new Date(Date.now() + 3 * DAY + HOUR) });
      expect(add.body.error).toBe("RESCHEDULE_REQUIRED");

      const rename = await request(app).patch(`/api/teacher/sessions/${s._id}`).set(as(teacher)).send({ title: "Renamed" });
      expect(rename.statusCode).toBe(200);
      expect(rename.body.data.title).toBe("Renamed");
    });

    it("rejects sessions overlapping the teacher's other sessions or each other", async () => {
      const other = await makeClass({ className: "Other", status: "OPEN" });
      const at = Date.now() + 2 * DAY;
      await makeSession(other, { startDatetime: new Date(at), endDatetime: new Date(at + HOUR) });
      const draft = await makeClass({ className: "Draft", status: "DRAFT" });

      const clash = await request(app)
        .post(`/api/teacher/classes/${draft._id}/sessions`)
        .set(as(teacher))
        .send({ title: "Clash", startDatetime: new Date(at + 30 * 60000), endDatetime: new Date(at + 90 * 60000) });
      expect(clash.body.error).toBe("SESSION_TIME_CONFLICT");

      const selfClash = await request(app)
        .post(`/api/teacher/classes/${draft._id}/sessions`)
        .set(as(teacher))
        .send({
          sessions: [
            { title: "A", startDatetime: new Date(at + 3 * HOUR), endDatetime: new Date(at + 5 * HOUR) },
            { title: "B", startDatetime: new Date(at + 4 * HOUR), endDatetime: new Date(at + 6 * HOUR) },
          ],
        });
      expect(selfClash.body.error).toBe("SESSION_TIME_CONFLICT");

      const ok = await request(app)
        .post(`/api/teacher/classes/${draft._id}/sessions`)
        .set(as(teacher))
        .send({ title: "Fine", startDatetime: new Date(at + 2 * HOUR), endDatetime: new Date(at + 3 * HOUR) });
      expect(ok.statusCode).toBe(201);
    });
  });

  describe("F04: scholarship expiry", () => {
    it("expires an ACTIVE scholarship past its date and returns the unused balance to the campaign", async () => {
      const campaign = await ScholarshipCampaign.create({
        title: "Camp",
        description: "d",
        targetBudget: toDec(1000000),
        expectedSlots: 3,
        awardAmountPerStudent: toDec(300000),
        fundedAmount: toDec(1000000),
        allocatedAmount: toDec(300000),
        status: "OPEN_FOR_FUNDING",
        createdBy: admin._id,
        startDate: new Date(Date.now() - 30 * DAY),
        endDate: new Date(Date.now() + 30 * DAY),
      });
      const application = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: student._id,
        status: "APPROVED",
      });
      const scholarship = await Scholarship.create({
        campaignId: campaign._id,
        applicationId: application._id,
        studentId: student._id,
        allocatedAmount: toDec(300000),
        remainingAmount: toDec(100000),
        validFrom: new Date(Date.now() - 200 * DAY),
        expiresAt: new Date(Date.now() - DAY),
        status: "ACTIVE",
      });

      await runMaintenanceJob(new Date());

      expect((await Scholarship.findById(scholarship._id)).status).toBe("EXPIRED");
      expect(Number((await ScholarshipCampaign.findById(campaign._id)).allocatedAmount.toString())).toBe(200000);
      expect(await Notification.exists({ userId: student._id, type: "SCHOLARSHIP_EXPIRED" })).toBeTruthy();
    });
  });

  describe("L16: recording retention", () => {
    it("deletes recordings past retention and fails recordings stuck in PROCESSING", async () => {
      const cls = await makeClass();
      const key = `private/${teacher._id}/RECORDING/11111111-1111-1111-1111-111111111111.mp4`;
      const file = path.join(process.env.STORAGE_DIR, key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "video");

      const old = await makeSession(cls, {
        status: "COMPLETED",
        startDatetime: new Date(Date.now() - 100 * DAY),
        endDatetime: new Date(Date.now() - 100 * DAY + HOUR),
        recording: { status: "AVAILABLE", storageKey: key, availableAt: new Date(Date.now() - 95 * DAY) },
      });
      const stuck = await makeSession(cls, {
        status: "COMPLETED",
        startDatetime: new Date(Date.now() - 2 * DAY),
        endDatetime: new Date(Date.now() - 2 * DAY + HOUR),
        recording: { status: "PROCESSING", stoppedAt: new Date(Date.now() - DAY) },
      });

      await runMaintenanceJob(new Date());

      const oldSaved = await Session.findById(old._id).lean();
      expect(oldSaved.recording.status).toBe("EXPIRED");
      expect(fs.existsSync(file)).toBe(false);
      expect((await Session.findById(stuck._id).lean()).recording.status).toBe("FAILED");
    });
  });

  describe("H03: job lock", () => {
    it("lets only one holder run a job until the lease expires", async () => {
      expect(await jobLock.acquire("demo", 60000)).toBe(true);
      await JobLock.updateOne({ name: "demo" }, { $set: { owner: "other-instance" } });
      expect(await jobLock.acquire("demo", 60000)).toBe(false);
      const skipped = await jobLock.runExclusive("demo", 60000, async () => "ran");
      expect(skipped).toMatchObject({ skipped: true });

      await JobLock.updateOne({ name: "demo" }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
      expect(await jobLock.runExclusive("demo", 60000, async () => "ran")).toBe("ran");
    });
  });

  describe("F02: payouts", () => {
    it("teacher requests a payout of AVAILABLE earnings, admin completes it", async () => {
      const cls = await makeClass({ status: "COMPLETED" });
      const enrollment = await enroll(cls, { enrollmentStatus: "COMPLETED" });
      await TeacherEarning.create({
        teacherId: teacher._id,
        enrollmentId: enrollment._id,
        classId: cls._id,
        grossAmount: toDec(400000),
        commissionAmount: toDec(40000),
        netAmount: toDec(360000),
        status: "AVAILABLE",
      });

      const missingBank = await request(app).post("/api/teacher/payouts").set(as(teacher)).send({});
      expect(missingBank.statusCode).toBe(400);

      const bank = { bankName: "VCB", accountNumber: "0123", accountHolderName: "TEACHER" };
      const req1 = await request(app).post("/api/teacher/payouts").set(as(teacher)).send(bank);
      expect(req1.statusCode).toBe(201);
      expect(req1.body.data.amount).toBe("360000");
      const dup = await request(app).post("/api/teacher/payouts").set(as(teacher)).send(bank);
      expect(dup.body.error).toBe("PAYOUT_ALREADY_PENDING");

      const list = await request(app).get("/api/admin/payouts").set(as(admin));
      expect(list.body.data.items).toHaveLength(1);

      const done = await request(app).post(`/api/admin/payouts/${req1.body.data.id}/complete`).set(as(admin)).send({});
      expect(done.body.data.status).toBe("COMPLETED");
      expect((await TeacherEarning.findOne({ enrollmentId: enrollment._id })).status).toBe("PAID_OUT");
      expect(await Transaction.exists({ transactionType: "TEACHER_PAYOUT", destinationUserId: teacher._id })).toBeTruthy();

      const again = await request(app).post(`/api/admin/payouts/${req1.body.data.id}/complete`).set(as(admin)).send({});
      expect(again.body.error).toBe("PAYOUT_ALREADY_PROCESSED");
    });
  });

  describe("F03: session refund", () => {
    it("approving a refund review records a REFUND, reduces the teacher earning, and cannot be approved twice", async () => {
      const cls = await makeClass();
      const enrollment = await enroll(cls);
      await TeacherEarning.create({
        teacherId: teacher._id,
        enrollmentId: enrollment._id,
        classId: cls._id,
        grossAmount: toDec(400000),
        commissionAmount: toDec(40000),
        netAmount: toDec(360000),
      });
      const sessions = [];
      for (let i = 0; i < 4; i++) {
        sessions.push(await makeSession(cls, { startDatetime: new Date(Date.now() + (i + 1) * DAY), endDatetime: new Date(Date.now() + (i + 1) * DAY + HOUR) }));
      }
      const review = await SessionRefundReview.create({
        sessionId: sessions[0]._id,
        classId: cls._id,
        studentId: student._id,
        teacherId: teacher._id,
        enrollmentId: enrollment._id,
        triggerReason: "TEACHER_NO_SHOW",
      });

      const res = await request(app)
        .post(`/api/admin/session-refund-reviews/${review._id}/review`)
        .set(as(admin))
        .send({ status: "APPROVED_FOR_PAYMENT_TEAM", note: "ok" });
      expect(res.statusCode).toBe(200);

      const saved = await SessionRefundReview.findById(review._id).lean();
      expect(saved.refundAmount).toBe(100000); // 400 000 / 4 sessions
      const tx = await Transaction.findById(saved.refundTransactionId).lean();
      expect(tx.transactionType).toBe("REFUND");
      expect(tx.amount.toString()).toBe("100000");
      const earning = await TeacherEarning.findOne({ enrollmentId: enrollment._id }).lean();
      expect(earning.grossAmount.toString()).toBe("300000");
      expect(earning.netAmount.toString()).toBe("270000");

      const twice = await request(app)
        .post(`/api/admin/session-refund-reviews/${review._id}/review`)
        .set(as(admin))
        .send({ status: "APPROVED_FOR_PAYMENT_TEAM" });
      expect(twice.body.error).toBe("REFUND_REVIEW_ALREADY_DECIDED");
      expect(await Transaction.countDocuments({ transactionType: "REFUND" })).toBe(1);
    });
  });

  describe("N03: enrollment notifications", () => {
    it("notifies the student and the teacher of a free enrollment", async () => {
      const cls = await makeClass({ classType: "FREE", price: 0 });
      const res = await request(app).post(`/api/classes/${cls._id}/enrollments`).set(as(student));
      expect(res.statusCode).toBe(201);
      expect(await Notification.exists({ userId: student._id, type: "ENROLLMENT_CONFIRMED" })).toBeTruthy();
      expect(await Notification.exists({ userId: teacher._id, type: "NEW_ENROLLMENT" })).toBeTruthy();
    });
  });
});
