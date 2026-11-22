import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  SafetyCertificateOutlined,
  EyeOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  teacherBankAccountService,
  type AdminBankAccountItem,
  type BankAccountFilterStatus,
} from "../../../services/teacherBankAccount.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import AdminSectionCard from "../../../components/admin/AdminSectionCard";

const { Text } = Typography;

export default function AdminBankAccountsTab() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BankAccountFilterStatus>("PENDING_REVIEW");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const [viewingItem, setViewingItem] = useState<AdminBankAccountItem | null>(null);
  const [rejectingItem, setRejectingItem] = useState<AdminBankAccountItem | null>(null);
  const [rejectForm] = Form.useForm<{ reviewNote: string }>();

  const queryKey = ["admin-teacher-bank-accounts", status, page, activeSearch];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => teacherBankAccountService.adminList(status, page, 20, activeSearch),
  });

  const handleSearch = () => {
    setActiveSearch(searchQuery.trim());
    setPage(1);
  };

  const handleResetSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    setPage(1);
  };

  const refreshQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-teacher-bank-accounts"] });
  };

  const approveMutation = useMutation({
    mutationFn: (teacherId: string) => teacherBankAccountService.adminApprove(teacherId),
    onSuccess: () => {
      message.success("Đã phê duyệt tài khoản ngân hàng của giáo viên thành công.");
      setViewingItem(null);
      refreshQueries();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ teacherId, reviewNote }: { teacherId: string; reviewNote: string }) =>
      teacherBankAccountService.adminReject(teacherId, reviewNote),
    onSuccess: () => {
      message.success("Đã từ chối tài khoản ngân hàng và gửi thông báo đến giáo viên.");
      setRejectingItem(null);
      setViewingItem(null);
      rejectForm.resetFields();
      refreshQueries();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Status Buttons: 1 single row on desktop */}
          <div className="overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            <Radio.Group
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              buttonStyle="solid"
              className="inline-flex whitespace-nowrap"
            >
              <Radio.Button value="PENDING_REVIEW" className="text-xs sm:text-sm">
                Chờ xác minh
              </Radio.Button>
              <Radio.Button value="VERIFIED" className="text-xs sm:text-sm">
                Đã xác minh
              </Radio.Button>
              <Radio.Button value="REJECTED" className="text-xs sm:text-sm">
                Bị từ chối
              </Radio.Button>
              <Radio.Button value="ALL" className="text-xs sm:text-sm">
                Tất cả
              </Radio.Button>
            </Radio.Group>
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-2 w-full lg:w-auto lg:min-w-[340px]">
            <Input
              placeholder="Tìm theo tên giáo viên, email, ngân hàng..."
              prefix={<SearchOutlined className="text-slate-400" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              className="rounded-xl flex-1"
            />
            <Button
              type="primary"
              onClick={handleSearch}
              className="!bg-[#0D9488] hover:!bg-[#0F766E] rounded-xl font-medium shrink-0"
            >
              Tìm
            </Button>
            {activeSearch && (
              <Button onClick={handleResetSearch} className="rounded-xl shrink-0">
                Xóa lọc
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Bank Accounts Table */}
      <AdminSectionCard
        title="Tài khoản nhận tiền của giáo viên"
        subtitle="Kiểm tra và xác minh thông tin ngân hàng dùng để nhận thù lao."
        icon={<SafetyCertificateOutlined />}
        extra={
          <span className="text-xs font-semibold text-slate-500">
            Tổng: <span className="font-bold text-[#0F766E]">{total}</span> tài khoản
          </span>
        }
      >
        <Table<AdminBankAccountItem>
          rowKey="teacherId"
          loading={isLoading}
          dataSource={items}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: setPage,
            showSizeChanger: false,
          }}
          locale={{
            emptyText: (
              <div className="py-6">
                <Empty
                  description={
                    status === "PENDING_REVIEW"
                      ? "Không có tài khoản nào chờ xác minh."
                      : "Không có tài khoản nào trong bộ lọc này."
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              </div>
            ),
          }}
          columns={[
            {
              title: "Giáo viên",
              key: "teacher",
              render: (_, r) => (
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-800 text-xs sm:text-sm">
                    {r.fullName || "—"}
                  </div>
                  <div className="text-xs text-slate-500">{r.email}</div>
                </div>
              ),
            },
            {
              title: "Ngân hàng",
              key: "bank",
              render: (_, r) => (
                <span className="font-medium text-xs sm:text-sm text-slate-700">
                  {r.bankAccount.bankName}
                </span>
              ),
            },
            {
              title: "Số tài khoản",
              key: "accountNumber",
              render: (_, r) => (
                <span className="font-mono text-xs sm:text-sm font-bold text-slate-800">
                  {r.bankAccount.accountNumber || r.bankAccount.accountNumberMasked}
                </span>
              ),
            },
            {
              title: "Chủ tài khoản / Tên CCCD",
              key: "holder",
              render: (_, r) => (
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-800 uppercase">
                    {r.bankAccount.accountHolderName}
                  </div>
                  <div className="text-slate-500">
                    {r.identityName ? `CCCD: ${r.identityName}` : "—"}
                  </div>
                </div>
              ),
            },
            {
              title: "Ngày đăng ký",
              key: "submittedAt",
              render: (_, r) => (
                <span className="text-xs text-slate-600">
                  {dayjs(r.bankAccount.submittedAt).format("DD/MM/YYYY HH:mm")}
                </span>
              ),
            },
            {
              title: "Trạng thái",
              key: "status",
              align: "center",
              render: (_, r) => {
                const st = r.bankAccount.status;
                const color =
                  st === "VERIFIED" ? "success" : st === "REJECTED" ? "error" : "gold";
                const label =
                  st === "VERIFIED"
                    ? "Đã xác minh"
                    : st === "REJECTED"
                    ? "Bị từ chối"
                    : "Chờ xác minh";
                return (
                  <Tag color={color} className="font-semibold text-xs whitespace-nowrap">
                    {label}
                  </Tag>
                );
              },
            },
            {
              title: "Thao tác",
              key: "actions",
              align: "right",
              render: (_, r) => {
                const isPending = r.bankAccount.status === "PENDING_REVIEW";
                return (
                  <Space size="small">
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => setViewingItem(r)}
                      className="text-xs border-[#D6E5E2] text-slate-700 hover:text-[#0D9488]"
                    >
                      Chi tiết
                    </Button>
                    {isPending && (
                      <>
                        <Button
                          size="small"
                          type="primary"
                          className="!bg-[#0D9488] hover:!bg-[#0F766E] text-xs"
                          loading={
                            approveMutation.isPending &&
                            approveMutation.variables === r.teacherId
                          }
                          onClick={() => approveMutation.mutate(r.teacherId)}
                        >
                          Duyệt
                        </Button>
                        <Button
                          size="small"
                          danger
                          className="text-xs"
                          onClick={() => setRejectingItem(r)}
                        >
                          Từ chối
                        </Button>
                      </>
                    )}
                  </Space>
                );
              },
            },
          ]}
        />
      </AdminSectionCard>

      {/* Account Details Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-[#163B40] font-bold text-base">
            <SafetyCertificateOutlined className="text-[#0D9488]" />
            Chi tiết tài khoản nhận tiền
          </div>
        }
        open={Boolean(viewingItem)}
        onCancel={() => setViewingItem(null)}
        footer={[
          <Button key="close" onClick={() => setViewingItem(null)}>
            Đóng
          </Button>,
          viewingItem?.bankAccount.status === "PENDING_REVIEW" && (
            <Button
              key="reject"
              danger
              onClick={() => {
                const item = viewingItem;
                setViewingItem(null);
                setRejectingItem(item);
              }}
            >
              Từ chối
            </Button>
          ),
          viewingItem?.bankAccount.status === "PENDING_REVIEW" && (
            <Button
              key="approve"
              type="primary"
              className="!bg-[#0D9488] hover:!bg-[#0F766E]"
              loading={
                approveMutation.isPending &&
                approveMutation.variables === viewingItem?.teacherId
              }
              onClick={() => {
                if (viewingItem) {
                  approveMutation.mutate(viewingItem.teacherId);
                }
              }}
            >
              Phê duyệt tài khoản
            </Button>
          ),
        ]}
      >
        {viewingItem && (
          <div className="space-y-4 pt-2">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Giáo viên">
                <Text strong>{viewingItem.fullName}</Text>
                <div className="text-xs text-slate-500">{viewingItem.email}</div>
              </Descriptions.Item>

              <Descriptions.Item label="Họ tên trên CCCD">
                <Text strong className="text-[#0F766E]">
                  {viewingItem.identityName || "Chưa có thông tin định danh CCCD"}
                </Text>
              </Descriptions.Item>

              <Descriptions.Item label="Ngân hàng">
                <Text strong>{viewingItem.bankAccount.bankName}</Text>
              </Descriptions.Item>

              <Descriptions.Item label="Số tài khoản">
                <Text code className="font-mono font-bold text-sm text-slate-800">
                  {viewingItem.bankAccount.accountNumber ||
                    viewingItem.bankAccount.accountNumberMasked}
                </Text>
              </Descriptions.Item>

              <Descriptions.Item label="Tên chủ tài khoản">
                <Text strong className="uppercase">
                  {viewingItem.bankAccount.accountHolderName}
                </Text>
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái xác minh">
                {viewingItem.bankAccount.status === "VERIFIED" ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    Đã xác minh
                  </Tag>
                ) : viewingItem.bankAccount.status === "REJECTED" ? (
                  <Tag color="error" icon={<CloseCircleOutlined />}>
                    Bị từ chối
                  </Tag>
                ) : (
                  <Tag color="gold" icon={<SafetyCertificateOutlined />}>
                    Chờ xác minh
                  </Tag>
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày gửi yêu cầu">
                {dayjs(viewingItem.bankAccount.submittedAt).format("DD/MM/YYYY HH:mm")}
              </Descriptions.Item>

              {viewingItem.bankAccount.reviewedAt && (
                <Descriptions.Item label="Thời gian xét duyệt">
                  {dayjs(viewingItem.bankAccount.reviewedAt).format("DD/MM/YYYY HH:mm")}
                </Descriptions.Item>
              )}

              {viewingItem.bankAccount.reviewNote && (
                <Descriptions.Item label="Ghi chú / Lý do từ chối">
                  <Text type="danger">{viewingItem.bankAccount.reviewNote}</Text>
                </Descriptions.Item>
              )}

              {viewingItem.bankAccount.payoutLockedUntil && (
                <Descriptions.Item label="Khóa rút tiền bảo vệ đến">
                  <Text className="text-purple-600 font-medium">
                    {dayjs(viewingItem.bankAccount.payoutLockedUntil).format(
                      "DD/MM/YYYY HH:mm"
                    )}
                  </Text>
                  <div className="text-[11px] text-slate-500">
                    Khoản khóa 72h chống chiếm đoạt tài khoản khi thay đổi số tài khoản.
                  </div>
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Từ chối tài khoản ngân hàng"
        open={Boolean(rejectingItem)}
        onCancel={() => {
          setRejectingItem(null);
          rejectForm.resetFields();
        }}
        onOk={() => rejectForm.submit()}
        okButtonProps={{ danger: true }}
        okText="Xác nhận từ chối"
        cancelText="Hủy"
        confirmLoading={rejectMutation.isPending}
      >
        <p className="text-sm text-slate-600 mb-3">
          Từ chối tài khoản <strong>{rejectingItem?.bankAccount.bankName}</strong> của giáo viên{" "}
          <strong>{rejectingItem?.fullName}</strong>. Vui lòng nhập lý do cụ thể để giáo viên sửa đổi:
        </p>
        <Form
          form={rejectForm}
          layout="vertical"
          onFinish={({ reviewNote }) => {
            if (rejectingItem) {
              rejectMutation.mutate({
                teacherId: rejectingItem.teacherId,
                reviewNote,
              });
            }
          }}
        >
          <Form.Item
            name="reviewNote"
            label="Lý do từ chối (gửi thông báo đến giáo viên)"
            rules={[
              { required: true, whitespace: true, message: "Vui lòng nhập lý do từ chối" },
            ]}
          >
            <Input.TextArea
              rows={3}
              maxLength={1000}
              placeholder="VD: Tên chủ tài khoản không khớp với họ tên trên CCCD..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
