import api from "./axios";

export const getFraudStats = () => api.get("/fraud/stats");
export const getFraudAlerts = () => api.get("/fraud/alerts");
export const freezeUser = (userId) => api.post("/fraud/freeze-user", { userId });
export const unfreezeUser = (accountNumber) => api.post("/fraud/unfreeze-user", { accountNumber });
export const escalateTransaction = (txnId) => api.post("/fraud/escalate", { txnId });
export const reportFraudAccount = ({ accountNumber, ifsc, reason }) =>
  api.post("/txns/report", { accountNumber, ifsc, reason });

// New interactive dashboard data APIs
export const getFlaggedUsers = () => api.get("/admin/flagged-users");
export const getSuspiciousTransactions = (params) => api.get("/admin/suspicious-transactions", { params });
export const getOpenComplaints = (page, limit, search) => api.get(`/admin/open-complaints?page=${page || 1}&limit=${limit || 20}${search ? `&search=${search}` : ""}`);

// Action APIs
export const freezeFlaggedUser = (id) => api.post(`/admin/flagged-users/${id}/freeze`);
export const unfreezeFlaggedUser = (id) => api.post(`/admin/flagged-users/${id}/unfreeze`);
export const markUserSafe = (id) => api.post(`/admin/flagged-users/${id}/mark-safe`);
export const approveTransaction = (id) => api.post(`/admin/suspicious-transactions/${id}/approve`);
export const cancelTransaction = (id, reason) => api.post(`/admin/suspicious-transactions/${id}/cancel`, { reason });
export const approveHoldTransaction = (id) => api.post(`/admin/scheduled-transactions/${id}/process`, { action: "approve" });
export const cancelHoldTransaction = (id) => api.post(`/admin/scheduled-transactions/${id}/process`, { action: "reject" });
export const investigateTransaction = (id) => api.post(`/admin/suspicious-transactions/${id}/investigate`);
export const investigateComplaint = (id, notes) => api.post(`/admin/open-complaints/${id}/investigate`, { notes });
export const clearComplaint = (id, notes) => api.post(`/admin/open-complaints/${id}/clear`, { notes });
export const markFraudComplaint = (id, notes) => api.post(`/admin/open-complaints/${id}/mark-fraud`, { notes });
export const getUserTransactions = (id) => api.get(`/admin/flagged-users/${id}/transactions`);
export const reviewFraudAlert = (alertId, reviewedBy) => api.put(`/fraud/alerts/${alertId}/review`, { reviewedBy });
export const markSafeAlert = (alertId, reviewedBy) => api.put(`/fraud/alerts/${alertId}/mark-safe`, { reviewedBy });
export const suspendAlert = (alertId, reviewedBy, reason) => api.put(`/fraud/alerts/${alertId}/suspend`, { reviewedBy, reason });
export const blockAlert = (alertId, reviewedBy, reason) => api.put(`/fraud/alerts/${alertId}/block`, { reviewedBy, reason });
export const unfreezeAlert = (alertId, reviewedBy) => api.put(`/fraud/alerts/${alertId}/unfreeze`, { reviewedBy });

// New visibility endpoints
export const getUnderInvestigationUsers = (page, limit, search) => api.get(`/admin/under-investigation?page=${page || 1}&limit=${limit || 20}${search ? `&search=${search}` : ""}`);
export const getTempFrozenUsers = (page, limit) => api.get(`/admin/temp-frozen?page=${page || 1}&limit=${limit || 20}`);
export const getHoldForReviewTxns = (page, limit, search) => api.get(`/admin/hold-for-review?page=${page || 1}&limit=${limit || 20}${search ? `&search=${search}` : ""}`);
export const getSuspiciousTxnStats = () => api.get("/admin/suspicious-transactions/stats");

// Paginated fraud endpoints
export const getFraudAccountsListPaginated = (page, limit, search) => api.get(`/admin/fraud-accounts?page=${page || 1}&limit=${limit || 20}${search ? `&search=${search}` : ""}`);
export const getFlaggedUsersPaginated = (page, limit, status, search) => api.get(`/admin/flagged-users?page=${page || 1}&limit=${limit || 20}${status ? `&status=${status}` : ""}${search ? `&search=${search}` : ""}`);
export const getSuspiciousTransactionsPaginated = (page, limit, status, search, dateFrom, dateTo) => {
  let url = `/admin/suspicious-transactions?page=${page || 1}&limit=${limit || 20}`;
  if (status) url += `&status=${status}`;
  if (search) url += `&search=${search}`;
  if (dateFrom) url += `&dateFrom=${dateFrom}`;
  if (dateTo) url += `&dateTo=${dateTo}`;
  return api.get(url);
};
export const getOpenComplaintsPaginated = (page, limit, search) => api.get(`/admin/open-complaints?page=${page || 1}&limit=${limit || 20}${search ? `&search=${search}` : ""}`);

// Archive endpoints
export const getArchivedTransactions = (page, limit, days) => api.get(`/admin/archive/transactions?page=${page || 1}&limit=${limit || 20}&days=${days || 90}`);
export const getArchivedScheduled = (page, limit, days) => api.get(`/admin/archive/scheduled?page=${page || 1}&limit=${limit || 20}&days=${days || 90}`);
export const getArchivedComplaints = (page, limit) => api.get(`/admin/archive/complaints?page=${page || 1}&limit=${limit || 20}`);
export const getArchivedFraudCases = (page, limit) => api.get(`/admin/archive/fraud-cases?page=${page || 1}&limit=${limit || 20}`);

// Cleanup + stats
export const cleanupTestData = () => api.post("/admin/cleanup-test-data");
export const getAdminStatsSummary = () => api.get("/admin/stats-summary");
