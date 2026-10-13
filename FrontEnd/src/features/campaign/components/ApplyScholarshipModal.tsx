import { useState } from "react";
import { App as AntdApp, Modal, Form, Input, Button, Upload, Alert, Typography } from "antd";
import { UploadOutlined, CheckCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { useQueryClient } from "@tanstack/react-query";
import {
  scholarshipApplicationKeys,
  scholarshipApplicationService,
} from "../../../services/scholarshipApplication.service";
import type { ScholarshipCampaign } from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { Link } from "react-router-dom";
import { ROUTES } from "../../../routes/routePaths";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import { PRIVATE_DOCUMENT_ACCEPT, validatePrivateDocument } from "../../../utils/fileValidation";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const MAX_FILES = 5;

interface ApplyScholarshipModalProps {
  open: boolean;
  onClose: () => void;
  campaign: ScholarshipCampaign;
  onSuccess?: () => void;
}

export default function ApplyScholarshipModal({
  open,
  onClose,
  campaign,
  onSuccess,
}: ApplyScholarshipModalProps) {
  const [form] = Form.useForm<{ statement: string }>();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [submittedAppId, setSubmittedAppId] = useState<string | null>(null);

  const handleSubmit = async () => {
    let values: { statement: string };
    try {
      values = await form.validateFields();
    } catch {
      return; // field errors are shown inline
    }
    if (fileList.length === 0) {
      message.error("Vui lòng tải lên ít nhất một tài liệu chứng minh.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Upload files to private storage (purpose SCHOLARSHIP_PROOF)
      const uploadedFiles: { storageKey: string; mimeType?: string; side: "SINGLE" }[] = [];
      for (const [index, item] of fileList.entries()) {
        if (!item.originFileObj) continue;
        setProgressText(`Đang tải tệp ${index + 1}/${fileList.length}...`);
        try {
          const res = await scholarshipApplicationService.uploadDocument(item.originFileObj);
          uploadedFiles.push({ storageKey: res.storageKey, mimeType: res.mimeType, side: "SINGLE" });
        } catch (err) {
          throw new Error(`Tải "${item.name}" thất bại: ${getFriendlyErrorMessage(err)}`);
        }
      }

      // 2. Submit the application. The award amount is decided by the campaign, never sent by the client.
      setProgressText("Đang gửi hồ sơ...");
      const result = await scholarshipApplicationService.apply(campaign.id, {
        statement: values.statement.trim(),
        documents: [{ files: uploadedFiles }],
      });

      message.success("Nộp hồ sơ xin học bổng thành công!");
      setSubmittedAppId(result.id);
      form.resetFields();
      setFileList([]);
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
      onSuccess?.();
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, "Nộp hồ sơ thất bại. Vui lòng thử lại."));
    } finally {
      setIsSubmitting(false);
      setProgressText(null);
    }
  };

  const handleModalClose = () => {
    if (isSubmitting) return;
    setSubmittedAppId(null);
    form.resetFields();
    setFileList([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={handleModalClose}
      footer={null}
      width={640}
      destroyOnHidden
      centered
      maskClosable={!isSubmitting}
      className="rounded-3xl overflow-hidden"
    >
      {submittedAppId ? (
        <div className="py-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto">
            <CheckCircleOutlined />
          </div>
          <div>
            <Title level={4} className="!mb-1 text-slate-900 font-bold">
              Nộp hồ sơ thành công!
            </Title>
            <Paragraph className="text-slate-600 text-sm max-w-md mx-auto">
              Hồ sơ xin học bổng của bạn cho chiến dịch <strong>{campaign.title}</strong> đã được gửi tới Ban quản trị để thẩm định.
              Bạn sẽ nhận được thông báo khi có kết quả.
            </Paragraph>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={handleModalClose} className="rounded-xl">
              Đóng
            </Button>
            <Link to={ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS}>
              <Button type="primary" className="bg-indigo-600 rounded-xl">
                Theo dõi hồ sơ của tôi
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="py-2 space-y-5">
          <div>
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
              Ứng tuyển học bổng
            </div>
            <Title level={4} className="!mb-1 text-slate-900 font-black">
              {campaign.title}
            </Title>
            <Text type="secondary" className="text-xs">
              Mức học bổng định mức: <strong className="text-indigo-600">{formatVND(campaign.awardAmountPerStudent)}</strong> / suất
            </Text>
          </div>

          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined className="text-indigo-600" />}
            message="Quy định xét duyệt học bổng"
            description="Mức tài trợ được ấn định theo quy mô chiến dịch và không do học sinh tự điền. Vui lòng cung cấp thư nguyện vọng chân thực cùng các chứng từ chứng minh hoàn cảnh/thành tích học tập."
            className="rounded-2xl bg-indigo-50/60 border-indigo-100 text-xs"
          />

          {campaign.eligibilityCriteria && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-bold text-slate-700 mb-1">Điều kiện xét duyệt</div>
              <div className="whitespace-pre-line">{campaign.eligibilityCriteria}</div>
            </div>
          )}

          <Form form={form} layout="vertical" className="space-y-4">
            <Form.Item
              name="statement"
              label={
                <span className="text-xs font-bold text-slate-700 uppercase">
                  Hoàn cảnh & Mục tiêu học tập (Thư nguyện vọng) <span className="text-rose-500">*</span>
                </span>
              }
              rules={[
                { required: true, whitespace: true, message: "Vui lòng nhập thư nguyện vọng và hoàn cảnh của bạn" },
                { min: 30, message: "Vui lòng viết tối thiểu 30 ký tự để mô tả rõ ràng hoàn cảnh" },
              ]}
            >
              <TextArea
                rows={5}
                showCount
                maxLength={3000}
                placeholder="Mô tả hoàn cảnh kinh tế gia đình, động lực học tập và mục tiêu bạn muốn đạt được khi nhận học bổng này..."
                className="rounded-xl text-sm"
              />
            </Form.Item>

            <Form.Item
              label={
                <span className="text-xs font-bold text-slate-700 uppercase">
                  Tài liệu xác thực & Chứng minh <span className="text-rose-500">*</span>
                </span>
              }
              extra={`Hỗ trợ: PDF, JPG, PNG, WebP (tối đa 10MB/tệp, tối đa ${MAX_FILES} tệp). Ví dụ: Giấy chứng nhận hộ nghèo/cận nghèo, bảng điểm, căn cước công dân...`}
            >
              <Upload
                fileList={fileList}
                onChange={({ fileList: next }) => setFileList(next)}
                beforeUpload={(file) => {
                  const error = validatePrivateDocument(file);
                  if (error) {
                    message.error(error);
                    return Upload.LIST_IGNORE;
                  }
                  return false;
                }}
                multiple
                maxCount={MAX_FILES}
                accept={PRIVATE_DOCUMENT_ACCEPT}
                disabled={isSubmitting}
              >
                <Button icon={<UploadOutlined />} className="rounded-xl font-medium text-xs">
                  Chọn tệp đính kèm
                </Button>
              </Upload>
            </Form.Item>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              {progressText && <span className="mr-auto text-xs text-slate-500">{progressText}</span>}
              <Button onClick={handleModalClose} disabled={isSubmitting} className="rounded-xl">
                Hủy bỏ
              </Button>
              <Button
                type="primary"
                onClick={handleSubmit}
                loading={isSubmitting}
                className="bg-indigo-600 rounded-xl font-semibold px-6"
              >
                Nộp hồ sơ ngay
              </Button>
            </div>
          </Form>
        </div>
      )}
    </Modal>
  );
}
