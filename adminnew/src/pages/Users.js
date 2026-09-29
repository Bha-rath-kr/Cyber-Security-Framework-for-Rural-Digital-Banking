import { useEffect, useState, useCallback } from "react";
import { Search, X, Eye, Snowflake, Sun, Plus } from "lucide-react";
import { getAllUsers, freezeUser, unfreezeUser, addBalanceToUser, getUserTransactions } from "../api/user.api";
import { formatINR } from "../utils/formatCurrency";

const displayStatus = (s) => s === "CLEARED" ? "ACTIVE" : s;

export default function Users() {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [flaggedFilter, setFlaggedFilter] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userTxns, setUserTxns] = useState([]);
  const [showAddBalance, setShowAddBalance] = useState(null);
  const [balanceAmt, setBalanceAmt] = useState("");
  const [balanceReason, setBalanceReason] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const filters = { search, status: statusFilter, flagged: flaggedFilter };
      const res = await getAllUsers(page, perPage, filters);
      setUsers(res.data.users);
      setTotalPages(res.data.totalPages);
      setTotal(res.data.totalUsers);
    } catch (err) {
      console.error("Failed to load users", err);
      setError("Failed to load users");
    } finally { setLoading(false); }
  }, [page, perPage, search, statusFilter, flaggedFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSearch = (val) => { setSearch(val); setPage(1); };
  const handleStatusFilter = (val) => { setStatusFilter(val); setPage(1); };
  const handleFlaggedFilter = (val) => { setFlaggedFilter(val); setPage(1); };

  const handleFreeze = async (id) => {
    try { await freezeUser(id); loadUsers(); } catch (e) { alert(e.response?.data?.error || "Failed"); }
  };
  const handleUnfreeze = async (id) => {
    try { await unfreezeUser(id); loadUsers(); } catch (e) { alert(e.response?.data?.error || "Failed"); }
  };
  const handleViewTx = async (userId) => {
    try {
      const res = await getUserTransactions(userId);
      setUserTxns(res.data.transactions || []);
      setSelectedUser(userId);
    } catch (e) { alert("Failed to load transactions"); }
  };
  const handleAddBalance = async (userId) => {
    if (!balanceAmt || isNaN(balanceAmt)) return alert("Enter valid amount");
    try {
      await addBalanceToUser({ userId, amount: Number(balanceAmt), reason: balanceReason || "Admin adjustment" });
      setShowAddBalance(null); setBalanceAmt(""); setBalanceReason(""); loadUsers();
    } catch (e) { alert(e.response?.data?.error || "Failed"); }
  };

  if (error) return (
    <div className="text-center py-12">
      <p className="text-red-500 mb-4">{error}</p>
      <button onClick={loadUsers} className="px-4 py-2 bg-green-600 text-white rounded-lg">Retry</button>
    </div>
  );

  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">User Management</h1>
      <p className="text-muted mb-6">Manage registered users and accounts</p>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative w-full max-w-md">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name, account, phone, Aadhaar..." value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl border bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>

        <select value={statusFilter} onChange={e => handleStatusFilter(e.target.value)}
          className="px-3 py-3 rounded-xl border bg-transparent text-sm">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="TEMP_FROZEN">Temp Frozen</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="FROZEN">Frozen</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BLOCKED">Blocked</option>
          <option value="CLEARED">Active (Cleared)</option>
        </select>

        <select value={flaggedFilter} onChange={e => handleFlaggedFilter(e.target.value)}
          className="px-3 py-3 rounded-xl border bg-transparent text-sm">
          <option value="">All Users</option>
          <option value="true">Flagged for Fraud</option>
        </select>

        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
          className="px-3 py-3 rounded-xl border bg-transparent text-sm">
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
        </select>

        <span className="text-sm text-muted ml-auto">{total} users</span>
      </div>

      {loading ? <div className="text-center py-12 text-muted">Loading...</div> : (
        <div className="bg-card dark:bg-darkcard rounded-xl border overflow-x-auto">
          <table className="table min-w-[1000px]">
            <thead><tr>
              <th className="th">Name</th><th className="th">Account</th><th className="th">Phone</th>
              <th className="th">Balance</th><th className="th">Status</th><th className="th">Flagged</th>
              <th className="th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td className="td"><div className="font-medium">{u.name}</div><div className="text-xs text-muted">{u.aadhaarNumber || ""}</div></td>
                  <td className="td font-mono text-sm">{u.accountNumber}</td>
                  <td className="td text-sm">{u.phoneNumber}</td>
                  <td className="td font-semibold">{formatINR(u.balance)}</td>
                  <td className="td"><span className={`badge ${u.status === "ACTIVE" || u.status === "CLEARED" ? "badge-green" : u.status === "TEMP_FROZEN" || u.status === "FROZEN" || u.status === "SUSPENDED" || u.status === "BLOCKED" ? "badge-red" : "badge-yellow"}`}>{displayStatus(u.status)}</span></td>
                  <td className="td">{u.riskFlags?.isFlaggedForFraud ? <span className="badge badge-red">Yes</span> : <span className="text-xs text-muted">No</span>}</td>
                  <td className="td text-right space-x-1 whitespace-nowrap">
                    <button onClick={() => handleViewTx(u._id)} className="badge badge-blue" title="Transactions"><Eye size={14} /></button>
                    <button onClick={() => setShowAddBalance(u._id)} className="badge badge-green" title="Add Balance"><Plus size={14} /></button>
                    {u.status === "ACTIVE" || u.status === "CLEARED" ? (
                      <button onClick={() => handleFreeze(u._id)} className="badge badge-red" title="Freeze"><Snowflake size={14} /></button>
                    ) : (
                      <button onClick={() => handleUnfreeze(u._id)} className="badge badge-yellow" title="Unfreeze"><Sun size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={7} className="td text-center text-muted py-6">No users found</td></tr>}
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

      {/* Tx History Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setSelectedUser(null); setUserTxns([]); }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-3xl w-full mx-4 shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
            {userTxns.length === 0 ? <p className="text-muted text-center py-6">No transactions found</p> : (
              <table className="table w-full">
                <thead><tr><th className="th">Txn ID</th><th className="th">Type</th><th className="th">Amount</th><th className="th">To</th><th className="th">Date</th></tr></thead>
                <tbody>{userTxns.map(tx => (
                  <tr key={tx._id}>
                    <td className="td font-mono text-xs">{tx.txn_id?.substring(0, 16)}</td>
                    <td className="td"><span className={`badge ${tx.type === "DEBIT" ? "badge-red" : "badge-green"}`}>{tx.type}</span></td>
                    <td className="td font-semibold">{formatINR(tx.amount)}</td>
                    <td className="td text-sm">{tx.to_account || tx.to_upi || "N/A"}</td>
                    <td className="td text-xs text-muted">{new Date(tx.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <button onClick={() => { setSelectedUser(null); setUserTxns([]); }} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}

      {/* Add Balance Modal */}
      {showAddBalance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowAddBalance(null); setBalanceAmt(""); setBalanceReason(""); }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Add Balance</h2>
            <input type="number" placeholder="Amount" value={balanceAmt} onChange={e => setBalanceAmt(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border mb-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input type="text" placeholder="Reason (optional)" value={balanceReason} onChange={e => setBalanceReason(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border mb-4 bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex gap-3">
              <button onClick={() => handleAddBalance(showAddBalance)} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700">Add</button>
              <button onClick={() => { setShowAddBalance(null); setBalanceAmt(""); setBalanceReason(""); }} className="flex-1 py-2.5 rounded-xl border font-medium hover:bg-gray-100">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}