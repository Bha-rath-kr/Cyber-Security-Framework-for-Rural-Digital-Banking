const mongoose = require("mongoose");

const adminActionSchema = new mongoose.Schema({
  complaintId: { type: String, ref: "TransactionReport", required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  adminName: { type: String, required: true },
  actionType: {
    type: String,
    enum: ["ACCEPT", "REJECT", "MARK_FRAUD", "SUSPEND", "BLOCK", "INVESTIGATE", "CLEAR"],
    required: true
  },
  reason: { type: String, default: "" },
  notes: { type: String },
  impact: {
    userFrozen: { type: Boolean, default: false },
    addedToFraudList: { type: Boolean, default: false },
    transactionsBlocked: { type: Number, default: 0 }
  },
  timestamp: { type: Date, default: Date.now }
});

adminActionSchema.index({ complaintId: 1, timestamp: -1 });
adminActionSchema.index({ adminId: 1, timestamp: -1 });

module.exports = mongoose.model("AdminAction", adminActionSchema);
