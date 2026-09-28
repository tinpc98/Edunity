import { StarFilled, UserOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { Button } from "antd";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";

interface ClassTeacherTabProps {
  item: ClassDiscoveryItem;
}

export default function ClassTeacherTab({ item }: ClassTeacherTabProps) {
  const qualification = item.qualificationSummary || item.teacherTitle;
  const teacherBio = item.teacherBiography;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col gap-5">
      {/* Tab Heading */}
      <div className="pb-3 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900 m-0">Giảng viên phụ trách</h2>
      </div>

      {/* Teacher Profile Card Content */}
      <div className="flex flex-col sm:flex-row items-start gap-4">
        {item.teacherAvatar ? (
          <img
            src={item.teacherAvatar}
            alt={item.teacherName}
            className="w-16 h-16 rounded-full object-cover border-2 border-indigo-100 shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xl shrink-0">
            <UserOutlined />
          </div>
        )}

        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-900 m-0">{item.teacherName}</h3>

          {qualification && (
            <div className="text-xs font-semibold text-indigo-600 mt-1">
              {qualification}
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-slate-700">
            <StarFilled className="text-amber-400" />
            <span>{item.ratingAverage.toFixed(1)}</span>
            <span className="text-slate-400 font-normal">({item.ratingCount} đánh giá)</span>
          </div>

          {/* Biography */}
          {teacherBio && (
            <p className="text-sm text-slate-600 leading-relaxed mt-4 pt-3 border-t border-slate-100 m-0">
              {teacherBio}
            </p>
          )}

          {/* Action button */}
          <div className="mt-5">
            <Button
              type="default"
              className="rounded-xl border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-400 font-semibold text-xs h-9 px-4 inline-flex items-center gap-1.5 shadow-2xs"
            >
              <span>Xem hồ sơ giáo viên</span>
              <ArrowRightOutlined className="text-[10px]" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
