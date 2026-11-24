import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Button,
  Form,
  Input,
  Modal,
  Radio,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Alert,
} from "antd";
import {
  BankOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileDoneOutlined,
  SyncOutlined,
  SearchOutlined,
  TransactionOutlined,
  SafetyCertificateOutlined,
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
  ADMIN_PAYOUT_STATUS_LABELS,
} from "../../../types/payment";
import { maskBankAccountNumber } from "../../../utils/maskBankAccount";
import { teacherBankAccountService } from "../../../services/teacherBankAccount.service";
import AdminPageHeader from "../../../components/admin/AdminPageHeader";
import AdminSectionCard from "../../../components/admin/AdminSectionCard";
import AdminBankAccountsTab from "./AdminBankAccountsTab";


export default function AdminPayoutsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab state synced with URL query param ?tab=requests | ?tab=bank-accounts
  const currentTab = searchParams.get("tab") === "bank-accounts" ? "bank-accounts" : "requests";

  const handleTabChange = (key: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (key === "bank-accounts") {
          next.set("tab", "bank-accounts");
        } else {
          next.delete("tab");
        }
        return next;
      },
      { replace: true }
    );
  };

  // Tab 1 (Payouts) states
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

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

  // Query for Tab 1 (Payouts)
  const { data, isLoading } = useQuery({
    queryKey: financeKeys.adminPayouts(page, status, activeSearch),
    queryFn: () => financeService.getAdminPayouts(page, status, activeSearch),
  });

  // Query count of pending review bank accounts for Tab 2 badge
  const { data: pendingBankData } = useQuery({
    queryKey: ["admin-teacher-bank-accounts", "PENDING_REVIEW_COUNT"],
    queryFn: () => teacherBankAccountService.adminList("PENDING_REVIEW", 1, 1),
  });
  const pendingBankCount = pendingBankData?.total ?? 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: financeKeys.all });
    queryClient.invalidateQueries({ queryKey: ["admin-teacher-bank-accounts"] });
  };

  const handleSearch = () => {
    setActiveSearch(searchQuery.trim());
    setPage(1);
  };

  const handleResetSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    setPage(1);
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      financeService.approvePayout(id, note),
    onSuccess: () => {
      message.success("Đã phê duyệt yêu cầu rút tiền và chuyển sang trạng thái Chờ chuyển tiền.");
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
      message.success("Đã xác nhận hoàn tất chuyển khoản và hạch toán chi trả thành công!");
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
    onSuccess: ({ evaluatedCount, availableCount, failedCount }) => {
      const summary = `Đã quét ${evaluatedCount} khoản thù lao. ${availableCount} khoản đang khả dụng.`;
      if (failedCount) {
        message.warning(`${summary} ${failedCount} khoản gặp lỗi khi quét.`);
      } else {
        message.success(summary);
      }
      refresh();
    },
    onError: (err: any) => message.error(err?.message || "Lỗi quét quyết toán."),
  });

  const tabItems = [
    {
      key: "requests",
      label: (
        <span className="flex items-center gap-2 font-semibold text-xs sm:text-sm">
          <TransactionOutlined className="text-teal-700" />
          Yêu cầu rút tiền
        </span>
      ),
      children: (
        <div className="space-y-6 pt-2">
          {/* Filter and Search Bar: 5 statuses on 1 line on desktop, search aligned right */}
          <div className="bg-white p-4 rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)]">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              {/* 5 Status Buttons: 1 single row on desktop */}
              <div className="overflow-x-auto pb-1 xl:pb-0 scrollbar-none">
                <Radio.Group
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                  buttonStyle="solid"
                  className="inline-flex whitespace-nowrap"
                >
                  <Radio.Button value="PENDING" className="text-xs sm:text-sm">
                    Chờ phê duyệt
                  </Radio.Button>
                  <Radio.Button value="AWAITING_TRANSFER" className="text-xs sm:text-sm">
                    Chờ chuyển tiền
                  </Radio.Button>
                  <Radio.Button value="COMPLETED" className="text-xs sm:text-sm">
                    Đã chi trả
                  </Radio.Button>
                  <Radio.Button value="REJECTED_FAILED" className="text-xs sm:text-sm">
                    Không thành công
                  </Radio.Button>
                  <Radio.Button value="ALL" className="text-xs sm:text-sm">
                    Tất cả
                  </Radio.Button>
                </Radio.Group>
              </div>

              {/* Search box on the right, vertically centered */}
              <div className="flex items-center gap-2 w-full xl:w-auto xl:min-w-[360px]">
                <Input
                  placeholder="Tìm theo tên giáo viên, email, mã GD..."
                  prefix={<SearchOutlined className="text-slate-400" />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onPressEnter={handleSearch}
                  allowClear
                  className="rounded-xl flex-1"
                />
                <Button
                  type="primary"
                  onClick={handleSearch}
                  className="!bg-[#0D9488] hover:!bg-[#0F766E] rounded-xl font-medium shrink-0"
                >
                  Tìm
                </Button>
                {activeSearch && (
                  <Button onClick={handleResetSearch} className="rounded-xl shrink-0">
                    Xóa lọc
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Payouts Table in AdminSectionCard */}
          <AdminSectionCard
            title="Danh sách yêu cầu rút tiền"
            subtitle={`Hiển thị ${data?.items?.length || 0} trên tổng số ${data?.total || 0} yêu cầu rút tiền.`}
            icon={<BankOutlined />}
            extra={
              <span className="text-xs font-semibold text-slate-500">
                Tổng: <span className="font-bold text-[#0F766E]">{data?.total || 0}</span> yêu cầu
              </span>
            }
          >
            <Table<Payout>
              rowKey="id"
              loading={isLoading}
              dataSource={data?.items || []}
              pagination={{
                current: page,
                total: data?.total || 0,
                pageSize: 20,
                onChange: setPage,
                showSizeChanger: false,
              }}
              locale={{ emptyText: "Không có yêu cầu rút tiền nào." }}
              columns={[
                {
                  title: "Giáo viên",
                  key: "teacher",
                  render: (_, p) => (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800 text-xs sm:text-sm">
                          {p.teacherName || "—"}
                        </span>
                        {p.isTestData && (
                          <Tag
                            color="orange"
                            className="!m-0 text-[10px] font-semibold border-0 bg-amber-100 text-amber-800"
                          >
                            TEST
                          </Tag>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{p.teacherEmail}</div>
                    </div>
                  ),
                },
                {
                  title: "Số tiền",
                  dataIndex: "amount",
                  align: "right",
                  render: (v: string) => (
                    <span className="font-bold text-slate-900 text-xs sm:text-sm whitespace-nowrap">
                      {formatVND(Number(v))}
                    </span>
                  ),
                },
                {
                  title: "Tài khoản nhận",
                  dataIndex: "bankAccountSnapshot",
                  render: (b: Payout["bankAccountSnapshot"]) => (
                    <div className="text-xs">
                      <div className="font-medium text-slate-700">{b?.bankName || "—"}</div>
                      <div className="font-mono text-slate-600">
                        {maskBankAccountNumber(b?.accountNumber)}
                      </div>
                      {b?.accountHolderName && (
                        <div className="text-[11px] text-slate-400 uppercase">
                          {b.accountHolderName}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  title: "Thời gian",
                  key: "timing",
                  render: (_, p) => (
                    <div className="text-xs text-slate-600 space-y-0.5 whitespace-nowrap">
                      <div>Yêu cầu: {new Date(p.requestedAt).toLocaleDateString("vi-VN")}</div>
                      {p.scheduledAt && (
                        <div className="text-purple-600 font-medium">
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
                    <Tag
                      color={PAYOUT_STATUS_COLORS[s] || "default"}
                      className="font-semibold text-xs whitespace-nowrap"
                    >
                      {ADMIN_PAYOUT_STATUS_LABELS[s] || s}
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
                    // STRICT GUARD: Rejection is ONLY permitted when status is PENDING!
                    const canReject = p.status === "PENDING";

                    return (
                      <Space size="small">
                        {canApprove && (
                          <Button
                            type="primary"
                            size="small"
                            icon={<CheckCircleOutlined />}
                            className="!bg-[#0D9488] hover:!bg-[#0F766E] text-xs"
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
                            className="!bg-emerald-600 hover:!bg-emerald-700 text-xs"
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
                            className="text-xs"
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
          </AdminSectionCard>
        </div>
      ),
    },
    {
      key: "bank-accounts",
      label: (
        <span className="flex items-center gap-2 font-semibold text-xs sm:text-sm">
          <SafetyCertificateOutlined className="text-teal-700" />
          Tài khoản nhận tiền
          {pendingBankCount > 0 && (
            <Tag color="gold" className="!ml-1 !mr-0 font-bold border-0 bg-amber-100 text-amber-800">
              {pendingBankCount}
            </Tag>
          )}
        </span>
      ),
      children: (
        <div className="pt-2">
          <AdminBankAccountsTab />
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        eyebrow="TÀI CHÍNH & ĐỐI SOÁT"
        eyebrowIcon={<BankOutlined />}
        title="Quản lý rút tiền giáo viên"
        description="Quản lý yêu cầu rút tiền, xác minh tài khoản nhận và theo dõi quá trình chi trả thù lao."
        extra={
          <Button
            icon={<SyncOutlined spin={evaluateMutation.isPending} />}
            onClick={() => evaluateMutation.mutate()}
            loading={evaluateMutation.isPending}
            className="rounded-xl border-[#D6E5E2] text-[#0F766E] hover:border-[#0D9488]"
          >
            Quét quyết toán
          </Button>
        }
      />

      {/* Primary 2 Tabs */}
      <Tabs
        activeKey={currentTab}
        onChange={handleTabChange}
        items={tabItems}
        className="admin-payout-tabs"
      />

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
        okText="Phê duyệt & Chuyển sang chờ chuyển tiền"
        cancelText="Hủy"
        okButtonProps={{ className: "!bg-[#0D9488] hover:!bg-[#0F766E]" }}
      >
        <p className="text-sm text-slate-600 mb-3">
          Phê duyệt yêu cầu rút số tiền <strong>{formatVND(Number(approving?.amount || 0))}</strong>{" "}
          của giáo viên <strong>{approving?.teacherName}</strong>. Lệnh sẽ chuyển sang trạng thái{" "}
          <strong>Chờ chuyển tiền</strong> và tự động lên lịch chi trả vào Thứ Sáu tới.
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
        onOk={() => {
          if (completing?.isTestData) {
            message.error("Bản ghi thử nghiệm (TEST) không thể thực hiện xác nhận chi trả thật.");
            return;
          }
          completeForm.submit();
        }}
        confirmLoading={completeMutation.isPending}
        okText="Xác nhận hoàn tất chi trả"
        cancelText="Hủy"
        okButtonProps={{
          disabled: Boolean(completing?.isTestData),
          className: "!bg-emerald-600 hover:!bg-emerald-700",
        }}
      >
        {completing?.isTestData && (
          <Alert
            type="warning"
            showIcon
            message="Cảnh báo: Bản ghi thử nghiệm (TEST)"
            description="Đây là dữ liệu test UI (tag TEST_TEACHER_PAYOUT_UI_V1). Hệ thống chặn tuyệt đối việc xác nhận chi tiền thật cho bản ghi này để bảo vệ an toàn tài chính."
            className="mb-4 rounded-xl"
          />
        )}

        <div className="bg-slate-50 p-3 rounded-xl mb-4 border border-slate-200 text-xs space-y-1">
          <div>
            <strong>Giáo viên:</strong> {completing?.teacherName} ({completing?.teacherEmail})
          </div>
          <div>
            <strong>Số tiền:</strong>{" "}
            <span className="font-bold text-slate-900">
              {formatVND(Number(completing?.amount || 0))}
            </span>
          </div>
          <div>
            <strong>Ngân hàng nhận:</strong> {completing?.bankAccountSnapshot?.bankName} -{" "}
            {completing?.bankAccountSnapshot?.accountNumber} (
            {completing?.bankAccountSnapshot?.accountHolderName})
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
          Khi từ chối yêu cầu của <strong>{rejecting?.teacherName}</strong> (
          {formatVND(Number(rejecting?.amount || 0))}), các khoản thu nhập liên quan sẽ được hoàn
          trả về trạng thái Khả dụng để giáo viên có thể yêu cầu lại.
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
