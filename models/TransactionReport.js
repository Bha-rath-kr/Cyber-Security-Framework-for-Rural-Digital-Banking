const mongoose = require("mongoose");

const transactionReportSchema = new mongoose.Schema({
  complaintId: {
    type: String,
    required: true,
    unique: true,
  },
/**
 * =========================
 * DASHBOARD SUMMARY CARDS
 * =========================
 * GET /api/dashboard/stats
 */
  reporter: {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    accountNumber: { type: String, required: true },
    phoneNumber: { type: String, required: true }
  },

  reported: {
    accountNumber: { type: String, default: "UNKNOWN" },
    upiId: { type: String },
    name: { type: String },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },

  relatedTransaction: {
    txn_id: { type: String },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["DEBIT", "CREDIT", "UPI", "BANK_TRANSFER"], default: "BANK_TRANSFER" },
    timestamp: { type: Date }
  },

  complaint: {
    category: {
      type: String,
      enum: [
        "UNAUTHORIZED_TRANSACTION",
        "PHISHING",
        "FAKE_PAYMENT",
        "ACCOUNT_TAKEOVER",
        "SOCIAL_ENGINEERING",
        "FAKE_UPI_REQUEST",
        "DUPLICATE_CHARGE",
        "MULE_ACCOUNT",
        "WRONG_RECIPIENT",
        "NOT_RECEIVED",
        "OTHER"
      ],
      required: true
    },
    description: { type: String, required: true, maxlength: 2000 },
    incidentDate: { type: Date, required: true },
    reportedAt: { type: Date, default: Date.now }
  },

  evidence: [{
    url: { type: String },
    description: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],

  severity: {
    type: String,
    enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    default: "MEDIUM"
  },

  status: {
    type: String,
    enum: [
      "PENDING",
      "UNDER_REVIEW",
      "ACCEPTED",
      "REJECTED",
      "MARKED_FRAUD",
      "SUSPENDED",
      "BLOCKED",
      "UNDER_INVESTIGATION",
      "INVESTIGATING",
      "CLEARED",
      "FRAUD_CONFIRMED",
      "ACTION_TAKEN",
      "RESOLVED"
    ],
    default: "PENDING"
  },

  admin: {
    admin_id: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: false },
    name: { type: String },
    actionTakenAt: { type: Date },
    actionType: { type: String },
    notes: { type: String, maxlength: 3000 },
    rejectionReason: { type: String }
  },

  investigation: {
    findings: { type: String },
    policeReportFiled: { type: Boolean, default: false },
    policeReportNumber: { type: String }
  },

  timeline: [{
    status: { type: String, required: true },
    note: { type: String },
    performedBy: { type: String },
    performedAt: { type: Date, default: Date.now }
  }],

  fraudIndicators: {
    deviceMismatch: { type: Boolean, default: false },
    locationAnomaly: { type: Boolean, default: false },
    rapidTransactions: { type: Boolean, default: false },
    newBeneficiary: { type: Boolean, default: false },
    unusualAmount: { type: Boolean, default: false },
    score: { type: Number, default: 0 }
  },

  resolution: {
    resolvedAt: { type: Date },
    resolutionSummary: { type: String },
    refundIssued: { type: Boolean, default: false },
    refundAmount: { type: Number, default: 0 }
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

transactionReportSchema.index({ "reporter.user_id": 1, status: 1 });
transactionReportSchema.index({ "reported.accountNumber": 1 });
transactionReportSchema.index({ status: 1, severity: 1 });

module.exports = mongoose.model("TransactionReport", transactionReportSchema);
