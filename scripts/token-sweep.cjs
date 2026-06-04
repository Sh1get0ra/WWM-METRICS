#!/usr/bin/env node
// Phase 4.3: raw px -> token sweep for assets/styles.css.
// Rules:
//   - font-size: Npx (single value) -> var(--text-*) when N matches token exactly.
//   - padding/margin (incl. -top/-right/-bottom/-left), 1-4 values (Npx/0/auto).
//     Replace ONLY if ALL px values map to existing space tokens.
//   - Skip when ANY value is unmapped px (preserves intentional non-token sizes).
//   - Regex requires bare Npx anchored by ; or }; safely skips calc()/clamp()/var().
//   - Preserve !important and trailing ; or }.

const fs = require('fs');
const path = 'assets/styles.css';

const textMap = {
  '8': '--text-2xs', '10': '--text-xs', '11': '--text-sm',
  '12': '--text-12', '13': '--text-md', '14': '--text-14',
  '15': '--text-15', '16': '--text-lg', '18': '--text-18',
  '20': '--text-20', '22': '--text-xl', '24': '--text-24',
  '28': '--text-2xl', '92': '--text-hero',
};
const spaceMap = {
  '2': '--space-half', '4': '--space-1', '6': '--space-1-5',
  '8': '--space-2', '10': '--space-2-5', '12': '--space-3',
  '14': '--space-3-5', '16': '--space-4', '20': '--space-5',
  '24': '--space-6', '32': '--space-7', '40': '--space-8',
};

const stats = { fontSize: 0, padMar1: 0, padMarMulti: 0, skippedMixed: 0 };

let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /(font-size:\s*)(\d+)px(\s*(?:!important\s*)?[;}])/g,
  (m, prefix, n, suffix) => {
    if (textMap[n]) {
      stats.fontSize++;
      return `${prefix}var(${textMap[n]})${suffix}`;
    }
    return m;
  }
);

content = content.replace(
  /((?:padding|margin)(?:-(?:top|right|bottom|left))?:\s*)((?:\d+px|auto|0)(?:\s+(?:\d+px|auto|0)){0,3})(\s*(?:!important\s*)?[;}])/g,
  (m, prefix, valsRaw, suffix) => {
    const values = valsRaw.trim().split(/\s+/);
    const newVals = [];
    for (const v of values) {
      if (v.endsWith('px')) {
        const n = v.slice(0, -2);
        if (spaceMap[n]) {
          newVals.push(`var(${spaceMap[n]})`);
        } else {
          stats.skippedMixed++;
          return m;
        }
      } else if (v === 'auto' || v === '0') {
        newVals.push(v);
      } else {
        stats.skippedMixed++;
        return m;
      }
    }
    if (values.length === 1) stats.padMar1++;
    else stats.padMarMulti++;
    return `${prefix}${newVals.join(' ')}${suffix}`;
  }
);

fs.writeFileSync(path, content, 'utf8');
console.log(`[token-sweep] font-size=${stats.fontSize} pad-mar-1=${stats.padMar1} pad-mar-multi=${stats.padMarMulti} skipped-mixed=${stats.skippedMixed}`);
