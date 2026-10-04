import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import Ionicons from "../components/Icon";
import { formatINR } from "../utils/formatCurrency";

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) return;

      const res = await axios.get(`${api_url}/txns/alerts`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const mapped = res.data.map((alert) => ({
        id: alert._id,
        title: alert.popupTitle || "Suspicious Transaction Alert",
        msg: alert.userMessage || alert.fraud_reason || `${formatINR(alert.amount)} flagged as suspicious` || alert.riskReasons?.join(", "),
        time: new Date(alert.createdAt).toLocaleString(),
        unread: true,
        amount: alert.amount,
        riskScore: alert.riskScore,
        decision: alert.decision,
        txn_id: alert.txn_id,
      }));

      setAlerts(mapped);
    } catch (err) {
      console.error("Load alerts error:", err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = (id) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, unread: false } : a));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7C4DFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Alerts</Text>

      {alerts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No alerts</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={item => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.card,
                item.unread ? styles.unreadCard : null
              ]}
              onPress={() => markAsRead(item.id)}
            >
              <View style={styles.row}>
                <View style={styles.iconCircle}>
                  <Ionicons name="warning-outline" size={18} color="#F59E0B" />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.msg}>{item.msg}</Text>
                  {item.riskScore !== undefined && (
                    <Text style={[styles.riskBadge, { color: item.riskScore >= 90 ? '#DC2626' : item.riskScore >= 60 ? '#D97706' : item.riskScore >= 30 ? '#EA580C' : '#16A34A' }]}>
                      Risk: {item.riskScore}/200
                    </Text>
                  )}
                  <Text style={styles.time}>{item.time}</Text>
                </View>

                {item.unread && <View style={styles.dot} />}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f12",
    paddingTop: 50,
    paddingHorizontal: 15
  },
  header: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10
  },
  card: {
    backgroundColor: "#1b1435",
    padding: 15,
    borderRadius: 12,
    marginVertical: 6,
  },
  unreadCard: {
    borderWidth: 1,
    borderColor: "#7C4DFF"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2a1f4e",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold"
  },
  msg: {
    color: "#ccc",
    marginTop: 3
  },
  time: {
    color: "#888",
    marginTop: 4,
    fontSize: 12
  },
  riskBadge: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "bold",
  },
  dot: {
    width: 10,
    height: 10,
    backgroundColor: "#7C4DFF",
    borderRadius: 50
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyText: {
    color: "#888",
    fontSize: 16
  }
});
