import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { api_url } from '../config';
import { 
  initDatabase, 
  addPendingTransaction, 
  getPendingTransactions, 
  updateTransactionStatus,
  incrementRetryCount,
  addToTransactionHistory,
  isDatabaseReady
} from './database';
import { checkConnection } from './network';

let isSyncing = false;
let syncCallback = null;
let dbInitialized = false;

export const setSyncCallback = (callback) => {
  syncCallback = callback;
};

const notifySync = (pending, synced) => {
  if (syncCallback) {
    syncCallback({ pending, synced });
  }
};

export const initOfflineQueue = async () => {
  try {
    await initDatabase();
    dbInitialized = true;
  } catch (error) {
    console.log("Database init failed, continuing without offline support:", error);
    dbInitialized = false;
  }
  await checkConnection();
};

export const queueTransaction = async (type, data) => {
  try {
    if (!dbInitialized) {
      const err = new Error("Database not initialized");
      err.code = "DB_NOT_INITIALIZED";
      throw err;
    }

    const localId = uuidv4();
    const transactionData = {
      ...data,
      localId,
      type,
      created_at: Math.floor(Date.now() / 1000)
    };

    await addPendingTransaction(type, transactionData);
    await addToTransactionHistory(localId, transactionData, null, 'pending', 0);

    return localId;
  } catch (error) {
    console.error("queueTransaction error:", error);
    throw error;
  }
};

export const processQueue = async () => {
  if (isSyncing) return;
  if (!await checkConnection()) return;
  if (!dbInitialized) return;
  
  isSyncing = true;
  
  try {
    const pending = await getPendingTransactions();
    
    for (const item of pending) {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          await updateTransactionStatus(item.id, 'failed');
          continue;
        }
        
        let endpoint = '';
        let payload = { ...item.data };
        delete payload.localId;
        delete payload.type;
        delete payload.created_at;
        
        if (item.type === 'bank_transfer') {
          endpoint = '/txns/send';
        } else if (item.type === 'upi_payment') {
          endpoint = '/txns/upi/send';
        }
        
        const res = await axios.post(`${api_url}${endpoint}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.data && res.data.txn_id) {
          await addToTransactionHistory(
            item.data.localId,
            item.data,
            res.data.txn_id,
            'completed',
            1
          );
          await updateTransactionStatus(item.id, 'completed');
        } else {
          await addToTransactionHistory(
            item.data.localId,
            item.data,
            null,
            'failed',
            0
          );
          await updateTransactionStatus(item.id, 'failed');
        }
      } catch (error) {
        console.error('Failed to sync transaction:', error);
        item.retry_count += 1;
        await incrementRetryCount(item.id);
        if (item.retry_count >= 3) {
          await addToTransactionHistory(
            item.data.localId,
            item.data,
            null,
            'failed',
            0
          );
          await updateTransactionStatus(item.id, 'failed');
        }
      }
    }
    
    const updatedPending = await getPendingTransactions();
    notifySync(updatedPending.length, pending.length - updatedPending.length);
  } catch (error) {
    console.error("processQueue error:", error);
  } finally {
    isSyncing = false;
  }
};

export const checkPendingCount = async () => {
  if (!dbInitialized) return 0;
  
  try {
    const pending = await getPendingTransactions();
    return pending.length;
  } catch (error) {
    return 0;
  }
};