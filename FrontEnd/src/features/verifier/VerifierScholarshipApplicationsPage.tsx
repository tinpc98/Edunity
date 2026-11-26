import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { FileSearchOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import type { ScholarshipApplication, VerifierScholarshipApplicationDetail } from "../../types/scholarship";
import { scholarshipApplicationService } from "../../services/scholarshipApplication.service";
import { useAuthStore } from "../../stores/auth.store";

const { Title, Text } = Typography;
const RESULT_LABELS: Record<string, string> = {
  VERIFIED_MATCHED: "Đã xác minh khớp",
  DISCREPANCY: "Có sai lệch cần xem lại",
  SUPPLEMENT_REQUIRED: "Cần xác minh bổ sung",
  UNABLE_TO_VERIFY: "Chưa thể xác minh",
};
const HARDSHIP_LABELS: Record<string, string> = {
  POOR_HOUSEHOLD: "Hộ nghèo",
  NEAR_POOR_HOUSEHOLD: "Hộ cận nghèo",
  REMOTE_AREA: "Vùng sâu, vùng xa",
  ORPHANED: "Mồ côi cha mẹ",
};

export default function VerifierScholarshipApplicationsPage() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form] = Form.useForm<{ status: string; notes?: string }>();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate(`/login?redirect=${encodeURIComponent("/verifier/scholarship-applications")}`, { replace: true });
    } else if (user.role !== "VERIFIER" && user.role !== "ADMIN") {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const listQuery = useQuery({
    queryKey: ["verifierScholarshipApplications"],
    queryFn: () => scholarshipApplicationService.getVerifierApplications({ page: 1, pageSize: 100 }),
    enabled: isAuthenticated && (user?.role === "VERIFIER" || user?.role === "ADMIN"),
  });
  const detailQuery = useQuery({
    queryKey: ["verifierScholarshipApplication", selectedId],
    queryFn: () => scholarshipApplicationService.verifierGetApplication(selectedId || ""),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    form.setFieldsValue({
      status: detailQuery.data.verifierResult?.status && RESULT_LABELS[detailQuery.data.verifierResult.status]
        ? detailQuery.data.verifierResult.status
        : "VERIFIED_MATCHED",
      notes: detailQuery.data.verifierResult?.notes || "",
    });
  }, [detailQuery.data, form]);

  const submitMutation = useMutation({
    mutationFn: (payload: { status: "VERIFIED_MATCHED" | "DISCREPANCY" | "SUPPLEMENT_REQUIRED" | "UNABLE_TO_VERIFY"; notes?: string }) =>
      scholarshipApplicationService.verifierSubmitResult(selectedId || "", payload),
    onSuccess: async () => {
      message.success("Đã lưu kết quả xác minh.");
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["verifierScholarshipApplications"] });
    },
    onError: (error: any) => message.error(error?.message || "Không thể lưu kết quả xác minh."),
  });

  const columns = [
    { title: "Mã hồ sơ", dataIndex: "applicationCode", key: "applicationCode", render: (value: string) => <span className="font-mono font-semibold">{value || "—"}</span> },
    { title: "Học sinh", dataIndex: "studentName", key: "studentName", render: (value: string) => value || "—" },
    { title: "Chiến dịch", dataIndex: "campaignTitle", key: "campaignTitle", render: (value: string) => value || "—" },
    { title: "Trường", key: "school", render: (_: unknown, row: ScholarshipApplication) => row.schoolInfo?.schoolName || "—" },
    { title: "Tỉnh/thành", key: "province", render: (_: unknown, row: ScholarshipApplication) => row.schoolInfo?.province || "—" },
    { title: "Nộp lúc", dataIndex: "submittedAt", key: "submittedAt", render: (value: string | null) => value ? new Date(value).toLocaleString("vi-VN") : "—" },
    { title: "Kết quả", key: "result", render: (_: unknown, row: ScholarshipApplication) => row.verifierResult?.status ? <Tag>{RESULT_LABELS[row.verifierResult.status] || row.verifierResult.status}</Tag> : <Tag color="processing">Chờ xác minh</Tag> },
    { title: "", key: "action", render: (_: unknown, row: ScholarshipApplication) => <Button icon={<FileSearchOutlined />} onClick={() => setSelectedId(row.id)}>Mở hồ sơ</Button> },
  ];

  const detail = detailQuery.data as VerifierScholarshipApplicationDetail | undefined;
  const handleSubmit = async () => {
    if (!selectedId) return;
    const values = await form.validateFields();
    submitMutation.mutate({
      status: values.status as "VERIFIED_MATCHED" | "DISCREPANCY" | "SUPPLEMENT_REQUIRED" | "UNABLE_TO_VERIFY",
      notes: values.notes?.trim(),
    });
  };

  if (!isAuthenticated || (user?.role !== "VERIFIER" && user?.role !== "ADMIN")) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Title level={2} className="!mb-1">Hồ sơ được phân công xác minh</Title>
            <Text type="secondary">Chỉ hiển thị hồ sơ đã giao cho tài khoản xác minh này.</Text>
          </div>
          <Tag color="blue" icon={<SafetyCertificateOutlined />}>Xác minh độc lập</Tag>
        </div>

        <Alert
          type="info"
          showIcon
          message="Kết quả xác minh là một phần của quy trình xét duyệt"
          description="Sai lệch hoặc chưa thể xác minh sẽ được chuyển để xem xét bổ sung; hệ thống không tự kết luận gian lận, duyệt hay từ chối học bổng."
        />

        <Card className="rounded-2xl">
          {listQuery.isLoading ? <Skeleton active /> : (
            <Table<ScholarshipApplication>
              rowKey="id"
              loading={listQuery.isFetching}
              columns={columns}
              dataSource={listQuery.data?.items || []}
              pagination={false}
              scroll={{ x: 900 }}
            />
          )}
          {listQuery.isError && <Alert className="mt-3" type="error" showIcon message="Không tải được danh sách hồ sơ được giao." />}
        </Card>
      </div>

      <Modal
        title={`Xác minh hồ sơ ${detail?.applicationCode || ""}`}
        open={Boolean(selectedId)}
        onCancel={() => setSelectedId(null)}
        width={900}
        destroyOnHidden
        footer={[
          <Button key="close" onClick={() => setSelectedId(null)}>Đóng</Button>,
          <Button key="submit" type="primary" loading={submitMutation.isPending} onClick={() => void handleSubmit()}>Lưu kết quả xác minh</Button>,
        ]}
      >
        {detailQuery.isLoading ? <Skeleton active /> : detailQuery.isError ? (
          <Alert type="error" showIcon message="Không thể mở hồ sơ này. Có thể hồ sơ không còn được phân công cho bạn." />
        ) : detail ? (
          <div className="space-y-4">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Học sinh">{detail.applicantInfo?.fullName || "—"}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái hồ sơ">{detail.status}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ thường trú">{[detail.applicantInfo?.permanentCommune, detail.applicantInfo?.permanentProvince].filter(Boolean).join(", ") || "—"}</Descriptions.Item>
              <Descriptions.Item label="Diện khó khăn">{detail.isDisadvantaged ? (detail.hardshipCategories || []).map((category) => HARDSHIP_LABELS[category] || category).join(", ") : "Không khai báo"}</Descriptions.Item>
              <Descriptions.Item label="Trường">{detail.schoolInfo?.schoolName || "—"}</Descriptions.Item>
              <Descriptions.Item label="Lớp / năm học">{[detail.schoolInfo?.className, detail.schoolInfo?.academicYear].filter(Boolean).join(" · ") || "—"}</Descriptions.Item>
              <Descriptions.Item label="Địa bàn trường">{[detail.schoolInfo?.district, detail.schoolInfo?.province].filter(Boolean).join(", ") || "—"}</Descriptions.Item>
              <Descriptions.Item label="Hộ nghèo/cận nghèo">{detail.hasPovertyCertificate ? "Có giấy chứng nhận" : "Không khai báo"}</Descriptions.Item>
            </Descriptions>

            {detail.paperDispatch?.declaredSent && (
              <Alert type="info" showIcon message="Học sinh đã khai báo gửi hồ sơ giấy" description={`${detail.paperDispatch.carrier || "Đơn vị vận chuyển chưa ghi"} · mã vận đơn ${detail.paperDispatch.trackingNumber || "chưa có"} · ${detail.paperDispatch.sentAt ? new Date(detail.paperDispatch.sentAt).toLocaleDateString("vi-VN") : "chưa ghi ngày gửi"}`} />
            )}

            <Card size="small" title="Tài liệu được phép xem trong hồ sơ được giao">
              <div className="space-y-3">
                {(detail.documents || []).map((document, index) => (
                  <div key={document._id || index} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 font-semibold">{document.title || document.checklistItemCode || document.documentType} · {document.status || "Đang xử lý"}</div>
                    <Space wrap>
                      {(document.files || []).map((file, fileIndex) => {
                        const url = file.url || file.signedUrl;
                        return url ? <a key={file.storageKey || fileIndex} href={url} target="_blank" rel="noreferrer">Mở PDF {fileIndex + 1}</a> : null;
                      })}
                    </Space>
                  </div>
                ))}
                {!detail.documents?.length && <Text type="secondary">Chưa có tài liệu trực tuyến.</Text>}
              </div>
            </Card>

            <Form form={form} layout="vertical">
              <Form.Item name="status" label="Kết quả xác minh" rules={[{ required: true }]}>
                <Select options={[
                  { value: "VERIFIED_MATCHED", label: "Thông tin khớp" },
                  { value: "DISCREPANCY", label: "Có sai lệch cần xem lại" },
                  { value: "SUPPLEMENT_REQUIRED", label: "Cần xác minh bổ sung" },
                  { value: "UNABLE_TO_VERIFY", label: "Chưa thể xác minh" },
                ]} />
              </Form.Item>
              <Form.Item
                name="notes"
                label="Ghi chú xác minh"
                dependencies={["status"]}
                rules={[
                  { max: 1000, message: "Tối đa 1.000 ký tự" },
                  {
                    validator: (_, value) => form.getFieldValue("status") === "VERIFIED_MATCHED" || value?.trim()
                      ? Promise.resolve()
                      : Promise.reject(new Error("Vui lòng ghi lý do khi thông tin sai lệch hoặc chưa thể xác minh.")),
                  },
                ]}
              >
                <Input.TextArea rows={4} maxLength={1000} showCount placeholder="Ghi rõ nguồn xác minh, nội dung đã đối chiếu hoặc lý do cần kiểm tra thêm." />
              </Form.Item>
            </Form>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
