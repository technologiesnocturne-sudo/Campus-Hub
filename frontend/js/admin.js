const user = Session.requireRole('admin');
let departmentsCache = [];

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => switchView(link.dataset.view));
});
function switchView(view) {
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${view}`));
  const loader = { users: loadUsers, departments: loadDepartments, grades: loadGrades, payments: loadPayments, announcements: loadAnnouncements, events: loadEvents };
  if (loader[view]) loader[view]();
}

(async function init() {
  if (user) {
    document.getElementById('sidebarProfile').innerHTML = `<div class="id-tag">${escapeHtml(user.identifier)}</div><div class="mt-8">${escapeHtml(user.fullName)}</div>`;
  }
  try {
    const { departments } = await api('/departments');
    departmentsCache = departments;
    const regSelect = document.getElementById('regDept');
    regSelect.innerHTML = departments.map((d) => `<option value="${d.id}">${escapeHtml(d.name)} (${d.code})</option>`).join('');
  } catch (err) { toast(err.message, 'error'); }

  loadOverview();
})();

async function loadOverview() {
  try {
    const { counts } = await api('/admin/overview');
    document.getElementById('cStudents').textContent = counts.students;
    document.getElementById('cTeachers').textContent = counts.teachers;
    document.getElementById('cDepartments').textContent = counts.departments;
    document.getElementById('cGrades').textContent = counts.gradesRecorded;
    document.getElementById('cVouchers').textContent = counts.vouchersSold;
    document.getElementById('cRevenue').textContent = fmtMoney(counts.revenuePesewas);
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Register ----------
let regRole = 'student';
document.querySelectorAll('#regRolePicker .role-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#regRolePicker .role-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    regRole = pill.dataset.role;
    document.getElementById('hodField').style.display = regRole === 'teacher' ? '' : 'none';
  });
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = {
      role: regRole,
      fullName: document.getElementById('regName').value,
      email: document.getElementById('regEmail').value,
      departmentId: Number(document.getElementById('regDept').value),
      password: document.getElementById('regPassword').value,
      isHod: document.getElementById('regIsHod').checked,
    };
    const res = await api('/admin/register', { method: 'POST', body });
    document.getElementById('registerResult').innerHTML = `
      <div class="badge ok"><span class="badge-dot"></span>Account created</div>
      <p class="mt-8">Issued ID:</p><div class="id-tag mt-8">${escapeHtml(res.identifier)}</div>
      <p class="faint mt-8">Share this ID and the initial password with them directly — it isn't emailed automatically.</p>`;
    toast(`${regRole === 'student' ? 'Student' : 'Facilitator'} registered.`, 'success');
    document.getElementById('registerForm').reset();
    loadOverview();
  } catch (err) { toast(err.message, 'error'); }
});

// ---------- Users ----------
document.getElementById('userFilterRole').addEventListener('change', loadUsers);
async function loadUsers() {
  try {
    const role = document.getElementById('userFilterRole').value;
    const { users } = await api(`/admin/users${role ? `?role=${role}` : ''}`);
    document.getElementById('usersBody').innerHTML = users.length
      ? users.map((u) => `<tr>
          <td>${escapeHtml(u.full_name)}${u.is_hod ? ' <span class="badge warn">HOD</span>' : ''}</td>
          <td class="mono">${escapeHtml(u.identifier)}</td>
          <td>${escapeHtml(u.role)}</td>
          <td>${escapeHtml(u.department_name || '—')}</td>
          <td class="dim">${escapeHtml(u.email)}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="faint">No users found.</td></tr>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Departments ----------
async function loadDepartments() {
  try {
    const { departments } = await api('/admin/departments');
    document.getElementById('departmentsGrid').innerHTML = departments.map((d) => `
      <div class="panel">
        <div class="sheet-label">${escapeHtml(d.code)}</div>
        <strong>${escapeHtml(d.name)}</strong>
        <div class="flex gap-16 mt-16">
          <div><div class="stat-label">Students</div><div class="stat-value" style="font-size:20px">${d.student_count}</div></div>
          <div><div class="stat-label">Facilitators</div><div class="stat-value" style="font-size:20px">${d.teacher_count}</div></div>
        </div>
      </div>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Grades ----------
async function loadGrades() {
  try {
    const { grades } = await api('/admin/grades');
    document.getElementById('allGradesBody').innerHTML = grades.length
      ? grades.map((g) => `<tr>
          <td>${escapeHtml(g.student)}</td><td class="mono">${escapeHtml(g.identifier)}</td>
          <td>${escapeHtml(g.subject)}</td><td>${escapeHtml(g.term)}</td><td>${g.score}</td>
          <td><span class="badge ${g.grade_letter === 'F' ? 'bad' : g.grade_letter === 'A' ? 'ok' : 'warn'}">${g.grade_letter}</span></td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="faint">No grades recorded yet.</td></tr>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Payments ----------
async function loadPayments() {
  try {
    const { payments } = await api('/admin/payments');
    document.getElementById('paymentsBody').innerHTML = payments.length
      ? payments.map((p) => `<tr>
          <td class="mono">${escapeHtml(p.reference)}</td>
          <td>${escapeHtml(p.student)} <span class="faint">(${escapeHtml(p.identifier)})</span></td>
          <td>${fmtMoney(p.amount_pesewas)}</td>
          <td><span class="badge ${p.status === 'success' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}">${p.status}</span></td>
          <td class="faint">${fmtDate(p.created_at)}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="faint">No payments yet.</td></tr>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Announcements ----------
document.getElementById('announceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/announcements', {
      method: 'POST',
      body: { title: document.getElementById('anTitle').value, body: document.getElementById('anBody').value, audience: document.getElementById('anAudience').value },
    });
    toast('Announcement posted.', 'success');
    document.getElementById('announceForm').reset();
    loadAnnouncements();
  } catch (err) { toast(err.message, 'error'); }
});

async function loadAnnouncements() {
  try {
    const { announcements } = await api('/announcements');
    document.getElementById('announcementsList').innerHTML = announcements.length
      ? announcements.map((a) => `<div class="panel mt-16">
          <div class="flex-between"><strong>${escapeHtml(a.title)}</strong><span class="faint">${fmtDate(a.created_at)} · ${escapeHtml(a.audience)}</span></div>
          <p class="dim mt-8">${escapeHtml(a.body)}</p>
        </div>`).join('')
      : `<div class="empty-state"><div class="glyph">—</div>No announcements yet.</div>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Events ----------
document.getElementById('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/events', {
      method: 'POST',
      body: { title: document.getElementById('evTitle').value, description: document.getElementById('evDesc').value, eventDate: document.getElementById('evDate').value },
    });
    toast('Event added.', 'success');
    document.getElementById('eventForm').reset();
    loadEvents();
  } catch (err) { toast(err.message, 'error'); }
});

async function loadEvents() {
  try {
    const { events } = await api('/events');
    document.getElementById('eventsList').innerHTML = events.length
      ? events.map((e) => `<div class="panel mt-16">
          <div class="flex-between"><strong>${escapeHtml(e.title)}</strong><span class="badge warn">${fmtDate(e.event_date)}</span></div>
          <p class="dim mt-8">${escapeHtml(e.description || '')}</p>
        </div>`).join('')
      : `<div class="empty-state"><div class="glyph">—</div>No events scheduled.</div>`;
  } catch (err) { toast(err.message, 'error'); }
}
