import { useState } from "react";
import { Modal, Form, Input, Button, Upload, Alert, message, Typography } from "antd";
import { UploadOutlined, CheckCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { scholarshipApplicationService } from "../../../services/scholarshipApplication.service";
import type { ScholarshipCampaign } from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { Link } from "react-router-dom";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

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
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAppId, setSubmittedAppId] = useState<string | null>(null);

  const handleUploadChange = ({ fileList: newFileList }: { fileList: UploadFile[] }) => {
    setFileList(newFileList);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (fileList.length === 0) {
        message.error("Vui lòng tải lên ít nhất một tài liệu chứng minh.");
        return;
      }

      setIsSubmitting(true);

      // 1. Upload files to private storage
      const uploadedFiles: { storageKey: string; mimeType?: string; side?: "SINGLE" }[] = [];
      for (const item of fileList) {
        if (item.originFileObj) {
          const res = await scholarshipApplicationService.uploadDocument(item.originFileObj);
          uploadedFiles.push({
            storageKey: res.storageKey,
            mimeType: res.mimeType,
            side: "SINGLE",
          });
        }
      }

      if (uploadedFiles.length === 0) {
        message.error("Không thể tải lên tệp đính kèm. Vui lòng thử lại.");
        setIsSubmitting(false);
        return;
      }

      // 2. Submit application
      const payload = {
        statement: values.statement,
        documents: [
          {
            files: uploadedFiles,
          },
        ],
      };

      const result = await scholarshipApplicationService.apply(campaign.id, payload);
      message.success("Nộp hồ sơ xin học bổng thành công!");
      setSubmittedAppId(result.id);
      form.resetFields();
      setFileList([]);
      onSuccess?.();
    } catch (err: any) {
      if (err.code === "DUPLICATE_APPLICATION") {
        message.error("Bạn đã có hồ sơ đang xử lý hoặc đã duyệt cho chiến dịch này.");
      } else {
        message.error(err.message || "Nộp hồ sơ thất bại. Vui lòng thử lại.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalClose = () => {
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
      destroyOnClose
      centered
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
            </Paragraph>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={handleModalClose} className="rounded-xl">
              Đóng
            </Button>
            <Link to={ROUTES.STUDENT.HOME + "/scholarships/applications"}>
              <Button type="primary" className="bg-indigo-600 rounded-xl">
                Xem hồ sơ của tôi
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

          <Form form={form} layout="vertical" className="space-y-4">
            <Form.Item
              name="statement"
              label={
                <span className="text-xs font-bold text-slate-700 uppercase">
                  Hoàn cảnh & Mục tiêu học tập (Thư nguyện vọng) <span className="text-rose-500">*</span>
                </span>
              }
              rules={[
                { required: true, message: "Vui lòng nhập thư nguyện vọng và hoàn cảnh của bạn" },
                { min: 30, message: "Vui lòng viết tối thiểu 30 ký tự để mô tả rõ ràng hoàn cảnh" },
              ]}
            >
              <TextArea
                rows={5}
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
              extra="Hỗ trợ: PDF, JPG, PNG (tối đa 10MB/tệp). Ví dụ: Giấy chứng nhận hộ nghèo/cận nghèo, bảng điểm, căn cước công dân..."
            >
              <Upload
                fileList={fileList}
                onChange={handleUploadChange}
                beforeUpload={() => false}
                multiple
                accept=".pdf,.png,.jpg,.jpeg"
              >
                <Button icon={<UploadOutlined />} className="rounded-xl font-medium text-xs">
                  Chọn tệp đính kèm
                </Button>
              </Upload>
            </Form.Item>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
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
