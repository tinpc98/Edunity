import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Descriptions, Input, Skeleton, Tag, Upload } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  FileSearchOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  CONTRACT_STATUS_META,
  teacherContractService,
} from "../../services/teacherContract.service";
import { ROUTES } from "../../routes/routePaths";
import { getFriendlyErrorMessage } from "../../utils/apiErrorMap";

const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "—");
const formatDateTime = (value?: string | null) =>
  value ? dayjs(value).format("HH:mm DD/MM/YYYY") : "—";

async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function ContractVerificationPage() {
  const { code = "" } = useParams<{ code: string }>();
  const [hashInput, setHashInput] = useState("");
  const [submittedHash, setSubmittedHash] = useState<string | undefined>(undefined);
  const [computedFileName, setComputedFileName] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["public-contract-verify", code, submittedHash],
    queryFn: () => teacherContractService.verifyPublic(code, submittedHash),
    enabled: Boolean(code),
    retry: false,
  });

  const handleFileHashCheck = async (file: File) => {
    const sha256 = await computeFileSha256(file);
    setComputedFileName(file.name);
    setHashInput(sha256);
    setSubmittedHash(sha256);
  };

  const statusMeta = data ? CONTRACT_STATUS_META[data.status] : null;

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      <div className="bg-white rounded-2xl border border-[#D6E5E2] p-6 shadow-sm flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#E5F5F1] text-[#0F766E] flex items-center justify-center text-2xl shrink-0">
          <SafetyCertificateOutlined />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-[#0F766E]">
            Cổng xác minh tính toàn vẹn hợp đồng điện tử nội bộ Edunity
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#163B40] mt-0.5 mb-1">
            Tra cứu & Đối chiếu Hợp đồng Cộng tác Giảng dạy
          </h1>
          <p className="text-xs text-[#64748B] m-0">
            Trang xác minh công khai chỉ hiển thị thông tin trạng thái hợp đồng và mã băm SHA-256 an toàn, tuyệt đối không hiển thị dữ liệu định danh cá nhân (CCCD, địa chỉ, số điện thoại) của Giáo viên.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card className="rounded-2xl border-[#D6E5E2]">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : isError || !data ? (
        <Alert
          type="error"
          showIcon
          className="rounded-2xl"
          message="Không tìm thấy hợp đồng cần xác minh"
          description={getFriendlyErrorMessage(
            error,
            `Không tìm thấy hợp đồng nào khớp với mã "${code}". Vui lòng kiểm tra lại mã hợp đồng hoặc mã xác minh.`
          )}
          action={
            <Link to={ROUTES.HOME}>
              <Button size="small">Về trang chủ</Button>
            </Link>
          }
        />
      ) : (
        <>
          <Card
            className="rounded-2xl border-[#D6E5E2] shadow-2xs"
            title={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#163B40]">
                  Kết quả xác minh hợp đồng: {data.contractCode}
                </span>
                {statusMeta && (
                  <Tag color={statusMeta.color} className="font-bold !m-0">
                    {statusMeta.label} ({data.lifecycleStatus})
                  </Tag>
                )}
              </div>
            }
          >
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="Mã hợp đồng">
                <span className="font-mono font-bold">{data.contractCode}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Mã xác minh">
                <span className="font-mono font-semibold text-teal-700">{data.verificationCode}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Loại hợp đồng" span={2}>
                {data.contractTitle} ({data.contractType})
              </Descriptions.Item>
              <Descriptions.Item label="Bên A (Đơn vị phát hành)">
                {data.companyName}
              </Descriptions.Item>
              <Descriptions.Item label="Người đại diện Bên A">
                {data.companyRepresentative}
              </Descriptions.Item>
              <Descriptions.Item label="Bên B (Giáo viên - Đã ẩn PII)">
                {data.teacherDisplayNameMasked} {data.teacherCode ? `(${data.teacherCode})` : ""}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái ký">
                {data.signedAt ? `Đã ký lúc ${formatDateTime(data.signedAt)}` : "Đang chờ ký"}
              </Descriptions.Item>
              <Descriptions.Item label="Hiệu lực từ">
                {formatDate(data.effectiveFrom)}
              </Descriptions.Item>
              <Descriptions.Item label="Hiệu lực đến">
                {formatDate(data.expiresAt)}
              </Descriptions.Item>
              <Descriptions.Item label="SHA-256 hiện hành" span={2}>
                <span className="font-mono text-xs break-all">
                  {data.integrity.documentHash || "—"}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              {data.integrity.disclaimer}
            </div>
          </Card>

          <Card
            className="rounded-2xl border-[#D6E5E2] shadow-2xs"
            title={
              <span className="font-bold text-[#163B40] flex items-center gap-2">
                <FileSearchOutlined className="text-[#0D9488]" />
                Kiểm tra tính toàn vẹn tệp PDF hợp đồng (SHA-256)
              </span>
            }
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-600 m-0">
                Chọn tệp PDF hợp đồng đã tải về máy (hoặc dán mã băm SHA-256) để đối chiếu trực tiếp với mã băm gốc lưu trên hệ thống Edunity:
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Upload
                  accept=".pdf,application/pdf"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void handleFileHashCheck(file);
                    return false;
                  }}
                >
                  <Button icon={<UploadOutlined />} className="rounded-xl text-xs font-semibold">
                    Chọn tệp PDF để kiểm tra toàn vẹn
                  </Button>
                </Upload>
                {computedFileName && (
                  <span className="text-xs text-slate-500">
                    Tệp đã chọn: <strong>{computedFileName}</strong>
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  value={hashInput}
                  onChange={(e) => setHashInput(e.target.value)}
                  placeholder="Nhập hoặc dán chuỗi SHA-256 (64 ký tự hex)..."
                  className="font-mono text-xs rounded-xl"
                  allowClear
                />
                <Button
                  type="primary"
                  onClick={() => setSubmittedHash(hashInput.trim() || undefined)}
                  className="bg-teal-600 hover:bg-teal-700 rounded-xl text-xs font-semibold"
                >
                  Đối chiếu mã băm
                </Button>
              </div>

              {data.integrity.hashCheck && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    data.integrity.hashCheck.matched
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}
                >
                  {data.integrity.hashCheck.matched ? (
                    <CheckCircleFilled className="text-emerald-600 text-base mt-0.5" />
                  ) : (
                    <CloseCircleFilled className="text-rose-600 text-base mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {data.integrity.hashCheck.matched
                        ? `Tệp PDF hợp lệ và nguyên vẹn 100% (Khớp với bản ${
                            data.integrity.hashCheck.matchedVersion === "SIGNED"
                              ? "PDF hoàn tất sau khi ký"
                              : "PDF hợp đồng ban đầu"
                          })`
                        : "Mã băm SHA-256 KHÔNG khớp với bản ghi hợp đồng trên hệ thống Edunity"}
                    </div>
                    <div className="mt-0.5">
                      {data.integrity.hashCheck.matched
                        ? "Tệp PDF không bị chỉnh sửa kể từ thời điểm được hệ thống Edunity phát hành."
                        : "Tệp PDF có thể đã bị thay đổi hoặc không thuộc về hợp đồng này."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
