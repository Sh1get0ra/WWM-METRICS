#!/usr/bin/env node
// Dead selector audit for assets/styles.css.
// Strategy:
//   1. Parse styles.css → extract every CLASS token (.foo) and ID token (#bar)
//      that appears in a SELECTOR position (left of '{', outside /* */, outside string).
//   2. Build a usage corpus = all HTML + JS files (index.html, *.html, assets/**/*.js).
//   3. For each class/id, search the corpus for word-boundary matches.
//   4. Classify:
//        used        — appears in HTML/JS at least once (any context)
//        unused      — zero matches in corpus
//   5. Report unused tokens grouped by SECTION + line number for review.
//
// CAUTION: This is a CONSERVATIVE detector. Many false positives possible:
//   - Dynamic class concat (e.g. `'wwm-rank-' + rank` won't be detected as use of `wwm-rank-gold`)
//   - Classes added via JS template strings that interpolate variables
//   → Treat output as CANDIDATES, not auto-delete list.

const fs = require('fs');
const path = require('path');

const CSS_PATH = 'assets/styles.css';
const HTML_GLOB = ['index.html', 'design-preview.html', 'score-stamp-preview.html'];

function walkJs(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const jsFiles = walkJs('assets', []);
const corpusFiles = [...HTML_GLOB.filter(f => fs.existsSync(f)), ...jsFiles];

// Load corpus into a single concatenated string for fast searching.
let corpus = '';
for (const f of corpusFiles) {
  try { corpus += fs.readFileSync(f, 'utf8') + '\n\n'; } catch {}
}

// === CSS selector extraction ===
const cssRaw = fs.readFileSync(CSS_PATH, 'utf8');
const cssLines = cssRaw.split(/\r?\n/);

// Build line-to-section map from SECTION marker comments.
const sectionByLine = new Array(cssLines.length).fill('?');
let currentSection = '00 — (pre-section)';
for (let i = 0; i < cssLines.length; i++) {
  const m = cssLines[i].match(/^\s*SECTION (\d+) — (.+?)\s*$/);
  if (m) currentSection = `${m[1]} — ${m[2]}`;
  sectionByLine[i] = currentSection;
}

// Strip comment blocks for selector extraction (regex-based, naive).
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Find selector blocks: text between top-level '}' and '{'.
// We need to track brace depth + skip strings to be safe.
function extractSelectors(src) {
  const result = []; // [{selector, line}]
  let depth = 0;
  let buf = '';
  let lineStart = 1;
  let line = 1;
  let inStr = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\n') line++;
    if (inStr) {
      if (ch === inStr && src[i - 1] !== '\\') inStr = null;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; continue; }
    if (ch === '{') {
      if (depth === 0) {
        // buf contains the selector list for this rule.
        const sel = buf.trim();
        if (sel) result.push({ selector: sel, line: lineStart });
        buf = '';
      } else {
        buf += ch;
      }
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        // End of rule body. Next selector starts at next line.
        buf = '';
        lineStart = line;
      } else {
        buf += ch;
      }
      continue;
    }
    if (depth === 0) {
      if (buf === '' && /\S/.test(ch)) lineStart = line;
      buf += ch;
    }
  }
  return result;
}

const stripped = stripComments(cssRaw);
const selectorBlocks = extractSelectors(stripped);

// === Token extraction from each selector block ===
// Skip @-rules (@media, @keyframes, @supports, etc.) — they shouldn't be treated as element selectors.
const tokensByLine = new Map(); // line -> Set of tokens
const classRe = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
const idRe    = /#([a-zA-Z_][a-zA-Z0-9_-]*)/g;
// Skip blocks that are @-rule preludes (no inner ruleset of their own).
function isAtRulePrelude(sel) {
  return /^\s*@/.test(sel);
}

const allTokens = new Map(); // token -> { type, occurrences: [{line, selector}] }

for (const blk of selectorBlocks) {
  if (isAtRulePrelude(blk.selector)) continue;
  // A selector block may contain multiple comma-separated selectors. Use the
  // whole text — we just need to find every class/id token in it.
  for (const m of blk.selector.matchAll(classRe)) {
    const tok = m[1];
    if (!allTokens.has('.' + tok)) allTokens.set('.' + tok, { type: 'class', occurrences: [] });
    allTokens.get('.' + tok).occurrences.push({ line: blk.line, selector: blk.selector.slice(0, 80) });
  }
  for (const m of blk.selector.matchAll(idRe)) {
    const tok = m[1];
    // '#' in hex color (#ff0000) shouldn't reach here since selectors don't
    // contain hex colors, but be defensive.
    if (/^[0-9a-fA-F]+$/.test(tok) && (tok.length === 3 || tok.length === 6 || tok.length === 8)) continue;
    if (!allTokens.has('#' + tok)) allTokens.set('#' + tok, { type: 'id', occurrences: [] });
    allTokens.get('#' + tok).occurrences.push({ line: blk.line, selector: blk.selector.slice(0, 80) });
  }
}

// === Usage check ===
// Phase A: detect dynamic class prefixes — `'foo-' +`, `` `foo-${ ``,
//          `"foo-" +`, and the JSX/HTML form `class="... foo-"` followed by
//          an interpolation marker. Any class starting with one of those
//          prefixes is "maybe-used" and won't appear in the unused list.
const prefixes = new Set();
const prefixPatterns = [
  /['"`]([a-zA-Z][a-zA-Z0-9_-]*-)['"`]\s*\+/g,           // 'foo-' + something
  /\+\s*['"`]([a-zA-Z][a-zA-Z0-9_-]*-)['"`]/g,           //  ... + 'foo-'
  /`[^`]*?([a-zA-Z][a-zA-Z0-9_-]*-)\$\{/g,                // template `foo-${expr}`
];
for (const re of prefixPatterns) {
  for (const m of corpus.matchAll(re)) prefixes.add(m[1]);
}

function isUsed(name) {
  // Word-boundary literal match.
  const re = new RegExp(`(?:^|[^a-zA-Z0-9_-])${name.replace(/[-]/g, '\\-')}(?:[^a-zA-Z0-9_-]|$)`);
  if (re.test(corpus)) return true;
  // Dynamic prefix match: any prefix that the name starts with marks it as maybe-used.
  for (const p of prefixes) {
    if (name.startsWith(p) && name.length > p.length) return true;
  }
  return false;
}

const unused = [];
const used = [];
for (const [token, info] of allTokens) {
  const name = token.slice(1); // strip . or #
  if (isUsed(name)) used.push({ token, info });
  else unused.push({ token, info });
}

// === Report ===
console.log(`=== Dead Selector Audit — assets/styles.css ===`);
console.log(`Corpus files: ${corpusFiles.length} (HTML: ${HTML_GLOB.filter(f => fs.existsSync(f)).length}, JS: ${jsFiles.length})`);
console.log(`Total CSS selectors (rule blocks): ${selectorBlocks.length}`);
console.log(`Unique class+id tokens in CSS: ${allTokens.size}`);
console.log(`USED:   ${used.length}`);
console.log(`UNUSED: ${unused.length}`);
console.log();

// Group unused by section.
const bySection = new Map();
for (const u of unused) {
  // Use FIRST occurrence's line as the "home" line.
  const firstLine = u.info.occurrences[0].line;
  const section = sectionByLine[firstLine - 1] || '?';
  if (!bySection.has(section)) bySection.set(section, []);
  bySection.get(section).push({ ...u, firstLine });
}

const sortedSections = [...bySection.keys()].sort();
for (const sec of sortedSections) {
  const items = bySection.get(sec);
  console.log(`\n[SECTION ${sec}] (${items.length} unused)`);
  // Sort by first line
  items.sort((a, b) => a.firstLine - b.firstLine);
  for (const it of items) {
    const occCount = it.info.occurrences.length;
    const occStr = occCount === 1 ? `L${it.firstLine}` : `L${it.firstLine} (+${occCount - 1} more)`;
    console.log(`  ${it.token.padEnd(40)} ${occStr.padEnd(20)} — ${it.info.occurrences[0].selector}`);
  }
}

// Write machine-readable JSON for next-step processing.
fs.writeFileSync('scripts/.dead-selectors.json', JSON.stringify({
  total: allTokens.size,
  used: used.length,
  unused: unused.map(u => ({
    token: u.token,
    occurrences: u.info.occurrences,
    section: sectionByLine[u.info.occurrences[0].line - 1]
  }))
}, null, 2), 'utf8');
console.log(`\nWrote scripts/.dead-selectors.json`);
