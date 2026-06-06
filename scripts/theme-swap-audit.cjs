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

// CSS file 構成 + 同 layer 内全順序座標 (Step 4: 複数 file = 同 layer 対応) — scripts/css-files.cjs が単一真実。
// ordOf(file, line) = file 読込順 (seq) × 行番号 の全順序。 同 layer 内の order 比較は全て ordOf を通す事
// (素の line 比較は file 跨ぎで無意味)。 layer 跨ぎは従来通り LAYER_ORDER (= FILE_LAYER) を先に比較。
const { FILE_LAYER, ordOf, filesOfLayer, pathOf } = require('./css-files.cjs');

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
  // selector split: 引用符/括弧内の comma を無視 (S2-g で発覚 — attr selector
  // `circle[stroke^="rgba(232,176,86..."]` が素朴 split(',') で断片化、 再出力時に CSS 全壊)
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
    while (i < len) {
      skipWsCmt();
      if (i >= len || src[i] === '}') { i++; return; }
      const declLine = line;
      const decl = readUntil(';}', true);
      const hasSemi = src[i] === ';';
      if (hasSemi) i++;
      // prop 名: 数字含む custom property (--brown-5 等) 対応 (S2-g で発覚 — 旧 [a-zA-Z-]+ は数字で不一致)
      const m = decl.match(/^\s*([a-zA-Z-][a-zA-Z0-9_-]*)\s*:\s*([\s\S]+?)\s*$/);
      if (m) {
        const prop = m[1].toLowerCase();
        let value = m[2];
        const important = /!\s*important\s*$/i.test(value);
        if (important) value = value.replace(/\s*!\s*important\s*$/i, '');
        for (const sel of splitSelectors(selector)) {
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
// SVG presentation attribute 穴 (S2-g VRT 検出): stroke/fill 等は継承 prop →
// IACVT unset = inherit ≠ 「decl 不在」(不在なら element の presentation attribute が勝つ)。
// SVG 系 subject × presentational prop で other 側が unset 経路 (initial token / dark-invalid literal)
// になる場合は token 化不可 → Mode B (theme prefix 維持 relocate) へ降格 (N) / pSafe false (P)
const SVG_SUBJECT_RE = /(^|[\s>+~])(svg|path|line|circle|rect|polygon|polyline|ellipse|g|text|tspan|use)(?![\w-])[^\s>+~]*$/;
const SVG_PRESENTATION_RE = /^(stroke|stroke-[\w-]+|fill|fill-[\w-]+|opacity|stop-[\w-]+|marker[\w-]*|color)$/;
// 継承 prop (token 'initial' → IACVT → unset = inherit になる prop 群)
const INHERITED_PROPS = new Set([
  'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-indent', 'text-transform',
  'text-shadow', 'white-space', 'visibility', 'cursor', 'direction', 'quotes', 'tab-size',
  'list-style', 'list-style-type', 'list-style-position', 'list-style-image',
  'caption-side', 'border-collapse', 'border-spacing', 'empty-cells', 'word-break', 'overflow-wrap',
]);
function propsConflict(a, b) {
  if (a === b) return true;
  if (REAL_SHORTHANDS.has(a) && propGroup(a) === propGroup(b)) return true;
  if (REAL_SHORTHANDS.has(b) && propGroup(b) === propGroup(a)) return true;
  return false;
}
// S2-j: dp が ep を完全に遮蔽するか (同 prop or ep の全成分を reset する祖先 shorthand)
// 例: border ⊇ border-color ✓ / border-top ⊉ border-color ✗ ('border-color'.startsWith('border-top-') = false)
const shadowProp = (dp, ep) => dp === ep || (REAL_SHORTHANDS.has(dp) && ep.startsWith(dp + '-') && propGroup(dp) === propGroup(ep));

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
  // S2-g: import modal step2 と 対照 modal は別 modal で DOM 非交差 (import.js:340 / gear|xinfa|arsenal.js)
  [['wwm-step2'], ['wwm-cmp-modal-a']],
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

// link 順 (= cascade 順) — layer 群が link 順で連続している事は css-files.cjs が保証
const BASE_FILES = [
  ...filesOfLayer('base'),
  ...filesOfLayer('components'),
  ...filesOfLayer('modals'),
  ...filesOfLayer('responsive'),
];
const DARK_CSS = pathOf('dark'), LIGHT_CSS = pathOf('light');
const THEME_FILES = [LIGHT_CSS, DARK_CSS];

const baseDecls = [];
for (const f of BASE_FILES) baseDecls.push(...parseCss(fs.readFileSync(f, 'utf8'), f));
const themeDecls = [];
for (const f of THEME_FILES) themeDecls.push(...parseCss(fs.readFileSync(f, 'utf8'), f));

// ── S2-d/e: theme context token map + var() 解決 (値の意味比較用) ──
// tokens.css :root 定義 → 当該 theme file の token block で上書き
const themeTokenMaps = { light: new Map(), dark: new Map() };
const TOKENS_CSS = pathOf('tokens');
for (const d of parseCss(fs.readFileSync(TOKENS_CSS, 'utf8'), TOKENS_CSS)) {
  if (!d.prop.startsWith('--')) continue;
  themeTokenMaps.light.set(d.prop, d.value);
  themeTokenMaps.dark.set(d.prop, d.value);
}
for (const d of themeDecls) {
  if (!d.prop.startsWith('--')) continue;
  if (d.file === LIGHT_CSS) themeTokenMaps.light.set(d.prop, d.value);
  if (d.file === DARK_CSS) themeTokenMaps.dark.set(d.prop, d.value);
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
const resolveLight = (v) => resolveCtx(v, 'light');

// base index: selector(norm) → decls
const baseBySel = new Map();
for (const d of baseDecls) {
  const k = norm(d.selector);
  if (!baseBySel.has(k)) baseBySel.set(k, []);
  baseBySel.get(k).push(d);
}

// layer 順 (path → layer index、 css-files.cjs 由来。 Step 4 以降 複数 file = 同 layer)。
// @layer cascade: normal decl は 後 layer 無条件勝ち > 同 layer 内 specificity > source order (= ordOf)
const LAYER_ORDER = FILE_LAYER;

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

// ── DOM 共起 class map (audit v2 から移植) ──
// 同 element に同時付与される class は subject class 不一致でも同 element 競合
// (例: .wwm-cmp-rows + .wwm-cmp-xinfa-rows — S2-f rows padding regression 2026-06-06 実例)。
// index.html + assets JS の class="..." から共起 pair 構築 → byKey lookup を展開
function buildCoOccurrence() {
  const coMap = new Map(); // token ('.cls' | '#id') → Set<token>
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
    // classList.add('x') / classList.toggle('x') → JS 動的付与: querySelector 系 token と紐付け不能
    // → 既知 pair のみ (v2 同方針)
  }
  return coMap;
}
const coMap = buildCoOccurrence();
// compoundKeys → 共起 class 展開 (pseudo suffix 維持)
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

// light decl d を削除 (or token swap) した時、 pair rule が当該 element の winner になる事を検証。
// 競合 g の判定 (S2-d v2):
//   afterGWins (g が pair に勝つ) false → 無害 (pair 勝ち = light 値維持)
//   afterGWins ∧ beforeGWins (g は d にも勝っていた) → 表示不変 = 無害 (g 自身が同 batch 削除なら fixpoint で方向検証)
//   afterGWins ∧ !beforeGWins → blocker (d 勝ち element が g に奪われる)
//   g.important → before も after も d/pair に常勝 (d は non-imp 限定) = 無害
// 返値: [{...g, beforeGWins}] — afterGWins true のみ。 fixpoint で batch 解決
function pairWinnerBlockers(d, ctx) {
  const pairSel = d.baseSel;
  const sp = specificity(pairSel);
  const sd = specificity(d.selector);
  const pL = LAYER_ORDER.get(d.pair.file) ?? 99;
  const dL = LAYER_ORDER.get(d.file) ?? 99;
  const otherTheme = ctx === 'light' ? 'dark' : 'light';
  const blockers = [];
  const seen = new Set();
  for (const key of expandKeys(compoundKeys(pairSel))) {
    for (const g of byKey.get(key) || []) {
      if (g.file === d.file && g.line === d.line && g.prop === d.prop) continue; // 削除対象自身
      const gid = `${g.file}|${g.line}|${norm(g.selector)}|${g.prop}`;
      if (seen.has(gid)) continue;
      // pair rule 自身 / 同 selector ∧ 同 media の base rule (pair = 後勝ち選定済で常勝)
      if (norm(g.selector) === pairSel && (g.media || null) === (d.media || null)) continue;
      if (norm(g.selector) === norm(d.selector)) continue;   // d 自身の rule (theme prefix 同 selector)
      if (!propsConflict(g.prop, d.prop)) continue;
      if (themeContext(g.selector) === otherTheme) continue; // 当該 theme 表示に無関係
      if (exclusiveDisjoint(pairSel, g.selector)) continue;
      if (g.prop === d.prop && resolveCtx(g.value, ctx) === resolveCtx(d.value, ctx)) continue; // 当該 theme 表示で同値 = 無害 (var 解決込)
      if (g.important) continue;                              // imp は before/after 共 常勝 = 表示不変
      const gL = LAYER_ORDER.get(g.file) ?? 99;
      // after: g vs pair
      let afterGWins;
      if (gL !== pL) afterGWins = gL > pL;
      else {
        const sg = specificity(g.selector);
        afterGWins = sg > sp || (sg === sp && ordOf(g.file, g.line) > ordOf(d.pair.file, d.pair.line));
      }
      if (!afterGWins) continue;                              // pair 勝ち確定 = 無害
      // before: g vs d (d = light layer normal)
      let beforeGWins = false;
      if (gL === dL) {
        const sg = specificity(g.selector);
        beforeGWins = sg > sd || (sg === sd && ordOf(g.file, g.line) > ordOf(d.file, d.line));
      } // base layer normal は light layer に負ける → false
      seen.add(gid);
      blockers.push({ file: g.file, line: g.line, selector: norm(g.selector), prop: g.prop, value: norm(g.value), beforeGWins });
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
    // pair は media 整合必須 (S2-d): @media 内 base decl を pair にすると media 外の coverage が消える
    const sameProp = baseRule.filter(b => b.prop === d.prop && (b.media || null) === (d.media || null));
    if (sameProp.length) {
      // 後勝ち = 最後の decl を pair とみなす (同 layer source order)
      const winner = sameProp[sameProp.length - 1];
      entry.pair = { file: winner.file, line: winner.line, value: winner.value, important: winner.important, candidates: sameProp.length };
      entry.ctx = d.file === DARK_CSS ? 'dark' : 'light';
      if (!d.important && !winner.important) {
        const blockers = pairWinnerBlockers(entry, entry.ctx);
        // 静的 safe: blocker 全てが beforeGWins (= before/after 共 g 勝ち → 表示不変)
        entry.safe = blockers.every(b => b.beforeGWins);
        entry.blockersRaw = blockers;
        if (!entry.safe) entry.blockers = blockers.filter(b => !b.beforeGWins).slice(0, 3).map(b => `${b.file}:${b.line} ${b.selector} { ${b.prop} }`);
      } else {
        entry.safe = false;
        entry.blockers = ['theme-imp'];
      }
      entry.sameValue = resolveCtx(entry.pair.value, entry.ctx) === resolveCtx(d.value, entry.ctx); // 当該 theme 表示同値 (var 解決込)
      out.M.push(entry);
    } else {
      entry.mediaOnlyPair = baseRule.some(b => b.prop === d.prop); // prop は @media 内のみ存在
      out.P.push(entry);
    }
  }
}

// ── S2-d/e: batch fixpoint (light/dark 両 theme) ──
// blocker g が同 batch で swap される場合: 「before 勝敗 (theme layer 内) == after 勝敗 (pair 同士 base layer)」
// なら override 関係が pair+token 経由で保存される → blocker 解除。
// 物理 decl gate も fixpoint 内で強制 (gate 落ち decl の削除前提を他 decl が持たないように)。
const THEME_FILE_SET = new Set(THEME_FILES);
const keyOf = (e) => `${e.file}|${e.line}|${norm(e.selector)}|${e.prop}`;
const mIndex = new Map();
for (const e of out.M) mIndex.set(keyOf(e), e);

// S2-c 決定踏襲: light bg 3 層構造 (S) の付随 longhand は S 処理時に一緒に動かす → batch 除外
const BATCH_EXCLUDE = new Set([
  '.wwm-gear-grid .wwm-equip-slot | background-position',
  '.wwm-gear-grid .wwm-equip-slot | background-size',
  '.wwm-gear-grid .wwm-equip-slot | background-repeat',
]);

const inBatch = new Set();
for (const e of out.M) {
  if (!THEME_FILE_SET.has(e.file) || e.important || !e.pair || e.pair.important || !e.blockersRaw) continue;
  if (BATCH_EXCLUDE.has(`${e.baseSel} | ${e.prop}`)) continue;
  // CSS-wide keyword は custom property 値に不可 (--tok: inherit は token 自身の継承になる) → token swap 不能
  if (!e.sameValue && /^(inherit|initial|unset|revert|revert-layer)$/i.test(norm(e.pair.value))) continue;
  inBatch.add(keyOf(e));
}

// 物理 decl group (multi-selector split)
const physGroups = new Map();
for (const e of out.M) {
  if (!THEME_FILE_SET.has(e.file)) continue;
  const k = `${e.file}|${e.line}|${e.prop}`;
  if (!physGroups.has(k)) physGroups.set(k, []);
  physGroups.get(k).push(e);
}

// base 物理 decl の selector 集合 (file|line|prop → Set<selector>)。
// base 側物理 gate 用: pair rule が multi-selector の場合、 全 selector が同 batch 同値 theme decl で
// cover されてないと base 置換が対象外 selector を道連れ変更する (.wwm-cmp-val regression 2026-06-05 実例)
const basePhysSels = new Map();
for (const b of baseDecls) {
  const k = `${b.file}|${b.line}|${b.prop}`;
  if (!basePhysSels.has(k)) basePhysSels.set(k, new Set());
  basePhysSels.get(k).add(norm(b.selector));
}
const byPairPhys = new Map();
for (const e of out.M) {
  if (!THEME_FILE_SET.has(e.file) || !e.pair || e.sameValue) continue; // sameValue = base 無変更 → 対象外
  const k = `${e.pair.file}|${e.pair.line}|${e.prop}`;
  if (!byPairPhys.has(k)) byPairPhys.set(k, []);
  byPairPhys.get(k).push(e);
}

// same-selector shield index: theme file 全 decl (M/P/N/S 問わず) を file|stripTheme(selector)|prop で索引。
// hard blocker g に対し 同一 selector の theme rule g' が残置されるなら、 g' が g を before/after 共に遮蔽
// (g' = theme layer > base layers 常勝、 match(g') == match(g) ⊇ overlap(d,g)) → g 無害。
// 条件: g' が d にも勝つ (spec/line) か当該 theme 表示同値 (どちらが勝っても値同一)
const shieldIndex = new Map();
for (const d of themeDecls) {
  if (!THEME_FILE_SET.has(d.file) || d.prop.startsWith('--')) continue;
  const k = `${d.file}|${stripTheme(d.selector)}|${d.prop}`;
  if (!shieldIndex.has(k)) shieldIndex.set(k, []);
  shieldIndex.get(k).push(d);
}

function cmpBaseGWins(e, gE) {
  // after: gE.pair が e.pair に勝つか (base layers)
  if (gE.pair.file === e.pair.file && gE.pair.line === e.pair.line) return null; // 同一 pair decl → 値比較で解決
  const eL = LAYER_ORDER.get(e.pair.file) ?? 99;
  const gL = LAYER_ORDER.get(gE.pair.file) ?? 99;
  if (gL !== eL) return gL > eL;
  const se = specificity(e.baseSel), sg = specificity(gE.baseSel);
  if (sg !== se) return sg > se;
  return ordOf(gE.pair.file, gE.pair.line) > ordOf(e.pair.file, e.pair.line);
}

// drop-gate 計測 (S2-i): fixpoint で batch から落ちた「最初の」理由を記録 (後続は連鎖)
const dropGate = (e, gate, detail) => { if (!e.dropGate) { e.dropGate = gate; if (detail) e.dropDetail = detail; } };

// ── S2-j: M/P 横断方向検証用の base 最終位置比較 ──
// M entry の swap 後位置 = pair decl (値が var(--tok) になるだけで位置不変)
// P entry の insert 後位置 = target rule 末尾 (lastLine + 0.5 — 整数 line と衝突しない全順序)
function finalPosM(mE) { return { layer: LAYER_ORDER.get(mE.pair.file) ?? 99, spec: specificity(mE.baseSel), line: ordOf(mE.pair.file, mE.pair.line) }; }
function finalPosP(pE) { return { layer: LAYER_ORDER.get(pE.insert.file) ?? 99, spec: specificity(pE.baseSel), line: ordOf(pE.insert.file, pE.insert.lastLine) + 0.5 }; }
function posBeats(a, b) {
  if (a.layer !== b.layer) return a.layer > b.layer;
  if (a.spec !== b.spec) return a.spec > b.spec;
  return a.line > b.line;
}

function mFixpoint() {
let changed = true;
while (changed) {
  changed = false;
  for (const e of out.M) {
    const k = keyOf(e);
    if (!inBatch.has(k)) continue;
    let dropSelf = false;
    for (const g of e.blockersRaw) {
      const gK = `${g.file}|${g.line}|${g.selector}|${g.prop}`;
      const gE = mIndex.get(gK);
      const gRemovable = gE && inBatch.has(gK);
      if (!gRemovable) {
        // S2-j (A): g が P batch で base へ移動 (insert + theme decl 削除) なら「残置」でない →
        // 方向検証: after 勝者 (e.pair vs g.insert) == before 勝者 (beforeGWins) で保存
        const pgE = pIndex.get(gK); // 宣言は後方だが mFixpoint 初回呼出は outer loop (宣言後) → TDZ 安全
        if (pgE && pBatch.has(gK)) {
          const eWins = posBeats(finalPosM(e), finalPosP(pgE));
          if (eWins !== !g.beforeGWins) { dropSelf = true; dropGate(e, 'm-pdir', `${g.file}:${g.line} ${g.selector} { ${g.prop} }`); break; }
          continue; // 方向保存 = blocker 解除
        }
        // g 残置: beforeGWins なら before/after 共 g 勝ち = 表示不変
        if (!g.beforeGWins) {
          // same-selector shield: 同 theme rule g' (同 selector ∧ 同 prop) が g を遮蔽するか
          //   g' 残置 → g' が before/after 共 g に常勝 (theme layer > base)
          //   g' が同 batch swap でも g が g'.pair そのものなら → swap 後 g が token で g' の theme 値保持
          // どちらも条件: g' が d に勝つ (spec/line) or 当該 theme 表示同値
          const sd = specificity(e.selector);
          const shielded = (shieldIndex.get(`${e.file}|${stripTheme(g.selector)}|${g.prop}`) || []).some(s => {
            const sK = `${s.file}|${s.line}|${norm(s.selector)}|${s.prop}`;
            if (sK === k) return false; // d 自身
            if (inBatch.has(sK)) {
              const sE = mIndex.get(sK);
              if (!sE || !sE.pair || sE.pair.file !== g.file || sE.pair.line !== g.line || sE.prop !== g.prop) return false;
            }
            const ss = specificity(s.selector);
            return ss > sd || (ss === sd && ordOf(s.file, s.line) > ordOf(e.file, e.line)) ||
              resolveCtx(s.value, e.ctx) === resolveCtx(e.value, e.ctx); // g' が d に勝つ or theme 表示同値
          });
          if (!shielded) { dropSelf = true; dropGate(e, 'm-blocker', `${g.file}:${g.line} ${g.selector} { ${g.prop} }`); break; }
        }
      } else {
        const valEq = g.prop === e.prop && resolveCtx(g.value, e.ctx) === resolveCtx(e.value, e.ctx);
        if (valEq) continue; // light 表示同値 → どちらが勝っても不変
        const afterGWins = cmpBaseGWins(e, gE);
        const okDir = afterGWins === null ? false : afterGWins === g.beforeGWins;
        if (!okDir) {
          if (g.beforeGWins) {
            // g を残せば harmless → blocker 側を batch から外す (依存を道連れにしない)
            if (inBatch.delete(gK)) { changed = true; dropGate(gE, 'm-dep-evict', `dep of ${e.file}:${e.line}`); }
          } else {
            dropSelf = true; dropGate(e, 'm-dir', `${g.file}:${g.line} ${g.selector} { ${g.prop} }`); break;
          }
        }
      }
    }
    if (dropSelf) { inBatch.delete(k); changed = true; }
  }
  // 物理 decl gate: 全 split が batch 内 ∧ pair 値・light 値・sameValue 一致 (異なれば全 split 除外)
  for (const [pk, splits] of physGroups) {
    const states = splits.map(s => inBatch.has(keyOf(s)));
    if (!states.some(Boolean)) continue;
    const allIn = states.every(Boolean);
    const k0 = `${norm(splits[0].pair.value)} || ${norm(splits[0].value)} || ${splits[0].sameValue}`;
    const uniform = splits.every(s => `${norm(s.pair.value)} || ${norm(s.value)} || ${s.sameValue}` === k0);
    if (!allIn || !uniform) {
      for (const s of splits) if (inBatch.delete(keyOf(s))) { changed = true; dropGate(s, 'm-phys', pk); }
    }
  }
  // base 側物理 gate (theme 別・独立判定): pair rule の全 selector cover ∧ 値均一。
  // theme T 側 entry ゼロ = token T 値に base 現値が入り T 表示不変 → coverage 不要。
  // 違反は当該 theme 側のみ drop (他 theme 側は独立して有効)
  for (const [pk, ents] of byPairPhys) {
    const sels = basePhysSels.get(pk) || new Set();
    for (const ctx of ['light', 'dark']) {
      const side = ents.filter(x => x.ctx === ctx && inBatch.has(keyOf(x)));
      if (!side.length) continue;
      const covered = new Set(side.map(x => x.baseSel));
      const vals = new Set(side.map(x => resolveCtx(x.value, ctx)));
      if (![...sels].every(S => covered.has(S)) || vals.size !== 1) {
        for (const x of side) if (inBatch.delete(keyOf(x))) { changed = true; dropGate(x, 'm-base-phys', pk); }
      }
    }
  }
}
} // mFixpoint

// ── S2-f: P (prop-add) 機械検証 ──
// op: 同 selector base rule 末尾へ `prop: var(--tok)` 挿入 + theme decl 削除。
//   token = { ctx 値 = theme 値, other 値 = 'initial' }
//   'initial' = custom property の guaranteed-invalid → var() 参照 decl が IACVT → unset
//   = 「decl 未指定相当」 を機械再現 (inherited は inherit / non-inherited は initial)。
//   ctx 側: 挿入 decl を synthetic pair として pairWinnerBlockers — 全 blocker harmless 必須
//   other 側: 挿入 decl が現 winner を奪う競合 (beaten) ゼロ必須。
//     例外: 反対 theme に同 baseSel+prop entry (opp) → opp (theme layer) が元々 base 競合に常勝
//           = other 表示は opp 値で全 element 確定 → merge token / opp 残置 どちらでも表示不変
const baseByRule = new Map(); // file|ruleId → { file, ruleStart, media, sels:Set, lastLine }
for (const b of baseDecls) {
  const k = `${b.file}|${b.ruleId}`;
  if (!baseByRule.has(k)) baseByRule.set(k, { file: b.file, ruleStart: b.ruleStart, media: b.media || null, sels: new Set(), lastLine: 0 });
  const r = baseByRule.get(k);
  r.sels.add(norm(b.selector));
  if (b.line > r.lastLine) r.lastLine = b.line;
}

function pInsertCandidates(baseSel, media) {
  // 同 selector ∧ 同 media の base rule 群 → cascade 降順 (layer → ruleStart)。
  // [0] = cascade 最後 = 従来の pInsertTarget (同 selector base rule 全てに A 勝ち =
  // pairWinnerBlockers の同 selector 除外と整合)。 [1..] = retry 候補 (S2-i) —
  // 採用時は後続 same-selector rule との propsConflict 再検証必須 (validatePTarget)
  const seen = new Set();
  const cands = [];
  for (const b of baseDecls) {
    if (norm(b.selector) !== baseSel || (b.media || null) !== (media || null)) continue;
    const k = `${b.file}|${b.ruleId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    cands.push(baseByRule.get(k));
  }
  cands.sort((a, b) => {
    const la = LAYER_ORDER.get(a.file) ?? 99, lb = LAYER_ORDER.get(b.file) ?? 99;
    if (la !== lb) return lb - la;
    return ordOf(b.file, b.ruleStart) - ordOf(a.file, a.ruleStart);
  });
  return cands;
}

// other theme で A (挿入 decl) が現 winner から element を奪う競合列挙 + 残置 theme 競合
function otherSideScan(e, target) {
  const other = e.ctx === 'light' ? 'dark' : 'light';
  const aL = LAYER_ORDER.get(target.file) ?? 99;
  const sa = specificity(e.baseSel);
  const beaten = [], keptTheme = [];
  const seen = new Set();
  for (const key of expandKeys(compoundKeys(e.baseSel))) {
    for (const g of byKey.get(key) || []) {
      if (g.prop.startsWith('--')) continue;
      if (!propsConflict(g.prop, e.prop)) continue;
      if (themeContext(g.selector) === e.ctx) continue;          // other 表示に無関係
      if (g.file === e.file && g.line === e.line && g.prop === e.prop) continue; // e 自身の物理 decl (全 split 同値)
      if (exclusiveDisjoint(e.baseSel, g.selector)) continue;
      const gid = `${g.file}|${g.line}|${norm(g.selector)}|${g.prop}`;
      if (seen.has(gid)) continue;
      seen.add(gid);
      if (g.important) continue;                                  // imp は A (normal) に常勝 → 奪い無し
      // 挿入先 rule 内の decl: A は rule 末尾 = 同 rule 内後勝ち (fragment spec 比較は無意味)
      const sameRule = g.file === target.file && g.line >= target.ruleStart && g.line <= target.lastLine;
      const gL = LAYER_ORDER.get(g.file) ?? 99;
      let aWins;
      if (sameRule) aWins = true;
      else if (gL !== aL) aWins = aL > gL;
      else {
        const sg = specificity(g.selector);
        aWins = sa > sg || (sa === sg && ordOf(target.file, target.lastLine) + 1 > ordOf(g.file, g.line));
      }
      if (!aWins) {
        // g 勝ち残置 = other 表示不変。 ただし g が theme file 在住 (= 同 batch で base へ移動し得る) なら依存記録。
        // opp (同 baseSel+prop の反対 theme decl) は除外 — merge で同一 insert/token に統合 (coverage gate 管轄)
        const isOpp = stripTheme(g.selector) === e.baseSel && g.prop === e.prop && (g.media || null) === (e.media || null);
        if (THEME_FILE_SET.has(g.file) && !isOpp) keptTheme.push(gid);
        continue;
      }
      beaten.push({ file: g.file, line: g.line, selector: norm(g.selector), prop: g.prop, value: norm(g.value) });
    }
  }
  return { beaten, keptTheme };
}

// shorthand 値 → longhand 成分抽出 (rescue 用)。 同 prop はそのまま、 抽出不能は null
const BORDER_STYLE_RE = /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/i;
function splitTop(v) { // top-level 空白 split (括弧内無視)
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
  // border(-side) shorthand → border(-side)-color
  if (/^border(-(top|right|bottom|left))?$/.test(fromProp) && /^border(-(top|right|bottom|left))?-color$/.test(toProp)) {
    const fromSide = (fromProp.match(/^border-(top|right|bottom|left)$/) || [])[1] || null;
    const toSide = (toProp.match(/^border-(top|right|bottom|left)-color$/) || [])[1] || null;
    if (fromSide && toSide && fromSide !== toSide) return null;
    if (!fromSide && toSide) { /* border → border-X-color: 全辺同値なので OK */ }
    if (fromSide && !toSide) return null; // border-left → border-color (他辺不明)
    const parts = splitTop(val).filter(p => !/^[\d.]+(px|em|rem|%)?$/.test(p) && !BORDER_STYLE_RE.test(p) && !/^(thin|medium|thick)$/i.test(p));
    return parts.length === 1 ? parts[0] : null;
  }
  // outline shorthand → outline-color
  if (fromProp === 'outline' && toProp === 'outline-color') {
    const parts = splitTop(val).filter(p => !/^[\d.]+(px|em|rem|%)?$/.test(p) && !BORDER_STYLE_RE.test(p) && !/^(thin|medium|thick|auto)$/i.test(p));
    return parts.length === 1 ? parts[0] : null;
  }
  // padding shorthand → padding-side
  if (fromProp === 'padding' && /^padding-(top|right|bottom|left)$/.test(toProp)) {
    const p = splitTop(val);
    if (p.length < 1 || p.length > 4) return null;
    const [t, r = t, b = t, l = r] = p;
    return { top: t, right: r, bottom: b, left: l }[toProp.slice(8)];
  }
  // inset shorthand → top/right/bottom/left (S2-g r93)
  if (fromProp === 'inset' && /^(top|right|bottom|left)$/.test(toProp)) {
    const p = splitTop(val);
    if (p.length < 1 || p.length > 4) return null;
    const [t, r = t, b = t, l = r] = p;
    return { top: t, right: r, bottom: b, left: l }[toProp];
  }
  // border shorthand → border-side 全体 (全辺同値) (S2-g r119)
  if (fromProp === 'border' && /^border-(top|right|bottom|left)$/.test(toProp)) return val;
  return null;
}

// ── S2-h: DOM 包含知識 (grep 検証済の構造的事実、 cover 証明にのみ使用) ──
// DOM_CONTAINMENT: class X の element は常に class A の element の子孫。
//   .wwm-cmp-current = xinfa.js:319 / gear.js:456 / arsenal.js:91 の 3 出現のみ、
//   全て .wwm-cmp-modal-a template 内部 + classList 動的付与なし (2026-06-06 grep 証明)
const DOM_CONTAINMENT = new Map([
  ['.wwm-cmp-current', ['.wwm-cmp-modal-a']],
  // 対照 modal 専用 control 群 — gear.js (419/422/438/444/457/469/471) / xinfa.js (328/329) /
  // arsenal.js (78) の template 変数は全て .wwm-cmp-modal-a の innerHTML 内 interpolate (2026-06-06 検証)
  ['.wwm-cmp-kongfu-select', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-set-select', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-stat-select', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-val-input', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-lv-select', ['.wwm-cmp-modal-a']],
  ['.wwm-cmp-lv', ['.wwm-cmp-modal-a']],
  // S2-j: .wwm-cmp-new = gear.js:463 / xinfa.js:326 / arsenal.js:97 の 3 出現のみ、
  // 全て "wwm-cmp-col wwm-cmp-new" で .wwm-cmp-current と同じ cmp-modal-a template 内 (2026-06-06 grep 証明)
  ['.wwm-cmp-new', ['.wwm-cmp-modal-a']],
]);
// SUBJECT_IMPLICATION: class X を持つ element は常に class A も併せ持つ (同 element)。
//   .wwm-cmp-modal-a の 3 出現は全て class="wwm-modal wwm-modal-square wwm-cmp-modal-a..."
const SUBJECT_IMPLICATION = new Map([
  ['.wwm-cmp-modal-a', ['.wwm-modal', '.wwm-modal-square']],
]);
// compound token set → SUBJECT_IMPLICATION で拡張 (element が必ず持つ class を追加)
function expandCompound(set) {
  const out = new Set(set);
  for (const t of set) for (const a of (SUBJECT_IMPLICATION.get(t) || [])) out.add(a);
  return out;
}

// selector 包含 (保守近似): g の全 compound 制約が sel の compound 列に順序保存で含まれる
// → g は sel の match element を全て match (g ⊇ sel)。 子/隣接 combinator・:not 等は bail
function selCovers(gSel, sel) {
  if (norm(gSel) === norm(sel)) return true; // 同一 selector (broken-split fragment 含む)
  // pseudo-element: 両者同一 suffix なら strip して本体比較 (S2-g r93 .tier-SS::before cover)
  const peOf = (s) => (s.match(/::?(before|after|placeholder|selection|first-line|first-letter)\s*$/) || [null])[0];
  const gPe = peOf(gSel), sPe = peOf(sel);
  if (gPe || sPe) {
    const normPe = (x) => x && x.replace(/^:+/, '::');
    if (normPe(gPe) !== normPe(sPe)) return false;
    return selCovers(gSel.replace(/::?[\w-]+\s*$/, ''), sel.replace(/::?[\w-]+\s*$/, ''));
  }
  if (/[>+~]|::|:not|:is|:where|:has/.test(gSel)) return false;
  // sel 側 sibling combinator は祖先弱化不可 (A + B の A は兄弟 ≠ 祖先) → norm 同一以外 bail (S2-h)
  if (/[+~]/.test(sel)) return false;
  const split = (s) => s.split(/\s+/).filter(Boolean).map(part =>
    new Set(part.match(/(\.[\w-]+|#[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?|[a-zA-Z][\w-]*|\*)/g) || [part]));
  const gParts = split(norm(gSel)), sParts = split(norm(sel).replace(/\s*>\s*/g, ' ')).map(expandCompound);
  if (!gParts.length || !sParts.length) return false;
  // subject (末尾) 同士: g の subject 制約 ⊆ sel の subject 制約 (implication 込)
  const subset = (a, b) => [...a].every(t => b.has(t));
  if (!subset(gParts[gParts.length - 1], sParts[sParts.length - 1])) return false;
  // 残り ancestor compound: 順序保存 subsequence
  let si = sParts.length - 2;
  for (let gi = gParts.length - 2; gi >= 0; gi--) {
    let found = false;
    for (; si >= 0; si--) {
      if (subset(gParts[gi], sParts[si])) { found = true; si--; break; }
    }
    if (!found && gi === 0) {
      // S2-h DOM 包含: g 最上位 compound を sel 内 class の既知祖先 (DOM_CONTAINMENT) で充足。
      // 位置安全条件: virtual 祖先は implier compound の直上にいる事だけが既知 (他 compound との
      // 上下関係は不明) → g に既 match 済 ancestor がある場合は未走査域 (index ≤ si、 = 既 match
      // より上の implier) のみ許可。 g 単独 ancestor なら implier は subject 含む全域可
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

const tIndex = new Map(); // 全 theme decl: gid → decl (kept dep の selector/value 参照用)
for (const d of themeDecls) tIndex.set(`${d.file}|${d.line}|${norm(d.selector)}|${d.prop}`, d);

// S2-j (D): hardNonTheme blocker b の theme-shadow 候補 —
// 同 ctx theme decl t で selCovers(t.baseSel ⊇ b.selector) ∧ shadowProp(t.prop ⊇ e.prop) ∧
// t が e (theme layer 内 spec/line) に勝つ → overlap(e,b) の winner は before も t。
// t 残置なら after も t (theme layer 常勝) = b 無害。 t が batch 移動する場合は pFixpoint で方向検証
// (t.final が b と e.insert の両方に勝つ要 — t.pair === b 特例は b 自身が token 化 = t 支配で成立)
function themeShadowsFor(e, b) {
  const keys = [];
  const sd = specificity(e.selector);
  for (const t of themeDecls) {
    if (t.prop.startsWith('--') || t.important) continue; // imp t は batch 候補外 — 解析単純化のため非 imp 限定 (保守的)
    const tCtx = t.file === DARK_CSS ? 'dark' : 'light';
    if (tCtx !== e.ctx) continue;
    if ((t.media || null) !== (e.media || null)) continue;
    if (t.file === e.file && t.line === e.line) continue; // e 自身 (同物理 decl の split 含む)
    if (!shadowProp(t.prop, e.prop)) continue;
    if (!selCovers(stripTheme(t.selector), b.selector)) continue;
    const st = specificity(t.selector);
    if (!(st > sd || (st === sd && ordOf(t.file, t.line) > ordOf(e.file, e.line)))) continue; // t が e に勝つ (before 勝者 ≠ e の保証)
    keys.push(`${t.file}|${t.line}|${norm(t.selector)}|${t.prop}`);
  }
  return keys;
}

// target 1 つに対する P 静的検証 (S2-i で関数化 — coverage retry が別候補で再検証する)
// laterRules = 採用 target より cascade 後の same-selector rule 群。 そこに propsConflict decl が
// あると挿入 decl A は同 specificity 後 rule に敗北 (= 従来「最後の rule 固定」が担保していた前提の補完検査)
function validatePTarget(e, target, laterRules) {
  for (const r of laterRules) {
    const conflict = baseDecls.some(b => b.file === r.file && b.line >= r.ruleStart && b.line <= r.lastLine &&
      norm(b.selector) === e.baseSel && !b.prop.startsWith('--') && propsConflict(b.prop, e.prop));
    if (conflict) return { ok: false, reason: 'later-conflict' };
  }
  const ins = { file: target.file, ruleStart: target.ruleStart, lastLine: target.lastLine, ruleSels: [...target.sels] };
  // ctx 側: 挿入 decl = synthetic pair (token ctx 値 = e.value で表示値保存)。
  // hard blocker (beforeGWins=false) は同 batch P theme decl なら fixpoint で方向検証 → ここでは不可判定しない
  const synth = { ...e, pair: { file: target.file, line: target.lastLine + 1 } };
  // 挿入先 rule 内 decl は A (末尾挿入) が rule 内順序で常勝 → blocker から除外
  const blockers = pairWinnerBlockers(synth, e.ctx)
    .filter(b => !(b.file === target.file && b.line >= target.ruleStart && b.line <= target.lastLine));
  const hardNonTheme = blockers.filter(b => !b.beforeGWins && !THEME_FILE_SET.has(b.file));
  // S2-j (D): hard blocker に theme-shadow 候補があれば fixpoint 繰延、 無ければ従来通り ctx-blocker
  const shadowDeps = [];
  const stillHard = [];
  for (const b of hardNonTheme) {
    const tKeys = themeShadowsFor(e, b);
    if (tKeys.length) shadowDeps.push({ b: { file: b.file, line: b.line, selector: b.selector, prop: b.prop }, tKeys });
    else stillHard.push(b);
  }
  if (stillHard.length) return { ok: false, reason: 'ctx-blocker', hardNonTheme: stillHard, blockers };
  // other 側 (rescue は rescueBeaten 共用 — S2-h で winning-cover + inherit 特例 + CSS-wide 拒否)
  const { beaten, keptTheme } = otherSideScan(e, target);
  let otherVal;
  if (beaten.length && !e.hasOpp) {
    const rescue = rescueBeaten(e, beaten);
    if (rescue === null) return { ok: false, reason: 'other-beaten', beaten, blockers, keptTheme };
    if (!rescue.useInitial) otherVal = rescue.value; // raw 値 (token default は使用点で theme 解決)
  }
  // unset 経路 (opp 無し ∧ rescue 値無し = token 'initial') の SVG presentation attr 穴 (S2-g 知見の P 適用)
  if (!e.hasOpp && !otherVal && svgAttrRisk(e.baseSel, e.prop)) return { ok: false, reason: 'svg-unset', blockers, keptTheme };
  return { ok: true, insert: ins, blockers, keptTheme, otherVal, shadowDeps };
}
function adoptPTarget(e, v) {
  e.insert = v.insert;
  // S2-j (D): theme-shadow 繰延した hard blocker は pBlockers から除外
  // (fixpoint の hard branch は theme blocker 前提 — 非 theme key は pIndex/mIndex 不在で誤 drop する。
  //  shadowed b の検証は pShadowDeps check が担当)
  const shadowed = new Set((v.shadowDeps || []).map(d => `${d.b.file}|${d.b.line}|${d.b.selector}|${d.b.prop}`));
  e.pBlockers = v.blockers.filter(b => !shadowed.has(`${b.file}|${b.line}|${b.selector}|${b.prop}`));
  e.pKeptTheme = v.keptTheme;
  e.pOtherVal = v.otherVal; // undefined = token 'initial'
  e.pShadowDeps = v.shadowDeps && v.shadowDeps.length ? v.shadowDeps : undefined; // S2-j (D)
}

for (const e of out.P) {
  e.ctx = e.file === DARK_CSS ? 'dark' : 'light';
  // 反対 theme の同 baseSel+prop entry (opp)
  const opp = out.P.find(o => o !== e && o.baseSel === e.baseSel && o.prop === e.prop &&
    (o.media || null) === (e.media || null) && o.file !== e.file);
  e.hasOpp = !!opp;
  if (opp) e.oppKey = `${opp.file}|${opp.line}|${norm(opp.selector)}|${opp.prop}`;
  if (e.important) { e.pSafe = false; e.pReason = 'imp'; continue; }
  e.pCands = pInsertCandidates(e.baseSel, e.media);
  e.pCandIdx = 0;
  if (!e.pCands.length) { e.pSafe = false; e.pReason = 'no-same-media-rule'; continue; }
  const v = validatePTarget(e, e.pCands[0], []);
  if (!v.ok) {
    e.pSafe = false; e.pReason = v.reason;
    if (v.hardNonTheme) e.pBlockerList = v.hardNonTheme.slice(0, 3).map(b => `${b.file}:${b.line} ${b.selector} { ${b.prop} }`);
    if (v.beaten) e.pBeatenList = v.beaten.slice(0, 3).map(g => `${g.file}:${g.line} ${g.selector} { ${g.prop} }`);
    continue;
  }
  adoptPTarget(e, v);
  e.pSafe = true;
}

// coverage fail 時の insert target retry (S2-i): 次候補 (cascade 前方の same-selector rule) を
// validatePTarget で再検証 → 成功なら insert 差替えて batch 残留 (multi-selector rule 巻添えの正当 drop を回避)。
// pCandIdx 単調増加 + 候補有限 → fixpoint 停止保証
function retryPTarget(e) {
  while (e.pCandIdx + 1 < e.pCands.length) {
    e.pCandIdx++;
    const target = e.pCands[e.pCandIdx];
    const later = e.pCands.slice(0, e.pCandIdx); // 降順 list = 前方 index が cascade 後続 rule
    const v = validatePTarget(e, target, later);
    if (v.ok) { adoptPTarget(e, v); e.pRetried = e.pCandIdx; return true; }
  }
  return false;
}

// P batch fixpoint — gate 3 種
const pKeyOf = (x) => `${x.file}|${x.line}|${norm(x.selector)}|${x.prop}`;
const pIndex = new Map();
for (const e of out.P) pIndex.set(pKeyOf(e), e);
const pBatch = new Set(out.P.filter(x => x.pSafe).map(pKeyOf));
const pPhysGroups = new Map(); // 物理 theme decl gate (all-or-none)
for (const e of out.P) {
  const k = `${e.file}|${e.line}|${e.prop}`;
  if (!pPhysGroups.has(k)) pPhysGroups.set(k, []);
  pPhysGroups.get(k).push(e);
}
// S2-j (C): 挿入先 rule の selector S に対する static base shadow —
// 同 selector S ∧ 同 media ∧ shadowProp の既存 base decl が挿入位置より cascade 後 (同 spec → layer/line) に
// あれば、 挿入 decl A は S の表示に関与不能 (常敗) = S は cover 不要。 theme 残置 decl は theme layer 常勝で
// 元々無害。 guard: S 上の batch entry (M/P) の final 位置が挿入位置に負けるなら不成立 (移動で A が浮上)
function coverageShadow(S, e) {
  const insPos = { layer: LAYER_ORDER.get(e.insert.file) ?? 99, spec: specificity(S), line: ordOf(e.insert.file, e.insert.lastLine) + 0.5 };
  const hasShadow = (baseBySel.get(S) || []).some(d =>
    (d.media || null) === (e.media || null) &&
    !d.prop.startsWith('--') && !d.important &&
    shadowProp(d.prop, e.prop) &&
    !(d.file === e.insert.file && d.line >= e.insert.ruleStart && d.line <= e.insert.lastLine) && // 挿入 rule 内 decl は A (末尾) に敗北
    posBeats({ layer: LAYER_ORDER.get(d.file) ?? 99, spec: specificity(S), line: ordOf(d.file, d.line) }, insPos));
  if (!hasShadow) return false;
  for (const x of out.M) {
    if (!inBatch.has(keyOf(x))) continue;
    if (x.baseSel === S && (x.media || null) === (e.media || null) && propsConflict(x.prop, e.prop) && !posBeats(finalPosM(x), insPos)) return false;
  }
  for (const x of out.P) {
    if (x === e || !x.insert || !pBatch.has(pKeyOf(x))) continue;
    if (x.baseSel === S && (x.media || null) === (e.media || null) && propsConflict(x.prop, e.prop) && !posBeats(finalPosP(x), insPos)) return false;
  }
  return true;
}

// dep entry (g) も batch 移動する場合の方向検証: 移動後 g insert が e insert に勝ち続けるか
function depStillWins(gE, e) {
  if (!gE.insert || !e.insert) return false;
  const gL = LAYER_ORDER.get(gE.insert.file) ?? 99;
  const eL = LAYER_ORDER.get(e.insert.file) ?? 99;
  if (gL !== eL) return gL > eL;
  const sg = specificity(gE.baseSel), se = specificity(e.baseSel);
  if (sg !== se) return sg > se;
  return ordOf(gE.insert.file, gE.insert.lastLine) > ordOf(e.insert.file, e.insert.lastLine);
}
function pFixpoint() {
let pchg = true;
while (pchg) {
  pchg = false;
  for (const e of out.P) {
    const k = pKeyOf(e);
    if (!pBatch.has(k)) continue;
    let drop = false;
    // ctx blocker: 勝敗方向が batch 適用後も保存される事を検証
    //   harmless (beforeGWins=true): g ∈ batch → g insert が勝ち続ける要 / g ∉ batch → 残置で勝ち続け OK
    //   hard (beforeGWins=false、 theme decl): g ∈ batch ∧ g insert が負ける (e 勝ち維持) 要 / g ∉ batch → 残置 g が theme layer で勝ってしまう → drop
    for (const b of e.pBlockers || []) {
      const bk = `${b.file}|${b.line}|${b.selector}|${b.prop}`;
      const bE = pIndex.get(bk);
      const inB = pBatch.has(bk);
      if (b.beforeGWins) {
        if (inB && bE) {
          // 同一 insert 物理 decl (同 rule + 同 prop) は coverage gate が値均一保証 → 方向不問
          const sameIns = bE.insert && e.insert && bE.insert.file === e.insert.file && bE.insert.ruleStart === e.insert.ruleStart && bE.prop === e.prop;
          if (!sameIns && !depStillWins(bE, e)) { drop = true; dropGate(e, 'p-dir', bk); break; }
        } else {
          // S2-j (B): b が M batch で base へ swap → 残置でない。 before b 勝ち → swap 後 b.pair も e.insert に勝ち続ける要
          const mbE = mIndex.get(bk);
          if (mbE && inBatch.has(bk) && !posBeats(finalPosM(mbE), finalPosP(e))) { drop = true; dropGate(e, 'p-mdir', bk); break; }
        }
      } else {
        if (!inB || !bE) {
          // S2-j (B): b が M batch で base へ swap されるなら残置でない — before e 勝ち → e.insert が b.pair に勝つ要
          const mbE = mIndex.get(bk);
          if (mbE && inBatch.has(bk)) {
            if (posBeats(finalPosP(e), finalPosM(mbE))) continue;
            drop = true; dropGate(e, 'p-mdir', bk); break;
          }
          drop = true; dropGate(e, 'p-hard-stay', bk); break; // theme hard blocker 残置 = 常勝 → 不可
        }
        const sameIns = bE.insert && e.insert && bE.insert.file === e.insert.file && bE.insert.ruleStart === e.insert.ruleStart && bE.prop === e.prop;
        if (!sameIns && depStillWins(bE, e)) { drop = true; dropGate(e, 'p-dir', bk); break; } // 移動後 g 勝ち = before (e 勝ち) と逆転 → 不可
      }
    }
    // S2-j (D): theme-shadow 依存 — t 残置なら theme layer 常勝で成立。
    // t が batch 移動なら t.final が blocker b と e.insert の両方に勝つ要。
    // t.pair === b 特例: b 自身が var(--tTok) 化 = b の表示は t 支配 → b への勝ちは自明、 e.insert への勝ちのみ検査
    if (!drop) {
      for (const dep of e.pShadowDeps || []) {
        const ok = dep.tKeys.some(tk => {
          const tM = mIndex.get(tk), tP = pIndex.get(tk);
          const tInM = tM && inBatch.has(tk), tInP = tP && pBatch.has(tk);
          if (!tInM && !tInP) return true; // 残置 = theme layer 常勝
          const bPos = { layer: LAYER_ORDER.get(dep.b.file) ?? 99, spec: specificity(dep.b.selector), line: ordOf(dep.b.file, dep.b.line) };
          if (tInM) {
            const tIsB = tM.pair.file === dep.b.file && tM.pair.line === dep.b.line && tM.prop === dep.b.prop;
            const tPos = tIsB ? bPos : finalPosM(tM);
            return (tIsB || posBeats(tPos, bPos)) && posBeats(tPos, finalPosP(e));
          }
          const tPos = finalPosP(tP);
          return posBeats(tPos, bPos) && posBeats(tPos, finalPosP(e));
        });
        if (!ok) { drop = true; dropGate(e, 'p-shadow-dir', `${dep.b.file}:${dep.b.line}`); break; }
      }
    }
    // other 残置勝者 (keptTheme): before 勝者 (g vs opp) に応じて方向要件が変わる
    //   opp 無し / opp 残置: before 勝者 = g (theme layer) → opp 残置なら opp 常勝で無関係、 無しなら g 勝ち維持要
    //   opp ∈ batch: before 勝者 = winner(opp, g)。 opp 勝ちだったなら g は移動して負ける要 (token = opp 値 表示維持)
    if (!drop) {
      const oppE = e.oppKey ? pIndex.get(e.oppKey) : null;
      const oppInBatch = oppE && pBatch.has(e.oppKey);
      const other = e.ctx === 'light' ? 'dark' : 'light';
      for (const d of e.pKeptTheme || []) {
        if (d === k) continue;
        if (oppE && !oppInBatch) break; // opp 残置 = other 側 theme layer で opp 常勝 → kept 依存 無関係
        const g = tIndex.get(d);
        const gE = pIndex.get(d);
        const gMoves = gE && pBatch.has(d);
        if (!g) { drop = true; dropGate(e, 'p-kept', d); break; }
        if (!oppE) {
          if (gMoves && !depStillWins(gE, e)) { drop = true; dropGate(e, 'p-kept', d); break; } // g 勝ち維持必須
        } else {
          if (resolveCtx(g.value, other) === resolveCtx(oppE.value, other)) continue; // 同値 = 方向不問
          const sg = specificity(g.selector), so = specificity(oppE.selector);
          const gWonBefore = sg > so || (sg === so && ordOf(g.file, g.line) > ordOf(oppE.file, oppE.line));
          if (gWonBefore) {
            if (gMoves && !depStillWins(gE, e)) { drop = true; dropGate(e, 'p-kept', d); break; }
          } else {
            if (!gMoves || depStillWins(gE, e)) { drop = true; dropGate(e, 'p-kept', d); break; } // g 残置 or 移動後勝ち = opp 値喪失
          }
        }
      }
    }
    if (drop) { pBatch.delete(k); pchg = true; }
  }
  // 物理 theme decl gate: 全 selector split が batch 内、 さもなくば全 drop
  for (const [pk, splits] of pPhysGroups) {
    const states = splits.map(s => pBatch.has(pKeyOf(s)));
    if (states.some(Boolean) && !states.every(Boolean)) {
      for (const s of splits) if (pBatch.delete(pKeyOf(s))) { pchg = true; dropGate(s, 'p-phys', pk); }
    }
  }
  // 挿入先 rule coverage gate (theme 別): rule の全 selector が当該 ctx の batch entry
  // (baseSel+prop+media 一致、 insert 先は別 rule でも可 — 余剰 decl は自 target に負ける = 無害) で
  // cover ∧ ctx 解決値均一。 違反 ctx 側のみ drop
  const byInsert = new Map();
  const batchBySelProp = new Map(); // baseSel|prop|media|ctx → entry
  for (const e of out.P) {
    if (!e.insert || !pBatch.has(pKeyOf(e))) continue;
    const k = `${e.insert.file}|${e.insert.ruleStart}|${e.prop}`;
    if (!byInsert.has(k)) byInsert.set(k, []);
    byInsert.get(k).push(e);
    batchBySelProp.set(`${e.baseSel}|${e.prop}|${e.media || ''}|${e.ctx}`, e);
  }
  for (const [, ents] of byInsert) {
    const sels = new Set(ents[0].insert.ruleSels);
    for (const ctx of ['light', 'dark']) {
      const side = ents.filter(x => x.ctx === ctx);
      if (!side.length) continue;
      const vals = new Set(side.map(x => resolveCtx(x.value, ctx)));
      let ok = vals.size === 1;
      if (ok) {
        const v0 = [...vals][0];
        for (const S of sels) {
          const cover = batchBySelProp.get(`${S}|${side[0].prop}|${side[0].media || ''}|${ctx}`);
          if (cover && resolveCtx(cover.value, ctx) === v0) continue;
          if (coverageShadow(S, side[0])) continue; // S2-j (C): 挿入 decl が S に cascade 常敗 = 無害 → cover 不要
          ok = false; break;
        }
      }
      // other 側 token 値 (pOtherVal ?? initial) も side 内で均一要 (token は group に 1 つ)
      if (ok) {
        const otherVals = new Set(side.map(x => x.pOtherVal ? norm(x.pOtherVal) : 'initial'));
        if (otherVals.size > 1) ok = false;
      }
      if (!ok) {
        for (const x of side) {
          if (!pBatch.has(pKeyOf(x))) continue;
          if (retryPTarget(x)) { pchg = true; continue; } // 別 target で batch 残留 → group 再編成は次 iteration
          pBatch.delete(pKeyOf(x)); pchg = true;
          dropGate(x, 'p-coverage', `${x.insert.file}:${x.insert.ruleStart} sels=${x.insert.ruleSels.length}`);
        }
      }
    }
  }
}
} // pFixpoint

// ── 横断 物理 decl gate + M/P 交互 fixpoint ──
// 同 物理 theme decl (file|line|prop) の selector split が M/P/N/S を跨ぐ場合、
// 削除 (= 行から decl 除去) は全 split が削除可能 (M batch ∪ P batch) の時のみ。
// (dark.css:13 val-input M batch が同 line の P split 4 個を道連れ削除した regression 2026-06-06 実例)
const allPhys = new Map(); // file|line|prop → [{cat, key}]
for (const [cat, arr] of [['M', out.M], ['P', out.P], ['N', out.N], ['S', out.S]]) {
  for (const e of arr) {
    const pk = `${e.file}|${e.line}|${e.prop}`;
    if (!allPhys.has(pk)) allPhys.set(pk, []);
    allPhys.get(pk).push({ cat, key: `${e.file}|${e.line}|${norm(e.selector)}|${e.prop}` });
  }
}
let outerChg = true;
while (outerChg) {
  outerChg = false;
  mFixpoint();
  pFixpoint();
  for (const [pk, splits] of allPhys) {
    const deletable = (s) => s.cat === 'M' ? inBatch.has(s.key) : s.cat === 'P' ? pBatch.has(s.key) : false;
    const states = splits.map(deletable);
    if (states.some(Boolean) && !states.every(Boolean)) {
      for (const s of splits) {
        const eAll = (s.cat === 'M' ? out.M : out.P).find(x => `${x.file}|${x.line}|${norm(x.selector)}|${x.prop}` === s.key);
        if (s.cat === 'M' && inBatch.delete(s.key)) { outerChg = true; if (eAll) dropGate(eAll, 'xphys', pk); }
        if (s.cat === 'P' && pBatch.delete(s.key)) { outerChg = true; if (eAll) dropGate(eAll, 'xphys', pk); }
      }
    }
  }
}
for (const e of out.M) e.batchSafe = inBatch.has(keyOf(e));
for (const e of out.P) e.pBatch = pBatch.has(pKeyOf(e));

// ── S2-g: N (no-base) rule co-locate 機械検証 ──
// rule 単位で component file へ移設 (同 rule の S decl は同乗)。
//   Mode T (non-imp decl): 新 base rule `baseSel { prop: var(--tok) }` を target file 末尾へ + theme decl 削除。
//     token = { ctx 値 = theme 値, other 値 = opp 値 | rescue | 'initial' (IACVT→unset = 未指定相当) }
//     検証 = P と同一 (ctx: pairWinnerBlockers synthetic / other: otherSideScan + opp + rescue)
//   Mode B (imp decl): theme prefix selector のまま rule を target file へ物理移動 (Step 1 K-type co-locate 前例)。
//     other theme 側 risk ゼロ (theme gate 維持)。 検証 = 勝敗方向保存 (relocateBlockers):
//     !important は @layer 順が逆転 (earlier layer imp 勝ち) → 移動で imp が「強くなる」 =
//     移動先 layer T 〜 theme layer の競合 imp に対する before/after flip を検査
//   opp (反対 theme N rule、 同 baseSel+prop): 両 rule 移動 → merge (token 両 theme 実値、 IACVT 不要)。
//     片側 deferred → 残置 theme rule が other 側 layer 常勝で遮蔽 = solo 移動可 (token other='initial' は dead 値)
//   前提: M/P batch = 0 (fixpoint 消化済)。 N 適用後に再 audit → M/P 解錠分は別 batch
if (inBatch.size || pBatch.size) console.warn(`⚠ N 検証は M/P batch 0 前提 (現 M ${inBatch.size} / P ${pBatch.size}) — 先に M/P を apply せよ`);

const N_TARGET_FILES = [...filesOfLayer('base'), ...filesOfLayer('components'), ...filesOfLayer('modals')];
function componentTargetFile(sels) {
  // baseSel 群の class/id token → base file 出現数 argmax (tie は後 layer)。 responsive は解体予定で対象外
  const tokens = new Set();
  for (const s of sels) for (const t of s.match(/[.#][\w-]+/g) || []) tokens.add(t);
  if (!tokens.size) return null;
  const res = [...tokens].map(t => new RegExp(t.replace(/[.[\]]/g, '\\$&') + '(?![\\w-])'));
  const score = new Map();
  const seenRule = new Set();
  for (const b of baseDecls) {
    if (!N_TARGET_FILES.includes(b.file)) continue;
    const rk = `${b.file}|${b.ruleId}|${norm(b.selector)}`;
    if (seenRule.has(rk)) continue;
    seenRule.add(rk);
    if (res.some(re => re.test(b.selector))) score.set(b.file, (score.get(b.file) || 0) + 1);
  }
  let best = null, bestN = 0;
  for (const f of N_TARGET_FILES) {
    const n = score.get(f) || 0;
    if (n >= bestN && n > 0) { best = f; bestN = n; } // >= で tie は後 layer
  }
  return best || filesOfLayer('components').at(-1); // fallback = components layer 最終 file
}

// 値が other theme で IACVT 確定か (fallback 無し var() 参照が other 側 token map に無い)
function valueInvalidIn(value, theme) {
  const map = themeTokenMaps[theme];
  for (const m of value.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    if (!map.has(m[1])) return true;
  }
  return false;
}

function svgAttrRisk(baseSel, prop) {
  return SVG_SUBJECT_RE.test(norm(baseSel)) && SVG_PRESENTATION_RE.test(prop);
}

// Mode B: rule 丸ごと selector 不変で layer 移動 — 勝敗方向 flip 検査。
// imp は layer 逆転 (earlier 勝ち)、 normal は通常 (later 勝ち)。 imp↔normal 間は不変で除外。
// theme file 在住 g は migration で位置が変わり得る → 全件返却 (fixpoint で再計算)、 非 theme g は flip のみ
function relocateBlockers(e, targetFile, vLine) {
  const T = LAYER_ORDER.get(targetFile);
  const eL = LAYER_ORDER.get(e.file);
  const se = specificity(e.selector);
  const other = e.ctx === 'light' ? 'dark' : 'light';
  const res = [];
  const seen = new Set();
  const win = (aL, bL, sa, sb, la, lb, imp) => {
    if (aL !== bL) return imp ? aL < bL : aL > bL;
    if (sa !== sb) return sa > sb;
    return la > lb;
  };
  for (const key of expandKeys(compoundKeys(e.selector))) {
    for (const g of byKey.get(key) || []) {
      if (g.prop.startsWith('--')) continue;
      if (g.file === e.file && g.ruleId === e.ruleId) continue;     // 自 rule (丸ごと移動 = 内部順序不変)
      if (!propsConflict(g.prop, e.prop)) continue;
      if (themeContext(g.selector) === other) continue;
      if (exclusiveDisjoint(e.baseSel, g.selector)) continue;
      if (!!g.important !== !!e.important) continue;                // imp vs normal は移動不変
      const gid = `${g.file}|${g.line}|${norm(g.selector)}|${g.prop}`;
      if (seen.has(gid)) continue;
      seen.add(gid);
      if (g.prop === e.prop && resolveCtx(g.value, e.ctx) === resolveCtx(e.value, e.ctx)) continue;
      const gL = LAYER_ORDER.get(g.file) ?? 99;
      const sg = specificity(g.selector);
      const beforeEWins = win(eL, gL, se, sg, ordOf(e.file, e.line), ordOf(g.file, g.line), e.important);
      const afterEWins = win(T, gL, se, sg, ordOf(targetFile, vLine), ordOf(g.file, g.line), e.important);
      const isTheme = THEME_FILE_SET.has(g.file);
      if (beforeEWins !== afterEWins || isTheme) {
        res.push({ gid, file: g.file, line: g.line, selector: norm(g.selector), prop: g.prop,
          beforeEWins, flip: beforeEWins !== afterEWins, isTheme, gL, sg, gImp: !!g.important, gLine: g.line, gRuleId: g.ruleId });
      }
    }
  }
  return res;
}

// beaten 同士の cascade 勝敗 (normal decl のみ — otherSideScan は imp 除外済)
function beatenWins(a, b) {
  const aL = LAYER_ORDER.get(a.file) ?? 99, bL = LAYER_ORDER.get(b.file) ?? 99;
  if (aL !== bL) return aL > bL;
  const sa = specificity(a.selector), sb = specificity(b.selector);
  if (sa !== sb) return sa > sb;
  return ordOf(a.file, a.line) > ordOf(b.file, b.line);
}
// beaten rescue (N / P 共用)。 返値: { value } | { useInitial: true } | null
//   旧 path: 全 beaten 同値 ∧ cover 存在
//   S2-h: cascade-max cover — cover g* が他 beaten 全てに cascade 勝ち
//     → baseSel の任意 element で「beaten 内 pre-insert winner」 = g* (max が element 不問で g*)
//     → token other 値 = g* の e.prop 成分で表示再現
//   inherit 特例 (S2-h): g* 成分 'inherit' ∧ 継承 prop ∧ 非 SVG presentation
//     → token 'initial' (IACVT→unset=inherit) が g* と同値 = rescue 値不要
//   他 CSS-wide keyword は custom property 値に不可 → null
function rescueBeaten(e, beaten) {
  const other = e.ctx === 'light' ? 'dark' : 'light';
  const exts = beaten.map(g => ({ g, ext: extractForProp(g.value, g.prop, e.prop) }));
  const vals = new Set(exts.map(x => x.ext === null ? '__NG__' : resolveCtx(x.ext, other)));
  const covers = exts.filter(x => x.ext !== null && selCovers(x.g.selector, e.baseSel));
  let pick = null;
  if (vals.size === 1 && !vals.has('__NG__') && covers.length) pick = covers[0];
  else for (const c of covers) {
    if (exts.every(x => x === c || beatenWins(c.g, x.g))) { pick = c; break; }
  }
  if (!pick) return null;
  const v = norm(pick.ext);
  if (/^(inherit|initial|unset|revert|revert-layer)$/i.test(v)) {
    if (/^inherit$/i.test(v) && INHERITED_PROPS.has(e.prop) && !svgAttrRisk(e.baseSel, e.prop)) return { useInitial: true };
    return null;
  }
  return { value: pick.ext };
}

// rule group 構築 (N + 同 rule の S 同乗)
const nRules = new Map(); // file#ruleId → meta
{
  const sByRule = new Map();
  for (const e of out.S) {
    const k = `${e.file}#${e.ruleId}`;
    if (!sByRule.has(k)) sByRule.set(k, []);
    sByRule.get(k).push(e);
  }
  const mpByRule = new Map();
  for (const arr of [out.M, out.P]) for (const e of arr) {
    const k = `${e.file}#${e.ruleId}`;
    if (!mpByRule.has(k)) mpByRule.set(k, []);
    mpByRule.get(k).push(e);
  }
  for (const e of out.N) {
    const k = `${e.file}#${e.ruleId}`;
    if (!nRules.has(k)) nRules.set(k, { key: k, file: e.file, ruleId: e.ruleId, ruleStart: e.ruleStart, entries: [], ok: true, reason: null });
    nRules.get(k).entries.push(e);
  }
  for (const [k, r] of nRules) {
    // S 同乗 + 重複 split (theme prefix 変種で同 baseSel) dedupe
    const rides = sByRule.get(k) || [];
    for (const s of rides) { s.ctx = s.file === DARK_CSS ? 'dark' : 'light'; s.nRide = true; }
    r.entries.push(...rides);
    const seen = new Set();
    r.entries = r.entries.filter(e => {
      const gid = `${e.line}|${norm(e.selector)}|${e.prop}`;
      if (seen.has(gid)) return false;
      seen.add(gid); return true;
    });
    for (const e of r.entries) e.ctx = e.file === DARK_CSS ? 'dark' : 'light';
    r.allImp = r.entries.every(e => e.important);
    const mp = mpByRule.get(k) || [];
    // defer 判定
    if (r.entries.some(e => e.media)) { r.ok = false; r.reason = 'media'; continue; }
    if (r.entries.some(e => /(^|[\s>+~])\*\s*$/.test(e.baseSel) || e.baseSel === '*')) { r.ok = false; r.reason = 'universal'; continue; }
    if (mp.length && !(r.allImp && mp.every(x => x.important))) { r.ok = false; r.reason = 'mixed-cat'; continue; } // M/P split 同居 (全 imp なら B 丸ごと可)
    if (mp.length) r.entries.push(...mp.map(x => ({ ...x, nRide: true, ctx: x.file === DARK_CSS ? 'dark' : 'light' })));
    r.target = componentTargetFile([...new Set(r.entries.map(e => e.baseSel))]);
    r.vLine = 500000 + r.ruleStart;
  }
  // opp merge: 同 baseSel 集合の反対 theme rule (両方 ok 候補) → 同 vLine (light 側) へ統合
  const sig = (r) => [...new Set(r.entries.map(e => e.baseSel))].sort().join(',');
  for (const [k, r] of nRules) {
    if (!r.ok || r.file !== DARK_CSS) continue;
    for (const [k2, r2] of nRules) {
      if (k2 === k || !r2.ok || r2.file !== LIGHT_CSS) continue;
      if (sig(r) === sig(r2)) { r.mergeInto = k2; r.vLine = r2.vLine; r.target = r2.target; break;
      }
    }
  }
}

// per-entry 検証 (T: synthetic pair + otherSideScan / B: relocateBlockers)
// part 粒度: rule の T part (non-imp) / B part (imp) は独立可否 (片側 fail でも他側移設可。
//   imp↔normal は cascade 不変なので part 間干渉なし)。 part 内は all-or-none。
// target retry: scored target で static fail → 後 layer の candidate で再検証 (spec 勝ち化)
const nIndex = new Map(); // gid → { e, r } (migration 中の theme decl 逆引き)
for (const [, r] of nRules) {
  if (!r.ok) continue;
  for (const e of r.entries) nIndex.set(`${e.file}|${e.line}|${norm(e.selector)}|${e.prop}`, { e, r });
}
// T decl 粒度 gate: (a) 同 phys decl (line|prop) の selector split all-or-none
//                   (b) 移動 T decl と残置 T decl の propGroup 競合禁止 (intra-rule shorthand 穴防止)
function applyTGates(r) {
  let any = false;
  const tEnts = r.entries.filter(x => x.nMode === 'T');
  let chg = true;
  while (chg) {
    chg = false;
    const byPhys = new Map();
    for (const x of tEnts) {
      const k = `${x.line}|${x.prop}`;
      if (!byPhys.has(k)) byPhys.set(k, []);
      byPhys.get(k).push(x);
    }
    for (const [, sp] of byPhys) {
      if (sp.some(x => x.nOk) && !sp.every(x => x.nOk)) {
        for (const x of sp) if (x.nOk) { x.nOk = false; x.nReason = x.nReason || 'phys-split'; chg = true; }
      }
    }
    for (const x of tEnts) {
      if (!x.nOk) continue;
      if (tEnts.some(k2 => !k2.nOk && k2 !== x && propsConflict(x.prop, k2.prop))) {
        x.nOk = false; x.nReason = 'kept-conflict'; chg = true;
      }
    }
    if (chg) any = true;
  }
  r.okT = tEnts.length === 0 || tEnts.some(x => x.nOk);
  if (!r.okT) r.reasonT = (tEnts.find(x => x.nReason) || {}).nReason || null;
  return any;
}
function verifyRuleAt(r, target) {
  // T は decl 粒度 (e.nOk)、 B は part 粒度。 entry の n* state は target 前提で設定
  const res = { okT: true, okB: true, reasonT: null, reasonB: null };
  for (const e of r.entries) {
    e.nMode = e.important ? 'B' : 'T';
    e.nTarget = target;
    e.nVLine = e.nMode === 'B' ? r.vLine + 0.5 : r.vLine;
    e.nOk = e.nMode === 'T';
    e.nReason = null;
    e.nOppKey = null; e.nOppStays = undefined; e.nOtherVal = null; e.nLiteralOk = false;
    e.nBlockers = null; e.nCtxBlockers = null; e.nKeptTheme = null; e.nBeatenList = null;
    if (e.nMode === 'B') {
      if (!res.okB) continue;
      e.nBlockers = relocateBlockers(e, target, e.nVLine);
      const hardFlip = e.nBlockers.filter(b => b.flip && !b.isTheme);
      if (hardFlip.length) {
        res.okB = false;
        res.reasonB = `B-flip: ${hardFlip[0].file}:${hardFlip[0].line} ${hardFlip[0].selector} { ${hardFlip[0].prop} }${hardFlip[0].gImp ? ' !imp' : ''}`;
      }
    } else {
      // opp: 反対 theme migration 候補内の同 baseSel+prop entry
      const oppHit = [...nIndex.values()].find(x => x.e !== e && x.e.baseSel === e.baseSel && x.e.prop === e.prop &&
        (x.e.media || null) === (e.media || null) && x.e.ctx !== e.ctx);
      e.nOppKey = oppHit ? `${oppHit.e.file}|${oppHit.e.line}|${norm(oppHit.e.selector)}|${oppHit.e.prop}` : null;
      // 反対 theme に残置される同 baseSel+prop theme decl (rule deferred / M / P) → other 側遮蔽
      const oppStays = !oppHit && themeDecls.some(d2 => !d2.prop.startsWith('--') && d2.prop === e.prop &&
        stripTheme(d2.selector) === e.baseSel && (d2.media || null) === (e.media || null) &&
        (d2.file === DARK_CSS ? 'dark' : 'light') !== e.ctx);
      const synth = { ...e, pair: { file: target, line: e.nVLine } };
      const blockers = pairWinnerBlockers(synth, e.ctx);
      e.nCtxBlockers = blockers;
      const hardNonTheme = blockers.filter(b => !b.beforeGWins && !THEME_FILE_SET.has(b.file));
      if (hardNonTheme.length) {
        e.nOk = false;
        e.nReason = `T-ctx: ${hardNonTheme[0].file}:${hardNonTheme[0].line} ${hardNonTheme[0].selector} { ${hardNonTheme[0].prop} }`;
        continue;
      }
      if (!e.nOppKey && !oppStays) {
        const { beaten, keptTheme } = otherSideScan(e, { file: target, ruleStart: e.nVLine, lastLine: e.nVLine });
        e.nKeptTheme = keptTheme;
        if (beaten.length) {
          const rescue = rescueBeaten(e, beaten);
          if (rescue === null) {
            e.nOk = false;
            e.nReason = `T-beaten: ${beaten[0].file}:${beaten[0].line} ${beaten[0].selector} { ${beaten[0].prop} }`;
            e.nBeatenList = beaten.slice(0, 4).map(g => `${g.file}:${g.line} ${g.selector} { ${g.prop}: ${g.value.slice(0, 40)} }`);
            continue;
          }
          if (!rescue.useInitial) e.nOtherVal = rescue.value; // useInitial = unset≡inherit 再現 → initial 経路続行
        }
        if (!e.nOtherVal) {
          // other 側 = unset 経路。 SVG presentation attr 穴 → Mode B 降格 (theme gate 維持 = other 影響ゼロ)
          if (svgAttrRisk(e.baseSel, e.prop)) {
            e.nMode = 'B'; e.nVLine = r.vLine + 0.5; e.nOk = false; e.nReason = 'svg→B';
            e.nBlockers = relocateBlockers(e, target, e.nVLine);
            const hardFlip = e.nBlockers.filter(b => b.flip && !b.isTheme);
            if (hardFlip.length && res.okB) {
              res.okB = false;
              res.reasonB = `B-flip(svg): ${hardFlip[0].file}:${hardFlip[0].line} ${hardFlip[0].selector} { ${hardFlip[0].prop} }`;
            }
            continue;
          }
          // IACVT 確定値 (other-invalid token 参照) なら literal 移設可 (token 不要)
          if (valueInvalidIn(e.value, e.ctx === 'light' ? 'dark' : 'light')) e.nLiteralOk = true;
        }
      } else {
        e.nOppStays = oppStays || undefined;
      }
    }
  }
  applyTGates(r);
  res.okT = r.okT;
  res.reasonT = r.reasonT;
  return res;
}
for (const [k, r] of nRules) {
  if (!r.ok) continue;
  const scored = r.target;
  const cands = [scored, ...N_TARGET_FILES.filter(f => f !== scored &&
    (LAYER_ORDER.get(f) ?? 0) > (LAYER_ORDER.get(scored) ?? 0))];
  const moveScore = (v) => r.entries.filter(x => x.nMode === 'T' && x.nOk).length +
    (v.okB ? r.entries.filter(x => x.nMode === 'B').length : 0);
  let best = null;
  for (const cand of cands) {
    const v = verifyRuleAt(r, cand);
    const s = moveScore(v);
    if (!best || s > best.s) best = { cand, v, s };
    if (v.okT && v.okB && r.entries.every(x => x.nMode === 'B' || x.nOk)) break; // 全 decl 移設 = 最良
  }
  const v = verifyRuleAt(r, best.cand); // entry state を best candidate で確定
  r.target = best.cand;
  r.okB = v.okB; r.reasonB = v.reasonB; // okT/reasonT は applyTGates が r に設定済
  if (!r.okT && !r.okB) { r.ok = false; r.reason = r.reasonT || r.reasonB; }
}

// nFixpoint: 移動 rule 間の勝敗方向保存 (part 粒度)。 part fail → batch から除外 → 再評価
function nAfterPos(x) { // migration 後の比較座標 { L, s, line }
  return x.e.nMode === 'B'
    ? { L: LAYER_ORDER.get(x.r.target), s: specificity(x.e.selector), line: ordOf(x.r.target, x.e.nVLine) }
    : { L: LAYER_ORDER.get(x.r.target), s: specificity(x.e.baseSel), line: ordOf(x.r.target, x.e.nVLine) };
}
const winPos = (a, b, imp) => {
  if (a.L !== b.L) return imp ? a.L < b.L : a.L > b.L;
  if (a.s !== b.s) return a.s > b.s;
  return a.line > b.line;
};
const partOk = (x) => !!(x.r.ok && (x.e.nMode === 'B' ? x.r.okB : x.e.nOk)); // mig entry が実際に移動するか
let nChg = true;
while (nChg) {
  nChg = false;
  for (const [k, r] of nRules) {
    if (!r.ok) continue;
    for (const e of r.entries) {
      let fail = null;
      if (e.nMode === 'B') {
        if (!r.okB) continue;
        for (const b of e.nBlockers || []) {
          const mig = nIndex.get(b.gid);
          const migOk = mig && partOk(mig);
          if (!migOk) {
            // g 残置: flip なら fail (非 theme flip は検証時 fail 済 — ここは theme g 残置分)
            if (b.flip) { fail = `B-flip-kept: ${b.selector} { ${b.prop} }`; break; }
          } else {
            // g も移動 → after 再計算 (g の新位置)。 imp 同士のみ此処に来る (imp↔normal 除外済)
            const after = winPos({ L: LAYER_ORDER.get(r.target), s: specificity(e.selector), line: ordOf(r.target, e.nVLine) }, nAfterPos(mig), e.important);
            if (after !== b.beforeEWins) { fail = `B-dir: ${b.selector} { ${b.prop} } (co-migrate flip)`; break; }
          }
        }
        if (fail) { r.okB = false; r.reasonB = fail; nChg = true; }
      } else {
        if (!e.nOk) continue;
        for (const b of e.nCtxBlockers || []) {
          if (!THEME_FILE_SET.has(b.file)) { if (!b.beforeGWins) { fail = `T-ctx: ${b.selector}`; break; } continue; }
          const bid = `${b.file}|${b.line}|${b.selector}|${b.prop}`;
          const mig = nIndex.get(bid);
          const migOk = mig && partOk(mig);
          if (b.beforeGWins) {
            // g 勝ち維持要: 残置 (theme layer) なら常勝 OK / 移動なら再計算
            if (migOk) {
              const ePos = { L: LAYER_ORDER.get(r.target), s: specificity(e.baseSel), line: ordOf(r.target, e.nVLine) };
              // imp g (B mode) は normal e に常勝 → OK
              if (!mig.e.important && !winPos(nAfterPos(mig), ePos, false)) { fail = `T-dep-lost: ${b.selector} { ${b.prop} }`; break; }
            }
          } else {
            // hard: e 勝ち維持要。 g 残置 (theme layer 常勝) = fail / g 移動 → e が勝つ要
            if (!migOk) { fail = `T-hard-kept: ${b.selector} { ${b.prop} }`; break; }
            if (mig.e.important) { fail = `T-hard-imp: ${b.selector}`; break; } // imp 残留 g は常勝
            const ePos = { L: LAYER_ORDER.get(r.target), s: specificity(e.baseSel), line: ordOf(r.target, e.nVLine) };
            if (winPos(nAfterPos(mig), ePos, false)) { fail = `T-hard-dir: ${b.selector} { ${b.prop} }`; break; }
          }
        }
        // other 側 kept theme deps: g (反対 theme decl) が移動するなら e の挿入に勝ち続ける要
        if (!fail) for (const gid of e.nKeptTheme || []) {
          const mig = nIndex.get(gid);
          if (!mig || !partOk(mig)) continue; // 残置 = theme layer 常勝 OK
          if (mig.e.important) continue;      // imp は常勝維持
          const ePos = { L: LAYER_ORDER.get(r.target), s: specificity(e.baseSel), line: ordOf(r.target, e.nVLine) };
          if (!winPos(nAfterPos(mig), ePos, false)) { fail = `T-other-dep: ${mig.e.baseSel} { ${mig.e.prop} }`; break; }
        }
        // opp が fail したら solo 化 (oppStays 降格 — 残置 theme rule が other 側遮蔽)
        if (!fail && e.nOppKey) {
          const mig = nIndex.get(e.nOppKey);
          if (!mig || !partOk(mig)) { e.nOppKey = null; e.nOppStays = true; }
        }
        if (fail) { e.nOk = false; e.nReason = fail; nChg = true; }
      }
    }
    if (applyTGates(r)) nChg = true; // decl 落ちの波及 (phys split / propGroup 競合)
    if (!r.okT && !r.okB) { r.ok = false; r.reason = r.reasonT || r.reasonB; }
  }
  // merge 整合: mergeInto 先 T part fail → solo 移動 (token other='initial'、 残置 rule が遮蔽)
  for (const [, r] of nRules) {
    if (!r.ok || !r.mergeInto) continue;
    const tgt = nRules.get(r.mergeInto);
    if (!tgt || !tgt.okT) { r.mergeInto = null; nChg = true; }
  }
}
for (const [, r] of nRules) for (const e of r.entries) e.nBatch = !!(r.ok && (e.nMode === 'B' ? r.okB : e.nOk));
out.NRULES = [...nRules.values()].map(r => ({
  key: r.key, file: r.file, ruleId: r.ruleId, ruleStart: r.ruleStart, target: r.target, vLine: r.vLine,
  ok: r.ok, reason: r.reason, okT: !!r.okT, okB: !!r.okB, reasonT: r.reasonT || null, reasonB: r.reasonB || null,
  allImp: r.allImp, mergeInto: r.mergeInto || null,
  modes: [...new Set(r.entries.map(e => e.nMode || '?'))].join(''),
  sels: [...new Set(r.entries.map(e => e.baseSel))],
  entries: r.entries.map(e => ({
    line: e.line, selector: norm(e.selector), baseSel: e.baseSel, prop: e.prop, value: e.value,
    important: !!e.important, ctx: e.ctx, nMode: e.nMode || null, nVLine: e.nVLine || null,
    nBatch: !!e.nBatch, nOk: !!e.nOk, nReason: e.nReason || null,
    nOppKey: e.nOppKey || null, nOppStays: !!e.nOppStays, nOtherVal: e.nOtherVal || null,
    nLiteralOk: !!e.nLiteralOk, nRide: !!e.nRide, nBeatenList: e.nBeatenList || null,
  })),
}));

// ── S2-h: shadowed dead theme decl 検出 ──
// 同 theme file 内の rule d2 (同 prop ∧ 同 media) が d の全 match element を cover
// (selCovers = DOM 包含込) し cascade 常勝 → d はどの element でも winner になれない = dead。
// 値不問 (d2 常勝なら d の値は表示に乗らない) → 削除は表示不変。
// fixpoint: shadower が全て同時削除されると d が蘇生し得る → 生存 shadower 必須
{
  const isShadowedBy = (d, d2) => {
    if (d2 === d || d2.prop.startsWith('--')) return false;
    if (d2.file !== d.file || d2.prop !== d.prop) return false;
    if (d2.line === d.line) return false; // 同 物理 decl の selector split (削除道連れ)
    if ((d2.media || null) !== (d.media || null)) return false;
    if (d.important && !d2.important) return false;
    if (!selCovers(stripTheme(d2.selector), stripTheme(d.selector))) return false;
    if (!d.important && d2.important) return true; // 同 layer imp > normal
    const sd = specificity(d.selector), s2 = specificity(d2.selector);
    return s2 > sd || (s2 === sd && d2.line > d.line);
  };
  const shadowers = new Map(); // declRef → [d2,...]
  for (const d of themeDecls) {
    if (d.prop.startsWith('--')) continue;
    const base = stripTheme(d.selector);
    if (base === 'html' || base === '') continue;
    const hits = themeDecls.filter(d2 => isShadowedBy(d, d2));
    if (hits.length) shadowers.set(d, hits);
  }
  // fixpoint: 生存 shadower を最低 1 つ持つもののみ dead
  let dead = new Set(shadowers.keys());
  let chg = true;
  while (chg) {
    chg = false;
    for (const d of [...dead]) {
      if (!shadowers.get(d).some(d2 => !dead.has(d2))) { dead.delete(d); chg = true; }
    }
  }
  // 物理 decl gate: 全 selector split が dead の時のみ削除可
  const physDead = new Map();
  for (const d of themeDecls) {
    if (d.prop.startsWith('--')) continue;
    const k = `${d.file}|${d.line}|${d.prop}`;
    if (!physDead.has(k)) physDead.set(k, []);
    physDead.get(k).push(d);
  }
  out.DEAD = [];
  for (const [k, splits] of physDead) {
    if (!splits.every(s => dead.has(s))) continue;
    const d = splits[0];
    const sh = shadowers.get(d)[0];
    out.DEAD.push({ file: d.file, line: d.line, prop: d.prop, selector: norm(d.selector),
      shadower: `${sh.file}:${sh.line} ${norm(sh.selector)}` });
  }
}

const cnt = (a) => a.length;
console.log(`theme decls: ${themeDecls.length} (TOKEN ${cnt(out.TOKEN)} / M ${cnt(out.M)} / P ${cnt(out.P)} / N ${cnt(out.N)} / S ${cnt(out.S)})`);
if (out.DEAD.length) {
  console.log(`DEAD (shadowed、 削除可): ${out.DEAD.length} 物理 decl`);
  for (const d of out.DEAD) console.log(`  [DEAD] ${d.file.replace('assets/styles-', '')}:${d.line} ${d.selector.slice(0, 60)} { ${d.prop} } ← ${d.shadower.replace('assets/styles-', '').slice(0, 80)}`);
}
const safeM = out.M.filter(d => d.safe);
console.log(`M safe (静的): ${safeM.length} / ${out.M.length}  (うち same-value redundant: ${safeM.filter(d => d.sameValue).length})`);
const batchM = out.M.filter(d => d.batchSafe);
console.log(`M batchSafe (fixpoint): ${batchM.length}  (same-value: ${batchM.filter(d => d.sameValue).length} / swap: ${batchM.filter(d => !d.sameValue).length})`);
const safeP = out.P.filter(d => d.pSafe);
const batchP = out.P.filter(d => d.pBatch);
console.log(`P safe (静的): ${safeP.length} / ${out.P.length}  → pBatch (fixpoint+gate): ${batchP.length}`);
const nOkRules = out.NRULES.filter(r => r.ok);
const nOkDecls = out.N.filter(e => e.nBatch).length;
const nMovT = out.NRULES.reduce((a, r) => a + r.entries.filter(x => x.nMode === 'T' && x.nBatch).length, 0);
const nMovB = out.NRULES.reduce((a, r) => a + r.entries.filter(x => x.nMode === 'B' && x.nBatch).length, 0);
console.log(`N rules: ${nOkRules.length} / ${out.NRULES.length} 移設可  (N decl ${nOkDecls} / ${out.N.length}、 移設 split T ${nMovT} / B ${nMovB})`);
for (const r of out.NRULES) {
  const tCnt = r.entries.filter(x => x.nMode === 'T').length;
  const tMv = r.entries.filter(x => x.nMode === 'T' && x.nBatch).length;
  const bCnt = r.entries.filter(x => x.nMode === 'B').length;
  const bMv = r.entries.filter(x => x.nMode === 'B' && x.nBatch).length;
  const stay = r.entries.find(x => x.nMode === 'T' && !x.nBatch && x.nReason);
  const part = !r.ok ? `NG ${r.reason}`
    : (tMv === tCnt && bMv === bCnt) ? 'OK'
    : `PARTIAL T ${tMv}/${tCnt} B ${bMv}/${bCnt}${stay ? ` (${stay.nReason})` : ''}`;
  const tag = r.ok && r.mergeInto ? `${part} →merge(${r.mergeInto.replace('assets/styles-', '').replace('.css', '')})` : part;
  console.log(`  [${r.modes}] ${r.key.replace('assets/styles-', '').replace('.css', '')} L${r.ruleStart} → ${(r.target || '?').replace('assets/styles-', '').replace('.css', '')} | ${r.sels[0].slice(0, 55)}${r.sels.length > 1 ? ` +${r.sels.length - 1}sel` : ''} | ${tag}`);
}
const pReasons = {};
for (const d of out.P) {
  if (d.pBatch) continue;
  const r = d.pSafe ? 'gate-drop' : d.pReason;
  pReasons[r] = (pReasons[r] || 0) + 1;
}
console.log(`P 非 batch 内訳: ${Object.entries(pReasons).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
// drop-gate 計測 (fixpoint 初回 drop 理由 — 後続連鎖と区別)
for (const cat of ['M', 'P']) {
  const gated = out[cat].filter(d => d.dropGate);
  if (!gated.length) continue;
  console.log(`${cat} drop-gate 内訳:`);
  for (const d of gated) console.log(`  [${d.dropGate}] ${d.file}:${d.line} ${d.baseSel} { ${d.prop} }${d.dropDetail ? ` ← ${d.dropDetail}` : ''}`);
}

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

for (const e of out.P) delete e.pCands; // rule object (sels:Set) は非 serializable — pCandIdx/pRetried は残す
fs.writeFileSync('scripts/.theme-swap.json', JSON.stringify(out, null, 1));
console.log('→ scripts/.theme-swap.json');
