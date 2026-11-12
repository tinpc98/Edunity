const os = require("os");
const path = require("path");
const fs = require("fs");

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-aid-stage3-"));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  ScholarshipCampaign,
  ScholarshipApplication,
  Scholarship,
  ScholarshipUsage,
  Transaction,
  VerificationDocument,
  PaperDossierReceipt,
  AuditLog,
  Notification,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const { resetConsentVerifier, setConsentVerifier } = require("../src/services/scholarshipDossierGateService");

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

let admin;
let student1;
let student2;
let teacher;
let sponsor;
let tokens;

const as = (roleKey) => ({ Authorization: `Bearer ${tokens[roleKey]}` });
const stripOrigin = (url) => String(url).replace(/^https?:\/\/[^/]+/, "");

const uploadProofFor = async (roleKey) => {
  const res = await request(app)
    .post("/api/uploads/private")
    .set(as(roleKey))
    .field("purpose", "SCHOLARSHIP_PROOF")
    .attach("file", PDF_BYTES, { filename: "proof.pdf", contentType: "application/pdf" });
  expect(res.statusCode).toBe(201);
  return res.body.data.storageKey;
};

const createCampaignWithChecklist = async ({ checklist, dossierPolicy, funded = 1000000 } = {}) => {
  const created = await request(app)
    .post("/api/admin/campaigns")
    .set(as("admin"))
    .send({
      title: "Hoc bong Vung Cao 2026",
      description: "Ho tro hoc sinh vuot kho",
      eligibilityCriteria: "Ho ngheo / can ngheo",
      targetBudget: 3000000,
      expectedSlots: 3,
      awardAmountPerStudent: 1000000,
      fundingStart: new Date(NOW - DAY).toISOString(),
      fundingEnd: new Date(NOW + 30 * DAY).toISOString(),
      applicationStart: new Date(NOW - DAY).toISOString(),
      applicationEnd: new Date(NOW + 30 * DAY).toISOString(),
      documentChecklist:
        checklist ??
        [
          {
            code: "HOC_BA",
            title: "Hoc ba hoc ky gan nhat",
            required: true,
            acceptedMode: "ONLINE",
            acceptedDocumentTypes: ["SCHOLARSHIP_PROOF"],
            maxFiles: 3,
          },
          {
            code: "XAC_NHAN_UBND",
            title: "Giay xac nhan hoan canh co dau do",
            required: true,
            acceptedMode: "PAPER",
            maxFiles: 2,
          },
          {
            code: "HO_KHAU",
            title: "So ho khau hoac xac nhan cu tru",
            required: true,
            acceptedMode: "EITHER",
            maxFiles: 2,
          },
        ],
      dossierPolicy: dossierPolicy ?? {
        requireGuardianInfo: true,
        requireSchoolInfo: true,
        allowPaperDossier: true,
        allowDraftSave: true,
        requireGuardianConsentForMinor: false,
      },
    });
  expect(created.statusCode).toBe(201);
  const campaignId = created.body.data.id;

  const published = await request(app).post(`/api/admin/campaigns/${campaignId}/publish`).set(as("admin"));
  expect(published.statusCode).toBe(200);

  if (funded > 0) {
    await ScholarshipCampaign.updateOne({ _id: campaignId }, { $set: { fundedAmount: mongoose.Types.Decimal128.fromString(String(funded)) } });
  }
  return campaignId;
};

const VALID_GUARDIAN = {
  fullName: "Nguyen Van Minh",
  relationship: "FATHER",
  phone: "0912345678",
  email: "phuhuynh@test.vn",
  occupation: "Lam nong",
  nationalIdLast4: "4321",
  householdCircumstance: "Ho can ngheo",
};

const VALID_SCHOOL = {
  schoolName: "THPT Chu Van An",
  gradeLevel: "GRADE_11",
  className: "11A1",
  studentCode: "HS-1101",
  academicYear: "2026-2027",
  province: "Ha Giang",
};

describe("Stage 3 Integration & Concurrency Tests (AID-01 + AID-04 on MongoMemoryReplSet)", () => {
  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    resetConsentVerifier();
    await disconnectDB();
    fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    resetConsentVerifier();
    await clearDB();

    const passwordHash = hashPassword("Password@123");
    [admin, student1, student2, teacher, sponsor] = await User.create([
      { email: "admin_s3@test.com", passwordHash, role: "ADMIN", status: "ACTIVE" },
      {
        email: "student1_s3@test.com",
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Nguyen Thi Lan", dateOfBirth: new Date("2009-05-10") },
      },
      {
        email: "student2_s3@test.com",
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Tran Van Nam", dateOfBirth: new Date("2008-03-15") },
      },
      {
        email: "teacher_s3@test.com",
        passwordHash,
        role: "TEACHER",
        status: "ACTIVE",
        teacherProfile: { fullName: "Teacher Stage 3", verificationStatus: "VERIFIED" },
      },
      {
        email: "sponsor_s3@test.com",
        passwordHash,
        role: "SPONSOR",
        status: "ACTIVE",
        sponsorProfile: { sponsorType: "INDIVIDUAL", representativeName: "Sponsor Stage 3" },
      },
    ]);

    tokens = {
      admin: signAccessToken(admin),
      student1: signAccessToken(student1),
      student2: signAccessToken(student2),
      teacher: signAccessToken(teacher),
      sponsor: signAccessToken(sponsor),
    };
  });

  describe("1. AID-01 Campaign Checklist, Nonfinancial Dossier Lifecycle & RBAC/PII Guards", () => {
    it("locks campaign checklist after publish and controls DRAFT -> SUBMITTED -> DOSSIER_VERIFIED with ZERO fund allocation", async () => {
      // Admin creates DRAFT campaign, updates checklist cleanly while DRAFT
      const draftRes = await request(app)
        .post("/api/admin/campaigns")
        .set(as("admin"))
        .send({
          title: "Campaign Checklist Test",
          targetBudget: 2000000,
          expectedSlots: 2,
          awardAmountPerStudent: 1000000,
          fundingStart: new Date(NOW - DAY).toISOString(),
          fundingEnd: new Date(NOW + 20 * DAY).toISOString(),
          applicationStart: new Date(NOW - DAY).toISOString(),
          applicationEnd: new Date(NOW + 20 * DAY).toISOString(),
        });
      expect(draftRes.statusCode).toBe(201);
      const campaignId = draftRes.body.data.id;

      // Student cannot read DRAFT campaign checklist
      expect((await request(app).get(`/api/campaigns/${campaignId}/checklist`).set(as("student1"))).statusCode).toBe(404);

      // Admin updates checklist on DRAFT
      const putChecklist = await request(app)
        .put(`/api/admin/campaigns/${campaignId}/checklist`)
        .set(as("admin"))
        .send({
          documentChecklist: [
            { code: "HOC_BA", title: "Hoc ba", required: true, acceptedMode: "ONLINE", maxFiles: 2 },
            { code: "HO_KHAU", title: "Ho khau", required: true, acceptedMode: "EITHER", maxFiles: 2 },
          ],
          dossierPolicy: { requireGuardianInfo: true, requireSchoolInfo: true, allowPaperDossier: true, allowDraftSave: true },
        });
      expect(putChecklist.statusCode).toBe(200);
      expect(putChecklist.body.data.documentChecklist).toHaveLength(2);

      // Publish & verify lock
      expect((await request(app).post(`/api/admin/campaigns/${campaignId}/publish`).set(as("admin"))).statusCode).toBe(200);
      await ScholarshipCampaign.updateOne({ _id: campaignId }, { $set: { fundedAmount: mongoose.Types.Decimal128.fromString("1000000") } });

      const lockedEdit = await request(app)
        .put(`/api/admin/campaigns/${campaignId}/checklist`)
        .set(as("admin"))
        .send({ documentChecklist: [{ code: "NEW", title: "New" }] });
      expect(lockedEdit.statusCode).toBe(409);
      expect(lockedEdit.body.error).toBe("CAMPAIGN_FIELD_LOCKED");

      // Published checklist readable by Student, refused for Teacher/Sponsor
      expect((await request(app).get(`/api/campaigns/${campaignId}/checklist`).set(as("student1"))).statusCode).toBe(200);
      expect((await request(app).get(`/api/campaigns/${campaignId}/checklist`).set(as("teacher"))).statusCode).toBe(403);
      expect((await request(app).get(`/api/campaigns/${campaignId}/checklist`).set(as("sponsor"))).statusCode).toBe(403);

      // Student saves DRAFT first
      const hocBaKey = await uploadProofFor("student1");
      const draftDossier = await request(app)
        .post(`/api/campaigns/${campaignId}/dossiers`)
        .set(as("student1"))
        .send({
          saveAsDraft: true,
          submissionMode: "ONLINE",
          statement: "Gia dinh kho khan can ho tro hoc tap",
          documents: [{ checklistItemCode: "HOC_BA", title: "Hoc ba ky 1", files: [{ storageKey: hocBaKey }] }],
        });
      expect(draftDossier.statusCode).toBe(201);
      expect(draftDossier.body.data.status).toBe("DRAFT");
      expect(draftDossier.body.data.applicationCode).toMatch(/^APP-\d{8}-[A-F0-9]{6}$/);
      const dossierId = draftDossier.body.data.id;

      // Attempting submit while missing guardianInfo/schoolInfo fails cleanly with 400
      const failIncomplete = await request(app)
        .post(`/api/me/scholarship-dossiers/${dossierId}/submit`)
        .set(as("student1"))
        .send({});
      expect(failIncomplete.statusCode).toBe(400);

      // Student updates draft with guardianInfo, schoolInfo, and second checklist item HO_KHAU
      const hoKhauKey = await uploadProofFor("student1");
      const patchDossier = await request(app)
        .patch(`/api/me/scholarship-dossiers/${dossierId}`)
        .set(as("student1"))
        .send({
          guardianInfo: VALID_GUARDIAN,
          schoolInfo: VALID_SCHOOL,
          documents: [{ checklistItemCode: "HO_KHAU", title: "So ho khau", files: [{ storageKey: hoKhauKey }] }],
        });
      expect(patchDossier.statusCode).toBe(200);
      expect(patchDossier.body.data.guardianInfo.fullName).toBe("Nguyen Van Minh");
      expect(patchDossier.body.data.schoolInfo.gradeLevel).toBe("GRADE_11");

      // Public/Teacher/Sponsor/Foreign Student CANNOT see guardianInfo or schoolInfo anywhere
      const publicCampaign = await request(app).get(`/api/campaigns/${campaignId}`);
      expect(JSON.stringify(publicCampaign.body)).not.toContain("Nguyen Van Minh");
      expect(JSON.stringify(publicCampaign.body)).not.toContain("0912345678");
      expect((await request(app).get(`/api/me/scholarship-applications/${dossierId}`).set(as("student2"))).statusCode).toBe(404);
      expect((await request(app).get(`/api/me/scholarship-applications/${dossierId}`).set(as("teacher"))).statusCode).toBe(403);
      expect((await request(app).get(`/api/me/scholarship-applications/${dossierId}`).set(as("sponsor"))).statusCode).toBe(403);

      // Submit DRAFT -> SUBMITTED
      const submitted = await request(app)
        .post(`/api/me/scholarship-dossiers/${dossierId}/submit`)
        .set(as("student1"))
        .send({ status: "APPROVED", awardAmountPerStudent: 9999999 });
      expect(submitted.statusCode).toBe(200);
      expect(submitted.body.data.status).toBe("SUBMITTED");
      expect(submitted.body.data.guardianInfo.phone).toBe("0912345678");

      // Owner reads detail: receives signed URLs + NO admin reviewer/verifier IDs
      const myDetail = await request(app)
        .get(`/api/me/scholarship-applications/${dossierId}`)
        .set(as("student1"));
      expect(myDetail.statusCode).toBe(200);
      expect(myDetail.body.data.documents).toHaveLength(2);
      const signedDownload = await request(app).get(stripOrigin(myDetail.body.data.documents[0].files[0].url));
      expect(signedDownload.statusCode).toBe(200);

      // Admin nonfinancial verify-dossier -> DOSSIER_VERIFIED (CRITICAL: ZERO financial/fund mutation!)
      const verified = await request(app)
        .post(`/api/admin/scholarship-applications/${dossierId}/verify-dossier`)
        .set(as("admin"))
        .send({ reviewNote: "Da xac minh thong tin giam ho, truong lop va ho so hop le" });
      expect(verified.statusCode).toBe(200);
      expect(verified.body.data.application.status).toBe("DOSSIER_VERIFIED");
      expect(verified.body.data.financialAllocated).toBe(false);
      expect(verified.body.data.readyForAid06GrantReview).toBe(true);

      // Verify zero Scholarship, zero Transaction, zero ScholarshipUsage, allocatedAmount stays 0
      expect(await Scholarship.countDocuments({})).toBe(0);
      expect(await Transaction.countDocuments({})).toBe(0);
      expect(await ScholarshipUsage.countDocuments({})).toBe(0);
      const campaignDoc = await ScholarshipCampaign.findById(campaignId);
      expect(campaignDoc.allocatedAmount.toString()).toBe("0");
      expect(await AuditLog.countDocuments({ action: "SCHOLARSHIP_DOSSIER_VERIFIED", targetId: dossierId })).toBe(1);

      // Student re-fetching detail still NEVER receives admin IDs (reviewedBy/verifiedBy)
      const myVerifiedDetail = await request(app)
        .get(`/api/me/scholarship-applications/${dossierId}`)
        .set(as("student1"));
      expect(myVerifiedDetail.statusCode).toBe(200);
      expect(JSON.stringify(myVerifiedDetail.body)).not.toContain(admin._id.toString());
      expect(myVerifiedDetail.body.data.reviewNote).toContain("Da xac minh");

      // Concurrent double verify-dossier attempt fails atomically
      const secondVerify = await request(app)
        .post(`/api/admin/scholarship-applications/${dossierId}/verify-dossier`)
        .set(as("admin"))
        .send({});
      expect(secondVerify.statusCode).toBe(409);
    });

    it("enforces concurrent duplicate prevention, withdraw recovery, and AID-08 fail-closed consent gate", async () => {
      const campaignId = await createCampaignWithChecklist({
        checklist: [{ code: "HOC_BA", title: "Hoc ba", required: true, acceptedMode: "ONLINE" }],
        dossierPolicy: {
          requireGuardianInfo: true,
          requireSchoolInfo: true,
          allowPaperDossier: true,
          allowDraftSave: true,
          requireGuardianConsentForMinor: true,
        },
      });

      const key1 = await uploadProofFor("student1");
      const key2 = await uploadProofFor("student1");
      const payload = (k) => ({
        submissionMode: "ONLINE",
        statement: "Hoan canh kho khan can xet ho tro",
        guardianInfo: VALID_GUARDIAN,
        schoolInfo: VALID_SCHOOL,
        documents: [{ checklistItemCode: "HOC_BA", files: [{ storageKey: k }] }],
      });

      // Without AID-08 consent verifier -> fail-closed 503 CONSENT_DEPENDENCY_BLOCKED
      const blockedByConsent = await request(app)
        .post(`/api/campaigns/${campaignId}/dossiers`)
        .set(as("student1"))
        .send(payload(key1));
      expect(blockedByConsent.statusCode).toBe(503);
      expect(blockedByConsent.body.error).toBe("CONSENT_DEPENDENCY_BLOCKED");

      // Register AID-08 verifier approving student1
      const consentRecordId = new mongoose.Types.ObjectId();
      setConsentVerifier(async () => ({ verified: true, consentRecordId }));

      // Fire two concurrent dossier submissions for the same student+campaign
      const [r1, r2] = await Promise.all([
        request(app).post(`/api/campaigns/${campaignId}/dossiers`).set(as("student1")).send(payload(key1)),
        request(app).post(`/api/campaigns/${campaignId}/dossiers`).set(as("student1")).send(payload(key2)),
      ]);
      const statuses = [r1.statusCode, r2.statusCode].sort();
      expect(statuses).toEqual([201, 409]);
      expect(await ScholarshipApplication.countDocuments({ studentId: student1._id, campaignId })).toBe(1);

      const createdId = r1.statusCode === 201 ? r1.body.data.id : r2.body.data.id;

      // Withdraw application cleanly, allowing fresh submission afterwards
      const withdrawn = await request(app)
        .post(`/api/me/scholarship-dossiers/${createdId}/withdraw`)
        .set(as("student1"))
        .send({ reason: "Cap nhat lai thong tin" });
      expect(withdrawn.statusCode).toBe(200);
      expect(withdrawn.body.data.status).toBe("WITHDRAWN");

      const reapplied = await request(app)
        .post(`/api/campaigns/${campaignId}/dossiers`)
        .set(as("student1"))
        .send(payload(key2));
      expect(reapplied.statusCode).toBe(201);
      expect(reapplied.body.data.consentSnapshot.status).toBe("VERIFIED");
      expect(reapplied.body.data.consentSnapshot.consentRecordId).toBe(consentRecordId.toString());
    });
  });

  describe("2. AID-04 Paper Dossier Receipt Intake, Linking, Reconciliation & Concurrency", () => {
    it("completes HYBRID online + mailroom unlinked intake -> link -> discrepancy -> reconciled -> verify-dossier workflow without PII/admin ID leaks", async () => {
      const campaignId = await createCampaignWithChecklist({ funded: 2000000 });
      const hocBaKey = await uploadProofFor("student1");

      // Student submits HYBRID dossier with ONLINE item HOC_BA; PAPER item XAC_NHAN_UBND + EITHER item HO_KHAU will arrive via post
      const dossierRes = await request(app)
        .post(`/api/campaigns/${campaignId}/dossiers`)
        .set(as("student1"))
        .send({
          submissionMode: "HYBRID",
          statement: "Gia dinh o xa, giay xac nhan UBND gui qua buu dien",
          guardianInfo: VALID_GUARDIAN,
          schoolInfo: VALID_SCHOOL,
          documents: [{ checklistItemCode: "HOC_BA", title: "Hoc ba scan", files: [{ storageKey: hocBaKey }] }],
        });
      expect(dossierRes.statusCode).toBe(201);
      const applicationId = dossierRes.body.data.id;
      const applicationCode = dossierRes.body.data.applicationCode;

      // Cannot verify dossier before paper receipt reconciliation
      const earlyVerify = await request(app)
        .post(`/api/admin/scholarship-applications/${applicationId}/verify-dossier`)
        .set(as("admin"))
        .send({});
      expect(earlyVerify.statusCode).toBe(409);
      expect(earlyVerify.body.error).toBe("DOSSIER_CHECKLIST_INCOMPLETE");

      // Student cannot call admin paper intake
      expect(
        (
          await request(app)
            .post("/api/admin/paper-dossiers")
            .set(as("student1"))
            .send({ postalInfo: { carrierName: "VNPost", trackingNumber: "VN999", senderName: "Nguyen Van Minh" } })
        ).statusCode
      ).toBe(403);

      // Mailroom intake initially WITHOUT applicationId (unlinked arrival)
      const intakeRes = await request(app)
        .post("/api/admin/paper-dossiers")
        .set(as("admin"))
        .send({
          declaredApplicationCode: applicationCode,
          receivingLocation: "Phong Tuyen sinh Ha Noi",
          intakeNote: "Phong bi niem phong nguyen ven",
          postalInfo: {
            deliveryMethod: "POSTAL_MAIL",
            carrierName: "VNPost",
            trackingNumber: "vnpost-888-ha-giang",
            senderName: "Nguyen Van Minh",
            senderPhone: "0912345678",
            sentAt: new Date(NOW - 3600000).toISOString(),
            packageCondition: "INTACT",
          },
        });
      expect(intakeRes.statusCode).toBe(201);
      const receiptId = intakeRes.body.data.id;
      expect(intakeRes.body.data.status).toBe("RECEIVED");
      expect(intakeRes.body.data.receivedBy).toBe(admin._id.toString());
      expect(intakeRes.body.data.postalInfo.trackingNumber).toBe("VNPOST-888-HA-GIANG");
      expect(intakeRes.body.data.history).toHaveLength(1);

      // Duplicate tracking number rejected (case-insensitive carrier/tracking!)
      const dupTracking = await request(app)
        .post("/api/admin/paper-dossiers")
        .set(as("admin"))
        .send({
          postalInfo: {
            deliveryMethod: "POSTAL_MAIL",
            carrierName: "vnpost",
            trackingNumber: "VNPOST-888-HA-GIANG",
            senderName: "Nguyen Van Minh",
          },
        });
      expect(dupTracking.statusCode).toBe(409);
      expect(dupTracking.body.error).toBe("DUPLICATE_TRACKING_NUMBER");

      // Cannot reconcile before linking
      const unlinkedReconcile = await request(app)
        .post(`/api/admin/paper-dossiers/${receiptId}/reconcile`)
        .set(as("admin"))
        .send({ status: "IN_RECONCILIATION" });
      expect(unlinkedReconcile.statusCode).toBe(409);
      expect(unlinkedReconcile.body.error).toBe("APPLICATION_LINK_REQUIRED");

      // Linking to wrong student fails cleanly
      const wrongLink = await request(app)
        .post(`/api/admin/paper-dossiers/${receiptId}/link`)
        .set(as("admin"))
        .send({ applicationCode, studentId: student2._id.toString() });
      expect(wrongLink.statusCode).toBe(409);
      expect(wrongLink.body.error).toBe("APPLICATION_LINK_MISMATCH");

      // Proper link by applicationCode
      const linked = await request(app)
        .post(`/api/admin/paper-dossiers/${receiptId}/link`)
        .set(as("admin"))
        .send({ applicationCode, note: "Khop ma ho so tren phong bi" });
      expect(linked.statusCode).toBe(200);
      expect(linked.body.data.applicationId).toBe(applicationId);
      expect(linked.body.data.history).toHaveLength(2);

      // Concurrent duplicate receipt attempt on same linked application -> fails atomically (409)
      const [dupA, dupB] = await Promise.all([
        request(app)
          .post("/api/admin/paper-dossiers")
          .set(as("admin"))
          .send({
            applicationId,
            postalInfo: { carrierName: "ViettelPost", trackingNumber: "VTP-CONC-1", senderName: "Sender 1" },
          }),
        request(app)
          .post("/api/admin/paper-dossiers")
          .set(as("admin"))
          .send({
            applicationId,
            postalInfo: { carrierName: "ViettelPost", trackingNumber: "VTP-CONC-2", senderName: "Sender 2" },
          }),
      ]);
      expect(dupA.statusCode).toBe(409);
      expect(dupB.statusCode).toBe(409);

      // Admin starts reconciliation & reports DISCREPANCY first (missing HO_KHAU page)
      const discrepancy = await request(app)
        .post(`/api/admin/paper-dossiers/${receiptId}/reconcile`)
        .set(as("admin"))
        .send({
          status: "DISCREPANCY",
          discrepancyReason: "Thieu trang 2 ban sao ho khau",
          reconciledItems: [
            { checklistItemCode: "XAC_NHAN_UBND", itemStatus: "MATCHED", isOriginal: true, hasOfficialStamp: true },
            { checklistItemCode: "HO_KHAU", itemStatus: "MISSING", pageCount: 0, note: "Thieu trang 2" },
          ],
        });
      expect(discrepancy.statusCode).toBe(200);
      expect(discrepancy.body.data.status).toBe("DISCREPANCY");

      // Cannot verify dossier while linked receipt is in DISCREPANCY
      const verifyDuringDiscrepancy = await request(app)
        .post(`/api/admin/scholarship-applications/${applicationId}/verify-dossier`)
        .set(as("admin"))
        .send({});
      expect(verifyDuringDiscrepancy.statusCode).toBe(409);
      expect(verifyDuringDiscrepancy.body.error).toBe("PAPER_RECEIPT_DISCREPANCY_UNRESOLVED");

      // Discrepancy resolved (supplement received/verified) -> two concurrent RECONCILED requests race cleanly
      const reconcilePayload = {
        status: "RECONCILED",
        reconciliationNote: "Da bo sung du ban sao ho khau va doi chieu khop",
        reconciledItems: [
          { checklistItemCode: "XAC_NHAN_UBND", itemStatus: "MATCHED", isOriginal: true, hasOfficialStamp: true, pageCount: 1 },
          { checklistItemCode: "HO_KHAU", itemStatus: "MATCHED", pageCount: 3 },
        ],
      };
      const [rec1, rec2] = await Promise.all([
        request(app).post(`/api/admin/paper-dossiers/${receiptId}/reconcile`).set(as("admin")).send(reconcilePayload),
        request(app).post(`/api/admin/paper-dossiers/${receiptId}/reconcile`).set(as("admin")).send(reconcilePayload),
      ]);
      const recCodes = [rec1.statusCode, rec2.statusCode].sort();
      expect(recCodes).toEqual([200, 409]);

      const storedReceipt = await PaperDossierReceipt.findById(receiptId);
      expect(storedReceipt.status).toBe("RECONCILED");
      expect(storedReceipt.history).toHaveLength(4); // RECEIPT_LOGGED, APPLICATION_LINKED, DISCREPANCY_REPORTED, RECONCILED_MATCHED

      // Student reads paper receipt status -> zero admin IDs leaked, student2 gets 404
      expect(
        (await request(app).get(`/api/me/scholarship-applications/${applicationId}/paper-receipts`).set(as("student2"))).statusCode
      ).toBe(404);
      const studentReceipts = await request(app)
        .get(`/api/me/scholarship-applications/${applicationId}/paper-receipts`)
        .set(as("student1"));
      expect(studentReceipts.statusCode).toBe(200);
      expect(studentReceipts.body.data).toHaveLength(1);
      expect(studentReceipts.body.data[0].status).toBe("RECONCILED");
      expect(JSON.stringify(studentReceipts.body)).not.toContain(admin._id.toString());
      expect(JSON.stringify(studentReceipts.body)).not.toContain("admin_s3@test.com");

      // Now Admin verifies full HYBRID dossier -> DOSSIER_VERIFIED with ZERO scholarships or transactions!
      const finalVerify = await request(app)
        .post(`/api/admin/scholarship-applications/${applicationId}/verify-dossier`)
        .set(as("admin"))
        .send({ reviewNote: "Ho so HYBRID online + ban giay hop le" });
      expect(finalVerify.statusCode).toBe(200);
      expect(finalVerify.body.data.application.status).toBe("DOSSIER_VERIFIED");
      expect(await Scholarship.countDocuments({})).toBe(0);
      expect(await Transaction.countDocuments({})).toBe(0);
      expect((await ScholarshipCampaign.findById(campaignId)).allocatedAmount.toString()).toBe("0");
    });

    it("frees application unique slot when a PaperDossierReceipt is rejected, and blocks concurrent duplicate receipts on intake", async () => {
      const campaignId = await createCampaignWithChecklist({
        checklist: [{ code: "XAC_NHAN_UBND", title: "Xac nhan UBND", required: true, acceptedMode: "PAPER" }],
      });

      const appRes = await request(app)
        .post(`/api/campaigns/${campaignId}/dossiers`)
        .set(as("student1"))
        .send({
          submissionMode: "PAPER",
          statement: "Ho so ban giay 100%",
          guardianInfo: VALID_GUARDIAN,
          schoolInfo: VALID_SCHOOL,
        });
      expect(appRes.statusCode).toBe(201);
      const applicationId = appRes.body.data.id;

      // Race 2 concurrent intakes for the same application -> strictly 1 created, 1 gets 409!
      const [c1, c2] = await Promise.all([
        request(app)
          .post("/api/admin/paper-dossiers")
          .set(as("admin"))
          .send({
            applicationId,
            postalInfo: { carrierName: "GHN", trackingNumber: "GHN-RACE-1", senderName: "Sender" },
          }),
        request(app)
          .post("/api/admin/paper-dossiers")
          .set(as("admin"))
          .send({
            applicationId,
            postalInfo: { carrierName: "GHN", trackingNumber: "GHN-RACE-2", senderName: "Sender" },
          }),
      ]);
      expect([c1.statusCode, c2.statusCode].sort()).toEqual([201, 409]);

      const firstReceiptId = c1.statusCode === 201 ? c1.body.data.id : c2.body.data.id;

      // Admin rejects wet/unreadable mailing
      const rejected = await request(app)
        .post(`/api/admin/paper-dossiers/${firstReceiptId}/reject`)
        .set(as("admin"))
        .send({ reason: "Ho so bi uot khong doc duoc dau do" });
      expect(rejected.statusCode).toBe(200);
      expect(rejected.body.data.status).toBe("REJECTED");

      // Student re-sends clean envelope -> new receipt succeeds!
      const replacement = await request(app)
        .post("/api/admin/paper-dossiers")
        .set(as("admin"))
        .send({
          applicationId,
          postalInfo: { carrierName: "VNPost", trackingNumber: "VN-REPLACE-01", senderName: "Nguyen Van Minh" },
        });
      expect(replacement.statusCode).toBe(201);
      expect(await PaperDossierReceipt.countDocuments({ applicationId })).toBe(2);
    });
  });
});

