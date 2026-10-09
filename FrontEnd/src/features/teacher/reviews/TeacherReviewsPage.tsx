import React, { useState } from "react";
import {
  Card,
  Rate,
  Avatar,
  Pagination,
  Empty,
  Spin,
  Typography,
  Tag,
  Row,
  Col,
} from "antd";
import {
  StarFilled,
  UserOutlined,
  BookOutlined,
  SmileOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../../stores/auth.store";
import { reviewService, reviewKeys } from "../../../services/review.service";

const { Title, Text, Paragraph } = Typography;

export const TeacherReviewsPage: React.FC = () => {
  const { user } = useAuthStore();
  const teacherId = user?.userId || (user as any)?.id;
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Fetch reviews for current teacher
  const { data, isLoading } = useQuery({
    queryKey: reviewKeys.byTeacher(teacherId || "", { page, pageSize }),
    queryFn: () =>
      reviewService.getTeacherReviews(teacherId || "", { page, pageSize }),
    enabled: Boolean(teacherId),
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const ratingAverage = data?.ratingAverage || 0;
  const ratingCount = data?.ratingCount || 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Title level={2} className="!mb-2 flex items-center gap-2">
          <StarFilled className="text-amber-500" />
          Đánh giá từ học viên
        </Title>
        <Text type="secondary">
          Xem tất cả nhận xét và điểm đánh giá học viên gửi cho các lớp học của bạn.
        </Text>
      </div>

      {/* Aggregate Stats Cards */}
      <Row gutter={[16, 16]} className="mb-8">
        <Col xs={24} sm={12} md={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-2xs bg-gradient-to-br from-amber-50/50 to-orange-50/30">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 text-2xl font-black">
                <StarFilled />
              </div>
              <div>
                <Text type="secondary" className="text-xs font-semibold uppercase tracking-wider">
                  Điểm trung bình
                </Text>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-slate-800">
                    {ratingAverage > 0 ? ratingAverage.toFixed(1) : "0.0"}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">/ 5.0</span>
                </div>
                <Rate
                  disabled
                  allowHalf
                  value={ratingAverage}
                  className="text-amber-400 text-xs mt-1"
                />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-2xs bg-gradient-to-br from-indigo-50/50 to-blue-50/30">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 text-2xl">
                <SmileOutlined />
              </div>
              <div>
                <Text type="secondary" className="text-xs font-semibold uppercase tracking-wider">
                  Tổng lượt đánh giá
                </Text>
                <div className="text-3xl font-black text-slate-800 mt-0.5">
                  {ratingCount}
                </div>
                <Text type="secondary" className="text-xs mt-1 block">
                  Từ các học viên đã hoàn thành khóa
                </Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Reviews List */}
      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-base">
            Danh sách nhận xét ({total})
          </h3>
        </div>

        {isLoading ? (
          <div className="py-20 flex justify-center items-center">
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Chưa có học viên nào gửi đánh giá."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((review) => (
              <div key={review.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={review.student.avatarUrl}
                      icon={<UserOutlined />}
                      size={42}
                      className="bg-indigo-600 shrink-0 mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800">
                          {review.student.fullName || "Học viên"}
                        </span>
                        {review.className && (
                          <Tag
                            color="cyan"
                            className="text-[11px] font-medium rounded-full px-2 py-0 border-0 flex items-center gap-1"
                          >
                            <BookOutlined className="text-[10px]" />
                            {review.className}
                          </Tag>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Rate
                          disabled
                          value={review.rating}
                          className="text-amber-400 text-xs"
                        />
                        <span className="text-xs text-slate-400">
                          {new Date(review.createdAt).toLocaleDateString("vi-VN")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {review.comment ? (
                  <Paragraph className="text-slate-600 text-sm mt-3 ml-13 leading-relaxed whitespace-pre-line mb-0">
                    {review.comment}
                  </Paragraph>
                ) : (
                  <Text italic className="text-slate-400 text-xs mt-2 ml-13 block">
                    (Không có nhận xét viết kèm)
                  </Text>
                )}
              </div>
            ))}
          </div>
        )}

        {total > pageSize && (
          <div className="p-4 border-t border-slate-100 flex justify-end">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
              showSizeChanger
              pageSizeOptions={["10", "20", "50"]}
            />
          </div>
        )}
      </Card>
    </div>
  );
};
