const { Session, Enrollment, Payment } = require("../models");
const sessionService = require("./sessionService");

class StudentService {
  async getMySessions(studentId, fromDate, toDate) {
    // 1. Get confirmed enrollments
    const enrollments = await Enrollment.find({
      studentId,
      enrollmentStatus: "CONFIRMED"
    }).lean();
    
    if (!enrollments.length) return [];
    
    const classIds = enrollments.map(e => e.classId);
    
    // 2. Default date range: today to 14 days later
    const now = new Date();
    const from = fromDate ? new Date(fromDate) : new Date(now.setHours(0,0,0,0));
    const to = toDate ? new Date(toDate) : new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const sessions = await Session.find({
      classId: { $in: classIds },
      startDatetime: { $gte: from, $lte: to }
    }).sort({ startDatetime: 1 }).lean();
    
    const currentNow = new Date();
    
    return sessions.map(s => {
      const start = new Date(s.startDatetime);
      const end = new Date(s.endDatetime);
      const windowStart = new Date(start.getTime() - 15 * 60 * 1000); // 15 mins before
      const canJoin = currentNow >= windowStart && currentNow <= end;
      
      return {
        ...s,
        id: s._id.toString(),
        canJoin
      };
    });
  }

  // Kept for the existing student screens; same checks and response as POST /sessions/:id/join
  async joinSession(studentId, sessionId) {
    return sessionService.joinSession({ id: studentId, role: "STUDENT" }, sessionId);
  }

  async getMyPayments(studentId) {
    const payments = await Payment.find({ payerUserId: studentId }).sort({ createdAt: -1 }).lean();
    
    const enrollmentIds = payments.map(p => p.enrollmentId);
    const enrollments = await Enrollment.find({ _id: { $in: enrollmentIds } })
      .populate("classId", "className")
      .lean();
      
    const enrollmentMap = enrollments.reduce((acc, e) => {
      acc[e._id.toString()] = e;
      return acc;
    }, {});
    
    return payments.map(p => {
      const e = enrollmentMap[p.enrollmentId.toString()];
      return {
        ...p,
        id: p._id.toString(),
        className: e && e.classId ? e.classId.className : "Unknown Class",
        enrollmentStatus: e ? e.enrollmentStatus : "UNKNOWN"
      };
    });
  }
  async getRecording(studentId, sessionId) {
    const mongoose = require("mongoose");
    const { AppError, FORBIDDEN } = require("../utils/errors");
    const storageService = require("./storageService");

    if (!mongoose.isValidObjectId(sessionId)) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    const session = await Session.findById(sessionId).lean();
    if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    
    const enrollment = await Enrollment.exists({ studentId, classId: session.classId, enrollmentStatus: "CONFIRMED" });
    if (!enrollment) throw FORBIDDEN("Not enrolled in this class");
    
    if (!session.recording) throw new AppError("No recording available", "RECORDING_NOT_FOUND", 404);
    
    if (session.recording.status !== "AVAILABLE") {
      return {
        sessionId: session._id.toString(),
        status: session.recording.status,
        durationSeconds: session.recording.durationSeconds,
        availableAt: session.recording.availableAt,
        playbackUrl: null,
        expiresAt: null
      };
    }
    
    const signed = storageService.createSignedUrl(session.recording.storageKey);
    return {
      sessionId: session._id.toString(),
      status: session.recording.status,
      durationSeconds: session.recording.durationSeconds,
      availableAt: session.recording.availableAt,
      playbackUrl: signed ? signed.url : null,
      expiresAt: signed ? signed.expiresAt : null
    };
  }
}

module.exports = new StudentService();
