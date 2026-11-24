import React, { useState, useEffect } from "react";
import { Layout, Menu, Input, Avatar, Button, Flex, Typography, Dropdown, App as AntdApp } from "antd";
import { 
  SearchOutlined, 
  MessageOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined
} from "@ant-design/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import { LOGO_URL } from "../../data/homeData";
import { NotificationPopover } from "../../features/notifications/components/NotificationPopover";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface DashboardShellProps {
  children: React.ReactNode;
  menuItems: any[];
  role: "TEACHER" | "ADMIN" | "SPONSOR";
  userName?: string;
  userRole?: string;
}

export default function DashboardShell({ children, menuItems, role, userName, userRole }: DashboardShellProps) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const location = useLocation();
  const navigate = useNavigate();
  const { notification } = AntdApp.useApp();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`, { replace: true });
      return;
    }

    if (user.role !== role) {
      notification.error({
        message: "Quyền truy cập bị từ chối",
        description: `Bạn không có quyền truy cập trang này.`,
        placement: "topRight",
      });
      navigate(ROUTES.HOME, { replace: true });
    }
  }, [isAuthenticated, user, role, navigate, notification, location.pathname]);

  if (!isAuthenticated || !user || user.role !== role) {
    return null;
  }

  const handleLogout = async () => {
    try {
      const { refreshToken } = useAuthStore.getState();
      const { logoutUser } = await import("../../services/auth.service");
      await logoutUser(refreshToken);
    } catch {
      // Ignore errors
    } finally {
      useAuthStore.getState().logout();
      navigate(ROUTES.AUTH.LOGIN);
    }
  };

  const userMenuItems = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Hồ sơ cá nhân",
      onClick: () => {
        if (role === "TEACHER") navigate(ROUTES.TEACHER.PROFILE);
        else if (role === "SPONSOR") navigate("/sponsor/profile");
      },
    },
    {
      type: "divider" as const,
    },
    {
      key: "logout",
      danger: true,
      icon: <LogoutOutlined />,
      label: "Đăng xuất",
      onClick: handleLogout,
    },
  ];

  // Same sidebar width as the Student layout (w-64 = 256px)
  const currentMarginLeft = isMobile ? (collapsed ? 0 : 256) : (collapsed ? 80 : 256);

  return (
    <Layout style={{ minHeight: "100vh", background: "#F5FAF9", overflowX: "hidden" }}>
      <Sider 
        width={256} 
        collapsedWidth={isMobile ? 0 : 80}
        theme="light" 
        collapsible 
        collapsed={collapsed} 
        onCollapse={(value) => setCollapsed(value)}
        className="shadow-[0_1px_12px_rgba(15,23,42,0.04)] z-50 fixed h-screen left-0 top-0 overflow-y-auto overflow-x-hidden"
        style={{ borderRight: "none" }}
      >
        <div className="flex flex-col h-full bg-white">
          {/* Same logo block as the Student sidebar */}
          <div className="h-16 flex items-center px-4 mb-2 mt-2 border-b border-slate-100">
            <Link to={ROUTES.HOME} className={`flex items-center gap-3 ${collapsed ? "mx-auto" : ""}`}>
              <img src={LOGO_URL} alt="Edunity" className="h-8 w-auto object-contain" />
              {!collapsed && (
                <div className="flex flex-col">
                  <span className="text-lg font-black tracking-tight text-teal-900 leading-none">Edunity</span>
                  <span className="text-[8px] font-bold text-teal-600 tracking-wider uppercase mt-1">
                    Học Trực Tuyến Live
                  </span>
                </div>
              )}
            </Link>
          </div>
          
          <Menu 
            theme="light" 
            mode="inline" 
            selectedKeys={[location.pathname]} 
            items={menuItems} 
            className="border-none px-2 font-semibold text-xs"
          />
          
        </div>
      </Sider>
      
      <Layout style={{ marginLeft: currentMarginLeft, transition: 'all 0.2s', background: 'transparent', maxWidth: '100%', overflowX: 'hidden' }}>
        <Header 
          style={{ 
            padding: isMobile ? '0 24px' : '0 32px', 
            background: 'rgba(255, 255, 255, 0.85)', 
            backdropFilter: 'blur(12px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 40,
            height: '64px',
            lineHeight: '64px',
            boxShadow: '0 1px 8px rgba(0,0,0,0.03)'
          }}
        >
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center text-[16px] h-8 w-8"
              title="Đóng / mở thanh điều hướng"
            />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">
              {role === "TEACHER" ? "Không gian giảng dạy" : role === "SPONSOR" ? "Không gian tài trợ" : "Không gian học tập"}
            </span>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-6">
            <Input 
              placeholder="Tìm kiếm..." 
              prefix={<SearchOutlined className="text-gray-400" />} 
              className="hidden md:flex w-56 lg:w-72 rounded-xl bg-gray-50 border-transparent hover:border-teal-300 focus:border-teal-400"
              size="middle"
            />
            
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                type="text"
                shape="circle"
                icon={<MessageOutlined className="text-[16px] text-gray-600" />}
                className="bg-gray-50 hover:bg-gray-100 h-9 w-9"
                onClick={() => navigate(role === "TEACHER" ? ROUTES.TEACHER.MESSAGES : ROUTES.MESSAGES)}
                title="Tin nhắn"
              />
              <NotificationPopover />
            </div>
            
            <div className="h-6 w-[1px] bg-gray-200 hidden sm:block"></div>
            
            <Dropdown menu={{ items: userMenuItems }} trigger={["click", "hover"]} placement="bottomRight">
              <Flex align="center" gap="small" className="cursor-pointer">
                {user.avatarUrl ? (
                  <Avatar src={user.avatarUrl} size="default" />
                ) : (
                  <Avatar size="default" icon={<UserOutlined />} className="bg-teal-600" />
                )}
                <div className="hidden sm:flex flex-col leading-tight justify-center h-full">
                  <Text strong className="text-[13px] leading-tight">{user.fullName || userName}</Text>
                  <Text type="secondary" className="text-[11px] leading-tight">{userRole || role}</Text>
                </div>
              </Flex>
            </Dropdown>
          </div>
        </Header>
        
        {/* Same spacing as the Student layout: p-6 sm:p-8, pages in a centered max-w-6xl frame */}
        <Content className="p-6 sm:p-8" style={{ minHeight: 280, width: '100%', overflowX: 'hidden' }}>
          <div className="max-w-6xl mx-auto w-full">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
