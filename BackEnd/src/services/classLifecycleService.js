const mongoose = require("mongoose");
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
 * end when no endDate is set). Completing a class completes its CONFIRMED enrollments and releases the Teacher's
 * PENDING earnings for payout (AVAILABLE) atomically inside a MongoDB transaction.
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

    let didComplete = false;
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const res = await Class.updateOne(
          { _id: cls._id, status: "IN_PROGRESS" },
          { $set: { status: "COMPLETED" } },
          { session: dbSession }
        );
        if (res.modifiedCount !== 1) return;

        await Enrollment.updateMany(
          { classId: cls._id, enrollmentStatus: "CONFIRMED" },
          { $set: { enrollmentStatus: "COMPLETED" } },
          { session: dbSession }
        );
        await TeacherEarning.updateMany(
          { classId: cls._id, status: "PENDING" },
          { $set: { status: "AVAILABLE" } },
          { session: dbSession }
        );
        didComplete = true;
      });
    } finally {
      await dbSession.endSession();
    }

    if (!didComplete) continue;

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
