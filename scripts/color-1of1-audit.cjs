#!/usr/bin/env node
// Phase 4.4 audit: 1-of-1 raw colors analysis.
// For each raw color that appears EXACTLY ONCE, find nearest constant token
// and bucket by ΔE76. Reveals how many "individual tweaks" are actually
// perceptually close to existing tokens (= safe to merge).

const fs = require('fs');
const path = 'assets/styles.css';

const lightOverrideTokens = new Set([
  '--bg-0', '--bg-1', '--bg-2', '--bg-3',
  '--bone', '--bone-dim',
  '--chart-graze', '--chart-normal',
  '--donut-track',
  '--gold', '--gold-bright', '--gold-deep', '--gold-glow',
  '--header-grad', '--hero-grad', '--hero-num', '--hero-num-shadow',
  '--ink-1', '--ink-2', '--ink-3',
  '--input-bg', '--input-text',
  '--jade', '--jade-bright',
  '--paper', '--paper-2', '--paper-dim', '--paper-mute',
  '--rail-grad',
  '--surf-1', '--surf-2',
  '--surf-shade', '--surf-shade-2', '--surf-shade-3',
  '--vermilion-bright', '--vermilion-glow',
]);

const lines = fs.readFileSync(path, 'utf8').split('\n');

const declCount = {};
for (const line of lines) {
  const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:/);
  if (m) declCount[m[1]] = (declCount[m[1]] || 0) + 1;
}

const palette = {};
for (const line of lines) {
  const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*(.+?);/);
  if (!m) continue;
  const name = m[1];
  const value = m[2].trim();
  if (lightOverrideTokens.has(name)) continue;
  if (declCount[name] !== 1) continue;
  const rgba = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgba) { palette[name] = [+rgba[1], +rgba[2], +rgba[3], +rgba[4]]; continue; }
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const hh = hex[1];
    palette[name] = [parseInt(hh.slice(0,2),16), parseInt(hh.slice(2,4),16), parseInt(hh.slice(4,6),16), 1];
  }
}

function sRGBtoLab(r, g, b) {
  let R = r/255, G = g/255, B = b/255;
  R = R > 0.04045 ? Math.pow((R+0.055)/1.055, 2.4) : R/12.92;
  G = G > 0.04045 ? Math.pow((G+0.055)/1.055, 2.4) : G/12.92;
  B = B > 0.04045 ? Math.pow((B+0.055)/1.055, 2.4) : B/12.92;
  let X = R*0.4124564 + G*0.3575761 + B*0.1804375;
  let Y = R*0.2126729 + G*0.7151522 + B*0.0721750;
  let Z = R*0.0193339 + G*0.1191920 + B*0.9503041;
  X /= 0.95047; Y /= 1.0; Z /= 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787*t + 16/116;
  return [116*f(Y) - 16, 500*(f(X) - f(Y)), 200*(f(Y) - f(Z))];
}
function deltaE76(c1, c2) {
  const [L1,a1,b1] = sRGBtoLab(c1[0],c1[1],c1[2]);
  const [L2,a2,b2] = sRGBtoLab(c2[0],c2[1],c2[2]);
  return Math.sqrt((L1-L2)**2 + (a1-a2)**2 + (b1-b2)**2);
}
function nearest(raw, alphaTol = 0.05) {
  let best = null, bestDE = Infinity;
  for (const [name, tok] of Object.entries(palette)) {
    if (Math.abs(raw[3] - tok[3]) > alphaTol) continue;
    const de = deltaE76(raw, tok);
    if (de < bestDE) { bestDE = de; best = name; }
  }
  return [best, bestDE];
}

// First pass: collect all raw occurrences with their line numbers
const occurrences = []; // {raw, line, normalized}
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^\s*--[a-zA-Z0-9-]+\s*:/.test(line)) continue;
  for (const m of line.matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+|0|1(?:\.0+)?)\s*\)/g)) {
    const r = +m[1], g = +m[2], b = +m[3], a = parseFloat(m[4]);
    occurrences.push({ raw: m[0], line: i+1, c: [r,g,b,a], key: `${r},${g},${b},${a}` });
  }
  for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const idx = m.index;
    const before = line.slice(Math.max(0, idx-40), idx);
    if (/var\(--[a-zA-Z0-9-]+,\s{0,5}$/.test(before)) continue;
    const hh = m[0].slice(1).toLowerCase();
    const r = parseInt(hh.slice(0,2),16), g = parseInt(hh.slice(2,4),16), b = parseInt(hh.slice(4,6),16);
    occurrences.push({ raw: m[0], line: i+1, c: [r,g,b,1], key: `${r},${g},${b},1` });
  }
}

// Count by key
const keyCounts = {};
for (const o of occurrences) keyCounts[o.key] = (keyCounts[o.key] || 0) + 1;

// Filter 1-of-1
const oneOfOne = occurrences.filter(o => keyCounts[o.key] === 1);

// Bucket by ΔE to nearest token (alpha tol 0.05)
const buckets = { 'ΔE<1':0, 'ΔE 1-3':0, 'ΔE 3-6':0, 'ΔE 6-10':0, 'ΔE 10-20':0, 'ΔE>=20 or no match':0 };
const examples = { 'ΔE<1':[], 'ΔE 1-3':[], 'ΔE 3-6':[], 'ΔE 6-10':[], 'ΔE 10-20':[], 'ΔE>=20 or no match':[] };
for (const o of oneOfOne) {
  const [name, de] = nearest(o.c);
  let bucket;
  if (!name || !isFinite(de)) bucket = 'ΔE>=20 or no match';
  else if (de < 1) bucket = 'ΔE<1';
  else if (de < 3) bucket = 'ΔE 1-3';
  else if (de < 6) bucket = 'ΔE 3-6';
  else if (de < 10) bucket = 'ΔE 6-10';
  else if (de < 20) bucket = 'ΔE 10-20';
  else bucket = 'ΔE>=20 or no match';
  buckets[bucket]++;
  if (examples[bucket].length < 8) examples[bucket].push({ ...o, token: name, de });
}

console.log(`=== 1-of-1 raw color audit ===`);
console.log(`Total raw occurrences: ${occurrences.length}`);
console.log(`Unique raw values: ${Object.keys(keyCounts).length}`);
console.log(`1-of-1 (occur once): ${oneOfOne.length}`);
console.log(`palette: ${Object.keys(palette).length} constant tokens`);
console.log();
console.log(`--- 1-of-1 ΔE distribution to nearest constant token (alpha tol 0.05) ---`);
for (const [b, n] of Object.entries(buckets)) {
  const pct = ((n / oneOfOne.length) * 100).toFixed(1);
  console.log(`  ${b.padEnd(28)}  ${String(n).padStart(4)} 件  (${pct}%)`);
}

console.log(`\n--- examples by bucket (max 8) ---`);
for (const [b, items] of Object.entries(examples)) {
  if (items.length === 0) continue;
  console.log(`\n[${b}]`);
  items.forEach(it => {
    const t = it.token ? `→ var(${it.token})` : `(no close token)`;
    console.log(`  L${String(it.line).padStart(5)}  ${it.raw.padEnd(28)} ${t.padEnd(40)} ΔE ${it.de.toFixed(2)}`);
  });
}
