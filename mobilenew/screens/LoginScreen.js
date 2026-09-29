import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { api_url } from "../config";

const isTokenValid = async (token) => {
  try {
    await axios.get(`${api_url}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  } catch {
    return false;
  }
};




const LoginScreen = ({ navigation }) => {
  const [pin, setPin] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
  const initLogin = async () => {
    const storedToken = await AsyncStorage.getItem("token");
    const storedAadhaar = await AsyncStorage.getItem("aadhaarNumber");

    if (!storedToken) return;
    if (storedAadhaar) setAadhaar(storedAadhaar);

    const valid = await isTokenValid(storedToken);
    if (!valid) {
      await AsyncStorage.multiRemove(["token", "user", "accountNumber", "upiId", "aadhaarNumber"]);
      return;
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !enrolled) return;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Login with Fingerprint",
        fallbackLabel: "Use MPIN",
        cancelLabel: "Cancel",
      });

      if (result.success) {
        navigation.replace("Dashboard");
      }
    } catch (err) {
      console.log("Biometric error", err);
    }
  };

  initLogin();
}, []);


  const handlePinLogin = async () => {
    if (!aadhaar || !pin) return Alert.alert("Error", "Enter Aadhaar & MPIN");

    setLoading(true);
    try {
      const res = await axios.post(`${api_url}/users/login`, {
        aadhaarNumber: aadhaar,
        mpin: pin,
      });

      const { token, user } = res.data;

      await AsyncStorage.setItem("token", token);
      await AsyncStorage.setItem("user", JSON.stringify(user));
      await AsyncStorage.setItem("accountNumber", user.accountNumber);
      await AsyncStorage.setItem("upiId", user.upiId);
      await AsyncStorage.setItem("aadhaarNumber", aadhaar);

      navigation.replace("Dashboard");
    } catch (err) {
      console.log("Login error:", err.response?.data);
      console.log("Login error status:", err.response?.status);
      Alert.alert(
        "Login Failed",
        err.response?.data?.error || "Network error. Check your connection."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    const storedToken = await AsyncStorage.getItem("token");
    if (!storedToken)
      return Alert.alert("Login Required", "Login with MPIN first, then you can use fingerprint.");

    setLoading(true);
    try {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      if (!hardware) return Alert.alert("Error", "No biometric hardware");

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) return Alert.alert("Error", "No biometrics enrolled");

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Login with Fingerprint",
        fallbackLabel: "Enter MPIN",
      });

      if (result.success) {
        navigation.replace("Dashboard");
      } else {
        Alert.alert("Authentication Failed", "Try again.");
      }
    } catch (err) {
      console.log("Biometric error:", err);
      Alert.alert("Error", "Biometric authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.main}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>GramBank</Text>
        <Text style={styles.headerTitle}>Welcome Back</Text>
        <Text style={styles.headerSub}>
          Secure & fast access to your bank
        </Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
        />

        <Text style={styles.sectionTitle}>Login to Continue</Text>

        <TextInput
          style={styles.input}
          placeholder="Aadhaar Number"
          keyboardType="numeric"
          maxLength={12}
          value={aadhaar}
          onChangeText={setAadhaar}
          placeholderTextColor="#777"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Enter 4-Digit MPIN"
          keyboardType="numeric"
          secureTextEntry
          maxLength={4}
          value={pin}
          onChangeText={setPin}
          placeholderTextColor="#777"
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.loginBtn, loading && styles.disabledBtn]}
          onPress={handlePinLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginText}>Login ➜</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.or}>OR</Text>

        <TouchableOpacity
          style={[styles.fingerprintBtn, loading && styles.disabledBtn]}
          onPress={handleBiometricAuth}
          disabled={loading}
        >
          <Image
            source={{
              uri: "https://cdn-icons-png.flaticon.com/512/10074/10074023.png",
            }}
            style={styles.fingerprintIcon}
          />
          <Text style={styles.fpText}>Login with Fingerprint</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate("ForgotPin")}
          disabled={loading}
        >
          <Text style={styles.forgotText}>
            🔑 Forgot MPIN?
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate("SignupStep1")}
          disabled={loading}
        >
          <Text style={styles.signupText}>
            📝 New user? Create Account
          </Text>
        </TouchableOpacity>
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

  appName: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 20,
    marginTop: 6,
    fontWeight: "600",
  },

  headerSub: {
    color: "#ddd",
    marginTop: 3,
  },

  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
  },

  logo: {
    width: 80,
    height: 80,
    alignSelf: "center",
  },

  sectionTitle: {
    textAlign: "center",
    marginTop: 10,
    marginBottom: 15,
    fontSize: 16,
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

  loginBtn: {
    backgroundColor: "#5e2ced",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 5,
  },
  disabledBtn: {
    opacity: 0.6,
  },

  loginText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },

  or: {
    textAlign: "center",
    marginVertical: 10,
    color: "#888",
  },

  fingerprintBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#5e2ced",
    borderRadius: 14,
    padding: 12,
  },

  fingerprintIcon: {
    width: 30,
    height: 30,
    marginRight: 10,
  },

  fpText: {
    color: "#5e2ced",
    fontSize: 15,
    fontWeight: "bold",
  },

signupText: {
    textAlign: "center",
    marginTop: 20,
    color: "#5e2ced",
    fontWeight: "bold",
  },

forgotText: {
    textAlign: "center",
    marginTop: 15,
    color: "#b80000",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default LoginScreen;
