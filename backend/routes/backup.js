const express = require('express');
const router = express.Router();
const multer = require('multer');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const upload = multer({ storage: multer.memoryStorage() });

// ── Auth middleware ────────────────────────────────────────────────────────────
function authUser(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'No token provided.' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

router.post('/upload', authUser, upload.single('file'), async (req, res) => {
  try {
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${req.user.id}/${Date.now()}_${req.file.originalname}`,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    };
    const data = await s3.upload(params).promise();
    res.json({ success: true, url: data.Location });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/list', authUser, async (req, res) => {
  try {
    const data = await s3.listObjectsV2({
      Bucket: process.env.AWS_BUCKET_NAME,
      Prefix: `${req.user.id}/`
    }).promise();
    const files = data.Contents.map(item => ({
      key: item.Key,
      name: item.Key.replace(/^[^/]+\/\d+_/, ''),
      size: item.Size,
      date: item.LastModified
    }));
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/download', authUser, async (req, res) => {
  try {
    const key = req.query.key;
    const url = s3.getSignedUrl('getObject', {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Expires: 60
    });
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/delete', authUser, async (req, res) => {
  try {
    const key = req.query.key;
    await s3.deleteObject({ Bucket: process.env.AWS_BUCKET_NAME, Key: key }).promise();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;