const express = require("express");
const financeController = require("../controllers/financeController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();

router.get("/teacher/earnings", authMiddleware, financeController.getTeacherEarnings);
router.get("/admin/payments", authMiddleware, financeController.getAdminPayments);
router.get("/admin/transactions", authMiddleware, financeController.getAdminTransactions);

module.exports = router;
