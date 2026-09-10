const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('student'));

router.get('/profile', (req, res) => {
  const user = db
    .prepare(
      `SELECT u.id, u.identifier, u.full_name, u.email, u.created_at, d.name AS department_name, d.code AS department_code
       FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`
    )
    .get(req.user.id);
  res.json({ profile: user });
});

// Redeem a voucher code to unlock a term's grade report.
router.post('/grades/unlock', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Voucher code is required.' });

  const voucher = db.prepare('SELECT * FROM vouchers WHERE code = ? AND student_id = ?').get(code.trim(), req.user.id);
  if (!voucher) return res.status(404).json({ error: 'That voucher code was not found on your account.' });
  if (voucher.is_used) return res.status(409).json({ error: 'This voucher code has already been used.' });

  db.prepare("UPDATE vouchers SET is_used = 1, used_at = datetime('now') WHERE id = ?").run(voucher.id);

  const grades = db
    .prepare('SELECT subject, term, score, grade_letter, created_at FROM grades WHERE student_id = ? AND term = ? ORDER BY subject')
    .all(req.user.id, voucher.term);

  res.json({ term: voucher.term, grades });
});

// List voucher codes the student has purchased (used + unused), without exposing anyone else's.
router.get('/vouchers', (req, res) => {
  const rows = db
    .prepare('SELECT code, term, is_used, used_at, created_at FROM vouchers WHERE student_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({ vouchers: rows });
});

router.get('/attendance', (req, res) => {
  const rows = db
    .prepare('SELECT date, status FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 90')
    .all(req.user.id);
  const total = rows.length;
  const present = rows.filter((r) => r.status === 'present').length;
  res.json({ attendance: rows, summary: { total, present, rate: total ? Math.round((present / total) * 100) : 0 } });
});

router.get('/materials', (req, res) => {
  const student = db.prepare('SELECT department_id FROM users WHERE id = ?').get(req.user.id);
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.file_path, m.created_at, u.full_name AS teacher
       FROM materials m JOIN users u ON u.id = m.teacher_id
       WHERE m.department_id = ? ORDER BY m.created_at DESC LIMIT 50`
    )
    .all(student.department_id);
  res.json({ materials: rows });
});

router.get('/assignments', (req, res) => {
  const student = db.prepare('SELECT department_id FROM users WHERE id = ?').get(req.user.id);
  const rows = db
    .prepare(
      `SELECT a.id, a.title, a.description, a.due_date, a.created_at, u.full_name AS teacher
       FROM assignments a JOIN users u ON u.id = a.teacher_id
       WHERE a.department_id = ? ORDER BY a.due_date ASC LIMIT 50`
    )
    .all(student.department_id);
  res.json({ assignments: rows });
});

module.exports = router;
