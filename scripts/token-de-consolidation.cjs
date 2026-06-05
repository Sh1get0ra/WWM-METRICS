#!/usr/bin/env node
// Find token pairs whose values are perceptually similar (ΔE76 < threshold).
// Considers both dark and light context values.
//
// Output: pairs sorted by ΔE asc. Manual review required.

const fs = require('fs');

const tokenMap = JSON.parse(fs.readFileSync('scripts/.token-map.json', 'utf8'));

function parseColor(s) {
  s = s.trim().toLowerCase();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length === 8) hex = hex.slice(0, 6); // ignore alpha for ΔE
    if (hex.length !== 6) return null;
    return {
      r: parseInt(hex.slice(0,2), 16),
      g: parseInt(hex.slice(2,4), 16),
      b: parseInt(hex.slice(4,6), 16),
      a: 1,
    };
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  return {
    r: parseInt(m[1]),
    g: parseInt(m[2]),
    b: parseInt(m[3]),
    a: m[4] ? parseFloat(m[4]) : 1,
  };
}

// Quick ΔE76 in Lab (simplified RGB→Lab approximation, good enough for screening).
function rgbToLab({r,g,b}) {
  function srgbToLinear(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const rL = srgbToLinear(r), gL = srgbToLinear(g), bL = srgbToLinear(b);
  const X = rL*0.4124 + gL*0.3576 + bL*0.1805;
  const Y = rL*0.2126 + gL*0.7152 + bL*0.0722;
  const Z = rL*0.0193 + gL*0.1192 + bL*0.9505;
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  function f(t) {
    return t > Math.pow(6/29, 3) ? Math.cbrt(t) : t / (3 * Math.pow(6/29, 2)) + 4/29;
  }
  const fx = f(X/Xn), fy = f(Y/Yn), fz = f(Z/Zn);
  const L = 116*fy - 16;
  const a = 500*(fx - fy);
  const bb = 200*(fy - fz);
  return { L, a, b: bb };
}

function deltaE76(c1, c2) {
  const L1 = rgbToLab(c1), L2 = rgbToLab(c2);
  return Math.sqrt(
    Math.pow(L1.L - L2.L, 2) +
    Math.pow(L1.a - L2.a, 2) +
    Math.pow(L1.b - L2.b, 2)
  );
}

function compareTokenSet(tokens, label) {
  console.log(`\n=== ${label} (${Object.keys(tokens).length} tokens) ===`);
  const parsed = [];
  for (const [name, val] of Object.entries(tokens)) {
    const c = parseColor(val);
    if (c) parsed.push({ name, val, c });
  }
  const pairs = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i], b = parsed[j];
      // alpha difference
      const dA = Math.abs(a.c.a - b.c.a);
      // skip if alpha differs too much (different intent)
      if (dA > 0.05) continue;
      const dE = deltaE76(a.c, b.c);
      if (dE < 2.0) pairs.push({ a: a.name, b: b.name, dE, va: a.val, vb: b.val });
    }
  }
  pairs.sort((p, q) => p.dE - q.dE);
  for (const p of pairs) {
    console.log(`  ΔE=${p.dE.toFixed(2)}  ${p.a} (${p.va}) ≈ ${p.b} (${p.vb})`);
  }
  return pairs;
}

compareTokenSet(tokenMap.darkTokens, 'DARK tokens');
compareTokenSet(tokenMap.lightFull, 'LIGHT tokens (with dark fallback)');
