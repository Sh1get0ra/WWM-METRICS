// Tier 3 Step 3: 指定 SECTION 群を styles.css から別 file に切出
// usage: node scripts/extract-sections.cjs <out-file> <header> <section-num...>
//
// 例: node scripts/extract-sections.cjs assets/styles-modals.css 'MODALS' 11 13 18 19 23 38

const fs = require('fs');

const [outPath, header, ...nums] = process.argv.slice(2);
if (!outPath || !header || nums.length === 0) {
  console.error('Usage: node extract-sections.cjs <out-file> <header> <section-num...>');
  process.exit(1);
}

const targetNums = new Set(nums.map(n => parseInt(n)));
const cssPath = 'assets/styles.css';
const css = fs.readFileSync(cssPath, 'utf8');
const lines = css.split('\n');

// Find all SECTION block headers
// pattern: `/* ╔...╗ */\n     SECTION NN — ...\n   ╚...╝ */\n`
const sections = []; // [{ num, blockStart, bodyStart, name }]
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*SECTION\s+(\d+)\s*—\s*(.+?)\s*$/);
  if (m && lines[i - 1] && lines[i - 1].startsWith('/* ╔')) {
    sections.push({
      num: parseInt(m[1]),
      blockStart: i - 1,            // `/* ╔...` line
      bodyStart: i + 2,             // 直後 `   ╚...╝ */` の次
      name: m[2],
    });
  }
}

// Determine each target section's block range: blockStart -> (next section's blockStart - 1)
const targets = [];
for (let i = 0; i < sections.length; i++) {
  const s = sections[i];
  if (!targetNums.has(s.num)) continue;
  const next = sections[i + 1];
  const endLine = next ? next.blockStart - 1 : lines.length - 1;
  targets.push({ ...s, endLine });
}

if (targets.length === 0) {
  console.error('No matching sections found.');
  process.exit(1);
}

// Build new file content (preserve section order)
const banner = `/* ╔═══════════════════════════════════════════════════════════════════╗
     ${header} — 集約 (Tier 3 Step 3)
     styles.css から切出。 cascade: tokens → animations → ... → styles → dark → light
   ╚═══════════════════════════════════════════════════════════════════╝ */

`;
const blocks = targets.map(t => lines.slice(t.blockStart, t.endLine + 1).join('\n'));
fs.writeFileSync(outPath, banner + blocks.join('\n') + '\n');

// Remove from styles.css (reverse order)
const out = lines.slice();
for (const t of [...targets].reverse()) {
  out.splice(t.blockStart, t.endLine - t.blockStart + 1);
}
fs.writeFileSync(cssPath, out.join('\n'));

console.log(`Extracted ${targets.length} sections to ${outPath}:`);
targets.forEach(t => console.log(`  - SECTION ${t.num} (${t.name}) L${t.blockStart + 1}-${t.endLine + 1}`));
console.log(`\nstyles.css: ${lines.length} → ${out.length} lines`);
console.log(`${outPath}: ${(banner + blocks.join('\n') + '\n').split('\n').length} lines`);
