const crypto = require('crypto');

/** Generate a system ID like STU-2026-7F3K9Q */
function genId(prefix) {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `${prefix}-${year}-${rand}`;
}

/** Generate a voucher code like VC-9K2X-7QRT-4LPZ */
function genVoucherCode() {
  const block = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VC-${block()}-${block()}-${block()}`;
}

module.exports = { genId, genVoucherCode };
