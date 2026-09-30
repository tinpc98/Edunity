import { Modal, App as AntdApp } from "antd";
import { CloseOutlined, CaretRightOutlined } from "@ant-design/icons";
import type { SessionEntity, SessionStatus } from "../../../../types/classDiscovery";

export interface SessionWithNumber extends SessionEntity {
  sessionNumber: number;
}

interface SessionDetailModalProps {
  open: boolean;
  session: SessionWithNumber | null;
  onClose: () => void;
  onWatchRecording?: (session: SessionWithNumber) => void;
}

function formatRecordingDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "";
  }
}

function getNoRecordingMessage(status: SessionStatus): string {
  switch (status) {
    case "IN_PROGRESS":
      return "Bản ghi sẽ có sau khi buổi học kết thúc.";
    case "SCHEDULED":
      return "Chưa có bản ghi buổi học.";
    case "COMPLETED":
      return "Bản ghi buổi học chưa có sẵn.";
    case "CANCELLED":
      return "Không có bản ghi cho buổi học này.";
    default:
      return "Chưa có bản ghi buổi học.";
  }
}

export default function SessionDetailModal({
  open,
  session,
  onClose,
  onWatchRecording,
}: SessionDetailModalProps) {
  const { notification } = AntdApp.useApp();

  if (!session) return null;

  const recording = session.recording;
  const isRecordingAvailable = Boolean(recording && recording.status === "AVAILABLE");

  // Derive duration metadata text ONLY if actual durationSeconds exists
  const durationText =
    typeof recording?.durationSeconds === "number" && recording.durationSeconds > 0
      ? `${Math.round(recording.durationSeconds / 60)} phút`
      : "";

  // Derive recorded date metadata text ONLY if actual availableAt exists
  const dateFormatted = recording?.availableAt ? formatRecordingDate(recording.availableAt) : "";
  const dateText = dateFormatted ? `Ghi hình ngày ${dateFormatted}` : "";

  // Combine available metadata items without hardcoding or fabricating
  const metadataText = [durationText, dateText].filter(Boolean).join(" • ");

  const handleWatchRecordingClick = () => {
    if (onWatchRecording) {
      onWatchRecording(session);
    } else {
      notification.info({
        message: "Xem lại buổi học",
        description: `Bản ghi cho "${session.title}" đã sẵn sàng. Trình phát video (Video Player) đang được hoàn thiện theo lộ trình hệ thống.`,
        placement: "topRight",
      });
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      centered
      width={640}
      styles={{
        container: {
          borderRadius: "24px",
          padding: "26px 28px",
        },
      }}
      className="session-detail-modal"
    >
      <div className="flex flex-col">
        {/* ================= 1. HEADER: BUỔI X BADGE + CLOSE ICON ================= */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600">
            BUỔI {session.sessionNumber}
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
          >
            <CloseOutlined className="text-sm" />
          </button>
        </div>

        {/* ================= 2. SESSION TITLE ================= */}
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug sm:leading-tight mt-4 mb-5">
          {session.title}
        </h2>

        {/* ================= 3. SUBTLE DIVIDER ================= */}
        <div className="h-px bg-slate-100 mb-5" />

        {/* ================= 4. RECORDING SECTION ================= */}
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
            BẢN GHI BUỔI HỌC
          </span>

          {isRecordingAvailable ? (
            /* 4A. Compact Recording Row */
            <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* Left: Small square Edunity indigo play icon */}
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <CaretRightOutlined className="text-base translate-x-0.5" />
                </div>

                {/* Center: Title + Metadata if actually exists */}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 leading-snug truncate">
                    Buổi {session.sessionNumber} - Bản ghi buổi học
                  </div>

                  {metadataText && (
                    <div className="text-xs text-slate-500 mt-0.5 font-normal">
                      {metadataText}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Small Edunity indigo text action */}
              <button
                type="button"
                onClick={handleWatchRecordingClick}
                className="text-xs sm:text-sm font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer group focus:outline-none focus:underline"
              >
                <span>Xem lại buổi học</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </button>
            </div>
          ) : (
            /* 4B. Neutral No-Recording Message */
            <p className="text-sm text-slate-500 font-normal m-0 py-1">
              {getNoRecordingMessage(session.status)}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
