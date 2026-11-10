const express = require("express");
const controller = require("../controllers/scholarshipController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const sponsor = [authMiddleware, requireRole("SPONSOR")];
const student = [authMiddleware, requireRole("STUDENT")];
const studentOrAdmin = [authMiddleware, requireRole("STUDENT", "ADMIN")];

// Scholarship Campaign — public
router.get("/campaigns", controller.listCampaigns);
router.get("/campaigns/:id", controller.getCampaign);
router.get("/campaigns/:id/checklist", studentOrAdmin, controller.getCampaignChecklist);

// Scholarship Campaign — Admin only (BR-16). There is intentionally no POST /sponsor/campaigns.
router.get("/admin/campaigns", admin, controller.adminListCampaigns);
router.post("/admin/campaigns", admin, controller.createCampaign);
router.get("/admin/campaigns/:id", admin, controller.adminGetCampaign);
router.patch("/admin/campaigns/:id", admin, controller.updateCampaign);
router.put("/admin/campaigns/:id/checklist", admin, controller.updateCampaignChecklist);
router.post("/admin/campaigns/:id/publish", admin, controller.publishCampaign);
router.post("/admin/campaigns/:id/close", admin, controller.closeCampaign);
router.get("/admin/campaigns/:id/contributions", admin, controller.adminListContributions);

// Sponsor Contribution
router.post("/campaigns/:id/contributions", sponsor, controller.createContribution);
router.get("/sponsor/contributions", sponsor, controller.getMyContributions);
router.get("/sponsor/campaigns/:id/impact", sponsor, controller.getCampaignImpact);

// Scholarship — Student
router.post("/campaigns/:id/applications", student, controller.applyForScholarship);
router.post("/campaigns/:id/dossiers", student, controller.createDossier);
router.get("/me/scholarship-applications", student, controller.getMyApplications);
router.get("/me/scholarship-applications/:id", student, controller.getMyApplicationDetail);
router.get("/me/scholarship-applications/:id/paper-receipts", student, controller.getMyApplicationPaperReceipts);
router.patch("/me/scholarship-dossiers/:id", student, controller.updateDossier);
router.post("/me/scholarship-dossiers/:id/submit", student, controller.submitDossier);
router.post("/me/scholarship-dossiers/:id/withdraw", student, controller.withdrawDossier);
router.post("/me/scholarship-applications/:id/resubmit", student, controller.resubmitApplication);
router.get("/me/scholarships", student, controller.getMyScholarships);
router.post("/enrollments/:id/scholarship-payment", student, controller.payWithScholarship);

// Scholarship — Admin
router.get("/admin/scholarship-applications", admin, controller.adminListApplications);
router.get("/admin/scholarship-applications/:id", admin, controller.adminGetApplication);
router.post("/admin/scholarship-applications/:id/verify-dossier", admin, controller.verifyDossierApplication);
router.patch("/admin/scholarship-applications/:id/documents/:documentId/review", admin, controller.adminReviewApplicationDocument);
router.post("/admin/scholarship-applications/:id/approve", admin, controller.approveApplication);
router.post("/admin/scholarship-applications/:id/reject", admin, controller.rejectApplication);
router.post("/admin/scholarship-applications/:id/request-information", admin, controller.requestInformation);

// Paper Dossier Receipt — Admin (AID-04)
router.post("/admin/paper-dossiers", admin, controller.intakePaperDossier);
router.get("/admin/paper-dossiers", admin, controller.adminListPaperReceipts);
router.get("/admin/paper-dossiers/:id", admin, controller.adminGetPaperReceipt);
router.post("/admin/paper-dossiers/:id/link", admin, controller.linkPaperDossier);
router.post("/admin/paper-dossiers/:id/reconcile", admin, controller.reconcilePaperDossier);
router.post("/admin/paper-dossiers/:id/reject", admin, controller.rejectPaperDossier);
router.post("/admin/paper-dossiers/:id/cancel", admin, controller.cancelPaperDossier);

module.exports = router;
