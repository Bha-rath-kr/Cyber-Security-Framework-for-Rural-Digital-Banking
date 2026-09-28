const FraudAccount = require("../models/FraudAccount");

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeValue(value) {
  if (!value) return null;
  const s = value.toString().trim();
  return s || null;
}

async function findFraudByAny(value) {
  const v = normalizeValue(value);
  if (!v) return null;
  const escaped = escapeRegex(v);
  return FraudAccount.findOne({
    $or: [
      { accountNumber: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      { phoneNumber: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      { upiId: { $regex: new RegExp(`^${escaped}$`, 'i') } }
    ],
    isActive: true
  });
}

async function findFraudByMultiple(values) {
  if (!values || values.length === 0) return null;
  const orConditions = values
    .map(v => normalizeValue(v))
    .filter(Boolean)
    .flatMap(v => {
      const escaped = escapeRegex(v);
      return [
        { accountNumber: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { phoneNumber: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { upiId: { $regex: new RegExp(`^${escaped}$`, 'i') } }
      ];
    });
  if (orConditions.length === 0) return null;
  return FraudAccount.findOne({ $or: orConditions, isActive: true });
}

async function isBlacklisted(value) {
  const result = await findFraudByAny(value);
  return !!result;
}

module.exports = { findFraudByAny, findFraudByMultiple, isBlacklisted };
