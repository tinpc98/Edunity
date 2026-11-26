import React, { useState } from "react";
import { Card, Typography, Button, Tag, Divider, message } from "antd";
import {
  CopyOutlined,
  EnvironmentOutlined,
  UserOutlined,
  PhoneOutlined,
  InboxOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

export interface PaperDossierInstructionCardProps {
  applicationCode?: string | null;
  compact?: boolean;
  className?: string;
}

export const PAPER_RECEIVER_INFO = {
  recipient: "Phạm Công Tin",
  phone: "0342582999",
  address:
    "Tòa nhà FPT Polytechnic, 13 phố Phan Tây Nhạc, phường Xuân Phương, TP. Hà Nội",
  organization: "Văn phòng Tuyển sinh & Quỹ Học bổng Edunity",
};

export const PaperDossierInstructionCard: React.FC<
  PaperDossierInstructionCardProps
> = ({ applicationCode, compact = false, className = "" }) => {
  const [copied, setCopied] = useState(false);

  const fullCopyText = `Người nhận: ${PAPER_RECEIVER_INFO.recipient}
Số điện thoại: ${PAPER_RECEIVER_INFO.phone}
Địa chỉ: ${PAPER_RECEIVER_INFO.address}
Đơn vị: ${PAPER_RECEIVER_INFO.organization}${
    applicationCode ? `\nMã hồ sơ (Ghi ngoài bì thư): ${applicationCode}` : ""
  }`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullCopyText);
      setCopied(true);
      message.success("Đã sao chép thông tin người nhận hồ sơ giấy!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      message.info(
        "Vui lòng chọn và sao chép thủ công thông tin người nhận bên dưới.",
      );
    }
  };

  return (
    <Card
      className={`rounded-2xl border-teal-200 bg-gradient-to-br from-teal-50/40 via-white to-slate-50 shadow-xs ${className}`}
      title={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-bold text-teal-900 flex items-center gap-2 text-sm sm:text-base">
            <InboxOutlined className="text-teal-600 text-lg" />
            Hướng dẫn nộp hồ sơ giấy (Bản cứng đối chiếu)
          </span>
          <Button
            size="small"
            icon={<CopyOutlined />}
            type={copied ? "primary" : "default"}
            onClick={handleCopy}
            className={`rounded-lg text-xs font-semibold ${
              copied
                ? "bg-emerald-600 border-none"
                : "border-teal-300 text-teal-700 hover:bg-teal-50"
            }`}
          >
            {copied ? "Đã sao chép!" : "Sao chép thông tin"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs sm:text-sm text-slate-700">
        {applicationCode && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <InfoCircleOutlined className="text-amber-600" />
              <span className="font-bold text-amber-900">
                Mã hồ sơ của bạn:
              </span>
              <Tag
                color="volcano"
                className="font-mono font-bold text-xs px-2 py-0.5 m-0 rounded-md"
              >
                {applicationCode}
              </Tag>
            </div>
            <Text className="text-amber-800 text-xs">
              ⚠️ <strong>Lưu ý quan trọng:</strong> Ghi rõ mã hồ sơ này ở góc
              trên bên ngoài bì thư gửi bưu điện.
            </Text>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <UserOutlined className="text-teal-600 mt-1" />
              <div>
                <span className="text-slate-400 text-xs block">
                  Người tiếp nhận:
                </span>
                <strong className="text-slate-900">
                  {PAPER_RECEIVER_INFO.recipient}
                </strong>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <PhoneOutlined className="text-teal-600 mt-1" />
              <div>
                <span className="text-slate-400 text-xs block">
                  Số điện thoại liên hệ:
                </span>
                <strong className="text-teal-700 font-mono text-sm">
                  {PAPER_RECEIVER_INFO.phone}
                </strong>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <EnvironmentOutlined className="text-teal-600 mt-1" />
              <div>
                <span className="text-slate-400 text-xs block">
                  Địa chỉ nhận hồ sơ:
                </span>
                <span className="text-slate-800 font-medium leading-relaxed">
                  {PAPER_RECEIVER_INFO.address}
                </span>
              </div>
            </div>
          </div>
        </div>

        {!compact && (
          <>
            <Divider className="my-3 border-slate-200" />

            <div className="space-y-2">
              <div className="font-bold text-slate-800 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                <FileTextOutlined className="text-teal-600" />
                Checklist các giấy tờ bản cứng cần gửi kèm trong phong bì:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <CheckCircleOutlined className="text-teal-600 shrink-0" />
                  <span>1. Bản sao công chứng CCCD học sinh (1 bản)</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <CheckCircleOutlined className="text-teal-600 shrink-0" />
                  <span>2. Bản sao công chứng CCCD người giám hộ (1 bản)</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <CheckCircleOutlined className="text-teal-600 shrink-0" />
                  <span>
                    3. Học bạ hoặc Bảng điểm học tập có dấu trường (1 bản)
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <CheckCircleOutlined className="text-teal-600 shrink-0" />
                  <span>
                    4. Giấy tờ chứng nhận hoàn cảnh / ưu tiên (nếu có nộp
                    online)
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-100 text-xs text-teal-800 space-y-1">
              <div>
                • <strong>Hình thức gửi:</strong> Gửi bảo đảm qua VNPost,
                Viettel Post hoặc nộp trực tiếp tại văn phòng.
              </div>
              <div>
                • <strong>Thời hạn tiếp nhận:</strong> Trong vòng 5 ngày làm
                việc kể từ khi kết thúc đợt nộp đơn online.
              </div>
              <div>
                • Sau khi gửi bưu điện, hãy bấm nút{" "}
                <strong>"Xác nhận đã gửi hồ sơ giấy"</strong> và nhập mã vận đơn
                để hệ thống theo dõi đối chiếu.
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

export default PaperDossierInstructionCard;
