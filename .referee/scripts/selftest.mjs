#!/usr/bin/env node
// selftest.mjs — regression tests for the kit itself. Runs the hooks exactly as Claude Code does
// (the launcher commands in .claude/settings.json) inside a throwaway git repo.
//   node .referee/scripts/selftest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'referee-selftest-'));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: tmp, encoding: 'utf8', ...opts });
run('git', ['init', '-q', '-b', 'main']);
fs.cpSync(path.join(KIT, '.referee'), path.join(tmp, '.referee'), { recursive: true, filter: s => !/[\\/](logs|audits|state|reports)([\\/]|$)/.test(s) });
fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
fs.copyFileSync(path.join(KIT, '.claude', 'settings.json'), path.join(tmp, '.claude', 'settings.json'));
const cfgPath = path.join(tmp, '.referee', 'config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
cfg.verify = ''; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
fs.writeFileSync(path.join(tmp, 'a.txt'), 'x');
run('git', ['add', '-A']); run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
run('git', ['checkout', '-qb', 'feature']);

const settings = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf8')).hooks;
const launcher = { route: settings.UserPromptSubmit, guard: settings.PreToolUse, log: settings.PostToolUse, stop: settings.Stop }
  ;for (const k in launcher) launcher[k] = launcher[k][0].hooks[0].command;
const env = { ...process.env, CLAUDE_PROJECT_DIR: tmp, REFEREE_ROOT: tmp };
delete env.REFEREE_HOOK; delete env.REFEREE_ALLOW_PROTECTED;
const hook = (name, payload) => spawnSync(launcher[name], { cwd: tmp, shell: true, encoding: 'utf8', input: JSON.stringify(payload), env });

let fail = 0;
const t = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${detail}`}`); if (!ok) fail++; };
const guard = (tool, tool_input) => hook('guard', { session_id: 'g', tool_name: tool, tool_input }).status;
const edit = f => guard('Edit', { file_path: path.join(tmp, f) });
const bash = c => guard('Bash', { command: c });

// 1. Protected globs ending in ** (original bug: never matched)
t('blocks Edit of supabase/migrations/001.sql', edit('supabase/migrations/001.sql') === 2);
t('blocks Edit of apps/web/prisma/migrations/x/migration.sql', edit('apps/web/prisma/migrations/x/migration.sql') === 2);
t('blocks Edit of .referee/scripts/hooks/guard.mjs', edit('.referee/scripts/hooks/guard.mjs') === 2);
t('blocks Edit of nested apps/web/.env.local', edit('apps/web/.env.local') === 2);
t('allows Edit of src/app.ts', edit('src/app.ts') === 0);

// 2. Bash side doors
t('blocks self-granting full send (touch)', bash('touch .referee/state/full-send') === 2);
t('blocks self-granting full send (node)', bash(`node -e "require('fs').writeFileSync('.referee/state/full-send','')"`) === 2);
t('blocks echo >> .env', bash('echo X=1 >> .env') === 2);
t('blocks sed -i on a migration', bash('sed -i s/a/b/ supabase/migrations/001.sql') === 2);
t('blocks rm of guard.mjs', bash('rm .referee/scripts/hooks/guard.mjs') === 2);
t('allows reading .env', bash('cat .env') === 0);
t('allows running method.mjs status', bash('node .referee/scripts/method.mjs status') === 0);
t('blocks merge via gh api', bash('gh api -X PUT repos/o/r/pulls/1/merge') === 2);
t('blocks gh pr merge', bash('gh pr merge 1 --squash') === 2);

// 3. Push rules match branch names exactly
t('allows push of branch fix-main-nav', bash('git push origin fix-main-nav') === 0);
t('allows push -u of feature branch', bash('git push -u origin feature') === 0);
t('blocks push origin main', bash('git push origin main') === 2);
t('blocks push HEAD:main', bash('git push origin HEAD:main') === 2);
t('blocks push HEAD:refs/heads/main', bash('git push origin HEAD:refs/heads/main') === 2);
t('blocks bare push while on main', (run('git', ['checkout', '-q', 'main']), bash('git push')) === 2);
run('git', ['checkout', '-q', 'feature']);
t('blocks +main force refspec', bash('git push origin +main') === 2);
t('blocks --all', bash('git push --all origin') === 2);

// 4. Full send: only from the user's prompt, and not when negated or quoted
const routeP = p => hook('route', { session_id: 'r', prompt: p });
routeP("don't full send this, I want to look first");
t('negated "full send" does not enable merging', bash('gh pr merge 1') === 2);
routeP('what does "full send" mean?');
t('quoted "full send" does not enable merging', bash('gh pr merge 1') === 2);
routeP('fix the header, full send');
t('"full send" in a prompt enables merging', bash('gh pr merge 1') === 0);
t('force push to main still blocked in full send', bash('git push -f origin main') === 2);
routeP('ok, full stop');
t('"full stop" turns merging back off', bash('gh pr merge 1') === 2);

// 5. Audit: routed skill checked per turn; every PR checked
const logs = path.join(tmp, '.referee', 'logs'); fs.mkdirSync(logs, { recursive: true });
const writeLog = (id, rows) => fs.writeFileSync(path.join(logs, `${id}.jsonl`), rows.map(r => JSON.stringify({ t: '1', ...r })).join('\n') + '\n');
writeLog('s1', [
  { type: 'prompt', text: 'rename var', routed: null }, { type: 'tool', tool: 'Edit', file: 'a.ts' },
  { type: 'prompt', text: 'open a PR', routed: 'file-pr' }, { type: 'tool', tool: 'Skill', skill: 'file-pr' },
]);
const auditOut = id => spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/audit.mjs'), id], { cwd: tmp, encoding: 'utf8', env }).stdout;
t('routed skill loaded in its own turn passes', /routed-skill-loaded \| ✓ pass/.test(auditOut('s1')), auditOut('s1'));
writeLog('s2', [
  { type: 'prompt', text: 'open a PR', routed: 'file-pr' }, { type: 'tool', tool: 'Edit', file: 'a.ts' }, { type: 'tool', tool: 'Skill', skill: 'file-pr' },
]);
t('routed skill loaded after the edit fails', /routed-skill-loaded \| ✗ fail/.test(auditOut('s2')));
writeLog('s3', [
  { type: 'tool', tool: 'Skill', skill: 'file-pr' }, { type: 'tool', tool: 'Skill', skill: 'review-loop' }, { type: 'tool', tool: 'Agent', subagent: 'independent-reviewer' },
  { type: 'tool', tool: 'Bash', cmd: 'gh pr create' }, { type: 'tool', tool: 'Bash', cmd: 'gh pr create --title second' },
]);
t('second PR is checked too (passes when first steps cover it)', /review-before-pr \| ✓ pass/.test(auditOut('s3')));
writeLog('s4', [
  { type: 'tool', tool: 'Bash', cmd: 'gh pr merge 1', fullSend: true }, { type: 'tool', tool: 'Bash', cmd: 'gh pr merge 2', fullSend: false },
]);
t('a later merge without full send fails the audit', /no-merge-without-full-send \| ✗ fail/.test(auditOut('s4')));
// README example: a rule scoped to files with "file": "db/**"
const rulesPath = path.join(tmp, '.referee', 'session-rules.json');
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
rules.rules.push({ id: 'db-uses-migration-skill', type: 'requires_before', when: { tool: 'Edit', file: 'db/**' }, require: [{ tool: 'Skill', skill: 'migration' }], why: 'test' });
fs.writeFileSync(rulesPath, JSON.stringify(rules));
writeLog('s5', [{ type: 'tool', tool: 'Edit', file: 'src/a.ts' }]);
t('file-scoped rule ignores edits outside db/', /db-uses-migration-skill \| n\/a/.test(auditOut('s5')));
writeLog('s6', [{ type: 'tool', tool: 'Edit', file: 'db/schema.sql' }]);
t('file-scoped rule fails an edit in db/ without the skill', /db-uses-migration-skill \| ✗ fail/.test(auditOut('s6')));

// 6. Stop gate: skips unchanged turns, caps blocks
cfg.verify = 'node -e "process.exit(1)"'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
routeP('just a question about the code');
t('stop gate skips verify when the turn changed nothing', hook('stop', { session_id: 'r' }).status === 0);
fs.writeFileSync(path.join(tmp, 'a.txt'), 'changed');
const s1 = hook('stop', { session_id: 'r' }).status, s2 = hook('stop', { session_id: 'r', stop_hook_active: true }).status;
const s3 = hook('stop', { session_id: 'r', stop_hook_active: true }).status, s4 = hook('stop', { session_id: 'r', stop_hook_active: true }).status;
t('stop gate blocks a failing verify 3 times, then lets go', [s1, s2, s3, s4].join() === '2,2,2,0', [s1, s2, s3, s4].join());
cfg.verify = 'node -e "process.exit(0)"'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
routeP('change it again'); fs.writeFileSync(path.join(tmp, 'a.txt'), 'changed again');
t('stop gate passes a green verify', hook('stop', { session_id: 'r' }).status === 0);

// 7. Log hook runs through the launcher
hook('log', { session_id: 'L', tool_name: 'Skill', tool_input: { skill: 'ship' } });
t('log hook writes the session log', fs.existsSync(path.join(logs, 'L.jsonl')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} failing` : '\nall passing');
process.exit(fail ? 1 : 0);
