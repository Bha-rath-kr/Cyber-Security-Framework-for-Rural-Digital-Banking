import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "../components/Icon";

const ChatBotScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([
    {
      id: "1",
      type: "bot",
      text: "Hello! I'm GramBank Assistant. How can I help you today?",
      suggestions: [
        "How do I send money?",
        "How do I receive money?",
        "Is my money safe?",
        "Report a problem"
      ]
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const scrollRef = useRef();

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      type: "user",
      text: text.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText("");
    setLoading(true);

    try {
      const res = await axios.post(`${api_url}/chatbot/chat`, {
        message: text.trim()
      }, { timeout: 10000 });

      console.log("Chat response:", res.data);

      const botResponse = {
        id: (Date.now() + 1).toString(),
        type: "bot",
        text: res.data.message,
        faq: res.data.faq,
        suggestions: res.data.suggestions
      };

      setMessages(prev => [...prev, botResponse]);
    } catch (err) {
      console.error("Chat error:", err.response?.status, err.response?.data || err.message);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: "bot",
        text: "Sorry, I'm having trouble. Please try again or browse our FAQs.",
        suggestions: ["Browse FAQs", "Contact Support"]
      }]);
    } finally {
      setLoading(false);
    }
  };

  const loadFaqs = async () => {
    setShowFaq(true);
    try {
      const res = await axios.get(`${api_url}/chatbot/faqs`, { timeout: 10000 });
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: "bot",
        text: "Here are all our FAQs by category:",
        faqs: res.data.faqs,
        categories: res.data.categories
      }]);
    } catch (err) {
      console.error("Load FAQs error:", err.response || err.message);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: "bot",
        text: "Unable to load FAQs right now. Here are some common questions:",
        faqs: [
          { id: 1, question: "How do I send money?", answer: "Go to Dashboard > Send to Mobile or Bank Transfer. Enter recipient details, amount, and confirm with OTP." },
          { id: 2, question: "How do I receive money?", answer: "Go to Dashboard > Receive Money. Share your UPI QR code or UPI ID with the sender." },
          { id: 3, question: "Is my money safe?", answer: "Yes! GramBank uses bank-grade security with encryption, fraud detection, and biometric login." }
        ],
        suggestions: ["Send Money", "Receive Money", "Contact Support"]
      }]);
    }
  };

  const renderMessage = ({ item }) => {
    if (item.type === "user") {
      return (
        <View style={styles.userMessage}>
          <Text style={styles.userText}>{item.text}</Text>
        </View>
      );
    }

    return (
      <View style={styles.botMessage}>
        <View style={styles.botHeader}>
          <Ionicons name="headset" size={20} color="#1E3A8A" />
          <Text style={styles.botName}>GramBank Assistant</Text>
        </View>
        <Text style={styles.botText}>{item.text}</Text>

        {item.faq && !Array.isArray(item.faq) && (
          <View style={styles.faqBox}>
            <Text style={styles.faqQuestion}>{item.faq.question}</Text>
            <Text style={styles.faqAnswer}>{item.faq.answer}</Text>
          </View>
        )}

        {item.suggestions && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestions}>
            {item.suggestions.map((sug, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.suggestionChip}
                onPress={() => sendMessage(sug)}
              >
                <Text style={styles.suggestionText}>{sug}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {item.categories && (
          <View style={styles.categoryGrid}>
            {item.categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={styles.categoryChip}
                onPress={() => sendMessage(cat)}
              >
                <Text style={styles.categoryText}>{cat.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {item.faqs && Array.isArray(item.faqs) && (
          <View style={styles.faqList}>
            {item.faqs.slice(0, 5).map((faq) => (
              <TouchableOpacity
                key={faq.id}
                style={styles.faqItem}
                onPress={() => {
                  setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    type: "bot",
                    text: faq.answer,
                    faq: faq
                  }]);
                }}
              >
                <Text style={styles.faqItemQuestion}>{faq.question}</Text>
                <Ionicons name="chevron-forward" size={16} color="#6B7280" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>GramBank Assistant</Text>
          <Text style={styles.headerSubtitle}>AI Powered Help</Text>
        </View>
        <TouchableOpacity onPress={loadFaqs}>
          <Ionicons name="list" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={scrollRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type your question..."
            value={inputText}
            onChangeText={setInputText}
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || loading}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => sendMessage("How do I send money?")}>
            <Ionicons name="send" size={16} color="#1E3A8A" />
            <Text style={styles.quickBtnText}>Send Money</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => sendMessage("How do I receive money?")}>
            <Ionicons name="download" size={16} color="#1E3A8A" />
            <Text style={styles.quickBtnText}>Receive Money</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => sendMessage("Is my money safe?")}>
            <Ionicons name="shield-checkmark" size={16} color="#1E3A8A" />
            <Text style={styles.quickBtnText}>Security</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FB" },
  header: {
    backgroundColor: "#1E3A8A",
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleContainer: {},
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  headerSubtitle: { color: "#93C5FD", fontSize: 12 },
  messagesList: { padding: 16, paddingBottom: 20 },
  userMessage: { alignItems: "flex-end", marginBottom: 12 },
  userText: {
    backgroundColor: "#1E3A8A",
    color: "#fff",
    padding: 12,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    maxWidth: "80%",
    fontSize: 15,
  },
  botMessage: {
    alignItems: "flex-start",
    marginBottom: 16,
    maxWidth: "90%",
  },
  botHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  botName: { color: "#1E3A8A", fontWeight: "600", fontSize: 13, marginLeft: 6 },
  botText: {
    backgroundColor: "#fff",
    color: "#1F2937",
    padding: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    fontSize: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  faqBox: {
    backgroundColor: "#EEF2FF",
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#1E3A8A",
  },
  faqQuestion: { color: "#1E3A8A", fontWeight: "600", fontSize: 14, marginBottom: 6 },
  faqAnswer: { color: "#374151", fontSize: 13, lineHeight: 20 },
  suggestions: { marginTop: 10, flexDirection: "row" },
  suggestionChip: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  suggestionText: { color: "#374151", fontSize: 13 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 8 },
  categoryChip: {
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  faqList: { marginTop: 12 },
  faqItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  faqItemQuestion: { color: "#374151", fontSize: 13, flex: 1, marginRight: 8 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#fff",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  input: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: "#1F2937",
  },
  sendBtn: {
    backgroundColor: "#1E3A8A",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  sendBtnDisabled: { backgroundColor: "#9CA3AF" },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  quickBtnText: { color: "#1E3A8A", fontSize: 12, fontWeight: "600", marginLeft: 6 },
});

export default ChatBotScreen;