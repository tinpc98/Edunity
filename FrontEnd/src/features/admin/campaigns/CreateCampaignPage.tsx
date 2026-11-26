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
  Switch,
  Row,
  Col,
  Select,
  Tag,
  Alert,
  message,
} from "antd";
import {
  SaveOutlined,
  RocketOutlined,
  PlusOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignService, campaignKeys } from "../../../services/campaign.service";
import type { CreateCampaignPayload, ScholarshipPriorityCriterion, ScholarshipPrioritySourceField } from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text } = Typography;

const PREDEFINED_CRITERIA_TYPES = [
  {
    value: "POOR_HOUSEHOLD",
    label: "Hộ nghèo (có giấy chứng nhận)",
    sourceField: "HARDSHIP_CATEGORY",
    defaultMatchValue: "POOR_HOUSEHOLD",
    exclusiveGroup: "POVERTY_STATUS",
    needsCustomValue: false,
    helperText: "Tự động đối chiếu từ hồ sơ hộ nghèo và giấy chứng nhận",
  },
  {
    value: "NEAR_POOR_HOUSEHOLD",
    label: "Hộ cận nghèo (có giấy chứng nhận)",
    sourceField: "HARDSHIP_CATEGORY",
    defaultMatchValue: "NEAR_POOR_HOUSEHOLD",
    exclusiveGroup: "POVERTY_STATUS",
    needsCustomValue: false,
    helperText: "Tự động đối chiếu từ hồ sơ hộ cận nghèo và giấy chứng nhận",
  },
  {
    value: "ORPHANED",
    label: "Hoàn cảnh mồ côi cha mẹ",
    sourceField: "HARDSHIP_CATEGORY",
    defaultMatchValue: "ORPHANED",
    exclusiveGroup: null,
    needsCustomValue: false,
    helperText: "Tự động đối chiếu diện mồ côi từ hồ sơ",
  },
  {
    value: "DISADVANTAGED",
    label: "Hoàn cảnh đặc biệt khó khăn",
    sourceField: "IS_DISADVANTAGED",
    defaultMatchValue: "true",
    exclusiveGroup: null,
    needsCustomValue: false,
    helperText: "Tự động đối chiếu diện đặc biệt khó khăn từ hồ sơ",
  },
  {
    value: "REMOTE_AREA",
    label: "Khu vực ưu tiên (Vùng sâu, vùng xa, hải đảo)",
    sourceField: "HARDSHIP_CATEGORY",
    defaultMatchValue: "REMOTE_AREA",
    exclusiveGroup: null,
    needsCustomValue: false,
    helperText: "Tự động đối chiếu khu vực vùng sâu, vùng xa từ hồ sơ",
  },
  {
    value: "PROVINCE",
    label: "Tỉnh / Thành phố ưu tiên",
    sourceField: "STUDENT_PROVINCE",
    defaultMatchValue: "",
    exclusiveGroup: "LOCATION_PROVINCE",
    needsCustomValue: true,
    valuePlaceholder: "VD: Hà Giang, Cao Bằng, Điện Biên...",
    helperText: "Nhập tên tỉnh/thành phố cần ưu tiên",
  },
  {
    value: "COMMUNE",
    label: "Xã / Phường ưu tiên",
    sourceField: "STUDENT_COMMUNE",
    defaultMatchValue: "",
    exclusiveGroup: null,
    needsCustomValue: true,
    valuePlaceholder: "VD: Xã Mường Tè, Xã Lũng Cú...",
    helperText: "Nhập tên xã/phường cần ưu tiên",
  },
  {
    value: "GRADE_LEVEL",
    label: "Cấp lớp ưu tiên",
    sourceField: "GRADE_LEVEL",
    defaultMatchValue: "",
    exclusiveGroup: "GRADE_GROUP",
    needsCustomValue: true,
    isGradeSelect: true,
    helperText: "Chọn cấp lớp học sinh cần ưu tiên",
  },
];

const GRADE_OPTIONS = [
  { value: "GRADE_1", label: "Lớp 1" },
  { value: "GRADE_2", label: "Lớp 2" },
  { value: "GRADE_3", label: "Lớp 3" },
  { value: "GRADE_4", label: "Lớp 4" },
  { value: "GRADE_5", label: "Lớp 5" },
  { value: "GRADE_6", label: "Lớp 6" },
  { value: "GRADE_7", label: "Lớp 7" },
  { value: "GRADE_8", label: "Lớp 8" },
  { value: "GRADE_9", label: "Lớp 9" },
  { value: "GRADE_10", label: "Lớp 10" },
  { value: "GRADE_11", label: "Lớp 11" },
  { value: "GRADE_12", label: "Lớp 12" },
  { value: "UNIVERSITY_EXAM_PREP", label: "Luyện thi ĐH" },
  { value: "COLLEGE", label: "Cao đẳng" },
  { value: "UNIVERSITY", label: "Đại học" },
];

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applyPriorityCriteria, setApplyPriorityCriteria] = useState(false);

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
    const computedSlots =
      values.expectedSlots ||
      (values.awardAmountPerStudent > 0
        ? Math.floor(values.targetBudget / values.awardAmountPerStudent)
        : 1);

    const rawPriorityCriteria = values.priorityCriteria;
    const formattedPriorityCriteria: ScholarshipPriorityCriterion[] = applyPriorityCriteria && Array.isArray(rawPriorityCriteria)
      ? rawPriorityCriteria
          .filter((item: any) => item && (item.type || item.sourceField))
          .map((item: any, index: number) => {
            const template = PREDEFINED_CRITERIA_TYPES.find((t) => t.value === item.type);
            if (template) {
              const customVal = typeof item.customValue === "string" ? item.customValue.trim() : item.customValue || "";
              const matchValue = template.needsCustomValue ? customVal : template.defaultMatchValue;
              const codeSuffix = customVal ? String(customVal).replace(/[^a-zA-Z0-9]/g, "_").toUpperCase() : "";
              const code = codeSuffix ? `${template.value}_${codeSuffix}`.slice(0, 40) : `${template.value}_${index + 1}`.slice(0, 40);
              const label = template.needsCustomValue && customVal ? `${template.label}: ${customVal}` : template.label;
              return {
                code,
                label,
                sourceField: template.sourceField as ScholarshipPrioritySourceField,
                matchValue: matchValue || "DEFAULT",
                points: Number(item.points || 0),
                exclusiveGroup: template.exclusiveGroup,
                enabled: item.enabled !== false,
                order: index + 1,
              };
            }
            return {
              code: item.code || `CRIT_${index + 1}`,
              label: item.label || `Tiêu chí ${index + 1}`,
              sourceField: item.sourceField as ScholarshipPrioritySourceField,
              matchValue: String(item.matchValue || "true"),
              points: Number(item.points || 0),
              exclusiveGroup: item.exclusiveGroup || null,
              enabled: item.enabled !== false,
              order: index + 1,
            };
          })
      : [];

    return {
      title: values.title.trim(),
      description: values.description?.trim(),
      eligibilityCriteria: values.eligibilityCriteria?.trim(),
      targetBudget: Number(values.targetBudget),
      expectedSlots: computedSlots,
      awardAmountPerStudent: Number(values.awardAmountPerStudent),
      priorityCriteria: formattedPriorityCriteria,
      allowSlotExpansion: Boolean(values.allowSlotExpansion),
      paperDeliveryGraceDays: Number(values.paperDeliveryGraceDays ?? 5),
      fundingStart: values.fundingStart ? values.fundingStart.toISOString() : null,
      fundingEnd: values.fundingEnd ? values.fundingEnd.toISOString() : null,
      applicationStart: values.applicationStart ? values.applicationStart.toISOString() : null,
      applicationEnd: values.applicationEnd ? values.applicationEnd.toISOString() : null,
      timelineMode: "SEQUENTIAL",
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
            className="rounded-xl h-11 bg-teal-600 hover:bg-teal-700 font-semibold shadow-xs"
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
          targetBudget: 100_000_000,
          awardAmountPerStudent: 2_000_000,
          allowSlotExpansion: false,
          paperDeliveryGraceDays: 5,
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

        <Card className="rounded-2xl shadow-xs border-slate-200/80 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="text-base font-semibold text-slate-800">Tiêu chí xếp hạng ưu tiên</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Thiết lập các tiêu chí cộng điểm ưu tiên để hỗ trợ xếp hạng hồ sơ xét duyệt.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Áp dụng tiêu chí ưu tiên</span>
              <Switch
                checked={applyPriorityCriteria}
                onChange={(checked) => setApplyPriorityCriteria(checked)}
                checkedChildren="Bật"
                unCheckedChildren="Tắt"
              />
            </div>
          </div>

          {applyPriorityCriteria ? (
            <div className="mt-4 space-y-4">
              <Alert
                type="info"
                showIcon
                className="text-xs rounded-xl"
                message="Quy chế chấm điểm tự động"
                description="Mã tiêu chí, nguồn đối chiếu và nhóm loại trừ được hệ thống tự động ánh xạ. Tiêu chí cùng nhóm loại trừ (ví dụ Hộ nghèo và Hộ cận nghèo) chỉ lấy điểm cao nhất. Điểm ưu tiên hỗ trợ Admin xếp hạng, không tự động cấp hay từ chối hồ sơ."
              />

              <Form.List name="priorityCriteria">
                {(fields, { add, remove }) => (
                  <div className="space-y-3">
                    {fields.map(({ key, name, ...restField }) => (
                      <div key={key} className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                          <div className="md:col-span-5">
                            <Form.Item
                              {...restField}
                              name={[name, "type"]}
                              label={<span className="text-xs font-semibold text-slate-700">Loại tiêu chí</span>}
                              rules={[{ required: true, message: "Chọn loại tiêu chí" }]}
                              className="!mb-0"
                            >
                              <Select
                                options={PREDEFINED_CRITERIA_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                                placeholder="Chọn loại tiêu chí ưu tiên"
                                className="w-full"
                              />
                            </Form.Item>
                          </div>

                          <Form.Item
                            noStyle
                            shouldUpdate={(prev, current) =>
                              prev.priorityCriteria?.[name]?.type !== current.priorityCriteria?.[name]?.type
                            }
                          >
                            {({ getFieldValue }) => {
                              const type = getFieldValue(["priorityCriteria", name, "type"]);
                              const tpl = PREDEFINED_CRITERIA_TYPES.find((t) => t.value === type);
                              if (tpl?.needsCustomValue && tpl?.isGradeSelect) {
                                return (
                                  <div className="md:col-span-3">
                                    <Form.Item
                                      {...restField}
                                      name={[name, "customValue"]}
                                      label={<span className="text-xs font-semibold text-slate-700">Cấp lớp cụ thể</span>}
                                      rules={[{ required: true, message: "Chọn cấp lớp" }]}
                                      className="!mb-0"
                                    >
                                      <Select options={GRADE_OPTIONS} placeholder="Chọn cấp lớp" className="w-full" />
                                    </Form.Item>
                                  </div>
                                );
                              }
                              if (tpl?.needsCustomValue) {
                                return (
                                  <div className="md:col-span-3">
                                    <Form.Item
                                      {...restField}
                                      name={[name, "customValue"]}
                                      label={<span className="text-xs font-semibold text-slate-700">Giá trị đối chiếu</span>}
                                      rules={[{ required: true, message: "Nhập giá trị" }]}
                                      className="!mb-0"
                                    >
                                      <Input placeholder={tpl.valuePlaceholder || "Nhập tên địa bàn..."} maxLength={100} />
                                    </Form.Item>
                                  </div>
                                );
                              }
                              return (
                                <div className="md:col-span-3">
                                  <div className="text-xs font-semibold text-slate-700 mb-1">Nguồn đối chiếu</div>
                                  <Tag color="cyan" className="py-0.5 px-2 rounded-md border-cyan-200 text-xs">
                                    Tự động đối chiếu từ hồ sơ
                                  </Tag>
                                </div>
                              );
                            }}
                          </Form.Item>

                          <div className="md:col-span-2">
                            <Form.Item
                              {...restField}
                              name={[name, "points"]}
                              label={<span className="text-xs font-semibold text-slate-700">Điểm cộng</span>}
                              rules={[{ required: true, message: "Nhập điểm", type: "number", min: 0 }]}
                              className="!mb-0"
                            >
                              <InputNumber min={0} step={1} placeholder="0" className="w-full" />
                            </Form.Item>
                          </div>

                          <div className="md:col-span-1">
                            <Form.Item
                              {...restField}
                              name={[name, "enabled"]}
                              label={<span className="text-xs font-semibold text-slate-700">Áp dụng</span>}
                              valuePropName="checked"
                              initialValue={true}
                              className="!mb-0"
                            >
                              <Switch size="small" />
                            </Form.Item>
                          </div>

                          <div className="md:col-span-1 flex md:justify-center items-center pt-5">
                            <Button
                              danger
                              type="text"
                              icon={<DeleteOutlined />}
                              onClick={() => remove(name)}
                              title="Xóa tiêu chí"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="dashed"
                      block
                      icon={<PlusOutlined />}
                      onClick={() => add({ type: "POOR_HOUSEHOLD", points: 10, enabled: true })}
                      className="rounded-xl h-[38px] font-medium"
                    >
                      Thêm tiêu chí ưu tiên
                    </Button>
                  </div>
                )}
              </Form.List>
            </div>
          ) : (
            <div className="py-4 text-xs text-slate-400 italic">
              Chiến dịch không áp dụng tiêu chí ưu tiên. Hồ sơ sẽ được xét duyệt bình thường mà không tính điểm xếp hạng.
            </div>
          )}
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
              <div className="bg-teal-50/70 border border-teal-200/70 rounded-2xl p-6 h-full flex flex-col justify-center">
                <Text className="text-teal-800 font-bold uppercase text-xs tracking-wider mb-2">
                  Tạm tính phân bổ học bổng
                </Text>
                <div className="flex justify-between items-end mb-3 border-b border-teal-200/50 pb-3 text-sm">
                  <span className="text-slate-600">Tổng ngân sách:</span>
                  <span className="font-bold text-slate-900">{formatVND(targetBudget)}</span>
                </div>
                <div className="flex justify-between items-end mb-3 border-b border-teal-200/50 pb-3 text-sm">
                  <span className="text-slate-600">Định mức / học sinh:</span>
                  <span className="font-bold text-slate-900">÷ {formatVND(awardPerStudent)}</span>
                </div>
                <div className="flex justify-between items-end pt-1">
                  <span className="text-teal-950 font-bold text-sm">Số suất học bổng dự kiến:</span>
                  <span className="font-black text-teal-800 text-3xl">
                    {expectedSlots} <span className="text-base font-normal">suất</span>
                  </span>
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        <Card className="rounded-2xl shadow-xs border-slate-200/80 mb-6" title="Quy tắc xét suất và hồ sơ giấy">
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Cho phép tăng số suất khi tài trợ vượt mục tiêu"
                name="allowSlotExpansion"
                valuePropName="checked"
                extra="Nếu bật, số suất chính thức có thể vượt số suất mục tiêu khi đủ nguồn tài trợ."
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Số ngày nhận hồ sơ giấy sau hạn nộp trực tuyến"
                name="paperDeliveryGraceDays"
                rules={[{ required: true, message: "Vui lòng chọn thời gian nhận bổ sung hồ sơ giấy" }]}
              >
                <InputNumber min={3} max={5} precision={0} className="w-full" addonAfter="ngày làm việc" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* SECTION C */}
        <Card className="rounded-2xl shadow-xs border-slate-200/80 mb-6" title="Khung thời gian hoạt động (Tuần tự: Gây quỹ → Nhận hồ sơ)">
          <div className="mb-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <strong>Quy tắc tuần tự bắt buộc:</strong> Giai đoạn Gây quỹ phải hoàn tất trước. Thời gian mở nhận hồ sơ phải sau khi kết thúc gây quỹ (không được trùng ngày hoặc chồng lấn).
          </div>
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <div className="font-semibold text-slate-700 mb-2">1. Giai đoạn Gây quỹ (Nhà tài trợ)</div>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Bắt đầu gây quỹ"
                    name="fundingStart"
                    rules={[{ required: true, message: "Chọn ngày giờ bắt đầu gây quỹ" }]}
                  >
                    <DatePicker
                      showTime={{ format: "HH:mm" }}
                      format="DD/MM/YYYY HH:mm"
                      size="large"
                      className="w-full rounded-xl"
                      placeholder="dd/MM/yyyy HH:mm"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Kết thúc gây quỹ"
                    name="fundingEnd"
                    dependencies={["fundingStart"]}
                    rules={[
                      { required: true, message: "Chọn ngày giờ kết thúc gây quỹ" },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const start = getFieldValue("fundingStart");
                          if (!value || !start || value.isAfter(start)) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error("Thời gian kết thúc gây quỹ phải sau thời gian bắt đầu"));
                        },
                      }),
                    ]}
                  >
                    <DatePicker
                      showTime={{ format: "HH:mm" }}
                      format="DD/MM/YYYY HH:mm"
                      size="large"
                      className="w-full rounded-xl"
                      placeholder="dd/MM/yyyy HH:mm"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>

            <Col xs={24} md={12}>
              <div className="font-semibold text-slate-700 mb-2">2. Giai đoạn Nhận hồ sơ (Học sinh)</div>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Mở nhận hồ sơ"
                    name="applicationStart"
                    dependencies={["fundingEnd"]}
                    rules={[
                      { required: true, message: "Chọn ngày giờ mở nhận hồ sơ" },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const fEnd = getFieldValue("fundingEnd");
                          if (!value || !fEnd || value.isAfter(fEnd) || value.isSame(fEnd)) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error("Ngày mở nhận hồ sơ phải sau ngày kết thúc gây quỹ"));
                        },
                      }),
                    ]}
                  >
                    <DatePicker
                      showTime={{ format: "HH:mm" }}
                      format="DD/MM/YYYY HH:mm"
                      size="large"
                      className="w-full rounded-xl"
                      placeholder="dd/MM/yyyy HH:mm"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Đóng nhận hồ sơ"
                    name="applicationEnd"
                    dependencies={["applicationStart"]}
                    rules={[
                      { required: true, message: "Chọn ngày giờ đóng nhận hồ sơ" },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const aStart = getFieldValue("applicationStart");
                          if (!value || !aStart || value.isAfter(aStart)) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error("Ngày đóng nhận hồ sơ phải sau ngày mở nhận hồ sơ"));
                        },
                      }),
                    ]}
                  >
                    <DatePicker
                      showTime={{ format: "HH:mm" }}
                      format="DD/MM/YYYY HH:mm"
                      size="large"
                      className="w-full rounded-xl"
                      placeholder="dd/MM/yyyy HH:mm"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  );
}
