import { Row, Col } from "antd";
import TeacherWelcomeHero from "./components/TeacherWelcomeHero";
import DashboardStatCard from "../../../components/dashboard/DashboardStatCard";
import TodaySchedule from "./components/TodaySchedule";
import TeachingClasses from "./components/TeachingClasses";
import RecentStudents from "./components/RecentStudents";
import RecentMessages from "./components/RecentMessages";
import TeacherRevenue from "./components/TeacherRevenue";
import { teacherStats } from "../../../data/mockTeacherDashboard";
import { 
  BookOutlined, 
  TeamOutlined, 
  DollarOutlined, 
  StarOutlined,
  SafetyCertificateFilled
} from "@ant-design/icons";

export default function TeacherHomePage() {
  return (
    <div className="flex flex-col gap-5 w-full">
      <TeacherWelcomeHero />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title={teacherStats.activeClasses.label}
            value={teacherStats.activeClasses.value}
            icon={<BookOutlined />}
            trend={teacherStats.activeClasses.trend}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title={teacherStats.totalStudents.label}
            value={teacherStats.totalStudents.value}
            icon={<TeamOutlined />}
            trend={teacherStats.totalStudents.trend}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title={teacherStats.monthlyRevenue.label}
            value={teacherStats.monthlyRevenue.value}
            icon={<DollarOutlined />}
            trend={teacherStats.monthlyRevenue.trend}
            suffix="đ"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title={teacherStats.averageRating.label}
            value={teacherStats.averageRating.value}
            icon={<StarOutlined />}
            detail={teacherStats.averageRating.suffix}
          />
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        {/* Left Column */}
        <Col xs={24} xl={16} className="flex flex-col gap-5">
          <TodaySchedule />
          <TeachingClasses />
          <TeacherRevenue />
        </Col>
        
        {/* Right Column */}
        <Col xs={24} xl={8} className="flex flex-col gap-5">
          <RecentStudents />
          <RecentMessages />
          
          <div className="relative overflow-hidden rounded-2xl bg-indigo-50 p-4 flex items-center gap-3 mt-1 shadow-sm">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
              <SafetyCertificateFilled className="text-[20px]" />
            </div>
            <div className="flex flex-col">
              <h4 className="font-bold text-gray-800 text-[14px] m-0">Giáo viên xuất sắc tuần</h4>
              <p className="text-[12px] text-gray-500 leading-tight mt-0.5 mb-0">Tỉ lệ phản hồi câu hỏi học viên 100% trong vòng 15 phút.</p>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}