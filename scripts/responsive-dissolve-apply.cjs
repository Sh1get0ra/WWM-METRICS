#!/usr/bin/env node
/* responsive-dissolve-apply.cjs — @layer Step 3: plan に従い responsive.css の rule を
 * dest file 末尾 (end @layer marker 直前) へ物理移動。
 *
 * - rule text 逐語移動 (CRLF 保持: split('\n') で \r は行内保持)
 * - 直上隣接 comment block は rule に同乗
 * - 同 dest 連続同 media は 1 つの @media block に併合 (源順保存)
 * - 移動後 responsive.css の空 @media shell 削除
 * - post-verify: 全 file 再 parse → 移動 decl が dest に存在 + responsive 残 decl = keep 集合
 *
 * usage: node scripts/responsive-dissolve-apply.cjs [--dry]
 */
const fs = require('fs');

const DRY = process.argv.includes('--dry');
const plan = JSON.parse(fs.readFileSync('scripts/.responsive-dissolve-plan.json', 'utf8'));
const SRC = plan.src;

const srcText = fs.readFileSync(SRC, 'utf8');
const srcLines = srcText.split('\n'); // 1-based: srcLines[i-1]

/* 直上隣接 comment block 同乗 (blank 行 / 非 comment 行 / @media / brace 行で停止) */
function attachStart(start, floorLine) {
  let s = start;
  while (s - 1 > floorLine) {
    const t = (srcLines[s - 2] || '').replace(/\r$/, '').trim();
    if (!t) break;
    if (/@media|[{}]/.test(t) && !/^\/\*.*\*\/$/.test(t)) break;
    if (/^\/\*.*\*\/$/.test(t)) { s--; continue; } // 単行 comment
    if (/\*\/$/.test(t)) {
      // 複数行 comment block 末尾 → 開始行まで遡上
      let b = s - 2; // 0-based index of the '*/' line
      while (b >= floorLine) {
        const bt = (srcLines[b] || '').replace(/\r$/, '').trim();
        if (bt.startsWith('/*')) break;
        b--;
      }
      const bt = (srcLines[b] || '').replace(/\r$/, '').trim();
      if (b >= floorLine && bt.startsWith('/*') && !/@media|[{}]/.test(bt.replace(/\/\*|\*\//g, ''))) { s = b + 1; continue; }
      break;
    }
    break;
  }
  return s;
}

/* 移動範囲確定 (源順、 直前 move の end を floor に) */
const moves = [...plan.moves].sort((a, b) => a.start - b.start);
let prevEnd = 1; // line 1 = @layer responsive {
for (const m of moves) {
  m.physStart = attachStart(m.start, prevEnd);
  m.physEnd = m.end;
  prevEnd = m.end;
}
// 範囲重複 assert
for (let i = 1; i < moves.length; i++) {
  if (moves[i].physStart <= moves[i - 1].physEnd) {
    console.error(`OVERLAP: move ${moves[i - 1].ruleId} (..${moves[i - 1].physEnd}) vs ${moves[i].ruleId} (${moves[i].physStart}..)`);
    process.exit(1);
  }
}

/* dest 別挿入 text 構築 (連続同 media 併合) */
const byDest = new Map();
for (const m of moves) {
  if (!byDest.has(m.dest)) byDest.set(m.dest, []);
  byDest.get(m.dest).push(m);
}
function buildInsert(destMoves) {
  const out = [];
  out.push('');
  out.push('/* ╔═══════════════════════════════════════════════════════════════════╗');
  out.push('     RESPONSIVE — co-location (@layer Step 3, 2026-06-06)');
  out.push('     styles-responsive.css から移設。 cascade 同値性は responsive-dissolve-audit.cjs で機械証明');
  out.push('   ╚═══════════════════════════════════════════════════════════════════╝ */');
  let curMedia = null;
  for (const m of destMoves) {
    if (m.media !== curMedia) {
      if (curMedia !== null) out.push('}');
      out.push('');
      out.push(`${m.media} {`);
      curMedia = m.media;
    }
    for (let i = m.physStart; i <= m.physEnd; i++) out.push(srcLines[i - 1].replace(/\r$/, ''));
  }
  if (curMedia !== null) out.push('}');
  return out;
}

if (DRY) {
  for (const [dest, dm] of byDest) {
    const lines = dm.reduce((a, m) => a + (m.physEnd - m.physStart + 1), 0);
    console.log(`${dest}: ${dm.length} rules / ${lines} src lines`);
  }
  console.log('(dry — no write)');
  process.exit(0);
}

/* dest file へ挿入 (end @layer marker 直前) */
for (const [dest, dm] of byDest) {
  const text = fs.readFileSync(dest, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  let endIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\} \/\* end @layer /.test(lines[i])) { endIdx = i; break; }
  }
  if (endIdx < 0) { console.error(`end @layer marker not found in ${dest}`); process.exit(1); }
  const insert = buildInsert(dm);
  const next = [...lines.slice(0, endIdx), ...insert, '', ...lines.slice(endIdx)];
  fs.writeFileSync(dest, next.join(eol));
  console.log(`${dest}: +${insert.length} lines (${dm.length} rules)`);
}

/* responsive.css から移動範囲削除 */
{
  const remove = new Set();
  for (const m of moves) for (let i = m.physStart; i <= m.physEnd; i++) remove.add(i);
  let lines = srcLines.filter((_, idx) => !remove.has(idx + 1));
  // 空 @media shell 削除 ( { } 間 空白のみ)
  const isBlank = (l) => !l.replace(/\r$/, '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < lines.length; i++) {
      if (!/^@media[^{]*\{\s*\r?$/.test(lines[i])) continue;
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j < lines.length && /^\}\s*\r?$/.test(lines[j])) {
        lines.splice(i, j - i + 1);
        changed = true;
        break;
      }
    }
  }
  // 3+ 連続 blank 行 → 1 行
  const out = [];
  let blanks = 0;
  for (const l of lines) {
    if (isBlank(l)) { blanks++; if (blanks > 1) continue; }
    else blanks = 0;
    out.push(l);
  }
  fs.writeFileSync(SRC, out.join('\n'));
  console.log(`${SRC}: ${srcLines.length} → ${out.length} lines`);
}

/* ── post-verify: 再 parse で移動 decl の dest 所在 + 残 decl 一致を確認 ── */
const { execSync } = require('child_process');
try {
  execSync('node scripts/responsive-dissolve-verify.cjs', { stdio: 'inherit' });
} catch (e) {
  console.error('VERIFY FAILED — review before commit');
  process.exit(1);
}
