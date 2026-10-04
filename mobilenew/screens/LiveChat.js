import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "../components/Icon";

const LiveChatScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const flatListRef = useRef();
  const pollingRef = useRef();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadMessages();
    markAsRead();
    pollingRef.current = setInterval(() => {
      if (mountedRef.current) pollMessages();
    }, 10000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const compareMessages = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id || a[i].message !== b[i].message) return false;
    }
    return true;
  };

  const loadMessages = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${api_url}/live-chat/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const newMsgs = res.data.messages || [];
      if (mountedRef.current && !compareMessages(messages, newMsgs)) {
        setMessages(newMsgs);
      }
      if (!initialLoadDone) setInitialLoadDone(true);
    } catch (err) {
      console.error("Load messages error:", err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const pollMessages = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${api_url}/live-chat/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const newMsgs = res.data.messages || [];
      if (mountedRef.current && !compareMessages(messages, newMsgs)) {
        setMessages(newMsgs);
      }
    } catch (err) {
      console.error("Poll messages error:", err);
    }
  };

  const markAsRead = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      await axios.put(`${api_url}/live-chat/mark-read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error("Mark read error:", err);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const text = inputText.trim();
    setInputText("");
    setSending(true);

    const tempMessage = {
      id: Date.now().toString(),
      message: text,
      sender_type: "USER",
      sender_name: "You",
      createdAt: new Date().toISOString(),
      sending: true
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.post(`${api_url}/live-chat/message`,
        { message: text },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMessages(prev => prev.map(m => 
        m.id === tempMessage.id 
          ? { ...res.data.chatMessage, sender_name: "You", sender_type: "USER" }
          : m
      ));
    } catch (err) {
      console.error("Send message error:", err);
      setMessages(prev => prev.map(m => 
        m.id === tempMessage.id ? { ...m, error: true } : m
      ));
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessage = ({ item }) => {
    const isUser = item.sender_type === "USER";
    
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.adminBubble]}>
        {!isUser && (
          <View style={styles.senderInfo}>
            <Ionicons name="person" size={12} color="#1E3A8A" />
            <Text style={styles.senderName}>{item.sender_name || "Support"}</Text>
          </View>
        )}
        <Text style={[styles.messageText, isUser ? styles.userText : styles.adminText]}>
          {item.message}
        </Text>
        <Text style={[styles.timeText, isUser ? styles.userTime : styles.adminTime]}>
          {formatTime(item.createdAt)}
          {item.sending && " • Sending..."}
          {item.error && " • Failed"}
        </Text>
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
          <Text style={styles.headerTitle}>Live Chat</Text>
          <Text style={styles.headerSubtitle}>Support Team</Text>
        </View>
        <TouchableOpacity onPress={loadMessages}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading && !initialLoadDone ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E3A8A" />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>Start a conversation with our support team</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id?.toString() || item._id?.toString() || Math.random().toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            value={inputText}
            onChangeText={setInputText}
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
          >
            <Ionicons name="send" size={20} color="#fff" />
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
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  emptyText: { color: "#6B7280", fontSize: 18, fontWeight: "600", marginTop: 16 },
  emptySubtext: { color: "#9CA3AF", fontSize: 14, marginTop: 4, textAlign: "center" },
  messagesList: { padding: 16 },
  messageBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#1E3A8A",
    borderBottomRightRadius: 4,
  },
  adminBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  senderInfo: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  senderName: { color: "#1E3A8A", fontSize: 12, fontWeight: "600", marginLeft: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  userText: { color: "#fff" },
  adminText: { color: "#1F2937" },
  timeText: { fontSize: 11, marginTop: 4 },
  userTime: { color: "#93C5FD", textAlign: "right" },
  adminTime: { color: "#9CA3AF" },
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
});

export default LiveChatScreen;