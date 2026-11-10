const campaigns = require("../services/campaignService");
const contributions = require("../services/contributionService");
const scholarships = require("../services/scholarshipService");
const paperDossiers = require("../services/paperDossierService");
const scholarshipPayments = require("../services/scholarshipPaymentService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};

// Campaigns — public
exports.listCampaigns = handle((req) => campaigns.listCampaigns(req.query, parsePaging(req.query)));
exports.getCampaign = handle((req) => campaigns.getPublicCampaign(req.params.id));

// Campaigns — Admin
exports.adminListCampaigns = handle((req) => campaigns.adminListCampaigns(req.query, parsePaging(req.query)));
exports.adminGetCampaign = handle((req) => campaigns.adminGetCampaign(req.params.id));
exports.createCampaign = handle((req) => campaigns.createCampaign(req.user.id, body(req)), 201);
exports.updateCampaign = handle((req) => campaigns.updateCampaign(req.user.id, req.params.id, body(req)));
exports.getCampaignChecklist = handle((req) => campaigns.getCampaignChecklist(req.params.id, req.user?.role));
exports.updateCampaignChecklist = handle((req) => campaigns.updateCampaignChecklist(req.user.id, req.params.id, body(req)));
exports.publishCampaign = handle((req) => campaigns.publishCampaign(req.user.id, req.params.id));
exports.closeCampaign = handle((req) => campaigns.closeCampaign(req.user.id, req.params.id));
exports.adminListContributions = handle((req) =>
  contributions.adminListContributions(req.params.id, req.query, parsePaging(req.query))
);

// Sponsor
exports.createContribution = handle((req) => contributions.createContribution(req.user.id, req.params.id, body(req)), 201);
exports.getMyContributions = handle((req) => contributions.getMyContributions(req.user.id, req.query, parsePaging(req.query)));
exports.getCampaignImpact = handle((req) => contributions.getCampaignImpact(req.user.id, req.params.id));

// Student
exports.applyForScholarship = handle((req) => scholarships.applyForScholarship(req.user.id, req.params.id, body(req)), 201);
exports.createDossier = handle((req) => scholarships.createDossier(req.user.id, req.params.id, body(req)), 201);
exports.updateDossier = handle((req) => scholarships.updateDossier(req.user.id, req.params.id, body(req)));
exports.submitDossier = handle((req) => scholarships.submitDossier(req.user.id, req.params.id, body(req)));
exports.resubmitApplication = handle((req) => scholarships.resubmitApplication(req.user.id, req.params.id, body(req)));
exports.withdrawDossier = handle((req) => scholarships.withdrawDossier(req.user.id, req.params.id, body(req)));
exports.getMyApplications = handle((req) => scholarships.getMyApplications(req.user.id, parsePaging(req.query)));
exports.getMyApplicationDetail = handle((req) => scholarships.getMyApplicationDetail(req.user.id, req.params.id));
exports.getMyApplicationPaperReceipts = handle((req) =>
  paperDossiers.studentGetApplicationPaperReceipts(req.user.id, req.params.id)
);
exports.getMyScholarships = handle((req) => scholarships.getMyScholarships(req.user.id));
exports.payWithScholarship = handle((req) =>
  scholarshipPayments.payWithScholarship(req.user.id, req.params.id, body(req).scholarshipId)
);

// Scholarship applications — Admin
exports.adminListApplications = handle((req) => scholarships.adminListApplications(req.query, parsePaging(req.query)));
exports.adminGetApplication = handle((req) => scholarships.adminGetApplication(req.params.id));
exports.verifyDossierApplication = handle((req) => scholarships.verifyDossierApplication(req.user.id, req.params.id, body(req)));
exports.adminReviewApplicationDocument = handle((req) =>
  scholarships.adminReviewApplicationDocument(req.user.id, req.params.id, req.params.documentId, body(req))
);
exports.approveApplication = handle((req) => scholarships.approveApplication(req.user.id, req.params.id, body(req)));
exports.rejectApplication = handle((req) => scholarships.rejectApplication(req.user.id, req.params.id, body(req)));
exports.requestInformation = handle((req) => scholarships.requestInformation(req.user.id, req.params.id, body(req)));

// Paper Dossier Receipt — Admin (AID-04)
exports.intakePaperDossier = handle((req) => paperDossiers.intakePaperDossier(req.user.id, body(req)), 201);
exports.adminListPaperReceipts = handle((req) => paperDossiers.adminListPaperReceipts(req.query, parsePaging(req.query)));
exports.adminGetPaperReceipt = handle((req) => paperDossiers.adminGetPaperReceipt(req.params.id));
exports.linkPaperDossier = handle((req) => paperDossiers.linkPaperDossierToApplication(req.user.id, req.params.id, body(req)));
exports.reconcilePaperDossier = handle((req) => paperDossiers.reconcilePaperDossier(req.user.id, req.params.id, body(req)));
exports.rejectPaperDossier = handle((req) => paperDossiers.rejectPaperDossier(req.user.id, req.params.id, body(req)));
exports.cancelPaperDossier = handle((req) => paperDossiers.cancelPaperDossier(req.user.id, req.params.id, body(req)));
