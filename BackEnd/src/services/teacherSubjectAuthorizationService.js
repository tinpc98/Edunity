const mongoose = require("mongoose");
const { TeacherSubjectAuthorization, Category, Subject, User } = require("../models");
const { TEACHER_SUBJECT_AUTH_STATUSES, GRADE_LEVELS } = require("../models/constants");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { assertId, paged, validationError, isBlank } = require("../utils/http");
const { allowedGradeLevelsForCategory, resolveGradeLevel } = require("../utils/gradeLevel");
const { withoutReviewer } = require("../utils/publicView");
const catalog = require("./courseCatalogService");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");

const authNotFound = () => new AppError("Subject authorization not found", "SUBJECT_AUTHORIZATION_NOT_FOUND", 404);

const toTeacherAuthView = (doc) => {
  if (!doc) return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const base = withoutReviewer(plain);
  delete base.approvedBy;
  delete base.suspendedBy;
  delete base.createdBy;
  delete base.updatedBy;
  if (Array.isArray(base.decisionHistory)) {
    base.decisionHistory = base.decisionHistory.map(({ actorId, ...entry }) => entry);
  }
  return base;
};

const presentAuthorizations = async (docs, { includeTeacher = false } = {}) => {
  if (!docs.length) return [];
  const subjectIds = [...new Set(docs.map((d) => String(d.subjectId)))];
  const categoryIds = [...new Set(docs.map((d) => String(d.categoryId)))];
  const teacherIds = includeTeacher ? [...new Set(docs.map((d) => String(d.teacherId)))] : [];

  const [subjects, categories, teachers] = await Promise.all([
    Subject.find({ _id: { $in: subjectIds } }).select("name slug status").lean(),
    Category.find({ _id: { $in: categoryIds } }).select("name slug status").lean(),
    includeTeacher
      ? User.find({ _id: { $in: teacherIds } }).select("email status teacherProfile.fullName teacherProfile.verificationStatus").lean()
      : Promise.resolve([]),
  ]);

  const byId = (list) => new Map(list.map((item) => [item._id.toString(), item]));
  const subjectMap = byId(subjects);
  const categoryMap = byId(categories);
  const teacherMap = byId(teachers);

  return docs.map((doc) => {
    const subject = subjectMap.get(String(doc.subjectId));
    const category = categoryMap.get(String(doc.categoryId));
    const teacher = includeTeacher ? teacherMap.get(String(doc.teacherId)) : null;
    const enriched = {
      ...doc,
      subjectName: subject ? subject.name : null,
      categoryName: category ? category.name : null,
    };
    if (includeTeacher) {
      enriched.teacher = teacher
        ? {
            id: teacher._id.toString(),
            email: teacher.email,
            status: teacher.status,
            fullName: teacher.teacherProfile ? teacher.teacherProfile.fullName : null,
            verificationStatus: teacher.teacherProfile ? teacher.teacherProfile.verificationStatus : null,
          }
        : null;
    }
    return enriched;
  });
};

const getActiveTeacherAccount = async (teacherId, { actorLabel = "Teacher" } = {}) => {
  assertId(teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  const teacher = await User.findById(teacherId);
  if (!teacher || teacher.isDeleted || teacher.role !== "TEACHER") {
    throw FORBIDDEN(`Only ACTIVE TEACHER accounts can hold subject authorizations`);
  }
  if (teacher.status !== "ACTIVE") {
    throw new AppError(`${actorLabel} account is not active`, "ACCOUNT_NOT_ACTIVE", 403);
  }
  return teacher;
};

const validateAuthorizationScope = async (body = {}) => {
  if (!body.subjectId) throw validationError("subjectId is required");
  const subject = await catalog.getSubjectOrThrow(body.subjectId);
  if (subject.status !== "ACTIVE") {
    throw validationError("Selected subject is not active");
  }

  if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== "") {
    assertId(body.categoryId, "Category not found", "CATEGORY_NOT_FOUND");
    if (String(body.categoryId) !== String(subject.categoryId)) {
      throw new AppError("Subject does not belong to the selected category", "SUBJECT_CATEGORY_MISMATCH", 400);
    }
  }

  const category = await catalog.getCategoryOrThrow(subject.categoryId);
  if (category.status !== "ACTIVE") {
    throw validationError("Selected category is not active");
  }

  const level = catalog.resolveLevel(body.level);
  if (!level) {
    throw validationError("level is required and must be BEGINNER, INTERMEDIATE, or ADVANCED");
  }

  const allowedGrades = allowedGradeLevelsForCategory(category);
  const rawGrade = body.gradeLevel === "" ? null : body.gradeLevel;
  if (allowedGrades && (rawGrade === undefined || rawGrade === null)) {
    const err = new AppError("gradeLevel is required for this category", "GRADE_LEVEL_REQUIRED", 400);
    err.details = { allowedGradeLevels: allowedGrades };
    throw err;
  }

  const gradeLevel = resolveGradeLevel(category, rawGrade);
  return { category, subject, gradeLevel, level };
};

/**
 * TEA-07: Teacher submits a request for teaching authorization in (Subject, GradeLevel, Level).
 * Rejects spoofed body.teacherId, validates catalog references, prevents duplicate / self-reinstated SUSPENDED entries.
 */
const requestAuthorization = async (teacherId, body = {}) => {
  if (body && body.teacherId !== undefined && body.teacherId !== null && String(body.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("Cannot submit a subject authorization request on behalf of another teacher");
  }

  const teacher = await getActiveTeacherAccount(teacherId);
  const { category, subject, gradeLevel, level } = await validateAuthorizationScope(body);

  const existing = await TeacherSubjectAuthorization.findOne({
    teacherId: teacher._id,
    subjectId: subject._id,
    gradeLevel,
    level,
  }).lean();

  if (existing) {
    if (existing.status === "SUSPENDED") {
      throw new AppError(
        "Teaching authorization for this subject, grade level, and level is suspended and can only be reinstated by an Admin",
        "SUBJECT_AUTHORIZATION_SUSPENDED",
        409
      );
    }
    throw new AppError(
      "A subject authorization request or approval already exists for this subject, grade level, and level",
      "DUPLICATE_SUBJECT_AUTHORIZATION",
      409
    );
  }

  const requestNote = isBlank(body.requestNote) ? null : String(body.requestNote).trim();
  const now = new Date();

  let created;
  try {
    created = await TeacherSubjectAuthorization.create({
      teacherId: teacher._id,
      subjectId: subject._id,
      categoryId: category._id,
      gradeLevel,
      level,
      status: "PENDING",
      requestNote,
      requestedAt: now,
      decisionHistory: [
        {
          actorId: teacher._id,
          action: "REQUESTED",
          previousStatus: null,
          newStatus: "PENDING",
          reason: requestNote,
          decidedAt: now,
        },
      ],
      createdBy: teacher._id,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError(
        "A subject authorization already exists for this subject, grade level, and level",
        "DUPLICATE_SUBJECT_AUTHORIZATION",
        409
      );
    }
    throw err;
  }

  const teacherName = teacher.teacherProfile?.fullName || teacher.email;
  await notifyAdmins(
    "Yêu cầu cấp quyền giảng dạy mới",
    `Giảng viên ${teacherName} yêu cầu quyền dạy môn "${subject.name}" (${level}${gradeLevel ? ` - ${gradeLevel}` : ""}).`,
    "TEACHER_SUBJECT_AUTH_REQUESTED"
  );

  const [presented] = await presentAuthorizations([created.toObject()]);
  return toTeacherAuthView(presented);
};

const listMyAuthorizations = async (teacherId, query = {}, paging = { page: 1, pageSize: 20, skip: 0 }) => {
  await getActiveTeacherAccount(teacherId);

  // Strict owner scoping: never allow query.teacherId to read another teacher's authorizations
  const filter = { teacherId };
  if (query.status) {
    if (!TEACHER_SUBJECT_AUTH_STATUSES.includes(query.status)) {
      throw validationError(`status must be one of ${TEACHER_SUBJECT_AUTH_STATUSES.join(", ")}`);
    }
    filter.status = query.status;
  }
  if (query.subjectId) {
    if (!mongoose.isValidObjectId(query.subjectId)) throw validationError("subjectId is invalid");
    filter.subjectId = query.subjectId;
  }
  if (query.level) {
    const resolvedLevel = catalog.resolveLevel(query.level);
    if (resolvedLevel) filter.level = resolvedLevel;
  }
  if (query.gradeLevel !== undefined && query.gradeLevel !== "") {
    if (query.gradeLevel === "null") filter.gradeLevel = null;
    else if (!GRADE_LEVELS.includes(query.gradeLevel)) {
      throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
    } else {
      filter.gradeLevel = query.gradeLevel;
    }
  }

  const [items, total] = await Promise.all([
    TeacherSubjectAuthorization.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    TeacherSubjectAuthorization.countDocuments(filter),
  ]);

  const presented = await presentAuthorizations(items);
  return paged(presented.map(toTeacherAuthView), total, paging);
};

const getMyAuthorization = async (teacherId, authId) => {
  await getActiveTeacherAccount(teacherId);
  assertId(authId, "Subject authorization not found", "SUBJECT_AUTHORIZATION_NOT_FOUND");
  const auth = await TeacherSubjectAuthorization.findById(authId).lean();
  if (!auth) throw authNotFound();
  if (String(auth.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("You can only view your own subject authorizations");
  }
  const [presented] = await presentAuthorizations([auth]);
  return toTeacherAuthView(presented);
};

// ---------- Admin Endpoints ----------

const adminListAuthorizations = async (query = {}, paging = { page: 1, pageSize: 20, skip: 0 }) => {
  const filter = {};
  if (query.status) {
    if (!TEACHER_SUBJECT_AUTH_STATUSES.includes(query.status)) {
      throw validationError(`status must be one of ${TEACHER_SUBJECT_AUTH_STATUSES.join(", ")}`);
    }
    filter.status = query.status;
  }
  for (const field of ["teacherId", "subjectId", "categoryId"]) {
    if (query[field]) {
      if (!mongoose.isValidObjectId(query[field])) throw validationError(`${field} is invalid`);
      filter[field] = query[field];
    }
  }
  if (query.level) {
    const resolvedLevel = catalog.resolveLevel(query.level);
    if (resolvedLevel) filter.level = resolvedLevel;
  }
  if (query.gradeLevel !== undefined && query.gradeLevel !== "") {
    if (query.gradeLevel === "null") filter.gradeLevel = null;
    else if (!GRADE_LEVELS.includes(query.gradeLevel)) {
      throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
    } else {
      filter.gradeLevel = query.gradeLevel;
    }
  }

  const [items, total] = await Promise.all([
    TeacherSubjectAuthorization.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    TeacherSubjectAuthorization.countDocuments(filter),
  ]);
  return paged(await presentAuthorizations(items, { includeTeacher: true }), total, paging);
};

const adminGetAuthorization = async (authId) => {
  assertId(authId, "Subject authorization not found", "SUBJECT_AUTHORIZATION_NOT_FOUND");
  const auth = await TeacherSubjectAuthorization.findById(authId).lean();
  if (!auth) throw authNotFound();
  const [presented] = await presentAuthorizations([auth], { includeTeacher: true });
  return presented;
};

const adminCreateAuthorization = async (adminId, body = {}) => {
  if (!body.teacherId) throw validationError("teacherId is required");
  const teacher = await getActiveTeacherAccount(body.teacherId);
  const { category, subject, gradeLevel, level } = await validateAuthorizationScope(body);

  const initialStatus = body.status || "APPROVED";
  if (!["PENDING", "APPROVED"].includes(initialStatus)) {
    throw validationError("status must be PENDING or APPROVED when creating an authorization");
  }

  const existing = await TeacherSubjectAuthorization.findOne({
    teacherId: teacher._id,
    subjectId: subject._id,
    gradeLevel,
    level,
  }).lean();
  if (existing) {
    throw new AppError(
      "A subject authorization already exists for this teacher, subject, grade level, and level",
      "DUPLICATE_SUBJECT_AUTHORIZATION",
      409
    );
  }

  const now = new Date();
  const note = isBlank(body.reviewNote) ? (isBlank(body.requestNote) ? null : String(body.requestNote).trim()) : String(body.reviewNote).trim();

  let created;
  try {
    created = await TeacherSubjectAuthorization.create({
      teacherId: teacher._id,
      subjectId: subject._id,
      categoryId: category._id,
      gradeLevel,
      level,
      status: initialStatus,
      requestNote: isBlank(body.requestNote) ? null : String(body.requestNote).trim(),
      requestedAt: now,
      approvedBy: initialStatus === "APPROVED" ? adminId : null,
      approvedAt: initialStatus === "APPROVED" ? now : null,
      reviewedBy: initialStatus === "APPROVED" ? adminId : null,
      reviewedAt: initialStatus === "APPROVED" ? now : null,
      reviewNote: note,
      decisionHistory: [
        {
          actorId: adminId,
          action: initialStatus === "APPROVED" ? "CREATED_APPROVED" : "REQUESTED",
          previousStatus: null,
          newStatus: initialStatus,
          reason: note,
          decidedAt: now,
        },
      ],
      createdBy: adminId,
      updatedBy: adminId,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError(
        "A subject authorization already exists for this teacher, subject, grade level, and level",
        "DUPLICATE_SUBJECT_AUTHORIZATION",
        409
      );
    }
    throw err;
  }

  await audit({
    actorAdminId: adminId,
    action: "TEACHER_SUBJECT_AUTHORIZATION_CREATED",
    targetType: "TeacherSubjectAuthorization",
    targetId: created._id,
    beforeState: null,
    afterState: {
      teacherId: String(teacher._id),
      subjectId: String(subject._id),
      gradeLevel,
      level,
      status: initialStatus,
    },
  });

  if (initialStatus === "APPROVED") {
    await notify(
      teacher._id,
      "Bạn đã được cấp quyền giảng dạy",
      `Admin đã phê duyệt quyền dạy môn "${subject.name}" (${level}${gradeLevel ? ` - ${gradeLevel}` : ""}).`,
      "TEACHER_SUBJECT_AUTH_APPROVED"
    );
  }

  const [presented] = await presentAuthorizations([created.toObject()], { includeTeacher: true });
  return presented;
};

const approveAuthorization = async (adminId, authId, body = {}) => {
  assertId(authId, "Subject authorization not found", "SUBJECT_AUTHORIZATION_NOT_FOUND");
  const existing = await TeacherSubjectAuthorization.findById(authId).lean();
  if (!existing) throw authNotFound();
  if (existing.status === "APPROVED") {
    throw new AppError("Subject authorization is already approved", "SUBJECT_AUTHORIZATION_ALREADY_APPROVED", 409);
  }

  const now = new Date();
  const note = isBlank(body.reviewNote) ? null : String(body.reviewNote).trim();
  const updated = await TeacherSubjectAuthorization.findOneAndUpdate(
    { _id: authId, status: { $in: ["PENDING", "SUSPENDED"] } },
    {
      $set: {
        status: "APPROVED",
        approvedBy: adminId,
        approvedAt: now,
        suspendedBy: null,
        suspendedAt: null,
        suspensionReason: null,
        reviewedBy: adminId,
        reviewedAt: now,
        reviewNote: note,
        updatedBy: adminId,
      },
      $push: {
        decisionHistory: {
          actorId: adminId,
          action: "APPROVED",
          previousStatus: existing.status,
          newStatus: "APPROVED",
          reason: note,
          decidedAt: now,
        },
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    throw new AppError("Subject authorization status changed concurrently", "SUBJECT_AUTHORIZATION_CONFLICT", 409);
  }

  await audit({
    actorAdminId: adminId,
    action: "TEACHER_SUBJECT_AUTHORIZATION_APPROVED",
    targetType: "TeacherSubjectAuthorization",
    targetId: updated._id,
    beforeState: { status: existing.status },
    afterState: { status: "APPROVED", reviewNote: note },
  });

  await notify(
    updated.teacherId,
    "Quyền giảng dạy đã được phê duyệt",
    `Yêu cầu quyền giảng dạy (${updated.level}${updated.gradeLevel ? ` - ${updated.gradeLevel}` : ""}) của bạn đã được phê duyệt.`,
    "TEACHER_SUBJECT_AUTH_APPROVED"
  );

  const [presented] = await presentAuthorizations([updated], { includeTeacher: true });
  return presented;
};

const suspendAuthorization = async (adminId, authId, body = {}) => {
  assertId(authId, "Subject authorization not found", "SUBJECT_AUTHORIZATION_NOT_FOUND");
  const rawReason = body.reason !== undefined ? body.reason : body.reviewNote;
  if (isBlank(rawReason)) {
    throw validationError("reason or reviewNote is required when suspending a subject authorization");
  }
  const reason = String(rawReason).trim();

  const existing = await TeacherSubjectAuthorization.findById(authId).lean();
  if (!existing) throw authNotFound();
  if (existing.status === "SUSPENDED") {
    throw new AppError("Subject authorization is already suspended", "SUBJECT_AUTHORIZATION_ALREADY_SUSPENDED", 409);
  }

  const now = new Date();
  const updated = await TeacherSubjectAuthorization.findOneAndUpdate(
    { _id: authId, status: { $in: ["PENDING", "APPROVED"] } },
    {
      $set: {
        status: "SUSPENDED",
        suspendedBy: adminId,
        suspendedAt: now,
        suspensionReason: reason,
        reviewedBy: adminId,
        reviewedAt: now,
        reviewNote: reason,
        updatedBy: adminId,
      },
      $push: {
        decisionHistory: {
          actorId: adminId,
          action: "SUSPENDED",
          previousStatus: existing.status,
          newStatus: "SUSPENDED",
          reason,
          decidedAt: now,
        },
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    throw new AppError("Subject authorization status changed concurrently", "SUBJECT_AUTHORIZATION_CONFLICT", 409);
  }

  await audit({
    actorAdminId: adminId,
    action: "TEACHER_SUBJECT_AUTHORIZATION_SUSPENDED",
    targetType: "TeacherSubjectAuthorization",
    targetId: updated._id,
    beforeState: { status: existing.status },
    afterState: { status: "SUSPENDED", reason },
  });

  await notify(
    updated.teacherId,
    "Quyền giảng dạy đã bị tạm đình chỉ",
    `Quyền giảng dạy (${updated.level}${updated.gradeLevel ? ` - ${updated.gradeLevel}` : ""}) của bạn đã bị tạm đình chỉ. Lý do: ${reason}`,
    "TEACHER_SUBJECT_AUTH_SUSPENDED"
  );

  const [presented] = await presentAuthorizations([updated], { includeTeacher: true });
  return presented;
};

/**
 * Used by CUR-10 class creation/update/submit gates.
 * Checks exact APPROVED match on (teacherId, subjectId, gradeLevel, level) and rejects with explicit 403 error codes.
 */
const assertApprovedAuthorization = async ({ teacherId, subjectId, gradeLevel, level }) => {
  const normalizedLevel = catalog.resolveLevel(level);
  if (!normalizedLevel) {
    throw validationError("Course level is required to check teaching authorization");
  }
  const normalizedGrade = gradeLevel === undefined || gradeLevel === "" ? null : gradeLevel;

  const auth = await TeacherSubjectAuthorization.findOne({
    teacherId,
    subjectId,
    gradeLevel: normalizedGrade,
    level: normalizedLevel,
  }).lean();

  if (!auth) {
    throw new AppError(
      "Teacher does not have an approved authorization for this subject, grade level, and level",
      "SUBJECT_AUTHORIZATION_REQUIRED",
      403
    );
  }
  if (auth.status === "PENDING") {
    throw new AppError(
      "Teacher subject authorization is still pending admin approval",
      "SUBJECT_AUTHORIZATION_PENDING",
      403
    );
  }
  if (auth.status === "SUSPENDED") {
    throw new AppError(
      "Teacher subject authorization has been suspended",
      "SUBJECT_AUTHORIZATION_SUSPENDED",
      403
    );
  }
  if (auth.status !== "APPROVED") {
    throw FORBIDDEN("Teacher subject authorization is not approved");
  }
  return auth;
};

module.exports = {
  requestAuthorization,
  listMyAuthorizations,
  getMyAuthorization,
  adminListAuthorizations,
  adminGetAuthorization,
  adminCreateAuthorization,
  approveAuthorization,
  suspendAuthorization,
  assertApprovedAuthorization,
  toTeacherAuthView,
};

