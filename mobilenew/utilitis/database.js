import * as SQLite from 'expo-sqlite';

const DB_NAME = 'grambank.db';

let db = null;
let initError = null;

export const initDatabase = async () => {
  if (db) return db;
  if (initError) throw initError;
  
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        retry_count INTEGER DEFAULT 0
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS transaction_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id TEXT UNIQUE,
        txn_id TEXT,
        type TEXT NOT NULL,
        to_account TEXT,
        to_upi TEXT,
        beneficiary_name TEXT,
        ifsc TEXT,
        amount REAL,
        status TEXT,
        is_synced INTEGER DEFAULT 0,
        created_at INTEGER,
        synced_at INTEGER
      );
    `);

    return db;
  } catch (error) {
    initError = error;
    console.error("Database init error:", error);
    throw error;
  }
};

export const getDatabase = () => db;

export const isDatabaseReady = () => db !== null;

export const addPendingTransaction = async (type, data) => {
  if (!db) {
    console.log("Database not ready, skipping addPendingTransaction");
    return null;
  }
  
  try {
    const result = await db.runAsync(
      'INSERT INTO pending_transactions (type, data) VALUES (?, ?)',
      [type, JSON.stringify(data)]
    );
    
    return result.lastInsertRowId;
  } catch (error) {
    console.error("Add pending transaction error:", error);
    return null;
  }
};

export const getPendingTransactions = async () => {
  if (!db) return [];
  
  try {
    const rows = await db.getAllAsync(
      'SELECT * FROM pending_transactions WHERE status = ? ORDER BY created_at ASC',
      ['pending']
    );
    
    return rows.map(row => ({
      ...row,
      data: JSON.parse(row.data)
    }));
  } catch (error) {
    console.error("Get pending transactions error:", error);
    return [];
  }
};

export const updateTransactionStatus = async (id, status) => {
  if (!db) return;
  
  try {
    await db.runAsync(
      'UPDATE pending_transactions SET status = ? WHERE id = ?',
      [status, id]
    );
  } catch (error) {
    console.error("Update transaction status error:", error);
  }
};

export const incrementRetryCount = async (id) => {
  if (!db) return;
  
  try {
    await db.runAsync(
      'UPDATE pending_transactions SET retry_count = retry_count + 1 WHERE id = ?',
      [id]
    );
  } catch (error) {
    console.error("Increment retry count error:", error);
  }
};

export const addToTransactionHistory = async (localId, txnData, txnId, status, isSynced = 0) => {
  if (!db) return;
  
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO transaction_history 
       (local_id, txn_id, type, to_account, to_upi, beneficiary_name, ifsc, amount, status, is_synced, created_at, synced_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        localId,
        txnId || null,
        txnData.type,
        txnData.to_account || null,
        txnData.to_upi || null,
        txnData.beneficiary_name || null,
        txnData.ifsc || null,
        txnData.amount,
        status,
        isSynced,
        txnData.created_at || Math.floor(Date.now() / 1000),
        isSynced ? Math.floor(Date.now() / 1000) : null
      ]
    );
  } catch (error) {
    console.error("Add to transaction history error:", error);
  }
};

export const getUnsyncedTransactions = async () => {
  if (!db) return [];
  
  try {
    const rows = await db.getAllAsync(
      'SELECT * FROM transaction_history WHERE is_synced = 0'
    );
    
    return rows;
  } catch (error) {
    console.error("Get unsynced transactions error:", error);
    return [];
  }
};

export const markTransactionSynced = async (localId, txnId) => {
  if (!db) return;
  
  try {
    await db.runAsync(
      'UPDATE transaction_history SET is_synced = 1, txn_id = ?, synced_at = ? WHERE local_id = ?',
      [txnId, Math.floor(Date.now() / 1000), localId]
    );
  } catch (error) {
    console.error("Mark transaction synced error:", error);
  }
};