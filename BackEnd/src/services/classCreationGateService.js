const { Category, Subject } = require("../models");
const { COURSE_LEVELS } = require("../models/constants");
const { AppError } = require("../utils/errors");
const { validationError } = require("../utils/http");
const { toNum } = require("../utils/money");
const { resolveGradeLevel } = require("../utils/gradeLevel");
const catalog = require("./courseCatalogService");
const { assertApprovedAuthorization } = require("./teacherSubjectAuthorizationService");

const NOT_DELETED = { isDeleted: { $ne: true } };

/**
 * External dependency verifier ports for CUR-10:
 * - CUR-07 (CoursePricingPolicy): NOT present in codebase yet -> MISSING / BLOCKED unless registered.
 * - TEA-12 (TeacherContract ACTIVE by Bao): NOT present in codebase yet -> BLOCKED unless registered.
 *
 * IMPORTANT: User.teacherProfile.verificationStatus === "VERIFIED" is NEVER treated as equivalent
 * to TEA-12 contract ACTIVE. Without an official contract verifier, the contract gate fails closed (503).
 */
let registeredVerifiers = {
  pricingPolicyVerifier: null,
  contractVerifier: null,
};

const setDependencyVerifiers = (overrides = {}) => {
  if ("pricingPolicyVerifier" in overrides) {
    registeredVerifiers.pricingPolicyVerifier = overrides.pricingPolicyVerifier || null;
  }
  if ("contractVerifier" in overrides) {
    registeredVerifiers.contractVerifier = overrides.contractVerifier || null;
  }
};

const resetDependencyVerifiers = () => {
  registeredVerifiers = { pricingPolicyVerifier: null, contractVerifier: null };
};

const getDependencyStatus = () => ({
  cur07PricingPolicyReady: typeof registeredVerifiers.pricingPolicyVerifier === "function",
  tea12ContractReady: typeof registeredVerifiers.contractVerifier === "function",
});

/**
 * Step 1 & 2: Course catalog alignment & client attribute anti-tampering guard.
 */
const assertCourseAlignment = async ({ course, cls = null, body = {} }) => {
  if (!course || course.isDeleted || course.status !== "ACTIVE") {
    throw new AppError("Selected course is not active", "COURSE_NOT_ACTIVE", 400);
  }

  const [subject, category] = await Promise.all([
    Subject.findOne({ _id: course.subjectId, status: "ACTIVE", ...NOT_DELETED }).lean(),
    Category.findOne({ _id: course.categoryId, status: "ACTIVE", ...NOT_DELETED }).lean(),
  ]);
  if (!subject) {
    throw new AppError("Course subject is inactive or missing", "COURSE_CATALOG_INACTIVE", 400);
  }
  if (!category || String(subject.categoryId) !== String(category._id)) {
    throw new AppError("Course category is inactive or mismatched", "COURSE_CATALOG_INACTIVE", 400);
  }

  const normalizedCourseLevel = catalog.resolveLevel(course.level);
  if (!normalizedCourseLevel || !COURSE_LEVELS.includes(normalizedCourseLevel)) {
    throw new AppError(
      "Selected course must have a valid level (BEGINNER, INTERMEDIATE, ADVANCED) before opening a class",
      "COURSE_LEVEL_REQUIRED",
      400
    );
  }

  const normalizedCourseGrade = course.gradeLevel || null;
  // Validate course's gradeLevel against its category bounds
  resolveGradeLevel(category, normalizedCourseGrade);

  // Reject any attempt by the caller to submit attributes conflicting with the Course
  const mismatches = [];
  if (body.categoryId !== undefined && body.categoryId !== null && String(body.categoryId) !== String(course.categoryId)) {
    mismatches.push({ field: "categoryId", expected: String(course.categoryId), actual: String(body.categoryId) });
  }
  if (body.subjectId !== undefined && body.subjectId !== null && String(body.subjectId) !== String(course.subjectId)) {
    mismatches.push({ field: "subjectId", expected: String(course.subjectId), actual: String(body.subjectId) });
  }
  if (body.gradeLevel !== undefined) {
    const requestedGrade = body.gradeLevel === "" || body.gradeLevel === null ? null : String(body.gradeLevel);
    if (requestedGrade !== normalizedCourseGrade) {
      mismatches.push({ field: "gradeLevel", expected: normalizedCourseGrade, actual: requestedGrade });
    }
  }
  if (body.level !== undefined) {
    const requestedLevel = catalog.resolveLevel(body.level) || String(body.level);
    if (requestedLevel !== normalizedCourseLevel) {
      mismatches.push({ field: "level", expected: normalizedCourseLevel, actual: requestedLevel });
    }
  }

  // On existing Class (update/submit), also confirm stored fields stay synchronized with Course
  if (cls) {
    if (String(cls.categoryId) !== String(course.categoryId)) {
      mismatches.push({ field: "class.categoryId", expected: String(course.categoryId), actual: String(cls.categoryId) });
    }
    if (String(cls.subjectId) !== String(course.subjectId)) {
      mismatches.push({ field: "class.subjectId", expected: String(course.subjectId), actual: String(cls.subjectId) });
    }
    if ((cls.gradeLevel || null) !== normalizedCourseGrade) {
      mismatches.push({ field: "class.gradeLevel", expected: normalizedCourseGrade, actual: cls.gradeLevel || null });
    }
    if (cls.level && cls.level !== normalizedCourseLevel) {
      mismatches.push({ field: "class.level", expected: normalizedCourseLevel, actual: cls.level });
    }
  }

  if (mismatches.length > 0) {
    const err = new AppError(
      "Class attributes do not match the selected Course (Subject, Category, GradeLevel, or Level)",
      "COURSE_ATTRIBUTE_MISMATCH",
      400
    );
    err.details = { mismatches };
    throw err;
  }

  return { subject, category, level: normalizedCourseLevel, gradeLevel: normalizedCourseGrade };
};

/**
 * Step 4: CUR-07 CoursePricingPolicy verification gate (fail-closed if CUR-07 is missing).
 */
const assertPricingPolicyGate = async ({ teacher, course, cls, body, totalSessions = null, pricingPolicyVerifier }) => {
  const verifier = pricingPolicyVerifier !== undefined ? pricingPolicyVerifier : registeredVerifiers.pricingPolicyVerifier;
  if (typeof verifier !== "function") {
    const err = new AppError(
      "Class pricing policy check is blocked because CUR-07 (CoursePricingPolicy) is not available in this codebase",
      "PRICING_POLICY_DEPENDENCY_BLOCKED",
      503
    );
    err.details = { dependency: "CUR-07", status: "BLOCKED" };
    throw err;
  }

  const price = cls && cls.price !== undefined ? toNum(cls.price) : body && body.price !== undefined ? Number(body.price) : 0;
  const classType = (cls && cls.classType) || (body && body.classType) || null;
  const result = await verifier({ teacher, course, cls, body, price, classType, totalSessions });
  if (result && result.valid === false) {
    const err = new AppError(
      result.message || "Class pricing violates active CoursePricingPolicy",
      result.code || "PRICING_POLICY_VIOLATION",
      result.statusCode || 400
    );
    if (result.details) err.details = result.details;
    throw err;
  }
  return result || { valid: true };
};

/**
 * Step 5: TEA-12 Teacher contract ACTIVE verification gate (fail-closed if TEA-12 is missing).
 * Explicitly rejects falling back to User.teacherProfile.verificationStatus === "VERIFIED".
 */
const assertTeacherContractGate = async ({ teacher, now = new Date(), contractVerifier }) => {
  const verifier = contractVerifier !== undefined ? contractVerifier : registeredVerifiers.contractVerifier;
  if (typeof verifier !== "function") {
    const err = new AppError(
      "Teacher contract verification is blocked because TEA-12 (TeacherContract ACTIVE by Bao) is not available in this codebase",
      "CONTRACT_DEPENDENCY_BLOCKED",
      503
    );
    err.details = { dependency: "TEA-12", owner: "Bao", status: "BLOCKED" };
    throw err;
  }

  const contract = await verifier({ teacherId: teacher._id, teacher, now });
  if (!contract) {
    throw new AppError("Teacher does not have an active teaching contract", "TEACHER_CONTRACT_NOT_FOUND", 403);
  }
  if (contract.status !== "ACTIVE") {
    const err = new AppError(
      `Teacher contract status is ${contract.status || "UNKNOWN"}; an ACTIVE contract is required`,
      "TEACHER_CONTRACT_NOT_ACTIVE",
      403
    );
    err.details = { contractStatus: contract.status || null };
    throw err;
  }
  if (contract.expiresAt && new Date(contract.expiresAt) <= now) {
    throw new AppError("Teacher contract has expired", "TEACHER_CONTRACT_EXPIRED", 403);
  }
  return contract;
};

/**
 * Full CUR-10 Gate executed on createClass, updateClass, and submitClass.
 */
const validateClassGate = async ({
  teacher,
  course,
  cls = null,
  body = {},
  mode = "CREATE",
  totalSessions = null,
  now = new Date(),
  pricingPolicyVerifier,
  contractVerifier,
}) => {
  const alignment = await assertCourseAlignment({ course, cls, body });

  await assertApprovedAuthorization({
    teacherId: teacher._id,
    subjectId: course.subjectId,
    gradeLevel: alignment.gradeLevel,
    level: alignment.level,
  });

  const pricingResult = await assertPricingPolicyGate({
    teacher,
    course,
    cls,
    body,
    totalSessions,
    pricingPolicyVerifier,
  });

  const contractResult = await assertTeacherContractGate({
    teacher,
    now,
    contractVerifier,
  });

  return { mode, alignment, pricingResult, contractResult };
};

module.exports = {
  setDependencyVerifiers,
  resetDependencyVerifiers,
  getDependencyStatus,
  assertCourseAlignment,
  assertPricingPolicyGate,
  assertTeacherContractGate,
  validateClassGate,
};

