#!/usr/bin/env node
// detect.mjs — work out the repo's checks command ("verify") from what's actually in it.
//   node .referee/scripts/detect.mjs          print { verify, verifyFull, notes } as JSON
// Used by install.sh. Rules, each learned from a real repo:
//   - bun, pnpm, yarn or npm, from the lockfile
//   - Turborepo: only the packages a change affects (--affected)
//   - a "test" script with no test files is left out (it would fail on every turn)
//   - Python projects with ruff / mypy / pytest are checked too, through uv or poetry when they're used
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, git } from './lib.mjs';

const exists = p => fs.existsSync(path.join(ROOT, p));
const readJson = p => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return null; } };
const files = (git(['ls-files']) || '').split('\n').filter(Boolean);
const TEST_FILE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.py$/;

export function detect() {
  const notes = [];
  const fast = [], full = [];

  // JavaScript / TypeScript
  if (exists('package.json')) {
    const s = readJson('package.json')?.scripts || {};
    const bun = exists('bun.lock') || exists('bun.lockb'), pnpm = exists('pnpm-lock.yaml'), yarn = exists('yarn.lock');
    const hasJsTests = files.some(f => TEST_FILE.test(f) && /\.[cm]?[jt]sx?$/.test(f));
    if (exists('turbo.json')) {
      const tj = readJson('turbo.json') || {};
      const tasks = Object.keys(tj.tasks || tj.pipeline || {});
      const run = bun ? 'bunx turbo run' : pnpm ? 'pnpm turbo run' : yarn ? 'yarn turbo run' : 'npx turbo run';
      const f = ['typecheck', 'lint', 'check'].filter(k => tasks.includes(k));
      const t = tasks.includes('test') && hasJsTests ? ['test'] : [];
      if (f.length) fast.push(`${run} ${f.join(' ')} --affected`);
      if (f.length || t.length) full.push(`${run} ${[...f, ...t].join(' ')} --affected`);
    } else {
      const pm = bun ? 'bun run' : pnpm ? 'pnpm' : yarn ? 'yarn' : 'npm run';
      const f = ['typecheck', 'lint', 'check'].filter(k => s[k]).map(k => `${pm} ${k}`);
      fast.push(...f);
      full.push(...f);
      if (s.test && hasJsTests) full.push(`${pm} test`);
      else if (s.test) notes.push('Left out the "test" script: no test files found yet, so it would fail on every turn.');
      if (!f.length && s.test && hasJsTests) fast.push(`${pm} test`);
    }
  }

  // Python: every pyproject.toml up to two folders deep that uses ruff, mypy or pytest
  const pyprojects = files.filter(f => /(^|\/)pyproject\.toml$/.test(f) && f.split('/').length <= 3);
  for (const pp of pyprojects) {
    const dir = path.dirname(pp);
    const text = fs.readFileSync(path.join(ROOT, pp), 'utf8');
    const uses = tool => new RegExp(`["'\\s]${tool}[\\s<>=~!\\[",']|\\[tool\\.${tool}\\]`).test(text);
    if (!['ruff', 'mypy', 'pytest'].some(uses)) continue;
    const up = d => { const parts = d === '.' ? [] : d.split('/'); return parts.map((_, i) => parts.slice(0, parts.length - i).join('/')).concat('.'); };
    const uv = up(dir).some(d => exists(path.join(d, 'uv.lock')));
    const poetry = up(dir).some(d => exists(path.join(d, 'poetry.lock')));
    const where = dir === '.' ? '' : dir;
    const cmd = tool => uv ? `uv run${where ? ` --directory ${where}` : ''} ${tool}` : poetry ? `${where ? `cd ${where} && ` : ''}poetry run ${tool}` : `${where ? `cd ${where} && ` : ''}python -m ${tool}`;
    const hasPyTests = files.some(f => (where ? f.startsWith(where + '/') : true) && /\.py$/.test(f) && TEST_FILE.test(f));
    if (uses('ruff')) { fast.push(`${cmd('ruff')} check .`); full.push(`${cmd('ruff')} check .`); }
    if (uses('mypy')) full.push(`${cmd('mypy')} .`);
    if (uses('pytest') && hasPyTests) { full.push(cmd('pytest')); notes.push(`Python tests (${cmd('pytest')}) run only in the full check: they may need a database or other services.`); }
  }

  // Other stacks: leave it to the user, but say what to set
  if (!fast.length && !full.length) {
    if (exists('Cargo.toml')) { fast.push('cargo check'); full.push('cargo check', 'cargo test'); }
    else if (exists('go.mod')) { fast.push('go vet ./...'); full.push('go vet ./...', 'go test ./...'); }
  }
  const verify = (fast.length ? fast : full).join(' && ');
  return { verify, verifyFull: full.join(' && ') || verify, notes };
}

if ((process.argv[1] || '').endsWith('detect.mjs')) console.log(JSON.stringify(detect(), null, 2));
