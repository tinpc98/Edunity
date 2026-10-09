import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Tag,
  Button,
  Tabs,
  Popconfirm,
  message,
  Skeleton,
  Empty,
  Pagination,
  Alert,
} from "antd";
import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  BookOutlined,
  UserOutlined,
  CalendarOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { enrollmentService, enrollmentKeys } from "../../../services/enrollment.service";
import { classKeys } from "../../../services/class.service";
import { sessionKeys } from "../../../services/session.service";
import { ROUTES } from "../../../routes/routePaths";
import type { EnrollmentStatus } from "../../../types/enrollment";
import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_COLORS,
} from "../../../types/enrollment";

const { Title, Text } = Typography;

type StatusTab = "ALL" | EnrollmentStatus;

function HoldCountdownBadge({
  holdExpiresAt,
  onExpire,
}: {
  holdExpiresAt: string | null | undefined;
  onExpire?: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!holdExpiresAt) {
      setTimeLeft(0);
      return;
    }
    const target = new Date(holdExpiresAt).getTime();
    const update = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setTimeLeft(diff);
      if (diff <= 0 && onExpire) {
        onExpire();
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [holdExpiresAt]);

  if (!holdExpiresAt) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isExpired = timeLeft <= 0;

  if (isExpired) {
    return (
      <span className="text-xs font-semibold text-rose-600 flex items-center gap-1">
        <CloseCircleOutlined /> Đã hết hạn giữ chỗ
      </span>
    );
  }

  return (
    <span className="text-xs font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
      <ClockCircleOutlined /> Giữ chỗ còn: {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

export default function StudentEnrollmentsPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<StatusTab>("ALL");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // 1. Fetch real student enrollments
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: enrollmentKeys.myList(currentPage, pageSize),
    queryFn: () => enrollmentService.getMyEnrollments(currentPage, pageSize, "class"),
  });

  // 2. Cancel enrollment mutation
  const cancelMutation = useMutation({
    mutationFn: (enrollmentId: string) => enrollmentService.cancelEnrollment(enrollmentId),
    onSuccess: () => {
      message.success("Đã hủy đơn giữ chỗ thành công.");
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      queryClient.invalidateQueries({ queryKey: classKeys.all });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể hủy đơn đăng ký.");
    },
  });

  const allItems = data?.items || [];
  const totalItems = data?.total || 0;

  const filteredItems = allItems.filter((item) => {
    if (activeTab === "ALL") return true;
    return item.enrollmentStatus === activeTab;
  });

  const tabItems = [
    { key: "ALL", label: `Tất cả (${allItems.length})` },
    {
      key: "PENDING_PAYMENT",
      label: `Chờ thanh toán (${allItems.filter((i) => i.enrollmentStatus === "PENDING_PAYMENT").length})`,
    },
    {
      key: "CONFIRMED",
      label: `Đã xác nhận (${allItems.filter((i) => i.enrollmentStatus === "CONFIRMED").length})`,
    },
    {
      key: "COMPLETED",
      label: `Hoàn thành (${allItems.filter((i) => i.enrollmentStatus === "COMPLETED").length})`,
    },
    {
      key: "CANCELLED",
      label: `Đã hủy (${allItems.filter((i) => i.enrollmentStatus === "CANCELLED").length})`,
    },
    {
      key: "EXPIRED",
      label: `Hết hạn (${allItems.filter((i) => i.enrollmentStatus === "EXPIRED").length})`,
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Title level={2} className="!mb-1 !text-2xl font-black text-slate-900 tracking-tight">
          Đơn đăng ký của tôi
        </Title>
        <Text className="text-xs text-slate-500">
          Theo dõi trạng thái các lớp đã đăng ký, thời gian giữ chỗ và lịch sử tham gia.
        </Text>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as StatusTab)}
        items={tabItems}
        className="[&_.ant-tabs-nav]:mb-4"
      />

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="Lỗi tải dữ liệu đơn đăng ký"
          description="Không thể tải danh sách đơn đăng ký từ hệ thống. Vui lòng thử lại."
          action={
            <Button size="small" type="primary" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : filteredItems.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-slate-200 text-center py-12">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="text-xs text-slate-500">
                {activeTab === "ALL"
                  ? "Bạn chưa có đơn đăng ký lớp học nào."
                  : `Không có đơn đăng ký nào ở trạng thái "${ENROLLMENT_STATUS_LABELS[activeTab as EnrollmentStatus] || activeTab}".`}
              </span>
            }
          >
            <Link to={ROUTES.CLASSES}>
              <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-9 px-5">
                Khám phá lớp học ngay
              </Button>
            </Link>
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((enrollment) => {
            const classInfo = enrollment.class;
            const isPending = enrollment.enrollmentStatus === "PENDING_PAYMENT";
            const isConfirmed = enrollment.enrollmentStatus === "CONFIRMED";
            const isFree = enrollment.paymentSource === "FREE";

            return (
              <Card
                key={enrollment.id}
                className={`rounded-2xl border transition-all shadow-2xs hover:shadow-xs ${
                  isPending
                    ? "border-amber-200 bg-amber-50/20"
                    : isConfirmed
                    ? "border-emerald-100 bg-white"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Class details */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600 text-xl font-bold">
                      <BookOutlined />
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/classes/${enrollment.classId}`}
                          className="font-bold text-sm text-slate-900 hover:text-indigo-600 transition-colors"
                        >
                          {classInfo?.className || "Lớp học #" + enrollment.classId.slice(-6)}
                        </Link>

                        <Tag color={ENROLLMENT_STATUS_COLORS[enrollment.enrollmentStatus]} className="text-[11px] font-semibold border-none">
                          {ENROLLMENT_STATUS_LABELS[enrollment.enrollmentStatus] || enrollment.enrollmentStatus}
                        </Tag>

                        {isFree ? (
                          <Tag color="green" className="text-[10px] font-bold border-none">
                            MIỄN PHÍ
                          </Tag>
                        ) : (
                          <Tag color="gold" className="text-[10px] font-bold border-none">
                            HỌC PHÍ
                          </Tag>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {classInfo?.teacherName && (
                          <span className="flex items-center gap-1">
                            <UserOutlined className="text-slate-400" />
                            Giảng viên: <strong className="text-slate-700">{classInfo.teacherName}</strong>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <CalendarOutlined className="text-slate-400" />
                          Đăng ký: {new Date(enrollment.enrolledAt).toLocaleDateString("vi-VN")}
                        </span>
                        {!isFree && (
                          <span className="font-semibold text-indigo-700">
                            {enrollment.tuitionAmount.toLocaleString("vi-VN")} đ
                          </span>
                        )}
                      </div>

                      {/* Hold countdown for PENDING_PAYMENT */}
                      {isPending && (
                        <div className="pt-1.5 flex items-center gap-3">
                          <HoldCountdownBadge
                            holdExpiresAt={enrollment.holdExpiresAt}
                            onExpire={() => queryClient.invalidateQueries({ queryKey: enrollmentKeys.all })}
                          />
                          <span className="text-[11px] text-slate-400">
                            (Sau thời gian này, chỗ ngồi sẽ tự động mở lại cho người khác)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
                    {isConfirmed && (
                      <Link to={`/student/classes/${enrollment.classId}`}>
                        <Button
                          type="primary"
                          icon={<ArrowRightOutlined />}
                          className="bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold h-9 rounded-xl border-none shadow-2xs"
                        >
                          Vào lớp học
                        </Button>
                      </Link>
                    )}

                    {isPending && (
                      <>
                        <Link to={`/checkout/${enrollment.id}`}>
                          <Button
                            type="primary"
                            className="bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold h-9 rounded-xl border-none shadow-2xs"
                          >
                            Thanh toán ngay
                          </Button>
                        </Link>
                        <Popconfirm
                          title="Hủy đơn giữ chỗ?"
                          description="Bạn có chắc chắn muốn hủy giữ chỗ và nhường vị trí cho học viên khác?"
                          okText="Hủy giữ chỗ"
                          cancelText="Quay lại"
                          okButtonProps={{ danger: true, loading: cancelMutation.isPending }}
                          onConfirm={() => cancelMutation.mutate(enrollment.id)}
                        >
                          <Button
                            danger
                            loading={cancelMutation.isPending}
                            className="text-xs font-semibold h-9 rounded-xl"
                          >
                            Hủy giữ chỗ
                          </Button>
                        </Popconfirm>
                      </>
                    )}

                    <Link to={`/classes/${enrollment.classId}`}>
                      <Button className="text-xs font-semibold h-9 rounded-xl">
                        Chi tiết lớp
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}

          {totalItems > pageSize && (
            <div className="flex justify-center pt-4">
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={totalItems}
                onChange={(p) => setCurrentPage(p)}
                showSizeChanger={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
