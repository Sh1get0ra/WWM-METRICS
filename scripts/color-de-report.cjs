#!/usr/bin/env node
// Phase 4.4b: ΔE-based color similarity report for assets/styles.css.
// Finds raw rgba/hex values that are perceptually CLOSE to existing constant tokens.
// Constant token = NOT redefined in html[data-theme="light"] (safe to substitute).
//
// Output categories:
//   - auto-merge (ΔE76 < 1.0): visually imperceptible, safe auto-replace
//   - review    (ΔE76 1.0-5.0): perceptible to trained eye, needs visual verification
//   - skip      (ΔE76 >= 5.0): clearly different intent, leave raw
//
// Alpha constraint: raw and token must have alpha diff <= 0.02 (essentially same).

const fs = require('fs');
const path = 'assets/styles.css';

// Tokens redefined in html[data-theme="light"] {...} — value-shifted between themes.
// Cannot be used as constant replacement target.
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

// Pass 1: count how many times each token is declared.
// Truly constant tokens are declared ONCE (in :root only).
// Light-overridden or local-scope tokens are declared 2+ times.
const declCount = {};
for (const line of lines) {
  const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:/);
  if (m) declCount[m[1]] = (declCount[m[1]] || 0) + 1;
}

// Pass 2: build palette from SINGLE-declaration tokens only.
const palette = {};
for (const line of lines) {
  const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*(.+?);\s*(?:\/\*.*\*\/)?\s*$/);
  if (!m) continue;
  const name = m[1];
  const value = m[2].trim();
  if (lightOverrideTokens.has(name)) continue;
  if (declCount[name] !== 1) continue; // skip multi-decl (light override or local scope)
  // try rgba
  const rgba = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgba) {
    palette[name] = [+rgba[1], +rgba[2], +rgba[3], +rgba[4]];
    continue;
  }
  // try hex (6-char only)
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const hh = hex[1];
    palette[name] = [
      parseInt(hh.slice(0, 2), 16),
      parseInt(hh.slice(2, 4), 16),
      parseInt(hh.slice(4, 6), 16),
      1,
    ];
    continue;
  }
}

// ΔE76 via sRGB → Lab Euclidean.
function sRGBtoLab(r, g, b) {
  let R = r / 255, G = g / 255, B = b / 255;
  R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
  G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
  B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;
  let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  let Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  X /= 0.95047; Y /= 1.0; Z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function deltaE76(c1, c2) {
  const [L1, a1, b1] = sRGBtoLab(c1[0], c1[1], c1[2]);
  const [L2, a2, b2] = sRGBtoLab(c2[0], c2[1], c2[2]);
  return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

function nearest(raw) {
  let best = null, bestDE = Infinity;
  for (const [name, tok] of Object.entries(palette)) {
    if (Math.abs(raw[3] - tok[3]) > 0.02) continue; // alpha must essentially match
    const de = deltaE76(raw, tok);
    if (de < bestDE) { bestDE = de; best = name; }
  }
  return [best, bestDE];
}

const autoMerge = [];   // ΔE < 1.0
const review = [];      // ΔE 1.0-5.0
const skipped = [];     // ΔE >= 5.0 or no alpha match

function classify(item) {
  const { de } = item;
  if (de < 1.0) autoMerge.push(item);
  else if (de < 5.0) review.push(item);
  else skipped.push(item);
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^\s*--[a-zA-Z0-9-]+\s*:/.test(line)) continue;

  // rgba scan
  for (const m of line.matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+|0|1(?:\.0+)?)\s*\)/g)) {
    const raw = [+m[1], +m[2], +m[3], parseFloat(m[4])];
    const [name, de] = nearest(raw);
    if (!name || !isFinite(de)) {
      skipped.push({ line: i + 1, raw: m[0], token: null, de: Infinity });
      continue;
    }
    classify({ line: i + 1, raw: m[0], token: name, de });
  }

  // hex scan (skip fallback positions: preceded by `var(--X, `)
  for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const idx = m.index;
    const before = line.slice(Math.max(0, idx - 40), idx);
    if (/var\(--[a-zA-Z0-9-]+,\s{0,5}$/.test(before)) continue;
    const hh = m[0].slice(1).toLowerCase();
    const raw = [
      parseInt(hh.slice(0, 2), 16),
      parseInt(hh.slice(2, 4), 16),
      parseInt(hh.slice(4, 6), 16),
      1,
    ];
    const [name, de] = nearest(raw);
    if (!name || !isFinite(de)) {
      skipped.push({ line: i + 1, raw: m[0], token: null, de: Infinity });
      continue;
    }
    classify({ line: i + 1, raw: m[0], token: name, de });
  }
}

autoMerge.sort((a, b) => a.de - b.de);
review.sort((a, b) => a.de - b.de);

console.log(`=== Phase 4.4b ΔE76 similarity report ===`);
console.log(`palette: ${Object.keys(palette).length} constant tokens`);
console.log(`auto-merge (ΔE<1.0, imperceptible): ${autoMerge.length}`);
console.log(`review     (ΔE 1.0-5.0):           ${review.length}`);
console.log(`skipped    (ΔE>=5.0 or no alpha match): ${skipped.length}`);
console.log(`\n--- AUTO-MERGE CANDIDATES (ΔE < 1.0) ---`);
autoMerge.slice(0, 80).forEach((it) => {
  console.log(`L${String(it.line).padStart(5)}  ${it.raw.padEnd(28)}  →  var(${it.token})   ΔE ${it.de.toFixed(2)}`);
});
if (autoMerge.length > 80) console.log(`... and ${autoMerge.length - 80} more`);

console.log(`\n--- REVIEW (ΔE 1.0-5.0, top 40 by ΔE asc) ---`);
review.slice(0, 40).forEach((it) => {
  console.log(`L${String(it.line).padStart(5)}  ${it.raw.padEnd(28)}  →  var(${it.token})?  ΔE ${it.de.toFixed(2)}`);
});
if (review.length > 40) console.log(`... and ${review.length - 40} more`);
