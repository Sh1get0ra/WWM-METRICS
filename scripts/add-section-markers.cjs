#!/usr/bin/env node
// Phase 3-B (Tier 3-B): Add SECTION markers + ToC to assets/styles.css.
// Pure-additive: inserts comment blocks only, never modifies existing rules.
// Rule:
//   - Match each section's "anchor line" by exact string.
//   - Insert SECTION marker comment block IMMEDIATELY BEFORE the anchor line.
//   - Skip sections whose anchor already has a marker directly above.
//   - Build ToC from final line numbers and insert after the file's leading block.

const fs = require('fs');
const path = 'assets/styles.css';

// Sections: [id, title, anchorLine (exact string, leading-whitespace-tolerant)]
// id 2-digit zero-padded for stable sort + grep-friendly markers.
// Anchor strings chosen to be UNIQUE within the file (verified via grep counts).
const SECTIONS = [
  ['01', 'DESIGN TOKENS',                   ':root {', 6],
  ['02', 'BODY & BRAND HEADER',             '/* Body texture: ink wash + paper grain + 公式 home_main 背景 */'],
  ['03', 'SHARE / WEAKNESS BADGE',          '/* SHARE Build mode: preset-bar 非表示 + 閲覧モードバナー表示 */'],
  ['04', 'HERO PANEL',                      '/* hero::after ノイズ overlay を 半透明化 (xinfa_bg 見せるため) */'],
  ['05', 'TIER BADGES — Sidebar Mini',      '/* ── Tier バッジ ──────────────────────────────────────────── */'],
  ['06', 'A11Y / REDUCED MOTION',           '/* ── prefers-reduced-motion: 動きの軽減 ─────────────────── */'],
  ['07', 'FOOTER + TOAST',                  '/* ─────────────────────────────────────────────────────────────────', 1108],
  ['08', 'LIGHT THEME — Page Base',         '/* ─────────────────────────────────────────────────────────────────', 1137],
  ['09', 'COUNT-UP FLASH',                  '/* Count-up flash */'],
  ['10', 'MOBILE LEGACY (≤600px)',          '/* ─────────────────────────────────────────────────────────────────', 1333],
  ['11', 'IMPORT MODAL',                    '/* ── Import Modal ───────────────────────────────────────────── */'],
  ['12', 'SIDEBAR + MINI-HERO',             '/* ── Sidebar (テスト用 fixed) ────────────────────────────────── */'],
  ['13', 'SETUP MODAL WIZARD',              '/* ── Setup modal wizard ─────────────────────────────────────── */'],
  ['14', 'OBS OVERLAY MODE',                '/* ── OBS overlay モード (?view=sidebar) ─────────────────────────── */'],
  ['15', 'APP LAYOUT',                      '/* ── 新 app-layout: fixed header + 左右独立scroll ───── */'],
  ['16', 'GEAR GRID',                       '/* ── Gear Grid Container (main 下部) ───────────────────────── */'],
  ['17', 'STEP2 FORM (観音/武庫)',          '/* ── Step2 form (観音/武庫) ─────────────────────────────────── */'],
  ['18', 'EDIT MODAL',                      '/* ── Edit modal (gear card affix編集) ───────────────────────── */'],
  ['19', 'COMPARE MODAL (武具対照)',        '/* ── Gear Compare modal (2-column) ──────────────────────────── */'],
  ['20', 'XINFA TIER EFFECTS LIST',         '/* ── 心法 Tier効果 を 武具対照 row 風リスト化 (T番号chip + 効果, dashed区切り) ── */'],
  ['21', 'ANALYSIS GRID (Tier + Affix)',    '/* Analysis grid (Tier ladder + Affix ranking) */'],
  ['22', 'DIAGNOSTICS PANEL',               '/* Diagnostics panel */'],
  ['23', 'CHANGELOG MODAL',                 '/* Changelog modal */'],
  ['24', 'LIGHT THEME — Modal/Card',        '/* ライトモード: 白系rgba background を 影系に */'],
  ['25', 'XINFA GRID',                      '/* ── Xinfa Grid ── */'],
  ['26', 'GEAR/XINFA CARD 案A LAYER',       '/* ============================================================', 4434],
  ['27', 'NOTICES + LIGHT CHART',           '/* ── changelog notice (lang制限注記) ───────────────────────── */'],
  ['28', 'HERO TIER BADGE (full)',          '/* Tier badge 共通 base */'],
  ['29', 'LIGHT THEME — Hero/Compass',      '/* ── Light theme override: hero-wuxia + 公式 xinfa 背景 (blend で簡易反転) ─────── */'],
  ['30', 'IMPORT POSITION HINT',            '/* ── IMPORT位置ヒント (初回言語選択後) ─────────── */'],
  ['31', 'POLISH PRIMITIVES',               '/* ── Polish primitives (将来再利用用、CSS-only) ─────────── */'],
  ['32', 'SCORE UPDATE BANNER',             '/* ── スコア計算更新バナー (baseline 鮮度切れ scoreVer不一致 → 再import促し) ── */'],
  ['33', 'MIGRATION BANNER',                '/* ── 移転案内バナー (旧URL アクセス時のみ表示、 OBS view非表示) ── */'],
  ['34', 'DATA IMPORT — Light Contrast',    '/* ── DATA IMPORT modal ライトモード コントラスト強化 ───────────'],
  ['35', 'ANALYSIS PANEL 右下 (案30)',      '/* ============================================================', 5350],
  ['36', 'FONT FAMILY + ANLZ BODY',         '/* ── ギャップ ── */'],
  ['37', 'TIER BADGE ROULETTE',             '/* ── Tier badge ルーレット (opt実行中 演出、 sidebar + heroパネル 共通) ─────── */'],
  ['38', 'NOTE MODAL (巻物)',               '/* ── NOTE modal (巻物 UI、 ライト/ダーク共通) ────────────────── */'],
  ['39', 'A11Y :focus-visible (global)',    '/* ─────────────────────────────────────────────────────────────────', 5939],
  ['40', 'MOBILE RESPONSIVE',               '/* ═══════════════════════════════════════════════════════════════════'],
];

const MARKER_TOP = '/* ╔═══════════════════════════════════════════════════════════════════╗';
const MARKER_BOT = '   ╚═══════════════════════════════════════════════════════════════════╝ */';

function makeMarker(id, title) {
  return [
    MARKER_TOP,
    `     SECTION ${id} — ${title}`,
    MARKER_BOT,
    ''
  ].join('\n');
}

const raw = fs.readFileSync(path, 'utf8');
// Detect original EOL so we can restore it on write (file may be CRLF on Windows).
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

// Sort sections so we insert from bottom to top → earlier line numbers stay valid.
// Resolve anchor location for each section (by 1-based line hint or first-match).
const resolved = SECTIONS.map(([id, title, anchor, lineHint]) => {
  if (lineHint) {
    // Verify the hinted line matches the anchor.
    if (lines[lineHint - 1] === undefined || !lines[lineHint - 1].startsWith(anchor.slice(0, 40))) {
      throw new Error(`SECTION ${id} anchor mismatch at hinted line ${lineHint}: expected start "${anchor.slice(0, 40)}..."`);
    }
    return { id, title, lineIdx: lineHint - 1 };
  }
  const idx = lines.findIndex(l => l === anchor);
  if (idx === -1) throw new Error(`SECTION ${id} anchor not found: "${anchor}"`);
  // Verify uniqueness for non-hinted matches.
  const lastIdx = lines.lastIndexOf(anchor);
  if (lastIdx !== idx) {
    throw new Error(`SECTION ${id} anchor not unique (lines ${idx + 1}, ${lastIdx + 1}): "${anchor.slice(0, 60)}..."`);
  }
  return { id, title, lineIdx: idx };
});

resolved.sort((a, b) => b.lineIdx - a.lineIdx); // bottom-up

// Skip insertion if there's already a SECTION marker right above.
const ALREADY = '╔═══';
let insertedCount = 0;
let skippedCount = 0;
const skipLog = [];

for (const sec of resolved) {
  // Check up to 2 lines above for existing marker.
  const probe = lines.slice(Math.max(0, sec.lineIdx - 3), sec.lineIdx).join('\n');
  if (probe.includes(ALREADY)) {
    skippedCount++;
    skipLog.push(`SECTION ${sec.id} skipped (marker already present)`);
    continue;
  }
  const marker = makeMarker(sec.id, sec.title);
  lines.splice(sec.lineIdx, 0, ...marker.split('\n'));
  insertedCount++;
}

// === ToC generation (after insertion so line numbers reflect final state) ===
// Recompute line index for each section's marker.
const finalContent = lines.join('\n');
const finalLines = finalContent.split(/\r?\n/);
const tocEntries = [];
const markerRe = /^\s*SECTION (\d+) — (.+)$/;
for (let i = 0; i < finalLines.length; i++) {
  const m = finalLines[i].match(markerRe);
  if (m) tocEntries.push({ id: m[1], title: m[2], line: i + 1 });
}
tocEntries.sort((a, b) => a.id.localeCompare(b.id));

// ToC will be inserted between header and rest, shifting every section marker
// DOWN by (1 + tocLines.length). Pre-compute that offset so printed line numbers
// match the post-insert file (not the pre-insert file).
const tocHeader = [
  '/* ╔═══════════════════════════════════════════════════════════════════╗',
  '     TABLE OF CONTENTS — Ctrl+F "SECTION NN" でジャンプ',
  '     (auto-generated by scripts/add-section-markers.cjs)',
  '   ───────────────────────────────────────────────────────────────────',
];
const tocFooter = [
  '   ╚═══════════════════════════════════════════════════════════════════╝ */',
  ''
];
const tocLength = tocHeader.length + tocEntries.length + tocFooter.length;
const SHIFT = 1 + tocLength; // 1 = leading blank line

const tocLines = [...tocHeader];
for (const e of tocEntries) {
  const lineStr = String(e.line + SHIFT).padStart(5, ' ');
  tocLines.push(`     SECTION ${e.id} — ${e.title.padEnd(38, ' ')} L${lineStr}`);
}
tocLines.push(...tocFooter);

// Insert ToC after the top 4-line file header (lines 1-4 are the existing /* === WWM DMG CALC ... */).
// If a previous ToC exists (detected by "TABLE OF CONTENTS" string near top), replace it instead of duplicating.
const HEADER_END = 4;
let tocReplaceStart = -1, tocReplaceEnd = -1;
for (let i = HEADER_END; i < Math.min(HEADER_END + 60, finalLines.length); i++) {
  if (finalLines[i] && finalLines[i].includes('TABLE OF CONTENTS')) {
    // Find start (preceding ╔ line) and end (next ╝ line).
    for (let s = i; s >= HEADER_END; s--) {
      if (finalLines[s] && finalLines[s].includes('╔')) { tocReplaceStart = s; break; }
    }
    for (let e = i; e < finalLines.length; e++) {
      if (finalLines[e] && finalLines[e].includes('╝')) { tocReplaceEnd = e; break; }
    }
    break;
  }
}

let outLines;
if (tocReplaceStart !== -1 && tocReplaceEnd !== -1) {
  // Replace existing ToC block (plus trailing blank line if present).
  const trailingBlank = (finalLines[tocReplaceEnd + 1] === '') ? 1 : 0;
  outLines = [
    ...finalLines.slice(0, tocReplaceStart),
    ...tocLines,
    ...finalLines.slice(tocReplaceEnd + 1 + trailingBlank)
  ];
} else {
  // Fresh insert after header.
  outLines = [
    ...finalLines.slice(0, HEADER_END),
    '',
    ...tocLines,
    ...finalLines.slice(HEADER_END)
  ];
}

fs.writeFileSync(path, outLines.join(EOL), 'utf8');

console.log(`[add-section-markers] inserted=${insertedCount} skipped=${skippedCount} totalSections=${SECTIONS.length}`);
console.log(`[add-section-markers] ToC entries=${tocEntries.length} ${tocReplaceStart !== -1 ? '(replaced existing)' : '(fresh insert)'}`);
if (skipLog.length) console.log('Skipped:\n  ' + skipLog.join('\n  '));
