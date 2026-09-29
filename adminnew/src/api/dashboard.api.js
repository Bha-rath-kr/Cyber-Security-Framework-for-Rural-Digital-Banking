import api from "./axios";

export const getDashboardStats = () =>
  api.get("/dashboard/stats");

export const getTransactionChart = () =>
  api.get("/dashboard/transactions-7days");

export const getCreditDebitStats = () =>
  api.get("/dashboard/credit-debit");

export const getAdminStatsSummary = () =>
  api.get("/admin/stats-summary");

export const getLiveChats = (page = 1, limit = 20) =>
  api.get(`/live-chat/admin/all-chats?page=${page}&limit=${limit}`);

export const getChatMessages = (userId) =>
  api.get(`/live-chat/admin/user/${userId}/messages`);

export const sendChatMessage = (userId, message) =>
  api.post(`/live-chat/admin/user/${userId}/message`, { message });