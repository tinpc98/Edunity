import React from "react";
import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../routes/routePaths";

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh", padding: "24px" }}>
      <Result
        status="404"
        title="404"
        subTitle="Trang bạn tìm kiếm không tồn tại hoặc đã bị di chuyển."
        extra={
          <Button type="primary" size="large" onClick={() => navigate(ROUTES.HOME)}>
            Về trang chủ
          </Button>
        }
      />
    </div>
  );
};

export default NotFoundPage;
