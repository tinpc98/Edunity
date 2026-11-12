const mongoose = require("mongoose");
const { TeacherScheduleLock } = require("../models");

const ensureTeacherScheduleLock = async (teacherId) => {
  try {
    await TeacherScheduleLock.updateOne(
      { teacherId },
      { $setOnInsert: { teacherId, lockSeq: 0 } },
      { upsert: true }
    );
  } catch (err) {
    if (!err || err.code !== 11000) throw err;
  }
};

const acquireTeacherScheduleLock = async (teacherId, dbSession) => {
  const lock = await TeacherScheduleLock.findOneAndUpdate(
    { teacherId },
    { $inc: { lockSeq: 1 }, $set: { lastLockedAt: new Date() } },
    { session: dbSession, returnDocument: "after" }
  );
  if (lock) return lock;
  const [created] = await TeacherScheduleLock.create(
    [{ teacherId, lockSeq: 1, lastLockedAt: new Date() }],
    { session: dbSession }
  );
  return created;
};

const runInTeacherScheduleTx = async (teacherId, fn) => {
  await ensureTeacherScheduleLock(teacherId);
  const dbSession = await mongoose.startSession();
  try {
    let result;
    await dbSession.withTransaction(async () => {
      await acquireTeacherScheduleLock(teacherId, dbSession);
      result = await fn(dbSession);
    });
    return result;
  } finally {
    await dbSession.endSession();
  }
};

module.exports = {
  ensureTeacherScheduleLock,
  acquireTeacherScheduleLock,
  runInTeacherScheduleTx,
};

