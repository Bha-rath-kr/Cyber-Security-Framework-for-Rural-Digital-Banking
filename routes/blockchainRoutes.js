const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const fabricClient = require('../fabric/fabricClient');

router.use(adminAuth);

router.get('/status', async (req, res) => {
  try {
    const status = await fabricClient.getBlockchainStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const all = await fabricClient.getAllBlockchainTransactions();
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const skip = (page - 1) * limit;
    const total = all.length;
    const transactions = all.slice(skip, skip + limit);
    res.json({ total, currentPage: page, totalPages: Math.ceil(total / limit), transactions });
  } catch (err) {
    if (err.message.includes('not connected')) {
      return res.status(503).json({ error: 'Fabric network not connected' });
    }
    console.error('[BLOCKCHAIN_ROUTES] List error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/transaction/:txnId', async (req, res) => {
  try {
    const { txnId } = req.params;
    const txn = await fabricClient.queryTransactionFromBlockchain(txnId);
    res.json(txn);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: `Transaction ${req.params.txnId} not found on ledger` });
    }
    if (err.message.includes('not connected')) {
      return res.status(503).json({ error: 'Fabric network not connected' });
    }
    console.error('[BLOCKCHAIN_ROUTES] Query error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/verify/:txnId', async (req, res) => {
  try {
    const { txnId } = req.params;
    const txn = await fabricClient.queryTransactionFromBlockchain(txnId);

    const { verifyTransactionHash } = require('../fabric/hashUtils');
    const isValid = verifyTransactionHash(
      {
        txnId: txn.txnId,
        senderAccount: txn.senderAccount,
        receiverAccount: txn.receiverAccount,
        amount: txn.amount,
        timestamp: txn.timestamp
      },
      txn.transactionHash
    );

    res.json({
      txnId,
      valid: isValid,
      storedHash: txn.transactionHash,
      record: txn
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: `Transaction ${req.params.txnId} not found on ledger` });
    }
    if (err.message.includes('not connected')) {
      return res.status(503).json({ error: 'Fabric network not connected' });
    }
    console.error('[BLOCKCHAIN_ROUTES] Verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
