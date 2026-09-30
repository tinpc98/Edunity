const { Session, Enrollment, Payment } = require("../models");
const { AppError } = require("../utils/errors");

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

  async joinSession(studentId, sessionId) {
    const session = await Session.findById(sessionId).lean();
    if (!session) throw new AppError("SESSION_NOT_FOUND", "Session not found", 404);
    
    const enrollment = await Enrollment.findOne({
      studentId,
      classId: session.classId,
      enrollmentStatus: "CONFIRMED"
    }).lean();
    
    if (!enrollment) throw new AppError("NOT_ENROLLED", "Not enrolled in this class", 403);
    
    const now = new Date();
    const start = new Date(session.startDatetime);
    const end = new Date(session.endDatetime);
    const windowStart = new Date(start.getTime() - 15 * 60 * 1000);
    
    if (now < windowStart || now > end) {
      throw new AppError("SESSION_NOT_JOINABLE", `Session not joinable yet. Starts at ${session.startDatetime.toISOString()}`, 409);
    }
    
    const roomId = session.meetingRoomId || `room-${session._id}`;
    
    return {
      sessionId: session._id.toString(),
      roomId,
      joinUrl: `https://meet.edunity.com/${roomId}`,
      expiresAt: session.endDatetime
    };
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
}

module.exports = new StudentService();
