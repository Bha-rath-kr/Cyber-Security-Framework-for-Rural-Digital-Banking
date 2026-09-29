import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Contacts from "expo-contacts";
import { Platform } from "react-native";
import axios from "axios";
import { api_url } from "../config";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function PayMobile({ navigation }) {
  const [sections, setSections] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [gramBankUsers, setGramBankUsers] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [deviceContacts, bankUsers] = await Promise.all([
        getDeviceContacts(),
        getGramBankUsers(),
      ]);

      setGramBankUsers(bankUsers);
      const merged = mergeContacts(deviceContacts, bankUsers);
      setSections(merged);
      setFiltered(merged);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getDeviceContacts = async () => {
    if (Platform.OS === "web") {
      return [
        { name: "Amit Sharma", number: "9876543210" },
        { name: "Anjali Verma", number: "9988776655" },
        { name: "Bharath Kumar", number: "7012345678" },
        { name: "Chandru Yadav", number: "9090909090" },
        { name: "David Miller", number: "8080808080" },
        { name: "Ganesh Rao", number: "7000123456" },
        { name: "Harsh Patel", number: "9812345678" },
        { name: "Ishita Singh", number: "9123456789" },
        { name: "Karan Mehta", number: "9300000000" },
        { name: "Rahul Gupta", number: "7894561230" },
        { name: "Rohit Sharma", number: "9999999999" },
        { name: "Sanjay Rao", number: "8888888888" },
        { name: "Virat Kohli", number: "7777777777" },
      ];
    }

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") return [];

    const res = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
    });

    return res.data
      .filter(c => c.phoneNumbers?.length > 0)
      .map(c => ({
        name: c.name || "Unknown",
        number: c.phoneNumbers[0]?.number?.replace(/\s/g, "").replace("+91", ""),
      }));
  };

  const STATUS_LABELS = {
    TEMP_FROZEN: { label: "Temp Frozen", color: "#F97316" },
    UNDER_REVIEW: { label: "Under Review", color: "#F59E0B" },
    FROZEN: { label: "Frozen", color: "#EF4444" },
    BLOCKED: { label: "Blocked", color: "#1F2937" },
    SUSPENDED: { label: "Suspended", color: "#EA580C" },
    BLACKLISTED: { label: "Blacklisted", color: "#DC2626" },
    CONFIRMED_FRAUD: { label: "Confirmed Fraud", color: "#7C3AED" },
    UNDER_INVESTIGATION: { label: "Under Investigation", color: "#F59E0B" },
    FLAGGED: { label: "Flagged", color: "#F97316" },
  };

  const AVATAR_COLORS = {
    ACTIVE: "#10B981",
    TEMP_FROZEN: "#F97316",
    UNDER_REVIEW: "#F59E0B",
    FROZEN: "#EF4444",
    BLOCKED: "#1F2937",
    SUSPENDED: "#EA580C",
    BLACKLISTED: "#DC2626",
    CONFIRMED_FRAUD: "#7C3AED",
    UNDER_INVESTIGATION: "#F59E0B",
    FLAGGED: "#F97316",
  };

  const getGramBankUsers = async () => {
    try {
      const res = await axios.get(`${api_url}/users/all-contacts`);
      return res.data.map(u => ({
        name: u.name,
        number: u.phone,
        upiId: u.upiId,
        accountNumber: u.accountNumber,
        status: u.status === "CLEARED" ? "ACTIVE" : u.status,
        isGramBankUser: u.source === "user",
        source: u.source,
        riskLevel: u.riskLevel,
        reason: u.reason,
        complaintStatus: u.complaintStatus,
      }));
    } catch (err) {
      console.error("Fetch GramBank users error:", err);
      return [];
    }
  };

  const mergeContacts = (deviceContacts, bankUsers) => {
    const bankPhoneMap = {};
    bankUsers.forEach(u => {
      bankPhoneMap[u.number] = u;
    });

    const seenPhones = new Set();
    const merged = [];

    // Priority 1: Device contacts that are GramBank users
    deviceContacts.forEach(c => {
      const phone = c.number;
      if (bankPhoneMap[phone]) {
        seenPhones.add(phone);
        merged.push({
          ...c,
          isGramBankUser: true,
          upiId: bankPhoneMap[phone].upiId,
          accountNumber: bankPhoneMap[phone].accountNumber,
        });
      }
    });

    // Priority 2: Device contacts that are NOT GramBank users
    deviceContacts.forEach(c => {
      if (!seenPhones.has(c.number)) {
        seenPhones.add(c.number);
        merged.push({ ...c, isGramBankUser: false });
      }
    });

    // Priority 3: GramBank users not in device contacts
    bankUsers.forEach(u => {
      if (!seenPhones.has(u.number)) {
        merged.push(u);
      }
    });

    // Sort alphabetically
    merged.sort((a, b) => a.name.localeCompare(b.name));

    // Group by letter
    return letters
      .map(l => ({
        title: l,
        data: merged.filter(c => c.name?.toUpperCase().startsWith(l)),
      }))
      .filter(s => s.data.length > 0);
  };

  const search = (txt) => {
    setSearchText(txt);

    if (!txt) return setFiltered(sections);

    const newData = sections
      .map(section => ({
        title: section.title,
        data: section.data.filter(
          c =>
            c.name.toLowerCase().includes(txt.toLowerCase()) ||
            c.number.includes(txt) ||
            (c.accountNumber && c.accountNumber.includes(txt))
        ),
      }))
      .filter(s => s.data.length > 0);

    setFiltered(newData);
  };

  const selectContact = (item) => {
    if (item.status === "UNDER_INVESTIGATION" || item.status === "UNDER_REVIEW" || item.status === "FLAGGED") {
      const info = STATUS_LABELS[item.status];
      Alert.alert(
        "Account Under Review",
        `This account is ${info?.label || item.status}. Transfers may be monitored or delayed. Proceed?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Proceed", onPress: () => proceedToPayment(item) },
        ]
      );
      return;
    }

    if (item.status && item.status !== "ACTIVE") {
      const info = STATUS_LABELS[item.status];
      Alert.alert(
        "Account Restricted",
        `This account is ${info?.label || item.status}. The transaction may be blocked by our security system. Do you want to proceed?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Proceed", onPress: () => proceedToPayment(item) },
        ]
      );
      return;
    }

    proceedToPayment(item);
  };

  const proceedToPayment = (item) => {
    const cleaned = item.number.replace(/\D/g, "");

    if (item.isGramBankUser && item.upiId) {
      navigation.navigate("UPIPaymentScreen", {
        upiId: item.upiId,
        name: item.name,
        isGramBankUser: true,
      });
    } else {
      navigation.navigate("UPIPaymentScreen", {
        upiId: `${cleaned}@ybl`,
        name: item.name,
        isGramBankUser: false,
      });
    }
  };

  const scrollToLetter = (letter) => {
    const index = filtered.findIndex(s => s.title === letter);
    if (index !== -1)
      listRef.current.scrollToLocation({ sectionIndex: index, itemIndex: 0 });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5E2CED" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Contact</Text>
        <View style={{ width: 25 }} />
      </View>

      <TextInput
        placeholder="Search name or number"
        placeholderTextColor="#999"
        style={styles.search}
        onChangeText={search}
        value={searchText}
      />

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No contacts found</Text>
        </View>
      ) : (
        <SectionList
          ref={listRef}
          sections={filtered}
          keyExtractor={(item, index) => `${item.number}-${index}`}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionText}>{title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => selectContact(item)}
            >
              <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.status] || (item.isGramBankUser ? "#10B981" : "#6B7280") }]}>
                <Text style={styles.avatarText}>{item.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.isGramBankUser && item.status === "ACTIVE" && (
                    <Text style={styles.verifiedBadge}>✓ GramBank</Text>
                  )}
                  {item.status && item.status !== "ACTIVE" && (
                    <Text style={[styles.statusBadge, { color: STATUS_LABELS[item.status]?.color || "#EF4444", backgroundColor: (STATUS_LABELS[item.status]?.color || "#EF4444") + "22" }]}>
                      {STATUS_LABELS[item.status]?.label || item.status}
                    </Text>
                  )}
                </View>
                <Text style={styles.number}>{item.number}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={styles.alphaBar}>
        {letters.map(l => (
          <TouchableOpacity key={l} onPress={() => scrollToLetter(l)}>
            <Text style={styles.alphaText}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1E9FF" },
  header: {
    backgroundColor: "#5E2CED",
    paddingTop: 50,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  backArrow: { color: "#fff", fontSize: 26, marginRight: 10 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700", flex: 1 },
  search: {
    margin: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    color: "#000",
    padding: 12,
    elevation: 2,
  },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#777", fontSize: 16 },
  sectionHeader: {
    backgroundColor: "#F1E9FF",
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  sectionText: { color: "#5E2CED", fontSize: 13, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 0.4,
    borderColor: "#E5E7EB",
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 50,
    backgroundColor: "#7C4DFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontWeight: "bold", fontSize: 18 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: { color: "#000", fontSize: 16, fontWeight: "600" },
  verifiedBadge: {
    marginLeft: 8,
    color: "#10B981",
    fontSize: 12,
    fontWeight: "bold",
  },
  statusBadge: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: "bold",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  number: { color: "#777", marginTop: 2 },
  alphaBar: {
    position: "absolute",
    right: 5,
    top: 160,
  },
  alphaText: {
    color: "#5E2CED",
    paddingVertical: 2,
    fontSize: 12,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F1E9FF" },
});
