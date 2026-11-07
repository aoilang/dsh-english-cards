---
name: dsh-english-cards
description: Notice meaningful grammar errors in a user's English before doing the requested work, and capture brief teaching cards with english_cards_capture when there are any — on every English message of a conversation, not only the first. Skip the call when the message has nothing to teach; ignore minor typos and stylistic preferences.
---

# English Cards

Carry out the user's request as usual. Treat English feedback as a small add-on, never as a reason to skip, redirect, or replace the requested work.

When the user writes in English, check their own wording for clear, meaningful grammar mistakes. Do not correct minor typos, punctuation nits, acceptable variants, or choices that are only stylistic. Do not treat quoted text, code, or text supplied for editing as evidence of the user's own English unless they are clearly presenting it as their writing.

If there are high-confidence, important grammar issues, write one card per distinct issue: a short message may need one, a long message several. There is no fixed cap, but every card has to earn the learner's attention. Do not force unrelated errors into one card, and do not stop at the first one you notice. Order the cards by where each issue appears in the learner's original text, earliest first — do not reorder them by importance.

Show a corrected version of the relevant phrase, briefly explain the grammar pattern, and give a short contrasting example only when it helps. Use a friendly, neutral tone; do not grade or shame the user. The default is to capture: if a clause can be improved, call the tool. Skip only after a deliberate scan finds no clear error in articles, countability, prepositions, agreement, tense, or word order.

Prefer a pattern the user has repeated in the visible conversation over a one-off explanation. Describe each pattern plainly and use one example that helps transfer it to future writing. Do not claim a pattern is recurring based on a single instance or unavailable history. Do not write two cards for the same rule; if one sentence repeats the same error, correct every changed unit in one card.

## Capture first, then work

Capture is a per-message habit, not a one-time setup. The first message of a conversation gets captured most reliably; the rest of this section exists to make every later message get the same treatment.

Before you handle the request — before planning, before any other tool call — scan the user's own English for meaningful mistakes. If you find any, call `english_cards_capture` with them: one entry per issue, in the order they appear, each with `title` (the native pattern, optionally followed by ` · ` and the English grammar term), `sourceText`, `original`, `corrected`, `rule`, and `example`. The tool writes them straight into the deck above the composer, so the learner can study them while the task is still running. If the scan finds nothing, do not call the tool; just do the work.

- Fill `cards` yourself whenever you can see the issues. That is the fast and reliable path, and it needs no second model call.
- `sourceText` is the self-complete sentence or clause the correction belongs to, exactly as the learner wrote it. When the message is one sentence, every card from that sentence shares the same `sourceText`. When the message contains independent sentences, use a different `sourceText` for each one; do not put all cards from a long message into one source.
- When several cards correct the same `sourceText`, give every card in that group the same fully corrected source sentence in `corrected`, with all of that sentence's corrections marked. The deck shows that source sentence once and lists the cards below it.
- Write the whole corrected source in `corrected`: wrap only the words you remove in `~~double tildes~~`, and wrap only the words that replace them in `**double asterisks**`. The deck shows struck text in red and bold corrections in green, so the original wording stays visible inside the corrected sentence and no separate original line is needed. Keep every unchanged word once, without markup. `original` stays exactly as the learner wrote it.
- Skipping is the exception, not the default: before you skip, name the categories you checked. An empty deck is fine, but only after that scan.
- Call it even when the task is long or needs many tools. Do not answer or plan before the check.
- Do not skip the check because you already captured cards earlier in this conversation: capture is per message, not per conversation.
- Read the whole message before deciding it is clean. Short and casual messages carry grammar too: check every clause, and do not stop at the first issue you notice.
- One call per user message. Do not capture again in later steps of the same turn, however long the work runs.
- After the call returns, continue with the requested work in the same turn.
- If the tool captured cards, do not write English notes in your reply — the deck already has them.
- If the tool is missing or reports an error, fall back to writing the note block described under Format at the bottom of the reply.
- Never invent an issue to have something to show, and never replace the capture with a summary sentence such as “I saved a card for you”.

## Language

Write each card for the learner, not for an English teacher. The title and the explanation use the learner's native language — the language they use outside the English they are practising. Infer it from the conversation history; if it is genuinely unclear, use the language of the surrounding UI when known, otherwise English. The corrected sentence and the example stay in English.

## Format

Use this block only for the fallback, when `english_cards_capture` is missing or fails.

**English note — [native pattern] · [English grammar term]**  
“[Full corrected sentence with ~~removed words~~ and **corrected words**].”  
[Rule label][one-sentence explanation in the learner's native language]  
[Example label]“[short English example].”

- The corrected sentence carries the original: strike through every word or phrase you removed, and bold every word or phrase you added or replaced. Do not add a separate original line; it would duplicate what the corrected sentence already shows.
- Write each note about one self-complete sentence. If the message has several independent sentences, give each its own note and put only that sentence in the corrected quote. Notes with the same source sentence are grouped and the deck shows that sentence once.
- Strike only the smallest removed unit and bold only the smallest replacement unit — never a whole sentence or an entire clause that merely contains a change. If “locate to the sentence” becomes “takes you to the sentence”, strike only “locate to” and bold only “takes you to”; leave “the sentence” unmarked.
- Unchanged words appear once and carry no markup. When the correction only adds words, use bold alone; when it only removes words, use strikethrough alone. When the same error repeats in one sentence, mark each changed unit separately.
- Keep the native pattern first and the English grammar term second, separated by `·`. If the learner's native language is English, use one title with no separator.
- Rule label: `规则：` (Chinese), `ルール：` (Japanese), `Rule:` (English). The label may be omitted.
- Example label: `例句：` or `例：` (Chinese), `例文：` (Japanese), `For example:` (English).
- Keep the corrected sentence, explanation, and example in that order; no extra headings or bullet lists.
- With several cards, repeat the block once per issue in the order the issues appear in the learner's original text, separated by one blank line. Do not number the cards or add an introduction.
- When you quote this format or an example card in an explanation, put it inside a fenced code block; the plugin ignores fenced blocks and rejects placeholder text.

Example for a Chinese learner:

**English note — 主谓一致 · Subject–verb agreement**  
“I want to test whether my new plugin and skill ~~is work~~ **are working**.”  
规则：由 and 连接的两个主语是复数，be 动词用 are；“is work” 不成立。  
例句：“My plugin and skill are working.”

When a message has several unrelated issues, add one card per issue in the order they appear:

**English note — 主谓一致 · Subject–verb agreement**  
“My plugin and skill ~~is~~ **are** working.”  
规则：由 and 连接的两个主语是复数，be 动词用 are。  
例句：“My tests and docs are ready.”

**English note — 介词搭配 · Preposition after "depend"**  
“It depends ~~of~~ **on** the version.”  
规则：depend 后面固定用 on，不用 of。  
例句：“The result depends on the input.”
