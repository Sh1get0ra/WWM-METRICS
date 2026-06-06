#!/usr/bin/env node
/* responsive-dissolve-audit.cjs — @layer Step 3: styles-responsive.css 解体 audit
 *
 * 理論 (flip 可能域 = layer 0..3 のみ):
 *   responsive(3) の decl を base(0)/components(1)/modals(2) へ移すと、
 *   normal decl は力が一方向に低下のみ (移動前は components/modals に無条件勝ち)、
 *   imp decl は layer 逆転 (earlier 勝ち) で力が一方向に上昇のみ。
 *   dark/light/obs (4/5/8) は normal なら before/after 共 g 勝ち、 imp なら共 e 勝ち
 *   → theme/obs layer は両極性で勝敗不変 = 検査 pool から除外可 (機械証明)。
 *
 * 粒度: rule 単位 all-or-none (1 decl でも flip → rule 残置)。
 * dest: componentTargetFile (selector token → base file 出現数 argmax、 tie 後 layer)。
 * 位置: dest file 末尾 append (= dest layer 内 source order 最大)。
 *   移動 rule の相対順序は源順保存 → 同 dest 同 spec の intra-responsive 依存
 *   (例 480px vs 359px hero-number) は自動保存。 異 dest は layer 順で fixpoint 検証。
 * GLOBAL keep: subject html/body 系 rule は responsive-globals として残置 (意味論)。
 *
 * 出力: scripts/.responsive-dissolve-plan.json (apply 用) + 残置理由内訳
 */
const fs = require('fs');
const path = require('path');

/* ── parseCss (theme-swap-audit.cjs 同系 + rule extent 記録) ── */
function parseCss(src, file, rulesOut) {
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
  function parseBlockBody(media) {
    while (i < len) {
      skipWsCmt();
      if (i >= len || src[i] === '}') { i++; return; }
      const selStart = line;
      const head = readUntil('{};', true).trim();
      if (i >= len) return;
      if (src[i] === ';') { i++; continue; }
      if (src[i] === '}') { i++; return; }
      i++;
      if (head.startsWith('@media') || head.startsWith('@supports')) {
        parseBlockBody(head);
      } else if (head.startsWith('@layer')) {
        parseBlockBody(media);
      } else if (head.startsWith('@')) {
        let depth = 1;
        while (i < len && depth > 0) {
          const ch = src[i];
          if (ch === '\n') line++;
          if (ch === '{') depth++;
          if (ch === '}') depth--;
          i++;
        }
      } else {
        parseDecls(head, selStart, media);
      }
    }
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
  function parseDecls(selector, selLine, media) {
    const ruleId = ++ruleSeq;
    const sels = splitSelectors(selector).map(s => s.trim()).filter(Boolean);
    const endRule = () => {
      if (rulesOut) rulesOut.set(ruleId, { ruleId, file, start: selLine, end: line, media: media || null, sels, raw: selector });
    };
    while (i < len) {
      skipWsCmt();
      if (i >= len || src[i] === '}') { endRule(); i++; return; }
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
        for (const s of sels) {
          decls.push({ file, line: declLine, selector: s, prop, value: value.trim(), important, media: media || null, ruleId, ruleStart: selLine });
        }
      }
      if (!hasSemi && src[i - 1] === '}') { endRule(); return; }
    }
    endRule();
  }
  while (i < len) {
    skipWsCmt();
    if (i >= len) break;
    const selStart = line;
    const head = readUntil('{;', true).trim();
    if (i >= len) break;
    if (src[i] === ';') { i++; continue; }
    i++;
    if (head.startsWith('@media') || head.startsWith('@supports')) {
      parseBlockBody(head);
    } else if (head.startsWith('@layer')) {
      parseBlockBody(null);
    } else if (head.startsWith('@')) {
      let depth = 1;
      while (i < len && depth > 0) {
        const ch = src[i];
        if (ch === '\n') line++;
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        i++;
      }
    } else {
      parseDecls(head, selStart, null);
    }
  }
  return decls;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function specificity(sel) {
  let safe = sel.replace(/\[[^\]]*\]/g, '[ATTR]');
  safe = safe.replace(/:(nth-[\w-]+|lang|dir)\(([^)]*)\)/g, ':$1()');
  let a = 0, b = 0, c = 0;
  for (const m of safe.matchAll(/#[\w-]+/g)) a++;
  for (const m of safe.matchAll(/\.[\w-]+|\[ATTR\]|:(?!:)[\w-]+(\([^)]*\))?/g)) {
    if (/^:(not|is|where|has)/.test(m[0])) continue;
    b++;
  }
  for (const m of safe.matchAll(/(^|[\s>+~(])([a-zA-Z][\w-]*)/g)) c++;
  for (const m of safe.matchAll(/::[\w-]+/g)) c++;
  return a * 10000 + b * 100 + c;
}

function compoundKeys(sel) {
  const safe = sel.replace(/\[[^\]]*\]/g, '[]');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || safe;
  const tokens = last.match(/(\.[\w-]+|#[\w-]+|\[\]|::?[\w-]+(\([^)]*\))?|[a-zA-Z][\w-]*|\*)/g) || [last];
  let pseudoEl = '';
  const bases = [];
  for (const t of tokens) {
    if (t.startsWith('::') || /^:(before|after|placeholder|selection|first-line|first-letter)$/.test(t)) {
      pseudoEl = t.replace(/^:(?=[a-z])/, '::');
    } else if (t.startsWith(':') || t === '[]') {
      // pseudo-class / attr → 畳む
    } else {
      bases.push(t);
    }
  }
  if (bases.length === 0) bases.push('*');
  const keys = new Set(bases.map(b => b + pseudoEl));
  keys.add(bases.sort().join('') + pseudoEl);
  return [...keys];
}

function propGroup(prop) {
  const p = prop.toLowerCase();
  if (/^margin(-|$)/.test(p)) return 'margin';
  if (/^padding(-|$)/.test(p)) return 'padding';
  if (/^flex(-flow|-direction|-wrap|-grow|-shrink|-basis)?$/.test(p)) return 'flex';
  if (/^grid-(area|row|column)/.test(p)) return 'grid-place';
  if (/^overflow(-|$)/.test(p)) return 'overflow';
  if (/^border(-(top|bottom)-(left|right))?-radius/.test(p)) return 'border-radius';
  if (/^border/.test(p)) return 'border';
  if (/^background(-|$)/.test(p)) return 'background';
  if (/^font(-|$)/.test(p)) return 'font';
  if (/^(gap|row-gap|column-gap)$/.test(p)) return 'gap';
  if (/^(inset|top|right|bottom|left)$/.test(p)) return 'inset';
  if (/^(width|min-width|max-width)$/.test(p)) return 'width';
  if (/^(height|min-height|max-height)$/.test(p)) return 'height';
  if (/^text-decoration/.test(p)) return 'text-decoration';
  if (/^outline(-|$)/.test(p)) return 'outline';
  if (/^(animation|transition)(-|$)/.test(p)) return p.split('-')[0];
  if (/^(place|align|justify)-/.test(p)) return 'box-align';
  return p;
}
const REAL_SHORTHANDS = new Set([
  'margin', 'padding', 'flex', 'flex-flow', 'overflow', 'border', 'background',
  'font', 'gap', 'inset', 'animation', 'transition', 'text-decoration', 'grid-area',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'grid-row', 'grid-column', 'place-items', 'place-content', 'place-self',
  'outline'
]);
function propsConflict(a, b) {
  if (a === b) return true;
  if (REAL_SHORTHANDS.has(a) && propGroup(a) === propGroup(b)) return true;
  if (REAL_SHORTHANDS.has(b) && propGroup(b) === propGroup(a)) return true;
  return false;
}
// dp が ep を完全遮蔽 (同 prop or ep 全成分を reset する祖先 shorthand) — theme-swap-audit S2-j 同系
const shadowProp = (dp, ep) => dp === ep || (REAL_SHORTHANDS.has(dp) && ep.startsWith(dp + '-') && propGroup(dp) === propGroup(ep));

/* shorthand → 成分抽出 (theme-swap-audit 同系 + margin 追加)。 成分同値なら shorthand↔longhand 競合は harmless */
const BORDER_STYLE_RE = /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/i;
function splitTop(v) {
  const out = []; let depth = 0, cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function extractForProp(val, fromProp, toProp) {
  if (fromProp === toProp) return val;
  if (/^border(-(top|right|bottom|left))?$/.test(fromProp) && /^border(-(top|right|bottom|left))?-color$/.test(toProp)) {
    const fromSide = (fromProp.match(/^border-(top|right|bottom|left)$/) || [])[1] || null;
    const toSide = (toProp.match(/^border-(top|right|bottom|left)-color$/) || [])[1] || null;
    if (fromSide && toSide && fromSide !== toSide) return null;
    if (fromSide && !toSide) return null;
    const parts = splitTop(val).filter(p => !/^[\d.]+(px|em|rem|%)?$/.test(p) && !BORDER_STYLE_RE.test(p) && !/^(thin|medium|thick)$/i.test(p));
    return parts.length === 1 ? parts[0] : null;
  }
  if (fromProp === 'outline' && toProp === 'outline-color') {
    const parts = splitTop(val).filter(p => !/^[\d.]+(px|em|rem|%)?$/.test(p) && !BORDER_STYLE_RE.test(p) && !/^(thin|medium|thick|auto)$/i.test(p));
    return parts.length === 1 ? parts[0] : null;
  }
  if (/^(padding|margin)$/.test(fromProp) && new RegExp(`^${fromProp}-(top|right|bottom|left)$`).test(toProp)) {
    const p = splitTop(val);
    if (p.length < 1 || p.length > 4) return null;
    const [t, r = t, b = t, l = r] = p;
    return { top: t, right: r, bottom: b, left: l }[toProp.slice(fromProp.length + 1)];
  }
  if (fromProp === 'inset' && /^(top|right|bottom|left)$/.test(toProp)) {
    const p = splitTop(val);
    if (p.length < 1 || p.length > 4) return null;
    const [t, r = t, b = t, l = r] = p;
    return { top: t, right: r, bottom: b, left: l }[toProp];
  }
  if (fromProp === 'border' && /^border-(top|right|bottom|left)$/.test(toProp)) return val;
  return null;
}

const EXCLUSIVE_CLASS_GROUPS = [
  // Step 3: .wwm-modal (modal root 8 出現: app/import/arsenal/diag/gear/share/unknown/xinfa) と
  // .wwm-analysis-card (history/ranking/opt — wwm-modal-square は併持するが wwm-modal は無し) は
  // 同 element 不可。 classList 動的付与ゼロ (2026-06-06 grep 証明)
  ['wwm-modal', 'wwm-analysis-card'],
  ['rank-max', 'rank-gold', 'rank-purple', 'rank-blue'],
  ['reset-btn', 'note-btn', 'export-btn', 'import-btn', 'share-btn', 'icon-btn-x'],
  ['wwm-analysis-tab', 'lang-btn', 'wwm-opt-sort-btn', 'preset-btn', 'wwm-setup-tab', 'wwm-note-tab'],
  ['hero-tier', 'wwm-sb-tier-badge', 'tier-badge-baseline'],
  ['tier-SS', 'tier-S', 'tier-A', 'tier-B', 'tier-C'],
  ['wwm-cmp-modal-a', 'wwm-diag-modal', 'wwm-lang-picker'],
];
function subjectClassSet(sel) {
  const safe = sel.replace(/\[[^\]]*\]/g, '[]');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || safe;
  return new Set((last.match(/\.[\w-]+/g) || []).map(c => c.slice(1)));
}
const EXCLUSIVE_ANCESTOR_GROUPS = [
  [['top-controls-2row', 'topbar-row', 'lang-switcher-row'],
   ['wwm-mobile-drawer', 'wwm-mobile-drawer-langs', 'wwm-mobile-drawer-body']],
  [['luopan-inner', 'luopan', 'hero-wuxia'], ['wwm-good-icon', 'wwm-note-btn', 'wwm-note-list']],
  [['wwm-equip-section'], ['wwm-note-list', 'wwm-note-tab']],
  [['wwm-overlay-ctrl'], ['wwm-arsenal-custom', 'wwm-arsenal-modal', 'wwm-mobile-anlz-overlay-body']],
  [['wwm-opt-ratio-label'], ['wwm-arsenal-custom', 'wwm-arsenal-modal']],
  [['wwm-view-sidebar'], ['wwm-sidebar-in-overlay', 'wwm-mobile-stat-overlay-body', 'wwm-mobile-stat-overlay']],
  [['wwm-step2'], ['wwm-cmp-modal-a']],
  // Step 3: arsenal modal 内に .wwm-cmp-val-input 出現ゼロ (arsenal.js grep 証明 —
  // 武庫 num-input は wwm-num-input 単独。 val-input は gear/xinfa modal のみ)
  [['wwm-arsenal-modal'], ['wwm-cmp-val-input']],
];
function allClassSet(sel) {
  const safe = sel.replace(/\[[^\]]*\]/g, '[]');
  return new Set((safe.match(/\.[\w-]+/g) || []).map(c => c.slice(1)));
}
function exclusiveDisjoint(selA, selB) {
  const a = subjectClassSet(selA), b = subjectClassSet(selB);
  for (const group of EXCLUSIVE_CLASS_GROUPS) {
    const ra = group.filter(m => a.has(m));
    const rb = group.filter(m => b.has(m));
    if (ra.length && rb.length && !ra.some(m => rb.includes(m))) return true;
  }
  const fa = allClassSet(selA), fb = allClassSet(selB);
  for (const [setA, setB] of EXCLUSIVE_ANCESTOR_GROUPS) {
    const aInA = setA.some(m => fa.has(m)), aInB = setB.some(m => fa.has(m));
    const bInA = setA.some(m => fb.has(m)), bInB = setB.some(m => fb.has(m));
    if ((aInA && !aInB && bInB && !bInA) || (aInB && !aInA && bInA && !bInB)) return true;
  }
  return false;
}

/* ── selCovers (theme-swap-audit S2-h 同系: DOM 包含 + subject implication) ── */
const DOM_CONTAINMENT = new Map([
  ['.wwm-cmp-current', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-kongfu-select', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-set-select', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-stat-select', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-val-input', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-lv-select', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-lv', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-new', ['.wwm-cmp-modal-a']],
]);
const SUBJECT_IMPLICATION = new Map([
  ['.wwm-cmp-modal-a', ['.wwm-modal', '.wwm-modal-square']],
]);
function expandCompound(set) {
  const out = new Set(set);
  for (const t of set) for (const a of (SUBJECT_IMPLICATION.get(t) || [])) out.add(a);
  return out;
}
function selCovers(gSel, sel) {
  if (norm(gSel) === norm(sel)) return true;
  const peOf = (s) => (s.match(/::?(before|after|placeholder|selection|first-line|first-letter)\s*$/) || [null])[0];
  const gPe = peOf(gSel), sPe = peOf(sel);
  if (gPe || sPe) {
    const normPe = (x) => x && x.replace(/^:+/, '::');
    if (normPe(gPe) !== normPe(sPe)) return false;
    return selCovers(gSel.replace(/::?[\w-]+\s*$/, ''), sel.replace(/::?[\w-]+\s*$/, ''));
  }
  if (/[>+~]|::|:not|:is|:where|:has/.test(gSel)) return false;
  if (/[+~]/.test(sel)) return false;
  const split = (s) => s.split(/\s+/).filter(Boolean).map(part =>
    new Set(part.match(/(\.[\w-]+|#[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?|[a-zA-Z][\w-]*|\*)/g) || [part]));
  const gParts = split(norm(gSel)), sParts = split(norm(sel).replace(/\s*>\s*/g, ' ')).map(expandCompound);
  if (!gParts.length || !sParts.length) return false;
  const subset = (a, b) => [...a].every(t => b.has(t));
  if (!subset(gParts[gParts.length - 1], sParts[sParts.length - 1])) return false;
  let si = sParts.length - 2;
  for (let gi = gParts.length - 2; gi >= 0; gi--) {
    let found = false;
    for (; si >= 0; si--) {
      if (subset(gParts[gi], sParts[si])) { found = true; si--; break; }
    }
    if (!found && gi === 0) {
      const limit = (gParts.length - 2 > 0) ? si : sParts.length - 1;
      for (let idx = 0; idx <= limit && !found; idx++) {
        const implied = new Set();
        for (const t of sParts[idx]) for (const a of (DOM_CONTAINMENT.get(t) || [])) {
          implied.add(a);
          for (const a2 of (SUBJECT_IMPLICATION.get(a) || [])) implied.add(a2);
        }
        if (implied.size && subset(gParts[0], implied)) found = true;
      }
      if (found) { si = -1; break; }
    }
    if (!found) return false;
  }
  return true;
}

/* ── media overlap (Step 3 新規) ──
 * width 軸: max-width/min-width interval 交差判定。
 * prefers-reduced-motion / @supports 等 非 width 軸は環境直交 → 排他に使えない (常に交差扱い = 保守的) */
function parseMediaWidth(m) {
  if (!m) return { min: 0, max: Infinity };
  const maxW = [...m.matchAll(/\(max-width:\s*([\d.]+)px\)/g)].map(x => +x[1]);
  const minW = [...m.matchAll(/\(min-width:\s*([\d.]+)px\)/g)].map(x => +x[1]);
  return { min: minW.length ? Math.max(...minW) : 0, max: maxW.length ? Math.min(...maxW) : Infinity };
}
function mediaOverlap(a, b) {
  const A = parseMediaWidth(a), B = parseMediaWidth(b);
  return Math.max(A.min, B.min) <= Math.min(A.max, B.max);
}
/* h.media が overlap(a,b) の全環境を cover するか — width-only (非 width 条件付き h は保守的 false。
 * 例外: h.media が a/b いずれかと文字列一致なら当該軸も一致 = cover) */
function mediaCoversIntersection(hM, aM, bM) {
  const hs = norm(hM || ''), as = norm(aM || ''), bs = norm(bM || '');
  if (hs === as || hs === bs) {
    // 同一 media — width 軸は他方との交差を含む必要あり
    const H = parseMediaWidth(hM), A = parseMediaWidth(aM), B = parseMediaWidth(bM);
    return H.min <= Math.max(A.min, B.min) && H.max >= Math.min(A.max, B.max);
  }
  if (hM && /prefers-|supports|orientation|hover|pointer|aspect|resolution/.test(hM)) return false;
  const H = parseMediaWidth(hM), A = parseMediaWidth(aM), B = parseMediaWidth(bM);
  return H.min <= Math.max(A.min, B.min) && H.max >= Math.min(A.max, B.max);
}

/* ── pool: flip 可能域 = layer 0..3 のみ (header コメント参照) ── */
const LAYER_ORDER = new Map([
  ['assets/styles-base.css', 0],
  ['assets/styles-components.css', 1],
  ['assets/styles-modals.css', 2],
  ['assets/styles-responsive.css', 3],
]);
const SRC_FILE = 'assets/styles-responsive.css';
const DEST_FILES = ['assets/styles-base.css', 'assets/styles-components.css', 'assets/styles-modals.css'];

const ruleMeta = new Map(); // SRC_FILE のみ extent 記録
const pool = [];
for (const f of LAYER_ORDER.keys()) {
  pool.push(...parseCss(fs.readFileSync(f, 'utf8'), f, f === SRC_FILE ? ruleMeta : null));
}
const rDecls = pool.filter(d => d.file === SRC_FILE);

/* token map (値同値判定の var() 解決用 — 両 theme で同値なら harmless) */
const themeTokenMaps = { light: new Map(), dark: new Map() };
for (const d of parseCss(fs.readFileSync('assets/styles-tokens.css', 'utf8'), 'assets/styles-tokens.css')) {
  if (!d.prop.startsWith('--')) continue;
  themeTokenMaps.light.set(d.prop, d.value);
  themeTokenMaps.dark.set(d.prop, d.value);
}
for (const f of ['assets/styles-light.css', 'assets/styles-dark.css']) {
  for (const d of parseCss(fs.readFileSync(f, 'utf8'), f)) {
    if (!d.prop.startsWith('--')) continue;
    themeTokenMaps[f.includes('light') ? 'light' : 'dark'].set(d.prop, d.value);
  }
}
function resolveCtx(value, ctx) {
  const map = themeTokenMaps[ctx];
  let v = value;
  for (let i = 0; i < 10; i++) {
    const next = v
      .replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, n) => map.has(n) ? map.get(n) : m)
      .replace(/var\(\s*(--[\w-]+)\s*,\s*([^()]+)\)/g, (m, n, fb) => map.has(n) ? map.get(n) : fb);
    if (next === v) break;
    v = next;
  }
  return v.replace(/\s+/g, ' ').trim().toLowerCase();
}
const valuesEqBothThemes = (a, b) =>
  resolveCtx(a, 'light') === resolveCtx(b, 'light') && resolveCtx(a, 'dark') === resolveCtx(b, 'dark');

/* ── DOM 共起 class map (theme-swap-audit 同系) ── */
function buildCoOccurrence() {
  const coMap = new Map();
  const glob = (dir) => {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...glob(p));
      else if (ent.name.endsWith('.js')) out.push(p);
    }
    return out;
  };
  const sources = [fs.readFileSync('index.html', 'utf8'), ...glob('assets').map(f => fs.readFileSync(f, 'utf8'))];
  const addPair = (a, b) => {
    if (a === b) return;
    if (!coMap.has(a)) coMap.set(a, new Set());
    coMap.get(a).add(b);
  };
  for (const src of sources) {
    for (const m of src.replace(/\$\{[^{}]*\}/g, ' ').replace(/\$\{[^{}]*\}/g, ' ').matchAll(/<\w+([^<>]{0,500}?)>/g)) {
      const attrs = m[1];
      const idM = attrs.match(/\bid="([\w-]+)"|\bid='([\w-]+)'/);
      const clsM = attrs.match(/\bclass="([^"]{1,300})"|\bclass='([^']{1,300})'/);
      const tokens = [];
      if (idM) tokens.push('#' + (idM[1] || idM[2]));
      if (clsM) for (const c of (clsM[1] || clsM[2]).split(/\s+/).filter(Boolean)) {
        if (/^[\w-]+$/.test(c)) tokens.push('.' + c);
      }
      for (const a of tokens) for (const b of tokens) addPair(a, b);
    }
  }
  return coMap;
}
const coMap = buildCoOccurrence();
function expandKeys(keys) {
  const out = new Set(keys);
  for (const k of keys) {
    const m = k.match(/^([.#][\w-]+)(::.+)?$/);
    if (!m) continue;
    const pseudoEl = m[2] || '';
    for (const co of (coMap.get(m[1]) || [])) out.add(co + pseudoEl);
  }
  return [...out];
}

const byKey = new Map();
for (const d of pool) {
  if (d.prop.startsWith('--')) continue;
  for (const k of compoundKeys(d.selector)) {
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(d);
  }
}

/* ── dest 選定 (theme-swap-audit componentTargetFile 同系) ── */
function componentTargetFile(sels) {
  const tokens = new Set();
  for (const s of sels) for (const t of s.match(/[.#][\w-]+/g) || []) tokens.add(t);
  if (!tokens.size) return null;
  const res = [...tokens].map(t => new RegExp(t.replace(/[.[\]]/g, '\\$&') + '(?![\\w-])'));
  const score = new Map();
  const seenRule = new Set();
  for (const b of pool) {
    if (!DEST_FILES.includes(b.file)) continue;
    const rk = `${b.file}|${b.ruleId}|${norm(b.selector)}`;
    if (seenRule.has(rk)) continue;
    seenRule.add(rk);
    if (res.some(re => re.test(b.selector))) score.set(b.file, (score.get(b.file) || 0) + 1);
  }
  let best = null, bestN = 0;
  for (const f of DEST_FILES) {
    const n = score.get(f) || 0;
    if (n >= bestN && n > 0) { best = f; bestN = n; }
  }
  // mobile-only class (base rule 無し、 例 .wwm-mobile-* / .flash-pulse) → components fallback
  // (theme-swap-audit componentTargetFile と同方針。 Step 4 で mobile-overlay file へ再分割)
  return best || 'assets/styles-components.css';
}

/* ── rule 群構築 ── */
// GLOBAL keep = subject (最終 compound) が html/body の rule のみ (viewport/scroll 土台 = responsive-globals)。
// prefix に body.wwm-layout-active を持つだけの component rule は移動候補
function isGlobalSubject(sel) {
  const safe = norm(sel).replace(/\[[^\]]*\]/g, '[]');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || safe;
  return /^(html|body)([.:[]|$)/.test(last);
}
const rules = [];
const declsByRule = new Map();
for (const d of rDecls) {
  if (!declsByRule.has(d.ruleId)) declsByRule.set(d.ruleId, []);
  declsByRule.get(d.ruleId).push(d);
}
for (const [ruleId, meta] of ruleMeta) {
  const decls = declsByRule.get(ruleId) || [];
  const r = { ...meta, decls, status: 'move', reason: null, blocker: null, dest: null };
  if (!decls.length) { r.status = 'keep'; r.reason = 'empty'; rules.push(r); continue; }
  if (!meta.media) { r.status = 'keep'; r.reason = 'no-media'; rules.push(r); continue; }
  // GLOBAL: rule 内のいずれかの selector の subject が html/body → responsive-globals 残置
  if (meta.sels.some(isGlobalSubject)) { r.status = 'keep'; r.reason = 'global'; rules.push(r); continue; }
  const dest = componentTargetFile(meta.sels);
  if (!dest) { r.status = 'keep'; r.reason = 'no-token'; rules.push(r); continue; }
  r.dest = dest;
  rules.push(r);
}
const ruleById = new Map(rules.map(r => [r.ruleId, r]));

/* ── fixpoint: 移動候補 rule の全 decl が flip 0 になるまで drop ── */
const BIG = 1e6;
function posOf(d) {
  // d が SRC_FILE 所属で当該 rule が batch (move) → final = dest layer / 末尾 (BIG + 元 line: 源順保存)
  if (d.file === SRC_FILE) {
    const r = ruleById.get(d.ruleId);
    if (r && r.status === 'move') return { L: LAYER_ORDER.get(r.dest), s: specificity(d.selector), l: BIG + d.line };
    return { L: 3, s: specificity(d.selector), l: d.line };
  }
  return { L: LAYER_ORDER.get(d.file), s: specificity(d.selector), l: d.line };
}
function win(a, b, imp) {
  if (a.L !== b.L) return imp ? a.L < b.L : a.L > b.L;
  if (a.s !== b.s) return a.s > b.s;
  return a.l > b.l;
}
function posBefore(d) { return { L: LAYER_ORDER.get(d.file), s: specificity(d.selector), l: d.line }; }

/* ── dominator 推論 (S2-h cascade-max cover 同型) ──
 * flip(e,g) でも、 第三 decl h が:
 *   (1) shadowProp(h.prop ⊇ e.prop) ∧ shadowProp(h.prop ⊇ g.prop)
 *   (2) selCovers(h.sel ⊇ e.sel) or selCovers(h.sel ⊇ g.sel)  — overlap(e,g) ⊆ 両 match 集合
 *   (3) h.media が overlap(e.media, g.media) の全環境を cover
 *   (4) h が e と g の両方に before/after 両状態で cascade 勝ち
 * なら overlap 全 element の winner = h (両状態) → e↔g の順序変化は表示不変 = harmless */
function cmpWins(h, x, state) {
  if (!!h.important !== !!x.important) return !!h.important; // imp は normal に常勝
  const ph = state === 'before' ? posBefore(h) : posOf(h);
  const px = state === 'before' ? posBefore(x) : posOf(x);
  return win(ph, px, h.important);
}
function dominated(e, g) {
  const seen = new Set();
  for (const baseSel of [e.selector, g.selector]) {
    for (const key of expandKeys(compoundKeys(baseSel))) {
      for (const h of byKey.get(key) || []) {
        if (h === e || h === g) continue;
        if (h.file === e.file && h.line === e.line && h.prop === e.prop) continue;
        if (h.file === g.file && h.line === g.line && h.prop === g.prop) continue;
        const hid = `${h.file}|${h.line}|${norm(h.selector)}|${h.prop}`;
        if (seen.has(hid)) continue;
        seen.add(hid);
        // 競合成分 (contested) = e/g の狭い方 (一方が他方を遮蔽する時)。 h は contested を遮蔽すれば十分
        // (例 e=border g=border-color → contested=border-color、 h=border-color rule で cover 可)
        let okProp;
        if (shadowProp(e.prop, g.prop)) okProp = shadowProp(h.prop, g.prop);
        else if (shadowProp(g.prop, e.prop)) okProp = shadowProp(h.prop, e.prop);
        else okProp = shadowProp(h.prop, e.prop) && shadowProp(h.prop, g.prop);
        if (!okProp) continue;
        if (!(selCovers(h.selector, e.selector) || selCovers(h.selector, g.selector))) continue;
        if (!mediaCoversIntersection(h.media, e.media, g.media)) continue;
        if (cmpWins(h, e, 'before') && cmpWins(h, g, 'before') &&
            cmpWins(h, e, 'after') && cmpWins(h, g, 'after')) return hid;
      }
    }
  }
  return null;
}

let pass = 0;
let domCount = 0;
let changed = true;
while (changed) {
  changed = false;
  pass++;
  for (const r of rules) {
    if (r.status !== 'move') continue;
    outer:
    for (const e of r.decls) {
      const before = { L: 3, s: specificity(e.selector), l: e.line };
      const after = { L: LAYER_ORDER.get(r.dest), s: before.s, l: BIG + e.line };
      const seen = new Set();
      for (const key of expandKeys(compoundKeys(e.selector))) {
        for (const g of byKey.get(key) || []) {
          if (g.file === e.file && g.ruleId === e.ruleId) continue;        // 自 rule (丸ごと移動 = 内部不変)
          const gid = `${g.file}|${g.line}|${norm(g.selector)}|${g.prop}`;
          if (seen.has(gid)) continue;
          seen.add(gid);
          if (!propsConflict(g.prop, e.prop)) continue;
          if (!mediaOverlap(e.media, g.media)) continue;
          if (!!g.important !== !!e.important) continue;                   // imp↔normal は移動不変
          if (exclusiveDisjoint(e.selector, g.selector)) continue;
          if (g.prop === e.prop && valuesEqBothThemes(g.value, e.value)) continue;
          // shorthand↔longhand: 競合成分が同値なら harmless (例 margin: 0 auto vs margin-bottom: 0)
          if (g.prop !== e.prop && shadowProp(g.prop, e.prop)) {
            const ext = extractForProp(g.value, g.prop, e.prop);
            if (ext !== null && valuesEqBothThemes(ext, e.value)) continue;
          }
          if (g.prop !== e.prop && shadowProp(e.prop, g.prop)) {
            const ext = extractForProp(e.value, e.prop, g.prop);
            if (ext !== null && valuesEqBothThemes(ext, g.value)) continue;
          }
          const gBefore = { L: LAYER_ORDER.get(g.file), s: specificity(g.selector), l: g.line };
          const gAfter = posOf(g);
          const beforeEWins = win(before, gBefore, e.important);
          const afterEWins = win(after, gAfter, e.important);
          if (beforeEWins !== afterEWins) {
            const dom = dominated(e, g);
            if (dom) { domCount++; continue; } // 第三 decl が overlap 常勝 = 表示不変
            r.status = 'keep';
            r.reason = beforeEWins ? 'flip-lose' : 'flip-gain';
            r.blocker = { gid, eProp: e.prop, eSel: norm(e.selector), eLine: e.line, gValue: norm(g.value), eValue: norm(e.value) };
            changed = true;
            break outer;
          }
        }
      }
    }
  }
}

/* ── 集計 + plan 出力 ── */
const moved = rules.filter(r => r.status === 'move');
const kept = rules.filter(r => r.status === 'keep');
const byDest = {};
for (const r of moved) byDest[r.dest] = (byDest[r.dest] || 0) + 1;
const byReason = {};
for (const r of kept) byReason[r.reason] = (byReason[r.reason] || 0) + 1;

console.log(`rules ${rules.length} | move ${moved.length} | keep ${kept.length} | fixpoint pass ${pass} | dominator harmless ${domCount}`);
console.log('dest:', JSON.stringify(byDest));
console.log('keep reason:', JSON.stringify(byReason));
const declsMoved = moved.reduce((a, r) => a + r.decls.length, 0);
const declsKept = kept.reduce((a, r) => a + r.decls.length, 0);
console.log(`decls: move ${declsMoved} / keep ${declsKept}`);
for (const r of kept) {
  if (r.reason === 'empty') continue;
  const b = r.blocker ? ` ← ${r.blocker.gid} (e:${r.blocker.eSel}@${r.blocker.eLine} ${r.blocker.eProp})` : '';
  console.log(`  KEEP ${r.start}-${r.end} [${r.reason}] ${r.sels.join(', ').slice(0, 90)}${b}`);
}

const plan = {
  generated: new Date().toISOString(),
  src: SRC_FILE,
  moves: moved
    .sort((a, b) => a.start - b.start)
    .map(r => ({ ruleId: r.ruleId, start: r.start, end: r.end, dest: r.dest, media: r.media, sels: r.sels })),
};
fs.writeFileSync('scripts/.responsive-dissolve-plan.json', JSON.stringify(plan, null, 1));
console.log(`plan → scripts/.responsive-dissolve-plan.json (${plan.moves.length} rule moves)`);
