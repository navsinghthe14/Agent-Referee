# Agent Referee — working on this repo

- Every change that alters behaviour, commands, settings, skills or test counts updates `README.md`, `SKILLS.md` and `CHANGES.md` in the same commit. A change without its docs is not done.
- Numbers in the README (self-test count, routing evals, impact table) must match `node .referee/scripts/selftest.mjs` and `eval-triggers.mjs` output. Run them before committing.
- Never put invented results in the README. Example output is labelled as an example.
