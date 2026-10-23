<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
    <img src="docs/assets/banner-light.svg" width="900" alt="ctx-handoff: the long-session toolkit for Claude Code">
  </picture>
</p>

<p align="center">
  <b>Keep long Claude Code sessions going on their own,<br>have Claude remember what you taught it, and catch its usual slips.</b>
</p>

<p align="center">
  <a href="https://github.com/cablate/ctx-handoff-mod/releases"><img src="https://img.shields.io/github/v/release/cablate/ctx-handoff-mod?include_prereleases&display_name=release&label=release&color=7dd3fc" alt="Latest release"></a>
  <a href="https://github.com/cablate/ctx-handoff-mod/actions/workflows/check.yml"><img src="https://github.com/cablate/ctx-handoff-mod/actions/workflows/check.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Claude_Code-2.1.287%2B-a78bfa" alt="Claude Code 2.1.287 or later">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-TW.md">繁體中文</a> · <a href="#install">Install</a> · <a href="#whats-inside">Features</a> · <a href="docs/guide.md">Guide</a> · <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <img src="docs/assets/handoff.svg" width="900" alt="Animation: a long session fills its context to the threshold; ctx-handoff writes a summary of verified work, failed attempts, your limits and the next step, clears, and a fresh session receives it and waits for instructions">
</p>

## Why

Long Claude Code sessions run into the same chores again and again. ctx-handoff takes care of them in the background, so in normal use you type no commands.

| When… | Without it | With ctx-handoff |
|---|---|---|
| the conversation is nearly full | You write a summary, `/clear`, paste it back | A summary is written, the conversation is cleared, and a fresh one waits for your next instruction |
| you step away for an hour | Your next message rereads everything at full price | The cache is kept warm for up to about 4 hours |
| you repeat an instruction | The next conversation forgets it | It becomes a project note you can read and edit |
| you `/clear` or reopen Claude Code | The new conversation starts blind | It's told where the last one stopped, from a status card in `_HANDOFF.md` |
| Claude retries a failing command, or says "done" untested | You find out later | Claude gets a one-line nudge right away |
| Claude is about to run `rm -rf` or `git push --force` | You find out afterwards | You're asked first |

## Install

Requires Claude Code 2.1.287 or later. Tested up to 2.1.293.

```sh
claude plugin marketplace add cablate/ctx-handoff-mod
claude plugin install ctx-handoff@ctx-handoff-mod
```

Start a new session and type `/handoff`. You should see:

```
context 12034 / threshold 600000 (window 1000000)
Cache refresh on, refreshed 0/3 this idle period, timer not started
```

That's it. Update with `claude plugin update ctx-handoff@ctx-handoff-mod`, or turn on auto-update under **Marketplaces** in `/plugin`.

> [!NOTE]
> Built for Claude subscriptions and long sessions (for example on a 1M-context model). On an API key, Bedrock or Vertex the cache lasts only 5 minutes; ctx-handoff reads that from the conversation file and skips the keep-warm requests that couldn't help. ctx-handoff is experimental, because Claude Code mods are still in early access.

## What's inside

ctx-handoff is a growing toolkit for long sessions: new features for working with Claude over hours land here.

### Hands off before the context fills

At 600k tokens (80% of smaller windows) it normally waits for Claude and its background work to finish, writes a summary that keeps verified work apart from unverified changes, lists what failed and the limits you set, ends with one next step, and clears. The fresh conversation reports its understanding and waits for your instructions; if you typed a message during handoff, it responds to that message instead. Text is carried over; attachments must be pasted again. The guide explains the limit on waiting for background work.

### Keeps the cache warm while you're away

<img src="docs/assets/cache.svg" width="900" alt="Animation: after you leave, the cache is refreshed at 55, 110 and 165 minutes; after that a summary is saved, and when you return you choose to resume or continue">

### Learns your project

Preferences, corrections and facts become one Markdown notes file per project, kept under `~/.claude/projects/` for you to read and edit. They stay out of your conversations unless you turn on `inject_notes`. Routines you repeat are noted as procedures. With the previous update anchor, only the new part is read; if the anchor is missing, the whole conversation is used within the text limit. The default model is Sonnet 5.5 at low effort. ctx-handoff never writes `CLAUDE.md`, `AGENTS.md` or skill files in your project.

### Remembers where you stopped

<img src="docs/assets/resume.svg" width="900" alt="Animation: after /clear, the next conversation is told the last task, its state and the next step">

### Keeps a status card in `_HANDOFF.md`

After each handoff, and whenever the background update has progress, the block between `<!-- ctx-handoff:card rev=N -->` and `<!-- /ctx-handoff:card -->` in your project's `_HANDOFF.md` is updated: state, what's running, what waits for you, the next step, the last check, what didn't work and what was decided. An unchanged card is not rewritten. Content outside the markers is preserved, subject to the encoding and write limits in the guide, and the file is backed up before the first write of each session (the first copy ever is kept for good). No `_HANDOFF.md`? Nothing is created until you run `/handoff card init`.

### Catches the usual slips

<img src="docs/assets/nudges.svg" width="900" alt="Animation: nudges for the same failure twice, for saying done without checking, and for drifting out of your language">

### Asks before commands you can't undo

When Bash or PowerShell is about to run `rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, `npm publish` or the like, you get an Allow or Deny question first. Denying, or closing the question, stops the command. In `claude -p`, where there is no screen to ask on, the command runs as before and a line is logged. With an interactive surface, no answer for 120 seconds or a scheduled task starting the turn means denial. Setting: `command_guard`.

### Guards you approve, one panel for everything

`/handoff guard suggest` turns a rule that keeps coming up into a check on tool calls, and nothing applies until you approve it. `/handoff panel` opens a panel above the prompt for guards, memories, rules, the latest notes update and every setting.

<img src="docs/panel.png" width="560" alt="The panel above the prompt, on the Rules tab, listing rules with how many times each came up. Text in Traditional Chinese.">

## Settings

Everything is on the panel's Settings tab (`/handoff panel`, then <kbd>5</kbd>), with where each value comes from and a reset button. The defaults are meant to be left alone. The [guide](docs/guide.md#settings) lists every setting.

## Cost and privacy

- **No servers of its own.** Model requests go through Claude Code's configured provider, like the conversation itself; the mod has no separate network client.
- **Costs follow the work.** A handoff summary is one request; notes and card updates can add additional requests. Cache refreshes use the current conversation; notes normally use only the new part, falling back to the bounded conversation text if the last anchor is missing. The nudges make no requests. The guide explains the limits.
- **Plain files you own.** Notes are Markdown in `~/.claude/projects/`; the status card lives in your own `_HANDOFF.md`, between its markers only. Check what the mod may do with `claude plugin validate`; the [guide](docs/guide.md#cost-privacy-and-permissions) explains every entry.

## Documentation

- [Guide](docs/guide.md): every feature in detail, settings, commands, permissions, supported environments, limitations, troubleshooting and uninstalling.
- [Changelog](CHANGELOG.md): what changed in each version and why it's worth upgrading.
- [Contributing](CONTRIBUTING.md): how to run it from source and send changes. Bug reports and ideas go in [issues](https://github.com/cablate/ctx-handoff-mod/issues/new/choose).
- [Security](SECURITY.md): how to report a vulnerability privately.

## Credits

- The status card, session digest, cache TTL detection, compaction toast and irreversible-command check follow ideas from [SaM-runtime/claude-console](https://github.com/SaM-runtime/claude-console) (MIT). The code here is written from scratch.

## License

[MIT](LICENSE)
