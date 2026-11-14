const { User, GuardianConsent, ScholarshipApplication, SponsorContribution } = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { assertId, validationError, isBlank, paged } = require("../utils/http");
const storage = require("./storageService");
const campaignService = require("./campaignService");
const { parseGuardianInfo } = require("./scholarshipDossierGateService");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");

/**
 * BAO-11: privacy of students applying for support.
 *  - AID-08 guardian consent for minors: a signed consent form, checked by an Admin
 *  - an optional, anonymised public story sponsors (MTQ) may read; off unless the student opts in,
 *    and for a minor only when the guardian's consent also covers it. Revocable at any time.
 */
const ADULT_AGE = 18;
const STORY_MIN = 20;
const STORY_MAX = 500;

const notFound = (what = "Consent") => new AppError(`${what} not found`, `${what.toUpperCase().replace(/ /g, "_")}_NOT_FOUND`, 404);

// No birth date on file counts as a minor: consent is required rather than skipped
const isMinor = (student, now = new Date()) => {
  const dob = student && student.studentProfile && student.studentProfile.dateOfBirth;
  if (!dob) return true;
  const adultSince = new Date(dob);
  adultSince.setFullYear(adultSince.getFullYear() + ADULT_AGE);
  return adultSince > now;
};

const presentConsent = (consent, { admin = false } = {}) => ({
  id: consent._id.toString(),
  campaignId: consent.campaignId.toString(),
  guardian: consent.guardian,
  allowPublicStory: consent.allowPublicStory,
  status: consent.status,
  submittedAt: consent.submittedAt,
  reviewedAt: consent.reviewedAt,
  reviewNote: consent.reviewNote,
  ...(admin ? { studentId: consent.studentId.toString(), documentStorageKey: consent.documentStorageKey } : {}),
});

// ---------- AID-08 gate port (registered in app.js) ----------

const verifyConsent = async ({ student, campaign }) => {
  if (!isMinor(student)) return { verified: true, notRequired: true, note: "Student is 18 or older" };
  const consent = await GuardianConsent.findOne({ studentId: student._id, campaignId: campaign._id, status: "VERIFIED" }).lean();
  if (!consent) {
    return { verified: false, reason: "A guardian consent form verified by Edunity is required for students under 18" };
  }
  return { verified: true, consentRecordId: consent._id, note: `Guardian consent ${consent._id} (${consent.guardian.relationship})` };
};

// ---------- Student ----------

const submitConsent = async (studentId, body = {}) => {
  const campaign = await campaignService.getCampaignOrThrow(body.campaignId);
  const guardian = parseGuardianInfo(body.guardian, { required: true });
  const storageKey = body.documentStorageKey;
  const parsed = storage.parsePrivateKey(storageKey);
  if (!parsed || parsed.purpose !== "SCHOLARSHIP_PROOF") {
    throw validationError("documentStorageKey must be a SCHOLARSHIP_PROOF file uploaded through POST /api/uploads/private");
  }
  await storage.assertOwnedKeys(studentId, [storageKey]);

  let consent;
  try {
    consent = await GuardianConsent.create({
      studentId,
      campaignId: campaign._id,
      guardian: { fullName: guardian.fullName, relationship: guardian.relationship, phone: guardian.phone },
      documentStorageKey: storageKey,
      allowPublicStory: body.allowPublicStory === true,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError("A consent for this campaign is already pending or verified", "GUARDIAN_CONSENT_EXISTS", 409);
    }
    throw err;
  }
  await notifyAdmins("Giấy đồng thuận phụ huynh chờ duyệt", "Một học sinh đã nộp giấy đồng thuận của phụ huynh.", "GUARDIAN_CONSENT_SUBMITTED");
  return presentConsent(consent.toObject());
};

const listMyConsents = async (studentId) =>
  (await GuardianConsent.find({ studentId }).sort({ submittedAt: -1 }).lean()).map((consent) => presentConsent(consent));

// Withdrawing consent also withdraws a public story that relied on it
const revokeConsent = async (studentId, consentId) => {
  assertId(consentId, "Consent not found", "CONSENT_NOT_FOUND");
  const consent = await GuardianConsent.findOneAndUpdate(
    { _id: consentId, studentId, status: { $in: ["PENDING", "VERIFIED"] } },
    { $set: { status: "REVOKED", revokedAt: new Date() } },
    { returnDocument: "after" }
  ).lean();
  if (!consent) throw notFound();
  const student = await User.findById(studentId).select("studentProfile").lean();
  if (isMinor(student)) {
    await ScholarshipApplication.updateMany(
      { studentId, campaignId: consent.campaignId, "publicStory.consent": true },
      { $set: { "publicStory.consent": false, "publicStory.revokedAt": new Date() } }
    );
  }
  return presentConsent(consent);
};

const setPublicStory = async (studentId, applicationId, body = {}) => {
  assertId(applicationId, "Application not found", "APPLICATION_NOT_FOUND");
  const application = await ScholarshipApplication.findOne({ _id: applicationId, studentId });
  if (!application) throw notFound("Application");

  const now = new Date();
  if (body.consent !== true) {
    application.publicStory = { ...(application.publicStory?.toObject?.() || {}), consent: false, revokedAt: now };
    await application.save();
    return { consent: false };
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < STORY_MIN || text.length > STORY_MAX) {
    throw validationError(`text must be between ${STORY_MIN} and ${STORY_MAX} characters`);
  }
  const student = await User.findById(studentId).select("studentProfile").lean();
  if (isMinor(student)) {
    const covered = await GuardianConsent.exists({ studentId, campaignId: application.campaignId, status: "VERIFIED", allowPublicStory: true });
    if (!covered) {
      throw new AppError("Students under 18 need a verified guardian consent that allows a public story", "GUARDIAN_CONSENT_REQUIRED", 403);
    }
  }
  application.publicStory = { consent: true, text, consentedAt: now, revokedAt: null };
  await application.save();
  return { consent: true, text, consentedAt: now };
};

// ---------- Sponsor (MTQ) ----------

// "Nguyễn Văn An" -> "N.V.A."
const initials = (fullName) =>
  String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join("");

// Only anonymised stories the student (and guardian, for a minor) agreed to publish; never ids, names or documents
const listCampaignStories = async (sponsorId, campaignId) => {
  const campaign = await campaignService.getCampaignOrThrow(campaignId);
  const contributed = await SponsorContribution.exists({ campaignId: campaign._id, sponsorId, contributionStatus: "COMPLETED" });
  if (!contributed) throw FORBIDDEN("Stories are only shared with sponsors of this campaign");

  const applications = await ScholarshipApplication.find({ campaignId: campaign._id, status: "APPROVED", "publicStory.consent": true })
    .select("studentId publicStory.text schoolInfo.gradeLevel schoolInfo.province")
    .sort({ "publicStory.consentedAt": -1 })
    .lean();
  const students = await User.find({ _id: { $in: applications.map((a) => a.studentId) } }).select("studentProfile.fullName").lean();
  const nameOf = new Map(students.map((s) => [s._id.toString(), s.studentProfile && s.studentProfile.fullName]));

  return applications.map((application) => ({
    displayName: initials(nameOf.get(application.studentId.toString())),
    gradeLevel: application.schoolInfo ? application.schoolInfo.gradeLevel || null : null,
    province: application.schoolInfo ? application.schoolInfo.province || null : null,
    story: application.publicStory.text,
  }));
};

// ---------- Admin ----------

const adminListConsents = async (query, paging) => {
  const status = query.status || "PENDING";
  if (!["PENDING", "VERIFIED", "REJECTED", "REVOKED"].includes(status)) throw validationError("status is invalid");
  const [items, total] = await Promise.all([
    GuardianConsent.find({ status }).sort({ submittedAt: 1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    GuardianConsent.countDocuments({ status }),
  ]);
  const students = await User.find({ _id: { $in: items.map((c) => c.studentId) } }).select("email studentProfile.fullName studentProfile.dateOfBirth").lean();
  const studentOf = new Map(students.map((s) => [s._id.toString(), s]));
  // The signed form itself is opened through POST /api/files/signed-url, which audits each Admin access
  return paged(
    items.map((consent) => {
      const student = studentOf.get(consent.studentId.toString());
      return {
        ...presentConsent(consent, { admin: true }),
        student: student
          ? { email: student.email, fullName: student.studentProfile && student.studentProfile.fullName, dateOfBirth: student.studentProfile && student.studentProfile.dateOfBirth }
          : null,
      };
    }),
    total,
    paging
  );
};

const adminReviewConsent = async (adminId, consentId, body = {}, decision) => {
  assertId(consentId, "Consent not found", "CONSENT_NOT_FOUND");
  if (decision === "REJECTED" && isBlank(body.reviewNote)) throw validationError("reviewNote is required when rejecting");
  const consent = await GuardianConsent.findOneAndUpdate(
    { _id: consentId, status: "PENDING" },
    { $set: { status: decision, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: body.reviewNote || null } },
    { returnDocument: "after" }
  ).lean();
  if (!consent) throw new AppError("Consent is not pending review", "CONSENT_NOT_PENDING", 409);

  await audit({
    actorAdminId: adminId,
    action: decision === "VERIFIED" ? "GUARDIAN_CONSENT_VERIFIED" : "GUARDIAN_CONSENT_REJECTED",
    targetType: "GuardianConsent",
    targetId: consent._id,
    afterState: { studentId: consent.studentId, campaignId: consent.campaignId, reviewNote: body.reviewNote || null },
  });
  await notify(
    consent.studentId,
    decision === "VERIFIED" ? "Giấy đồng thuận của phụ huynh đã được xác nhận" : "Giấy đồng thuận của phụ huynh bị từ chối",
    decision === "VERIFIED" ? "Bạn có thể nộp hồ sơ học bổng cho chiến dịch này." : body.reviewNote,
    decision === "VERIFIED" ? "GUARDIAN_CONSENT_VERIFIED" : "GUARDIAN_CONSENT_REJECTED"
  );
  return presentConsent(consent, { admin: true });
};

module.exports = {
  isMinor,
  verifyConsent,
  submitConsent,
  listMyConsents,
  revokeConsent,
  setPublicStory,
  listCampaignStories,
  adminListConsents,
  adminReviewConsent,
};
