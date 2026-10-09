import { Typography, Button, List, Tag } from "antd";
import { 
  IdcardOutlined, 
  ReadOutlined, 
  SyncOutlined, 
  QuestionCircleOutlined, 
  CheckSquareOutlined, 
  BookOutlined,
  CheckCircleOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { AdminDashboardPending } from "../../../../types/adminDashboard";

const { Title, Text } = Typography;

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
    switch(type) {
      case 'teacher': return { icon: IdcardOutlined, bg: 'bg-amber-50', text: 'text-amber-600', tagColor: 'gold' };
      case 'scholarship': return { icon: ReadOutlined, bg: 'bg-indigo-50', text: 'text-indigo-600', tagColor: 'geekblue' };
      case 'transaction': return { icon: SyncOutlined, bg: 'bg-rose-50', text: 'text-rose-600', tagColor: 'error' };
      case 'complaint': return { icon: QuestionCircleOutlined, bg: 'bg-orange-50', text: 'text-orange-600', tagColor: 'volcano' };
      case 'class': return { icon: BookOutlined, bg: 'bg-teal-50', text: 'text-teal-600', tagColor: 'cyan' };
      case 'course': return { icon: BookOutlined, bg: 'bg-purple-50', text: 'text-purple-600', tagColor: 'purple' };
      default: return { icon: CheckSquareOutlined, bg: 'bg-gray-50', text: 'text-gray-600', tagColor: 'default' };
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
        route: "/admin/payments",
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
    <div id="urgent-tasks-section" className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${tasks.length > 0 ? "bg-rose-500 animate-ping" : "bg-emerald-500"}`}></span>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Cần xử lý gấp</Title>
        </div>
        <Text type="secondary" className="text-[11px]">Ưu tiên theo thời gian tồn đọng</Text>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-xl text-center">
          <CheckCircleOutlined className="text-3xl text-emerald-500 mb-2" />
          <Text strong className="text-[14px] text-gray-700">Tất cả tác vụ đã được giải quyết</Text>
          <Text type="secondary" className="text-[12px] mt-0.5">Không có công việc tồn đọng cần can thiệp tại thời điểm này.</Text>
        </div>
      ) : (
        <List
          dataSource={tasks}
          split={false}
          renderItem={(task) => {
            const config = getIconConfig(task.type);
            const isUrgent = task.type === 'transaction' || task.type === 'complaint';
            const IconComponent = config.icon;
            
            return (
              <div className={`mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl transition-all ${isUrgent ? 'bg-rose-50/50 hover:bg-rose-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-lg ${config.bg} ${config.text} flex items-center justify-center shrink-0 shadow-sm`}>
                    <IconComponent className="text-[18px]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <Text strong className="text-[13px]">{task.title}</Text>
                      <Tag color={config.tagColor} className="m-0 border-0 font-bold rounded-full px-1.5 py-0 text-[10px] leading-tight">
                        {task.count > 0 ? `(${task.count})` : ''} 
                      </Tag>
                    </div>
                    <Text type="secondary" className="text-[12px] leading-tight">{task.desc}</Text>
                  </div>
                </div>

                <Button 
                  onClick={() => navigate(task.route)}
                  className={`rounded-lg h-8 px-3 text-[12px] font-semibold border-0 shrink-0 self-end sm:self-center shadow-sm cursor-pointer ${
                    isUrgent ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {task.actionLabel}
                </Button>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
