// src/utils/money.js
// Money is stored as whole numbers of the smallest unit (kobo for naira). Never as decimals.

// "15000" -> 1500000, "15000.5" -> 1500050, "0.01" -> 1. Input must already be checked: digits with up to 2 decimals.
function toMinorUnits(amountText) {
  const [whole, decimals = ''] = String(amountText).split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}

// 1500000 -> "15000.00"
function formatMajor(minorUnits) {
  const whole = Math.floor(minorUnits / 100);
  const fraction = String(minorUnits % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

module.exports = { toMinorUnits, formatMajor };