import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Button, Card, Empty, Form, Input, Modal, Table, Tag } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { teacherBankAccountService, type AdminBankAccountItem } from "../../../services/teacherBankAccount.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const QUERY_KEY = ["admin-teacher-bank-accounts", "PENDING_REVIEW"];

/** BAO-09: teacher payout accounts awaiting review, shown above the payout queue. */
export default function AdminBankAccountReviewCard() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ reviewNote: string }>();
  const [rejecting, setRejecting] = useState<AdminBankAccountItem | null>(null);

  const { data, isPending } = useQuery({ queryKey: QUERY_KEY, queryFn: () => teacherBankAccountService.adminList() });
  const done = (text: string) => {
    message.success(text);
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const approveMutation = useMutation({
    mutationFn: (teacherId: string) => teacherBankAccountService.adminApprove(teacherId),
    onSuccess: () => done("Đã duyệt tài khoản ngân hàng"),
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ teacherId, reviewNote }: { teacherId: string; reviewNote: string }) => teacherBankAccountService.adminReject(teacherId, reviewNote),
    onSuccess: () => {
      setRejecting(null);
      form.resetFields();
      done("Đã từ chối tài khoản ngân hàng");
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const items = data?.items ?? [];

  return (
    <Card
      className="rounded-2xl border-slate-200/80"
      title={
        <span className="flex items-center gap-2">
          <SafetyCertificateOutlined className="text-indigo-600" /> Tài khoản nhận tiền chờ duyệt
          {items.length > 0 && <Tag color="processing">{items.length}</Tag>}
        </span>
      }
      loading={isPending}
    >
      {items.length === 0 ? (
        <Empty description="Không có tài khoản nào chờ duyệt" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table
          rowKey="teacherId"
          size="small"
          pagination={false}
          dataSource={items}
          scroll={{ x: true }}
          columns={[
            { title: "Giáo viên", render: (_, r) => <div><div className="font-medium">{r.fullName}</div><div className="text-xs text-slate-500">{r.email}</div></div> },
            { title: "Ngân hàng", render: (_, r) => r.bankAccount.bankName },
            { title: "Số tài khoản", render: (_, r) => <span className="font-mono">{r.bankAccount.accountNumber}</span> },
            {
              title: "Chủ TK / Tên trên CCCD",
              render: (_, r) => (
                <div className="text-xs">
                  <div>{r.bankAccount.accountHolderName}</div>
                  <div className="text-slate-500">{r.identityName ?? "—"}</div>
                </div>
              ),
            },
            { title: "Gửi lúc", render: (_, r) => dayjs(r.bankAccount.submittedAt).format("DD/MM/YYYY HH:mm") },
            {
              title: "",
              render: (_, r) => (
                <div className="flex gap-2">
                  <Button size="small" type="primary" loading={approveMutation.isPending && approveMutation.variables === r.teacherId} onClick={() => approveMutation.mutate(r.teacherId)}>
                    Duyệt
                  </Button>
                  <Button size="small" danger onClick={() => setRejecting(r)}>Từ chối</Button>
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        title="Từ chối tài khoản ngân hàng"
        open={!!rejecting}
        onCancel={() => setRejecting(null)}
        onOk={() => form.submit()}
        okButtonProps={{ danger: true }}
        confirmLoading={rejectMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={({ reviewNote }) => rejecting && rejectMutation.mutate({ teacherId: rejecting.teacherId, reviewNote })}>
          <Form.Item name="reviewNote" label="Lý do (gửi cho giáo viên)" rules={[{ required: true, whitespace: true, message: "Nhập lý do" }]}>
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
