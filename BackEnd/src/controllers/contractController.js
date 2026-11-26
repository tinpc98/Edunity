const contracts = require("../services/teacherContractService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};
const reqMeta = (req) => ({
  ip: req.ip || null,
  userAgent: (req.headers && req.headers["user-agent"]) || null,
});

// Teacher
exports.listMyContracts = handle((req) => contracts.listMyContracts(req.user.id));
exports.getMyContractDetail = handle((req) =>
  contracts.getMyContractDetail(req.user.id, req.params.id, reqMeta(req))
);
exports.signMyContract = handle((req) =>
  contracts.signMyContract(req.user.id, req.params.id, body(req), reqMeta(req))
);
exports.rejectMyContract = handle((req) =>
  contracts.rejectMyContract(req.user.id, req.params.id, body(req), reqMeta(req))
);
exports.sandboxSign = handle((req) =>
  contracts.sandboxSign(req.user.id, req.params.id, body(req), reqMeta(req))
);

// Shared PDF download / signed URL handler for Teacher & Admin
const handlePdfRequest = async (req, res, next) => {
  try {
    const result = await contracts.getContractPdf(req.user, req.params.id, req.query || {}, reqMeta(req));
    if (req.query && req.query.stream === "true" && result.buffer) {
      const disposition = req.query.download === "true" ? "attachment" : "inline";
      res.set({
        "Content-Type": result.mimeType || "application/pdf",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Document-SHA256": result.sha256Hash || "",
      });
      return res.status(200).send(result.buffer);
    }
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

exports.getMyContractPdf = handlePdfRequest;
exports.adminGetContractPdf = handlePdfRequest;

// Admin
exports.adminListAllContracts = handle((req) =>
  contracts.adminListAllContracts(req.query || {}, parsePaging(req.query))
);
exports.adminGetContractDetail = handle((req) =>
  contracts.adminGetContractDetail(req.user.id, req.params.id)
);
exports.adminListContracts = handle((req) => contracts.adminListContracts(req.params.teacherId));
exports.adminCreateContract = handle(
  (req) => contracts.adminCreateContract(req.user.id, req.params.teacherId, body(req), reqMeta(req)),
  201
);
exports.adminRetryContract = handle((req) =>
  contracts.ensureContractOnVerificationApproved(
    req.user.id,
    req.params.teacherId,
    body(req),
    reqMeta(req)
  )
);
exports.adminEndContract = handle((req) =>
  contracts.adminEndContract(req.user.id, req.params.id, body(req), reqMeta(req))
);

// Public Contract Integrity Verification (Safe metadata + SHA-256 hash check only)
exports.verifyContractPublic = handle((req) =>
  contracts.verifyContractPublic(req.params.code, req.query || {})
);

// FPT.eContract webhook: the HMAC over the raw body is the credential
exports.econtractWebhook = handle((req) => contracts.handleWebhook(req.rawBody, req.headers));
