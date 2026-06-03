const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB error:', err.message));

// ✅ Routes
app.use('/api/auth', require('./routes/auth'));

// ✅ Test route
app.get('/', (req, res) => {
  res.json({ message: 'CloudVault Server is running! 🚀' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});
