import { FileTextOutlined } from "@ant-design/icons";
import AdminSyllabusManagementPage from "./AdminSyllabusManagementPage";

export default function AdminSyllabusPage() {
  return (
    <div className="space-y-5 p-6 bg-[#F8FAFC] min-h-screen">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Admin</span>
            <span>›</span>
            <span className="font-semibold text-teal-700">Giáo trình & Phiên bản</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center text-lg">
              <FileTextOutlined />
            </div>
            <h1 className="text-xl font-bold text-[#163B40] m-0">Quản lý Giáo trình & Phiên bản</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 mb-0">
            Quản lý nội dung học thuật, đề cương bài giảng và các phiên bản syllabus theo từng khóa học.
          </p>
        </div>
      </div>

      {/* Main Syllabus Content */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <AdminSyllabusManagementPage />
      </div>
    </div>
  );
}
