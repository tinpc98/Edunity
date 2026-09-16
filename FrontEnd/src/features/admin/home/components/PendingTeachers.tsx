import { Typography, Button, Avatar, Tag } from "antd";
import { pendingTeachers } from "../../../../data/mockAdminDashboard";
import { ArrowRightOutlined, CheckOutlined, CalculatorOutlined, GlobalOutlined, ExperimentOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function PendingTeachers() {
  const getSubjectIcon = (subject: string) => {
    if (subject.includes('Toán')) return <CalculatorOutlined className="text-indigo-600" />;
    if (subject.includes('Anh')) return <GlobalOutlined className="text-indigo-600" />;
    return <ExperimentOutlined className="text-indigo-600" />;
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Giáo viên chờ xác minh</Title>
          <Text type="secondary" className="text-[11px] mt-0.5">Hồ sơ bằng cấp, chứng chỉ chuyên môn đang chờ phê duyệt</Text>
        </div>
        <Button type="link" className="font-bold text-indigo-600 p-0 flex items-center text-[12px]">
          Xem tất cả (5) <ArrowRightOutlined className="ml-1" />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {pendingTeachers.map(teacher => (
          <div key={teacher.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100/70 transition-all gap-3 border border-transparent hover:border-gray-200">
            <div className="flex items-center gap-3">
              <Avatar shape="square" size={40} src={teacher.avatar} className="rounded-lg shadow-sm shrink-0" />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Text strong className="text-[14px] leading-tight">{teacher.name}</Text>
                  <Tag color="gold" className="m-0 border-0 rounded-full font-bold px-1.5 py-0 text-[10px] leading-tight">Chờ duyệt</Tag>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-500">
                  <span className="flex items-center gap-1 font-medium">
                    {getSubjectIcon(teacher.subject)}
                    {teacher.subject}
                  </span>
                  <span>•</span>
                  <span className="truncate max-w-[150px]">{teacher.qualifications}</span>
                  <span>•</span>
                  <Text type="secondary" className="text-[11px]">Gửi: {teacher.submitDate}</Text>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <Button className="rounded-[10px] font-semibold shadow-sm border border-gray-200 h-8 px-3 text-[12px]">
                Xem hồ sơ
              </Button>
              <Button type="primary" className="bg-indigo-600 shadow-sm rounded-[10px] font-bold h-8 px-3 flex items-center text-[12px]">
                <CheckOutlined className="mr-1" /> Duyệt nhanh
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
