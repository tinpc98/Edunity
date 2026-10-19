import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Progress, Skeleton } from "antd";
import { CheckCircleOutlined, ArrowRightOutlined, FileTextOutlined, HeartOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useHomeCampaigns } from "../hooks/useHomeData";
import { useAuthStore } from "../../../stores/auth.store";
import { ROUTES } from "../../../routes/routePaths";
import { formatVND } from "../../../types/payment";
import { daysUntil, formatCompactVND, formatDateVN } from "../../../utils/campaign";

export default function ScholarshipSection() {
  const { data, isLoading } = useHomeCampaigns();
  const isStudent = useAuthStore((state) => state.isAuthenticated && state.user?.role === "STUDENT");

  const campaigns = useMemo(() => data?.items ?? [], [data]);
  const featured = campaigns.find((c) => c.isAcceptingApplications) ?? campaigns[0];

  const stats = useMemo(
    () => ({
      slots: campaigns.reduce((sum, c) => sum + c.expectedSlots, 0),
      funded: campaigns.reduce((sum, c) => sum + c.fundedAmount, 0),
      active: data?.total ?? 0,
    }),
    [campaigns, data?.total]
  );

  // Students apply from their own portal; everyone else sees the public campaign page
  const detailLink = (id: string) => (isStudent ? `${ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}/${id}` : `/campaigns/${id}`);
  const listLink = isStudent ? ROUTES.STUDENT.SCHOLARSHIP_EXPLORE : ROUTES.CAMPAIGNS;
  const daysLeft = featured?.isAcceptingApplications ? daysUntil(featured.applicationEnd) : null;

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
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur"><div className="text-[20px] font-black">{isLoading ? "…" : stats.slots.toLocaleString("vi-VN")}</div><div className="text-[9.5px] text-indigo-100 mt-1">Suất học bổng dự kiến</div></div>
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur"><div className="text-[20px] font-black">{isLoading ? "…" : formatCompactVND(stats.funded)}</div><div className="text-[9.5px] text-indigo-100 mt-1">Tổng quỹ đã gây được</div></div>
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur"><div className="text-[20px] font-black">{isLoading ? "…" : stats.active}</div><div className="text-[9.5px] text-indigo-100 mt-1">Chiến dịch đang hoạt động</div></div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Link to={listLink} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-white text-indigo-700 hover:text-indigo-800 font-bold text-[11px]">Xem các chương trình học bổng <ArrowRightOutlined /></Link>
              {featured && (
                <Link to={detailLink(featured.id)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-white/25 bg-white/15 text-white hover:text-white font-bold text-[11px]"><FileTextOutlined /> Điều kiện & hồ sơ cần nộp</Link>
              )}
            </div>
          </div>

          <div className="col-span-5">
            <div className="bg-white rounded-2xl p-5.5 shadow-xl border border-white/70">
              {isLoading ? (
                <Skeleton active paragraph={{ rows: 6 }} />
              ) : !featured ? (
                <div className="py-6 text-center">
                  <h3 className="text-[15px] font-extrabold text-slate-900">Chưa có chiến dịch đang mở</h3>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-5">Các chương trình học bổng mới sẽ được cập nhật tại đây. Hãy quay lại sau nhé!</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold text-indigo-600">
                      Nhận hồ sơ: {formatDateVN(featured.applicationStart)} – {formatDateVN(featured.applicationEnd)}
                    </span>
                    {featured.isAcceptingApplications ? (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full whitespace-nowrap">Đang nhận đơn</span>
                    ) : (
                      <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full whitespace-nowrap">Đang gây quỹ</span>
                    )}
                  </div>
                  <h3 className="mt-3 text-[16px] font-extrabold text-slate-900 line-clamp-2">{featured.title}</h3>
                  <p className="text-[10px] text-slate-500 mt-1 leading-4 line-clamp-2">{featured.eligibilityCriteria || featured.description}</p>

                  {daysLeft !== null && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-600 px-2.5 py-1 text-[9.5px] font-extrabold">
                      <ClockCircleOutlined /> {daysLeft > 0 ? `Còn ${daysLeft} ngày nhận hồ sơ` : "Hôm nay là hạn cuối nhận hồ sơ"}
                    </div>
                  )}

                  <div className="mt-3.5 rounded-xl bg-indigo-50 p-3.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-500"><span>Tiến độ gây quỹ</span><b className="text-indigo-600">{featured.fundingProgress}%</b></div>
                    <Progress percent={featured.fundingProgress} showInfo={false} strokeColor="#4f46e5" trailColor="#e0e7ff" size="small" />
                    <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1"><span>Đã gây quỹ: <b>{formatCompactVND(featured.fundedAmount)}</b></span><span>Chỉ tiêu: <b>{featured.expectedSlots} suất</b></span></div>
                  </div>

                  <div className="mt-4 space-y-2 text-[10px] text-slate-600">
                    <div className="flex items-start gap-2"><CheckCircleOutlined className="text-emerald-600 mt-0.5" /><span>Mức hỗ trợ: <b className="text-indigo-700">{formatVND(featured.awardAmountPerStudent)}</b> / suất học bổng.</span></div>
                    <div className="flex items-start gap-2"><CheckCircleOutlined className="text-emerald-600 mt-0.5" /><span>Hỗ trợ học phí cho lớp live đủ điều kiện trong chiến dịch.</span></div>
                    <div className="flex items-start gap-2"><CheckCircleOutlined className="text-emerald-600 mt-0.5" /><span>Hồ sơ được xét duyệt minh bạch bởi Admin Edunity.</span></div>
                  </div>

                  <Link
                    to={detailLink(featured.id)}
                    className="mt-5 flex items-center justify-center h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white hover:text-white font-bold text-[11px] transition-colors"
                  >
                    {featured.isAcceptingApplications
                      ? daysLeft
                        ? `Nộp hồ sơ ngay (Còn ${daysLeft} ngày)`
                        : "Nộp hồ sơ ngay"
                      : "Xem chi tiết chiến dịch"}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
