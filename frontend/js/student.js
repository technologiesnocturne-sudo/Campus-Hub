const user = Session.requireRole('student');

// ---------- Navigation ----------
document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => switchView(link.dataset.view));
});
function switchView(view) {
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${view}`));
  const loader = { grades: loadVouchers, attendance: loadAttendance, materials: loadMaterials, assignments: loadAssignments, announcements: loadAnnouncements, events: loadEvents };
  if (loader[view]) loader[view]();
}

// ---------- Bootstrap ----------
(async function init() {
  if (user) {
    document.getElementById('sidebarProfile').innerHTML = `<div class="id-tag">${escapeHtml(user.identifier)}</div><div class="mt-8">${escapeHtml(user.fullName)}</div>`;
    document.getElementById('welcomeTitle').textContent = `Welcome back, ${user.fullName.split(' ')[0]}`;
    document.getElementById('statId').textContent = user.identifier;
  }
  try {
    const { profile } = await api('/student/profile');
    document.getElementById('statDept').textContent = profile.department_name || '—';
  } catch (err) { toast(err.message, 'error'); }

  loadAttendanceSummary();
  loadVoucherCount();
  loadDashboardFeeds();

  // Resume a Paystack redirect if we came back with a reference in the URL.
  const params = new URLSearchParams(window.location.search);
  if (params.get('paystack_callback') && localStorage.getItem('pending_ref')) {
    const ref = localStorage.getItem('pending_ref');
    const term = localStorage.getItem('pending_term');
    await verifyPayment(ref, term, false);
  }
})();

async function loadAttendanceSummary() {
  try {
    const { summary } = await api('/student/attendance');
    document.getElementById('statAttendance').textContent = `${summary.rate}%`;
  } catch (err) { /* non-fatal on dashboard */ }
}

async function loadVoucherCount() {
  try {
    const { vouchers } = await api('/student/vouchers');
    document.getElementById('statVouchers').textContent = vouchers.filter((v) => !v.is_used).length;
  } catch (err) { /* non-fatal */ }
}

async function loadDashboardFeeds() {
  try {
    const { announcements } = await api('/announcements');
    const box = document.getElementById('dashAnnouncements');
    box.innerHTML = announcements.slice(0, 4).map((a) => `
      <div class="mt-16">
        <div class="flex-between"><strong>${escapeHtml(a.title)}</strong><span class="faint">${fmtDate(a.created_at)}</span></div>
        <div class="dim mt-8">${escapeHtml(a.body)}</div>
      </div>`).join('') || `<div class="empty-state"><div class="glyph">—</div>No announcements yet.</div>`;
  } catch (err) { toast(err.message, 'error'); }

  try {
    const { events } = await api('/events');
    const box = document.getElementById('dashEvents');
    box.innerHTML = events.slice(0, 4).map((e) => `
      <div class="mt-16">
        <div class="flex-between"><strong>${escapeHtml(e.title)}</strong><span class="badge warn">${fmtDate(e.event_date)}</span></div>
        <div class="dim mt-8">${escapeHtml(e.description || '')}</div>
      </div>`).join('') || `<div class="empty-state"><div class="glyph">—</div>No events scheduled.</div>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Grade Checker / Payments ----------
document.getElementById('payBtn').addEventListener('click', async () => {
  const term = document.getElementById('voucherTerm').value;
  const btn = document.getElementById('payBtn');
  const statusBox = document.getElementById('payStatus');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Starting payment…';
  try {
    const res = await api('/payments/initialize', { method: 'POST', body: { term } });
    if (res.mode === 'live') {
      localStorage.setItem('pending_ref', res.reference);
      localStorage.setItem('pending_term', term);
      window.location.href = res.authorizationUrl;
      return;
    }
    // Dev mode — no live Paystack key configured on the server.
    statusBox.innerHTML = `<div class="badge warn"><span class="badge-dot"></span>Dev mode — no live Paystack key set</div>
      <p class="dim mt-8">Amount due: ${fmtMoney(res.amount)}. Click below to simulate a completed payment.</p>
      <button class="btn btn-primary btn-block mt-8" id="simulateBtn">Simulate successful payment</button>`;
    document.getElementById('simulateBtn').addEventListener('click', () => verifyPayment(res.reference, term, true));
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Pay for voucher';
  }
});

async function verifyPayment(reference, term, simulate) {
  try {
    const res = await api(`/payments/verify/${encodeURIComponent(reference)}`, { method: 'POST', body: { term, simulate } });
    localStorage.removeItem('pending_ref');
    localStorage.removeItem('pending_term');
    toast(`Payment confirmed. Your voucher code is ${res.voucherCode}`, 'success');
    document.getElementById('payStatus').innerHTML = `<div class="badge ok"><span class="badge-dot"></span>Payment confirmed</div>
      <p class="mt-8">Your voucher code:</p><div class="id-tag voucher-code mt-8">${escapeHtml(res.voucherCode)}</div>`;
    loadVoucherCount();
    loadVouchers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('redeemBtn').addEventListener('click', async () => {
  const code = document.getElementById('voucherInput').value.trim();
  if (!code) return toast('Enter a voucher code first.', 'error');
  const btn = document.getElementById('redeemBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Checking…';
  try {
    const { term, grades } = await api('/student/grades/unlock', { method: 'POST', body: { code } });
    const panel = document.getElementById('gradeReportPanel');
    panel.style.display = 'block';
    document.getElementById('gradeReportTerm').textContent = `Term: ${term}`;
    document.getElementById('gradeReportBody').innerHTML = grades.length
      ? grades.map((g) => `<tr><td>${escapeHtml(g.subject)}</td><td>${g.score}</td><td><span class="badge ${g.grade_letter === 'F' ? 'bad' : g.grade_letter === 'A' ? 'ok' : 'warn'}">${g.grade_letter}</span></td></tr>`).join('')
      : `<tr><td colspan="3" class="faint">No grades have been recorded for this term yet — check back after your facilitators upload results.</td></tr>`;
    panel.scrollIntoView({ behavior: 'smooth' });
    loadVoucherCount();
    loadVouchers();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Unlock grades';
  }
});

async function loadVouchers() {
  try {
    const { vouchers } = await api('/student/vouchers');
    document.getElementById('voucherHistoryBody').innerHTML = vouchers.length
      ? vouchers.map((v) => `<tr>
          <td class="mono">${escapeHtml(v.code)}</td>
          <td>${escapeHtml(v.term)}</td>
          <td>${v.is_used ? '<span class="badge bad">Used</span>' : '<span class="badge ok">Available</span>'}</td>
          <td class="faint">${fmtDate(v.created_at)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" class="faint">No vouchers purchased yet.</td></tr>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Attendance ----------
async function loadAttendance() {
  try {
    const { attendance } = await api('/student/attendance');
    document.getElementById('attendanceBody').innerHTML = attendance.length
      ? attendance.map((a) => `<tr><td>${a.date}</td><td><span class="badge ${a.status === 'present' ? 'ok' : a.status === 'late' ? 'warn' : 'bad'}">${a.status}</span></td></tr>`).join('')
      : `<tr><td colspan="2" class="faint">No attendance marked yet.</td></tr>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Materials ----------
async function loadMaterials() {
  try {
    const { materials } = await api('/student/materials');
    document.getElementById('materialsGrid').innerHTML = materials.length
      ? materials.map((m) => `<div class="panel">
          <div class="sheet-label">${escapeHtml(m.teacher)}</div>
          <strong>${escapeHtml(m.title)}</strong>
          <div class="mt-16"><a href="${API_BASE.replace('/api','')}${m.file_path}" target="_blank" class="btn btn-sm">Download</a></div>
        </div>`).join('')
      : `<div class="empty-state"><div class="glyph">—</div>No material uploaded yet.</div>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Assignments ----------
async function loadAssignments() {
  try {
    const { assignments } = await api('/student/assignments');
    document.getElementById('assignmentsGrid').innerHTML = assignments.length
      ? assignments.map((a) => `<div class="panel">
          <div class="sheet-label">DUE ${a.due_date ? fmtDate(a.due_date) : 'NO DEADLINE'}</div>
          <strong>${escapeHtml(a.title)}</strong>
          <p class="dim mt-8">${escapeHtml(a.description || '')}</p>
          <div class="faint mt-8">Set by ${escapeHtml(a.teacher)}</div>
        </div>`).join('')
      : `<div class="empty-state"><div class="glyph">—</div>No assignments posted yet.</div>`;
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Announcements / Events ----------
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
