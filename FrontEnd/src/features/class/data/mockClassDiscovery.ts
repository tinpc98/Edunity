import type {
  BackendGradeLevel,
  ClassDiscoveryItem,
  ClassEntity,
  TimeOfDay,
} from "../types/classDiscovery";

export const GRADE_LEVEL_LABELS: Record<BackendGradeLevel, string> = {
  PRE_PRIMARY: "Tiền tiểu học",
  GRADE_1: "Lớp 1",
  GRADE_2: "Lớp 2",
  GRADE_3: "Lớp 3",
  GRADE_4: "Lớp 4",
  GRADE_5: "Lớp 5",
  GRADE_6: "Lớp 6",
  GRADE_7: "Lớp 7",
  GRADE_8: "Lớp 8",
  GRADE_9: "Lớp 9",
  GRADE_10: "Lớp 10",
  GRADE_11: "Lớp 11",
  GRADE_12: "Lớp 12",
  UNIVERSITY: "Đại học",
  COLLEGE: "Cao đẳng",
};

export const COMMON_DISCOVERY_GRADES: BackendGradeLevel[] = [
  "GRADE_6",
  "GRADE_7",
  "GRADE_8",
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
  "GRADE_12",
];

export interface MockSubject {
  id: string;
  name: string;
  slug: string;
}

export const MOCK_SUBJECTS: MockSubject[] = [
  { id: "SUB_MATH", name: "Toán học", slug: "toan-hoc" },
  { id: "SUB_PHYSICS", name: "Vật lý", slug: "vat-ly" },
  { id: "SUB_CHEMISTRY", name: "Hóa học", slug: "hoa-hoc" },
  { id: "SUB_BIOLOGY", name: "Sinh học", slug: "sinh-hoc" },
  { id: "SUB_LITERATURE", name: "Ngữ văn", slug: "ngu-van" },
  { id: "SUB_ENGLISH", name: "Tiếng Anh", slug: "tieng-anh" },
  { id: "SUB_INFORMATICS", name: "Tin học", slug: "tin-hoc" },
  { id: "SUB_HISTORY_GEO", name: "Lịch sử & Địa lí", slug: "lich-su-dia-li" },
];

export interface MockTeacher {
  id: string;
  name: string;
  avatar: string;
  title: string;
}

export const MOCK_TEACHERS: MockTeacher[] = [
  {
    id: "TEA_001",
    name: "ThS. Nguyễn Văn Đức",
    title: "15 năm kinh nghiệm Chuyên Sư Phạm",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "TEA_002",
    name: "Cô Mai Lan",
    title: "Tổ trưởng Chuyên KHTN",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "TEA_003",
    name: "Thầy Hoàng Nam",
    title: "Giáo viên Giỏi Cấp Quốc Gia",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "TEA_004",
    name: "Cô Jessica Trần",
    title: "8.5 IELTS • Thạc sĩ TESOL Sydney",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "TEA_005",
    name: "Thầy Đặng Tuấn",
    title: "Chuyên Gia Luyện Thi Hóa 9+",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "TEA_006",
    name: "Thầy Paul & Cô Trang",
    title: "Chuyên gia Luyện Đề Tuyển Sinh",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "TEA_007",
    name: "Mr. David Miller",
    title: "Native Speaker • TESOL Certified",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "TEA_008",
    name: "Thầy Hoàng Long",
    title: "Tech Lead • Kỹ Sư Phần Mềm",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&q=80",
  },
];

export interface MockCourse {
  id: string;
  title: string;
  subjectId: string;
  gradeLevel: BackendGradeLevel;
}

export const MOCK_COURSES: MockCourse[] = [
  {
    id: "CRS_TOAN_12",
    title: "Toán 12 – Ôn thi THPT Quốc Gia & Vận Dụng Nâng Cao",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_12",
  },
  {
    id: "CRS_TOAN_11",
    title: "Toán 11 – Hình học không gian & Lượng giác",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_11",
  },
  {
    id: "CRS_TOAN_10",
    title: "Toán 10 – Nền tảng tư duy đại số & hình học mới",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_10",
  },
  {
    id: "CRS_TOAN_9",
    title: "Toán 9 – Luyện thi tuyển sinh vào 10 chuyên & công lập",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_9",
  },
  {
    id: "CRS_TOAN_8",
    title: "Toán 8 – Đại số thực chiến & Bất đẳng thức",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_8",
  },
  {
    id: "CRS_TOAN_7",
    title: "Toán 7 – Hình học trực quan & Số học nâng cao",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_7",
  },
  {
    id: "CRS_TOAN_6",
    title: "Toán 6 – Chuẩn chương trình mới Cánh diều & KNTT",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_6",
  },
  {
    id: "CRS_LY_11",
    title: "Vật lý 11 – Cơ học & Nhiệt học ứng dụng thực tế",
    subjectId: "SUB_PHYSICS",
    gradeLevel: "GRADE_11",
  },
  {
    id: "CRS_LY_12",
    title: "Vật lý 12 Live – Chinh phục 9+ Kỳ thi ĐGNL & THPT",
    subjectId: "SUB_PHYSICS",
    gradeLevel: "GRADE_12",
  },
  {
    id: "CRS_HOA_11",
    title: "Hóa học 11 – Chuyên đề Hóa hữu cơ ứng dụng",
    subjectId: "SUB_CHEMISTRY",
    gradeLevel: "GRADE_11",
  },
  {
    id: "CRS_HOA_12",
    title: "Hóa học 12 – Ôn luyện toàn diện lý thuyết & bài tập",
    subjectId: "SUB_CHEMISTRY",
    gradeLevel: "GRADE_12",
  },
  {
    id: "CRS_VAN_11",
    title: "Ngữ văn 11 – Đọc hiểu & Viết nghị luận điểm cao",
    subjectId: "SUB_LITERATURE",
    gradeLevel: "GRADE_11",
  },
  {
    id: "CRS_VAN_9",
    title: "Ngữ văn 9 – Tổng ôn tác phẩm trọng tâm vào 10",
    subjectId: "SUB_LITERATURE",
    gradeLevel: "GRADE_9",
  },
  {
    id: "CRS_ANH_10",
    title: "Tiếng Anh 10 – Global Success & IELTS Foundation",
    subjectId: "SUB_ENGLISH",
    gradeLevel: "GRADE_10",
  },
  {
    id: "CRS_ANH_SPEAKING",
    title: "English Speaking Club – Phản xạ cùng giáo viên bản ngữ",
    subjectId: "SUB_ENGLISH",
    gradeLevel: "GRADE_11",
  },
  {
    id: "CRS_TIN_REACT",
    title: "Lập trình ReactJS & Tư duy số cho học sinh",
    subjectId: "SUB_INFORMATICS",
    gradeLevel: "GRADE_10",
  },
];

/**
 * Raw Mock Class Entities strictly conforming to BackEnd/src/models/Class.js
 */
export const RAW_MOCK_CLASSES: ClassEntity[] = [
  {
    _id: "CLS_001",
    courseId: "CRS_TOAN_12",
    courseTitle: "Toán 12 – Ôn thi THPT Quốc Gia & Vận Dụng Nâng Cao",
    teacherId: "TEA_001",
    teacherName: "ThS. Nguyễn Văn Đức",
    categoryId: "CAT_THPT",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_12",
    className: "Toán 12 Live – Chinh Phục 9+ THPT QG & HSA",
    coverImage: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1680000,
    capacity: 20,
    enrolledCount: 18,
    enrollmentStart: "2026-08-01",
    enrollmentEnd: "2026-10-15",
    startDate: "2026-10-05",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 2, startTime: "19:30", endTime: "21:00" }, // Tue
      { dayOfWeek: 5, startTime: "19:30", endTime: "21:00" }, // Fri
    ],
    ratingAverage: 4.95,
    ratingCount: 124,
  },
  {
    _id: "CLS_002",
    courseId: "CRS_TOAN_10",
    courseTitle: "Toán 10 – Nền tảng tư duy đại số & hình học mới",
    teacherId: "TEA_002",
    teacherName: "Cô Mai Lan",
    categoryId: "CAT_THPT",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_10",
    className: "Toán 10 – Nền tảng tư duy đại số & hình học mới",
    coverImage: "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1250000,
    capacity: 15,
    enrolledCount: 11,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-20",
    startDate: "2026-10-08",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 1, startTime: "19:30", endTime: "21:00" }, // Mon
      { dayOfWeek: 4, startTime: "19:30", endTime: "21:00" }, // Thu
    ],
    ratingAverage: 4.9,
    ratingCount: 88,
  },
  {
    _id: "CLS_003",
    courseId: "CRS_VAN_11",
    courseTitle: "Ngữ văn 11 – Đọc hiểu & Viết nghị luận điểm cao",
    teacherId: "TEA_003",
    teacherName: "Thầy Hoàng Nam",
    categoryId: "CAT_THPT",
    subjectId: "SUB_LITERATURE",
    gradeLevel: "GRADE_11",
    className: "Ngữ văn 11 – Đọc hiểu & Viết nghị luận chuyên sâu",
    coverImage: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 980000,
    capacity: 15,
    enrolledCount: 9,
    enrollmentStart: "2026-08-10",
    enrollmentEnd: "2026-10-18",
    startDate: "2026-10-12",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 2, startTime: "20:00", endTime: "21:30" }, // Tue
      { dayOfWeek: 5, startTime: "20:00", endTime: "21:30" }, // Fri
    ],
    ratingAverage: 4.92,
    ratingCount: 65,
  },
  {
    _id: "CLS_004",
    courseId: "CRS_ANH_10",
    courseTitle: "Tiếng Anh 10 – Global Success & IELTS Foundation",
    teacherId: "TEA_004",
    teacherName: "Cô Jessica Trần",
    categoryId: "CAT_THPT",
    subjectId: "SUB_ENGLISH",
    gradeLevel: "GRADE_10",
    className: "Tiếng Anh 10 – Bứt phá ngữ pháp & IELTS Foundation",
    coverImage: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1450000,
    capacity: 12,
    enrolledCount: 9,
    enrollmentStart: "2026-08-10",
    enrollmentEnd: "2026-10-22",
    startDate: "2026-10-14",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 3, startTime: "19:30", endTime: "21:00" }, // Wed
      { dayOfWeek: 0, startTime: "19:30", endTime: "21:00" }, // Sun
    ],
    ratingAverage: 4.9,
    ratingCount: 94,
  },
  {
    _id: "CLS_005",
    courseId: "CRS_HOA_11",
    courseTitle: "Hóa học 11 – Chuyên đề Hóa hữu cơ ứng dụng",
    teacherId: "TEA_005",
    teacherName: "Thầy Đặng Tuấn",
    categoryId: "CAT_THPT",
    subjectId: "SUB_CHEMISTRY",
    gradeLevel: "GRADE_11",
    className: "Hóa học 11 – Chuyên đề Hóa hữu cơ thực chiến",
    coverImage: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1100000,
    capacity: 15,
    enrolledCount: 15, // FULL
    enrollmentStart: "2026-08-01",
    enrollmentEnd: "2026-09-30",
    startDate: "2026-10-02",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 2, startTime: "19:30", endTime: "21:00" },
      { dayOfWeek: 5, startTime: "19:30", endTime: "21:00" },
    ],
    ratingAverage: 4.88,
    ratingCount: 52,
  },
  {
    _id: "CLS_006",
    courseId: "CRS_LY_11",
    courseTitle: "Vật lý 11 – Cơ học & Nhiệt học ứng dụng thực tế",
    teacherId: "TEA_001",
    teacherName: "ThS. Nguyễn Văn Đức",
    categoryId: "CAT_THPT",
    subjectId: "SUB_PHYSICS",
    gradeLevel: "GRADE_11",
    className: "Vật lý 11 – Cơ học & Nhiệt học ứng dụng thực tế",
    coverImage: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1500000,
    capacity: 18,
    enrolledCount: 12,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-25",
    startDate: "2026-10-15",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 1, startTime: "18:00", endTime: "19:30" }, // Mon
      { dayOfWeek: 4, startTime: "18:00", endTime: "19:30" }, // Thu
    ],
    ratingAverage: 4.85,
    ratingCount: 43,
  },
  {
    _id: "CLS_007",
    courseId: "CRS_ANH_SPEAKING",
    courseTitle: "English Speaking Club – Phản xạ cùng giáo viên bản ngữ",
    teacherId: "TEA_007",
    teacherName: "Mr. David Miller",
    categoryId: "CAT_SKILLS",
    subjectId: "SUB_ENGLISH",
    gradeLevel: "GRADE_11",
    className: "English Speaking Club Live – Giao tiếp tự tin chuẩn IPA",
    coverImage: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=600&q=80",
    classType: "FREE",
    price: 0,
    capacity: 20,
    enrolledCount: 14,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-30",
    startDate: "2026-10-10",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 6, startTime: "19:30", endTime: "21:00" }, // Sat evening
    ],
    ratingAverage: 4.95,
    ratingCount: 110,
  },
  {
    _id: "CLS_008",
    courseId: "CRS_TIN_REACT",
    courseTitle: "Lập trình ReactJS & Tư duy số cho học sinh",
    teacherId: "TEA_008",
    teacherName: "Thầy Hoàng Long",
    categoryId: "CAT_SKILLS",
    subjectId: "SUB_INFORMATICS",
    gradeLevel: "GRADE_10",
    className: "Workshop Live: ReactJS & Tư Duy Số Ứng Dụng",
    coverImage: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80",
    classType: "FREE",
    price: 0,
    capacity: 25,
    enrolledCount: 20,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-25",
    startDate: "2026-10-12",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 0, startTime: "09:00", endTime: "11:00" }, // Sun morning
    ],
    ratingAverage: 4.9,
    ratingCount: 78,
  },
  {
    _id: "CLS_009",
    courseId: "CRS_TOAN_6",
    courseTitle: "Toán 6 – Chuẩn chương trình mới Cánh diều & KNTT",
    teacherId: "TEA_002",
    teacherName: "Cô Mai Lan",
    categoryId: "CAT_THCS",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_6",
    className: "Toán 6 – Chân trời sáng tạo & Cánh diều (Chuẩn mới)",
    coverImage: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 850000,
    capacity: 14,
    enrolledCount: 9,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-20",
    startDate: "2026-10-11",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 1, startTime: "18:00", endTime: "19:30" },
      { dayOfWeek: 5, startTime: "18:00", endTime: "19:30" },
    ],
    ratingAverage: 4.88,
    ratingCount: 39,
  },
  {
    _id: "CLS_010",
    courseId: "CRS_TOAN_7",
    courseTitle: "Toán 7 – Hình học trực quan & Số học nâng cao",
    teacherId: "TEA_003",
    teacherName: "Thầy Hoàng Nam",
    categoryId: "CAT_THCS",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_7",
    className: "Toán 7 – Hình học trực quan & Số học nâng cao",
    coverImage: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 890000,
    capacity: 15,
    enrolledCount: 11,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-22",
    startDate: "2026-10-16",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 2, startTime: "19:30", endTime: "21:00" },
      { dayOfWeek: 6, startTime: "19:30", endTime: "21:00" },
    ],
    ratingAverage: 4.89,
    ratingCount: 47,
  },
  {
    _id: "CLS_011",
    courseId: "CRS_TOAN_8",
    courseTitle: "Toán 8 – Đại số thực chiến & Bất đẳng thức",
    teacherId: "TEA_005",
    teacherName: "Thầy Đặng Tuấn",
    categoryId: "CAT_THCS",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_8",
    className: "Toán 8 – Đại số & Bất đẳng thức thực chiến thi HSG",
    coverImage: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 950000,
    capacity: 16,
    enrolledCount: 10,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-25",
    startDate: "2026-10-18",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 3, startTime: "19:00", endTime: "20:30" },
      { dayOfWeek: 0, startTime: "19:00", endTime: "20:30" },
    ],
    ratingAverage: 4.93,
    ratingCount: 58,
  },
  {
    _id: "CLS_012",
    courseId: "CRS_VAN_9",
    courseTitle: "Ngữ văn 9 – Tổng ôn tác phẩm trọng tâm vào 10",
    teacherId: "TEA_003",
    teacherName: "Thầy Hoàng Nam",
    categoryId: "CAT_THCS",
    subjectId: "SUB_LITERATURE",
    gradeLevel: "GRADE_9",
    className: "Ngữ văn 9 – Tổng ôn 12 tác phẩm trọng tâm thi vào 10",
    coverImage: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 920000,
    capacity: 14,
    enrolledCount: 11,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-20",
    startDate: "2026-10-13",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 1, startTime: "20:00", endTime: "21:30" },
      { dayOfWeek: 4, startTime: "20:00", endTime: "21:30" },
    ],
    ratingAverage: 4.96,
    ratingCount: 72,
  },
  {
    _id: "CLS_013",
    courseId: "CRS_TOAN_9",
    courseTitle: "Toán 9 – Luyện thi tuyển sinh vào 10 chuyên & công lập",
    teacherId: "TEA_006",
    teacherName: "Thầy Paul & Cô Trang",
    categoryId: "CAT_THCS",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_9",
    className: "Toán 9 – Đột phá 9+ Thi vào lớp 10 Chuyên Hà Nội",
    coverImage: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1150000,
    capacity: 15,
    enrolledCount: 12,
    enrollmentStart: "2026-08-20",
    enrollmentEnd: "2026-10-28",
    startDate: "2026-10-17",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 3, startTime: "20:00", endTime: "21:30" },
      { dayOfWeek: 0, startTime: "20:00", endTime: "21:30" },
    ],
    ratingAverage: 4.94,
    ratingCount: 66,
  },
  {
    _id: "CLS_014",
    courseId: "CRS_LY_12",
    courseTitle: "Vật lý 12 Live – Chinh phục 9+ Kỳ thi ĐGNL & THPT",
    teacherId: "TEA_001",
    teacherName: "ThS. Nguyễn Văn Đức",
    categoryId: "CAT_THPT",
    subjectId: "SUB_PHYSICS",
    gradeLevel: "GRADE_12",
    className: "Vật lý 12 Live – Ôn thi ĐGNL HSA & Bách Khoa 2026",
    coverImage: "https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1400000,
    capacity: 20,
    enrolledCount: 13,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-25",
    startDate: "2026-10-19",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 2, startTime: "18:00", endTime: "19:30" },
      { dayOfWeek: 5, startTime: "18:00", endTime: "19:30" },
    ],
    ratingAverage: 4.9,
    ratingCount: 54,
  },
  {
    _id: "CLS_015",
    courseId: "CRS_HOA_12",
    courseTitle: "Hóa học 12 – Ôn luyện toàn diện lý thuyết & bài tập",
    teacherId: "TEA_005",
    teacherName: "Thầy Đặng Tuấn",
    categoryId: "CAT_THPT",
    subjectId: "SUB_CHEMISTRY",
    gradeLevel: "GRADE_12",
    className: "Hóa 12 – Chinh phục lý thuyết đếm & Vận dụng cao 9+",
    coverImage: "https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1350000,
    capacity: 18,
    enrolledCount: 10,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-30",
    startDate: "2026-10-21",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 1, startTime: "20:00", endTime: "21:30" },
      { dayOfWeek: 4, startTime: "20:00", endTime: "21:30" },
    ],
    ratingAverage: 4.87,
    ratingCount: 45,
  },
  {
    _id: "CLS_016",
    courseId: "CRS_TOAN_12",
    courseTitle: "Toán 12 – Ôn thi THPT Quốc Gia & Vận Dụng Nâng Cao",
    teacherId: "TEA_001",
    teacherName: "ThS. Nguyễn Văn Đức",
    categoryId: "CAT_THPT",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_12",
    className: "Toán 12 – Luyện đề buổi sáng cuối tuần (VIP)",
    coverImage: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1800000,
    capacity: 16,
    enrolledCount: 14,
    enrollmentStart: "2026-08-20",
    enrollmentEnd: "2026-10-25",
    startDate: "2026-10-18",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 6, startTime: "08:30", endTime: "10:30" }, // Sat morning
      { dayOfWeek: 0, startTime: "08:30", endTime: "10:30" }, // Sun morning
    ],
    ratingAverage: 4.98,
    ratingCount: 82,
  },
  {
    _id: "CLS_017",
    courseId: "CRS_ANH_10",
    courseTitle: "Tiếng Anh 10 – Global Success & IELTS Foundation",
    teacherId: "TEA_004",
    teacherName: "Cô Jessica Trần",
    categoryId: "CAT_THPT",
    subjectId: "SUB_ENGLISH",
    gradeLevel: "GRADE_10",
    className: "Tiếng Anh 10 Buổi chiều – Nghe hiểu & Viết đoạn văn",
    coverImage: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1200000,
    capacity: 15,
    enrolledCount: 8,
    enrollmentStart: "2026-08-20",
    enrollmentEnd: "2026-10-28",
    startDate: "2026-10-22",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 3, startTime: "14:30", endTime: "16:00" }, // Wed afternoon
      { dayOfWeek: 5, startTime: "14:30", endTime: "16:00" }, // Fri afternoon
    ],
    ratingAverage: 4.88,
    ratingCount: 36,
  },
  {
    _id: "CLS_018",
    courseId: "CRS_TOAN_11",
    courseTitle: "Toán 11 – Hình học không gian & Lượng giác",
    teacherId: "TEA_002",
    teacherName: "Cô Mai Lan",
    categoryId: "CAT_THPT",
    subjectId: "SUB_MATH",
    gradeLevel: "GRADE_11",
    className: "Toán 11 – Chinh phục Hình không gian & Lượng giác 8.5+",
    coverImage: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=80",
    classType: "PAID",
    price: 1300000,
    capacity: 18,
    enrolledCount: 16,
    enrollmentStart: "2026-08-15",
    enrollmentEnd: "2026-10-25",
    startDate: "2026-10-15",
    status: "OPEN",
    schedule: [
      { dayOfWeek: 2, startTime: "18:00", endTime: "19:30" },
      { dayOfWeek: 4, startTime: "18:00", endTime: "19:30" },
    ],
    ratingAverage: 4.91,
    ratingCount: 63,
  },
];

const DAY_NAMES = [
  "Chủ nhật",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
];

export function deriveScheduleText(schedule: ClassEntity["schedule"]): string {
  if (!schedule || schedule.length === 0) return "Lịch học linh hoạt";
  const days = schedule.map((s) => DAY_NAMES[s.dayOfWeek]).join(" & ");
  const time = `${schedule[0].startTime} - ${schedule[0].endTime}`;
  return `${days} • ${time}`;
}

export function deriveTimeOfDay(schedule: ClassEntity["schedule"]): TimeOfDay {
  if (!schedule || schedule.length === 0) return "EVENING";
  const firstStartTime = schedule[0].startTime;
  if (firstStartTime < "12:00") return "MORNING";
  if (firstStartTime < "18:00") return "AFTERNOON";
  return "EVENING";
}

export function deriveStatusLabel(status: ClassEntity["status"], isFull: boolean): string {
  if (isFull) return "Đã đủ chỗ";
  switch (status) {
    case "OPEN":
      return "Đang tuyển sinh";
    case "IN_PROGRESS":
      return "Đang diễn ra";
    case "COMPLETED":
      return "Đã kết thúc";
    case "CANCELLED":
      return "Đã hủy";
    case "DRAFT":
      return "Bản nháp";
    default:
      return status;
  }
}

/**
 * Transforms ClassEntity into ClassDiscoveryItem ViewModel
 */
export function transformToDiscoveryItem(entity: ClassEntity): ClassDiscoveryItem {
  const teacher = MOCK_TEACHERS.find((t) => t.id === entity.teacherId);
  const subject = MOCK_SUBJECTS.find((s) => s.id === entity.subjectId);
  const seatsLeft = Math.max(0, entity.capacity - entity.enrolledCount);
  const isFull = seatsLeft === 0;
  const canEnroll = entity.status === "OPEN" && !isFull;
  const timeOfDay = deriveTimeOfDay(entity.schedule);
  const scheduleText = deriveScheduleText(entity.schedule);
  const statusLabel = deriveStatusLabel(entity.status, isFull);

  return {
    id: entity._id,
    title: entity.className,
    courseId: entity.courseId,
    courseTitle: entity.courseTitle,
    subjectId: entity.subjectId,
    subjectName: subject ? subject.name : "Môn học",
    teacherId: entity.teacherId,
    teacherName: entity.teacherName,
    teacherAvatar: teacher?.avatar,
    teacherTitle: teacher?.title,
    gradeLevel: entity.gradeLevel,
    gradeLabel: entity.gradeLevel ? GRADE_LEVEL_LABELS[entity.gradeLevel] || entity.gradeLevel : "Khối lớp",
    coverImage:
      entity.coverImage ||
      "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80",
    classType: entity.classType,
    price: entity.price,
    formattedPrice:
      entity.classType === "FREE" || entity.price === 0
        ? "Miễn phí"
        : `${entity.price.toLocaleString("vi-VN")}đ`,
    capacity: entity.capacity,
    enrolledCount: entity.enrolledCount,
    seatsLeft,
    isFull,
    status: entity.status,
    statusLabel,
    canEnroll,
    startDate: entity.startDate ? formatDateVN(entity.startDate) : "Sắp xếp",
    scheduleText,
    timeOfDay,
    ratingAverage: entity.ratingAverage,
    ratingCount: entity.ratingCount,
  };
}

function formatDateVN(dateStr: string): string {
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}
