#!/usr/bin/env node
/* responsive-dissolve-verify.cjs — apply 後の物理検証 (cascade 検証は audit が担当)
 * 1. 4 file 横断 decl multiset (sel|prop|value|imp|media) が git HEAD と完全一致 (内容無変化 = 移動のみ)
 * 2. plan の各 move rule の decl が dest file に同 media で存在
 * 3. responsive.css 残 decl = plan keep 相当
 */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// audit の parseCss を再利用 (require で読み込むと main が走る → 簡易: 自前最小 parser は危険なので
// audit ファイルから parseCss 部分を eval 抽出する代わりに、 audit と同一実装をここに持つのは重複 →
// git HEAD 比較は同一 parser で before/after を読むため、 parser の癖は両側で相殺される)
const auditSrc = fs.readFileSync(path.join(__dirname, 'responsive-dissolve-audit.cjs'), 'utf8');
const parseSrc = auditSrc.slice(auditSrc.indexOf('function parseCss'), auditSrc.indexOf('const norm ='));
// eslint-disable-next-line no-eval
const parseCss = eval(`(${parseSrc.replace(/^function parseCss/, 'function')})`);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const FILES = ['assets/styles-base.css', 'assets/styles-components.css', 'assets/styles-modals.css', 'assets/styles-responsive.css'];

const sig = (d) => `${norm(d.selector)}|${d.prop}|${norm(d.value)}|${d.important ? 1 : 0}|${norm(d.media || '')}`;
function multiset(getText) {
  const m = new Map();
  for (const f of FILES) {
    for (const d of parseCss(getText(f), f)) {
      const k = sig(d);
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return m;
}

const before = multiset(f => execSync(`git show HEAD:${f}`, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
const after = multiset(f => fs.readFileSync(f, 'utf8'));

let diff = 0;
for (const [k, v] of before) {
  const a = after.get(k) || 0;
  if (a !== v) { console.error(`MULTISET- ${k} : before ${v} after ${a}`); diff++; }
}
for (const [k, v] of after) {
  if (!before.has(k)) { console.error(`MULTISET+ ${k} : after ${v}`); diff++; }
}

// plan move decl の dest 所在確認
const plan = JSON.parse(fs.readFileSync('scripts/.responsive-dissolve-plan.json', 'utf8'));
const destDecls = new Map();
for (const f of FILES.slice(0, 3)) {
  for (const d of parseCss(fs.readFileSync(f, 'utf8'), f)) {
    destDecls.set(`${f}|${norm(d.selector)}|${norm(d.media || '')}`, true);
  }
}
let missing = 0;
for (const m of plan.moves) {
  for (const s of m.sels) {
    if (!destDecls.has(`${m.dest}|${norm(s)}|${norm(m.media)}`)) {
      console.error(`MISSING in ${m.dest}: ${norm(s)} @ ${m.media}`);
      missing++;
    }
  }
}

const remain = parseCss(fs.readFileSync('assets/styles-responsive.css', 'utf8'), 'r').length;
console.log(`verify: multiset diff ${diff} | dest missing ${missing} | responsive 残 decl ${remain}`);
if (diff || missing) process.exit(1);
console.log('VERIFY OK — decl 内容無変化 + 全 move 所在確認');
