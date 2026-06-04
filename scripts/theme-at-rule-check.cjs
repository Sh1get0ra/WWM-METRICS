#!/usr/bin/env node
// Detect data-theme="light" or "dark" rules nested inside @media/@supports.
const fs = require('fs');
const raw = fs.readFileSync('assets/styles.css', 'utf8');

let depth = 0, inAtBlock = false, atBlockStartDepth = -1;
let inStr = null, inCmt = false;
let line = 1;
const nested = [];

for (let i = 0; i < raw.length; i++) {
  const c = raw[i], n = raw[i+1];
  if (c === '\n') line++;
  if (inCmt) { if (c === '*' && n === '/') { inCmt = false; i++; } continue; }
  if (inStr) {
    if (c === '\\') { i++; continue; }
    if (c === inStr) inStr = null;
    continue;
  }
  if (c === '/' && n === '*') { inCmt = true; i++; continue; }
  if (c === '"' || c === "'") { inStr = c; continue; }
  if (c === '@') {
    const head = raw.slice(i, i + 200);
    if (/^@(media|supports|keyframes)\b/.test(head)) {
      inAtBlock = true;
      atBlockStartDepth = depth;
    }
  }
  if (c === '{') depth++;
  if (c === '}') {
    depth--;
    if (inAtBlock && depth === atBlockStartDepth) {
      inAtBlock = false;
      atBlockStartDepth = -1;
    }
  }
  if (inAtBlock) {
    const ctx = raw.slice(i, i + 50);
    if (/^data-theme=["'](light|dark)["']/.test(ctx)) {
      nested.push({ line, theme: ctx.match(/data-theme=["'](\w+)["']/)[1] });
    }
  }
}

console.log(`@-nested theme refs: ${nested.length}`);
nested.slice(0, 30).forEach(n => console.log(`  L${n.line} (${n.theme})`));
