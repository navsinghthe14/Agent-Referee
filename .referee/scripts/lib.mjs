// Shared helpers. Node 18+, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const ROOT = process.env.REFEREE_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const AGENT = path.join(ROOT, '.referee');

// Shared data (session logs, audits, scoreboard, "onboarded"): one place per repository, not per folder.
// It sits in git's common directory, which every worktree shares and which survives a worktree being
// removed. Outside git, or with REFEREE_DATA / config.dataDir set, that path is used instead.
let _data;
export function dataDir() {
  if (_data) return _data;
  let d = process.env.REFEREE_DATA || '';
  if (!d) { try { const c = JSON.parse(fs.readFileSync(path.join(AGENT, 'config.json'), 'utf8')); if (c.dataDir) d = path.resolve(ROOT, c.dataDir); } catch {} }
  if (!d) {
    const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) d = path.join(r.stdout.trim(), 'referee');
  }
  _data = d || AGENT;
  return _data;
}
export const logsDir = () => path.join(dataDir(), 'logs');
export const auditsDir = () => path.join(dataDir(), 'audits');
export const sharedState = (name) => path.join(dataDir(), 'state', name);

// Shell parsing for rules and the guard: what actually runs, not text that merely mentions a command.
// A small tokenizer that reads a command the way a shell does: quote marks are removed but their content is
// kept as one word; ; & | ( ) { } newlines, $( and backticks start a new command; a script handed to
// bash/sh/zsh -c, eval, or a heredoc fed to a shell is parsed too. Other heredoc bodies are data.
// It doesn't need to be a full shell: it errs towards finding a command (the guard blocks), never towards
// hiding one. A commit message is one quoted word, so "gh pr merge" inside it is not a command.
const SHELLS = /^(bash|sh|zsh|dash|ksh)$/;
const PREFIX = /^(sudo|env|time|command|exec|nohup|xargs|eval|then|do|if|elif|else|while|until|!|nice|timeout|watch)$/;
export function parseShell(cmd, depth = 0) {
  const src = String(cmd || '');
  const segs = []; let words = []; let w = ''; let inWord = false; let i = 0; let pendingHeredoc = null;
  const endWord = () => { if (inWord) { words.push(w); w = ''; inWord = false; } };
  const endSeg = () => { endWord(); if (words.length) segs.push(words); words = []; };
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) { w += src[i + 1]; inWord = true; i += 2; continue; }
    if (c === "'") { const j = src.indexOf("'", i + 1); const e = j < 0 ? src.length : j; w += src.slice(i + 1, e); inWord = true; i = e + 1; continue; }
    if (c === '"') { let j = i + 1, t = ''; while (j < src.length && src[j] !== '"') { if (src[j] === '\\' && j + 1 < src.length) { t += src[j + 1]; j += 2; } else t += src[j++]; } w += t; inWord = true; i = j + 1; continue; }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      const m = src.slice(i).match(/^<<-?\s*(['"]?)([\w.-]+)\1/);
      if (m) { endWord(); pendingHeredoc = { tag: m[2], words: words.slice() }; i += m[0].length; continue; }
    }
    if (c === '\n') {
      if (pendingHeredoc) {
        const rest = src.slice(i + 1); const re = new RegExp(`^\\s*${pendingHeredoc.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
        const m = re.exec(rest); const body = m ? rest.slice(0, m.index) : rest;
        const fed = pendingHeredoc.words.length && (SHELLS.test(commandWords(pendingHeredoc.words, depth)[0] || '') || /^(eval|xargs)$/.test(pendingHeredoc.words[0]));
        endSeg();
        if (fed && depth < 4) segs.push(...parseShell(body, depth + 1));
        pendingHeredoc = null; i += 1 + (m ? m.index + m[0].length : rest.length); continue;
      }
      endSeg(); i++; continue;
    }
    if (c === '$' && src[i + 1] === '(') { endSeg(); i += 2; continue; }
    if (';&|(){}`<>'.includes(c)) { endSeg(); i++; continue; }
    if (/\s/.test(c)) { endWord(); i++; continue; }
    w += c; inWord = true; i++;
  }
  endSeg();
  // Scripts passed to a shell or eval are commands too.
  const out = [];
  for (const ws of segs) {
    out.push(ws);
    if (depth >= 4) continue;
    const cw = commandWords(ws, depth);
    if (SHELLS.test(cw[0] || '')) {
      let k = cw.findIndex((x, n) => n > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(x));
      if (k > 0) { k++; if (cw[k] === '--') k++; if (cw[k] != null) out.push(...parseShell(cw[k], depth + 1)); }
    }
    const e = ws.findIndex(x => x === 'eval'); if (e >= 0 && ws.length > e + 1) out.push(...parseShell(ws.slice(e + 1).join(' '), depth + 1));
  }
  return out;
}
// The words of the command a segment runs: no VAR=value, sudo/env/xargs/eval/if/then..., node/npx/python
// launchers, or git's own -C/-c options; the first word reduced to its file name.
export function commandWords(ws) {
  const w = ws.slice();
  for (;;) {
    if (w.length && (/^\w+=/.test(w[0]) || PREFIX.test(w[0]))) { w.shift(); continue; }
    // A prefix's own options and their values: sudo -u x, env -u X, nice -n 5, timeout -s KILL 5.
    if (w[0] && /^-/.test(w[0]) && w.length > 1) { const v = /^-(u|g|n|s|k|C|S|D|p|h)$/.test(w[0]); w.shift(); if (v && w.length > 1) w.shift(); continue; }
    if (w[0] && /^\d+(\.\d+)?[smhd]?$/.test(w[0]) && w.length > 1) { w.shift(); continue; } // timeout 5 …
    break;
  }
  if (w.length > 1 && /^(node|npx|bunx?|python3?|uv|deno|pnpm|yarn)$/.test(w[0]) && !/^(run|exec|dlx)$/.test(w[1])) w.shift();
  if (w.length) w[0] = w[0].split(/[\\/]/).pop();
  if (w[0] === 'gh') { let k = 1; while (k < w.length && /^(-R|--repo|--hostname)$/.test(w[k])) k += 2; while (k < w.length && /^--repo=/.test(w[k])) k++; w.splice(1, k - 1); }
  if (w[0] === 'git') { let k = 1; while (k < w.length && /^(-C|-c|--git-dir|--work-tree|--namespace)$/.test(w[k])) k += 2; while (k < w.length && /^--(no-pager|bare|literal-pathspecs)$/.test(w[k])) k++; w.splice(1, k - 1); }
  return w;
}
export const segments = (cmd) => parseShell(cmd).map(ws => commandWords(ws));
export function commandOf(seg) { return commandWords(String(seg).split(/\s+/).filter(Boolean)).join(' '); }
// Does the shell command run `want` (e.g. "gh pr create") as a command, not inside a quote or an echo?
export function runsCommand(cmd, want) {
  const ww = String(want).trim().split(/\s+/);
  return segments(cmd).some(cw => ww.every((x, k) => cw[k] === x));
}
// A flag in an actual command's arguments, e.g. --no-verify (not in a message or an echo).
export function usesFlag(cmd, flag) {
  return segments(cmd).some(cw => !/^(echo|printf|cat|grep|rg)$/.test(cw[0] || '') && cw.slice(1).some(a => a === flag || a.startsWith(flag + '=')));
}
// Skipping git hooks: --no-verify anywhere in a real command, or git commit -n (also grouped, like -an).
export function skipsHooks(cmd) {
  return usesFlag(cmd, '--no-verify') || segments(cmd).some(cw => {
    if (cw[0] !== 'git' || cw[1] !== 'commit') return false;
    for (let k = 2; k < cw.length; k++) {
      const x = cw[k];
      if (/^-[a-zA-Z]+$/.test(x)) {
        const flags = x.slice(1); const val = flags.search(/[mFCct]/);
        if (flags.slice(0, val < 0 ? undefined : val).includes('n')) return true;
        if (val >= 0 && val === flags.length - 1) k++; // -m <message>: the next word is the message
      } else if (/^--(message|file|reuse-message|reedit-message|template|cleanup|author|date)$/.test(x)) k++;
    }
    return false;
  });
}
// The raw command with only clear data removed: commit messages, echo/printf/grep arguments, and heredocs
// written to a file. Used for the plain-text second check, so the guard errs towards blocking: if anything
// is piped into a shell (echo '…' | bash), nothing is removed.
const Q = `("(?:[^"\\\\]|\\\\.)*"|'[^']*')`;
export function dataStripped(cmd) {
  const raw = String(cmd || '');
  const intoShell = parseShell(raw).some(ws => { const cw = commandWords(ws); return (SHELLS.test(cw[0] || '') && !cw.some((x, n) => n > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(x))) || cw[0] === 'source' || cw[0] === '.'; })
    || /\|\s*(sudo\s+)?(bash|sh|zsh|dash|ksh|eval|xargs\s+(-\S+\s+)*(bash|sh|zsh))\b/.test(raw);
  if (intoShell) return raw;
  let s = raw.replace(/(^|\n)([^\n]*?)<<-?\s*(['"]?)([\w.-]+)\3([^\n]*)\n([\s\S]*?)\n\s*\4\s*(?=\n|$)/g,
    (m, a, pre, q, tag, post) => /\b(bash|sh|zsh|dash|ksh|eval|source|python3?|node)\b/.test(pre) ? m : `${a}${pre}<<${tag}${post}\n\n${tag}`);
  s = s.replace(new RegExp(`(\\s-[a-zA-Z]*m\\s*|\\s--(?:message|title|body)[= ]\\s*|\\s-[Ftb]\\s+)${Q}`, 'g'), '$1""');
  s = s.replace(new RegExp(`\\b(echo|printf)((?:\\s+-\\w+)*)((?:\\s+${Q})+)`, 'g'), '$1$2 ""');
  s = s.replace(new RegExp(`\\b(grep|rg|git\\s+grep|git\\s+log\\s+--grep(?:=|\\s))((?:\\s*-\\S+)*)\\s*${Q}`, 'g'), '$1$2 ""');
  return s;
}
// Does the command run `want`? True if the parser finds it, or if its words appear in order in the
// command once clear data (messages, echo text) is removed. Two checks, so wrapping a command can't hide it.
export function mentionsCommand(cmd, want) {
  if (runsCommand(cmd, want)) return true;
  const ww = String(want).trim().split(/\s+/).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(^|[^\\w./-])["']?${ww[0]}["']?(?:\\s+(?:-\\S+\\s+\\S+\\s+)*?)?` + ww.slice(1).map(x => `["']?${x}["']?`).join('\\s+') + `(?![\\w-])`);
  return re.test(dataStripped(cmd).replace(/[<>]/g, ' '));
}
// Skipping hooks, either check: --no-verify or a prefix of it (git accepts --no-v), git commit -n,
// or switching hooks off with core.hooksPath.
export function skipsHooksAny(cmd) {
  if (skipsHooks(cmd)) return true;
  const d = dataStripped(cmd);
  return /(^|\s)["']?--no-v(?:e(?:r(?:i(?:fy?)?)?)?)?["']?(?![\w-])/.test(d) || /core\.hooks[Pp]ath/.test(d);
}

export function config() {
  try { return JSON.parse(fs.readFileSync(path.join(AGENT, 'config.json'), 'utf8')); }
  catch { return {}; }
}

export function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', timeout: opts.timeout || 240000, env: opts.env ? { ...process.env, ...opts.env } : process.env });
  return { ok: r.status === 0, status: r.status, out: (r.stdout || '') + (r.stderr || ''), timedOut: r.error?.code === 'ETIMEDOUT' };
}

// Run the repo's checks the way CI does: CI=1 stops test runners (Jest, Vitest, Create React App)
// from starting in watch mode and waiting forever.
// "setup" = the checks couldn't run at all (tools or dependencies not installed). That's not the code's
// fault, so the stop gate reports it instead of sending the agent back to "fix" it.
export function runVerify(cmd, opts = {}) {
  const r = sh(cmd, { env: { CI: '1' }, timeout: opts.timeout });
  const missingDeps = (fs.existsSync(path.join(ROOT, 'package.json')) && !fs.existsSync(path.join(ROOT, 'node_modules')));
  const setup = !r.ok && (
    r.status === 127 ||
    /command not found|is not recognized as an internal or external command|Failed to spawn|No such file or directory \(os error 2\)/i.test(r.out) ||
    (missingDeps && /Cannot find module|MODULE_NOT_FOUND|not found/i.test(r.out)) ||
    (/No module named/.test(r.out) && !fs.existsSync(path.join(ROOT, '.venv')))
  );
  const missing = [...new Set([...(r.out.matchAll(/(?:sh: \d+: |bash: )?([\w@./-]+): (?:command )?not found/g))].map(m => m[1]).filter(x => !/^(sh|bash|line)$/.test(x)))].slice(0, 3);
  return { ...r, setup: !!setup, missing };
}

export function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function readStdin() {
  return new Promise(res => { let s = ''; process.stdin.on('data', d => (s += d)); process.stdin.on('end', () => res(s)); });
}

// Glob: "**/" = zero or more directories, trailing "**" = anything below, "*" = within one segment, "?" = one char.
// (Fix: the original turned a trailing "**" into "(.*/)?", so "migrations/**" never matched a file.)
export function globToRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      const slash = g[i + 2] === '/';
      re += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function rel(file) {
  return path.relative(ROOT, path.resolve(ROOT, file || '')).split(path.sep).join('/');
}

// Path lists in .referee/config.json. A pattern starting with "!" is an exception ("!**/.env.example").
export function matchList(file, pats = []) {
  const f = rel(file);
  if (pats.some(g => g.startsWith('!') && globToRegex(g.slice(1)).test(f))) return null;
  return pats.find(g => !g.startsWith('!') && globToRegex(g).test(f)) || null;
}
// protectedPaths: never edited. appendOnlyPaths: new files may be added, existing ones never changed
// (migrations: a new migration is normal work; editing an applied one breaks every database that ran it).
// secretPaths: never read, so secrets don't land in the agent's context, transcript or logs.
export const protectedMatch = (file, cfg = config()) => matchList(file, cfg.protectedPaths);
export const appendOnlyMatch = (file, cfg = config()) => matchList(file, cfg.appendOnlyPaths);
export const secretMatch = (file, cfg = config()) => matchList(file, cfg.secretPaths);

// Test files the user agreed (spec-first). { "<repo-relative path>": { hash, spec, at } }
export function readLocks() {
  try { return JSON.parse(fs.readFileSync(path.join(AGENT, 'state', 'locks.json'), 'utf8')); } catch { return {}; }
}
export function lockedMatch(file) {
  const f = rel(file);
  const l = readLocks()[f];
  return l ? { file: f, spec: l.spec } : null;
}

export function fullSendActive(cfg = config()) {
  const f = path.join(AGENT, 'state', 'full-send');
  if (!fs.existsSync(f)) return false;
  const hours = cfg.fullSendHours || 6;
  return Date.now() - fs.statSync(f).mtimeMs < hours * 3600 * 1000;
}

// "observe" = measure only (the "before"): nothing blocked, nothing said to the agent.
// "enforce" = the referee is on. A baseline set at install ("baselineUntil") observes until that date, then enforces.
export function effectiveMode(cfg = config()) {
  if (cfg.baselineUntil && Date.now() < Date.parse(cfg.baselineUntil)) return 'observe';
  return cfg.mode === 'observe' ? 'observe' : 'enforce';
}

export function branchSlug(b) { return (b || 'detached').replace(/[^\w.-]+/g, '-'); }

// Fingerprint of the working tree, so the Stop hook can tell whether this turn changed anything.
export function treeSnapshot() {
  const s = (git(['status', '--porcelain']) ?? '') + '\n' + (git(['diff', 'HEAD']) ?? '');
  return crypto.createHash('sha1').update(s).digest('hex');
}

export function turnStateFile(sessionId) {
  return path.join(AGENT, 'state', `turn-${String(sessionId || 'none').replace(/[^\w.-]/g, '_')}.json`);
}
export function readTurn(sessionId) {
  try { return JSON.parse(fs.readFileSync(turnStateFile(sessionId), 'utf8')); } catch { return null; }
}
export function writeTurn(sessionId, data) {
  fs.mkdirSync(path.join(AGENT, 'state'), { recursive: true });
  fs.writeFileSync(turnStateFile(sessionId), JSON.stringify(data));
}

// Last result per session, for the status line and /referee. Keeps the 20 most recent sessions.
const lastFile = () => path.join(AGENT, 'state', 'last.json');
export function writeLast(entry) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(lastFile(), 'utf8')); } catch {}
  const by = { ...(all.bySession || {}), [entry.sid || 'none']: entry };
  const keep = Object.entries(by).sort((a, b) => (b[1].at || '').localeCompare(a[1].at || '')).slice(0, 20);
  fs.mkdirSync(path.join(AGENT, 'state'), { recursive: true });
  fs.writeFileSync(lastFile(), JSON.stringify({ latest: entry, bySession: Object.fromEntries(keep) }));
}
export function readLast(sessionId) {
  try {
    const all = JSON.parse(fs.readFileSync(lastFile(), 'utf8'));
    return (sessionId && all.bySession?.[sessionId]) || all.latest || null;
  } catch { return null; }
}

// Session log: one JSON line per event, written by hooks (never by the agent).
export function logEvent(sessionId, event) {
  if (!sessionId) return;
  const dir = logsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${sessionId}.jsonl`), JSON.stringify({ t: new Date().toISOString(), ...event }) + '\n');
}

export function readLog(sessionId) {
  // Older installs kept logs in .referee/logs; still read those.
  const f = [path.join(logsDir(), `${sessionId}.jsonl`), path.join(AGENT, 'logs', `${sessionId}.jsonl`)].find(x => fs.existsSync(x));
  if (!f) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// Short, safe summary of a tool call for the log.
export function summarize(tool, input = {}) {
  const s = { tool };
  if (tool === 'Skill') s.skill = input.skill || input.name || input.command;
  else if (tool === 'Agent' || tool === 'Task') s.subagent = input.subagent_type || 'general-purpose';
  else if (tool === 'Bash') s.cmd = String(input.command || '').slice(0, 300);
  else if (input.file_path) s.file = rel(input.file_path);
  else if (input.notebook_path) s.file = rel(input.notebook_path);
  else if (input.path) s.file = rel(input.path);
  return s;
}
