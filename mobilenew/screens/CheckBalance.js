import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { formatINR } from "../utils/formatCurrency";

export default function CheckBalance({ navigation }) {
    const [aadhaar, setAadhaar] = useState("");
    const [pin, setPin] = useState("");
    const [balance, setBalance] = useState(null);
    const [bankName, setBankName] = useState("GramBank");
    const [last4, setLast4] = useState("XXXX");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        const user = await AsyncStorage.getItem("user");
        if (user) {
            const u = JSON.parse(user);
            setAadhaar(u?.aadhaarNumber);
            setLast4(u?.accountNumber?.slice(-4) || "XXXX");
            setBankName("GramBank");
        }
    };

    const onKeyPress = (num) => {
        if (pin.length >= 4) return;
        setPin(pin + num);
    };

    const onDelete = () => {
        setPin(pin.slice(0, -1));
    };

    const handleVerify = async () => {
        if (pin.length !== 4 || loading) return;

        try {
            setLoading(true);

            // LOGIN USING MPIN
            const res = await axios.post(`${api_url}/users/login`, {
                aadhaarNumber: aadhaar,
                mpin: pin,
            });

            const token = res.data.token;

            // FETCH BALANCE
            const bal = await axios.get(`${api_url}/txns/balance`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setBalance(bal.data.balance);
        } catch (err) {
            Alert.alert("Wrong MPIN", "Invalid MPIN");
            setPin("");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (pin.length === 4) handleVerify();
    }, [pin]);

    return (
        <View style={styles.container}>

            {/* ================= LOADING SCREEN ================= */}
            {loading && !balance ? (
                <View style={styles.loaderWrap}>
                    <View style={styles.loaderCircle}>
                        <Text style={{ color: "#fff", fontSize: 26 }}>⏳</Text>
                    </View>

                    <Text style={styles.loadingText}>Fetching Balance…</Text>
                    <Text style={styles.loadingSub}>Please wait</Text>
                </View>
            ) : null}

            {/* ================= MPIN SCREEN ================= */}
            {!loading && !balance ? (
                <>
                    <Text style={styles.title}>Enter MPIN</Text>
                    <Text style={styles.subtitle}>Enter your secure MPIN to continue</Text>

                    <View style={styles.dotsRow}>
                        {[0, 1, 2, 3].map(i => (
                            <View
                                key={i}
                                style={[
                                    styles.dot,
                                    { backgroundColor: pin.length > i ? "#7C4DFF" : "#444" },
                                ]}
                            />
                        ))}
                    </View>

                    <View style={styles.keypad}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                            <TouchableOpacity key={n} style={styles.key} onPress={() => onKeyPress(n.toString())}>
                                <Text style={styles.keyText}>{n}</Text>
                            </TouchableOpacity>
                        ))}

                        <View style={styles.key} />

                        <TouchableOpacity style={styles.key} onPress={() => onKeyPress("0")}>
                            <Text style={styles.keyText}>0</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.key} onPress={onDelete}>
                            <Text style={styles.keyText}>⌫</Text>
                        </TouchableOpacity>
                    </View>
                </>
            ) : null}

            {/* ================= SUCCESS SCREEN ================= */}
            {!loading && balance ? (
                <>
                    <View style={styles.successCircle}>
                        <Text style={styles.tick}>✔</Text>
                    </View>

                    <Text style={styles.successMsg}>
                        Available Balance fetched successfully
                    </Text>

                    <View style={styles.bankRow}>
                        <Image
                            source={{
                                uri: "https://seeklogo.com/images/B/bank-icon-logo-4C0C47E624-seeklogo.com.png",
                            }}
                            style={styles.bankIcon}
                        />
                        <Text style={styles.bankText}>
                            {bankName} - {last4}
                        </Text>
                    </View>

                    <Text style={styles.amount}>{formatINR(balance)}</Text>

                    <TouchableOpacity
                        style={styles.doneBtn}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.doneText}>DONE</Text>
                    </TouchableOpacity>
                </>
            ) : null}

        </View>
    );

}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#11092b", alignItems: "center", paddingTop: 70 },

    /* MPIN UI */
    title: { color: "#fff", fontSize: 22, fontWeight: "bold" },
    subtitle: { color: "#aaa", marginTop: 5 },

    dotsRow: { flexDirection: "row", marginTop: 30, gap: 12 },
    dot: { width: 18, height: 18, borderRadius: 50 },

    keypad: {
        marginTop: 50,
        width: "70%",
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },

    key: {
        width: "30%",
        aspectRatio: 1,
        borderRadius: 50,
        backgroundColor: "#1f1f26",
        justifyContent: "center",
        alignItems: "center",
        marginVertical: 10,
    },
    keyText: { color: "#fff", fontSize: 28, fontWeight: "bold" },

    /* SUCCESS UI */
    successCircle: {
        width: 130,
        height: 130,
        borderRadius: 100,
        backgroundColor: "#24C768",
        justifyContent: "center",
        alignItems: "center",
    },
    tick: { color: "#fff", fontSize: 60 },

    successMsg: {
        color: "#fff",
        marginTop: 20,
        fontSize: 18,
        fontWeight: "bold",
        textAlign: "center"
    },
    loaderWrap: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#11092b",
    },

    loaderCircle: {
        width: 120,
        height: 120,
        borderRadius: 80,
        borderWidth: 4,
        borderColor: "#7C4DFF",
        justifyContent: "center",
        alignItems: "center"
    },

    loadingText: {
        color: "#fff",
        fontSize: 20,
        marginTop: 20,
        fontWeight: "bold"
    },

    loadingSub: {
        color: "#aaa",
        marginTop: 5,
        fontSize: 14
    },


    bankRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 15,
        gap: 8
    },

    bankIcon: { width: 32, height: 32 },

    bankText: { color: "#fff", fontSize: 16 },

    amount: {
        color: "#fff",
        fontSize: 38,
        fontWeight: "bold",
        marginTop: 15
    },

    doneBtn: {
        position: "absolute",
        bottom: 25,
        width: "92%",
        paddingVertical: 12,
        backgroundColor: "#7C4DFF",
        borderRadius: 10,
        alignItems: "center",
    },

    doneText: { color: "#fff", fontSize: 18, fontWeight: "bold" }
});
