const mongoose = require("mongoose");

const fraudAccountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phoneNumber: {
    type: String,
    unique: true,
    sparse: true,
    match: /^[6-9]\d{9}$/
  },
  accountNumber: { type: String, unique: true, sparse: true },
  upiId: { type: String, unique: true, sparse: true },
  ifsc: { type: String },
  reason: { type: String, required: true },
  fraudType: {
    type: String,
    enum: [
      "PHISHING",
      "FAKE_INVESTMENT",
      "IDENTITY_THEFT",
      "CREDIT_CARD_FRAUD",
      "UPI_SCAM",
      "ACCOUNT_TAKEOVER",
      "SOCIAL_ENGINEERING",
      "MONEY_MULE",
      "OTHER"
    ],
    required: true
  },
  riskLevel: {
    type: String,
    enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    required: true
  },
  reportedBy: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

fraudAccountSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

fraudAccountSchema.index({ isActive: 1 });
fraudAccountSchema.index({ fraudType: 1 });
fraudAccountSchema.index({ riskLevel: 1 });

module.exports = mongoose.model("FraudAccount", fraudAccountSchema);
