import { Typography, Row, Col } from "antd";
import { BookOutlined } from "@ant-design/icons";
import { trainingOverview } from "../../../../data/mockAdminDashboard";

const { Title, Text } = Typography;

export default function TrainingOverview() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shadow-sm">
            <BookOutlined className="text-[16px]" />
          </div>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Nội dung đào tạo</Title>
        </div>
        <a href="#" className="text-[12px] font-bold text-indigo-600 hover:text-indigo-800">
          Quản lý danh mục →
        </a>
      </div>

      <Row gutter={10} className="mb-3">
        <Col span={12}>
          <div className="p-3 rounded-xl bg-gray-50 text-center border border-gray-100">
            <div className="text-xl font-extrabold text-gray-800">{trainingOverview.courses}</div>
            <Text type="secondary" className="text-[11px] font-medium mt-0.5 block">Course tiêu chuẩn</Text>
          </div>
        </Col>
        <Col span={12}>
          <div className="p-3 rounded-xl bg-indigo-50/50 text-center border border-indigo-100/50">
            <div className="text-xl font-extrabold text-indigo-600">{trainingOverview.classes}</div>
            <Text type="secondary" className="text-[11px] font-medium text-indigo-800/70 mt-0.5 block">Lớp học trực tuyến</Text>
          </div>
        </Col>
      </Row>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80">
          <span className="flex items-center gap-1.5 text-gray-500 text-[12px]">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span> Lớp đang dạy hoạt động
          </span>
          <Text strong className="text-[13px]">{trainingOverview.activeClasses} lớp</Text>
        </div>
        <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80">
          <span className="flex items-center gap-1.5 text-gray-500 text-[12px]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Lớp sắp khai giảng
          </span>
          <Text strong className="text-[13px]">{trainingOverview.upcomingClasses} lớp</Text>
        </div>
      </div>
    </div>
  );
}
