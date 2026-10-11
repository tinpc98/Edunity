import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Breadcrumb,
  Avatar,
  Card,
  Tabs,
  Rate,
  Tag,
  Button,
  Skeleton,
  Empty,
  Pagination,
} from "antd";
import {
  UserOutlined,
  CheckCircleFilled,
  StarFilled,
  CalendarOutlined,
  TeamOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { ROUTES } from "../../../routes/routePaths";
import { catalogService, catalogKeys } from "../../../services/catalog.service";
import { reviewService, reviewKeys } from "../../../services/review.service";
import type { ApiClass } from "../../../types/class";

export default function TeacherDetailPage() {
  const { teacherId } = useParams<{ teacherId: string }>();

  // Review pagination
  const [reviewPage, setReviewPage] = useState(1);
  const reviewPageSize = 5;

  // 1. Fetch Teacher Info + Open Classes
  const {
    data: teacher,
    isLoading: isLoadingTeacher,
    isError: isTeacherError,
  } = useQuery({
    queryKey: catalogKeys.teacherDetail(teacherId!),
    queryFn: () => catalogService.getTeacherById(teacherId!),
    enabled: Boolean(teacherId),
  });

  // 2. Fetch Teacher Reviews
  const {
    data: reviewsData,
    isLoading: isLoadingReviews,
  } = useQuery({
    queryKey: reviewKeys.byTeacher(teacherId!, { page: reviewPage, pageSize: reviewPageSize }),
    queryFn: () =>
      reviewService.getTeacherReviews(teacherId!, {
        page: reviewPage,
        pageSize: reviewPageSize,
      }),
    enabled: Boolean(teacherId),
  });

  if (isLoadingTeacher) {
    return (
      <div className="site-container py-10 max-w-[1100px] mx-auto px-4">
        <Skeleton active avatar paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isTeacherError || !teacher) {
    return (
      <div className="site-container py-16 max-w-[1100px] mx-auto px-4 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-slate-400">
          <UserOutlined />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Không tìm thấy giáo viên</h2>
        <p className="text-sm text-slate-500 mb-6">
          Hồ sơ giáo viên không tồn tại hoặc chưa được xuất bản công khai.
        </p>
        <Link to={ROUTES.TEACHERS}>
          <Button type="primary" icon={<ArrowLeftOutlined />} className="rounded-xl bg-indigo-600">
            Quay lại danh sách giáo viên
          </Button>
        </Link>
      </div>
    );
  }

  const classes: ApiClass[] = teacher.classes || [];
  const reviews = reviewsData?.items || [];
  const totalReviews = reviewsData?.total || 0;

  return (
    <div className="site-container py-6 sm:py-10 max-w-[1100px] mx-auto px-4 min-h-[70vh]">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { title: <Link to={ROUTES.HOME}>Trang chủ</Link> },
          { title: <Link to={ROUTES.TEACHERS}>Giáo viên</Link> },
          { title: teacher.fullName },
        ]}
        className="mb-6 text-xs font-medium"
      />

      {/* Profile Header Card */}
      <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white overflow-hidden mb-8 p-0">
        <div className="h-28 bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 relative" />
        <div className="px-6 pb-6 pt-0 relative flex flex-col md:flex-row md:items-end justify-between gap-6 -mt-12">
          <div className="flex flex-col md:flex-row items-center md:items-end gap-5">
            <Avatar
              src={teacher.avatarUrl}
              icon={!teacher.avatarUrl && <UserOutlined />}
              size={100}
              className="border-4 border-white shadow-md bg-white text-slate-300 text-4xl shrink-0"
            />
            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <h1 className="text-2xl font-bold text-slate-900 mb-0">{teacher.fullName}</h1>
                <span title="Giáo viên đã xác thực chuyên môn" className="text-emerald-500 text-lg">
                  <CheckCircleFilled />
                </span>
              </div>
              <p className="text-indigo-600 font-medium text-sm mt-1 mb-2">
                {teacher.qualificationSummary || "Giáo viên giảng dạy tại Edunity"}
              </p>
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                  <StarFilled className="text-amber-400 text-xs" />
                  <span className="text-xs font-bold text-slate-800">
                    {teacher.ratingAverage ? teacher.ratingAverage.toFixed(1) : "0.0"}
                  </span>
                  <span className="text-xs text-slate-400">
                    · {teacher.ratingCount > 0 ? `${teacher.ratingCount} đánh giá` : "Chưa có đánh giá"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="self-center md:self-end">
            <Link to={ROUTES.CLASSES}>
              <Button type="default" className="rounded-xl text-xs font-medium">
                Khám phá lớp học
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="about"
        size="large"
        className="font-medium"
        items={[
          {
            key: "about",
            label: "Giới thiệu & Lớp học",
            children: (
              <div className="space-y-8 mt-4">
                {/* Biography */}
                <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white p-6">
                  <h3 className="text-base font-bold text-slate-900 mb-3">Giới thiệu bản thân</h3>
                  <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                    {teacher.biography || (
                      <span className="text-slate-400 italic">
                        Giáo viên chưa cập nhật thông tin giới thiệu chi tiết.
                      </span>
                    )}
                  </div>
                </Card>

                {/* Open Classes */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-900 m-0">
                      Lớp học đang mở đăng ký ({classes.length})
                    </h3>
                  </div>

                  {classes.length === 0 ? (
                    <Card className="rounded-2xl border-slate-200/80 bg-white text-center py-12 shadow-sm">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          <span className="text-slate-500 text-sm">
                            Hiện tại giáo viên chưa có lớp học nào đang mở đăng ký.
                          </span>
                        }
                      />
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {classes.map((cls) => (
                        <div
                          key={cls._id}
                          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <Tag color={cls.classType === "FREE" ? "green" : "blue"}>
                                {cls.classType === "FREE" ? "Miễn phí" : "Có phí"}
                              </Tag>
                              <span className="text-xs text-slate-400">
                                Sĩ số: {cls.enrolledCount}/{cls.capacity}
                              </span>
                            </div>

                            <h4 className="text-base font-bold text-slate-900 mb-1 line-clamp-2">
                              {cls.className}
                            </h4>
                            <p className="text-xs text-indigo-600 font-medium mb-3">
                              Khóa: {cls.courseTitle}
                            </p>

                            {cls.description && (
                              <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                                {cls.description}
                              </p>
                            )}

                            <div className="space-y-1.5 text-xs text-slate-500 mb-4">
                              {cls.startDate && (
                                <div className="flex items-center gap-2">
                                  <CalendarOutlined className="text-slate-400" />
                                  <span>
                                    Khai giảng: {dayjs(cls.startDate).format("DD/MM/YYYY")}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <TeamOutlined className="text-slate-400" />
                                <span>
                                  Còn trống: {Math.max(0, cls.capacity - cls.enrolledCount)} chỗ
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-base font-bold text-slate-900">
                              {cls.classType === "FREE"
                                ? "Miễn phí"
                                : `${Number(cls.price).toLocaleString("vi-VN")}đ`}
                            </span>
                            <Link to={`/classes/${cls._id}`}>
                              <Button
                                type="primary"
                                size="small"
                                className="rounded-lg bg-indigo-600 text-xs px-3"
                              >
                                Xem lớp
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: "reviews",
            label: `Đánh giá từ học viên (${totalReviews})`,
            children: (
              <div className="mt-4">
                <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white p-6">
                  {/* Reviews Summary */}
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 mb-6 border-b border-slate-100">
                    <div className="text-center sm:text-left">
                      <div className="text-4xl font-extrabold text-slate-900">
                        {teacher.ratingAverage ? teacher.ratingAverage.toFixed(1) : "0.0"}
                      </div>
                      <div className="my-1">
                        <Rate
                          disabled
                          allowHalf
                          value={teacher.ratingAverage || 0}
                          className="text-amber-400 text-sm"
                        />
                      </div>
                      <div className="text-xs text-slate-400">
                        {totalReviews} lượt đánh giá tổng thể
                      </div>
                    </div>
                  </div>

                  {/* Reviews List */}
                  {isLoadingReviews ? (
                    <div className="py-8">
                      <Skeleton active avatar paragraph={{ rows: 2 }} />
                    </div>
                  ) : reviews.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <span className="text-slate-400 text-sm">
                          Chưa có đánh giá nào từ học viên.
                        </span>
                      }
                    />
                  ) : (
                    <div className="space-y-6">
                      {reviews.map((rev) => (
                        <div
                          key={rev.id}
                          className="pb-6 border-b border-slate-100 last:border-b-0 last:pb-0"
                        >
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-3">
                              <Avatar
                                src={rev.student?.avatarUrl}
                                icon={!rev.student?.avatarUrl && <UserOutlined />}
                                size={36}
                                className="border border-slate-200"
                              />
                              <div>
                                <h5 className="text-xs font-bold text-slate-800 mb-0.5">
                                  {rev.student?.fullName || "Học viên"}
                                </h5>
                                <span className="text-[11px] text-slate-400">
                                  {dayjs(rev.createdAt).format("DD/MM/YYYY")}
                                </span>
                              </div>
                            </div>
                            <Rate
                              disabled
                              value={rev.rating}
                              className="text-amber-400 text-xs"
                            />
                          </div>
                          {rev.className && (
                            <div className="text-[11px] text-indigo-600 font-medium mb-1.5">
                              Lớp: {rev.className}
                            </div>
                          )}
                          <p className="text-xs text-slate-600 leading-relaxed m-0 whitespace-pre-wrap">
                            {rev.comment}
                          </p>
                        </div>
                      ))}

                      {totalReviews > reviewPageSize && (
                        <div className="flex justify-center pt-4">
                          <Pagination
                            current={reviewPage}
                            pageSize={reviewPageSize}
                            total={totalReviews}
                            onChange={(p) => setReviewPage(p)}
                            size="small"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
