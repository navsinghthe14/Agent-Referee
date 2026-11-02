#!/usr/bin/env node
// spec.mjs — agreed tests: lock them, check they're unchanged, report in plain English.
//   node .referee/scripts/spec.mjs lock   kb/tasks/specs/<name>.md   lock the spec's test files
//   node .referee/scripts/spec.mjs check                             are all locked files unchanged?
//   node .referee/scripts/spec.mjs report kb/tasks/specs/<name>.md   plain-English report + checks run
// The agent can lock but never unlock: only the user, by saying "unlock the tests" (route.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, config, rel, readLocks, runVerify } from './lib.mjs';

const locksFile = path.join(ROOT, '.referee', 'state', 'locks.json');
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');

function parseSpec(specPath) {
  const text = fs.readFileSync(path.join(ROOT, specPath), 'utf8');
  const section = name => (text.split(new RegExp(`^## ${name}\\s*$`, 'm'))[1] || '').split(/^## /m)[0];
  const items = s => s.split('\n').map(l => l.trim()).filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
  return {
    title: (text.match(/^# (.+)$/m) || [, specPath])[1],
    checks: items(section('Checks')),
    files: items(section('Locked test files')).map(f => rel(f.replace(/`/g, ''))),
  };
}

export function checkLocks() {
  const locks = readLocks();
  return Object.entries(locks).map(([file, l]) => {
    const exists = fs.existsSync(path.join(ROOT, file));
    return { file, spec: l.spec, ok: exists && hash(file) === l.hash, why: exists ? (hash(file) === l.hash ? '' : 'changed since it was agreed') : 'deleted' };
  });
}

const [cmd, specArg] = process.argv.slice(2);
if ((process.argv[1] || '').endsWith('spec.mjs')) {
  if (cmd === 'lock') {
    if (!specArg || !fs.existsSync(path.join(ROOT, specArg))) { console.error('Usage: spec.mjs lock kb/tasks/specs/<name>.md'); process.exit(1); }
    const spec = parseSpec(specArg);
    if (!spec.files.length) { console.error('No files under "## Locked test files" in the spec.'); process.exit(1); }
    const missing = spec.files.filter(f => !fs.existsSync(path.join(ROOT, f)));
    if (missing.length) { console.error(`Write these tests before locking: ${missing.join(', ')}`); process.exit(1); }
    const locks = readLocks();
    for (const f of spec.files) locks[f] = { hash: hash(f), spec: rel(specArg), at: new Date().toISOString() };
    fs.mkdirSync(path.dirname(locksFile), { recursive: true });
    fs.writeFileSync(locksFile, JSON.stringify(locks, null, 2));
    console.log(`🔒 Locked ${spec.files.length} test file(s) for "${spec.title}":`);
    for (const f of spec.files) console.log(`   ${f}`);
    console.log('The agent can no longer edit them. Only you can unlock them, by saying "unlock the tests".');
  } else if (cmd === 'check') {
    const r = checkLocks();
    if (!r.length) { console.log('No locked tests.'); process.exit(0); }
    for (const x of r) console.log(`${x.ok ? '✓' : '✗'} ${x.file}${x.ok ? '' : ` — ${x.why}`}`);
    process.exit(r.every(x => x.ok) ? 0 : 1);
  } else if (cmd === 'report') {
    if (!specArg || !fs.existsSync(path.join(ROOT, specArg))) { console.error('Usage: spec.mjs report kb/tasks/specs/<name>.md'); process.exit(1); }
    const spec = parseSpec(specArg);
    const cfg = config();
    const v = cfg.verifyFull || cfg.verify;
    const run = v ? runVerify(v) : null;
    const locks = checkLocks().filter(x => spec.files.includes(x.file));
    const plain = c => c.replace(/\s*·\s*test:.*$/, '').replace(/^\[you said\]\s*(.*)$/, '$1 (you said)').replace(/^\[assumed\]\s*(.*)$/, '$1 (assumed — say if that\'s wrong)').replace(/^\[obvious\]\s*/, '');
    console.log(`⚖ ${spec.title}\n`);
    console.log(`Agreed checks (${spec.checks.length}):`);
    for (const c of spec.checks) console.log(`  • ${plain(c)}`);
    console.log('');
    console.log(run ? `${run.ok ? '✓' : '✗'} Tests: \`${v}\` ${run.ok ? 'passes' : 'FAILS'}` : '! No checks command set, so the tests were not run here');
    if (run && !run.ok) console.log(run.out.split('\n').filter(Boolean).slice(-5).map(l => '    ' + l).join('\n'));
    console.log(locks.length ? `${locks.every(x => x.ok) ? '✓' : '✗'} Locked tests ${locks.every(x => x.ok) ? 'unchanged since you agreed them' : 'CHANGED: ' + locks.filter(x => !x.ok).map(x => `${x.file} (${x.why})`).join(', ')}` : '! These tests were never locked');
    process.exit(run?.ok !== false && locks.every(x => x.ok) ? 0 : 1);
  } else {
    console.log('usage: spec.mjs lock <spec.md> | check | report <spec.md>');
  }
}
