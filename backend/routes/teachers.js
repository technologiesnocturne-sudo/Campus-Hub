const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('teacher'));

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 15 * 1024 * 1024 } });

function letterFor(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

router.get('/profile', (req, res) => {
  const user = db
    .prepare(
      `SELECT u.id, u.identifier, u.full_name, u.email, u.is_hod, d.name AS department_name, d.code AS department_code
       FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`
    )
    .get(req.user.id);
  res.json({ profile: user });
});

// List students in the teacher's own department (needed to pick who to grade / mark attendance for).
router.get('/students', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, identifier, full_name, email FROM users WHERE role = 'student' AND department_id = ? ORDER BY full_name`
    )
    .all(req.user.departmentId);
  res.json({ students: rows });
});

// Manual single-student grade entry.
router.post('/grades', (req, res) => {
  const { studentId, subject, term, score } = req.body;
  if (!studentId || !subject || !term || score === undefined) {
    return res.status(400).json({ error: 'studentId, subject, term, and score are required.' });
  }
  const student = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student' AND department_id = ?").get(studentId, req.user.departmentId);
  if (!student) return res.status(404).json({ error: 'Student not found in your department.' });

  const numericScore = Number(score);
  db.prepare(
    'INSERT INTO grades (student_id, subject, term, score, grade_letter, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(studentId, subject.trim(), term.trim(), numericScore, letterFor(numericScore), req.user.id);

  res.status(201).json({ ok: true });
});

// Bulk grade upload from an .xlsx sheet.
// Expected columns (header row): student_id | subject | term | score
// student_id matches the system-issued identifier (e.g. STU-2026-7F3K9Q), not the internal DB id.
router.post('/grades/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An .xlsx file is required (field name: file).' });

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const findStudent = db.prepare(
      "SELECT id FROM users WHERE identifier = ? AND role = 'student' AND department_id = ?"
    );
    const insertGrade = db.prepare(
      'INSERT INTO grades (student_id, subject, term, score, grade_letter, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const results = { inserted: 0, skipped: [] };

    const tx = db.transaction(() => {
      for (const [i, row] of rows.entries()) {
        const studentIdentifier = String(row.student_id || row.Student_ID || row.StudentID || '').trim();
        const subject = String(row.subject || row.Subject || '').trim();
        const term = String(row.term || row.Term || '').trim();
        const score = Number(row.score ?? row.Score);

        if (!studentIdentifier || !subject || !term || Number.isNaN(score)) {
          results.skipped.push({ row: i + 2, reason: 'Missing or invalid field(s).' });
          continue;
        }
        const student = findStudent.get(studentIdentifier, req.user.departmentId);
        if (!student) {
          results.skipped.push({ row: i + 2, reason: `Student ${studentIdentifier} not found in your department.` });
          continue;
        }
        insertGrade.run(student.id, subject, term, score, letterFor(score), req.user.id);
        results.inserted += 1;
      }
    });
    tx();

    fs.unlink(req.file.path, () => {});
    res.json(results);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: 'Could not read that spreadsheet. Confirm it is a valid .xlsx file.' });
  }
});

router.post('/attendance', (req, res) => {
  const { studentId, date, status } = req.body;
  if (!studentId || !date || !status) return res.status(400).json({ error: 'studentId, date, and status are required.' });

  const student = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student' AND department_id = ?").get(studentId, req.user.departmentId);
  if (!student) return res.status(404).json({ error: 'Student not found in your department.' });

  db.prepare(
    `INSERT INTO attendance (student_id, date, status, marked_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by`
  ).run(studentId, date, status, req.user.id);

  res.status(201).json({ ok: true });
});

router.post('/materials', upload.single('file'), (req, res) => {
  const { title } = req.body;
  if (!title || !req.file) return res.status(400).json({ error: 'Title and a file are required.' });
  const info = db
    .prepare('INSERT INTO materials (teacher_id, department_id, title, file_path) VALUES (?, ?, ?, ?)')
    .run(req.user.id, req.user.departmentId, title.trim(), `/uploads/${req.file.filename}`);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/materials', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, file_path, created_at FROM materials WHERE teacher_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({ materials: rows });
});

router.post('/assignments', (req, res) => {
  const { title, description, dueDate } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const info = db
    .prepare('INSERT INTO assignments (teacher_id, department_id, title, description, due_date) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, req.user.departmentId, title.trim(), description || '', dueDate || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/assignments', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, description, due_date, created_at FROM assignments WHERE teacher_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({ assignments: rows });
});

// HOD-only: view every teacher and student inside the department.
router.get('/department-overview', requireRole('teacher'), (req, res) => {
  if (!req.user.isHod) return res.status(403).json({ error: 'Only the Head of Department can view this.' });
  const teachers = db
    .prepare("SELECT id, identifier, full_name, email FROM users WHERE role = 'teacher' AND department_id = ? ORDER BY full_name")
    .all(req.user.departmentId);
  const students = db
    .prepare("SELECT id, identifier, full_name, email FROM users WHERE role = 'student' AND department_id = ? ORDER BY full_name")
    .all(req.user.departmentId);
  res.json({ teachers, students });
});

module.exports = router;
