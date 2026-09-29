import { useEffect, useState, useRef } from "react";
import { Clock, Check, X, Timer, Search, Archive, Info } from "lucide-react";
import { getScheduledTransactions, processScheduledTransaction } from "../api/transaction.api";
import { getArchivedScheduled } from "../api/fraud.api";
import { formatINR } from "../utils/formatCurrency";

function useCountdown(autoProcessAt, enabled = false) {
  const [remaining, setRemaining] = useState(getRemaining(autoProcessAt));
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enabled || !autoProcessAt) return;
    const update = () => setRemaining(getRemaining(autoProcessAt));
    intervalRef.current = setInterval(update, 1000);
    return () => clearInterval(intervalRef.current);
  }, [autoProcessAt, enabled]);

  return remaining;
}

function getRemaining(targetDate) {
  if (!targetDate) return { expired: true, ms: 0 };
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const diff = target - now;
  if (diff <= 0) return { expired: true, ms: 0, display: "00:00:00" };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { expired: false, ms: diff, display: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` };
}

const TERMINAL_DISPLAY = {
  COMPLETED: { text: "Completed", bg: "bg-green-100", tc: "text-green-700", icon: <Check size={12} /> },
  CANCELLED: { text: "Cancelled", bg: "bg-gray-100", tc: "text-gray-700", icon: <X size={12} /> },
  FAILED: { text: "Failed", bg: "bg-red-100", tc: "text-red-700", icon: <X size={12} /> },
  REJECTED: { text: "Rejected", bg: "bg-red-100", tc: "text-red-700", icon: <X size={12} /> },
  APPROVED_BY_ADMIN: { text: "Approved", bg: "bg-green-100", tc: "text-green-700", icon: <Check size={12} /> },
  PROCESSING: { text: "Processing", bg: "bg-blue-100", tc: "text-blue-700", icon: <Clock size={12} /> },
  EXPIRED: { text: "Expired", bg: "bg-gray-100", tc: "text-gray-500", icon: <Clock size={12} /> },
  FRAUD_REPORTED: { text: "Fraud Reported", bg: "bg-red-100", tc: "text-red-700", icon: <X size={12} /> },
  REFUNDED: { text: "Refunded", bg: "bg-yellow-100", tc: "text-yellow-700", icon: <Clock size={12} /> },
};

function CountdownCell({ autoProcessAt, status }) {
  const isActivePending = status === "PENDING" || status === "HOLD_FOR_REVIEW";
  const remaining = useCountdown(autoProcessAt, isActivePending);

  if (!isActivePending) {
    const d = TERMINAL_DISPLAY[status] || { text: status || "Unknown", bg: "bg-gray-100", tc: "text-gray-700", icon: null };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${d.bg} ${d.tc} text-xs font-bold`}>
        {d.icon} {d.text}
      </span>
    );
  }
  if (remaining.expired) return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-mono font-bold"><Timer size={12} /> Overdue</span>;
  const isUrgent = remaining.ms < 1000 * 60 * 5;
  const isWarning = remaining.ms < 1000 * 60 * 15;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-mono text-xs font-bold ${isUrgent ? "bg-red-100 text-red-700 animate-pulse" : isWarning ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>
      <Timer size={12} /> {remaining.display}
    </span>
  );
}

const STATUS_STYLES = {
  PENDING: "badge-yellow", HOLD_FOR_REVIEW: "badge-red", COMPLETED: "badge-green", CANCELLED: "badge-gray", FAILED: "badge-red", REJECTED: "badge-gray", APPROVED_BY_ADMIN: "badge-green", PROCESSING: "badge-blue", EXPIRED: "badge-gray", FRAUD_REPORTED: "badge-red", REFUNDED: "badge-yellow"
};

export default function ScheduledTxns() {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ PENDING: 0, HOLD_FOR_REVIEW: 0, COMPLETED: 0, CANCELLED: 0, FAILED: 0 });
  const [processingId, setProcessingId] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [perPage, setPerPage] = useState(20);
  const [selectedTxn, setSelectedTxn] = useState(null);

  useEffect(() => { loadScheduled(); }, [page, perPage, filter, showArchive]);

  const loadScheduled = async () => {
    try {
      setLoading(true); setError(null);
      const res = showArchive
        ? await getArchivedScheduled(page, perPage, 90)
        : await getScheduledTransactions(page, perPage, filter || undefined, search || undefined);
      const data = res.data.transactions || [];
      setTxns(data);
      setTotalPages(res.data.totalPages || 1);
      setTotal(res.data.total || res.data.totalTransactions || 0);

      if (!showArchive) {
        const newStats = { PENDING: 0, HOLD_FOR_REVIEW: 0, COMPLETED: 0, CANCELLED: 0, FAILED: 0 };
        data.forEach(t => { if (newStats[t.status] !== undefined) newStats[t.status]++; });
        setStats(newStats);
      }
    } catch (err) {
      console.error("Load scheduled error", err);
      setError("Failed to load scheduled transactions.");
    } finally { setLoading(false); }
  };

  const handleProcess = async (txnId, action) => {
    if (!window.confirm(action === "approve" ? "Approve and process this transaction?" : "Reject this transaction?")) return;
    try {
      setProcessingId(txnId);
      await processScheduledTransaction(txnId, action);
      alert(action === "approve" ? "Transaction approved" : "Transaction rejected");
      loadScheduled();
    } catch (err) {
      alert(err.response?.data?.error || "Failed");
    } finally { setProcessingId(null); }
  };

  const handleFilter = (f) => { setFilter(filter === f ? "" : f); setPage(1); };

  if (error) return (
    <div className="text-center py-12">
      <p className="text-red-500 mb-4">{error}</p>
      <button onClick={loadScheduled} className="px-4 py-2 bg-green-600 text-white rounded-lg">Retry</button>
    </div>
  );

  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Scheduled Transactions</h1>
      <p className="text-muted mb-6">Manage delayed and held transactions</p>

      {!showArchive && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { key: "PENDING", label: "Pending", color: "bg-yellow-100 text-yellow-700" },
            { key: "HOLD_FOR_REVIEW", label: "Fraud Review", color: "bg-red-100 text-red-700" },
            { key: "COMPLETED", label: "Completed", color: "bg-green-100 text-green-700" },
            { key: "CANCELLED", label: "Cancelled", color: "bg-gray-100 text-gray-700" },
            { key: "FAILED", label: "Failed", color: "bg-red-50 text-red-600" },
          ].map(s => (
            <div key={s.key} onClick={() => handleFilter(s.key)}
              className={`p-3 rounded-lg text-center cursor-pointer transition ${s.color} ${filter === s.key ? "ring-2 ring-blue-500" : ""}`}>
              <p className="text-lg font-bold">{stats[s.key] || 0}</p>
              <p className="text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 mb-6">
        {!showArchive && (
          <div className="relative w-full max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by txn ID, account..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-11 pr-4 py-3 rounded-xl border bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        )}
        <button onClick={() => { setShowArchive(!showArchive); setPage(1); setSearch(""); }}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition ${showArchive ? "bg-blue-50 border-blue-300 text-blue-700" : "hover:bg-gray-100"}`}>
          <Archive size={18} /> {showArchive ? "Active" : "Archived"}
        </button>
        {!showArchive && (
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="px-3 py-3 rounded-xl border bg-transparent text-sm">
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        )}
        <span className="text-sm text-muted ml-auto">{total} transactions</span>
      </div>

      {loading ? <div className="text-center py-12 text-muted">Loading...</div> : (
        <div className="bg-card dark:bg-darkcard rounded-xl border overflow-x-auto">
          <table className="table min-w-[1100px]">
            <thead><tr>
              <th className="th">Txn ID</th><th className="th">User</th><th className="th">Receiver</th>
              <th className="th">Amount</th><th className="th">Status</th><th className="th">Countdown</th>
              <th className="th">Date</th><th className="th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {txns.map(t => {
                const holdStatus = t.status || "PENDING";
                return (
                  <tr key={t.id || t._id}>
                    <td className="td font-mono text-xs">{t.txn_id?.substring(0, 20)}</td>
                    <td className="td"><div className="text-sm font-medium">{t.user?.name || t.user_id?.name || "N/A"}</div><div className="text-xs text-muted">{t.user?.account || t.user_id?.accountNumber}</div></td>
                    <td className="td text-sm">{t.to_account || t.to_upi || "N/A"}</td>
                    <td className="td font-semibold">{formatINR(t.amount)}</td>
                    <td className="td"><span className={`badge ${STATUS_STYLES[holdStatus] || "badge-yellow"}`}>{holdStatus}</span></td>
                    <td className="td"><CountdownCell autoProcessAt={t.auto_process_at} status={holdStatus} /></td>
                    <td className="td text-xs text-muted">{new Date(t.createdAt || t.scheduled_at).toLocaleDateString()}</td>
                    <td className="td text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => setSelectedTxn(t)} className="badge badge-blue" title="View Details"><Info size={14} /></button>
                      {(holdStatus === "PENDING" || holdStatus === "HOLD_FOR_REVIEW") && (
                        <>
                          <button onClick={() => handleProcess(t.id || t._id, "approve")} disabled={processingId === (t.id || t._id)}
                            className="badge badge-green" title="Approve"><Check size={14} /></button>
                          <button onClick={() => handleProcess(t.id || t._id, "reject")} disabled={processingId === (t.id || t._id)}
                            className="badge badge-red" title="Reject"><X size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {txns.length === 0 && <tr><td colSpan={8} className="td text-center text-muted py-6">No scheduled transactions found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 border rounded-lg disabled:opacity-50 text-sm">Prev</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              return <button key={p} onClick={() => setPage(p)} className={`px-3 py-2 border rounded-lg text-sm ${page === p ? "bg-green-600 text-white border-green-600" : "hover:bg-gray-100"}`}>{p}</button>;
            })}
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 border rounded-lg disabled:opacity-50 text-sm">Next</button>
          </div>
        </div>
      )}

      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedTxn(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Transaction Details</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Txn ID</span><span className="font-mono text-xs">{selectedTxn.txn_id}</span></div>
              <div className="flex justify-between"><span className="text-muted">Sender</span><span>{selectedTxn.user?.name || selectedTxn.user_id?.name || "N/A"} ({selectedTxn.user?.account || selectedTxn.user_id?.accountNumber || "—"})</span></div>
              <div className="flex justify-between"><span className="text-muted">Receiver</span><span>{selectedTxn.beneficiary_name || selectedTxn.to_account || selectedTxn.to_upi || "N/A"}</span></div>
              <div className="flex justify-between"><span className="text-muted">Amount</span><span className="font-semibold">{formatINR(selectedTxn.amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Status</span><span className={`badge ${STATUS_STYLES[selectedTxn.status] || "badge-yellow"}`}>{selectedTxn.status}</span></div>
              <div className="flex justify-between"><span className="text-muted">Scheduled Date</span><span>{new Date(selectedTxn.scheduled_at || selectedTxn.createdAt).toLocaleString()}</span></div>
              {selectedTxn.auto_process_at && <div className="flex justify-between"><span className="text-muted">Auto Process</span><span>{new Date(selectedTxn.auto_process_at).toLocaleString()}</span></div>}
              {selectedTxn.processed_at && <div className="flex justify-between"><span className="text-muted">Processed At</span><span>{new Date(selectedTxn.processed_at).toLocaleString()}</span></div>}
              {selectedTxn.delay_reason && <div className="flex justify-between"><span className="text-muted">Reason</span><span className="max-w-[250px] text-right">{selectedTxn.delay_reason}</span></div>}
              <div className="flex justify-between"><span className="text-muted">Frequency</span><span>One-time</span></div>
              <div className="flex justify-between"><span className="text-muted">Created At</span><span>{new Date(selectedTxn.createdAt).toLocaleString()}</span></div>
            </div>
            <button onClick={() => setSelectedTxn(null)} className="mt-4 w-full px-4 py-2 bg-gray-200 rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}
    </>
  );
}