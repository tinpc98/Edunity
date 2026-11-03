import { Row, Col, Skeleton, Alert, Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import TeacherWelcomeHero from "./components/TeacherWelcomeHero";
import DashboardStatCard from "../../../components/dashboard/DashboardStatCard";
import TodaySchedule from "./components/TodaySchedule";
import TeachingClasses from "./components/TeachingClasses";
import RecentStudents from "./components/RecentStudents";
import RecentMessages from "./components/RecentMessages";
import TeacherRevenue from "./components/TeacherRevenue";
import { useTeacherDashboard } from "./hooks/useTeacherDashboard";
import { teacherVerificationService } from "../../../services/teacherVerification.service";
import { useAuthStore } from "../../../stores/auth.store";
import { ROUTES } from "../../../routes/routePaths";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import {
  BookOutlined,
  TeamOutlined,
  DollarOutlined,
  StarOutlined,
  SafetyCertificateFilled,
  ReloadOutlined,
} from "@ant-design/icons";

export default function TeacherHomePage() {
  const { user } = useAuthStore();
  const isTeacher = Boolean(user?.userId && user.role === "TEACHER");

  const {
    data: verification,
    isLoading: isLoadingVerification,
    isError: isVerificationError,
    error: verificationError,
    refetch: refetchVerification,
  } = useQuery({
    queryKey: ["teacherVerification", user?.userId],
    queryFn: () => teacherVerificationService.getMyVerification(),
    enabled: isTeacher,
    staleTime: 30_000,
  });

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

  const verificationStatus = !isVerificationError ? verification?.verificationStatus : undefined;

  const renderVerificationBanner = () => {
    if (!isTeacher) return null;

    if (isLoadingVerification) {
      return (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <Skeleton active title={{ width: 240 }} paragraph={{ rows: 1 }} />
        </div>
      );
    }

    if (isVerificationError || !verification) {
      return (
        <Alert
          type="warning"
          showIcon
          className="rounded-2xl shadow-sm"
          title="Không thể tải trạng thái xác minh hồ sơ"
          description={
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-1">
              <span className="text-sm text-slate-700">
                {getFriendlyErrorMessage(
                  verificationError,
                  "Không thể kiểm tra trạng thái xác minh tài khoản giảng viên lúc này. Vui lòng thử lại."
                )}
              </span>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => refetchVerification()}
                className="self-start sm:self-auto shrink-0"
              >
                Thử lại
              </Button>
            </div>
          }
        />
      );
    }

    if (verification.verificationStatus === "REJECTED") {
      const trimmedReviewNote = verification.reviewNote?.trim();
      return (
        <Alert
          type="error"
          showIcon
          className="rounded-2xl shadow-sm"
          title="Hồ sơ xác minh giảng viên đã bị từ chối"
          description={
            <div className="space-y-2.5 mt-1">
              <p className="m-0 text-sm text-slate-700">
                Hồ sơ chuyên môn của bạn chưa đạt yêu cầu xét duyệt. Bạn có thể cập nhật thông tin và nộp lại tài liệu ngay trên tài khoản hiện tại.
              </p>
              {trimmedReviewNote && (
                <div className="p-3 rounded-xl bg-white border border-rose-200 text-rose-800 text-sm">
                  <strong>Lý do từ chối:</strong> {trimmedReviewNote}
                </div>
              )}
              <div className="pt-0.5">
                <Link to={ROUTES.TEACHER.PROFILE}>
                  <Button type="primary" danger className="font-semibold rounded-lg">
                    Xem lý do và xử lý hồ sơ
                  </Button>
                </Link>
              </div>
            </div>
          }
        />
      );
    }

    if (verification.verificationStatus === "UNVERIFIED") {
      return (
        <Alert
          type="warning"
          showIcon
          className="rounded-2xl shadow-sm"
          title="Bạn chưa hoàn thiện hồ sơ xác minh giảng viên"
          description={
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-1">
              <span className="text-sm text-slate-700">
                Vui lòng bổ sung giấy tờ định danh và bằng cấp chuyên môn để Edunity xét duyệt và kích hoạt quyền tạo lớp học.
              </span>
              <Link
                to={ROUTES.AUTH.TEACHER_QUALIFICATION}
                className="self-start sm:self-auto shrink-0"
              >
                <Button
                  type="primary"
                  className="bg-indigo-600 hover:bg-indigo-700 font-semibold rounded-lg"
                >
                  Hoàn thiện hồ sơ
                </Button>
              </Link>
            </div>
          }
        />
      );
    }

    if (verification.verificationStatus === "PENDING") {
      return (
        <Alert
          type="info"
          showIcon
          className="rounded-2xl shadow-sm"
          title="Hồ sơ xác minh đang chờ Admin xét duyệt"
          description="Edunity đã nhận hồ sơ chuyên môn của bạn và đang tiến hành thẩm định. Quyền tạo lớp học sẽ được kích hoạt ngay sau khi hồ sơ được phê duyệt."
        />
      );
    }

    return null;
  };

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
      {renderVerificationBanner()}

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
          
          {verificationStatus === "VERIFIED" && (
            <div className="relative overflow-hidden rounded-2xl bg-indigo-50 p-4 flex items-center gap-3 mt-1 shadow-sm">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
                <SafetyCertificateFilled className="text-[20px]" />
              </div>
              <div className="flex flex-col">
                <h4 className="font-bold text-gray-800 text-[14px] m-0">Giảng viên tiêu chuẩn Edunity</h4>
                <p className="text-[12px] text-gray-500 leading-tight mt-0.5 mb-0">Hồ sơ đã xác minh và hoạt động tích cực trên nền tảng.</p>
              </div>
            </div>
          )}
        </Col>
      </Row>
    </div>
  );
}
