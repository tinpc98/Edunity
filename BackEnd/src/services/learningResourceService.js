const mongoose = require("mongoose");
const {
  LearningResource,
  Course,
  SyllabusVersion,
  CurriculumUnit,
  Class,
  Session,
  Enrollment,
  TeacherSubjectAuthorization,
} = require("../models");
const {
  LEARNING_RESOURCE_SCOPES,
  LEARNING_RESOURCE_KINDS,
  LEARNING_RESOURCE_SOURCE_TYPES,
  LEARNING_RESOURCE_STATUSES,
} = require("../models/constants");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, isBlank } = require("../utils/http");
const { getVerifiedTeacher } = require("./teacherClassService");
const storageService = require("./storageService");
const { audit } = require("./auditService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const resourceNotFound = () => new AppError("Learning resource not found", "LEARNING_RESOURCE_NOT_FOUND", 404);

const LEGACY_TYPE_TO_KIND = {
  LESSON: "LESSON_NOTE",
  MATERIAL: "DOCUMENT",
  ASSIGNMENT: "EXERCISE",
};

const assertOptionalString = (value, field) => {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`);
  }
  return value;
};

const assertOptionalBoolean = (value, field) => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw validationError(`${field} must be a boolean`);
  }
  return value;
};

const assertOptionalEnum = (value, allowed, field, upper = true) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`);
  }
  const normalized = upper ? value.trim().toUpperCase() : value.trim().toLowerCase();
  if (!normalized) return null;
  if (!allowed.includes(normalized)) {
    throw validationError(`${field} must be one of ${allowed.join(", ")}`);
  }
  return normalized;
};

const assertQueryObjectId = (value, message, code, field = "id") => {
  if (typeof value !== "string" && !(value instanceof mongoose.Types.ObjectId)) {
    throw validationError(`${field} must be a valid identifier string`);
  }
  assertId(value, message, code);
  return value;
};

const validateExternalUrl = (value, field = "externalUrl") => {
  if (typeof value !== "string" || !/^https?:\/\/\S+$/i.test(value.trim())) {
    throw validationError(`${field} must be a valid http(s) URL`);
  }
  return value.trim();
};

const normalizeOptionalInt = (val, field, min = 1) => {
  if (val === undefined || val === null || val === "") return undefined;
  if (
    typeof val === "boolean" ||
    Array.isArray(val) ||
    (typeof val === "object" && val !== null)
  ) {
    throw validationError(`${field} must be an integer >= ${min}`);
  }
  const num = Number(val);
  if (!Number.isInteger(num) || num < min) {
    throw validationError(`${field} must be an integer >= ${min}`);
  }
  return num;
};

const normalizeFileSize = (val) => {
  if (
    typeof val === "boolean" ||
    Array.isArray(val) ||
    (typeof val === "object" && val !== null) ||
    (typeof val === "string" && val.trim() === "")
  ) {
    throw validationError("fileSizeBytes must be >= 0");
  }
  const sz = Number(val);
  if (!Number.isFinite(sz) || sz < 0) throw validationError("fileSizeBytes must be >= 0");
  return sz;
};

const presentResource = (doc, role) => {
  if (!doc) return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const id = plain._id ? plain._id.toString() : plain.id;
  if (role === "ADMIN") {
    return { ...plain, id };
  }
  const safe = {
    id,
    scopeType: plain.scopeType,
    courseId: plain.courseId ? plain.courseId.toString() : null,
    syllabusVersionId: plain.syllabusVersionId ? plain.syllabusVersionId.toString() : null,
    curriculumUnitId: plain.curriculumUnitId ? plain.curriculumUnitId.toString() : null,
    classId: plain.classId ? plain.classId.toString() : null,
    sessionId: plain.sessionId ? plain.sessionId.toString() : null,
    teacherId: plain.teacherId ? plain.teacherId.toString() : null,
    title: plain.title,
    description: plain.description || "",
    resourceKind: plain.resourceKind,
    sourceType: plain.sourceType,
    hasFile: plain.sourceType === "STORAGE_FILE" && Boolean(plain.storageKey),
    mimeType: plain.mimeType || null,
    originalName: plain.originalName || null,
    fileSizeBytes: plain.fileSizeBytes ?? null,
    externalUrl: plain.externalUrl || null,
    contentText: plain.contentText || null,
    order: plain.order,
    isDownloadable: plain.isDownloadable !== false,
    status: plain.status,
    legacySessionContent: plain.legacySessionContent && plain.legacySessionContent.contentItemId
      ? plain.legacySessionContent
      : null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
  if (role === "TEACHER") {
    // Teacher owning a class/session resource can see storageKey metadata for management;
    // Students never receive raw internal storageKey paths.
    safe.storageKey = plain.storageKey || null;
  }
  return safe;
};

const assertScopeHierarchy = async (body, existing = null, dbSession = null) => {
  const withSess = (q) => (dbSession ? q.session(dbSession) : q);
  const scopeTypeRaw = body.scopeType !== undefined ? body.scopeType : existing?.scopeType;
  if (!scopeTypeRaw) throw validationError("scopeType is required");
  if (typeof scopeTypeRaw !== "string") throw validationError("scopeType must be a string");
  const scopeType = scopeTypeRaw.trim().toUpperCase();
  if (!LEARNING_RESOURCE_SCOPES.includes(scopeType)) {
    throw validationError(`scopeType must be one of ${LEARNING_RESOURCE_SCOPES.join(", ")}`);
  }

  let courseId = body.courseId !== undefined ? body.courseId : existing?.courseId;
  let classId = body.classId !== undefined ? body.classId : existing?.classId;
  let sessionId = body.sessionId !== undefined ? body.sessionId : existing?.sessionId;
  const syllabusVersionId =
    body.syllabusVersionId !== undefined ? body.syllabusVersionId : existing?.syllabusVersionId;
  const curriculumUnitId =
    body.curriculumUnitId !== undefined ? body.curriculumUnitId : existing?.curriculumUnitId;

  let teacherId = existing?.teacherId || null;

  if (scopeType === "COURSE") {
    if (!courseId) throw validationError("courseId is required when scopeType is COURSE");
    assertQueryObjectId(courseId, "Course not found", "COURSE_NOT_FOUND", "courseId");
    const course = await withSess(Course.findOne({ _id: courseId, ...NOT_DELETED })).lean();
    if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
    courseId = course._id;
    classId = null;
    sessionId = null;
    teacherId = null;
  } else if (scopeType === "CLASS") {
    if (!classId) throw validationError("classId is required when scopeType is CLASS");
    assertQueryObjectId(classId, "Class not found", "CLASS_NOT_FOUND", "classId");
    const cls = await withSess(Class.findOne({ _id: classId, ...NOT_DELETED })).lean();
    if (!cls) throw CLASS_NOT_FOUND();
    if (courseId) {
      assertQueryObjectId(courseId, "Course not found", "COURSE_NOT_FOUND", "courseId");
      if (String(courseId) !== String(cls.courseId)) {
        throw new AppError("courseId does not match the class course", "COURSE_ATTRIBUTE_MISMATCH", 400);
      }
    }
    classId = cls._id;
    courseId = cls.courseId;
    teacherId = cls.teacherId;
    sessionId = null;
  } else if (scopeType === "SESSION") {
    if (!sessionId) throw validationError("sessionId is required when scopeType is SESSION");
    assertQueryObjectId(sessionId, "Session not found", "SESSION_NOT_FOUND", "sessionId");
    const session = await withSess(Session.findById(sessionId)).lean();
    if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    const cls = await withSess(Class.findOne({ _id: session.classId, ...NOT_DELETED })).lean();
    if (!cls) throw CLASS_NOT_FOUND();
    if (classId) {
      assertQueryObjectId(classId, "Class not found", "CLASS_NOT_FOUND", "classId");
      if (String(classId) !== String(cls._id)) {
        throw new AppError("classId does not match the session class", "VALIDATION_ERROR", 400);
      }
    }
    if (courseId) {
      assertQueryObjectId(courseId, "Course not found", "COURSE_NOT_FOUND", "courseId");
      if (String(courseId) !== String(cls.courseId)) {
        throw new AppError("courseId does not match the session course", "COURSE_ATTRIBUTE_MISMATCH", 400);
      }
    }
    sessionId = session._id;
    classId = cls._id;
    courseId = cls.courseId;
    teacherId = cls.teacherId;
  }

  let resolvedVersionId = null;
  let resolvedUnitId = null;
  if (syllabusVersionId) {
    assertQueryObjectId(syllabusVersionId, "Syllabus version not found", "SYLLABUS_VERSION_NOT_FOUND", "syllabusVersionId");
    const version = await withSess(SyllabusVersion.findOne({ _id: syllabusVersionId, ...NOT_DELETED })).lean();
    if (!version || String(version.courseId) !== String(courseId)) {
      throw new AppError("Syllabus version does not belong to target course", "SYLLABUS_VERSION_NOT_FOUND", 404);
    }
    resolvedVersionId = version._id;
  }
  if (curriculumUnitId) {
    assertQueryObjectId(curriculumUnitId, "Curriculum unit not found", "CURRICULUM_UNIT_NOT_FOUND", "curriculumUnitId");
    const unit = await withSess(CurriculumUnit.findOne({ _id: curriculumUnitId, ...NOT_DELETED })).lean();
    if (!unit || String(unit.courseId) !== String(courseId)) {
      throw new AppError("Curriculum unit does not belong to target course", "CURRICULUM_UNIT_NOT_FOUND", 404);
    }
    if (resolvedVersionId && String(unit.syllabusVersionId) !== String(resolvedVersionId)) {
      throw validationError("curriculumUnitId does not belong to the specified syllabusVersionId");
    }
    resolvedVersionId = resolvedVersionId || unit.syllabusVersionId;
    resolvedUnitId = unit._id;
  }

  return {
    scopeType,
    courseId,
    classId,
    sessionId,
    teacherId,
    syllabusVersionId: resolvedVersionId,
    curriculumUnitId: resolvedUnitId,
  };
};

const assertTeacherCanManageScope = async (actorId, scope) => {
  await getVerifiedTeacher(actorId);
  if (scope.scopeType === "COURSE") {
    throw FORBIDDEN("Teachers can only manage resources for their own classes or sessions");
  }
  if (!scope.teacherId || String(scope.teacherId) !== String(actorId)) {
    throw FORBIDDEN("You can only manage learning resources of your own classes");
  }
};

const assertResourceViewAccess = async (user, scope) => {
  if (user.role === "ADMIN") return;

  if (user.role === "TEACHER") {
    await getVerifiedTeacher(user.id);
    if (scope.scopeType === "CLASS" || scope.scopeType === "SESSION") {
      if (!scope.teacherId || String(scope.teacherId) !== String(user.id)) {
        throw FORBIDDEN("You can only access learning resources of your own classes");
      }
      return;
    }
    // COURSE scope for Teacher: allowed if they teach a class for this course OR hold APPROVED auth for it
    const teachesCourse = await Class.exists({ courseId: scope.courseId, teacherId: user.id, ...NOT_DELETED });
    if (teachesCourse) return;
    const course = await Course.findOne({ _id: scope.courseId, ...NOT_DELETED }).lean();
    if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
    const hasAuth = await TeacherSubjectAuthorization.exists({
      teacherId: user.id,
      subjectId: course.subjectId,
      level: course.level,
      ...(course.gradeLevel ? { gradeLevel: course.gradeLevel } : {}),
      status: "APPROVED",
    });
    if (!hasAuth) {
      throw FORBIDDEN("You do not have permission to access course resources");
    }
    return;
  }

  if (user.role === "STUDENT") {
    if (scope.scopeType === "COURSE") {
      const classes = await Class.find({ courseId: scope.courseId, ...NOT_DELETED }).select("_id").lean();
      const classIds = classes.map((c) => c._id);
      const enrolled = classIds.length
        ? await Enrollment.exists({
            studentId: user.id,
            classId: { $in: classIds },
            enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
          })
        : null;
      if (!enrolled) {
        throw new AppError("You must be enrolled in this course to access its learning resources", "NOT_ENROLLED", 403);
      }
      return;
    }
    const enrolled = await Enrollment.exists({
      studentId: user.id,
      classId: scope.classId,
      enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
    });
    if (!enrolled) {
      throw new AppError("You must be enrolled in this class to access its learning resources", "NOT_ENROLLED", 403);
    }
    return;
  }

  throw FORBIDDEN("You are not allowed to access learning resources");
};

const parseSourcePayload = async (actorId, body, existing = null) => {
  const sourceTypeRaw = body.sourceType !== undefined ? body.sourceType : existing?.sourceType;
  if (!sourceTypeRaw) throw validationError("sourceType is required");
  if (typeof sourceTypeRaw !== "string") throw validationError("sourceType must be a string");
  const sourceType = sourceTypeRaw.trim().toUpperCase();
  if (!LEARNING_RESOURCE_SOURCE_TYPES.includes(sourceType)) {
    throw validationError(`sourceType must be one of ${LEARNING_RESOURCE_SOURCE_TYPES.join(", ")}`);
  }

  let storageKey = existing?.storageKey || null;
  let mimeType = existing?.mimeType || null;
  let originalName = existing?.originalName || null;
  let fileSizeBytes = existing?.fileSizeBytes ?? null;
  let externalUrl = existing?.externalUrl || null;
  let contentText = existing?.contentText || null;

  if (sourceType === "STORAGE_FILE") {
    const incomingKey = body.storageKey !== undefined ? body.storageKey : storageKey;
    if (isBlank(incomingKey)) throw validationError("storageKey is required for STORAGE_FILE resources");
    const trimmedKey = incomingKey.trim();
    if (!existing || trimmedKey !== existing.storageKey) {
      await storageService.assertOwnedKeys(actorId, [trimmedKey]);
    }
    storageKey = trimmedKey;
    if (body.mimeType !== undefined) {
      const m = assertOptionalString(body.mimeType, "mimeType");
      mimeType = m ? m.trim() : null;
    }
    if (body.originalName !== undefined) {
      const n = assertOptionalString(body.originalName, "originalName");
      originalName = n ? n.trim() : null;
    }
    if (body.fileSizeBytes !== undefined) {
      fileSizeBytes = normalizeFileSize(body.fileSizeBytes);
    }
    externalUrl = null;
  } else if (sourceType === "EXTERNAL_LINK") {
    const rawUrl = body.externalUrl !== undefined ? body.externalUrl : externalUrl;
    externalUrl = validateExternalUrl(rawUrl, "externalUrl");
    storageKey = null;
    mimeType = null;
    originalName = null;
    fileSizeBytes = null;
  } else if (sourceType === "TEXT_CONTENT") {
    const rawText = body.contentText !== undefined ? body.contentText : contentText;
    if (isBlank(rawText)) throw validationError("contentText is required for TEXT_CONTENT resources");
    contentText = rawText.trim();
    storageKey = null;
    mimeType = null;
    originalName = null;
    fileSizeBytes = null;
    externalUrl = null;
  }

  return { sourceType, storageKey, mimeType, originalName, fileSizeBytes, externalUrl, contentText };
};

/**
 * LMS-03: Tạo mới LearningResource (Admin: COURSE/CLASS/SESSION; Teacher: own CLASS/SESSION).
 */
const createLearningResource = async (actor, body = {}) => {
  if (!actor || !["ADMIN", "TEACHER"].includes(actor.role)) {
    throw FORBIDDEN("Only ADMIN or TEACHER can manage learning resources");
  }

  const scope = await assertScopeHierarchy(body);
  if (actor.role === "TEACHER") {
    await assertTeacherCanManageScope(actor.id, scope);
  }

  if (isBlank(body.title)) throw validationError("title is required");
  const title = body.title.trim();
  const descRaw = assertOptionalString(body.description, "description");
  const description = descRaw !== undefined && descRaw !== null ? descRaw.trim() : "";

  const resourceKind =
    body.resourceKind !== undefined
      ? assertOptionalEnum(body.resourceKind, LEARNING_RESOURCE_KINDS, "resourceKind", true) || (() => { throw validationError("resourceKind must not be empty"); })()
      : "DOCUMENT";

  const status =
    body.status !== undefined
      ? assertOptionalEnum(body.status, LEARNING_RESOURCE_STATUSES, "status", true) || (() => { throw validationError("status must not be empty"); })()
      : "PUBLISHED";

  const order = normalizeOptionalInt(body.order, "order", 1) || 1;
  const isDownloadableFlag = assertOptionalBoolean(body.isDownloadable, "isDownloadable");
  const isDownloadable = isDownloadableFlag !== undefined ? isDownloadableFlag : true;
  const sourcePayload = await parseSourcePayload(actor.id, body);

  const dbSession = await mongoose.startSession();
  let created;
  try {
    await dbSession.withTransaction(async () => {
      [created] = await LearningResource.create(
        [
          {
            ...scope,
            ...sourcePayload,
            title,
            description,
            resourceKind,
            order,
            isDownloadable,
            status,
            createdBy: actor.id,
          },
        ],
        { session: dbSession }
      );

      if (actor.role === "ADMIN") {
        await audit(
          {
            actorAdminId: actor.id,
            action: "LEARNING_RESOURCE_CREATE",
            targetType: "LearningResource",
            targetId: created._id,
            beforeState: null,
            afterState: {
              scopeType: created.scopeType,
              courseId: created.courseId,
              classId: created.classId,
              sessionId: created.sessionId,
              title: created.title,
              status: created.status,
            },
          },
          dbSession
        );
      }
    });
  } finally {
    await dbSession.endSession();
  }

  return presentResource(created, actor.role);
};

const updateLearningResource = async (actor, resourceId, body = {}) => {
  if (!actor || !["ADMIN", "TEACHER"].includes(actor.role)) {
    throw FORBIDDEN("Only ADMIN or TEACHER can manage learning resources");
  }
  assertId(resourceId, "Learning resource not found", "LEARNING_RESOURCE_NOT_FOUND");

  const preResource = await LearningResource.findOne({ _id: resourceId, ...NOT_DELETED }).lean();
  if (!preResource) throw resourceNotFound();

  if (actor.role === "TEACHER") {
    await assertTeacherCanManageScope(actor.id, preResource);
    if (body.scopeType !== undefined) {
      if (typeof body.scopeType !== "string") throw validationError("scopeType must be a string");
      if (body.scopeType.trim().toUpperCase() === "COURSE") {
        throw FORBIDDEN("Teachers cannot move resources to COURSE scope");
      }
    }
  }

  if (body.title !== undefined && isBlank(body.title)) {
    throw validationError("title must not be empty");
  }
  const descRaw = assertOptionalString(body.description, "description");
  const nextKind =
    body.resourceKind !== undefined
      ? assertOptionalEnum(body.resourceKind, LEARNING_RESOURCE_KINDS, "resourceKind", true) || (() => { throw validationError("resourceKind must not be empty"); })()
      : undefined;
  const nextStatus =
    body.status !== undefined
      ? assertOptionalEnum(body.status, LEARNING_RESOURCE_STATUSES, "status", true) || (() => { throw validationError("status must not be empty"); })()
      : undefined;
  const nextOrder = body.order !== undefined ? normalizeOptionalInt(body.order, "order", 1) : undefined;
  const nextDownloadable = assertOptionalBoolean(body.isDownloadable, "isDownloadable");

  const hasScopeChange =
    body.scopeType !== undefined ||
    body.courseId !== undefined ||
    body.classId !== undefined ||
    body.sessionId !== undefined ||
    body.syllabusVersionId !== undefined ||
    body.curriculumUnitId !== undefined;

  const hasSourceChange =
    body.sourceType !== undefined ||
    body.storageKey !== undefined ||
    body.externalUrl !== undefined ||
    body.contentText !== undefined ||
    body.mimeType !== undefined ||
    body.originalName !== undefined ||
    body.fileSizeBytes !== undefined;

  const preSourcePayload = hasSourceChange ? await parseSourcePayload(actor.id, body, preResource) : null;

  const dbSession = await mongoose.startSession();
  let updatedResource;
  try {
    await dbSession.withTransaction(async () => {
      // Lock active document inside transaction so concurrent update/delete cannot resurrect a deleted record.
      const resource = await LearningResource.findOneAndUpdate(
        { _id: resourceId, ...NOT_DELETED },
        { $inc: { __v: 1 } },
        { session: dbSession, returnDocument: "after" }
      );
      if (!resource) throw resourceNotFound();

      if (actor.role === "TEACHER") {
        await assertTeacherCanManageScope(actor.id, resource);
      }

      const beforeState = {
        title: resource.title,
        status: resource.status,
        sourceType: resource.sourceType,
        order: resource.order,
      };

      if (hasScopeChange) {
        const nextScope = await assertScopeHierarchy(body, resource, dbSession);
        if (actor.role === "TEACHER") {
          await assertTeacherCanManageScope(actor.id, nextScope);
        }
        Object.assign(resource, nextScope);
      }

      if (body.title !== undefined) resource.title = body.title.trim();
      if (body.description !== undefined) resource.description = descRaw === null ? "" : descRaw.trim();
      if (nextKind !== undefined) resource.resourceKind = nextKind;
      if (nextStatus !== undefined) resource.status = nextStatus;
      if (nextOrder !== undefined) resource.order = nextOrder;
      if (nextDownloadable !== undefined) resource.isDownloadable = nextDownloadable;
      if (preSourcePayload) {
        Object.assign(resource, preSourcePayload);
      }

      resource.updatedBy = actor.id;
      await resource.save({ session: dbSession });
      updatedResource = resource;

      if (actor.role === "ADMIN") {
        await audit(
          {
            actorAdminId: actor.id,
            action: "LEARNING_RESOURCE_UPDATE",
            targetType: "LearningResource",
            targetId: resource._id,
            beforeState,
            afterState: {
              title: resource.title,
              status: resource.status,
              sourceType: resource.sourceType,
              order: resource.order,
            },
          },
          dbSession
        );
      }
    });
  } finally {
    await dbSession.endSession();
  }

  return presentResource(updatedResource, actor.role);
};

const deleteLearningResource = async (actor, resourceId) => {
  if (!actor || !["ADMIN", "TEACHER"].includes(actor.role)) {
    throw FORBIDDEN("Only ADMIN or TEACHER can delete learning resources");
  }
  assertId(resourceId, "Learning resource not found", "LEARNING_RESOURCE_NOT_FOUND");

  const dbSession = await mongoose.startSession();
  let deletedId;
  try {
    await dbSession.withTransaction(async () => {
      const resource = await LearningResource.findOne({ _id: resourceId, ...NOT_DELETED }).session(dbSession);
      if (!resource) throw resourceNotFound();

      if (actor.role === "TEACHER") {
        await assertTeacherCanManageScope(actor.id, resource);
      }

      const deleted = await LearningResource.findOneAndUpdate(
        { _id: resourceId, ...NOT_DELETED },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: actor.id,
            updatedBy: actor.id,
          },
        },
        { session: dbSession, returnDocument: "after" }
      );
      if (!deleted) throw resourceNotFound();
      deletedId = deleted._id.toString();

      if (actor.role === "ADMIN") {
        await audit(
          {
            actorAdminId: actor.id,
            action: "LEARNING_RESOURCE_DELETE",
            targetType: "LearningResource",
            targetId: deleted._id,
            beforeState: { title: deleted.title, status: deleted.status },
            afterState: { isDeleted: true },
          },
          dbSession
        );
      }
    });
  } finally {
    await dbSession.endSession();
  }

  return { deleted: true, id: deletedId };
};

const getLearningResource = async (user, resourceId) => {
  assertId(resourceId, "Learning resource not found", "LEARNING_RESOURCE_NOT_FOUND");
  const resource = await LearningResource.findOne({ _id: resourceId, ...NOT_DELETED }).lean();
  if (!resource) throw resourceNotFound();

  await assertResourceViewAccess(user, resource);
  if (user.role === "STUDENT" && resource.status !== "PUBLISHED") {
    throw resourceNotFound();
  }
  return presentResource(resource, user.role);
};

/**
 * LMS-03: Cấp signed URL tải tài liệu sau khi xác thực quyền xem/tải theo Enrollment hoặc Teacher/Admin.
 */
const getDownloadUrl = async (user, resourceId) => {
  assertId(resourceId, "Learning resource not found", "LEARNING_RESOURCE_NOT_FOUND");
  const resource = await LearningResource.findOne({ _id: resourceId, ...NOT_DELETED }).lean();
  if (!resource) throw resourceNotFound();

  await assertResourceViewAccess(user, resource);
  if (user.role === "STUDENT" && resource.status !== "PUBLISHED") {
    throw resourceNotFound();
  }
  if (user.role === "STUDENT" && resource.isDownloadable === false) {
    throw new AppError("Download is disabled for this learning resource", "RESOURCE_DOWNLOAD_DISABLED", 403);
  }
  if (resource.sourceType !== "STORAGE_FILE" || !resource.storageKey) {
    throw new AppError("This learning resource does not contain a downloadable private file", "RESOURCE_HAS_NO_FILE", 400);
  }

  const signed = storageService.createSignedUrl(resource.storageKey);
  if (!signed) {
    throw new AppError("Stored file key is invalid or unavailable", "FILE_NOT_FOUND", 404);
  }

  return {
    resourceId: resource._id.toString(),
    title: resource.title,
    mimeType: resource.mimeType || null,
    originalName: resource.originalName || null,
    fileSizeBytes: resource.fileSizeBytes ?? null,
    downloadUrl: signed.url,
    expiresAt: signed.expiresAt,
  };
};

const listCourseResources = async (user, courseId, query = {}, paging) => {
  assertId(courseId, "Course not found", "COURSE_NOT_FOUND");
  const course = await Course.findOne({ _id: courseId, ...NOT_DELETED }).lean();
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);

  await assertResourceViewAccess(user, { scopeType: "COURSE", courseId: course._id });

  const requestedStatus = assertOptionalEnum(query.status, LEARNING_RESOURCE_STATUSES, "status", true);
  const filter = { scopeType: "COURSE", courseId: course._id, ...NOT_DELETED };
  if (user.role === "ADMIN" && requestedStatus) {
    filter.status = requestedStatus;
  } else {
    filter.status = "PUBLISHED";
  }

  const [items, total] = await Promise.all([
    LearningResource.find(filter).sort({ order: 1, createdAt: 1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    LearningResource.countDocuments(filter),
  ]);

  return paged(items.map((item) => presentResource(item, user.role)), total, paging);
};

const listClassResources = async (user, classId, query = {}, paging) => {
  assertId(classId, "Class not found", "CLASS_NOT_FOUND");
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  await assertResourceViewAccess(user, { scopeType: "CLASS", classId: cls._id, teacherId: cls.teacherId });

  const requestedStatus = assertOptionalEnum(query.status, LEARNING_RESOURCE_STATUSES, "status", true);
  const filter = { scopeType: "CLASS", classId: cls._id, ...NOT_DELETED };
  if (user.role === "STUDENT") {
    filter.status = "PUBLISHED";
  } else if (requestedStatus) {
    filter.status = requestedStatus;
  }

  const [items, total] = await Promise.all([
    LearningResource.find(filter).sort({ order: 1, createdAt: 1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    LearningResource.countDocuments(filter),
  ]);

  return paged(items.map((item) => presentResource(item, user.role)), total, paging);
};

/**
 * LMS-03: Trả về tài liệu của Session, kết hợp LearningResource chính thức và Session.contents[]
 * chưa migrate mà không sửa hay xóa Session.contents[].
 */
const listSessionResources = async (user, sessionId, query = {}) => {
  assertId(sessionId, "Session not found", "SESSION_NOT_FOUND");
  const session = await Session.findById(sessionId).lean();
  if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
  const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  await assertResourceViewAccess(user, {
    scopeType: "SESSION",
    sessionId: session._id,
    classId: cls._id,
    teacherId: cls.teacherId,
  });

  const requestedStatus = assertOptionalEnum(query.status, LEARNING_RESOURCE_STATUSES, "status", true);
  const filter = { scopeType: "SESSION", sessionId: session._id, ...NOT_DELETED };
  if (user.role === "STUDENT") {
    filter.status = "PUBLISHED";
  } else if (requestedStatus) {
    filter.status = requestedStatus;
  }

  const [resources, allMigrated] = await Promise.all([
    LearningResource.find(filter).sort({ order: 1, createdAt: 1 }).lean(),
    LearningResource.find({
      scopeType: "SESSION",
      sessionId: session._id,
      "legacySessionContent.contentItemId": { $type: "objectId" },
      ...NOT_DELETED,
    })
      .select("legacySessionContent.contentItemId")
      .lean(),
  ]);

  const migratedIds = new Set(
    allMigrated
      .map((r) => r.legacySessionContent && r.legacySessionContent.contentItemId && String(r.legacySessionContent.contentItemId))
      .filter(Boolean)
  );

  const includeLegacy = !filter.status || filter.status === "PUBLISHED";
  const unmigratedLegacy = includeLegacy
    ? (session.contents || [])
        .filter((item) => item && item._id && !migratedIds.has(String(item._id)))
        .map((item) => {
          const signed = item.storageKey ? storageService.createSignedUrl(item.storageKey) : null;
          return {
            id: String(item._id),
            legacyContentItemId: String(item._id),
            source: "LEGACY_SESSION_CONTENT",
            scopeType: "SESSION",
            sessionId: session._id.toString(),
            classId: cls._id.toString(),
            courseId: cls.courseId ? cls.courseId.toString() : null,
            title: item.title,
            description: item.description || "",
            legacyType: item.type,
            resourceKind: LEGACY_TYPE_TO_KIND[item.type] || "DOCUMENT",
            sourceType: item.storageKey ? "STORAGE_FILE" : "TEXT_CONTENT",
            hasFile: Boolean(item.storageKey),
            downloadUrl: signed ? signed.url : null,
            urlExpiresAt: signed ? signed.expiresAt : null,
            order: item.order || 1,
            migrated: false,
          };
        })
    : [];

  const presentedResources = resources.map((item) => ({
    ...presentResource(item, user.role),
    source: "LEARNING_RESOURCE",
    migrated: Boolean(item.legacySessionContent && item.legacySessionContent.contentItemId),
  }));

  const mergedItems = [...presentedResources, ...unmigratedLegacy].sort((a, b) => (a.order || 1) - (b.order || 1));

  return {
    sessionId: session._id.toString(),
    classId: cls._id.toString(),
    legacyContentsCount: (session.contents || []).length,
    migratedCount: migratedIds.size,
    unmigratedLegacyCount: unmigratedLegacy.length,
    items: mergedItems,
  };
};

/**
 * LMS-03: Sao chép có kiểm soát & idempotent từ Session.contents[] sang LearningResource.
 * TUYỆT ĐỐI không xóa hoặc chỉnh sửa Session.contents[].
 */
const migrateSessionContents = async (actor, sessionId, body = {}) => {
  if (!actor || !["ADMIN", "TEACHER"].includes(actor.role)) {
    throw FORBIDDEN("Only ADMIN or TEACHER can migrate session contents");
  }
  assertId(sessionId, "Session not found", "SESSION_NOT_FOUND");
  const session = await Session.findById(sessionId).lean();
  if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);

  const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  if (actor.role === "TEACHER") {
    await getVerifiedTeacher(actor.id);
    if (String(cls.teacherId) !== String(actor.id)) {
      throw FORBIDDEN("You can only migrate learning resources for your own sessions");
    }
  }

  const dryRunFlag = assertOptionalBoolean(body.dryRun, "dryRun");
  const dryRun = dryRunFlag === true;
  const legacyItems = session.contents || [];

  const computePending = async (dbSession = null) => {
    const q = LearningResource.find({
      "legacySessionContent.sessionId": session._id,
      ...NOT_DELETED,
    }).select("legacySessionContent.contentItemId");
    if (dbSession) q.session(dbSession);
    const existingMigrated = await q.lean();

    const existingItemIds = new Set(
      existingMigrated
        .map((r) => r.legacySessionContent && r.legacySessionContent.contentItemId && String(r.legacySessionContent.contentItemId))
        .filter(Boolean)
    );

    const toCreate = legacyItems.filter((item) => item && item._id && !existingItemIds.has(String(item._id)));
    return { existingItemIds, toCreate };
  };

  if (dryRun) {
    const { toCreate } = await computePending();
    return {
      sessionId: session._id.toString(),
      dryRun: true,
      legacyCount: legacyItems.length,
      createdCount: 0,
      pendingMigrationCount: toCreate.length,
      skippedAlreadyMigratedCount: legacyItems.length - toCreate.length,
      legacyPreserved: true,
      items: [],
    };
  }

  const now = new Date();
  let createdDocs = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    createdDocs = [];
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const { toCreate } = await computePending(dbSession);
        if (toCreate.length === 0) return;

        for (const item of toCreate) {
          const sourceType = item.storageKey ? "STORAGE_FILE" : "TEXT_CONTENT";
          const parsedKey = item.storageKey ? storageService.parsePrivateKey(item.storageKey) : null;
          const [doc] = await LearningResource.create(
            [
              {
                scopeType: "SESSION",
                courseId: cls.courseId,
                classId: cls._id,
                sessionId: session._id,
                teacherId: cls.teacherId,
                title: item.title,
                description: item.description || "",
                resourceKind: LEGACY_TYPE_TO_KIND[item.type] || "DOCUMENT",
                sourceType,
                storageKey: item.storageKey || null,
                mimeType: parsedKey && parsedKey.extension === "pdf" ? "application/pdf" : null,
                contentText: sourceType === "TEXT_CONTENT" ? (item.description || item.title) : null,
                order: item.order || 1,
                isDownloadable: true,
                status: "PUBLISHED",
                createdBy: actor.id,
                legacySessionContent: {
                  sessionId: session._id,
                  contentItemId: item._id,
                  legacyType: item.type,
                  migratedAt: now,
                },
              },
            ],
            { session: dbSession }
          );
          createdDocs.push(presentResource(doc, actor.role));
        }

        if (actor.role === "ADMIN" && createdDocs.length > 0) {
          await audit(
            {
              actorAdminId: actor.id,
              action: "LEARNING_RESOURCE_MIGRATE_SESSION",
              targetType: "Session",
              targetId: session._id,
              beforeState: { legacyCount: legacyItems.length },
              afterState: { createdCount: createdDocs.length, legacyPreserved: true },
            },
            dbSession
          );
        }
      });
      break;
    } catch (err) {
      if (err && err.code === 11000 && attempt === 0) {
        // Concurrent migration inserted rows first and aborted this tx; retry once on fresh committed state.
        continue;
      }
      if (err && err.code === 11000) {
        createdDocs = [];
        break;
      }
      throw err;
    } finally {
      await dbSession.endSession();
    }
  }

  return {
    sessionId: session._id.toString(),
    dryRun: false,
    legacyCount: legacyItems.length,
    createdCount: createdDocs.length,
    skippedAlreadyMigratedCount: legacyItems.length - createdDocs.length,
    legacyPreserved: true,
    items: createdDocs,
  };
};

const listTeacherResources = async (teacherId, query = {}, paging) => {
  await getVerifiedTeacher(teacherId);
  const filter = { teacherId, ...NOT_DELETED };
  const scopeType = assertOptionalEnum(query.scopeType, LEARNING_RESOURCE_SCOPES, "scopeType", true);
  if (scopeType) filter.scopeType = scopeType;
  if (query.classId !== undefined && query.classId !== "") {
    filter.classId = assertQueryObjectId(query.classId, "Class not found", "CLASS_NOT_FOUND", "classId");
  }
  if (query.sessionId !== undefined && query.sessionId !== "") {
    filter.sessionId = assertQueryObjectId(query.sessionId, "Session not found", "SESSION_NOT_FOUND", "sessionId");
  }
  const status = assertOptionalEnum(query.status, LEARNING_RESOURCE_STATUSES, "status", true);
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    LearningResource.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    LearningResource.countDocuments(filter),
  ]);
  return paged(items.map((item) => presentResource(item, "TEACHER")), total, paging);
};

const adminListResources = async (query = {}, paging) => {
  const filter = { ...NOT_DELETED };
  const scopeType = assertOptionalEnum(query.scopeType, LEARNING_RESOURCE_SCOPES, "scopeType", true);
  if (scopeType) filter.scopeType = scopeType;
  if (query.courseId !== undefined && query.courseId !== "") {
    filter.courseId = assertQueryObjectId(query.courseId, "Course not found", "COURSE_NOT_FOUND", "courseId");
  }
  if (query.classId !== undefined && query.classId !== "") {
    filter.classId = assertQueryObjectId(query.classId, "Class not found", "CLASS_NOT_FOUND", "classId");
  }
  if (query.sessionId !== undefined && query.sessionId !== "") {
    filter.sessionId = assertQueryObjectId(query.sessionId, "Session not found", "SESSION_NOT_FOUND", "sessionId");
  }
  const status = assertOptionalEnum(query.status, LEARNING_RESOURCE_STATUSES, "status", true);
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    LearningResource.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    LearningResource.countDocuments(filter),
  ]);
  return paged(items.map((item) => presentResource(item, "ADMIN")), total, paging);
};

const listMyResources = async (studentId, query = {}, paging) => {
  const enrollments = await Enrollment.find({
    studentId,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  })
    .select("classId courseId")
    .lean();

  if (!enrollments.length) return paged([], 0, paging);

  const classIds = [...new Set(enrollments.map((e) => e.classId))];
  const courseIds = [...new Set(enrollments.map((e) => e.courseId).filter(Boolean))];

  const filter = {
    status: "PUBLISHED",
    ...NOT_DELETED,
    $or: [
      { scopeType: { $in: ["CLASS", "SESSION"] }, classId: { $in: classIds } },
      ...(courseIds.length ? [{ scopeType: "COURSE", courseId: { $in: courseIds } }] : []),
    ],
  };

  if (query.classId !== undefined && query.classId !== "") {
    assertQueryObjectId(query.classId, "Class not found", "CLASS_NOT_FOUND", "classId");
    if (!classIds.some((id) => String(id) === String(query.classId))) {
      throw new AppError("You must be enrolled in this class to view its resources", "NOT_ENROLLED", 403);
    }
    filter.$or = [{ scopeType: { $in: ["CLASS", "SESSION"] }, classId: query.classId }];
  }

  const [items, total] = await Promise.all([
    LearningResource.find(filter).sort({ order: 1, createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    LearningResource.countDocuments(filter),
  ]);

  return paged(items.map((item) => presentResource(item, "STUDENT")), total, paging);
};

module.exports = {
  createLearningResource,
  updateLearningResource,
  deleteLearningResource,
  getLearningResource,
  getDownloadUrl,
  listCourseResources,
  listClassResources,
  listSessionResources,
  migrateSessionContents,
  listTeacherResources,
  adminListResources,
  listMyResources,
};

