#!/usr/bin/env node
// scan.mjs — first look at a repo: what's here, and how each referee skill will work on it.
//   node .referee/scripts/scan.mjs           print the scan (markdown) and save .referee/reports/scan.md
//   node .referee/scripts/scan.mjs --done    mark onboarding as finished (the router stops asking)
//   node .referee/scripts/scan.mjs --json    machine-readable facts
// Facts come from files and git, never from guesses. Anything not found is said plainly.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, AGENT, config, git, sh, globToRegex, protectedMatch, appendOnlyMatch, sharedState } from './lib.mjs';

const onboardedFile = sharedState('onboarded'); // per repository, shared by worktrees
if (process.argv.includes('--done')) {
  fs.mkdirSync(path.dirname(onboardedFile), { recursive: true });
  fs.writeFileSync(onboardedFile, new Date().toISOString());
  console.log('Onboarding marked as done. The referee will go straight to work from now on.');
  process.exit(0);
}

const exists = p => fs.existsSync(path.join(ROOT, p));
const readJson = p => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return null; } };
const cfg = config();

// Files tracked by git (fast, respects .gitignore). Fallback: shallow walk.
let files = (git(['ls-files']) || '').split('\n').filter(Boolean);
if (!files.length) {
  const walk = (d, depth = 0) => depth > 4 ? [] : fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
    .filter(e => !['node_modules', '.git', 'dist', 'build', '.next'].includes(e.name))
    .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name), depth + 1) : [path.join(d, e.name).split(path.sep).join('/')]);
  try { files = walk('.').map(f => f.replace(/^\.\//, '')); } catch { files = []; }
}

// Languages
const LANG = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', cs: 'C#', swift: 'Swift', sql: 'SQL', dart: 'Dart' };
const langCount = {};
for (const f of files) { const l = LANG[f.split('.').pop()]; if (l) langCount[l] = (langCount[l] || 0) + 1; }
const languages = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, n]) => `${l} (${n} file${n === 1 ? "" : "s"})`);

// Package manager, monorepo, packages
const pm = exists('pnpm-lock.yaml') ? 'pnpm' : exists('yarn.lock') ? 'yarn' : exists('bun.lockb') || exists('bun.lock') ? 'bun' : exists('package-lock.json') ? 'npm' : exists('package.json') ? 'npm (no lockfile)' : null;
const monorepo = exists('turbo.json') ? 'Turborepo' : exists('nx.json') ? 'Nx' : exists('pnpm-workspace.yaml') ? 'pnpm workspaces' : readJson('package.json')?.workspaces ? 'npm/yarn workspaces' : null;
const pkgFiles = files.filter(f => /(^|\/)package\.json$/.test(f) && f !== 'package.json' && !f.includes('node_modules'));
const packages = pkgFiles.map(f => ({ dir: path.dirname(f), name: readJson(f)?.name || path.dirname(f) })).slice(0, 15);

// Frameworks and services (from dependencies and folders)
const deps = new Set();
for (const f of ['package.json', ...pkgFiles]) { const j = readJson(f); for (const k of Object.keys({ ...(j?.dependencies || {}), ...(j?.devDependencies || {}) })) deps.add(k); }
const FW = [['next', 'Next.js'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['@angular/core', 'Angular'], ['express', 'Express'], ['fastify', 'Fastify'], ['@nestjs/core', 'NestJS'], ['prisma', 'Prisma'], ['drizzle-orm', 'Drizzle'], ['@supabase/supabase-js', 'Supabase'], ['@anthropic-ai/sdk', 'Anthropic SDK'], ['openai', 'OpenAI SDK'], ['tailwindcss', 'Tailwind'], ['vitest', 'Vitest'], ['jest', 'Jest'], ['@playwright/test', 'Playwright'], ['cypress', 'Cypress']];
const frameworks = FW.filter(([d]) => deps.has(d)).map(([, n]) => n);
// Python: read the dependency names from every pyproject.toml / requirements.txt in git
const pyText = files.filter(f => /(^|\/)(pyproject\.toml|requirements[^/]*\.txt)$/.test(f)).map(f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').toLowerCase(); } catch { return ''; } }).join('\n');
if (pyText) {
  const PY = [['fastapi', 'FastAPI'], ['django', 'Django'], ['flask', 'Flask'], ['sqlmodel', 'SQLModel'], ['sqlalchemy', 'SQLAlchemy'], ['alembic', 'Alembic'], ['pydantic', 'Pydantic'], ['pytest', 'pytest'], ['ruff', 'Ruff']];
  const found = PY.filter(([d]) => new RegExp(`(^|[\\s"'\\[])${d}([\\s<>=~!\\[",']|$)`, 'm').test(pyText)).map(([, n]) => n);
  frameworks.push(...(found.length ? found : ['Python project']));
}
if (exists('Cargo.toml')) frameworks.push('Rust (Cargo)');
if (exists('go.mod')) frameworks.push('Go modules');
if (exists('supabase') && !frameworks.includes('Supabase')) frameworks.push('Supabase');

// Scripts
const rootScripts = readJson('package.json')?.scripts || {};
const turboTasks = Object.keys((readJson('turbo.json') || {}).tasks || (readJson('turbo.json') || {}).pipeline || {});
const testTool = ['test', 'lint', 'typecheck', 'check', 'build'].filter(k => rootScripts[k] || turboTasks.includes(k));

// Sensitive places
const migrationDirs = [...new Set(files.map(f => (f.match(/^(.*?\/?(?:migrations|alembic\/versions))\//) || [])[1]).filter(Boolean))].slice(0, 6);
const envFiles = files.filter(f => /(^|\/)\.env(\.|$)/.test(f) && !/\.(example|sample|template)$/.test(f)).slice(0, 6);
const infraDirs = [...new Set(files.map(f => (f.match(/^((?:.*\/)?(?:terraform|infra|infrastructure|k8s|helm|\.github\/workflows))\//) || [])[1]).filter(Boolean))].slice(0, 6);
const isProtected = p => !!(protectedMatch(p, cfg) || protectedMatch(p + '/x', cfg) || appendOnlyMatch(p + '/x', cfg));
const unprotected = [...infraDirs].filter(d => !isProtected(d));

// Guidance and knowledge
const guidance = ['CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md'].filter(exists).map(f => `${f} (${fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length} lines)`);
const kbCount = files.filter(f => f.startsWith('kb/') && !f.endsWith('.gitkeep')).length;
const ci = files.filter(f => f.startsWith('.github/workflows/')).map(f => path.basename(f));

// Git
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const commits = (git(['log', '--oneline', '-5', '--format=%s']) || '').split('\n').filter(Boolean);
const hasGh = sh('gh --version').ok;
const reviewer = cfg.reviewer?.kind === 'cli' && cfg.reviewer.cli ? `the \`${cfg.reviewer.cli}\` CLI` : `the \`${cfg.reviewer?.agent || 'independent-reviewer'}\` subagent`;

const facts = { languages, pm, monorepo, packages, frameworks, scripts: testTool, verify: cfg.verify, migrationDirs, envFiles, infraDirs, unprotected, guidance, kbCount, ci, branch, commits, hasGh, files: files.length };
if (process.argv.includes('--json')) { console.log(JSON.stringify(facts, null, 2)); process.exit(0); }
// One line for the user, shown by the stop hook after the first message.
export function summaryLine() {
  const bits = [];
  bits.push(monorepo ? `${monorepo}, ${packages.length} packages` : (languages[0] || '').replace(/ \(.*/, '') || `${files.length} files`);
  if (frameworks.length) bits.push(frameworks.slice(0, 4).join(', '));
  bits.push(cfg.verify ? `checks: ${cfg.verify}` : '⚠ no checks command set');
  if (migrationDirs.length) bits.push(`migrations add-only: ${migrationDirs.slice(0, 2).join(', ')}`);
  if (unprotected.length) bits.push(`⚠ not protected: ${unprotected.join(', ')}`);
  return bits.join(' · ');
}
if (process.argv.includes('--summary')) { console.log(summaryLine()); process.exit(0); }

// ---- Markdown ----
const L = [];
const none = s => `_${s}_`;
L.push('# ⚖ Agent Referee — first look at this repo', '');
L.push('## What I found', '');
L.push(`| | |`, `| --- | --- |`);
L.push(`| Size | ${files.length} files tracked by git |`);
L.push(`| Languages | ${languages.join(', ') || none('none detected')} |`);
L.push(`| Package manager | ${pm || none('none (not a JS project)')} |`);
L.push(`| Monorepo | ${monorepo ? `${monorepo}, ${packages.length} package(s): ${packages.slice(0, 6).map(p => `\`${p.dir}\``).join(', ')}${packages.length > 6 ? '…' : ''}` : 'no'} |`);
L.push(`| Frameworks | ${frameworks.join(', ') || none('none detected')} |`);
L.push(`| Scripts | ${testTool.length ? testTool.map(s => `\`${s}\``).join(', ') : none('no lint/test/typecheck scripts found')} |`);
L.push(`| Migrations | ${migrationDirs.length ? migrationDirs.map(d => `\`${d}\``).join(', ') : none('none found')} |`);
L.push(`| Env files in git | ${envFiles.length ? envFiles.map(d => `\`${d}\``).join(', ') + ' ⚠ check none hold secrets' : 'none' } |`);
L.push(`| CI | ${ci.length ? ci.join(', ') : none('no GitHub Actions workflows')} |`);
L.push(`| Agent guidance | ${guidance.join(', ') || none('no CLAUDE.md or AGENTS.md')} |`);
L.push(`| Decisions & notes (kb/) | ${kbCount ? `${kbCount} file(s)` : none('empty, nothing recorded yet')} |`);
L.push(`| Branch | \`${branch || '?'}\`${branch === (cfg.mainBranch || 'main') ? ' (the main branch: the agent will make a new branch before changing anything)' : ''} |`);
L.push(`| GitHub CLI | ${hasGh ? 'available' : '⚠ not found: the agent can prepare PRs but not open them'} |`);
L.push('');

L.push('## How the referee will work here', '');
L.push('| Skill | When it kicks in | What it will do in this repo |', '| --- | --- | --- |');
const vcmd = cfg.verify ? `\`${cfg.verify}\`` : '⚠ no checks command yet, so set `"verify"` in `.referee/config.json`';
L.push(`| **ship** | "fix X, full stop" / "full send" | Branch → test → fix → run ${vcmd} → review → PR. Stops at a ready PR unless you said "full send". |`);
L.push(`| **writing-plans** | Changes across several files${monorepo ? ' or packages' : ''} | Writes a step-by-step plan to \`kb/tasks/planned/\`${packages.length ? `, naming exact packages such as \`${packages[0].dir}\`` : ''}, and asks you to confirm before coding. |`);
L.push(`| **spec-first** | Features and bug fixes that need tests | Agrees the tests with you in plain English (0–5 questions), saves them to \`kb/tasks/specs/\`, then locks them so the agent can't change them to pass. |`);
L.push(`| **verification-before-completion** | Before any "done" or PR | Runs ${vcmd} and shows the output. ${testTool.includes('test') ? 'Bug fixes come with a test that failed before and passes after.' : '⚠ No test script found, so "proof" will be limited to the checks command and screenshots.'} |`);
L.push(`| **review-loop** | Before every PR | Sends the change to ${reviewer} for a second opinion, at most 3 rounds. |`);
L.push(`| **receiving-code-review** | Acting on review comments | Checks each comment against the code before changing anything. |`);
L.push(`| **file-pr** | Opening a PR | ${commits.length ? `Titles match your recent style, e.g. "${commits[0].slice(0, 60)}".` : 'Short, human-readable titles (no commit history yet to copy).'} ${hasGh ? '' : '⚠ Needs `gh` to open the PR.'} |`);
L.push(`| **repo-knowledge** | "record the decision…" | Saves decisions and lessons to \`kb/\`${kbCount ? '' : ' (empty now, so this is where it starts)'}. |`);
L.push(`| **repo-audit** | "audit the repo" | Deeper check of what confuses agents here${guidance.length ? `, including ${guidance[0].split(' ')[0]}` : ''}. |`);
L.push(`| **agent-postmortem** | "why does it keep…" | Finds the cause of a repeated mistake and adds a rule or check. |`);
L.push(`| **method-upkeep** | "run the session audit" | Shows scores across sessions and what keeps failing. |`);
L.push('');

L.push('## What the referee will block here', '');
const prot = (cfg.protectedPaths || []).filter(g => !g.startsWith('.referee') && !g.startsWith('!') && g !== '.claude/settings.json');
const exceptions = (cfg.protectedPaths || []).filter(g => g.startsWith('!')).map(g => g.slice(1));
L.push(`- Edits to ${prot.map(g => `\`${g}\``).join(', ')}${exceptions.length ? `. Templates stay editable: ${exceptions.map(g => `\`${g}\``).join(', ')}` : ''}`);
if ((cfg.appendOnlyPaths || []).length) L.push(`- Changing existing migrations${migrationDirs.length ? ` in ${migrationDirs.map(d => `\`${d}\``).join(', ')}` : ''}. Adding new ones is fine`);
if ((cfg.secretPaths || []).length) L.push('- Reading secrets files (`.env`, keys). Checking they exist, loading them into a command, and reading `.env.example` are fine');
L.push(`- Merging, or pushing to \`${cfg.mainBranch || 'main'}\`, unless you say "full send"`);
L.push('- Skipping checks with `--no-verify`, and editing the referee\'s own files');
if (unprotected.length) L.push(`- ⚠ **Not protected yet:** ${unprotected.map(d => `\`${d}\``).join(', ')}. Add \`"${unprotected[0]}/**"\` to \`protectedPaths\` in \`.referee/config.json\` if agents shouldn't touch it.`);
L.push('');

const todo = [];
if (!cfg.verify) todo.push('Set the checks command: `"verify"` in `.referee/config.json`.');
if (!hasGh) todo.push('Install the GitHub CLI (`gh`) and run `gh auth login` so the agent can open PRs.');
if (unprotected.length) todo.push(`Decide whether to protect ${unprotected.map(d => `\`${d}\``).join(', ')}.`);
if (!testTool.includes('test')) todo.push('Add a `test` script, so fixes can be proven, not just claimed.');
if (guidance.length) todo.push(`Optional: run "audit the repo" to shorten ${guidance[0].split(' ')[0]}.`);
L.push('## Before you start', '', todo.length ? todo.map(t => `- ${t}`).join('\n') : '- Nothing. You\'re ready.', '');
L.push('After this, you\'ll see `⚖ Referee on` at the bottom of Claude Code and a result line after each message. Say `/referee` any time for the full report.');

const md = L.join('\n');
try { fs.mkdirSync(path.join(AGENT, 'reports'), { recursive: true }); fs.writeFileSync(path.join(AGENT, 'reports', 'scan.md'), md); } catch {}
console.log(md);
