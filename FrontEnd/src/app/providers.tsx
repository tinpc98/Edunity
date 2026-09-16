import type { ReactNode } from "react";
import { ConfigProvider } from "antd";

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
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
      {children}
    </ConfigProvider>
  );
}