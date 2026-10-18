# pstack in Codex

pstack skills use Cursor names. In Codex, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/` for this plugin, usually `~/.codex/plugins/cache/<marketplace>/pstack/<version>/`. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | Codex |
| --- | --- |
| `Task` | `spawn_agent` from the multi-agent tools. It returns at once with an agent id. Collect results with `wait_agent`, follow up with `send_input`, and call `close_agent` when an agent's work is done. A brief that would be a Task `prompt` becomes the `message`. |
| `AskQuestion` | `request_user_input` in Plan mode. In Default mode use `request_user_input_async` for questions you can keep working around, and ask in plain text, then stop, for answers you cannot proceed without. |
| Open a todolist | Use the plan tool if the session offers one. Otherwise keep the list in your commentary and update it at each phase. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `<pstack>/skills/<name>/SKILL.md` and follow it. When you tell the user to type it, write `$name`. |
| `/loop` until a predicate | `create_goal` with the predicate as the objective, so the thread keeps working across turns. For a fixed cadence such as `/loop 1h`, create a heartbeat automation on this thread with `automation_update` (kind `heartbeat`) whose prompt is the tick prompt. Pause or delete it when the predicate is met. |
| Wait for subagents before ending a turn | A finished subagent may not wake an idle parent. Keep the turn open with `wait_agent` (long timeouts, several ids at once) until every child you need has reported, or arm a heartbeat that drains them. Never end a coordinating turn with children still running and nothing scheduled to read them. |
| `create-skill` (Cursor built-in) | The `skill-creator` system skill. A user-only skill also needs `agents/openai.yaml` with `policy.allow_implicit_invocation: false`. |
| Cursor's built-in `babysit` | No Codex equivalent. The Babysit playbook stands alone. |
| `/deslop`, `control-ui`, `control-cli` from `cursor-team-kit` | Bundled in this plugin as `<pstack>/skills/deslop`, `control-ui` and `control-cli`. For `control-ui`, prefer the session's browser or computer-use tools when they reach the app, and fall back to Playwright. For `control-cli`, drive the program through `exec_command` with `tty: true` and `write_stdin`, or tmux. |
| `Grep`, `Glob` | `rg` and `rg --files` through `exec_command`. |

## Subagent fields

| Cursor | Codex |
| --- | --- |
| `subagent_type: generalPurpose` | A plain `spawn_agent` call. |
| `poteto-agent` | `spawn_agent` whose message starts with the body of `<pstack>/agents/poteto-agent.md` and the absolute path of `<pstack>/skills/poteto-mode/SKILL.md`, then the brief. |
| `comment-sicko` | `spawn_agent` whose message is the body of `<pstack>/agents/comment-sicko.md` followed by the scope. |
| `readonly: true` | Codex has no read-only flag. The brief says "Read-only. Do not edit, commit or push." Check `git status` afterward. Codex subagents keep MCP access either way, so skills that pick agent mode only to keep MCPs need nothing extra. |
| `readonly: false` | A plain `spawn_agent` call. |
| `environment: "cloud"` | A separate git worktree on this machine. The brief tells the worker to run `git worktree add <path> <base>` and the repository's worktree setup, if it has one, before any work, and to work only there. One writer per worktree. |
| `environment: "local"` | Omit. The worker shares this checkout, so give it read-only work or a disjoint write set. |
| `cloud_base_branch: <b>` | The worktree's `<base>` is `<b>`. |
| `run_in_background: true` | Omit. `spawn_agent` never blocks. |
| `resume` | `send_input` to the agent id, after `resume_agent` if it was closed. The fresh-subagent default in poteto-mode still applies. |
| `file_attachments` | List the paths in the brief. Pass images as `items` entries of type `local_image`. |

## Models

Codex takes the model and the reasoning effort as separate `spawn_agent` fields: `model` and `reasoning_effort`. The `spawn_agent` tool description lists the models and efforts this session accepts, including models routed through opencodex such as `cursor/*` and `anthropic/*`. A model added to opencodex appears after Codex restarts.

| Cursor | Codex |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | `model: "anthropic/claude-<family>-<version>"` and `reasoning_effort: "<effort>"`, when the session lists that model. Drop `-fast`. |
| A `grok-*` or `cursor-grok-*` slug | `model: "cursor/grok-<version>"`, such as `cursor/grok-4.7`, with the slug's effort token as `reasoning_effort`. Drop `-fast`. If the session does not list it, use the role's line in the model config, or the `feature, refactoring` role's model. |
| A `composer-*` slug | No Codex equivalent. Use `cursor/grok-4.7` with the slug's effort, or the role's line in the model config. |
| A `gpt-*` slug | The listed Codex model of the same name, with its effort token as `reasoning_effort`. |
| The effort ladder `max` > `xhigh` > `high` > `medium` > `low` | The same values for `reasoning_effort`. Codex may also offer `ultra` above `max`. Use it only when the role's config line names it. |
| Fast mode | No per-spawn speed control. Drop it. |
| `auto` or `inherit-parent` | Omit `model` and `reasoning_effort`. |
| The `pstack-models.mdc` rule | The model config `~/.codex/pstack/models.toml`. Each key under `[roles]` is a role label from poteto-mode, such as `"judgment and prose"`. Its value is `{ model = "…", effort = "…" }` with an optional `fallback = { model = "…", effort = "…" }`, or an array of those for a panel role, or the string `"inherit-parent"`. A missing role keeps the skill default, mapped with the rows above. `setup-pstack` writes this file instead of the `.mdc` rule, and takes its detected models from the `spawn_agent` tool description. Never put role lines in `AGENTS.md`. When a role has a fallback, spawn with the primary first. If the spawn is rejected, or the agent stops on a rate-limit, quota or usage-limit error, spawn a fresh agent with the fallback and the same brief, and say so. |

## Paths

| Cursor | Codex |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | A repository's `.agents/skills/`, or `~/.codex/skills/` for a personal skill. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `~/.codex/plugins/cache/`, `.codex-plugin/plugin.json`. |
| `.cursor/rules/*.mdc`, always-applied rules | The repository's `AGENTS.md`, or `~/.codex/AGENTS.md` for every repository. Model roles are the exception and live in `~/.codex/pstack/models.toml`. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | Prefer the thread tools: `list_threads` (each entry has `projectId` and `cwd`; the entry with status `active` is this chat) and `read_thread` (pages newest first; follow `nextCursor`). `list_threads` returns at most 50 threads. For older history, the raw logs are `~/.codex/sessions/YYYY/MM/DD/rollout-*-<threadId>.jsonl` and `~/.codex/archived_sessions/*.jsonl.zst`, and the thread-to-project map is `thread-project-assignments` in `~/.codex/.codex-global-state.json`. Read only the active project's threads. Some threads have no local log, so fall back to `read_thread`. Subagent threads are separate threads and do not appear under the parent. |

## Long unattended runs on this Mac

Cursor's cloud agents keep running when the laptop sleeps. Codex workers run on this Mac, so a run that outlives the operator's evening must keep the Mac awake and recover its own stalls.

- **Keep the Mac awake.** Before an overnight or multi-hour run, start `caffeinate -i -t <seconds>` sized to the run in a long-lived `exec_command` session, and say so in the reply. It prevents idle sleep while the Mac is on power. A closed lid still sleeps unless an external display is attached, so tell the operator to leave it open. Stop it when the run ends.
- **Heartbeats do not restart stopped agents.** A heartbeat wakes the coordinator, nothing else. A worker stopped by a rate limit, quota or usage limit stays stopped. Each tick checks every worker's status, and for any stopped one spawns a fresh agent with the consolidated brief (original brief, later directives, the stopped agent's last report and branch), on the role's fallback model when one is configured. Record each restart in the run's decision log.
- **Usage resets.** When the operator has allowed a Codex usage reset, use `consume_usage_reset` only under the limit the run's standing orders name, and record it.

## Cursor-only features

Bugbot, Cursor cloud agents, the `/in-cloud` command, Origin, and Cursor's pull request tool have no Codex equivalent. Use `gh` for every forge operation and triage review-bot comments the same way the skills triage Bugbot. Cursor Automations map to Codex automations through `automation_update`: a heartbeat for this thread, or a cron job for a standalone run. Say when you skip a step for this reason, and continue.

