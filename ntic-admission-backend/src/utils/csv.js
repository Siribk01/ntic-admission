// src/utils/csv.js
// Reading and writing CSV (comma-separated values), the format Excel opens and saves.

// Reads CSV text into an array of rows (each row an array of strings).
// Handles quoted cells, commas and line breaks inside quotes, "" as an escaped quote, and a leading byte-order mark.
function parseCsv(text) {
  const input = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { cell += '"'; i += 1; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (inQuotes) throw new Error('A quoted cell is never closed');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  // Ignore completely empty lines (a trailing newline, or blank lines between rows)
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// One cell of output. Cells that start with = + - @ would be run as a formula by Excel, so they are prefixed with an
// apostrophe. (A name or note typed by a parent could otherwise run code on a staff member's computer.)
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { parseCsv, toCsv, csvCell };
