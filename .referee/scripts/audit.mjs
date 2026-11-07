#!/usr/bin/env node
// audit.mjs — grade one session against .referee/session-rules.json.
//   node .referee/scripts/audit.mjs <session-id>   (or "latest")
// Called by the Stop hook at the end of every turn; safe to run by hand.
// Writes audits/<session>.md and audits/scoreboard.json in the shared data folder (.git/referee/ by default).
import fs from 'node:fs';
import path from 'node:path';
import { AGENT, config, readLog, globToRegex, runsCommand, mentionsCommand, logsDir, auditsDir } from './lib.mjs';

export function audit(sessionId) {
  const cfg = config();
  const rulesFile = path.join(AGENT, 'session-rules.json');
  const rules = fs.existsSync(rulesFile) ? JSON.parse(fs.readFileSync(rulesFile, 'utf8')).rules : [];
  const ev = readLog(sessionId);
  if (!ev.length) return null;

  const calls = ev.filter(e => e.type === 'tool');
  // Blocked attempts are matched with the guard's wider check, so a wrapped attempt the guard caught counts.
  const attempts = ev.filter(e => (e.type === 'blocked' || e.type === 'would_block') && e.cmd).map(e => ({ ...e, tool: 'Bash', wide: true }));
  const matches = (e, w) =>
    (!w.tool || e.tool === w.tool || (w.tool === 'Agent' && e.tool === 'Task')) &&
    (!w.skill || e.skill === w.skill) &&
    (!w.subagent || e.subagent === w.subagent) &&
    (!w.match || (e.wide ? mentionsCommand : runsCommand)(e.cmd || '', w.match)) &&
    (!w.file || globToRegex(w.file).test(e.file || ''));
  const reviewerMatch = (e) => {
    const r = cfg.reviewer || {};
    if (r.kind === 'cli' && r.cli) return e.tool === 'Bash' && (e.cmd || '').includes(r.cli.split(' ')[0]);
    return (e.tool === 'Agent' || e.tool === 'Task') && e.subagent === (r.referee || 'independent-reviewer');
  };
  const req = (e, r) => (r.reviewer ? reviewerMatch(e) : matches(e, r));
  const isEdit = (e) => ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(e.tool);
  const label = (m) => m.reviewer ? 'configured reviewer' : (m.skill || m.match || m.tool);

  const results = [];
  for (const rule of rules) {
    let status = 'n/a', evidence = '';
    if (rule.type === 'routed_skill_before_edit') {
      // Fix: each routed prompt is checked against its own turn (up to the next prompt),
      // not against edits made before the skill was ever named.
      const missing = [];
      let routedAny = false;
      ev.forEach((p, i) => {
        if (p.type !== 'prompt' || !p.routed) return;
        routedAny = true;
        let ok = false;
        for (let j = i + 1; j < ev.length && ev[j].type !== 'prompt'; j++) {
          const x = ev[j];
          if (x.type !== 'tool') continue;
          if (x.tool === 'Skill' && x.skill === p.routed) { ok = true; break; }
          if (isEdit(x)) break;
        }
        if (!ok) missing.push(`${p.routed} for "${(p.text || '').slice(0, 40)}"`);
      });
      if (routedAny) {
        status = missing.length ? 'fail' : 'pass';
        evidence = missing.length ? `not loaded before the turn's first edit: ${missing.join('; ')}` : 'every routed skill loaded in its turn';
      }
    } else if (rule.type === 'requires_before') {
      // Fix: every occurrence is checked, not just the first (a second PR needs its own review).
      const idxs = calls.map((e, i) => (matches(e, rule.when) ? i : -1)).filter(i => i >= 0);
      if (idxs.length) {
        const missing = new Set();
        for (const idx of idxs) {
          const scope = rule.after ? calls.slice(idx) : calls.slice(0, idx);
          for (const r of rule.require) if (!scope.some(e => req(e, r))) missing.add(label(r));
        }
        status = missing.size ? 'fail' : 'pass';
        evidence = missing.size ? `missing ${[...missing].join(', ')} ${rule.after ? 'after' : 'before'} "${rule.when.match || rule.when.skill}" (${idxs.length} occurrence(s))` : 'all required steps found';
      }
    } else if (rule.type === 'forbid') {
      // "Never" rules count attempts too. The guard blocks these commands, so they never run; if only
      // commands that ran were checked, the rule could never fail. Never attempted = n/a, not a free pass.
      const hit = calls.find(e => matches(e, rule.when));
      const tried = attempts.find(e => matches(e, rule.when));
      if (hit) { status = 'fail'; evidence = hit.cmd || hit.tool; }
      else if (tried) { status = 'fail'; evidence = `tried, blocked by the guard: ${tried.cmd}`; }
    } else if (rule.type === 'forbid_unless_full_send') {
      const hit = calls.find(e => matches(e, rule.when) && !e.fullSend);
      const tried = attempts.find(e => matches(e, rule.when));
      const any = calls.find(e => matches(e, rule.when));
      if (hit) { status = 'fail'; evidence = `ran without full send: ${hit.cmd}`; }
      else if (tried) { status = 'fail'; evidence = `tried, blocked by the guard: ${tried.cmd}`; }
      else if (any) { status = 'pass'; evidence = 'user said full send'; }
    } else if (rule.type === 'max_blocked') {
      // Only scored once the guard has blocked something; zero blocks says nothing about behaviour.
      const n = ev.filter(e => e.type === 'blocked').length;
      if (n) { status = n > rule.max ? 'fail' : 'pass'; evidence = `${n} blocked action(s)`; }
    }
    results.push({ id: rule.id, status, evidence, why: rule.why, plain: rule.plain });
  }

  const prompts = ev.filter(e => e.type === 'prompt');
  const skills = calls.filter(e => e.tool === 'Skill').map(e => e.skill);
  const subagents = calls.filter(e => e.tool === 'Agent' || e.tool === 'Task').map(e => e.subagent);
  const toolCounts = {};
  for (const c of calls) toolCounts[c.tool] = (toolCounts[c.tool] || 0) + 1;
  const files = [...new Set(calls.filter(isEdit).map(e => e.file))];
  const blocked = ev.filter(e => e.type === 'blocked');
  const scored = results.filter(r => r.status !== 'n/a');
  const passed = scored.filter(r => r.status === 'pass').length;

  const md = [
    `# Session audit — ${sessionId}`, '',
    `${ev[0].t} → ${ev[ev.length - 1].t} · score ${passed}/${scored.length}`, '',
    '## Prompts', '', ...prompts.map(p => `- ${p.text}${p.routed ? ` → router: \`${p.routed}\`` : ''}${p.fullSend ? ' (full send)' : ''}`), '',
    '## Skills loaded (in order)', '', skills.length ? skills.map((s, i) => `${i + 1}. \`${s}\``).join('\n') : '_none_', '',
    '## Subagents', '', subagents.length ? subagents.map(s => `- \`${s}\``).join('\n') : '_none_', '',
    '## Tools used', '', '| Tool | Calls |', '| --- | --- |', ...Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `| ${t} | ${n} |`), '',
    '## Files edited', '', files.length ? files.map(f => `- \`${f}\``).join('\n') : '_none_', '',
    '## Blocked by the guard', '', blocked.length ? blocked.map(b => `- ${b.reason}`).join('\n') : '_none_', '',
    '## Checks', '', '| Check | Result | Evidence |', '| --- | --- | --- |',
    ...results.map(r => `| ${r.id} | ${r.status === 'pass' ? '✓ pass' : r.status === 'fail' ? '✗ fail' : 'n/a'} | ${(r.evidence || r.why).replace(/\|/g, '\\|')} |`), ''
  ].join('\n');

  const dir = auditsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.md`), md);

  const sbFile = path.join(dir, 'scoreboard.json');
  let sb = {};
  try { sb = JSON.parse(fs.readFileSync(sbFile, 'utf8')); } catch {}
  sb[sessionId] = { at: ev[ev.length - 1].t, results: Object.fromEntries(results.map(r => [r.id, r.status])), skills, first: prompts[0]?.text || '' };
  fs.writeFileSync(sbFile, JSON.stringify(sb, null, 2));
  return { md, passed, total: scored.length, failed: results.filter(r => r.status === 'fail') };
}

if ((process.argv[1] || '').endsWith('audit.mjs')) {
  let id = process.argv[2];
  if (!id || id === 'latest') {
    const dir = logsDir();
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m) : [];
    id = files[0]?.f.replace(/\.jsonl$/, '');
  }
  if (!id) { console.log('No session logs yet.'); process.exit(0); }
  const r = audit(id);
  if (!r) { console.log(`No log for session ${id}.`); process.exit(0); }
  console.log(r.md);
  process.exit(r.failed.length ? 1 : 0);
}
