import React, { useState } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Checkbox,
  Upload,
  Button,
  message,
  Alert,
  Divider,
} from "antd";
import {
  UploadOutlined,
  InboxOutlined,
  CheckSquareOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";
import { scholarshipApplicationService } from "../../../../services/scholarshipApplication.service";
import { useAuthStore } from "../../../../stores/auth.store";
import {
  validateScholarshipDocument,
  SCHOLARSHIP_DOCUMENT_ACCEPT,
} from "../../../../utils/fileValidation";
import type {
  ScholarshipApplication,
  ScholarshipChecklistItem,
} from "../../../../types/scholarship";

const { TextArea } = Input;

export interface IntakePaperDossierModalProps {
  open: boolean;
  onClose: () => void;
  application: ScholarshipApplication;
  onSuccess?: () => void;
}

const DEFAULT_CHECKLIST_ITEMS: { code: string; title: string }[] = [
  {
    code: "CCCD_STUDENT",
    title: "Bản sao CCCD / Định danh học sinh (công chứng)",
  },
  {
    code: "CCCD_GUARDIAN",
    title: "Bản sao CCCD / Định danh người giám hộ (công chứng)",
  },
  {
    code: "TRANSCRIPT",
    title: "Bản sao Học bạ / Bảng điểm học tập (có dấu đỏ)",
  },
  {
    code: "POVERTY_CERTIFICATE",
    title: "Giấy chứng nhận hộ nghèo / cận nghèo (nếu có)",
  },
  {
    code: "HARDSHIP_CERTIFICATE",
    title: "Giấy xác nhận hoàn cảnh khó khăn / chính sách (nếu có)",
  },
  { code: "ORPHAN_CERTIFICATE", title: "Giấy chứng nhận mồ côi (nếu có)" },
  {
    code: "DISABILITY_CERTIFICATE",
    title: "Giấy xác nhận khuyết tật / bệnh án (nếu có)",
  },
  {
    code: "ACADEMIC_ACHIEVEMENT",
    title: "Giấy khen / Chứng nhận giải thưởng (nếu có)",
  },
];

export const IntakePaperDossierModal: React.FC<
  IntakePaperDossierModalProps
> = ({ open, onClose, application, onSuccess }) => {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  const declaredDispatch = application.paperDispatch;
  const campaignChecklist = application.campaign?.documentChecklist || [];

  const availableItems =
    campaignChecklist.length > 0
      ? campaignChecklist.map((c: ScholarshipChecklistItem) => ({
          code: c.code,
          title: c.title,
        }))
      : DEFAULT_CHECKLIST_ITEMS;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (fileList.length === 0) {
        message.error(
          "Bắt buộc tải lên ít nhất 1 ảnh minh chứng tiếp nhận hồ sơ giấy (ảnh kiện hàng hoặc biên bản giao nhận).",
        );
        return;
      }

      setIsSubmitting(true);

      const proofFile = fileList[0]?.originFileObj;
      let proofStorageKey: string | null = null;
      if (proofFile) {
        const uploadRes =
          await scholarshipApplicationService.uploadDocument(proofFile);
        proofStorageKey = uploadRes.storageKey;
      }

      const receivedAtDate = values.receivedAt
        ? values.receivedAt.toDate()
        : new Date();
      const deliveryMethod = values.deliveryMethod || "POSTAL_MAIL";
      const isDirect = deliveryMethod === "IN_PERSON_DROP_OFF";

      const selectedCodes: string[] = values.receivedItemCodes || [];
      const reconciledItems = selectedCodes.map((code) => {
        const itemDef = availableItems.find((i) => i.code === code);
        return {
          checklistItemCode: code,
          itemStatus: "MATCHED" as const,
          documentTitle: itemDef?.title || code,
          isOriginal: code === "TRANSCRIPT",
          hasOfficialStamp: true,
          pageCount: 1,
        };
      });

      const carrierName = isDirect
        ? "DIRECT_DROP_OFF"
        : values.carrierName?.trim() || declaredDispatch?.carrier || "VNPost";
      const trackingNumber = isDirect
        ? values.trackingNumber?.trim() || "TRUC_TIEP"
        : values.trackingNumber?.trim() ||
          declaredDispatch?.trackingNumber ||
          "BUU_DIEN";

      await scholarshipApplicationService.adminCreatePaperReceipt({
        applicationId: application.id,
        applicationCode: application.applicationCode || undefined,
        campaignId: application.campaignId,
        studentId: application.studentId,
        receivedAt: receivedAtDate.toISOString(),
        receivingLocation:
          values.receivingLocation || "Central Admission Office",
        intakeNote: values.intakeNote?.trim() || undefined,
        proofStorageKey,
        proofPhotos: proofStorageKey ? [proofStorageKey] : [],
        reconciledItems,
        status: reconciledItems.length > 0 ? "RECONCILED" : "RECEIVED",
        postalInfo: {
          deliveryMethod,
          carrierName,
          trackingNumber,
          senderName:
            values.senderName?.trim() ||
            application.applicantInfo?.fullName ||
            application.studentName ||
            "Học sinh",
          senderPhone:
            values.senderPhone?.trim() ||
            application.applicantInfo?.phone ||
            null,
          envelopeSealed: values.envelopeSealed ?? true,
          packageCondition: values.packageCondition || "INTACT",
        },
      });

      message.success("Xác nhận tiếp nhận hồ sơ giấy thành công!");
      form.resetFields();
      setFileList([]);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || "Lỗi tiếp nhận hồ sơ giấy.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <InboxOutlined className="text-teal-600 text-lg" />
          <span>Xác nhận tiếp nhận hồ sơ giấy (Bản cứng)</span>
        </div>
      }
      onOk={handleSubmit}
      confirmLoading={isSubmitting}
      okText="Xác nhận tiếp nhận"
      cancelText="Hủy"
      okButtonProps={{ className: "bg-teal-600 hover:bg-teal-700 font-bold" }}
      destroyOnClose
      width={680}
    >
      <div className="py-2 space-y-4">
        <Alert
          type="info"
          showIcon
          message={
            <span>
              Hồ sơ:{" "}
              <strong>
                {application.applicantInfo?.fullName || application.studentName}
              </strong>{" "}
              — Mã:{" "}
              <span className="font-mono font-bold text-teal-800">
                {application.applicationCode}
              </span>
            </span>
          }
          description={
            declaredDispatch?.declaredSent
              ? `Học sinh đã khai báo gửi qua ${declaredDispatch.carrier || "Bưu điện"} · Mã vận đơn: ${declaredDispatch.trackingNumber || "—"}`
              : "Học sinh chưa gửi thông tin mã vận đơn bưu cục online."
          }
          className="rounded-xl text-xs"
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            receivedAt: dayjs(),
            receivedBy:
              currentUser?.fullName || currentUser?.email || "Admin tiếp nhận",
            deliveryMethod: declaredDispatch?.declaredSent
              ? "POSTAL_MAIL"
              : "IN_PERSON_DROP_OFF",
            carrierName: declaredDispatch?.carrier || "VNPost",
            trackingNumber: declaredDispatch?.trackingNumber || "",
            senderName:
              application.applicantInfo?.fullName ||
              application.studentName ||
              "",
            senderPhone: application.applicantInfo?.phone || "",
            packageCondition: "INTACT",
            envelopeSealed: true,
            receivingLocation: "Central Admission Office",
            receivedItemCodes: ["CCCD_STUDENT", "CCCD_GUARDIAN", "TRANSCRIPT"],
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Form.Item
              name="receivedAt"
              label={
                <span className="text-xs font-bold text-slate-700">
                  Ngày giờ tiếp nhận <span className="text-rose-500">*</span>
                </span>
              }
              rules={[{ required: true, message: "Chọn ngày giờ nhận" }]}
            >
              <DatePicker
                showTime
                className="w-full rounded-xl"
                format="DD/MM/YYYY HH:mm"
              />
            </Form.Item>

            <Form.Item
              name="receivedBy"
              label={
                <span className="text-xs font-bold text-slate-700">
                  Người tiếp nhận
                </span>
              }
            >
              <Input
                readOnly
                disabled
                className="rounded-xl bg-slate-50 font-medium"
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Form.Item
              name="deliveryMethod"
              label={
                <span className="text-xs font-bold text-slate-700">
                  Hình thức nhận <span className="text-rose-500">*</span>
                </span>
              }
              rules={[{ required: true }]}
            >
              <Select
                className="rounded-xl"
                options={[
                  {
                    value: "POSTAL_MAIL",
                    label: "Chuyển phát bưu điện / Chuyển phát nhanh",
                  },
                  {
                    value: "IN_PERSON_DROP_OFF",
                    label: "Nộp trực tiếp tại văn phòng",
                  },
                  { value: "COURIER", label: "Giao vận hỏa tốc / Shipper" },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="trackingNumber"
              label={
                <span className="text-xs font-bold text-slate-700">
                  Mã biên nhận / Mã vận đơn
                </span>
              }
              extra="Điền mã vận đơn bưu cục hoặc mã biên nhận nội bộ"
            >
              <Input
                placeholder="Ví dụ: VN123456789VN, BNN-2026-001..."
                className="rounded-xl font-mono"
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Form.Item
              name="senderName"
              label={
                <span className="text-xs font-bold text-slate-700">
                  Người gửi ghi trên bưu phẩm{" "}
                  <span className="text-rose-500">*</span>
                </span>
              }
              rules={[{ required: true, message: "Nhập tên người gửi" }]}
            >
              <Input placeholder="Họ tên người gửi..." className="rounded-xl" />
            </Form.Item>

            <Form.Item
              name="packageCondition"
              label={
                <span className="text-xs font-bold text-slate-700">
                  Tình trạng bưu phẩm
                </span>
              }
            >
              <Select
                className="rounded-xl"
                options={[
                  { value: "INTACT", label: "Nguyên vẹn, niêm phong tốt" },
                  { value: "TORN", label: "Có dấu hiệu rách / hở bì thư" },
                  { value: "DAMAGED", label: "Bị móp méo / ẩm ướt" },
                  { value: "PARTIAL", label: "Chỉ có một phần tài liệu" },
                ]}
              />
            </Form.Item>
          </div>

          <Divider className="my-2 border-slate-200" />

          {/* Checklist of received documents */}
          <Form.Item
            name="receivedItemCodes"
            label={
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CheckSquareOutlined className="text-teal-600" />
                Checklist các giấy tờ thực tế nhận được trong phong bì:
              </span>
            }
            extra="Tích chọn các giấy tờ có mặt trong phong bì tiếp nhận để đối chiếu khớp."
          >
            <Checkbox.Group className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                {availableItems.map((item) => (
                  <Checkbox
                    key={item.code}
                    value={item.code}
                    className="text-xs"
                  >
                    {item.title}
                  </Checkbox>
                ))}
              </div>
            </Checkbox.Group>
          </Form.Item>

          {/* Mandatory photo upload */}
          <Form.Item
            required
            label={
              <span className="text-xs font-bold text-slate-800">
                Ảnh minh chứng tiếp nhận hồ sơ giấy{" "}
                <span className="text-rose-500">* (Bắt buộc)</span>
              </span>
            }
            extra="Chụp ảnh gói bưu phẩm có rõ mã vận đơn / mã hồ sơ, hoặc ảnh biên bản bàn giao có chữ ký người nộp."
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
              <Button
                icon={<UploadOutlined />}
                className="rounded-xl text-xs font-semibold text-teal-700 border-teal-300"
              >
                {fileList.length > 0
                  ? "Thay đổi ảnh minh chứng"
                  : "Tải ảnh bưu phẩm / biên bản tiếp nhận"}
              </Button>
            </Upload>
            {fileList.length === 0 && (
              <div className="text-[11px] text-rose-500 mt-1">
                ⚠️ Bắt buộc tải lên ít nhất 1 ảnh để làm căn cứ đối soát trước
                khi duyệt cấp học bổng.
              </div>
            )}
          </Form.Item>

          <Form.Item
            name="intakeNote"
            label={
              <span className="text-xs font-bold text-slate-700">
                Ghi chú tiếp nhận (tùy chọn)
              </span>
            }
          >
            <TextArea
              rows={2}
              placeholder="Ví dụ: Bưu phẩm nhận từ bưu tá Nguyễn Văn A, hồ sơ đầy đủ 3 bản công chứng..."
              className="rounded-xl text-xs"
              maxLength={500}
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};

export default IntakePaperDossierModal;
