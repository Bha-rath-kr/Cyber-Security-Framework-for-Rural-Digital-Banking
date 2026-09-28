const crypto = require('crypto');

function generateTransactionHash(txnData) {
  const hashInput = [
    txnData.txnId,
    txnData.senderAccount,
    txnData.receiverAccount,
    txnData.amount,
    txnData.timestamp
  ].join('|');

  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

function verifyTransactionHash(txnData, expectedHash) {
  const computed = generateTransactionHash(txnData);
  return computed === expectedHash;
}

module.exports = { generateTransactionHash, verifyTransactionHash };
