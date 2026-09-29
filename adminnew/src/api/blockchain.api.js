import api from "./axios";

export const getBlockchainStatus = () => api.get("/blockchain/status");
export const getBlockchainTransactions = (params = {}) => api.get("/blockchain/transactions", { params });
export const getBlockchainTransaction = (txnId) => api.get(`/blockchain/transaction/${txnId}`);
export const verifyBlockchainTransaction = (txnId) => api.get(`/blockchain/verify/${txnId}`);
