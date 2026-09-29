import { useEffect, useState, useCallback } from "react";
import { Search, Filter, ArrowUp, ArrowDown, X, Archive } from "lucide-react";
import { getAllTransactions } from "../api/transaction.api";
import { getArchivedTransactions } from "../api/fraud.api";
import { formatINR } from "../utils/formatCurrency";

export default function Funds() {
  const [txns, setTxns] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const [filters, setFilters] = useState({ search: "", type: "", status: "", dateFrom: "", dateTo: "" });
  const [perPage, setPerPage] = useState(10);

  const loadTransactions = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const res = await getAllTransactions(page, perPage, filters);
      setTxns(res.data.transactions);
      setTotalPages(res.data.totalPages);
      setTotal(res.data.totalTransactions);
    } catch (err) {
      console.error("Failed to load transactions", err);
      setError("Failed to load transactions. Please try again.");
    } finally { setLoading(false); }
  }, [page, perPage, filters]);

  useEffect(() => { if (!showArchive) loadTransactions(); }, [loadTransactions, showArchive]);

  const handleSearch = (val) => {
    setFilters(f => ({ ...f, search: val }));
    setPage(1);
  };

  const handleFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ search: "", type: "", status: "", dateFrom: "", dateTo: "" });
    setPage(1);
  };

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && k !== "search").length;

  if (error) return (
    <div className="text-center py-12">
      <p className="text-red-500 mb-4">{error}</p>
      <button onClick={loadTransactions} className="px-4 py-2 bg-green-600 text-white rounded-lg">Retry</button>
    </div>
  );

  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Fund Management</h1>
      <p className="text-muted mb-6">Track and manage all transactions</p>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative w-full max-w-md">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by txn ID, account, beneficiary..." value={filters.search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl border bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>

        <button onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition ${showFilters ? "bg-green-50 border-green-300 text-green-700" : "hover:bg-gray-100"}`}>
          <Filter size={18} /> Filters {activeFilterCount > 0 && <span className="bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{activeFilterCount}</span>}
        </button>

        <button onClick={() => { setShowArchive(!showArchive); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition ${showArchive ? "bg-blue-50 border-blue-300 text-blue-700" : "hover:bg-gray-100"}`}>
          <Archive size={18} /> {showArchive ? "Active Transactions" : "Archived"}
        </button>

        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-sm text-red-500 hover:underline">Clear filters</button>
        )}

        <div className="ml-auto text-sm text-muted">{total} transactions</div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-6 p-4 rounded-xl border bg-gray-50">
          <select value={filters.type} onChange={e => handleFilter("type", e.target.value)}
            className="px-3 py-2 rounded-lg border bg-white text-sm">
            <option value="">All Types</option>
            <option value="DEBIT">Debit</option>
            <option value="CREDIT">Credit</option>
          </select>
          <select value={filters.status} onChange={e => handleFilter("status", e.target.value)}
            className="px-3 py-2 rounded-lg border bg-white text-sm">
            <option value="">All Status</option>
            <option value="completed">Completed</option>
            <option value="flagged">Flagged/Fraud</option>
          </select>
          <input type="date" value={filters.dateFrom} onChange={e => handleFilter("dateFrom", e.target.value)}
            className="px-3 py-2 rounded-lg border bg-white text-sm" placeholder="From" />
          <input type="date" value={filters.dateTo} onChange={e => handleFilter("dateTo", e.target.value)}
            className="px-3 py-2 rounded-lg border bg-white text-sm" placeholder="To" />
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="px-3 py-2 rounded-lg border bg-white text-sm">
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-muted">Loading...</div> : (
        <div className="bg-card dark:bg-darkcard rounded-xl border overflow-x-auto">
          <table className="table min-w-[1200px]">
            <thead><tr>
              <th className="th">TXN ID</th><th className="th">From</th><th className="th">To</th>
              <th className="th">Amount</th><th className="th">Type</th><th className="th">Status</th>
              <th className="th">Date</th><th className="th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {txns.map(txn => (
                <tr key={txn._id}>
                  <td className="td font-mono text-xs">{txn.txn_id?.substring(0, 20)}</td>
                  <td className="td text-sm">{txn.user_id?.name || txn.from_account || "—"}</td>
                  <td className="td text-sm">{txn.beneficiary_name || txn.to_account || txn.to_upi || "—"}</td>
                  <td className="td font-semibold">{formatINR(txn.amount)}</td>
                  <td className="td">
                    <span className={`inline-flex items-center gap-1 ${txn.type === "CREDIT" ? "text-green-600" : ""}`}>
                      {txn.type === "CREDIT" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                      {txn.type || "DEBIT"}
                    </span>
                  </td>
                  <td className="td">
                    <span className={`badge ${txn.is_fraud ? "badge-red" : txn.is_suspicious ? "badge-yellow" : "badge-green"}`}>
                      {txn.is_fraud ? "Flagged" : txn.is_suspicious ? "Suspicious" : "Completed"}
                    </span>
                  </td>
                  <td className="td text-xs text-muted">{new Date(txn.createdAt).toLocaleDateString()}</td>
                  <td className="td text-right">
                    <button onClick={() => setSelectedTxn(txn)} className="text-green-600 hover:underline font-medium text-sm">View</button>
                  </td>
                </tr>
              ))}
              {txns.length === 0 && <tr><td colSpan={8} className="td text-center text-muted py-6">No transactions found</td></tr>}
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
              let p;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-3 py-2 border rounded-lg text-sm ${page === p ? "bg-green-600 text-white border-green-600" : "hover:bg-gray-100"}`}>{p}</button>
              );
            })}
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 border rounded-lg disabled:opacity-50 text-sm">Next</button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedTxn(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Transaction Details</h2>
              <button onClick={() => setSelectedTxn(null)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted uppercase">Txn ID</p><p className="font-mono text-sm font-medium">{selectedTxn.txn_id}</p></div>
                <div><p className="text-xs text-muted uppercase">Amount</p><p className="text-lg font-bold">{formatINR(selectedTxn.amount)}</p></div>
                <div><p className="text-xs text-muted uppercase">Type</p><p className="font-medium">{selectedTxn.type}</p></div>
                <div><p className="text-xs text-muted uppercase">Status</p><span className={`badge ${selectedTxn.is_fraud ? "badge-red" : selectedTxn.is_suspicious ? "badge-yellow" : "badge-green"}`}>{selectedTxn.is_fraud ? "Flagged" : "Completed"}</span></div>
              </div>
              <hr />
              <div><h3 className="text-sm font-semibold mb-2">Sender</h3><p className="text-sm">{selectedTxn.user_id?.name || "—"}</p><p className="text-xs text-muted">Account: {selectedTxn.user_id?.accountNumber || selectedTxn.from_account || "—"}</p></div>
              <div><h3 className="text-sm font-semibold mb-2">Recipient</h3><p className="text-sm">{selectedTxn.beneficiary_name || "—"}</p><p className="text-xs text-muted">Account: {selectedTxn.to_account || selectedTxn.to_upi || "—"}{selectedTxn.ifsc && ` | IFSC: ${selectedTxn.ifsc}`}</p></div>
              <hr />
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted uppercase">Balance Before</p><p className="font-medium">{selectedTxn.balance_before != null ? formatINR(selectedTxn.balance_before) : "—"}</p></div>
                <div><p className="text-xs text-muted uppercase">Balance After</p><p className="font-medium">{selectedTxn.balance_after != null ? formatINR(selectedTxn.balance_after) : "—"}</p></div>
                <div><p className="text-xs text-muted uppercase">Date</p><p className="text-sm">{new Date(selectedTxn.createdAt).toLocaleDateString()}</p></div>
                <div><p className="text-xs text-muted uppercase">Time</p><p className="text-sm">{new Date(selectedTxn.createdAt).toLocaleTimeString()}</p></div>
              </div>
              {selectedTxn.fraud_reason && <><hr /><div><p className="text-xs text-muted uppercase text-red-600">Fraud Reason</p><p className="text-sm text-red-600">{selectedTxn.fraud_reason}</p></div></>}
              {selectedTxn.risk_score > 0 && <div><p className="text-xs text-muted uppercase">Risk Score</p><p className="text-sm">{selectedTxn.risk_score}/200</p></div>}
            </div>
            <div className="p-5 border-t">
              <button onClick={() => setSelectedTxn(null)} className="w-full py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}