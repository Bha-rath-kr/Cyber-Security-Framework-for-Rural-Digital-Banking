import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { displayStatus } from "../utils/statusHelpers";

const Settings = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [accountStatus, setAccountStatus] = useState("ACTIVE");
  const [statusReason, setStatusReason] = useState("");
  const [restrictionLevel, setRestrictionLevel] = useState("none");

  useEffect(() => {
    loadUser();
    loadAccountStatus();
  }, []);

  const loadAccountStatus = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${api_url}/txns/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.accountStatus) setAccountStatus(res.data.accountStatus);
      if (res.data.statusReason) setStatusReason(res.data.statusReason);
      if (res.data.restrictionLevel) setRestrictionLevel(res.data.restrictionLevel);
    } catch (e) {}
  };

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      const upiId = await AsyncStorage.getItem("upiId");
      if (userData) {
        const parsed = JSON.parse(userData);
        setUser({ ...parsed, upiId: upiId || parsed.upiId });
      }
    } catch (err) {
      console.error("Failed to load user:", err);
    }
  };

  const handleCopyUPI = async () => {
    if (user?.upiId) {
      try {
        await Clipboard.setStringAsync(user.upiId);
        Alert.alert("Copied", "UPI ID copied to clipboard");
      } catch {
        Alert.alert("UPI ID", user.upiId);
      }
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.clear();
            navigation.reset({
              index: 0,
              routes: [{ name: "Login" }],
            });
          },
        },
      ]
    );
  };

  const handleOpenTerms = () => {
    Alert.alert("Terms and Conditions", "GramBank Terms:\n\n1. Users must be 18+ years old.\n2. All transactions are subject to fraud detection.\n3. Accounts may be frozen for suspicious activity.\n4. Users are responsible for keeping their MPIN secure.");
  };

  const handleOpenPrivacy = () => {
    Alert.alert("Privacy Policy", "GramBank Privacy:\n\n1. Your Aadhaar and PAN are encrypted.\n2. Transaction data is used only for fraud detection.\n3. We do not share your data with third parties.\n4. Biometric data stays on your device.");
  };

  return (
    <View style={styles.main}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {user && (
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {user.name?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.name}</Text>
              <Text style={styles.profileDetails}>
                A/C: {user.accountNumber}
              </Text>
            </View>
          </View>
        )}

        {user && (
          <View style={styles.accountCard}>
            <Text style={styles.accountCardTitle}>Account Information</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Holder</Text>
              <Text style={styles.infoValue}>{user.name}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Number</Text>
              <Text style={styles.infoValue}>{user.accountNumber}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>IFSC Code</Text>
              <Text style={styles.infoValue}>{user.ifsc || "GBRK0002130"}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View>
                <Text style={styles.infoLabel}>UPI ID</Text>
                <Text style={styles.infoValue}>{user.upiId}</Text>
              </View>
              <TouchableOpacity style={styles.copyBtn} onPress={handleCopyUPI}>
                <Text style={styles.copyBtnText}>Copy</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SECURITY STATUS */}
        <View style={styles.securityCard}>
          <Text style={styles.securityCardTitle}>🔒 Security Status</Text>
          {restrictionLevel === "none" ? (
            <View style={styles.securityRow}>
              <Text style={styles.securityBadgeActive}>Active</Text>
              <Text style={styles.securityReason}>{statusReason}</Text>
            </View>
          ) : (
            <View style={styles.securityRow}>
              <View style={[styles.securityBadge, {
                backgroundColor: restrictionLevel === "monitoring" ? "#FEF3C7" : "#FEE2E2",
              }]}>
                <Text style={[styles.securityBadgeText, {
                  color: restrictionLevel === "monitoring" ? "#D97706" : "#DC2626",
                }]}>
                  {accountStatus === "UNDER_INVESTIGATION" ? "Under Investigation"
                    : accountStatus === "UNDER_REVIEW" ? "Under Review"
                    : accountStatus === "TEMP_FROZEN" ? "Temporarily Frozen"
                    : displayStatus(accountStatus)}
                </Text>
              </View>
              <Text style={styles.securityReason}>{statusReason}</Text>
              <TouchableOpacity
                style={styles.contactSupportBtn}
                onPress={() => navigation.navigate("LiveChat")}
              >
                <Text style={styles.contactSupportText}>Contact Support</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.infoCard} onPress={handleOpenTerms}>
          <Text style={styles.infoCardText}>📜 Terms and Conditions</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.infoCard} onPress={handleOpenPrivacy}>
          <Text style={styles.infoCardText}>🔒 Privacy Policy</Text>
        </TouchableOpacity>

        <View style={styles.aboutSection}>
          <Text style={styles.aboutTitle}>About GramBank</Text>
          <Text style={styles.aboutText}>
            GramBank ensures safe and secure banking for rural areas using
            advanced fraud detection and secure authentication features.
          </Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>

        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>🚪 Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  main: { flex: 1, backgroundColor: "#F1E9FF" },
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
  backArrow: { color: "#fff", fontSize: 26, marginRight: 10 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#5E2CED",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#333",
  },
  profileDetails: {
    fontSize: 13,
    color: "#777",
    marginTop: 2,
  },
  accountCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },
  accountCardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#5E2CED",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: "#777",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    flexShrink: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  copyBtn: {
    backgroundColor: "#5E2CED",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 10,
  },
  copyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoCardText: {
    fontSize: 15,
    color: "#333",
    fontWeight: "600",
  },
  securityCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  securityCardTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#5E2CED",
    marginBottom: 10,
  },
  securityRow: {
    gap: 10,
  },
  securityBadgeActive: {
    color: "#16A34A",
    fontWeight: "700",
    fontSize: 14,
  },
  securityBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  securityBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  securityReason: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },
  contactSupportBtn: {
    backgroundColor: "#5E2CED",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  contactSupportText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  aboutSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    marginBottom: 20,
  },
  aboutTitle: { fontWeight: "bold", color: "#5E2CED", fontSize: 16, marginBottom: 5 },
  aboutText: { color: "#555", fontSize: 14, marginBottom: 10 },
  version: { color: "#999", fontSize: 13, textAlign: "right" },
  logoutButton: {
    backgroundColor: "#FFEBEE",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EF5350",
    marginBottom: 20,
  },
  logoutText: { fontSize: 16, color: "#D32F2F", fontWeight: "bold" },
});

export default Settings;
