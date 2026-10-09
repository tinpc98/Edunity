import React, { useState } from "react";
import { Card, Rate, Avatar, Button, Empty, Spin, Pagination, Typography } from "antd";
import { UserOutlined, EditOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../../stores/auth.store";
import { reviewService, reviewKeys } from "../../../services/review.service";
import { CreateReviewModal } from "../../reviews/components/CreateReviewModal";

const { Paragraph } = Typography;

interface ClassReviewsTabProps {
  classId: string;
  className: string;
  teacherId?: string;
}

export const ClassReviewsTab: React.FC<ClassReviewsTabProps> = ({
  classId,
  className,
}) => {
  const { user, isAuthenticated } = useAuthStore();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isStudent = isAuthenticated && user?.role === "STUDENT";

  const { data, isLoading } = useQuery({
    queryKey: reviewKeys.byClass(classId, { page, pageSize }),
    queryFn: () => reviewService.getClassReviews(classId, { page, pageSize }),
    enabled: Boolean(classId),
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const ratingAverage = data?.ratingAverage || 0;
  const ratingCount = data?.ratingCount || 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Overview Card */}
      <Card className="rounded-2xl border-slate-200/80 shadow-2xs bg-gradient-to-br from-amber-50/40 via-white to-slate-50/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="text-center sm:text-left">
              <div className="text-4xl font-black text-slate-800 tracking-tight">
                {ratingAverage > 0 ? ratingAverage.toFixed(1) : "0.0"}
              </div>
              <Rate
                disabled
                allowHalf
                value={ratingAverage}
                className="text-amber-400 text-sm mt-1"
              />
              <div className="text-xs text-slate-500 mt-1">
                {ratingCount} đánh giá từ học viên
              </div>
            </div>
          </div>

          {isStudent && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => setIsModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-10 px-5 font-semibold shrink-0"
            >
              Viết đánh giá
            </Button>
          )}
        </div>
      </Card>

      {/* Reviews List */}
      <Card className="rounded-2xl border-slate-200/80 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <Spin size="default" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Lớp học chưa có đánh giá nào."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((review) => (
              <div key={review.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={review.student.avatarUrl}
                      icon={<UserOutlined />}
                      size={36}
                      className="bg-indigo-600"
                    />
                    <div>
                      <h4 className="font-semibold text-sm text-slate-800">
                        {review.student.fullName || "Học viên"}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
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

                {review.comment && (
                  <Paragraph className="text-slate-600 text-sm mt-2.5 ml-12 mb-0 leading-relaxed whitespace-pre-line">
                    {review.comment}
                  </Paragraph>
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
              size="small"
            />
          </div>
        )}
      </Card>

      {/* Review Modal */}
      {isStudent && (
        <CreateReviewModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          classId={classId}
          className={className}
        />
      )}
    </div>
  );
};
