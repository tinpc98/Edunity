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
  TeamOutlined,
  BarChartOutlined,
  AuditOutlined,
  CloudSyncOutlined,
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
        key: ROUTES.ADMIN.USERS,
        icon: <TeamOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.USERS}>Người dùng</Link>,
      },
      {
        key: ROUTES.ADMIN.TEACHER_VERIFICATIONS,
        icon: <IdcardOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.TEACHER_VERIFICATIONS}>Giáo viên</Link>,
      },
      {
        key: ROUTES.ADMIN.CATALOG,
        icon: <AppstoreOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.CATALOG}>Danh mục & Khóa học</Link>,
      },
      {
        key: ROUTES.ADMIN.COURSE_PROPOSALS,
        icon: <FileTextOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.COURSE_PROPOSALS}>Duyệt đề xuất khóa học</Link>,
      },
      {
        key: ROUTES.ADMIN.CLASSES,
        icon: <BookOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.CLASSES}>Lớp học</Link>,
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
    label: 'TÀI CHÍNH & ĐỐI SOÁT',
    children: [
      {
        key: ROUTES.ADMIN.FINANCE_OVERVIEW,
        icon: <BarChartOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.FINANCE_OVERVIEW}>Tổng quan tài chính</Link>,
      },
      {
        key: ROUTES.ADMIN.TRANSACTIONS,
        icon: <FileTextOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.TRANSACTIONS}>Sổ cái giao dịch</Link>,
      },
      {
        key: ROUTES.ADMIN.RECONCILIATIONS,
        icon: <AuditOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.RECONCILIATIONS}>Hàng đợi đối soát</Link>,
      },
      {
        key: ROUTES.ADMIN.BANK_EVENTS,
        icon: <CloudSyncOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.BANK_EVENTS}>Webhooks & Outbox</Link>,
      },
      {
        key: ROUTES.ADMIN.PAYMENTS,
        icon: <WalletOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.PAYMENTS}>Thanh toán học phí</Link>,
      },
      {
        key: ROUTES.ADMIN.PAYOUTS,
        icon: <WalletOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.PAYOUTS}>Rút tiền giáo viên</Link>,
      },
      {
        key: ROUTES.ADMIN.REFUNDS,
        icon: <AuditOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.REFUNDS}>Quản lý hoàn tiền</Link>,
      },
    ]
  },
  {
    type: 'group',
    label: 'VẬN HÀNH',
    children: [
      {
        key: ROUTES.ADMIN.REPORTS,
        icon: <CustomerServiceOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.ADMIN.REPORTS}>Khiếu nại</Link>,
      },
      {
        key: '/admin/notifications',
        icon: <NotificationOutlined className="text-[18px]" />,
        label: <Link to="/admin/notifications">Thông báo</Link>,
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
