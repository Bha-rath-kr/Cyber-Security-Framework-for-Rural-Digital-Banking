import { useEffect, useState, useMemo } from "react";
import { Search, Check, X, AlertCircle, Shield, Ban, Eye } from "lucide-react";
import api from "../api/axios";
import { formatINR } from "../utils/formatCurrency";

const STATUS_CONFIG = {
  PENDING: { color: "bg-yellow-100 text-yellow-800", label: "Pending", dot: "bg-yellow-500" },
  UNDER_REVIEW: { color: "bg-blue-100 text-blue-800", label: "Under Review", dot: "bg-blue-500" },
  ACCEPTED: { color: "bg-green-100 text-green-800", label: "Accepted", dot: "bg-green-500" },
  REJECTED: { color: "bg-red-100 text-red-800", label: "Rejected", dot: "bg-red-500" },
  MARKED_FRAUD: { color: "bg-red-200 text-red-900", label: "Fraud Marked", dot: "bg-red-700" },
  SUSPENDED: { color: "bg-orange-100 text-orange-800", label: "Suspended", dot: "bg-orange-500" },
  BLOCKED: { color: "bg-gray-200 text-gray-800", label: "Blocked", dot: "bg-gray-700" },
  UNDER_INVESTIGATION: { color: "bg-purple-100 text-purple-800", label: "Investigating", dot: "bg-purple-500" },
  ACTION_TAKEN: { color: "bg-emerald-100 text-emerald-800", label: "Action Taken", dot: "bg-emerald-500" },
  RESOLVED: { color: "bg-teal-100 text-teal-800", label: "Resolved", dot: "bg-teal-500" },
};

const SEVERITY_CONFIG = {
  LOW: { color: "bg-gray-100 text-gray-700", label: "Low" },
  MEDIUM: { color: "bg-yellow-100 text-yellow-800", label: "Medium" },
  HIGH: { color: "bg-red-100 text-red-800", label: "High" },
  CRITICAL: { color: "bg-red-200 text-red-900", label: "Critical" },
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [stats, setStats] = useState({});
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailModal, setDetailModal] = useState(false);
  const [actionModal, setActionModal] = useState(null);
  const [actionReason, setActionReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage, setPerPage] = useState(20);

  useEffect(() => {
    loadData();
  }, [page, perPage, filter, search]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: perPage });
      if (filter) params.append("status", filter === "RESOLVED" ? "RESOLVED,ACTION_TAKEN" : filter);
      if (search) params.append("search", search);
      const [reportsRes, statsRes] = await Promise.all([
        api.get(`/admin/list?${params}`),
        api.get("/admin/stats")
      ]);
      setReports(reportsRes.data.complaints || []);
      setStats(statsRes.data.stats || {});
      setTotalPages(reportsRes.data.totalPages || 1);
    } catch (err) {
      console.error("Load data error", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setPage(1);
  };

  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(1);
  };

  const handleAction = async (complaintId, action) => {
    if (!complaintId) {
      alert("Complaint ID is missing");
      return;
    }
    if (!actionReason && (action === "block" || action === "mark_fraud")) {
      alert("Reason is required for this action");
      return;
    }

    try {
      setProcessing(true);
      await api.put(`/admin/${complaintId}/action`, {
        action,
        reason: actionReason,
        notes: actionNotes
      });
      setActionModal(null);
      setActionReason("");
      setActionNotes("");
      setDetailModal(false);
      setSelectedReport(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || "Action failed");
    } finally {
      setProcessing(false);
    }
  };

  const openDetail = async (report) => {
    try {
      const res = await api.get(`/admin/${report._id}`);
      setSelectedReport(res.data);
      setDetailModal(true);
    } catch (err) {
      console.error("Load detail error", err);
      setSelectedReport({ complaint: report });
      setDetailModal(true);
    }
  };

  const filteredReports = useMemo(() => {
    let result = reports;
    if (filter) {
      const statuses = new Set(filter === "RESOLVED" ? ["RESOLVED", "ACTION_TAKEN"] : [filter]);
      result = result.filter(r => statuses.has(r.status));
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        (r.complaintId || "").toLowerCase().includes(s) ||
        (r.reporter?.name || "").toLowerCase().includes(s) ||
        (r.reporter?.accountNumber || "").toLowerCase().includes(s) ||
        (r.reported?.accountNumber || "").toLowerCase().includes(s) ||
        (r.complaint?.category || "").toLowerCase().includes(s)
      );
    }
    return result;
  }, [reports, filter, search]);

  const getComplaintStatus = (data) => {
    if (data?.complaint?.status) return data.complaint.status;
    if (data?.status) return data.status;
    return null;
  };

  const getComplaintId = (data) => {
    if (data?.complaint?._id) return data.complaint._id;
    if (data?._id) return data._id;
    return null;
  };

  const canTakeAction = (status) => {
    return status && ["PENDING", "UNDER_REVIEW", "ACCEPTED", "UNDER_INVESTIGATION"].includes(status);
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString() : "-";
  const formatDateTime = (d) => d ? new Date(d).toLocaleString() : "-";

  const complaintStatus = getComplaintStatus(selectedReport);
  const complaintIdForAction = getComplaintId(selectedReport);

  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Fraud Complaints</h1>
      <p className="text-muted mb-6">Review and manage user fraud complaints</p>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {(() => {
          const filterMap = { pending: "PENDING", underReview: "UNDER_REVIEW", underInvestigation: "UNDER_INVESTIGATION", resolved: "RESOLVED", critical: "" };
          return [
            { key: "pending", label: "Pending", color: "text-yellow-600", bg: "bg-yellow-50" },
            { key: "underReview", label: "Under Review", color: "text-blue-600", bg: "bg-blue-50" },
            { key: "underInvestigation", label: "Investigating", color: "text-purple-600", bg: "bg-purple-50" },
            { key: "resolved", label: "Resolved", color: "text-green-600", bg: "bg-green-50" },
            { key: "critical", label: "Critical", color: "text-red-600", bg: "bg-red-50" },
          ].map(s => (
            <div
              key={s.key}
              onClick={() => handleFilterChange(filter === filterMap[s.key] ? "" : filterMap[s.key])}
              className={`p-4 rounded-xl border cursor-pointer transition ${s.bg} ${filter === filterMap[s.key] ? "ring-2 ring-blue-500" : ""}`}
            >
              <div className={`text-2xl font-bold ${s.color}`}>{stats[s.key] || 0}</div>
              <div className="text-sm text-muted">{s.label}</div>
            </div>
          ));
        })()}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by complaint ID, name, account..."
            className="w-full pl-11 pr-4 py-3 rounded-xl border"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["ALL", "PENDING", "UNDER_REVIEW", "UNDER_INVESTIGATION", "RESOLVED", "REJECTED"].map(f => (
            <button
              key={f}
              onClick={() => handleFilterChange(filter === (f === "ALL" ? "" : f) ? "" : f === "ALL" ? "" : f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                (f === "ALL" && !filter) || filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f === "ALL" ? "All" : STATUS_CONFIG[f]?.label || f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card dark:bg-darkcard rounded-xl border overflow-x-auto">
        <table className="table min-w-[1200px]">
          <thead>
            <tr>
              <th className="th">Complaint ID</th>
              <th className="th">Reporter</th>
              <th className="th">Reported Account</th>
              <th className="th">Category</th>
              <th className="th">Amount</th>
              <th className="th">Severity</th>
              <th className="th">Status</th>
              <th className="th">Date</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredReports.map(report => {
              const statusCfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.PENDING;
              const sevCfg = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.MEDIUM;
              return (
                <tr key={report._id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="td font-mono text-sm text-blue-600 cursor-pointer" onClick={() => openDetail(report)}>
                    {report.complaintId || report._id}
                  </td>
                  <td className="td">
                    <div className="font-medium">{report.reporter?.name || "Unknown"}</div>
                    <div className="text-xs text-muted">{report.reporter?.accountNumber}</div>
                  </td>
                  <td className="td">
                    <div className="font-medium">{report.reported?.accountNumber || "N/A"}</div>
                    {report.reported?.upiId && <div className="text-xs text-muted">{report.reported.upiId}</div>}
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} className="text-red-500" />
                      {(report.complaint?.category || report.report_type)?.replace(/_/g, " ")}
                    </div>
                  </td>
                  <td className="td font-semibold">{formatINR(report.relatedTransaction?.amount || report.amount)}</td>
                  <td className="td">
                    <span className={`badge ${sevCfg.color}`}>{sevCfg.label}</span>
                  </td>
                  <td className="td">
                    <span className={`badge ${statusCfg.color}`}>
                      <span className={`inline-block w-2 h-2 rounded-full ${statusCfg.dot} mr-1`} />
                      {statusCfg.label}
                    </span>
                  </td>
                  <td className="td text-sm text-muted">{formatDate(report.createdAt)}</td>
                  <td className="td text-right">
                    <button
                      onClick={() => openDetail(report)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 ml-auto"
                    >
                      <Eye size={14} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredReports.length === 0 && (
              <tr>
                <td colSpan={9} className="td text-center text-muted py-6">No complaints found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">Page {page} of {totalPages}</span>
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 border rounded text-sm bg-transparent">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 border rounded-lg disabled:opacity-50 text-sm">Prev</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              return <button key={p} onClick={() => setPage(p)} className={`px-3 py-2 border rounded-lg text-sm ${page === p ? "bg-blue-600 text-white border-blue-600" : "hover:bg-gray-100"}`}>{p}</button>;
            })}
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 border rounded-lg disabled:opacity-50 text-sm">Next</button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">{selectedReport.complaint?.complaintId || "Complaint Details"}</h2>
                <p className="text-sm text-muted">Filed: {formatDateTime(selectedReport.complaint?.complaint?.reportedAt || selectedReport.complaint?.createdAt)}</p>
              </div>
              <button onClick={() => { setDetailModal(false); setSelectedReport(null); }} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-xl">
                <p className="text-xs text-muted mb-1">REPORTER</p>
                <p className="font-semibold">{selectedReport.complaint?.reporter?.name || selectedReport.reporter?.name}</p>
                <p className="text-sm">A/C: {selectedReport.complaint?.reporter?.accountNumber || selectedReport.reporter?.accountNumber}</p>
                <p className="text-sm">Phone: {selectedReport.complaint?.reporter?.phoneNumber || selectedReport.reporter?.phoneNumber}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-xl">
                <p className="text-xs text-muted mb-1">REPORTED ACCOUNT</p>
                <p className="font-semibold">{selectedReport.complaint?.reported?.accountNumber || selectedReport.reported?.accountNumber || "N/A"}</p>
                {selectedReport.complaint?.reported?.upiId && <p className="text-sm">UPI: {selectedReport.complaint.reported.upiId}</p>}
                {selectedReport.reportedUser && (
                  <>
                    <p className="text-sm">Name: {selectedReport.reportedUser.name}</p>
                    <p className="text-sm">Status: <span className={`font-semibold ${selectedReport.reportedUser.status === "FROZEN" ? "text-red-600" : "text-green-600"}`}>{selectedReport.reportedUser.status}</span></p>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl mb-6">
              <p className="text-xs text-muted mb-1">COMPLAINT DETAILS</p>
              <p className="font-semibold">{(selectedReport.complaint?.complaint?.category || selectedReport.complaint?.category || selectedReport.report_type)?.replace(/_/g, " ")}</p>
              <p className="text-sm mt-1">{selectedReport.complaint?.complaint?.description || selectedReport.complaint?.description}</p>
              <p className="text-sm mt-2">Amount: {formatINR(selectedReport.complaint?.relatedTransaction?.amount || selectedReport.complaint?.amount)}</p>
              <p className="text-sm">Incident: {formatDate(selectedReport.complaint?.complaint?.incidentDate || selectedReport.complaint?.incidentDate)}</p>
            </div>

            {selectedReport.relatedTransactions && selectedReport.relatedTransactions.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-semibold mb-2">Related Transactions ({selectedReport.relatedTransactions.length})</p>
                <div className="max-h-40 overflow-y-auto bg-gray-50 rounded-xl p-3">
                  {selectedReport.relatedTransactions.slice(0, 10).map(t => (
                    <div key={t._id} className="flex justify-between text-sm py-1 border-b last:border-0">
                      <span className="font-mono text-xs">{t.txn_id}</span>
                      <span>{formatINR(t.amount)}</span>
                      <span className={t.type === "DEBIT" ? "text-red-600" : "text-green-600"}>{t.type}</span>
                      <span className="text-muted text-xs">{formatDate(t.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedReport.complaint?.timeline && selectedReport.complaint.timeline.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-semibold mb-2">Timeline</p>
                {selectedReport.complaint.timeline.map((t, i) => (
                  <div key={i} className="flex gap-3 text-sm py-1">
                    <span className="text-muted text-xs w-24">{formatDateTime(t.performedAt)}</span>
                    <span className="font-medium w-32">{t.status}</span>
                    <span className="text-muted">{t.note}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            {canTakeAction(complaintStatus) && (
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Take Action</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button onClick={() => setActionModal("investigate")} className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
                    <Eye size={14} /> Investigate
                  </button>
                  <button onClick={() => setActionModal("clear")} className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                    <Check size={14} /> Clear
                  </button>
                  <button onClick={() => setActionModal("mark_fraud")} className="flex items-center justify-center gap-2 px-3 py-2 bg-red-800 text-white rounded-lg text-sm hover:bg-red-900">
                    <Shield size={14} /> Mark Fraud
                  </button>
                  <button onClick={() => setActionModal("block")} className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800">
                    <Ban size={14} /> Block
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-1">
              Confirm: {actionModal === "investigate" ? "Start Investigation" :
                       actionModal === "clear" ? "Clear Complaint" :
                       actionModal === "mark_fraud" ? "Mark Account as Fraudulent" :
                       "Block Account Permanently"}
            </h3>
            <p className="text-sm text-muted mb-4">
              {actionModal === "investigate" && "This will flag the account for detailed monitoring."}
              {actionModal === "clear" && "This will resolve the complaint with no action against the reported account."}
              {actionModal === "mark_fraud" && "This will freeze the reported account and add it to the fraud blacklist."}
              {actionModal === "block" && "This will permanently freeze the account and add to fraud blacklist."}
            </p>

            {["block", "mark_fraud"].includes(actionModal) && (
              <div className="mb-4">
                <label className="text-sm font-medium mb-1 block">Reason (Required)</label>
                <input
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border"
                  placeholder="Enter reason..."
                />
              </div>
            )}

            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block">Notes (Optional)</label>
              <textarea
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border"
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setActionModal(null); setActionReason(""); setActionNotes(""); }}
                className="flex-1 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(complaintIdForAction, actionModal)}
                disabled={processing}
                className={`flex-1 px-4 py-2 rounded-lg text-white ${
                  actionModal === "clear" ? "bg-green-600 hover:bg-green-700" :
                  actionModal === "mark_fraud" ? "bg-red-800 hover:bg-red-900" :
                  actionModal === "block" ? "bg-gray-700 hover:bg-gray-800" :
                  "bg-purple-600 hover:bg-purple-700"
                } ${processing ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {processing ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
