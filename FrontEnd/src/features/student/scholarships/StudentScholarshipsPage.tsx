import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Tag,
  Button,
  Skeleton,
  Empty,
  Alert,
  Progress,
} from "antd";
import {
  GiftOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { scholarshipService, scholarshipKeys } from "../../../services/scholarship.service";
import {
  SCHOLARSHIP_STATUS_LABELS,
  SCHOLARSHIP_STATUS_COLORS,
} from "../../../types/scholarship";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text } = Typography;

export default function StudentScholarshipsPage() {
  const { data: scholarships, isLoading, isError, refetch } = useQuery({
    queryKey: scholarshipKeys.myList(),
    queryFn: () => scholarshipService.getMyScholarships(),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 !text-2xl font-black text-slate-900 tracking-tight">
            Học bổng của tôi
          </Title>
          <Text className="text-xs text-slate-500">
            Quản lý số dư học bổng được cấp, hạn sử dụng và tra cứu phạm vi áp dụng khóa học.
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <Link to={ROUTES.STUDENT.HOME + "/scholarships/applications"}>
            <Button className="rounded-xl text-xs font-semibold h-10 px-4">
              Hồ sơ xin học bổng
            </Button>
          </Link>
          <Link to={ROUTES.CLASSES}>
            <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-10 px-5 shadow-2xs">
              Tìm lớp học phù hợp
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="Lỗi tải dữ liệu học bổng"
          description="Không thể tải danh sách học bổng. Vui lòng thử lại."
          action={
            <Button size="small" type="primary" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !scholarships || scholarships.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-slate-200 text-center py-12">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Bạn hiện chưa có khoản học bổng nào được cấp."
          >
            <div className="space-y-3">
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Hãy ứng tuyển vào các chiến dịch học bổng đang mở để nhận hỗ trợ học phí từ các Nhà tài trợ.
              </p>
              <Link to={(ROUTES as any).CAMPAIGNS || "/campaigns"}>
                <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-9 px-5">
                  Khám phá chiến dịch học bổng
                </Button>
              </Link>
            </div>
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {scholarships.map((sch) => {
            const usagePercent = sch.allocatedAmount > 0
              ? Math.min(100, Math.round((sch.usedAmount / sch.allocatedAmount) * 100))
              : 0;

            const isExpired = new Date(sch.expiresAt).getTime() < Date.now();

            return (
              <Card
                key={sch.id}
                className={`rounded-2xl border transition-all shadow-2xs hover:shadow-xs overflow-hidden ${
                  sch.isUsable
                    ? "border-indigo-200 bg-white"
                    : "border-slate-200 bg-slate-50/50"
                }`}
              >
                {/* Header ribbon */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      sch.isUsable ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"
                    }`}>
                      <GiftOutlined />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900 leading-snug">
                        {sch.campaignTitle || "Học bổng Edunity"}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Mã học bổng: #{sch.id.slice(-6).toUpperCase()}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <Tag
                      color={SCHOLARSHIP_STATUS_COLORS[sch.status]}
                      className="text-[11px] font-bold border-none !m-0"
                    >
                      {SCHOLARSHIP_STATUS_LABELS[sch.status]}
                    </Tag>
                    {sch.isUsable && (
                      <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCircleOutlined /> Sẵn sàng sử dụng
                      </span>
                    )}
                  </div>
                </div>

                {/* Balance breakdown */}
                <div className="space-y-4">
                  <div className="bg-indigo-50/40 border border-indigo-100/60 rounded-xl p-4">
                    <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                      <span>Số dư khả dụng:</span>
                      <span className="font-bold text-indigo-900 text-lg">
                        {formatVND(sch.remainingAmount)}
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Đã sử dụng: {formatVND(sch.usedAmount)}</span>
                        <span>Tổng cấp: {formatVND(sch.allocatedAmount)}</span>
                      </div>
                      <Progress
                        percent={usagePercent}
                        showInfo={false}
                        size={["100%", 6]}
                        strokeColor="#4f46e5"
                        trailColor="#e2e8f0"
                        className="!m-0"
                      />
                    </div>
                  </div>

                  {/* Date details */}
                  <div className="text-xs text-slate-500 space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <CalendarOutlined /> Hiệu lực từ:
                      </span>
                      <span className="font-medium text-slate-700">
                        {new Date(sch.validFrom).toLocaleDateString("vi-VN")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <CalendarOutlined /> Hết hạn vào:
                      </span>
                      <span className={`font-medium ${isExpired ? "text-rose-600 font-bold" : "text-slate-700"}`}>
                        {new Date(sch.expiresAt).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="pt-2">
                    {sch.isUsable ? (
                      <Link to={ROUTES.CLASSES} className="block">
                        <Button
                          type="primary"
                          block
                          icon={<BookOutlined />}
                          className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold shadow-2xs"
                        >
                          Chọn lớp học để đăng ký ngay
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        disabled
                        block
                        className="h-10 rounded-xl text-xs font-medium bg-slate-100 text-slate-400"
                      >
                        {sch.status === "EXHAUSTED"
                          ? "Học bổng đã dùng hết số dư"
                          : isExpired
                          ? "Học bổng đã hết hạn sử dụng"
                          : "Học bổng không khả dụng"}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
