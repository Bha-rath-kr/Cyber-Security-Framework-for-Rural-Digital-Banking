import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomToolbar from "./bottomToolBar";
import Ionicons from "../components/Icon";
import { formatINR } from "../utils/formatCurrency";
import { verifyMpin } from "../utilitis/verifyMpin";

const UPIRequestsScreen = ({ navigation }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otp, setOtp] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [warningModalVisible, setWarningModalVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [upiPin, setUpiPin] = useState("");
  const pinVerificationInFlight = React.useRef(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${api_url}/upi-collect/incoming`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRequests(res.data.requests);
    } catch (err) {
      Alert.alert("Error", "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request) => {
    if (request.is_suspicious && !request.warning_acknowledged) {
      setSelectedRequest(request);
      setWarningModalVisible(true);
      return;
    }
    setSelectedRequest(request);
    setPinModalVisible(true);
  };

  const handlePinSubmit = async () => {
    if (actionLoading || pinVerificationInFlight.current) return;
    if (!/^\d{4}$/.test(upiPin)) {
      Alert.alert("Invalid MPIN", "Enter your 4-digit GramBank MPIN.");
      return;
    }

    pinVerificationInFlight.current = true;
    setActionLoading(true);
    try {
      await verifyMpin(upiPin);
    } catch (error) {
      Alert.alert(
        error.response?.status === 401 ? "Incorrect MPIN" : "MPIN verification failed",
        error.response?.data?.error || error.message || "Could not verify your GramBank MPIN."
      );
      return;
    } finally {
      pinVerificationInFlight.current = false;
      setActionLoading(false);
    }

    setPinModalVisible(false);
    setUpiPin("");

    const req = selectedRequest;
    setSelectedRequest(null);

    if (Number(req.amount) < 10000) {
      proceedWithApproval(req);
    } else {
      await sendOtpForApproval(req);
    }
  };

  const sendOtpForApproval = async (request) => {
    try {
      setActionLoading(true);
      const token = await AsyncStorage.getItem("token");
      await axios.post(
        `${api_url}/upi-collect/send-otp`,
        { request_id: request.request_id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOtpModalVisible(true);
    } catch (err) {
      Alert.alert("Error", err.response?.data?.error || "Failed to send OTP");
    } finally {
      setActionLoading(false);
    }
  };

  const proceedWithApproval = async (request) => {
    try {
      setActionLoading(true);
      const token = await AsyncStorage.getItem("token");
      const res = await axios.post(
        `${api_url}/upi-collect/respond`,
        { request_id: request.request_id, action: "APPROVE" },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert(
        request.intent === "SEND" ? "Money Sent" : "Request Approved",
        res.data.message
      );
      setSelectedRequest(null);
      loadRequests();
    } catch (err) {
      Alert.alert("Error", err.response?.data?.error || "Transaction failed");
    } finally {
      setActionLoading(false);
      setSelectedRequest(null);
    }
  };

  const submitApproval = async () => {
    if (!otp || otp.length !== 4) {
      Alert.alert("Error", "Enter valid 4-digit OTP");
      return;
    }

    try {
      setActionLoading(true);
      const token = await AsyncStorage.getItem("token");
      const res = await axios.post(
        `${api_url}/upi-collect/respond`,
        { request_id: selectedRequest.request_id, action: "APPROVE", otp },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert(
        selectedRequest.intent === "SEND" ? "Money Sent" : "Request Approved",
        res.data.message
      );
      setOtpModalVisible(false);
      setOtp("");
      setSelectedRequest(null);
      loadRequests();
    } catch (err) {
      Alert.alert("Error", err.response?.data?.error || "Transaction failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = (request) => {
    Alert.alert(
      "Reject Request",
      `Are you sure you want to reject this ${request.intent === "SEND" ? "send" : "payment"} request of ${formatINR(request.amount)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => rejectRequest(request),
        },
      ]
    );
  };

  const rejectRequest = async (request) => {
    try {
      setActionLoading(true);
      const token = await AsyncStorage.getItem("token");
      await axios.post(
        `${api_url}/upi-collect/respond`,
        { request_id: request.request_id, action: "REJECT" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert("Success", "Request rejected");
      loadRequests();
    } catch (err) {
      Alert.alert("Error", "Failed to reject request");
    } finally {
      setActionLoading(false);
    }
  };

  const acknowledgeWarning = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      await axios.post(
        `${api_url}/upi-collect/acknowledge-warning`,
        { request_id: selectedRequest.request_id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setWarningModalVisible(false);
      setPinModalVisible(true);
    } catch (err) {
      Alert.alert("Error", "Failed to acknowledge warning");
    }
  };

  const getRiskColor = (score) => {
    if (score >= 70) return "#DC2626";
    if (score >= 40) return "#F59E0B";
    return "#6B7280";
  };

  const getRiskLabel = (score) => {
    if (score >= 70) return "HIGH RISK";
    if (score >= 40) return "MEDIUM RISK";
    return "LOW RISK";
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
        <Text style={styles.headerTitle}>UPI Requests</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyText}>No pending requests</Text>
          </View>
        ) : (
          requests.map((req) => (
            <View key={req.request_id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.intentBadge, req.intent === "SEND" ? styles.sendBadge : styles.requestBadge]}>
                  <Text style={styles.intentText}>{req.intent_display}</Text>
                </View>
                {req.is_suspicious && (
                  <View style={[styles.riskBadge, { backgroundColor: getRiskColor(req.risk_score) }]}>
                    <Ionicons name="warning" size={12} color="#fff" />
                    <Text style={styles.riskText}>{getRiskLabel(req.risk_score)}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.intentDescription}>{req.intent_description}</Text>

              <Text style={styles.amountText}>{formatINR(req.amount)}</Text>

              {req.description ? (
                <Text style={styles.description}>Note: {req.description}</Text>
              ) : null}

              <View style={styles.requesterInfo}>
                <Text style={styles.requesterLabel}>From:</Text>
                <Text style={styles.requesterName}>{req.requester_name}</Text>
                <Text style={styles.requesterUpi}>{req.requester_upi}</Text>
              </View>

              {req.is_suspicious && req.suspicious_flags.length > 0 && (
                <View style={styles.warningBox}>
                  <Ionicons name="warning" size={20} color="#991B1B" />
                  <View style={styles.warningContent}>
                    <Text style={styles.warningTitle}>Security Warning</Text>
                    {req.suspicious_flags.map((flag, idx) => (
                      <Text key={idx} style={styles.warningFlag}>• {flag.replace(/_/g, " ")}</Text>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.footer}>
                <Text style={styles.expiry}>Expires: {formatDate(req.expires_at)}</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.rejectBtn, actionLoading && styles.disabled]}
                  onPress={() => handleReject(req)}
                  disabled={actionLoading}
                >
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, actionLoading && styles.disabled]}
                  onPress={() => handleApprove(req)}
                  disabled={actionLoading}
                >
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={warningModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.warningModal}>
            <Ionicons name="warning" size={48} color="#DC2626" />
            <Text style={styles.warningModalTitle}>Security Alert</Text>
            <Text style={styles.warningModalText}>
              This request has been flagged as potentially fraudulent:
            </Text>
            <View style={styles.warningModalFlags}>
              {selectedRequest?.suspicious_flags?.map((flag, idx) => (
                <Text key={idx} style={styles.warningModalFlag}>• {flag.replace(/_/g, " ")}</Text>
              ))}
            </View>
            <Text style={styles.warningModalText}>
              Approving will {selectedRequest?.intent === "SEND" ? "send money FROM" : "request money FROM"} your account.
            </Text>
            <View style={styles.warningModalActions}>
              <TouchableOpacity
                style={styles.warningCancelBtn}
                onPress={() => {
                  setWarningModalVisible(false);
                  setSelectedRequest(null);
                }}
              >
                <Text style={styles.warningCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.warningProceedBtn}
                onPress={acknowledgeWarning}
              >
                <Text style={styles.warningProceedText}>I Understand, Proceed</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={() => { setPinModalVisible(false); setUpiPin(""); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.otpModal}>
            <Text style={styles.otpModalTitle}>
              Confirm with GramBank MPIN
            </Text>
            <Text style={styles.otpModalSubtitle}>
              Enter the same 4-digit MPIN you use to sign in to GramBank.
            </Text>
            <TextInput
              style={styles.otpInput}
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              placeholder="****"
              value={upiPin}
              onChangeText={setUpiPin}
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.otpModalActions}>
              <TouchableOpacity
                style={styles.otpCancelBtn}
                onPress={() => {
                  setPinModalVisible(false);
                  setUpiPin("");
                }}
              >
                <Text style={styles.otpCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.otpConfirmBtn, actionLoading && styles.disabled]}
                onPress={handlePinSubmit}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.otpConfirmText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={otpModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.otpModal}>
            <Text style={styles.otpModalTitle}>Enter OTP</Text>
            <Text style={styles.otpModalSubtitle}>
              OTP sent to your registered mobile number
            </Text>
            <TextInput
              style={styles.otpInput}
              keyboardType="numeric"
              maxLength={4}
              placeholder="4-digit OTP"
              value={otp}
              onChangeText={setOtp}
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.otpModalActions}>
              <TouchableOpacity
                style={styles.otpCancelBtn}
                onPress={() => {
                  setOtpModalVisible(false);
                  setOtp("");
                  setSelectedRequest(null);
                }}
              >
                <Text style={styles.otpCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.otpConfirmBtn, actionLoading && styles.disabled]}
                onPress={submitApproval}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.otpConfirmText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  content: { flex: 1, padding: 16 },
  emptyState: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#9CA3AF", fontSize: 16, marginTop: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  intentBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  sendBadge: { backgroundColor: "#FEE2E2" },
  requestBadge: { backgroundColor: "#DCFCE7" },
  intentText: { fontWeight: "bold", fontSize: 12 },
  riskBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  riskText: { color: "#fff", fontSize: 10, fontWeight: "bold", marginLeft: 4 },
  intentDescription: { fontSize: 16, color: "#1F2937", marginBottom: 12 },
  amountText: { fontSize: 28, fontWeight: "bold", color: "#1E3A8A", marginBottom: 8 },
  description: { color: "#6B7280", marginBottom: 8 },
  requesterInfo: { backgroundColor: "#F3F4F6", padding: 12, borderRadius: 8, marginBottom: 12 },
  requesterLabel: { color: "#6B7280", fontSize: 12 },
  requesterName: { color: "#1F2937", fontWeight: "600" },
  requesterUpi: { color: "#6B7280", fontSize: 12 },
  warningBox: { flexDirection: "row", backgroundColor: "#FEE2E2", padding: 12, borderRadius: 8, marginBottom: 12 },
  warningContent: { marginLeft: 8, flex: 1 },
  warningTitle: { color: "#991B1B", fontWeight: "bold", fontSize: 14 },
  warningFlag: { color: "#991B1B", fontSize: 12 },
  footer: { marginBottom: 12 },
  expiry: { color: "#9CA3AF", fontSize: 12 },
  actions: { flexDirection: "row", gap: 12 },
  rejectBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#FEE2E2", alignItems: "center" },
  rejectBtnText: { color: "#DC2626", fontWeight: "bold" },
  approveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#1E3A8A", alignItems: "center" },
  approveBtnText: { color: "#fff", fontWeight: "bold" },
  disabled: { opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  warningModal: { backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "85%", alignItems: "center" },
  warningModalTitle: { fontSize: 20, fontWeight: "bold", color: "#DC2626", marginTop: 12 },
  warningModalText: { textAlign: "center", marginTop: 12, color: "#374151" },
  warningModalFlags: { marginTop: 12 },
  warningModalFlag: { color: "#991B1B" },
  warningModalActions: { flexDirection: "row", marginTop: 24, gap: 12 },
  warningCancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#E5E7EB", alignItems: "center" },
  warningCancelText: { color: "#374151", fontWeight: "bold" },
  warningProceedBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center" },
  warningProceedText: { color: "#fff", fontWeight: "bold" },
  otpModal: { backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "85%" },
  otpModalTitle: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  otpModalSubtitle: { textAlign: "center", color: "#6B7280", marginTop: 8 },
  otpInput: { backgroundColor: "#F3F4F6", borderRadius: 12, padding: 16, fontSize: 24, textAlign: "center", marginTop: 20, letterSpacing: 8 },
  otpModalActions: { flexDirection: "row", marginTop: 24, gap: 12 },
  otpCancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#E5E7EB", alignItems: "center" },
  otpCancelText: { color: "#374151", fontWeight: "bold" },
  otpConfirmBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#1E3A8A", alignItems: "center" },
  otpConfirmText: { color: "#fff", fontWeight: "bold" },
});

export default UPIRequestsScreen;