import React from "react";
import { Button, Result, Typography } from "antd";
import { useRouteError, useNavigate } from "react-router-dom";
import { ReloadOutlined, HomeOutlined } from "@ant-design/icons";
import { ROUTES } from "../../routes/routePaths";

const { Text } = Typography;

export const RouteErrorBoundary: React.FC = () => {
  const error = useRouteError() as { statusText?: string; message?: string; stack?: string } | null;
  const navigate = useNavigate();

  const errorMessage =
    error?.message || error?.statusText || "Đã xảy ra sự cố trong quá trình kết xuất giao diện.";

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6 bg-slate-50/50">
      <div className="max-w-xl w-full bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center">
        <Result
          status="error"
          title="Không thể tải trang"
          subTitle="Hệ thống đã ghi nhận lỗi giao diện. Vui lòng thử tải lại trang hoặc quay về trang chủ."
          extra={[
            <Button
              key="reload"
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => window.location.reload()}
              className="bg-teal-600 hover:bg-teal-700 rounded-lg font-medium"
            >
              Tải lại trang
            </Button>,
            <Button
              key="home"
              icon={<HomeOutlined />}
              onClick={() => navigate(ROUTES.HOME)}
              className="rounded-lg font-medium"
            >
              Về trang chủ
            </Button>,
          ]}
        >
          {errorMessage && (
            <div className="mt-4 text-left p-3 rounded-lg bg-slate-100 border border-slate-200">
              <Text type="secondary" className="text-xs font-mono block break-words">
                Chi tiết: {errorMessage}
              </Text>
            </div>
          )}
        </Result>
      </div>
    </div>
  );
};

export default RouteErrorBoundary;
