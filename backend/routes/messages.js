

const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const ChatRequest = require('../models/ChatRequest');
const auth = require('../middleware/auth');

// POST /api/messages/send
router.post('/send', auth, async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, message } = req.body;
        
        if (!receiverId || !message) {
            return res.status(400).json({ message: 'Missing receiverId or message' });
        }

        const io = req.app.get('socketio'); // Get io instance

        // Self-chat: always allow
        if (String(senderId) === String(receiverId)) {
            const msg = new Message({ senderId, receiverId, message });
            await msg.save();

            const msgData = {
                senderId,
                receiverId,
                message,
                createdAt: msg.createdAt,
                time: new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            };

            // Emit to sender's own room for self-chat
            io.to(String(senderId)).emit('receive_message', msgData);

            return res.json({ msg: msgData });
        }

        // For other users: check if relationship is accepted
        const rel = await ChatRequest.findOne({
            $or: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        });

        if (!rel || rel.status !== 'accepted') {
            return res.status(403).json({ message: 'Chat request not accepted yet' });
        }

        const msg = new Message({ senderId, receiverId, message });
        await msg.save();

        const msgData = {
            senderId,
            receiverId,
            message,
            createdAt: msg.createdAt,
            time: new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        };

        // Emit to receiver's private room
        const receiverRoom = String(receiverId);
        console.log('📤 Emitting receive_message to room:', receiverRoom, 'Data:', msgData);
        io.to(receiverRoom).emit('receive_message', msgData);
        
        // Also log all rooms to debug
        const rooms = io.sockets.adapter.rooms;
        console.log('📋 Available rooms:', Array.from(rooms.keys()));

        res.json({ msg: msgData });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ message: 'Server error' });
    }
});
// GET /api/messages/:userId/:otherUserId
router.get('/:userId/:otherUserId', auth, async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;
    if (String(req.user.id) !== String(userId)) return res.status(403).json({ message: 'Forbidden' });

    // Self-chat: always allow and return messages
    if (String(userId) === String(otherUserId)) {
      const msgs = await Message.find({
        senderId: userId,
        receiverId: otherUserId
      }).sort({ createdAt: 1 });
      
      return res.json({ messages: msgs, relationship: 'accepted', isSender: false, requestId: null });
    }

    // Check relationship status to send to frontend
    const rel = await ChatRequest.findOne({
      $or: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId }
      ]
    });

    let status = 'none';
    let isSender = false;
    let requestId = null;
    if (rel) {
      status = rel.status;
      isSender = String(rel.senderId) === String(userId);
      requestId = rel._id;
    }

    // If Accepted, get messages
    if (status === 'accepted') {
      const msgs = await Message.find({
        $or: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId }
        ]
      }).sort({ createdAt: 1 });
      
      return res.json({ messages: msgs, relationship: status, isSender, requestId });
    }

    // Otherwise just return the status (to show request UI)
    res.json({ messages: [], relationship: status, isSender, requestId });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

    // POST /api/messages/reset/:userId/:otherUserId
    router.post('/reset/:userId/:otherUserId', auth, async (req, res) => {
      try {
        const { userId, otherUserId } = req.params;
        // Ensure the authenticated user is one of the two participants
        if (String(req.user.id) !== String(userId) && String(req.user.id) !== String(otherUserId)) {
          return res.status(403).json({ message: 'Forbidden' });
        }

        // Remove any chat requests between them
        await ChatRequest.deleteMany({
          $or: [
            { senderId: userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: userId }
          ]
        });

        // Remove all messages exchanged between them
        await Message.deleteMany({
          $or: [
            { senderId: userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: userId }
          ]
        });

        const io = req.app.get('socketio');
        // Notify both parties their chat was reset
        io.to(String(userId)).emit('chat_reset', { otherUserId });
        io.to(String(otherUserId)).emit('chat_reset', { otherUserId: userId });

        res.json({ message: 'Chat reset' });
      } catch (err) {
        console.error('Error resetting chat:', err);
        res.status(500).json({ message: 'Server error' });
      }
    });

module.exports = router;

