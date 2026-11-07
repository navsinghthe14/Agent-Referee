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

// Put another tool's hook first on every event, as a real repo may have (field-trial bug).
{
  const sp = path.join(tmp, '.claude', 'settings.json');
  const sj = JSON.parse(fs.readFileSync(sp, 'utf8'));
  for (const ev of Object.keys(sj.hooks)) sj.hooks[ev].unshift({ matcher: '*', hooks: [{ type: 'command', command: 'node -e "process.exit(0)"' }] });
  fs.writeFileSync(sp, JSON.stringify(sj));
}
const settings = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf8')).hooks;
// Find each referee hook by its file name, not its position: a repo may already have its own hooks
// on the same events (field-trial bug: 11 of 74 tests failed because another hook came first).
const findHook = (ev, file) => (settings[ev] || []).flatMap(g => g.hooks || []).find(h => (h.command || '').includes(file))?.command;
const launcher = { route: findHook('UserPromptSubmit', 'route.mjs'), guard: findHook('PreToolUse', 'guard.mjs'), log: findHook('PostToolUse', 'log.mjs'), stop: findHook('Stop', 'stop-gate.mjs') };
for (const [k, v] of Object.entries(launcher)) if (!v) { console.log(`✗ referee ${k} hook not found in .claude/settings.json. Re-run install.sh`); process.exit(1); }
const env = { ...process.env, CLAUDE_PROJECT_DIR: tmp, REFEREE_ROOT: tmp };
delete env.REFEREE_HOOK; delete env.REFEREE_ALLOW_PROTECTED;
const hook = (name, payload) => spawnSync(launcher[name], { cwd: tmp, shell: true, encoding: 'utf8', input: JSON.stringify(payload), env });

let fail = 0;
const t = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${detail}`}`); if (!ok) fail++; };
const guard = (tool, tool_input) => hook('guard', { session_id: 'g', tool_name: tool, tool_input }).status;
const edit = f => guard('Edit', { file_path: path.join(tmp, f) });
const bash = c => guard('Bash', { command: c });

// Existing migrations for the append-only tests (a migration that already ran).
for (const f of ['supabase/migrations/001.sql', 'apps/web/prisma/migrations/x/migration.sql', 'backend/app/alembic/versions/1a2b_add_bio.py']) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), '-- applied'); }

// 1. Protected globs ending in ** (original bug: never matched)
t('blocks Edit of supabase/migrations/001.sql', edit('supabase/migrations/001.sql') === 2);
t('blocks Edit of apps/web/prisma/migrations/x/migration.sql', edit('apps/web/prisma/migrations/x/migration.sql') === 2);
t('blocks Edit of .referee/scripts/hooks/guard.mjs', edit('.referee/scripts/hooks/guard.mjs') === 2);
t('blocks Edit of nested apps/web/.env.local', edit('apps/web/.env.local') === 2);
t('allows Edit of src/app.ts', edit('src/app.ts') === 0);
t('blocks Edit of an Alembic migration (backend/app/alembic/versions)', edit('backend/app/alembic/versions/1a2b_add_bio.py') === 2);
t('allows Edit of .env.example (a template, not secrets)', edit('.env.example') === 0 && edit('apps/web/.env.example') === 0);
t('still blocks Edit of .env.local', edit('.env.local') === 2);

// 2. Bash side doors
t('blocks self-granting full send (touch)', bash('touch .referee/state/full-send') === 2);
t('blocks self-granting full send (node)', bash(`node -e "require('fs').writeFileSync('.referee/state/full-send','')"`) === 2);
t('blocks echo >> .env', bash('echo X=1 >> .env') === 2);
t('blocks sed -i on a migration', bash('sed -i s/a/b/ supabase/migrations/001.sql') === 2);
t('blocks rm of guard.mjs', bash('rm .referee/scripts/hooks/guard.mjs') === 2);
// Secrets (field-trial ask: enforce "never print secrets")
t('blocks printing .env (cat)', bash('cat .env') === 2);
t('blocks grep inside .env', bash('grep API_KEY apps/web/.env.local') === 2);
t('blocks copying .env', bash('cp .env /tmp/x') === 2);
t('blocks the Read tool on .env', guard('Read', { file_path: path.join(tmp, '.env') }) === 2);
t('blocks the Grep tool on .env', guard('Grep', { pattern: 'KEY', path: path.join(tmp, '.env') }) === 2);
t('blocks reading a private key', guard('Read', { file_path: path.join(tmp, 'certs/server.key') }) === 2);
t('allows reading .env.example', guard('Read', { file_path: path.join(tmp, '.env.example') }) === 0 && bash('cat .env.example') === 0);
t('allows checking .env exists, and loading it into a command', bash('ls -la .env') === 0 && bash('[ -f .env ] && echo yes') === 0 && bash('set -a; source .env; npm test') === 0 && bash('docker compose --env-file .env up -d') === 0);
// Migrations are add-only (field-trial bug: creating a new migration was blocked)
t('allows creating a new migration (Write)', guard('Write', { file_path: path.join(tmp, 'supabase/migrations/002_add_bio.sql'), content: 'x' }) === 0);
t('allows creating a new migration from the shell', bash('cat > supabase/migrations/003_new.sql <<EOF\nselect 1;\nEOF') === 0);
t('blocks overwriting an existing migration (Write)', guard('Write', { file_path: path.join(tmp, 'supabase/migrations/001.sql'), content: 'x' }) === 2);
t('blocks deleting an existing migration', bash('rm supabase/migrations/001.sql') === 2);
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
t('"full send" alone does not let the agent merge (fullSendMerges is off by default)', bash('gh pr merge 1') === 2 && bash('git push origin main') === 2);
cfg.fullSendMerges = true; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
t('"full send" enables merging when the repo opts in (fullSendMerges)', bash('gh pr merge 1') === 0);
t('force push to main still blocked in full send', bash('git push -f origin main') === 2);
routeP('ok, full stop');
t('"full stop" turns merging back off', bash('gh pr merge 1') === 2);
delete cfg.fullSendMerges; fs.writeFileSync(cfgPath, JSON.stringify(cfg));

// 5. Audit: routed skill checked per turn; every PR checked
// Logs live in git's common directory, shared by every worktree (not per folder).
const shared = path.join(tmp, '.git', 'referee');
const logs = path.join(shared, 'logs'); fs.mkdirSync(logs, { recursive: true });
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
// Each retry changes the code (the agent is trying to fix it): blocked up to 3 times, then let go.
const tries = [];
for (let i = 0; i < 4; i++) { tries.push(hook('stop', { session_id: 'r', stop_hook_active: i > 0 }).status); fs.writeFileSync(path.join(tmp, 'a.txt'), `try ${i}`); }
t('stop gate blocks a failing verify 3 times while the agent keeps changing code, then lets go', tries.join() === '2,2,2,0', tries.join());
// Field test fix: sent back once, then nothing changed (the agent chose to explain): don't send it back again.
routeP('another change'); fs.writeFileSync(path.join(tmp, 'a.txt'), 'explain case');
const e1 = hook('stop', { session_id: 'r' }).status, e2 = hook('stop', { session_id: 'r', stop_hook_active: true }).status;
t('stop gate does not re-block when the agent made no change since the last block', e1 === 2 && e2 === 0, `${e1},${e2}`);
// Field test fix: a missing tool means the checks couldn't run; report it, don't send the agent to install things.
cfg.verify = 'definitely-not-a-real-tool --check'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
routeP('change'); fs.writeFileSync(path.join(tmp, 'a.txt'), 'setup case');
const sg = hook('stop', { session_id: 'r' });
let sgMsg = ''; try { sgMsg = JSON.parse(sg.stdout.trim().split('\n').pop()).systemMessage; } catch {}
t('missing tools: checks reported as "couldn\'t run", agent not sent back', sg.status === 0 && /couldn't run/.test(sgMsg), `${sg.status} ${sgMsg}`);
// Field test fix: CI=1 so test runners (Jest/Vitest/CRA) don't start in watch mode and hang.
cfg.verify = 'node -e "process.exit(process.env.CI ? 0 : 1)"'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
routeP('change'); fs.writeFileSync(path.join(tmp, 'a.txt'), 'ci case');
t('checks run with CI=1, so test runners do not wait in watch mode', hook('stop', { session_id: 'r' }).status === 0);
cfg.verify = 'node -e "process.exit(1)"'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
cfg.verify = 'node -e "process.exit(0)"'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
routeP('change it again'); fs.writeFileSync(path.join(tmp, 'a.txt'), 'changed again');
t('stop gate passes a green verify', hook('stop', { session_id: 'r' }).status === 0);

// 7. Log hook runs through the launcher
hook('log', { session_id: 'L', tool_name: 'Skill', tool_input: { skill: 'ship' } });
t('log hook writes the session log', fs.existsSync(path.join(logs, 'L.jsonl')));

// 7b. Observe mode (the "before"), impact report and daily summary
{
  const day = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(path.join(tmp, '.referee', 'state'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.referee', 'state', 'onboarded'), 'x');
  cfg.mode = 'observe'; cfg.verify = 'node -e "process.exit(1)"'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  t('observe: push to main runs, but is recorded', hook('guard', { session_id: 'obs', tool_name: 'Bash', tool_input: { command: 'git push origin main' } }).status === 0
    && /would_block/.test(fs.readFileSync(path.join(logs, 'obs.jsonl'), 'utf8')));
  t('observe: router stays silent', hook('route', { session_id: 'obs', prompt: 'fix it, full stop' }).stdout.trim() === '');
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'obs change');
  t('observe: stop gate never blocks, even with failing checks', hook('stop', { session_id: 'obs' }).status === 0);
  const sl2 = spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/statusline.mjs')], { cwd: tmp, encoding: 'utf8', input: '{}', env }).stdout;
  t('observe: status line says it is only observing', /observing/.test(sl2), sl2);
  cfg.mode = 'enforce'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  hook('route', { session_id: 'enf', prompt: 'fix it' });
  hook('guard', { session_id: 'enf', tool_name: 'Bash', tool_input: { command: 'git push origin main' } });
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'enf change');
  const sb1 = hook('stop', { session_id: 'enf' }).status;
  cfg.verify = 'node -e "process.exit(0)"'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  const sb2 = hook('stop', { session_id: 'enf', stop_hook_active: true }).status;
  t('enforce: failing checks send the agent back, then it finishes green', sb1 === 2 && sb2 === 0, `${sb1},${sb2}`);
  const imp = spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/impact.mjs')], { cwd: tmp, encoding: 'utf8', env }).stdout;
  t('impact report compares before (observe) with after (enforce)', /Before \(observe\)/.test(imp) && /In one line:/.test(imp) && /pushes to main \| 1 \| 1/.test(imp), imp);
  const dly = spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/daily.mjs'), day], { cwd: tmp, encoding: 'utf8', env }).stdout;
  t('daily summary counts blocks and catches', /stopped \*\*\d+ risky moves?\*\*/.test(dly) && /sent the agent back \*\*1 time\*\*/.test(dly), dly);
  fs.mkdirSync(path.join(shared, 'state'), { recursive: true });
  fs.writeFileSync(path.join(shared, 'state', 'last-day'), '2000-01-01');
  writeLog('old', [{ t: '2000-01-01T10:00:00Z', type: 'prompt', text: 'x' }]);
  t('first message of a new day shows yesterday\'s summary', /yesterday's referee summary/.test(routeP('hello').stdout));
  cfg.baselineUntil = new Date(Date.now() + 864e5).toISOString(); fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  t('a baseline period observes until its end date', bash('git push origin main') === 0);
  delete cfg.baselineUntil; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  t('after the baseline, the referee enforces', bash('git push origin main') === 2);
}

// 7c. spec-first: agreed tests are locked; only the user can unlock them
{
  const spec = 'kb/tasks/specs/late.md';
  fs.mkdirSync(path.join(tmp, 'kb/tasks/specs'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'tests/score.test.js'), 'test("late by 1s is incomplete", () => {});\n');
  fs.writeFileSync(path.join(tmp, spec), '# Spec — late submissions\n\n## Checks\n- [you said] late by 1 second → scores "incomplete" · test: `tests/score.test.js` › "late by 1s is incomplete"\n- [assumed] limit comes from settings · test: `tests/score.test.js` › "uses limit"\n\n## Locked test files\n- tests/score.test.js\n');
  const node = (...a) => spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/spec.mjs'), ...a], { cwd: tmp, encoding: 'utf8', env });
  t('spec: lock runs (agent-callable, not blocked)', bash(`node .referee/scripts/spec.mjs lock ${spec}`) === 0 && node('lock', spec).status === 0);
  t('spec: editing a locked test is blocked', edit('tests/score.test.js') === 2);
  t('spec: sed on a locked test is blocked', bash('sed -i s/1s/2s/ tests/score.test.js') === 2);
  t('spec: git checkout of a locked test is blocked', bash('git checkout -- tests/score.test.js') === 2);
  t('spec: deleting the lock file is blocked', bash('rm .referee/state/locks.json') === 2);
  t('spec: other files stay editable', edit('src/score.js') === 0);
  const rep = node('report', spec).stdout;
  t('spec: report lists checks in plain English, lock intact', /late by 1 second → scores "incomplete" \(you said\)/.test(rep) && /assumed — say if that's wrong/.test(rep) && /Locked tests unchanged/.test(rep), rep);
  fs.appendFileSync(path.join(tmp, 'tests/score.test.js'), '// weakened\n');
  t('spec: check catches a locked test changed behind the guard', node('check').status === 1 && /changed since it was agreed/.test(node('report', spec).stdout));
  routeP("don't unlock the tests yet");
  t('spec: "don\'t unlock the tests" keeps the lock', edit('tests/score.test.js') === 2);
  const un = routeP('ok, unlock the tests so you can fix the typo').stdout;
  t('spec: the user saying "unlock the tests" unlocks them', edit('tests/score.test.js') === 0 && /unlocked the agreed tests/.test(un), un);
}

// 7d. Checks-command detection, from the four field-test repos
{
  const mk = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'referee-detect-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); }
    spawnSync('git', ['add', '-A'], { cwd: d });
    const out = spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/detect.mjs')], { cwd: d, encoding: 'utf8', env: { ...env, REFEREE_ROOT: d, CLAUDE_PROJECT_DIR: d } }).stdout;
    fs.rmSync(d, { recursive: true, force: true });
    try { return JSON.parse(out); } catch { return { verify: '', verifyFull: '', notes: [out] }; }
  };
  const bun = mk({ 'package.json': JSON.stringify({ scripts: { lint: 'biome check', test: 'vitest' } }), 'bun.lock': '', 'src/a.test.ts': '' });
  t('detect: bun repo uses "bun run"', bun.verify === 'bun run lint' && /bun run test/.test(bun.verifyFull), JSON.stringify(bun));
  const cra = mk({ 'package.json': JSON.stringify({ scripts: { test: 'react-scripts test', build: 'react-scripts build' } }), 'src/App.js': '' });
  t('detect: a test script with no test files is left out', !/test/.test(cra.verify + cra.verifyFull) && /no test files/.test(cra.notes.join(' ')), JSON.stringify(cra));
  const py = mk({ 'package.json': JSON.stringify({ scripts: { lint: 'bun run --filter frontend lint' } }), 'bun.lock': '', 'uv.lock': '',
    'backend/pyproject.toml': '[dependency-groups]\ndev = [\n "pytest<10",\n "ruff<1.0.0,>=0.16.0",\n "mypy>=1",\n]\n', 'backend/tests/test_main.py': '' });
  t('detect: Python backend gets ruff in quick checks, pytest only in the full run', /uv run --directory backend ruff check \./.test(py.verify) && /pytest/.test(py.verifyFull) && !/pytest/.test(py.verify), JSON.stringify(py));
  const turbo = mk({ 'package.json': JSON.stringify({ scripts: {} }), 'pnpm-lock.yaml': '', 'turbo.json': JSON.stringify({ tasks: { lint: {}, typecheck: {}, build: {} } }) });
  t('detect: Turborepo checks only affected packages', turbo.verify === 'pnpm turbo run typecheck lint --affected', JSON.stringify(turbo));
}

// 8. Visible results: a line after each message, the status line, /referee, first-run onboarding
const stopOut = hook('stop', { session_id: 'r' }).stdout;
let sys = ''; try { sys = JSON.parse(stopOut.trim().split('\n').pop()).systemMessage; } catch {}
t('after each message the user sees a "⚖ Referee" result line', /^⚖ Referee/.test(sys), stopOut);
const statusCmd = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf8')).statusLine.command;
const sl = spawnSync(statusCmd, { cwd: tmp, shell: true, encoding: 'utf8', input: JSON.stringify({ session_id: 'r' }), env }).stdout.trim();
t('status line shows "⚖ Referee on" and the mode', /^⚖ Referee on · FULL (STOP|SEND)/.test(sl), sl);
const rep = spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/report.mjs')], { cwd: tmp, encoding: 'utf8', env }).stdout;
t('/referee report shows the mode and checks', /Mode:/.test(rep) && /Checks:/.test(rep), rep);
cfg.showResultsEachMessage = false; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
t('result line can be switched off', !/systemMessage/.test(hook('stop', { session_id: 'r' }).stdout));
const onboardFlag = path.join(tmp, '.referee', 'state', 'onboarded');
fs.rmSync(onboardFlag, { force: true }); fs.rmSync(path.join(shared, 'state', 'onboarded'), { force: true });
t('first message in a repo starts onboarding', /referee-onboard/.test(routeP('fix the header, full stop').stdout));
const scan = spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/scan.mjs')], { cwd: tmp, encoding: 'utf8', env }).stdout;
t('scan shows what it found and how each skill will work', /## What I found/.test(scan) && /## How the referee will work here/.test(scan) && /\*\*ship\*\*/.test(scan));
spawnSync(process.execPath, [path.join(tmp, '.referee/scripts/scan.mjs'), '--done'], { cwd: tmp, encoding: 'utf8', env });
const after = routeP('fix the header, full stop').stdout;
t('after onboarding, messages route to the task skill', /`ship`/.test(after) && !/referee-onboard/.test(after), after);

// 9. Field fixes (2026-11-06): observe is silent, shared logs, other tools' setup, honest scores, time limits, parsing
{
  const shared2 = path.join(tmp, '.git', 'referee', 'state', 'onboarded');
  fs.rmSync(shared2, { force: true }); fs.rmSync(path.join(tmp, '.referee', 'state', 'onboarded'), { force: true });
  cfg.mode = 'observe'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  t('observe: first message in a folder says nothing, not even onboarding', routeP('fix the header').stdout.trim() === '' && !fs.existsSync(shared2));
  cfg.mode = 'enforce'; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  routeP('fix the header');
  t('onboarding is recorded once per repository (git common dir), not per folder', fs.existsSync(shared2));
  // A worktree shares the same logs and onboarding.
  const wt = path.join(tmp, '..', path.basename(tmp) + '-wt');
  run('git', ['worktree', 'add', '-q', '-b', 'wt-branch', wt]);
  fs.cpSync(path.join(tmp, '.referee'), path.join(wt, '.referee'), { recursive: true, filter: s => !/[\\/](state|logs|audits)([\\/]|$)/.test(s) });
  fs.mkdirSync(path.join(wt, '.claude'), { recursive: true }); fs.copyFileSync(path.join(tmp, '.claude', 'settings.json'), path.join(wt, '.claude', 'settings.json'));
  const wenv = { ...env, CLAUDE_PROJECT_DIR: wt, REFEREE_ROOT: wt };
  const wr = spawnSync(launcher.route, { cwd: wt, shell: true, encoding: 'utf8', input: JSON.stringify({ session_id: 'wt1', prompt: 'fix the header' }), env: wenv }).stdout;
  t('a new worktree does not onboard again', !/referee-onboard/.test(wr), wr);
  t('a worktree writes to the shared log, so removing it loses nothing', fs.existsSync(path.join(logs, 'wt1.jsonl')));
  run('git', ['worktree', 'remove', '--force', wt]);
  t('the log survives the worktree being removed', fs.existsSync(path.join(logs, 'wt1.jsonl')));

  // .claude/settings.json is shared with other tools: editable, but the referee's hooks must stay.
  const sp = path.join(tmp, '.claude', 'settings.json');
  const cur = fs.readFileSync(sp, 'utf8');
  const withOther = JSON.parse(cur); withOther.permissions = { allow: ['Bash(npm test)'] };
  t('editing other settings in .claude/settings.json is allowed', guard('Write', { file_path: sp, content: JSON.stringify(withOther) }) === 0);
  const noGuard = JSON.parse(cur); noGuard.hooks.PreToolUse = noGuard.hooks.PreToolUse.filter(g => !(g.hooks || []).some(h => /\.referee/.test(h.command)));
  t('an edit that removes the referee guard from settings.json is blocked', guard('Write', { file_path: sp, content: JSON.stringify(noGuard) }) === 2);
  t('shell writes to settings.json are blocked (use Edit)', bash(`echo '{}' > .claude/settings.json`) === 2);

  // Commands are matched as commands, not as text.
  t('gh pr merge inside a commit message is not blocked', bash('git commit -m "then run gh pr merge after review"') === 0);
  t('--no-verify inside a commit message is not blocked', bash('git commit -m "never use --no-verify"') === 0);
  t('gh pr merge after && is still blocked', bash('git fetch && gh pr merge 3') === 2);
  // Wrapping a command doesn't hide it (independent review findings).
  for (const c of [`bash -c 'gh pr merge 1'`, `sh -c "git fetch; gh pr merge 1"`, `eval "gh pr merge 1"`, `gh "pr" merge 1`, '(gh pr merge 1)', '{ gh pr merge 1; }', 'echo 1 | xargs gh pr merge', 'bash <<EOF\ngh pr merge 1\nEOF', `gh api "repos/o/r/pulls/1/merge" -X PUT`])
    t(`wrapped merge is still blocked: ${c.replace(/\n/g, ' ')}`, bash(c) === 2);
  // Round 2: prefixes with options, shell flags, glued redirects, piping into a shell, gh -R, quoted push targets.
  for (const c of ['sudo -u x gh pr merge 1', 'timeout 5 gh pr merge 1', `bash -lc 'gh pr merge 1'`, `sh -c -- 'gh pr merge 1'`, 'gh pr merge>/dev/null 1', `echo 'gh pr merge 1' | bash`, 'gh -R o/r pr merge 1', `git push origin "main"`, `bash -c "git push origin main"`])
    t(`still blocked: ${c}`, bash(c) === 2);
  t('shortened --no-verify and core.hooksPath are blocked', bash('git commit --no-v -m x') === 2 && bash('git -c core.hooksPath=/dev/null commit -m x') === 2);
  t('git commit -n (short for --no-verify) is blocked', bash('git commit -an -m x') === 2 && bash(`git commit "--no-verify" -m x`) === 2);
  t('a commit message that is "-n", and git push -n (dry run), are allowed', bash('git commit -am "-n"') === 0 && bash('git push -n origin feature') === 0);
  t('a PR title or body that mentions a blocked command is allowed', bash(`gh pr create --title "gh pr merge later" --body "never git push origin main"`) === 0);
  t('a heredoc written to a file is data, not a command', bash('cat <<EOF > notes.md\ngh pr merge 1\nEOF') === 0);
  writeLog('s9', [{ type: 'tool', tool: 'Bash', cmd: 'echo "gh pr create later"' }, { type: 'tool', tool: 'Bash', cmd: 'git commit -m "gh pr create"' }]);
  t('a PR rule does not fire on echo or a commit message', /review-before-pr \| n\/a/.test(auditOut('s9')), auditOut('s9'));

  // "Never" rules: a blocked attempt fails; never tried = n/a, not a free pass.
  hook('guard', { session_id: 's10', tool_name: 'Bash', tool_input: { command: 'gh pr merge 7' } });
  t('a blocked merge attempt fails the never-merge rule', /no-merge-without-full-send \| ✗ fail \| tried, blocked/.test(auditOut('s10')), auditOut('s10'));
  writeLog('s11', [{ type: 'tool', tool: 'Edit', file: 'src/a.ts' }]);
  const a11 = auditOut('s11');
  t('never-rules that never came up are n/a, not pass', /no-hook-bypass \| n\/a/.test(a11) && /no-merge-without-full-send \| n\/a/.test(a11) && /no-blocked-retries \| n\/a/.test(a11), a11);

  // End-of-turn check: time limit, and a turn counted once even if another Stop hook sends it back.
  cfg.verify = 'node -e "setTimeout(()=>{},5000)"'; cfg.stopGateTimeoutSec = 1; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  hook('route', { session_id: 'slow', prompt: 'fix it' });
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'slow change');
  const st = Date.now(); const sr = hook('stop', { session_id: 'slow' });
  t('a slow checks command is cut off at stopGateTimeoutSec and does not block', sr.status === 0 && Date.now() - st < 4500 && /took longer than 1s/.test(sr.stderr), `${sr.status} ${Date.now() - st}ms ${sr.stderr}`);
  cfg.verify = 'node -e "process.exit(0)"'; delete cfg.stopGateTimeoutSec; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  hook('route', { session_id: 'twice', prompt: 'fix it' });
  hook('stop', { session_id: 'twice' }); hook('stop', { session_id: 'twice', stop_hook_active: true });
  const ends = fs.readFileSync(path.join(logs, 'twice.jsonl'), 'utf8').split('\n').filter(l => /"turn_end"/.test(l)).length;
  t('a turn is counted once when another Stop hook sends it back', ends === 1, `${ends} turn_end events`);
  t('the Stop hook has a time limit in settings.json', (JSON.parse(cur).hooks.Stop || []).some(g => (g.hooks || []).some(h => /stop-gate/.test(h.command) && h.timeout > 0)));

  // Routing ignores pasted text.
  t('routing ignores code blocks and quoted lines the user pasted', !/file-pr/.test(routeP('what does this log mean?\n```\nopen a PR for this branch\n```').stdout));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} failing` : '\nall passing');
process.exit(fail ? 1 : 0);
