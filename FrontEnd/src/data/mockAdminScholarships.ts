import type { ScholarshipApplicationAdmin } from "../types/admin";

export const mockAdminScholarships: ScholarshipApplicationAdmin[] = [
  {
    id: "APP-2026-001",
    studentName: "Nguyễn Văn An",
    grade: "Lớp 12",
    school: "THPT Chu Văn An, Hà Nội",
    email: "an.nguyenvan2009@gmail.com",
    phone: "0987 654 321",
    campaignId: "CAMP_2026_FALL",
    campaignTitle: "Tiếp sức đến trường 2026",
    awardAmount: 3000000,
    status: "SUBMITTED",
    submittedDate: "14/09/2026",
    reason: "Gia đình thuộc diện hộ cận nghèo tại Thôn Thượng, Bắc Từ Liêm. Bố em làm phụ hồ từ đó thu nhập bấp bênh, mẹ em bị thoái hóa khớp màn tính không thể lao động nặng.",
    familySituation: "Gia đình 4 người, thu nhập chính từ bố. Hoàn cảnh đặc biệt khó khăn.",
    learningGoal: "Mục tiêu đạt 8.5+ Toán trong kỳ thi THPT Quốc gia 2027 và đỗ ngành Khoa học Máy tính Đại học Bách Khoa.",
    additionalStatement: "Em cam kết tham gia đầy đủ 100% buổi học trực tuyến.",
    documents: [
      { id: "DOC_APP_1", name: "Giay_Xac_Nhan_Hoan_Canh.pdf", type: "PROOF_OF_POVERTY", url: "https://picsum.photos/400/300", verified: true },
      { id: "DOC_APP_2", name: "Hoc_Ba_Lop11_Scan.pdf", type: "TRANSCRIPT", url: "https://picsum.photos/400/300", verified: true },
      { id: "DOC_APP_3", name: "CCCD_NguyenVanAn_MatTruoc.jpg", type: "ID_CARD", url: "https://picsum.photos/400/300", verified: true },
      { id: "DOC_APP_4", name: "Giay_Khen_Hoc_Sinh_Gioi.pdf", type: "CERTIFICATE", url: "https://picsum.photos/400/300", verified: false }
    ]
  },
  {
    id: "APP-2026-002",
    studentName: "Trần Thị Mai",
    grade: "Lớp 11",
    school: "THPT Chuyên Thái Bình",
    email: "mai.tran@gmail.com",
    phone: "0911 222 333",
    campaignId: "CAMP_2026_FALL",
    campaignTitle: "Tiếp sức đến trường 2026",
    awardAmount: 3000000,
    status: "APPROVED",
    submittedDate: "10/09/2026",
    reason: "Mong muốn học giỏi môn Vật lý",
    familySituation: "Gia đình bình thường",
    learningGoal: "Học giỏi Vật lý",
    additionalStatement: "",
    documents: []
  },
  {
    id: "APP-2026-003",
    studentName: "Lê Quốc Bảo",
    grade: "Lớp 10",
    school: "THPT Nam Sách",
    email: "bao.le@gmail.com",
    phone: "0900 111 222",
    campaignId: "CAMP_2026_FALL",
    campaignTitle: "Tiếp sức đến trường 2026",
    awardAmount: 3000000,
    status: "NEED_MORE_INFORMATION",
    submittedDate: "15/09/2026",
    reason: "Đam mê Tiếng Anh",
    familySituation: "Khó khăn",
    learningGoal: "Thi IELTS",
    additionalStatement: "",
    documents: []
  }
];
