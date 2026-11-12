const os = require("os");
const path = require("path");
const fs = require("fs");

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-phase3-"));

const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  Report,
  ScholarshipCampaign,
  ScholarshipApplication,
  Scholarship,
  Transaction,
  PaperDossierReceipt,
  TeacherSubjectAuthorization,
  TeacherViolation,
  TeacherDisciplineCase,
  TeacherContractReviewPacket,
  AuditLog,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { signAccessToken } = require("../src/utils/jwt");
const { resetConsentVerifier, setConsentVerifier } = require("../src/services/scholarshipDossierGateService");
const classCreationGateService = require("../src/services/classCreationGateService");
const teachingQualityReportService = require("../src/services/teachingQualityReportService");
const incidentContractCoordinationService = require("../src/services/incidentContractCoordinationService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const VALID_GUARDIAN = {
  fullName: "Le Van Minh",
  relationship: "FATHER",
  phone: "0912345678",
  email: "phuhuynh.p3@test.vn",
};

const VALID_SCHOOL = {
  schoolName: "THPT Le Quy Don",
  gradeLevel: "GRADE_11",
  className: "11A2",
  studentCode: "HS-P3-001",
  academicYear: "2026-2027",
  province: "Ha Noi",
};

describe("Phase 3 Real MongoMemoryReplSet Verification (AID-01, AID-04, SPO-07, TEA-16)", () => {
  let admin;
  let teacherA;
  let student1;
  let student2;
  let tokens;
  let category;
  let subjectMath;
  let courseMath;

  const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

  const uploadProof = async (roleKey) => {
    const res = await request(app)
      .post("/api/uploads/private")
      .set(as(roleKey))
      .field("purpose", "SCHOLARSHIP_PROOF")
      .attach("file", PDF_BYTES, { filename: "proof.pdf", contentType: "application/pdf" });
    expect(res.statusCode).toBe(201);
    return res.body.data.storageKey;
  };

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    resetConsentVerifier();
    classCreationGateService.resetDependencyVerifiers();
    await disconnectDB();
    fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    resetConsentVerifier();
    classCreationGateService.resetDependencyVerifiers();
    await clearDB();

    const passwordHash = hashPassword("Password@123");
    [admin, teacherA, student1, student2] = await User.create([
      { email: "admin_p3@test.com", passwordHash, role: "ADMIN", status: "ACTIVE" },
      {
        email: "teacherA_p3@test.com",
        passwordHash,
        role: "TEACHER",
        status: "ACTIVE",
        teacherProfile: { fullName: "Teacher Phase 3", verificationStatus: "VERIFIED" },
      },
      {
        email: "student1_p3@test.com",
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Student One P3", dateOfBirth: new Date("2009-04-01") },
      },
      {
        email: "student2_p3@test.com",
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Student Two P3", dateOfBirth: new Date("2009-08-01") },
      },
    ]);

    tokens = {
      admin: signAccessToken(admin),
      teacherA: signAccessToken(teacherA),
      student1: signAccessToken(student1),
      student2: signAccessToken(student2),
    };

    category = await Category.create({ name: "THPT", slug: "thpt-p3", createdBy: admin._id, status: "ACTIVE" });
    subjectMath = await Subject.create({
      name: "Toan P3",
      slug: "toan-p3",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    courseMath = await Course.create({
      title: "Toan 11 P3",
      slug: "toan-11-p3",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subjectMath._id,
      subjectName: subjectMath.name,
      gradeLevel: "GRADE_11",
      level: "INTERMEDIATE",
      createdBy: admin._id,
      status: "ACTIVE",
    });
  });

  // =========================================================================
  // 1. AID-01 + AID-04 Guards & Concurrency
  // =========================================================================
  describe("1. AID-01 & AID-04 ReplSet Index, Transaction & Bypass Guards", () => {
    it("enforces APPROVED duplicate blocking (index + API) and closes /approve bypass on V3 AID-01 & AID-08 campaigns", async () => {
      // 1A. Legacy campaign: approve -> APPROVED blocks second application at both service & DB partial index
      const legacyCampRes = await request(app)
        .post("/api/admin/campaigns")
        .set(as("admin"))
        .send({
          title: "Legacy Scholarship Campaign",
          targetBudget: 2000000,
          expectedSlots: 2,
          awardAmountPerStudent: 1000000,
          fundingStart: new Date(NOW - DAY).toISOString(),
          fundingEnd: new Date(NOW + 20 * DAY).toISOString(),
          applicationStart: new Date(NOW - DAY).toISOString(),
          applicationEnd: new Date(NOW + 20 * DAY).toISOString(),
        });
      expect(legacyCampRes.statusCode).toBe(201);
      const legacyCampId = legacyCampRes.body.data.id;
      expect((await request(app).post(`/api/admin/campaigns/${legacyCampId}/publish`).set(as("admin"))).statusCode).toBe(200);
      await ScholarshipCampaign.updateOne(
        { _id: legacyCampId },
        { $set: { fundedAmount: mongoose.Types.Decimal128.fromString("2000000") } }
      );

      const legacyKey = await uploadProof("student1");
      const legacyApply = await request(app)
        .post(`/api/campaigns/${legacyCampId}/applications`)
        .set(as("student1"))
        .send({ statement: "Legacy apply", documents: [{ files: [{ storageKey: legacyKey }] }] });
      expect(legacyApply.statusCode).toBe(201);

      const legacyApprove = await request(app)
        .post(`/api/admin/scholarship-applications/${legacyApply.body.data.id}/approve`)
        .set(as("admin"))
        .send({});
      expect(legacyApprove.statusCode).toBe(200);
      expect(legacyApprove.body.data.application.status).toBe("APPROVED");

      const legacySecond = await request(app)
        .post(`/api/campaigns/${legacyCampId}/applications`)
        .set(as("student1"))
        .send({ statement: "Duplicate after APPROVED", documents: [{ files: [{ storageKey: await uploadProof("student1") }] }] });
      expect(legacySecond.statusCode).toBe(409);
      expect(legacySecond.body.error).toBe("DUPLICATE_APPLICATION");

      await expect(
        ScholarshipApplication.create({
          campaignId: legacyCampId,
          studentId: student1._id,
          status: "SUBMITTED",
          statement: "DB index check",
        })
      ).rejects.toThrow(/E11000/);

      // 1B. V3 AID-01 campaign with minor consent + paper checklist cannot be bypassed via /approve
      const v3CampRes = await request(app)
        .post("/api/admin/campaigns")
        .set(as("admin"))
        .send({
          title: "V3 AID-01 Guarded Campaign",
          targetBudget: 2000000,
          expectedSlots: 2,
          awardAmountPerStudent: 1000000,
          fundingStart: new Date(NOW - DAY).toISOString(),
          fundingEnd: new Date(NOW + 20 * DAY).toISOString(),
          applicationStart: new Date(NOW - DAY).toISOString(),
          applicationEnd: new Date(NOW + 20 * DAY).toISOString(),
          documentChecklist: [
            { code: "HOC_BA", title: "Hoc ba", required: true, acceptedMode: "ONLINE" },
            { code: "XAC_NHAN_UBND", title: "Xac nhan UBND", required: true, acceptedMode: "PAPER" },
          ],
          dossierPolicy: {
            requireGuardianInfo: true,
            requireSchoolInfo: true,
            allowPaperDossier: true,
            allowDraftSave: true,
            requireGuardianConsentForMinor: true,
          },
        });
      expect(v3CampRes.statusCode).toBe(201);
      const v3CampId = v3CampRes.body.data.id;
      expect((await request(app).post(`/api/admin/campaigns/${v3CampId}/publish`).set(as("admin"))).statusCode).toBe(200);
      await ScholarshipCampaign.updateOne(
        { _id: v3CampId },
        { $set: { fundedAmount: mongoose.Types.Decimal128.fromString("2000000") } }
      );

      setConsentVerifier(async () => ({ verified: true, consentRecordId: new mongoose.Types.ObjectId() }));
      const v3Key = await uploadProof("student1");
      const v3Dossier = await request(app)
        .post(`/api/campaigns/${v3CampId}/dossiers`)
        .set(as("student1"))
        .send({
          submissionMode: "HYBRID",
          statement: "Ho so HYBRID V3",
          guardianInfo: VALID_GUARDIAN,
          schoolInfo: VALID_SCHOOL,
          documents: [{ checklistItemCode: "HOC_BA", files: [{ storageKey: v3Key }] }],
        });
      expect(v3Dossier.statusCode).toBe(201);
      const v3AppId = v3Dossier.body.data.id;

      // Direct /approve before paper receipt reconciliation is blocked (409 DOSSIER_CHECKLIST_INCOMPLETE)
      const prematureApprove = await request(app)
        .post(`/api/admin/scholarship-applications/${v3AppId}/approve`)
        .set(as("admin"))
        .send({});
      expect(prematureApprove.statusCode).toBe(409);
      expect(prematureApprove.body.error).toBe("DOSSIER_CHECKLIST_INCOMPLETE");

      // Intake & reconcile paper receipt, then verify-dossier -> DOSSIER_VERIFIED (with 0 grant)
      const paperIntake = await request(app)
        .post("/api/admin/paper-dossiers")
        .set(as("admin"))
        .send({
          applicationId: v3AppId,
          postalInfo: { carrierName: "VNPost", trackingNumber: "VN-P3-001", senderName: "Le Van Minh" },
        });
      expect(paperIntake.statusCode).toBe(201);

      const reconciled = await request(app)
        .post(`/api/admin/paper-dossiers/${paperIntake.body.data.id}/reconcile`)
        .set(as("admin"))
        .send({
          status: "RECONCILED",
          reconciledItems: [{ checklistItemCode: "XAC_NHAN_UBND", itemStatus: "MATCHED", isOriginal: true }],
        });
      expect(reconciled.statusCode).toBe(200);

      const verified = await request(app)
        .post(`/api/admin/scholarship-applications/${v3AppId}/verify-dossier`)
        .set(as("admin"))
        .send({ reviewNote: "Verified AID-01" });
      expect(verified.statusCode).toBe(200);
      expect(verified.body.data.application.status).toBe("DOSSIER_VERIFIED");
      expect(await Scholarship.countDocuments({ applicationId: v3AppId })).toBe(0);
      expect(await Transaction.countDocuments({})).toBe(0);

      // Even from DOSSIER_VERIFIED, /approve still refuses if AID-08 consent verifier is now missing (fail-closed)
      resetConsentVerifier();
      const consentBlockedApprove = await request(app)
        .post(`/api/admin/scholarship-applications/${v3AppId}/approve`)
        .set(as("admin"))
        .send({});
      expect(consentBlockedApprove.statusCode).toBe(503);
      expect(consentBlockedApprove.body.error).toBe("CONSENT_DEPENDENCY_BLOCKED");

      // Once consent is verified, /approve accepts DOSSIER_VERIFIED cleanly
      setConsentVerifier(async () => ({ verified: true, consentRecordId: new mongoose.Types.ObjectId() }));
      const finalApprove = await request(app)
        .post(`/api/admin/scholarship-applications/${v3AppId}/approve`)
        .set(as("admin"))
        .send({});
      expect(finalApprove.statusCode).toBe(200);
      expect(finalApprove.body.data.application.status).toBe("APPROVED");
    });

    it("handles concurrent resubmit vs reject CAS cleanly, guards document review statuses, and cancels unlinked/withdrawn paper receipts safely", async () => {
      const campRes = await request(app)
        .post("/api/admin/campaigns")
        .set(as("admin"))
        .send({
          title: "AID Concurrency Campaign",
          targetBudget: 2000000,
          expectedSlots: 2,
          awardAmountPerStudent: 1000000,
          fundingStart: new Date(NOW - DAY).toISOString(),
          fundingEnd: new Date(NOW + 20 * DAY).toISOString(),
          applicationStart: new Date(NOW - DAY).toISOString(),
          applicationEnd: new Date(NOW + 20 * DAY).toISOString(),
          documentChecklist: [{ code: "HOC_BA", title: "Hoc ba", required: true, acceptedMode: "ONLINE" }],
          dossierPolicy: { requireGuardianInfo: true, requireSchoolInfo: true, allowPaperDossier: true, allowDraftSave: true },
        });
      const campId = campRes.body.data.id;
      await request(app).post(`/api/admin/campaigns/${campId}/publish`).set(as("admin"));

      // Reject non-string reviewNote or malformed doc review
      const key1 = await uploadProof("student1");
      const created = await request(app)
        .post(`/api/campaigns/${campId}/dossiers`)
        .set(as("student1"))
        .send({
          submissionMode: "ONLINE",
          statement: "Ho so ban dau",
          guardianInfo: VALID_GUARDIAN,
          schoolInfo: VALID_SCHOOL,
          documents: [{ checklistItemCode: "HOC_BA", files: [{ storageKey: key1 }] }],
        });
      expect(created.statusCode).toBe(201);
      const appId = created.body.data.id;
      const appDetail = await request(app).get(`/api/me/scholarship-applications/${appId}`).set(as("student1"));
      const docId = appDetail.body.data.documents[0]._id;

      // Admin document review validates string status & records audit log transactionally
      const badDocReview = await request(app)
        .patch(`/api/admin/scholarship-applications/${appId}/documents/${docId}/review`)
        .set(as("admin"))
        .send({ status: { $ne: "REJECTED" } });
      expect(badDocReview.statusCode).toBe(400);

      const goodDocReview = await request(app)
        .patch(`/api/admin/scholarship-applications/${appId}/documents/${docId}/review`)
        .set(as("admin"))
        .send({ status: "APPROVED", reviewNote: "Ban scan ro net" });
      expect(goodDocReview.statusCode).toBe(200);
      expect(await AuditLog.countDocuments({ targetId: docId, action: "SCHOLARSHIP_DOCUMENT_APPROVED" })).toBe(1);

      // Move to NEED_MORE_INFORMATION, then race resubmit vs reject -> strictly [200, 409]
      const needInfo = await request(app)
        .post(`/api/admin/scholarship-applications/${appId}/request-information`)
        .set(as("admin"))
        .send({ reviewNote: "Bo sung hoc ba ky 2" });
      expect(needInfo.statusCode).toBe(200);

      const key2 = await uploadProof("student1");
      const [resubmitRes, rejectRes] = await Promise.all([
        request(app)
          .post(`/api/me/scholarship-applications/${appId}/resubmit`)
          .set(as("student1"))
          .send({ documents: [{ checklistItemCode: "HOC_BA", files: [{ storageKey: key2 }] }] }),
        request(app)
          .post(`/api/admin/scholarship-applications/${appId}/reject`)
          .set(as("admin"))
          .send({ reviewNote: "Dong ho so" }),
      ]);
      expect([resubmitRes.statusCode, rejectRes.statusCode].sort()).toEqual([200, 409]);

      // Document review on REJECTED/WITHDRAWN application must be blocked with 409
      await ScholarshipApplication.updateOne({ _id: appId }, { $set: { status: "WITHDRAWN" } });
      const closedDocReview = await request(app)
        .patch(`/api/admin/scholarship-applications/${appId}/documents/${docId}/review`)
        .set(as("admin"))
        .send({ status: "REJECTED", reviewNote: "Attempt on closed" });
      expect(closedDocReview.statusCode).toBe(409);

      // Linking an unlinked mailroom receipt to a WITHDRAWN application fails with 409 APPLICATION_NOT_ACCEPTING_PAPER
      const unlinked = await request(app)
        .post("/api/admin/paper-dossiers")
        .set(as("admin"))
        .send({
          postalInfo: { carrierName: "VNPost", trackingNumber: "VN-UNLINKED-99", senderName: "Sender Mail" },
        });
      expect(unlinked.statusCode).toBe(201);
      const unlinkedId = unlinked.body.data.id;

      const linkWithdrawn = await request(app)
        .post(`/api/admin/paper-dossiers/${unlinkedId}/link`)
        .set(as("admin"))
        .send({ applicationId: appId });
      expect(linkWithdrawn.statusCode).toBe(409);
      expect(linkWithdrawn.body.error).toBe("APPLICATION_NOT_ACCEPTING_PAPER");

      // Cancelling an UNLINKED receipt (applicationId: null) succeeds cleanly (previously crashed with ReferenceError!)
      const cancelled = await request(app)
        .post(`/api/admin/paper-dossiers/${unlinkedId}/cancel`)
        .set(as("admin"))
        .send({ reason: "Gui nham dia chi" });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.body.data.status).toBe("CANCELLED");
      expect(await PaperDossierReceipt.findById(unlinkedId).then((d) => d.status)).toBe("CANCELLED");
    });
  });

  // =========================================================================
  // 2. SPO-07 Quality Reporting Fixes
  // =========================================================================
  describe("2. SPO-07 Teaching Quality Filters, Soft-Delete & Attribution Accuracy", () => {
    it("excludes soft-deleted classes & RESCHEDULED sessions from upcoming count, validates reportType, and never misattributes student-vs-student complaints to the teacher", async () => {
      const deletedCls = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        teacherId: teacherA._id,
        teacherName: "Teacher Phase 3",
        className: "Deleted Class P3",
        classType: "FREE",
        price: 0,
        capacity: 10,
        status: "OPEN",
        isDeleted: true,
        deletedAt: new Date(),
      });
      const activeCls = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        teacherId: teacherA._id,
        teacherName: "Teacher Phase 3",
        className: "Active Class P3",
        classType: "FREE",
        price: 0,
        capacity: 10,
        status: "IN_PROGRESS",
      });

      // 1 RESCHEDULED session still having status SCHEDULED -> must count ONLY in rescheduledCount, NOT upcomingOrActiveCount
      await Session.create({
        classId: activeCls._id,
        className: activeCls.className,
        teacherId: teacherA._id,
        title: "Rescheduled Session",
        startDatetime: new Date(NOW + 2 * DAY),
        endDatetime: new Date(NOW + 2 * DAY + 3600000),
        status: "SCHEDULED",
        lifecycleState: "RESCHEDULED",
      });
      await Session.create({
        classId: activeCls._id,
        className: activeCls.className,
        teacherId: teacherA._id,
        title: "Real Upcoming Session",
        startDatetime: new Date(NOW + 3 * DAY),
        endDatetime: new Date(NOW + 3 * DAY + 3600000),
        status: "SCHEDULED",
        lifecycleState: "SCHEDULED",
      });

      // Student-vs-student complaint inside activeCls -> MUST NOT blame teacherA
      await Report.create({
        reporterId: student1._id,
        reportedUserId: student2._id,
        classId: activeCls._id,
        type: "INAPPROPRIATE_BEHAVIOR",
        description: "Tranh cai giua hoc vien",
        status: "OPEN",
      });

      // Complaint on deleted class with reportedUserId = null -> class was soft-deleted, not active class scope
      await Report.create({
        reporterId: student1._id,
        classId: deletedCls._id,
        type: "TEACHER_ABSENT",
        description: "Complaint on deleted class",
        status: "OPEN",
      });

      // Valid class-level complaint (reportedUserId: null) on activeCls -> attributed to teacherA
      const validComp = await Report.create({
        reporterId: student1._id,
        classId: activeCls._id,
        type: "TEACHING_QUALITY",
        description: "Bai giang hoi nhanh",
        status: "OPEN",
      });

      // Invalid reportType, repeated-param array, or object injection -> 400 VALIDATION_ERROR
      expect(
        (await request(app).get("/api/admin/teaching-quality/report?reportType=NOT_REAL").set(as("admin"))).statusCode
      ).toBe(400);
      expect(
        (await request(app).get("/api/admin/teaching-quality/report?reportType=FRAUD&reportType=OTHER").set(as("admin"))).statusCode
      ).toBe(400);
      await expect(
        teachingQualityReportService.adminGetTeachingQualityReport(
          { reportType: { $ne: "OTHER" } },
          { page: 1, pageSize: 20, skip: 0 }
        )
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });

      const reportRes = await request(app)
        .get(`/api/admin/teaching-quality/report?teacherId=${teacherA._id}`)
        .set(as("admin"));
      expect(reportRes.statusCode).toBe(200);

      const { summary, traceability } = reportRes.body.data;
      expect(summary.sessions.totalCount).toBe(2);
      expect(summary.sessions.rescheduledCount).toBe(1);
      expect(summary.sessions.upcomingOrActiveCount).toBe(1);
      expect(summary.complaints.totalCount).toBe(1);
      expect(traceability.sourceIds.complaintReportIds).toEqual([validComp._id.toString()]);
      expect(JSON.stringify(reportRes.body)).not.toContain("student1_p3@test.com");
      expect(JSON.stringify(reportRes.body)).not.toContain("student2_p3@test.com");
    });
  });

  // =========================================================================
  // 3. TEA-16 Contract Review Packet Concurrency, Unique Index & Atomicity
  // =========================================================================
  describe("3. TEA-16 Active Packet Uniqueness, CAS Transitions, Input Hardening & Fail-Closed Atomicity", () => {
    it("enforces single active packet per teacher (partial unique index), atomic CAS transitions, NoSQL guards, and atomic execution-blocked audit persistence", async () => {
      await TeacherSubjectAuthorization.create({
        teacherId: teacherA._id,
        subjectId: subjectMath._id,
        categoryId: category._id,
        gradeLevel: "GRADE_11",
        level: "INTERMEDIATE",
        status: "SUSPENDED",
        suspensionReason: "Test suspension",
        createdBy: admin._id,
      });

      // Input hardening: repeated-param array & object / NoSQL payloads rejected cleanly
      const badQuery = await request(app)
        .get("/api/admin/contract-reviews/incidents?status=DRAFT&status=CLOSED")
        .set(as("admin"));
      expect(badQuery.statusCode).toBe(400);
      await expect(
        incidentContractCoordinationService.adminListContractReviewQueue(
          { status: { $ne: "CLOSED" } },
          { page: 1, pageSize: 20, skip: 0 }
        )
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });

      const badCreate = await request(app)
        .post("/api/admin/contract-reviews/packets")
        .set(as("admin"))
        .send({
          teacherId: teacherA._id,
          coordinationSummary: { $ne: "" },
        });
      expect(badCreate.statusCode).toBe(400);

      const badSeverity = await request(app)
        .post("/api/admin/contract-reviews/packets")
        .set(as("admin"))
        .send({
          teacherId: teacherA._id,
          coordinationSummary: "Valid summary",
          severitySummary: { inject: 1 },
        });
      expect(badSeverity.statusCode).toBe(400);

      // Concurrent double-create -> strictly [201, 409] ACTIVE_CONTRACT_REVIEW_PACKET_EXISTS
      const createPayload = {
        teacherId: teacherA._id,
        coordinationSummary: "Open active review packet",
        severitySummary: "SUSPENDED TEA-07",
      };
      const [c1, c2] = await Promise.all([
        request(app).post("/api/admin/contract-reviews/packets").set(as("admin")).send(createPayload),
        request(app).post("/api/admin/contract-reviews/packets").set(as("admin")).send(createPayload),
      ]);
      expect([c1.statusCode, c2.statusCode].sort()).toEqual([201, 409]);
      const conflictCreate = c1.statusCode === 409 ? c1 : c2;
      expect(conflictCreate.body.error).toBe("ACTIVE_CONTRACT_REVIEW_PACKET_EXISTS");
      const packetId = (c1.statusCode === 201 ? c1 : c2).body.data.id;
      expect(await TeacherContractReviewPacket.countDocuments({ teacherId: teacherA._id, status: { $ne: "CLOSED" } })).toBe(1);

      // Attempt contract execution handoff -> 503 CONTRACT_DEPENDENCY_BLOCKED yet BOTH history & AuditLog commit atomically!
      const execBlocked = await request(app)
        .post(`/api/admin/contract-reviews/packets/${packetId}/execute-contract-action`)
        .set(as("admin"))
        .send({ note: "Verify atomic audit before 503" });
      expect(execBlocked.statusCode).toBe(503);
      expect(execBlocked.body.error).toBe("CONTRACT_DEPENDENCY_BLOCKED");

      const afterBlocked = await TeacherContractReviewPacket.findById(packetId).lean();
      expect(afterBlocked.history.map((h) => h.action)).toContain("EXECUTION_BLOCKED");
      expect(
        await AuditLog.countDocuments({
          targetType: "TeacherContractReviewPacket",
          targetId: packetId,
          action: "CONTRACT_REVIEW_EXECUTION_BLOCKED",
        })
      ).toBe(1);

      // Close with object injection resolutionNote rejected (400)
      const badClose = await request(app)
        .patch(`/api/admin/contract-reviews/packets/${packetId}/status`)
        .set(as("admin"))
        .send({ status: "CLOSED", resolutionNote: { $ne: "" } });
      expect(badClose.statusCode).toBe(400);

      // Race concurrent status transitions: DRAFT -> READY_FOR_CONTRACT_TEAM vs DRAFT -> ON_HOLD -> strictly [200, 409]
      const [t1, t2] = await Promise.all([
        request(app)
          .patch(`/api/admin/contract-reviews/packets/${packetId}/status`)
          .set(as("admin"))
          .send({ status: "READY_FOR_CONTRACT_TEAM", note: "Forward to contract team" }),
        request(app)
          .patch(`/api/admin/contract-reviews/packets/${packetId}/status`)
          .set(as("admin"))
          .send({ status: "ON_HOLD", note: "Pause review" }),
      ]);
      expect([t1.statusCode, t2.statusCode].sort()).toEqual([200, 409]);

      // Close the active packet -> once CLOSED, a NEW packet can be opened for the same teacher!
      const closed = await request(app)
        .patch(`/api/admin/contract-reviews/packets/${packetId}/status`)
        .set(as("admin"))
        .send({ status: "CLOSED", resolutionNote: "Completed review cycle 1" });
      expect(closed.statusCode).toBe(200);
      expect(closed.body.data.status).toBe("CLOSED");

      const cycle2 = await request(app)
        .post("/api/admin/contract-reviews/packets")
        .set(as("admin"))
        .send({
          teacherId: teacherA._id,
          coordinationSummary: "Cycle 2 packet after prior closed",
        });
      expect(cycle2.statusCode).toBe(201);
      expect(await TeacherContractReviewPacket.countDocuments({ teacherId: teacherA._id })).toBe(2);
    });
  });

  // =========================================================================
  // 3. FIX-FINAL: Anti-coercion & query guards (AID-01, AID-04, SPO-07)
  // =========================================================================
  describe("3. FIX-FINAL Anti-Coercion & SPO-07 Query Guards", () => {
    it("rejects boolean/null/array/object coercions in checklist, paper receipt intake/reconciliation, and SPO-07 query IDs", async () => {
      // AID-01 campaign checklist coercion
      for (const badItem of [
        { code: "DOC_A", title: "Doc A", required: "false" },
        { code: "DOC_B", title: "Doc B", maxFiles: true },
        { code: "DOC_C", title: "Doc C", order: null },
        { code: "DOC_D", title: "Doc D", acceptedMode: { $ne: "" } },
      ]) {
        const res = await request(app)
          .post("/api/admin/campaigns")
          .set(as("admin"))
          .send({
            title: "Bad Checklist Campaign",
            targetBudget: 2000000,
            expectedSlots: 2,
            awardAmountPerStudent: 1000000,
            fundingStart: new Date(NOW - DAY).toISOString(),
            fundingEnd: new Date(NOW + 20 * DAY).toISOString(),
            applicationStart: new Date(NOW - DAY).toISOString(),
            applicationEnd: new Date(NOW + 20 * DAY).toISOString(),
            documentChecklist: [badItem],
          });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("VALIDATION_ERROR");
      }

      // Valid V3 campaign + paper application to test AID-04 coercions
      const campRes = await request(app)
        .post("/api/admin/campaigns")
        .set(as("admin"))
        .send({
          title: "Valid V3 Coercion Campaign",
          targetBudget: 2000000,
          expectedSlots: 2,
          awardAmountPerStudent: 1000000,
          fundingStart: new Date(NOW - DAY).toISOString(),
          fundingEnd: new Date(NOW + 20 * DAY).toISOString(),
          applicationStart: new Date(NOW - DAY).toISOString(),
          applicationEnd: new Date(NOW + 20 * DAY).toISOString(),
          documentChecklist: [{ code: "HO_KHAU", title: "Ho khau", required: true, acceptedMode: "PAPER" }],
          dossierPolicy: { requireGuardianInfo: true, requireSchoolInfo: true, allowPaperDossier: true },
        })
        .expect(201);
      const campId = campRes.body.data.id;
      await request(app).post(`/api/admin/campaigns/${campId}/publish`).set(as("admin")).expect(200);
      await ScholarshipCampaign.updateOne(
        { _id: campId },
        { $set: { fundedAmount: mongoose.Types.Decimal128.fromString("2000000") } }
      );

      const dossier = await request(app)
        .post(`/api/campaigns/${campId}/dossiers`)
        .set(as("student1"))
        .send({
          submissionMode: "PAPER",
          statement: "Ho so giay",
          guardianInfo: VALID_GUARDIAN,
          schoolInfo: VALID_SCHOOL,
        })
        .expect(201);
      const appId = dossier.body.data.id;

      // Bad envelopeSealed string & deliveryMethod object rejected
      for (const badPostal of [
        { deliveryMethod: "POSTAL_MAIL", carrierName: "VNPost", trackingNumber: "TRK-1", senderName: "Le Van Minh", envelopeSealed: "false" },
        { deliveryMethod: { $ne: "" }, carrierName: "VNPost", trackingNumber: "TRK-2", senderName: "Le Van Minh" },
      ]) {
        const res = await request(app)
          .post("/api/admin/paper-dossiers")
          .set(as("admin"))
          .send({ applicationId: appId, postalInfo: badPostal });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("VALIDATION_ERROR");
      }

      const validReceipt = await request(app)
        .post("/api/admin/paper-dossiers")
        .set(as("admin"))
        .send({
          applicationId: appId,
          postalInfo: {
            deliveryMethod: "POSTAL_MAIL",
            carrierName: "VNPost",
            trackingNumber: "TRK-VALID-1",
            senderName: "Le Van Minh",
            envelopeSealed: true,
          },
        })
        .expect(201);
      const receiptId = validReceipt.body.data.id;

      // Bad pageCount (null, false, "") & bad isOriginal ("false") rejected on reconcile
      for (const badRecItem of [
        { checklistItemCode: "HO_KHAU", itemStatus: "MATCHED", pageCount: null },
        { checklistItemCode: "HO_KHAU", itemStatus: "MATCHED", pageCount: false },
        { checklistItemCode: "HO_KHAU", itemStatus: "MATCHED", pageCount: "" },
        { checklistItemCode: "HO_KHAU", itemStatus: "MATCHED", pageCount: 2, isOriginal: "false" },
      ]) {
        const res = await request(app)
          .post(`/api/admin/paper-dossiers/${receiptId}/reconcile`)
          .set(as("admin"))
          .send({ outcomeStatus: "RECONCILED", reconciledItems: [badRecItem] });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("VALIDATION_ERROR");
      }

      // SPO-07 array/object query ID injection returns 400 while invalid string ID continues returning 404
      const arrTeacherQ = await request(app)
        .get(`/api/admin/teaching-quality/report?teacherId=${teacherA._id}&teacherId=${teacherA._id}`)
        .set(as("admin"));
      expect(arrTeacherQ.statusCode).toBe(400);
      expect(arrTeacherQ.body.error).toBe("VALIDATION_ERROR");

      const badStringDetail = await request(app)
        .get("/api/admin/teaching-quality/teachers/not-an-id")
        .set(as("admin"));
      expect(badStringDetail.statusCode).toBe(404);
    });
  });
});
