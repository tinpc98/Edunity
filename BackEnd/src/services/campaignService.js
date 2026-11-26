const mongoose = require("mongoose");
const {
  ScholarshipCampaign,
  ScholarshipFundingReconciliation,
  Scholarship,
  ScholarshipApplication,
  SponsorContribution,
  GuardianConsent,
  RefundCase,
  PaperDossierReceipt,
  Payment,
  PaymentReconciliation,
  Category,
  Subject,
  Course,
} = require("../models");
const { GRADE_LEVELS } = require("../models/constants");
const { AppError } = require("../utils/errors");
const { paged, validationError, parseDate, isBlank } = require("../utils/http");
const { toNum, toDec, parseAmount } = require("../utils/money");
const { audit } = require("./auditService");
const { toPublic } = require("../utils/publicView");
const {
  parseChecklistDefinition,
  parseDossierPolicy,
  resolveScholarshipChecklist,
} = require("./scholarshipDossierGateService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const PUBLIC_STATUSES = ["OPEN_FOR_FUNDING", "CLOSED"];
const DATE_FIELDS = ["fundingStart", "fundingEnd", "applicationStart", "applicationEnd", "resultPublicationDate"];
const TEXT_FIELDS = ["description", "eligibilityCriteria"];
// Once published, the money rules, checklist and the scope Sponsors/Students relied on can no longer change
const LOCKED_AFTER_PUBLISH = [
  "targetBudget",
  "expectedSlots",
  "awardAmountPerStudent",
  "allowSlotExpansion",
  "paperDeliveryGraceDays",
  "entitlementValidityDays",
  "scope",
  "documentChecklist",
  "dossierPolicy",
  "priorityCriteria",
  "fundingStart",
  "fundingEnd",
  "applicationStart",
  "applicationEnd",
];
const SCOPE_MODELS = { categoryIds: Category, subjectIds: Subject, courseIds: Course };
const PRIORITY_SOURCE_FIELDS = [
  "HAS_POVERTY_CERTIFICATE",
  "HARDSHIP_CATEGORY",
  "IS_DISADVANTAGED",
  "GRADE_LEVEL",
  "STUDENT_PROVINCE",
  "STUDENT_COMMUNE",
  "SCHOOL_PROVINCE",
  "SCHOOL_COMMUNE",
  "SCHOOL_NAME",
];
const HARDSHIP_VALUES = ["POOR_HOUSEHOLD", "NEAR_POOR_HOUSEHOLD", "REMOTE_AREA", "ORPHANED"];

const campaignNotFound = () => new AppError("Campaign not found", "CAMPAIGN_NOT_FOUND", 404);

const isWithin = (start, end, now) => (!start || start <= now) && (!end || end >= now);

const getFundingStatus = (campaign, now = new Date()) => {
  if (campaign.status === "DRAFT") return "NOT_STARTED";
  if (campaign.fundingClosed || campaign.status === "CLOSED") return "CLOSED";
  if (campaign.isFundingPaused) return "PAUSED";
  if (campaign.fundingStart && campaign.fundingStart > now) return "NOT_STARTED";
  if (campaign.fundingEnd && campaign.fundingEnd < now) return "CLOSED";
  return "OPEN";
};

const getApplicationStatus = (campaign, now = new Date()) => {
  if (campaign.status === "DRAFT") return "NOT_STARTED";
  if (campaign.applicationClosed || campaign.status === "CLOSED") return "CLOSED";
  if (campaign.isApplicationPaused) return "PAUSED";
  if (campaign.applicationStart && campaign.applicationStart > now) return "NOT_STARTED";
  if (campaign.applicationEnd && campaign.applicationEnd < now) return "CLOSED";
  return "OPEN";
};

// BR-17 / BR-19: funding and application phases are derived from the campaign dates and operational lifecycle flags
const isAcceptingFunding = (campaign, now = new Date()) => {
  if (campaign.status !== "OPEN_FOR_FUNDING") return false;
  if (campaign.fundingClosed || campaign.isFundingPaused) return false;
  return isWithin(campaign.fundingStart, campaign.fundingEnd, now);
};

// Đóng tài trợ không tự động khóa cổng hồ sơ của học sinh khi applicationEnd chưa qua
const isAcceptingApplications = (campaign, now = new Date()) => {
  if (campaign.status !== "OPEN_FOR_FUNDING" && campaign.status !== "CLOSED") return false;
  if (campaign.applicationClosed || campaign.isApplicationPaused) return false;
  return isWithin(campaign.applicationStart, campaign.applicationEnd, now);
};

const present = (campaign) => {
  const source = campaign?.toObject ? campaign.toObject() : campaign;
  const campaignData = { ...source };
  delete campaignData.priorityPolicyHistory;
  delete campaignData.fundingReconciledBy;
  const funded = toNum(campaign.fundedAmount);
  const refunded = toNum(campaign.refundedAmount || 0);
  const approvedPendingRefund = toNum(campaign.approvedPendingRefund || 0);
  const allocated = toNum(campaign.allocatedAmount);
  const used = toNum(campaign.usedAmount || 0);
  const target = toNum(campaign.targetBudget);
  const pending = toNum(campaign.pendingFund || 0);
  const awardAmountPerStudent = toNum(campaign.awardAmountPerStudent);

  // Pillar 1: netEligibleFund = confirmed - refunded - approvedPendingRefund
  // availableFund = netEligibleFund - allocatedAmount (used is a subset of allocated)
  const netEligibleFund = Math.max(0, funded - refunded - approvedPendingRefund);
  const availableFund = Math.max(0, netEligibleFund - allocated);
  const standardSlotValue = awardAmountPerStudent;
  const standardSlotsAvailable = standardSlotValue > 0 ? Math.floor(availableFund / standardSlotValue) : 0;
  const calculatedSlots = standardSlotValue > 0 ? Math.floor(netEligibleFund / standardSlotValue) : 0;
  const projectedSlots = campaign.allowSlotExpansion
    ? calculatedSlots
    : Math.min(calculatedSlots, campaign.expectedSlots || calculatedSlots);
  const unallocatedRemainder = Math.max(0, netEligibleFund - ((campaign.officialSlotCount ?? projectedSlots) * standardSlotValue));
  const subslotRemainder = standardSlotValue > 0 ? netEligibleFund % standardSlotValue : 0;

  return {
    ...campaignData,
    receivedFund: toDec(funded),
    confirmedFund: toDec(funded),
    pendingFund: toDec(pending),
    refundedFund: toDec(refunded),
    approvedPendingRefund: toDec(approvedPendingRefund),
    netEligibleFund: toDec(netEligibleFund),
    allocatedAmount: toDec(allocated),
    usedAmount: toDec(used),
    availableFund: toDec(availableFund), // quỹ còn có thể cấp học bổng mới
    standardSlotValue,
    standardSlotsAvailable,
    projectedSlots,
    unallocatedRemainder: toDec(unallocatedRemainder),
    subslotRemainder: toDec(subslotRemainder),
    officialSlotCount: campaign.officialSlotCount ?? null,
    officialEligibleFunding: campaign.officialEligibleFunding ?? null,
    fundingReconciledAt: campaign.fundingReconciledAt ?? null,
    allowSlotExpansion: campaign.allowSlotExpansion ?? false,
    fundingProgress: target > 0 ? Math.min(Math.round((funded / target) * 10000) / 100, 100) : 0,
    isFundingPaused: Boolean(campaign.isFundingPaused),
    fundingClosed: Boolean(campaign.fundingClosed || campaign.status === "CLOSED"),
    fundingClosedAt: campaign.fundingClosedAt ?? null,
    fundingPauseReason: campaign.fundingPauseReason ?? null,
    isApplicationPaused: Boolean(campaign.isApplicationPaused),
    applicationClosed: Boolean(campaign.applicationClosed || campaign.status === "CLOSED"),
    applicationClosedAt: campaign.applicationClosedAt ?? null,
    applicationPauseReason: campaign.applicationPauseReason ?? null,
    fundingStatus: getFundingStatus(campaign),
    applicationStatus: getApplicationStatus(campaign),
    isAcceptingFunding: isAcceptingFunding(campaign),
    isAcceptingApplications: isAcceptingApplications(campaign),
    lifecycleHistory: campaign.lifecycleHistory || [],
  };
};

const getCampaignOrThrow = async (campaignId) => {
  if (!mongoose.isValidObjectId(campaignId)) throw campaignNotFound();
  const campaign = await ScholarshipCampaign.findOne({ _id: campaignId, ...NOT_DELETED });
  if (!campaign) throw campaignNotFound();
  return campaign;
};

const parseScope = async (scope) => {
  if (scope === null) return { categoryIds: [], subjectIds: [], courseIds: [] };
  if (typeof scope !== "object") throw validationError("scope must be an object");

  const result = {};
  for (const [key, Model] of Object.entries(SCOPE_MODELS)) {
    const ids = scope[key] === undefined ? [] : scope[key];
    if (!Array.isArray(ids) || ids.some((id) => !mongoose.isValidObjectId(id))) {
      throw validationError(`scope.${key} must be an array of ids`);
    }
    const unique = [...new Set(ids.map(String))];
    const found = await Model.countDocuments({ _id: { $in: unique }, ...NOT_DELETED });
    if (found !== unique.length) throw validationError(`scope.${key} contains unknown ids`);
    result[key] = unique;
  }
  return result;
};

const parsePriorityCriteria = (raw) => {
  if (!Array.isArray(raw)) throw validationError("priorityCriteria must be an array");
  const seenCodes = new Set();
  return raw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw validationError(`priorityCriteria[${index}] must be an object`);
    }
    const code = typeof item.code === "string" ? item.code.trim().toUpperCase() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const sourceField = typeof item.sourceField === "string" ? item.sourceField.trim().toUpperCase() : "";
    const matchValue = typeof item.matchValue === "string" ? item.matchValue.trim() : "";
    const points = Number(item.points);
    if (!/^[A-Z0-9_-]{2,40}$/.test(code) || seenCodes.has(code)) {
      throw validationError(`priorityCriteria[${index}].code must be unique and contain 2-40 letters, digits, _ or -`);
    }
    seenCodes.add(code);
    if (!label || label.length > 120) throw validationError(`priorityCriteria[${index}].label is required and must be at most 120 characters`);
    if (!PRIORITY_SOURCE_FIELDS.includes(sourceField)) throw validationError(`priorityCriteria[${index}].sourceField is invalid`);
    if (!matchValue || matchValue.length > 200) throw validationError(`priorityCriteria[${index}].matchValue is required and must be at most 200 characters`);
    if ((sourceField === "HAS_POVERTY_CERTIFICATE" || sourceField === "IS_DISADVANTAGED") && !["true", "false"].includes(matchValue.toLowerCase())) {
      throw validationError(`priorityCriteria[${index}].matchValue must be true or false for ${sourceField}`);
    }
    if (sourceField === "HARDSHIP_CATEGORY" && !HARDSHIP_VALUES.includes(matchValue.toUpperCase())) {
      throw validationError(`priorityCriteria[${index}].matchValue is invalid for HARDSHIP_CATEGORY`);
    }
    if (sourceField === "GRADE_LEVEL" && !GRADE_LEVELS.includes(matchValue.toUpperCase())) {
      throw validationError(`priorityCriteria[${index}].matchValue is invalid for GRADE_LEVEL`);
    }
    if (!Number.isFinite(points) || points < 0) throw validationError(`priorityCriteria[${index}].points must be a non-negative number`);
    const exclusiveGroup = item.exclusiveGroup === undefined || item.exclusiveGroup === null || item.exclusiveGroup === ""
      ? null
      : String(item.exclusiveGroup).trim();
    if (exclusiveGroup && exclusiveGroup.length > 80) throw validationError(`priorityCriteria[${index}].exclusiveGroup must be at most 80 characters`);
    if (item.enabled !== undefined && typeof item.enabled !== "boolean") throw validationError(`priorityCriteria[${index}].enabled must be a boolean`);
    const order = item.order === undefined ? index + 1 : Number(item.order);
    if (!Number.isInteger(order) || order < 1) throw validationError(`priorityCriteria[${index}].order must be an integer >= 1`);
    return { code, label, sourceField, matchValue, points, exclusiveGroup, enabled: item.enabled !== false, order };
  });
};

const applyInput = async (campaign, body, actorId = null) => {
  if (body.title !== undefined) {
    if (isBlank(body.title)) throw validationError("title must not be empty");
    campaign.title = body.title;
  }
  for (const field of TEXT_FIELDS) {
    if (body[field] !== undefined) campaign[field] = body[field];
  }
  if (body.targetBudget !== undefined) campaign.targetBudget = toDec(parseAmount(body.targetBudget, "targetBudget"));
  if (body.awardAmountPerStudent !== undefined) {
    campaign.awardAmountPerStudent = toDec(parseAmount(body.awardAmountPerStudent, "awardAmountPerStudent"));
  }
  if (body.expectedSlots !== undefined) {
    const slots = Number(body.expectedSlots);
    if (!Number.isInteger(slots) || slots < 1) throw validationError("expectedSlots must be an integer >= 1");
    campaign.expectedSlots = slots;
  }
  if (body.allowSlotExpansion !== undefined) {
    if (typeof body.allowSlotExpansion !== "boolean") throw validationError("allowSlotExpansion must be a boolean");
    campaign.allowSlotExpansion = body.allowSlotExpansion;
  }
  if (body.paperDeliveryGraceDays !== undefined) {
    const days = Number(body.paperDeliveryGraceDays);
    if (!Number.isInteger(days) || days < 3 || days > 5) {
      throw validationError("paperDeliveryGraceDays must be an integer between 3 and 5");
    }
    campaign.paperDeliveryGraceDays = days;
  }
  if (body.entitlementValidityDays !== undefined) {
    const days = Number(body.entitlementValidityDays);
    if (!Number.isInteger(days) || days < 30 || days > 730) {
      throw validationError("entitlementValidityDays must be an integer between 30 and 730");
    }
    campaign.entitlementValidityDays = days;
  }
  for (const field of DATE_FIELDS) {
    if (body[field] !== undefined) campaign[field] = parseDate(body[field], field);
  }
  if (body.scope !== undefined) campaign.scope = await parseScope(body.scope);
  if (body.documentChecklist !== undefined) {
    campaign.documentChecklist = parseChecklistDefinition(body.documentChecklist);
  }
  if (body.priorityCriteria !== undefined) {
    const nextCriteria = parsePriorityCriteria(body.priorityCriteria);
    const currentCriteria = (campaign.priorityCriteria || []).map((item) => item.toObject?.() || item);
    const changed = JSON.stringify(currentCriteria) !== JSON.stringify(nextCriteria);
    if (campaign.isNew) {
      campaign.priorityCriteria = nextCriteria;
      campaign.priorityPolicyVersion = nextCriteria.length ? 1 : 0;
      if (nextCriteria.length) {
        campaign.priorityPolicyHistory = [{ version: 1, criteria: nextCriteria, changedBy: actorId, changedAt: new Date() }];
      }
    } else if (changed) {
      const version = (campaign.priorityPolicyVersion || 0) + 1;
      campaign.priorityCriteria = nextCriteria;
      campaign.priorityPolicyVersion = version;
      campaign.priorityPolicyHistory.push({ version, criteria: nextCriteria, changedBy: actorId, changedAt: new Date() });
    }
  }
  if (body.dossierPolicy !== undefined) {
    campaign.dossierPolicy = parseDossierPolicy(body.dossierPolicy, campaign.dossierPolicy);
  }

  // UC-ADM-03: System validate budget, slots và award amount
  const missing = ["title", "targetBudget", "expectedSlots", "awardAmountPerStudent"].filter(
    (field) => campaign[field] === undefined || campaign[field] === null
  );
  if (missing.length) throw validationError("Missing required fields", { missing });
  if (toNum(campaign.awardAmountPerStudent) * campaign.expectedSlots > toNum(campaign.targetBudget)) {
    throw validationError("awardAmountPerStudent x expectedSlots must not exceed targetBudget");
  }
  if (campaign.fundingStart && campaign.fundingEnd && campaign.fundingStart > campaign.fundingEnd) {
    throw validationError("fundingStart must be before fundingEnd");
  }
  if (campaign.applicationStart && campaign.applicationEnd && campaign.applicationStart > campaign.applicationEnd) {
    throw validationError("applicationStart must be before applicationEnd");
  }
  if (
    campaign.timelineMode === "SEQUENTIAL" &&
    campaign.fundingEnd &&
    campaign.applicationStart &&
    campaign.fundingEnd > campaign.applicationStart
  ) {
    throw validationError("Ngày mở nhận hồ sơ phải sau ngày kết thúc gây quỹ (applicationStart must be on or after fundingEnd)");
  }
};

// ---------- Public ----------

const listCampaigns = async (query, paging) => {
  const filter = { ...NOT_DELETED, status: "OPEN_FOR_FUNDING" };
  if (query.status) {
    const statuses = String(query.status).split(",").filter((status) => PUBLIC_STATUSES.includes(status));
    if (!statuses.length) throw validationError(`status must be one of ${PUBLIC_STATUSES.join(", ")}`);
    filter.status = { $in: statuses };
  }
  const [items, total] = await Promise.all([
    ScholarshipCampaign.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    ScholarshipCampaign.countDocuments(filter),
  ]);
  return paged(items.map(present).map(toPublic), total, paging);
};

const withDetail = async (campaign) => {
  const scope = campaign.scope || {};
  const [
    categories,
    subjects,
    courses,
    scholarshipCount,
    contributions,
    pendingContributions,
    unverifiedContributions,
    approvedPendingRefundCases,
  ] = await Promise.all([
    Category.find({ _id: { $in: scope.categoryIds || [] } }).select("name").lean(),
    Subject.find({ _id: { $in: scope.subjectIds || [] } }).select("name slug").lean(),
    Course.find({ _id: { $in: scope.courseIds || [] } }).select("title").lean(),
    Scholarship.countDocuments({ campaignId: campaign._id }),
    SponsorContribution.countDocuments({ campaignId: campaign._id, contributionStatus: { $in: ["COMPLETED", "PARTIALLY_REFUNDED"] } }),
    SponsorContribution.aggregate([
      {
        $match: {
          campaignId: campaign._id,
          contributionStatus: "PENDING",
          provider: { $ne: "SANDBOX" },
          gateway: { $ne: "SANDBOX" },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    SponsorContribution.countDocuments({
      campaignId: campaign._id,
      contributionStatus: { $in: ["COMPLETED", "PARTIALLY_REFUNDED"] },
      provider: { $ne: "SANDBOX" },
      gateway: { $ne: "SANDBOX" },
      orderCode: null,
      paymentReference: null,
    }),
    RefundCase.aggregate([
      {
        $match: {
          relatedContributionId: { $ne: null },
          status: { $in: ["APPROVED", "PENDING_BANK_TRANSFER", "AWAITING_BANK_VERIFICATION"] },
        },
      },
      {
        $lookup: {
          from: "sponsorcontributions",
          localField: "relatedContributionId",
          foreignField: "_id",
          as: "contrib",
        },
      },
      { $unwind: "$contrib" },
      { $match: { "contrib.campaignId": campaign._id } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$approvedAmount", "$eligibleAmount"] } } } },
    ]),
  ]);
  const pendingTotal = pendingContributions[0]?.total ? toNum(pendingContributions[0].total) : 0;
  const approvedPendingRefundTotal = approvedPendingRefundCases[0]?.total ? toNum(approvedPendingRefundCases[0].total) : 0;
  return {
    ...present({ ...campaign, pendingFund: pendingTotal, approvedPendingRefund: approvedPendingRefundTotal }),
    scopeDetail: { categories, subjects, courses },
    awardedScholarshipCount: scholarshipCount,
    contributionCount: contributions,
    unverifiedContributionCount: unverifiedContributions,
  };
};

const maskRecipientName = (rawName) => {
  const parts = String(rawName || "Học viên").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Học viên";
  if (parts.length === 1) return `${parts[0][0]}***`;
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}***`;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middleMasked = parts.slice(1, -1).map((m) => `${m[0]}***`).join(" ");
  return `${first} ${middleMasked} ${last}`;
};

const getPublicCampaignRecipients = async (campaignId, paging) => {
  const campaign = await getCampaignOrThrow(campaignId);
  const now = new Date();

  // If campaign is still DRAFT, results are never public
  if (campaign.status === "DRAFT") {
    throw campaignNotFound();
  }

  // Exclude any applications whose scholarship was REVOKED
  const revokedScholarships = await Scholarship.find({
    campaignId: campaign._id,
    status: "REVOKED",
  }).select("applicationId").lean();
  const revokedAppIds = new Set(revokedScholarships.map((s) => String(s.applicationId)));

  // All approved/granted applications for this campaign (excluding revoked)
  const allApprovedApps = await ScholarshipApplication.find({
    campaignId: campaign._id,
    status: { $in: ["APPROVED", "AWARDED", "IN_USE"] },
  })
    .sort({ reviewedAt: -1, updatedAt: -1 })
    .populate("studentId", "studentProfile")
    .lean();

  const validGrantedApps = allApprovedApps.filter((a) => !revokedAppIds.has(String(a._id)));

  // Load existing scholarships to map allocated amounts if present
  const existingScholarships = await Scholarship.find({
    campaignId: campaign._id,
    status: { $in: ["ACTIVE", "EXHAUSTED", "EXPIRED"] },
  }).select("_id applicationId studentId allocatedAmount validFrom createdAt").lean();

  const scholarshipByAppId = new Map(
    existingScholarships.map((s) => [String(s.applicationId), s])
  );

  const totalGranted = validGrantedApps.length;
  const totalAmountGranted = validGrantedApps.reduce((sum, a) => {
    const sch = scholarshipByAppId.get(String(a._id));
    return sum + (sch ? toNum(sch.allocatedAmount) : toNum(campaign.awardAmountPerStudent));
  }, 0);

  const publicationDate = campaign.resultPublicationDate;
  // If resultPublicationDate is defined and in the future, do not disclose recipients yet
  if (!publicationDate || publicationDate > now) {
    return {
      ...paged([], 0, paging),
      isPublished: false,
      resultPublicationDate: publicationDate || null,
      message: "Kết quả danh sách nhận học bổng chưa đến ngày công bố chính thức.",
      summary: {
        totalGranted,
        totalAmountGranted,
        publicDisclosedCount: 0,
      },
    };
  }

  if (validGrantedApps.length === 0) {
    return {
      ...paged([], 0, paging),
      isPublished: true,
      resultPublicationDate: publicationDate,
      summary: {
        totalGranted: 0,
        totalAmountGranted: 0,
        publicDisclosedCount: 0,
      },
    };
  }

  // Filter applications that have active public consent (not revoked)
  const consentedApps = validGrantedApps.filter((app) => {
    return (
      app.publicConsent &&
      app.publicConsent.consented === true &&
      !app.publicConsent.revokedAt
    );
  });

  // For minors (under 18), require valid guardian consent with public disclosure allowed
  const eligibleApps = [];
  for (const app of consentedApps) {
    const student = app.studentId;
    const dob = student?.studentProfile?.dateOfBirth;
    let isStudentMinor = false;
    if (dob) {
      const birth = new Date(dob);
      const adultDate = new Date(birth);
      adultDate.setFullYear(adultDate.getFullYear() + 18);
      isStudentMinor = adultDate > now;
    } else if (app.consentSnapshot?.guardianUserId || app.guardianInfo) {
      isStudentMinor = true;
    }

    if (isStudentMinor) {
      // Must verify active guardian consent that allows public disclosure and is not revoked
      const activeGuardianConsent = await GuardianConsent.findOne({
        studentId: student?._id,
        campaignId: campaign._id,
        status: "VERIFIED",
        allowPublicStory: true,
        revokedAt: null,
      }).lean();

      if (!activeGuardianConsent) {
        // Exclude minor without active verified guardian consent allowing public disclosure
        continue;
      }
    }

    eligibleApps.push(app);
  }

  const totalPublicDisclosed = eligibleApps.length;
  const pagedApps = eligibleApps.slice(paging.skip, paging.skip + paging.pageSize);

  // STRICT SERVER-SIDE WHITELIST:
  // ONLY safe public fields: id, applicationCode, displayName (masked), schoolName, gradeLevel, province, awardAmount, awardedAt.
  // ABSOLUTELY EXCLUDE: CCCD (even masked), phone, address, documents, review notes, verifier results.
  const sanitized = pagedApps.map((app) => {
    const rawName = (app.studentId && app.studentId.studentProfile && app.studentId.studentProfile.fullName) || "Học viên";
    const sch = scholarshipByAppId.get(String(app._id));
    return {
      id: app._id.toString(),
      applicationCode: app.applicationCode,
      displayName: maskRecipientName(rawName),
      schoolName: app.schoolInfo ? app.schoolInfo.schoolName || null : null,
      gradeLevel: app.schoolInfo ? app.schoolInfo.gradeLevel || null : null,
      province: app.schoolInfo ? app.schoolInfo.province || null : null,
      awardAmount: sch ? toNum(sch.allocatedAmount) : toNum(campaign.awardAmountPerStudent),
      awardedAt: app.reviewedAt || sch?.validFrom || app.updatedAt,
    };
  });

  return {
    ...paged(sanitized, totalPublicDisclosed, paging),
    isPublished: true,
    resultPublicationDate: publicationDate,
    summary: {
      totalGranted,
      totalAmountGranted,
      publicDisclosedCount: totalPublicDisclosed,
    },
  };
};

const getPublicCampaign = async (campaignId) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (!PUBLIC_STATUSES.includes(campaign.status)) throw campaignNotFound(); // DRAFT is never public
  return toPublic(await withDetail(campaign.toObject()));
};

// ---------- Admin (BR-16: Scholarship Campaign chỉ do Admin tạo) ----------

const adminListCampaigns = async (query, paging) => {
  const filter = { ...NOT_DELETED };
  if (query.status) filter.status = { $in: String(query.status).split(",") };
  const [items, total] = await Promise.all([
    ScholarshipCampaign.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    ScholarshipCampaign.countDocuments(filter),
  ]);
  return paged(items.map(present), total, paging);
};

const adminGetCampaign = async (campaignId) => withDetail((await getCampaignOrThrow(campaignId)).toObject());

const createCampaign = async (adminId, body) => {
  const campaign = new ScholarshipCampaign({ createdBy: adminId, status: "DRAFT" });
  await applyInput(campaign, body, adminId);
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_CREATED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    afterState: { status: "DRAFT", title: campaign.title },
  });
  return present(campaign.toObject());
};

const updateCampaign = async (adminId, campaignId, body) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status === "CLOSED") {
    throw new AppError("A closed campaign cannot be updated", "CAMPAIGN_CLOSED", 409);
  }
  if (campaign.status !== "DRAFT") {
    const locked = LOCKED_AFTER_PUBLISH.filter((field) => body[field] !== undefined);
    if (locked.length) {
      throw Object.assign(new AppError("These fields cannot be changed after the campaign is published", "CAMPAIGN_FIELD_LOCKED", 409), {
        details: { fields: locked },
      });
    }
  }

  const before = { title: campaign.title, status: campaign.status };
  await applyInput(campaign, body, adminId);
  campaign.updatedBy = adminId;
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_UPDATED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: { title: campaign.title, status: campaign.status },
  });
  return present(campaign.toObject());
};

const changeStatus = async (adminId, campaignId, from, to, action) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== from) {
    throw new AppError(`Campaign must be ${from} to perform this action`, "INVALID_CAMPAIGN_STATUS", 409);
  }
  if (to === "OPEN_FOR_FUNDING") {
    const missing = [];
    const requiredPublishDates = ["fundingStart", "fundingEnd", "applicationStart", "applicationEnd"];
    for (const f of requiredPublishDates) {
      if (!campaign[f]) missing.push(f);
    }
    if (!campaign.eligibilityCriteria || String(campaign.eligibilityCriteria).trim().length === 0) {
      missing.push("eligibilityCriteria");
    }
    if (missing.length) {
      throw validationError("Cần hoàn thiện đầy đủ các mục cấu hình bắt buộc trước khi kích hoạt chiến dịch", { missing });
    }
    if (campaign.fundingStart && campaign.fundingEnd && campaign.fundingStart > campaign.fundingEnd) {
      throw validationError("fundingStart must be before fundingEnd");
    }
    if (campaign.applicationStart && campaign.applicationEnd && campaign.applicationStart > campaign.applicationEnd) {
      throw validationError("applicationStart must be before applicationEnd");
    }
    if (
      campaign.timelineMode === "SEQUENTIAL" &&
      campaign.fundingEnd &&
      campaign.applicationStart &&
      campaign.fundingEnd > campaign.applicationStart
    ) {
      throw validationError("Ngày mở nhận hồ sơ phải sau ngày kết thúc gây quỹ");
    }
    if (campaign.resultPublicationDate && campaign.applicationEnd && campaign.resultPublicationDate < campaign.applicationEnd) {
      throw validationError("resultPublicationDate must be on or after applicationEnd");
    }
  }

  campaign.status = to;
  campaign.updatedBy = adminId;
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action,
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: { status: from },
    afterState: { status: to },
  });
  return present(campaign.toObject());
};

// UC-ADM-03: Publish → Campaign = OPEN_FOR_FUNDING
const publishCampaign = async (adminId, campaignId) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status === "OPEN_FOR_FUNDING") return present(campaign.toObject());
  return changeStatus(adminId, campaignId, "DRAFT", "OPEN_FOR_FUNDING", "CAMPAIGN_PUBLISHED");
};

const deleteDraftCampaign = async (adminId, campaignId) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "DRAFT") {
    throw new AppError(
      "Chỉ có thể xóa chiến dịch ở trạng thái Nháp (DRAFT)",
      "CAMPAIGN_NOT_DRAFT",
      409
    );
  }

  let session = null;
  if (typeof mongoose.startSession === "function") {
    try {
      session = await mongoose.startSession();
    } catch {
      session = null;
    }
  }

  const executeDelete = async (activeSession) => {
    const opts = activeSession ? { session: activeSession } : {};

    // 1. Kiểm tra trạng thái chiến dịch ngay trong session chống race condition với publish
    const current = await ScholarshipCampaign.findOne(
      { _id: campaign._id, ...NOT_DELETED },
      null,
      opts
    );

    if (!current || current.status !== "DRAFT") {
      throw new AppError(
        "Chỉ có thể xóa chiến dịch ở trạng thái Nháp (DRAFT)",
        "CAMPAIGN_NOT_DRAFT",
        409
      );
    }

    // 2. Kiểm tra toàn diện mọi dữ liệu liên kết: thanh toán, tài trợ, hoàn tiền, hồ sơ, giấy tờ
    const [
      appCount,
      contribCount,
      paymentCount,
      paymentReconCount,
      scholarshipCount,
      reconCount,
      paperReceiptCount,
      guardianConsentCount,
      refundCount,
    ] = await Promise.all([
      ScholarshipApplication.countDocuments({ campaignId: campaign._id }, opts),
      SponsorContribution.countDocuments({ campaignId: campaign._id }, opts),
      Payment.countDocuments({ campaignId: campaign._id }, opts),
      PaymentReconciliation.countDocuments({ campaignId: campaign._id }, opts),
      Scholarship.countDocuments({ campaignId: campaign._id }, opts),
      ScholarshipFundingReconciliation.countDocuments({ campaignId: campaign._id }, opts),
      PaperDossierReceipt.countDocuments({ campaignId: campaign._id }, opts),
      GuardianConsent.countDocuments({ campaignId: campaign._id }, opts),
      RefundCase.countDocuments({
        $or: [
          { "metadata.campaignId": campaign._id },
          { reason: "CAMPAIGN_CLOSED" },
        ],
      }, opts),
    ]);

    const linkedData = [];
    if (appCount > 0) linkedData.push(`${appCount} hồ sơ xin học bổng`);
    if (contribCount > 0) linkedData.push(`${contribCount} khoản tài trợ`);
    if (paymentCount > 0) linkedData.push(`${paymentCount} đơn thanh toán / payment intent`);
    if (paymentReconCount > 0) linkedData.push(`${paymentReconCount} biên bản đối soát cổng thanh toán`);
    if (scholarshipCount > 0) linkedData.push(`${scholarshipCount} học bổng`);
    if (reconCount > 0) linkedData.push(`${reconCount} biên bản đối soát tài chính`);
    if (paperReceiptCount > 0) linkedData.push(`${paperReceiptCount} biên nhận hồ sơ giấy`);
    if (guardianConsentCount > 0) linkedData.push(`${guardianConsentCount} đơn đồng thuận phụ huynh`);
    if (refundCount > 0) linkedData.push(`${refundCount} hồ sơ hoàn tiền`);

    if (linkedData.length > 0) {
      throw Object.assign(
        new AppError(
          `Chiến dịch đã phát sinh dữ liệu liên kết (${linkedData.join(", ")}), không thể xóa.`,
          "CAMPAIGN_HAS_LINKED_DATA",
          409
        ),
        {
          details: {
            linkedData,
            counts: {
              appCount,
              contribCount,
              paymentCount,
              paymentReconCount,
              scholarshipCount,
              reconCount,
              paperReceiptCount,
              guardianConsentCount,
              refundCount,
            },
          },
        }
      );
    }

    // 3. Khóa CAS nguyên tử: đảm bảo chiến dịch vẫn DRAFT và chưa bị xóa bởi tiến trình khác
    const before = { title: current.title, status: current.status };
    const updated = await ScholarshipCampaign.findOneAndUpdate(
      { _id: current._id, status: "DRAFT", isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: adminId,
          deleteReason: "DRAFT_DELETED_BY_ADMIN",
        },
        $push: {
          lifecycleHistory: {
            action: "CAMPAIGN_DELETED",
            performedBy: adminId,
            timestamp: new Date(),
            note: "Xóa chiến dịch nháp",
            previousState: before,
            newState: { isDeleted: true },
          },
        },
      },
      { ...opts, new: true }
    );

    if (!updated) {
      throw new AppError(
        "Trạng thái chiến dịch đã thay đổi hoặc đang được xử lý đồng thời, không thể xóa.",
        "CONFLICT",
        409
      );
    }

    await audit(
      {
        actorAdminId: adminId,
        action: "CAMPAIGN_DELETED",
        targetType: "ScholarshipCampaign",
        targetId: current._id,
        beforeState: before,
        afterState: { isDeleted: true },
      },
      activeSession
    );

    return { success: true, message: "Đã xóa chiến dịch nháp thành công", campaignId: current._id };
  };

  try {
    if (session) {
      let result;
      await session.withTransaction(async () => {
        result = await executeDelete(session);
      });
      return result;
    }
    return await executeDelete(null);
  } finally {
    if (session) await session.endSession();
  }
};

// Quản lý gây quỹ độc lập
const pauseFunding = async (adminId, campaignId, note = "") => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "OPEN_FOR_FUNDING") {
    throw new AppError("Chỉ có thể tạm dừng gây quỹ khi chiến dịch đang hoạt động", "INVALID_CAMPAIGN_STATUS", 409);
  }
  if (campaign.fundingClosed) {
    throw new AppError("Chiến dịch đã đóng gây quỹ chính thức, không thể tạm dừng", "FUNDING_ALREADY_CLOSED", 409);
  }
  const before = { isFundingPaused: campaign.isFundingPaused, fundingStatus: getFundingStatus(campaign) };
  campaign.isFundingPaused = true;
  campaign.fundingPauseReason = note || "Tạm dừng gây quỹ theo yêu cầu quản trị viên";
  campaign.updatedBy = adminId;
  if (!campaign.lifecycleHistory) campaign.lifecycleHistory = [];
  campaign.lifecycleHistory.push({
    action: "CAMPAIGN_FUNDING_PAUSED",
    performedBy: adminId,
    timestamp: new Date(),
    note: campaign.fundingPauseReason,
    previousState: before,
    newState: { isFundingPaused: true, fundingStatus: "PAUSED" },
  });
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_FUNDING_PAUSED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: { isFundingPaused: true },
  });

  return present(campaign.toObject());
};

const resumeFunding = async (adminId, campaignId, body = {}) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "OPEN_FOR_FUNDING") {
    if (campaign.status === "CLOSED") {
      throw new AppError(
        "Chiến dịch đang ở trạng thái KẾT THÚC TOÀN DIỆN (CLOSED). Vui lòng sử dụng tính năng 'Khôi phục chiến dịch' (reopenCampaign) để mở lại chiến dịch trước khi tiếp tục gây quỹ.",
        "CAMPAIGN_CLOSED",
        409
      );
    }
    throw new AppError("Chỉ có thể mở lại gây quỹ khi chiến dịch đang hoạt động", "INVALID_CAMPAIGN_STATUS", 409);
  }
  const now = new Date();
  if (body.newFundingEnd) {
    const newEnd = parseDate(body.newFundingEnd, "newFundingEnd");
    if (newEnd <= now) {
      throw validationError("Thời hạn gây quỹ mới phải sau thời điểm hiện tại");
    }
    if (campaign.fundingStart && newEnd <= campaign.fundingStart) {
      throw validationError("Thời hạn gây quỹ mới phải sau ngày bắt đầu gây quỹ");
    }
    if (campaign.timelineMode === "SEQUENTIAL" && campaign.applicationStart && newEnd > campaign.applicationStart) {
      throw validationError("Thời hạn gây quỹ mới không được vượt quá ngày bắt đầu nhận hồ sơ");
    }
    campaign.fundingEnd = newEnd;
  } else if (campaign.fundingEnd && campaign.fundingEnd <= now) {
    throw new AppError(
      "Thời hạn gây quỹ đã kết thúc. Vui lòng cung cấp thời hạn mới (newFundingEnd) để tiếp tục gây quỹ.",
      "FUNDING_WINDOW_EXPIRED",
      400
    );
  }

  const before = {
    isFundingPaused: campaign.isFundingPaused,
    fundingClosed: campaign.fundingClosed,
    fundingEnd: campaign.fundingEnd,
  };
  campaign.isFundingPaused = false;
  campaign.fundingPauseReason = null;
  campaign.fundingClosed = false;
  campaign.fundingClosedAt = null;
  campaign.updatedBy = adminId;
  if (!campaign.lifecycleHistory) campaign.lifecycleHistory = [];
  campaign.lifecycleHistory.push({
    action: "CAMPAIGN_FUNDING_RESUMED",
    performedBy: adminId,
    timestamp: now,
    note: body.note || "Mở lại gây quỹ",
    previousState: before,
    newState: { isFundingPaused: false, fundingClosed: false, fundingEnd: campaign.fundingEnd },
  });
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_FUNDING_RESUMED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: { isFundingPaused: false, fundingClosed: false, fundingEnd: campaign.fundingEnd },
  });

  return present(campaign.toObject());
};

const closeFunding = async (adminId, campaignId, note = "") => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "OPEN_FOR_FUNDING") {
    throw new AppError("Chỉ có thể đóng gây quỹ khi chiến dịch đang hoạt động", "INVALID_CAMPAIGN_STATUS", 409);
  }
  const before = { fundingClosed: campaign.fundingClosed, isFundingPaused: campaign.isFundingPaused };
  const now = new Date();
  campaign.fundingClosed = true;
  campaign.fundingClosedAt = now;
  campaign.isFundingPaused = false;
  campaign.updatedBy = adminId;
  if (!campaign.lifecycleHistory) campaign.lifecycleHistory = [];
  campaign.lifecycleHistory.push({
    action: "CAMPAIGN_FUNDING_CLOSED",
    performedBy: adminId,
    timestamp: now,
    note: note || "Đóng gây quỹ chính thức",
    previousState: before,
    newState: { fundingClosed: true, fundingClosedAt: now },
  });
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_FUNDING_CLOSED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: { fundingClosed: true, fundingClosedAt: now },
  });

  return present(campaign.toObject());
};

const reopenFunding = (adminId, campaignId, body = {}) => resumeFunding(adminId, campaignId, body);

// Quản lý nhận hồ sơ độc lập
const pauseApplications = async (adminId, campaignId, note = "") => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "OPEN_FOR_FUNDING" && campaign.status !== "CLOSED") {
    throw new AppError("Chỉ có thể tạm dừng tiếp nhận hồ sơ trên chiến dịch đã phát hành", "INVALID_CAMPAIGN_STATUS", 409);
  }
  if (campaign.applicationClosed) {
    throw new AppError("Chiến dịch đã đóng cổng tiếp nhận hồ sơ chính thức, không thể tạm dừng", "APPLICATION_ALREADY_CLOSED", 409);
  }
  const before = { isApplicationPaused: campaign.isApplicationPaused };
  campaign.isApplicationPaused = true;
  campaign.applicationPauseReason = note || "Tạm dừng tiếp nhận hồ sơ theo yêu cầu quản trị viên";
  campaign.updatedBy = adminId;
  if (!campaign.lifecycleHistory) campaign.lifecycleHistory = [];
  campaign.lifecycleHistory.push({
    action: "CAMPAIGN_APPLICATIONS_PAUSED",
    performedBy: adminId,
    timestamp: new Date(),
    note: campaign.applicationPauseReason,
    previousState: before,
    newState: { isApplicationPaused: true },
  });
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_APPLICATIONS_PAUSED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: { isApplicationPaused: true },
  });

  return present(campaign.toObject());
};

const resumeApplications = async (adminId, campaignId, body = {}) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "OPEN_FOR_FUNDING" && campaign.status !== "CLOSED") {
    throw new AppError("Chỉ có thể mở lại tiếp nhận hồ sơ trên chiến dịch đã phát hành", "INVALID_CAMPAIGN_STATUS", 409);
  }
  const now = new Date();
  if (body.newApplicationEnd) {
    const newEnd = parseDate(body.newApplicationEnd, "newApplicationEnd");
    if (newEnd <= now) {
      throw validationError("Thời hạn nhận hồ sơ mới phải sau thời điểm hiện tại");
    }
    if (campaign.applicationStart && newEnd <= campaign.applicationStart) {
      throw validationError("Thời hạn nhận hồ sơ mới phải sau ngày bắt đầu nhận hồ sơ");
    }
    if (campaign.timelineMode === "SEQUENTIAL" && campaign.fundingEnd && newEnd <= campaign.fundingEnd) {
      throw validationError("Thời hạn nhận hồ sơ mới phải sau ngày kết thúc gây quỹ");
    }
    campaign.applicationEnd = newEnd;
  } else if (campaign.applicationEnd && campaign.applicationEnd <= now) {
    throw new AppError(
      "Thời hạn nhận hồ sơ đã kết thúc. Vui lòng cung cấp thời hạn mới (newApplicationEnd) để tiếp tục nhận hồ sơ.",
      "APPLICATION_WINDOW_EXPIRED",
      400
    );
  }

  const before = {
    isApplicationPaused: campaign.isApplicationPaused,
    applicationClosed: campaign.applicationClosed,
    applicationEnd: campaign.applicationEnd,
  };
  campaign.isApplicationPaused = false;
  campaign.applicationPauseReason = null;
  campaign.applicationClosed = false;
  campaign.applicationClosedAt = null;
  campaign.updatedBy = adminId;
  if (!campaign.lifecycleHistory) campaign.lifecycleHistory = [];
  campaign.lifecycleHistory.push({
    action: "CAMPAIGN_APPLICATIONS_RESUMED",
    performedBy: adminId,
    timestamp: now,
    note: body.note || "Mở lại tiếp nhận hồ sơ",
    previousState: before,
    newState: { isApplicationPaused: false, applicationClosed: false, applicationEnd: campaign.applicationEnd },
  });
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_APPLICATIONS_RESUMED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: { isApplicationPaused: false, applicationClosed: false, applicationEnd: campaign.applicationEnd },
  });

  return present(campaign.toObject());
};

const closeApplications = async (adminId, campaignId, note = "") => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "OPEN_FOR_FUNDING" && campaign.status !== "CLOSED") {
    throw new AppError("Chỉ có thể đóng tiếp nhận hồ sơ trên chiến dịch đã phát hành", "INVALID_CAMPAIGN_STATUS", 409);
  }
  const before = { applicationClosed: campaign.applicationClosed, isApplicationPaused: campaign.isApplicationPaused };
  const now = new Date();
  campaign.applicationClosed = true;
  campaign.applicationClosedAt = now;
  campaign.isApplicationPaused = false;
  campaign.updatedBy = adminId;
  if (!campaign.lifecycleHistory) campaign.lifecycleHistory = [];
  campaign.lifecycleHistory.push({
    action: "CAMPAIGN_APPLICATIONS_CLOSED",
    performedBy: adminId,
    timestamp: now,
    note: note || "Đóng tiếp nhận hồ sơ chính thức",
    previousState: before,
    newState: { applicationClosed: true, applicationClosedAt: now },
  });
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_APPLICATIONS_CLOSED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: { applicationClosed: true, applicationClosedAt: now },
  });

  return present(campaign.toObject());
};

const closeCampaign = async (adminId, campaignId, note = "") => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "OPEN_FOR_FUNDING") {
    throw new AppError("Chỉ có thể đóng chiến dịch khi đang ở trạng thái OPEN_FOR_FUNDING", "INVALID_CAMPAIGN_STATUS", 409);
  }
  const before = {
    status: campaign.status,
    fundingClosed: campaign.fundingClosed,
    applicationClosed: campaign.applicationClosed,
  };
  const now = new Date();
  campaign.status = "CLOSED";
  campaign.fundingClosed = true;
  campaign.fundingClosedAt = campaign.fundingClosedAt || now;
  campaign.applicationClosed = true;
  campaign.applicationClosedAt = campaign.applicationClosedAt || now;
  campaign.updatedBy = adminId;
  if (!campaign.lifecycleHistory) campaign.lifecycleHistory = [];
  campaign.lifecycleHistory.push({
    action: "CAMPAIGN_CLOSED",
    performedBy: adminId,
    timestamp: now,
    note: note || "Đóng chiến dịch chính thức",
    previousState: before,
    newState: { status: "CLOSED", fundingClosed: true, applicationClosed: true },
  });
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_CLOSED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: { status: "CLOSED", fundingClosed: true, applicationClosed: true },
  });

  return present(campaign.toObject());
};

const reopenCampaign = async (adminId, campaignId, body = {}) => {
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 8) {
    throw validationError("Lý do khôi phục chiến dịch phải có ít nhất 8 ký tự", { field: "reason" });
  }

  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status !== "CLOSED") {
    throw new AppError("Chỉ có thể khôi phục chiến dịch đang ở trạng thái CLOSED", "INVALID_CAMPAIGN_STATUS", 409);
  }

  // Nếu chiến dịch đã hoàn tất đối soát tài chính chính thức, cần xác nhận rõ ràng
  if (campaign.fundingReconciledAt && !body.confirmReopenReconciled) {
    throw Object.assign(
      new AppError(
        "Chiến dịch này đã hoàn tất đối soát tài chính chính thức. Khôi phục lại chiến dịch có thể làm thay đổi số liệu kế toán. Vui lòng xác nhận (confirmReopenReconciled: true) nếu bạn thực sự muốn khôi phục.",
        "CAMPAIGN_ALREADY_RECONCILED",
        409
      ),
      { details: { fundingReconciledAt: campaign.fundingReconciledAt } }
    );
  }

  const now = new Date();
  const before = {
    status: campaign.status,
    fundingClosed: campaign.fundingClosed,
    applicationClosed: campaign.applicationClosed,
    fundingEnd: campaign.fundingEnd,
    applicationEnd: campaign.applicationEnd,
  };

  // Cập nhật ngày kết thúc gây quỹ nếu được truyền vào
  if (body.newFundingEnd) {
    const newEnd = parseDate(body.newFundingEnd, "newFundingEnd");
    if (newEnd <= now) throw validationError("Thời hạn gây quỹ mới phải sau thời điểm hiện tại");
    campaign.fundingEnd = newEnd;
    campaign.fundingClosed = false;
    campaign.fundingClosedAt = null;
  } else if (body.reopenFunding) {
    if (campaign.fundingEnd && campaign.fundingEnd <= now) {
      throw validationError("Thời hạn gây quỹ cũ đã qua. Vui lòng cung cấp newFundingEnd để mở lại gây quỹ.");
    }
    campaign.fundingClosed = false;
    campaign.fundingClosedAt = null;
  }

  // Cập nhật ngày kết thúc nhận hồ sơ nếu được truyền vào
  if (body.newApplicationEnd) {
    const newEnd = parseDate(body.newApplicationEnd, "newApplicationEnd");
    if (newEnd <= now) throw validationError("Thời hạn nhận hồ sơ mới phải sau thời điểm hiện tại");
    campaign.applicationEnd = newEnd;
    campaign.applicationClosed = false;
    campaign.applicationClosedAt = null;
  } else if (body.reopenApplications) {
    if (campaign.applicationEnd && campaign.applicationEnd <= now) {
      throw validationError("Thời hạn nhận hồ sơ cũ đã qua. Vui lòng cung cấp newApplicationEnd để mở lại nhận hồ sơ.");
    }
    campaign.applicationClosed = false;
    campaign.applicationClosedAt = null;
  }

  if (
    campaign.timelineMode === "SEQUENTIAL" &&
    campaign.fundingEnd &&
    campaign.applicationStart &&
    campaign.fundingEnd > campaign.applicationStart
  ) {
    throw validationError("Thời gian mở nhận hồ sơ phải sau ngày kết thúc gây quỹ");
  }

  campaign.status = "OPEN_FOR_FUNDING";
  campaign.updatedBy = adminId;
  if (!campaign.lifecycleHistory) campaign.lifecycleHistory = [];
  campaign.lifecycleHistory.push({
    action: "CAMPAIGN_REOPENED",
    performedBy: adminId,
    timestamp: now,
    note: reason,
    previousState: before,
    newState: {
      status: "OPEN_FOR_FUNDING",
      fundingClosed: campaign.fundingClosed,
      applicationClosed: campaign.applicationClosed,
      fundingEnd: campaign.fundingEnd,
      applicationEnd: campaign.applicationEnd,
    },
  });

  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_REOPENED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: before,
    afterState: {
      status: "OPEN_FOR_FUNDING",
      reason,
      fundingClosed: campaign.fundingClosed,
      applicationClosed: campaign.applicationClosed,
    },
  });

  return present(campaign.toObject());
};

const reconcileCampaignFunding = async (adminId, campaignId, body = {}) => {
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 8 || reason.length > 1000) {
    throw validationError("reason must be between 8 and 1000 characters");
  }
  const session = await mongoose.startSession();
  let reconciliation;
  try {
    await session.withTransaction(async () => {
      const campaign = await getCampaignOrThrow(campaignId);
      if (campaign.status !== "OPEN_FOR_FUNDING" && campaign.status !== "CLOSED") {
        throw new AppError("Only a published campaign can be reconciled", "INVALID_CAMPAIGN_STATUS", 409);
      }
      if (campaign.status !== "CLOSED" && campaign.fundingEnd && campaign.fundingEnd > new Date()) {
        throw new AppError("The fundraising period has not ended", "FUNDING_WINDOW_OPEN", 409);
      }

      // Auto-expire pending contributions whose payment window has lapsed
      await SponsorContribution.updateMany(
        {
          campaignId: campaign._id,
          contributionStatus: "PENDING",
          expiredAt: { $ne: null, $lt: new Date() },
        },
        {
          $set: {
            contributionStatus: "FAILED",
            providerStatus: "EXPIRED",
          },
        },
        { session }
      );

      const unverifiedCount = await SponsorContribution.countDocuments({
        campaignId: campaign._id,
        contributionStatus: { $in: ["COMPLETED", "PARTIALLY_REFUNDED"] },
        provider: { $ne: "SANDBOX" },
        gateway: { $ne: "SANDBOX" },
        orderCode: null,
        paymentReference: null,
      }).session(session);
      if (unverifiedCount > 0) {
        throw new AppError(
          `Chiến dịch có ${unverifiedCount} khoản tài trợ chưa đủ căn cứ hạch toán (thiếu orderCode và paymentReference). Vui lòng đưa vào danh sách đối soát thủ công.`,
          "UNVERIFIED_CONTRIBUTIONS_EXIST",
          409
        );
      }

      const eligibleRows = await SponsorContribution.aggregate([
          {
            $match: {
              campaignId: campaign._id,
              contributionStatus: { $in: ["COMPLETED", "PARTIALLY_REFUNDED"] },
              provider: { $ne: "SANDBOX" },
              gateway: { $ne: "SANDBOX" },
            },
          },
          { $group: { _id: null, total: { $sum: { $subtract: ["$amount", { $ifNull: ["$refundedAmount", 0] }] } } } },
        ]).session(session);
      const pendingRows = await SponsorContribution.aggregate([
          {
            $match: {
              campaignId: campaign._id,
              contributionStatus: "PENDING",
              provider: { $ne: "SANDBOX" },
              gateway: { $ne: "SANDBOX" },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).session(session);
      const eligibleCount = await SponsorContribution.countDocuments({
        campaignId: campaign._id,
        contributionStatus: { $in: ["COMPLETED", "PARTIALLY_REFUNDED"] },
        provider: { $ne: "SANDBOX" },
        gateway: { $ne: "SANDBOX" },
      }).session(session);
      const issuedCount = await Scholarship.countDocuments({ campaignId: campaign._id }).session(session);
      const previous = await ScholarshipFundingReconciliation.findOne({ campaignId: campaign._id })
        .sort({ reconciledAt: -1 })
        .session(session);

      const approvedPendingRefundCases = await RefundCase.aggregate([
        {
          $match: {
            relatedContributionId: { $ne: null },
            status: { $in: ["APPROVED", "PENDING_BANK_TRANSFER", "AWAITING_BANK_VERIFICATION"] },
          },
        },
        {
          $lookup: {
            from: "sponsorcontributions",
            localField: "relatedContributionId",
            foreignField: "_id",
            as: "contrib",
          },
        },
        { $unwind: "$contrib" },
        { $match: { "contrib.campaignId": campaign._id } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$approvedAmount", "$eligibleAmount"] } } } },
      ]).session(session);

      const approvedRefundPendingTotal = Math.max(0, toNum(approvedPendingRefundCases[0]?.total || 0));
      const completedContribNet = Math.max(0, toNum(eligibleRows[0]?.total || 0));
      const eligible = Math.max(0, completedContribNet - approvedRefundPendingTotal);
      const pending = Math.max(0, toNum(pendingRows[0]?.total || 0));
      if (pending > 0) {
        throw new AppError(
          "Chiến dịch còn khoản tài trợ đang chờ ghi nhận hoặc đối soát. Vui lòng xử lý trước khi chốt số suất.",
          "PENDING_CONTRIBUTIONS_EXIST",
          409
        );
      }
      const perStudent = toNum(campaign.awardAmountPerStudent);
      if (!(perStudent > 0)) throw validationError("awardAmountPerStudent must be greater than zero");
      const computedSlots = Math.floor(eligible / perStudent);
      const officialSlots = campaign.allowSlotExpansion
        ? computedSlots
        : Math.min(computedSlots, campaign.expectedSlots);
      if (officialSlots < issuedCount) {
        throw new AppError("Reconciled funding does not cover scholarships already issued", "RECONCILIATION_BELOW_ISSUED_AWARDS", 409);
      }
      const remainder = Math.max(0, eligible - officialSlots * perStudent);
      const now = new Date();
      [reconciliation] = await ScholarshipFundingReconciliation.create(
        [{
          campaignId: campaign._id,
          reconciledBy: adminId,
          eligibleFunding: toDec(eligible),
          refundedFunding: toDec(Math.max(0, toNum(campaign.refundedAmount || 0))),
          approvedRefundFunding: toDec(approvedRefundPendingTotal),
          pendingFunding: toDec(pending),
          officialSlots,
          unusedRemainder: toDec(remainder),
          eligibleContributionCount: eligibleCount,
          reason,
          supersedesId: previous?._id || null,
          reconciledAt: now,
        }],
        { session }
      );

      const before = {
        officialEligibleFunding: campaign.officialEligibleFunding,
        officialSlotCount: campaign.officialSlotCount,
        fundingReconciledAt: campaign.fundingReconciledAt,
      };
      campaign.officialEligibleFunding = toDec(eligible);
      campaign.officialSlotCount = officialSlots;
      campaign.fundingReconciledAt = now;
      campaign.fundingReconciledBy = adminId;
      campaign.fundedAmount = toDec(eligible + toNum(campaign.refundedAmount || 0));
      await campaign.save({ session });
      await audit({
        actorAdminId: adminId,
        action: "CAMPAIGN_FUNDING_RECONCILED",
        targetType: "ScholarshipCampaign",
        targetId: campaign._id,
        beforeState: before,
        afterState: { officialEligibleFunding: toDec(eligible), officialSlotCount: officialSlots, reconciliationId: reconciliation._id, reason },
      }, session);
    });
  } finally {
    await session.endSession();
  }
  return { ...reconciliation.toObject(), campaign: present(await getCampaignOrThrow(campaignId).then((c) => c.toObject())) };
};

const getCampaignChecklist = async (campaignId, viewerRole) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (viewerRole !== "ADMIN" && !PUBLIC_STATUSES.includes(campaign.status)) {
    throw campaignNotFound();
  }
  return {
    campaignId: campaign._id.toString(),
    title: campaign.title,
    status: campaign.status,
    documentChecklist: resolveScholarshipChecklist(campaign),
    dossierPolicy: campaign.dossierPolicy || {
      requireGuardianInfo: false,
      requireSchoolInfo: false,
      allowPaperDossier: true,
      allowDraftSave: true,
      requireGuardianConsentForMinor: false,
    },
  };
};

const updateCampaignChecklist = async (adminId, campaignId, body) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (campaign.status === "CLOSED") {
    throw new AppError("A closed campaign cannot be updated", "CAMPAIGN_CLOSED", 409);
  }
  if (campaign.status !== "DRAFT") {
    throw Object.assign(
      new AppError("Checklist and dossier policy cannot be changed after the campaign is published", "CAMPAIGN_FIELD_LOCKED", 409),
      { details: { fields: ["documentChecklist", "dossierPolicy"] } }
    );
  }

  if (body.documentChecklist === undefined && body.dossierPolicy === undefined) {
    throw validationError("documentChecklist or dossierPolicy is required");
  }

  const beforeChecklistCount = Array.isArray(campaign.documentChecklist) ? campaign.documentChecklist.length : 0;
  if (body.documentChecklist !== undefined) {
    campaign.documentChecklist = parseChecklistDefinition(body.documentChecklist);
  }
  if (body.dossierPolicy !== undefined) {
    campaign.dossierPolicy = parseDossierPolicy(body.dossierPolicy, campaign.dossierPolicy);
  }
  campaign.updatedBy = adminId;
  await campaign.save();

  await audit({
    actorAdminId: adminId,
    action: "CAMPAIGN_CHECKLIST_UPDATED",
    targetType: "ScholarshipCampaign",
    targetId: campaign._id,
    beforeState: { checklistCount: beforeChecklistCount },
    afterState: {
      checklistCount: campaign.documentChecklist.length,
      dossierPolicy: campaign.dossierPolicy,
    },
  });

  return getCampaignChecklist(campaign._id, "ADMIN");
};

module.exports = {
  getCampaignOrThrow,
  isAcceptingFunding,
  isAcceptingApplications,
  getFundingStatus,
  getApplicationStatus,
  present,
  listCampaigns,
  getPublicCampaign,
  getCampaignChecklist,
  updateCampaignChecklist,
  adminListCampaigns,
  adminGetCampaign,
  createCampaign,
  updateCampaign,
  deleteDraftCampaign,
  publishCampaign,
  closeCampaign,
  pauseFunding,
  resumeFunding,
  reopenFunding,
  closeFunding,
  pauseApplications,
  resumeApplications,
  closeApplications,
  reopenCampaign,
  reconcileCampaignFunding,
  getPublicCampaignRecipients,
};
