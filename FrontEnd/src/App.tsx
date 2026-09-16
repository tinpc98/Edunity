import { ConfigProvider } from "antd";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import HomePage from "./pages/HomePage";

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#4f46e5",
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          borderRadius: 8,
          colorTextBase: "#0f172a",
          colorBgBase: "#ffffff"
        }
      }}
    >
      <div className="min-h-screen bg-[#faf8ff] text-slate-800 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
        <Header />
        <div className="flex-1">
          <HomePage />
        </div>
        <Footer />
      </div>
    </ConfigProvider>
  );
}