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
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', timeout: opts.timeout || 240000 });
  return { ok: r.status === 0, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
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

export function protectedMatch(file, cfg = config()) {
  const f = rel(file);
  return (cfg.protectedPaths || []).find(g => globToRegex(g).test(f)) || null;
}

export function fullSendActive(cfg = config()) {
  const f = path.join(AGENT, 'state', 'full-send');
  if (!fs.existsSync(f)) return false;
  const hours = cfg.fullSendHours || 6;
  return Date.now() - fs.statSync(f).mtimeMs < hours * 3600 * 1000;
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
