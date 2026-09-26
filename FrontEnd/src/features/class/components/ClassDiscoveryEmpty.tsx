import { Button } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";

interface ClassDiscoveryEmptyProps {
  onResetFilters: () => void;
}

export default function ClassDiscoveryEmpty({
  onResetFilters,
}: ClassDiscoveryEmptyProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center flex flex-col items-center justify-center my-4 shadow-sm">
      <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mb-4 text-2xl">
        <SearchOutlined />
      </div>

      <h3 className="text-base font-bold text-slate-800 mb-1">
        Không tìm thấy lớp học phù hợp
      </h3>

      <p className="text-xs text-slate-500 max-w-sm mb-6">
        Rất tiếc, hiện không có lớp học nào thỏa mãn các điều kiện tìm kiếm hoặc bộ lọc bạn vừa chọn.
      </p>

      <Button
        type="primary"
        icon={<ReloadOutlined />}
        onClick={onResetFilters}
        className="bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold rounded-lg h-9 px-5 border-none shadow-sm"
      >
        Xóa tất cả bộ lọc
      </Button>
    </div>
  );
}
