// screens/SignupStep1.js
import React, { useRef, useState } from "react";
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
import Ionicons from "../components/Icon";

export default function SignupStep1({ navigation }) {
  const [name, setName] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldMessages, setFieldMessages] = useState({});
  const invalidAadhaarInput = useRef(false);
  const invalidAadhaarMessage = useRef("");
  const invalidPhoneInput = useRef(false);
  const invalidPhoneMessage = useRef("");

  const getAadhaarMessage = (value) => {
    if (!value) return "";
    if (/[^\d]/.test(value)) return "Aadhaar number is not correct. Only numbers are allowed.";
    if (value.length > 12) return "Aadhaar number is not correct. It must contain exactly 12 digits.";
    if (!/^\d{12}$/.test(value)) return "Aadhaar number is not correct. It must contain 12 digits.";
    return "Aadhaar number format is valid.";
  };

  const getPanMessage = (value) => {
    if (!value) return "";
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value)) {
      return "PAN number is not correct. Please enter a valid PAN in the format ABCDE1234F.";
    }
    return "PAN number format is valid.";
  };

  const getPhoneMessage = (value) => {
    if (!value) return "";
    if (!/^[6-9]\d{9}$/.test(value)) return "Mobile number is not correct.";
    return "Mobile number format is valid.";
  };

  const setFieldMessage = (field, message) => {
    setFieldMessages((current) => ({ ...current, [field]: message }));
  };

  const validateCredentials = () => {
    const messages = {
      aadhaar: invalidAadhaarInput.current
        ? invalidAadhaarMessage.current
        : getAadhaarMessage(aadhaar),
      pan: getPanMessage(pan),
      phone: invalidPhoneInput.current
        ? invalidPhoneMessage.current
        : getPhoneMessage(phone),
    };
    setFieldMessages((current) => ({ ...current, ...messages }));
    return !Object.values(messages).some((message) => !message || !message.endsWith("format is valid."));
  };

  const handleSendOtp = async () => {
    if (!validateCredentials()) {
      Alert.alert("Check your details", "Correct the highlighted fields before requesting an OTP.");
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
      Alert.alert("OTP Received", `Your OTP is: ${res.data.otp || res.data.message}\n(Auto-filled for development)`);
    } catch (err) {
      console.log("[SIGNUP] OTP send error:", err.response?.data || err.message);
      Alert.alert("Error", err.response?.data?.error || err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndNext = async () => {
    if (!validateCredentials()) {
      Alert.alert("Check your details", "Correct the highlighted fields before continuing.");
      return;
    }

    if (!name || !aadhaar || !pan || !phone) {
      Alert.alert("Missing Info", "Fill all fields.");
      return;
    }

    if (!otpSent) {
      Alert.alert("OTP Required", "Please verify phone first.");
      return;
    }

    if (!otp) {
      Alert.alert("Missing OTP", "Enter OTP received.");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${api_url}/otp/verify`, { phone, code: otp });
      Alert.alert("Verified", "OTP verified!");
      navigation.navigate("SignupStep2", { name, aadhaar, pan, phone });
    } catch (err) {
      Alert.alert("Invalid OTP", err.response?.data?.error || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.main}>
      {/* PhonePe style gradient header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}><Ionicons name="arrow-back" size={16} color="#fff" /> Back</Text>
        </TouchableOpacity>
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
          value={aadhaar}
          onChangeText={(value) => {
            const message = getAadhaarMessage(value);
            invalidAadhaarInput.current = /[^\d]/.test(value) || value.length > 12;
            invalidAadhaarMessage.current = invalidAadhaarInput.current ? message : "";
            setAadhaar(value.replace(/[^\d]/g, "").slice(0, 12));
            setFieldMessage("aadhaar", message);
          }}
          onBlur={() => setFieldMessage("aadhaar", invalidAadhaarInput.current ? invalidAadhaarMessage.current : getAadhaarMessage(aadhaar))}
          placeholderTextColor="#777"
        />
        <ValidationMessage message={fieldMessages.aadhaar} />

        <TextInput
          style={styles.input}
          placeholder="PAN Number"
          autoCapitalize="characters"
          value={pan}
          onChangeText={(value) => {
            const formatted = value.toUpperCase();
            setPan(formatted);
            setFieldMessage("pan", getPanMessage(formatted));
          }}
          onBlur={() => setFieldMessage("pan", getPanMessage(pan))}
          placeholderTextColor="#777"
        />
        <ValidationMessage message={fieldMessages.pan} />

        <Text style={styles.sectionTitle}>Mobile Verification</Text>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Phone Number"
            keyboardType="numeric"
            value={phone}
            onChangeText={(value) => {
              invalidPhoneInput.current = /[^\d]/.test(value) || value.length > 10;
              invalidPhoneMessage.current = invalidPhoneInput.current ? "Mobile number is not correct." : "";
              const formatted = value.replace(/[^\d]/g, "").slice(0, 10);
              setPhone(formatted);
              setFieldMessage("phone", getPhoneMessage(formatted));
            }}
            onBlur={() => setFieldMessage("phone", invalidPhoneInput.current ? invalidPhoneMessage.current : getPhoneMessage(phone))}
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
                {otpSent ? <><Ionicons name="checkmark" size={14} color="#fff" /> Sent</> : "Get OTP"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        <ValidationMessage message={fieldMessages.phone} />

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
            <Text style={styles.proceedText}>Continue <Ionicons name="arrow-forward" size={16} color="#fff" /></Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ValidationMessage({ message }) {
  if (!message) return null;
  const valid = message.endsWith("format is valid.");
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
    backgroundColor: "#5e2ced",
  },

  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  backText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 14,
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
  validationMessage: {
    fontSize: 13,
    marginTop: -7,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  errorMessage: { color: "#DC2626" },
  validMessage: { color: "#15803D" },

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
