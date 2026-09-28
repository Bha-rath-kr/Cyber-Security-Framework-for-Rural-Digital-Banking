const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const ComplaintService = require("../services/complaintService");
const ScheduledTransaction = require("../models/ScheduledTransaction");
const Transaction = require("../models/Transaction");
const User = require("../models/User");

// Admin login (public — no auth)
router.post("/login", async (req, res) => {
  try {
    const aadhaarNumber = String(req.body?.aadhaarNumber || "").trim();
    const mpin = String(req.body?.mpin || "").trim();
    if (!aadhaarNumber || !mpin) return res.status(400).json({ error: "Aadhaar number and MPIN required" });

    const user = await User.findOne({ aadhaarNumber });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.isAdmin) return res.status(403).json({ error: "Unauthorized admin access" });
    if (user.status === "FROZEN") return res.status(403).json({ error: "Account is frozen. Contact support." });

    const isMatch = await bcrypt.compare(mpin, user.mpinHash);
    if (!isMatch) return res.status(401).json({ error: "Invalid MPIN" });

    const token = jwt.sign(
      { id: user._id, aadhaarNumber: user.aadhaarNumber },
      process.env.JWT_SECRET,
      { expiresIn: "90d" }
    );

    res.json({
      message: "Admin login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        aadhaarNumber: user.aadhaarNumber,
        accountNumber: user.accountNumber,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.use(adminAuth);

function getAdminFromRequest(req) {
  return {
    _id: req.admin?._id || req.user?._id || null,
    name: req.admin?.name || req.user?.name || "System",
    role: req.admin?.role || "ADMIN",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"]
  };
}

router.get("/stats", async (req, res) => {
  try {
    const stats = await ComplaintService.getComplaintStats();
    res.json({ success: true, stats });
  } catch (err) {
    console.error("Complaint stats error:", err);
    res.status(500).json({ error: "Failed to load complaint statistics" });
  }
});

router.get("/scheduled-transactions", async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (status) filter.status = status;

    const [transactions, total] = await Promise.all([
      ScheduledTransaction.find(filter)
        .populate("user_id", "name accountNumber phoneNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ScheduledTransaction.countDocuments(filter)
    ]);

    const formattedTxns = transactions.map(t => {
      const user = t.user_id;
      return {
        id: t._id,
        txn_id: t.txn_id,
        user: user ? { name: user.name, account: user.accountNumber, phone: user.phoneNumber } : null,
        to_account: t.to_account,
        to_upi: t.to_upi,
        beneficiary_name: t.beneficiary_name,
        ifsc: t.ifsc,
        amount: t.amount,
        balance_before: t.balance_before,
        balance_after: t.balance_after,
        type: t.type,
        status: t.status,
        delay_reason: t.delay_reason,
        scheduled_at: t.scheduled_at,
        auto_process_at: t.auto_process_at,
        processed_at: t.processed_at,
        is_reported: t.is_reported,
        report_reason: t.report_reason,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      };
    });

    res.json({
      success: true,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      transactions: formattedTxns
    });
  } catch (err) {
    console.error("Admin scheduled txns error:", err);
    res.status(500).json({ error: "Failed to fetch scheduled transactions" });
  }
});

router.post("/scheduled-transactions/:txnId/process", async (req, res) => {
  try {
    const { txnId } = req.params;
    const { action } = req.body;
    const admin = getAdminFromRequest(req);

    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'approve' or 'reject'" });
    }

    const txn = await ScheduledTransaction.findOne({ _id: txnId, status: { $in: ["PENDING", "HOLD_FOR_REVIEW"] }, processing_locked: false, is_reported: false })
      .populate("user_id");

    if (!txn) {
      return res.status(404).json({ error: "Transaction not found, already processed, or locked" });
    }

    if (action === "reject") {
      txn.status = "REJECTED";
      txn.delay_reason = `Rejected by admin: ${admin.name}`;
      txn.processed_at = new Date();
      txn.processing_locked = true;
      await txn.save();

      // Refund reserved balance
      const senderUser = txn.user_id;
      if (senderUser) {
        senderUser.balance += txn.amount;
        senderUser.reservedBalance -= txn.amount;
        await senderUser.save();
      }

      return res.json({ success: true, message: "Transaction rejected", status: "REJECTED" });
    }

    // APPROVE: process immediately
    const sender = txn.user_id;
    if (!sender || sender.reservedBalance < txn.amount) {
      txn.status = "FAILED";
      txn.delay_reason = "Insufficient reserved balance at processing time";
      txn.processed_at = new Date();
      txn.processing_locked = true;
      await txn.save();
      // Refund only this transaction's reserved amount
      if (sender && sender.reservedBalance >= txn.amount) {
        sender.balance += txn.amount;
        sender.reservedBalance -= txn.amount;
        await sender.save();
      }
      return res.status(400).json({ error: "Insufficient reserved balance" });
    }

    const balance_before = sender.balance;
    sender.reservedBalance -= txn.amount;
    sender.transactionsCount = (sender.transactionsCount || 0) + 1;
    await sender.save();

    const debitTxn = await Transaction.create({
      txn_id: txn.txn_id,
      user_id: sender._id,
      to_account: txn.to_account,
      to_upi: txn.to_upi,
      ifsc: txn.ifsc,
      beneficiary_name: txn.beneficiary_name,
      amount: txn.amount,
      balance_before,
      balance_after,
      type: "DEBIT",
      is_fraud: false
    });

    const receiver = txn.to_account
      ? await User.findOne({ accountNumber: txn.to_account })
      : txn.to_upi
        ? await User.findOne({ upiId: txn.to_upi })
        : null;
    if (receiver) {
      const r_before = receiver.balance;
      const r_after = +(receiver.balance + txn.amount).toFixed(2);

      await Transaction.create({
        txn_id: `${txn.txn_id}-CREDIT`,
        user_id: receiver._id,
        from_account: sender.accountNumber,
        to_account: receiver.accountNumber,
        to_upi: receiver.upiId,
        amount: txn.amount,
        balance_before: r_before,
        balance_after: r_after,
        type: "CREDIT",
        is_fraud: false
      });

      receiver.balance = r_after;
      receiver.transactionsCount = (receiver.transactionsCount || 0) + 1;
      await receiver.save();
    }

    txn.status = "COMPLETED";
    txn.processed_at = new Date();
    txn.processing_locked = true;
    await txn.save();

    res.json({
      success: true,
      message: "Transaction approved and completed",
      status: "COMPLETED"
    });
  } catch (err) {
    console.error("Admin process scheduled error:", err);
    res.status(500).json({ error: "Failed to process transaction" });
  }
});

router.get("/list", async (req, res) => {
  try {
    const { status, severity, category, search, page, limit } = req.query;

    let statusFilter = status;
    if (status && status.includes(",")) {
      statusFilter = status.split(",").map(s => s.trim());
    }

    const result = await ComplaintService.getComplaints({
      status: statusFilter,
      severity,
      category,
      search,
      page: page || 1,
      limit: limit || 20
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Admin list complaints error:", err);
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

router.get("/audit-logs", async (req, res) => {
  try {
    const AuditLog = require("../models/AuditLog");
    const { entityType, entityId, adminId, action, dateFrom, dateTo, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    if (action) filter.action = action;
    if (adminId) filter["performedBy.id"] = adminId;

    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
      if (dateTo) filter.timestamp.$lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(parseInt(limit)),
      AuditLog.countDocuments(filter)
    ]);

    res.json({
      success: true,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      logs
    });
  } catch (err) {
    console.error("Audit logs error:", err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ============================================================
// FRAUD MANAGEMENT — Interactive Dashboard APIs
// ============================================================

// GET /fraud-accounts — with pagination + search
router.get("/fraud-accounts", async (req, res) => {
  try {
    const FraudAccount = require("../models/FraudAccount");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { isActive: true };
    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { name: { $regex: s, $options: "i" } },
        { accountNumber: { $regex: s, $options: "i" } },
        { phoneNumber: { $regex: s, $options: "i" } },
        { upiId: { $regex: s, $options: "i" } },
        { reason: { $regex: s, $options: "i" } },
      ];
    }

    const [fraudAccounts, total] = await Promise.all([
      FraudAccount.find(filter).populate("reportedBy", "name accountNumber phoneNumber").sort({ createdAt: -1 }).skip(skip).limit(limit),
      FraudAccount.countDocuments(filter)
    ]);

    const enriched = fraudAccounts.map(fa => ({
      _id: fa._id, name: fa.name, accountNumber: fa.accountNumber,
      phoneNumber: fa.phoneNumber, upiId: fa.upiId, ifsc: fa.ifsc,
      reason: fa.reason, fraudType: fa.fraudType, riskLevel: fa.riskLevel,
      reportedBy: fa.reportedBy ? { name: fa.reportedBy.name, accountNumber: fa.reportedBy.accountNumber } : null,
      createdAt: fa.createdAt, isActive: fa.isActive
    }));
    res.json({ success: true, accounts: enriched, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Fraud accounts error:", err); res.status(500).json({ error: "Failed to fetch fraud accounts" }); }
});

// GET /flagged-users — with pagination + search + status filter
router.get("/flagged-users", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { "riskFlags.isFlaggedForFraud": true };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { name: { $regex: s, $options: "i" } },
        { accountNumber: { $regex: s, $options: "i" } },
        { phoneNumber: { $regex: s, $options: "i" } },
      ];
    }

    const [flaggedUsers, total] = await Promise.all([
      User.find(filter).select("name accountNumber phoneNumber aadhaarNumber status balance riskFlags transactionsCount createdAt updatedAt").sort({ updatedAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter)
    ]);

    const enriched = flaggedUsers.map(u => ({
      _id: u._id, name: u.name, accountNumber: u.accountNumber,
      phoneNumber: u.phoneNumber, aadhaarNumber: u.aadhaarNumber,
      status: u.status, balance: u.balance,
      complaintCount: u.riskFlags?.complaintCount || 0,
      warningCount: u.riskFlags?.warningCount || 0,
      isFlaggedForFraud: u.riskFlags?.isFlaggedForFraud || false,
      transactionsCount: u.transactionsCount || 0,
      createdAt: u.createdAt, lastActivity: u.updatedAt
    }));
    res.json({ success: true, users: enriched, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Flagged users error:", err); res.status(500).json({ error: "Failed to fetch flagged users" }); }
});

// GET /suspicious-transactions — with pagination + search + filter
router.get("/suspicious-transactions", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    let filter;
    if (req.query.status === "fraud") {
      filter = { is_fraud: true };
    } else {
      filter = { is_suspicious: true, is_fraud: { $ne: true } };
    }
    if (req.query.status === "investigated") filter["suspicious_flags"] = "UNDER_INVESTIGATION";

    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { txn_id: { $regex: s, $options: "i" } },
        { to_account: { $regex: s, $options: "i" } },
        { from_account: { $regex: s, $options: "i" } },
      ];
    }
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
    }

    const [suspicious, total] = await Promise.all([
      Transaction.find(filter).populate("user_id", "name accountNumber phoneNumber").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter)
    ]);

    function reconstructBreakdown(flags, amount) {
      const knownPoints = {
        "BLACKLISTED_ACCOUNTNUMBER_MATCH": 80,
        "BLACKLISTED_PHONENUMBER_MATCH": 80,
        "BLACKLISTED_UPIID_MATCH": 80,
        "RAPID_TRANSACTIONS_5_IN_2MIN": 30,
        "MULTIPLE_RECEIVERS_3_IN_5MIN": 25,
        "REPEATED_SAME_AMOUNT_PATTERN": 20,
        "HIGH_AMOUNT_ABOVE_50000": 30,
        "HIGH_AMOUNT_ABOVE_10000": 15,
      };
      return (flags || []).map(flag => {
        if (flag in knownPoints) return { name: flag, points: knownPoints[flag] };
        if (flag === "NEW_BENEFICIARY") {
          const p = amount < 1000 ? 5 : amount < 10000 ? 10 : 20;
          return { name: flag, points: p };
        }
        if (flag === "ML_ANOMALY_HIGH") return { name: flag, points: amount < 1000 ? 5 : 20 };
        if (flag === "ML_ANOMALY_MEDIUM") return { name: flag, points: amount < 1000 ? 3 : 10 };
        return { name: flag, points: 0 };
      });
    }

    const enriched = suspicious.map(tx => {
      const stored = tx.risk_factors || [];
      const riskBreakdown = stored.length > 0 ? stored : reconstructBreakdown(tx.suspicious_flags, tx.amount);
      const decision =
        tx.risk_score >= 90 ? "TEMP_FREEZE" :
        tx.risk_score >= 60 || (tx.risk_score >= 40 && tx.amount > 10000) ? "HOLD_FOR_REVIEW" :
        tx.risk_score >= 25 ? "WARNING" : "SAFE";
      return {
        _id: tx._id, txn_id: tx.txn_id,
        user: tx.user_id ? { name: tx.user_id.name, accountNumber: tx.user_id.accountNumber, phoneNumber: tx.user_id.phoneNumber } : null,
        from_account: tx.from_account, to_account: tx.to_account, to_upi: tx.to_upi,
        amount: tx.amount, type: tx.type, is_fraud: tx.is_fraud,
        fraud_reason: tx.fraud_reason, is_suspicious: tx.is_suspicious,
        suspicious_flags: tx.suspicious_flags, risk_score: tx.risk_score,
        riskBreakdown,
        decision,
        createdAt: tx.createdAt
      };
    });
    res.json({ success: true, transactions: enriched, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Suspicious txns error:", err); res.status(500).json({ error: "Failed to fetch suspicious transactions" }); }
});

// GET /open-complaints — with pagination + search
router.get("/open-complaints", async (req, res) => {
  try {
    const TransactionReport = require("../models/TransactionReport");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { status: { $in: ["PENDING", "UNDER_REVIEW", "ACCEPTED", "UNDER_INVESTIGATION", "INVESTIGATING"] } };
    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { complaintId: { $regex: s, $options: "i" } },
        { "reporter.name": { $regex: s, $options: "i" } },
        { "reporter.accountNumber": { $regex: s, $options: "i" } },
        { "reported.accountNumber": { $regex: s, $options: "i" } },
      ];
    }

    // Exclude junk records from admin display
    const JUNK_FILTER = { $nor: [{ "reported.accountNumber": "UNKNOWN", "relatedTransaction.amount": { $in: [0, null] } }, { "reporter.user_id": null }] };
    const query = { ...filter, ...JUNK_FILTER };

    const [complaints, total] = await Promise.all([
      TransactionReport.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      TransactionReport.countDocuments(query)
    ]);

    const enriched = complaints.map(c => ({
      _id: c._id, complaintId: c.complaintId,
      reporter: c.reporter ? { name: c.reporter.name, accountNumber: c.reporter.accountNumber, phoneNumber: c.reporter.phoneNumber } : null,
      reported: c.reported ? { name: c.reported.name, accountNumber: c.reported.accountNumber, upiId: c.reported.upiId, user_id: c.reported.user_id } : null,
      category: c.complaint?.category, description: c.complaint?.description,
      amount: c.relatedTransaction?.amount || 0,
      status: c.status, severity: c.severity, createdAt: c.createdAt
    }));
    res.json({ success: true, complaints: enriched, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Open complaints error:", err); res.status(500).json({ error: "Failed to fetch open complaints" }); }
});

// POST /flagged-users/:id/freeze
router.post("/flagged-users/:id/freeze", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.status = "FROZEN";
    user.accountStatus = { ...user.accountStatus, isFrozen: true, frozenAt: new Date(), frozenReason: req.body.reason || "Frozen by admin" };
    await user.save();
    res.json({ success: true, message: "User frozen" });
  } catch (err) { res.status(500).json({ error: "Failed to freeze user" }); }
});

// POST /flagged-users/:id/unfreeze
router.post("/flagged-users/:id/unfreeze", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.status = "ACTIVE";
    user.accountStatus = { ...user.accountStatus, isFrozen: false, unfrozenAt: new Date() };
    await user.save();
    res.json({ success: true, message: "User unfrozen" });
  } catch (err) { res.status(500).json({ error: "Failed to unfreeze user" }); }
});

// POST /flagged-users/:id/mark-safe
router.post("/flagged-users/:id/mark-safe", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.riskFlags = { ...user.riskFlags, isFlaggedForFraud: false, warningCount: 0 };
    user.status = "CLEARED";
    await user.save();
    res.json({ success: true, message: "User marked safe" });
  } catch (err) { res.status(500).json({ error: "Failed to mark user safe" }); }
});

// POST /suspicious-transactions/:id/approve
router.post("/suspicious-transactions/:id/approve", async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    tx.is_fraud = false; tx.is_suspicious = false; tx.risk_score = 0;
    await tx.save();
    res.json({ success: true, message: "Transaction approved as safe" });
  } catch (err) { res.status(500).json({ error: "Failed to approve transaction" }); }
});

// POST /suspicious-transactions/:id/cancel
router.post("/suspicious-transactions/:id/cancel", async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    tx.is_fraud = true; tx.fraud_reason = req.body.reason || "Cancelled by admin";
    tx.is_suspicious = true;
    await tx.save();
    res.json({ success: true, message: "Transaction cancelled" });
  } catch (err) { res.status(500).json({ error: "Failed to cancel transaction" }); }
});

// POST /suspicious-transactions/:id/investigate
router.post("/suspicious-transactions/:id/investigate", async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    tx.is_suspicious = true;
    if (!tx.suspicious_flags) tx.suspicious_flags = [];
    tx.suspicious_flags.push("UNDER_INVESTIGATION");
    await tx.save();
    res.json({ success: true, message: "Transaction flagged for investigation" });
  } catch (err) { res.status(500).json({ error: "Failed to flag transaction" }); }
});

// POST /open-complaints/:id/investigate — creates investigation + links to complaint
router.post("/open-complaints/:id/investigate", async (req, res) => {
  try {
    const TransactionReport = require("../models/TransactionReport");
    const FraudInvestigation = require("../models/FraudInvestigation");
    const complaint = await TransactionReport.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const existing = await FraudInvestigation.findOne({ complaint: complaint._id, status: "INVESTIGATING" });
    if (existing) return res.status(400).json({ error: "Complaint already under investigation" });

    const investigation = await FraudInvestigation.create({
      complaint: complaint._id,
      complaintIdStr: complaint.complaintId,
      reportedUser: {
        userId: complaint.reported?.user_id,
        accountNumber: complaint.reported?.accountNumber,
        name: complaint.reported?.name,
        phoneNumber: complaint.reported?.phoneNumber,
        upiId: complaint.reported?.upiId
      },
      status: "INVESTIGATING",
      adminName: req.admin?.name || "Admin",
      findings: req.body.notes || "",
      startedAt: new Date()
    });

    complaint.status = "INVESTIGATING";
    complaint.admin = { ...complaint.admin, actionTakenAt: new Date(), actionType: "INVESTIGATE", notes: req.body.notes || "Investigation started" };
    complaint.timeline.push({ status: "INVESTIGATING", note: req.body.notes || "Investigation started", performedBy: "Admin", performedAt: new Date() });
    await complaint.save();

    res.json({ success: true, message: "Investigation created and linked to complaint", investigation });
  } catch (err) { res.status(500).json({ error: "Failed to investigate complaint" }); }
});

// POST /open-complaints/:id/clear — clears investigation + complaint
router.post("/open-complaints/:id/clear", async (req, res) => {
  try {
    const TransactionReport = require("../models/TransactionReport");
    const FraudInvestigation = require("../models/FraudInvestigation");
    const complaint = await TransactionReport.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const investigation = await FraudInvestigation.findOne({ complaint: complaint._id, status: "INVESTIGATING" });
    if (investigation) {
      investigation.status = "CLEARED";
      investigation.resolvedAt = new Date();
      investigation.findings = req.body.notes || investigation.findings;
      await investigation.save();
    }

    complaint.status = "CLEARED";
    complaint.admin = { ...complaint.admin, actionTakenAt: new Date(), actionType: "CLEARED", notes: req.body.notes || "Cleared by admin" };
    complaint.timeline.push({ status: "CLEARED", note: req.body.notes || "Complaint cleared", performedBy: "Admin", performedAt: new Date() });
    await complaint.save();

    res.json({ success: true, message: "Complaint cleared and investigation closed", investigation });
  } catch (err) { res.status(500).json({ error: "Failed to clear complaint" }); }
});

// POST /open-complaints/:id/mark-fraud — marks as fraud, blacklists account, closes investigation
router.post("/open-complaints/:id/mark-fraud", async (req, res) => {
  try {
    const TransactionReport = require("../models/TransactionReport");
    const FraudInvestigation = require("../models/FraudInvestigation");
    const FraudAccount = require("../models/FraudAccount");
    const User = require("../models/User");
    const complaint = await TransactionReport.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const investigation = await FraudInvestigation.findOne({ complaint: complaint._id, status: "INVESTIGATING" });
    if (investigation) {
      investigation.status = "FRAUD_CONFIRMED";
      investigation.resolvedAt = new Date();
      investigation.findings = req.body.notes || investigation.findings;
      await investigation.save();
    }

    complaint.status = "FRAUD_CONFIRMED";
    complaint.admin = { ...complaint.admin, actionTakenAt: new Date(), actionType: "MARK_FRAUD", notes: req.body.notes || "Fraud confirmed" };
    complaint.timeline.push({ status: "FRAUD_CONFIRMED", note: req.body.notes || "Fraud confirmed by admin", performedBy: "Admin", performedAt: new Date() });
    await complaint.save();

    const reportedUser = await User.findOne({ accountNumber: complaint.reported.accountNumber });
    const phoneNumber = reportedUser?.phoneNumber;
    const upiId = complaint.reported.upiId || reportedUser?.upiId;

    const filter = [];
    if (complaint.reported.accountNumber) filter.push({ accountNumber: complaint.reported.accountNumber });
    if (phoneNumber) filter.push({ phoneNumber });

    const fraudData = {
      name: complaint.reported.name || reportedUser?.name || "Unknown",
      accountNumber: complaint.reported.accountNumber,
      phoneNumber: phoneNumber || undefined,
      upiId: upiId || undefined,
      ifsc: req.body.ifsc || "GBRK0002130",
      reason: req.body.reason || `Confirmed fraud via complaint ${complaint.complaintId}`,
      fraudType: "OTHER",
      riskLevel: complaint.severity === "CRITICAL" ? "CRITICAL" : complaint.severity === "HIGH" ? "HIGH" : "MEDIUM",
      reportedBy: req.admin?.name || "Admin",
      isActive: true
    };

    if (filter.length > 0) {
      await FraudAccount.findOneAndUpdate(
        { $or: filter },
        { $set: { ...fraudData, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true }
      );
    } else {
      await FraudAccount.create(fraudData);
    }

    if (reportedUser) {
      reportedUser.status = "FROZEN";
      reportedUser.accountStatus = {
        ...reportedUser.accountStatus,
        isFrozen: true,
        frozenAt: new Date(),
        frozenBy: req.admin?.name || "Admin",
        frozenReason: `Fraud confirmed via complaint ${complaint.complaintId}`
      };
      reportedUser.riskFlags = {
        ...reportedUser.riskFlags,
        isFlaggedForFraud: true,
        flaggedAt: new Date()
      };
      await reportedUser.save();
    }

    res.json({ success: true, message: "Complaint marked as fraud, account blacklisted and frozen" });
  } catch (err) { res.status(500).json({ error: "Failed to mark complaint as fraud" }); }
});

// GET /flagged-users/:id/transactions
router.get("/flagged-users/:id/transactions", async (req, res) => {
  try {
    const transactions = await Transaction.find({ user_id: req.params.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, transactions });
  } catch (err) { res.status(500).json({ error: "Failed to fetch transaction history" }); }
});

// GET /under-investigation — returns FraudInvestigation records linked to complaints
router.get("/under-investigation", async (req, res) => {
  try {
    const FraudInvestigation = require("../models/FraudInvestigation");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { status: "INVESTIGATING" };
    if (req.query.search) {
      const s = req.query.search;
      const TransactionReport = require("../models/TransactionReport");
      const matching = await TransactionReport.find({
        $or: [
          { complaintId: { $regex: s, $options: "i" } },
          { "reported.accountNumber": { $regex: s, $options: "i" } },
          { "reported.name": { $regex: s, $options: "i" } }
        ]
      }).select("_id");
      filter.complaint = { $in: matching.map(m => m._id) };
    }

    const [investigations, total] = await Promise.all([
      FraudInvestigation.find(filter)
        .populate("complaint")
        .sort({ startedAt: -1 }).skip(skip).limit(limit),
      FraudInvestigation.countDocuments(filter)
    ]);

    const enriched = investigations.map(inv => {
      const c = inv.complaint || {};
      return {
        _id: inv._id,
        investigationId: inv._id,
        complaintId: c.complaintId || inv.complaintIdStr,
        complaintRef: inv.complaint,
        reportedUser: {
          userId: inv.reportedUser?.userId,
          accountNumber: inv.reportedUser?.accountNumber || c.reported?.accountNumber,
          name: inv.reportedUser?.name || c.reported?.name,
          phoneNumber: inv.reportedUser?.phoneNumber || c.reported?.phoneNumber,
          upiId: inv.reportedUser?.upiId || c.reported?.upiId
        },
        status: inv.status,
        adminName: inv.adminName,
        findings: inv.findings,
        startedAt: inv.startedAt,
        createdAt: inv.createdAt,
        complaintStatus: c.status
      };
    });
    res.json({ success: true, users: enriched, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Under investigation error:", err); res.status(500).json({ error: "Failed to fetch under investigation records" }); }
});

// GET /temp-frozen — with pagination
router.get("/temp-frozen", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ status: "TEMP_FROZEN" })
        .select("name accountNumber phoneNumber status balance accountStatus riskFlags transactionsCount createdAt updatedAt")
        .sort({ updatedAt: -1 }).skip(skip).limit(limit),
      User.countDocuments({ status: "TEMP_FROZEN" })
    ]);

    const enriched = users.map(u => ({
      _id: u._id, name: u.name, accountNumber: u.accountNumber,
      phoneNumber: u.phoneNumber, status: u.status, balance: u.balance,
      freezeReason: u.accountStatus?.frozenReason || "Auto-frozen by fraud engine",
      frozenAt: u.accountStatus?.frozenAt || u.updatedAt,
      riskScore: u.riskFlags?.complaintCount > 0 ? 60 + u.riskFlags.complaintCount * 10 : 0,
      createdAt: u.createdAt, lastActivity: u.updatedAt
    }));
    res.json({ success: true, users: enriched, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Temp frozen error:", err); res.status(500).json({ error: "Failed to fetch temp frozen users" }); }
});

// GET /hold-for-review — with pagination
router.get("/hold-for-review", async (req, res) => {
  try {
    const ScheduledTransaction = require("../models/ScheduledTransaction");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [txns, total] = await Promise.all([
      ScheduledTransaction.find({ status: "HOLD_FOR_REVIEW" })
        .populate("user_id", "name accountNumber phoneNumber")
        .sort({ createdAt: -1 }).skip(skip).limit(limit),
      ScheduledTransaction.countDocuments({ status: "HOLD_FOR_REVIEW" })
    ]);

    const enriched = txns.map(t => ({
      _id: t._id, txn_id: t.txn_id,
      user: t.user_id ? { name: t.user_id.name, account: t.user_id.accountNumber, phone: t.user_id.phoneNumber } : null,
      to_account: t.to_account, amount: t.amount,
      delay_reason: t.delay_reason,
      riskScore: t.riskScore || 0,
      riskBreakdown: t.riskBreakdown || [],
      fraudDecision: t.fraudDecision || "HOLD_FOR_REVIEW",
      scheduled_at: t.scheduled_at, auto_process_at: t.auto_process_at,
      createdAt: t.createdAt
    }));
    res.json({ success: true, transactions: enriched, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Hold for review error:", err); res.status(500).json({ error: "Failed to fetch hold for review transactions" }); }
});

// GET /suspicious-transactions/stats — summary counts by risk level
router.get("/suspicious-transactions/stats", async (req, res) => {
  try {
    const [fraudCount, suspiciousCount, highRiskCount] = await Promise.all([
      Transaction.countDocuments({ is_fraud: true }),
      Transaction.countDocuments({ is_suspicious: true, is_fraud: { $ne: true } }),
      Transaction.countDocuments({ risk_score: { $gte: 60 } })
    ]);
    res.json({ success: true, stats: { confirmedFraud: fraudCount, suspicious: suspiciousCount, highRisk: highRiskCount } });
  } catch (err) { console.error("Suspicious txn stats error:", err); res.status(500).json({ error: "Failed to fetch stats" }); }
});

// ============================================================
// ARCHIVE + CLEANUP ENDPOINTS
// ============================================================

// GET /admin/archive/transactions — archived (old) transactions
router.get("/archive/transactions", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const days = parseInt(req.query.days) || 90;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filter = { createdAt: { $lt: cutoff } };

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter)
    ]);
    res.json({ success: true, transactions, total, currentPage: page, totalPages: Math.ceil(total / limit), archiveDays: days });
  } catch (err) { console.error("Archive transactions error:", err); res.status(500).json({ error: "Failed to fetch archived transactions" }); }
});

// GET /admin/archive/scheduled — archived scheduled transactions
router.get("/archive/scheduled", async (req, res) => {
  try {
    const ScheduledTransaction = require("../models/ScheduledTransaction");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const days = parseInt(req.query.days) || 90;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filter = { createdAt: { $lt: cutoff } };

    const [txns, total] = await Promise.all([
      ScheduledTransaction.find(filter).populate("user_id", "name accountNumber").sort({ createdAt: -1 }).skip(skip).limit(limit),
      ScheduledTransaction.countDocuments(filter)
    ]);
    res.json({ success: true, transactions: txns, total, currentPage: page, totalPages: Math.ceil(total / limit), archiveDays: days });
  } catch (err) { console.error("Archive scheduled error:", err); res.status(500).json({ error: "Failed to fetch archived scheduled transactions" }); }
});

// GET /admin/archive/complaints — archived (resolved/rejected) complaints
router.get("/archive/complaints", async (req, res) => {
  try {
    const TransactionReport = require("../models/TransactionReport");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { status: { $in: ["RESOLVED", "REJECTED", "ACTION_TAKEN"] } };
    const junkNor = [{ "reported.accountNumber": "UNKNOWN", "relatedTransaction.amount": { $in: [0, null] } }, { "reporter.user_id": null }];
    const query = { ...filter, $nor: junkNor };

    const [complaints, total] = await Promise.all([
      TransactionReport.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      TransactionReport.countDocuments(query)
    ]);
    res.json({ success: true, complaints, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Archive complaints error:", err); res.status(500).json({ error: "Failed to fetch archived complaints" }); }
});

// GET /admin/archive/fraud-cases — archived (resolved/cleared) fraud alerts
router.get("/archive/fraud-cases", async (req, res) => {
  try {
    const FraudAlert = require("../models/FraudAlert");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { status: { $in: ["RESOLVED", "CLEARED", "CONFIRMED_FRAUD"] } };

    const [alerts, total] = await Promise.all([
      FraudAlert.find(filter).populate("userId", "name accountNumber").sort({ updatedAt: -1 }).skip(skip).limit(limit),
      FraudAlert.countDocuments(filter)
    ]);
    res.json({ success: true, alerts, total, currentPage: page, totalPages: Math.ceil(total / limit) });
  } catch (err) { console.error("Archive fraud cases error:", err); res.status(500).json({ error: "Failed to fetch archived fraud cases" }); }
});

// POST /admin/cleanup-test-data — remove obvious test/demo records
router.post("/cleanup-test-data", async (req, res) => {
  try {
    const FraudAlert = require("../models/FraudAlert");
    const ScheduledTransaction = require("../models/ScheduledTransaction");
    const TransactionReport = require("../models/TransactionReport");

    // Remove transactions with tiny amounts (₹1 or ₹2) that are likely test data
    const txnResult = await Transaction.deleteMany({ amount: { $in: [1, 2] } });

    // Remove scheduled transactions with tiny amounts
    const schedResult = await ScheduledTransaction.deleteMany({ amount: { $in: [1, 2] } });

    // Remove fraud alerts with no userId (orphaned test entries)
    const alertResult = await FraudAlert.deleteMany({ userId: { $exists: false } });

    res.json({
      success: true,
      message: "Test data cleanup completed",
      removed: {
        transactions: txnResult.deletedCount || 0,
        scheduledTransactions: schedResult.deletedCount || 0,
        orphanedAlerts: alertResult.deletedCount || 0,
      }
    });
  } catch (err) { console.error("Cleanup error:", err); res.status(500).json({ error: "Failed to clean up test data" }); }
});

// GET /admin/stats-summary — comprehensive dashboard summary
router.get("/stats-summary", async (req, res) => {
  try {
    const FraudAccount = require("../models/FraudAccount");
    const FraudAlert = require("../models/FraudAlert");
    const TransactionReport = require("../models/TransactionReport");
    const ScheduledTransaction = require("../models/ScheduledTransaction");

    const [
      totalUsers, activeUsers, transactionsToday, fraudAlertsOpen,
      flaggedUsers, fraudAccounts, pendingComplaints,
      underReview, holdReview, pendingScheduled, resolvedComplaints,
      totalBalanceAgg
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: "ACTIVE" }),
      Transaction.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
      FraudAlert.countDocuments({ status: "OPEN" }),
      User.countDocuments({ "riskFlags.isFlaggedForFraud": true }),
      FraudAccount.countDocuments({ isActive: true }),
      TransactionReport.countDocuments({ status: { $in: ["PENDING", "UNDER_REVIEW", "ACCEPTED", "UNDER_INVESTIGATION", "INVESTIGATING"] }, $nor: [{ "reported.accountNumber": "UNKNOWN", "relatedTransaction.amount": { $in: [0, null] } }, { "reporter.user_id": null }] }),
      User.countDocuments({ status: "UNDER_REVIEW" }),
      ScheduledTransaction.countDocuments({ status: "HOLD_FOR_REVIEW" }),
      ScheduledTransaction.countDocuments({ status: "PENDING" }),
      TransactionReport.countDocuments({ status: "RESOLVED", $nor: [{ "reported.accountNumber": "UNKNOWN", "relatedTransaction.amount": { $in: [0, null] } }, { "reporter.user_id": null }] }),
      User.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$balance", 0] } } } }]),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers, activeUsers, transactionsToday, fraudAlertsOpen,
        flaggedUsers, fraudAccounts, pendingComplaints,
        underReview, holdReview, pendingScheduled, resolvedComplaints,
        totalBalance: totalBalanceAgg[0]?.total || 0
      }
    });
  } catch (err) { console.error("Stats summary error:", err); res.status(500).json({ error: "Failed to fetch stats summary" }); }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await ComplaintService.getComplaintById(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Admin get complaint error:", err);
    res.status(500).json({ error: "Failed to fetch complaint details" });
  }
});

router.put("/:id/review", async (req, res) => {
  try {
    const admin = getAdminFromRequest(req);
    const { notes } = req.body;

    const result = await ComplaintService.takeAction(req.params.id, {
      action: "accept",
      notes: notes || "Moved to under review"
    }, admin);

    res.json({ success: true, complaint: result.complaint, actions_taken: result.actionsTaken });
  } catch (err) {
    console.error("Review complaint error:", err);
    res.status(500).json({ error: err.message || "Failed to update complaint" });
  }
});

router.put("/:id/action", async (req, res) => {
  try {
    const { action, notes, reason, findings, ifsc } = req.body;

    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }

    const validActions = ["accept", "reject", "mark_fraud", "suspend", "block", "investigate", "clear"];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: "Invalid action. Must be one of: accept, reject, mark_fraud, suspend, block, investigate, clear"
      });
    }

    const admin = getAdminFromRequest(req);

    const result = await ComplaintService.takeAction(req.params.id, {
      action,
      notes: notes || "",
      reason: reason || "",
      findings: findings || "",
      ifsc: ifsc || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    }, admin);

    res.json({
      success: true,
      complaint: result.complaint,
      actions_taken: result.actionsTaken
    });
  } catch (err) {
    console.error("Admin action error:", err);
    res.status(400).json({ error: err.message || "Failed to execute action" });
  }
});

router.get("/:id/transaction-history", async (req, res) => {
  try {
    const User = require("../models/User");
    const Transaction = require("../models/Transaction");

    const complaint = await require("../models/TransactionReport").findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    const reportedUser = await User.findOne({ accountNumber: complaint.reported.accountNumber });
    if (!reportedUser) {
      return res.json({ success: true, transactions: [], user: null });
    }

    const transactions = await Transaction.find({
      $or: [
        { user_id: reportedUser._id },
        { to_account: reportedUser.accountNumber }
      ]
    }).sort({ createdAt: -1 }).limit(50);

    res.json({
      success: true,
      user: {
        name: reportedUser.name,
        accountNumber: reportedUser.accountNumber,
        upiId: reportedUser.upiId,
        phoneNumber: reportedUser.phoneNumber,
        balance: reportedUser.balance,
        status: reportedUser.status
      },
      transactions
    });
  } catch (err) {
    console.error("Transaction history error:", err);
    res.status(500).json({ error: "Failed to fetch transaction history" });
  }
});

router.get("/:id/audit-log", async (req, res) => {
  try {
    const AuditLog = require("../models/AuditLog");
    const complaint = await require("../models/TransactionReport").findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    const logs = await AuditLog.find({
      entityType: "COMPLAINT",
      entityId: complaint.complaintId
    }).sort({ timestamp: -1 });

    res.json({ success: true, complaintId: complaint.complaintId, logs });
  } catch (err) {
    console.error("Audit log error:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

router.post("/:id/escalate", async (req, res) => {
  try {
    const admin = getAdminFromRequest(req);
    const { reason, notes } = req.body;

    const TransactionReport = require("../models/TransactionReport");
    const complaint = await TransactionReport.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    complaint.status = "UNDER_INVESTIGATION";
    complaint.severity = "CRITICAL";
    complaint.timeline.push({
      status: "UNDER_INVESTIGATION",
      note: `Escalated by ${admin.name}: ${reason || ""}`,
      performedBy: admin.name,
      performedAt: new Date()
    });
    await complaint.save();

    await ComplaintService.createAuditLog(
      "COMPLAINT",
      complaint.complaintId,
      "ESCALATED",
      { type: "ADMIN", id: admin._id, name: admin.name, role: admin.role, ipAddress: req.ip },
      reason || "Escalated to senior team",
      { status: complaint.status },
      { status: "UNDER_INVESTIGATION", severity: "CRITICAL" }
    );

    res.json({ success: true, message: "Complaint escalated", complaint });
  } catch (err) {
    console.error("Escalate error:", err);
    res.status(500).json({ error: "Failed to escalate complaint" });
  }
});

router.post("/:id/police-report", async (req, res) => {
  try {
    const admin = getAdminFromRequest(req);
    const { policeReportNumber, notes } = req.body;

    if (!policeReportNumber) {
      return res.status(400).json({ error: "Police report number is required" });
    }

    const TransactionReport = require("../models/TransactionReport");
    const complaint = await TransactionReport.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    complaint.investigation.policeReportFiled = true;
    complaint.investigation.policeReportNumber = policeReportNumber;
    complaint.investigation.findings = notes || "";
    complaint.timeline.push({
      status: "POLICE_REPORT_FILED",
      note: `Police report filed: ${policeReportNumber}`,
      performedBy: admin.name,
      performedAt: new Date()
    });
    await complaint.save();

    await ComplaintService.createAuditLog(
      "COMPLAINT",
      complaint.complaintId,
      "POLICE_REPORT_FILED",
      { type: "ADMIN", id: admin._id, name: admin.name, role: admin.role, ipAddress: req.ip },
      `Police Report: ${policeReportNumber}`,
      null,
      { policeReportNumber }
    );

    res.json({ success: true, message: "Police report recorded", complaint });
  } catch (err) {
    console.error("Police report error:", err);
    res.status(500).json({ error: "Failed to record police report" });
  }
});

module.exports = router;
