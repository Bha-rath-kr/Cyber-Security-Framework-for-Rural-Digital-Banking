import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api_url } from "../config";
import Ionicons from "../components/Icon";

export default function SignupStep2({ navigation, route }) {
  const [mpin, setMpin] = useState("");
  const [confirmMpin, setConfirmMpin] = useState("");
  const [mpinMessage, setMpinMessage] = useState("");
  const [confirmMpinMessage, setConfirmMpinMessage] = useState("");
  const { name, aadhaar, pan, phone } = route.params;

  const handleSignup = async () => {
    if (!/^\d{4}$/.test(mpin)) {
      setMpinMessage("MPIN must contain exactly 4 digits.");
      return Alert.alert("Invalid MPIN", "MPIN must be 4 digits");
    }
    setMpinMessage("MPIN format is valid.");

    if (mpin !== confirmMpin) {
      setConfirmMpinMessage("MPINs do not match.");
      return Alert.alert("Mismatch", "MPINs do not match");
    }
    setConfirmMpinMessage("MPINs match.");

    try {
      const res = await axios.post(`${api_url}/users/signup`, {
        name,
        aadhaarNumber: aadhaar,
        panNumber: pan,
        mpin,
        phone
      });

      await AsyncStorage.multiSet([
        ["aadhaarNumber", aadhaar],
        ["userId", res.data.userId || ""],
        ["phoneNumber", phone || ""],
        ["accountNumber", res.data.accountNumber || ""]
      ]);

      Alert.alert("Account Created", "Welcome to GramBank!");
      navigation.navigate("Login");
    } catch (err) {
      console.error("Signup Error:", err);
      Alert.alert(
        "Signup Failed",
        err.response?.data?.error || err.response?.data?.message || "Server not reachable"
      );
    }
  };

  return (
    <View style={styles.main}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}><Ionicons name="arrow-back" size={16} color="#fff" /> Back</Text>
        </TouchableOpacity>
        <Text style={styles.appName}>GramBank</Text>
        <Text style={styles.headerTitle}>Secure Your Account</Text>
        <Text style={styles.headerSub}>
          Set a 4-digit MPIN to protect your banking
        </Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Create MPIN</Text>

        <TextInput
          style={styles.input}
          placeholder="Enter 4-digit MPIN"
          keyboardType="numeric"
          secureTextEntry
          maxLength={4}
          value={mpin}
          onChangeText={(value) => {
            const formatted = value.replace(/[^\d]/g, "").slice(0, 4);
            setMpin(formatted);
            setMpinMessage(formatted ? (/^\d{4}$/.test(formatted) ? "MPIN format is valid." : "MPIN must contain exactly 4 digits.") : "");
            if (confirmMpin) setConfirmMpinMessage(formatted === confirmMpin ? "MPINs match." : "MPINs do not match.");
          }}
          onBlur={() => setMpinMessage(mpin ? (/^\d{4}$/.test(mpin) ? "MPIN format is valid." : "MPIN must contain exactly 4 digits.") : "MPIN is required.")}
          placeholderTextColor="#777"
        />
        <ValidationMessage message={mpinMessage} valid={mpinMessage === "MPIN format is valid."} />

        <TextInput
          style={styles.input}
          placeholder="Confirm MPIN"
          keyboardType="numeric"
          secureTextEntry
          maxLength={4}
          value={confirmMpin}
          onChangeText={(value) => {
            const formatted = value.replace(/[^\d]/g, "").slice(0, 4);
            setConfirmMpin(formatted);
            setConfirmMpinMessage(formatted ? (formatted === mpin ? "MPINs match." : "MPINs do not match.") : "");
          }}
          onBlur={() => setConfirmMpinMessage(confirmMpin ? (confirmMpin === mpin ? "MPINs match." : "MPINs do not match.") : "Confirm MPIN is required.")}
          placeholderTextColor="#777"
        />
        <ValidationMessage message={confirmMpinMessage} valid={confirmMpinMessage === "MPINs match."} />

        <TouchableOpacity style={styles.proceedBtn} onPress={handleSignup}>
          <Text style={styles.proceedText}>Finish & Create Account <Ionicons name="arrow-forward" size={16} color="#fff" /></Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ValidationMessage({ message, valid }) {
  if (!message) return null;
  return (
    <Text style={[styles.validationMessage, valid ? styles.validMessage : styles.errorMessage]}>
      <Ionicons
        name={valid ? "checkmark-circle-outline" : "close-circle-outline"}
        size={14}
        color={valid ? "#15803D" : "#DC2626"}
      />{" "}{message}
    </Text>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: "#5e2ced"
  },

  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30
  },
  backText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 14
  },

  appName: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "bold"
  },

  headerTitle: {
    color: "#fff",
    fontSize: 20,
    marginTop: 8,
    fontWeight: "600"
  },

  headerSub: {
    color: "#ddd",
    marginTop: 4
  },

  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    marginTop: -10
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#5e2ced",
    marginBottom: 8,
    marginTop: 10
  },

  input: {
    width: "100%",
    backgroundColor: "#f3f1ff",
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    letterSpacing: 2,
    textAlign: "center",
    color: "#000",
    marginBottom: 12
  },
  validationMessage: {
    fontSize: 13,
    marginTop: -7,
    marginBottom: 12,
    paddingHorizontal: 4,
    textAlign: "center"
  },
  errorMessage: { color: "#DC2626" },
  validMessage: { color: "#15803D" },

  proceedBtn: {
    backgroundColor: "#5e2ced",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10
  },

  proceedText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold"
  }
});
