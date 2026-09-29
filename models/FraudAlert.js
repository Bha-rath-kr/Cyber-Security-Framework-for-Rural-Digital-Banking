const mongoose = require("mongoose");

const fraudAlertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction"
  },
  scheduledTxnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ScheduledTransaction"
  },
  upiCollectRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UPICollectRequest"
  },
  riskScore: {
    type: Number,
    required: true,
    min: 0,
    max: 200
  },
  anomalyScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },
  riskReasons: [{
    type: String
  }],
  riskFactors: [{ name: String, points: Number }],
  fraudType: {
    type: String,
    enum: ["PHISHING", "FAKE_INVESTMENT", "IDENTITY_THEFT", "CREDIT_CARD_FRAUD", "UPI_SCAM", "ACCOUNT_TAKEOVER", "SOCIAL_ENGINEERING", "MONEY_MULE", "OTHER"],
    default: "OTHER"
  },
  decision: {
    type: String,
    enum: ["SAFE", "WARNING", "HOLD_FOR_REVIEW", "TEMP_FREEZE"],
    required: true
  },
  status: {
    type: String,
    enum: ["OPEN", "UNDER_REVIEW", "CLEARED", "CONFIRMED_FRAUD", "RESOLVED"],
    default: "OPEN"
  },
  adminNotes: {
    type: String
  },
  reviewedBy: {
    type: String
  },
  reviewedAt: {
    type: Date
  },
  resolvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

fraudAlertSchema.index({ userId: 1, createdAt: -1 });
fraudAlertSchema.index({ status: 1 });
fraudAlertSchema.index({ riskScore: -1 });

module.exports = mongoose.model("FraudAlert", fraudAlertSchema);
