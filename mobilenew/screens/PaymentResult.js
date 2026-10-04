import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { formatINR } from "../utils/formatCurrency";
import Ionicons from "../components/Icon";

const RESULT_STATES = {
  success: {
    title: "Payment Successful",
    icon: "checkmark-circle",
    color: "#16A34A",
    description: "Your payment has been processed.",
  },
  scheduled: {
    title: "Payment Protected",
    icon: "warning-outline",
    color: "#D97706",
    description: "This payment is held for security review and is not completed yet.",
  },
  offline: {
    title: "Saved Offline",
    icon: "time-outline",
    color: "#2563EB",
    description: "This payment has not been completed. It is waiting to retry when the network is available.",
  },
};

export default function PaymentResult({ route, navigation }) {
  const {
    status = "offline",
    amount,
    receiver,
    txnId,
    balanceAfter,
    message,
    delayReason,
    resultAt,
  } = route.params || {};
  const result = RESULT_STATES[status] || RESULT_STATES.offline;
  const date = resultAt ? new Date(resultAt) : new Date();
  const description = status === "scheduled"
    ? delayReason || message || result.description
    : status === "offline"
      ? message || result.description
      : result.description;

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: `${result.color}18` }]}>
        <Ionicons name={result.icon} size={40} color={result.color} />
      </View>
      <Text style={styles.title}>{result.title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.details}>
        <Detail label="Amount" value={formatINR(amount)} />
        <Detail label="Receiver UPI ID" value={receiver || "—"} />
        {txnId ? <Detail label="Transaction ID" value={txnId} /> : null}
        {status === "success" && balanceAfter != null
          ? <Detail label="Remaining balance" value={formatINR(balanceAfter)} />
          : null}
        <Detail label="Date / time" value={date.toLocaleString()} />
      </View>

      <TouchableOpacity style={styles.doneButton} onPress={() => navigation.replace("Dashboard")}>
        <Text style={styles.doneText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

function Detail({ label, value }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", padding: 24 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  title: { color: "#0F172A", fontSize: 25, fontWeight: "700", textAlign: "center" },
  description: { color: "#64748B", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8, maxWidth: 440 },
  details: { width: "100%", maxWidth: 480, backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 18, marginTop: 28, borderWidth: 1, borderColor: "#E2E8F0" },
  detail: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  label: { color: "#64748B", fontSize: 13, marginBottom: 4 },
  value: { color: "#0F172A", fontSize: 15, fontWeight: "600" },
  doneButton: { width: "100%", maxWidth: 480, backgroundColor: "#5E2CED", padding: 15, borderRadius: 12, alignItems: "center", marginTop: 24 },
  doneText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
