// Tier 3 Step 2: styles.css 内 全 @keyframes を styles-animations.css に切出
const fs = require('fs');
const cssPath = 'assets/styles.css';
const outPath = 'assets/styles-animations.css';

const css = fs.readFileSync(cssPath, 'utf8');
const lines = css.split('\n');

const blocks = [];
let i = 0;
while (i < lines.length) {
  const m = lines[i].match(/^@keyframes\s+([\w-]+)/);
  if (m) {
    let depth = 0;
    const start = i;
    do {
      depth += (lines[i].match(/\{/g) || []).length;
      depth -= (lines[i].match(/\}/g) || []).length;
      i++;
    } while (depth > 0 && i < lines.length);
    blocks.push({
      name: m[1],
      start,
      end: i - 1,
      content: lines.slice(start, i).join('\n'),
    });
  } else {
    i++;
  }
}

// reverse order delete
const out = lines.slice();
for (const b of [...blocks].reverse()) {
  // also remove preceding blank line if exists
  const startIdx = b.start > 0 && out[b.start - 1].trim() === '' ? b.start - 1 : b.start;
  out.splice(startIdx, b.end - startIdx + 1);
}

const header = '/* ╔═══════════════════════════════════════════════════════════════════╗\n     @KEYFRAMES — 集約 (Tier 3 Step 2)\n     styles.css から切出。 cascade 順序: tokens → animations → styles → dark → light\n   ╚═══════════════════════════════════════════════════════════════════╝ */\n\n';

fs.writeFileSync(outPath, header + blocks.map(b => b.content).join('\n\n') + '\n');
fs.writeFileSync(cssPath, out.join('\n'));

console.log(`Extracted ${blocks.length} @keyframes blocks:`);
blocks.forEach(b => console.log(`  - ${b.name} (L${b.start + 1}-${b.end + 1})`));
console.log(`\nstyles.css: ${lines.length} → ${out.length} lines`);
console.log(`styles-animations.css: ${(header + blocks.map(b => b.content).join('\n\n') + '\n').split('\n').length} lines`);
