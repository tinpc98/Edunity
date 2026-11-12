const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  Class,
  Session,
  SessionAttendance,
  Enrollment,
  User,
  TeacherScheduleLock,
  ScheduleIdempotencyKey,
} = require("../models");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { validationError, parseDate, isBlank } = require("../utils/http");
const { getDisplayProfile } = require("../utils/userProfile");
const { computePlannedOccurrences, parseDateTimeInZone, validateTimeZone } = require("../utils/timezone");
const videoProvider = require("./videoProvider");
const { getVerifiedTeacher, getOwnClass, isSessionWithinClass } = require("./teacherClassService");
const presenceService = require("./sessionPresenceService");
const { runInTeacherScheduleTx } = require("../utils/teacherScheduleLock");

const JOIN_WINDOW_BEFORE_MS = 10 * 60 * 1000; // 10 minutes pre-open waiting room window (TIN-05D)
const LATE_AFTER_SECONDS = 5 * 60; // 5 minutes (300s) student late threshold (TIN-05D)
const STUDENT_LATE_JITTER_SECONDS = 0; // Strict 300s threshold aligned with sessionPresenceService (Math.floor yields 300 at exactly 5m)
const STUDENT_FIRST_JOIN_DEADLINE_SECONDS = 20 * 60; // 20 minutes (1200s) first-join deadline (TIN-05D)
const STUDENT_FIRST_JOIN_JITTER_SECONDS = 2; // 2s tolerance for HTTP/test boundary jitter
const CLOSED_CLASS_STATUSES = ["COMPLETED", "CANCELLED"];
const ACTIVE_CLASS_STATUSES = ["OPEN", "IN_PROGRESS"];
const NOT_DELETED = { isDeleted: { $ne: true } };

const sessionNotFound = () => new AppError("Session not found", "SESSION_NOT_FOUND", 404);

const getOwnSession = async (teacherId, sessionId) => {
  if (!mongoose.isValidObjectId(sessionId)) throw sessionNotFound();
  const session = await Session.findById(sessionId);
  if (!session) throw sessionNotFound();
  if (session.teacherId.toString() !== teacherId.toString()) {
    throw FORBIDDEN("You can only manage sessions of your own classes"); // BR-15
  }
  return session;
};

const assertSessionTimes = (cls, startDatetime, endDatetime, label = "session", now = new Date()) => {
  if (!startDatetime || !endDatetime) throw validationError(`${label}: startDatetime and endDatetime are required`);
  if (startDatetime >= endDatetime) throw validationError(`${label}: startDatetime must be before endDatetime`);
  if (startDatetime <= now) {
    throw new AppError(`${label}: session must start in the future`, "SESSION_IN_PAST", 400);
  }
  if (!isSessionWithinClass(cls, startDatetime, endDatetime)) {
    throw new AppError(`${label}: session must be within the class start/end date`, "SESSION_OUT_OF_CLASS_RANGE", 400); // BR-32
  }
};

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
};

const buildRequestHash = (operation, payload) =>
  crypto.createHash("sha256").update(`${operation}:${stableStringify(payload)}`).digest("hex");

const normalizeIdempotencyKey = (options = {}, body = {}) => {
  const raw = options?.idempotencyKey !== undefined ? options.idempotencyKey : body?.idempotencyKey;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw validationError("Idempotency-Key must be a non-empty string");
  }
  const key = raw.trim();
  if (key.length > 128) {
    throw validationError("Idempotency-Key must not exceed 128 characters");
  }
  return key;
};

/**
 * A Teacher teaches one Session at a time: the new time ranges may not overlap each other nor any active
 * Session of the same Teacher (in any of their classes).
 */
const assertNoTeacherOverlap = async (teacherId, ranges, excludeSessionId = null, dbSession = null) => {
  const sorted = [...ranges].sort((a, b) => a.startDatetime - b.startDatetime);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startDatetime < sorted[i - 1].endDatetime) {
      throw new AppError(
        `${sorted[i].label} overlaps ${sorted[i - 1].label}`,
        "SESSION_TIME_CONFLICT",
        409
      );
    }
  }
  if (ranges.length === 0) return;

  const filter = {
    teacherId,
    status: { $ne: "CANCELLED" },
    lifecycleState: { $ne: "RESCHEDULED" },
    $or: ranges.map((range) => ({
      startDatetime: { $lt: range.endDatetime },
      endDatetime: { $gt: range.startDatetime },
    })),
  };
  if (excludeSessionId) filter._id = { $ne: excludeSessionId };

  const query = Session.find(filter).select("title className startDatetime endDatetime");
  if (dbSession) query.session(dbSession);
  const conflicts = await query.lean();

  if (conflicts.length > 0) {
    for (const range of ranges) {
      const conflict = conflicts.find(
        (c) => new Date(c.startDatetime) < range.endDatetime && new Date(c.endDatetime) > range.startDatetime
      );
      if (conflict) {
        throw new AppError(
          `${range.label} overlaps "${conflict.title}" (${conflict.className}) at ${new Date(conflict.startDatetime).toISOString()}`,
          "SESSION_TIME_CONFLICT",
          409
        );
      }
    }
  }
};

// Once a class is open, students have enrolled (and paid) for its published schedule: it changes only through a
// reschedule request reviewed by an Admin, which notifies the students and handles refunds.
const SCHEDULE_LOCKED_CLASS_STATUSES = ["OPEN", "IN_PROGRESS"];
const scheduleLocked = () =>
  new AppError(
    "The schedule of an open class can only be changed through a reschedule request",
    "RESCHEDULE_REQUIRED",
    409
  );

const assertClassAllowsScheduleMutation = (cls) => {
  if (!cls) throw CLASS_NOT_FOUND();
  if (CLOSED_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Cannot add sessions to a completed or cancelled class", "CLASS_CLOSED", 409);
  }
  if (cls.status === "PENDING_APPROVAL") {
    throw new AppError("Cannot add sessions while class is pending approval", "CLASS_NOT_EDITABLE", 409);
  }
  if (SCHEDULE_LOCKED_CLASS_STATUSES.includes(cls.status)) throw scheduleLocked();
};

const getNextSessionNumber = async (classId, dbSession) => {
  const q = Session.findOne({ classId, sessionNumber: { $ne: null } })
    .sort({ sessionNumber: -1 })
    .select("sessionNumber");
  if (dbSession) q.session(dbSession);
  const maxDoc = await q.lean();
  return maxDoc && Number.isInteger(maxDoc.sessionNumber) ? maxDoc.sessionNumber + 1 : 1;
};

// UC-TEA-03 / CUR-11. Accepts one session, or `{ sessions: [...] }` atomically with Teacher write-lock serialization.
const createSessions = async (teacherId, classId, body = {}, options = {}) => {
  await getVerifiedTeacher(teacherId);
  const preCls = await getOwnClass(teacherId, classId);
  assertClassAllowsScheduleMutation(preCls);

  const timeZone = validateTimeZone(body.timezone);
  const idempotencyKey = normalizeIdempotencyKey(options, body);

  const isBulk = Array.isArray(body.sessions);
  const inputs = isBulk ? body.sessions : [body];
  if (inputs.length === 0) throw validationError("sessions must not be empty");

  const parsedInputs = inputs.map((input, index) => {
    const label = isBulk ? `sessions[${index}]` : "session";
    if (!input || isBlank(input.title)) throw validationError(`${label}: title is required`); // BR-52
    const startDatetime = parseDateTimeInZone(input.startDatetime, "startDatetime", timeZone);
    const endDatetime = parseDateTimeInZone(input.endDatetime, "endDatetime", timeZone);
    return {
      label,
      title: String(input.title).trim(),
      description: input.description,
      sessionNumber: input.sessionNumber,
      startDatetime,
      endDatetime,
    };
  });

  const requestHash = idempotencyKey
    ? buildRequestHash("CREATE_SESSIONS", {
        isBulk,
        timeZone,
        sessions: parsedInputs.map((s) => ({
          title: s.title,
          description: s.description || null,
          sessionNumber: s.sessionNumber || null,
          startDatetime: s.startDatetime ? s.startDatetime.toISOString() : null,
          endDatetime: s.endDatetime ? s.endDatetime.toISOString() : null,
        })),
      })
    : null;

  return runInTeacherScheduleTx(preCls.teacherId, async (dbSession) => {
    const cls = await Class.findOne({ _id: preCls._id, ...NOT_DELETED }).session(dbSession);
    assertClassAllowsScheduleMutation(cls);

    if (idempotencyKey) {
      const existingKey = await ScheduleIdempotencyKey.findOne({
        teacherId: cls.teacherId,
        classId: cls._id,
        operation: "CREATE_SESSIONS",
        idempotencyKey,
      })
        .session(dbSession)
        .lean();

      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new AppError(
            "Idempotency-Key was already used with a different session payload",
            "IDEMPOTENCY_KEY_CONFLICT",
            409
          );
        }
        const existingSessions = await Session.find({ _id: { $in: existingKey.sessionIds } })
          .sort({ startDatetime: 1 })
          .session(dbSession)
          .lean();
        return isBulk ? existingSessions : existingSessions[0];
      }
    }

    const now = new Date();
    let nextNumber = await getNextSessionNumber(cls._id, dbSession);
    const docs = parsedInputs.map((item) => {
      assertSessionTimes(cls, item.startDatetime, item.endDatetime, item.label, now);
      let assignedNum;
      if (item.sessionNumber !== undefined && item.sessionNumber !== null) {
        if (
          typeof item.sessionNumber === "boolean" ||
          Array.isArray(item.sessionNumber) ||
          typeof item.sessionNumber === "object" ||
          (typeof item.sessionNumber === "string" && item.sessionNumber.trim() === "")
        ) {
          throw validationError(`${item.label}: sessionNumber must be a positive integer`);
        }
        const n = Number(item.sessionNumber);
        if (!Number.isInteger(n) || n < 1) throw validationError(`${item.label}: sessionNumber must be a positive integer`);
        assignedNum = n;
        if (n >= nextNumber) nextNumber = n + 1;
      } else {
        assignedNum = nextNumber++;
      }
      return {
        classId: cls._id,
        className: cls.className,
        teacherId: cls.teacherId,
        title: item.title,
        sessionNumber: assignedNum,
        scheduleSource: "MANUAL",
        description: item.description,
        startDatetime: item.startDatetime,
        endDatetime: item.endDatetime,
        status: "SCHEDULED",
      };
    });

    await assertNoTeacherOverlap(
      cls.teacherId,
      docs.map((doc, index) => ({ ...doc, label: parsedInputs[index].label })),
      null,
      dbSession
    );

    const created = await Session.insertMany(docs, { session: dbSession });
    if (idempotencyKey) {
      await ScheduleIdempotencyKey.create(
        [
          {
            teacherId: cls.teacherId,
            classId: cls._id,
            operation: "CREATE_SESSIONS",
            idempotencyKey,
            requestHash,
            isBulk,
            sessionIds: created.map((doc) => doc._id),
          },
        ],
        { session: dbSession }
      );
    }

    const result = created.map((doc) => doc.toObject());
    return isBulk ? result : result[0];
  });
};

/**
 * CUR-11: Generates and persists Session documents from Class.schedule inside a serialized
 * MongoDB transaction. Normalizes Asia/Ho_Chi_Minh wall-clock schedule slots to UTC, checks
 * teacher overlaps across all classes, prevents duplicate creation on retry, and assigns
 * sequential sessionNumber values.
 */
const generateSessionsFromSchedule = async (teacherId, classId, body = {}, options = {}) => {
  await getVerifiedTeacher(teacherId);
  const preCls = await getOwnClass(teacherId, classId);
  assertClassAllowsScheduleMutation(preCls);

  if (!preCls.startDate || !preCls.endDate || !Array.isArray(preCls.schedule) || preCls.schedule.length === 0) {
    throw validationError("startDate, endDate and schedule are required to generate sessions");
  }

  const timeZone = validateTimeZone(body.timezone);
  const idempotencyKey = normalizeIdempotencyKey(options, body);
  if (body.skipPast !== undefined && typeof body.skipPast !== "boolean") {
    throw validationError("skipPast must be a boolean");
  }
  const skipPast = body.skipPast === true;
  const fromDate = body.fromDate ? parseDateTimeInZone(body.fromDate, "fromDate", timeZone) : null;
  const untilDate = body.untilDate ? parseDateTimeInZone(body.untilDate, "untilDate", timeZone) : null;
  const titlePrefix = isBlank(body.titlePrefix) ? null : String(body.titlePrefix).trim();
  const description = isBlank(body.description) ? undefined : String(body.description).trim();

  if (fromDate && untilDate && fromDate > untilDate) {
    throw validationError("fromDate must be before untilDate");
  }

  return runInTeacherScheduleTx(preCls.teacherId, async (dbSession) => {
    const cls = await Class.findOne({ _id: preCls._id, ...NOT_DELETED }).session(dbSession);
    assertClassAllowsScheduleMutation(cls);

    const planned = computePlannedOccurrences(cls, { timeZone, fromDate, untilDate, maxOccurrences: 366 });
    const now = new Date();
    const targetOccurrences = skipPast ? planned.filter((occ) => occ.startDatetime > now) : planned;

    if (targetOccurrences.length === 0) {
      throw validationError("No upcoming sessions matched the class schedule and date range");
    }

    targetOccurrences.forEach((occ, index) => {
      assertSessionTimes(cls, occ.startDatetime, occ.endDatetime, `generated[${index}]`, now);
    });

    const requestHash = idempotencyKey
      ? buildRequestHash("GENERATE_SESSIONS", {
          timeZone,
          skipPast,
          titlePrefix: titlePrefix || null,
          description: description || null,
          fromDate: fromDate ? fromDate.toISOString() : null,
          untilDate: untilDate ? untilDate.toISOString() : null,
          slots: targetOccurrences.map((o) => [o.startDatetime.toISOString(), o.endDatetime.toISOString()]),
        })
      : null;

    if (idempotencyKey) {
      const existingKey = await ScheduleIdempotencyKey.findOne({
        teacherId: cls.teacherId,
        classId: cls._id,
        operation: "GENERATE_SESSIONS",
        idempotencyKey,
      })
        .session(dbSession)
        .lean();

      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new AppError(
            "Idempotency-Key was already used with different schedule generation parameters",
            "IDEMPOTENCY_KEY_CONFLICT",
            409
          );
        }
        const existingSessions = await Session.find({ _id: { $in: existingKey.sessionIds } })
          .sort({ startDatetime: 1 })
          .session(dbSession)
          .lean();
        return {
          classId: String(cls._id),
          timezone: timeZone,
          generatedCount: existingSessions.length,
          idempotent: true,
          sessions: existingSessions,
        };
      }
    }

    let nextNumber = await getNextSessionNumber(cls._id, dbSession);
    const docs = targetOccurrences.map((occ, index) => {
      const num = nextNumber++;
      const prefix = titlePrefix || `Buổi ${num}`;
      const title = titlePrefix ? `${prefix} ${index + 1}` : prefix;
      return {
        classId: cls._id,
        className: cls.className,
        teacherId: cls.teacherId,
        title,
        sessionNumber: num,
        scheduleSource: "SCHEDULE_GENERATED",
        description,
        startDatetime: occ.startDatetime,
        endDatetime: occ.endDatetime,
        status: "SCHEDULED",
      };
    });

    await assertNoTeacherOverlap(
      cls.teacherId,
      docs.map((doc, index) => ({ ...doc, label: `generated[${index}]` })),
      null,
      dbSession
    );

    const created = await Session.insertMany(docs, { session: dbSession });
    if (idempotencyKey) {
      await ScheduleIdempotencyKey.create(
        [
          {
            teacherId: cls.teacherId,
            classId: cls._id,
            operation: "GENERATE_SESSIONS",
            idempotencyKey,
            requestHash,
            isBulk: true,
            sessionIds: created.map((doc) => doc._id),
          },
        ],
        { session: dbSession }
      );
    }

    return {
      classId: String(cls._id),
      timezone: timeZone,
      generatedCount: created.length,
      idempotent: false,
      sessions: created.map((doc) => doc.toObject()),
    };
  });
};

const updateSession = async (teacherId, sessionId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const preSession = await getOwnSession(teacherId, sessionId);
  if (preSession.status !== "SCHEDULED") {
    throw new AppError("Only SCHEDULED sessions can be updated", "SESSION_NOT_EDITABLE", 409);
  }
  const preCls = await Class.findOne({ _id: preSession.classId, ...NOT_DELETED });
  if (!preCls) throw CLASS_NOT_FOUND();
  if (CLOSED_CLASS_STATUSES.includes(preCls.status)) {
    throw new AppError("Cannot update sessions of a completed or cancelled class", "CLASS_CLOSED", 409);
  }
  if (preCls.status === "PENDING_APPROVAL") {
    throw new AppError("Cannot update sessions while class is pending approval", "CLASS_NOT_EDITABLE", 409);
  }

  const changesSchedule =
    body.startDatetime !== undefined || body.endDatetime !== undefined || body.status !== undefined;
  if (changesSchedule && SCHEDULE_LOCKED_CLASS_STATUSES.includes(preCls.status)) throw scheduleLocked();

  const timeZone = validateTimeZone(body.timezone);

  if (!changesSchedule) {
    if (body.title !== undefined) {
      if (isBlank(body.title)) throw validationError("title must not be empty");
      preSession.title = body.title;
    }
    if (body.description !== undefined) preSession.description = body.description;
    await preSession.save();
    return preSession.toObject();
  }

  return runInTeacherScheduleTx(preSession.teacherId, async (dbSession) => {
    const session = await Session.findById(preSession._id).session(dbSession);
    if (!session) throw sessionNotFound();
    if (session.status !== "SCHEDULED") {
      throw new AppError("Only SCHEDULED sessions can be updated", "SESSION_NOT_EDITABLE", 409);
    }
    const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED }).session(dbSession);
    if (!cls) throw CLASS_NOT_FOUND();
    if (CLOSED_CLASS_STATUSES.includes(cls.status)) {
      throw new AppError("Cannot update sessions of a completed or cancelled class", "CLASS_CLOSED", 409);
    }
    if (cls.status === "PENDING_APPROVAL") {
      throw new AppError("Cannot update sessions while class is pending approval", "CLASS_NOT_EDITABLE", 409);
    }
    if (SCHEDULE_LOCKED_CLASS_STATUSES.includes(cls.status)) throw scheduleLocked();

    if (body.title !== undefined) {
      if (isBlank(body.title)) throw validationError("title must not be empty");
      session.title = body.title;
    }
    if (body.description !== undefined) session.description = body.description;
    if (body.startDatetime !== undefined) session.startDatetime = parseDateTimeInZone(body.startDatetime, "startDatetime", timeZone);
    if (body.endDatetime !== undefined) session.endDatetime = parseDateTimeInZone(body.endDatetime, "endDatetime", timeZone);
    if (body.startDatetime !== undefined || body.endDatetime !== undefined) {
      assertSessionTimes(cls, session.startDatetime, session.endDatetime);
      await assertNoTeacherOverlap(
        session.teacherId,
        [{ startDatetime: session.startDatetime, endDatetime: session.endDatetime, label: "session" }],
        session._id,
        dbSession
      );
    }
    if (body.status !== undefined) {
      if (body.status !== "CANCELLED") throw validationError("status can only be changed to CANCELLED");
      session.status = "CANCELLED";
      session.roomState = "CANCELLED";
      session.lifecycleState = "CANCELLED";
    }

    await session.save({ session: dbSession });
    return session.toObject();
  });
};

// Removing a planned session is only possible while the Class has not been submitted/opened
const deleteSession = async (teacherId, sessionId) => {
  await getVerifiedTeacher(teacherId);
  const preSession = await getOwnSession(teacherId, sessionId);
  return runInTeacherScheduleTx(preSession.teacherId, async (dbSession) => {
    const session = await Session.findById(preSession._id).session(dbSession);
    if (!session) throw sessionNotFound();
    const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED })
      .select("status")
      .session(dbSession)
      .lean();
    if (!cls) throw CLASS_NOT_FOUND();
    if (!["DRAFT", "REJECTED"].includes(cls.status)) {
      throw new AppError(
        "Sessions can only be deleted while the class is DRAFT or REJECTED; cancel it instead",
        "SESSION_NOT_DELETABLE",
        409
      );
    }
    await Session.deleteOne({ _id: session._id }, { session: dbSession });
    return { deleted: true };
  });
};

/**
 * UC-STU-09 / UC-TEA-05: POST /sessions/:id/join.
 * Returns a room id and a short-lived access token — never an external Meet/Zoom URL.
 */
const joinSession = async (user, sessionId) => {
  if (user.role === "TEACHER") {
    await getVerifiedTeacher(user.id);
  } else if (user.role !== "STUDENT") {
    throw FORBIDDEN("Only STUDENT or TEACHER can join a session");
  }

  if (!mongoose.isValidObjectId(sessionId)) throw sessionNotFound();
  const session = await Session.findById(sessionId);
  if (!session) throw sessionNotFound();

  let role;
  if (user.role === "TEACHER") {
    if (session.teacherId.toString() !== user.id.toString()) {
      throw FORBIDDEN("You can only start sessions of your own classes");
    }
    role = "HOST";
  } else if (user.role === "STUDENT") {
    // BR-12: Enrollment phải tồn tại (CONFIRMED) trước khi Join Session
    const enrollment = await Enrollment.exists({ studentId: user.id, classId: session.classId, enrollmentStatus: "CONFIRMED" });
    if (!enrollment) throw new AppError("Not enrolled in this class", "NOT_ENROLLED", 403);
    role = "PARTICIPANT";
  }

  const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED }).select("status").lean();
  if (!cls) throw CLASS_NOT_FOUND();
  if (!ACTIVE_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Class must be approved and active before joining a session", "CLASS_NOT_ACTIVE", 403);
  }

  if (session.status === "CANCELLED") throw new AppError("Session has been cancelled", "SESSION_CANCELLED", 409);
  if (session.status === "COMPLETED") throw new AppError("Session has ended", "SESSION_ENDED", 409);
  if (session.status === "INTERRUPTED" && session.roomState === "ENDED") {
    throw new AppError("Session has ended", "SESSION_ENDED", 409);
  }

  // BR-14: Session Room chi truy cap duoc trong thoi gian cho phep
  const now = new Date();
  const windowStart = new Date(session.startDatetime.getTime() - JOIN_WINDOW_BEFORE_MS);
  // The Teacher keeps access during the post-end grace period (overtime) of a running Session
  const joinWindowEnd =
    role === "HOST" && ["IN_PROGRESS", "INTERRUPTED"].includes(session.status)
      ? new Date(session.endDatetime.getTime() + presenceService.POST_END_GRACE_PERIOD_MS)
      : session.endDatetime;
  if (now < windowStart || now > joinWindowEnd) {
    throw new AppError(
      `Session is not joinable now. Starts at ${session.startDatetime.toISOString()}`,
      "SESSION_NOT_JOINABLE",
      409
    );
  }

  if (!session.meetingRoomId) session.meetingRoomId = `room_${session._id}`;

  const startMs = session.startDatetime.getTime();
  const endMs = session.endDatetime.getTime();
  const nowMs = now.getTime();
  const isWaitingRoomWindow = nowMs < startMs;

  if (role === "HOST") {
    // Entering the room never starts teaching. The Teacher checks camera/microphone in the WAITING room and presses
    // "Bắt đầu buổi học" (POST /teacher/sessions/:id/start), which starts the recording and then IN_PROGRESS.
    if (session.status === "SCHEDULED" || session.status === "WAITING") {
      const setFields = {
        status: "WAITING",
        meetingRoomId: session.meetingRoomId,
        roomState: "WAITING",
        lifecycleState: "WAITING",
        preOpenedAt: session.preOpenedAt || now,
        "teacherPresence.lastConnectedAt": now,
      };
      if (isWaitingRoomWindow) {
        setFields["teacherPresence.firstPreOpenJoinAt"] = session.teacherPresence?.firstPreOpenJoinAt || now;
        setFields["teacherPresence.isCurrentlyConnected"] = true;
      }
      await Session.updateOne({ _id: session._id, status: { $in: ["SCHEDULED", "WAITING"] } }, { $set: setFields });
      session.status = "WAITING";
      session.roomState = "WAITING";
      session.lifecycleState = "WAITING";
    } else if (session.status === "INTERRUPTED") {
      // Teacher reconnecting to an INTERRUPTED session before endDatetime
      await Session.updateOne(
        { _id: session._id, status: "INTERRUPTED" },
        {
          $set: {
            status: "IN_PROGRESS",
            roomState: "LIVE",
            lifecycleState: "IN_PROGRESS",
            "teacherPresence.lastConnectedAt": now,
            "teacherPresence.isCurrentlyConnected": true,
            "teacherPresence.currentAbsenceStartedAt": null,
          },
        }
      );
      session.status = "IN_PROGRESS";
      session.roomState = "LIVE";
      session.lifecycleState = "IN_PROGRESS";
      await presenceService.startTeachingRecordingSegmentIfNeeded(session, user.id);
    } else if (session.isModified()) {
      await session.save();
    }
  } else if (session.isModified()) {
    await session.save();
  }

  // TIN-05B-FINAL (BUG-TIN05B-01) + TIN-05D Student Join Rules:
  // 1) Enforce 20-minute first-join deadline based on trusted DB state (never client-supplied flags)
  // 2) Enforce 5-minute late threshold (lateArrivalSeconds > 300s -> LATE, <= 300s -> PRESENT)
  // 3) Coordinate write locks on Session document inside transaction against Teacher End
  let hasVerifiedPriorJoin = false;
  if (role === "PARTICIPANT") {
    const existingAttendance = await SessionAttendance.findOne({
      sessionId: session._id,
      studentId: user.id,
    }).lean();

    const elapsedSeconds = Math.floor((nowMs - startMs) / 1000);
    const isPastFirstJoinDeadline =
      elapsedSeconds > STUDENT_FIRST_JOIN_DEADLINE_SECONDS + STUDENT_FIRST_JOIN_JITTER_SECONDS;

    hasVerifiedPriorJoin =
      Boolean(existingAttendance?.hasVerifiedConnection) &&
      Boolean(existingAttendance?.firstVerifiedJoinAt) &&
      Math.floor((new Date(existingAttendance.firstVerifiedJoinAt).getTime() - startMs) / 1000) <=
        STUDENT_FIRST_JOIN_DEADLINE_SECONDS + STUDENT_FIRST_JOIN_JITTER_SECONDS;

    if (isPastFirstJoinDeadline && !hasVerifiedPriorJoin) {
      throw new AppError(
        "First-join deadline (20 minutes after session start) has passed",
        "JOIN_WINDOW_CLOSED",
        403
      );
    }

    const lateArrivalSeconds = isWaitingRoomWindow
      ? 0
      : Math.max(0, Math.floor((nowMs - startMs) / 1000));
    const late = !isWaitingRoomWindow && lateArrivalSeconds > LATE_AFTER_SECONDS + STUDENT_LATE_JITTER_SECONDS;

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Step 1: Snapshot check inside transaction
        const currentSession = await Session.findById(session._id).session(dbSession);
        if (!currentSession || currentSession.status === "COMPLETED" || currentSession.status === "CANCELLED") {
          throw new AppError("This session has already ended", "SESSION_ENDED", 409);
        }

        // Step 2: Atomic write-guard: mutate __v on Session document inside transaction
        // Ensures WiredTiger write-lock serialization against Teacher endSession
        const guardedSession = await Session.findOneAndUpdate(
          {
            _id: session._id,
            status: { $in: ["SCHEDULED", "WAITING", "IN_PROGRESS", "INTERRUPTED"] },
          },
          {
            $inc: { __v: 1 },
          },
          { session: dbSession, returnDocument: "after" }
        );
        if (!guardedSession) {
          throw new AppError("This session has already ended", "SESSION_ENDED", 409);
        }

        const needsFirstTeachingJoinUpdate =
          !isWaitingRoomWindow &&
          Boolean(existingAttendance) &&
          !existingAttendance.joinedAt &&
          !existingAttendance.firstValidTeachingJoin &&
          !existingAttendance.isCurrentlyConnected;

        const setFields = {
          lastTokenIssuedAt: now,
        };
        if (needsFirstTeachingJoinUpdate) {
          setFields.joinedAt = now;
          setFields.attendanceStatus = late ? "LATE" : "PRESENT";
          setFields.lateArrivalSeconds = lateArrivalSeconds;
          setFields.isLate = late;
        }

        await SessionAttendance.updateOne(
          { sessionId: session._id, studentId: user.id },
          {
            $setOnInsert: {
              classId: session.classId,
              joinedAt: isWaitingRoomWindow ? null : now,
              firstPreOpenJoinAt: isWaitingRoomWindow ? now : null,
              ...(needsFirstTeachingJoinUpdate
                ? {}
                : {
                    attendanceStatus: late ? "LATE" : "PRESENT",
                    lateArrivalSeconds,
                    isLate: late,
                  }),
            },
            $set: setFields,
            $inc: {
              tokenIssuedCount: 1,
            },
          },
          { upsert: true, session: dbSession }
        );
      });
    } finally {
      await dbSession.endSession();
    }
  }

  // NFR-12: token het han khi buoi hoc ket thuc; Teacher: het grace period de co the day qua gio
  const expiresAt =
    role === "HOST"
      ? new Date(session.endDatetime.getTime() + presenceService.POST_END_GRACE_PERIOD_MS)
      : session.endDatetime;
  const firstJoinDeadlineAt =
    role === "PARTICIPANT" && !hasVerifiedPriorJoin
      ? new Date(Math.min(endMs, startMs + STUDENT_FIRST_JOIN_DEADLINE_SECONDS * 1000))
      : null;
  const tokenExpiresAt = firstJoinDeadlineAt || expiresAt;

  const account = await User.findById(user.id).select("role studentProfile teacherProfile").lean();
  const { provider, serverUrl, accessToken } = videoProvider.createJoinToken({
    roomId: session.meetingRoomId,
    sessionId: session._id.toString(),
    userId: user.id.toString(),
    displayName: getDisplayProfile(account).fullName,
    role,
    expiresAt: tokenExpiresAt,
    firstJoinDeadlineAt,
  });

  return {
    sessionId: session._id.toString(),
    roomId: session.meetingRoomId,
    provider,
    serverUrl,
    accessToken,
    role,
    expiresAt,
    firstJoinDeadlineAt,
    roomState: isWaitingRoomWindow ? "WAITING" : session.roomState || "LIVE",
    isWaitingRoom: isWaitingRoomWindow,
    isReconnect: role === "PARTICIPANT" ? hasVerifiedPriorJoin : false,
  };
};

/**
 * "Bắt đầu buổi học": WAITING → IN_PROGRESS with the recording started first (see presenceService.beginTeaching).
 * Allowed from the pre-open window until the scheduled end, only by the owning Teacher, and — when a video provider
 * is configured — only while the Teacher is actually in the room (trusted LiveKit state, not a client claim).
 */
const startSession = async (teacherId, sessionId) => {
  await getVerifiedTeacher(teacherId);
  const session = await getOwnSession(teacherId, sessionId);
  const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED }).select("status").lean();
  if (!cls) throw CLASS_NOT_FOUND();
  if (!ACTIVE_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Class must be approved and active to start a session", "CLASS_NOT_ACTIVE", 403);
  }
  if (session.status === "IN_PROGRESS") {
    throw new AppError("Session has already started", "SESSION_ALREADY_STARTED", 409);
  }
  if (!["SCHEDULED", "WAITING"].includes(session.status)) {
    throw new AppError("Only a SCHEDULED or WAITING session can be started", "SESSION_NOT_STARTABLE", 409);
  }

  const now = new Date();
  const windowStart = new Date(session.startDatetime.getTime() - JOIN_WINDOW_BEFORE_MS);
  if (now < windowStart || now > session.endDatetime) {
    throw new AppError("Session can only be started during its scheduled time", "SESSION_NOT_STARTABLE", 409);
  }

  if (videoProvider.getProviderName() === "LIVEKIT") {
    const roomId = session.meetingRoomId || `room_${session._id}`;
    const presence = await videoProvider.verifyParticipantInRoom(roomId, teacherId.toString());
    if (!presence.verified) {
      throw new AppError(
        presence.reason === "PROVIDER_UNAVAILABLE"
          ? "Cannot reach the video provider to confirm you are in the room; please retry"
          : "Join the classroom before starting the session",
        presence.reason === "PROVIDER_UNAVAILABLE" ? "VIDEO_PROVIDER_UNAVAILABLE" : "TEACHER_NOT_IN_ROOM",
        presence.reason === "PROVIDER_UNAVAILABLE" ? 503 : 409
      );
    }
  }

  return presenceService.beginTeaching(session._id, { startedBy: "TEACHER", now });
};

// UC-TEA-05: khi kết thúc Session = COMPLETED, Attendance được cập nhật
const endSession = async (teacherId, sessionId) => {
  await getVerifiedTeacher(teacherId);
  const sessionDoc = await getOwnSession(teacherId, sessionId);
  const cls = await Class.findOne({ _id: sessionDoc.classId, ...NOT_DELETED }).select("status").lean();
  if (!cls) throw CLASS_NOT_FOUND();
  if (!ACTIVE_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Class must be approved and active to end a session", "CLASS_NOT_ACTIVE", 403);
  }
  if (sessionDoc.status !== "IN_PROGRESS") {
    throw new AppError("Only an IN_PROGRESS session can be ended", "SESSION_NOT_IN_PROGRESS", 409);
  }

  const now = new Date();
  const dbSession = await mongoose.startSession();
  let attendedCount = 0;
  let absentCount = 0;

  try {
    await dbSession.withTransaction(async () => {
      // 1. Kiem tra lai trang thai ben trong transaction de chong double-end dong thoi
      const current = await Session.findOne({ _id: sessionDoc._id, teacherId }).session(dbSession);
      if (!current || current.status !== "IN_PROGRESS") {
        throw new AppError("Only an IN_PROGRESS session can be ended", "SESSION_NOT_IN_PROGRESS", 409);
      }

      current.status = "COMPLETED";
      current.roomState = "ENDED";
      current.lifecycleState = "COMPLETED";
      current.endReason = current.endReason || "TEACHER_ENDED";
      current.actualEndAt = now;
      await current.save({ session: dbSession });

      // 2. Chot leftAt cho hoc vien co mat
      await SessionAttendance.updateMany(
        { sessionId: current._id, leftAt: null },
        { $set: { leftAt: now } },
        { session: dbSession }
      );

      // 3. Lay danh sach dang ky CONFIRMED va danh sach da diem danh (tuan tu de an toan voi dbSession)
      const enrollments = await Enrollment.find({ classId: current.classId, enrollmentStatus: "CONFIRMED" })
        .select("studentId")
        .session(dbSession)
        .lean();

      const existingAttendances = await SessionAttendance.find({ sessionId: current._id })
        .select("studentId attendanceStatus")
        .session(dbSession)
        .lean();

      const existingStudentIds = new Set(existingAttendances.map((row) => row.studentId.toString()));
      const absentEnrollments = enrollments.filter(
        (enrollment) => !existingStudentIds.has(enrollment.studentId.toString())
      );

      // 4. Chen ABSENT an toan, idempotent bang bulkWrite voi $setOnInsert
      // Tranh loi E11000 va khong ghi de neu hoc vien vua join hoac da co diem danh truoc do
      if (absentEnrollments.length) {
        const ops = absentEnrollments.map((enrollment) => ({
          updateOne: {
            filter: { sessionId: current._id, studentId: enrollment.studentId },
            update: {
              $setOnInsert: {
                classId: current.classId,
                attendanceStatus: "ABSENT",
              },
            },
            upsert: true,
          },
        }));
        await SessionAttendance.bulkWrite(ops, { session: dbSession });
      }

      // 5. Tinh toan thong ke attendance tu trang thai cuoi cung da duoc commit trong transaction
      const finalAttendances = await SessionAttendance.find({ sessionId: current._id })
        .select("studentId attendanceStatus")
        .session(dbSession)
        .lean();

      const confirmedStudentIds = new Set(enrollments.map((e) => e.studentId.toString()));
      const confirmedAttendances = finalAttendances.filter((a) => confirmedStudentIds.has(a.studentId.toString()));

      attendedCount = confirmedAttendances.filter(
        (a) => a.attendanceStatus === "PRESENT" || a.attendanceStatus === "LATE"
      ).length;
      absentCount = confirmedAttendances.filter((a) => a.attendanceStatus === "ABSENT").length;
    });
  } finally {
    await dbSession.endSession();
  }

  // 6. Neu buoi hoc co du lieu SessionPresenceInterval hoac presenceTrackingActive,
  // tinh toan lai chinh xac theo cong thuc 70% thoi luong + moc 5 phut LATE.
  if (sessionDoc.presenceTrackingActive) {
    const recomputed = await presenceService.finalizeSessionAttendance(sessionDoc._id, { now });
    attendedCount = recomputed.filter(
      (a) => a.attendanceStatus === "PRESENT" || a.attendanceStatus === "LATE"
    ).length;
    absentCount = recomputed.filter((a) => a.attendanceStatus === "ABSENT").length;
  }

  // 7. Dung recording truoc khi dong phong, de Egress ket thuc dung cach va webhook egress_ended
  // chuyen recording sang AVAILABLE/FAILED. Best effort: loi provider khong lam hong ket qua end session.
  try {
    await presenceService.stopActiveRecordingSegment(sessionDoc, "SESSION_ENDED");
  } catch (err) {
    console.error(`[endSession] Failed to stop recording for session ${sessionDoc._id}:`, err.message);
  }

  // 8. Tac dung phu ngoai vi: Dong phong LiveKit SAU KHI DB transaction da commit thanh cong.
  // Best effort: Loi mang LiveKit khong lam rollback DB va khong nem loi unhandled.
  await videoProvider.closeRoom(sessionDoc.meetingRoomId);

  const finalSession = await Session.findById(sessionDoc._id).lean();
  return { ...finalSession, attendance: { present: attendedCount, absent: absentCount } };
};

// FR-TEA-13: attendance list of a session for the owning Teacher
const getSessionAttendance = async (teacherId, sessionId) => {
  await getVerifiedTeacher(teacherId);
  const session = await getOwnSession(teacherId, sessionId);
  return SessionAttendance.find({ sessionId: session._id })
    .populate("studentId", "email studentProfile.fullName studentProfile.avatarUrl")
    .lean();
};

const handleLiveKitWebhook = async (event) => {
  if (!event) return;

  // Delegate participant_joined, participant_left, participant_disconnected, room_finished, and egress_ended
  if (
    event.event === "participant_joined" ||
    event.event === "participant_left" ||
    event.event === "participant_disconnected" ||
    event.event === "room_finished" ||
    event.event === "egress_ended"
  ) {
    await presenceService.handleLiveKitEvent(event);
    return;
  }

  if (!event.egressInfo) return;
  await presenceService.handleLiveKitEvent(event);
};

module.exports = {
  createSessions,
  generateSessionsFromSchedule,
  updateSession,
  deleteSession,
  joinSession,
  startSession,
  endSession,
  getSessionAttendance,
  handleLiveKitWebhook,
  assertNoTeacherOverlap,
  runInTeacherScheduleTx,
};
