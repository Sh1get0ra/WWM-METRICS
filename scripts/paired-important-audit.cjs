#!/usr/bin/env node
// Find paired !important decls between styles.css (base) and styles-light.css.
//
// Logic:
//   For each light rule X { prop: V !important; },
//   check if a base rule with selector matching X (with html[data-theme="light"]
//   prefix stripped) exists AND that base rule has the same prop with !important.
//
// If yes — both !important can be dropped:
//   - light specificity (0,2,1) > base (0,1,0) → light wins natural cascade
//   - both rules retain value, just lose !important flag
//
// Output:
//   scripts/.paired-important.json — full data
//   stdout — summary

const fs = require('fs');

const BASE = 'assets/styles.css';
const LIGHT = 'assets/styles-light.css';

function parseTopLevelRules(src) {
  const rules = [];
  let pos = 0, depth = 0, inStr = null, inCmt = false;
  let segmentStart = 0;
  let braceStart = -1, ruleSelStart = -1;
  let line = 1, ruleStartLine = 1;

  function skipWsAndComments(src, i) {
    while (i < src.length) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (i + 1 < src.length && src[i] === '/' && src[i+1] === '*') {
        i += 2;
        while (i < src.length - 1 && !(src[i] === '*' && src[i+1] === '/')) i++;
        i += 2;
      } else break;
    }
    return i;
  }

  while (pos < src.length) {
    const c = src[pos], n = src[pos+1];
    if (c === '\n') line++;
    if (inCmt) { if (c === '*' && n === '/') { inCmt = false; pos += 2; continue; } pos++; continue; }
    if (inStr) {
      if (c === '\\') { pos += 2; continue; }
      if (c === inStr) inStr = null;
      pos++; continue;
    }
    if (c === '/' && n === '*') { inCmt = true; pos += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; pos++; continue; }

    if (c === '{') {
      if (depth === 0) {
        ruleSelStart = skipWsAndComments(src, segmentStart);
        // ruleStartLine = line where selector starts
        const before = src.slice(0, ruleSelStart);
        ruleStartLine = (before.match(/\n/g) || []).length + 1;
        braceStart = pos;
      }
      depth++; pos++; continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        const sel = src.slice(ruleSelStart, braceStart).trim();
        const body = src.slice(braceStart + 1, pos);
        const ruleEnd = pos + 1;
        // bodyStartLine = line of first char after {
        const beforeBody = src.slice(0, braceStart + 1);
        const bodyStartLine = (beforeBody.match(/\n/g) || []).length + 1;
        rules.push({ sel, body, selStart: ruleSelStart, ruleEnd, ruleStartLine, bodyStartLine });
        segmentStart = ruleEnd;
      }
      pos++; continue;
    }
    pos++;
  }
  return rules;
}

function parseDecls(body, bodyStartLine) {
  const decls = [];
  let i = 0, line = bodyStartLine;
  let buf = '';
  let inStr = null, inCmt = false;
  let parenDepth = 0;
  let declStartLine = bodyStartLine;
  function flush() {
    const text = buf.trim();
    buf = '';
    if (!text) return;
    const m = text.match(/^([a-zA-Z-]+)\s*:\s*([\s\S]*?)(\s*!important)?\s*$/);
    if (!m) return;
    const prop = m[1].toLowerCase();
    const value = m[2].trim();
    const important = !!m[3];
    decls.push({ prop, value, important, line: declStartLine });
  }
  while (i < body.length) {
    const c = body[i], n = body[i+1];
    if (c === '\n') line++;
    if (inCmt) {
      if (c === '*' && n === '/') { inCmt = false; i += 2; continue; }
      i++; continue;
    }
    if (inStr) {
      buf += c;
      if (c === '\\' && i + 1 < body.length) { buf += body[i+1]; i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '/' && n === '*') { inCmt = true; i += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; buf += c; i++; continue; }
    if (c === '(') { parenDepth++; buf += c; i++; continue; }
    if (c === ')') { parenDepth--; buf += c; i++; continue; }
    if (c === ';' && parenDepth === 0) {
      flush();
      declStartLine = line;
      i++; continue;
    }
    if (c === '{') {
      // nested rule (e.g. @media body)? Skip
      let d = 1; i++;
      while (i < body.length && d > 0) {
        if (body[i] === '{') d++;
        if (body[i] === '}') d--;
        if (body[i] === '\n') line++;
        i++;
      }
      buf = '';
      continue;
    }
    if (buf === '' && /\s/.test(c)) { i++; continue; }
    if (buf === '' && !/\s/.test(c)) declStartLine = line;
    buf += c;
    i++;
  }
  flush();
  return decls;
}

function splitTopLevelComma(sel) {
  const out = []; let depth = 0; let last = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(sel.slice(last, i).trim());
      last = i + 1;
    }
  }
  out.push(sel.slice(last).trim());
  return out.filter(Boolean);
}

function stripLightPrefix(sel) {
  // Match `html[data-theme="light"] ` or `html[data-theme='light'] ` at start
  return sel.replace(/^html\[data-theme=["']light["']\]\s+/, '').trim();
}

// Parse base.
const baseSrc = fs.readFileSync(BASE, 'utf8');
const baseRules = parseTopLevelRules(baseSrc);

// Build base index: subSelector → [{ruleIdx, prop, important, line}]
const baseIdx = new Map();
baseRules.forEach((r, ri) => {
  if (r.sel.startsWith('@')) return;
  const decls = parseDecls(r.body, r.bodyStartLine);
  const subs = splitTopLevelComma(r.sel);
  for (const sub of subs) {
    for (const d of decls) {
      const key = `${sub}|${d.prop}`;
      if (!baseIdx.has(key)) baseIdx.set(key, []);
      baseIdx.get(key).push({ ruleIdx: ri, prop: d.prop, important: d.important, line: d.line, value: d.value, sub });
    }
  }
});

// Parse light.
const lightSrc = fs.readFileSync(LIGHT, 'utf8');
const lightRules = parseTopLevelRules(lightSrc);

// Categorize each light !important decl:
//   A: Paired       — base rule(s) with same selector + prop + !important exist
//   B: Base-present — base rule(s) with same selector + prop exist but NO !important
//   C: Orphan       — no base rule with same selector + prop
//
// A = drop both light + all paired base !important.
// B = drop light !important only IF every comma segment is base-present.
// C = drop light !important freely.
//
// Comma-light rules must have ALL segments classified the same and ALL paired
// (for A) before being eligible — otherwise skip (conservative).
const catA = [];
const catB = [];
const catC = [];
let lightImportantTotal = 0;

lightRules.forEach((r, ri) => {
  if (r.sel.startsWith('@')) return;
  const decls = parseDecls(r.body, r.bodyStartLine);
  const subs = splitTopLevelComma(r.sel).map(stripLightPrefix);
  for (const d of decls) {
    if (!d.important) continue;
    lightImportantTotal++;
    // Classify per segment.
    const perSegment = subs.map(sub => {
      const key = `${sub}|${d.prop}`;
      const hits = baseIdx.get(key) || [];
      const important = hits.filter(h => h.important);
      if (important.length) return { sub, cat: 'A', hits: important };
      if (hits.length)     return { sub, cat: 'B', hits };
      return { sub, cat: 'C', hits: [] };
    });
    const cats = new Set(perSegment.map(s => s.cat));
    const baseHits = perSegment.flatMap(s => s.hits);

    const entry = {
      lightRuleIdx: ri,
      prop: d.prop,
      line: d.line,
      sel: r.sel,
      value: d.value,
      perSegment,
      baseHits
    };

    if (cats.size === 1) {
      if (cats.has('A')) catA.push(entry);
      else if (cats.has('B')) catB.push(entry);
      else catC.push(entry);
    } else {
      // Mixed segments → skip (treat as Unsafe).
      entry.cat = 'MIXED';
      // Lump into B for review surface.
      catB.push(entry);
    }
  }
});

console.log(`Light !important total: ${lightImportantTotal}`);
console.log(`  A (paired both !important):   ${catA.length}`);
console.log(`  B (base present, no bang):    ${catB.length}`);
console.log(`  C (no base prop):             ${catC.length}`);
console.log(`\nC samples (safest — drop light !important only):`);
catC.slice(0, 10).forEach(e => console.log(`  L${e.line} ${e.prop}: ${e.value.slice(0, 60)}`));
console.log(`\nA samples (drop both light + base !important):`);
catA.slice(0, 10).forEach(e => {
  const baseLines = e.baseHits.map(b => `L${b.line}`).join(',');
  console.log(`  L${e.line} ${e.prop} ↔ base ${baseLines}`);
});

fs.writeFileSync('scripts/.paired-important.json', JSON.stringify({
  totals: { lightImportantTotal, A: catA.length, B: catB.length, C: catC.length },
  catA, catB, catC
}, null, 2));
console.log('\nWrote scripts/.paired-important.json');
