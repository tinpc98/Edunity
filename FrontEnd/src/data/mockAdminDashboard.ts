export const adminStats = {
  totalUsers: { value: "1.248", label: "Người dùng toàn hệ thống", trend: "+84" },
  verifiedTeachers: { value: "186", label: "Giáo viên đã xác minh", trend: "97.4% chuẩn" },
  activeClasses: { value: "42", label: "Lớp đang hoạt động", detail: "15 lớp sắp khai giảng" },
  monthlyRevenue: { value: "126.500.000", label: "Doanh thu tháng này", trend: "+18.2%" }
};

export const pendingTasks = [
  { id: "task-1", type: "teacher", title: "5 Giáo viên gửi hồ sơ xác minh", count: 5, desc: "Có 2 hồ sơ nộp từ hôm qua chưa được xử lý" },
  { id: "task-2", type: "scholarship", title: "4 Hồ sơ học bổng khó khăn", count: 4, desc: "Hạn chót thẩm định đợt 2 cho quỹ Tiếp sức đến trường" },
  { id: "task-3", type: "transaction", title: "2 Giao dịch sai lệch mã chuyển khoản", count: 2, desc: "Mã giao dịch #EDU9201 và #EDU9204 cần gán học viên thủ công" },
  { id: "task-4", type: "complaint", title: "1 Khiếu nại từ lớp Toán 12 Nâng cao", count: 1, desc: "Phụ huynh phản ánh trùng giờ học phụ đạo trường THPT" },
];

export const pendingTeachers = [
  {
    id: "teacher-1",
    name: "Nguyễn Minh Đức",
    subject: "Toán THPT",
    qualifications: "ThS Sư phạm Toán (ĐH Sư phạm HN)",
    submitDate: "15/09/2026",
    avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuDM5ls_mbKcAJZnXKT6_BxhnpDVuNI1bMbGtzMakumTgYwR-s2I0L0teTut1yG4VF1nB3QQUw-vpDNS41-ugiOJlAkhP2UOZBuvTSsnmDulnRcHUE_43wrayQnlnbK3X-TrepZD-bTebXDoZs6GjDku6vMgIWlB22PHWy4AVOASdrnb-kyUb5iDWwGtvxsLLg3WN8Dwh4iPBaLWNkN4d3M5VCjoFxYfl3WvYGVGtVE_irVZdwYdlaEA9Q"
  },
  {
    id: "teacher-2",
    name: "Vũ Thị Thu Hằng",
    subject: "Tiếng Anh IELTS",
    qualifications: "8.5 IELTS, Chứng chỉ CELTA Cambridge",
    submitDate: "16/09/2026",
    avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuBKY6g5sS129g5SiKDAmPh43OLSx2r95saO3ZUZCbV6IeLBU5yb9r3_isIy9HfqAdAU-gz4acA3xNstx76TZjVGfnA1_Ze6o9JDlwNxwnTe1VA0tIEPReLrrreLiMKx7lAXDPyjKY0RiEteAejR7oL_17YO42nvg8ue7YB_yBmsuaMQQayGeqczy1aeWH1ziPCQOT90cIG3jNt_ut2KqDVEyHpqzjSiuOO1NVfIYEL8kaFvAqeX-CeHrg"
  },
  {
    id: "teacher-3",
    name: "Trần Bảo Lâm",
    subject: "Vật lý 10-12",
    qualifications: "Cử nhân Sư phạm Vật lý (ĐH Sư phạm TPHCM)",
    submitDate: "16/09/2026",
    avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuAEzKqiEdRgD8bT3hSlKKM-x02tFXydClB3Fh8Br_t3kSBiJh6ej_M-z7NTnS3KuCkwRrVorCnKx8H3I7tnnqAZw0jClVdff9aAViLpJ7fH5FDMyzHVkmRV5YAr1Syxu4EuwEusHaOJoQW-SWBprUndjIfe7xMOOets0MJTBMiASzxWHjy89a4o8y7lxs6TaGhEzrxJPhK9dE_Kig8DASQGkp8aXFnJtvrkOhFtw1cDajaXuBR730JCXg"
  }
];

export const scholarshipOverview = {
  totalFund: "420.000.000",
  allocatedFund: "280.000.000",
  percent: 66.7,
  studentsReceived: 124,
  newApplications: 4
};

export const trainingOverview = {
  courses: 48,
  classes: 67,
  activeClasses: 42,
  upcomingClasses: 15
};

export const recentActivities = [
  { id: "act-1", type: "teacher", title: "Xác minh giáo viên", time: "10m trước", desc: 'Giáo viên Trần Mai Anh vừa được phê duyệt giảng dạy bộ môn Hóa học.' },
  { id: "act-2", type: "scholarship", title: "Quỹ học bổng", time: "25m trước", desc: 'Campaign "Tiếp sức đến trường" nhận thêm tài trợ 20.000.000đ từ doanh nghiệp.' },
  { id: "act-3", type: "transaction", title: "Cảnh báo giao dịch", time: "1h trước", desc: 'Giao dịch #EDU9201 hoàn tiền tự động thất bại do sai số tài khoản thụ hưởng.' }
];

export const adminFinance = {
  revenue: "126.500.000",
  commission: "12.650.000",
  transactions: 184,
  refunds: 3,
  monthlyData: [
    { month: "Th5", value: 82.0 },
    { month: "Th6", value: 89.5 },
    { month: "Th7", value: 96.0 },
    { month: "Th8", value: 105.2 },
    { month: "Th9", value: 114.8 },
    { month: "Th10", value: 126.5, isActive: true },
  ]
};
