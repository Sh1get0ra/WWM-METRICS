#!/usr/bin/env node
// @layer Step 2: light/dark token swap 化 分析
//
// light.css (+ dark.css) の selector rule を分類:
//   M (mergeable)  : base 同 selector rule に同 prop あり → token pair 化で theme decl 削除可
//   P (prop-add)   : base 同 selector rule あり、 prop は theme のみ → base へ decl 追加要 (default 値判断要)
//   N (no-base)    : base に同 selector rule 無し → rule ごと base へ移動 + token 化
//   S (structural) : url()/animation/mask/content/blend-mode 等 → 手動判断
//
// 使い方:
//   node scripts/theme-swap-audit.cjs            # サマリ
//   node scripts/theme-swap-audit.cjs --pairs    # M の dark/light 値 pair 全列挙
//   → scripts/.theme-swap.json (全 decl 分類)

const fs = require('fs');
const path = require('path');

// ── parseCss は audit v2 から流用 (require で関数 export してないため再実装最小) ──
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
  function parseDecls(selector, selLine, media) {
    const ruleId = ++ruleSeq;
    while (i < len) {
      skipWsCmt();
      if (i >= len || src[i] === '}') { i++; return; }
      const declLine = line;
      const decl = readUntil(';}', true);
      const hasSemi = src[i] === ';';
      if (hasSemi) i++;
      const m = decl.match(/^\s*([a-zA-Z-]+)\s*:\s*([\s\S]+?)\s*$/);
      if (m) {
        const prop = m[1].toLowerCase();
        let value = m[2];
        const important = /!\s*important\s*$/i.test(value);
        if (important) value = value.replace(/\s*!\s*important\s*$/i, '');
        for (const sel of selector.split(',')) {
          const s = sel.trim();
          if (!s) continue;
          decls.push({ file, line: declLine, selector: s, prop, value: value.trim(), important, media: media || null, ruleId, ruleStart: selLine });
        }
      }
      if (!hasSemi && src[i - 1] === '}') return;
    }
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

// ── audit v2 から流用: specificity / compoundKeys / propsConflict / 排他 group ──
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

function themeContext(sel) {
  if (/\[data-theme="?light"?\]/.test(sel)) return 'light';
  if (/\[data-theme="?dark"?\]/.test(sel)) return 'dark';
  if (/html:not\(\[data-theme="light"\]\)/.test(sel)) return 'dark';
  return 'both';
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
  if (/^(animation|transition)(-|$)/.test(p)) return p.split('-')[0];
  if (/^(place|align|justify)-/.test(p)) return 'box-align';
  return p;
}
const REAL_SHORTHANDS = new Set([
  'margin', 'padding', 'flex', 'flex-flow', 'overflow', 'border', 'background',
  'font', 'gap', 'inset', 'animation', 'transition', 'text-decoration', 'grid-area',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'grid-row', 'grid-column', 'place-items', 'place-content', 'place-self'
]);
function propsConflict(a, b) {
  if (a === b) return true;
  if (REAL_SHORTHANDS.has(a) && propGroup(a) === propGroup(b)) return true;
  if (REAL_SHORTHANDS.has(b) && propGroup(b) === propGroup(a)) return true;
  return false;
}

const EXCLUSIVE_CLASS_GROUPS = [
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

// theme prefix strip → base selector
function stripTheme(sel) {
  let s = sel;
  // html[data-theme="light"].cls ... → html.cls ... (compound 残し)
  s = s.replace(/html\[data-theme="(?:light|dark)"\](?=[.:[])/g, 'html');
  // html[data-theme="light"] desc / html:not([data-theme="light"]) desc → desc
  s = s.replace(/html(?:\[data-theme="(?:light|dark)"\]|:not\(\[data-theme="(?:light|dark)"\]\))\s+/g, '');
  return norm(s);
}

const STRUCTURAL_RE = /url\(|animation|mask|content\s*:|blend-mode|-webkit-mask/i;

const BASE_FILES = [
  'assets/styles-base.css',
  'assets/styles-components.css',
  'assets/styles-modals.css',
  'assets/styles-responsive.css',
];
const THEME_FILES = ['assets/styles-light.css', 'assets/styles-dark.css'];

const baseDecls = [];
for (const f of BASE_FILES) baseDecls.push(...parseCss(fs.readFileSync(f, 'utf8'), f));
const themeDecls = [];
for (const f of THEME_FILES) themeDecls.push(...parseCss(fs.readFileSync(f, 'utf8'), f));

// base index: selector(norm) → decls
const baseBySel = new Map();
for (const d of baseDecls) {
  const k = norm(d.selector);
  if (!baseBySel.has(k)) baseBySel.set(k, []);
  baseBySel.get(k).push(d);
}

// layer 順 (file = layer 前提、 tokens.css 先頭の @layer 宣言順)。
// @layer cascade: normal decl は 後 layer 無条件勝ち > 同 layer 内 specificity > source order
const LAYER_ORDER = new Map([
  ['assets/styles-base.css', 0],
  ['assets/styles-components.css', 1],
  ['assets/styles-modals.css', 2],
  ['assets/styles-responsive.css', 3],
  ['assets/styles-dark.css', 4],
  ['assets/styles-light.css', 5],
]);

// compound key index — light 表示の削除後 winner 候補。
// light.css 自身も含める (light layer 内の他 rule は base より常勝 = 最重要競合源)
const winnerPool = [...baseDecls, ...themeDecls.filter(d => LAYER_ORDER.has(d.file))];
const byKey = new Map();
for (const d of winnerPool) {
  for (const k of compoundKeys(d.selector)) {
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(d);
  }
}

// light decl d を削除 (or token swap) した時、 pair rule が当該 element の winner になる事を検証。
// 競合 g が pair に cascade で勝ち得る → unsafe (conservative)
function pairWinnerSafe(d, removedSet) {
  const pairSel = d.baseSel;
  const sp = specificity(pairSel);
  const pL = LAYER_ORDER.get(d.pair.file) ?? 99;
  const blockers = [];
  for (const key of compoundKeys(pairSel)) {
    for (const g of byKey.get(key) || []) {
      if (g.file === d.file && g.line === d.line && g.prop === d.prop) continue; // 削除対象自身
      if (removedSet && removedSet.has(`${g.file}|${g.line}|${g.prop}`)) continue; // 同 batch 削除分
      if (norm(g.selector) === pairSel) continue;            // pair rule 自身 / 同 selector rule (後勝ち選定済)
      if (norm(g.selector) === norm(d.selector)) continue;   // d 自身の rule (theme prefix 同 selector)
      if (!propsConflict(g.prop, d.prop)) continue;
      if (themeContext(g.selector) === 'dark') continue;     // light 表示に無関係
      if (exclusiveDisjoint(pairSel, g.selector)) continue;
      if (g.prop === d.prop && norm(g.value) === norm(d.value)) continue; // light 値と同値 = 無害
      if (g.important) { blockers.push(g); continue; }       // imp > normal 常勝
      const gL = LAYER_ORDER.get(g.file) ?? 99;
      if (gL > pL) { blockers.push(g); continue; }           // 後 layer = 無条件勝ち
      if (gL < pL) continue;                                  // 前 layer = pair 勝ち確定
      const sg = specificity(g.selector);                     // 同 layer → spec → source order
      if (sg > sp) { blockers.push(g); continue; }
      if (sg === sp && g.line > d.pair.line) { blockers.push(g); continue; }
    }
  }
  return blockers;
}

const out = { M: [], P: [], N: [], S: [], TOKEN: [] };

for (const d of themeDecls) {
  const baseSel = stripTheme(d.selector);
  // token 再定義 block (html 単体 = custom prop 定義) は目標形 → TOKEN
  if (baseSel === 'html' || baseSel === '') {
    out.TOKEN.push({ ...d, baseSel });
    continue;
  }
  if (d.prop.startsWith('--')) { out.TOKEN.push({ ...d, baseSel }); continue; }
  const entry = { ...d, baseSel };
  if (STRUCTURAL_RE.test(d.value) || STRUCTURAL_RE.test(d.prop) || /::|:hover|:focus|:checked|option|::placeholder/.test(baseSel) === false && false) {
    // structural value 判定のみ (selector pseudo は M でも可)
  }
  const structural = STRUCTURAL_RE.test(d.value) || /^animation/.test(d.prop) || /mask/.test(d.prop) || d.prop === 'content' || /blend-mode/.test(d.prop) || /^filter$/.test(d.prop);
  const baseRule = baseBySel.get(baseSel);
  if (structural) {
    entry.hasBase = !!baseRule;
    out.S.push(entry);
  } else if (!baseRule) {
    out.N.push(entry);
  } else {
    const sameProp = baseRule.filter(b => b.prop === d.prop);
    if (sameProp.length) {
      // 後勝ち = 最後の decl を pair とみなす (同 layer source order)
      const winner = sameProp[sameProp.length - 1];
      entry.pair = { file: winner.file, line: winner.line, value: winner.value, important: winner.important, candidates: sameProp.length };
      // light decl のみ winner 検証 (dark.css M は別 batch)
      if (d.file === 'assets/styles-light.css' && !d.important && !winner.important) {
        const blockers = pairWinnerSafe(entry);
        entry.safe = blockers.length === 0;
        if (!entry.safe) entry.blockers = blockers.slice(0, 3).map(b => `${b.file}:${b.line} ${norm(b.selector)} { ${b.prop} }`);
      } else {
        entry.safe = false;
        entry.blockers = ['theme-imp-or-dark'];
      }
      entry.sameValue = norm(entry.pair.value) === norm(d.value);
      out.M.push(entry);
    } else {
      out.P.push(entry);
    }
  }
}

const cnt = (a) => a.length;
console.log(`theme decls: ${themeDecls.length} (TOKEN ${cnt(out.TOKEN)} / M ${cnt(out.M)} / P ${cnt(out.P)} / N ${cnt(out.N)} / S ${cnt(out.S)})`);
const safeM = out.M.filter(d => d.safe);
console.log(`M safe: ${safeM.length} / ${out.M.length}  (うち same-value redundant: ${safeM.filter(d => d.sameValue).length})`);

const byFileCat = {};
for (const cat of ['M', 'P', 'N', 'S']) {
  for (const d of out[cat]) {
    const k = `${d.file.replace('assets/styles-', '').replace('.css', '')}.${cat}`;
    byFileCat[k] = (byFileCat[k] || 0) + 1;
  }
}
console.table(byFileCat);

if (process.argv.includes('--pairs')) {
  for (const d of out.M) {
    console.log(`[M] ${d.baseSel} { ${d.prop} }`);
    console.log(`    dark : ${d.pair.value}${d.pair.important ? ' !important' : ''}  (${d.pair.file}:${d.pair.line}${d.pair.candidates > 1 ? `, cand ${d.pair.candidates}` : ''})`);
    console.log(`    light: ${d.value}${d.important ? ' !important' : ''}  (${d.file}:${d.line})`);
  }
}

fs.writeFileSync('scripts/.theme-swap.json', JSON.stringify(out, null, 1));
console.log('→ scripts/.theme-swap.json');
