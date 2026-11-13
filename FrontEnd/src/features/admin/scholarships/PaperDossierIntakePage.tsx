import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { FileSearchOutlined, InboxOutlined, LinkOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  scholarshipApplicationKeys,
  scholarshipApplicationService,
} from "../../../services/scholarshipApplication.service";
import type {
  PaperDossierReceipt,
  PaperDossierReceiptPayload,
  ScholarshipChecklistItem,
} from "../../../types/scholarship";
import { ROUTES } from "../../../routes/routePaths";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import dayjs, { type Dayjs } from "dayjs";

const { Title, Text } = Typography;
const RECEIPT_STATUSES = [
  "RECEIVED",
  "IN_RECONCILIATION",
  "DISCREPANCY",
  "RECONCILED",
  "REJECTED",
  "CANCELLED",
] as const;
const STATUS_LABELS: Record<PaperDossierReceipt["status"], string> = {
  RECEIVED: "Đã tiếp nhận",
  IN_RECONCILIATION: "Đang đối chiếu",
  DISCREPANCY: "Có sai lệch",
  RECONCILED: "Đã đối chiếu",
  REJECTED: "Đã từ chối",
  CANCELLED: "Đã hủy",
};
const STATUS_COLORS: Record<PaperDossierReceipt["status"], string> = {
  RECEIVED: "blue",
  IN_RECONCILIATION: "processing",
  DISCREPANCY: "error",
  RECONCILED: "success",
  REJECTED: "default",
  CANCELLED: "default",
};

interface IntakeFormValues {
  applicationCode?: string;
  declaredApplicationCode?: string;
  receiptCode?: string;
  receivedAt?: Dayjs;
  receivingLocation?: string;
  intakeNote?: string;
  deliveryMethod: PaperDossierReceipt["postalInfo"]["deliveryMethod"];
  carrierName?: string;
  trackingNumber?: string;
  senderName: string;
  senderPhone?: string;
  senderAddress?: string;
  sentAt?: Dayjs;
  postmarkDate?: Dayjs;
  envelopeSealed: boolean;
  packageCondition: NonNullable<PaperDossierReceipt["postalInfo"]["packageCondition"]>;
}

interface LinkFormValues {
  applicationCode: string;
  note?: string;
}

interface ReconcileFormValues {
  status: "IN_RECONCILIATION" | "DISCREPANCY" | "RECONCILED";
  reconciliationNote?: string;
  discrepancyReason?: string;
  reconciledItems?: {
    itemStatus?: string;
    documentTitle?: string;
    pageCount?: number;
    isOriginal?: boolean;
    hasOfficialStamp?: boolean;
    note?: string;
  }[];
}

function getId(value?: string | { _id?: string } | null): string {
  return typeof value === "string" ? value : value?._id ?? "";
}

const formatDate = (date?: string | null) =>
  date ? new Date(date).toLocaleString("vi-VN") : "—";

export default function PaperDossierIntakePage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [receiptCodeFilter, setReceiptCodeFilter] = useState("");
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string>();
  const [intakeForm] = Form.useForm<IntakeFormValues>();
  const [linkForm] = Form.useForm<LinkFormValues>();
  const [reconcileForm] = Form.useForm<ReconcileFormValues>();

  const listQuery = useQuery({
    queryKey: scholarshipApplicationKeys.paperReceipts({
      page,
      pageSize: 10,
      status: statusFilter,
      receiptCode: receiptCodeFilter.trim(),
    }),
    queryFn: () =>
      scholarshipApplicationService.adminListPaperReceipts({
        page,
        pageSize: 10,
        status: statusFilter,
        receiptCode: receiptCodeFilter.trim() || undefined,
      }),
  });
  const detailQuery = useQuery({
    queryKey: scholarshipApplicationKeys.paperReceiptDetail(selectedReceiptId ?? ""),
    queryFn: () => scholarshipApplicationService.adminGetPaperReceipt(selectedReceiptId ?? ""),
    enabled: Boolean(selectedReceiptId),
    retry: false,
  });
  const receipt = detailQuery.data;
  const checklist: ScholarshipChecklistItem[] = (receipt?.campaign?.documentChecklist ?? []).filter((item) =>
    ["PAPER", "BOTH", "EITHER"].includes(item.acceptedMode),
  );

  useEffect(() => {
    if (!receipt) return;
    reconcileForm.setFieldsValue({
      status: "IN_RECONCILIATION",
      reconciledItems: checklist.map((item) => {
        const existing = receipt.reconciledItems?.find((row) => row.checklistItemCode === item.code);
        return {
          itemStatus: existing?.itemStatus,
          documentTitle: existing?.documentTitle ?? item.title,
          pageCount: existing?.pageCount ?? 1,
          isOriginal: existing?.isOriginal ?? false,
          hasOfficialStamp: existing?.hasOfficialStamp ?? false,
          note: existing?.note ?? "",
        };
      }),
    });
  }, [checklist, receipt, reconcileForm]);

  const intakeMutation = useMutation({
    mutationFn: (payload: PaperDossierReceiptPayload) =>
      scholarshipApplicationService.adminIntakePaperDossier(payload),
    onSuccess: async (created) => {
      message.success(`Đã ghi nhận biên nhận ${created.receiptCode}.`);
      setIsIntakeOpen(false);
      intakeForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.paperReceipts() });
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error, "Không thể tiếp nhận hồ sơ giấy.")),
  });
  const linkMutation = useMutation({
    mutationFn: (values: LinkFormValues) => {
      if (!selectedReceiptId) throw new Error("Không tìm thấy mã biên nhận.");
      return scholarshipApplicationService.adminLinkPaperDossier(selectedReceiptId, values);
    },
    onSuccess: async () => {
      message.success("Đã liên kết biên nhận với hồ sơ học bổng.");
      linkForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.paperReceipts() }),
        queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.paperReceiptDetail(selectedReceiptId ?? "") }),
      ]);
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error, "Không thể liên kết hồ sơ giấy.")),
  });
  const reconcileMutation = useMutation({
    mutationFn: (values: ReconcileFormValues) => {
      if (!selectedReceiptId) throw new Error("Không tìm thấy mã biên nhận.");
      const reconciledItems = (values.reconciledItems ?? [])
        .map((item, index) => ({
          checklistItemCode: checklist[index]?.code ?? "",
          itemStatus: item.itemStatus as NonNullable<PaperDossierReceipt["reconciledItems"]>[number]["itemStatus"],
          documentTitle: item.documentTitle,
          pageCount: item.pageCount,
          isOriginal: item.isOriginal,
          hasOfficialStamp: item.hasOfficialStamp,
          note: item.note,
        }))
        .filter((item) => item.itemStatus);
      return scholarshipApplicationService.adminReconcilePaperDossier(selectedReceiptId, {
        status: values.status,
        reconciliationNote: values.reconciliationNote,
        discrepancyReason: values.status === "DISCREPANCY" ? values.discrepancyReason : undefined,
        reconciledItems: reconciledItems.length > 0 ? reconciledItems : undefined,
      });
    },
    onSuccess: async () => {
      message.success("Đã cập nhật trạng thái đối chiếu hồ sơ giấy.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.paperReceipts() }),
        queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.paperReceiptDetail(selectedReceiptId ?? "") }),
      ]);
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error, "Không thể cập nhật đối chiếu hồ sơ.")),
  });

  const handleIntake = async (values: IntakeFormValues) => {
    const deliveryMethod = values.deliveryMethod;
    if (
      deliveryMethod === "POSTAL_MAIL" &&
      !values.trackingNumber?.trim() &&
      !values.sentAt &&
      !values.postmarkDate
    ) {
      message.error("Hồ sơ bưu điện cần có mã theo dõi, ngày gửi hoặc ngày dấu bưu điện.");
      return;
    }
    const payload: PaperDossierReceiptPayload = {
      applicationCode: values.applicationCode?.trim() || undefined,
      declaredApplicationCode: values.declaredApplicationCode?.trim() || undefined,
      receiptCode: values.receiptCode?.trim() || undefined,
      receivedAt: values.receivedAt?.toISOString(),
      receivingLocation: values.receivingLocation?.trim() || undefined,
      intakeNote: values.intakeNote?.trim() || undefined,
      postalInfo: {
        deliveryMethod,
        carrierName: values.carrierName?.trim() || (deliveryMethod === "IN_PERSON_DROP_OFF" ? "DIRECT_DROP_OFF" : ""),
        trackingNumber: values.trackingNumber?.trim() || undefined,
        senderName: values.senderName.trim(),
        senderPhone: values.senderPhone?.trim() || undefined,
        senderAddress: values.senderAddress?.trim() || undefined,
        sentAt: values.sentAt?.toISOString(),
        postmarkDate: values.postmarkDate?.toISOString(),
        envelopeSealed: values.envelopeSealed,
        packageCondition: values.packageCondition,
      },
    };
    intakeMutation.mutate(payload);
  };

  const handleReconcile = (values: ReconcileFormValues) => {
    if (values.status === "RECONCILED") {
      const items = values.reconciledItems ?? [];
      const selectedAnyItem = items.some((item) => item.itemStatus);
      if (!selectedAnyItem) {
        message.error("Chọn kết quả đối chiếu cho ít nhất một loại giấy tờ.");
        return;
      }
      const missingRequired = checklist
        .map((item, index) => ({ item, status: items[index]?.itemStatus }))
        .filter(({ item, status }) =>
          item.required &&
          ["PAPER", "BOTH"].includes(item.acceptedMode) &&
          status !== "MATCHED",
        );
      if (missingRequired.length > 0) {
        message.error(`Các giấy tờ bắt buộc phải được đối chiếu khớp: ${missingRequired.map(({ item }) => item.title).join(", ")}.`);
        return;
      }
    }
    reconcileMutation.mutate(values);
  };

  const columns: ColumnsType<PaperDossierReceipt> = [
    {
      title: "Biên nhận",
      dataIndex: "receiptCode",
      render: (code: string, row) => (
        <button className="font-mono font-semibold text-indigo-700 hover:underline" onClick={() => setSelectedReceiptId(row._id || row.id)}>
          {code}
        </button>
      ),
    },
    {
      title: "Mã hồ sơ",
      render: (_, row) => {
        const appId = getId(row.applicationId);
        const applicationCode =
          row.applicationId && typeof row.applicationId === "object"
            ? row.applicationId.applicationCode
            : row.declaredApplicationCode;
        return appId ? (
          <Link to={ROUTES.ADMIN.SCHOLARSHIP_APPLICATION_REVIEW.replace(":applicationId", appId)}>
            {applicationCode || "Xem hồ sơ trực tuyến"}
          </Link>
        ) : applicationCode || "Chưa liên kết";
      },
    },
    {
      title: "Người gửi",
      render: (_, row) => <span>{row.postalInfo.senderName}</span>,
    },
    {
      title: "Đơn vị vận chuyển / Mã theo dõi",
      render: (_, row) => (
        <div className="text-xs">
          <div>{row.postalInfo.carrierName}</div>
          <div className="font-mono text-slate-500">{row.postalInfo.trackingNumber || "—"}</div>
        </div>
      ),
    },
    {
      title: "Ngày tiếp nhận",
      dataIndex: "receivedAt",
      render: formatDate,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      render: (status: PaperDossierReceipt["status"]) => <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>,
    },
    {
      title: "Thao tác",
      render: (_, row) => (
        <Button size="small" icon={<FileSearchOutlined />} onClick={() => setSelectedReceiptId(row._id || row.id)}>
          Đối chiếu
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Title level={2} className="!mb-1">Tiếp nhận hồ sơ học bổng bản giấy</Title>
          <Text type="secondary">Ghi nhận biên nhận, liên kết hồ sơ trực tuyến và đối chiếu theo checklist của chiến dịch.</Text>
        </div>
        <Button type="primary" icon={<InboxOutlined />} onClick={() => setIsIntakeOpen(true)}>Ghi nhận tiếp nhận</Button>
      </div>

      <Card>
        <Space wrap className="mb-4">
          <Select
            value={statusFilter}
            onChange={(value) => { setStatusFilter(value); setPage(1); }}
            options={[{ value: "ALL", label: "Tất cả trạng thái" }, ...RECEIPT_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))]}
            className="w-56"
          />
          <Input.Search
            value={receiptCodeFilter}
            onChange={(event) => { setReceiptCodeFilter(event.target.value); setPage(1); }}
            placeholder="Tìm mã biên nhận"
            allowClear
            className="w-64"
          />
          <Button icon={<ReloadOutlined />} onClick={() => void listQuery.refetch()}>Làm mới</Button>
        </Space>
        {listQuery.isError ? (
          <Alert type="error" showIcon message="Không tải được danh sách biên nhận" description="Vui lòng thử lại. Lỗi API không làm thay đổi trạng thái biên nhận." action={<Button size="small" onClick={() => void listQuery.refetch()}>Thử lại</Button>} />
        ) : (
          <Table
            rowKey={(row) => row._id || row.id || row.receiptCode}
            columns={columns}
            dataSource={listQuery.data?.items ?? []}
            loading={listQuery.isLoading}
            pagination={{
              current: page,
              pageSize: 10,
              total: listQuery.data?.total ?? 0,
              onChange: setPage,
              showSizeChanger: false,
            }}
            locale={{ emptyText: "Chưa có biên nhận hồ sơ giấy." }}
          />
        )}
      </Card>

      <Modal
        title="Ghi nhận tiếp nhận hồ sơ giấy"
        open={isIntakeOpen}
        onCancel={() => { if (!intakeMutation.isPending) { setIsIntakeOpen(false); intakeForm.resetFields(); } }}
        onOk={() => intakeForm.submit()}
        confirmLoading={intakeMutation.isPending}
        okText="Ghi nhận"
        cancelText="Hủy"
        width={760}
        destroyOnHidden
      >
        <Form
          form={intakeForm}
          layout="vertical"
          initialValues={{ deliveryMethod: "POSTAL_MAIL", envelopeSealed: true, packageCondition: "INTACT" }}
          onFinish={handleIntake}
        >
          <Alert className="mb-4" type="info" showIcon message="Chỉ ghi nhận thông tin tiếp nhận và tình trạng gói hồ sơ; không tải bản giấy lên hệ thống." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item name="applicationCode" label="Mã hồ sơ trực tuyến để liên kết">
              <Input placeholder="APP-..." autoComplete="off" />
            </Form.Item>
            <Form.Item name="declaredApplicationCode" label="Mã ghi trên bì thư nếu chưa xác định hồ sơ">
              <Input placeholder="Có thể để trống" autoComplete="off" />
            </Form.Item>
            <Form.Item name="receiptCode" label="Mã biên nhận (tùy chọn)">
              <Input maxLength={40} autoComplete="off" />
            </Form.Item>
            <Form.Item name="receivingLocation" label="Địa điểm tiếp nhận">
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="receivedAt" label="Thời điểm tiếp nhận">
              <DatePicker showTime className="w-full" disabledDate={(date) => date.isAfter(dayjs())} />
            </Form.Item>
            <Form.Item name="deliveryMethod" label="Hình thức chuyển đến" rules={[{ required: true }]}>
              <Select options={[
                { value: "POSTAL_MAIL", label: "Bưu điện" },
                { value: "COURIER", label: "Chuyển phát" },
                { value: "IN_PERSON_DROP_OFF", label: "Nộp trực tiếp" },
              ]} />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(previous, current) => previous.deliveryMethod !== current.deliveryMethod}>
              {({ getFieldValue }) => getFieldValue("deliveryMethod") !== "IN_PERSON_DROP_OFF" && (
                <Form.Item name="carrierName" label="Đơn vị vận chuyển" rules={[{ required: true, min: 2, max: 100 }]}>
                  <Input maxLength={100} />
                </Form.Item>
              )}
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(previous, current) => previous.deliveryMethod !== current.deliveryMethod}>
              {({ getFieldValue }) => getFieldValue("deliveryMethod") === "COURIER" && (
                <Form.Item name="trackingNumber" label="Mã theo dõi" rules={[{ required: true, max: 80 }]}>
                  <Input maxLength={80} autoComplete="off" />
                </Form.Item>
              )}
            </Form.Item>
            <Form.Item name="senderName" label="Tên người gửi" rules={[{ required: true, min: 2, max: 120 }]}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="senderPhone" label="Điện thoại người gửi">
              <Input maxLength={20} autoComplete="off" />
            </Form.Item>
            <Form.Item name="senderAddress" label="Địa chỉ người gửi" className="md:col-span-2">
              <Input maxLength={300} />
            </Form.Item>
            <Form.Item name="sentAt" label="Ngày gửi">
              <DatePicker showTime className="w-full" />
            </Form.Item>
            <Form.Item name="postmarkDate" label="Ngày dấu bưu điện">
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="packageCondition" label="Tình trạng gói" rules={[{ required: true }]}>
              <Select options={["INTACT", "DAMAGED", "TORN", "WET", "PARTIAL"].map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="envelopeSealed" valuePropName="checked" label="Phong bì">
              <Checkbox>Phong bì còn niêm phong</Checkbox>
            </Form.Item>
            <Form.Item name="intakeNote" label="Ghi chú tiếp nhận" className="md:col-span-2">
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title={receipt ? `Biên nhận ${receipt.receiptCode}` : "Chi tiết biên nhận"}
        open={Boolean(selectedReceiptId)}
        onCancel={() => { setSelectedReceiptId(undefined); linkForm.resetFields(); }}
        footer={<Button onClick={() => { setSelectedReceiptId(undefined); linkForm.resetFields(); }}>Đóng</Button>}
        width={900}
        destroyOnHidden
      >
        {detailQuery.isLoading ? <div className="py-12 text-center">Đang tải chi tiết biên nhận...</div> : detailQuery.isError ? (
          <Alert type="error" showIcon message="Không tải được biên nhận" description="Biên nhận không tồn tại hoặc bạn không có quyền truy cập." action={<Button size="small" onClick={() => void detailQuery.refetch()}>Thử lại</Button>} />
        ) : receipt && (
          <div className="space-y-5">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Trạng thái"><Tag color={STATUS_COLORS[receipt.status]}>{STATUS_LABELS[receipt.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="Tiếp nhận lúc">{formatDate(receipt.receivedAt)}</Descriptions.Item>
              <Descriptions.Item label="Người xử lý">{receipt.receivedByName || "—"}</Descriptions.Item>
              <Descriptions.Item label="Địa điểm">{receipt.receivingLocation || "—"}</Descriptions.Item>
              <Descriptions.Item label="Học sinh">
                {receipt.student?.fullName || receipt.student?.email || "Chưa xác định"}
              </Descriptions.Item>
              <Descriptions.Item label="Chiến dịch">{receipt.campaign?.title || "—"}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái hồ sơ trực tuyến">
                {receipt.application?.status || "Chưa liên kết"}
              </Descriptions.Item>
              <Descriptions.Item label="Hình thức hồ sơ">
                {receipt.application?.submissionMode || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Người gửi">{receipt.postalInfo.senderName}</Descriptions.Item>
              <Descriptions.Item label="Vận chuyển">{receipt.postalInfo.deliveryMethod} · {receipt.postalInfo.carrierName}</Descriptions.Item>
              <Descriptions.Item label="Tracking">{receipt.postalInfo.trackingNumber || "—"}</Descriptions.Item>
              <Descriptions.Item label="Tình trạng gói">{receipt.postalInfo.packageCondition || "—"}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú" span={2}>{receipt.intakeNote || receipt.reconciliationNote || "—"}</Descriptions.Item>
            </Descriptions>

            {receipt.applicationId ? (
              <Alert
                type="success"
                showIcon
                message={`Đã liên kết với ${receipt.application?.applicationCode || receipt.declaredApplicationCode || "hồ sơ trực tuyến"}`}
                description={
                  receipt.application?._id ? (
                    <Link to={ROUTES.ADMIN.SCHOLARSHIP_APPLICATION_REVIEW.replace(":applicationId", receipt.application._id)}>
                      Mở hồ sơ trực tuyến và tài liệu đã nộp <LinkOutlined />
                    </Link>
                  ) : "Có thể mở danh sách hồ sơ để xem chi tiết trực tuyến."
                }
              />
            ) : receipt.status === "RECEIVED" && (
              <Card size="small" title="Liên kết hồ sơ trực tuyến">
                <Form form={linkForm} layout="inline" onFinish={(values) => linkMutation.mutate(values)}>
                  <Form.Item name="applicationCode" rules={[{ required: true, whitespace: true, message: "Nhập mã hồ sơ" }]}>
                    <Input placeholder="Mã hồ sơ APP-..." />
                  </Form.Item>
                  <Form.Item name="note"><Input placeholder="Ghi chú (tùy chọn)" maxLength={500} /></Form.Item>
                  <Button htmlType="submit" icon={<LinkOutlined />} loading={linkMutation.isPending}>Liên kết</Button>
                </Form>
              </Card>
            )}

            {receipt.applicationId && ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY"].includes(receipt.status) && (
              <Card size="small" title="Đối chiếu giấy với hồ sơ trực tuyến">
                {checklist.length === 0 && (
                  <Alert type="warning" showIcon className="mb-3" message="Chiến dịch chưa khai báo checklist giấy" description="Có thể ghi nhận đang đối chiếu hoặc sai lệch; không thể đánh dấu đã đối chiếu vì Backend yêu cầu ít nhất một mục checklist." />
                )}
                <Form
                  form={reconcileForm}
                  layout="vertical"
                  onFinish={handleReconcile}
                >
                  <Form.Item name="status" label="Trạng thái xử lý" rules={[{ required: true }]}>
                    <Select options={[
                      { value: "IN_RECONCILIATION", label: "Đang đối chiếu" },
                      { value: "DISCREPANCY", label: "Có sai lệch" },
                      { value: "RECONCILED", label: "Đã đối chiếu khớp" },
                    ]} />
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate={(previous, current) => previous.status !== current.status}>
                    {({ getFieldValue }) => getFieldValue("status") === "DISCREPANCY" && (
                      <Form.Item name="discrepancyReason" label="Lý do sai lệch" rules={[{ required: true, whitespace: true, max: 1000 }]}>
                        <Input.TextArea rows={2} maxLength={1000} />
                      </Form.Item>
                    )}
                  </Form.Item>
                  {checklist.map((item, index) => (
                    <Card key={item.code} size="small" className="mb-3" title={`${item.code} · ${item.title}`}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3">
                        <Form.Item name={["reconciledItems", index, "itemStatus"]} label="Kết quả đối chiếu">
                          <Select allowClear options={[
                            { value: "MATCHED", label: "Khớp" },
                            { value: "MISSING", label: "Thiếu" },
                            { value: "MISMATCH", label: "Không khớp" },
                            { value: "DAMAGED", label: "Hư hỏng" },
                            { value: "NOT_APPLICABLE", label: "Không áp dụng" },
                          ]} />
                        </Form.Item>
                        <Form.Item name={["reconciledItems", index, "pageCount"]} label="Số trang">
                          <InputNumber min={0} max={500} className="w-full" />
                        </Form.Item>
                        <Form.Item name={["reconciledItems", index, "isOriginal"]} valuePropName="checked">
                          <Checkbox>Bản chính</Checkbox>
                        </Form.Item>
                        <Form.Item name={["reconciledItems", index, "hasOfficialStamp"]} valuePropName="checked">
                          <Checkbox>Có dấu xác nhận</Checkbox>
                        </Form.Item>
                        <Form.Item name={["reconciledItems", index, "note"]} label="Ghi chú mục" className="md:col-span-2">
                          <Input maxLength={500} />
                        </Form.Item>
                      </div>
                    </Card>
                  ))}
                  <Form.Item name="reconciliationNote" label="Ghi chú đối chiếu">
                    <Input.TextArea rows={2} maxLength={1000} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={reconcileMutation.isPending}>
                    Cập nhật đối chiếu
                  </Button>
                </Form>
              </Card>
            )}

            <Card size="small" title="Lịch sử thao tác">
              {receipt.history?.length ? (
                <div className="space-y-2">
                  {receipt.history.map((event, index) => (
                    <div key={`${event.action}-${event.recordedAt}-${index}`} className="border-b last:border-0 pb-2 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>{event.action}: {event.fromStatus || "—"} → {event.toStatus}</strong>
                        <Text type="secondary">{formatDate(event.recordedAt)}</Text>
                      </div>
                      {event.note && <div className="text-slate-600">{event.note}</div>}
                    </div>
                  ))}
                </div>
              ) : <Text type="secondary">Chưa có lịch sử.</Text>}
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}
