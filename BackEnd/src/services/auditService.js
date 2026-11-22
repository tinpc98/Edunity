const AuditLog = require("../models/AuditLog");

// BR-35 / NFR-15: approval and financial operations performed by Admin or System must be auditable.
const audit = async (
  { actorAdminId = null, actorType = "ADMIN", action, targetType, targetId, beforeState, afterState },
  session
) => {
  const finalActorType = !actorAdminId || actorType === "SYSTEM" ? "SYSTEM" : "ADMIN";
  await AuditLog.create(
    [{ actorAdminId, actorType: finalActorType, action, targetType, targetId, beforeState, afterState }],
    { session }
  );
};

module.exports = { audit };
