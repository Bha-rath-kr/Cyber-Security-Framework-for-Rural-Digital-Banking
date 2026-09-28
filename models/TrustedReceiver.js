const mongoose = require("mongoose");

const trustedReceiverSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  receiver_account: { type: String, required: true },
  trusted_until: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// TTL index: auto-delete expired trusted entries
trustedReceiverSchema.index({ trusted_until: 1 }, { expireAfterSeconds: 0 });
trustedReceiverSchema.index({ user_id: 1, receiver_account: 1 });

module.exports = mongoose.model("TrustedReceiver", trustedReceiverSchema);
