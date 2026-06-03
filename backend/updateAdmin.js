const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const bcrypt = require('bcryptjs');
  const User = require('./models/user');
  const hashed = await bcrypt.hash('Admin1234', 10);
  const user = new User({
    name: 'Admin',
    email: 'admin@test.com',
    password: hashed,
    role: 'admin'
  });
  await user.save();
  console.log('Done! Admin created:', user.email);
  process.exit();
});