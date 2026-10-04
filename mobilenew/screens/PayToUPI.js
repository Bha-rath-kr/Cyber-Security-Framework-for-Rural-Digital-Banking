import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import Ionicons from "../components/Icon";

export default function PayToUPI({ navigation }) {
  const [upiId, setUpiId] = useState("");

  const handleContinue = () => {
    const trimmed = upiId.trim();

    if (!trimmed) {
      Alert.alert("Enter UPI ID", "Please enter a UPI ID like name@bank");
      return;
    }

    if (!trimmed.includes("@")) {
      Alert.alert("Invalid UPI ID", "UPI ID must contain @ (e.g. name@bank)");
      return;
    }

    navigation.navigate("UPIPaymentScreen", {
      upiId: trimmed,
      name: trimmed,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pay to UPI ID</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Enter UPI ID</Text>
        <TextInput
          style={styles.input}
          placeholder="example@upi"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          value={upiId}
          onChangeText={setUpiId}
        />

        <Text style={styles.hint}>
          Enter the UPI ID of the person you want to pay.
        </Text>

        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 45,
    padding: 15,
    backgroundColor: "#5e2ced",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  body: { padding: 20, flex: 1 },
  label: { fontSize: 16, fontWeight: "600", color: "#0F172A", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#000",
    backgroundColor: "#F9FAFB",
  },
  hint: { color: "#64748B", fontSize: 13, marginTop: 8, lineHeight: 18 },
  continueBtn: {
    backgroundColor: "#5e2ced",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 30,
  },
  continueText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
