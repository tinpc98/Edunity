import { Link } from "react-router-dom";
import { LOGO_URL } from "../../data/homeData";
import { PhoneOutlined, MailOutlined, FacebookOutlined, YoutubeOutlined, ShareAltOutlined } from "@ant-design/icons";
import { ROUTES } from "../../routes/routePaths";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-[#D6E5E2] pt-16 pb-12 mt-16 text-[#334155]">
      <div className="site-container">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 lg:gap-10 pb-12 border-b border-[#D6E5E2]">
          {/* Col 1: Brand Info */}
          <div className="space-y-4 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <img src={LOGO_URL} alt="Edunity" className="h-8 w-auto" />
              <span className="text-xl font-black text-[#163B40]">Edunity</span>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Nền tảng học trực tuyến tương tác hai chiều hàng đầu, kết nối hàng nghìn giáo viên xuất sắc với học sinh trên toàn quốc.
            </p>
            <div className="text-xs space-y-2 text-[#334155] font-semibold">
              <div className="flex items-center gap-2">
                <PhoneOutlined className="text-[#0D9488]" />
                <span>Hotline: 1900 xxxx</span>
              </div>
              <div className="flex items-center gap-2">
                <MailOutlined className="text-[#0D9488]" />
                <span>contact@edunity.vn</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-[#F5FAF9] hover:bg-[#CCFBF1] hover:text-[#0D9488] flex items-center justify-center text-[#64748B] transition-colors cursor-pointer border border-[#D6E5E2]"
                aria-label="Chia sẻ"
              >
                <ShareAltOutlined className="text-xs" />
              </button>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-[#F5FAF9] hover:bg-[#CCFBF1] hover:text-[#0D9488] flex items-center justify-center text-[#64748B] transition-colors cursor-pointer border border-[#D6E5E2]"
                aria-label="Facebook"
              >
                <FacebookOutlined className="text-xs" />
              </button>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-[#F5FAF9] hover:bg-[#CCFBF1] hover:text-[#0D9488] flex items-center justify-center text-[#64748B] transition-colors cursor-pointer border border-[#D6E5E2]"
                aria-label="YouTube"
              >
                <YoutubeOutlined className="text-xs" />
              </button>
            </div>
          </div>

          {/* Col 2 */}
          <div>
            <h4 className="text-sm font-extrabold text-[#163B40] mb-4 uppercase tracking-wider">Về Edunity</h4>
            <ul className="space-y-2.5 text-xs text-[#64748B]">
              <li><Link to={ROUTES.ABOUT} className="hover:text-[#0D9488] transition-colors">Giới thiệu</Link></li>
              <li><a href="#" className="hover:text-[#0D9488] transition-colors">Đội ngũ phát triển</a></li>
              <li><a href="#" className="hover:text-[#0D9488] transition-colors">Tuyển dụng</a></li>
              <li><a href="#" className="hover:text-[#0D9488] transition-colors">Báo chí & Truyền thông</a></li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <h4 className="text-sm font-extrabold text-[#163B40] mb-4 uppercase tracking-wider">Khám phá</h4>
            <ul className="space-y-2.5 text-xs text-[#64748B]">
              <li><a href="/classes?grades=GRADE_10,GRADE_11,GRADE_12" className="hover:text-[#0D9488] transition-colors">Trung học phổ thông</a></li>
              <li><a href="/classes?grades=GRADE_6,GRADE_7,GRADE_8,GRADE_9" className="hover:text-[#0D9488] transition-colors">Trung học cơ sở</a></li>
              <li><a href="/classes" className="hover:text-[#0D9488] transition-colors">Luyện thi đại học</a></li>
              <li><a href="/classes?classTypes=FREE" className="hover:text-[#0D9488] transition-colors">Lớp học miễn phí</a></li>
              <li><a href="/campaigns" className="hover:text-[#0D9488] transition-colors">Học bổng Edunity</a></li>
            </ul>
          </div>

          {/* Col 4 */}
          <div>
            <h4 className="text-sm font-extrabold text-[#163B40] mb-4 uppercase tracking-wider">Dành cho giáo viên</h4>
            <ul className="space-y-2.5 text-xs text-[#64748B]">
              <li><a href="/register/teacher" className="hover:text-[#0D9488] transition-colors">Đăng ký giảng dạy</a></li>
              <li><a href="#" className="hover:text-[#0D9488] transition-colors">Tiêu chuẩn cộng đồng</a></li>
              <li><a href="#" className="hover:text-[#0D9488] transition-colors">Hướng dẫn mở lớp</a></li>
            </ul>
          </div>

          {/* Col 5 */}
          <div>
            <h4 className="text-sm font-extrabold text-[#163B40] mb-4 uppercase tracking-wider">Hỗ trợ & Điều khoản</h4>
            <ul className="space-y-2.5 text-xs text-[#64748B]">
              <li><Link to={ROUTES.SUPPORT} className="hover:text-[#0D9488] transition-colors">Trung tâm trợ giúp</Link></li>
              <li><a href="#" className="hover:text-[#0D9488] transition-colors">Chính sách bảo mật</a></li>
              <li><a href="#" className="hover:text-[#0D9488] transition-colors">Quy chế hoạt động</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
          <p className="text-center sm:text-left">© 2026 Edunity V3 Platform. Nền tảng học tập trực tuyến kết nối giáo viên & học viên.</p>
          <div className="flex items-center gap-6 font-medium">
            <span className="flex items-center gap-1.5"><span className="text-[#0D9488]">🛡️</span> Bảo mật thông tin</span>
            <span className="flex items-center gap-1.5"><span className="text-[#0D9488]">🎓</span> Học trực tiếp 100%</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
