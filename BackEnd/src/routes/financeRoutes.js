const express = require("express");
const financeController = require("../controllers/financeController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const router = express.Router();

const teacher = [authMiddleware, requireRole("TEACHER")];
const admin = [authMiddleware, requireRole("ADMIN")];

// =======================
// Teacher Finance Routes
// =======================
router.get("/teacher/earnings", teacher, financeController.getTeacherEarnings);
router.get("/teacher/finance/earnings", teacher, financeController.getTeacherEarnings);
router.get("/teacher/settlements", teacher, financeController.getTeacherSettlements);
router.get("/teacher/finance/settlements", teacher, financeController.getTeacherSettlements);
router.get("/teacher/payouts", teacher, financeController.teacherListPayouts);
router.get("/teacher/withdrawals", teacher, financeController.teacherListPayouts);
router.post("/teacher/payouts", teacher, financeController.teacherRequestPayout);
router.post("/teacher/withdrawals", teacher, financeController.teacherRequestPayout);
router.get("/teacher/payouts/:id", teacher, financeController.getPayoutDetails);
router.get("/teacher/withdrawals/:id", teacher, financeController.getPayoutDetails);

// =====================
// Admin Payouts Routes
// =====================
router.get("/admin/payouts", admin, financeController.getAdminPayouts);
router.get("/finance/admin/payouts", admin, financeController.getAdminPayouts);
router.get("/admin/finance/withdrawals", admin, financeController.getAdminPayouts);

router.get("/admin/payouts/:id", admin, financeController.getPayoutDetails);
router.get("/finance/admin/payouts/:id", admin, financeController.getPayoutDetails);
router.get("/admin/finance/withdrawals/:id", admin, financeController.getPayoutDetails);

router.post("/admin/payouts/:id/approve", admin, financeController.approvePayout);
router.post("/finance/admin/payouts/:id/approve", admin, financeController.approvePayout);
router.post("/admin/finance/withdrawals/:id/approve", admin, financeController.approvePayout);

router.post("/admin/payouts/:id/complete", admin, financeController.completePayout);
router.post("/finance/admin/payouts/:id/complete", admin, financeController.completePayout);
router.post("/admin/finance/withdrawals/:id/complete", admin, financeController.completePayout);

router.post("/admin/payouts/:id/reject", admin, financeController.rejectPayout);
router.post("/finance/admin/payouts/:id/reject", admin, financeController.rejectPayout);
router.post("/admin/finance/withdrawals/:id/reject", admin, financeController.rejectPayout);

router.post("/admin/settlements/evaluate", admin, financeController.evaluateSettlements);
router.post("/finance/admin/settlements/evaluate", admin, financeController.evaluateSettlements);

// ======================
// Admin Overview & Data
// ======================
router.get("/admin/overview", admin, financeController.getFinanceOverview);
router.get("/finance/admin/overview", admin, financeController.getFinanceOverview);
router.get("/admin/finance/overview", admin, financeController.getFinanceOverview);

router.get("/admin/payments", admin, financeController.getAdminPayments);
router.get("/finance/admin/payments", admin, financeController.getAdminPayments);

router.get("/admin/transactions", admin, financeController.getAdminTransactions);
router.get("/finance/admin/transactions", admin, financeController.getAdminTransactions);
router.get("/admin/finance/transactions", admin, financeController.getAdminTransactions);

router.get("/admin/bank-events", admin, financeController.getAdminBankEvents);
router.get("/finance/admin/bank-events", admin, financeController.getAdminBankEvents);

router.get("/admin/bank-events/:id", admin, financeController.getAdminBankEventById);
router.get("/finance/admin/bank-events/:id", admin, financeController.getAdminBankEventById);

router.get("/admin/reconciliations", admin, financeController.getAdminReconciliations);
router.get("/finance/admin/reconciliations", admin, financeController.getAdminReconciliations);

router.get("/admin/reconciliations/:id", admin, financeController.getAdminReconciliationById);
router.get("/finance/admin/reconciliations/:id", admin, financeController.getAdminReconciliationById);

router.patch("/admin/reconciliations/:id/assign", admin, financeController.assignReconciliation);
router.patch("/finance/admin/reconciliations/:id/assign", admin, financeController.assignReconciliation);

router.post("/admin/reconciliations/:id/notes", admin, financeController.addReconciliationNote);
router.post("/finance/admin/reconciliations/:id/notes", admin, financeController.addReconciliationNote);

// ======================
// Payout Proof Verification
// ======================
router.post("/admin/payouts/:id/verify", admin, financeController.verifyPayoutProof);
router.post("/finance/admin/payouts/:id/verify", admin, financeController.verifyPayoutProof);

// ======================
// Admin Refund Routes (PR8)
// ======================
router.get("/admin/refunds", admin, financeController.listRefundCases);
router.get("/admin/finance/refunds", admin, financeController.listRefundCases);
router.get("/finance/admin/refunds", admin, financeController.listRefundCases);

router.get("/admin/refunds/:id", admin, financeController.getRefundCaseById);
router.get("/admin/finance/refunds/:id", admin, financeController.getRefundCaseById);
router.get("/finance/admin/refunds/:id", admin, financeController.getRefundCaseById);

router.post("/admin/refunds", admin, financeController.createRefundCase);
router.post("/admin/finance/refunds", admin, financeController.createRefundCase);
router.post("/finance/admin/refunds", admin, financeController.createRefundCase);

router.post("/admin/refunds/:id/review", admin, financeController.reviewRefundCase);
router.post("/admin/finance/refunds/:id/review", admin, financeController.reviewRefundCase);
router.post("/finance/admin/refunds/:id/review", admin, financeController.reviewRefundCase);

router.post("/admin/refunds/:id/approve", admin, financeController.approveRefundCase);
router.post("/admin/finance/refunds/:id/approve", admin, financeController.approveRefundCase);
router.post("/finance/admin/refunds/:id/approve", admin, financeController.approveRefundCase);

router.post("/admin/refunds/:id/reject", admin, financeController.rejectRefundCase);
router.post("/admin/finance/refunds/:id/reject", admin, financeController.rejectRefundCase);
router.post("/finance/admin/refunds/:id/reject", admin, financeController.rejectRefundCase);

router.post("/admin/refunds/:id/evidence", admin, financeController.submitRefundProof);
router.post("/admin/finance/refunds/:id/evidence", admin, financeController.submitRefundProof);
router.post("/finance/admin/refunds/:id/evidence", admin, financeController.submitRefundProof);

router.post("/admin/refunds/:id/verify", admin, financeController.verifyAndCompleteRefund);
router.post("/admin/finance/refunds/:id/verify", admin, financeController.verifyAndCompleteRefund);
router.post("/finance/admin/refunds/:id/verify", admin, financeController.verifyAndCompleteRefund);

module.exports = router;
