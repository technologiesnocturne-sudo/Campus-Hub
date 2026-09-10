const user = Session.requireRole('teacher');
let myStudents = [];

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => switchView(link.dataset.view));
});
function switchView(view) {
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${view}`));
  const loader = { attendance: renderAttendanceTable, materials: loadMaterials, assignments: loadAssignments, hod: loadHod, announcements: loadAnnouncements };
  if (loader[view]) loader[view]();
}

(async function init() {
  if (user) {
    document.getElementById('sidebarProfile').innerHTML = `<div class="id-tag">${escapeHtml(user.identifier)}</div><div class="mt-8">${escapeHtml(user.fullName)}</div>`;
    document.getElementById('welcomeTitle').textContent = `Welcome back, ${user.fullName.split(' ')[0]}`;
    if (user.isHod) {
      document.getElementById('roleTag').textContent = 'Facilitator · HOD';
      document.getElementById('hodNavGroup').style.display = '';
    }
  }
  document.getElementById('attDate').value = new Date().toISOString().slice(0, 10);

  try {
    const { profile } = await api('/teacher/profile');
    document.getElementById('deptSubtitle').textContent = `${profile.department_name} (${profile.department_code})`;
  } catch (err) { toast(err.message, 'error'); }

  try {
    const { students } = await api('/teacher/students');
    myStudents = students;
    document.getElementById('statStudents').textContent = students.length;
    const select = document.getElementById('gStudent');
    select.innerHTML = students.map((s) => `<option value="${s.id}">${escapeHtml(s.full_name)} — ${escapeHtml(s.identifier)}</option>`).join('') || '<option value="">No students in department yet</option>';
  } catch (err) { toast(err.message, 'error'); }

  loadStatCounts();
})();

async function loadStatCounts() {
  try {
    const { materials } = await api('/teacher/materials');
    document.getElementById('statMaterials').textContent = materials.length;
  } catch (err) {}
  try {
    const { assignments } = await api('/teacher/assignments');
    document.getElementById('statAssignments').textContent = assignments.length;
  } catch (err) {}
}

// ---------- Grades: manual entry ----------
document.getElementById('gradeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/teacher/grades', {
      method: 'POST',
      body: {
        studentId: Number(document.getElementById('gStudent').value),
        subject: document.getElementById('gSubject').value,
        term: document.getElementById('gTerm').value,
        score: Number(document.getElementById('gScore').value),
      },
    });
    toast('Grade saved.', 'success');
    document.getElementById('gSubject').value = '';
    document.getElementById('gScore').value = '';
  } catch (err) { toast(err.message, 'error'); }
});

// ---------- Grades: bulk xlsx import ----------
document.getElementById('importBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('xlsxFile');
  if (!fileInput.files.length) return toast('Choose a .xlsx file first.', 'error');
  const btn = document.getElementById('importBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Importing…';
  try {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    const result = await api('/teacher/grades/import', { method: 'POST', body: formData, isForm: true });
    document.getElementById('importResult').innerHTML = `
      <div class="badge ok"><span class="badge-dot"></span>${result.inserted} row(s) imported</div>
      ${result.skipped.length ? `<div class="mt-8 faint">${result.skipped.length} row(s) skipped:</div>
        <ul class="dim mt-8" style="padding-left:18px">${result.skipped.slice(0, 10).map((s) => `<li>Row ${s.row}: ${escapeHtml(s.reason)}</li>`).join('')}</ul>` : ''}
    `;
    toast(`Imported ${result.inserted} grade row(s).`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Import spreadsheet';
  }
});

// ---------- Attendance ----------
function renderAttendanceTable() {
  const body = document.getElementById('attendanceTableBody');
  if (!myStudents.length) {
    body.innerHTML = `<tr><td colspan="3" class="faint">No students in your department yet.</td></tr>`;
    return;
  }
  body.innerHTML = myStudents.map((s) => `
    <tr data-student="${s.id}">
      <td>${escapeHtml(s.full_name)}</td>
      <td class="mono">${escapeHtml(s.identifier)}</td>
      <td>
        <select class="att-status" style="max-width:140px">
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
        </select>
      </td>
    </tr>`).join('');
}

document.getElementById('attDate').addEventListener('change', () => {
  // no-op trigger point; statuses are read at save time via the button below
});

// Add a save-all button dynamically under the table (kept in JS to keep markup lean)
(function addAttendanceSaveButton() {
  const section = document.getElementById('view-attendance');
  const panel = section.querySelector('.panel');
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary mt-16';
  btn.textContent = 'Save attendance for this date';
  btn.addEventListener('click', async () => {
    const date = document.getElementById('attDate').value;
    if (!date) return toast('Choose a date.', 'error');
    const rows = [...document.querySelectorAll('#attendanceTableBody tr[data-student]')];
    if (!rows.length) return toast('No students to mark.', 'error');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      for (const row of rows) {
        const studentId = Number(row.dataset.student);
        const status = row.querySelector('.att-status').value;
        await api('/teacher/attendance', { method: 'POST', body: { studentId, date, status } });
      }
      toast('Attendance saved.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save attendance for this date';
    }
  });
  panel.appendChild(btn);
})();

// ---------- Materials ----------
document.getElementById('materialForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('matFile');
  if (!fileInput.files.length) return toast('Choose a file.', 'error');
  try {
    const formData = new FormData();
    formData.append('title', document.getElementById('matTitle').value);
    formData.append('file', fileInput.files[0]);
    await api('/teacher/materials', { method: 'POST', body: formData, isForm: true });
    toast('Material uploaded.', 'success');
    document.getElementById('materialForm').reset();
    loadMaterials();
    loadStatCounts();
  } catch (err) { toast(err.message, 'error'); }
});

async function loadMaterials() {
  try {
    const { materials } = await api('/teacher/materials');
    document.getElementById('materialsGrid').innerHTML = materials.length
      ? materials.map((m) => `<div class="panel">
          <div class="sheet-label">${fmtDate(m.created_at)}</div>
          <strong>${escapeHtml(m.title)}</strong>
          <div class="mt-16"><a href="${API_BASE.replace('/api','')}${m.file_path}" target="_blank" class="btn btn-sm">Download</a></div>
        </div>`).join('')
      : `<div class="empty-state"><div class="glyph">—</div>You haven't uploaded any material yet.</div>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Assignments ----------
document.getElementById('assignmentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/teacher/assignments', {
      method: 'POST',
      body: {
        title: document.getElementById('asgTitle').value,
        description: document.getElementById('asgDesc').value,
        dueDate: document.getElementById('asgDue').value || null,
      },
    });
    toast('Assignment posted.', 'success');
    document.getElementById('assignmentForm').reset();
    loadAssignments();
    loadStatCounts();
  } catch (err) { toast(err.message, 'error'); }
});

async function loadAssignments() {
  try {
    const { assignments } = await api('/teacher/assignments');
    document.getElementById('assignmentsGrid').innerHTML = assignments.length
      ? assignments.map((a) => `<div class="panel">
          <div class="sheet-label">${a.due_date ? `DUE ${fmtDate(a.due_date)}` : 'NO DEADLINE'}</div>
          <strong>${escapeHtml(a.title)}</strong>
          <p class="dim mt-8">${escapeHtml(a.description || '')}</p>
        </div>`).join('')
      : `<div class="empty-state"><div class="glyph">—</div>No assignments posted yet.</div>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- HOD ----------
async function loadHod() {
  if (!user.isHod) return;
  try {
    const { teachers, students } = await api('/teacher/department-overview');
    document.getElementById('hodTeachersBody').innerHTML = teachers.map((t) => `<tr><td>${escapeHtml(t.full_name)}</td><td class="mono">${escapeHtml(t.identifier)}</td></tr>`).join('') || `<tr><td colspan="2" class="faint">No facilitators yet.</td></tr>`;
    document.getElementById('hodStudentsBody').innerHTML = students.map((s) => `<tr><td>${escapeHtml(s.full_name)}</td><td class="mono">${escapeHtml(s.identifier)}</td></tr>`).join('') || `<tr><td colspan="2" class="faint">No students yet.</td></tr>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Announcements ----------
async function loadAnnouncements() {
  try {
    const { announcements } = await api('/announcements');
    document.getElementById('announcementsList').innerHTML = announcements.length
      ? announcements.map((a) => `<div class="panel mt-16">
          <div class="flex-between"><strong>${escapeHtml(a.title)}</strong><span class="faint">${fmtDate(a.created_at)}</span></div>
          <p class="dim mt-8">${escapeHtml(a.body)}</p>
        </div>`).join('')
      : `<div class="empty-state"><div class="glyph">—</div>No announcements yet.</div>`;
  } catch (err) { toast(err.message, 'error'); }
}
