import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Input, Button, Collapse, Empty, Alert, Tag } from "antd";
import {
  SearchOutlined,
  QuestionCircleOutlined,
  MailOutlined,
  CustomerServiceOutlined,
  InfoCircleOutlined,
  BookOutlined,
  WalletOutlined,
  VideoCameraOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
  ClearOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { ROUTES } from "../../routes/routePaths";

interface FaqItem {
  id: string;
  category: "ACCOUNT" | "ENROLLMENT" | "PAYMENT" | "CLASSROOM" | "TEACHER" | "SCHOLARSHIP";
  categoryLabel: string;
  question: string;
  answer: string;
  highlights?: string[];
}

const FAQ_DATA: FaqItem[] = [
  // NHÓM 1: TÀI KHOẢN
  {
    id: "faq-acc-1",
    category: "ACCOUNT",
    categoryLabel: "Tài khoản",
    question: "Làm thế nào để đăng ký tài khoản trên Edunity?",
    answer: "Bạn có thể đăng ký tài khoản nhanh chóng bằng cách bấm nút 'Đăng ký miễn phí' trên góc phải màn hình hoặc truy cập trang /register. Điền họ tên, địa chỉ email, số điện thoại và mật khẩu. Bạn có thể chọn vai trò là Học sinh, Giáo viên hoặc Nhà tài trợ tùy theo nhu cầu sử dụng.",
  },
  {
    id: "faq-acc-2",
    category: "ACCOUNT",
    categoryLabel: "Tài khoản",
    question: "Quên mật khẩu phải làm sao để lấy lại?",
    answer: "Tại trang Đăng nhập (/login), hãy bấm vào liên kết 'Quên mật khẩu'. Nhập địa chỉ email mà bạn đã đăng ký với Edunity. Hệ thống sẽ gửi email hướng dẫn kèm liên kết an toàn để bạn thiết lập lại mật khẩu mới.",
  },
  {
    id: "faq-acc-3",
    category: "ACCOUNT",
    categoryLabel: "Tài khoản",
    question: "Làm thế nào để cập nhật thông tin hồ sơ cá nhân?",
    answer: "Sau khi đăng nhập, bấm vào biểu tượng Avatar ở góc phải trên cùng và chọn trang 'Hồ sơ của tôi' (hoặc truy cập /student/profile đối với học sinh, /teacher/profile đối với giáo viên). Bạn có thể chỉnh sửa họ tên, số điện thoại, ảnh đại diện và các thông tin học vấn liên quan.",
  },

  // NHÓM 2: ĐĂNG KÝ LỚP HỌC
  {
    id: "faq-enr-1",
    category: "ENROLLMENT",
    categoryLabel: "Đăng ký lớp",
    question: "Làm thế nào để tìm kiếm và đăng ký lớp học?",
    answer: "Truy cập mục 'Lớp học' (/classes) trên thanh menu. Sử dụng thanh tìm kiếm và bộ lọc để chọn môn học, khối lớp (THPT, THCS), khoảng học phí hoặc giáo viên. Nhấp vào lớp học mong muốn để xem đề cương, lịch học chi tiết và bấm nút 'Đăng ký ngay'.",
  },
  {
    id: "faq-enr-2",
    category: "ENROLLMENT",
    categoryLabel: "Đăng ký lớp",
    question: "Lớp học đã đủ chỗ (Full sĩ số) có đăng ký được không?",
    answer: "Không. Nhằm đảm bảo chất lượng tương tác trực tiếp hai chiều, mỗi lớp học trên Edunity đều có giới hạn sĩ số nghiêm ngặt. Khi lớp đã đủ số lượng học viên đăng ký, nút đăng ký sẽ chuyển sang trạng thái 'Đã hết chỗ'. Bạn có thể tham khảo các lớp học khác cùng môn học hoặc liên hệ giáo viên để cập nhật khi có lớp mới.",
  },
  {
    id: "faq-enr-3",
    category: "ENROLLMENT",
    categoryLabel: "Đăng ký lớp",
    question: "Có thể đăng ký hai lớp có lịch học trùng nhau không?",
    answer: "Hệ thống Edunity có tích hợp tính năng tự động phát hiện xung đột lịch học. Nếu bạn đã có lớp học được xác nhận vào một khung giờ cụ thể, hệ thống sẽ hiển thị cảnh báo trùng lịch khi bạn chọn lớp mới để tránh việc bạn không thể tham gia đầy đủ các buổi học.",
  },

  // NHÓM 3: THANH TOÁN
  {
    id: "faq-pay-1",
    category: "PAYMENT",
    categoryLabel: "Thanh toán",
    question: "Làm thế nào để thanh toán học phí qua VietQR?",
    answer: "Khi bấm 'Đăng ký ngay' với lớp học có thu phí, hệ thống sẽ mở bảng thanh toán hiển thị mã VietQR động được cung cấp qua cổng thanh toán bảo mật payOS. Bạn chỉ cần mở ứng dụng ngân hàng bất kỳ, quét mã QR và xác nhận chuyển tiền. Số tiền và nội dung chuyển khoản được tự động điền chính xác.",
  },
  {
    id: "faq-pay-2",
    category: "PAYMENT",
    categoryLabel: "Thanh toán",
    question: "Mã QR thanh toán hết hạn phải xử lý như thế nào?",
    answer: "Mỗi mã QR giữ chỗ thanh toán có thời hạn hiệu lực là 10 phút. Nếu trong 10 phút bạn chưa hoàn tất chuyển khoản, suất giữ chỗ sẽ tự động hủy để trả lại chỗ trống cho các học viên khác. Bạn chỉ cần đóng cửa sổ thanh toán và bấm 'Đăng ký ngay' lại để tạo mã QR mới nếu lớp vẫn còn chỗ.",
  },
  {
    id: "faq-pay-3",
    category: "PAYMENT",
    categoryLabel: "Thanh toán",
    question: "Thanh toán ngân hàng thành công nhưng hệ thống chưa ghi nhận phải làm sao?",
    answer: "Thông thường hệ thống xác nhận ghi danh tức thì ngay khi nhận được tín hiệu từ ngân hàng (dưới 30 giây). Trong trường hợp mạng ngân hàng xử lý chậm, hệ thống đối soát nền tảng sẽ quét và đối chiếu bù trong vòng vài phút. Nếu sau 15 phút tài khoản của bạn vẫn chưa được cập nhật lớp học, hãy gửi email tới contact@edunity.vn kèm ảnh chụp ủy nhiệm chi/mã giao dịch ngân hàng để được hỗ trợ kiểm tra thủ công.",
  },
  {
    id: "faq-pay-4",
    category: "PAYMENT",
    categoryLabel: "Thanh toán",
    question: "Thanh toán trùng lặp có được hoàn tiền không?",
    answer: "Có. Nếu bạn chuyển khoản 2 lần cho cùng một lớp học hoặc chuyển thừa tiền, quy trình kiểm soát tài chính của Edunity sẽ xác nhận đúng 1 suất ghi danh hợp lệ và tự động khởi tạo hồ sơ hoàn tiền cho khoản thanh toán thừa. Quản trị viên Edunity sẽ liên hệ đối chiếu và thực hiện hoàn tiền vào tài khoản ngân hàng nguồn của bạn.",
  },

  // NHÓM 4: HỌC TRỰC TUYẾN
  {
    id: "faq-cls-1",
    category: "CLASSROOM",
    categoryLabel: "Học trực tuyến",
    question: "Làm sao để vào lớp học trực tuyến của tôi?",
    answer: "Đăng nhập tài khoản Học sinh và truy cập mục 'Học tập của tôi' (/student/classes) hoặc kiểm tra 'Thời khóa biểu' (/student/schedule). Khi đến giờ học, nút 'Vào lớp học' sẽ hiển thị nổi bật để bạn nhấp vào tham gia phòng học tương tác trực tuyến cùng giáo viên.",
  },
  {
    id: "faq-cls-2",
    category: "CLASSROOM",
    categoryLabel: "Học trực tuyến",
    question: "Tôi có thể xem lại bài giảng sau khi buổi học kết thúc không?",
    answer: "Có. Các buổi học trên Edunity đều có bản ghi hình (Recording) và tài liệu giảng dạy đính kèm. Bạn có thể truy cập trang chi tiết lớp học đã ghi danh để xem lại bài giảng bất cứ lúc nào trong suốt quá trình theo học.",
  },
  {
    id: "faq-cls-3",
    category: "CLASSROOM",
    categoryLabel: "Học trực tuyến",
    question: "Lớp học trực tuyến trên Edunity cần những thiết bị gì?",
    answer: "Bạn cần một máy tính (laptop hoặc PC), máy tính bảng hoặc điện thoại thông minh có kết nối Internet ổn định. Để tương tác tốt nhất với thầy cô, bạn nên chuẩn bị micro, tai nghe và trình duyệt web phiên bản mới nhất (Google Chrome, Microsoft Edge, Safari).",
  },

  // NHÓM 5: GIÁO VIÊN
  {
    id: "faq-tch-1",
    category: "TEACHER",
    categoryLabel: "Giáo viên",
    question: "Làm thế nào để đăng ký trở thành giáo viên trên Edunity?",
    answer: "Truy cập đường dẫn /register/teacher để bắt đầu quy trình đăng ký. Bạn cần điền thông tin cá nhân, kinh nghiệm sư phạm, chuyên môn giảng dạy và tải lên hồ sơ minh chứng (bằng tốt nghiệp đại học, chứng chỉ sư phạm hoặc giải thưởng chuyên môn).",
  },
  {
    id: "faq-tch-2",
    category: "TEACHER",
    categoryLabel: "Giáo viên",
    question: "Quy trình xác minh hồ sơ giáo viên diễn ra như thế nào?",
    answer: "Sau khi gửi hồ sơ, Ban quản trị Edunity sẽ tiến hành thẩm định và đối chiếu tính xác thực của thông tin. Khi hồ sơ đạt chuẩn, tài khoản giáo viên sẽ được cấp huy hiệu 'Giáo viên đã xác minh' và mở quyền truy cập Kênh Giảng viên (/teacher) để tạo đề xuất khóa học và mở lớp.",
  },
  {
    id: "faq-tch-3",
    category: "TEACHER",
    categoryLabel: "Giáo viên",
    question: "Làm thế nào để đề xuất khóa học và quản lý lớp giảng dạy?",
    answer: "Giáo viên truy cập Kênh Giảng viên, vào mục 'Đề xuất khóa học' (/teacher/course-proposals) để soạn đề cương và gửi phê duyệt. Khi khóa học được duyệt, giáo viên có thể mở các lớp học cụ thể, thiết lập sĩ số, lịch học và theo dõi danh sách học viên tại /teacher/classes.",
  },

  // NHÓM 6: HỌC BỔNG
  {
    id: "faq-sch-1",
    category: "SCHOLARSHIP",
    categoryLabel: "Học bổng",
    question: "Làm sao để tìm và tham gia các chương trình học bổng?",
    answer: "Truy cập mục 'Học bổng' (/campaigns) trên thanh điều hướng. Tại đây bạn sẽ thấy các chiến dịch học bổng đang mở tiếp nhận hồ sơ, bao gồm học bổng toàn phần và hỗ trợ bán phần từ các nhà tài trợ và quỹ khuyến học.",
  },
  {
    id: "faq-sch-2",
    category: "SCHOLARSHIP",
    categoryLabel: "Học bổng",
    question: "Điều kiện và thủ tục nộp hồ sơ xét duyệt học bổng?",
    answer: "Mỗi chiến dịch học bổng có tiêu chí riêng (như hoàn cảnh gia đình khó khăn, thành tích học sinh giỏi, hoặc bài luận bày tỏ nguyện vọng). Bạn cần bấm vào chi tiết chiến dịch và nộp hồ sơ trực tuyến theo các bước hướng dẫn cụ thể.",
  },
  {
    id: "faq-sch-3",
    category: "SCHOLARSHIP",
    categoryLabel: "Học bổng",
    question: "Làm thế nào để theo dõi kết quả thẩm định hồ sơ học bổng?",
    answer: "Sau khi nộp hồ sơ, bạn có thể kiểm tra trạng thái xét duyệt bất kỳ lúc nào tại trang 'Hồ sơ học bổng của tôi' (/student/scholarships/applications). Mọi cập nhật phê duyệt hoặc yêu cầu bổ sung giấy tờ đều được gửi qua thông báo trên tài khoản của bạn.",
  },
];

const CATEGORIES = [
  { key: "ALL", label: "Tất cả câu hỏi", icon: <QuestionCircleOutlined /> },
  { key: "ACCOUNT", label: "Tài khoản", icon: <UserOutlined /> },
  { key: "ENROLLMENT", label: "Đăng ký lớp", icon: <BookOutlined /> },
  { key: "PAYMENT", label: "Thanh toán", icon: <WalletOutlined /> },
  { key: "CLASSROOM", label: "Học trực tuyến", icon: <VideoCameraOutlined /> },
  { key: "TEACHER", label: "Dành cho Giáo viên", icon: <TeamOutlined /> },
  { key: "SCHOLARSHIP", label: "Học bổng & Tài trợ", icon: <TrophyOutlined /> },
];

export default function SupportPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    document.title = "Trung tâm hỗ trợ EDUNITY – Giải đáp thắc mắc & Hướng dẫn";
    window.scrollTo(0, 0);
  }, []);

  // Filtered FAQ items based on category and search text
  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQ_DATA.filter((item) => {
      const matchCategory = selectedCategory === "ALL" || item.category === selectedCategory;
      if (!matchCategory) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  return (
    <main className="min-h-screen bg-[#F5FAF9] text-[#163B40] pb-20">
      {/* SECTION 1: HERO & SEARCH */}
      <section className="bg-gradient-to-b from-[#E6F4F1] via-[#F0F9F7] to-[#F5FAF9] pt-12 pb-16 border-b border-[#D6E5E2]">
        <div className="site-container max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] text-xs font-extrabold px-3.5 py-1.5 rounded-full uppercase tracking-wider mb-5 shadow-2xs">
            <CustomerServiceOutlined /> Trung tâm trợ giúp & Chăm sóc học viên
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#163B40] tracking-tight leading-[1.2] mb-4">
            Xin chào! EDUNITY có thể giúp gì cho bạn?
          </h1>

          <p className="text-base sm:text-lg text-[#64748B] leading-relaxed max-w-2xl mx-auto mb-8 font-medium">
            Tra cứu câu trả lời nhanh cho các thắc mắc thường gặp về tài khoản, tìm kiếm lớp học, thanh toán học phí và học bổng.
          </p>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto relative shadow-lg shadow-teal-900/5 rounded-2xl bg-white p-2 border border-[#D6E5E2] hover:border-[#0D9488] transition-all">
            <Input
              size="large"
              prefix={<SearchOutlined className="text-[#0D9488] text-xl ml-2 mr-3" />}
              placeholder="Tìm kiếm câu hỏi hoặc vấn đề... (ví dụ: thanh toán, đổi lịch, học bổng, hoàn tiền)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
              className="border-none text-sm sm:text-base h-12 shadow-none focus:shadow-none"
            />
          </div>

          {searchQuery && (
            <p className="text-xs text-[#64748B] mt-3">
              Tìm thấy <strong className="text-[#0D9488]">{filteredFaqs.length}</strong> kết quả phù hợp với từ khóa &ldquo;{searchQuery}&rdquo;
            </p>
          )}
        </div>
      </section>

      {/* SECTION 2: CATEGORY FILTER TABS */}
      <section className="site-container px-4 pt-10 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  isActive
                    ? "bg-[#0D9488] text-white border-[#0D9488] shadow-sm shadow-teal-900/20"
                    : "bg-white text-[#334155] border-[#D6E5E2] hover:border-[#0D9488] hover:bg-[#F0FDFA]"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* SECTION 3: FAQ ACCORDION LIST */}
      <section className="site-container px-4 py-6">
        <div className="max-w-4xl mx-auto">
          {filteredFaqs.length > 0 ? (
            <div className="space-y-4">
              <Collapse
                size="large"
                bordered={false}
                className="bg-transparent space-y-3.5"
                expandIconPosition="end"
                items={filteredFaqs.map((faq) => ({
                  key: faq.id,
                  label: (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pr-2">
                      <span className="font-bold text-sm sm:text-base text-[#163B40] leading-snug">
                        {faq.question}
                      </span>
                      <Tag color="cyan" className="text-[10px] uppercase font-semibold w-fit m-0">
                        {faq.categoryLabel}
                      </Tag>
                    </div>
                  ),
                  children: (
                    <div className="text-sm text-[#475569] leading-relaxed pt-1 pb-2 border-t border-[#F0FDFA]">
                      {faq.answer}
                    </div>
                  ),
                  className:
                    "bg-white rounded-2xl! border! border-[#D6E5E2]! shadow-[0_2px_6px_rgba(13,148,136,0.03)]! hover:border-[#0D9488]! transition-colors overflow-hidden",
                }))}
              />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#D6E5E2] p-12 text-center shadow-xs">
              <Empty
                description={
                  <div className="space-y-2 mt-2">
                    <p className="text-base font-bold text-[#163B40]">Không tìm thấy câu hỏi phù hợp</p>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Không có kết quả nào khớp với từ khóa &ldquo;{searchQuery}&rdquo; trong nhóm này.
                      Vui lòng thử tìm với từ khóa khác hoặc liên hệ trực tiếp với chúng tôi.
                    </p>
                  </div>
                }
              />
              <Button
                icon={<ClearOutlined />}
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("ALL");
                }}
                className="mt-5 rounded-xl border-[#D6E5E2] text-[#0F766E] hover:border-[#0D9488]"
              >
                Xóa tìm kiếm & Xem tất cả
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: LIÊN HỆ HỖ TRỢ THỰC TẾ */}
      <section className="site-container px-4 pt-12">
        <div className="max-w-4xl mx-auto rounded-3xl bg-white border border-[#D6E5E2] p-8 sm:p-10 shadow-[0_4px_16px_rgba(13,148,136,0.06)]">
          <div className="text-center max-w-xl mx-auto mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#CCFBF1] text-[#0F766E] text-xs font-bold uppercase tracking-wider mb-2">
              <CustomerServiceOutlined /> Kênh hỗ trợ chính thức
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#163B40]">
              Bạn vẫn cần hỗ trợ thêm?
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] mt-1.5">
              Nếu bạn không tìm thấy câu trả lời ở trên, đội ngũ hỗ trợ Edunity luôn sẵn sàng đồng hành cùng bạn.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Kênh 1: Email chính thức */}
            <div className="p-6 rounded-2xl bg-[#F5FAF9] border border-[#D6E5E2] flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#CCFBF1] text-[#0D9488] flex items-center justify-center text-xl shrink-0">
                <MailOutlined />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#163B40]">Hộp thư hỗ trợ</h3>
                <p className="text-xs text-[#64748B]">Tiếp nhận và xử lý mọi yêu cầu về học phí, tài khoản và kỹ thuật.</p>
                <div className="pt-2">
                  <a
                    href="mailto:contact@edunity.vn"
                    className="inline-flex items-center gap-1.5 font-bold text-[#0D9488] hover:text-[#0F766E] text-sm font-mono"
                  >
                    contact@edunity.vn <ArrowRightOutlined className="text-xs" />
                  </a>
                </div>
                <p className="text-[11px] text-[#64748B] pt-1">
                  Thời gian phản hồi: 8:00 – 17:30 (Thứ 2 – Thứ 6)
                </p>
              </div>
            </div>

            {/* Kênh 2: Báo cáo khiếu nại nội bộ */}
            <div className="p-6 rounded-2xl bg-[#F5FAF9] border border-[#D6E5E2] flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#E0E7FF] text-[#4F46E5] flex items-center justify-center text-xl shrink-0">
                <InfoCircleOutlined />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#163B40]">Kênh Khiếu nại & Phản ánh</h3>
                <p className="text-xs text-[#64748B]">
                  Dành cho người dùng đã đăng nhập có yêu cầu khiếu nại về buổi học hoặc hành vi đào tạo.
                </p>
                <div className="pt-2">
                  <Link
                    to={ROUTES.REPORTS}
                    className="inline-flex items-center gap-1.5 font-bold text-[#4F46E5] hover:text-[#4338CA] text-sm"
                  >
                    Mở trung tâm khiếu nại <ArrowRightOutlined className="text-xs" />
                  </Link>
                </div>
                <p className="text-[11px] text-[#64748B] pt-1">
                  Được thụ lý trực tiếp bởi Ban quản trị Edunity
                </p>
              </div>
            </div>
          </div>

          {/* Minh bạch thông tin hotline & Guest Ticket Policy */}
          <Alert
            type="info"
            showIcon
            className="rounded-2xl border-[#D6E5E2] bg-[#F8FAFC] text-[#334155] text-xs leading-relaxed"
            message={<span className="font-bold text-[#163B40]">Thông tin minh bạch về kênh liên hệ</span>}
            description="Tổng đài Hotline chính thức đang trong quá trình tích hợp đầu số dịch vụ và sẽ được công bố khi hoàn tất. Hiện tại, Edunity chưa kích hoạt tính năng gửi Support Ticket trực tiếp dành cho khách vãng lai chưa đăng nhập. Để đảm bảo quyền lợi và bảo mật thông tin, quý học viên và phụ huynh vui lòng gửi email về contact@edunity.vn hoặc đăng nhập để tạo phản ánh nội bộ."
          />
        </div>
      </section>
    </main>
  );
}
