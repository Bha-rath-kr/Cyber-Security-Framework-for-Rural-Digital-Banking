import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Modal from "react-native-modal";

import { api_url } from "../config";
import { formatINR } from "../utils/formatCurrency";
import { showFraudAlert } from "../utilitis/fraudUI";

const CONFIRM_FLAGS = {
  RECEIVER_UNDER_INVESTIGATION: "receiverRiskConfirmed",
  FRAUD_WARNING: "fraudWarningConfirmed",
};

const Transaction = ({ navigation }) => {
  const [beneficiary, setBeneficiary] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [amount, setAmount] = useState("");
  const [otp, setOtp] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [fraudData, setFraudData] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [otpModal, setOtpModal] = useState(false);

  // ---------------------------------------------------------
  // LOAD PHONE NUMBER
  // ---------------------------------------------------------
  useEffect(() => {
    const loadPhone = async () => {
      try {
        const storedPhone = await AsyncStorage.getItem("phoneNumber");

        if (storedPhone) {
          setPhone(storedPhone);
        }

        console.log("[Transaction] Phone loaded:", !!storedPhone);
      } catch (error) {
        console.error("[Transaction] Failed to load phone:", error);
      }
    };

    loadPhone();
  }, []);

  // ---------------------------------------------------------
  // PROCEED BUTTON
  // ---------------------------------------------------------
  const handleSendOtp = async () => {
    console.log("========================================");
    console.log("🔥 PROCEED TO PAY CLICKED");
    console.log("========================================");

    console.log("[Transaction] Fields:", {
      beneficiary,
      account,
      ifsc,
      amount,
    });

    // Validate fields
    if (
      !beneficiary.trim() ||
      !account.trim() ||
      !ifsc.trim() ||
      !amount.trim()
    ) {
      console.log("❌ Validation failed");

      Alert.alert(
        "Missing Fields",
        "Please fill Beneficiary Name, Account Number, IFSC Code and Amount."
      );

      return;
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert(
        "Invalid Amount",
        "Please enter a valid amount greater than ₹0."
      );
      return;
    }

    console.log("✅ Validation passed");
    console.log("Amount:", numericAmount);

    // -------------------------------------------------------
    // IMPORTANT:
    // Expo Web can behave differently with Alert.alert.
    // Directly continue on web.
    // -------------------------------------------------------
    if (Platform.OS === "web") {
      console.log("🌐 Expo Web detected");

      if (numericAmount < 10000) {
        console.log("➡️ Amount below ₹10,000");
        console.log("➡️ Calling sendWithoutOtp()");

        await sendWithoutOtp();
      } else {
        console.log("➡️ Amount ₹10,000 or above");
        console.log("➡️ Calling sendOtpAndProceed()");

        await sendOtpAndProceed();
      }

      return;
    }

    // -------------------------------------------------------
    // NATIVE CONFIRMATION
    // -------------------------------------------------------
    Alert.alert(
      "Confirm Payment",
      `You are sending ${formatINR(
        numericAmount
      )} to ${beneficiary} (${account}).\n\nAre you sure you want to continue?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Continue",
          onPress: async () => {
            console.log("✅ Continue pressed");

            if (numericAmount < 10000) {
              await sendWithoutOtp();
            } else {
              await sendOtpAndProceed();
            }
          },
        },
      ]
    );
  };

  // ---------------------------------------------------------
  // NORMAL BANK TRANSFER
  // AMOUNT < ₹10,000
  // ---------------------------------------------------------
  const sendWithoutOtp = async (flags = {}) => {
    console.log("========================================");
    console.log("🚀 sendWithoutOtp START");
    console.log("========================================");

    try {
      setLoading(true);

      const token = await AsyncStorage.getItem("token");

      console.log("🔑 Token exists:", !!token);

      if (!token) {
        Alert.alert(
          "Session Expired",
          "Your login session has expired. Please log in again."
        );

        navigation.replace("Login");
        return;
      }

      const body = {
        beneficiary_name: beneficiary.trim(),
        to_account: account.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        amount: Number(amount),
        phone: phone || "",
        ...flags,
      };

      console.log("📤 BANK TRANSACTION REQUEST");
      console.log("URL:", `${api_url}/txns/send`);
      console.log("Body:", body);

      const response = await axios.post(
        `${api_url}/txns/send`,
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      console.log("========================================");
      console.log("✅ BANK TRANSACTION RESPONSE");
      console.log("========================================");
      console.log(response.data);

      // -----------------------------------------------------
      // SECURITY CONFIRMATION
      // -----------------------------------------------------
      if (response.data?.requiresConfirmation) {
        console.log(
          "⚠️ Security confirmation required:",
          response.data.reason
        );

        const flagName = CONFIRM_FLAGS[response.data.reason];

        const nextFlags = flagName
          ? {
              [flagName]: true,
            }
          : {};

        setLoading(false);

        Alert.alert(
          "Security Warning",
          response.data.message ||
            "This transaction requires additional confirmation.",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Proceed",
              onPress: async () => {
                console.log("⚠️ Security warning accepted");

                await sendWithoutOtp(nextFlags);
              },
            },
          ]
        );

        return;
      }

      // -----------------------------------------------------
      // SUCCESS / FRAUD RESPONSE
      // -----------------------------------------------------
      setFraudData(response.data);
      setShowModal(true);

      // Clear form
      setBeneficiary("");
      setAccount("");
      setIfsc("");
      setAmount("");

    } catch (error) {
      console.error("========================================");
      console.error("❌ BANK TRANSACTION ERROR");
      console.error("========================================");

      console.error("Message:", error.message);
      console.error("Code:", error.code);
      console.error("URL:", `${api_url}/txns/send`);

      if (error.response) {
        console.error("HTTP Status:", error.response.status);
        console.error("Server Response:", error.response.data);

        Alert.alert(
          "Transaction Failed",
          error.response.data?.error ||
            error.response.data?.message ||
            `Server returned ${error.response.status}`
        );
      } else {
        console.error("❌ No response received from backend");

        Alert.alert(
          "Connection Error",
          `Unable to connect to GramBank server.\n\nAPI:\n${api_url}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // SEND OTP
  // AMOUNT >= ₹10,000
  // ---------------------------------------------------------
  const sendOtpAndProceed = async () => {
    console.log("========================================");
    console.log("📨 SEND OTP START");
    console.log("========================================");

    try {
      setLoading(true);

      const token = await AsyncStorage.getItem("token");

      console.log("🔑 Token exists:", !!token);

      if (!token) {
        Alert.alert(
          "Session Expired",
          "Please log in again."
        );

        navigation.replace("Login");
        return;
      }

      console.log(
        "📤 Sending OTP to:",
        phone || "registered phone"
      );

      console.log(
        "URL:",
        `${api_url}/txns/send-otp`
      );

      const response = await axios.post(
        `${api_url}/txns/send-otp`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      console.log("✅ OTP RESPONSE:", response.data);

      setOtp("");

      setOtpModal(true);

    } catch (error) {
      console.error("========================================");
      console.error("❌ OTP ERROR");
      console.error("========================================");

      console.error("Message:", error.message);
      console.error("Code:", error.code);

      if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Response:", error.response.data);

        Alert.alert(
          "OTP Error",
          error.response.data?.error ||
            error.response.data?.message ||
            "Failed to send OTP."
        );
      } else {
        Alert.alert(
          "Connection Error",
          `Unable to reach GramBank server.\n\n${api_url}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // VERIFY OTP + SEND BANK TRANSFER
  // ---------------------------------------------------------
  const handleVerifyOtpAndSend = async (flags = {}) => {
    console.log("========================================");
    console.log("🔐 VERIFY OTP + PAY");
    console.log("========================================");

    if (!otp.trim()) {
      Alert.alert(
        "Enter OTP",
        "Please enter the OTP you received."
      );

      return;
    }

    if (otp.trim().length !== 4) {
      Alert.alert(
        "Invalid OTP",
        "Please enter the 4-digit OTP."
      );

      return;
    }

    try {
      setLoading(true);

      const token = await AsyncStorage.getItem("token");

      if (!token) {
        Alert.alert(
          "Session Expired",
          "Please log in again."
        );

        navigation.replace("Login");
        return;
      }

      const body = {
        beneficiary_name: beneficiary.trim(),
        to_account: account.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        amount: Number(amount),
        otp: otp.trim(),
        phone: phone || "",
        ...flags,
      };

      console.log("📤 OTP BANK TRANSACTION");
      console.log("URL:", `${api_url}/txns/send`);
      console.log("Body:", {
        ...body,
        otp: "****",
      });

      const response = await axios.post(
        `${api_url}/txns/send`,
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      console.log("========================================");
      console.log("✅ OTP TRANSACTION RESPONSE");
      console.log("========================================");
      console.log(response.data);

      // -----------------------------------------------------
      // SECURITY CONFIRMATION
      // -----------------------------------------------------
      if (response.data?.requiresConfirmation) {
        const flagName = CONFIRM_FLAGS[response.data.reason];

        const nextFlags = flagName
          ? {
              [flagName]: true,
            }
          : {};

        setLoading(false);

        Alert.alert(
          "Security Warning",
          response.data.message ||
            "Additional confirmation is required.",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Proceed",
              onPress: async () => {
                await handleVerifyOtpAndSend(nextFlags);
              },
            },
          ]
        );

        return;
      }

      setOtpModal(false);

      setFraudData(response.data);
      setShowModal(true);

      // Clear form
      setBeneficiary("");
      setAccount("");
      setIfsc("");
      setAmount("");
      setOtp("");

    } catch (error) {
      console.error("========================================");
      console.error("❌ OTP TRANSACTION ERROR");
      console.error("========================================");

      console.error("Message:", error.message);
      console.error("Code:", error.code);

      if (error.response) {
        console.error(
          "Status:",
          error.response.status
        );

        console.error(
          "Response:",
          error.response.data
        );

        Alert.alert(
          "Transaction Failed",
          error.response.data?.error ||
            error.response.data?.message ||
            `Server returned ${error.response.status}`
        );
      } else {
        Alert.alert(
          "Connection Error",
          `Unable to reach GramBank server.\n\n${api_url}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // CLOSE RESULT MODAL
  // ---------------------------------------------------------
  const closeModal = () => {
    setShowModal(false);
    navigation.navigate("Dashboard");
  };

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------
  return (
    <View style={styles.main}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Send Money
        </Text>
      </View>

      {/* FORM */}
      <View style={styles.container}>
        <View style={styles.card}>

          <TextInput
            style={styles.input}
            placeholder="Beneficiary Name"
            value={beneficiary}
            onChangeText={setBeneficiary}
            placeholderTextColor="black"
          />

          <TextInput
            style={styles.input}
            placeholder="Account Number"
            keyboardType="number-pad"
            value={account}
            onChangeText={setAccount}
            placeholderTextColor="black"
          />

          <TextInput
            style={styles.input}
            placeholder="IFSC Code"
            autoCapitalize="characters"
            value={ifsc}
            onChangeText={setIfsc}
            placeholderTextColor="black"
          />

          <TextInput
            style={styles.input}
            placeholder="Amount ₹"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            placeholderTextColor="black"
          />

          {/* PROCEED BUTTON */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              loading && styles.disabledButton,
            ]}
            onPress={handleSendOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>
                Proceed ➡️
              </Text>
            )}
          </TouchableOpacity>

        </View>
      </View>

      {/* OTP MODAL */}
      <Modal
        isVisible={otpModal}
        onBackdropPress={() => {
          if (!loading) {
            setOtpModal(false);
          }
        }}
      >
        <View style={styles.modalBox}>

          <Text style={styles.modalTitle}>
            Enter OTP
          </Text>

          <Text style={styles.modalSub}>
            We sent an OTP to {phone || "your registered phone"}
          </Text>

          <TextInput
            style={styles.inputModal}
            placeholder="4 Digit OTP"
            keyboardType="number-pad"
            maxLength={4}
            value={otp}
            onChangeText={setOtp}
            placeholderTextColor="black"
          />

          <TouchableOpacity
            style={[
              styles.verifyButton,
              loading && styles.disabledButton,
            ]}
            onPress={() => handleVerifyOtpAndSend()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.verifyText}>
                Verify & Pay
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (!loading) {
                setOtpModal(false);
              }
            }}
          >
            <Text style={styles.cancelText}>
              Cancel
            </Text>
          </TouchableOpacity>

        </View>
      </Modal>

      {/* RESULT MODAL */}
      <Modal
        isVisible={showModal}
        onBackdropPress={closeModal}
      >
        <View style={styles.modalBox}>

          {fraudData?.offline ? (
            <>
              <Text style={styles.offlineTitle}>
                Saved Offline
              </Text>

              <Text style={styles.modalSub}>
                Transaction saved. Will be processed when
                internet is available.
              </Text>

              <Text style={styles.balance}>
                Check history for status
              </Text>
            </>
          ) : fraudData?.success ? (

            fraudData?.is_scheduled ? (
              <>
                <Text style={styles.successTitle}>
                  ⏳ Transaction Protected
                </Text>

                <Text style={styles.modalSub}>
                  Transaction is under 1-hour security protection.
                </Text>

                <Text style={styles.modalSub}>
                  Receiver will be credited after verification period.
                </Text>

                <Text style={styles.modalSub}>
                  Report immediately if unauthorized.
                </Text>

                <Text style={styles.balance}>
                  Scheduled for:{" "}
                  {fraudData.scheduled_at
                    ? new Date(
                        fraudData.scheduled_at
                      ).toLocaleTimeString()
                    : "1 hour"}
                </Text>

                <Text style={styles.balance}>
                  Check History tab for status
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.successTitle}>
                  Payment Successful
                </Text>

                <Text style={styles.modalSub}>
                  Transaction completed.
                </Text>

                {fraudData.balance_after !== undefined && (
                  <Text style={styles.balance}>
                    New Balance:{" "}
                    {formatINR(
                      fraudData.balance_after
                    )}
                  </Text>
                )}
              </>
            )

          ) : (
            <>
              <Text style={styles.failTitle}>
                ⚠️ Fraud Detected
              </Text>

              <Text style={styles.modalSub}>
                {fraudData?.reason ||
                  fraudData?.message ||
                  "Suspicious activity detected"}
              </Text>

              <Text style={styles.balance}>
                Transaction Blocked
              </Text>
            </>
          )}

          <TouchableOpacity
            style={styles.okButton}
            onPress={closeModal}
          >
            <Text style={styles.okText}>
              OK
            </Text>
          </TouchableOpacity>

        </View>
      </Modal>

    </View>
  );
};

// ---------------------------------------------------------
// STYLES
// ---------------------------------------------------------
const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: "#F1E9FF",
  },

  header: {
    backgroundColor: "#5E2CED",
    paddingTop: 50,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  backArrow: {
    color: "#fff",
    fontSize: 26,
    marginRight: 10,
  },

  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },

  container: {
    padding: 20,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    elevation: 3,
  },

  input: {
    backgroundColor: "#F4F4FF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  sendButton: {
    backgroundColor: "#5E2CED",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },

  disabledButton: {
    opacity: 0.7,
  },

  sendButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  modalBox: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#5E2CED",
  },

  modalSub: {
    color: "#555",
    marginVertical: 6,
    textAlign: "center",
  },

  inputModal: {
    width: "90%",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
    borderColor: "#ddd",
    textAlign: "center",
  },

  verifyButton: {
    backgroundColor: "#5E2CED",
    width: "90%",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 5,
  },

  verifyText: {
    color: "#fff",
    fontWeight: "bold",
  },

  cancelText: {
    color: "#5E2CED",
    fontWeight: "bold",
    marginTop: 10,
  },

  successTitle: {
    color: "#36C964",
    fontWeight: "bold",
    fontSize: 18,
  },

  failTitle: {
    color: "#FF3B30",
    fontWeight: "bold",
    fontSize: 18,
  },

  offlineTitle: {
    color: "#F59E0B",
    fontWeight: "bold",
    fontSize: 18,
  },

  balance: {
    marginTop: 10,
    color: "#555",
  },

  okButton: {
    backgroundColor: "#5E2CED",
    padding: 12,
    borderRadius: 10,
    marginTop: 15,
  },

  okText: {
    color: "#fff",
    fontWeight: "bold",
  },
});

export default Transaction;