const mongoose = require("mongoose");
const { ScholarshipCampaign, Scholarship, SponsorContribution, Category, Subject, Course } = require("../models");
const { AppError } = require("../utils/errors");
const { paged, validationError, parseDate, isBlank } = require("../utils/http");
const { toNum, toDec, parseAmount } = require("../utils/money");
const { audit } = require("./auditService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const PUBLIC_STATUSES = ["OPEN_FOR_FUNDING", "CLOSED"];
const DATE_FIELDS = ["fundingStart", "fundingEnd", "applicationStart", "applicationEnd"];
const TEXT_FIELDS = ["description", "eligibilityCriteria"];
// Once published, the money rules and the scope Sponsors/Students relied on can no longer change
const LOCKED_AFTER_PUBLISH = ["targetBudget", "expectedSlots", "awardAmountPerStudent", "scope"];
const SCOPE_MODELS = { categoryIds: Category, subjectIds: Subject, courseIds: Course };

const campaignNotFound = () => new AppError("Campaign not found", "CAMPAIGN_NOT_FOUND", 404);

const isWithin = (start, end, now) => (!start || start <= now) && (!end || end >= now);

// BR-17 / BR-19: funding and application phases are derived from the campaign dates
const isAcceptingFunding = (campaign, now = new Date()) =>
  campaign.status === "OPEN_FOR_FUNDING" && isWithin(campaign.fundingStart, campaign.fundingEnd, now);

const isAcceptingApplications = (campaign, now = new Date()) =>
  campaign.status === "OPEN_FOR_FUNDING" && isWithin(campaign.applicationStart, campaign.applicationEnd, now);

const present = (campaign) => {
  const funded = toNum(campaign.fundedAmount);
  const allocated = toNum(campaign.allocatedAmount);
  const target = toNum(campaign.targetBudget);
  return {
    ...campaign,
    availableFund: toDec(funded - allocated), // quỹ còn có thể cấp học bổng mới
    fundingProgress: target > 0 ? Math.min(Math.round((funded / target) * 10000) / 100, 100) : 0,
    isAcceptingFunding: isAcceptingFunding(campaign),
    isAcceptingApplications: isAcceptingApplications(campaign),
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

const applyInput = async (campaign, body) => {
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
  for (const field of DATE_FIELDS) {
    if (body[field] !== undefined) campaign[field] = parseDate(body[field], field);
  }
  if (body.scope !== undefined) campaign.scope = await parseScope(body.scope);

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
  return paged(items.map(present), total, paging);
};

const withDetail = async (campaign) => {
  const scope = campaign.scope || {};
  const [categories, subjects, courses, scholarshipCount, contributions] = await Promise.all([
    Category.find({ _id: { $in: scope.categoryIds || [] } }).select("name").lean(),
    Subject.find({ _id: { $in: scope.subjectIds || [] } }).select("name").lean(),
    Course.find({ _id: { $in: scope.courseIds || [] } }).select("title").lean(),
    Scholarship.countDocuments({ campaignId: campaign._id }),
    SponsorContribution.countDocuments({ campaignId: campaign._id, contributionStatus: "COMPLETED" }),
  ]);
  return {
    ...present(campaign),
    scopeDetail: { categories, subjects, courses },
    awardedScholarshipCount: scholarshipCount,
    contributionCount: contributions,
  };
};

const getPublicCampaign = async (campaignId) => {
  const campaign = await getCampaignOrThrow(campaignId);
  if (!PUBLIC_STATUSES.includes(campaign.status)) throw campaignNotFound(); // DRAFT is never public
  return withDetail(campaign.toObject());
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
  await applyInput(campaign, body);
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
  await applyInput(campaign, body);
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
    const missing = DATE_FIELDS.filter((field) => !campaign[field]);
    if (missing.length) {
      throw validationError("Funding period and application period are required before publishing", { missing });
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
const publishCampaign = (adminId, campaignId) => changeStatus(adminId, campaignId, "DRAFT", "OPEN_FOR_FUNDING", "CAMPAIGN_PUBLISHED");
const closeCampaign = (adminId, campaignId) => changeStatus(adminId, campaignId, "OPEN_FOR_FUNDING", "CLOSED", "CAMPAIGN_CLOSED");

module.exports = {
  getCampaignOrThrow,
  isAcceptingFunding,
  isAcceptingApplications,
  present,
  listCampaigns,
  getPublicCampaign,
  adminListCampaigns,
  adminGetCampaign,
  createCampaign,
  updateCampaign,
  publishCampaign,
  closeCampaign,
};
