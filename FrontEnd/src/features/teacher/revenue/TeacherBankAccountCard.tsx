import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App as AntdApp, Button, Form, Input, Modal, Skeleton, Tag } from "antd";
import { BankOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { BANK_STATUS_META, TEACHER_BANK_ACCOUNT_KEY, teacherBankAccountService } from "../../../services/teacherBankAccount.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

/** The single payout account (BAO-09): payouts always go here, never to an account typed at request time. */
export default function TeacherBankAccountCard() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ bankName: string; accountNumber: string; accountHolderName: string }>();
  const [open, setOpen] = useState(false);

  const { data: account, isPending, isError } = useQuery({ queryKey: TEACHER_BANK_ACCOUNT_KEY, queryFn: teacherBankAccountService.getMine });

  const submitMutation = useMutation({
    mutationFn: teacherBankAccountService.submit,
    onSuccess: () => {
      message.success("Đã gửi tài khoản để Edunity duyệt.");
      setOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: TEACHER_BANK_ACCOUNT_KEY });
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  if (isPending) return <Skeleton active paragraph={{ rows: 1 }} />;
  if (isError) return <Alert type="error" showIcon message="Không tải được tài khoản nhận tiền." />;

  const locked = account && dayjs(account.payoutLockedUntil).isAfter(dayjs());

  return (
    <div className="rounded-xl border border-slate-200 p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <BankOutlined className="text-indigo-600 text-xl mt-1" />
        {account ? (
          <div className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-800">
                {account.bankName} · {account.accountNumberMasked}
              </span>
              <Tag color={BANK_STATUS_META[account.status].color} className="!m-0">{BANK_STATUS_META[account.status].label}</Tag>
            </div>
            <div className="text-xs text-slate-500 mt-1">Chủ tài khoản: {account.accountHolderName}</div>
            {account.status === "REJECTED" && account.reviewNote && (
              <div className="text-xs text-rose-700 mt-1">Lý do: {account.reviewNote}</div>
            )}
            {locked && (
              <div className="text-xs text-amber-700 mt-1">
                Vì tài khoản vừa thay đổi, rút tiền tạm khoá đến {dayjs(account.payoutLockedUntil).format("HH:mm DD/MM/YYYY")}.
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-600">
            Chưa có tài khoản nhận tiền. Đăng ký tài khoản đứng tên bạn (đúng họ tên trên CCCD) để rút tiền.
          </div>
        )}
      </div>
      <Button onClick={() => setOpen(true)}>{account ? "Đổi tài khoản" : "Đăng ký tài khoản"}</Button>

      <Modal
        title="Tài khoản nhận tiền"
        open={open}
        onCancel={() => !submitMutation.isPending && setOpen(false)}
        onOk={() => form.submit()}
        okText="Gửi duyệt"
        confirmLoading={submitMutation.isPending}
      >
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          message="Mỗi lần đổi tài khoản, Edunity sẽ duyệt lại và tạm khoá rút tiền 72 giờ để bảo vệ bạn."
        />
        <Form form={form} layout="vertical" onFinish={(values) => submitMutation.mutate(values)}>
          <Form.Item name="bankName" label="Ngân hàng" rules={[{ required: true, whitespace: true, message: "Nhập tên ngân hàng" }]}>
            <Input placeholder="Ví dụ: Vietcombank" maxLength={100} />
          </Form.Item>
          <Form.Item
            name="accountNumber"
            label="Số tài khoản"
            rules={[
              { required: true, message: "Nhập số tài khoản" },
              { pattern: /^[\d ]{6,24}$/, message: "Số tài khoản gồm 6–20 chữ số" },
            ]}
          >
            <Input inputMode="numeric" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="accountHolderName"
            label="Chủ tài khoản (đúng họ tên trên CCCD)"
            rules={[{ required: true, whitespace: true, message: "Nhập tên chủ tài khoản" }]}
          >
            <Input autoComplete="off" placeholder="NGUYEN VAN A" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
