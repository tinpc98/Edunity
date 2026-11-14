const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-teacher-access-"));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const videoProvider = require("../src/services/videoProvider");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  Enrollment,
  CourseProposal,
  Notification,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const pii = require("../src/utils/pii");

let identitySeq = 0;
const currentIdentity = () => {
  const idNumber = String(100000000000 + ++identitySeq); // unique per teacher: one CCCD, one account
  return {
    fullName: "Teacher",
    dateOfBirth: new Date("1990-01-01"),
    idNumberEnc: pii.encrypt(idNumber),
    idNumberHash: pii.blindIndex(idNumber),
    idNumberLast4: idNumber.slice(-4),
    addressEnc: pii.encrypt("1 Lê Lợi, Quận 1, TP.HCM"),
    submittedAt: new Date(),
  };
};

const PDF = Buffer.from("%PDF-1.4\n% test document\n%%EOF\n");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const DAY = 24 * 60 * 60 * 1000;

describe("Teacher Access Control by verificationStatus (P0-01, P1-01..P1-05)", () => {
  let users = {};
  let tokens = {};
  let category, subject, course;

  const bearer = (key) => ({ Authorization: `Bearer ${tokens[key]}` });

  const createTeacher = async (key, verificationStatus, status = "ACTIVE") => {
    const user = await User.create({
      email: `${key}@test.com`,
      passwordHash: hashPassword("password123"),
      role: "TEACHER",
      status,
      teacherProfile: {
        fullName: `Teacher ${key}`,
        verificationStatus,
        // A current verification (BAO-10): declared identity and an expiry far away, so re-verification is not open
        ...(verificationStatus === "VERIFIED" ? { identity: currentIdentity(), verifiedUntil: new Date(Date.now() + 150 * DAY) } : {}),
      },
    });
    tokens[key] = signAccessToken(user);
    users[key] = user;
    return user;
  };

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    users = {};
    tokens = {};

    const admin = await User.create({
      email: "admin@test.com",
      passwordHash: hashPassword("password123"),
      role: "ADMIN",
      status: "ACTIVE",
    });
    tokens.admin = signAccessToken(admin);
    users.admin = admin;

    const student = await User.create({
      email: "student@test.com",
      passwordHash: hashPassword("password123"),
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student One" },
    });
    tokens.student = signAccessToken(student);
    users.student = student;

    const sponsor = await User.create({
      email: "sponsor@test.com",
      passwordHash: hashPassword("password123"),
      role: "SPONSOR",
      status: "ACTIVE",
      sponsorProfile: { sponsorType: "INDIVIDUAL", representativeName: "Sponsor One" },
    });
    tokens.sponsor = signAccessToken(sponsor);
    users.sponsor = sponsor;

    await createTeacher("unverified", "UNVERIFIED");
    await createTeacher("pending", "PENDING");
    await createTeacher("rejected", "REJECTED");
    await createTeacher("verified", "VERIFIED");
    await createTeacher("verifiedOther", "VERIFIED");
    await createTeacher("inactivePendingUser", "VERIFIED", "PENDING");

    category = await Category.create({ name: "Khoa học", slug: "khoa-hoc", createdBy: admin._id });
    subject = await Subject.create({
      categoryId: category._id,
      categoryName: category.name,
      name: "Vật lý",
      slug: "vat-ly",
      createdBy: admin._id,
    });
    course = await Course.create({
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      title: "Vật lý 10",
      slug: "vat-ly-10",
      createdBy: admin._id,
    });
  });

  describe("P1-05: User.status must be ACTIVE independently of verificationStatus", () => {
    it("blocks login and authenticated requests when User.status is PENDING even if teacherProfile is VERIFIED", async () => {
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "inactivependinguser@test.com", password: "password123" });
      expect(loginRes.statusCode).toBe(403);
      expect(loginRes.body.error).toBe("ACCOUNT_NOT_ACTIVE");

      const apiRes = await request(app)
        .get("/api/me/profile")
        .set(bearer("inactivePendingUser"));
      expect(apiRes.statusCode).toBe(403);
      expect(apiRes.body.error).toBe("ACCOUNT_NOT_ACTIVE");
    });

    it("allows login, Dashboard reads and Profile management for ACTIVE teachers of all 4 verification statuses", async () => {
      for (const statusKey of ["unverified", "pending", "rejected", "verified"]) {
        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({ email: `${statusKey}@test.com`, password: "password123" });
        expect(loginRes.statusCode).toBe(200);

        expect((await request(app).get("/api/me/profile").set(bearer(statusKey))).statusCode).toBe(200);
        expect(
          (await request(app).patch("/api/me/profile").set(bearer(statusKey)).send({ biography: "Cập nhật tiểu sử" }))
            .statusCode
        ).toBe(200);
        expect((await request(app).get("/api/teacher/verification").set(bearer(statusKey))).statusCode).toBe(200);
        expect((await request(app).get("/api/teacher/classes").set(bearer(statusKey))).statusCode).toBe(200);
        expect((await request(app).get("/api/teacher/earnings").set(bearer(statusKey))).statusCode).toBe(200);
      }
    });
  });

  describe("P1-01: CourseProposal requires VERIFIED Teacher", () => {
    it("denies creating or updating CourseProposal for UNVERIFIED, PENDING, and REJECTED teachers without writing data", async () => {
      const existingProposal = await CourseProposal.create({
        teacherId: users.pending._id,
        categoryId: category._id,
        subjectId: subject._id,
        title: "Đề xuất cũ",
        description: "Mô tả",
        status: "NEED_CHANGES",
      });

      for (const statusKey of ["unverified", "pending", "rejected"]) {
        const createRes = await request(app)
          .post("/api/teacher/course-proposals")
          .set(bearer(statusKey))
          .send({
            categoryId: category._id,
            subjectId: subject._id,
            title: `Khóa từ ${statusKey}`,
            description: "Mô tả chi tiết",
             verificationStatus: "VERIFIED",
          });
        expect(createRes.statusCode).toBe(403);
        expect(createRes.body.error).toBe("TEACHER_NOT_VERIFIED");
      }

      const updateRes = await request(app)
        .patch(`/api/teacher/course-proposals/${existingProposal._id}`)
        .set(bearer("pending"))
        .send({ title: "Cố tình sửa khi chưa verified" });
      expect(updateRes.statusCode).toBe(403);
      expect(updateRes.body.error).toBe("TEACHER_NOT_VERIFIED");

      expect(await CourseProposal.countDocuments()).toBe(1);
      expect((await CourseProposal.findById(existingProposal._id)).title).toBe("Đề xuất cũ");
      expect(await Notification.countDocuments({ userId: users.admin._id })).toBe(0);
    });

    it("allows VERIFIED teacher to create/update own proposal and Admin to approve, while blocking non-owner teacher", async () => {
      const created = await request(app)
        .post("/api/teacher/course-proposals")
        .set(bearer("verified"))
        .send({
          categoryId: category._id,
          subjectId: subject._id,
          title: "Vật lý Hạt nhân",
          description: "Chuyên đề nâng cao",
        });
      expect(created.statusCode).toBe(201);

      const nonOwnerEdit = await request(app)
        .patch(`/api/teacher/course-proposals/${created.body.data.id}`)
        .set(bearer("verifiedOther"))
        .send({ title: "Chiếm quyền" });
      expect(nonOwnerEdit.statusCode).toBe(404);

      const ownerEdit = await request(app)
        .patch(`/api/teacher/course-proposals/${created.body.data.id}`)
        .set(bearer("verified"))
        .send({ syllabus: "Chương 1, Chương 2" });
      expect(ownerEdit.statusCode).toBe(200);

      const approved = await request(app)
        .post(`/api/admin/course-proposals/${created.body.data.id}/approve`)
        .set(bearer("admin"))
        .send({});
      expect(approved.statusCode).toBe(200);
      expect(approved.body.data.proposal.status).toBe("APPROVED");
    });
  });

  describe("P1-03: Class and Session mutations require VERIFIED Teacher, ownership, and valid class status", () => {
    it("denies class creation, update, submit, student roster, and session CRUD for non-VERIFIED teachers", async () => {
      // Seed a DRAFT class & SCHEDULED session owned by `rejected` (simulating demoted/legacy state)
      const draftCls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: users.rejected._id,
        teacherName: "Teacher rejected",
        className: "Lớp Nháp Gốc",
        description: "Mô tả",
        classType: "PAID",
        price: 300000,
        capacity: 15,
        enrollmentStart: new Date(Date.now() - DAY),
        enrollmentEnd: new Date(Date.now() + 7 * DAY),
        startDate: new Date(Date.now() - DAY),
        endDate: new Date(Date.now() + 30 * DAY),
        schedule: [{ dayOfWeek: 2, startTime: "19:00", endTime: "20:30" }],
        status: "DRAFT",
      });

      const plannedSession = await Session.create({
        classId: draftCls._id,
        className: draftCls.className,
        teacherId: users.rejected._id,
        title: "Buổi Gốc",
        startDatetime: new Date(Date.now() + DAY),
        endDatetime: new Date(Date.now() + DAY + 3600000),
        status: "SCHEDULED",
      });

      for (const statusKey of ["unverified", "pending", "rejected"]) {
        const createRes = await request(app)
          .post("/api/teacher/classes")
          .set(bearer(statusKey))
          .send({
            courseId: course._id,
            className: "Lớp Mới",
            classType: "FREE",
            price: 0,
            capacity: 10,
          });
        expect(createRes.statusCode).toBe(403);
        expect(createRes.body.error).toBe("TEACHER_NOT_VERIFIED");
      }

      const patchCls = await request(app)
        .patch(`/api/teacher/classes/${draftCls._id}`)
        .set(bearer("rejected"))
        .send({ className: "Đổi Tên Trái Phép" });
      expect(patchCls.statusCode).toBe(403);
      expect(patchCls.body.error).toBe("TEACHER_NOT_VERIFIED");

      const submitCls = await request(app)
        .post(`/api/teacher/classes/${draftCls._id}/submit`)
        .set(bearer("rejected"));
      expect(submitCls.statusCode).toBe(403);
      expect(submitCls.body.error).toBe("TEACHER_NOT_VERIFIED");

      const rosterRes = await request(app)
        .get(`/api/teacher/classes/${draftCls._id}/students`)
        .set(bearer("rejected"));
      expect(rosterRes.statusCode).toBe(403);
      expect(rosterRes.body.error).toBe("TEACHER_NOT_VERIFIED");

      const createSess = await request(app)
        .post(`/api/teacher/classes/${draftCls._id}/sessions`)
        .set(bearer("rejected"))
        .send({
          title: "Buổi Mới Trái Phép",
          startDatetime: new Date(Date.now() + 2 * DAY),
          endDatetime: new Date(Date.now() + 2 * DAY + 3600000),
        });
      expect(createSess.statusCode).toBe(403);
      expect(createSess.body.error).toBe("TEACHER_NOT_VERIFIED");

      const updateSess = await request(app)
        .patch(`/api/teacher/sessions/${plannedSession._id}`)
        .set(bearer("rejected"))
        .send({ title: "Sửa Buổi Trái Phép" });
      expect(updateSess.statusCode).toBe(403);
      expect(updateSess.body.error).toBe("TEACHER_NOT_VERIFIED");

      const deleteSess = await request(app)
        .delete(`/api/teacher/sessions/${plannedSession._id}`)
        .set(bearer("rejected"));
      expect(deleteSess.statusCode).toBe(403);
      expect(deleteSess.body.error).toBe("TEACHER_NOT_VERIFIED");

      // Verify zero DB mutations happened
      expect((await Class.findById(draftCls._id)).className).toBe("Lớp Nháp Gốc");
      expect((await Session.findById(plannedSession._id)).title).toBe("Buổi Gốc");
      expect(await Session.countDocuments({ classId: draftCls._id })).toBe(1);
    });
  });

  describe("P0-01: Live Classroom, LiveKit Token & Egress Recording security", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("blocks non-VERIFIED teacher from joining, starting Egress, ending session, or signing recording URL", async () => {
      const startSpy = jest.spyOn(videoProvider, "startRecording");
      const tokenSpy = jest.spyOn(videoProvider, "createJoinToken");

      const openCls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: users.rejected._id,
        teacherName: "Teacher rejected",
        className: "Lớp Đang Mở",
        classType: "FREE",
        price: 0,
        capacity: 10,
        status: "OPEN",
      });

      const liveSession = await Session.create({
        classId: openCls._id,
        className: openCls.className,
        teacherId: users.rejected._id,
        title: "Buổi Live",
        startDatetime: new Date(Date.now() - 60000),
        endDatetime: new Date(Date.now() + 3600000),
        status: "SCHEDULED",
      });

      for (const statusKey of ["unverified", "pending", "rejected"]) {
        const joinRes = await request(app)
          .post(`/api/sessions/${liveSession._id}/join`)
          .set(bearer(statusKey));
        expect(joinRes.statusCode).toBe(403);
        expect(joinRes.body.error).toBe("TEACHER_NOT_VERIFIED");
      }

      expect(startSpy).not.toHaveBeenCalled();
      expect(tokenSpy).not.toHaveBeenCalled();
      expect((await Session.findById(liveSession._id)).status).toBe("SCHEDULED");

      await Session.updateOne({ _id: liveSession._id }, { $set: { status: "IN_PROGRESS" } });
      const endRes = await request(app)
        .post(`/api/teacher/sessions/${liveSession._id}/end`)
        .set(bearer("rejected"));
      expect(endRes.statusCode).toBe(403);
      expect(endRes.body.error).toBe("TEACHER_NOT_VERIFIED");
      expect((await Session.findById(liveSession._id)).status).toBe("IN_PROGRESS");

      // Recording signed URL must also require VERIFIED teacher
      const recKey = `private/${users.rejected._id}/RECORDING/00000000-0000-0000-0000-000000000000.mp4`;
      const signRec = await request(app)
        .post("/api/files/signed-url")
        .set(bearer("rejected"))
        .send({ storageKey: recKey });
      expect(signRec.statusCode).toBe(403);
      expect(signRec.body.error).toBe("TEACHER_NOT_VERIFIED");
    });

    it("blocks even a VERIFIED teacher from opening LiveKit room or starting Egress on unapproved/inactive classes (DRAFT, PENDING_APPROVAL, REJECTED, CANCELLED)", async () => {
      const startSpy = jest.spyOn(videoProvider, "startRecording");
      const tokenSpy = jest.spyOn(videoProvider, "createJoinToken");

      for (const invalidStatus of ["DRAFT", "PENDING_APPROVAL", "REJECTED", "COMPLETED", "CANCELLED"]) {
        const cls = await Class.create({
          courseId: course._id,
          courseTitle: course.title,
          categoryId: category._id,
          subjectId: subject._id,
          teacherId: users.verified._id,
          teacherName: "Teacher verified",
          className: `Lớp ${invalidStatus}`,
          classType: "FREE",
          price: 0,
          capacity: 10,
          status: invalidStatus,
        });

        const sess = await Session.create({
          classId: cls._id,
          className: cls.className,
          teacherId: users.verified._id,
          title: "Buổi Test",
          startDatetime: new Date(Date.now() - 60000),
          endDatetime: new Date(Date.now() + 3600000),
          status: "SCHEDULED",
        });

        const joinRes = await request(app)
          .post(`/api/sessions/${sess._id}/join`)
          .set(bearer("verified"));
        expect(joinRes.statusCode).toBe(403);
        expect(joinRes.body.error).toBe("CLASS_NOT_ACTIVE");
        expect((await Session.findById(sess._id)).status).toBe("SCHEDULED");
      }

      expect(startSpy).not.toHaveBeenCalled();
      expect(tokenSpy).not.toHaveBeenCalled();
    });

    it("preserves valid VERIFIED teacher HOST join + Egress and enrolled STUDENT PARTICIPANT join on OPEN class", async () => {
      const startSpy = jest.spyOn(videoProvider, "startRecording").mockResolvedValue("egress-123");

      const openCls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: users.verified._id,
        teacherName: "Teacher verified",
        className: "Lớp Hợp Lệ",
        classType: "FREE",
        price: 0,
        capacity: 10,
        status: "OPEN",
      });

      const sess = await Session.create({
        classId: openCls._id,
        className: openCls.className,
        teacherId: users.verified._id,
        title: "Buổi Hợp Lệ",
        startDatetime: new Date(Date.now() - 60000),
        endDatetime: new Date(Date.now() + 3600000),
        status: "SCHEDULED",
      });

      await Enrollment.create({
        classId: openCls._id,
        courseId: course._id,
        teacherId: users.verified._id,
        studentId: users.student._id,
        enrollmentStatus: "CONFIRMED",
        tuitionAmount: 0,
        paymentSource: "FREE",
      });

      const hostJoin = await request(app)
        .post(`/api/sessions/${sess._id}/join`)
        .set(bearer("verified"));
      expect(hostJoin.statusCode).toBe(200);
      expect(hostJoin.body.data.role).toBe("HOST");
      expect(startSpy).toHaveBeenCalledTimes(0); // joining only opens the room
      const started = await request(app)
        .post(`/api/teacher/sessions/${sess._id}/start`)
        .set(bearer("verified"));
      expect(started.statusCode).toBe(200);
      expect(startSpy).toHaveBeenCalledTimes(1);

      const studentJoin = await request(app)
        .post(`/api/sessions/${sess._id}/join`)
        .set(bearer("student"));
      expect(studentJoin.statusCode).toBe(200);
      expect(studentJoin.body.data.role).toBe("PARTICIPANT");

      const endRes = await request(app)
        .post(`/api/teacher/sessions/${sess._id}/end`)
        .set(bearer("verified"));
      expect(endRes.statusCode).toBe(200);
      expect(endRes.body.data.status).toBe("COMPLETED");
    });
  });

  describe("P1-02 & P1-04: Public and Private Upload security by purpose, role, and verificationStatus", () => {
    it("P1-02: blocks COVER_IMAGE public upload for UNVERIFIED, PENDING, REJECTED teachers, while allowing AVATAR and VERIFIED/ADMIN COVER_IMAGE", async () => {
      for (const statusKey of ["unverified", "pending", "rejected"]) {
        const coverRes = await request(app)
          .post("/api/uploads/public")
          .set(bearer(statusKey))
          .field("purpose", "COVER_IMAGE")
          .attach("file", PNG, { filename: "cover.png", contentType: "image/png" });
        expect(coverRes.statusCode).toBe(403);
        expect(coverRes.body.error).toBe("TEACHER_NOT_VERIFIED");

        // AVATAR remains allowed for profile management
        const avatarRes = await request(app)
          .post("/api/uploads/public")
          .set(bearer(statusKey))
          .field("purpose", "AVATAR")
          .attach("file", PNG, { filename: "avatar.png", contentType: "image/png" });
        expect(avatarRes.statusCode).toBe(201);
      }

      const verifiedCover = await request(app)
        .post("/api/uploads/public")
        .set(bearer("verified"))
        .field("purpose", "COVER_IMAGE")
        .attach("file", PNG, { filename: "cover.png", contentType: "image/png" });
      expect(verifiedCover.statusCode).toBe(201);

      const adminCover = await request(app)
        .post("/api/uploads/public")
        .set(bearer("admin"))
        .field("purpose", "COVER_IMAGE")
        .attach("file", PNG, { filename: "cover.png", contentType: "image/png" });
      expect(adminCover.statusCode).toBe(201);

      const studentCover = await request(app)
        .post("/api/uploads/public")
        .set(bearer("student"))
        .field("purpose", "COVER_IMAGE")
        .attach("file", PNG, { filename: "cover.png", contentType: "image/png" });
      expect(studentCover.statusCode).toBe(403);
    });

    it("P1-04: allows UNVERIFIED and REJECTED teachers to upload IDENTITY/QUALIFICATION and resubmit, while blocking PENDING/VERIFIED and wrong purposes", async () => {
      // UNVERIFIED & REJECTED can upload IDENTITY and QUALIFICATION
      for (const statusKey of ["unverified", "rejected"]) {
        const idUp = await request(app)
          .post("/api/uploads/private")
          .set(bearer(statusKey))
          .field("purpose", "IDENTITY")
          .attach("file", PDF, { filename: "id.pdf", contentType: "application/pdf" });
        expect(idUp.statusCode).toBe(201);

        const qualUp = await request(app)
          .post("/api/uploads/private")
          .set(bearer(statusKey))
          .field("purpose", "QUALIFICATION")
          .attach("file", PDF, { filename: "degree.pdf", contentType: "application/pdf" });
        expect(qualUp.statusCode).toBe(201);

        // And REJECTED teacher can submit verification again -> transitions to PENDING
        if (statusKey === "rejected") {
          const resubmit = await request(app)
            .post("/api/teacher/verification")
            .set(bearer("rejected"))
            .send({
              qualificationSummary: "Thạc sĩ Vật lý",
              identity: { fullName: "Trần Thị B", idNumber: "079203009999", dateOfBirth: "1988-01-01", address: "1 Trần Phú, Hà Đông, Hà Nội" },
              documents: [
                { documentType: "IDENTITY", files: [{ side: "FRONT", storageKey: idUp.body.data.storageKey }, { side: "BACK", storageKey: idUp.body.data.storageKey }] },
                { documentType: "QUALIFICATION", files: [{ side: "SINGLE", storageKey: qualUp.body.data.storageKey }] },
              ],
            });
          expect(resubmit.statusCode).toBe(201);
          expect(resubmit.body.data.verificationStatus).toBe("PENDING");
        }
      }

      // PENDING (including `pending` and newly-resubmitted `rejected`) cannot upload duplicate verification files
      for (const statusKey of ["pending", "rejected"]) {
        const dupUp = await request(app)
          .post("/api/uploads/private")
          .set(bearer(statusKey))
          .field("purpose", "QUALIFICATION")
          .attach("file", PDF, { filename: "dup.pdf", contentType: "application/pdf" });
        expect(dupUp.statusCode).toBe(403);
        expect(dupUp.body.error).toBe("VERIFICATION_PENDING");
      }

      // VERIFIED cannot upload verification documents again
      const verifiedUp = await request(app)
        .post("/api/uploads/private")
        .set(bearer("verified"))
        .field("purpose", "IDENTITY")
        .attach("file", PDF, { filename: "id.pdf", contentType: "application/pdf" });
      expect(verifiedUp.statusCode).toBe(403);
      expect(verifiedUp.body.error).toBe("ALREADY_VERIFIED");

      // TEACHER cannot upload SCHOLARSHIP_PROOF
      const teacherScholarshipProof = await request(app)
        .post("/api/uploads/private")
        .set(bearer("unverified"))
        .field("purpose", "SCHOLARSHIP_PROOF")
        .attach("file", PDF, { filename: "proof.pdf", contentType: "application/pdf" });
      expect(teacherScholarshipProof.statusCode).toBe(403);

      // STUDENT keeps existing SCHOLARSHIP_PROOF upload rights
      const studentProof = await request(app)
        .post("/api/uploads/private")
        .set(bearer("student"))
        .field("purpose", "SCHOLARSHIP_PROOF")
        .attach("file", PDF, { filename: "proof.pdf", contentType: "application/pdf" });
      expect(studentProof.statusCode).toBe(201);
    });
  });
});

