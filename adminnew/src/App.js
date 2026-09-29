import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./layout/Layout";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Funds from "./pages/Funds";
import Fraud from "./pages/Fraud";
import LiveChat from "./pages/LiveChat";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import ScheduledTxns from "./pages/ScheduledTxns";
import Blockchain from "./pages/Blockchain";
import AdminLogin from "./pages/AdminLogin";

function isTokenValid() {
  const token = localStorage.getItem("token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    localStorage.removeItem("token");
    return false;
  }
}

function ProtectedRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    setValid(isTokenValid());
    setChecking(false);
  }, []);

  if (checking) return null;
  if (!valid) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/users" element={<Users />} />
                <Route path="/funds" element={<Funds />} />
                <Route path="/fraud" element={<Fraud />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/scheduled" element={<ScheduledTxns />} />
                <Route path="/live-chat" element={<LiveChat />} />
                <Route path="/blockchain" element={<Blockchain />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
