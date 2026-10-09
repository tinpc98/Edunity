import { useState } from "react";
import {
  Typography,
  Breadcrumb,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Row,
  Col,
  message,
} from "antd";
import {
  SaveOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignService, campaignKeys } from "../../../services/campaign.service";
import type { CreateCampaignPayload } from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Watch values for interactive calculations
  const targetBudget = Form.useWatch("targetBudget", form) || 0;
  const awardPerStudent = Form.useWatch("awardAmountPerStudent", form) || 0;
  const expectedSlots =
    awardPerStudent > 0 ? Math.floor(targetBudget / awardPerStudent) : 0;

  const createMutation = useMutation({
    mutationFn: (payload: CreateCampaignPayload) => campaignService.createCampaign(payload),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => campaignService.publishCampaign(id),
  });

  const buildPayload = (values: any): CreateCampaignPayload => {
    const fundingRange = values.fundingPeriod || [];
    const appRange = values.appPeriod || [];

    const computedSlots =
      values.expectedSlots ||
      (values.awardAmountPerStudent > 0
        ? Math.floor(values.targetBudget / values.awardAmountPerStudent)
        : 1);

    return {
      title: values.title.trim(),
      description: values.description?.trim(),
      eligibilityCriteria: values.eligibilityCriteria?.trim(),
      targetBudget: Number(values.targetBudget),
      expectedSlots: computedSlots,
      awardAmountPerStudent: Number(values.awardAmountPerStudent),
      fundingStart: fundingRange[0] ? fundingRange[0].toISOString() : null,
      fundingEnd: fundingRange[1] ? fundingRange[1].toISOString() : null,
      applicationStart: appRange[0] ? appRange[0].toISOString() : null,
      applicationEnd: appRange[1] ? appRange[1].toISOString() : null,
    };
  };

  const handleSaveDraft = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);
      const payload = buildPayload(values);
      await createMutation.mutateAsync(payload);
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      message.success("Đã tạo và lưu nháp chiến dịch thành công.");
      navigate(ROUTES.ADMIN.CAMPAIGNS);
    } catch (err: any) {
      if (err.errorFields) {
        message.error("Vui lòng điền đầy đủ các thông tin bắt buộc.");
      } else {
        message.error(err.message || "Không thể tạo chiến dịch.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async () => {
    try {
      const values = await form.validateFields();
      if (!values.fundingPeriod || !values.fundingPeriod[0] || !values.fundingPeriod[1]) {
        message.error("Thời gian huy động quỹ là bắt buộc để phát hành chiến dịch.");
        return;
      }
      if (!values.appPeriod || !values.appPeriod[0] || !values.appPeriod[1]) {
        message.error("Thời gian nhận hồ sơ là bắt buộc để phát hành chiến dịch.");
        return;
      }

      setIsSubmitting(true);
      const payload = buildPayload(values);
      const created = await createMutation.mutateAsync(payload);
      await publishMutation.mutateAsync(created.id);
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      message.success("Đã tạo và phát hành chiến dịch thành công (OPEN_FOR_FUNDING).");
      navigate(ROUTES.ADMIN.CAMPAIGNS);
    } catch (err: any) {
      if (err.errorFields) {
        message.error("Vui lòng kiểm tra lại thông tin bắt buộc.");
      } else {
        message.error(err.message || "Không thể phát hành chiến dịch.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1000px] mx-auto pb-10">
      <Breadcrumb
        className="mb-2 text-sm font-medium"
        items={[
          { title: <Link to={ROUTES.ADMIN.HOME}>Tổng quan</Link> },
          { title: <Link to={ROUTES.ADMIN.CAMPAIGNS}>Chiến dịch</Link> },
          { title: "Tạo chiến dịch mới" },
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <Title level={2} className="!m-0 text-slate-900 font-bold">
            Tạo chiến dịch học bổng mới
          </Title>
          <Text className="text-slate-500 text-sm">
            Thiết lập chương trình tài trợ cộng đồng, ngân sách mục tiêu và định mức học bổng.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <Button
            icon={<SaveOutlined />}
            loading={isSubmitting}
            className="rounded-xl h-11 font-semibold"
            onClick={handleSaveDraft}
          >
            Lưu nháp
          </Button>
          <Button
            type="primary"
            icon={<RocketOutlined />}
            loading={isSubmitting}
            className="rounded-xl h-11 bg-indigo-600 hover:bg-indigo-500 font-semibold shadow-xs"
            onClick={handlePublish}
          >
            Phát hành ngay
          </Button>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          targetBudget: 300_000_000,
          awardAmountPerStudent: 3_000_000,
        }}
      >
        {/* SECTION A */}
        <Card className="rounded-2xl shadow-xs border-slate-200/80 mb-6" title="Thông tin chung">
          <Form.Item
            label="Tên chiến dịch"
            name="title"
            rules={[{ required: true, message: "Vui lòng nhập tên chiến dịch" }]}
          >
            <Input
              size="large"
              className="rounded-xl"
              placeholder="VD: Tiếp sức đến trường 2026 – Nuôi dưỡng tài năng THPT"
            />
          </Form.Item>

          <Form.Item
            label="Mô tả ý nghĩa chiến dịch"
            name="description"
            rules={[{ required: true, message: "Vui lòng nhập mô tả chiến dịch" }]}
          >
            <Input.TextArea
              rows={4}
              className="rounded-xl"
              placeholder="Mô tả hoàn cảnh, ý nghĩa nhân văn và mục tiêu phát triển của chương trình tài trợ..."
            />
          </Form.Item>

          <Form.Item label="Tiêu chí xét duyệt học bổng (Điều kiện cần)" name="eligibilityCriteria">
            <Input.TextArea
              rows={3}
              className="rounded-xl"
              placeholder="VD: Học sinh có hoàn cảnh khó khăn đạt học lực Khá/Giỏi, tinh thần vượt khó..."
            />
          </Form.Item>
        </Card>

        {/* SECTION B */}
        <Card className="rounded-2xl shadow-xs border-slate-200/80 mb-6" title="Ngân sách & Định mức học bổng">
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Mục tiêu huy động quỹ (VNĐ)"
                name="targetBudget"
                rules={[{ required: true, message: "Vui lòng nhập ngân sách mục tiêu" }]}
              >
                <InputNumber
                  size="large"
                  className="w-full rounded-xl"
                  min={1_000_000}
                  step={10_000_000}
                  formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(val) => (val ? Number(val.replace(/\$\s?|(,*)/g, "")) : 0) as any}
                />
              </Form.Item>

              <Form.Item
                label="Mức học bổng cố định / Học viên (VNĐ)"
                name="awardAmountPerStudent"
                rules={[{ required: true, message: "Vui lòng nhập mức học bổng" }]}
              >
                <InputNumber
                  size="large"
                  className="w-full rounded-xl"
                  min={100_000}
                  step={500_000}
                  formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(val) => (val ? Number(val.replace(/\$\s?|(,*)/g, "")) : 0) as any}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 h-full flex flex-col justify-center">
                <Text className="text-indigo-600 font-bold uppercase text-xs tracking-wider mb-2">
                  Tạm tính phân bổ học bổng
                </Text>
                <div className="flex justify-between items-end mb-3 border-b border-indigo-100 pb-3 text-sm">
                  <span className="text-slate-600">Tổng ngân sách:</span>
                  <span className="font-bold text-slate-900">{formatVND(targetBudget)}</span>
                </div>
                <div className="flex justify-between items-end mb-3 border-b border-indigo-100 pb-3 text-sm">
                  <span className="text-slate-600">Định mức / học sinh:</span>
                  <span className="font-bold text-slate-900">÷ {formatVND(awardPerStudent)}</span>
                </div>
                <div className="flex justify-between items-end pt-1">
                  <span className="text-indigo-900 font-bold text-sm">Số suất học bổng dự kiến:</span>
                  <span className="font-black text-indigo-700 text-3xl">
                    {expectedSlots} <span className="text-base font-normal">suất</span>
                  </span>
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        {/* SECTION C */}
        <Card className="rounded-2xl shadow-xs border-slate-200/80 mb-6" title="Khung thời gian hoạt động">
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Thời gian huy động quỹ (Sponsor)"
                name="fundingPeriod"
                rules={[{ required: true, message: "Vui lòng chọn thời gian nhận tài trợ" }]}
              >
                <RangePicker size="large" className="w-full rounded-xl" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Thời gian nhận hồ sơ (Student)"
                name="appPeriod"
                rules={[{ required: true, message: "Vui lòng chọn thời gian nhận hồ sơ" }]}
              >
                <RangePicker size="large" className="w-full rounded-xl" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  );
}
