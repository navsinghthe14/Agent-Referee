#!/usr/bin/env node
// daily.mjs — the end-of-day summary: how the referee helped today.
//   node .referee/scripts/daily.mjs              today so far
//   node .referee/scripts/daily.mjs 2026-11-02   a given day (UTC date)
// Written to .referee/reports/daily-<date>.md. The route hook shows yesterday's at the first message of a new day.
// Everything comes from the hooks' own logs, never from what the agent said.
import fs from 'node:fs';
import path from 'node:path';
import { AGENT, readLog } from './lib.mjs';

const kind = r => /protected|\.referee|writes near/.test(r) ? 'edit a protected file' : /[Mm]erg/.test(r) ? 'merge without permission' : /[Ff]orce/.test(r) ? 'force-push' : /[Pp]ush/.test(r) ? 'push to main' : /no-verify/.test(r) ? 'skip checks with --no-verify' : /full send/i.test(r) ? 'switch on "full send" itself' : 'other';

export function daily(day = new Date().toISOString().slice(0, 10)) {
  const dir = path.join(AGENT, 'logs');
  if (!fs.existsSync(dir)) return null;
  let rules = [];
  try { rules = JSON.parse(fs.readFileSync(path.join(AGENT, 'session-rules.json'), 'utf8')).rules; } catch {}
  const plainOf = Object.fromEntries(rules.map(r => [r.id, r.plain || r.id]));
  let sb = {};
  try { sb = JSON.parse(fs.readFileSync(path.join(AGENT, 'audits', 'scoreboard.json'), 'utf8')); } catch {}

  const s = { sessions: 0, prompts: 0, codeTurns: 0, caught: 0, endedFailing: 0, blocked: {}, observed: {}, files: new Set(), skills: {}, observe: 0 };
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsonl') && x !== 'doctor.jsonl')) {
    const sid = f.replace(/\.jsonl$/, '');
    const ev = readLog(sid).filter(e => (e.t || '').startsWith(day));
    if (!ev.length) continue;
    s.sessions++;
    let sentBack = false;
    for (const e of ev) {
      if (e.type === 'stop_blocked') sentBack = true;
      if (e.type === 'prompt') { s.prompts++; if (e.mode === 'observe') s.observe++; }
      if (e.type === 'blocked') { const k = kind(e.reason || ''); s.blocked[k] = (s.blocked[k] || 0) + 1; }
      if (e.type === 'would_block') { const k = kind(e.reason || ''); s.observed[k] = (s.observed[k] || 0) + 1; }
      if (e.type === 'tool' && e.file) s.files.add(e.file);
      if (e.type === 'tool' && e.tool === 'Skill' && e.skill) s.skills[e.skill] = (s.skills[e.skill] || 0) + 1;
      if (e.type === 'turn_end') {
        if (e.verify === 'pass' || e.verify === 'fail') s.codeTurns++;
        if (e.verify === 'fail') s.endedFailing++;
        // The agent tried to stop with failing checks, was sent back, and finished green: a catch.
        if (e.verify === 'pass' && sentBack) s.caught++;
        sentBack = false;
      }
    }
  }
  if (!s.sessions) return null;

  // Rules broken today, from the session scores
  const broken = {};
  for (const [sid, v] of Object.entries(sb)) if ((v.at || '').startsWith(day)) for (const [id, st] of Object.entries(v.results || {})) if (st === 'fail') broken[id] = (broken[id] || 0) + 1;

  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const L = [`# ⚖ Referee — ${day}`, ''];
  const nBlocked = sum(s.blocked), nObserved = sum(s.observed);
  const headline = [];
  if (nBlocked) headline.push(`stopped **${nBlocked} risky move${nBlocked > 1 ? 's' : ''}**`);
  if (s.caught) headline.push(`sent the agent back **${s.caught} time${s.caught > 1 ? 's' : ''}** to fix failing checks before it finished`);
  if (nObserved) headline.push(`saw **${nObserved} risky move${nObserved > 1 ? 's' : ''}** it would have stopped (observe mode, so they ran)`);
  L.push(headline.length ? `Today the referee ${headline.length > 1 ? headline.slice(0, -1).join(', ') + ' and ' + headline.at(-1) : headline[0]}.` : 'A quiet day: nothing risky tried, no failing checks left behind.', '');
  L.push('| | Today |', '| --- | --- |');
  L.push(`| Sessions · messages | ${s.sessions} · ${s.prompts} |`);
  L.push(`| Turns that changed code | ${s.codeTurns} |`);
  L.push(`| Turns that ended with checks still failing | ${s.endedFailing}${s.codeTurns ? ` of ${s.codeTurns}` : ''} |`);
  L.push(`| Files touched | ${s.files.size} |`);
  if (nBlocked) L.push(`| Blocked | ${Object.entries(s.blocked).map(([k, n]) => `${n}× ${k}`).join(', ')} |`);
  if (nObserved) L.push(`| Would have blocked | ${Object.entries(s.observed).map(([k, n]) => `${n}× ${k}`).join(', ')} |`);
  const sk = Object.entries(s.skills).sort((a, b) => b[1] - a[1]);
  if (sk.length) L.push(`| Skills used | ${sk.map(([k, n]) => `${k} ×${n}`).join(', ')} |`);
  L.push('');
  const br = Object.entries(broken).sort((a, b) => b[1] - a[1]);
  if (br.length) {
    L.push('**Process slips today:**');
    for (const [id, n] of br) L.push(`- The agent ${plainOf[id] || id}${n > 1 ? ` (${n} sessions)` : ''}.`);
    const rep = br.find(([, n]) => n >= 2);
    if (rep) L.push('', `This happened more than once. Say "why does it keep doing this?" to fix the cause.`);
    L.push('');
  }
  L.push('Before-and-after since install: `node .referee/scripts/impact.mjs`');
  return L.join('\n');
}

export function writeDaily(day) {
  const md = daily(day);
  if (!md) return null;
  const dir = path.join(AGENT, 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `daily-${day}.md`);
  fs.writeFileSync(file, md);
  return path.relative(path.dirname(AGENT), file).split(path.sep).join('/');
}

if ((process.argv[1] || '').endsWith('daily.mjs')) {
  const day = process.argv[2] || new Date().toISOString().slice(0, 10);
  const md = daily(day);
  if (!md) { console.log(`No referee activity on ${day}.`); process.exit(0); }
  writeDaily(day);
  console.log(md);
}
