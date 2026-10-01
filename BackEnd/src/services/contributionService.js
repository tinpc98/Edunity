const mongoose = require("mongoose");
const crypto = require("crypto");
const {
  ScholarshipCampaign,
  SponsorContribution,
  Scholarship,
  ScholarshipUsage,
  Transaction,
} = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { paged } = require("../utils/http");
const { toNum, toDec, parseAmount } = require("../utils/money");
const campaignService = require("./campaignService");
const { notify } = require("./notificationService");

/**
 * UC-SPO-02: creates the contribution intent (PENDING). Like a class payment, the money is only
 * counted once the gateway webhook confirms it — the frontend result alone is never trusted.
 */
const createContribution = async (sponsorId, campaignId, body) => {
  const campaign = await campaignService.getCampaignOrThrow(campaignId);
  // BR-17: Sponsor chỉ tài trợ Campaign đang OPEN (và đang trong thời gian nhận tài trợ)
  if (!campaignService.isAcceptingFunding(campaign)) {
    throw new AppError("Campaign is not accepting contributions", "CAMPAIGN_NOT_ACCEPTING_FUNDING", 409);
  }
  const amount = parseAmount(body.amount, "amount");

  const contribution = await SponsorContribution.create({
    campaignId: campaign._id,
    sponsorId,
    amount: toDec(amount),
    contributionStatus: "PENDING",
    paymentReference: "SBX-C-" + crypto.randomUUID(),
  });

  return {
    contributionId: contribution._id,
    campaignId: campaign._id,
    amount: contribution.amount,
    contributionStatus: contribution.contributionStatus,
    gateway: "SANDBOX",
    gatewayReference: contribution.paymentReference,
  };
};

/**
 * Gateway webhook for a contribution. Returns null when the reference is not a contribution
 * so the caller can fall back to the enrollment payment webhook. Idempotent on duplicates.
 */
const processWebhook = async (gatewayReference, status) => {
  const contribution = await SponsorContribution.findOne({ paymentReference: gatewayReference });
  if (!contribution) return null;

  if (contribution.contributionStatus !== "PENDING") {
    return { contributionStatus: contribution.contributionStatus, result: "IDEMPOTENT" };
  }

  const targetStatus = status === "SUCCESS" ? "COMPLETED" : "FAILED";
  const session = await mongoose.startSession();
  let applied = false;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const updated = await SponsorContribution.updateOne(
        { _id: contribution._id, contributionStatus: "PENDING" },
        { $set: { contributionStatus: targetStatus, contributedAt: now } },
        { session }
      );
      applied = updated.modifiedCount === 1;
      if (!applied || targetStatus !== "COMPLETED") return;

      await ScholarshipCampaign.updateOne(
        { _id: contribution.campaignId },
        { $inc: { fundedAmount: contribution.amount } },
        { session }
      );
      await Transaction.create(
        [
          {
            transactionType: "SPONSOR_CONTRIBUTION",
            sourceUserId: contribution.sponsorId,
            amount: contribution.amount,
            status: "COMPLETED",
          },
        ],
        { session }
      );
    });
  } finally {
    session.endSession();
  }

  if (!applied) {
    const current = await SponsorContribution.findById(contribution._id).lean();
    return { contributionStatus: current.contributionStatus, result: "IDEMPOTENT" };
  }
  if (targetStatus === "COMPLETED") {
    await notify(
      contribution.sponsorId,
      "Xác nhận tài trợ",
      `Khoản tài trợ ${contribution.amount.toString()} VNĐ đã được ghi nhận. Mã giao dịch: ${contribution.paymentReference}.`,
      "CONTRIBUTION_RECEIPT"
    );
  }
  return {
    contributionStatus: targetStatus,
    result: targetStatus === "COMPLETED" ? "CONTRIBUTION_SUCCESS" : "CONTRIBUTION_FAILED",
  };
};

// FR-SPO-06
const getMyContributions = async (sponsorId, query, paging) => {
  const filter = { sponsorId };
  if (query.status) filter.contributionStatus = { $in: String(query.status).split(",") };
  if (query.campaignId && mongoose.isValidObjectId(query.campaignId)) filter.campaignId = query.campaignId;

  const [items, total, totals] = await Promise.all([
    SponsorContribution.find(filter)
      .sort({ contributedAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("campaignId", "title status")
      .lean(),
    SponsorContribution.countDocuments(filter),
    SponsorContribution.aggregate([
      { $match: { sponsorId: new mongoose.Types.ObjectId(String(sponsorId)), contributionStatus: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  return {
    ...paged(
      items.map(({ campaignId: campaign, ...item }) => ({
        ...item,
        campaignId: campaign ? campaign._id : null,
        campaignTitle: campaign ? campaign.title : null,
        campaignStatus: campaign ? campaign.status : null,
      })),
      total,
      paging
    ),
    totalContributed: totals.length ? totals[0].total : toDec(0),
  };
};

/**
 * FR-SPO-07..10: impact report of a Campaign for a Sponsor who funded it.
 * Only aggregated figures are exposed — never the identity or documents of the students (NFR-04).
 */
const getCampaignImpact = async (sponsorId, campaignId) => {
  const campaign = await campaignService.getCampaignOrThrow(campaignId);

  const myContributions = await SponsorContribution.find({
    campaignId: campaign._id,
    sponsorId,
    contributionStatus: "COMPLETED",
  }).lean();
  if (!myContributions.length) {
    throw FORBIDDEN("Impact report is only available for campaigns you have contributed to");
  }

  const scholarships = await Scholarship.find({ campaignId: campaign._id }).select("_id").lean();
  const usages = await ScholarshipUsage.find({
    scholarshipId: { $in: scholarships.map((s) => s._id) },
    status: "CONFIRMED",
  })
    .select("scholarshipId classId")
    .lean();

  const funded = toNum(campaign.fundedAmount);
  const used = toNum(campaign.usedAmount);
  const myTotal = myContributions.reduce((sum, item) => sum + toNum(item.amount), 0);
  const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0);

  return {
    campaign: campaignService.present(campaign.toObject()),
    myContribution: {
      total: toDec(myTotal),
      count: myContributions.length,
      shareOfFund: percent(myTotal, funded),
    },
    fundUsage: {
      fundedAmount: campaign.fundedAmount,
      allocatedAmount: campaign.allocatedAmount,
      usedAmount: campaign.usedAmount,
      unallocatedAmount: toDec(funded - toNum(campaign.allocatedAmount)),
      usedPercent: percent(used, funded),
    },
    impact: {
      sponsoredStudentCount: scholarships.length,
      studentsUsingScholarshipCount: new Set(usages.map((u) => u.scholarshipId.toString())).size,
      enrollmentsFundedCount: usages.length,
      classesSupportedCount: new Set(usages.map((u) => u.classId.toString())).size,
    },
  };
};

// FR-ADM-15
const adminListContributions = async (campaignId, query, paging) => {
  const campaign = await campaignService.getCampaignOrThrow(campaignId);
  const filter = { campaignId: campaign._id };
  if (query.status) filter.contributionStatus = { $in: String(query.status).split(",") };

  const [items, total] = await Promise.all([
    SponsorContribution.find(filter)
      .sort({ contributedAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("sponsorId", "email sponsorProfile")
      .lean(),
    SponsorContribution.countDocuments(filter),
  ]);
  return paged(items, total, paging);
};

module.exports = {
  createContribution,
  processWebhook,
  getMyContributions,
  getCampaignImpact,
  adminListContributions,
};
