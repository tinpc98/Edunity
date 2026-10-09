import React from "react";
import { Modal, Form, Select, Input, Button, App as AntdApp } from "antd";
import { AlertOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reportService, reportKeys } from "../../../services/report.service";
import { REPORT_TYPES, type ReportType } from "../../../types/communication";

const { TextArea } = Input;

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  TEACHER_ABSENT: "Giáo viên vắng mặt",
  TEACHING_QUALITY: "Chất lượng giảng dạy không đúng cam kết",
  PAYMENT_DISPUTE: "Khiếu nại về học phí / thanh toán",
  INAPPROPRIATE_BEHAVIOR: "Hành vi không phù hợp / vi phạm quy tắc",
  FRAUD: "Dấu hiệu gian lận / lừa đảo",
  OTHER: "Vấn đề khác",
};

interface CreateReportModalProps {
  open: boolean;
  onClose: () => void;
  defaultReportedUserId?: string;
  defaultClassId?: string;
  targetName?: string;
  onSuccess?: () => void;
}

export const CreateReportModal: React.FC<CreateReportModalProps> = ({
  open,
  onClose,
  defaultReportedUserId,
  defaultClassId,
  targetName,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (values: {
      type: ReportType;
      description: string;
      reportedUserId?: string;
      classId?: string;
    }) =>
      reportService.createReport({
        type: values.type,
        description: values.description.trim(),
        reportedUserId: values.reportedUserId || defaultReportedUserId || undefined,
        classId: values.classId || defaultClassId || undefined,
      }),
    onSuccess: () => {
      message.success("Khiếu nại của bạn đã được gửi tới Ban Quản Trị để xem xét.");
      queryClient.invalidateQueries({ queryKey: reportKeys.myReports() });
      form.resetFields();
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể gửi khiếu nại.");
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!defaultReportedUserId && !defaultClassId && !values.reportedUserId && !values.classId) {
        message.warning("Vui lòng cung cấp mã người dùng hoặc mã lớp học bị khiếu nại.");
        return;
      }
      createMutation.mutate(values);
    } catch {
      // Form validation error
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      title={
        <div className="flex items-center gap-2 text-rose-600 font-bold">
          <AlertOutlined />
          <span>Gửi khiếu nại / Báo cáo sự cố</span>
        </div>
      }
      footer={[
        <Button
          key="cancel"
          onClick={() => {
            form.resetFields();
            onClose();
          }}
          disabled={createMutation.isPending}
        >
          Hủy
        </Button>,
        <Button
          key="submit"
          type="primary"
          danger
          onClick={handleSubmit}
          loading={createMutation.isPending}
        >
          Gửi khiếu nại
        </Button>,
      ]}
      centered
      destroyOnClose
    >
      <div className="py-2">
        {targetName && (
          <p className="text-sm text-slate-600 mb-4 bg-rose-50 p-3 rounded-xl border border-rose-100">
            Đối tượng khiếu nại: <span className="font-semibold text-rose-800">{targetName}</span>
          </p>
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            type: "OTHER",
            reportedUserId: defaultReportedUserId,
            classId: defaultClassId,
          }}
        >
          <Form.Item
            name="type"
            label={<span className="font-semibold text-sm">Loại sự cố / khiếu nại</span>}
            rules={[{ required: true, message: "Vui lòng chọn loại khiếu nại" }]}
          >
            <Select
              options={REPORT_TYPES.map((t) => ({
                value: t,
                label: REPORT_TYPE_LABELS[t] || t,
              }))}
              className="h-10"
            />
          </Form.Item>

          {!defaultReportedUserId && !defaultClassId && (
            <>
              <Form.Item
                name="reportedUserId"
                label={<span className="font-semibold text-sm">ID Người dùng bị khiếu nại (tùy chọn)</span>}
              >
                <Input placeholder="Nhập ID người dùng nếu khiếu nại cá nhân..." />
              </Form.Item>

              <Form.Item
                name="classId"
                label={<span className="font-semibold text-sm">ID Lớp học (tùy chọn)</span>}
              >
                <Input placeholder="Nhập ID lớp học nếu khiếu nại lớp học..." />
              </Form.Item>
            </>
          )}

          <Form.Item
            name="description"
            label={<span className="font-semibold text-sm">Mô tả chi tiết nội dung khiếu nại</span>}
            rules={[
              { required: true, message: "Vui lòng nhập nội dung mô tả chi tiết" },
              { min: 10, message: "Mô tả phải có ít nhất 10 ký tự" },
              { max: 5000, message: "Mô tả tối đa 5000 ký tự" },
            ]}
          >
            <TextArea
              rows={5}
              placeholder="Vui lòng cung cấp chi tiết thời gian, tình huống diễn ra và lý do khiếu nại để Ban Quản Trị xác minh..."
              showCount
              maxLength={5000}
              className="rounded-xl border-slate-200"
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};
