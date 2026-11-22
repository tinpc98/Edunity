import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Alert,
  Descriptions,
  Timeline,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  AuditOutlined,
  SyncOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
  EyeOutlined,
  BankOutlined,
  TransactionOutlined,
  FileProtectOutlined,
} from "@ant-design/icons";
import { financeService } from "../../../services/finance.service";
import {
  formatVND,
  parseAmountValue,
  REFUND_REASON_LABELS,
  REFUND_STATUS_COLORS,
  REFUND_STATUS_LABELS,
  type RefundCaseItem,
  type RefundStatus,
} from "../../../types/payment";
import AdminPageHeader from "../../../components/admin/AdminPageHeader";
import AdminSectionCard from "../../../components/admin/AdminSectionCard";

const { Text, Paragraph } = Typography;

const maskAccountNumber = (accountNumber?: string | null): string => {
  if (!accountNumber) return "—";
  const str = String(accountNumber).trim();
  if (str.length <= 4) return str;
  if (str.length <= 8) {
    return str.slice(0, 2) + "••••" + str.slice(-2);
  }
  return str.slice(0, 4) + "••••" + str.slice(-4);
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATED: "Tạo yêu cầu hoàn tiền",
  REFUND_CASE_CREATED: "Tạo yêu cầu hoàn tiền",
  IN_REVIEW: "Tiếp nhận xem xét",
  APPROVED: "Phê duyệt hoàn tiền",
  PROOF_SUBMITTED: "Nộp chứng từ chuyển khoản",
  BANK_PROOF_SUBMITTED: "Nộp chứng từ chuyển khoản",
  VERIFIED_COMPLETED: "Xác minh độc lập & Hoàn tất",
  COMPLETED: "Hoàn tất đối soát hoàn tiền",
  REJECTED: "Từ chối yêu cầu hoàn tiền",
};

export default function AdminRefundsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Modals state
  const [viewingCase, setViewingCase] = useState<RefundCaseItem | null>(null);

  const [approving, setApproving] = useState<RefundCaseItem | null>(null);
  const [approvedAmount, setApprovedAmount] = useState<number | null>(null);
  const [approveNote, setApproveNote] = useState("");

  const [rejecting, setRejecting] = useState<RefundCaseItem | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [submittingProof, setSubmittingProof] = useState<RefundCaseItem | null>(null);
  const [bankReference, setBankReference] = useState("");
  const [proofImage, setProofImage] = useState("");
  const [proofNotes, setProofNotes] = useState("");

  const [verifying, setVerifying] = useState<RefundCaseItem | null>(null);
  const [verifyRef, setVerifyRef] = useState("");

  // Fetch refund cases
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["adminRefunds", page, status, search],
    queryFn: () => financeService.listRefundCases({ page, limit: 15, status, search }),
  });

  const cases = (data?.items || []) as RefundCaseItem[];
  const total = data?.pagination?.total || 0;

  // Counts for quick KPI overview
  const needsReviewCount = cases.filter((c) => c.status === "NEEDS_REVIEW" || c.status === "IN_REVIEW").length;
  const pendingTransferCount = cases.filter((c) => c.status === "APPROVED" || c.status === "PENDING_BANK_TRANSFER").length;
  const awaitingVerificationCount = cases.filter((c) => c.status === "AWAITING_BANK_VERIFICATION").length;
  const completedCount = cases.filter((c) => c.status === "COMPLETED").length;

  // Mutations
  const approveMutation = useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount?: number; note?: string }) =>
      financeService.approveRefundCase(id, { approvedAmount: amount, note }),
    onSuccess: () => {
      message.success("Đã phê duyệt hoàn tiền thành công (Chuyển sang hàng đợi chuyển khoản)");
      setApproving(null);
      setViewingCase(null);
      setApprovedAmount(null);
      setApproveNote("");
      queryClient.invalidateQueries({ queryKey: ["adminRefunds"] });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể phê duyệt hoàn tiền");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, rejectionNote }: { id: string; rejectionNote: string }) =>
      financeService.rejectRefundCase(id, { rejectionNote }),
    onSuccess: () => {
      message.success("Đã từ chối hồ sơ hoàn tiền");
      setRejecting(null);
      setViewingCase(null);
      setRejectNote("");
      queryClient.invalidateQueries({ queryKey: ["adminRefunds"] });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể từ chối hoàn tiền");
    },
  });

  const submitProofMutation = useMutation({
    mutationFn: ({ id, ref, image, notes }: { id: string; ref: string; image?: string; notes?: string }) =>
      financeService.submitRefundProof(id, { bankReference: ref, transferProofImage: image, notes }),
    onSuccess: () => {
      message.success("Đã nộp chứng từ chuyển khoản ngân hàng (Chờ xác minh độc lập)");
      setSubmittingProof(null);
      setViewingCase(null);
      setBankReference("");
      setProofImage("");
      setProofNotes("");
      queryClient.invalidateQueries({ queryKey: ["adminRefunds"] });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể nộp chứng từ hoàn tiền");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, ref }: { id: string; ref: string }) =>
      financeService.verifyAndCompleteRefund(id, { bankReference: ref }),
    onSuccess: () => {
      message.success("Đã xác minh chứng từ thành công. Hồ sơ hoàn tất hạch toán!");
      setVerifying(null);
      setViewingCase(null);
      setVerifyRef("");
      queryClient.invalidateQueries({ queryKey: ["adminRefunds"] });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể xác minh chứng từ hoàn tiền");
    },
  });

  // Table columns: Exactly 6 columns per requirements
  const columns = [
    {
      title: "Mã hồ sơ",
      dataIndex: "caseNumber",
      key: "caseNumber",
      width: 175,
      render: (val: string, record: RefundCaseItem) => (
        <Space direction="vertical" size={2}>
          <Text strong copyable className="text-[#0F766E] font-mono text-xs whitespace-nowrap">
            {val}
          </Text>
          <Tag color={record.purpose === "TUITION" ? "cyan" : "purple"} className="text-[10px] px-1.5 py-0 rounded w-fit">
            {record.purpose === "TUITION" ? "Học phí" : "Tài trợ"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "Người nhận hoàn",
      key: "recipient",
      ellipsis: true,
      render: (_: any, record: RefundCaseItem) => {
        const bank = record.beneficiaryBankAccount;
        const name = bank?.accountHolderName || record.recipientUserId?.fullName;
        if (!name) {
          return <Text type="secondary" className="text-xs italic">Chưa xác minh người nhận</Text>;
        }
        return (
          <Space direction="vertical" size={1} className="w-full">
            <Text strong className="text-xs text-slate-800 uppercase block truncate">
              {name}
            </Text>
            <Text type="secondary" className="font-mono text-[11px] text-[#0D9488] block truncate">
              {bank?.bankName ? `${bank.bankName} • ${maskAccountNumber(bank.accountNumber)}` : (record.recipientUserId?.email || "Chưa có STK")}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "Lý do hoàn tiền",
      dataIndex: "reason",
      key: "reason",
      width: 160,
      render: (val: string) => (
        <Text strong className="text-xs text-[#163B40] block">
          {REFUND_REASON_LABELS[val] || val}
        </Text>
      ),
    },
    {
      title: "Số tiền cần hoàn",
      key: "amount",
      width: 140,
      align: "right" as const,
      render: (_: any, record: RefundCaseItem) => {
        const amt = record.approvedAmount || record.eligibleAmount;
        return (
          <Text strong className="text-xs text-[#0F766E] font-mono whitespace-nowrap block text-right">
            {formatVND(amt)}
          </Text>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 170,
      render: (st: RefundStatus) => (
        <Tag color={REFUND_STATUS_COLORS[st] || "default"} className="font-semibold text-xs whitespace-nowrap">
          {REFUND_STATUS_LABELS[st] || st}
        </Tag>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 100,
      align: "center" as const,
      render: (_: any, record: RefundCaseItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setViewingCase(record)}
          className="text-xs rounded-lg border-[#D6E5E2] text-[#0F766E] hover:border-[#0D9488] hover:text-[#0D9488]"
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Mint/Teal Page Header - Streamlined without technical jargon */}
      <AdminPageHeader
        eyebrow="TÀI CHÍNH & ĐỐI SOÁT"
        eyebrowIcon={<AuditOutlined />}
        title="Quản lý hoàn tiền"
        description="Theo dõi, xem xét và xử lý các hồ sơ hoàn tiền học phí và tài trợ."
        extra={
          <Button
            icon={<SyncOutlined spin={isFetching} />}
            onClick={() => refetch()}
            loading={isLoading}
            className="rounded-xl border-[#D6E5E2] text-[#0F766E] hover:border-[#0D9488]"
          >
            Làm mới danh sách
          </Button>
        }
      />

      {/* Top 4 KPI Overview Cards - Streamlined Vietnamese */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_1px_6px_rgba(13,148,136,0.04)]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chờ xem xét</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{needsReviewCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_1px_6px_rgba(13,148,136,0.04)]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chờ chuyển tiền</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{pendingTransferCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_1px_6px_rgba(13,148,136,0.04)]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chờ xác minh hoàn tiền</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{awaitingVerificationCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_1px_6px_rgba(13,148,136,0.04)]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đã hoàn tất</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{completedCount}</p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <AdminSectionCard title="Bộ lọc & Tìm kiếm hồ sơ hoàn tiền">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Text strong className="text-xs text-slate-600">Trạng thái:</Text>
            <Select
              value={status}
              onChange={(val) => {
                setStatus(val);
                setPage(1);
              }}
              style={{ width: 220 }}
              className="rounded-xl"
            >
              <Select.Option value="ALL">Tất cả trạng thái</Select.Option>
              <Select.Option value="NEEDS_REVIEW">Chờ xem xét</Select.Option>
              <Select.Option value="IN_REVIEW">Đang xem xét</Select.Option>
              <Select.Option value="APPROVED">Chờ chuyển tiền</Select.Option>
              <Select.Option value="AWAITING_BANK_VERIFICATION">Chờ xác minh hoàn tiền</Select.Option>
              <Select.Option value="COMPLETED">Đã hoàn tất</Select.Option>
              <Select.Option value="REJECTED">Từ chối</Select.Option>
            </Select>
          </div>

          <Input.Search
            placeholder="Tìm theo mã hồ sơ, người nhận, số tài khoản..."
            allowClear
            onSearch={(val) => {
              setSearch(val);
              setPage(1);
            }}
            style={{ width: 340 }}
            className="rounded-xl"
          />
        </div>
      </AdminSectionCard>

      {/* Main Table: Clean 6 Columns */}
      <AdminSectionCard title={`Danh sách hồ sơ hoàn tiền (${total} hồ sơ)`}>
        <Table
          dataSource={cases}
          columns={columns}
          rowKey="_id"
          loading={isLoading}
          scroll={{ x: 800 }}
          pagination={{
            current: page,
            pageSize: 15,
            total,
            onChange: (p) => setPage(p),
            showTotal: (tot) => `Tổng cộng ${tot} hồ sơ hoàn tiền`,
          }}
        />
      </AdminSectionCard>

      {/* Redesigned Refund Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-[#0F766E]">
            <AuditOutlined className="text-lg" />
            <span className="font-bold">Chi tiết yêu cầu hoàn tiền #{viewingCase?.caseNumber}</span>
          </div>
        }
        open={Boolean(viewingCase)}
        onCancel={() => setViewingCase(null)}
        footer={[
          <Button key="close" onClick={() => setViewingCase(null)}>
            Đóng
          </Button>,
          (viewingCase?.status === "NEEDS_REVIEW" || viewingCase?.status === "IN_REVIEW") && (
            <Button
              key="reject"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => {
                setRejecting(viewingCase);
              }}
            >
              Từ chối
            </Button>
          ),
          (viewingCase?.status === "NEEDS_REVIEW" || viewingCase?.status === "IN_REVIEW") && (
            <Button
              key="approve"
              type="primary"
              className="bg-[#0D9488] hover:bg-[#0F766E] border-none"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setApproving(viewingCase);
                setApprovedAmount(parseAmountValue(viewingCase.eligibleAmount));
              }}
            >
              Duyệt hoàn tiền
            </Button>
          ),
          (viewingCase?.status === "APPROVED" || viewingCase?.status === "PENDING_BANK_TRANSFER") && (
            <Button
              key="proof"
              type="primary"
              style={{ backgroundColor: "#f59e0b", borderColor: "#f59e0b" }}
              icon={<UploadOutlined />}
              onClick={() => {
                setSubmittingProof(viewingCase);
                setBankReference("");
              }}
            >
              Nộp chứng từ chuyển tiền
            </Button>
          ),
          viewingCase?.status === "AWAITING_BANK_VERIFICATION" && (
            <Button
              key="verify"
              type="primary"
              style={{ backgroundColor: "#8b5cf6", borderColor: "#8b5cf6" }}
              icon={<SafetyCertificateOutlined />}
              onClick={() => {
                setVerifying(viewingCase);
                setVerifyRef(viewingCase.bankTransferProof?.referenceNumber || "");
              }}
            >
              Xác minh hoàn tiền (Four-Eyes)
            </Button>
          ),
        ]}
        width={720}
      >
        {viewingCase && (
          <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 8 }}>
            {/* PHẦN 1 — TỔNG QUAN */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#F0FDFA] border border-[#CCFBF1]">
              <div>
                <span className="text-xs text-slate-500 block">Số tiền cần hoàn:</span>
                <span className="text-lg font-bold text-[#0F766E]">
                  {formatVND(viewingCase.approvedAmount || viewingCase.eligibleAmount)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block mb-1">Trạng thái hồ sơ:</span>
                <Tag color={REFUND_STATUS_COLORS[viewingCase.status] || "default"} className="font-bold text-xs m-0">
                  {REFUND_STATUS_LABELS[viewingCase.status] || viewingCase.status}
                </Tag>
              </div>
            </div>

            {/* PHẦN 2 — THÔNG TIN GIAO DỊCH GỐC */}
            <div className="p-4 rounded-xl border border-[#D6E5E2] bg-white">
              <div className="flex items-center gap-2 mb-2 text-[#0F766E] font-bold text-xs uppercase">
                <TransactionOutlined /> Thông tin giao dịch gốc
              </div>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Mã đơn thanh toán">
                  <Text strong copyable className="font-mono text-[#0F766E]">
                    {typeof viewingCase.sourcePaymentId === "object"
                      ? viewingCase.sourcePaymentId?.orderCode || viewingCase.sourcePaymentId?._id
                      : viewingCase.sourcePaymentId || "—"}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Số tiền thực nhận">
                  <Text strong className="text-emerald-700">
                    {formatVND(
                      typeof viewingCase.sourcePaymentId === "object" && viewingCase.sourcePaymentId?.amount
                        ? viewingCase.sourcePaymentId.amount
                        : viewingCase.originalAmount
                    )}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Loại giao dịch">
                  {viewingCase.purpose === "TUITION" ? "Học phí lớp học" : "Tài trợ học bổng"}
                </Descriptions.Item>
                <Descriptions.Item label="Ngày thanh toán">
                  {new Date(
                    (typeof viewingCase.sourcePaymentId === "object" && viewingCase.sourcePaymentId?.createdAt) ||
                      viewingCase.createdAt
                  ).toLocaleString("vi-VN")}
                </Descriptions.Item>
                <Descriptions.Item label="Lớp học liên quan" span={2}>
                  {typeof viewingCase.relatedClassId === "object" && viewingCase.relatedClassId?.title ? (
                    <Text strong>{viewingCase.relatedClassId.title} ({viewingCase.relatedClassId.code})</Text>
                  ) : (
                    <Text type="secondary">Thanh toán học phí khóa học</Text>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* PHẦN 3 — NGƯỜI NHẬN HOÀN TIỀN */}
            <div className="p-4 rounded-xl border border-[#D6E5E2] bg-white">
              <div className="flex items-center gap-2 mb-2 text-[#0F766E] font-bold text-xs uppercase">
                <BankOutlined /> Người nhận hoàn tiền
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">Họ tên người nhận:</span>
                  <span className="font-bold uppercase text-slate-800">
                    {viewingCase.beneficiaryBankAccount?.accountHolderName ||
                      (typeof viewingCase.recipientUserId === "object" && viewingCase.recipientUserId?.fullName) ||
                      "Chưa xác minh"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Ngân hàng thụ hưởng:</span>
                  <span className="font-semibold text-slate-800">
                    {viewingCase.beneficiaryBankAccount?.bankName || "Chưa có"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Số tài khoản:</span>
                  <span className="font-mono font-bold text-[#0D9488]">
                    {maskAccountNumber(viewingCase.beneficiaryBankAccount?.accountNumber)}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Trạng thái xác minh tài khoản:</span>
                <Tag color={viewingCase.beneficiaryBankAccount?.accountNumber ? "success" : "warning"} className="m-0 text-[11px]">
                  {viewingCase.beneficiaryBankAccount?.accountNumber ? "Đã xác minh tài khoản nhận" : "Chưa xác minh"}
                </Tag>
              </div>
            </div>

            {/* PHẦN 4 — KẾT QUẢ KIỂM TRA (TÀI CHÍNH) */}
            <div className="p-4 rounded-xl border border-[#D6E5E2] bg-white">
              <div className="flex items-center gap-2 mb-2 text-[#0F766E] font-bold text-xs uppercase">
                <FileProtectOutlined /> Kết quả kiểm tra điều kiện hoàn tiền
              </div>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Số tiền đề nghị hoàn">
                  {formatVND(viewingCase.originalAmount)}
                </Descriptions.Item>
                <Descriptions.Item label="Số tiền đủ điều kiện">
                  <Text strong style={{ color: "#d97706" }}>
                    {formatVND(viewingCase.eligibleAmount)}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Số tiền đã phê duyệt">
                  {viewingCase.approvedAmount ? (
                    <Text strong style={{ color: "#059669" }}>
                      {formatVND(viewingCase.approvedAmount)}
                    </Text>
                  ) : (
                    <Text type="secondary">Chưa phê duyệt</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Số tiền đã thực hoàn">
                  {viewingCase.status === "COMPLETED" ? (
                    <Text strong className="text-emerald-700">
                      {formatVND(viewingCase.approvedAmount || viewingCase.eligibleAmount)}
                    </Text>
                  ) : (
                    <Text type="secondary">Chưa giải ngân</Text>
                  )}
                </Descriptions.Item>
              </Descriptions>

              {parseAmountValue(viewingCase.eligibleAmount) <= 0 && (
                <Alert
                  type="warning"
                  showIcon
                  className="mt-3 text-xs"
                  message="Không đủ điều kiện hoàn tiền mặt"
                  description="Khoản thanh toán này đã được hoàn tất hoặc là suất học bổng toàn phần (chỉ hoàn nguyên hạn mức về quỹ, không hoàn tiền mặt cho học sinh)."
                />
              )}
            </div>

            {/* Lý do hoàn tiền */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
              <span className="text-xs font-bold text-slate-700 uppercase block mb-1">Lý do hoàn tiền:</span>
              <p className="text-xs text-slate-800 font-semibold mb-1">
                {REFUND_REASON_LABELS[viewingCase.reason] || viewingCase.reason}
              </p>
              {viewingCase.reasonDetails && (
                <Paragraph className="text-xs text-slate-600 m-0 bg-white p-2 rounded border border-slate-200">
                  {viewingCase.reasonDetails}
                </Paragraph>
              )}
            </div>

            {/* Chứng từ chuyển khoản ngân hàng nếu có */}
            {viewingCase.bankTransferProof && viewingCase.bankTransferProof.bankReference && (
              <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50">
                <span className="text-xs font-bold text-purple-800 uppercase block mb-2">Chứng từ chuyển khoản ngân hàng:</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Mã tham chiếu ngân hàng:</span>
                    <span className="font-mono font-bold text-purple-700">{viewingCase.bankTransferProof.bankReference}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ghi chú đối chiếu:</span>
                    <span className="text-slate-700">{viewingCase.bankTransferProof.notes || "Không có ghi chú"}</span>
                  </div>
                </div>
              </div>
            )}

            {/* PHẦN 5 — LỊCH SỬ XỬ LÝ (TIMELINE TIẾNG VIỆT) */}
            {viewingCase.auditLogs && viewingCase.auditLogs.length > 0 && (
              <div className="p-4 rounded-xl border border-[#D6E5E2] bg-white">
                <span className="text-xs font-bold text-slate-700 uppercase block mb-3">Lịch sử xử lý hồ sơ:</span>
                <Timeline
                  items={viewingCase.auditLogs.map((log: any) => ({
                    children: (
                      <div className="text-xs">
                        <span className="font-bold text-slate-800">
                          {AUDIT_ACTION_LABELS[log.action] || log.action}
                        </span>
                        <span className="text-slate-400 ml-2">({log.actorRole === "ADMIN" ? "Quản trị viên" : "Hệ thống"})</span>
                        {log.note && <p className="text-slate-600 m-0 mt-0.5">{log.note}</p>}
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString("vi-VN") : ""}
                        </span>
                      </div>
                    ),
                  }))}
                />
              </div>
            )}
          </Space>
        )}
      </Modal>

      {/* Sub-modal: Approve Refund */}
      <Modal
        title={`Phê duyệt hồ sơ #${approving?.caseNumber}`}
        open={Boolean(approving)}
        onCancel={() => setApproving(null)}
        onOk={() => {
          if (!approving) return;
          approveMutation.mutate({
            id: approving._id,
            amount: approvedAmount || undefined,
            note: approveNote,
          });
        }}
        confirmLoading={approveMutation.isPending}
        okText="Xác nhận phê duyệt"
        cancelText="Hủy"
      >
        <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 12 }}>
          <Alert
            type="warning"
            showIcon
            message="Số tiền hoàn duyệt tối đa"
            description={`Số tiền đủ điều kiện tối đa: ${formatVND(approving?.eligibleAmount)}. Không được duyệt vượt quá số tiền này.`}
          />
          <div>
            <Text strong>Số tiền duyệt hoàn (VND):</Text>
            <InputNumber
              style={{ width: "100%", marginTop: 6 }}
              value={approvedAmount}
              onChange={(val) => setApprovedAmount(val)}
              min={1000}
              max={parseAmountValue(approving?.eligibleAmount)}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(value) => (value ? Number(value.replace(/\$\s?|(,*)/g, "")) : 0)}
            />
          </div>
          <div>
            <Text strong>Ghi chú phê duyệt:</Text>
            <Input.TextArea
              rows={3}
              placeholder="Lý do hoặc điều kiện phê duyệt..."
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
        </Space>
      </Modal>

      {/* Sub-modal: Reject Refund */}
      <Modal
        title={`Từ chối hồ sơ #${rejecting?.caseNumber}`}
        open={Boolean(rejecting)}
        onCancel={() => setRejecting(null)}
        onOk={() => {
          if (!rejecting || !rejectNote.trim()) {
            message.warning("Vui lòng nhập lý do từ chối");
            return;
          }
          rejectMutation.mutate({
            id: rejecting._id,
            rejectionNote: rejectNote,
          });
        }}
        confirmLoading={rejectMutation.isPending}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Hủy"
      >
        <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 12 }}>
          <Text strong>Lý do từ chối (Bắt buộc):</Text>
          <Input.TextArea
            rows={4}
            placeholder="Nêu rõ lý do không đủ điều kiện hoàn phí..."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
        </Space>
      </Modal>

      {/* Sub-modal: Submit Bank Transfer Proof */}
      <Modal
        title={`Nộp chứng từ chuyển khoản #${submittingProof?.caseNumber}`}
        open={Boolean(submittingProof)}
        onCancel={() => setSubmittingProof(null)}
        onOk={() => {
          if (!submittingProof || !bankReference.trim()) {
            message.warning("Vui lòng nhập mã tham chiếu giao dịch ngân hàng");
            return;
          }
          submitProofMutation.mutate({
            id: submittingProof._id,
            ref: bankReference.trim(),
            image: proofImage,
            notes: proofNotes,
          });
        }}
        confirmLoading={submitProofMutation.isPending}
        okText="Nộp chứng từ"
        cancelText="Hủy"
      >
        <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 12 }}>
          <Alert
            type="info"
            message={`Tài khoản nhận: ${submittingProof?.beneficiaryBankAccount?.bankName} - ${submittingProof?.beneficiaryBankAccount?.accountNumber} (${submittingProof?.beneficiaryBankAccount?.accountHolderName})`}
            description={`Số tiền cần chuyển: ${formatVND(submittingProof?.approvedAmount || submittingProof?.eligibleAmount)}`}
          />
          <div>
            <Text strong>Mã giao dịch ngân hàng (bankReference) *:</Text>
            <Input
              placeholder="VD: FT2611100098234"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <Text strong>Đường dẫn hình ảnh chứng từ / Ủy nhiệm chi (Tùy chọn):</Text>
            <Input
              placeholder="https://... hoặc khóa lưu trữ chứng từ"
              value={proofImage}
              onChange={(e) => setProofImage(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <Text strong>Ghi chú kiểm toán:</Text>
            <Input.TextArea
              rows={2}
              placeholder="Ghi chú nội bộ..."
              value={proofNotes}
              onChange={(e) => setProofNotes(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
        </Space>
      </Modal>

      {/* Sub-modal: Four-Eyes Independent Verification */}
      <Modal
        title={`Xác minh độc lập #${verifying?.caseNumber}`}
        open={Boolean(verifying)}
        onCancel={() => setVerifying(null)}
        onOk={() => {
          if (!verifying || !verifyRef.trim()) {
            message.warning("Vui lòng xác nhận mã giao dịch ngân hàng");
            return;
          }
          verifyMutation.mutate({
            id: verifying._id,
            ref: verifyRef.trim(),
          });
        }}
        confirmLoading={verifyMutation.isPending}
        okText="Xác nhận hoàn tất đối soát"
        cancelText="Hủy"
      >
        <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 12 }}>
          <Alert
            type="success"
            showIcon
            message="Xác minh chứng từ ngân hàng đối chiếu"
            description="Là người kiểm tra độc lập thứ hai, bạn xác nhận đã kiểm tra đối chiếu sao kê tài khoản ngân hàng và tiền đã thực sự được chuyển vào tài khoản người thụ hưởng."
          />
          <div>
            <Text strong>Mã giao dịch ngân hàng xác nhận:</Text>
            <Input
              value={verifyRef}
              onChange={(e) => setVerifyRef(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
