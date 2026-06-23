#!/usr/bin/env node
// wwmdb 4 page 完全 fetch → JSON snapshot
// Usage:
//   node scripts/wwmdb-fetch.cjs              # 全 page (sets/inner-ways/world-levels/equip-items filter)
//   node scripts/wwmdb-fetch.cjs --only=sets  # 指定 page のみ
//   node scripts/wwmdb-fetch.cjs --equip-level=91 --equip-tier=5  # equip filter
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const argMap = Object.fromEntries(argv.map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const only = argMap.only ? String(argMap.only).split(',') : null;
const eqLv = argMap['equip-level'] ? Number(argMap['equip-level']) : 91;
const eqTier = argMap['equip-tier'] ? Number(argMap['equip-tier']) : null; // null = all
const eqLimit = argMap['equip-limit'] ? Number(argMap['equip-limit']) : 0; // 0 = unlimited

const OUT = path.join(__dirname, '..', '.claude', 'research', 'wwmdb');
fs.mkdirSync(OUT, { recursive: true });

const want = (key) => !only || only.includes(key);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const meta = { fetchedAt: new Date().toISOString(), dataVersion: null };

  // ========== world-levels ==========
  if (want('world-levels')) {
    console.log('[world-levels]');
    const page = await ctx.newPage();
    await page.goto('https://wwmdb.vlt.fyi/world-levels', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const dv = await getDataVersion(page); meta.dataVersion = dv;
    const rows = await page.evaluate(() => {
      const t = document.querySelector('table'); if (!t) return [];
      return [...t.rows].slice(1).map(r => [...r.cells].map(c => c.textContent.trim()));
    });
    const parsed = rows.map(r => {
      const attr = r[4] || '';
      const precision = (attr.match(/Precision Rate:\s*\+?([\d.]+)%/) || [])[1];
      const fiveAttr = (attr.match(/All Five Attributes:\s*\+?(\d+)/) || [])[1];
      return {
        id: Number(r[0]),
        name: r[1],
        levelLimit: Number(r[2]),
        energy: Number(r[3]),
        precisionPct: precision ? Number(precision) : null,
        allFiveAttributes: fiveAttr ? Number(fiveAttr) : null,
        rewards: r[5],
        _raw: attr,
      };
    });
    write('world-levels.json', { ...meta, rows: parsed });
    console.log(`  rows=${parsed.length}`);
    await page.close();
  }

  // ========== sets ==========
  if (want('sets')) {
    console.log('[sets]');
    const page = await ctx.newPage();
    await page.goto('https://wwmdb.vlt.fyi/sets', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const dv = await getDataVersion(page); meta.dataVersion = dv;
    const list = await page.evaluate(() => {
      const t = document.querySelector('table'); if (!t) return [];
      return [...t.rows].slice(1).map(r => {
        const link = r.cells[1] ? r.cells[1].querySelector('a') : null;
        return {
          id: r.cells[0] ? r.cells[0].textContent.trim() : null,
          name: r.cells[1] ? r.cells[1].textContent.trim() : null,
          type: r.cells[2] ? r.cells[2].textContent.trim() : null,
          href: link ? link.getAttribute('href') : null,
        };
      });
    });
    await page.close();
    console.log(`  list=${list.length}`);
    const details = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.id) continue;
      const p = await ctx.newPage();
      try {
        await p.goto(`https://wwmdb.vlt.fyi/sets/${s.id}`, { waitUntil: 'networkidle', timeout: 25000 });
        await p.waitForTimeout(300);
        const data = await p.evaluate(() => {
          const text = document.body.innerText;
          return { text };
        });
        details.push({ ...s, ...parseSetDetail(data.text) });
      } catch (e) {
        details.push({ ...s, _err: e.message });
      } finally { await p.close(); }
      if ((i + 1) % 10 === 0) console.log(`  [${i + 1}/${list.length}]`);
    }
    write('sets.json', { ...meta, sets: details });
    console.log(`  detail=${details.length}`);
  }

  // ========== inner-ways ==========
  if (want('inner-ways')) {
    console.log('[inner-ways]');
    const page = await ctx.newPage();
    await page.goto('https://wwmdb.vlt.fyi/inner-ways', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const dv = await getDataVersion(page); meta.dataVersion = dv;
    const list = await page.evaluate(() => {
      const t = document.querySelector('table'); if (!t) return [];
      return [...t.rows].slice(1).map(r => ({
        id: r.cells[0] ? r.cells[0].textContent.trim() : null,
        name: r.cells[1] ? r.cells[1].textContent.trim() : null,
        effectTypes: r.cells[2] ? r.cells[2].textContent.trim() : null,
        path: r.cells[3] ? r.cells[3].textContent.trim() : null,
        weapon: r.cells[4] ? r.cells[4].textContent.trim() : null,
      }));
    });
    await page.close();
    console.log(`  list=${list.length}`);
    const details = [];
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      if (!x.id) continue;
      const p = await ctx.newPage();
      try {
        await p.goto(`https://wwmdb.vlt.fyi/inner-ways/${x.id}`, { waitUntil: 'networkidle', timeout: 25000 });
        await p.waitForTimeout(300);
        const data = await p.evaluate(() => ({ text: document.body.innerText }));
        details.push({ ...x, ...parseInnerWayDetail(data.text) });
      } catch (e) {
        details.push({ ...x, _err: e.message });
      } finally { await p.close(); }
      if ((i + 1) % 10 === 0) console.log(`  [${i + 1}/${list.length}]`);
    }
    write('inner-ways.json', { ...meta, innerWays: details });
    console.log(`  detail=${details.length}`);
  }

  // ========== equip-items ==========
  if (want('equip-items')) {
    console.log(`[equip-items] level=${eqLv} tier=${eqTier ?? 'all'} limit=${eqLimit || 'none'}`);
    const filter = `?level=${eqLv}${eqTier ? `&tier=${eqTier}` : ''}`;
    const page = await ctx.newPage();
    await page.goto(`https://wwmdb.vlt.fyi/equip-items${filter}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const dv = await getDataVersion(page); meta.dataVersion = dv;
    let list = await page.evaluate(() => {
      const t = document.querySelector('table'); if (!t) return [];
      return [...t.rows].slice(1).map(r => ({
        id: r.cells[0] ? r.cells[0].textContent.trim() : null,
        name: r.cells[1] ? r.cells[1].textContent.trim() : null,
        level: r.cells[2] ? Number(r.cells[2].textContent.trim()) : null,
      }));
    });
    await page.close();
    if (eqLimit > 0) list = list.slice(0, eqLimit);
    console.log(`  list=${list.length}`);
    const details = [];
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      if (!x.id) continue;
      const p = await ctx.newPage();
      try {
        await p.goto(`https://wwmdb.vlt.fyi/equip-items/${x.id}`, { waitUntil: 'networkidle', timeout: 25000 });
        await p.waitForTimeout(300);
        const data = await p.evaluate(() => {
          const text = document.body.innerText;
          const tables = [...document.querySelectorAll('table')].map(t => ({
            headers: t.rows[0] ? [...t.rows[0].cells].map(c => c.textContent.trim()) : [],
            rows: [...t.rows].slice(1).map(r => [...r.cells].map(c => c.textContent.trim())),
          }));
          return { text, tables };
        });
        details.push({ ...x, ...parseEquipDetail(data) });
      } catch (e) {
        details.push({ ...x, _err: e.message });
      } finally { await p.close(); }
      if ((i + 1) % 20 === 0) console.log(`  [${i + 1}/${list.length}]`);
    }
    write(`equip-items-lv${eqLv}${eqTier ? `-t${eqTier}` : ''}.json`, { ...meta, equipItems: details });
    console.log(`  detail=${details.length}`);
  }

  await browser.close();
  console.log('\nDone.');
})();

async function getDataVersion(page) {
  return await page.evaluate(() => {
    const m = document.body.innerText.match(/data version:\s*([^\s]+)/i);
    return m ? m[1] : null;
  });
}

function write(name, obj) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  console.log(`  -> ${p}`);
}

function parseSetDetail(text) {
  // 2 pieces bonus = "Max Physical Attack" + Level N: V 行群
  const out = { recommendedPaths: [], twoPiece: null, fourPiece: null };
  const recM = text.match(/Recommended paths:\s*([\s\S]*?)\n2 pieces bonuses:/);
  if (recM) {
    out.recommendedPaths = recM[1].split('\n').map(s => s.trim()).filter(Boolean);
  }
  const twoM = text.match(/2 pieces bonuses:\s*([\s\S]*?)(?=\n4 pieces bonuses:|copyright|$)/);
  if (twoM) {
    const block = twoM[1];
    const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
    const statName = lines[0] || null;
    const lvTable = {};
    for (let i = 1; i < lines.length - 1; i++) {
      const mLv = lines[i].match(/^Level\s*(\d+):/);
      if (mLv) {
        const lv = Number(mLv[1]);
        const val = Number(lines[i + 1]);
        if (!isNaN(val)) lvTable[lv] = val;
      }
    }
    out.twoPiece = { statName, levels: lvTable };
  }
  const fourM = text.match(/4 pieces bonuses:\s*([\s\S]*?)(?=copyright|$)/);
  if (fourM) {
    out.fourPiece = { text: fourM[1].trim() };
  }
  return out;
}

function parseInnerWayDetail(text) {
  // unlock world level + 各 tier 効果は説明文内、 数値は inline
  const wlM = text.match(/World level:\s*(\d+)/i);
  const passiveM = text.match(/Passive skill:\s*\[(\d+)\]/);
  return {
    unlockWorldLevel: wlM ? Number(wlM[1]) : null,
    passiveId: passiveM ? Number(passiveM[1]) : null,
    fullText: text,
  };
}

function parseEquipDetail(data) {
  const { text, tables } = data;
  const headerLine = (text.split('\n').find(l => /Level:\s*\d+/.test(l)) || '');
  const lvM = headerLine.match(/Level:\s*(\d+)/);
  const tierM = headerLine.match(/Tier:\s*(\d+)/);
  const slot = headerLine.split(',')[0].trim();
  const attrs = {};
  const aBlock = text.match(/Attributes:\s*([\s\S]*?)(?=INITIAL AFFIX|TUNING AFFIXES|RETUNING|SETS|\Z)/);
  if (aBlock) {
    aBlock[1].split('\n').forEach(l => {
      const m = l.match(/^([^:]+):\s*([\d.]+)/);
      if (m) attrs[m[1].trim()] = Number(m[2]);
    });
  }
  // tables: 0=INITIAL, 1=TUNING, 2..=RETUNING groups, last=SETS?
  const affixTables = tables.filter(t => (t.headers[0] === 'ID') && t.headers.includes('Chance'));
  return {
    slot, level: lvM ? Number(lvM[1]) : null, tier: tierM ? Number(tierM[1]) : null,
    attributes: attrs,
    affixTables: affixTables.map(t => t.rows.map(r => ({
      id: r[0], name: r[1], value: r[2], chance: r[3],
    }))),
  };
}
