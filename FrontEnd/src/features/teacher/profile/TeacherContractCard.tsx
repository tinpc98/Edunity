import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App as AntdApp, Button, Skeleton, Tag } from "antd";
import {
  CheckCircleFilled,
  ClockCircleFilled,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileProtectOutlined,
  InfoCircleFilled,
  SafetyCertificateOutlined,
  UpOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import {
  CONTRACT_STATUS_META,
  teacherContractService,
  type TeacherContract,
} from "../../../services/teacherContract.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import TeacherContractDetailModal from "./components/TeacherContractDetailModal";

const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "—");
const formatDateTime = (value?: string | null) =>
  value ? dayjs(value).format("HH:mm DD/MM/YYYY") : "—";

export default function TeacherContractCard() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState<boolean>(false);

  const {
    data: contracts = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["teacher-contracts"],
    queryFn: teacherContractService.listMine,
  });

  const handleDownloadPdf = async (contract: TeacherContract, version: "initial" | "signed") => {
    const key = `${contract.id}-${version}`;
    setDownloadingKey(key);
    try {
      const info = await teacherContractService.getMyPdf(contract.id, version);
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

  if (isPending) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (isError) {
    return (
      <div className="text-sm text-rose-600">
        Không tải được danh sách hợp đồng cộng tác giảng dạy.
      </div>
    );
  }

  const pendingContract = contracts.find((c) => c.status === "PENDING_SIGNATURE");
  const activeContract = contracts.find((c) => c.status === "ACTIVE" || c.status === "SIGNED");
  const primaryContract = pendingContract || activeContract || contracts[0];

  const renderToggleDetailButton = () => (
    <Button
      size="small"
      icon={isDetailsExpanded ? <UpOutlined /> : <DownOutlined />}
      onClick={() => setIsDetailsExpanded((prev) => !prev)}
      className="rounded-xl text-xs font-semibold shrink-0 bg-white/90 hover:bg-white border-slate-200 text-slate-700"
    >
      {isDetailsExpanded ? "Thu gọn" : "Xem chi tiết"}
    </Button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="m-0 text-sm font-bold text-slate-800 flex items-center gap-2">
          <FileProtectOutlined className="text-teal-600" />
          Hợp đồng cộng tác giảng dạy điện tử (eContract)
        </h4>
      </div>

      {pendingContract && (
        <Alert
          type="warning"
          showIcon
          icon={<ClockCircleFilled />}
          className="rounded-xl"
          message={`Bạn có hợp đồng ${pendingContract.contractCode} đang chờ đọc và ký xác nhận điện tử`}
          description={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1.5">
              <span className="text-xs text-slate-700">
                Hồ sơ xác minh của bạn đã được phê duyệt. Vui lòng mở hợp đồng, đọc toàn bộ 09 điều khoản và ký điện tử để kích hoạt quyền tạo lớp học.
              </span>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {renderToggleDetailButton()}
                <Button
                  type="primary"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setSelectedContractId(pendingContract.id)}
                  className="bg-teal-600 hover:bg-teal-700 font-bold text-xs rounded-xl shrink-0"
                >
                  Đọc & Ký hợp đồng ngay
                </Button>
              </div>
            </div>
          }
        />
      )}

      {!pendingContract && activeContract && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleFilled />}
          className="rounded-xl"
          message={`Hợp đồng ${activeContract.contractCode} đã được ký và đang có hiệu lực`}
          description={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
              <span className="text-xs text-slate-700">
                Bạn đã đủ điều kiện hợp đồng để mở lớp học trực tuyến trên Edunity (Hiệu lực đến{" "}
                {formatDate(activeContract.expiresAt)}).
              </span>
              {renderToggleDetailButton()}
            </div>
          }
        />
      )}

      {!pendingContract && !activeContract && primaryContract && (
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleFilled />}
          className="rounded-xl"
          message={`Hợp đồng gần nhất: ${primaryContract.contractCode} (${CONTRACT_STATUS_META[primaryContract.status].label})`}
          description={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
              <span className="text-xs text-slate-700">
                Bạn hiện chưa có hợp đồng đang hiệu lực để mở lớp mới. Nhấn xem chi tiết để tra cứu lịch sử hợp đồng.
              </span>
              {renderToggleDetailButton()}
            </div>
          }
        />
      )}

      {contracts.length === 0 ? (
        <p className="text-sm text-slate-500 m-0">
          Bạn chưa có hợp đồng cộng tác giảng dạy. Hệ thống sẽ tự động khởi tạo hợp đồng điện tử ngay khi Quản trị viên phê duyệt hồ sơ xác minh của bạn.
        </p>
      ) : isDetailsExpanded ? (
        <div className="space-y-3 animate-fadeIn">
          {contracts.map((contract) => {
            const meta = CONTRACT_STATUS_META[contract.status];
            const isPendingSig = contract.status === "PENDING_SIGNATURE";
            const isSigned = contract.status === "ACTIVE" || contract.status === "SIGNED";

            return (
              <div
                key={contract.id}
                className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${isPendingSig
                  ? "border-amber-300 bg-amber-50/30"
                  : isSigned
                    ? "border-teal-200 bg-teal-50/20"
                    : "border-slate-200 bg-slate-50"
                  }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 font-mono">
                      {contract.contractCode}
                    </span>
                    <Tag color={meta.color} className="!m-0 font-bold text-xs">
                      {meta.label} ({contract.lifecycleStatus || meta.lifecycleLabel})
                    </Tag>
                    <Tag color="cyan" className="!m-0 text-xs font-medium">
                      90% GV / 10% Edunity
                    </Tag>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isPendingSig ? (
                      <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setSelectedContractId(contract.id)}
                        className="bg-teal-600 hover:bg-teal-700 rounded-lg text-xs font-bold"
                      >
                        Mở & Ký hợp đồng
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => setSelectedContractId(contract.id)}
                        className="rounded-lg text-xs font-semibold"
                      >
                        Xem chi tiết & PDF
                      </Button>
                    )}

                    {contract.hasInitialPdf && (
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={downloadingKey === `${contract.id}-initial`}
                        onClick={() => void handleDownloadPdf(contract, "initial")}
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
                        onClick={() => void handleDownloadPdf(contract, "signed")}
                        className="rounded-lg text-xs font-semibold"
                      >
                        PDF hoàn tất (Đã ký)
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

                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    Hiệu lực: <strong>{formatDate(contract.effectiveFrom)}</strong> →{" "}
                    <strong>{formatDate(contract.expiresAt)}</strong>
                  </span>
                  <span>Phát hành: {formatDateTime(contract.sentAt)}</span>
                  {contract.signedAt && (
                    <span className="text-emerald-700 font-semibold">
                      Đã ký lúc: {formatDateTime(contract.signedAt)}
                    </span>
                  )}
                  {contract.verificationCode && (
                    <span>
                      Mã xác minh: <strong className="font-mono">{contract.verificationCode}</strong>
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
                    <strong>Lý do chấm dứt / từ chối:</strong> {contract.terminationReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <TeacherContractDetailModal
        contractId={selectedContractId}
        audience="TEACHER"
        open={Boolean(selectedContractId)}
        onClose={() => setSelectedContractId(null)}
        onSignedOrUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ["teacher-contracts"] });
        }}
      />
    </div>
  );
}
