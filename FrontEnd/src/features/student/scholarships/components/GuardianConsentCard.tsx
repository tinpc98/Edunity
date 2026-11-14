import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App as AntdApp, Button, Card, Checkbox, Form, Input, Modal, Select, Tag, Upload } from "antd";
import type { UploadFile } from "antd";
import { SafetyCertificateOutlined, UploadOutlined } from "@ant-design/icons";
import {
  GUARDIAN_CONSENT_STATUS_META,
  GUARDIAN_CONSENTS_KEY,
  scholarshipPrivacyService,
} from "../../../../services/scholarshipPrivacy.service";
import { teacherVerificationService } from "../../../../services/teacherVerification.service";
import { getFriendlyErrorMessage } from "../../../../utils/apiErrorMap";
import { PRIVATE_DOCUMENT_ACCEPT } from "../../../../utils/fileValidation";

const RELATIONSHIPS = [
  { value: "FATHER", label: "Bố" },
  { value: "MOTHER", label: "Mẹ" },
  { value: "GRANDPARENT", label: "Ông/Bà" },
  { value: "SIBLING", label: "Anh/Chị" },
  { value: "LEGAL_GUARDIAN", label: "Người giám hộ hợp pháp" },
  { value: "OTHER", label: "Khác" },
];

interface FormValues {
  fullName: string;
  relationship: string;
  phone: string;
  file: UploadFile[];
  allowPublicStory?: boolean;
}

/** AID-08: students under 18 upload a consent form signed by their guardian before applying to this campaign. */
export default function GuardianConsentCard({ campaignId }: { campaignId: string }) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [open, setOpen] = useState(false);

  const { data: consents = [] } = useQuery({ queryKey: GUARDIAN_CONSENTS_KEY, queryFn: scholarshipPrivacyService.listMyConsents });
  const current = consents.find((c) => c.campaignId === campaignId && (c.status === "PENDING" || c.status === "VERIFIED"))
    ?? consents.find((c) => c.campaignId === campaignId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: GUARDIAN_CONSENTS_KEY });

  const submitMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const file = values.file?.[0]?.originFileObj;
      if (!file) throw new Error("Vui lòng tải lên giấy đồng thuận đã ký.");
      const uploaded = await teacherVerificationService.uploadPrivateFile("SCHOLARSHIP_PROOF", file);
      return scholarshipPrivacyService.submitConsent({
        campaignId,
        guardian: { fullName: values.fullName.trim(), relationship: values.relationship, phone: values.phone.trim() },
        documentStorageKey: uploaded.storageKey,
        allowPublicStory: Boolean(values.allowPublicStory),
      });
    },
    onSuccess: () => {
      message.success("Đã gửi giấy đồng thuận. Edunity sẽ xác nhận sớm.");
      setOpen(false);
      form.resetFields();
      refresh();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error, error instanceof Error ? error.message : undefined)),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => scholarshipPrivacyService.revokeConsent(id),
    onSuccess: () => {
      message.success("Đã rút lại đồng thuận.");
      refresh();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const live = current && (current.status === "PENDING" || current.status === "VERIFIED");

  return (
    <Card
      className="rounded-2xl border-slate-200 shadow-2xs"
      title={<span className="flex items-center gap-2"><SafetyCertificateOutlined className="text-indigo-600" /> Đồng thuận của phụ huynh</span>}
    >
      <p className="text-sm text-slate-600 mb-3">
        Học sinh dưới 18 tuổi cần giấy đồng thuận có chữ ký của phụ huynh/người giám hộ (kèm ảnh CCCD của họ) trước khi nộp hồ sơ chiến dịch này.
      </p>
      {current && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 mb-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{current.guardian.fullName}</span>
            <Tag color={GUARDIAN_CONSENT_STATUS_META[current.status].color} className="!m-0">{GUARDIAN_CONSENT_STATUS_META[current.status].label}</Tag>
            {current.allowPublicStory && <Tag className="!m-0">Cho phép chia sẻ câu chuyện ẩn danh</Tag>}
          </div>
          {current.status === "REJECTED" && current.reviewNote && <div className="text-xs text-rose-700 mt-1">Lý do: {current.reviewNote}</div>}
        </div>
      )}
      <div className="flex gap-2">
        {!live && <Button type="primary" onClick={() => setOpen(true)}>Nộp giấy đồng thuận</Button>}
        {live && (
          <Button danger loading={revokeMutation.isPending} onClick={() => current && revokeMutation.mutate(current.id)}>
            Rút lại đồng thuận
          </Button>
        )}
      </div>

      <Modal
        title="Giấy đồng thuận của phụ huynh"
        open={open}
        onCancel={() => !submitMutation.isPending && setOpen(false)}
        onOk={() => form.submit()}
        okText="Gửi"
        confirmLoading={submitMutation.isPending}
      >
        <Alert type="info" showIcon className="!mb-4" message="Giấy được lưu riêng tư; chỉ quản trị viên Edunity xem để xác nhận, mỗi lần xem đều được ghi lại." />
        <Form form={form} layout="vertical" onFinish={(values) => submitMutation.mutate(values)}>
          <Form.Item name="fullName" label="Họ tên phụ huynh/người giám hộ" rules={[{ required: true, whitespace: true, message: "Nhập họ tên" }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="relationship" label="Quan hệ" rules={[{ required: true, message: "Chọn quan hệ" }]}>
            <Select options={RELATIONSHIPS} />
          </Form.Item>
          <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, whitespace: true, message: "Nhập số điện thoại" }]}>
            <Input inputMode="tel" maxLength={20} />
          </Form.Item>
          <Form.Item
            name="file"
            label="Giấy đồng thuận đã ký (ảnh hoặc PDF, kèm CCCD phụ huynh)"
            valuePropName="fileList"
            getValueFromEvent={(e: { fileList?: UploadFile[] } | UploadFile[]) => (Array.isArray(e) ? e : e?.fileList)}
            rules={[{ required: true, message: "Tải lên giấy đồng thuận" }]}
          >
            <Upload accept={PRIVATE_DOCUMENT_ACCEPT} beforeUpload={() => false} maxCount={1}>
              <Button icon={<UploadOutlined />}>Chọn tệp</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="allowPublicStory" valuePropName="checked">
            <Checkbox>Phụ huynh đồng ý cho chia sẻ câu chuyện ẩn danh của em với nhà hảo tâm (có thể rút lại bất cứ lúc nào)</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
