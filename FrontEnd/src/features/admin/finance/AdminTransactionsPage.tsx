import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Select,
  Input,
  Modal,
  Descriptions,
  Tooltip,
  Alert,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileTextOutlined,
  ReloadOutlined,
  EyeOutlined,
  SearchOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { Transaction, TransactionType, TransactionStatus } from "../../../types/payment";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  formatVND,
} from "../../../types/payment";

const { Title, Text } = Typography;

const getUserDisplayName = (user: any): string => {
  if (!user) return "";
  if (typeof user === "string") return user;
  if (user.studentProfile?.fullName) return user.studentProfile.fullName;
  if (user.teacherProfile?.fullName) return user.teacherProfile.fullName;
  if (user.sponsorProfile?.representativeName) return user.sponsorProfile.representativeName;
  if (user.sponsorProfile?.organizationName) return user.sponsorProfile.organizationName;
  if (user.fullName) return user.fullName;
  return user.email || "";
};

const getUserEmail = (user: any): string => {
  if (!user || typeof user === "string") return "";
  return user.email || "";
};

const getReferenceCode = (record: Transaction): string => {
  if (record.refundCase?.caseNumber) {
    return record.refundCase.caseNumber;
  }
  if (record.orderCode) {
    return `#${record.orderCode}`;
  }
  const relPaymentOrder = record.relatedPaymentId?.orderCode;
  if (relPaymentOrder) {
    return `#${relPaymentOrder}`;
  }
  const relBankOrder = record.relatedBankEventId?.orderCode;
  if (relBankOrder) {
    return `#${relBankOrder}`;
  }
  const relContribOrder = record.relatedContributionId?.orderCode;
  if (relContribOrder) {
    return `#${relContribOrder}`;
  }
  const idStr = record.id || record._id || "";
  if (idStr) {
    return `TX-${idStr.slice(-8).toUpperCase()}`;
  }
  return "—";
};

export default function AdminTransactionsPage() {
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(15);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [orderCode, setOrderCode] = useState<string>("");
  const [orderCodeInput, setOrderCodeInput] = useState<string>("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: financeKeys.adminTransactions({
      page,
      limit,
      type: typeFilter,
      status: statusFilter,
      orderCode,
    }),
    queryFn: () =>
      financeService.getAdminTransactions({
        page,
        limit,
        type: typeFilter,
        status: statusFilter,
        orderCode,
      }),
  });

  const transactions = data?.items || [];
  const total = data?.total || 0;

  const handleSearch = () => {
    setOrderCode(orderCodeInput.trim());
    setPage(1);
  };

  const handleReset = () => {
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setOrderCode("");
    setOrderCodeInput("");
    setPage(1);
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    message.success(`Đã sao chép ${label}: ${text}`);
  };

  // 6 columns: Mã tham chiếu, Loại giao dịch, Số tiền, Trạng thái, Thời gian, Chi tiết
  const columns: ColumnsType<Transaction> = [
    {
      title: "Mã tham chiếu",
      key: "referenceCode",
      width: 190,
      render: (_, record) => {
        const refCode = getReferenceCode(record);
        const isOrderNumber = refCode.startsWith("#");
        const isRefundCase = refCode.startsWith("REF-");
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className={`font-mono text-xs font-bold ${
                isRefundCase
                  ? "text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200"
                  : isOrderNumber
                  ? "text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200"
                  : "text-slate-700"
              }`}
            >
              {refCode}
            </span>
            <Tooltip title="Sao chép mã tham chiếu">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined className="text-slate-400 hover:text-teal-600 text-xs" />}
                className="!h-5 !w-5 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(refCode.replace(/^#/, ""), "mã tham chiếu");
                }}
              />
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: "Loại giao dịch",
      dataIndex: "transactionType",
      key: "transactionType",
      width: 180,
      render: (type: TransactionType) => (
        <Tag color={TRANSACTION_TYPE_COLORS[type] || "blue"} className="font-semibold text-xs whitespace-nowrap">
          {TRANSACTION_TYPE_LABELS[type] || type}
        </Tag>
      ),
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      width: 170,
      render: (amount: number, record) => {
        const isRefundPending = record.transactionType === "REFUND" && record.status === "PENDING";
        const isDisbursed =
          record.transactionType === "TEACHER_PAYOUT" ||
          (record.transactionType === "REFUND" && record.status === "COMPLETED");

        if (isRefundPending) {
          return (
            <div className="text-right whitespace-nowrap">
              <span className="font-bold text-sm text-amber-700">
                {formatVND(amount)}
              </span>
              <span className="block text-[11px] font-medium text-amber-600">
                cần hoàn
              </span>
            </div>
          );
        }

        if (isDisbursed) {
          return (
            <span className="font-bold text-sm text-rose-600 whitespace-nowrap">
              - {formatVND(amount)}
            </span>
          );
        }

        return (
          <span className="font-bold text-sm text-emerald-600 whitespace-nowrap">
            + {formatVND(amount)}
          </span>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      align: "center",
      width: 150,
      render: (status: TransactionStatus, record) => {
        if (record.transactionType === "REFUND" && status === "PENDING") {
          return (
            <Tag color="gold" className="font-medium whitespace-nowrap" icon={<ClockCircleOutlined />}>
              Chờ hoàn tiền
            </Tag>
          );
        }
        if (status === "COMPLETED") {
          return (
            <Tag color="green" className="font-medium whitespace-nowrap" icon={<CheckCircleOutlined />}>
              Hoàn tất
            </Tag>
          );
        }
        if (status === "PENDING") {
          return (
            <Tag color="gold" className="font-medium whitespace-nowrap" icon={<ClockCircleOutlined />}>
              Đang xử lý
            </Tag>
          );
        }
        return (
          <Tag color="red" className="font-medium whitespace-nowrap" icon={<ExclamationCircleOutlined />}>
            Thất bại
          </Tag>
        );
      },
    },
    {
      title: "Thời gian",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (date: string) => {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        return (
          <span className="text-xs text-slate-600 whitespace-nowrap">
            {`${day}/${month}/${year} ${hours}:${minutes}`}
          </span>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      align: "center",
      width: 100,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          size="small"
          className="text-teal-700 hover:text-teal-900 hover:bg-teal-50"
          onClick={() => setSelectedTx(record)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  // Helper for context-aware detail modal
  const renderDetailModalContent = (tx: Transaction) => {
    const rawId = tx.id || tx._id || "";
    const originalOrderCode =
      tx.orderCode ||
      tx.relatedPaymentId?.orderCode ||
      tx.relatedBankEventId?.orderCode;

    const sourceName = getUserDisplayName(tx.sourceUser) || "Hệ thống";
    const sourceEmail = getUserEmail(tx.sourceUser);
    const destName = getUserDisplayName(tx.destinationUser);
    const destEmail = getUserEmail(tx.destinationUser);

    const bankRef =
      tx.relatedBankEventId?.providerReference ||
      tx.refundCase?.beneficiaryBankAccount?.accountNumber;

    if (tx.transactionType === "REFUND") {
      const isPending = tx.status === "PENDING";
      const rc = tx.refundCase;
      const recipientName =
        getUserDisplayName(rc?.recipientUserId) ||
        sourceName ||
        "Học viên";
      const recipientEmail =
        getUserEmail(rc?.recipientUserId) ||
        sourceEmail;
      const bankInfo = rc?.beneficiaryBankAccount
        ? `${rc.beneficiaryBankAccount.bankName} - ${rc.beneficiaryBankAccount.accountNumber} (${rc.beneficiaryBankAccount.accountHolderName})`
        : null;

      return (
        <div className="space-y-4 pt-1">
          {isPending ? (
            <Alert
              message="Chưa thực hiện chuyển tiền hoàn"
              description="Khoản tiền hoàn đang trong hàng đợi xử lý của kế toán/admin, chưa phát sinh dòng tiền ra khỏi tài khoản ngân hàng."
              type="warning"
              showIcon
              className="bg-amber-50 border-amber-200 text-amber-900"
            />
          ) : (
            <Alert
              message="Đã hoàn tất chuyển tiền hoàn"
              description="Khoản tiền đã được hoàn trả thành công tới tài khoản ngân hàng của học viên."
              type="success"
              showIcon
              className="bg-emerald-50 border-emerald-200 text-emerald-900"
            />
          )}

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Mã hồ sơ hoàn tiền">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-purple-700">
                  {rc?.caseNumber || "REF-PENDING"}
                </span>
                {rc?.caseNumber && (
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(rc.caseNumber, "mã hồ sơ")}
                  >
                    Sao chép
                  </Button>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Mã đơn thanh toán gốc">
              <span className="font-mono font-bold text-teal-700">
                {originalOrderCode ? `#${originalOrderCode}` : "—"}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Mã bút toán nội bộ">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-700">{rawId}</span>
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(rawId, "mã bút toán")}
                >
                  Sao chép
                </Button>
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Số tiền hoàn">
              <span className="font-bold text-base text-amber-800">
                {formatVND(tx.amount)} {isPending ? "(cần hoàn)" : "(đã hoàn)"}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Lý do hoàn tiền">
              <span className="text-slate-800">
                {rc?.reasonDetails || "Thanh toán trùng lặp / thừa học phí"}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Bên có nghĩa vụ hoàn trả">
              <span className="font-medium text-slate-800">Nền tảng EDUNITY</span>
            </Descriptions.Item>
            <Descriptions.Item label="Người dự kiến nhận hoàn">
              <div>
                <span className="font-semibold text-slate-800">{recipientName}</span>
                {recipientEmail && (
                  <span className="text-slate-500 text-xs block">({recipientEmail})</span>
                )}
              </div>
            </Descriptions.Item>
            {bankInfo && (
              <Descriptions.Item label="Tài khoản thụ hưởng">
                <span className="font-mono text-xs font-semibold text-slate-800">{bankInfo}</span>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Trạng thái hoàn tiền">
              {isPending ? (
                <Tag color="gold" className="font-medium" icon={<ClockCircleOutlined />}>
                  Chờ hoàn tiền (Chưa chuyển tiền)
                </Tag>
              ) : (
                <Tag color="green" className="font-medium" icon={<CheckCircleOutlined />}>
                  Đã hoàn tất chuyển tiền
                </Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Thời gian ghi nhận">
              {new Date(tx.createdAt).toLocaleString("vi-VN")}
            </Descriptions.Item>
          </Descriptions>
        </div>
      );
    }

    if (tx.transactionType === "ENROLLMENT_PAYMENT") {
      const studentName = sourceName;
      const studentEmail = sourceEmail;
      const className =
        tx.relatedEnrollmentId?.classId?.className ||
        tx.relatedEnrollmentId?.classId?.title ||
        null;

      return (
        <div className="space-y-4 pt-1">
          <Alert
            message="Thanh toán học phí thành công"
            description="Khoản thu học phí trực tuyến đã được xác nhận thành công và tự động kích hoạt quyền học tập của học viên."
            type="success"
            showIcon
            className="bg-teal-50 border-teal-200 text-teal-900"
          />

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Mã đơn thanh toán">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-teal-700 text-sm">
                  {originalOrderCode ? `#${originalOrderCode}` : "—"}
                </span>
                {originalOrderCode && (
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(String(originalOrderCode), "mã đơn")}
                  >
                    Sao chép
                  </Button>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Mã bút toán nội bộ">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-700">{rawId}</span>
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(rawId, "mã bút toán")}
                >
                  Sao chép
                </Button>
              </div>
            </Descriptions.Item>
            {className && (
              <Descriptions.Item label="Lớp học">{className}</Descriptions.Item>
            )}
            <Descriptions.Item label="Người thanh toán (Học viên)">
              <div>
                <span className="font-semibold text-slate-800">{studentName}</span>
                {studentEmail && (
                  <span className="text-slate-500 text-xs block">({studentEmail})</span>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Số tiền đã thanh toán">
              <span className="font-bold text-base text-emerald-600">
                + {formatVND(tx.amount)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Bên tiếp nhận">
              <span className="font-medium text-slate-800">
                Tài khoản thu học phí EDUNITY
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color="green" icon={<CheckCircleOutlined />}>
                Hoàn tất
              </Tag>
            </Descriptions.Item>
            {tx.relatedBankEventId?.providerReference && (
              <Descriptions.Item label="Mã tham chiếu ngân hàng">
                <span className="font-mono text-xs">{tx.relatedBankEventId.providerReference}</span>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Thời gian ghi nhận">
              {new Date(tx.createdAt).toLocaleString("vi-VN")}
            </Descriptions.Item>
          </Descriptions>
        </div>
      );
    }

    if (tx.transactionType === "UNAPPLIED_TUITION_RECEIPT") {
      return (
        <div className="space-y-4 pt-1">
          <Alert
            message="Khoản thu học phí tạm giữ chờ đối soát"
            description="Khoản tiền học phí đã vào tài khoản ngân hàng nhưng đến sau khi đơn hết hạn hoặc sai lệch. Tiền đang được tạm giữ an toàn, chưa tự động kích hoạt lớp học."
            type="warning"
            showIcon
            className="bg-amber-50 border-amber-200 text-amber-900"
          />

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Mã đơn thanh toán">
              <span className="font-mono font-bold text-teal-700">
                {originalOrderCode ? `#${originalOrderCode}` : "—"}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Mã bút toán tạm giữ">
              <span className="font-mono text-xs text-slate-700">{rawId}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Người chuyển khoản">
              <div>
                <span className="font-semibold text-slate-800">{sourceName}</span>
                {sourceEmail && (
                  <span className="text-slate-500 text-xs block">({sourceEmail})</span>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Số tiền tạm giữ">
              <span className="font-bold text-base text-amber-700">
                + {formatVND(tx.amount)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Bên tạm giữ">
              <span className="font-medium text-slate-800">
                Tài khoản tạm giữ EDUNITY
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color="gold" icon={<ClockCircleOutlined />}>
                Chờ đối soát
              </Tag>
            </Descriptions.Item>
            {tx.relatedBankEventId?.providerReference && (
              <Descriptions.Item label="Mã tham chiếu ngân hàng">
                <span className="font-mono text-xs">{tx.relatedBankEventId.providerReference}</span>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Thời gian nhận tiền">
              {new Date(tx.createdAt).toLocaleString("vi-VN")}
            </Descriptions.Item>
          </Descriptions>
        </div>
      );
    }

    if (tx.transactionType === "SPONSOR_CONTRIBUTION") {
      return (
        <div className="space-y-4 pt-1">
          <Alert
            message="Đóng góp tài trợ học bổng"
            description="Khoản tài trợ từ nhà hảo tâm/doanh nghiệp đã được ghi nhận vào quỹ học bổng EDUNITY."
            type="info"
            showIcon
            className="bg-blue-50 border-blue-200 text-blue-900"
          />

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Mã giao dịch tài trợ">
              <span className="font-mono font-bold text-blue-700">
                {originalOrderCode ? `#${originalOrderCode}` : `TX-${rawId.slice(-8).toUpperCase()}`}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Mã bút toán nội bộ">
              <span className="font-mono text-xs text-slate-700">{rawId}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Nhà tài trợ">
              <div>
                <span className="font-semibold text-slate-800">{sourceName}</span>
                {sourceEmail && (
                  <span className="text-slate-500 text-xs block">({sourceEmail})</span>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Số tiền đóng góp">
              <span className="font-bold text-base text-emerald-600">
                + {formatVND(tx.amount)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Bên tiếp nhận">
              <span className="font-medium text-slate-800">
                Quỹ học bổng EDUNITY
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color="green" icon={<CheckCircleOutlined />}>
                Hoàn tất
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Thời gian">
              {new Date(tx.createdAt).toLocaleString("vi-VN")}
            </Descriptions.Item>
          </Descriptions>
        </div>
      );
    }

    if (tx.transactionType === "TEACHER_PAYOUT") {
      return (
        <div className="space-y-4 pt-1">
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Mã phiếu chi">
              <span className="font-mono text-xs text-slate-700">{rawId}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Bên chi trả">
              <span className="font-medium text-slate-800">Nền tảng EDUNITY</span>
            </Descriptions.Item>
            <Descriptions.Item label="Giảng viên nhận thù lao">
              <div>
                <span className="font-semibold text-slate-800">{destName || sourceName}</span>
                {(destEmail || sourceEmail) && (
                  <span className="text-slate-500 text-xs block">({destEmail || sourceEmail})</span>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Số tiền thù lao">
              <span className="font-bold text-base text-rose-600">
                - {formatVND(tx.amount)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={tx.status === "COMPLETED" ? "green" : "gold"}>
                {tx.status === "COMPLETED" ? "Đã chi trả" : "Đang xử lý"}
              </Tag>
            </Descriptions.Item>
            {bankRef && (
              <Descriptions.Item label="Tài khoản / Mã ngân hàng">
                <span className="font-mono text-xs">{bankRef}</span>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Thời gian">
              {new Date(tx.createdAt).toLocaleString("vi-VN")}
            </Descriptions.Item>
          </Descriptions>
        </div>
      );
    }

    // Default / SCHOLARSHIP_USAGE
    return (
      <div className="space-y-4 pt-1">
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Mã giao dịch">
            <span className="font-mono text-xs text-slate-700">{rawId}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Loại giao dịch">
            <Tag color={TRANSACTION_TYPE_COLORS[tx.transactionType] || "blue"}>
              {TRANSACTION_TYPE_LABELS[tx.transactionType] || tx.transactionType}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Học viên thụ hưởng">
            <div>
              <span className="font-semibold text-slate-800">{destName || sourceName}</span>
              {(destEmail || sourceEmail) && (
                <span className="text-slate-500 text-xs block">({destEmail || sourceEmail})</span>
              )}
            </div>
          </Descriptions.Item>
          <Descriptions.Item label="Nguồn cấp">
            <span className="font-medium text-slate-800">Quỹ học bổng EDUNITY</span>
          </Descriptions.Item>
          <Descriptions.Item label="Số tiền">
            <span className="font-bold text-base text-cyan-700">
              {formatVND(tx.amount)}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="Trạng thái">
            <Tag color="cyan">Hoàn tất</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Thời gian">
            {new Date(tx.createdAt).toLocaleString("vi-VN")}
          </Descriptions.Item>
        </Descriptions>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 font-bold text-slate-800">
            Lịch sử giao dịch tài chính
          </Title>
          <Text type="secondary" className="text-slate-500 text-sm">
            Theo dõi các khoản thu, chi, hoàn tiền và trạng thái xử lý các giao dịch trên EDUNITY.
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined spin={isFetching} />}
          onClick={() => refetch()}
          loading={isFetching}
          className="border-slate-300 text-slate-700 hover:text-teal-700 hover:border-teal-600"
        >
          Làm mới
        </Button>
      </div>

      {/* Filters Bar */}
      <Card bordered={false} className="shadow-sm rounded-xl border border-slate-200/80">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Mã tham chiếu:
            </label>
            <Input
              placeholder="Nhập mã đơn, mã hoàn tiền hoặc mã giao dịch..."
              value={orderCodeInput}
              onChange={(e) => setOrderCodeInput(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              className="rounded-lg"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Loại giao dịch:
            </label>
            <Select
              className="w-full rounded-lg"
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val);
                setPage(1);
              }}
              options={[
                { label: "Tất cả loại giao dịch", value: "ALL" },
                { label: "Thu học phí", value: "ENROLLMENT_PAYMENT" },
                { label: "Thu học phí chờ xử lý", value: "UNAPPLIED_TUITION_RECEIPT" },
                { label: "Nhận tài trợ", value: "SPONSOR_CONTRIBUTION" },
                { label: "Sử dụng học bổng", value: "SCHOLARSHIP_USAGE" },
                { label: "Chi trả giáo viên", value: "TEACHER_PAYOUT" },
                { label: "Hoàn tiền", value: "REFUND" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Trạng thái:
            </label>
            <Select
              className="w-full rounded-lg"
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              options={[
                { label: "Tất cả trạng thái", value: "ALL" },
                { label: "Hoàn tất", value: "COMPLETED" },
                { label: "Đang xử lý / Chờ hoàn tiền", value: "PENDING" },
                { label: "Thất bại", value: "FAILED" },
              ]}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              className="flex-1 bg-teal-600 hover:bg-teal-700 border-teal-600 rounded-lg font-medium"
            >
              Tìm kiếm
            </Button>
            <Button onClick={handleReset} className="rounded-lg">
              Đặt lại
            </Button>
          </div>
        </div>
      </Card>

      {/* Transactions Table */}
      <Card bordered={false} className="shadow-sm rounded-xl border border-slate-200/80 overflow-hidden">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={transactions}
          loading={isLoading}
          scroll={{ x: 910 }}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "15", "30", "50"],
            onChange: (p, l) => {
              setPage(p);
              setLimit(l);
            },
            showTotal: (t) => `Tổng cộng ${t} giao dịch`,
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-slate-800">
            <FileTextOutlined className="text-teal-600" />
            <span className="font-bold text-base">
              Chi tiết giao dịch {selectedTx ? getReferenceCode(selectedTx) : ""}
            </span>
          </div>
        }
        open={Boolean(selectedTx)}
        onCancel={() => setSelectedTx(null)}
        footer={[
          <Button
            key="close"
            type="primary"
            onClick={() => setSelectedTx(null)}
            className="bg-teal-600 hover:bg-teal-700 border-teal-600 font-medium"
          >
            Đóng
          </Button>,
        ]}
        width={680}
      >
        {selectedTx && renderDetailModalContent(selectedTx)}
      </Modal>
    </div>
  );
}
