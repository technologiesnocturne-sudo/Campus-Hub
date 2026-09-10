const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { genId } = require('../utils/ids');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/overview', (req, res) => {
  const counts = {
    students: db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'student'").get().c,
    teachers: db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'teacher'").get().c,
    departments: db.prepare('SELECT COUNT(*) c FROM departments').get().c,
    gradesRecorded: db.prepare('SELECT COUNT(*) c FROM grades').get().c,
    vouchersSold: db.prepare('SELECT COUNT(*) c FROM vouchers').get().c,
    revenuePesewas: db.prepare("SELECT COALESCE(SUM(amount_pesewas),0) s FROM payments WHERE status = 'success'").get().s,
  };
  res.json({ counts });
});

// Register a student or teacher and issue their system ID. Admin sets an initial password
// that the person is expected to change after first login.
router.post('/register', (req, res) => {
  const { role, fullName, email, password, departmentId, isHod } = req.body;
  if (!['student', 'teacher'].includes(role)) return res.status(400).json({ error: 'role must be "student" or "teacher".' });
  if (!fullName || !email || !password || !departmentId) {
    return res.status(400).json({ error: 'fullName, email, password, and departmentId are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const dept = db.prepare('SELECT id FROM departments WHERE id = ?').get(departmentId);
  if (!dept) return res.status(400).json({ error: 'Unknown department.' });

  const identifier = genId(role === 'student' ? 'STU' : 'TCH');
  const hash = bcrypt.hashSync(password, 10);

  const info = db
    .prepare(
      `INSERT INTO users (role, identifier, full_name, email, password_hash, department_id, is_hod)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(role, identifier, fullName.trim(), email.toLowerCase().trim(), hash, departmentId, role === 'teacher' && isHod ? 1 : 0);

  res.status(201).json({ id: info.lastInsertRowid, identifier });
});

router.get('/users', (req, res) => {
  const { role, departmentId } = req.query;
  let sql = `SELECT u.id, u.role, u.identifier, u.full_name, u.email, u.is_hod, u.created_at, d.name AS department_name
             FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE 1=1`;
  const params = [];
  if (role) { sql += ' AND u.role = ?'; params.push(role); }
  if (departmentId) { sql += ' AND u.department_id = ?'; params.push(departmentId); }
  sql += ' ORDER BY u.created_at DESC';
  res.json({ users: db.prepare(sql).all(...params) });
});

// Promote/demote a teacher's Head of Department status.
router.patch('/users/:id/hod', (req, res) => {
  const { isHod } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Teacher not found.' });
  db.prepare('UPDATE users SET is_hod = ? WHERE id = ?').run(isHod ? 1 : 0, user.id);
  res.json({ ok: true });
});

router.get('/departments', (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.id, d.code, d.name,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'student') AS student_count,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'teacher') AS teacher_count
       FROM departments d ORDER BY d.name`
    )
    .all();
  res.json({ departments: rows });
});

router.get('/grades', (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.id, g.subject, g.term, g.score, g.grade_letter, g.created_at, u.full_name AS student, u.identifier
       FROM grades g JOIN users u ON u.id = g.student_id ORDER BY g.created_at DESC LIMIT 200`
    )
    .all();
  res.json({ grades: rows });
});

router.get('/payments', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.reference, p.amount_pesewas, p.status, p.created_at, p.verified_at, u.full_name AS student, u.identifier
       FROM payments p JOIN users u ON u.id = p.student_id ORDER BY p.created_at DESC LIMIT 200`
    )
    .all();
  res.json({ payments: rows });
});

module.exports = router;
