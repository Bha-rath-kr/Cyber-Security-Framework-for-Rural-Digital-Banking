import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Search, RefreshCw, Server, Link, Database, Shield, CheckCircle, XCircle, Hourglass, FileSearch, Loader } from "lucide-react";
import { getBlockchainStatus, getBlockchainTransactions, verifyBlockchainTransaction } from "../api/blockchain.api";
import { formatINR } from "../utils/formatCurrency";
import Pagination from "../components/Pagination";

export default function Blockchain() {
  const [status, setStatus] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [verifyResults, setVerifyResults] = useState({});
  const [auditing, setAuditing] = useState(false);
  const [auditSummary, setAuditSummary] = useState(null);
  const verifyingRef = useRef({});

  const [totalRecords, setTotalRecords] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [statusRes, txnsRes] = await Promise.all([
        getBlockchainStatus().catch(() => ({ data: { enabled: false, connected: false, error: "Could not reach blockchain service" } })),
        getBlockchainTransactions({ limit: 500 }).catch(() => ({ data: { transactions: [], total: 0 } }))
      ]);
      setStatus(statusRes.data);
      const sorted = (txnsRes.data.transactions || []).sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      setTxns(sorted);
      setTotalRecords(txnsRes.data.total || sorted.length);
    } catch (err) {
      setError("Failed to load blockchain data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredTxns = useMemo(() => {
    if (!search) return txns;
    const s = search.toLowerCase();
    return txns.filter(t =>
      (t.txnId || "").toLowerCase().includes(s) ||
      (t.senderAccount || "").toLowerCase().includes(s) ||
      (t.receiverAccount || "").toLowerCase().includes(s)
    );
  }, [txns, search]);

  const cTotal = filteredTxns.length;
  const cTotalPages = Math.max(1, Math.ceil(cTotal / perPage));
  const cPage = Math.min(page, cTotalPages);
  const pagedTxns = useMemo(() => filteredTxns.slice((cPage - 1) * perPage, cPage * perPage), [filteredTxns, cPage, perPage]);

  const isConnected = status?.connected && status?.enabled;

  const handleAudit = async () => {
    setAuditing(true);
    setAuditSummary(null);
    let verified = 0, failed = 0;
    for (const tx of txns) {
      try {
        const res = await verifyBlockchainTransaction(tx.txnId);
        setVerifyResults(prev => ({ ...prev, [tx.txnId]: res.data }));
        if (res.data.valid) verified++; else failed++;
      } catch {
        failed++;
        setVerifyResults(prev => ({ ...prev, [tx.txnId]: { valid: false, error: "Verification failed" } }));
      }
    }
    setAuditSummary({ total: txns.length, verified, failed });
    setAuditing(false);
  };

  const getVerificationBadge = (txnId) => {
    const result = verifyResults[txnId];
    if (!result) {
      return <span className="flex items-center gap-1.5 text-xs text-gray-400"><Hourglass size={14} /> Pending</span>;
    }
    if (result.valid) {
      return <span className="flex items-center gap-1.5 text-xs font-medium text-green-600"><CheckCircle size={14} /> Verified</span>;
    }
    return <span className="flex items-center gap-1.5 text-xs font-medium text-red-600"><XCircle size={14} /> Failed</span>;
  };

  if (loading) return <div className="p-6">Loading blockchain data...</div>;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Blockchain Ledger</h1>
          <p className="text-muted">Hyperledger Fabric — immutable transaction integrity & audit trail</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleAudit} disabled={auditing || txns.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50">
            {auditing ? <Loader size={16} className="animate-spin" /> : <FileSearch size={16} />}
            {auditing ? "Auditing..." : "Run Blockchain Audit"}
          </button>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      {/* Audit Summary Banner */}
      {auditSummary && (
        <div className="mb-6 p-4 rounded-xl bg-card dark:bg-darkcard border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-sm font-medium">Audit Complete</span>
              <span className="text-sm text-muted">Total: <strong>{auditSummary.total}</strong></span>
              <span className="text-sm text-green-600">Verified: <strong>{auditSummary.verified}</strong></span>
              {auditSummary.failed > 0 && (
                <span className="text-sm text-red-600">Failed: <strong>{auditSummary.failed}</strong></span>
              )}
            </div>
            <button onClick={() => setAuditSummary(null)} className="text-xs text-muted hover:text-red-500">Dismiss</button>
          </div>
          {auditSummary.failed === 0 && auditSummary.total > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
              <CheckCircle size={14} /> All blockchain records verified successfully — integrity confirmed
            </div>
          )}
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <StatusCard icon={Server} label="Network" value={isConnected ? "Connected" : "Disconnected"} color={isConnected ? "green" : "red"} />
        <StatusCard icon={Link} label="Channel" value={status?.channel || "—"} color="blue" />
        <StatusCard icon={Database} label="Chaincode" value={status?.chaincode || "—"} color="purple" />
        <StatusCard icon={Shield} label="Total Records" value={totalRecords} color="teal" />
        <StatusCard icon={CheckCircle} label="Verified" value={Object.values(verifyResults).filter(r => r?.valid).length} color="green" />
      </div>

      {/* Search */}
      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by transaction ID, sender, or receiver..."
            className="w-full pl-11 pr-4 py-3 rounded-xl border bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-card dark:bg-darkcard rounded-xl border overflow-x-auto">
        <table className="table min-w-[1100px]">
          <thead>
            <tr>
              <th className="th">Transaction ID</th>
              <th className="th">Sender</th>
              <th className="th">Receiver</th>
              <th className="th">Amount</th>
              <th className="th">Timestamp</th>
              <th className="th">Blockchain Status</th>
              <th className="th">Verification</th>
            </tr>
          </thead>
          <tbody>
            {pagedTxns.map(tx => (
              <tr key={tx.txnId}>
                <td className="td font-mono text-xs">{tx.txnId?.substring(0, 24)}</td>
                <td className="td text-sm">{tx.senderAccount || "—"}</td>
                <td className="td text-sm">{tx.receiverAccount || "—"}</td>
                <td className="td font-semibold">{tx.amount ? formatINR(tx.amount) : "—"}</td>
                <td className="td text-xs text-muted">{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "—"}</td>
                <td className="td">
                  <span className={`badge ${tx.status === "SUCCESS" ? "badge-green" : "badge-yellow"}`}>
                    {tx.status || "RECORDED"}
                  </span>
                </td>
                <td className="td">{getVerificationBadge(tx.txnId)}</td>
              </tr>
            ))}
            {pagedTxns.length === 0 && (
              <tr><td colSpan={7} className="td text-center text-muted py-8">No blockchain transactions found{search ? " matching your search" : ""}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={cPage}
        perPage={perPage}
        total={cTotal}
        totalPages={cTotalPages}
        onPageChange={(p) => setPage(p)}
        onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
      />
    </>
  );
}

function StatusCard({ icon: Icon, label, value, color }) {
  const styles = {
    green: "bg-green-100 text-green-600", red: "bg-red-100 text-red-600",
    blue: "bg-blue-100 text-blue-600", purple: "bg-purple-100 text-purple-600",
    teal: "bg-teal-100 text-teal-600"
  };
  return (
    <div className="bg-card dark:bg-darkcard border rounded-xl p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${styles[color]}`}><Icon size={20} /></div>
        <div><p className="text-sm text-muted">{label}</p><p className="font-semibold">{value ?? "—"}</p></div>
      </div>
    </div>
  );
}
