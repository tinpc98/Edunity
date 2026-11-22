import { Row, Col, Skeleton, Alert, Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import AdminWelcomeHero from "./components/AdminWelcomeHero";
import AdminQuickActions from "./components/AdminQuickActions";
import ScholarshipOverview from "./components/ScholarshipOverview";
import RecentActivities from "./components/RecentActivities";
import AdminFinanceOverview from "./components/AdminFinanceOverview";
import AdminKpiCard from "../../../components/admin/AdminKpiCard";
import { adminDashboardService, adminDashboardKeys } from "../../../services/adminDashboard.service";
import {
  TeamOutlined,
  SafetyCertificateOutlined,
  BookOutlined,
  DollarOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

export default function AdminHomePage() {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: adminDashboardKeys.all,
    queryFn: () => adminDashboardService.getDashboard(),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-full overflow-x-hidden">
        <Skeleton.Node active style={{ width: "100%", height: 160, borderRadius: 20 }} />
        <Row gutter={[16, 16]}>
          {[1, 2, 3, 4].map((i) => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <div className="bg-white p-5 rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)]">
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            </Col>
          ))}
        </Row>
        <div className="bg-white p-6 rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)]">
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
    <div className="flex flex-col gap-6 w-full max-w-full overflow-x-hidden">
      {/* Top Welcome Hero Banner with Live Snapshot */}
      <AdminWelcomeHero
        pending={pending}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      {/* 4 KPI Metric Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <AdminKpiCard
            title="Người dùng toàn hệ thống"
            value={users ? users.total.toLocaleString("vi-VN") : "0"}
            icon={<TeamOutlined />}
            trend={users && users.newThisMonth > 0 ? `+${users.newThisMonth} mới` : "+12.4%"}
            trendDirection="up"
            trendSubtext="tháng này"
            detail={users ? `${users.students} học viên • ${users.teachers} giáo viên` : undefined}
            variant="teal"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <AdminKpiCard
            title="Giáo viên đã xác minh"
            value={users ? users.verifiedTeachers.toLocaleString("vi-VN") : "0"}
            icon={<SafetyCertificateOutlined />}
            trend="+8.2%"
            trendDirection="up"
            trendSubtext="hồ sơ mới"
            detail={users ? `Tổng ${users.teachers} tài khoản giáo viên` : undefined}
            variant="mint"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <AdminKpiCard
            title="Lớp đang hoạt động"
            value={training ? training.activeClasses.toLocaleString("vi-VN") : "0"}
            icon={<BookOutlined />}
            trend="94%"
            trendDirection="neutral"
            trendSubtext="tỷ lệ lịch dạy"
            detail={training ? `${training.upcomingClasses} lớp sắp khai giảng` : undefined}
            variant="sky"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <AdminKpiCard
            title="Doanh thu tháng này"
            value={finance ? finance.revenueThisMonth.toLocaleString("vi-VN") : "0"}
            suffix="đ"
            icon={<DollarOutlined />}
            trend={finance && finance.commission > 0 ? `Hoa hồng: ${finance.commission.toLocaleString("vi-VN")}đ` : undefined}
            trendDirection="up"
            detail={finance ? `${finance.transactions} giao dịch thành công` : undefined}
            variant="teal"
          />
        </Col>
      </Row>

      {/* Quick Action Shortcuts */}
      <AdminQuickActions pending={pending} />

      {/* Main 2-Column Dashboard Grid: Finance Overview on Left, Scholarship & Activities on Right */}
      <Row gutter={[20, 20]}>
        {/* Left Column: Live Filtered Financial Overview */}
        <Col xs={24} xl={15} className="flex flex-col gap-6">
          <AdminFinanceOverview finance={finance} />
        </Col>

        {/* Right Column: Scholarship & Recent Activities */}
        <Col xs={24} xl={9} className="flex flex-col gap-6">
          <ScholarshipOverview scholarship={scholarship} />
          <RecentActivities activities={recentActivities} />
        </Col>
      </Row>
    </div>
  );
}
