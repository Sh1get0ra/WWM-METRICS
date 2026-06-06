#!/usr/bin/env node
/* component-split-audit.cjs — @layer Step 4: components.css per-component 分割 audit
 * helper 群 (parseCss/specificity/selCovers/dominator 素材) は responsive-dissolve-audit.cjs から流用。
 * 理論・機構の詳細は本 file 後半 header 参照 */
const fs = require('fs');
const path = require('path');

// CSS file 構成 + 同 layer 内全順序座標 (Step 4: 複数 file = 同 layer 対応) — scripts/css-files.cjs が単一真実
const { FILE_LAYER, LAYER_IDX, ordOf, filesOfLayer, pathOf } = require('./css-files.cjs');

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


/* token map (値同値判定の var() 解決用 — 両 theme で同値なら harmless) */
const themeTokenMaps = { light: new Map(), dark: new Map() };
const TOKENS_CSS = pathOf('tokens');
for (const d of parseCss(fs.readFileSync(TOKENS_CSS, 'utf8'), TOKENS_CSS)) {
  if (!d.prop.startsWith('--')) continue;
  themeTokenMaps.light.set(d.prop, d.value);
  themeTokenMaps.dark.set(d.prop, d.value);
}
for (const f of [pathOf('light'), pathOf('dark')]) {
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


/* ════════════════════════════════════════════════════════════════════
 * @layer Step 4: components.css → per-component file 分割 audit
 *
 * 理論 (同 layer 内 rule 再配置の flip 可能域):
 *   同 layer cascade = imp diff → imp 勝ち (順序不問) / spec diff → spec 勝ち (順序不問)
 *   → flip 可能 pair = 同 importance ∧ 同 specificity ∧ prop 競合 ∧ sel/media/theme overlap ∧ 値相違 のみ。
 *   同 dest の rule は源順 (line) 保存で emit → 同 dest pair は flip 不可能 (構成的保証)。
 *   異 dest pair: before = line 順 / after = (dest link 順, line) 順 → 逆転のみ検査。
 *   他 layer との関係は layer 順で不変 (分割は layer 内再配置のみ)。
 *   dark/light は位置不変 → pair 側不可だが dominator 候補としては有効 (後 layer 常勝)。
 *
 * dest 決定: SECTION default (component section) / token argmax (S40 MOBILE + RESPONSIVE tail)
 *   / MANUAL_DEST override。 violation 自動解決 = token rule の co-locate (同 file 化 = 順序復元)、
 *   2 回目以降は mobile (終端 file = 元の末尾位置と同型) へ退避。
 *   SECTION rule 同士の violation は自動解決しない → MANUAL 出力 (人間が SECTION_DEST / 順序を見直す)
 *
 * 出力: scripts/.component-split-plan.json + violation / dest 内訳
 * ════════════════════════════════════════════════════════════════════ */

const LAYER_ORDER = FILE_LAYER;
const L_COMP = LAYER_IDX.get('components');
// 分割前 = components layer 単一 file 前提。 分割適用済 (複数 file) なら本 audit の役目は終了
if (filesOfLayer('components').length !== 1) {
  console.log(`components layer は ${filesOfLayer('components').length} file (分割適用済) — 本 audit は分割前検証用。 履歴: scripts/.component-split-plan.json`);
  process.exit(0);
}
const SRC = pathOf('components');
const STYLES_DIR = 'assets/styles/';
// 分割先 (link 順 = 同 layer 内 cascade 順)。 順序設計: section 初出順 ≒ inversion 最小
const TARGET_NAMES = ['share', 'hero', 'sidebar', 'layout', 'gear', 'xinfa', 'anlz', 'mobile'];
const TARGETS = TARGET_NAMES.map(n => STYLES_DIR + n + '.css');
const TIDX = new Map(TARGETS.map((f, i) => [f, i]));
const ORD2 = 1e6; // 分割後 components layer 内 order 座標 stride (TIDX * ORD2 + 元 line)

// SECTION 番号 → default dest (inventory 2026-06-06: S03=share+preset+diag 同居 / S26=gear+xinfa 共有
// → xinfa (S16 より後・S25 より後の源順を file 順でも保存) / S27 は実質 hero 内容)
const SECTION_DEST = {
  '03': 'share', '04': 'hero', '05': 'sidebar', '08': 'layout', '10': 'mobile',
  '12': 'sidebar', '14': 'layout', '15': 'layout', '16': 'gear', '17': 'gear',
  '20': 'xinfa', '21': 'anlz', '22': 'anlz', '24': 'xinfa', '25': 'xinfa',
  '26': 'xinfa', '27': 'hero', '28': 'hero', '29': 'hero', '34': 'anlz',
  '35': 'anlz', '36': 'anlz', '37': 'hero',
  '40': null, // MOBILE RESPONSIVE → token argmax
};
// 手動 override: rule start line → dest name (violation 解決の人間判断)
const MANUAL_DEST = new Map([
  // S24 内 compare-modal 系 (.wwm-cmp-*) → xinfa (S20 cmp-tier 群と同居、 cmp-* 集約)
  [1506, 'xinfa'], [1517, 'xinfa'], [1531, 'xinfa'], [1560, 'xinfa'],
  // S24 modal-square z-index scaffolding (square modal 共通 = cmp + analysis card) → xinfa (cmp-* 集約先)
  [1554, 'xinfa'], [1556, 'xinfa'],
  // S24 内 equip-section core rule 群 (light 専用でない本体 rule — 歴史的に S24 に混在) → gear。
  // light-compat(8) 残置だと xinfa(6) の .wwm-gear-grid .wwm-equip-slot (orig 後方) に order 逆転 (audit 検出)
  [1564, 'gear'], [1572, 'gear'], [1579, 'gear'], [1585, 'gear'], [1590, 'gear'],
  // S37 tier-rolling 2 rule (sidebar + hero 共通 selector) → sidebar:
  // .wwm-sb-tier-badge.tier-SS/S (S05) の text-shadow に orig 後勝ち — hero(2) だと order 逆転 (audit 検出)。
  // .hero-tier 側は S28 (hero) より後方 orig ∧ sidebar(3) > hero(2) で方向保存
  [2433, 'sidebar'], [2442, 'sidebar'],
]);

/* ── pool 構築 ── */
const ruleMeta = new Map(); // SRC のみ extent 記録
const pool = [];
const POOL_FILES = [...filesOfLayer('base'), ...filesOfLayer('components'), ...filesOfLayer('modals'),
  pathOf('responsive'), pathOf('dark'), pathOf('light')];
for (const f of POOL_FILES) {
  pool.push(...parseCss(fs.readFileSync(f, 'utf8'), f, f === SRC ? ruleMeta : null));
}
const cDecls = pool.filter(d => d.file === SRC);

const byKey = new Map();
for (const d of pool) {
  if (d.prop.startsWith('--')) continue;
  for (const k of compoundKeys(d.selector)) {
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(d);
  }
}

function themeContext(sel) {
  if (/\[data-theme="?light"?\]/.test(sel)) return 'light';
  if (/\[data-theme="?dark"?\]/.test(sel)) return 'dark';
  if (/html:not\(\[data-theme="light"\]\)/.test(sel)) return 'dark';
  return 'both';
}

/* ── SECTION 範囲 scan ── */
const srcLines = fs.readFileSync(SRC, 'utf8').split('\n');
const sectionMarks = []; // { line, key }
srcLines.forEach((l, i) => {
  if (i < 56) return; // TOC 領域除外
  const m = l.match(/SECTION (\d+) —|RESPONSIVE — co-location/);
  if (m) sectionMarks.push({ line: i + 1, key: m[1] || 'RESPONSIVE' });
});
sectionMarks.push({ line: srcLines.length + 1, key: 'EOF' });
function sectionOf(line) {
  for (let i = sectionMarks.length - 2; i >= 0; i--) {
    if (line >= sectionMarks[i].line) return sectionMarks[i].key;
  }
  return null;
}

/* ── dest 初期割当 ── */
const rules = [];
const declsByRule = new Map();
for (const d of cDecls) {
  if (!declsByRule.has(d.ruleId)) declsByRule.set(d.ruleId, []);
  declsByRule.get(d.ruleId).push(d);
}
// token vocab (SECTION 確定 rule の selector token → dest) — token argmax 用
const vocab = new Map(); // token → Map<destName, count>
function addVocab(destName, sels) {
  for (const s of sels) for (const t of s.match(/[.#][\w-]+/g) || []) {
    if (!vocab.has(t)) vocab.set(t, new Map());
    const m = vocab.get(t);
    m.set(destName, (m.get(destName) || 0) + 1);
  }
}
const pendingToken = [];
for (const [ruleId, meta] of ruleMeta) {
  const decls = declsByRule.get(ruleId) || [];
  const r = { ...meta, decls, dest: null, destBy: null, reassigns: 0 };
  rules.push(r);
  // 空 rule (decl 0) も dest 付与 — cascade 中立、 注記 empty rule (.tier-badge-baseline 等) の文書性保持
  if (MANUAL_DEST.has(meta.start)) {
    r.dest = STYLES_DIR + MANUAL_DEST.get(meta.start) + '.css';
    r.destBy = 'manual';
    continue;
  }
  const sec = sectionOf(meta.start);
  const dn = sec ? SECTION_DEST[sec] : null;
  if (dn) {
    r.dest = STYLES_DIR + dn + '.css';
    r.destBy = `S${sec}`;
    addVocab(dn, meta.sels);
  } else {
    pendingToken.push(r); // S40 / RESPONSIVE tail
  }
}
// token argmax (tie → 後 dest / zero → mobile)
for (const r of pendingToken) {
  const score = new Map();
  for (const s of r.sels) for (const t of s.match(/[.#][\w-]+/g) || []) {
    const m = vocab.get(t);
    if (!m) continue;
    for (const [dn, c] of m) score.set(dn, (score.get(dn) || 0) + c);
  }
  let best = null, bestN = 0;
  for (const dn of TARGET_NAMES) {
    const n = score.get(dn) || 0;
    if (n >= bestN && n > 0) { best = dn; bestN = n; }
  }
  r.dest = STYLES_DIR + (best || 'mobile') + '.css';
  r.destBy = best ? 'token' : 'token-0';
  r.tokenAssigned = true;
}
const ruleById = new Map(rules.map(r => [r.ruleId, r]));

/* ── 位置関数 ── */
function afterL(d) { // 分割後の components layer 内 order 座標
  const r = ruleById.get(d.ruleId);
  return (TIDX.get(r.dest) ?? 99) * ORD2 + d.line;
}
function posOf(d) { // after 状態の全体座標 (dominator 用)
  if (d.file === SRC) return { L: L_COMP, s: specificity(d.selector), l: afterL(d) };
  return { L: LAYER_ORDER.get(d.file), s: specificity(d.selector), l: ordOf(d.file, d.line) };
}
function posBefore(d) { return { L: LAYER_ORDER.get(d.file), s: specificity(d.selector), l: ordOf(d.file, d.line) }; }
function win(a, b, imp) {
  if (a.L !== b.L) return imp ? a.L < b.L : a.L > b.L;
  if (a.s !== b.s) return a.s > b.s;
  return a.l > b.l;
}

/* ── dominator 推論 (Step 3 同型 — dark/light も候補: 位置不変・後 layer 常勝) ── */
function cmpWins(h, x, state) {
  if (!!h.important !== !!x.important) return !!h.important;
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

/* ── pair flip 検査 + fixpoint (token rule 自動 co-locate) ── */
const manualViolations = [];
let domCount = 0, sameDestSkip = 0;
let pass = 0, changed = true;
while (changed) {
  changed = false;
  pass++;
  manualViolations.length = 0;
  const seenPair = new Set();
  outer:
  for (const e of cDecls) {
    if (e.prop.startsWith('--') && false) continue; // custom prop も order 依存 → 検査対象
    const rE = ruleById.get(e.ruleId);
    for (const key of expandKeys(compoundKeys(e.selector))) {
      for (const g of byKey.get(key) || []) {
        if (g.file !== SRC) continue;                       // pair = components layer 内のみ
        if (g.ruleId === e.ruleId) continue;                // 同 rule = atomic 移動
        const rG = ruleById.get(g.ruleId);
        if (rG.dest === rE.dest) { continue; }              // 同 dest = 源順保存 = flip 不可
        const pid = e.line < g.line ? `${e.line}|${e.prop}|${norm(e.selector)}||${g.line}|${g.prop}|${norm(g.selector)}`
                                    : `${g.line}|${g.prop}|${norm(g.selector)}||${e.line}|${e.prop}|${norm(e.selector)}`;
        if (seenPair.has(pid)) continue;
        seenPair.add(pid);
        if (!!g.important !== !!e.important) continue;      // imp↔normal = 順序不問
        if (specificity(g.selector) !== specificity(e.selector)) continue; // spec 差 = 順序不問
        if (!propsConflict(g.prop, e.prop)) continue;
        if (!mediaOverlap(e.media, g.media)) continue;
        if (exclusiveDisjoint(e.selector, g.selector)) continue;
        const tE = themeContext(e.selector), tG = themeContext(g.selector);
        if (tE !== 'both' && tG !== 'both' && tE !== tG) continue;
        if (g.prop === e.prop && valuesEqBothThemes(g.value, e.value)) continue;
        if (g.prop !== e.prop && shadowProp(g.prop, e.prop)) {
          const ext = extractForProp(g.value, g.prop, e.prop);
          if (ext !== null && valuesEqBothThemes(ext, e.value)) continue;
        }
        if (g.prop !== e.prop && shadowProp(e.prop, g.prop)) {
          const ext = extractForProp(e.value, e.prop, g.prop);
          if (ext !== null && valuesEqBothThemes(ext, g.value)) continue;
        }
        const beforeOrder = e.line < g.line;
        const afterOrder = afterL(e) < afterL(g);
        if (beforeOrder === afterOrder) continue;
        const dom = dominated(e, g);
        if (dom) { domCount++; continue; }
        // violation — 解決
        const fix = rE.tokenAssigned ? rE : rG.tokenAssigned ? rG : null;
        const anchor = fix === rE ? rG : rE;
        if (fix && fix.reassigns === 0 && !anchor.tokenAssigned) {
          fix.dest = anchor.dest; fix.destBy += `→coloc(${fix.reassigns + 1})`; fix.reassigns++;
          changed = true; break outer;
        } else if (fix) {
          if (fix.dest !== STYLES_DIR + 'mobile.css') {
            fix.dest = STYLES_DIR + 'mobile.css'; fix.destBy += '→mobile'; fix.reassigns++;
            changed = true; break outer;
          }
          // fix 既に mobile (終端) → 相手も token rule なら mobile へ co-locate (源順復元)
          if (anchor.tokenAssigned && anchor.dest !== STYLES_DIR + 'mobile.css') {
            anchor.dest = STYLES_DIR + 'mobile.css'; anchor.destBy += '→mobile(coloc)'; anchor.reassigns++;
            changed = true; break outer;
          }
          manualViolations.push({ e, g, note: 'token-rule mobile でも flip' });
        } else {
          manualViolations.push({ e, g, note: 'section rule 同士' });
        }
      }
    }
  }
}

/* ── 集計 ── */
const byDest = {};
for (const r of rules) { if (r.dest) byDest[r.dest.replace(STYLES_DIR, '')] = (byDest[r.dest.replace(STYLES_DIR, '')] || 0) + 1; }
console.log(`rules ${rules.filter(r => r.dest).length} | fixpoint pass ${pass} | dominator harmless ${domCount} | violations ${manualViolations.length}`);
console.log('dest:', JSON.stringify(byDest));
const reassigned = rules.filter(r => r.reassigns > 0);
if (reassigned.length) {
  console.log(`再割当 ${reassigned.length} rule:`);
  for (const r of reassigned) console.log(`  L${r.start}-${r.end} [${r.destBy}] ${r.sels.join(',').slice(0, 80)}`);
}
for (const v of manualViolations.slice(0, 30)) {
  console.log(`VIOLATION (${v.note}):`);
  console.log(`  e: L${v.e.line} [${ruleById.get(v.e.ruleId).dest}] ${norm(v.e.selector).slice(0, 70)} { ${v.e.prop}: ${v.e.value.slice(0, 50)} }${v.e.important ? ' !imp' : ''} ${v.e.media || ''}`);
  console.log(`  g: L${v.g.line} [${ruleById.get(v.g.ruleId).dest}] ${norm(v.g.selector).slice(0, 70)} { ${v.g.prop}: ${v.g.value.slice(0, 50)} }${v.g.important ? ' !imp' : ''} ${v.g.media || ''}`);
}
if (manualViolations.length) {
  console.log('→ MANUAL_DEST / SECTION_DEST / TARGET 順 を見直して再実行');
  process.exitCode = 1;
}

/* ── plan 出力 ── */
const plan = {
  generated: new Date().toISOString(),
  src: SRC,
  targets: TARGETS,
  rules: rules.filter(r => r.dest).sort((a, b) => a.start - b.start)
    .map(r => ({ ruleId: r.ruleId, start: r.start, end: r.end, dest: r.dest, destBy: r.destBy, media: r.media, sels: r.sels })),
};
fs.writeFileSync('scripts/.component-split-plan.json', JSON.stringify(plan, null, 1));
console.log(`plan → scripts/.component-split-plan.json (${plan.rules.length} rules)`);
