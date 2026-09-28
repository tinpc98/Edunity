import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Tabs, Button, Skeleton, Alert } from "antd";
import { useClassDetailQuery, useClassSessionsQuery } from "./hooks/useClassDiscovery";
import ClassDetailHeader from "./components/ClassDetailHeader";
import ClassSessionsTab from "./components/ClassSessionsTab";
import ClassTeacherTab from "./components/ClassTeacherTab";
import ClassRegistrationCard from "./components/ClassRegistrationCard";

export default function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const [activeTab, setActiveTab] = useState<string>("sessions");

  const { data: item, isLoading: isClassLoading, isError } = useClassDetailQuery(classId);
  const { data: sessions = [], isLoading: isSessionsLoading } = useClassSessionsQuery(classId);

  if (isClassLoading) {
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

  const tabItems = [
    {
      key: "sessions",
      label: (
        <span className="text-sm font-semibold px-1">
          Nội dung lớp học
        </span>
      ),
      children: (
        <ClassSessionsTab sessions={sessions} isLoading={isSessionsLoading} />
      ),
    },
    {
      key: "teacher",
      label: (
        <span className="text-sm font-semibold px-1">
          Giảng viên
        </span>
      ),
      children: <ClassTeacherTab item={item} />,
    },
  ];

  return (
    <div className="site-container py-6 min-h-screen">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Header, Description, Tabs */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <ClassDetailHeader item={item} />

          {/* Two Tabs: 1. Nội dung lớp học, 2. Giảng viên */}
          <div className="class-detail-tabs-wrapper">
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
              size="large"
              className="class-detail-tabs [&_.ant-tabs-nav]:mb-4 [&_.ant-tabs-ink-bar]:bg-indigo-600 [&_.ant-tabs-tab.ant-tabs-tab-active_.ant-tabs-tab-btn]:text-indigo-600 [&_.ant-tabs-tab]:text-slate-600 [&_.ant-tabs-tab:hover]:text-indigo-600 font-medium"
            />
          </div>
        </div>

        {/* Right Side: Sticky Registration Card */}
        <div className="lg:col-span-4 sticky top-24">
          <ClassRegistrationCard item={item} />
        </div>
      </div>
    </div>
  );
}
