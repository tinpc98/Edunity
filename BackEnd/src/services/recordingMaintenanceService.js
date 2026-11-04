const fs = require("fs/promises");
const path = require("path");
const { Session } = require("../models");
const { notifyAdminsOnce } = require("./notificationService");

const DAY_MS = 24 * 60 * 60 * 1000;
const getRetentionDays = () => Number(process.env.RECORDING_RETENTION_DAYS) || 90;
// egress_ended normally arrives within minutes; past this the recording is reported FAILED instead of hanging
const getProcessingTimeoutMs = () => (Number(process.env.RECORDING_PROCESSING_TIMEOUT_HOURS) || 6) * 60 * 60 * 1000;

const getStorageRoot = () => path.resolve(process.env.STORAGE_DIR || path.join(__dirname, "../../storage"));

const deleteStoredFile = async (storageKey) => {
  if (!storageKey || storageKey.includes("..")) return;
  try {
    await fs.unlink(path.join(getStorageRoot(), storageKey));
  } catch (err) {
    if (err.code !== "ENOENT") console.error(`[recordingRetention] Could not delete ${storageKey}:`, err.message);
  }
};

/**
 * Retention policy: AVAILABLE recordings older than RECORDING_RETENTION_DAYS (default 90) are deleted from storage
 * and marked EXPIRED. The Session keeps the metadata (duration, dates) for the record.
 */
const expireOldRecordings = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - getRetentionDays() * DAY_MS);
  const sessions = await Session.find({ "recording.status": "AVAILABLE", "recording.availableAt": { $lte: cutoff } })
    .select("recording recordingSegments")
    .lean();

  const expired = [];
  for (const session of sessions) {
    const keys = new Set([session.recording?.storageKey, ...(session.recordingSegments || []).map((s) => s.storageKey)]);
    for (const key of keys) await deleteStoredFile(key);

    const segments = (session.recordingSegments || []).map((seg) =>
      seg.status === "AVAILABLE" ? { ...seg, status: "EXPIRED" } : seg
    );
    const res = await Session.updateOne(
      { _id: session._id, "recording.status": "AVAILABLE" },
      { $set: { "recording.status": "EXPIRED", "recording.expiredAt": now, recordingSegments: segments } }
    );
    if (res.modifiedCount === 1) expired.push(session._id.toString());
  }
  return expired;
};

/**
 * Recordings stuck in PROCESSING (no egress_ended webhook) past the timeout become FAILED, and Admins are told,
 * so the UI never shows "đang xử lý" forever.
 */
const failStaleProcessingRecordings = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - getProcessingTimeoutMs());
  const sessions = await Session.find({
    "recording.status": "PROCESSING",
    $or: [{ "recording.stoppedAt": { $lte: cutoff } }, { "recording.stoppedAt": null, actualEndAt: { $lte: cutoff } }],
  })
    .select("_id title className")
    .lean();

  const failed = [];
  for (const session of sessions) {
    const res = await Session.updateOne(
      { _id: session._id, "recording.status": "PROCESSING" },
      {
        $set: {
          "recording.status": "FAILED",
          "recording.failureReason": "Timed out waiting for the video provider to finish the recording",
        },
      }
    );
    if (res.modifiedCount !== 1) continue;
    failed.push(session._id.toString());
    await notifyAdminsOnce(
      "Bản ghi buổi học không hoàn tất",
      `Bản ghi buổi "${session.title}" (${session.className}) không nhận được kết quả từ máy chủ video và đã chuyển sang lỗi.`,
      "ADMIN_RECORDING_FAILED",
      `session:${session._id}:admin:recording_timeout`,
      session._id
    );
  }
  return failed;
};

module.exports = { expireOldRecordings, failStaleProcessingRecordings };
