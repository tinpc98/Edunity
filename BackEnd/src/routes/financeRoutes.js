const express = require("express");
const financeController = require("../controllers/financeController");
const mockAuth = require("../middlewares/mockAuth");
const router = express.Router();

router.get("/teacher/earnings", mockAuth, financeController.getTeacherEarnings);
router.get("/admin/payments", mockAuth, financeController.getAdminPayments);
router.get("/admin/transactions", mockAuth, financeController.getAdminTransactions);

module.exports = router;
