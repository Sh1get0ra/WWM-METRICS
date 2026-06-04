#!/usr/bin/env node
// Phase 4.4b: apply ΔE<1.0 auto-merge to assets/styles.css.
// Replaces raw colors with the nearest CONSTANT token when:
//   - ΔE76 < threshold (default 1.0, imperceptible)
//   - alpha diff <= 0.03 (essentially same opacity)
//
// Outputs the location list: file:line  old → new  (ΔE).
// Logic mirrors color-de-report.cjs but writes the file.

const fs = require('fs');
const path = 'assets/styles.css';
const DE_THRESHOLD = parseFloat(process.argv[2] || '1.0');
const ALPHA_THRESHOLD = 0.03;

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
  const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*(.+?);\s*(?:\/\*.*\*\/)?\s*$/);
  if (!m) continue;
  const name = m[1];
  const value = m[2].trim();
  if (lightOverrideTokens.has(name)) continue;
  if (declCount[name] !== 1) continue;
  const rgba = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgba) {
    palette[name] = [+rgba[1], +rgba[2], +rgba[3], +rgba[4]];
    continue;
  }
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const hh = hex[1];
    palette[name] = [
      parseInt(hh.slice(0, 2), 16),
      parseInt(hh.slice(2, 4), 16),
      parseInt(hh.slice(4, 6), 16),
      1,
    ];
  }
}

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
    if (Math.abs(raw[3] - tok[3]) > ALPHA_THRESHOLD) continue;
    const de = deltaE76(raw, tok);
    if (de < bestDE) { bestDE = de; best = name; }
  }
  return [best, bestDE];
}

const applied = [];

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  if (/^\s*--[a-zA-Z0-9-]+\s*:/.test(line)) continue;

  // rgba
  line = line.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+|0|1(?:\.0+)?)\s*\)/g, (m, r, g, b, a) => {
    const raw = [+r, +g, +b, parseFloat(a)];
    const [name, de] = nearest(raw);
    if (!name || de >= DE_THRESHOLD) return m;
    applied.push({ line: i + 1, old: m, neu: `var(${name})`, de });
    return `var(${name})`;
  });

  // hex (skip fallback positions)
  line = line.replace(/(?<!var\(--[a-zA-Z0-9-]+,\s{0,5})#[0-9a-fA-F]{6}\b/g, (m) => {
    const hh = m.slice(1).toLowerCase();
    const raw = [
      parseInt(hh.slice(0, 2), 16),
      parseInt(hh.slice(2, 4), 16),
      parseInt(hh.slice(4, 6), 16),
      1,
    ];
    const [name, de] = nearest(raw);
    if (!name || de >= DE_THRESHOLD) return m;
    applied.push({ line: i + 1, old: m, neu: `var(${name})`, de });
    return `var(${name})`;
  });

  lines[i] = line;
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');

console.log(`[color-de-apply] applied=${applied.length}  ΔE<${DE_THRESHOLD}  alpha-diff<=${ALPHA_THRESHOLD}`);
console.log(`\n--- LOCATIONS ---`);
applied.forEach((it) => {
  console.log(`L${String(it.line).padStart(5)}  ${it.old.padEnd(28)}  →  ${it.neu.padEnd(38)}  ΔE ${it.de.toFixed(2)}`);
});
