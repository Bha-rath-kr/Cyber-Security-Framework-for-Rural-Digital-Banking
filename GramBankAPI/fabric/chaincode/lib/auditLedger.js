'use strict';

const { Contract } = require('fabric-contract-api');

class AuditLedger extends Contract {

  async createTransaction(ctx, txnId, txnDataJson) {
    const txnData = JSON.parse(txnDataJson);

    if (!txnId || !txnData) {
      throw new Error('txnId and txnData are required');
    }

    const existing = await ctx.stub.getState(txnId);
    if (existing && existing.length > 0) {
      throw new Error(`Transaction ${txnId} already exists on ledger`);
    }

    const record = {
      txnId: txnData.txnId,
      senderAccount: txnData.senderAccount,
      receiverAccount: txnData.receiverAccount,
      amount: txnData.amount,
      timestamp: txnData.timestamp,
      status: txnData.status || 'SUCCESS',
      fraudDecision: txnData.fraudDecision || 'SAFE',
      transactionHash: txnData.transactionHash,
      docType: 'transaction'
    };

    await ctx.stub.putState(txnId, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  async queryTransaction(ctx, txnId) {
    const data = await ctx.stub.getState(txnId);
    if (!data || data.length === 0) {
      throw new Error(`Transaction ${txnId} not found on ledger`);
    }
    return data.toString();
  }

  async getAllTransactions(ctx) {
    const startKey = '';
    const endKey = '';
    const iterator = await ctx.stub.getStateByRange(startKey, endKey);
    const results = [];

    while (true) {
      const next = await iterator.next();
      if (next.value && next.value.value.toString()) {
        const record = JSON.parse(next.value.value.toString());
        if (record.docType === 'transaction') {
          results.push(record);
        }
      }
      if (next.done) break;
    }

    await iterator.close();
    return JSON.stringify(results);
  }

  async getTransactionBySender(ctx, senderAccount) {
    const allResults = await this.getAllTransactions(ctx);
    const parsed = JSON.parse(allResults);
    const filtered = parsed.filter(t => t.senderAccount === senderAccount);
    return JSON.stringify(filtered);
  }

  async transactionExists(ctx, txnId) {
    const data = await ctx.stub.getState(txnId);
    return JSON.stringify(data && data.length > 0);
  }
}

module.exports = AuditLedger;
