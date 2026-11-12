const mongoose = require("mongoose");
const { CoursePricingPolicy, Course, Subject, Category, AuditLog } = require("../models");
const {
  GRADE_LEVELS,
  PRICING_POLICY_SCOPES,
  PRICING_POLICY_STATUSES,
  PRICING_POLICY_CLASS_TYPES,
} = require("../models/constants");
const { AppError } = require("../utils/errors");
const { assertId, paged, parseDate, parsePaging, validationError, isBlank } = require("../utils/http");
const { toNum, toDec, parseAmount } = require("../utils/money");
const { resolveGradeLevel } = require("../utils/gradeLevel");
const catalog = require("./courseCatalogService");

const NOT_DELETED = { isDeleted: { $ne: true } };

const SCOPE_WEIGHT = Object.freeze({
  COURSE: 400,
  SUBJECT: 300,
  CATEGORY: 200,
  GLOBAL: 100,
});

const isDuplicateKeyError = (err) =>
  Boolean(err && (err.code === 11000 || (err.cause && err.cause.code === 11000)));

const toStrictFiniteNumber = (value) => {
  if (
    value === undefined ||
    value === null ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    typeof value === "object" ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return NaN;
  }
  return Number(value);
};

const buildCanonicalPolicyKey = ({ scopeType, categoryId, subjectId, courseId, classType, gradeLevel, level }) => {
  const targetId =
    scopeType === "COURSE"
      ? String(courseId)
      : scopeType === "SUBJECT"
      ? String(subjectId)
      : scopeType === "CATEGORY"
      ? String(categoryId)
      : "DEFAULT";

  return [
    scopeType,
    targetId,
    classType || "ALL",
    gradeLevel || "ANY",
    level || "ANY",
  ]
    .join(":")
    .toUpperCase();
};

const validateScopeAndMatchers = async (input = {}) => {
  const scopeType = String(input.scopeType || "GLOBAL").trim().toUpperCase();
  if (!PRICING_POLICY_SCOPES.includes(scopeType)) {
    throw validationError(`scopeType must be one of ${PRICING_POLICY_SCOPES.join(", ")}`);
  }

  let categoryId = null;
  let subjectId = null;
  let courseId = null;
  let category = null;

  if (scopeType === "COURSE") {
    if (!input.courseId) throw validationError("courseId is required when scopeType is COURSE");
    assertId(input.courseId, "Course not found", "COURSE_NOT_FOUND");
    const course = await Course.findOne({ _id: input.courseId, ...NOT_DELETED }).lean();
    if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
    courseId = course._id;
    subjectId = course.subjectId;
    categoryId = course.categoryId;
    category = await Category.findOne({ _id: course.categoryId, ...NOT_DELETED }).lean();
  } else if (scopeType === "SUBJECT") {
    if (!input.subjectId) throw validationError("subjectId is required when scopeType is SUBJECT");
    assertId(input.subjectId, "Subject not found", "SUBJECT_NOT_FOUND");
    const subject = await Subject.findOne({ _id: input.subjectId, ...NOT_DELETED }).lean();
    if (!subject) throw new AppError("Subject not found", "SUBJECT_NOT_FOUND", 404);
    subjectId = subject._id;
    categoryId = subject.categoryId;
    category = await Category.findOne({ _id: subject.categoryId, ...NOT_DELETED }).lean();
  } else if (scopeType === "CATEGORY") {
    if (!input.categoryId) throw validationError("categoryId is required when scopeType is CATEGORY");
    assertId(input.categoryId, "Category not found", "CATEGORY_NOT_FOUND");
    category = await Category.findOne({ _id: input.categoryId, ...NOT_DELETED }).lean();
    if (!category) throw new AppError("Category not found", "CATEGORY_NOT_FOUND", 404);
    categoryId = category._id;
  }

  let gradeLevel = null;
  if (input.gradeLevel !== undefined && input.gradeLevel !== null && input.gradeLevel !== "") {
    if (typeof input.gradeLevel !== "string") {
      throw new AppError("gradeLevel must be a string", "INVALID_GRADE_LEVEL", 400);
    }
    if (category) {
      gradeLevel = resolveGradeLevel(category, input.gradeLevel);
    } else {
      if (!GRADE_LEVELS.includes(input.gradeLevel)) {
        throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
      }
      gradeLevel = input.gradeLevel;
    }
  }

  let level = null;
  if (input.level !== undefined && input.level !== null && input.level !== "") {
    if (typeof input.level !== "string") {
      throw validationError("level must be a string");
    }
    level = catalog.resolveLevel(input.level);
  }

  if (input.classType !== undefined && input.classType !== null && typeof input.classType !== "string") {
    throw validationError("classType must be a string");
  }
  const classType = String(input.classType || "ALL").trim().toUpperCase();
  if (!PRICING_POLICY_CLASS_TYPES.includes(classType)) {
    throw validationError(`classType must be one of ${PRICING_POLICY_CLASS_TYPES.join(", ")}`);
  }

  return { scopeType, categoryId, subjectId, courseId, gradeLevel, level, classType };
};

const validateBoundsAndDates = (input = {}, classType = "ALL") => {
  if (input.minPrice === undefined || input.minPrice === null) {
    throw validationError("minPrice is required");
  }
  if (input.maxPrice === undefined || input.maxPrice === null) {
    throw validationError("maxPrice is required");
  }

  const minPrice = parseAmount(input.minPrice, "minPrice", { allowZero: true });
  const maxPrice = parseAmount(input.maxPrice, "maxPrice", { allowZero: true });
  if (maxPrice < minPrice) {
    throw validationError("maxPrice must be greater than or equal to minPrice");
  }

  if (classType === "ALL" && input.allowFree !== undefined && typeof input.allowFree !== "boolean") {
    throw validationError("allowFree must be a boolean");
  }
  const allowFree =
    classType === "FREE"
      ? true
      : classType === "PAID"
      ? false
      : input.allowFree !== undefined
      ? input.allowFree
      : true;

  if (classType === "FREE" && (minPrice !== 0 || maxPrice !== 0)) {
    throw validationError("FREE pricing policy must have minPrice = 0 and maxPrice = 0");
  }

  if (input.minSessions === undefined || input.minSessions === null) {
    throw validationError("minSessions is required");
  }
  if (input.maxSessions === undefined || input.maxSessions === null) {
    throw validationError("maxSessions is required");
  }

  const minSessions = toStrictFiniteNumber(input.minSessions);
  const maxSessions = toStrictFiniteNumber(input.maxSessions);
  if (!Number.isInteger(minSessions) || minSessions < 1) {
    throw validationError("minSessions must be an integer >= 1");
  }
  if (!Number.isInteger(maxSessions) || maxSessions < minSessions) {
    throw validationError("maxSessions must be an integer >= minSessions");
  }

  const now = new Date();
  const effectiveFrom = input.effectiveFrom !== undefined && input.effectiveFrom !== null && input.effectiveFrom !== ""
    ? parseDate(input.effectiveFrom, "effectiveFrom")
    : now;
  const effectiveTo = input.effectiveTo !== undefined && input.effectiveTo !== null && input.effectiveTo !== ""
    ? parseDate(input.effectiveTo, "effectiveTo")
    : null;

  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw validationError("effectiveTo must be after effectiveFrom");
  }

  return {
    minPrice,
    maxPrice,
    allowFree,
    minSessions,
    maxSessions,
    effectiveFrom,
    effectiveTo,
    now,
  };
};

const createPolicyVersion = async (adminId, body = {}) => {
  if (isBlank(body.name)) throw validationError("name is required");

  const scope = await validateScopeAndMatchers(body);
  const bounds = validateBoundsAndDates(body, scope.classType);
  const policyKey = !isBlank(body.policyKey)
    ? String(body.policyKey).trim().toUpperCase()
    : buildCanonicalPolicyKey(scope);

  const requestedStatus = body.status === undefined ? "ACTIVE" : String(body.status).trim().toUpperCase();
  if (!["DRAFT", "ACTIVE"].includes(requestedStatus)) {
    throw validationError("Initial status must be DRAFT or ACTIVE");
  }

  const changeReason = body.changeReason !== undefined ? String(body.changeReason).trim() : "";
  const description = body.description !== undefined && body.description !== null ? String(body.description).trim() : "";

  let createdDoc;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const latest = await CoursePricingPolicy.findOne({ policyKey })
        .sort({ version: -1 })
        .select("version")
        .session(session)
        .lean();
      const nextVersion = latest ? latest.version + 1 : 1;

      if (requestedStatus === "ACTIVE" && bounds.effectiveFrom.getTime() <= bounds.now.getTime()) {
        await CoursePricingPolicy.updateMany(
          {
            policyKey,
            status: "ACTIVE",
            effectiveFrom: { $lte: bounds.effectiveFrom },
          },
          { $set: { status: "SUPERSEDED", updatedBy: adminId } },
          { session }
        );
      }

      let created;
      try {
        [created] = await CoursePricingPolicy.create(
          [
            {
              policyKey,
              version: nextVersion,
              name: body.name.trim(),
              description,
              scopeType: scope.scopeType,
              categoryId: scope.categoryId,
              subjectId: scope.subjectId,
              courseId: scope.courseId,
              gradeLevel: scope.gradeLevel,
              level: scope.level,
              classType: scope.classType,
              allowFree: bounds.allowFree,
              minPrice: toDec(bounds.minPrice),
              maxPrice: toDec(bounds.maxPrice),
              minSessions: bounds.minSessions,
              maxSessions: bounds.maxSessions,
              effectiveFrom: bounds.effectiveFrom,
              effectiveTo: bounds.effectiveTo,
              status: requestedStatus,
              changeReason,
              createdBy: adminId,
              updatedBy: adminId,
            },
          ],
          { session }
        );
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw new AppError("Concurrent pricing policy version conflict, please retry", "PRICING_POLICY_VERSION_CONFLICT", 409);
        }
        throw err;
      }

      createdDoc = created.toObject();

      await AuditLog.create(
        [
          {
            actorAdminId: adminId,
            action: "COURSE_PRICING_POLICY_CREATED",
            targetType: "CoursePricingPolicy",
            targetId: created._id,
            beforeState: latest ? { policyKey, previousVersion: latest.version } : null,
            afterState: {
              policyKey,
              version: nextVersion,
              scopeType: scope.scopeType,
              classType: scope.classType,
              allowFree: bounds.allowFree,
              minPrice: String(bounds.minPrice),
              maxPrice: String(bounds.maxPrice),
              minSessions: bounds.minSessions,
              maxSessions: bounds.maxSessions,
              effectiveFrom: bounds.effectiveFrom,
              effectiveTo: bounds.effectiveTo,
              status: requestedStatus,
              changeReason,
            },
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return createdDoc;
};

const createNextVersionFromId = async (adminId, policyId, body = {}) => {
  assertId(policyId, "Pricing policy not found", "PRICING_POLICY_NOT_FOUND");
  const base = await CoursePricingPolicy.findById(policyId).lean();
  if (!base) throw new AppError("Pricing policy not found", "PRICING_POLICY_NOT_FOUND", 404);

  return createPolicyVersion(adminId, {
    policyKey: base.policyKey,
    scopeType: base.scopeType,
    categoryId: base.categoryId,
    subjectId: base.subjectId,
    courseId: base.courseId,
    gradeLevel: body.gradeLevel !== undefined ? body.gradeLevel : base.gradeLevel,
    level: body.level !== undefined ? body.level : base.level,
    classType: body.classType !== undefined ? body.classType : base.classType,
    allowFree: body.allowFree !== undefined ? body.allowFree : base.allowFree,
    name: body.name !== undefined ? body.name : base.name,
    description: body.description !== undefined ? body.description : base.description,
    minPrice: body.minPrice !== undefined ? body.minPrice : toNum(base.minPrice),
    maxPrice: body.maxPrice !== undefined ? body.maxPrice : toNum(base.maxPrice),
    minSessions: body.minSessions !== undefined ? body.minSessions : base.minSessions,
    maxSessions: body.maxSessions !== undefined ? body.maxSessions : base.maxSessions,
    effectiveFrom: body.effectiveFrom !== undefined ? body.effectiveFrom : new Date(),
    effectiveTo: body.effectiveTo !== undefined ? body.effectiveTo : null,
    status: body.status !== undefined ? body.status : "ACTIVE",
    changeReason: body.changeReason !== undefined ? body.changeReason : `New version from v${base.version}`,
  });
};

const activatePolicy = async (adminId, policyId, body = {}) => {
  assertId(policyId, "Pricing policy not found", "PRICING_POLICY_NOT_FOUND");
  const policy = await CoursePricingPolicy.findById(policyId);
  if (!policy) throw new AppError("Pricing policy not found", "PRICING_POLICY_NOT_FOUND", 404);
  if (policy.status === "ACTIVE") {
    throw new AppError("Pricing policy version is already ACTIVE", "PRICING_POLICY_ALREADY_ACTIVE", 409);
  }
  if (policy.status !== "DRAFT") {
    throw new AppError(`Cannot activate policy in status ${policy.status}; create a new version or rollback instead`, "PRICING_POLICY_IMMUTABLE", 409);
  }

  const now = new Date();
  const effectiveFrom = body.effectiveFrom !== undefined && body.effectiveFrom !== null
    ? parseDate(body.effectiveFrom, "effectiveFrom")
    : policy.effectiveFrom;

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      if (effectiveFrom.getTime() <= now.getTime()) {
        await CoursePricingPolicy.updateMany(
          {
            policyKey: policy.policyKey,
            status: "ACTIVE",
            effectiveFrom: { $lte: effectiveFrom },
          },
          { $set: { status: "SUPERSEDED", updatedBy: adminId } },
          { session }
        );
      }

      updated = await CoursePricingPolicy.findOneAndUpdate(
        { _id: policy._id, status: "DRAFT" },
        { $set: { status: "ACTIVE", effectiveFrom, updatedBy: adminId } },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError("Pricing policy is no longer in DRAFT status", "PRICING_POLICY_IMMUTABLE", 409);
      }

      await AuditLog.create(
        [
          {
            actorAdminId: adminId,
            action: "COURSE_PRICING_POLICY_ACTIVATED",
            targetType: "CoursePricingPolicy",
            targetId: policy._id,
            beforeState: { status: "DRAFT" },
            afterState: { status: "ACTIVE", effectiveFrom },
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return updated;
};

const rollbackToPolicyVersion = async (adminId, policyId, body = {}) => {
  assertId(policyId, "Pricing policy not found", "PRICING_POLICY_NOT_FOUND");
  const baseDoc = await CoursePricingPolicy.findById(policyId).lean();
  if (!baseDoc) throw new AppError("Pricing policy not found", "PRICING_POLICY_NOT_FOUND", 404);

  let targetDoc = baseDoc;
  if (body.targetVersion !== undefined && body.targetVersion !== null && body.targetVersion !== "") {
    const requestedVersion = toStrictFiniteNumber(body.targetVersion);
    if (!Number.isInteger(requestedVersion) || requestedVersion < 1) {
      throw validationError("targetVersion must be a positive integer");
    }
    targetDoc = await CoursePricingPolicy.findOne({
      policyKey: baseDoc.policyKey,
      version: requestedVersion,
    }).lean();
    if (!targetDoc) {
      throw new AppError(
        `Pricing policy version ${requestedVersion} not found for key ${baseDoc.policyKey}`,
        "PRICING_POLICY_NOT_FOUND",
        404
      );
    }
  }

  const now = new Date();
  const changeReason = !isBlank(body.changeReason)
    ? body.changeReason.trim()
    : `Rollback to version ${targetDoc.version}`;

  let createdDoc;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const latest = await CoursePricingPolicy.findOne({ policyKey: targetDoc.policyKey })
        .sort({ version: -1 })
        .select("version")
        .session(session)
        .lean();
      const nextVersion = latest ? latest.version + 1 : 1;

      const currentActive = await CoursePricingPolicy.findOne({
        policyKey: targetDoc.policyKey,
        status: "ACTIVE",
        effectiveFrom: { $lte: now },
      })
        .sort({ effectiveFrom: -1, version: -1 })
        .session(session)
        .lean();

      await CoursePricingPolicy.updateMany(
        {
          policyKey: targetDoc.policyKey,
          status: "ACTIVE",
          effectiveFrom: { $lte: now },
        },
        { $set: { status: "ROLLED_BACK", updatedBy: adminId } },
        { session }
      );

      let created;
      try {
        [created] = await CoursePricingPolicy.create(
          [
            {
              policyKey: targetDoc.policyKey,
              version: nextVersion,
              name: targetDoc.name,
              description: targetDoc.description,
              scopeType: targetDoc.scopeType,
              categoryId: targetDoc.categoryId,
              subjectId: targetDoc.subjectId,
              courseId: targetDoc.courseId,
              gradeLevel: targetDoc.gradeLevel,
              level: targetDoc.level,
              classType: targetDoc.classType,
              allowFree: targetDoc.allowFree,
              minPrice: targetDoc.minPrice,
              maxPrice: targetDoc.maxPrice,
              minSessions: targetDoc.minSessions,
              maxSessions: targetDoc.maxSessions,
              effectiveFrom: now,
              effectiveTo: null,
              status: "ACTIVE",
              changeReason,
              rolledBackFromVersion: currentActive ? currentActive.version : latest?.version || null,
              rolledBackToVersion: targetDoc.version,
              createdBy: adminId,
              updatedBy: adminId,
            },
          ],
          { session }
        );
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw new AppError("Concurrent pricing policy version conflict, please retry", "PRICING_POLICY_VERSION_CONFLICT", 409);
        }
        throw err;
      }
      createdDoc = created.toObject();

      await AuditLog.create(
        [
          {
            actorAdminId: adminId,
            action: "COURSE_PRICING_POLICY_ROLLED_BACK",
            targetType: "CoursePricingPolicy",
            targetId: created._id,
            beforeState: currentActive ? { version: currentActive.version, status: currentActive.status } : null,
            afterState: {
              policyKey: targetDoc.policyKey,
              version: nextVersion,
              rolledBackToVersion: targetDoc.version,
              changeReason,
            },
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return createdDoc;
};

const archivePolicy = async (adminId, policyId) => {
  assertId(policyId, "Pricing policy not found", "PRICING_POLICY_NOT_FOUND");
  const policy = await CoursePricingPolicy.findById(policyId);
  if (!policy) throw new AppError("Pricing policy not found", "PRICING_POLICY_NOT_FOUND", 404);
  if (policy.status === "ARCHIVED") {
    throw new AppError("Pricing policy is already archived", "PRICING_POLICY_IMMUTABLE", 409);
  }
  const prevStatus = policy.status;
  const now = new Date();
  policy.status = "ARCHIVED";
  policy.archivedAt = now;
  policy.archivedBy = adminId;
  policy.updatedBy = adminId;
  await policy.save();

  await AuditLog.create({
    actorAdminId: adminId,
    action: "COURSE_PRICING_POLICY_ARCHIVED",
    targetType: "CoursePricingPolicy",
    targetId: policy._id,
    beforeState: { status: prevStatus },
    afterState: { status: "ARCHIVED", archivedAt: now },
  });

  return policy.toObject();
};

const listPolicies = async (query = {}, pagingInput) => {
  const paging = pagingInput || parsePaging(query);
  const filter = {};
  if (query.scopeType) {
    const st = String(query.scopeType).trim().toUpperCase();
    if (!PRICING_POLICY_SCOPES.includes(st)) throw validationError("scopeType is invalid");
    filter.scopeType = st;
  }
  if (query.status) {
    const s = String(query.status).trim().toUpperCase();
    if (!PRICING_POLICY_STATUSES.includes(s)) throw validationError("status is invalid");
    filter.status = s;
  }
  if (query.policyKey !== undefined && query.policyKey !== null && query.policyKey !== "") {
    if (typeof query.policyKey !== "string") throw validationError("policyKey must be a string");
    filter.policyKey = query.policyKey.trim().toUpperCase();
  }
  for (const field of ["courseId", "subjectId", "categoryId"]) {
    if (query[field]) {
      if (!mongoose.isValidObjectId(query[field])) throw validationError(`${field} is invalid`);
      filter[field] = query[field];
    }
  }
  if (query.effectiveOnly === "true" || query.effectiveOnly === true) {
    const now = new Date();
    filter.status = "ACTIVE";
    filter.effectiveFrom = { $lte: now };
    filter.$or = [{ effectiveTo: null }, { effectiveTo: { $gt: now } }];
  }

  const [items, total] = await Promise.all([
    CoursePricingPolicy.find(filter)
      .sort({ effectiveFrom: -1, version: -1, createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    CoursePricingPolicy.countDocuments(filter),
  ]);

  return paged(items, total, paging);
};

const getPolicyDetail = async (policyId) => {
  assertId(policyId, "Pricing policy not found", "PRICING_POLICY_NOT_FOUND");
  const policy = await CoursePricingPolicy.findById(policyId).lean();
  if (!policy) throw new AppError("Pricing policy not found", "PRICING_POLICY_NOT_FOUND", 404);
  return policy;
};

const scorePolicyCandidate = (policy, { classType, gradeLevel, courseLevel }) => {
  let score = SCOPE_WEIGHT[policy.scopeType] || 0;
  if (policy.classType === classType) score += 40;
  if (policy.gradeLevel && gradeLevel && policy.gradeLevel === gradeLevel) score += 20;
  if (policy.level && courseLevel && policy.level === courseLevel) score += 10;
  return score;
};

/**
 * Resolves the highest-precedence effective CoursePricingPolicy for a course & classType at time `now`.
 * Precedence:
 *  1) scopeType: COURSE > SUBJECT > CATEGORY > GLOBAL
 *  2) classType: exact match > "ALL"
 *  3) gradeLevel: exact match > null
 *  4) level: exact match > null
 *  5) latest effectiveFrom, then highest version
 */
const resolveEffectivePolicy = async ({
  course,
  classType = "PAID",
  now = new Date(),
} = {}) => {
  if (!course) return null;
  const resolvedClassType = classType || "PAID";
  const courseLevel = course.level ? catalog.resolveLevel(course.level) : null;
  const gradeLevel = course.gradeLevel || null;

  const scopeClauses = [{ scopeType: "GLOBAL" }];
  if (course.categoryId) scopeClauses.push({ scopeType: "CATEGORY", categoryId: course.categoryId });
  if (course.subjectId) scopeClauses.push({ scopeType: "SUBJECT", subjectId: course.subjectId });
  if (course._id) scopeClauses.push({ scopeType: "COURSE", courseId: course._id });

  const candidates = await CoursePricingPolicy.find({
    status: "ACTIVE",
    effectiveFrom: { $lte: now },
    $and: [
      { $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }] },
      { $or: scopeClauses },
      { classType: { $in: [resolvedClassType, "ALL"] } },
      { $or: [{ gradeLevel: null }, ...(gradeLevel ? [{ gradeLevel }] : [])] },
      { $or: [{ level: null }, ...(courseLevel ? [{ level: courseLevel }] : [])] },
    ],
  }).lean();

  if (!candidates || candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const scoreDiff =
      scorePolicyCandidate(b, { classType: resolvedClassType, gradeLevel, courseLevel }) -
      scorePolicyCandidate(a, { classType: resolvedClassType, gradeLevel, courseLevel });
    if (scoreDiff !== 0) return scoreDiff;

    const effDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
    if (effDiff !== 0) return effDiff;

    return (b.version || 0) - (a.version || 0);
  });

  return candidates[0];
};

/**
 * Official CUR-07 verifier compatible with classCreationGateService (`assertPricingPolicyGate`).
 */
const verifyClassPricingPolicy = async ({
  course,
  cls = null,
  body = {},
  price,
  classType,
  totalSessions = null,
  now = new Date(),
} = {}) => {
  let numericPrice = 0;
  if (price !== undefined) {
    numericPrice = toStrictFiniteNumber(price);
    if (!Number.isFinite(numericPrice)) {
      throw validationError("price must be a finite number");
    }
  } else if (cls && cls.price !== undefined) {
    numericPrice = toNum(cls.price);
  } else if (body && body.price !== undefined) {
    numericPrice = toStrictFiniteNumber(body.price);
    if (!Number.isFinite(numericPrice)) {
      throw validationError("price must be a finite number");
    }
  }

  const effectiveClassType =
    classType ||
    (cls && cls.classType) ||
    (body && body.classType) ||
    (numericPrice === 0 ? "FREE" : "PAID");

  let resolvedSessions = null;
  const rawSessions =
    totalSessions !== undefined && totalSessions !== null
      ? totalSessions
      : body && body.totalSessions !== undefined && body.totalSessions !== null
      ? body.totalSessions
      : null;
  if (rawSessions !== null) {
    resolvedSessions = toStrictFiniteNumber(rawSessions);
    if (!Number.isInteger(resolvedSessions) || resolvedSessions < 0) {
      throw validationError("totalSessions must be a non-negative integer");
    }
  }

  const policy = await resolveEffectivePolicy({
    course,
    classType: effectiveClassType,
    now,
  });

  if (!policy) {
    return {
      valid: false,
      code: "PRICING_POLICY_NOT_CONFIGURED",
      message: "No active CoursePricingPolicy is configured for this course scope",
      statusCode: 400,
    };
  }

  const minPrice = toNum(policy.minPrice);
  const maxPrice = toNum(policy.maxPrice);

  if (effectiveClassType === "FREE") {
    if (!policy.allowFree || policy.classType === "PAID") {
      return {
        valid: false,
        code: "PRICING_POLICY_FREE_NOT_ALLOWED",
        message: "Active CoursePricingPolicy does not allow FREE classes for this scope",
        statusCode: 400,
        details: {
          policyId: policy._id.toString(),
          policyKey: policy.policyKey,
          policyVersion: policy.version,
        },
      };
    }
    if (numericPrice !== 0) {
      return {
        valid: false,
        code: "PRICE_OUT_OF_POLICY_RANGE",
        message: "FREE class must have price = 0",
        statusCode: 400,
        details: {
          minPrice: "0",
          maxPrice: "0",
          actualPrice: String(numericPrice),
          policyId: policy._id.toString(),
          policyKey: policy.policyKey,
          policyVersion: policy.version,
        },
      };
    }
  } else {
    if (!Number.isFinite(numericPrice) || numericPrice < minPrice || numericPrice > maxPrice) {
      return {
        valid: false,
        code: "PRICE_OUT_OF_POLICY_RANGE",
        message: `Class price ${numericPrice} violates active CoursePricingPolicy bounds [${minPrice}, ${maxPrice}]`,
        statusCode: 400,
        details: {
          minPrice: String(minPrice),
          maxPrice: String(maxPrice),
          actualPrice: String(numericPrice),
          policyId: policy._id.toString(),
          policyKey: policy.policyKey,
          policyVersion: policy.version,
        },
      };
    }
  }

  if (resolvedSessions !== null) {
    if (!Number.isInteger(resolvedSessions) || resolvedSessions < policy.minSessions || resolvedSessions > policy.maxSessions) {
      return {
        valid: false,
        code: "SESSION_COUNT_OUT_OF_POLICY_RANGE",
        message: `Class session count ${resolvedSessions} violates active CoursePricingPolicy bounds [${policy.minSessions}, ${policy.maxSessions}]`,
        statusCode: 400,
        details: {
          minSessions: policy.minSessions,
          maxSessions: policy.maxSessions,
          actualSessions: resolvedSessions,
          policyId: policy._id.toString(),
          policyKey: policy.policyKey,
          policyVersion: policy.version,
        },
      };
    }
  }

  return {
    valid: true,
    policyId: policy._id,
    policyKey: policy.policyKey,
    policyVersion: policy.version,
    scopeType: policy.scopeType,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo || null,
    minPrice: String(minPrice),
    maxPrice: String(maxPrice),
    minSessions: policy.minSessions,
    maxSessions: policy.maxSessions,
    allowFree: policy.allowFree,
    classType: policy.classType,
  };
};

/**
 * CUR-09 Handover helper for Tin (enrollmentService):
 * Extracts immutable Class syllabus + pricing policy snapshot fields to embed into new Enrollments.
 */
const buildEnrollmentSnapshotFromClass = (cls) => {
  if (!cls) {
    return {
      syllabusVersionId: null,
      syllabusVersionNumber: null,
      pricingPolicyId: null,
      pricingPolicyKey: null,
      pricingPolicyVersion: null,
      pricingPolicySnapshot: null,
    };
  }
  const snap = cls.pricingPolicySnapshot || null;
  return {
    syllabusVersionId: cls.syllabusVersionId || null,
    syllabusVersionNumber: cls.syllabusVersionNumber || null,
    pricingPolicyId: cls.pricingPolicyId || (snap && snap.policyId) || null,
    pricingPolicyKey: cls.pricingPolicyKey || (snap && snap.policyKey) || null,
    pricingPolicyVersion: cls.pricingPolicyVersion || (snap && snap.version) || null,
    pricingPolicySnapshot: snap
      ? {
          policyId: snap.policyId || cls.pricingPolicyId || null,
          policyKey: snap.policyKey || cls.pricingPolicyKey || null,
          version: snap.version || cls.pricingPolicyVersion || null,
          scopeType: snap.scopeType || null,
          classType: snap.classType || null,
          allowFree: snap.allowFree !== undefined ? snap.allowFree : null,
          minPrice: snap.minPrice !== undefined ? snap.minPrice : null,
          maxPrice: snap.maxPrice !== undefined ? snap.maxPrice : null,
          minSessions: snap.minSessions !== undefined ? snap.minSessions : null,
          maxSessions: snap.maxSessions !== undefined ? snap.maxSessions : null,
          effectiveFrom: snap.effectiveFrom || null,
          effectiveTo: snap.effectiveTo || null,
          capturedAt: snap.capturedAt || new Date(),
        }
      : null,
  };
};

const previewVerificationForCourse = async (body = {}) => {
  if (!body.courseId) throw validationError("courseId is required");
  assertId(body.courseId, "Course not found", "COURSE_NOT_FOUND");
  const course = await Course.findOne({ _id: body.courseId, ...NOT_DELETED }).lean();
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  const now = body.asOf ? parseDate(body.asOf, "asOf") : new Date();
  return verifyClassPricingPolicy({
    course,
    price: body.price,
    classType: body.classType,
    totalSessions: body.totalSessions,
    now,
  });
};

const getEffectivePolicyForCourse = async (courseId, query = {}) => {
  assertId(courseId, "Course not found", "COURSE_NOT_FOUND");
  const course = await Course.findOne({ _id: courseId, ...NOT_DELETED }).lean();
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  const classType = query.classType ? String(query.classType).trim().toUpperCase() : "PAID";
  if (!["FREE", "PAID"].includes(classType)) {
    throw validationError("classType must be FREE or PAID");
  }
  const policy = await resolveEffectivePolicy({ course, classType, now: new Date() });
  if (!policy) return null;
  return {
    id: policy._id,
    policyKey: policy.policyKey,
    version: policy.version,
    name: policy.name,
    scopeType: policy.scopeType,
    classType: policy.classType,
    allowFree: policy.allowFree,
    minPrice: String(toNum(policy.minPrice)),
    maxPrice: String(toNum(policy.maxPrice)),
    minSessions: policy.minSessions,
    maxSessions: policy.maxSessions,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo,
  };
};

module.exports = {
  buildCanonicalPolicyKey,
  createPolicyVersion,
  createNextVersionFromId,
  activatePolicy,
  rollbackToPolicyVersion,
  archivePolicy,
  listPolicies,
  getPolicyDetail,
  resolveEffectivePolicy,
  verifyClassPricingPolicy,
  previewVerificationForCourse,
  getEffectivePolicyForCourse,
  buildEnrollmentSnapshotFromClass,
};
