#!/usr/bin/env node
/**
 * Legacy Data Migration Pipeline
 * ------------------------------
 * Cleans, normalizes, and deduplicates a messy legacy CSV export,
 * producing Airtable-ready records plus a data-quality report.
 *
 *   node migrate.js legacy_export.csv
 *
 * Outputs:
 *   clean.json    — normalized, deduplicated records ready for import
 *   rejects.json  — rows that failed validation, each with the reason
 *   report.json   — counts of every fix applied (the client-facing artifact)
 *
 * Design notes:
 *  - Dedupe key is the normalized email; on collision, records MERGE
 *    (most complete field wins) rather than first-wins — legacy exports
 *    often split one client's data across duplicate rows.
 *  - Every normalization is counted. The report is the deliverable that
 *    tells a client exactly what was wrong with their data, with numbers.
 */

const fs = require('fs');

// ---- Tiny CSV parser (no dependencies; handles quoted fields) ---------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (field || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// ---- Normalizers (each returns [value, wasFixed]) ---------------------------
const stats = {};
const count = k => { stats[k] = (stats[k] || 0) + 1; };

function normName(raw) {
  let name = raw.trim();
  if (name !== raw) count('whitespace_trimmed');
  if (name.includes(',')) {                    // "Last, First" -> "First Last"
    const [l, f] = name.split(',').map(s => s.trim());
    name = `${f} ${l}`;
    count('name_order_flipped');
  }
  const titled = name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  if (titled !== name) count('name_case_fixed');
  return titled;
}

function normEmail(raw) {
  const email = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (email !== raw) count('email_normalized');
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return [email, valid];
}

function normPhone(raw) {
  const digits = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (!digits) return '';
  if (digits.length !== 10) { count('phone_invalid_dropped'); return ''; }
  const formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (formatted !== raw) count('phone_reformatted');
  return formatted;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function normDate(raw) {
  const s = raw.trim();
  if (!s) return '';
  let y, m, d;
  let match;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, m, d] = match;
  else if ((match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/))) [, m, d, y] = match;
  else if ((match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/))) { [, m, d, y] = match; y = `20${y}`; }
  else if ((match = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})$/))) { [, d, , y] = match; m = MONTHS[match[2].toLowerCase()]; }
  else { count('date_unparseable_dropped'); return ''; }
  m = +m; d = +d; y = +y;
  if (m < 1 || m > 12 || d < 1 || d > 31) { count('date_unparseable_dropped'); return ''; }
  if (`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` !== s) count('date_normalized');
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const STATUS_MAP = { open: 'Open', closed: 'Closed', pending: 'Pending' };
function normStatus(raw) {
  const status = STATUS_MAP[raw.trim().toLowerCase()] || '';
  if (status && status !== raw.trim()) count('status_case_fixed');
  if (!status && raw.trim()) count('status_unknown_dropped');
  return status;
}

// ---- Pipeline ---------------------------------------------------------------
const file = process.argv[2] || 'legacy_export.csv';
const rows = parseCSV(fs.readFileSync(file, 'utf8'));
const rejects = [];
const byEmail = new Map();

const JUNK = /^(test|zzz|do not use|n\/a|none|xxx)/i;

for (const raw of rows) {
  const name = normName(raw.client_name || '');
  const [email, emailValid] = normEmail(raw.email || '');

  if (!name || JUNK.test(name)) { rejects.push({ raw, reason: 'junk or empty name' }); continue; }
  if (!emailValid) { rejects.push({ raw, reason: `invalid email: '${raw.email}'` }); continue; }

  const record = {
    'Client Name': name,
    'Email': email,
    'Phone': normPhone(raw.phone || ''),
    'Matter Type': (raw.matter_type || '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
    'Opened Date': normDate(raw.opened_date || ''),
    'Status': normStatus(raw.status || ''),
    'Matter Ref': (raw.matter_ref || '').trim(),
  };

  if (byEmail.has(email)) {
    // Merge: keep the most complete value for every field.
    count('duplicate_merged');
    const kept = byEmail.get(email);
    for (const k of Object.keys(record)) {
      if (!kept[k] && record[k]) kept[k] = record[k];
    }
  } else {
    byEmail.set(email, record);
  }
}

const clean = [...byEmail.values()];
fs.writeFileSync('clean.json', JSON.stringify(clean, null, 2));
fs.writeFileSync('rejects.json', JSON.stringify(rejects, null, 2));
const report = {
  source_rows: rows.length,
  clean_records: clean.length,
  rejected_rows: rejects.length,
  duplicates_merged: stats.duplicate_merged || 0,
  fixes_applied: stats,
};
fs.writeFileSync('report.json', JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
