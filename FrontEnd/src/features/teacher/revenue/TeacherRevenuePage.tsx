import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Empty,
  Skeleton,
  Row,
  Col,
  Statistic,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  WalletOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  PercentageOutlined,
  BankOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { TeacherEarningItem, TeacherEarningStatus } from "../../../types/payment";
import {
  TEACHER_EARNING_STATUS_LABELS,
  TEACHER_EARNING_STATUS_COLORS,
  formatVND,
} from "../../../types/payment";

const { Title, Text } = Typography;

export default function TeacherRevenuePage() {
  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: financeKeys.teacherEarnings(),
    queryFn: () => financeService.getTeacherEarnings(),
  });

  const earnings = data?.items || [];
  const summary = data?.summary || {
    totalGross: 0,
    totalCommission: 0,
    totalNet: 0,
    pending: 0,
    available: 0,
    paidOut: 0,
  };

  const columns: ColumnsType<TeacherEarningItem> = [
    {
      title: "Lớp học",
      dataIndex: "className",
      key: "className",
      render: (className: string) => (
        <span className="font-semibold text-slate-800 text-sm">
          {className || "Lớp học trực tuyến"}
        </span>
      ),
    },
    {
      title: "Mã đơn ghi danh",
      dataIndex: "enrollmentId",
      key: "enrollmentId",
      render: (id: string) => (
        <span className="font-mono text-xs text-slate-500">
          {id ? id.slice(-8).toUpperCase() : "-"}
        </span>
      ),
    },
    {
      title: "Học phí",
      dataIndex: "grossAmount",
      key: "grossAmount",
      align: "right",
      render: (amount: number) => (
        <span className="font-medium text-slate-700">
          {formatVND(amount)}
        </span>
      ),
    },
    {
      title: "Phí nền tảng (10%)",
      dataIndex: "commissionAmount",
      key: "commissionAmount",
      align: "right",
      render: (amount: number) => (
        <span className="text-slate-500 text-xs">
          - {formatVND(amount)}
        </span>
      ),
    },
    {
      title: "Thực nhận (90%)",
      dataIndex: "netAmount",
      key: "netAmount",
      align: "right",
      render: (amount: number) => (
        <span className="font-bold text-emerald-600">
          {formatVND(amount)}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      align: "center",
      render: (status: TeacherEarningStatus) => (
        <Tag color={TEACHER_EARNING_STATUS_COLORS[status]} className="font-medium">
          {TEACHER_EARNING_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Ngày ghi nhận",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date: string) => (
        <div className="text-xs text-slate-500">
          {new Date(date).toLocaleDateString("vi-VN")}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-900 font-bold flex items-center gap-2">
            <WalletOutlined className="text-indigo-600" /> Quản lý Doanh thu & Thu nhập
          </Title>
          <Text type="secondary" className="text-sm">
            Theo dõi chi tiết doanh thu giảng dạy từ các lượt ghi danh học viên và tỷ lệ phân chia nền tảng.
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined spin={isFetching} />}
          onClick={() => refetch()}
          disabled={isLoading}
        >
          Làm mới
        </Button>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <Statistic
              title={<span className="text-xs font-semibold text-slate-500 uppercase">Tổng doanh thu gộp</span>}
              value={summary.totalGross}
              formatter={(val) => formatVND(Number(val))}
              prefix={<DollarOutlined className="text-indigo-500 text-lg mr-2" />}
              valueStyle={{ color: "#1e293b", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-slate-400">
              Tổng số tiền học phí từ tất cả các lớp đã ghi danh
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <Statistic
              title={<span className="text-xs font-semibold text-slate-500 uppercase">Phí nền tảng (10%)</span>}
              value={summary.totalCommission}
              formatter={(val) => formatVND(Number(val))}
              prefix={<PercentageOutlined className="text-amber-500 text-lg mr-2" />}
              valueStyle={{ color: "#d97706", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-slate-400">
              Chi phí duy trì hệ thống và kết nối học viên
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-emerald-50/50 border-emerald-200">
            <Statistic
              title={<span className="text-xs font-semibold text-emerald-800 uppercase">Doanh thu thực nhận</span>}
              value={summary.totalNet}
              formatter={(val) => formatVND(Number(val))}
              prefix={<BankOutlined className="text-emerald-600 text-lg mr-2" />}
              valueStyle={{ color: "#059669", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-emerald-600/80">
              Thu nhập ròng sau khi trừ phí nền tảng
            </div>
          </Card>
        </Col>
      </Row>

      {/* Status Breakdown Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className="rounded-xl border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Chờ đối soát (PENDING)</div>
                <div className="text-lg font-bold text-amber-600 mt-1">
                  {formatVND(summary.pending)}
                </div>
              </div>
              <ClockCircleOutlined className="text-2xl text-amber-400" />
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card className="rounded-xl border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Khả dụng (AVAILABLE)</div>
                <div className="text-lg font-bold text-emerald-600 mt-1">
                  {formatVND(summary.available)}
                </div>
              </div>
              <CheckCircleOutlined className="text-2xl text-emerald-400" />
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card className="rounded-xl border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Đã thanh toán (PAID_OUT)</div>
                <div className="text-lg font-bold text-blue-600 mt-1">
                  {formatVND(summary.paidOut)}
                </div>
              </div>
              <WalletOutlined className="text-2xl text-blue-400" />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Earnings Table */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs overflow-hidden">
        <div className="mb-4">
          <Title level={5} className="!mb-1 text-slate-800">
            Lịch sử các khoản thu nhập
          </Title>
          <Text type="secondary" className="text-xs">
            Danh sách từng khoản học phí được chuyển đến tài khoản giảng viên sau mỗi giao dịch thanh toán thành công.
          </Text>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : earnings.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="space-y-1 py-4">
                <p className="text-slate-600 font-medium">Chưa có giao dịch thu nhập nào.</p>
                <p className="text-slate-400 text-xs">
                  Khi học viên đăng ký và hoàn tất thanh toán học phí cho lớp học của bạn, thu nhập sẽ hiển thị tại đây.
                </p>
              </div>
            }
          />
        ) : (
          <Table<TeacherEarningItem>
            columns={columns}
            dataSource={earnings}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showTotal: (total) => `Tổng cộng ${total} khoản thu`,
            }}
          />
        )}
      </Card>
    </div>
  );
}
