const request = require("supertest");
const app = require("../src/app");
const { User, Class, Enrollment, Session, SessionAttendance, SessionPresenceInterval, Notification } = require("../src/models");
const { finalizeSessionAttendance } = require("../src/services/sessionPresenceService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const { seedActorsAndCatalog } = require("./helpers/financialFixtures");

let admin, teacher, student, otherStudent, otherTeacher, session, row;

const call = (actor, method, route, body) => {
  const req = request(app)[method](`/api${route}`).set("x-user-id", actor.id);
  return body ? req.send(body) : req;
};
const requestPath = () => `/teacher/sessions/${session.id}/attendance/${row.id}/corrections`;
const reviewPath = (id) => `/admin/attendance-corrections/${row.id}/${id}/review`;
const propose = (actor = teacher) => call(actor, "post", requestPath(), {
  requestedStatus: "PRESENT", reason: "Học viên vào lại sau khi bị ngắt kết nối.",
});

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});
afterAll(disconnectDB);

beforeEach(async () => {
  await clearDB();
  const actors = await seedActorsAndCatalog();
  ({ admin, teacher, student } = actors);
  await User.updateOne({ _id: teacher._id }, { $set: { "teacherProfile.verificationStatus": "VERIFIED" } });
  [otherStudent, otherTeacher] = await User.create([
    { role: "STUDENT", email: "other-student@attendance.test", passwordHash: "fixture" },
    {
      role: "TEACHER", email: "other-teacher@attendance.test", passwordHash: "fixture",
      teacherProfile: { fullName: "Giáo viên khác", verificationStatus: "VERIFIED" },
    },
  ]);
  const cls = await Class.create({
    className: "Lớp kiểm thử", courseId: actors.course._id, courseTitle: actors.course.title,
    teacherId: teacher._id, teacherName: teacher.teacherProfile.fullName,
    categoryId: actors.category._id, subjectId: actors.subject._id,
    classType: "FREE", price: 0, capacity: 10, status: "OPEN",
  });
  await Enrollment.create({
    classId: cls._id, courseId: cls.courseId, studentId: student._id, teacherId: teacher._id,
    enrollmentStatus: "CONFIRMED", paymentSource: "FREE",
  });
  const endDatetime = new Date(Date.now() - 60000);
  session = await Session.create({
    classId: cls._id, className: cls.className, teacherId: teacher._id, title: "Buổi học",
    startDatetime: new Date(endDatetime.getTime() - 60 * 60000), endDatetime,
    status: "COMPLETED", roomState: "ENDED", lifecycleState: "COMPLETED",
    attendanceFinalizedAt: endDatetime, actualEndAt: endDatetime,
  });
  row = await SessionAttendance.create({
    sessionId: session._id, classId: cls._id, studentId: student._id,
    attendanceStatus: "ABSENT", evaluationStatus: "FINALIZED", finalizedAt: endDatetime,
  });
});

test("only the owner can request a correction and only one admin can decide it", async () => {
  expect((await propose(otherTeacher)).status).toBe(403);
  const requests = await Promise.all([propose(), propose()]);
  expect(requests.map(({ status }) => status).sort()).toEqual([201, 409]);
  const requestId = requests.find(({ status }) => status === 201).body.data.id;
  expect((await call(student, "get", "/admin/attendance-corrections")).status).toBe(403);
  const queue = await call(admin, "get", "/admin/attendance-corrections");
  expect(queue.body.data.items[0].correctionRequest.requestedBy.teacherProfile.fullName).toBe(teacher.teacherProfile.fullName);
  const decision = { decision: "MANUAL", attendanceStatus: "EXCUSED", reviewNote: "Đã xác nhận lý do nghỉ." };
  const decisions = await Promise.all([
    call(admin, "post", reviewPath(requestId), decision),
    call(admin, "post", reviewPath(requestId), decision),
  ]);
  expect(decisions.map(({ status }) => status).sort()).toEqual([200, 409]);
  await finalizeSessionAttendance(session._id, { forceRecalculate: true });
  const privateResult = (await call(student, "get", `/student/sessions/${session.id}/attendance`)).body.data.attendance;
  expect(privateResult).toMatchObject({
    attendanceStatus: "EXCUSED", correction: { before: { status: "ABSENT" }, after: { status: "EXCUSED" } },
  });
  expect(privateResult.correction.reviewNote).toBeUndefined();
  expect((await call(otherStudent, "get", `/student/sessions/${session.id}/attendance`)).body.data.attendance).toBeNull();
  const stored = await SessionAttendance.findById(row._id).select("+correctionHistory").lean();
  expect(stored.correctionHistory).toHaveLength(1);
  expect(await Notification.countDocuments({ type: "ATTENDANCE_CORRECTION_REVIEWED" })).toBe(2);
});

test("recomputes from closed LiveKit intervals and keeps the original evidence", async () => {
  await Session.updateOne({ _id: session._id }, { $set: { status: "IN_PROGRESS" } });
  expect((await propose()).body.error).toBe("ATTENDANCE_NOT_FINALIZED");
  await Session.updateOne({ _id: session._id }, { $set: { status: "COMPLETED" } });
  const requestId = (await propose()).body.data.id;
  const decision = { decision: "LIVEKIT", reviewNote: "Đối chiếu nhật ký lớp." };
  expect((await call(admin, "post", reviewPath(requestId), decision)).body.error).toBe("ATTENDANCE_EVIDENCE_INSUFFICIENT");
  const interval = (id, source, minutes) => ({
    classId: row.classId, sessionId: session._id, userId: student._id, role: "STUDENT",
    connectionSessionId: id, source, connectedAt: session.startDatetime,
    disconnectedAt: new Date(session.startDatetime.getTime() + minutes * 60000),
  });
  await SessionPresenceInterval.create([
    interval("join-api", "JOIN_API", 60),
    interval("verified-room", "LIVEKIT_WEBHOOK", 48),
  ]);
  expect((await call(admin, "post", reviewPath(requestId), decision)).status).toBe(200);
  const updated = await SessionAttendance.findById(row._id).lean();
  expect(updated).toMatchObject({ attendanceStatus: "PRESENT", attendancePercentage: 80, correctionRequest: { method: "LIVEKIT" } });
  expect(await SessionPresenceInterval.countDocuments({ sessionId: session._id })).toBe(2);
});
