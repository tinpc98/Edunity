import { Row, Col } from "antd";
import { BookOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { AdminDashboardTraining } from "../../../../types/adminDashboard";
import AdminSectionCard from "../../../../components/admin/AdminSectionCard";

interface TrainingOverviewProps {
  training?: AdminDashboardTraining;
}

export default function TrainingOverview({ training }: TrainingOverviewProps) {
  const navigate = useNavigate();

  const courses = training?.courses || 0;
  const classes = training?.classes || 0;
  const activeClasses = training?.activeClasses || 0;
  const upcomingClasses = training?.upcomingClasses || 0;

  return (
    <AdminSectionCard
      title="Nội dung đào tạo"
      icon={<BookOutlined />}
      extra={
        <button
          onClick={() => navigate("/admin/catalog")}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#0F766E] hover:text-[#0D9488] transition-colors cursor-pointer"
        >
          <span>Danh mục</span>
          <ArrowRightOutlined className="text-[10px]" />
        </button>
      }
    >
      <Row gutter={10} className="mb-3">
        <Col span={12}>
          <div
            onClick={() => navigate("/admin/catalog")}
            className="p-3 rounded-xl bg-[#F0F8F6] text-center border border-[#D6E5E2] cursor-pointer hover:bg-[#E5F5F1] hover:border-[#99F6E4] transition-all"
          >
            <div className="text-xl font-extrabold text-[#163B40]">{courses}</div>
            <span className="text-[11px] font-bold text-[#64748B] mt-0.5 block">
              Khóa học chuẩn
            </span>
          </div>
        </Col>
        <Col span={12}>
          <div
            onClick={() => navigate("/admin/classes")}
            className="p-3 rounded-xl bg-[#CCFBF1] text-center border border-[#99F6E4] cursor-pointer hover:bg-teal-200 transition-all"
          >
            <div className="text-xl font-extrabold text-[#0F766E]">{classes}</div>
            <span className="text-[11px] font-bold text-[#0F766E] mt-0.5 block">
              Lớp học trực tuyến
            </span>
          </div>
        </Col>
      </Row>

      <div className="flex flex-col gap-2">
        <div
          onClick={() => navigate("/admin/classes")}
          className="flex items-center justify-between p-2.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] cursor-pointer hover:bg-[#E5F5F1] transition-colors text-xs"
        >
          <span className="flex items-center gap-1.5 text-[#334155] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Lớp đang hoạt động</span>
          </span>
          <span className="font-bold text-[#163B40]">{activeClasses} lớp</span>
        </div>

        <div
          onClick={() => navigate("/admin/classes")}
          className="flex items-center justify-between p-2.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] cursor-pointer hover:bg-[#E5F5F1] transition-colors text-xs"
        >
          <span className="flex items-center gap-1.5 text-[#334155] font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Lớp sắp khai giảng</span>
          </span>
          <span className="font-bold text-[#163B40]">{upcomingClasses} lớp</span>
        </div>
      </div>
    </AdminSectionCard>
  );
}
