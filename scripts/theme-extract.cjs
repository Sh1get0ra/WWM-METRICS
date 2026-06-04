#!/usr/bin/env node
// Extract top-level html[data-theme="light"] (and optionally "dark") rules
// from assets/styles.css into a separate file so cascade order can do its job.
//
// Default: dry-run. Add --apply to write files.
// --light-only / --dark-only to scope.
//
// Preserves:
//   - CRLF EOL of source.
//   - Original relative order of extracted rules (so within-theme cascade intact).
//   - Comments that precede a rule on the same line OR block above remain in
//     styles.css (NOT extracted) to avoid stranding context.
//
// Does NOT extract:
//   - Theme rules nested inside @media / @supports / @keyframes (5 known).
//   - @-rules themselves.

const fs = require('fs');
const path = require('path');

const CSS = 'assets/styles.css';
const raw = fs.readFileSync(CSS, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';

const apply = process.argv.includes('--apply');
const wantLight = !process.argv.includes('--dark-only');
const wantDark  = !process.argv.includes('--light-only');

function skipWsAndComments(src, i) {
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i + 1 < src.length && src[i] === '/' && src[i+1] === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i+1] === '/')) i++;
      i += 2;
    } else break;
  }
  return i;
}

// Walk top-level rules.
function parseTopLevelRules(src) {
  const rules = [];
  let pos = 0, depth = 0;
  let inStr = null, inCmt = false;
  let segmentStart = 0;
  let braceStart = -1;
  let ruleSelStart = -1;

  while (pos < src.length) {
    const c = src[pos], n = src[pos+1];
    if (inCmt) {
      if (c === '*' && n === '/') { inCmt = false; pos += 2; continue; }
      pos++; continue;
    }
    if (inStr) {
      if (c === '\\') { pos += 2; continue; }
      if (c === inStr) inStr = null;
      pos++; continue;
    }
    if (c === '/' && n === '*') { inCmt = true; pos += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; pos++; continue; }

    if (c === '{') {
      if (depth === 0) {
        ruleSelStart = skipWsAndComments(src, segmentStart);
        braceStart = pos;
      }
      depth++; pos++; continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        const sel = src.slice(ruleSelStart, braceStart).trim();
        const ruleEnd = pos + 1;
        rules.push({ selStart: ruleSelStart, ruleEnd, sel });
        segmentStart = ruleEnd;
      }
      pos++; continue;
    }
    pos++;
  }
  return rules;
}

const allRules = parseTopLevelRules(raw);
const lightRules = allRules.filter(r =>
  !r.sel.startsWith('@') && /^html\[data-theme=["']light["']/.test(r.sel)
);
const darkRules = allRules.filter(r =>
  !r.sel.startsWith('@') && /^html\[data-theme=["']dark["']/.test(r.sel)
);

function buildExtractedContent(rules, themeLabel) {
  const header =
    `/* AUTO-EXTRACTED from styles.css — ${themeLabel} theme rules.${EOL}` +
    `   Loaded AFTER styles.css for natural cascade override.${EOL}` +
    `   Regenerate with: node scripts/theme-extract.cjs --apply${EOL}` +
    ` */${EOL}${EOL}`;
  const body = rules.map(r => raw.slice(r.selStart, r.ruleEnd)).join(EOL + EOL);
  return header + body + EOL;
}

function removeRulesFromSource(src, rules) {
  // Sort descending by selStart so removals don't shift earlier indices.
  const sorted = rules.slice().sort((a, b) => b.selStart - a.selStart);
  let s = src;
  for (const r of sorted) {
    // Also consume trailing newline + preceding hairline if rule occupied
    // its own block. Look at chars after ruleEnd: if EOL → consume it. If
    // followed by blank line → consume that too (collapse spacing).
    let end = r.ruleEnd;
    // Consume EOL after rule.
    if (s[end] === '\r' && s[end+1] === '\n') end += 2;
    else if (s[end] === '\n') end += 1;
    // Consume preceding trailing whitespace on selector line (back to newline).
    let start = r.selStart;
    while (start > 0 && (s[start-1] === ' ' || s[start-1] === '\t')) start--;
    s = s.slice(0, start) + s.slice(end);
  }
  return s;
}

// Reports.
const report = {
  light: { count: lightRules.length, bangCount: 0 },
  dark:  { count: darkRules.length,  bangCount: 0 },
};
for (const r of lightRules) {
  const body = raw.slice(r.selStart, r.ruleEnd);
  report.light.bangCount += (body.match(/!important/g) || []).length;
}
for (const r of darkRules) {
  const body = raw.slice(r.selStart, r.ruleEnd);
  report.dark.bangCount += (body.match(/!important/g) || []).length;
}

console.log(`LIGHT: ${report.light.count} rules, ${report.light.bangCount} !important`);
console.log(`DARK:  ${report.dark.count} rules, ${report.dark.bangCount} !important`);

// Combine both rule sets and remove in a single pass to avoid offset drift.
const toRemove = [];
if (wantLight) toRemove.push(...lightRules);
if (wantDark)  toRemove.push(...darkRules);
const newCss = removeRulesFromSource(raw, toRemove);

const origLines = raw.split(/\r?\n/).length;
const newLines  = newCss.split(/\r?\n/).length;
console.log(`styles.css: ${origLines} → ${newLines} lines (${newLines - origLines})`);

if (!apply) {
  console.log('\n[DRY RUN] — pass --apply to write files.');
  return;
}

if (wantLight) {
  const content = buildExtractedContent(lightRules, 'LIGHT');
  fs.writeFileSync('assets/styles-light.css', content, 'utf8');
  console.log(`Wrote assets/styles-light.css (${content.split(/\r?\n/).length} lines)`);
}
if (wantDark) {
  const content = buildExtractedContent(darkRules, 'DARK');
  fs.writeFileSync('assets/styles-dark.css', content, 'utf8');
  console.log(`Wrote assets/styles-dark.css (${content.split(/\r?\n/).length} lines)`);
}

fs.writeFileSync(CSS, newCss, 'utf8');
console.log(`Wrote ${CSS}`);
