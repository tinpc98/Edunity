import { Row, Col } from "antd";
import AdminWelcomeHero from "./components/AdminWelcomeHero";
import DashboardStatCard from "../../../components/dashboard/DashboardStatCard";
import AdminQuickActions from "./components/AdminQuickActions";
import PendingTasks from "./components/PendingTasks";
import PendingTeachers from "./components/PendingTeachers";
import ScholarshipOverview from "./components/ScholarshipOverview";
import TrainingOverview from "./components/TrainingOverview";
import RecentActivities from "./components/RecentActivities";
import AdminFinanceOverview from "./components/AdminFinanceOverview";
import { adminStats } from "../../../data/mockAdminDashboard";
import { 
  TeamOutlined, 
  SafetyCertificateOutlined, 
  BookOutlined, 
  DollarOutlined 
} from "@ant-design/icons";

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-5 w-full">
      <AdminWelcomeHero />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title={adminStats.totalUsers.label}
            value={adminStats.totalUsers.value}
            icon={<TeamOutlined />}
            trend={adminStats.totalUsers.trend}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title={adminStats.verifiedTeachers.label}
            value={adminStats.verifiedTeachers.value}
            icon={<SafetyCertificateOutlined />}
            trend={adminStats.verifiedTeachers.trend}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title={adminStats.activeClasses.label}
            value={adminStats.activeClasses.value}
            icon={<BookOutlined />}
            detail={adminStats.activeClasses.detail}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title={adminStats.monthlyRevenue.label}
            value={adminStats.monthlyRevenue.value}
            icon={<DollarOutlined />}
            trend={adminStats.monthlyRevenue.trend}
            suffix="đ"
          />
        </Col>
      </Row>

      <AdminQuickActions />

      <Row gutter={[20, 20]}>
        {/* Left Column */}
        <Col xs={24} xl={17} className="flex flex-col gap-5">
          <PendingTasks />
          <PendingTeachers />
          <AdminFinanceOverview />
        </Col>
        
        {/* Right Column */}
        <Col xs={24} xl={7} className="flex flex-col gap-5">
          <ScholarshipOverview />
          <TrainingOverview />
          <RecentActivities />
        </Col>
      </Row>
    </div>
  );
}