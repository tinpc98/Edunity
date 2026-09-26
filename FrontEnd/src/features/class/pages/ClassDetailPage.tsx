import { useParams, useNavigate, Link } from "react-router-dom";
import { Breadcrumb, Button, Tag, Skeleton, Alert } from "antd";
import {
  HomeOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  StarFilled,
  CalendarOutlined,
  CheckCircleOutlined,
  BookOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useClassDetailQuery } from "../hooks/useClassDiscovery";

export default function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();

  const { data: item, isLoading, isError } = useClassDetailQuery(classId);

  if (isLoading) {
    return (
      <div className="site-container py-10 min-h-screen">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="site-container py-12 min-h-screen">
        <Alert
          type="warning"
          showIcon
          message="Không tìm thấy lớp học"
          description="Lớp học bạn tìm kiếm không tồn tại hoặc đã bị hủy."
          action={
            <Link to="/classes">
              <Button type="primary" size="small">
                Quay lại danh sách lớp học
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isFree = item.classType === "FREE";

  return (
    <div className="site-container py-6 min-h-screen">
      {/* Breadcrumb */}
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
              title: <span className="text-slate-800 font-semibold text-xs truncate max-w-xs">{item.title}</span>,
            },
          ]}
        />
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Information */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Tag color="indigo" className="font-semibold text-xs">
                {item.gradeLabel}
              </Tag>
              <Tag color="blue" className="text-xs">
                {item.subjectName}
              </Tag>
              {isFree ? (
                <Tag color="green" className="font-bold text-xs">
                  LỚP MIỄN PHÍ
                </Tag>
              ) : (
                <Tag color="gold" className="text-xs">
                  CÓ HỌC PHÍ
                </Tag>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug !mb-3">
              {item.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                {item.teacherAvatar ? (
                  <img
                    src={item.teacherAvatar}
                    alt={item.teacherName}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <UserOutlined />
                )}
                <span className="font-medium text-slate-700">{item.teacherName}</span>
                {item.teacherTitle && (
                  <span className="text-slate-400">({item.teacherTitle})</span>
                )}
              </div>

              <div className="flex items-center gap-1 font-semibold text-slate-700">
                <StarFilled className="text-amber-400" />
                <span>{item.ratingAverage.toFixed(1)}</span>
                <span className="text-slate-400 font-normal">({item.ratingCount} đánh giá)</span>
              </div>
            </div>

            {/* Course Context */}
            <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3">
              <BookOutlined className="text-indigo-600 text-lg mt-0.5" />
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Chương trình / Khóa học
                </div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">
                  {item.courseTitle}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Lớp học được tổ chức bám sát đề cương chi tiết chuẩn của chương trình học Edunity.
                </div>
              </div>
            </div>

            {/* Schedule & Sessions */}
            <div className="mt-6">
              <h2 className="text-base font-bold text-slate-900 mb-3">
                Lịch học & Thông tin lớp
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                  <ClockCircleOutlined className="text-indigo-600 text-base" />
                  <div>
                    <div className="text-slate-400 text-[11px]">Thời gian học</div>
                    <div className="font-semibold text-slate-800">{item.scheduleText}</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                  <CalendarOutlined className="text-indigo-600 text-base" />
                  <div>
                    <div className="text-slate-400 text-[11px]">Ngày khai giảng</div>
                    <div className="font-semibold text-slate-800">{item.startDate}</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                  <TeamOutlined className="text-indigo-600 text-base" />
                  <div>
                    <div className="text-slate-400 text-[11px]">Sĩ số lớp</div>
                    <div className="font-semibold text-slate-800">
                      Tối đa {item.capacity} học viên (Hiện còn {item.seatsLeft} chỗ)
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                  <CheckCircleOutlined className="text-emerald-600 text-base" />
                  <div>
                    <div className="text-slate-400 text-[11px]">Trạng thái</div>
                    <div className="font-semibold text-slate-800">{item.statusLabel}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Sticky Checkout / Registration Card */}
        <div className="lg:col-span-4 sticky top-24">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-md flex flex-col gap-4">
            <div className="relative rounded-xl overflow-hidden h-44 bg-slate-100">
              <img
                src={item.coverImage}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div>
              <div className="text-xs text-slate-400">Học phí trọn khóa</div>
              <div className={`text-2xl font-black ${isFree ? "text-emerald-600" : "text-indigo-700"}`}>
                {item.formattedPrice}
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1.5 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircleOutlined className="text-emerald-600" />
                <span>Bao gồm đầy đủ tài liệu & đề thi ôn luyện</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleOutlined className="text-emerald-600" />
                <span>Tương tác trực tiếp 2 chiều với giáo viên</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleOutlined className="text-emerald-600" />
                <span>Xem lại video ghi hình buổi học bất kỳ lúc nào</span>
              </div>
            </div>

            {item.canEnroll ? (
              <Button
                type="primary"
                size="large"
                onClick={() => navigate(`/enrollment/${item.id}`)}
                className="bg-indigo-600 hover:bg-indigo-700 font-bold text-sm h-11 rounded-xl shadow-md border-none w-full"
              >
                Đăng ký lớp ngay
              </Button>
            ) : (
              <Button
                size="large"
                disabled
                className="font-medium text-sm h-11 rounded-xl w-full bg-slate-100 text-slate-400"
              >
                {item.isFull ? "Lớp đã đủ chỗ" : "Đã đóng đăng ký"}
              </Button>
            )}

            <div className="text-center">
              <Link to="/classes" className="text-xs font-semibold text-slate-500 hover:text-indigo-600">
                ← Quay lại danh sách lớp học
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
