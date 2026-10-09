import { Typography, Button, Avatar, Tag, Skeleton } from "antd";
import { ArrowRightOutlined, CheckOutlined, UserOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { teacherVerificationService } from "../../../../services/teacherVerification.service";
import type { AdminTeacherVerificationListItem } from "../../../../types/teacherVerification";

const { Title, Text } = Typography;

export default function PendingTeachers() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-pending-teachers-preview"],
    queryFn: () => teacherVerificationService.adminListVerifications("PENDING", 1, 3),
  });

  const rawData = data as any;
  const items: AdminTeacherVerificationListItem[] = rawData?.items || rawData?.data || [];
  const total = rawData?.total ?? rawData?.paging?.total ?? items.length;

  const formatDate = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      return new Date(isoString).toLocaleDateString("vi-VN");
    } catch {
      return "-";
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Giáo viên chờ xác minh</Title>
          <Text type="secondary" className="text-[11px] mt-0.5">Hồ sơ bằng cấp, chứng chỉ chuyên môn đang chờ phê duyệt</Text>
        </div>
        <Button 
          type="link" 
          onClick={() => navigate("/admin/teachers/verifications")}
          className="font-bold text-indigo-600 p-0 flex items-center text-[12px] cursor-pointer"
        >
          Xem tất cả ({total}) <ArrowRightOutlined className="ml-1" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 py-2">
          <Skeleton active avatar paragraph={{ rows: 1 }} />
          <Skeleton active avatar paragraph={{ rows: 1 }} />
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 bg-gray-50 rounded-xl text-center">
          <Text type="secondary" className="text-[13px]">Hiện tại không có giáo viên nào đang chờ xác minh.</Text>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((teacher: AdminTeacherVerificationListItem) => (
            <div 
              key={teacher.teacherId} 
              className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100/70 transition-all gap-3 border border-transparent hover:border-gray-200"
            >
              <div className="flex items-center gap-3">
                <Avatar 
                  shape="square" 
                  size={40} 
                  icon={<UserOutlined />} 
                  className="rounded-lg shadow-sm shrink-0 bg-indigo-100 text-indigo-600 font-bold" 
                />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Text strong className="text-[14px] leading-tight">{teacher.fullName || teacher.email}</Text>
                    <Tag color="gold" className="m-0 border-0 rounded-full font-bold px-1.5 py-0 text-[10px] leading-tight">Chờ duyệt</Tag>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-500">
                    <span className="font-medium text-gray-600">{teacher.email}</span>
                    <span>•</span>
                    <Text type="secondary" className="text-[11px]">Cập nhật: {formatDate(teacher.updatedAt)}</Text>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <Button 
                  onClick={() => navigate(`/admin/teachers/verifications/${teacher.teacherId}`)}
                  className="rounded-[10px] font-semibold shadow-sm border border-gray-200 h-8 px-3 text-[12px] cursor-pointer"
                >
                  Xem hồ sơ
                </Button>
                <Button 
                  type="primary" 
                  onClick={() => navigate(`/admin/teachers/verifications/${teacher.teacherId}`)}
                  className="bg-indigo-600 shadow-sm rounded-[10px] font-bold h-8 px-3 flex items-center text-[12px] cursor-pointer"
                >
                  <CheckOutlined className="mr-1" /> Thẩm định
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
