const express = require("express");
const controller = require("../controllers/trashController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];

router.get("/admin/trash", admin, controller.listTrash);
router.get("/admin/trash/:type/:id", admin, controller.getTrashDetail);
router.post("/admin/trash/:type/:id/restore", admin, controller.restoreTrashItem);
router.delete("/admin/trash/:type/:id/permanent", admin, controller.permanentDeleteTrashItem);

module.exports = router;
