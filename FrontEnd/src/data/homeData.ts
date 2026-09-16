import type { Category, ClassItem, FeaturedTeacher, NewsItem, Scholarship, StatItem, Testimonial } from "../types/home";

export const LOGO_URL = "https://lh3.googleusercontent.com/aida-public/AB6AXuB8J3cE2D-jqio5ErG4GcmCBJ3_LphYBmN3fr-vy0vNEPUU7Qz_HUMqjpdoJ8-pESfWgaDlTpnE5LM16zwXsbPOIqpq6Dhv_AHmUTNSP2LWnYvm5Nk2FAN8I9Ui8NV3dxlywxVM5Sxq9IZjqSNNDO8mrDUi50cZm5vIS8RS-T33XAY7S3v_0y--5Hpybu_7wPFKUIlqcOBWhYf8gQ6BnPHewR2ZM7Sr05AHscClqqkO7RNgqq4b6DXr";
export const HERO_BANNER_URL = "https://lh3.googleusercontent.com/aida-public/AB6AXuA6MkSB_fYEquFuNn8hfzOPN_A0gMncQ46DgAvEvRy53XdlqtgsdauRRaoWH3rQRHChbeL3oXl9LwyHM9SVdimVKlxLsGVQwizadBDYJLmdj4JcK7bHz0L1p5WN87MbAqorprypZVNXzKV1ALsUGuxgaj7Q1JJskioORHVKVl9D3k18t89yVvp2VU5PqdCxS80GQ65-b26JRwR9kpOhk1dDXK6W2Ojc3YbQXPtKZIylQCPVyLNrdWXu";

export const CATEGORIES_DATA: Category[] = [
  {
    id: "dai-hoc",
    title: "Đại học - Cao đẳng",
    badge: "ĐH",
    badgeColor: "purple",
    icon: "GraduationCap",
    groups: [
      {
        name: "CÁC MÔN ĐẠI CƯƠNG",
        subjects: ["Toán cao cấp", "Xác suất thống kê", "Kinh tế vi mô", "Kinh tế vĩ mô", "Pháp luật đại cương", "Triết học Mác-Lênin"]
      },
      {
        name: "KỸ NĂNG & DỰ ÁN",
        subjects: ["Kỹ năng học đại học", "Nghiên cứu khoa học", "Tiếng Anh chuyên ngành", "Viết luận tốt nghiệp"]
      }
    ]
  },
  {
    id: "bo-tro",
    title: "Bổ trợ Phương pháp - Kĩ năng",
    badge: "Hot",
    badgeColor: "orange",
    icon: "Sparkles",
    groups: [
      {
        name: "PHƯƠNG PHÁP & TƯ DUY",
        subjects: ["Phương pháp học", "Kỹ năng mềm", "Gia sư 1:1", "Tư duy số", "Lập trình ứng dụng"]
      }
    ]
  },
  {
    id: "hsg",
    title: "Bồi dưỡng HSG",
    badge: "HSG",
    badgeColor: "teal",
    icon: "Trophy",
    groups: [
      {
        name: "MÔN TỰ NHIÊN",
        subjects: ["Toán chuyên", "Vật lí chuyên", "Hóa học chuyên", "Sinh học chuyên", "Tin học HSG"]
      },
      {
        name: "XÃ HỘI & NGOẠI NGỮ",
        subjects: ["Ngữ văn chuyên", "Tiếng Anh HSG"]
      }
    ]
  },
  {
    id: "luyen-thi-dh",
    title: "Luyện thi đại học",
    badge: "2026",
    badgeColor: "red",
    icon: "Rocket",
    groups: [
      {
        name: "TỔ HỢP TỰ NHIÊN",
        subjects: ["Toán VIP 12", "Vật lí 12 Live", "Hóa học 12 Live", "Sinh học 12"]
      },
      {
        name: "TỔ HỢP XÃ HỘI & NGOẠI NGỮ",
        subjects: ["Tiếng Anh 12", "Ngữ văn 12 Chuyên sâu", "Lịch sử & Địa lí"]
      },
      {
        name: "KỲ THI ĐÁNH GIÁ NĂNG LỰC",
        subjects: ["Luyện đề HSA (ĐHQGHN)", "Luyện đề TSA (Bách Khoa)", "Luyện thi V-ACT (ĐHQG TP.HCM)"]
      }
    ]
  },
  {
    id: "thpt",
    title: "Lớp 10 - Lớp 11 - Lớp 12",
    badge: "THPT",
    badgeColor: "primary",
    icon: "BookOpen",
    groups: [
      {
        name: "LỚP 10",
        subjects: ["Ngữ văn 10", "Toán học 10", "Tiếng Anh 10", "Vật lí 10", "Hóa học 10", "Sinh học 10", "Lịch sử & Địa lí"]
      },
      {
        name: "LỚP 11",
        subjects: ["Ngữ văn 11", "Toán học 11", "Tiếng Anh 11", "Vật lí 11", "Hóa học 11", "Sinh học 11", "Lịch sử & Địa lí"]
      },
      {
        name: "LỚP 12 (THPT QG)",
        isHighlight: true,
        subjects: ["Ngữ văn 12", "Toán VIP 12", "Tiếng Anh 12", "Vật lí 12", "Hóa học 12", "Sinh học 12"]
      }
    ]
  },
  {
    id: "vao-10",
    title: "Luyện thi vào 10",
    badge: null,
    badgeColor: null,
    icon: "Award",
    groups: [
      {
        name: "MÔN ĐIỀU KIỆN",
        subjects: ["Toán vào 10", "Ngữ văn vào 10", "Tiếng Anh vào 10"]
      },
      {
        name: "MÔN CHUYÊN",
        subjects: ["Toán chuyên", "Văn chuyên", "Tiếng Anh chuyên", "Khoa học tự nhiên chuyên"]
      }
    ]
  },
  {
    id: "thcs",
    title: "Lớp 6 - Lớp 7 - Lớp 8 - Lớp 9",
    badge: null,
    badgeColor: null,
    icon: "Users",
    groups: [
      {
        name: "LỚP 6 & 7",
        subjects: ["Toán 6 & 7", "Ngữ văn 6 & 7", "Tiếng Anh 6 & 7", "KHTN 6 & 7"]
      },
      {
        name: "LỚP 8 & 9",
        subjects: ["Toán 8 & 9", "Ngữ văn 8 & 9", "Tiếng Anh 8 & 9", "KHTN (Lý - Hóa - Sinh)"]
      }
    ]
  }
];

export const STATS_ITEMS: StatItem[] = [
  { icon: "ShieldCheck", title: "Giáo Viên Uy Tín", desc: "100% Thạc sĩ & Chuyên gia" },
  { icon: "Video", title: "Live HD Không Lag", desc: "Bảng tương tác số 2 chiều" },
  { icon: "Users", title: "Lớp Học Nhỏ", desc: "Tối đa 8 - 15 học viên/lớp" },
  { icon: "Star", title: "4.9 / 5 Đánh Giá", desc: "Hơn 45.000 học sinh tin chọn" }
];

export const THPT_CLASSES: ClassItem[] = [
  {
    id: "thpt-1",
    tag: "Lớp 10",
    title: "Toán 10 – Nền tảng tư duy hình học & đại số mới",
    teacher: "Cô Mai Lan (Chuyên KHTN)",
    rating: 4.9,
    sessionsCount: "32 buổi Live",
    startDate: "22/09/2026",
    schedule: "Thứ 2 & Thứ 5 • 19:30",
    seatsLeft: 4,
    capacity: 12,
    price: 1250000,
    image: "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thpt-2",
    tag: "Lớp 11",
    title: "Ngữ văn 11 – Đọc hiểu & Viết đoạn văn nghị luận điểm cao",
    teacher: "Thầy Hoàng Nam",
    rating: 4.95,
    sessionsCount: "28 buổi Live",
    startDate: "24/09/2026",
    schedule: "Thứ 3 & Thứ 6 • 20:00",
    seatsLeft: 6,
    capacity: 15,
    price: 980000,
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thpt-3",
    tag: "Lớp 10",
    title: "Tiếng Anh 10 – Bứt phá ngữ pháp & IELTS Foundation",
    teacher: "Cô Jessica Trần (8.5 IELTS)",
    rating: 4.9,
    sessionsCount: "36 buổi Live",
    startDate: "27/09/2026",
    schedule: "Thứ 4 & Chủ nhật • 19:30",
    seatsLeft: 3,
    capacity: 10,
    price: 1450000,
    image: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thpt-4",
    tag: "Lớp 11",
    title: "Hóa học 11 – Chuyên đề Hóa hữu cơ ứng dụng thực tế",
    teacher: "Thầy Đặng Tuấn",
    rating: 4.88,
    sessionsCount: "30 buổi Live",
    startDate: "02/10/2026",
    schedule: "Thứ 3 & Thứ 6 • 19:30",
    seatsLeft: 5,
    capacity: 12,
    price: 1100000,
    image: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thpt-5",
    tag: "ĐGNL 2026",
    title: "Phòng luyện HSA – ĐHQG Hà Nội 2026 (Chữa chi tiết 100%)",
    teacher: "Team Chuyên Gia HSA",
    rating: 5.0,
    sessionsCount: "24 buổi Live",
    startDate: "01/10/2026",
    schedule: "Thứ 5 & Chủ nhật • 20:00",
    seatsLeft: 7,
    capacity: 15,
    price: 850000,
    image: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thpt-6",
    tag: "TSA & V-ACT",
    title: "Phòng luyện TSA Bách Khoa & ĐHQG TP.HCM Độc Quyền",
    teacher: "Đội ngũ Thủ khoa Bách Khoa",
    rating: 4.9,
    sessionsCount: "20 buổi Live",
    startDate: "03/10/2026",
    schedule: "Thứ 4 & Thứ 7 • 20:00",
    seatsLeft: 6,
    capacity: 15,
    price: 890000,
    image: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=80"
  }
];

export const THCS_CLASSES: ClassItem[] = [
  {
    id: "thcs-1",
    tag: "Lớp 6",
    title: "Toán 6 – Chân trời sáng tạo & Cánh diều (Chuẩn mới)",
    teacher: "Cô Trần Thu Hương",
    rating: 4.9,
    sessionsCount: "30 buổi Live",
    startDate: "23/09/2026",
    schedule: "Thứ 2 & Thứ 6 • 19:00",
    seatsLeft: 5,
    capacity: 12,
    price: 850000,
    image: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thcs-2",
    tag: "Lớp 7",
    title: "Toán 7 – Hình học trực quan & Số học nâng cao",
    teacher: "Thầy Lê Duy Khánh",
    rating: 4.88,
    sessionsCount: "32 buổi Live",
    startDate: "26/09/2026",
    schedule: "Thứ 3 & Thứ 7 • 19:30",
    seatsLeft: 4,
    capacity: 12,
    price: 890000,
    image: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thcs-3",
    tag: "Lớp 8",
    title: "Toán 8 – Đại số & Bất đẳng thức thực chiến thi HSG",
    teacher: "Thầy Vũ Đình Tuấn",
    rating: 4.95,
    sessionsCount: "34 buổi Live",
    startDate: "28/09/2026",
    schedule: "Thứ 4 & Chủ nhật • 19:00",
    seatsLeft: 6,
    capacity: 15,
    price: 950000,
    image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thcs-4",
    tag: "Thi Vào 10",
    title: "Ngữ văn 9 – Tổng ôn 12 tác phẩm trọng tâm thi vào 10",
    teacher: "Cô Ánh Tuyết",
    rating: 4.97,
    sessionsCount: "26 buổi Live",
    startDate: "30/09/2026",
    schedule: "Thứ 2 & Thứ 5 • 20:00",
    seatsLeft: 3,
    capacity: 10,
    price: 920000,
    image: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thcs-5",
    tag: "Lớp 8",
    title: "Tiếng Anh 8 – Giao tiếp phản xạ & Ngữ pháp trường chuyên",
    teacher: "Cô Minh Hạnh",
    rating: 4.9,
    sessionsCount: "30 buổi Live",
    startDate: "02/10/2026",
    schedule: "Thứ 3 & Thứ 6 • 19:30",
    seatsLeft: 5,
    capacity: 12,
    price: 1100000,
    image: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "thcs-6",
    tag: "Thi Vào 10",
    title: "Tiếng Anh 9 – Luyện đề thi tuyển sinh lớp 10 các tỉnh thành",
    teacher: "Thầy Paul & Cô Trang",
    rating: 4.92,
    sessionsCount: "32 buổi Live",
    startDate: "04/10/2026",
    schedule: "Thứ 4 & Chủ nhật • 20:00",
    seatsLeft: 8,
    capacity: 15,
    price: 990000,
    image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=600&q=80"
  }
];

export const FREE_CLASSES: ClassItem[] = [
  {
    id: "free-1",
    tag: "English Club",
    title: "English Speaking Club – Luyện Phản Xạ Cùng Giáo Viên Bản Ngữ",
    teacher: "Mr. David Miller (TESOL Certified)",
    rating: 4.9,
    sessionsCount: "8 buổi Live",
    price: 0,
    startDate: "20/09/2026",
    schedule: "Thứ 7 • 19:30–21:00",
    seatsLeft: 8,
    capacity: 20,
    image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "free-2",
    tag: "Workshop",
    title: "ReactJS & Tư Duy Lập Trình Cho Học Sinh Cấp 3",
    teacher: "Thầy Hoàng Long (Tech Lead)",
    rating: 4.9,
    sessionsCount: "4 buổi Live",
    price: 0,
    startDate: "21/09/2026",
    schedule: "Chủ Nhật • 20:00–21:30",
    seatsLeft: 5,
    capacity: 16,
    image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "free-3",
    tag: "Ôn thi THPT",
    title: "Chữa Đề Toán THPT 2026 – Kỹ Thuật Tránh Bẫy Điểm 8+",
    teacher: "ThS. Nguyễn Văn Đức",
    rating: 5.0,
    sessionsCount: "6 buổi Live",
    price: 0,
    startDate: "24/09/2026",
    schedule: "Thứ 5 • 19:30–21:00",
    seatsLeft: 3,
    capacity: 15,
    image: "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "free-4",
    tag: "Kỹ năng",
    title: "Phương Pháp Học Hiệu Quả & Quản Lý Thời Gian",
    teacher: "Cô Minh Châu (FTU)",
    rating: 4.8,
    sessionsCount: "3 buổi Live",
    price: 0,
    startDate: "22/09/2026",
    schedule: "Thứ 3 • 20:00–21:00",
    seatsLeft: 6,
    capacity: 18,
    image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=600&q=80"
  }
];

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "test-1",
    name: "Lê Minh Anh",
    role: "Học sinh Lớp 12 • Hà Nội (Đỗ Ngoại Thương)",
    badge: "Toán 12 Live Pro",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    comment: "Học Toán thầy Đức giải thích cực kỳ dễ hiểu, từ một đứa mất gốc em đã tự tin đạt 9.2 bài thi thử trường THPT Chuyên. Lớp học tương tác vui vẻ, đặt câu hỏi qua micro được thầy trả lời và chữa luôn trên bảng số."
  },
  {
    id: "test-2",
    name: "Trần Bảo Châu",
    role: "Học sinh Lớp 9 • Đà Nẵng (Đỗ Chuyên Lê Quý Đôn)",
    badge: "Luyện Thi Vào 10",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80",
    comment: "Em vừa đỗ Chuyên Lê Quý Đôn nhờ khóa Luyện thi vào 10 của Edunity! Nền tảng học mượt mà, bài tập về nhà được thầy cô chấm chữa chi tiết từng câu sai, chỉ rõ lỗi trình bày để tránh bị trừ điểm oan."
  },
  {
    id: "test-3",
    name: "Nguyễn Quốc Huy",
    role: "Học sinh Lớp 11 • TP. Hồ Chí Minh",
    badge: "Phòng Luyện HSA",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80",
    comment: "Giao diện hiện đại, dễ dàng tìm kiếm giáo viên phù hợp phong cách học và được hỗ trợ suốt học bổng khi gia đình gặp khó khăn. Em rất biết ơn Edunity vì đã giúp việc học trực tuyến không còn nhàm chán."
  }
];

export const FEATURED_TEACHERS: FeaturedTeacher[] = [
  {
    id: "teacher-1",
    name: "Thầy Nguyễn Minh Đức",
    specialty: "Chuyên gia Toán THPT",
    bio: "Thủ khoa ĐH Sư phạm Hà Nội, hơn 12 năm giảng dạy và luyện thi trực tuyến.",
    students: "18.000+",
    rating: 4.9,
    openClasses: 6,
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80"
  },
  {
    id: "teacher-2",
    name: "Cô Trần Mai Anh",
    specialty: "Thạc sĩ TESOL • IELTS 8.5",
    bio: "9 năm giảng dạy IELTS và tiếng Anh học thuật, chú trọng tương tác và phản xạ trong lớp live.",
    students: "14.500+",
    rating: 4.95,
    openClasses: 5,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80"
  },
  {
    id: "teacher-3",
    name: "Cô Phạm Thảo Nguyên",
    specialty: "Huy chương Vật lý Quốc gia",
    bio: "Cựu học sinh Chuyên Khoa học Tự nhiên, 8 năm giảng dạy Vật lý trực quan và luyện thi.",
    students: "9.200+",
    rating: 4.9,
    openClasses: 4,
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80"
  },
  {
    id: "teacher-4",
    name: "Thầy Lê Quang Huy",
    specialty: "Thủ khoa CNTT Bách Khoa",
    bio: "Chuyên gia thuật toán, huấn luyện học sinh giỏi Tin học và lập trình Python trong lớp live.",
    students: "6.800+",
    rating: 4.92,
    openClasses: 3,
    avatar: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=400&q=80"
  }
];

export const SCHOLARSHIPS: Scholarship[] = [
  {
    id: "sch-1",
    badge: "Tài trợ 100%",
    cycle: "Kỳ tuyển chọn Hè 2026",
    title: "Học bổng Nâng bước Thủ khoa",
    desc: "Tài trợ toàn bộ học phí trọn năm lớp 12 cho 200 học sinh vượt khó học giỏi, kèm bộ sách và máy tính bảng học trực tuyến.",
    progressText: "Đã trao 142 / 200 suất (71%)",
    percent: 71,
    deadline: "Còn 6 ngày nhận hồ sơ",
    cta: "Đăng Ký Học Bổng",
    ctaType: "primary"
  },
  {
    id: "sch-2",
    badge: "Học Bổng Số",
    cycle: "Cộng đồng bảo trợ",
    title: "Học Bổng Công Nghệ Số & Ngoại Ngữ",
    desc: "Trang bị khóa học Tiếng Anh trực tuyến cùng giáo viên bản ngữ và thiết bị học tập cho học sinh vùng cao và hải đảo.",
    progressText: "Ngân quỹ huy động: 350.000.000đ / 500.000.000đ",
    percent: 70,
    deadline: "Mục tiêu: 500 em",
    cta: "Xem Chi Tiết",
    ctaType: "outline"
  },
  {
    id: "sch-3",
    badge: "Tiếp Sức Vào 10",
    cycle: "Mở đơn liên tục",
    title: "Đồng Hành Cùng Sĩ Tử Vượt Khó Vào 10",
    desc: "Miễn phí toàn bộ phòng luyện đề thi vào 10 chuyên môn Toán, Văn, Anh và các buổi phụ đạo chuyên đề 1 kèm 1 mỗi tuần.",
    progressText: "Số học sinh đã nhận: 320 học sinh toàn quốc",
    percent: 85,
    deadline: "Xét duyệt trong 48h",
    cta: "Nộp Hồ Sơ Ngay",
    ctaType: "danger"
  }
];

export const NEWS_LIST: NewsItem[] = [
  {
    id: "news-1",
    tag: "Kỳ Thi 2025",
    date: "15 Tháng 3, 2025 • 6 phút đọc",
    title: "Công bố cấu trúc đề thi Đánh giá năng lực (HSA, TSA) 2025 và chiến thuật ôn luyện",
    desc: "Phân tích ma trận kiến thức định lượng, tư duy khoa học và định tính theo định dạng đề chuẩn mới nhất.",
    image: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "news-2",
    tag: "Kỹ Năng Học",
    date: "12 Tháng 3, 2025 • 4 phút đọc",
    title: "Phương pháp Pomodoro & Active Recall giúp học sinh cấp 3 ghi nhớ kiến thức gấp đôi",
    desc: "Bí quyết phân bổ thời gian học 25 phút tập trung cao độ kết hợp hệ thống flashcard thông minh được kiểm chứng.",
    image: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "news-3",
    tag: "Gương Sáng",
    date: "08 Tháng 3, 2025 • 5 phút đọc",
    title: "Câu chuyện học viên: Từ học sinh mất gốc đến thủ khoa khối D01 tỉnh Nam Định",
    desc: "Hành trình kiên trì 8 tháng học trực tiếp cùng các giáo viên tại Edunity để bứt phá từ điểm 5 lên 28.5 điểm thi thử.",
    image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
  }
];