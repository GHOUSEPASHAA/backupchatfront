import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import forge from "node-forge";
import VoiceCall from "./VoiceCall";

const Message = ({ token, privateKey }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const socket = useRef(null);

  // Utility function to safely convert anything to a renderable string
  const safeRender = (value, fallback = "Unknown") => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") return value;
    if (typeof value === "object" && value.name) return value.name;
    return JSON.stringify(value);
  };

  const decryptMessage = (encryptedContent, plaintextContent, isPrivate, senderId, currentUserId) => {
    if (!isPrivate || senderId === currentUserId) return safeRender(plaintextContent);
    if (!privateKey || !encryptedContent) return safeRender(encryptedContent || plaintextContent);
    try {
      const privateKeyObj = forge.pki.privateKeyFromPem(privateKey);
      const encryptedBytes = forge.util.decode64(encryptedContent);
      const decrypted = privateKeyObj.decrypt(encryptedBytes, 'RSA-OAEP');
      return forge.util.decodeUtf8(decrypted);
    } catch (error) {
      console.error("Decryption error:", error.message);
      return "[Decryption Failed]";
    }
  };

  useEffect(() => {
    if (token && !socket.current) {
      socket.current = io("http://localhost:3000", {
        auth: { token },
        forceNew: true,
      });

      socket.current.on("connect", () => console.log("Connected to server:", socket.current.id));
      socket.current.on("userId", (userId) => {
        setCurrentUserId(userId);
        socket.current.userId = userId;
        console.log("User ID set:", userId);
      });

      socket.current.on("chatMessage", (msg) => {
        const isPrivate = !!msg.recipient;
        const content = decryptMessage(
          msg.encryptedContent,
          msg.content,
          isPrivate,
          safeRender(msg.sender?._id || msg.sender),
          socket.current.userId
        );

        setMessages((prev) => {
          const filtered = prev.filter(m => m._id !== msg._id && m.tempId !== msg.tempId);
          console.log("New message received:", { ...msg, content });
          return [...filtered, { ...msg, content }];
        });

        if (safeRender(msg.sender?._id || msg.sender) !== currentUserId) {
          const senderName = safeRender(msg.sender?.name, "Someone");
          const notificationId = Date.now();
          setNotifications((prev) => [...prev, { id: notificationId, text: `${senderName}: ${content}` }]);
          setTimeout(() => setNotifications((prev) => prev.filter(n => n.id !== notificationId)), 5000);
        }
      });

      // Voice Call Events
      socket.current.on("callRequest", ({ from }) => {
        const senderName = safeRender(users.find(u => u._id === from)?.name, "Someone");
        setIncomingCall({ from, senderName });
        console.log("Incoming call request from:", from, senderName);
      });

      socket.current.on("callAccepted", () => {
        console.log("Call accepted, activating VoiceCall");
        setIsCallActive(true);
        setIncomingCall(null);
      });

      socket.current.on("callRejected", () => {
        console.log("Call rejected by other party");
        setNotifications((prev) => [
          ...prev,
          { id: Date.now(), text: "Call was rejected" },
        ]);
        setTimeout(() => setNotifications((prev) => prev.filter(n => n.id !== Date.now())), 5000);
        setIncomingCall(null);
      });

      socket.current.on("callEnded", () => {
        console.log("Call ended by other party");
        setIsCallActive(false);
        setIncomingCall(null);
      });

      socket.current.on("error", (error) => console.error("Socket error:", error.message));

      // Fetch users
      axios
        .get("http://localhost:3000/api/users", { headers: { Authorization: token } })
        .then((res) => {
          setUsers(res.data);
          console.log("Users fetched:", res.data);
        })
        .catch((err) => console.error("Error fetching users:", err));
    }

    return () => {
      if (socket.current) {
        socket.current.disconnect();
        socket.current = null;
        console.log("Socket disconnected");
      }
    };
  }, [token, privateKey]);

  useEffect(() => {
    if (token && selectedUser && currentUserId) {
      const fetchMessages = async () => {
        try {
          const url = `http://localhost:3000/api/messages/private/${selectedUser}`;
          const res = await axios.get(url, { headers: { Authorization: token } });
          const processedMessages = res.data.map((msg) => ({
            ...msg,
            content: decryptMessage(
              msg.encryptedContent,
              msg.content,
              !!msg.recipient,
              safeRender(msg.sender?._id || msg.sender),
              currentUserId
            ),
          }));

          setMessages((prev) => {
            const existingIds = new Set(prev.map(m => m._id || m.tempId));
            const newMessages = processedMessages.filter(m => !existingIds.has(m._id || m.tempId));
            console.log("Fetched messages merged:", newMessages);
            return [...prev, ...newMessages];
          });
        } catch (error) {
          console.error("Error fetching messages:", error);
        }
      };
      fetchMessages();
    }
  }, [selectedUser, token, privateKey, currentUserId]);

  const sendMessage = () => {
    if (!socket.current || !message.trim()) {
      console.log("Cannot send message: no socket or empty message");
      return;
    }

    const tempId = Date.now().toString();
    const newMessage = {
      sender: { _id: currentUserId, name: "You" },
      content: message,
      recipient: selectedUser,
      tempId,
      timestamp: new Date(),
    };

    socket.current.emit("chatMessage", {
      recipient: selectedUser,
      content: message,
      tempId,
    });
    console.log("Message sent:", newMessage);

    setMessages((prev) => [...prev, newMessage]);
    setMessage("");
  };

  const initiateCall = () => {
    if (!socket.current || !selectedUser) {
      console.log("Cannot initiate call: no socket or selected user");
      return;
    }
    socket.current.emit("callRequest", { to: selectedUser });
    console.log("Call request sent to:", selectedUser);
  };

  const acceptCall = () => {
    if (!socket.current || !incomingCall) {
      console.log("Cannot accept call: no socket or incoming call");
      return;
    }
    socket.current.emit("callAccepted", { to: incomingCall.from });
    setSelectedUser(incomingCall.from);
    setIsCallActive(true);
    console.log("Call accepted, from:", incomingCall.from);
  };

  const rejectCall = () => {
    if (!socket.current || !incomingCall) {
      console.log("Cannot reject call: no socket or incoming call");
      return;
    }
    socket.current.emit("callRejected", { to: incomingCall.from });
    setIncomingCall(null);
    console.log("Call rejected, from:", incomingCall.from);
  };

  const endCall = () => {
    if (!socket.current) {
      console.log("Cannot end call: no socket");
      return;
    }
    socket.current.emit("callEnded", { to: selectedUser });
    setIsCallActive(false);
    console.log("Call ended, to:", selectedUser);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-hidden relative">
      {/* Contact List */}
      <div
        className={`w-full md:w-1/4 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out ${
          selectedUser && !isCallActive ? "-translate-x-full md:translate-x-0" : "translate-x-0"
        }`}
        style={{ zIndex: 10 }}
      >
        <div className="p-6 bg-gradient-to-r from-purple-600 to-pink-600">
          <h1 className="text-2xl font-bold text-white">Chats</h1>
        </div>
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search..."
            className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-500"
          />
        </div>
        <div className="overflow-y-auto h-[calc(100vh-128px)]">
          {users.map((user) => (
            <div
              key={user._id}
              className="flex items-center p-4 hover:bg-gray-50 cursor-pointer"
              onClick={() => setSelectedUser(user._id)}
            >
              <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                <span className="text-white font-bold">{safeRender(user.name?.[0])}</span>
              </div>
              <div className="ml-4">
                <p className="text-gray-800 font-medium">{safeRender(user.name)}</p>
                <p className="text-sm text-gray-500">Last message preview...</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat View or Voice Call */}
      <div
        className={`w-full md:w-3/4 bg-gray-50 absolute md:static inset-0 transform transition-transform duration-300 ease-in-out ${
          selectedUser ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
        style={{ zIndex: selectedUser ? 20 : 0 }}
      >
        <div className="p-6 bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-between">
          <div className="flex items-center">
            <button
              className="md:hidden text-white mr-4"
              onClick={() => setSelectedUser(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-white">
              {selectedUser ? safeRender(users.find((u) => u._id === selectedUser)?.name) : "Select a User"}
            </h1>
          </div>
          {selectedUser && !isCallActive && (
            <button onClick={initiateCall} className="text-white hover:text-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
          )}
        </div>

        {isCallActive ? (
          <VoiceCall
            endCall={endCall}
            userName={safeRender(users.find((u) => u._id === selectedUser)?.name)}
          />
        ) : (
          <>
            <div className="p-6 overflow-y-auto h-[calc(100vh-192px)]">
              {selectedUser ? (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="bg-gray-200 px-4 py-2 rounded-lg">
                      <p className="text-sm text-gray-600">
                        {safeRender(users.find((u) => u._id === selectedUser)?.name)} joined the chat
                      </p>
                    </div>
                  </div>
                  {messages
                    .filter(
                      (msg) =>
                        (msg.recipient === selectedUser && msg.sender._id === currentUserId) ||
                        (msg.recipient === currentUserId && msg.sender._id === selectedUser)
                    )
                    .map((msg, index) => (
                      <div
                        key={msg._id || msg.tempId || `msg-${index}`}
                        className={`flex mb-4 ${msg.sender._id === currentUserId ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`p-3 rounded-lg shadow max-w-[60%] ${
                            msg.sender._id === currentUserId
                              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                              : "bg-white text-gray-800"
                          }`}
                        >
                          <p>{safeRender(msg.content)}</p>
                          <p
                            className={`text-xs mt-1 ${
                              msg.sender._id === currentUserId ? "text-white opacity-80" : "text-gray-500"
                            }`}
                          >
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Select a user to start chatting
                </div>
              )}
            </div>

            {selectedUser && (
              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex items-center">
                  <button className="text-gray-500 hover:text-gray-700 mr-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                  </button>
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                    className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={sendMessage}
                    className="ml-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white p-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition duration-300"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Notifications */}
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="fixed top-4 right-4 bg-white p-4 rounded-lg shadow-lg z-50"
        >
          <p>{notification.text}</p>
        </div>
      ))}

      {/* Incoming Call UI */}
      {incomingCall && !isCallActive && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-lg z-50">
          <p className="text-lg font-semibold text-gray-800">
            Incoming Call from {incomingCall.senderName}
          </p>
          <div className="flex justify-around mt-4">
            <button
              onClick={acceptCall}
              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition duration-300"
            >
              Accept
            </button>
            <button
              onClick={rejectCall}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition duration-300"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Message;