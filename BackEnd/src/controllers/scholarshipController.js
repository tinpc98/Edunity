const campaigns = require("../services/campaignService");
const contributions = require("../services/contributionService");
const scholarships = require("../services/scholarshipService");
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
exports.resubmitApplication = handle((req) => scholarships.resubmitApplication(req.user.id, req.params.id, body(req)));
exports.getMyApplications = handle((req) => scholarships.getMyApplications(req.user.id, parsePaging(req.query)));
exports.getMyScholarships = handle((req) => scholarships.getMyScholarships(req.user.id));
exports.payWithScholarship = handle((req) =>
  scholarshipPayments.payWithScholarship(req.user.id, req.params.id, body(req).scholarshipId)
);

// Scholarship applications — Admin
exports.adminListApplications = handle((req) => scholarships.adminListApplications(req.query, parsePaging(req.query)));
exports.adminGetApplication = handle((req) => scholarships.adminGetApplication(req.params.id));
exports.approveApplication = handle((req) => scholarships.approveApplication(req.user.id, req.params.id, body(req)));
exports.rejectApplication = handle((req) => scholarships.rejectApplication(req.user.id, req.params.id, body(req)));
exports.requestInformation = handle((req) => scholarships.requestInformation(req.user.id, req.params.id, body(req)));
