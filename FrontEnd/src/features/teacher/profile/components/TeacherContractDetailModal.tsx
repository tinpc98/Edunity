import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  Descriptions,
  Input,
  Modal,
  Radio,
  Skeleton,
  Tabs,
  Tag,
  Timeline,
} from "antd";
import {
  CheckCircleFilled,
  CloseCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  FilePdfOutlined,
  FileProtectOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import {
  CONTRACT_STATUS_META,
  teacherContractService,
  type TeacherContractDetail,
} from "../../../../services/teacherContract.service";
import { getFriendlyErrorMessage } from "../../../../utils/apiErrorMap";
import SignaturePadCanvas from "./SignaturePadCanvas";

const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "—");
const formatDateTime = (value?: string | null) =>
  value ? dayjs(value).format("HH:mm DD/MM/YYYY") : "—";

const AUDIT_EVENT_LABELS: Record<string, string> = {
  CONTRACT_CREATED: "Khởi tạo hợp đồng tự động từ hồ sơ xác minh",
  CONTRACT_PDF_GENERATED: "Tạo tệp PDF hợp đồng & tính mã băm SHA-256",
  CONTRACT_SENT_TO_TEACHER: "Đưa hợp đồng lên trang Giáo viên chờ ký",
  CONTRACT_VIEWED: "Giáo viên mở xem chi tiết hợp đồng",
  CONTRACT_SIGNED: "Giáo viên hoàn tất ký xác nhận điện tử nội bộ",
  CONTRACT_PDF_DOWNLOADED: "Tải xuống tệp PDF hợp đồng",
  CONTRACT_REJECTED: "Giáo viên từ chối ký hợp đồng",
  CONTRACT_CANCELLED: "Quản trị viên hủy hợp đồng chờ ký",
  CONTRACT_TERMINATED: "Quản trị viên chấm dứt hiệu lực hợp đồng",
};

interface TeacherContractDetailModalProps {
  contractId: string | null;
  audience: "TEACHER" | "ADMIN";
  open: boolean;
  onClose: () => void;
  onSignedOrUpdated?: () => void;
}

export default function TeacherContractDetailModal({
  contractId,
  audience,
  open,
  onClose,
  onSignedOrUpdated,
}: TeacherContractDetailModalProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("document");
  const [signingMethod, setSigningMethod] = useState<"DRAWN_SIGNATURE" | "TYPED_SIGNATURE" | "CLICK_TO_SIGN">(
    "DRAWN_SIGNATURE"
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureText, setSignatureText] = useState<string>("");
  const [readConfirmed, setReadConfirmed] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isConfirmSignOpen, setIsConfirmSignOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);

  const detailQueryKey = ["contract-detail", audience, contractId];
  const {
    data: contract,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<TeacherContractDetail>({
    queryKey: detailQueryKey,
    queryFn: () =>
      audience === "ADMIN"
        ? teacherContractService.adminGetDetail(contractId as string)
        : teacherContractService.getMyDetail(contractId as string),
    enabled: open && Boolean(contractId),
  });

  const handleDownloadPdf = async (version: "initial" | "signed" | "latest") => {
    if (!contractId) return;
    setDownloadingVersion(version);
    try {
      const info =
        audience === "ADMIN"
          ? await teacherContractService.adminGetPdf(contractId, version)
          : await teacherContractService.getMyPdf(contractId, version);
      if (info.url) {
        window.open(info.url, "_blank", "noopener,noreferrer");
        void queryClient.invalidateQueries({ queryKey: detailQueryKey });
      } else {
        message.error("Không thể tạo đường dẫn tải tệp PDF.");
      }
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, "Tải tệp PDF thất bại."));
    } finally {
      setDownloadingVersion(null);
    }
  };

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!contractId) throw new Error("Không tìm thấy hợp đồng");
      return teacherContractService.signContract(contractId, {
        readConfirmed,
        agreedToTerms,
        signingMethod,
        signatureDataUrl: signingMethod === "DRAWN_SIGNATURE" ? signatureDataUrl : null,
        signatureText:
          signingMethod === "TYPED_SIGNATURE"
            ? signatureText.trim()
            : contract?.snapshot?.teacher?.fullName || null,
      });
    },
    onSuccess: (updated) => {
      message.success(
        `Đã ký hợp đồng ${updated.contractCode} thành công! Bản PDF hoàn tất đã sẵn sàng để tải xuống.`
      );
      setIsConfirmSignOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["teacher-contracts"] });
      void queryClient.invalidateQueries({ queryKey: detailQueryKey });
      onSignedOrUpdated?.();
    },
    onError: (err) => {
      message.error(getFriendlyErrorMessage(err, "Ký hợp đồng thất bại."));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!contractId) throw new Error("Không tìm thấy hợp đồng");
      return teacherContractService.rejectContract(contractId, rejectReason.trim() || undefined);
    },
    onSuccess: () => {
      message.info("Đã từ chối ký hợp đồng.");
      setIsRejectOpen(false);
      setRejectReason("");
      void queryClient.invalidateQueries({ queryKey: ["teacher-contracts"] });
      void queryClient.invalidateQueries({ queryKey: detailQueryKey });
      onSignedOrUpdated?.();
    },
    onError: (err) => {
      message.error(getFriendlyErrorMessage(err, "Từ chối ký hợp đồng thất bại."));
    },
  });

  const handleOpenConfirmSign = () => {
    if (!readConfirmed) {
      message.warning("Vui lòng tích xác nhận bạn đã đọc toàn bộ nội dung hợp đồng.");
      return;
    }
    if (!agreedToTerms) {
      message.warning("Vui lòng tích đồng ý với các điều khoản hợp đồng trước khi ký.");
      return;
    }
    if (signingMethod === "DRAWN_SIGNATURE" && !signatureDataUrl) {
      message.warning("Vui lòng vẽ chữ ký vào khung chữ ký hoặc chuyển sang phương thức ký khác.");
      return;
    }
    if (signingMethod === "TYPED_SIGNATURE" && !signatureText.trim()) {
      message.warning("Vui lòng nhập đầy đủ họ và tên chữ ký của bạn.");
      return;
    }
    setIsConfirmSignOpen(true);
  };

  const snap = contract?.snapshot;
  const statusMeta = contract ? CONTRACT_STATUS_META[contract.status] : null;
  const isSigned = contract?.status === "ACTIVE" || contract?.status === "SIGNED";
  const isPendingSignature = contract?.status === "PENDING_SIGNATURE";

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width={980}
        centered
        destroyOnHidden
        title={
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-lg">
                <FileProtectOutlined />
              </div>
              <div>
                <div className="text-base font-bold text-slate-900 leading-snug">
                  {contract?.contractTitle || "Hợp đồng cộng tác giảng dạy trực tuyến"}
                </div>
                <div className="text-xs text-slate-500 font-normal">
                  Mã hợp đồng: <strong className="font-mono text-slate-700">{contract?.contractCode || "—"}</strong>
                  {contract?.verificationCode && (
                    <>
                      {" "}
                      · Mã xác minh:{" "}
                      <Link
                        to={`/contracts/verify/${encodeURIComponent(contract.verificationCode)}`}
                        target="_blank"
                        className="font-mono text-teal-700 hover:underline"
                      >
                        {contract.verificationCode}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
            {statusMeta && (
              <Tag color={statusMeta.color} className="text-xs font-bold px-3 py-1 !m-0">
                {statusMeta.label} ({contract?.lifecycleStatus || statusMeta.lifecycleLabel})
              </Tag>
            )}
          </div>
        }
      >
        {isLoading ? (
          <div className="py-6">
            <Skeleton active paragraph={{ rows: 10 }} />
          </div>
        ) : isError || !contract ? (
          <Alert
            type="error"
            showIcon
            message="Không thể tải chi tiết hợp đồng"
            description={getFriendlyErrorMessage(error, "Vui lòng thử lại sau.")}
            action={
              <Button size="small" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
          />
        ) : (
          <div className="space-y-4 pt-2">
            {/* Top Summary & Download Bar */}
            <div className="rounded-2xl border border-[#D6E5E2] bg-[#F5FAF9] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    Thời hạn hiệu lực:{" "}
                    <strong className="text-slate-800">
                      {formatDate(contract.effectiveFrom)} → {formatDate(contract.expiresAt)}
                    </strong>
                  </span>
                  <span>
                    Phân chia doanh thu:{" "}
                    <strong className="text-teal-700">
                      {contract.revenueSharing?.teacherSharePercent ?? 90}% Giáo viên /{" "}
                      {contract.revenueSharing?.platformSharePercent ?? 10}% Edunity
                    </strong>
                  </span>
                  {contract.signedAt && (
                    <span>
                      Thời điểm ký: <strong className="text-emerald-700">{formatDateTime(contract.signedAt)}</strong>
                    </span>
                  )}
                </div>
                {contract.documentHash && (
                  <div className="text-[11px] text-slate-500 font-mono break-all">
                    SHA-256 ({isSigned ? "PDF Đã ký" : "PDF Chờ ký"}): {contract.documentHash}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {contract.hasInitialPdf && (
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    loading={downloadingVersion === "initial"}
                    onClick={() => void handleDownloadPdf("initial")}
                    className="rounded-xl text-xs font-medium"
                  >
                    Tải PDF ban đầu (Chờ ký)
                  </Button>
                )}
                {contract.hasSignedPdf && (
                  <Button
                    size="small"
                    type="primary"
                    icon={<DownloadOutlined />}
                    loading={downloadingVersion === "signed"}
                    onClick={() => void handleDownloadPdf("signed")}
                    className="bg-teal-600 hover:bg-teal-700 rounded-xl text-xs font-semibold"
                  >
                    Tải PDF hoàn tất (Đã ký)
                  </Button>
                )}
                {contract.verificationCode && (
                  <Link
                    to={`/contracts/verify/${encodeURIComponent(contract.verificationCode)}`}
                    target="_blank"
                  >
                    <Button size="small" icon={<SafetyCertificateOutlined />} className="rounded-xl text-xs">
                      Trang xác minh
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {isSigned && contract.signatureSummary && (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleFilled />}
                className="rounded-xl"
                message={`Hợp đồng đã được ký điện tử bởi ${contract.signatureSummary.signerName} vào lúc ${formatDateTime(
                  contract.signatureSummary.signedAt
                )}`}
                description={
                  <div className="text-xs text-slate-600 space-y-0.5 mt-1">
                    <div>
                      Phương thức ký: <strong>{contract.signatureSummary.signingMethod}</strong> · Mã xác minh:{" "}
                      <strong className="font-mono">{contract.verificationCode}</strong>
                    </div>
                    {contract.signatureSummary.finalDocumentHash && (
                      <div className="font-mono text-[11px] break-all">
                        SHA-256 PDF hoàn tất: {contract.signatureSummary.finalDocumentHash}
                      </div>
                    )}
                  </div>
                }
              />
            )}

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: "document",
                  label: (
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <FileProtectOutlined /> Toàn văn Hợp đồng
                    </span>
                  ),
                  children: (
                    <div className="rounded-2xl border border-slate-200 bg-white max-h-[520px] overflow-y-auto p-2 shadow-inner">
                      {contract.renderedHtml ? (
                        <iframe
                          title={`Contract-${contract.contractCode}`}
                          srcDoc={contract.renderedHtml}
                          className="w-full h-[490px] border-0 rounded-xl"
                        />
                      ) : (
                        <div className="p-6 text-sm text-slate-600">
                          Không có bản xem trước HTML. Vui lòng chuyển sang tab Xem tệp PDF.
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  key: "pdf",
                  label: (
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <FilePdfOutlined /> Xem tệp PDF ({isSigned ? "Bản hoàn tất đã ký" : "Bản chờ ký"})
                    </span>
                  ),
                  children: (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          Đang hiển thị:{" "}
                          <strong className="text-slate-800">
                            {isSigned
                              ? contract.signedPdf?.fileName || "PDF hợp đồng hoàn tất sau ký"
                              : contract.initialPdf?.fileName || "PDF hợp đồng ban đầu chờ ký"}
                          </strong>
                        </span>
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => void handleDownloadPdf(isSigned ? "signed" : "initial")}
                        >
                          Mở PDF trong tab mới / Tải về
                        </Button>
                      </div>
                      {contract.currentPdfUrl ? (
                        <iframe
                          title={`PDF-${contract.contractCode}`}
                          src={contract.currentPdfUrl}
                          className="w-full h-[500px] rounded-xl border border-slate-200 bg-slate-100"
                        />
                      ) : (
                        <Alert
                          type="info"
                          showIcon
                          message="Nhấn nút Tải PDF ở trên để tải tệp PDF hợp đồng về máy."
                        />
                      )}
                    </div>
                  ),
                },
                {
                  key: "snapshot",
                  label: (
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <HistoryOutlined /> Dữ liệu Snapshot & Nhật ký Audit ({contract.auditLogs?.length || 0})
                    </span>
                  ),
                  children: (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                      {snap && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60">
                            <div className="text-xs font-bold text-teal-800 uppercase mb-2">
                              Snapshot Bên A (Tại thời điểm phát hành)
                            </div>
                            <Descriptions column={1} size="small">
                              <Descriptions.Item label="Công ty">{snap.company.companyName}</Descriptions.Item>
                              <Descriptions.Item label="Đại diện">
                                {snap.company.representativeName} ({snap.company.representativeTitle})
                              </Descriptions.Item>
                              <Descriptions.Item label="Mã số thuế">{snap.company.taxCode}</Descriptions.Item>
                              <Descriptions.Item label="Địa chỉ">{snap.company.address}</Descriptions.Item>
                              <Descriptions.Item label="Email">{snap.company.email}</Descriptions.Item>
                            </Descriptions>
                          </div>

                          <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60">
                            <div className="text-xs font-bold text-teal-800 uppercase mb-2">
                              Snapshot Bên B (Giáo viên)
                            </div>
                            <Descriptions column={1} size="small">
                              <Descriptions.Item label="Họ và tên">{snap.teacher.fullName}</Descriptions.Item>
                              <Descriptions.Item label="Mã GV">{snap.teacher.teacherCode}</Descriptions.Item>
                              <Descriptions.Item label="Email">{snap.teacher.email}</Descriptions.Item>
                              <Descriptions.Item label="CCCD">
                                {snap.teacher.idNumberMasked || "Đã xác minh"}
                              </Descriptions.Item>
                              <Descriptions.Item label="Chuyên môn">
                                {snap.teacher.specialtySummary || "—"}
                              </Descriptions.Item>
                            </Descriptions>
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-200 p-4 bg-white">
                        <div className="text-xs font-bold text-slate-800 uppercase mb-3">
                          Nhật ký kiểm toán hợp đồng (Contract Audit Trail)
                        </div>
                        {contract.auditLogs && contract.auditLogs.length > 0 ? (
                          <Timeline
                            items={contract.auditLogs.map((log, index) => ({
                              color:
                                log.eventType === "CONTRACT_SIGNED"
                                  ? "green"
                                  : log.eventType === "CONTRACT_REJECTED" ||
                                      log.eventType === "CONTRACT_CANCELLED" ||
                                      log.eventType === "CONTRACT_TERMINATED"
                                    ? "red"
                                    : "teal",
                              children: (
                                <div key={`${log.eventType}-${index}`} className="text-xs space-y-0.5">
                                  <div className="font-bold text-slate-800">
                                    {AUDIT_EVENT_LABELS[log.eventType] || log.eventType}{" "}
                                    <Tag className="!m-0 text-[10px]">{log.actorRole}</Tag>
                                  </div>
                                  <div className="text-slate-500">
                                    Thời gian: {formatDateTime(log.timestamp)}
                                    {log.signingMethod ? ` · Phương thức: ${log.signingMethod}` : ""}
                                  </div>
                                  {log.documentHash && (
                                    <div className="text-[11px] text-slate-400 font-mono break-all">
                                      SHA-256: {log.documentHash}
                                    </div>
                                  )}
                                </div>
                              ),
                            }))}
                          />
                        ) : (
                          <div className="text-xs text-slate-400">Chưa có bản ghi sự kiện.</div>
                        )}
                      </div>
                    </div>
                  ),
                },
              ]}
            />

            {/* Teacher Signing Panel */}
            {audience === "TEACHER" && isPendingSignature && (
              <div className="rounded-2xl border-2 border-teal-500/70 bg-teal-50/40 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-teal-950 m-0 flex items-center gap-2">
                      <EditOutlined className="text-teal-700" />
                      Khu vực ký xác nhận hợp đồng điện tử nội bộ Edunity
                    </h4>
                    <p className="text-xs text-slate-600 m-0 mt-0.5">
                      Vui lòng đọc kỹ toàn văn hợp đồng, chọn hình thức chữ ký và tích xác nhận đồng ý để hoàn tất ký kết.
                    </p>
                  </div>
                  <Tag color="teal" className="font-bold text-xs !m-0">
                    Doanh thu: 90% Giáo viên / 10% Edunity
                  </Tag>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Hình thức chữ ký điện tử:</div>
                  <Radio.Group
                    value={signingMethod}
                    onChange={(e) => setSigningMethod(e.target.value)}
                    className="flex flex-wrap gap-3"
                  >
                    <Radio value="DRAWN_SIGNATURE" className="text-xs font-medium">
                      Vẽ chữ ký tay (Signature Pad)
                    </Radio>
                    <Radio value="TYPED_SIGNATURE" className="text-xs font-medium">
                      Nhập họ tên chữ ký
                    </Radio>
                    <Radio value="CLICK_TO_SIGN" className="text-xs font-medium">
                      Ký xác nhận nhanh bằng tài khoản
                    </Radio>
                  </Radio.Group>
                </div>

                {signingMethod === "DRAWN_SIGNATURE" && (
                  <SignaturePadCanvas
                    onChange={setSignatureDataUrl}
                    disabled={signMutation.isPending}
                  />
                )}

                {signingMethod === "TYPED_SIGNATURE" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Nhập đầy đủ Họ và tên của bạn để xác nhận chữ ký:
                    </label>
                    <Input
                      value={signatureText}
                      onChange={(e) => setSignatureText(e.target.value)}
                      placeholder={snap?.teacher?.fullName || "Nhập họ và tên..."}
                      maxLength={120}
                      className="max-w-md rounded-xl font-semibold"
                    />
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <div>
                    <Checkbox
                      checked={readConfirmed}
                      onChange={(e) => setReadConfirmed(e.target.checked)}
                      className="text-xs text-slate-800 font-medium"
                    >
                      Tôi xác nhận đã đọc, hiểu rõ toàn bộ 09 điều khoản trong Hợp đồng cộng tác giảng dạy (bao gồm điều khoản phân chia doanh thu <strong>90% Giáo viên / 10% Edunity</strong>).
                    </Checkbox>
                  </div>
                  <div>
                    <Checkbox
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="text-xs text-slate-800 font-medium"
                    >
                      Tôi đồng ý giao kết hợp đồng điện tử nội bộ này trên nền tảng Edunity và hiểu rằng thao tác ký này sẽ được ghi nhận vào nhật ký kiểm toán cùng tệp PDF hoàn tất.
                    </Checkbox>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-teal-200/70">
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => setIsRejectOpen(true)}
                    disabled={signMutation.isPending || rejectMutation.isPending}
                    className="rounded-xl text-xs font-semibold"
                  >
                    Từ chối ký hợp đồng
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button onClick={onClose} className="rounded-xl text-xs">
                      Đóng
                    </Button>
                    <Button
                      type="primary"
                      size="large"
                      icon={<EditOutlined />}
                      onClick={handleOpenConfirmSign}
                      loading={signMutation.isPending}
                      className="bg-teal-600 hover:bg-teal-700 rounded-xl text-xs font-bold px-6 shadow-xs"
                    >
                      Xác nhận & Ký hợp đồng điện tử
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Final Confirmation Modal before Signing (Section 7.3) */}
      <Modal
        open={isConfirmSignOpen}
        onCancel={() => !signMutation.isPending && setIsConfirmSignOpen(false)}
        onOk={() => signMutation.mutate()}
        confirmLoading={signMutation.isPending}
        okText="Tôi đồng ý & Ký chính thức"
        cancelText="Kiểm tra lại"
        okButtonProps={{ className: "bg-teal-600 hover:bg-teal-700 font-bold rounded-xl" }}
        title={
          <div className="flex items-center gap-2 text-teal-800 font-bold">
            <SafetyCertificateOutlined />
            <span>Xác nhận ký hợp đồng cộng tác giảng dạy</span>
          </div>
        }
      >
        <div className="space-y-3 py-2 text-sm text-slate-700">
          <p className="m-0">
            Bạn đang thực hiện ký xác nhận điện tử cho hợp đồng{" "}
            <strong className="font-mono text-slate-900">{contract?.contractCode}</strong> giữa{" "}
            <strong>{snap?.company?.companyName || "Công ty TNHH Edunity"}</strong> (Đại diện:{" "}
            <strong>{snap?.company?.representativeName || "Ông Phạm Công Tin"}</strong>) và Giáo viên{" "}
            <strong>{snap?.teacher?.fullName}</strong>.
          </p>
          <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-xs space-y-1 text-teal-950">
            <div>
              • <strong>Tỷ lệ phân chia doanh thu:</strong> Giáo viên nhận <strong>90%</strong> / Edunity nhận{" "}
              <strong>10%</strong> doanh thu đủ điều kiện thực tế.
            </div>
            <div>
              • <strong>Thời hạn hiệu lực:</strong> {formatDate(contract?.effectiveFrom)} →{" "}
              {formatDate(contract?.expiresAt)}.
            </div>
            <div>
              • <strong>Tính bất biến sau khi ký:</strong> Sau khi nhấn ký, hợp đồng sẽ chuyển sang trạng thái{" "}
              <strong>Đã ký (SIGNED / ACTIVE)</strong>, tạo tệp PDF hoàn tất kèm mã băm SHA-256 và không thể chỉnh sửa nội dung.
            </div>
          </div>
        </div>
      </Modal>

      {/* Reject Confirmation Modal */}
      <Modal
        open={isRejectOpen}
        onCancel={() => !rejectMutation.isPending && setIsRejectOpen(false)}
        onOk={() => rejectMutation.mutate()}
        confirmLoading={rejectMutation.isPending}
        okText="Xác nhận từ chối ký"
        cancelText="Quay lại"
        okButtonProps={{ danger: true, className: "rounded-xl font-semibold" }}
        title="Từ chối ký hợp đồng giảng dạy"
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-slate-600 m-0">
            Nếu từ chối ký hợp đồng này, bạn sẽ chưa thể tạo lớp học mới cho đến khi Quản trị viên phát hành hợp đồng mới và bạn hoàn tất ký kết.
          </p>
          <Input.TextArea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Nhập lý do từ chối hoặc nội dung cần phản hồi với Quản trị viên (không bắt buộc)..."
            maxLength={1000}
            className="rounded-xl text-xs"
          />
        </div>
      </Modal>
    </>
  );
}
