import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";
import BottomToolbar from "./bottomToolBar";

/* =========================================================
   EMAIL SUPPORT SCREEN
========================================================= */

const EmailSupportScreen = ({ navigation }) => {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert("Missing Information", "Please fill all fields");
      return;
    }

    // 🔒 Hook API / mail service here later
    Alert.alert(
      "Request Sent",
      "Our support team will contact you within 24 hours."
    );

    setSubject("");
    setMessage("");
  };

  return (
    <SafeAreaView style={styles.root}>

      {/* ================= HEADER ================= */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Email Support</Text>

        <View style={{ width: 22 }} />
      </View>

      {/* ================= CONTENT ================= */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.infoCard}>
          <Ionicons name="mail-outline" size={26} color="#1E3A8A" />
          <Text style={styles.infoTitle}>Contact via Email</Text>
          <Text style={styles.infoText}>
            Share your issue in detail. Our support team will respond within
            24 hours.
          </Text>
        </View>

        {/* FORM */}
        <View style={styles.form}>
          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter subject"
            placeholderTextColor="#94A3B8"
            value={subject}
            onChangeText={setSubject}
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe your issue in detail"
            placeholderTextColor="#94A3B8"
            value={message}
            onChangeText={setMessage}
            multiline
          />

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Send Request</Text>
          </TouchableOpacity>
        </View>

        {/* SUPPORT EMAIL */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Or email us directly at</Text>
          <Text style={styles.email}>contact.grambank@gmail.com</Text>
        </View>
      </ScrollView>

      {/* ================= BOTTOM TOOLBAR ================= */}
      <BottomToolbar navigation={navigation} active="Support" />
    </SafeAreaView>
  );
};

export default EmailSupportScreen;

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },

  /* HEADER */
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F5F7FB",
    borderBottomWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },

  /* SCROLL */
  scroll: {
    paddingBottom: 110,
  },

  /* INFO CARD */
  infoCard: {
    backgroundColor: "#FFFFFF",
    margin: 16,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  infoTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
  },
  infoText: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },

  /* FORM */
  form: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    color: "#0F172A",
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 14,
    color: "#0F172A",
  },
  textArea: {
    height: 120,
    textAlignVertical: "top",
  },

  button: {
    marginTop: 10,
    backgroundColor: "#1E3A8A",
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  /* FOOTER */
  footer: {
    marginTop: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    color: "#64748B",
  },
  email: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: "#1E3A8A",
  },
});
