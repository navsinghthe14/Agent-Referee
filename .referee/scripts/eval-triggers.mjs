#!/usr/bin/env node
// Checks that each sample prompt routes to the expected skill.
//   node .referee/scripts/eval-triggers.mjs          router only (fast, deterministic, runs in CI)
//   node .referee/scripts/eval-triggers.mjs --live   also asks the real `claude` CLI which skill it loads
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AGENT, ROOT } from './lib.mjs';
import { route } from './hooks/route.mjs';

const cases = JSON.parse(fs.readFileSync(path.join(AGENT, 'evals', 'triggers.json'), 'utf8'));
const live = process.argv.includes('--live');
let fail = 0, okCount = 0;
for (const c of cases) {
  const got = route(c.prompt);
  const ok = got === c.expect;
  let liveNote = '';
  if (live) {
    const r = spawnSync('claude', ['-p', c.prompt, '--output-format', 'stream-json', '--verbose', '--max-turns', '2'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const loaded = [...(r.stdout || '').matchAll(/"name":"Skill","input":\{"(?:skill|command)":"([^"]+)"/g)].map(m => m[1]);
    const liveOk = c.expect ? loaded.includes(c.expect) : loaded.length === 0;
    if (!liveOk) fail++;
    liveNote = ` | live: ${liveOk ? 'ok' : 'MISS'} (${loaded.join(',') || 'none'})`;
  }
  if (!ok) fail++; else okCount++;
  console.log(`${ok ? '✓' : '✗'} "${c.prompt}" → ${got ?? 'none'}${ok ? '' : ` (expected ${c.expect ?? 'none'})`}${liveNote}`);
}
console.log(`\n${okCount}/${cases.length} routed correctly${live ? ' (live misses counted in exit code)' : ''}`);
process.exit(fail ? 1 : 0);
