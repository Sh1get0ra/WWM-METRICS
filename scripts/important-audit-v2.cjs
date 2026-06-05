#!/usr/bin/env node
// !important audit v2 — 全 8 css file + @media 内 対応 (Tier 1)
//
// Phase 5.2-B 失敗教訓 反映:
//   - 単純 selector match では higher-specificity competitor 検出不可 → 全 decl index 化
//   - @media 内 rule も対象 (responsive 408件 = 最大 hot spot)
//   - cross-file competitor 考慮 (cascade: tokens→animations→base→components→modals→responsive→dark→light)
//   - JS inline style (element.style.* / template style="") 対抗の !important を K 送り
//
// 分類 (conservative — 迷ったら keep 側):
//   A — 競合ゼロ + inline style 形跡なし → strip 安全候補
//   K — inline style 競合可能性 (同 prop を書く JS に selector class が出現) → keep
//   C — 同 finalCompound+prop に他 decl あり → 保留 (手動 review)
//
// 出力: scripts/.important-v2.json + stdout summary

const fs = require('fs');
const path = require('path');

const CSS_FILES = [
  'assets/styles-tokens.css',
  'assets/styles-animations.css',
  'assets/styles-base.css',
  'assets/styles-components.css',
  'assets/styles-modals.css',
  'assets/styles-responsive.css',
  'assets/styles-dark.css',
  'assets/styles-light.css'
];

const JS_GLOBS = ['assets', 'assets/sidebar', 'assets/helpers'];

// ── CSS parse (top-level + @media/@supports 1段 nest) ──────────────
function parseCss(src, file) {
  const decls = []; // {file, line, selector, finalCompound, prop, value, important, media}
  let i = 0, line = 1;
  const len = src.length;

  function skipWsCmt() {
    while (i < len) {
      const ch = src[i];
      if (ch === '\n') { line++; i++; }
      else if (ch === ' ' || ch === '\t' || ch === '\r') i++;
      else if (ch === '/' && src[i+1] === '*') {
        i += 2;
        while (i < len && !(src[i] === '*' && src[i+1] === '/')) { if (src[i] === '\n') line++; i++; }
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
        if (ch === inStr && src[i-1] !== '\\') inStr = null;
        if (ch === '\n' && countLines) line++;
        i++; continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; i++; continue; }
      if (ch === '/' && src[i+1] === '*') {
        i += 2;
        while (i < len && !(src[i] === '*' && src[i+1] === '/')) { if (src[i] === '\n' && countLines) line++; i++; }
        i += 2; continue;
      }
      if (stopChars.includes(ch)) break;
      if (ch === '\n' && countLines) line++;
      i++;
    }
    return src.slice(start, i);
  }

  function parseBlockBody(media) {
    // i は '{' の次。 } まで rule/decl を読む
    while (i < len) {
      skipWsCmt();
      if (i >= len || src[i] === '}') { i++; return; }
      const selStart = line;
      const head = readUntil('{};', true).trim();
      if (i >= len) return;
      if (src[i] === ';') { i++; continue; } // @import 等
      if (src[i] === '}') { i++; return; }
      // src[i] === '{'
      i++;
      if (head.startsWith('@media') || head.startsWith('@supports')) {
        parseBlockBody(head); // nest 1段 (media context 付け替え)
      } else if (head.startsWith('@keyframes') || head.startsWith('@font-face') || head.startsWith('@')) {
        // keyframes 等 — 中身 skip (decl 対象外)
        let depth = 1;
        while (i < len && depth > 0) {
          const ch = src[i];
          if (ch === '\n') line++;
          if (ch === '{') depth++;
          if (ch === '}') depth--;
          i++;
        }
      } else {
        // 通常 rule — body 内 decl parse
        parseDecls(head, selStart, media);
      }
    }
  }

  function parseDecls(selector, selLine, media) {
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
          decls.push({
            file, line: declLine, selector: s,
            keys: compoundKeys(s),
            prop, value: value.trim(), important, media: media || null
          });
        }
      }
      if (!hasSemi && src[i-1] === '}') return; // readUntil が } で止まり i++ 済
    }
  }

  while (i < len) {
    skipWsCmt();
    if (i >= len) break;
    const selStart = line;
    const head = readUntil('{;', true).trim();
    if (i >= len) break;
    if (src[i] === ';') { i++; continue; }
    i++; // '{'
    if (head.startsWith('@media') || head.startsWith('@supports')) {
      parseBlockBody(head);
    } else if (head.startsWith('@keyframes') || head.startsWith('@font-face') || (head.startsWith('@') && !head.startsWith('@media'))) {
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

// 右端 compound → 競合判定用 key 群
//
// Batch A 失敗教訓 (2026-06-05):
//   `.foo[hidden]` を `.foo` と別 compound 扱い → 「競合ゼロ」 誤判定 →
//   display:none !important strip → hidden 制御崩壊 (mobile overlay 開きっぱなし)
//
// 対策:
//   - pseudo-class (:hover 等) / attr ([hidden] 等) は key から畳む = 同 element の state variant を競合扱い
//   - pseudo-element (::before / ::after = 別 box) は suffix として維持
//   - multi-class compound (.foo.bar) は各 class 単体 key にも登録 =
//     `.foo.bar` vs `.foo.baz` / `.foo` の same-element cascade 戦争を検出
function compoundKeys(sel) {
  // attr 中身の空白で split 誤爆しないよう placeholder 化
  const safe = sel.replace(/\[[^\]]*\]/g, '[]');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || safe;
  const tokens = last.match(/(\.[\w-]+|#[\w-]+|\[\]|::?[\w-]+(\([^)]*\))?|[a-zA-Z][\w-]*|\*)/g) || [last];

  let pseudoEl = '';
  const bases = [];
  for (const t of tokens) {
    if (t.startsWith('::') || /^:(before|after|placeholder|selection|first-line|first-letter)$/.test(t)) {
      pseudoEl = t.replace(/^:(?=[a-z])/, '::'); // legacy :before → ::before 正規化
    } else if (t.startsWith(':') || t === '[]') {
      // pseudo-class / attr → 畳む (state variant = 同 element)
    } else {
      bases.push(t); // .class / #id / element / *
    }
  }
  if (bases.length === 0) bases.push('*');
  // 各 base 単体 + 全体 compound を key 化 (重複除去)
  const keys = new Set(bases.map(b => b + pseudoEl));
  keys.add(bases.sort().join('') + pseudoEl);
  return [...keys];
}

// prop → shorthand group 正規化 (margin-top と margin の競合検出)
//
// Batch A 第2失敗教訓 (2026-06-05): `margin: X !important` strip →
// 別 rule の `margin-top` longhand が部分上書き → mobile layout shift
function propGroup(prop) {
  const p = prop.toLowerCase();
  if (/^margin(-|$)/.test(p)) return 'margin';
  if (/^padding(-|$)/.test(p)) return 'padding';
  if (/^flex(-flow|-direction|-wrap|-grow|-shrink|-basis)?$/.test(p)) return 'flex';
  if (/^grid-(area|row|column)/.test(p)) return 'grid-place';
  if (/^overflow(-|$)/.test(p)) return 'overflow';
  if (/^border/.test(p)) return 'border';      // border-radius 含む (conservative)
  if (/^background(-|$)/.test(p)) return 'background';
  if (/^font(-|$)/.test(p)) return 'font';     // font-size/family/weight 同 group (conservative)
  if (/^(gap|row-gap|column-gap)$/.test(p)) return 'gap';
  if (/^(inset|top|right|bottom|left)$/.test(p)) return 'inset';
  if (/^(width|min-width|max-width)$/.test(p)) return 'width';
  if (/^(height|min-height|max-height)$/.test(p)) return 'height';
  if (/^text-decoration/.test(p)) return 'text-decoration';
  if (/^(animation|transition)(-|$)/.test(p)) return p.split('-')[0];
  if (/^(place|align|justify)-/.test(p)) return 'box-align';
  return p;
}

// ── JS inline style 調査 ─────────────────────────────────────────
function collectJsSources() {
  const files = [];
  for (const dir of JS_GLOBS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.js')) files.push(path.join(dir, f));
    }
  }
  return files.map(f => ({ file: f, src: fs.readFileSync(f, 'utf8') }));
}

const camelToKebab = (s) => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

function buildInlinePropMap(jsSources) {
  // prop(kebab) → Set<jsFile>
  const map = new Map();
  for (const { file, src } of jsSources) {
    // element.style.fontSize = ...
    for (const m of src.matchAll(/\.style\.([a-zA-Z]+)\s*=/g)) {
      const prop = camelToKebab(m[1]);
      if (!map.has(prop)) map.set(prop, new Set());
      map.get(prop).add(file);
    }
    // cssText → 全 prop 不明 = file 全体を wildcard 扱い
    if (/\.style\.cssText\s*=/.test(src)) {
      if (!map.has('*')) map.set('*', new Set());
      map.get('*').add(file);
    }
    // template literal / string 内 style="..." / style='...' の prop
    for (const m of src.matchAll(/style="([^"]{2,300})"|style='([^']{2,300})'/g)) {
      const body = m[1] || m[2];
      for (const pm of body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)) {
        const prop = pm[1];
        if (!map.has(prop)) map.set(prop, new Set());
        map.get(prop).add(file);
      }
    }
  }
  return map;
}

// DOM 共起 class/id map
//
// Batch A 第3失敗教訓 (2026-06-05): `#wwmAnalysisTabs.wwm-anlz-tabs` の
// background:none !important strip → 同 element の別 class `.wwm-analysis-tabs`
// base style 復活 (anlz tab 崩れ)。 class 名文字列比較では同 element 共起を
// 検出できない → index.html + JS template の class="..." / id= から共起 pair 構築
function buildCoOccurrence(jsSources) {
  const coMap = new Map(); // token ('.cls' | '#id') → Set<token>
  const sources = [fs.readFileSync('index.html', 'utf8'), ...jsSources.map(s => s.src)];
  const addPair = (a, b) => {
    if (a === b) return;
    if (!coMap.has(a)) coMap.set(a, new Set());
    coMap.get(a).add(b);
  };
  for (const src of sources) {
    // 1 tag 内の id + class 共起 (template literal 断片含む)
    for (const m of src.matchAll(/<\w+([^<>]{0,500}?)>/g)) {
      const attrs = m[1];
      const idM = attrs.match(/\bid="([\w-]+)"|\bid='([\w-]+)'/);
      const clsM = attrs.match(/\bclass="([^"]{1,300})"|\bclass='([^']{1,300})'/);
      const tokens = [];
      if (idM) tokens.push('#' + (idM[1] || idM[2]));
      if (clsM) {
        for (const c of (clsM[1] || clsM[2]).split(/\s+/)) {
          if (/^[\w-]+$/.test(c)) tokens.push('.' + c); // ${...} 動的断片は除外
        }
      }
      for (const a of tokens) for (const b of tokens) addPair(a, b);
    }
    // classList.add/toggle('x') — 後付け class: 同 statement 上の変数 element 不明 =
    // 拾える range で同 file 内 class= 共起に合流させるのは過剰 → 個別 pair のみ skip
  }
  return coMap;
}

// selector 内 class が JS file source に出現するか
function selectorClassesInJs(selector, jsSrcByFile, jsFiles) {
  const classes = selector.match(/\.[\w-]+/g) || [];
  if (classes.length === 0) return true; // element/attr のみ selector = 判定不能 → conservative に「出現扱い」
  for (const f of jsFiles) {
    const src = jsSrcByFile.get(f);
    for (const c of classes) {
      if (src.includes(c.slice(1))) return true;
    }
  }
  return false;
}

// ── main ──────────────────────────────────────────────────────────
const allDecls = [];
for (const f of CSS_FILES) {
  if (!fs.existsSync(f)) { console.warn(`[WARN] ${f} not found`); continue; }
  allDecls.push(...parseCss(fs.readFileSync(f, 'utf8'), f));
}

const jsSources = collectJsSources();
const jsSrcByFile = new Map(jsSources.map(s => [s.file, s.src]));
const inlineProps = buildInlinePropMap(jsSources);
const cssTextFiles = inlineProps.get('*') || new Set();

// index: compoundKey|propGroup → decls (multi-key = 1 decl が複数 key に登録)
const index = new Map();
for (const d of allDecls) {
  for (const k of d.keys) {
    const key = `${k}|${propGroup(d.prop)}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(d);
  }
}

const importants = allDecls.filter(d => d.important);
const A = [], K = [], C = [];

// inline prop も group 正規化して突合
const inlineGroupMap = new Map();
for (const [p, files] of inlineProps) {
  const g = p === '*' ? '*' : propGroup(p);
  if (!inlineGroupMap.has(g)) inlineGroupMap.set(g, new Set());
  for (const f of files) inlineGroupMap.get(g).add(f);
}

const coMap = buildCoOccurrence(jsSources);

for (const d of importants) {
  // どれかの key で他 decl が居れば競合 (same-element 可能性 = conservative)
  // 共起 class/id (同 element に同時付与され得る token) の key も検索対象
  const searchKeys = new Set(d.keys);
  for (const k of d.keys) {
    // k = '.foo' / '#bar' / '.foo::before' 等 — base token 部の共起を展開
    const m = k.match(/^([.#][\w-]+)(::.+)?$/);
    if (!m) continue;
    const pseudoEl = m[2] || '';
    for (const co of (coMap.get(m[1]) || [])) {
      searchKeys.add(co + pseudoEl);
    }
  }
  let hasCompetitor = false;
  for (const k of searchKeys) {
    const siblings = index.get(`${k}|${propGroup(d.prop)}`);
    if (siblings && siblings.some(s => s !== d)) { hasCompetitor = true; break; }
  }
  if (hasCompetitor) {
    C.push(d);
    continue;
  }
  // inline style 競合チェック (group 単位)
  const jsWithProp = new Set([
    ...(inlineGroupMap.get(propGroup(d.prop)) || []),
    ...cssTextFiles
  ]);
  if (jsWithProp.size > 0 && selectorClassesInJs(d.selector, jsSrcByFile, jsWithProp)) {
    K.push(d);
    continue;
  }
  A.push(d);
}

// summary
function byFile(list) {
  const m = {};
  for (const d of list) m[d.file] = (m[d.file] || 0) + 1;
  return m;
}

console.log(`total !important: ${importants.length}`);
console.log(`\nA (strip 安全候補 — 競合ゼロ + inline 形跡なし): ${A.length}`);
console.table(byFile(A));
console.log(`K (inline style 競合可能性 → keep): ${K.length}`);
console.table(byFile(K));
console.log(`C (同 compound+prop 競合あり → 保留): ${C.length}`);
console.table(byFile(C));

fs.writeFileSync('scripts/.important-v2.json', JSON.stringify({ A, K, C }, null, 2));
console.log('\n→ scripts/.important-v2.json');
