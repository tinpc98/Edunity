import { Outlet, Link } from "react-router-dom";
import { useAuthStore } from "../../stores/auth.store";
import DashboardShell from "../dashboard/DashboardShell";
import { ROUTES } from "../../routes/routePaths";
import {
  DashboardOutlined,
  BookOutlined,
  CalendarOutlined,
  MessageOutlined,
  StarOutlined,
  WalletOutlined,
  IdcardOutlined,
  AppstoreOutlined,
  FileTextOutlined,
} from "@ant-design/icons";

const teacherMenuItems = [
  {
    key: ROUTES.TEACHER.HOME,
    icon: <DashboardOutlined className="text-[18px]" />,
    label: <Link to={ROUTES.TEACHER.HOME}>Tổng quan</Link>,
  },
  {
    type: 'group',
    label: 'GIẢNG DẠY',
    children: [
      {
        key: ROUTES.TEACHER.CLASSES,
        icon: <BookOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.TEACHER.CLASSES}>Lớp của tôi</Link>,
      },
      {
        key: (ROUTES.TEACHER as any).COURSES || "/teacher/courses",
        icon: <AppstoreOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.TEACHER as any).COURSES || "/teacher/courses"}>Danh mục khóa học</Link>,
      },
      {
        key: (ROUTES.TEACHER as any).COURSE_PROPOSALS || "/teacher/course-proposals",
        icon: <FileTextOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.TEACHER as any).COURSE_PROPOSALS || "/teacher/course-proposals"}>Đề xuất khóa học</Link>,
      },
      {
        key: (ROUTES.TEACHER as any).SCHEDULE || "/teacher/schedule",
        icon: <CalendarOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.TEACHER as any).SCHEDULE || "/teacher/schedule"}>Lịch giảng dạy</Link>,
      },
    ]
  },
  {
    type: 'group',
    label: 'TƯƠNG TÁC',
    children: [
      {
        key: (ROUTES.TEACHER as any).MESSAGES || "/messages",
        icon: <MessageOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.TEACHER as any).MESSAGES || "/messages"}>Tin nhắn</Link>,
      },
      {
        key: (ROUTES.TEACHER as any).REVIEWS || "/teacher/reviews",
        icon: <StarOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.TEACHER as any).REVIEWS || "/teacher/reviews"}>Đánh giá</Link>,
      },
    ]
  },
  {
    type: 'group',
    label: 'TÀI CHÍNH',
    children: [
      {
        key: (ROUTES.TEACHER as any).REVENUE || "/teacher/revenue",
        icon: <WalletOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.TEACHER as any).REVENUE || "/teacher/revenue"}>Doanh thu</Link>,
      },
    ]
  },
  {
    type: 'group',
    label: 'TÀI KHOẢN',
    children: [
      {
        key: 'ho-so-giao-vien',
        icon: <IdcardOutlined className="text-[18px]" />,
        label: <Link to="/teacher/profile">Hồ sơ giáo viên</Link>,
      },
    ]
  }
];

export default function TeacherLayout() {
  const { user } = useAuthStore();

  return (
    <DashboardShell 
      menuItems={teacherMenuItems} 
      role="TEACHER"
      userName={user?.fullName || "Giáo viên"}
      userRole={user?.email || ""}
    >
      <Outlet />
    </DashboardShell>
  );
}
