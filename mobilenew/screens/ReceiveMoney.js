import React from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";

export default function ReceiveMoney({ route, navigation }) {
  const { upiId, upiQR } = route.params || {};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Receive Money</Text>

      <Text style={styles.sub}>Scan this QR to pay you</Text>

      {upiQR ? (
        <Image source={{ uri: upiQR }} style={styles.qr} />
      ) : (
        <Text style={{ color: "#666", marginTop: 10 }}>
          QR code not available
        </Text>
      )}

      <Text style={styles.upi}>{upiId || "N/A"}</Text>

      <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
        <Text style={styles.btnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f12",
    alignItems: "center",
    justifyContent:'center',
    paddingTop: 50,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  sub: {
    color: "#bbb",
    marginTop: 6,
    marginBottom: 20,
  },
  qr: {
    width: 260,
    height: 260,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 14,
  },
  upi: {
    color: "#fff",
    marginTop: 15,
    fontWeight: "bold",
    fontSize: 16,
  },
  btn: {
    marginTop: 30,
    backgroundColor: "#7C4DFF",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
