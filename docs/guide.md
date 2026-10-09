# ctx-handoff guide

[繁體中文](guide.zh-TW.md)

Everything about ctx-handoff in one place: how each feature behaves, every setting and command, what it costs, what it sends and stores, where it works, its limits, and how to fix or remove it. For the overview, see the [README](../README.md).

## What it does

### Handoff when the conversation is nearly full

At 600k tokens (80% of smaller windows) it waits for Claude to finish its turn, its background tasks and subagents, then writes a handoff summary, clears the conversation and sends the summary into the new one. The new conversation says what it understood and waits for you.

The summary keeps apart what was verified (tests run, results seen) and what was only changed, lists approaches that failed so they aren't tried again, notes anything still running or unsaved, keeps limits you set ("ask before pushing"), and ends with one concrete next step.

- Background work that never ends (a dev server) doesn't block it forever: it hands off anyway 150k tokens past the threshold, and before 90% of the window.
- Anything you type during a handoff goes to the new conversation with the summary. Attachments can't be held; you're asked to paste them again.
- `/handoff now` hands off right away; `/handoff dry` shows a summary and its cost without clearing.

### Cache kept warm while you're away

After about 55 idle minutes it sends a tiny request so the conversation cache doesn't expire, up to 3 times (about 4 hours). After that it saves a handoff summary but doesn't clear. When you come back, your first message is held and you choose: `/handoff resume` starts a new conversation from the summary, `/handoff continue` stays where you were.

### Project notes

<img src="distill-demo.gif" width="300" alt="Demo: the user repeats the same instruction three times and a new conversation forgets it; ctx-handoff turns it into a rule, and the next conversation remembers. Text in Traditional Chinese.">

What you correct or explain is collected into one notes file per project. It's plain Markdown you can edit: `~/.claude/projects/<project path>/memory/ctx-handoff.md`. **By default the notes are not put into your conversations**: they stay in the file and the panel, and the background update still runs (guards and the progress note depend on it). Turn on `inject_notes` to have them loaded as described below.

- **Memories:** preferences, corrections, facts and locations. With `inject_notes` on, preferences and corrections load in full, and only when they match something you actually said; facts and locations load as titles. Facts unconfirmed for 30 days are archived (not loaded, not deleted).
- **Rules:** practices that keep coming up, such as "use forward slashes in Bash paths (3 times)". With `inject_notes` on, loaded once seen twice.
- **Procedures:** multi-step routines you had Claude repeat, such as "release: bump the version → changelog → tag → GitHub release". Never loaded; they stay in the notes file.

The notes update every 30 of your messages, after 55 idle minutes, before a handoff, or on `/handoff distill`. Only the new part of the conversation is sent, to Sonnet 5.5 at low effort; a short update takes about 1,200 tokens. Conversations under 30k tokens are skipped. Anything that looks like a key or password is dropped. The status line counts down ("18 more messages until notes update").

ctx-handoff never writes `CLAUDE.md`, `AGENTS.md` or skill files in your project: your own rules live where you keep them, and this mod only reads and writes its own notes file.

### Where you left off

If you `/clear` yourself, Claude Code crashes, or you just open a new conversation, the new one doesn't know where the last one stopped. Each notes update therefore also keeps a short progress note for the folder: the task, whether it's done, in progress or blocked, the last check that passed, the next step and up to 5 key files. It rides in the same request as the notes.

The next conversation in that folder is told about it once, within 24 hours: "the last conversation (2 hours ago) stopped at…". If you carry on, Claude starts from there; if you're doing something else, it ignores it. Conversations that were handed off automatically don't get it, since the summary already covers them. When the project has a status card (next section), the conversation is told the card's state and next step instead, so a line you fixed by hand in `_HANDOFF.md` is what it hears.

### Status card in `_HANDOFF.md`

After every handoff (automatic, `/handoff now`, or the one saved while you're away), and whenever a background notes update has a progress note, ctx-handoff rewrites one block in the `_HANDOFF.md` at the root of your project: the folder you started in, or the main worktree when you started from a git worktree. The block holds the update time (Taipei time), the session and revision, the state, what's running, what waits for you, the next step, the last check, what didn't work (up to 5) and decisions (up to 5).

- Only the text between `<!-- ctx-handoff:card rev=N -->` and `<!-- /ctx-handoff:card -->` is replaced. A marker counts only when it is the whole line and outside a code block, so a sentence or a fenced example that mentions it is left alone, and the block never goes inside or above YAML front matter. The first time, the block goes right after the first `# ` heading, or at the top when there is none. Your text, its line endings (CRLF or LF) and its BOM stay exactly as they were.
- Right before writing, the file's modification time and size are checked again. If you saved in between, it reads the file once more and tries again; if it changed again, it gives up with a notice and never overwrites. If you edited the card itself while the update was being written, that update is dropped and the next one starts from your version. A `_HANDOFF.md` that isn't UTF-8 (Big5, cp950, UTF-16) is never written, and a notice says so once per session.
- The file is copied to `.ctx-handoff-backup/_HANDOFF.md.bak` before the first write of each session. The very first copy ever is also kept as `_HANDOFF.md.first.bak` and never overwritten.
- With no `_HANDOFF.md`, nothing is created. The card is kept inside ctx-handoff and `/handoff` says so; `/handoff card init` creates the file with a `# 交接` heading and the card.

The card text comes from one low-effort request (`card_model`, by default the notes model) whose input is the previous card, the session digest and the handoff summary or progress note, not the whole conversation. If that fails, the state and next step are filled straight from the summary. Setting: `card`.

### Session digest and cache TTL

`/handoff` shows a digest of this session in four lines: current work, last activity time, the last 3 tool calls and the last reply. It's built from the last 64 KB of the conversation file, read with `tail` (or PowerShell on Windows) when the file is over 4 MiB, and cached until the file changes. The status card update gets the same digest.

The same tail shows which cache lifetime the session writes, 1 hour or 5 minutes. A session that writes only the 5-minute cache can't be kept warm for 55 minutes, so the keep-warm request is skipped and an away summary is saved instead; `/handoff` shows the detected lifetime and says so. When the tail doesn't show it, keep-warm works as before.

### Compaction

When the conversation is compacted (`/compact` or automatically), a notice shows the size before and after ("Compacted 214k → 31k") and the idle timer starts over. The next stops don't act on a context reading that is still the old, pre-compaction one, at most 3 times, so an automatic handoff never fires from a stale number.

### Irreversible commands

Before Bash or PowerShell runs a command that can't be undone, you get an Allow or Deny question. Deny, or closing the question, stops the command and tells Claude. Guards you approved are checked first.

- Asked about: `rm -r` and `rm -rf`, `Remove-Item -Recurse`, `rmdir /s`, `del /s`, `git push --force`, `-f` and `--force-with-lease`, `git reset --hard`, `git clean -f`, `git branch -D`, `git checkout -- .`, `git restore .`, `git push --delete`, `git stash drop`, `git filter-branch`, `robocopy /MIR`, `[IO.Directory]::Delete`, `shutil.rmtree`, a `-Recurse` listing piped into `Remove-Item` (asked even when only one file is named), `DROP TABLE` and `DROP DATABASE` and `TRUNCATE TABLE` when a SQL client such as `psql` runs them, `npm publish`, `pnpm publish` and `format D:`. Commands inside `bash -c`, `sh -c`, `sudo`, `xargs`, `powershell -Command`, `cmd /c` and PowerShell's `-EncodedCommand` are checked too.
- Not asked about: `rm file.txt`, `git push`, `grep -rf`, `git clean -n`, `git restore --staged .`, `npm publish --dry-run`, `Remove-Item -WhatIf` (but not `-WhatIf:$false`), `robocopy /L` and SQL text that no SQL client runs, such as a `grep` pattern. A command shown as text, such as `echo "rm -rf /"`, is asked about once: quoted text is scanned too, so a command hidden inside quotes can't slip through.

With no screen to ask on (`claude -p`, the SDK, or no surface attached), the command runs as before and a line is logged, so scheduled tasks keep working. With a screen but nobody answering, the question times out after 120 seconds and the command is denied with a note to use a reversible approach or ask again later; a turn started by a scheduled task or `/loop` is denied at once without asking. Commands run by Monitor or MCP tools are not checked. Setting: `command_guard`.

### Nudges

Short messages to Claude, never a block on your tools. All on by default.

- **Repeated failure:** when a tool fails twice in a row for the same reason, Claude is told to find the cause and change approach instead of retrying as is.
- **"Done" without checking:** when Claude says it's done after editing code this turn with no test, build or check since, it's asked once to verify and show the result, or say what it couldn't verify. Doc edits don't count. Claude Code shows this as "Stop hook feedback" and may label it a Stop hook error; that's the nudge, not a failure.
- **Reply language:** when Claude's explanation is mostly not in your language (Traditional or Simplified Chinese, English, Japanese), it's reminded once. Code, commands, paths, links and short lines are ignored, so Chinese with English terms is fine. It also fires when you asked for another language on purpose, such as a translation.

### Guards

Once a rule has come up 3 times, `/handoff guard suggest` drafts a check on tool calls from it, such as "git push without running tests", set to block or to remind. **Nothing applies until you approve it.** If a check itself fails, the call goes through.

### Panel

`/handoff panel` opens a panel above the prompt with five tabs: guards to approve, memories, rules and procedures, the latest notes update, and settings. Deleting a note takes two presses and backs up the file first. Click the buttons, or press ctrl+x tab and then 1–5 to switch tabs. Run the command again to close it.

<img src="panel.png" width="560" alt="The panel above the prompt, on the Rules tab: tabs for guards, memories, rules and the latest update, then rules such as checking the deployed version before announcing a release, each with how many times it came up. Text in Traditional Chinese.">

## Settings

Everything is set on the panel's Settings tab, not in `/config`. Numbers step with `−` and `＋`; switches and choices change with Toggle. Each row shows where its value comes from (panel, settings.json or default), More explains it, and Reset drops the panel's value. Changes apply at once in the current session and from the next message in other open ones. They cover all your projects and survive updates.

| Setting | Default | Meaning |
|---|---|---|
| `threshold` | `600000` | Context tokens that trigger a handoff |
| `window_ratio` | `0.8` | On smaller windows, hand off at `window × ratio` |
| Keep cache warm | on | Also `/handoff refresh on\|off` |
| `idle_minutes` | `55` | Idle minutes before each keep-warm request (5–59); skipped on a 5-minute cache |
| `max_refresh` | `3` | Keep-warm requests per idle period before saving a summary instead |
| Project notes | on | Also `/handoff distill on\|off` |
| `distill_every` | `30` | Your messages between notes updates (5–200) |
| `min_tokens` | `30000` | Smaller conversations skip cache keeping, away summaries and notes |
| `notes_model` | `claude-sonnet-5-5` | Model for notes: Sonnet 5.5 or Opus 5.5 |
| `inject_notes` | off | Put the notes file's contents into new conversations and your next message |
| `card` | on | Keep the status card in `_HANDOFF.md` |
| `card_model` | empty | Model for the status card; empty means the same as `notes_model` |
| `resume_hint` | on | Tell a new conversation where the last one stopped |
| `retry_nudge` | on | Repeated failure nudge |
| `done_check` | on | "Done" without checking nudge |
| `command_guard` | on | Ask before irreversible Bash and PowerShell commands |
| `reply_language` | `auto` | Reply language nudge: `auto`, `off`, `zh-TW`, `zh-CN`, `en` or `ja` |
| `language` | `auto` | Language of the status line, notices and panel: `auto`, `en` or `zh-TW` |

`auto` follows Claude Code's own `language` setting. For the reply language, an unset `language`, or just "Chinese" without Traditional or Simplified, means off. For messages, it falls back to your system language. Notes and summaries are written in the language you use in the conversation.

**Choosing a threshold:** quality is commonly seen to start slipping around 200k–300k tokens. The 600k default trades that for fewer handoffs; lower it if Claude gets worse before the handoff.

**In a file instead.** The VS Code extension doesn't show the panel. There, or if you'd rather keep settings in a file, put them in `~/.claude/settings.json` (for a clone, the key is `ctx-handoff@inline`). A value set on the panel wins over the file.

```json
"pluginConfigs": { "ctx-handoff@ctx-handoff-mod": { "options": { "threshold": 400000, "reply_language": "zh-TW" } } }
```

## Commands

You won't need these in normal use. If `/handoff` is taken by your own command or skill, it's `/ctx-handoff` instead.

| Command | Purpose |
|---|---|
| `/handoff` | Context use, what's on, the latest progress note, the session digest, the cache TTL, the status card and recent errors |
| `/handoff panel` | Open or close the panel |
| `/handoff now` | Hand off now (clears the conversation) |
| `/handoff dry` | Show a handoff summary and its cost, without clearing |
| `/handoff distill` | Update the project notes now |
| `/handoff resume` / `continue` | After being away: start fresh from the summary, or stay |
| `/handoff resend` | Send the handoff summary again if it didn't arrive |
| `/handoff refresh on\|off`, `distill on\|off` | Turn cache keeping or project notes on or off |
| `/handoff card` | Show where the status card is and what it says; `card init` creates `_HANDOFF.md` |
| `/handoff guard` | List guards; `suggest` drafts new ones, `on\|off\|drop N` approves, turns off or deletes one, `mode N deny\|remind` switches between blocking and reminding |

## Cost, privacy and permissions

**Cost.** Everything runs on your own Claude Code sign-in and counts toward your usage like any other request.

- Handoff: one request that reads the conversation (mostly from cache) and writes the summary, about 30 seconds at 800k tokens.
- Keeping the cache warm: a tiny request that reads the conversation from cache, at about a tenth of the normal input price; at most 3 per idle period.
- Notes: only the new part of the conversation, to Sonnet 5.5 at low effort. The progress note rides in the same request.
- Status card: one small low-effort request after each handoff and after each notes update that has a progress note. It sends the previous card, the four-line digest and the summary or progress note, not the conversation.
- The nudges make no requests.

**What leaves your machine.** Nothing goes anywhere but Anthropic, through Claude Code, like the conversation itself. A notes update sends your messages, Claude's replies and tool calls (the first 300 characters of each input and 500 of each result), up to 300,000 characters.

**What it stores locally:**

| What | Where |
|---|---|
| Project notes | `~/.claude/projects/<project path>/memory/ctx-handoff.md` |
| Backups made before deleting from the panel | `.ctx-handoff-backup/` next to the notes file |
| The status card | `_HANDOFF.md` at the project root, between its markers only |
| A copy of `_HANDOFF.md` before a session's first card write, and the first copy ever | `.ctx-handoff-backup/_HANDOFF.md.bak` and `_HANDOFF.md.first.bak` at the project root |
| Settings set on the panel, recent handoff summaries, progress notes, a copy of the status card, errors | `~/.claude/plugins/store/ctx-handoff_*.json` |

**What it's allowed to do.** Mods aren't sandboxed; this one runs with your permissions. To see what it uses without running it, run `claude plugin validate <ctx-handoff folder>`. It prints a `hooks:` line (events it receives) and a `calls:` line (what its code calls):

| In the output | Why |
|---|---|
| `tool.call` | Applies guards you approved; asks before irreversible commands; notices repeated failures and whether tests ran after edits; carries the reply language nudge |
| `turn.step` | Reads the visible text of Claude's replies in the main conversation to check their language. It doesn't change the request, the model or the reply |
| `prompt.submit`, `prompt.context` | Holds your message during a handoff; loads notes and the progress note into a new conversation; rereads settings |
| `$.session.messages`, `$.model.complete`, `$.model.fork` | Reads the conversation to write notes and handoff summaries |
| `$.fs.read`, `$.fs.write`, `$.fs.exists`, `$.fs.stat` | Reads and writes the notes file, `_HANDOFF.md` (between its markers only) and their backups; checks a file's size and modification time before writing and before reading the conversation file's end; checks whether the project is a git repo |
| `$.process.run` | Reads the end of a conversation file over 4 MiB, with `tail` or PowerShell. It runs nothing else |
| `$.ui.ask`, `$.session.surfaces` | Asks Allow or Deny before an irreversible command; checks whether anything can show the question |
| `session.compact` | Notices compaction: a notice, a fresh idle timer, and skipping a stale context reading |
| `$.prompt.submit`, `$.command.run` | Sends the summary into the new conversation; runs `/clear` |
| `$.env.get` | Reads three environment variables, `CLAUDE_CONFIG_DIR`, `HOME` and `USERPROFILE`, only to find your `~/.claude` folder. Nothing needs to be set |
| `$.settings.read`, `config.set` | Reads Claude Code's `language` setting and this plugin's `pluginConfigs`; notices when you change Claude Code's settings |
| The rest: `session.start`, `turn.complete`, `classic.Stop`, `command.run`, `$.command.register`, `ui.render`, `$.store`, `$.state`, `$.clock`, `$.ui`, `$.agent.list`, `$.session.*` | Bookkeeping: timers, the `/handoff` command, status line, panel and notices, its own storage, checking that Claude and its subagents are done before a handoff, and the "done" nudge |

It makes no network requests of its own (no `$.http` calls). The only programs it can start are `tail` and PowerShell, to read the end of a large conversation file. To run a session without any mod, start Claude Code with `claude --safe-mode`. See also [`SECURITY.md`](../SECURITY.md).

## Where it works

Mods load in most places Claude Code runs, but only the terminal and the Desktop app draw what a mod shows ([Claude Code docs](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run)).

| Where | Background features | Status line and panel | Checked |
|---|---|---|---|
| `claude` in a terminal (also an editor's terminal, JetBrains) | Yes | Yes | Tested |
| `claude -p` | Yes; `/handoff` replies as text | No | Tested |
| Desktop app, Code tab | Yes | Yes | From the docs |
| VS Code extension chat panel | Yes (settings via `settings.json`) | No | From the docs |
| Desktop app, WSL session | No (plugins don't load there) | No | From the docs |

## Limitations

- **A 5-minute cache is detected, not guaranteed.** API key, Bedrock and Vertex users, and subscribers who've moved onto usage credits, get a 5-minute cache. ctx-handoff reads which one a session writes from the end of its conversation file and skips keep-warm requests that can't help. When it can't tell (a new session, a file it can't read), it keeps warm as before, so run `/handoff refresh off` if you know your cache is short.
- **The status card is rewritten, not merged.** Keep your own notes outside the markers. Edits inside them are the starting point of the next update, but a later update may rewrite them.
- **Notes follow the folder you start in.** Work on another project from your home folder is noted under your home folder. Notes aren't shared across projects.
- **The progress note is only as fresh as the last notes update.** After a short chat or a crash it may be missing or a few messages behind; run `/handoff distill` before `/clear` if you want it exact. Two conversations open in the same folder see each other's note.
- **Other sessions pick up a settings change on their next message,** not at once.
- **Updating the mod mid-handoff may lose a held message.** The cache timer isn't affected.

## Troubleshooting

Start with `/handoff`: it shows context use, what's on, and the latest error from the background.

| Symptom | What to check |
|---|---|
| `/handoff` isn't a command | The mod isn't loaded: check `claude plugin list` and your Claude Code version; for a clone, use an absolute path. If you have your own `/handoff`, use `/ctx-handoff`. |
| Something odd and you suspect a mod | Start with `claude --safe-mode` and see whether it goes away. |
| The new conversation didn't get the summary | `/handoff resend`. |
| Notes never update | Conversations under 30k tokens are skipped. Run `/handoff distill` and look for an error in `/handoff`. |
| A command gives no answer | Run `/handoff` for the latest error, then [open an issue](https://github.com/cablate/ctx-handoff-mod/issues/new/choose) with its output. |

## Uninstall

1. From the marketplace: `claude plugin uninstall ctx-handoff@ctx-handoff-mod`. From a clone: remove its path from `CLAUDE_CODE_PLUGIN_DIRS` (or stop passing `--plugin-dir`) and delete the folder.
2. Optional: delete the files listed under [What it stores locally](#cost-privacy-and-permissions); uninstalling leaves them. The notes are plain Markdown, so you may want to keep them.

To turn it off for a while instead, disable it in `/plugin`.

## Run from source

Load a clone instead of the marketplace copy; saved edits take effect right away.

```sh
git clone https://github.com/cablate/ctx-handoff-mod ~/.claude/mods/ctx-handoff
claude --plugin-dir ~/.claude/mods/ctx-handoff
```

To load it in every session, add its absolute path to `env` in `~/.claude/settings.json` (separate several paths with `;` on Windows, `:` elsewhere):

```json
"env": { "CLAUDE_CODE_PLUGIN_DIRS": "/home/you/.claude/mods/ctx-handoff" }
```
