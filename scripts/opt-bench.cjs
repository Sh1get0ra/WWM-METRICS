// 装備最適化 perf ベンチ + steps/best snapshot + dead-key 寄与ゼロ検証 (playwright)
// usage: node scripts/opt-bench.cjs [--save baseline|after] [--compare]
//   --save baseline : 現コードの steps/best/時間を tests/fixtures/opt-bench-baseline.json に保存
//   --compare       : baseline と steps/best/summary バイナリ一致検証 + 時間比較
// fixture: tests/fixtures/opt-bench-roleinfo.json (合成 roleInfo、全10slot + 弓セット + 防具4種51候補級)
// opt.js / stats.js の最適化ロジック変更時は --compare で結果同一性を必ず確認すること
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 18923;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'opt-bench-roleinfo.json'), 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('wwm_lang', 'ja');
    localStorage.setItem('wwm_opt_min_delta_v1', '5');
    localStorage.setItem('wwm_opt_sort_v1', 'default');
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.WWM_DS && window.WWMStats && window.WWMSidebar?.opt, null, { timeout: 30000 });
  page.setDefaultTimeout(180000);

  const result = await page.evaluate(async (fx) => {
    await window.WWM_DS.ready();
    const out = { runs: [], unit: {}, deadKeyCheck: null };

    // ── dead key 検証: judge=false の全 statKey が寄与恒等0 (val 0→max で score 不変) ──
    if (window.WWMStats.buildAffixAliveJudge && window.WWMStats.buildStatParamsSync) {
      const judge = window.WWMStats.buildAffixAliveJudge(fx);
      const allKeys = [...new Set(Object.values(window.WWM_AFFIX || {}).map(v => v?.statKey).filter(Boolean))];
      const deadKeys = allKeys.filter(k => !judge(k));
      const aliveKeys = allKeys.filter(k => judge(k));
      const skToId = {};
      for (const [id, v] of Object.entries(window.WWM_AFFIX || {})) {
        if (v?.statKey && !skToId[v.statKey]) skToId[v.statKey] = parseInt(id, 10);
      }
      const failures = [];
      const scoreOf = (ri) => {
        const p = window.WWMStats.buildStatParamsSync(ri, null);
        const res = window.computeExpected(p);
        return res.statusScore;
      };
      for (const dk of deadKeys) {
        const ri = JSON.parse(JSON.stringify(fx));
        const d = ri.wearEquipsDetailed['3'].exVo.baseAffixes[1].equipmentDetails;
        d[0] = skToId[dk];
        d[2] = 0.94; d[3] = 2;
        d[1] = 0;
        const s0 = scoreOf(ri);
        d[1] = 99999;
        const s1 = scoreOf(ri);
        if (Math.abs(s1 - s0) > 1e-9) failures.push({ key: dk, s0, s1 });
      }
      out.deadKeyCheck = { deadCount: deadKeys.length, aliveCount: aliveKeys.length, deadKeys, failures };
    }

    // ── 単価計測 ─────────────────────────────
    const w0 = JSON.parse(JSON.stringify(fx));
    // clone 単価
    {
      const N = 300;
      const t = performance.now();
      for (let i = 0; i < N; i++) JSON.parse(JSON.stringify(w0));
      out.unit.cloneMs = (performance.now() - t) / N;
    }
    // buildStatParams 単価
    {
      const N = 100;
      const t = performance.now();
      for (let i = 0; i < N; i++) await window.WWMStats.buildStatParams(w0, null);
      out.unit.buildMs = (performance.now() - t) / N;
    }
    // computeExpected 単価
    {
      const p0 = await window.WWMStats.buildStatParams(w0, null);
      const N = 1000;
      const t = performance.now();
      for (let i = 0; i < N; i++) window.computeExpected(Object.assign({}, p0));
      out.unit.computeMs = (performance.now() - t) / N;
    }

    // ── opt 実行 (2 run: cold + warm) ─────────
    for (let run = 0; run < 2; run++) {
      WWMState.opt.locked = false;
      WWMState.opt.best = null;
      WWMState.roleInfo = fx;
      const params = await window.WWMStats.buildStatParams(fx, null);
      window.computeExpected(params);
      WWMState.params = params;
      const t0 = performance.now();
      await window.WWMSidebar.opt.render(fx, params);
      const t1 = performance.now();
      const rows = Array.from(document.querySelectorAll('#wwmOptimization .wwm-opt-row'))
        .map(r => r.textContent.replace(/\s+/g, ' ').trim());
      const summary = document.querySelector('#wwmOptimization .wwm-opt-summary')?.textContent.replace(/\s+/g, ' ').trim() || '';
      out.runs.push({ ms: Math.round(t1 - t0), stepCount: rows.length, summary, best: WWMState.opt.best?.end ?? null, rows });
    }
    return out;
  }, fixture);

  await browser.close();
  server.close();

  console.log('=== unit cost ===');
  console.log(`clone:  ${result.unit.cloneMs.toFixed(3)} ms`);
  console.log(`build:  ${result.unit.buildMs.toFixed(3)} ms`);
  console.log(`compute:${result.unit.computeMs.toFixed(4)} ms`);
  if (result.deadKeyCheck) {
    const dc = result.deadKeyCheck;
    console.log(`=== dead key check === dead=${dc.deadCount} alive=${dc.aliveCount} failures=${dc.failures.length}`);
    console.log('dead keys:', dc.deadKeys.join(', '));
    if (dc.failures.length) console.log('FAILURES:', JSON.stringify(dc.failures));
  }
  console.log('=== opt runs ===');
  for (const r of result.runs) console.log(`${r.ms} ms | steps=${r.stepCount} | best=${r.best} | ${r.summary}`);
  console.log('=== console errors ===', errors.length ? errors : 'none');

  let failed = errors.length > 0 || (result.deadKeyCheck && result.deadKeyCheck.failures.length > 0);
  const saveArg = process.argv.indexOf('--save');
  if (saveArg >= 0) {
    const name = process.argv[saveArg + 1] || 'baseline';
    const fp = path.join(ROOT, 'tests', 'fixtures', `opt-bench-${name}.json`);
    fs.writeFileSync(fp, JSON.stringify({ unit: result.unit, run: result.runs[1] }, null, 2));
    console.log('saved:', fp);
  }
  // baseline 比較 (steps/best/summary バイナリ一致)
  if (process.argv.includes('--compare')) {
    const basePath = path.join(ROOT, 'tests', 'fixtures', 'opt-bench-baseline.json');
    const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    const after = result.runs[1];
    const same = base.run.best === after.best
      && base.run.summary === after.summary
      && base.run.stepCount === after.stepCount
      && JSON.stringify(base.run.rows) === JSON.stringify(after.rows);
    console.log('=== compare vs baseline ===', same ? 'IDENTICAL ✓' : 'MISMATCH ✗');
    if (!same) {
      console.log('base :', base.run.stepCount, base.run.best, base.run.summary);
      console.log('after:', after.stepCount, after.best, after.summary);
      for (let i = 0; i < Math.max(base.run.rows.length, after.rows.length); i++) {
        if (base.run.rows[i] !== after.rows[i]) {
          console.log(`row[${i}] base : ${base.run.rows[i]}`);
          console.log(`row[${i}] after: ${after.rows[i]}`);
        }
      }
      failed = true;
    }
    console.log(`time: baseline ${base.run.ms} ms → after ${after.ms} ms (${(base.run.ms / after.ms).toFixed(1)}x)`);
  }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
