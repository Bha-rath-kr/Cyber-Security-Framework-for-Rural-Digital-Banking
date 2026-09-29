// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },

  aadhaarNumber: {
    type: String,
    required: true,
    unique: true,
    match: /^\d{12}$/
  },

  panNumber: {
    type: String,
    required: true,
    match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
  },

  mpinHash: { type: String, required: true },

  balance: { type: Number, default: 15000 },
  transactionsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },

  accountNumber: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ["ACTIVE", "TEMP_FROZEN", "UNDER_REVIEW", "FROZEN", "SUSPENDED", "BLOCKED", "CLEARED"],
    default: "ACTIVE"
  },

  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    match: /^[6-9]\d{9}$/
  },

  // ⭐ NEW FIELDS
  upiId: {
    type: String,
    required: true,
    unique: true
  },

  upiQR: {
    type: String,
    required: true
  },

  ifsc: {
    type: String,
    default: "GBRK0002130"
  },

  // Account Status Details for Compliance
  accountStatus: {
    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date },
    frozenBy: { type: String },
    frozenReason: { type: String },

    isSuspended: { type: Boolean, default: false },
    suspendedAt: { type: Date },
    suspendedUntil: { type: Date },
    suspendedBy: { type: String },
    suspensionReason: { type: String },

    isBlocked: { type: Boolean, default: false },
    blockedAt: { type: Date },
    blockedBy: { type: String },
    blockingReason: { type: String }
  },

  // Admin flag
  reservedBalance: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },

  // Compliance & Risk Flags
  riskFlags: {
    isFlaggedForFraud: { type: Boolean, default: false },
    flaggedAt: { type: Date },
    complaintCount: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 }
  }
});

module.exports = mongoose.model("User", userSchema);
