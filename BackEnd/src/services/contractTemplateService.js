const pii = require("../utils/pii");

const TEMPLATE_VERSION = "EDUNITY-ECONTRACT-V1.0";
const CONTRACT_TYPE = "TEACHER_COOPERATION";
const CONTRACT_TITLE = "HỢP ĐỒNG CỘNG TÁC GIẢNG DẠY TRỰC TUYẾN";

// Revenue sharing terms are fixed by business rule: 90% Teacher / 10% Edunity
const REVENUE_SHARING_TERMS = Object.freeze({
  teacherSharePercent: 90,
  platformSharePercent: 10,
  currency: "VND",
  basisDescription:
    "Doanh thu đủ điều kiện thực tế mà Edunity thu được từ học phí của học viên đăng ký các lớp học/khóa học do Giáo viên giảng dạy, sau khi trừ các khoản hoàn học phí hợp lệ (nếu có) theo chính sách nền tảng.",
  settlementCycleDescription:
    "Đối soát định kỳ theo từng buổi học hoàn thành đạt chuẩn và quyết toán qua tài khoản ngân hàng chính chủ đã xác minh của Giáo viên trên hệ thống Edunity.",
});

const DEGREE_LABELS = {
  BACHELOR: "Cử nhân",
  MASTER: "Thạc sĩ",
  DOCTOR: "Tiến sĩ",
  ASSOCIATE: "Cao đẳng",
  OTHER: "Khác",
};

const GRADE_LABELS = {
  GRADE_6: "Lớp 6",
  GRADE_7: "Lớp 7",
  GRADE_8: "Lớp 8",
  GRADE_9: "Lớp 9",
  GRADE_10: "Lớp 10",
  GRADE_11: "Lớp 11",
  GRADE_12: "Lớp 12",
  UNIVERSITY_PREP: "Ôn thi Đại học",
};

/**
 * Loads configurable company information from environment variables without fabricating
 * unverified legal numbers or addresses.
 */
const getCompanyConfig = () => ({
  companyName:
    (process.env.EDUNITY_COMPANY_NAME || "").trim() || "Công ty TNHH Edunity",
  representativeName:
    (process.env.EDUNITY_COMPANY_REPRESENTATIVE || "").trim() || "Ông Phạm Công Tin",
  representativeTitle:
    (process.env.EDUNITY_COMPANY_REPRESENTATIVE_TITLE || "").trim() ||
    "Người đại diện theo pháp luật",
  taxCode:
    (process.env.EDUNITY_COMPANY_TAX_CODE || "").trim() ||
    "Đang cập nhật theo cấu hình hệ thống",
  address:
    (process.env.EDUNITY_COMPANY_ADDRESS || "").trim() ||
    "Đang cập nhật theo cấu hình hệ thống",
  email:
    (process.env.EDUNITY_COMPANY_EMAIL || "").trim() || "contact@edunity.edu.vn",
  phone:
    (process.env.EDUNITY_COMPANY_PHONE || "").trim() ||
    "Đang cập nhật theo cấu hình hệ thống",
  website:
    (process.env.EDUNITY_COMPANY_WEBSITE || "").trim() || "https://edunity.edu.vn",
});

const formatDateVN = (value) => {
  if (!value) return "Chưa cập nhật";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Chưa cập nhật";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTimeVN = (value) => {
  if (!value) return "Chưa cập nhật";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Chưa cập nhật";
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} ngày ${formatDateVN(d)}`;
};

/**
 * Builds the 9 standard clauses matching the reference teaching cooperation contract.
 */
const buildContractClauses = ({ company, teacher, revenueSharing, effectiveFrom, expiresAt }) => [
  {
    number: 1,
    title: "Điều 1. Mục đích và phạm vi hợp tác",
    paragraphs: [
      `1.1. Bên A (${company.companyName}) là đơn vị vận hành Nền tảng Kết nối Dạy và Học Trực tuyến Edunity. Bên B (${teacher.fullName}) là Giáo viên đã hoàn tất quy trình xác minh danh tính và năng lực chuyên môn trên hệ thống Edunity.`,
      "1.2. Hai bên thống nhất hợp tác triển khai các lớp học và khóa học trực tuyến (Live Session) trên nền tảng Edunity theo đúng chuyên môn, khối lớp và phạm vi giảng dạy mà Bên B đã được Bên A thẩm định và cấp quyền.",
      "1.3. Hợp đồng này quy định quyền, nghĩa vụ, nguyên tắc phân chia doanh thu, tiêu chuẩn chất lượng giảng dạy, bảo mật dữ liệu và quy trình ký kết hợp đồng điện tử nội bộ giữa Bên A và Bên B.",
    ],
  },
  {
    number: 2,
    title: "Điều 2. Quyền và trách nhiệm của Bên A (Công ty TNHH Edunity)",
    paragraphs: [
      "2.1. Cung cấp hạ tầng công nghệ, hệ thống quản lý lớp học, phòng học trực tuyến (Live Classroom), công cụ điểm danh, lưu trữ bản ghi buổi học và cổng thanh toán học phí cho Học viên.",
      "2.2. Thực hiện xét duyệt hồ sơ mở lớp, kiểm수 chương trình học (Syllabus), giám sát chất lượng buổi học và hỗ trợ kỹ thuật cho Giáo viên trong suốt thời gian hợp tác.",
      "2.3. Thu hộ học phí từ Học viên, thực hiện đối soát doanh thu minh bạch trên hệ thống và thanh toán phần doanh thu thuộc về Bên B theo đúng tỷ lệ và điều kiện quy định tại Điều 4 của Hợp đồng này.",
      "2.4. Có quyền tạm ngừng, thu hồi quyền mở lớp hoặc chấm dứt Hợp đồng nếu Bên B vi phạm quy chế giảng dạy, gian lận hồ sơ, bỏ tiết không lý do hoặc vi phạm pháp luật.",
    ],
  },
  {
    number: 3,
    title: "Điều 3. Quyền và trách nhiệm của Bên B (Giáo viên)",
    paragraphs: [
      "3.1. Cam kết toàn bộ thông tin nhân thân, căn cước công dân, bằng cấp, chứng chỉ chuyên môn và hồ sơ sư phạm đã cung cấp trên hệ thống Edunity là trung thực, chính xác và hợp pháp.",
      "3.2. Xây dựng kế hoạch giảng dạy, học liệu và trực tiếp đứng lớp đúng lịch trình, đúng thời lượng và đảm bảo chất lượng chuyên môn theo đề cương khóa học đã được phê duyệt.",
      "3.3. Tuân thủ quy định điểm danh, ghi hình buổi học phục vụ kiểm định chất lượng và giải quyết khiếu nại; ứng xử chuẩn mực sư phạm với Học viên và phụ huynh.",
      "3.4. Không tự ý chuyển nhượng tài khoản giảng viên, không thu học phí ngoài luồng hoặc điều hướng Học viên ra khỏi nền tảng Edunity dưới mọi hình thức.",
    ],
  },
  {
    number: 4,
    title: "Điều 4. Phân chia doanh thu và thanh toán",
    paragraphs: [
      `4.1. Tỷ lệ phân chia doanh thu chính thức giữa hai bên được cố định như sau:\n   • Bên B (Giáo viên) nhận: ${revenueSharing.teacherSharePercent}% (Chín mươi phần trăm) doanh thu đủ điều kiện thực tế mà Edunity thu được từ khóa học/lớp học của Giáo viên.\n   • Bên A (Edunity) nhận: ${revenueSharing.platformSharePercent}% (Mười phần trăm) trên cùng cơ sở doanh thu đủ điều kiện thực tế đó.`,
      `4.2. Cơ sở tính doanh thu đủ điều kiện: ${revenueSharing.basisDescription}`,
      "4.3. Các khoản điều chỉnh và hoàn phí: Trường hợp buổi học bị hủy do lỗi của Giáo viên, vi phạm thời lượng/chất lượng đã được xác nhận hoặc phát sinh hoàn tiền hợp lệ cho Học viên theo quy chế Edunity, khoản học phí tương ứng sẽ được điều chỉnh giảm trừ trước khi quyết toán.",
      `4.4. Đối soát và thanh toán: ${revenueSharing.settlementCycleDescription} Bên B chịu trách nhiệm kê khai và thực hiện nghĩa vụ thuế thu nhập cá nhân (nếu phát sinh) theo quy định pháp luật hiện hành.`,
    ],
  },
  {
    number: 5,
    title: "Điều 5. Nội dung khóa học và quyền sở hữu trí tuệ",
    paragraphs: [
      "5.1. Bên B bảo đảm các bài giảng, tài liệu, slide và học liệu do Bên B đăng tải lên Edunity thuộc quyền sở hữu hợp pháp hoặc quyền sử dụng hợp lệ của Bên B, không xâm phạm bản quyền của bất kỳ bên thứ ba nào.",
      "5.2. Bên B cấp cho Bên A quyền lưu trữ, hiển thị và phân phối học liệu, bản ghi buổi học (Recording) trong phạm vi nền tảng Edunity cho các Học viên đã đăng ký lớp học và phục vụ công tác kiểm định chất lượng nội bộ.",
    ],
  },
  {
    number: 6,
    title: "Điều 6. Bảo mật thông tin và bảo vệ dữ liệu cá nhân",
    paragraphs: [
      "6.1. Hai bên cam kết bảo mật thông tin kỹ thuật, dữ liệu vận hành, danh sách Học viên và các điều khoản tài chính của Hợp đồng này.",
      "6.2. Bên B chỉ được sử dụng thông tin của Học viên cho mục đích giảng dạy và hỗ trợ học tập trong phạm vi lớp học trên Edunity; tuyệt đối không tiết lộ, mua bán hoặc sử dụng dữ liệu cá nhân của Học viên cho mục đích thương mại riêng.",
      "6.3. Bên A cam kết bảo vệ dữ liệu định danh của Bên B bằng cơ chế mã hóa và kiểm soát truy cập theo chính sách bảo mật của nền tảng Edunity.",
    ],
  },
  {
    number: 7,
    title: "Điều 7. Thời hạn, tạm ngừng và chấm dứt hợp tác",
    paragraphs: [
      `7.1. Hợp đồng có thời hạn hiệu lực từ ngày ${formatDateVN(effectiveFrom)} đến hết ngày ${formatDateVN(expiresAt)}, kể từ thời điểm Bên B hoàn tất ký kết điện tử trên nền tảng Edunity.`,
      "7.2. Một bên có quyền đề nghị chấm dứt Hợp đồng trước thời hạn bằng thông báo trên hệ thống. Khi chấm dứt Hợp đồng, Bên B có trách nhiệm hoàn thành các lớp học đang giảng dạy dở dang hoặc phối hợp phương án bàn giao để bảo vệ quyền lợi Học viên.",
      "7.3. Bên A có quyền đơn phương chấm dứt Hợp đồng ngay lập tức nếu Bên B vi phạm nghiêm trọng quy định đạo đức nhà giáo, vi phạm kỷ luật giảng dạy nhiều lần hoặc cung cấp hồ sơ giả mạo.",
    ],
  },
  {
    number: 8,
    title: "Điều 8. Giải quyết tranh chấp",
    paragraphs: [
      "8.1. Mọi vướng mắc, khiếu nại hoặc tranh chấp phát sinh từ Hợp đồng này trước hết sẽ được hai bên ưu tiên giải quyết thông qua thương lượng, đối chiếu dữ liệu nhật ký hệ thống (Audit Log) và biên bản đối soát trên nền tảng Edunity.",
      "8.2. Trường hợp không đạt được thỏa thuận sau 30 (ba mươi) ngày kể từ ngày phát sinh tranh chấp, một trong hai bên có quyền đưa vụ việc ra Tòa án nhân dân có thẩm quyền tại Việt Nam để giải quyết theo quy định của pháp luật Việt Nam.",
    ],
  },
  {
    number: 9,
    title: "Điều 9. Hiệu lực và giao kết hợp đồng điện tử",
    paragraphs: [
      "9.1. Hợp đồng này được lập và giao kết dưới hình thức Hợp đồng điện tử nội bộ trên nền tảng Edunity. Việc Bên B đăng nhập bằng tài khoản đã xác thực, đọc toàn văn Hợp đồng, tích chọn xác nhận đồng ý và thực hiện thao tác ký điện tử trên Edunity là bằng chứng xác nhận ý chí giao kết hợp đồng của Bên B.",
      "9.2. Hệ thống Edunity tự động ghi nhận thời điểm ký, định danh tài khoản, chữ ký điện tử, nhật ký kiểm toán (Audit Log) và mã băm toàn vẹn tài liệu (SHA-256) của tệp PDF hợp đồng hoàn tất. Luồng ký này là cơ chế xác nhận hợp đồng điện tử nội bộ của Edunity, không phải dịch vụ chứng thực chữ ký số công cộng (CA-certified).",
      "9.3. Bản PDF hợp đồng hoàn tất sau khi ký được lưu trữ an toàn trên hệ thống Edunity, có mã xác minh hợp đồng và có giá trị ràng buộc thực hiện giữa Hai Bên kể từ thời điểm ký.",
    ],
  },
];

/**
 * Extracts and freezes the immutable Contract Snapshot from the current User/TeacherProfile document.
 */
const buildContractSnapshot = ({
  teacher,
  contractCode,
  verificationCode,
  effectiveFrom,
  expiresAt,
  createdAt = new Date(),
  adminId = null,
}) => {
  const profile = (teacher && teacher.teacherProfile) || {};
  const identity = profile.identity || null;
  const teaching = profile.teachingProfile || null;

  let addressMasked = null;
  if (identity && identity.addressEnc) {
    try {
      addressMasked = pii.maskAddress(pii.decrypt(identity.addressEnc));
    } catch {
      addressMasked = null;
    }
  }

  const idNumberLast4 = identity && identity.idNumberLast4 ? String(identity.idNumberLast4) : null;
  const idNumberMasked = idNumberLast4 ? `********${idNumberLast4}` : null;

  const subjects =
    teaching && Array.isArray(teaching.subjects) && teaching.subjects.length > 0
      ? [...teaching.subjects]
      : [];
  const gradeLevels =
    teaching && Array.isArray(teaching.gradeLevels) && teaching.gradeLevels.length > 0
      ? [...teaching.gradeLevels]
      : [];

  const degreeLabel =
    teaching && teaching.degree ? DEGREE_LABELS[teaching.degree] || teaching.degree : null;

  const specialtyParts = [];
  if (profile.qualificationSummary) specialtyParts.push(profile.qualificationSummary);
  if (degreeLabel) {
    specialtyParts.push(
      `${degreeLabel}${teaching.major ? ` - ${teaching.major}` : ""}${teaching.school ? ` (${teaching.school})` : ""}`
    );
  }
  if (subjects.length > 0) {
    specialtyParts.push(`Môn giảng dạy: ${subjects.join(", ")}`);
  }

  const company = getCompanyConfig();
  const teacherIdStr = teacher._id.toString();
  const teacherSnapshot = {
    teacherId: teacherIdStr,
    teacherCode: `TCH-${teacherIdStr.slice(-6).toUpperCase()}`,
    fullName: (identity && identity.fullName) || profile.fullName || "Giáo viên",
    email: teacher.email,
    phone: teacher.phone || profile.phone || null,
    dateOfBirth: (identity && identity.dateOfBirth) || null,
    idNumberLast4,
    idNumberMasked,
    idIssueDate: (identity && identity.issueDate) || null,
    idExpiryDate: (identity && identity.expiryDate) || null,
    addressMasked,
    qualificationSummary: profile.qualificationSummary || null,
    specialtySummary:
      specialtyParts.join(" · ") || "Theo hồ sơ chuyên môn đã xác minh trên Edunity",
    degree: (teaching && teaching.degree) || null,
    degreeLabel,
    major: (teaching && teaching.major) || null,
    school: (teaching && teaching.school) || null,
    yearsOfExperience:
      teaching && typeof teaching.yearsOfExperience === "number"
        ? teaching.yearsOfExperience
        : null,
    subjects,
    gradeLevels,
    gradeLevelLabels: gradeLevels.map((g) => GRADE_LABELS[g] || g),
    verificationStatus: profile.verificationStatus || "VERIFIED",
    verificationReviewedAt: profile.reviewedAt || createdAt,
    verificationReviewedBy: profile.reviewedBy ? profile.reviewedBy.toString() : adminId ? String(adminId) : null,
  };

  const clauses = buildContractClauses({
    company,
    teacher: teacherSnapshot,
    revenueSharing: REVENUE_SHARING_TERMS,
    effectiveFrom,
    expiresAt,
  });

  return {
    templateVersion: TEMPLATE_VERSION,
    contractType: CONTRACT_TYPE,
    contractTitle: CONTRACT_TITLE,
    contractCode,
    verificationCode,
    capturedAt: createdAt,
    effectiveFrom,
    expiresAt,
    company,
    teacher: teacherSnapshot,
    revenueSharing: { ...REVENUE_SHARING_TERMS },
    legalBasis: [
      "Căn cứ Bộ luật Dân sự nước Cộng hòa Xã hội Chủ nghĩa Việt Nam hiện hành;",
      "Căn cứ Luật Giao dịch điện tử nước Cộng hòa Xã hội Chủ nghĩa Việt Nam hiện hành;",
      "Căn cứ Quy chế hoạt động, Chính sách hợp tác giảng dạy của Nền tảng Edunity và kết quả thẩm định hồ sơ xác minh Giáo viên.",
    ],
    clauses,
  };
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Renders the personalized contract into a clean, print-ready Vietnamese business contract HTML document.
 */
const renderContractHtml = (contractSnapshot, signatureInfo = null, status = "PENDING_SIGNATURE") => {
  const snap = contractSnapshot || {};
  const company = snap.company || getCompanyConfig();
  const teacher = snap.teacher || {};
  const revenue = snap.revenueSharing || REVENUE_SHARING_TERMS;
  const clauses = Array.isArray(snap.clauses) ? snap.clauses : [];
  const legalBasis = Array.isArray(snap.legalBasis) ? snap.legalBasis : [];
  const isSigned = Boolean(signatureInfo && signatureInfo.signedAt) || status === "ACTIVE" || status === "SIGNED";

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(snap.contractTitle || CONTRACT_TITLE)} - ${escapeHtml(snap.contractCode)}</title>
  <style>
    body {
      font-family: "Times New Roman", Times, serif;
      color: #111827;
      line-height: 1.55;
      font-size: 13.5px;
      margin: 0;
      padding: 28px 36px;
      background: #ffffff;
    }
    .doc-container {
      max-width: 820px;
      margin: 0 auto;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .brand-title {
      font-size: 15px;
      font-weight: bold;
      color: #0f766e;
      text-transform: uppercase;
    }
    .brand-sub {
      font-size: 11.5px;
      color: #4b5563;
    }
    .motto {
      text-align: center;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 13px;
    }
    .motto-sub {
      text-align: center;
      font-weight: bold;
      font-size: 13px;
      text-decoration: underline;
    }
    .contract-title {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      color: #111827;
      margin: 18px 0 4px 0;
      text-transform: uppercase;
    }
    .contract-meta {
      text-align: center;
      font-size: 12.5px;
      color: #374151;
      margin-bottom: 16px;
    }
    .legal-basis {
      font-style: italic;
      margin-bottom: 14px;
      color: #1f2937;
    }
    .party-box {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 14px;
      background: #f9fafb;
    }
    .party-title {
      font-weight: bold;
      color: #0f766e;
      text-transform: uppercase;
      margin-bottom: 6px;
      font-size: 13.5px;
    }
    .party-grid {
      width: 100%;
      border-collapse: collapse;
    }
    .party-grid td {
      padding: 3px 6px 3px 0;
      vertical-align: top;
      font-size: 13px;
    }
    .party-label {
      width: 180px;
      color: #4b5563;
      font-weight: bold;
    }
    .revenue-highlight {
      border: 1.5px solid #0d9488;
      background: #f0fdfa;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 12px 0;
    }
    .clause-title {
      font-weight: bold;
      font-size: 14px;
      color: #0f766e;
      margin-top: 14px;
      margin-bottom: 6px;
    }
    .clause-p {
      margin: 5px 0;
      text-align: justify;
      white-space: pre-line;
    }
    .signature-section {
      margin-top: 26px;
      page-break-inside: avoid;
      width: 100%;
    }
    .signature-table {
      width: 100%;
      border-collapse: collapse;
    }
    .signature-cell {
      width: 50%;
      vertical-align: top;
      text-align: center;
      padding: 12px;
      border: 1px solid #e5e7eb;
    }
    .sig-stamp {
      display: inline-block;
      margin: 12px auto;
      padding: 8px 14px;
      border: 1.5px solid #0d9488;
      border-radius: 6px;
      background: #f0fdfa;
      color: #0f766e;
      font-size: 12px;
      font-weight: bold;
    }
    .sig-img {
      max-height: 70px;
      max-width: 220px;
      display: block;
      margin: 8px auto;
    }
    .footer-verify {
      margin-top: 22px;
      padding-top: 10px;
      border-top: 1px dashed #9ca3af;
      font-size: 11.5px;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="doc-container">
    <table class="header-table">
      <tr>
        <td style="width: 48%; vertical-align: top;">
          <div class="brand-title">${escapeHtml(company.companyName)}</div>
          <div class="brand-sub">Nền tảng Kết nối Dạy và Học Trực tuyến Edunity</div>
          <div class="brand-sub">Mã hợp đồng: <strong>${escapeHtml(snap.contractCode)}</strong></div>
        </td>
        <td style="width: 52%; vertical-align: top;">
          <div class="motto">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div class="motto-sub">Độc lập - Tự do - Hạnh phúc</div>
        </td>
      </tr>
    </table>

    <div class="contract-title">${escapeHtml(snap.contractTitle || CONTRACT_TITLE)}</div>
    <div class="contract-meta">
      Số: <strong>${escapeHtml(snap.contractCode)}</strong>
      &nbsp;|&nbsp; Ngày lập: <strong>${escapeHtml(formatDateVN(snap.capturedAt))}</strong>
      &nbsp;|&nbsp; Phiên bản mẫu: <strong>${escapeHtml(snap.templateVersion || TEMPLATE_VERSION)}</strong>
    </div>

    <div class="legal-basis">
      ${legalBasis.map((line) => `<div>- ${escapeHtml(line)}</div>`).join("")}
    </div>

    <div class="party-box">
      <div class="party-title">BÊN A: ${escapeHtml(company.companyName)}</div>
      <table class="party-grid">
        <tr><td class="party-label">Tên đơn vị:</td><td><strong>${escapeHtml(company.companyName)}</strong></td></tr>
        <tr><td class="party-label">Người đại diện:</td><td><strong>${escapeHtml(company.representativeName)}</strong> — Chức vụ: ${escapeHtml(company.representativeTitle)}</td></tr>
        <tr><td class="party-label">Mã số thuế:</td><td>${escapeHtml(company.taxCode)}</td></tr>
        <tr><td class="party-label">Địa chỉ trụ sở:</td><td>${escapeHtml(company.address)}</td></tr>
        <tr><td class="party-label">Email / Điện thoại:</td><td>${escapeHtml(company.email)} &nbsp;|&nbsp; ĐT: ${escapeHtml(company.phone)}</td></tr>
        <tr><td class="party-label">Website:</td><td>${escapeHtml(company.website)}</td></tr>
      </table>
    </div>

    <div class="party-box">
      <div class="party-title">BÊN B: GIÁO VIÊN CỘNG TÁC (${escapeHtml(teacher.fullName)})</div>
      <table class="party-grid">
        <tr><td class="party-label">Họ và tên:</td><td><strong>${escapeHtml(teacher.fullName)}</strong></td></tr>
        <tr><td class="party-label">Mã giáo viên (Teacher ID):</td><td>${escapeHtml(teacher.teacherCode || teacher.teacherId)} (${escapeHtml(teacher.teacherId)})</td></tr>
        <tr><td class="party-label">Ngày sinh:</td><td>${escapeHtml(teacher.dateOfBirth ? formatDateVN(teacher.dateOfBirth) : "Theo hồ sơ định danh đã xác minh")}</td></tr>
        <tr><td class="party-label">Số CCCD (Đã xác minh):</td><td>${escapeHtml(teacher.idNumberMasked || "Đã xác minh trên hệ thống")}</td></tr>
        <tr><td class="party-label">Địa chỉ liên hệ:</td><td>${escapeHtml(teacher.addressMasked || "Theo hồ sơ định danh đã xác minh")}</td></tr>
        <tr><td class="party-label">Email tài khoản:</td><td>${escapeHtml(teacher.email)}</td></tr>
        <tr><td class="party-label">Số điện thoại:</td><td>${escapeHtml(teacher.phone || "Theo thông tin tài khoản đăng ký")}</td></tr>
        <tr><td class="party-label">Chuyên môn giảng dạy:</td><td>${escapeHtml(teacher.specialtySummary || teacher.qualificationSummary || "Theo hồ sơ chuyên môn đã duyệt")}</td></tr>
      </table>
    </div>

    <div class="revenue-highlight">
      <strong>TÓM TẮT THỎA THUẬN PHÂN CHIA DOANH THU &amp; THỜI HẠN HỢP TÁC:</strong>
      <div>• <strong>Giáo viên (Bên B) nhận: ${escapeHtml(revenue.teacherSharePercent)}%</strong> doanh thu đủ điều kiện thực tế Edunity thu được từ khóa học/lớp học của Giáo viên.</div>
      <div>• <strong>Edunity (Bên A) nhận: ${escapeHtml(revenue.platformSharePercent)}%</strong> trên cùng cơ sở doanh thu đủ điều kiện thực tế đó.</div>
      <div>• <strong>Thời hạn hiệu lực:</strong> Từ ngày <strong>${escapeHtml(formatDateVN(snap.effectiveFrom))}</strong> đến ngày <strong>${escapeHtml(formatDateVN(snap.expiresAt))}</strong>.</div>
    </div>

    ${clauses
      .map(
        (clause) => `
      <div>
        <div class="clause-title">${escapeHtml(clause.title)}</div>
        ${(clause.paragraphs || []).map((p) => `<p class="clause-p">${escapeHtml(p)}</p>`).join("")}
      </div>`
      )
      .join("")}

    <div class="signature-section">
      <table class="signature-table">
        <tr>
          <td class="signature-cell">
            <div style="font-weight: bold; text-transform: uppercase;">ĐẠI DIỆN BÊN A</div>
            <div style="font-size: 12px; color: #4b5563;">${escapeHtml(company.companyName)}</div>
            <div class="sig-stamp">
              ĐÃ PHÊ DUYỆT &amp; PHÁT HÀNH ĐIỆN TỬ<br/>
              Hệ thống eContract Nội bộ Edunity<br/>
              Ngày phát hành: ${escapeHtml(formatDateVN(snap.capturedAt))}
            </div>
            <div style="font-weight: bold; margin-top: 6px;">${escapeHtml(company.representativeName)}</div>
            <div style="font-size: 12px; color: #4b5563;">${escapeHtml(company.representativeTitle)}</div>
          </td>
          <td class="signature-cell">
            <div style="font-weight: bold; text-transform: uppercase;">ĐẠI DIỆN BÊN B (GIÁO VIÊN)</div>
            <div style="font-size: 12px; color: #4b5563;">Ký xác nhận điện tử trên nền tảng Edunity</div>
            ${
              isSigned
                ? `
              ${
                signatureInfo && signatureInfo.signatureDataUrl
                  ? `<img class="sig-img" src="${escapeHtml(signatureInfo.signatureDataUrl)}" alt="Chữ ký giáo viên" />`
                  : ""
              }
              <div class="sig-stamp">
                ĐÃ KÝ XÁC NHẬN ĐIỆN TỬ NỘI BỘ<br/>
                Người ký: ${escapeHtml((signatureInfo && signatureInfo.signerName) || teacher.fullName)}<br/>
                Phương thức: ${escapeHtml((signatureInfo && signatureInfo.signingMethod) || "CLICK_TO_SIGN")}<br/>
                Thời điểm ký: ${escapeHtml(formatDateTimeVN(signatureInfo && signatureInfo.signedAt))}
              </div>`
                : `
              <div style="margin: 26px auto; padding: 14px; border: 1px dashed #9ca3af; border-radius: 6px; color: #6b7280; font-size: 12px; max-width: 240px;">
                ĐANG CHỜ GIÁO VIÊN KÝ XÁC NHẬN<br/>
                (Trạng thái: PENDING_SIGNATURE)
              </div>`
            }
            <div style="font-weight: bold; margin-top: 6px;">${escapeHtml(teacher.fullName)}</div>
            <div style="font-size: 12px; color: #4b5563;">Giáo viên cộng tác (${escapeHtml(teacher.email)})</div>
          </td>
        </tr>
      </table>
    </div>

    <div class="footer-verify">
      <div><strong>Mã hợp đồng:</strong> ${escapeHtml(snap.contractCode)} &nbsp;|&nbsp; <strong>Mã xác minh:</strong> ${escapeHtml(snap.verificationCode || "—")}</div>
      <div><em>Lưu ý minh bạch: Đây là hợp đồng điện tử được khởi tạo, ký xác nhận và kiểm tra toàn vẹn (SHA-256) nội bộ trên hệ thống Edunity phục vụ quy trình hợp tác giảng dạy, không phải chữ ký số được chứng thực bởi tổ chức CA công cộng.</em></div>
    </div>
  </div>
</body>
</html>`;
};

module.exports = {
  TEMPLATE_VERSION,
  CONTRACT_TYPE,
  CONTRACT_TITLE,
  REVENUE_SHARING_TERMS,
  getCompanyConfig,
  formatDateVN,
  formatDateTimeVN,
  buildContractClauses,
  buildContractSnapshot,
  renderContractHtml,
};
