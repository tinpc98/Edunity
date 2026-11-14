const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const privacy = require("../services/scholarshipPrivacyService");
const { handle, parsePaging } = require("../utils/http");

// BAO-11: guardian consent (AID-08), student public stories, sponsor-facing anonymised stories
const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const student = [authMiddleware, requireRole("STUDENT")];
const sponsor = [authMiddleware, requireRole("SPONSOR")];

router.get("/student/guardian-consents", student, handle((req) => privacy.listMyConsents(req.user.id)));
router.post("/student/guardian-consents", student, handle((req) => privacy.submitConsent(req.user.id, req.body), 201));
router.post("/student/guardian-consents/:id/revoke", student, handle((req) => privacy.revokeConsent(req.user.id, req.params.id)));
router.put("/student/scholarship-applications/:id/public-story", student, handle((req) => privacy.setPublicStory(req.user.id, req.params.id, req.body)));

router.get("/sponsor/campaigns/:id/stories", sponsor, handle((req) => privacy.listCampaignStories(req.user.id, req.params.id)));

router.get("/admin/guardian-consents", admin, handle((req) => privacy.adminListConsents(req.query, parsePaging(req.query))));
router.post("/admin/guardian-consents/:id/verify", admin, handle((req) => privacy.adminReviewConsent(req.user.id, req.params.id, req.body, "VERIFIED")));
router.post("/admin/guardian-consents/:id/reject", admin, handle((req) => privacy.adminReviewConsent(req.user.id, req.params.id, req.body, "REJECTED")));

module.exports = router;
