// A class that never opened must not keep live sessions: no schedule entry, no reminder, no no-show penalty.
const { User, Category, Subject, Course, Class, Session, TeacherViolation, Notification } = require("../src/models");
const { rejectClass } = require("../src/services/adminClassService");
const { rejectExpiredPendingClasses } = require("../src/jobs/maintenanceJob");
const { evaluateSessionLifecycleAt } = require("../src/services/sessionPresenceService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
let admin, teacher, course;

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});
afterAll(disconnectDB);

beforeEach(async () => {
  await clearDB();
  admin = await User.create({ email: "admin@rej.test", passwordHash: "x", role: "ADMIN", status: "ACTIVE" });
  teacher = await User.create({
    email: "teacher@rej.test",
    passwordHash: "x",
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: { fullName: "Giáo viên", verificationStatus: "VERIFIED" },
  });
  const category = await Category.create({ name: "THPT", slug: "thpt-rej", createdBy: admin._id });
  const subject = await Subject.create({ name: "Toán", slug: "toan-rej", categoryId: category._id, categoryName: category.name, createdBy: admin._id });
  course = await Course.create({
    title: "Toán 12",
    slug: "toan-12-rej",
    categoryId: category._id,
    categoryName: category.name,
    subjectId: subject._id,
    subjectName: subject.name,
    gradeLevel: "GRADE_12",
    level: "ADVANCED",
    createdBy: admin._id,
  });
});

const mkClass = (status, startDate = new Date(Date.now() + DAY)) =>
  Class.create({
    courseId: course._id,
    courseTitle: course.title,
    teacherId: teacher._id,
    teacherName: "Giáo viên",
    categoryId: course.categoryId,
    subjectId: course.subjectId,
    gradeLevel: "GRADE_12",
    level: "ADVANCED",
    className: `Lớp ${status}`,
    classType: "FREE",
    price: 0,
    capacity: 20,
    status,
    startDate,
    endDate: new Date(startDate.getTime() + 30 * DAY),
    enrollmentStart: new Date(startDate.getTime() - 10 * DAY),
    enrollmentEnd: startDate,
    schedule: [{ dayOfWeek: 1, startTime: "18:00", endTime: "19:30" }],
  });
const mkSession = (cls, start, extra = {}) =>
  Session.create({
    classId: cls._id,
    className: cls.className,
    teacherId: teacher._id,
    title: "Buổi 1",
    startDatetime: start,
    endDatetime: new Date(start.getTime() + 90 * MIN),
    ...extra,
  });
const states = async (s) => {
  const { status, roomState, lifecycleState } = await Session.findById(s._id).lean();
  return [status, roomState, lifecycleState];
};
const CANCELLED = ["CANCELLED", "CANCELLED", "CANCELLED"];

test("rejecting a class cancels its planned sessions, and only its own", async () => {
  const cls = await mkClass("PENDING_APPROVAL");
  const other = await mkClass("PENDING_APPROVAL");
  const planned = await mkSession(cls, new Date(Date.now() + DAY));
  const waiting = await mkSession(cls, new Date(Date.now() + 2 * DAY), { status: "WAITING" });
  const untouched = await mkSession(other, new Date(Date.now() + DAY));

  await rejectClass(admin._id, cls._id.toString(), { reviewNote: "Thiếu tài liệu" });

  expect(await states(planned)).toEqual(CANCELLED);
  expect(await states(waiting)).toEqual(CANCELLED);
  expect((await Session.findById(untouched._id).lean()).status).toBe("SCHEDULED");
});

test("the automatic rejection of an expired pending class cancels its sessions too", async () => {
  const start = new Date("2026-11-18T17:00:00.000Z");
  const cls = await mkClass("PENDING_APPROVAL", start);
  const planned = await mkSession(cls, new Date("2026-11-21T11:00:00.000Z"));

  const result = await rejectExpiredPendingClasses(new Date("2026-11-20T10:00:00.000Z"), { tzOffsetMinutes: 420 });

  expect(result.rejectedCount).toBe(1);
  expect(await states(planned)).toEqual(CANCELLED);
});

test.each(["DRAFT", "PENDING_APPROVAL", "NEED_CHANGES", "REJECTED"])(
  "no no-show penalty or notice for a session of a %s class",
  async (status) => {
    const start = new Date(Date.now() - 40 * MIN);
    const s = await mkSession(await mkClass(status), start);

    await evaluateSessionLifecycleAt(s._id, new Date(start.getTime() + 31 * MIN));

    expect((await Session.findById(s._id).lean()).status).toBe("SCHEDULED");
    expect(await TeacherViolation.countDocuments({})).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);
  }
);

test("an OPEN class is still penalised for a no-show", async () => {
  const start = new Date(Date.now() - 40 * MIN);
  const s = await mkSession(await mkClass("OPEN"), start);

  await evaluateSessionLifecycleAt(s._id, new Date(start.getTime() + 31 * MIN));

  expect((await Session.findById(s._id).lean()).status).toBe("CANCELLED");
  expect(await TeacherViolation.countDocuments({ teacherId: teacher._id })).toBeGreaterThan(0);
});
