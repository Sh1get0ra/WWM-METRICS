#!/usr/bin/env node
/* component-split-apply.cjs — @layer Step 4: plan に従い components.css を per-component file へ物理分割。
 *
 * - rule text 逐語移動 (EOL は SRC 準拠で統一出力)
 * - 直上隣接 comment block 同乗 (responsive-dissolve-apply 同型 — 既知穴: comment 本文中の
 *   @media/{} 文字列で multi-line attach が止まる → leftover 報告で目視回収)
 * - 同 dest 連続同 media は 1 つの @media block に併合 (源順保存)
 * - 各 dest file = header + @layer components { ... } で新規生成
 * - SRC は全 rule 抽出後 削除対象 — 未回収 (非 blank ∧ 非 banner) 行を leftover 報告
 * - index.html / sw.js / scripts/css-files.cjs は別途手動更新 (apply 後の指示出力)
 *
 * usage: node scripts/component-split-apply.cjs [--dry]
 */
const fs = require('fs');

const DRY = process.argv.includes('--dry');
const plan = JSON.parse(fs.readFileSync('scripts/.component-split-plan.json', 'utf8'));
const SRC = plan.src;

const srcText = fs.readFileSync(SRC, 'utf8');
const EOL = srcText.includes('\r\n') ? '\r\n' : '\n';
const srcLines = srcText.split('\n'); // 1-based: srcLines[i-1] (\r は行内保持 → 出力時 strip)
const clean = (l) => (l || '').replace(/\r$/, '');

/* 直上隣接 comment block 同乗 (blank / 非 comment / @media / brace 行で停止) */
function attachStart(start, floorLine) {
  let s = start;
  while (s - 1 > floorLine) {
    const t = clean(srcLines[s - 2]).trim();
    if (!t) break;
    if (/@media|[{}]/.test(t) && !/^\/\*.*\*\/$/.test(t)) break;
    if (/^\/\*.*\*\/$/.test(t)) { s--; continue; }
    if (/\*\/$/.test(t)) {
      let b = s - 2;
      while (b >= floorLine) {
        const bt = clean(srcLines[b]).trim();
        if (bt.startsWith('/*')) break;
        b--;
      }
      const bt = clean(srcLines[b]).trim();
      if (b >= floorLine && bt.startsWith('/*') && !/@media|[{}]/.test(bt.replace(/\/\*|\*\//g, ''))) { s = b + 1; continue; }
      break;
    }
    break;
  }
  return s;
}

/* keep-note comment の手動 carry (attachStart が @media shell / blank で届かない遠隔 comment)。
 * 2026-06-06 dry-run leftover 目視で選別:
 *  - 710-713: mobile stat overlay sidebar imp 戦争 note (「前方へ動かすな / strip するな」) → layout.css の当該 rule 前
 *  - 2456-2471: S40 MOBILE RESPONSIVE 設計方針 block (+ dvh/safe-area 注記) → mobile.css 先頭 rule 前
 *  - 3660-3661: hero-tier badge 320-359px 中間サイズの判断理由 → hero.css の当該 rule 前
 * 孤児 note (rule が過去 step で他 file へ移動済) は捨てる: 2585-2589 OBS guard (実体は obs.css)、
 * S29/S34 の light 説明群 (実体は light.css) */
const CARRY_COMMENTS = [
  { lines: [710, 713], beforeRule: 717 },
  { lines: [2456, 2471], beforeRule: 2473 },
  { lines: [3660, 3661], beforeRule: 3662 },
];

const moves = [...plan.rules].sort((a, b) => a.start - b.start);
let prevEnd = 1; // line 1 = @layer components {
for (const m of moves) {
  m.physStart = attachStart(m.start, prevEnd);
  m.physEnd = m.end;
  prevEnd = m.end;
}
for (let i = 1; i < moves.length; i++) {
  if (moves[i].physStart <= moves[i - 1].physEnd) {
    console.error(`OVERLAP: ${moves[i - 1].ruleId} (..${moves[i - 1].physEnd}) vs ${moves[i].ruleId} (${moves[i].physStart}..)`);
    process.exit(1);
  }
}

/* dest 別 file 構築 (源順、 連続同 media 併合) */
const byDest = new Map();
for (const t of plan.targets) byDest.set(t, []);
for (const m of moves) byDest.get(m.dest).push(m);

const DEST_DESC = {
  'share.css': 'SHARE バナー / 弱点バッジ / preset bar / diag modal',
  'hero.css': 'HERO パネル (武格指数 / donut / luopan / tier badge / roulette)',
  'sidebar.css': 'SIDEBAR + mini-hero card + sb tier badge',
  'layout.css': 'APP LAYOUT (container / app-body / sticky-header / OBS layout 上書き)',
  'gear.css': 'GEAR grid / equip card / equip-section / step2 form',
  'xinfa.css': 'XINFA grid / 案A card layer / compare-modal 系 (.wwm-cmp-*) components 層残置分',
  'anlz.css': 'ANALYSIS grid / tabs / opt / rank / diagnostics / anlz body+font',
  'mobile.css': 'MOBILE drawer / topbar / stat overlay / 帰属不能 mobile 上書き (終端 file)',
};

function buildFile(dest, destMoves) {
  const name = dest.replace(/^.*\//, '');
  const out = [];
  out.push('/* ╔═══════════════════════════════════════════════════════════════════╗');
  out.push(`     ${name} — ${DEST_DESC[name] || ''}`);
  out.push('     @layer Step 4 (2026-06-06): styles/components.css を per-component 分割。');
  out.push('     cascade 同値性は component-split-audit.cjs で機械証明 (同 layer 内 順序保存)。');
  out.push('     file 読込順 = index.html link 順 = scripts/css-files.cjs (単一真実) — 勝手に入替えるな');
  out.push('   ╚═══════════════════════════════════════════════════════════════════╝ */');
  out.push('@layer components {');
  let curMedia = null;
  for (const m of destMoves) {
    const carry = CARRY_COMMENTS.find(c => c.beforeRule === m.start);
    if (carry && (m.media || null) !== curMedia && curMedia !== null) { out.push('}'); curMedia = null; }
    if (carry) {
      out.push('');
      for (let i = carry.lines[0]; i <= carry.lines[1]; i++) out.push(clean(srcLines[i - 1]));
    }
    if ((m.media || null) !== curMedia) {
      if (curMedia !== null) out.push('}');
      curMedia = m.media || null;
      if (curMedia !== null) { out.push(''); out.push(`${curMedia} {`); }
    }
    if (curMedia === null) out.push('');
    for (let i = m.physStart; i <= m.physEnd; i++) out.push(clean(srcLines[i - 1]));
  }
  if (curMedia !== null) out.push('}');
  out.push('');
  out.push('} /* end @layer components */');
  out.push('');
  return out.join(EOL);
}

/* leftover 検査 (回収されない行 = banner / TOC / 孤児 comment) */
const taken = new Set();
for (const m of moves) for (let i = m.physStart; i <= m.physEnd; i++) taken.add(i);
for (const c of CARRY_COMMENTS) for (let i = c.lines[0]; i <= c.lines[1]; i++) {
  if (taken.has(i)) { console.error(`CARRY 行 ${i} が rule 範囲と重複`); process.exit(1); }
  taken.add(i);
}
const leftovers = [];
let inComment = false;
for (let i = 1; i <= srcLines.length; i++) {
  if (taken.has(i)) { inComment = false; continue; }
  const t = clean(srcLines[i - 1]).trim();
  if (!t) continue;
  if (i === 1 && /^@layer components \{/.test(t)) continue;
  if (/^\} \/\* end @layer /.test(t)) continue;
  // @media/@supports shell (中身は media context 込で抽出済 → 殻だけ残る) + 単独 } は soft
  if (/^@(media|supports)[^{]*\{$/.test(t) || t === '}') continue;
  let isCommentLine = false;
  if (inComment) {
    isCommentLine = true;
    if (t.includes('*/')) inComment = false;
  } else if (t.startsWith('/*')) {
    isCommentLine = true;
    if (!t.includes('*/')) inComment = true;
  }
  if (isCommentLine) { leftovers.push({ line: i, text: t.slice(0, 90), comment: true }); continue; }
  leftovers.push({ line: i, text: t.slice(0, 90), comment: false });
}
const hardLeft = leftovers.filter(l => !l.comment);
console.log(`rules ${moves.length} | dest ${[...byDest.keys()].length} file | leftover comment 行 ${leftovers.length - hardLeft.length} / 非 comment 行 ${hardLeft.length}`);
if (hardLeft.length) {
  console.error('❌ 非 comment leftover (rule 抽出漏れ):');
  for (const l of hardLeft.slice(0, 20)) console.error(`  L${l.line}: ${l.text}`);
  process.exit(1);
}

if (DRY) {
  for (const [dest, dm] of byDest) {
    const lines = dm.reduce((a, m) => a + (m.physEnd - m.physStart + 1), 0);
    console.log(`${dest}: ${dm.length} rules / ${lines} src lines`);
  }
  console.log('--- leftover comments (捨てられる — keep 注記が無いか目視) ---');
  for (const l of leftovers) console.log(`  L${l.line}: ${l.text}`);
  console.log('(dry — no write)');
  process.exit(0);
}

for (const [dest, dm] of byDest) {
  fs.writeFileSync(dest, buildFile(dest, dm));
  console.log(`${dest}: ${dm.length} rules`);
}
fs.unlinkSync(SRC);
console.log(`${SRC} 削除`);
console.log('次: scripts/css-files.cjs / index.html / sw.js を 8 file 構成に更新 → component-split-verify.cjs');
