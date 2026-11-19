import { List } from "antd";
import {
  IdcardOutlined,
  ReadOutlined,
  SyncOutlined,
  QuestionCircleOutlined,
  CheckSquareOutlined,
  BookOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { AdminDashboardPending } from "../../../../types/adminDashboard";
import AdminSectionCard from "../../../../components/admin/AdminSectionCard";

interface PendingTasksProps {
  pending?: AdminDashboardPending;
}

interface UrgentTaskItem {
  id: string;
  type: "teacher" | "scholarship" | "transaction" | "complaint" | "class" | "course";
  title: string;
  count: number;
  desc: string;
  route: string;
  actionLabel: string;
}

export default function PendingTasks({ pending }: PendingTasksProps) {
  const navigate = useNavigate();

  const getIconConfig = (type: string) => {
    switch (type) {
      case "teacher":
        return {
          icon: IdcardOutlined,
          bg: "bg-amber-50",
          text: "text-amber-700",
          badgeBg: "bg-amber-100 text-amber-800",
        };
      case "scholarship":
        return {
          icon: ReadOutlined,
          bg: "bg-indigo-50",
          text: "text-indigo-700",
          badgeBg: "bg-indigo-100 text-indigo-800",
        };
      case "transaction":
        return {
          icon: SyncOutlined,
          bg: "bg-rose-50",
          text: "text-rose-700",
          badgeBg: "bg-rose-100 text-rose-800",
        };
      case "complaint":
        return {
          icon: QuestionCircleOutlined,
          bg: "bg-orange-50",
          text: "text-orange-700",
          badgeBg: "bg-orange-100 text-orange-800",
        };
      case "class":
        return {
          icon: BookOutlined,
          bg: "bg-teal-50",
          text: "text-teal-700",
          badgeBg: "bg-teal-100 text-teal-800",
        };
      case "course":
        return {
          icon: BookOutlined,
          bg: "bg-purple-50",
          text: "text-purple-700",
          badgeBg: "bg-purple-100 text-purple-800",
        };
      default:
        return {
          icon: CheckSquareOutlined,
          bg: "bg-slate-50",
          text: "text-slate-700",
          badgeBg: "bg-slate-100 text-slate-800",
        };
    }
  };

  const tasks: UrgentTaskItem[] = [];

  if (pending) {
    if (pending.teacherVerifications > 0) {
      tasks.push({
        id: "task-teachers",
        type: "teacher",
        title: `${pending.teacherVerifications} Giáo viên gửi hồ sơ xác minh`,
        count: pending.teacherVerifications,
        desc: "Hồ sơ bằng cấp, chứng chỉ chuyên môn đang chờ phê duyệt",
        route: "/admin/teachers/verifications",
        actionLabel: "Xem danh sách",
      });
    }

    if (pending.scholarshipApplications > 0) {
      tasks.push({
        id: "task-scholarships",
        type: "scholarship",
        title: `${pending.scholarshipApplications} Hồ sơ học bổng cần thẩm định`,
        count: pending.scholarshipApplications,
        desc: "Đơn xin tài trợ học bổng gửi từ học sinh khó khăn",
        route: "/admin/scholarship-applications",
        actionLabel: "Xử lý hồ sơ",
      });
    }

    if (pending.classApprovals > 0) {
      tasks.push({
        id: "task-classes",
        type: "class",
        title: `${pending.classApprovals} Lớp học mới chờ duyệt`,
        count: pending.classApprovals,
        desc: "Các lớp do giáo viên khởi tạo đang chờ kiểm duyệt nội dung",
        route: "/admin/classes",
        actionLabel: "Duyệt lớp học",
      });
    }

    if (pending.courseProposals > 0) {
      tasks.push({
        id: "task-courses",
        type: "course",
        title: `${pending.courseProposals} Đề xuất khóa học cần xem xét`,
        count: pending.courseProposals,
        desc: "Đề xuất chương trình đào tạo mới gửi lên từ giáo viên",
        route: "/admin/course-proposals",
        actionLabel: "Xem đề xuất",
      });
    }

    if (pending.refundsRequired > 0) {
      tasks.push({
        id: "task-refunds",
        type: "transaction",
        title: `${pending.refundsRequired} Giao dịch yêu cầu hoàn tiền`,
        count: pending.refundsRequired,
        desc: "Các giao dịch hoàn tiền phát sinh cần kiểm tra đối soát",
        route: "/admin/refunds",
        actionLabel: "Kiểm tra ngay",
      });
    }

    if (pending.reports > 0) {
      tasks.push({
        id: "task-reports",
        type: "complaint",
        title: `${pending.reports} Khiếu nại / Báo cáo đang mở`,
        count: pending.reports,
        desc: "Báo cáo vi phạm hoặc khiếu nại từ người dùng hệ thống",
        route: "/admin/reports",
        actionLabel: "Xem chi tiết",
      });
    }
  }

  return (
    <AdminSectionCard
      title="Cần xử lý gấp"
      subtitle="Ưu tiên theo thời gian tồn đọng và mức độ cấp thiết"
      icon={<SyncOutlined className={tasks.length > 0 ? "animate-spin" : ""} />}
      badge={
        tasks.length > 0 ? (
          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
            {tasks.length} hạng mục
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
            0 tồn đọng
          </span>
        )
      }
    >
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 bg-[#F0F8F6] rounded-xl text-center border border-[#D6E5E2]">
          <CheckCircleOutlined className="text-3xl text-emerald-600 mb-2" />
          <p className="text-sm font-bold text-[#163B40]">
            Tất cả tác vụ đã được giải quyết
          </p>
          <p className="text-xs text-[#64748B] mt-1">
            Không có công việc tồn đọng cần can thiệp tại thời điểm này.
          </p>
        </div>
      ) : (
        <List
          dataSource={tasks}
          split={false}
          renderItem={(task) => {
            const config = getIconConfig(task.type);
            const isUrgent = task.type === "transaction" || task.type === "complaint";
            const IconComponent = config.icon;

            return (
              <div
                key={task.id}
                className={`mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                  isUrgent
                    ? "bg-rose-50/40 border-rose-200/80 hover:bg-rose-50/70"
                    : "bg-[#F0F8F6] border-[#D6E5E2] hover:bg-[#E5F5F1] hover:border-[#99F6E4]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${config.bg} ${config.text} flex items-center justify-center text-lg shrink-0 shadow-2xs`}
                  >
                    <IconComponent />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#163B40]">
                        {task.title}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${config.badgeBg}`}
                      >
                        {task.count}
                      </span>
                    </div>
                    <span className="text-xs text-[#64748B] leading-tight">
                      {task.desc}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => navigate(task.route)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 self-end sm:self-center transition-all cursor-pointer ${
                    isUrgent
                      ? "bg-rose-600 text-white hover:bg-rose-700 shadow-xs"
                      : "bg-white text-[#0F766E] border border-[#D6E5E2] hover:bg-[#0D9488] hover:text-white shadow-2xs"
                  }`}
                >
                  <span>{task.actionLabel}</span>
                  <ArrowRightOutlined className="text-[10px]" />
                </button>
              </div>
            );
          }}
        />
      )}
    </AdminSectionCard>
  );
}
