import Providers from "./providers";
import Router from "./router";
import { App as AntdApp } from "antd";
import AuthProvider from "../components/auth/AuthProvider";

export default function App() {
  return (
    <Providers>
      <AntdApp>
        <AuthProvider>
          <div className="min-h-screen bg-[#faf8ff] text-slate-800 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
            <Router />
          </div>
        </AuthProvider>
      </AntdApp>
    </Providers>
  );
}
