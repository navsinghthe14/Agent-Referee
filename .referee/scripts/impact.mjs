#!/usr/bin/env node
// impact.mjs — before vs after, from the hooks' own logs.
//   node .referee/scripts/impact.mjs
// "Before" = sessions recorded in observe mode (nothing blocked, nothing said to the agent).
// "After"  = sessions recorded in enforce mode.
// Only counts outcomes that mean the same thing in both modes, so the comparison is fair:
// risky moves the agent tried, and turns it finished while your checks were failing.
import fs from 'node:fs';
import path from 'node:path';
import { AGENT, logsDir } from './lib.mjs';

const dir = logsDir();
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.jsonl') && f !== 'doctor.jsonl') : [];
const kind = r => /protected|\.agent|\.referee|writes near/.test(r) ? 'protected file edits' : /[Mm]erg/.test(r) ? 'merges without permission' : /[Pp]ush|[Ff]orce/.test(r) ? 'pushes to main' : /no-verify/.test(r) ? 'skipped checks (--no-verify)' : /full send/i.test(r) ? 'self-granted "full send"' : 'other';

const P = () => ({ sessions: 0, turns: 0, codeTurns: 0, failingEnds: 0, risky: 0, byKind: {} });
const per = { observe: P(), enforce: P() };
for (const f of files) {
  const ev = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const modeOf = ev.find(e => e.type === 'turn_end')?.mode || (ev.some(e => e.mode === 'observe') ? 'observe' : null);
  if (!modeOf) continue;
  const p = per[modeOf];
  p.sessions++;
  for (const e of ev) {
    if (e.type === 'turn_end') { p.turns++; if (e.verify === 'pass' || e.verify === 'fail') p.codeTurns++; if (e.verify === 'fail') p.failingEnds++; }
    if (e.type === 'would_block' || e.type === 'blocked') { p.risky++; const k = kind(e.reason || ''); p.byKind[k] = (p.byKind[k] || 0) + 1; }
  }
}

const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : '—';
const { observe: b, enforce: a } = per;
console.log('⚖ Agent Referee — impact\n');
if (!b.sessions) console.log('No "before" data yet. Set "mode": "observe" in .referee/config.json, use Claude Code as normal for a week, then switch to "enforce".\n');
console.log('| | Before (observe) | After (enforce) |');
console.log('| --- | --- | --- |');
console.log(`| Sessions | ${b.sessions} | ${a.sessions} |`);
console.log(`| Turns that changed code | ${b.codeTurns} | ${a.codeTurns} |`);
console.log(`| …that ended with your checks failing | ${b.failingEnds} (${pct(b.failingEnds, b.codeTurns)}) | ${a.failingEnds} (${pct(a.failingEnds, a.codeTurns)}) |`);
console.log(`| Risky moves the agent tried | ${b.risky} (none stopped) | ${a.risky} (all stopped) |`);
const kinds = [...new Set([...Object.keys(b.byKind), ...Object.keys(a.byKind)])];
for (const k of kinds) console.log(`|  ${k} | ${b.byKind[k] || 0} | ${a.byKind[k] || 0} |`);
if (b.sessions && a.sessions) {
  console.log('\nIn one line:');
  console.log(`Before the referee, ${pct(b.failingEnds, b.codeTurns)} of code-changing turns ended with failing checks and the agent tried ${b.risky} risky move(s) in ${b.sessions} session(s), none stopped. After: ${pct(a.failingEnds, a.codeTurns)}, and all ${a.risky} attempt(s) were blocked.`);
}
