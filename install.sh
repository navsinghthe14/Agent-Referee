#!/usr/bin/env bash
# Install Agent Referee into a repo. Never overwrites your files; safe to re-run.
#   bash install.sh /path/to/your-repo
#   bash install.sh /path/to/your-repo --upgrade      # also replace the kit's own scripts with this version
#   bash install.sh /path/to/your-repo --baseline=7   # observe only for 7 days first, to measure your "before"
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$(cd "${1:-.}" && pwd)"
UPGRADE=""; BASELINE=""
for a in "${@:2}"; do case "$a" in --upgrade) UPGRADE="--upgrade";; --baseline=*) BASELINE="${a#--baseline=}";; esac; done
[ "$SRC" = "$DEST" ] && { echo "Run this against another repo: bash install.sh /path/to/repo"; exit 1; }
command -v node >/dev/null || { echo "Node 18+ is required."; exit 1; }
copied=0; kept=0; upgraded=0
while IFS= read -r f; do
  t="$DEST/$f"
  if [ -e "$t" ]; then
    # --upgrade replaces the kit's code (scripts) but never your config, rules, routing or skills.
    if [ "$UPGRADE" = "--upgrade" ] && [[ "$f" == .referee/scripts/* ]]; then cp "$SRC/$f" "$t"; upgraded=$((upgraded+1)); else kept=$((kept+1)); fi
  else mkdir -p "$(dirname "$t")"; cp "$SRC/$f" "$t"; copied=$((copied+1)); fi
done < <(cd "$SRC" && find .claude/skills .claude/agents .claude/commands .referee kb .github -type f \
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
// Status line: add ours only if the repo has none. Never replace someone else'"'"'s.
const sl=JSON.parse(fs.readFileSync(process.env.SRC+"/.claude/settings.json","utf8")).statusLine;
if(sl&&!cur.statusLine)cur.statusLine=sl;
else if(sl&&cur.statusLine&&!String(cur.statusLine.command||"").includes("statusline.mjs"))console.log("Kept your own status line. To show the referee too, see README > Status line.");
fs.mkdirSync(process.env.DEST+"/.claude",{recursive:true});
fs.writeFileSync(p,JSON.stringify(cur,null,2)+"\n");'

# Detect the checks command if config has none (rules in .referee/scripts/detect.mjs).
(cd "$DEST" && REFEREE_ROOT="$DEST" node -e '
const fs=require("fs"),cp=process.env.REFEREE_ROOT+"/.referee/config.json";
const cfg=JSON.parse(fs.readFileSync(cp,"utf8"));
if(cfg.verify){process.exit(0);}
import(require("url").pathToFileURL(process.env.REFEREE_ROOT+"/.referee/scripts/detect.mjs")).then(({detect})=>{
  const d=detect();
  for(const n of d.notes)console.log("note: "+n);
  if(!d.verify){console.log("Set \"verify\" in .referee/config.json (e.g. \"cargo check && cargo test\").");return;}
  cfg.verify=d.verify;cfg.verifyFull=d.verifyFull;
  fs.writeFileSync(cp,JSON.stringify(cfg,null,2)+"\n");
  console.log("verify     = "+cfg.verify+"\nverifyFull = "+cfg.verifyFull);});')

# Baseline: observe for N days (nothing blocked), then enforce automatically.
if [ -n "$BASELINE" ]; then DEST="$DEST" DAYS="$BASELINE" node -e '
const fs=require("fs"),p=process.env.DEST+"/.referee/config.json",c=JSON.parse(fs.readFileSync(p,"utf8"));
c.baselineUntil=new Date(Date.now()+Number(process.env.DAYS)*864e5).toISOString();
fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");
console.log("Baseline: observing until "+c.baselineUntil.slice(0,10)+". Nothing is blocked until then; the referee enforces automatically after.");'; fi

GI="$DEST/.gitignore"; touch "$GI"
while IFS= read -r line; do grep -qxF "$line" "$GI" || echo "$line" >> "$GI"; done < "$SRC/.gitignore.referee"

echo "Agent Referee installed: $copied file(s) added, $upgraded script(s) upgraded, $kept already present (kept yours)."

# Prove it works before the user opens Claude Code.
(cd "$DEST" && CLAUDE_PROJECT_DIR="$DEST" node .referee/scripts/doctor.mjs) || true
echo
echo "Next: open Claude Code in this repo and send any message."
echo "      The referee will scan the repo first and show you which skills it will use and how."
