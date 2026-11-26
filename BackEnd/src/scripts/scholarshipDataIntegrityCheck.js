/**
 * EDUNITY V3 — Scholarship Data Integrity & Plaintext CCCD Migration Check
 *
 * Safe dry-run tool for auditing:
 * 1. Duplicate studentId–campaignId application records (before applying compound unique index to legacy DB)
 * 2. Orphan/missing key application records (null studentId or null campaignId)
 * 3. Plaintext CCCD scan and optional encrypted backfill (AES-256-GCM + HMAC Blind Index)
 *
 * NOTE: Never logs PII (CCCD numbers, names, phone numbers) to stdout or logs.
 */

const mongoose = require("mongoose");
const { ScholarshipApplication } = require("../models");
const { encrypt, blindIndex } = require("../utils/pii");

/**
 * Runs integrity audit on ScholarshipApplication collection.
 * @param {Object} options
 * @param {boolean} options.dryRun - When true, does not mutate DB (default: true)
 * @returns {Promise<Object>} Summary report
 */
async function runScholarshipIntegrityAudit(options = { dryRun: true }) {
  const Application = ScholarshipApplication;

  // 1. Audit duplicate (studentId, campaignId) pairs
  const duplicateGroups = await Application.aggregate([
    {
      $group: {
        _id: { studentId: "$studentId", campaignId: "$campaignId" },
        count: { $sum: 1 },
        docIds: { $push: "$_id" },
        statuses: { $push: "$status" },
        createdDates: { $push: "$createdAt" },
      },
    },
    { $match: { count: { $gt: 1 }, "_id.studentId": { $ne: null }, "_id.campaignId": { $ne: null } } },
  ]);

  const duplicatesSummary = duplicateGroups.map((g) => ({
    studentId: String(g._id.studentId),
    campaignId: String(g._id.campaignId),
    duplicateCount: g.count,
    applicationIds: g.docIds.map(String),
    statuses: g.statuses,
    createdDates: g.createdDates,
  }));

  // 2. Audit missing / null foreign keys
  const missingKeysCount = await Application.countDocuments({
    $or: [{ studentId: null }, { campaignId: null }],
  });

  // 3. Audit plaintext CCCD records
  const plaintextStudentCccdDocs = await Application.find(
    { studentCccd: { $ne: null, $nin: ["", null] } },
    { _id: 1, studentCccd: 1 }
  ).lean();

  const plaintextGuardianCccdDocs = await Application.find(
    { "guardianInfo.cccd": { $ne: null, $nin: ["", null] } },
    { _id: 1, "guardianInfo.cccd": 1 }
  ).lean();

  const plaintextCccdTotal = plaintextStudentCccdDocs.length + plaintextGuardianCccdDocs.length;
  let migratedCount = 0;

  // 4. Backfill encryption if not dryRun
  if (!options.dryRun && plaintextCccdTotal > 0) {
    for (const doc of plaintextStudentCccdDocs) {
      if (typeof doc.studentCccd === "string" && /^\d{12}$/.test(doc.studentCccd)) {
        await Application.updateOne(
          { _id: doc._id },
          {
            $set: {
              studentCccdEnc: encrypt(doc.studentCccd),
              studentCccdHash: blindIndex(doc.studentCccd),
              studentCccd: null,
            },
          }
        );
        migratedCount++;
      }
    }

    for (const doc of plaintextGuardianCccdDocs) {
      const raw = doc.guardianInfo?.cccd;
      if (typeof raw === "string" && /^\d{12}$/.test(raw)) {
        await Application.updateOne(
          { _id: doc._id },
          {
            $set: {
              "guardianInfo.cccdEnc": encrypt(raw),
              "guardianInfo.cccdHash": blindIndex(raw),
              "guardianInfo.cccd": null,
            },
          }
        );
        migratedCount++;
      }
    }
  }

  return {
    mode: options.dryRun ? "DRY_RUN" : "MIGRATE_APPLIED",
    timestamp: new Date().toISOString(),
    duplicates: {
      hasConflict: duplicatesSummary.length > 0,
      conflictGroupCount: duplicatesSummary.length,
      conflicts: duplicatesSummary,
      resolutionStrategy:
        duplicatesSummary.length > 0
          ? "PRESERVE_ALL: Do not automatically delete older duplicates. Flag for manual admin review before applying unique compound index."
          : "CLEAN: Safe to apply unique compound index on { studentId: 1, campaignId: 1 }.",
    },
    missingKeys: {
      hasMissingKeys: missingKeysCount > 0,
      missingKeyRecordCount: missingKeysCount,
    },
    plaintextCccd: {
      unencryptedStudentCccdCount: plaintextStudentCccdDocs.length,
      unencryptedGuardianCccdCount: plaintextGuardianCccdDocs.length,
      totalUnencrypted: plaintextCccdTotal,
      migratedCount,
      status: plaintextCccdTotal === 0 ? "ALL_ENCRYPTED" : options.dryRun ? "ENCRYPTION_PENDING" : "ENCRYPTED_SUCCESSFULLY",
    },
  };
}

module.exports = { runScholarshipIntegrityAudit };

if (require.main === module) {
  require("dotenv").config();
  const connectDB = require("../config/db");
  const dryRun = !process.argv.includes("--apply");
  (async () => {
    try {
      await connectDB();
      const result = await runScholarshipIntegrityAudit({ dryRun });
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("Audit error:", err.message);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}
