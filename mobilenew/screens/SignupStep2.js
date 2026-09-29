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

export default function SignupStep2({ navigation, route }) {
  const [mpin, setMpin] = useState("");
  const [confirmMpin, setConfirmMpin] = useState("");
  const { name, aadhaar, pan, phone } = route.params;

  const handleSignup = async () => {
    if (mpin.length !== 4 || confirmMpin.length !== 4)
      return Alert.alert("⚠️ Invalid MPIN", "MPIN must be 4 digits");

    if (mpin !== confirmMpin)
      return Alert.alert("⚠️ Mismatch", "MPINs do not match");

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

      Alert.alert("🎉 Account Created", "Welcome to GramBank!");
      navigation.navigate("Login");
    } catch (err) {
      console.error("Signup Error:", err);
      Alert.alert(
        "Signup Failed",
        err.response?.data?.error || "Server not reachable"
      );
    }
  };

  return (
    <View style={styles.main}>
      {/* Header */}
      <View style={styles.header}>
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
          onChangeText={setMpin}
          placeholderTextColor="#777"
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm MPIN"
          keyboardType="numeric"
          secureTextEntry
          maxLength={4}
          value={confirmMpin}
          onChangeText={setConfirmMpin}
          placeholderTextColor="#777"
        />

        <TouchableOpacity style={styles.proceedBtn} onPress={handleSignup}>
          <Text style={styles.proceedText}>Finish & Create Account ➜</Text>
        </TouchableOpacity>
      </View>
    </View>
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
