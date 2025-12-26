const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/users/all
router.get('/all', auth, async (req, res) => {
  try {
    // Return all users except password, sorted by newest first
    // Frontend will filter out the current user itself
    const users = await User.find({}, '-password').sort({ createdAt: -1 }).lean();
    
    // Ensure _id is converted to string for consistency
    const formattedUsers = users.map(user => ({
      ...user,
      _id: user._id.toString(),
      id: user._id.toString(),
      friends: (user.friends || []).map(f => f.toString())
    }));
    
    res.json({ users: formattedUsers });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;