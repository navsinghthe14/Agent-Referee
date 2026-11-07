#!/usr/bin/env node
// report.mjs — the referee's results in plain words.
//   node .referee/scripts/report.mjs           full report (what /referee shows)
//   resultLine(last)                            the one line shown after each message
import fs from 'node:fs';
import path from 'node:path';
import { AGENT, config, fullSendActive, readLast, auditsDir } from './lib.mjs';

const VERIFY_TEXT = { pass: 'checks ✓', fail: 'checks ✗', setup: "checks couldn't run (install the repo's dependencies)", unchanged: 'no code changed', off: 'no checks set' };

export function fullSendLeft(cfg = config()) {
  const f = path.join(AGENT, 'state', 'full-send');
  if (!fullSendActive(cfg)) return null;
  const ms = (cfg.fullSendHours || 6) * 3600e3 - (Date.now() - fs.statSync(f).mtimeMs);
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// One line, shown to the user after every message.
export function resultLine(last) {
  if (!last) return '⚖ Referee · no results yet';
  const parts = ['⚖ Referee'];
  const s = last.score;
  if (s && s.total) {
    parts.push(s.failed.length ? `${s.passed}/${s.total}` : `${s.passed}/${s.total} ✓`);
  } else parts.push('no rules triggered yet');
  const v = VERIFY_TEXT[last.verify];
  if (v) parts.push(v);
  if (s && s.failed.length) {
    const f = s.failed[0];
    parts.push(`✗ ${f.plain || `${f.id}: ${f.evidence}`}${s.failed.length > 1 ? ` (+${s.failed.length - 1} more)` : ''}`);
    parts.push('say /referee for details');
  }
  return parts.join(' · ');
}

export function report(sessionId) {
  const cfg = config();
  const last = readLast(sessionId);
  const left = fullSendLeft(cfg);
  const out = [];
  out.push(`⚖ Agent Referee`);
  out.push('');
  out.push(`Mode:    ${left ? `FULL SEND (the agent may merge once checks are green; ${left} left)` : 'FULL STOP (the agent stops at a ready PR; you press merge)'}`);
  out.push(`Checks:  ${cfg.verify ? `\`${cfg.verify}\`` : 'none set (add "verify" in .referee/config.json)'}`);
  if (!last) {
    out.push('');
    out.push('No results yet. Results appear after the agent finishes its first message in this repo.');
    return out.join('\n');
  }
  out.push(`Last run: ${VERIFY_TEXT[last.verify] || last.verify} (${last.at.replace('T', ' ').slice(0, 16)} UTC)`);
  out.push('');
  const auditFile = path.join(auditsDir(), `${last.sid}.md`);
  if (fs.existsSync(auditFile)) {
    const md = fs.readFileSync(auditFile, 'utf8');
    const checks = md.split('## Checks')[1];
    out.push(`This session: ${last.score?.total ? `${last.score.passed}/${last.score.total}` : 'no rules triggered yet'}`);
    for (const f of last.score?.failed || []) out.push(`  ✗ The agent ${f.plain || f.id}.`);
    out.push('');
    if (checks) out.push(checks.trim());
    out.push('');
    out.push(`Full session report: ${auditFile}`);
  }
  const sb = path.join(auditsDir(), 'scoreboard.json');
  if (fs.existsSync(sb)) {
    const all = Object.values(JSON.parse(fs.readFileSync(sb, 'utf8')));
    const fails = {};
    for (const s of all) for (const [id, st] of Object.entries(s.results)) if (st === 'fail') fails[id] = (fails[id] || 0) + 1;
    const repeat = Object.entries(fails).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
    out.push(`Across ${all.length} session(s): ${repeat.length ? 'repeated failures: ' + repeat.map(([id, n]) => `${id} ×${n}`).join(', ') + '. Say "why does it keep doing this?" to fix the cause.' : 'no repeated failures.'}`);
  }
  return out.join('\n');
}

if ((process.argv[1] || '').endsWith('report.mjs')) console.log(report(process.argv[2]));
