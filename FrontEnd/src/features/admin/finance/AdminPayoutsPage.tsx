import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Button, Card, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { BankOutlined } from "@ant-design/icons";
import { financeService, financeKeys, type Payout, type PayoutStatus } from "../../../services/finance.service";
import { formatVND } from "../../../types/payment";

const { Title, Text } = Typography;

const STATUS: Record<PayoutStatus, { label: string; color: string }> = {
  PENDING: { label: "Chờ xử lý", color: "gold" },
  PROCESSING: { label: "Đang xử lý", color: "blue" },
  COMPLETED: { label: "Đã chuyển", color: "green" },
  FAILED: { label: "Thất bại", color: "red" },
  REJECTED: { label: "Từ chối", color: "red" },
};

/**
 * F02 — Admin payout queue: confirm a bank transfer (earnings become PAID_OUT) or reject the request with a reason
 * (earnings are released for a new request).
 */
export default function AdminPayoutsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("PENDING");
  const [rejecting, setRejecting] = useState<Payout | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: financeKeys.adminPayouts(page, status),
    queryFn: () => financeService.getAdminPayouts(page, status),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: financeKeys.all });

  const completeMutation = useMutation({
    mutationFn: (id: string) => financeService.completePayout(id),
    onSuccess: () => {
      message.success("Đã xác nhận chuyển tiền.");
      refresh();
    },
    onError: (err: any) => message.error(err?.message || "Không thể xác nhận."),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => financeService.rejectPayout(id, note),
    onSuccess: () => {
      message.success("Đã từ chối yêu cầu rút tiền.");
      setRejecting(null);
      setRejectNote("");
      refresh();
    },
    onError: (err: any) => message.error(err?.message || "Không thể từ chối."),
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-900 font-bold flex items-center gap-2">
            <BankOutlined className="text-indigo-600" /> Yêu cầu rút tiền của giáo viên
          </Title>
          <Text type="secondary" className="text-sm">
            Chuyển khoản theo thông tin ngân hàng giáo viên cung cấp, sau đó xác nhận để ghi nhận chi trả.
          </Text>
        </div>
        <Select
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          style={{ width: 180 }}
          options={[
            { value: "ALL", label: "Tất cả" },
            ...Object.entries(STATUS).map(([value, { label }]) => ({ value, label })),
          ]}
        />
      </div>

      <Card className="rounded-2xl border-slate-200/80 shadow-xs">
        <Table<Payout>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items || []}
          pagination={{ current: page, total: data?.total || 0, pageSize: 20, onChange: setPage }}
          locale={{ emptyText: "Không có yêu cầu nào." }}
          columns={[
            {
              title: "Giáo viên",
              key: "teacher",
              render: (_, p) => (
                <div>
                  <div className="font-medium">{p.teacherName || "—"}</div>
                  <div className="text-xs text-slate-500">{p.teacherEmail}</div>
                </div>
              ),
            },
            { title: "Số tiền", dataIndex: "amount", render: (v: string) => <strong>{formatVND(Number(v))}</strong> },
            {
              title: "Tài khoản nhận",
              dataIndex: "bankAccountSnapshot",
              render: (b: Payout["bankAccountSnapshot"]) => (
                <div className="text-xs">
                  <div>{b.bankName}</div>
                  <div className="font-mono">{b.accountNumber}</div>
                  <div>{b.accountHolderName}</div>
                </div>
              ),
            },
            { title: "Ngày yêu cầu", dataIndex: "requestedAt", render: (v: string) => new Date(v).toLocaleString("vi-VN") },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (s: PayoutStatus) => <Tag color={STATUS[s]?.color}>{STATUS[s]?.label || s}</Tag>,
            },
            {
              title: "Thao tác",
              key: "actions",
              render: (_, p) =>
                p.status === "PENDING" || p.status === "PROCESSING" ? (
                  <Space>
                    <Popconfirm
                      title="Xác nhận đã chuyển khoản?"
                      description={`Đã chuyển ${formatVND(Number(p.amount))} tới tài khoản của giáo viên.`}
                      okText="Đã chuyển"
                      cancelText="Hủy"
                      onConfirm={() => completeMutation.mutate(p.id)}
                    >
                      <Button type="primary" size="small" loading={completeMutation.isPending} className="bg-emerald-600">
                        Xác nhận đã chuyển
                      </Button>
                    </Popconfirm>
                    <Button danger size="small" onClick={() => setRejecting(p)}>
                      Từ chối
                    </Button>
                  </Space>
                ) : (
                  <span className="text-xs text-slate-500">{p.reviewNote || "—"}</span>
                ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Từ chối yêu cầu rút tiền"
        open={Boolean(rejecting)}
        onCancel={() => setRejecting(null)}
        onOk={() => rejecting && rejectMutation.mutate({ id: rejecting.id, note: rejectNote.trim() })}
        okButtonProps={{ danger: true, disabled: !rejectNote.trim() }}
        okText="Từ chối"
        cancelText="Hủy"
        confirmLoading={rejectMutation.isPending}
      >
        <p className="text-sm text-slate-600 mb-2">Lý do (giáo viên sẽ nhận được thông báo kèm lý do):</p>
        <Input.TextArea rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
      </Modal>
    </div>
  );
}
