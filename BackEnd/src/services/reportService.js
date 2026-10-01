const mongoose = require("mongoose");
const { Report, User, Class } = require("../models");
const { AppError } = require("../utils/errors");
const { paged, validationError, isBlank } = require("../utils/http");
const { toUserSummary, PROFILE_SELECT } = require("../utils/userProfile");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");

const REPORT_TYPES = ["TEACHER_ABSENT", "TEACHING_QUALITY", "PAYMENT_DISPUTE", "INAPPROPRIATE_BEHAVIOR", "FRAUD", "OTHER"];
const STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"];
// Complaint handling flow (UC-ADM-06). RESOLVED / REJECTED are final.
const TRANSITIONS = { OPEN: ["IN_REVIEW", "RESOLVED", "REJECTED"], IN_REVIEW: ["RESOLVED", "REJECTED"] };
const FINAL_STATUSES = ["RESOLVED", "REJECTED"];

const reportNotFound = () => new AppError("Report not found", "REPORT_NOT_FOUND", 404);

const present = async (reports) => {
  const userIds = reports.flatMap((r) => [r.reporterId, r.reportedUserId, r.reviewedBy]).filter(Boolean);
  const classIds = reports.map((r) => r.classId).filter(Boolean);
  const [users, classes] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select(PROFILE_SELECT).lean(),
    Class.find({ _id: { $in: classIds } }).select("className teacherName").lean(),
  ]);
  const userMap = new Map(users.map((user) => [user._id.toString(), user]));
  const classMap = new Map(classes.map((cls) => [cls._id.toString(), cls]));
  const summary = (id) => (id ? toUserSummary(userMap.get(id.toString())) : null);

  return reports.map((report) => ({
    ...report,
    reporter: summary(report.reporterId),
    reportedUser: summary(report.reportedUserId),
    handledBy: summary(report.reviewedBy),
    class: report.classId ? classMap.get(report.classId.toString()) || null : null,
  }));
};

// Any signed-in non-admin user can file a complaint about a user and/or a class
const createReport = async (user, body) => {
  if (!REPORT_TYPES.includes(body.type)) throw validationError(`type must be one of ${REPORT_TYPES.join(", ")}`);
  if (isBlank(body.description)) throw validationError("description is required");
  if (body.description.length > 5000) throw validationError("description must be at most 5000 characters");
  if (!body.reportedUserId && !body.classId) throw validationError("reportedUserId or classId is required");

  let reportedUserId = null;
  if (body.reportedUserId) {
    if (!mongoose.isValidObjectId(body.reportedUserId)) throw validationError("reportedUserId is invalid");
    if (body.reportedUserId.toString() === user.id.toString()) throw validationError("You cannot report yourself");
    if (!(await User.exists({ _id: body.reportedUserId }))) throw new AppError("User not found", "USER_NOT_FOUND", 404);
    reportedUserId = body.reportedUserId;
  }

  let classId = null;
  if (body.classId) {
    const cls = mongoose.isValidObjectId(body.classId) ? await Class.findById(body.classId).select("_id").lean() : null;
    if (!cls) throw new AppError("Class not found", "CLASS_NOT_FOUND", 404);
    classId = cls._id;
  }

  const report = await Report.create({ reporterId: user.id, reportedUserId, classId, type: body.type, description: body.description, status: "OPEN" });
  await notifyAdmins("Khiếu nại mới", body.description.slice(0, 100), "REPORT_CREATED");
  return report.toObject();
};

const getMyReports = async (userId, paging) => {
  const filter = { reporterId: userId };
  const [items, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Report.countDocuments(filter),
  ]);
  return paged(await present(items), total, paging);
};

const adminListReports = async (query, paging) => {
  const filter = {};
  if (query.status) {
    const statuses = String(query.status).split(",");
    if (statuses.some((status) => !STATUSES.includes(status))) throw validationError("status is invalid");
    filter.status = { $in: statuses };
  }
  if (query.type) filter.type = query.type;

  const [items, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Report.countDocuments(filter),
  ]);
  return paged(await present(items), total, paging);
};

const adminGetReport = async (reportId) => {
  if (!mongoose.isValidObjectId(reportId)) throw reportNotFound();
  const report = await Report.findById(reportId).lean();
  if (!report) throw reportNotFound();
  const [presented] = await present([report]);
  return presented;
};

// FR-ADM-20: Admin takes the complaint in review, then resolves or rejects it with a note
const adminUpdateReport = async (adminId, reportId, body) => {
  const current = await adminGetReport(reportId);
  const { status } = body;
  if (!(TRANSITIONS[current.status] || []).includes(status)) {
    throw new AppError(`A ${current.status} report cannot be moved to ${status}`, "INVALID_REPORT_STATUS", 409);
  }
  if (FINAL_STATUSES.includes(status) && isBlank(body.reviewNote)) {
    throw validationError("reviewNote is required when resolving or rejecting a report");
  }

  const updated = await Report.findOneAndUpdate(
    { _id: current._id, status: current.status },
    { $set: { status, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: body.reviewNote || current.reviewNote || null } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw new AppError("Report was updated by someone else", "INVALID_REPORT_STATUS", 409);

  await audit({
    actorAdminId: adminId,
    action: `REPORT_${status}`,
    targetType: "Report",
    targetId: updated._id,
    beforeState: { status: current.status },
    afterState: { status, reviewNote: updated.reviewNote },
  });

  if (FINAL_STATUSES.includes(status)) {
    const title = status === "RESOLVED" ? "Khiếu nại đã được xử lý" : "Khiếu nại bị từ chối";
    await notify(updated.reporterId, title, updated.reviewNote, `REPORT_${status}`);
  }
  const [presented] = await present([updated]);
  return presented;
};

module.exports = { REPORT_TYPES, createReport, getMyReports, adminListReports, adminGetReport, adminUpdateReport };
