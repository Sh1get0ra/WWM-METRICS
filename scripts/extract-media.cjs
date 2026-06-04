// Tier 3 Step 4: styles.css 内 全 @media を styles-responsive.css に切出
const fs = require('fs');
const cssPath = 'assets/styles.css';
const outPath = 'assets/styles-responsive.css';

const css = fs.readFileSync(cssPath, 'utf8');
const lines = css.split('\n');

const blocks = [];
let i = 0;
while (i < lines.length) {
  const m = lines[i].match(/^@media\s+(.+?)\s*\{?\s*$/);
  if (m && !lines[i].match(/^@media.*\}/)) {
    let depth = 0;
    const start = i;
    do {
      depth += (lines[i].match(/\{/g) || []).length;
      depth -= (lines[i].match(/\}/g) || []).length;
      i++;
    } while (depth > 0 && i < lines.length);
    blocks.push({
      query: m[1].replace(/\{$/, '').trim(),
      start,
      end: i - 1,
      content: lines.slice(start, i).join('\n'),
    });
  } else {
    i++;
  }
}

const out = lines.slice();
for (const b of [...blocks].reverse()) {
  const startIdx = b.start > 0 && out[b.start - 1].trim() === '' ? b.start - 1 : b.start;
  out.splice(startIdx, b.end - startIdx + 1);
}

const banner = '/* ╔═══════════════════════════════════════════════════════════════════╗\n     RESPONSIVE — @media 集約 (Tier 3 Step 4)\n     styles.css から切出。 cascade: tokens → animations → styles → modals → responsive → dark → light\n   ╚═══════════════════════════════════════════════════════════════════╝ */\n\n';

fs.writeFileSync(outPath, banner + blocks.map(b => b.content).join('\n\n') + '\n');
fs.writeFileSync(cssPath, out.join('\n'));

console.log(`Extracted ${blocks.length} @media blocks:`);
blocks.forEach(b => console.log(`  - ${b.query} (L${b.start + 1}-${b.end + 1})`));
console.log(`\nstyles.css: ${lines.length} → ${out.length} lines`);
console.log(`${outPath}: ${(banner + blocks.map(b => b.content).join('\n\n') + '\n').split('\n').length} lines`);
