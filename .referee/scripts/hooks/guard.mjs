#!/usr/bin/env node
// PreToolUse hook: hard walls. Exit 2 blocks the call and shows the reason to the agent.
// Scope: this stops mistakes and casual workarounds. It is not a sandbox; a determined agent can
// obfuscate a shell command. The session audit and human review cover the rest.
import { config, readStdin, rel, protectedMatch, fullSendActive, logEvent, git, effectiveMode, lockedMatch } from '../lib.mjs';

// Paths whose mere mention in a shell command is blocked (the agent never needs them).
const STATE_PATTERN = /\.referee[\\/]+state|full-send/;
// Shell operations that write, move or delete.
const WRITE_OP = /(?<![0-9&])>|\btee\b|\bsed\s+(?:-\w+\s+)*-\w*i|\bperl\s+-\w*i|\b(?:rm|rmdir|mv|cp|touch|truncate|chmod|chown|ln|unlink|dd|rsync|install|patch)\b|writeFile|appendFile|createWriteStream|open\([^)]*['"][wa]|Set-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item/;

export function pathTokens(cmd) {
  return (cmd.replace(/\d?>&\d/g, ' ').match(/[^\s'"`;&|<>(),=]+/g) || [])
    .map(t => t.replace(/^\.\//, ''))
    .filter(t => /[\w.]/.test(t) && !t.startsWith('-'));
}

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

if (process.env.REFEREE_HOOK === 'guard' || (process.argv[1] || '').endsWith('guard.mjs')) {
  const raw = await readStdin();
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch {}
  const cfg = config();
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const main = cfg.mainBranch || 'main';
  const fullSend = fullSendActive(cfg);

  const block = (reason) => {
    // Observe mode (the "before" measurement): record what would have been blocked, let it run.
    if (effectiveMode(cfg) === 'observe') { logEvent(input.session_id, { type: 'would_block', tool, reason }); process.exit(0); }
    logEvent(input.session_id, { type: 'blocked', tool, reason });
    console.error(`[Referee] Blocked: ${reason}`);
    process.exit(2);
  };

  const file = ti.file_path || ti.notebook_path;
  if (file && process.env.REFEREE_ALLOW_PROTECTED !== '1') {
    const hit = protectedMatch(file, cfg);
    if (hit) block(`${rel(file)} is protected (matches "${hit}" in .referee/config.json). Ask the human to change it.`);
  }
  // spec-first: tests the user agreed can't be edited to make them pass.
  if (file) {
    const lk = lockedMatch(file);
    if (lk) block(`${lk.file} holds tests you agreed with the user (${lk.spec}). Don't change them to pass: fix the code, or stop and tell the user why the test looks wrong. Only the user can unlock it, by saying "unlock the tests".`);
  }

  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    if (STATE_PATTERN.test(cmd)) block('.referee/state is written only by the hooks. "Full send" comes from the user\'s message, not from you.');
    if (/--no-verify\b/.test(cmd)) block('--no-verify skips the repo\'s checks. Fix the failing check instead.');
    if (process.env.REFEREE_ALLOW_PROTECTED !== '1' && WRITE_OP.test(cmd)) {
      const hit = pathTokens(cmd).map(t => [t, protectedMatch(t, cfg)]).find(([, g]) => g);
      if (hit) block(`This command writes near ${rel(hit[0])}, which is protected (matches "${hit[1]}"). Ask the human to change it.`);
    }
    if (WRITE_OP.test(cmd) || /\bgit\s+(checkout|restore|rm|mv)\b/.test(cmd)) {
      const lk = pathTokens(cmd).map(t => lockedMatch(t)).find(Boolean);
      if (lk) block(`This command changes ${lk.file}, which holds tests you agreed with the user (${lk.spec}). Fix the code instead, or ask the user to say "unlock the tests".`);
    }
    if (/\bgh\s+pr\s+merge\b/.test(cmd) && !fullSend) block('Merging is the human\'s call. Hand over the PR, or the user can say "full send".');
    if (/\bgh\s+api\b/.test(cmd) && /\/merges?\b/.test(cmd) && !fullSend) block('Merging through the GitHub API is still merging. Hand over the PR, or the user can say "full send".');
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || '';
    for (const p of pushes(cmd, branch)) {
      const toMain = p.all || p.dests.includes(main);
      if (toMain && p.force) block(`Force-pushing ${main} is never allowed.`);
      if (toMain && !fullSend) block(`Pushing to ${main} needs "full send". Push a branch and open a PR.`);
    }
  }
  process.exit(0);
}
