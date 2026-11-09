# pstack harness tree

This folder is generated from `pstack/skills`, `pstack/agents`, `pstack/docs/guide`, `pstack/docs/harness/claude-code.md`, `pstack/docs/harness/codex.md`, `pstack/README.md`, `pstack/LICENSE`, `pstack/plugin.json`, and three `cursor-team-kit` skills. Do not edit it by hand.

Cursor uses `pstack/` directly. Claude Code installs `claude-code/` and Codex installs `codex/`. The trees leave out the rest of `pstack/`, such as `pstack/automations` and `pstack/assets`. A relative link to a pstack file that a tree leaves out points at that file on GitHub `main` instead.

The Codex tree leaves out `make-bot-ui`, which drives Cursor's Grok Bot routines, and adds the `cursor-team-kit` skills `deslop`, `control-ui`, and `control-cli`.

After editing those sources, run `node scripts/generate-pstack-harness-trees.mjs` from the repository root and commit the result.
