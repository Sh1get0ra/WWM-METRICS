#!/usr/bin/env node
// xinfa.json T2 に effectId field 追加 (master `xinfa_effects.json` 経由 lookup 用)
// 既存 effects 数値は keep = master 未 load 時 fallback、 段階移行
const fs = require('fs');
const path = require('path');

const XINFA_PATH = path.join(__dirname, '..', 'data', 'xinfa.json');
const xinfa = JSON.parse(fs.readFileSync(XINFA_PATH, 'utf8'));

// classifyEffect = build script と同 logic (path × type × rank)
function classify(info) {
  const t2 = info?.attributeBuff?.tier2;
  if (!t2) return null;
  const rank = info?.rank || 'unknown';
  const path = t2.weaponSpecific || 'phys';
  const keys = Object.keys(t2.effects || {}).sort();
  const hasMin = keys.some(k => /^min/i.test(k));
  const hasMax = keys.some(k => /^max/i.test(k));
  let type;
  if (hasMin && hasMax) type = 'minmax';
  else if (hasMin) type = 'min';
  else if (hasMax) type = 'max';
  else if (keys.some(k => /Rate$/.test(k))) type = 'rate_' + keys[0];
  else type = 'other_' + keys.join('_');
  return `${path}_${type}_${rank}`;
}

let added = 0, skipped = 0;
for (const [id, info] of Object.entries(xinfa)) {
  if (id.startsWith('_')) continue;
  const t2 = info?.attributeBuff?.tier2;
  if (!t2) { skipped++; continue; }
  if (Object.keys(t2.effects || {}).length === 0) { skipped++; continue; }  // 防御系 (effects 空) は skip
  const effectId = classify(info);
  if (!effectId) { skipped++; continue; }
  if (t2.effectId === effectId) { skipped++; continue; }
  t2.effectId = effectId;
  added++;
}

fs.writeFileSync(XINFA_PATH, JSON.stringify(xinfa, null, 2) + '\n');
console.log(`xinfa.json updated: ${added} 心法に effectId 追加、 ${skipped} skip (防御系 or effects 空)`);
