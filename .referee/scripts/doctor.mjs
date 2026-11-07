#!/usr/bin/env node
// doctor.mjs — is the referee installed and working in this repo?
//   node .referee/scripts/doctor.mjs           quick (a few seconds)
//   node .referee/scripts/doctor.mjs --full    also runs your verify command
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, AGENT, config, git, sh, fullSendActive, effectiveMode, logsDir } from './lib.mjs';

const rows = [];
const add = (ok, name, note = '', warn = false) => rows.push({ ok, name, note, warn });
const cfg = config();

// Node
const major = Number(process.versions.node.split('.')[0]);
add(major >= 18, `Node ${process.versions.node}`, major >= 18 ? '' : 'needs Node 18 or newer');

// Git
const inGit = git(['rev-parse', '--is-inside-work-tree']) === 'true';
add(inGit, 'Git repository', inGit ? (git(['rev-parse', '--abbrev-ref', 'HEAD']) || '') : 'run inside a git repo');

// Hooks registered
let settings = {};
try { settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8')); } catch {}
const hooks = settings.hooks || {};
const has = (ev, file) => (hooks[ev] || []).some(g => (g.hooks || []).some(h => /\.referee\W+scripts\W+hooks\W/.test(h.command || '') && (h.command || '').includes(file)));
const want = [['UserPromptSubmit', 'route.mjs', 'picks the skill'], ['PreToolUse', 'guard.mjs', 'blocks risky moves'], ['PostToolUse', 'log.mjs', 'records actions'], ['Stop', 'stop-gate.mjs', 'scores and checks']];
const missing = want.filter(([ev, f]) => !has(ev, f));
add(!missing.length, 'Hooks registered in .claude/settings.json', missing.length ? `missing: ${missing.map(m => m[1]).join(', ')}. Re-run install.sh` : '4 of 4');

// Status line
const sl = settings.statusLine?.command || '';
add(sl.includes('statusline.mjs'), 'Status line', sl.includes('statusline.mjs') ? 'shows "⚖ Referee on" at the bottom of Claude Code' : sl ? 'you have your own status line; see README to add the referee to it' : 'not set. Re-run install.sh', !sl.includes('statusline.mjs'));

// Skills and command
const skillsDir = path.join(ROOT, '.claude', 'skills');
const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md'))) : [];
add(skills.includes('referee-rules'), 'Skills', `${skills.length} found${skills.includes('referee-rules') ? '' : ', referee-rules missing'}`);
add(fs.existsSync(path.join(ROOT, '.claude', 'commands', 'referee.md')), '/referee command');

// Verify command
add(!!cfg.verify, 'Checks command (verify)', cfg.verify ? cfg.verify : 'not set; add "verify" in .referee/config.json', !cfg.verify);
if (cfg.verify && process.argv.includes('--full')) {
  const r = sh(cfg.verify);
  add(r.ok, 'Checks pass right now', r.ok ? '' : r.out.split('\n').filter(Boolean).slice(-2).join(' | '), !r.ok);
}

// Settings from older versions
const oldMig = (cfg.protectedPaths || []).filter(g => /migrations|alembic/.test(g));
add(!oldMig.length, 'Migrations are add-only', oldMig.length ? `${oldMig.join(', ')} is still in protectedPaths, so new migrations are blocked too. Run install.sh --upgrade` : 'new migrations allowed, existing ones locked', !!oldMig.length);
add(!!(cfg.secretPaths || []).length, 'Secrets files are not read', (cfg.secretPaths || []).length ? '.env and keys blocked; .env.example readable' : 'no secretPaths set. Run install.sh --upgrade', !(cfg.secretPaths || []).length);

// gh
const gh = sh('gh --version').ok;
add(gh, 'GitHub CLI (gh)', gh ? '' : 'optional; needed for PRs and "method.mjs status"', !gh);

// Live guard test: feed the guard a push to main, exactly as Claude Code would.
// The referee's own guard: a repo can have its own guard.mjs too (Evalor does), so match the .referee path.
const ours = (c = '') => /\.referee\W+scripts\W+hooks\W/.test(c);
const hookCmd = (hooks.PreToolUse || []).flatMap(g => g.hooks || []).find(h => ours(h.command) && (h.command || '').includes('guard.mjs'))?.command;
if (hookCmd) {
  const r = spawnSync(hookCmd, {
    cwd: ROOT, shell: true, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, REFEREE_ALLOW_PROTECTED: '' },
    input: JSON.stringify({ session_id: 'doctor', tool_name: 'Bash', tool_input: { command: `git push origin ${cfg.mainBranch || 'main'}` } }),
  });
  const fullSendOn = fullSendActive(cfg);
  const observing = effectiveMode(cfg) === 'observe';
  let recorded = false;
  try { recorded = /would_block/.test(fs.readFileSync(path.join(logsDir(), 'doctor.jsonl'), 'utf8')); } catch {}
  const ok = observing ? r.status === 0 && recorded : r.status === 2 || (r.status === 0 && fullSendOn);
  add(ok, observing ? 'Live test: guard records a push to main (observe mode)' : 'Live test: guard blocks a push to main',
    ok ? (observing ? `recorded, not blocked: observing${cfg.baselineUntil ? ` until ${cfg.baselineUntil.slice(0, 10)}` : ''}` : r.status === 2 ? 'blocked as expected' : 'allowed: full send is on right now')
       : `unexpected exit ${r.status}: ${(r.stderr || '').trim().slice(0, 120)}`);
  // Don't let the doctor's test count against a real session score.
  try { fs.rmSync(path.join(logsDir(), 'doctor.jsonl'), { force: true }); } catch {}
} else add(false, 'Live test: guard blocks a push to main', 'guard hook not registered');

// Print
console.log('\n⚖ Agent Referee — doctor\n');
for (const r of rows) console.log(`  ${r.ok ? '✓' : r.warn ? '!' : '✗'} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
const bad = rows.filter(r => !r.ok && !r.warn);
console.log(bad.length
  ? `\n✗ ${bad.length} problem(s) above. Fix them, then run: node .referee/scripts/doctor.mjs`
  : `\n✓ The referee is on. Open Claude Code here: you'll see "⚖ Referee on" at the bottom,\n  a result line after each message, and /referee shows the full report.`);
process.exit(bad.length ? 1 : 0);
