const mongoose = require("mongoose");
const crypto = require("crypto");
const { Class, Session, SessionAttendance, Enrollment, User } = require("../models");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { validationError, parseDate, isBlank } = require("../utils/http");
const { getDisplayProfile } = require("../utils/userProfile");
const videoProvider = require("./videoProvider");
const { getVerifiedTeacher, getOwnClass, isSessionWithinClass } = require("./teacherClassService");
const presenceService = require("./sessionPresenceService");

const JOIN_WINDOW_BEFORE_MS = 10 * 60 * 1000; // 10 minutes pre-open waiting room window (TIN-05D)
const LATE_AFTER_SECONDS = 5 * 60; // 5 minutes (300s) student late threshold (TIN-05D)
const STUDENT_LATE_JITTER_SECONDS = 3; // 3s tolerance for HTTP/test boundary setup jitter
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

const assertSessionTimes = (cls, startDatetime, endDatetime, label = "session") => {
  if (!startDatetime || !endDatetime) throw validationError(`${label}: startDatetime and endDatetime are required`);
  if (startDatetime >= endDatetime) throw validationError(`${label}: startDatetime must be before endDatetime`);
  if (!isSessionWithinClass(cls, startDatetime, endDatetime)) {
    throw new AppError(`${label}: session must be within the class start/end date`, "SESSION_OUT_OF_CLASS_RANGE", 400); // BR-32
  }
};

// UC-TEA-03. Accepts one session, or `{ sessions: [...] }` to save the whole session plan at once.
const createSessions = async (teacherId, classId, body) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (CLOSED_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Cannot add sessions to a completed or cancelled class", "CLASS_CLOSED", 409);
  }
  if (cls.status === "PENDING_APPROVAL") {
    throw new AppError("Cannot add sessions while class is pending approval", "CLASS_NOT_EDITABLE", 409);
  }

  const isBulk = Array.isArray(body.sessions);
  const inputs = isBulk ? body.sessions : [body];
  if (inputs.length === 0) throw validationError("sessions must not be empty");

  const docs = inputs.map((input, index) => {
    const label = isBulk ? `sessions[${index}]` : "session";
    if (!input || isBlank(input.title)) throw validationError(`${label}: title is required`); // BR-52
    const startDatetime = parseDate(input.startDatetime, "startDatetime");
    const endDatetime = parseDate(input.endDatetime, "endDatetime");
    assertSessionTimes(cls, startDatetime, endDatetime, label);
    return {
      classId: cls._id,
      className: cls.className,
      teacherId: cls.teacherId,
      title: input.title,
      description: input.description,
      startDatetime,
      endDatetime,
      status: "SCHEDULED",
    };
  });

  const created = await Session.insertMany(docs);
  const result = created.map((doc) => doc.toObject());
  return isBulk ? result : result[0];
};

const updateSession = async (teacherId, sessionId, body) => {
  await getVerifiedTeacher(teacherId);
  const session = await getOwnSession(teacherId, sessionId);
  if (session.status !== "SCHEDULED") {
    throw new AppError("Only SCHEDULED sessions can be updated", "SESSION_NOT_EDITABLE", 409);
  }
  const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED });
  if (!cls) throw CLASS_NOT_FOUND();
  if (CLOSED_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Cannot update sessions of a completed or cancelled class", "CLASS_CLOSED", 409);
  }
  if (cls.status === "PENDING_APPROVAL") {
    throw new AppError("Cannot update sessions while class is pending approval", "CLASS_NOT_EDITABLE", 409);
  }

  if (body.title !== undefined) {
    if (isBlank(body.title)) throw validationError("title must not be empty");
    session.title = body.title;
  }
  if (body.description !== undefined) session.description = body.description;
  if (body.startDatetime !== undefined) session.startDatetime = parseDate(body.startDatetime, "startDatetime");
  if (body.endDatetime !== undefined) session.endDatetime = parseDate(body.endDatetime, "endDatetime");
  if (body.startDatetime !== undefined || body.endDatetime !== undefined) {
    assertSessionTimes(cls || {}, session.startDatetime, session.endDatetime);
  }
  if (body.status !== undefined) {
    if (body.status !== "CANCELLED") throw validationError("status can only be changed to CANCELLED");
    session.status = "CANCELLED";
  }

  await session.save();
  return session.toObject();
};

// Removing a planned session is only possible while the Class has not been submitted/opened
const deleteSession = async (teacherId, sessionId) => {
  await getVerifiedTeacher(teacherId);
  const session = await getOwnSession(teacherId, sessionId);
  const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED }).select("status").lean();
  if (!cls) throw CLASS_NOT_FOUND();
  if (!["DRAFT", "REJECTED"].includes(cls.status)) {
    throw new AppError("Sessions can only be deleted while the class is DRAFT or REJECTED; cancel it instead", "SESSION_NOT_DELETABLE", 409);
  }
  await session.deleteOne();
  return { deleted: true };
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

  // BR-14: Session Room chi truy cap duoc trong thoi gian cho phep
  const now = new Date();
  const windowStart = new Date(session.startDatetime.getTime() - JOIN_WINDOW_BEFORE_MS);
  if (now < windowStart || now > session.endDatetime) {
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
    if (isWaitingRoomWindow) {
      // Pre-open Waiting Room (10m before startDatetime): open waiting room without starting recording yet
      await Session.updateOne(
        { _id: session._id, status: "SCHEDULED" },
        {
          $set: {
            meetingRoomId: session.meetingRoomId,
            roomState: "WAITING",
            lifecycleState: "WAITING",
            preOpenedAt: session.preOpenedAt || now,
            "teacherPresence.firstPreOpenJoinAt": session.teacherPresence?.firstPreOpenJoinAt || now,
            "teacherPresence.lastConnectedAt": now,
            "teacherPresence.isCurrentlyConnected": true,
          },
        }
      );
      session.roomState = "WAITING";
      session.lifecycleState = "WAITING";
    } else if (session.status === "SCHEDULED" || session.status === "WAITING") {
      // TIN-05B-FIX (BUG-TIN05B-02): Atomic conditional transition for Teacher Start
      // Only ONE concurrent request can transition SCHEDULED/WAITING -> IN_PROGRESS and start recording
      const storageKey = `private/${user.id}/RECORDING/${crypto.randomUUID()}.mp4`;
      const expectedPriorStatus = session.status === "WAITING" ? "WAITING" : "SCHEDULED";
      const transitioned = await Session.findOneAndUpdate(
        { _id: session._id, status: expectedPriorStatus },
        {
          $set: {
            status: "IN_PROGRESS",
            roomState: "LIVE",
            lifecycleState: "IN_PROGRESS",
            actualStartAt: session.actualStartAt || now,
            meetingRoomId: session.meetingRoomId,
            "teacherPresence.firstTeachingJoinAt": session.teacherPresence?.firstTeachingJoinAt || now,
            "teacherPresence.lastConnectedAt": now,
            "teacherPresence.isCurrentlyConnected": true,
            "teacherPresence.currentAbsenceStartedAt": null,
          },
        },
        { returnDocument: "after" }
      );

      if (transitioned) {
        // This request won the atomic transition to start LiveKit recording
        const egressId = await videoProvider.startRecording(session.meetingRoomId, storageKey);
        const recordingData = {
          providerRecordingId: egressId || null,
          storageKey: storageKey,
          status: egressId ? "PROCESSING" : "FAILED",
          failureReason: egressId ? null : "Failed to start LiveKit egress",
        };

        // TIN-05C-P2: Bounded retry to save recording metadata with safe compensation
        let metadataSaved = false;
        let lastSaveError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const updateRes = await Session.updateOne(
              { _id: session._id },
              { $set: { recording: recordingData } }
            );
            if (updateRes.matchedCount === 0) {
              throw new AppError("Session no longer exists", "SESSION_NOT_FOUND", 404);
            }
            metadataSaved = true;
            break;
          } catch (saveErr) {
            lastSaveError = saveErr;
            if (saveErr instanceof AppError || saveErr.statusCode || attempt === 2) {
              break;
            }
            await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          }
        }

        if (!metadataSaved) {
          // Safe compensation: ONLY if this request created an Egress (egressId != null)
          if (egressId) {
            let canVerify = false;
            let isPersisted = false;

            try {
              // Read back Session.recording to verify actual persistence outcome
              const checkDoc = await Session.findById(session._id).select("recording").lean();
              canVerify = true;
              if (checkDoc && checkDoc.recording && checkDoc.recording.providerRecordingId === egressId) {
                isPersisted = true;
              }
            } catch (readErr) {
              // MongoDB unreachable or query failed -> UNKNOWN WRITE OUTCOME
              canVerify = false;
            }

            if (canVerify && !isPersisted) {
              // CONFIRMED NOT PERSISTED: safe to stop only the specific Egress owned by this request
              try {
                const compRes = await videoProvider.stopRecording(egressId);
                if (compRes?.reason === "ALREADY_TERMINAL_VERIFIED") {
                  console.info(`[Session Compensation] Egress ${egressId} is already terminal.`);
                } else if (compRes?.reason === "STOP_REQUEST_ACCEPTED") {
                  console.info(`[Session Compensation] Stop request accepted for egress ${egressId}.`);
                } else if (compRes?.reason === "OUTCOME_UNKNOWN") {
                  console.warn(`[Session Compensation] OUTCOME_UNKNOWN for egress ${egressId}. Needs reconciliation.`, {
                    code: compRes.code,
                  });
                } else if (compRes?.reason === "RPC_FAILED") {
                  console.warn(`[Session Compensation] stopRecording RPC failed for egress ${egressId}:`, {
                    code: compRes.code,
                    statusCode: compRes.statusCode,
                  });
                } else if (compRes?.reason === "PROVIDER_NOT_CONFIGURED") {
                  console.warn(`[Session Compensation] Provider not configured; egress ${egressId} cleanup unverified.`);
                } else if (compRes?.reason === "INVALID_EGRESS_ID") {
                  console.warn(`[Session Compensation] Invalid egress ID provided: ${egressId}`);
                }
              } catch (compErr) {
                console.warn(`[Session Compensation] Unexpected error stopping egress ${egressId}:`, compErr.message);
              }
            } else if (!canVerify) {
              // UNKNOWN WRITE OUTCOME: DB query failed, cannot verify persistence -> do NOT blind-stop
              console.warn(
                `[Session Compensation] UNKNOWN_WRITE_OUTCOME for egress ${egressId}: Failed to verify DB persistence status. Blind-stop prevented.`,
                {
                  sessionId: session._id?.toString(),
                  egressId,
                  saveError: lastSaveError?.message,
                }
              );
            } else if (canVerify && isPersisted) {
              // Metadata was actually persisted despite updateOne reporting error -> do NOT stopRecording!
              console.info(`[Session Compensation] Metadata confirmed persisted for egress ${egressId}; stopRecording skipped.`);
            }
          }

          // Never hide or swallow the original save error
          throw lastSaveError;
        }

        // TIN-05B-FINAL (Start vs End race): If session was COMPLETED in the meantime, do not issue host token
        const currentInDb = await Session.findById(session._id).select("status").lean();
        if (currentInDb && (currentInDb.status === "COMPLETED" || currentInDb.status === "CANCELLED")) {
          session.status = currentInDb.status;
          session.recording = recordingData;
          if (currentInDb.status === "COMPLETED") throw new AppError("Session has ended", "SESSION_ENDED", 409);
          if (currentInDb.status === "CANCELLED") throw new AppError("Session has been cancelled", "SESSION_CANCELLED", 409);
        }

        session.status = "IN_PROGRESS";
        session.roomState = "LIVE";
        session.lifecycleState = "IN_PROGRESS";
        session.recording = recordingData;
      } else {
        // Another concurrent Teacher Join request already transitioned the session
        const refreshed = await Session.findById(session._id).lean();
        if (!refreshed || refreshed.status === "COMPLETED") {
          throw new AppError("Session has ended", "SESSION_ENDED", 409);
        }
        if (refreshed.status === "CANCELLED") {
          throw new AppError("Session has been cancelled", "SESSION_CANCELLED", 409);
        }
        session.status = refreshed.status;
        session.recording = refreshed.recording;
      }
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

  const expiresAt = session.endDatetime; // NFR-12: token het han khi buoi hoc ket thuc
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

  // 7. Tac dung phu ngoai vi: Dong phong LiveKit SAU KHI DB transaction da commit thanh cong.
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
    event.event === "room_finished"
  ) {
    await presenceService.handleLiveKitEvent(event);
    return;
  }

  if (!event.egressInfo) return;
  const egressId = event.egressInfo.egressId;
  const status = event.egressInfo.status;
  const error = event.egressInfo.error;

  const session = await Session.findOne({ "recording.providerRecordingId": egressId });
  if (!session || !session.recording) {
    await presenceService.handleLiveKitEvent(event);
    return;
  }

  if (event.event === "egress_ended") {
    // 3 = EGRESS_COMPLETE
    if (status === 3) {
      session.recording.status = "AVAILABLE";
      session.recording.availableAt = new Date();
    } else {
      session.recording.status = "FAILED";
      session.recording.failureReason = error || "Egress failed";
    }
    await session.save();
  }
};

module.exports = { createSessions, updateSession, deleteSession, joinSession, endSession, getSessionAttendance, handleLiveKitWebhook };
