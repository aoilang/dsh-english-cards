# English Cards

**English** | [中文](README.md)

Collects the English grammar notes in DeepSeek Harness Web conversations into study cards: a live deck above the composer and a searchable card library in the sidebar. Inside a correction, removed words appear red and struck through; replacement words appear green and bold.

## Features

- **Cards first**: the model checks the message for English grammar before it starts the request, and calls `english_cards_capture` with what it found; the plugin writes the cards straight into the deck, so a long-running task shows them while the work is still going. A message with nothing to teach gets no call.
- **One source, one sentence**: cards that correct the same sentence are grouped. The group shows the combined corrected sentence first, then lists each card's pattern, rule, and example below it. Removed words are red strikethrough and replacements are green bold. Independent sentences from one message stay in separate groups.
- **Composer deck**: shows the latest English note for the current conversation; when one message has several source groups, the collapsed deck lists every one of them, and clicking a row expands the sheet and scrolls to that group.
- **Card library**: collects notes from every conversation and searches patterns, corrections, rules, examples, and session titles.
- Cards follow the order the errors appear in the original text; across messages, the newest message comes first.
- Notes live in the session projection, not in the workspace.

## Fast capture

The model's first action on an English message is a call to `english_cards_capture`, with the corrections it found passed as the `cards` argument. That result carries the cards as presentation metadata; the session projection folds it, so the deck updates while the main task is still running instead of waiting for the reply. The tool itself is pure: it normalizes the cards and calls no model. If the message has nothing worth teaching, the model skips the call and does the work; if the tool is missing or fails, the model falls back to writing the note itself.

## Install

### Plugin

Open **Plugins → Add plugin** and enter:

```text
github:aoilang/dsh-english-cards
```

Or ask the agent:

```text
plugin_manager action=install_bundle target=github:aoilang/dsh-english-cards
```

Make sure **English Cards** is enabled after installation. If the cards do not appear, restart DeepSeek Harness to load the new client code.

### Skill

The skill file [SKILL.md](SKILL.md) ships in the repository, but DeepSeek Harness no longer registers it as a runtime skill: the reminder lives in the system prompt and the card field rules live in the `english_cards_capture` tool description, so the model does not load anything first. The file now serves agents that cannot register a tool.

To use it in other agents, there are two options.

#### Option A — let your agent install it (recommended)

Give the agent the repository address and let it clone and install the skill. For example, paste this into a Claude Code session:

```text
Install the skill from https://github.com/aoilang/dsh-english-cards into ~/.claude/skills/dsh-english-cards/ and load SKILL.md when I write in English.
```

Or into a Codex session:

```text
Install the skill from https://github.com/aoilang/dsh-english-cards into ~/.agents/skills/dsh-english-cards/.
```

#### Option B — copy it manually

```bash
mkdir -p ~/.agents/skills/dsh-english-cards
curl -fsSL https://raw.githubusercontent.com/aoilang/dsh-english-cards/main/SKILL.md \
  -o ~/.agents/skills/dsh-english-cards/SKILL.md
```

Both options are for other agents only; DeepSeek Harness itself does not need the skill installed.

## Usage

Write in English as usual. The model calls `english_cards_capture` first, which writes the cards straight into the deck, then does the work; only when the tool is unavailable does it fall back to a note in the reply:

**English note — Subject–verb agreement**  
“My plugin and skill ~~is work~~ **are working**.”  
Rule: two subjects joined by “and” are plural, so the verb is “are”.  
For example: “My tests and docs are ready.”

Expand the deck above the composer, or open the library from **All cards** or the sidebar’s **English cards**.

## Card format

The model generates the cards through `english_cards_capture`; the plugin only normalizes and displays them. Each note has:

- a title: `**English note — native pattern · English grammar term**`
- `sourceText`: the self-complete sentence the correction belongs to; cards that share it form one group
- the corrected sentence: words to remove in `~~strikethrough~~` (shown red) and replacements in `**bold**` (shown green); unchanged words appear once and carry no markup
- `Rule:` one sentence in the learner’s native language
- `For example:` one short English example

Cards that share a `sourceText` are grouped: the deck shows the combined corrected sentence once, then lists each card's title, rule, and example below it. Independent sentences from one message become separate groups. The separate original sentence is no longer shown, because the corrected sentence already contains it. Cards in one reply are ordered by where the errors appear in the original text.

## Development

```bash
node --test test/notes.test.mjs
```

| File | Role |
| --- | --- |
| [index.js](index.js) | Host half: registers the `englishLearningCards` projection and the `english_cards_capture` tool |
| [client.js](client.js) | Web half: composer deck and card library |
| [cordis.patch.yml](cordis.patch.yml) | Inserts the plugin into the profile |
| [SKILL.md](SKILL.md) | Standalone skill spec for other agents (DeepSeek Harness does not load it) |
| [test/notes.test.mjs](test/notes.test.mjs) | Parser and projection tests |

`title` holds the native pattern, optionally followed by ` · ` and the English grammar term (for example `主谓一致 · Subject–verb agreement`); the plugin splits it into the title and its secondary label.
