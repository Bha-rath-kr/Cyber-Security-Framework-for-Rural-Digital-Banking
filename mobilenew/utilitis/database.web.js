// Web fallback for database.js (since expo-sqlite is native only)
let inMemoryPending = [];
let inMemoryHistory = [];

export const initDatabase = async () => {
  return true;
};

export const getDatabase = () => ({});
export const isDatabaseReady = () => true;

export const addPendingTransaction = async (type, data) => {
  const id = Date.now();
  inMemoryPending.push({ id, type, data: JSON.stringify(data), status: 'pending', created_at: Math.floor(Date.now() / 1000), retry_count: 0 });
  return id;
};

export const getPendingTransactions = async () => {
  return inMemoryPending.filter(t => t.status === 'pending').map(row => ({
    ...row,
    data: JSON.parse(row.data)
  }));
};

export const updateTransactionStatus = async (id, status) => {
  const item = inMemoryPending.find(t => t.id === id);
  if (item) item.status = status;
};

export const incrementRetryCount = async (id) => {
  const item = inMemoryPending.find(t => t.id === id);
  if (item) item.retry_count = (item.retry_count || 0) + 1;
};

export const addToTransactionHistory = async (localId, txnData, txnId, status, isSynced = 0) => {
  inMemoryHistory.push({
    local_id: localId,
    txn_id: txnId || null,
    type: txnData.type,
    to_account: txnData.to_account || null,
    to_upi: txnData.to_upi || null,
    beneficiary_name: txnData.beneficiary_name || null,
    ifsc: txnData.ifsc || null,
    amount: txnData.amount,
    status,
    is_synced: isSynced,
    created_at: txnData.created_at || Math.floor(Date.now() / 1000),
    synced_at: isSynced ? Math.floor(Date.now() / 1000) : null
  });
};

export const getUnsyncedTransactions = async () => {
  return inMemoryHistory.filter(t => t.is_synced === 0);
};

export const markTransactionSynced = async (localId, txnId) => {
  const item = inMemoryHistory.find(t => t.local_id === localId);
  if (item) {
    item.is_synced = 1;
    item.txn_id = txnId;
    item.synced_at = Math.floor(Date.now() / 1000);
  }
};
