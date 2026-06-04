#!/usr/bin/env node
// Extract token (CSS custom property) -> value maps for dark and light themes.
// Output: scripts/.token-map.json

const fs = require('fs');

const stylesPath = 'assets/styles.css';
const lightPath = 'assets/styles-light.css';

function normVal(v) {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Color normalization: collapse rgba whitespace, lowercase, expand #abc to #aabbcc.
function normColor(v) {
  let s = v.trim().toLowerCase();
  if (s.startsWith('#')) {
    if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return s;
  }
  if (s.startsWith('rgb')) return s.replace(/\s+/g, '');
  return s;
}

// Parse decls inside a block { ... }. Returns array of [name, value, line].
function parseBlock(src, startIdx, startLine) {
  const decls = [];
  let i = startIdx;
  let line = startLine;
  let depth = 1;
  while (i < src.length && depth > 0) {
    // skip whitespace
    while (i < src.length && /\s/.test(src[i])) {
      if (src[i] === '\n') line++;
      i++;
    }
    if (i >= src.length) break;
    if (src[i] === '}') { depth--; i++; continue; }
    if (src[i] === '{') { depth++; i++; continue; }
    // skip comments
    if (src[i] === '/' && src[i+1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) break;
      const seg = src.slice(i, end + 2);
      line += (seg.match(/\n/g) || []).length;
      i = end + 2;
      continue;
    }
    // Read until next ; or } at same depth
    let buf = '';
    const declLine = line;
    while (i < src.length) {
      const c = src[i];
      if (c === ';') { i++; break; }
      if (c === '}') break;
      if (c === '\n') line++;
      buf += c;
      i++;
    }
    const colonIdx = buf.indexOf(':');
    if (colonIdx > 0) {
      const name = buf.slice(0, colonIdx).trim();
      const value = buf.slice(colonIdx + 1).trim();
      if (name.startsWith('--')) decls.push([name, value, declLine]);
    }
  }
  return decls;
}

function findSelectorBlock(src, selectorRe) {
  const lines = src.split(/\r?\n/);
  const re = selectorRe;
  let blocks = [];
  // Find selector by scanning text and matching open brace
  let i = 0, line = 1;
  while (i < src.length) {
    if (src[i] === '\n') { line++; i++; continue; }
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) break;
    // Advance line counter to match position
    const skipped = src.slice(i, m.index);
    line += (skipped.match(/\n/g) || []).length;
    i = m.index + m[0].length;
    // find {
    while (i < src.length && src[i] !== '{') {
      if (src[i] === '\n') line++;
      i++;
    }
    if (i >= src.length) break;
    i++; // past {
    blocks.push({ startIdx: i, startLine: line });
  }
  return blocks;
}

const darkRaw = fs.readFileSync(stylesPath, 'utf8');
const lightRaw = fs.readFileSync(lightPath, 'utf8');

// Extract :root from styles.css (line-anchored)
const darkTokens = {};
{
  // Find ":root {" at start of line in styles.css
  const re = /^:root\s*\{/gm;
  let m;
  while ((m = re.exec(darkRaw)) !== null) {
    const startLine = (darkRaw.slice(0, m.index).match(/\n/g) || []).length + 1;
    const startIdx = m.index + m[0].length;
    const decls = parseBlock(darkRaw, startIdx, startLine);
    for (const [name, value, line] of decls) {
      if (!darkTokens[name]) darkTokens[name] = { value, line };
    }
  }
}

// Extract html[data-theme="light"] {} blocks from styles-light.css
const lightTokens = {};
{
  const re = /^html\[data-theme="light"\]\s*\{/gm;
  let m;
  while ((m = re.exec(lightRaw)) !== null) {
    const startLine = (lightRaw.slice(0, m.index).match(/\n/g) || []).length + 1;
    const startIdx = m.index + m[0].length;
    const decls = parseBlock(lightRaw, startIdx, startLine);
    for (const [name, value, line] of decls) {
      lightTokens[name] = { value, line }; // overwrites earlier (later def wins)
    }
  }
}

// Compose final light map: dark fallback + light override
const lightFull = {};
for (const k of Object.keys(darkTokens)) lightFull[k] = darkTokens[k].value;
for (const k of Object.keys(lightTokens)) lightFull[k] = lightTokens[k].value;

// Build reverse: color value -> [token, token, ...]
function buildReverse(tokenMap) {
  const rev = {};
  for (const [name, val] of Object.entries(tokenMap)) {
    const v = typeof val === 'string' ? val : val.value;
    const n = normColor(v);
    if (!rev[n]) rev[n] = [];
    rev[n].push(name);
  }
  return rev;
}

const darkRev = buildReverse(Object.fromEntries(Object.entries(darkTokens).map(([k,v]) => [k, v.value])));
const lightRev = buildReverse(lightFull);

const out = {
  darkTokens: Object.fromEntries(Object.entries(darkTokens).map(([k,v]) => [k, v.value])),
  lightOverrides: Object.fromEntries(Object.entries(lightTokens).map(([k,v]) => [k, v.value])),
  lightFull,
  darkReverse: darkRev,
  lightReverse: lightRev,
};

fs.writeFileSync('scripts/.token-map.json', JSON.stringify(out, null, 2));
console.log(`Dark tokens: ${Object.keys(darkTokens).length}`);
console.log(`Light overrides: ${Object.keys(lightTokens).length}`);
console.log(`Dark unique colors: ${Object.keys(darkRev).length}`);
console.log(`Light unique colors: ${Object.keys(lightRev).length}`);

// Conflict report: same color, multiple tokens (light side)
console.log('\n--- Light reverse conflicts (>1 token per color) ---');
for (const [color, names] of Object.entries(lightRev)) {
  if (names.length > 1) console.log(`  ${color}: ${names.join(', ')}`);
}
