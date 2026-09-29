// screens/SignupStep1.js
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import axios from "axios";
import { api_url } from "../config";

export default function SignupStep1({ navigation }) {
  const [name, setName] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!phone || phone.length !== 10) {
      Alert.alert("⚠️ Invalid Phone", "Enter a valid 10-digit phone number.");
      return;
    }
    try {
      setLoading(true);
      console.log(`[SIGNUP] Calling OTP API at ${api_url}/otp/send for phone: ${phone}`);
      const res = await axios.post(`${api_url}/otp/send`, { phone });
      console.log("[SIGNUP] OTP API Response:", res.data);
      setOtpSent(true);
      if (res.data.otp) {
        setOtp(res.data.otp);
      }
      Alert.alert("📩 OTP Received", `Your OTP is: ${res.data.otp || res.data.message}\n(Auto-filled for development)`);
    } catch (err) {
      console.log("[SIGNUP] OTP send error:", err.response?.data || err.message);
      Alert.alert("Error", err.response?.data?.error || err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndNext = async () => {
    if (!name || !aadhaar || !pan || !phone) {
      Alert.alert("⚠️ Missing Info", "Fill all fields.");
      return;
    }

    if (!otpSent) {
      Alert.alert("⚠️ OTP Required", "Please verify phone first.");
      return;
    }

    if (!otp) {
      Alert.alert("⚠️ Missing OTP", "Enter OTP received.");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${api_url}/otp/verify`, { phone, code: otp });
      Alert.alert("✅ Verified", "OTP verified!");
      navigation.navigate("SignupStep2", { name, aadhaar, pan, phone });
    } catch (err) {
      Alert.alert("❌ Invalid OTP", err.response?.data?.error || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.main}>
      {/* PhonePe style gradient header */}
      <View style={styles.header}>
        <Text style={styles.appName}>GramBank</Text>
        <Text style={styles.headerTitle}>Create your account</Text>
        <Text style={styles.headerSub}>
          Secure banking powered by GramBank
        </Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Personal Details</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
          placeholderTextColor="#777"
        />

        <TextInput
          style={styles.input}
          placeholder="Aadhaar Number"
          keyboardType="numeric"
          maxLength={12}
          value={aadhaar}
          onChangeText={setAadhaar}
          placeholderTextColor="#777"
        />

        <TextInput
          style={styles.input}
          placeholder="PAN Number"
          autoCapitalize="characters"
          maxLength={10}
          value={pan}
          onChangeText={setPan}
          placeholderTextColor="#777"
        />

        <Text style={styles.sectionTitle}>Mobile Verification</Text>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Phone Number"
            keyboardType="numeric"
            maxLength={10}
            value={phone}
            onChangeText={setPhone}
            placeholderTextColor="#777"
          />

          <TouchableOpacity
            style={[
              styles.otpBtn,
              otpSent && { backgroundColor: "#bbb" },
            ]}
            onPress={handleSendOtp}
            disabled={loading || otpSent}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.otpBtnText}>
                {otpSent ? "Sent ✓" : "Get OTP"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {otpSent && (
          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            keyboardType="numeric"
            maxLength={4}
            value={otp}
            onChangeText={setOtp}
            placeholderTextColor="#777"
          />
        )}

        <TouchableOpacity
          style={styles.proceedBtn}
          onPress={handleVerifyAndNext}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.proceedText}>Continue ➜</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: "#5e2ced",
  },

  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },

  appName: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "bold",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 20,
    marginTop: 8,
    fontWeight: "600",
  },

  headerSub: {
    color: "#ddd",
    marginTop: 4,
  },

  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    marginTop: -10,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#5e2ced",
    marginBottom: 8,
    marginTop: 10,
  },

  input: {
    width: "100%",
    backgroundColor: "#f3f1ff",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#000",
    marginBottom: 12,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  otpBtn: {
    backgroundColor: "#5e2ced",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },

  otpBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },

  proceedBtn: {
    backgroundColor: "#5e2ced",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },

  proceedText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
});
