import { Button } from "antd";
import { CheckCircleFilled, RightOutlined, VideoCameraFilled } from "@ant-design/icons";

export default function BecomeTeacherSection() {
  return (
    <section className="home-section">
      <div className="rounded-3xl bg-gradient-to-r from-[#0F766E] via-[#0D9488] to-[#14B8A6] text-white p-10 shadow-xl relative overflow-hidden">
        {/* Background decorative soft circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-teal-400/20 rounded-full blur-2xl pointer-events-none"></div>

        <div className="grid grid-cols-12 gap-8 items-center relative z-10">
          {/* Left Column: Value Proposition */}
          <div className="col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-[12px] font-bold tracking-wide">
              <span>🎓</span>
              <span>DÀNH CHO GIÁO VIÊN & GIA SƯ</span>
            </div>

            <h2 className="text-3xl font-black tracking-tight leading-tight">
              Bạn Có Chuyên Môn Và Muốn Giảng Dạy Trực Tuyến?
            </h2>

            <p className="text-sm text-teal-50 leading-relaxed max-w-xl">
              Tạo lớp học trực tuyến riêng, xây dựng thương hiệu cá nhân và tiếp cận hơn 50.000 học viên nhiệt huyết trên toàn quốc. Nâng tầm sự nghiệp giáo dục số với công nghệ lớp học live thông minh.
            </p>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5">
                <CheckCircleFilled className="text-teal-200 text-sm" />
                <span>Chủ động 100% lịch học theo thời gian rảnh của bạn</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircleFilled className="text-teal-200 text-sm" />
                <span>Tự do định giá học phí và nhận thanh toán minh bạch, đúng hạn</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircleFilled className="text-teal-200 text-sm" />
                <span>Phòng học Live Studio tích hợp sẵn bảng số & điểm danh, không cần cài đặt</span>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <a href="/register/teacher">
                <Button
                  size="large"
                  className="bg-white text-[#0F766E] hover:bg-[#F0FDFA] font-black rounded-xl h-11 px-6 border-none shadow-md"
                >
                  Trở Thành Giáo Viên <RightOutlined className="text-sm" />
                </Button>
              </a>
              <Button
                type="text"
                className="text-white hover:text-teal-200 font-bold text-sm"
              >
                Tìm hiểu quyền lợi đối tác →
              </Button>
            </div>
          </div>

          {/* Right Column: Interactive Teacher Live Class Mockup Card */}
          <div className="col-span-5">
            <div className="bg-white rounded-2xl p-5 text-[#163B40] shadow-2xl border border-white/20">
              <div className="flex items-center justify-between pb-3 border-b border-[#D6E5E2]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0D9488] animate-pulse"></span>
                  <span className="text-sm font-bold text-[#0F766E] uppercase">Phòng học sẵn sàng</span>
                </div>
                <span className="text-[12px] text-slate-400 font-mono">Mã lớp: MATH11-L04</span>
              </div>

              <div className="py-4">
                <div className="text-[12px] font-bold text-[#0D9488] uppercase">Lớp sắp diễn ra • 19:30 Tối nay</div>
                <h4 className="text-sm font-extrabold text-[#163B40] mt-1">
                  Toán 11 – Ứng Dụng Đạo Hàm & Tiếp Tuyến
                </h4>

                <div className="mt-3 bg-[#F5FAF9] border border-[#D6E5E2]/60 rounded-xl p-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Sĩ số đã điểm danh:</span>
                  <span className="font-extrabold text-[#163B40]">14 / 15 Học viên (93%)</span>
                </div>

                <div className="mt-4">
                  <Button
                    type="primary"
                    block
                    icon={<VideoCameraFilled />}
                    className="bg-[#0D9488] hover:bg-[#0B746C] font-bold h-10 rounded-xl border-none shadow-sm"
                  >
                    Vào Lớp Ngay (Bắt đầu sau 15 phút)
                  </Button>
                </div>
              </div>

              <div className="pt-3 border-t border-[#D6E5E2] grid grid-cols-3 gap-2 text-center text-sm">
                <div className="p-2 bg-[#CCFBF1]/50 rounded-lg">
                  <div className="text-[#0F766E] font-extrabold">28.5M</div>
                  <div className="text-[12px] text-slate-500">Thu nhập tháng</div>
                </div>
                <div className="p-2 bg-amber-50/80 rounded-lg">
                  <div className="text-amber-600 font-extrabold">4.98★</div>
                  <div className="text-[12px] text-slate-500">142 Đánh giá</div>
                </div>
                <div className="p-2 bg-[#CCFBF1]/50 rounded-lg">
                  <div className="text-[#0F766E] font-extrabold">98%</div>
                  <div className="text-[12px] text-slate-500">Hoàn thành lớp</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}