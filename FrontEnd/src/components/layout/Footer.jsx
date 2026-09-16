import React from "react";
import { LOGO_URL } from "../../data/homeData";
import { PhoneOutlined, MailOutlined, GlobalOutlined, FacebookOutlined, YoutubeOutlined, ShareAltOutlined } from "@ant-design/icons";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-slate-100 pt-16 pb-12 mt-16 text-slate-600">
      <div className="site-container">
        <div className="grid grid-cols-5 gap-10 pb-12 border-b border-slate-100">
          {/* Col 1 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <img src={LOGO_URL} alt="Edunity" className="h-8 w-auto" />
              <span className="text-xl font-bold text-indigo-950">Edunity</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Nền tảng học trực tuyến tương tác hai chiều hàng đầu, kết nối hàng nghìn giáo viên xuất sắc với học sinh trên toàn quốc.
            </p>
            <div className="text-xs space-y-2 text-slate-700 font-medium">
              <div className="flex items-center gap-2">
                <PhoneOutlined className="text-indigo-600" />
                <span>Hotline: 1900 xxxx</span>
              </div>
              <div className="flex items-center gap-2">
                <MailOutlined className="text-indigo-600" />
                <span>contact@edunity.vn</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button className="w-8 h-8 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center text-slate-600 transition">
                <ShareAltOutlined />
              </button>
              <button className="w-8 h-8 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center text-slate-600 transition">
                <FacebookOutlined />
              </button>
              <button className="w-8 h-8 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center text-slate-600 transition">
                <YoutubeOutlined />
              </button>
            </div>
          </div>

          {/* Col 2 */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-4">Về Edunity</h4>
            <ul className="space-y-2.5 text-xs text-slate-500">
              <li><a href="#" className="hover:text-indigo-600">Giới thiệu</a></li>
              <li><a href="#" className="hover:text-indigo-600">Đội ngũ phát triển</a></li>
              <li><a href="#" className="hover:text-indigo-600">Tuyển dụng</a></li>
              <li><a href="#" className="hover:text-indigo-600">Báo chí & Truyền thông</a></li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-4">Khám phá</h4>
            <ul className="space-y-2.5 text-xs text-slate-500">
              <li><a href="#" className="hover:text-indigo-600">Trung học phổ thông</a></li>
              <li><a href="#" className="hover:text-indigo-600">Trung học cơ sở</a></li>
              <li><a href="#" className="hover:text-indigo-600">Luyện thi đại học</a></li>
              <li><a href="#" className="hover:text-indigo-600">Lớp học miễn phí</a></li>
              <li><a href="#" className="hover:text-indigo-600">Học bổng Edunity</a></li>
            </ul>
          </div>

          {/* Col 4 */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-4">Dành cho giáo viên</h4>
            <ul className="space-y-2.5 text-xs text-slate-500">
              <li><a href="#" className="hover:text-indigo-600">Đăng ký giảng dạy</a></li>
              <li><a href="#" className="hover:text-indigo-600">Tiêu chuẩn cộng đồng</a></li>
              <li><a href="#" className="hover:text-indigo-600">Hướng dẫn mở lớp</a></li>
            </ul>
          </div>

          {/* Col 5 */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-4">Hỗ trợ & Điều khoản</h4>
            <ul className="space-y-2.5 text-xs text-slate-500">
              <li><a href="#" className="hover:text-indigo-600">Trung tâm trợ giúp</a></li>
              <li><a href="#" className="hover:text-indigo-600">Chính sách bảo mật</a></li>
              <li><a href="#" className="hover:text-indigo-600">Quy chế hoạt động</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-6 flex items-center justify-between text-xs text-slate-400">
          <p>© 2025 Edunity EdTech Marketplace. Nền tảng học tập trực tuyến kết nối giáo viên & học viên.</p>
          <div className="flex items-center gap-6">
            <span>🛡️ Bảo mật thông tin</span>
            <span>🎓 Học trực tiếp 100%</span>
          </div>
        </div>
      </div>
    </footer>
  );
}