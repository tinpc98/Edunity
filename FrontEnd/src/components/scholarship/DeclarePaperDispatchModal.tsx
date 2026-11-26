import React, { useState } from "react";
import { Modal, Form, Input, Select, DatePicker, Upload, Button, message, Alert } from "antd";
import { UploadOutlined, SendOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";
import { scholarshipApplicationService } from "../../services/scholarshipApplication.service";
import { validateScholarshipDocument, SCHOLARSHIP_DOCUMENT_ACCEPT } from "../../utils/fileValidation";

const { TextArea } = Input;

export interface DeclarePaperDispatchModalProps {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  applicationCode?: string | null;
  initialValues?: {
    carrier?: string | null;
    trackingNumber?: string | null;
    sentAt?: string | null;
  };
  onSuccess?: () => void;
}

const CARRIER_OPTIONS = [
  { value: "VNPost (Bưu điện Việt Nam)", label: "VNPost (Bưu điện Việt Nam)" },
  { value: "Viettel Post", label: "Viettel Post" },
  { value: "Giao Hàng Tiết Kiệm (GHTK)", label: "Giao Hàng Tiết Kiệm (GHTK)" },
  { value: "Giao Hàng Nhanh (GHN)", label: "Giao Hàng Nhanh (GHN)" },
  { value: "Nộp trực tiếp tại văn phòng", label: "Nộp trực tiếp tại văn phòng Edunity" },
  { value: "Đơn vị vận chuyển khác", label: "Đơn vị chuyển phát khác..." },
];

export const DeclarePaperDispatchModal: React.FC<DeclarePaperDispatchModalProps> = ({
  open,
  onClose,
  applicationId,
  applicationCode,
  initialValues,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<string>(
    initialValues?.carrier || "VNPost (Bưu điện Việt Nam)"
  );

  const isDirectDropOff = selectedCarrier.includes("Nộp trực tiếp");

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);

      const sentAtDate = values.sentAt ? values.sentAt.toDate() : new Date();
      // Ensure sentAt is not in the future
      const now = new Date();
      const validSentAt = sentAtDate > now ? now : sentAtDate;

      let proofStorageKey: string | undefined = undefined;
      const fileToUpload = fileList[0]?.originFileObj;
      if (fileToUpload) {
        const uploadRes = await scholarshipApplicationService.uploadDocument(fileToUpload);
        if (uploadRes?.storageKey) {
          proofStorageKey = uploadRes.storageKey;
        }
      }

      await scholarshipApplicationService.declarePaperDispatch(applicationId, {
        sentAt: validSentAt.toISOString(),
        carrier: values.carrier,
        trackingNumber: isDirectDropOff ? (values.trackingNumber?.trim() || "TRUC_TIEP") : values.trackingNumber?.trim(),
        proofStorageKey,
      });

      message.success("Xác nhận đã gửi hồ sơ giấy thành công! Ban quản trị sẽ đối chiếu khi nhận được bưu phẩm.");
      form.resetFields();
      setFileList([]);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || "Không thể xác nhận gửi hồ sơ giấy. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <span className="font-bold text-slate-800 flex items-center gap-2">
          <SendOutlined className="text-teal-600" />
          Khai báo thông tin gửi hồ sơ giấy (Bản cứng)
        </span>
      }
      onOk={handleSubmit}
      confirmLoading={isSubmitting}
      okText="Xác nhận đã gửi"
      cancelText="Hủy"
      okButtonProps={{ className: "bg-teal-600 hover:bg-teal-700 font-bold" }}
      destroyOnClose
      width={560}
    >
      <div className="py-2 space-y-4">
        {applicationCode && (
          <Alert
            type="info"
            showIcon
            message={
              <span>
                Mã hồ sơ đối chiếu: <strong className="font-mono text-teal-800">{applicationCode}</strong>
              </span>
            }
            description="Hãy chắc chắn bạn đã ghi rõ mã hồ sơ này trên bì thư trước khi gửi."
            className="text-xs rounded-xl"
          />
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            carrier: initialValues?.carrier || "VNPost (Bưu điện Việt Nam)",
            trackingNumber: initialValues?.trackingNumber || "",
            sentAt: initialValues?.sentAt ? dayjs(initialValues.sentAt) : dayjs(),
          }}
        >
          <Form.Item
            name="carrier"
            label={<span className="text-xs font-bold text-slate-700">Hình thức / Đơn vị vận chuyển <span className="text-rose-500">*</span></span>}
            rules={[{ required: true, message: "Vui lòng chọn hình thức gửi hồ sơ" }]}
          >
            <Select
              options={CARRIER_OPTIONS}
              className="rounded-xl"
              onChange={(val) => setSelectedCarrier(val)}
            />
          </Form.Item>

          <Form.Item
            name="trackingNumber"
            label={
              <span className="text-xs font-bold text-slate-700">
                Mã vận đơn bưu cục {isDirectDropOff ? "(Tùy chọn khi nộp trực tiếp)" : <span className="text-rose-500">*</span>}
              </span>
            }
            rules={[
              {
                required: !isDirectDropOff,
                message: "Vui lòng nhập mã vận đơn để hệ thống theo dõi hành trình",
              },
            ]}
            extra="Mã in trên phiếu gửi / hóa đơn của bưu cục (ví dụ: VN123456789VN, VIETTEL1234...)"
          >
            <Input
              placeholder={isDirectDropOff ? "Không bắt buộc nếu nộp trực tiếp" : "Nhập mã vận đơn bưu điện..."}
              className="rounded-xl"
              maxLength={80}
            />
          </Form.Item>

          <Form.Item
            name="sentAt"
            label={<span className="text-xs font-bold text-slate-700">Ngày gửi hồ sơ <span className="text-rose-500">*</span></span>}
            rules={[{ required: true, message: "Vui lòng chọn ngày gửi" }]}
          >
            <DatePicker
              className="w-full rounded-xl"
              format="DD/MM/YYYY"
              disabledDate={(current) => current && current > dayjs().endOf("day")}
            />
          </Form.Item>

          <Form.Item
            label={<span className="text-xs font-bold text-slate-700">Ảnh chụp biên lai / phiếu gửi bưu điện (Khuyến khích)</span>}
            extra="Định dạng PDF, JPG, PNG tối đa 10MB. Giúp Admin xác minh nhanh hơn khi bưu phẩm chưa tới."
          >
            <Upload
              listType="picture"
              fileList={fileList}
              onChange={({ fileList: next }) => setFileList(next.slice(-1))}
              beforeUpload={(file) => {
                const error = validateScholarshipDocument(file);
                if (error) {
                  message.error(error);
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
              accept={SCHOLARSHIP_DOCUMENT_ACCEPT}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />} className="rounded-xl text-xs">
                {fileList.length > 0 ? "Thay đổi ảnh biên lai" : "Tải ảnh biên nhận bưu điện"}
              </Button>
            </Upload>
          </Form.Item>

          <Form.Item
            name="notes"
            label={<span className="text-xs font-bold text-slate-700">Ghi chú bổ sung (tùy chọn)</span>}
          >
            <TextArea
              rows={2}
              placeholder="Ví dụ: Dự kiến giao ngày mai, bưu phẩm gửi kèm 4 tài liệu công chứng..."
              className="rounded-xl text-xs"
              maxLength={300}
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};

export default DeclarePaperDispatchModal;
