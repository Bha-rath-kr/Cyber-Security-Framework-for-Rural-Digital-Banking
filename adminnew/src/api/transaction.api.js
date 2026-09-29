import api from "./axios";

export const getAllTransactions = (page = 1, limit = 10, filters = {}) => {
  const params = new URLSearchParams({ page, limit });
  if (filters.search) params.append("search", filters.search);
  if (filters.type) params.append("type", filters.type);
  if (filters.status) params.append("status", filters.status);
  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  return api.get(`/txns/admin/all?${params}`);
};

export const getScheduledTransactions = (page = 1, limit = 10, status, search) => {
  const params = new URLSearchParams({ page, limit });
  if (status) params.append("status", status);
  if (search) params.append("search", search);
  return api.get(`/admin/scheduled-transactions?${params}`);
};

export const processScheduledTransaction = (txnId, action) =>
  api.post(`/admin/scheduled-transactions/${txnId}/process`, { action });