const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, username, password } = req.body;
    if (!firstName || !lastName || !username || !password) {
      return res.status(400).json({ message: 'Missing fields' });
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) return res.status(400).json({ message: 'Username already exists' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const user = new User({ firstName, lastName, username: username.toLowerCase(), password: hash });
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ 
      token, 
      user: { 
        id: user._id.toString(), 
        _id: user._id.toString(),
        firstName: user.firstName, 
        lastName: user.lastName, 
        username: user.username,
        friends: (user.friends || []).map(f => f.toString())
      } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/signin
router.post('/signin', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Missing fields' });

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(400).json({ message: 'dont exit your account , please sign up' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Wrong password' });

    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { 
        id: user._id.toString(), 
        _id: user._id.toString(),
        firstName: user.firstName, 
        lastName: user.lastName, 
        username: user.username,
        friends: (user.friends || []).map(f => f.toString())
      } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
