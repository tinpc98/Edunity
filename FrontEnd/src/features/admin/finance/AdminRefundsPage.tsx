import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Alert,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  AuditOutlined,
  SyncOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { financeService } from "../../../services/finance.service";
import {
  formatVND,
  REFUND_STATUS_COLORS,
  REFUND_STATUS_LABELS,
  type RefundCaseItem,
  type RefundStatus,
} from "../../../types/payment";

const { Title, Text } = Typography;

export default function AdminRefundsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Modals state
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
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["adminRefunds", page, status, search],
    queryFn: () => financeService.listRefundCases({ page, limit: 15, status, search }),
  });

  const cases = (data?.items || []) as RefundCaseItem[];
  const total = data?.pagination?.total || 0;

  // Mutations
  const approveMutation = useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount?: number; note?: string }) =>
      financeService.approveRefundCase(id, { approvedAmount: amount, note }),
    onSuccess: () => {
      message.success("Đã phê duyệt hoàn tiền thành công (Chờ chuyển khoản)");
      setApproving(null);
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
      message.success("Đã từ chối hoàn tiền");
      setRejecting(null);
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
      message.success("Đã nộp chứng từ chuyển khoản (Chờ xác minh độc lập)");
      setSubmittingProof(null);
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
      message.success("Đã xác minh chứng từ thành công. Hồ sơ hoàn tất!");
      setVerifying(null);
      setVerifyRef("");
      queryClient.invalidateQueries({ queryKey: ["adminRefunds"] });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể xác minh chứng từ hoàn tiền");
    },
  });

  const columns = [
    {
      title: "Mã hồ sơ",
      dataIndex: "caseNumber",
      key: "caseNumber",
      render: (val: string, record: RefundCaseItem) => (
        <Space orientation="vertical" size={2}>
          <Text strong copyable>{val}</Text>
          <Tag color={record.purpose === "TUITION" ? "blue" : "purple"}>
            {record.purpose === "TUITION" ? "Học phí" : "Tài trợ"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "Lý do & Chi tiết",
      key: "reason",
      render: (_: any, record: RefundCaseItem) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{record.reason}</Text>
          {record.reasonDetails && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.reasonDetails}</Text>
          )}
        </Space>
      ),
    },
    {
      title: "Số tiền đủ điều kiện",
      dataIndex: "eligibleAmount",
      key: "eligibleAmount",
      render: (val: any) => <Text strong style={{ color: "#d48806" }}>{formatVND(val)}</Text>,
    },
    {
      title: "Số tiền đã duyệt",
      dataIndex: "approvedAmount",
      key: "approvedAmount",
      render: (val: any) => val ? <Text strong style={{ color: "#389e0d" }}>{formatVND(val)}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "Tài khoản thụ hưởng",
      key: "bank",
      render: (_: any, record: RefundCaseItem) => {
        const bank = record.beneficiaryBankAccount;
        if (!bank) return <Text type="secondary">N/A</Text>;
        return (
          <Space orientation="vertical" size={0}>
            <Text strong>{bank.bankName}</Text>
            <Text copyable style={{ fontSize: 12 }}>{bank.accountNumber}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{bank.accountHolderName}</Text>
          </Space>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status: RefundStatus) => (
        <Tag color={REFUND_STATUS_COLORS[status] || "default"}>
          {REFUND_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_: any, record: RefundCaseItem) => {
        return (
          <Space size="small" wrap>
            {/* Needs Review / In Review -> Approve / Reject */}
            {(record.status === "NEEDS_REVIEW" || record.status === "IN_REVIEW") && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    setApproving(record);
                    setApprovedAmount(typeof record.eligibleAmount === "number" ? record.eligibleAmount : parseFloat(String(record.eligibleAmount)));
                  }}
                >
                  Duyệt
                </Button>
                <Button
                  danger
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={() => setRejecting(record)}
                >
                  Từ chối
                </Button>
              </>
            )}

            {/* Approved / Pending Bank Transfer -> Submit Proof */}
            {(record.status === "APPROVED" || record.status === "PENDING_BANK_TRANSFER") && (
              <Button
                type="primary"
                size="small"
                style={{ backgroundColor: "#fa8c16", borderColor: "#fa8c16" }}
                icon={<UploadOutlined />}
                onClick={() => {
                  setSubmittingProof(record);
                  setBankReference("");
                }}
              >
                Nộp chứng từ
              </Button>
            )}

            {/* Awaiting Bank Verification -> Independent Verify (Four-Eyes) */}
            {record.status === "AWAITING_BANK_VERIFICATION" && (
              <Button
                type="primary"
                size="small"
                style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
                icon={<SafetyCertificateOutlined />}
                onClick={() => {
                  setVerifying(record);
                  setVerifyRef(record.bankTransferProof?.referenceNumber || "");
                }}
              >
                Xác minh (4-Eyes)
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              <AuditOutlined style={{ marginRight: 8, color: "#1890ff" }} />
              Quản Lý Hoàn Tiền An Toàn (Safe Refund Engine)
            </Title>
            <Text type="secondary">
              Quy trình kiểm soát hoàn phí học sinh và xử lý dòng tiền ra có chứng từ ngân hàng đối chiếu (PR8)
            </Text>
          </div>
          <Button icon={<SyncOutlined />} onClick={() => refetch()} loading={isLoading}>
            Làm mới
          </Button>
        </div>

        {/* Policy Alert Banner */}
        <Alert
          type="info"
          showIcon
          message="Chính sách kiểm soát tài chính & Four-Eyes Principle"
          description="Hệ thống cấm đánh dấu hoàn tất hoàn tiền khi chưa có mã giao dịch ngân hàng thực tế. Mọi chứng từ sau khi nộp cần được kiểm tra đối chiếu độc lập trước khi hạch toán sổ cái COMPLETED."
        />

        {/* Filters */}
        <Card size="small">
          <Space wrap>
            <Text strong>Bộ lọc trạng thái:</Text>
            <Select
              value={status}
              onChange={(val) => {
                setStatus(val);
                setPage(1);
              }}
              style={{ width: 220 }}
            >
              <Select.Option value="ALL">Tất cả trạng thái</Select.Option>
              <Select.Option value="NEEDS_REVIEW">Chờ xem xét</Select.Option>
              <Select.Option value="IN_REVIEW">Đang xem xét</Select.Option>
              <Select.Option value="APPROVED">Đã duyệt (Chờ chi)</Select.Option>
              <Select.Option value="PENDING_BANK_TRANSFER">Chờ chuyển khoản</Select.Option>
              <Select.Option value="AWAITING_BANK_VERIFICATION">Chờ xác minh chứng từ</Select.Option>
              <Select.Option value="COMPLETED">Đã hoàn tất</Select.Option>
              <Select.Option value="REJECTED">Đã từ chối</Select.Option>
            </Select>

            <Input.Search
              placeholder="Tìm theo mã hồ sơ, số tài khoản..."
              allowClear
              onSearch={(val) => {
                setSearch(val);
                setPage(1);
              }}
              style={{ width: 300 }}
            />
          </Space>
        </Card>

        {/* Table */}
        <Card>
          <Table
            dataSource={cases}
            columns={columns}
            rowKey="_id"
            loading={isLoading}
            pagination={{
              current: page,
              pageSize: 15,
              total,
              onChange: (p) => setPage(p),
              showTotal: (tot) => `Tổng cộng ${tot} hồ sơ hoàn tiền`,
            }}
          />
        </Card>
      </Space>

      {/* Modal 1: Approve Refund */}
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
        <Space orientation="vertical" size="middle" style={{ width: "100%", marginTop: 12 }}>
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
              max={typeof approving?.eligibleAmount === "number" ? approving.eligibleAmount : parseFloat(String(approving?.eligibleAmount || 0))}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(value) => value ? Number(value.replace(/\$\s?|(,*)/g, "")) : 0}
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

      {/* Modal 2: Reject Refund */}
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
        <Space orientation="vertical" size="middle" style={{ width: "100%", marginTop: 12 }}>
          <Text strong>Lý do từ chối (Bắt buộc):</Text>
          <Input.TextArea
            rows={4}
            placeholder="Nêu rõ lý do không đủ điều kiện hoàn phí..."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
        </Space>
      </Modal>

      {/* Modal 3: Submit Bank Transfer Proof */}
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
        <Space orientation="vertical" size="middle" style={{ width: "100%", marginTop: 12 }}>
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

      {/* Modal 4: Four-Eyes Independent Verification */}
      <Modal
        title={`Xác minh độc lập (Four-Eyes Principle) #${verifying?.caseNumber}`}
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
        okText="Xác nhận hoàn tất (COMPLETED)"
        cancelText="Hủy"
      >
        <Space orientation="vertical" size="middle" style={{ width: "100%", marginTop: 12 }}>
          <Alert
            type="success"
            showIcon
            message="Xác minh chứng từ ngân hàng đối chiếu"
            description="Là người kiểm tra độc lập, bạn xác nhận đã kiểm tra đối chiếu sao kê tài khoản ngân hàng và tiền đã thực sự được chuyển vào tài khoản người thụ hưởng."
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

