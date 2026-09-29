import api from "./axios";

export const getAllUsers = (page = 1, limit = 10, filters = {}) => {
  const params = new URLSearchParams({ page, limit });
  if (filters.search) params.append("search", filters.search);
  if (filters.status) params.append("status", filters.status);
  if (filters.flagged) params.append("flagged", filters.flagged);
  return api.get(`/users/admin/all-users?${params}`);
};

export const getUserTransactions = (userId) =>
  api.get(`/txns/admin/user/${userId}`);

export const freezeUser = (userId) =>
  api.post(`/users/admin/freeze/${userId}`);

export const unfreezeUser = (userId) =>
  api.post(`/users/admin/unfreeze/${userId}`);

export const addBalanceToUser = ({ userId, amount, reason }) =>
  api.post(`/users/admin/add-balance/${userId}`, { amount, reason });