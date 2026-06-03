const express  = require('express');
const cors     = require('cors');
const dotenv   = require('dotenv');
const mongoose = require('mongoose');
const path     = require('path');

dotenv.config();

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB error:', err.message));

// API Routes
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/admin',  require('./routes/admin'));

// Serve Frontend
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});