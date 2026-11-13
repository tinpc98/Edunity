import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Table,
  Tag,
  Typography,
  Alert,
  Tooltip,
} from "antd";
import {
  BankOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  FileDoneOutlined,
} from "@ant-design/icons";
import {
  financeService,
  financeKeys,
  type Payout,
  type PayoutRequestPayload,
  type PayoutStatus,
} from "../../../services/finance.service";
import {
  formatVND,
  PAYOUT_STATUS_COLORS,
  PAYOUT_STATUS_LABELS,
} from "../../../types/payment";
import { maskBankAccountNumber } from "../../../utils/maskBankAccount";

const { Title, Text } = Typography;

interface TeacherPayoutSectionProps {
  available: number;
}

export default function TeacherPayoutSection({ available }: TeacherPayoutSectionProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<PayoutRequestPayload>();

  const {
    data: payouts = [],
    isLoading: payoutsLoading,
    isError: payoutsError,
    refetch: refetchPayouts,
  } = useQuery({
    queryKey: financeKeys.teacherPayouts(),
    queryFn: () => financeService.getMyPayouts(),
  });

  const {
    data: settlementData,
    isLoading: settlementsLoading,
    isError: settlementsError,
    refetch: refetchSettlements,
  } = useQuery({
    queryKey: financeKeys.teacherSettlements(),
    queryFn: () => financeService.getTeacherSettlements(),
  });

  const isMonday = settlementData?.window?.isMondayWithdrawalWindow ?? false;
  const payoutDataUnavailable = payoutsError || settlementsError;
  const windowNotice =
    settlementData?.window?.notice ||
    "Cổng rút tiền mở vào Thứ Hai hàng tuần từ 08:00 đến 17:00 (GMT+7)";

  const hasOpenRequest = payouts.some((p) =>
    ["PENDING", "PROCESSING", "APPROVED", "SCHEDULED", "PENDING_BANK_TRANSFER"].includes(p.status)
  );

  const requestMutation = useMutation({
    mutationFn: (payload: PayoutRequestPayload) => financeService.requestPayout(payload),
    onSuccess: () => {
      message.success("Đã gửi yêu cầu rút tiền thành công! Admin sẽ kiểm tra và giải ngân vào Thứ Sáu.");
      setOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
    onError: () => {
      message.error("Không thể gửi yêu cầu rút tiền. Vui lòng kiểm tra thông tin và thử lại.");
    },
  });

  const closeRequestModal = () => {
    if (requestMutation.isPending) return;
    setOpen(false);
    form.resetFields();
  };

  return (
    <Card className="rounded-2xl border-slate-200/80 shadow-xs">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <Title level={5} className="!mb-1 text-slate-800 flex items-center gap-2">
            <BankOutlined className="text-indigo-600" /> Quản lý Yêu cầu Rút tiền
          </Title>
          <Text type="secondary" className="text-xs">
            Thu nhập đạt chuẩn sau khi kết thúc lớp và đủ thời hạn bảo đảm 7 ngày sẽ chuyển thành số dư Khả dụng.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<BankOutlined />}
          disabled={payoutDataUnavailable || available <= 0 || hasOpenRequest || !isMonday}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ amount: available });
            setOpen(true);
          }}
          className={
            payoutDataUnavailable || !isMonday || available <= 0 || hasOpenRequest
              ? ""
              : "bg-indigo-600 hover:bg-indigo-500"
          }
        >
          {payoutDataUnavailable
            ? "Không thể tải thông tin rút tiền"
            : hasOpenRequest
            ? "Đang có yêu cầu chờ xử lý"
            : !isMonday
            ? "Cổng rút chỉ mở Thứ Hai (08:00 - 17:00)"
            : `Rút tiền (${formatVND(available)})`}
        </Button>
      </div>

      {/* Monday Window Banner */}
      <div className="mb-4">
        {isMonday ? (
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="Cổng rút tiền đang MỞ"
            description={
              <div className="text-xs">
                Hôm nay là Thứ Hai (08:00 - 17:00 GMT+7). Bạn có thể gửi yêu cầu rút số dư khả dụng{" "}
                <strong>{formatVND(available)}</strong>. Lệnh sau khi duyệt sẽ được giải ngân vào Thứ Sáu tới.
              </div>
            }
            className="rounded-xl"
          />
        ) : (
          <Alert
            type="warning"
            showIcon
            icon={<ClockCircleOutlined />}
            message="Cổng rút tiền hiện đang ĐÓNG (Chỉ mở Thứ Hai)"
            description={
              <div className="text-xs">
                {windowNotice}. Quý Thầy/Cô vui lòng quay lại trong khung giờ quy định để tạo yêu cầu rút tiền.
              </div>
            }
            className="rounded-xl"
          />
        )}
      </div>

      <Alert
        type="info"
        showIcon
        className="mb-4"
        message="Thông tin ngân hàng được dùng cho từng yêu cầu rút"
        description="Backend hiện chưa có hồ sơ tài khoản nhận thù lao riêng để lưu hoặc cập nhật. Số tài khoản bên dưới được gửi cùng yêu cầu rút tiền và lưu thành snapshot của yêu cầu đó."
      />

      {(payoutsError || settlementsError) && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          message="Không tải được đầy đủ thông tin rút thù lao"
          description="Vui lòng thử lại. Lỗi không kèm theo thông tin tài khoản."
          action={
            <Button
              size="small"
              onClick={() => {
                if (payoutsError) void refetchPayouts();
                if (settlementsError) void refetchSettlements();
              }}
            >
              Thử lại
            </Button>
          }
        />
      )}

      {/* Table of Payout Requests */}
      <Table<Payout>
        size="small"
        rowKey="id"
        loading={payoutsLoading || settlementsLoading}
        dataSource={payouts}
        pagination={{ pageSize: 5 }}
        locale={{
          emptyText: payoutsError ? "Không thể tải lịch sử yêu cầu." : "Chưa có yêu cầu rút tiền nào.",
        }}
        columns={[
          {
            title: "Ngày yêu cầu",
            dataIndex: "requestedAt",
            render: (v: string) => (
              <span className="text-xs text-slate-600 font-medium">
                {v ? new Date(v).toLocaleString("vi-VN") : "—"}
              </span>
            ),
          },
          {
            title: "Số tiền",
            dataIndex: "amount",
            align: "right",
            render: (v: string) => (
              <span className="font-bold text-slate-800 text-sm">{formatVND(Number(v))}</span>
            ),
          },
          {
            title: "Tài khoản nhận",
            dataIndex: "bankAccountSnapshot",
            render: (b: Payout["bankAccountSnapshot"]) => (
              <div className="text-xs">
                <span className="font-semibold text-slate-700">{b.bankName}</span>
                <span className="text-slate-400 mx-1">•</span>
                <span className="font-mono text-slate-600">
                  {maskBankAccountNumber(b?.accountNumber)}
                </span>
                <div className="text-slate-500 uppercase text-[11px]">{b.accountHolderName}</div>
              </div>
            ),
          },
          {
            title: "Trạng thái",
            dataIndex: "status",
            align: "center",
            render: (s: PayoutStatus, row) => (
              <div className="space-y-1">
                <Tag color={PAYOUT_STATUS_COLORS[s] || "default"}>
                  {PAYOUT_STATUS_LABELS[s] || s}
                </Tag>
                {row.scheduledAt && s === "SCHEDULED" && (
                  <div className="text-[11px] text-purple-600">
                    Lịch chi: {new Date(row.scheduledAt).toLocaleDateString("vi-VN")}
                  </div>
                )}
                {row.reviewNote && (
                  <div className="text-[11px] text-slate-500 italic max-w-xs truncate">
                    {row.reviewNote}
                  </div>
                )}
              </div>
            ),
          },
          {
            title: "Chứng từ chi trả",
            key: "proof",
            align: "center",
            render: (_, row) =>
              row.bankTransferProof?.bankReference ? (
                <Tooltip
                  title={`Mã GD: ${row.bankTransferProof.bankReference} | Ngày chi: ${
                    row.bankTransferProof.paidAt
                      ? new Date(row.bankTransferProof.paidAt).toLocaleDateString("vi-VN")
                      : "—"
                  }`}
                >
                  <Tag color="cyan" className="cursor-pointer font-mono text-[11px]">
                    <FileDoneOutlined className="mr-1" />
                    {row.bankTransferProof.bankReference}
                  </Tag>
                </Tooltip>
              ) : row.status === "COMPLETED" ? (
                <Tag color="green">Đã hoàn tất</Tag>
              ) : (
                <span className="text-slate-400 text-xs">—</span>
              ),
          },
        ]}
      />

      {/* Request Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-indigo-700 font-semibold">
            <BankOutlined /> Yêu cầu Rút thù lao giảng viên (Thứ Hai)
          </div>
        }
        open={open}
        onCancel={closeRequestModal}
        maskClosable={!requestMutation.isPending}
        closable={!requestMutation.isPending}
        cancelButtonProps={{ disabled: requestMutation.isPending }}
        onOk={() => form.submit()}
        okText="Gửi yêu cầu rút tiền"
        cancelText="Hủy bỏ"
        confirmLoading={requestMutation.isPending}
      >
        <div className="bg-slate-50 p-3 rounded-xl mb-4 border border-slate-200">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600">Số dư khả dụng hiện tại:</span>
            <span className="font-bold text-emerald-600 text-base">{formatVND(available)}</span>
          </div>
          <Alert
            type="warning"
            showIcon
            className="mb-4"
            message="Nhập tài khoản nhận cho yêu cầu này"
            description="Thông tin này không tạo hoặc cập nhật tài khoản nhận mặc định."
          />
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <InfoCircleOutlined /> Lệnh rút tiền được Admin duyệt và giải ngân vào ngày Thứ Sáu tiếp theo.
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => requestMutation.mutate(values)}
          initialValues={{ amount: available }}
        >
          <Form.Item
            name="amount"
            label="Số tiền muốn rút (VNĐ)"
            rules={[
              { required: true, message: "Vui lòng nhập số tiền rút" },
              {
                type: "number",
                min: 50000,
                max: available,
                message: `Số tiền rút tối thiểu 50.000 đ và tối đa ${formatVND(available)}`,
              },
            ]}
          >
            <InputNumber
              className="w-full"
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(value) => Number(value?.replace(/\$\s?|(,*)/g, "") || 0)}
              addonAfter="VNĐ"
            />
          </Form.Item>

          <Form.Item
            name="bankName"
            label="Tên Ngân hàng"
            rules={[{ required: true, message: "Vui lòng nhập tên ngân hàng" }]}
          >
            <Input autoComplete="off" placeholder="Tên ngân hàng" />
          </Form.Item>

          <Form.Item
            name="accountNumber"
            label="Số tài khoản ngân hàng"
            rules={[
              { required: true, message: "Vui lòng nhập số tài khoản" },
              { min: 6, message: "Số tài khoản không hợp lệ" },
            ]}
          >
            <Input autoComplete="off" inputMode="numeric" placeholder="Nhập số tài khoản" />
          </Form.Item>

          <Form.Item
            name="accountHolderName"
            label="Tên chủ tài khoản (In hoa không dấu)"
            rules={[{ required: true, message: "Vui lòng nhập tên chủ tài khoản" }]}
          >
            <Input autoComplete="off" placeholder="Tên chủ tài khoản" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
