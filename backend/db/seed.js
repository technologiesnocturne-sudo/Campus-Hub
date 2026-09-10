require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('./index');
const { genId } = require('../utils/ids');

const DEPARTMENTS = [
  ['EET', 'ELECTRICALS ENGINEERING TECHNOLOGY'],
  ['EE', 'ELECTRONICS ENGINEERING TECHNOLOGY'],
  ['MET', 'MECHANICAL ENGINEERING TECHNOLOGY'],
  ['BCT', 'BUILDING CONSTRUCTION TECHNOLOGY'],
  ['CHS', 'COMPUTER HARDWARE & SOFTWARE'],
  ['MVE', 'MOTOR VEHICLE ENGINEERING'],
  ['FDT', 'FASHION DESIGN TECHNOLOGY'],
  ['BIT', 'BUSINESS INFORMATION TECHNOLOGY'],
  ['BSA', 'BUSINESS ACCOUNTING'],
  ['HCM', 'HOSPITALITY & CATERING MANAGEMENT'],
  ['PGFT', 'PLUMBING & GAS FITTING'],
  ['WCT', 'WOOD CONSTRUCTION TECHNOLOGY'],
  ['WFT', 'WELDING & FABRICATION TECHNOLOGY'],
  ['CAT', 'CREATIVE ARTS TECHNOLOGY'],
];

function run() {
  const insertDept = db.prepare('INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)');
  const deptTx = db.transaction((rows) => rows.forEach((r) => insertDept.run(...r)));
  deptTx(DEPARTMENTS);
  console.log(`Seeded ${DEPARTMENTS.length} departments.`);

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@school.edu.gh';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(
      `INSERT INTO users (role, identifier, full_name, email, password_hash, department_id, is_hod)
       VALUES ('admin', ?, 'System Administrator', ?, ?, NULL, 0)`
    ).run(genId('ADM'), adminEmail, hash);
    console.log(`Created admin account -> ${adminEmail} / ${adminPassword}`);
  } else {
    console.log('Admin account already exists, skipping.');
  }

  // Demo teacher (HOD of Computer Hardware & Software) and demo student, for quick testing.
  const chs = db.prepare('SELECT id FROM departments WHERE code = ?').get('CHS');
  const demoTeacherEmail = 'teacher.demo@school.edu.gh';
  if (!db.prepare('SELECT id FROM users WHERE email = ?').get(demoTeacherEmail)) {
    const hash = bcrypt.hashSync('Teacher123!', 10);
    db.prepare(
      `INSERT INTO users (role, identifier, full_name, email, password_hash, department_id, is_hod)
       VALUES ('teacher', ?, 'Ama Boateng', ?, ?, ?, 1)`
    ).run(genId('TCH'), demoTeacherEmail, hash, chs.id);
    console.log(`Created demo teacher -> ${demoTeacherEmail} / Teacher123!`);
  }

  const demoStudentEmail = 'student.demo@school.edu.gh';
  if (!db.prepare('SELECT id FROM users WHERE email = ?').get(demoStudentEmail)) {
    const hash = bcrypt.hashSync('Student123!', 10);
    db.prepare(
      `INSERT INTO users (role, identifier, full_name, email, password_hash, department_id, is_hod)
       VALUES ('student', ?, 'Kwame Mensah', ?, ?, ?, 0)`
    ).run(genId('STU'), demoStudentEmail, hash, chs.id);
    console.log(`Created demo student -> ${demoStudentEmail} / Student123!`);
  }
}

run();
