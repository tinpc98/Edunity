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
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  WalletOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  PercentageOutlined,
  BankOutlined,
  LockOutlined,
  HourglassOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import TeacherPayoutSection from "./TeacherPayoutSection";
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
    isLoading: earningsLoading,
    refetch: refetchEarnings,
    isFetching: isFetchingEarnings,
  } = useQuery({
    queryKey: financeKeys.teacherEarnings(),
    queryFn: () => financeService.getTeacherEarnings(),
  });

  const {
    data: settlementData,
    isLoading: settlementsLoading,
    refetch: refetchSettlements,
    isFetching: isFetchingSettlements,
  } = useQuery({
    queryKey: financeKeys.teacherSettlements(),
    queryFn: () => financeService.getTeacherSettlements(),
  });

  const isLoading = earningsLoading || settlementsLoading;
  const isFetching = isFetchingEarnings || isFetchingSettlements;

  const refetchAll = () => {
    refetchEarnings();
    refetchSettlements();
  };

  const earnings = data?.items || [];
  const rawSummary = data?.summary || {
    totalGross: 0,
    totalCommission: 0,
    totalNet: 0,
    pending: 0,
    available: 0,
    paidOut: 0,
  };

  const setSummary = settlementData?.summary;
  const pendingHeld = setSummary?.pendingHeld ?? 0;
  const pendingMaturing = setSummary?.pendingMaturing ?? 0;
  const availableAmount = setSummary?.available ?? rawSummary.available;
  const inPayoutAmount = setSummary?.inPayout ?? 0;
  const paidOutAmount = setSummary?.paidOut ?? rawSummary.paidOut;
  const totalNet = setSummary?.totalNet ?? rawSummary.totalNet;

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
            <WalletOutlined className="text-indigo-600" /> Quản lý Doanh thu & Quyết toán Thù lao
          </Title>
          <Text type="secondary" className="text-sm">
            Hạch toán doanh thu giảng dạy, theo dõi điều kiện quyết toán (7 ngày sau kết thúc buổi dạy) và yêu cầu rút tiền.
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined spin={isFetching} />}
          onClick={refetchAll}
          disabled={isLoading}
        >
          Làm mới
        </Button>
      </div>

      {/* Top 3 High-Level Financial Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <Statistic
              title={<span className="text-xs font-semibold text-slate-500 uppercase">Tổng doanh thu gộp</span>}
              value={rawSummary.totalGross}
              formatter={(val) => formatVND(Number(val))}
              prefix={<DollarOutlined className="text-indigo-500 text-lg mr-2" />}
              valueStyle={{ color: "#1e293b", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-slate-400">
              Tổng số tiền học phí từ tất cả các lượt ghi danh đã thanh toán
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <Statistic
              title={<span className="text-xs font-semibold text-slate-500 uppercase">Phí nền tảng (10%)</span>}
              value={rawSummary.totalCommission}
              formatter={(val) => formatVND(Number(val))}
              prefix={<PercentageOutlined className="text-amber-500 text-lg mr-2" />}
              valueStyle={{ color: "#d97706", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-slate-400">
              Chi phí kết nối và vận hành hệ thống Edunity
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-emerald-50/50 border-emerald-200">
            <Statistic
              title={<span className="text-xs font-semibold text-emerald-800 uppercase">Doanh thu thực nhận tích lũy</span>}
              value={totalNet}
              formatter={(val) => formatVND(Number(val))}
              prefix={<BankOutlined className="text-emerald-600 text-lg mr-2" />}
              valueStyle={{ color: "#059669", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-emerald-600/80">
              Tổng thu nhập ròng 90% thuộc về Quý Thầy/Cô
            </div>
          </Card>
        </Col>
      </Row>

      {/* 5-Stage Settlement Status Breakdown */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase mb-3 flex items-center gap-1.5">
          <span>Tiến trình phân bổ & quyết toán thù lao</span>
          <Tooltip title="Thu nhập qua các giai đoạn: Tạm giữ bảo đảm -> Chờ 7 ngày kiểm tra khiếu nại -> Khả dụng để rút -> Đang xử lý lệnh rút -> Đã giải ngân thành công.">
            <HourglassOutlined className="cursor-pointer text-slate-400" />
          </Tooltip>
        </div>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card className="rounded-xl border-slate-200 shadow-2xs bg-amber-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-amber-700 font-medium flex items-center gap-1">
                    <LockOutlined /> Tạm giữ (Chưa đủ ĐK)
                  </div>
                  <div className="text-base font-bold text-amber-800 mt-1">
                    {formatVND(pendingHeld)}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-amber-600/80 mt-1">Lớp đang học / Có sự vụ</div>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8} lg={5}>
            <Card className="rounded-xl border-slate-200 shadow-2xs bg-cyan-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-cyan-700 font-medium flex items-center gap-1">
                    <HourglassOutlined /> Đang chờ đủ 7 ngày
                  </div>
                  <div className="text-base font-bold text-cyan-800 mt-1">
                    {formatVND(pendingMaturing)}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-cyan-600/80 mt-1">Đã kết thúc, chờ đối soát</div>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8} lg={5}>
            <Card className="rounded-xl border-emerald-300 shadow-2xs bg-emerald-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircleOutlined /> Khả dụng để rút
                  </div>
                  <div className="text-base font-bold text-emerald-800 mt-1">
                    {formatVND(availableAmount)}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-emerald-600/80 mt-1">Có thể rút vào Thứ Hai</div>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8} lg={5}>
            <Card className="rounded-xl border-slate-200 shadow-2xs bg-purple-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-purple-700 font-medium flex items-center gap-1">
                    <SyncOutlined /> Đang chờ giải ngân
                  </div>
                  <div className="text-base font-bold text-purple-800 mt-1">
                    {formatVND(inPayoutAmount)}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-purple-600/80 mt-1">Lệnh đã tạo, chờ thứ Sáu</div>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8} lg={5}>
            <Card className="rounded-xl border-slate-200 shadow-2xs bg-blue-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-blue-700 font-medium flex items-center gap-1">
                    <WalletOutlined /> Đã chi trả xong
                  </div>
                  <div className="text-base font-bold text-blue-800 mt-1">
                    {formatVND(paidOutAmount)}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-blue-600/80 mt-1">Đã chuyển vào tài khoản</div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Payouts Section (Monday Request Window) */}
      <TeacherPayoutSection available={Number(availableAmount) || 0} />

      {/* Earnings Table */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs overflow-hidden">
        <div className="mb-4">
          <Title level={5} className="!mb-1 text-slate-800">
            Chi tiết các khoản thu nhập
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
