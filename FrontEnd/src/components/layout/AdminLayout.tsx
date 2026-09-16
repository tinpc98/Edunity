import { Outlet, Link } from "react-router-dom";
import DashboardShell from "../dashboard/DashboardShell";
import { ROUTES } from "../../routes/routePaths";
import {
  DashboardOutlined,
  TeamOutlined,
  IdcardOutlined,
  AppstoreOutlined,
  BookOutlined,
  SafetyCertificateOutlined,
  ProfileOutlined,
  WalletOutlined,
  FileTextOutlined,
  CustomerServiceOutlined,
  NotificationOutlined,
  BarChartOutlined,
  SettingOutlined,
  HistoryOutlined
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
        key: 'nguoi-dung',
        icon: <TeamOutlined className="text-[18px]" />,
        label: 'Người dùng',
      },
      {
        key: 'giao-vien',
        icon: <IdcardOutlined className="text-[18px]" />,
        label: 'Giáo viên',
      },
      {
        key: 'khoa-hoc',
        icon: <AppstoreOutlined className="text-[18px]" />,
        label: 'Khóa học',
      },
      {
        key: 'lop-hoc',
        icon: <BookOutlined className="text-[18px]" />,
        label: 'Lớp học',
      },
    ]
  },
  {
    type: 'group',
    label: 'HỌC BỔNG',
    children: [
      {
        key: 'chien-dich',
        icon: <SafetyCertificateOutlined className="text-[18px]" />,
        label: 'Chiến dịch',
      },
      {
        key: 'ho-so-ung-tuyen',
        icon: <ProfileOutlined className="text-[18px]" />,
        label: 'Hồ sơ ứng tuyển',
      },
    ]
  },
  {
    type: 'group',
    label: 'TÀI CHÍNH',
    children: [
      {
        key: 'thanh-toan',
        icon: <WalletOutlined className="text-[18px]" />,
        label: 'Thanh toán',
      },
      {
        key: 'giao-dich',
        icon: <FileTextOutlined className="text-[18px]" />,
        label: 'Giao dịch',
      },
    ]
  },
  {
    type: 'group',
    label: 'VẬN HÀNH',
    children: [
      {
        key: 'khieu-nai',
        icon: <CustomerServiceOutlined className="text-[18px]" />,
        label: 'Khiếu nại',
      },
      {
        key: 'thong-bao',
        icon: <NotificationOutlined className="text-[18px]" />,
        label: 'Thông báo',
      },
      {
        key: 'bao-cao',
        icon: <BarChartOutlined className="text-[18px]" />,
        label: 'Báo cáo',
      },
    ]
  },
  {
    type: 'group',
    label: 'HỆ THỐNG',
    children: [
      {
        key: 'cau-hinh',
        icon: <SettingOutlined className="text-[18px]" />,
        label: 'Cấu hình',
      },
      {
        key: 'audit-log',
        icon: <HistoryOutlined className="text-[18px]" />,
        label: 'Audit Log',
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
