import React from "react";
import { Alert, Button, Card, Spin, Tag, Typography } from "antd";
import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { ROUTES } from "../../routes/routePaths";
import { useAuthStore } from "../../stores/auth.store";
import {
  getVerificationGuidanceMessage,
  useTeacherVerification,
  VERIFICATION_REQUIRED_MESSAGE,
} from "../../hooks/useTeacherVerification";
import type { TeacherVerificationStatus, VerificationStatus } from "../../types/teacherVerification";
import { getFriendlyErrorMessage } from "../../utils/apiErrorMap";

const { Title, Paragraph } = Typography;

const STATUS_META: Record<
  Exclude<VerificationStatus, "VERIFIED">,
  {
    title: string;
    tagLabel: string;
    tagColor: string;
    icon: React.ReactNode;
    iconBgClass: string;
  }
> = {
  UNVERIFIED: {
    title: "Yêu cầu hoàn thiện hồ sơ xác minh giảng viên",
    tagLabel: "Chưa xác minh",
    tagColor: "warning",
    icon: <SafetyCertificateOutlined />,
    iconBgClass: "bg-amber-100 text-amber-600",
  },
  PENDING: {
    title: "Hồ sơ xác minh đang chờ xét duyệt",
    tagLabel: "Đang chờ duyệt",
    tagColor: "processing",
    icon: <ClockCircleOutlined />,
    iconBgClass: "bg-indigo-100 text-indigo-600",
  },
  REJECTED: {
    title: "Hồ sơ xác minh chưa được phê duyệt",
    tagLabel: "Bị từ chối",
    tagColor: "error",
    icon: <CloseCircleOutlined />,
    iconBgClass: "bg-rose-100 text-rose-600",
  },
};

export interface TeacherVerificationGateCardProps {
  verification?: TeacherVerificationStatus;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
  darkMode?: boolean;
}

export const TeacherVerificationGateCard: React.FC<TeacherVerificationGateCardProps> = ({
  verification,
  isLoading,
  isError,
  error,
  onRetry,
  darkMode = false,
}) => {
  if (isLoading) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-16 px-6 rounded-2xl ${
          darkMode
            ? "bg-slate-900 border border-slate-800 text-white max-w-md w-full shadow-2xl"
            : "bg-white border border-gray-100 shadow-sm max-w-[720px] mx-auto my-6"
        }`}
      >
        <Spin size="large" />
        <p className={`mt-4 mb-0 text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          Đang kiểm tra trạng thái xác minh hồ sơ giảng viên...
        </p>
      </div>
    );
  }

  if (isError || !verification) {
    const errText = getFriendlyErrorMessage(
      error,
      "Không thể kiểm tra trạng thái xác minh giảng viên lúc này. Vui lòng thử lại."
    );
    return (
      <div className={darkMode ? "max-w-md w-full" : "max-w-[720px] mx-auto my-6"}>
        <Card
          className={
            darkMode
              ? "rounded-3xl bg-slate-900 border-slate-800 text-center shadow-2xl p-2"
              : "rounded-2xl border-amber-200 bg-white p-4 text-center shadow-sm"
          }
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center text-2xl mx-auto mb-4">
            <ExclamationCircleOutlined />
          </div>
          <Title level={4} className={darkMode ? "!text-white !mb-2" : "!text-slate-900 !mb-2"}>
            Không thể xác thực quyền giảng dạy
          </Title>
          <Paragraph className={`text-sm mb-5 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
            {errText}
          </Paragraph>
          <Alert
            type="warning"
            showIcon
            className="mb-6 text-left rounded-xl"
            title={VERIFICATION_REQUIRED_MESSAGE}
          />
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry} className="bg-indigo-600">
              Thử lại
            </Button>
            <Link to={ROUTES.TEACHER.HOME}>
              <Button>Về tổng quan</Button>
            </Link>
            <Link to={ROUTES.TEACHER.PROFILE}>
              <Button>Hồ sơ giáo viên</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const status = verification.verificationStatus;
  if (status === "VERIFIED") return null;

  const meta = STATUS_META[status];
  const guidanceMessage = getVerificationGuidanceMessage(status);
  const reviewNote = verification.reviewNote?.trim();

  return (
    <div className={darkMode ? "max-w-md w-full" : "max-w-[760px] mx-auto my-6"}>
      <Card
        className={
          darkMode
            ? "rounded-3xl bg-slate-900 border-slate-800 text-center shadow-2xl p-2"
            : "rounded-2xl border-slate-200 bg-white p-6 text-center shadow-sm"
        }
      >
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 ${meta.iconBgClass}`}
        >
          {meta.icon}
        </div>

        <Tag color={meta.tagColor} className="mb-3 px-3 py-0.5 font-bold text-xs uppercase">
          {meta.tagLabel}
        </Tag>

        <Title level={3} className={darkMode ? "!text-white !mb-2 !text-xl" : "!text-slate-900 !mb-2"}>
          {meta.title}
        </Title>

        <Paragraph className={`max-w-[540px] mx-auto text-sm mb-4 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          {guidanceMessage}
        </Paragraph>

        {status === "REJECTED" && reviewNote && (
          <div className="max-w-[540px] mx-auto mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm text-left">
            <strong>Lý do từ chối:</strong> {reviewNote}
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3 mt-5">
          <Link to={ROUTES.TEACHER.HOME}>
            <Button size="large">Về tổng quan</Button>
          </Link>

          {status === "UNVERIFIED" && (
            <Link to={ROUTES.AUTH.TEACHER_QUALIFICATION}>
              <Button type="primary" size="large" className="bg-indigo-600 hover:bg-indigo-700 font-semibold">
                Hoàn thiện hồ sơ xác minh
              </Button>
            </Link>
          )}

          {status === "REJECTED" && (
            <Link to={ROUTES.TEACHER.PROFILE}>
              <Button type="primary" danger size="large" className="font-semibold">
                Xem lý do và cập nhật hồ sơ
              </Button>
            </Link>
          )}

          {status === "PENDING" && (
            <Link to={ROUTES.TEACHER.PROFILE}>
              <Button type="primary" size="large" className="bg-indigo-600 hover:bg-indigo-700 font-semibold">
                Xem trạng thái hồ sơ
              </Button>
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
};

interface RequireVerifiedTeacherProps {
  children?: React.ReactNode;
}

export default function RequireVerifiedTeacher({ children }: RequireVerifiedTeacherProps) {
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  const { verification, isVerified, isLoading, isError, error, refetch } = useTeacherVerification();

  if (!isAuthenticated || !user) {
    const redirectTarget = `${location.pathname}${location.search}`;
    return <Navigate to={`${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(redirectTarget)}`} replace />;
  }

  if (user.role !== "TEACHER") {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  if (!isVerified) {
    return (
      <TeacherVerificationGateCard
        verification={verification}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
