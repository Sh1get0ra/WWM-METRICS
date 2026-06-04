#!/usr/bin/env node
// Build a deletion plan for assets/styles.css using scripts/.dead-selectors.json.
// Produces:
//   - scripts/.dead-selector-plan.md  — human-readable proposed changes
//   - scripts/.dead-selector-plan.json — machine-applicable plan (used by apply step)
//
// Plan categories:
//   FULL_DELETE  — every selector in the rule references only dead tokens → delete entire rule
//   TRIM         — comma-separated selector list has some dead, some live → trim only the dead ones
//   SKIP         — would-delete-rule but holds @keyframes or animation reference → manual review
//
// Conservative rule: a selector is "live" if it contains ANY token that's NOT in the dead set.
// (e.g. `.dead-class.live-class` → live because `.live-class` is live)

const fs = require('fs');
const CSS = 'assets/styles.css';
const dead = JSON.parse(fs.readFileSync('scripts/.dead-selectors.json', 'utf8'));
const deadSet = new Set(dead.unused.map(u => u.token)); // ".foo" / "#bar"

const raw = fs.readFileSync(CSS, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

// Build line→section map.
const sectionByLine = new Array(lines.length).fill('00 — (pre)');
let cur = '00 — (pre)';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*SECTION (\d+) — (.+?)\s*$/);
  if (m) cur = `${m[1]} — ${m[2]}`;
  sectionByLine[i] = cur;
}

// Parse: walk char by char, track brace depth, strings, /* comments */.
// For each top-level rule, record:
//   { selectorText, body, startLine (1-based, inclusive), endLine (inclusive),
//     atRule (e.g. "@keyframes", "@media", or null if normal) }
// We treat @media as a container and recurse into its body to find inner rules
// — for now we just emit it as a single top-level block (don't recurse) since
// our dead set only references classes/ids, not at-rule containers.

function parseRules(src) {
  const rules = [];
  let i = 0;
  let line = 1;
  const len = src.length;
  function skipWs() {
    while (i < len) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        if (ch === '\n') line++;
        i++;
      } else if (src[i] === '/' && src[i + 1] === '*') {
        // Skip /* */ comment.
        i += 2;
        while (i < len && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') line++;
          i++;
        }
        i += 2;
      } else break;
    }
  }
  function readBalancedBody(startLine) {
    // Caller has consumed the opening '{'. Read until matching '}'.
    let depth = 1;
    let inStr = null;
    const startI = i;
    while (i < len && depth > 0) {
      const ch = src[i];
      if (inStr) {
        if (ch === inStr && src[i - 1] !== '\\') inStr = null;
        if (ch === '\n') line++;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; i++; continue; }
      if (ch === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < len && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (ch === '\n') line++;
      i++;
    }
    return src.slice(startI, i - 1); // body excludes closing '}'
  }
  while (i < len) {
    skipWs();
    if (i >= len) break;
    const ruleStartLine = line;
    // Read selector (or at-rule prelude) until '{' or ';'.
    let prelude = '';
    let inStr = null;
    while (i < len) {
      const ch = src[i];
      if (inStr) {
        if (ch === inStr && src[i - 1] !== '\\') inStr = null;
        prelude += ch; if (ch === '\n') line++; i++; continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; prelude += ch; i++; continue; }
      if (ch === '/' && src[i + 1] === '*') {
        // Skip embedded comment but preserve newlines.
        i += 2;
        while (i < len && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (ch === '{' || ch === ';') break;
      prelude += ch;
      if (ch === '\n') line++;
      i++;
    }
    if (i >= len) break;
    if (src[i] === ';') {
      // At-rule without body (e.g. @import 'foo';). Skip.
      i++;
      continue;
    }
    // Consume '{'.
    i++;
    const body = readBalancedBody(ruleStartLine);
    const ruleEndLine = line;
    const trimmed = prelude.trim();
    rules.push({
      prelude: trimmed,
      body,
      startLine: ruleStartLine,
      endLine: ruleEndLine,
      atRule: /^\s*@/.test(trimmed) ? trimmed.match(/^@[a-z-]+/i)?.[0] || '@?' : null
    });
  }
  return rules;
}

const rules = parseRules(raw);

// === Build animation name index ===
// Animation names referenced by `animation:` or `animation-name:` properties
// shouldn't be deleted even if their @keyframes selector matches.
const animUsed = new Set();
for (const r of rules) {
  for (const m of r.body.matchAll(/animation(?:-name)?\s*:\s*([^;]+);/g)) {
    const value = m[1];
    for (const tok of value.split(/[,\s]+/)) {
      const t = tok.trim();
      if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(t) && !['none', 'infinite', 'paused', 'running', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'forwards', 'backwards', 'both', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'].includes(t)) {
        animUsed.add(t);
      }
    }
  }
}

// === Classify each rule ===
function tokensIn(selector) {
  const out = new Set();
  for (const m of selector.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)) out.add('.' + m[1]);
  for (const m of selector.matchAll(/#([a-zA-Z_][a-zA-Z0-9_-]*)/g)) {
    if (/^[0-9a-fA-F]+$/.test(m[1]) && [3, 6, 8].includes(m[1].length)) continue;
    out.add('#' + m[1]);
  }
  return out;
}

function isSelectorDead(sel) {
  const toks = tokensIn(sel);
  if (toks.size === 0) return false; // tag-only or pseudo-only: live
  for (const t of toks) if (!deadSet.has(t)) return false; // any live token → live
  return true;
}

const plan = []; // { kind, rule, sectionLabel, selectors: { live, dead, all } | null }

for (const r of rules) {
  // @keyframes
  if (r.atRule === '@keyframes') {
    const m = r.prelude.match(/@keyframes\s+([a-zA-Z][a-zA-Z0-9_-]*)/);
    const name = m ? m[1] : null;
    if (name && !animUsed.has(name)) {
      plan.push({ kind: 'FULL_DELETE_KEYFRAMES', rule: r, sectionLabel: sectionByLine[r.startLine - 1], note: `@keyframes ${name} — not referenced` });
    }
    continue;
  }
  // @media / @supports etc: skip (would need recursion)
  if (r.atRule) continue;

  // Split selector list by top-level commas.
  // (Simplified: CSS selectors don't have parens with commas in our codebase
  //  except :is(), :where(), :not() — handle them by skipping commas inside parens.)
  const sels = splitSelectorList(r.prelude);
  const dead = [];
  const live = [];
  for (const s of sels) {
    if (isSelectorDead(s)) dead.push(s);
    else live.push(s);
  }
  if (dead.length === 0) continue; // nothing to do
  if (live.length === 0) {
    plan.push({ kind: 'FULL_DELETE', rule: r, sectionLabel: sectionByLine[r.startLine - 1], selectors: { live, dead, all: sels } });
  } else {
    plan.push({ kind: 'TRIM', rule: r, sectionLabel: sectionByLine[r.startLine - 1], selectors: { live, dead, all: sels } });
  }
}

function splitSelectorList(s) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// === Reporting ===
const bySection = new Map();
for (const p of plan) {
  if (!bySection.has(p.sectionLabel)) bySection.set(p.sectionLabel, []);
  bySection.get(p.sectionLabel).push(p);
}
const sortedSections = [...bySection.keys()].sort();

let totalFullDelete = 0, totalTrim = 0, totalKeyframes = 0, totalLinesRemoved = 0;
const md = [];
md.push(`# Dead Selector — Deletion Plan`);
md.push(``);
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Source: \`scripts/.dead-selectors.json\` (${dead.unused.length} dead tokens)`);
md.push(``);
md.push(`---`);
md.push(``);

for (const sec of sortedSections) {
  const items = bySection.get(sec).sort((a, b) => a.rule.startLine - b.rule.startLine);
  md.push(`## SECTION ${sec} — ${items.length} change${items.length === 1 ? '' : 's'}`);
  md.push(``);
  for (const p of items) {
    const linesCount = p.rule.endLine - p.rule.startLine + 1;
    if (p.kind === 'FULL_DELETE' || p.kind === 'FULL_DELETE_KEYFRAMES') {
      const tag = p.kind === 'FULL_DELETE_KEYFRAMES' ? 'DELETE-KEYFRAMES' : 'DELETE-RULE';
      md.push(`- **${tag}** L${p.rule.startLine}–L${p.rule.endLine} (${linesCount} lines)`);
      md.push(`  - Selector: \`${(p.rule.prelude.replace(/\s+/g, ' ').slice(0, 120))}\``);
      if (p.note) md.push(`  - Note: ${p.note}`);
      if (p.kind === 'FULL_DELETE_KEYFRAMES') totalKeyframes++; else totalFullDelete++;
      totalLinesRemoved += linesCount;
    } else if (p.kind === 'TRIM') {
      md.push(`- **TRIM-SELECTORS** L${p.rule.startLine}–L${p.rule.endLine}`);
      md.push(`  - Keep: ${p.selectors.live.map(s => '`' + s + '`').join(', ')}`);
      md.push(`  - Drop: ${p.selectors.dead.map(s => '`' + s + '`').join(', ')}`);
      totalTrim++;
    }
  }
  md.push(``);
}

md.unshift(``);
md.unshift(`- **Estimated lines removed**: ~${totalLinesRemoved} (full-rule deletions only; trims unchanged)`);
md.unshift(`- **KEYFRAMES deleted**: ${totalKeyframes}`);
md.unshift(`- **TRIM (selector list)**: ${totalTrim}`);
md.unshift(`- **FULL_DELETE rules**: ${totalFullDelete}`);
md.unshift(`## Summary`);
md.unshift(``);
md.unshift(`# Dead Selector — Deletion Plan`);

fs.writeFileSync('scripts/.dead-selector-plan.md', md.join('\n'), 'utf8');

// === Machine-applicable plan (used by apply step) ===
const machinePlan = plan.map(p => ({
  kind: p.kind,
  startLine: p.rule.startLine,
  endLine: p.rule.endLine,
  prelude: p.rule.prelude,
  section: p.sectionLabel,
  selectors: p.selectors || null,
  note: p.note || null
}));
fs.writeFileSync('scripts/.dead-selector-plan.json', JSON.stringify(machinePlan, null, 2), 'utf8');

console.log(`Plan generated:`);
console.log(`  FULL_DELETE rules:     ${totalFullDelete}`);
console.log(`  FULL_DELETE keyframes: ${totalKeyframes}`);
console.log(`  TRIM selector lists:   ${totalTrim}`);
console.log(`  Estimated lines off:   ~${totalLinesRemoved}`);
console.log(`Wrote scripts/.dead-selector-plan.md and .dead-selector-plan.json`);
