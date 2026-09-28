const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const FraudAccount = require("../models/FraudAccount");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const TransactionReport = require("../models/TransactionReport");
const AuditLog = require("../models/AuditLog");
const ComplaintService = require("../services/complaintService");
const { findFraudByAny } = require("../utils/fraudCheck");
const FraudAlert = require("../models/FraudAlert");
const fraudEngine = require("../services/fraudEngine");

router.use(adminAuth);

router.get("/stats", async (req, res) => {
  try {
    const [suspiciousTransactions, flaggedUsersCount, highRisk, complaintStats] = await Promise.all([
      Transaction.countDocuments({ is_suspicious: true, is_fraud: { $ne: true } }),
      User.countDocuments({ "riskFlags.isFlaggedForFraud": true }),
      FraudAccount.countDocuments({ isActive: true }),
      ComplaintService.getComplaintStats()
    ]);

    const fraudByType = await FraudAccount.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$fraudType", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const fraudByRisk = await FraudAccount.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$riskLevel", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      highRisk,
      flaggedUsers: flaggedUsersCount,
      suspiciousTransactions,
      fraudByType,
      fraudByRisk,
      complaints: complaintStats
    });
  } catch (err) {
    console.error("Fraud stats error:", err);
    res.status(500).json({ error: "Failed to load fraud stats" });
  }
});

router.get("/txn-alerts", async (req, res) => {
  try {
    const alerts = await Transaction.find({ is_fraud: true })
      .populate("user_id", "name accountNumber")
      .sort({ createdAt: -1 });

    res.json(alerts);
  } catch (err) {
    console.error("Fraud txn alerts error:", err);
    res.status(500).json({ error: "Failed to fetch fraud alerts" });
  }
});

router.get("/alerts", async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const [alerts, total] = await Promise.all([
      FraudAlert.find(filter)
        .populate("userId", "name accountNumber phoneNumber")
        .populate("receiverId", "name accountNumber")
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      FraudAlert.countDocuments(filter)
    ]);

    const enrichedAlerts = alerts.map(a => {
      const alertObj = a.toObject ? a.toObject() : a;
      const decision = alertObj.decision || "WARNING";
      const responseFields = fraudEngine.buildDecisionResponse({ decision, riskScore: alertObj.riskScore || 0, reasons: alertObj.riskReasons || [] });
      return { ...alertObj, ...responseFields };
    });
    res.json({ total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)), alerts: enrichedAlerts });
  } catch (err) {
    console.error("Fraud alerts error:", err);
    res.status(500).json({ error: "Failed to fetch fraud alerts" });
  }
});

router.get("/alerts/:id", async (req, res) => {
  try {
    const alert = await FraudAlert.findById(req.params.id)
      .populate("userId", "name accountNumber phoneNumber upiId")
      .populate("receiverId", "name accountNumber upiId");

    if (!alert) return res.status(404).json({ error: "Alert not found" });

    const alertObj = alert.toObject ? alert.toObject() : alert;
    const responseFields = fraudEngine.buildDecisionResponse({ decision: alertObj.decision || "WARNING", riskScore: alertObj.riskScore || 0, reasons: alertObj.riskReasons || [] });
    res.json({ ...alertObj, ...responseFields });
  } catch (err) {
    console.error("Get fraud alert error:", err);
    res.status(500).json({ error: "Failed to fetch fraud alert" });
  }
});

router.put("/alerts/:id/review", async (req, res) => {
  try {
    const { adminNotes, reviewedBy } = req.body;
    const alert = await FraudAlert.findByIdAndUpdate(
      req.params.id,
      { status: "UNDER_REVIEW", adminNotes, reviewedBy: reviewedBy || "Admin", reviewedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    await User.findByIdAndUpdate(alert.userId, { status: "UNDER_REVIEW" });

    const reviewAlertObj = alert.toObject ? alert.toObject() : alert;
    const reviewFields = fraudEngine.buildDecisionResponse({ decision: "HOLD_FOR_REVIEW", riskScore: reviewAlertObj.riskScore || 0, reasons: reviewAlertObj.riskReasons || [] });
    res.json({ success: true, message: "Alert under review", alert: { ...reviewAlertObj, ...reviewFields } });
  } catch (err) {
    console.error("Review alert error:", err);
    res.status(500).json({ error: "Failed to update alert" });
  }
});

router.put("/alerts/:id/unfreeze", async (req, res) => {
  try {
    const alert = await FraudAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    await User.findByIdAndUpdate(alert.userId, {
      status: "ACTIVE",
      "accountStatus.isFrozen": false,
      "accountStatus.frozenAt": null,
      "accountStatus.frozenReason": null,
      "riskFlags.isFlaggedForFraud": false
    });

    alert.status = "RESOLVED";
    alert.adminNotes = (alert.adminNotes || "") + " User unfrozen by admin.";
    alert.reviewedBy = req.body.reviewedBy || "Admin";
    alert.reviewedAt = new Date();
    alert.resolvedAt = new Date();
    await alert.save();

    const unfreezeAlertObj = alert.toObject ? alert.toObject() : alert;
    const unfreezeFields = fraudEngine.buildDecisionResponse({ decision: "SAFE", riskScore: 0, reasons: [] });
    res.json({ success: true, message: "User unfrozen and set to ACTIVE", alert: { ...unfreezeAlertObj, status: "RESOLVED", ...unfreezeFields } });
  } catch (err) {
    console.error("Unfreeze alert error:", err);
    res.status(500).json({ error: "Failed to unfreeze user" });
  }
});

router.put("/alerts/:id/mark-safe", async (req, res) => {
  try {
    const alert = await FraudAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    await User.findByIdAndUpdate(alert.userId, {
      status: "CLEARED",
      "accountStatus.isFrozen": false,
      "accountStatus.frozenAt": null,
      "accountStatus.frozenReason": null,
      "riskFlags.isFlaggedForFraud": false
    });

    const fraudAccount = await FraudAccount.findOne({
      $or: [
        { accountNumber: alert.userId?.toString() },
      ]
    });
    if (fraudAccount) {
      fraudAccount.isActive = false;
      await fraudAccount.save();
    }

    alert.status = "CLEARED";
    alert.adminNotes = (alert.adminNotes || "") + " Marked as false positive (safe).";
    alert.reviewedBy = req.body.reviewedBy || "Admin";
    alert.reviewedAt = new Date();
    alert.resolvedAt = new Date();
    await alert.save();

    const safeAlertObj = alert.toObject ? alert.toObject() : alert;
    const safeFields = fraudEngine.buildDecisionResponse({ decision: "SAFE", riskScore: 0, reasons: ["CLEARED_FALSE_POSITIVE"] });
    res.json({ success: true, message: "User marked as CLEARED (false positive)", alert: { ...safeAlertObj, ...safeFields } });
  } catch (err) {
    console.error("Mark safe error:", err);
    res.status(500).json({ error: "Failed to mark alert as safe" });
  }
});

router.put("/alerts/:id/suspend", async (req, res) => {
  try {
    const alert = await FraudAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    await User.findByIdAndUpdate(alert.userId, {
      status: "SUSPENDED",
      "accountStatus.isSuspended": true,
      "accountStatus.suspendedAt": new Date(),
      "accountStatus.suspendedBy": req.body.reviewedBy || "Admin",
      "accountStatus.suspensionReason": req.body.reason || "Suspended by admin after fraud alert"
    });

    alert.status = "CONFIRMED_FRAUD";
    alert.adminNotes = (alert.adminNotes || "") + " User suspended.";
    alert.reviewedBy = req.body.reviewedBy || "Admin";
    alert.reviewedAt = new Date();
    alert.resolvedAt = new Date();
    await alert.save();

    const suspendAlertObj = alert.toObject ? alert.toObject() : alert;
    const suspendFields = fraudEngine.buildDecisionResponse({ decision: "TEMP_FREEZE", riskScore: suspendAlertObj.riskScore || 0, reasons: suspendAlertObj.riskReasons || ["SUSPENDED_BY_ADMIN"] });
    res.json({ success: true, message: "User suspended", alert: { ...suspendAlertObj, ...suspendFields } });
  } catch (err) {
    console.error("Suspend user error:", err);
    res.status(500).json({ error: "Failed to suspend user" });
  }
});

router.put("/alerts/:id/block", async (req, res) => {
  try {
    const alert = await FraudAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    await User.findByIdAndUpdate(alert.userId, {
      status: "BLOCKED",
      "accountStatus.isBlocked": true,
      "accountStatus.blockedAt": new Date(),
      "accountStatus.blockedBy": req.body.reviewedBy || "Admin",
      "accountStatus.blockingReason": req.body.reason || "Blocked by admin after fraud alert"
    });

    alert.status = "CONFIRMED_FRAUD";
    alert.adminNotes = (alert.adminNotes || "") + " User permanently blocked.";
    alert.reviewedBy = req.body.reviewedBy || "Admin";
    alert.reviewedAt = new Date();
    alert.resolvedAt = new Date();
    await alert.save();

    const blockAlertObj = alert.toObject ? alert.toObject() : alert;
    const blockFields = fraudEngine.buildDecisionResponse({ decision: "TEMP_FREEZE", riskScore: 100, reasons: ["PERMANENTLY_BLOCKED_BY_ADMIN"] });
    res.json({ success: true, message: "User permanently blocked", alert: { ...blockAlertObj, ...blockFields } });
  } catch (err) {
    console.error("Block user error:", err);
    res.status(500).json({ error: "Failed to block user" });
  }
});

router.get("/accounts", async (req, res) => {
  try {
    const { isActive, fraudType, riskLevel, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (fraudType) filter.fraudType = fraudType;
    if (riskLevel) filter.riskLevel = riskLevel;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [accounts, total] = await Promise.all([
      FraudAccount.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      FraudAccount.countDocuments(filter)
    ]);

    const enriched = accounts.map(acc => ({
      _id: acc._id,
      name: acc.name,
      phoneNumber: acc.phoneNumber,
      accountNumber: acc.accountNumber,
      upiId: acc.upiId,
      ifsc: acc.ifsc,
      reason: acc.reason,
      fraudType: acc.fraudType,
      riskLevel: acc.riskLevel,
      reportedBy: acc.reportedBy,
      isActive: acc.isActive,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    }));

    res.json({
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      accounts: enriched
    });
  } catch (err) {
    console.error("Fraud accounts error:", err);
    res.status(500).json({ error: "Failed to fetch fraud accounts" });
  }
});

router.post("/add-account", async (req, res) => {
  try {
    const { name, phoneNumber, accountNumber, upiId, ifsc, reason, fraudType, riskLevel, reportedBy } = req.body;

    if (!name || !reason || !fraudType || !riskLevel) {
      return res.status(400).json({ error: "name, reason, fraudType, and riskLevel are required" });
    }

    if (!accountNumber && !phoneNumber && !upiId) {
      return res.status(400).json({ error: "At least one of accountNumber, phoneNumber, or upiId required" });
    }

    const identifier = accountNumber || phoneNumber || upiId;
    const existing = await findFraudByAny(identifier);
    if (existing) {
      return res.status(400).json({ error: "Account already in fraud list", existing });
    }

    const fraudAccount = await FraudAccount.create({
      name,
      phoneNumber: phoneNumber || undefined,
      accountNumber: accountNumber || undefined,
      upiId: upiId || undefined,
      ifsc: ifsc || undefined,
      reason,
      fraudType,
      riskLevel,
      reportedBy: reportedBy || "Admin",
    });

    if (accountNumber) {
      const user = await User.findOne({ accountNumber });
      if (user) {
        await User.findByIdAndUpdate(user._id, { status: "FROZEN" });
      }
    }

    res.json({ success: true, message: "Account added to fraud list", fraudAccount });
  } catch (err) {
    console.error("Add fraud account error:", err);
    res.status(500).json({ error: "Failed to add account to fraud list" });
  }
});

router.put("/deactivate/:id", async (req, res) => {
  try {
    const fraud = await FraudAccount.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );
    if (!fraud) return res.status(404).json({ error: "Fraud record not found" });

    console.log(`[FRAUD] Deactivated record: ${fraud.name} (${fraud.accountNumber || fraud.phoneNumber || fraud.upiId})`);
    res.json({ success: true, message: "Fraud record deactivated", fraud });
  } catch (err) {
    console.error("Deactivate fraud error:", err);
    res.status(500).json({ error: "Failed to deactivate fraud record" });
  }
});

router.delete("/delete/:id", async (req, res) => {
  try {
    const fraud = await FraudAccount.findByIdAndDelete(req.params.id);
    if (!fraud) return res.status(404).json({ error: "Fraud record not found" });

    console.log(`[FRAUD] Permanently deleted record: ${fraud.name} (${fraud.accountNumber || fraud.phoneNumber || fraud.upiId})`);
    res.json({ success: true, message: "Fraud record permanently deleted" });
  } catch (err) {
    console.error("Delete fraud error:", err);
    res.status(500).json({ error: "Failed to delete fraud record" });
  }
});

router.post("/freeze-user", async (req, res) => {
  try {
    const { userId, reason } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { status: "FROZEN" },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    if (reason) {
      await AuditLog.create({
        entityType: "USER",
        entityId: user.accountNumber,
        action: "ACCOUNT_FROZEN",
        performedBy: { type: "ADMIN", name: "Admin" },
        reason,
        newState: { status: "FROZEN" }
      });
    }

    res.json({ success: true, message: "User frozen successfully", user });
  } catch (err) {
    console.error("Freeze user error:", err);
    res.status(500).json({ error: "Failed to freeze user" });
  }
});

router.post("/unfreeze-user", async (req, res) => {
  try {
    const { userId, accountNumber, reason } = req.body;
    const identifier = accountNumber || userId;
    if (!identifier) return res.status(400).json({ error: "accountNumber or userId required" });

    let user;
    if (userId) {
      user = await User.findById(userId);
    } else if (accountNumber) {
      user = await User.findOne({ accountNumber });
    }

    // Deactivate fraud blacklist record — always do this even if no User exists
    const fraudIdentifier = accountNumber || (user?.accountNumber);
    let deactivatedFraud = null;
    if (fraudIdentifier) {
      deactivatedFraud = await FraudAccount.findOneAndUpdate(
        { accountNumber: fraudIdentifier, isActive: true },
        { $set: { isActive: false, updatedAt: new Date() } },
        { new: true }
      );
    }

    // Restore user status if linked user exists
    if (user) {
      user.status = "ACTIVE";
      user.accountStatus = {
        isFrozen: false,
        frozenAt: null,
        frozenBy: null,
        frozenReason: null,
        isSuspended: false,
        suspendedAt: null,
        suspendedUntil: null,
        suspendedBy: null,
        suspensionReason: null,
        isBlocked: false,
        blockedAt: null,
        blockedBy: null,
        blockingReason: null,
      };
      user.riskFlags = {
        isFlaggedForFraud: false,
        flaggedAt: null,
        complaintCount: 0,
        warningCount: 0,
      };
      await user.save();
    }

    // Audit log
    const msgParts = [];
    if (deactivatedFraud) msgParts.push("removed from blacklist");
    if (user) msgParts.push("user restored to ACTIVE");
    const auditAction = deactivatedFraud ? "ACCOUNT_UNBLACKLISTED" : "ACCOUNT_UNFROZEN";
    await AuditLog.create({
      entityType: "USER",
      entityId: user?.accountNumber || accountNumber || userId,
      action: auditAction,
      performedBy: { type: "ADMIN", name: "Admin" },
      reason: reason || "Unfrozen from fraud management",
      newState: { status: "ACTIVE", fraudActive: false }
    });

    res.json({
      success: true,
      message: msgParts.length > 0 ? "Account unfrozen: " + msgParts.join("; ") : "Account unfrozen successfully",
      user: user || null,
      fraudAccount: deactivatedFraud || null,
    });
  } catch (err) {
    console.error("Unfreeze user error:", err);
    res.status(500).json({ error: "Failed to unfreeze user" });
  }
});

router.post("/escalate", async (req, res) => {
  try {
    const { transactionId } = req.body;

    const txn = await Transaction.findByIdAndUpdate(
      transactionId,
      { is_fraud: true, risk_score: 100 },
      { new: true }
    );

    if (!txn)
      return res.status(404).json({ error: "Transaction not found" });

    res.json({ success: true, message: "Transaction escalated successfully", transaction: txn });
  } catch (err) {
    console.error("Escalate fraud error:", err);
    res.status(500).json({ error: "Failed to escalate transaction" });
  }
});

router.get("/complaints", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    filter.$nor = [{ "reported.accountNumber": "UNKNOWN", "relatedTransaction.amount": { $in: [0, null] } }, { "reporter.user_id": null }];

    const complaints = await TransactionReport.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await TransactionReport.countDocuments(filter);

    res.json({
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      complaints: complaints.map(c => ({
        complaintId: c.complaintId,
        reporter: c.reporter,
        reported: c.reported,
        category: c.complaint.category,
        amount: c.relatedTransaction?.amount,
        severity: c.severity,
        status: c.status,
        createdAt: c.createdAt
      }))
    });
  } catch (err) {
    console.error("Fraud complaints error:", err);
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

module.exports = router;
