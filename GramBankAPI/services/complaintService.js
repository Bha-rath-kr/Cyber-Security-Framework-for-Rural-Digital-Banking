const TransactionReport = require("../models/TransactionReport");
const FraudInvestigation = require("../models/FraudInvestigation");
const AuditLog = require("../models/AuditLog");
const AdminAction = require("../models/AdminAction");
const FraudAccount = require("../models/FraudAccount");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const ScheduledTransaction = require("../models/ScheduledTransaction");
const fraudList = require("../fraudList");
const { scoreAnomaly } = require("../ml/anomalyModel");

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
let twilioClient;
try {
  const twilio = require("twilio");
  twilioClient = twilio(accountSid, authToken);
} catch (e) {
  console.error("Twilio init error:", e);
}

function formatPhone(phone) {
  if (!phone) return phone;
  if (phone.startsWith("+")) return phone;
  if (/^\d{10}$/.test(phone)) return "+91" + phone;
  return phone;
}

function maskAccount(acc) {
  if (!acc) return "****";
  const s = acc.toString();
  return "****" + s.slice(-4);
}

function generateComplaintId() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `CMP-${yyyy}${mm}${dd}-${rand}`;
}

function calculateSeverity(amount, category) {
  let score = 0;
  if (amount >= 50000) score += 3;
  else if (amount >= 10000) score += 2;
  else if (amount >= 1000) score += 1;

  const highRiskCategories = ["ACCOUNT_TAKEOVER", "MULE_ACCOUNT", "PHISHING"];
  if (highRiskCategories.includes(category)) score += 2;

  if (score >= 4) return "CRITICAL";
  if (score >= 3) return "HIGH";
  if (score >= 2) return "MEDIUM";
  return "LOW";
}

async function calculateFraudIndicators(reportedAccount, amount) {
  const indicators = {
    deviceMismatch: false,
    locationAnomaly: false,
    rapidTransactions: false,
    newBeneficiary: false,
    unusualAmount: false,
    score: 0
  };

  const reportedUser = await User.findOne({ accountNumber: reportedAccount });
  if (reportedUser) {
    const recentTxns = await Transaction.find({ user_id: reportedUser._id })
      .sort({ createdAt: -1 })
      .limit(10);

    if (recentTxns.length >= 3) {
      const timeWindow = 5 * 60 * 60 * 1000;
      const now = Date.now();
      const rapidTxns = recentTxns.filter(t =>
        (now - new Date(t.createdAt).getTime()) < timeWindow
      );
      if (rapidTxns.length >= 3) {
        indicators.rapidTransactions = true;
        indicators.score += 25;
      }
    }
  }

  if (amount > 10000) {
    indicators.unusualAmount = true;
    indicators.score += 15;
  }

  const inFraudList = fraudList.some(f => f.account === reportedAccount);
  if (inFraudList) {
    indicators.score += 30;
  }

  const existingFraud = await FraudAccount.findOne({ accountNumber: reportedAccount, isActive: true });
  if (existingFraud) {
    indicators.score += 25;
  }

  try {
    const mlScore = await scoreAnomaly({
      amount,
      hour: new Date().getHours(),
      day: new Date().getDay(),
      txns_last_24h: reportedUser ? 0 : 0,
      avg_amount_7d: amount,
      balance_before: 0,
      location_delta_km: 0,
      is_foreign_device: 0
    });
    if (mlScore > 0.85) {
      indicators.score += 30;
    } else if (mlScore > 0.7) {
      indicators.score += 15;
    }
  } catch (err) {
    console.error("[ML] Complaint scoring error:", err.message);
  }

  return indicators;
}

async function sendNotification(phone, type, complaintId, additional) {
  if (!twilioClient || !phone) return;
  const messages = {
    submitted: `GramBank: Your complaint ${complaintId} has been received. Track status in the app.`,
    under_review: `GramBank: Complaint ${complaintId} is now under review by our team.`,
    accepted: `GramBank: Complaint ${complaintId} has been accepted. Action is being taken.`,
    rejected: `GramBank: Complaint ${complaintId} has been rejected. Reason: ${additional || "Insufficient evidence"}`,
    marked_fraud: `GramBank: Complaint ${complaintId} resolved. Reported account has been marked as fraudulent.`,
    suspended: `GramBank: Complaint ${complaintId} resolved. Reported account has been suspended.`,
    blocked: `GramBank: Complaint ${complaintId} resolved. Reported account has been permanently blocked.`,
    investigating: `GramBank: Complaint ${complaintId} is under detailed investigation.`,
    resolved: `GramBank: Complaint ${complaintId} has been resolved. Thank you for your patience.`,
    account_frozen: `GramBank: Your account has been frozen due to fraud reports. Visit your nearest branch for assistance.`
  };

  try {
    await twilioClient.messages.create({
      to: formatPhone(phone),
      body: messages[type] || `GramBank: Update on complaint ${complaintId}`,
      from: twilioPhoneNumber
    });
  } catch (e) {
    console.error("SMS notification error:", e);
  }
}

async function createAuditLog(entityType, entityId, action, performedBy, reason, previousState, newState) {
  return AuditLog.create({
    entityType,
    entityId,
    action,
    performedBy: {
      type: performedBy.type,
      id: performedBy.id,
      name: performedBy.name,
      role: performedBy.role || "USER",
      ipAddress: performedBy.ipAddress,
      userAgent: performedBy.userAgent
    },
    reason,
    previousState,
    newState,
    timestamp: new Date()
  });
}

// Filter to exclude clearly junk records from admin views.
// Only filters records where ALL criteria match simultaneously.
const JUNK_REPORT_FILTER = {
  $nor: [
    { "reported.accountNumber": "UNKNOWN", "relatedTransaction.amount": { $in: [0, null] } },
    { "reporter.user_id": null },
  ]
};

function applyFilter(base = {}, extra = {}) {
  const $nor = [...(base.$nor || []), ...(JUNK_REPORT_FILTER.$nor)];
  return { ...base, ...extra, $nor };
}

const ComplaintService = {
  generateComplaintId,
  calculateSeverity,
  calculateFraudIndicators,
  sendNotification,
  createAuditLog,
  maskAccount,

  async submitComplaint(userData, complaintData) {
    if (!userData || !userData._id) throw new Error("User not authenticated");
    if (!complaintData.category) throw new Error("Complaint category is required");
    if (!complaintData.description) throw new Error("Complaint description is required");
    // Allow UNKNOWN as a fallback if reported account cannot be determined
    if (!complaintData.reported_account) {
      complaintData.reported_account = "UNKNOWN";
      console.log("[COMPLAINT] Set reported_account to UNKNOWN");
    }
    console.log("[COMPLAINT] Final reported_account:", complaintData.reported_account);
    if (!complaintData.amount || complaintData.amount <= 0) throw new Error("Valid transaction amount is required");

    const complaintId = generateComplaintId();

    const indicators = await calculateFraudIndicators(
      complaintData.reported_account,
      complaintData.amount
    );

    const severity = calculateSeverity(complaintData.amount, complaintData.category);

    const reportedUser = await User.findOne({ accountNumber: complaintData.reported_account });

    // Ensure user has all required fields
    if (!userData.phoneNumber || !userData.accountNumber || !userData.name) {
      throw new Error("User profile incomplete: phoneNumber, accountNumber, and name are required");
    }

    const report = await TransactionReport.create({
      complaintId,
      reporter: {
        user_id: userData._id,
        name: userData.name,
        accountNumber: userData.accountNumber,
        phoneNumber: userData.phoneNumber
      },
      reported: {
        accountNumber: complaintData.reported_account,
        upiId: complaintData.upi_id || (reportedUser ? reportedUser.upiId : null),
        name: reportedUser ? reportedUser.name : null,
        user_id: reportedUser ? reportedUser._id : null
      },
      relatedTransaction: {
        txn_id: complaintData.txn_id || null,
        amount: complaintData.amount,
        type: complaintData.txn_type || "BANK_TRANSFER",
        timestamp: complaintData.incident_date || new Date()
      },
      complaint: {
        category: complaintData.category,
        description: complaintData.description,
        incidentDate: complaintData.incident_date || new Date(),
        reportedAt: new Date()
      },
      evidence: (complaintData.evidence || []).map(e => ({
        url: e.url,
        description: e.description || "",
        uploadedAt: new Date()
      })),
      severity,
      status: "PENDING",
      fraudIndicators: indicators,
      timeline: [{
        status: "PENDING",
        note: "Complaint submitted by user",
        performedBy: userData.name,
        performedAt: new Date()
      }]
    });

    await createAuditLog(
      "COMPLAINT",
      complaintId,
      "SUBMITTED",
      { type: "USER", id: userData._id, name: userData.name, role: "USER" },
      complaintData.category,
      null,
      { status: "PENDING", severity, complaintId }
    );

    await sendNotification(userData.phoneNumber, "submitted", complaintId);

    return report;
  },

  async takeAction(complaintId, actionData, adminData) {
    const complaint = await TransactionReport.findById(complaintId);
    if (!complaint) throw new Error("Complaint not found");

    const prevStatus = complaint.status;
    const actionMap = {
      accept: {
        status: "ACCEPTED",
        notificationKey: "accepted",
        freezeUser: false,
        addFraudList: false,
        flagSuspicious: false
      },
      reject: {
        status: "REJECTED",
        notificationKey: "rejected",
        freezeUser: false,
        addFraudList: false,
        flagSuspicious: false,
        requiresReason: true
      },
      mark_fraud: {
        status: "FRAUD_CONFIRMED",
        notificationKey: "marked_fraud",
        freezeUser: true,
        freezeType: "permanent",
        addFraudList: true,
        flagSuspicious: false
      },
      suspend: {
        status: "SUSPENDED",
        notificationKey: "suspended",
        freezeUser: true,
        freezeType: "temporary",
        addFraudList: false,
        flagSuspicious: false
      },
      block: {
        status: "BLOCKED",
        notificationKey: "blocked",
        freezeUser: true,
        freezeType: "permanent",
        addFraudList: true,
        flagSuspicious: false
      },
      investigate: {
        status: "INVESTIGATING",
        notificationKey: "investigating",
        freezeUser: false,
        addFraudList: false,
        flagSuspicious: true
      },
      clear: {
        status: "CLEARED",
        notificationKey: "resolved",
        freezeUser: false,
        addFraudList: false,
        flagSuspicious: false
      }
    };

    const plan = actionMap[actionData.action];
    if (!plan) throw new Error("Invalid action");
    if (plan.requiresReason && !actionData.reason) throw new Error("Reason is required for this action");

    const missing = [];
    if (!complaint.complaintId) missing.push("complaintId");
    if (!complaint.reporter?.user_id) missing.push("reporter.user_id");
    if (!complaint.reporter?.name) missing.push("reporter.name");
    if (!complaint.reporter?.accountNumber) missing.push("reporter.accountNumber");
    if (!complaint.reporter?.phoneNumber) missing.push("reporter.phoneNumber");
    if (!complaint.relatedTransaction?.amount || complaint.relatedTransaction.amount <= 0) missing.push("relatedTransaction.amount");
    if (!complaint.complaint?.category) missing.push("complaint.category");
    if (!complaint.complaint?.description) missing.push("complaint.description");
    if (!complaint.complaint?.incidentDate) missing.push("complaint.incidentDate");
    if (missing.length > 0) {
      throw new Error(
        `Cannot act on incomplete complaint "${complaint.complaintId || complaint._id}". ` +
        `This record is missing required fields and appears to be corrupted legacy data. ` +
        `Missing: ${missing.join(", ")}`
      );
    }

    complaint.status = plan.status;
    const adminDataObj = {};
    const isValidObjectId = (id) => {
      if (!id) return false;
      if (typeof id === "object" && id.toString) return true;
      if (typeof id === "string") return /^[0-9a-fA-F]{24}$/.test(id);
      return false;
    };
    if (isValidObjectId(adminData._id)) {
      adminDataObj.admin_id = adminData._id;
    }
    adminDataObj.name = adminData.name;
    adminDataObj.actionTakenAt = new Date();
    adminDataObj.actionType = actionData.action;
    adminDataObj.notes = actionData.notes || "";
    adminDataObj.rejectionReason = actionData.reason || "";
    complaint.admin = adminDataObj;

    if (actionData.action === "investigate" && actionData.findings) {
      complaint.investigation.findings = actionData.findings;
    }

    const actionsTaken = [];

    if (plan.freezeUser && complaint.reported.accountNumber) {
      const freezeType = plan.freezeType;
      const now = new Date();
      
      if (freezeType === "temporary") {
        // Suspend for 30 days
        const suspendUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await User.updateOne(
          { accountNumber: complaint.reported.accountNumber },
          {
            status: "SUSPENDED",
            "accountStatus.isSuspended": true,
            "accountStatus.suspendedAt": now,
            "accountStatus.suspendedUntil": suspendUntil,
            "accountStatus.suspendedBy": adminData.name,
            "accountStatus.suspensionReason": actionData.reason || `Suspended via complaint ${complaint.complaintId}`
          }
        );
        actionsTaken.push(`Account ${maskAccount(complaint.reported.accountNumber)} suspended for 30 days`);
      } else {
        // Permanent freeze/block
        const newStatus = actionData.action === "block" ? "BLOCKED" : "FROZEN";
        const updateObj = {
          status: newStatus
        };
        
        if (actionData.action === "block") {
          updateObj["accountStatus.isBlocked"] = true;
          updateObj["accountStatus.blockedAt"] = now;
          updateObj["accountStatus.blockedBy"] = adminData.name;
          updateObj["accountStatus.blockingReason"] = actionData.reason || `Blocked via complaint ${complaint.complaintId}`;
        } else {
          updateObj["accountStatus.isFrozen"] = true;
          updateObj["accountStatus.frozenAt"] = now;
          updateObj["accountStatus.frozenBy"] = adminData.name;
          updateObj["accountStatus.frozenReason"] = actionData.reason || `Frozen via complaint ${complaint.complaintId}`;
        }
        
        await User.updateOne(
          { accountNumber: complaint.reported.accountNumber },
          updateObj
        );
        actionsTaken.push(`Account ${maskAccount(complaint.reported.accountNumber)} ${newStatus === "BLOCKED" ? "blocked" : "frozen"}`);
      }

      const reportedUser = await User.findOne({ accountNumber: complaint.reported.accountNumber });
      if (reportedUser) {
        await sendNotification(reportedUser.phoneNumber, "account_frozen", complaint.complaintId);
      }
    }

    if (plan.addFraudList && complaint.reported.accountNumber) {
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
        ifsc: actionData.ifsc || "GBRK0002130",
        reason: actionData.reason || `Added via complaint ${complaint.complaintId}: ${actionData.notes || "Fraudulent activity confirmed"}`,
        fraudType: "OTHER",
        riskLevel: complaint.severity === "CRITICAL" ? "CRITICAL" : complaint.severity === "HIGH" ? "HIGH" : "MEDIUM",
        reportedBy: adminData.name || "Admin",
        isActive: true
      };

      if (filter.length > 0) {
        await FraudAccount.findOneAndUpdate(
          { $or: filter },
          { $set: { ...fraudData, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, new: true }
        );
        actionsTaken.push("Account added to fraud blacklist");
      } else {
        await FraudAccount.create(fraudData);
        actionsTaken.push("Account added to fraud blacklist");
      }
    }

    if (plan.flagSuspicious && complaint.reported.accountNumber) {
      await Transaction.updateMany(
        { to_account: complaint.reported.accountNumber },
        { $set: { is_suspicious: true, risk_score: 80 } }
      );
      actionsTaken.push("Related transactions flagged as suspicious");
    }

    if (actionData.action === "reject") {
      complaint.resolution = {
        resolvedAt: new Date(),
        resolutionSummary: actionData.reason || "Complaint rejected after review",
        refundIssued: false,
        refundAmount: 0
      };
    }

    if (actionData.action === "suspend" || actionData.action === "mark_fraud" || actionData.action === "block") {
      complaint.resolution = {
        resolvedAt: new Date(),
        resolutionSummary: actionData.reason || `Account ${actionData.action === "suspend" ? "suspended" : actionData.action === "mark_fraud" ? "marked as fraudulent" : "permanently blocked"}`,
        refundIssued: false,
        refundAmount: 0
      };
    }

    if (actionData.action === "block" || actionData.action === "suspend" || actionData.action === "reject") {
      complaint.status = "RESOLVED";
    }

    if (actionData.action === "accept") {
      complaint.status = "ACTION_TAKEN";
    }

    complaint.timeline.push({
      status: complaint.status,
      note: actionData.notes || actionData.reason || "",
      performedBy: adminData.name,
      performedAt: new Date()
    });

    await complaint.save();

    // FraudInvestigation linkage for investigate / clear / mark_fraud
    if (actionData.action === "investigate") {
      const existingInvestigation = await FraudInvestigation.findOne({ complaint: complaint._id, status: "INVESTIGATING" });
      if (!existingInvestigation) {
        await FraudInvestigation.create({
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
          adminName: adminData.name || "Admin",
          findings: actionData.findings || actionData.notes || "",
          startedAt: new Date()
        });
      }
    } else if (actionData.action === "clear") {
      await FraudInvestigation.findOneAndUpdate(
        { complaint: complaint._id, status: "INVESTIGATING" },
        { $set: { status: "CLEARED", resolvedAt: new Date(), findings: actionData.notes || "" } }
      );
    } else if (actionData.action === "mark_fraud") {
      await FraudInvestigation.findOneAndUpdate(
        { complaint: complaint._id, status: "INVESTIGATING" },
        { $set: { status: "FRAUD_CONFIRMED", resolvedAt: new Date(), findings: actionData.notes || "" } }
      );
    }

    // Create AdminAction record with proper ID handling
    const adminActionData = {
      complaintId: complaint.complaintId,
      adminName: adminData.name,
      actionType: actionData.action.toUpperCase(),
      reason: actionData.reason || "",
      notes: actionData.notes || "",
      impact: {
        userFrozen: plan.freezeUser,
        addedToFraudList: plan.addFraudList,
        transactionsBlocked: 0
      },
      timestamp: new Date()
    };

    // Only add adminId if it's a valid ObjectId
    if (isValidObjectId(adminData._id)) {
      adminActionData.adminId = adminData._id;
    }

    await AdminAction.create(adminActionData);

    await createAuditLog(
      "COMPLAINT",
      complaint.complaintId,
      `ACTION_${actionData.action.toUpperCase()}`,
      { type: "ADMIN", id: adminData._id, name: adminData.name, role: adminData.role || "ADMIN", ipAddress: actionData.ipAddress, userAgent: actionData.userAgent },
      actionData.reason || actionData.notes || "",
      { status: prevStatus },
      { status: complaint.status, actions_taken: actionsTaken }
    );

    await sendNotification(
      complaint.reporter.phoneNumber,
      plan.notificationKey,
      complaint.complaintId,
      actionData.reason
    );

    return { complaint, actionsTaken };
  },

  async getComplaintStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const jf = JUNK_REPORT_FILTER;

    const [
      totalComplaints,
      pendingComplaints,
      underReview,
      underInvestigation,
      resolved,
      rejected,
      fraudMarked,
      blocked,
      suspended,
      criticalCount,
      highCount,
      avgResolutionTime,
      recentComplaints
    ] = await Promise.all([
      TransactionReport.countDocuments(jf),
      TransactionReport.countDocuments(applyFilter({ status: { $in: ["PENDING", "UNDER_REVIEW", "ACCEPTED", "UNDER_INVESTIGATION", "INVESTIGATING"] } })),
      TransactionReport.countDocuments(applyFilter({ status: "UNDER_REVIEW" })),
      TransactionReport.countDocuments(applyFilter({ status: { $in: ["UNDER_INVESTIGATION", "INVESTIGATING"] } })),
      TransactionReport.countDocuments(applyFilter({ status: { $in: ["RESOLVED", "ACTION_TAKEN", "CLEARED"] } })),
      TransactionReport.countDocuments(applyFilter({ status: "REJECTED" })),
      TransactionReport.countDocuments(applyFilter({ status: { $in: ["MARKED_FRAUD", "FRAUD_CONFIRMED"] } })),
      TransactionReport.countDocuments(applyFilter({ status: "BLOCKED" })),
      TransactionReport.countDocuments(applyFilter({ status: "SUSPENDED" })),
      TransactionReport.countDocuments(applyFilter({ severity: "CRITICAL" })),
      TransactionReport.countDocuments(applyFilter({ severity: "HIGH" })),
      TransactionReport.aggregate([
        { $match: applyFilter({ status: { $in: ["RESOLVED", "ACTION_TAKEN"] }, resolvedAt: { $exists: true } }) },
        { $group: { _id: null, avgDays: { $avg: { $divide: [{ $subtract: ["$resolvedAt", "$createdAt"] }, 86400000] } } } }
      ]),
      TransactionReport.countDocuments(applyFilter({ createdAt: { $gte: thirtyDaysAgo } }))
    ]);

    return {
      total: totalComplaints,
      pending: pendingComplaints,
      underReview,
      underInvestigation,
      resolved,
      rejected,
      fraudMarked,
      blocked,
      suspended,
      critical: criticalCount,
      high: highCount,
      avgResolutionDays: avgResolutionTime[0] ? Math.round(avgResolutionTime[0].avgDays * 10) / 10 : 0,
      last30Days: recentComplaints
    };
  },

  async getComplaints(filters = {}) {
    const { status, severity, category, search, page = 1, limit = 20 } = filters;
    const filter = {};

    if (status) {
      if (Array.isArray(status)) {
        filter.status = { $in: status };
      } else {
        filter.status = status;
      }
    }
    if (severity) filter.severity = severity;
    if (category) filter["complaint.category"] = category;

    if (search) {
      filter.$or = [
        { complaintId: { $regex: search, $options: "i" } },
        { "reporter.name": { $regex: search, $options: "i" } },
        { "reporter.accountNumber": { $regex: search, $options: "i" } },
        { "reported.accountNumber": { $regex: search, $options: "i" } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filtered = applyFilter(filter);

    const [complaints, total] = await Promise.all([
      TransactionReport.find(filtered)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TransactionReport.countDocuments(filtered)
    ]);

    return {
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      complaints
    };
  },

  async getComplaintById(complaintId) {
    const complaint = await TransactionReport.findById(complaintId);
    if (!complaint) return null;

    let relatedTransactions = [];
    if (complaint.reported.accountNumber) {
      relatedTransactions = await Transaction.find({
        $or: [
          { to_account: complaint.reported.accountNumber },
          { "user_id": complaint.reported.user_id }
        ]
      }).sort({ createdAt: -1 }).limit(20);
    }

    let reportedUserDetails = null;
    if (complaint.reported.accountNumber) {
      reportedUserDetails = await User.findOne({ accountNumber: complaint.reported.accountNumber });
    }

    const auditLogs = await AuditLog.find({
      entityType: "COMPLAINT",
      entityId: complaint.complaintId
    }).sort({ timestamp: -1 });

    return {
      complaint,
      reportedUser: reportedUserDetails,
      relatedTransactions,
      auditLogs
    };
  }
};

module.exports = ComplaintService;
