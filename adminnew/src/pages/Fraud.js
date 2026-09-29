import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Shield, Search, Ban, UserCheck,
  FileText, Eye, Snowflake, ShieldCheck,
  CheckCircle, XCircle, SearchIcon, Clock,
  Users, Skull
} from "lucide-react";

import {
  getFraudStats,
  unfreezeUser,
  getSuspiciousTransactions,
  getOpenComplaints, freezeFlaggedUser, markUserSafe,
  approveTransaction, cancelTransaction, investigateTransaction,
  investigateComplaint, clearComplaint, markFraudComplaint,
  getUserTransactions,
  getUnderInvestigationUsers, getHoldForReviewTxns, getSuspiciousTxnStats,
  getFraudAccountsListPaginated,
  approveHoldTransaction, cancelHoldTransaction
} from "../api/fraud.api";
import { formatINR } from "../utils/formatCurrency";
import Pagination from "../components/Pagination";

const sectionMeta = {
  suspicious:     { label: "Suspicious Transactions", icon: Shield,   color: "gray",   desc: "Transactions detected as risky" },
  investigation:  { label: "Under Investigation",  icon: Users,       color: "purple", desc: "Accounts/users under admin review" },
  complaints:     { label: "Open Complaints",      icon: FileText,    color: "blue",   desc: "User-reported fraud complaints" },
  hold:           { label: "Hold for Review",      icon: Clock,       color: "orange", desc: "Delayed transactions pending review" },
  confirmedFraud: { label: "Confirmed Fraud",      icon: Skull,       color: "red",    desc: "Accounts confirmed fraudulent" },
  blacklisted:    { label: "Blacklisted Accounts", icon: Ban,         color: "slate",  desc: "Known fraud accounts permanently blacklisted" },
};

export default function Fraud() {
  const [stats, setStats] = useState({ suspiciousTransactions: 0 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [txnStats, setTxnStats] = useState({ confirmedFraud: 0 });

  const [investigationCount, setInvestigationCount] = useState(0);
  const [holdCount, setHoldCount] = useState(0);
  const [complaintCount, setComplaintCount] = useState(0);

  const [activeSection, setActiveSection] = useState(null);
  const [detailData, setDetailData] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [txHistory, setTxHistory] = useState([]);
  const [txHistoryOpen, setTxHistoryOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [riskPopup, setRiskPopup] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => { loadFraudData(); }, []);

  const loadSectionData = useCallback(async () => {
    const section = activeSection;
    if (!section) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      let res;
      const searchParam = search || undefined;
      switch (section) {
        case "suspicious":
          res = await getSuspiciousTransactions({ page, limit: perPage, search: searchParam });
          setDetailData(res.data.transactions || []);
          setTotal(res.data.total || 0);
          setTotalPages(res.data.totalPages || 1);
          break;
        case "complaints":
          res = await getOpenComplaints(page, perPage, searchParam);
          setDetailData(res.data.complaints || []);
          setTotal(res.data.total || 0);
          setTotalPages(res.data.totalPages || 1);
          break;
        case "investigation":
          res = await getUnderInvestigationUsers(page, perPage, searchParam);
          setDetailData(res.data.users || []);
          setTotal(res.data.total || 0);
          setTotalPages(res.data.totalPages || 1);
          break;
        case "hold":
          res = await getHoldForReviewTxns(page, perPage, searchParam);
          setDetailData(res.data.transactions || []);
          setTotal(res.data.total || 0);
          setTotalPages(res.data.totalPages || 1);
          break;
        case "confirmedFraud":
          res = await getSuspiciousTransactions({ page, limit: perPage, status: "fraud", search: searchParam });
          setDetailData(res.data.transactions || []);
          setTotal(res.data.total || 0);
          setTotalPages(res.data.totalPages || 1);
          break;
        case "blacklisted":
          res = await getFraudAccountsListPaginated(page, perPage, searchParam);
          setDetailData(res.data.accounts || []);
          setTotal(res.data.total || 0);
          setTotalPages(res.data.totalPages || 1);
          break;
      }
    } catch (err) {
      console.error("Section load error", err);
      setDetailError(err.response?.data?.error || err.message || "Failed to load data");
      setDetailData([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setDetailLoading(false);
    }
  }, [activeSection, page, perPage, search]);

  useEffect(() => {
    if (activeSection) loadSectionData();
  }, [activeSection, page, perPage, search, loadSectionData]);

  const loadFraudData = async () => {
    try {
      setLoading(true); setError(null);
      const [statsRes, investRes, holdRes, txnStatsRes] = await Promise.all([
        getFraudStats(),
        getUnderInvestigationUsers(), getHoldForReviewTxns(), getSuspiciousTxnStats()
      ]);
      setStats(statsRes.data || { suspiciousTransactions: 0 });
      setInvestigationCount(investRes.data?.total || 0);
      setHoldCount(holdRes.data?.total || 0);
      setComplaintCount(statsRes.data?.complaints?.pending || 0);
      if (txnStatsRes.data?.stats) setTxnStats(txnStatsRes.data.stats);
    } catch (err) {
      console.error("Fraud load error", err);
      setError("Failed to load fraud data. Please try again.");
    } finally { setLoading(false); }
  };

  const refreshSection = useCallback((section) => {
    if (!section) return;
    loadSectionData();
  }, [loadSectionData]);

  const handleCardClick = (section) => {
    if (activeSection === section) { setActiveSection(null); return; }
    setPage(1);
    setActiveSection(section);
  };

  const handleAction = async (fn, ...args) => {
    try {
      await fn(...args);
      setSuccessMsg({ text: "Action completed successfully", type: "success" });
      setTimeout(() => setSuccessMsg(null), 3000);
      await Promise.all([loadFraudData(), refreshSection(activeSection)]);
    } catch (err) {
      const msg = err.response?.data?.error || "Action failed";
      setSuccessMsg({ text: msg, type: "error" });
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const handleHoldApprove = (id) => handleAction(approveHoldTransaction, id);
  const handleHoldCancel = (id) => handleAction(cancelHoldTransaction, id);

  const handleUnfreeze = async (accountNumber) => {
    try {
      await unfreezeUser(accountNumber);
      setSuccessMsg({ text: "Account unfrozen successfully", type: "success" });
      setTimeout(() => setSuccessMsg(null), 3000);
      await Promise.all([loadFraudData(), refreshSection(activeSection)]);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to unfreeze account");
    }
  };

  const handleViewTxHistory = async (userId) => {
    try {
      const res = await getUserTransactions(userId);
      setTxHistory(res.data.transactions || []);
      setTxHistoryOpen(true);
    } catch (err) { alert("Failed to load transaction history"); }
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const cardValue = (key) => {
    switch (key) {
      case "suspicious": return stats.suspiciousTransactions;
      case "investigation": return investigationCount;
      case "complaints": return complaintCount;
      case "hold": return holdCount;
      case "confirmedFraud": return txnStats.confirmedFraud || 0;
      case "blacklisted": return stats.highRisk || 0;
      default: return 0;
    }
  };

  if (loading) return <div className="p-6">Loading fraud data...</div>;

  if (error) return (
    <div className="text-red-500 p-4 rounded-lg bg-red-50 border border-red-200">
      {error}
      <button onClick={loadFraudData} className="ml-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Retry</button>
    </div>
  );

  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Fraud Management</h1>
      <p className="text-muted mb-6">Monitor flagged users, suspicious activity, complaints, and blacklisted accounts</p>

      {successMsg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
          successMsg.type === "success"
            ? "bg-green-100 text-green-700 border border-green-200"
            : "bg-red-100 text-red-700 border border-red-200"
        }`}>
          {successMsg.text}
        </div>
      )}

      {/* 6 Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {Object.entries(sectionMeta).map(([key, meta]) => (
          <Card key={key} onClick={() => handleCardClick(key)} active={activeSection === key}>
            <Stat icon={meta.icon} title={meta.label} value={cardValue(key)} color={meta.color} desc={meta.desc} />
          </Card>
        ))}
      </div>

      {/* Active Section Detail */}
      {activeSection && (
        <div className="mb-6 bg-card dark:bg-darkcard rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{sectionMeta[activeSection]?.label}</h2>
              <p className="text-xs text-muted">{sectionMeta[activeSection]?.desc}</p>
            </div>
            <button onClick={() => setActiveSection(null)} className="text-sm text-muted hover:text-red-500">Close</button>
          </div>

          {/* Search within active section */}
          <div className="mb-4 max-w-sm">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={handleSearchChange}
                placeholder="Search..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          {detailError && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm">
              {detailError}
            </div>
          )}

          {detailLoading ? (
            <div className="text-center py-8 text-muted">Loading...</div>
          ) : detailData.length === 0 ? (
            <div className="text-center py-8 text-muted">No records found{search ? " matching your search" : ""}</div>
          ) : (
            <>
              {activeSection === "suspicious" && <SuspiciousTxnsTable data={detailData} onAction={handleAction} onRiskClick={setRiskPopup} />}
              {activeSection === "complaints" && <ComplaintsTable data={detailData} onAction={handleAction} />}
              {activeSection === "investigation" && <InvestigationTable data={detailData} onAction={handleAction} onViewTx={handleViewTxHistory} />}
              {activeSection === "hold" && <HoldReviewTable data={detailData} onApprove={handleHoldApprove} onCancel={handleHoldCancel} />}
              {activeSection === "confirmedFraud" && <ConfirmedFraudTable data={detailData} onAction={handleAction} />}
              {activeSection === "blacklisted" && <BlacklistedAccountsTable data={detailData} onAction={handleUnfreeze} />}
              <Pagination
                page={page}
                perPage={perPage}
                total={total}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
                onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
              />
            </>
          )}
        </div>
      )}

      {riskPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRiskPopup(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">Fraud Risk Breakdown</h2>
            <p className="text-xs text-muted mb-4">Transaction {riskPopup.txn_id?.substring(0, 16)}</p>

            {/* Risk Breakdown Table */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted px-1 mb-1">
                <span>Risk Factor</span>
                <span>Points</span>
              </div>
              <div className="space-y-1">
                {(riskPopup.riskBreakdown || []).map((f, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-sm font-mono text-xs">{f.name}</span>
                    <span className="text-sm font-bold text-red-600">+{f.points}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total + Divider */}
            <div className="border-t border-gray-200 dark:border-gray-600 pt-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Total Risk Score</span>
                <span className={`text-xl font-bold ${riskPopup.risk_score >= 60 ? "text-red-600" : riskPopup.risk_score >= 30 ? "text-yellow-600" : "text-green-600"}`}>
                  {riskPopup.risk_score.toFixed(0)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">Amount</span>
                <span className="font-semibold">{formatINR(riskPopup.amount)}</span>
              </div>

              {riskPopup.anomalyScore != null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">Anomaly Level</span>
                  <span className={`font-semibold ${riskPopup.anomalyScore > 0.85 ? "text-red-600" : riskPopup.anomalyScore > 0.7 ? "text-yellow-600" : "text-green-600"}`}>
                    {riskPopup.anomalyScore > 0.85 ? "HIGH" : riskPopup.anomalyScore > 0.7 ? "MEDIUM" : "LOW"}
                    <span className="text-xs text-muted ml-1">({(riskPopup.anomalyScore * 100).toFixed(0)}%)</span>
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">Decision</span>
                <span className={`font-semibold px-2 py-0.5 rounded text-xs ${
                  riskPopup.decision === "TEMP_FREEZE" ? "bg-red-100 text-red-700" :
                  riskPopup.decision === "HOLD_FOR_REVIEW" ? "bg-orange-100 text-orange-700" :
                  riskPopup.decision === "WARNING" ? "bg-yellow-100 text-yellow-700" :
                  "bg-green-100 text-green-700"
                }`}>
                  {riskPopup.decision === "HOLD_FOR_REVIEW" ? "HOLD FOR REVIEW" : riskPopup.decision}
                </span>
              </div>
            </div>

            <button onClick={() => setRiskPopup(null)} className="mt-4 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
          </div>
        </div>
      )}

      {txHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setTxHistoryOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-3xl w-full mx-4 shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
            {txHistory.length === 0 ? <p className="text-muted text-center py-6">No transactions found</p> : (
              <table className="table w-full">
                <thead><tr>
                  <th className="th">Txn ID</th><th className="th">Type</th><th className="th">Amount</th>
                  <th className="th">To Account</th><th className="th">Date</th>
                </tr></thead>
                <tbody>{txHistory.map(tx => (
                  <tr key={tx._id}>
                    <td className="td font-mono text-xs">{tx.txn_id?.substring(0, 16)}</td>
                    <td className="td"><span className={`badge ${tx.type === "DEBIT" ? "badge-red" : "badge-green"}`}>{tx.type}</span></td>
                    <td className="td font-semibold">{formatINR(tx.amount)}</td>
                    <td className="td text-sm">{tx.to_account || tx.to_upi || "N/A"}</td>
                    <td className="td text-xs text-muted">{new Date(tx.createdAt).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <button onClick={() => setTxHistoryOpen(false)} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ===== Card Wrapper ===== */
function Card({ onClick, active, children }) {
  return (
    <div onClick={onClick}
      className={`cursor-pointer transition-all rounded-xl ${active ? "ring-2 ring-red-500 scale-[1.02]" : "hover:scale-[1.02]"}`}>
      {children}
    </div>
  );
}

/* ===== Stat Card ===== */
function Stat({ icon: Icon, title, value, color, desc }) {
  const styles = {
    red: "bg-red-100 text-red-600", yellow: "bg-yellow-100 text-yellow-600",
    gray: "bg-gray-100 text-gray-700", blue: "bg-blue-100 text-blue-600",
    purple: "bg-purple-100 text-purple-600", teal: "bg-teal-100 text-teal-600",
    orange: "bg-orange-100 text-orange-600", rose: "bg-rose-100 text-rose-600",
    amber: "bg-amber-100 text-amber-600", slate: "bg-slate-100 text-slate-600"
  };
  return (
    <div className="bg-card dark:bg-darkcard border rounded-xl p-5 flex gap-4 h-full">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${styles[color]}`}><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-xs text-muted truncate">{title}</p>
        <h2 className="text-2xl font-bold">{value}</h2>
        {desc && <p className="text-[10px] text-muted mt-0.5 leading-tight line-clamp-2">{desc}</p>}
      </div>
    </div>
  );
}

/* ============ Detail Tables ============ */

function SuspiciousTxnsTable({ data, onAction, onRiskClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[1200px]">
        <thead><tr>
          <th className="th">Txn ID</th><th className="th">Sender</th><th className="th">Receiver</th>
          <th className="th">Amount</th><th className="th">Anomaly</th><th className="th">Risk</th>
          <th className="th">Decision</th><th className="th">Timestamp</th>
          <th className="th text-right">Actions</th>
        </tr></thead>
        <tbody>{data.map(tx => (
          <tr key={tx._id}>
            <td className="td font-mono text-xs">{tx.txn_id?.substring(0, 20)}</td>
            <td className="td"><div className="text-sm font-medium">{tx.user?.name || "N/A"}</div><div className="text-xs text-muted">{tx.from_account || tx.user?.accountNumber}</div></td>
            <td className="td text-sm">{tx.to_account || tx.to_upi || "N/A"}</td>
            <td className="td font-semibold">{formatINR(tx.amount)}</td>
            <td className="td text-xs">{tx.anomalyScore ? (tx.anomalyScore * 100).toFixed(0) + "%" : "N/A"}</td>
            <td className="td">
              <span onClick={() => onRiskClick(tx)} className={`badge cursor-pointer ${(tx.risk_score || 0) >= 60 ? "badge-red" : (tx.risk_score || 0) >= 30 ? "badge-yellow" : "badge-green"}`}>{(tx.risk_score || 0).toFixed(2)}</span>
            </td>
            <td className="td">
              <span className={`badge ${tx.is_fraud ? "badge-red" : tx.is_suspicious ? "badge-yellow" : "badge-green"}`}>
                {tx.is_fraud ? "FRAUD" : tx.is_suspicious ? "SUSPICIOUS" : "SAFE"}
              </span>
            </td>
            <td className="td text-xs text-muted">{new Date(tx.createdAt).toLocaleString()}</td>
            <td className="td text-right space-x-1 whitespace-nowrap">
              <button onClick={() => onAction(approveTransaction, tx._id)} className="badge badge-green" title="Approve"><CheckCircle size={14} /></button>
              <button onClick={() => onAction(cancelTransaction, tx._id, "Cancelled by admin")} className="badge badge-red" title="Cancel"><XCircle size={14} /></button>
              <button onClick={() => onAction(investigateTransaction, tx._id)} className="badge badge-yellow" title="Investigate"><SearchIcon size={14} /></button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function ComplaintsTable({ data, onAction }) {
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[1100px]">
        <thead><tr>
          <th className="th">Complaint ID</th><th className="th">Reporter</th>
          <th className="th">Category</th><th className="th">Amount</th><th className="th">Status</th><th className="th">Created</th>
          <th className="th text-right">Actions</th>
        </tr></thead>
        <tbody>{data.map(c => (
          <tr key={c._id}>
            <td className="td font-mono text-xs">{c.complaintId?.substring(0, 12)}</td>
            <td className="td"><div className="text-sm">{c.reporter?.name || "N/A"}</div><div className="text-xs text-muted">{c.reporter?.accountNumber}</div></td>
            <td className="td"><span className="badge badge-blue">{c.category || "N/A"}</span></td>
            <td className="td font-semibold">{formatINR(c.amount)}</td>
            <td className="td"><span className={`badge ${
              c.status === "PENDING" ? "badge-yellow" :
              c.status === "UNDER_REVIEW" || c.status === "ACCEPTED" ? "badge-blue" :
              c.status === "INVESTIGATING" ? "badge-blue" :
              c.status === "CLEARED" || c.status === "RESOLVED" ? "badge-green" :
              c.status === "FRAUD_CONFIRMED" || c.status === "MARKED_FRAUD" ? "badge-red" :
              "badge-red"
            }`}>{c.status}</span></td>
            <td className="td text-xs text-muted">{new Date(c.createdAt).toLocaleDateString()}</td>
            <td className="td text-right space-x-1 whitespace-nowrap">
              <button onClick={() => onAction(investigateComplaint, c._id, "Investigation started")} className="badge badge-yellow" title="Investigate"><SearchIcon size={14} /></button>
              <button onClick={() => onAction(clearComplaint, c._id, "Cleared - no fraud found")} className="badge badge-green" title="Clear"><ShieldCheck size={14} /></button>
              <button onClick={() => onAction(markFraudComplaint, c._id, "Fraud confirmed")} className="badge badge-red" title="Mark Fraud"><Ban size={14} /></button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function InvestigationTable({ data, onAction, onViewTx }) {
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[1200px]">
        <thead><tr>
          <th className="th">Complaint ID</th><th className="th">Reported User</th><th className="th">Account</th>
          <th className="th">Phone</th><th className="th">Investigation Status</th><th className="th">Complaint Status</th>
          <th className="th">Started</th><th className="th text-right">Actions</th>
        </tr></thead>
        <tbody>{data.map(inv => {
          const user = inv.reportedUser || {};
          const userId = user.userId || (inv.complaintRef && inv.complaintRef.reported?.user_id);
          return (
            <tr key={inv._id}>
              <td className="td font-mono text-xs">{inv.complaintId || "N/A"}</td>
              <td className="td"><div className="text-sm font-medium">{user.name || "N/A"}</div></td>
              <td className="td font-mono text-sm">{user.accountNumber || "N/A"}</td>
              <td className="td text-sm">{user.phoneNumber || "N/A"}</td>
              <td className="td"><span className="badge badge-yellow">{inv.status}</span></td>
              <td className="td"><span className={`badge ${inv.complaintStatus === "INVESTIGATING" ? "badge-yellow" : "badge-blue"}`}>{inv.complaintStatus || "N/A"}</span></td>
              <td className="td text-xs text-muted">{inv.startedAt ? new Date(inv.startedAt).toLocaleDateString() : "N/A"}</td>
              <td className="td text-right space-x-1 whitespace-nowrap">
                <button onClick={() => userId && onViewTx(userId)} className="badge badge-blue" title="View Transactions"><Eye size={14} /></button>
                <button onClick={() => userId && onAction(freezeFlaggedUser, userId)} className="badge badge-red" title="Freeze"><Snowflake size={14} /></button>
                <button onClick={() => userId && onAction(markUserSafe, userId)} className="badge badge-yellow" title="Clear"><ShieldCheck size={14} /></button>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function HoldReviewTable({ data, onApprove, onCancel }) {
  const [breakdownTxn, setBreakdownTxn] = useState(null);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="table min-w-[1200px]">
          <thead><tr>
            <th className="th">Txn ID</th><th className="th">User</th><th className="th">Receiver</th>
            <th className="th">Amount</th><th className="th">Risk Score</th><th className="th">Auto Process</th>
            <th className="th text-right">Actions</th>
          </tr></thead>
          <tbody>{data.map(t => (
            <tr key={t._id}>
              <td className="td font-mono text-xs">{t.txn_id?.substring(0, 20)}</td>
              <td className="td"><div className="text-sm font-medium">{t.user?.name || "N/A"}</div><div className="text-xs text-muted">{t.user?.account}</div></td>
              <td className="td text-sm">{t.to_account || "N/A"}</td>
              <td className="td font-semibold">{formatINR(t.amount)}</td>
              <td className="td">
                <span onClick={() => setBreakdownTxn(t)}
                  className={`badge cursor-pointer ${(t.riskScore || 0) >= 60 ? "badge-red" : (t.riskScore || 0) >= 25 ? "badge-yellow" : "badge-green"}`}>
                  {(t.riskScore || 0).toFixed(0)}
                </span>
              </td>
              <td className="td text-xs text-muted">{t.auto_process_at ? new Date(t.auto_process_at).toLocaleString() : "N/A"}</td>
              <td className="td text-right space-x-1 whitespace-nowrap">
                <button onClick={() => onApprove(t._id)} className="badge badge-green" title="Approve"><CheckCircle size={14} /></button>
                <button onClick={() => onCancel(t._id)} className="badge badge-red" title="Cancel"><XCircle size={14} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {breakdownTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setBreakdownTxn(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">Fraud Risk Breakdown</h2>
            <p className="text-xs text-muted mb-4">Transaction {breakdownTxn.txn_id?.substring(0, 16)}</p>

            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted px-1 mb-1">
                <span>Risk Factor</span>
                <span>Points</span>
              </div>
              <div className="space-y-1">
                {(breakdownTxn.riskBreakdown || []).map((f, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-sm font-mono text-xs">{f.name}</span>
                    <span className="text-sm font-bold text-red-600">+{f.points}</span>
                  </div>
                ))}
                {(breakdownTxn.riskBreakdown || []).length === 0 && (
                  <div className="text-center py-4 text-muted text-sm">No risk factors recorded</div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-600 pt-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Total Risk Score</span>
                <span className={`text-xl font-bold ${(breakdownTxn.riskScore || 0) >= 60 ? "text-red-600" : (breakdownTxn.riskScore || 0) >= 25 ? "text-yellow-600" : "text-green-600"}`}>
                  {(breakdownTxn.riskScore || 0).toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">Decision</span>
                <span className="font-semibold px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                  {breakdownTxn.fraudDecision || "HOLD_FOR_REVIEW"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">Amount</span>
                <span className="font-semibold">{formatINR(breakdownTxn.amount)}</span>
              </div>
            </div>

            <button onClick={() => setBreakdownTxn(null)} className="mt-4 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
          </div>
        </div>
      )}
    </>
  );
}

function ConfirmedFraudTable({ data, onAction }) {
  const [expandedId, setExpandedId] = useState(null);
  if (data.length === 0) return <div className="text-center py-8 text-muted">No confirmed fraud transactions</div>;
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[1100px]">
        <thead><tr>
          <th className="th">Txn ID</th><th className="th">Sender</th><th className="th">Receiver</th>
          <th className="th">Amount</th><th className="th">Risk Score</th><th className="th">Date</th>
          <th className="th text-right">Actions</th>
        </tr></thead>
        <tbody>{data.map(tx => (
          <React.Fragment key={tx._id}>
            <tr>
              <td className="td font-mono text-xs">{tx.txn_id?.substring(0, 20)}</td>
              <td className="td"><div className="text-sm font-medium">{tx.user?.name || "N/A"}</div><div className="text-xs text-muted">{tx.from_account}</div></td>
              <td className="td text-sm">{tx.to_account || tx.to_upi || "N/A"}</td>
              <td className="td font-semibold">{formatINR(tx.amount)}</td>
              <td className="td">
                <span onClick={() => setExpandedId(expandedId === tx._id ? null : tx._id)}
                  className={`badge cursor-pointer ${(tx.risk_score || 0) >= 60 ? "badge-red" : "badge-yellow"}`}>
                  {(tx.risk_score || 0).toFixed(2)}
                </span>
              </td>
              <td className="td text-xs text-muted">{new Date(tx.createdAt).toLocaleDateString()}</td>
              <td className="td text-right space-x-1 whitespace-nowrap">
                <button onClick={() => onAction(approveTransaction, tx._id)} className="badge badge-green" title="Mark Safe"><ShieldCheck size={14} /></button>
                <button onClick={() => onAction(investigateTransaction, tx._id)} className="badge badge-yellow" title="Investigate"><SearchIcon size={14} /></button>
              </td>
            </tr>
            {expandedId === tx._id && (
              <tr>
                <td colSpan={7} className="td bg-gray-50 dark:bg-gray-800/50 p-4">
                  <div className="max-w-lg mx-auto">
                    <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Fraud Risk Details</h3>
                    <div className="space-y-1 mb-3">
                      {(tx.riskBreakdown || []).map((f, i) => (
                        <div key={i} className="flex justify-between items-center py-1 px-3 rounded bg-white dark:bg-gray-700/40">
                          <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{f.name}</span>
                          <span className="text-xs font-bold text-red-500">+{f.points}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-300 dark:border-gray-600 pt-2 space-y-1">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-sm font-semibold">Total Risk Score</span>
                        <span className={`text-base font-bold ${(tx.risk_score || 0) >= 60 ? "text-red-600" : (tx.risk_score || 0) >= 25 ? "text-yellow-600" : "text-green-600"}`}>
                          {tx.risk_score?.toFixed(0) || "0"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs text-muted">Decision</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          tx.decision === "TEMP_FREEZE" ? "bg-red-100 text-red-700" :
                          tx.decision === "HOLD_FOR_REVIEW" ? "bg-orange-100 text-orange-700" :
                          tx.decision === "WARNING" ? "bg-yellow-100 text-yellow-700" :
                          "bg-green-100 text-green-700"
                        }`}>
                          {tx.decision === "HOLD_FOR_REVIEW" ? "HOLD FOR REVIEW" : tx.decision || "FRAUD"}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}</tbody>
      </table>
    </div>
  );
}

function BlacklistedAccountsTable({ data, onAction }) {
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[900px]">
        <thead><tr>
          <th className="th">Account Number</th><th className="th">Account Holder</th><th className="th">IFSC</th>
          <th className="th">Reason</th><th className="th">Reported By</th><th className="th">Date</th>
          <th className="th text-right">Actions</th>
        </tr></thead>
        <tbody>{data.map(acc => (
          <tr key={acc._id}>
            <td className="td font-mono font-semibold text-red-600">{acc.accountNumber}</td>
            <td className="td text-sm">{acc.name || "Unknown"}</td>
            <td className="td text-sm">{acc.ifsc}</td>
            <td className="td text-sm">{acc.reason}</td>
            <td className="td text-sm">{acc.reportedBy?.name || "System"}</td>
            <td className="td text-sm text-muted">{new Date(acc.createdAt).toLocaleDateString()}</td>
            <td className="td text-right">
              <button onClick={() => onAction(acc.accountNumber)} className="badge badge-green"><UserCheck size={14} className="mr-1" /> Unfreeze</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
