const mongoose = require("mongoose");
const { Class, Session, SessionAttendance, Enrollment, User } = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { validationError, parseDate, isBlank } = require("../utils/http");
const { getDisplayProfile } = require("../utils/userProfile");
const videoProvider = require("./videoProvider");
const { getOwnClass, isSessionWithinClass } = require("./teacherClassService");

const JOIN_WINDOW_BEFORE_MS = 15 * 60 * 1000; // same join window as GET /me/sessions (canJoin)
const LATE_AFTER_MS = 15 * 60 * 1000;
const CLOSED_CLASS_STATUSES = ["COMPLETED", "CANCELLED"];

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
  const cls = await getOwnClass(teacherId, classId);
  if (CLOSED_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Cannot add sessions to a completed or cancelled class", "CLASS_CLOSED", 409);
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
  const session = await getOwnSession(teacherId, sessionId);
  if (session.status !== "SCHEDULED") {
    throw new AppError("Only SCHEDULED sessions can be updated", "SESSION_NOT_EDITABLE", 409);
  }
  const cls = await Class.findById(session.classId);

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
  const session = await getOwnSession(teacherId, sessionId);
  const cls = await Class.findById(session.classId).select("status").lean();
  if (cls && !["DRAFT", "REJECTED"].includes(cls.status)) {
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
  } else {
    throw FORBIDDEN("Only STUDENT or TEACHER can join a session");
  }

  if (session.status === "CANCELLED") throw new AppError("Session has been cancelled", "SESSION_CANCELLED", 409);
  if (session.status === "COMPLETED") throw new AppError("Session has ended", "SESSION_ENDED", 409);

  // BR-14: Session Room chỉ truy cập được trong thời gian cho phép
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
  if (role === "HOST" && session.status === "SCHEDULED") session.status = "IN_PROGRESS";
  if (session.isModified()) await session.save();

  if (role === "PARTICIPANT") {
    const late = now.getTime() > session.startDatetime.getTime() + LATE_AFTER_MS;
    await SessionAttendance.updateOne(
      { sessionId: session._id, studentId: user.id },
      {
        $setOnInsert: {
          classId: session.classId,
          joinedAt: now,
          attendanceStatus: late ? "LATE" : "PRESENT",
        },
      },
      { upsert: true }
    );
  }

  const expiresAt = session.endDatetime; // NFR-12: token hết hạn khi buổi học kết thúc
  const account = await User.findById(user.id).select("role studentProfile teacherProfile").lean();
  const { provider, serverUrl, accessToken } = videoProvider.createJoinToken({
    roomId: session.meetingRoomId,
    sessionId: session._id.toString(),
    userId: user.id.toString(),
    displayName: getDisplayProfile(account).fullName,
    role,
    expiresAt,
  });

  return {
    sessionId: session._id.toString(),
    roomId: session.meetingRoomId,
    provider,
    serverUrl,
    accessToken,
    role,
    expiresAt,
  };
};

// UC-TEA-05: khi kết thúc Session = COMPLETED, Attendance được cập nhật
const endSession = async (teacherId, sessionId) => {
  const session = await getOwnSession(teacherId, sessionId);
  if (session.status !== "IN_PROGRESS") {
    throw new AppError("Only an IN_PROGRESS session can be ended", "SESSION_NOT_IN_PROGRESS", 409);
  }

  const now = new Date();
  session.status = "COMPLETED";
  await session.save();
  await videoProvider.closeRoom(session.meetingRoomId); // force-disconnect whoever is still in the room

  await SessionAttendance.updateMany({ sessionId: session._id, leftAt: null }, { $set: { leftAt: now } });

  const [enrollments, attended] = await Promise.all([
    Enrollment.find({ classId: session.classId, enrollmentStatus: "CONFIRMED" }).select("studentId").lean(),
    SessionAttendance.find({ sessionId: session._id }).select("studentId").lean(),
  ]);
  const attendedIds = new Set(attended.map((row) => row.studentId.toString()));
  const absent = enrollments.filter((enrollment) => !attendedIds.has(enrollment.studentId.toString()));
  if (absent.length) {
    await SessionAttendance.insertMany(
      absent.map((enrollment) => ({
        sessionId: session._id,
        classId: session.classId,
        studentId: enrollment.studentId,
        attendanceStatus: "ABSENT",
      })),
      { ordered: false }
    );
  }

  return { ...session.toObject(), attendance: { present: attendedIds.size, absent: absent.length } };
};

// FR-TEA-13: attendance list of a session for the owning Teacher
const getSessionAttendance = async (teacherId, sessionId) => {
  const session = await getOwnSession(teacherId, sessionId);
  return SessionAttendance.find({ sessionId: session._id })
    .populate("studentId", "email studentProfile.fullName studentProfile.avatarUrl")
    .lean();
};

module.exports = { createSessions, updateSession, deleteSession, joinSession, endSession, getSessionAttendance };
