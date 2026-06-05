#!/usr/bin/env node
// VRT compare: baseline vs current の pixel diff
//
// env:
//   VRT_THRESHOLD   = FAIL 判定 pixel diff 比率 (% 単位、 default 0.1)
//   VRT_PX_THRESHOLD = pixelmatch の per-pixel color threshold (0..1、 default 0.1)
//
// 出力:
//   .vrt/diff/*.png  — FAIL ファイルのみ (赤 highlight)
//   .vrt/report.html — 全 file 一覧 (PASS/FAIL/MISSING/SIZE_MISMATCH)
//   stdout: summary

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(process.cwd(), '.vrt');
const BASELINE = path.join(ROOT, 'baseline');
const CURRENT  = path.join(ROOT, 'current');
const DIFF     = path.join(ROOT, 'diff');
const REPORT   = path.join(ROOT, 'report.html');

const THRESHOLD_PCT = parseFloat(process.env.VRT_THRESHOLD || '0.1');
const PX_THRESHOLD  = parseFloat(process.env.VRT_PX_THRESHOLD || '0.1');

function loadPng(p) {
  return PNG.sync.read(fs.readFileSync(p));
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function buildReport(results, summary) {
  const rows = results.map(r => {
    const cls = r.status.toLowerCase();
    const pct = r.diffPct === null ? '-' : r.diffPct.toFixed(4) + '%';
    const baseImg = `<img src="baseline/${escape(r.file)}" loading="lazy">`;
    const curImg  = `<img src="current/${escape(r.file)}" loading="lazy">`;
    const diffImg = r.status === 'FAIL' ? `<img src="diff/${escape(r.file)}" loading="lazy">` : '<span class="na">-</span>';
    return `<tr class="row-${cls}">
  <td class="status ${cls}">${r.status}</td>
  <td class="file">${escape(r.file)}</td>
  <td class="pct">${pct}</td>
  <td class="img">${baseImg}</td>
  <td class="img">${curImg}</td>
  <td class="img">${diffImg}</td>
</tr>`;
  }).join('\n');

  return `<!doctype html><meta charset="utf-8">
<title>VRT Report</title>
<style>
  body { font: 13px/1.5 system-ui, sans-serif; margin: 16px; background: #1a1a1a; color: #ddd; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .summary { display: flex; gap: 16px; margin: 0 0 16px; padding: 12px; background: #2a2a2a; border-radius: 6px; }
  .summary .item { font-size: 14px; }
  .summary .pass { color: #6f6; }
  .summary .fail { color: #f66; }
  .summary .other { color: #fa6; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #333; }
  th { background: #2a2a2a; position: sticky; top: 0; }
  .status { font-weight: bold; }
  .status.pass { color: #6f6; }
  .status.fail { color: #f66; }
  .status.missing, .status.size_mismatch { color: #fa6; }
  .pct { font-family: monospace; text-align: right; }
  .img img { max-width: 280px; max-height: 200px; border: 1px solid #444; }
  .na { color: #555; }
  .row-pass { opacity: 0.5; }
  tr:hover { background: #252525; }
  tr:hover.row-pass { opacity: 1; }
</style>
<h1>VRT Report</h1>
<div class="summary">
  <div class="item pass">PASS ${summary.pass}</div>
  <div class="item fail">FAIL ${summary.fail}</div>
  <div class="item other">MISSING ${summary.missing}</div>
  <div class="item other">SIZE_MISMATCH ${summary.sizeMismatch}</div>
  <div class="item">threshold: ${THRESHOLD_PCT}% (px threshold: ${PX_THRESHOLD})</div>
  <div class="item">generated: ${new Date().toISOString()}</div>
</div>
<table>
  <thead><tr>
    <th>status</th><th>file</th><th>diff%</th>
    <th>baseline</th><th>current</th><th>diff</th>
  </tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}

(async () => {
  if (!fs.existsSync(BASELINE)) {
    console.error(`[ERROR] baseline not found: ${BASELINE}`);
    console.error(`        まず 'npm run vrt:baseline' 実行`);
    process.exit(1);
  }
  if (!fs.existsSync(CURRENT)) {
    console.error(`[ERROR] current not found: ${CURRENT}`);
    console.error(`        'npm run vrt:snap' 実行`);
    process.exit(1);
  }

  const pixelmatch = (await import('pixelmatch')).default;

  if (fs.existsSync(DIFF)) fs.rmSync(DIFF, { recursive: true });
  fs.mkdirSync(DIFF, { recursive: true });

  const files = fs.readdirSync(BASELINE).filter(f => f.endsWith('.png')).sort();
  const results = [];
  const summary = { pass: 0, fail: 0, missing: 0, sizeMismatch: 0 };

  for (const f of files) {
    const bPath = path.join(BASELINE, f);
    const cPath = path.join(CURRENT, f);

    if (!fs.existsSync(cPath)) {
      results.push({ file: f, status: 'MISSING', diffPct: null });
      summary.missing++;
      continue;
    }

    const b = loadPng(bPath);
    const c = loadPng(cPath);

    if (b.width !== c.width || b.height !== c.height) {
      results.push({
        file: f, status: 'SIZE_MISMATCH', diffPct: null,
        note: `${b.width}x${b.height} vs ${c.width}x${c.height}`
      });
      summary.sizeMismatch++;
      continue;
    }

    const diff = new PNG({ width: b.width, height: b.height });
    const numDiff = pixelmatch(b.data, c.data, diff.data, b.width, b.height, {
      threshold: PX_THRESHOLD,
      includeAA: false,
      alpha: 0.3,
      diffColor: [255, 0, 0]
    });
    const totalPx = b.width * b.height;
    const diffPct = (numDiff / totalPx) * 100;
    const status = diffPct > THRESHOLD_PCT ? 'FAIL' : 'PASS';

    if (status === 'FAIL') {
      fs.writeFileSync(path.join(DIFF, f), PNG.sync.write(diff));
      summary.fail++;
    } else {
      summary.pass++;
    }
    results.push({ file: f, status, diffPct });
  }

  // current のみ存在 = baseline 未登録の新規 scene 検出
  const currentFiles = fs.readdirSync(CURRENT).filter(f => f.endsWith('.png'));
  for (const f of currentFiles) {
    if (!files.includes(f)) {
      results.push({ file: f, status: 'NEW_IN_CURRENT', diffPct: null });
    }
  }

  // report 出力
  fs.writeFileSync(REPORT, buildReport(results, summary));

  // stdout summary
  console.log('');
  console.log(`PASS         ${summary.pass}`);
  console.log(`FAIL         ${summary.fail}`);
  console.log(`MISSING      ${summary.missing}`);
  console.log(`SIZE_MISMATCH ${summary.sizeMismatch}`);
  console.log('');
  console.log(`report: ${REPORT}`);

  // FAIL list
  if (summary.fail > 0) {
    console.log('');
    console.log('FAIL files:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ${r.diffPct.toFixed(4)}%  ${r.file}`);
    });
  }

  process.exit(summary.fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
