#!/usr/bin/env node
// method.mjs — computed answers the agent must not guess.
//   status      is this branch ready to hand over / merge?
//   claude-md   which CLAUDE.md / AGENTS.md lines belong lower on the fix ladder?
//   audits      how often each session check passes across recent sessions
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, AGENT, config, sh, git, fullSendActive, branchSlug } from './lib.mjs';
import { checkLocks as spawnLocks } from './spec.mjs';

const cmd = process.argv[2];
const cfg = config();

function status() {
  const rows = [];
  const add = (name, ok, note = '') => rows.push({ name, ok, note });
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const main = cfg.mainBranch || 'main';
  add('on a branch', !!branch && branch !== main, branch || 'not a git repo');
  const dirty = git(['status', '--porcelain']);
  add('clean tree', dirty === '', dirty ? `${dirty.split('\n').length} uncommitted file(s)` : '');
  const v = cfg.verifyFull || cfg.verify;
  if (v) { const r = sh(v); add(`verify (${v})`, r.ok, r.ok ? '' : r.out.split('\n').filter(Boolean).slice(-3).join(' | ')); }
  else add('verify', false, 'no verify command in .referee/config.json');
  const locks = spawnLocks();
  if (locks.length) add('agreed tests unchanged', locks.every(x => x.ok), locks.filter(x => !x.ok).map(x => `${x.file} ${x.why}`).join(', '));
  const rep = path.join(AGENT, 'reports', `review-${branchSlug(branch)}.md`);
  if (fs.existsSync(rep)) { const open = fs.readFileSync(rep, 'utf8').split('\n').filter(l => /^open:/.test(l.trim())); add('review done', open.length === 0, open.length ? `${open.length} open finding(s)` : ''); }
  else add('review done', false, `no ${path.relative(ROOT, rep)}`);
  const hasGh = sh('gh --version').ok;
  if (hasGh) {
    const pr = sh('gh pr view --json number,url -q .url');
    add('PR open', pr.ok, pr.ok ? pr.out.trim() : 'no PR for this branch');
    if (pr.ok) { const c = sh('gh pr checks'); add('CI green', c.ok, c.ok ? '' : 'checks failing or pending'); }
  } else add('PR open', false, 'gh CLI not available');
  const ready = rows.every(r => r.ok);
  for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
  console.log(`\nmode: ${fullSendActive(cfg) ? 'FULL SEND (merge allowed when ready)' : 'FULL STOP (hand over to the human)'}`);
  console.log(ready ? 'READY' : 'NOT READY');
  process.exit(ready ? 0 : 1);
}

function claudeMd() {
  const files = ['CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md'].map(f => path.join(ROOT, f)).filter(f => fs.existsSync(f));
  if (!files.length) { console.log('No CLAUDE.md or AGENTS.md. Good baseline: run the repo-audit dumb-questions test first.'); return; }
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    console.log(`\n## ${path.relative(ROOT, f)} — ${text.split('\n').length} lines, ~${Math.round(text.length / 4)} tokens loaded every session\n`);
    console.log('| line | kind | move to | text |\n| --- | --- | --- | --- |');
    text.split('\n').forEach((l, i) => {
      const t = l.trim(); if (!t || t.startsWith('#')) return;
      let kind = 'judgment', to = 'keep';
      if (/\b(lives? in|is in|are in|located|directory|folder|found in|under (src|app|lib)|see `?[\w./-]+\/)/i.test(t) || /`[\w./-]+\/[\w./-]*`/.test(t) && /\b(in|at|under)\b/i.test(t)) { kind = 'map'; to = 'delete, or rename the code so it is findable'; }
      else if (/\b(always|never|must|don't|do not)\b.*\b(import|use|call|prefix|suffix|format|lint|type|test|run|indent|semicolon|quote|any)\b/i.test(t)) { kind = 'checkable rule'; to = 'lint / type / test / CI'; }
      else if (/\b(we chose|we decided|because we|decision|historically|used to)\b/i.test(t)) { kind = 'decision'; to = 'kb/decisions/'; }
      if (kind !== 'judgment') console.log(`| ${i + 1} | ${kind} | ${to} | ${t.slice(0, 80).replace(/\|/g, '\\|')} |`);
    });
  }
  console.log('\nLines not listed are judgment calls: keep them only if an agent actually got them wrong without the line.');
}

function audits() {
  const n = Number((process.argv.find(a => a.startsWith('--last=')) || '--last=20').split('=')[1]);
  const f = path.join(AGENT, 'audits', 'scoreboard.json');
  if (!fs.existsSync(f)) { console.log('No audited sessions yet. They appear after the first agent turn ends.'); return; }
  const sb = Object.entries(JSON.parse(fs.readFileSync(f, 'utf8'))).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, n);
  const per = {};
  for (const [, s] of sb) for (const [id, st] of Object.entries(s.results)) { per[id] ??= { pass: 0, fail: 0, na: 0 }; per[id][st === 'n/a' ? 'na' : st]++; }
  console.log(`Last ${sb.length} session(s)\n\n| Check | Pass | Fail | Not triggered | Pass rate |\n| --- | --- | --- | --- | --- |`);
  for (const [id, c] of Object.entries(per)) { const t = c.pass + c.fail; console.log(`| ${id} | ${c.pass} | ${c.fail} | ${c.na} | ${t ? Math.round(100 * c.pass / t) + '%' : '—'} |`); }
  const skills = {}; for (const [, s] of sb) for (const k of s.skills) skills[k] = (skills[k] || 0) + 1;
  console.log(`\nSkills loaded: ${Object.entries(skills).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}`);
  const bad = sb.find(([, s]) => Object.values(s.results).includes('fail'));
  if (bad) console.log(`Latest failing session: ${bad[0]} — "${bad[1].first}" → .referee/audits/${bad[0]}.md`);
  const repeat = Object.entries(per).filter(([, c]) => c.fail >= 2).map(([id]) => id);
  if (repeat.length) console.log(`Repeated failures (run agent-postmortem): ${repeat.join(', ')}`);
}

({ status, 'claude-md': claudeMd, audits })[cmd] ? ({ status, 'claude-md': claudeMd, audits })[cmd]() : console.log('usage: node .referee/scripts/method.mjs status | claude-md | audits [--last=20]');
