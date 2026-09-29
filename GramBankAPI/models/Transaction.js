const mongoose = require("mongoose");

const txnSchema = new mongoose.Schema({
  txn_id: { type: String, required: true, unique: true },

  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  to_account: { type: String },
  to_upi: { type: String },
  from_account: { type: String },
  from_upi: { type: String },

  ifsc: { type: String },
  beneficiary_name: { type: String },

  amount: { type: Number, required: true },
  balance_before: { type: Number, required: true },
  balance_after: { type: Number, required: true },

  type: { type: String, enum: ["DEBIT", "CREDIT"], required: true },

  hour: Number,
  day: Number,
  txns_last_24h: Number,
  avg_amount_7d: Number,
  location_delta_km: Number,
  is_foreign_device: { type: Number, default: 0 },

  is_fraud: { type: Boolean, default: false },
  fraud_reason: { type: String, default: null },

  is_suspicious: { type: Boolean, default: false },
  suspicious_flags: [{ type: String }],
  risk_score: { type: Number, default: 0 },
  risk_factors: [{ name: String, points: Number }],

  time_since_last_txn_seconds: { type: Number, default: null },
  rapid_sequence_detected: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

txnSchema.index({ user_id: 1, createdAt: -1 });
txnSchema.index({ user_id: 1, to_account: 1, createdAt: -1 });
txnSchema.index({ user_id: 1, to_upi: 1, createdAt: -1 });
txnSchema.index({ amount: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", txnSchema);
