import { Row, Col, Skeleton, Alert, Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import AdminWelcomeHero from "./components/AdminWelcomeHero";
import DashboardStatCard from "../../../components/dashboard/DashboardStatCard";
import AdminQuickActions from "./components/AdminQuickActions";
import PendingTasks from "./components/PendingTasks";
import PendingTeachers from "./components/PendingTeachers";
import ScholarshipOverview from "./components/ScholarshipOverview";
import TrainingOverview from "./components/TrainingOverview";
import RecentActivities from "./components/RecentActivities";
import AdminFinanceOverview from "./components/AdminFinanceOverview";
import { adminDashboardService, adminDashboardKeys } from "../../../services/adminDashboard.service";
import { 
  TeamOutlined, 
  SafetyCertificateOutlined, 
  BookOutlined, 
  DollarOutlined,
  ReloadOutlined
} from "@ant-design/icons";

export default function AdminHomePage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: adminDashboardKeys.all,
    queryFn: () => adminDashboardService.getDashboard(),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 w-full max-w-full overflow-x-hidden">
        <Skeleton.Node active style={{ width: '100%', height: 160, borderRadius: 20 }} />
        <Row gutter={[16, 16]}>
          {[1, 2, 3, 4].map((i) => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            </Col>
          ))}
        </Row>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-5 w-full max-w-full overflow-x-hidden py-6">
        <Alert
          type="error"
          showIcon
          message="Không thể tải dữ liệu bảng điều khiển Quản trị viên"
          description={
            (error as Error)?.message ||
            "Đã xảy ra lỗi khi kết nối với máy chủ. Vui lòng thử lại sau."
          }
          action={
            <Button 
              type="primary" 
              danger 
              icon={<ReloadOutlined />} 
              onClick={() => refetch()}
            >
              Thử lại
            </Button>
          }
        />
      </div>
    );
  }

  const users = data?.users;
  const training = data?.training;
  const finance = data?.finance;
  const pending = data?.pending;
  const scholarship = data?.scholarship;
  const recentActivities = data?.recentActivities || [];

  return (
    <div className="flex flex-col gap-5 w-full max-w-full overflow-x-hidden">
      <AdminWelcomeHero pending={pending} />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title="Người dùng toàn hệ thống"
            value={users ? users.total.toLocaleString("vi-VN") : 0}
            icon={<TeamOutlined />}
            trend={users && users.newThisMonth > 0 ? `+${users.newThisMonth} mới` : undefined}
            detail={users ? `${users.students} học viên • ${users.teachers} giáo viên` : undefined}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title="Giáo viên đã xác minh"
            value={users ? users.verifiedTeachers.toLocaleString("vi-VN") : 0}
            icon={<SafetyCertificateOutlined />}
            detail={users ? `Tổng ${users.teachers} tài khoản giáo viên` : undefined}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title="Lớp đang hoạt động"
            value={training ? training.activeClasses.toLocaleString("vi-VN") : 0}
            icon={<BookOutlined />}
            detail={training ? `${training.upcomingClasses} lớp sắp khai giảng` : undefined}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title="Doanh thu tháng này"
            value={finance ? finance.revenueThisMonth.toLocaleString("vi-VN") : "0"}
            icon={<DollarOutlined />}
            suffix="đ"
            detail={finance ? `Hoa hồng: ${finance.commission.toLocaleString("vi-VN")}đ` : undefined}
          />
        </Col>
      </Row>

      <AdminQuickActions pending={pending} />

      <Row gutter={[20, 20]}>
        {/* Left Column */}
        <Col xs={24} xl={17} className="flex flex-col gap-5">
          <PendingTasks pending={pending} />
          <PendingTeachers />
          <AdminFinanceOverview finance={finance} />
        </Col>
        
        {/* Right Column */}
        <Col xs={24} xl={7} className="flex flex-col gap-5">
          <ScholarshipOverview scholarship={scholarship} />
          <TrainingOverview training={training} />
          <RecentActivities activities={recentActivities} />
        </Col>
      </Row>
    </div>
  );
}