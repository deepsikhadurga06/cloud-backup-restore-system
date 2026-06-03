const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashed });
    res.status(201).json({ message: 'Account created successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password.' });
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: 'No token.' });
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    const match = await bcrypt.compare(req.body.currentPassword, user.password);
    if (!match) return res.status(400).json({ message: 'Current password is incorrect.' });
    user.password = await bcrypt.hash(req.body.newPassword, 10);
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});
router.delete('/delete-account', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: 'No token.' });
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    await User.findByIdAndDelete(decoded.id);
    res.json({ message: 'Account deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});
module.exports = router;