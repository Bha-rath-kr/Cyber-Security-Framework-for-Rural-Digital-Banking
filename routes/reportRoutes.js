const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const TransactionReport = require("../models/TransactionReport");
const Transaction = require("../models/Transaction");
const ScheduledTransaction = require("../models/ScheduledTransaction");
const ComplaintService = require("../services/complaintService");
const User = require("../models/User");

const CATEGORY_MAPPING = {
  UNAUTHORIZED: "UNAUTHORIZED_TRANSACTION",
  WRONG_RECIPIENT: "WRONG_RECIPIENT",
  DUPLICATE: "DUPLICATE_CHARGE",
  NOT_RECEIVED: "NOT_RECEIVED",
  FRAUD: "FAKE_PAYMENT",
  OTHER: "OTHER"
};

router.post("/create", auth, async (req, res) => {
  try {
    const { transaction_id, report_type, description, reported_account, amount, evidence, upi_id } = req.body;

    console.log("[REPORT] === NEW REPORT REQUEST ===");
    console.log("[REPORT] txn_id:", transaction_id);
    console.log("[REPORT] report_type:", report_type);
    console.log("[REPORT] reported_account:", reported_account);
    console.log("[REPORT] upi_id:", upi_id);
    console.log("[REPORT] amount:", amount);
    console.log("[REPORT] user:", req.user.name, req.user.accountNumber);

    if (!transaction_id || !report_type) {
      return res.status(400).json({ error: "Transaction ID and report type required" });
    }
    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }

    const validTypes = ["UNAUTHORIZED", "WRONG_RECIPIENT", "DUPLICATE", "NOT_RECEIVED", "OTHER", "FRAUD"];
    if (!validTypes.includes(report_type)) {
      return res.status(400).json({ error: "Invalid report type" });
    }

    // Check user profile
    if (!req.user.phoneNumber || !req.user.accountNumber) {
      return res.status(400).json({ error: "Please complete your profile (phone number and account number required)" });
    }

    // Lookup transaction in DB
    let txnDetails = null;
    let isScheduled = false;
    let scheduledTxn = null;

    try {
      txnDetails = await Transaction.findOne({ txn_id: transaction_id });
    } catch (e) {
      console.log("[REPORT] Transaction lookup error:", e.message);
    }

    if (!txnDetails) {
      try {
        scheduledTxn = await ScheduledTransaction.findOne({ txn_id: transaction_id, user_id: req.user._id });
        if (scheduledTxn) {
          isScheduled = true;
          txnDetails = scheduledTxn;
        }
      } catch (e) {
        console.log("[REPORT] Scheduled txn lookup error:", e.message);
      }
    }

    console.log("[REPORT] txnDetails found:", !!txnDetails);
    if (txnDetails) {
      console.log("[REPORT] to_account:", txnDetails.to_account, "from_account:", txnDetails.from_account, "to_upi:", txnDetails.to_upi);
    }

    // Determine amount
    const txnAmount = amount || (txnDetails && txnDetails.amount) || 0;
    if (!txnAmount || txnAmount <= 0) {
      return res.status(400).json({ error: "Valid transaction amount is required" });
    }

    // Determine reported account - try all possible sources
    let reportedAcc = "";
    let reportedUpi = "";

    // 1) Direct from body
    if (reported_account && reported_account !== "") {
      reportedAcc = reported_account;
    }

    // 2) From DB transaction to_account
    if (!reportedAcc && txnDetails && txnDetails.to_account) {
      reportedAcc = txnDetails.to_account;
    }

    // 3) From DB transaction from_account
    if (!reportedAcc && txnDetails && txnDetails.from_account) {
      reportedAcc = txnDetails.from_account;
    }

    // 4) From UPI in DB transaction
    if (!reportedAcc && txnDetails && txnDetails.to_upi) {
      reportedUpi = txnDetails.to_upi;
      console.log("[REPORT] Looking up account for to_upi:", txnDetails.to_upi);
      const upiUser = await User.findOne({ upiId: txnDetails.to_upi });
      if (upiUser) {
        reportedAcc = upiUser.accountNumber;
        console.log("[REPORT] Resolved to:", reportedAcc);
      }
    }

    // 5) From UPI in body
    if (!reportedAcc && upi_id && upi_id !== "") {
      reportedUpi = upi_id;
      console.log("[REPORT] Looking up account for body upi_id:", upi_id);
      const upiUser = await User.findOne({ upiId: upi_id });
      if (upiUser) {
        reportedAcc = upiUser.accountNumber;
        console.log("[REPORT] Resolved to:", reportedAcc);
      }
    }

    // 6) Ultimate fallback
    if (!reportedAcc) {
      reportedAcc = "UNKNOWN";
      if (!reportedUpi) {
        reportedUpi = "UNKNOWN";
      }
    }

    console.log("[REPORT] FINAL reportedAcc:", reportedAcc, "reportedUpi:", reportedUpi);

    const category = CATEGORY_MAPPING[report_type] || "OTHER";
    const incidentDate = txnDetails && txnDetails.createdAt ? txnDetails.createdAt : new Date();

    // Submit complaint
    const report = await ComplaintService.submitComplaint(req.user, {
      category,
      description: description || report_type,
      incident_date: incidentDate,
      reported_account: reportedAcc,
      txn_id: transaction_id,
      txn_type: (txnDetails && txnDetails.type) || "BANK_TRANSFER",
      amount: txnAmount,
      upi_id: reportedUpi || null,
      evidence: evidence || []
    });

    console.log("[REPORT] Complaint created:", report.complaintId);

    // Block scheduled transactions if needed
    const BLOCKING_TYPES = ["UNAUTHORIZED", "WRONG_RECIPIENT", "FRAUD", "SUSPICIOUS"];
    if (isScheduled && scheduledTxn && BLOCKING_TYPES.includes(report_type.toUpperCase()) && ["PENDING", "HOLD_FOR_REVIEW"].includes(scheduledTxn.status)) {
      scheduledTxn.status = "FRAUD_REPORTED";
      scheduledTxn.is_reported = true;
      scheduledTxn.report_reason = report_type;
      scheduledTxn.processing_locked = true;
      await scheduledTxn.save();

      // Refund reserved balance to sender
      const senderUser = await User.findById(scheduledTxn.user_id);
      if (senderUser && senderUser.reservedBalance >= scheduledTxn.amount) {
        senderUser.balance += scheduledTxn.amount;
        senderUser.reservedBalance -= scheduledTxn.amount;
        await senderUser.save();
      }

      return res.status(201).json({
        message: "Transaction report submitted. Scheduled transaction has been cancelled and refunded.",
        complaintId: report.complaintId,
        report_id: report._id,
        status: report.status,
        transaction_status: "FRAUD_REPORTED",
        refund: scheduledTxn.amount,
      });
    }

    res.status(201).json({
      message: "Complaint submitted successfully",
      complaintId: report.complaintId,
      report_id: report._id,
      status: report.status,
      severity: report.severity
    });
  } catch (err) {
    console.error("[REPORT] ERROR:", err.message, err.stack);
    res.status(400).json({ error: err.message || "Failed to create complaint" });
  }
});

router.get("/my-reports", auth, async (req, res) => {
  try {
    const reports = await TransactionReport.find({ "reporter.user_id": req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      count: reports.length,
      reports: reports.map(r => ({
        complaintId: r.complaintId,
        report_id: r._id,
        transaction_id: r.relatedTransaction?.txn_id,
        report_type: r.complaint.category,
        description: r.complaint.description,
        amount: r.relatedTransaction?.amount,
        reported_account: r.reported?.accountNumber,
        status: r.status,
        severity: r.severity,
        createdAt: r.createdAt,
        resolved_at: r.resolution?.resolvedAt,
        resolution: r.resolution?.resolutionSummary,
        timeline: r.timeline?.slice(-3).map(t => ({
          status: t.status,
          note: t.note,
          performedAt: t.performedAt
        }))
      }))
    });
  } catch (err) {
    console.error("Fetch reports error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/track/:complaintId", async (req, res) => {
  try {
    const report = await TransactionReport.findOne({ complaintId: req.params.complaintId });
    if (!report) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    res.json({
      complaintId: report.complaintId,
      status: report.status,
      severity: report.severity,
      category: report.complaint.category,
      filedAt: report.complaint.reportedAt,
      lastUpdated: report.updatedAt,
      timeline: report.timeline.map(t => ({
        status: t.status,
        note: t.note,
        performedAt: t.performedAt,
        performedBy: t.performedBy
      })),
      resolution: report.resolution
    });
  } catch (err) {
    console.error("Track complaint error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:reportId", auth, async (req, res) => {
  try {
    const report = await TransactionReport.findOne({
      _id: req.params.reportId,
      "reporter.user_id": req.user._id
    });
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    res.json({
      complaintId: report.complaintId,
      report_id: report._id,
      transaction_id: report.relatedTransaction?.txn_id,
      report_type: report.complaint.category,
      description: report.complaint.description,
      amount: report.relatedTransaction?.amount,
      beneficiary_account: report.reported?.accountNumber,
      beneficiary_upi: report.reported?.upiId,
      transaction_date: report.relatedTransaction?.timestamp,
      status: report.status,
      severity: report.severity,
      evidence: report.evidence,
      createdAt: report.createdAt,
      resolved_at: report.resolution?.resolvedAt,
      resolution: report.resolution?.resolutionSummary,
      timeline: report.timeline
    });
  } catch (err) {
    console.error("Fetch report error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
