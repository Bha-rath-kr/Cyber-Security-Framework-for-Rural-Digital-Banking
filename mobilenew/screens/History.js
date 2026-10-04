import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import * as Contacts from "expo-contacts";
import { api_url } from "../config";
import BottomToolbar from "./bottomToolBar";
import { getUnsyncedTransactions } from "../utilitis/database";
import { checkConnection } from "../utilitis/network";
import { formatINR } from "../utils/formatCurrency";
import Ionicons from "../components/Icon";

const History = ({ navigation }) => {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contactMap, setContactMap] = useState({});

  useEffect(() => {
    loadContacts();
    loadHistory();
  }, []);

  const loadContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === "granted") {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
        });
        const map = {};
        data.forEach(contact => {
          if (contact.phoneNumbers) {
            contact.phoneNumbers.forEach(phone => {
              const normalized = phone.number.replace(/\s/g, "").replace("+91", "");
              if (normalized.length >= 10) {
                map[normalized.slice(-10)] = contact.name;
              }
            });
          }
        });
        setContactMap(map);
      }
    } catch (err) {
      console.log("Contacts error:", err);
    }
  };

  const resolveName = (phone, dbName, fallback) => {
    if (dbName && dbName !== "Account") return dbName;
    if (phone && contactMap[phone]) return contactMap[phone];
    if (fallback && typeof fallback === "string" && fallback.includes("@")) {
      return fallback.split("@")[0];
    }
    return fallback || "Account";
  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const isOnline = await checkConnection();
      
      const serverTxns = isOnline
        ? await axios.get(`${api_url}/txns/history`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(res => res.data)
        : [];

      const localTxns = await getUnsyncedTransactions();

      const allTxns = [...serverTxns, ...localTxns.map(t => ({
        ...t,
        _id: t.local_id,
        txn_id: t.txn_id || `Offline-${t.local_id.substring(0, 8)}`,
        createdAt: new Date(t.created_at * 1000).toISOString(),
        type: t.type === 'bank_transfer' ? 'DEBIT' : 'DEBIT',
        is_offline: true,
        is_synced: t.is_synced === 1,
        status: t.status,
        to_phone: t.data?.phone || null,
        beneficiary_name: t.data?.beneficiary_name || null,
      }))];

      // Deduplicate: prefer server txn (has latest status), remove local if server exists
      const txnMap = new Map();
      allTxns.forEach(t => {
        const key = t.txn_id || t._id;
        if (!txnMap.has(key)) {
          txnMap.set(key, t);
        } else {
          // Keep the one with latest status (prefer non-offline or server version)
          const existing = txnMap.get(key);
          if (!t.is_offline) {
            txnMap.set(key, t); // Server version overwrites local
          }
        }
      });
      const deduped = Array.from(txnMap.values());

      deduped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setTxns(deduped);
    } catch (err) {
      console.error(err);
      const localTxns = await getUnsyncedTransactions();
      setTxns(localTxns.map(t => ({
        ...t,
        _id: t.local_id,
        txn_id: `Offline-${t.local_id.substring(0, 8)}`,
        createdAt: new Date(t.created_at * 1000).toISOString(),
        type: 'DEBIT',
        is_offline: true,
        is_synced: t.is_synced === 1,
        status: t.status,
        to_phone: t.data?.phone || null,
        beneficiary_name: t.data?.beneficiary_name || null,
      })));
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7C4DFF" />
        <BottomToolbar navigation={navigation} active="Home" />

      </View>
    );

  const renderItem = ({ item }) => {
    const isCredit = item?.type === "CREDIT";
    const isOffline = item?.is_offline;
    const isSynced = item?.is_synced;
    const isScheduled = item?.is_scheduled || item?.txn_type === "scheduled";
    const scheduledStatus = item?.status;

    const displayName = isCredit
      ? resolveName(item.from_phone, item.from_name, item.from_account || "Account")
      : resolveName(item.to_phone, item.beneficiary_name || item.to_name, item.to_account || item.to_upi || "Account");

    const displayText = isCredit
      ? `Received from ${displayName} • ${formatINR(item.amount)}`
      : `Paid to ${displayName} • ${formatINR(item.amount)}`;

    const handleReport = () => {
      Alert.alert(
        "Report Transaction",
        "What issue are you facing with this transaction?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Report Issue", 
            onPress: () => navigation.navigate("ReportTransaction", { transaction: item })
          }
        ]
      );
    };
    
    // Get status color and text
    const getStatusInfo = () => {
      if (isScheduled) {
        switch (scheduledStatus) {
          case 'HOLD_FOR_REVIEW': return { color: '#8B5CF6', text: 'Fraud Review' };
          case 'PENDING': return { color: '#F59E0B', text: 'Pending (Delayed)' };
          case 'APPROVED_BY_ADMIN': return { color: '#10B981', text: 'Approved' };
          case 'PROCESSING': return { color: '#3B82F6', text: 'Processing' };
          case 'COMPLETED': return { color: '#10B981', text: 'Completed' };
          case 'CANCELLED': return { color: '#EF4444', text: 'Cancelled' };
          case 'FAILED': return { color: '#EF4444', text: 'Failed' };
          case 'FRAUD_REPORTED': return { color: '#DC2626', text: 'Fraud Reported' };
          case 'REFUNDED': return { color: '#F59E0B', text: 'Refunded' };
          case 'REJECTED': return { color: '#EF4444', text: 'Rejected' };
          default: return { color: '#6B7280', text: scheduledStatus };
        }
      }
      return null;
    };
    const statusInfo = getStatusInfo();
    
    return (
      <TouchableOpacity style={styles.txnCard} onLongPress={handleReport}>
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: isCredit ? "#36C964" : "#FF5757" }]}>
            <Text style={styles.iconText}>{isCredit ? "+" : "-"}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.row}>
              <Text style={styles.amountText}>
                {displayText}
              </Text>
              {isScheduled && statusInfo && (
                <View style={[styles.syncTag, { backgroundColor: statusInfo.color }]}>
                  <Text style={styles.syncText}>{statusInfo.text}</Text>
                </View>
              )}
              {isOffline && !isScheduled && (
                <View style={[styles.syncTag, { backgroundColor: isSynced ? "#36C964" : "#F59E0B" }]}>
                  <Text style={styles.syncText}>{isSynced ? "Synced" : "Pending"}</Text>
                </View>
              )}
            </View>

            <Text style={styles.txnId}>{item.txn_id}</Text>
            {isScheduled && item.delay_reason && (
              <Text style={styles.txnId}>{item.delay_reason}</Text>
            )}
            <Text style={styles.date}>
              {isScheduled && item.scheduled_at 
                ? `Scheduled: ${new Date(item.scheduled_at).toLocaleString()}`
                : new Date(item.createdAt).toLocaleString()
              }
            </Text>
          </View>

          {item.is_fraud && (
            <View style={styles.fraudTag}>
              <Text style={styles.fraudText}>FRAUD</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.main}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction History</Text>
      </View>

      <View style={styles.container}>
        {txns.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: "#777" }}>No Transactions yet</Text>
          </View>
        ) : (
          <FlatList
            data={txns}
            keyExtractor={(item) => item._id || item.id || item.txn_id || Math.random().toString()}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
      <BottomToolbar navigation={navigation} active="Home" />

    </View>
  );
};

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
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    flex: 1,
  },

  txnCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 16,
    marginBottom: 12,
    elevation: 3,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },

  iconCircle: {
    width: 45,
    height: 45,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  iconText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 20,
  },

  amountText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#000",
    flex: 1,
    flexWrap: "wrap",
  },

  txnId: {
    fontSize: 12,
    color: "#777",
    marginTop: 2,
  },

  date: {
    color: "#666",
    marginTop: 5,
    fontSize: 12,
  },

  fraudTag: {
    backgroundColor: "#FFD7D7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },

  fraudText: {
    color: "#B80000",
    fontWeight: "bold",
    fontSize: 10,
  },

  syncTag: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  syncText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 10,
  },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});

export default History;
