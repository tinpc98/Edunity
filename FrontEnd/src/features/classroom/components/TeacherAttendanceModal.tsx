import { useQuery } from "@tanstack/react-query";
import { Modal, Table, Tag, Avatar, Typography, Space, Button, Alert, Spin } from "antd";
import {
  UserOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { sessionService, sessionKeys } from "../../../services/session.service";
import type { SessionAttendanceItem } from "../../../types/session";

const { Text, Title } = Typography;

interface TeacherAttendanceModalProps {
  open: boolean;
  sessionId: string;
  isSessionActive: boolean;
  onClose: () => void;
}

export default function TeacherAttendanceModal({
  open,
  sessionId,
  isSessionActive,
  onClose,
}: TeacherAttendanceModalProps) {
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

  const presentCount = attendanceList.filter((a) => a.attendanceStatus === "PRESENT").length;
  const lateCount = attendanceList.filter((a) => a.attendanceStatus === "LATE").length;
  const absentCount = attendanceList.filter((a) => a.attendanceStatus === "ABSENT").length;
  const totalCount = attendanceList.length;

  const columns = [
    {
      title: "Học viên",
      key: "student",
      render: (_: any, record: SessionAttendanceItem) => (
        <div className="flex items-center gap-3">
          <Avatar
            src={record.studentId?.studentProfile?.avatarUrl}
            icon={!record.studentId?.studentProfile?.avatarUrl && <UserOutlined />}
            className="bg-indigo-100 text-indigo-600 shrink-0"
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
      title: "Trạng thái",
      dataIndex: "attendanceStatus",
      key: "attendanceStatus",
      width: 140,
      render: (status: string) => {
        switch (status) {
          case "PRESENT":
            return (
              <Tag color="success" icon={<CheckCircleOutlined />} className="rounded-md font-medium px-2 py-0.5">
                Có mặt
              </Tag>
            );
          case "LATE":
            return (
              <Tag color="warning" icon={<ClockCircleOutlined />} className="rounded-md font-medium px-2 py-0.5">
                Vào muộn
              </Tag>
            );
          case "ABSENT":
            return (
              <Tag color="error" icon={<CloseCircleOutlined />} className="rounded-md font-medium px-2 py-0.5">
                Vắng mặt
              </Tag>
            );
          default:
            return <Tag className="rounded-md">{status}</Tag>;
        }
      },
    },
    {
      title: "Thời gian vào",
      dataIndex: "joinedAt",
      key: "joinedAt",
      width: 130,
      render: (joinedAt?: string) => (
        <Text className="text-gray-600 text-xs">
          {joinedAt ? new Date(joinedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—"}
        </Text>
      ),
    },
    {
      title: "Thời gian rời",
      dataIndex: "leftAt",
      key: "leftAt",
      width: 130,
      render: (leftAt?: string) => (
        <Text className="text-gray-600 text-xs">
          {leftAt ? new Date(leftAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : isSessionActive ? "Đang trong lớp" : "—"}
        </Text>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose} className="rounded-xl">
          Đóng
        </Button>,
      ]}
      title={
        <div className="flex items-center justify-between pr-8">
          <Space>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TeamOutlined className="text-base" />
            </div>
            <div>
              <Title level={5} className="!m-0 text-gray-900">
                Danh sách điểm danh buổi học
              </Title>
              <Text className="text-gray-400 text-xs">
                {isSessionActive
                  ? "Dữ liệu tự động cập nhật từ server khi học viên vào lớp"
                  : "Dữ liệu điểm danh chính thức từ hệ thống"}
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
      width={700}
      centered
      className="rounded-2xl overflow-hidden"
    >
      <div className="py-2">
        {/* Statistics Bar */}
        <div className="grid grid-cols-4 gap-2.5 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
          <div>
            <Text className="text-gray-400 text-[11px] block uppercase font-bold">Tổng số</Text>
            <Text className="text-base font-bold text-gray-800">{totalCount}</Text>
          </div>
          <div>
            <Text className="text-emerald-600 text-[11px] block uppercase font-bold">Có mặt</Text>
            <Text className="text-base font-bold text-emerald-600">{presentCount}</Text>
          </div>
          <div>
            <Text className="text-amber-600 text-[11px] block uppercase font-bold">Vào muộn</Text>
            <Text className="text-base font-bold text-amber-600">{lateCount}</Text>
          </div>
          <div>
            <Text className="text-rose-600 text-[11px] block uppercase font-bold">Vắng mặt</Text>
            <Text className="text-base font-bold text-rose-600">{absentCount}</Text>
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
            locale={{ emptyText: "Chưa có học viên nào điểm danh cho buổi học này." }}
            className="border border-gray-100 rounded-xl overflow-hidden"
          />
        )}
      </div>
    </Modal>
  );
}
