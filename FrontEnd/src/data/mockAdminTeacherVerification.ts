import type { TeacherVerification } from "../types/admin";

export const mockAdminTeacherVerifications: TeacherVerification[] = [
  {
    id: "TEACHER_001",
    name: "Nguyễn Minh Đức",
    email: "minhduc.nguyen@edunity.edu.vn",
    phone: "0912 345 678",
    specialization: "Toán THPT",
    experience: "8 năm kinh nghiệm giảng dạy môn Toán. Luyện thi THPT Quốc gia đạt hiệu quả cao.",
    bio: "Hướng tới phương pháp giảng dạy tự nhiên, kích thích tư duy logic thay vì học thuộc lòng.",
    workplace: "THPT Chuyên Hà Nội - Amsterdam",
    dateSubmitted: "15/09/2026",
    status: "PENDING",
    documents: [
      { id: "DOC_1", name: "CCCD_MatTruoc.jpg", type: "ID_CARD_FRONT", url: "https://picsum.photos/400/300" },
      { id: "DOC_2", name: "CCCD_MatSau.jpg", type: "ID_CARD_BACK", url: "https://picsum.photos/400/300" },
      { id: "DOC_3", name: "Bang_Thac_Si_Toan.pdf", type: "DEGREE", issueDate: "10/08/2021", url: "https://picsum.photos/400/300" },
      { id: "DOC_4", name: "Chung_Chi_Nghiep_Vu_Su_Pham.pdf", type: "CERTIFICATE", issueDate: "12/04/2022", url: "https://picsum.photos/400/300" }
    ]
  },
  {
    id: "TEACHER_002",
    name: "Vũ Thị Thu Hằng",
    email: "hang.vu@gmail.com",
    phone: "0987 654 321",
    specialization: "Tiếng Anh / IELTS",
    experience: "5 năm kinh nghiệm luyện thi IELTS",
    bio: "IELTS 8.5 overall.",
    workplace: "Trung tâm Tiếng Anh ABC",
    dateSubmitted: "15/09/2026",
    status: "PENDING",
    documents: [
      { id: "DOC_5", name: "IELTS_Certificate.pdf", type: "CERTIFICATE", issueDate: "01/01/2025", url: "https://picsum.photos/400/300" }
    ]
  },
  {
    id: "TEACHER_003",
    name: "Lê Văn Cường",
    email: "cuong.le@gmail.com",
    phone: "0909 000 111",
    specialization: "Vật lý",
    experience: "3 năm kinh nghiệm",
    bio: "Giáo viên trẻ nhiệt huyết",
    workplace: "THPT Trần Đại Nghĩa",
    dateSubmitted: "10/09/2026",
    status: "VERIFIED",
    documents: []
  },
  {
    id: "TEACHER_004",
    name: "Trần Mai Phương",
    email: "phuong.tran@gmail.com",
    phone: "0933 444 555",
    specialization: "Hóa học",
    experience: "10 năm",
    bio: "Chuyên bồi dưỡng học sinh giỏi Hóa",
    workplace: "THPT Chuyên Lê Hồng Phong",
    dateSubmitted: "12/09/2026",
    status: "NEEDS_INFO",
    documents: []
  }
];
