// Shared helpers. Node 18+, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const ROOT = process.env.REFEREE_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const AGENT = path.join(ROOT, '.referee');

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
export function runVerify(cmd) {
  const r = sh(cmd, { env: { CI: '1' } });
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

// A pattern starting with "!" is an exception: "!**/.env.example" keeps templates editable.
export function protectedMatch(file, cfg = config()) {
  const f = rel(file);
  const pats = cfg.protectedPaths || [];
  if (pats.some(g => g.startsWith('!') && globToRegex(g.slice(1)).test(f))) return null;
  return pats.find(g => !g.startsWith('!') && globToRegex(g).test(f)) || null;
}

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
  const dir = path.join(AGENT, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${sessionId}.jsonl`), JSON.stringify({ t: new Date().toISOString(), ...event }) + '\n');
}

export function readLog(sessionId) {
  const f = path.join(AGENT, 'logs', `${sessionId}.jsonl`);
  if (!fs.existsSync(f)) return [];
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
