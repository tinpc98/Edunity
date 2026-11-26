# Bàn giao FULLSTACK-FIX-01

Các thay đổi bao gồm lịch lớp công khai, trạng thái danh mục, CTA đăng ký, phân trang lịch sử học phí, ngày lịch Việt Nam, validation giữ chỗ, khôi phục lớp từ Thùng rác và ổn định kiểm thử. Kết quả từng mục và điều kiện sẵn sàng nằm trong [bảng nghiệm thu](09_FINAL_GO_NO_GO.md). Chi tiết request và response nằm ở [hợp đồng API](06_API_CONTRACT_CHANGES.md).

## Chạy lại kiểm thử

- Từ `BackEnd/`, chạy `npm test -- --maxWorkers=6`. Jest tự tạo MongoDB tạm cho suite cần database. Có thể đặt `STORAGE_DIR` trỏ tới thư mục thử nghiệm.
- Từ `FrontEnd/`, chạy `npm run lint`, `npm run build` và `npx playwright test` khi đã có trình duyệt Playwright. Dùng API loopback dành cho test. Các ca trình duyệt dùng fixture.
- Chạy dry-run với `node BackEnd/scripts/auditFullstackData.js --db edunity`, sau khi cấp `MONGODB_URI` có quyền chỉ đọc qua môi trường. Script kiểm tra tên database mặc định và chỉ chạy aggregate đọc.

## Dữ liệu cần xác minh

Hai enrollment thiếu hạn, lớp lệch snapshot, lớp mồ côi trong Thùng rác và nhóm lớp `OPEN` có ảnh hưởng học viên được liệt kê theo ID trong [dry-run](04_DATA_REPAIR_DRY_RUN.md). Trước khi xử lý một bản ghi, đối chiếu dữ liệu tạo lớp, lịch sử chỗ, thanh toán và nhật ký tương ứng. MongoDB thật ở chế độ chỉ đọc trong task này.

## Phát hiện ngoài phạm vi

- Nhánh duyệt đối soát thủ công trong `financeService.resolveReconciliation` cộng số chỗ khi chuyển một enrollment chưa ở `CONFIRMED`. Qua đọc mã, việc duyệt một lượt còn giữ chỗ có thể ghi dư một chỗ. Ca phục hồi của suite đối soát mô phỏng lượt đã quá hạn và chưa có ghế trong bộ đếm. Cần xem xét riêng với chủ nghiệp vụ tài chính trước khi đụng dữ liệu đối soát.
- Tích hợp thực FPT eContract, FPT OCR và xác minh trên staging thuộc phạm vi công việc riêng.

## Danh sách file

- [BackEnd/scripts/auditFullstackData.js](../../BackEnd/scripts/auditFullstackData.js)
- [BackEnd/src/controllers/courseCatalogController.js](../../BackEnd/src/controllers/courseCatalogController.js)
- [BackEnd/src/controllers/studentController.js](../../BackEnd/src/controllers/studentController.js)
- [BackEnd/src/models/Enrollment.js](../../BackEnd/src/models/Enrollment.js)
- [BackEnd/src/routes/courseCatalogRoutes.js](../../BackEnd/src/routes/courseCatalogRoutes.js)
- [BackEnd/src/services/adminClassService.js](../../BackEnd/src/services/adminClassService.js)
- [BackEnd/src/services/catalogService.js](../../BackEnd/src/services/catalogService.js)
- [BackEnd/src/services/courseCatalogService.js](../../BackEnd/src/services/courseCatalogService.js)
- [BackEnd/src/services/studentService.js](../../BackEnd/src/services/studentService.js)
- [BackEnd/src/services/trashService.js](../../BackEnd/src/services/trashService.js)
- [BackEnd/src/utils/timezone.js](../../BackEnd/src/utils/timezone.js)
- [BackEnd/tests/adminComplaintsLocalizationV2.test.js](../../BackEnd/tests/adminComplaintsLocalizationV2.test.js)
- [BackEnd/tests/adminFinance.pr6.test.js](../../BackEnd/tests/adminFinance.pr6.test.js)
- [BackEnd/tests/adminFinanceAnalytics.test.js](../../BackEnd/tests/adminFinanceAnalytics.test.js)
- [BackEnd/tests/adminNotificationIntegration.test.js](../../BackEnd/tests/adminNotificationIntegration.test.js)
- [BackEnd/tests/adminPaymentMonitoringV2.test.js](../../BackEnd/tests/adminPaymentMonitoringV2.test.js)
- [BackEnd/tests/adminReconciliationQueueV2.test.js](../../BackEnd/tests/adminReconciliationQueueV2.test.js)
- [BackEnd/tests/adminReconciliationResolutionV3.test.js](../../BackEnd/tests/adminReconciliationResolutionV3.test.js)
- [BackEnd/tests/adminRefundManagementV2.test.js](../../BackEnd/tests/adminRefundManagementV2.test.js)
- [BackEnd/tests/adminReviewCommentModerationV1.test.js](../../BackEnd/tests/adminReviewCommentModerationV1.test.js)
- [BackEnd/tests/adminTeacherPayoutWorkflowV2.test.js](../../BackEnd/tests/adminTeacherPayoutWorkflowV2.test.js)
- [BackEnd/tests/adminTeacherPayoutWorkflowV3.test.js](../../BackEnd/tests/adminTeacherPayoutWorkflowV3.test.js)
- [BackEnd/tests/adminTuitionPaymentsV2.test.js](../../BackEnd/tests/adminTuitionPaymentsV2.test.js)
- [BackEnd/tests/authorization.test.js](../../BackEnd/tests/authorization.test.js)
- [BackEnd/tests/catalogSearch.test.js](../../BackEnd/tests/catalogSearch.test.js)
- [BackEnd/tests/courseCurriculum.test.js](../../BackEnd/tests/courseCurriculum.test.js)
- [BackEnd/tests/courseLifecycleCur12.test.js](../../BackEnd/tests/courseLifecycleCur12.test.js)
- [BackEnd/tests/enrollment.test.js](../../BackEnd/tests/enrollment.test.js)
- [BackEnd/tests/helpers/db.js](../../BackEnd/tests/helpers/db.js)
- [BackEnd/tests/helpers/financialFixtures.js](../../BackEnd/tests/helpers/financialFixtures.js)
- [BackEnd/tests/payosUnifiedIntent.pr1.test.js](../../BackEnd/tests/payosUnifiedIntent.pr1.test.js)
- [BackEnd/tests/schemaInventory.test.js](../../BackEnd/tests/schemaInventory.test.js)
- [BackEnd/tests/sessionJoin.test.js](../../BackEnd/tests/sessionJoin.test.js)
- [BackEnd/tests/sessionLifecycle.test.js](../../BackEnd/tests/sessionLifecycle.test.js)
- [BackEnd/tests/softDeleteArchitecture.test.js](../../BackEnd/tests/softDeleteArchitecture.test.js)
- [BackEnd/tests/softDeleteFinalV2.test.js](../../BackEnd/tests/softDeleteFinalV2.test.js)
- [BackEnd/tests/syllabusVersion.test.js](../../BackEnd/tests/syllabusVersion.test.js)
- [BackEnd/tests/tuitionReconciliationAdminRefund.test.js](../../BackEnd/tests/tuitionReconciliationAdminRefund.test.js)
- [FrontEnd/e2e/class-enrollment-window.spec.ts](../../FrontEnd/e2e/class-enrollment-window.spec.ts)
- [FrontEnd/e2e/payment-finance.spec.ts](../../FrontEnd/e2e/payment-finance.spec.ts)
- [FrontEnd/src/api/classAdapters.ts](../../FrontEnd/src/api/classAdapters.ts)
- [FrontEnd/src/components/admin/AdminStatusBadge.tsx](../../FrontEnd/src/components/admin/AdminStatusBadge.tsx)
- [FrontEnd/src/components/admin/index.ts](../../FrontEnd/src/components/admin/index.ts)
- [FrontEnd/src/components/payment/PaymentQrPanel.tsx](../../FrontEnd/src/components/payment/PaymentQrPanel.tsx)
- [FrontEnd/src/components/payment/PaymentStatusBadge.tsx](../../FrontEnd/src/components/payment/PaymentStatusBadge.tsx)
- [FrontEnd/src/features/class/components/ClassCard.tsx](../../FrontEnd/src/features/class/components/ClassCard.tsx)
- [FrontEnd/src/features/class/components/ClassRegistrationCard.tsx](../../FrontEnd/src/features/class/components/ClassRegistrationCard.tsx)
- [FrontEnd/src/features/class/hooks/useEnrollmentBlock.ts](../../FrontEnd/src/features/class/hooks/useEnrollmentBlock.ts)
- [FrontEnd/src/features/enrollment/CheckoutPage.tsx](../../FrontEnd/src/features/enrollment/CheckoutPage.tsx)
- [FrontEnd/src/features/student/payment/StudentPaymentHistoryPage.tsx](../../FrontEnd/src/features/student/payment/StudentPaymentHistoryPage.tsx)
- [FrontEnd/src/features/teacher/classes/components/ClassConfigForm.tsx](../../FrontEnd/src/features/teacher/classes/components/ClassConfigForm.tsx)
- [FrontEnd/src/features/teacher/classes/components/classConfigFormLogic.ts](../../FrontEnd/src/features/teacher/classes/components/classConfigFormLogic.ts)
- [FrontEnd/src/features/teacher/classes/create/CreateTeacherClassPage.tsx](../../FrontEnd/src/features/teacher/classes/create/CreateTeacherClassPage.tsx)
- [FrontEnd/src/features/teacher/classes/detail/TeacherClassDetailPage.tsx](../../FrontEnd/src/features/teacher/classes/detail/TeacherClassDetailPage.tsx)
- [FrontEnd/src/services/enrollment.service.ts](../../FrontEnd/src/services/enrollment.service.ts)
- [FrontEnd/src/services/gatewayPayment.service.ts](../../FrontEnd/src/services/gatewayPayment.service.ts)
- [FrontEnd/src/types/classDiscovery.ts](../../FrontEnd/src/types/classDiscovery.ts)
- [FrontEnd/src/utils/classEnrollmentWindow.ts](../../FrontEnd/src/utils/classEnrollmentWindow.ts)
- [docs/FULLSTACK-FIX-01/01_CURRENT_STATE.md](../../docs/FULLSTACK-FIX-01/01_CURRENT_STATE.md)
- [docs/FULLSTACK-FIX-01/02_APPLICATION_FIXES.md](../../docs/FULLSTACK-FIX-01/02_APPLICATION_FIXES.md)
- [docs/FULLSTACK-FIX-01/03_DATA_INTEGRITY_AUDIT.md](../../docs/FULLSTACK-FIX-01/03_DATA_INTEGRITY_AUDIT.md)
- [docs/FULLSTACK-FIX-01/04_DATA_REPAIR_DRY_RUN.md](../../docs/FULLSTACK-FIX-01/04_DATA_REPAIR_DRY_RUN.md)
- [docs/FULLSTACK-FIX-01/05_TEST_STABILIZATION.md](../../docs/FULLSTACK-FIX-01/05_TEST_STABILIZATION.md)
- [docs/FULLSTACK-FIX-01/06_API_CONTRACT_CHANGES.md](../../docs/FULLSTACK-FIX-01/06_API_CONTRACT_CHANGES.md)
- [docs/FULLSTACK-FIX-01/07_INTEGRATION_TEST_EVIDENCE.md](../../docs/FULLSTACK-FIX-01/07_INTEGRATION_TEST_EVIDENCE.md)
- [docs/FULLSTACK-FIX-01/08_REGRESSION_RESULTS.md](../../docs/FULLSTACK-FIX-01/08_REGRESSION_RESULTS.md)
- [docs/FULLSTACK-FIX-01/09_FINAL_GO_NO_GO.md](../../docs/FULLSTACK-FIX-01/09_FINAL_GO_NO_GO.md)
- [docs/FULLSTACK-FIX-01/10_FINAL_HANDOVER.md](../../docs/FULLSTACK-FIX-01/10_FINAL_HANDOVER.md)
