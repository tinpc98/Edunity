import { Outlet } from "react-router-dom";
import { ConfigProvider } from "antd";
import Header from "./Header";
import Footer from "./Footer";
import { publicThemeConfig } from "./publicTheme";

export default function PublicLayout() {
  return (
    <ConfigProvider theme={publicThemeConfig}>
      <div className="min-h-screen flex flex-col bg-[#F5FAF9] text-[#163B40]">
        <Header />
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </div>
    </ConfigProvider>
  );
}
