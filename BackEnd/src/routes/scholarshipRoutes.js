const express = require("express");
const controller = require("../controllers/scholarshipController");
const mockAuth = require("../middlewares/mockAuth");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [mockAuth, requireRole("ADMIN")];
const sponsor = [mockAuth, requireRole("SPONSOR")];
const student = [mockAuth, requireRole("STUDENT")];

// Scholarship Campaign — public
router.get("/campaigns", controller.listCampaigns);
router.get("/campaigns/:id", controller.getCampaign);

// Scholarship Campaign — Admin only (BR-16). There is intentionally no POST /sponsor/campaigns.
router.get("/admin/campaigns", admin, controller.adminListCampaigns);
router.post("/admin/campaigns", admin, controller.createCampaign);
router.get("/admin/campaigns/:id", admin, controller.adminGetCampaign);
router.patch("/admin/campaigns/:id", admin, controller.updateCampaign);
router.post("/admin/campaigns/:id/publish", admin, controller.publishCampaign);
router.post("/admin/campaigns/:id/close", admin, controller.closeCampaign);
router.get("/admin/campaigns/:id/contributions", admin, controller.adminListContributions);

// Sponsor Contribution
router.post("/campaigns/:id/contributions", sponsor, controller.createContribution);
router.get("/sponsor/contributions", sponsor, controller.getMyContributions);
router.get("/sponsor/campaigns/:id/impact", sponsor, controller.getCampaignImpact);

// Scholarship — Student
router.post("/campaigns/:id/applications", student, controller.applyForScholarship);
router.get("/me/scholarship-applications", student, controller.getMyApplications);
router.post("/me/scholarship-applications/:id/resubmit", student, controller.resubmitApplication);
router.get("/me/scholarships", student, controller.getMyScholarships);
router.post("/enrollments/:id/scholarship-payment", student, controller.payWithScholarship);

// Scholarship — Admin
router.get("/admin/scholarship-applications", admin, controller.adminListApplications);
router.get("/admin/scholarship-applications/:id", admin, controller.adminGetApplication);
router.post("/admin/scholarship-applications/:id/approve", admin, controller.approveApplication);
router.post("/admin/scholarship-applications/:id/reject", admin, controller.rejectApplication);
router.post("/admin/scholarship-applications/:id/request-information", admin, controller.requestInformation);

module.exports = router;
