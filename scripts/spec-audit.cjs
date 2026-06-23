#!/usr/bin/env node
/**
 * spec-audit.cjs — .claude/specs/*.md の anchor を実コードに突合し腐り (STALE) を検出
 *
 * 設計 = .claude/specs/_design-spec-system.md
 * 各 spec の frontmatter anchors を種別ごとの「定義パターン」で grep:
 *   dom_id    → index.html の id="X" / src の getElementById('X') / querySelector('#X')  [必須]
 *   expose    → src の window.NS = 定義 (+ method 名存在チェックは warn)                 [必須]
 *   state_key → src の 'X' / "X" literal (コメント除去後)                                [必須]
 *   func      → src の function X / X = function / X: / X(                                [補助=warn]
 *   i18n_key  → data/i18n/*.json の key 存在                                             [補助=warn]
 * 必須種別 miss = STALE (exit 1) / 補助 miss = warn (exit 0)
 *
 * usage: node scripts/spec-audit.cjs [feature]   (feature 指定で 1 spec のみ)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SPECS_DIR = path.join(ROOT, '.claude', 'specs');
const SRC_DIR = path.join(ROOT, 'src');
const INDEX_HTML = path.join(ROOT, 'index.html');
const I18N_DIR = path.join(ROOT, 'data', 'i18n');

const REQUIRED = ['dom_id', 'expose', 'state_key'];
const ADVISORY = ['func', 'i18n_key'];

// ── corpus 構築 ──
function walk(dir, ext, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, acc);
    else if (e.name.endsWith(ext)) acc.push(p);
  }
  return acc;
}
function stripComments(s) {
  // block /* */ → 除去、 行 // → 除去 (文字列リテラルは残す簡易版)
  // 注意: 全 src を join した文字列に当てるとテンプレリテラル内の `/*` を誤発火する事故あり
  // → 検証は raw / stripped 両方の OR で行い、 stripped 単独に依存しない
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const jsFiles = walk(SRC_DIR, '.js', []);
const jsRaw = jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const jsNoComment = stripComments(jsRaw);
// raw OR stripped で hit すれば「コードに存在」と判定 (stripComments 誤発火に対する保険)
const jsHit = (re) => re.test(jsRaw) || re.test(jsNoComment);
const htmlRaw = fs.existsSync(INDEX_HTML) ? fs.readFileSync(INDEX_HTML, 'utf8') : '';
const i18nRaw = walk(I18N_DIR, '.json', []).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── 種別ごと検証 (true=生存) ──
function checkDomId(id) {
  const e = escRe(id);
  return (
    new RegExp(`id=["']${e}["']`).test(htmlRaw) ||
    jsHit(new RegExp(`getElementById\\(\\s*["']${e}["']`)) ||
    jsHit(new RegExp(`querySelector(All)?\\(\\s*["'][^"']*#${e}\\b`)) ||
    // src 内 template literal の `id="X"` (動的 inject される DOM)
    jsHit(new RegExp(`id=["']${e}["']`)) ||
    // 動的 setId (例: `el.id = 'wwmFoo'`、 createElement 後)
    jsHit(new RegExp(`\\.id\\s*=\\s*["']${e}["']`)) ||
    // ID 引数を helper に渡す pattern (例: `_createModal('wwmFoo', ...)`)
    // ID 名は `wwm` prefix + camelCase で十分ユニーク → string literal fallback
    (/^wwm[A-Z]/.test(id) && jsHit(new RegExp(`["']${e}["']`)))
  );
}
function checkExpose(spec) {
  // "NS.method" → NS = 最初の segment、 method = 残り最後
  const segs = spec.split('.');
  const ns = segs[0];
  const method = segs[segs.length - 1];
  const nsOk = jsHit(new RegExp(`window\\.${escRe(ns)}\\s*=`));
  const methodOk = segs.length < 2 || jsHit(new RegExp(`\\b${escRe(method)}\\b`));
  return { nsOk, methodOk };
}
function checkStateKey(key) {
  return jsHit(new RegExp(`["']${escRe(key)}["']`));
}
function checkFunc(name) {
  const e = escRe(name);
  return (
    jsHit(new RegExp(`function\\s+${e}\\b`)) ||
    jsHit(new RegExp(`\\b${e}\\s*=\\s*function`)) ||
    jsHit(new RegExp(`\\b${e}\\s*[:(]`))
  );
}
function checkI18nKey(key) {
  return new RegExp(`["']${escRe(key)}["']`).test(i18nRaw);
}

// ── frontmatter parse (簡易: inline array のみ) ──
function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const body = m[1];
  const fm = { anchors: {} };
  const sf = body.match(/^source_files:\s*\[(.*)\]/m);
  if (sf) fm.source_files = sf[1].split(',').map((s) => s.trim()).filter(Boolean);
  const featM = body.match(/^feature:\s*(.+)$/m);
  if (featM) fm.feature = featM[1].trim();
  // anchor 行 = インデント付き `  kind: [...]` (source_files は無インデント=除外)
  const re = /^\s+(\w+):\s*\[(.*)\]\s*$/gm;
  let a;
  while ((a = re.exec(body))) {
    fm.anchors[a[1]] = a[2].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return fm;
}

// ── 実行 ──
const onlyFeature = process.argv[2];
let specFiles = fs.existsSync(SPECS_DIR)
  ? fs.readdirSync(SPECS_DIR).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'INDEX.md')
  : [];
if (onlyFeature) specFiles = specFiles.filter((f) => f === `${onlyFeature}.md`);

let totalStale = 0;
let totalWarn = 0;
let specCount = 0;

console.log(`spec-audit: scanning .claude/specs/ (${jsFiles.length} js files + index.html)\n`);

for (const file of specFiles) {
  const md = fs.readFileSync(path.join(SPECS_DIR, file), 'utf8');
  const fm = parseFrontmatter(md);
  if (!fm) { console.log(`[${file}] ⚠ frontmatter 無し — skip`); continue; }
  specCount++;
  const staleLines = [];
  const warnLines = [];

  // source_files 存在チェック
  for (const sf of fm.source_files || []) {
    if (!fs.existsSync(path.join(ROOT, sf))) staleLines.push(`source_files: ${sf} = ファイル不在`);
  }

  const checkers = {
    dom_id: (x) => checkDomId(x),
    state_key: (x) => checkStateKey(x),
    func: (x) => checkFunc(x),
    i18n_key: (x) => checkI18nKey(x),
  };

  console.log(`[${file}]  src: ${(fm.source_files || []).join(', ') || '—'}`);
  for (const kind of [...REQUIRED, ...ADVISORY]) {
    const list = fm.anchors[kind] || [];
    if (!list.length) continue;
    const miss = [];
    for (const item of list) {
      let ok;
      if (kind === 'expose') {
        const r = checkExpose(item);
        ok = r.nsOk; // ns 不在 = STALE、 method 不在 = warn 別途
        if (r.nsOk && !r.methodOk) warnLines.push(`expose method 不明: ${item}`);
      } else {
        ok = checkers[kind](item);
      }
      if (!ok) miss.push(item);
    }
    const tag = REQUIRED.includes(kind) ? 'STALE' : 'warn';
    const mark = miss.length ? '✗' : 'ok';
    console.log(`  ${kind.padEnd(9)} ${list.length - miss.length}/${list.length} ${mark}` +
      (miss.length ? `  [${tag}] ${miss.join(', ')}` : ''));
    if (miss.length) {
      if (REQUIRED.includes(kind)) staleLines.push(`${kind}: ${miss.join(', ')}`);
      else warnLines.push(`${kind}: ${miss.join(', ')}`);
    }
  }
  if (staleLines.length) { totalStale += staleLines.length; console.log(`  ⛔ STALE:\n     ${staleLines.join('\n     ')}`); }
  else console.log(`  ✓ clean`);
  totalWarn += warnLines.length;
  console.log('');
}

console.log('=== SUMMARY ===');
console.log(`${specCount} spec(s), ${totalStale} STALE group(s), ${totalWarn} warn`);
process.exit(totalStale ? 1 : 0);
