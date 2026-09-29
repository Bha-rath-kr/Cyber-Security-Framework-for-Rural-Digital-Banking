const mongoose = require("mongoose");

const scheduledTxnSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  txn_id: { type: String, required: true, unique: true },

  to_account: { type: String },
  to_upi: { type: String },
  from_account: { type: String },
  ifsc: { type: String },
  beneficiary_name: { type: String },

  amount: { type: Number, required: true },
  balance_before: { type: Number, required: true },
  balance_after: { type: Number, required: true },

  type: { type: String, enum: ["DEBIT", "CREDIT"], required: true },

  status: {
    type: String,
    enum: ["PENDING", "HOLD_FOR_REVIEW", "APPROVED_BY_ADMIN", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REJECTED", "EXPIRED", "FRAUD_REPORTED", "REFUNDED"],
    default: "PENDING"
  },

  scheduled_at: { type: Date, required: true },
  auto_process_at: { type: Date, required: true },
  processed_at: { type: Date },

  delay_reason: { type: String, default: null },

  riskScore: { type: Number, default: 0 },
  riskBreakdown: [{ name: String, points: Number }],
  fraudDecision: { type: String, default: null },

  fraud_check_passed: { type: Boolean, default: true },

  is_reported: { type: Boolean, default: false },
  report_reason: { type: String, default: null },

  processing_locked: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

scheduledTxnSchema.index({ status: 1, auto_process_at: 1 });
scheduledTxnSchema.index({ user_id: 1, status: 1 });

module.exports = mongoose.model("ScheduledTransaction", scheduledTxnSchema);
