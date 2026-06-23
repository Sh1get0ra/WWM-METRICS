#!/usr/bin/env node
// Lv96 t3/t4/t5 snapshot → 各 slot × tier 別 base stat 抽出
// ツール slot 番号にマップ
const fs = require('fs');
const path = require('path');

const SNAP = path.join(__dirname, '..', '.claude', 'research', 'wwmdb');
const t3 = require(path.join(SNAP, 'equip-items-lv96-t3.json')).equipItems || [];
const t4 = require(path.join(SNAP, 'equip-items-lv96-t4.json')).equipItems || [];
const t5 = require(path.join(SNAP, 'equip-items-lv96-t5.json')).equipItems || [];

// wdb slot 名 → ツール slot 番号 + ツール stat key
const SLOT_MAP = {
  Helmet:     { id: '3',  label: '冠',   keys: { 'Max HP': 'HP_MAX', 'Physical Defense': 'W_DEF' } },
  Chestpiece: { id: '4',  label: '胸当', keys: { 'Max HP': 'HP_MAX', 'Physical Defense': 'W_DEF' } },
  Greaves:    { id: '5',  label: '膝鎧', keys: { 'Max HP': 'HP_MAX', 'Physical Defense': 'W_DEF' } },
  Bracer:     { id: '8',  label: '小手', keys: { 'Max HP': 'HP_MAX', 'Physical Defense': 'W_DEF' } },
  Ring:       { id: '9',  label: '射玦', keys: { 'Bow Weakness Hit Damage': 'ARCHER_WEAKPOINT_DAMAGE' } },
  Disc:       { id: '10', label: '環',   keys: { 'Min Physical Attack': 'MIN_W_ATK' } },
  Pendant:    { id: '11', label: '佩',   keys: { 'Max Physical Attack': 'MAX_W_ATK' } },
  Bow:        { id: '21', label: '弓矢', keys: { 'Bow Base Damage': 'ARCHER_DAMAGE' } },
  // 武器種 (slot 1/2 共通、 ツール側 _label は "主武器"/"副武器" で stat 同一)
  Sword:      { id: 'WEAPON', label: '剣',   keys: { 'Min Physical Attack': 'MIN_W_ATK', 'Max Physical Attack': 'MAX_W_ATK' } },
  Spear:      { id: 'WEAPON', label: '槍',   keys: { 'Min Physical Attack': 'MIN_W_ATK', 'Max Physical Attack': 'MAX_W_ATK' } },
  Fan:        { id: 'WEAPON', label: '扇',   keys: { 'Min Physical Attack': 'MIN_W_ATK', 'Max Physical Attack': 'MAX_W_ATK' } },
  Blade:      { id: 'WEAPON', label: '刀',   keys: { 'Min Physical Attack': 'MIN_W_ATK', 'Max Physical Attack': 'MAX_W_ATK' } },
  Blades:     { id: 'WEAPON', label: '双刀', keys: { 'Min Physical Attack': 'MIN_W_ATK', 'Max Physical Attack': 'MAX_W_ATK' } },
  Umbrella:   { id: 'WEAPON', label: '傘',   keys: { 'Min Physical Attack': 'MIN_W_ATK', 'Max Physical Attack': 'MAX_W_ATK' } },
  Dart:       { id: 'WEAPON', label: '縄鏢', keys: { 'Min Physical Attack': 'MIN_W_ATK', 'Max Physical Attack': 'MAX_W_ATK' } },
  Gauntlets:  { id: 'WEAPON', label: '拳甲', keys: { 'Min Physical Attack': 'MIN_W_ATK', 'Max Physical Attack': 'MAX_W_ATK' } },
};

function extractBySlot(items) {
  const out = {};
  for (const it of items) {
    // it.slot = "Foo Bar Helmet" 形式 = 末尾 token が wdb slot 名
    const slotName = (it.slot || '').split(' ').pop();
    const def = SLOT_MAP[slotName];
    if (!def) continue;
    const mapped = {};
    for (const [wdbKey, toolKey] of Object.entries(def.keys)) {
      if (it.attributes?.[wdbKey] != null) mapped[toolKey] = it.attributes[wdbKey];
    }
    if (Object.keys(mapped).length === 0) continue;
    const slotId = def.id;
    if (!out[slotId]) out[slotId] = { label: def.label, attrs: mapped, source: it.name };
    // 同 slot 重複時は 1st entry keep (全 attr 同一前提)
  }
  return out;
}

const gold = extractBySlot(t5);   // tier 5
const purple = extractBySlot(t4); // tier 4
const blue = extractBySlot(t3);   // tier 3

// SLOT_MAP に出てきた全 slot 一覧 (重複 dedupe)
const allSlots = [...new Set(Object.values(SLOT_MAP).map(d => d.id))].sort((a,b) => {
  const an = Number(a), bn = Number(b);
  if (isNaN(an) || isNaN(bn)) return String(a).localeCompare(String(b));
  return an - bn;
});

console.log('=== Lv96 全 quality × 全 slot base stat ===\n');
console.log('slot | label | gold (t5) | purple (t4) | blue (t3) | 紫=金×0.9 check | 青=金×0.8 check');
console.log('-'.repeat(110));
for (const slotId of allSlots) {
  const g = gold[slotId], p = purple[slotId], b = blue[slotId];
  const gStr = g ? JSON.stringify(g.attrs) : '?';
  const pStr = p ? JSON.stringify(p.attrs) : '?';
  const bStr = b ? JSON.stringify(b.attrs) : '?';
  // 算式 check (1 key 抽出)
  const k = g ? Object.keys(g.attrs)[0] : null;
  const pCheck = (g && p && k) ? `${Math.round(g.attrs[k] * 0.9)} vs ${p.attrs[k]} ${Math.round(g.attrs[k]*0.9) === p.attrs[k] ? '✓' : '×'}` : '?';
  const bCheck = (g && b && k) ? `${Math.round(g.attrs[k] * 0.8)} vs ${b.attrs[k]} ${Math.round(g.attrs[k]*0.8) === b.attrs[k] ? '✓' : '×'}` : '?';
  console.log(`${slotId} | ${(g||p||b)?.label||'?'} | ${gStr} | ${pStr} | ${bStr} | ${pCheck} | ${bCheck}`);
}

// 武器種 (slot WEAPON) は別出力 = 武器種ごと
console.log('\n=== 武器種 (slot 1/2) ===');
const weaponKeys = Object.entries(SLOT_MAP).filter(([_,v]) => v.id === 'WEAPON').map(([k]) => k);
for (const wKey of weaponKeys) {
  const g = t5.find(it => (it.slot || '').endsWith(wKey));
  const p = t4.find(it => (it.slot || '').endsWith(wKey));
  const b = t3.find(it => (it.slot || '').endsWith(wKey));
  console.log(`${wKey}: gold=${JSON.stringify(g?.attributes||{})}  purple=${JSON.stringify(p?.attributes||{})}  blue=${JSON.stringify(b?.attributes||{})}`);
}
