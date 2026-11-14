const contracts = require("../services/teacherContractService");
const { handle } = require("../utils/http");

const body = (req) => req.body || {};

// Teacher
exports.listMyContracts = handle((req) => contracts.listMyContracts(req.user.id));
exports.sandboxSign = handle((req) => contracts.sandboxSign(req.user.id, req.params.id, body(req)));

// Admin
exports.adminListContracts = handle((req) => contracts.adminListContracts(req.params.teacherId));
exports.adminCreateContract = handle((req) => contracts.adminCreateContract(req.user.id, req.params.teacherId, body(req)), 201);
exports.adminEndContract = handle((req) => contracts.adminEndContract(req.user.id, req.params.id, body(req)));

// FPT.eContract webhook: the HMAC over the raw body is the credential
exports.econtractWebhook = handle((req) => contracts.handleWebhook(req.rawBody, req.headers));
