const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { genVoucherCode } = require('../utils/ids');

const router = express.Router();

const PAYSTACK_BASE = 'https://api.paystack.co';

// Student starts a payment for a grade-check voucher.
router.post('/initialize', requireAuth, requireRole('student'), async (req, res) => {
  const { term } = req.body;
  if (!term) return res.status(400).json({ error: 'Term is required (e.g. "2026-S1").' });

  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const reference = `SCH-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const amount = Number(process.env.VOUCHER_PRICE_PESEWAS || 2000);

  db.prepare(
    `INSERT INTO payments (student_id, reference, amount_pesewas, purpose, status) VALUES (?, ?, ?, 'grade_voucher', 'pending')`
  ).run(student.id, reference, amount);

  if (!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY.includes('xxxx')) {
    // No live key configured — let the frontend fall back to the dev "simulate payment" flow.
    return res.json({ mode: 'dev', reference, amount });
  }

  try {
    const resp = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: student.email,
        amount,
        reference,
        currency: 'GHS',
        callback_url: `${process.env.CLIENT_ORIGIN}/student.html?paystack_callback=1`,
      }),
    });
    const data = await resp.json();
    if (!data.status) return res.status(502).json({ error: data.message || 'Paystack could not start this payment.' });
    res.json({ mode: 'live', reference, authorizationUrl: data.data.authorization_url });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Paystack. Please try again shortly.' });
  }
});

// Verify a payment (called after redirect back from Paystack, or by the dev-mode simulate button).
router.post('/verify/:reference', requireAuth, requireRole('student'), async (req, res) => {
  const { reference } = req.params;
  const { term, simulate } = req.body;
  const payment = db.prepare('SELECT * FROM payments WHERE reference = ? AND student_id = ?').get(reference, req.user.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  if (payment.status === 'success') {
    const voucher = db.prepare('SELECT code FROM vouchers WHERE payment_id = ?').get(payment.id);
    return res.json({ status: 'success', voucherCode: voucher ? voucher.code : null });
  }

  let verified = false;

  if (simulate && (!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY.includes('xxxx'))) {
    // Dev mode only: no real Paystack key configured, so we let the demo proceed without a live charge.
    verified = true;
  } else {
    try {
      const resp = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      });
      const data = await resp.json();
      verified = data.status && data.data && data.data.status === 'success';
    } catch (err) {
      return res.status(502).json({ error: 'Could not reach Paystack to verify this payment.' });
    }
  }

  if (!verified) {
    db.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(payment.id);
    return res.status(402).json({ error: 'Payment was not successful.' });
  }

  const code = genVoucherCode();
  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'success', verified_at = datetime('now') WHERE id = ?").run(payment.id);
    db.prepare(
      'INSERT INTO vouchers (code, student_id, term, payment_id, is_used) VALUES (?, ?, ?, ?, 0)'
    ).run(code, req.user.id, term || 'current', payment.id);
  });
  tx();

  res.json({ status: 'success', voucherCode: code });
});

module.exports = router;
