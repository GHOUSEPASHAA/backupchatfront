import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import forge from "node-forge";
import {
  UserIcon,
  UsersIcon,
  PhoneIcon,
  BellIcon,
  AdjustmentsHorizontalIcon, // Updated settings icon
  PaperClipIcon, // Updated add/attachment icon
} from "@heroicons/react/24/outline";
import userAvatar from "./assets/react.svg"; // Ensure this path is correct

const safeRender = (value, fallback = "Unknown") => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.name) return value.name;
  return JSON.stringify(value);
};

const Message = ({ token, privateKey }) => {
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatType, setChatType] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [lastMessageTimes, setLastMessageTimes] = useState([]);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showOnlyGroups, setShowOnlyGroups] = useState(false);
  const [showOnlyContacts, setShowOnlyContacts] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const socket = useRef(null);
  const fileInputRef = useRef(null);
  const notificationsRef = useRef(null);

  const [groupSettings, setGroupSettings] = useState({
    onlyAdminCanMessage: false,
  });

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

  const canSendInGroup = (groupId) => {
    const group = groups.find((g) => g._id === groupId);
    if (!group) return false;
    const creatorId = safeRender(group.creator?._id || group.creator);
    if (creatorId === currentUserId) return true;
    const member = group.members.find((m) => safeRender(m.userId?._id || m.userId) === currentUserId);
    return member?.canSendMessages === true || !groupSettings.onlyAdminCanMessage;
  };

  const canCallInGroup = (groupId) => {
    const group = groups.find((g) => g._id === groupId);
    if (!group) return false;
    const creatorId = safeRender(group.creator?._id || group.creator);
    if (creatorId === currentUserId) return true;
    const member = group.members.find((m) => safeRender(m.userId?._id || m.userId) === currentUserId);
    return member?.canCall === true;
  };

  const showPermissionDeniedNotification = (action) => {
    setNotifications((prev) => [
      ...prev,
      { id: Date.now(), text: `Permission denied: You cannot ${action}`, read: false, timestamp: new Date() },
    ]);
  };

  const showUserProfile = async (userId) => {
    try {
      const response = await axios.get(`http://localhost:3000/api/users/${userId}`, {
        headers: { Authorization: token },
      });
      setSelectedUser(response.data);
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const closeProfile = () => setSelectedUser(null);

  const isGroupAdmin = (groupId) => {
    const group = groups.find((g) => g._id === groupId);
    return group && safeRender(group.creator?._id || group.creator) === currentUserId;
  };

  const startGroupCall = () => {
    if (!socket.current || !selectedChat || chatType !== "group") return;
    if (!canCallInGroup(selectedChat)) {
      showPermissionDeniedNotification("start calls in this group");
      return;
    }
    console.log("Starting group call for:", selectedChat);
    socket.current.emit("startGroupCall", { groupId: selectedChat });
  };

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedMembers.length > 0) {
      const newGroup = {
        _id: Date.now().toString(),
        name: groupName,
        members: selectedMembers.map((id) => ({ userId: id })),
        creator: { _id: currentUserId },
        createdAt: new Date(),
      };
      setGroups((prev) => [...prev, newGroup]);
      setGroupName("");
      setSelectedMembers([]);
      setShowCreateGroup(false);
      setSelectedChat(newGroup._id);
      setChatType("group");
    } else {
      alert("Please enter a group name and select at least one member.");
    }
  };

  const handleDeleteGroup = (groupId) => {
    setGroups((prev) => prev.filter((group) => group._id !== groupId));
    setSelectedChat(null);
    setChatType(null);
    setShowGroupSettings(false);
  };

  const handleAddMembers = (newMembers) => {
    if (!selectedChat) return;
    setGroups((prev) =>
      prev.map((group) => {
        if (group._id === selectedChat) {
          const updatedMembers = [...new Set([...group.members.map((m) => safeRender(m.userId)), ...newMembers])];
          return { ...group, members: updatedMembers.map((id) => ({ userId: id })) };
        }
        return group;
      })
    );
    setSelectedMembers([]);
  };

  const handleRemoveMember = (memberId) => {
    if (!selectedChat || memberId === currentUserId) return;
    setGroups((prev) =>
      prev.map((group) => {
        if (group._id === selectedChat) {
          return { ...group, members: group.members.filter((m) => safeRender(m.userId) !== memberId) };
        }
        return group;
      })
    );
  };

  const updateGroupSettings = (settings) => {
    setGroupSettings((prev) => ({ ...prev, ...settings }));
  };

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroupMembers = (members) => {
    return users
      .filter((user) => members.some((m) => safeRender(m.userId) === user._id))
      .filter((user) => user.name.toLowerCase().includes(groupSearchQuery.toLowerCase()));
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!token || socket.current) return;
    socket.current = io("http://localhost:3000", { auth: { token }, forceNew: true });
    socket.current.on("connect", () => console.log("Connected:", socket.current.id));
    socket.current.on("userId", (userId) => {
      setCurrentUserId(userId);
      socket.current.userId = userId;
      console.log("Current user ID set:", userId);
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
        setNotifications((prev) => [
          ...prev,
          { id: notificationId, text: notificationText, read: false, timestamp: new Date() },
        ]);
        if (isPrivate && !msg.file) {
          setLastMessageTimes((prev) => {
            const updated = prev.filter((lm) => lm.userId !== safeRender(msg.sender?._id || msg.sender));
            return [...updated, { userId: safeRender(msg.sender?._id || msg.sender), lastMessageTime: msg.timestamp }];
          });
        }
      }
    });

    socket.current.on("error", (error) => console.error("Socket error:", error.message));

    Promise.all([
      axios.get("http://localhost:3000/api/users", { headers: { Authorization: token } }),
      axios.get("http://localhost:3000/api/groups", { headers: { Authorization: token } }),
      axios.get("http://localhost:3000/api/messages/last-messages", { headers: { Authorization: token } }),
    ])
      .then(([usersRes, groupsRes, lastMessagesRes]) => {
        setUsers(usersRes.data);
        setGroups(groupsRes.data);
        const formattedTimes = lastMessagesRes.data.map((msg) => ({
          userId: msg.userId.toString(),
          lastMessageTime: msg.lastMessageTime,
        }));
        setLastMessageTimes(formattedTimes);

        if (socket.current && socket.current.userId) {
          groupsRes.data.forEach((group) => {
            socket.current.emit("joinGroup", group._id);
            console.log(`User ${socket.current.userId} joined group ${group._id}`);
          });
        }
      })
      .catch((err) => console.error("Error fetching initial data:", err));

    return () => {
      if (socket.current) {
        socket.current.disconnect();
        socket.current = null;
      }
    };
  }, [token, privateKey]);

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
      showPermissionDeniedNotification("send messages in this group");
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

  const markNotificationAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setShowNotifications(false);
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
            <a href={url} download={name} className="text-blue-600 hover:underline">
              📎 {name} ({(size / 1024).toFixed(2)} KB)
            </a>
          )}
        </div>
      );
    }
    return <p>{safeRender(msg.content)}</p>;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex overflow-hidden relative">
      <div
        className={`w-full md:w-1/4 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out ${
          selectedChat && !isSidebarOpen ? "-translate-x-full md:translate-x-0" : "translate-x-0"
        }`}
        style={{ zIndex: 10 }}
      >
        <div className="p-6 flex items-center shadow-md z-10 mb-1 bg-blue-600">
          <img
            src={userAvatar}
            alt="User Avatar"
            className="w-12 h-12 rounded-full mr-4 cursor-pointer transition-transform duration-300 hover:scale-105 border-2 border-white"
          />
          <h1 className="text-3xl font-medium text-white tracking-wide flex-grow">
            Chats
          </h1>
          <AdjustmentsHorizontalIcon
            className="w-6 h-6 ml-4 cursor-pointer text-white hover:text-gray-200 transition-colors duration-300"
          />
          <button
            className="ml-4 text-white md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="shadow-md rounded-b-lg overflow-hidden bg-white border border-gray-200 w-full">
          <div className="flex flex-wrap justify-between items-center px-6 py-4 text-gray-800">
            <button
              className={`flex flex-col items-center font-medium text-gray-700 hover:text-blue-600 ${
                !showOnlyGroups && !showOnlyContacts ? "text-blue-600" : ""
              }`}
              onClick={() => {
                setShowOnlyGroups(false);
                setShowOnlyContacts(false);
              }}
            >
              <UserIcon className="w-6 h-6" />
              <span className="text-sm">All</span>
            </button>
            <button
              className={`flex flex-col items-center font-medium text-gray-700 hover:text-blue-600 ${
                showOnlyGroups ? "text-blue-600" : ""
              }`}
              onClick={() => {
                setShowOnlyGroups(true);
                setShowOnlyContacts(false);
              }}
            >
              <UsersIcon className="w-6 h-6" />
              <span className="text-sm">Groups</span>
            </button>
            <button
              className={`flex flex-col items-center font-medium text-gray-700 hover:text-blue-600 ${
                showOnlyContacts ? "text-blue-600" : ""
              }`}
              onClick={() => {
                setShowOnlyGroups(false);
                setShowOnlyContacts(true);
              }}
            >
              <PhoneIcon className="w-6 h-6" />
              <span className="text-sm">Contacts</span>
            </button>
            <button
              className="relative flex flex-col items-center font-medium text-gray-700 hover:text-blue-600"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <BellIcon className="w-6 h-6" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
              <span className="text-sm">Notifications</span>
            </button>
          </div>
        </div>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setShowCreateGroup(true)}
            className="w-full p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300"
          >
            Create New Group
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-200px)]">
          {(!showOnlyContacts || showOnlyGroups) && groups.length > 0 && (
            <div className="p-2">
              <h2 className="text-sm font-semibold text-gray-500 px-4 mb-2">Groups</h2>
              {groups.map((group) => (
                <div
                  key={group._id}
                  className="flex items-center p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setSelectedChat(group._id);
                    setChatType("group");
                    setIsSidebarOpen(false);
                  }}
                >
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">{group.name[0]}</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-gray-800 font-medium">{group.name}</p>
                    <p className="text-sm text-gray-500">{group.members.length} members</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(!showOnlyGroups || showOnlyContacts) && (
            <div className="p-2">
              <h2 className="text-sm font-semibold text-gray-500 px-4 mb-2">Direct Messages</h2>
              {filteredUsers.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setSelectedChat(user._id);
                    setChatType("user");
                    setIsSidebarOpen(false);
                  }}
                >
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">{user.name[0]}</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-gray-800 font-medium">{user.name}</p>
                    <p className="text-sm text-gray-500">Last message preview...</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className={`w-full md:w-3/4 bg-gray-100 absolute md:static inset-0 transform transition-transform duration-300 ease-in-out ${
          selectedChat ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
        style={{ zIndex: selectedChat ? 20 : 0 }}
      >
        <div className="p-6 bg-blue-600 flex items-center justify-between shadow-md">
          <div className="flex items-center">
            <button
              className="md:hidden text-white mr-4"
              onClick={() => {
                setSelectedChat(null);
                setChatType(null);
                setIsSidebarOpen(true);
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
              {selectedChat && chatType === "group" && (
                <p className="text-sm text-white/80">
                  {groups.find((g) => g._id === selectedChat)?.members.length} members
                </p>
              )}
            </div>
          </div>
          {selectedChat && (
            <div className="flex items-center space-x-4">
              {chatType === "group" && (
                <>
                  <button
                    onClick={startGroupCall}
                    className={`text-white hover:text-gray-200 ${
                      !canCallInGroup(selectedChat) ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    disabled={!canCallInGroup(selectedChat)}
                  >
                    <PhoneIcon className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => setShowGroupSettings(true)}
                    className="text-white hover:text-gray-200"
                  >
                    <AdjustmentsHorizontalIcon className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

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
                        } max-w-[80%] sm:max-w-[60%]`}
                      >
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
                        <div
                          className={`p-3 rounded-lg shadow ${
                            msg.sender._id === currentUserId
                              ? "bg-blue-600 text-white"
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
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                disabled={chatType === "group" && !canSendInGroup(selectedChat)}
              />
              <button
                onClick={triggerFileInput}
                className={`p-2 text-gray-500 hover:text-blue-600 transition-colors ${
                  chatType === "group" && !canSendInGroup(selectedChat) ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={chatType === "group" && !canSendInGroup(selectedChat)}
                title="Attach a file"
              >
                <PaperClipIcon className="h-6 w-6" />
              </button>
              <input
                type="text"
                placeholder={
                  chatType === "group" && !canSendInGroup(selectedChat)
                    ? "Only admin can send messages"
                    : "Type a message or attach a file..."
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                disabled={selectedFile !== null || (chatType === "group" && !canSendInGroup(selectedChat))}
              />
              <button
                onClick={sendMessage}
                className={`w-full sm:w-auto bg-blue-600 text-white p-2 rounded-lg transition duration-300 ${
                  chatType === "group" && !canSendInGroup(selectedChat)
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-blue-700"
                }`}
                disabled={chatType === "group" && !canSendInGroup(selectedChat)}
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
            {chatType === "group" && groupSettings.onlyAdminCanMessage && !isGroupAdmin(selectedChat) && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                Only admin can send messages in this group
              </p>
            )}
          </div>
        )}
      </div>

      {showGroupSettings && chatType === "group" && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-0 w-[480px] max-h-[85vh] shadow-2xl overflow-hidden">
            <div className="p-6 bg-blue-600 rounded-t-xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Group Settings</h2>
                  <p className="text-sm text-white/80">{safeRender(groups.find((g) => g._id === selectedChat)?.name)}</p>
                </div>
                <button
                  onClick={() => setShowGroupSettings(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar h-[500px]">
              {isGroupAdmin(selectedChat) && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Admin Controls</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={groupSettings.onlyAdminCanMessage}
                        onChange={(e) => updateGroupSettings({ onlyAdminCanMessage: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-gray-700 font-medium">Only Admin Messages</span>
                        <p className="text-sm text-gray-500 mt-0.5">
                          When enabled, only admin can send messages in this group
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Members</h3>
                  <span className="text-sm text-gray-500">
                    {groups.find((g) => g._id === selectedChat)?.members.length} members
                  </span>
                </div>
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Search members..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <svg
                    className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredGroupMembers(groups.find((g) => g._id === selectedChat)?.members || []).map((user) => (
                    <div
                      key={user._id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">{user.name[0]}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{user.name}</p>
                          {isGroupAdmin(selectedChat) && safeRender(user._id) === currentUserId && (
                            <span className="text-xs text-blue-600 font-medium">Group Admin</span>
                          )}
                        </div>
                      </div>
                      {isGroupAdmin(selectedChat) && safeRender(user._id) !== currentUserId && (
                        <button
                          onClick={() => handleRemoveMember(user._id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {isGroupAdmin(selectedChat) && (
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Add Members</h3>
                  <div className="max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {users
                      .filter(
                        (user) =>
                          !groups
                            .find((g) => g._id === selectedChat)
                            ?.members.some((m) => safeRender(m.userId) === user._id)
                      )
                      .map((user) => (
                        <div
                          key={user._id}
                          className="flex items-center p-3 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedMembers.includes(user._id)}
                            onChange={() => {
                              setSelectedMembers((prev) =>
                                prev.includes(user._id)
                                  ? prev.filter((id) => id !== user._id)
                                  : [...prev, user._id]
                              );
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mr-3"
                          />
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                              <span className="text-white font-bold text-sm">{user.name[0]}</span>
                            </div>
                            <label className="font-medium text-gray-700 cursor-pointer">{user.name}</label>
                          </div>
                        </div>
                      ))}
                  </div>
                  {selectedMembers.length > 0 && (
                    <button
                      onClick={() => handleAddMembers(selectedMembers)}
                      className="mt-4 w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium"
                    >
                      Add Selected Members ({selectedMembers.length})
                    </button>
                  )}
                </div>
              )}
              {isGroupAdmin(selectedChat) && (
                <div className="mt-6 pt-6 border-t">
                  <button
                    onClick={() => handleDeleteGroup(selectedChat)}
                    className="w-full p-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
                  >
                    Delete Group
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-0 w-[480px] shadow-2xl">
            <div className="p-6 bg-blue-600 rounded-t-xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white">Create New Group</h2>
                  <p className="text-sm text-white/80">Add group name and members</p>
                </div>
                <button
                  onClick={() => setShowCreateGroup(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                <input
                  type="text"
                  placeholder="Enter group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold text-gray-800">Select Members</h3>
                  <span className="text-sm text-gray-500">{selectedMembers.length} selected</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {users.map((user) => (
                    <div
                      key={user._id}
                      className="flex items-center p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(user._id)}
                        onChange={() => {
                          setSelectedMembers((prev) =>
                            prev.includes(user._id)
                              ? prev.filter((id) => id !== user._id)
                              : [...prev, user._id]
                          );
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mr-3"
                      />
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{user.name[0]}</span>
                        </div>
                        <label className="font-medium text-gray-700 cursor-pointer">{user.name}</label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
                <button
                  onClick={() => setShowCreateGroup(false)}
                  className="px-6 py-3 text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedMembers.length === 0}
                  className={`px-6 py-3 bg-blue-600 text-white rounded-lg transition-all font-medium ${
                    !groupName.trim() || selectedMembers.length === 0
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-blue-700"
                  }`}
                >
                  Create Group
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNotifications && (
        <div
          ref={notificationsRef}
          className="absolute top-16 right-2 sm:right-4 w-64 sm:w-80 bg-white rounded-lg shadow-lg z-50 max-h-80 sm:max-h-96 overflow-y-auto"
        >
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-base sm:text-lg font-semibold">Notifications</h3>
            <button
              onClick={clearAllNotifications}
              className="text-xs sm:text-sm text-red-500 hover:text-red-700"
            >
              Clear All
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">No notifications</p>
          ) : (
            notifications
              .slice()
              .reverse()
              .map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 sm:p-4 border-b border-gray-200 flex justify-between items-center ${
                    notification.read ? "bg-gray-100" : "bg-white"
                  }`}
                >
                  <div>
                    <p
                      className={
                        notification.read
                          ? "text-gray-600 text-sm"
                          : "text-gray-800 font-medium text-sm sm:text-base"
                      }
                    >
                      {notification.text}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(notification.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  {!notification.read && (
                    <button
                      onClick={() => markNotificationAsRead(notification.id)}
                      className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm"
                    >
                      Mark as Read
                    </button>
                  )}
                </div>
              ))
          )}
        </div>
      )}

      {notifications.filter((n) => !n.read).map((notification) => (
        <div
          key={notification.id}
          className="fixed top-2 sm:top-4 right-2 sm:right-4 bg-white p-3 sm:p-4 rounded-lg shadow-lg z-40 max-w-[80%] sm:max-w-xs"
        >
          <p className="text-sm">{notification.text}</p>
        </div>
      ))}

      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg w-full max-w-sm">
            <h3 className="text-lg sm:text-xl font-bold mb-4">User Profile</h3>
            {selectedUser.image && (
              <img
                src={`http://localhost:3000/uploads/${selectedUser.image}`}
                alt={`${safeRender(selectedUser.name)}'s profile`}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full mb-4 object-cover mx-auto"
              />
            )}
            <p className="text-sm sm:text-base">
              <strong>Name:</strong> {safeRender(selectedUser.name)}
            </p>
            <p className="text-sm sm:text-base">
              <strong>Email:</strong> {safeRender(selectedUser.email)}
            </p>
            <p className="text-sm sm:text-base">
              <strong>Location:</strong> {safeRender(selectedUser.location, "Not specified")}
            </p>
            <p className="text-sm sm:text-base">
              <strong>Designation:</strong> {safeRender(selectedUser.designation, "Not specified")}
            </p>
            <p className="text-sm sm:text-base">
              <strong>Status:</strong> {safeRender(selectedUser.status)}
            </p>
            <button
              onClick={closeProfile}
              className="mt-4 w-full bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 text-sm sm:text-base"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Message;