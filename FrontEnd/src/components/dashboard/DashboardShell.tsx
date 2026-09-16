import React, { useState } from "react";
import { Layout, Menu, Input, Avatar, Badge, Button, Flex, Typography } from "antd";
import { 
  SearchOutlined, 
  BellOutlined, 
  MessageOutlined,
  UserOutlined,
  ReadOutlined
} from "@ant-design/icons";
import { useLocation } from "react-router-dom";

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

interface DashboardShellProps {
  children: React.ReactNode;
  menuItems: any[];
  role: "TEACHER" | "ADMIN";
  userName: string;
  userRole: string;
}

export default function DashboardShell({ children, menuItems, role, userName, userRole }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <Layout style={{ minHeight: "100vh", background: "#f7f7fb" }}>
      <Sider 
        width={220} 
        theme="light" 
        collapsible 
        collapsed={collapsed} 
        onCollapse={(value) => setCollapsed(value)}
        className="shadow-[0_1px_12px_rgba(15,23,42,0.04)] z-50 fixed h-screen left-0 top-0 overflow-y-auto overflow-x-hidden"
        style={{ borderRight: "none" }}
      >
        <div className="flex flex-col h-full bg-white">
          <div className="h-16 flex items-center px-4 mb-2 mt-2">
            {!collapsed ? (
              <Flex align="center" gap="small" className="w-full justify-between">
                <Flex align="center" gap="small">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
                    <ReadOutlined className="text-[18px]" />
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="font-bold text-base text-indigo-600 tracking-tight">Edunity</span>
                  </div>
                </Flex>
                <div className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[9px] font-bold tracking-wider uppercase">
                  {role}
                </div>
              </Flex>
            ) : (
              <div className="w-8 h-8 mx-auto rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md">
                <ReadOutlined className="text-[18px]" />
              </div>
            )}
          </div>
          
          <Menu 
            theme="light" 
            mode="inline" 
            selectedKeys={[location.pathname]} 
            items={menuItems} 
            className="border-none px-2 font-semibold text-[13px]"
          />
          
        </div>
      </Sider>
      
      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'all 0.2s', background: 'transparent' }}>
        <Header 
          style={{ 
            padding: '0 24px', 
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
          <div className="flex items-center gap-4">
            <Title level={4} style={{ margin: 0, fontSize: '18px' }}>Tổng quan</Title>
          </div>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <Input 
              placeholder="Tìm kiếm..." 
              prefix={<SearchOutlined className="text-gray-400" />} 
              className="hidden md:flex w-56 lg:w-72 rounded-xl bg-gray-50 border-transparent hover:border-indigo-300 focus:border-indigo-400"
              size="middle"
            />
            
            <div className="flex items-center gap-1 sm:gap-2">
              <Badge dot color="blue">
                <Button type="text" shape="circle" icon={<MessageOutlined className="text-[16px] text-gray-600" />} className="bg-gray-50 hover:bg-gray-100 h-9 w-9" />
              </Badge>
              <Badge count={role === 'ADMIN' ? 12 : 2} style={{ backgroundColor: '#ef4444' }}>
                <Button type="text" shape="circle" icon={<BellOutlined className="text-[16px] text-gray-600" />} className="bg-gray-50 hover:bg-gray-100 h-9 w-9" />
              </Badge>
            </div>
            
            <div className="h-6 w-[1px] bg-gray-200 hidden sm:block"></div>
            
            <Flex align="center" gap="small" className="cursor-pointer">
              <Avatar size="default" icon={<UserOutlined />} className="bg-indigo-600" />
              <div className="hidden sm:flex flex-col leading-tight justify-center h-full">
                <Text strong className="text-[13px] leading-tight">{userName}</Text>
                <Text type="secondary" className="text-[11px] leading-tight">{userRole}</Text>
              </div>
            </Flex>
          </div>
        </Header>
        
        <Content style={{ padding: '20px', minHeight: 280, maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
