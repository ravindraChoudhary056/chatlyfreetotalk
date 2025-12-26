const express = require('express');
const router = express.Router();
const ChatRequest = require('../models/ChatRequest');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const User = require('../models/User');

// POST /api/requests/send
router.post('/send', auth, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId, message } = req.body;

    if (!receiverId || !message) return res.status(400).json({ message: 'Missing fields' });

    // Self-chat check
    if (String(senderId) === String(receiverId)) return res.status(400).json({ message: 'Use messages endpoint for self-chat' });

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    // Check for existing relation
    const existing = await ChatRequest.findOne({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId }
      ]
    });

    if (existing) {
      return res.status(400).json({ message: `Request already exists with status: ${existing.status}` });
    }

    const reqObj = new ChatRequest({ senderId, receiverId, firstMessage: message });
    await reqObj.save();
    
    const io = req.app.get('socketio');
    // Notify receiver about new request
    const receiverRoom = String(receiverId);
    const requestData = { requestId: reqObj._id, senderId };
    console.log('📤 Emitting new_request to room:', receiverRoom, 'Data:', requestData);
    io.to(receiverRoom).emit('new_request', requestData);
    
    // Also log all rooms to debug
    const rooms = io.sockets.adapter.rooms;
    console.log('📋 Available rooms:', Array.from(rooms.keys()));
    
    res.json({ message: 'Request sent', request: reqObj });
  } catch (err) {
    console.error('Error sending request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/requests/accept/:requestId
router.post('/accept/:requestId', auth, async (req, res) => {
  try {
    const request = await ChatRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (String(request.receiverId) !== String(req.user.id)) return res.status(403).json({ message: 'Forbidden' });

    request.status = 'accepted';
    await request.save();

    // Move firstMessage to the Message collection
    const msg = new Message({ 
      senderId: request.senderId, 
      receiverId: request.receiverId, 
      message: request.firstMessage 
    });
    await msg.save();

    // Add each user to the other's friends list
    try {
      await User.updateOne({ _id: request.senderId }, { $addToSet: { friends: request.receiverId } });
      await User.updateOne({ _id: request.receiverId }, { $addToSet: { friends: request.senderId } });
    } catch (e) {
      console.error('Error updating friends lists:', e);
    }

    const io = req.app.get('socketio');
    // Notify both users about the acceptance
    io.to(String(request.senderId)).emit('request_accepted', { requestId: request._id, receiverId: request.receiverId });
    io.to(String(request.receiverId)).emit('request_accepted', { requestId: request._id, senderId: request.senderId });

    res.json({ message: 'Accepted', initialMessage: msg });
  } catch (err) {
    console.error('Error accepting request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/requests/reject/:requestId
router.post('/reject/:requestId', auth, async (req, res) => {
  try {
    const request = await ChatRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (String(request.receiverId) !== String(req.user.id)) return res.status(403).json({ message: 'Forbidden' });

    // Delete the request instead of just marking as rejected
    await ChatRequest.findByIdAndDelete(req.params.requestId);

    const io = req.app.get('socketio');
    // Notify sender about rejection
    io.to(String(request.senderId)).emit('request_rejected', { requestId: request._id });

    res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error('Error rejecting request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/requests/pending - Get all pending requests for current user
router.get('/pending', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const pendingRequests = await ChatRequest.find({
      receiverId: userId,
      status: 'pending'
    }).populate('senderId', 'firstName lastName username').sort({ createdAt: -1 });

    res.json({ requests: pendingRequests });
  } catch (err) {
    console.error('Error fetching pending requests:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;