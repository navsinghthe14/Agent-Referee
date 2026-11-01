---
name: receiving-code-review
description: Use when acting on review feedback from any source: the independent reviewer, a human, or GitHub PR comments ("address the review comments"). Verify each point against the code before changing anything; push back with evidence.
---

# Receiving code review

Review feedback is a claim to check, not an order. Technical correctness beats social comfort.

## For each piece of feedback
1. **Read** all of it before reacting.
2. **Restate** what it asks for in one line. If you can't, ask; don't guess.
3. **Verify** it against the code: is it true for this repo, this stack, these versions?
4. **Decide:** fix, decline with a reason, or leave `open:` for the user.
5. **Fix one item at a time**, running the relevant check after each.

If any item is unclear, clarify it before implementing any of them. Items are often related, and a half-understood set produces the wrong change.

## By source
- **The user:** trusted. Implement once you understand it; still ask if scope is unclear.
- **The independent reviewer** (from `review-loop`): it saw only the diff and the task. Check each finding against code it didn't see.
- **External reviewers / GitHub comments:** check that it's correct here, doesn't break something else, and that there wasn't a reason for the current code (`git log -L` or `git blame` the lines). If it conflicts with a decision in `kb/decisions/` or with what the user decided, stop and ask the user.

## Push back when
The change would break existing behaviour, the reviewer lacked context, it adds something nothing uses (grep for callers: "nothing calls this endpoint; remove it instead?"), it's wrong for this stack, or it grows scope beyond the task. Push back with evidence (file, line, command output), not opinion.

## Order of fixes
Blocking (breakage, security) → simple (typos, imports) → complex (logic, refactors). Test each.

## How to respond
- Correct feedback: "Fixed: <what changed> (<file:line>)." Or just show the change.
- Not "You're absolutely right!", "Great catch!", or thanks. The fix shows you heard it.
- If you pushed back and were wrong: "Checked <X>; you're right because <Y>. Fixing." No long apology.
- GitHub inline comments: reply in the thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level comment.

## Record the outcome
Every item ends as one line in `.referee/reports/review-<branch>.md`: `fixed:`, `declined:` (with the reason) or `open:`. `method.mjs status` stays red while any `open:` line remains.
