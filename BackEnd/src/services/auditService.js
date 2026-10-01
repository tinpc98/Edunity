const AuditLog = require("../models/AuditLog");

// BR-35 / NFR-15: approval and financial operations performed by Admin must be auditable.
const audit = async ({ actorAdminId, action, targetType, targetId, beforeState, afterState }, session) => {
  await AuditLog.create([{ actorAdminId, action, targetType, targetId, beforeState, afterState }], { session });
};

module.exports = { audit };
