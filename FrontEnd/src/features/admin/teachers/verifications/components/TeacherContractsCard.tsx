import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, DatePicker, Empty, Form, Input, Modal, Tag, message } from "antd";
import { FileProtectOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { CONTRACT_STATUS_META, teacherContractService, type TeacherContract } from "../../../../../services/teacherContract.service";
import { getFriendlyErrorMessage } from "../../../../../utils/apiErrorMap";

const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "—");

interface Props {
  teacherId: string;
  isVerified: boolean;
}

export default function TeacherContractsCard({ teacherId, isVerified }: Props) {
  const queryClient = useQueryClient();
  const [sendForm] = Form.useForm<{ period: [Dayjs, Dayjs]; note?: string }>();
  const [endForm] = Form.useForm<{ reason: string }>();
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [ending, setEnding] = useState<TeacherContract | null>(null);

  const queryKey = ["admin-teacher-contracts", teacherId];
  const { data: contracts = [], isPending } = useQuery({ queryKey, queryFn: () => teacherContractService.adminList(teacherId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const sendMutation = useMutation({
    mutationFn: (values: { period: [Dayjs, Dayjs]; note?: string }) =>
      teacherContractService.adminSend(teacherId, {
        effectiveFrom: values.period[0].startOf("day").toISOString(),
        expiresAt: values.period[1].endOf("day").toISOString(),
        note: values.note,
      }),
    onSuccess: () => {
      message.success("Đã gửi hợp đồng cho giáo viên ký");
      setIsSendOpen(false);
      sendForm.resetFields();
      refresh();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const endMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => teacherContractService.adminEnd(id, reason),
    onSuccess: () => {
      message.success("Đã cập nhật hợp đồng");
      setEnding(null);
      endForm.resetFields();
      refresh();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const hasPending = contracts.some((c) => c.status === "PENDING_SIGNATURE");

  return (
    <Card
      className="rounded-2xl shadow-sm border-gray-100"
      title={<span className="font-bold flex items-center gap-2"><FileProtectOutlined className="text-indigo-500" /> Hợp đồng giảng dạy</span>}
      extra={
        <Button type="primary" disabled={!isVerified || hasPending} onClick={() => setIsSendOpen(true)}>
          Gửi hợp đồng
        </Button>
      }
      loading={isPending}
    >
      {!isVerified && <div className="text-xs text-gray-500 mb-3">Chỉ gửi được hợp đồng cho giáo viên đã xác minh.</div>}
      {contracts.length === 0 ? (
        <Empty description="Chưa có hợp đồng" />
      ) : (
        <div className="flex flex-col gap-3">
          {contracts.map((contract) => (
            <div key={contract.id} className="rounded-xl border border-gray-100 p-3 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{contract.contractCode}</span>
                <Tag color={CONTRACT_STATUS_META[contract.status].color} className="!m-0">{CONTRACT_STATUS_META[contract.status].label}</Tag>
                {contract.provider === "SANDBOX" && <Tag className="!m-0">Sandbox</Tag>}
              </div>
              <div className="text-xs text-gray-500">
                {formatDate(contract.effectiveFrom)} → {formatDate(contract.expiresAt)} · Gửi {formatDate(contract.sentAt)}
                {contract.signedAt && <> · Ký {formatDate(contract.signedAt)}</>}
              </div>
              {contract.terminationReason && <div className="text-sm text-gray-700">Lý do: {contract.terminationReason}</div>}
              {(contract.status === "ACTIVE" || contract.status === "PENDING_SIGNATURE") && (
                <Button size="small" danger className="self-start mt-1" onClick={() => setEnding(contract)}>
                  {contract.status === "ACTIVE" ? "Chấm dứt hợp đồng" : "Huỷ yêu cầu ký"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        title="Gửi hợp đồng giảng dạy"
        open={isSendOpen}
        onCancel={() => setIsSendOpen(false)}
        onOk={() => sendForm.submit()}
        okText="Gửi để ký"
        confirmLoading={sendMutation.isPending}
      >
        <Form
          form={sendForm}
          layout="vertical"
          initialValues={{ period: [dayjs(), dayjs().add(12, "month")] }}
          onFinish={(values) => sendMutation.mutate(values)}
        >
          <Form.Item name="period" label="Thời hạn hợp đồng" rules={[{ required: true, message: "Chọn thời hạn" }]}>
            <DatePicker.RangePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d.isBefore(dayjs(), "day")} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú (không bắt buộc)">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={ending?.status === "ACTIVE" ? "Chấm dứt hợp đồng" : "Huỷ yêu cầu ký"}
        open={!!ending}
        onCancel={() => setEnding(null)}
        onOk={() => endForm.submit()}
        okButtonProps={{ danger: true }}
        confirmLoading={endMutation.isPending}
      >
        <p className="text-sm text-gray-600">
          Giáo viên sẽ không thể mở lớp mới khi không còn hợp đồng hiệu lực. Các lớp đang dạy không bị ảnh hưởng.
        </p>
        <Form form={endForm} layout="vertical" onFinish={({ reason }) => ending && endMutation.mutate({ id: ending.id, reason })}>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Nhập lý do" }]}>
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
