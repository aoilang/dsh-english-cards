/**
 * Host half of the English Cards bundle.
 *
 * The projection key is `englishLearningCards`; the client half reads it with `useProjection`.
 *
 * The projection must stay plain JSON: every value is checkpointed and
 * restored through the persisted projection cache.
 */

import { createSyncService } from './sync.js'

/** Upper bound keeps the checkpointed state and the rendered deck small. */
export const MAX_CARDS = 100

/** Projection key shared with the client half. */
export const PROJECTION_KEY = 'englishLearningCards'

/** Start of one note heading, before the bold title is closed. */
const NOTE_START = /^\s*\*\*\s*English\s+note\b/i

/** Fast prefix check before the more expensive line scan. */
const NOTE_PROBE = /English\s+note/i

/** Example markers in English and in the learner's native language. */
const EXAMPLE_MARKER = /(?:for\s+example|例如|例文|例句|比如|たとえば|例えば|例)\s*[:：]/i

/** Optional rule label in English or in the learner's native language. */
const RULE_LABEL = /^\s*(?:规则|規則|说明|說明|解释|解釋|説明|ルール|解説|rule|explanation)\s*[:：]\s*/i

/** Original-sentence marker in English or in the learner's native language. */
const ORIGINAL_LABEL = /(?:原句|原文|元の文|original)\s*[:：]/i

/** Placeholder markers from a quoted format example; these are never a card. */
const TEMPLATE_MARKER =
  /\[\s*(?:native pattern|english grammar term|corrected(?:\s+wording|\s+english sentence)[^\]]*|full corrected sentence[^\]]*|removed words|corrected words|short(?:\s+english)?\s+example|one-sentence explanation[^\]]*|brief rule|original sentence|pattern|short example)\s*\]/i

/** Identity schema: the projection contract only requires `parse`, and the
 * state is already JSON owned by this unit. */
const PASSTHROUGH_SCHEMA = {
  parse(value) {
    return value
  },
}

/** Strip the card's own markup and inline code for plain UI copy. */
function stripMarkup(value) {
  return String(value)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

/** Collapse markdown emphasis and inline code for plain UI copy. */
function plainText(value) {
  return stripMarkup(value).replace(/\s+/g, ' ').trim()
}

/** Clipboard text of one message, tolerating string and block content. */
export function textOfMessage(message) {
  if (message === null || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

/** Strip one surrounding bracket pair and trailing punctuation from a title. */
function cleanTitle(raw) {
  let title = plainText(raw).trim()
  const wrapped = /^\[([^\[\]]+)\]$/.exec(title)
  if (wrapped !== null) title = wrapped[1].trim()
  title = title.replace(/[.。:：]+$/, '').trim()
  return title
}

/** Split one heading line into its pattern name and any same-line body. */
function headingOf(line) {
  const start = NOTE_START.exec(line)
  if (start === null) return null
  const after = line.slice(start[0].length)
  const close = after.indexOf('**')
  if (close < 0) return null
  return {
    title: cleanTitle(after.slice(0, close).replace(/^\s*[—–:-]\s*/, '')),
    trailing: after.slice(close + 2).trim(),
  }
}

/** Body lines of one card, stopping at a blank line, rule, or the next card. */
function bodyLinesAfter(lines, headingIndex) {
  const body = []
  let cursor = headingIndex + 1
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (NOTE_START.test(line)) break
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      cursor += 1
      break
    }
    if (line.trim() === '') {
      if (body.length > 0) {
        cursor += 1
        break
      }
      cursor += 1
      continue
    }
    body.push(line.trim())
    cursor += 1
  }
  return { body: body.join(' '), cursor }
}

/**
 * Split card markup into renderable segments.
 * `**corrected**` becomes `{ text, strong: true }` and `~~removed~~` becomes
 * `{ text, strike: true }`, so the card can colour the replacement green and
 * the deleted original red without a separate field.
 * @param {string} text - one note field.
 * @returns {Array<{text: string, strong: boolean, strike: boolean}>}
 */
export function textSegments(text) {
  const value = typeof text === 'string' ? text : ''
  const parts = []
  const pattern = /\*\*([^*]+)\*\*|~~([^~]+)~~/g
  let cursor = 0
  let match
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) {
      parts.push({ text: value.slice(cursor, match.index), strong: false, strike: false })
    }
    const bold = match[1] !== undefined
    parts.push({ text: bold ? match[1] : match[2], strong: bold, strike: !bold })
    cursor = match.index + match[0].length
  }
  if (cursor < value.length) {
    parts.push({ text: value.slice(cursor), strong: false, strike: false })
  }
  return parts.filter((part) => part.text.length > 0)
}

/** Punctuation that a word comparison should ignore at either edge. */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

/** A removed word without punctuation the corrected sentence already keeps. */
function removedWord(word) {
  const stripped = word.replace(EDGE_PUNCTUATION, '')
  return stripped.length > 0 ? stripped : word
}

/**
 * Word-level edit script over two span lists.
 * @param {Array<{text: string, key: string}>} before - reference words.
 * @param {Array<{text: string, key: string}>} after - corrected words.
 * @returns {Array<{kind: 'keep'|'delete'|'insert', at?: number, word?: string}>}
 */
function diffWords(before, after) {
  const rows = before.length
  const cols = after.length
  const table = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1))
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      table[row][col] =
        before[row].key === after[col].key
          ? table[row + 1][col + 1] + 1
          : Math.max(table[row + 1][col], table[row][col + 1])
    }
  }
  const ops = []
  let row = 0
  let col = 0
  while (row < rows && col < cols) {
    if (before[row].key === after[col].key) {
      ops.push({ kind: 'keep', at: col })
      row += 1
      col += 1
    } else if (table[row + 1][col] >= table[row][col + 1]) {
      ops.push({ kind: 'delete', word: before[row].text })
      row += 1
    } else {
      ops.push({ kind: 'insert', at: col })
      col += 1
    }
  }
  while (row < rows) {
    ops.push({ kind: 'delete', word: before[row].text })
    row += 1
  }
  while (col < cols) {
    ops.push({ kind: 'insert', at: col })
    col += 1
  }
  return ops
}

/**
 * Mark the words that differ from the learner's original.
 * The corrected sentence carries the whole story: removed words are wrapped in
 * `~~double tildes~~` and replacement words in `**double asterisks**`, so the
 * deck can show red struck-through original text next to green bold
 * corrections. Cards authored by a model sometimes carry only bold emphasis —
 * or no markup at all — and an unmarked card renders with nothing to highlight.
 * Diffing the pair restores both sides; text that already carries strikethrough
 * markup, or that was rewritten wholesale, is left untouched.
 * @param {string} text - corrected sentence, possibly already marked.
 * @param {string} counterpart - the sentence to compare against.
 * @returns {string} text with changed runs wrapped in `~~` and `**`.
 */
export function emphasizeChanges(text, counterpart) {
  if (typeof text !== 'string' || text.length === 0) return text
  // Model-authored markup already tells both sides of the story.
  if (/~~[^~]+~~/.test(text)) return text
  const reference = typeof counterpart === 'string' ? counterpart : ''
  const plain = stripMarkup(text)
  if (reference.length === 0) return text
  const beforeText = stripMarkup(reference)
  if (beforeText.length === 0 || beforeText === plain) return text
  const target = mergeSpans(plain)
  if (target.length === 0) return text
  const before = mergeSpans(beforeText)
  if (before.length === 0) return text
  const ops = diffWords(before, target)
  const kept = ops.filter((op) => op.kind === 'keep').length
  const changed = target.length - kept
  if (changed === 0 && before.length === target.length) return text
  // A rewrite rather than a correction: no useful spans to teach with.
  if (changed > target.length * 0.7) return text

  // Group each edit cluster into one hunk anchored before a corrected word, so
  // "codex support" → "Codex supports" reads as one replacement rather than
  // four alternating marks.
  const hunks = []
  let deleted = []
  let insertedFrom = -1
  let insertedTo = -1
  const flush = (anchor) => {
    if (deleted.length === 0 && insertedFrom < 0) return
    hunks.push({
      anchor: insertedFrom >= 0 ? insertedFrom : anchor,
      deleted,
      insertedFrom,
      insertedTo,
    })
    deleted = []
    insertedFrom = -1
    insertedTo = -1
  }
  for (const op of ops) {
    if (op.kind === 'delete') deleted.push(removedWord(op.word))
    else if (op.kind === 'insert') {
      if (insertedFrom < 0) insertedFrom = op.at
      insertedTo = op.at
    } else flush(op.at)
  }
  flush(target.length)

  const byAnchor = new Map()
  for (const hunk of hunks) byAnchor.set(hunk.anchor, hunk)
  let marked = ''
  let cursor = 0
  for (let index = 0; index < target.length; index += 1) {
    const hunk = byAnchor.get(index)
    if (hunk !== undefined) {
      if (hunk.insertedFrom >= 0) {
        const from = target[hunk.insertedFrom].start
        marked += plain.slice(cursor, from)
        if (hunk.deleted.length > 0) marked += '~~' + hunk.deleted.join(' ') + '~~ '
        const to = target[hunk.insertedTo].end
        marked += '**' + plain.slice(from, to) + '**'
        cursor = to
        index = hunk.insertedTo
      } else {
        const at = target[index].start
        marked += plain.slice(cursor, at) + '~~' + hunk.deleted.join(' ') + '~~ '
        cursor = at
      }
    }
    marked += plain.slice(cursor, target[index].end)
    cursor = target[index].end
  }
  marked += plain.slice(cursor)
  const trailing = byAnchor.get(target.length)
  if (trailing !== undefined && trailing.deleted.length > 0) {
    const strike = '~~' + trailing.deleted.join(' ') + '~~'
    // Keep the sentence's final punctuation after the removed tail.
    const tail = /([.!?,;:]+)$/.exec(marked)
    if (tail !== null) {
      const at = marked.length - tail[1].length
      marked =
        marked.slice(0, at) +
        (at > 0 && !/\s$/.test(marked.slice(0, at)) ? ' ' : '') +
        strike +
        tail[1]
    } else {
      marked += (/\s$/.test(marked) || marked.length === 0 ? '' : ' ') + strike
    }
  }
  return marked.replace(/ {2,}/g, ' ')
}

/** Plain text of one segment list, used for search, previews, and dedupe. */
function plainFromSegments(parts) {
  return parts.map((part) => part.text).join('')
}

/**
 * Plain corrected sentence without the struck-through original words.
 * The segments keep the deletions for display, but `corrected` stays the clean
 * final sentence so ids and search text do not read “is are working”.
 */
function correctedFromSegments(parts) {
  return parts
    .filter((part) => !part.strike)
    .map((part) => part.text)
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/**
 * Recover the learner's source sentence from marked segments.
 * Struck-through words are the original wording; bold words replaced them, so
 * keeping everything except the bold spans rebuilds the source for fallback
 * notes that carry no separate original line.
 */
function sourceFromParts(parts) {
  return parts
    .filter((part) => !part.strong)
    .map((part) => part.text)
    .join('')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** Exact, self-complete source text a card belongs to. */
export function cardSourceText(card) {
  if (card === null || typeof card !== 'object') return ''
  const explicit = typeof card.sourceText === 'string' ? card.sourceText.trim() : ''
  if (explicit.length > 0) return explicit
  return typeof card.original === 'string' ? card.original.trim() : ''
}

/** Stable key for one source within the user message that produced it. */
function cardSourceKey(card) {
  const text = cardSourceText(card)
  const origin =
    card.source !== null && typeof card.source === 'object'
      ? card.source.messageId || card.source.userSeq || card.source.turn || ''
      : ''
  return JSON.stringify([String(origin), (text.length > 0 ? text : String(card.id ?? '')).toLowerCase()])
}

/**
 * Tokens for merging several corrected variants of one source.
 * Punctuation is its own token so an insertion before a final period lands
 * before the period instead of after it.
 */
function mergeSpans(text) {
  const spans = []
  const pattern = /[\p{L}\p{N}][\p{L}\p{N}'’-]*|[^\s]/gu
  let match
  while ((match = pattern.exec(text)) !== null) {
    spans.push({ text: match[0], key: match[0], start: match.index, end: match.index + match[0].length })
  }
  return spans
}

/**
 * Word-level edits between the source sentence and one corrected variant.
 * Hunks reference source token indices so several cards can be merged.
 * @param {string} source - self-complete source text.
 * @param {string} corrected - the source with one card's correction applied.
 * @returns {{hunks: Array<{start: number, end: number, insert: string}>, changed: number}}
 */
function editHunks(source, corrected) {
  const sourceSpans = mergeSpans(source)
  const correctedSpans = mergeSpans(corrected)
  if (sourceSpans.length === 0 || correctedSpans.length === 0) return { hunks: [], changed: 0 }
  const ops = diffWords(sourceSpans, correctedSpans)
  const hunks = []
  let deletedFrom = -1
  let deletedTo = -1
  let insertedFrom = -1
  let insertedTo = -1
  let cursor = 0
  let changed = 0
  const flush = (anchor) => {
    if (deletedFrom < 0 && insertedFrom < 0) return
    hunks.push({
      start: deletedFrom >= 0 ? deletedFrom : anchor,
      end: deletedTo >= 0 ? deletedTo : anchor,
      insert:
        insertedFrom >= 0
          ? corrected.slice(correctedSpans[insertedFrom].start, correctedSpans[insertedTo].end)
          : '',
    })
    deletedFrom = -1
    deletedTo = -1
    insertedFrom = -1
    insertedTo = -1
  }
  for (const op of ops) {
    if (op.kind === 'delete') {
      if (deletedFrom < 0) deletedFrom = cursor
      deletedTo = cursor + 1
      cursor += 1
      changed += 1
    } else if (op.kind === 'insert') {
      if (insertedFrom < 0) insertedFrom = op.at
      insertedTo = op.at
      changed += 1
    } else {
      flush(cursor)
      cursor += 1
    }
  }
  flush(cursor)
  return { hunks, changed }
}

/** Combine overlapping or duplicate edits from several cards. */
function mergeHunks(hunks) {
  const sorted = hunks.slice().sort((left, right) => left.start - right.start || left.end - right.end)
  const merged = []
  for (const hunk of sorted) {
    const last = merged[merged.length - 1]
    if (last === undefined) {
      merged.push({ ...hunk })
      continue
    }
    if (hunk.start === last.start && hunk.end === last.end) {
      if (hunk.insert.length > 0) {
        if (last.start === last.end) {
          // Two cards add words at the same point: include both insertions.
          if (!last.insert.includes(hunk.insert)) {
            last.insert = last.insert.length > 0 ? last.insert + ' ' + hunk.insert : hunk.insert
          }
        } else if (last.insert.length === 0 || hunk.insert.length > last.insert.length) {
          // Two cards replace the same span: keep the more complete replacement.
          last.insert = hunk.insert
        }
      }
      continue
    }
    if (hunk.start >= last.end) {
      merged.push({ ...hunk })
      continue
    }
    const start = Math.min(last.start, hunk.start)
    const end = Math.max(last.end, hunk.end)
    const insert = [last.insert, hunk.insert].filter((text) => text.length > 0).join(' ')
    merged[merged.length - 1] = { start, end, insert }
  }
  return merged
}

/** Apply merged edits to the source while keeping original spacing. */
function applyHunks(source, hunks) {
  const spans = mergeSpans(source)
  let output = ''
  let cursor = 0
  for (const hunk of hunks) {
    const start = hunk.start < spans.length ? spans[hunk.start].start : source.length
    const end = hunk.end > 0 && hunk.end <= spans.length ? spans[hunk.end - 1].end : start
    output += source.slice(cursor, start)
    if (hunk.insert.length > 0) {
      const before = output.length > 0 ? output[output.length - 1] : ''
      const after = end < source.length ? source[end] : ''
      if (before.length > 0 && !/\s/.test(before) && !/^[.,;:!?)\]”’]/.test(hunk.insert)) output += ' '
      output += hunk.insert
      if (
        after.length > 0 &&
        !/\s/.test(after) &&
        !/^[.,;:!?)\]”’]/.test(after) &&
        !/\s$/.test(hunk.insert)
      ) {
        output += ' '
      }
    }
    cursor = end
  }
  output += source.slice(cursor)
  return output.replace(/ {2,}/g, ' ').trim()
}

/** Split text into self-complete sentence spans, keeping the punctuation. */
function sentenceSpans(text) {
  const spans = []
  const pattern = /[.!?]+["')\]]*\s*|\n+/g
  let start = 0
  let match
  const push = (from, to) => {
    let begin = from
    let end = to
    while (begin < end && /\s/.test(text[begin])) begin += 1
    while (end > begin && /\s/.test(text[end - 1])) end -= 1
    if (end > begin) spans.push({ text: text.slice(begin, end), start: begin, end })
  }
  while ((match = pattern.exec(text)) !== null) {
    const boundary = match.index + match[0].length
    push(start, boundary)
    start = boundary
  }
  push(start, text.length)
  return spans
}

/** Token index range covered by one sentence span. */
function tokenRangeForSpan(spans, sentence) {
  let start = -1
  let end = -1
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index]
    if (span.start >= sentence.start && span.end <= sentence.end) {
      if (start < 0) start = index
      end = index + 1
    }
  }
  return { start, end }
}

/**
 * Narrow a card to the self-complete sentence its correction belongs to.
 * A model may pass the whole user message as `original`; without this step a
 * multi-sentence message would become one long source. Cards from independent
 * sentences keep different sources and render as separate groups.
 * @param {object} card - card with original, corrected, and sourceText fields.
 * @returns {object} the card, narrowed when the original had several sentences.
 */
function splitCardSource(card) {
  const original =
    typeof card.original === 'string' && card.original.length > 0
      ? card.original
      : typeof card.sourceText === 'string'
        ? card.sourceText
        : ''
  const corrected = typeof card.corrected === 'string' ? card.corrected : ''
  if (original.length === 0 || corrected.length === 0) return card
  const source = typeof card.sourceText === 'string' ? card.sourceText.trim() : ''
  if (source.length > 0 && source !== original) return card
  const sentences = sentenceSpans(original)
  if (sentences.length < 2) return card
  const originalSpans = mergeSpans(original)
  const { hunks } = editHunks(original, corrected)
  if (hunks.length === 0) return card
  const first = hunks[0]
  const anchor = first.start < originalSpans.length ? first.start : originalSpans.length - 1
  const candidates = sentences
    .map((sentence) => ({ sentence, range: tokenRangeForSpan(originalSpans, sentence) }))
    .filter((item) => item.range.start >= 0)
  const chosen =
    candidates.find((item) => anchor >= item.range.start && anchor < item.range.end) ??
    candidates.find((item) => anchor >= item.range.start && anchor <= item.range.end) ??
    candidates[0]
  if (chosen === undefined) return card
  const localHunks = hunks
    .filter((hunk) => hunk.start >= chosen.range.start && hunk.end <= chosen.range.end)
    .map((hunk) => ({
      start: hunk.start - chosen.range.start,
      end: hunk.end - chosen.range.start,
      insert: hunk.insert,
    }))
  if (localHunks.length === 0) return card
  const correctedSource = applyHunks(chosen.sentence.text, localHunks)
  const parts = textSegments(emphasizeChanges(correctedSource, chosen.sentence.text))
  const correctedText = correctedFromSegments(parts)
  return {
    ...card,
    id: `${card.title.toLowerCase()}::${correctedText.toLowerCase()}`,
    original: chosen.sentence.text,
    originalParts: textSegments(chosen.sentence.text),
    sourceText: chosen.sentence.text,
    corrected: correctedText,
    correctedParts: parts,
  }
}

/**
 * Apply several cards' corrections to one source sentence.
 * Each card's clean `corrected` field is one variant of the source; the hunks
 * are merged so the group can show every correction in a single sentence.
 * @param {string} source - self-complete source text.
 * @param {Array<object>} cards - cards that share the source.
 * @returns {{corrected: string, correctedParts: Array<object>} | null}
 */
export function mergeCorrections(source, cards) {
  if (typeof source !== 'string' || source.length === 0 || !Array.isArray(cards)) return null
  const sourceTokens = mergeSpans(source)
  if (sourceTokens.length === 0) return null
  const hunks = []
  for (const card of cards) {
    if (card === null || typeof card !== 'object') continue
    if (typeof card.corrected !== 'string' || card.corrected.length === 0) continue
    if (card.corrected === source) continue
    const result = editHunks(source, card.corrected)
    if (result.hunks.length === 0) continue
    if (result.changed > (sourceTokens.length + mergeSpans(card.corrected).length) * 0.7) continue
    for (const hunk of result.hunks) hunks.push(hunk)
  }
  if (hunks.length === 0) return null
  const combined = applyHunks(source, mergeHunks(hunks))
  const parts = textSegments(emphasizeChanges(combined, source))
  return { corrected: correctedFromSegments(parts), correctedParts: parts }
}

/**
 * Group cards by the self-complete source text they correct.
 * Cards from different user messages never share a group, even when the text
 * repeats; cards from one message split into independent source groups.
 * @param {Array<object>} cards - deck cards.
 * @returns {Array<object>} grouped cards with one combined corrected sentence.
 */
export function groupCards(cards) {
  if (!Array.isArray(cards)) return []
  const groups = []
  const byKey = new Map()
  for (const card of cards) {
    if (card === null || typeof card !== 'object') continue
    const key = cardSourceKey(card)
    let group = byKey.get(key)
    if (group === undefined) {
      group = {
        id: key,
        sourceText: cardSourceText(card),
        cards: [],
        seq: 0,
        source: null,
      }
      byKey.set(key, group)
      groups.push(group)
    }
    group.cards.push(card)
    const seq = typeof card.seq === 'number' ? card.seq : 0
    if (seq >= group.seq) {
      group.seq = seq
      group.source = card.source ?? group.source
    }
  }
  for (const group of groups) {
    const first = group.cards[0]
    const source = group.sourceText
    if (group.cards.length > 1) {
      const same = group.cards.every((card) => card.corrected === first.corrected)
      if (!same) {
        const merged = mergeCorrections(source, group.cards)
        if (merged !== null) {
          group.corrected = merged.corrected
          group.correctedParts = merged.correctedParts
          continue
        }
      }
    }
    const parts =
      source.length > 0
        ? textSegments(emphasizeChanges(first.corrected, source))
        : first.correctedParts
    group.corrected = correctedFromSegments(parts)
    group.correctedParts = parts
  }
  return groups
}

/** True when any field still contains a placeholder from the format example. */
function isTemplateCard(card) {
  return [card.title, card.titleAlt, card.corrected, card.original, card.rule, card.example].some(
    (value) => typeof value === 'string' && TEMPLATE_MARKER.test(value),
  )
}

/**
 * Parse every English note card in one assistant text.
 * The card carries both plain fields (for search and older clients) and
 * emphasis segments (for highlighting), plus an optional native title after
 * the first `·` separator.
 * @param {string} text - assistant message text.
 * @param {number} seq - session event sequence used as the card watermark.
 * @returns {Array<object>}
 */
export function parseEnglishNotes(text, seq = 0) {
  if (typeof text !== 'string' || !NOTE_PROBE.test(text)) return []
  // Fenced examples are documentation, never collected cards.
  const source = text.replace(/```[\s\S]*?```/g, '\n').replace(/~~~[\s\S]*?~~~/g, '\n')
  const lines = source.split(/\r?\n/)
  const cards = []
  for (let index = 0; index < lines.length; index += 1) {
    const heading = headingOf(lines[index])
    if (heading === null) continue
    const collected = bodyLinesAfter(lines, index)
    index = collected.cursor - 1

    const titleParts = heading.title.split(/\s*·\s*/)
    const title = (titleParts.shift() ?? '').trim()
    const titleAlt = titleParts.join(' · ').trim()
    if (title.length === 0) continue
    const body = [heading.trailing, collected.body]
      .filter((part) => part.length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (body.length === 0) continue

    // The optional original sentence is shown separately and must not be
    // mistaken for the corrected quote.
    let working = body
    let originalRaw = ''
    const originalAt = body.search(ORIGINAL_LABEL)
    if (originalAt >= 0) {
      const labelMatch = ORIGINAL_LABEL.exec(body.slice(originalAt))
      const labelEnd = originalAt + (labelMatch === null ? 0 : labelMatch[0].length)
      const after = body.slice(labelEnd)
      const originalQuote = /[“"]([^“”"]+)[”"]/.exec(after)
      if (originalQuote !== null) {
        originalRaw = originalQuote[1].trim()
        const start = labelEnd + originalQuote.index
        working = (body.slice(0, originalAt) + ' ' + body.slice(start + originalQuote[0].length))
          .replace(/\s+/g, ' ')
          .trim()
      } else {
        working = (body.slice(0, originalAt) + ' ' + after).replace(/\s+/g, ' ').trim()
      }
    }
    const originalParts = textSegments(originalRaw)

    const quotes = []
    const quoted = /[“"]([^“”"]+)[”"]/g
    let match
    while ((match = quoted.exec(working)) !== null) {
      const quote = match[1].trim()
      if (quote.length > 0 && quotes[quotes.length - 1] !== quote) quotes.push(quote)
    }
    const correctedRaw = quotes[0] ?? ''
    const correctedParts = textSegments(emphasizeChanges(correctedRaw, originalRaw))
    const corrected = correctedFromSegments(correctedParts)

    const exampleAt = working.search(EXAMPLE_MARKER)
    let exampleRaw = ''
    if (exampleAt >= 0) {
      const after = working.slice(exampleAt).replace(EXAMPLE_MARKER, '')
      const exampleQuote = /[“"]([^“”"]+)[”"]/.exec(after)
      if (exampleQuote !== null) exampleRaw = exampleQuote[1].trim()
    }
    const exampleParts = textSegments(exampleRaw)

    let ruleSource = exampleAt >= 0 ? working.slice(0, exampleAt) : working
    const firstQuote = ruleSource.search(/[“"]/)
    if (firstQuote >= 0) {
      ruleSource = ruleSource.slice(firstQuote).replace(/^[“"][\s\S]*?[”"]/, ' ')
    }
    ruleSource = ruleSource.replace(RULE_LABEL, '')
    ruleSource = ruleSource
      .replace(/\s+/g, ' ')
      .replace(/^[\s.,;:，。；：、\-–—]+/u, '')
      .trim()
      .replace(/[\s.。]+$/, '')
    const ruleParts = textSegments(ruleSource)

    const card = {
      id: `${title.toLowerCase()}::${corrected.toLowerCase()}`,
      title,
      titleAlt,
      original: originalRaw,
      originalParts,
      sourceText: originalRaw || sourceFromParts(correctedParts),
      corrected,
      correctedParts,
      rule: plainFromSegments(ruleParts),
      ruleParts,
      example: plainFromSegments(exampleParts),
      exampleParts,
      seq: Number.isFinite(seq) ? seq : 0,
    }
    const normalized = splitCardSource(card)
    if (isTemplateCard(normalized)) continue
    cards.push(normalized)
  }
  return cards
}

/** Merge parsed cards into the existing deck, keeping one entry per note. */
function mergeCards(existing, incoming) {
  let cards = existing
  for (const card of incoming) {
    let at = -1
    for (let index = 0; index < cards.length; index += 1) {
      if (cards[index].id === card.id) {
        at = index
        break
      }
    }
    if (at < 0) {
      cards = cards.concat([card])
      continue
    }
    const current = cards[at]
    if (
      current.seq === card.seq &&
      current.title === card.title &&
      current.titleAlt === card.titleAlt &&
      current.original === card.original &&
      current.sourceText === card.sourceText &&
      current.corrected === card.corrected &&
      current.rule === card.rule &&
      current.example === card.example
    ) {
      continue
    }
    const next = cards.slice()
    next.splice(at, 1)
    next.push(card)
    cards = next
  }
  if (cards.length > MAX_CARDS) cards = cards.slice(cards.length - MAX_CARDS)
  return cards
}

// ── Capture tool ─────────────────────────────────────────────
//
// The main model reasons before it writes any text, so a card that waits for
// the reply can arrive minutes late. `english_cards_capture` lets the model
// record the cards as its first action: it passes the corrections it already
// found, the tool normalizes them, and the result's presentation metadata is
// folded back into this projection, so the deck above the composer fills in
// while the main turn is still working.

/** Model-facing tool that records cards before the main reply is written. */
export const CAPTURE_TOOL = 'english_cards_capture'

/** Presentation-metadata key carrying captured cards on a `tool/result`. */
export const CAPTURE_META_KEY = 'englishCards'

/** Trim and bound one model-authored field. */
function cleanField(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/^\s+|\s+$/g, '').slice(0, max)
}

/**
 * Normalize one captured card into the deck's card shape.
 * The fast model returns raw fields; emphasis markers in `corrected` are split
 * into the same highlight segments the reply parser produces, so both origins
 * dedupe on one id.
 * @param {unknown} item - one card from the capture payload.
 * @returns {object | null} deck card, or null when the item is unusable.
 */
export function captureCard(item) {
  if (item === null || typeof item !== 'object') return null
  // `title` carries the native pattern and an optional `· English term`, the
  // same convention the reply parser reads. Splitting here keeps capture and
  // fallback cards identical and stops the term from being stored twice.
  // Cards captured before the split still arrive with a separate titleAlt.
  const titleParts = cleanField(item.title, 500).split(/\s*·\s*/)
  const title = (titleParts.shift() ?? '').trim().slice(0, 200)
  const titleAlt = (titleParts.join(' · ').trim() || cleanField(item.titleAlt, 300)).slice(0, 300)
  const originalRaw = cleanField(item.original, 1000)
  const correctedRaw = cleanField(item.corrected, 1000)
  const sourceTextRaw = cleanField(item.sourceText, 1000) || originalRaw
  if (title.length === 0 || originalRaw.length === 0 || correctedRaw.length === 0) return null
  const originalParts = textSegments(originalRaw)
  const correctedParts = textSegments(emphasizeChanges(correctedRaw, originalRaw))
  const corrected = correctedFromSegments(correctedParts)
  const ruleParts = textSegments(cleanField(item.rule, 1000))
  const exampleParts = textSegments(cleanField(item.example, 1000))
  return splitCardSource({
    id: `${title.toLowerCase()}::${corrected.toLowerCase()}`,
    title,
    titleAlt,
    original: plainFromSegments(originalParts),
    originalParts,
    sourceText: sourceTextRaw,
    corrected,
    correctedParts,
    rule: plainFromSegments(ruleParts),
    ruleParts,
    example: plainFromSegments(exampleParts),
    exampleParts,
    seq: 0,
  })
}

/**
 * Normalize a list of raw card fields into the shape the tool declares.
 * @param {unknown} list - candidate cards.
 * @returns {Array<object>} every usable card, in the order given.
 */
export function normalizeCardList(list) {
  if (!Array.isArray(list)) return []
  const cards = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const card = {
      title: cleanField(item.title, 500),
      original: cleanField(item.original, 1000),
      sourceText: cleanField(item.sourceText, 1000),
      corrected: cleanField(item.corrected, 1000),
      rule: cleanField(item.rule, 1000),
      example: cleanField(item.example, 1000),
    }
    if (card.title.length === 0 || card.original.length === 0 || card.corrected.length === 0) continue
    cards.push(card)
  }
  return cards
}

/** Tool definition registered wherever the host provides `tools`. */
export function captureToolDefinition() {
  return {
    name: CAPTURE_TOOL,
    description:
      'Write English cards for the message the user just wrote into the deck above the composer. Check the message for English grammar mistakes before you handle the request, and call this FIRST — before the plan, before any other tool call — as soon as you find one, so the learner can read the cards while the work is still running. Call it once on every English message of the conversation, not just the first one; if the message has nothing worth teaching, do not call this tool at all. Pass the corrections you found in `cards`; the deck shows them immediately, so do not repeat them in your reply. In each `corrected` sentence, wrap removed words in ~~double tildes~~ and replacement words in **double asterisks**.',
    parameters: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          description:
            'The corrections you found, one entry per issue, in the order they appear.',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description:
                  'Short pattern name in the learner’s native language, optionally followed by “ · ” and the English grammar term, e.g. 主谓一致 · Subject–verb agreement.',
              },
              sourceText: {
                type: 'string',
                description:
                  'The self-complete source sentence or clause this correction belongs to, exactly as the learner wrote it. Cards correcting the same source share this value; independent sentences use different values. Defaults to original when omitted.',
              },
              original: {
                type: 'string',
                description: 'The learner’s sentence, exactly as written.',
              },
              corrected: {
                type: 'string',
                description:
                  'The full sourceText with removed words wrapped in ~~double tildes~~ and replacement words wrapped in **double asterisks**, so the deck can strike the original in red and highlight the correction in green. When several cards share one sourceText, every card carries all of that source’s corrections. Unchanged words stay unmarked.',
              },
              rule: {
                type: 'string',
                description:
                  'One-sentence explanation of the rule, in the learner’s native language.',
              },
              example: {
                type: 'string',
                description: 'One short English sentence that shows the correction in use.',
              },
            },
            required: ['title', 'original', 'corrected'],
            additionalProperties: false,
          },
        },
      },
      required: ['cards'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          reason: { type: 'string' },
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                sourceText: { type: 'string' },
                original: { type: 'string' },
                corrected: { type: 'string' },
                rule: { type: 'string' },
                example: { type: 'string' },
              },
              required: ['title', 'original', 'corrected'],
              additionalProperties: false,
            },
          },
        },
        required: ['ok', 'cards'],
        additionalProperties: false,
      },
      render(_args, value) {
        if (value.ok !== true) {
          const reason = typeof value.reason === 'string' && value.reason.length > 0
            ? ` (${value.reason})`
            : ''
          return [
            {
              type: 'text',
              text: [
                `Card capture failed${reason}. Write the English note yourself at the end of the reply, one note per issue:`,
                '',
                '**English note — [native pattern] · [English grammar term]**',
                '“[Full corrected sentence with ~~removed words~~ and **corrected words**].”',
                '[Rule label, e.g. 规则：][one-sentence explanation in the learner’s native language]',
                '[Example label, e.g. 例句：]“[short English example].”',
                '',
                'Keep the title and the rule in the learner’s native language. Strike only the removed words and bold only their replacements.',
              ].join('\n'),
            },
          ]
        }
        if (value.cards.length === 0) {
          return [{ type: 'text', text: 'No English corrections worth a card in that message.' }]
        }
        return [
          {
            type: 'text',
            text: `Captured ${value.cards.length} English card${value.cards.length === 1 ? '' : 's'} for the deck. Continue with the requested work; do not repeat the cards in your reply.`,
          },
        ]
      },
      presentationMeta(_args, value) {
        return value.ok === true && value.cards.length > 0
          ? { [CAPTURE_META_KEY]: value.cards }
          : {}
      },
    },
    async execute(args) {
      // The model passes the corrections it already found in the message, so
      // one call writes the deck with no second model call anywhere.
      return { ok: true, cards: normalizeCardList(args?.cards) }
    },
  }
}

/** Stable client view per state, so source-only folds publish nothing. */
const VIEW_CACHE = new WeakMap()

/** Source groups depend only on the cards array, which turn folds leave alone. */
const GROUPS_CACHE = new WeakMap()

function groupsOfState(cards) {
  let groups = GROUPS_CACHE.get(cards)
  if (groups === undefined) {
    groups = groupCards(cards)
    GROUPS_CACHE.set(cards, groups)
  }
  return groups
}

/**
 * Return the identity-stable wire value for one state.
 * The current turn travels with the cards so the client can tell whether the
 * newest cards belong to the message the user just sent.
 */
function viewOf(state) {
  let view = VIEW_CACHE.get(state)
  if (view === undefined) {
    view = {
      cards: state.cards,
      groups: groupsOfState(state.cards),
      turn: typeof state.turn === 'number' ? state.turn : -1,
    }
    VIEW_CACHE.set(state, view)
  }
  return view
}

/**
 * Pure fold step for the `englishLearningCards` projection.
 * Tracks the current turn and latest user message so each card can point back
 * to the conversation turn where the note was requested.
 * Returns the same state reference for events that change nothing.
 */
export function applyEnglishLearningCards(state, event) {
  if (event === null || typeof event !== 'object') return state

  if (event.type === 'turn/start') {
    const turn = typeof event.data?.turn === 'number' ? event.data.turn : null
    return state.turn === turn ? state : { ...state, turn }
  }

  if (event.type === 'user/message') {
    const data = event.data
    if (data === null || typeof data !== 'object') return state
    return {
      ...state,
      lastUser: {
        messageId: typeof data.id === 'string' ? data.id : '',
        seq: event.seq,
        turn: state.turn,
      },
    }
  }

  if (event.type === 'tool/result') {
    const items = event.data?.meta?.[CAPTURE_META_KEY]
    if (!Array.isArray(items) || items.length === 0) return state
    const lastUser = state.lastUser ?? null
    const source = {
      messageId: lastUser !== null ? lastUser.messageId : '',
      userSeq: lastUser !== null ? lastUser.seq : -1,
      turn:
        typeof event.data?.turn === 'number'
          ? event.data.turn
          : lastUser !== null && typeof lastUser.turn === 'number'
            ? lastUser.turn
            : -1,
    }
    const incoming = []
    for (const item of items) {
      const card = captureCard(item)
      if (card !== null) incoming.push({ ...card, origin: 'capture', seq: event.seq, source })
    }
    if (incoming.length === 0) return state
    const cards = mergeCards(state.cards, incoming)
    return cards === state.cards ? state : { ...state, cards }
  }

  if (event.type !== 'assistant/message') return state
  const data = event.data
  if (data === null || typeof data !== 'object') return state
  const text = textOfMessage(data.message)
  if (text.length === 0) return state
  const parsed = parseEnglishNotes(text, event.seq)
  if (parsed.length === 0) return state

  const lastUser = state.lastUser ?? null
  const source = {
    messageId: lastUser !== null ? lastUser.messageId : '',
    userSeq: lastUser !== null ? lastUser.seq : -1,
    turn:
      typeof data.turn === 'number'
        ? data.turn
        : lastUser !== null && typeof lastUser.turn === 'number'
          ? lastUser.turn
          : -1,
  }
  const cards = mergeCards(
    state.cards,
    parsed.map((card) => ({ ...card, source })),
  )
  return cards === state.cards ? state : { ...state, cards }
}

/** Session projection unit read by the Web dock through `useProjection`. */
export const englishLearningCardsProjection = {
  key: PROJECTION_KEY,
  stateSchema: PASSTHROUGH_SCHEMA,
  stateVersion: 7,
  init: () => ({ cards: [], lastUser: null, turn: null }),
  apply: applyEnglishLearningCards,
  wire: {
    view: viewOf,
    viewSchema: PASSTHROUGH_SCHEMA,
  },
}

/** Rebuild the server's `~~removed~~` / `**replacement**` markup from parts. */
export function markupFromParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return ''
  let out = ''
  let open = ''
  for (const part of parts) {
    if (part === null || typeof part !== 'object') continue
    if (typeof part.text !== 'string' || part.text.length === 0) continue
    const next = part.strike === true ? '~~' : part.strong === true ? '**' : ''
    if (next !== open) {
      if (open.length > 0) out += open
      if (next.length > 0) out += next
      open = next
    }
    out += part.text
  }
  if (open.length > 0) out += open
  return out
}

/**
 * Turn one capture's cards into the sentences the Grammar server stores.
 * The server groups cards under one self-complete corrected sentence, so the
 * deck's own source groups are the right unit.
 */
export function sentencesFromCaptured(cards) {
  const deckCards = []
  for (const card of Array.isArray(cards) ? cards : []) {
    const converted = captureCard(card)
    if (converted !== null) deckCards.push(converted)
  }
  return groupCards(deckCards).map((group) => ({
    corrected: markupFromParts(group.correctedParts) || group.corrected,
    source_text: group.sourceText || group.corrected,
    // The server accepts at most ten cards per sentence and 255-char titles.
    cards: group.cards
      .slice(0, 10)
      .map((card) => ({
        title: [card.title, card.titleAlt]
          .filter((part) => typeof part === 'string' && part.length > 0)
          .join(' · ')
          .slice(0, 255),
        rule: typeof card.rule === 'string' ? card.rule : '',
        example: typeof card.example === 'string' ? card.example : '',
      }))
      .filter((card) => card.title.length > 0),
  })).filter((sentence) => sentence.corrected.length > 0 && sentence.cards.length > 0)
}

/** Hard dependency: the projection registry must exist for this half to run. */
export const inject = ['sessionProjections']

/**
 * Register the projection and the capture tool once per profile composition.
 * `SKILL.md` stays in the repository as a portable spec for agents that cannot
 * register a tool (Claude Code, Codex); DeepSeek Harness does not load it,
 * because the prompt section already carries the reminder and the tool schema
 * carries the authoring rules.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.sessionProjections.register(englishLearningCardsProjection),
    'dsh-english-cards: session projection',
  )

  // Cloud sync is off until the learner turns it on in the card panel. The
  // service keeps its own outbox so a capture never waits for the network.
  const sync = createSyncService()
  ctx.effect(
    () => {
      sync.start()
      return () => sync.dispose()
    },
    'dsh-english-cards: cloud sync',
  )

  // The panel reads and writes sync settings through this exact host route.
  // It is authenticated by the browser connection, like every /api request.
  ctx.inject(['connection'], (connectionCtx) => {
    try {
      connectionCtx.connection.fetch.register({
        path: '/api/dsh-english-cards/sync',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => sync.handleRequest(request),
      })
    } catch (error) {
      console.warn('dsh-english-cards: sync route unavailable:', error?.message ?? error)
    }
  })

  // Offer the capture tool wherever the host can register tools. The tool is
  // pure: the model passes the cards it already found, so nothing here calls
  // a model or reads the session.
  ctx.inject(['tools'], (toolCtx) => {
    try {
      const definition = captureToolDefinition()
      const execute = definition.execute
      definition.execute = async (args) => {
        const result = await execute(args)
        try {
          if (result?.ok === true && Array.isArray(result.cards) && result.cards.length > 0) {
            sync.enqueue(sentencesFromCaptured(result.cards))
          }
        } catch (error) {
          console.warn('dsh-english-cards: sync enqueue failed:', error?.message ?? error)
        }
        return result
      }
      toolCtx.tools.register(definition)
    } catch (error) {
      console.warn('dsh-english-cards: capture tool unavailable:', error?.message ?? error)
    }
  })

  // Keep the capture habit in front of the model on every step. A skill has to
  // be loaded before its instructions matter; a prompt section is already in
  // context, so the reminder survives a turn where the model never loads it.
  ctx.inject(['systemPrompt'], (promptCtx) => {
    const prompt = promptCtx.systemPrompt
    if (typeof prompt?.section !== 'function' ||
      typeof prompt.getSectionOrder !== 'function') {
      return
    }
    try {
      prompt.section({
        name: 'dsh-english-cards:reminder',
        // Just before the deployment persona suffix: late enough to stay
        // salient after the tool documentation.
        order: prompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') - 1,
        text: 'Before handling the user request, scan their English for clear grammar errors and call english_cards_capture first when there are any. Do not skip this check for short or casual messages. Write card titles and rules in the learner’s native language — the language they use outside English practice — and keep the corrected sentence and example in English.',
        interpolate: false,
      })
    } catch (error) {
      console.warn('dsh-english-cards: prompt reminder unavailable:', error?.message ?? error)
    }
  })
}
