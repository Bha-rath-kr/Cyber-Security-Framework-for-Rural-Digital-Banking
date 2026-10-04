import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "../components/Icon";
import { formatINR } from "../utils/formatCurrency";

const REPORT_TYPES = [
  { value: "UNAUTHORIZED", label: "Unauthorized Transaction", desc: "Transaction I didn't make", icon: "shield-outline" },
  { value: "WRONG_RECIPIENT", label: "Wrong Recipient", desc: "Sent to wrong account", icon: "person-remove-outline" },
  { value: "DUPLICATE", label: "Duplicate Transaction", desc: "Same transaction charged twice", icon: "copy-outline" },
  { value: "NOT_RECEIVED", label: "Not Received", desc: "Money debited but not received", icon: "download-outline" },
  { value: "FRAUD", label: "Suspected Fraud", desc: "Suspect fraudulent activity", icon: "warning-outline" },
  { value: "OTHER", label: "Other Issue", desc: "Any other problem", icon: "help-circle-outline" },
];

const ReportTransactionScreen = ({ navigation, route }) => {
  const { transaction } = route.params || {};
  const [selectedType, setSelectedType] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert("Error", "Please select a report type");
      return;
    }

    if (!transaction?.txn_id) {
      Alert.alert("Error", "Transaction ID is required");
      return;
    }

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");

      const payload = {
        transaction_id: transaction.txn_id,
        report_type: selectedType,
        description: description.trim() || selectedType,
        reported_account: transaction.to_account || transaction.from_account || "",
        amount: transaction.amount || 0,
        txn_type: transaction.type || "BANK_TRANSFER",
        upi_id: transaction.to_upi || transaction.from_upi || "",
      };

      console.log("[REPORT] Payload:", JSON.stringify(payload, null, 2));

      const res = await axios.post(
        `${api_url}/reports/create`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const complaintId = res.data.complaintId || res.data.report_id;

      Alert.alert(
        "Report Submitted",
        `Your complaint has been filed.\n\nTracking ID: ${complaintId}\n\nYou can track the status in My Reports.`,
        [
          { text: "View Status", onPress: () => navigation.navigate("MyReports") },
          { text: "Done", onPress: () => navigation.goBack() },
        ]
      );
    } catch (err) {
      console.error("[REPORT] Error:", err.response?.data, "Status:", err.response?.status);
      const errorMsg = err.response?.data?.error || "Failed to submit report";
      Alert.alert("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Fraud</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {transaction && (
          <View style={styles.txnCard}>
            <View style={styles.txnCardHeader}>
              <Ionicons name="receipt-outline" size={20} color="#1E3A8A" />
              <Text style={styles.txnCardTitle}>Transaction Details</Text>
            </View>
            <View style={styles.txnDetails}>
              <View style={styles.txnRow}>
                <Text style={styles.txnKey}>Transaction ID</Text>
                <Text style={styles.txnValue}>{transaction.txn_id}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.txnRow}>
                <Text style={styles.txnKey}>Amount</Text>
                <Text style={[styles.txnValue, styles.amountText]}>{formatINR(transaction.amount)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.txnRow}>
                <Text style={styles.txnKey}>Type</Text>
                <Text style={[styles.txnValue, transaction.type === "DEBIT" ? styles.debitText : styles.creditText]}>
                  {transaction.type}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.txnRow}>
                <Text style={styles.txnKey}>Date</Text>
                <Text style={styles.txnValue}>
                  {transaction.createdAt ? new Date(transaction.createdAt).toLocaleDateString() : "N/A"}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Issue Type</Text>

          {REPORT_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[styles.typeCard, selectedType === type.value && styles.typeCardSelected]}
              onPress={() => setSelectedType(type.value)}
            >
              <Ionicons
                name={type.icon}
                size={22}
                color={selectedType === type.value ? "#1E3A8A" : "#9CA3AF"}
              />
              <View style={styles.typeTextContainer}>
                <Text style={[styles.typeLabel, selectedType === type.value && styles.typeLabelSelected]}>
                  {type.label}
                </Text>
                <Text style={styles.typeDesc}>{type.desc}</Text>
              </View>
              <Ionicons
                name={selectedType === type.value ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={selectedType === type.value ? "#1E3A8A" : "#D1D5DB"}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Details</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Describe what happened..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#1E3A8A" />
          <Text style={styles.infoText}>
            Our fraud team will review your complaint within 24-48 hours. You will receive an SMS and in-app notification with updates.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.disabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>Submit Complaint</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FB" },
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
  txnCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  txnCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  txnCardTitle: { fontSize: 15, fontWeight: "600", color: "#1E3A8A", marginLeft: 8 },
  txnDetails: {},
  txnRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  txnKey: { color: "#6B7280", fontSize: 13 },
  txnValue: { color: "#1F2937", fontSize: 14, fontWeight: "500" },
  amountText: { color: "#1E3A8A", fontWeight: "bold", fontSize: 16 },
  debitText: { color: "#DC2626" },
  creditText: { color: "#16A34A" },
  divider: { height: 1, backgroundColor: "#F3F4F6" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#1F2937", marginBottom: 12 },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  typeCardSelected: { borderColor: "#1E3A8A", backgroundColor: "#EEF2FF" },
  typeTextContainer: { flex: 1, marginLeft: 12 },
  typeLabel: { fontSize: 15, fontWeight: "600", color: "#374151" },
  typeLabelSelected: { color: "#1E3A8A" },
  typeDesc: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  textArea: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#1F2937",
    height: 100,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#EEF2FF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: { flex: 1, marginLeft: 10, color: "#1E3A8A", fontSize: 13, lineHeight: 18 },
  submitBtn: {
    backgroundColor: "#DC2626",
    padding: 16,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  disabled: { opacity: 0.6 },
});

export default ReportTransactionScreen;
