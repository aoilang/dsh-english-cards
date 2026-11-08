# English Cards

**English** | [中文](README.md)

While you use DeepSeek Harness, the plugin checks your English grammar automatically and collects what it finds into study cards: a live deck above the composer and a searchable card library in the sidebar.

## Preview

![The live deck above the composer](docs/screenshots/dsh-composer.png)

![The card library, opened from the sidebar](docs/screenshots/dsh-card-library.png)

## Features

- **Composer deck**: shows the latest English note for the current conversation; when one message has several source groups, the collapsed deck lists every one of them, and clicking a row expands the sheet and scrolls to that group.
- **Card library**: collects notes from every conversation and searches patterns, corrections, rules, examples, and session titles.
- Cards follow the order the errors appear in the original text; across messages, the newest message comes first.

## Sync to Aoi (off by default)

The English Cards header has a **Sync to Aoi** switch. It is off by default: with it off the plugin makes no network request, and every card stays on this device.

Turning it on runs an OAuth 2.1 authorization-code + PKCE flow in your browser (it asks you to sign in first if needed) and returns to a loopback callback at `127.0.0.1:53682`. No API key to paste. The host stores the access and refresh tokens in `$DSH_HOME/english-cards-sync/state.json` (mode `0600`), refreshes the access token before it expires, and shows **Disconnected — turn on again** if a refresh is rejected; turning it on again reauthorizes.

The first successful authorization backfills the cards already on this device once; later captures are incremental. Backfill and captures share the background outbox and its backoff retries, so neither blocks the capture. The server groups cards under one corrected sentence and dedupes by source text, so retrying is safe; re-syncing the same sentence replaces that sentence's cards. While sync is on, the header also shows **Review**, which opens `https://aoilang.com/grammar/review/`.

The plugin identifies itself through its OAuth client, so the server records `dsh` in `source`; the ChatGPT plugin is recorded as `chatgpt`.

## Install

### Plugin

Open **Plugins → Add plugin** and enter:

```text
dsh-english-cards
```

Make sure **English Cards** is enabled after installation. If the cards do not appear, restart DeepSeek Harness to load the new client code.

### Other agents

This plugin is built for DeepSeek Harness. In Claude Code, ChatGPT/Codex, Cursor, Grok Bot, and other [Agent Plugins](https://agent-plugins.org) hosts, install the portable **Aoi Grammar Cards** instead: it runs the hosted MCP server `https://aoilang.com/grammar/mcp` and keeps its cards on your free [小葵（Aoi）](https://aoilang.com) account. Setup lives in [aoilang/aoi-plugins → plugins/english-cards](https://github.com/aoilang/aoi-plugins/tree/main/plugins/english-cards).

- **Claude Code** — `/plugin marketplace add aoilang/aoi-plugins`, then `/plugin install aoi-grammar-cards@aoi-plugins`.
- **ChatGPT desktop / Codex** — `codex plugin marketplace add aoilang/aoi-plugins`, then install **English Cards** from the Plugins Directory (or run `codex plugin add aoi-grammar-cards@aoi-plugins`).
- **Cursor and other MCP hosts** — add the MCP server `https://aoilang.com/grammar/mcp`, finish OAuth, and paste the plugin's custom instructions so cards save on every message.


## Usage

Write in English as usual. The model calls `english_cards_capture` first, which writes the cards straight into the deck, then does the work; only when the tool is unavailable does it fall back to a note in the reply:

**English note — Subject–verb agreement**  
“My plugin and skill ~~is work~~ **are working**.”  
Rule: two subjects joined by “and” are plural, so the verb is “are”.  
For example: “My tests and docs are ready.”

Expand the deck above the composer, or open the library from **All cards** or the sidebar’s **English cards**.


## License

MIT — see [LICENSE](LICENSE).
