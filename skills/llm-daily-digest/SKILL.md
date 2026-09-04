---
name: llm-daily-digest
description: Generate a Japanese daily digest of hot LLM / Coding Agent news from 8 high-signal sources (Simon Willison, Latent Space, Interconnects, AI News by smol.ai, HF Daily Papers, HN, Reddit r/LocalLLaMA & r/ClaudeAI, GitHub releases for Claude Code/Aider/Cline/Continue/Cody). Use when the user wants today's LLM/Coding Agent digest, asks to run the daily digest manually, or wants to inspect what would be published.
origin: user
---

# LLM / Coding Agent Daily Digest

Pulls fresh items from 8 sources and renders one Japanese Markdown digest. Designed to run unattended daily at 08:00 via launchd, but can also be invoked ad-hoc.

## When to Activate

- `/llm-daily-digest`
- User asks for "today's LLM digest", "今日の LLM まとめ", "Coding Agent の最新情報まとめて"
- User wants to test the digest manually before relying on the schedule

## Sources

| # | Source | Type | Endpoint |
|---|---|---|---|
| 1 | Simon Willison | Atom | `simonwillison.net/atom/everything/` |
| 2 | AI News by smol.ai | RSS | `buttondown.com/ainews/rss` |
| 3 | Latent Space | RSS | `latent.space/feed` |
| 4 | Interconnects (Nathan Lambert) | RSS | `interconnects.ai/feed` |
| 5 | HF Daily Papers | JSON | `huggingface.co/api/daily_papers` |
| 6 | Hacker News (Algolia) | JSON | keyword + last-24h filter |
| 7 | Reddit | JSON | `r/LocalLLaMA`, `r/ClaudeAI`, `r/cursor`, `r/MachineLearning` top/day |
| 8 | GitHub Releases | JSON | claude-code, aider, cline, continue, cody, codex, SWE-agent |

Edit `~/.claude/skills/llm-daily-digest/config.json` to toggle sources, change keywords, add repos.

## Ad-hoc Invocation Workflow

When invoked interactively:

1. Confirm `output_dir` in `config.json` is set to a real path (not the placeholder).
2. Run the fetcher:
   ```bash
   python3 ~/.claude/skills/llm-daily-digest/fetch.py \
     --out /tmp/llm-digest-raw-$(date +%Y-%m-%d).json
   ```
3. Read that JSON.
4. Follow the editorial workflow in `system-prompt.md` to produce the Markdown.
5. Write the result to `{output_dir}/{YYYY-MM-DD}.md`.
6. Report the output path to the user.

## Scheduled (Daily 08:00) Invocation

Scheduled runs are handled by `run.sh` + a launchd plist. See `README.md` for one-time setup. The schedule:

1. launchd fires `run.sh` at 08:00 local time.
2. `run.sh` calls `fetch.py` → raw JSON to a temp file.
3. `run.sh` invokes `claude -p` in `--bare` mode with `--system-prompt-file system-prompt.md`, restricted to `Read,Write` tools.
4. Claude writes the digest Markdown to `{output_dir}/{YYYY-MM-DD}.md`.
5. Exit.

## Configuration

`config.json`:

- `output_dir` — **must be set** before first run. Example: `/Users/me/Documents/obsidian_main/llm-digest`
- `max_items_per_source` — pre-filter ceiling (default 12). The editor filter trims further.
- `summary_model` — model passed to `claude -p --model`. Default: `claude-sonnet-5`. Use `claude-haiku-4-5` if you want it faster/cheaper.
- `sources.{name}` — boolean toggles per source.
- `hackernews_keywords` — terms ORed against HN front-page (last 24h, points > 30).
- `reddit_subs` — subreddits to pull top/day from.
- `gh_repos` — `owner/repo` list for release tracking.

## Files

```
~/.claude/skills/llm-daily-digest/
├── SKILL.md            # this file
├── config.json         # editable config
├── fetch.py            # stdlib-only multi-source fetcher
├── system-prompt.md    # editorial prompt loaded into claude -p
├── run.sh              # launchd entrypoint (fetch + claude -p)
├── com.kyo.llm-daily-digest.plist   # sample launchd plist
└── README.md           # one-time setup instructions
```
