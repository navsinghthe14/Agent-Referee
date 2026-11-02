#!/usr/bin/env node
// Stop hook, runs every time the agent tries to finish a turn:
// (1) scores the session (never blocks);
// (2) if THIS TURN changed files and config.verify is set, runs it and refuses to let the agent finish
//     while it fails, up to config.stopGateMaxBlocks times per turn (default 3), then hands it to the human;
// (3) shows the user a one-line result after each message (config.showResultsEachMessage, default on)
//     and saves it for the status line and /referee.
import { AGENT, config, readStdin, runVerify, treeSnapshot, readTurn, writeTurn, writeLast, logEvent, effectiveMode } from '../lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../audit.mjs';
import { resultLine } from '../report.mjs';

if (process.env.REFEREE_HOOK === 'stop-gate' || (process.argv[1] || '').endsWith('stop-gate.mjs')) {
  const raw = await readStdin();
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch {}
  const sid = input.session_id;
  const cfg = config();

  let score = null;
  try {
    const r = sid && audit(sid);
    if (r) score = { passed: r.passed, total: r.total, failed: r.failed.map(f => ({ id: f.id, evidence: f.evidence, plain: f.plain })) };
  } catch (e) { console.error(`[Referee] Session audit error: ${e.message}`); }

  // Finish the turn: save the result and show it to the user.
  const observe = effectiveMode(cfg) === 'observe';
  const done = (verify, code = 0, agentMessage = '') => {
    const last = { sid, at: new Date().toISOString(), score, verify, verifyCmd: cfg.verify || '', mode: observe ? 'observe' : 'enforce' };
    try { writeLast(last); } catch {}
    // One event per finished turn, for impact.mjs: did the agent end this turn with failing checks?
    if (code !== 2 || observe) try { logEvent(sid, { type: 'turn_end', verify, mode: last.mode }); } catch {}
    else try { logEvent(sid, { type: 'stop_blocked', verify }); } catch {}
    // Observe mode never blocks and stays silent: we're measuring the agent's normal behaviour.
    if (observe) process.exit(0);
    if (code === 2) { console.error(agentMessage); process.exit(2); }
    if (agentMessage) console.error(agentMessage);
    // First message in the repo: show what the scan found, whatever the agent did with it.
    let onboard = '';
    const pend = path.join(AGENT, 'state', 'onboard-pending');
    try { onboard = fs.readFileSync(pend, 'utf8').trim(); fs.rmSync(pend, { force: true }); } catch {}
    const lines = [];
    if (onboard) lines.push(`⚖ Referee scanned this repo: ${onboard} · full report: .referee/reports/scan.md`);
    if (cfg.showResultsEachMessage !== false) lines.push(resultLine(last));
    if (lines.length) console.log(JSON.stringify({ systemMessage: lines.join('\n') }));
    process.exit(0);
  };

  if (!cfg.verify) done('off');

  const turn = readTurn(sid) || { snap: null, blocks: 0 };
  const now = treeSnapshot();
  // Unchanged since the prompt (or since the last green verify): nothing new to check.
  // No snapshot (route hook didn't run): fall back to verifying.
  if (turn.snap && turn.snap === now) done(turn.lastVerify || 'unchanged');

  const r = runVerify(cfg.verify);
  if (r.ok) { writeTurn(sid, { snap: now, blocks: 0, lastVerify: 'pass' }); done('pass'); }

  // The checks couldn't run at all (tools or dependencies missing): not the code's fault.
  // Don't send the agent back to "fix" it (it would start installing things); tell the user instead.
  if (r.setup) {
    writeTurn(sid, { snap: now, blocks: 0, lastVerify: 'setup' });
    done('setup', 0, `[Referee] "${cfg.verify}" couldn't run${r.missing.length ? ` (not found: ${r.missing.join(', ')})` : ''}: the repo's tools or dependencies aren't installed. Don't install them unless the user asked; tell the user the checks didn't run.`);
  }

  const max = cfg.stopGateMaxBlocks ?? 3;
  const tail = r.out.split('\n').slice(-30).join('\n');
  // Sent back already and nothing changed since: the agent chose to explain rather than fix. Let it.
  if (turn.blockedAt && turn.blockedAt === now) {
    writeTurn(sid, { ...turn, lastVerify: 'fail' });
    done('fail', 0, `[Referee] "${cfg.verify}" still fails and the code hasn't changed since the last try. Stopping: make sure the user knows exactly what is broken.`);
  }
  const blocks = (turn.blocks || 0) + 1;
  writeTurn(sid, { snap: turn.snap, blocks, lastVerify: 'fail', blockedAt: now });
  if (blocks <= max) done('fail', 2, `[Referee] "${cfg.verify}" fails (attempt ${blocks}/${max}). Fix it before finishing, or tell the user exactly what is broken.\n` + tail);
  done('fail', 0, `[Referee] "${cfg.verify}" still fails after ${max} attempts. Stopping anyway: tell the user exactly what is broken.\n` + tail);
}
