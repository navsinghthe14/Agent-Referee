#!/usr/bin/env node
// PreToolUse hook: hard walls. Exit 2 blocks the call and shows the reason to the agent.
// Scope: this stops mistakes and casual workarounds. It is not a sandbox; a determined agent can
// obfuscate a shell command. The session audit and human review cover the rest.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config, readStdin, rel, protectedMatch, appendOnlyMatch, secretMatch, fullSendActive, logEvent, git, effectiveMode, lockedMatch, mentionsCommand, skipsHooksAny, segments, dataStripped } from '../lib.mjs';

// Paths whose mere mention in a shell command is blocked (the agent never needs them).
const STATE_PATTERN = /\.referee[\\/]+state|full-send|\.git[\\/]+referee\b/;
// Shell operations that write, move or delete.
const WRITE_OP = /(?<![0-9&])>|\btee\b|\bsed\s+(?:-\w+\s+)*-\w*i|\bperl\s+-\w*i|\b(?:rm|rmdir|mv|cp|touch|truncate|chmod|chown|ln|unlink|dd|rsync|install|patch)\b|writeFile|appendFile|createWriteStream|open\([^)]*['"][wa]|Set-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item/;

export function pathTokens(cmd) {
  return (cmd.replace(/\d?>&\d/g, ' ').match(/[^\s'"`;&|<>(),=]+/g) || [])
    .map(t => t.replace(/^\.\//, ''))
    .filter(t => /[\w.]/.test(t) && !t.startsWith('-'));
}

// Shell commands that only look at a file's name or existence, never its contents.
// Loading .env into a command (source, --env-file) passes values along without printing them, so it's allowed.
const NAME_ONLY = /^\s*(?:(?:ls|stat|test|file|wc|du|source|git\s+(?:check-ignore|status|ls-files|diff\s+--stat|log\s+--stat))\b|\[\s|\.\s|set\s+-a\b)|--env-file[ =]/;
const exists = f => fs.existsSync(path.resolve(ROOT, f));

export function pushes(cmd, currentBranch) {
  const out = [];
  for (const seg of cmd.split(/&&|\|\||;|\|/)) {
    const m = seg.match(/\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*push\b(.*)/);
    if (!m) continue;
    let force = false, all = false;
    const pos = [];
    const args = m[1].trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith('--')) {
        if (/^--force/.test(a)) force = true;
        if (a === '--all' || a === '--mirror') all = true;
        if (/^--(push-option|repo|receive-pack|exec|signed)$/.test(a)) i++;
        continue;
      }
      if (a.startsWith('-')) { if (/f/.test(a.slice(1))) force = true; if (a === '-o') i++; continue; }
      pos.push(a);
    }
    const refs = pos.slice(1);
    if (refs.some(r => r.startsWith('+'))) force = true;
    const dests = refs.length
      ? refs.map(r => { const d = r.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, ''); return d === 'HEAD' || d === '' ? currentBranch : d; })
      : [currentBranch];
    out.push({ dests, force, all });
  }
  return out;
}

// .claude/settings.json holds other tools' hooks too, so it isn't locked. An edit is blocked only if the
// file would no longer register all four referee hooks (that would switch the referee off).
const REFEREE_HOOKS = [['UserPromptSubmit', 'route.mjs'], ['PreToolUse', 'guard.mjs'], ['PostToolUse', 'log.mjs'], ['Stop', 'stop-gate.mjs']];
export function settingsAfter(tool, ti, current) {
  if (tool === 'Write') return ti.content ?? '';
  const edits = tool === 'MultiEdit' ? (ti.edits || []) : [ti];
  let s = current;
  for (const e of edits) {
    if (e.old_string == null) return null;
    s = e.replace_all ? s.split(e.old_string).join(e.new_string ?? '') : s.replace(e.old_string, () => e.new_string ?? '');
  }
  return s;
}
export function refereeHooksMissing(text) {
  let j; try { j = JSON.parse(text); } catch { return ['(not valid JSON)']; }
  const h = j.hooks || {};
  return REFEREE_HOOKS.filter(([ev, f]) => !(h[ev] || []).some(g => (g.hooks || []).some(k => /\.referee\W+scripts\W+hooks\W/.test(k.command || '') && (k.command || '').includes(f)))).map(([, f]) => f);
}

if (process.env.REFEREE_HOOK === 'guard' || (process.argv[1] || '').endsWith('guard.mjs')) {
  const raw = await readStdin();
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch {}
  const cfg = config();
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const main = cfg.mainBranch || 'main';
  const fullSend = fullSendActive(cfg);
  // Merging and pushing to main by the agent is off unless the repo opts in (fullSendMerges: true)
  // AND the user said "full send". Off by default: it's the riskiest thing the kit could allow.
  const canMerge = fullSend && cfg.fullSendMerges === true;
  // (Wording matters: impact.mjs and daily.mjs sort blocks by their reason text.)
  const mergeHint = cfg.fullSendMerges === true ? 'or the user can say "full send"' : 'agents don\'t merge in this repo (fullSendMerges is off in the referee config)';
  const pushHint = cfg.fullSendMerges === true ? ', or the user can say "full send"' : '';

  const block = (reason) => {
    // Observe mode (the "before" measurement): record what would have been blocked, let it run.
    if (effectiveMode(cfg) === 'observe') { logEvent(input.session_id, { type: 'would_block', tool, reason, ...(tool === 'Bash' ? { cmd: String(ti.command || '').slice(0, 300) } : {}) }); process.exit(0); }
    logEvent(input.session_id, { type: 'blocked', tool, reason, ...(tool === 'Bash' ? { cmd: String(ti.command || '').slice(0, 300) } : {}) });
    console.error(`[Referee] Blocked: ${reason}`);
    process.exit(2);
  };

  const file = ti.file_path || ti.notebook_path;
  if (file && process.env.REFEREE_ALLOW_PROTECTED !== '1') {
    const hit = protectedMatch(file, cfg);
    if (hit) block(`${rel(file)} is protected (matches "${hit}" in .referee/config.json). Ask the human to change it.`);
  }
  if (file && rel(file) === '.claude/settings.json' && ['Edit', 'MultiEdit', 'Write'].includes(tool) && process.env.REFEREE_ALLOW_PROTECTED !== '1') {
    let cur = ''; try { cur = fs.readFileSync(path.resolve(ROOT, file), 'utf8'); } catch {}
    const after = settingsAfter(tool, ti, cur);
    const gone = after == null ? [] : refereeHooksMissing(after);
    if (gone.length) block(`This edit to .claude/settings.json would remove the referee's hooks (${gone.join(', ')}). Edit other settings freely, but leave those entries in place.`);
  }
  // Migrations: adding a new one is normal work; changing an existing (applied) one is not.
  if (file && process.env.REFEREE_ALLOW_PROTECTED !== '1' && ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(tool)) {
    const ao = appendOnlyMatch(file, cfg);
    if (ao && (tool !== 'Write' || exists(file))) block(`${rel(file)} is an existing migration (matches "${ao}"): it may already have run on a database, so changing it breaks those databases. Create a new migration instead.`);
  }
  // Secrets: never read them, so they don't end up in the agent's context, transcript or logs.
  // (Glob is fine: it lists names, never contents.)
  if (['Read', 'Grep', 'NotebookRead'].includes(tool)) {
    const target = [ti.file_path, ti.notebook_path, ti.path, ti.glob].filter(Boolean);
    const hit = target.map(t => [t, secretMatch(t, cfg) || secretMatch(String(t).replace(/^\*\*\//, ''), cfg)]).find(([, g]) => g);
    if (hit) block(`${rel(hit[0])} may hold secrets (matches "${hit[1]}" in secretPaths), so it isn't read. For variable names, read .env.example. If you need a value, ask the user.`);
  }
  // spec-first: tests the user agreed can't be edited to make them pass.
  if (file) {
    const lk = lockedMatch(file);
    if (lk) block(`${lk.file} holds tests you agreed with the user (${lk.spec}). Don't change them to pass: fix the code, or stop and tell the user why the test looks wrong. Only the user can unlock it, by saying "unlock the tests".`);
  }

  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    if (STATE_PATTERN.test(cmd)) block('.referee/state is written only by the hooks. "Full send" comes from the user\'s message, not from you.');
    if (skipsHooksAny(cmd)) block('--no-verify (or git commit -n, or core.hooksPath) skips the repo\'s checks. Fix the failing check instead.');
    if (process.env.REFEREE_ALLOW_PROTECTED !== '1' && WRITE_OP.test(cmd)) {
      const hit = pathTokens(cmd).map(t => [t, protectedMatch(t, cfg)]).find(([, g]) => g);
      if (hit) block(`This command writes near ${rel(hit[0])}, which is protected (matches "${hit[1]}"). Ask the human to change it.`);
      if (pathTokens(cmd).some(t => rel(t) === '.claude/settings.json')) block('Change .claude/settings.json with the Edit tool, not the shell, so the referee can check its own hooks stay in place.');
    }
    // Existing migrations: no rewriting, moving or deleting from the shell. New files are fine.
    if (process.env.REFEREE_ALLOW_PROTECTED !== '1' && (WRITE_OP.test(cmd) || /\bgit\s+(checkout|restore|rm|mv)\b/.test(cmd))) {
      const hit = pathTokens(cmd).map(t => [t, appendOnlyMatch(t, cfg)]).find(([t, g]) => g && exists(t));
      if (hit) block(`This command changes ${rel(hit[0])}, an existing migration (matches "${hit[1]}"). Create a new migration instead.`);
    }
    // Secrets: a command that would print or copy a secrets file is blocked; checking it exists is fine.
    for (const seg of cmd.split(/&&|\|\||;|\|/)) {
      const hit = pathTokens(seg).map(t => [t, secretMatch(t, cfg)]).find(([, g]) => g);
      if (hit && !NAME_ONLY.test(seg)) block(`This command reads ${rel(hit[0])}, which may hold secrets (matches "${hit[1]}" in secretPaths). For variable names, read .env.example. If you need a value, ask the user.`);
    }
    if (WRITE_OP.test(cmd) || /\bgit\s+(checkout|restore|rm|mv)\b/.test(cmd)) {
      const lk = pathTokens(cmd).map(t => lockedMatch(t)).find(Boolean);
      if (lk) block(`This command changes ${lk.file}, which holds tests you agreed with the user (${lk.spec}). Fix the code instead, or ask the user to say "unlock the tests".`);
    }
    if (mentionsCommand(cmd, 'gh pr merge') && !canMerge) block(`Merging is the human's call. Hand over the PR; ${mergeHint}.`);
    if ((segments(cmd).some(cw => cw[0] === 'gh' && cw[1] === 'api' && cw.some(a => /\/merges?\b/.test(a))) || (/\bgh\b[\s\S]*\bapi\b/.test(dataStripped(cmd)) && /\/merges?\b/.test(dataStripped(cmd)))) && !canMerge) block(`Merging through the GitHub API is still merging. Hand over the PR; ${mergeHint}.`);
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || '';
    // Pushes read twice: from the raw text and from the parsed commands (quotes removed, bash -c scripts opened).
    const parsed = segments(cmd).filter(w => w[0] === 'git' && w[1] === 'push').map(w => w.join(' ')).join(' ; ');
    for (const p of [...pushes(dataStripped(cmd).replace(/["']/g, ''), branch), ...pushes(parsed, branch)]) {
      const toMain = p.all || p.dests.includes(main);
      if (toMain && p.force) block(`Force-pushing ${main} is never allowed.`);
      if (toMain && !canMerge) block(`Pushing to ${main} is the human's call. Push a branch and open a PR${pushHint}.`);
    }
  }
  process.exit(0);
}
