import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button, Tag } from "antd";
import {
  CompassOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  VideoCameraOutlined,
  TrophyOutlined,
  UserOutlined,
  SolutionOutlined,
  HeartOutlined,
  ThunderboltFilled,
} from "@ant-design/icons";
import { ROUTES } from "../../routes/routePaths";

export default function AboutPage() {
  useEffect(() => {
    document.title = "Giới thiệu EDUNITY – Kết nối tri thức, mở rộng cơ hội học tập";
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="min-h-screen bg-[#F5FAF9] text-[#163B40] pb-16">
      {/* SECTION 1 — HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#E6F4F1] via-[#F0F9F7] to-[#F5FAF9] pt-12 pb-16 border-b border-[#D6E5E2]">
        <div className="site-container relative z-10 text-center max-w-4xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] text-xs font-extrabold px-3.5 py-1.5 rounded-full uppercase tracking-wider mb-5 shadow-2xs">
            <ThunderboltFilled className="text-amber-500" /> Nền tảng học trực tuyến live tương tác hai chiều
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#163B40] tracking-tight leading-[1.2] mb-5">
            EDUNITY – Kết nối tri thức, <br className="hidden sm:inline" />
            <span className="text-[#0D9488] bg-gradient-to-r from-[#0D9488] to-[#0F766E] bg-clip-text text-transparent">
              mở rộng cơ hội học tập
            </span>
          </h1>

          <p className="text-base sm:text-lg text-[#64748B] leading-relaxed max-w-2xl mx-auto mb-8 font-medium">
            Edunity là nền tảng giáo dục trực tuyến kết nối học sinh với các giáo viên uy tín,
            mang đến các lớp học tương tác trực tiếp, theo dõi tiến độ minh bạch và mở rộng cơ hội học bổng cho mọi người học.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <Link to={ROUTES.CLASSES}>
              <Button
                type="primary"
                size="large"
                icon={<CompassOutlined />}
                className="bg-[#0D9488] hover:bg-[#0B746C] text-white font-bold h-12 px-6 rounded-xl border-none shadow-md shadow-teal-900/10 active:scale-95 transition-all text-sm"
              >
                Khám phá lớp học
              </Button>
            </Link>
            <Link to={ROUTES.AUTH.TEACHER_REGISTER}>
              <Button
                size="large"
                icon={<TeamOutlined />}
                className="bg-white hover:bg-[#F0FDFA] text-[#0F766E] border-[#D6E5E2] hover:border-[#0D9488] font-bold h-12 px-6 rounded-xl shadow-2xs text-sm"
              >
                Trở thành giáo viên
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 2 — VỀ EDUNITY */}
      <section className="py-16 site-container px-4">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2 h-4 bg-[#0D9488] rounded-full" />
            <span className="text-xs font-bold tracking-wider text-[#0F766E] uppercase">Về chúng tôi</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#163B40] tracking-tight">
            Mô hình nền tảng giáo dục Edunity
          </h2>
          <p className="text-sm text-[#64748B] mt-2">
            Giải pháp học trực tuyến toàn diện, chú trọng tương tác thực tế và chất lượng đào tạo có kiểm duyệt
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_2px_8px_rgba(13,148,136,0.04)] hover:border-[#0D9488] transition-all">
            <div className="w-12 h-12 rounded-xl bg-[#CCFBF1] text-[#0D9488] flex items-center justify-center text-xl mb-4">
              <VideoCameraOutlined />
            </div>
            <h3 className="text-lg font-bold text-[#163B40] mb-2">Lớp học Live tương tác 2 chiều</h3>
            <p className="text-sm text-[#64748B] leading-relaxed">
              Học trực tiếp qua video, micro và bảng vẽ điện tử. Học viên được trao đổi và giải đáp thắc mắc ngay trong buổi học, kèm bản ghi xem lại sau mỗi buổi.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_2px_8px_rgba(13,148,136,0.04)] hover:border-[#0D9488] transition-all">
            <div className="w-12 h-12 rounded-xl bg-[#CCFBF1] text-[#0D9488] flex items-center justify-center text-xl mb-4">
              <SafetyCertificateOutlined />
            </div>
            <h3 className="text-lg font-bold text-[#163B40] mb-2">Giáo viên được thẩm định</h3>
            <p className="text-sm text-[#64748B] leading-relaxed">
              Mọi giáo viên giảng dạy trên Edunity đều trải qua quy trình xác minh bằng cấp, chứng chỉ sư phạm và đề cương khóa học nghiêm ngặt bởi Ban quản trị.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_2px_8px_rgba(13,148,136,0.04)] hover:border-[#0D9488] transition-all">
            <div className="w-12 h-12 rounded-xl bg-[#CCFBF1] text-[#0D9488] flex items-center justify-center text-xl mb-4">
              <TrophyOutlined />
            </div>
            <h3 className="text-lg font-bold text-[#163B40] mb-2">Quỹ học bổng & Hỗ trợ học tập</h3>
            <p className="text-sm text-[#64748B] leading-relaxed">
              Kết nối nguồn lực tài trợ từ cộng đồng tới các học sinh có hoàn cảnh khó khăn hoặc có thành tích xuất sắc, đảm bảo cơ hội tiếp cận tri thức công bằng.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 3 — SỨ MỆNH */}
      <section className="py-14 bg-[#F0FDFA] border-y border-[#CCFBF1]">
        <div className="site-container px-4">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#CCFBF1] text-[#0F766E] text-xs font-bold uppercase tracking-wider">
              <HeartOutlined className="text-teal-600" /> Sứ mệnh của Edunity
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#163B40] leading-snug">
              Xây dựng môi trường học tập gắn kết, minh bạch và có trách nhiệm
            </h2>
            <p className="text-sm sm:text-base text-[#64748B] leading-relaxed">
              Chúng tôi tin rằng giáo dục chất lượng cao không nên bị giới hạn bởi khoảng cách địa lý hay rào cản chi phí.
              Edunity ra đời với mục tiêu kết nối người học với các chương trình học tập phù hợp, tạo điều kiện để thầy cô
              phát huy năng lực sư phạm và thúc đẩy tinh thần tự học, sẻ chia tri thức trong cộng đồng.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4 — EDUNITY DÀNH CHO AI? */}
      <section className="py-16 site-container px-4">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2 h-4 bg-[#0D9488] rounded-full" />
            <span className="text-xs font-bold tracking-wider text-[#0F766E] uppercase">Đối tượng phục vụ</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#163B40] tracking-tight">
            Edunity đồng hành cùng ai?
          </h2>
          <p className="text-sm text-[#64748B] mt-2">
            Các chức năng và quy trình được thiết kế chuyên biệt cho từng nhóm người dùng trên hệ thống
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Học sinh */}
          <div className="p-6 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_2px_8px_rgba(13,148,136,0.04)] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#CCFBF1] text-[#0D9488] flex items-center justify-center text-lg font-bold">
                  <UserOutlined />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#163B40]">Học sinh & Người học</h3>
                  <Tag color="cyan" className="text-[10px] m-0">Người học</Tag>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-[#64748B] mb-6">
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#0D9488] mt-0.5" />
                  <span>Tìm kiếm lớp học theo môn học, khối lớp và học phí</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#0D9488] mt-0.5" />
                  <span>Đăng ký giữ chỗ và thanh toán học phí an toàn qua VietQR</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#0D9488] mt-0.5" />
                  <span>Tham gia buổi học trực tuyến, tương tác trực tiếp với giáo viên</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#0D9488] mt-0.5" />
                  <span>Theo dõi thời khóa biểu cá nhân và xem lại bản ghi bài giảng</span>
                </li>
              </ul>
            </div>
            <Link to={ROUTES.CLASSES}>
              <Button type="default" className="w-full text-xs font-semibold rounded-xl border-[#D6E5E2] text-[#0F766E] hover:border-[#0D9488]">
                Tìm lớp học phù hợp
              </Button>
            </Link>
          </div>

          {/* Card 2: Giáo viên */}
          <div className="p-6 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_2px_8px_rgba(13,148,136,0.04)] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#E0E7FF] text-[#4F46E5] flex items-center justify-center text-lg font-bold">
                  <SolutionOutlined />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#163B40]">Giáo viên & Giảng viên</h3>
                  <Tag color="geekblue" className="text-[10px] m-0">Đào tạo</Tag>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-[#64748B] mb-6">
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#4F46E5] mt-0.5" />
                  <span>Xác minh hồ sơ, kinh nghiệm giảng dạy và bằng cấp sư phạm</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#4F46E5] mt-0.5" />
                  <span>Đề xuất khóa học mới và chủ động thiết kế giáo trình</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#4F46E5] mt-0.5" />
                  <span>Quản lý lớp học, danh sách học viên và điểm danh buổi học</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#4F46E5] mt-0.5" />
                  <span>Theo dõi doanh thu giảng dạy và lịch chi trả đối soát rõ ràng</span>
                </li>
              </ul>
            </div>
            <Link to={ROUTES.AUTH.TEACHER_REGISTER}>
              <Button type="default" className="w-full text-xs font-semibold rounded-xl border-[#D6E5E2] text-[#4F46E5] hover:border-[#4F46E5]">
                Đăng ký giảng dạy
              </Button>
            </Link>
          </div>

          {/* Card 3: Người đồng hành */}
          <div className="p-6 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_2px_8px_rgba(13,148,136,0.04)] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#FCE7F3] text-[#DB2777] flex items-center justify-center text-lg font-bold">
                  <HeartOutlined />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#163B40]">Người đồng hành & Tài trợ</h3>
                  <Tag color="magenta" className="text-[10px] m-0">Học bổng</Tag>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-[#64748B] mb-6">
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#DB2777] mt-0.5" />
                  <span>Tìm hiểu các chiến dịch học bổng và bảo trợ học tập</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#DB2777] mt-0.5" />
                  <span>Đóng góp tài trợ giáo dục minh bạch qua tài khoản chuyên dụng</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#DB2777] mt-0.5" />
                  <span>Theo dõi tiến trình giải ngân và hồ sơ xét duyệt học bổng</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-[#DB2777] mt-0.5" />
                  <span>Đồng hành cùng học sinh có hoàn cảnh khó khăn vươn lên</span>
                </li>
              </ul>
            </div>
            <Link to={ROUTES.CAMPAIGNS}>
              <Button type="default" className="w-full text-xs font-semibold rounded-xl border-[#D6E5E2] text-[#DB2777] hover:border-[#DB2777]">
                Xem các chiến dịch
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 5 — CÁCH EDUNITY HOẠT ĐỘNG */}
      <section className="py-16 bg-white border-y border-[#D6E5E2]">
        <div className="site-container px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 mb-2">
              <span className="w-2 h-4 bg-[#0D9488] rounded-full" />
              <span className="text-xs font-bold tracking-wider text-[#0F766E] uppercase">Quy trình</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#163B40] tracking-tight">
              Cách Edunity hoạt động
            </h2>
            <p className="text-sm text-[#64748B] mt-2">
              Quy trình tham gia học tập đơn giản, rõ ràng và được bảo vệ ở từng bước
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-5 rounded-2xl bg-[#F5FAF9] border border-[#D6E5E2] relative">
              <span className="w-7 h-7 rounded-full bg-[#0D9488] text-white font-black text-xs flex items-center justify-center mb-3">1</span>
              <h4 className="text-sm font-bold text-[#163B40] mb-1.5">Tạo tài khoản</h4>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Đăng ký tài khoản nhanh chóng bằng email và số điện thoại cá nhân.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#F5FAF9] border border-[#D6E5E2] relative">
              <span className="w-7 h-7 rounded-full bg-[#0D9488] text-white font-black text-xs flex items-center justify-center mb-3">2</span>
              <h4 className="text-sm font-bold text-[#163B40] mb-1.5">Khám phá lớp</h4>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Tìm lớp theo môn học, khối lớp, lịch học và xem hồ sơ giáo viên.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#F5FAF9] border border-[#D6E5E2] relative">
              <span className="w-7 h-7 rounded-full bg-[#0D9488] text-white font-black text-xs flex items-center justify-center mb-3">3</span>
              <h4 className="text-sm font-bold text-[#163B40] mb-1.5">Đăng ký & Giữ chỗ</h4>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Bấm Đăng ký ngay, quét mã VietQR thanh toán (10 phút) hoặc vào thẳng lớp miễn phí.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#F5FAF9] border border-[#D6E5E2] relative">
              <span className="w-7 h-7 rounded-full bg-[#0D9488] text-white font-black text-xs flex items-center justify-center mb-3">4</span>
              <h4 className="text-sm font-bold text-[#163B40] mb-1.5">Xác nhận ghi danh</h4>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Hệ thống xác nhận tức thì, tự động thêm lớp vào thời khóa biểu học tập của bạn.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#F5FAF9] border border-[#D6E5E2] relative">
              <span className="w-7 h-7 rounded-full bg-[#0D9488] text-white font-black text-xs flex items-center justify-center mb-3">5</span>
              <h4 className="text-sm font-bold text-[#163B40] mb-1.5">Tham gia lớp học</h4>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Vào lớp học live đúng giờ, tương tác với thầy cô và xem lại bản ghi sau buổi học.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6 — CALL TO ACTION */}
      <section className="py-16 site-container px-4">
        <div className="rounded-3xl bg-gradient-to-r from-[#0F766E] to-[#0D9488] p-8 sm:p-12 text-center text-white shadow-lg shadow-teal-950/10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-4 tracking-tight">
            Sẵn sàng bắt đầu hành trình học tập cùng Edunity?
          </h2>
          <p className="text-sm sm:text-base text-teal-50 max-w-xl mx-auto mb-8 font-medium">
            Khám phá các lớp học chất lượng cao hoặc kết nối với đội ngũ hỗ trợ của chúng tôi để được tư vấn lộ trình học phù hợp nhất.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to={ROUTES.CLASSES}>
              <Button
                size="large"
                className="bg-white hover:bg-slate-50 text-[#0F766E] font-bold h-12 px-7 rounded-xl border-none shadow-md text-sm active:scale-95 transition-all"
              >
                Khám phá lớp học ngay <ArrowRightOutlined />
              </Button>
            </Link>
            <Link to={ROUTES.SUPPORT}>
              <Button
                size="large"
                className="bg-transparent hover:bg-white/10 text-white font-bold h-12 px-6 rounded-xl border border-white/40 text-sm transition-all"
              >
                Trung tâm hỗ trợ
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
