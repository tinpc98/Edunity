export const teacherStats = {
  activeClasses: { value: 4, label: "Lớp đang dạy", trend: "+1 lớp mới" },
  totalStudents: { value: 58, label: "Tổng học viên", trend: "+12%" },
  monthlyRevenue: { value: "8.600.000", label: "Doanh thu tháng này", trend: "+16%" },
  averageRating: { value: "4.9", label: "Đánh giá trung bình", suffix: "(120 nhận xét)" }
};

export const todaySessions = [
  {
    id: "session-1",
    timeStart: "18:00",
    timeEnd: "19:30",
    title: "Vật lý 11 – Nền tảng & Ứng dụng",
    status: "ended", // ended, active, upcoming
    details: "12 học viên đã tham gia • Phòng Lab A-02"
  },
  {
    id: "session-2",
    timeStart: "20:00",
    timeEnd: "21:30",
    title: "Toán 12 – Chinh phục 8+",
    status: "active",
    details: "18/20 học viên có mặt • Phòng trực tuyến Zoom VIP"
  },
  {
    id: "session-3",
    timeStart: "22:00",
    timeEnd: "23:00",
    title: "Tiếng Anh Foundation & Speaking Club",
    status: "upcoming",
    details: "8 học viên đăng ký • Chủ đề: Weekly Debate"
  }
];

export const activeClasses = [
  {
    id: "class-1",
    title: "Toán 12 – Chinh phục 8+ Nâng cao",
    schedule: "T3 – T5 • 20:00 – 21:30",
    studentsJoined: 18,
    capacity: 20,
    rating: 4.9,
    reviews: 48,
    type: "PAID",
    status: "Đang học",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBQPiJZtJZXNb_SBmZxnRYLkYB5KrKzv-IudCXXIiUD0KJFlmzyfGINuh4ue8oluCiy6KRdLijnCAF0Mvrruj9sTV7gBJz-ayOguvfJUiJT0jgNKV_JF5R3BBX_wP24H06MctdcYEgLPgMnEyOFlrzFqheMOSlJeypgB8yYcebiP-AVnVo3A0GzElu_-wkqEQLOEQ730FW9j_Xi-0OSPNy9OdLEjk25qsuQXIhAF_WPE57lj8Efxz3iTA"
  },
  {
    id: "class-2",
    title: "Vật lý 11 – Ôn luyện & Luyện giải đề",
    schedule: "T2 – T6 • 18:00 – 19:30",
    studentsJoined: 12,
    capacity: 15,
    rating: 4.8,
    reviews: 32,
    type: "PAID",
    status: "Đang học",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDZNIToymC4Faeu4K2DhfRkJkWA5HgpwmB63INguOmJzJzGCBGZjKOfaH_E7deSWIVW-UC-vGrCSRhS2Bl6Jged_6M-NSCQe52KFcYOVoxyBe1Wbc61dl9ZDRUabhnrU0S1I5jRZlK5sfPlI7HImhHXCnP2EDZcxwNR48VOAq_T9EGVKgPp3akISmBkDMaLlj5kWj9250wJPQcsTthWTBOaLiFuch6nIj6mvBcug9D1psA7N6crSfiE3Q"
  },
  {
    id: "class-3",
    title: "English Foundation & Speaking Club",
    schedule: "Chủ nhật • 09:00 – 10:30",
    studentsJoined: 20,
    capacity: 30,
    rating: 5.0,
    reviews: 15,
    type: "FREE",
    status: "Tuyển sinh",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDy4xTDF949mxaSaQSdog0qBCYwXOJanaJ5phwtzEf50wsBhzIc-cw4Q7QRwVIdtDE4YiPu0O9lVS3OdOs1odS-6E7ZoYpMutOmQo_8AZnxu_xwMB1sysr-eSZW5kUGqfKJvsl_FTw3y_Kbcl616D54kU2d2EyP4GC6P4WDCENkIzUuHqr5a32GQDdlaO-jxhyaghR1TT31OPnSjv58IQg1vgQBaPH6LOopKJPIcKjwXmR7rjNnfEk08w"
  }
];

export const newStudents = [
  { id: "stu-1", name: "Nguyễn Quốc Huy", course: "Toán 12", joined: "Hôm nay", initials: "QH", status: "Đã duyệt", color: "blue" },
  { id: "stu-2", name: "Trần Mai Anh", course: "Vật lý 11", joined: "15/09", initials: "MA", status: "Đã duyệt", color: "purple" },
  { id: "stu-3", name: "Lê Hoàng Nam", course: "English Club", joined: "14/09", initials: "HN", status: "Đã duyệt", color: "green" }
];

export const recentMessages = [
  { id: "msg-1", name: "Phương Linh (Toán 12)", time: "5p trước", text: "Thầy ơi bài số 5 phần tích phân em chưa hiểu đáp án...", initials: "PL", isUnread: true },
  { id: "msg-2", name: "Quốc Huy (Toán 12)", time: "30p trước", text: "Tối nay lớp mình học link này đúng không thầy?", initials: "QH", isUnread: false },
  { id: "msg-3", name: "Minh Châu (Vật lý 11)", time: "2 giờ trước", text: "Em đã nộp bài tập về nhà rồi ạ! Thầy xem giúp em nhé.", initials: "MC", isUnread: false }
];

export const teacherRevenue = {
  gross: "9.500.000",
  platformFee: "900.000",
  netPayout: "8.600.000",
  monthlyData: [
    { month: "T5", value: 5.2 },
    { month: "T6", value: 6.1 },
    { month: "T7", value: 6.8 },
    { month: "T8", value: 7.4 },
    { month: "T9", value: 7.9 },
    { month: "T10", value: 8.6, isActive: true },
  ]
};
