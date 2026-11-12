import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Alert,
  Tooltip,
} from "antd";
import {
  BankOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileDoneOutlined,
  SyncOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import {
  financeService,
  financeKeys,
  type Payout,
  type PayoutStatus,
} from "../../../services/finance.service";
import {
  formatVND,
  PAYOUT_STATUS_COLORS,
  PAYOUT_STATUS_LABELS,
} from "../../../types/payment";

const { Title, Text } = Typography;

export default function AdminPayoutsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("ALL");

  // Rejection modal state
  const [rejecting, setRejecting] = useState<Payout | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Approval modal/confirm state
  const [approving, setApproving] = useState<Payout | null>(null);
  const [approvalNote, setApprovalNote] = useState("");

  // Completion modal state (requires bank transfer proof)
  const [completing, setCompleting] = useState<Payout | null>(null);
  const [completeForm] = Form.useForm<{
    bankReference: string;
    transferProofImage?: string;
    note?: string;
  }>();

  const { data, isLoading } = useQuery({
    queryKey: financeKeys.adminPayouts(page, status),
    queryFn: () => financeService.getAdminPayouts(page, status),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: financeKeys.all });

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      financeService.approvePayout(id, note),
    onSuccess: () => {
      message.success("Đã phê duyệt yêu cầu rút tiền và lên lịch chi trả vào Thứ Sáu.");
      setApproving(null);
      setApprovalNote("");
      refresh();
    },
    onError: (err: any) => message.error(err?.message || "Không thể phê duyệt."),
  });

  const completeMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { bankReference: string; transferProofImage?: string; note?: string };
    }) => financeService.completePayout(id, payload),
    onSuccess: () => {
      message.success("Đã xác nhận hoàn tất chuyển khoản và hạch toán sổ cái!");
      setCompleting(null);
      completeForm.resetFields();
      refresh();
    },
    onError: (err: any) => message.error(err?.message || "Không thể xác nhận chuyển khoản."),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      financeService.rejectPayout(id, note),
    onSuccess: () => {
      message.success("Đã từ chối yêu cầu rút tiền và hoàn trả số dư khả dụng cho giảng viên.");
      setRejecting(null);
      setRejectNote("");
      refresh();
    },
    onError: (err: any) => message.error(err?.message || "Không thể từ chối."),
  });

  const evaluateMutation = useMutation({
    mutationFn: () => financeService.evaluateSettlements(),
    onSuccess: (res: any) => {
      message.success(
        `Đã rà soát quyết toán thù lao: ${res?.evaluatedCount ?? 0} khoản đã quét, ${
          res?.settledCount ?? 0
        } khoản đủ điều kiện chuyển thành Khả dụng.`
      );
      refresh();
    },
    onError: (err: any) => message.error(err?.message || "Lỗi quét quyết toán."),
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-900 font-bold flex items-center gap-2">
            <BankOutlined className="text-indigo-600" /> Quản trị Quyết toán & Chi trả Thù lao
          </Title>
          <Text type="secondary" className="text-sm">
            Quy trình chuẩn: Giảng viên yêu cầu (Thứ Hai) ➔ Admin duyệt ➔ Lên lịch và hạch toán chuyển khoản (Thứ Sáu có mã GD ngân hàng).
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <Button
            icon={<SyncOutlined spin={evaluateMutation.isPending} />}
            onClick={() => evaluateMutation.mutate()}
            loading={evaluateMutation.isPending}
          >
            Quét đối soát (7 ngày)
          </Button>
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            style={{ width: 220 }}
            options={[
              { value: "ALL", label: "Tất cả trạng thái" },
              { value: "PENDING", label: "Chờ phê duyệt" },
              { value: "APPROVED", label: "Đã duyệt (Chờ thứ Sáu)" },
              { value: "SCHEDULED", label: "Đã lên lịch" },
              { value: "PENDING_BANK_TRANSFER", label: "Chờ bằng chứng CK" },
              { value: "COMPLETED", label: "Đã chuyển tiền" },
              { value: "REJECTED", label: "Đã từ chối" },
            ]}
          />
        </div>
      </div>

      {/* Policy Reminder */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="Nguyên tắc chi trả thù lao giảng viên (BR-10, BR-11, BR-12)"
        description={
          <div className="text-xs space-y-1">
            <p>
              • <strong>Thời gian chi trả:</strong> Chỉ thực hiện vào Thứ Sáu hàng tuần (08:00 - 17:00 GMT+7).
            </p>
            <p>
              • <strong>Bắt buộc bằng chứng:</strong> Không tự động đánh dấu Đã chuyển khi chưa có Mã giao dịch ngân hàng (FT reference).
            </p>
          </div>
        }
        className="rounded-xl"
      />

      {/* Payouts Table */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs">
        <Table<Payout>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items || []}
          pagination={{ current: page, total: data?.total || 0, pageSize: 20, onChange: setPage }}
          locale={{ emptyText: "Không có yêu cầu rút tiền nào." }}
          columns={[
            {
              title: "Giảng viên",
              key: "teacher",
              render: (_, p) => (
                <div>
                  <div className="font-semibold text-slate-800">{p.teacherName || "—"}</div>
                  <div className="text-xs text-slate-500">{p.teacherEmail}</div>
                </div>
              ),
            },
            {
              title: "Số tiền",
              dataIndex: "amount",
              align: "right",
              render: (v: string) => (
                <span className="font-bold text-slate-900 text-sm">{formatVND(Number(v))}</span>
              ),
            },
            {
              title: "Tài khoản nhận",
              dataIndex: "bankAccountSnapshot",
              render: (b: Payout["bankAccountSnapshot"]) => (
                <div className="text-xs">
                  <div className="font-medium text-slate-700">{b.bankName}</div>
                  <div className="font-mono text-slate-600">{b.accountNumber}</div>
                  <div className="uppercase text-[11px] text-slate-500">{b.accountHolderName}</div>
                </div>
              ),
            },
            {
              title: "Thời gian",
              key: "timing",
              render: (_, p) => (
                <div className="text-xs text-slate-600 space-y-0.5">
                  <div>Yêu cầu: {new Date(p.requestedAt).toLocaleDateString("vi-VN")}</div>
                  {p.scheduledAt && (
                    <div className="text-purple-600">
                      Lịch chi: {new Date(p.scheduledAt).toLocaleDateString("vi-VN")}
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              align: "center",
              render: (s: PayoutStatus) => (
                <Tag color={PAYOUT_STATUS_COLORS[s] || "default"}>
                  {PAYOUT_STATUS_LABELS[s] || s}
                </Tag>
              ),
            },
            {
              title: "Chứng từ ngân hàng",
              key: "proof",
              render: (_, p) =>
                p.bankTransferProof?.bankReference ? (
                  <Tooltip
                    title={`Mã GD: ${p.bankTransferProof.bankReference} | Ngày: ${
                      p.bankTransferProof.paidAt
                        ? new Date(p.bankTransferProof.paidAt).toLocaleDateString("vi-VN")
                        : "—"
                    }`}
                  >
                    <Tag color="cyan" className="cursor-pointer font-mono text-[11px]">
                      <FileDoneOutlined className="mr-1" />
                      {p.bankTransferProof.bankReference}
                    </Tag>
                  </Tooltip>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
            {
              title: "Thao tác",
              key: "actions",
              align: "right",
              render: (_, p) => {
                const canApprove = p.status === "PENDING";
                const canComplete = [
                  "APPROVED",
                  "SCHEDULED",
                  "PROCESSING",
                  "PENDING_BANK_TRANSFER",
                ].includes(p.status);
                const canReject = ["PENDING", "APPROVED", "SCHEDULED"].includes(p.status);

                return (
                  <Space size="small">
                    {canApprove && (
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        className="bg-indigo-600 hover:bg-indigo-500"
                        onClick={() => setApproving(p)}
                      >
                        Phê duyệt
                      </Button>
                    )}

                    {canComplete && (
                      <Button
                        type="primary"
                        size="small"
                        icon={<BankOutlined />}
                        className="bg-emerald-600 hover:bg-emerald-500"
                        onClick={() => {
                          setCompleting(p);
                          completeForm.resetFields();
                        }}
                      >
                        Xác nhận đã chuyển
                      </Button>
                    )}

                    {canReject && (
                      <Button
                        danger
                        size="small"
                        icon={<CloseCircleOutlined />}
                        onClick={() => {
                          setRejecting(p);
                          setRejectNote("");
                        }}
                      >
                        Từ chối
                      </Button>
                    )}

                    {!canApprove && !canComplete && !canReject && (
                      <span className="text-xs text-slate-400">{p.reviewNote || "—"}</span>
                    )}
                  </Space>
                );
              },
            },
          ]}
        />
      </Card>

      {/* Approve Modal */}
      <Modal
        title="Phê duyệt yêu cầu rút tiền"
        open={Boolean(approving)}
        onCancel={() => setApproving(null)}
        onOk={() => {
          if (approving) {
            approveMutation.mutate({ id: approving.id, note: approvalNote });
          }
        }}
        confirmLoading={approveMutation.isPending}
        okText="Phê duyệt & Lên lịch Thứ Sáu"
        cancelText="Hủy"
      >
        <p className="text-sm text-slate-600 mb-3">
          Phê duyệt yêu cầu rút số tiền <strong>{formatVND(Number(approving?.amount || 0))}</strong>{" "}
          của giảng viên <strong>{approving?.teacherName}</strong>. Lệnh sẽ chuyển sang trạng thái đã duyệt và tự động lên lịch chi trả vào Thứ Sáu tới.
        </p>
        <Form layout="vertical">
          <Form.Item label="Ghi chú nội bộ (không bắt buộc)">
            <Input.TextArea
              rows={3}
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              placeholder="Ghi chú xét duyệt..."
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Complete Bank Transfer Modal (Strict Proof Requirement) */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-emerald-700 font-semibold">
            <BankOutlined /> Xác nhận Đã chuyển khoản ngân hàng
          </div>
        }
        open={Boolean(completing)}
        onCancel={() => setCompleting(null)}
        onOk={() => completeForm.submit()}
        confirmLoading={completeMutation.isPending}
        okText="Xác nhận hoàn tất chi trả"
        cancelText="Hủy"
      >
        <div className="bg-slate-50 p-3 rounded-xl mb-4 border border-slate-200 text-xs space-y-1">
          <div>
            <strong>Giảng viên:</strong> {completing?.teacherName} ({completing?.teacherEmail})
          </div>
          <div>
            <strong>Số tiền:</strong> <span className="font-bold text-slate-900">{formatVND(Number(completing?.amount || 0))}</span>
          </div>
          <div>
            <strong>Ngân hàng nhận:</strong> {completing?.bankAccountSnapshot?.bankName} -{" "}
            {completing?.bankAccountSnapshot?.accountNumber} ({completing?.bankAccountSnapshot?.accountHolderName})
          </div>
        </div>

        <Form
          form={completeForm}
          layout="vertical"
          onFinish={(values) => {
            if (completing) {
              completeMutation.mutate({
                id: completing.id,
                payload: {
                  bankReference: values.bankReference,
                  transferProofImage: values.transferProofImage,
                  note: values.note,
                },
              });
            }
          }}
        >
          <Form.Item
            name="bankReference"
            label="Mã giao dịch ngân hàng (FT Code / Reference Code)"
            rules={[
              { required: true, message: "Bắt buộc phải nhập mã giao dịch ngân hàng để đối soát" },
              { min: 4, message: "Mã giao dịch ngân hàng tối thiểu 4 ký tự" },
            ]}
          >
            <Input placeholder="VD: FT240567890123 hoặc VCB.2026.03.13" />
          </Form.Item>

          <Form.Item
            name="transferProofImage"
            label="Link ảnh Ủy nhiệm chi / Biên lai chuyển tiền (Tùy chọn)"
          >
            <Input placeholder="https://example.com/receipt.png" />
          </Form.Item>

          <Form.Item name="note" label="Ghi chú chi trả (Tùy chọn)">
            <Input.TextArea rows={2} placeholder="Đã chuyển qua Internet Banking..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Từ chối yêu cầu rút tiền"
        open={Boolean(rejecting)}
        onCancel={() => setRejecting(null)}
        onOk={() => {
          if (!rejectNote.trim()) {
            message.warning("Vui lòng nhập lý do từ chối.");
            return;
          }
          if (rejecting) {
            rejectMutation.mutate({ id: rejecting.id, note: rejectNote });
          }
        }}
        confirmLoading={rejectMutation.isPending}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Hủy"
      >
        <p className="text-sm text-slate-600 mb-3">
          Khi từ chối yêu cầu của <strong>{rejecting?.teacherName}</strong> ({formatVND(Number(rejecting?.amount || 0))}),
          các khoản thu nhập liên quan sẽ được hoàn trả về trạng thái Khả dụng để giảng viên có thể yêu cầu lại.
        </p>
        <Form layout="vertical">
          <Form.Item label="Lý do từ chối (bắt buộc)" required>
            <Input.TextArea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="VD: Sai thông tin số tài khoản hoặc tên chủ tài khoản..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
