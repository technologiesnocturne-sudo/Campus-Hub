const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public — needed on the signup form before login.
router.get('/departments', (req, res) => {
  const rows = db.prepare('SELECT id, code, name FROM departments ORDER BY name').all();
  res.json({ departments: rows });
});

router.get('/announcements', requireAuth, (req, res) => {
  const audience = req.user.role === 'student' ? "('all','students')" : "('all','teachers')";
  const sql = req.user.role === 'admin'
    ? `SELECT a.*, u.full_name AS author FROM announcements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC LIMIT 50`
    : `SELECT a.*, u.full_name AS author FROM announcements a LEFT JOIN users u ON u.id = a.created_by WHERE a.audience IN ${audience} ORDER BY a.created_at DESC LIMIT 50`;
  res.json({ announcements: db.prepare(sql).all() });
});

router.post('/announcements', requireAuth, requireRole('admin'), (req, res) => {
  const { title, body, audience } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });
  const info = db
    .prepare('INSERT INTO announcements (title, body, created_by, audience) VALUES (?, ?, ?, ?)')
    .run(title.trim(), body.trim(), req.user.id, audience || 'all');
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/events', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, u.full_name AS author FROM events e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.event_date >= date('now', '-1 day') ORDER BY e.event_date ASC LIMIT 50`
    )
    .all();
  res.json({ events: rows });
});

router.post('/events', requireAuth, requireRole('admin'), (req, res) => {
  const { title, description, eventDate } = req.body;
  if (!title || !eventDate) return res.status(400).json({ error: 'Title and date are required.' });
  const info = db
    .prepare('INSERT INTO events (title, description, event_date, created_by) VALUES (?, ?, ?, ?)')
    .run(title.trim(), description || '', eventDate, req.user.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
