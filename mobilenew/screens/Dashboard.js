import React, { useEffect, useState } from "react";
import {
  View,Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import Ionicons from "react-native-vector-icons/Ionicons";
import { formatINR } from "../utils/formatCurrency";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomToolbar from "./bottomToolBar";
import { NetworkStatus } from "../utilitis/NetworkStatus";
import { checkPendingCount } from "../utilitis/offlineQueue";

const Dashboard = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upiId, setUpiId] = useState("");
  const [upiQR, setUpiQR] = useState("");
  const [balance, setBalance] = useState(0);
  const [showBalance, setShowBalance] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [upiRequestCount, setUpiRequestCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [accountStatus, setAccountStatus] = useState("ACTIVE");
  const [statusReason, setStatusReason] = useState("");
  const [restrictionLevel, setRestrictionLevel] = useState("none");

  useEffect(() => {
    loadDashboard();
    loadPendingCount();
    loadUpiRequestCount();
    loadReportCount();
  }, []);

  const loadReportCount = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${api_url}/reports/my-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pending = res.data.reports?.filter(r => r.status === "PENDING" || r.status === "UNDER_REVIEW").length || 0;
      setReportCount(pending);
    } catch (e) {}
  };

  const loadUpiRequestCount = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${api_url}/upi-collect/incoming`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUpiRequestCount(res.data.count || 0);
    } catch (e) {}
  };

  const loadPendingCount = async () => {
    const count = await checkPendingCount();
    setPendingCount(count);
  };

  const loadDashboard = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      if (!token) {
        navigation.replace("Login");
        return;
      }

      const res = await axios.get(`${api_url}/txns/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser({ name: res.data.name });
      setBalance(res.data.balance);
      if (res.data.upiId) setUpiId(res.data.upiId);
      if (res.data.upiQR) setUpiQR(res.data.upiQR);
      if (res.data.accountStatus) setAccountStatus(res.data.accountStatus === "CLEARED" ? "ACTIVE" : res.data.accountStatus);
      if (res.data.statusReason) setStatusReason(res.data.statusReason);
      if (res.data.restrictionLevel) setRestrictionLevel(res.data.restrictionLevel);
    } catch (e) {
      Alert.alert("Error", "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={ui.loader}>
        <ActivityIndicator size="large" color="#1E3A8A" />
        <BottomToolbar navigation={navigation} active="Home" />
      </View>
    );
  }

  return (
    <SafeAreaView style={ui.root}>
      <NetworkStatus pendingCount={pendingCount} />

      {/* ================= STICKY HEADER ================= */}
      <View style={ui.header}>
        <View>
          <Text style={ui.hello}>Hi, {user?.name || "User"}</Text>
          <Text style={ui.welcome}>Welcome to GramBank</Text>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate("Settings")}>
          <View style={ui.avatar}>
            <Text style={ui.avatarText}>
              {(user?.name || "U")[0]}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ================= SCROLLABLE CONTENT ================= */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ui.scrollContent}
      >
        {/* BALANCE CARD */}
        <View style={ui.balanceCard}>
          <View style={ui.balanceRow}>
            <Text style={ui.balanceLabel}>Total Balance</Text>
            <TouchableOpacity onPress={() => setShowBalance(!showBalance)}>
              <Ionicons
                name={showBalance ? "eye-outline" : "eye-off-outline"}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>

          <Text style={ui.balance}>
            {showBalance ? formatINR(balance) : "₹••••••"}
          </Text>
        </View>

        {/* SECURITY STATUS CARD */}
        {restrictionLevel !== "none" && (
          <SecurityStatusCard
            status={accountStatus}
            reason={statusReason}
            level={restrictionLevel}
            navigation={navigation}
          />
        )}

        {/* QUICK ACTIONS */}
        <Text style={ui.section}>Quick Actions</Text>

        <View style={ui.quickGrid}>
          <QuickCard
            title="Send to Mobile"
            icon="call-outline"
            onPress={() => navigation.navigate("PaytoMobile")}
          />
          <QuickCard
            title="Pay to UPI ID"
            icon="at-outline"
            onPress={() => navigation.navigate("PayToUPI")}
          />
          <QuickCard
            title="Bank Transfer"
            icon="business-outline"
            onPress={() => navigation.navigate("Transaction")}
          />
          <QuickCard
            title="Receive Money"
            icon="download-outline"
            onPress={() =>
              navigation.navigate("ReceiveMoney", { upiId, upiQR })
            }
          />
          <QuickCard
            title="Check Balance"
            icon="wallet-outline"
            onPress={() => navigation.navigate("CheckBalance")}
          />
          <QuickCard
            title="UPI Requests"
            icon="notifications-outline"
            onPress={() => navigation.navigate("UPIRequests")}
            badge={upiRequestCount}
          />
          <QuickCard
            title="Create Request"
            icon="add-circle-outline"
            onPress={() => navigation.navigate("CreateUPIRequest")}
          />
          <QuickCard
            title="My Reports"
            icon="document-text-outline"
            onPress={() => navigation.navigate("MyReports")}
            badge={reportCount}
          />
          <QuickCard
            title="Help Chat"
            icon="chatbubbles-outline"
            onPress={() => navigation.navigate("ChatBot")}
          />
        </View>

        {/* RBI ADVISORY */}
        <View style={ui.rbi}>
          <Text style={ui.rbiTitle}>RBI Advisory</Text>
          <Text style={ui.rbiText}>
            Never share OTP, PIN or password with anyone.
            GramBank will never ask for these details.
          </Text>
        </View>

        {/* SAFETY */}
        <View style={ui.safeCard}>
          <Text style={ui.safeTitle}>Your Safety Matters</Text>
          <Text style={ui.safeText}>
            Enable biometric login and transaction alerts for enhanced security.
          </Text>
        </View>
      </ScrollView>

      <BottomToolbar navigation={navigation} active="Home" />


    </SafeAreaView>
  );
};

/* =========================================================
   COMPONENTS
========================================================= */

const statusConfig = {
  UNDER_INVESTIGATION: { bg: "#FEF3C7", border: "#F59E0B", icon: "🔍", label: "Under Investigation" },
  UNDER_REVIEW: { bg: "#FEF3C7", border: "#F59E0B", icon: "👁", label: "Under Review" },
  TEMP_FROZEN: { bg: "#FFEDD5", border: "#F97316", icon: "🧊", label: "Temporarily Frozen" },
  FROZEN: { bg: "#FEE2E2", border: "#EF4444", icon: "🔒", label: "Frozen" },
  SUSPENDED: { bg: "#FEE2E2", border: "#EF4444", icon: "🚫", label: "Suspended" },
  BLOCKED: { bg: "#FEE2E2", border: "#DC2626", icon: "⛔", label: "Blocked" },
};

const SecurityStatusCard = ({ status, reason, level, navigation }) => {
  const config = statusConfig[status] || { bg: "#FEE2E2", border: "#EF4444", icon: "⚠️", label: status };
  const isActive = level === "none";

  if (isActive) return null;

  return (
    <View style={[ui.statusCard, { backgroundColor: config.bg, borderLeftColor: config.border }]}>
      <View style={ui.statusHeader}>
        <Text style={ui.statusIcon}>{config.icon}</Text>
        <View style={ui.statusInfo}>
          <Text style={[ui.statusLabel, { color: config.border }]}>{config.label}</Text>
          <Text style={ui.statusReason}>{reason}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[ui.contactBtn, { backgroundColor: config.border }]}
        onPress={() => navigation.navigate("LiveChat")}
      >
        <Text style={ui.contactBtnText}>Contact Support</Text>
      </TouchableOpacity>
    </View>
  );
};

const QuickCard = ({ title, icon, onPress, badge }) => (
  <TouchableOpacity style={ui.quickCard} onPress={onPress}>
    <View style={ui.quickIcon}>
      <Ionicons name={icon} size={22} color="#1E3A8A" />
      {badge > 0 && (
        <View style={ui.badge}>
          <Text style={ui.badgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </View>
    <Text style={ui.quickText}>{title}</Text>
  </TouchableOpacity>
);


/* =========================================================
   STYLES
========================================================= */

const ui = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FB" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#F5F7FB",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  hello: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  welcome: { color: "#64748B" },

  avatar: {
    width: 38,
    height: 38,
    backgroundColor: "#E0E7FF",
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontWeight: "700", color: "#1E3A8A" },

  scrollContent: {
    paddingBottom: 110, // space for bottom bar
  },

  balanceCard: {
    margin: 16,
    borderRadius: 18,
    padding: 20,
    backgroundColor: "#1E3A8A",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: { color: "#C7D2FE" },
  balance: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "bold",
    marginTop: 12,
  },

  statusCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  statusIcon: {
    fontSize: 22,
    marginRight: 10,
    marginTop: 2,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  statusReason: {
    fontSize: 13,
    color: "#475569",
    marginTop: 4,
    lineHeight: 18,
  },
  contactBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  contactBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  section: {
    marginLeft: 16,
    marginTop: 18,
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 12,
  },
  quickCard: {
    width: "48%",
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 14,
    marginBottom: 14,
    alignItems: "center",
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#DC2626",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  quickText: { fontSize: 13, fontWeight: "500", color: "#0F172A" },

  rbi: {
    backgroundColor: "#FEE2E2",
    margin: 16,
    padding: 16,
    borderRadius: 14,
  },
  rbiTitle: { fontWeight: "700", color: "#991B1B" },
  rbiText: { color: "#7F1D1D", marginTop: 6 },

  safeCard: {
    backgroundColor: "#fff",
    margin: 16,
    padding: 18,
    borderRadius: 14,
  },
  safeTitle: { fontWeight: "700", color: "#0F172A" },
  safeText: { marginTop: 6, color: "#475569" },

  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: "#fff",
    borderTopWidth: 0.5,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  bottomItem: { alignItems: "center", flex: 1 },

  qrButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1E3A8A",
    justifyContent: "center",
    alignItems: "center",
    marginTop: -28,
  },
});

export default Dashboard;
