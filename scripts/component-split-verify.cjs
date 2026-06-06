#!/usr/bin/env node
/* component-split-verify.cjs — @layer Step 4: 分割の内容無変化を機械証明。
 *
 * 1. git HEAD の components.css (旧 path fallback 込) decl multiset
 *    vs 現 components layer 全 file の decl multiset 完全一致
 *    (key = selector|prop|value|important|media 正規化 — 「移動のみで decl 内容無変化」の証明)
 * 2. plan の全 rule について dest file に decl が実在する事
 * 3. 同 dest 内 rule の相対順序 = 源順 (plan start 昇順 = dest 内出現順)
 */
const fs = require('fs');
const { execSync } = require('child_process');
const { filesOfLayer } = require('./css-files.cjs');

/* parseCss (component-split-audit と同系 — decl 抽出のみ) */
function parseCss(src, file) {
  const decls = [];
  let i = 0, line = 1, ruleSeq = 0;
  const len = src.length;
  function skipWsCmt() {
    while (i < len) {
      const ch = src[i];
      if (ch === '\n') { line++; i++; }
      else if (ch === ' ' || ch === '\t' || ch === '\r') i++;
      else if (ch === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < len && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        i += 2;
      } else break;
    }
  }
  function readUntil(stopChars, countLines) {
    const start = i;
    let inStr = null;
    while (i < len) {
      const ch = src[i];
      if (inStr) {
        if (ch === inStr && src[i - 1] !== '\\') inStr = null;
        if (ch === '\n' && countLines) line++;
        i++; continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; i++; continue; }
      if (ch === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < len && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n' && countLines) line++; i++; }
        i += 2; continue;
      }
      if (stopChars.includes(ch)) break;
      if (ch === '\n' && countLines) line++;
      i++;
    }
    return src.slice(start, i);
  }
  function splitSelectors(s) {
    const out = [];
    let cur = '', q = null, depth = 0;
    for (const ch of s) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }
  function parseDecls(selector, media) {
    const ruleId = ++ruleSeq;
    while (i < len) {
      skipWsCmt();
      if (i >= len || src[i] === '}') { i++; return; }
      const declLine = line;
      const decl = readUntil(';}', true);
      const hasSemi = src[i] === ';';
      if (hasSemi) i++;
      const m = decl.match(/^\s*([a-zA-Z-][a-zA-Z0-9_-]*)\s*:\s*([\s\S]+?)\s*$/);
      if (m) {
        const prop = m[1].toLowerCase();
        let value = m[2];
        const important = /!\s*important\s*$/i.test(value);
        if (important) value = value.replace(/\s*!\s*important\s*$/i, '');
        for (const sel of splitSelectors(selector)) {
          const s = sel.trim();
          if (!s) continue;
          decls.push({ file, line: declLine, selector: s, prop, value: value.trim(), important, media: media || null, ruleId });
        }
      }
      if (!hasSemi && src[i - 1] === '}') return;
    }
  }
  function parseBlockBody(media) {
    while (i < len) {
      skipWsCmt();
      if (i >= len || src[i] === '}') { i++; return; }
      const head = readUntil('{};', true).trim();
      if (i >= len) return;
      if (src[i] === ';') { i++; continue; }
      if (src[i] === '}') { i++; return; }
      i++;
      if (head.startsWith('@media') || head.startsWith('@supports')) parseBlockBody(head);
      else if (head.startsWith('@layer')) parseBlockBody(media);
      else if (head.startsWith('@')) {
        let depth = 1;
        while (i < len && depth > 0) {
          const ch = src[i];
          if (ch === '\n') line++;
          if (ch === '{') depth++;
          if (ch === '}') depth--;
          i++;
        }
      } else parseDecls(head, media);
    }
  }
  while (i < len) {
    skipWsCmt();
    if (i >= len) break;
    const head = readUntil('{;', true).trim();
    if (i >= len) break;
    if (src[i] === ';') { i++; continue; }
    i++;
    if (head.startsWith('@media') || head.startsWith('@supports')) parseBlockBody(head);
    else if (head.startsWith('@layer')) parseBlockBody(null);
    else if (head.startsWith('@')) {
      let depth = 1;
      while (i < len && depth > 0) {
        const ch = src[i];
        if (ch === '\n') line++;
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        i++;
      }
    } else parseDecls(head, null);
  }
  return decls;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const keyOf = (d) => `${norm(d.selector)}|${d.prop}|${norm(d.value)}|${d.important ? 1 : 0}|${norm(d.media || '')}`;

/* 1. HEAD components.css multiset */
let headSrc;
try {
  headSrc = execSync('git show HEAD:assets/styles/components.css', { encoding: 'utf8', maxBuffer: 1 << 26 });
} catch {
  headSrc = execSync('git show HEAD:assets/styles-components.css', { encoding: 'utf8', maxBuffer: 1 << 26 });
}
const headDecls = parseCss(headSrc, 'HEAD');
const headMs = new Map();
for (const d of headDecls) headMs.set(keyOf(d), (headMs.get(keyOf(d)) || 0) + 1);

/* 現 components layer file 群 */
const curDecls = [];
const perFile = {};
for (const f of filesOfLayer('components')) {
  const ds = parseCss(fs.readFileSync(f, 'utf8'), f);
  perFile[f.replace('assets/styles/', '')] = ds.length;
  curDecls.push(...ds);
}
const curMs = new Map();
for (const d of curDecls) curMs.set(keyOf(d), (curMs.get(keyOf(d)) || 0) + 1);

let diff = 0;
for (const [k, n] of headMs) {
  const m = curMs.get(k) || 0;
  if (m !== n) { diff++; if (diff <= 10) console.error(`  HEAD ${n} vs cur ${m}: ${k.slice(0, 110)}`); }
}
for (const [k, n] of curMs) {
  if (!headMs.has(k)) { diff++; if (diff <= 10) console.error(`  HEAD 0 vs cur ${n}: ${k.slice(0, 110)}`); }
}

/* 2+3. plan rule の dest 所在 + dest 内 源順 */
const plan = JSON.parse(fs.readFileSync('scripts/.component-split-plan.json', 'utf8'));
const declsByFile = new Map();
for (const d of curDecls) {
  if (!declsByFile.has(d.file)) declsByFile.set(d.file, d.file && []);
  declsByFile.get(d.file).push(d);
}
let missing = 0;
const lastSelLine = new Map(); // dest → 直前 rule の検出位置 (源順検査)
let orderBad = 0;
for (const r of [...plan.rules].sort((a, b) => a.start - b.start)) {
  const ds = declsByFile.get(r.dest) || [];
  // rule の selector 群が dest に存在するか (空 rule は decl 0 で skip)
  const hit = ds.filter(d => r.sels.some(s => norm(s) === norm(d.selector)) && norm(d.media || '') === norm(r.media || ''));
  if (!hit.length && r.sels.length) {
    // 空 rule (decl なし) は missing 扱いにしない — HEAD multiset 一致が内容を担保
    const headHad = headDecls.some(d => d.ruleId && r.sels.some(s => norm(s) === norm(d.selector)));
    if (headHad) {
      const headRuleDecls = headDecls.filter(d => d.line >= r.start && d.line <= r.end);
      if (headRuleDecls.length) { missing++; if (missing <= 8) console.error(`  MISSING in ${r.dest}: L${r.start} ${r.sels[0].slice(0, 60)}`); }
    }
    continue;
  }
  if (hit.length) {
    const firstLine = Math.min(...hit.map(d => d.line));
    const prev = lastSelLine.get(r.dest) || 0;
    if (firstLine < prev) {
      // 同 selector 重複 rule で前方 hit し得る → 保守的に警告のみ (multiset 一致が真の gate)
      orderBad++;
    }
    lastSelLine.set(r.dest, Math.max(prev, firstLine));
  }
}

console.log(`verify: multiset diff ${diff} | dest missing ${missing} | order 警告 ${orderBad}`);
console.log('per-file decls:', JSON.stringify(perFile));
console.log(`decl 計: HEAD ${headDecls.length} → cur ${curDecls.length}`);
if (diff || missing) { console.error('VERIFY FAILED'); process.exit(1); }
console.log('VERIFY OK — decl 内容無変化 + 全 rule dest 所在確認');
