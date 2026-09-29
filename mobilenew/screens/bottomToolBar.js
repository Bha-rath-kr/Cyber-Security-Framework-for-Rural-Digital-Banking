import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const BottomToolbar = ({ navigation, active = "Home" }) => {
  const Item = ({ label, icon, route }) => {
    const isActive = active === label;

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => route && navigation.navigate(route)}
      >
        <Ionicons
          name={icon}
          size={22}
          color={isActive ? "#1E3A8A" : "#64748B"}
        />
        <Text
          style={[
            styles.text,
            { color: isActive ? "#1E3A8A" : "#64748B" },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Item label="Home" icon="home-outline" route="Dashboard" />
      <Item
        label="Transactions"
        icon="swap-horizontal-outline"
        route="History"
      />

      {/* CENTER QR */}
      <TouchableOpacity
        style={styles.qrButton}
        onPress={() => navigation.navigate("UPIQRPay")}
      >
        <Ionicons name="qr-code-outline" size={26} color="#fff" />
      </TouchableOpacity>

      <Item label="Support" icon="headset-outline" route="SupportScreen" />
      <Item label="Profile" icon="person-outline" route="Settings" />
    </View>
  );
};

export default BottomToolbar;

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 0.5,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },

  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  text: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: "500",
  },

  qrButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1E3A8A",
    justifyContent: "center",
    alignItems: "center",
    marginTop: -28,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
});
