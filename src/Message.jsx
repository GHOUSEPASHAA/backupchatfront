import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import forge from "node-forge";
import VoiceCall from "./VoiceCall";
import { UserIcon, UsersIcon, PhoneIcon, BellIcon } from "@heroicons/react/24/outline";

// Utility function
const safeRender = (value, fallback = "Unknown") => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.name) return value.name;
  return JSON.stringify(value);
};

const Message = ({ token, privateKey }) => {
  const [selectedChat, setSelectedChat] = useState(null); // Unified state for user or group
  const [chatType, setChatType] = useState(null); // "user" or "group"
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [editingGroupId, setEditingGroupId] = useState(null); // For group editing
  const [isCallActive, setIsCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const socket = useRef(null);
  const fileInputRef = useRef(null);
  const ringtoneRef = useRef(null);

  const decryptMessage = (encryptedContent, plaintextContent, isPrivate, senderId, currentUserId) => {
    if (!isPrivate || senderId === currentUserId) return safeRender(plaintextContent);
    if (!privateKey || !encryptedContent) return safeRender(encryptedContent || plaintextContent);
    try {
      const privateKeyObj = forge.pki.privateKeyFromPem(privateKey);
      const encryptedBytes = forge.util.decode64(encryptedContent);
      const decrypted = privateKeyObj.decrypt(encryptedBytes, "RSA-OAEP");
      return forge.util.decodeUtf8(decrypted);
    } catch (error) {
      console.error("Decryption error:", error.message);
      return "[Decryption Failed]";
    }
  };

  const isGroupAdmin = (groupId) => {
    const group = groups.find((g) => g._id === groupId);
    return group && safeRender(group.creator?._id || group.creator) === currentUserId;
  };

  const canSendInGroup = (groupId) => {
    const group = groups.find((g) => g._id === groupId);
    if (!group) return false;
    const creatorId = safeRender(group.creator?._id || group.creator);
    if (creatorId === currentUserId) return true;
    const member = group.members.find((m) => safeRender(m.userId?._id || m.userId) === currentUserId);
    return member?.canSendMessages === true;
  };

  useEffect(() => {
    ringtoneRef.current = new Audio("/ringtone.mp3");
    ringtoneRef.current.loop = true;
  }, []);

  useEffect(() => {
    if (incomingCall && !isCallActive) {
      ringtoneRef.current.play().catch((err) => console.error("Ringtone error:", err));
    } else {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, [incomingCall, isCallActive]);

  useEffect(() => {
    if (token && !socket.current) {
      socket.current = io("http://localhost:3000", { auth: { token }, forceNew: true });

      socket.current.on("connect", () => console.log("Connected:", socket.current.id));
      socket.current.on("userId", (userId) => {
        setCurrentUserId(userId);
        socket.current.userId = userId;
      });

      socket.current.on("chatMessage", (msg) => {
        const isPrivate = !!msg.recipient;
        const content = msg.file
          ? { type: "file", ...msg.file }
          : decryptMessage(
              msg.encryptedContent,
              msg.content,
              isPrivate,
              safeRender(msg.sender?._id || msg.sender),
              socket.current.userId
            );

        setMessages((prev) => {
          const filtered = prev.filter((m) => m.tempId !== msg.tempId && m._id !== msg._id);
          return [...filtered, { ...msg, content }];
        });

        if (safeRender(msg.sender?._id || msg.sender) !== currentUserId) {
          const senderName = safeRender(msg.sender?.name, "Someone");
          const notificationText = msg.file ? `${senderName} sent a file` : `${senderName}: ${content}`;
          const notificationId = Date.now();
          setNotifications((prev) => [...prev, { id: notificationId, text: notificationText }]);
          setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== notificationId)), 5000);
        }
      });

      socket.current.on("callRequest", ({ from }) => {
        const senderName = safeRender(users.find((u) => u._id === from)?.name, "Someone");
        setIncomingCall({ from, senderName });
      });

      socket.current.on("callAccepted", () => {
        setIsCallActive(true);
        setIncomingCall(null);
      });

      socket.current.on("callRejected", () => {
        setNotifications((prev) => [...prev, { id: Date.now(), text: "Call rejected" }]);
        setIncomingCall(null);
      });

      socket.current.on("callEnded", () => {
        setIsCallActive(false);
        setIncomingCall(null);
      });

      socket.current.on("error", (error) => console.error("Socket error:", error.message));

      axios
        .get("http://localhost:3000/api/users", { headers: { Authorization: token } })
        .then((res) => setUsers(res.data))
        .catch((err) => console.error("Error fetching users:", err));

      axios
        .get("http://localhost:3000/api/groups", { headers: { Authorization: token } })
        .then((res) => setGroups(res.data))
        .catch((err) => console.error("Error fetching groups:", err));
    }

    return () => {
      if (socket.current) {
        socket.current.disconnect();
        socket.current = null;
      }
    };
  }, [token, privateKey]);

  useEffect(() => {
    if (socket.current && chatType === "group" && selectedChat) {
      socket.current.emit("joinGroup", selectedChat);
      return () => socket.current.emit("leaveGroup", selectedChat);
    }
  }, [selectedChat, chatType]);

  useEffect(() => {
    if (token && selectedChat && currentUserId) {
      const fetchMessages = async () => {
        try {
          const url =
            chatType === "user"
              ? `http://localhost:3000/api/messages/private/${selectedChat}`
              : `http://localhost:3000/api/messages/group/${selectedChat}`;
          const res = await axios.get(url, { headers: { Authorization: token } });
          const processedMessages = res.data.map((msg) => ({
            ...msg,
            content: msg.file
              ? { type: "file", ...msg.file }
              : decryptMessage(
                  msg.encryptedContent,
                  msg.content,
                  !!msg.recipient,
                  safeRender(msg.sender?._id || msg.sender),
                  currentUserId
                ),
          }));
          setMessages(processedMessages);
        } catch (error) {
          console.error("Error fetching messages:", error);
        }
      };
      fetchMessages();
    }
  }, [selectedChat, chatType, token, privateKey, currentUserId]);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setMessage(`Uploading: ${file.name}`);
    }
  };

  const sendMessage = async () => {
    if (!socket.current || (!message.trim() && !selectedFile)) return;

    if (chatType === "group" && !canSendInGroup(selectedChat)) {
      setNotifications((prev) => [...prev, { id: Date.now(), text: "No permission to send" }]);
      return;
    }

    const tempId = Date.now().toString();
    let newMessage;

    if (selectedFile) {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (chatType === "user") formData.append("recipient", selectedChat);
      if (chatType === "group") formData.append("group", selectedChat);
      formData.append("tempId", tempId);

      try {
        const response = await axios.post("http://localhost:3000/api/upload", formData, {
          headers: { Authorization: token, "Content-Type": "multipart/form-data" },
        });
        newMessage = {
          sender: { _id: currentUserId, name: "You" },
          content: { type: "file", ...response.data },
          recipient: chatType === "user" ? selectedChat : null,
          group: chatType === "group" ? selectedChat : null,
          tempId,
          timestamp: new Date(),
        };
        socket.current.emit("chatMessage", {
          recipient: chatType === "user" ? selectedChat : null,
          group: chatType === "group" ? selectedChat : null,
          file: response.data,
          tempId,
        });
      } catch (error) {
        console.error("File upload failed:", error);
        return;
      }
    } else {
      newMessage = {
        sender: { _id: currentUserId, name: "You" },
        content: message,
        recipient: chatType === "user" ? selectedChat : null,
        group: chatType === "group" ? selectedChat : null,
        tempId,
        timestamp: new Date(),
      };
      socket.current.emit("chatMessage", {
        recipient: chatType === "user" ? selectedChat : null,
        group: chatType === "group" ? selectedChat : null,
        content: message,
        tempId,
      });
    }

    setMessages((prev) => [...prev, newMessage]);
    setMessage("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const initiateCall = () => {
    if (chatType === "user" && selectedChat) {
      socket.current.emit("callRequest", { to: selectedChat });
    }
  };

  const acceptCall = () => {
    socket.current.emit("callAccepted", { to: incomingCall.from });
    setSelectedChat(incomingCall.from);
    setChatType("user");
    setIsCallActive(true);
    setIncomingCall(null);
  };

  const rejectCall = () => {
    socket.current.emit("callRejected", { to: incomingCall.from });
    setIncomingCall(null);
  };

  const endCall = () => {
    socket.current.emit("callEnded", { to: selectedChat });
    setIsCallActive(false);
  };

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedMembers.length > 0) {
      axios
        .post("http://localhost:3000/api/groups", { name: groupName }, { headers: { Authorization: token } })
        .then((res) => {
          const groupId = res.data._id;
          Promise.all(
            selectedMembers.map((userId) =>
              axios.put(
                `http://localhost:3000/api/groups/${groupId}/members`,
                { userId, canSendMessages: true },
                { headers: { Authorization: token } }
              )
            )
          ).then(() => {
            setGroups((prev) => [...prev, res.data]);
            setGroupName("");
            setSelectedMembers([]);
            setShowCreateGroup(false);
          });
        })
        .catch((err) => console.error("Error creating group:", err));
    }
  };

  const addMemberToGroup = async (groupId, userId) => {
    if (!userId || !groupId) return;
    const canSendMessages = window.confirm(
      `Allow ${safeRender(users.find((u) => u._id === userId)?.name, userId)} to send messages?`
    );
    try {
      const response = await axios.put(
        `http://localhost:3000/api/groups/${groupId}/members`,
        { userId, canSendMessages },
        { headers: { Authorization: token } }
      );
      setGroups((prev) => prev.map((g) => (g._id === groupId ? response.data : g)));
    } catch (error) {
      console.error("Error adding member to group:", error);
      setNotifications((prev) => [...prev, { id: Date.now(), text: "Failed to add member" }]);
    }
  };

  const updateGroupPermissions = async (groupId, userId, canSendMessages) => {
    if (!groupId || !userId) return;
    try {
      const response = await axios.put(
        `http://localhost:3000/api/groups/${groupId}/permissions`,
        { userId, canSendMessages },
        { headers: { Authorization: token } }
      );
      setGroups((prev) => prev.map((g) => (g._id === groupId ? response.data : g)));
    } catch (error) {
      console.error("Error updating permissions:", error);
      setNotifications((prev) => [...prev, { id: Date.now(), text: "Failed to update permissions" }]);
    }
  };

  const toggleEditGroup = (groupId) => {
    setEditingGroupId((prev) => (prev === groupId ? null : groupId));
  };

  const renderMessageContent = (msg) => {
    if (!msg || !msg.content) return <div>[Invalid Message]</div>;
    if (msg.content.type === "file") {
      const { name, url, size, mimeType } = msg.content;
      const isImage = mimeType?.startsWith("image/");
      return (
        <div className="flex flex-col">
          {isImage ? (
            <img src={url} alt={name} className="max-w-[200px] rounded-lg" />
          ) : (
            <a href={url} download={name} className="text-blue-500 hover:underline">
              📎 {name} ({(size / 1024).toFixed(2)} KB)
            </a>
          )}
        </div>
      );
    }
    return <p>{safeRender(msg.content)}</p>;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-hidden relative">
      {/* Contact List */}
      <div
        className={`w-full md:w-1/4 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out ${
          selectedChat && !isCallActive ? "-translate-x-full md:translate-x-0" : "translate-x-0"
        }`}
        style={{ zIndex: 10 }}
      >
        <div className="p-6 bg-gradient-to-r from-blue-400 to-blue-600 flex items-center">
          <h1 className="text-2xl font-bold text-white">Chats</h1>
        </div>
        <div className="flex items-center space-x-12 overflow-x-auto bg-white border-b border-gray-200 px-4 py-2">
          <button className="flex-shrink-0 flex flex-col items-center text-gray-700 font-semibold hover:text-blue-600">
            <UserIcon className="w-5 h-5" />
            <span className="text-xs">Profile</span>
          </button>
          <button className="flex-shrink-0 flex flex-col items-center text-gray-700 font-semibold hover:text-blue-600">
            <UsersIcon className="w-5 h-5" />
            <span className="text-xs">Groups</span>
          </button>
          <button className="flex-shrink-0 flex flex-col items-center text-gray-700 font-semibold hover:text-blue-600">
            <PhoneIcon className="w-5 h-5" />
            <span className="text-xs">Contacts</span>
          </button>
          <button className="flex-shrink-0 flex flex-col items-center text-gray-700 font-semibold hover:text-blue-600">
            <BellIcon className="w-5 h-5" />
            <span className="text-xs">Notifications</span>
          </button>
        </div>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <input
            type="text"
            placeholder="Search..."
            className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setShowCreateGroup(true)}
            className="w-full p-2 bg-gradient-to-r from-blue-400 to-blue-600 text-white rounded-lg hover:from-blue-500 hover:to-blue-600"
          >
            Create New Group
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-200px)]">
          {groups.length > 0 && (
            <div className="p-2">
              <h2 className="text-sm font-semibold text-gray-500 px-4 mb-2">Groups</h2>
              {groups.map((group) => (
                <div key={group._id} className="p-4">
                  <div
                    className="flex items-center hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      setSelectedChat(group._id);
                      setChatType("group");
                    }}
                  >
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold">{safeRender(group.name[0])}</span>
                    </div>
                    <div className="ml-4 flex-1">
                      <p className="text-gray-800 font-medium">{safeRender(group.name)}</p>
                      <p className="text-sm text-gray-500">{group.members.length} members</p>
                    </div>
                    {isGroupAdmin(group._id) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleEditGroup(group._id);
                        }}
                        className={`px-2 py-1 rounded text-sm ${
                          editingGroupId === group._id ? "bg-red-500 text-white" : "bg-yellow-400 text-black"
                        }`}
                      >
                        {editingGroupId === group._id ? "Close" : "Edit"}
                      </button>
                    )}
                  </div>
                  {editingGroupId === group._id && isGroupAdmin(group._id) && (
                    <div className="mt-2 p-2 bg-gray-100 rounded">
                      <h4 className="text-sm font-semibold">Members</h4>
                      {group.members.map((member, index) => (
                        <div
                          key={`${safeRender(member.userId?._id || member.userId)}-${index}`}
                          className="flex items-center justify-between mt-1"
                        >
                          <span>
                            {safeRender(
                              users.find((u) => u._id === safeRender(member.userId?._id || member.userId))?.name,
                              member.userId
                            )}
                          </span>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={member.canSendMessages || false}
                              onChange={(e) =>
                                updateGroupPermissions(group._id, safeRender(member.userId?._id || member.userId), e.target.checked)
                              }
                              disabled={safeRender(member.userId?._id || member.userId) === currentUserId}
                            />
                            <span className="ml-1 text-sm">Can Send</span>
                          </label>
                        </div>
                      ))}
                      <h4 className="text-sm font-semibold mt-2">Add Member</h4>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            addMemberToGroup(group._id, e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="w-full p-1 border rounded mt-1"
                        defaultValue=""
                      >
                        <option value="">Select a user</option>
                        {users
                          .filter(
                            (u) => !group.members.some((m) => safeRender(m.userId?._id || m.userId) === u._id)
                          )
                          .map((user) => (
                            <option key={user._id} value={user._id}>
                              {safeRender(user.name)}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="p-2">
            <h2 className="text-sm font-semibold text-gray-500 px-4 mb-2">Direct Messages</h2>
            {users.map((user) => (
              <div
                key={user._id}
                className="flex items-center p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setSelectedChat(user._id);
                  setChatType("user");
                }}
              >
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full flex items-center justify-center">
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
      </div>

      {/* Chat View */}
      <div
        className={`w-full md:w-3/4 bg-gray-50 absolute md:static inset-0 transform transition-transform duration-300 ease-in-out ${
          selectedChat ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
        style={{ zIndex: selectedChat ? 20 : 0 }}
      >
        <div className="p-6 bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-between">
          <div className="flex items-center">
            <button
              className="md:hidden text-white mr-4"
              onClick={() => {
                setSelectedChat(null);
                setChatType(null);
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {selectedChat
                  ? chatType === "user"
                    ? safeRender(users.find((u) => u._id === selectedChat)?.name)
                    : safeRender(groups.find((g) => g._id === selectedChat)?.name)
                  : "Select a Chat"}
              </h1>
              {chatType === "group" && selectedChat && (
                <p className="text-sm text-white opacity-80">
                  {groups.find((g) => g._id === selectedChat)?.members.length} members
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {chatType === "user" && selectedChat && !isCallActive && (
              <button onClick={initiateCall} className="text-white hover:text-gray-200">
                <PhoneIcon className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>

        {isCallActive ? (
          <VoiceCall
            endCall={endCall}
            userName={safeRender(users.find((u) => u._id === selectedChat)?.name)}
            socket={socket}
            selectedUser={selectedChat}
          />
        ) : (
          <>
            <div className="p-6 overflow-y-auto h-[calc(100vh-192px)]">
              {selectedChat ? (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="bg-gray-200 px-4 py-2 rounded-lg">
                      <p className="text-sm text-gray-600">
                        {chatType === "user"
                          ? `${safeRender(users.find((u) => u._id === selectedChat)?.name)} joined the chat`
                          : `Group "${safeRender(groups.find((g) => g._id === selectedChat)?.name)}" created`}
                      </p>
                    </div>
                  </div>
                  {messages
                    .filter((msg) =>
                      chatType === "user"
                        ? (msg.recipient === selectedChat && msg.sender._id === currentUserId) ||
                          (msg.recipient === currentUserId && msg.sender._id === selectedChat)
                        : msg.group === selectedChat
                    )
                    .map((msg, index) => {
                      const senderName = safeRender(
                        users.find((u) => u._id === safeRender(msg.sender?._id || msg.sender))?.name,
                        "Unknown"
                      );
                      const receiverName =
                        chatType === "user"
                          ? safeRender(
                              users.find((u) =>
                                u._id === (msg.recipient === currentUserId ? selectedChat : msg.recipient)
                              )?.name,
                              "Unknown"
                            )
                          : safeRender(groups.find((g) => g._id === selectedChat)?.name, "Group");

                      return (
                        <div
                          key={msg._id || msg.tempId || `msg-${index}`}
                          className={`flex mb-4 ${msg.sender._id === currentUserId ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`flex flex-col ${
                              msg.sender._id === currentUserId ? "items-end" : "items-start"
                            } max-w-[60%]`}
                          >
                            {/* Sender and Receiver Names */}
                            <div
                              className={`text-xs mb-1 ${
                                msg.sender._id === currentUserId ? "text-gray-600" : "text-gray-500"
                              }`}
                            >
                              {chatType === "user" ? (
                                <>
                                  <span>{senderName}</span> → <span>{receiverName}</span>
                                </>
                              ) : (
                                <span>{senderName}</span>
                              )}
                            </div>
                            {/* Message Content */}
                            <div
                              className={`p-3 rounded-lg shadow ${
                                msg.sender._id === currentUserId
                                  ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white"
                                  : "bg-white text-gray-800"
                              }`}
                            >
                              {renderMessageContent(msg)}
                              <p
                                className={`text-xs mt-1 ${
                                  msg.sender._id === currentUserId ? "text-white opacity-80" : "text-gray-500"
                                }`}
                              >
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Select a chat to start messaging
                </div>
              )}
            </div>
            {selectedChat && (
              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex items-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="text-gray-500 mr-2"
                  />
                  <input
                    type="text"
                    placeholder="Type a message or select a file..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                    className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    disabled={selectedFile !== null}
                  />
                  <button
                    onClick={sendMessage}
                    className="ml-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-2 rounded-lg hover:from-blue-600 hover:to-blue-700"
                  >
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
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-xl font-bold mb-4">Create New Group</h2>
            <input
              type="text"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:border-blue-500"
            />
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Select Members</h3>
              <div className="max-h-48 overflow-y-auto">
                {users.map((user) => (
                  <div key={user._id} className="flex items-center p-2">
                    <input
                      type="checkbox"
                      id={`user-${user._id}`}
                      checked={selectedMembers.includes(user._id)}
                      onChange={() =>
                        setSelectedMembers((prev) =>
                          prev.includes(user._id) ? prev.filter((id) => id !== user._id) : [...prev, user._id]
                        )
                      }
                      className="mr-2"
                    />
                    <label htmlFor={`user-${user._id}`}>{safeRender(user.name)}</label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowCreateGroup(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700"
                disabled={!groupName.trim() || selectedMembers.length === 0}
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {notifications.map((notification) => (
        <div key={notification.id} className="fixed top-4 right-4 bg-white p-4 rounded-lg shadow-lg z-50">
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
              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
            >
              Accept
            </button>
            <button
              onClick={rejectCall}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600"
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