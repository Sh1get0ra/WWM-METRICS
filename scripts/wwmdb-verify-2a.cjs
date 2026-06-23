#!/usr/bin/env node
// 2A sprint 動作確認: 601-604 心法 + 56/57 セット が data-store 経由で読まれるか
// dev server (localhost:8000) 経由でないと意味ない (build cache 反映後)。 server 不在時 = ローカル data 直 parse で OK 判定
const fs = require('fs');
const path = require('path');

function ok(msg) { console.log('  ✓ ' + msg); }
function fail(msg) { console.log('  ✗ ' + msg); process.exitCode = 1; }

// 1. xinfa.json 601-604 entry 存在
{
  console.log('[xinfa.json]');
  const x = require(path.join(__dirname, '..', 'data', 'xinfa.json'));
  for (const id of ['601', '602', '603', '604']) {
    if (!x[id]) { fail(id + ' entry missing'); continue; }
    if (!x[id].attributeBuff?.tier5) { fail(id + ' tier5 missing'); continue; }
    if (!x[id].rank) { fail(id + ' rank missing'); continue; }
    ok(`${id} ${x[id].rank} T5=${JSON.stringify(x[id].attributeBuff.tier5.effects)}`);
  }
}
// 2. i18n/xinfa.json 601-604 en 確定
{
  console.log('\n[i18n/xinfa.json]');
  const x = require(path.join(__dirname, '..', 'data', 'i18n', 'xinfa.json'));
  for (const id of ['601', '602', '603', '604']) {
    if (!x[id]?.en) { fail(id + ' en missing'); continue; }
    ok(`${id} en=${x[id].en} (ja/zh/ko/vi 空=B 案、 7月実装当日 patch 必要)`);
  }
}
// 3. sets.json 56/57 entry
{
  console.log('\n[sets.json]');
  const s = require(path.join(__dirname, '..', 'data', 'sets.json'));
  if (s.weaponSets['56']) ok('56 weaponSets pieces2=' + JSON.stringify(s.weaponSets['56'].pieces2.effects));
  else fail('56 missing');
  if (s.defensiveSets['57']) ok('57 defensiveSets (label only)');
  else fail('57 missing');
}
// 4. i18n/sets.json 56/57
{
  console.log('\n[i18n/sets.json]');
  const s = require(path.join(__dirname, '..', 'data', 'i18n', 'sets.json'));
  for (const id of ['56', '57']) {
    if (!s[id]?.en) { fail(id + ' en missing'); continue; }
    ok(`${id} en=${s[id].en}`);
  }
}
// 5. affix.json 9293036 gauntletDmg
{
  console.log('\n[affix.json]');
  const a = require(path.join(__dirname, '..', 'data', 'affix.json'));
  if (a['9293036']?.statKey === 'gauntletDmg') ok('9293036 gauntletDmg internal=' + a['9293036'].internal + ' (= 0 暫定、 7月実装当日 scout 要)');
  else fail('9293036 missing or wrong statKey');
}
// 6. calc.js SCORE_VERSION bump
{
  console.log('\n[calc.js SCORE_VERSION]');
  const c = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'calc.js'), 'utf8');
  const m = c.match(/WWM_SCORE_VERSION\s*=\s*(\d+)/);
  if (!m) fail('SCORE_VERSION not found');
  else if (Number(m[1]) >= 14) ok('SCORE_VERSION=' + m[1] + ' (bumped)');
  else fail('SCORE_VERSION=' + m[1] + ' (bump 必要、 13 → 14)');
}

// 7. dev server 到達 check
(async () => {
  console.log('\n[dev server (localhost:8000) 到達 check]');
  try {
    const http = require('http');
    await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:8000/', { timeout: 2000 }, res => {
        ok('dev server 起動中 (status=' + res.statusCode + ')');
        res.resume();
        resolve();
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
    // playwright で 実機確認
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('http://localhost:8000/?cb=' + Date.now(), { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    const hasXinfa = await page.evaluate(() => !!(window.WWM_XINFA && window.WWM_XINFA['601']));
    const hasSets = await page.evaluate(() => !!(window.WWM_SETS && (window.WWM_SETS.weaponSets || window.WWM_SETS)['56']));
    const hasAffix = await page.evaluate(() => !!(window.WWM_AFFIX && window.WWM_AFFIX['9293036']));
    if (hasXinfa) ok('window.WWM_XINFA[601] hit');
    else fail('window.WWM_XINFA[601] miss');
    if (hasSets) ok('window.WWM_SETS[56] hit');
    else fail('window.WWM_SETS[56] miss');
    if (hasAffix) ok('window.WWM_AFFIX[9293036] hit');
    else fail('window.WWM_AFFIX[9293036] miss');
    if (errors.length) {
      console.log('\nconsole errors:');
      errors.slice(0, 5).forEach(e => console.log('  ' + e.slice(0, 200)));
    }
    await browser.close();
  } catch (e) {
    console.log('  (dev server 不可: ' + e.message.slice(0, 80) + ') → 兄貴 npm run dev で 8000 起動後 再実行');
  }
})();
