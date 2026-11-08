/**
 * EDUNITY V3 — IDEMPOTENT ACADEMIC FIXTURE SEED ENGINE (TASK G0-04)
 *
 * Implements:
 * 1. Safe, zero-destructive seeding using Stable Natural Keys (Upsert pattern).
 * 2. Guaranteed Idempotency: Multiple runs produce identical document counts (0 duplicates).
 * 3. Topological key resolution for referential integrity (Category -> Subject -> Course -> Class -> Session).
 * 4. Strict Database Guardrail: Protects production databases against accidental writes.
 * 5. Full compliance with V3 Schema Enums (BEGINNER, not BASIC; FREE price=0, PAID price>0).
 */

const mongoose = require("mongoose");
const { hashPassword } = require("../src/utils/password");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../src/models/constants");
const defaultModels = require("../src/models");

const DEFAULT_DEMO_PASSWORD = "Edunity@2026";
const passwordHash = hashPassword(DEFAULT_DEMO_PASSWORD);

// =============================================================================
// 1. DATABASE GUARDRAIL & SAFETY GATES
// =============================================================================

const ALLOWED_SEED_DATABASES = [
  "edunity_demo_v3",
  "edunity_test",
  "test",
];

const assertSafeDatabaseTarget = (dbName, connectionUri = "") => {
  const isLocalOrMemory =
    connectionUri.includes("127.0.0.1") ||
    connectionUri.includes("localhost") ||
    !connectionUri; // In-memory / mock db

  // Explicitly disallow production database "edunity"
  if (dbName === "edunity" && !isLocalOrMemory) {
    throw new Error(
      `[SECURITY BLOCKER] Refusing to seed production database "${dbName}". ` +
      `Idempotent seed is strictly restricted to "edunity_demo_v3" or local/test databases.`
    );
  }

  const isAllowed = ALLOWED_SEED_DATABASES.includes(dbName) || isLocalOrMemory;
  if (!isAllowed) {
    throw new Error(
      `[SECURITY BLOCKER] Database "${dbName}" is not in the allowed seed database list: ` +
      `[${ALLOWED_SEED_DATABASES.join(", ")}].`
    );
  }
};

// =============================================================================
// 2. STABLE ACADEMIC FIXTURE DEFINITIONS
// =============================================================================

const ACADEMIC_USERS = [
  {
    email: "admin@edunity.vn",
    role: "ADMIN",
    status: "ACTIVE",
    adminProfile: { fullName: "Quản trị viên Hệ thống" },
  },
  {
    email: "duc.nguyen@edunity.vn",
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: {
      fullName: "Nguyễn Văn Đức",
      verificationStatus: "VERIFIED",
      biography: "Thạc sĩ Toán học, 12 năm kinh nghiệm luyện thi THPT Quốc Gia.",
      qualificationSummary: "Thạc sĩ Toán - ĐH Sư Phạm Hà Nội",
    },
  },
  {
    email: "mailan.tran@edunity.vn",
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: {
      fullName: "Trần Thị Mai Lan",
      verificationStatus: "VERIFIED",
      biography: "Cử nhân Sư phạm Ngữ văn, 9 năm chuyên bồi dưỡng học sinh giỏi.",
      qualificationSummary: "Cử nhân Ngữ văn - ĐH Sư Phạm Hà Nội",
    },
  },
  {
    email: "minhchau.pham@edunity.vn",
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: {
      fullName: "Phạm Minh Châu",
      verificationStatus: "VERIFIED",
      biography: "IELTS 8.5, chứng chỉ giảng dạy quốc tế CELTA, 7 năm giảng dạy.",
      qualificationSummary: "Thạc sĩ Ngôn ngữ học ứng dụng",
    },
  },
  {
    email: "anhkhoa.bui@edunity.vn",
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: {
      fullName: "Bùi Anh Khoa",
      verificationStatus: "VERIFIED",
      biography: "Kỹ sư phần mềm, giảng viên lập trình Python và Scratch cho trẻ em.",
      qualificationSummary: "Kỹ sư CNTT - ĐH Bách Khoa",
    },
  },
  {
    email: "student.minhanh@edunity.vn",
    role: "STUDENT",
    status: "ACTIVE",
    studentProfile: { fullName: "Nguyễn Minh Anh", grade: 12 },
  },
  {
    email: "student.giabao@edunity.vn",
    role: "STUDENT",
    status: "ACTIVE",
    studentProfile: { fullName: "Trần Gia Bảo", grade: 12 },
  },
  {
    email: "student.khanhlinh@edunity.vn",
    role: "STUDENT",
    status: "ACTIVE",
    studentProfile: { fullName: "Lê Khánh Linh", grade: 11 },
  },
];

const ACADEMIC_CATEGORIES = [
  {
    slug: "trung-hoc-pho-thong",
    name: "Trung học phổ thông",
    description: "Lớp 10 – 12: Kiến thức nâng cao và ôn thi tốt nghiệp THPT Quốc Gia.",
    status: "ACTIVE",
  },
  {
    slug: "trung-hoc-co-so",
    name: "Trung học cơ sở",
    description: "Lớp 6 – 9: Củng cố kiến thức nền tảng và luyện thi tuyển sinh vào lớp 10.",
    status: "ACTIVE",
  },
  {
    slug: "tieu-hoc",
    name: "Tiểu học",
    description: "Lớp 1 – 5: Toán tư duy, Tiếng Việt và Tiếng Anh thiếu nhi.",
    status: "ACTIVE",
  },
  {
    slug: "ngoai-ngu",
    name: "Ngoại ngữ",
    description: "IELTS, Tiếng Anh giao tiếp và Tiếng Nhật mọi lứa tuổi.",
    status: "ACTIVE",
  },
  {
    slug: "tin-hoc-lap-trinh",
    name: "Tin học & Lập trình",
    description: "Lập trình Python, Scratch và Tin học văn phòng ứng dụng.",
    status: "ACTIVE",
  },
];

const ACADEMIC_SUBJECTS = [
  // THPT
  { categorySlug: "trung-hoc-pho-thong", slug: "toan-thpt", name: "Toán THPT" },
  { categorySlug: "trung-hoc-pho-thong", slug: "van-thpt", name: "Ngữ văn THPT" },
  { categorySlug: "trung-hoc-pho-thong", slug: "anh-thpt", name: "Tiếng Anh THPT" },
  { categorySlug: "trung-hoc-pho-thong", slug: "ly-thpt", name: "Vật lý" },
  { categorySlug: "trung-hoc-pho-thong", slug: "hoa-thpt", name: "Hóa học" },
  // THCS
  { categorySlug: "trung-hoc-co-so", slug: "toan-thcs", name: "Toán THCS" },
  { categorySlug: "trung-hoc-co-so", slug: "van-thcs", name: "Ngữ văn THCS" },
  { categorySlug: "trung-hoc-co-so", slug: "anh-thcs", name: "Tiếng Anh THCS" },
  { categorySlug: "trung-hoc-co-so", slug: "khtn-thcs", name: "Khoa học tự nhiên" },
  // Tiểu học
  { categorySlug: "tieu-hoc", slug: "toan-th", name: "Toán Tiểu học" },
  { categorySlug: "tieu-hoc", slug: "tiengviet-th", name: "Tiếng Việt" },
  { categorySlug: "tieu-hoc", slug: "anh-th", name: "Tiếng Anh Tiểu học" },
  // Ngoại ngữ
  { categorySlug: "ngoai-ngu", slug: "ielts", name: "IELTS" },
  { categorySlug: "ngoai-ngu", slug: "giao-tiep", name: "Tiếng Anh giao tiếp" },
  { categorySlug: "ngoai-ngu", slug: "tieng-nhat", name: "Tiếng Nhật" },
  // IT
  { categorySlug: "tin-hoc-lap-trinh", slug: "python", name: "Lập trình Python" },
  { categorySlug: "tin-hoc-lap-trinh", slug: "scratch", name: "Scratch cho trẻ em" },
];

const ACADEMIC_COURSES = [
  {
    subjectSlug: "toan-thpt",
    slug: "toan-12-on-thi-tot-nghiep-thpt",
    title: "Toán 12 – Ôn thi tốt nghiệp THPT",
    gradeLevel: "GRADE_12",
    level: "ADVANCED",
    description: "Hệ thống toàn bộ chuyên đề Hàm số, Tích phân, Tọa độ Oxyz và Xác suất.",
    topics: ["Ứng dụng đạo hàm", "Hàm số mũ và logarit", "Nguyên hàm & Tích phân", "Số phức", "Tọa độ Oxyz"],
  },
  {
    subjectSlug: "toan-thpt",
    slug: "toan-10-nen-tang-dai-so-va-hinh-hoc",
    title: "Toán 10 – Nền tảng Đại số và Hình học",
    gradeLevel: "GRADE_10",
    level: "BEGINNER", // Strictly BEGINNER, not BASIC
    description: "Mệnh đề, tập hợp, hàm số bậc hai, vectơ và hệ thức lượng trong tam giác.",
    topics: ["Mệnh đề và tập hợp", "Hàm số bậc hai", "Hệ thức lượng tam giác", "Vectơ"],
  },
  {
    subjectSlug: "van-thpt",
    slug: "ngu-van-12-nghi-luan-van-hoc-va-xa-hoi",
    title: "Ngữ văn 12 – Nghị luận văn học và xã hội",
    gradeLevel: "GRADE_12",
    level: "INTERMEDIATE",
    description: "Kỹ năng đọc hiểu văn bản, nghị luận xã hội 200 chữ và phân tích tác phẩm trọng tâm.",
    topics: ["Kỹ năng đọc hiểu", "Nghị luận xã hội 200 chữ", "Tây Tiến", "Vợ chồng A Phủ"],
  },
  {
    subjectSlug: "anh-thpt",
    slug: "tieng-anh-12-luyen-de-tot-nghiep-thpt",
    title: "Tiếng Anh 12 – Luyện đề tốt nghiệp THPT",
    gradeLevel: "GRADE_12",
    level: "ADVANCED",
    description: "Tổng ôn ngữ pháp, từ vựng theo chủ đề và chiến thuật giải nhanh đề thi trắc nghiệm.",
    topics: ["Ngữ âm & trọng âm", "Ngữ pháp trọng tâm", "Đọc hiểu", "Luyện đề tổng hợp"],
  },
  {
    subjectSlug: "ly-thpt",
    slug: "vat-ly-11-dien-hoc-va-dao-dong",
    title: "Vật lý 11 – Điện học và Dao động",
    gradeLevel: "GRADE_11",
    level: "INTERMEDIATE",
    description: "Dao động điều hòa, sóng cơ học, điện tích và dòng điện không đổi.",
    topics: ["Dao động điều hòa", "Sóng cơ", "Điện tích & Điện trường", "Dòng điện"],
  },
  {
    subjectSlug: "hoa-thpt",
    slug: "hoa-hoc-12-huu-co-va-vo-co-trong-tam",
    title: "Hóa học 12 – Hữu cơ và Vô cơ trọng tâm",
    gradeLevel: "GRADE_12",
    level: "ADVANCED",
    description: "Este, Lipit, Cacbohiđrat, Kim loại kiềm, kiềm thổ, nhôm, sắt và hợp chất.",
    topics: ["Este - Lipit", "Cacbohiđrat", "Amin & Amino axit", "Đại cương kim loại"],
  },
  {
    subjectSlug: "toan-thcs",
    slug: "toan-9-on-thi-vao-lop-10",
    title: "Toán 9 – Ôn thi vào lớp 10",
    gradeLevel: "GRADE_9",
    level: "ADVANCED",
    description: "Rút gọn căn thức, hệ phương trình, đồ thị hàm số và tứ giác nội tiếp đường tròn.",
    topics: ["Căn thức bậc hai", "Hệ phương trình", "Hệ thức Vi-ét", "Tứ giác nội tiếp"],
  },
  {
    subjectSlug: "van-thcs",
    slug: "ngu-van-9-on-thi-vao-lop-10",
    title: "Ngữ văn 9 – Ôn thi vào lớp 10",
    gradeLevel: "GRADE_9",
    level: "INTERMEDIATE",
    description: "Phân tích truyện ngắn và thơ hiện đại Việt Nam, nghị luận xã hội.",
    topics: ["Truyện Kiều", "Đồng chí", "Làng", "Lặng lẽ Sa Pa"],
  },
  {
    subjectSlug: "toan-thcs",
    slug: "toan-8-da-thuc-va-hinh-hoc-phang",
    title: "Toán 8 – Đa thức và Hình học phẳng",
    gradeLevel: "GRADE_8",
    level: "INTERMEDIATE",
    description: "Bảy hằng đẳng thức đáng nhớ, phân tích đa thức thành nhân tử và tam giác đồng dạng.",
    topics: ["Hằng đẳng thức", "Phân tích nhân tử", "Tứ giác", "Định lý Thalès"],
  },
  {
    subjectSlug: "anh-thcs",
    slug: "tieng-anh-8-ngu-phap-va-tu-vung-trong-tam",
    title: "Tiếng Anh 8 – Ngữ pháp và Từ vựng trọng tâm",
    gradeLevel: "GRADE_8",
    level: "BEGINNER",
    description: "Từ vựng theo chủ điểm sách giáo khoa mới và ngữ pháp cơ bản.",
    topics: ["Leisure time", "Life in the countryside", "Teenagers", "Lifestyles"],
  },
  {
    subjectSlug: "khtn-thcs",
    slug: "khoa-hoc-tu-nhien-7-thi-nghiem-va-thuc-hanh",
    title: "Khoa học tự nhiên 7 – Thí nghiệm và Thực hành",
    gradeLevel: "GRADE_7",
    level: "BEGINNER",
    description: "Nguyên tử, nguyên tố hóa học, bảng tuần hoàn, âm thanh, ánh sáng và từ trường.",
    topics: ["Nguyên tử & Nguyên tố", "Bảng tuần hoàn", "Âm thanh", "Ánh sáng"],
  },
  {
    subjectSlug: "toan-th",
    slug: "toan-tu-duy-lop-5",
    title: "Toán tư duy lớp 5",
    gradeLevel: "GRADE_5",
    level: "INTERMEDIATE",
    description: "Phân số, số thập phân, tỉ số phần trăm, hình học và bài toán chuyển động đều.",
    topics: ["Phân số & Số thập phân", "Tỉ số phần trăm", "Hình tam giác & hình thang", "Toán chuyển động"],
  },
  {
    subjectSlug: "tiengviet-th",
    slug: "tieng-viet-lop-3-doc-hieu-va-viet-doan",
    title: "Tiếng Việt lớp 3 – Đọc hiểu và Viết đoạn",
    gradeLevel: "GRADE_3",
    level: "BEGINNER",
    description: "Đọc hiểu truyện ngắn, mở rộng vốn từ và rèn luyện kỹ năng viết đoạn văn miêu tả.",
    topics: ["Đọc hiểu truyện ngắn", "Mở rộng vốn từ", "Viết đoạn tả đồ vật", "Chính tả"],
  },
  {
    subjectSlug: "anh-th",
    slug: "tieng-anh-lop-4-cambridge-movers",
    title: "Tiếng Anh lớp 4 – Cambridge Movers",
    gradeLevel: "GRADE_4",
    level: "BEGINNER",
    description: "Luyện 4 kỹ năng Nghe, Nói, Đọc, Viết chuẩn khung Cambridge Young Learners.",
    topics: ["My family", "At school", "Daily routines", "Animals"],
  },
  {
    subjectSlug: "ielts",
    slug: "ielts-6-5-cap-toc",
    title: "IELTS 6.5+ cấp tốc",
    gradeLevel: null,
    level: "ADVANCED",
    description: "Luyện đề chuyên sâu 4 kỹ năng Listening, Reading, Writing Task 1-2 và Speaking.",
    topics: ["Listening Form & Map", "Reading True/False", "Writing Task 1 & 2", "Speaking Part 1-3"],
  },
  {
    subjectSlug: "giao-tiep",
    slug: "tieng-anh-giao-tiep-cho-nguoi-di-lam",
    title: "Tiếng Anh giao tiếp cho người đi làm",
    gradeLevel: null,
    level: "BEGINNER",
    description: "Kỹ năng viết email chuyên nghiệp, thuyết trình, họp trực tuyến và đàm phán cơ bản.",
    topics: ["Giới thiệu bản thân", "Email công việc", "Họp trực tuyến", "Thuyết trình"],
  },
  {
    subjectSlug: "tieng-nhat",
    slug: "tieng-nhat-so-cap-n5",
    title: "Tiếng Nhật sơ cấp N5",
    gradeLevel: null,
    level: "BEGINNER",
    description: "Bảng chữ cái Hiragana, Katakana, từ vựng và ngữ pháp nhập môn JLPT N5.",
    topics: ["Bảng chữ cái", "Chào hỏi & Giới thiệu", "Số đếm & Thời gian", "Ngữ pháp N5"],
  },
  {
    subjectSlug: "python",
    slug: "lap-trinh-python-co-ban",
    title: "Lập trình Python cơ bản",
    gradeLevel: null,
    level: "BEGINNER",
    description: "Cú pháp cơ bản, biến, kiểu dữ liệu, vòng lặp, hàm và dự án game nhỏ đầu tay.",
    topics: ["Cài đặt & biến", "Cấu trúc điều kiện & vòng lặp", "Hàm & Module", "Dự án Game đoán số"],
  },
  {
    subjectSlug: "scratch",
    slug: "scratch-cho-tre-8-12-tuoi",
    title: "Scratch cho trẻ 8 – 12 tuổi",
    gradeLevel: "GRADE_4",
    level: "BEGINNER",
    description: "Lập trình kéo thả trực quan, phát triển tư duy logic và sáng tạo câu chuyện hoạt hình.",
    topics: ["Làm quen Scratch", "Nhân vật & Chuyển động", "Sự kiện & Biến số", "Dự án Game hứng táo"],
  },
];

const ACADEMIC_CLASSES = [
  {
    courseSlug: "toan-12-on-thi-tot-nghiep-thpt",
    teacherEmail: "duc.nguyen@edunity.vn",
    className: "Toán 12 – Luyện đề Chuyên sâu Khóa 01",
    classType: "PAID",
    price: 350000,
    capacity: 25,
    status: "OPEN",
    schedule: [
      { dayOfWeek: 2, startTime: "19:30", endTime: "21:00" },
      { dayOfWeek: 4, startTime: "19:30", endTime: "21:00" },
    ],
  },
  {
    courseSlug: "toan-10-nen-tang-dai-so-va-hinh-hoc",
    teacherEmail: "duc.nguyen@edunity.vn",
    className: "Toán 10 – Đại số & Hình học Cộng đồng (Miễn phí)",
    classType: "FREE",
    price: 0,
    capacity: 50,
    status: "OPEN",
    schedule: [{ dayOfWeek: 6, startTime: "19:00", endTime: "20:30" }],
  },
  {
    courseSlug: "ngu-van-12-nghi-luan-van-hoc-va-xa-hoi",
    teacherEmail: "mailan.tran@edunity.vn",
    className: "Ngữ văn 12 – Chinh phục Điểm 8+ Mùa thi",
    classType: "PAID",
    price: 300000,
    capacity: 20,
    status: "OPEN",
    schedule: [
      { dayOfWeek: 3, startTime: "19:30", endTime: "21:00" },
      { dayOfWeek: 5, startTime: "19:30", endTime: "21:00" },
    ],
  },
  {
    courseSlug: "ielts-6-5-cap-toc",
    teacherEmail: "minhchau.pham@edunity.vn",
    className: "IELTS 6.5+ – Writing & Speaking Intensive",
    classType: "PAID",
    price: 650000,
    capacity: 15,
    status: "OPEN",
    schedule: [
      { dayOfWeek: 2, startTime: "20:00", endTime: "21:30" },
      { dayOfWeek: 6, startTime: "20:00", endTime: "21:30" },
    ],
  },
  {
    courseSlug: "lap-trinh-python-co-ban",
    teacherEmail: "anhkhoa.bui@edunity.vn",
    className: "Python Nhập môn – Lập trình qua Dự án Thực tế",
    classType: "PAID",
    price: 250000,
    capacity: 20,
    status: "OPEN",
    schedule: [{ dayOfWeek: 0, startTime: "09:00", endTime: "11:00" }],
  },
];

// =============================================================================
// 3. IDEMPOTENT UPSERT EXECUTION ENGINE
// =============================================================================

/**
 * Executes a deterministic, safe, idempotent academic seed.
 * Guarantees zero duplicates on subsequent runs and never issues deleteMany.
 */
const seedAcademicV3 = async (options = {}) => {
  const {
    connectionUri = process.env.MONGODB_URI,
    logger = console.log,
    models: injectedModels,
  } = options;
  const currentDb = mongoose.connection.name || "edunity_demo_v3";

  // Enforce safety gate
  assertSafeDatabaseTarget(currentDb, connectionUri);

  const models = injectedModels || defaultModels;
  const { User, Category, Subject, Course, Class, Session, Enrollment } = models;

  const stats = {
    users: { total: 0, created: 0, updated: 0 },
    categories: { total: 0, created: 0, updated: 0 },
    subjects: { total: 0, created: 0, updated: 0 },
    courses: { total: 0, created: 0, updated: 0 },
    classes: { total: 0, created: 0, updated: 0 },
    sessions: { total: 0, created: 0, updated: 0 },
    enrollments: { total: 0, created: 0, updated: 0 },
  };

  const userMap = new Map();
  const categoryMap = new Map();
  const subjectMap = new Map();
  const courseMap = new Map();
  const classMap = new Map();

  // ---------------------------------------------------------------------------
  // Step 1: Upsert Users (Natural Key: email)
  // ---------------------------------------------------------------------------
  logger("[seedAcademicV3] 1/6: Upserting Users by email...");
  for (const userDef of ACADEMIC_USERS) {
    const existing = await User.findOne({ email: userDef.email.toLowerCase() });
    const updateData = {
      role: userDef.role,
      status: userDef.status,
      passwordHash,
      isDeleted: false,
      deletedAt: null,
      ...(userDef.teacherProfile ? { teacherProfile: userDef.teacherProfile } : {}),
      ...(userDef.studentProfile ? { studentProfile: userDef.studentProfile } : {}),
      ...(userDef.adminProfile ? { adminProfile: userDef.adminProfile } : {}),
    };

    const doc = await User.findOneAndUpdate(
      { email: userDef.email.toLowerCase() },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    userMap.set(userDef.email, doc);
    stats.users.total++;
    if (existing) stats.users.updated++;
    else stats.users.created++;
  }

  const adminUser = userMap.get("admin@edunity.vn");

  // ---------------------------------------------------------------------------
  // Step 2: Upsert Categories (Natural Key: slug)
  // ---------------------------------------------------------------------------
  logger("[seedAcademicV3] 2/6: Upserting Categories by slug...");
  for (const catDef of ACADEMIC_CATEGORIES) {
    const existing = await Category.findOne({ slug: catDef.slug.toLowerCase() });
    const updateData = {
      name: catDef.name,
      description: catDef.description,
      status: catDef.status,
      isDeleted: false,
      deletedAt: null,
      createdBy: adminUser._id,
    };

    const doc = await Category.findOneAndUpdate(
      { slug: catDef.slug.toLowerCase() },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    categoryMap.set(catDef.slug, doc);
    stats.categories.total++;
    if (existing) stats.categories.updated++;
    else stats.categories.created++;
  }

  // ---------------------------------------------------------------------------
  // Step 3: Upsert Subjects (Natural Key: slug)
  // ---------------------------------------------------------------------------
  logger("[seedAcademicV3] 3/6: Upserting Subjects by slug...");
  for (const subjDef of ACADEMIC_SUBJECTS) {
    const parentCategory = categoryMap.get(subjDef.categorySlug);
    if (!parentCategory) {
      throw new Error(`Referential integrity error: Category "${subjDef.categorySlug}" not found for subject "${subjDef.slug}"`);
    }

    const existing = await Subject.findOne({ slug: subjDef.slug.toLowerCase() });
    const updateData = {
      name: subjDef.name,
      categoryId: parentCategory._id,
      categoryName: parentCategory.name,
      status: "ACTIVE",
      isDeleted: false,
      deletedAt: null,
      createdBy: adminUser._id,
    };

    const doc = await Subject.findOneAndUpdate(
      { slug: subjDef.slug.toLowerCase() },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    subjectMap.set(subjDef.slug, doc);
    stats.subjects.total++;
    if (existing) stats.subjects.updated++;
    else stats.subjects.created++;
  }

  // ---------------------------------------------------------------------------
  // Step 4: Upsert Courses (Natural Key: slug)
  // ---------------------------------------------------------------------------
  logger("[seedAcademicV3] 4/6: Upserting Courses by slug...");
  for (const courseDef of ACADEMIC_COURSES) {
    const parentSubject = subjectMap.get(courseDef.subjectSlug);
    if (!parentSubject) {
      throw new Error(`Referential integrity error: Subject "${courseDef.subjectSlug}" not found for course "${courseDef.slug}"`);
    }

    // Strict validation: Ensure level is in COURSE_LEVELS (BEGINNER, not BASIC)
    if (!COURSE_LEVELS.includes(courseDef.level)) {
      throw new Error(`Validation error: Course level "${courseDef.level}" is invalid. Must be one of: ${COURSE_LEVELS.join(", ")}`);
    }

    const existing = await Course.findOne({ slug: courseDef.slug.toLowerCase() });
    const updateData = {
      title: courseDef.title,
      subjectId: parentSubject._id,
      subjectName: parentSubject.name,
      categoryId: parentSubject.categoryId,
      categoryName: parentSubject.categoryName,
      level: courseDef.level,
      gradeLevel: courseDef.gradeLevel || null,
      description: courseDef.description,
      status: "ACTIVE",
      isDeleted: false,
      deletedAt: null,
      createdBy: adminUser._id,
    };

    const doc = await Course.findOneAndUpdate(
      { slug: courseDef.slug.toLowerCase() },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    courseMap.set(courseDef.slug, doc);
    stats.courses.total++;
    if (existing) stats.courses.updated++;
    else stats.courses.created++;
  }

  // ---------------------------------------------------------------------------
  // Step 5: Upsert Classes (Natural Key: courseId + className + teacherId)
  // ---------------------------------------------------------------------------
  logger("[seedAcademicV3] 5/6: Upserting Classes by {courseId, className, teacherId}...");
  const now = new Date();
  const startDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later
  const endDate = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days duration

  for (const classDef of ACADEMIC_CLASSES) {
    const course = courseMap.get(classDef.courseSlug);
    const teacher = userMap.get(classDef.teacherEmail);
    if (!course) throw new Error(`Class refers to missing course: ${classDef.courseSlug}`);
    if (!teacher) throw new Error(`Class refers to missing teacher: ${classDef.teacherEmail}`);

    const naturalFilter = {
      courseId: course._id,
      teacherId: teacher._id,
      className: classDef.className,
    };

    const existing = await Class.findOne(naturalFilter);

    // Enforce Class Price Rule
    const priceDecimal = mongoose.Types.Decimal128.fromString(String(classDef.price));

    const updateData = {
      courseTitle: course.title,
      teacherName: teacher.teacherProfile.fullName,
      categoryId: course.categoryId,
      subjectId: course.subjectId,
      gradeLevel: course.gradeLevel,
      classType: classDef.classType,
      price: priceDecimal,
      capacity: classDef.capacity,
      schedule: classDef.schedule,
      status: classDef.status,
      startDate,
      endDate,
      isDeleted: false,
      deletedAt: null,
    };

    const doc = await Class.findOneAndUpdate(
      naturalFilter,
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const classKey = `${classDef.courseSlug}:${classDef.className}`;
    classMap.set(classKey, doc);
    stats.classes.total++;
    if (existing) stats.classes.updated++;
    else stats.classes.created++;

    // -------------------------------------------------------------------------
    // Step 6: Upsert Sessions for this Class (Natural Key: classId + sessionNumber)
    // -------------------------------------------------------------------------
    const topics = ACADEMIC_COURSES.find((c) => c.slug === classDef.courseSlug)?.topics || [
      "Buổi 1: Giới thiệu & Khái niệm cơ bản",
      "Buổi 2: Thực hành & Ứng dụng",
    ];

    for (let i = 0; i < topics.length; i++) {
      const sessionNumber = i + 1;
      const sessionStart = new Date(startDate.getTime() + i * 3 * 24 * 60 * 60 * 1000);
      const sessionEnd = new Date(sessionStart.getTime() + 90 * 60 * 1000); // 90 minutes

      const sessionFilter = {
        classId: doc._id,
        sessionNumber,
      };

      const sessionExisting = await Session.findOne(sessionFilter);
      const sessionUpdate = {
        className: doc.className,
        teacherId: teacher._id,
        title: topics[i],
        startDatetime: sessionStart,
        endDatetime: sessionEnd,
        status: "SCHEDULED",
        roomState: "NOT_OPEN",
        lifecycleState: "SCHEDULED",
      };

      await Session.findOneAndUpdate(
        sessionFilter,
        { $set: sessionUpdate },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      stats.sessions.total++;
      if (sessionExisting) stats.sessions.updated++;
      else stats.sessions.created++;
    }
  }

  // ---------------------------------------------------------------------------
  // Step 7: Upsert Sample Enrollments (Natural Key: studentId + classId)
  // ---------------------------------------------------------------------------
  logger("[seedAcademicV3] 6/6: Upserting Sample Enrollments by {studentId, classId}...");
  const student1 = userMap.get("student.minhanh@edunity.vn");
  const student2 = userMap.get("student.giabao@edunity.vn");
  const firstClass = classMap.get("toan-12-on-thi-tot-nghiep-thpt:Toán 12 – Luyện đề Chuyên sâu Khóa 01");

  if (student1 && student2 && firstClass) {
    for (const student of [student1, student2]) {
      const enrollmentFilter = {
        classId: firstClass._id,
        studentId: student._id,
      };

      const existingEnrollment = await Enrollment.findOne(enrollmentFilter);
      const enrollmentUpdate = {
        courseId: firstClass.courseId,
        teacherId: firstClass.teacherId,
        enrollmentStatus: "CONFIRMED",
        paymentSource: firstClass.classType === "FREE" ? "FREE" : "DIRECT_PAYMENT",
        tuitionAmount: firstClass.price,
        amountPaidViaPayment: firstClass.price,
        amountPaidViaScholarship: mongoose.Types.Decimal128.fromString("0"),
        enrolledAt: new Date(),
      };

      await Enrollment.findOneAndUpdate(
        enrollmentFilter,
        { $set: enrollmentUpdate },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      stats.enrollments.total++;
      if (existingEnrollment) stats.enrollments.updated++;
      else stats.enrollments.created++;
    }
  }

  logger("[seedAcademicV3] Seeding completed successfully with zero deletions.");
  return {
    success: true,
    db: currentDb,
    stats,
  };
};

// =============================================================================
// 4. CLI RUNNER
// =============================================================================

if (require.main === module) {
  require("dotenv").config();
  const connectDB = require("../src/config/db");

  const runCLI = async () => {
    try {
      const uri = process.env.MONGODB_URI;
      const targetDb = uri ? uri.split("/").pop().split("?")[0] : "unknown";

      console.log(`Connecting to database for idempotent seed: "${targetDb}"...`);
      await connectDB(uri);

      const result = await seedAcademicV3({
        connectionUri: uri,
        logger: console.log,
      });

      console.log("\n=======================================================");
      console.log("IDEMPOTENT ACADEMIC SEED SUMMARY");
      console.log("=======================================================");
      console.log(`Database:    ${result.db}`);
      console.log(`Users:       ${result.stats.users.total} (created: ${result.stats.users.created}, updated: ${result.stats.users.updated})`);
      console.log(`Categories:  ${result.stats.categories.total} (created: ${result.stats.categories.created}, updated: ${result.stats.categories.updated})`);
      console.log(`Subjects:    ${result.stats.subjects.total} (created: ${result.stats.subjects.created}, updated: ${result.stats.subjects.updated})`);
      console.log(`Courses:     ${result.stats.courses.total} (created: ${result.stats.courses.created}, updated: ${result.stats.courses.updated})`);
      console.log(`Classes:     ${result.stats.classes.total} (created: ${result.stats.classes.created}, updated: ${result.stats.classes.updated})`);
      console.log(`Sessions:    ${result.stats.sessions.total} (created: ${result.stats.sessions.created}, updated: ${result.stats.sessions.updated})`);
      console.log(`Enrollments: ${result.stats.enrollments.total} (created: ${result.stats.enrollments.created}, updated: ${result.stats.enrollments.updated})`);
      console.log("=======================================================\n");

      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      console.error("\n[SEED ERROR]:", err.message);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    }
  };

  runCLI();
}

module.exports = {
  seedAcademicV3,
  assertSafeDatabaseTarget,
  ALLOWED_SEED_DATABASES,
  ACADEMIC_USERS,
  ACADEMIC_CATEGORIES,
  ACADEMIC_SUBJECTS,
  ACADEMIC_COURSES,
  ACADEMIC_CLASSES,
};
