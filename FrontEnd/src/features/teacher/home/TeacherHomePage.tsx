import { Row, Col, Skeleton } from "antd";
import TeacherWelcomeHero from "./components/TeacherWelcomeHero";
import DashboardStatCard from "../../../components/dashboard/DashboardStatCard";
import TodaySchedule from "./components/TodaySchedule";
import TeachingClasses from "./components/TeachingClasses";
import RecentStudents from "./components/RecentStudents";
import RecentMessages from "./components/RecentMessages";
import TeacherRevenue from "./components/TeacherRevenue";
import { useTeacherDashboard } from "./hooks/useTeacherDashboard";
import { 
  BookOutlined, 
  TeamOutlined, 
  DollarOutlined, 
  StarOutlined,
  SafetyCertificateFilled
} from "@ant-design/icons";

export default function TeacherHomePage() {
  const {
    teacherName,
    ratingAverage,
    ratingCount,
    classes,
    classesTotal,
    activeClassesCount,
    totalStudents,
    todaySessions,
    nextSession,
    totalGrossRevenue,
    totalCommission,
    totalNetRevenue,
    monthlyRevenueData,
    conversations,
    isLoading,
  } = useTeacherDashboard();

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

  return (
    <div className="flex flex-col gap-5 w-full max-w-full overflow-x-hidden">
      <TeacherWelcomeHero 
        teacherName={teacherName} 
        nextSession={nextSession} 
        todaySessionsCount={todaySessions.length} 
      />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title="Lớp đang dạy"
            value={activeClassesCount}
            icon={<BookOutlined />}
            detail={`Tổng ${classesTotal} lớp học`}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title="Học viên đang theo học"
            value={totalStudents.toLocaleString("vi-VN")}
            icon={<TeamOutlined />}
            detail="Tổng số lượt đăng ký đã xác nhận"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title="Thu nhập thực nhận"
            value={totalNetRevenue.toLocaleString("vi-VN")}
            icon={<DollarOutlined />}
            suffix="đ"
            detail={`Doanh thu: ${totalGrossRevenue.toLocaleString("vi-VN")}đ`}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <DashboardStatCard 
            title="Đánh giá trung bình"
            value={ratingAverage > 0 ? ratingAverage.toFixed(1) : "0.0"}
            icon={<StarOutlined />}
            detail={ratingCount > 0 ? `(${ratingCount} nhận xét)` : "(Chưa có nhận xét)"}
          />
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        {/* Left Column */}
        <Col xs={24} xl={16} className="flex flex-col gap-5">
          <TodaySchedule todaySessions={todaySessions} />
          <TeachingClasses classes={classes} total={classesTotal} />
          <TeacherRevenue 
            gross={totalGrossRevenue}
            commission={totalCommission}
            net={totalNetRevenue}
            monthlyData={monthlyRevenueData}
          />
        </Col>
        
        {/* Right Column */}
        <Col xs={24} xl={8} className="flex flex-col gap-5">
          <RecentStudents classes={classes} total={classesTotal} />
          <RecentMessages conversations={conversations} />
          
          <div className="relative overflow-hidden rounded-2xl bg-indigo-50 p-4 flex items-center gap-3 mt-1 shadow-sm">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
              <SafetyCertificateFilled className="text-[20px]" />
            </div>
            <div className="flex flex-col">
              <h4 className="font-bold text-gray-800 text-[14px] m-0">Giảng viên tiêu chuẩn Edunity</h4>
              <p className="text-[12px] text-gray-500 leading-tight mt-0.5 mb-0">Hồ sơ đã xác minh và hoạt động tích cực trên nền tảng.</p>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}