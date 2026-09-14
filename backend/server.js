require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { isFreshDb } = require('./db');

const authRoutes = require('./routes/auth');
const generalRoutes = require('./routes/general');
const studentRoutes = require('./routes/students');
const teacherRoutes = require('./routes/teachers');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api', generalRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);

// Central error handler — keeps stack traces out of API responses.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  if (isFreshDb) {
    console.log('Fresh database detected. Run "npm run seed" to load departments and a default admin account.');
  }
  console.log(`School SaaS API listening on http://localhost:${PORT}`);
});
