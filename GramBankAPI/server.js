require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");

const userRoutes = require("./routes/userRoutes");
const txnRoutes = require("./routes/txnRoutes");
const otpRoutes = require("./routes/otpRoutes");
const fabricClient = require("./fabric/fabricClient");
const app = express();

// ✅ Universal CORS Setup (Compatible with Express 5)
app.use(
  cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ Safe alternative to avoid path-to-regexp '*' error
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Middleware
app.use(express.json());

// ✅ MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ✅ Train ML anomaly model on startup (async, non-blocking)
const { trainFromDataset, loadModelIfExists } = require("./ml/anomalyModel");
(async () => {
  const loaded = await loadModelIfExists();
  if (!loaded) {
    console.log("[ML] No saved model found, training from dataset...");
    await trainFromDataset();
  }
})();

// ✅ Hyperledger Fabric connection (async, non-blocking, graceful fallback)
(async () => {
  try {
    await fabricClient.connectToFabric();
  } catch (err) {
    console.warn("[FABRIC] Initial connection failed (transactions will still work):", err.message);
  }
})();

// ✅ Routes
app.use("/api/users", userRoutes);
app.use("/api/txns", txnRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/fraud", require("./routes/fraudRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/chatbot", require("./routes/chatbotRoutes"));
app.use("/api/live-chat", require("./routes/liveChatRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/upi-collect", require("./routes/upiCollectRoutes"));
app.use("/api/blockchain", require("./routes/blockchainRoutes"));

// ✅ Default route
app.get("/", (req, res) => {
  res.json({ message: "GramBank API is running 🚀" });
});

// ✅ Cron Job: Process scheduled transactions every minute
cron.schedule("* * * * *", async () => {
  if (mongoose.connection.readyState !== 1) {
    console.log("[CRON] Skipped — MongoDB not connected");
    return;
  }

  try {
    const ScheduledTransaction = require("./models/ScheduledTransaction");
    const User = require("./models/User");
    const Transaction = require("./models/Transaction");

    const now = new Date();
    console.log(`[CRON] Running at ${now.toISOString()}`);

    const pendingTxns = await ScheduledTransaction.find({
      status: { $in: ["PENDING", "HOLD_FOR_REVIEW"] },
      auto_process_at: { $lte: now },
      processing_locked: false,
      is_reported: false,
    }).populate("user_id");

    console.log(`[CRON] Found ${pendingTxns.length} transactions ready to process`);

    for (const pendingTxn of pendingTxns) {
      let schedTxn;
      try {
        schedTxn = await ScheduledTransaction.findOneAndUpdate(
          {
            _id: pendingTxn._id,
            status: { $in: ["PENDING", "HOLD_FOR_REVIEW"] },
            auto_process_at: { $lte: now },
            processing_locked: false,
            is_reported: false,
          },
          { $set: { processing_locked: true } },
          { new: true }
        ).populate("user_id");

        if (!schedTxn) {
          console.log(`[CRON] Skipped ${pendingTxn.txn_id}: already being processed`);
          continue;
        }

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
          continue;
        }

        const receiver = schedTxn.to_upi
          ? await User.findOne({ upiId: schedTxn.to_upi })
          : await User.findOne({ accountNumber: schedTxn.to_account });

        if (!receiver) {
          schedTxn.status = "FAILED";
          schedTxn.delay_reason = "Recipient account not found";
          schedTxn.processed_at = now;
          await schedTxn.save();

          user.balance += schedTxn.amount;
          user.reservedBalance -= schedTxn.amount;
          await user.save();

          console.log(`[CRON] Failed ${schedTxn.txn_id}: recipient account not found`);
          continue;
        }

        const balance_before = user.balance;
        const balance_after = balance_before;
        user.reservedBalance -= schedTxn.amount;
        user.transactionsCount = (user.transactionsCount || 0) + 1;
        await user.save();

        await Transaction.create({
          txn_id: schedTxn.txn_id,
          user_id: user._id,
          to_account: schedTxn.to_account,
          to_upi: schedTxn.to_upi,
          ifsc: schedTxn.ifsc,
          beneficiary_name: schedTxn.beneficiary_name,
          amount: schedTxn.amount,
          balance_before,
          balance_after,
          type: "DEBIT",
          is_fraud: false,
        });

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
        receiver.transactionsCount = (receiver.transactionsCount || 0) + 1;
        await receiver.save();

        schedTxn.status = "COMPLETED";
        schedTxn.processed_at = now;
        await schedTxn.save();
        console.log(`[CRON] Completed ${schedTxn.txn_id}`);

        fabricClient.storeTransactionOnBlockchain({
          txnId: schedTxn.txn_id,
          senderAccount: user.accountNumber || user._id.toString(),
          receiverAccount: schedTxn.to_account || schedTxn.to_upi || "unknown",
          amount: schedTxn.amount,
          fraudDecision: "SAFE"
        }).then(result => {
          if (result.stored) {
            console.log(`[FABRIC] Scheduled txn ${schedTxn.txn_id} stored on blockchain (hash: ${result.blockchainHash})`);
          }
        }).catch(err => {
          console.error(`[FABRIC] Non-blocking storage failed for ${schedTxn.txn_id}:`, err.message);
        });
      } catch (err) {
        console.error(`[CRON] Failed processing ${schedTxn?.txn_id || pendingTxn.txn_id}:`, err);
        try {
          if (!schedTxn) continue;
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
        } catch (saveErr) {
          console.error(`[CRON] Failed to save status for ${schedTxn.txn_id}:`, saveErr);
        }
      }
    }
  } catch (err) {
    console.error("[CRON] Error:", err);
  }
});

// ✅ Start server — bind to HOST so mobile devices can reach it
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  const apiUrl = process.env.API_BASE_URL || `http://localhost:${PORT}`;
  console.log(`🚀 GramBank API running at ${apiUrl}`);
  console.log(`   Bound to ${HOST}:${PORT}`);
});
