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

// ── S2-d/e: theme context token map + var() 解決 (値の意味比較用) ──
// tokens.css :root 定義 → 当該 theme file の token block で上書き
const themeTokenMaps = { light: new Map(), dark: new Map() };
for (const d of parseCss(fs.readFileSync('assets/styles-tokens.css', 'utf8'), 'assets/styles-tokens.css')) {
  if (!d.prop.startsWith('--')) continue;
  themeTokenMaps.light.set(d.prop, d.value);
  themeTokenMaps.dark.set(d.prop, d.value);
}
for (const d of themeDecls) {
  if (!d.prop.startsWith('--')) continue;
  if (d.file === 'assets/styles-light.css') themeTokenMaps.light.set(d.prop, d.value);
  if (d.file === 'assets/styles-dark.css') themeTokenMaps.dark.set(d.prop, d.value);
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
  for (const key of compoundKeys(pairSel)) {
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
        afterGWins = sg > sp || (sg === sp && g.line > d.pair.line);
      }
      if (!afterGWins) continue;                              // pair 勝ち確定 = 無害
      // before: g vs d (d = light layer normal)
      let beforeGWins = false;
      if (gL === dL) {
        const sg = specificity(g.selector);
        beforeGWins = sg > sd || (sg === sd && g.line > d.line);
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
      entry.ctx = d.file === 'assets/styles-dark.css' ? 'dark' : 'light';
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
const LIGHT_FILE = 'assets/styles-light.css';
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
  return gE.pair.line > e.pair.line;
}

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
            return ss > sd || (ss === sd && s.line > e.line) ||
              resolveCtx(s.value, e.ctx) === resolveCtx(e.value, e.ctx); // g' が d に勝つ or theme 表示同値
          });
          if (!shielded) { dropSelf = true; break; }
        }
      } else {
        const valEq = g.prop === e.prop && resolveCtx(g.value, e.ctx) === resolveCtx(e.value, e.ctx);
        if (valEq) continue; // light 表示同値 → どちらが勝っても不変
        const afterGWins = cmpBaseGWins(e, gE);
        const okDir = afterGWins === null ? false : afterGWins === g.beforeGWins;
        if (!okDir) {
          if (g.beforeGWins) {
            // g を残せば harmless → blocker 側を batch から外す (依存を道連れにしない)
            inBatch.delete(gK); changed = true;
          } else {
            dropSelf = true; break;
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
      for (const s of splits) if (inBatch.delete(keyOf(s))) changed = true;
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
        for (const x of side) if (inBatch.delete(keyOf(x))) changed = true;
      }
    }
  }
}

for (const e of out.M) e.batchSafe = inBatch.has(keyOf(e));

const cnt = (a) => a.length;
console.log(`theme decls: ${themeDecls.length} (TOKEN ${cnt(out.TOKEN)} / M ${cnt(out.M)} / P ${cnt(out.P)} / N ${cnt(out.N)} / S ${cnt(out.S)})`);
const safeM = out.M.filter(d => d.safe);
console.log(`M safe (静的): ${safeM.length} / ${out.M.length}  (うち same-value redundant: ${safeM.filter(d => d.sameValue).length})`);
const batchM = out.M.filter(d => d.batchSafe);
console.log(`M batchSafe (fixpoint): ${batchM.length}  (same-value: ${batchM.filter(d => d.sameValue).length} / swap: ${batchM.filter(d => !d.sameValue).length})`);

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
