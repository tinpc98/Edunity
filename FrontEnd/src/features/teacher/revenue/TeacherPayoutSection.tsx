import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Button, Card, Form, Input, Modal, Table, Tag, Typography } from "antd";
import { BankOutlined } from "@ant-design/icons";
import {
  financeService,
  financeKeys,
  type Payout,
  type PayoutRequestPayload,
  type PayoutStatus,
} from "../../../services/finance.service";
import { formatVND } from "../../../types/payment";

const { Title, Text } = Typography;

const STATUS: Record<PayoutStatus, { label: string; color: string }> = {
  PENDING: { label: "Chờ xử lý", color: "gold" },
  PROCESSING: { label: "Đang xử lý", color: "blue" },
  COMPLETED: { label: "Đã chuyển", color: "green" },
  FAILED: { label: "Thất bại", color: "red" },
  REJECTED: { label: "Bị từ chối", color: "red" },
};

/**
 * Payout requests for the Teacher. Earnings become AVAILABLE when their class is completed; a request pays out all
 * of them to the bank account entered here. One request at a time.
 */
export default function TeacherPayoutSection({ available }: { available: number }) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<PayoutRequestPayload>();

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: financeKeys.teacherPayouts(),
    queryFn: () => financeService.getMyPayouts(),
  });
  const hasOpenRequest = payouts.some((p) => p.status === "PENDING" || p.status === "PROCESSING");

  const requestMutation = useMutation({
    mutationFn: (payload: PayoutRequestPayload) => financeService.requestPayout(payload),
    onSuccess: () => {
      message.success("Đã gửi yêu cầu rút tiền. Quản trị viên sẽ xử lý và thông báo cho bạn.");
      setOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
    onError: (err: any) => message.error(err?.message || "Không thể gửi yêu cầu rút tiền."),
  });

  return (
    <Card className="rounded-2xl border-slate-200/80 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <Title level={5} className="!mb-1 text-slate-800">
            Rút tiền
          </Title>
          <Text type="secondary" className="text-xs">
            Thu nhập chuyển sang Khả dụng khi lớp học kết thúc. Bạn có thể rút toàn bộ số dư khả dụng về tài khoản ngân hàng.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<BankOutlined />}
          disabled={available <= 0 || hasOpenRequest}
          onClick={() => setOpen(true)}
          className="bg-indigo-600"
        >
          {hasOpenRequest ? "Đang có yêu cầu chờ xử lý" : `Rút ${formatVND(available)}`}
        </Button>
      </div>

      <Table<Payout>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={payouts}
        pagination={{ pageSize: 5 }}
        locale={{ emptyText: "Chưa có yêu cầu rút tiền nào." }}
        columns={[
          { title: "Ngày yêu cầu", dataIndex: "requestedAt", render: (v: string) => new Date(v).toLocaleString("vi-VN") },
          { title: "Số tiền", dataIndex: "amount", render: (v: string) => formatVND(Number(v)) },
          {
            title: "Tài khoản",
            dataIndex: "bankAccountSnapshot",
            render: (b: Payout["bankAccountSnapshot"]) => `${b.bankName} • ${b.accountNumber}`,
          },
          {
            title: "Trạng thái",
            dataIndex: "status",
            render: (s: PayoutStatus, row) => (
              <div>
                <Tag color={STATUS[s]?.color}>{STATUS[s]?.label || s}</Tag>
                {row.reviewNote && <div className="text-[11px] text-slate-500 mt-1">{row.reviewNote}</div>}
              </div>
            ),
          },
        ]}
      />

      <Modal
        title="Yêu cầu rút tiền"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Gửi yêu cầu"
        cancelText="Hủy"
        confirmLoading={requestMutation.isPending}
      >
        <p className="text-sm text-slate-600 mb-4">
          Số tiền rút: <strong>{formatVND(available)}</strong>
        </p>
        <Form form={form} layout="vertical" onFinish={(values) => requestMutation.mutate(values)}>
          <Form.Item name="bankName" label="Ngân hàng" rules={[{ required: true, message: "Nhập tên ngân hàng" }]}>
            <Input placeholder="VD: Vietcombank" />
          </Form.Item>
          <Form.Item name="accountNumber" label="Số tài khoản" rules={[{ required: true, message: "Nhập số tài khoản" }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="accountHolderName"
            label="Chủ tài khoản"
            rules={[{ required: true, message: "Nhập tên chủ tài khoản" }]}
          >
            <Input placeholder="VIET HOA KHONG DAU" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
