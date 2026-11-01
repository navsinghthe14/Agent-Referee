---
name: file-pr
description: Use whenever you file, open, create or update a pull request, or write a commit message or branch name. Keeps titles and descriptions short and human-readable, with bad and good examples.
---

# File a PR

1. **Check first.** Run `gh pr list --head <branch>`. If a PR exists, update it instead of opening a second one.
2. **Title.** Follow the repo's convention: read `git log --oneline -20` and match it. Say what changed for the user or the system, not which mechanism you touched.
3. **Description.** Two short parts: the problem, then the fix. Add evidence (test output, screenshot, video link) and a review summary. No headings for their own sake, and no list of every file touched.
4. **Evidence files.** Upload or link them. Never commit screenshots or videos to the repo just to show them in the PR.
5. **Agent tag.** End with one line saying which agent and model wrote it, for example `— opened by Claude (claude-opus-5-5) for @owner`.

## Bad and good

| | Bad | Good |
| --- | --- | --- |
| Title | Perf server: negotiate per-message deflate on the WebSocket | Perf server: cut WebSocket frame size by 70%+ with gzip |
| Title | Refactor scoring utils | Fix timeouts scoring as 0 instead of "incomplete" |
| Description | Removed implicit workspace carryover. | New worktree defaults were ignored when starting threads on existing worktrees. They now always apply. |

When a title annoys the human, add it to this table as a bad example.
