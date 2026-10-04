import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api_url } from "../config";
import Ionicons from "../components/Icon";

const FraudReport = ({ navigation }) => {
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!account) {
      Alert.alert("Missing Info", "Account number is required.");
      return;
    }
    if (!reason) {
      Alert.alert("Missing Info", "Please describe the issue.");
      return;
    }

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert("Session Expired", "Please log in again.");
        return;
      }

      const body = { accountNumber: account, ifsc, reason };
      console.log("[FRAUD REPORT] Submitting:", body);

      const res = await axios.post(`${api_url}/txns/report`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("[FRAUD REPORT] Response:", res.data);
      Alert.alert("Success", res.data.message || "Fraud report submitted.");
      setAccount("");
      setIfsc("");
      setReason("");
    } catch (err) {
      console.error("[FRAUD REPORT] Error:", err.response?.data, "Status:", err.response?.status);
      Alert.alert(
        "Error",
        err.response?.data?.error || "Failed to submit fraud report."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.main}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Fraud</Text>
      </View>

      <ScrollView style={styles.container}>
        {/* ALERT BANNER */}
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}><Ionicons name="warning-outline" size={17} color="#A66300" /> Important</Text>
          <Text style={styles.alertText}>
            If you suspect unauthorized transactions, immediately report the
            account to help us secure your money.
          </Text>
        </View>

        {/* FORM CARD */}
        <View style={styles.card}>
          <Text style={styles.label}>Account Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter victim account number"
            keyboardType="numeric"
            value={account}
            onChangeText={setAccount}
            placeholderTextColor="#777"
          />

          <Text style={styles.label}>IFSC Code (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter IFSC Code"
            autoCapitalize="characters"
            value={ifsc}
            onChangeText={setIfsc}
            placeholderTextColor="#777"
          />

          <Text style={styles.label}>Describe the Issue</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Explain what happened..."
            multiline
            numberOfLines={4}
            value={reason}
            onChangeText={setReason}
            placeholderTextColor="#777"
          />
        </View>

        {/* BUTTON */}
        <TouchableOpacity
          style={[styles.submitButton, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitText}>
            {loading ? "Submitting..." : "Submit Report"}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  main: { flex: 1, backgroundColor: "#F1E9FF" },

  header: {
    backgroundColor: "#5E2CED",
    paddingTop: 50,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  container: {
    paddingHorizontal: 20,
  },

  alertBox: {
    backgroundColor: "#FFE8C9",
    padding: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  alertTitle: { color: "#A66300", fontWeight: "bold", fontSize: 16 },
  alertText: { color: "#6A4A00", marginTop: 5 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    marginTop: 20,
    elevation: 3,
  },

  label: {
    fontWeight: "bold",
    marginBottom: 5,
    color: "#555",
  },

  input: {
    backgroundColor: "#F8F8FF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    fontSize: 15,
    color: "#000",
  },

  multiline: { height: 120, textAlignVertical: "top" },

  submitButton: {
    backgroundColor: "#5E2CED",
    padding: 15,
    borderRadius: 15,
    marginTop: 20,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});

export default FraudReport;
