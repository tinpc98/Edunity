import { Typography, Row, Col } from "antd";
import { BookOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { AdminDashboardTraining } from "../../../../types/adminDashboard";

const { Title, Text } = Typography;

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
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shadow-sm">
            <BookOutlined className="text-[16px]" />
          </div>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Nội dung đào tạo</Title>
        </div>
        <button 
          onClick={() => navigate("/admin/catalog")}
          className="text-[12px] font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer p-0"
        >
          Quản lý danh mục →
        </button>
      </div>

      <Row gutter={10} className="mb-3">
        <Col span={12}>
          <div 
            onClick={() => navigate("/admin/catalog")}
            className="p-3 rounded-xl bg-gray-50 text-center border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <div className="text-xl font-extrabold text-gray-800">{courses}</div>
            <Text type="secondary" className="text-[11px] font-medium mt-0.5 block">Course tiêu chuẩn</Text>
          </div>
        </Col>
        <Col span={12}>
          <div 
            onClick={() => navigate("/admin/classes")}
            className="p-3 rounded-xl bg-indigo-50/50 text-center border border-indigo-100/50 cursor-pointer hover:bg-indigo-100/50 transition-colors"
          >
            <div className="text-xl font-extrabold text-indigo-600">{classes}</div>
            <Text type="secondary" className="text-[11px] font-medium text-indigo-800/70 mt-0.5 block">Lớp học trực tuyến</Text>
          </div>
        </Col>
      </Row>

      <div className="flex flex-col gap-1.5">
        <div 
          onClick={() => navigate("/admin/classes")}
          className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 cursor-pointer hover:bg-gray-100"
        >
          <span className="flex items-center gap-1.5 text-gray-500 text-[12px]">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span> Lớp đang dạy hoạt động
          </span>
          <Text strong className="text-[13px]">{activeClasses} lớp</Text>
        </div>
        <div 
          onClick={() => navigate("/admin/classes")}
          className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 cursor-pointer hover:bg-gray-100"
        >
          <span className="flex items-center gap-1.5 text-gray-500 text-[12px]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Lớp sắp khai giảng
          </span>
          <Text strong className="text-[13px]">{upcomingClasses} lớp</Text>
        </div>
      </div>
    </div>
  );
}
