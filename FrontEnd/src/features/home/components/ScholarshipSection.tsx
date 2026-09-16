import { Button, Progress } from "antd";
import { CheckCircleOutlined, ArrowRightOutlined, FileTextOutlined, HeartOutlined, ClockCircleOutlined } from "@ant-design/icons";

export default function ScholarshipSection() {
  return (
    <section className="home-section section-emphasis">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-indigo-700 via-indigo-600 to-cyan-500 p-7 lg:p-9 shadow-lg">
        <div className="absolute -left-16 -bottom-20 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-1/3 -top-20 w-64 h-64 rounded-full bg-cyan-200/10 blur-2xl" />

        <div className="relative grid grid-cols-12 gap-8 items-center">
          <div className="col-span-7 text-white">
            <div className="inline-flex items-center gap-2 bg-white/15 border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold"><HeartOutlined /> TRÁCH NHIỆM XÃ HỘI VÌ GIÁO DỤC CÔNG BẰNG</div>
            <h2 className="mt-4 text-[29px] leading-[1.22] font-extrabold max-w-[590px]">Quỹ Học Bổng Edunity – Mở Lối Ước Mơ Tri Thức</h2>
            <p className="mt-2.5 text-[12px] leading-5 text-indigo-50 max-w-[610px]">Kết nối nguồn tài trợ với người học có hoàn cảnh khó khăn để các bạn có thể tham gia những lớp live phù hợp, minh bạch và đúng mục tiêu học tập.</p>

            <div className="mt-5 grid grid-cols-3 gap-3 max-w-[570px]">
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur"><div className="text-[20px] font-black">1.250+</div><div className="text-[9.5px] text-indigo-100 mt-1">Suất học bổng đã trao</div></div>
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur"><div className="text-[20px] font-black">3,2 Tỷ</div><div className="text-[9.5px] text-indigo-100 mt-1">Tổng ngân sách hỗ trợ</div></div>
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur"><div className="text-[20px] font-black">12</div><div className="text-[9.5px] text-indigo-100 mt-1">Chiến dịch đang hoạt động</div></div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Button className="h-9 px-4 rounded-lg border-none bg-white text-indigo-700 font-bold text-[11px]">Xem các chương trình học bổng <ArrowRightOutlined /></Button>
              <Button className="h-9 px-4 rounded-lg border border-white/25 bg-white/15 text-white font-bold text-[11px]"><FileTextOutlined /> Hướng dẫn đăng ký</Button>
            </div>
          </div>

          <div className="col-span-5">
            <div className="bg-white rounded-2xl p-5.5 shadow-xl border border-white/70">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold text-indigo-600">Kỳ tuyển chọn Hè 2026</span>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Đang nhận đơn</span>
              </div>
              <h3 className="mt-3 text-[16px] font-extrabold text-slate-900">Học bổng Nâng bước Thủ khoa</h3>
              <p className="text-[10px] text-slate-500 mt-1 leading-4">Dành cho học sinh khối 10, 11, 12 có kết quả học tập tốt hoặc hoàn cảnh gia đình đặc biệt.</p>

              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-600 px-2.5 py-1 text-[9.5px] font-extrabold"><ClockCircleOutlined /> Còn 6 ngày nhận hồ sơ</div>

              <div className="mt-3.5 rounded-xl bg-indigo-50 p-3.5">
                <div className="flex items-center justify-between text-[10px] text-slate-500"><span>Tiến độ xét duyệt kỳ này</span><b className="text-indigo-600">78%</b></div>
                <Progress percent={78} showInfo={false} strokeColor="#4f46e5" trailColor="#e0e7ff" size="small" />
                <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1"><span>Đã tiếp nhận: <b>820 hồ sơ</b></span><span>Chỉ tiêu: <b>1.050 suất</b></span></div>
              </div>

              <div className="mt-4 space-y-2 text-[10px] text-slate-600">
                <div className="flex items-start gap-2"><CheckCircleOutlined className="text-emerald-600 mt-0.5" /><span>Hỗ trợ học phí cho lớp live đủ điều kiện trong chiến dịch.</span></div>
                <div className="flex items-start gap-2"><CheckCircleOutlined className="text-emerald-600 mt-0.5" /><span>Mức hỗ trợ được xác định theo chính sách từng chiến dịch.</span></div>
                <div className="flex items-start gap-2"><CheckCircleOutlined className="text-emerald-600 mt-0.5" /><span>Hồ sơ được xét duyệt minh bạch bởi Admin Edunity.</span></div>
              </div>

              <Button type="primary" block className="mt-5 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 border-none font-bold text-[11px]">Nộp hồ sơ ngay (Còn 6 ngày)</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
