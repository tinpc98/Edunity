import { Outlet, Link } from "react-router-dom";
import DashboardShell from "../dashboard/DashboardShell";
import { ROUTES } from "../../routes/routePaths";
import {
  DashboardOutlined,
  BookOutlined,
  CalendarOutlined,
  VideoCameraOutlined,
  TeamOutlined,
  MessageOutlined,
  StarOutlined,
  WalletOutlined,
  IdcardOutlined
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
        key: 'lich-giang-day',
        icon: <CalendarOutlined className="text-[18px]" />,
        label: 'Lịch giảng dạy',
      },
      {
        key: 'buoi-hoc',
        icon: <VideoCameraOutlined className="text-[18px]" />,
        label: 'Buổi học',
      },
      {
        key: 'hoc-vien',
        icon: <TeamOutlined className="text-[18px]" />,
        label: 'Học viên',
      },
    ]
  },
  {
    type: 'group',
    label: 'TƯƠNG TÁC',
    children: [
      {
        key: 'tin-nhan',
        icon: <MessageOutlined className="text-[18px]" />,
        label: 'Tin nhắn',
      },
      {
        key: 'danh-gia',
        icon: <StarOutlined className="text-[18px]" />,
        label: 'Đánh giá',
      },
    ]
  },
  {
    type: 'group',
    label: 'TÀI CHÍNH',
    children: [
      {
        key: 'doanh-thu',
        icon: <WalletOutlined className="text-[18px]" />,
        label: 'Doanh thu',
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
        label: 'Hồ sơ giáo viên',
      },
    ]
  }
];

export default function TeacherLayout() {
  return (
    <DashboardShell 
      menuItems={teacherMenuItems} 
      role="TEACHER"
      userName="Thầy Nguyễn Minh Đức"
      userRole="Giáo viên Toán học"
    >
      <Outlet />
    </DashboardShell>
  );
}
