import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Select,
  Input,
  Space,
  Modal,
  Descriptions,
  Timeline,
  Alert,
  Tooltip,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AuditOutlined,
  ReloadOutlined,
  EyeOutlined,
  UserSwitchOutlined,
  FormOutlined,
  SearchOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { PaymentReconciliationItem } from "../../../types/payment";
import { formatVND } from "../../../types/payment";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function AdminReconciliationsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(15);
  const [status, setStatus] = useState<string>("ALL");
  const [reason, setReason] = useState<string>("ALL");
  const [channelKey, setChannelKey] = useState<string>("ALL");
  const [orderCode, setOrderCode] = useState<string>("");
  const [searchCodeInput, setSearchCodeInput] = useState<string>("");

  const [selectedRecord, setSelectedRecord] = useState<PaymentReconciliationItem | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState<boolean>(false);
  const [assigneeInput, setAssigneeInput] = useState<string>("me");
  const [assignNote, setAssignNote] = useState<string>("");

  const [noteModalVisible, setNoteModalVisible] = useState<boolean>(false);
  const [newNoteContent, setNewNoteContent] = useState<string>("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: financeKeys.adminReconciliations({
      page,
      limit,
      status,
      reason,
      channelKey,
      orderCode,
    }),
    queryFn: () =>
      financeService.getAdminReconciliations({
        page,
        limit,
        status,
        reason,
        channelKey,
        orderCode,
      }),
  });

  const reconciliations = data?.items || [];
  const total = data?.total || 0;

  const assignMutation = useMutation({
    mutationFn: ({ id, assignedTo, note }: { id: string; assignedTo: string; note: string }) =>
      financeService.assignReconciliation(id, { assignedTo, note }),
    onSuccess: (updated) => {
      message.success("Đã tiếp nhận và phân công xử lý thành công!");
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      setAssignModalVisible(false);
      setAssignNote("");
      if (selectedRecord && selectedRecord._id === updated._id) {
        setSelectedRecord(updated);
      }
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể phân công sự vụ");
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      financeService.addReconciliationNote(id, { note, action: "NOTE_ADDED" }),
    onSuccess: (updated) => {
      message.success("Đã thêm ghi chú kiểm toán thành công!");
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      setNoteModalVisible(false);
      setNewNoteContent("");
      if (selectedRecord && selectedRecord._id === updated._id) {
        setSelectedRecord(updated);
      }
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể thêm ghi chú");
    },
  });

  const handleSearch = () => {
    setOrderCode(searchCodeInput.trim());
    setPage(1);
  };

  const handleReset = () => {
    setStatus("ALL");
    setReason("ALL");
    setChannelKey("ALL");
    setOrderCode("");
    setSearchCodeInput("");
    setPage(1);
  };

  const columns: ColumnsType<PaymentReconciliationItem> = [
    {
      title: "Mã đơn (OrderCode)",
      dataIndex: "orderCode",
      key: "orderCode",
      render: (code: number | null) => (
        <span className="font-mono font-bold text-blue-600">{code || "N/A"}</span>
      ),
    },
    {
      title: "Lý do đối soát",
      dataIndex: "reason",
      key: "reason",
      render: (r: string) => {
        let color = "volcano";
        if (r === "LATE_PAYMENT_REVIEW" || r === "LATE_SUCCESS_AFTER_FAILED") color = "gold";
        else if (r === "AMOUNT_MISMATCH" || r === "UNMATCHED") color = "red";
        else if (r === "EXPIRED_PAYMENT") color = "orange";
        return <Tag color={color} className="font-semibold">{r}</Tag>;
      },
    },
    {
      title: "Kênh",
      dataIndex: "channelKey",
      key: "channelKey",
      render: (channel: string) => (
        <Tag color={channel === "TUITION" ? "blue" : "green"}>
          {channel === "TUITION" ? "Học phí" : "Tài trợ"}
        </Tag>
      ),
    },
    {
      title: "Số tiền nhận được",
      dataIndex: "receivedAmount",
      key: "receivedAmount",
      align: "right",
      render: (amount: number | string) => (
        <span className="font-semibold text-slate-800">{formatVND(amount)}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (st: string) => {
        let color = "default";
        if (st === "NEEDS_REVIEW") color = "volcano";
        else if (st === "IN_REVIEW") color = "blue";
        else if (st === "RESOLVED_APPROVED") color = "green";
        else if (st === "RESOLVED_REFUNDED") color = "purple";
        return <Tag color={color}>{st}</Tag>;
      },
    },
    {
      title: "Admin phụ trách",
      dataIndex: "assignedTo",
      key: "assignedTo",
      render: (admin: any) => {
        if (!admin) return <span className="text-slate-400 italic">Chưa phân công</span>;
        const name = admin.studentProfile?.fullName || admin.email || admin._id;
        return <span className="text-xs font-medium text-slate-700">{name}</span>;
      },
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (d: string) => <span className="text-xs text-slate-500">{new Date(d).toLocaleDateString("vi-VN")}</span>,
    },
    {
      title: "Thao tác",
      key: "actions",
      align: "center",
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setSelectedRecord(record)}
          >
            Chi tiết
          </Button>
          <Button
            size="small"
            icon={<UserSwitchOutlined />}
            onClick={() => {
              setSelectedRecord(record);
              setAssigneeInput("me");
              setAssignModalVisible(true);
            }}
          >
            Tiếp nhận
          </Button>
          <Button
            size="small"
            icon={<FormOutlined />}
            onClick={() => {
              setSelectedRecord(record);
              setNoteModalVisible(true);
            }}
          >
            Ghi chú
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 font-bold text-slate-800">
            Hàng đợi Đối soát Giao dịch Bất thường
          </Title>
          <Text type="secondary">
            Xử lý các giao dịch đến muộn, sai lệch số tiền, tài khoản không khớp hoặc thanh toán sau khi hủy
          </Text>
        </div>
        <Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => refetch()} loading={isFetching}>
          Làm mới
        </Button>
      </div>

      <Alert
        message="Nguyên tắc xử lý Đối soát & An toàn quỹ (BR-34, PR8 Reserved)"
        description="Admin có thể tiếp nhận sự vụ (chuyển sang trạng thái IN_REVIEW), thêm ghi chú điều tra và liên hệ học viên/nhà tài trợ. Các hành động can thiệp hoàn tiền tự động hoặc giải phóng lớp học được kiểm soát nghiêm ngặt và không thực hiện chuyển tiền thật."
        type="warning"
        showIcon
        className="border-amber-200 bg-amber-50/70"
      />

      {/* Filter Bar */}
      <Card bordered={false} className="shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Mã đơn (OrderCode):</label>
            <Input
              placeholder="Nhập mã order..."
              value={searchCodeInput}
              onChange={(e) => setSearchCodeInput(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Trạng thái:</label>
            <Select
              className="w-full"
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={[
                { label: "Tất cả trạng thái", value: "ALL" },
                { label: "Cần kiểm tra (NEEDS_REVIEW)", value: "NEEDS_REVIEW" },
                { label: "Đang xử lý (IN_REVIEW)", value: "IN_REVIEW" },
                { label: "Đã duyệt (RESOLVED_APPROVED)", value: "RESOLVED_APPROVED" },
                { label: "Đã hoàn tiền (RESOLVED_REFUNDED)", value: "RESOLVED_REFUNDED" },
                { label: "Đã bỏ qua (RESOLVED_IGNORED)", value: "RESOLVED_IGNORED" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Lý do đối soát:</label>
            <Select
              className="w-full"
              value={reason}
              onChange={(v) => { setReason(v); setPage(1); }}
              options={[
                { label: "Tất cả lý do", value: "ALL" },
                { label: "LATE_PAYMENT_REVIEW", value: "LATE_PAYMENT_REVIEW" },
                { label: "LATE_SUCCESS_AFTER_FAILED", value: "LATE_SUCCESS_AFTER_FAILED" },
                { label: "AMOUNT_MISMATCH", value: "AMOUNT_MISMATCH" },
                { label: "EXPIRED_PAYMENT", value: "EXPIRED_PAYMENT" },
                { label: "UNMATCHED", value: "UNMATCHED" },
                { label: "ACCOUNT_MISMATCH", value: "ACCOUNT_MISMATCH" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Kênh thanh toán:</label>
            <Select
              className="w-full"
              value={channelKey}
              onChange={(v) => { setChannelKey(v); setPage(1); }}
              options={[
                { label: "Tất cả kênh", value: "ALL" },
                { label: "Học phí (TUITION)", value: "TUITION" },
                { label: "Tài trợ (DONATION)", value: "DONATION" },
              ]}
            />
          </div>

          <div className="flex gap-2">
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} className="flex-1">
              Lọc
            </Button>
            <Button onClick={handleReset}>Đặt lại</Button>
          </div>
        </div>
      </Card>

      {/* Reconciliations Table */}
      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={reconciliations}
          loading={isLoading}
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
            showTotal: (t) => `Tổng cộng ${t} sự vụ cần đối soát`,
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={
          <Space>
            <AuditOutlined className="text-amber-600" />
            <span>Hồ sơ Đối soát Giao dịch #{selectedRecord?.orderCode}</span>
          </Space>
        }
        open={Boolean(selectedRecord) && !assignModalVisible && !noteModalVisible}
        onCancel={() => setSelectedRecord(null)}
        footer={[
          <Tooltip key="refund-btn" title="Chức năng hoàn tiền thật bảo lưu cho PR8. Không xử lý trực tiếp tại giao diện.">
            <Button disabled icon={<LockOutlined />}>
              Xử lý Hoàn tiền (PR8)
            </Button>
          </Tooltip>,
          <Button
            key="assign-btn"
            type="primary"
            icon={<UserSwitchOutlined />}
            onClick={() => {
              setAssigneeInput("me");
              setAssignModalVisible(true);
            }}
          >
            Phân công / Tiếp nhận
          </Button>,
          <Button
            key="note-btn"
            icon={<FormOutlined />}
            onClick={() => setNoteModalVisible(true)}
          >
            Thêm ghi chú
          </Button>,
          <Button key="close" onClick={() => setSelectedRecord(null)}>
            Đóng
          </Button>,
        ]}
        width={750}
      >
        {selectedRecord && (
          <div className="space-y-4 pt-2">
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Mã đối soát">{selectedRecord._id}</Descriptions.Item>
              <Descriptions.Item label="Lý do">
                <Tag color="volcano">{selectedRecord.reason}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Kênh thanh toán">{selectedRecord.channelKey}</Descriptions.Item>
              <Descriptions.Item label="Mục đích">{selectedRecord.purpose}</Descriptions.Item>
              <Descriptions.Item label="Số tiền nhận được">
                <span className="font-bold text-slate-800">{formatVND(selectedRecord.receivedAmount)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Số tiền mong đợi">
                {selectedRecord.expectedAmount ? formatVND(selectedRecord.expectedAmount) : "Không xác định"}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color="blue">{selectedRecord.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Admin phụ trách">
                {selectedRecord.assignedTo?.email || "Chưa phân công"}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày tạo" span={2}>
                {new Date(selectedRecord.createdAt).toLocaleString("vi-VN")}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong className="text-sm text-slate-700 block mb-2">
                Nhật ký kiểm toán & Xử lý (Audit Trail):
              </Text>
              {selectedRecord.auditReferences && selectedRecord.auditReferences.length > 0 ? (
                <Timeline
                  className="mt-3"
                  items={selectedRecord.auditReferences.map((ref) => ({
                    color: ref.action === "ASSIGNED" ? "blue" : "green",
                    children: (
                      <div>
                        <div className="text-xs text-slate-400">
                          {ref.timestamp ? new Date(ref.timestamp).toLocaleString("vi-VN") : "N/A"}
                        </div>
                        <div className="text-xs font-semibold text-slate-700">[{ref.action || "NOTE"}]</div>
                        <div className="text-xs text-slate-600 whitespace-pre-wrap">{ref.note}</div>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <div className="text-xs text-slate-400 italic">Chưa có ghi chú kiểm toán nào</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Modal */}
      <Modal
        title="Tiếp nhận hoặc Phân công sự vụ đối soát"
        open={assignModalVisible}
        onCancel={() => setAssignModalVisible(false)}
        onOk={() => {
          if (!selectedRecord) return;
          assignMutation.mutate({
            id: selectedRecord._id,
            assignedTo: assigneeInput,
            note: assignNote,
          });
        }}
        confirmLoading={assignMutation.isPending}
        okText="Xác nhận tiếp nhận"
        cancelText="Hủy"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Người tiếp nhận:</label>
            <Select
              className="w-full"
              value={assigneeInput}
              onChange={setAssigneeInput}
              options={[
                { label: "Chính tôi (Assign to Me)", value: "me" },
              ]}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Ghi chú tiếp nhận (Tùy chọn):</label>
            <TextArea
              rows={3}
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              placeholder="Nhập ghi chú ban đầu về kế hoạch liên hệ học viên / kiểm tra ngân hàng..."
            />
          </div>
        </div>
      </Modal>

      {/* Add Note Modal */}
      <Modal
        title="Thêm Ghi chú Kiểm toán (Audit Trail)"
        open={noteModalVisible}
        onCancel={() => setNoteModalVisible(false)}
        onOk={() => {
          if (!selectedRecord || !newNoteContent.trim()) {
            message.warning("Vui lòng nhập nội dung ghi chú");
            return;
          }
          addMutation: addNoteMutation.mutate({
            id: selectedRecord._id,
            note: newNoteContent,
          });
        }}
        confirmLoading={addNoteMutation.isPending}
        okText="Lưu ghi chú"
        cancelText="Hủy"
      >
        <div className="space-y-3 pt-2">
          <Paragraph type="secondary" className="text-xs">
            Ghi chú sẽ được lưu vĩnh viễn vào lịch sử kiểm toán của sự vụ đối soát này cùng danh tính của Admin thực hiện.
          </Paragraph>
          <TextArea
            rows={4}
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Ví dụ: Đã liên hệ học viên qua điện thoại, học viên xác nhận đã chuyển khoản muộn 20 phút do lỗi mạng ngân hàng..."
          />
        </div>
      </Modal>
    </div>
  );
}
