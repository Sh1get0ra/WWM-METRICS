#!/usr/bin/env node
// Phase A: substitute hardcoded color literals with var(--token) where the
// literal exactly matches a token's value in the relevant context.
//
// Target: assets/styles-light.css (light context — use light token values).
//
// Flags:
//   --dry-run    show count + sample, no write
//   --limit=N    cap substitutions
//   --verbose    print each substitution

const fs = require('fs');

const TARGET = process.argv.includes('--target=styles')
  ? 'assets/styles.css'
  : 'assets/styles-light.css';
const isLight = TARGET === 'assets/styles-light.css';
const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

const tokenMap = JSON.parse(fs.readFileSync('scripts/.token-map.json', 'utf8'));
const reverse = isLight ? tokenMap.lightReverse : tokenMap.darkReverse;

// Precedence: when one color maps to multiple tokens, pick this one.
const PRECEDENCE = {
  'rgba(58,38,22,0.10)': '--surf-shade-2',
  '#8a1f17': '--vermilion-deep',
  '#c83c2b': '--vermilion-bright',
  '#6a5236': '--paper-mute',
};

// Skip color-list — don't substitute even if matched.
// Reason: ambiguous semantic (e.g. white/black is too generic to want as token).
const SKIP_COLORS = new Set([
  '#ffffff',
  '#000000',
]);

function pickToken(color) {
  if (SKIP_COLORS.has(color)) return null;
  const tokens = reverse[color];
  if (!tokens || tokens.length === 0) return null;
  if (tokens.length === 1) return tokens[0];
  if (PRECEDENCE[color]) return PRECEDENCE[color];
  // Multiple tokens, no precedence — skip (manual review)
  return null;
}

const raw = fs.readFileSync(TARGET, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

let totalSubs = 0;
const stats = {}; // color -> count
const samples = []; // {line, before, after}

// Color regex (hex + rgb/rgba)
function normColor(c) {
  let s = c.trim().toLowerCase();
  if (s.startsWith('#')) {
    if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return s;
  }
  return s.replace(/\s+/g, '');
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.,\s]+\)/g;

// Don't substitute inside :root or html[data-theme="light"] {} blocks
// (these are token definitions, not consumers).
let inTokenBlock = false;
let braceDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Detect entry/exit of token-def blocks
  const trimmed = line.trim();
  if (!inTokenBlock) {
    if (/^:root\s*\{/.test(trimmed) || /^html\[data-theme="light"\]\s*\{/.test(trimmed)) {
      inTokenBlock = true;
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      continue;
    }
  } else {
    braceDepth += (line.match(/\{/g) || []).length;
    braceDepth -= (line.match(/\}/g) || []).length;
    if (braceDepth <= 0) inTokenBlock = false;
    continue;
  }

  // Skip comment-only lines
  if (/^\s*\/\*.*\*\/\s*$/.test(line)) continue;

  // Don't touch URLs (already non-color but safety)
  if (line.includes('url(')) {
    // Substitute only outside url(...). For simplicity, skip the whole line if it has url().
    // Most url() lines are bg images, not color decls.
    continue;
  }

  let newLine = line;
  let lineMutated = false;
  // Iterate matches with non-overlapping logic
  const matches = [];
  let m;
  COLOR_RE.lastIndex = 0;
  while ((m = COLOR_RE.exec(line)) !== null) {
    matches.push({ raw: m[0], start: m.index, end: m.index + m[0].length });
  }
  // Apply in reverse to keep offsets stable
  for (let j = matches.length - 1; j >= 0; j--) {
    if (totalSubs >= LIMIT) break;
    const { raw: col, start, end } = matches[j];
    const norm = normColor(col);
    const token = pickToken(norm);
    if (!token) continue;
    const replacement = `var(${token})`;
    if (verbose) {
      console.log(`L${i+1}: ${col} → ${replacement}`);
    }
    if (samples.length < 10) {
      samples.push({ line: i + 1, before: line.slice(0, 100), col, token });
    }
    newLine = newLine.slice(0, start) + replacement + newLine.slice(end);
    stats[norm] = (stats[norm] || 0) + 1;
    totalSubs++;
    lineMutated = true;
  }
  if (lineMutated) lines[i] = newLine;
}

console.log(`Target: ${TARGET}`);
console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
console.log(`Total substitutions: ${totalSubs}`);
console.log('');
console.log('By color (top 20):');
const top = Object.entries(stats).sort((a,b) => b[1] - a[1]).slice(0, 20);
for (const [c, n] of top) {
  console.log(`  ${c.padEnd(30)} ${String(n).padStart(4)}× → var(${pickToken(c)})`);
}

console.log('\nSamples:');
for (const s of samples.slice(0, 5)) {
  console.log(`  L${s.line}: ${s.col} → var(${s.token})`);
}

if (!dryRun && totalSubs > 0) {
  fs.writeFileSync(TARGET, lines.join(EOL), 'utf8');
  console.log(`\nWrote ${TARGET}`);
}
