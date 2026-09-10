// Shared API client, session helpers, and toast notifications used across all pages.

const API_BASE = window.API_BASE || 'http://localhost:4000/api';

const Session = {
  get token() { return localStorage.getItem('sms_token'); },
  get user() {
    try { return JSON.parse(localStorage.getItem('sms_user') || 'null'); } catch { return null; }
  },
  set(token, user) {
    localStorage.setItem('sms_token', token);
    localStorage.setItem('sms_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('sms_token');
    localStorage.removeItem('sms_user');
  },
  requireRole(role) {
    const user = Session.user;
    if (!Session.token || !user || user.role !== role) {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  },
};

async function api(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (Session.token) headers['Authorization'] = `Bearer ${Session.token}`;

  let resp;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error('Could not reach the server. Is the backend running?');
  }

  let data = null;
  const text = await resp.text();
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }

  if (!resp.ok) {
    if (resp.status === 401) {
      Session.clear();
      if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
        window.location.href = 'index.html';
      }
    }
    throw new Error((data && data.error) || `Request failed (${resp.status}).`);
  }
  return data;
}

function toast(message, type = 'info') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function fmtMoney(pesewas) {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function logout() {
  Session.clear();
  window.location.href = 'index.html';
}
