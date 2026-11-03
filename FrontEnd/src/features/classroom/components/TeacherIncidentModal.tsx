import { useState } from "react";
import {
  Modal,
  Form,
  Select,
  Input,
  DatePicker,
  Upload,
  Button,
  Alert,
  Typography,
  message,
} from "antd";
import {
  WarningOutlined,
  UploadOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionService, sessionKeys } from "../../../services/session.service";
import { teacherVerificationService } from "../../../services/teacherVerification.service";
import type { IncidentType, IncidentRequestedAction } from "../../../types/session";

const { Text } = Typography;
const { TextArea } = Input;

interface TeacherIncidentModalProps {
  open: boolean;
  sessionId: string;
  sessionTitle?: string;
  onClose: () => void;
}

const INCIDENT_TYPE_OPTIONS: Array<{ value: IncidentType; label: string }> = [
  { value: "DEVICE_FAILURE", label: "Sự cố thiết bị (Máy tính / Camera / Micro)" },
  { value: "INTERNET_FAILURE", label: "Mất kết nối Internet / Đứt cáp" },
  { value: "POWER_OUTAGE", label: "Mất điện đột xuất" },
  { value: "HEALTH_ISSUE", label: "Vấn đề sức khỏe / Đau ốm đột xuất" },
  { value: "PERSONAL_EMERGENCY", label: "Sự cố cá nhân khẩn cấp" },
  { value: "PLATFORM_FAILURE", label: "Lỗi kỹ thuật hệ thống / Phòng LiveKit" },
  { value: "OTHER", label: "Lý do bất khả kháng khác" },
];

const ACTION_OPTIONS: Array<{ value: IncidentRequestedAction; label: string }> = [
  { value: "EXCUSE_LATE", label: "Xin miễn trừ cảnh báo vào lớp muộn" },
  { value: "EXCUSE_INTERRUPTION", label: "Xin miễn trừ gián đoạn / rời lớp giữa chừng" },
  { value: "RESCHEDULE_SESSION", label: "Đề xuất xếp lịch dạy bù (Makeup Session)" },
  { value: "CANCEL_SESSION", label: "Xin hủy buổi học do sự cố bất khả kháng" },
];

export default function TeacherIncidentModal({
  open,
  sessionId,
  sessionTitle,
  onClose,
}: TeacherIncidentModalProps) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [uploadedEvidence, setUploadedEvidence] = useState<
    Array<{ storageKey: string; originalName: string; mimeType: string }>
  >([]);
  const [isUploading, setIsUploading] = useState(false);

  const requestedAction = Form.useWatch("requestedAction", form);

  const submitMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload: any = {
        incidentType: values.incidentType,
        description: values.description,
        requestedAction: values.requestedAction,
        evidenceFiles: uploadedEvidence,
      };

      if (
        values.requestedAction === "RESCHEDULE_SESSION" &&
        values.proposedRange &&
        values.proposedRange.length === 2
      ) {
        payload.proposedSchedule = {
          startDatetime: values.proposedRange[0].toDate().toISOString(),
          endDatetime: values.proposedRange[1].toDate().toISOString(),
          title: values.proposedTitle || `${sessionTitle || "Buổi học"} (Học bù)`,
        };
      }

      return sessionService.submitIncidentReport(sessionId, payload);
    },
    onSuccess: () => {
      message.success("Đã gửi báo cáo sự cố và đề xuất xử lý tới Ban Quản Trị!");
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      form.resetFields();
      setUploadedEvidence([]);
      onClose();
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể gửi báo cáo sự cố.");
    },
  });

  const handleUploadEvidence = async (file: File) => {
    setIsUploading(true);
    try {
      const uploaded = await teacherVerificationService.uploadPrivateFile("INCIDENT_EVIDENCE", file);
      setUploadedEvidence((prev) => [
        ...prev,
        {
          storageKey: uploaded.storageKey,
          originalName: uploaded.originalName || file.name,
          mimeType: uploaded.mimeType || file.type,
        },
      ]);
      message.success(`Đã tải lên minh chứng: ${file.name}`);
    } catch (err: any) {
      message.error(err?.message || "Tải lên minh chứng thất bại.");
    } finally {
      setIsUploading(false);
    }
    return false;
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitMutation.isPending || isUploading}
      okText="Gửi báo cáo sự cố"
      cancelText="Đóng"
      width={620}
      centered
      title={
        <div className="flex items-center gap-2 text-amber-600 font-bold">
          <WarningOutlined />
          <span>Báo cáo sự cố giảng dạy & Đề xuất học bù</span>
        </div>
      }
    >
      <div className="py-2 space-y-4">
        <Alert
          type="info"
          showIcon
          message="Quy định báo cáo sự cố (TIN-05E)"
          description="Giảng viên có thể gửi báo cáo sự cố trước, trong buổi học hoặc tối đa 24 giờ sau khi buổi học kết thúc kèm minh chứng bảo mật (ảnh chụp, giấy xác nhận y tế, PDF). Mọi cảnh báo vi phạm sẽ tạm hoãn chờ Admin xét duyệt."
          className="rounded-xl"
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            incidentType: "INTERNET_FAILURE",
            requestedAction: "EXCUSE_LATE",
          }}
          onFinish={(values) => submitMutation.mutate(values)}
        >
          <Form.Item
            name="incidentType"
            label={<span className="font-semibold">Loại sự cố</span>}
            rules={[{ required: true, message: "Vui lòng chọn loại sự cố" }]}
          >
            <Select options={INCIDENT_TYPE_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="requestedAction"
            label={<span className="font-semibold">Hướng xử lý đề xuất</span>}
            rules={[{ required: true, message: "Vui lòng chọn hướng xử lý" }]}
          >
            <Select options={ACTION_OPTIONS} />
          </Form.Item>

          {requestedAction === "RESCHEDULE_SESSION" && (
            <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl mb-4">
              <div className="flex items-center gap-1.5 text-indigo-700 font-semibold text-xs mb-2">
                <CalendarOutlined />
                <span>Thông tin lịch học bù đề xuất (Hệ thống sẽ tự kiểm tra trùng lịch)</span>
              </div>
              <Form.Item
                name="proposedRange"
                label="Thời gian bắt đầu — kết thúc buổi học bù"
                rules={[{ required: true, message: "Vui lòng chọn khung giờ học bù" }]}
                className="mb-2"
              >
                <DatePicker.RangePicker
                  showTime={{ format: "HH:mm" }}
                  format="DD/MM/YYYY HH:mm"
                  className="w-full"
                />
              </Form.Item>
              <Form.Item name="proposedTitle" label="Tiêu đề buổi học bù (tuỳ chọn)" className="mb-0">
                <Input placeholder={`${sessionTitle || "Buổi học"} (Buổi học bù)`} />
              </Form.Item>
            </div>
          )}

          <Form.Item
            name="description"
            label={<span className="font-semibold">Mô tả chi tiết sự cố</span>}
            rules={[
              { required: true, message: "Vui lòng mô tả chi tiết sự cố" },
              { min: 10, message: "Mô tả cần ít nhất 10 ký tự" },
            ]}
          >
            <TextArea
              rows={3}
              placeholder="Mô tả rõ thời điểm xảy ra sự cố, nguyên nhân và tình trạng hiện tại..."
              maxLength={1500}
              showCount
            />
          </Form.Item>

          <Form.Item label={<span className="font-semibold">Tài liệu / Ảnh minh chứng bảo mật (Private Storage)</span>}>
            <Upload
              beforeUpload={handleUploadEvidence}
              showUploadList={false}
              accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4"
            >
              <Button icon={<UploadOutlined />} loading={isUploading} className="rounded-xl">
                Tải lên minh chứng (Ảnh / PDF / Video)
              </Button>
            </Upload>
            {uploadedEvidence.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadedEvidence.map((item, idx) => (
                  <div
                    key={item.storageKey}
                    className="flex items-center justify-between text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200"
                  >
                    <Text className="truncate max-w-xs">{item.originalName}</Text>
                    <Button
                      type="link"
                      danger
                      size="small"
                      onClick={() =>
                        setUploadedEvidence((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Xóa
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
}

