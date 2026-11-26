import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Modal,
  Table,
  Tag,
  Avatar,
  Typography,
  Space,
  Button,
  Alert,
  Spin,
  Progress,
  Form,
  Input,
  Select,
  App as AntdApp,
} from "antd";
import {
  UserOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { sessionService, sessionKeys } from "../../../services/session.service";
import type { SessionAttendanceItem } from "../../../types/session";
import { ATTENDANCE_CORRECTION_OPTIONS, ATTENDANCE_CORRECTION_STATUS_LABELS } from "../../../types/session";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const { Text, Title } = Typography;

interface TeacherAttendanceModalProps {
  open: boolean;
  sessionId: string;
  isSessionActive: boolean;
  sessionTitle?: string;
  onClose: () => void;
}

export default function TeacherAttendanceModal({
  open,
  sessionId,
  isSessionActive,
  sessionTitle,
  onClose,
}: TeacherAttendanceModalProps) {
  const { message } = AntdApp.useApp();
  const [selectedAttendance, setSelectedAttendance] = useState<SessionAttendanceItem | null>(null);
  const correction = useMutation({
    mutationFn: ({
      attendanceId, ...values
    }: { attendanceId: string; requestedStatus: (typeof ATTENDANCE_CORRECTION_OPTIONS)[number]["value"]; reason: string }) =>
      sessionService.requestAttendanceCorrection(sessionId, attendanceId, values),
    onSuccess: async () => {
      setSelectedAttendance(null);
      message.success("Đã gửi yêu cầu điều chỉnh điểm danh.");
      await refetch();
    },
  });
  const {
    data: attendanceList = [],
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery({
    queryKey: sessionKeys.attendance(sessionId),
    queryFn: () => sessionService.getSessionAttendance(sessionId),
    enabled: open && Boolean(sessionId),
    refetchInterval: open && isSessionActive ? 15000 : false, // Poll every 15s during active session
  });

  const presentCount = attendanceList.filter(
    (a) => a.attendanceStatus === "PRESENT",
  ).length;
  const lateCount = attendanceList.filter(
    (a) => a.attendanceStatus === "LATE",
  ).length;
  const absentCount = attendanceList.filter(
    (a) => a.attendanceStatus === "ABSENT",
  ).length;
  const totalCount = attendanceList.length;

  const columns = [
    {
      title: "Học viên",
      key: "student",
      render: (_: any, record: SessionAttendanceItem) => (
        <div className="flex items-center gap-3">
          <Avatar
            src={record.studentId?.studentProfile?.avatarUrl}
            icon={
              !record.studentId?.studentProfile?.avatarUrl && <UserOutlined />
            }
            className="bg-teal-100 text-teal-600 shrink-0"
          >
            {record.studentId?.studentProfile?.fullName?.charAt(0) || "H"}
          </Avatar>
          <div className="min-w-0">
            <Text className="font-semibold text-gray-900 block truncate">
              {record.studentId?.studentProfile?.fullName || "Học viên"}
            </Text>
            <Text className="text-gray-400 text-xs block truncate">
              {record.studentId?.email || "-"}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: "Kết quả",
      dataIndex: "attendanceStatus",
      key: "attendanceStatus",
      width: 165,
      render: (status: string, record: SessionAttendanceItem) => {
        switch (status) {
          case "PRESENT":
            return (
              <Tag
                color="success"
                icon={<CheckCircleOutlined />}
                className="rounded-md font-medium px-2 py-0.5"
              >
                Có mặt
              </Tag>
            );
          case "LATE":
            return (
              <Tag
                color="warning"
                icon={<ClockCircleOutlined />}
                className="rounded-md font-medium px-2 py-0.5"
              >
                Vào muộn{" "}
                {record.lateArrivalSeconds
                  ? `(${Math.ceil(record.lateArrivalSeconds / 60)}p)`
                  : ""}
              </Tag>
            );
          case "ABSENT":
            return (
              <Tag
                color="error"
                icon={<CloseCircleOutlined />}
                className="rounded-md font-medium px-2 py-0.5"
              >
                Vắng mặt
              </Tag>
            );
          case "EXCUSED":
            return (
              <Tag
                color="processing"
                icon={<ExclamationCircleOutlined />}
                className="rounded-md font-medium px-2 py-0.5"
              >
                Vắng có phép
              </Tag>
            );
          case "NOT_EVALUATED":
            return (
              <Tag
                color="default"
                className="rounded-md font-medium px-2 py-0.5"
              >
                Không tính vắng
              </Tag>
            );
          default:
            return <Tag className="rounded-md">{status}</Tag>;
        }
      },
    },
    {
      title: "Thời lượng ghi nhận",
      key: "duration",
      width: 170,
      render: (_: any, record: SessionAttendanceItem) => {
        const pct = Math.round(record.attendancePercentage ?? 0);
        const mins = Math.floor((record.scheduledOnlineSeconds ?? 0) / 60);
        return (
          <div>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="font-semibold text-gray-700">{mins} phút</span>
              <span
                className={
                  pct >= 70
                    ? "text-emerald-600 font-bold"
                    : "text-amber-600 font-semibold"
                }
              >
                {pct}%
              </span>
            </div>
            <Progress
              percent={pct}
              size="small"
              showInfo={false}
              status={pct >= 70 ? "success" : "normal"}
            />
          </div>
        );
      },
    },
    {
      title: "Thời gian vào",
      dataIndex: "joinedAt",
      key: "joinedAt",
      width: 115,
      render: (joinedAt?: string) => (
        <Text className="text-gray-600 text-xs">
          {joinedAt
            ? new Date(joinedAt).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </Text>
      ),
    },
    {
      title: "Thời gian rời",
      dataIndex: "leftAt",
      key: "leftAt",
      width: 115,
      render: (leftAt?: string, record?: SessionAttendanceItem) => (
        <Text className="text-gray-600 text-xs">
          {record?.isCurrentlyConnected
            ? "Đang kết nối"
            : leftAt
              ? new Date(leftAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : isSessionActive
                ? "Đang trong lớp"
                : "—"}
        </Text>
      ),
    },
    ...(!isSessionActive ? [{
      title: "Điều chỉnh",
      key: "correction",
      width: 170,
      render: (_: unknown, record: SessionAttendanceItem) => (
        <Space orientation="vertical" size={4}>
          {record.correctionRequest && (
            <Tag color={record.correctionRequest.status === "APPROVED" ? "green" : "default"}>
              {ATTENDANCE_CORRECTION_STATUS_LABELS[record.correctionRequest.status]}
            </Tag>
          )}
          {record.canRequestCorrection && record.correctionRequest?.status !== "PENDING" && (
            <Button size="small" onClick={() => {
              correction.reset();
              setSelectedAttendance(record);
            }}>
              Yêu cầu điều chỉnh
            </Button>
          )}
        </Space>
      ),
    }] : []),
  ];

  return (
    <>
    <Modal
      open={open}
      onCancel={onClose}
      footer={[
        <Button
          key="close"
          type="primary"
          onClick={onClose}
          className="rounded-xl"
        >
          Đóng
        </Button>,
      ]}
      title={
        <div className="flex items-center justify-between pr-8">
          <Space>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <TeamOutlined className="text-base" />
            </div>
            <div>
              <Title level={5} className="!m-0 text-gray-900">
                {sessionTitle ? `Điểm danh · ${sessionTitle}` : "Danh sách điểm danh buổi học"}
              </Title>
              <Text className="text-gray-400 text-xs">
                {isSessionActive
                  ? "Tự động ghi nhận thời gian hiện diện thực tế từ phòng học LiveKit"
                  : "Dữ liệu điểm danh chính thức đã chốt từ hệ thống"}
              </Text>
            </div>
          </Space>
          <Button
            size="small"
            icon={<ReloadOutlined spin={isRefetching} />}
            onClick={() => refetch()}
            className="rounded-lg text-xs"
          >
            Làm mới
          </Button>
        </div>
      }
      width={isSessionActive ? 780 : 960}
      centered
      className="rounded-2xl overflow-hidden"
    >
      <div className="py-2">
        {/* Statistics Bar */}
        <div className="grid grid-cols-4 gap-2.5 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
          <div>
            <Text className="text-gray-400 text-[11px] block uppercase font-bold">
              Tổng số
            </Text>
            <Text className="text-base font-bold text-gray-800">
              {totalCount}
            </Text>
          </div>
          <div>
            <Text className="text-emerald-600 text-[11px] block uppercase font-bold">
              Có mặt
            </Text>
            <Text className="text-base font-bold text-emerald-600">
              {presentCount}
            </Text>
          </div>
          <div>
            <Text className="text-amber-600 text-[11px] block uppercase font-bold">
              Vào muộn
            </Text>
            <Text className="text-base font-bold text-amber-600">
              {lateCount}
            </Text>
          </div>
          <div>
            <Text className="text-rose-600 text-[11px] block uppercase font-bold">
              Vắng mặt
            </Text>
            <Text className="text-base font-bold text-rose-600">
              {absentCount}
            </Text>
          </div>
        </div>

        {error && (
          <Alert
            type="error"
            message="Không thể tải danh sách điểm danh"
            description={(error as any)?.message || "Vui lòng thử lại sau."}
            showIcon
            className="mb-4 rounded-xl"
          />
        )}

        {isLoading ? (
          <div className="py-12 text-center">
            <Spin tip="Đang tải dữ liệu điểm danh từ server..." />
          </div>
        ) : (
          <Table
            dataSource={attendanceList}
            columns={columns}
            rowKey="_id"
            pagination={{ pageSize: 8, showSizeChanger: false }}
            size="middle"
            scroll={{ x: isSessionActive ? 670 : 840 }}
            locale={{
              emptyText: "Chưa có học viên nào điểm danh cho buổi học này.",
            }}
            className="border border-gray-100 rounded-xl overflow-hidden"
          />
        )}
      </div>
    </Modal>
    <Modal
      open={Boolean(selectedAttendance)}
      title={`Điều chỉnh điểm danh · ${selectedAttendance?.studentId?.studentProfile?.fullName || "Học viên"}`}
      onCancel={() => !correction.isPending && setSelectedAttendance(null)}
      footer={null}
      destroyOnHidden
    >
      {selectedAttendance && (
        <Form layout="vertical" onFinish={(values) => correction.mutate({ attendanceId: selectedAttendance._id, ...values })}>
          {correction.isError && <Alert type="error" showIcon className="mb-4"
            title={getFriendlyErrorMessage(correction.error, "Không thể gửi yêu cầu điều chỉnh.")} />}
          <Form.Item name="requestedStatus" label="Kết quả đề xuất" rules={[{ required: true, message: "Chọn kết quả đề xuất." }]}>
            <Select options={ATTENDANCE_CORRECTION_OPTIONS} />
          </Form.Item>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, max: 1000, message: "Nhập lý do điều chỉnh." }]}>
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={correction.isPending}>Gửi yêu cầu</Button>
        </Form>
      )}
    </Modal>
    </>
  );
}
