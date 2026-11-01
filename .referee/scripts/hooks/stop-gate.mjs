#!/usr/bin/env node
// Stop hook: (1) grades the session (audit report, never blocks); (2) if THIS TURN changed files and
// config.verify is set, runs it and refuses to let the agent finish while it fails, up to
// config.stopGateMaxBlocks times per turn (default 3), then hands the failure to the human.
import { config, readStdin, sh, treeSnapshot, readTurn, writeTurn } from '../lib.mjs';
import { audit } from '../audit.mjs';

if (process.env.REFEREE_HOOK === 'stop-gate' || (process.argv[1] || '').endsWith('stop-gate.mjs')) {
  const raw = await readStdin();
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch {}
  const sid = input.session_id;

  try {
    const r = sid && audit(sid);
    if (r && r.total) console.error(`[Referee] Session audit ${r.passed}/${r.total}` + (r.failed.length ? ` — failed: ${r.failed.map(f => f.id).join(', ')} (see .referee/audits/${sid}.md)` : ''));
  } catch (e) { console.error(`[Referee] Session audit error: ${e.message}`); }

  const cfg = config();
  if (!cfg.verify) process.exit(0);

  const turn = readTurn(sid) || { snap: null, blocks: 0 };
  const now = treeSnapshot();
  // Unchanged since the prompt (or since the last green verify): nothing new to check.
  // No snapshot (route hook didn't run): fall back to the old behaviour and verify.
  if (turn.snap && turn.snap === now) process.exit(0);

  const r = sh(cfg.verify);
  if (r.ok) { writeTurn(sid, { snap: now, blocks: 0 }); process.exit(0); }

  const max = cfg.stopGateMaxBlocks ?? 3;
  const blocks = (turn.blocks || 0) + 1;
  writeTurn(sid, { snap: turn.snap, blocks });
  const tail = r.out.split('\n').slice(-30).join('\n');
  if (blocks <= max) {
    console.error(`[Referee] "${cfg.verify}" fails (attempt ${blocks}/${max}). Fix it before finishing, or tell the user exactly what is broken.\n` + tail);
    process.exit(2);
  }
  console.error(`[Referee] "${cfg.verify}" still fails after ${max} attempts. Stopping anyway: tell the user exactly what is broken.\n` + tail);
  process.exit(0);
}
