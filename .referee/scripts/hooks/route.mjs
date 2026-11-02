#!/usr/bin/env node
// UserPromptSubmit hook: picks the skill for this prompt with a regex table (same answer every time),
// tells the agent to load it, toggles full-send mode, snapshots the working tree for the Stop hook,
// and logs the prompt for the session audit.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { AGENT, readStdin, logEvent, treeSnapshot, writeTurn, config, effectiveMode } from '../lib.mjs';

export function route(prompt) {
  const table = JSON.parse(fs.readFileSync(path.join(AGENT, 'routing.json'), 'utf8')).routes;
  for (const r of table) if (new RegExp(r.pattern, 'i').test(prompt)) return r.skill;
  return null;
}

// "full send" only counts as an instruction, not when negated or quoted ("don't full send", "what does 'full send' do?").
export function fullSendIntent(prompt) {
  if (!/\bfull send\b/i.test(prompt)) return false;
  if (/\b(don'?t|do not|no|not|never|without)\s+(\w+\s+){0,2}full send\b/i.test(prompt)) return false;
  if (/["'`“‘]full send["'`”’]/i.test(prompt)) return false;
  return true;
}

if (process.env.REFEREE_HOOK === 'route' || (process.argv[1] || '').endsWith('route.mjs')) {
  const raw = await readStdin();
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch {}
  const prompt = String(input.prompt || '');
  const state = path.join(AGENT, 'state');
  const flag = path.join(state, 'full-send');
  let fullSend = false;
  if (fullSendIntent(prompt)) { fs.mkdirSync(state, { recursive: true }); fs.writeFileSync(flag, new Date().toISOString()); fullSend = true; }
  else if (/\bfull stop\b/i.test(prompt) && fs.existsSync(flag)) fs.unlinkSync(flag);
  // Only the user can unlock agreed tests (spec-first), like "full send".
  let unlocked = false;
  if (/\bunlock (the |all |these |those )?tests\b/i.test(prompt) && !/\b(don'?t|do not|never)\s+(\w+\s+){0,2}unlock\b/i.test(prompt) && !/["'`“‘]unlock the tests["'`”’]/i.test(prompt)) {
    try { fs.rmSync(path.join(state, 'locks.json'), { force: true }); unlocked = true; } catch {}
  }
  try { writeTurn(input.session_id, { snap: treeSnapshot(), blocks: 0 }); } catch {}
  const onboarded = fs.existsSync(path.join(state, 'onboarded'));
  // First run: the hook scans the repo itself (read-only) and queues a one-line summary that the stop hook
  // shows the user after this message. Done by code, not left to the agent: in a live test the agent loaded
  // the onboarding skill, ran the scan, then went straight to the task without showing it.
  if (!onboarded) {
    try {
      const scan = path.join(AGENT, 'scripts', 'scan.mjs');
      spawnSync(process.execPath, [scan], { cwd: path.dirname(AGENT), encoding: 'utf8', timeout: 20000 });
      const sum = spawnSync(process.execPath, [scan, '--summary'], { cwd: path.dirname(AGENT), encoding: 'utf8', timeout: 20000 }).stdout.trim();
      fs.mkdirSync(state, { recursive: true });
      fs.writeFileSync(path.join(state, 'onboard-pending'), sum || 'scan saved');
      fs.writeFileSync(path.join(state, 'onboarded'), new Date().toISOString());
    } catch {}
  }
  // Observe mode (after the first-run scan): record the prompt and say nothing,
  // so the agent behaves as it would without the referee.
  if (onboarded && effectiveMode() === 'observe') {
    logEvent(input.session_id, { type: 'prompt', text: prompt.slice(0, 200), routed: null, fullSend, mode: 'observe' });
    process.exit(0);
  }
  // First message of a new day: show yesterday's summary before the task.
  const today = new Date().toISOString().slice(0, 10);
  const dayFile = path.join(state, 'last-day');
  let lastDay = ''; try { lastDay = fs.readFileSync(dayFile, 'utf8').trim(); } catch {}
  let summaryNote = '';
  if (onboarded && lastDay && lastDay !== today) {
    try {
      const { writeDaily } = await import('../daily.mjs');
      const file = writeDaily(lastDay);
      if (file) summaryNote = `[Referee] New day. Before the task, show the user yesterday's referee summary: read ${file} and show it as written (it's short), then continue.`;
    } catch {}
  }
  try { fs.mkdirSync(state, { recursive: true }); fs.writeFileSync(dayFile, today); } catch {}
  // First run in this repo: onboard before anything else, then carry on with the request.
  const taskSkill = route(prompt);
  const skill = onboarded ? taskSkill : 'referee-onboard';
  logEvent(input.session_id, { type: 'prompt', text: prompt.slice(0, 200), routed: skill, fullSend });
  const lines = [];
  if (unlocked) lines.push('[Referee] The user unlocked the agreed tests. Change only what they asked, then lock them again with `node .referee/scripts/spec.mjs lock <spec>`.');
  if (summaryNote) lines.push(summaryNote);
  if (!onboarded) lines.push(`[Referee] First run in this repo: load the \`referee-onboard\` skill before doing anything else. The referee has already scanned the repo: read .referee/reports/scan.md and show the user its three tables, then continue with their request${taskSkill ? ` using the \`${taskSkill}\` skill` : ''}.`);
  else if (skill) lines.push(`[Referee] Router: load the \`${skill}\` skill before doing anything else. The session audit checks this.`);
  if (fullSend) lines.push('[Referee] Full send is ON: you may merge after status is green.');
  if (lines.length) console.log(lines.join('\n'));
  process.exit(0);
}
