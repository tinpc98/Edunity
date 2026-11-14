import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Button, Card, Empty, Form, Input, Modal, Table, Tag } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { scholarshipPrivacyService, type GuardianConsent } from "../../../services/scholarshipPrivacy.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const QUERY_KEY = ["admin-guardian-consents", "PENDING"];

/** AID-08: consent forms signed by guardians of students under 18, awaiting Admin confirmation. */
export default function GuardianConsentReviewCard() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ reviewNote: string }>();
  const [rejecting, setRejecting] = useState<GuardianConsent | null>(null);

  const { data, isPending } = useQuery({ queryKey: QUERY_KEY, queryFn: () => scholarshipPrivacyService.adminList() });
  const done = (text: string) => {
    message.success(text);
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const openFile = useMutation({
    mutationFn: (storageKey: string) => scholarshipPrivacyService.openPrivateFile(storageKey),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });
  const verify = useMutation({
    mutationFn: (id: string) => scholarshipPrivacyService.adminVerify(id),
    onSuccess: () => done("Đã xác nhận đồng thuận"),
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });
  const reject = useMutation({
    mutationFn: ({ id, reviewNote }: { id: string; reviewNote: string }) => scholarshipPrivacyService.adminReject(id, reviewNote),
    onSuccess: () => {
      setRejecting(null);
      form.resetFields();
      done("Đã từ chối giấy đồng thuận");
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const items = data?.items ?? [];

  return (
    <Card
      className="rounded-2xl border-slate-200"
      title={
        <span className="flex items-center gap-2">
          <SafetyCertificateOutlined className="text-indigo-600" /> Giấy đồng thuận phụ huynh chờ xác nhận
          {items.length > 0 && <Tag color="processing">{items.length}</Tag>}
        </span>
      }
      loading={isPending}
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có giấy đồng thuận nào chờ xác nhận" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={items}
          scroll={{ x: true }}
          columns={[
            {
              title: "Học sinh",
              render: (_, c) => (
                <div>
                  <div className="font-medium">{c.student?.fullName ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {c.student?.email} · {c.student?.dateOfBirth ? `Sinh ${dayjs(c.student.dateOfBirth).format("DD/MM/YYYY")}` : "Chưa có ngày sinh"}
                  </div>
                </div>
              ),
            },
            { title: "Phụ huynh", render: (_, c) => <div className="text-xs"><div>{c.guardian.fullName} ({c.guardian.relationship})</div><div>{c.guardian.phone}</div></div> },
            { title: "Chia sẻ câu chuyện", render: (_, c) => (c.allowPublicStory ? <Tag color="blue">Có</Tag> : <Tag>Không</Tag>) },
            { title: "Gửi lúc", render: (_, c) => dayjs(c.submittedAt).format("DD/MM/YYYY HH:mm") },
            {
              title: "",
              render: (_, c) => (
                <div className="flex gap-2">
                  <Button size="small" loading={openFile.isPending && openFile.variables === c.documentStorageKey} onClick={() => c.documentStorageKey && openFile.mutate(c.documentStorageKey)}>
                    Xem giấy
                  </Button>
                  <Button size="small" type="primary" loading={verify.isPending && verify.variables === c.id} onClick={() => verify.mutate(c.id)}>
                    Xác nhận
                  </Button>
                  <Button size="small" danger onClick={() => setRejecting(c)}>Từ chối</Button>
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        title="Từ chối giấy đồng thuận"
        open={!!rejecting}
        onCancel={() => setRejecting(null)}
        onOk={() => form.submit()}
        okButtonProps={{ danger: true }}
        confirmLoading={reject.isPending}
      >
        <Form form={form} layout="vertical" onFinish={({ reviewNote }) => rejecting && reject.mutate({ id: rejecting.id, reviewNote })}>
          <Form.Item name="reviewNote" label="Lý do (gửi cho học sinh)" rules={[{ required: true, whitespace: true, message: "Nhập lý do" }]}>
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
