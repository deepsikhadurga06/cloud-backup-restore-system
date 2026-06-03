const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const AWS     = require('aws-sdk');
const User    = require('../models/user');

// ── S3 instance ────────────────────────────────────────────────────────────────
const s3 = new AWS.S3({
  accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region:          process.env.AWS_REGION
});

// ── Auth middleware ────────────────────────────────────────────────────────────
function authAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'No token provided.' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Allow if role is admin in token OR if frontend forced admin role
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin access only.' });
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

// ── GET /api/admin/stats ───────────────────────────────────────────────────────
router.get('/stats', authAdmin, async (req, res) => {
  try {
    const now     = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // User stats from MongoDB
    const totalUsers   = await User.countDocuments();
    const newThisWeek  = await User.countDocuments({ createdAt: { $gte: weekAgo } });
    const blockedUsers = await User.countDocuments({ role: 'blocked' });
    const newBlocksWeek= await User.countDocuments({ role: 'blocked', updatedAt: { $gte: weekAgo } });

    // Backup/storage stats from S3
    let totalBackups = 0, totalStorageBytes = 0, backupsToday = 0;
    try {
      const s3Data = await s3.listObjectsV2({ Bucket: process.env.AWS_BUCKET_NAME }).promise();
      totalBackups      = s3Data.Contents.length;
      totalStorageBytes = s3Data.Contents.reduce((sum, f) => sum + f.Size, 0);
      backupsToday      = s3Data.Contents.filter(f => new Date(f.LastModified) >= today).length;
    } catch (s3Err) {
      console.warn('S3 stats error:', s3Err.message);
    }

    // Convert bytes to human-readable
    const totalStorageGB = (totalStorageBytes / (1024 ** 3)).toFixed(2);
    const totalStorageMB = (totalStorageBytes / (1024 ** 2)).toFixed(1);
    const storageDisplay = totalStorageGB >= 1 ? totalStorageGB + ' GB' : totalStorageMB + ' MB';

    res.json({
      totalUsers, newThisWeek, blockedUsers, newBlocksWeek,
      totalBackups, backupsToday,
      totalStorageBytes, storageDisplay,
      successRate: totalBackups > 0 ? 100 : 0
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// ── GET /api/admin/users ───────────────────────────────────────────────────────
router.get('/users', authAdmin, async (req, res) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role   = req.query.role   || '';

    const filter = {};
    if (search) filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
    if (role) filter.role = role;

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ total, page, pages: Math.ceil(total / limit), users });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// ── PUT /api/admin/users/:id/block ─────────────────────────────────────────────
router.put('/users/:id/block', authAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.role = user.role === 'blocked' ? 'user' : 'blocked';
    await user.save();
    res.json({ message: `User ${user.role === 'blocked' ? 'blocked' : 'unblocked'}.`, user });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// ── DELETE /api/admin/users/:id ────────────────────────────────────────────────
router.delete('/users/:id', authAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// ── POST /api/admin/users ──────────────────────────────────────────────────────
router.post('/users', authAdmin, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password required.' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role: role || 'user' });
    res.status(201).json({ message: 'User created.', user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// ── GET /api/admin/backups ─────────────────────────────────────────────────────
// Real S3 file list for admin
router.get('/backups', authAdmin, async (req, res) => {
  try {
    const s3Data = await s3.listObjectsV2({ Bucket: process.env.AWS_BUCKET_NAME }).promise();
    const files  = s3Data.Contents.map(item => ({
      key:  item.Key,
      name: item.Key.replace(/^\d+_/, ''),
      size: item.Size,
      date: item.LastModified
    })).sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, total: files.length, files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;