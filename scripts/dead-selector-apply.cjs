#!/usr/bin/env node
// Apply the deletion plan in scripts/.dead-selector-plan.json to assets/styles.css.
// Operation order:
//   1. Sort plan items by startLine DESC so applying later items doesn't shift
//      earlier line numbers.
//   2. FULL_DELETE / FULL_DELETE_KEYFRAMES → splice out [startLine-1 .. endLine-1].
//   3. TRIM → find the opening '{' line at or after startLine, rewrite the
//      prelude to keep only the live selectors. Preserves leading indent of the
//      first prelude line.
//
// Conservative checks:
//   - Verifies prelude text matches what plan recorded (else aborts on that item)
//   - Reports per-item stats; writes file only after all items succeed.

const fs = require('fs');
const CSS = 'assets/styles.css';
const plan = JSON.parse(fs.readFileSync('scripts/.dead-selector-plan.json', 'utf8'));

const raw = fs.readFileSync(CSS, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

const items = [...plan].sort((a, b) => b.startLine - a.startLine);

let deletedRules = 0, deletedKeyframes = 0, trimmed = 0, errors = 0;
let linesRemoved = 0;
const errLog = [];

for (const it of items) {
  const startIdx = it.startLine - 1;
  const endIdx = it.endLine - 1;

  if (it.kind === 'FULL_DELETE' || it.kind === 'FULL_DELETE_KEYFRAMES') {
    // Sanity check: line[startIdx] should contain part of the prelude.
    // Use first 12 non-space chars as fingerprint to tolerate multi-line preludes.
    const fp = it.prelude.replace(/\s+/g, ' ').slice(0, 30);
    const probe = lines.slice(startIdx, Math.min(startIdx + 5, lines.length)).join(' ').replace(/\s+/g, ' ');
    if (!probe.includes(fp.slice(0, 15))) {
      errors++;
      errLog.push(`L${it.startLine} ${it.kind}: prelude mismatch. Expected to find "${fp}" near.`);
      continue;
    }
    const count = endIdx - startIdx + 1;
    lines.splice(startIdx, count);
    linesRemoved += count;
    if (it.kind === 'FULL_DELETE_KEYFRAMES') deletedKeyframes++;
    else deletedRules++;
    continue;
  }

  if (it.kind === 'TRIM') {
    // Find the line containing '{' at or after startIdx (within rule range).
    let braceIdx = -1;
    for (let i = startIdx; i <= endIdx && i < lines.length; i++) {
      if (lines[i].includes('{')) { braceIdx = i; break; }
    }
    if (braceIdx === -1) {
      errors++;
      errLog.push(`L${it.startLine} TRIM: no '{' found within rule range`);
      continue;
    }
    // Build new prelude string from live selectors only.
    const liveList = it.selectors.live;
    if (!liveList || liveList.length === 0) {
      errors++;
      errLog.push(`L${it.startLine} TRIM: no live selectors (should be FULL_DELETE)`);
      continue;
    }
    // Preserve indent of the first prelude line.
    const indentMatch = lines[startIdx].match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    // Replace all lines from startIdx through braceIdx with a single rewritten prelude line.
    // Body styling: comma-separated, newline-joined, mirroring the original visual feel.
    const newPrelude = liveList.join(',' + EOL + indent);
    // The original `{` may have had stuff after it on its line — preserve everything from `{` onward.
    const braceLine = lines[braceIdx];
    const bracePos = braceLine.indexOf('{');
    const afterBrace = braceLine.slice(bracePos); // includes the '{' itself
    const newOpenLine = indent + newPrelude + ' ' + afterBrace;

    const oldCount = braceIdx - startIdx + 1;
    lines.splice(startIdx, oldCount, newOpenLine);
    // linesRemoved counts only NET removals for trims; usually positive.
    linesRemoved += Math.max(0, oldCount - 1);
    trimmed++;
    continue;
  }

  errors++;
  errLog.push(`L${it.startLine} unknown kind ${it.kind}`);
}

if (errors > 0) {
  console.error(`ABORT: ${errors} errors during plan application.`);
  errLog.forEach(e => console.error('  ' + e));
  process.exit(1);
}

fs.writeFileSync(CSS, lines.join(EOL), 'utf8');

console.log(`Applied:`);
console.log(`  FULL_DELETE rules:     ${deletedRules}`);
console.log(`  FULL_DELETE keyframes: ${deletedKeyframes}`);
console.log(`  TRIM selector lists:   ${trimmed}`);
console.log(`  Lines removed (net):   ${linesRemoved}`);
console.log(`File: ${CSS}`);
