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
//   B — paired theme override / solo natural 勝者 → strip 可
//   G — Batch C: pairwise cascade order invariance fixpoint で strip 可と証明された旧 C
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
  'assets/styles-light.css',
  'assets/styles-obs.css'
];

const JS_GLOBS = ['assets', 'assets/sidebar', 'assets/helpers'];

// ── CSS parse (top-level + @media/@supports 1段 nest) ──────────────
function parseCss(src, file) {
  const decls = []; // {file, line, selector, finalCompound, prop, value, important, media, ruleId}
  let i = 0, line = 1, ruleSeq = 0;
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
      } else if (head.startsWith('@layer')) {
        parseBlockBody(media); // @layer block は透過 (file=layer 前提、 media 維持)
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
          decls.push({
            file, line: declLine, selector: s,
            keys: compoundKeys(s),
            prop, value: value.trim(), important, media: media || null,
            ruleId, ruleStart: selLine
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
    } else if (head.startsWith('@layer')) {
      parseBlockBody(null); // @layer wrap 透過 (file=layer 前提)
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
  if (/^border(-(top|bottom)-(left|right))?-radius/.test(p)) return 'border-radius'; // border shorthand は radius を reset しない (CSS 仕様)
  if (/^border/.test(p)) return 'border';
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

// prop pair が実際に競合するか (cascade 上 同じ longhand を触るか):
//   - 同一 prop
//   - 片方が group shorthand (margin が margin-top を set する 等)
// font-family vs font-size のような同 group 別 longhand は競合しない
// (group bucket は競合 candidate の索引、 実競合判定はこちら)
// 真の shorthand (member longhand を set する prop)。
// width/height は group 名と同名の longhand が居るが min/max-* を set しない → 除外
const REAL_SHORTHANDS = new Set([
  'margin', 'padding', 'flex', 'flex-flow', 'overflow', 'border', 'background',
  'font', 'gap', 'inset', 'animation', 'transition', 'text-decoration', 'grid-area',
  // 中間 shorthand (同 group 内で member を set する)
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

// 単独 strip 判定: d の !important を外しても、 d が適用される context で
// d が全競合に natural cascade (specificity → file order → line) で勝つなら strip 可
//
// conservative 条件:
//   - 競合に他 !important が居たら不可 (strip 後 d 確実に負け)
//   - 同値競合は無害 (winner 変わっても視覚同一)
//   - theme 排他 (light vs dark) は干渉なし扱い
function soloStrippable(d, groupDecls) {
  const ctxD = themeContext(d.selector);
  const sd = specificity(d.selector);
  const fd = FILE_ORDER.get(d.file) ?? 99;
  for (const g of groupDecls) {
    if (g === d) continue;
    if (!propsConflict(g.prop, d.prop)) continue;                      // 別 longhand = 無競合
    const ctxG = themeContext(g.selector);
    if (ctxD !== 'both' && ctxG !== 'both' && ctxG !== ctxD) continue; // theme 排他
    if (exclusiveDisjoint(d.selector, g.selector)) continue;           // class 排他 group
    if (g.prop === d.prop && g.value === d.value) continue;            // 同値 = 無害
    if (g.important) return false;  // 他 important → strip 後 d 負け得る
    const sg = specificity(g.selector);
    if (sg > sd) return false;
    if (sg === sd) {
      const fg = FILE_ORDER.get(g.file) ?? 99;
      if (fg > fd) return false;
      if (fg === fd && g.line > d.line) return false;
    }
  }
  return true;
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
  const sources = files.map(f => ({ file: f, src: fs.readFileSync(f, 'utf8') }));
  // Batch A 第4失敗教訓 (2026-06-05): index.html 直書き inline style="color:..."
  // (#dmgPhysVal 等) を見ておらず !important strip → light theme 色 regression。
  // index.html も inline style 検出対象に含める
  sources.push({ file: 'index.html', src: fs.readFileSync('index.html', 'utf8') });
  return sources;
}

const camelToKebab = (s) => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

// template literal 式 ${...} を空白化 (式中の > < が tag regex を破壊するのを防ぐ)。
// 3回 loop で 1段 nest まで吸収
function sanitizeTpl(src) {
  let s = src;
  for (let i = 0; i < 3; i++) s = s.replace(/\$\{[^{}]*\}/g, ' ');
  return s;
}

// selector の subject (右端 compound) の class/id token のみ抽出
function subjectTokens(sel) {
  const safe = sel.replace(/\[[^\]]*\]/g, '[]');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || safe;
  return last.match(/\.[\w-]+|#[\w-]+/g) || [];
}

// ── inline style 調査 v3: element 粒度 ──────────────────────────────
//
// v2 までは file 粒度 (「file が当該 prop を inline 書込」+「file 内に selector の
// class 文字列出現」で競合扱い) → .donut 等で大量偽陽性 (file 内の無関係 element への
// inline width で .donut の width !important が C 送りされる)。
//
// v3 は style 書込先 element の class/id token を特定して selector subject と突合:
//   1. template/HTML の <tag ... style="..."> → 同 tag の class=/id= token (精密)
//      - class/id token ゼロの tag → file wildcard (旧動作 fallback)
//      - class="a ${x}" 動的断片は静的 token のみ採用 (VRT + 目視が backstop)
//   2. receiver.style.prop = / .style.cssText = → receiver 変数を file 内 def 逆引きで解決
//      - NAME = ...getElementById('X') / querySelector('SEL') / closest('SEL') /
//        querySelectorAll('SEL').forEach(NAME ...) を探す
//      - 解決不能 → file wildcard (conservative)
//   3. setProperty('--xxx') = CSS 変数 → 対象外。 documentElement/document 直書きも skip
//
// 出力:
//   elemInline:   propGroup → Set<token>  (token = '.cls' | '#id'、 group '*' = 全 prop)
//   fileWildcard: propGroup → Set<file>   (group '*' = 全 prop)
function buildInlineIndex(jsSources) {
  const elemInline = new Map();
  const elemInlineExact = new Map(); // exact prop → Set<token> (background-image 等の精密判定用)
  const fileWildcard = new Map();
  const addElem = (g, tokens, exactProp) => {
    if (process.env.DBG_UNIV && tokens.includes('__universal__')) {
      console.error('[UNIV]', 'group=' + g, 'exact=' + (exactProp || '?'), 'file=' + (addElem._file || '?'));
    }
    if (!elemInline.has(g)) elemInline.set(g, new Set());
    for (const t of tokens) elemInline.get(g).add(t);
    if (exactProp) {
      if (!elemInlineExact.has(exactProp)) elemInlineExact.set(exactProp, new Set());
      for (const t of tokens) elemInlineExact.get(exactProp).add(t);
    }
  };
  const addWild = (g, file) => {
    if (!fileWildcard.has(g)) fileWildcard.set(g, new Set());
    fileWildcard.get(g).add(file);
  };

  // attr-only selector ('[data-ratio-el]' 等) → template 内で同 attr を持つ tag の
  // class/id token (無ければ '%tag') へ解決。 template に見つからない → null (universal 行き)
  const attrCache = new Map();
  function attrTokens(attrName) {
    if (attrCache.has(attrName)) return attrCache.get(attrName);
    const out = new Set();
    for (const { src } of jsSources) {
      for (const m of sanitizeTpl(src).matchAll(new RegExp(`<(\\w+)([^<>]{0,500}?)\\b${attrName}[=\\s>]`, 'g'))) {
        const tag = m[1].toLowerCase(), attrs = m[2];
        const idM = attrs.match(/\bid="([\w-]+)"|\bid='([\w-]+)'/);
        const clsM = attrs.match(/\bclass="([^"]{1,300})"|\bclass='([^']{1,300})'/);
        let any = false;
        if (idM) { out.add('#' + (idM[1] || idM[2])); any = true; }
        if (clsM) for (const c of (clsM[1] || clsM[2]).split(/\s+/)) {
          if (/^[\w-]+$/.test(c)) { out.add('.' + c); any = true; }
        }
        if (!any) out.add('%' + tag);
      }
    }
    const res = out.size ? [...out] : null;
    attrCache.set(attrName, res);
    return res;
  }

  // selector 文字列 (comma list 可) → subject token 群。
  // class/id 無し部分は element 名 token '%tag' (同 element 名 subject の selector とのみ競合)、
  // 真の '*' のみ '__universal__'
  function selectorArgTokens(selArg) {
    const out = [];
    for (const part of selArg.split(',')) {
      const p = part.trim();
      const t = subjectTokens(p);
      if (t.length) { out.push(...t); continue; }
      const safe = p.replace(/\[[^\]]*\]/g, '[]');
      const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
      const last = (parts[parts.length - 1] || safe).replace(/::?[\w-]+(\([^)]*\))?/g, '');
      const em = last.match(/^[a-zA-Z][\w-]*/);
      if (em) { out.push('%' + em[0].toLowerCase()); continue; }
      // attr-only subject ('[data-x]' 等) → template から逆引き
      const rawLast = p.split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() || p;
      const attrM = rawLast.match(/\[([\w-]+)/);
      const at = attrM ? attrTokens(attrM[1]) : null;
      out.push(...(at || ['__universal__']));
    }
    return out;
  }

  // receiver 変数 → element token 解決 (v3.1)
  //   - usage 位置から「最近接 preceding def」 のみ採用 (el 等の汎用名の file 内衝突対策)
  //   - arrow `=>` を代入と誤認しない
  //   - createElement + className/id 代入 pattern 対応
  function resolveReceiver(name, src, usageIdx) {
    if (name === 'document' || name === 'documentElement' || name === 'window') return ['__skip__'];
    const defs = []; // {idx, tokens|null}
    const reDef = new RegExp(`(?:^|[^\\w$.])${name}\\s*=\\s*(?!>)([^;\\n]{1,200})`, 'g');
    for (const m of src.matchAll(reDef)) {
      const rhs = m[1];
      if (new RegExp(`^${name}\\s*[.+]`).test(rhs)) continue; // 自己代入は def でない
      let t;
      if ((t = rhs.match(/getElementById\(\s*['"]([\w-]+)['"]/))) defs.push({ idx: m.index, tokens: ['#' + t[1]] });
      else if ((t = rhs.match(/(?:querySelector(?:All)?|closest)\(\s*['"]([^'"]+)['"]/))) defs.push({ idx: m.index, tokens: selectorArgTokens(t[1]) });
      else if ((t = rhs.match(/^([\w$]+)\.cloneNode\(/))) {
        // clone = X.cloneNode(...) → X の token を継承 (subtree 全体は X subject で代表)
        const inner = resolveReceiver(t[1], src, m.index);
        defs.push({ idx: m.index, tokens: inner === null ? null : inner });
      }
      else if ((t = rhs.match(/document\.createElement\(\s*['"](\w+)['"]/))) {
        // createElement → 直後の NAME.className/id/classList.add から token 収集。
        // class/id 付与なし → 無名 element = '%tag' (bookmarklet 文字列内 toast 等)
        const after = src.slice(m.index, m.index + 600);
        const tk = [];
        let am;
        if ((am = after.match(new RegExp(`${name}\\.id\\s*=\\s*['"]([\\w-]+)['"]`)))) tk.push('#' + am[1]);
        if ((am = after.match(new RegExp(`${name}\\.className\\s*=\\s*['"]([^'"]+)['"]`)))) {
          for (const c of am[1].split(/\s+/)) if (/^[\w-]+$/.test(c)) tk.push('.' + c);
        }
        for (const cm of after.matchAll(new RegExp(`${name}\\.classList\\.add\\(([^)]{1,100})\\)`, 'g'))) {
          for (const lit of cm[1].matchAll(/['"]([\w-]+)['"]/g)) tk.push('.' + lit[1]);
        }
        defs.push({ idx: m.index, tokens: tk.length ? tk : ['%' + t[1].toLowerCase()] });
      }
      else defs.push({ idx: m.index, tokens: null }); // 解決不能 def
    }
    // forEach / for-of の loop 変数 (複数 site 可 → 全部 def 扱い)
    const reEach = new RegExp(`querySelectorAll\\(\\s*['"]([^'"]+)['"]\\s*\\)[\\s\\S]{0,60}?(?:forEach\\(\\s*\\(?|of\\s+)\\s*${name}\\b`, 'g');
    for (const m of src.matchAll(reEach)) defs.push({ idx: m.index, tokens: selectorArgTokens(m[1]) });
    const reFor = new RegExp(`(?:const|let|var)\\s+${name}\\s+of\\s+[\\s\\S]{0,80}?querySelectorAll\\(\\s*['"]([^'"]+)['"]`, 'g');
    for (const m of src.matchAll(reFor)) defs.push({ idx: m.index, tokens: selectorArgTokens(m[1]) });

    if (defs.length === 0) return null;
    // 最近接 preceding def。 preceding が無ければ最近接 following (hoist/順序逆転ケア)
    defs.sort((a, b) => a.idx - b.idx);
    let best = null;
    for (const d of defs) { if (d.idx <= usageIdx) best = d; else break; }
    if (!best) best = defs[0];
    if (best.tokens === null) return null;
    return best.tokens.filter(t => t !== '__skip__');
  }

  for (const { file, src } of jsSources) {
    addElem._file = file; // debug 用
    // 1. template/HTML <tag ... style="..."> — tag 単位で token と prop を対応付け
    // (sanitizeTpl: ${...} 内の > が tag 境界を誤検出させるのを防止)
    for (const m of sanitizeTpl(src).matchAll(/<(\w+)([^<>]{0,500}?)>/g)) {
      const tagName = m[1].toLowerCase();
      const attrs = m[2];
      const styleM = attrs.match(/style="([^"]{1,400})"|style='([^']{1,400})'/);
      if (!styleM) continue;
      const body = styleM[1] || styleM[2];
      const idM = attrs.match(/\bid="([\w-]+)"|\bid='([\w-]+)'/);
      const clsM = attrs.match(/\bclass="([^"]{1,300})"|\bclass='([^']{1,300})'/);
      const tokens = [];
      if (idM) tokens.push('#' + (idM[1] || idM[2]));
      if (clsM) for (const c of (clsM[1] || clsM[2]).split(/\s+/)) {
        if (/^[\w-]+$/.test(c)) tokens.push('.' + c);
      }
      const props = [...body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map(p => p[1]);
      if (tokens.length === 0) {
        // 無名 tag (class/id なし) — class/id selector はこの element に当たらない。
        // element 名 token '%tag' で登録 (同 element 名 subject の selector とのみ競合)
        if (props.length === 0) addElem('*', ['%' + tagName]);
        for (const p of props) addElem(propGroup(p), ['%' + tagName], p);
      } else {
        if (props.length === 0) addElem('*', tokens); // style="${...}" 全動的
        for (const p of props) addElem(propGroup(p), tokens, p);
      }
    }
    // 2. receiver.style.prop = / cssText / setProperty
    for (const m of src.matchAll(/((?:document\.)?[\w$]+)\.style\.([a-zA-Z]+)\s*=|((?:document\.)?[\w$]+)\.style\.setProperty\(\s*['"]([^'"]+)['"]/g)) {
      const rawName = m[1] || m[3];
      let prop = m[2] ? camelToKebab(m[2]) : m[4];
      if (prop && prop.startsWith('--')) continue; // CSS 変数 → 対象外
      // document.body / document.documentElement 直書き → element 名 token
      let tokens;
      let name = rawName;
      if (rawName === 'document.body') tokens = ['%body'];
      else if (rawName === 'document.documentElement') tokens = ['%html'];
      else {
        name = rawName.replace(/^document\./, '');
        tokens = resolveReceiver(name, src, m.index);
      }
      if (m[2] === 'cssText') {
        // 代入 literal 内のみから prop 抽出 (object literal 等の誤 capture 防止)。
        // 動的 concat / 非 literal → prop 不明 = 全 prop 扱い
        const after = src.slice(m.index, m.index + 600);
        const litM = after.match(/cssText\s*=\s*(['"`])([\s\S]{0,500}?)\1/);
        const props = litM
          ? [...litM[2].matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map(p => p[1]).filter(p => !p.startsWith('--'))
          : [];
        if (tokens === null) {
          if (props.length === 0) addWild('*', file);
          for (const p of props) addWild(propGroup(p), file);
        } else if (tokens.length) {
          if (props.length === 0) addElem('*', tokens);
          for (const p of props) addElem(propGroup(p), tokens, p);
        }
        continue;
      }
      if (!prop) continue;
      if (tokens === null) addWild(propGroup(prop), file);
      else if (tokens.length) addElem(propGroup(prop), tokens, prop);
    }
  }
  return { elemInline, elemInlineExact, fileWildcard };
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
    // 1 tag 内の id + class 共起 (template literal 断片含む、 ${...} は空白 sanitize)
    for (const m of src.replace(/\$\{[^{}]*\}/g, ' ').replace(/\$\{[^{}]*\}/g, ' ').matchAll(/<\w+([^<>]{0,500}?)>/g)) {
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

// specificity (a=id, b=class/attr/pseudo-class, c=element/pseudo-element)
function specificity(sel) {
  let safe = sel.replace(/\[[^\]]*\]/g, '[ATTR]');
  // :nth-child(odd) 等の引数を空に — 中身 ('odd' 等) が element 誤カウントされる bug 対策
  // (:not/:is/:has は中身が spec に寄与するため対象外 — conservative)
  safe = safe.replace(/:(nth-[\w-]+|lang|dir)\(([^)]*)\)/g, ':$1()');
  let a = 0, b = 0, c = 0;
  for (const m of safe.matchAll(/#[\w-]+/g)) a++;
  for (const m of safe.matchAll(/\.[\w-]+|\[ATTR\]|:(?!:)[\w-]+(\([^)]*\))?/g)) {
    if (/^:(not|is|where|has)/.test(m[0])) continue; // 中身は別途 (簡易: where=0, not/is は中身 — conservative に +1)
    b++;
  }
  for (const m of safe.matchAll(/(^|[\s>+~(])([a-zA-Z][\w-]*)/g)) c++;
  for (const m of safe.matchAll(/::[\w-]+/g)) c++;
  return a * 10000 + b * 100 + c;
}

// theme context: selector が特定 theme 限定か
function themeContext(sel) {
  if (/\[data-theme="?light"?\]/.test(sel)) return 'light';
  if (/\[data-theme="?dark"?\]/.test(sel)) return 'dark';
  return 'both';
}

// ── Batch C (G category) 用: context 重複判定 ──────────────────────
// media query → viewport width 区間群 ([lo, hi] の union)
// width 以外の feature / not 含み → null (= 判定不能 → conservative に overlap 扱い)
function widthIntervals(media) {
  if (!media) return [[0, Infinity]];
  if (/\bnot\b/i.test(media)) return null;
  const body = media.replace(/^@(media|supports)/i, '').trim();
  if (/^@supports/i.test(media)) return null; // supports は width と無関係 → 判定不能
  const ivs = [];
  for (const part of body.split(/\s*,\s*/)) {
    let lo = 0, hi = Infinity;
    const feats = part.match(/\([^)]*\)/g) || [];
    for (const f of feats) {
      let m;
      if ((m = f.match(/^\(\s*max-width\s*:\s*([\d.]+)px\s*\)$/i))) hi = Math.min(hi, parseFloat(m[1]));
      else if ((m = f.match(/^\(\s*min-width\s*:\s*([\d.]+)px\s*\)$/i))) lo = Math.max(lo, parseFloat(m[1]));
      else return null; // width 以外 (hover/orientation/prefers-* 等) → 判定不能
    }
    if (lo <= hi) ivs.push([lo, hi]);
  }
  return ivs.length ? ivs : null;
}

function mediaOverlap(ma, mb) {
  const A = widthIntervals(ma), B = widthIntervals(mb);
  if (!A || !B) return true; // 判定不能 = conservative overlap
  for (const [al, ah] of A) for (const [bl, bh] of B) {
    if (al <= bh && bl <= ah) return true;
  }
  return false;
}

function themeOverlap(p, q) {
  const tp = themeContext(p.selector), tq = themeContext(q.selector);
  return !(tp !== 'both' && tq !== 'both' && tp !== tq);
}

// ── 相互排他 class group (JS 付与ロジックで排他が証明済のもののみ登録) ──
// rank-*: gear.js:359/424 単一 ternary + :680-681 remove全→add1 = 同時付与不可能。
// 同 subject に異 member を要求する selector pair = context 非重複 (phantom pair 排除)
const EXCLUSIVE_CLASS_GROUPS = [
  ['rank-max', 'rank-gold', 'rank-purple', 'rank-blue'],
  // icon-btn variant: index.html:408-423 静的、 各 button に variant class は高々1つ
  ['reset-btn', 'note-btn', 'export-btn', 'import-btn', 'share-btn', 'icon-btn-x'],
  // 無関係 widget の同名 state class (.active 等) 同居防止: 別 widget = 同 element 非共存
  ['wwm-analysis-tab', 'lang-btn', 'wwm-opt-sort-btn', 'preset-btn', 'wwm-setup-tab', 'wwm-note-tab'],
  // tier badge host: hero badge / sidebar badge / baseline badge は別 element (index.html 静的)
  ['hero-tier', 'wwm-sb-tier-badge', 'tier-badge-baseline'],
  // tier rank: hero.js:96/106 className 単一代入 (全置換) = 同時付与不可能
  ['tier-SS', 'tier-S', 'tier-A', 'tier-B', 'tier-C'],
  // modal 種別: 1 modal element に 1 種別 class (wwm-modal-square 等の共通 class は入れるな)
  ['wwm-cmp-modal-a', 'wwm-diag-modal', 'wwm-lang-picker'],
];
function subjectClassSet(sel) {
  const safe = sel.replace(/\[[^\]]*\]/g, '[]');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || safe;
  return new Set((last.match(/\.[\w-]+/g) || []).map(c => c.slice(1)));
}
// ── 相互排他 container group (DOM 静的構造で排他が証明済のもののみ登録) ──
// [setA, setB]: selA が setA の class を、selB が setB の class を compound に要求 → 別 element 確定。
// topbar (index.html:401-425) と mobile drawer (:430-454) は兄弟 subtree = 同 element が両方に属せない
const EXCLUSIVE_ANCESTOR_GROUPS = [
  [['top-controls-2row', 'topbar-row', 'lang-switcher-row'],
   ['wwm-mobile-drawer', 'wwm-mobile-drawer-langs', 'wwm-mobile-drawer-body']],
  // 別 widget subtree (同名 tag 子要素 svg/b/input/h2 の phantom pair 防止、 DOM 静的検証済)
  [['luopan-inner', 'luopan', 'hero-wuxia'], ['wwm-good-icon', 'wwm-note-btn', 'wwm-note-list']],
  [['wwm-equip-section'], ['wwm-note-list', 'wwm-note-tab']],
  [['wwm-overlay-ctrl'], ['wwm-arsenal-custom', 'wwm-arsenal-modal', 'wwm-mobile-anlz-overlay-body']],
  [['wwm-opt-ratio-label'], ['wwm-arsenal-custom', 'wwm-arsenal-modal']],
  // OBS view では mobile stat overlay 全 hidden (responsive.css OBS block) = 同時成立不可
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

// selector 正規化: theme prefix 除去 + 空白圧縮 (pair 判定用)
function stripThemePrefix(sel) {
  return sel
    .replace(/^html\[data-theme="?(light|dark)"?\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── main ──────────────────────────────────────────────────────────
const allDecls = [];
for (const f of CSS_FILES) {
  if (!fs.existsSync(f)) { console.warn(`[WARN] ${f} not found`); continue; }
  allDecls.push(...parseCss(fs.readFileSync(f, 'utf8'), f));
}

const jsSources = collectJsSources();
const jsSrcByFile = new Map(jsSources.map(s => [s.file, s.src]));
const { elemInline, elemInlineExact, fileWildcard } = buildInlineIndex(jsSources);

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
const A = [], B = [], K = [], C = [];

const FILE_ORDER = new Map(CSS_FILES.map((f, i) => [f, i]));

// Batch B: paired theme override 判定
// 競合が 「同 selector の theme variant のみ」 で、 全 variant !important を
// 同時 strip しても各 theme context の winner value が不変なら strip 可
function pairedThemeStrippable(d, groupDecls) {
  // 自分と同じ base selector (theme prefix 除去後) + 同 prop の decl 群
  const base = stripThemePrefix(d.selector);
  const peers = groupDecls.filter(g =>
    g.prop === d.prop && stripThemePrefix(g.selector) === base
  );
  // 競合が peers で閉じてない (別 selector の競合あり) → 対象外
  if (peers.length !== groupDecls.length) return false;
  // media 付き混在は第1弾 skip (context 爆発回避)
  if (peers.some(p => p.media)) return false;
  // 全 important でないと 「一括 strip で natural cascade 化」 が成立しない
  if (!peers.every(p => p.important)) return false;

  const winner = (applicable, useImportant) => {
    if (applicable.length === 0) return null;
    return applicable.reduce((w, p) => {
      if (!w) return p;
      if (useImportant && p.important !== w.important) return p.important ? p : w;
      const sp = specificity(p.selector), sw = specificity(w.selector);
      if (sp !== sw) return sp > sw ? p : w;
      const fp = FILE_ORDER.get(p.file) ?? 99, fw = FILE_ORDER.get(w.file) ?? 99;
      if (fp !== fw) return fp > fw ? p : w;   // 後 file 勝ち
      return p.line >= w.line ? p : w;          // 後 line 勝ち
    }, null);
  };

  for (const ctx of ['light', 'dark']) {
    const applicable = peers.filter(p => {
      const t = themeContext(p.selector);
      return t === 'both' || t === ctx;
    });
    const before = winner(applicable, true);
    const after = winner(applicable, false);
    // winner の value が変わる → 視覚変化リスク → 不可
    if ((before?.value || null) !== (after?.value || null)) return false;
  }
  return true;
}

const coMap = buildCoOccurrence(jsSources);

// inline 競合判定 v3 (element 粒度):
//   selector subject の class/id token (+ 同 element 共起 class) が
//   inline 書込先 element token と交差 → 競合。
//   subject に class/id が無い selector は判定不能 → 当該 group の inline 書込が
//   存在するだけで conservative 競合。 wildcard file 分は旧 file 粒度 check fallback。
// selector subject の element 名 ('div' 等)。 明示 element が無ければ null
function subjectElementName(sel) {
  const safe = sel.replace(/\[[^\]]*\]/g, '[]');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = (parts[parts.length - 1] || safe).replace(/::?[\w-]+(\([^)]*\))?/g, '');
  const em = last.match(/^[a-zA-Z][\w-]*/);
  return em ? em[0].toLowerCase() : null;
}

// background group 精密化: token への background 系 inline 書込が background-image のみ
// (export clone の backgroundImage='none' 等) で、 CSS 側 decl が image 成分を持たない
// (background-color / image なし shorthand) なら無害。
//   - shorthand `background: red` は image を implicit none に reset = inline 'none' と同値
function bgImageOnlySafe(token, d, g) {
  if (g !== 'background') return false;
  const dImg = d.prop === 'background-image' ||
    (d.prop === 'background' && /url\(|gradient\(/i.test(d.value));
  if (dImg) return false;
  let sawAny = false;
  for (const [e, set] of elemInlineExact) {
    if (propGroup(e) !== 'background' || !set.has(token)) continue;
    sawAny = true;
    if (e !== 'background-image') return false; // image 以外の background 書込あり → 競合
  }
  return sawAny; // background-image のみ → safe
}

function inlineConflictV3(d) {
  const g = propGroup(d.prop);
  const inlineTokens = new Set([...(elemInline.get(g) || []), ...(elemInline.get('*') || [])]);
  // '__universal__' = querySelectorAll('*') への inline 書込 → 全 selector と競合
  if (inlineTokens.has('__universal__') && !bgImageOnlySafe('__universal__', d, g)) return `universal(${g})`;
  // subject の明示 element 名 vs '%tag' token (class 有無に関わらず常時 check)
  const elName = subjectElementName(d.selector);
  if (elName && inlineTokens.has('%' + elName) && !bgImageOnlySafe('%' + elName, d, g)) return `elem(%${elName}|${g})`;
  const subj = subjectTokens(d.selector);
  if (subj.length === 0) {
    if (!elName && inlineTokens.size > 0) return `no-subject(${g})`; // '*' / [attr] のみ subject
  } else {
    const cand = new Set(subj);
    for (const t of subj) for (const co of (coMap.get(t) || [])) cand.add(co);
    for (const t of cand) if (inlineTokens.has(t) && !bgImageOnlySafe(t, d, g)) return `token(${t}|${g})`;
  }
  const wfiles = new Set([...(fileWildcard.get(g) || []), ...(fileWildcard.get('*') || [])]);
  if (wfiles.size > 0 && selectorClassesInJs(d.selector, jsSrcByFile, wfiles)) return `wildcard(${[...wfiles].join(',')}|${g})`;
  return false;
}

const catMap = new Map();    // decl → 'A'|'B'|'K'|'C'
const compMap = new Map();   // decl → competitors (decl[])
const inlineMap = new Map(); // decl → inlineConflict bool

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
  const groupSet = new Set([d]);
  for (const k of searchKeys) {
    const siblings = index.get(`${k}|${propGroup(d.prop)}`);
    if (siblings) {
      for (const s of siblings) {
        if (s === d) continue;
        if (!propsConflict(s.prop, d.prop)) continue; // 別 longhand = 競合でない
        hasCompetitor = true;
        groupSet.add(s);
      }
    }
  }
  // inline style 競合チェック (v3: element 粒度) — A/B 共通で strip 不可条件
  const inlineConflict = inlineConflictV3(d);

  compMap.set(d, [...groupSet].filter(x => x !== d));
  inlineMap.set(d, inlineConflict);
  // JSON 出力にも inline 競合 flag を残す — 手組み strip plan は K だけでなく
  // 「inline: true の C」 も除外必須 (2026-06-05 sidebar height strip 事故の教訓)
  d.inline = !!inlineConflict;

  if (hasCompetitor) {
    if (!inlineConflict &&
        (pairedThemeStrippable(d, [...groupSet]) || soloStrippable(d, [...groupSet]))) {
      B.push(d); catMap.set(d, 'B');
    } else {
      C.push(d); catMap.set(d, 'C');
    }
    continue;
  }
  if (inlineConflict) {
    K.push(d); catMap.set(d, 'K');
    continue;
  }
  A.push(d); catMap.set(d, 'A');
}

// ── Batch C: G category (pairwise cascade order invariance fixpoint) ──
//
// 原理: strip は physical decl (file|line|prop) 単位。 strip set S の各 C-split p と
// bucket 共有競合 q の全 pair で勝敗順位が strip 前後で不変なら、 全 element の
// cascade 結果が不変 = 視覚同一。
//   - context 非重複 (theme 排他 / media width 区間非交差) → pair 無視
//   - 同 prop + 同 value → 無害 (winner 変わっても視覚同一)
//   - q non-important: 前 = p (important) 必勝 → 後も natural で p 勝ち必要
//   - q important で S 外 (= keep 残留): 後 = q 必勝 → 前も natural で q 勝ちだった必要
//   - q important で S 内 (= 同時 strip): natural 比較不変 → 常に OK
// 違反 p の physical decl を S から除外 → fixpoint まで反復 (除外が新た​な flip を生むため)
function naturalWins(p, q) {
  const sp = specificity(p.selector), sq = specificity(q.selector);
  if (sp !== sq) return sp > sq;
  const fp = FILE_ORDER.get(p.file) ?? 99, fq = FILE_ORDER.get(q.file) ?? 99;
  if (fp !== fq) return fp > fq;
  return p.line > q.line;
}

const physKeyOf = (d) => `${d.file}|${d.line}|${d.prop}`;
const physMap = new Map(); // physKey → splits (importants のみ)
for (const d of importants) {
  const k = physKeyOf(d);
  if (!physMap.has(k)) physMap.set(k, []);
  physMap.get(k).push(d);
}

// 初期 S: 全 split が strip 可能候補 (A / B / inline 競合なし C) の physical decl
const physS = new Set();
for (const [k, splits] of physMap) {
  const ok = splits.every(s => {
    const c = catMap.get(s);
    return c === 'A' || c === 'B' || (c === 'C' && !inlineMap.get(s));
  });
  if (ok) physS.add(k);
}

let changed = true;
while (changed) {
  changed = false;
  for (const k of [...physS]) {
    const cSplits = physMap.get(k).filter(s => catMap.get(s) === 'C');
    let ok = true;
    for (const p of cSplits) {
      for (const q of compMap.get(p)) {
        if (q.file === p.file && q.line === p.line && q.prop === p.prop) continue; // 自分の別 split
        if (!propsConflict(q.prop, p.prop)) continue;                              // 別 longhand = 無競合
        if (!themeOverlap(p, q) || !mediaOverlap(p.media, q.media)) continue;
        if (exclusiveDisjoint(p.selector, q.selector)) continue;                   // class 排他 group
        if (q.prop === p.prop && q.value === p.value) continue;
        const pWins = naturalWins(p, q);
        if (!q.important) {
          if (!pWins) { ok = false; break; }       // strip 後 p 負け = flip
        } else if (!physS.has(physKeyOf(q))) {
          if (pWins) { ok = false; break; }        // 前 p 勝ち → 後 q (keep important) 勝ち = flip
        }
      }
      if (!ok) break;
    }
    if (!ok) { physS.delete(k); changed = true; }
  }
}

// G = physS に属する C split。 C から除外 (apply の blocked 判定整合)
const G = [];
const C2 = [];
for (const d of C) {
  if (physS.has(physKeyOf(d))) G.push(d);
  else C2.push(d);
}
C.length = 0;
C.push(...C2);

// summary
function byFile(list) {
  const m = {};
  for (const d of list) m[d.file] = (m[d.file] || 0) + 1;
  return m;
}

console.log(`total !important: ${importants.length}`);
console.log(`\nA (strip 安全候補 — 競合ゼロ + inline 形跡なし): ${A.length}`);
console.table(byFile(A));
console.log(`B (paired theme override — 一括 strip で winner 不変): ${B.length}`);
console.table(byFile(B));
console.log(`G (pairwise order invariance — fixpoint 証明済 strip 可): ${G.length}`);
console.table(byFile(G));
console.log(`K (inline style 競合可能性 → keep): ${K.length}`);
console.table(byFile(K));
console.log(`C (同 compound+prop 競合あり → 保留): ${C.length}`);
console.table(byFile(C));

fs.writeFileSync('scripts/.important-v2.json', JSON.stringify({ A, B, G, K, C }, null, 2));
console.log('\n→ scripts/.important-v2.json');

// ── --simulate plan.json: 構造変更の仮想検証 ─────────────────────────
// plan = [{op:'resel', file, headerFrom, headerTo, lineMin?, lineMax?},
//         {op:'strip', file, line, prop},
//         {op:'move', file, anchorLine, afterLine}]
// resel: headerFrom (comma 区切り selector 群) に一致する decl の selector を headerTo へ。
//        subject (右端 compound) 不変が前提 (bucket 安定のため assert)
// strip: 指定 decl の !important を外す
// move:  anchorLine の decl が属する rule を 同 file 内 afterLine 直後へ移動
//        (simulate は line を fractional 化して相対順序のみ変更、 apply は実テキスト移動)
// 全 bucket の全 pair で head-to-head 勝者が orig と mod で flip しないか検査 (値同一 pair は無視)
const simArg = process.argv.find(a => a.startsWith('--simulate='));
if (simArg) {
  const plan = JSON.parse(fs.readFileSync(simArg.slice(11), 'utf8'));
  // mod decls 構築 (orig と 1:1、 selector/important/line のみ差替え)
  const mods = allDecls.map(d => ({ ...d, origRef: d }));
  let reselCount = 0, stripCount = 0, moveCount = 0;
  for (const op of plan) {
    if (op.op === 'resel') {
      const fromSet = new Set(op.headerFrom.split(',').map(s => s.replace(/\s+/g, ' ').trim()));
      // anchorLine 指定時: その行の decl が属する rule の decl のみ対象 (rule 単位 scope)
      let targetRuleIds = null;
      if (op.anchorLine) {
        targetRuleIds = new Set(mods.filter(m => m.file === op.file && m.line === op.anchorLine).map(m => m.ruleId));
        if (targetRuleIds.size === 0) console.warn(`[WARN] anchorLine ${op.file}:${op.anchorLine} に decl 不在`);
      }
      for (const m of mods) {
        if (m.file !== op.file) continue;
        if (targetRuleIds && !targetRuleIds.has(m.ruleId)) continue;
        if (op.lineMin && m.line < op.lineMin) continue;
        if (op.lineMax && m.line > op.lineMax) continue;
        if (!fromSet.has(m.selector.replace(/\s+/g, ' ').trim())) continue;
        const newKeys = compoundKeys(op.headerTo);
        const subjOld = JSON.stringify([...m.keys].sort());
        m.selector = op.headerTo;
        m.keys = newKeys;
        if (JSON.stringify([...newKeys].sort()) !== subjOld) {
          console.warn(`[WARN] resel で subject keys 変化: ${op.file}:${m.line} ${op.headerTo} (bucket 移動 — 検証は新 bucket で実施)`);
        }
        reselCount++;
      }
    } else if (op.op === 'strip') {
      for (const m of mods) {
        if (m.file === op.file && m.line === op.line && m.prop === op.prop && m.important) {
          m.important = false;
          stripCount++;
        }
      }
    } else if (op.op === 'move') {
      const ruleIds = new Set(mods.filter(m => m.file === op.file && m.line === op.anchorLine).map(m => m.ruleId));
      if (ruleIds.size === 0) { console.warn(`[WARN] move: anchorLine ${op.file}:${op.anchorLine} に decl 不在`); continue; }
      const members = mods.filter(m => m.file === op.file && ruleIds.has(m.ruleId));
      const minLine = Math.min(...members.map(m => m.ruleStart));
      const maxLine = Math.max(...members.map(m => m.line));
      if (op.afterLine >= minLine && op.afterLine <= maxLine) {
        console.warn(`[WARN] move: afterLine ${op.afterLine} が rule 自身 (${minLine}-${maxLine}) の内側 — skip`);
        continue;
      }
      for (const m of members) {
        m.line = op.afterLine + 0.5 + (m.line - minLine) * 1e-6; // 相対順序維持の fractional 化
      }
      moveCount += members.length;
    }
  }
  console.log(`simulate: resel ${reselCount} decl / strip ${stripCount} decl / move ${moveCount} decl`);

  // orig / mod 両 index 構築 → 全 pair flip check
  const hh = (x, y, useSel, useImp) => {
    // x が y に勝つか (cascade: important > specificity > file順 > line)
    if (useImp && x.important !== y.important) return x.important;
    const sx = specificity(useSel ? x.selector : x.origRef ? x.origRef.selector : x.selector);
    const sy = specificity(useSel ? y.selector : y.origRef ? y.origRef.selector : y.selector);
    if (sx !== sy) return sx > sy;
    const fx = FILE_ORDER.get(x.file) ?? 99, fy = FILE_ORDER.get(y.file) ?? 99;
    if (fx !== fy) return fx > fy;
    return x.line > y.line;
  };
  // bucket 登録は coMap (DOM 共起 class/id) 展開込み —
  // 単一 class 同士 (.bg-icon-arsenal vs .bg-icon-gear 等) の same-element 戦争を
  // classification (searchKeys) と同基準で pair 化する (素 keys だけだと見落とす)
  const modIndex = new Map();
  for (const m of mods) {
    const expKeys = new Set(m.keys);
    for (const k of m.keys) {
      const km = k.match(/^([.#][\w-]+)(::.+)?$/);
      if (!km) continue;
      const pseudoEl = km[2] || '';
      for (const co of (coMap.get(km[1]) || [])) expKeys.add(co + pseudoEl);
    }
    for (const k of expKeys) {
      const key = `${k}|${propGroup(m.prop)}`;
      if (!modIndex.has(key)) modIndex.set(key, []);
      modIndex.get(key).push(m);
    }
  }
  const flips = [];
  const seen = new Set();
  for (const [key, group] of modIndex) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const x = group[i], y = group[j];
        if (x.origRef === y.origRef) continue;
        const pairId = [`${x.file}:${x.line}:${x.prop}:${x.origRef.selector}`, `${y.file}:${y.line}:${y.prop}:${y.origRef.selector}`].sort().join('||');
        if (seen.has(pairId)) continue;
        seen.add(pairId);
        // 変更が絡まない pair は不変 (move = line 変更も対象)
        const xChanged = x.selector !== x.origRef.selector || x.important !== x.origRef.important || x.line !== x.origRef.line;
        const yChanged = y.selector !== y.origRef.selector || y.important !== y.origRef.important || y.line !== y.origRef.line;
        if (!xChanged && !yChanged) continue;
        if (!propsConflict(x.prop, y.prop)) continue;
        if (!themeOverlap(x, y) || !mediaOverlap(x.media, y.media)) continue;
        if (exclusiveDisjoint(x.origRef.selector, y.origRef.selector)) continue;
        if (x.prop === y.prop && x.value === y.value) continue;
        const before = (() => {
          const a = x.origRef, b = y.origRef;
          if (a.important !== b.important) return a.important;
          const sa = specificity(a.selector), sb = specificity(b.selector);
          if (sa !== sb) return sa > sb;
          const fa = FILE_ORDER.get(a.file) ?? 99, fb = FILE_ORDER.get(b.file) ?? 99;
          if (fa !== fb) return fa > fb;
          return a.line > b.line;
        })();
        const after = (() => {
          if (x.important !== y.important) return x.important;
          const sa = specificity(x.selector), sb = specificity(y.selector);
          if (sa !== sb) return sa > sb;
          const fa = FILE_ORDER.get(x.file) ?? 99, fb = FILE_ORDER.get(y.file) ?? 99;
          if (fa !== fb) return fa > fb;
          return x.line > y.line;
        })();
        if (before !== after) {
          flips.push({ winnerChange: true, key,
            x: `${x.file}:${x.line} ${x.origRef.selector} { ${x.prop}: ${x.value}${x.origRef.important ? ' !important' : ''} }`,
            y: `${y.file}:${y.line} ${y.origRef.selector} { ${y.prop}: ${y.value}${y.origRef.important ? ' !important' : ''} }`,
            beforeWinner: before ? 'x' : 'y', afterWinner: after ? 'x' : 'y' });
        }
      }
    }
  }
  if (flips.length === 0) {
    console.log('✅ flip ゼロ — plan は視覚同一 (cascade 等価)');
    // --apply: 実 CSS file へ selector 書換え適用 (rule header 内の該当 selector を text 置換)
    if (process.argv.includes('--apply')) {
      const edits = new Map(); // file → [{ruleStart, from, to}]
      for (const m of mods) {
        if (m.selector === m.origRef.selector) continue;
        const key = `${m.file}|${m.ruleId}|${m.origRef.selector}`;
        if (!edits.has(m.file)) edits.set(m.file, new Map());
        edits.get(m.file).set(key, { ruleStart: m.ruleStart, from: m.origRef.selector, to: m.selector });
      }
      for (const [file, fileEdits] of edits) {
        let src = fs.readFileSync(file, 'utf8');
        const eol = src.includes('\r\n') ? '\r\n' : '\n';
        // 下から (ruleStart 降順) 適用で位置ずれ回避
        const list = [...fileEdits.values()].sort((a, b) => b.ruleStart - a.ruleStart);
        let applied = 0;
        for (const e of list) {
          let pos = 0, ln = 1;
          while (ln < e.ruleStart && pos !== 0xFFFFFFFF) { pos = src.indexOf('\n', pos) + 1; ln++; if (pos === 0) break; }
          const span = src.slice(pos, pos + 400);
          const flex = e.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
          const re = new RegExp(flex);
          if (!re.test(span)) { console.warn(`[WARN] apply 失敗: ${file}:${e.ruleStart} "${e.from}" 不在`); continue; }
          src = src.slice(0, pos) + span.replace(re, e.to) + src.slice(pos + 400);
          applied++;
        }
        fs.writeFileSync(file, src);
        console.log(`${file}: ${applied} selector 書換え`);
      }

      // ── move 物理適用 (resel 書込後に fresh read) ──
      // rule 直上の連続コメント行も一緒に移動 (SECTION banner ╔═ は吸収しない)。
      // 行番号は plan 時点 (= parse 時点) 基準 — resel は行数を変えない前提
      const moveOps = plan.filter(o => o.op === 'move');
      const movesByFile = new Map();
      for (const op of moveOps) {
        if (!movesByFile.has(op.file)) movesByFile.set(op.file, []);
        movesByFile.get(op.file).push(op);
      }
      for (const [file, ops] of movesByFile) {
        const src = fs.readFileSync(file, 'utf8');
        const eol = src.includes('\r\n') ? '\r\n' : '\n';
        const lines = src.split(/\r?\n/); // lines[i] = line i+1
        const isBanner = (s) => /[╔═╚]|SECTION/.test(s);

        // rule 終端: ruleStart から brace balance (comment/string skip) で確定
        const findRuleEnd = (startLine) => {
          let depth = 0, opened = false, inCmt = false, inStr = null;
          for (let li = startLine; li <= lines.length; li++) {
            const s = lines[li - 1];
            for (let ci = 0; ci < s.length; ci++) {
              const ch = s[ci];
              if (inCmt) { if (ch === '*' && s[ci+1] === '/') { inCmt = false; ci++; } continue; }
              if (inStr) { if (ch === inStr && s[ci-1] !== '\\') inStr = null; continue; }
              if (ch === '/' && s[ci+1] === '*') { inCmt = true; ci++; continue; }
              if (ch === '"' || ch === "'") { inStr = ch; continue; }
              if (ch === '{') { depth++; opened = true; }
              if (ch === '}') { depth--; if (opened && depth === 0) return li; }
            }
          }
          return null;
        };
        // rule 直上 コメント吸収 (単行 /* */ の連続、 multi-line comment は閉端→開端遡り)
        const absorbComments = (startLine) => {
          let s = startLine;
          while (s > 1) {
            const above = lines[s - 2].trim();
            if (above.startsWith('/*') && above.endsWith('*/') && !isBanner(above)) { s--; continue; }
            if (above.endsWith('*/') && !isBanner(above)) {
              // multi-line comment: 開端 (行頭 /*) を遡る
              let open = s - 1;
              while (open > 1 && !lines[open - 1].trim().startsWith('/*')) open--;
              const seg = lines.slice(open - 1, s - 1).map(x => x.trim());
              if (lines[open - 1].trim().startsWith('/*') && !seg.some(isBanner)) { s = open; continue; }
            }
            break;
          }
          return s;
        };

        const blocks = [];
        for (const op of ops) {
          const anchorDecls = allDecls.filter(d => d.file === file && d.line === op.anchorLine);
          if (anchorDecls.length === 0) { console.warn(`[WARN] move apply: ${file}:${op.anchorLine} decl 不在`); continue; }
          const ruleStart = Math.min(...anchorDecls.map(d => d.ruleStart));
          const ruleEnd = findRuleEnd(ruleStart);
          if (!ruleEnd) { console.warn(`[WARN] move apply: ${file}:${ruleStart} rule 終端不明`); continue; }
          const blockStart = absorbComments(ruleStart);
          blocks.push({ startLine: blockStart, endLine: ruleEnd, insertAfter: op.afterLine, text: lines.slice(blockStart - 1, ruleEnd) });
        }
        // 検証: block 重複 / insertAfter が削除域内
        const removed = new Array(lines.length + 2).fill(false);
        let bad = false;
        for (const b of blocks) {
          for (let i = b.startLine; i <= b.endLine; i++) {
            if (removed[i]) { console.warn(`[WARN] move apply: block 重複 ${file}:${i}`); bad = true; }
            removed[i] = true;
          }
        }
        for (const b of blocks) {
          if (removed[b.insertAfter]) { console.warn(`[WARN] move apply: insertAfter ${b.insertAfter} が削除域内`); bad = true; }
        }
        if (bad) { console.warn(`[WARN] ${file}: move apply 中止`); continue; }

        const out = [];
        for (let i = 1; i <= lines.length; i++) {
          if (!removed[i]) out.push(lines[i - 1]);
          for (const b of blocks) if (b.insertAfter === i) out.push(...b.text);
        }
        fs.writeFileSync(file, out.join(eol));
        console.log(`${file}: ${blocks.length} rule 移動`);
      }
    }
  } else {
    console.log(`❌ flip ${flips.length}件:`);
    for (const f of flips.slice(0, 30)) {
      console.log(`  [${f.key}] before=${f.beforeWinner} after=${f.afterWinner}`);
      console.log(`    x: ${f.x}`);
      console.log(`    y: ${f.y}`);
    }
  }
  process.exit(flips.length === 0 ? 0 : 1);
}

// ── --layer-impact: @layer 移行 (file = layer、 現 link 順) した場合の flip 全列挙 ──
// layer 化後の cascade: cross-file は後 layer が無条件勝ち (normal)。
// !important は layer 順反転 (先 layer の important が勝つ)。
// flip = 現状勝者 ≠ layer 後勝者 となる pair (値同一は無害なので除外)
if (process.argv.includes('--layer-impact')) {
  // 今 cascade で a が b に勝つか (imp > spec > file順 > line)
  const winsNow = (a, b) => {
    if (a.important !== b.important) return a.important;
    const sa = specificity(a.selector), sb = specificity(b.selector);
    if (sa !== sb) return sa > sb;
    const fa = FILE_ORDER.get(a.file) ?? 99, fb = FILE_ORDER.get(b.file) ?? 99;
    return fa !== fb ? fa > fb : a.line > b.line;
  };
  // layer 後 cascade で a が b に勝つか (imp diff 不変 / 両imp = layer 逆転 / 両 normal = 後 layer、同 layer 内 spec→line)
  const winsLayer = (a, b) => {
    const fa = FILE_ORDER.get(a.file) ?? 99, fb = FILE_ORDER.get(b.file) ?? 99;
    if (a.important !== b.important) return a.important;
    if (a.important && b.important) {
      if (fa !== fb) return fa < fb;
    } else if (fa !== fb) return fa > fb;
    const sa = specificity(a.selector), sb = specificity(b.selector);
    return sa !== sb ? sa > sb : a.line > b.line;
  };
  // 全 compound の pseudo-class state 集合 (ancestor の :hover 等も state 軸)
  const pseudoAll = sel => new Set(
    (sel.replace(/\[[^\]]*\]/g, '[]').match(/:(hover|focus-visible|focus-within|focus|active)\b/g) || []).map(s => s.slice(1))
  );
  // ── 静的 DOM 知識 (index.html 検証済、 JS toggle なし) ──
  // ALWAYS_ON: body 静的常時 class → selector match 集合に影響しない (index.html:388)
  const ALWAYS_ON_CLASSES = new Set(['wwm-layout-active']);
  // SUBTREE_ONLY: class → 専属 ancestor class。 子 class element はその subtree 内のみ出現
  // (hero 系 = index.html:559-660 静的、 hero-wuxia は section 静的 class)
  const SUBTREE_ONLY = {
    'hero-left': 'hero-wuxia', 'hero-right': 'hero-wuxia', 'hero-number': 'hero-wuxia',
    'hero-label': 'hero-wuxia', 'hero-tier': 'hero-wuxia', 'hero-score-row': 'hero-wuxia',
    'donut': 'hero-wuxia', 'donut-wrap': 'hero-wuxia', 'donut-center-label': 'hero-wuxia',
    'luopan': 'hero-wuxia', 'luopan-inner': 'hero-wuxia', 'luopan-ticks': 'hero-wuxia',
  };
  // selector → 正規化 token 集合 (match 集合の包含判定用)
  const normTokenSet = sel => {
    const s = stripThemePrefix(sel);
    const tokens = new Set();
    for (const m of s.match(/\[[^\]]*\]/g) || []) tokens.add(m);
    const noAttr = s.replace(/\[[^\]]*\]/g, '');
    for (const m of noAttr.match(/\.[\w-]+/g) || []) {
      const c = m.slice(1);
      if (!ALWAYS_ON_CLASSES.has(c)) tokens.add('.' + c);
    }
    for (const m of noAttr.match(/#[\w-]+/g) || []) tokens.add(m);
    for (const m of noAttr.match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) || []) {
      const t = m.replace(/^[\s>+~]+/, '');
      if (t !== 'html' && t !== 'body') tokens.add('<' + t + '>');
    }
    for (const [child, anc] of Object.entries(SUBTREE_ONLY)) {
      if (tokens.has('.' + child)) tokens.delete('.' + anc); // 専属 ancestor は冗長 token
    }
    return tokens;
  };
  // box shorthand 展開 (padding/margin のみ)
  const expandBox = (prop, val) => {
    const m = prop.match(/^(padding|margin)(?:-(top|right|bottom|left))?$/);
    if (!m) return null;
    if (m[2]) return { [m[2]]: val.trim() };
    const p = val.trim().split(/\s+/);
    if (p.length < 1 || p.length > 4) return null;
    return { top: p[0], right: p[1] ?? p[0], bottom: p[2] ?? p[0], left: p[3] ?? p[1] ?? p[0] };
  };
  // JS で on/off される state class (mode 軸)。 これらを含む competitor は
  // state on/off の 2 context に分割して invariance を再帰評価する
  const MODE_TOKENS = new Set([
    '.wwm-view-sidebar', '.wwm-shared-build-mode', '.hero--collapsed',
    '.has-data', '.active', '.wwm-sidebar-in-overlay', '.wwm-sb-collapsed-sec',
  ]);
  // progressive-enhancement fallback: a の rule 内に同 prop で b と同値の後続 decl
  // → a は自 rule 内で b 値に上書き済 (値同一文字列 = parse 可否も同一) = pair 無害
  const fallbackShadowed = (a, b, group) => a.prop === b.prop && group.some(z =>
    z !== a && z.file === a.file && z.selector === a.selector && z.media === a.media &&
    z.prop === a.prop && z.line >= a.line && z.value === b.value);
  // 区間群演算 (media 分割用)
  const ivIntersect = (A, B) => {
    const out = [];
    for (const [al, ah] of A) for (const [bl, bh] of B) {
      const lo = Math.max(al, bl), hi = Math.min(ah, bh);
      if (lo <= hi) out.push([lo, hi]);
    }
    return out;
  };
  const ivSubtract = (A, B) => {
    let cur = A.map(iv => [...iv]);
    for (const [bl, bh] of B) {
      const next = [];
      for (const [al, ah] of cur) {
        if (bh < al || bl > ah) { next.push([al, ah]); continue; }
        if (al < bl) next.push([al, Math.min(ah, bl - 0.02)]);
        if (ah > bh) next.push([Math.max(al, bh + 0.02), ah]);
      }
      cur = next;
    }
    return cur;
  };
  // ── context-winner invariance: pair (x,y) の観測 context での group 勝者値が
  //    layer 移行前後で不変なら、 この pair の flip は最終 cascade 値に現れない = 無害。
  //    競合の theme / media 区間 / JS state class はみ出しは context 分割して再帰評価 ──
  const contextWinnerInvariant = (x, y, group, opts = {}) => {
    const { extraTokens = new Set(), excluded = new Set(), depth = 0, themeOv = null, obsIvOv = null, extraPseudo = new Set() } = opts;
    const obsPseudo = new Set([...pseudoAll(x.selector), ...pseudoAll(y.selector), ...extraPseudo]);
    const tx = themeContext(x.selector), ty = themeContext(y.selector);
    const obsTheme = themeOv ?? (tx === 'both' ? ty : tx); // theme 交差 (overlap 前提)
    const ivx = widthIntervals(x.media), ivy = widthIntervals(y.media);
    const obsIv = obsIvOv ?? ((ivx && ivy) ? ivIntersect(ivx, ivy) : null);
    if (obsIv && obsIv.length === 0) return true; // 観測区間が空 = この context は実在しない
    const xyTokens = new Set([...normTokenSet(x.selector), ...normTokenSet(y.selector), ...extraTokens]);
    // class → tag 含意 (class はその tag の element にのみ付く、 DOM 静的検証済)
    const CLASS_IMPLIES_TAG = { 'wwm-cmp-lv-select': '<select>', 'wwm-cmp-stat-select': '<select>' };
    for (const t of [...xyTokens]) {
      if (t.startsWith('.') && CLASS_IMPLIES_TAG[t.slice(1)]) xyTokens.add(CLASS_IMPLIES_TAG[t.slice(1)]);
    }
    const D = [x, y];
    for (const d of group) {
      if (d === x || d === y || excluded.has(d)) continue;
      if (!propsConflict(d.prop, x.prop) && !propsConflict(d.prop, y.prop)) continue;
      // 観測 element は x∩y 両 match → どちらか一方と排他証明できれば d は当たらない
      if (exclusiveDisjoint(d.selector, x.selector) || exclusiveDisjoint(d.selector, y.selector)) continue;
      // x,y どちらにも今も後も勝てない decl は勝者に影響しない
      if (!winsNow(d, x) && !winsNow(d, y) && !winsLayer(d, x) && !winsLayer(d, y)) continue;
      const td = themeContext(d.selector);
      if (obsTheme !== 'both' && td !== 'both' && td !== obsTheme) continue; // 観測 theme に当たらない
      const themeCover = td === 'both' || (obsTheme !== 'both' && td === obsTheme);
      // media: 観測区間との関係 (包含 / 非交差 / 部分重なり)
      const dIv = widthIntervals(d.media);
      let mediaCover, dObsInter = null;
      if (!obsIv || !dIv) {
        mediaCover = d.media === null || d.media === x.media || d.media === y.media;
      } else {
        dObsInter = ivIntersect(dIv, obsIv);
        if (dObsInter.length === 0) continue; // 観測区間に当たらない
        mediaCover = ivSubtract(obsIv, dIv).length === 0; // d 区間 ⊇ 観測区間
      }
      const pseudoCover = [...pseudoAll(d.selector)].every(p => obsPseudo.has(p));
      const dTokens = [...normTokenSet(d.selector)];
      const tokenCover = dTokens.every(t => xyTokens.has(t));
      if (themeCover && mediaCover && pseudoCover && tokenCover) { D.push(d); continue; }
      if (depth < 8) {
        // theme はみ出し (観測 both × 片 theme competitor) → light/dark 両 context で評価
        if (!themeCover && obsTheme === 'both') {
          return contextWinnerInvariant(x, y, group, { ...opts, depth: depth + 1, themeOv: 'light' })
              && contextWinnerInvariant(x, y, group, { ...opts, depth: depth + 1, themeOv: 'dark' });
        }
        // media 部分重なり → d 区間内 / 区間外に分割評価
        if (themeCover && !mediaCover && dObsInter) {
          return contextWinnerInvariant(x, y, group, { ...opts, depth: depth + 1, obsIvOv: dObsInter })
              && contextWinnerInvariant(x, y, group, { ...opts, depth: depth + 1, obsIvOv: ivSubtract(obsIv, dIv) });
        }
        // はみ出しが JS state class のみ → state on/off の両 context で評価
        const extra = dTokens.filter(t => !xyTokens.has(t));
        if (themeCover && mediaCover && pseudoCover && extra.length && extra.every(t => MODE_TOKENS.has(t))) {
          return contextWinnerInvariant(x, y, group, { ...opts, depth: depth + 1, extraTokens: new Set([...extraTokens, ...extra]) })
              && contextWinnerInvariant(x, y, group, { ...opts, depth: depth + 1, excluded: new Set([...excluded, d]) });
        }
        // pseudo state はみ出し (:hover 等) → state on/off の両 context で評価
        if (themeCover && mediaCover && !pseudoCover && tokenCover) {
          const extraP = [...pseudoAll(d.selector)].filter(p => !obsPseudo.has(p));
          return contextWinnerInvariant(x, y, group, { ...opts, depth: depth + 1, extraPseudo: new Set([...extraPseudo, ...extraP]) })
              && contextWinnerInvariant(x, y, group, { ...opts, depth: depth + 1, excluded: new Set([...excluded, d]) });
        }
      }
      return false; // 勝ちうるが co-apply 保証できない competitor → 断念 (保守)
    }
    const top = cmp => D.reduce((a, b) => (cmp(a, b) ? a : b));
    // box shorthand group: 成分別 winner 値比較 (pair が両方触る side のみ —
    // 片方しか触らない side は pair (x,y) の flip と無関係)
    const boxBase = (x.prop.match(/^(padding|margin)/) || [])[1];
    if (boxBase && D.every(d => expandBox(d.prop, d.value))) {
      const ex = expandBox(x.prop, x.value), ey = expandBox(y.prop, y.value);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        if (ex[side] === undefined || ey[side] === undefined) continue;
        const Ds = D.filter(d => expandBox(d.prop, d.value)[side] !== undefined);
        const topOf = cmp => Ds.reduce((a, b) => (cmp(a, b) ? a : b));
        const nw = topOf(winsNow), lw = topOf(winsLayer);
        if (expandBox(nw.prop, nw.value)[side] !== expandBox(lw.prop, lw.value)[side]) return false;
      }
      return true;
    }
    const nw = top(winsNow), lw = top(winsLayer);
    if (nw === lw) return true;                      // 勝者不変
    return nw.prop === lw.prop && nw.value === lw.value; // 勝者交代でも値同一
  };
  const flips = [];
  const seenPair = new Set();
  for (const [key, group] of index) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const x = group[i], y = group[j];
        if (x.file === y.file) continue; // 同 layer 内 = spec/line のまま不変
        const pid = [`${x.file}:${x.line}:${x.prop}:${x.selector}`, `${y.file}:${y.line}:${y.prop}:${y.selector}`].sort().join('||');
        if (seenPair.has(pid)) continue;
        seenPair.add(pid);
        if (!propsConflict(x.prop, y.prop)) continue;
        if (!themeOverlap(x, y) || !mediaOverlap(x.media, y.media)) continue;
        if (exclusiveDisjoint(x.selector, y.selector)) continue;
        if (x.prop === y.prop && x.value === y.value) continue;
        const fx = FILE_ORDER.get(x.file) ?? 99, fy = FILE_ORDER.get(y.file) ?? 99;
        // 現状勝者
        let nowXWins;
        if (x.important !== y.important) nowXWins = x.important;
        else {
          const sx = specificity(x.selector), sy = specificity(y.selector);
          nowXWins = sx !== sy ? sx > sy : fx > fy;
        }
        // layer 後勝者
        let layerXWins;
        if (x.important !== y.important) layerXWins = x.important; // imp > normal は不変
        else if (x.important && y.important) layerXWins = fx < fy; // 両 imp = layer 順反転
        else layerXWins = fx > fy;                                  // 両 normal = 後 layer 勝ち
        if (nowXWins !== layerXWins) {
          if (fallbackShadowed(x, y, group) || fallbackShadowed(y, x, group)) continue; // fallback 自己上書き = 無害
          // 蘇生側が prefers-reduced-motion の motion 殺し → a11y 改善方向 = 採用 (今は imp が a11y を破ってる)
          const loser = nowXWins ? y : x;
          if (loser.media && /prefers-reduced-motion/.test(loser.media) && /^(animation|transition)/.test(loser.prop)) continue;
          if (contextWinnerInvariant(x, y, group)) continue; // 観測 context の勝者値不変 = 無害
          flips.push({ key, loser, nowWinner: nowXWins ? x : y });
        }
      }
    }
  }
  console.log(`\n@layer 移行 flip pair: ${flips.length}`);
  const byFile = {};
  for (const f of flips) {
    const k = `${f.nowWinner.file.replace('assets/styles-','')} が今勝ち → 負けに`;
    byFile[k] = (byFile[k] || 0) + 1;
  }
  console.table(byFile);
  // 蘇生する「現状 dead」 decl (今負けてる側が layer 後勝つ) 上位 sample
  for (const f of flips.slice(0, 15)) {
    console.log(` [${f.key}]`);
    console.log(`   今勝: ${f.nowWinner.file}:${f.nowWinner.line} ${f.nowWinner.selector} { ${f.nowWinner.prop}: ${f.nowWinner.value} }`);
    console.log(`   蘇生: ${f.loser.file}:${f.loser.line} ${f.loser.selector} { ${f.loser.prop}: ${f.loser.value} }`);
  }
  // 全 flip JSON dump (cluster 分析用)
  fs.writeFileSync('scripts/.layer-flips.json', JSON.stringify(flips.map(f => ({
    key: f.key,
    win: { file: f.nowWinner.file, line: f.nowWinner.line, sel: f.nowWinner.selector, prop: f.nowWinner.prop, val: f.nowWinner.value, imp: f.nowWinner.important, media: f.nowWinner.media || null },
    rev: { file: f.loser.file, line: f.loser.line, sel: f.loser.selector, prop: f.loser.prop, val: f.loser.value, imp: f.loser.important, media: f.loser.media || null }
  })), null, 1));
  console.log('\n→ scripts/.layer-flips.json (全件)');
  process.exit(0);
}

// ── --diag: C category のブロック理由 診断 ──────────────────────────
// 各 C decl について「なぜ strip 不可か」を pair 単位で記録 + cluster 集計
if (process.argv.includes('--diag')) {
  const diag = [];
  for (const p of C) {
    const reasons = [];
    if (inlineMap.get(p)) reasons.push({ type: 'inline', cause: String(inlineMap.get(p)) });
    for (const q of compMap.get(p)) {
      if (q.file === p.file && q.line === p.line && q.prop === p.prop) continue;
      if (!propsConflict(q.prop, p.prop)) continue;
      if (!themeOverlap(p, q) || !mediaOverlap(p.media, q.media)) continue;
      if (exclusiveDisjoint(p.selector, q.selector)) continue;
      if (q.prop === p.prop && q.value === p.value) continue;
      const pWins = naturalWins(p, q);
      if (!q.important) {
        if (!pWins) reasons.push({
          type: 'nat-loss', qFile: q.file, qSel: q.selector, qLine: q.line, qProp: q.prop, qVal: q.value,
          specP: specificity(p.selector), specQ: specificity(q.selector)
        });
      } else if (!physS.has(physKeyOf(q))) {
        if (pWins) reasons.push({
          type: 'flip-vs-kept-imp', qFile: q.file, qSel: q.selector, qLine: q.line, qProp: q.prop,
          qCat: catMap.get(q) || '?', qInline: !!inlineMap.get(q)
        });
      }
    }
    diag.push({ file: p.file, line: p.line, selector: p.selector, prop: p.prop, value: p.value, media: p.media, reasons });
  }
  // cluster 集計
  const clusters = {};
  for (const d of diag) {
    for (const r of d.reasons) {
      let key;
      if (r.type === 'inline') key = `inline ${r.cause} | ${d.file}`;
      else if (r.type === 'nat-loss') {
        const rel = r.specQ > (r.specP ?? 0) ? 'spec負け' : '後順負け';
        key = `nat-loss(${rel}) | ${d.file} ← ${r.qFile}`;
      } else key = `flip-vs-kept-imp(${r.qCat}${r.qInline ? '/inline' : ''}) | ${d.file} ← ${r.qFile}`;
      clusters[key] = (clusters[key] || 0) + 1;
    }
    if (d.reasons.length === 0) clusters['no-reason (fixpoint 連鎖除外)'] = (clusters['no-reason (fixpoint 連鎖除外)'] || 0) + 1;
  }
  console.log('\n── C diag clusters (pair 件数) ──');
  for (const [k, n] of Object.entries(clusters).sort((a, b) => b[1] - a[1])) {
    console.log(String(n).padStart(5), k);
  }
  fs.writeFileSync('scripts/.important-c-diag.json', JSON.stringify(diag, null, 1));
  console.log('\n→ scripts/.important-c-diag.json');
}
