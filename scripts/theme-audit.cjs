#!/usr/bin/env node
// Audit data-theme="light" / "dark" rules in styles.css.
// Report: rule count, !important count, lines spanned, sections involved.

const fs = require('fs');
const CSS = 'assets/styles.css';
const raw = fs.readFileSync(CSS, 'utf8');
const lines = raw.split(/\r?\n/);

// Find SECTION markers for context.
const sectionByLine = new Array(lines.length).fill('?');
let cur = '?';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*SECTION (\d+) — (.+?)\s*$/);
  if (m) cur = m[1];
  sectionByLine[i] = cur;
}

// Parse top-level rules. Track brace depth, string state, line comments.
function* iterRules(src) {
  let i = 0, depth = 0, line = 1, startIdx = -1, startLine = -1;
  let inStr = null, inCmt = false;
  while (i < src.length) {
    const c = src[i], n = src[i+1];
    if (c === '\n') line++;
    if (inCmt) {
      if (c === '*' && n === '/') { inCmt = false; i += 2; continue; }
      i++; continue;
    }
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '/' && n === '*') { inCmt = true; i += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; i++; continue; }
    if (c === '{') {
      if (depth === 0) { startIdx = i; startLine = line; }
      depth++; i++; continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0 && startIdx >= 0) {
        // walk back to find selector start
        let s = startIdx - 1;
        while (s >= 0 && '{}\n'.indexOf(src[s]) === -1) s--;
        const selStart = s + 1;
        const sel = src.slice(selStart, startIdx).trim();
        const body = src.slice(startIdx + 1, i);
        // selector start line = startLine - newlines in sel
        const selLineCount = (src.slice(selStart, startIdx).match(/\n/g) || []).length;
        const ruleStartLine = startLine - selLineCount;
        yield { sel, body, startLine: ruleStartLine, endLine: line };
        startIdx = -1;
      }
      i++; continue;
    }
    i++;
  }
}

const lightRules = [];
const darkRules  = [];
let lightImportant = 0, darkImportant = 0;
let lightAtRules = 0, darkAtRules = 0;

for (const rule of iterRules(raw)) {
  // Skip @-rules at top level (but we want to inspect inside @media etc. eventually)
  if (rule.sel.startsWith('@')) continue;
  const isLight = /data-theme=["']light["']/.test(rule.sel);
  const isDark  = /data-theme=["']dark["']/.test(rule.sel);
  if (!isLight && !isDark) continue;
  const impCount = (rule.body.match(/!important/g) || []).length;
  const sec = sectionByLine[rule.startLine - 1];
  const entry = { sel: rule.sel, startLine: rule.startLine, endLine: rule.endLine, impCount, sec };
  if (isLight) { lightRules.push(entry); lightImportant += impCount; }
  if (isDark)  { darkRules.push(entry);  darkImportant  += impCount; }
}

// Section summary.
const sectionsLight = {};
for (const r of lightRules) {
  sectionsLight[r.sec] = (sectionsLight[r.sec] || 0) + 1;
}
const sectionsDark = {};
for (const r of darkRules) {
  sectionsDark[r.sec] = (sectionsDark[r.sec] || 0) + 1;
}

console.log('=== LIGHT THEME ===');
console.log(`Rules:        ${lightRules.length}`);
console.log(`!important:   ${lightImportant}`);
console.log(`Sections:`);
Object.keys(sectionsLight).sort().forEach(s => {
  console.log(`  S${s}: ${sectionsLight[s]} rules`);
});

console.log('\n=== DARK THEME ===');
console.log(`Rules:        ${darkRules.length}`);
console.log(`!important:   ${darkImportant}`);
console.log(`Sections:`);
Object.keys(sectionsDark).sort().forEach(s => {
  console.log(`  S${s}: ${sectionsDark[s]} rules`);
});

// Detect mixed selectors (light/dark prefix combined with non-theme parts that might be tricky)
const mixedLight = lightRules.filter(r => /,/.test(r.sel) && !/data-theme=["']light["']\s*\)/.test(r.sel));
const mixedDark = darkRules.filter(r => /,/.test(r.sel));
console.log(`\nLight rules with comma-separated selectors: ${mixedLight.length}`);
console.log(`Dark rules with comma-separated selectors:  ${mixedDark.length}`);

fs.writeFileSync('scripts/.theme-audit.json', JSON.stringify({ lightRules, darkRules }, null, 2));
console.log('\nWrote scripts/.theme-audit.json');
