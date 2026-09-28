const express = require("express");
const router = express.Router();
const Otp = require("../models/Otp");

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

// --- Generate OTP and send via Twilio ---
router.post("/send", async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: "Phone number required" });
        console.log("📱 Sending OTP to:", phone);
        const formattedPhone = `+91${phone}`;
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await Otp.create({ phone: formattedPhone, code: otp, expiresAt });

        console.log(`\n[OTP] OTP for ${formattedPhone}: ${otp} (expires at ${expiresAt.toLocaleTimeString()})\n`);

        // send via Twilio (skip if not configured)
        if (twilioClient) {
          try {
            await twilioClient.messages.create({
              to: formattedPhone,
              body: `Your GramBank OTP is ${otp}. Valid for 5 minutes.`,
              from: twilioPhoneNumber,
            });
            return res.json({ success: true, otp, message: `OTP generated: ${otp}` });
          } catch (smsErr) {
            console.error("Twilio error:", smsErr);
          }
        }

        res.json({ success: true, otp, message: `OTP generated: ${otp}` });
    } catch (err) {
        console.error("OTP Error:", err);
        res.status(500).json({ error: "Failed to send OTP" });
    }
});

// --- Verify OTP ---
router.post("/verify", async (req, res) => {
    try {
        const { phone, code } = req.body;
        let otp = code

        if (!phone || !otp) return res.status(400).json({ error: "Missing fields" });

        const formattedPhone = phone.startsWith("+91") ? phone : `+91${phone}`;
        const record = await Otp.findOne({ phone: formattedPhone }).sort({ createdAt: -1 });

        if (!record) return res.status(400).json({ error: "No OTP found for this number" });
        if (record.expiresAt < new Date()) return res.status(400).json({ error: "OTP expired" });
        if (record.code !== otp) return res.status(400).json({ error: "Invalid OTP" });

        res.json({ success: true, message: "OTP verified successfully" });
    } catch (err) {
        console.error("Verify OTP Error:", err);
        res.status(500).json({ error: "Failed to verify OTP" });
    }
});

module.exports = router;
