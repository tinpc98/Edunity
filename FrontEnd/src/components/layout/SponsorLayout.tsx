import { Outlet, Link } from "react-router-dom";
import { useAuthStore } from "../../stores/auth.store";
import DashboardShell from "../dashboard/DashboardShell";
import { ROUTES } from "../../routes/routePaths";
import {
  DashboardOutlined,
  HeartOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";

const sponsorMenuItems = [
  {
    key: ROUTES.SPONSOR.HOME,
    icon: <DashboardOutlined className="text-[18px]" />,
    label: <Link to={ROUTES.SPONSOR.HOME}>Tổng quan</Link>,
  },
  {
    type: "group",
    label: "TÀI TRỢ & HỌC BỔNG",
    children: [
      {
        key: ROUTES.SPONSOR.CONTRIBUTIONS,
        icon: <HeartOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.SPONSOR.CONTRIBUTIONS}>Lịch sử tài trợ</Link>,
      },
      {
        key: ROUTES.CAMPAIGNS,
        icon: <SafetyCertificateOutlined className="text-[18px]" />,
        label: <Link to={ROUTES.CAMPAIGNS}>Khám phá chiến dịch</Link>,
      },
    ],
  },
];

export default function SponsorLayout() {
  const { user } = useAuthStore();

  return (
    <DashboardShell
      menuItems={sponsorMenuItems}
      role="SPONSOR"
      userName={user?.fullName || "Nhà tài trợ"}
      userRole={user?.email || "Sponsor"}
    >
      <Outlet />
    </DashboardShell>
  );
}
