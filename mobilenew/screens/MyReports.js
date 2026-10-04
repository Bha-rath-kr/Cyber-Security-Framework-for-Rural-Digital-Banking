import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatINR } from "../utils/formatCurrency";
import BottomToolbar from "./bottomToolBar";
import Ionicons from "../components/Icon";

const STATUS_CONFIG = {
  PENDING: { color: "#F59E0B", bg: "#FEF3C7", icon: "time-outline", label: "Pending" },
  UNDER_REVIEW: { color: "#3B82F6", bg: "#DBEAFE", icon: "search-outline", label: "Under Review" },
  ACCEPTED: { color: "#16A34A", bg: "#DCFCE7", icon: "checkmark-circle-outline", label: "Accepted" },
  REJECTED: { color: "#DC2626", bg: "#FEE2E2", icon: "close-circle-outline", label: "Rejected" },
  MARKED_FRAUD: { color: "#991B1B", bg: "#FECACA", icon: "warning-outline", label: "Fraud Marked" },
  SUSPENDED: { color: "#EA580C", bg: "#FFEDD5", icon: "pause-circle-outline", label: "Suspended" },
  BLOCKED: { color: "#1F2937", bg: "#E5E7EB", icon: "ban-outline", label: "Blocked" },
  UNDER_INVESTIGATION: { color: "#7C3AED", bg: "#EDE9FE", icon: "shield-checkmark-outline", label: "Investigating" },
  ACTION_TAKEN: { color: "#059669", bg: "#D1FAE5", icon: "hand-left-outline", label: "Action Taken" },
  RESOLVED: { color: "#0D9488", bg: "#CCFBF1", icon: "checkmark-done-circle-outline", label: "Resolved" },
};

const SEVERITY_CONFIG = {
  LOW: { color: "#6B7280", bg: "#F3F4F6", label: "Low" },
  MEDIUM: { color: "#F59E0B", bg: "#FEF3C7", label: "Medium" },
  HIGH: { color: "#EF4444", bg: "#FEE2E2", label: "High" },
  CRITICAL: { color: "#991B1B", bg: "#FECACA", label: "Critical" },
};

const MyReportsScreen = ({ navigation }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("ALL");

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${api_url}/reports/my-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReports(res.data.reports);
    } catch (err) {
      console.error("Load reports error:", err);
      Alert.alert("Error", "Failed to load reports");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReports();
  };

  const handleTrackComplaint = async (complaintId) => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${api_url}/reports/track/${complaintId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      let timelineText = `Status: ${data.status}\n`;
      if (data.timeline && data.timeline.length > 0) {
        timelineText += "\nTimeline:\n";
        data.timeline.forEach((t) => {
          timelineText += `• ${t.status} - ${new Date(t.performedAt).toLocaleDateString()}\n`;
        });
      }
      Alert.alert(`Complaint: ${complaintId}`, timelineText);
    } catch (err) {
      Alert.alert("Error", "Failed to fetch tracking info");
    }
  };

  const filters = ["ALL", "PENDING", "UNDER_REVIEW", "UNDER_INVESTIGATION", "RESOLVED", "REJECTED"];
  const filteredReports = selectedFilter === "ALL"
    ? reports
    : reports.filter((r) => r.status === selectedFilter);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#1E3A8A" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reports</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filters.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, selectedFilter === f && styles.filterBtnActive]}
              onPress={() => setSelectedFilter(f)}
            >
              <Text style={[styles.filterText, selectedFilter === f && styles.filterTextActive]}>
                {f === "ALL" ? "All" : STATUS_CONFIG[f]?.label || f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredReports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyText}>
              {selectedFilter === "ALL" ? "No reports yet" : `No ${selectedFilter.toLowerCase()} reports`}
            </Text>
            <Text style={styles.emptySubtext}>
              {selectedFilter === "ALL" ? "Your transaction reports will appear here" : "Try a different filter"}
            </Text>
          </View>
        ) : (
          filteredReports.map((report) => {
            const statusCfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.PENDING;
            const severityCfg = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.MEDIUM;

            return (
              <TouchableOpacity
                key={report.report_id || report.complaintId}
                style={styles.card}
                onPress={() => handleTrackComplaint(report.complaintId)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                      <Ionicons name={statusCfg.icon} size={14} color={statusCfg.color} />
                      <Text style={[styles.statusText, { color: statusCfg.color }]}>
                        {statusCfg.label}
                      </Text>
                    </View>
                    {report.severity && (
                      <View style={[styles.severityBadge, { backgroundColor: severityCfg.bg }]}>
                        <Text style={[styles.severityText, { color: severityCfg.color }]}>
                          {severityCfg.label}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.dateText}>{formatDate(report.createdAt)}</Text>
                </View>

                <View style={styles.complaintIdRow}>
                  <Ionicons name="ticket-outline" size={14} color="#6B7280" />
                  <Text style={styles.complaintIdText}>{report.complaintId}</Text>
                </View>

                {report.reported_account && (
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnInfoLabel}>Reported Account</Text>
                    <Text style={styles.txnInfoValue}>****{report.reported_account.slice(-4)}</Text>
                  </View>
                )}

                <View style={styles.details}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Issue:</Text>
                    <Text style={styles.detailValue}>{report.report_type?.replace(/_/g, " ")}</Text>
                  </View>

                  {report.amount && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Amount:</Text>
                      <Text style={[styles.detailValue, styles.amountText]}>{formatINR(report.amount)}</Text>
                    </View>
                  )}

                  {report.description && (
                    <View style={styles.descriptionBox}>
                      <Text style={styles.descriptionText} numberOfLines={2}>
                        {report.description}
                      </Text>
                    </View>
                  )}

                  {report.resolution && (
                    <View style={styles.resolutionBox}>
                      <Ionicons name="checkmark-circle" size={18} color="#059669" />
                      <Text style={styles.resolutionText}>{report.resolution}</Text>
                    </View>
                  )}

                  {report.timeline && report.timeline.length > 0 && (
                    <View style={styles.timelineBox}>
                      <Text style={styles.timelineLabel}>Latest Update</Text>
                      <Text style={styles.timelineText}>
                        {report.timeline[report.timeline.length - 1].note || report.timeline[report.timeline.length - 1].status}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <BottomToolbar navigation={navigation} active="Home" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FB" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    backgroundColor: "#1E3A8A",
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  filterBar: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: "#F3F4F6",
  },
  filterBtnActive: { backgroundColor: "#1E3A8A" },
  filterText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  content: { flex: 1, padding: 16 },
  emptyState: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#6B7280", fontSize: 18, fontWeight: "600", marginTop: 12 },
  emptySubtext: { color: "#9CA3AF", fontSize: 14, marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginRight: 8 },
  statusText: { fontSize: 12, fontWeight: "bold", marginLeft: 4 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  severityText: { fontSize: 11, fontWeight: "600" },
  dateText: { color: "#9CA3AF", fontSize: 12 },
  complaintIdRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  complaintIdText: { color: "#6B7280", fontSize: 12, marginLeft: 4, fontWeight: "500" },
  txnInfo: { backgroundColor: "#F3F4F6", padding: 10, borderRadius: 8, marginBottom: 10, flexDirection: "row", justifyContent: "space-between" },
  txnInfoLabel: { fontSize: 12, color: "#6B7280" },
  txnInfoValue: { fontSize: 13, color: "#1F2937", fontWeight: "600" },
  details: {},
  detailRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  detailLabel: { color: "#6B7280", fontSize: 13 },
  detailValue: { color: "#1F2937", fontSize: 13, fontWeight: "500" },
  amountText: { color: "#1E3A8A", fontWeight: "bold" },
  descriptionBox: { marginTop: 6, padding: 10, backgroundColor: "#FEF3C7", borderRadius: 8 },
  descriptionText: { color: "#92400E", fontSize: 12 },
  resolutionBox: { flexDirection: "row", alignItems: "center", marginTop: 10, padding: 10, backgroundColor: "#D1FAE5", borderRadius: 8 },
  resolutionText: { color: "#065F46", fontSize: 13, marginLeft: 6, flex: 1 },
  timelineBox: { marginTop: 8, padding: 10, backgroundColor: "#EEF2FF", borderRadius: 8 },
  timelineLabel: { fontSize: 11, color: "#1E3A8A", fontWeight: "600", marginBottom: 2 },
  timelineText: { fontSize: 12, color: "#374151" },
});

export default MyReportsScreen;
