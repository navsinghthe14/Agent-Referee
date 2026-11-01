#!/usr/bin/env bash
# Install Agent Referee into a repo. Never overwrites your files; safe to re-run.
#   bash install.sh /path/to/your-repo
#   bash install.sh /path/to/your-repo --upgrade   # also replace the kit's own scripts with this version
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$(cd "${1:-.}" && pwd)"
UPGRADE="${2:-}"
[ "$SRC" = "$DEST" ] && { echo "Run this against another repo: bash install.sh /path/to/repo"; exit 1; }
command -v node >/dev/null || { echo "Node 18+ is required."; exit 1; }
copied=0; kept=0; upgraded=0
while IFS= read -r f; do
  t="$DEST/$f"
  if [ -e "$t" ]; then
    # --upgrade replaces the kit's code (scripts) but never your config, rules, routing or skills.
    if [ "$UPGRADE" = "--upgrade" ] && [[ "$f" == .referee/scripts/* ]]; then cp "$SRC/$f" "$t"; upgraded=$((upgraded+1)); else kept=$((kept+1)); fi
  else mkdir -p "$(dirname "$t")"; cp "$SRC/$f" "$t"; copied=$((copied+1)); fi
done < <(cd "$SRC" && find .claude/skills .claude/agents .referee kb .github -type f \
  ! -path '.referee/logs/*' ! -path '.referee/audits/*' ! -path '.referee/state/*' ! -path '.referee/reports/*')

# Merge hooks into .claude/settings.json without dropping existing settings.
# Older hook entries (including the original agent-method kit) (same hook file, different launcher) are replaced, not duplicated.
SRC="$SRC" DEST="$DEST" node -e '
const fs=require("fs"),p=process.env.DEST+"/.claude/settings.json";
const add=JSON.parse(fs.readFileSync(process.env.SRC+"/.claude/settings.json","utf8")).hooks;
const cur=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):{};
cur.hooks??={};
const hookFile=c=>(c.match(/hooks.{1,6}(route|guard|log|stop-gate)\.mjs/)||[])[1];
for(const [ev,groups] of Object.entries(add)){cur.hooks[ev]??=[];
  for(const g of groups){const c=g.hooks[0].command,h=hookFile(c);
    cur.hooks[ev]=cur.hooks[ev].filter(x=>!(x.hooks||[]).some(k=>k.command!==c&&hookFile(k.command||"")===h));
    if(!cur.hooks[ev].some(x=>(x.hooks||[]).some(k=>k.command===c)))cur.hooks[ev].push(g);}}
fs.mkdirSync(process.env.DEST+"/.claude",{recursive:true});
fs.writeFileSync(p,JSON.stringify(cur,null,2)+"\n");'

# Detect the verify command if config has none.
# Turborepo: run only the packages this change affects (--affected), so the Stop hook stays fast.
DEST="$DEST" node -e '
const fs=require("fs"),d=process.env.DEST,cp=d+"/.referee/config.json";
const cfg=JSON.parse(fs.readFileSync(cp,"utf8"));
if(!cfg.verify&&fs.existsSync(d+"/package.json")){
  const s=JSON.parse(fs.readFileSync(d+"/package.json","utf8")).scripts||{};
  const pnpm=fs.existsSync(d+"/pnpm-lock.yaml"),yarn=fs.existsSync(d+"/yarn.lock");
  if(fs.existsSync(d+"/turbo.json")){
    let tj={};try{tj=JSON.parse(fs.readFileSync(d+"/turbo.json","utf8"));}catch{}
    const tasks=Object.keys(tj.tasks||tj.pipeline||{});
    const run=pnpm?"pnpm turbo run":yarn?"yarn turbo run":"npx turbo run";
    const fast=["typecheck","lint","check"].filter(k=>tasks.includes(k));
    const full=[...fast,...(tasks.includes("test")?["test"]:[])];
    if(fast.length)cfg.verify=`${run} ${fast.join(" ")} --affected`;
    if(full.length)cfg.verifyFull=`${run} ${full.join(" ")} --affected`;
    if(!fast.length&&full.length)cfg.verify=cfg.verifyFull;
  } else {
    const pm=pnpm?"pnpm":yarn?"yarn":"npm run";
    const fast=["typecheck","lint","check"].filter(k=>s[k]).map(k=>`${pm} ${k}`);
    const full=[...fast,...(s.test?[`${pm} test`]:[])];
    if(fast.length||full.length){cfg.verify=(fast.length?fast:full).join(" && ");cfg.verifyFull=full.join(" && ");}
  }
  if(cfg.verify){fs.writeFileSync(cp,JSON.stringify(cfg,null,2)+"\n");console.log("verify     = "+cfg.verify+"\nverifyFull = "+cfg.verifyFull);}}
if(!cfg.verify)console.log("Set \"verify\" in .referee/config.json (e.g. \"cargo check && cargo test\").");'

GI="$DEST/.gitignore"; touch "$GI"
while IFS= read -r line; do grep -qxF "$line" "$GI" || echo "$line" >> "$GI"; done < "$SRC/.gitignore.referee"

echo "Agent Referee installed: $copied file(s) added, $upgraded script(s) upgraded, $kept already present (kept yours)."
echo "Next: open Claude Code in the repo and say \"audit the repo\". Check sessions with: node .referee/scripts/method.mjs audits"
