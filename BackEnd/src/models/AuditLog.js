const mongoose = require("mongoose");
const { Schema } = mongoose;

// BR-35 / NFR-15: admin approval and financial operations must be auditable.
const auditLogSchema = new Schema(
  {
    actorAdminId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    beforeState: Schema.Types.Mixed,
    afterState: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ actorAdminId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
