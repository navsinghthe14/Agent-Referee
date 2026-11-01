#!/usr/bin/env node
// statusline.mjs — the always-visible line at the bottom of Claude Code.
//   ⚖ Referee on · FULL STOP · 6/6 ✓ · checks ✓
// Claude Code passes session info as JSON on stdin; we use session_id to show this session's score.
// To keep your own status line too, set "statusLine.command" to: <your command>; node .referee/scripts/statusline.mjs
import { config, readStdin, readLast } from './lib.mjs';
import { fullSendLeft } from './report.mjs';

const raw = process.stdin.isTTY ? '' : await Promise.race([readStdin(), new Promise(r => setTimeout(() => r(''), 300))]);
let input = {}; try { input = JSON.parse(raw || '{}'); } catch {}
const cfg = config();
const last = readLast(input.session_id);
const left = fullSendLeft(cfg);

const parts = ['⚖ Referee on', left ? `FULL SEND (${left} left)` : 'FULL STOP'];
if (last?.sid === input.session_id && last?.score?.total) {
  parts.push(last.score.failed.length ? `${last.score.passed}/${last.score.total} · ✗ ${last.score.failed.length} rule${last.score.failed.length > 1 ? 's' : ''} broken (/referee)` : `${last.score.passed}/${last.score.total} ✓`);
}
if (last?.sid === input.session_id && last?.verify === 'pass') parts.push('checks ✓');
if (last?.sid === input.session_id && last?.verify === 'fail') parts.push('checks ✗');
if (!cfg.verify) parts.push('no checks set');
console.log(parts.join(' · '));
process.exit(0);
