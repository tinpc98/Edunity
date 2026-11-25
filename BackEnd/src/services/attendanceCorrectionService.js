const { Types } = require("mongoose");
const { Enrollment, Session, SessionAttendance } = require("../models");
const { AppError } = require("../utils/errors");
const { assertId, paged, validationError } = require("../utils/http");
const { getVerifiedTeacher } = require("./teacherClassService");
const { getOwnSession } = require("./sessionService");
const { computeStudentAttendance } = require("./sessionPresenceService");
const { notify, notifyAdmins } = require("./notificationService");

const correctableStatuses = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];
const statusLabels = { PRESENT: "Có mặt", LATE: "Vào muộn", ABSENT: "Vắng", EXCUSED: "Vắng có phép" };
const notFound = () => new AppError("Attendance record not found", "ATTENDANCE_NOT_FOUND", 404);
const conflict = () => new AppError("Attendance request has changed", "ATTENDANCE_CORRECTION_CONFLICT", 409);

const requireFinalAttendance = (session, attendance) => {
  const ended = session && (session.status === "COMPLETED" ||
    (session.status === "INTERRUPTED" && session.roomState === "ENDED"));
  if (!ended || !(session.attendanceFinalizedAt || attendance.finalizedAt)) {
    throw new AppError("Attendance can only be corrected after a completed session is finalized", "ATTENDANCE_NOT_FINALIZED", 409);
  }
};

const requiredNote = (input, field) => {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value || value.length > 1000) throw validationError(`${field} must contain 1–1000 characters`);
  return value;
};

const requestCorrection = async (teacherId, sessionId, attendanceId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const session = await getOwnSession(teacherId, sessionId);
  assertId(attendanceId, "Attendance record not found", "ATTENDANCE_NOT_FOUND");
  const reason = requiredNote(body.reason, "reason");
  if (!correctableStatuses.includes(body.requestedStatus)) throw validationError("Invalid attendance status");

  const attendance = await SessionAttendance.findOne({ _id: attendanceId, sessionId: session._id }).lean();
  if (!attendance || !(await Enrollment.exists({
    classId: session.classId,
    studentId: attendance.studentId,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  }))) throw notFound();
  requireFinalAttendance(session, attendance);

  const request = {
    _id: new Types.ObjectId(),
    status: "PENDING",
    requestedBy: teacherId,
    requestedAt: new Date(),
    requestedStatus: body.requestedStatus,
    reason,
  };
  const updated = await SessionAttendance.updateOne(
    { _id: attendance._id, "correctionRequest.status": { $ne: "PENDING" } },
    { $set: { correctionRequest: request } },
    { runValidators: true }
  );
  if (updated.modifiedCount !== 1) throw conflict();

  await notifyAdmins("Yêu cầu điều chỉnh điểm danh", `Có yêu cầu mới cho buổi học “${session.title}”.`,
    "ATTENDANCE_CORRECTION_REQUESTED", { sessionId: session._id, dedupeKey: `attendance-request:${request._id}` });
  return { id: request._id, status: request.status };
};

const listCorrections = async (query, paging) => {
  const status = query.status || "PENDING";
  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) throw validationError("Invalid correction status");
  const filter = { "correctionRequest.status": status };
  const [items, total] = await Promise.all([
    SessionAttendance.find(filter)
      .select("sessionId classId studentId attendanceStatus attendancePercentage correctionRequest +correctionHistory")
      .populate("sessionId", "title startDatetime")
      .populate("classId", "className")
      .populate("studentId", "studentProfile.fullName")
      .populate("correctionRequest.requestedBy", "teacherProfile.fullName")
      .sort({ "correctionRequest.requestedAt": -1, _id: -1 })
      .skip(paging.skip).limit(paging.pageSize).lean(),
    SessionAttendance.countDocuments(filter),
  ]);
  return paged(items, total, paging);
};

const reviewCorrection = async (adminId, attendanceId, requestId, body = {}) => {
  assertId(attendanceId, "Attendance record not found", "ATTENDANCE_NOT_FOUND");
  assertId(requestId, "Attendance request not found", "ATTENDANCE_CORRECTION_NOT_FOUND");
  const { decision, attendanceStatus } = body;
  if (!["MANUAL", "LIVEKIT", "REJECT"].includes(decision)) throw validationError("Invalid review decision");
  const reviewNote = requiredNote(body.reviewNote, "reviewNote");
  if (decision === "MANUAL" && !correctableStatuses.includes(attendanceStatus)) throw validationError("Invalid attendance status");

  const attendance = await SessionAttendance.findById(attendanceId).lean();
  if (!attendance) throw notFound();
  const request = attendance.correctionRequest;
  if (request?.status !== "PENDING" || String(request._id) !== requestId) throw conflict();
  const session = await Session.findById(attendance.sessionId).lean();
  // A request can still be rejected after an incident cancels the session.
  if (decision !== "REJECT") requireFinalAttendance(session, attendance);

  const now = new Date();
  const before = { status: attendance.attendanceStatus, percent: attendance.attendancePercentage };
  let fields = {};
  if (decision === "LIVEKIT") {
    const reference = session.actualEndAt || session.attendanceFinalizedAt || attendance.finalizedAt || now;
    const computed = await computeStudentAttendance(session, attendance.studentId, reference, true, true);
    if (!computed.hasClosedTeachingIntervals) {
      throw new AppError("There are insufficient closed LiveKit intervals to recalculate attendance", "ATTENDANCE_EVIDENCE_INSUFFICIENT", 409);
    }
    fields = computed.updateFields;
  } else if (decision === "MANUAL") {
    fields = {
      attendanceStatus,
      evaluationStatus: attendanceStatus === "EXCUSED" ? "EXCUSED" : "FINALIZED",
      evaluationReason: "Attendance corrected by an administrator",
      isLate: attendanceStatus === "LATE",
    };
  }

  const approved = decision !== "REJECT";
  const resolved = {
    ...request,
    status: approved ? "APPROVED" : "REJECTED",
    reviewedBy: adminId,
    reviewedAt: now,
    reviewNote,
    ...(approved ? { method: decision } : {}),
    before,
    after: {
      status: fields.attendanceStatus ?? before.status,
      percent: fields.attendancePercentage ?? before.percent,
    },
  };
  const updated = await SessionAttendance.updateOne(
    {
      _id: attendance._id,
      updatedAt: attendance.updatedAt,
      "correctionRequest._id": request._id,
      "correctionRequest.status": "PENDING",
    },
    {
      $set: { ...fields, correctionRequest: resolved, ...(approved ? { correctionAppliedAt: now } : {}) },
      $push: { correctionHistory: resolved },
    },
    { runValidators: true }
  );
  if (updated.modifiedCount !== 1) throw conflict();

  const title = approved ? "Đã điều chỉnh điểm danh" : "Đã xem xét yêu cầu điểm danh";
  const sessionLabel = session?.title || "buổi học";
  const content = approved
    ? `Kết quả của buổi “${sessionLabel}” đã được cập nhật thành ${statusLabels[resolved.after.status] || "đã đánh giá"}.`
    : `Yêu cầu điều chỉnh cho buổi “${sessionLabel}” đã bị từ chối.`;
  await Promise.all([attendance.studentId, request.requestedBy].map((recipient) =>
    notify(recipient, title, content, "ATTENDANCE_CORRECTION_REVIEWED", {
      sessionId: attendance.sessionId,
      dedupeKey: `attendance-review:${request._id}`,
    })
  ));
  return { status: resolved.status, attendanceStatus: resolved.after.status };
};

const getStudentAttendance = async (studentId, sessionId) => {
  assertId(sessionId, "Session not found", "SESSION_NOT_FOUND");
  const row = await SessionAttendance.findOne({ sessionId, studentId })
    .select("attendanceStatus attendancePercentage evaluationStatus correctionRequest").lean();
  if (!row) return null;
  const correction = row.correctionRequest;
  return {
    attendanceStatus: row.attendanceStatus,
    attendancePercentage: row.attendancePercentage,
    evaluationStatus: row.evaluationStatus,
    correction: correction && {
      status: correction.status,
      method: correction.method,
      before: correction.before,
      after: correction.after,
      reviewedAt: correction.reviewedAt,
    },
  };
};

module.exports = { requestCorrection, listCorrections, reviewCorrection, getStudentAttendance };
