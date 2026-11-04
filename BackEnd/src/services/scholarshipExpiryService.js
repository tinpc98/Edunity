const mongoose = require("mongoose");
const { Scholarship, ScholarshipUsage, ScholarshipCampaign } = require("../models");
const { toNum, toDec } = require("../utils/money");
const { notify } = require("./notificationService");

/**
 * ACTIVE Scholarships past expiresAt become EXPIRED and their unused balance goes back to the Campaign's available
 * fund (allocatedAmount is reduced by remainingAmount), so expired awards no longer lock sponsor money.
 * A Scholarship with a PENDING usage (a checkout in progress) is skipped: that hold is released or confirmed first,
 * and the next run expires it.
 */
const expireScholarships = async (now = new Date()) => {
  const candidates = await Scholarship.find({ status: "ACTIVE", expiresAt: { $lte: now } }).select("_id").lean();
  const expired = [];

  for (const { _id } of candidates) {
    if (await ScholarshipUsage.exists({ scholarshipId: _id, status: "PENDING" })) continue;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const scholarship = await Scholarship.findOneAndUpdate(
          { _id, status: "ACTIVE", expiresAt: { $lte: now } },
          { $set: { status: "EXPIRED" } },
          { session, returnDocument: "before" }
        );
        if (!scholarship) return;

        const unused = toNum(scholarship.remainingAmount);
        if (unused > 0) {
          await ScholarshipCampaign.updateOne(
            { _id: scholarship.campaignId },
            { $inc: { allocatedAmount: toDec(-unused) } },
            { session }
          );
        }
        expired.push({ scholarship, unused });
      });
    } finally {
      await session.endSession();
    }
  }

  for (const { scholarship, unused } of expired) {
    await notify(
      scholarship.studentId,
      "Học bổng đã hết hạn",
      unused > 0
        ? `Học bổng của bạn đã hết hạn sử dụng. Số dư chưa dùng (${unused.toLocaleString("vi-VN")}đ) đã được hoàn về quỹ chiến dịch.`
        : "Học bổng của bạn đã hết hạn sử dụng.",
      "SCHOLARSHIP_EXPIRED"
    );
  }
  return expired.map(({ scholarship }) => scholarship._id.toString());
};

module.exports = { expireScholarships };
