const FraudAccount = require("../models/FraudAccount");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const FraudAlert = require("../models/FraudAlert");
const { scoreAnomaly } = require("../ml/anomalyModel");
const { findFraudByAny, findFraudByMultiple } = require("../utils/fraudCheck");

const VELOCITY_WINDOW_MS = 2 * 60 * 1000;
const RECEIVER_WINDOW_MS = 5 * 60 * 1000;
const HIGH_AMOUNT_1 = 10000;
const HIGH_AMOUNT_2 = 50000;
const BENEFICIARY_COOLDOWN_MS = 30 * 60 * 1000;

async function evaluateTransactionRisk(userId, amount, toAccount, toUpi) {
  const reasons = [];
  const riskFactors = [];
  let riskScore = 0;
  let anomalyScore = 0;

  const now = Date.now();

  const _dbT0 = Date.now();
  const [blacklistResult, recentTxns] = await Promise.all([
    findFraudByMultiple([toAccount, toUpi]),
    Transaction.find({
      user_id: userId,
      createdAt: { $gte: new Date(now - RECEIVER_WINDOW_MS) }
    }).sort({ createdAt: -1 })
  ]);
  console.log(`[PERF] fraudEngine DB queries (blacklist + recentTxns): ${Date.now() - _dbT0}ms`);

  if (blacklistResult) {
    const val = function() {
      if (toAccount && blacklistResult.accountNumber && blacklistResult.accountNumber.toLowerCase() === toAccount.toString().toLowerCase()) return "accountNumber";
      if (toUpi && blacklistResult.upiId && blacklistResult.upiId.toLowerCase() === toUpi.toString().toLowerCase()) return "upiId";
      if (toAccount && blacklistResult.phoneNumber && blacklistResult.phoneNumber === toAccount.toString().trim()) return "phoneNumber";
      if (toUpi && blacklistResult.phoneNumber && blacklistResult.phoneNumber === toUpi.toString().trim()) return "phoneNumber";
      return "upiId";
    }();
    const reason = `BLACKLISTED_${val.toUpperCase()}_MATCH`;
    riskScore += 90;
    reasons.push(reason);
    riskFactors.push({ name: reason, points: 90 });
  }

  const rapidTxns = recentTxns.filter(t =>
    (now - new Date(t.createdAt).getTime()) < VELOCITY_WINDOW_MS
  );

  const rapidTxnsToReceiver = recentTxns.filter(t => {
    if (t.type !== "DEBIT") return false;
    const isRecent = (now - new Date(t.createdAt).getTime()) < VELOCITY_WINDOW_MS;
    const matchesReceiver = (toAccount && t.to_account === toAccount) || (toUpi && t.to_upi === toUpi);
    return isRecent && matchesReceiver;
  });
  if (rapidTxnsToReceiver.length >= 2) {
    riskScore += 30;
    reasons.push("RAPID_TRANSACTIONS_2_IN_2MIN");
    riskFactors.push({ name: "RAPID_TRANSACTIONS_2_IN_2MIN", points: 30 });
  }

  const uniqueReceivers = new Set(
    recentTxns
      .filter(t => t.type === "DEBIT")
      .map(t => t.to_account || t.to_upi)
      .filter(Boolean)
  );
  if (toAccount || toUpi) uniqueReceivers.add(toAccount || toUpi);
  if (uniqueReceivers.size > 3) {
    riskScore += 25;
    reasons.push("MULTIPLE_RECEIVERS_3_IN_5MIN");
    riskFactors.push({ name: "MULTIPLE_RECEIVERS_3_IN_5MIN", points: 25 });
  }

  const recentAmounts = rapidTxns.map(t => t.amount);
  const sameAmountCount = recentAmounts.filter(a => a === amount).length;
  if (sameAmountCount >= 3) {
    riskScore += 20;
    reasons.push("REPEATED_SAME_AMOUNT_PATTERN");
    riskFactors.push({ name: "REPEATED_SAME_AMOUNT_PATTERN", points: 20 });
  }

  if (amount > HIGH_AMOUNT_2) {
    riskScore += 30;
    reasons.push("HIGH_AMOUNT_ABOVE_50000");
    riskFactors.push({ name: "HIGH_AMOUNT_ABOVE_50000", points: 30 });
  } else if (amount > HIGH_AMOUNT_1) {
    riskScore += 15;
    reasons.push("HIGH_AMOUNT_ABOVE_10000");
    riskFactors.push({ name: "HIGH_AMOUNT_ABOVE_10000", points: 15 });
  }

  if (toAccount || toUpi) {
    const orConditions = [];
    if (toAccount) orConditions.push({ to_account: toAccount });
    if (toUpi) orConditions.push({ to_upi: toUpi });
    const _benefT0 = Date.now();
    const prevTxns = orConditions.length > 0
      ? await Transaction.findOne({ user_id: userId, type: "DEBIT", $or: orConditions })
      : null;
    console.log(`[PERF] fraudEngine new-beneficiary check: ${Date.now() - _benefT0}ms`);
    if (!prevTxns) {
      let newBenPoints;
      if (amount < 1000) {
        riskScore += 5;
        newBenPoints = 5;
      } else if (amount < 10000) {
        riskScore += 10;
        newBenPoints = 10;
      } else {
        riskScore += 20;
        newBenPoints = 20;
      }
      reasons.push("NEW_BENEFICIARY");
      riskFactors.push({ name: "NEW_BENEFICIARY", points: newBenPoints });
    }
  }

  try {
    const mlInput = {
      amount,
      hour: new Date().getHours(),
      day: new Date().getDay(),
      txns_last_24h: recentTxns.length,
      avg_amount_7d: recentTxns.length > 0
        ? recentTxns.reduce((s, t) => s + t.amount, 0) / recentTxns.length
        : amount,
      balance_before: 0,
      location_delta_km: 0,
      is_foreign_device: 0
    };
    const _mlT0 = Date.now();
    anomalyScore = await scoreAnomaly(mlInput);
    console.log(`[PERF] brain.js scoreAnomaly: ${Date.now() - _mlT0}ms (score=${anomalyScore.toFixed(4)})`);
    if (anomalyScore > 0.85) {
      const pts = amount < 1000 ? 5 : 20;
      riskScore += pts;
      reasons.push("ML_ANOMALY_HIGH");
      riskFactors.push({ name: "ML_ANOMALY_HIGH", points: pts });
    } else if (anomalyScore > 0.7) {
      const pts = amount < 1000 ? 3 : 10;
      riskScore += pts;
      reasons.push("ML_ANOMALY_MEDIUM");
      riskFactors.push({ name: "ML_ANOMALY_MEDIUM", points: pts });
    }
  } catch (err) {
    console.error("[FRAUD_ENGINE] ML scoring error:", err.message);
  }

  riskScore = Math.min(riskScore, 200);

  let decision;
  if (riskScore >= 90) {
    decision = "TEMP_FREEZE";
  } else if (riskScore >= 60 || (riskScore >= 40 && amount > 10000)) {
    decision = "HOLD_FOR_REVIEW";
  } else if (riskScore >= 25) {
    decision = "WARNING";
  } else {
    decision = "SAFE";
  }

  return {
    riskScore,
    anomalyScore,
    reasons,
    riskFactors,
    decision,
    isSuspicious: riskScore >= 25,
    needsDelay: riskScore >= 60 || (riskScore >= 40 && amount > 10000)
  };
}

async function evaluateUPICollectRisk(requesterId, targetId, amount) {
  const reasons = [];
  const riskFactors = [];
  let riskScore = 0;
  let anomalyScore = 0;

  const requesterUser = await User.findById(requesterId);
  if (!requesterUser) {
    riskScore += 25;
    reasons.push("UNKNOWN_REQUESTER");
    riskFactors.push({ name: "UNKNOWN_REQUESTER", points: 25 });
  } else {
    const blacklisted = await findFraudByAny(
      requesterUser.phoneNumber || requesterUser.accountNumber || requesterUser.upiId
    );
    if (blacklisted) {
      riskScore += 80;
      reasons.push("BLACKLISTED_REQUESTER");
      riskFactors.push({ name: "BLACKLISTED_REQUESTER", points: 80 });
    }
  }

  if (amount > HIGH_AMOUNT_2) {
    riskScore += 30;
    reasons.push("HIGH_AMOUNT_ABOVE_50000");
    riskFactors.push({ name: "HIGH_AMOUNT_ABOVE_50000", points: 30 });
  } else if (amount > HIGH_AMOUNT_1) {
    riskScore += 15;
    reasons.push("HIGH_AMOUNT_ABOVE_10000");
    riskFactors.push({ name: "HIGH_AMOUNT_ABOVE_10000", points: 15 });
  }

  const recentRequests = await Transaction.countDocuments({
    $or: [{ user_id: requesterId }, { "to_upi": requesterUser?.upiId }],
    createdAt: { $gte: new Date(Date.now() - VELOCITY_WINDOW_MS) }
  });
  if (recentRequests >= 5) {
    riskScore += 25;
    reasons.push("RAPID_REQUEST_PATTERN");
    riskFactors.push({ name: "RAPID_REQUEST_PATTERN", points: 25 });
  }

  try {
    const mlInput = {
      amount,
      hour: new Date().getHours(),
      day: new Date().getDay(),
      txns_last_24h: recentRequests,
      avg_amount_7d: amount,
      balance_before: 0,
      location_delta_km: 0,
      is_foreign_device: 0
    };
    anomalyScore = await scoreAnomaly(mlInput);
    if (anomalyScore > 0.85) {
      const pts = amount < 1000 ? 5 : 20;
      riskScore += pts;
      reasons.push("ML_ANOMALY_HIGH");
      riskFactors.push({ name: "ML_ANOMALY_HIGH", points: pts });
    } else if (anomalyScore > 0.7) {
      const pts = amount < 1000 ? 3 : 10;
      riskScore += pts;
      reasons.push("ML_ANOMALY_MEDIUM");
      riskFactors.push({ name: "ML_ANOMALY_MEDIUM", points: pts });
    }
  } catch (err) {
    console.error("[FRAUD_ENGINE] ML scoring error:", err.message);
  }

  riskScore = Math.min(riskScore, 200);

  let decision;
  if (riskScore >= 90) {
    decision = "TEMP_FREEZE";
  } else if (riskScore >= 60 || (riskScore >= 40 && amount > 10000)) {
    decision = "HOLD_FOR_REVIEW";
  } else if (riskScore >= 25) {
    decision = "WARNING";
  } else {
    decision = "SAFE";
  }

  return {
    riskScore,
    anomalyScore,
    reasons,
    riskFactors,
    decision,
    isSuspicious: riskScore >= 25,
    isCritical: riskScore >= 90
  };
}

async function createFraudAlert({ userId, receiverId, transactionId, scheduledTxnId, upiCollectRequestId, riskScore, anomalyScore, reasons, riskFactors, decision }) {
  const alert = await FraudAlert.create({
    userId,
    receiverId,
    transactionId,
    scheduledTxnId,
    upiCollectRequestId,
    riskScore,
    anomalyScore,
    riskReasons: reasons,
    riskFactors: riskFactors || [],
    fraudType: riskScore >= 90 ? "ACCOUNT_TAKEOVER" : riskScore >= 60 ? "UPI_SCAM" : "OTHER",
    decision,
    status: "OPEN"
  });
  return alert;
}

async function autoFreezeUser(userId, reason) {
  const user = await User.findById(userId);
  if (!user) return null;

  user.status = "TEMP_FROZEN";
  user.accountStatus.isFrozen = true;
  user.accountStatus.frozenAt = new Date();
  user.accountStatus.frozenReason = reason || "Auto-frozen by fraud engine (risk score >= 90)";

  user.riskFlags.isFlaggedForFraud = true;
  user.riskFlags.flaggedAt = new Date();

  await user.save();
  return user;
}

async function isNewBeneficiary(userId, receiverIdentifier) {
  const existing = await Transaction.findOne({
    user_id: userId,
    type: "DEBIT",
    $or: [
      { to_account: receiverIdentifier },
      { to_upi: receiverIdentifier }
    ]
  });
  return !existing;
}

function buildDecisionResponse(fraudResult, options = {}) {
  const { decision, riskScore, reasons, riskFactors } = fraudResult;
  const response = {
    success: options.success !== undefined ? options.success : true,
    decision,
    riskScore,
    riskFactors: riskFactors || [],
    fraudReason: (reasons || []).join(", "),
    fraudWarning: decision !== "SAFE",
    holdTime: 0,
    allowProceed: false,
    actionRequired: false,
    popupTitle: "",
    userMessage: "",
  };

  switch (decision) {
    case "TEMP_FREEZE":
      response.popupTitle = "Transaction Blocked";
      response.userMessage = "Your account has been temporarily frozen due to suspicious activity detected by our fraud prevention system. Please contact customer support for assistance.";
      response.allowProceed = false;
      response.actionRequired = true;
      response.holdTime = 0;
      break;
    case "HOLD_FOR_REVIEW":
      response.popupTitle = "Transaction Under Review";
      response.userMessage = "Your transaction has been held for security review. It will be processed automatically after 1 hour if no issues are found.";
      response.allowProceed = false;
      response.actionRequired = true;
      response.holdTime = 60 * 60 * 1000;
      break;
    case "WARNING":
      response.popupTitle = "Suspicious Transaction Warning";
      response.userMessage = "We detected unusual activity patterns. Proceed with caution.";
      response.allowProceed = true;
      response.actionRequired = false;
      response.holdTime = 0;
      break;
    case "SAFE":
      response.popupTitle = "Transaction Safe";
      response.userMessage = "Transaction verified as safe.";
      response.allowProceed = true;
      response.actionRequired = false;
      response.holdTime = 0;
      break;
  }

  if (options.customTitle) response.popupTitle = options.customTitle;
  if (options.customMessage) response.userMessage = options.customMessage;
  if (options.allowProceed !== undefined) response.allowProceed = options.allowProceed;
  if (options.holdTime !== undefined) response.holdTime = options.holdTime;
  if (options.receiverStatus) response.receiverStatus = options.receiverStatus;
  if (options.beneficiaryCooling) {
    response.popupTitle = "New Beneficiary Cooling Period";
    response.userMessage = "This is a new beneficiary. Your transaction will be processed after a 30-minute cooling period for security purposes.";
    response.holdTime = 30 * 60 * 1000;
    response.actionRequired = true;
  }

  return response;
}

async function getReceiverStatus(receiverIdentifier) {
  const blacklisted = await findFraudByAny(receiverIdentifier);
  if (blacklisted) {
    return blacklisted.riskLevel === "HIGH" || blacklisted.riskLevel === "CRITICAL" ? "BLACKLISTED" : "HIGH_RISK";
  }

  const user = await User.findOne({
    $or: [
      { accountNumber: receiverIdentifier },
      { upiId: receiverIdentifier },
      { phoneNumber: receiverIdentifier }
    ]
  });

  if (!user) return "SAFE";

  switch (user.status) {
    case "TEMP_FROZEN": return "TEMP_FROZEN";
    case "UNDER_REVIEW":
    case "FROZEN": return "UNDER_REVIEW";
    case "SUSPENDED":
    case "BLOCKED": return "BLACKLISTED";
    default: return "SAFE";
  }
}

module.exports = {
  evaluateTransactionRisk,
  evaluateUPICollectRisk,
  createFraudAlert,
  autoFreezeUser,
  isNewBeneficiary,
  buildDecisionResponse,
  getReceiverStatus
};
