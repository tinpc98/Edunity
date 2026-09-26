import { useState, useEffect } from "react";
import { Input, Select, Tag } from "antd";
import { SearchOutlined, CloseCircleOutlined } from "@ant-design/icons";
import type { SortOption } from "../../../types/classDiscovery";

interface SearchToolbarProps {
  total: number;
  searchValue: string;
  sortValue: SortOption;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: SortOption) => void;
  activeFilterTags?: Array<{ key: string; label: string; onRemove: () => void }>;
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "relevance", label: "Phù hợp nhất" },
  { value: "upcoming", label: "Sắp khai giảng" },
  { value: "price_asc", label: "Giá: Thấp đến cao" },
  { value: "price_desc", label: "Giá: Cao đến thấp" },
  { value: "rating", label: "Đánh giá cao nhất" },
];

export default function SearchToolbar({
  total,
  searchValue,
  sortValue,
  onSearchChange,
  onSortChange,
  activeFilterTags = [],
}: SearchToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchValue);
  const [prevSearchValue, setPrevSearchValue] = useState(searchValue);

  if (searchValue !== prevSearchValue) {
    setPrevSearchValue(searchValue);
    setLocalSearch(searchValue);
  }

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== searchValue) {
        onSearchChange(localSearch);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [localSearch, searchValue, onSearchChange]);

  return (
    <div className="flex flex-col gap-3 w-full bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
      {/* Top row: Search input + Sort selector */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 max-w-xl">
          <Input
            id="class-search-input"
            prefix={<SearchOutlined className="text-slate-400 mr-1" />}
            placeholder="Tìm lớp học, môn học, khóa học hoặc giáo viên..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            allowClear
            size="large"
            className="rounded-lg text-sm bg-slate-50/70 border-slate-200 hover:border-indigo-400 focus:border-indigo-600"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
            Sắp xếp theo:
          </span>
          <Select
            id="class-sort-select"
            value={sortValue}
            onChange={onSortChange}
            options={SORT_OPTIONS}
            className="w-44"
            size="middle"
          />
        </div>
      </div>

      {/* Bottom row: Result counter & Active filter pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
        <div className="font-semibold text-slate-700">
          <span className="text-indigo-600 font-bold text-sm mr-1">
            {total}
          </span>
          lớp học phù hợp
        </div>

        {activeFilterTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 mr-1">Đang lọc:</span>
            {activeFilterTags.map((tag) => (
              <Tag
                key={tag.key}
                closable
                onClose={(e) => {
                  e.preventDefault();
                  tag.onRemove();
                }}
                closeIcon={<CloseCircleOutlined className="text-indigo-400 hover:text-indigo-600" />}
                className="bg-indigo-50 border-indigo-200 text-indigo-700 rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1"
              >
                {tag.label}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
