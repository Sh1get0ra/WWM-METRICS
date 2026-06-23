#!/usr/bin/env node
// wdb 心法 detail page Tier 1-6 完全 fetch
// Usage:
//   node scripts/wwmdb-fetch-iw-detail.cjs 601 602 603 604
//   node scripts/wwmdb-fetch-iw-detail.cjs --all   (inner-ways.json 全件 — 重い)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const all = argv.includes('--all');
const ids = all
  ? (() => {
      const list = require('../.claude/research/wwmdb/inner-ways.json').innerWays.map(w => w.id);
      return list;
    })()
  : argv.filter(a => /^\d+$/.test(a));

if (!ids.length) {
  console.error('No IDs given.');
  process.exit(1);
}

const OUT = path.join(__dirname, '..', '.claude', 'research', 'wwmdb');
const OUT_FILE = path.join(OUT, all ? 'inner-ways-tiered.json' : `inner-ways-tiered-${ids.join('_')}.json`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const results = { fetchedAt: new Date().toISOString(), dataVersion: null, innerWays: [] };

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const page = await ctx.newPage();
    try {
      await page.goto(`https://wwmdb.vlt.fyi/inner-ways/${id}`, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(800);
      if (!results.dataVersion) {
        results.dataVersion = await page.evaluate(() => {
          const m = document.body.innerText.match(/data version:\s*([^\s]+)/i);
          return m ? m[1] : null;
        });
      }
      const meta = await page.evaluate(() => {
        const text = document.body.innerText;
        const nameM = text.split('\n').find(l => l.trim() && !/^(wwmdb|world levels|seasons|recipes|inner ways|equip items|leaderboards|live|game builds)$/i.test(l.trim())) || '';
        const pathM = text.match(/Path:\s*(.+)/);
        const weaponM = text.match(/Weapon:\s*(.+)/);
        const effM = text.match(/Effect types:\s*(.+)/);
        const wlM = text.match(/World level:\s*(\d+)/);
        const passive1M = text.match(/Passive skill:\s*\[(\d+)\]/);
        return {
          name: nameM.trim(),
          path: pathM ? pathM[1].trim() : null,
          weapon: weaponM ? weaponM[1].trim() : null,
          effectTypes: effM ? effM[1].trim() : null,
          unlockWorldLevel: wlM ? Number(wlM[1]) : null,
          firstPassiveId: passive1M ? Number(passive1M[1]) : null,
        };
      });
      // hidden DIV から WorldLv 別 stat 値抽出 (2026-06-23 拡張 = T2 マスタ用)
      // 各 hidden DIV = T2-T6 累積効果 (同値)、 最後 (最大 len = T6) から全 stat 取得
      const attrsByWl = await page.evaluate(() => {
        const candidates = [];
        document.querySelectorAll('div').forEach(el => {
          const cs = getComputedStyle(el);
          if (cs.display !== 'none' && cs.visibility !== 'hidden') return;
          const t = el.innerText || el.textContent || '';
          if (/Attributes:/.test(t)) candidates.push(t);
        });
        if (!candidates.length) return null;
        const text = candidates.reduce((a, b) => a.length >= b.length ? a : b);  // 最大 len = T6 累積
        const attrM = text.match(/Attributes:([\s\S]+?)(?:copyright|$)/);
        if (!attrM) return null;
        const reAll = /([A-Z][A-Za-z\s]+?)\s*\(world level:\s*(\d+)\):([\d.]+)/g;
        const byStat = {};
        let m;
        while ((m = reAll.exec(attrM[1])) !== null) {
          const stat = m[1].trim();
          const wl = Number(m[2]);
          const v = parseFloat(m[3]);
          (byStat[stat] = byStat[stat] || {})[wl] = v;
        }
        return byStat;
      });

      const tiers = {};
      for (let t = 1; t <= 6; t++) {
        try {
          await page.locator(`button:has-text("Tier ${t}")`).first().click({ timeout: 3000 });
          await page.waitForTimeout(400);
          const tierData = await page.evaluate(() => {
            const text = document.body.innerText;
            // Tier 6 ボタン行の直後 → 「Passive skill:」 / 「Cost:」 / 「World level:」 の前
            const m = text.match(/Tier 6\s*\n([\s\S]*?)(?:Passive skill:|Cost:|World level:|copyright)/i);
            const content = m ? m[1].trim() : '';
            // 2 行 split: base passive (cumulative) と effect (per-tier)
            const lines = content.split(/\n+/).map(s => s.trim()).filter(Boolean);
            // 1 行目 = base passive 累積、 2 行目 (最後) = 当 tier 固有効果
            const base = lines.length ? lines.slice(0, lines.length - 1).join(' ') : '';
            const tierEffect = lines.length >= 2 ? lines[lines.length - 1] : (lines[0] || '');
            const passiveM = text.match(/Tier 6[\s\S]*?Passive skill:\s*\[(\d+)\]\s*([^\n]+)/);
            return {
              content,
              base,
              tierEffect,
              passiveId: passiveM ? Number(passiveM[1]) : null,
            };
          });
          tiers[`tier${t}`] = tierData;
        } catch (e) {
          tiers[`tier${t}`] = { _err: e.message.slice(0, 100) };
        }
      }
      results.innerWays.push({ id, ...meta, tiers, attrsByWl });
      console.log(`[${i + 1}/${ids.length}] ${id} ${meta.name} ✓`);
    } catch (e) {
      results.innerWays.push({ id, _err: e.message });
      console.log(`[${i + 1}/${ids.length}] ${id} ✗ ${e.message.slice(0, 80)}`);
    } finally {
      await page.close();
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nDone -> ${OUT_FILE}`);
  await browser.close();
})();
