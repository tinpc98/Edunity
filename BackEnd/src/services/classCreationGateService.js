const { Category, Subject, SyllabusVersion } = require("../models");
const { COURSE_LEVELS } = require("../models/constants");
const { AppError } = require("../utils/errors");
const { validationError } = require("../utils/http");
const { toNum, toDec } = require("../utils/money");
const { resolveGradeLevel } = require("../utils/gradeLevel");
const catalog = require("./courseCatalogService");
const pricingPolicyService = require("./coursePricingPolicyService");

const NOT_DELETED = { isDeleted: { $ne: true } };

/**
 * External dependency verifier ports for CUR-10:
 * - CUR-07 (CoursePricingPolicy): WIRED by default to coursePricingPolicyService.verifyClassPricingPolicy.
 * - TEA-12 (TeacherContract ACTIVE): WIRED by default to teacherContractService.verifyContract.
 *
 * IMPORTANT: User.teacherProfile.verificationStatus === "VERIFIED" is NEVER treated as equivalent
 * to TEA-12 contract ACTIVE. Without a contract verifier, the contract gate fails closed (503).
 */
const defaultVerifiers = () => ({
  pricingPolicyVerifier: pricingPolicyService.verifyClassPricingPolicy,
  contractVerifier: (args) => require("./teacherContractService").verifyContract(args), // lazy: avoids a require cycle
});

let registeredVerifiers = defaultVerifiers();

const setDependencyVerifiers = (overrides = {}) => {
  if ("pricingPolicyVerifier" in overrides) {
    registeredVerifiers.pricingPolicyVerifier = overrides.pricingPolicyVerifier || null;
  }
  if ("contractVerifier" in overrides) {
    registeredVerifiers.contractVerifier = overrides.contractVerifier || null;
  }
};

const resetDependencyVerifiers = () => {
  registeredVerifiers = defaultVerifiers();
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

  let price = 0;
  if (cls && cls.price !== undefined) {
    price = toNum(cls.price);
  } else if (body && body.price !== undefined) {
    if (
      body.price === null ||
      typeof body.price === "boolean" ||
      Array.isArray(body.price) ||
      typeof body.price === "object" ||
      (typeof body.price === "string" && body.price.trim() === "")
    ) {
      throw validationError("price must be a finite number");
    }
    price = Number(body.price);
    if (!Number.isFinite(price)) {
      throw validationError("price must be a finite number");
    }
  }
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
 * BAO-10: past verifiedUntil the teacher keeps existing classes but cannot open, edit or get new ones approved.
 * No verifiedUntil yet (verified before BAO-10) passes: the maintenance job gives those teachers a deadline.
 */
const assertVerificationCurrent = ({ teacher, now = new Date() }) => {
  const verifiedUntil = teacher && teacher.teacherProfile && teacher.teacherProfile.verifiedUntil;
  if (verifiedUntil && new Date(verifiedUntil) <= now) {
    throw new AppError("Teacher verification has expired: re-verify to open classes", "TEACHER_REVERIFICATION_REQUIRED", 403);
  }
};

/**
 * A DRAFT is not held to CUR-07, but still records the policy it already satisfies (CUR-09).
 * Approval re-evaluates the policy and overwrites this snapshot.
 */
const findSatisfiedPricingPolicy = async (args) => {
  try {
    return await assertPricingPolicyGate(args);
  } catch (err) {
    if (err instanceof AppError) return null;
    throw err;
  }
};

/** CUR-07 also defines how many sessions make a class complete; unlike its price range, that part blocks submission. */
const assertSessionCountWithinPolicy = async ({ course, cls, totalSessions }) => {
  if (!course) return;
  const policy = await pricingPolicyService.resolveEffectivePolicy({ course, classType: cls.classType });
  if (!policy || (totalSessions >= policy.minSessions && totalSessions <= policy.maxSessions)) return;
  throw new AppError(
    `Class session count ${totalSessions} violates active CoursePricingPolicy bounds [${policy.minSessions}, ${policy.maxSessions}]`,
    "SESSION_COUNT_OUT_OF_POLICY_RANGE",
    400,
    { minSessions: policy.minSessions, maxSessions: policy.maxSessions, actualSessions: totalSessions }
  );
};

const CHECK_LABELS = {
  TEACHER_VERIFICATION: "Xác minh giáo viên",
  COURSE: "Khóa học chuẩn",
  CLASS_INFORMATION: "Thông tin và ngày học",
  SCHEDULE_SESSIONS: "Lịch học và buổi học",
  TEACHING_AUTHORIZATION: "Quyền giảng dạy",
  TEACHER_CONTRACT: "Hợp đồng giảng dạy",
  PRICING_POLICY: "Chính sách giá",
};

const FIELD_LABELS = {
  description: "mô tả lớp",
  enrollmentStart: "ngày mở đăng ký",
  enrollmentEnd: "ngày đóng đăng ký",
  startDate: "ngày khai giảng",
  endDate: "ngày kết thúc",
  schedule: "lịch học cố định",
  sessions: "buổi học",
};

const CONTRACT_STATES = {
  PENDING_SIGNATURE: "đang chờ giáo viên ký",
  DECLINED: "đã bị giáo viên từ chối ký",
  CANCELLED: "đã bị hủy",
  TERMINATED: "đã chấm dứt",
  NOT_YET_EFFECTIVE: "chưa tới ngày hiệu lực",
};

const formatVnd = (value) => Number(value).toLocaleString("vi-VN");

const FAILURE_MESSAGES = {
  ACCOUNT_NOT_ACTIVE: "Tài khoản giáo viên không hoạt động",
  TEACHER_NOT_VERIFIED: "Hồ sơ giáo viên chưa được xác minh",
  TEACHER_REVERIFICATION_REQUIRED: "Xác minh giáo viên đã hết hạn, cần tái xác minh",
  COURSE_NOT_FOUND: "Khóa học chuẩn không còn hoạt động",
  COURSE_NOT_ACTIVE: "Khóa học chuẩn không còn hoạt động",
  COURSE_CATALOG_INACTIVE: "Môn học hoặc danh mục của khóa học không còn hoạt động",
  COURSE_LEVEL_REQUIRED: "Khóa học chuẩn chưa có cấp độ hợp lệ",
  COURSE_ATTRIBUTE_MISMATCH: "Thông tin lớp không còn khớp với khóa học chuẩn",
  CLASS_INCOMPLETE: ({ missing = [] }) => `Còn thiếu: ${missing.map((field) => FIELD_LABELS[field] || field).join(", ")}`,
  CLASS_DATES_INVALID: "Ngày bắt đầu phải trước ngày kết thúc",
  CLASS_START_DATE_REACHED: "Ngày khai giảng phải sau hôm nay để kịp xét duyệt",
  SCHEDULE_OVERLAP: "Các ca học trong tuần đang trùng giờ nhau",
  SESSION_OUT_OF_CLASS_RANGE: "Có buổi học nằm ngoài khoảng ngày khai giảng – kết thúc",
  SESSION_COUNT_OUT_OF_POLICY_RANGE: ({ minSessions, maxSessions, actualSessions }) =>
    `Lớp có ${actualSessions} buổi, chính sách yêu cầu từ ${minSessions} đến ${maxSessions} buổi`,
  SUBJECT_AUTHORIZATION_REQUIRED: "Giáo viên chưa có quyền giảng dạy được duyệt cho môn, khối và cấp độ này",
  SUBJECT_AUTHORIZATION_PENDING: "Quyền giảng dạy đang chờ Admin duyệt",
  SUBJECT_AUTHORIZATION_SUSPENDED: "Quyền giảng dạy đang bị đình chỉ",
  TEACHER_CONTRACT_NOT_FOUND: "Giáo viên chưa có hợp đồng giảng dạy",
  TEACHER_CONTRACT_NOT_ACTIVE: ({ contractStatus }) =>
    `Hợp đồng giảng dạy ${CONTRACT_STATES[contractStatus] || "không ở trạng thái có hiệu lực"}`,
  TEACHER_CONTRACT_EXPIRED: "Hợp đồng giảng dạy đã hết hạn",
  CONTRACT_DEPENDENCY_BLOCKED: "Chưa kiểm tra được hợp đồng giảng dạy",
  PRICING_POLICY_NOT_CONFIGURED: "Chưa có chính sách giá hiệu lực cho khóa học này",
  PRICING_POLICY_FREE_NOT_ALLOWED: "Chính sách giá không cho phép mở lớp miễn phí",
  PRICING_POLICY_DEPENDENCY_BLOCKED: "Chưa kiểm tra được chính sách giá",
  PRICE_OUT_OF_POLICY_RANGE: ({ minPrice, maxPrice }) =>
    minPrice === undefined
      ? "Học phí nằm ngoài khung chính sách giá"
      : `Học phí phải từ ${formatVnd(minPrice)} đến ${formatVnd(maxPrice)} VNĐ`,
};

const describeFailure = (key, err) => {
  const message = FAILURE_MESSAGES[err.code];
  if (!message) return `${CHECK_LABELS[key]} chưa hợp lệ (${err.code})`;
  return typeof message === "function" ? message(err.details || {}) : message;
};

/** Runs every check instead of stopping at the first failure. Only business errors count as a failed check. */
const runClassChecks = async (checks) => {
  const results = [];
  for (const [key, blocksSubmit, assertion] of checks) {
    let error = null;
    try {
      await assertion();
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      error = err;
    }
    results.push({ key, blocksSubmit, error });
  }
  return results;
};

const presentCheck = ({ key, blocksSubmit, error }) => ({
  key,
  label: CHECK_LABELS[key],
  code: error ? error.code : null,
  status: error ? "PENDING" : "PASSED",
  blocksSubmit,
  message: error ? describeFailure(key, error) : "Đạt",
});

/** Rethrows the first failure with its own code and status, listing every failure in details.pendingChecks. */
const throwFailedChecks = (results) => {
  const failed = results.filter((result) => result.error);
  if (!failed.length) return;
  const { error } = failed[0];
  const details = { ...error.details, pendingChecks: failed.map(presentCheck) };
  if (error.code === "CLASS_INCOMPLETE") {
    details.missing = failed.flatMap((result) => (result.error.code === "CLASS_INCOMPLETE" ? result.error.details.missing : []));
  }
  error.details = details;
  throw error;
};

/**
 * CUR-09: Captures immutable SyllabusVersion + CoursePricingPolicy snapshots for a Class.
 */
const captureClassSnapshots = async ({ course, pricingResult = null, now = new Date() }) => {
  let syllabusVersionId = course && course.publishedSyllabusVersionId ? course.publishedSyllabusVersionId : null;
  let syllabusVersionNumber = null;

  if (syllabusVersionId) {
    const sv = await SyllabusVersion.findOne({ _id: syllabusVersionId, ...NOT_DELETED })
      .select("_id versionNumber")
      .lean();
    if (sv) {
      syllabusVersionId = sv._id;
      syllabusVersionNumber = sv.versionNumber || null;
    }
  }

  const hasRichPolicy = Boolean(
    pricingResult &&
      (pricingResult.policyId || pricingResult.policyKey || pricingResult.policyVersion !== undefined)
  );

  const pricingPolicyId = hasRichPolicy && pricingResult.policyId ? pricingResult.policyId : null;
  const pricingPolicyKey = hasRichPolicy && pricingResult.policyKey ? pricingResult.policyKey : null;
  const pricingPolicyVersion =
    hasRichPolicy && pricingResult.policyVersion !== undefined && pricingResult.policyVersion !== null
      ? Number(pricingResult.policyVersion)
      : null;

  const pricingPolicySnapshot = hasRichPolicy
    ? {
        policyId: pricingPolicyId,
        policyKey: pricingPolicyKey,
        version: pricingPolicyVersion,
        scopeType: pricingResult.scopeType || null,
        classType: pricingResult.classType || null,
        allowFree: pricingResult.allowFree !== undefined ? pricingResult.allowFree : null,
        minPrice: pricingResult.minPrice !== undefined && pricingResult.minPrice !== null ? toDec(pricingResult.minPrice) : null,
        maxPrice: pricingResult.maxPrice !== undefined && pricingResult.maxPrice !== null ? toDec(pricingResult.maxPrice) : null,
        minSessions: pricingResult.minSessions !== undefined ? pricingResult.minSessions : null,
        maxSessions: pricingResult.maxSessions !== undefined ? pricingResult.maxSessions : null,
        effectiveFrom: pricingResult.effectiveFrom || null,
        effectiveTo: pricingResult.effectiveTo || null,
        capturedAt: now,
      }
    : null;

  return {
    syllabusVersionId,
    syllabusVersionNumber,
    pricingPolicyId,
    pricingPolicyKey,
    pricingPolicyVersion,
    pricingPolicySnapshot,
  };
};

module.exports = {
  assertVerificationCurrent,
  setDependencyVerifiers,
  resetDependencyVerifiers,
  getDependencyStatus,
  assertCourseAlignment,
  assertPricingPolicyGate,
  assertTeacherContractGate,
  findSatisfiedPricingPolicy,
  assertSessionCountWithinPolicy,
  runClassChecks,
  presentCheck,
  throwFailedChecks,
  captureClassSnapshots,
  buildEnrollmentSnapshotFromClass: pricingPolicyService.buildEnrollmentSnapshotFromClass,
};

