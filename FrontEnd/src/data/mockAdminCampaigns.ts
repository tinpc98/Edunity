import type { ScholarshipCampaignAdmin, SponsorContributionAdmin, CampaignActivity } from "../types/admin";

export const mockAdminCampaigns: ScholarshipCampaignAdmin[] = [
  {
    id: "CAMP_2026_FALL",
    title: "Tiếp sức đến trường 2026 – Nuôi dưỡng tài năng THPT",
    description: "Chiến dịch hỗ trợ học sinh có hoàn cảnh khó khăn nhưng có thành tích học tập xuất sắc trong năm học 2026-2027.",
    status: "OPEN",
    targetBudget: 300000000,
    fundedAmount: 220000000,
    allocatedAmount: 150000000,
    usedAmount: 90000000,
    expectedSlots: 100,
    allocatedSlots: 50,
    awardPerStudent: 3000000,
    fundingStartDate: "01/08/2026",
    fundingEndDate: "31/12/2026",
    appStartDate: "15/08/2026",
    appEndDate: "15/10/2026",
    eligibility: ["Học sinh lớp 10, 11, 12", "Hoàn cảnh khó khăn", "Học lực Khá/Giỏi"],
    scope: ["Toán học", "Vật lý", "Hóa học", "Tiếng Anh"]
  },
  {
    id: "CAMP_2026_TECH",
    title: "Vươn tầm công nghệ 2026",
    description: "Học bổng chuyên biệt cho các học sinh yêu thích lập trình và tin học.",
    status: "DRAFT",
    targetBudget: 150000000,
    fundedAmount: 0,
    allocatedAmount: 0,
    usedAmount: 0,
    expectedSlots: 30,
    allocatedSlots: 0,
    awardPerStudent: 5000000,
    fundingStartDate: "01/10/2026",
    fundingEndDate: "31/12/2026",
    appStartDate: "01/11/2026",
    appEndDate: "30/11/2026",
    eligibility: ["Học sinh chuyên Tin"],
    scope: ["Tin học", "Lập trình"]
  }
];

export const mockCampaignContributions: SponsorContributionAdmin[] = [
  { id: "TX_FND_8821", sponsorName: "Quỹ Khát Vọng Tương Lai", amount: 100000000, date: "10/09/2026", status: "COMPLETED", campaignId: "CAMP_2026_FALL" },
  { id: "TX_FND_8845", sponsorName: "Cty Cổ phần Công nghệ F-Tech", amount: 50000000, date: "12/09/2026", status: "COMPLETED", campaignId: "CAMP_2026_FALL" },
  { id: "TX_FND_8898", sponsorName: "Cựu học sinh Chuyên KHTN", amount: 30000000, date: "14/09/2026", status: "COMPLETED", campaignId: "CAMP_2026_FALL" },
  { id: "TX_FND_8912", sponsorName: "Cộng đồng Giáo viên Edunity", amount: 40000000, date: "16/09/2026", status: "COMPLETED", campaignId: "CAMP_2026_FALL" },
];

export const mockCampaignActivity: CampaignActivity[] = [
  { id: "ACT_1", type: "ADMIN", action: "Đã tạo chiến dịch", date: "01/08/2026" },
  { id: "ACT_2", type: "SYSTEM", action: "Chiến dịch được mở tự động", date: "01/08/2026" },
  { id: "ACT_3", type: "SPONSOR", action: "Quỹ Khát Vọng Tương Lai đã tài trợ 100,000,000đ", date: "10/09/2026" },
  { id: "ACT_4", type: "ADMIN", action: "Đã phê duyệt 20 hồ sơ học bổng đợt 1", date: "15/09/2026" },
];
