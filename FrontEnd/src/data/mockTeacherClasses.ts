import type { TeacherClass, CourseCatalogItem, TeacherStudent, TeacherSession, TeacherReview } from "../types/teacher";

export const mockCourseCatalog: CourseCatalogItem[] = [
  {
    id: "COURSE_001",
    title: "Toán 12 – Ôn thi THPT Quốc Gia & Vận Dụng Nâng Cao",
    subject: "Toán học",
    grade: "Lớp 12",
    description: "Đầy đủ hệ thống bài tập, đáp án video, ngân hàng 2,400+ câu trắc nghiệm chuẩn hoá cấu trúc mới.",
    totalLessons: 48,
    type: "PAID"
  },
  {
    id: "COURSE_002",
    title: "Vật lý 11 – Cơ học & Nhiệt học ứng dụng thực tế",
    subject: "Vật lý",
    grade: "Lớp 11",
    description: "Khung chương trình bám sát đồ thi học sinh giỏi cấp tỉnh và định hướng tư duy thực nghiệm.",
    totalLessons: 36,
    type: "PAID"
  },
  {
    id: "COURSE_003",
    title: "Tiếng Anh 10 – Bám sát sách mới Global Success & IELTS Foundation",
    subject: "Tiếng Anh",
    grade: "Lớp 10",
    description: "Hệ thống bài nghe phản xạ, luyện đề giữa kỳ và đề thi học kỳ có chấm điểm AI tự động.",
    totalLessons: 24,
    type: "FREE"
  }
];

export const teacherClasses: TeacherClass[] = [
  {
    id: "CLASS_001",
    name: "Toán 12 – Chinh phục 8+ Nâng cao",
    courseId: "COURSE_001",
    courseName: "Toán 12 – Ôn thi THPT Quốc Gia & Vận Dụng Nâng Cao",
    subject: "Toán học",
    grade: "Lớp 12",
    type: "PAID",
    status: "ACTIVE",
    schedule: "Thứ 3 - Thứ 5 • 20:00 - 21:30",
    startDate: "05/09/2026",
    price: 1800000,
    capacity: 20,
    enrolled: 18,
    rating: 4.9,
    reviewCount: 48,
    totalSessions: 24,
    completedSessions: 12,
    nextSession: {
      date: "Tối nay",
      time: "20:00",
      sessionNumber: 13
    }
  },
  {
    id: "CLASS_002",
    name: "Vật lý 11 – Ôn luyện & Luyện giải đề",
    courseId: "COURSE_002",
    courseName: "Vật lý 11 – Cơ học & Nhiệt học ứng dụng thực tế",
    subject: "Vật lý",
    grade: "Lớp 11",
    type: "PAID",
    status: "ENROLLING",
    schedule: "Thứ 2 - Thứ 6 • 18:00 - 19:30",
    startDate: "25/09/2026",
    price: 1500000,
    capacity: 20,
    enrolled: 12,
    rating: 4.8,
    reviewCount: 32,
    totalSessions: 20,
    completedSessions: 0,
  },
  {
    id: "CLASS_003",
    name: "English Foundation & Speaking Club",
    courseId: "COURSE_003",
    courseName: "Tiếng Anh 10 – Bám sát sách mới Global Success & IELTS Foundation",
    subject: "Tiếng Anh",
    grade: "Lớp 10",
    type: "FREE",
    status: "UPCOMING",
    schedule: "Chủ nhật • 09:00 - 10:30",
    startDate: "22/09/2026",
    capacity: 15,
    enrolled: 8,
    rating: 5.0,
    reviewCount: 15,
    totalSessions: 8,
    completedSessions: 0,
  },
  {
    id: "CLASS_004",
    name: "Toán 11 – Hình học không gian & Lượng giác",
    courseId: "COURSE_001",
    courseName: "Toán 11",
    subject: "Toán học",
    grade: "Lớp 11",
    type: "PAID",
    status: "ACTIVE",
    schedule: "Thứ 4 - Thứ 7 • 19:30 - 21:00",
    startDate: "01/09/2026",
    price: 1600000,
    capacity: 20,
    enrolled: 20,
    rating: 4.9,
    reviewCount: 75,
    totalSessions: 18,
    completedSessions: 7,
    nextSession: {
      date: "Thứ Bảy này",
      time: "19:30",
      sessionNumber: 8
    }
  },
  {
    id: "CLASS_005",
    name: "Toán 12 – Tổng ôn cấp tốc 30 ngày (K2025)",
    courseId: "COURSE_001",
    courseName: "Toán 12",
    subject: "Toán học",
    grade: "Lớp 12",
    type: "PAID",
    status: "COMPLETED",
    schedule: "Thứ 2 - Thứ 4 - Thứ 6",
    startDate: "01/05/2025",
    endDate: "01/07/2025",
    price: 1200000,
    capacity: 25,
    enrolled: 25,
    rating: 4.9,
    reviewCount: 64,
    totalSessions: 30,
    completedSessions: 30,
  }
];

export const classStudents: TeacherStudent[] = [
  { id: "STU_1", name: "Nguyễn Quốc Huy", email: "huy.nq12@gmail.com", joinDate: "10/08/2026", status: "CONFIRMED", attendanceRate: 100, averageScore: 9.5, lastAttended: "15/09/2026" },
  { id: "STU_2", name: "Trần Mai Anh", email: "maianh.tran@gmail.com", joinDate: "11/08/2026", status: "CONFIRMED", attendanceRate: 100, averageScore: 9.0, lastAttended: "15/09/2026" },
  { id: "STU_3", name: "Lê Hoàng Nam", email: "nam.lehoang@gmail.com", joinDate: "12/08/2026", status: "CONFIRMED", attendanceRate: 92, averageScore: 8.8, lastAttended: "15/09/2026" },
  { id: "STU_4", name: "Vũ Minh Châu", email: "chau.vuminh@gmail.com", joinDate: "12/08/2026", status: "CONFIRMED", attendanceRate: 100, averageScore: 9.2, lastAttended: "15/09/2026" },
];

export const classSessions: TeacherSession[] = [
  { id: "SES_13", title: "Buổi 13: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số (Dạng bài vận dụng 8.5+)", date: "17/09/2026", startTime: "20:00", endTime: "21:30", status: "SCHEDULED", totalStudents: 18 },
  { id: "SES_12", title: "Cực trị hàm hợp và hàm ẩn nâng cao", date: "15/09/2026", startTime: "20:00", endTime: "21:35", status: "COMPLETED", attendanceCount: 18, totalStudents: 18, duration: 95 },
  { id: "SES_11", title: "Tính đơn điệu của hàm số chứa tham số", date: "10/09/2026", startTime: "20:00", endTime: "21:30", status: "COMPLETED", attendanceCount: 17, totalStudents: 18, duration: 90 },
  { id: "SES_10", title: "Đại số tổ hợp và xác suất nâng cao", date: "08/09/2026", startTime: "20:00", endTime: "21:32", status: "COMPLETED", attendanceCount: 18, totalStudents: 18, duration: 92 },
];

export const classReviews: TeacherReview[] = [
  { id: "REV_1", studentName: "Phương Linh", rating: 5, date: "2 ngày trước", comment: "Thầy dạy cực kỳ có tâm, chữa từng lỗi sai trong cách lập bảng biến thiên. Từ lúc học lớp của thầy em tự tin hẳn với các câu 8+ trong đề thi thử." },
  { id: "REV_2", studentName: "Minh Tuấn", rating: 5, date: "1 tuần trước", comment: "Bài giảng chi tiết dễ hiểu, tài liệu bài tập rất sát với form đề thi năm nay." },
];

export const teacherClassSummary = {
  activeClasses: 4,
  totalStudents: 58,
  enrolling: 2,
  upcoming: 1
};
