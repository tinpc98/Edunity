# PHẠM VI BAO PHỦ CÁC ROUTE CÔNG CỘNG (PUBLIC ROUTE COVERAGE)
## EDUNITY V3 — TASK: EDUNITY-PUBLIC-MINT-TEAL-REDESIGN

---

### 1. BẢNG TỔNG HỢP TOÀN BỘ ROUTE CÔNG CỘNG

Tất cả các route dưới đây đã được kiểm tra, rà soát và đồng bộ 100% sang hệ giao diện Mint/Teal:

| Route URL | Component Tương Ứng | Nhóm Chức Năng | Trạng Thái Đồng Bộ |
| :--- | :--- | :--- | :--- |
| `/` | `HomePage` | Trang chủ hệ thống | **ĐÃ HOÀN TẤT** |
| `/classes` | `ClassDiscoveryPage` | Danh sách khám phá lớp học | **ĐÃ HOÀN TẤT** |
| `/classes/:classId` | `ClassDetailPage` | Chi tiết lớp học & Đăng ký nhanh | **ĐÃ HOÀN TẤT** |
| `/courses` | `CoursesPage` | Danh mục & Danh sách khóa học | **ĐÃ HOÀN TẤT** |
| `/courses/:courseId` | `CourseDetailPage` | Chi tiết khóa học | **ĐÃ HOÀN TẤT** |
| `/teachers` | `TeacherDiscoveryPage` | Danh sách giảng viên công khai | **ĐÃ HOÀN TẤT** |
| `/teachers/:teacherId` | `TeacherDetailPage` | Chi tiết hồ sơ & lớp của giảng viên | **ĐÃ HOÀN TẤT** |
| `/campaigns` | `CampaignsPage` | Danh sách chiến dịch học bổng | **ĐÃ HOÀN TẤT** |
| `/campaigns/:campaignId` | `PublicCampaignDetailPage` | Chi tiết chiến dịch & Đóng góp VietQR | **ĐÃ HOÀN TẤT** |
| `/checkout/:enrollmentId` | `CheckoutPage` | Thanh toán học phí trực tiếp | **ĐÃ HOÀN TẤT** |
| `/checkout/:enrollmentId/success` | `PaymentSuccessPage` | Xác thực kết quả thanh toán | **ĐÃ HOÀN TẤT** |
| `/login` | `LoginPage` | Đăng nhập tài khoản | **ĐÃ HOÀN TẤT** |
| `/register` | `RegisterPage` | Đăng ký học sinh (Student) | **ĐÃ HOÀN TẤT** |
| `/register/teacher` | `TeacherRegisterPage` | Đăng ký giảng viên (Teacher) | **ĐÃ HOÀN TẤT** |
| `/register/sponsor` | `SponsorRegisterPage` | Đăng ký nhà tài trợ (Sponsor) | **ĐÃ HOÀN TẤT** |

---

### 2. CHI TIẾT TỪNG COMPONENT TOÀN TRANG

#### 2.1. Header & Navigation Toàn Cục
- `FrontEnd/src/components/layout/Header.tsx`:
  - Brand Logo: `#163B40` (title), `#0D9488` (subtitle "Học Trực Tuyến Live").
  - Thanh menu điều hướng: Trạng thái active dùng nền `#CCFBF1`, chữ `#0F766E`; hover `#0D9488`.
  - Thanh tìm kiếm nhanh dạng pill với icon `#0D9488`, focus border `#0D9488`.
  - Nút đăng nhập/đăng ký với theme Mint/Teal.
  - Tích hợp Drawer responsive trên Mobile với đầy đủ menu điều hướng và phân quyền tài khoản.

#### 2.2. Footer Toàn Cục
- `FrontEnd/src/components/layout/Footer.tsx`:
  - Nền trắng tinh gọn, viền `#D6E5E2`.
  - Icon mạng xã hội bo tròn nền `#F5FAF9`, hover `#CCFBF1`, icon `#0D9488`.
  - Tiêu đề cột `#163B40`, link chuyển trang hover `#0D9488`.

#### 2.3. Trang chủ (`HomePage`)
- Hero Section: Nút CTA Khám phá lớp học `#0D9488`, badge `#0D9488` với icon nổi bật.
- Category Sidebar & Mega Menu: Active link `#0D9488`, highlight group `#F0FDFA` viền `#99F6E4`.
- Stats Strip: Icon container `#CCFBF1` với icon `#0D9488` và `#0F766E`.
- THPT / THCS Sections: SectionHeader chuẩn Mint/Teal, Featured Class Card và Compact Cards viền `#D6E5E2` hover `#0D9488`.
- Featured Teachers Section: Vòng tròn đại diện `#0D9488`/`#14B8A6`, tag xác minh `#CCFBF1`.
- Become Teacher Banner: Gradient từ `#0F766E` qua `#0D9488` đến `#14B8A6`.
- Quỹ Học Bổng Section: Gradient sang trọng, thanh tiến độ gây quỹ `#0D9488`.
