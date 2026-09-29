const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  entityType: {
    type: String,
    enum: ["COMPLAINT", "USER", "TRANSACTION", "FRAUD_ACCOUNT"],
    required: true
  },
  entityId: { type: String, required: true },
  action: { type: String, required: true },
  previousState: { type: mongoose.Schema.Types.Mixed },
  newState: { type: mongoose.Schema.Types.Mixed },
  performedBy: {
    type: { type: String, enum: ["USER", "ADMIN", "SYSTEM"], required: true },
    id: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String },
    role: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  timestamp: { type: Date, default: Date.now },
  reason: { type: String }
}, { timestamps: true });

auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ "performedBy.id": 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
