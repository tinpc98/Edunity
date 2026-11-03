/**
 * Realistic demo data for Edunity: wipes the target database and fills it with a coherent dataset
 * (accounts, catalog, classes, sessions, enrollments, payments, scholarships, reviews, messages...).
 *
 *   node scripts/seedDemo.js            show the target database and what it holds, change nothing
 *   node scripts/seedDemo.js --yes      back up every collection to ./backups, then wipe and seed
 *
 * Options: --no-backup (skip the backup), --allow-production (required when NODE_ENV=production).
 * Dates are relative to "now", so the data always looks current. Every number that the app derives
 * (class seats, campaign funds, scholarship balances, ratings, teacher earnings) is computed here the
 * same way the services compute it.
 */
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const models = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const storage = require("../src/services/storageService");

const {
  User, Category, Subject, Course, CourseProposal, Class, Session, SessionAttendance, Enrollment, Payment,
  Transaction, TeacherEarning, Payout, Review, ScholarshipCampaign, SponsorContribution, ScholarshipApplication,
  Scholarship, ScholarshipUsage, VerificationDocument, Notification, Conversation, Message, Report, AuditLog,
} = models;

const args = new Set(process.argv.slice(2));
const DEMO_PASSWORD = "Edunity@2026";
const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0.1;
const DAY = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MIN = parseInt(process.env.APP_TZ_OFFSET_MINUTES, 10) || 420; // schedule times are Vietnam wall-clock

// ---------------------------------------------------------------- helpers

// Deterministic randomness: the same run produces the same data shape
let seedState = 20261103;
const random = () => {
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + Math.floor(random() * (max - min + 1));
const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const id = () => new mongoose.Types.ObjectId();
const dec = (n) => mongoose.Types.Decimal128.fromString(String(Math.round(n)));
const num = (d) => (d === undefined || d === null ? 0 : Number(d.toString()));
const slugify = (text) =>
  text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const NOW = new Date();
// Vietnam calendar day `offset` days from today, at hh:mm local time
const vnAt = (offsetDays, hhmm = "00:00") => {
  const local = new Date(NOW.getTime() + TZ_OFFSET_MIN * 60000);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offsetDays, h, m) - TZ_OFFSET_MIN * 60000);
};
const vnDayOf = (date) => new Date(date.getTime() + TZ_OFFSET_MIN * 60000).getUTCDay();
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
const ago = (days, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3600000);

const minimalPdf = (lines) => {
  const text = lines.map((line, i) => `BT /F1 14 Tf 60 ${740 - i * 22} Td (${line.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((obj, i) => {
    const at = body.length;
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return at;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${body}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
};

// Private documents live on this machine's disk: the files are written so admins can open them here
const writePrivateFile = (userId, purpose, lines) => {
  const storageKey = `private/${userId}/${purpose}/${crypto.randomUUID()}.pdf`;
  const target = path.join(storage.getPublicDir(), "..", storageKey);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, minimalPdf(lines));
  return { side: "SINGLE", storageKey, mimeType: "application/pdf" };
};

const cover = (photo) => `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=800&q=80`;

// ---------------------------------------------------------------- reference data

const STAFF = [
  { key: "admin", email: "admin@example.com", note: "Quản trị hệ thống" },
  { key: "ops", email: "vanhanh@example.com", note: "Vận hành, duyệt hồ sơ" },
];

const TEACHERS = [
  { key: "duc", name: "Nguyễn Văn Đức", email: "duc.nguyen@example.com", status: "VERIFIED", summary: "Thạc sĩ Toán học (ĐH Sư phạm Hà Nội), 12 năm dạy Toán THPT", bio: "Giáo viên Toán THPT chuyên, nhiều năm ôn thi tốt nghiệp và đánh giá năng lực. Dạy chắc bản chất, luyện đề theo ma trận Bộ GD&ĐT." },
  { key: "lan", name: "Trần Thị Mai Lan", email: "mailan.tran@example.com", status: "VERIFIED", summary: "Cử nhân Sư phạm Ngữ văn, giáo viên THPT 9 năm", bio: "Chuyên nghị luận văn học và nghị luận xã hội. Hướng dẫn học sinh lập dàn ý, viết đoạn mạch lạc và tránh lỗi diễn đạt." },
  { key: "nam", name: "Lê Hoàng Nam", email: "hoangnam.le@example.com", status: "VERIFIED", summary: "Thạc sĩ Vật lý kỹ thuật, 8 năm luyện thi Vật lý", bio: "Giảng Vật lý bằng thí nghiệm mô phỏng và bài toán thực tế; chú trọng phương pháp giải nhanh trắc nghiệm." },
  { key: "chau", name: "Phạm Minh Châu", email: "minhchau.pham@example.com", status: "VERIFIED", summary: "IELTS 8.5, chứng chỉ CELTA, 7 năm luyện IELTS", bio: "Luyện IELTS 4 kỹ năng theo lộ trình cá nhân; chữa Writing và Speaking chi tiết theo band descriptors." },
  { key: "tuan", name: "Đặng Quốc Tuấn", email: "quoctuan.dang@example.com", status: "VERIFIED", summary: "Thạc sĩ Hóa học, giáo viên THPT 10 năm", bio: "Hệ thống hóa kiến thức Hóa theo chuyên đề, rèn kỹ năng giải bài tập tính toán và lý thuyết tổng hợp." },
  { key: "huong", name: "Võ Thị Thanh Hương", email: "thanhhuong.vo@example.com", status: "VERIFIED", summary: "Cử nhân Giáo dục Tiểu học, 11 năm đứng lớp", bio: "Dạy Toán tư duy và Tiếng Việt cho học sinh tiểu học bằng trò chơi và bài tập trực quan." },
  { key: "khoa", name: "Bùi Anh Khoa", email: "anhkhoa.bui@example.com", status: "VERIFIED", summary: "Kỹ sư phần mềm 6 năm, giảng viên lập trình cho trẻ em và người mới", bio: "Dạy Python và Scratch qua dự án nhỏ: game, ứng dụng và bài toán thực tế." },
  { key: "anh", name: "Hoàng Thị Ngọc Ánh", email: "ngocanh.hoang@example.com", status: "VERIFIED", summary: "Cử nhân Sư phạm Tiếng Anh, chứng chỉ TKT, 6 năm dạy THCS", bio: "Dạy ngữ pháp và từ vựng theo chủ điểm sách giáo khoa, luyện đề thi vào lớp 10 môn Tiếng Anh." },
  { key: "thinh", name: "Ngô Đức Thịnh", email: "ducthinh.ngo@example.com", status: "VERIFIED", summary: "Giáo viên Toán THCS, 10 năm luyện thi vào lớp 10", bio: "Chuyên Toán 8 và Toán 9, hệ thống dạng bài thi vào 10 các tỉnh phía Bắc." },
  { key: "trang", name: "Đỗ Thu Trang", email: "thutrang.do@example.com", status: "VERIFIED", summary: "JLPT N1, 5 năm làm việc tại Nhật, 4 năm dạy tiếng Nhật", bio: "Dạy tiếng Nhật sơ cấp cho người đi làm và du học sinh, tập trung giao tiếp và luyện thi JLPT." },
  { key: "long", name: "Trịnh Văn Long", email: "vanlong.trinh@example.com", status: "PENDING", summary: "Cử nhân Sư phạm Sinh học, 3 năm dạy THPT", bio: "Mới gửi hồ sơ xác minh, đang chờ duyệt." },
  { key: "han", name: "Lý Gia Hân", email: "giahan.ly@example.com", status: "REJECTED", summary: "Sinh viên năm 3 ngành Ngôn ngữ Anh", bio: "Hồ sơ bị từ chối do thiếu bằng cấp chuyên môn." },
  { key: "huy", name: "Phan Quang Huy", email: "quanghuy.phan@example.com", status: "UNVERIFIED", summary: null, bio: null },
];

// [name, grade] — grade null = university student or working adult
const STUDENTS = [
  ["Nguyễn Minh Anh", 12], ["Trần Gia Bảo", 12], ["Lê Khánh Linh", 12], ["Phạm Đức Huy", 12], ["Hoàng Thu Hà", 11],
  ["Vũ Tuấn Kiệt", 11], ["Đỗ Phương Thảo", 11], ["Bùi Quang Vinh", 11], ["Đặng Ngọc Diệp", 10], ["Ngô Hải Đăng", 10],
  ["Dương Bảo Ngọc", 10], ["Lý Thành Đạt", 10], ["Phan Thùy Dương", 9], ["Hồ Minh Khôi", 9], ["Mai Anh Thư", 9],
  ["Trịnh Hoàng Phúc", 9], ["Đinh Gia Hân", 8], ["Lâm Nhật Minh", 8], ["Tạ Khánh Vy", 8], ["Cao Đức Anh", 7],
  ["Châu Ngọc Hân", 7], ["Kiều Minh Quân", 6], ["Tô Bảo Châu", 5], ["Lưu Đăng Khoa", 5], ["Quách Tuệ Nhi", 4],
  ["Thái An Nhiên", 4], ["Hà Gia Huy", 3], ["La Minh Thư", 3], ["Nguyễn Hoàng Long", null], ["Trần Thị Thu Uyên", null],
  ["Lê Văn Hậu", null], ["Phạm Ngọc Trâm", null], ["Võ Đình Phong", null], ["Nguyễn Thanh Tâm", null],
  ["Vương Hải Yến", 12], ["Huỳnh Tấn Phát", 12], ["Trương Mỹ Linh", 11], ["Lục Văn Toàn", 11], ["Doãn Thảo Vy", 10],
  ["Âu Đức Mạnh", 10], ["Giang Thanh Trúc", 9], ["Mạc Quốc Bảo", 9], ["Ninh Hà Phương", 8], ["Thân Đức Duy", 8],
  ["Ông Bảo Trâm", 5], ["Khổng Minh Hiếu", 12], ["Bạch Thu Thủy", 12], ["Văn Đức Lộc", 12], ["Mã Ngọc Ánh", 12],
  ["Lò Văn Sơn", 11], ["Phùng Khánh Ngân", 11], ["Kim Thanh Hằng", 11], ["Nông Gia Khiêm", 11], ["Đoàn Thị Mỹ Duyên", null],
];

const SPONSORS = [
  { key: "hatmam", type: "ORGANIZATION", org: "Quỹ Khuyến học Hạt Mầm", rep: "Nguyễn Thị Hồng Nhung", email: "lienhe.hatmam@example.com", desc: "Quỹ cộng đồng hỗ trợ học phí cho học sinh có hoàn cảnh khó khăn tại các tỉnh miền Trung." },
  { key: "binhminh", type: "ORGANIZATION", org: "Công ty CP Công nghệ Bình Minh", rep: "Lê Quốc Bảo", email: "csr.binhminh@example.com", desc: "Chương trình trách nhiệm xã hội: tài trợ học bổng lập trình và ngoại ngữ cho học sinh THCS, THPT." },
  { key: "phuoc", type: "INDIVIDUAL", org: null, rep: "Nguyễn Hữu Phước", email: "huuphuoc.nguyen@example.com", desc: "Cựu học sinh muốn tiếp sức cho các em ôn thi tốt nghiệp." },
  { key: "ngoc", type: "INDIVIDUAL", org: null, rep: "Trần Bảo Ngọc", email: "baongoc.tran@example.com", desc: null },
];

// Names chosen so the backend recognises each category's grade group (utils/gradeLevel)
const CATEGORIES = [
  { key: "thpt", name: "Trung học phổ thông", slug: "trung-hoc-pho-thong", description: "Lớp 10 – 12: học chắc kiến thức và ôn thi tốt nghiệp THPT." },
  { key: "thcs", name: "Trung học cơ sở", slug: "trung-hoc-co-so", description: "Lớp 6 – 9: củng cố nền tảng và luyện thi vào lớp 10." },
  { key: "th", name: "Tiểu học", slug: "tieu-hoc", description: "Lớp 1 – 5: Toán tư duy, Tiếng Việt và Tiếng Anh thiếu nhi." },
  { key: "nn", name: "Ngoại ngữ", slug: "ngoai-ngu", description: "IELTS, tiếng Anh giao tiếp và tiếng Nhật cho mọi lứa tuổi." },
  { key: "it", name: "Tin học & Lập trình", slug: "tin-hoc-lap-trinh", description: "Lập trình Python, Scratch và tin học ứng dụng." },
];

const SUBJECTS = [
  ["thpt", "toan-thpt", "Toán THPT"], ["thpt", "van-thpt", "Ngữ văn THPT"], ["thpt", "anh-thpt", "Tiếng Anh THPT"],
  ["thpt", "ly-thpt", "Vật lý"], ["thpt", "hoa-thpt", "Hóa học"],
  ["thcs", "toan-thcs", "Toán THCS"], ["thcs", "van-thcs", "Ngữ văn THCS"], ["thcs", "anh-thcs", "Tiếng Anh THCS"], ["thcs", "khtn-thcs", "Khoa học tự nhiên"],
  ["th", "toan-th", "Toán Tiểu học"], ["th", "tiengviet-th", "Tiếng Việt"], ["th", "anh-th", "Tiếng Anh Tiểu học"],
  ["nn", "ielts", "IELTS"], ["nn", "giao-tiep", "Tiếng Anh giao tiếp"], ["nn", "tieng-nhat", "Tiếng Nhật"],
  ["it", "python", "Lập trình Python"], ["it", "scratch", "Scratch cho trẻ em"],
];

// key, subject, title, grade, level, topics (session titles)
const COURSES = [
  ["toan12", "toan-thpt", "Toán 12 – Ôn thi tốt nghiệp THPT", "GRADE_12", "ADVANCED", ["Ứng dụng đạo hàm khảo sát hàm số", "Cực trị và GTLN – GTNN", "Hàm số mũ và logarit", "Phương trình mũ, logarit", "Nguyên hàm", "Tích phân và ứng dụng", "Số phức", "Khối đa diện và thể tích", "Mặt nón, mặt trụ, mặt cầu", "Hệ trục tọa độ Oxyz", "Phương trình mặt phẳng", "Phương trình đường thẳng", "Xác suất – tổ hợp", "Luyện đề tổng hợp số 1", "Luyện đề tổng hợp số 2", "Chữa đề và rút kinh nghiệm"]],
  ["toan10", "toan-thpt", "Toán 10 – Nền tảng Đại số và Hình học", "GRADE_10", "BEGINNER", ["Mệnh đề và tập hợp", "Bất phương trình bậc nhất hai ẩn", "Hàm số bậc hai và đồ thị", "Dấu tam thức bậc hai", "Hệ thức lượng trong tam giác", "Vectơ và các phép toán", "Tọa độ trong mặt phẳng", "Phương trình đường thẳng", "Đường tròn trong mặt phẳng tọa độ", "Ôn tập học kỳ"]],
  ["van12", "van-thpt", "Ngữ văn 12 – Nghị luận văn học và xã hội", "GRADE_12", "INTERMEDIATE", ["Kỹ năng đọc hiểu văn bản", "Nghị luận xã hội 200 chữ", "Phân tích nhân vật", "Phân tích đoạn thơ", "So sánh văn học", "Tây Tiến – Quang Dũng", "Vợ chồng A Phủ – Tô Hoài", "Rừng xà nu – Nguyễn Trung Thành", "Luyện đề nghị luận văn học", "Chữa bài và sửa lỗi diễn đạt"]],
  ["anh12", "anh-thpt", "Tiếng Anh 12 – Luyện đề tốt nghiệp THPT", "GRADE_12", "ADVANCED", ["Ngữ âm và trọng âm", "Thì và sự hòa hợp", "Mệnh đề quan hệ", "Câu bị động và câu tường thuật", "Đọc điền từ", "Đọc hiểu chi tiết", "Từ vựng theo chủ đề", "Luyện đề số 1", "Luyện đề số 2", "Chiến thuật làm bài"]],
  ["ly11", "ly-thpt", "Vật lý 11 – Điện học và Dao động", "GRADE_11", "INTERMEDIATE", ["Dao động điều hòa", "Con lắc lò xo, con lắc đơn", "Sóng cơ", "Giao thoa sóng", "Điện tích, định luật Coulomb", "Điện trường", "Dòng điện không đổi", "Ôn tập chương"]],
  ["hoa12", "hoa-thpt", "Hóa học 12 – Hữu cơ và Vô cơ trọng tâm", "GRADE_12", "ADVANCED", ["Este – lipit", "Cacbohiđrat", "Amin, amino axit, protein", "Polime", "Đại cương kim loại", "Kim loại kiềm, kiềm thổ, nhôm", "Sắt và hợp chất", "Bài toán tổng hợp", "Luyện đề"]],
  ["toan9", "toan-thcs", "Toán 9 – Ôn thi vào lớp 10", "GRADE_9", "ADVANCED", ["Rút gọn biểu thức chứa căn", "Hệ phương trình", "Phương trình bậc hai và Vi-ét", "Giải bài toán bằng cách lập phương trình", "Đường tròn và tiếp tuyến", "Góc với đường tròn", "Tứ giác nội tiếp", "Bất đẳng thức cơ bản", "Đề thi thử số 1", "Đề thi thử số 2", "Đề thi thử số 3", "Chữa đề"]],
  ["van9", "van-thcs", "Ngữ văn 9 – Ôn thi vào lớp 10", "GRADE_9", "INTERMEDIATE", ["Đọc hiểu văn bản", "Nghị luận xã hội", "Truyện Kiều – Nguyễn Du", "Làng – Kim Lân", "Lặng lẽ Sa Pa", "Ánh trăng – Nguyễn Duy", "Luyện đề", "Chữa đề"]],
  ["toan8", "toan-thcs", "Toán 8 – Đa thức và Hình học phẳng", "GRADE_8", "INTERMEDIATE", ["Đa thức nhiều biến", "Hằng đẳng thức đáng nhớ", "Phân tích đa thức thành nhân tử", "Phân thức đại số", "Tứ giác", "Định lý Thalès", "Tam giác đồng dạng", "Ôn tập"]],
  ["anh8", "anh-thcs", "Tiếng Anh 8 – Ngữ pháp và Từ vựng trọng tâm", "GRADE_8", "BEGINNER", ["Leisure time", "Life in the countryside", "Teenagers", "Ethnic groups of Vietnam", "Our customs and traditions", "Lifestyles", "Environmental protection", "Ôn tập"]],
  ["khtn7", "khtn-thcs", "Khoa học tự nhiên 7 – Thí nghiệm và Thực hành", "GRADE_7", "BEGINNER", ["Nguyên tử và nguyên tố", "Bảng tuần hoàn", "Tốc độ chuyển động", "Âm thanh", "Ánh sáng", "Từ trường", "Trao đổi chất ở sinh vật", "Ôn tập"]],
  ["toan5", "toan-th", "Toán tư duy lớp 5", "GRADE_5", "INTERMEDIATE", ["Phân số và hỗn số", "Số thập phân", "Tỉ số phần trăm", "Hình tam giác, hình thang", "Hình tròn", "Thể tích hình hộp", "Toán chuyển động", "Ôn tập cuối năm"]],
  ["tv3", "tiengviet-th", "Tiếng Việt lớp 3 – Đọc hiểu và Viết đoạn", "GRADE_3", "BEGINNER", ["Đọc hiểu truyện ngắn", "Từ chỉ sự vật, hoạt động", "Câu kể, câu hỏi", "Viết đoạn văn tả đồ vật", "Viết đoạn văn kể việc làm", "Ôn tập"]],
  ["anh4", "anh-th", "Tiếng Anh lớp 4 – Cambridge Movers", "GRADE_4", "BEGINNER", ["My family", "At school", "Daily routines", "Animals", "Food and drink", "Mock test Movers"]],
  ["ielts", "ielts", "IELTS 6.5+ cấp tốc", null, "ADVANCED", ["Listening: Form & Map", "Reading: True/False/Not Given", "Writing Task 1: Line graph", "Writing Task 1: Process", "Writing Task 2: Opinion essay", "Speaking Part 1", "Speaking Part 2 – cue card", "Speaking Part 3", "Full mock test", "Chữa mock test"]],
  ["giaotiep", "giao-tiep", "Tiếng Anh giao tiếp cho người đi làm", null, "BEGINNER", ["Giới thiệu bản thân", "Email công việc", "Họp trực tuyến", "Thuyết trình ngắn", "Phỏng vấn xin việc", "Đàm phán cơ bản"]],
  ["n5", "tieng-nhat", "Tiếng Nhật sơ cấp N5", null, "BEGINNER", ["Bảng chữ Hiragana", "Bảng chữ Katakana", "Chào hỏi và tự giới thiệu", "Số đếm và thời gian", "Động từ thể ます", "Tính từ", "Trợ từ cơ bản", "Ôn luyện JLPT N5"]],
  ["python", "python", "Lập trình Python cơ bản", null, "BEGINNER", ["Cài đặt và biến", "Câu lệnh điều kiện", "Vòng lặp", "Hàm", "List và Dictionary", "Làm việc với file", "Dự án: quản lý chi tiêu", "Dự án: game đoán số"]],
  ["scratch", "scratch", "Scratch cho trẻ 8 – 12 tuổi", "GRADE_4", "BEGINNER", ["Làm quen Scratch", "Nhân vật và chuyển động", "Sự kiện và vòng lặp", "Biến và điểm số", "Dự án: game hứng táo", "Trình bày sản phẩm"]],
];

const COVERS = {
  toan12: "photo-1509228468518-180dd4864904", toan10: "photo-1635070041078-e363dbe005cb", van12: "photo-1455390582262-044cdead277a",
  anh12: "photo-1546410531-bb4caa6b424d", ly11: "photo-1636466497217-26a8cbeaf0aa", hoa12: "photo-1532187863486-abf9dbad1b69",
  toan9: "photo-1596495578065-6e0763fa1178", van9: "photo-1512820790803-83ca734da794", toan8: "photo-1453733190371-0a9bedd82893",
  anh8: "photo-1503676260728-1c00da094a0b", khtn7: "photo-1532094349884-543bc11b234d", toan5: "photo-1503676382389-4809596d5290",
  tv3: "photo-1497633762265-9d179a990aa6", anh4: "photo-1503454537195-1dcabb73ffb9", ielts: "photo-1434030216411-0b793f4b4173",
  giaotiep: "photo-1522202176988-66273c2fd55f", n5: "photo-1528164344705-47542687000d", python: "photo-1517694712202-14dd9538aa97",
  scratch: "photo-1515879218367-8466d910aaa4",
};

/**
 * Classes. start = days from today to the first day, weeks = duration, fill = active enrollments.
 * schedule: [dayOfWeek(0=CN), "HH:mm", "HH:mm"]
 */
const CLASSES = [
  { course: "toan12", teacher: "duc", name: "Toán 12 – Luyện đề 9+ (tối 2-4-6)", price: 2400000, capacity: 20, status: "IN_PROGRESS", start: -35, weeks: 12, fill: 16, schedule: [[1, "19:30", "21:00"], [3, "19:30", "21:00"], [5, "19:30", "21:00"]] },
  { course: "toan12", teacher: "duc", name: "Toán 12 – Tổng ôn cấp tốc (cuối tuần)", price: 1800000, capacity: 25, status: "OPEN", start: 6, weeks: 8, fill: 9, schedule: [[6, "08:00", "10:00"], [0, "08:00", "10:00"]] },
  { course: "toan10", teacher: "duc", name: "Toán 10 – Nền tảng vững chắc (đã kết thúc)", price: 1200000, capacity: 15, status: "COMPLETED", start: -95, weeks: 10, fill: 12, schedule: [[2, "18:00", "19:30"], [4, "18:00", "19:30"]] },
  { course: "van12", teacher: "lan", name: "Ngữ văn 12 – Viết nghị luận đạt điểm cao", price: 1500000, capacity: 18, status: "IN_PROGRESS", start: -20, weeks: 10, fill: 13, schedule: [[2, "19:30", "21:00"], [5, "19:30", "21:00"]] },
  { course: "van9", teacher: "lan", name: "Ngữ văn 9 – Chinh phục đề thi vào 10", price: 1100000, capacity: 15, status: "OPEN", start: 9, weeks: 8, fill: 6, schedule: [[6, "14:00", "15:30"]] },
  { course: "anh12", teacher: "chau", name: "Tiếng Anh 12 – Luyện đề 8+", price: 1600000, capacity: 20, status: "OPEN", start: 4, weeks: 8, fill: 11, schedule: [[1, "18:00", "19:30"], [4, "18:00", "19:30"]] },
  { course: "ielts", teacher: "chau", name: "IELTS 6.5+ cấp tốc – Khóa tháng 11", price: 3900000, capacity: 12, status: "IN_PROGRESS", start: -14, weeks: 8, fill: 10, schedule: [[2, "20:00", "21:30"], [4, "20:00", "21:30"], [6, "09:00", "10:30"]] },
  { course: "ielts", teacher: "chau", name: "IELTS 6.5+ – Khóa tháng 8 (đã kết thúc)", price: 3900000, capacity: 12, status: "COMPLETED", start: -100, weeks: 8, fill: 11, schedule: [[2, "20:00", "21:30"], [4, "20:00", "21:30"]] },
  { course: "ly11", teacher: "nam", name: "Vật lý 11 – Dao động và Sóng", price: 1300000, capacity: 15, status: "OPEN", start: 11, weeks: 8, fill: 5, schedule: [[3, "18:00", "19:30"], [6, "16:00", "17:30"]] },
  { course: "hoa12", teacher: "tuan", name: "Hóa 12 – Tổng ôn Hữu cơ", price: 1500000, capacity: 15, status: "IN_PROGRESS", start: -28, weeks: 9, fill: 12, schedule: [[1, "20:00", "21:30"], [4, "20:00", "21:30"]] },
  { course: "hoa12", teacher: "tuan", name: "Hóa 12 – Buổi học thử miễn phí", price: 0, capacity: 30, status: "OPEN", start: 3, weeks: 1, fill: 14, schedule: [[0, "19:00", "20:30"]] },
  { course: "toan9", teacher: "thinh", name: "Toán 9 – Luyện thi vào 10 (lớp nhỏ 6 bạn)", price: 1400000, capacity: 6, status: "OPEN", start: 5, weeks: 10, fill: 6, schedule: [[2, "18:30", "20:00"], [5, "18:30", "20:00"]] },
  { course: "toan9", teacher: "thinh", name: "Toán 9 – Ôn chắc kiến thức nền", price: 1100000, capacity: 18, status: "IN_PROGRESS", start: -10, weeks: 10, fill: 3, schedule: [[0, "15:00", "16:30"], [3, "18:30", "20:00"]] },
  { course: "toan8", teacher: "thinh", name: "Toán 8 – Hằng đẳng thức và Tam giác đồng dạng", price: 950000, capacity: 15, status: "PENDING_APPROVAL", start: 18, weeks: 8, fill: 0, schedule: [[1, "17:30", "19:00"]] },
  { course: "anh8", teacher: "anh", name: "Tiếng Anh 8 – Học chắc theo Unit", price: 900000, capacity: 15, status: "OPEN", start: 7, weeks: 8, fill: 7, schedule: [[2, "17:30", "19:00"], [4, "17:30", "19:00"]] },
  { course: "anh4", teacher: "anh", name: "Tiếng Anh lớp 4 – Cambridge Movers", price: 800000, capacity: 10, status: "IN_PROGRESS", start: -16, weeks: 6, fill: 5, schedule: [[6, "09:00", "10:00"], [0, "09:00", "10:00"]] },
  { course: "khtn7", teacher: "nam", name: "KHTN 7 – Học qua thí nghiệm", price: 850000, capacity: 15, status: "DRAFT", start: 25, weeks: 8, fill: 0, schedule: [[6, "10:00", "11:30"]] },
  { course: "toan5", teacher: "huong", name: "Toán tư duy lớp 5", price: 900000, capacity: 12, status: "OPEN", start: 8, weeks: 8, fill: 4, schedule: [[6, "08:30", "09:30"], [0, "08:30", "09:30"]] },
  { course: "tv3", teacher: "huong", name: "Tiếng Việt lớp 3 – Viết đoạn văn hay", price: 0, capacity: 20, status: "OPEN", start: 2, weeks: 3, fill: 3, schedule: [[0, "10:00", "11:00"]] },
  { course: "giaotiep", teacher: "chau", name: "Tiếng Anh giao tiếp nơi công sở", price: 1700000, capacity: 15, status: "CANCELLED", start: -5, weeks: 6, fill: 0, schedule: [[3, "20:00", "21:30"]], cancelled: 3 },
  { course: "n5", teacher: "trang", name: "Tiếng Nhật N5 – Khóa tối 3-5", price: 2200000, capacity: 15, status: "OPEN", start: 10, weeks: 12, fill: 6, schedule: [[2, "19:30", "21:00"], [4, "19:30", "21:00"]] },
  { course: "python", teacher: "khoa", name: "Python cơ bản – Từ số 0 đến dự án đầu tiên", price: 1900000, capacity: 15, status: "IN_PROGRESS", start: -21, weeks: 8, fill: 11, schedule: [[1, "20:00", "21:30"], [5, "20:00", "21:30"]] },
  { course: "python", teacher: "khoa", name: "Python cho học sinh – Workshop miễn phí", price: 0, capacity: 40, status: "OPEN", start: 1, weeks: 1, fill: 21, schedule: [[vnDayOf(vnAt(1)), "19:30", "21:00"]] },
  { course: "scratch", teacher: "khoa", name: "Scratch – Lập trình game cho bé", price: 1000000, capacity: 10, status: "REJECTED", start: 14, weeks: 6, fill: 0, schedule: [[6, "15:00", "16:00"]], reviewNote: "Mô tả lớp chưa nêu rõ yêu cầu thiết bị và độ tuổi phù hợp. Vui lòng bổ sung rồi gửi lại." },
];

const REVIEW_COMMENTS = {
  5: ["Thầy cô giảng rất dễ hiểu, em tiến bộ rõ sau mỗi buổi.", "Lớp ít người nên được hỏi bài thoải mái. Rất đáng tiền.", "Bài tập về nhà sát đề thi, chữa bài kỹ.", "Giáo viên nhiệt tình, trả lời tin nhắn nhanh.", "Học xong khóa em tự tin hơn hẳn khi làm đề."],
  4: ["Nội dung hay, mong có thêm buổi luyện đề.", "Giảng kỹ, đôi lúc hơi nhanh với em.", "Lớp tốt, chỉ mong ghi hình rõ hơn.", "Học hiệu quả, lịch học hợp lý."],
  3: ["Kiến thức ổn nhưng phần bài tập hơi ít.", "Tạm ổn, một số buổi bị trễ giờ."],
};

// ---------------------------------------------------------------- safety, backup, wipe

const describeTarget = (uri) => {
  try {
    const url = new URL(uri);
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return "(không đọc được URI)";
  }
};

const inventory = async (db) => {
  const collections = (await db.listCollections().toArray()).filter((c) => !c.name.startsWith("system."));
  const rows = [];
  for (const c of collections) rows.push([c.name, await db.collection(c.name).estimatedDocumentCount()]);
  return rows.sort((a, b) => b[1] - a[1]);
};

const backup = async (db, rows) => {
  const dir = path.join(__dirname, "..", "backups", NOW.toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  const { EJSON } = mongoose.mongo.BSON;
  for (const [name] of rows) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), EJSON.stringify(docs, null, 0, { relaxed: false }));
  }
  return dir;
};

// ---------------------------------------------------------------- seed

const seed = async () => {
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const docs = {};
  const add = (model, doc) => {
    (docs[model.modelName] = docs[model.modelName] || []).push(doc);
    return doc;
  };
  const audit = (admin, action, targetType, targetId, afterState, at) =>
    add(AuditLog, { actorAdminId: admin, action, targetType, targetId, afterState, createdAt: at });
  const notify = (userId, title, content, type, at, isRead = random() < 0.6) =>
    add(Notification, { userId, title, content, type, isRead, readAt: isRead ? addMinutes(at, between(5, 600)) : null, createdAt: at, updatedAt: at });

  // ---- accounts
  const staff = Object.fromEntries(
    STAFF.map((s) => [s.key, add(User, { _id: id(), email: s.email, passwordHash, role: "ADMIN", status: "ACTIVE", createdAt: ago(400) })])
  );
  const admin = staff.admin._id;
  const ops = staff.ops._id;

  const teachers = {};
  for (const t of TEACHERS) {
    const createdAt = ago(t.status === "UNVERIFIED" ? 1 : t.status === "PENDING" ? 4 : between(120, 380));
    const reviewed = ["VERIFIED", "REJECTED"].includes(t.status);
    teachers[t.key] = add(User, {
      _id: id(), email: t.email, passwordHash, role: "TEACHER", status: "ACTIVE", createdAt,
      teacherProfile: {
        fullName: t.name, biography: t.bio || undefined, qualificationSummary: t.summary || undefined, verificationStatus: t.status,
        reviewedBy: reviewed ? ops : null, reviewedAt: reviewed ? addMinutes(createdAt, 60 * 26) : null,
        reviewNote: t.status === "REJECTED" ? "Chưa có bằng tốt nghiệp hoặc chứng chỉ sư phạm. Vui lòng bổ sung văn bằng phù hợp." : null,
        ratingAverage: 0, ratingCount: 0,
      },
    });
    if (t.status !== "UNVERIFIED") {
      const docStatus = t.status === "VERIFIED" ? "APPROVED" : t.status;
      const uploadedAt = addMinutes(createdAt, 90);
      const owner = teachers[t.key]._id;
      add(VerificationDocument, {
        userId: owner, documentType: "IDENTITY", status: docStatus, uploadedAt, reviewedBy: reviewed ? ops : null, reviewedAt: reviewed ? addMinutes(uploadedAt, 60 * 24) : null,
        files: [
          { ...writePrivateFile(owner, "IDENTITY", ["CAN CUOC CONG DAN - MAT TRUOC", "Tai lieu mau cua du lieu demo"]), side: "FRONT" },
          { ...writePrivateFile(owner, "IDENTITY", ["CAN CUOC CONG DAN - MAT SAU", "Tai lieu mau cua du lieu demo"]), side: "BACK" },
        ],
      });
      add(VerificationDocument, {
        userId: owner, documentType: "QUALIFICATION", status: docStatus, uploadedAt, reviewedBy: reviewed ? ops : null, reviewedAt: reviewed ? addMinutes(uploadedAt, 60 * 24) : null,
        files: [writePrivateFile(owner, "QUALIFICATION", ["BANG TOT NGHIEP / CHUNG CHI", "Tai lieu mau cua du lieu demo"])],
      });
      if (reviewed) audit(ops, t.status === "VERIFIED" ? "TEACHER_VERIFIED" : "TEACHER_VERIFICATION_REJECTED", "User", owner, { verificationStatus: t.status }, addMinutes(createdAt, 60 * 26));
    }
  }

  const students = STUDENTS.map(([name, grade], index) => {
    const local = slugify(name).split("-");
    const email = `${local.slice(-1)[0]}.${local.slice(0, -1).join("")}${index < 9 ? "0" : ""}${index + 1}@example.com`;
    const age = grade ? grade + 6 : between(19, 31);
    const user = add(User, {
      _id: id(), email, passwordHash, role: "STUDENT", status: "ACTIVE", createdAt: ago(between(10, 300)),
      studentProfile: {
        fullName: name,
        dateOfBirth: new Date(Date.UTC(NOW.getUTCFullYear() - age, between(0, 11), between(1, 28))),
        bio: grade ? `Học sinh lớp ${grade}` : pick(["Sinh viên năm 2", "Nhân viên văn phòng", "Sinh viên năm cuối", "Kỹ sư phần mềm"]),
      },
    });
    return { user, grade };
  });
  // One suspended account, as on any real platform
  students[students.length - 1].user.status = "SUSPENDED";

  const sponsors = Object.fromEntries(
    SPONSORS.map((s) => [
      s.key,
      add(User, {
        _id: id(), email: s.email, passwordHash, role: "SPONSOR", status: "ACTIVE", createdAt: ago(between(60, 200)),
        sponsorProfile: { sponsorType: s.type, organizationName: s.org || undefined, representativeName: s.rep, description: s.desc || undefined },
      }),
    ])
  );

  // ---- catalog
  const categories = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, add(Category, { _id: id(), name: c.name, slug: c.slug, description: c.description, status: "ACTIVE", createdBy: admin, createdAt: ago(380) })])
  );
  const subjects = Object.fromEntries(
    SUBJECTS.map(([cat, slug, name]) => [
      slug,
      add(Subject, { _id: id(), categoryId: categories[cat]._id, categoryName: categories[cat].name, name, slug, status: "ACTIVE", createdBy: admin, createdAt: ago(375) }),
    ])
  );
  const courses = Object.fromEntries(
    COURSES.map(([key, subjectSlug, title, grade, level, topics]) => {
      const subject = subjects[subjectSlug];
      const category = Object.values(categories).find((c) => c._id.equals(subject.categoryId));
      return [
        key,
        add(Course, {
          _id: id(), subjectId: subject._id, subjectName: subject.name, categoryId: category._id, categoryName: category.name,
          title, slug: slugify(title), gradeLevel: grade, level, status: "ACTIVE", createdBy: admin, createdAt: ago(360),
          description: `Khóa ${title.toLowerCase()} gồm ${topics.length} chủ đề, học trực tuyến theo lớp nhỏ cùng giáo viên.`,
          learningObjectives: `Nắm vững ${topics.slice(0, 3).join(", ").toLowerCase()} và vận dụng vào bài tập, đề thi.`,
          syllabus: topics.map((topic, i) => `${i + 1}. ${topic}`).join("\n"),
          prerequisites: level === "BEGINNER" ? "Không yêu cầu kiến thức trước." : "Đã học chương trình lớp trước.",
          topics,
        }),
      ];
    })
  );

  // ---- course proposals (one approved into a real course)
  const approvedProposal = add(CourseProposal, {
    _id: id(), teacherId: teachers.khoa._id, categoryId: categories.it._id, subjectId: subjects.scratch._id,
    title: "Scratch cho trẻ 8 – 12 tuổi", level: "BEGINNER", gradeLevel: "GRADE_4", estimatedDuration: "6 tuần",
    description: "Khóa nhập môn lập trình kéo thả cho thiếu nhi.", status: "APPROVED", approvedCourseId: courses.scratch._id,
    reviewedBy: admin, reviewedAt: ago(200), reviewNote: "Đã duyệt và tạo khóa học.", createdAt: ago(210),
  });
  courses.scratch.sourceProposalId = approvedProposal._id;
  add(CourseProposal, {
    teacherId: teachers.nam._id, categoryId: categories.thpt._id, subjectId: subjects["ly-thpt"]._id, title: "Vật lý 12 – Vật lý hạt nhân và Lượng tử ánh sáng",
    level: "ADVANCED", gradeLevel: "GRADE_12", estimatedDuration: "8 tuần", description: "Chuyên đề cuối chương trình Vật lý 12.", status: "PENDING_REVIEW", createdAt: ago(3),
  });
  add(CourseProposal, {
    teacherId: teachers.trang._id, categoryId: categories.nn._id, subjectId: subjects["tieng-nhat"]._id, title: "Tiếng Nhật N4 – Ngữ pháp trung cấp",
    level: "INTERMEDIATE", estimatedDuration: "12 tuần", description: "Tiếp nối khóa N5.", status: "NEED_CHANGES", reviewedBy: admin, reviewedAt: ago(5),
    reviewNote: "Vui lòng bổ sung đề cương chi tiết từng tuần và tài liệu sử dụng.", createdAt: ago(9),
  });
  add(CourseProposal, {
    teacherId: teachers.lan._id, categoryId: categories.thcs._id, subjectId: subjects["van-thcs"]._id, title: "Văn mẫu lớp 6 chọn lọc",
    level: "BEGINNER", gradeLevel: "GRADE_6", description: "Tuyển tập văn mẫu.", status: "REJECTED", reviewedBy: admin, reviewedAt: ago(40),
    reviewNote: "Nội dung thiên về học thuộc văn mẫu, chưa phù hợp định hướng phát triển năng lực.", createdAt: ago(45),
  });

  // ---- classes and sessions
  const classes = [];
  for (const def of CLASSES) {
    const course = courses[def.course];
    const teacher = teachers[def.teacher];
    const startDate = vnAt(def.start);
    const endDate = vnAt(def.start + def.weeks * 7 - 1);
    const reviewed = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"].includes(def.status);
    const submittedAt = vnAt(def.start - 25);
    const cls = add(Class, {
      _id: id(), courseId: course._id, courseTitle: course.title, teacherId: teacher._id, teacherName: teacher.teacherProfile.fullName,
      categoryId: course.categoryId, subjectId: course.subjectId, gradeLevel: course.gradeLevel, className: def.name,
      description: `${course.description} Lịch học: ${def.schedule.map(([d, s, e]) => `${d === 0 ? "Chủ nhật" : `Thứ ${d + 1}`} ${s}–${e}`).join(", ")}. Sĩ số tối đa ${def.capacity} học viên, có ghi hình buổi học để xem lại.`,
      coverImage: cover(COVERS[def.course]), classType: def.price > 0 ? "PAID" : "FREE", price: dec(def.price), capacity: def.capacity, enrolledCount: 0,
      enrollmentStart: vnAt(def.start - 30), enrollmentEnd: vnAt(def.start + 6), startDate, endDate, status: def.status,
      schedule: def.schedule.map(([dayOfWeek, startTime, endTime]) => ({ dayOfWeek, startTime, endTime })),
      updatedBy: teacher._id, ratingAverage: 0, ratingCount: 0,
      reviewedBy: reviewed ? admin : null, reviewedAt: reviewed ? addMinutes(submittedAt, 60 * 20) : null,
      reviewNote: def.reviewNote || (reviewed ? "Lớp đáp ứng yêu cầu, đã duyệt." : null),
      createdAt: vnAt(def.start - 28),
    });
    classes.push({ def, cls, course, teacher, sessions: [], enrollments: [] });
    if (reviewed) audit(admin, def.status === "REJECTED" ? "CLASS_REJECTED" : "CLASS_APPROVED", "Class", cls._id, { status: def.status === "REJECTED" ? "REJECTED" : "OPEN" }, cls.reviewedAt);

    if (def.status === "DRAFT" || def.status === "REJECTED") continue;
    // Sessions from the weekly schedule, one per occurrence, in date order
    const topics = course.topics;
    let order = 0;
    for (let day = 0; day < def.weeks * 7 && order < Math.max(topics.length, def.weeks * def.schedule.length); day += 1) {
      const date = vnAt(def.start + day);
      for (const [dow, from, to] of def.schedule) {
        if (vnDayOf(date) !== dow) continue;
        order += 1;
        const startDatetime = vnAt(def.start + day, from);
        const endDatetime = vnAt(def.start + day, to);
        const done = endDatetime < NOW && def.status !== "CANCELLED";
        const topic = topics[(order - 1) % topics.length];
        const session = add(Session, {
          _id: id(), classId: cls._id, className: cls.className, teacherId: teacher._id, title: `Buổi ${order}: ${topic}`,
          description: `Nội dung: ${topic}. Chuẩn bị vở ghi và làm bài tập buổi trước.`,
          contents: [
            { title: `Bài giảng – ${topic}`, type: "LESSON", order: 1 },
            { title: "Phiếu bài tập về nhà", type: "ASSIGNMENT", order: 2, description: "Nộp trước buổi học tiếp theo." },
          ],
          startDatetime, endDatetime, meetingRoomId: `room_${cls._id}_${order}`,
          status: def.status === "CANCELLED" ? "CANCELLED" : done ? "COMPLETED" : "SCHEDULED",
          lifecycleState: def.status === "CANCELLED" ? "CANCELLED" : done ? "COMPLETED" : "SCHEDULED",
          roomState: def.status === "CANCELLED" ? "CANCELLED" : done ? "ENDED" : "NOT_OPEN",
          actualStartAt: done ? addMinutes(startDatetime, between(0, 3)) : null,
          actualEndAt: done ? addMinutes(endDatetime, between(-2, 6)) : null,
          endReason: def.status === "CANCELLED" ? "ADMIN_CANCELLED" : done ? "TEACHER_ENDED" : null,
          attendanceFinalizedAt: done ? addMinutes(endDatetime, 30) : null,
          // Recordings are hosted by the video provider: none exist in demo data
          recording: null,
        });
        cls.sessionDays = (cls.sessionDays || 0) + 1;
        classes[classes.length - 1].sessions.push(session);
      }
    }
  }

  // ---- scholarship campaigns, contributions, applications, scholarships
  const scopeIds = (...keys) => keys.map((k) => categories[k]._id);
  const campaigns = {
    vungbuoc: add(ScholarshipCampaign, {
      _id: id(), createdBy: admin, title: "Học bổng Vững bước đến trường 2026", status: "CLOSED",
      description: "Hỗ trợ học phí các lớp THCS và THPT cho học sinh có hoàn cảnh khó khăn trong năm học 2025 – 2026.",
      eligibilityCriteria: "Học sinh THCS, THPT thuộc hộ nghèo, cận nghèo hoặc có hoàn cảnh đặc biệt; có xác nhận của địa phương hoặc nhà trường.",
      scope: { categoryIds: scopeIds("thpt", "thcs"), subjectIds: [], courseIds: [] }, targetBudget: dec(30000000), expectedSlots: 15, awardAmountPerStudent: dec(1500000),
      fundingStart: ago(150), fundingEnd: ago(70), applicationStart: ago(120), applicationEnd: ago(80), createdAt: ago(155),
    }),
    tiepsuc: add(ScholarshipCampaign, {
      _id: id(), createdBy: admin, title: "Tiếp sức mùa thi tốt nghiệp THPT 2027", status: "OPEN_FOR_FUNDING",
      description: "Đồng hành cùng học sinh lớp 12 ôn thi tốt nghiệp: mỗi suất hỗ trợ trọn khóa luyện đề môn Toán, Văn hoặc Tiếng Anh.",
      eligibilityCriteria: "Học sinh lớp 12 năm học 2026 – 2027 có hoàn cảnh khó khăn, điểm trung bình học kỳ gần nhất từ 6.5 trở lên.",
      scope: { categoryIds: scopeIds("thpt"), subjectIds: [], courseIds: [] }, targetBudget: dec(40000000), expectedSlots: 20, awardAmountPerStudent: dec(2000000),
      fundingStart: ago(30), fundingEnd: vnAt(60), applicationStart: ago(15), applicationEnd: vnAt(21), createdAt: ago(32),
    }),
    laptrinh: add(ScholarshipCampaign, {
      _id: id(), createdBy: admin, title: "Lập trình cho em – Học kỳ II", status: "OPEN_FOR_FUNDING",
      description: "Tài trợ khóa Python và Scratch cho học sinh vùng sâu, vùng xa có đam mê công nghệ.",
      eligibilityCriteria: "Học sinh từ 9 đến 17 tuổi, có máy tính hoặc được nhà trường hỗ trợ thiết bị.",
      scope: { categoryIds: scopeIds("it"), subjectIds: [], courseIds: [] }, targetBudget: dec(18000000), expectedSlots: 12, awardAmountPerStudent: dec(1500000),
      fundingStart: ago(10), fundingEnd: vnAt(50), applicationStart: vnAt(12), applicationEnd: vnAt(40), createdAt: ago(12),
    }),
    ngoaingu: add(ScholarshipCampaign, {
      _id: id(), createdBy: admin, title: "Học bổng Ngoại ngữ hè 2027", status: "DRAFT",
      description: "Bản nháp: hỗ trợ học phí IELTS và tiếng Nhật cho sinh viên năm nhất.", scope: { categoryIds: scopeIds("nn"), subjectIds: [], courseIds: [] },
      targetBudget: dec(25000000), expectedSlots: 10, awardAmountPerStudent: dec(2500000), createdAt: ago(2),
    }),
  };
  Object.values(campaigns).forEach((c) => {
    c.fundedNum = 0;
    c.allocatedNum = 0;
    c.usedNum = 0;
    if (c.status !== "DRAFT") audit(admin, "CAMPAIGN_PUBLISHED", "ScholarshipCampaign", c._id, { status: "OPEN_FOR_FUNDING" }, addMinutes(c.createdAt, 120));
  });

  const contribute = (campaign, sponsor, amount, daysAgo, status = "COMPLETED") => {
    const at = ago(daysAgo);
    add(SponsorContribution, { campaignId: campaign._id, sponsorId: sponsor._id, amount: dec(amount), contributionStatus: status, paymentReference: `CTR-${crypto.randomUUID()}`, contributedAt: at, createdAt: at });
    if (status !== "COMPLETED") return;
    campaign.fundedNum += amount;
    add(Transaction, { transactionType: "SPONSOR_CONTRIBUTION", sourceUserId: sponsor._id, amount: dec(amount), status: "COMPLETED", createdAt: at });
    notify(sponsor._id, "Đóng góp thành công", `Cảm ơn bạn đã đóng góp ${amount.toLocaleString("vi-VN")}đ cho "${campaign.title}".`, "CONTRIBUTION_COMPLETED", at);
  };
  contribute(campaigns.vungbuoc, sponsors.hatmam, 15000000, 140);
  contribute(campaigns.vungbuoc, sponsors.binhminh, 10000000, 120);
  contribute(campaigns.vungbuoc, sponsors.phuoc, 3000000, 100);
  contribute(campaigns.tiepsuc, sponsors.hatmam, 12000000, 25);
  contribute(campaigns.tiepsuc, sponsors.phuoc, 5000000, 18);
  contribute(campaigns.tiepsuc, sponsors.ngoc, 2000000, 6);
  contribute(campaigns.tiepsuc, sponsors.ngoc, 3000000, 1, "PENDING");
  contribute(campaigns.laptrinh, sponsors.binhminh, 8000000, 8);
  contribute(campaigns.laptrinh, sponsors.phuoc, 1000000, 4, "FAILED");

  const studentAt = (grades) => students.filter((s) => s.grade !== null && grades.includes(s.grade));
  const scholarshipsByStudent = new Map();
  const apply = (campaign, student, status, daysAgo, statement, reviewNote) => {
    const submittedAt = ago(daysAgo);
    const reviewed = status !== "SUBMITTED";
    const reviewedAt = reviewed ? addMinutes(submittedAt, 60 * between(20, 70)) : null;
    const application = add(ScholarshipApplication, {
      _id: id(), campaignId: campaign._id, studentId: student.user._id, statement, status, submittedAt, createdAt: submittedAt,
      reviewedBy: reviewed ? ops : null, reviewedAt, reviewNote: reviewNote || null,
    });
    add(VerificationDocument, {
      userId: student.user._id, applicationId: application._id, documentType: "SCHOLARSHIP_PROOF", uploadedAt: submittedAt,
      status: status === "APPROVED" ? "APPROVED" : status === "REJECTED" ? "REJECTED" : "PENDING", reviewedBy: reviewed ? ops : null, reviewedAt,
      files: [writePrivateFile(student.user._id, "SCHOLARSHIP_PROOF", ["GIAY XAC NHAN HOAN CANH", student.user.studentProfile.fullName, "Tai lieu mau cua du lieu demo"])],
    });
    notify(student.user._id, "Đã nhận hồ sơ học bổng", `Hồ sơ cho "${campaign.title}" đã được gửi tới ban xét duyệt.`, "SCHOLARSHIP_APPLICATION_SUBMITTED", submittedAt);
    if (status === "APPROVED") {
      const award = num(campaign.awardAmountPerStudent);
      campaign.allocatedNum += award;
      const scholarship = add(Scholarship, {
        _id: id(), campaignId: campaign._id, applicationId: application._id, studentId: student.user._id,
        allocatedAmount: dec(award), remainingAmount: dec(award), remainingNum: award, validFrom: reviewedAt,
        expiresAt: new Date(reviewedAt.getTime() + 180 * DAY), status: "ACTIVE", createdAt: reviewedAt, campaign,
      });
      scholarshipsByStudent.set(student.user._id.toString(), scholarship);
      audit(ops, "SCHOLARSHIP_APPLICATION_APPROVED", "ScholarshipApplication", application._id, { status: "APPROVED", allocatedAmount: String(award) }, reviewedAt);
      notify(student.user._id, "Hồ sơ học bổng được duyệt", `Bạn được cấp học bổng ${award.toLocaleString("vi-VN")}đ từ "${campaign.title}".`, "SCHOLARSHIP_APPROVED", reviewedAt);
    } else if (status === "REJECTED") {
      notify(student.user._id, "Hồ sơ học bổng chưa được duyệt", reviewNote, "SCHOLARSHIP_REJECTED", reviewedAt);
    } else if (status === "NEED_MORE_INFORMATION") {
      notify(student.user._id, "Hồ sơ học bổng cần bổ sung", reviewNote, "SCHOLARSHIP_NEED_MORE_INFORMATION", reviewedAt, false);
    }
  };
  const STATEMENTS = [
    "Bố mẹ em làm nông, năm nay mất mùa nên gia đình gặp nhiều khó khăn. Em mong được hỗ trợ học phí để tiếp tục ôn thi.",
    "Em sống cùng bà nội, gia đình thuộc hộ cận nghèo. Em học khá môn Toán và muốn thi vào trường chuyên của tỉnh.",
    "Bố em bị tai nạn lao động, mẹ bán hàng nhỏ. Em mong có học bổng để theo kịp chương trình lớp 12.",
    "Nhà em ở xã vùng cao, việc đi học thêm rất khó khăn. Học trực tuyến giúp em không phải đi xa.",
    "Em là con thứ ba trong gia đình bốn anh chị em, bố mẹ làm công nhân. Em đặt mục tiêu đạt 8 điểm môn Tiếng Anh.",
  ];
  const [s12a, s12b, s12c, s12d] = studentAt([12]);
  const [s11a, s11b] = studentAt([11]);
  const [s9a, s9b, s9c] = studentAt([9]);
  const [s10a] = studentAt([10]);
  // Closed campaign: decided long ago
  apply(campaigns.vungbuoc, s9a, "APPROVED", 110, STATEMENTS[1]);
  apply(campaigns.vungbuoc, s9b, "APPROVED", 108, STATEMENTS[3]);
  apply(campaigns.vungbuoc, s11a, "APPROVED", 105, STATEMENTS[2]);
  apply(campaigns.vungbuoc, s10a, "REJECTED", 100, STATEMENTS[4], "Hồ sơ chưa có giấy xác nhận hộ cận nghèo của địa phương.");
  // Open campaign: a live review queue
  apply(campaigns.tiepsuc, s12a, "APPROVED", 12, STATEMENTS[0]);
  apply(campaigns.tiepsuc, s12b, "APPROVED", 10, STATEMENTS[2]);
  apply(campaigns.tiepsuc, s12c, "NEED_MORE_INFORMATION", 6, STATEMENTS[4], "Vui lòng bổ sung bảng điểm học kỳ I có xác nhận của nhà trường.");
  apply(campaigns.tiepsuc, s12d, "SUBMITTED", 2, STATEMENTS[3]);
  apply(campaigns.tiepsuc, s11b, "REJECTED", 8, STATEMENTS[1], "Chiến dịch dành cho học sinh lớp 12 năm học 2026 – 2027.");
  apply(campaigns.tiepsuc, s9c, "SUBMITTED", 1, STATEMENTS[0]);

  // ---- enrollments, payments, scholarship usage, earnings
  const LEVELS = [[1, 5], [6, 9], [10, 12]];
  const levelOf = (grade) => LEVELS.findIndex(([from, to]) => grade >= from && grade <= to);
  const takenByCourse = new Map();
  const isEligible = (entry, student) => {
    if ((takenByCourse.get(entry.course._id.toString()) || new Set()).has(student.user._id.toString())) return false;
    const grade = entry.course.gradeLevel;
    if (!grade || entry.course.categoryId.equals(categories.it._id)) return true; // languages / programming: anyone
    const g = Number(grade.replace("GRADE_", ""));
    if (student.grade === null) return false;
    return levelOf(student.grade) === levelOf(g) && Math.abs(student.grade - g) <= 1;
  };
  const activeStudents = students.filter((s) => s.user.status === "ACTIVE");
  const inScope = (scholarship, entry) => scholarship.campaign.scope.categoryIds.some((c) => c.equals(entry.course.categoryId));

  for (const entry of classes) {
    const { def, cls, course, teacher } = entry;
    if (def.fill === 0 && !def.cancelled) continue;
    const price = def.price;
    // Scholarship holders first, so their awards are actually used
    const pool = shuffle(activeStudents.filter((s) => isEligible(entry, s)));
    pool.sort((a, b) => Number(scholarshipsByStudent.has(b.user._id.toString())) - Number(scholarshipsByStudent.has(a.user._id.toString())));
    const chosen = pool.slice(0, def.fill + (def.cancelled || 0));
    const taken = takenByCourse.get(course._id.toString()) || new Set();
    chosen.forEach((student) => taken.add(student.user._id.toString()));
    takenByCourse.set(course._id.toString(), taken);

    chosen.forEach((student, index) => {
      const enrolledAt = new Date(Math.min(cls.enrollmentStart.getTime() + between(1, 20) * DAY + between(0, 23) * 3600000, NOW.getTime() - 3600000));
      let status;
      if (def.status === "CANCELLED") status = "CANCELLED";
      else if (def.status === "COMPLETED") status = "COMPLETED";
      else if (def.status === "OPEN" && price > 0 && index === chosen.length - 1 && def.fill > 4) status = "PENDING_PAYMENT";
      else status = "CONFIRMED";

      const scholarship = price > 0 && status !== "CANCELLED" && status !== "PENDING_PAYMENT" ? scholarshipsByStudent.get(student.user._id.toString()) : null;
      const useScholarship = scholarship && scholarship.remainingNum > 0 && scholarship.status === "ACTIVE" && inScope(scholarship, entry) && enrolledAt > scholarship.validFrom;
      const fromScholarship = useScholarship ? Math.min(scholarship.remainingNum, price) : 0;
      const fromPayment = price - fromScholarship;
      const paymentSource = price === 0 ? "FREE" : fromScholarship === 0 ? "DIRECT_PAYMENT" : fromPayment === 0 ? "SCHOLARSHIP" : "MIXED";

      const enrollment = add(Enrollment, {
        _id: id(), classId: cls._id, courseId: course._id, teacherId: teacher._id, studentId: student.user._id,
        enrollmentStatus: status, paymentSource, tuitionAmount: dec(price),
        amountPaidViaPayment: dec(["CONFIRMED", "COMPLETED"].includes(status) ? fromPayment : 0),
        amountPaidViaScholarship: dec(["CONFIRMED", "COMPLETED"].includes(status) ? fromScholarship : 0),
        enrolledAt, holdExpiresAt: status === "PENDING_PAYMENT" ? addMinutes(NOW, 15) : null, createdAt: enrolledAt,
      });
      entry.enrollments.push({ enrollment, student, status });
      if (["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"].includes(status)) cls.enrolledCount += 1;

      if (status === "PENDING_PAYMENT") {
        add(Payment, { enrollmentId: enrollment._id, payerUserId: student.user._id, gateway: "SANDBOX", gatewayReference: `SBX-${crypto.randomUUID()}`, amount: dec(price), paymentStatus: "PENDING", createdAt: NOW });
        return;
      }
      if (status === "CANCELLED") {
        notify(student.user._id, "Lớp học đã bị hủy", `Lớp "${cls.className}" đã bị hủy do không đủ học viên. Bạn chưa bị trừ tiền.`, "CLASS_CANCELLED", vnAt(def.start - 2));
        return;
      }

      const paidAt = addMinutes(enrolledAt, between(2, 40));
      if (fromPayment > 0) {
        // Some students fail a first attempt before paying, as with real cards and banking apps
        if (random() < 0.15) {
          add(Payment, { enrollmentId: enrollment._id, payerUserId: student.user._id, gateway: "SANDBOX", gatewayReference: `SBX-${crypto.randomUUID()}`, amount: dec(fromPayment), paymentStatus: "FAILED", createdAt: addMinutes(enrolledAt, 1) });
        }
        const payment = add(Payment, {
          _id: id(), enrollmentId: enrollment._id, payerUserId: student.user._id, gateway: "SANDBOX", gatewayReference: `SBX-${crypto.randomUUID()}`,
          amount: dec(fromPayment), paymentStatus: "COMPLETED", paidAt, createdAt: addMinutes(enrolledAt, 2),
        });
        add(Transaction, { transactionType: "ENROLLMENT_PAYMENT", sourceUserId: student.user._id, destinationUserId: teacher._id, relatedEnrollmentId: enrollment._id, relatedPaymentId: payment._id, amount: dec(fromPayment), status: "COMPLETED", createdAt: paidAt });
      }
      if (fromScholarship > 0) {
        const usage = add(ScholarshipUsage, { _id: id(), scholarshipId: scholarship._id, enrollmentId: enrollment._id, classId: cls._id, amount: dec(fromScholarship), usedAt: paidAt, status: "CONFIRMED", createdAt: paidAt });
        scholarship.remainingNum -= fromScholarship;
        scholarship.campaign.usedNum += fromScholarship;
        add(Transaction, { transactionType: "SCHOLARSHIP_USAGE", sourceUserId: student.user._id, destinationUserId: teacher._id, relatedEnrollmentId: enrollment._id, relatedScholarshipUsageId: usage._id, amount: dec(fromScholarship), status: "COMPLETED", createdAt: paidAt });
      }
      if (price > 0) {
        const commission = Math.round(price * COMMISSION_RATE);
        add(TeacherEarning, {
          _id: id(), teacherId: teacher._id, enrollmentId: enrollment._id, classId: cls._id, grossAmount: dec(price), commissionAmount: dec(commission),
          netAmount: dec(price - commission), netNum: price - commission, status: def.status === "COMPLETED" ? "PAID_OUT" : def.status === "IN_PROGRESS" ? "AVAILABLE" : "PENDING", createdAt: paidAt,
        });
      }
      notify(student.user._id, "Đăng ký lớp thành công", `Bạn đã đăng ký lớp "${cls.className}". Lịch học sẽ hiển thị trong mục Lịch học.`, "ENROLLMENT_CONFIRMED", paidAt);
    });

    // A cancelled class also leaves a cancelled seat in another class, and expired holds exist
    if (def.status === "OPEN" && price > 0 && def.fill >= 6) {
      const extra = pool.slice(chosen.length, chosen.length + 1)[0];
      if (extra) {
        const at = ago(between(2, 9));
        add(Enrollment, { classId: cls._id, courseId: course._id, teacherId: teacher._id, studentId: extra.user._id, enrollmentStatus: "EXPIRED", paymentSource: "DIRECT_PAYMENT", tuitionAmount: dec(price), enrolledAt: at, holdExpiresAt: null, createdAt: at });
      }
    }
  }

  // Scholarship balances after usage
  for (const scholarship of scholarshipsByStudent.values()) {
    scholarship.remainingAmount = dec(scholarship.remainingNum);
    if (scholarship.remainingNum <= 0) scholarship.status = "EXHAUSTED";
    else if (scholarship.expiresAt < NOW) scholarship.status = "EXPIRED";
  }
  for (const campaign of Object.values(campaigns)) {
    campaign.fundedAmount = dec(campaign.fundedNum);
    campaign.allocatedAmount = dec(campaign.allocatedNum);
    campaign.usedAmount = dec(campaign.usedNum);
  }

  // ---- payouts for finished classes
  const paidOut = (docs.TeacherEarning || []).filter((e) => e.status === "PAID_OUT");
  const BANKS = ["Vietcombank", "Techcombank", "BIDV", "VietinBank", "MB Bank", "ACB"];
  for (const teacherId of [...new Set(paidOut.map((e) => e.teacherId.toString()))]) {
    const teacher = Object.values(teachers).find((t) => t._id.toString() === teacherId);
    const earnings = paidOut.filter((e) => e.teacherId.toString() === teacherId);
    const total = earnings.reduce((sum, e) => sum + e.netNum, 0);
    const requestedAt = ago(8);
    const payout = add(Payout, {
      _id: id(), teacherId: teacher._id, amount: dec(total), status: "COMPLETED", payoutMethod: "BANK_TRANSFER",
      bankAccountSnapshot: { bankName: pick(BANKS), accountNumber: `0${between(100000000, 999999999)}${between(10, 99)}`, accountHolderName: slugify(teacher.teacherProfile.fullName).replace(/-/g, " ").toUpperCase() },
      requestedAt, processedAt: addMinutes(requestedAt, 60 * 30), processedBy: admin, createdAt: requestedAt,
    });
    earnings.forEach((e) => (e.payoutId = payout._id));
    add(Transaction, { transactionType: "TEACHER_PAYOUT", sourceUserId: admin, destinationUserId: teacher._id, amount: dec(total), status: "COMPLETED", createdAt: payout.processedAt });
    notify(teacher._id, "Đã chuyển khoản thu nhập", `Edunity đã chuyển ${total.toLocaleString("vi-VN")}đ vào tài khoản của bạn.`, "PAYOUT_COMPLETED", payout.processedAt);
  }

  // ---- attendance for finished sessions
  for (const entry of classes) {
    const attendees = entry.enrollments.filter((e) => ["CONFIRMED", "COMPLETED"].includes(e.status));
    for (const session of entry.sessions.filter((s) => s.status === "COMPLETED")) {
      const duration = (session.endDatetime - session.startDatetime) / 1000;
      for (const { student } of attendees) {
        const roll = random();
        const attendanceStatus = roll < 0.84 ? "PRESENT" : roll < 0.93 ? "LATE" : roll < 0.97 ? "ABSENT" : "EXCUSED";
        const late = attendanceStatus === "LATE" ? between(6, 20) * 60 : 0;
        const present = ["PRESENT", "LATE"].includes(attendanceStatus);
        const online = present ? Math.max(0, duration - late - between(0, 300)) : 0;
        add(SessionAttendance, {
          sessionId: session._id, classId: entry.cls._id, studentId: student.user._id, attendanceStatus,
          joinedAt: present ? new Date(session.startDatetime.getTime() + late * 1000 - between(0, 4) * 60000) : null,
          leftAt: present ? addMinutes(session.endDatetime, between(-3, 2)) : null,
          hasVerifiedConnection: present, isLate: attendanceStatus === "LATE", lateArrivalSeconds: late,
          rawOnlineSeconds: online, scheduledDurationSeconds: duration, scheduledOnlineSeconds: online,
          attendancePercentage: present ? Math.min(100, Math.round((online / duration) * 100)) : 0,
          evaluationStatus: attendanceStatus === "EXCUSED" ? "EXCUSED" : "FINALIZED", finalizedAt: session.attendanceFinalizedAt,
        });
      }
    }
  }

  // ---- reviews, then ratings derived from them
  for (const entry of classes) {
    const finished = entry.def.status === "COMPLETED";
    const started = entry.sessions.some((s) => s.status === "COMPLETED");
    if (!finished && !started) continue;
    for (const { enrollment, student, status } of entry.enrollments) {
      if (!["CONFIRMED", "COMPLETED"].includes(status) || random() > (finished ? 0.75 : 0.35)) continue;
      const roll = random();
      const rating = roll < 0.62 ? 5 : roll < 0.9 ? 4 : 3;
      const at = finished ? addMinutes(entry.cls.endDate, 60 * between(10, 200)) : ago(between(1, 6));
      add(Review, { enrollmentId: enrollment._id, studentId: student.user._id, teacherId: entry.teacher._id, classId: entry.cls._id, rating, comment: pick(REVIEW_COMMENTS[rating]), createdAt: at });
    }
  }
  const reviews = docs.Review || [];
  const avg = (list) => (list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 100) / 100 : 0);
  for (const { cls } of classes) {
    const own = reviews.filter((r) => r.classId.equals(cls._id));
    cls.ratingAverage = avg(own);
    cls.ratingCount = own.length;
  }
  for (const teacher of Object.values(teachers)) {
    const own = reviews.filter((r) => r.teacherId.equals(teacher._id));
    teacher.teacherProfile.ratingAverage = avg(own);
    teacher.teacherProfile.ratingCount = own.length;
  }

  // ---- upcoming-session reminders
  for (const entry of classes.filter((e) => e.def.status === "IN_PROGRESS")) {
    const next = entry.sessions.find((s) => s.status === "SCHEDULED");
    if (!next) continue;
    for (const { student, status } of entry.enrollments.filter((e) => e.status === "CONFIRMED").slice(0, 6)) {
      add(Notification, {
        userId: student.user._id, title: "Sắp đến giờ học", content: `${next.title} – lớp "${entry.cls.className}" bắt đầu lúc ${new Date(next.startDatetime.getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(11, 16)}.`,
        type: "SESSION_REMINDER", sessionId: next._id, dedupeKey: `reminder:${next._id}`, isRead: false, createdAt: ago(0, 2), updatedAt: ago(0, 2),
      });
    }
  }

  // ---- conversations between students and their teachers
  const THREADS = [
    ["Thầy ơi, buổi trước em chưa hiểu phần cực trị hàm số, thầy có thể gửi thêm bài tập không ạ?", "Thầy gửi em phiếu 20 câu trong mục tài liệu buổi 3 nhé. Chỗ nào chưa rõ em hỏi trong buổi tới.", "Dạ em cảm ơn thầy ạ!"],
    ["Cô ơi em xin phép nghỉ buổi thứ 6 vì em đi thi học sinh giỏi ạ.", "Ừ em, cô ghi nhận. Em xem lại bản ghi và làm bài tập buổi đó nhé."],
    ["Chị ơi bài Writing Task 2 của em được band mấy ạ?", "Khoảng 6.0 em nhé. Em cần phát triển ý ở đoạn thân bài thứ hai rõ hơn, chị đã ghi chú chi tiết trong bài.", "Em sửa lại và nộp vào thứ 5 được không ạ?", "Được em, chị chữa trước buổi học."],
    ["Thầy ơi máy em cài Python bị lỗi PATH ạ.", "Em chạy lại bộ cài và tick vào ô Add Python to PATH nhé. Nếu vẫn lỗi em chụp màn hình gửi thầy."],
  ];
  const withStudents = classes.filter((e) => ["IN_PROGRESS"].includes(e.def.status) && e.enrollments.length);
  withStudents.slice(0, THREADS.length).forEach((entry, i) => {
    const student = entry.enrollments.find((e) => e.status === "CONFIRMED").student.user;
    const conversation = add(Conversation, { _id: id(), classId: entry.cls._id, participantIds: [student._id, entry.teacher._id], createdAt: ago(6 - i) });
    let at = ago(6 - i, 3);
    THREADS[i].forEach((content, j) => {
      at = addMinutes(at, between(8, 180));
      add(Message, { conversationId: conversation._id, senderId: j % 2 === 0 ? student._id : entry.teacher._id, content, createdAt: at, updatedAt: at });
    });
    conversation.lastMessagePreview = THREADS[i][THREADS[i].length - 1].slice(0, 100);
    conversation.lastMessageAt = at;
  });

  // ---- complaints
  const complaintClass = classes.find((e) => e.def.course === "hoa12" && e.def.status === "IN_PROGRESS");
  const complainer = complaintClass.enrollments[0].student.user;
  add(Report, { reporterId: complainer._id, classId: complaintClass.cls._id, reportedUserId: complaintClass.teacher._id, type: "TEACHER_ABSENT", status: "RESOLVED",
    description: "Buổi học tối thứ 2 giáo viên vào muộn 25 phút mà không báo trước.", reviewedBy: ops, reviewedAt: ago(3), reviewNote: "Đã nhắc nhở giáo viên và bổ sung 30 phút vào buổi học sau.", createdAt: ago(5) });
  add(Report, { reporterId: students[5].user._id, type: "PAYMENT_DISPUTE", status: "IN_REVIEW", description: "Em bị trừ tiền hai lần khi đăng ký lớp, nhờ admin kiểm tra giúp.", reviewedBy: ops, reviewedAt: ago(0, 20), createdAt: ago(1) });
  add(Report, { reporterId: teachers.lan._id, reportedUserId: students[students.length - 1].user._id, type: "INAPPROPRIATE_BEHAVIOR", status: "RESOLVED",
    description: "Học viên gửi tin nhắn quảng cáo nhiều lần trong giờ học.", reviewedBy: admin, reviewedAt: ago(14), reviewNote: "Đã tạm khóa tài khoản học viên.", createdAt: ago(15) });
  add(Report, { reporterId: students[8].user._id, classId: classes[0].cls._id, type: "TEACHING_QUALITY", status: "OPEN", description: "Âm thanh buổi học bị rè, khó nghe phần cuối.", createdAt: ago(0, 5) });

  // Strip the helper-only fields before writing
  const helperFields = ["topics", "remainingNum", "fundedNum", "allocatedNum", "usedNum", "netNum", "campaign", "sessionDays"];
  for (const list of Object.values(docs)) list.forEach((doc) => helperFields.forEach((f) => delete doc[f]));
  return docs;
};

// ---------------------------------------------------------------- main

const main = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (process.env.NODE_ENV === "production" && !args.has("--allow-production")) {
    throw new Error("NODE_ENV=production: refusing to wipe without --allow-production");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  const before = await inventory(db);
  console.log(`\nCơ sở dữ liệu đích: ${describeTarget(uri)}  (db = ${db.databaseName})`);
  console.log(`Hiện có ${before.reduce((s, [, n]) => s + n, 0)} document trong ${before.length} collection:`);
  console.log("  " + (before.map(([n, c]) => `${n}: ${c}`).join(", ") || "(trống)"));

  if (!args.has("--yes")) {
    console.log("\nChưa thay đổi gì. Chạy lại với --yes để sao lưu, xóa toàn bộ và nạp dữ liệu demo.\n");
    return;
  }

  if (before.length && !args.has("--no-backup")) {
    console.log(`\nĐã sao lưu vào ${path.relative(process.cwd(), await backup(db, before))}`);
  }
  for (const [name] of before) await db.collection(name).deleteMany({});
  console.log("Đã xóa toàn bộ dữ liệu.");

  for (const model of Object.values(models)) await model.init();
  const docs = await seed();
  const ORDER = Object.keys(models);
  for (const name of ORDER) {
    const list = docs[name];
    if (list && list.length) await models[name].insertMany(list, { ordered: true });
  }

  const after = await inventory(db);
  console.log(`\nĐã nạp ${after.reduce((s, [, n]) => s + n, 0)} document:`);
  console.log("  " + after.map(([n, c]) => `${n}: ${c}`).join(", "));
  console.log(`\nMật khẩu chung cho mọi tài khoản demo: ${DEMO_PASSWORD}`);
  console.log("  Admin:        admin@example.com, vanhanh@example.com");
  console.log("  Giáo viên:    duc.nguyen@example.com (đã xác minh), vanlong.trinh@example.com (chờ duyệt), quanghuy.phan@example.com (chưa nộp hồ sơ)");
  console.log(`  Học viên:     ${docs.User.filter((u) => u.role === "STUDENT").slice(0, 3).map((u) => u.email).join(", ")}, ...`);
  console.log("  Nhà tài trợ:  lienhe.hatmam@example.com, huuphuoc.nguyen@example.com\n");
};

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error("Seed thất bại:", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
