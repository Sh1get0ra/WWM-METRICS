#!/usr/bin/env node
// @layer Step 2-e plan generator: M batchSafe (light + dark 両 theme) → token swap / 削除
// token 粒度 = base pair 物理 decl 単位 (cross-theme で同 pair を別 token が二重置換する衝突を排除):
//   token = { dark: dark entry 値 ?? base 現値, light: light entry 値 ?? base 現値 }
//   light === dark なら light block 定義省略
// 削除 = theme 物理 decl 単位 (sameValue のみの decl は deleteOnly)
// node scripts/theme-swap-audit.cjs 後に実行

const fs = require('fs');
const { M } = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const PROP_SLUG = {
  'color': 'fg', 'background': 'bg', 'background-color': 'bg',
  'border-color': 'border', 'border-top-color': 'border-top', 'border-bottom-color': 'border-bot',
  'border-left-color': 'border-left', 'border-right-color': 'border-right',
  'border-left': 'border-left', 'border-bottom': 'border-bot', 'border': 'border',
  'box-shadow': 'shadow', 'text-shadow': 'text-shadow', 'opacity': 'opacity',
  'accent-color': 'accent', 'outline-color': 'outline', 'stroke': 'stroke', 'fill': 'fill',
  'font-weight': 'fw', 'background-image': 'bg',
};

function selSlug(sel) {
  const safe = sel.replace(/\[[^\]]*\]/g, '');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || safe;
  let pseudo = '';
  if (/::?before/.test(last)) pseudo = '-before';
  else if (/::?after/.test(last)) pseudo = '-after';
  else if (/:hover/.test(last)) pseudo = '-hover';
  else if (/:focus/.test(last)) pseudo = '-focus';
  else if (/:checked/.test(last)) pseudo = '-checked';
  const classes = (last.match(/\.[\w-]+/g) || []).map(c => c.slice(1).replace(/^wwm-/, ''));
  let core = classes.join('-') || last.replace(/[:#().]/g, '').trim();
  const ctx = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const c = (parts[i].match(/\.[\w-]+/g) || []).map(x => x.slice(1).replace(/^wwm-/, ''));
    if (c.length) ctx.push(c[0]);
  }
  const near = ctx[ctx.length - 1];
  if (near && !core.startsWith(near) && !near.startsWith(core)) core = `${near}--${core}`;
  return (core + pseudo).replace(/-{3,}/g, '--');
}

// 命名手動補正 (機械 slug → semantic)
const RENAME = {
  '--c-cmp-modal-a--cmp-rows-bg': '--c-modal-a-rows-bg',
  '--c-cmp-modal-a--cmp-title-ja-fg': '--c-modal-a-title-ja-fg',
  '--c-cmp-modal-a--cmp-title-en-fg': '--c-cmp-title-en-fg-2',
  '--c-cmp-modal-a--cmp-col-bg': '--c-modal-a-col-bg',
  '--c-cmp-modal-a--cmp-kongfu-header-fg': '--c-modal-a-kongfu-header-fg',
  '--c-cmp-modal-a--cmp-kongfu-header-bg': '--c-modal-a-kongfu-header-bg',
  '--c-cmp-modal-a--cmp-kongfu-select-fg': '--c-modal-a-kongfu-select-fg',
  '--c-cmp-modal-a--cmp-kongfu-select-bg-2': '--c-modal-a-kongfu-select-bg-2',
  '--c-cmp-modal-a--cmp-set-header-fg': '--c-modal-a-set-fg', /* base rule = set-header + set-select 共用 */
  '--c-cmp-modal-a--cmp-set-header-bg': '--c-modal-a-set-header-bg',
  '--c-cmp-modal-a--cmp-set-select-fg': '--c-modal-a-set-select-fg',
  '--c-cmp-modal-a--cmp-name-fg': '--c-modal-a-name-fg',
  '--c-cmp-modal-a--cmp-val-fg': '--c-modal-a-val-fg',
  '--c-cmp-modal-a--cmp-val-input-fg-2': '--c-modal-a-val-input-fg-2',
};

const cands = M.filter(d => d.batchSafe);

// 物理 theme decl 単位 dedupe → pair token 集約 + 削除リスト
const seenPhys = new Set();
const pairTokens = new Map(); // pairFile|pairLine|prop → { baseVal, lightVal?, darkVal?, baseSel, prop, file, line }
const deletes = [];           // { file, line, prop, label }
for (const d of cands) {
  const pk = `${d.file}|${d.line}|${d.prop}`;
  if (seenPhys.has(pk)) continue;
  seenPhys.add(pk);
  const splits = cands.filter(s => `${s.file}|${s.line}|${s.prop}` === pk);
  deletes.push({ file: d.file, line: d.line, prop: d.prop, label: `${d.ctx} ${d.baseSel}`, sameValue: d.sameValue });
  if (d.sameValue) continue; // 削除のみ (base 無変更)
  for (const s of splits) {
    const tk = `${s.pair.file}|${s.pair.line}|${s.prop}`;
    if (!pairTokens.has(tk)) {
      pairTokens.set(tk, { baseVal: norm(s.pair.value), baseSel: s.baseSel, prop: s.prop, file: s.pair.file, line: s.pair.line });
    }
    const pt = pairTokens.get(tk);
    const v = norm(s.value);
    if (s.ctx === 'light') {
      if (pt.lightVal !== undefined && pt.lightVal !== v) { console.error(`[CONFLICT] light 値不一致 ${tk}: ${pt.lightVal} vs ${v}`); process.exit(1); }
      pt.lightVal = v;
    } else {
      if (pt.darkVal !== undefined && pt.darkVal !== v) { console.error(`[CONFLICT] dark 値不一致 ${tk}: ${pt.darkVal} vs ${v}`); process.exit(1); }
      pt.darkVal = v;
    }
  }
}

// retoken 判定: base 値が 1-of-1 token への単独 var() 参照 (base files 内 唯一使用) なら
// 新 token chain でなく既存 token の root default を dark 値に書換え (base/light block 無変更)
const { filesOfLayer, pathOf } = require('./css-files.cjs');
const baseCss = [...filesOfLayer('base'), ...filesOfLayer('components'), ...filesOfLayer('modals'), ...filesOfLayer('responsive')]
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
const lightCss = fs.readFileSync(pathOf('light'), 'utf8');
function retokenName(pt) {
  if (pt.lightVal !== undefined) return null; // light 側 entry あり = light 値変更要 → 通常 token
  const m = pt.baseVal.match(/^var\((--c-[\w-]+)\)$/);
  if (!m) return null;
  const esc = m[1].replace(/[-]/g, '\\-');
  const uses = (baseCss.match(new RegExp(`var\\(\\s*${esc}\\s*[),]`, 'g')) || []).length;
  if (uses !== 1) return null;
  // light block に light 定義必須 (無いと root default 書換えが light 表示を道連れ)
  if (!new RegExp(`^\\s*${esc}\\s*:`, 'm').test(lightCss)) return null;
  return m[1];
}
// S2-h retokenLight 判定 (retoken の light 版): light 側 entry のみ ∧ base 値 = 1-of-1 token 単独参照
// → light token block の定義追加 or 既存 light 定義の書換えだけで完結 (root/base 無変更、 新 token chain 回避)。
// 既存 light 定義がある場合 = theme decl が唯一の消費点を常時 shadow していた stale 値 → rewrite。
// slug 衝突 (--c-modal-a-kongfu-select-fg 循環参照 plan 事故 2026-06-06) の根治でもある
const tokenFilesCss = [pathOf('tokens'), pathOf('dark')].map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\n' + lightCss;
function retokenLightName(pt) {
  if (pt.darkVal !== undefined || pt.lightVal === undefined) return null;
  const m = pt.baseVal.match(/^var\((--c-[\w-]+)\)$/);
  if (!m) return null;
  const esc = m[1].replace(/[-]/g, '\\-');
  const uses = (baseCss.match(new RegExp(`var\\(\\s*${esc}\\s*[),]`, 'g')) || []).length;
  if (uses !== 1) return null;
  // token def chain (他 token 定義の値) からの参照があると書換えが波及 → 不可
  const chainRefs = (tokenFilesCss.match(new RegExp(`var\\(\\s*${esc}\\s*[),]`, 'g')) || []).length;
  if (chainRefs !== 0) return null;
  const rewrite = new RegExp(`^\\s*${esc}\\s*:`, 'm').test(lightCss);
  return { name: m[1], rewrite };
}

// groups 生成 (apply 互換 format)
const groups = [];
const nameCount = new Map();
for (const [tk, pt] of pairTokens) {
  const dark = pt.darkVal !== undefined ? pt.darkVal : pt.baseVal;
  const light = pt.lightVal !== undefined ? pt.lightVal : pt.baseVal;
  const re = retokenName(pt);
  if (re) {
    groups.push({ retoken: re, dark, note: `S2-e: dark 側 override 吸収 (${pt.baseSel} { ${pt.prop} })` });
    continue;
  }
  const reL = retokenLightName(pt);
  if (reL) {
    groups.push({ retokenLight: reL.name, rewrite: reL.rewrite, light, note: `S2-h: light 側 override 吸収 (${pt.baseSel} { ${pt.prop} })` });
    continue;
  }
  const propSlug = PROP_SLUG[pt.prop] || pt.prop;
  let token = `--c-${selSlug(pt.baseSel)}-${propSlug}`;
  token = RENAME[token] || token;
  const n = (nameCount.get(token) || 0) + 1;
  nameCount.set(token, n);
  if (n > 1) token = `${token}-${n}`;
  token = RENAME[token] || token; // -2 suffix 後の rename も許容
  groups.push({
    token, dark,
    light: light === dark ? undefined : light, // 同値なら light block 省略
    decls: [{ baseFile: pt.file, baseLine: pt.line, prop: pt.prop, lightFile: null, lightLine: null, baseSel: pt.baseSel }],
  });
}
// 削除 group (theme decl 物理行)
for (const del of deletes) {
  groups.push({
    deleteOnly: true,
    note: del.sameValue ? 'same-value' : undefined,
    decls: [{ lightFile: del.file, lightLine: del.line, prop: del.prop, baseFile: null, baseLine: null, baseSel: del.label }],
  });
}

fs.writeFileSync('scripts/.theme-swap-plan-s2e.json', JSON.stringify(groups, null, 1));
const tok = groups.filter(g => !g.deleteOnly);
console.log(`plan: token ${tok.length} / delete ${groups.length - tok.length} → scripts/.theme-swap-plan-s2e.json`);
for (const g of groups) {
  if (g.retokenLight) console.log(`[RETOKEN-L${g.rewrite ? '/rewrite' : ''}] ${g.retokenLight} light ${g.rewrite ? '→' : '+='} ${g.light}    (${g.note})`);
  else if (g.retoken) console.log(`[RETOKEN] ${g.retoken} root default → ${g.dark}    (${g.note})`);
  else if (g.deleteOnly) console.log(`[DEL${g.note ? ' =' : ''}] ${g.decls[0].baseSel} { ${g.decls[0].prop} } @${g.decls[0].lightFile.replace('assets/styles/', '').replace('assets/styles-', '')}:${g.decls[0].lightLine}`);
  else console.log(`${g.token}\n    dark : ${g.dark}\n    light: ${g.light ?? '(= dark)'}    (${g.decls[0].baseSel} { ${g.decls[0].prop} })`);
}
