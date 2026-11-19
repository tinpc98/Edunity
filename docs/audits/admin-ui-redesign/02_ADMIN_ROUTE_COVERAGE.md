# EDUNITY V3 — DANH MỤC ĐỘ PHỦ TẤT CẢ CÁC TUYẾN ĐƯỜNG ADMIN
**TASK ID:** `EDUNITY-V3-ADMIN-FULL-UI-REDESIGN`  
**NGÀY THỰC HIỆN:** 19/11/2026  

---

## I. MA TRẬN 22 ROUTE ADMIN HIỆN HỮU TRONG ỨNG DỤNG

Bảng đối chiếu toàn bộ các tuyến đường Admin được khai báo trong `FrontEnd/src/app/router.tsx` và phương án hiện đại hóa theo chuẩn thiết kế Mint/Teal:

| STT | Phân Nhóm | Route Đường Dẫn | Component Hiện Hữu | Nguồn Thiết Kế Áp Dụng | Trạng Thái Migration |
|---|---|---|---|---|---|
| 1 | **TỔNG QUAN** | `/admin` | `AdminHomePage.tsx` | `t_ng_quan_edunity_admin_dashboard` | Sẵn sàng triển khai |
| 2 | **QUẢN LÝ HỆ THỐNG** | `/admin/users` | `AdminUsersPage.tsx` | `qu_n_l_ng_i_d_ng_danh_s_ch_t_i_kho_n` | Sẵn sàng triển khai (Modal Centered) |
| 3 | | `/admin/classes` | `AdminClassesPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 4 | | `/admin/classes/:classId` | `AdminClassDetailPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 5 | | `/admin/catalog` | `AdminCatalogPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 6 | | `/admin/course-proposals` | `AdminCourseProposalsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 7 | | `/admin/teachers/verifications` | `TeacherVerificationPage.tsx` | `x_c_minh_gi_o_vi_n_danh_s_ch_ch_duy_t` | Sẵn sàng triển khai |
| 8 | | `/admin/teachers/verifications/:teacherId` | `TeacherVerificationDetailPage.tsx` | `chi_ti_t_h_s_x_c_minh_gi_o_vi_n_ts._nguy_n_ho_ng_nam` | Sẵn sàng triển khai |
| 9 | **HỌC BỔNG** | `/admin/campaigns` | `AdminCampaignsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 10 | | `/admin/campaigns/create` | `CreateCampaignPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 11 | | `/admin/campaigns/:campaignId` | `CampaignDetailPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 12 | | `/admin/scholarship-applications` | `ScholarshipApplicationsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 13 | | `/admin/scholarship-applications/:applicationId` | `ScholarshipApplicationReviewPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 14 | | `/admin/paper-dossiers` | `PaperDossierIntakePage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 15 | **TÀI CHÍNH & ĐỐI SOÁT** | `/admin/finance-overview` | `AdminFinanceOverviewPage.tsx` | `t_ng_quan_t_i_ch_nh_i_so_t_edunity_fintech` | Sẵn sàng triển khai |
| 16 | | `/admin/transactions` | `AdminTransactionsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 17 | | `/admin/reconciliations` | `AdminReconciliationsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 18 | | `/admin/bank-events` | `AdminBankEventsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 19 | | `/admin/payments` | `AdminPaymentsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 20 | | `/admin/payouts` | `AdminPayoutsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 21 | | `/admin/refunds` | `AdminRefundsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |
| 22 | **VẬN HÀNH** | `/admin/reports` | `AdminReportsPage.tsx` | Chuẩn Admin Mint/Teal System | Sẵn sàng triển khai |

---

## II. KẾ HOẠCH TRIỂN KHAI THEO NHÓM MÀN HÌNH

1. **Khung vỏ dùng chung (Admin Shell):**
   - Tạo `AdminLayout.tsx` chuyên biệt với `AdminSidebar.tsx` và `AdminHeader.tsx` chuẩn Mint/Teal.
   - Bọc Ant Design `ConfigProvider` chuyên biệt cho phân hệ Admin với các tokens Mint/Teal chuẩn.
2. **Bộ UI Components dùng chung (`FrontEnd/src/components/admin/`):**
   - `AdminPageHeader.tsx`
   - `AdminKpiCard.tsx`
   - `AdminSectionCard.tsx`
   - `AdminStatusBadge.tsx`
   - `AdminDataTable.tsx`
   - `AdminEmptyState.tsx`, `AdminLoadingState.tsx`
3. **4 Phân hệ Trọng tâm (Stitch Mocks):**
   - Admin Dashboard (`AdminHomePage.tsx` và các component con)
   - User Management (`AdminUsersPage.tsx` + Centered Modal User Detail)
   - Teacher Verification & Dossier Review (`TeacherVerificationPage.tsx` + `TeacherVerificationDetailPage.tsx`)
   - Finance Overview (`AdminFinanceOverviewPage.tsx`)
4. **Phủ toàn bộ 18 màn hình còn lại:**
   - Catalog, Courses, Proposals, Pricing, Classes, Detail
   - Campaigns, Applications, Paper Dossiers, Consent
   - Finance Ledger, Reconciliations, Bank Events, Payments, Payouts, Refunds
   - Complaints & Reports
