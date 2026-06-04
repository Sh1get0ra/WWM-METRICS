#!/usr/bin/env node
// !important audit for assets/styles.css.
// Builds an inventory and identifies "A-type" candidates: !important declarations
// that have NO competing rule on the same logical element + property.
//
// Strategy:
//   1. Parse every CSS rule (selector list + body).
//      Skip @media / @supports / @keyframes bodies for now (they have their own
//      cascade context).
//   2. For each rule, expand the comma-separated selector list and parse each
//      individual selector to extract its "shape signature":
//        - Final compound (rightmost token group, e.g. ".foo.bar:hover")
//        - Property targeted
//      → key = `${finalCompoundCanonical}|${property}`
//   3. Build an index: signature → [declarations], where each declaration
//      records {ruleLine, selector, hasImportant}.
//   4. For each !important declaration:
//        - Look up its signature
//        - If list contains ONLY this declaration → A-type SAFE candidate
//        - Else → categorize:
//            - All same-signature siblings also have !important → "all-bang"
//              (suggests theme/state war — needs manual review)
//            - Some siblings non-important → "true competitor" (NEEDED)
//   5. Report grouped by section.
//
// Limitation: shape signature is heuristic. Two selectors with different
// ancestors (e.g. `.x .foo` vs `.y .foo`) share the same final compound `.foo`.
// We treat them as competitors (conservative — false positives toward "needed").
// This is intentional: false positives keep !important, false negatives would
// silently break the cascade.

const fs = require('fs');
const CSS = 'assets/styles.css';
const raw = fs.readFileSync(CSS, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

// Build section map for reporting.
const sectionByLine = new Array(lines.length).fill('00 — (pre)');
let cur = '00 — (pre)';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*SECTION (\d+) — (.+?)\s*$/);
  if (m) cur = `${m[1]} — ${m[2]}`;
  sectionByLine[i] = cur;
}

// Rule parser (reused style from dead-selector-plan).
function parseRules(src) {
  const rules = [];
  let i = 0;
  let line = 1;
  const len = src.length;
  function skipWs() {
    while (i < len) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        if (ch === '\n') line++;
        i++;
      } else if (src[i] === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < len && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') line++;
          i++;
        }
        i += 2;
      } else break;
    }
  }
  function readBody(parentAt) {
    let depth = 1;
    let inStr = null;
    const startI = i;
    while (i < len && depth > 0) {
      const ch = src[i];
      if (inStr) {
        if (ch === inStr && src[i - 1] !== '\\') inStr = null;
        if (ch === '\n') line++;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; i++; continue; }
      if (ch === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < len && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (ch === '\n') line++;
      i++;
    }
    return src.slice(startI, i - 1);
  }
  while (i < len) {
    skipWs();
    if (i >= len) break;
    const ruleStartLine = line;
    let prelude = '';
    let inStr = null;
    while (i < len) {
      const ch = src[i];
      if (inStr) {
        if (ch === inStr && src[i - 1] !== '\\') inStr = null;
        prelude += ch; if (ch === '\n') line++; i++; continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; prelude += ch; i++; continue; }
      if (ch === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < len && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (ch === '{' || ch === ';') break;
      prelude += ch;
      if (ch === '\n') line++;
      i++;
    }
    if (i >= len) break;
    if (src[i] === ';') { i++; continue; }
    i++; // consume '{'
    const body = readBody();
    const trimmed = prelude.trim();
    rules.push({
      prelude: trimmed,
      body,
      startLine: ruleStartLine,
      atRule: /^\s*@/.test(trimmed) ? trimmed.match(/^@[a-z-]+/i)?.[0] || '@?' : null
    });
  }
  return rules;
}

const topRules = parseRules(raw);

// Top-level rules only. @media / @supports / @keyframes are SKIPPED entirely:
// - @media changes cascade context (a !important inside @media competes against
//   different rules than outside); accurate analysis requires preserving file
//   line offsets, which our parser doesn't do for nested bodies.
// - @keyframes %-step rules aren't real selectors.
// Conservative effect: A-type set excludes @media-nested decls. Those are
// reviewed in a later pass once a top-level cleanup is done.
function flatten(rules) {
  const out = [];
  for (const r of rules) {
    if (r.atRule) continue;
    out.push({ ...r, mediaContext: '' });
  }
  return out;
}

const allRules = flatten(topRules);

// Split selector list by top-level commas.
function splitSelectors(s) {
  const out = []; let buf = ''; let depth = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { if (buf.trim()) out.push(buf.trim()); buf = ''; }
    else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// Extract the "final compound" (rightmost simple selector group).
// e.g. `.a .b > .c.d:hover::before` → `.c.d:hover::before`
function finalCompound(sel) {
  // Find the last combinator (' ', '>', '+', '~') outside parens.
  let depth = 0;
  let lastCut = -1;
  for (let k = 0; k < sel.length; k++) {
    const ch = sel[k];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) {
      lastCut = k;
    }
  }
  return sel.slice(lastCut + 1).trim();
}

// Canonicalize a compound: sort class tokens, drop pseudo-class order, normalize.
// We don't want `.a.b:hover` and `.b.a:hover` to differ, nor `:hover.foo` vs `.foo:hover`.
function canonCompound(compound) {
  const parts = {
    tag: '',
    classes: [],
    ids: [],
    attrs: [],
    pseudos: [],
    pseudoElements: []
  };
  let i = 0;
  // Optional leading tag.
  const tagMatch = compound.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch) { parts.tag = tagMatch[1].toLowerCase(); i = tagMatch[0].length; }
  while (i < compound.length) {
    const ch = compound[i];
    if (ch === '.') {
      const m = compound.slice(i).match(/^\.([a-zA-Z_][a-zA-Z0-9_-]*)/);
      if (!m) { i++; continue; }
      parts.classes.push(m[1]); i += m[0].length;
    } else if (ch === '#') {
      const m = compound.slice(i).match(/^#([a-zA-Z_][a-zA-Z0-9_-]*)/);
      if (!m) { i++; continue; }
      parts.ids.push(m[1]); i += m[0].length;
    } else if (ch === '[') {
      // Read until matching ]
      let depth = 1; let j = i + 1;
      while (j < compound.length && depth > 0) {
        if (compound[j] === '[') depth++;
        else if (compound[j] === ']') depth--;
        j++;
      }
      parts.attrs.push(compound.slice(i, j)); i = j;
    } else if (ch === ':' && compound[i + 1] === ':') {
      const m = compound.slice(i).match(/^::[a-zA-Z-]+(?:\([^)]*\))?/);
      if (!m) { i++; continue; }
      parts.pseudoElements.push(m[0]); i += m[0].length;
    } else if (ch === ':') {
      const m = compound.slice(i).match(/^:[a-zA-Z-]+(?:\([^)]*\))?/);
      if (!m) { i++; continue; }
      parts.pseudos.push(m[0]); i += m[0].length;
    } else {
      i++; // skip unknown
    }
  }
  parts.classes.sort();
  parts.ids.sort();
  parts.attrs.sort();
  parts.pseudos.sort();
  parts.pseudoElements.sort();
  // INTENTIONALLY exclude pseudos / pseudo-elements from signature.
  // Reason: `.foo { color: red !important }` and `.foo:hover { color: blue }`
  // share the same logical "element" — the !important on the base affects the
  // hover state too. If we treated them as distinct sigs, A-type detection
  // would consider the base !important "no competition" and we'd silently
  // change hover behavior on drop. Pseudo-class variants are competitors.
  return [
    parts.tag,
    parts.ids.map(s => '#' + s).join(''),
    parts.classes.map(s => '.' + s).join(''),
    parts.attrs.join('')
  ].join('');
}

// Parse declarations in a rule body. Skip nested at-rules.
function parseDeclarations(body) {
  const out = [];
  let i = 0;
  let depth = 0;
  let inStr = null;
  let buf = '';
  while (i < body.length) {
    const ch = body[i];
    if (inStr) {
      if (ch === inStr && body[i - 1] !== '\\') inStr = null;
      buf += ch; i++; continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; i++; continue; }
    if (ch === '/' && body[i + 1] === '*') {
      i += 2;
      while (i < body.length && !(body[i] === '*' && body[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '{') { depth++; buf += ch; i++; continue; }
    if (ch === '}') { depth--; buf += ch; i++; continue; }
    if (ch === ';' && depth === 0) {
      const decl = buf.trim();
      if (decl) {
        const colon = decl.indexOf(':');
        if (colon > 0 && !decl.startsWith('--')) {
          const prop = decl.slice(0, colon).trim().toLowerCase();
          const val = decl.slice(colon + 1).trim();
          out.push({ prop, val, hasImportant: /!important\b/i.test(val) });
        }
      }
      buf = ''; i++; continue;
    }
    buf += ch; i++;
  }
  // Tail (no trailing semicolon).
  const decl = buf.trim();
  if (decl) {
    const colon = decl.indexOf(':');
    if (colon > 0 && !decl.startsWith('--')) {
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const val = decl.slice(colon + 1).trim();
      out.push({ prop, val, hasImportant: /!important\b/i.test(val) });
    }
  }
  return out;
}

// Estimate declaration line within file: scan body for `prop:` from rule.startLine.
function declLineFor(rule, prop, occurrenceIndex) {
  // occurrenceIndex: 0-based which match within this rule (rules may set same prop twice in cascade rolls).
  let seen = 0;
  const startIdx = rule.startLine - 1;
  // Search forward — body extends until matching `}` but we don't have endLine here.
  // Approximate: scan up to next "}" at column 0 or end of file.
  const re = new RegExp(`^\\s*${prop.replace(/[-]/g, '\\-')}\\s*:`, 'i');
  let depth = 1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    // Trivial brace tracker.
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    if (re.test(lines[i])) {
      if (seen === occurrenceIndex) return i + 1;
      seen++;
    }
    depth += opens - closes;
    if (depth <= 0) break;
  }
  return rule.startLine;
}

// === Build signature index ===
const sigIndex = new Map(); // sig → [{ruleLine, selectorRaw, finalCanon, prop, hasImportant, declLine, sectionLabel}]
let bangTotal = 0;

for (const r of allRules) {
  const decls = parseDeclarations(r.body);
  const selectors = splitSelectors(r.prelude);
  for (const sel of selectors) {
    const fc = finalCompound(sel);
    const canon = canonCompound(fc);
    if (!canon) continue; // tag-only or anomalous — skip from comparison (won't dedupe)
    const propCounts = new Map();
    for (const d of decls) {
      const occ = propCounts.get(d.prop) || 0;
      propCounts.set(d.prop, occ + 1);
      const sig = canon + '|' + d.prop + (r.mediaContext ? '|' + r.mediaContext : '');
      const entry = {
        ruleLine: r.startLine,
        selectorRaw: sel,
        finalCanon: canon,
        prop: d.prop,
        valSample: d.val.replace(/!important\b/i, '').trim().slice(0, 60),
        hasImportant: d.hasImportant,
        declLine: declLineFor(r, d.prop, occ),
        mediaContext: r.mediaContext || '',
      };
      if (d.hasImportant) bangTotal++;
      if (!sigIndex.has(sig)) sigIndex.set(sig, []);
      sigIndex.get(sig).push(entry);
    }
  }
}

// === Classify each !important declaration ===
const aType = []; // {entry, sig}
const allBang = []; // {entries, sig}
const trueCompete = []; // {bangEntry, competitors, sig}

for (const [sig, list] of sigIndex) {
  const bangs = list.filter(e => e.hasImportant);
  if (bangs.length === 0) continue;
  const nonBangs = list.filter(e => !e.hasImportant);
  if (list.length === 1) {
    aType.push({ entry: list[0], sig });
    continue;
  }
  if (nonBangs.length === 0) {
    allBang.push({ entries: bangs, sig });
    continue;
  }
  // Some non-bang competitors exist.
  for (const b of bangs) {
    trueCompete.push({ bangEntry: b, competitors: nonBangs, sig });
  }
}

// === Reports ===
const sectionOf = (line) => sectionByLine[line - 1] || '?';

// 1. Section-level inventory of all !important.
const inventoryBySection = new Map();
for (const [sig, list] of sigIndex) {
  for (const e of list) {
    if (!e.hasImportant) continue;
    const sec = sectionOf(e.declLine);
    if (!inventoryBySection.has(sec)) inventoryBySection.set(sec, 0);
    inventoryBySection.set(sec, inventoryBySection.get(sec) + 1);
  }
}

// 2. A-type details by section.
const aTypeBySection = new Map();
for (const a of aType) {
  const sec = sectionOf(a.entry.declLine);
  if (!aTypeBySection.has(sec)) aTypeBySection.set(sec, []);
  aTypeBySection.get(sec).push(a);
}

// 3. all-bang details by section (these are mutual theme/state wars — sometimes
// the entire group can drop !important).
const allBangBySection = new Map();
for (const a of allBang) {
  const sec = sectionOf(a.entries[0].declLine);
  if (!allBangBySection.has(sec)) allBangBySection.set(sec, []);
  allBangBySection.get(sec).push(a);
}

// === Markdown report ===
const md = [];
md.push(`# !important Audit — assets/styles.css`);
md.push(``);
md.push(`Generated: ${new Date().toISOString()}`);
md.push(``);
md.push(`## Summary`);
md.push(`- **Total !important declarations**: ${bangTotal}`);
md.push(`- **A-type (no competition)**: ${aType.length}`);
md.push(`- **All-bang groups** (every sibling is !important): ${allBang.length} groups, ${allBang.reduce((s, g) => s + g.entries.length, 0)} declarations`);
md.push(`- **True-competitor groups**: ${trueCompete.length} declarations (need to win over a non-bang rule)`);
md.push(``);
md.push(`## Inventory by section`);
md.push(``);
md.push(`| Section | Total | A-type | All-bang |`);
md.push(`|---|---:|---:|---:|`);
const allSecs = new Set([...inventoryBySection.keys(), ...aTypeBySection.keys(), ...allBangBySection.keys()]);
const sortedAllSecs = [...allSecs].sort();
for (const sec of sortedAllSecs) {
  const t = inventoryBySection.get(sec) || 0;
  const a = (aTypeBySection.get(sec) || []).length;
  const b = (allBangBySection.get(sec) || []).reduce((s, g) => s + g.entries.length, 0);
  md.push(`| ${sec} | ${t} | ${a} | ${b} |`);
}
md.push(``);
md.push(`---`);
md.push(``);
md.push(`## A-type details (safe candidates)`);
md.push(``);

for (const sec of [...aTypeBySection.keys()].sort()) {
  const items = aTypeBySection.get(sec).sort((a, b) => a.entry.declLine - b.entry.declLine);
  md.push(`### SECTION ${sec} — ${items.length} A-type`);
  md.push(``);
  for (const a of items) {
    const e = a.entry;
    md.push(`- L${e.declLine} **\`${e.prop}\`** in \`${e.selectorRaw}\``);
    md.push(`  - Value: \`${e.valSample}\``);
    if (e.mediaContext) md.push(`  - @media: \`${e.mediaContext.slice(0, 80)}\``);
  }
  md.push(``);
}

fs.writeFileSync('scripts/.important-audit.md', md.join('\n'), 'utf8');
fs.writeFileSync('scripts/.important-audit.json', JSON.stringify({
  total: bangTotal,
  aType: aType.map(a => ({ ...a.entry, sig: a.sig })),
  allBangGroups: allBang.map(g => ({ sig: g.sig, entries: g.entries })),
  trueCompete: trueCompete.map(t => ({ bang: t.bangEntry, competitorCount: t.competitors.length, sig: t.sig })),
}, null, 2), 'utf8');

console.log(`!important total:      ${bangTotal}`);
console.log(`A-type (safe drop):    ${aType.length}`);
console.log(`All-bang groups:       ${allBang.length} (${allBang.reduce((s, g) => s + g.entries.length, 0)} decls)`);
console.log(`True competitors:      ${trueCompete.length}`);
console.log(`Reports: scripts/.important-audit.md  scripts/.important-audit.json`);
