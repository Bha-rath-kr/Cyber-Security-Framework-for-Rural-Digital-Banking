import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import axios from "axios";
import { api_url } from "../config";
import Ionicons from "../components/Icon";

const ForgotPinScreen = ({ navigation }) => {
  const [aadhaar, setAadhaar] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const handleSendOtp = async () => {
    if (!aadhaar || !phone) {
      return Alert.alert("Error", "Enter Aadhaar and registered phone number");
    }

    setLoading(true);
    try {
      const res = await axios.post(`${api_url}/users/forgot-mpin/request`, {
        aadhaarNumber: aadhaar,
        phoneNumber: phone,
      });
      if (res.data.otp) {
        setOtp(res.data.otp);
      }
      Alert.alert("OTP Sent", `Your OTP is: ${res.data.otp || "sent to terminal"}`);
      setOtpSent(true);
      setStep(2);
    } catch (err) {
      Alert.alert("Error", err.response?.data?.error || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (!otp) {
      return Alert.alert("Error", "Enter OTP");
    }
    if (!newPin || newPin.length !== 4) {
      return Alert.alert("Error", "Enter a 4-digit MPIN");
    }
    if (newPin !== confirmPin) {
      return Alert.alert("Error", "MPINs do not match");
    }

    setLoading(true);
    try {
      await axios.post(`${api_url}/users/forgot-mpin/reset`, {
        aadhaarNumber: aadhaar,
        phoneNumber: phone,
        otp,
        newMpin: newPin,
      });
      Alert.alert("Success", "MPIN reset successfully", [
        { text: "OK", onPress: () => navigation.navigate("Login") },
      ]);
    } catch (err) {
      Alert.alert("Error", err.response?.data?.error || "Failed to reset MPIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.main}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}><Ionicons name="arrow-back" size={16} color="#fff" /> Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset MPIN</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          {step === 1 ? "Verify Identity" : "Set New MPIN"}
        </Text>

        {step === 1 ? (
          <>
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
              placeholder="Registered Phone Number"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={setPhone}
              placeholderTextColor="#777"
            />

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleSendOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Send OTP <Ionicons name="arrow-forward" size={16} color="#fff" /></Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Enter OTP"
              keyboardType="numeric"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              placeholderTextColor="#777"
            />

            <TextInput
              style={styles.input}
              placeholder="New 4-Digit MPIN"
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              value={newPin}
              onChangeText={setNewPin}
              placeholderTextColor="#777"
            />

            <TextInput
              style={styles.input}
              placeholder="Confirm New MPIN"
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholderTextColor="#777"
            />

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleResetPin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Reset MPIN <Ionicons name="arrow-forward" size={16} color="#fff" /></Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: "#5e2ced",
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 25,
  },
  backArrow: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 24,
    marginTop: 8,
    fontWeight: "bold",
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
  },
  sectionTitle: {
    textAlign: "center",
    marginTop: 20,
    marginBottom: 25,
    fontSize: 18,
    fontWeight: "bold",
    color: "#5e2ced",
  },
  input: {
    backgroundColor: "#f3f1ff",
    borderRadius: 12,
    padding: 14,
    fontSize: 17,
    marginBottom: 12,
    textAlign: "center",
    color: "#000",
  },
  primaryBtn: {
    backgroundColor: "#5e2ced",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },
  primaryText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
});

export default ForgotPinScreen;
