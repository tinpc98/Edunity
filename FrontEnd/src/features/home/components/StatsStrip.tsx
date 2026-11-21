import { CheckCircleFilled, VideoCameraFilled, TeamOutlined, StarFilled } from "@ant-design/icons";
import { STATS_ITEMS } from "../../../data/homeData";

export default function StatsStrip() {
  return (
    <div className="mt-6 bg-white rounded-xl border border-[#D6E5E2] shadow-xs py-6 px-3 grid grid-cols-4 divide-x divide-[#D6E5E2]/70">
      {STATS_ITEMS.map((item:any, idx:any) => (
        <div key={idx} className="px-5 flex items-center gap-3.5 first:pl-2 last:pr-2">
          <div className="w-11 h-11 rounded-lg bg-[#CCFBF1] text-[#0D9488] flex items-center justify-center text-sm shrink-0">
            {idx === 0 && <CheckCircleFilled className="text-[#0D9488]" />}
            {idx === 1 && <VideoCameraFilled className="text-rose-500" />}
            {idx === 2 && <TeamOutlined className="text-[#0F766E]" />}
            {idx === 3 && <StarFilled className="text-amber-500" />}
          </div>
          <div>
            <h4 className="text-[12px] font-extrabold text-[#163B40] leading-snug">{item.title}</h4>
            <p className="text-[11px] text-[#64748B] leading-snug mt-0.5">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
