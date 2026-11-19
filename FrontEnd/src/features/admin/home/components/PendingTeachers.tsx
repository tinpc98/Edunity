import { Avatar, Skeleton } from "antd";
import { ArrowRightOutlined, CheckOutlined, UserOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { teacherVerificationService } from "../../../../services/teacherVerification.service";
import type { AdminTeacherVerificationListItem } from "../../../../types/teacherVerification";
import AdminSectionCard from "../../../../components/admin/AdminSectionCard";
import AdminStatusBadge from "../../../../components/admin/AdminStatusBadge";

export default function PendingTeachers() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-pending-teachers-preview"],
    queryFn: () => teacherVerificationService.adminListVerifications("PENDING", 1, 3),
  });

  const rawData = data as any;
  const items: AdminTeacherVerificationListItem[] = rawData?.items || rawData?.data || [];
  const total = rawData?.total ?? rawData?.paging?.total ?? items.length;

  const formatDate = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      return new Date(isoString).toLocaleDateString("vi-VN");
    } catch {
      return "-";
    }
  };

  return (
    <AdminSectionCard
      title="Giáo viên chờ xác minh"
      subtitle="Hồ sơ bằng cấp, chứng chỉ chuyên môn đang chờ thẩm định"
      icon={<UserOutlined />}
      badge={
        <span className="px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] text-xs font-bold">
          {total} đang chờ
        </span>
      }
      extra={
        <button
          onClick={() => navigate("/admin/teachers/verifications")}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#0F766E] hover:text-[#0D9488] transition-colors cursor-pointer"
        >
          <span>Xem tất cả ({total})</span>
          <ArrowRightOutlined className="text-[10px]" />
        </button>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-3 py-2">
          <Skeleton active avatar paragraph={{ rows: 1 }} />
          <Skeleton active avatar paragraph={{ rows: 1 }} />
        </div>
      ) : items.length === 0 ? (
        <div className="py-6 px-4 bg-[#F0F8F6] rounded-xl text-center border border-[#D6E5E2]">
          <p className="text-xs text-[#64748B] font-medium">
            Hiện tại không có giáo viên nào đang chờ xác minh.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((teacher: AdminTeacherVerificationListItem) => (
            <div
              key={teacher.teacherId}
              className="flex flex-col md:flex-row md:items-center justify-between p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] hover:bg-[#E5F5F1] hover:border-[#99F6E4] transition-all gap-3"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  shape="square"
                  size={42}
                  icon={<UserOutlined />}
                  className="rounded-xl shadow-2xs shrink-0 bg-[#CCFBF1] text-[#0F766E] font-bold border border-[#99F6E4]"
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#163B40] truncate">
                      {teacher.fullName || teacher.email}
                    </span>
                    <AdminStatusBadge label="Chờ duyệt" type="warning" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#64748B]">
                    <span className="font-semibold text-[#334155] truncate">{teacher.email}</span>
                    <span>•</span>
                    <span className="text-[#64748B]">
                      Cập nhật: {formatDate(teacher.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <button
                  onClick={() =>
                    navigate(`/admin/teachers/verifications/${teacher.teacherId}`)
                  }
                  className="px-3 py-1.5 rounded-lg border border-[#D6E5E2] bg-white hover:bg-[#E5F5F1] text-[#163B40] text-xs font-bold shadow-2xs transition-all cursor-pointer"
                >
                  Xem hồ sơ
                </button>
                <button
                  onClick={() =>
                    navigate(`/admin/teachers/verifications/${teacher.teacherId}`)
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0D9488] hover:bg-[#0B746C] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <CheckOutlined className="text-[11px]" />
                  <span>Thẩm định</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminSectionCard>
  );
}
