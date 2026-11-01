#!/usr/bin/env node
// UserPromptSubmit hook: picks the skill for this prompt with a regex table (same answer every time),
// tells the agent to load it, toggles full-send mode, snapshots the working tree for the Stop hook,
// and logs the prompt for the session audit.
import fs from 'node:fs';
import path from 'node:path';
import { AGENT, readStdin, logEvent, treeSnapshot, writeTurn } from '../lib.mjs';

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
  try { writeTurn(input.session_id, { snap: treeSnapshot(), blocks: 0 }); } catch {}
  // First run in this repo: onboard before anything else, then carry on with the request.
  const onboarded = fs.existsSync(path.join(state, 'onboarded'));
  const taskSkill = route(prompt);
  const skill = onboarded ? taskSkill : 'referee-onboard';
  logEvent(input.session_id, { type: 'prompt', text: prompt.slice(0, 200), routed: skill, fullSend });
  const lines = [];
  if (!onboarded) lines.push(`[Referee] First run in this repo: load the \`referee-onboard\` skill before doing anything else. Show the user what the referee found and how it will work here, then continue with their request${taskSkill ? ` using the \`${taskSkill}\` skill` : ''}.`);
  else if (skill) lines.push(`[Referee] Router: load the \`${skill}\` skill before doing anything else. The session audit checks this.`);
  if (fullSend) lines.push('[Referee] Full send is ON: you may merge after status is green.');
  if (lines.length) console.log(lines.join('\n'));
  process.exit(0);
}
