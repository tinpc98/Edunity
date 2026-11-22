import { Link } from "react-router-dom";
import { Breadcrumb } from "antd";
import { HomeOutlined, StarFilled } from "@ant-design/icons";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";

interface ClassDetailHeaderProps {
  item: ClassDiscoveryItem;
}

export default function ClassDetailHeader({ item }: ClassDetailHeaderProps) {
  const isFree = item.classType === "FREE";

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          {
            title: (
              <Link
                to="/"
                className="text-[#64748B] hover:text-[#0D9488] flex items-center gap-1.5 text-xs transition-colors"
              >
                <HomeOutlined />
                <span>Trang chủ</span>
              </Link>
            ),
          },
          {
            title: (
              <Link
                to="/classes"
                className="text-[#64748B] hover:text-[#0D9488] text-xs transition-colors"
              >
                Khám phá lớp học
              </Link>
            ),
          },
          {
            title: (
              <span className="text-[#163B40] font-semibold text-xs truncate max-w-xs">
                {item.className}
              </span>
            ),
          },
        ]}
      />

      {/* Main Class Information Card */}
      <div className="bg-white rounded-2xl border border-[#D6E5E2] p-6 shadow-xs flex flex-col gap-4">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {item.gradeLabel && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4]">
              {item.gradeLabel}
            </span>
          )}
          {item.subjectName && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#F0FDFA] text-[#0D9488] border border-[#99F6E4]/70">
              {item.subjectName}
            </span>
          )}
          {isFree ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4]">
              Lớp miễn phí
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/70">
              Có học phí
            </span>
          )}
        </div>

        {/* Primary Title: Class Name */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#163B40] tracking-tight leading-snug !mb-1">
            {item.className}
          </h1>

          {/* Secondary Context: Course Title */}
          {item.courseTitle && (
            <div className="text-sm font-medium text-slate-500 flex items-center gap-1.5 mt-1">
              <span>Thuộc khóa học:</span>
              <span className="text-[#334155] font-semibold">{item.courseTitle}</span>
            </div>
          )}
        </div>

        {/* Teacher Summary Line (Compact, no avatar) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-2 border-t border-[#D6E5E2]/60">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Giảng viên:</span>
            <span className="font-semibold text-[#163B40]">{item.teacherName}</span>
          </div>

          <div className="flex items-center gap-1 font-semibold text-[#163B40]">
            <StarFilled className="text-amber-400 text-xs" />
            <span>{item.ratingAverage.toFixed(1)}</span>
            <span className="text-slate-400 font-normal">({item.ratingCount} đánh giá)</span>
          </div>
        </div>

        {/* Class Description: Appeared ONCE only */}
        <div className="mt-2 pt-4 border-t border-[#D6E5E2]/60">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-2">
            Giới thiệu lớp học
          </div>
          {item.description ? (
            <p className="text-sm text-slate-600 leading-relaxed m-0 whitespace-pre-line">{item.description}</p>
          ) : (
            <p className="text-sm text-slate-400 italic leading-relaxed m-0">
              Giáo viên chưa cập nhật phần giới thiệu cho lớp học này.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
