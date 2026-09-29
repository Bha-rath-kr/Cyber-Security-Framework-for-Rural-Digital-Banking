const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { generateTransactionHash } = require('./hashUtils');

let fabricEnabled = false;
let gateway = null;
let network = null;
let contract = null;

const CHANNEL_NAME = 'grambankchannel';
const CHAINCODE_NAME = 'auditcc';

async function connectToFabric() {
  const enabled = process.env.FABRIC_ENABLED === 'true';
  if (!enabled) {
    console.log('[FABRIC] Fabric integration is disabled (set FABRIC_ENABLED=true to enable)');
    return false;
  }

  try {
    const { Gateway, Wallets } = require('fabric-network');
    const walletPath = path.join(__dirname, 'wallet');
    const ccpPath = path.join(__dirname, 'config', 'connection-profile.json');

    if (!fs.existsSync(ccpPath)) {
      throw new Error(`Connection profile not found at ${ccpPath}`);
    }

    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    let wallet;
    if (fs.existsSync(walletPath)) {
      wallet = await Wallets.newFileSystemWallet(walletPath);
    } else {
      wallet = await Wallets.newInMemoryWallet();
    }

    const adminExists = await wallet.get('admin');
    if (!adminExists) {
      console.log('[FABRIC] Admin identity not found in wallet. Loading from cryptogen output...');
      const adminMspPath = path.join(__dirname, '..', 'fabric', 'crypto-config', 'peerOrganizations', 'grambank.com', 'users', 'Admin@grambank.com', 'msp');
      const certPath = path.join(adminMspPath, 'signcerts', 'Admin@grambank.com-cert.pem');
      const keyPath = path.join(adminMspPath, 'keystore', 'priv_sk');
      if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        throw new Error(`Cryptogen admin identity not found at ${adminMspPath}`);
      }
      const certificate = fs.readFileSync(certPath, 'utf8');
      const privateKey = fs.readFileSync(keyPath, 'utf8');
      const identity = {
        credentials: { certificate, privateKey },
        mspId: 'GramBankMSP',
        type: 'X.509',
      };
      await wallet.put('admin', identity);
      console.log('[FABRIC] Admin identity loaded from cryptogen and stored in wallet');
    }

    gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: 'admin',
      discovery: { enabled: false, asLocalhost: true },
    });

    network = await gateway.getNetwork(CHANNEL_NAME);
    contract = network.getContract(CHAINCODE_NAME);

    fabricEnabled = true;
    console.log('[FABRIC] Connected to Hyperledger Fabric network');
    return true;
  } catch (err) {
    console.warn('[FABRIC] Failed to connect to Fabric network:', err.message);
    console.warn('[FABRIC] Transactions will proceed without blockchain storage');
    fabricEnabled = false;
    return false;
  }
}

async function storeTransactionOnBlockchain(transactionData) {
  if (!fabricEnabled) {
    console.log('[FABRIC] Blockchain disabled — skipping storage');
    return { stored: false, reason: 'Fabric not connected' };
  }

  const startTime = Date.now();

  try {
    const { txnId, senderAccount, receiverAccount, amount, fraudDecision } = transactionData;
    const timestamp = new Date().toISOString();
    const transactionHash = generateTransactionHash({
      txnId,
      senderAccount,
      receiverAccount,
      amount,
      timestamp
    });

    const txnData = {
      txnId,
      senderAccount,
      receiverAccount,
      amount: Number(amount),
      timestamp,
      status: 'SUCCESS',
      fraudDecision: fraudDecision || 'SAFE',
      transactionHash
    };

    await contract.submitTransaction(
      'createTransaction',
      txnId,
      JSON.stringify(txnData)
    );

    const duration = Date.now() - startTime;
    console.log(`[FABRIC] Transaction ${txnId} stored on blockchain (${duration}ms)`);
    console.log(`[FABRIC] Hash: ${transactionHash}`);

    return {
      stored: true,
      blockchainTxnId: txnId,
      blockchainHash: transactionHash
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[FABRIC] Failed to store transaction on blockchain (${duration}ms):`, err.message);
    return { stored: false, reason: err.message };
  }
}

async function queryTransactionFromBlockchain(txnId) {
  if (!fabricEnabled || !contract) {
    throw new Error('Fabric not connected');
  }

  const result = await contract.evaluateTransaction('queryTransaction', txnId);
  return JSON.parse(result.toString());
}

async function getAllBlockchainTransactions() {
  if (!fabricEnabled || !contract) {
    throw new Error('Fabric not connected');
  }

  const result = await contract.evaluateTransaction('getAllTransactions');
  return JSON.parse(result.toString());
}

async function getBlockchainStatus() {
  return {
    enabled: fabricEnabled,
    connected: fabricEnabled && gateway !== null,
    channel: CHANNEL_NAME,
    chaincode: CHAINCODE_NAME
  };
}

async function disconnectFromFabric() {
  if (gateway) {
    try {
      gateway.disconnect();
    } catch (err) {
      console.error('[FABRIC] Error disconnecting:', err.message);
    }
    gateway = null;
    network = null;
    contract = null;
    fabricEnabled = false;
    console.log('[FABRIC] Disconnected from Fabric network');
  }
}

module.exports = {
  connectToFabric,
  storeTransactionOnBlockchain,
  queryTransactionFromBlockchain,
  getAllBlockchainTransactions,
  getBlockchainStatus,
  disconnectFromFabric
};
