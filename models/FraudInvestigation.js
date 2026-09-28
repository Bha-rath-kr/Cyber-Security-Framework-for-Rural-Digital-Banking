const mongoose = require("mongoose");

const fraudInvestigationSchema = new mongoose.Schema({
  complaint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TransactionReport",
    required: true,
    unique: true
  },
  complaintIdStr: { type: String },
  reportedUser: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    accountNumber: { type: String },
    name: { type: String },
    phoneNumber: { type: String },
    upiId: { type: String }
  },
  status: {
    type: String,
    enum: ["INVESTIGATING", "CLEARED", "FRAUD_CONFIRMED"],
    default: "INVESTIGATING"
  },
  adminName: { type: String },
  findings: { type: String },
  startedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date }
}, { timestamps: true });

fraudInvestigationSchema.index({ status: 1 });
fraudInvestigationSchema.index({ "reportedUser.accountNumber": 1 });

module.exports = mongoose.model("FraudInvestigation", fraudInvestigationSchema);
