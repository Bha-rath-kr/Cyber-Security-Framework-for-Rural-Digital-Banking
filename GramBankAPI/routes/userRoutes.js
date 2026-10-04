const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const axios = require("axios");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Otp = require("../models/Otp");
const qs = require("qs");

const auth = require("../middleware/auth");

const router = express.Router();

function generateAccountNumber() {
  const bankCode = "2130";
  const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000);
  return bankCode + randomNumber.toString();
}

router.get("/me", auth, async (req, res) => {
  try {
    const user = req.user;
    res.json({
      id: user._id,
      name: user.name,
      aadhaarNumber: user.aadhaarNumber,
      accountNumber: user.accountNumber,
      upiId: user.upiId,
      upiQR: user.upiQR,
      phoneNumber: user.phoneNumber,
      balance: user.balance,
      ifsc: user.ifsc || "GBRK0002130",
      accountStatus: user.status,
      statusReason: user.status === "ACTIVE" || user.status === "CLEARED" ? "Your account is operating normally."
        : user.status === "UNDER_REVIEW" ? "Your account is being monitored. Some transactions may be delayed."
        : user.status === "TEMP_FROZEN" ? (user.accountStatus?.frozenReason || "Transactions are temporarily blocked due to suspicious activity.")
        : user.status === "FROZEN" ? (user.accountStatus?.frozenReason || "Account frozen due to fraud investigation. Contact support.")
        : user.status === "SUSPENDED" ? (user.accountStatus?.suspensionReason || "Account suspended. Contact support.")
        : user.status === "BLOCKED" ? (user.accountStatus?.blockingReason || "Account permanently blocked. Contact support.")
        : "Your account is operating normally.",
      restrictionLevel: ["BLOCKED", "FROZEN", "SUSPENDED"].includes(user.status) ? "blocked"
        : user.status === "TEMP_FROZEN" ? "frozen"
        : user.status === "UNDER_REVIEW" ? "monitoring"
        : "none"
    });
  } catch (err) {
    console.error("Get user profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/verify-mpin", auth, async (req, res) => {
  try {
    const mpin = String(req.body?.mpin || "").trim();
    if (!/^\d{4}$/.test(mpin)) {
      return res.status(400).json({ error: "Enter your 4-digit MPIN" });
    }

    const isMatch = await bcrypt.compare(mpin, req.user.mpinHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid MPIN" });
    }

    return res.json({ success: true, message: "MPIN verified" });
  } catch (err) {
    console.error("MPIN verification error:", err);
    return res.status(500).json({ error: "MPIN verification failed" });
  }
});

router.post("/signup", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const aadhaarNumber = typeof req.body?.aadhaarNumber === "string" ? req.body.aadhaarNumber : "";
    const panNumber = typeof req.body?.panNumber === "string" ? req.body.panNumber : "";
    const mpin = typeof req.body?.mpin === "string" ? req.body.mpin : "";
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";

    if (!name || !aadhaarNumber || !panNumber || !mpin || !phone) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    if (/[^\d]/.test(aadhaarNumber)) {
      return res.status(400).json({
        success: false,
        error: "Aadhaar number is not correct. Only numbers are allowed.",
      });
    }

    if (aadhaarNumber.length !== 12) {
      return res.status(400).json({
        success: false,
        error: aadhaarNumber.length > 12
          ? "Aadhaar number is not correct. It must contain exactly 12 digits."
          : "Aadhaar number is not correct. It must contain 12 digits.",
      });
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
      return res.status(400).json({
        success: false,
        error: "PAN number is not correct. Please enter a valid PAN in the format ABCDE1234F.",
      });
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, error: "Mobile number is not correct." });
    }

    if (!/^\d{4}$/.test(mpin)) {
      return res.status(400).json({ success: false, error: "MPIN must contain exactly 4 digits." });
    }

    const existingUser = await User.findOne({ aadhaarNumber });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "Aadhaar number is already registered." });
    }

    const existingPhone = await User.findOne({ phoneNumber: phone });
    if (existingPhone) {
      return res.status(400).json({ success: false, error: "Mobile number is already registered." });
    }

    const mpinHash = await bcrypt.hash(mpin, 10);

    let accountNumber;
    let isUnique = false;

    while (!isUnique) {
      accountNumber = generateAccountNumber();
      const existingAcc = await User.findOne({ accountNumber });
      if (!existingAcc) isUnique = true;
    }

    const upiId = `${accountNumber}@grambank`;
    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&cu=INR`;

    const qrDataUrl = await QRCode.toDataURL(upiString);
    const base64Image = qrDataUrl.split(",")[1];

    let qrImageUrl = qrDataUrl;
    if (process.env.IMGBB_API_KEY && process.env.IMGBB_API_KEY !== "your_imgbb_api_key") {
      try {
        const uploadRes = await axios.post(
          `https://api.imgbb.com/1/upload`,
          qs.stringify({ key: process.env.IMGBB_API_KEY, image: base64Image }),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        if (uploadRes.data.data?.url) {
          qrImageUrl = uploadRes.data.data.url;
        }
      } catch (imgErr) {
        qrImageUrl = qrDataUrl;
      }
    }
console.log("QR Image URL:", qrImageUrl);
    const newUser = await User.create({
      name,
      aadhaarNumber,
      panNumber,
      mpinHash,
      accountNumber,
      phoneNumber: phone,
      upiId,
      upiQR: qrImageUrl
    });

    res.status(201).json({
      message: "User registered successfully",
      userId: newUser._id,
      accountNumber: newUser.accountNumber,
      upiId: newUser.upiId,
      upiQR: newUser.upiQR
    });
  } catch (error) {
    console.error("Signup Error:", error);
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      const duplicateMessages = {
        aadhaarNumber: "Aadhaar number is already registered.",
        phoneNumber: "Mobile number is already registered.",
      };
      if (duplicateMessages[duplicateField]) {
        return res.status(400).json({ success: false, error: duplicateMessages[duplicateField] });
      }
    }
    res.status(500).json({ error: error.message || "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const authStartTime = Date.now();
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("[PERF] USER AUTHENTICATION - START");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[PERF] Timestamp: ${new Date().toISOString()}`);
    
    const aadhaarNumber = typeof req.body?.aadhaarNumber === "string"
      ? req.body.aadhaarNumber
      : "";
    const mpin = String(req.body?.mpin || "").trim();

    const maskedAadhaar = aadhaarNumber.length >= 4
      ? `********${aadhaarNumber.slice(-4)}`
      : "[invalid]";
    console.log("Login attempt:", { aadhaar: maskedAadhaar, mpinLength: mpin.length });

    if (!/^\d{12}$/.test(aadhaarNumber)) {
      const message = /[^\d]/.test(aadhaarNumber)
        ? "Aadhaar number is not correct. Only numbers are allowed."
        : aadhaarNumber.length > 12
          ? "Aadhaar number is not correct. It must contain exactly 12 digits."
          : "Aadhaar number is not correct. It must contain 12 digits.";
      return res.status(400).json({ success: false, error: message });
    }

    if (!mpin)
      return res.status(400).json({ error: "Aadhaar number and MPIN required" });

    const user = await User.findOne({ aadhaarNumber });

    if (!user) {
      console.log("Login rejected: no account matches the supplied Aadhaar.");
      return res.status(404).json({
        success: false,
        error: "Aadhaar number is not registered.",
      });
    }

    console.log("Login account found for Aadhaar:", maskedAadhaar);

    if (user.status === "FROZEN")
      return res.status(403).json({ error: "Account is frozen. Contact support." });

    const isMatch = await bcrypt.compare(mpin, user.mpinHash);
    console.log("MPIN match:", isMatch);

    if (!isMatch)
      return res.status(401).json({ error: "Invalid MPIN" });

    // Fix invalid status if necessary
    if (user.status && !["ACTIVE", "TEMP_FROZEN", "UNDER_REVIEW", "FROZEN", "SUSPENDED", "BLOCKED", "CLEARED"].includes(user.status)) {
      await User.updateOne({ _id: user._id }, { $set: { status: "ACTIVE" } });
    }

    const token = jwt.sign(
      { id: user._id, aadhaarNumber: user.aadhaarNumber },
      process.env.JWT_SECRET,
      { expiresIn: "90d" }
    );

    const userData = {
      id: user._id,
      name: user.name,
      aadhaarNumber: user.aadhaarNumber,
      accountNumber: user.accountNumber,
      upiId: user.upiId,
      phoneNumber: user.phoneNumber,
      balance: user.balance,
      ifsc: user.ifsc || "GBRK0002130",
      accountStatus: user.status,
      statusReason: user.status === "ACTIVE" || user.status === "CLEARED" ? "Your account is operating normally."
        : user.status === "UNDER_REVIEW" ? "Your account is being monitored. Some transactions may be delayed."
        : user.status === "TEMP_FROZEN" ? (user.accountStatus?.frozenReason || "Transactions are temporarily blocked due to suspicious activity.")
        : user.status === "FROZEN" ? (user.accountStatus?.frozenReason || "Account frozen due to fraud investigation. Contact support.")
        : user.status === "SUSPENDED" ? (user.accountStatus?.suspensionReason || "Account suspended. Contact support.")
        : user.status === "BLOCKED" ? (user.accountStatus?.blockingReason || "Account permanently blocked. Contact support.")
        : "Your account is operating normally.",
      restrictionLevel: ["BLOCKED", "FROZEN", "SUSPENDED"].includes(user.status) ? "blocked"
        : user.status === "TEMP_FROZEN" ? "frozen"
        : user.status === "UNDER_REVIEW" ? "monitoring"
        : "none"
    };

    const authEndTime = Date.now();
    const authDuration = authEndTime - authStartTime;
    console.log(`[PERF] OTP Verification: ✓ Completed`);
    console.log(`[PERF] JWT Token Generation: ✓ Completed`);
    console.log(`[PERF] Total Authentication Time: ${authDuration}ms`);
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[PERF] USER AUTHENTICATION - END (Duration: ${authDuration}ms)`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    res.json({
      message: "Login successful",
      token,
      user: userData,
      _perf: { authenticationTimeMs: authDuration }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/search", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    const FraudAccount = require("../models/FraudAccount");
    const TransactionReport = require("../models/TransactionReport");
    const fraudEngine = require("../services/fraudEngine");

    const user = await User.findOne({ phoneNumber: phone }).select("name phoneNumber upiId accountNumber status");
    const fraud = await FraudAccount.findOne({ phoneNumber: phone, isActive: true });
    const complaint = await TransactionReport.findOne({ "reported.accountNumber": phone }).sort({ createdAt: -1 });
    const receiverStatus = await fraudEngine.getReceiverStatus(phone);

    if (!user && !fraud && !complaint) {
      return res.status(404).json({ error: "No record found for this phone number" });
    }

    if (fraud) {
      const decision = receiverStatus === "BLACKLISTED" ? "TEMP_FREEZE" : receiverStatus === "HIGH_RISK" ? "HOLD_FOR_REVIEW" : "WARNING";
      return res.json({
        ...fraudEngine.buildDecisionResponse({ decision, riskScore: fraud.riskLevel === "HIGH" || fraud.riskLevel === "CRITICAL" ? 95 : 70, reasons: [fraud.reason] }, { receiverStatus }),
        name: fraud.name,
        phone: fraud.phoneNumber,
        upiId: fraud.upiId,
        accountNumber: fraud.accountNumber,
        status: "BLACKLISTED",
        isGramBankUser: false,
        source: "fraud_account",
        fraudWarning: true,
        fraudName: fraud.name,
        reason: fraud.reason,
        riskLevel: fraud.riskLevel,
        fraudType: fraud.fraudType,
        message: "Warning: This number is reported as fraudulent.",
        receiverSafety: false,
      });
    }

    if (complaint) {
      let displayStatus;
      if (complaint.status === "UNDER_INVESTIGATION") displayStatus = "UNDER_INVESTIGATION";
      else if (complaint.status === "MARKED_FRAUD" || complaint.status === "RESOLVED") displayStatus = "CONFIRMED_FRAUD";
      else if (complaint.status === "BLOCKED") displayStatus = "BLOCKED";
      else if (complaint.status === "SUSPENDED") displayStatus = "SUSPENDED";
      else displayStatus = "FLAGGED";

      return res.json({
        ...fraudEngine.buildDecisionResponse({ decision: "WARNING", riskScore: 60, reasons: ["Account linked to a complaint"] }, { receiverStatus }),
        name: complaint.reported?.name || user?.name || "Unknown",
        phone: user?.phoneNumber || phone,
        upiId: user?.upiId || complaint.reported?.upiId || "",
        accountNumber: complaint.reported?.accountNumber || "",
        status: displayStatus,
        isGramBankUser: !!user,
        source: "complaint",
        fraudWarning: true,
        message: "Warning: This account has been reported in a complaint.",
        receiverSafety: false,
      });
    }

    res.json({
      success: true,
      ...fraudEngine.buildDecisionResponse({ decision: "SAFE", riskScore: 0, reasons: [] }, { receiverStatus }),
      ...user.toObject(),
      receiverStatus,
      receiverSafety: true,
    });
  } catch (err) {
    console.error("Search user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/all-contacts", async (req, res) => {
  try {
    const users = await User.find(
      { isAdmin: { $ne: true } },
      { name: 1, phoneNumber: 1, upiId: 1, accountNumber: 1, status: 1 }
    ).sort({ name: 1 });

    const FraudAccount = require("../models/FraudAccount");
    const TransactionReport = require("../models/TransactionReport");

    const results = [];
    const dedupKeys = new Set();

    // Add all User records
    for (const u of users) {
      const entry = {
        name: u.name,
        phone: u.phoneNumber,
        upiId: u.upiId,
        accountNumber: u.accountNumber,
        status: u.status,
        isGramBankUser: true,
        source: "user",
      };
      results.push(entry);
      if (u.phoneNumber) dedupKeys.add("phone:" + u.phoneNumber);
      if (u.accountNumber) dedupKeys.add("acct:" + u.accountNumber);
    }

    // Add FraudAccount records not already represented by a User
    const fraudAccounts = await FraudAccount.find({ isActive: true });
    for (const f of fraudAccounts) {
      const phoneKey = f.phoneNumber ? "phone:" + f.phoneNumber : null;
      const acctKey = f.accountNumber ? "acct:" + f.accountNumber : null;
      if ((phoneKey && dedupKeys.has(phoneKey)) || (acctKey && dedupKeys.has(acctKey))) continue;
      if (phoneKey) dedupKeys.add(phoneKey);
      if (acctKey) dedupKeys.add(acctKey);
      results.push({
        name: f.name,
        phone: f.phoneNumber || "",
        upiId: f.upiId || "",
        accountNumber: f.accountNumber || "",
        status: "BLACKLISTED",
        isGramBankUser: false,
        source: "fraud_account",
        riskLevel: f.riskLevel,
        reason: f.reason,
      });
    }

    // Add complaint-linked accounts not already represented
    const complaints = await TransactionReport.find(
      { "reported.accountNumber": { $exists: true, $nin: ["UNKNOWN", null, ""] } },
      { "reported.accountNumber": 1, "reported.name": 1, "reported.upiId": 1, status: 1 }
    ).sort({ createdAt: -1 });

    const seenComplaintAccts = new Set();
    for (const c of complaints) {
      const acc = c.reported?.accountNumber;
      if (!acc || seenComplaintAccts.has(acc)) continue;
      seenComplaintAccts.add(acc);
      const acctKey = "acct:" + acc;
      if (dedupKeys.has(acctKey)) continue;
      dedupKeys.add(acctKey);

      let displayStatus;
      if (c.status === "UNDER_INVESTIGATION") displayStatus = "UNDER_INVESTIGATION";
      else if (c.status === "MARKED_FRAUD" || c.status === "RESOLVED") displayStatus = "CONFIRMED_FRAUD";
      else if (c.status === "BLOCKED") displayStatus = "BLOCKED";
      else if (c.status === "SUSPENDED") displayStatus = "SUSPENDED";
      else displayStatus = "FLAGGED";

      results.push({
        name: c.reported?.name || "Unknown",
        phone: "",
        upiId: c.reported?.upiId || "",
        accountNumber: acc,
        status: displayStatus,
        isGramBankUser: false,
        source: "complaint",
        complaintStatus: c.status,
      });
    }

    res.json(results);
  } catch (err) {
    console.error("Contacts fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/all-users", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { name: { $regex: s, $options: "i" } },
        { accountNumber: { $regex: s, $options: "i" } },
        { phoneNumber: { $regex: s, $options: "i" } },
        { aadhaarNumber: { $regex: s, $options: "i" } },
        { upiId: { $regex: s, $options: "i" } },
      ];
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.flagged === "true") filter["riskFlags.isFlaggedForFraud"] = true;

    const [users, totalUsers] = await Promise.all([
      User.find(filter).select("-mpinHash -__v").sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter)
    ]);

    res.json({ totalUsers, currentPage: page, totalPages: Math.ceil(totalUsers / limit), users });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/add-balance/:userId", async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) return res.status(404).json({ error: "User not found" });

    const before = user.balance;
    user.balance += amount;

    // Fix invalid status if necessary
    if (user.status && !["ACTIVE", "TEMP_FROZEN", "UNDER_REVIEW", "FROZEN", "SUSPENDED", "BLOCKED", "CLEARED"].includes(user.status)) {
      user.status = "ACTIVE"; // Default to ACTIVE if invalid
    }

    await user.save();

    await Transaction.create({
      txn_id: `ADMIN-${Date.now()}`,
      user_id: user._id,
      amount,
      balance_before: before,
      balance_after: user.balance,
      type: "CREDIT",
      is_fraud: false,
      note: reason || "Admin credit"
    });

    res.json({
      message: "Amount added successfully",
      balance_before: before,
      balance_after: user.balance
    });
  } catch (err) {
    console.error("Add balance error:", err);
    res.status(500).json({ error: "Failed to add balance" });
  }
});

router.post("/admin/migrate-ifsc", async (req, res) => {
  try {
    const result = await User.updateMany(
      { ifsc: { $exists: false } },
      { $set: { ifsc: "GBRK0002130" } }
    );
    res.json({ message: `${result.modifiedCount} users updated with IFSC code` });
  } catch (err) {
    console.error("IFSC migration error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/forgot-mpin/request", async (req, res) => {
  try {
    const { aadhaarNumber, phoneNumber } = req.body;

    if (!aadhaarNumber || !phoneNumber)
      return res.status(400).json({ error: "Aadhaar number and phone number required" });

    const user = await User.findOne({ aadhaarNumber });

    if (!user)
      return res.status(404).json({ error: "User not found" });

    if (user.phoneNumber !== phoneNumber)
      return res.status(400).json({ error: "Phone number does not match our records" });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const formattedPhone = `+91${phoneNumber}`;

    await Otp.create({
      phone: formattedPhone,
      code: otpCode,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    console.log(`[Forgot MPIN OTP] Phone: ${formattedPhone}, OTP: ${otpCode}`);

    try {
      const twilio = require("twilio");
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
      await client.messages.create({
        body: `GramBank: Your MPIN reset OTP is ${otpCode}. Valid for 5 minutes.`,
        from: twilioPhoneNumber,
        to: formattedPhone,
      });
    } catch (smsErr) {
      console.log("SMS error (OTP still saved):", smsErr.message);
    }

    res.json({ message: "OTP sent successfully", otp: otpCode });
  } catch (err) {
    console.error("Forgot MPIN request error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/forgot-mpin/reset", async (req, res) => {
  try {
    const { aadhaarNumber, phoneNumber, otp, newMpin } = req.body;

    if (!aadhaarNumber || !phoneNumber || !otp || !newMpin)
      return res.status(400).json({ error: "All fields are required" });

    if (!/^\d{4}$/.test(newMpin))
      return res.status(400).json({ error: "MPIN must be 4 digits" });

    const user = await User.findOne({ aadhaarNumber });

    if (!user)
      return res.status(404).json({ error: "User not found" });

    if (user.phoneNumber !== phoneNumber)
      return res.status(400).json({ error: "Phone number does not match" });

    const formattedPhone = `+91${phoneNumber}`;
    const otpRecord = await Otp.findOne({ phone: formattedPhone, code: otp }).sort({ createdAt: -1 });

    if (!otpRecord)
      return res.status(400).json({ error: "Invalid OTP" });

    if (otpRecord.expiresAt < new Date())
      return res.status(400).json({ error: "OTP expired" });

    const newMpinHash = await bcrypt.hash(newMpin, 10);
    user.mpinHash = newMpinHash;

    // Fix invalid status if necessary
    if (user.status && !["ACTIVE", "TEMP_FROZEN", "UNDER_REVIEW", "FROZEN", "SUSPENDED", "BLOCKED", "CLEARED"].includes(user.status)) {
      user.status = "ACTIVE"; // Default to ACTIVE if invalid
    }

    await user.save();

    await Otp.deleteMany({ phone: formattedPhone, code: otp });

    res.json({ message: "MPIN reset successfully" });
  } catch (err) {
    console.error("Forgot MPIN reset error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/freeze/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { status: "FROZEN" },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "User frozen successfully", user });
  } catch (err) {
    console.error("Freeze user error:", err);
    res.status(500).json({ error: "Failed to freeze user" });
  }
});

router.post("/admin/unfreeze/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { status: "ACTIVE" },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "User unfrozen successfully", user });
  } catch (err) {
    console.error("Unfreeze user error:", err);
    res.status(500).json({ error: "Failed to unfreeze user" });
  }
});

module.exports = router;