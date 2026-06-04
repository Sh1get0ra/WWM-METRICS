#!/usr/bin/env node
// Extract hardcoded colors (hex + rgb/rgba) from a CSS file.
// Output: frequency table + line refs.

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || 'assets/styles-light.css';
const raw = fs.readFileSync(target, 'utf8');
const lines = raw.split(/\r?\n/);

// Normalize: lowercase hex, collapse whitespace in rgba().
function norm(c) {
  let s = c.trim().toLowerCase();
  if (s.startsWith('#')) {
    if (s.length === 4) {
      // #abc -> #aabbcc
      s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return s;
  }
  // rgba/rgb: strip spaces inside parens
  return s.replace(/\s+/g, '');
}

const freq = new Map(); // color -> { count, refs:Set<line> }

const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
const rgbRe = /rgba?\(\s*[\d.,\s]+\)/g;

for (let i = 0; i < lines.length; i++) {
  const ln = i + 1;
  const line = lines[i];
  // Skip pure comments
  if (/^\s*\/\*/.test(line) && /\*\/\s*$/.test(line)) continue;

  const hits = [];
  let m;
  while ((m = hexRe.exec(line)) !== null) hits.push(m[0]);
  while ((m = rgbRe.exec(line)) !== null) hits.push(m[0]);

  for (const h of hits) {
    const n = norm(h);
    if (!freq.has(n)) freq.set(n, { count: 0, refs: [] });
    const e = freq.get(n);
    e.count++;
    if (e.refs.length < 6) e.refs.push(ln);
  }
}

// Sort by count desc, then color
const sorted = [...freq.entries()].sort((a, b) => {
  if (b[1].count !== a[1].count) return b[1].count - a[1].count;
  return a[0] < b[0] ? -1 : 1;
});

console.log(`File: ${target}`);
console.log(`Unique colors: ${sorted.length}`);
console.log(`Total occurrences: ${[...freq.values()].reduce((s, e) => s + e.count, 0)}`);
console.log('');
console.log('Color                              Count  Refs (first 6 lines)');
console.log('─'.repeat(80));
for (const [c, e] of sorted) {
  if (e.count < 2) continue; // suppress one-offs
  console.log(`${c.padEnd(34)} ${String(e.count).padStart(5)}  ${e.refs.join(', ')}`);
}

console.log('\n--- One-off colors (count=1) ---');
for (const [c, e] of sorted) {
  if (e.count !== 1) continue;
  console.log(`${c.padEnd(34)} L${e.refs[0]}`);
}

// JSON dump
const out = {};
for (const [c, e] of sorted) out[c] = e;
const jsonPath = path.join('scripts', '.hardcoded-colors.json');
fs.writeFileSync(jsonPath, JSON.stringify({ file: target, colors: out }, null, 2));
console.log(`\nWrote ${jsonPath}`);
