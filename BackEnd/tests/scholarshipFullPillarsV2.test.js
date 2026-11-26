const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  ScholarshipCampaign,
  ScholarshipApplication,
  Scholarship,
  SponsorContribution,
  ScholarshipFundingReconciliation,
  PaperDossierReceipt,
  RefundCase,
  GuardianConsent,
  Payment,
  PaymentReconciliation,
  Class,
  Course,
  Subject,
  Category,
  Enrollment,
  ScholarshipUsage,
  VerificationDocument,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const refundService = require("../src/services/refundService");
const campaignService = require("../src/services/campaignService");
const contributionService = require("../src/services/contributionService");
const scholarshipService = require("../src/services/scholarshipService");
const scholarshipPaymentService = require("../src/services/scholarshipPaymentService");
const { releaseReservation } = require("../src/services/reservationService");
const {
  confirmScholarshipUsage,
} = require("../src/services/settlementService");
const { decrypt } = require("../src/utils/pii");
const {
  runScholarshipIntegrityAudit,
} = require("../src/scripts/scholarshipDataIntegrityCheck");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");

let users = {};
let tokens = {};
let campaign;

const as = (roleName) => ({ Authorization: `Bearer ${tokens[roleName]}` });

// Independent verification submitted by the assigned Verifier itself
const verifiedBy = (verifierId) => ({
  screenedBy: users.adminScreening?._id,
  screenedAt: new Date(),
  screeningResult: { layer1Passed: true },
  assignedVerifierId: verifierId,
  verifierResult: {
    status: "VERIFIED_MATCHED",
    verifiedBy: verifierId,
    verifiedAt: new Date(),
    notes: "Xác minh thực địa",
  },
});

const baseDossier = (studentKey, code, extra = {}) => ({
  campaignId: campaign._id,
  studentId: users[studentKey]._id,
  applicationCode: code,
  status: "SUBMITTED",
  screenedBy: users.adminScreening?._id,
  screenedAt: new Date(),
  screeningResult: { layer1Passed: true },
  guardianInfo: {
    fullName: "Bố Học Sinh",
    relationship: "FATHER",
    phone: "0912345678",
    cccd: "001234567890",
  },
  schoolInfo: {
    schoolName: "THPT Chuyên",
    gradeLevel: "GRADE_10",
    className: "10A",
  },
  submittedAt: new Date(),
  ...extra,
});

const applyPayload = {
  submissionMode: "PAPER",
  guardianInfo: {
    fullName: "Bố",
    relationship: "FATHER",
    phone: "0912345678",
    cccd: "001234567890",
  },
  schoolInfo: { schoolName: "THPT", gradeLevel: "GRADE_10", className: "10A" },
};

// For every blocked approval: no Scholarship created, allocatedAmount unchanged
const expectNoGrant = async (allocatedBefore) => {
  expect(await Scholarship.countDocuments({ campaignId: campaign._id })).toBe(
    0,
  );
  const after = await ScholarshipCampaign.findById(campaign._id);
  expect(Number(after.allocatedAmount)).toBe(allocatedBefore);
};

const createUser = async (name, role, extra = {}) => {
  users[name] = await User.create({
    email: `${name}@edunity-test.vn`,
    passwordHash: hashPassword("Secret123!"),
    role,
    status: "ACTIVE",
    ...extra,
  });
  tokens[name] = signAccessToken(users[name]);
};

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

beforeEach(async () => {
  await clearDB();
  users = {};
  tokens = {};

  const FINAL_APPROVER = {
    adminProfile: { permissions: ["SCHOLARSHIP_FINAL_APPROVE"] },
  };
  await createUser("adminIntake", "ADMIN", FINAL_APPROVER); // has authority, but must still be blocked by SoD
  await createUser("adminApprover", "ADMIN", FINAL_APPROVER);
  await createUser("adminApprover2", "ADMIN", FINAL_APPROVER);
  await createUser("adminScreening", "ADMIN");
  await createUser("adminNoFinalPerm", "ADMIN"); // regular admin without final-approval permission
  await createUser("verifierA", "VERIFIER");
  await createUser("verifierB", "VERIFIER");
  await createUser("student1", "STUDENT", {
    studentProfile: {
      fullName: "Nguyễn Văn An",
      dateOfBirth: new Date("2005-01-01"),
    }, // Adult
  });
  await createUser("student2", "STUDENT", {
    studentProfile: {
      fullName: "Trần Thị Bình",
      dateOfBirth: new Date("2010-06-15"),
    }, // Minor (under 18)
  });
  await createUser("sponsor", "SPONSOR");
  await createUser("teacher", "TEACHER");

  campaign = await ScholarshipCampaign.create({
    createdBy: users.adminIntake._id,
    title: "Chiến dịch Học bổng Tiếp sức 2026",
    targetBudget: 10000000,
    expectedSlots: 5,
    awardAmountPerStudent: 2000000,
    fundedAmount: 0,
    refundedAmount: 0,
    allocatedAmount: 0,
    usedAmount: 0,
    status: "OPEN_FOR_FUNDING",
    isAcceptingFunding: true,
    applicationStart: new Date(Date.now() - 7 * 86400000),
    applicationEnd: new Date(Date.now() + 30 * 86400000),
    resultPublicationDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // published yesterday
  });
});

afterAll(disconnectDB);

describe("EDUNITY V3 — 4 Pillars Charity & Scholarship Subsystem Verification", () => {
  // =========================================================================
  // PILLAR 1: QUỸ TÀI TRỢ VÀ HOÀN TIỀN (Fund Management, Refunds & Metrics)
  // =========================================================================
  describe("Pillar 1: Quỹ tài trợ và hoàn tiền", () => {
    test("Receive 5M, partial refund 1M, allocate 2M -> availableFund = 2M (exactly 1 standard slot)", async () => {
      // 1. Receive 5,000,000 donation
      const contrib = await SponsorContribution.create({
        campaignId: campaign._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        paymentReference: "PAYOS-DONATION-001",
      });
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $inc: { fundedAmount: 5000000 } },
      );

      // 2. Partial refund 1,000,000 via refundService
      const refundCase = await RefundCase.create({
        caseNumber: "REF-TEST-001",
        recipientUserId: users.sponsor._id,
        relatedContributionId: contrib._id,
        originalAmount: 5000000,
        requestedAmount: 1000000,
        eligibleAmount: 1000000,
        approvedAmount: 1000000,
        approvedBy: users.adminIntake._id,
        approvedAt: new Date(),
        reason: "Sponsor requested partial refund",
        purpose: "DONATION",
        channelKey: "DONATION",
        beneficiaryBankAccount: {
          bankName: "VCB",
          accountNumber: "0123456789",
          accountHolderName: "NGUYEN VAN SPONSOR",
        },
        status: "APPROVED",
      });

      // Submit proof and complete refund
      await refundService.submitRefundProof(
        users.adminIntake._id,
        refundCase._id,
        {
          referenceNumber: "BANK-REF-001",
          autoVerify: true,
        },
      );

      // Check SponsorContribution status: PARTIALLY_REFUNDED, not losing principal!
      const updatedContrib = await SponsorContribution.findById(contrib._id);
      expect(updatedContrib.contributionStatus).toBe("PARTIALLY_REFUNDED");
      expect(Number(updatedContrib.refundedAmount)).toBe(1000000);

      // 3. Allocate 2,000,000 for 1 scholarship (used amount 500,000 is inside allocated)
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $inc: { allocatedAmount: 2000000, usedAmount: 500000 } },
      );

      // 4. Verify 6+1 Metrics
      const res = await request(app).get(`/api/campaigns/${campaign._id}`);
      expect(res.status).toBe(200);
      const metrics = res.body.data;

      expect(Number(metrics.receivedFund)).toBe(5000000);
      expect(Number(metrics.confirmedFund)).toBe(5000000);
      expect(Number(metrics.refundedFund)).toBe(1000000);
      // netEligibleFund = 5M - 1M = 4M
      expect(Number(metrics.netEligibleFund)).toBe(4000000);
      expect(Number(metrics.allocatedAmount)).toBe(2000000);
      expect(Number(metrics.usedAmount)).toBe(500000);
      // availableFund = 4M - 2M = 2M (usedAmount is inside allocatedAmount and not deducted twice!)
      expect(Number(metrics.availableFund)).toBe(2000000);
      expect(Number(metrics.standardSlotValue)).toBe(2000000);
      // standardSlotsAvailable = floor(2M / 2M) = 1
      expect(Number(metrics.standardSlotsAvailable)).toBe(1);
    });

    test("Full refund transitions contribution to REFUNDED, and idempotent replay does not decrement twice", async () => {
      const contrib = await SponsorContribution.create({
        campaignId: campaign._id,
        sponsorId: users.sponsor._id,
        amount: 3000000,
        contributionStatus: "COMPLETED",
        paymentReference: "PAYOS-DONATION-FULL",
      });
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $inc: { fundedAmount: 3000000 } },
      );

      // Refund the entire 3,000,000
      const refundCase = await RefundCase.create({
        caseNumber: "REF-TEST-FULL",
        recipientUserId: users.sponsor._id,
        relatedContributionId: contrib._id,
        originalAmount: 3000000,
        requestedAmount: 3000000,
        eligibleAmount: 3000000,
        approvedAmount: 3000000,
        approvedBy: users.adminIntake._id,
        reason: "Sponsor requested full refund",
        purpose: "DONATION",
        channelKey: "DONATION",
        beneficiaryBankAccount: {
          bankName: "VCB",
          accountNumber: "0123456789",
          accountHolderName: "NGUYEN VAN SPONSOR",
        },
        status: "APPROVED",
      });

      await refundService.submitRefundProof(
        users.adminIntake._id,
        refundCase._id,
        {
          referenceNumber: "BANK-REF-FULL",
          autoVerify: true,
        },
      );

      const updatedContrib = await SponsorContribution.findById(contrib._id);
      expect(updatedContrib.contributionStatus).toBe("REFUNDED");
      expect(Number(updatedContrib.refundedAmount)).toBe(3000000);

      const campAfterFirst = await ScholarshipCampaign.findById(campaign._id);
      expect(Number(campAfterFirst.refundedAmount)).toBe(3000000);

      // Idempotency: verifyAndCompleteRefund called again on completed case returns without duplicate decrement
      const replayed = await refundService.verifyAndCompleteRefund(
        users.adminApprover._id,
        refundCase._id,
        {
          bankReference: "BANK-REF-FULL",
        },
      );
      expect(replayed.status).toBe("COMPLETED");

      const campAfterReplay = await ScholarshipCampaign.findById(campaign._id);
      expect(Number(campAfterReplay.refundedAmount)).toBe(3000000); // Strictly unchanged!
    });

    test("Reconciliation: pending contributions block reconciliation, auto-expires expired checkouts, metrics include unallocatedRemainder & subslotRemainder", async () => {
      // 1. Create a closed campaign with 7M donation (3 slots of 2M + 1M remainder)
      const recCampaign = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Đối Soát Chốt Suất",
        targetBudget: 10000000,
        expectedSlots: 2, // Original target is 2 slots!
        awardAmountPerStudent: 2000000,
        fundedAmount: 7000000,
        status: "OPEN_FOR_FUNDING",
        fundingStart: new Date(Date.now() - 30 * 86400000),
        fundingEnd: new Date(Date.now() - 86400000), // Ended yesterday!
        allowSlotExpansion: true, // Allow exceeding target budget
      });

      // Contribution 1: 5M confirmed
      await SponsorContribution.create({
        campaignId: recCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        orderCode: 888001,
        provider: "PAYOS",
        gateway: "PAYOS",
        paymentReference: "PAYOS-DONATION-REC-1",
      });

      // Contribution 2: 2M confirmed
      await SponsorContribution.create({
        campaignId: recCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 2000000,
        contributionStatus: "COMPLETED",
        orderCode: 888002,
        provider: "PAYOS",
        gateway: "PAYOS",
        paymentReference: "PAYOS-DONATION-REC-2",
      });

      // Contribution 3: Expired pending checkout (expired 2 hours ago)
      await SponsorContribution.create({
        campaignId: recCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 1000000,
        contributionStatus: "PENDING",
        provider: "PAYOS",
        gateway: "PAYOS",
        expiredAt: new Date(Date.now() - 2 * 3600000),
        paymentReference: "PAYOS-DONATION-REC-EXPIRED",
      });

      // Contribution 4: Active pending checkout (still valid for 30 minutes)
      const activePending = await SponsorContribution.create({
        campaignId: recCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 1500000,
        contributionStatus: "PENDING",
        provider: "PAYOS",
        gateway: "PAYOS",
        expiredAt: new Date(Date.now() + 1800000),
        paymentReference: "PAYOS-DONATION-REC-ACTIVE-PENDING",
      });

      // Attempt reconciliation while active pending exists -> BLOCKED 409 PENDING_CONTRIBUTIONS_EXIST
      const blockedRes = await request(app)
        .post(`/api/admin/campaigns/${recCampaign._id}/reconcile-funding`)
        .set(as("adminApprover"))
        .send({ reason: "Đối soát và chốt số suất chiến dịch theo quy chế" });

      expect(blockedRes.status).toBe(409);
      expect(blockedRes.body.error).toBe("PENDING_CONTRIBUTIONS_EXIST");

      // Now resolve the pending contribution (e.g. marked as FAILED)
      await SponsorContribution.updateOne(
        { _id: activePending._id },
        { $set: { contributionStatus: "FAILED" } },
      );

      // Reconcile successfully!
      const recRes = await request(app)
        .post(`/api/admin/campaigns/${recCampaign._id}/reconcile-funding`)
        .set(as("adminApprover"))
        .send({ reason: "Đối soát và chốt số suất chiến dịch chính thức" });

      expect(recRes.status).toBe(200);
      const snapshot = recRes.body.data;
      // 7M eligible / 2M = 3 slots (allowSlotExpansion allowed 3 slots exceeding expectedSlots=2)
      expect(snapshot.officialSlots).toBe(3);
      expect(Number(snapshot.unusedRemainder)).toBe(1000000); // 7M - 3*2M = 1M

      // Original target expectedSlots is preserved!
      const freshCamp = await ScholarshipCampaign.findById(recCampaign._id);
      expect(freshCamp.expectedSlots).toBe(2);
      expect(freshCamp.officialSlotCount).toBe(3);

      // Check derived metrics: unallocatedRemainder and subslotRemainder
      const metricsRes = await request(app).get(
        `/api/campaigns/${recCampaign._id}`,
      );
      expect(metricsRes.status).toBe(200);
      expect(Number(metricsRes.body.data.unallocatedRemainder)).toBe(1000000);
      expect(Number(metricsRes.body.data.subslotRemainder)).toBe(1000000);
    });

    test("Post-reconciliation refund reduces grantable funding below official slot and rolls back approval", async () => {
      // 1. Campaign with 2M confirmed, reconciled to 1 slot
      const refundCamp = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Hoàn Tiền Sau Đối Soát",
        targetBudget: 2000000,
        expectedSlots: 1,
        awardAmountPerStudent: 2000000,
        fundedAmount: 2000000,
        officialEligibleFunding: 2000000,
        officialSlotCount: 1,
        fundingReconciledAt: new Date(),
        status: "OPEN_FOR_FUNDING",
        fundingEnd: new Date(Date.now() - 86400000),
      });

      const contrib = await SponsorContribution.create({
        campaignId: refundCamp._id,
        sponsorId: users.sponsor._id,
        amount: 2000000,
        contributionStatus: "COMPLETED",
        orderCode: 999001,
        provider: "PAYOS",
        gateway: "PAYOS",
        paymentReference: "PAYOS-REFUND-AFTER-REC",
      });

      // 2. Partial refund 1,000,000 occurs AFTER reconciliation
      const refundCase = await RefundCase.create({
        caseNumber: "REF-POST-REC-001",
        recipientUserId: users.sponsor._id,
        relatedContributionId: contrib._id,
        originalAmount: 2000000,
        requestedAmount: 1000000,
        eligibleAmount: 1000000,
        approvedAmount: 1000000,
        approvedBy: users.adminIntake._id,
        reason: "Sponsor partial refund after lock",
        purpose: "DONATION",
        channelKey: "DONATION",
        beneficiaryBankAccount: {
          bankName: "VCB",
          accountNumber: "0123456789",
          accountHolderName: "NGUYEN VAN SPONSOR",
        },
        status: "APPROVED",
      });
      await refundService.submitRefundProof(
        users.adminIntake._id,
        refundCase._id,
        {
          referenceNumber: "BANK-REF-POST-REC",
          autoVerify: true,
        },
      );

      // Now netCurrentFunding is 1M (2M - 1M), which is LESS than award (2M)
      const appToGrant = await ScholarshipApplication.create({
        campaignId: refundCamp._id,
        studentId: users.student1._id,
        applicationCode: "APP-POST-REC-REFUND",
        status: "DOSSIER_VERIFIED",
        ...verifiedBy(users.verifierA._id),
        guardianInfo: {
          fullName: "Bố",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // Attempt approval -> BLOCKED 409 INSUFFICIENT_CAMPAIGN_FUND and transaction rolls back
      const grantRes = await request(app)
        .post(`/api/admin/scholarship-applications/${appToGrant._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt cấp" });

      expect(grantRes.status).toBe(409);
      expect(grantRes.body.error).toBe("INSUFFICIENT_CAMPAIGN_FUND");

      // Verify rollback: no scholarship created, allocatedAmount unchanged at 0
      expect(
        await Scholarship.countDocuments({ campaignId: refundCamp._id }),
      ).toBe(0);
      const campCheck = await ScholarshipCampaign.findById(refundCamp._id);
      expect(Number(campCheck.allocatedAmount)).toBe(0);
    });

    test("Two sponsors (5M + 3M), full refund 5M -> net 3M; allocate 2M (use 500k) -> remaining 1M; replay refund does not change balance", async () => {
      // 1. Setup isolated campaign
      const flowCamp = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Dòng Tiền Hai Nhà Tài Trợ",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        fundedAmount: 0,
        refundedAmount: 0,
        allocatedAmount: 0,
        usedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        fundingEnd: new Date(Date.now() - 86400000),
      });

      const c1 = await SponsorContribution.create({
        campaignId: flowCamp._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        orderCode: 999101,
        provider: "PAYOS",
        gateway: "PAYOS",
        paymentReference: "PAYOS-5M-001",
      });
      const c2 = await SponsorContribution.create({
        campaignId: flowCamp._id,
        sponsorId: users.sponsor._id,
        amount: 3000000,
        contributionStatus: "COMPLETED",
        orderCode: 999102,
        provider: "PAYOS",
        gateway: "PAYOS",
        paymentReference: "PAYOS-3M-002",
      });
      await ScholarshipCampaign.updateOne(
        { _id: flowCamp._id },
        {
          $set: {
            fundedAmount: 8000000,
            allocatedAmount: 0,
            refundedAmount: 0,
            usedAmount: 0,
          },
        },
      );

      // 2. Full refund 5,000,000 of contribution 1
      const refundCase = await RefundCase.create({
        caseNumber: "REF-FLOW-5M-01",
        recipientUserId: users.sponsor._id,
        relatedContributionId: c1._id,
        originalAmount: 5000000,
        requestedAmount: 5000000,
        eligibleAmount: 5000000,
        approvedAmount: 5000000,
        approvedBy: users.adminIntake._id,
        reason: "Sponsor 1 full refund",
        purpose: "DONATION",
        channelKey: "DONATION",
        beneficiaryBankAccount: {
          bankName: "VCB",
          accountNumber: "0123456789",
          accountHolderName: "NGUYEN VAN SPONSOR",
        },
        status: "APPROVED",
      });
      await refundService.submitRefundProof(
        users.adminIntake._id,
        refundCase._id,
        {
          referenceNumber: "BANK-REF-5M-PROOF",
          autoVerify: true,
        },
      );

      // Net is now 3,000,000 (8M - 5M)
      const campAfterRefund = await ScholarshipCampaign.findById(flowCamp._id);
      expect(Number(campAfterRefund.fundedAmount)).toBe(8000000);
      expect(Number(campAfterRefund.refundedAmount)).toBe(5000000);

      // 3. Allocate 2,000,000 to an approved application
      const app1 = await ScholarshipApplication.create({
        campaignId: flowCamp._id,
        studentId: users.student1._id,
        applicationCode: "APP-FIN-FLOW-01",
        status: "DOSSIER_VERIFIED",
        ...verifiedBy(users.verifierA._id),
        guardianInfo: {
          fullName: "Bố",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });
      const approveRes = await request(app)
        .post(`/api/admin/scholarship-applications/${app1._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt cấp 2M" });
      expect(approveRes.status).toBe(200);

      // 4. Use 500,000 from the awarded scholarship
      const scholarship = await Scholarship.findOne({
        applicationId: app1._id,
      });
      expect(scholarship).toBeTruthy();

      // Update scholarship and campaign to reflect 500k used within the 2M allocation
      await Scholarship.updateOne(
        { _id: scholarship._id },
        { $inc: { usedAmount: 500000, remainingAmount: -500000 } },
      );
      await ScholarshipCampaign.updateOne(
        { _id: flowCamp._id },
        { $inc: { usedAmount: 500000 } },
      );

      // Verify campaign availableFund is 1,000,000 across endpoints
      const publicCampRes = await request(app).get(
        `/api/campaigns/${flowCamp._id}`,
      );
      expect(publicCampRes.status).toBe(200);
      const campData = publicCampRes.body.data;
      expect(Number(campData.fundedAmount)).toBe(8000000);
      expect(Number(campData.refundedAmount)).toBe(5000000);
      expect(
        Number(campData.netEligibleFund || campData.netCurrentFunding),
      ).toBe(3000000);
      expect(Number(campData.allocatedAmount)).toBe(2000000);
      expect(Number(campData.usedAmount)).toBe(500000);
      expect(Number(campData.availableFund)).toBe(1000000);

      // 5. Replay refund does not alter balance
      await expect(
        refundService.submitRefundProof(users.adminIntake._id, refundCase._id, {
          referenceNumber: "BANK-REF-5M-PROOF",
          autoVerify: true,
        }),
      ).rejects.toThrow();

      const campFinal = await ScholarshipCampaign.findById(flowCamp._id);
      expect(Number(campFinal.refundedAmount)).toBe(5000000);
      expect(Number(campFinal.allocatedAmount)).toBe(2000000);
      expect(Number(campFinal.usedAmount)).toBe(500000);
    });

    test("Target 50 slots, eligible fund 160M -> projected 80 slots; lock snapshot 80 slots; post-lock funding & refund tests", async () => {
      // 1. Campaign: target 50 slots, award 2M/slot, 160M funded
      const lockCamp = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch 50 Suất Mục Tiêu",
        targetBudget: 100000000,
        expectedSlots: 50,
        awardAmountPerStudent: 2000000,
        fundedAmount: 160000000,
        allowSlotExpansion: true,
        allocatedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        fundingEnd: new Date(Date.now() - 86400000),
      });

      const confirmedContrib = await SponsorContribution.create({
        campaignId: lockCamp._id,
        sponsorId: users.sponsor._id,
        amount: 160000000,
        contributionStatus: "COMPLETED",
        orderCode: 999160,
        provider: "PAYOS",
        gateway: "PAYOS",
        paymentReference: "PAYOS-160M-CONFIRMED",
      });

      // Pre-lock: expectedSlots = 50, projectedSlots = floor(160M / 2M) = 80
      const preLockRes = await request(app).get(
        `/api/campaigns/${lockCamp._id}`,
      );
      expect(preLockRes.status).toBe(200);
      expect(preLockRes.body.data.expectedSlots).toBe(50);
      expect(preLockRes.body.data.projectedSlots).toBe(80);
      expect(preLockRes.body.data.officialSlotCount).toBeNull();

      // 2. Lock official snapshot: 80 slots at 160M
      const lockRes = await request(app)
        .post(`/api/admin/campaigns/${lockCamp._id}/reconcile-funding`)
        .set(as("adminApprover"))
        .send({ reason: "Chốt đợt 1: 80 suất chính thức từ 160M" });
      expect(lockRes.status).toBe(200);
      expect(lockRes.body.data.officialSlots).toBe(80);
      expect(Number(lockRes.body.data.eligibleFunding)).toBe(160000000);
      expect(lockRes.body.data.campaign.officialSlotCount).toBe(80);
      expect(Number(lockRes.body.data.campaign.officialEligibleFunding)).toBe(
        160000000,
      );

      // Verify reconciliation snapshot in DB
      const snapshot1 = await ScholarshipFundingReconciliation.findOne({
        campaignId: lockCamp._id,
      });
      expect(snapshot1).toBeTruthy();
      expect(snapshot1.officialSlots).toBe(80);
      expect(Number(snapshot1.eligibleFunding)).toBe(160000000);

      // 3. Post-lock: additional money arrives (10M)
      await SponsorContribution.create({
        campaignId: lockCamp._id,
        sponsorId: users.sponsor._id,
        amount: 10000000,
        contributionStatus: "COMPLETED",
        orderCode: 999170,
        provider: "PAYOS",
        gateway: "PAYOS",
        paymentReference: "PAYOS-10M-EXTRA",
      });
      await ScholarshipCampaign.updateOne(
        { _id: lockCamp._id },
        { $inc: { fundedAmount: 10000000 } },
      );

      const postFundingRes = await request(app).get(
        `/api/campaigns/${lockCamp._id}`,
      );
      expect(postFundingRes.status).toBe(200);
      expect(Number(postFundingRes.body.data.fundedAmount)).toBe(170000000);
      expect(postFundingRes.body.data.projectedSlots).toBe(85); // floor(170M / 2M)
      // Official slots remain strictly locked at 80!
      expect(postFundingRes.body.data.officialSlotCount).toBe(80);

      // 4. Post-lock: partial refund (20M)
      const refundCase20M = await RefundCase.create({
        caseNumber: "REF-LOCK-20M",
        recipientUserId: users.sponsor._id,
        relatedContributionId: confirmedContrib._id,
        originalAmount: 160000000,
        requestedAmount: 20000000,
        eligibleAmount: 20000000,
        approvedAmount: 20000000,
        approvedBy: users.adminIntake._id,
        reason: "Partial refund 20M after lock",
        purpose: "DONATION",
        channelKey: "DONATION",
        beneficiaryBankAccount: {
          bankName: "VCB",
          accountNumber: "0123456789",
          accountHolderName: "NGUYEN VAN SPONSOR",
        },
        status: "APPROVED",
      });
      await refundService.submitRefundProof(
        users.adminIntake._id,
        refundCase20M._id,
        {
          referenceNumber: "BANK-REF-20M-PROOF",
          autoVerify: true,
        },
      );

      const postRefundCamp = await ScholarshipCampaign.findById(lockCamp._id);
      expect(Number(postRefundCamp.refundedAmount)).toBe(20000000);
      // Net funding is now 170M - 20M = 150M.
      // Available funding is min(160M, 150M) - 0 = 150M.
      const postRefundRes = await request(app).get(
        `/api/campaigns/${lockCamp._id}`,
      );
      expect(Number(postRefundRes.body.data.availableFund)).toBe(150000000);
      // Original officialSlotCount remains locked at 80
      expect(postRefundRes.body.data.officialSlotCount).toBe(80);
    });

    test("Unverified contribution lacking orderCode & paymentReference is excluded from eligible funding and flagged in reconciliation flow", async () => {
      const snapCamp = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Có Khoản Tài Trợ Chưa Đủ Căn Cứ",
        targetBudget: 4000000,
        expectedSlots: 2,
        awardAmountPerStudent: 2000000,
        fundedAmount: 4000000,
        allocatedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        fundingEnd: new Date(Date.now() - 86400000),
      });

      // Confirmed valid contribution (2M)
      await SponsorContribution.create({
        campaignId: snapCamp._id,
        sponsorId: users.sponsor._id,
        amount: 2000000,
        contributionStatus: "COMPLETED",
        orderCode: 999301,
        provider: "PAYOS",
        gateway: "PAYOS",
        paymentReference: "PAYOS-VALID-01",
      });

      // Legacy unverified contribution (2M) lacking orderCode & paymentReference
      await SponsorContribution.create({
        campaignId: snapCamp._id,
        sponsorId: users.sponsor._id,
        amount: 2000000,
        contributionStatus: "COMPLETED",
        provider: "PAYOS",
        gateway: "PAYOS",
        orderCode: null,
        paymentReference: null,
      });

      // Query admin detail -> unverifiedContributionCount is 1
      const detailRes = await request(app)
        .get(`/api/admin/campaigns/${snapCamp._id}`)
        .set(as("adminApprover"));
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.unverifiedContributionCount).toBe(1);

      // Reconcile attempt is blocked with 409 UNVERIFIED_CONTRIBUTIONS_EXIST
      const recRes = await request(app)
        .post(`/api/admin/campaigns/${snapCamp._id}/reconcile-funding`)
        .set(as("adminApprover"))
        .send({ reason: "Cố chốt sổ khi còn khoản chưa đủ căn cứ" });
      expect(recRes.status).toBe(409);
      expect(recRes.body.error).toBe("UNVERIFIED_CONTRIBUTIONS_EXIST");
    });
  });

  // =========================================================================
  // PILLAR 2: PHÊ DUYỆT VÀ PHÂN QUYỀN (Segregation of Duties & Concurrency)
  // =========================================================================
  describe("Pillar 2: Phê duyệt và phân quyền", () => {
    test("Role-based approval: intake admin who received paper dossier can approve; non-admin is strictly blocked (403)", async () => {
      // 1. Setup campaign funds (4M available)
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $set: { fundedAmount: 4000000, allocatedAmount: 0 } },
      );

      // 2. Student applies
      const application = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-4EYES-001",
        status: "DOSSIER_VERIFIED",
        submissionMode: "PAPER",
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
        submittedAt: new Date(),
      });

      // 3. AdminIntake intook paper dossier BEFORE it was linked
      await PaperDossierReceipt.create({
        receiptCode: "PDR-2026-EARLY",
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationId: application._id,
        postalInfo: { carrierName: "VNPost", senderName: "Bố An" },
        receivedBy: users.adminIntake._id,
        status: "RECONCILED",
      });

      // 4. Non-admin (Student) attempts approval -> BLOCKED (403)
      const studentAttempt = await request(app)
        .post(`/api/admin/scholarship-applications/${application._id}/approve`)
        .set(as("student1"))
        .send({ reviewNote: "Student trying to approve" });
      expect(studentAttempt.status).toBe(403);

      // 5. AdminIntake (role ADMIN) approves -> SUCCESS (200) under new business rules
      const intakeAttempt = await request(app)
        .post(`/api/admin/scholarship-applications/${application._id}/approve`)
        .set(as("adminIntake"))
        .send({ reviewNote: "Intake admin approval passed" });

      expect(intakeAttempt.status).toBe(200);
      expect(intakeAttempt.body.data.application.status).toBe("APPROVED");
      expect(
        await Scholarship.countDocuments({ applicationId: application._id }),
      ).toBe(1);
    });

    test("Dossier approval: Verifier is optional; Admin can approve unassigned or partially verified dossier if checklist is complete", async () => {
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $set: { fundedAmount: 4000000, allocatedAmount: 0 } },
      );

      const application = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-VERIFY-OPTIONAL",
        status: "SUBMITTED",
        assignedVerifierId: users.verifierA._id, // Assigned to Verifier A
        verifierResult: null, // Verifier hasn't submitted, but Admin can approve
        guardianInfo: {
          fullName: "Mẹ An",
          relationship: "MOTHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      const res = await request(app)
        .post(`/api/admin/scholarship-applications/${application._id}/approve`)
        .set(as("adminApprover"))
        .send({
          reviewNote:
            "Admin approves directly without requiring verifier completion",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.application.status).toBe("APPROVED");
      expect(
        await Scholarship.countDocuments({ applicationId: application._id }),
      ).toBe(1);
    });

    test("Dossier checklist validation: missing mandatory checklist item blocks approval (409 DOSSIER_CHECKLIST_INCOMPLETE)", async () => {
      const campWithDocs = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Yêu cầu Giấy tờ",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        fundedAmount: 4000000,
        allocatedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        documentChecklist: [
          {
            code: "CCCD_STUDENT",
            title: "CCCD học sinh",
            required: true,
            acceptedMode: "ONLINE",
            acceptedDocumentTypes: ["IDENTITY"],
            maxFiles: 1,
            order: 1,
          },
        ],
      });

      const application = await ScholarshipApplication.create({
        campaignId: campWithDocs._id,
        studentId: users.student1._id,
        applicationCode: "APP-MISSING-DOC",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // Lacks required document -> BLOCKED 409 DOSSIER_CHECKLIST_INCOMPLETE
      const res = await request(app)
        .post(`/api/admin/scholarship-applications/${application._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt khi thiếu giấy tờ bắt buộc" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("DOSSIER_CHECKLIST_INCOMPLETE");
      expect(res.body.details?.missing?.length).toBeGreaterThan(0);
      await expectNoGrant(0);
    });

    test("Mandatory document in PENDING blocks approveApplication (409 DOSSIER_CHECKLIST_INCOMPLETE) even if status is DOSSIER_VERIFIED; fund/slots intact; optional doc PENDING does not block and preserves PENDING status after grant", async () => {
      const campChecklist = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Kiểm tra Minh chứng & Tùy chọn",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        fundedAmount: 4000000,
        allocatedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        documentChecklist: [
          {
            code: "CCCD_STUDENT",
            title: "CCCD học sinh",
            required: true,
            acceptedMode: "ONLINE",
            acceptedDocumentTypes: ["IDENTITY"],
            maxFiles: 1,
            order: 1,
          },
          {
            code: "GIAY_KHEN",
            title: "Giấy khen học sinh giỏi",
            required: false,
            acceptedMode: "ONLINE",
            acceptedDocumentTypes: ["SCHOLARSHIP_PROOF"],
            maxFiles: 2,
            order: 2,
          },
        ],
      });

      const appPending = await ScholarshipApplication.create({
        campaignId: campChecklist._id,
        studentId: users.student1._id,
        applicationCode: "APP-PENDING-GATE",
        status: "DOSSIER_VERIFIED", // Old status
        submissionMode: "ONLINE",
        screeningResult: { layer1Passed: true },
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      const mandatoryDoc = await VerificationDocument.create({
        userId: users.student1._id,
        applicationId: appPending._id,
        checklistItemCode: "CCCD_STUDENT",
        documentType: "IDENTITY",
        title: "CCCD hai mat",
        status: "PENDING",
        files: [{ storageKey: "priv/cccd.pdf", side: "SINGLE", originalName: "cccd.pdf", mimeType: "application/pdf", size: 1024 }],
      });

      const optionalDoc = await VerificationDocument.create({
        userId: users.student1._id,
        applicationId: appPending._id,
        checklistItemCode: "GIAY_KHEN",
        documentType: "SCHOLARSHIP_PROOF",
        title: "Giay khen tinh",
        status: "PENDING",
        files: [{ storageKey: "priv/giaykhen.pdf", side: "SINGLE", originalName: "gk.pdf", mimeType: "application/pdf", size: 2048 }],
      });

      // 1. Direct approve BLOCKED (409 DOSSIER_CHECKLIST_INCOMPLETE) because mandatory CCCD_STUDENT is PENDING
      const blockedApprove = await request(app)
        .post(`/api/admin/scholarship-applications/${appPending._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Cố duyệt khi CCCD còn PENDING" });

      expect(blockedApprove.status).toBe(409);
      expect(blockedApprove.body.error).toBe("DOSSIER_CHECKLIST_INCOMPLETE");
      const missingDetails = blockedApprove.body.details?.missing || [];
      expect(missingDetails.some((m) => m.code === "CCCD_STUDENT" && m.reason === "REQUIRED_DOCUMENT_PENDING_REVIEW")).toBe(true);
      // Optional doc is NOT in missing
      expect(missingDetails.some((m) => m.code === "GIAY_KHEN")).toBe(false);

      // Verify zero mutation: status remains DOSSIER_VERIFIED, campaign fund remains 0 allocated, 0 scholarships
      const storedAppUnchanged = await ScholarshipApplication.findById(appPending._id);
      expect(storedAppUnchanged.status).toBe("DOSSIER_VERIFIED");
      const storedCampUnchanged = await ScholarshipCampaign.findById(campChecklist._id);
      expect(storedCampUnchanged.allocatedAmount.toString()).toBe("0");
      expect(await Scholarship.countDocuments({ applicationId: appPending._id })).toBe(0);

      // 2. Admin reviews and approves mandatory document CCCD_STUDENT
      const reviewDocRes = await request(app)
        .patch(`/api/admin/scholarship-applications/${appPending._id}/documents/${mandatoryDoc._id}/review`)
        .set(as("adminIntake")) // Regular admin can review
        .send({ status: "APPROVED", reviewNote: "CCCD đã kiểm tra hợp lệ" });
      expect(reviewDocRes.status).toBe(200);

      const updatedMandatoryDoc = await VerificationDocument.findById(mandatoryDoc._id);
      expect(updatedMandatoryDoc.status).toBe("APPROVED");

      // 3. Same Admin immediately approves application -> SUCCESS (200)
      const successApprove = await request(app)
        .post(`/api/admin/scholarship-applications/${appPending._id}/approve`)
        .set(as("adminIntake"))
        .send({ reviewNote: "Admin duyệt thành công sau khi thẩm định minh chứng" });

      expect(successApprove.status).toBe(200);
      expect(successApprove.body.data.application.status).toBe("APPROVED");

      // Campaign allocatedAmount updated, Scholarship created
      const campAfter = await ScholarshipCampaign.findById(campChecklist._id);
      expect(campAfter.allocatedAmount.toString()).toBe("2000000");
      expect(await Scholarship.countDocuments({ applicationId: appPending._id })).toBe(1);

      // Crucial: Optional document GIAY_KHEN is STILL PENDING (not auto-approved)
      const optionalDocAfter = await VerificationDocument.findById(optionalDoc._id);
      expect(optionalDocAfter.status).toBe("PENDING");
    });

    test("E2E Full Lifecycle across UI/API: Pagination search -> NEED_MORE_INFORMATION -> Resubmit -> SUBMITTED (pending review, approve blocked) -> Admin reviews doc -> DOSSIER_VERIFIED -> Admin approves -> APPROVED with matching counts", async () => {
      const campLifecycle = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Vòng đời E2E",
        targetBudget: 20000000,
        expectedSlots: 10,
        awardAmountPerStudent: 2000000,
        fundedAmount: 10000000,
        allocatedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        documentChecklist: [
          {
            code: "BANG_DIEM",
            title: "Bảng điểm học tập",
            required: true,
            acceptedMode: "ONLINE",
            acceptedDocumentTypes: ["QUALIFICATION"],
            maxFiles: 1,
            order: 1,
          },
        ],
      });

      // Tạo 11 hồ sơ khác để tạo danh sách > 1 trang (12 hồ sơ total, limit=10 -> 2 trang)
      const dummyApps = [];
      for (let i = 1; i <= 11; i++) {
        dummyApps.push({
          campaignId: campLifecycle._id,
          studentId: new mongoose.Types.ObjectId(),
          applicationCode: `APP-DUMMY-PAGE-${String(i).padStart(2, "0")}`,
          status: "APPROVED",
          submissionMode: "ONLINE",
          guardianInfo: { fullName: `Phụ huynh ${i}`, phone: "0900000001", relationship: "MOTHER" },
          schoolInfo: { schoolName: `Trường ${i}`, gradeLevel: "GRADE_10", className: "10B" },
          submittedAt: new Date(Date.now() - (20 - i) * 60000),
        });
      }
      await ScholarshipApplication.insertMany(dummyApps);

      // Hồ sơ mục tiêu: nộp sớm nhất nên nằm ở trang 2 khi sort desc theo submittedAt
      const targetApp = await ScholarshipApplication.create({
        campaignId: campLifecycle._id,
        studentId: users.student1._id,
        applicationCode: "APP-TARGET-E2E-99",
        status: "NEED_MORE_INFORMATION",
        submissionMode: "ONLINE",
        screeningResult: { layer1Passed: true },
        guardianInfo: { fullName: "Phụ huynh Trần An", phone: "0911223344", relationship: "FATHER" },
        schoolInfo: { schoolName: "THPT Chuyên Quốc Học", gradeLevel: "GRADE_11", className: "11 Toán" },
        submittedAt: new Date(Date.now() - 30 * 60000),
      });

      // 1. Kiểm tra phân trang > 1 trang
      const page1 = await request(app)
        .get(`/api/admin/scholarship-applications?campaignId=${campLifecycle._id}&page=1&limit=10`)
        .set(as("adminIntake"));
      expect(page1.status).toBe(200);
      expect(page1.body.data.items.length).toBe(10);
      expect(page1.body.data.totalPages).toBe(2);
      expect(page1.body.data.total).toBe(12);

      // Target app không nằm ở trang 1
      expect(page1.body.data.items.some((item) => item.applicationCode === "APP-TARGET-E2E-99")).toBe(false);

      // Tìm kiếm theo mã hoặc tên học sinh -> tìm thấy ngay dù ở trang sau
      const searchRes = await request(app)
        .get(`/api/admin/scholarship-applications?campaignId=${campLifecycle._id}&search=TARGET-E2E-99`)
        .set(as("adminIntake"));
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.items.length).toBe(1);
      expect(searchRes.body.data.items[0].applicationCode).toBe("APP-TARGET-E2E-99");
      expect(searchRes.body.data.items[0].status).toBe("NEED_MORE_INFORMATION");

      // 2. Học sinh tải tệp minh chứng và nộp lại hồ sơ bổ sung trên cùng application (UC-STU-07)
      const uploadRes = await request(app)
        .post("/api/uploads/private")
        .set(as("student1"))
        .field("purpose", "SCHOLARSHIP_PROOF")
        .attach("file", Buffer.from("%PDF-1.4\n% bang diem\n%%EOF\n"), { filename: "bangdiem.pdf", contentType: "application/pdf" });
      expect(uploadRes.status).toBe(201);
      const bangDiemKey = uploadRes.body.data.storageKey;

      const resubmitRes = await request(app)
        .post(`/api/me/scholarship-applications/${targetApp._id}/resubmit`)
        .set(as("student1"))
        .send({
          statement: "Em xin bổ sung bảng điểm kỳ 1 có xác nhận của nhà trường",
          submissionMode: "ONLINE",
          guardianInfo: { fullName: "Phụ huynh Trần An", phone: "0911223344", relationship: "FATHER" },
          schoolInfo: { schoolName: "THPT Chuyên Quốc Học", gradeLevel: "GRADE_11", className: "11 Toán" },
          documents: [
            {
              checklistItemCode: "BANG_DIEM",
              title: "Bảng điểm kỳ 1",
              documentType: "QUALIFICATION",
              files: [{ storageKey: bangDiemKey, side: "SINGLE", originalName: "bangdiem.pdf", mimeType: "application/pdf", size: 1024 }],
            },
          ],
        });
      if (resubmitRes.status !== 200) {
        console.error("resubmitRes error body:", JSON.stringify(resubmitRes.body));
      }
      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.data.status).toBe("SUBMITTED"); // Về Chờ kiểm tra

      // 3. Ở bước Chờ kiểm tra (SUBMITTED, doc PENDING): Nút duyệt bị khóa và API duyệt bị CHẶN 409
      const earlyApprove = await request(app)
        .post(`/api/admin/scholarship-applications/${targetApp._id}/approve`)
        .set(as("adminIntake"))
        .send({ reviewNote: "Thử duyệt khi bảng điểm còn PENDING" });
      expect(earlyApprove.status).toBe(409);
      expect(earlyApprove.body.error).toBe("DOSSIER_CHECKLIST_INCOMPLETE");

      // 4. Admin kiểm tra duyệt giấy tờ hợp lệ (PATCH /documents/:id/review -> APPROVED)
      const uploadedDoc = await VerificationDocument.findOne({
        applicationId: targetApp._id,
        checklistItemCode: "BANG_DIEM",
        status: "PENDING",
      });
      expect(uploadedDoc).not.toBeNull();

      const docReview = await request(app)
        .patch(`/api/admin/scholarship-applications/${targetApp._id}/documents/${uploadedDoc._id}/review`)
        .set(as("adminIntake"))
        .send({ status: "APPROVED", reviewNote: "Bảng điểm có dấu mộc tròn hợp lệ" });
      expect(docReview.status).toBe(200);

      // Hồ sơ tự động chuyển thành Đủ hồ sơ – Chờ duyệt (DOSSIER_VERIFIED)
      const targetAppVerified = await ScholarshipApplication.findById(targetApp._id);
      expect(targetAppVerified.status).toBe("DOSSIER_VERIFIED");

      // 5. Dùng CHÍNH Admin đó duyệt hồ sơ -> Đã duyệt (APPROVED)
      const finalApprove = await request(app)
        .post(`/api/admin/scholarship-applications/${targetApp._id}/approve`)
        .set(as("adminIntake"))
        .send({ reviewNote: "Admin hoàn tất phê duyệt cấp học bổng sau thẩm định" });
      expect(finalApprove.status).toBe(200);
      expect(finalApprove.body.data.application.status).toBe("APPROVED");

      // 6. Đối chiếu bộ đếm, số tiền cấp, quỹ và số suất còn lại
      const campFinal = await ScholarshipCampaign.findById(campLifecycle._id);
      expect(campFinal.allocatedAmount.toString()).toBe("2000000"); // 1 suất đã cấp
      expect(Number(campFinal.fundedAmount) - Number(campFinal.allocatedAmount)).toBe(8000000); // Còn 8M khả dụng (4 suất)

      const finalCountCheck = await request(app)
        .get(`/api/admin/scholarship-applications?campaignId=${campLifecycle._id}`)
        .set(as("adminIntake"));
      expect(finalCountCheck.body.data.counts.approved).toBe(12); // 11 dummy + 1 target
      expect(finalCountCheck.body.data.counts.needMoreInfo).toBe(0);
      expect(finalCountCheck.body.data.counts.submitted).toBe(0);
    });

    test("All active users with role ADMIN have approval authority without needing special SCHOLARSHIP_FINAL_APPROVE permission; non-admin is blocked", async () => {
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $set: { fundedAmount: 4000000, allocatedAmount: 0 } },
      );
      const application = await ScholarshipApplication.create(
        baseDossier("student1", "APP-REGULAR-ADMIN", {
          status: "DOSSIER_VERIFIED",
        }),
      );

      // 1. Regular admin without special final-approval permission approves -> SUCCESS (200)
      const ok = await request(app)
        .post(`/api/admin/scholarship-applications/${application._id}/approve`)
        .set(as("adminNoFinalPerm"))
        .send({ reviewNote: "Admin thường duyệt thành công" });

      expect(ok.status).toBe(200);
      expect(ok.body.data.application.status).toBe("APPROVED");
      expect(
        await Scholarship.countDocuments({ campaignId: campaign._id }),
      ).toBe(1);

      // 2. Non-admin (Verifier) attempts approval -> BLOCKED (403)
      const application2 = await ScholarshipApplication.create(
        baseDossier("student2", "APP-VERIFIER-BLOCK", {
          status: "DOSSIER_VERIFIED",
        }),
      );
      const resNonAdmin = await request(app)
        .post(`/api/admin/scholarship-applications/${application2._id}/approve`)
        .set(as("verifierA"))
        .send({ reviewNote: "Verifier cố duyệt" });
      expect(resNonAdmin.status).toBe(403);
    });

    test("Verifier scope isolation: Verifier B cannot view or submit for dossier assigned to Verifier A", async () => {
      const application = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-SCOPE-ISO",
        status: "SUBMITTED",
        assignedVerifierId: users.verifierA._id, // Assigned strictly to Verifier A
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // Verifier B lists assigned applications -> Application NOT in list
      const listRes = await request(app)
        .get("/api/verifier/scholarship-applications")
        .set(as("verifierB"));
      expect(listRes.status).toBe(200);
      const ids = listRes.body.data.items.map((i) => i.id || i._id.toString());
      expect(ids).not.toContain(application._id.toString());

      // Verifier B attempts to submit verification result -> 403 FORBIDDEN_VERIFIER_ASSIGNMENT
      const submitRes = await request(app)
        .post(
          `/api/verifier/scholarship-applications/${application._id}/verify`,
        )
        .set(as("verifierB"))
        .send({
          status: "VERIFIED_MATCHED",
          notes: "Verifier B submitting result",
        });

      expect(submitRes.status).toBe(403);
      expect(submitRes.body.error).toBe("FORBIDDEN_VERIFIER_ASSIGNMENT");

      // Verifier A submits result -> SUCCESS (200) and transitions to DOSSIER_VERIFIED
      const submitOk = await request(app)
        .post(
          `/api/verifier/scholarship-applications/${application._id}/verify`,
        )
        .set(as("verifierA"))
        .send({
          status: "VERIFIED_MATCHED",
          notes: "Thẩm định thực tế hợp lệ",
        });

      expect(submitOk.status).toBe(200);
      expect(submitOk.body.data.status).toBe("DOSSIER_VERIFIED");
    });

    test("Concurrency: simultaneous approval of 2 applications when fund only suffices for 1", async () => {
      // Campaign has exactly 2,000,000 (enough for exactly 1 scholarship)
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $set: { fundedAmount: 2000000, allocatedAmount: 0 } },
      );

      const app1 = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-CONCUR-01",
        status: "SUBMITTED",
        ...verifiedBy(users.verifierA._id),
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      const app2 = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-CONCUR-02",
        status: "SUBMITTED",
        ...verifiedBy(users.verifierB._id),
        guardianInfo: {
          fullName: "Mẹ Bình",
          relationship: "MOTHER",
          phone: "0987654321",
          cccd: "001234567899",
        },
        schoolInfo: {
          schoolName: "THPT Việt Đức",
          gradeLevel: "GRADE_11",
          className: "11A",
        },
      });

      // Two admins concurrently approve app1 and app2
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/admin/scholarship-applications/${app1._id}/approve`)
          .set(as("adminApprover"))
          .send({ reviewNote: "Concurrent approve 1" }),
        request(app)
          .post(`/api/admin/scholarship-applications/${app2._id}/approve`)
          .set(as("adminApprover2"))
          .send({ reviewNote: "Concurrent approve 2" }),
      ]);

      const statuses = [res1.status, res2.status];
      // Exactly one must succeed (200) and one must fail (409 INSUFFICIENT_CAMPAIGN_FUND)
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);

      const failedRes = res1.status === 409 ? res1 : res2;
      expect(failedRes.body.error).toBe("INSUFFICIENT_CAMPAIGN_FUND");

      // Verify DB state: exactly 1 Scholarship was created, allocatedAmount is 2,000,000
      const createdScholarships = await Scholarship.countDocuments({
        campaignId: campaign._id,
      });
      expect(createdScholarships).toBe(1);

      const updatedCampaign = await ScholarshipCampaign.findById(campaign._id);
      expect(Number(updatedCampaign.allocatedAmount)).toBe(2000000);
    });

    test("OFFICIAL_SLOTS_EXHAUSTED returned when official slots are exhausted even if campaign has unallocated surplus fund", async () => {
      // Campaign has 4M net fund, but officialSlotCount is locked at 1
      const slotCamp = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Hết Suất Chính Thức",
        targetBudget: 4000000,
        expectedSlots: 1,
        awardAmountPerStudent: 2000000,
        fundedAmount: 4000000,
        officialEligibleFunding: 4000000,
        officialSlotCount: 1, // Only 1 official slot locked!
        allocatedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        fundingEnd: new Date(Date.now() - 86400000),
      });

      // Application 1
      const app1 = await ScholarshipApplication.create({
        campaignId: slotCamp._id,
        studentId: users.student1._id,
        applicationCode: "APP-SLOT-001",
        status: "DOSSIER_VERIFIED",
        ...verifiedBy(users.verifierA._id),
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // Application 2
      const app2 = await ScholarshipApplication.create({
        campaignId: slotCamp._id,
        studentId: users.student2._id,
        applicationCode: "APP-SLOT-002",
        status: "DOSSIER_VERIFIED",
        ...verifiedBy(users.verifierA._id),
        guardianInfo: {
          fullName: "Mẹ Bình",
          relationship: "MOTHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // Approve Application 1 -> Success (1 slot granted, allocated becomes 2M)
      const res1 = await request(app)
        .post(`/api/admin/scholarship-applications/${app1._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt đơn 1" });
      expect(res1.status).toBe(200);

      // Attempt to approve Application 2 -> BLOCKED 409 OFFICIAL_SLOTS_EXHAUSTED (fund has 2M remaining, but 0 official slots left!)
      const res2 = await request(app)
        .post(`/api/admin/scholarship-applications/${app2._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt đơn 2" });

      expect(res2.status).toBe(409);
      expect(res2.body.error).toBe("OFFICIAL_SLOTS_EXHAUSTED");
    });

    test("Reassignment invalidates previous verification result, and student resubmission resets verifier result and writes audit history", async () => {
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $set: { fundedAmount: 4000000, allocatedAmount: 0 } },
      );

      // Application verified by Verifier A
      const appObj = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-REASSIGN-001",
        status: "DOSSIER_VERIFIED",
        ...verifiedBy(users.verifierA._id),
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // Admin reassigns to Verifier B -> Verifier A's result is invalidated
      const reassignRes = await request(app)
        .post(
          `/api/admin/scholarship-applications/${appObj._id}/assign-verifier`,
        )
        .set(as("adminApprover"))
        .send({ verifierId: users.verifierB._id });
      expect(reassignRes.status).toBe(200);

      // Verify that assignedVerifierId updated and verifierResult is reset
      const appAfterReassign = await ScholarshipApplication.findById(
        appObj._id,
      );
      expect(String(appAfterReassign.assignedVerifierId)).toBe(
        String(users.verifierB._id),
      );
      expect(appAfterReassign.verifierResult).toBeNull();

      // Old Verifier A attempts to submit result after being reassigned -> 403 FORBIDDEN_VERIFIER_ASSIGNMENT
      const verifierALateRes = await request(app)
        .post(`/api/verifier/scholarship-applications/${appObj._id}/verify`)
        .set(as("verifierA"))
        .send({
          status: "VERIFIED_MATCHED",
          notes: "Verifier A nộp muộn sau khi bị đổi người",
        });
      expect(verifierALateRes.status).toBe(403);
      expect(verifierALateRes.body.error).toBe("FORBIDDEN_VERIFIER_ASSIGNMENT");

      // Verifier B submits VERIFIED_MATCHED
      const verifierBRes = await request(app)
        .post(`/api/verifier/scholarship-applications/${appObj._id}/verify`)
        .set(as("verifierB"))
        .send({
          status: "VERIFIED_MATCHED",
          notes: "Verifier B xác minh lại độc lập",
        });
      expect(verifierBRes.status).toBe(200);

      // Now approval passes!
      const approveRes = await request(app)
        .post(`/api/admin/scholarship-applications/${appObj._id}/approve`)
        .set(as("adminApprover2"))
        .send({ reviewNote: "Duyệt sau xác minh Verifier B" });
      expect(approveRes.status).toBe(200);

      // Check history trail
      const finalApp = await ScholarshipApplication.findById(appObj._id);
      expect(Array.isArray(finalApp.history)).toBe(true);
      expect(
        finalApp.history.some((h) => h.action === "VERIFIER_REASSIGNED"),
      ).toBe(true);
      expect(finalApp.history.some((h) => h.action === "APPROVED")).toBe(true);
    });

    test("Premature verification blocked when application is in NEED_MORE_INFORMATION status", async () => {
      const needInfoApp = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-PREMATURE-VERIFY",
        status: "NEED_MORE_INFORMATION",
        assignedVerifierId: users.verifierA._id,
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      const verifyRes = await request(app)
        .post(
          `/api/verifier/scholarship-applications/${needInfoApp._id}/verify`,
        )
        .set(as("verifierA"))
        .send({
          status: "VERIFIED_MATCHED",
          notes:
            "Verifier cố tình thẩm định khi hồ sơ đang chờ học sinh bổ sung",
        });

      expect(verifyRes.status).toBe(409);
      expect(verifyRes.body.error).toBe("APPLICATION_NOT_VERIFIABLE");
    });

    test("Document access control: applicant student, authorized Admin, and assigned Verifier can access signed URLs; unassigned verifier is 404", async () => {
      const student1Key = `private/${users.student1._id}/SCHOLARSHIP_PROOF/11111111-2222-3333-4444-555555555555.pdf`;

      // Assign student1 application to verifierA
      await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-DOC-ACCESS-01",
        status: "SUBMITTED",
        assignedVerifierId: users.verifierA._id,
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // A. Owner student1 accesses their own file -> 200
      const ownerRes = await request(app)
        .post("/api/files/signed-url")
        .set(as("student1"))
        .send({ storageKey: student1Key });
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.data).toHaveProperty("url");

      // B. Admin accesses file -> 200 (audited)
      const adminRes = await request(app)
        .post("/api/files/signed-url")
        .set(as("adminApprover"))
        .send({ storageKey: student1Key });
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data).toHaveProperty("url");

      // C. Assigned Verifier A accesses student1 file -> 200
      const verifierARes = await request(app)
        .post("/api/files/signed-url")
        .set(as("verifierA"))
        .send({ storageKey: student1Key });
      expect(verifierARes.status).toBe(200);
      expect(verifierARes.body.data).toHaveProperty("url");

      // D. Verifier B (NOT assigned to student1) accesses student1 file -> 404 FILE_NOT_FOUND
      const verifierBRes = await request(app)
        .post("/api/files/signed-url")
        .set(as("verifierB"))
        .send({ storageKey: student1Key });
      expect(verifierBRes.status).toBe(404);
      expect(verifierBRes.body.error).toBe("FILE_NOT_FOUND");
    });

    test("Transaction rollback proof: mid-grant failure aborts transaction, leaving application unapproved and allocatedAmount unchanged", async () => {
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $set: { fundedAmount: 4000000, allocatedAmount: 0 } },
      );

      const appToGrant = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-TX-FAIL-001",
        status: "DOSSIER_VERIFIED",
        ...verifiedBy(users.verifierA._id),
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // Mock Scholarship.create to throw during the transaction
      const spyCreate = jest
        .spyOn(Scholarship, "create")
        .mockImplementationOnce(() => {
          throw new Error(
            "Simulated database failure during scholarship grant",
          );
        });

      const res = await request(app)
        .post(`/api/admin/scholarship-applications/${appToGrant._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt nhưng sẽ bị lỗi giữa chừng" });

      expect(res.status).toBe(500);

      // Verify complete rollback:
      // 1. Application status is still DOSSIER_VERIFIED
      const appAfter = await ScholarshipApplication.findById(appToGrant._id);
      expect(appAfter.status).toBe("DOSSIER_VERIFIED");

      // 2. Campaign allocatedAmount is still 0
      const campAfter = await ScholarshipCampaign.findById(campaign._id);
      expect(Number(campAfter.allocatedAmount)).toBe(0);

      // 3. No Scholarship documents were persisted
      const schCount = await Scholarship.countDocuments({
        campaignId: campaign._id,
      });
      expect(schCount).toBe(0);

      spyCreate.mockRestore();
    });

    test("Screening gate: unscreened application with complete dossier can be approved; failed screening (layer1Passed: false) is blocked (409 SCREENING_REJECTED)", async () => {
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $set: { fundedAmount: 4000000, allocatedAmount: 0 } },
      );

      // 1. Application verified by verifier, but never screened -> Admin can approve
      const unscreenedApp = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-UNSCREENED",
        status: "DOSSIER_VERIFIED",
        assignedVerifierId: users.verifierA._id,
        verifierResult: {
          status: "VERIFIED_MATCHED",
          verifiedBy: users.verifierA._id,
          verifiedAt: new Date(),
        },
        screenedBy: null, // NOT screened!
        screeningResult: null,
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      const resUnscreened = await request(app)
        .post(
          `/api/admin/scholarship-applications/${unscreenedApp._id}/approve`,
        )
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt hồ sơ chưa sơ duyệt" });

      expect(resUnscreened.status).toBe(200);
      expect(resUnscreened.body.data.application.status).toBe("APPROVED");

      // 2. Application screened but layer1Passed is false -> BLOCKED 409 SCREENING_REJECTED
      const failedScreeningApp = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-SCREEN-FAIL",
        status: "DOSSIER_VERIFIED",
        assignedVerifierId: users.verifierA._id,
        verifierResult: {
          status: "VERIFIED_MATCHED",
          verifiedBy: users.verifierA._id,
          verifiedAt: new Date(),
        },
        screenedBy: users.adminScreening._id,
        screenedAt: new Date(),
        screeningResult: {
          layer1Passed: false,
          note: "Không đạt tiêu chí sơ bộ",
        },
        guardianInfo: {
          fullName: "Mẹ Bình",
          relationship: "MOTHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      const resScreenFail = await request(app)
        .post(
          `/api/admin/scholarship-applications/${failedScreeningApp._id}/approve`,
        )
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt hồ sơ trượt sơ duyệt" });

      expect(resScreenFail.status).toBe(409);
      expect(resScreenFail.body.error).toBe("SCREENING_REJECTED");
      expect(
        await Scholarship.countDocuments({
          applicationId: failedScreeningApp._id,
        }),
      ).toBe(0);
      const afterCamp = await ScholarshipCampaign.findById(campaign._id);
      expect(Number(afterCamp.allocatedAmount)).toBe(2000000);
    });

    test("Resubmission on NEED_MORE_INFORMATION resets screening and verifier results to require fresh evaluation", async () => {
      // 1. Create dossier that was previously screened and verified
      const appToResubmit = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-RESUB-RESET-01",
        status: "SUBMITTED",
        ...verifiedBy(users.verifierA._id),
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // Admin requests more information
      const askRes = await request(app)
        .post(
          `/api/admin/scholarship-applications/${appToResubmit._id}/request-information`,
        )
        .set(as("adminApprover"))
        .send({
          reviewNote: "Cần bổ sung giấy xác nhận hộ cận nghèo",
          supplementDeadline: new Date(Date.now() + 86400000),
        });
      expect(askRes.status).toBe(200);
      expect(askRes.body.data.status).toBe("NEED_MORE_INFORMATION");

      // 2. Student resubmits
      const resubmitRes = await request(app)
        .post(`/api/me/scholarship-applications/${appToResubmit._id}/resubmit`)
        .set(as("student1"))
        .send({
          ...applyPayload,
          statement:
            "Em đã tải lên giấy xác nhận hộ cận nghèo có dấu đỏ mới nhất",
        });
      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.data.status).toBe("SUBMITTED");

      // Verify that both screening and verifier gates are completely reset!
      const refreshedApp = await ScholarshipApplication.findById(
        appToResubmit._id,
      );
      expect(refreshedApp.screenedBy).toBeNull();
      expect(refreshedApp.screeningResult).toBeNull();
      expect(refreshedApp.verifierResult).toBeNull();
      expect(refreshedApp.history.some((h) => h.action === "RESUBMITTED")).toBe(
        true,
      );

      // Re-screening with layer1Passed = false -> BLOCKED 409 SCREENING_REJECTED
      await ScholarshipApplication.updateOne(
        { _id: appToResubmit._id },
        {
          $set: {
            screenedBy: users.adminScreening._id,
            screenedAt: new Date(),
            screeningResult: {
              layer1Passed: false,
              note: "Vẫn thiếu tiêu chí bắt buộc",
            },
          },
        },
      );
      const blockedApprove = await request(app)
        .post(
          `/api/admin/scholarship-applications/${appToResubmit._id}/approve`,
        )
        .set(as("adminApprover"))
        .send({ reviewNote: "Cố duyệt khi sơ duyệt lại không đạt" });
      expect(blockedApprove.status).toBe(409);
      expect(blockedApprove.body.error).toBe("SCREENING_REJECTED");
    });

    test("Dynamic awardAmountPerStudent: grants exact dynamic award amount of campaign (1.5M vs 3M), not fixed 2M", async () => {
      // 1. Campaign A: 1.5M/slot
      const camp15M = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch 1.5M",
        targetBudget: 15000000,
        expectedSlots: 10,
        awardAmountPerStudent: 1500000,
        fundedAmount: 3000000,
        allocatedAmount: 0,
        status: "OPEN_FOR_FUNDING",
      });

      const app15M = await ScholarshipApplication.create({
        campaignId: camp15M._id,
        studentId: users.student1._id,
        applicationCode: "APP-DYNAMIC-15M",
        status: "SUBMITTED",
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      const res15M = await request(app)
        .post(`/api/admin/scholarship-applications/${app15M._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt suất 1.5M" });

      expect(res15M.status).toBe(200);
      const sch15M = await Scholarship.findOne({ applicationId: app15M._id });
      expect(Number(sch15M.allocatedAmount)).toBe(1500000);
      expect(Number(sch15M.remainingAmount)).toBe(1500000);

      // 2. Campaign B: 3M/slot
      const camp3M = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch 3M",
        targetBudget: 30000000,
        expectedSlots: 10,
        awardAmountPerStudent: 3000000,
        fundedAmount: 6000000,
        allocatedAmount: 0,
        status: "OPEN_FOR_FUNDING",
      });

      const app3M = await ScholarshipApplication.create({
        campaignId: camp3M._id,
        studentId: users.student2._id,
        applicationCode: "APP-DYNAMIC-3M",
        status: "SUBMITTED",
        guardianInfo: {
          fullName: "Mẹ Bình",
          relationship: "MOTHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      const res3M = await request(app)
        .post(`/api/admin/scholarship-applications/${app3M._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Duyệt suất 3M" });

      expect(res3M.status).toBe(200);
      const sch3M = await Scholarship.findOne({ applicationId: app3M._id });
      expect(Number(sch3M.allocatedAmount)).toBe(3000000);
      expect(Number(sch3M.remainingAmount)).toBe(3000000);
    });

    test("adminListApplications: filters by status, campaignId, submissionMode, and searches across all DB before pagination with consistent counts and checklistSummary", async () => {
      // Create student users for search tests
      const studentA = await User.create({
        email: "tuana@edunity-test.vn",
        passwordHash: hashPassword("Secret123!"),
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Trần Anh Tuấn" },
      });
      const studentB = await User.create({
        email: "tuanb@edunity-test.vn",
        passwordHash: hashPassword("Secret123!"),
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Lê Minh Tuấn" },
      });
      const studentC = await User.create({
        email: "baoc@edunity-test.vn",
        passwordHash: hashPassword("Secret123!"),
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Hoàng Gia Bảo" },
      });

      await ScholarshipApplication.create([
        {
          campaignId: campaign._id,
          studentId: studentA._id,
          applicationCode: "APP-SEARCH-001",
          status: "SUBMITTED",
          submissionMode: "ONLINE",
          guardianInfo: {
            fullName: "Bố A",
            relationship: "FATHER",
            phone: "0912345678",
            cccd: "001234567890",
          },
          schoolInfo: {
            schoolName: "THPT Nguyễn Huệ",
            gradeLevel: "GRADE_10",
            className: "10A",
          },
          submittedAt: new Date(Date.now() - 3000),
        },
        {
          campaignId: campaign._id,
          studentId: studentB._id,
          applicationCode: "APP-SEARCH-002",
          status: "NEED_MORE_INFORMATION",
          submissionMode: "PAPER",
          guardianInfo: {
            fullName: "Mẹ B",
            relationship: "MOTHER",
            phone: "0912345678",
            cccd: "001234567890",
          },
          schoolInfo: {
            schoolName: "THPT Lê Lợi",
            gradeLevel: "GRADE_11",
            className: "11B",
          },
          submittedAt: new Date(Date.now() - 2000),
        },
        {
          campaignId: campaign._id,
          studentId: studentC._id,
          applicationCode: "APP-SEARCH-003",
          status: "DOSSIER_VERIFIED",
          submissionMode: "HYBRID",
          guardianInfo: {
            fullName: "Bố C",
            relationship: "FATHER",
            phone: "0912345678",
            cccd: "001234567890",
          },
          schoolInfo: {
            schoolName: "THPT Trần Phú",
            gradeLevel: "GRADE_12",
            className: "12C",
          },
          submittedAt: new Date(Date.now() - 1000),
        },
      ]);

      // 1. Search by name 'Tuấn' across all DB
      const searchRes = await request(app)
        .get(`/api/admin/scholarship-applications?search=Tuấn`)
        .set(as("adminApprover"));
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.total).toBe(2);
      expect(
        searchRes.body.data.items.every((it) =>
          it.studentName.includes("Tuấn"),
        ),
      ).toBe(true);
      expect(searchRes.body.data.counts).toBeDefined();

      // 2. Filter by status DOSSIER_VERIFIED
      const statusRes = await request(app)
        .get(`/api/admin/scholarship-applications?status=DOSSIER_VERIFIED`)
        .set(as("adminApprover"));
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(
        statusRes.body.data.items.every(
          (it) => it.status === "DOSSIER_VERIFIED",
        ),
      ).toBe(true);

      // 3. Filter by submissionMode PAPER
      const modeRes = await request(app)
        .get(`/api/admin/scholarship-applications?submissionMode=PAPER`)
        .set(as("adminApprover"));
      expect(modeRes.status).toBe(200);
      expect(modeRes.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(
        modeRes.body.data.items.every((it) => it.submissionMode === "PAPER"),
      ).toBe(true);

      // 4. ChecklistSummary check on returned items
      const sampleItem = searchRes.body.data.items[0];
      expect(sampleItem.checklistSummary).toBeDefined();
      expect(sampleItem.checklistSummary).toHaveProperty("isComplete");
      expect(sampleItem.checklistSummary).toHaveProperty("missingItemTitles");
    });
  });

  // =========================================================================
  // PILLAR 3: HỒ SƠ HỌC SINH VÀ GIẤY TỜ (Dossier, CCCD Encryption & Paper)
  // =========================================================================
  describe("Pillar 3: Hồ sơ học sinh và giấy tờ", () => {
    test("Preserves 12-digit string CCCD with leading zero, encrypts in DB (v1:...) and decrypts for API", async () => {
      const payload = {
        statement: "", // No essay required
        submissionMode: "PAPER",
        guardianInfo: {
          fullName: "Nguyễn Văn Cha",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "079203001234", // 12 digits starting with "0"
        },
        schoolInfo: {
          schoolName: "THPT Nguyễn Trãi",
          gradeLevel: "GRADE_10",
          className: "10A1",
          // district is optional
          province: "TP. Hồ Chí Minh",
        },
        documents: [],
      };

      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student1"))
        .send(payload);

      expect(res.status).toBe(201);
      const createdApp = res.body.data;
      expect(createdApp.guardianInfo.cccd).toBe("079203001234");
      expect(createdApp.guardianInfo.nationalIdLast4).toBe("1234");

      // Raw DB inspection via native collection
      const rawInDb = await ScholarshipApplication.collection.findOne({
        _id: new mongoose.Types.ObjectId(createdApp._id || createdApp.id),
      });

      // In raw DB, cccdEnc must start with "v1:" and cccdHash must be a 64-char hex HMAC
      expect(rawInDb.guardianInfo.cccdEnc).toMatch(/^v1:/);
      expect(rawInDb.guardianInfo.cccdHash).toMatch(/^[a-f0-9]{64}$/);
      expect(rawInDb.guardianInfo.cccd).toBeNull(); // Plaintext cccd is NEVER stored in cleartext!

      // Admin detail API inspection: returns decrypted 12-digit CCCD string with leading zero intact
      const adminRes = await request(app)
        .get(
          `/api/admin/scholarship-applications/${createdApp._id || createdApp.id}`,
        )
        .set(as("adminIntake"));

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.guardianInfo.cccd).toBe("079203001234");
    });

    test("One application per student–campaign: duplicate while active is blocked", async () => {
      const firstRes = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(firstRes.status).toBe(201);

      const dupRes = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error).toBe("DUPLICATE_APPLICATION");
    });

    test("[NEW-1a] Submitting again after WITHDRAWN is blocked; withdrawn record is preserved", async () => {
      const first = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(first.status).toBe(201);
      const firstId = first.body.data._id || first.body.data.id;

      const withdrawn = await request(app)
        .post(`/api/me/scholarship-dossiers/${firstId}/withdraw`)
        .set(as("student1"))
        .send({ reason: "Gia đình thay đổi kế hoạch" });
      expect(withdrawn.status).toBe(200);
      expect(withdrawn.body.data.status).toBe("WITHDRAWN");

      const again = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(again.status).toBe(409);
      expect(again.body.error).toBe("DUPLICATE_APPLICATION");

      const rows = await ScholarshipApplication.find({
        studentId: users.student1._id,
        campaignId: campaign._id,
      }).lean();
      expect(rows).toHaveLength(1);
      expect(String(rows[0]._id)).toBe(String(firstId));
      expect(rows[0].status).toBe("WITHDRAWN");
    });

    test("[NEW-1b] Submitting again after REJECTED is blocked; rejected record is preserved", async () => {
      const first = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(first.status).toBe(201);
      const firstId = first.body.data._id || first.body.data.id;

      const rejected = await request(app)
        .post(`/api/admin/scholarship-applications/${firstId}/reject`)
        .set(as("adminApprover"))
        .send({
          reviewNote: "Không đáp ứng điều kiện bắt buộc của chiến dịch",
        });
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe("REJECTED");

      const again = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(again.status).toBe(409);
      expect(again.body.error).toBe("DUPLICATE_APPLICATION");

      // Draft path is blocked too
      const draft = await request(app)
        .post(`/api/campaigns/${campaign._id}/dossiers`)
        .set(as("student1"))
        .send({ ...applyPayload, saveAsDraft: true });
      expect(draft.status).toBe(409);
      expect(draft.body.error).toBe("DUPLICATE_APPLICATION");

      const rows = await ScholarshipApplication.find({
        studentId: users.student1._id,
        campaignId: campaign._id,
      }).lean();
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("REJECTED");
      expect(rows[0].reviewNote).toBe(
        "Không đáp ứng điều kiện bắt buộc của chiến dịch",
      );
    });

    test("[NEW-1c] Two concurrent create requests yield exactly one application", async () => {
      const [r1, r2] = await Promise.all([
        request(app)
          .post(`/api/campaigns/${campaign._id}/applications`)
          .set(as("student1"))
          .send(applyPayload),
        request(app)
          .post(`/api/campaigns/${campaign._id}/applications`)
          .set(as("student1"))
          .send(applyPayload),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      expect(loser.body.error).toBe("DUPLICATE_APPLICATION");
      expect(
        await ScholarshipApplication.countDocuments({
          studentId: users.student1._id,
          campaignId: campaign._id,
        }),
      ).toBe(1);
    });

    test("[NEW-1d] NEED_MORE_INFORMATION supplement still works on the same record", async () => {
      const first = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(first.status).toBe(201);
      const firstId = first.body.data._id || first.body.data.id;

      const ask = await request(app)
        .post(
          `/api/admin/scholarship-applications/${firstId}/request-information`,
        )
        .set(as("adminApprover"))
        .send({ reviewNote: "Bổ sung xác nhận của nhà trường" });
      expect(ask.status).toBe(200);
      expect(ask.body.data.status).toBe("NEED_MORE_INFORMATION");

      const resubmit = await request(app)
        .post(`/api/me/scholarship-applications/${firstId}/resubmit`)
        .set(as("student1"))
        .send({ ...applyPayload, statement: "Đã bổ sung giấy xác nhận" });
      expect(resubmit.status).toBe(200);
      expect(resubmit.body.data.status).toBe("SUBMITTED");
      expect(String(resubmit.body.data._id || resubmit.body.data.id)).toBe(
        String(firstId),
      );
      expect(
        await ScholarshipApplication.countDocuments({
          studentId: users.student1._id,
          campaignId: campaign._id,
        }),
      ).toBe(1);
    });
  });

  // =========================================================================
  // PILLAR 4: QUYỀN LỢI HỌC BỔNG VÀ CÔNG KHAI (Entitlements, Checkout & Privacy)
  // =========================================================================
  describe("Pillar 4: Quyền lợi học bổng và công khai", () => {
    test("Checkout via scholarshipId and via code (SCH-YYYY-XXXX) enforce identical rules (full & co-pay)", async () => {
      // 1. Setup course, class, and scholarship
      const category = await Category.create({
        name: "Công nghệ",
        slug: "cong-nghe",
        createdBy: users.adminIntake._id,
      });
      const subject = await Subject.create({
        name: "Toán",
        slug: "toan",
        categoryId: category._id,
        categoryName: "Công nghệ",
        createdBy: users.adminIntake._id,
      });
      const course = await Course.create({
        title: "Toán 10 Nâng cao",
        slug: "toan-10",
        categoryId: category._id,
        categoryName: "Công nghệ",
        subjectId: subject._id,
        subjectName: "Toán",
        createdBy: users.adminIntake._id,
      });

      // Class 1: Tuition = 1,000,000 (Full payment by scholarship)
      const class1 = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        subjectId: subject._id,
        categoryId: category._id,
        teacherId: users.teacher._id,
        teacherName: "Thầy Giáo",
        className: "Lớp Toán 10A",
        classType: "PAID",
        price: 1000000,
        capacity: 30,
        status: "OPEN",
        startDate: new Date(Date.now() + 86400000),
      });

      // Fund campaign with 4M
      await ScholarshipCampaign.updateOne(
        { _id: campaign._id },
        { $set: { fundedAmount: 4000000, allocatedAmount: 2000000 } },
      );

      // Create active scholarship with code SCH-2026-ABCD
      const scholarship = await Scholarship.create({
        campaignId: campaign._id,
        applicationId: new mongoose.Types.ObjectId(),
        studentId: users.student1._id,
        code: "SCH-2026-ABCD",
        allocatedAmount: 2000000,
        remainingAmount: 2000000,
        validFrom: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        status: "ACTIVE",
      });

      // Enrollment 1 for student 1
      const enrollment1 = await Enrollment.create({
        studentId: users.student1._id,
        classId: class1._id,
        courseId: course._id,
        teacherId: users.teacher._id,
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: 1000000,
        enrollmentStatus: "PENDING_PAYMENT",
        holdExpiresAt: new Date(Date.now() + 3600000),
      });

      // A. Checkout using scholarshipId -> Full payment
      const resId = await scholarshipPaymentService.payWithScholarship(
        users.student1._id,
        enrollment1._id,
        scholarship._id,
      );
      expect(resId.enrollmentStatus).toBe("CONFIRMED");
      expect(resId.paymentSource).toBe("SCHOLARSHIP");
      expect(Number(resId.remainingDue)).toBe(0);

      // Remaining balance on scholarship is now 1,000,000
      const schAfter1 = await Scholarship.findById(scholarship._id);
      expect(Number(schAfter1.remainingAmount)).toBe(1000000);

      // Class 2: Tuition = 2,500,000 (Co-pay: 1,000,000 scholarship + 1,500,000 student remaining due)
      const class2 = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        subjectId: subject._id,
        categoryId: category._id,
        teacherId: users.teacher._id,
        teacherName: "Thầy Giáo",
        className: "Lớp Toán Chuyên Đề",
        classType: "PAID",
        price: 2500000,
        capacity: 30,
        status: "OPEN",
        startDate: new Date(Date.now() + 86400000),
      });

      const enrollment2 = await Enrollment.create({
        studentId: users.student1._id,
        classId: class2._id,
        courseId: course._id,
        teacherId: users.teacher._id,
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: 2500000,
        enrollmentStatus: "PENDING_PAYMENT",
        holdExpiresAt: new Date(Date.now() + 3600000),
      });

      // B. Checkout using code "SCH-2026-ABCD" -> Co-pay partial payment
      const resCode = await scholarshipPaymentService.payWithScholarship(
        users.student1._id,
        enrollment2._id,
        "SCH-2026-ABCD",
      );
      expect(resCode.enrollmentStatus).toBe("PENDING_PAYMENT");
      expect(resCode.paymentSource).toBe("MIXED");
      expect(Number(resCode.remainingDue)).toBe(1500000); // 2.5M - 1M = 1.5M

      // Scholarship balance reduced by 1M during hold
      const schAfter2 = await Scholarship.findById(scholarship._id);
      expect(Number(schAfter2.remainingAmount)).toBe(0);

      // C. Check hold status during pending co-pay:
      // 1M is held in ScholarshipUsage (status: PENDING), NOT yet recorded as usedAmount in campaign!
      const pendingUsage2 = await ScholarshipUsage.findOne({
        enrollmentId: enrollment2._id,
        status: "PENDING",
      });
      expect(pendingUsage2).toBeTruthy();
      expect(Number(pendingUsage2.amount)).toBe(1000000);

      const campDuringHold = await ScholarshipCampaign.findById(campaign._id);
      expect(Number(campDuringHold.usedAmount)).toBe(1000000); // Class 1 completed used 1M; hold of enrollment2 is NOT added to completed usedAmount!

      // D. Co-pay cancelled / expired -> 1M is released back to scholarship, status remains ACTIVE, enrollment not confirmed
      await releaseReservation(enrollment2._id, "CANCELLED");

      const usageAfterCancel = await ScholarshipUsage.findById(
        pendingUsage2._id,
      );
      expect(usageAfterCancel.status).toBe("RELEASED");

      const schAfterCancel = await Scholarship.findById(scholarship._id);
      expect(Number(schAfterCancel.remainingAmount)).toBe(1000000); // Restored!
      expect(schAfterCancel.status).toBe("ACTIVE"); // Usable again!

      const enrAfterCancel = await Enrollment.findById(enrollment2._id);
      expect(enrAfterCancel.enrollmentStatus).toBe("CANCELLED");

      // Repeated cancel call does not restore balance twice (idempotency)
      await releaseReservation(enrollment2._id, "CANCELLED");
      const schAfterRepeatCancel = await Scholarship.findById(scholarship._id);
      expect(Number(schAfterRepeatCancel.remainingAmount)).toBe(1000000);

      // E. Student can immediately re-use the restored 1M scholarship for another class!
      const class3 = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        subjectId: subject._id,
        categoryId: category._id,
        teacherId: users.teacher._id,
        teacherName: "Thầy Giáo",
        className: "Lớp Học Mới",
        classType: "PAID",
        price: 1000000,
        capacity: 30,
        status: "OPEN",
        startDate: new Date(Date.now() + 86400000),
      });
      const enrollment3 = await Enrollment.create({
        studentId: users.student1._id,
        classId: class3._id,
        courseId: course._id,
        teacherId: users.teacher._id,
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: 1000000,
        enrollmentStatus: "PENDING_PAYMENT",
        holdExpiresAt: new Date(Date.now() + 3600000),
      });

      const resReUse = await scholarshipPaymentService.payWithScholarship(
        users.student1._id,
        enrollment3._id,
        scholarship._id,
      );
      expect(resReUse.enrollmentStatus).toBe("CONFIRMED");
      expect(resReUse.paymentSource).toBe("SCHOLARSHIP");

      // F. Co-pay completed lifecycle:
      // Create another 2.5M class and another scholarship with 1M
      const scholarshipCopay = await Scholarship.create({
        campaignId: campaign._id,
        applicationId: new mongoose.Types.ObjectId(),
        studentId: users.student1._id,
        code: "SCH-2026-COPAY",
        allocatedAmount: 1000000,
        remainingAmount: 1000000,
        validFrom: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        status: "ACTIVE",
      });

      const class4 = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        subjectId: subject._id,
        categoryId: category._id,
        teacherId: users.teacher._id,
        teacherName: "Thầy Giáo",
        className: "Lớp Co-pay Hoàn Tất",
        classType: "PAID",
        price: 2500000,
        capacity: 30,
        status: "OPEN",
        startDate: new Date(Date.now() + 86400000),
      });

      const enrollment4 = await Enrollment.create({
        studentId: users.student1._id,
        classId: class4._id,
        courseId: course._id,
        teacherId: users.teacher._id,
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: 2500000,
        enrollmentStatus: "PENDING_PAYMENT",
        holdExpiresAt: new Date(Date.now() + 3600000),
      });

      await scholarshipPaymentService.payWithScholarship(
        users.student1._id,
        enrollment4._id,
        scholarshipCopay._id,
      );

      const usageCopay = await ScholarshipUsage.findOne({
        enrollmentId: enrollment4._id,
        status: "PENDING",
      });
      expect(usageCopay).toBeTruthy();

      // Complete 1.5M co-pay via confirmScholarshipUsage
      await confirmScholarshipUsage(usageCopay, enrollment4, null);

      const usageAfterConfirm = await ScholarshipUsage.findById(usageCopay._id);
      expect(usageAfterConfirm.status).toBe("CONFIRMED");

      const schAfterConfirm = await Scholarship.findById(scholarshipCopay._id);
      expect(schAfterConfirm.status).toBe("EXHAUSTED");

      const campAfterConfirm = await ScholarshipCampaign.findById(campaign._id);
      expect(Number(campAfterConfirm.usedAmount)).toBe(3000000); // 1M from class1 + 1M from class3 + 1M from class4

      // Duplicate webhook confirmation is rejected and does not double-charge or double-deduct
      await expect(
        confirmScholarshipUsage(usageCopay, enrollment4, null),
      ).rejects.toThrow();
      const campAfterDup = await ScholarshipCampaign.findById(campaign._id);
      expect(Number(campAfterDup.usedAmount)).toBe(3000000);
    });

    test("Public transparency: blocked before publication date, minor requires guardian consent, PII masked", async () => {
      // 1. Campaign with future publication date -> BLOCKED from disclosing recipients
      const futureCampaign = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Chưa Công Bố",
        targetBudget: 5000000,
        expectedSlots: 2,
        awardAmountPerStudent: 2000000,
        fundedAmount: 4000000,
        status: "OPEN_FOR_FUNDING",
        resultPublicationDate: new Date(Date.now() + 7 * 86400000), // 7 days in the future
      });

      const futureListRes = await request(app).get(
        `/api/campaigns/${futureCampaign._id}/recipients`,
      );
      expect(futureListRes.status).toBe(200);
      expect(futureListRes.body.data.isPublished).toBe(false);
      expect(futureListRes.body.data.items.length).toBe(0);

      // 2. Adult student1 consents to public display -> Name masked (e.g. Nguyễn V*** An)
      const adultApp = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-PUB-ADULT",
        status: "APPROVED",
        publicConsent: { consented: true, consentedAt: new Date() },
        schoolInfo: {
          schoolName: "THPT Chuyên Lê Hồng Phong",
          province: "Nam Định",
        },
        reviewedAt: new Date(),
      });

      const pubRes = await request(app).get(
        `/api/campaigns/${campaign._id}/recipients`,
      );
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.isPublished).toBe(true);
      expect(pubRes.body.data.items.length).toBe(1);

      const recipient = pubRes.body.data.items[0];
      expect(recipient.displayName).toMatch(/^Nguyễn\s+V\*{3}\s+An$/);
      // Strict privacy: no CCCD, phone, address, or document keys in public response
      expect(recipient.cccd).toBeUndefined();
      expect(recipient.phone).toBeUndefined();
      expect(recipient.address).toBeUndefined();

      // 3. Minor student2 (under 18) attempts public consent without guardian consent -> 403
      const minorApp = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-PUB-MINOR",
        status: "APPROVED",
        consentSnapshot: { status: "NOT_REQUIRED" },
      });

      const minorConsentRes = await request(app)
        .post(`/api/me/scholarship-applications/${minorApp._id}/public-consent`)
        .set(as("student2"))
        .send({ consented: true });

      expect(minorConsentRes.status).toBe(403);
      expect(minorConsentRes.body.error).toBe(
        "GUARDIAN_CONSENT_REQUIRED_FOR_PUBLIC_DISCLOSURE",
      );

      // 4. Adult student1 revokes consent -> immediately omitted from public list
      const revokeRes = await request(app)
        .post(`/api/me/scholarship-applications/${adultApp._id}/public-consent`)
        .set(as("student1"))
        .send({ consented: false });
      expect(revokeRes.status).toBe(200);

      const emptyPubRes = await request(app).get(
        `/api/campaigns/${campaign._id}/recipients`,
      );
      expect(emptyPubRes.body.data.items.length).toBe(0);
    });

    test("Dry-run data integrity audit detects duplicate applications and safely migrates plaintext CCCD without logging PII", async () => {
      // 1. Create a dummy app with plaintext CCCD
      const plainApp = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-LEGACY-PLAIN",
        status: "DRAFT",
        studentCccd: "079123456789", // Plaintext CCCD
        guardianInfo: {
          fullName: "Phụ huynh",
          phone: "0912345678",
          cccd: "079987654321",
        },
      });

      // 2. Run dry-run audit
      const auditResult = await runScholarshipIntegrityAudit({ dryRun: true });
      expect(auditResult.mode).toBe("DRY_RUN");
      expect(auditResult.plaintextCccd.totalUnencrypted).toBeGreaterThanOrEqual(
        2,
      );
      expect(auditResult.plaintextCccd.status).toBe("ENCRYPTION_PENDING");

      // Plaintext is still in DB in dry-run
      const checkPlain = await ScholarshipApplication.findById(plainApp._id);
      expect(checkPlain.studentCccd).toBe("079123456789");

      // 3. Run migration with dryRun: false
      const migrateResult = await runScholarshipIntegrityAudit({
        dryRun: false,
      });
      expect(migrateResult.mode).toBe("MIGRATE_APPLIED");
      expect(migrateResult.plaintextCccd.migratedCount).toBeGreaterThanOrEqual(
        2,
      );

      // Verify DB fields: plaintext fields are now null, encrypted fields start with v1:...
      const migratedApp = await ScholarshipApplication.findById(plainApp._id);
      expect(migratedApp.studentCccd).toBeNull();
      expect(migratedApp.studentCccdEnc).toMatch(/^v1:/);
      expect(migratedApp.guardianInfo.cccd).toBeNull();
      expect(migratedApp.guardianInfo.cccdEnc).toMatch(/^v1:/);

      // Verify decrypted CCCD preserves leading zeros
      expect(decrypt(migratedApp.studentCccdEnc)).toBe("079123456789");
      expect(decrypt(migratedApp.guardianInfo.cccdEnc)).toBe("079987654321");

      // 4. Run migration a second time -> idempotent (0 migrated, all encrypted)
      const secondMigrateResult = await runScholarshipIntegrityAudit({
        dryRun: false,
      });
      expect(secondMigrateResult.plaintextCccd.totalUnencrypted).toBe(0);
      expect(secondMigrateResult.plaintextCccd.migratedCount).toBe(0);
      expect(secondMigrateResult.plaintextCccd.status).toBe("ALL_ENCRYPTED");
    });

    test("Legacy DB duplicates audit preserves all historical records under PRESERVE_ALL strategy without applying unique index", async () => {
      // Temporarily drop compound unique index to simulate legacy database before migration
      try {
        await ScholarshipApplication.collection.dropIndex(
          "one_application_per_student_campaign",
        );
      } catch (e) {
        try {
          await ScholarshipApplication.collection.dropIndex(
            "studentId_1_campaignId_1",
          );
        } catch (e2) {}
      }

      // 1. Create duplicate applications under the same (student, campaign) pair
      const dup1 = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-LEGACY-DUP-01",
        status: "REJECTED",
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });
      const dup2 = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-LEGACY-DUP-02",
        status: "WITHDRAWN",
        guardianInfo: {
          fullName: "Bố An",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
      });

      // 2. Audit run
      const audit = await runScholarshipIntegrityAudit({ dryRun: false });
      expect(audit.duplicates.hasConflict).toBe(true);
      expect(audit.duplicates.conflictGroupCount).toBeGreaterThanOrEqual(1);
      expect(audit.duplicates.resolutionStrategy).toMatch(/^PRESERVE_ALL/);

      // Verify DB still holds BOTH historical records intact (neither was deleted)
      expect(await ScholarshipApplication.findById(dup1._id)).toBeTruthy();
      expect(await ScholarshipApplication.findById(dup2._id)).toBeTruthy();

      // Clean up duplicates and re-sync indexes
      await ScholarshipApplication.deleteMany({
        _id: { $in: [dup1._id, dup2._id] },
      });
      await syncIndexes();
    });

    test("Campaign default configuration: paperDeliveryGraceDays defaults to 5, priorityCriteria is empty, no arbitrary auto-defaults", async () => {
      const newCamp = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Cấu Hình Mặc Định",
        targetBudget: 2000000,
        expectedSlots: 1,
        awardAmountPerStudent: 2000000,
      });

      expect(newCamp.paperDeliveryGraceDays).toBe(5);
      expect(newCamp.allowSlotExpansion).toBe(false);
      expect(Array.isArray(newCamp.priorityCriteria)).toBe(true);
      expect(newCamp.priorityCriteria.length).toBe(0);
      expect(newCamp.officialSlotCount).toBeNull();
    });

    test("Public recipients gate: only granted students with active consent after publication date are public; minors require guardian consent; revoking consent removes from list but keeps scholarship intact; whitelist excludes CCCD/phone/address", async () => {
      // 1. Create campaign with publication date in the FUTURE
      const campPub = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Minh Bạch Công Khai",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        status: "OPEN_FOR_FUNDING",
        fundingStart: new Date(Date.now() - 7 * 86400000),
        fundingEnd: new Date(Date.now() - 86400000),
        applicationStart: new Date(Date.now() - 7 * 86400000),
        applicationEnd: new Date(Date.now() - 86400000),
        resultPublicationDate: new Date(Date.now() + 7 * 86400000), // FUTURE
      });

      // Student 1 (adult): approved, scholarship created, public consent true
      const app1 = await ScholarshipApplication.create({
        campaignId: campPub._id,
        studentId: users.student1._id,
        applicationCode: "APP-PUB-001",
        status: "APPROVED",
        publicConsent: { consented: true, consentedAt: new Date() },
        schoolInfo: {
          schoolName: "THPT Chu Văn An",
          gradeLevel: "GRADE_11",
          province: "Hà Nội",
        },
      });
      const sch1 = await Scholarship.create({
        campaignId: campPub._id,
        applicationId: app1._id,
        studentId: users.student1._id,
        code: "SCH-PUB-001",
        allocatedAmount: 2000000,
        remainingAmount: 2000000,
        status: "ACTIVE",
      });

      // Case A: Before publication date -> returns isPublished: false, 0 items, summary preserved
      const resFuture = await request(app).get(
        `/api/campaigns/${campPub._id}/recipients`,
      );
      expect(resFuture.status).toBe(200);
      expect(resFuture.body.data.isPublished).toBe(false);
      expect(resFuture.body.data.items.length).toBe(0);
      expect(resFuture.body.data.summary.totalGranted).toBe(1);

      // Advance publication date to the past
      await ScholarshipCampaign.updateOne(
        { _id: campPub._id },
        { $set: { resultPublicationDate: new Date(Date.now() - 3600000) } },
      );

      // Case B: After publication date -> Student 1 appears with whitelisted fields
      const resPublished = await request(app).get(
        `/api/campaigns/${campPub._id}/recipients`,
      );
      expect(resPublished.status).toBe(200);
      expect(resPublished.body.data.isPublished).toBe(true);
      expect(resPublished.body.data.items.length).toBe(1);
      const recipient = resPublished.body.data.items[0];
      expect(recipient.applicationCode).toBe("APP-PUB-001");
      expect(recipient.displayName).toMatch(/^Nguyễn/);
      expect(recipient.schoolName).toBe("THPT Chu Văn An");
      expect(recipient.province).toBe("Hà Nội");
      expect(recipient.awardAmount).toBe(2000000);

      // Whitelist safety check: CCCD, phone, address, documents MUST NOT be returned
      expect(recipient.cccd).toBeUndefined();
      expect(recipient.phone).toBeUndefined();
      expect(recipient.address).toBeUndefined();
      expect(recipient.documents).toBeUndefined();
      expect(recipient.reviewNote).toBeUndefined();

      // Case C: Student 2 is a minor (born in 2012) without verified guardian public consent
      const minorUser = await User.create({
        email: "minor_student@edunity.test",
        passwordHash: await hashPassword("Pass123!"),
        role: "STUDENT",
        studentProfile: {
          fullName: "Em Bé Nhỏ",
          dateOfBirth: new Date("2012-05-15"),
        },
      });
      const appMinor = await ScholarshipApplication.create({
        campaignId: campPub._id,
        studentId: minorUser._id,
        applicationCode: "APP-PUB-MINOR",
        status: "APPROVED",
        publicConsent: { consented: true, consentedAt: new Date() },
        schoolInfo: {
          schoolName: "THCS Trưng Vương",
          gradeLevel: "GRADE_7",
          province: "Hà Nội",
        },
      });
      await Scholarship.create({
        campaignId: campPub._id,
        applicationId: appMinor._id,
        studentId: minorUser._id,
        code: "SCH-PUB-MINOR",
        allocatedAmount: 2000000,
        remainingAmount: 2000000,
        status: "ACTIVE",
      });

      // Minor is omitted because guardian consent allowing public disclosure is missing
      const resMinorCheck = await request(app).get(
        `/api/campaigns/${campPub._id}/recipients`,
      );
      expect(resMinorCheck.body.data.items.length).toBe(1);
      expect(resMinorCheck.body.data.items[0].applicationCode).toBe(
        "APP-PUB-001",
      );
      expect(resMinorCheck.body.data.summary.totalGranted).toBe(2); // Total business count includes both

      // Case D: Student 1 revokes consent -> immediately omitted from public list
      const revokeRes = await request(app)
        .post(`/api/me/scholarship-applications/${app1._id}/public-consent`)
        .set(as("student1"))
        .send({ consented: false });
      expect(revokeRes.status).toBe(200);

      const resAfterRevoke = await request(app).get(
        `/api/campaigns/${campPub._id}/recipients`,
      );
      expect(resAfterRevoke.body.data.items.length).toBe(0); // Excluded from public list
      expect(resAfterRevoke.body.data.summary.totalGranted).toBe(2); // Business summary still counts both

      // Invariant: Revoking public consent DOES NOT affect scholarship entitlement
      const schAfterRevoke = await Scholarship.findById(sch1._id);
      expect(schAfterRevoke.status).toBe("ACTIVE");
      expect(Number(schAfterRevoke.remainingAmount.toString())).toBe(2000000);
    });

    test("Atomic approve checks net funded, allocated amount, reconciled budget, and official slots simultaneously: correctly handles 5M+3M minus 5M refund, slots exhausted, fund exhausted, and concurrent last-slot contention", async () => {
      // 1. Fresh campaign: 2M per slot, targetBudget 6M, expectedSlots 3
      const campBudget = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Quỹ Đối Soát 8M Hoàn 5M",
        targetBudget: 6000000,
        expectedSlots: 3,
        awardAmountPerStudent: 2000000,
        status: "CLOSED",
        fundedAmount: 8000000,
        refundedAmount: 5000000, // 5M refunded -> net funded is 3,000,000
        officialEligibleFunding: 3000000,
        officialSlotCount: 1, // Only 1 official slot can be funded with 3M net (3M / 2M = 1)
        allocatedAmount: 0,
      });

      const appA = await ScholarshipApplication.create({
        ...baseDossier("student1", "APP-BUDGET-A", {
          status: "DOSSIER_VERIFIED",
          campaignId: campBudget._id,
        }),
        ...verifiedBy(users.verifierA._id),
      });
      const appB = await ScholarshipApplication.create({
        ...baseDossier("student2", "APP-BUDGET-B", {
          status: "DOSSIER_VERIFIED",
          campaignId: campBudget._id,
        }),
        ...verifiedBy(users.verifierA._id),
      });

      // Approve Application A -> Allocated 2M, 1 slot used
      const approveARes = await request(app)
        .post(`/api/admin/scholarship-applications/${appA._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Phê duyệt suất 1" });
      expect(approveARes.status).toBe(200);

      // Verify campaign state: allocatedAmount is 2M
      const campAfterA = await ScholarshipCampaign.findById(campBudget._id);
      expect(Number(campAfterA.allocatedAmount.toString())).toBe(2000000);

      // Approve Application B -> Should be rejected with OFFICIAL_SLOTS_EXHAUSTED / INSUFFICIENT_CAMPAIGN_FUND (409)
      const approveBRes = await request(app)
        .post(`/api/admin/scholarship-applications/${appB._id}/approve`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Cố duyệt suất 2 khi đã hết suất/quỹ" });
      expect(approveBRes.status).toBe(409);
      expect([
        "OFFICIAL_SLOTS_EXHAUSTED",
        "INSUFFICIENT_CAMPAIGN_FUND",
      ]).toContain(approveBRes.body.error);

      // Concurrency contention test on the last slot of a 1-slot campaign
      const campRace = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Tranh Suất Cuối Concurrency",
        targetBudget: 2000000,
        expectedSlots: 1,
        awardAmountPerStudent: 2000000,
        status: "CLOSED",
        fundedAmount: 2000000,
        officialEligibleFunding: 2000000,
        officialSlotCount: 1,
        allocatedAmount: 0,
      });

      const raceApp1 = await ScholarshipApplication.create({
        ...baseDossier("student1", "APP-RACE-01", {
          status: "DOSSIER_VERIFIED",
          campaignId: campRace._id,
        }),
        ...verifiedBy(users.verifierA._id),
      });
      const raceApp2 = await ScholarshipApplication.create({
        ...baseDossier("student2", "APP-RACE-02", {
          status: "DOSSIER_VERIFIED",
          campaignId: campRace._id,
        }),
        ...verifiedBy(users.verifierA._id),
      });

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/admin/scholarship-applications/${raceApp1._id}/approve`)
          .set(as("adminApprover"))
          .send({}),
        request(app)
          .post(`/api/admin/scholarship-applications/${raceApp2._id}/approve`)
          .set(as("adminApprover"))
          .send({}),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]); // Exactly 1 won, 1 was rejected

      const campRaceFinal = await ScholarshipCampaign.findById(campRace._id);
      expect(Number(campRaceFinal.allocatedAmount.toString())).toBe(2000000); // Never over-allocated
    });

    test("Supplementary reconciliation: Admin can create a new snapshot with supersedesId linked to historical snapshot; expectedSlots is preserved; approved-pending refunds are excluded from allocatable funds", async () => {
      const campReconcile = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Chốt Bổ Sung Đợt 2",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        status: "CLOSED",
        fundedAmount: 2000000,
      });

      // Contribution 1: 2,000,000
      await SponsorContribution.create({
        campaignId: campReconcile._id,
        sponsorId: users.sponsor._id,
        amount: 2000000,
        contributionStatus: "COMPLETED",
        provider: "PAYOS",
        gateway: "PAYOS",
        orderCode: 777001,
        paymentReference: "PAYOS-REF-001",
      });

      // Snapshot 1
      const snap1Res = await request(app)
        .post(`/api/admin/campaigns/${campReconcile._id}/reconcile-funding`)
        .set(as("adminApprover"))
        .send({ reason: "Chốt đợt 1 với nguồn 2 triệu đầu tiên" });
      expect(snap1Res.status).toBe(200);
      const snap1Id = snap1Res.body.data.id || snap1Res.body.data._id;

      // New contribution arrives: 4,000,000
      const contrib2 = await SponsorContribution.create({
        campaignId: campReconcile._id,
        sponsorId: users.sponsor._id,
        amount: 4000000,
        contributionStatus: "COMPLETED",
        provider: "PAYOS",
        gateway: "PAYOS",
        orderCode: 777002,
        paymentReference: "PAYOS-REF-002",
      });

      // An approved refund case exists awaiting bank transfer (approvedAmount: 2,000,000)
      await RefundCase.create({
        caseNumber: "REF-PENDING-001",
        purpose: "DONATION",
        channelKey: "DONATION",
        relatedContributionId: contrib2._id,
        recipientUserId: users.sponsor._id,
        beneficiaryBankAccount: {
          bankName: "Vietcombank",
          accountNumber: "9876543210",
          accountHolderName: "Nhà Tài Trợ",
        },
        originalAmount: 4000000,
        eligibleAmount: 2000000,
        approvedAmount: 2000000,
        status: "PENDING_BANK_TRANSFER",
        reason: "OTHER",
      });

      // Snapshot 2 (Chốt bổ sung đợt 2)
      const snap2Res = await request(app)
        .post(`/api/admin/campaigns/${campReconcile._id}/reconcile-funding`)
        .set(as("adminApprover"))
        .send({
          reason:
            "Chốt bổ sung đợt 2 sau khi có tài trợ mới và trừ khoản hoàn tiền đã duyệt",
        });
      expect(snap2Res.status).toBe(200);

      // Verify Snapshot 2 links to Snapshot 1 via supersedesId
      const allSnaps = await ScholarshipFundingReconciliation.find({
        campaignId: campReconcile._id,
      }).sort({ reconciledAt: 1 });
      expect(allSnaps.length).toBe(2);
      expect(allSnaps[1].supersedesId.toString()).toBe(
        allSnaps[0]._id.toString(),
      );

      // Eligible funding = (2M + 4M) - 2M (approved pending refund) = 4,000,000
      expect(Number(allSnaps[1].eligibleFunding.toString())).toBe(4000000);
      expect(Number(allSnaps[1].approvedRefundFunding.toString())).toBe(
        2000000,
      );
      expect(allSnaps[1].officialSlots).toBe(2); // 4M / 2M = 2 slots

      // Invariant: original expectedSlots on campaign remains untouched
      const freshCamp = await ScholarshipCampaign.findById(campReconcile._id);
      expect(freshCamp.expectedSlots).toBe(5);
      expect(freshCamp.officialSlotCount).toBe(2);
    });

    test("Campaign lifecycle & paper policy: closing funding does not close application portal if applicationEnd is in future; physical receipt after deadline is rejected; co-pay release never reactivates an expired scholarship", async () => {
      // 1. Closing funding does not close application portal if applicationEnd is in future
      const campLifecycle = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Hạn Hồ Sơ Sau Hạn Tài Trợ",
        targetBudget: 4000000,
        expectedSlots: 2,
        awardAmountPerStudent: 2000000,
        status: "CLOSED", // Funding is closed
        fundingStart: new Date(Date.now() - 14 * 86400000),
        fundingEnd: new Date(Date.now() - 7 * 86400000), // Ended 7 days ago
        applicationStart: new Date(Date.now() - 14 * 86400000),
        applicationEnd: new Date(Date.now() + 7 * 86400000), // Still open for 7 days!
      });

      // Student applies while funding is CLOSED but applicationEnd is in future -> SUCCESS
      const applyRes = await request(app)
        .post(`/api/campaigns/${campLifecycle._id}/applications`)
        .set(as("student1"))
        .send({
          statement: "Em xin nộp đơn trong hạn nhận hồ sơ",
          ...applyPayload,
        });
      expect(applyRes.status).toBe(201);

      // 2. Physical paper dossier arriving after applicationEnd is rejected
      const paperDossierService = require("../src/services/paperDossierService");
      const pastCamp = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Đã Hết Hạn Hồ Sơ",
        targetBudget: 2000000,
        expectedSlots: 1,
        awardAmountPerStudent: 2000000,
        applicationStart: new Date(Date.now() - 14 * 86400000),
        applicationEnd: new Date(Date.now() - 3600000), // Ended 1 hour ago
      });

      const latePhysicalApp = await ScholarshipApplication.create({
        campaignId: pastCamp._id,
        studentId: users.student2._id,
        applicationCode: "APP-PHYSICAL-LATE",
        status: "SUBMITTED",
        submissionMode: "PAPER",
      });

      await expect(
        paperDossierService.intakePaperDossier(users.adminIntake._id, {
          applicationId: latePhysicalApp._id,
          receivedAt: new Date(), // Arrived now, after applicationEnd
          postalInfo: {
            carrierName: "VNPost",
            trackingNumber: "VN-LATE-01",
            senderName: "Sender",
          },
          receivingLocation: "Văn phòng Tuyển sinh",
        }),
      ).rejects.toThrow(
        "Physical paper dossier arrived after the application deadline",
      );

      // 3. Co-pay release for an already EXPIRED scholarship: must NOT reactivate to ACTIVE
      const expiredSch = await Scholarship.create({
        campaignId: campLifecycle._id,
        applicationId: new mongoose.Types.ObjectId(),
        studentId: users.student1._id,
        code: "SCH-EXPIRED-TEST",
        allocatedAmount: 2000000,
        remainingAmount: 0,
        status: "EXHAUSTED",
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      });

      const testClassId = new mongoose.Types.ObjectId();
      await Class.create({
        _id: testClassId,
        courseId: new mongoose.Types.ObjectId(),
        courseTitle: "Khóa Lập Trình",
        subjectId: new mongoose.Types.ObjectId(),
        categoryId: new mongoose.Types.ObjectId(),
        teacherId: users.teacher._id,
        teacherName: "Thầy Giáo",
        className: "Lớp Hết Hạn",
        classType: "PAID",
        price: 1000000,
        capacity: 20,
        enrolledCount: 1,
        status: "OPEN",
        startDate: new Date(Date.now() + 86400000),
      });

      const testEnrollment = await Enrollment.create({
        studentId: users.student1._id,
        classId: testClassId,
        courseId: new mongoose.Types.ObjectId(),
        teacherId: users.teacher._id,
        paymentSource: "MIXED",
        tuitionAmount: 1000000,
        amountPaidViaScholarship: 500000,
        amountPaidByStudent: 500000,
        enrollmentStatus: "PENDING_PAYMENT",
        holdExpiresAt: new Date(Date.now() - 1000),
      });

      await ScholarshipUsage.create({
        scholarshipId: expiredSch._id,
        enrollmentId: testEnrollment._id,
        studentId: users.student1._id,
        classId: testClassId,
        amount: 500000,
        status: "PENDING",
      });

      // Release reservation
      await releaseReservation(testEnrollment._id, "EXPIRED");

      // Check scholarship: remainingAmount is refunded, but status remains EXPIRED (NOT ACTIVE)
      const freshSch = await Scholarship.findById(expiredSch._id);
      expect(freshSch.status).toBe("EXPIRED");
      expect(Number(freshSch.remainingAmount.toString())).toBe(500000);
    });

    test("Guardian consent operational verification: minor with allowPublicStory=false omitted, revoked consent omitted, active consent included, entitlement intact, zero PII", async () => {
      // 1. Create a 3rd minor student
      const student3 = await User.create({
        username: "student3",
        email: "student3@edunity.test",
        passwordHash: await hashPassword("Pass@123"),
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: {
          fullName: "Lê Hoàng Cúc",
          dateOfBirth: new Date("2011-03-20"), // Minor
        },
      });

      // Student 2 is also minor ("Trần Thị Bình")
      // Case 1a: Minor student2 has verified guardian consent BUT allowPublicStory: false
      await GuardianConsent.create({
        studentId: users.student2._id,
        campaignId: campaign._id,
        guardian: {
          fullName: "Trần Văn Ba",
          relationship: "FATHER",
          phone: "0901234567",
        },
        documentStorageKey: "docs/consents/minor2.pdf",
        allowPublicStory: false, // NOT agreeing to public disclosure
        status: "VERIFIED",
        reviewedBy: users.adminScreening._id,
        reviewedAt: new Date(),
      });

      await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-MINOR-NOPUBLIC",
        status: "APPROVED",
        publicConsent: { consented: true, consentedAt: new Date() }, // Student wants to show, but guardian did not allow
        consentSnapshot: { status: "VERIFIED" },
        schoolInfo: {
          schoolName: "THPT Chu Văn An",
          province: "Hà Nội",
        },
        reviewedAt: new Date(),
      });

      // Case 1b: Minor student3 previously had verified guardian consent with allowPublicStory: true, BUT then REVOKED it
      await GuardianConsent.create({
        studentId: student3._id,
        campaignId: campaign._id,
        guardian: {
          fullName: "Lê Văn Bốn",
          relationship: "FATHER",
          phone: "0909876543",
        },
        documentStorageKey: "docs/consents/minor3.pdf",
        allowPublicStory: true,
        status: "REVOKED",
        revokedAt: new Date(),
        reviewedBy: users.adminScreening._id,
        reviewedAt: new Date(),
      });

      const appMinorRevoked = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: student3._id,
        applicationCode: "APP-MINOR-REVOKED",
        status: "APPROVED",
        publicConsent: { consented: true, consentedAt: new Date() },
        consentSnapshot: { status: "VERIFIED" }, // Stale snapshot was VERIFIED
        schoolInfo: {
          schoolName: "THCS Trưng Vương",
          province: "Hà Nội",
        },
        reviewedAt: new Date(),
      });

      // Also create an awarded Scholarship for student3 to verify revocation doesn't affect entitlement
      const schStudent3 = await Scholarship.create({
        campaignId: campaign._id,
        applicationId: appMinorRevoked._id,
        studentId: student3._id,
        code: "SCH-STUDENT-3",
        allocatedAmount: 2000000,
        remainingAmount: 2000000,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 180 * 86400000),
      });

      // Case 1c: Create a 4th minor student who has an ACTIVE, valid guardian consent with allowPublicStory: true
      const student4 = await User.create({
        username: "student4",
        email: "student4@edunity.test",
        passwordHash: await hashPassword("Pass@123"),
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: {
          fullName: "Phạm Minh Đức",
          dateOfBirth: new Date("2010-09-10"), // Minor
        },
      });

      await GuardianConsent.create({
        studentId: student4._id,
        campaignId: campaign._id,
        guardian: {
          fullName: "Phạm Văn Năm",
          relationship: "FATHER",
          phone: "0988776655",
        },
        documentStorageKey: "docs/consents/minor4.pdf",
        allowPublicStory: true,
        status: "VERIFIED",
        revokedAt: null,
        reviewedBy: users.adminScreening._id,
        reviewedAt: new Date(),
      });

      const appMinorActive = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: student4._id,
        applicationCode: "APP-MINOR-ACTIVE",
        status: "APPROVED",
        publicConsent: { consented: true, consentedAt: new Date() },
        consentSnapshot: { status: "VERIFIED" },
        schoolInfo: {
          schoolName: "THPT Chuyên Hà Nội - Amsterdam",
          gradeLevel: "GRADE_10",
          province: "Hà Nội",
        },
        reviewedAt: new Date(),
      });

      const schStudent4 = await Scholarship.create({
        campaignId: campaign._id,
        applicationId: appMinorActive._id,
        studentId: student4._id,
        code: "SCH-STUDENT-4",
        allocatedAmount: 2000000,
        remainingAmount: 2000000,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 180 * 86400000),
      });

      // Call public recipients API
      const pubRes = await request(app).get(
        `/api/campaigns/${campaign._id}/recipients`,
      );
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.isPublished).toBe(true);

      const items = pubRes.body.data.items;
      // student2 (allowPublicStory: false) MUST BE OMITTED
      expect(
        items.some((i) => i.applicationCode === "APP-MINOR-NOPUBLIC"),
      ).toBe(false);

      // student3 (revoked consent) MUST BE OMITTED
      expect(items.some((i) => i.applicationCode === "APP-MINOR-REVOKED")).toBe(
        false,
      );

      // student4 (active valid consent) MUST BE INCLUDED
      const item4 = items.find((i) => i.applicationCode === "APP-MINOR-ACTIVE");
      expect(item4).toBeTruthy();
      expect(item4.displayName).toMatch(/^Phạm\s+M\*{3}\s+Đức$/);
      expect(item4.schoolName).toBe("THPT Chuyên Hà Nội - Amsterdam");
      expect(item4.gradeLevel).toBe("GRADE_10");
      expect(item4.province).toBe("Hà Nội");

      // Verify STRICT PII isolation: no CCCD, phone, address, or document keys
      expect(item4.cccd).toBeUndefined();
      expect(item4.phone).toBeUndefined();
      expect(item4.address).toBeUndefined();
      expect(item4.documentStorageKey).toBeUndefined();
      expect(item4.verifierNotes).toBeUndefined();

      // Revoking consent does NOT alter Scholarship entitlement:
      const freshSch3 = await Scholarship.findById(schStudent3._id);
      expect(freshSch3.status).toBe("ACTIVE");
      expect(Number(freshSch3.remainingAmount.toString())).toBe(2000000);
      expect(Number(freshSch3.allocatedAmount.toString())).toBe(2000000);

      const freshSch4 = await Scholarship.findById(schStudent4._id);
      expect(freshSch4.status).toBe("ACTIVE");
      expect(Number(freshSch4.remainingAmount.toString())).toBe(2000000);
    });

    test("Refund status transition verification: 8M gross, 5M pending refund reserves allocatable to 3M, completed transfer preserves 3M, cancellation returns 8M, idempotent re-calling", async () => {
      // Create campaign with target 10M, award 2M per student
      const refCampaign = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Hoàn tiền Kiểm chứng",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        fundedAmount: 8000000, // 2 sponsors contributed 4M each = 8M gross
        refundedAmount: 0,
        allocatedAmount: 0,
        usedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        isAcceptingFunding: true,
        applicationStart: new Date(Date.now() - 7 * 86400000),
        applicationEnd: new Date(Date.now() + 30 * 86400000),
        resultPublicationDate: new Date(Date.now() + 35 * 86400000),
      });

      // 2 Sponsor contributions: Sponsor 1 contributes 5M, Sponsor 2 contributes 3M (Total 8M gross)
      const c1 = await SponsorContribution.create({
        campaignId: refCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        paymentReference: "PAYOS-REF-001",
        provider: "PAYOS",
        gateway: "PAYOS",
      });

      await SponsorContribution.create({
        campaignId: refCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 3000000,
        contributionStatus: "COMPLETED",
        paymentReference: "PAYOS-REF-002",
        provider: "PAYOS",
        gateway: "PAYOS",
      });

      // Admin approves full 5M refund of contribution c1 (5M)
      const refundCase = await RefundCase.create({
        caseNumber: "REF-TRANS-001",
        purpose: "DONATION",
        channelKey: "DONATION",
        reason: "Yêu cầu hoàn toàn phần khoản tài trợ 5M",
        originalAmount: 5000000,
        relatedContributionId: c1._id,
        recipientUserId: users.sponsor._id,
        eligibleAmount: 5000000,
        approvedAmount: 5000000,
        status: "PENDING_BANK_TRANSFER", // Approved, pending bank transfer!
        approvedBy: users.adminIntake._id,
        approvedAt: new Date(),
        beneficiaryBankAccount: {
          bankName: "MBBANK",
          accountNumber: "0987654321",
          accountHolderName: "SPONSOR USER",
        },
      });

      // --- TRẠNG THÁI 1: Duyệt chờ chuyển ---
      // refundedAmount = 0, approvedPendingRefund = 5M, quỹ có thể cấp = 3M (8M - 5M)
      const detailState1 = await campaignService.adminGetCampaign(
        refCampaign._id,
      );
      expect(Number(detailState1.receivedFund.toString())).toBe(8000000);
      expect(Number(detailState1.refundedFund.toString())).toBe(0);
      expect(Number(detailState1.approvedPendingRefund.toString())).toBe(
        5000000,
      );
      expect(Number(detailState1.netEligibleFund.toString())).toBe(3000000);
      expect(Number(detailState1.availableFund.toString())).toBe(3000000);

      // Thử cấp học bổng vượt 3M (ví dụ 4M) phải bị chặn (409 INSUFFICIENT_SCHOLARSHIP_FUND)
      await ScholarshipCampaign.updateOne(
        { _id: refCampaign._id },
        { awardAmountPerStudent: 4000000 },
      );
      const bigApp = await ScholarshipApplication.create({
        campaignId: refCampaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-BIG-AWARD",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        screenedBy: users.adminScreening._id,
        screenedAt: new Date(),
        screeningResult: { layer1Passed: true },
        assignedVerifierId: users.verifierA._id,
        verifierResult: {
          status: "VERIFIED_MATCHED",
          verifiedBy: users.verifierA._id,
          verifiedAt: new Date(),
        },
      });

      await expect(
        scholarshipService.approveApplication(
          users.adminApprover._id,
          bigApp._id,
          { reviewNote: "Cấp 4M" },
        ),
      ).rejects.toThrow();

      // Cấp học bổng 2M (<= 3M) thành công!
      await ScholarshipCampaign.updateOne(
        { _id: refCampaign._id },
        { awardAmountPerStudent: 2000000 },
      );
      const studentAdult2 = await User.create({
        username: "studentAdult2",
        email: "studentAdult2@edunity.test",
        passwordHash: await hashPassword("Pass@123"),
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: {
          fullName: "Hoàng Văn Em",
          dateOfBirth: new Date("2000-01-01"),
        },
      });

      const validApp = await ScholarshipApplication.create({
        campaignId: refCampaign._id,
        studentId: studentAdult2._id,
        applicationCode: "APP-VALID-2M",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        screenedBy: users.adminScreening._id,
        screenedAt: new Date(),
        screeningResult: { layer1Passed: true },
        assignedVerifierId: users.verifierA._id,
        verifierResult: {
          status: "VERIFIED_MATCHED",
          verifiedBy: users.verifierA._id,
          verifiedAt: new Date(),
        },
      });

      const approvedSch = await scholarshipService.approveApplication(
        users.adminApprover._id,
        validApp._id,
        { reviewNote: "Cấp 2M" },
      );
      expect(approvedSch).toBeTruthy();

      // Check campaign: allocated = 2M, available = 1M (3M - 2M)
      const afterApproveCamp = await campaignService.adminGetCampaign(
        refCampaign._id,
      );
      expect(Number(afterApproveCamp.allocatedAmount.toString())).toBe(2000000);
      expect(Number(afterApproveCamp.availableFund.toString())).toBe(1000000);

      // Thử cấp suất tiếp theo 2M khi quỹ chỉ còn 1M dù officialSlotCount vẫn còn (chỉ tiêu = 2, đã cấp = 1) -> BỊ CHẶN (409)
      await ScholarshipCampaign.updateOne(
        { _id: refCampaign._id },
        { officialSlotCount: 2 },
      );
      const studentAdult3 = await User.create({
        username: "studentAdult3",
        email: "studentAdult3@edunity.test",
        passwordHash: await hashPassword("Pass@123"),
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: {
          fullName: "Đỗ Thị Gấm",
          dateOfBirth: new Date("1999-05-10"),
        },
      });

      const secondApp = await ScholarshipApplication.create({
        campaignId: refCampaign._id,
        studentId: studentAdult3._id,
        applicationCode: "APP-SECOND-BLOCKED",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        screenedBy: users.adminScreening._id,
        screenedAt: new Date(),
        screeningResult: { layer1Passed: true },
        assignedVerifierId: users.verifierA._id,
        verifierResult: {
          status: "VERIFIED_MATCHED",
          verifiedBy: users.verifierA._id,
          verifiedAt: new Date(),
        },
      });

      await expect(
        scholarshipService.approveApplication(
          users.adminApprover._id,
          secondApp._id,
          { reviewNote: "Cấp suất 2" },
        ),
      ).rejects.toThrow();

      // --- TRẠNG THÁI 2: Hoàn tất chuyển khoản ---
      // Submit bank proof and complete refund
      await refundService.submitRefundProof(
        users.adminApprover2._id,
        refundCase._id,
        {
          referenceNumber: "MB-REF-TRANS-999",
          transferredAt: new Date(),
          beneficiaryBank: "MBBANK",
          beneficiaryAccount: "0987654321",
          beneficiaryName: "SPONSOR USER",
        },
        { autoVerify: true },
      );

      const detailState2 = await campaignService.adminGetCampaign(
        refCampaign._id,
      );
      // refundedAmount = 5M, approvedPendingRefund = 0, quỹ có thể cấp vẫn là 1M (3M - 2M đã cấp)
      expect(Number(detailState2.refundedFund.toString())).toBe(5000000);
      expect(Number(detailState2.approvedPendingRefund.toString())).toBe(0);
      expect(Number(detailState2.netEligibleFund.toString())).toBe(3000000);
      expect(Number(detailState2.availableFund.toString())).toBe(1000000);

      // --- THỬ GỬI LẠI (IDEMPOTENCY / REPLAY) ---
      // Re-calling submitRefundProof throws INVALID_STATUS because it is already COMPLETED
      await expect(
        refundService.submitRefundProof(
          users.adminApprover2._id,
          refundCase._id,
          {
            referenceNumber: "MB-REF-TRANS-999",
          },
          { autoVerify: true },
        ),
      ).rejects.toThrow();

      // Or re-verifying proof via verifyBankTransferProof is idempotent and returns completed case
      const reVerify = await refundService.verifyAndCompleteRefund(
        users.adminApprover2._id,
        refundCase._id,
        {
          bankReference: "MB-REF-TRANS-999",
        },
      );
      expect(reVerify.status).toBe("COMPLETED");

      const detailReplay = await campaignService.adminGetCampaign(
        refCampaign._id,
      );
      expect(Number(detailReplay.refundedFund.toString())).toBe(5000000);
      expect(Number(detailReplay.availableFund.toString())).toBe(1000000);

      // --- THỬ HỦY YÊU CẦU HOÀN TIỀN (CANCELLATION) ---
      // Tạo một ca hoàn tiền mới 5M trên một campaign khác 8M
      const cancelCampaign = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Hủy Yêu Cầu Hoàn Tiền",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        fundedAmount: 8000000,
        refundedAmount: 0,
        allocatedAmount: 0,
        usedAmount: 0,
        status: "OPEN_FOR_FUNDING",
        isAcceptingFunding: true,
      });

      const cancelContrib = await SponsorContribution.create({
        campaignId: cancelCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 8000000,
        contributionStatus: "COMPLETED",
        paymentReference: "PAYOS-CANCEL-001",
        provider: "PAYOS",
        gateway: "PAYOS",
      });

      const cancelRefundCase = await RefundCase.create({
        caseNumber: "REF-CANCEL-002",
        purpose: "DONATION",
        channelKey: "DONATION",
        reason: "Yêu cầu hủy hoàn tiền tài trợ",
        originalAmount: 5000000,
        relatedContributionId: cancelContrib._id,
        recipientUserId: users.sponsor._id,
        eligibleAmount: 5000000,
        approvedAmount: 5000000,
        status: "PENDING_BANK_TRANSFER",
        approvedBy: users.adminIntake._id,
        approvedAt: new Date(),
        beneficiaryBankAccount: {
          bankName: "MBBANK",
          accountNumber: "0987654321",
          accountHolderName: "SPONSOR USER",
        },
      });

      // When approved pending: available = 3M
      const beforeCancel = await campaignService.adminGetCampaign(
        cancelCampaign._id,
      );
      expect(Number(beforeCancel.availableFund.toString())).toBe(3000000);

      // Admin rejects / cancels the refund request
      await refundService.rejectRefundCase(
        users.adminApprover._id,
        cancelRefundCase._id,
        {
          rejectionNote:
            "Hủy yêu cầu hoàn tiền theo thỏa thuận với nhà tài trợ",
        },
      );

      // Available fund returns to 8M!
      const afterCancel = await campaignService.adminGetCampaign(
        cancelCampaign._id,
      );
      expect(Number(afterCancel.refundedFund.toString())).toBe(0);
      expect(Number(afterCancel.approvedPendingRefund.toString())).toBe(0);
      expect(Number(afterCancel.availableFund.toString())).toBe(8000000);
      expect(Number(afterCancel.netEligibleFund.toString())).toBe(8000000);

      // --- XÁC NHẬN GIỚI HẠN TỔNG HOÀN TRÊN TỪNG KHOẢN ĐÓNG GÓP (BAO GỒM NHIỀU LẦN HOÀN MỘT PHẦN) ---
      const partialContrib = await SponsorContribution.create({
        campaignId: cancelCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        paymentReference: "PAYOS-PARTIAL-001",
        provider: "PAYOS",
        gateway: "PAYOS",
      });

      // Lần 1: Hoàn 2M trên 5M -> Thành công, còn lại 3M
      const calc1 = await refundService.calculateEligibleRefundAmount(
        null,
        null,
        partialContrib._id,
      );
      expect(calc1.eligibleAmount).toBe(5000000);

      await RefundCase.create({
        caseNumber: "REF-PARTIAL-001",
        purpose: "DONATION",
        channelKey: "DONATION",
        reason: "Hoàn một phần lần 1",
        originalAmount: 5000000,
        relatedContributionId: partialContrib._id,
        recipientUserId: users.sponsor._id,
        eligibleAmount: 5000000,
        approvedAmount: 2000000,
        status: "APPROVED",
        approvedBy: users.adminIntake._id,
        approvedAt: new Date(),
        beneficiaryBankAccount: {
          bankName: "MBBANK",
          accountNumber: "0987654321",
          accountHolderName: "SPONSOR USER",
        },
      });

      // Lần 2: Kiểm tra số dư đủ điều kiện hoàn còn 3M
      const calc2 = await refundService.calculateEligibleRefundAmount(
        null,
        null,
        partialContrib._id,
      );
      expect(calc2.eligibleAmount).toBe(3000000);
      expect(calc2.alreadyRefunded).toBe(2000000);

      // Thử tạo yêu cầu hoàn 4M (vượt 3M còn lại) -> BỊ CHẶN (AMOUNT_EXCEEDS_ELIGIBLE)
      await expect(
        refundService.createRefundCase({
          relatedContributionId: partialContrib._id,
          requestedAmount: 4000000,
          reason: "Hoàn vượt mức cho phép",
          beneficiaryBankAccount: {
            bankName: "MBBANK",
            accountNumber: "0987654321",
            accountHolderName: "SPONSOR USER",
          },
        }),
      ).rejects.toThrow();

      // Hoàn nốt 3M -> Thành công
      await RefundCase.create({
        caseNumber: "REF-PARTIAL-002",
        purpose: "DONATION",
        channelKey: "DONATION",
        reason: "Hoàn một phần lần 2",
        originalAmount: 5000000,
        relatedContributionId: partialContrib._id,
        recipientUserId: users.sponsor._id,
        eligibleAmount: 3000000,
        approvedAmount: 3000000,
        status: "APPROVED",
        approvedBy: users.adminIntake._id,
        approvedAt: new Date(),
        beneficiaryBankAccount: {
          bankName: "MBBANK",
          accountNumber: "0987654321",
          accountHolderName: "SPONSOR USER",
        },
      });

      // Lần 3: Đã hoàn đủ 5M (2M + 3M) -> Số dư đủ điều kiện = 0, tạo yêu cầu tiếp bị chặn (NO_ELIGIBLE_REFUND_AMOUNT)
      const calc3 = await refundService.calculateEligibleRefundAmount(
        null,
        null,
        partialContrib._id,
      );
      expect(calc3.eligibleAmount).toBe(0);
      expect(calc3.alreadyRefunded).toBe(5000000);

      await expect(
        refundService.createRefundCase({
          relatedContributionId: partialContrib._id,
          requestedAmount: 500000,
          reason: "Hoàn khi đã hết số dư",
          beneficiaryBankAccount: {
            bankName: "MBBANK",
            accountNumber: "0987654321",
            accountHolderName: "SPONSOR USER",
          },
        }),
      ).rejects.toThrow();
    });

    test("Contribution 5M: pending 3M refund blocks subsequent 3M request, and concurrent approval locks committed total <= 5M", async () => {
      const contrib5M = await SponsorContribution.create({
        campaignId: campaign._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        paymentReference: "PAYOS-5M-PENDING-CHECK",
        provider: "PAYOS",
        gateway: "PAYOS",
      });

      // Step 1: Create 3M refund request and approve it to PENDING_BANK_TRANSFER
      const case1 = await refundService.createRefundCase({
        relatedContributionId: contrib5M._id,
        requestedAmount: 3000000,
        reason: "Yêu cầu hoàn đợt 1 (3M)",
        beneficiaryBankAccount: {
          bankName: "MBBANK",
          accountNumber: "0987654321",
          accountHolderName: "SPONSOR USER",
        },
      });

      await refundService.approveRefundCase(
        users.adminApprover._id,
        case1._id,
        {
          note: "Duyệt đợt 1 chuyển sang PENDING_BANK_TRANSFER",
        },
      );

      const approvedCase1 = await RefundCase.findById(case1._id);
      expect(approvedCase1.status).toBe("PENDING_BANK_TRANSFER");
      expect(Number(approvedCase1.approvedAmount)).toBe(3000000);

      // Step 2: Eligible amount check - remaining should be 2M (5M - 3M)
      const eligibleInfo = await refundService.calculateEligibleRefundAmount(
        null,
        null,
        contrib5M._id,
      );
      expect(eligibleInfo.eligibleAmount).toBe(2000000);
      expect(eligibleInfo.alreadyRefunded).toBe(3000000);

      // Subsequent 3M request must be BLOCKED with AMOUNT_EXCEEDS_ELIGIBLE
      await expect(
        refundService.createRefundCase({
          relatedContributionId: contrib5M._id,
          requestedAmount: 3000000,
          reason: "Yêu cầu hoàn đợt 2 vượt hạn mức",
          beneficiaryBankAccount: {
            bankName: "MBBANK",
            accountNumber: "0987654321",
            accountHolderName: "SPONSOR USER",
          },
        }),
      ).rejects.toThrow(/vượt quá số tiền đủ điều kiện hoàn/i);

      // Requesting 2M (remaining balance) should succeed
      const case2 = await refundService.createRefundCase({
        relatedContributionId: contrib5M._id,
        requestedAmount: 2000000,
        reason: "Yêu cầu hoàn đúng số dư 2M",
        beneficiaryBankAccount: {
          bankName: "MBBANK",
          accountNumber: "0987654321",
          accountHolderName: "SPONSOR USER",
        },
      });
      expect(case2.status).toBe("NEEDS_REVIEW");
      expect(Number(case2.eligibleAmount)).toBe(2000000);

      // Step 3: Concurrent approval test on a separate 5M contribution
      const contribConcurrent = await SponsorContribution.create({
        campaignId: campaign._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        paymentReference: "PAYOS-CONCURRENT-5M",
        provider: "PAYOS",
        gateway: "PAYOS",
      });

      // Create 2 concurrent cases of 3M each (both in NEEDS_REVIEW)
      const caseA = await RefundCase.create({
        caseNumber: `REF-CONC-A-${Date.now()}`,
        purpose: "DONATION",
        channelKey: "DONATION",
        reason: "Yêu cầu đồng thời A",
        originalAmount: 5000000,
        relatedContributionId: contribConcurrent._id,
        recipientUserId: users.sponsor._id,
        eligibleAmount: 3000000,
        status: "NEEDS_REVIEW",
        beneficiaryBankAccount: {
          bankName: "MBBANK",
          accountNumber: "0987654321",
          accountHolderName: "SPONSOR USER",
        },
      });

      const caseB = await RefundCase.create({
        caseNumber: `REF-CONC-B-${Date.now()}`,
        purpose: "DONATION",
        channelKey: "DONATION",
        reason: "Yêu cầu đồng thời B",
        originalAmount: 5000000,
        relatedContributionId: contribConcurrent._id,
        recipientUserId: users.sponsor._id,
        eligibleAmount: 3000000,
        status: "NEEDS_REVIEW",
        beneficiaryBankAccount: {
          bankName: "MBBANK",
          accountNumber: "0987654321",
          accountHolderName: "SPONSOR USER",
        },
      });

      // Fire concurrent approvals
      const results = await Promise.allSettled([
        refundService.approveRefundCase(users.adminApprover._id, caseA._id, {
          approvedAmount: 3000000,
        }),
        refundService.approveRefundCase(users.adminApprover2._id, caseB._id, {
          approvedAmount: 3000000,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly one must succeed, one must be rejected to prevent exceeding 5M
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.message).toMatch(
        /vượt quá giá trị khoản đóng góp gốc|Write conflict/i,
      );

      // Verify in DB that total committed is exactly 3M, never 6M
      const activeCases = await RefundCase.find({
        relatedContributionId: contribConcurrent._id,
        status: {
          $in: [
            "APPROVED",
            "PENDING_BANK_TRANSFER",
            "AWAITING_BANK_VERIFICATION",
            "COMPLETED",
          ],
        },
      });
      const totalCommitted = activeCases.reduce(
        (sum, c) => sum + Number(c.approvedAmount || c.eligibleAmount),
        0,
      );
      expect(totalCommitted).toBe(3000000);
      expect(totalCommitted).toBeLessThanOrEqual(5000000);
    });
  });

  // =========================================================================
  // PILLAR 5: TỐI ƯU NGHIỆP VỤ HỌC BỔNG EDUNITY V3 (Consent Removal & Priority Scoring)
  // =========================================================================
  describe("Pillar 5: Tối ưu nghiệp vụ học bổng Edunity V3", () => {
    test("Học sinh vị thành niên nộp hồ sơ không bị chặn bởi giấy đồng thuận phụ huynh", async () => {
      // Campaign có bật yêu cầu consent cho vị thành niên trong chính sách
      await ScholarshipCampaign.findByIdAndUpdate(campaign._id, {
        dossierPolicy: {
          requireGuardianConsentForMinor: true,
          requireGuardianInfo: true,
        },
      });

      // Học sinh vị thành niên (student2, sinh 2010) nộp hồ sơ không có GuardianConsent
      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/applications`)
        .set(as("student2"))
        .send({
          submissionMode: "PAPER",
          guardianInfo: {
            fullName: "Trần Văn Cường",
            relationship: "FATHER",
            phone: "0901234567",
            cccd: "001085000123",
          },
          schoolInfo: {
            schoolName: "THCS Lê Quý Đôn",
            gradeLevel: "GRADE_9",
            className: "9A",
            province: "Hà Nội",
          },
          applicantInfo: {
            fullName: "Trần Thị Bình",
            phone: "0901234568",
            isMinor: true,
          },
          statement: "Em xin nộp đơn xin học bổng",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("SUBMITTED");
      expect(res.body.data.consentSnapshot?.status).toBe("NOT_REQUIRED");
    });

    test("Admin phê duyệt hồ sơ vị thành niên không cần giấy đồng thuận phụ huynh", async () => {
      // Cấp ngân sách cho campaign: 5M
      await SponsorContribution.create({
        campaignId: campaign._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        paymentReference: "DONATE-5M-CONSENT-FREE",
      });
      await ScholarshipCampaign.findByIdAndUpdate(campaign._id, {
        fundedAmount: 5000000,
        dossierPolicy: { requireGuardianConsentForMinor: true },
      });

      // Tạo hồ sơ cho học sinh vị thành niên (student2)
      const appRecord = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-NO-CONSENT-APPROVAL",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        consentSnapshot: { status: "NOT_REQUIRED" },
        applicantInfo: {
          fullName: "Trần Thị Bình",
          phone: "0901234568",
          isMinor: true,
        },
        guardianInfo: {
          fullName: "Trần Văn Cường",
          relationship: "FATHER",
          phone: "0901234567",
        },
        schoolInfo: {
          schoolName: "THCS Lê Quý Đôn",
          gradeLevel: "GRADE_9",
          className: "9A",
          province: "Hà Nội",
        },
        screeningResult: { layer1Passed: true },
        submittedAt: new Date(),
      });

      // Admin duyệt cấp học bổng
      const approved = await scholarshipService.approveApplication(
        users.adminApprover._id,
        appRecord._id,
        { reviewNote: "Phê duyệt theo chuẩn mới không bắt buộc giấy đồng thuận" },
      );

      expect(approved.application.status).toBe("APPROVED");
      expect(approved.application.reviewedBy.toString()).toBe(users.adminApprover._id.toString());

      // Bản ghi học bổng được tạo thành công
      const grant = await Scholarship.findOne({ applicationId: appRecord._id });
      expect(grant).not.toBeNull();
      expect(grant.status).toBe("ACTIVE");
      expect(Number(grant.allocatedAmount)).toBe(2000000);
    });

    test("Hồ sơ cũ có consentSnapshot PENDING không bị mắc kẹt khi Admin duyệt", async () => {
      await SponsorContribution.create({
        campaignId: campaign._id,
        sponsorId: users.sponsor._id,
        amount: 5000000,
        contributionStatus: "COMPLETED",
        paymentReference: "DONATE-5M-PENDING-CONSENT",
      });
      await ScholarshipCampaign.findByIdAndUpdate(campaign._id, {
        fundedAmount: 5000000,
      });

      // Hồ sơ cũ được lưu với consentSnapshot PENDING_DEPENDENCY
      const legacyApp = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-LEGACY-PENDING-CONSENT",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        consentSnapshot: {
          status: "PENDING_DEPENDENCY",
          checkedAt: new Date(),
        },
        guardianInfo: {
          fullName: "Trần Văn Cường",
          relationship: "FATHER",
          phone: "0901234567",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
        screeningResult: { layer1Passed: true },
        submittedAt: new Date(),
      });

      // Admin duyệt không bị chặn bởi snapshot PENDING cũ
      const result = await scholarshipService.approveApplication(
        users.adminApprover._id,
        legacyApp._id,
        { reviewNote: "Duyệt hồ sơ legacy có snapshot PENDING" },
      );

      expect(result.application.status).toBe("APPROVED");
      expect(result.application.consentSnapshot.status).toBe("PENDING_DEPENDENCY"); // Bảo toàn snapshot lịch sử
    });

    test("Cấu hình tiêu chí ưu tiên mới, loại trừ cùng nhóm và kiểm tra xác minh minh chứng", async () => {
      // Tạo chiến dịch với bộ tiêu chí ưu tiên mới
      const campaignWithCriteria = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Ưu tiên Vùng cao 2026",
        targetBudget: 20000000,
        expectedSlots: 10,
        awardAmountPerStudent: 2000000,
        fundedAmount: 10000000,
        status: "OPEN_FOR_FUNDING",
        isAcceptingFunding: true,
        priorityCriteria: [
          {
            code: "POOR_HOUSEHOLD",
            label: "Hộ nghèo",
            sourceField: "HARDSHIP_CATEGORY",
            matchValue: "POOR_HOUSEHOLD",
            exclusiveGroup: "POVERTY_STATUS",
            points: 20,
            enabled: true,
            order: 1,
          },
          {
            code: "NEAR_POOR_HOUSEHOLD",
            label: "Hộ cận nghèo",
            sourceField: "HARDSHIP_CATEGORY",
            matchValue: "NEAR_POOR_HOUSEHOLD",
            exclusiveGroup: "POVERTY_STATUS",
            points: 10,
            enabled: true,
            order: 2,
          },
          {
            code: "ORPHANED",
            label: "Hoàn cảnh mồ côi",
            sourceField: "HARDSHIP_CATEGORY",
            matchValue: "ORPHANED",
            points: 15,
            enabled: true,
            order: 3,
          },
          {
            code: "IS_DISADVANTAGED",
            label: "Hoàn cảnh đặc biệt khó khăn",
            sourceField: "IS_DISADVANTAGED",
            matchValue: "true",
            points: 10,
            enabled: true,
            order: 4,
          },
          {
            code: "STUDENT_PROVINCE",
            label: "Tỉnh Hà Giang",
            sourceField: "STUDENT_PROVINCE",
            matchValue: "Hà Giang",
            points: 10,
            enabled: true,
            order: 5,
          },
          {
            code: "GRADE_10",
            label: "Khối 10 (đã tắt)",
            sourceField: "GRADE_LEVEL",
            matchValue: "GRADE_10",
            points: 5,
            enabled: false, // Bị tắt -> không tính điểm
            order: 6,
          },
        ],
      });

      // Case 1: Học sinh có Hộ nghèo (20) + Cận nghèo (10) cùng nhóm POVERTY_STATUS + Mồ côi (15) + Đặc biệt khó khăn (10) + Hà Giang (10)
      // CÓ chứng nhận hộ nghèo: hasPovertyCertificate = true
      // POVERTY_STATUS: lấy MAX(20, 10) = 20.
      // Tổng điểm kỳ vọng: 20 + 15 + 10 + 10 = 55 điểm (Khối 10 bị tắt nên không tính)
      const app1 = await ScholarshipApplication.create({
        campaignId: campaignWithCriteria._id,
        studentId: users.student1._id,
        applicationCode: "APP-PRIORITY-55",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        hasPovertyCertificate: true,
        applicantInfo: {
          fullName: "Nguyễn Văn An",
          hardshipCategories: ["POOR_HOUSEHOLD", "NEAR_POOR_HOUSEHOLD", "ORPHANED"],
          isDisadvantaged: true,
          permanentProvince: "Hà Giang",
        },
        schoolInfo: {
          province: "Hà Giang",
          gradeLevel: "GRADE_10",
        },
        submittedAt: new Date(),
      });

      // Chấm điểm cho app1
      const score1 = scholarshipService.scorePriorityCriteria(
        app1,
        campaignWithCriteria.priorityCriteria,
      );
      expect(score1.score).toBe(55);
      expect(score1.matchedCriteria).toHaveLength(4);
      const matchedCodes = score1.matchedCriteria.map((c) => c.code);
      expect(matchedCodes).toContain("POOR_HOUSEHOLD");
      expect(matchedCodes).not.toContain("NEAR_POOR_HOUSEHOLD"); // Bị loại bởi exclusiveGroup
      expect(matchedCodes).toContain("ORPHANED");
      expect(matchedCodes).toContain("IS_DISADVANTAGED");
      expect(matchedCodes).toContain("STUDENT_PROVINCE");
      expect(matchedCodes).not.toContain("GRADE_10"); // Bị tắt

      // Case 2: Học sinh khai Hộ nghèo nhưng KHÔNG có minh chứng xác nhận (hasPovertyCertificate: false)
      const app2 = await ScholarshipApplication.create({
        campaignId: campaignWithCriteria._id,
        studentId: users.student2._id,
        applicationCode: "APP-PRIORITY-NO-CERT",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        hasPovertyCertificate: false, // Không có giấy chứng nhận!
        applicantInfo: {
          fullName: "Trần Thị Bình",
          hardshipCategories: ["POOR_HOUSEHOLD"],
          isDisadvantaged: false,
        },
        submittedAt: new Date(),
      });

      const score2 = scholarshipService.scorePriorityCriteria(
        app2,
        campaignWithCriteria.priorityCriteria,
      );
      // Hộ nghèo không được tính vì thiếu hasPovertyCertificate
      expect(score2.score).toBe(0);
      expect(score2.matchedCriteria).toHaveLength(0);

      // Case 3: Chiến dịch không cấu hình tiêu chí -> trả về score: null
      const scoreEmpty = scholarshipService.scorePriorityCriteria(app1, []);
      expect(scoreEmpty.score).toBeNull();
      expect(scoreEmpty.matchedCriteria).toEqual([]);
    });

    test("Sắp xếp danh sách theo điểm ưu tiên (sortByPriority=true)", async () => {
      // Tạo 2 hồ sơ trên campaign có điểm số khác nhau
      const appLow = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-SORT-LOW",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        screeningResult: { layer1Passed: true, layer2Score: 10 },
        submittedAt: new Date(Date.now() - 3600000),
      });

      const appHigh = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-SORT-HIGH",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        screeningResult: { layer1Passed: true, layer2Score: 50 },
        submittedAt: new Date(),
      });

      // Lấy danh sách sắp xếp theo điểm ưu tiên
      const list = await scholarshipService.adminListApplications(
        {
          campaignId: campaign._id.toString(),
          sortByPriority: true,
        },
        { page: 1, pageSize: 20 },
      );

      expect(list.items.length).toBeGreaterThanOrEqual(2);
      const appCodes = list.items.map((a) => a.applicationCode);
      const idxHigh = appCodes.indexOf("APP-SORT-HIGH");
      const idxLow = appCodes.indexOf("APP-SORT-LOW");
      expect(idxHigh).toBeLessThan(idxLow); // Điểm cao (50) phải đứng trước điểm thấp (10)
    });

    test("Hồ sơ điểm cao nhưng thiếu minh chứng bắt buộc vẫn bị chặn phê duyệt", async () => {
      // Chiến dịch có minh chứng bắt buộc HOC_BA
      const campWithDoc = await ScholarshipCampaign.create({
        createdBy: users.adminIntake._id,
        title: "Chiến dịch Yêu cầu Học bạ 2026",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        fundedAmount: 5000000,
        status: "OPEN_FOR_FUNDING",
        isAcceptingFunding: true,
        documentChecklist: [
          {
            code: "HOC_BA",
            title: "Học bạ THPT",
            required: true,
            acceptedMode: "ONLINE",
            order: 1,
          },
        ],
      });

      // Hồ sơ có điểm ưu tiên cao ngất ngưởng (100đ) nhưng minh chứng HOC_BA đang PENDING
      const highPointApp = await ScholarshipApplication.create({
        campaignId: campWithDoc._id,
        studentId: users.student1._id,
        applicationCode: "APP-HIGH-POINTS-NO-DOC",
        status: "SUBMITTED",
        submissionMode: "ONLINE",
        guardianInfo: {
          fullName: "Bố Học Sinh",
          relationship: "FATHER",
          phone: "0912345678",
          cccd: "001234567890",
        },
        schoolInfo: {
          schoolName: "THPT Chuyên",
          gradeLevel: "GRADE_10",
          className: "10A",
        },
        screeningResult: { layer1Passed: true, layer2Score: 100 },
        checklistProgress: [
          {
            code: "HOC_BA",
            required: true,
            satisfied: false,
          },
        ],
        submittedAt: new Date(),
      });

      // Tạo minh chứng đang PENDING (chưa duyệt)
      await VerificationDocument.create({
        userId: users.student1._id,
        applicationId: highPointApp._id,
        documentType: "SCHOLARSHIP_PROOF",
        checklistItemCode: "HOC_BA",
        status: "PENDING",
        files: [{ side: "SINGLE", storageKey: "pending_transcript.pdf" }],
      });

      // Admin cố duyệt hồ sơ điểm cao này -> phải bị chặn 409 DOSSIER_CHECKLIST_INCOMPLETE
      await expect(
        scholarshipService.approveApplication(
          users.adminApprover._id,
          highPointApp._id,
          { reviewNote: "Cố duyệt khi minh chứng còn PENDING" },
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "DOSSIER_CHECKLIST_INCOMPLETE",
      });
    });

    test("Quyền riêng tư công khai (getPublicCampaignRecipients): Vị thành niên vẫn yêu cầu GuardianConsent hợp lệ", async () => {
      // Cấp học bổng cho học sinh vị thành niên (student2)
      const minorApp = await ScholarshipApplication.create({
        campaignId: campaign._id,
        studentId: users.student2._id,
        applicationCode: "APP-MINOR-PRIVACY",
        status: "APPROVED",
        publicConsent: { consented: true, consentedAt: new Date() },
        schoolInfo: {
          schoolName: "THPT Chuyên Hà Nội",
          gradeLevel: "GRADE_10",
          province: "Hà Nội",
        },
        guardianInfo: {
          fullName: "Trần Văn Cường",
          relationship: "FATHER",
          phone: "0901234567",
          cccd: "001085000123",
        },
        reviewedAt: new Date(),
      });

      const minorGrant = await Scholarship.create({
        campaignId: campaign._id,
        applicationId: minorApp._id,
        studentId: users.student2._id,
        allocatedAmount: 2000000,
        remainingAmount: 2000000,
        status: "ACTIVE",
        code: "SCH-MINOR-PRIVACY-TEST",
      });

      // Case 1: Chưa có GuardianConsent cho phép công khai -> không xuất hiện trên danh sách công khai
      let pubRes = await request(app).get(`/api/campaigns/${campaign._id}/recipients`);
      expect(pubRes.status).toBe(200);
      let foundMinor = (pubRes.body.data.items || []).find(
        (r) => r.applicationCode === "APP-MINOR-PRIVACY",
      );
      expect(foundMinor).toBeUndefined();

      // Case 2: Phụ huynh đồng thuận công khai (GuardianConsent VERIFIED + allowPublicStory: true)
      await GuardianConsent.create({
        studentId: users.student2._id,
        campaignId: campaign._id,
        status: "VERIFIED",
        allowPublicStory: true,
        guardian: {
          fullName: "Trần Văn Cường",
          relationship: "FATHER",
          phone: "0901234567",
        },
        documentStorageKey: "guardian_consent_signed.pdf",
      });

      pubRes = await request(app).get(`/api/campaigns/${campaign._id}/recipients`);
      foundMinor = (pubRes.body.data.items || []).find(
        (r) => r.applicationCode === "APP-MINOR-PRIVACY",
      );
      expect(foundMinor).toBeDefined();

      // Mask CCCD / SĐT không bao giờ bị lộ ra ngoài
      const resJson = JSON.stringify(pubRes.body);
      expect(resJson).not.toContain("001085000123");
      expect(resJson).not.toContain("0901234567");
    });
  });

  describe("EDUNITY V3 — Campaign Lifecycle & Draft Deletion Regression Suite", () => {
    let testDraftCampaign;
    let testActiveCampaign;

    beforeEach(async () => {
      const now = Date.now();
      testDraftCampaign = await ScholarshipCampaign.create({
        createdBy: users.adminApprover._id,
        title: "Chiến dịch Nháp Test Deletion",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        status: "DRAFT",
      });

      testActiveCampaign = await ScholarshipCampaign.create({
        createdBy: users.adminApprover._id,
        title: "Chiến dịch Hoạt Động Test Lifecycle",
        targetBudget: 20000000,
        expectedSlots: 10,
        awardAmountPerStudent: 2000000,
        status: "OPEN_FOR_FUNDING",
        fundingStart: new Date(now - 3600000),
        fundingEnd: new Date(now + 7 * 86400000),
        applicationStart: new Date(now - 3600000),
        applicationEnd: new Date(now + 7 * 86400000),
        eligibilityCriteria: "Dành cho học sinh có hoàn cảnh khó khăn.",
        resultPublicationDate: new Date(now + 8 * 86400000),
      });
    });

    // 1. Xóa chiến dịch nháp
    test("TC-LIFE-01: Admin can successfully delete a clean DRAFT campaign with no linked data", async () => {
      const res = await request(app)
        .delete(`/api/admin/campaigns/${testDraftCampaign._id}`)
        .set(as("adminApprover"));

      expect(res.status).toBe(200);
      expect(res.body.data?.success).toBe(true);

      // Verify campaign is no longer visible in admin list
      const getRes = await request(app)
        .get(`/api/admin/campaigns/${testDraftCampaign._id}`)
        .set(as("adminApprover"));
      expect(getRes.status).toBe(404);
    });

    test("TC-LIFE-02: Block deleting DRAFT campaign if it has linked applications", async () => {
      await ScholarshipApplication.create({
        campaignId: testDraftCampaign._id,
        studentId: users.student1._id,
        applicationCode: "APP-LINKED-TEST",
        status: "DRAFT",
      });

      const res = await request(app)
        .delete(`/api/admin/campaigns/${testDraftCampaign._id}`)
        .set(as("adminApprover"));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("CAMPAIGN_HAS_LINKED_DATA");
    });

    test("TC-LIFE-03: Block deleting DRAFT campaign if it has linked contributions", async () => {
      await SponsorContribution.create({
        campaignId: testDraftCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 1000000,
        contributionStatus: "PENDING",
        provider: "SANDBOX",
      });

      const res = await request(app)
        .delete(`/api/admin/campaigns/${testDraftCampaign._id}`)
        .set(as("adminApprover"));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("CAMPAIGN_HAS_LINKED_DATA");
    });

    test("TC-LIFE-04: Block deleting campaign if status is not DRAFT (OPEN_FOR_FUNDING or CLOSED)", async () => {
      const res = await request(app)
        .delete(`/api/admin/campaigns/${testActiveCampaign._id}`)
        .set(as("adminApprover"));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("CAMPAIGN_NOT_DRAFT");
    });

    test("TC-LIFE-05: Non-admin users cannot delete campaigns (403)", async () => {
      const studentRes = await request(app)
        .delete(`/api/admin/campaigns/${testDraftCampaign._id}`)
        .set(as("student1"));
      expect(studentRes.status).toBe(403);

      const sponsorRes = await request(app)
        .delete(`/api/admin/campaigns/${testDraftCampaign._id}`)
        .set(as("sponsor"));
      expect(sponsorRes.status).toBe(403);
    });

    // 2. Vòng đời gây quỹ độc lập
    test("TC-LIFE-06: Pause and resume funding independently while campaign is ACTIVE", async () => {
      // A. Pause funding
      const pauseRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/pause-funding`)
        .set(as("adminApprover"))
        .send({ note: "Tạm dừng kiểm tra kỹ thuật" });

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.isFundingPaused).toBe(true);
      expect(pauseRes.body.data.fundingStatus).toBe("PAUSED");

      // B. Creating new contribution is rejected when funding is paused
      await expect(
        contributionService.createContribution(users.sponsor._id, testActiveCampaign._id, { amount: 1000000 })
      ).rejects.toMatchObject({ code: "CAMPAIGN_NOT_ACCEPTING_FUNDING" });

      // C. But student can still apply for scholarship!
      const appRes = await request(app)
        .post(`/api/campaigns/${testActiveCampaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(appRes.status).toBe(201);

      // D. Resume funding
      const resumeRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/resume-funding`)
        .set(as("adminApprover"));
      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.data.isFundingPaused).toBe(false);
      expect(resumeRes.body.data.fundingStatus).toBe("OPEN");

      // E. Funding is accepting again
      const refreshedCamp = await ScholarshipCampaign.findById(testActiveCampaign._id);
      expect(campaignService.isAcceptingFunding(refreshedCamp)).toBe(true);
    });

    test("TC-LIFE-07: Close funding and reopen funding (multiple times) without losing funds", async () => {
      // Simulate existing fund of 5M
      testActiveCampaign.fundedAmount = 5000000;
      await testActiveCampaign.save();

      // Close funding
      const closeRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/close-funding`)
        .set(as("adminApprover"))
        .send({ note: "Đóng nhận tài trợ" });

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.fundingClosed).toBe(true);
      expect(closeRes.body.data.fundingStatus).toBe("CLOSED");
      expect(closeRes.body.data.status).toBe("OPEN_FOR_FUNDING"); // Campaign remains active for applications!

      // Reopen funding with new future date
      const futureDate = new Date(Date.now() + 14 * 86400000).toISOString();
      const reopenRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/reopen-funding`)
        .set(as("adminApprover"))
        .send({ newFundingEnd: futureDate });

      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.data.fundingClosed).toBe(false);
      expect(reopenRes.body.data.fundingStatus).toBe("OPEN");
      // Fund balance remains intact (not reset)
      expect(Number(reopenRes.body.data.fundedAmount)).toBe(5000000);
    });

    // 3. Vòng đời nhận hồ sơ độc lập
    test("TC-LIFE-08: Pause applications blocks new applications but permits resubmission and admin reviews", async () => {
      // Student 1 applies while open
      const firstAppRes = await request(app)
        .post(`/api/campaigns/${testActiveCampaign._id}/applications`)
        .set(as("student1"))
        .send(applyPayload);
      expect(firstAppRes.status).toBe(201);
      const student1AppId = firstAppRes.body.data.id;

      // Admin requests more information on student1's application
      await request(app)
        .post(`/api/admin/scholarship-applications/${student1AppId}/request-information`)
        .set(as("adminApprover"))
        .send({ reviewNote: "Vui lòng bổ sung minh chứng" });

      // Admin pauses application intake
      const pauseAppRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/pause-applications`)
        .set(as("adminApprover"))
        .send({ note: "Tạm dừng nhận hồ sơ mới" });
      expect(pauseAppRes.status).toBe(200);
      expect(pauseAppRes.body.data.isApplicationPaused).toBe(true);
      expect(pauseAppRes.body.data.applicationStatus).toBe("PAUSED");

      // New student (student2) tries to apply -> blocked (409)
      const newAppRes = await request(app)
        .post(`/api/campaigns/${testActiveCampaign._id}/applications`)
        .set(as("student2"))
        .send(applyPayload);
      expect(newAppRes.status).toBe(409);
      expect(newAppRes.body.error).toBe("CAMPAIGN_NOT_ACCEPTING_APPLICATIONS");

      // BUT student 1 with NEED_MORE_INFORMATION can still resubmit!
      const resubmitRes = await request(app)
        .post(`/api/me/scholarship-applications/${student1AppId}/resubmit`)
        .set(as("student1"))
        .send({
          statement: "Bổ sung thông tin giải trình",
          submissionMode: "PAPER",
        });
      expect(resubmitRes.status).toBe(200);

      // And Admin can still review and screen application during paused intake
      const screenRes = await request(app)
        .post(`/api/admin/scholarship-applications/${student1AppId}/screen`)
        .set(as("adminApprover"))
        .send({ passed: true, note: "Duyệt hồ sơ hợp lệ trong lúc tạm dừng nhận mới" });
      expect(screenRes.status).toBe(200);

      // Funding remains accepted during paused applications
      const refreshedActive = await ScholarshipCampaign.findById(testActiveCampaign._id);
      expect(campaignService.isAcceptingFunding(refreshedActive)).toBe(true);
    });

    // 4. PayOS Webhook idempotency and fund preservation when paused/closed
    test("TC-LIFE-09: Pre-existing contribution is credited even if funding was paused/closed after creation", async () => {
      const beforeFund = Number(testActiveCampaign.fundedAmount || 0);

      // Pre-existing contribution intent created while open
      const contribution = await SponsorContribution.create({
        campaignId: testActiveCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 2000000,
        contributionStatus: "PENDING",
        paymentReference: "CONTRIB-999901-REGRESSION",
        provider: "SANDBOX",
        gateway: "SANDBOX",
        orderCode: 999901,
      });

      // Admin pauses funding
      await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/pause-funding`)
        .set(as("adminApprover"));

      // Webhook arrives for the pre-existing contribution
      const webhookRes = await contributionService.processWebhook(
        contribution.paymentReference,
        "SUCCESS",
      );
      expect(webhookRes).toBeDefined();

      // Campaign fund is updated properly
      const updatedCampaign = await ScholarshipCampaign.findById(testActiveCampaign._id);
      expect(Number(updatedCampaign.fundedAmount)).toBe(beforeFund + 2000000);

      // Contribution status is COMPLETED
      const updatedContrib = await SponsorContribution.findById(contribution._id);
      expect(updatedContrib.contributionStatus).toBe("COMPLETED");

      // Webhook sent again -> idempotent, no double increment
      const dupRes = await contributionService.processWebhook(
        contribution.paymentReference,
        "SUCCESS",
      );
      expect(dupRes?.result).toBe("IDEMPOTENT");
      const campaignAfterDup = await ScholarshipCampaign.findById(testActiveCampaign._id);
      expect(Number(campaignAfterDup.fundedAmount)).toBe(beforeFund + 2000000);
    });

    // 5. Đóng chính thức toàn bộ chiến dịch
    test("TC-LIFE-10: Close entire campaign marks status CLOSED and closes both funding and applications", async () => {
      const closeRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/close`)
        .set(as("adminApprover"))
        .send({ note: "Kết thúc toàn bộ chiến dịch học bổng" });

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe("CLOSED");
      expect(closeRes.body.data.fundingClosed).toBe(true);
      expect(closeRes.body.data.applicationClosed).toBe(true);
      expect(closeRes.body.data.fundingStatus).toBe("CLOSED");
      expect(closeRes.body.data.applicationStatus).toBe("CLOSED");
    });

    // 6. Cơ chế khôi phục có kiểm soát cho chiến dịch CLOSED
    test("TC-LIFE-11: Controlled campaign recovery (reopenCampaign) restores CLOSED campaign safely", async () => {
      // 0. Đóng chiến dịch trước để đưa về trạng thái CLOSED
      await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/close`)
        .set(as("adminApprover"))
        .send({ note: "Đóng chiến dịch trước khi test khôi phục" });

      // 1. Thất bại nếu lý do quá ngắn (< 8 ký tự)
      const invalidReasonRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/reopen`)
        .set(as("adminApprover"))
        .send({ reason: "Ngắn" });
      expect(invalidReasonRes.status).toBe(400);

      // 2. Thất bại nếu gọi resumeFunding trực tiếp khi campaign đang CLOSED (hệ thống hướng dẫn dùng reopenCampaign)
      const resumeBlockedRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/resume-funding`)
        .set(as("adminApprover"))
        .send({});
      expect(resumeBlockedRes.status).toBe(409);
      expect(resumeBlockedRes.body.error).toBe("CAMPAIGN_CLOSED");

      // 3. Khôi phục thành công với lý do đầy đủ và gia hạn thời gian
      const futureFundingEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const futureAppEnd = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();

      const reopenRes = await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/reopen`)
        .set(as("adminApprover"))
        .send({
          reason: "Khôi phục chiến dịch theo quyết định của ban điều hành",
          reopenFunding: true,
          newFundingEnd: futureFundingEnd,
          reopenApplications: true,
          newApplicationEnd: futureAppEnd,
        });

      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.data.status).toBe("OPEN_FOR_FUNDING");
      expect(reopenRes.body.data.fundingClosed).toBe(false);
      expect(reopenRes.body.data.applicationClosed).toBe(false);
      expect(reopenRes.body.data.fundingStatus).toBe("OPEN");
      expect(reopenRes.body.data.applicationStatus).toBe("OPEN");

      // Đóng lại để giữ trạng thái cho các ca test sau nếu cần
      await request(app)
        .post(`/api/admin/campaigns/${testActiveCampaign._id}/close`)
        .set(as("adminApprover"))
        .send({ note: "Đóng lại sau kiểm thử khôi phục" });
    });

    // 7. Bảo vệ an toàn xóa chiến dịch nháp chống race condition & liên kết thanh toán, giấy tờ
    test("TC-LIFE-12: deleteDraftCampaign safeguards payment intents and guardian consents", async () => {
      // Tạo draft campaign
      const draft = await ScholarshipCampaign.create({
        createdBy: users.adminApprover._id,
        title: "Chiến dịch nháp kiểm tra bảo vệ thanh toán",
        targetBudget: 10000000,
        expectedSlots: 5,
        awardAmountPerStudent: 2000000,
        status: "DRAFT",
      });

      // Tạo một Payment intent gắn với campaign
      const paymentIntent = await Payment.create({
        campaignId: draft._id,
        sponsorId: users.sponsor._id,
        payerUserId: users.sponsor._id,
        gatewayReference: "GATEWAY-REF-888801",
        amount: 2000000,
        currency: "VND",
        paymentStatus: "PENDING",
        provider: "PAYOS",
        gateway: "PAYOS",
        purpose: "DONATION",
        orderCode: 888801,
      });

      // Thao tác xóa draft bị chặn vì có payment intent
      const deleteBlockedRes = await request(app)
        .delete(`/api/admin/campaigns/${draft._id}`)
        .set(as("adminApprover"));
      expect(deleteBlockedRes.status).toBe(409);
      expect(deleteBlockedRes.body.error).toBe("CAMPAIGN_HAS_LINKED_DATA");
      expect(deleteBlockedRes.body.message).toMatch(/đơn thanh toán/);

      // Xóa payment intent thử nghiệm
      await Payment.deleteOne({ _id: paymentIntent._id });

      // Gắn một GuardianConsent
      const consentDoc = await GuardianConsent.create({
        studentId: users.student1._id,
        campaignId: draft._id,
        status: "PENDING",
        guardian: { fullName: "Bố An", relationship: "FATHER", phone: "0912345678" },
        documentStorageKey: "test/consent.pdf",
      });

      // Thao tác xóa draft bị chặn vì có guardian consent
      const consentBlockedRes = await request(app)
        .delete(`/api/admin/campaigns/${draft._id}`)
        .set(as("adminApprover"));
      expect(consentBlockedRes.status).toBe(409);
      expect(consentBlockedRes.body.error).toBe("CAMPAIGN_HAS_LINKED_DATA");
      expect(consentBlockedRes.body.message).toMatch(/đơn đồng thuận/);

      // Xóa consent thử nghiệm
      await GuardianConsent.deleteOne({ _id: consentDoc._id });

      // Bây giờ xóa draft thành công
      const deleteSuccessRes = await request(app)
        .delete(`/api/admin/campaigns/${draft._id}`)
        .set(as("adminApprover"));
      expect(deleteSuccessRes.status).toBe(200);
      expect(deleteSuccessRes.body.data.success).toBe(true);

      const checkDeleted = await ScholarshipCampaign.findById(draft._id);
      expect(checkDeleted.isDeleted).toBe(true);
    });

    // 8. Tài chính: PayOS webhook cho giao dịch phát sinh trước khi đóng gây quỹ/chiến dịch
    test("TC-LIFE-13: PayOS webhook credits pre-existing donation even when campaign is CLOSED, and routes to reconciliation if already reconciled", async () => {
      // Tạo campaign CLOSED nhưng chưa đối soát
      const closedCampaign = await ScholarshipCampaign.create({
        createdBy: users.adminApprover._id,
        title: "Chiến dịch đã đóng nhưng chưa đối soát",
        targetBudget: 20000000,
        fundedAmount: 10000000,
        expectedSlots: 10,
        awardAmountPerStudent: 2000000,
        status: "CLOSED",
        fundingClosed: true,
        applicationClosed: true,
        fundingStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        fundingEnd: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      // Khoản đóng góp phát sinh trước đó (PENDING)
      const contrib1 = await SponsorContribution.create({
        campaignId: closedCampaign._id,
        sponsorId: users.sponsor._id,
        amount: 3000000,
        contributionStatus: "PENDING",
        paymentReference: "CONTRIB-CLOSED-001",
        provider: "SANDBOX",
        gateway: "SANDBOX",
        orderCode: 777701,
      });

      // Webhook hoàn tất thanh toán từ nhà hảo tâm
      const dispatchRes = await contributionService.processWebhook(
        contrib1.paymentReference,
        "SUCCESS",
      );
      expect(dispatchRes).toBeDefined();

      // Kiểm tra: quỹ chiến dịch vẫn được ghi nhận nạp thêm 3M (10M + 3M = 13M)
      const refreshedClosed = await ScholarshipCampaign.findById(closedCampaign._id);
      expect(Number(refreshedClosed.fundedAmount)).toBe(13000000);

      const refreshedContrib1 = await SponsorContribution.findById(contrib1._id);
      expect(refreshedContrib1.contributionStatus).toBe("COMPLETED");

      // Trường hợp 2: Chiến dịch đã chốt đối soát tài chính chính thức (fundingReconciledAt != null)
      refreshedClosed.fundingReconciledAt = new Date();
      await refreshedClosed.save();

      const contrib2 = await SponsorContribution.create({
        campaignId: refreshedClosed._id,
        sponsorId: users.sponsor._id,
        amount: 2000000,
        contributionStatus: "PENDING",
        paymentReference: "CONTRIB-RECONCILED-002",
        provider: "SANDBOX",
        gateway: "SANDBOX",
        orderCode: 777702,
      });

      // Xử lý nạp tiền cho chiến dịch đã đối soát -> không ghi đè số liệu quỹ mà chuyển sang đối soát thủ công
      await contributionService.processWebhook(
        contrib2.paymentReference,
        "SUCCESS",
      );
      // Quỹ không bị ghi đè lung tung
      const postReconCampaign = await ScholarshipCampaign.findById(refreshedClosed._id);
      expect(Number(postReconCampaign.fundedAmount)).toBe(13000000);
    });
  });
});
