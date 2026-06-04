#!/usr/bin/env node
// Apply A-type !important removal from scripts/.important-audit.json.
// Args:
//   --sections=01,28,37  → only these sections
//   --sections=all       → every A-type entry
//   --dry-run            → preview without writing
//   --limit=N            → cap deletions (safety)
// Default: dry-run, no sections selected.

const fs = require('fs');
const CSS = 'assets/styles.css';
const auditPath = 'scripts/.important-audit.json';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.map(a => {
  const m = a.match(/^--([\w-]+)(?:=(.+))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : null;
}).filter(Boolean));

const dryRun = flags['dry-run'] === true || flags['dry-run'] === 'true';
const sectionsArg = flags.sections;
const limit = flags.limit ? parseInt(flags.limit) : Infinity;

if (!sectionsArg) {
  console.error(`Usage: node scripts/important-apply.cjs --sections=28,37 [--dry-run] [--limit=N]`);
  process.exit(1);
}

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const raw = fs.readFileSync(CSS, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

// Build line→section map.
const sectionByLine = new Array(lines.length).fill('?');
let cur = '?';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*SECTION (\d+) — (.+?)\s*$/);
  if (m) cur = m[1]; // store id only
  sectionByLine[i] = cur;
}

const wantedSections = sectionsArg === 'all'
  ? null
  : new Set(sectionsArg.split(',').map(s => s.trim().padStart(2, '0')));

// Dedupe by (declLine, prop): an A-type entry may appear multiple times if
// a rule has comma-separated selectors. We only need to touch each (line, prop)
// once.
const seen = new Set();
const targets = [];
for (const e of audit.aType) {
  const key = `${e.declLine}|${e.prop}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const secId = sectionByLine[e.declLine - 1];
  if (wantedSections && !wantedSections.has(secId)) continue;
  targets.push({ line: e.declLine, prop: e.prop, valSample: e.valSample, selector: e.selectorRaw, sectionId: secId });
}
targets.sort((a, b) => b.line - a.line); // bottom-up to keep line numbers stable

const toApply = targets.slice(0, limit);

let modified = 0;
const errors = [];
const previews = [];

for (const t of toApply) {
  const idx = t.line - 1;
  const line = lines[idx];
  // Match `prop : value !important` — handle whitespace around prop.
  const propEsc = t.prop.replace(/[-]/g, '\\-');
  const re = new RegExp(`(^\\s*${propEsc}\\s*:[^;]*?)\\s*!important\\b`, 'i');
  if (!re.test(line)) {
    errors.push(`L${t.line} "${t.prop}": pattern not found in line "${line.slice(0, 80)}..."`);
    continue;
  }
  const newLine = line.replace(re, '$1');
  if (newLine === line) {
    errors.push(`L${t.line} "${t.prop}": replace was a no-op`);
    continue;
  }
  previews.push(`L${t.line} S${t.sectionId} ${t.prop}: ${t.valSample}`);
  if (!dryRun) lines[idx] = newLine;
  modified++;
}

if (errors.length) {
  console.error(`ERRORS (${errors.length}):`);
  errors.forEach(e => console.error('  ' + e));
}

console.log(`${dryRun ? '[DRY RUN] ' : ''}Modified: ${modified} declarations across sections [${sectionsArg}]`);
if (dryRun) {
  console.log(`\nPreview (first 30):`);
  previews.slice(0, 30).forEach(p => console.log('  ' + p));
  if (previews.length > 30) console.log(`  ... +${previews.length - 30} more`);
} else {
  fs.writeFileSync(CSS, lines.join(EOL), 'utf8');
  console.log(`Wrote ${CSS}`);
}
