// ============ DATA & STATE ============
let apiUsers = []; 
let relationships = {}; // userId -> status ('none', 'pending_sent', 'pending_received', 'accepted')
let messagesCache = {}; 
let currentUserObj = null;
let token = null;
let selectedUserId = null;
// State for indicators
let unreadSet = new Set();
let newRequestSet = new Set();

// Initialize Socket.io - Ensure backend URL matches your server
const socket = io('https://chatlyfreetotalk.onrender.com');

// Socket connection handlers
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
}); 

// ============ DOM ELEMENTS ============
const dom = {
    get list() { return document.getElementById("usersList"); },
    get chatName() { return document.getElementById("chatUserName"); },
    get messages() { return document.getElementById("chatMessages"); },
    get headerAvatar() { return document.getElementById("headerAvatar"); },
    get inputArea() { return document.getElementById("inputArea"); },
    get requestPanel() { return document.getElementById("requestPanel"); },
    get messageInput() { return document.getElementById("messageInput"); },
    get userDisplay() { return document.getElementById("currentUserDisplay"); }
};

// ============ INITIALIZE ============
async function init() {
    const userStr = localStorage.getItem('todoloUserObj');
    const tokenStr = localStorage.getItem('todoloToken');
    
    if (!userStr || !tokenStr) {
        window.location.href = 'signin.html';
        return;
    }
    
    currentUserObj = JSON.parse(userStr);
    token = tokenStr;

    // Normalize ID: MongoDB uses _id
    currentUserObj.id = currentUserObj._id || currentUserObj.id;
    const myId = String(currentUserObj.id);

    // Update Top Navbar Display
    if (dom.userDisplay) {
        dom.userDisplay.textContent = `${currentUserObj.firstName} ${currentUserObj.lastName}`;
    }
    
    // Join private socket room
    const joinRoom = () => {
        console.log('🔄 Attempting to join room:', myId);
        console.log('🔄 Socket connected?', socket.connected);
        socket.emit('join', myId);
        console.log('✅ Emitted join event for room:', myId);
        
        // Verify join after a short delay
        setTimeout(() => {
            console.log('📋 Socket rooms after join:', socket.rooms ? Array.from(socket.rooms) : 'N/A');
        }, 500);
    };
    
    if (socket.connected) {
        joinRoom();
    } else {
        console.log('⏳ Socket not connected yet, waiting for connect event...');
        socket.once('connect', () => {
            console.log('✅ Socket connected, now joining room');
            joinRoom();
        });
    }
    
    // Also log current state for debugging
    console.log('📊 Initial state:', {
        unreadSet: Array.from(unreadSet),
        newRequestSet: Array.from(newRequestSet),
        apiUsersCount: apiUsers.length,
        myId: myId,
        socketConnected: socket.connected,
        socketId: socket.id
    });
    
    // Test function to manually trigger indicators (for debugging)
    window.testIndicators = function(userId) {
        console.log('🧪 TEST: Manually adding indicators for user:', userId);
        unreadSet.add(String(userId));
        newRequestSet.add(String(userId));
        renderSidebar(document.getElementById('userSearch')?.value || '');
        console.log('🧪 TEST: Indicators should now be visible');
    };
    
    // Test function to check socket
    window.testSocket = function() {
        console.log('🧪 TEST: Socket status:', {
            connected: socket.connected,
            id: socket.id,
            rooms: socket.rooms ? Array.from(socket.rooms) : 'N/A'
        });
    };

    // 1. Render Sidebar immediately (Self-chat will show first)
    renderSidebar();

    // 2. Fetch all other users from backend
    await fetchUsers();
    
    // 3. Open Self-Chat by default on login
    selectUser({ ...currentUserObj, isSelf: true });

    attachGlobalEvents();
}

// ============ HELPERS ============
function getInitials(fn, ln) {
    return ((fn?.[0] || '') + (ln?.[0] || '')).toUpperCase() || '?';
}

function formatTime(dateString) {
    const date = dateString ? new Date(dateString) : new Date();
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ============ API CALLS ============
async function fetchUsers() {
    try {
        const res = await fetch('https://chatlyfreetotalk.onrender.com/api/users/all', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (res.ok) {
            // Backend already adds 'id' to users in users.js, but let's be safe
            apiUsers = (data.users || []).map(u => ({
                ...u,
                id: u._id || u.id
            }));
            renderSidebar(document.getElementById('userSearch')?.value || '');
        }
    } catch (err) {
        console.error("Failed to fetch users", err);
    }
}

function moveUserToTop(userId) {
    if (!currentUserObj || !currentUserObj.id) return;
    
    const myId = String(currentUserObj.id);
    const targetUserId = String(userId);
    
    // Don't move self chat or if user is already at top
    if (targetUserId === myId) return;
    
    const idx = apiUsers.findIndex(u => String(u.id) === targetUserId);
    if (idx !== -1 && idx !== 0) {
        // User exists and is not already at position 0
        const [u] = apiUsers.splice(idx, 1);
        // Move to top of apiUsers (self chat is added separately in renderSidebar, so this will be position 1)
        apiUsers.unshift(u);
        console.log('Moved user to top:', targetUserId);
    } else if (idx === 0) {
        // Already at top, no need to move
        console.log('User already at top:', targetUserId);
    } else {
        console.log('User not found in apiUsers:', targetUserId);
    }
}

// ============ SIDEBAR RENDERING ============
function renderSidebar(filter = '') {
    if (!dom.list || !currentUserObj) return;
    
    dom.list.innerHTML = "";
    const myId = String(currentUserObj.id);
    // Compute friend list from fetched users (backend returns friends as ObjectId strings)
    const meFromApi = apiUsers.find(u => String(u.id) === myId);
    const friendsSet = new Set((meFromApi && meFromApi.friends ? meFromApi.friends : (currentUserObj.friends || [])).map(f => String(f)));
    
    // 1. Prepare the "Self" object (Saved Messages)
    const selfData = { 
        ...currentUserObj, 
        isSelf: true, 
        displayName: "You (Saved Messages)"
    };
    
    // 2. Filter other users: exclude self and apply search filter
    const filteredOthers = apiUsers.filter(u => {
        const userId = String(u.id);
        const fullName = `${u.firstName} ${u.lastName} ${u.username}`.toLowerCase();
        return userId !== myId && fullName.includes(filter.toLowerCase());
    });

    const fullList = [selfData, ...filteredOthers];

    fullList.forEach(user => {
        const userId = String(user.id);
        const initials = getInitials(user.firstName, user.lastName);
        const status = relationships[userId] || 'none';
        const isActive = String(selectedUserId) === userId;

        const div = document.createElement('div');
        div.className = `user-item ${isActive ? 'active' : ''}`;
        
        // Indicators: unread (green dot), new request (red label). Self should not show unread.
        const hasUnread = !user.isSelf && unreadSet.has(userId);
        const hasNewRequest = newRequestSet.has(userId);
        const unreadHtml = hasUnread ? '<span class="unread-dot" title="Unread"></span>' : '';
        const newReqHtml = hasNewRequest ? '<span class="request-badge">NEW</span>' : '';
        const avatarClass = friendsSet.has(userId) ? 'user-avatar friend' : 'user-avatar';
        
        // Debug logging for indicators
        if (hasUnread) {
            console.log(`🟢 RENDERING: User ${userId} (${user.firstName}) has UNREAD indicator`);
        }
        if (hasNewRequest) {
            console.log(`🔴 RENDERING: User ${userId} (${user.firstName}) has NEW REQUEST indicator`);
        }
        
        div.innerHTML = `
            <div class="${avatarClass}">${initials}</div>
            <div class="user-info">
                <div class="user-name">${user.isSelf ? user.displayName : user.firstName + ' ' + user.lastName}</div>
                <div class="user-preview">${user.isSelf ? 'Message yourself' : '@' + user.username}</div>
            </div>
            ${unreadHtml}
            ${newReqHtml}
        `;
        div.onclick = () => selectUser(user);
        dom.list.appendChild(div);
    });
}

// ============ USER SELECTION LOGIC ============
async function selectUser(user) {
    if (!user) return;
    const myId = String(currentUserObj.id);
    const userId = String(user.id);
    selectedUserId = userId;
    
    // Opening a chat clears unread indicator (only for non-self chats)
    if (!user.isSelf) {
        const hadUnread = unreadSet.has(userId);
        unreadSet.delete(userId);
        if (hadUnread) {
            console.log('🟢 Cleared unread indicator for:', userId);
        }
    }
    
    // Opening request screen or chat clears new-request badge
    const hadNewRequest = newRequestSet.has(userId);
    newRequestSet.delete(userId);
    if (hadNewRequest) {
        console.log('🔴 Cleared new request badge for:', userId);
    }
    renderSidebar(document.getElementById('userSearch')?.value || '');

    dom.chatName.textContent = user.isSelf ? "You (Saved Messages)" : (user.firstName + ' ' + user.lastName);
    dom.headerAvatar.textContent = getInitials(user.firstName, user.lastName);

    try {
        const res = await fetch(`https://chatlyfreetotalk.onrender.com/api/messages/${myId}/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        let status = data.relationship || 'none';
        if (status === 'pending') {
            status = data.isSender ? 'pending_sent' : 'pending_received';
        }
        relationships[userId] = status;

        if (user.isSelf || status === 'accepted') {
            showChatUI();
            messagesCache[userId] = (data.messages || []).map(m => ({
                sender: String(m.senderId?._id || m.senderId) === myId ? 'me' : 'them',
                text: m.message,
                time: formatTime(m.createdAt)
            }));
            renderMessages(userId);
            // Ensure unread is cleared when chat is opened
            if (!user.isSelf) {
                unreadSet.delete(userId);
            }
        } else {
            // Request screen is opened - clear new request badge
            showRequestUI(user, status, data.requestId);
            newRequestSet.delete(userId);
            console.log('🔴 Cleared new request badge for:', userId);
            renderSidebar(document.getElementById('userSearch')?.value || '');
        }
    } catch (err) {
        console.error("Error selecting user", err);
    }

    // Mobile Responsive view toggle
    if (window.innerWidth <= 767) {
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('chatContainer').classList.add('visible');
    }
}

function showChatUI() {
    dom.requestPanel.classList.add('hidden');
    dom.inputArea.classList.remove('hidden');
}

function showRequestUI(user, status, requestId) {
    dom.inputArea.classList.add('hidden');
    dom.requestPanel.classList.remove('hidden');
    dom.messages.innerHTML = ""; 

    const requestText = document.getElementById("requestText");
    const requestInputGroup = document.getElementById("requestInputGroup");
    const acceptRejectGroup = document.getElementById("acceptRejectGroup");

    if (status === 'none') {
        requestText.textContent = "Send a message request to start chatting.";
        requestInputGroup.classList.remove('hidden');
        acceptRejectGroup.classList.add('hidden');
    } 
    else if (status === 'pending_sent') {
        requestText.textContent = "Waiting for user to accept your request...";
        requestInputGroup.classList.add('hidden');
        acceptRejectGroup.classList.add('hidden');
    } 
    else if (status === 'pending_received') {
        requestText.textContent = `${user.firstName} sent you a message request.`;
        requestInputGroup.classList.add('hidden');
        acceptRejectGroup.classList.remove('hidden');
        
        document.getElementById('acceptBtn').onclick = () => handleRequestAction('accept', requestId, user);
        document.getElementById('rejectBtn').onclick = () => handleRequestAction('reject', requestId, user);
    }
}

async function handleRequestAction(action, requestId, user) {
    try {
        const res = await fetch(`https://chatlyfreetotalk.onrender.com/api/requests/${action}/${requestId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            // Remove new request badge when request is accepted or rejected
            const userId = String(user.id);
            newRequestSet.delete(userId);
            await fetchUsers(); // Refresh statuses
            selectUser(user);
        }
    } catch (err) {
        console.error("Action failed", err);
    }
}

function renderMessages(userId) {
    const msgs = messagesCache[userId] || [];
    dom.messages.innerHTML = msgs.length === 0 
        ? `<div class="empty-chat"><p>No messages yet.</p></div>`
        : msgs.map(m => `
            <div class="message ${m.sender === 'me' ? 'sender' : 'receiver'}">
                <div>
                    <div class="message-bubble">${m.text}</div>
                    <div class="message-time">${m.time}</div>
                </div>
            </div>
        `).join('');
    dom.messages.scrollTop = dom.messages.scrollHeight;
}

function attachGlobalEvents() {
    // Send Message
    document.getElementById('sendBtn').onclick = async () => {
        const txt = dom.messageInput.value.trim();
        if (!txt || !selectedUserId) return;

        try {
            const res = await fetch('https://chatlyfreetotalk.onrender.com/api/messages/send', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ receiverId: selectedUserId, message: txt })
            });
            const data = await res.json();
            if (res.ok) {
                dom.messageInput.value = "";
                // Refresh the current chat
                const currentPartner = selectedUserId === String(currentUserObj.id) 
                    ? { ...currentUserObj, isSelf: true } 
                    : apiUsers.find(u => u.id === selectedUserId);
                await selectUser(currentPartner);
            }
        } catch (err) {
            console.error("Send failed", err);
        }
    };

    // Logout
    document.querySelector('.logout-btn').onclick = () => {
        localStorage.clear();
        window.location.href = 'signin.html';
    };

    // Send Request (when user is not yet connected)
    const sendRequestBtn = document.getElementById('sendRequestBtn');
    if (sendRequestBtn) {
        sendRequestBtn.onclick = async () => {
            const txt = document.getElementById('initialRequestMsg')?.value.trim();
            if (!txt || !selectedUserId) return;

            try {
                const res = await fetch('https://chatlyfreetotalk.onrender.com/api/requests/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ receiverId: selectedUserId, message: txt })
                });
                const data = await res.json();
                if (res.ok) {
                    // clear input, refresh users and re-select
                    document.getElementById('initialRequestMsg').value = '';
                    await fetchUsers();
                    const partner = selectedUserId === String(currentUserObj.id) ? { ...currentUserObj, isSelf: true } : apiUsers.find(u => String(u.id) === String(selectedUserId));
                    await selectUser(partner);
                } else {
                    alert(data.message || 'Failed to send request');
                }
            } catch (err) {
                console.error('Send request failed', err);
                alert('Failed to send request');
            }
        };
    }

    // Mobile back btn
    document.getElementById('mobileBackBtn').onclick = () => {
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('chatContainer').classList.remove('visible');
    };

    // Search input handler
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderSidebar(e.target.value || '');
        });
    }

    // Chat header options (reset/block-like)
    const chatOptionsBtn = document.getElementById('chatOptionsBtn');
    const chatOptionsMenu = document.getElementById('chatOptionsMenu');
    const resetChatBtn = document.getElementById('resetChatBtn');
    if (chatOptionsBtn && chatOptionsMenu) {
        chatOptionsBtn.onclick = () => chatOptionsMenu.classList.toggle('hidden');
    }
    if (resetChatBtn) {
        resetChatBtn.onclick = async () => {
            if (!selectedUserId) return alert('Select a user first');
            if (selectedUserId === String(currentUserObj.id)) return alert('Cannot reset self chat');
            if (!confirm('Reset and disable free messaging with this user?')) return;

            try {
                const myId = String(currentUserObj.id);
                const res = await fetch(`https://chatlyfreetotalk.onrender.com/api/messages/reset/${myId}/${selectedUserId}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    // locally clear messages and relationship and show request UI
                    delete messagesCache[selectedUserId];
                    relationships[selectedUserId] = 'none';
                    unreadSet.delete(selectedUserId);
                    newRequestSet.add(selectedUserId);
                    await fetchUsers();
                    const partner = apiUsers.find(u => String(u.id) === String(selectedUserId)) || { ...currentUserObj, isSelf: false };
                    selectUser(partner);
                    chatOptionsMenu.classList.add('hidden');
                } else {
                    const data = await res.json();
                    alert(data.message || 'Failed to reset chat');
                }
            } catch (err) {
                console.error('Reset failed', err);
                alert('Failed to reset chat');
            }
        };
    }
}

// ============ SOCKET LISTENERS ============
// Test: Listen to ALL socket events to see what's happening
socket.onAny((eventName, ...args) => {
    console.log('🔔 ANY SOCKET EVENT:', eventName, args);
});

socket.on('receive_message', (data) => {
    console.log('🔵 SOCKET EVENT: receive_message', data);
    console.log('🔵 Full data object:', JSON.stringify(data, null, 2));
    
    // Ensure currentUserObj is initialized
    if (!currentUserObj || !currentUserObj.id) {
        console.log('❌ currentUserObj not initialized yet, ignoring message');
        console.log('❌ currentUserObj:', currentUserObj);
        return;
    }
    
    const myId = String(currentUserObj.id);
    const senderId = String(data.senderId || data.sender);
    const receiverId = String(data.receiverId || data.receiver);
    
    console.log('📊 Message data:', { myId, senderId, receiverId });
    
    // Determine the partner (the other person in the conversation)
    // If I'm the sender, partner is receiver. If I'm receiver, partner is sender.
    const partnerId = senderId === myId ? receiverId : senderId;
    
    // Self chat should never show unread indicators
    if (partnerId === myId) {
        console.log('⏭️ Self chat, skipping unread indicator');
        return;
    }
    
    console.log('✅ Partner ID:', partnerId, 'Current selected:', selectedUserId);
    
    // If the chat with the person who sent the message is open, refresh it and remove unread
    if (selectedUserId && String(selectedUserId) === partnerId) {
        console.log('💬 Chat is open, clearing unread');
        // Chat is open, refresh it and ensure unread is cleared
        unreadSet.delete(partnerId);
        const currentPartner = apiUsers.find(u => String(u.id) === partnerId);
        if (currentPartner) {
            selectUser(currentPartner);
        } else {
            // User not in list, fetch and then refresh
            fetchUsers().then(() => {
                const partner = apiUsers.find(u => String(u.id) === partnerId);
                if (partner) selectUser(partner);
            });
        }
    } else {
        // Chat is not open: mark unread and move the user to top of list (below self)
        console.log('🟢 Marking as unread:', partnerId);
        console.log('📋 UnreadSet before:', Array.from(unreadSet));
        unreadSet.add(partnerId);
        console.log('📋 UnreadSet after:', Array.from(unreadSet));
        
        // Ensure user exists in apiUsers before moving
        const userExists = apiUsers.find(u => String(u.id) === partnerId);
        if (!userExists) {
            // User not in list yet, fetch users first
            console.log('👤 User not in list, fetching users...');
            fetchUsers().then(() => {
                moveUserToTop(partnerId);
                renderSidebar(document.getElementById('userSearch')?.value || '');
            });
        } else {
            moveUserToTop(partnerId);
            renderSidebar(document.getElementById('userSearch')?.value || '');
        }
    }
});

// New message request notification
socket.on('new_request', (data) => {
    console.log('🔴 SOCKET EVENT: new_request', data);
    console.log('🔴 Full data object:', JSON.stringify(data, null, 2));
    
    // Ensure currentUserObj is initialized
    if (!currentUserObj || !currentUserObj.id) {
        console.log('❌ currentUserObj not initialized yet, ignoring request');
        console.log('❌ currentUserObj:', currentUserObj);
        return;
    }
    
    const myId = String(currentUserObj.id);
    const senderId = String(data.senderId || data.sender);
    
    if (!senderId) {
        console.log('❌ No senderId in request data');
        return;
    }
    
    if (senderId === myId) {
        console.log('⏭️ Self request, skipping');
        return; // Don't show for self
    }
    
    console.log('🔴 New request from:', senderId);
    console.log('📋 NewRequestSet before:', Array.from(newRequestSet));
    newRequestSet.add(senderId);
    console.log('📋 NewRequestSet after:', Array.from(newRequestSet));
    
    // Ensure user exists in apiUsers before moving
    const userExists = apiUsers.find(u => String(u.id) === senderId);
    if (!userExists) {
        // User not in list yet, fetch users first
        console.log('👤 User not in list, fetching users...');
        fetchUsers().then(() => {
            moveUserToTop(senderId);
            renderSidebar(document.getElementById('userSearch')?.value || '');
        });
    } else {
        moveUserToTop(senderId);
        renderSidebar(document.getElementById('userSearch')?.value || '');
    }
});

socket.on('request_accepted', (data) => {
    // Ensure currentUserObj is initialized
    if (!currentUserObj || !currentUserObj.id) return;
    
    // Remove new request badge when request is accepted
    // The data contains senderId and receiverId - we need to find which one is not us
    const myId = String(currentUserObj.id);
    const senderId = String(data.senderId || data.receiverId);
    const receiverId = String(data.receiverId || data.senderId);
    
    // Remove badge from the other user (not us)
    const otherUserId = senderId === myId ? receiverId : senderId;
    if (otherUserId && otherUserId !== myId) {
        newRequestSet.delete(otherUserId);
        console.log('Removed request badge for:', otherUserId);
    }
    // refresh users and current chat when a request is accepted
    fetchUsers();
});

socket.on('request_rejected', (data) => {
    // Ensure currentUserObj is initialized
    if (!currentUserObj || !currentUserObj.id) return;
    
    // remove pending badge for sender when request is rejected
    const senderId = String(data.senderId || data.requester);
    if (senderId) {
        newRequestSet.delete(senderId);
        console.log('Removed request badge for rejected request:', senderId);
    }
    fetchUsers();
});

// Chat reset from other side
socket.on('chat_reset', (data) => {
    const other = String(data.otherUserId || data.other);
    if (!other) return;
    // clear local caches and mark relationship none
    delete messagesCache[other];
    relationships[other] = 'none';
    newRequestSet.add(other);
    unreadSet.delete(other);
    renderSidebar(document.getElementById('userSearch')?.value || '');
});

// Start app
window.onload = init;
