// routes/txnRoutes.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Otp = require("../models/Otp");
const ScheduledTransaction = require("../models/ScheduledTransaction");
const auth = require("../middleware/auth");
const router = express.Router();
const TransactionReport = require("../models/TransactionReport");
const TrustedReceiver = require("../models/TrustedReceiver");
const FraudAccount = require("../models/FraudAccount");
const { scoreAnomaly } = require("../ml/anomalyModel");
const { findFraudByAny } = require("../utils/fraudCheck");
const fraudEngine = require("../services/fraudEngine");
const FraudAlert = require("../models/FraudAlert");
const fabricClient = require("../fabric/fabricClient");
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
let twilioClient;
try {
  if (accountSid && authToken && twilioPhoneNumber) {
    twilioClient = require("twilio")(accountSid, authToken);
  }
} catch (e) {
  console.log("Twilio not configured, SMS will be skipped");
}

// ---- Constants for transaction processing ----
const HIGH_VALUE_THRESHOLD = 10000;
const DELAY_DURATION_MS = 60 * 60 * 1000; // 1 hour
const TRUST_WINDOW_MS = 60 * 1000; // 1 minute
const BENEFICIARY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const RAPID_SEQUENCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TXNS_IN_WINDOW = 3;
const RAPID_SEQUENCE_AMOUNT_THRESHOLD = 5000;
const SUSPICIOUS_MULTI_ACCOUNT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MAX_UNIQUE_ACCOUNTS = 2;

// ---- Utility: mask account show last 4 digits ----
function maskAccount(acc) {
  if (!acc) return "****";
  const s = acc.toString();
  const last4 = s.slice(-4);
  return "****" + last4;
}

// ---- Ensure phone in E.164 (simple +91 fallback) ----
function formatPhone(phone) {
  if (!phone) return phone;
  if (phone.startsWith("+")) return phone;
  // default to India if 10-digit number
  if (/^\d{10}$/.test(phone)) return "+91" + phone;
  return phone;
}

/**
 * POST /api/txns/send-otp
 * Protected. Sends OTP to user's registered phone (or phone passed in body).
 */
router.post("/send-otp", auth, async (req, res) => {
  try {
    const user = req.user;
    // allow client override phone (if you stored phone separately in AsyncStorage)
    let { phone } = req.body;
    phone = phone || user.phone || user.mobile || user.phoneNumber;

    if (!phone) return res.status(400).json({ error: "No phone number available to send OTP" });

    const formattedPhone = formatPhone(phone);

    // generate 4-digit OTP
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // save OTP record
    await Otp.create({ phone: formattedPhone, code, expiresAt });

    console.log(`\n[OTP] Transaction OTP for ${formattedPhone}: ${code} (expires at ${expiresAt.toLocaleTimeString()})\n`);

    // send via Twilio (skip if not configured)
    if (twilioClient) {
      try {
        await twilioClient.messages.create({
          to: formattedPhone,
          body: `Your GramBank transaction OTP is ${code}. It will expire in 5 minutes.`,
          from: twilioPhoneNumber,
        });
        return res.json({ message: "OTP sent successfully", otp: code });
      } catch (smsErr) {
        console.error("Twilio send error:", smsErr);
      }
    }

    return res.json({ message: "OTP generated (SMS not available)", otp: code });
  } catch (err) {
    console.error("Send txn OTP error:", err);
    res.status(500).json({ error: "Failed to send transaction OTP" });
  }
});

/**
 * POST /api/txns/send
 * Protected. Body: { to_account, ifsc, beneficiary_name, amount, otp, phone(optional) }
 * Verifies OTP then processes transaction.
 * - If amount > 10000: DELAYED (unless trusted receiver)
 * - If amount <= 10000: INSTANT + register as trusted
 */
router.post("/send", auth, async (req, res) => {
  try {
    const user = req.user;

    if (["TEMP_FROZEN", "FROZEN", "UNDER_REVIEW", "SUSPENDED", "BLOCKED"].includes(user.status)) {
      const msgs = {
        TEMP_FROZEN: "Your account has been temporarily frozen due to suspicious activity. Contact your branch.",
        FROZEN: "Your account has been frozen due to fraud reports. Contact your branch.",
        UNDER_REVIEW: "Your account is under review. Please contact support.",
        SUSPENDED: "Your account is suspended. Contact your branch.",
        BLOCKED: "Your account has been permanently blocked."
      };
      return res.status(403).json({
        error: `Account ${user.status}`,
        message: msgs[user.status] || "Account restricted."
      });
    }

    const { to_account, ifsc, beneficiary_name, amount, otp, phone } = req.body;

    if (!to_account || !ifsc || !amount) return res.status(400).json({ error: "Missing transaction details" });
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: "Invalid amount" });

    // Define phoneToCheck early for use throughout function
    const phoneToCheck = formatPhone(phone || user.phoneNumber);

    // ---- Check if receiver is blocked/frozen/suspended or under review ----
    const receiverUser = await User.findOne({ accountNumber: to_account });
    if (!receiverUser) {
      return res.status(404).json({ error: "Recipient account not found" });
    }

    if (receiverUser && receiverUser.status !== "ACTIVE") {
      const hardBlockStatuses = ["FROZEN", "SUSPENDED", "BLOCKED", "TEMP_FROZEN"];

      if (hardBlockStatuses.includes(receiverUser.status)) {
        if (twilioClient) {
          try {
            const msg = `Alert: Transfer to ${maskAccount(to_account)} blocked. Account is ${receiverUser.status}.`;
            await twilioClient.messages.create({ to: phoneToCheck, body: msg, from: twilioPhoneNumber });
          } catch (e) { console.error("Twilio alert error:", e); }
        }

        const receiverStatus = receiverUser.status === "TEMP_FROZEN" ? "TEMP_FROZEN" : receiverUser.status === "FROZEN" ? "UNDER_REVIEW" : "BLACKLISTED";
        return res.json({
          ...fraudEngine.buildDecisionResponse({ decision: "TEMP_FREEZE", riskScore: 100, reasons: [`Receiver account is ${receiverUser.status}`] }, { receiverStatus }),
          message: "Transfer blocked",
          txn_blocked: true,
          is_fraud: true,
          fraud_reason: `Receiver account is ${receiverUser.status === "TEMP_FROZEN" ? "temporarily frozen" : receiverUser.status === "FROZEN" ? "frozen" : receiverUser.status === "BLOCKED" ? "permanently blocked" : "suspended"}`,
        });
      }

      if (receiverUser.status === "UNDER_REVIEW" && !req.body.receiverRiskConfirmed) {
        return res.json({
          requiresConfirmation: true,
          reason: "RECEIVER_UNDER_INVESTIGATION",
          message: "The recipient account has been flagged for unusual or suspicious activity and is currently under investigation."
        });
      }
    }

    // ---- Verify OTP (required only for amount >= 10000) ----
    if (amt >= 10000) {
      if (!otp) return res.status(400).json({ error: "OTP required for transactions >= ₹10,000" });

      const otpRecord = await Otp.findOne({ phone: phoneToCheck }).sort({ createdAt: -1 });
      if (!otpRecord) return res.status(400).json({ error: "No OTP found for this phone" });
      if (otpRecord.expiresAt < new Date()) return res.status(400).json({ error: "OTP expired" });
      if (otpRecord.code !== otp) return res.status(400).json({ error: "Invalid OTP" });
    }

    // ---- Check if receiver is under investigation (TransactionReport) ----
    if (!req.body.receiverRiskConfirmed && receiverUser) {
      const investigation = await TransactionReport.findOne({
        "reported.accountNumber": to_account,
        status: "UNDER_INVESTIGATION"
      });
      if (investigation) {
        return res.json({
          requiresConfirmation: true,
          reason: "RECEIVER_UNDER_INVESTIGATION",
          message: "The recipient account has been flagged for unusual or suspicious activity and is currently under investigation."
        });
      }
    }

    // ---- Fraud Engine risk evaluation ----
    const fraudResult = await fraudEngine.evaluateTransactionRisk(user._id, amt, to_account, null);
    console.log(`[FRAUD_ENGINE] Risk: ${fraudResult.riskScore}, Decision: ${fraudResult.decision}, Reasons: ${fraudResult.reasons.join(", ")}`);

    // ---- TEMP_FREEZE: auto freeze + block transaction ----
    if (fraudResult.decision === "TEMP_FREEZE") {
      await fraudEngine.autoFreezeUser(user._id, `Auto-freeze: ${fraudResult.reasons.join(", ")}`);
      await fraudEngine.createFraudAlert({
        userId: user._id,
        receiverId: null,
        transactionId: null,
        riskScore: fraudResult.riskScore,
        anomalyScore: fraudResult.anomalyScore,
        reasons: fraudResult.reasons,
        riskFactors: fraudResult.riskFactors,
        decision: "TEMP_FREEZE"
      });
      return res.json({
        ...fraudEngine.buildDecisionResponse(fraudResult),
        message: "Transaction blocked due to high risk",
        txn_blocked: true,
        is_fraud: true,
        fraud_reason: `Temporary freeze: ${fraudResult.reasons.join(", ")}`,
      });
    }

    // ---- Check sufficient balance ----
    if (user.balance < amt) return res.status(400).json({ error: "Insufficient balance" });

    // ---- HOLD_FOR_REVIEW: 1-hour protected delay with HOLD_FOR_REVIEW status ----
    if (fraudResult.decision === "HOLD_FOR_REVIEW") {
      const autoProcessAt = new Date(Date.now() + DELAY_DURATION_MS);
      const scheduledTxn = new ScheduledTransaction({
        user_id: user._id,
        txn_id: `SCHED-FRAUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        to_account,
        ifsc,
        beneficiary_name,
        amount: amt,
        balance_before: user.balance,
        balance_after: +(user.balance - amt).toFixed(2),
        type: "DEBIT",
        status: "HOLD_FOR_REVIEW",
        scheduled_at: new Date(),
        auto_process_at: autoProcessAt,
        delay_reason: `Held for fraud review (1 hour): ${fraudResult.reasons.join(", ")}`,
        riskScore: fraudResult.riskScore,
        riskBreakdown: fraudResult.riskFactors,
        fraudDecision: fraudResult.decision
      });
      await scheduledTxn.save();

      // Reserve funds
      user.balance -= amt;
      user.reservedBalance += amt;
      await user.save();

      await fraudEngine.createFraudAlert({
        userId: user._id,
        scheduledTxnId: scheduledTxn._id,
        riskScore: fraudResult.riskScore,
        anomalyScore: fraudResult.anomalyScore,
        reasons: fraudResult.reasons,
        riskFactors: fraudResult.riskFactors,
        decision: "HOLD_FOR_REVIEW"
      });
      return res.json({
        ...fraudEngine.buildDecisionResponse(fraudResult),
        message: "Transaction under fraud review (1-hour protection)",
        is_scheduled: true,
        txn_id: scheduledTxn.txn_id,
        amount: amt,
        beneficiary: beneficiary_name || maskAccount(to_account),
        auto_process_at: autoProcessAt,
        delay_reason: `Fraud review: ${fraudResult.reasons.join(", ")}`,
        popupTitle: "Transaction Under Review",
        userMessage: "Your transaction has been flagged for security review. Funds will be credited after verification (up to 1 hour).",
      });
    }

    // ---- WARNING: require confirmation before proceeding ----
    if (fraudResult.decision === "WARNING" && !req.body.fraudWarningConfirmed) {
      return res.json({
        requiresConfirmation: true,
        reason: "FRAUD_WARNING",
        message: "We detected unusual activity patterns in this transaction. Do you want to proceed?",
        riskScore: fraudResult.riskScore,
        anomalyScore: fraudResult.anomalyScore,
        reasons: fraudResult.reasons,
      });
    }

    // ---- SAFE / WARNING (confirmed): Check trusted beneficiary first ----
    const isTrusted = await checkTrustedReceiver(user._id, to_account);
    if (isTrusted) {
      console.log(`[TXN] Trusted beneficiary - instant: ₹${amt} to ${to_account}`);
      return await processInstantTransaction(user, to_account, ifsc, beneficiary_name, amt, phoneToCheck, res, fraudResult);
    }

    // ---- Not trusted + amount > ₹10,000: 1-hour protected delay ----
    if (amt > HIGH_VALUE_THRESHOLD) {
      const autoProcessAt = new Date(Date.now() + DELAY_DURATION_MS);
      const scheduledTxn = new ScheduledTransaction({
        user_id: user._id,
        txn_id: `SCHED-HV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        to_account,
        ifsc,
        beneficiary_name,
        amount: amt,
        balance_before: user.balance,
        balance_after: +(user.balance - amt).toFixed(2),
        type: "DEBIT",
        status: "PENDING",
        scheduled_at: new Date(),
        auto_process_at: autoProcessAt,
        delay_reason: "High-value transaction protection delay (1 hour)"
      });
      await scheduledTxn.save();

      // Reserve funds
      user.balance -= amt;
      user.reservedBalance += amt;
      await user.save();

      return res.json({
        success: true,
        decision: "HOLD",
        message: "Transaction is under 1-hour security protection",
        is_scheduled: true,
        txn_id: scheduledTxn.txn_id,
        amount: amt,
        beneficiary: beneficiary_name || maskAccount(to_account),
        auto_process_at: autoProcessAt,
        delay_reason: "High-value transaction is under 1-hour security protection. Receiver will be credited after verification period.",
        popupTitle: "Payment Protected",
        userMessage: "Transaction is under 1-hour security protection. Receiver will be credited after verification period."
      });
    }

    // ---- Low value (≤ ₹10,000) or trusted → instant ----
    console.log(`[TXN] Processing instant: ₹${amt} to ${to_account} (${fraudResult.decision})`);
    return await processInstantTransaction(user, to_account, ifsc, beneficiary_name, amt, phoneToCheck, res, fraudResult);

  } catch (err) {
    console.error("/send FAILED:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Helper: Process instant transaction + register trusted receiver
 */
async function processInstantTransaction(user, to_account, ifsc, beneficiary_name, amt, phoneToCheck, res, fraudResult) {

  // ---- STAGE 1: TrustedReceiver upsert ----
  await TrustedReceiver.findOneAndUpdate(
    { user_id: user._id, receiver_account: to_account },
    {
      user_id: user._id,
      receiver_account: to_account,
      trusted_until: new Date(Date.now() + TRUST_WINDOW_MS),
    },
    { upsert: true, new: true },
  );

  // ---- STAGE 2: Build + save debit Transaction ----
  const balance_before = user.balance;
  const balance_after = +(balance_before - amt).toFixed(2);
  const isSuspicious = fraudResult ? fraudResult.riskScore >= 25 : false;
  const isConfirmedFraud = fraudResult ? fraudResult.riskScore >= 90 : false;
  const txnId = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const txn = new Transaction({
    txn_id: txnId, user_id: user._id, to_account, ifsc, beneficiary_name,
    amount: amt, balance_before, balance_after,
    is_fraud: isConfirmedFraud, fraud_reason: isConfirmedFraud ? fraudResult.reasons.join(", ") : null,
    is_suspicious: isSuspicious, suspicious_flags: fraudResult ? fraudResult.reasons : [],
    risk_score: fraudResult ? fraudResult.riskScore : 0, risk_factors: fraudResult ? fraudResult.riskFactors : [], type: 'DEBIT',
  });
  await txn.save();

  // ---- STAGE 3: FraudAlert (WARNING only) ----
  if (fraudResult && fraudResult.decision === "WARNING") {
    await fraudEngine.createFraudAlert({
      userId: user._id, transactionId: txn._id,
      riskScore: fraudResult.riskScore, anomalyScore: fraudResult.anomalyScore,
      reasons: fraudResult.reasons, riskFactors: fraudResult.riskFactors, decision: "WARNING"
    });
  }

  // ---- STAGE 4: User save ----
  user.balance = balance_after;
  user.transactionsCount = (user.transactionsCount || 0) + 1;
  await user.save();

  // ---- STAGE 5: Credit receiver ----
  const receiver = await User.findOne({ accountNumber: to_account });
  if (receiver) {
    if (receiver.status && !["ACTIVE", "TEMP_FROZEN", "UNDER_REVIEW", "FROZEN", "SUSPENDED", "BLOCKED", "CLEARED"].includes(receiver.status)) {
      receiver.status = "ACTIVE";
    }
    const r_before = receiver.balance;
    const r_after = +(receiver.balance + amt).toFixed(2);
    await Transaction.create({
      txn_id: `${txnId}-CREDIT`, user_id: receiver._id, from_account: user.accountNumber,
      to_account: receiver.accountNumber, amount: amt, balance_before: r_before,
      balance_after: r_after, is_fraud: false, type: "CREDIT",
    });
    receiver.balance = r_after;
    receiver.transactionsCount = (receiver.transactionsCount || 0) + 1;
    await receiver.save();
  }

  // ---- STAGE 6: SMS notifications (async, non-blocking) ----
  if (receiver && twilioClient) {
    const rBal = receiver.balance;
    twilioClient.messages.create({
      to: formatPhone(receiver.phoneNumber),
      body: `GramBank: A/c ${maskAccount(receiver.accountNumber)} credited ₹${amt} from ${maskAccount(user.accountNumber)}. Bal ₹${rBal}.`,
      from: twilioPhoneNumber,
    }).catch(e => console.error("Receiver SMS async error:", e));
  }
  if (twilioClient) {
    twilioClient.messages.create({
      to: phoneToCheck,
      body: `GramBank: A/c ${maskAccount(user.accountNumber)} debited ₹${amt} to ${beneficiary_name || maskAccount(to_account)}. Bal ₹${balance_after}.`,
      from: twilioPhoneNumber,
    }).catch(e => console.error("Sender SMS async error:", e));
  }

  // ---- STAGE 7: Blockchain storage ----
  let blockchainResult = { stored: false };
  try {
    blockchainResult = await fabricClient.storeTransactionOnBlockchain({
      txnId: txn.txn_id, senderAccount: user.accountNumber || user._id.toString(),
      receiverAccount: to_account, amount: amt, fraudDecision: fraudResult?.decision || "SAFE"
    });
  } catch (bcErr) {
    console.error(`[FABRIC] Non-blocking storage failed for ${txn.txn_id}:`, bcErr.message);
  }

  const responseData = {
    ...fraudEngine.buildDecisionResponse(fraudResult || { decision: "SAFE", riskScore: 0, reasons: [] }),
    message: "Transaction successful", txn_id: txn.txn_id,
    balance_before, balance_after, blockchainStored: blockchainResult.stored,
  };
  if (fraudResult && fraudResult.decision === "WARNING") {
    responseData.popupTitle = "Payment Alert";
    responseData.userMessage = "This transaction was flagged as unusual. Please verify the recipient details.";
  }
  if (blockchainResult.stored) {
    responseData.blockchainTxnId = blockchainResult.blockchainTxnId;
    responseData.blockchainHash = blockchainResult.blockchainHash;
  }

  return res.json(responseData);
}
/**
 * Helper: Check if receiver is a trusted beneficiary (within 1-min window)
 */
async function checkTrustedReceiver(userId, receiverAccount) {
  if (!receiverAccount) return false;
  const trusted = await TrustedReceiver.findOne({
    user_id: userId,
    receiver_account: receiverAccount,
    trusted_until: { $gt: new Date() }
  });
  return !!trusted;
}

/**
 * POST /api/txns/report/:id
 * Report a scheduled transaction.
 * If report_type is UNAUTHORIZED, WRONG_RECIPIENT, or FRAUD:
 *   - Set status = FAILED, is_reported = true
 * Else:
 *   - Save report only, no effect on transaction
 */
router.post("/report/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { report_type, description } = req.body;

    if (!report_type) return res.status(400).json({ error: "Report type required" });

    const txn = await ScheduledTransaction.findOne({
      _id: id,
      user_id: req.user._id,
    });

    if (!txn) return res.status(404).json({ error: "Transaction not found" });

    // Save report
    const report = await TransactionReport.create({
      transaction_id: id,
      reporter_id: req.user._id,
      report_type,
      description,
    });

    // If blocking report type, block the transaction and refund
    const BLOCKING_TYPES = ["UNAUTHORIZED", "WRONG_RECIPIENT", "FRAUD", "SUSPICIOUS"];
    if (BLOCKING_TYPES.includes(report_type.toUpperCase()) && ["PENDING", "HOLD_FOR_REVIEW"].includes(txn.status)) {
      txn.status = "FRAUD_REPORTED";
      txn.is_reported = true;
      txn.report_reason = report_type;
      txn.processing_locked = true;
      await txn.save();

      // Refund reserved balance — fetch fresh user data
      const senderUser = await User.findById(req.user._id);
      if (senderUser && senderUser.reservedBalance >= txn.amount) {
        senderUser.balance += txn.amount;
        senderUser.reservedBalance -= txn.amount;
        await senderUser.save();
      }

      return res.json({
        message: "Report submitted. Transaction has been cancelled and refunded.",
        report,
        transaction_status: "FRAUD_REPORTED",
        refund: txn.amount,
      });
    }

    res.json({
      message: "Report submitted for review",
      report,
      transaction_status: txn.status,
    });
  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

/**
 * POST /api/txns/admin/approve/:id
 * Admin overrides delay: process PENDING transaction immediately.
 * Flow: PENDING → APPROVED_BY_ADMIN → COMPLETED
 */
router.post("/admin/approve/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const txn = await ScheduledTransaction.findOne({
      _id: id,
      status: { $in: ["PENDING", "HOLD_FOR_REVIEW"] },
      processing_locked: false,
      is_reported: false,
    }).populate("user_id");

    if (!txn) {
      return res.status(404).json({ error: "Transaction not found, already processed, or locked" });
    }

    // Step 1: Mark as APPROVED_BY_ADMIN
    txn.status = "APPROVED_BY_ADMIN";
    txn.processing_locked = true;
    await txn.save();

    // Step 2: Process the transfer
    const sender = txn.user_id;
    if (!sender || sender.reservedBalance < txn.amount) {
      txn.status = "FAILED";
      txn.delay_reason = "Reserved balance insufficient at processing time";
      txn.processed_at = new Date();
      await txn.save();
      // Refund only this transaction's reserved amount
      if (sender && sender.reservedBalance >= txn.amount) {
        sender.balance += txn.amount;
        sender.reservedBalance -= txn.amount;
        await sender.save();
      }
      return res.status(400).json({ error: "Reserved balance insufficient" });
    }

    const balance_before = sender.balance;
    const balance_after = balance_before; // balance already deducted when scheduled
    sender.reservedBalance -= txn.amount;
    sender.transactionsCount = (sender.transactionsCount || 0) + 1;
    await sender.save();

    const txnId = txn.txn_id;
    await Transaction.create({
      txn_id: txnId,
      user_id: sender._id,
      to_account: txn.to_account,
      to_upi: txn.to_upi,
      ifsc: txn.ifsc,
      beneficiary_name: txn.beneficiary_name,
      amount: txn.amount,
      balance_before,
      balance_after,
      type: "DEBIT",
      is_fraud: false,
    });

    // Credit receiver
    const receiver = txn.to_account
      ? await User.findOne({ accountNumber: txn.to_account })
      : txn.to_upi
        ? await User.findOne({ upiId: txn.to_upi })
        : null;
    if (receiver) {
      // Fix receiver status if invalid
      if (receiver.status && !["ACTIVE", "TEMP_FROZEN", "UNDER_REVIEW", "FROZEN", "SUSPENDED", "BLOCKED", "CLEARED"].includes(receiver.status)) {
        receiver.status = "ACTIVE"; // Default to ACTIVE if invalid
      }

      const r_before = receiver.balance;
      const r_after = +(receiver.balance + txn.amount).toFixed(2);

      await Transaction.create({
        txn_id: `${txnId}-CREDIT`,
        user_id: receiver._id,
        from_account: sender.accountNumber,
        to_account: receiver.accountNumber,
        to_upi: receiver.upiId,
        amount: txn.amount,
        balance_before: r_before,
        balance_after: r_after,
        type: "CREDIT",
        is_fraud: false,
      });

      receiver.balance = r_after;
      receiver.transactionsCount = (receiver.transactionsCount || 0) + 1;
      await receiver.save();
    }

    // Finalize: COMPLETED
    txn.status = "COMPLETED";
    txn.processed_at = new Date();
    await txn.save();

    console.log(`[ADMIN] Transaction ${txnId} approved and completed by admin`);

    // Store on Hyperledger Fabric (non-blocking, graceful fallback)
    fabricClient.storeTransactionOnBlockchain({
      txnId: txn.txn_id,
      senderAccount: sender.accountNumber || sender._id.toString(),
      receiverAccount: txn.to_account || txn.to_upi || "unknown",
      amount: txn.amount,
      fraudDecision: "SAFE"
    }).then(bcResult => {
      if (bcResult.stored) {
        console.log(`[FABRIC] Admin-approved txn ${txn.txn_id} stored on blockchain`);
      }
    }).catch(err => {
      console.error(`[FABRIC] Non-blocking storage failed for admin-approved ${txn.txn_id}:`, err.message);
    });

    res.json({
      message: "Transaction approved and processed successfully",
      transaction: {
        txn_id: txn.txn_id,
        amount: txn.amount,
        status: txn.status,
        processed_at: txn.processed_at,
      },
    });
  } catch (err) {
    console.error("Admin approve error:", err);
    res.status(500).json({ error: "Approval failed" });
  }
});

/**
 * POST /api/txns/upi/send
 * Body: { upiId, amount, otp, phone(optional) }
 */
/**
 * POST /api/txns/upi/send
 * UPI payment with strict delay rule.
 * - If amount > 10000: DELAYED (unless trusted receiver)
 * - If amount <= 10000: INSTANT + register as trusted
 */
router.post("/upi/send", auth, async (req, res) => {
  try {
    const user = req.user;

    if (["TEMP_FROZEN", "FROZEN", "UNDER_REVIEW", "SUSPENDED", "BLOCKED"].includes(user.status)) {
      const msgs = {
        TEMP_FROZEN: "Your account has been temporarily frozen due to suspicious activity. Contact your branch.",
        FROZEN: "Your account has been frozen due to fraud reports. Contact your branch.",
        UNDER_REVIEW: "Your account is under review. Please contact support.",
        SUSPENDED: "Your account is suspended. Contact your branch.",
        BLOCKED: "Your account has been permanently blocked."
      };
      return res.status(403).json({
        error: `Account ${user.status}`,
        message: msgs[user.status] || "Account restricted."
      });
    }

    const { upiId, amount, otp, phone } = req.body;

    if (!upiId || !amount) return res.status(400).json({ error: "UPI ID & Amount required" });

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "Invalid amount" });

    // Define phoneToCheck early for use throughout function
    const phoneToCheck = formatPhone(phone || user.phoneNumber);

    // ---------- FIND RECEIVER ----------
    const receiver = await User.findOne({ upiId });
    if (!receiver) {
      console.warn(`[UPI] Receiver not found in GramBank: ${upiId}`);
      return res.status(404).json({
        success: false,
        error: "Receiver not found",
        upiId,
      });
    }

    if (receiver.status !== "ACTIVE") {
      const hardBlockStatuses = ["FROZEN", "SUSPENDED", "BLOCKED", "TEMP_FROZEN"];

      if (hardBlockStatuses.includes(receiver.status)) {
        if (twilioClient) {
          try {
            const msg = `Alert: UPI payment to ${upiId} blocked. Account is ${receiver.status}.`;
            await twilioClient.messages.create({ to: phoneToCheck, body: msg, from: twilioPhoneNumber });
          } catch (e) { console.error("Twilio alert error:", e); }
        }

        const upiReceiverStatus = receiver.status === "TEMP_FROZEN" ? "TEMP_FROZEN" : receiver.status === "FROZEN" ? "UNDER_REVIEW" : "BLACKLISTED";
        return res.json({
          ...fraudEngine.buildDecisionResponse({ decision: "TEMP_FREEZE", riskScore: 100, reasons: [`Receiver account is ${receiver.status}`] }, { receiverStatus: upiReceiverStatus }),
          message: "UPI payment blocked",
          txn_blocked: true,
          is_fraud: true,
          fraud_reason: `Receiver account is ${receiver.status === "TEMP_FROZEN" ? "temporarily frozen" : receiver.status === "FROZEN" ? "frozen" : receiver.status === "BLOCKED" ? "permanently blocked" : "suspended"}`,
        });
      }

      if (receiver.status === "UNDER_REVIEW" && !req.body.receiverRiskConfirmed) {
        return res.json({
          requiresConfirmation: true,
          reason: "RECEIVER_UNDER_INVESTIGATION",
          message: "The recipient account has been flagged for unusual or suspicious activity and is currently under investigation."
        });
      }
    }

    // ---- Check if receiver is under investigation (TransactionReport) ----
    if (!req.body.receiverRiskConfirmed) {
      const investigation = await TransactionReport.findOne({
        "reported.accountNumber": receiver.accountNumber,
        status: "UNDER_INVESTIGATION"
      });
      if (investigation) {
        return res.json({
          requiresConfirmation: true,
          reason: "RECEIVER_UNDER_INVESTIGATION",
          message: "The recipient account has been flagged for unusual or suspicious activity and is currently under investigation."
        });
      }
    }

    const receiverAccount = receiver.accountNumber;

    if (amt >= HIGH_VALUE_THRESHOLD) {
      if (!otp) return res.status(400).json({ error: "OTP required for transactions >= ₹10,000" });

      const otpRecord = await Otp.findOne({ phone: phoneToCheck }).sort({ createdAt: -1 });
      if (!otpRecord) return res.status(400).json({ error: "No OTP found for this phone" });
      if (otpRecord.expiresAt < new Date()) return res.status(400).json({ error: "OTP expired" });
      if (otpRecord.code !== otp) return res.status(400).json({ error: "Invalid OTP" });
    }

    // ---- Fraud Engine risk evaluation ----
    const fraudResult = await fraudEngine.evaluateTransactionRisk(user._id, amt, receiverAccount, upiId);
    console.log(`[FRAUD_ENGINE][UPI] Risk: ${fraudResult.riskScore}, Decision: ${fraudResult.decision}, Reasons: ${fraudResult.reasons.join(", ")}`);

    // ---- TEMP_FREEZE: auto freeze + block transaction ----
    if (fraudResult.decision === "TEMP_FREEZE") {
      await fraudEngine.autoFreezeUser(user._id, `Auto-freeze: ${fraudResult.reasons.join(", ")}`);
      await fraudEngine.createFraudAlert({
        userId: user._id,
        receiverId: receiver ? receiver._id : null,
        riskScore: fraudResult.riskScore,
        anomalyScore: fraudResult.anomalyScore,
        reasons: fraudResult.reasons,
        riskFactors: fraudResult.riskFactors,
        decision: "TEMP_FREEZE"
      });
      return res.json({
        ...fraudEngine.buildDecisionResponse(fraudResult),
        message: "UPI transaction blocked due to high risk",
        txn_blocked: true,
        is_fraud: true,
        fraud_reason: `Temporary freeze: ${fraudResult.reasons.join(", ")}`,
      });
    }

    // ---------- BALANCE CHECK ----------
    if (user.balance < amt) return res.status(400).json({ error: "Insufficient balance" });

    // ---- HOLD_FOR_REVIEW: 1-hour protected delay with HOLD_FOR_REVIEW status ----
    if (fraudResult.decision === "HOLD_FOR_REVIEW") {
      const autoProcessAt = new Date(Date.now() + DELAY_DURATION_MS);
      const scheduledTxn = new ScheduledTransaction({
        user_id: user._id,
        txn_id: `UPI-SCHED-FRAUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        to_upi: upiId,
        beneficiary_name: receiver ? receiver.name : null,
        amount: amt,
        balance_before: user.balance,
        balance_after: +(user.balance - amt).toFixed(2),
        type: "DEBIT",
        status: "HOLD_FOR_REVIEW",
        scheduled_at: new Date(),
        auto_process_at: autoProcessAt,
        delay_reason: `Held for fraud review (1 hour): ${fraudResult.reasons.join(", ")}`,
        riskScore: fraudResult.riskScore,
        riskBreakdown: fraudResult.riskFactors,
        fraudDecision: fraudResult.decision
      });
      await scheduledTxn.save();

      // Reserve funds
      user.balance -= amt;
      user.reservedBalance += amt;
      await user.save();

      await fraudEngine.createFraudAlert({
        userId: user._id,
        receiverId: receiver ? receiver._id : null,
        scheduledTxnId: scheduledTxn._id,
        riskScore: fraudResult.riskScore,
        anomalyScore: fraudResult.anomalyScore,
        reasons: fraudResult.reasons,
        riskFactors: fraudResult.riskFactors,
        decision: "HOLD_FOR_REVIEW"
      });
      return res.json({
        ...fraudEngine.buildDecisionResponse(fraudResult),
        message: "UPI transaction under fraud review (1-hour protection)",
        is_scheduled: true,
        txn_id: scheduledTxn.txn_id,
        amount: amt,
        receiver: upiId,
        auto_process_at: autoProcessAt,
        delay_reason: `Fraud review: ${fraudResult.reasons.join(", ")}`,
      });
    }

    // ---- WARNING: require confirmation before proceeding ----
    if (fraudResult.decision === "WARNING" && !req.body.fraudWarningConfirmed) {
      return res.json({
        requiresConfirmation: true,
        reason: "FRAUD_WARNING",
        message: "We detected unusual activity patterns in this transaction. Do you want to proceed?",
        riskScore: fraudResult.riskScore,
        anomalyScore: fraudResult.anomalyScore,
        reasons: fraudResult.reasons,
      });
    }

    // ---- SAFE / WARNING (confirmed): Check trusted beneficiary first ----
    const receiverAccountForTrust = receiver ? receiver.accountNumber : upiId;
    const isTrustedUpi = await checkTrustedReceiver(user._id, receiverAccountForTrust);
    if (isTrustedUpi) {
      console.log(`[UPI] Trusted beneficiary - instant: ₹${amt} to ${upiId}`);
      return await processInstantUPI(user, receiver, upiId, amt, phoneToCheck, res, fraudResult);
    }

    // ---- Not trusted + amount > ₹10,000: 1-hour protected delay ----
    if (amt > HIGH_VALUE_THRESHOLD) {
      const autoProcessAt = new Date(Date.now() + DELAY_DURATION_MS);
      const scheduledTxn = new ScheduledTransaction({
        user_id: user._id,
        txn_id: `UPI-HV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        to_upi: upiId,
        beneficiary_name: receiver ? receiver.name : null,
        amount: amt,
        balance_before: user.balance,
        balance_after: +(user.balance - amt).toFixed(2),
        type: "DEBIT",
        status: "PENDING",
        scheduled_at: new Date(),
        auto_process_at: autoProcessAt,
        delay_reason: "High-value UPI protection delay (1 hour)"
      });
      await scheduledTxn.save();

      // Reserve funds
      user.balance -= amt;
      user.reservedBalance += amt;
      await user.save();

      return res.json({
        success: true,
        decision: "HOLD",
        message: "UPI transaction is under 1-hour security protection",
        is_scheduled: true,
        txn_id: scheduledTxn.txn_id,
        amount: amt,
        receiver: upiId,
        auto_process_at: autoProcessAt,
        delay_reason: "High-value UPI transaction is under 1-hour security protection.",
        popupTitle: "Payment Protected",
        userMessage: "Transaction is under 1-hour security protection. Receiver will be credited after verification period."
      });
    }

    // ---- Low value (≤ ₹10,000) or trusted → instant ----
    console.log(`[UPI] Processing instant: ₹${amt} to ${upiId} (${fraudResult.decision})`);
    return await processInstantUPI(user, receiver, upiId, amt, phoneToCheck, res, fraudResult);

  } catch (err) {
    console.error("UPI send error:", err);
    if (err.code === "UPI_COMPENSATION_FAILED") {
      return res.status(503).json({
        success: false,
        code: err.code,
        error: err.message,
      });
    }
    res.status(err.status || 500).json({
      success: false,
      error: err.status ? err.message : "Server error",
    });
  }
});

/**
 * Helper: Process instant UPI transaction + register trusted receiver
 */
async function processInstantUPI(user, receiver, upiId, amt, phoneToCheck, res, fraudResult) {
  let stage = "initialization";
  let session;
  try {
    console.log("========================================");
    console.log("[UPI] INSTANT PAYMENT START");
    const senderAccount = user.accountNumber
      ? `****${String(user.accountNumber).slice(-4)}`
      : String(user._id);
    console.log("[UPI] Sender account:", senderAccount);
    console.log("[UPI] Receiver UPI:", upiId);
    if (!receiver) {
      console.warn("[UPI] Receiver not found; no transaction was created.");
      return res.status(404).json({ success: false, error: "Receiver not found", upiId });
    }
    console.log("[UPI] Receiver GramBank account:", maskAccount(receiver.accountNumber));
    console.log("[UPI] Amount:", amt);
    console.log("[UPI] Sender balance BEFORE:", user.balance);

    if (Number(user.balance) < Number(amt)) {
      console.log("[UPI] Insufficient sender balance; no debit transaction created.");
      return res.status(400).json({
        success: false,
        error: "Insufficient balance",
        balance: user.balance,
        amount: amt,
      });
    }

    const receiverAccount = receiver.accountNumber;

    // Keep the trust window behavior, but do not let a trust-record failure
    // happen after the financial records have committed.
    stage = "trusted receiver registration";
    await TrustedReceiver.findOneAndUpdate(
      { user_id: user._id, receiver_account: receiverAccount },
      {
        user_id: user._id,
        receiver_account: receiverAccount,
        trusted_until: new Date(Date.now() + TRUST_WINDOW_MS),
      },
      { upsert: true, new: true },
    );

    const isSuspicious = fraudResult ? fraudResult.riskScore >= 25 : false;
    const isConfirmedFraud = fraudResult ? fraudResult.riskScore >= 90 : false;
    const txnId = `UPI-${Date.now()}-${uuidv4()}`;
    let balance_before;
    let balance_after;
    let receiver_balance_before;
    let receiver_balance_after;

    stage = "checking MongoDB transaction support";
    const topology = await User.db.db.admin().command({ hello: 1 });
    const supportsTransactions = Boolean(topology.setName || topology.msg === "isdbgrid");

    if (supportsTransactions) {
      session = await User.startSession();
      await session.withTransaction(async () => {
      stage = "loading accounts";
      const sender = await User.findById(user._id).session(session);
      const currentReceiver = await User.findById(receiver._id).session(session);
      if (!sender) throw new Error("Sender account no longer exists");
      if (!currentReceiver || currentReceiver.upiId !== upiId) {
        const error = new Error("Receiver account no longer exists");
        error.status = 404;
        throw error;
      }

      balance_before = Number(sender.balance);
      receiver_balance_before = Number(currentReceiver.balance);
      if (balance_before < Number(amt)) {
        const error = new Error("Insufficient balance");
        error.status = 400;
        error.balance = balance_before;
        throw error;
      }

      balance_after = Number((balance_before - Number(amt)).toFixed(2));
      receiver_balance_after = Number((receiver_balance_before + Number(amt)).toFixed(2));
      console.log("[UPI] Sender balance calculated AFTER:", balance_after);
      console.log("[UPI] Receiver balance BEFORE:", receiver_balance_before);
      console.log("[UPI] Receiver balance calculated AFTER:", receiver_balance_after);

      stage = "debit transaction creation";
      console.log("[UPI] Creating DEBIT transaction:", txnId);
      const debitTxn = new Transaction({
        txn_id: txnId,
        user_id: sender._id,
        to_upi: upiId,
        beneficiary_name: currentReceiver.name,
        amount: Number(amt),
        balance_before,
        balance_after,
        is_fraud: isConfirmedFraud,
        fraud_reason: isConfirmedFraud ? fraudResult.reasons.join(", ") : null,
        is_suspicious: isSuspicious,
        suspicious_flags: fraudResult ? fraudResult.reasons : [],
        risk_score: fraudResult ? fraudResult.riskScore : 0,
        risk_factors: fraudResult ? fraudResult.riskFactors : [],
        type: "DEBIT",
      });
      await debitTxn.save({ session });
      console.log("[UPI] DEBIT transaction created:", debitTxn.txn_id);

      stage = "sender balance save";
      sender.balance = balance_after;
      sender.transactionsCount = Number(sender.transactionsCount || 0) + 1;
      await sender.save({ session });
      console.log("[UPI] Sender balance SAVED:", sender.balance);

      const creditTxnId = `${txnId}-CREDIT`;
      stage = "receiver credit transaction creation";
      console.log("[UPI] Creating CREDIT transaction:", creditTxnId);
      const creditTxn = new Transaction({
        txn_id: creditTxnId,
        user_id: currentReceiver._id,
        from_account: sender.accountNumber,
        to_upi: currentReceiver.upiId,
        amount: Number(amt),
        balance_before: receiver_balance_before,
        balance_after: receiver_balance_after,
        is_fraud: false,
        type: "CREDIT",
      });
      await creditTxn.save({ session });
      console.log("[UPI] CREDIT transaction created:", creditTxn.txn_id);

      stage = "receiver balance save";
      currentReceiver.balance = receiver_balance_after;
      currentReceiver.transactionsCount = Number(currentReceiver.transactionsCount || 0) + 1;
      await currentReceiver.save({ session });
      console.log("[UPI] Receiver balance SAVED:", currentReceiver.balance);
      });
      console.log("[UPI] MongoDB transfer transaction committed:", txnId);
    } else {
      console.warn("[UPI] Standalone MongoDB detected; using guarded writes with compensating rollback.");
      stage = "standalone transfer";
      const balances = await processStandaloneUPITransfer({
        user,
        receiver,
        upiId,
        amount: Number(amt),
        txnId,
        fraudResult,
        isSuspicious,
        isConfirmedFraud,
      });
      balance_before = balances.balance_before;
      balance_after = balances.balance_after;
      receiver_balance_before = balances.receiver_balance_before;
      receiver_balance_after = balances.receiver_balance_after;
      console.log("[UPI] Standalone transfer writes completed:", txnId);
    }

    if (fraudResult && fraudResult.decision === "WARNING") {
      try {
        await fraudEngine.createFraudAlert({
          userId: user._id,
          receiverId: receiver._id,
          transactionId: null,
          riskScore: fraudResult.riskScore,
          anomalyScore: fraudResult.anomalyScore,
          reasons: fraudResult.reasons,
          riskFactors: fraudResult.riskFactors,
          decision: "WARNING"
        });
      } catch (alertError) {
        console.error(`[FRAUD_ENGINE][UPI] Warning alert creation failed for ${txnId}:`, alertError);
      }
    }

    if (twilioClient) {
      twilioClient.messages.create({
        to: phoneToCheck,
        body: `GramBank: ₹${amt} debited via UPI to ${upiId}. Bal ₹${balance_after}.`,
        from: twilioPhoneNumber,
      }).catch(e => console.error("SMS async error:", e));
    }

    // Keep the existing Hyperledger call and disabled-network behavior.
    stage = "blockchain storage";
    let blockchainResult = { stored: false };
    try {
      blockchainResult = await fabricClient.storeTransactionOnBlockchain({
        txnId,
        senderAccount: user.accountNumber || user._id.toString(),
        receiverAccount,
        amount: Number(amt),
        fraudDecision: fraudResult?.decision || "SAFE"
      });
    } catch (bcErr) {
      console.error(`[FABRIC] Non-blocking storage failed for ${txnId}:`, bcErr.message);
    }

    const responseData = {
      ...fraudEngine.buildDecisionResponse(fraudResult || { decision: "SAFE", riskScore: 0, reasons: [] }),
      success: true,
      decision: fraudResult?.decision || "SAFE",
      message: "UPI Transaction Successful",
      txn_id: txnId,
      amount: Number(amt),
      receiver: upiId,
      balance_before,
      balance_after,
      blockchainStored: blockchainResult.stored,
    };

    if (blockchainResult.stored) {
      responseData.blockchainTxnId = blockchainResult.blockchainTxnId;
      responseData.blockchainHash = blockchainResult.blockchainHash;
    }

    console.log("[UPI] PAYMENT SUCCESS");
    console.log("[UPI] Transaction:", txnId);
    console.log("[UPI] Final sender balance:", balance_after);
    console.log("[UPI] Blockchain stored:", blockchainResult.stored);
    console.log("========================================");
    return res.json(responseData);
  } catch (err) {
    console.error("========================================");
    console.error("[UPI] INSTANT PAYMENT FAILED at stage:", stage);
    console.error("[UPI] Receiver UPI:", upiId);
    console.error("[UPI] Amount:", amt);
    console.error("[UPI] Error:", err);
    console.error("[UPI] Message:", err.message);
    console.error("========================================");
    if (!res.headersSent && err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        ...(err.balance !== undefined ? { balance: err.balance, amount: Number(amt) } : {}),
      });
    }
    throw err;
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (sessionError) {
        console.error("[UPI] Failed to close MongoDB session:", sessionError);
      }
    }
  }
}

async function processStandaloneUPITransfer({
  user,
  receiver,
  upiId,
  amount,
  txnId,
  fraudResult,
  isSuspicious,
  isConfirmedFraud,
}) {
  const creditTxnId = `${txnId}-CREDIT`;
  let senderDebited = false;
  let receiverCredited = false;
  let debitLedgerCreated = false;
  let creditLedgerCreated = false;
  let ledgerWriteStarted = false;
  let stage = "sender debit";
  let balance_before;
  let balance_after;
  let receiver_balance_before;
  let receiver_balance_after;

  try {
    const sender = await User.findOneAndUpdate(
      { _id: user._id, balance: { $gte: amount } },
      { $inc: { balance: -amount, transactionsCount: 1 } },
      { new: true },
    );

    if (!sender) {
      const currentSender = await User.findById(user._id).select("balance");
      if (!currentSender) {
        const error = new Error("Sender account no longer exists");
        error.status = 404;
        throw error;
      }
      const error = new Error("Insufficient balance");
      error.status = 400;
      error.balance = currentSender.balance;
      throw error;
    }

    senderDebited = true;
    balance_after = Number(sender.balance);
    balance_before = Number((balance_after + amount).toFixed(2));
    console.log("[UPI] Standalone sender balance debited:", balance_after);

    stage = "receiver credit";
    const creditedReceiver = await User.findOneAndUpdate(
      { _id: receiver._id, upiId },
      { $inc: { balance: amount, transactionsCount: 1 } },
      { new: true },
    );
    if (!creditedReceiver) {
      const error = new Error("Receiver account no longer exists");
      error.status = 404;
      throw error;
    }

    receiverCredited = true;
    receiver_balance_after = Number(creditedReceiver.balance);
    receiver_balance_before = Number((receiver_balance_after - amount).toFixed(2));
    console.log("[UPI] Standalone receiver balance credited:", receiver_balance_after);

    stage = "debit ledger record";
    const debitTxn = new Transaction({
      txn_id: txnId,
      user_id: user._id,
      to_upi: upiId,
      beneficiary_name: receiver.name,
      amount,
      balance_before,
      balance_after,
      is_fraud: isConfirmedFraud,
      fraud_reason: isConfirmedFraud ? fraudResult.reasons.join(", ") : null,
      is_suspicious: isSuspicious,
      suspicious_flags: fraudResult ? fraudResult.reasons : [],
      risk_score: fraudResult ? fraudResult.riskScore : 0,
      risk_factors: fraudResult ? fraudResult.riskFactors : [],
      type: "DEBIT",
    });
    ledgerWriteStarted = true;
    await debitTxn.save();
    debitLedgerCreated = true;

    stage = "credit ledger record";
    const creditTxn = new Transaction({
      txn_id: creditTxnId,
      user_id: receiver._id,
      from_account: user.accountNumber,
      to_upi: receiver.upiId,
      amount,
      balance_before: receiver_balance_before,
      balance_after: receiver_balance_after,
      is_fraud: false,
      type: "CREDIT",
    });
    await creditTxn.save();
    creditLedgerCreated = true;

    console.log("[UPI] Standalone debit and credit ledger records saved:", txnId);
    return {
      balance_before,
      balance_after,
      receiver_balance_before,
      receiver_balance_after,
    };
  } catch (error) {
    console.error(`[UPI] Standalone transfer failed at stage: ${stage}`, error);

    const compensation = [];
    if (ledgerWriteStarted || debitLedgerCreated || creditLedgerCreated) {
      compensation.push(Transaction.deleteMany({
        txn_id: { $in: [txnId, creditTxnId] },
      }));
    }
    if (receiverCredited) {
      compensation.push(User.updateOne(
        { _id: receiver._id },
        { $inc: { balance: -amount, transactionsCount: -1 } },
      ));
    }
    if (senderDebited) {
      compensation.push(User.updateOne(
        { _id: user._id },
        { $inc: { balance: amount, transactionsCount: -1 } },
      ));
    }

    const compensationResults = await Promise.allSettled(compensation);
    const compensationErrors = compensationResults
      .filter(result => result.status === "rejected")
      .map(result => result.reason);

    if (compensationErrors.length > 0) {
      console.error("[UPI] CRITICAL: Standalone transfer compensation failed; manual reconciliation is required.", compensationErrors);
      const compensationError = new Error(
        "The transfer could not be completed and automatic rollback was incomplete. Stop retrying and contact support for balance reconciliation.",
      );
      compensationError.code = "UPI_COMPENSATION_FAILED";
      throw compensationError;
    }

    console.warn("[UPI] Standalone transfer was rolled back after failure:", txnId);
    throw error;
  }
}


/* History, alerts, seed-fraud, balance, report routes — leave as before (no changes) */
/* You already had these; re-add them unchanged below or keep existing ones in file. */

router.get("/history", auth, async (req, res) => {
  try {
    const user = req.user;

    const [txns, scheduledTxns] = await Promise.all([
      Transaction.find({ user_id: user._id }),
      ScheduledTransaction.find({ user_id: user._id })
    ]);

    // Collect unique account numbers and UPI IDs
    const accountNumbers = new Set();
    const upiIds = new Set();
    txns.forEach(t => {
      if (t.type === "CREDIT" && t.from_account) accountNumbers.add(t.from_account);
      if (t.type === "DEBIT") {
        if (t.to_account) accountNumbers.add(t.to_account);
        if (t.to_upi) upiIds.add(t.to_upi);
      }
    });

    const usersByAccount = {};
    const usersByUpi = {};
    const queries = [];

    if (accountNumbers.size > 0) {
      queries.push(
        User.find({ accountNumber: { $in: [...accountNumbers] } }, "accountNumber name phoneNumber").then(users => {
          users.forEach(u => { usersByAccount[u.accountNumber.toLowerCase()] = { name: u.name, phone: u.phoneNumber }; });
        })
      );
    }

    if (upiIds.size > 0) {
      queries.push(
        User.find({}, "upiId name phoneNumber").then(users => {
          users.forEach(u => {
            if (u.upiId) usersByUpi[u.upiId.toLowerCase()] = { name: u.name, phone: u.phoneNumber };
          });
        })
      );
    }

    await Promise.all(queries);

    const formattedTxns = txns.map(t => {
      const obj = t.toObject();
      if (t.type === "CREDIT" && t.from_account && usersByAccount[t.from_account.toLowerCase()]) {
        obj.from_name = usersByAccount[t.from_account.toLowerCase()].name;
        obj.from_phone = usersByAccount[t.from_account.toLowerCase()].phone;
      }
      if (t.type === "DEBIT") {
        let userMatch = null;
        if (t.to_account && usersByAccount[t.to_account.toLowerCase()]) {
          userMatch = usersByAccount[t.to_account.toLowerCase()];
        } else if (t.to_upi && usersByUpi[t.to_upi.toLowerCase()]) {
          userMatch = usersByUpi[t.to_upi.toLowerCase()];
        }
        if (userMatch) {
          obj.to_name = userMatch.name;
          obj.to_phone = userMatch.phone;
          if (!obj.beneficiary_name) obj.beneficiary_name = userMatch.name;
        }
      }
      obj.txn_type = "transaction";
      return obj;
    });

    const pendingScheduled = scheduledTxns.filter(t =>
      ["PENDING", "HOLD_FOR_REVIEW", "APPROVED_BY_ADMIN", "PROCESSING", "COMPLETED", "CANCELLED", "REJECTED", "FAILED", "FRAUD_REPORTED", "REFUNDED"].includes(t.status)
    );

    const formattedScheduled = pendingScheduled.map(t => ({
      ...t.toObject(),
      txn_type: "scheduled",
      is_scheduled: true,
    }));

    const combined = [...formattedTxns, ...formattedScheduled]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 200);

    res.json(combined);

  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/alerts", auth, async (req, res) => {
  try {
    const user = req.user;
    const alerts = await Transaction.find({ user_id: user._id, is_fraud: true }).sort({ createdAt: -1 });
    res.json(alerts);
  } catch (err) {
    console.error("Alerts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/seed-fraud", auth, async (req, res) => {
  try {
    const user = req.user;
    const seeds = [];
    const nowBal = user.balance || 5000;
    let currentBal = nowBal;

    for (let i = 0; i < 10; i++) {
      const type = i % 3;
      let amount, location_delta_km, is_foreign_device, reason;
      if (type === 0) {
        amount = Math.floor(currentBal * (0.85 + Math.random() * 0.1));
        location_delta_km = Math.floor(Math.random() * 5);
        is_foreign_device = 0;
        reason = "Large txn relative to balance";
      } else if (type === 1) {
        amount = Math.floor(500 + Math.random() * 1500);
        location_delta_km = 150 + Math.floor(Math.random() * 500);
        is_foreign_device = 0;
        reason = "Location jump";
      } else {
        amount = Math.floor(300 + Math.random() * 2000);
        location_delta_km = Math.floor(Math.random() * 30);
        is_foreign_device = 1;
        reason = "Foreign device";
      }

      if (amount > currentBal) amount = Math.floor(currentBal * 0.9);
      const balance_before = currentBal;
      const balance_after = +(currentBal - amount).toFixed(2);
      currentBal = balance_after;

      const txn = new Transaction({
        txn_id: `SEED-${Date.now()}-${i}`,
        user_id: user._id,
        to_account: `BEN${Math.floor(Math.random() * 10000)}`,
        ifsc: "SEED0000",
        beneficiary_name: "Seed Beneficiary",
        amount,
        balance_before,
        balance_after,
        hour: new Date().getHours(),
        day: new Date().getDay(),
        txns_last_24h: 20,
        avg_amount_7d: 2000,
        location_delta_km,
        is_foreign_device,
        is_fraud: true,
        fraud_reason: reason
      });
      seeds.push(txn);
    }

    await Transaction.insertMany(seeds);
    user.balance = currentBal;
    user.transactionsCount = (user.transactionsCount || 0) + seeds.length;
    await user.save();

    res.json({ message: `Seeded ${seeds.length} suspicious transactions`, currentBalance: user.balance });
  } catch (err) {
    console.error("Seed fraud error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/balance", auth, async (req, res) => {
  try {
    const user = req.user;

    const recentTxns = await Transaction.find({ user_id: user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    let accountStatus = user.status;
    let statusReason = "";
    let restrictionLevel = "none";

    const investigation = await TransactionReport.findOne({
      "reported.accountNumber": user.accountNumber,
      status: "UNDER_INVESTIGATION"
    });

    if (investigation) {
      accountStatus = "UNDER_INVESTIGATION";
      statusReason = "Suspicious activity is under review. Transactions may require additional verification.";
      restrictionLevel = "monitoring";
    } else {
      switch (user.status) {
        case "ACTIVE":
        case "CLEARED":
          statusReason = "Your account is operating normally.";
          restrictionLevel = "none";
          break;
        case "UNDER_REVIEW":
          statusReason = "Your account is being monitored. Some transactions may be delayed.";
          restrictionLevel = "monitoring";
          break;
        case "TEMP_FROZEN":
          statusReason = user.accountStatus?.frozenReason || "Transactions are temporarily blocked due to suspicious activity.";
          restrictionLevel = "frozen";
          break;
        case "FROZEN":
          statusReason = user.accountStatus?.frozenReason || "Account frozen due to fraud investigation. Contact support.";
          restrictionLevel = "blocked";
          break;
        case "SUSPENDED":
          statusReason = user.accountStatus?.suspensionReason || "Account suspended. Contact support.";
          restrictionLevel = "blocked";
          break;
        case "BLOCKED":
          statusReason = user.accountStatus?.blockingReason || "Account permanently blocked. Contact support.";
          restrictionLevel = "blocked";
          break;
        default:
          statusReason = "Your account is operating normally.";
          restrictionLevel = "none";
      }
    }

    res.json({
      name: user.name,
      aadhaarNumber: user.aadhaarNumber,
      balance: user.balance,
      upiId: user.upiId,
      upiQR: user.upiQR,
      accountStatus,
      statusReason,
      restrictionLevel,
      recent: recentTxns.map((txn) => ({
        txn_id: txn.txn_id,
        amount: txn.amount,
        type: txn.type,
        createdAt: txn.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch balance data" });
  }
});


router.post("/report", auth, async (req, res) => {
  try {
    const { accountNumber, phoneNumber, upiId, name, reason, fraudType, riskLevel } = req.body;
    if (!accountNumber && !phoneNumber && !upiId) {
      return res.status(400).json({ error: "At least one of accountNumber, phoneNumber, or upiId required" });
    }

    const existing = await findFraudByAny(accountNumber || phoneNumber || upiId);
    if (existing) return res.json({ message: "Account already reported", fraud: existing });

    const reportData = {
      name: name || "Unknown",
      accountNumber: accountNumber || undefined,
      phoneNumber: phoneNumber || undefined,
      upiId: upiId || undefined,
      ifsc: req.body.ifsc || undefined,
      reason: reason || "User reported fraudulent activity",
      fraudType: fraudType || "OTHER",
      riskLevel: riskLevel || "MEDIUM",
      reportedBy: req.user?.name || req.user?._id?.toString() || "User",
    };

    const report = await FraudAccount.create(reportData);
    res.json({ message: "Fraudulent account reported successfully", fraud: report });
  } catch (err) {
    console.error("Fraud report error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/txns/scheduled
 * Get user's scheduled transactions (all statuses)
 */
router.get("/scheduled", auth, async (req, res) => {
  try {
    const user = req.user;
    const scheduledTxns = await ScheduledTransaction.find({
      user_id: user._id,
      status: { $in: ['PENDING', 'HOLD_FOR_REVIEW', 'APPROVED_BY_ADMIN', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'REJECTED', 'FAILED', 'FRAUD_REPORTED', 'REFUNDED'] }
    }).sort({ createdAt: -1 });

    res.json({
      count: scheduledTxns.length,
      transactions: scheduledTxns.map(t => ({
        id: t._id,
        txn_id: t.txn_id,
        amount: t.amount,
        to_account: maskAccount(t.to_account),
        to_upi: t.to_upi,
        beneficiary_name: t.beneficiary_name,
        scheduled_at: t.scheduled_at,
        auto_process_at: t.auto_process_at,
        processed_at: t.processed_at,
        delay_reason: t.delay_reason,
        status: t.status,
        is_reported: t.is_reported,
        report_reason: t.report_reason,
        createdAt: t.createdAt
      }))
    });
  } catch (err) {
    console.error("Scheduled txns error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * DELETE /api/txns/scheduled/:txnId
 * Cancel a pending scheduled transaction
 */
router.delete("/scheduled/:txnId", auth, async (req, res) => {
  try {
    const user = req.user;
    const { txnId } = req.params;

    const scheduledTxn = await ScheduledTransaction.findOne({
      txn_id: txnId,
      user_id: user._id,
      status: { $in: ['PENDING', 'HOLD_FOR_REVIEW'] }
    });

    if (!scheduledTxn) {
      return res.status(404).json({ error: "Scheduled transaction not found or already processed" });
    }

    if (new Date() >= scheduledTxn.auto_process_at) {
      return res.status(400).json({ error: "Cannot cancel - transaction is being processed" });
    }

    scheduledTxn.status = 'CANCELLED';
    await scheduledTxn.save();

    // Refund reserved balance
    user.balance += scheduledTxn.amount;
    user.reservedBalance -= scheduledTxn.amount;
    await user.save();

    res.json({
      message: "Transaction cancelled successfully",
      txn_id: scheduledTxn.txn_id,
      refund: scheduledTxn.amount
    });
  } catch (err) {
    console.error("Cancel scheduled txn error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/txns/process-scheduled
 * Background job: processes scheduled transactions where:
 *   status = "PENDING" AND current_time >= auto_process_at
 */
router.post("/process-scheduled", async (req, res) => {
  try {
    const now = new Date();
    console.log(`[CRON] Running at ${now.toISOString()}`);

    const pendingTxns = await ScheduledTransaction.find({
      status: { $in: ["PENDING", "HOLD_FOR_REVIEW"] },
      auto_process_at: { $lte: now },
      processing_locked: false,
      is_reported: false,
    }).populate("user_id");

    console.log(`[CRON] Found ${pendingTxns.length} transactions ready to process`);

    let processed = 0;
    let failed = 0;

    for (const schedTxn of pendingTxns) {
      try {
        schedTxn.status = "PROCESSING";
        schedTxn.processing_locked = true;
        await schedTxn.save();

        const user = schedTxn.user_id;
        if (!user || user.reservedBalance < schedTxn.amount) {
          schedTxn.status = "FAILED";
          schedTxn.delay_reason = "Insufficient reserved balance";
          schedTxn.processed_at = now;
          await schedTxn.save();
          if (user && user.reservedBalance > 0) {
            const refund = Math.min(schedTxn.amount, user.reservedBalance);
            user.balance += refund;
            user.reservedBalance -= refund;
            await user.save();
          }
          console.log(`[CRON] Failed ${schedTxn.txn_id}: insufficient reserved balance`);
          failed++;
          continue;
        }

        const balance_before = user.balance;
        const balance_after = balance_before;
        user.reservedBalance -= schedTxn.amount;
        user.transactionsCount = (user.transactionsCount || 0) + 1;
        await user.save();

        const txn = new Transaction({
          txn_id: schedTxn.txn_id,
          user_id: user._id,
          to_account: schedTxn.to_account,
          ifsc: schedTxn.ifsc,
          beneficiary_name: schedTxn.beneficiary_name,
          amount: schedTxn.amount,
          balance_before,
          balance_after,
          type: "DEBIT",
          is_fraud: false,
        });
        await txn.save();

        const receiver = await User.findOne({ accountNumber: schedTxn.to_account });
        if (receiver) {
          if (receiver.status && !["ACTIVE", "TEMP_FROZEN", "UNDER_REVIEW", "FROZEN", "SUSPENDED", "BLOCKED", "CLEARED"].includes(receiver.status)) {
            receiver.status = "ACTIVE";
          }

          const r_before = receiver.balance;
          const r_after = +(receiver.balance + schedTxn.amount).toFixed(2);

          await Transaction.create({
            txn_id: `${schedTxn.txn_id}-CREDIT`,
            user_id: receiver._id,
            from_account: user.accountNumber,
            to_account: receiver.accountNumber,
            amount: schedTxn.amount,
            balance_before: r_before,
            balance_after: r_after,
            type: "CREDIT",
            is_fraud: false,
          });

          receiver.balance = r_after;
          receiver.transactionsCount += 1;
          await receiver.save();
        }

        if (twilioClient) {
          try {
            await twilioClient.messages.create({
              to: formatPhone(user.phoneNumber),
              body: `GramBank: ₹${schedTxn.amount} transferred to ${schedTxn.beneficiary_name || maskAccount(schedTxn.to_account)}. Bal ₹${balance_after}.`,
              from: twilioPhoneNumber,
            });
          } catch (e) {
            console.error("SMS error:", e);
          }
        }

        schedTxn.status = "COMPLETED";
        schedTxn.processed_at = now;
        await schedTxn.save();
        console.log(`[CRON] Completed ${schedTxn.txn_id}`);
        processed++;
      } catch (err) {
        console.error(`[CRON] Failed processing ${schedTxn.txn_id}:`, err);
        const user = schedTxn.user_id;
        schedTxn.status = "FAILED";
        schedTxn.delay_reason = err.message || "Processing error";
        schedTxn.processed_at = now;
        await schedTxn.save();
        if (user && user.reservedBalance > 0) {
          const refund = Math.min(schedTxn.amount, user.reservedBalance);
          user.balance += refund;
          user.reservedBalance -= refund;
          await user.save();
        }
        failed++;
      }
    }

    console.log(`[CRON] Done. Processed: ${processed}, Failed: ${failed}`);

    res.json({
      message: "Processing complete",
      processed,
      failed,
      total: pendingTxns.length,
    });
  } catch (err) {
    console.error("Process scheduled error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * ==============================
 * ✅ ADMIN: GET ALL TRANSACTIONS
 * ==============================
 * GET /api/txns/admin/all
 */
router.get("/admin/all", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { txn_id: { $regex: s, $options: "i" } },
        { to_account: { $regex: s, $options: "i" } },
        { from_account: { $regex: s, $options: "i" } },
        { beneficiary_name: { $regex: s, $options: "i" } },
      ];
    }

    if (req.query.type) filter.type = req.query.type;

    if (req.query.status) {
      if (req.query.status === "flagged") {
        filter.$or = [{ is_fraud: true }, { is_suspicious: true }];
      } else if (req.query.status === "completed") {
        filter.is_fraud = { $ne: true };
        filter.is_suspicious = { $ne: true };
      }
    }

    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
    }

    const [transactions, totalTransactions] = await Promise.all([
      Transaction.find(filter)
        .populate("user_id", "name accountNumber phoneNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter)
    ]);

    res.json({
      totalTransactions, currentPage: page,
      totalPages: Math.ceil(totalTransactions / limit),
      transactions
    });
  } catch (err) {
    console.error("Admin fetch transactions error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

/**
 * ==============================
 * ✅ ADMIN: USER BASED TRANSACTIONS
 * ==============================
 * GET /api/txns/admin/user/:userId
 */
router.get("/admin/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user_id: userId })
      .populate("user_id", "name accountNumber upiId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments({ user_id: userId });

    res.json({
      userId,
      totalTransactions: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      transactions,
    });
  } catch (err) {
    console.error("User based txn error:", err);
    res.status(500).json({ error: "Failed to fetch user transactions" });
  }
});

module.exports = router;
