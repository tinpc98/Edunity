const express = require("express");
const financeController = require("../controllers/financeController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const payoutService = require("../services/payoutService");
const { handle, parsePaging } = require("../utils/http");
const router = express.Router();

const teacher = [authMiddleware, requireRole("TEACHER")];
const admin = [authMiddleware, requireRole("ADMIN")];

router.get("/teacher/earnings", authMiddleware, financeController.getTeacherEarnings);
router.get("/admin/payments", authMiddleware, financeController.getAdminPayments);
router.get("/admin/transactions", authMiddleware, financeController.getAdminTransactions);

// F02 — Teacher payouts of AVAILABLE earnings (released when a class is COMPLETED)
router.get("/teacher/payouts", teacher, handle((req) => payoutService.listMyPayouts(req.user.id)));
router.post("/teacher/payouts", teacher, handle((req) => payoutService.requestPayout(req.user.id, req.body || {}), 201));
router.get("/admin/payouts", admin, handle((req) => payoutService.adminListPayouts(req.query, parsePaging(req.query))));
router.post("/admin/payouts/:id/complete", admin, handle((req) => payoutService.completePayout(req.user.id, req.params.id, req.body || {})));
router.post("/admin/payouts/:id/reject", admin, handle((req) => payoutService.rejectPayout(req.user.id, req.params.id, req.body || {})));

module.exports = router;
