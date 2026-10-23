# Changelog

[繁體中文](CHANGELOG.zh-TW.md)

All notable changes to ctx-handoff. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/); before 1.0, any minor version may change behavior. The version is the one in `.claude-plugin/plugin.json`; marketplace installs update only when it changes.

## [Unreleased]

### Fixed

- The irreversible-command check now catches nested quoted paths, `find -delete`, and flags next to command separators. Preview flags only exempt their own command; quoted `-WhatIf` paths and flags outside a subexpression no longer hide destructive commands. `cargo rm`, `git -C repo rm`, and simple PowerShell deletion or disk-format previews no longer ask unnecessarily. Long strings of adjacent quotes no longer repeatedly rescan the same prefix.

### Added

- Short commands for coming back after being away: `/hc` is `/handoff continue` and `/hr` is `/handoff resume`; `/handoff c` and `/handoff r` work too. If another command already uses `/hc` or `/hr`, that short name is skipped and the long form still works.

## [0.6.0] - 2026-10-09

A handoff now leaves a status card you can read at a glance, the mod no longer reaches into your repo, and Bash and PowerShell ask before running a command you can't undo.

**Upgrading:** project notes are no longer put into conversations by default; turn on `inject_notes` on the panel's Settings tab to get the old behavior. The `mark_in_project` tool and the step that moved rules into your repo are gone. Nothing else needs doing.

### Added

- **A status card in `_HANDOFF.md`:** after every handoff and whenever a notes update has progress, one block between `<!-- ctx-handoff:card rev=N -->` and `<!-- /ctx-handoff:card -->` is rewritten with the state, what's running, what waits for you, the next step, the last check, what didn't work and what was decided. Nothing outside the markers is touched, line endings and BOM are kept, the file is backed up before each session's first write, and a file that changed meanwhile is never overwritten. With no `_HANDOFF.md`, `/handoff card init` creates one. Settings: `card`, `card_model`.
- **A session digest in `/handoff`:** current work, last activity, the last 3 tool calls and the last reply, read from the end of the conversation file and cached until it changes.
- **The real cache lifetime:** the session's cache TTL (1 hour or 5 minutes) is read from the conversation file and shown in `/handoff`. A session that only writes the 5-minute cache skips the keep-warm request, which couldn't help, and saves an away summary instead.
- **A compaction notice:** "Compacted 214k → 31k", the idle timer starts over, and an automatic handoff never acts on a context reading that is still the old one.
- **A check before irreversible commands:** `rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, `npm publish` and the like, also inside `bash -c`, `sudo`, `xargs`, `powershell -Command` and `cmd /c`, ask Allow or Deny first. With no screen to ask on, such as `claude -p`, they run as before and a line is logged. Setting: `command_guard`.
- **A new front page:** the README opens with a banner and an animated overview, shows each feature in a picture, and moves the details into a [guide](docs/guide.md).
- **Changelog in Traditional Chinese:** `CHANGELOG.zh-TW.md`, and GitHub Releases carry both languages.

### Changed

- **Notes stay out of conversations by default:** the notes file is still kept and edited in the background, but its contents go into new conversations and your next message only when `inject_notes` is on.
- **Where you left off reads the status card first:** a new conversation is told the card's state and next step (a line you fixed by hand counts), and falls back to the progress note.
- **Every setting is declared in `plugin.json`:** `userConfig` listed only some of them before.
- For contributors: the card, digest and command check are pure modules (`card.ts`, `digest.ts`, `cmdguard.ts`) with their own tests, `tools/manifest.test.mjs` keeps `plugin.json` and the settings in step, and the test world mocks `fs.stat`, `process.run` and the question dialog.

### Removed

- **Moving rules into your repo:** the `mark_in_project` tool, the instructions given at the start of a new conversation, and the "already in the repo" markers. ctx-handoff no longer writes `CLAUDE.md`, `AGENTS.md` or skill files.

### Fixed

- The panel's "draft guards" note ran a `replace` that did nothing.
- **Status card safety (found in review):** text that looked like a card marker inside a field could end the card early and pile up junk on every rewrite; markers now count only as a whole line outside code blocks, YAML front matter is never written into, files that aren't UTF-8 are left alone with a notice, the first-ever backup is kept as `_HANDOFF.md.first.bak`, and an update is dropped when you edited the card while it was being written.
- **Irreversible command check (found in review):** an unanswered question times out after 120 seconds and denies, a turn started by a scheduled task or `/loop` is denied without asking, more destructive commands are caught (`robocopy /MIR`, `git push --delete`, `git stash drop`, `git filter-branch`, a `-Recurse` listing piped into `Remove-Item`, `[IO.Directory]::Delete`, `rd/s/q`, `shutil.rmtree`), and `Remove-Item -WhatIf` and SQL text that no SQL client runs no longer ask.
- **Second review round:** a marker-looking line inside an indented code block or an HTML comment can no longer make a card update swallow your text (the card is the first closing marker plus the nearest opening marker above it); `Remove-Item -WhatIf:$false` is treated as a real run; SQL run through `python -c` or `node -e` is caught; paths such as `"R&D"` no longer split a command; `robocopy /L` and `rmdir /s/foo` no longer ask.
- **Session digest (found in review):** `[Request interrupted by user]` and similar lines are no longer shown as the current work.

## [0.5.0] - 2026-10-08

Claude now notices its own slips: a nudge when it retries the same failure, a check when it says "done" without testing, and a reminder when it drifts out of your language. New conversations learn where the last one stopped, routines you repeat become project skills, and every setting moved to one panel tab.

**Upgrading:** settings you made in 0.4 are kept; they now show on the panel's Settings tab (`/handoff panel`, then 5) instead of `/config`.

### Added

- **Where you left off:** after your own `/clear`, a crash or a fresh start, the next conversation in the folder is told once what the last one was doing and what came next (within 24 hours). It rides on the notes update, so it costs no extra request. Setting: `resume_hint`.
- **Nudge on repeated failure:** when a tool fails twice in a row for the same reason, Claude is told to find the cause instead of retrying as is. Setting: `retry_nudge`.
- **Check before "done":** when Claude says it's done after editing code with no test, build or check since, it's asked once to verify and show the result. Setting: `done_check`.
- **Reply language reminder:** when Claude's explanation drifts out of your language (Traditional or Simplified Chinese, English, Japanese), it's reminded once, during the turn. Code, paths and English terms inside Chinese don't count. Setting: `reply_language`.
- **Procedures become project skills:** multi-step routines you had Claude repeat (say, a release) are noted as procedures; after 3 times Claude turns one into `.claude/skills/<name>/SKILL.md` in your repo, without committing.
- **Settings tab in the panel:** every setting in one place, with where each value comes from and a reset button.
- **Adjustable notes interval:** `distill_every` (default 30 messages).

### Changed

- **Better handoff summaries:** verified work is kept apart from unverified changes, failed approaches and loose ends are listed, limits you set are kept, and the summary ends with one next step.
- **Settings left `/config`:** they're on the panel instead, so `/config` stays short. Values in `settings.json` still work, for the VS Code extension, which doesn't show the panel; the panel's value wins.
- The README is rewritten for first-time readers.
- For contributors: Biome lint in the checks, the code split into smaller files, and tests split by topic.

### Fixed

- The "done" check no longer counts edits made by background subagents as the main conversation's.

## [0.4.0] - 2026-10-07

Rules that keep coming up now move into your repo, where every machine and tool sees them, and settings no longer require editing code.

### Added

- **Rules move into your repo:** a rule that came up 3 times, or a guard that's on, is handed to Claude at the start of the next conversation in a git repo. Claude puts it where the project keeps its rules, checks for duplicates, doesn't commit, and says where it went; ctx-handoff then stops loading its own copy. Say no and it's undone.

### Changed

- **Settings no longer live in the code:** threshold, idle time, keep-warm count, smallest conversation, notes model and language are plugin settings, kept across updates.
- Keeping the cache warm is confirmed on real sessions: the 2nd and 3rd refreshes (110 and 165 minutes idle) read the whole conversation from cache.
- For contributors: the code is split into smaller files, with a code style in `CONTRIBUTING.md` and an `.editorconfig`.

### Fixed

- The tool Claude uses to report a rule moved into the repo stays available after a session is resumed or the mod reloads.

## [0.3.0] - 2026-10-07

Install it from the plugin marketplace, read it in English, and approve guards from a panel.

### Added

- **Install from the plugin marketplace:** `claude plugin marketplace add cablate/ctx-handoff-mod`, then `claude plugin install ctx-handoff@ctx-handoff-mod`.
- **English messages:** messages follow your system language or Claude Code's `language` setting: Traditional Chinese for Chinese, English otherwise.
- **Guards:** `/handoff guard suggest` turns a rule that came up 3 times into a check on tool calls (block or remind). Nothing applies until you approve it.
- **Panel:** `/handoff panel` opens a panel above the prompt to approve guards, see the latest notes update and delete wrong notes (backed up first).
- The status line counts down to the next notes update and shows when one is running.

### Changed

- Handoff summaries and project notes are written in the language you use in the conversation.
- Each memory is a one-line title plus details. Preferences and corrections load in full; facts and locations load as titles only.
- Facts and locations unconfirmed for 30 days are archived (not loaded, not deleted) instead of capping the number of notes.

### Fixed

- Messages no longer repeat the `[ctx-handoff]` prefix that Claude Code already adds.
- The idle cache timer picks up again after the mod reloads.
- The panel no longer reads files on every redraw, which made buttons feel stuck.

## 0.2.0 - 2026-10-05

Notes stay in the project you started in, and updating them costs far less.

**Upgrading from 0.1:** notes an older version put in the wrong place aren't moved for you. Move them by hand, or with `node tools/notes.mjs` (see [`tools/README.md`](tools/README.md)).

### Added

- `/handoff` becomes `/ctx-handoff` when the name is already taken by your own command or skill.
- Time limits on handoff and notes requests.

### Changed

- One notes file per project folder (the folder the session started in). Notes are no longer written into other repos a session touches.
- Notes are updated by Sonnet 5.5 at low effort from only the new part of the conversation, instead of a copy of the whole conversation.

## 0.1.0 - 2026-10-03

First release: automatic handoff at a context threshold, keeping the cache warm while you're away with a saved handoff after that, and project notes.

[unreleased]: https://github.com/cablate/ctx-handoff-mod/compare/ctx-handoff--v0.6.0...HEAD
[0.6.0]: https://github.com/cablate/ctx-handoff-mod/compare/ctx-handoff--v0.5.0...ctx-handoff--v0.6.0
[0.5.0]: https://github.com/cablate/ctx-handoff-mod/compare/ctx-handoff--v0.4.0...ctx-handoff--v0.5.0
[0.4.0]: https://github.com/cablate/ctx-handoff-mod/compare/ctx-handoff--v0.3.0...ctx-handoff--v0.4.0
[0.3.0]: https://github.com/cablate/ctx-handoff-mod/releases/tag/ctx-handoff--v0.3.0
