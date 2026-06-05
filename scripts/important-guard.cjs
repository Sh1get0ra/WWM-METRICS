#!/usr/bin/env node
// !important 退行ガード (pre-commit) — Tier 1 の削減成果を恒久ロック
//
// 仕組み:
//   1. important-audit-v2.cjs を実行 → scripts/.important-v2.json
//   2. 総数を scripts/important-baseline.json と比較
//   3. 増加 → commit 拒否 (exit 1)。 減少 → baseline 自動更新 + stage
//
// baseline 手動更新 (意図的に増やす場合のみ):
//   node scripts/important-guard.cjs --update-baseline

const { execSync } = require('child_process');
const fs = require('fs');

const BASELINE_PATH = 'scripts/important-baseline.json';

execSync('node scripts/important-audit-v2.cjs', { stdio: 'pipe' });
const { A, B, G, K, C } = JSON.parse(fs.readFileSync('scripts/.important-v2.json', 'utf8'));
const total = A.length + B.length + G.length + K.length + C.length;

if (process.argv.includes('--update-baseline')) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ total, updated: new Date().toISOString().slice(0, 10) }, null, 2));
  console.log(`[important-guard] baseline を ${total} に手動更新`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  : { total: Infinity };

if (total > baseline.total) {
  console.error(`[important-guard] ❌ !important が増加: ${baseline.total} → ${total} (+${total - baseline.total})`);
  console.error('  audit: node scripts/important-audit-v2.cjs (A/B/G なら strip 可能、 C は構造見直し)');
  console.error('  どうしても必要 (inline 対抗等) なら: node scripts/important-guard.cjs --update-baseline');
  process.exit(1);
}

if (total < baseline.total) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ total, updated: new Date().toISOString().slice(0, 10) }, null, 2));
  try { execSync(`git add ${BASELINE_PATH}`, { stdio: 'pipe' }); } catch {}
  console.log(`[important-guard] ✅ baseline 更新: ${baseline.total} → ${total} (-${baseline.total - total})`);
} else {
  console.log(`[important-guard] ✅ ${total} (baseline 維持)`);
}
