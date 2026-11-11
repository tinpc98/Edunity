const { Class, Session, Enrollment, TeacherEarning } = require("../models");
const { notify } = require("./notificationService");

const NOT_DELETED = { isDeleted: { $ne: true } };

// A Session that can no longer change: ended, cancelled, or interrupted and closed out
const isTerminalSession = (s) =>
  s.status === "COMPLETED" || s.status === "CANCELLED" || (s.status === "INTERRUPTED" && s.roomState === "ENDED");

/**
 * OPEN → IN_PROGRESS once teaching has actually begun (a Session has been started). Enrollment requires OPEN, so the
 * calendar startDate alone does not close enrollment: a class whose first session has not run yet stays joinable.
 */
const startClassesThatBegan = async () => {
  const openClasses = await Class.find({ status: "OPEN", ...NOT_DELETED }).select("_id").lean();
  const started = [];
  for (const cls of openClasses) {
    const began = await Session.exists({
      classId: cls._id,
      status: { $in: ["IN_PROGRESS", "COMPLETED", "INTERRUPTED"] },
    });
    if (!began) continue;
    const res = await Class.updateOne({ _id: cls._id, status: "OPEN" }, { $set: { status: "IN_PROGRESS" } });
    if (res.modifiedCount === 1) started.push(cls._id.toString());
  }
  return started;
};

/**
 * IN_PROGRESS → COMPLETED when every Session is final and the class period is over (endDate, or the last Session's
 * end when no endDate is set). Completing a class completes its CONFIRMED enrollments.
 *
 * V3 Settlement Guard (GAP-P0-05 / PR3 Section 4.8):
 * Earnings created under the V3 payment dispatch pipeline carry `settlementHoldRequired: true` and must NOT be
 * auto-released to `AVAILABLE` upon class completion; they remain `PENDING` until PR7's 7-day reconciliation
 * and makeup/incident review window is completed.
 */
const completeFinishedClasses = async (now = new Date()) => {
  const running = await Class.find({ status: "IN_PROGRESS", ...NOT_DELETED })
    .select("_id endDate teacherId className")
    .lean();
  const completed = [];
  for (const cls of running) {
    const sessions = await Session.find({ classId: cls._id }).select("status roomState endDatetime").lean();
    if (!sessions.length || !sessions.every(isTerminalSession)) continue;

    const lastEnd = Math.max(...sessions.map((s) => new Date(s.endDatetime).getTime()));
    const periodEnd = cls.endDate ? new Date(cls.endDate).getTime() : lastEnd;
    if (periodEnd > now.getTime()) continue;

    const res = await Class.updateOne({ _id: cls._id, status: "IN_PROGRESS" }, { $set: { status: "COMPLETED" } });
    if (res.modifiedCount !== 1) continue;

    await Enrollment.updateMany(
      { classId: cls._id, enrollmentStatus: "CONFIRMED" },
      { $set: { enrollmentStatus: "COMPLETED" } }
    );
    // For explicit legacy earnings with settlementHoldRequired === false, release to AVAILABLE
    await TeacherEarning.updateMany(
      { classId: cls._id, status: "PENDING", settlementHoldRequired: false },
      { $set: { status: "AVAILABLE" } }
    );
    // V3 PR7 Settlement Hardening (BR-04, BR-07): Class COMPLETED does NOT auto-release
    // V3 teacher earnings to AVAILABLE. All earnings must undergo the 7-day maturity evaluation
    // and verified absence of incidents, makeup sessions, and disputes.
    try {
      const settlementService = require("./settlementService");
      await settlementService.evaluateClassSettlement(cls._id, { now });
    } catch (_) {}
    await notify(
      cls.teacherId,
      "Lớp học đã hoàn thành",
      `Lớp "${cls.className}" đã kết thúc. Thu nhập của lớp đã sẵn sàng để quyết toán.`,
      "CLASS_COMPLETED"
    );
    completed.push(cls._id.toString());
  }
  return completed;
};

const advanceClassStatuses = async (now = new Date()) => ({
  started: await startClassesThatBegan(),
  completed: await completeFinishedClasses(now),
});

module.exports = { advanceClassStatuses, startClassesThatBegan, completeFinishedClasses, isTerminalSession };
