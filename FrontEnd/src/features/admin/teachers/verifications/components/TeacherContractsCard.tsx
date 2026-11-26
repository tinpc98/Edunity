import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, DatePicker, Empty, Form, Input, Modal, Space, Tag, message } from "antd";
import {
  DownloadOutlined,
  EyeOutlined,
  FileProtectOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Link } from "react-router-dom";
import {
  CONTRACT_STATUS_META,
  teacherContractService,
  type TeacherContract,
} from "../../../../../services/teacherContract.service";
import { getFriendlyErrorMessage } from "../../../../../utils/apiErrorMap";
import TeacherContractDetailModal from "../../../../teacher/profile/components/TeacherContractDetailModal";

const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "—");
const formatDateTime = (value?: string | null) =>
  value ? dayjs(value).format("HH:mm DD/MM/YYYY") : "—";

interface Props {
  teacherId: string;
  isVerified: boolean;
}

export default function TeacherContractsCard({ teacherId, isVerified }: Props) {
  const queryClient = useQueryClient();
  const [sendForm] = Form.useForm<{ period: [Dayjs, Dayjs]; note?: string }>();
  const [endForm] = Form.useForm<{ reason: string }>();
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [ending, setEnding] = useState<TeacherContract | null>(null);
  const [viewingContractId, setViewingContractId] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const queryKey = ["admin-teacher-contracts", teacherId];
  const { data: contracts = [], isPending } = useQuery({
    queryKey,
    queryFn: () => teacherContractService.adminList(teacherId),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey });

  const sendMutation = useMutation({
    mutationFn: (values: { period: [Dayjs, Dayjs]; note?: string }) =>
      teacherContractService.adminSend(teacherId, {
        effectiveFrom: values.period[0].startOf("day").toISOString(),
        expiresAt: values.period[1].endOf("day").toISOString(),
        note: values.note,
      }),
    onSuccess: () => {
      message.success("Đã phát hành và gửi hợp đồng điện tử cho giáo viên ký");
      setIsSendOpen(false);
      sendForm.resetFields();
      refresh();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const retryMutation = useMutation({
    mutationFn: () =>
      teacherContractService.adminRetry(
        teacherId,
        "Đồng bộ / Khởi tạo lại hợp đồng cộng tác giảng dạy từ trang thẩm định Admin"
      ),
    onSuccess: (res) => {
      message.success(
        res.outcome === "CREATED"
          ? `Đã tự động tạo hợp đồng ${res.contract.contractCode} thành công!`
          : `Đã đồng bộ hợp đồng hiện hành (${res.contract.contractCode}) và tệp PDF.`
      );
      refresh();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const endMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      teacherContractService.adminEnd(id, reason),
    onSuccess: () => {
      message.success("Đã cập nhật trạng thái hợp đồng");
      setEnding(null);
      endForm.resetFields();
      refresh();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const handleDownloadPdf = async (contractId: string, version: "initial" | "signed") => {
    const key = `${contractId}-${version}`;
    setDownloadingKey(key);
    try {
      const info = await teacherContractService.adminGetPdf(contractId, version);
      if (info.url) {
        window.open(info.url, "_blank", "noopener,noreferrer");
      } else {
        message.error("Không thể tạo đường dẫn tải tệp PDF.");
      }
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, "Tải tệp PDF thất bại."));
    } finally {
      setDownloadingKey(null);
    }
  };

  const hasPending = contracts.some((c) => c.status === "PENDING_SIGNATURE");

  return (
    <Card
      className="rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border-[#D6E5E2]"
      title={
        <span className="font-bold flex items-center gap-2">
          <FileProtectOutlined className="text-teal-700" /> Hợp đồng cộng tác giảng dạy (eContract)
        </span>
      }
      extra={
        <Space size="small" wrap>
          {isVerified && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
              className="rounded-xl text-xs"
            >
              {contracts.length === 0 ? "Tạo hợp đồng tự động" : "Đồng bộ / Kiểm tra PDF"}
            </Button>
          )}
          <Button
            type="primary"
            size="small"
            disabled={!isVerified || hasPending}
            onClick={() => setIsSendOpen(true)}
            className="rounded-xl text-xs"
          >
            Phát hành hợp đồng mới
          </Button>
        </Space>
      }
      loading={isPending}
    >
      {!isVerified && (
        <div className="text-xs text-gray-500 mb-3">
          Khi Admin nhấn <strong>Phê duyệt</strong> hồ sơ giáo viên, hệ thống sẽ tự động tạo hợp đồng điện tử cá nhân hóa (90% Giáo viên / 10% Edunity) và gửi cho giáo viên ký.
        </div>
      )}
      {contracts.length === 0 ? (
        <Empty description="Chưa có hợp đồng giảng dạy" />
      ) : (
        <div className="flex flex-col gap-3">
          {contracts.map((contract) => {
            const meta = CONTRACT_STATUS_META[contract.status];
            return (
              <div
                key={contract.id}
                className="rounded-xl border border-[#D6E5E2] bg-[#F5FAF9]/60 p-3.5 flex flex-col gap-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold font-mono text-sm text-[#163B40]">
                      {contract.contractCode}
                    </span>
                    <Tag color={meta.color} className="!m-0 font-bold text-xs">
                      {meta.label} ({contract.lifecycleStatus || meta.lifecycleLabel})
                    </Tag>
                    <Tag color="teal" className="!m-0 text-xs">
                      {contract.revenueSharing?.teacherSharePercent ?? 90}% GV /{" "}
                      {contract.revenueSharing?.platformSharePercent ?? 10}% Edunity
                    </Tag>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => setViewingContractId(contract.id)}
                      className="rounded-lg text-xs font-semibold"
                    >
                      Xem chi tiết & PDF
                    </Button>
                    {contract.hasInitialPdf && (
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={downloadingKey === `${contract.id}-initial`}
                        onClick={() => void handleDownloadPdf(contract.id, "initial")}
                        className="rounded-lg text-xs"
                      >
                        PDF ban đầu
                      </Button>
                    )}
                    {contract.hasSignedPdf && (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<DownloadOutlined />}
                        loading={downloadingKey === `${contract.id}-signed`}
                        onClick={() => void handleDownloadPdf(contract.id, "signed")}
                        className="rounded-lg text-xs font-semibold"
                      >
                        PDF đã ký
                      </Button>
                    )}
                    {contract.verificationCode && (
                      <Link
                        to={`/contracts/verify/${encodeURIComponent(contract.verificationCode)}`}
                        target="_blank"
                      >
                        <Button
                          size="small"
                          icon={<SafetyCertificateOutlined />}
                          className="rounded-lg text-xs"
                        >
                          Xác minh
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    Hiệu lực: <strong>{formatDate(contract.effectiveFrom)}</strong> →{" "}
                    <strong>{formatDate(contract.expiresAt)}</strong>
                  </span>
                  <span>· Phát hành: {formatDateTime(contract.sentAt)}</span>
                  {contract.signedAt && (
                    <span className="text-emerald-700 font-semibold">
                      · Giáo viên đã ký: {formatDateTime(contract.signedAt)}
                    </span>
                  )}
                  {contract.verificationCode && (
                    <span>
                      · Mã xác minh: <strong className="font-mono">{contract.verificationCode}</strong>
                    </span>
                  )}
                </div>

                {contract.documentHash && (
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    SHA-256: {contract.documentHash}
                  </div>
                )}

                {contract.terminationReason && (
                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                    Lý do: {contract.terminationReason}
                  </div>
                )}

                {(contract.status === "ACTIVE" ||
                  contract.status === "SIGNED" ||
                  contract.status === "PENDING_SIGNATURE") && (
                  <div>
                    <Button
                      size="small"
                      danger
                      className="rounded-lg text-xs"
                      onClick={() => setEnding(contract)}
                    >
                      {contract.status === "PENDING_SIGNATURE"
                        ? "Huỷ yêu cầu ký"
                        : "Chấm dứt hợp đồng"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title="Phát hành hợp đồng cộng tác giảng dạy"
        open={isSendOpen}
        onCancel={() => setIsSendOpen(false)}
        onOk={() => sendForm.submit()}
        okText="Tạo PDF & Gửi để ký"
        confirmLoading={sendMutation.isPending}
      >
        <Form
          form={sendForm}
          layout="vertical"
          initialValues={{ period: [dayjs(), dayjs().add(12, "month")] }}
          onFinish={(values) => sendMutation.mutate(values)}
        >
          <Form.Item
            name="period"
            label="Thời hạn hợp đồng"
            rules={[{ required: true, message: "Chọn thời hạn" }]}
          >
            <DatePicker.RangePicker
              className="w-full"
              format="DD/MM/YYYY"
              disabledDate={(d) => d.isBefore(dayjs(), "day")}
            />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú (không bắt buộc)">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={ending?.status === "PENDING_SIGNATURE" ? "Huỷ yêu cầu ký" : "Chấm dứt hợp đồng"}
        open={!!ending}
        onCancel={() => setEnding(null)}
        onOk={() => endForm.submit()}
        okButtonProps={{ danger: true }}
        confirmLoading={endMutation.isPending}
      >
        <p className="text-sm text-gray-600">
          Giáo viên sẽ không thể mở lớp mới khi không còn hợp đồng hiệu lực. Các lớp đang dạy không bị ảnh hưởng.
        </p>
        <Form
          form={endForm}
          layout="vertical"
          onFinish={({ reason }) => ending && endMutation.mutate({ id: ending.id, reason })}
        >
          <Form.Item
            name="reason"
            label="Lý do"
            rules={[{ required: true, whitespace: true, message: "Nhập lý do" }]}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <TeacherContractDetailModal
        contractId={viewingContractId}
        audience="ADMIN"
        open={Boolean(viewingContractId)}
        onClose={() => setViewingContractId(null)}
        onSignedOrUpdated={refresh}
      />
    </Card>
  );
}
