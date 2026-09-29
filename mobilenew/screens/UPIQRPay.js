import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    Modal,
    TextInput,
    ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { showFraudAlert } from "../utilitis/fraudUI";
import { checkConnection } from "../utilitis/network";
import { queueTransaction } from "../utilitis/offlineQueue";
import { verifyMpin } from "../utilitis/verifyMpin";

const CONFIRM_FLAGS = {
  RECEIVER_UNDER_INVESTIGATION: 'receiverRiskConfirmed',
  FRAUD_WARNING: 'fraudWarningConfirmed',
};

export default function UPIQRPay({ navigation }) {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [torch, setTorch] = useState(false);

    const [upiId, setUpiId] = useState("");
    const [name, setName] = useState("");
    const [amount, setAmount] = useState("");

    // PIN
    const [upiPin, setUpiPin] = useState("");
    const [showPinModal, setShowPinModal] = useState(false);

    // OTP
    const [otp, setOtp] = useState("");
    const [showOtpModal, setShowOtpModal] = useState(false);

    const [loading, setLoading] = useState(false);
    const pinVerificationInFlight = useRef(false);

    if (!permission) return <View />;

    if (!permission.granted) {
        return (
            <View style={styles.center}>
                <Text style={{ marginBottom: 10 }}>
                    We need your permission to show camera
                </Text>
                <TouchableOpacity onPress={requestPermission} style={styles.btnPrimary}>
                    <Text style={{ color: "#fff" }}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // -------- QR Detection ----------
    const onBarcodeScanned = (result) => {
        console.log(result);
        
        if (scanned) return;
        const data = result?.data;
        setScanned(true);

        if (!data || !data.startsWith("upi://pay")) {
            Alert.alert("Invalid QR", "This is not a UPI QR");
            setScanned(false);
            return;
        }

        const params = new URLSearchParams(data.replace("upi://pay?", ""));
        const pa = params.get("pa");
        const pn = params.get("pn") || "Unknown";

        if (!pa) {
            Alert.alert("Invalid QR", "UPI ID missing");
            setScanned(false);
            return;
        }

        setScanned(false);

        navigation.replace("UPIPaymentScreen", {
            upiId: pa,
            name: pn
        });
    };


    // ---------- PIN ----------
    const handlePinSubmit = async () => {
        if (loading || pinVerificationInFlight.current) return;
        if (!/^\d{4}$/.test(upiPin)) {
            Alert.alert("Invalid MPIN", "Enter your 4-digit GramBank MPIN.");
            return;
        }

        pinVerificationInFlight.current = true;
        setLoading(true);
        try {
            await verifyMpin(upiPin);
        } catch (error) {
            Alert.alert(
                error.response?.status === 401 ? "Incorrect MPIN" : "MPIN verification failed",
                error.response?.data?.error || error.message || "Could not verify your GramBank MPIN."
            );
            return;
        } finally {
            pinVerificationInFlight.current = false;
            setLoading(false);
        }

        setShowPinModal(false);
        setUpiPin("");

        if (Number(amount) < 10000) {
            await makePaymentWithoutOtp();
        } else {
            await sendOtp();
        }
    };

    const makePaymentWithoutOtp = async (flags = {}) => {
        const isOnline = await checkConnection();

        if (!isOnline) {
            try {
                const data = { upiId, amount };
                await queueTransaction('upi_payment', data);
                Alert.alert(
                    "Saved Offline",
                    "Transaction saved. Will be processed when internet is available.",
                    [{ text: "OK", onPress: () => navigation.replace("Dashboard") }]
                );
                return;
            } catch {
                Alert.alert("Error", "Failed to save transaction offline");
                return;
            }
        }

        try {
            setLoading(true);
            await new Promise(resolve => setTimeout(resolve, 1000));
            const token = await AsyncStorage.getItem("token");
            const body = { upiId, amount, ...flags };

            const res = await axios.post(
                `${api_url}/txns/upi/send`,
                body,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (res.data.requiresConfirmation) {
                const flagName = CONFIRM_FLAGS[res.data.reason];
                const nextFlags = flagName ? { [flagName]: true } : {};
                Alert.alert(
                    "Security Warning",
                    res.data.message || "Are you sure you want to proceed?",
                    [
                        { text: "Cancel", style: "cancel" },
                        { text: "Proceed", onPress: () => makePaymentWithoutOtp(nextFlags) }
                    ]
                );
                return;
            }

            showFraudAlert(res.data, {
                onBlocked: () => navigation.replace("Dashboard"),
                onScheduled: () => navigation.replace("Dashboard"),
                onSuccess: () => navigation.replace("Dashboard"),
                onClose: () => navigation.replace("Dashboard")
            });
        } catch (e) {
            if (!e.response) {
                const data = { upiId, amount };
                await queueTransaction('upi_payment', data);
                Alert.alert(
                    "Saved Offline",
                    "No internet connection. Transaction saved and will be processed when online.",
                    [{ text: "OK", onPress: () => navigation.replace("Dashboard") }]
                );
            } else {
                Alert.alert("Transaction Failed", e.response?.data?.error);
            }
        } finally {
            setLoading(false);
        }
    };

    // ---------- OTP SEND ----------
    const sendOtp = async () => {
        try {
            setLoading(true);
            const token = await AsyncStorage.getItem("token");

            await axios.post(
                `${api_url}/txns/send-otp`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setShowOtpModal(true);
        } catch (e) {
            Alert.alert("Failed", "OTP send failed");
            setScanned(false);
        }
        setLoading(false);
    };

    // ---------- PAY ----------
    const makePayment = async (flags = {}) => {
        if (!otp) return;

        const isOnline = await checkConnection();

        if (!isOnline) {
            try {
                const data = { upiId, amount, otp };
                await queueTransaction('upi_payment', data);
                setShowOtpModal(false);
                Alert.alert(
                    "Saved Offline",
                    "Transaction saved. Will be processed when internet is available.",
                    [{ text: "OK", onPress: () => navigation.replace("Dashboard") }]
                );
                return;
            } catch {
                Alert.alert("Error", "Failed to save transaction offline");
                return;
            }
        }

        try {
            setLoading(true);
            const token = await AsyncStorage.getItem("token");
            const body = { upiId, amount, otp, ...flags };

            const res = await axios.post(
                `${api_url}/txns/upi/send`,
                body,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setShowOtpModal(false);

            if (res.data.requiresConfirmation) {
                const flagName = CONFIRM_FLAGS[res.data.reason];
                const nextFlags = flagName ? { [flagName]: true } : {};
                Alert.alert(
                    "Security Warning",
                    res.data.message || "Are you sure you want to proceed?",
                    [
                        { text: "Cancel", style: "cancel" },
                        { text: "Proceed", onPress: () => makePayment(nextFlags) }
                    ]
                );
                return;
            }

            showFraudAlert(res.data, {
                onBlocked: () => navigation.replace("Dashboard"),
                onScheduled: () => navigation.replace("Dashboard"),
                onSuccess: () => navigation.replace("Dashboard"),
                onClose: () => navigation.replace("Dashboard")
            });
        } catch (e) {
            if (!e.response) {
                const data = { upiId, amount, otp };
                await queueTransaction('upi_payment', data);
                Alert.alert(
                    "Saved Offline",
                    "No internet connection. Transaction saved and will be processed when online.",
                    [{ text: "OK", onPress: () => navigation.replace("Dashboard") }]
                );
            } else {
                Alert.alert("Transaction Failed", e.response?.data?.error);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: "#000" }}>
            {/* HEADER LIKE PHONEPE */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.backArrow}>←</Text>
                </TouchableOpacity>

                <Text style={styles.headerTitle}>Scan any QR</Text>
            </View>

            {/* CAMERA */}
            <CameraView
                style={{ flex: 1 }}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{
                    barcodeTypes: ["qr"]
                }}
                onBarcodeScanned={scanned ? undefined : (result) => {
                    if (!result?.data) return;
                    onBarcodeScanned(result);
                }}
            />

            {/* SCAN AREA OVERLAY */}
            <View style={styles.overlay}>
                <View style={styles.scanBox} />
            </View>

            {/* BOTTOM BAR */}
            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.iconBtn}>
                    <Text style={styles.iconText}>🖼</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => setTorch(!torch)}
                >
                    <Text style={styles.iconText}>{torch ? "⚡" : "💡"}</Text>
                </TouchableOpacity>
            </View>

            {loading && <ActivityIndicator size="large" color="#fff" />}

            {/* PIN Modal */}
            <Modal visible={showPinModal} transparent animationType="slide" onRequestClose={() => { setShowPinModal(false); setUpiPin(""); }}>
                <View style={styles.modal}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>
                            Confirm with GramBank MPIN
                        </Text>

                        <TextInput
                            placeholder="Enter your 4-digit MPIN"
                            secureTextEntry
                            keyboardType="numeric"
                            value={upiPin}
                            onChangeText={setUpiPin}
                            maxLength={4}
                            style={styles.input}
                        />

                        <TouchableOpacity style={styles.btnPrimary} onPress={handlePinSubmit}>
                            <Text style={styles.btnText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* OTP Modal */}
            <Modal visible={showOtpModal} transparent animationType="slide">
                <View style={styles.modal}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>Enter OTP</Text>

                        <TextInput
                            placeholder="OTP"
                            keyboardType="numeric"
                            style={styles.input}
                            value={otp}
                            onChangeText={setOtp}
                        />

                        <TouchableOpacity style={styles.btnPrimary} onPress={makePayment}>
                            <Text style={styles.btnText}>Pay</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    header: {
        backgroundColor: "#5e2ced",
        paddingTop: 55,
        paddingBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 15,
    },
    backArrow: { color: "#fff", fontSize: 26, marginRight: 10 },
    headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },

    overlay: {
        position: "absolute",
        top: "25%",
        width: "100%",
        alignItems: "center",
    },

    scanBox: {
        width: 260,
        height: 260,
        borderRadius: 18,
        borderWidth: 3,
        borderColor: "#fff",
        backgroundColor: "transparent",
    },

    bottomBar: {
        position: "absolute",
        bottom: 40,
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-evenly",
    },

    iconBtn: {
        width: 60,
        height: 60,
        backgroundColor: "#ffffff33",
        borderRadius: 50,
        justifyContent: "center",
        alignItems: "center",
    },
    iconText: { fontSize: 30, color: "#fff" },

    modal: {
        flex: 1,
        backgroundColor: "#00000090",
        alignItems: "center",
        justifyContent: "center",
    },

    modalBox: {
        width: "85%",
        backgroundColor: "#fff",
        padding: 18,
        borderRadius: 15,
        alignItems: "center",
    },
    modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },

    input: {
        width: "90%",
        borderWidth: 1,
        borderColor: "#aaa",
        borderRadius: 8,
        padding: 10,
        textAlign: "center",
        marginTop: 10,
    },

    btnPrimary: {
        width: "90%",
        backgroundColor: "#7C4DFF",
        padding: 12,
        borderRadius: 8,
        marginTop: 15,
        alignItems: "center",
    },
    btnText: { color: "#fff", fontWeight: "bold" },
});
