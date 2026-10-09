import React from "react";
import { Modal, Form, Rate, Input, Button, App as AntdApp } from "antd";
import { StarFilled } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reviewService, reviewKeys } from "../../../services/review.service";

const { TextArea } = Input;

interface CreateReviewModalProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  className?: string;
  onSuccess?: () => void;
}

export const CreateReviewModal: React.FC<CreateReviewModalProps> = ({
  open,
  onClose,
  classId,
  className,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (values: { rating: number; comment?: string }) =>
      reviewService.createReview(classId, {
        rating: values.rating,
        comment: values.comment?.trim() || undefined,
      }),
    onSuccess: () => {
      message.success("Cảm ơn bạn đã gửi đánh giá cho lớp học!");
      queryClient.invalidateQueries({ queryKey: reviewKeys.byClass(classId) });
      form.resetFields();
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      if (err.code === "DUPLICATE_REVIEW") {
        message.warning("Bạn đã gửi đánh giá cho lớp học này rồi.");
      } else if (err.code === "REVIEW_NOT_ALLOWED") {
        message.error("Bạn chỉ có thể đánh giá sau khi lớp học bắt đầu hoặc có buổi học hoàn thành.");
      } else {
        message.error(err.message || "Không thể gửi đánh giá.");
      }
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
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
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <StarFilled className="text-amber-500 text-lg" />
          <span>Đánh giá lớp học</span>
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
          onClick={handleSubmit}
          loading={createMutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          Gửi đánh giá
        </Button>,
      ]}
      centered
      destroyOnClose
    >
      <div className="py-2">
        {className && (
          <p className="text-sm text-slate-600 mb-4">
            Đánh giá trải nghiệm học tập của bạn tại lớp{" "}
            <span className="font-semibold text-slate-800">{className}</span>
          </p>
        )}

        <Form form={form} layout="vertical" initialValues={{ rating: 5 }}>
          <Form.Item
            name="rating"
            label={<span className="font-semibold text-sm">Điểm đánh giá (1 - 5 sao)</span>}
            rules={[{ required: true, message: "Vui lòng chọn số sao đánh giá" }]}
          >
            <Rate className="text-amber-400 text-2xl" />
          </Form.Item>

          <Form.Item
            name="comment"
            label={<span className="font-semibold text-sm">Nhận xét chi tiết (tùy chọn)</span>}
          >
            <TextArea
              rows={4}
              placeholder="Chia sẻ cảm nghĩ về chất lượng giảng dạy, phương pháp sư phạm của giáo viên..."
              maxLength={1000}
              showCount
              className="rounded-xl border-slate-200"
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};
