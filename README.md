# Campus Hub — School Management SaaS

A full-stack School Management System built from your `Project.md` / `Notes.md` / `departments.md`
briefs: **Student**, **Facilitator/Teacher (incl. Head of Department)**, and **Administrator**
roles, grade checking gated behind Paystack-purchased voucher codes, attendance, learning
material, assignments, announcements/events, and spreadsheet grade import.

- **Backend:** Node.js, Express, SQLite (via `better-sqlite3` — no separate database server to install)
- **Frontend:** Vanilla HTML / CSS / JS (no build step, no framework)
- **Payments:** Paystack (test mode works out of the box; falls back to a "simulate payment" dev flow if no live key is configured)

## 1. Install & run the backend

```bash
cd backend
cp .env.example .env      # then edit .env — at minimum set JWT_SECRET
npm install
npm run seed               # loads the 14 departments + a default admin + demo accounts
npm start                  # http://localhost:4000
```

The seed script prints the default admin's login (from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
in `.env`, or `admin@school.edu.gh` / `ChangeMe123!` if left unset), plus two demo accounts:

| Role      | Email                          | Password       |
|-----------|---------------------------------|----------------|
| Admin     | admin@school.edu.gh             | ChangeMe123!   |
| Teacher (HOD, Computer Hardware & Software) | teacher.demo@school.edu.gh | Teacher123! |
| Student (Computer Hardware & Software)      | student.demo@school.edu.gh | Student123! |

**Change the seeded passwords before using this anywhere real.**

## 2. Serve the frontend

The frontend is static — no build step. Easiest option, from the `frontend/` folder:

```bash
cd frontend
python3 -m http.server 5173
# open http://localhost:5173
```

(Any static file server works — `npx serve`, VS Code Live Server, nginx, etc.)

If your backend runs somewhere other than `http://localhost:4000`, set it before the other
scripts load by adding this line near the top of each HTML file's `<script>` block, or simply
edit `API_BASE` at the top of `frontend/js/api.js`:

```html
<script>window.API_BASE = 'https://your-api-domain.com/api';</script>
```

## 3. Connect Paystack (optional — dev mode works without it)

Get your keys from the [Paystack dashboard](https://dashboard.paystack.com/#/settings/developer)
and set `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` in `backend/.env`. Until you do, the "Pay
for voucher" button on the student dashboard runs in **dev mode**: it skips the real charge and
lets you click "Simulate successful payment" to test the voucher → grade-unlock flow end to end.

## How the pieces map to your brief

| Your notes | Where it lives |
|---|---|
| Landing page (signup/login) | `frontend/index.html` |
| Student dashboard: profile, grade checker, attendance, events, announcements | `frontend/student.html` + `/api/student/*` |
| Teacher: upload grades, mark attendance, upload material, give assignments | `frontend/teacher.html` + `/api/teacher/*` |
| Head of Department (a teacher flag) | `is_hod` on the teacher account, unlocks the "Department Overview" tab |
| Admin: register students/teachers (issue IDs), post events/announcements, see all grades | `frontend/admin.html` + `/api/admin/*` |
| Voucher-gated grade checking via Paystack | `backend/routes/payments.js` + `backend/routes/students.js` |
| .xlsx grade upload → database | `POST /api/teacher/grades/import` (uses the `xlsx` package; expects columns `student_id, subject, term, score`) |
| 14 departments from `departments.md` | Seeded in `backend/db/seed.js` |
| Login as Student / Facilitator (+HOD) / Administrator | Role picker on `index.html`, enforced server-side by JWT + role checks |

## Project structure

```
backend/
  server.js            Express app entry point
  db/
    schema.sql          Full SQLite schema
    index.js            DB connection + auto-migrate on boot
    seed.js              Departments + default accounts
  routes/                auth, students, teachers, admin, payments, general (announcements/events)
  middleware/auth.js     JWT verification + role guard
  utils/ids.js           System ID + voucher code generation
  uploads/                Uploaded materials land here, served at /uploads/*

frontend/
  index.html, student.html, teacher.html, admin.html
  css/style.css           Shared "drafting sheet" design system
  js/api.js                Shared API client, session handling, toasts
  js/{student,teacher,admin}.js   Per-dashboard logic
```

## Security notes before going live

- Set a long, random `JWT_SECRET`.
- Put the backend behind HTTPS; browsers will otherwise block Paystack redirects and cookies.
- The `uploads/` folder currently accepts any file type up to 15MB — restrict this
  (`multer` `fileFilter`) if you expose it publicly.
- Passwords are hashed with bcrypt; never log or store them in plaintext elsewhere.
- Consider adding rate limiting (`express-rate-limit`) to `/api/auth/login` before production use.
