import { useState } from "react";
import { Button, Modal, Image, Tag, Tooltip } from "antd";
import {
  FilePdfOutlined,
  FileImageOutlined,
  EyeOutlined,
  ExportOutlined,
  FileExclamationOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

export interface PrivateDocumentFile {
  storageKey?: string;
  side?: string;
  mimeType?: string;
  url?: string | null;
  urlExpiresAt?: string | null;
  originalName?: string;
  signedUrl?: string;
}

export interface PrivateDocumentCardProps {
  file: PrivateDocumentFile;
  title?: string;
  documentType?: string;
  variant?: "card" | "row";
  className?: string;
}

export default function PrivateDocumentCard({
  file,
  title,
  documentType,
  variant = "card",
  className = "",
}: PrivateDocumentCardProps) {
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // Normalize URL
  const viewUrl = file.url || file.signedUrl || null;

  // Determine file type
  const mime = file.mimeType?.toLowerCase() || "";
  const key = file.storageKey?.toLowerCase() || "";
  const urlLower = viewUrl?.toLowerCase() || "";

  const isPdf = mime.includes("pdf") || key.endsWith(".pdf") || urlLower.includes(".pdf");
  const isImage = mime.startsWith("image/") || /\.(jpe?g|png|webp)($|\?)/i.test(key) || /\.(jpe?g|png|webp)($|\?)/i.test(urlLower);

  const formatSide = (side?: string) => {
    switch (side) {
      case "FRONT":
        return "Mặt Trước";
      case "BACK":
        return "Mặt Sau";
      case "SINGLE":
        return "Tệp Đơn";
      default:
        return side || "";
    }
  };

  const sideLabel = formatSide(file.side);
  const displayTitle = title || (sideLabel ? `Tài liệu (${sideLabel})` : "Tài liệu đính kèm");

  // Fallback: No URL available (expired or missing)
  if (!viewUrl) {
    return (
      <div className={`border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 flex items-center gap-3.5 text-slate-400 ${className}`}>
        <div className="w-10 h-10 rounded-lg bg-slate-200/60 flex items-center justify-center shrink-0">
          <FileExclamationOutlined className="text-xl text-amber-500" />
        </div>
        <div className="overflow-hidden">
          <div className="text-xs font-semibold text-slate-600 truncate">{displayTitle}</div>
          <div className="text-[11px] text-slate-400">Tài liệu không khả dụng hoặc liên kết đã hết hạn</div>
        </div>
      </div>
    );
  }

  // Row / Compact Variant
  if (variant === "row") {
    return (
      <div className={`flex items-center justify-between p-3.5 border border-slate-200 rounded-xl bg-white hover:border-indigo-300 transition-all ${className}`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg ${isPdf ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>
            {isPdf ? <FilePdfOutlined /> : <FileImageOutlined />}
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-semibold text-slate-800 truncate">{displayTitle}</div>
            <div className="flex items-center gap-2 mt-0.5">
              {sideLabel && <Tag className="text-[10px] m-0 border-0 bg-slate-100 text-slate-600">{sideLabel}</Tag>}
              <span className="text-[11px] text-slate-400">{isPdf ? "Tệp PDF" : file.mimeType || "Hình ảnh"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPdf ? (
            <>
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setIsPdfModalOpen(true)}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                Xem PDF
              </Button>
              <Button
                size="small"
                icon={<ExportOutlined />}
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Mở trong tab mới"
              />
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Image
                src={viewUrl}
                alt={displayTitle}
                width={36}
                height={36}
                className="rounded object-cover"
                preview={{ mask: <EyeOutlined className="text-xs" /> }}
              />
            </div>
          )}
        </div>

        {/* PDF Preview Modal */}
        {isPdf && (
          <Modal
            title={<span className="font-bold flex items-center gap-2"><FilePdfOutlined className="text-rose-500" /> {displayTitle}</span>}
            open={isPdfModalOpen}
            onCancel={() => setIsPdfModalOpen(false)}
            width={880}
            footer={[
              <Button key="close" onClick={() => setIsPdfModalOpen(false)}>Đóng</Button>,
              <Button
                key="open"
                type="primary"
                icon={<ExportOutlined />}
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-indigo-600"
              >
                Mở trong tab mới
              </Button>,
            ]}
          >
            <div className="w-full h-[620px] bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
              <iframe
                src={viewUrl}
                title={displayTitle}
                className="w-full h-full border-none"
              />
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // Card Variant (Default)
  return (
    <div className={`border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between ${className}`}>
      {/* Top Preview Area */}
      <div className="relative bg-slate-50 border-b border-slate-100 min-h-[180px] flex items-center justify-center overflow-hidden">
        <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[11px] px-2 py-0.5 rounded-md font-semibold shadow-xs z-10 flex items-center gap-1">
          <CheckCircleOutlined /> Đã tải lên
        </div>

        {isPdf ? (
          <div className="flex flex-col items-center justify-center p-6 text-center gap-2">
            <div className="w-16 h-16 rounded-2xl bg-rose-100/70 text-rose-600 flex items-center justify-center text-3xl shadow-xs">
              <FilePdfOutlined />
            </div>
            <div className="text-xs font-semibold text-slate-700 mt-1 max-w-[200px] truncate">
              {file.originalName || displayTitle}
            </div>
            <div className="text-[10px] text-slate-400">Định dạng PDF</div>
          </div>
        ) : isImage ? (
          <div className="w-full h-[180px] flex items-center justify-center bg-slate-100">
            <Image
              src={viewUrl}
              alt={displayTitle}
              className="w-full h-[180px] object-cover"
              preview={{ mask: <div className="text-xs font-medium flex items-center gap-1"><EyeOutlined /> Phóng to</div> }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center gap-2">
            <FileExclamationOutlined className="text-3xl text-indigo-500" />
            <div className="text-xs font-semibold text-slate-700">{displayTitle}</div>
          </div>
        )}
      </div>

      {/* Bottom Metadata & Actions */}
      <div className="p-3 bg-white flex items-center justify-between gap-2">
        <div className="overflow-hidden">
          <div className="text-xs font-bold text-slate-800 truncate" title={displayTitle}>
            {displayTitle}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {sideLabel && (
              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {sideLabel}
              </span>
            )}
            {documentType && (
              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                {documentType}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isPdf ? (
            <>
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setIsPdfModalOpen(true)}
                className="text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                Xem PDF
              </Button>
              <Tooltip title="Mở trong tab mới">
                <Button
                  size="small"
                  icon={<ExportOutlined />}
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Mở trong tab mới">
              <Button
                size="small"
                type="text"
                icon={<ExportOutlined />}
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600"
              >
                Mở tab mới
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* PDF Modal */}
      {isPdf && (
        <Modal
          title={<span className="font-bold flex items-center gap-2"><FilePdfOutlined className="text-rose-500" /> {displayTitle}</span>}
          open={isPdfModalOpen}
          onCancel={() => setIsPdfModalOpen(false)}
          width={880}
          footer={[
            <Button key="close" onClick={() => setIsPdfModalOpen(false)}>Đóng</Button>,
            <Button
              key="open"
              type="primary"
              icon={<ExportOutlined />}
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-indigo-600"
            >
              Mở trong tab mới
            </Button>,
          ]}
        >
          <div className="w-full h-[620px] bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
            <iframe
              src={viewUrl}
              title={displayTitle}
              className="w-full h-full border-none"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
