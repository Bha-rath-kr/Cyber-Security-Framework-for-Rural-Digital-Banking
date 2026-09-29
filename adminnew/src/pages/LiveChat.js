import { useEffect, useState } from "react";
import { MessageCircle, Send, X, User } from "lucide-react";
import { getLiveChats, getChatMessages, sendChatMessage } from "../api/dashboard.api";

export default function LiveChat() {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadChats();
    const interval = setInterval(loadChatsSilent, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedChat) return;
    const interval = setInterval(() => loadMessages(selectedChat.user_id), 10000);
    return () => clearInterval(interval);
  }, [selectedChat]);

  const loadChats = async () => {
    try {
      setError(null);
      const res = await getLiveChats();
      setChats(res.data.chats || []);
    } catch (err) {
      console.error("Load chats error", err);
      setError("Failed to load chats. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadChatsSilent = async () => {
    try {
      const res = await getLiveChats();
      setChats(res.data.chats || []);
    } catch (err) {
      // silent poll
    }
  };

  const loadMessages = async (userId) => {
    try {
      const res = await getChatMessages(userId);
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error("Load messages error", err);
    }
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={loadChats} className="px-4 py-2 bg-green-600 text-white rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
    loadMessages(chat.user_id);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;
    
    setSending(true);
    try {
      await sendChatMessage(selectedChat.user_id, newMessage);
      setNewMessage("");
      loadMessages(selectedChat.user_id);
    } catch (err) {
      console.error("Send message error", err);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) return <div>Loading chats...</div>;

  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Live Chat</h1>
      <p className="text-muted mb-6">Respond to user queries</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
        {/* Chat List */}
        <div className="bg-card dark:bg-darkcard rounded-xl border overflow-y-auto">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Conversations</h2>
          </div>
          {chats.length === 0 ? (
            <div className="p-4 text-center text-muted">No chats yet</div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.user_id}
                onClick={() => handleSelectChat(chat)}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  selectedChat?.user_id === chat.user_id ? "bg-green-50" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <User size={20} className="text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{chat.user_name}</div>
                    <div className="text-sm text-muted truncate">
                      {chat.last_message || "No messages"}
                    </div>
                  </div>
                  {chat.unread_count > 0 && (
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                      {chat.unread_count}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat Window */}
        <div className="md:col-span-2 bg-card dark:bg-darkcard rounded-xl border flex flex-col">
          {selectedChat ? (
            <>
              <div className="p-4 border-b flex justify-between items-center">
                <div className="font-semibold">{selectedChat.user_name}</div>
                <button onClick={() => setSelectedChat(null)}>
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id || msg._id}
                    className={`flex ${msg.sender_type === "ADMIN" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-xl ${
                        msg.sender_type === "ADMIN"
                          ? "bg-green-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <div>{msg.message}</div>
                      <div className={`text-xs mt-1 ${msg.sender_type === "ADMIN" ? "text-green-100" : "text-gray-500"}`}>
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t flex gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted">
              <div className="text-center">
                <MessageCircle size={48} className="mx-auto mb-4 text-gray-300" />
                <p>Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}