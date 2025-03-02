import React, { useState } from "react";
import axios from "axios";

const safeRender = (value, fallback = "Unknown") => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.name) return value.name;
  return JSON.stringify(value);
};

const GroupManagement = ({ 
  token, 
  users, 
  groups, 
  setGroups, 
  setSelectedChat, 
  setChatType, 
  currentUserId, 
  showUserProfile,
  showOnlyGroups,  // New prop
  setShowOnlyGroups  // New prop
}) => {
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");  // New state for search

  const isGroupAdmin = (groupId) => {
    const group = groups.find((g) => g._id === groupId);
    return group && safeRender(group.creator?._id || group.creator) === currentUserId;
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
    }
  };

  const toggleEditGroup = (groupId) => {
    setEditingGroupId((prev) => (prev === groupId ? null : groupId));
  };

  // Filter groups based on search query
  const filteredGroups = groups.filter(group => 
    safeRender(group.name).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter users based on search query (when not in groups-only mode)
  const filteredUsers = users.filter(user => 
    safeRender(user.name).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="p-4 border-b border-gray-200 space-y-3">
        <input
          type="text"
          placeholder={showOnlyGroups ? "Search groups..." : "Search..."}
          className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {!showOnlyGroups && (
          <button
            onClick={() => setShowCreateGroup(true)}
            className="w-full p-2 bg-gradient-to-r from-blue-400 to-blue-600 text-white rounded-lg hover:from-blue-500 hover:to-blue-600"
          >
            Create New Group
          </button>
        )}
      </div>
      <div className="overflow-y-auto h-[calc(100vh-200px)]">
        {filteredGroups.length > 0 && (
          <div className="p-2">
            <h2 className="text-sm font-semibold text-gray-500 px-4 mb-2">Groups</h2>
            {filteredGroups.map((group) => (
              <div key={group._id} className="p-4">
                <div
                  className="flex items-center hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setSelectedChat(group._id);
                    setChatType("group");
                    if (showOnlyGroups) setShowOnlyGroups(false); // Reset view when selecting a chat
                  }}
                >
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">{safeRender(group.name[0])}</span>
                  </div>
                  <div className="ml-4 flex-1">
                    <p className="text-gray-800 font-medium">{safeRender(group.name)}</p>
                    <p className="text-sm text-gray-500">{group.members.length} members</p>
                  </div>
                  {isGroupAdmin(group._id) && !showOnlyGroups && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEditGroup(group._id);
                      }}
                      className={`px-2 py-1 rounded text-sm ${editingGroupId === group._id ? "bg-red-500 text-white" : "bg-yellow-400 text-black"}`}
                    >
                      {editingGroupId === group._id ? "Close" : "Edit"}
                    </button>
                  )}
                </div>
                {editingGroupId === group._id && isGroupAdmin(group._id) && !showOnlyGroups && (
                  <div className="mt-2 p-2 bg-gray-100 rounded">
                    <h4 className="text-sm font-semibold">Members</h4>
                    {group.members.map((member, index) => (
                      <div
                        key={`${safeRender(member.userId?._id || member.userId)}-${index}`}
                        className="flex items-center justify-between mt-1"
                      >
                        <span>
                          {safeRender(users.find((u) => u._id === safeRender(member.userId?._id || member.userId))?.name, member.userId)}
                        </span>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={member.canSendMessages || false}
                            onChange={(e) => updateGroupPermissions(group._id, safeRender(member.userId?._id || member.userId), e.target.checked)}
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
                      {users.filter((u) => !group.members.some((m) => safeRender(m.userId?._id || m.userId) === u._id)).map((user) => (
                        <option key={user._id} value={user._id}>{safeRender(user.name)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {!showOnlyGroups && (
          <div className="p-2">
            <h2 className="text-sm font-semibold text-gray-500 px-4 mb-2">Direct Messages</h2>
            {filteredUsers.map((user) => (
              <div
                key={user._id}
                className="flex items-center p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setSelectedChat(user._id);
                  setChatType("user");
                }}
              >
                <div 
                  className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full flex items-center justify-center hover:opacity-80"
                  onClick={(e) => {
                    e.stopPropagation();
                    showUserProfile(user._id);
                  }}
                >
                  <span className="text-white font-bold">{safeRender(user.name?.[0])}</span>
                </div>
                <div className="ml-4">
                  <p className="text-gray-800 font-medium">{safeRender(user.name)}</p>
                  <p className="text-sm text-gray-500">Last message preview...</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateGroup && !showOnlyGroups && (
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
              <button onClick={() => setShowCreateGroup(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
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
    </>
  );
};

export default GroupManagement;