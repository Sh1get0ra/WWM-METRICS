#!/usr/bin/env node
// Phase 4.4: raw hex/rgba -> token sweep for assets/styles.css.
// Rules:
//   - Replace ONLY raw values that match CONSTANT tokens (no light theme override).
//   - Light-overridden tokens (--gold, --paper, --bg-0..3, --ink-*, --jade, etc.)
//     are EXCLUDED: replacing raw with var(--X) would shift light theme.
//   - Skip token-declaration lines (lines starting with whitespace + --name:).
//   - Normalize: rgba whitespace stripped, alpha as parseFloat (.5 == 0.5 == 0.50),
//                hex lowercased, 3-char expanded to 6-char.
//   - Skip ambiguous hex (e.g., #f0d28a matches both --chart-crit-constant AND
//     --gold-bright-overridden — author intent unknowable, leave raw).

const fs = require('fs');
const path = 'assets/styles.css';

// All tokens here are confirmed constant (NOT redefined in html[data-theme="light"]).
// Hex values: lowercase 6-char.
// rgba values: stored with alpha as numeric string (no trailing zeros, e.g. "0.5" not "0.50").
const colorMap = {
  // hex constants (unambiguous = no other token shares this value)
  hex: {
    '#1a1410': '--bg-raised',
    '#c83c2b': '--vermilion',
    '#8a1f17': '--vermilion-deep',
    '#4caf50': '--ratio-excellent',
    '#8bc34a': '--ratio-good',
    '#ffc107': '--ratio-ok',
    '#ff9800': '--ratio-warn',
    '#e74c3c': '--ratio-bad',
  },
  // rgba constants — key: "r,g,b,alpha" where alpha is normalized parseFloat string.
  rgba: {
    // vermilion (rgb 200,60,43) 派生
    '200,60,43,0.05': '--vermilion-trace',
    '200,60,43,0.08': '--vermilion-faint',
    '200,60,43,0.1':  '--vermilion-tint',
    '200,60,43,0.15': '--vermilion-soft',
    '200,60,43,0.18': '--vermilion-soft-light',
    '200,60,43,0.2':  '--vermilion-soft-2',
    '200,60,43,0.3':  '--vermilion-mid',
    '200,60,43,0.35': '--vermilion-mid-2',
    '200,60,43,0.4':  '--vermilion-mid-strong',
    '200,60,43,0.55': '--vermilion-strong',
    // vermilion-bright (rgb 232,81,58) 派生
    '232,81,58,0.15': '--vermilion-bright-trace',
    '232,81,58,0.18': '--vermilion-bright-tint',
    '232,81,58,0.25': '--vermilion-bright-soft',
    '232,81,58,0.4':  '--vermilion-bright-soft-mid',
    '232,81,58,0.45': '--vermilion-bright-mid',
    '232,81,58,0.55': '--vermilion-bright-mid-2',
    '232,81,58,0.6':  '--vermilion-bright-glow',
    '232,81,58,0.7':  '--vermilion-bright-strong',
    // gold (rgb 201,164,90) 派生
    '201,164,90,0.05': '--gold-trace',
    '201,164,90,0.08': '--gold-faint',
    '201,164,90,0.12': '--gold-tint',
    '201,164,90,0.2':  '--gold-soft',
    '201,164,90,0.3':  '--gold-mid',
    '201,164,90,0.5':  '--gold-strong',
    // gold-bright (rgb 240,210,138) 派生
    '240,210,138,0.08': '--gold-bright-faint',
    '240,210,138,0.12': '--gold-bright-tint',
    '240,210,138,0.25': '--gold-bright-soft',
    '240,210,138,0.4':  '--gold-bright-mid-2',
    '240,210,138,0.5':  '--gold-bright-mid',
    '240,210,138,0.7':  '--gold-bright-strong',
    // overlay (rgb 0,0,0) 派生
    '0,0,0,0.15': '--overlay-trace',
    '0,0,0,0.25': '--overlay-tint',
    '0,0,0,0.3':  '--overlay-soft',
    '0,0,0,0.4':  '--overlay-soft-mid',
    '0,0,0,0.45': '--overlay-soft-2',
    '0,0,0,0.5':  '--overlay-mid',
    '0,0,0,0.55': '--overlay-mid-2',
    '0,0,0,0.6':  '--overlay-heavy',
    // hover (rgb 255,255,255) 派生
    '255,255,255,0.03': '--hover-trace',
    '255,255,255,0.1':  '--hover-soft',
    '255,255,255,0.25': '--hover-mid',
    '255,255,255,0.4':  '--hover-mid-2',
    '255,255,255,0.5':  '--hover-strong',
    // jade-bright (rgb 168,212,180) 派生 (constant — light で値変化なし)
    '168,212,180,0.4':  '--jade-bright-mid',
    '168,212,180,0.55': '--jade-bright-strong',
  },
};

// Tokens defined in styles.css (built dynamically below).
// Used for fallback-strip: var(--X, raw) -> var(--X) if X is defined.
const definedTokens = new Set();
// Token-name prefixes to EXCLUDE from fallback-strip (font / safe-area might
// legitimately want fallback for older browsers).
const STRIP_EXCLUDE_PREFIXES = ['--f-', '--safe-'];

const stats = { hex: 0, rgba: 0, skippedDeclLines: 0, fallbackStripped: 0 };

function expandHex(h) {
  // #abc -> #aabbcc, #aabbcc -> #aabbcc
  const lower = h.toLowerCase();
  if (lower.length === 4) {
    return '#' + lower[1] + lower[1] + lower[2] + lower[2] + lower[3] + lower[3];
  }
  return lower.slice(0, 7); // truncate any extra (e.g., #aabbccdd alpha hex -> ignore)
}

function normAlpha(a) {
  // Parse alpha to numeric, return string without trailing zeros.
  // ".5" -> "0.5", "0.50" -> "0.5", "0.05" -> "0.05", "0" -> "0", "1" -> "1"
  const n = parseFloat(a);
  if (Number.isNaN(n)) return a;
  // toString naturally drops trailing zeros: (0.5).toString() === "0.5"
  return n.toString();
}

let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// Pass 0: build definedTokens set from --name: declarations.
for (const line of lines) {
  const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:/);
  if (m) definedTokens.add(m[1]);
}

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];

  // Skip lines that declare a CSS custom property (--name: value;) — those ARE the token defs.
  if (/^\s*--[a-zA-Z0-9-]+\s*:/.test(line)) {
    stats.skippedDeclLines++;
    continue;
  }

  // Negative lookbehind: skip values that sit inside a var(--name, <fallback>)
  // fallback position. Replacing the fallback with a var() would create
  // pointless `var(--X, var(--Y))` chains.

  // Replace #hex (3 or 6 char). Word boundary prevents matching inside #aabbccff.
  line = line.replace(/(?<!var\(--[a-zA-Z0-9-]+,\s{0,8})#[0-9a-fA-F]{3,6}\b/g, (m) => {
    const norm = expandHex(m);
    if (norm.length !== 7) return m;
    if (colorMap.hex[norm]) {
      stats.hex++;
      return `var(${colorMap.hex[norm]})`;
    }
    return m;
  });

  // Replace rgba(R, G, B, A). Allow optional spaces.
  line = line.replace(
    /(?<!var\(--[a-zA-Z0-9-]+,\s{0,8})rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+|0|1(?:\.0+)?)\s*\)/g,
    (m, r, g, b, a) => {
      const key = `${parseInt(r)},${parseInt(g)},${parseInt(b)},${normAlpha(a)}`;
      if (colorMap.rgba[key]) {
        stats.rgba++;
        return `var(${colorMap.rgba[key]})`;
      }
      return m;
    }
  );

  // Fallback-strip: var(--name, <fallback>) -> var(--name).
  // Fallback must be paren-free (skips nested var() — handled separately).
  // Token must be defined AND not in STRIP_EXCLUDE_PREFIXES.
  line = line.replace(
    /var\((--[a-zA-Z0-9-]+),\s*[^()]+?\)/g,
    (m, name) => {
      if (!definedTokens.has(name)) return m;
      if (STRIP_EXCLUDE_PREFIXES.some((p) => name.startsWith(p))) return m;
      stats.fallbackStripped++;
      return `var(${name})`;
    }
  );

  lines[i] = line;
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log(`[color-sweep] hex=${stats.hex} rgba=${stats.rgba} fallback-stripped=${stats.fallbackStripped} skipped-decl-lines=${stats.skippedDeclLines}`);
