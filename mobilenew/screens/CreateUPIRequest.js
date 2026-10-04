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
import BottomToolbar from "./bottomToolBar";
import Ionicons from "../components/Icon";
import { formatINR } from "../utils/formatCurrency";

const CreateUPIRequestScreen = ({ navigation }) => {
  const [upiId, setUpiId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState("REQUEST");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!upiId.trim()) {
      Alert.alert("Error", "Enter UPI ID");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      Alert.alert("Error", "Enter valid amount");
      return;
    }

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const res = await axios.post(
        `${api_url}/upi-collect/create`,
        {
          target_upi: upiId.trim(),
          amount: Number(amount),
          description: description.trim(),
          intent,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.is_suspicious) {
        Alert.alert(
          "Request Created (Flagged)",
          `Your request has been created but flagged: ${res.data.flags.join(", ")}`,
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert("Success", "UPI request sent successfully", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err) {
      Alert.alert("Error", err.response?.data?.error || "Failed to create request");
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
        <Text style={styles.headerTitle}>Create UPI Request</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>What would you like to do?</Text>
          <View style={styles.intentRow}>
            <TouchableOpacity
              style={[styles.intentBtn, intent === "REQUEST" && styles.intentBtnActive]}
              onPress={() => setIntent("REQUEST")}
            >
              <Ionicons
                name="arrow-down-circle"
                size={24}
                color={intent === "REQUEST" ? "#1E3A8A" : "#6B7280"}
              />
              <Text style={[styles.intentBtnText, intent === "REQUEST" && styles.intentBtnTextActive]}>
                Request Money
              </Text>
              <Text style={styles.intentDesc}>Get payment from someone</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.intentBtn, intent === "SEND" && styles.intentBtnActive]}
              onPress={() => setIntent("SEND")}
            >
              <Ionicons
                name="arrow-up-circle"
                size={24}
                color={intent === "SEND" ? "#1E3A8A" : "#6B7280"}
              />
              <Text style={[styles.intentBtnText, intent === "SEND" && styles.intentBtnTextActive]}>
                Send Request
              </Text>
              <Text style={styles.intentDesc}>Ask them to send money</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>UPI ID</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., john@okhdfcbank"
            value={upiId}
            onChangeText={setUpiId}
            autoCapitalize="none"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Amount (₹)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Note (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What's this for?"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Preview</Text>
          <View style={styles.previewCard}>
            <Ionicons
              name={intent === "REQUEST" ? "arrow-down" : "arrow-up"}
              size={32}
              color={intent === "REQUEST" ? "#16A34A" : "#DC2626"}
            />
            <View style={styles.previewContent}>
              <Text style={styles.previewIntent}>
                {intent === "REQUEST" ? "You will RECEIVE" : "You will SEND"}
              </Text>
              <Text style={styles.previewAmount}>{formatINR(amount)}</Text>
              <Text style={styles.previewTo}>
                {intent === "REQUEST" ? "from" : "to"} {upiId || "UPI ID"}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.disabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {intent === "REQUEST" ? "Send Request" : "Create Send Request"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <BottomToolbar navigation={navigation} active="Home" />
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
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: "#F3F4F6", borderRadius: 12, padding: 14, fontSize: 16, color: "#1F2937" },
  textArea: { height: 80, textAlignVertical: "top" },
  intentRow: { flexDirection: "row", gap: 12 },
  intentBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  intentBtnActive: { borderColor: "#1E3A8A", backgroundColor: "#EEF2FF" },
  intentBtnText: { fontWeight: "600", marginTop: 8, color: "#374151" },
  intentBtnTextActive: { color: "#1E3A8A" },
  intentDesc: { fontSize: 11, color: "#6B7280", marginTop: 4 },
  preview: { marginBottom: 16 },
  previewTitle: { fontSize: 14, fontWeight: "600", color: "#6B7280", marginBottom: 8 },
  previewCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  previewContent: { marginLeft: 16 },
  previewIntent: { fontSize: 14, color: "#6B7280" },
  previewAmount: { fontSize: 24, fontWeight: "bold", color: "#1E3A8A" },
  previewTo: { fontSize: 14, color: "#6B7280" },
  submitBtn: {
    backgroundColor: "#1E3A8A",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 100,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  disabled: { opacity: 0.6 },
});

export default CreateUPIRequestScreen;