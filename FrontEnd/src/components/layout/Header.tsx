import { Input, Button } from "antd";
import { SearchOutlined, UserOutlined } from "@ant-design/icons";
import { LOGO_URL } from "../../data/homeData";
import { useHomeStore } from "../../stores/useHomeStore";

const NAV_LINKS = [
  { label: "Giới thiệu", href: "#" },
  { label: "Giáo viên", href: "#" },
  { label: "Khóa học", href: "#", active: true },
  { label: "Học bổng", href: "#" },
  { label: "Hỗ trợ", href: "#" }
];

export default function Header() {
  const searchKeyword = useHomeStore((state) => state.searchKeyword);
  const setSearchKeyword = useHomeStore((state) => state.setSearchKeyword);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
      <div className="site-container h-[72px] flex items-center justify-between gap-4">
        {/* Brand & Category Button */}
        <div className="flex items-center gap-4 shrink-0">
          <a href="/" className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Edunity" className="h-9 w-auto object-contain" />
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-indigo-900 leading-none">Edunity</span>
              <span className="text-[9px] font-bold text-indigo-600 tracking-wider uppercase mt-1">Học Trực Tuyến Live</span>
            </div>
          </a>
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-[300px]">
          <Input
            prefix={<SearchOutlined className="text-slate-400 mr-1" />}
            placeholder="Tìm kiếm khóa học, môn học, giáo viên..."
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            allowClear
            className="rounded-full bg-slate-50 border-slate-200 hover:border-indigo-400 focus:border-indigo-600 h-10 text-[13px] px-3"
          />
        </div>

        {/* Navigation & Auth */}
        <div className="flex items-center gap-4 shrink-0">
          <nav className="flex items-center gap-3">
            {NAV_LINKS.map((item, idx) => (
              <a
                key={idx}
                href={item.href}
                className={`text-[13px] font-medium transition-colors ${
                  item.active
                    ? "text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1.5 rounded-md"
                    : "text-slate-600 hover:text-indigo-600"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <Button type="text" className="font-semibold text-[13px] text-slate-700 hover:text-indigo-600 h-10 px-3">
              Đăng nhập
            </Button>
            <Button
              type="primary"
              className="bg-indigo-600 hover:bg-indigo-700 font-semibold text-[13px] rounded-lg h-10 px-4 shadow-sm shadow-indigo-200 border-none"
            >
              Đăng ký miễn phí
            </Button>
            <button className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition">
              <UserOutlined />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}