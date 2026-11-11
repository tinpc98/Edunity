import { useQuery } from "@tanstack/react-query";
import {
  Row,
  Col,
  Card,
  Statistic,
  Typography,
  Tag,
  Alert,
  Spin,
  Button,
  Space,
} from "antd";
import {
  DollarCircleOutlined,
  HeartOutlined,
  WarningOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { financeService, financeKeys } from "../../../services/finance.service";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text, Paragraph } = Typography;

export default function AdminFinanceOverviewPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: financeKeys.overview(),
    queryFn: () => financeService.getFinanceOverview(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spin size="large" tip="Đang tải dữ liệu tài chính tổng quan..." />
      </div>
    );
  }

  const revenue = data?.revenue;
  const teacherEarnings = data?.teacherEarnings;
  const reconciliations = data?.reconciliations;
  const outboxWorker = data?.outboxWorker;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 font-bold text-slate-800">
            Tổng quan Tài chính & Đối soát
          </Title>
          <Text type="secondary">
            Theo dõi sổ cái tài chính, nguồn thu học phí, quỹ học bổng và worker phục hồi giao dịch
          </Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            loading={isFetching}
          >
            Làm mới số liệu
          </Button>
          <Link to={ROUTES.ADMIN.RECONCILIATIONS}>
            <Button type="primary" danger={Boolean(reconciliations && reconciliations.open > 0)}>
              Hàng đợi đối soát ({reconciliations?.open || 0})
            </Button>
          </Link>
        </Space>
      </div>

      <Alert
        message="Nguyên tắc an toàn sổ cái tài chính (FIN-16, BR-34)"
        description={
          <div className="space-y-1 text-xs">
            <div>
              <Text strong>RECEIPT ≠ REVENUE:</Text> Khoản thu học phí tạm giữ do đến muộn (UNAPPLIED_TUITION_RECEIPT) là nợ phải trả, không được tính vào doanh thu khả dụng.
            </div>
            <div>
              <Text strong>TÁCH BIỆT NGUỒN TIỀN:</Text> Quỹ tài trợ học bổng (DONATION) tách biệt tuyệt đối với tiền học phí (TUITION).
            </div>
            <div>
              <Text strong>THÙ LAO GIẢNG VIÊN:</Text> Thu nhập PENDING chỉ được giải ngân sau khi lớp học kết thúc (COMPLETED). Thao tác hoàn tiền thật được bảo lưu cho PR8.
            </div>
          </div>
        }
        type="info"
        showIcon
        className="border-blue-200 bg-blue-50/70"
      />

      {/* Row 1: Revenue & Liabilities */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title={<span className="text-slate-600 font-medium">Doanh thu Học phí</span>}
              value={formatVND(revenue?.confirmedTuitionRevenue || "0")}
              valueStyle={{ color: "#1677ff", fontWeight: 700 }}
              prefix={<DollarCircleOutlined />}
            />
            <div className="mt-2 text-xs text-slate-500">
              Giao dịch ENROLLMENT_PAYMENT hoàn thành
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title={<span className="text-slate-600 font-medium">Quỹ Tài trợ Học bổng</span>}
              value={formatVND(revenue?.confirmedDonationRevenue || "0")}
              valueStyle={{ color: "#52c41a", fontWeight: 700 }}
              prefix={<HeartOutlined />}
            />
            <div className="mt-2 text-xs text-slate-500">
              Tiền tài trợ MTQ đóng góp vào chiến dịch
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm border-l-4 border-l-amber-500">
            <Statistic
              title={<span className="text-amber-700 font-medium">Khoản thu tạm giữ (Nợ phải trả)</span>}
              value={formatVND(revenue?.unappliedLateReceipts || "0")}
              valueStyle={{ color: "#d46b08", fontWeight: 700 }}
              prefix={<WarningOutlined />}
            />
            <div className="mt-2 text-xs text-amber-600">
              Khoản thu đến muộn / chờ đối soát (Chưa ghi nhận doanh thu)
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title={<span className="text-slate-600 font-medium">Nghĩa vụ Hoàn tiền (Pending)</span>}
              value={formatVND(revenue?.pendingRefundLiability || "0")}
              valueStyle={{ color: "#722ed1", fontWeight: 700 }}
              prefix={<ClockCircleOutlined />}
            />
            <div className="mt-2 text-xs text-slate-500">
              Đã hoàn tất: {formatVND(revenue?.completedRefunds || "0")}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Row 2: Deep Dive Cards */}
      <Row gutter={[16, 16]}>
        {/* Card: Teacher Earnings */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <LockOutlined className="text-blue-500" />
                <span>Sổ cái Thù lao Giảng viên</span>
              </Space>
            }
            bordered={false}
            className="h-full shadow-sm"
            extra={
              <Link to={ROUTES.ADMIN.PAYOUTS} className="text-xs">
                Xem yêu cầu rút <ArrowRightOutlined />
              </Link>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <Text type="secondary">Tạm giữ (PENDING):</Text>
                <Text strong className="text-amber-600">
                  {formatVND(teacherEarnings?.pending || "0")}
                </Text>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <Text type="secondary">Khả dụng rút tiền (AVAILABLE):</Text>
                <Text strong className="text-emerald-600">
                  {formatVND(teacherEarnings?.available || "0")}
                </Text>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <Text type="secondary">Đã giải ngân (PAID_OUT):</Text>
                <Text strong className="text-slate-600">
                  {formatVND(teacherEarnings?.paidOut || "0")}
                </Text>
              </div>
              <Paragraph type="secondary" className="!mb-0 text-xs">
                {teacherEarnings?.note || "Thù lao giảng viên chỉ chuyển sang AVAILABLE khi lớp học hoàn thành."}
              </Paragraph>
            </div>
          </Card>
        </Col>

        {/* Card: Outbox Recovery Worker */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <SyncOutlined spin={Boolean(outboxWorker?.isRunning)} className="text-emerald-500" />
                <span>Financial Outbox Worker</span>
              </Space>
            }
            bordered={false}
            className="h-full shadow-sm"
            extra={
              <Tag color={outboxWorker?.isRunning ? "green" : "default"}>
                {outboxWorker?.isRunning ? "ĐANG CHẠY" : "DỪNG / IDLE"}
              </Tag>
            }
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Text type="secondary">Chu kỳ quét:</Text>
                <Text strong>{Math.round((outboxWorker?.intervalMs || 30000) / 1000)} giây</Text>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Batch size:</Text>
                <Text strong>{outboxWorker?.batchSize || 25} sự kiện/tick</Text>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Tổng sự kiện đã hạch toán:</Text>
                <Text strong className="text-emerald-600">
                  {outboxWorker?.totalDispatched || 0}
                </Text>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Backlog đang chờ:</Text>
                <Tag color={outboxWorker?.backlogCount ? "gold" : "green"}>
                  {outboxWorker?.backlogCount || 0} sự kiện
                </Tag>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <Text type="secondary">Vượt ngưỡng retry (Exhausted &ge; 5):</Text>
                <Tag color={outboxWorker?.exhaustedCount ? "red" : "default"}>
                  {outboxWorker?.exhaustedCount || 0} sự kiện
                </Tag>
              </div>
              <div className="pt-2 text-right">
                <Link to={ROUTES.ADMIN.BANK_EVENTS} className="text-xs text-blue-600 hover:underline">
                  Chi tiết webhooks gateway <ArrowRightOutlined />
                </Link>
              </div>
            </div>
          </Card>
        </Col>

        {/* Card: Reconciliations Summary */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <WarningOutlined className="text-amber-500" />
                <span>Hàng đợi Đối soát ({reconciliations?.total || 0})</span>
              </Space>
            }
            bordered={false}
            className="h-full shadow-sm"
            extra={
              <Link to={ROUTES.ADMIN.RECONCILIATIONS} className="text-xs">
                Mở hàng đợi <ArrowRightOutlined />
              </Link>
            }
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Text type="secondary">Cần kiểm tra (NEEDS_REVIEW):</Text>
                <Tag color="volcano">{reconciliations?.byStatus?.needsReview || 0}</Tag>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Đang xử lý (IN_REVIEW):</Text>
                <Tag color="blue">{reconciliations?.byStatus?.inReview || 0}</Tag>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Đã chấp thuận (RESOLVED_APPROVED):</Text>
                <Tag color="green">{reconciliations?.byStatus?.resolvedApproved || 0}</Tag>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Đã hoàn tiền (RESOLVED_REFUNDED):</Text>
                <Tag color="purple">{reconciliations?.byStatus?.resolvedRefunded || 0}</Tag>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Đã bỏ qua (RESOLVED_IGNORED):</Text>
                <Tag color="default">{reconciliations?.byStatus?.resolvedIgnored || 0}</Tag>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Row 3: Navigation shortcuts */}
      <Card title="Lối tắt Quản trị Tài chính" bordered={false} className="shadow-sm">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Link to={ROUTES.ADMIN.TRANSACTIONS}>
              <div className="rounded-lg border border-slate-200 p-4 transition-colors hover:border-blue-400 hover:bg-blue-50/30">
                <div className="font-semibold text-slate-800">Sổ cái Giao dịch (Ledger)</div>
                <div className="text-xs text-slate-500 mt-1">
                  Tra cứu giao dịch, lọc theo loại, ngày tháng và kiểm tra tính toàn vẹn
                </div>
              </div>
            </Link>
          </Col>
          <Col xs={24} sm={8}>
            <Link to={ROUTES.ADMIN.RECONCILIATIONS}>
              <div className="rounded-lg border border-slate-200 p-4 transition-colors hover:border-amber-400 hover:bg-amber-50/30">
                <div className="font-semibold text-slate-800">Hàng đợi Đối soát & Bất thường</div>
                <div className="text-xs text-slate-500 mt-1">
                  Tiếp nhận sự vụ, phân công Admin và thêm ghi chú giải quyết
                </div>
              </div>
            </Link>
          </Col>
          <Col xs={24} sm={8}>
            <Link to={ROUTES.ADMIN.BANK_EVENTS}>
              <div className="rounded-lg border border-slate-200 p-4 transition-colors hover:border-emerald-400 hover:bg-emerald-50/30">
                <div className="font-semibold text-slate-800">Cổng thanh toán & Webhook Outbox</div>
                <div className="text-xs text-slate-500 mt-1">
                  Giám sát Webhook payOS 2 kênh và quá trình phục hồi outbox tự động
                </div>
              </div>
            </Link>
          </Col>
        </Row>
      </Card>
    </div>
  );
}
