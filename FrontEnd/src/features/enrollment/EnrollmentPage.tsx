import { useParams, Link } from "react-router-dom";
import { Breadcrumb, Button, Alert, Tag, Skeleton } from "antd";
import {
  HomeOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  UserOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useClassDetailQuery } from "../class/hooks/useClassDiscovery";

export default function EnrollmentPage() {
  const { classId } = useParams<{ classId: string }>();
  const { data: item, isLoading } = useClassDetailQuery(classId);

  if (isLoading) {
    return (
      <div className="site-container py-12 min-h-screen">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="site-container py-12 min-h-screen">
        <Alert
          type="error"
          showIcon
          message="Không tìm thấy thông tin lớp học cần đăng ký"
          description="Vui lòng quay lại trang khám phá lớp học để chọn lại lớp."
          action={
            <Link to="/classes">
              <Button type="primary" size="small">
                Xem danh sách lớp
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isFree = item.classType === "FREE";

  return (
    <div className="site-container py-8 min-h-screen max-w-3xl">
      <div className="mb-4">
        <Breadcrumb
          items={[
            {
              title: (
                <Link to="/" className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 text-xs">
                  <HomeOutlined />
                  <span>Trang chủ</span>
                </Link>
              ),
            },
            {
              title: (
                <Link to="/classes" className="text-slate-500 hover:text-indigo-600 text-xs">
                  Khám phá lớp học
                </Link>
              ),
            },
            {
              title: (
                <Link to={`/classes/${item.id}`} className="text-slate-500 hover:text-indigo-600 text-xs truncate max-w-xs">
                  {item.title}
                </Link>
              ),
            },
            {
              title: <span className="text-slate-800 font-semibold text-xs">Đăng ký lớp</span>,
            },
          ]}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Tag color="indigo" className="font-semibold text-xs">
            {item.gradeLabel}
          </Tag>
          {isFree ? (
            <Tag color="green" className="font-bold text-xs">
              MIỄN PHÍ
            </Tag>
          ) : (
            <Tag color="gold" className="text-xs">
              CÓ HỌC PHÍ
            </Tag>
          )}
        </div>

        <h1 className="text-2xl font-black text-slate-900 mb-2">
          Xác nhận đăng ký lớp học
        </h1>
        <p className="text-xs text-slate-500 mb-6">
          Vui lòng kiểm tra lại thông tin lớp học trước khi hoàn tất đăng ký vào danh sách học viên.
        </p>

        {/* Class Summary Box */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 mb-6 space-y-3">
          <div className="text-base font-bold text-slate-900">{item.title}</div>
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <UserOutlined className="text-indigo-600" />
            <span>Giáo viên phụ trách: <strong>{item.teacherName}</strong></span>
          </div>
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <ClockCircleOutlined className="text-indigo-600" />
            <span>Lịch học: <strong>{item.scheduleText}</strong></span>
          </div>
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <CalendarOutlined className="text-indigo-600" />
            <span>Ngày khai giảng: <strong>{item.startDate}</strong></span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm">
            <span className="text-slate-500 font-medium">Học phí:</span>
            <span className={`font-black text-lg ${isFree ? "text-emerald-600" : "text-indigo-700"}`}>
              {item.formattedPrice}
            </span>
          </div>
        </div>

        {/* Scope Note Banner */}
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined className="text-indigo-600" />}
          message="Hệ thống đăng ký đang trong giai đoạn kết nối cổng thanh toán"
          description="Tính năng Checkout / Payment và xử lý Enrollment chính thức nằm ngoài phạm vi sprint hiện tại (Out of scope). Yêu cầu đăng ký đã được ghi nhận vào hệ thống mock."
          className="mb-6 rounded-xl"
        />

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <Link to={`/classes/${item.id}`}>
            <Button className="rounded-lg text-xs font-semibold">
              ← Xem lại thông tin lớp
            </Button>
          </Link>

          <Link to="/classes">
            <Button
              type="primary"
              className="bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-semibold px-6 h-9"
              icon={<CheckCircleOutlined />}
            >
              Tiếp tục khám phá các lớp khác
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
