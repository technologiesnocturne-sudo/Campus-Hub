const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { genId } = require('../utils/ids');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      identifier: user.identifier,
      email: user.email,
      fullName: user.full_name,
      departmentId: user.department_id,
      isHod: !!user.is_hod,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    identifier: user.identifier,
    fullName: user.full_name,
    email: user.email,
    departmentId: user.department_id,
    isHod: !!user.is_hod,
  };
}

// Public self-signup is for students only. Teacher/Admin accounts are provisioned by Admin.
router.post('/signup', (req, res) => {
  const { fullName, email, password, departmentId } = req.body;
  if (!fullName || !email || !password || !departmentId) {
    return res.status(400).json({ error: 'Full name, email, password, and department are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const dept = db.prepare('SELECT id FROM departments WHERE id = ?').get(departmentId);
  if (!dept) return res.status(400).json({ error: 'Unknown department.' });

  const hash = bcrypt.hashSync(password, 10);
  const identifier = genId('STU');

  const info = db
    .prepare(
      `INSERT INTO users (role, identifier, full_name, email, password_hash, department_id, is_hod)
       VALUES ('student', ?, ?, ?, ?, ?, 0)`
    )
    .run(identifier, fullName.trim(), email.toLowerCase().trim(), hash, departmentId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
