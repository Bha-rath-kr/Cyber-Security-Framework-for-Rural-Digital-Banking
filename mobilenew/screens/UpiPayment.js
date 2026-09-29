import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { checkConnection } from "../utilitis/network";
import { queueTransaction } from "../utilitis/offlineQueue";
import { verifyMpin } from "../utilitis/verifyMpin";
import { formatINR } from "../utils/formatCurrency";
import { getReceiverBadge } from "../utilitis/fraudUI";

const CONFIRM_FLAGS = {
  RECEIVER_UNDER_INVESTIGATION: "receiverRiskConfirmed",
  FRAUD_WARNING: "fraudWarningConfirmed",
};

export default function UPIPaymentScreen({ route, navigation }) {
  const { upiId, name } = route.params;
  const [amount, setAmount] = useState("");
  const [upiPin, setUpiPin] = useState("");
  const [otp, setOtp] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receiverBadge, setReceiverBadge] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const requestInFlight = useRef(false);
  const pinVerificationInFlight = useRef(false);

  const showResult = (status, data = {}) => {
    const result = {
      status,
      amount: Number(data.amount ?? amount),
      receiver: data.receiver || upiId,
      txnId: data.txn_id,
      balanceAfter: data.balance_after,
      message: data.message,
      delayReason: data.delay_reason,
      resultAt: new Date().toISOString(),
    };
    console.log("[UPI] Navigating to PaymentResult:", {
      status,
      txnId: result.txnId || null,
    });
    setShowPinModal(false);
    setShowOtpModal(false);
    navigation.replace("PaymentResult", result);
  };

  const submitPayment = async ({ transactionOtp, flags = {} } = {}) => {
    if (requestInFlight.current) {
      console.warn("[UPI] Duplicate submission ignored.");
      return;
    }

    requestInFlight.current = true;
    setLoading(true);
    setFeedback(null);
    const url = `${api_url}/txns/upi/send`;
    let requestStarted = false;

    try {
      const online = await checkConnection();
      const userJson = await AsyncStorage.getItem("user");
      let phone;
      if (userJson) {
        try {
          phone = JSON.parse(userJson).phoneNumber;
        } catch (error) {
          console.warn("[UPI] Could not read saved phone number; backend will use the authenticated user's number.");
        }
      }

      const body = {
        upiId,
        amount: Number(amount),
        ...(phone ? { phone } : {}),
        ...(transactionOtp ? { otp: transactionOtp } : {}),
        ...flags,
      };
      console.log("[UPI] Submission:", {
        upiId,
        amount: body.amount,
        apiUrl: url,
        online,
        hasPhone: Boolean(phone),
        hasOtp: Boolean(transactionOtp),
        pinVerifiedByBank: false,
      });

      if (!online) {
        const localId = await queueTransaction("upi_payment", body);
        console.log("[UPI] Queued offline:", { localId });
        showResult("offline", {
          ...body,
          message: "Payment saved for retry when a network connection is available. It has not been completed yet.",
        });
        return;
      }

      const token = await AsyncStorage.getItem("token");
      console.log("[UPI] JWT exists:", Boolean(token));
      if (!token) {
        console.warn("[UPI] Not sending payment: authentication token is missing.");
        navigation.replace("Login");
        return;
      }

      console.log("[UPI] Request started:", {
        method: "POST",
        url,
        body: {
          upiId: body.upiId,
          amount: body.amount,
          phone: body.phone ? "[PRESENT]" : undefined,
          otp: body.otp ? "[PRESENT]" : undefined,
          flags,
        },
      });
      requestStarted = true;
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });
      console.log("[UPI] HTTP status:", response.status);
      console.log("[UPI] Response data:", response.data);

      const data = response.data;
      if (data.receiverStatus) setReceiverBadge(getReceiverBadge(data.receiverStatus));

      if (data.requiresConfirmation) {
        const flagName = CONFIRM_FLAGS[data.reason];
        setShowOtpModal(false);
        setFeedback({
          type: "confirmation",
          title: data.popupTitle || "Security confirmation",
          message: data.message || "The security checks require your confirmation to proceed.",
          onConfirm: () => {
            setFeedback(null);
            void submitPayment({
              transactionOtp,
              flags: flagName ? { ...flags, [flagName]: true } : flags,
            });
          },
        });
        return;
      }

      if (data.is_scheduled) {
        showResult("scheduled", data);
        return;
      }

      if (data.txn_blocked || data.is_fraud || data.decision === "TEMP_FREEZE") {
        setShowOtpModal(false);
        setFeedback({
          type: "error",
          title: data.popupTitle || "Payment blocked",
          message: data.message || data.userMessage || data.fraud_reason || "The payment was blocked by security checks.",
        });
        return;
      }

      if (data.message === "UPI Transaction Successful" && !data.is_scheduled && !data.requiresConfirmation) {
        console.log("[UPI] Backend confirmed success:", {
          txnId: data.txn_id,
          balanceAfter: data.balance_after,
        });
        showResult("success", data);
        return;
      }

      setShowOtpModal(false);
      setFeedback({
        type: "error",
        title: "Payment not confirmed",
        message: data.message || data.userMessage || "The backend did not confirm the payment. Check your transaction history before retrying.",
      });
    } catch (error) {
      const backendError = error.response?.data?.message || error.response?.data?.error;
      console.error("[UPI] Payment request failed:", {
        url,
        requestStarted,
        status: error.response?.status,
        response: error.response?.data,
        message: error.message,
        code: error.code,
      });
      setShowOtpModal(false);
      setFeedback({
        type: requestStarted && !error.response ? "unknown" : "error",
        title: error.response ? "Payment failed" : "Payment status unknown",
        message: backendError || (
          requestStarted
            ? "GramBank did not return a result. Check your balance and transaction history before retrying to avoid a duplicate payment."
            : error.message || "Could not prepare the payment request."
        ),
      });
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      console.log("[UPI] Submission finished; loading cleared.");
    }
  };

  const sendOtp = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem("token");
      const url = `${api_url}/txns/send-otp`;
      console.log("[UPI] Sending OTP:", { url, jwtExists: Boolean(token), upiId, amount: Number(amount) });
      if (!token) {
        navigation.replace("Login");
        return;
      }
      const response = await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });
      console.log("[UPI] OTP response:", {
        status: response.status,
        message: response.data?.message,
        hasOtp: Boolean(response.data?.otp),
      });
      setShowOtpModal(true);
    } catch (error) {
      console.error("[UPI] OTP request failed:", {
        status: error.response?.status,
        response: error.response?.data,
        message: error.message,
      });
      setFeedback({
        type: "error",
        title: "OTP failed",
        message: error.response?.data?.message || error.response?.data?.error || error.message || "Could not send OTP.",
      });
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  };

  const handlePinSubmit = async () => {
    if (loading || requestInFlight.current || pinVerificationInFlight.current) return;
    if (!/^\d{4}$/.test(upiPin)) {
      setFeedback({ type: "error", title: "Invalid MPIN", message: "Enter your 4-digit GramBank MPIN." });
      return;
    }

    pinVerificationInFlight.current = true;
    setLoading(true);
    try {
      await verifyMpin(upiPin);
      console.log("[UPI] GramBank MPIN verified by backend.");
    } catch (error) {
      console.error("[UPI] GramBank MPIN verification failed:", {
        status: error.response?.status,
        message: error.response?.data?.error || error.message,
      });
      setFeedback({
        type: "error",
        title: error.response?.status === 401 ? "Incorrect MPIN" : "MPIN verification failed",
        message: error.response?.data?.error || error.message || "Could not verify your GramBank MPIN.",
      });
      return;
    } finally {
      pinVerificationInFlight.current = false;
      setLoading(false);
    }

    setUpiPin("");
    setShowPinModal(false);
    console.log("[UPI] MPIN confirmation passed:", { upiId, amount: Number(amount) });
    if (Number(amount) >= 10000) {
      await sendOtp();
    } else {
      await submitPayment();
    }
  };

  const handleProceed = async () => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFeedback({ type: "error", title: "Invalid amount", message: "Enter an amount greater than zero." });
      return;
    }
    if (!(await checkConnection())) {
      await submitPayment();
      return;
    }
    if (Platform.OS === "web") {
      setShowPinModal(true);
      return;
    }
    setFeedback({
      type: "confirmation",
      title: "Confirm payment",
      message: `You are sending ${formatINR(parsedAmount)} to ${name || upiId}. Continue?`,
      onConfirm: () => {
        setFeedback(null);
        setShowPinModal(true);
      },
    });
  };

  const handleOtpSubmit = async () => {
    if (!otp.trim()) {
      setFeedback({ type: "error", title: "OTP required", message: "Enter the OTP sent for this payment." });
      return;
    }
    await submitPayment({ transactionOtp: otp.trim() });
  };

  const dismissFeedback = () => setFeedback(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pay</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.name}>{name || upiId}</Text>
        <Text style={styles.upi}>{upiId}</Text>
        {receiverBadge && (
          <View style={[styles.badge, { backgroundColor: receiverBadge.bg }]}>
            <Text style={[styles.badgeText, { color: receiverBadge.color }]}>
              {receiverBadge.icon} {receiverBadge.label}
            </Text>
          </View>
        )}
      </View>

      <TextInput
        style={styles.amountInput}
        placeholder="₹ Enter amount"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        editable={!loading}
      />
      <TouchableOpacity style={styles.payBtn} onPress={handleProceed} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.payText}>Proceed to Pay</Text>}
      </TouchableOpacity>

      <Modal visible={showPinModal} transparent animationType="slide" onRequestClose={() => { if (!loading) setShowPinModal(false); }}>
        <View style={styles.modal}>
          <View style={styles.box}>
            <Text style={styles.title}>Confirm with GramBank MPIN</Text>
            <Text style={styles.hint}>Enter the same 4-digit MPIN you use to sign in to GramBank.</Text>
            <TextInput
              placeholder="4-digit MPIN"
              keyboardType="numeric"
              secureTextEntry
              style={styles.input}
              value={upiPin}
              onChangeText={setUpiPin}
              maxLength={4}
              editable={!loading}
            />
            <TouchableOpacity style={styles.primary} onPress={handlePinSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showOtpModal} transparent animationType="slide" onRequestClose={() => { if (!loading) setShowOtpModal(false); }}>
        <View style={styles.modal}>
          <View style={styles.box}>
            <Text style={styles.title}>Enter OTP</Text>
            <TextInput
              placeholder="OTP"
              keyboardType="numeric"
              style={styles.input}
              value={otp}
              onChangeText={setOtp}
              editable={!loading}
            />
            <TouchableOpacity style={styles.primary} onPress={handleOtpSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Pay</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primary, styles.secondary]} onPress={() => setShowOtpModal(false)} disabled={loading}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(feedback)} transparent animationType="fade" onRequestClose={dismissFeedback}>
        <View style={styles.modal}>
          <View style={styles.box}>
            <Text style={styles.title}>{feedback?.title}</Text>
            <Text style={styles.feedbackMessage}>{feedback?.message}</Text>
            {feedback?.type === "confirmation" ? (
              <>
                <TouchableOpacity style={[styles.primary, styles.secondary]} onPress={dismissFeedback}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primary}
                  onPress={() => {
                    const confirm = feedback.onConfirm;
                    setFeedback(null);
                    confirm?.();
                  }}
                >
                  <Text style={styles.primaryText}>Continue</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.primary} onPress={dismissFeedback}>
                <Text style={styles.primaryText}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 45, padding: 15, backgroundColor: "#5e2ced" },
  back: { color: "#fff", fontSize: 26, marginRight: 10 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  card: { margin: 20, padding: 20, borderRadius: 15, backgroundColor: "#f1e9ff" },
  name: { fontSize: 20, fontWeight: "bold" },
  upi: { color: "#666", marginTop: 5 },
  badge: { marginTop: 10, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "bold" },
  amountInput: { fontSize: 28, textAlign: "center", marginTop: 20, borderBottomWidth: 1, borderColor: "#ccc" },
  payBtn: { backgroundColor: "#5e2ced", margin: 20, padding: 15, borderRadius: 12, alignItems: "center" },
  payText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  modal: { flex: 1, backgroundColor: "#00000088", alignItems: "center", justifyContent: "center" },
  box: { backgroundColor: "#fff", width: "85%", maxWidth: 440, borderRadius: 15, padding: 18, alignItems: "center" },
  title: { fontSize: 18, fontWeight: "bold", textAlign: "center" },
  hint: { color: "#64748B", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 8 },
  feedbackMessage: { color: "#334155", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 12 },
  input: { width: "90%", borderWidth: 1, borderColor: "#aaa", borderRadius: 8, padding: 10, textAlign: "center", marginTop: 10 },
  primary: { backgroundColor: "#5e2ced", width: "90%", padding: 12, marginTop: 15, borderRadius: 10, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "bold" },
  secondary: { backgroundColor: "#E2E8F0" },
  secondaryText: { color: "#334155", fontWeight: "bold" },
});
