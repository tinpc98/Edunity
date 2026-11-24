const { Category, Subject, SyllabusVersion } = require("../models");
const { AppError } = require("../utils/errors");
const { resolveGradeLevel } = require("../utils/gradeLevel");
const catalog = require("./courseCatalogService");

const NOT_DELETED = { isDeleted: { $ne: true } };

// Tuition per student for the whole course. FrontEnd/src/utils/classForm.ts mirrors these two limits.
const MIN_CLASS_PRICE = 1000;
const MAX_CLASS_PRICE = 5000000;

/**
 * External dependency verifier port for CUR-10:
 * - TEA-12 (TeacherContract ACTIVE): WIRED by default to teacherContractService.verifyContract.
 *
 * IMPORTANT: User.teacherProfile.verificationStatus === "VERIFIED" is NEVER treated as equivalent
 * to TEA-12 contract ACTIVE. Without a contract verifier, the contract gate fails closed (503).
 */
const defaultVerifiers = () => ({
  contractVerifier: (args) => require("./teacherContractService").verifyContract(args), // lazy: avoids a require cycle
});

let registeredVerifiers = defaultVerifiers();

const setDependencyVerifiers = (overrides = {}) => {
  if ("contractVerifier" in overrides) {
    registeredVerifiers.contractVerifier = overrides.contractVerifier || null;
  }
};

const resetDependencyVerifiers = () => {
  registeredVerifiers = defaultVerifiers();
};

const getDependencyStatus = () => ({
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

  // The course level is informative only: a class opens whether or not its course has one
  const normalizedCourseLevel = course.level ? catalog.resolveLevel(course.level) : null;

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

const getClassPriceRange = (classType) =>
  classType === "FREE" ? { minPrice: 0, maxPrice: 0 } : { minPrice: MIN_CLASS_PRICE, maxPrice: MAX_CLASS_PRICE };

/**
 * Step 4: one tuition range for every course. CoursePricingPolicy no longer takes part in opening a class.
 */
const assertClassPrice = (classType, price) => {
  const { minPrice, maxPrice } = getClassPriceRange(classType);
  if (Number.isInteger(price) && price >= minPrice && price <= maxPrice) return;
  throw new AppError(
    `${classType} class price must be an integer from ${minPrice} to ${maxPrice} VND per student`,
    "CLASS_PRICE_OUT_OF_RANGE",
    400,
    { classType, minPrice, maxPrice }
  );
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
  const reverificationEnabled =
    process.env.ENABLE_TEACHER_REVERIFICATION === "true" ||
    (process.env.NODE_ENV === "test" && process.env.ENABLE_TEACHER_REVERIFICATION !== "false");
  if (!reverificationEnabled) return;

  const verifiedUntil = teacher && teacher.teacherProfile && teacher.teacherProfile.verifiedUntil;
  if (verifiedUntil && new Date(verifiedUntil) <= now) {
    throw new AppError("Teacher verification has expired: re-verify to open classes", "TEACHER_REVERIFICATION_REQUIRED", 403);
  }
};

const CHECK_LABELS = {
  TEACHER_VERIFICATION: "Xác minh giáo viên",
  COURSE: "Khóa học chuẩn",
  CLASS_INFORMATION: "Thông tin và ngày học",
  SCHEDULE_SESSIONS: "Lịch học và buổi học",
  TEACHING_AUTHORIZATION: "Quyền giảng dạy",
  TEACHER_CONTRACT: "Hợp đồng giảng dạy",
  CLASS_PRICE_RANGE: "Học phí",
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
  GRADE_LEVEL_NOT_SUPPORTED: "Khóa học ngoài phạm vi Lớp 6–12 và Ôn thi đại học",
  CLASS_INCOMPLETE: ({ missing = [] }) => `Còn thiếu: ${missing.map((field) => FIELD_LABELS[field] || field).join(", ")}`,
  CLASS_DATES_INVALID: "Ngày bắt đầu phải trước ngày kết thúc",
  CLASS_START_DATE_REACHED: "Ngày khai giảng phải sau hôm nay để kịp xét duyệt",
  SCHEDULE_OVERLAP: "Các ca học trong tuần đang trùng giờ nhau",
  SESSION_OUT_OF_CLASS_RANGE: "Có buổi học nằm ngoài khoảng ngày khai giảng – kết thúc",
  SUBJECT_AUTHORIZATION_REQUIRED: "Giáo viên chưa có quyền giảng dạy được duyệt cho môn, khối và cấp độ này",
  SUBJECT_AUTHORIZATION_PENDING: "Quyền giảng dạy đang chờ Admin duyệt",
  SUBJECT_AUTHORIZATION_SUSPENDED: "Quyền giảng dạy đang bị đình chỉ",
  TEACHER_CONTRACT_NOT_FOUND: "Giáo viên chưa có hợp đồng giảng dạy",
  TEACHER_CONTRACT_NOT_ACTIVE: ({ contractStatus }) =>
    `Hợp đồng giảng dạy ${CONTRACT_STATES[contractStatus] || "không ở trạng thái có hiệu lực"}`,
  TEACHER_CONTRACT_EXPIRED: "Hợp đồng giảng dạy đã hết hạn",
  CONTRACT_DEPENDENCY_BLOCKED: "Chưa kiểm tra được hợp đồng giảng dạy",
  CLASS_PRICE_OUT_OF_RANGE: ({ classType, minPrice, maxPrice }) =>
    classType === "FREE"
      ? "Lớp miễn phí phải có học phí 0 VNĐ"
      : `Học phí phải là số nguyên từ ${formatVnd(minPrice)} đến ${formatVnd(maxPrice)} VNĐ/học viên`,
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
 * CUR-09: Captures the immutable SyllabusVersion snapshot for a Class.
 * The pricingPolicy* fields are history: they are neither filled nor cleared any more.
 */
const captureClassSnapshots = async ({ course }) => {
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

  return { syllabusVersionId, syllabusVersionNumber };
};

module.exports = {
  MIN_CLASS_PRICE,
  MAX_CLASS_PRICE,
  getClassPriceRange,
  assertClassPrice,
  assertVerificationCurrent,
  setDependencyVerifiers,
  resetDependencyVerifiers,
  getDependencyStatus,
  assertCourseAlignment,
  assertTeacherContractGate,
  runClassChecks,
  presentCheck,
  throwFailedChecks,
  captureClassSnapshots,
};

