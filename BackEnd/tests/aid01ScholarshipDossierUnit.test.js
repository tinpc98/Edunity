const mongoose = require("mongoose");
const {
  setConsentVerifier,
  resetConsentVerifier,
  getConsentDependencyStatus,
  parseGuardianInfo,
  parseSchoolInfo,
  parseSubmissionMode,
  parseChecklistDefinition,
  parseDossierPolicy,
  evaluateChecklistProgress,
  assertConsentGate,
  redactReceiptForStudent,
  redactApplicationForStudent,
} = require("../src/services/scholarshipDossierGateService");
const {
  GRADE_LEVELS,
  GUARDIAN_RELATIONSHIPS,
  CHECKLIST_ITEM_MODES,
  DOSSIER_SUBMISSION_MODES,
  SCHOLARSHIP_APPLICATION_STATUSES,
  PAPER_RECEIPT_STATUSES,
} = require("../src/models/constants");

describe("AID-01 Unit Tests — Dossier Validation, Checklist Evaluation, Consent Gate & Redaction", () => {
  afterEach(() => {
    resetConsentVerifier();
  });

  test("AID-01.U1: Stage 3 constants expose expected nonfinancial dossier and paper receipt enums", () => {
    expect(DOSSIER_SUBMISSION_MODES).toEqual(["ONLINE", "PAPER", "HYBRID"]);
    expect(CHECKLIST_ITEM_MODES).toEqual(["ONLINE", "PAPER", "EITHER", "BOTH"]);
    expect(GUARDIAN_RELATIONSHIPS).toContain("MOTHER");
    expect(GUARDIAN_RELATIONSHIPS).toContain("LEGAL_GUARDIAN");
    expect(SCHOLARSHIP_APPLICATION_STATUSES).toContain("DRAFT");
    expect(SCHOLARSHIP_APPLICATION_STATUSES).toContain("DOSSIER_VERIFIED");
    expect(PAPER_RECEIPT_STATUSES).toContain("RECONCILED");
    expect(GRADE_LEVELS).toHaveLength(15);
  });

  test("AID-01.U2: parseGuardianInfo validates required fields, formats phone/email/last4, and rejects NoSQL/bad shapes", () => {
    expect(() => parseGuardianInfo(null, { required: true })).toThrow(/guardianInfo is required/);
    expect(parseGuardianInfo(null, { required: false })).toBeNull();
    expect(() => parseGuardianInfo(["bad"], { required: true })).toThrow(/must be an object/);

    expect(() =>
      parseGuardianInfo(
        { fullName: { $gt: "" }, relationship: "MOTHER", phone: "0901234567" },
        { required: true }
      )
    ).toThrow(/must be a string/);

    expect(() =>
      parseGuardianInfo(
        { fullName: "Nguyen Van A", relationship: "COUSIN", phone: "0901234567" },
        { required: true }
      )
    ).toThrow(/relationship/);

    expect(() =>
      parseGuardianInfo(
        { fullName: "Nguyen Van A", relationship: "FATHER", phone: "123" },
        { required: true }
      )
    ).toThrow(/between 8 and 20 characters/);

    expect(() =>
      parseGuardianInfo(
        { fullName: "Nguyen Van A", relationship: "FATHER", phone: "12345---" },
        { required: true }
      )
    ).toThrow(/not a valid phone number/);

    expect(() =>
      parseGuardianInfo(
        {
          fullName: "Nguyen Van A",
          relationship: "FATHER",
          phone: "0901234567",
          nationalIdLast4: "001234567890",
        },
        { required: true }
      )
    ).toThrow(/exactly 4 digits/);

    const parsed = parseGuardianInfo(
      {
        fullName: "  Tran Thi B ",
        relationship: "mother",
        phone: "090-123-4567",
        email: " PARENT@Example.VN ",
        nationalIdLast4: "6789",
        occupation: "Nong dan",
      },
      { required: true }
    );

    expect(parsed).toMatchObject({
      fullName: "Tran Thi B",
      relationship: "MOTHER",
      phone: "090-123-4567",
      email: "parent@example.vn",
      nationalIdLast4: "6789",
      occupation: "Nong dan",
    });
  });

  test("AID-01.U3: parseSchoolInfo enforces schoolName, GRADE_LEVELS, className, and rejects object payloads", () => {
    expect(() => parseSchoolInfo(undefined, { required: true })).toThrow(/schoolInfo is required/);
    expect(() =>
      parseSchoolInfo({ schoolName: "THPT Chu Van An", gradeLevel: "GRADE_99", className: "12A" }, { required: true })
    ).toThrow(/gradeLevel/);
    expect(() =>
      parseSchoolInfo({ schoolName: "THPT Chu Van An", gradeLevel: "GRADE_12", className: { $ne: "" } }, { required: true })
    ).toThrow(/must be a string/);

    const parsed = parseSchoolInfo(
      {
        schoolName: " THPT Nguyen Hue ",
        gradeLevel: "grade_11",
        className: " 11A2 ",
        academicYear: "2026-2027",
      },
      { required: true }
    );
    expect(parsed.gradeLevel).toBe("GRADE_11");
    expect(parsed.schoolName).toBe("THPT Nguyen Hue");
    expect(parsed.className).toBe("11A2");
  });

  test("AID-01.U4: parseChecklistDefinition & parseDossierPolicy validate uniqueness, modes, and doc types", () => {
    expect(() =>
      parseChecklistDefinition([
        { code: "HO_KHAU", title: "Ho khau" },
        { code: "ho_khau", title: "Trung ma" },
      ])
    ).toThrow(/Duplicate checklist code/);

    expect(() =>
      parseChecklistDefinition([{ code: "INVALID CODE WITH SPACES!", title: "Test" }])
    ).toThrow(/code must match/);

    expect(() =>
      parseChecklistDefinition([{ code: "HOC_BA", title: "Hoc ba", acceptedMode: "FAX" }])
    ).toThrow(/acceptedMode/);

    expect(() => parseDossierPolicy({ allowPaperDossier: "yes" })).toThrow(/must be a boolean/);

    const parsed = parseChecklistDefinition([
      { code: "hoc_ba", title: "Hoc ba", acceptedMode: "online", maxFiles: 3 },
      { code: "xac_nhan_ngheo", title: "Giay xac nhan", acceptedMode: "paper", required: true },
    ]);
    expect(parsed[0].code).toBe("HOC_BA");
    expect(parsed[0].acceptedMode).toBe("ONLINE");
    expect(parsed[1].acceptedMode).toBe("PAPER");

    expect(() => parseSubmissionMode("PAPER", { dossierPolicy: { allowPaperDossier: false } })).toThrow(
      /does not accept paper dossier submissions/
    );
  });

  test("AID-01.U5: evaluateChecklistProgress handles ONLINE, PAPER, HYBRID, EITHER, BOTH and REJECTED docs accurately", () => {
    const campaign = {
      documentChecklist: [
        { code: "HOC_BA", title: "Hoc ba", required: true, acceptedMode: "ONLINE" },
        { code: "HO_KHAU", title: "Ho khau", required: true, acceptedMode: "EITHER" },
        { code: "XAC_NHAN_UBND", title: "Xac nhan UBND", required: true, acceptedMode: "PAPER" },
        { code: "CAM_KET", title: "Cam ket", required: true, acceptedMode: "BOTH" },
        { code: "KHEN_THUONG", title: "Giay khen", required: false, acceptedMode: "EITHER" },
      ],
    };

    const docHocBa = { _id: new mongoose.Types.ObjectId(), checklistItemCode: "HOC_BA", status: "PENDING" };
    const docRejectedCamKet = { _id: new mongoose.Types.ObjectId(), checklistItemCode: "CAM_KET", status: "REJECTED" };
    const docCamKetValid = { _id: new mongoose.Types.ObjectId(), checklistItemCode: "CAM_KET", status: "APPROVED" };

    // 1. ONLINE mode cannot satisfy PAPER or BOTH required items
    const onlineEval = evaluateChecklistProgress({
      campaign,
      submissionMode: "ONLINE",
      onlineDocuments: [docHocBa, docCamKetValid],
      paperReceipts: [],
    });
    expect(onlineEval.missingOnSubmit.map((m) => m.code)).toEqual(
      expect.arrayContaining(["HO_KHAU", "XAC_NHAN_UBND", "CAM_KET"])
    );

    // 2. HYBRID submit passes if ONLINE and BOTH online docs exist; still waits for PAPER reconciliation before verify
    const hybridAtSubmit = evaluateChecklistProgress({
      campaign,
      submissionMode: "HYBRID",
      onlineDocuments: [docHocBa, docCamKetValid, docRejectedCamKet],
      paperReceipts: [],
    });
    expect(hybridAtSubmit.missingOnSubmit).toEqual([]);
    expect(hybridAtSubmit.missingForVerification.map((m) => m.code)).toEqual(
      expect.arrayContaining(["HO_KHAU", "XAC_NHAN_UBND", "CAM_KET"])
    );

    // 3. With a REJECTED online CAM_KET only, HYBRID submit catches missing CAM_KET online half
    const hybridRejectedOnly = evaluateChecklistProgress({
      campaign,
      submissionMode: "HYBRID",
      onlineDocuments: [docHocBa, docRejectedCamKet],
      paperReceipts: [],
    });
    expect(hybridRejectedOnly.missingOnSubmit.map((m) => m.code)).toContain("CAM_KET");

    // 4. After RECONCILED PaperDossierReceipt matches HO_KHAU, XAC_NHAN_UBND, CAM_KET -> verification complete!
    const receiptId = new mongoose.Types.ObjectId();
    const afterReconciled = evaluateChecklistProgress({
      campaign,
      submissionMode: "HYBRID",
      onlineDocuments: [docHocBa, docCamKetValid],
      paperReceipts: [
        {
          _id: receiptId,
          status: "RECONCILED",
          reconciledItems: [
            { checklistItemCode: "HO_KHAU", itemStatus: "MATCHED" },
            { checklistItemCode: "XAC_NHAN_UBND", itemStatus: "MATCHED" },
            { checklistItemCode: "CAM_KET", itemStatus: "MATCHED" },
          ],
        },
      ],
    });
    expect(afterReconciled.missingForVerification).toEqual([]);
    expect(afterReconciled.hasReconciledPaperReceipt).toBe(true);
  });

  test("AID-01.U6: AID-08 Consent dependency fails closed (503) when required and succeeds/denies only via official verifier", async () => {
    expect(getConsentDependencyStatus().aid08ConsentReady).toBe(false);

    // Optional when campaign flag is false and no verifier set -> NOT_REQUIRED (never fakes VERIFIED)
    const optionalSnap = await assertConsentGate({
      student: { _id: new mongoose.Types.ObjectId() },
      campaign: { dossierPolicy: { requireGuardianConsentForMinor: false } },
      guardianInfo: { fullName: "Guardian", relationship: "MOTHER", phone: "0901234567" },
    });
    expect(optionalSnap.status).toBe("NOT_REQUIRED");
    expect(optionalSnap.consentRecordId).toBeNull();

    // Strict AID-08 campaign blocks if no verifier registered
    await expect(
      assertConsentGate({
        student: { _id: new mongoose.Types.ObjectId() },
        campaign: { dossierPolicy: { requireGuardianConsentForMinor: true } },
        guardianInfo: { fullName: "Guardian", relationship: "MOTHER", phone: "0901234567" },
      })
    ).rejects.toMatchObject({ statusCode: 503, code: "CONSENT_DEPENDENCY_BLOCKED" });

    // Registered verifier refusing consent -> 403 GUARDIAN_CONSENT_REQUIRED
    setConsentVerifier(async () => ({ verified: false, reason: "Parent has not signed consent form" }));
    expect(getConsentDependencyStatus().aid08ConsentReady).toBe(true);
    await expect(
      assertConsentGate({
        student: { _id: new mongoose.Types.ObjectId() },
        campaign: { dossierPolicy: { requireGuardianConsentForMinor: true } },
      })
    ).rejects.toMatchObject({ statusCode: 403, code: "GUARDIAN_CONSENT_REQUIRED" });

    // Registered verifier approving consent -> VERIFIED snapshot
    const consentId = new mongoose.Types.ObjectId();
    const guardianUserId = new mongoose.Types.ObjectId();
    setConsentVerifier(async () => ({
      verified: true,
      consentRecordId: consentId,
      guardianUserId,
      note: "Verified by AID-08",
    }));
    const verifiedSnap = await assertConsentGate({
      student: { _id: new mongoose.Types.ObjectId() },
      campaign: { dossierPolicy: { requireGuardianConsentForMinor: true } },
    });
    expect(verifiedSnap).toMatchObject({
      status: "VERIFIED",
      consentRecordId: consentId,
      guardianUserId,
    });
  });

  test("AID-01.U7: Redaction helpers strip all staff/admin IDs before returning to Student", () => {
    const adminId = new mongoose.Types.ObjectId();
    const redactedApp = redactApplicationForStudent({
      _id: "app1",
      applicationCode: "APP-001",
      status: "DOSSIER_VERIFIED",
      reviewedBy: adminId,
      reviewNote: "Ho so day du",
      dossierVerification: {
        status: "VERIFIED",
        verifiedBy: adminId,
        note: "Dat yeu cau",
        checklistVerified: true,
      },
    });
    expect(redactedApp.reviewedBy).toBeUndefined();
    expect(redactedApp.dossierVerification.verifiedBy).toBeUndefined();
    expect(redactedApp.reviewNote).toBe("Ho so day du");
    expect(redactedApp.dossierVerification.checklistVerified).toBe(true);

    const redactedReceipt = redactReceiptForStudent({
      _id: "rec1",
      receiptCode: "PDR-001",
      status: "RECONCILED",
      receivedBy: adminId,
      receivedByName: "admin@test.com",
      reconciledBy: adminId,
      trackingKey: "VNPOST::VN123",
      reconciledItems: [{ checklistItemCode: "HOC_BA", itemStatus: "MATCHED", verifiedBy: adminId }],
      history: [{ action: "RECEIPT_LOGGED", actorAdminId: adminId, toStatus: "RECEIVED" }],
    });
    expect(redactedReceipt.receivedBy).toBeUndefined();
    expect(redactedReceipt.receivedByName).toBeUndefined();
    expect(redactedReceipt.reconciledBy).toBeUndefined();
    expect(redactedReceipt.trackingKey).toBeUndefined();
    expect(redactedReceipt.reconciledItems[0].verifiedBy).toBeUndefined();
    expect(redactedReceipt.history[0].actorAdminId).toBeUndefined();
    expect(redactedReceipt.receiptCode).toBe("PDR-001");
  });
});
