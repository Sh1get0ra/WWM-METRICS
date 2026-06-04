#!/usr/bin/env node
// Apply paired-important removal from scripts/.paired-important.json.
//
// Categories:
//   C — drop !important from light decl only (no base prop)
//   B — drop !important from light decl only (base prop exists w/o !important)
//   A — drop !important from light decl AND all paired base decls
//
// Args:
//   --cat=C        only category C
//   --cat=B,C      multi
//   --cat=all      A+B+C
//   --dry-run      preview only
//   --limit=N      cap edits
//
// Dedupe by (file, line, prop) within a single run.

const fs = require('fs');

const BASE_PATH = 'assets/styles.css';
const LIGHT_PATH = 'assets/styles-light.css';
const AUDIT = 'scripts/.paired-important.json';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.map(a => {
  const m = a.match(/^--([\w-]+)(?:=(.+))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : null;
}).filter(Boolean));

const dryRun = flags['dry-run'] === true || flags['dry-run'] === 'true';
const limit = flags.limit ? parseInt(flags.limit) : Infinity;
const catFlag = flags.cat || 'C';
const wantCats = catFlag === 'all' ? new Set(['A','B','C']) : new Set(catFlag.split(',').map(s => s.trim()));

const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));

// Build edit list:
//   { file, line, prop, sourceCat, note }
const seen = new Set();
const edits = [];

function addEdit(file, line, prop, cat, note) {
  const key = `${file}|${line}|${prop}`;
  if (seen.has(key)) return;
  seen.add(key);
  edits.push({ file, line, prop, cat, note });
}

if (wantCats.has('C')) {
  for (const e of audit.catC) {
    addEdit(LIGHT_PATH, e.line, e.prop, 'C', `${e.sel.slice(0, 60)} ...`);
  }
}
if (wantCats.has('B')) {
  for (const e of audit.catB) {
    addEdit(LIGHT_PATH, e.line, e.prop, 'B', `${e.sel.slice(0, 60)} ...`);
  }
}
if (wantCats.has('A')) {
  for (const e of audit.catA) {
    addEdit(LIGHT_PATH, e.line, e.prop, 'A-light', `${e.sel.slice(0, 60)} ...`);
    for (const b of e.baseHits) {
      addEdit(BASE_PATH, b.line, b.prop, 'A-base', `${b.sub.slice(0, 60)} ...`);
    }
  }
}

// Group by file, sort each desc by line for stable application.
const byFile = {};
for (const e of edits) {
  if (!byFile[e.file]) byFile[e.file] = [];
  byFile[e.file].push(e);
}
for (const f of Object.keys(byFile)) {
  byFile[f].sort((a, b) => b.line - a.line);
}

let totalApplied = 0;
const errors = [];

for (const file of Object.keys(byFile)) {
  const raw = fs.readFileSync(file, 'utf8');
  const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let applied = 0;

  for (const e of byFile[file]) {
    if (totalApplied >= limit) break;
    const idx = e.line - 1;
    if (idx < 0 || idx >= lines.length) {
      errors.push(`${file}:${e.line} (line out of range)`);
      continue;
    }
    const propEsc = e.prop.replace(/[-]/g, '\\-');
    // Try single-line first.
    const reSingle = new RegExp(`((?<![a-zA-Z0-9_-])${propEsc}\\s*:[^;}]*?)\\s*!important\\b`, 'i');
    if (reSingle.test(lines[idx])) {
      lines[idx] = lines[idx].replace(reSingle, '$1');
      applied++;
      totalApplied++;
      continue;
    }
    // Multi-line: scan forward up to 20 lines for `!important` before next `;` or `}`.
    let found = false;
    for (let j = idx + 1; j < Math.min(idx + 21, lines.length); j++) {
      if (/!important\b/.test(lines[j])) {
        lines[j] = lines[j].replace(/\s*!important\b/, '');
        found = true;
        applied++;
        totalApplied++;
        break;
      }
      if (/[;}]/.test(lines[j])) break;
    }
    if (!found) {
      errors.push(`${file}:${e.line} "${e.prop}" not found: "${lines[idx].slice(0, 80)}"`);
    }
  }

  console.log(`${file}: ${applied} edits`);
  if (!dryRun && applied > 0) {
    fs.writeFileSync(file, lines.join(EOL), 'utf8');
  }
}

if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  errors.slice(0, 20).forEach(e => console.log('  ' + e));
}
console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Total !important removed: ${totalApplied}`);
console.log(`Categories applied: ${[...wantCats].sort().join(',')}`);
