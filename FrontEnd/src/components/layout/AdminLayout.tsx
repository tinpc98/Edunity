import { Outlet, Link } from "react-router-dom";
import DashboardShell from "../dashboard/DashboardShell";
import { ROUTES } from "../../routes/routePaths";
import {
  DashboardOutlined,
  IdcardOutlined,
  AppstoreOutlined,
  BookOutlined,
  SafetyCertificateOutlined,
  ProfileOutlined,
  WalletOutlined,
  FileTextOutlined,
  CustomerServiceOutlined,
  NotificationOutlined,
} from "@ant-design/icons";

const adminMenuItems = [
  {
    key: ROUTES.ADMIN.HOME,
    icon: <DashboardOutlined className="text-[18px]" />,
    label: <Link to={ROUTES.ADMIN.HOME}>Tổng quan</Link>,
  },
  {
    type: 'group',
    label: 'QUẢN LÝ HỆ THỐNG',
    children: [
      {
        key: ROUTES.ADMIN.TEACHER_VERIFICATIONS,
        icon: <IdcardOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.TEACHER_VERIFICATIONS}>Giáo viên</Link>,
      },
      {
        key: (ROUTES.ADMIN as any).CATALOG || "/admin/catalog",
        icon: <AppstoreOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.ADMIN as any).CATALOG || "/admin/catalog"}>Danh mục & Khóa học</Link>,
      },
      {
        key: (ROUTES.ADMIN as any).COURSE_PROPOSALS || "/admin/course-proposals",
        icon: <FileTextOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.ADMIN as any).COURSE_PROPOSALS || "/admin/course-proposals"}>Duyệt đề xuất khóa học</Link>,
      },
      {
        key: (ROUTES.ADMIN as any).CLASSES || "/admin/classes",
        icon: <BookOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.ADMIN as any).CLASSES || "/admin/classes"}>Lớp học</Link>,
      },
    ]
  },
  {
    type: 'group',
    label: 'HỌC BỔNG',
    children: [
      {
        key: ROUTES.ADMIN.CAMPAIGNS,
        icon: <SafetyCertificateOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.CAMPAIGNS}>Chiến dịch</Link>,
      },
      {
        key: ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS,
        icon: <ProfileOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS}>Hồ sơ ứng tuyển</Link>,
      },
    ]
  },
  {
    type: 'group',
    label: 'TÀI CHÍNH',
    children: [
      {
        key: (ROUTES.ADMIN as any).PAYMENTS || "/admin/payments",
        icon: <WalletOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.ADMIN as any).PAYMENTS || "/admin/payments"}>Thanh toán</Link>,
      },
      {
        key: (ROUTES.ADMIN as any).TRANSACTIONS || "/admin/transactions",
        icon: <FileTextOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.ADMIN as any).TRANSACTIONS || "/admin/transactions"}>Giao dịch</Link>,
      },
    ]
  },
  {
    type: 'group',
    label: 'VẬN HÀNH',
    children: [
      {
        key: (ROUTES.ADMIN as any).REPORTS || "/admin/reports",
        icon: <CustomerServiceOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES.ADMIN as any).REPORTS || "/admin/reports"}>Khiếu nại</Link>,
      },
      {
        key: (ROUTES as any).NOTIFICATIONS || "/notifications",
        icon: <NotificationOutlined className="text-[18px]" />,
        label: <Link to={(ROUTES as any).NOTIFICATIONS || "/notifications"}>Thông báo</Link>,
      },
    ]
  }
];

export default function AdminLayout() {
  return (
    <DashboardShell 
      menuItems={adminMenuItems} 
      role="ADMIN"
      userName="Nguyễn Minh Admin"
      userRole="Administrator"
    >
      <Outlet />
    </DashboardShell>
  );
}
