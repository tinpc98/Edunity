import type { NewsItem, StatItem, Testimonial } from "../types/home";

export const LOGO_URL = "https://lh3.googleusercontent.com/aida-public/AB6AXuB8J3cE2D-jqio5ErG4GcmCBJ3_LphYBmN3fr-vy0vNEPUU7Qz_HUMqjpdoJ8-pESfWgaDlTpnE5LM16zwXsbPOIqpq6Dhv_AHmUTNSP2LWnYvm5Nk2FAN8I9Ui8NV3dxlywxVM5Sxq9IZjqSNNDO8mrDUi50cZm5vIS8RS-T33XAY7S3v_0y--5Hpybu_7wPFKUIlqcOBWhYf8gQ6BnPHewR2ZM7Sr05AHscClqqkO7RNgqq4b6DXr";
export const HERO_BANNER_URL = "https://lh3.googleusercontent.com/aida-public/AB6AXuA6MkSB_fYEquFuNn8hfzOPN_A0gMncQ46DgAvEvRy53XdlqtgsdauRRaoWH3rQRHChbeL3oXl9LwyHM9SVdimVKlxLsGVQwizadBDYJLmdj4JcK7bHz0L1p5WN87MbAqorprypZVNXzKV1ALsUGuxgaj7Q1JJskioORHVKVl9D3k18t89yVvp2VU5PqdCxS80GQ65-b26JRwR9kpOhk1dDXK6W2Ojc3YbQXPtKZIylQCPVyLNrdWXu";

export const STATS_ITEMS: StatItem[] = [
  { icon: "ShieldCheck", title: "Giáo Viên Uy Tín", desc: "100% Thạc sĩ & Chuyên gia" },
  { icon: "Video", title: "Live HD Không Lag", desc: "Bảng tương tác số 2 chiều" },
  { icon: "Users", title: "Lớp Học Nhỏ", desc: "Tối đa 8 - 15 học viên/lớp" },
  { icon: "Star", title: "4.9 / 5 Đánh Giá", desc: "Hơn 45.000 học sinh tin chọn" }
];

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "test-1",
    name: "Lê Minh Anh",
    role: "Học sinh Lớp 12 • Hà Nội (Đỗ Ngoại Thương)",
    badge: "Toán 12 Live Pro",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    comment: "Học Toán thầy Đức giải thích cực kỳ dễ hiểu, từ một đứa mất gốc em đã tự tin đạt 9.2 bài thi thử trường THPT Chuyên. Lớp học tương tác vui vẻ, đặt câu hỏi qua micro được thầy trả lời và chữa luôn trên bảng số."
  },
  {
    id: "test-2",
    name: "Trần Bảo Châu",
    role: "Học sinh Lớp 9 • Đà Nẵng (Đỗ Chuyên Lê Quý Đôn)",
    badge: "Luyện Thi Vào 10",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80",
    comment: "Em vừa đỗ Chuyên Lê Quý Đôn nhờ khóa Luyện thi vào 10 của Edunity! Nền tảng học mượt mà, bài tập về nhà được thầy cô chấm chữa chi tiết từng câu sai, chỉ rõ lỗi trình bày để tránh bị trừ điểm oan."
  },
  {
    id: "test-3",
    name: "Nguyễn Quốc Huy",
    role: "Học sinh Lớp 11 • TP. Hồ Chí Minh",
    badge: "Phòng Luyện HSA",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80",
    comment: "Giao diện hiện đại, dễ dàng tìm kiếm giáo viên phù hợp phong cách học và được hỗ trợ suốt học bổng khi gia đình gặp khó khăn. Em rất biết ơn Edunity vì đã giúp việc học trực tuyến không còn nhàm chán."
  }
];

export const NEWS_LIST: NewsItem[] = [
  {
    id: "news-1",
    tag: "Kỳ Thi 2025",
    date: "15 Tháng 3, 2025 • 6 phút đọc",
    title: "Công bố cấu trúc đề thi Đánh giá năng lực (HSA, TSA) 2025 và chiến thuật ôn luyện",
    desc: "Phân tích ma trận kiến thức định lượng, tư duy khoa học và định tính theo định dạng đề chuẩn mới nhất.",
    image: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "news-2",
    tag: "Kỹ Năng Học",
    date: "12 Tháng 3, 2025 • 4 phút đọc",
    title: "Phương pháp Pomodoro & Active Recall giúp học sinh cấp 3 ghi nhớ kiến thức gấp đôi",
    desc: "Bí quyết phân bổ thời gian học 25 phút tập trung cao độ kết hợp hệ thống flashcard thông minh được kiểm chứng.",
    image: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=80"
  },
  {
    id: "news-3",
    tag: "Gương Sáng",
    date: "08 Tháng 3, 2025 • 5 phút đọc",
    title: "Câu chuyện học viên: Từ học sinh mất gốc đến thủ khoa khối D01 tỉnh Nam Định",
    desc: "Hành trình kiên trì 8 tháng học trực tiếp cùng các giáo viên tại Edunity để bứt phá từ điểm 5 lên 28.5 điểm thi thử.",
    image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
  }
];