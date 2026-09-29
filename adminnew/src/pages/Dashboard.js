import { useEffect, useState } from "react";
import { Users, Skull, Shield, Clock, FileText, Ban } from "lucide-react";
import StatCard from "../components/StatCard";
import LineChart from "../components/LineChart";
import DonutChart from "../components/DonutChart";
import { getAdminStatsSummary, getTransactionChart, getCreditDebitStats } from "../api/dashboard.api";
import { getFraudStats, getSuspiciousTxnStats } from "../api/fraud.api";
import { formatINR } from "../utils/formatCurrency";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [fraudStats, setFraudStats] = useState(null);
  const [suspiciousTxnStats, setSuspiciousTxnStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [donutData, setDonutData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try {
      setError(null);
      const [statsRes, chartRes, donutRes, fraudStatsRes, txnStatsRes] = await Promise.all([
        getAdminStatsSummary(), getTransactionChart(), getCreditDebitStats(),
        getFraudStats(), getSuspiciousTxnStats()
      ]);
      setStats(statsRes.data?.stats || statsRes.data);
      setFraudStats(fraudStatsRes.data || {});
      setSuspiciousTxnStats(txnStatsRes.data?.stats || {});
      setChartData(chartRes.data);
      setDonutData(donutRes.data);
    } catch (err) {
      console.error("Dashboard load failed", err);
      setError("Failed to load dashboard data. Please try again.");
    }
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={loadDashboard} className="px-4 py-2 bg-green-600 text-white rounded-lg">Retry</button>
      </div>
    );
  }

  if (!stats) return <div className="p-6 text-muted">Loading dashboard...</div>;

  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-muted mb-6">Banking operations summary</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Users" value={stats.totalUsers || 0} type="users" />
        <StatCard title="Active Users" value={stats.activeUsers || 0} type="users" />
        <StatCard title="Transactions Today" value={stats.transactionsToday || 0} type="transactions" />
        <StatCard title="Total Balance" value={formatINR(stats.totalBalance)} type="balance" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MiniStat icon={Shield} label="Suspicious Transactions" value={fraudStats?.suspiciousTransactions || 0} color="gray" />
        <MiniStat icon={FileText} label="Open Complaints" value={stats.pendingComplaints || 0} color="blue" />
        <MiniStat icon={Clock} label="Hold for Review" value={stats.holdReview || 0} color="teal" />
        <MiniStat icon={Users} label="Under Investigation" value={stats.underReview || 0} color="purple" />
        <MiniStat icon={Skull} label="Confirmed Fraud" value={suspiciousTxnStats?.confirmedFraud || 0} color="red" />
        <MiniStat icon={Ban} label="Blacklisted Accounts" value={stats.fraudAccounts || 0} color="slate" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2 bg-card dark:bg-darkcard p-6 rounded-xl border">
          <h3 className="text-sm font-semibold text-muted mb-4">7-Day Transaction Volume</h3>
          <LineChart data={chartData} />
        </div>
        <div className="bg-card dark:bg-darkcard p-6 rounded-xl border">
          <h3 className="text-sm font-semibold text-muted mb-4">Credit vs Debit</h3>
          <DonutChart data={donutData} />
        </div>
      </div>
    </>
  );
}

function MiniStat({ icon: Icon, label, value, color }) {
  const styles = {
    gray: "bg-gray-50 text-gray-600 dark:bg-gray-900/20",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/20",
    teal: "bg-teal-50 text-teal-600 dark:bg-teal-900/20",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20",
    red: "bg-red-50 text-red-600 dark:bg-red-900/20",
    slate: "bg-slate-50 text-slate-600 dark:bg-slate-900/20",
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card dark:bg-darkcard">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${styles[color] || styles.blue}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}