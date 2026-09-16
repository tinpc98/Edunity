import { CheckCircleFilled, VideoCameraFilled, TeamOutlined, StarFilled } from "@ant-design/icons";
import { STATS_ITEMS } from "../../../data/homeData";

export default function StatsStrip() {
  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-xs py-6 px-3 grid grid-cols-4 divide-x divide-slate-100">
      {STATS_ITEMS.map((item:any, idx:any) => (
        <div key={idx} className="px-5 flex items-center gap-3.5 first:pl-2 last:pr-2">
          <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm shrink-0">
            {idx === 0 && <CheckCircleFilled className="text-indigo-600" />}
            {idx === 1 && <VideoCameraFilled className="text-rose-500" />}
            {idx === 2 && <TeamOutlined className="text-emerald-600" />}
            {idx === 3 && <StarFilled className="text-amber-500" />}
          </div>
          <div>
            <h4 className="text-[12px] font-extrabold text-slate-800 leading-snug">{item.title}</h4>
            <p className="text-[10px] text-slate-500 leading-snug mt-0.5">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
