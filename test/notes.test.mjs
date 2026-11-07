import assert from 'node:assert/strict'
import {
  CAPTURE_META_KEY,
  CAPTURE_TOOL,
  MAX_CARDS,
  apply,
  applyEnglishLearningCards,
  captureCard,
  captureToolDefinition,
  emphasizeChanges,
  englishLearningCardsProjection,
  groupCards,
  parseEnglishNotes,
  textOfMessage,
  textSegments,
} from '../index.js'

const note = [
  'Here is a cleaner version.',
  '',
  '---',
  '',
  '**English note — Present perfect**  ',
  '“I have finished the report.” Use have/has + past participle for a finished action whose time is not stated. For example: “She has just left.”',
].join('\n')

const parsed = parseEnglishNotes(note, 12)
assert.equal(parsed.length, 1)
assert.deepEqual(
  {
    title: parsed[0].title,
    titleAlt: parsed[0].titleAlt,
    corrected: parsed[0].corrected,
    rule: parsed[0].rule,
    example: parsed[0].example,
    seq: parsed[0].seq,
  },
  {
    title: 'Present perfect',
    titleAlt: '',
    corrected: 'I have finished the report.',
    rule: 'Use have/has + past participle for a finished action whose time is not stated',
    example: 'She has just left.',
    seq: 12,
  },
)
assert.equal(parsed[0].id, 'present perfect::i have finished the report.')
assert.deepEqual(parsed[0].correctedParts, [{ text: 'I have finished the report.', strong: false, strike: false }])

assert.deepEqual(parseEnglishNotes('No note here.', 1), [])
assert.deepEqual(parseEnglishNotes('**English note — Past tense**  ', 1), [])

const two = [
  '**English note — Articles**  ',
  '“I saw a elephant.” Use “an” before a vowel sound. For example: “an apple”.',
  '',
  '**English note - Modal verbs**  ',
  '“You should to rest.” Use a bare verb after a modal. For example: “You should rest.”',
].join('\n')

const twoParsed = parseEnglishNotes(two, 3)
assert.equal(twoParsed.length, 2)
assert.equal(twoParsed[0].title, 'Articles')
assert.equal(twoParsed[0].corrected, 'I saw a elephant.')
assert.equal(twoParsed[0].example, 'an apple')
assert.equal(twoParsed[1].title, 'Modal verbs')
assert.equal(twoParsed[1].rule, 'Use a bare verb after a modal')

// Cards lead the reply: the note comes first, then the task answer.
const leading = [
  '**English note — 主谓一致 · Subject–verb agreement**  ',
  '原文：“My plugin and skill is working.”  ',
  '“My plugin and skill **are** working.”  ',
  '规则：由 and 连接的两个主语是复数，be 动词用 are。  ',
  '例句：“My plugin and skill are working.”',
  '',
  'Now I will update the exporter and run the tests.',
].join('\n')

const leadingParsed = parseEnglishNotes(leading, 7)
assert.equal(leadingParsed.length, 1)
assert.equal(leadingParsed[0].title, '主谓一致')
assert.equal(leadingParsed[0].corrected, 'My plugin and skill are working.')
assert.equal(leadingParsed[0].rule, '由 and 连接的两个主语是复数，be 动词用 are')
assert.equal(leadingParsed[0].example, 'My plugin and skill are working.')
assert.equal(leadingParsed[0].original, 'My plugin and skill is working.')

// Two cards first, then the answer: both parse, the answer is not a card.
const leadingTwo = [
  '**English note — Articles**  ',
  '“I saw a elephant.” Use “an” before a vowel sound. For example: “an apple”.',
  '',
  '**English note — Modal verbs**  ',
  '“You should to rest.” Use a bare verb after a modal. For example: “You should rest”.',
  '',
  'The build now passes.',
].join('\n')

const leadingTwoParsed = parseEnglishNotes(leadingTwo, 8)
assert.equal(leadingTwoParsed.length, 2)
assert.equal(leadingTwoParsed[1].rule, 'Use a bare verb after a modal')
assert.equal(leadingTwoParsed[1].example, 'You should rest')

// Bold spans become highlight segments.
assert.deepEqual(textSegments('I **am** here.'), [
  { text: 'I ', strong: false, strike: false },
  { text: 'am', strong: true, strike: false },
  { text: ' here.', strong: false, strike: false },
])
assert.deepEqual(textSegments('plain'), [{ text: 'plain', strong: false, strike: false }])
// Removed words and replacements can share one sentence.
assert.deepEqual(textSegments('I ~~is~~ **am** here.'), [
  { text: 'I ', strong: false, strike: false },
  { text: 'is', strong: false, strike: true },
  { text: ' ', strong: false, strike: false },
  { text: 'am', strong: true, strike: false },
  { text: ' here.', strong: false, strike: false },
])

// Native title + native rule label + bold correction (Chinese example marker).
const bilingual = [
  '**English note — 主谓一致 · Subject–verb agreement**  ',
  '“I want to test whether my new plugin and skill **are working**.”  ',
  '规则：由 and 连接的两个主语是复数，be 动词用 are；“is work” 不成立。  ',
  '例句：“My plugin and skill are working.”',
].join('\n')

const bilingualCard = parseEnglishNotes(bilingual, 5)[0]
assert.equal(bilingualCard.title, '主谓一致')
assert.equal(bilingualCard.titleAlt, 'Subject–verb agreement')
assert.equal(bilingualCard.corrected, 'I want to test whether my new plugin and skill are working.')
assert.deepEqual(bilingualCard.correctedParts, [
  { text: 'I want to test whether my new plugin and skill ', strong: false, strike: false },
  { text: 'are working', strong: true, strike: false },
  { text: '.', strong: false, strike: false },
])
assert.equal(bilingualCard.rule, '由 and 连接的两个主语是复数，be 动词用 are；“is work” 不成立')
assert.equal(bilingualCard.example, 'My plugin and skill are working.')

// The current note format puts both sides of the change in the corrected
// sentence and no longer emits a separate original line.
const combined = [
  '**English note — 主谓一致 · Subject–verb agreement**  ',
  '“My plugin and skill ~~is work~~ **are working**.”  ',
  '规则：由 and 连接的两个主语是复数，be 动词用 are。  ',
  '例句：“My plugin and skill are working.”',
].join('\n')

const combinedCard = parseEnglishNotes(combined, 8)[0]
assert.equal(combinedCard.original, '')
assert.equal(combinedCard.sourceText, 'My plugin and skill is work.')
assert.equal(combinedCard.corrected, 'My plugin and skill are working.')
assert.deepEqual(combinedCard.correctedParts, [
  { text: 'My plugin and skill ', strong: false, strike: false },
  { text: 'is work', strong: false, strike: true },
  { text: ' ', strong: false, strike: false },
  { text: 'are working', strong: true, strike: false },
  { text: '.', strong: false, strike: false },
])
assert.equal(combinedCard.rule, '由 and 连接的两个主语是复数，be 动词用 are')
assert.equal(combinedCard.example, 'My plugin and skill are working.')

// Fallback notes without a separate original line still recover the source
// sentence from their markup, so two corrections from one sentence group.
const fallbackPair = parseEnglishNotes(
  [
    '**English note — 主谓一致 · Subject–verb agreement**  ',
    '“I ~~has~~ **have** a apple.”  ',
    '规则：主语 I 用 have。',
    '',
    '**English note — 冠词 · Article before a vowel sound**  ',
    '“I has ~~a~~ **an** apple.”  ',
    '规则：元音音素前用 an。',
  ].join('\n'),
  8,
)
assert.equal(fallbackPair.length, 2)
assert.equal(fallbackPair[0].sourceText, 'I has a apple.')
assert.equal(fallbackPair[1].sourceText, 'I has a apple.')
const fallbackGroup = groupCards(fallbackPair)
assert.equal(fallbackGroup.length, 1)
assert.equal(fallbackGroup[0].cards.length, 2)
assert.equal(fallbackGroup[0].corrected, 'I have an apple.')
assert.deepEqual(
  fallbackGroup[0].correctedParts.filter((part) => part.strike).map((part) => part.text),
  ['has a'],
)
assert.deepEqual(
  fallbackGroup[0].correctedParts.filter((part) => part.strong).map((part) => part.text),
  ['have an'],
)

// Japanese labels and the English example marker both resolve.
const japanese = [
  '**English note — 時制 · Tense**  ',
  '“I **went** there.”  ',
  'ルール：過去の出来事には過去形を使います。  ',
  '例文：“I went there yesterday.”',
].join('\n')

const japaneseCard = parseEnglishNotes(japanese, 6)[0]
assert.equal(japaneseCard.title, '時制')
assert.equal(japaneseCard.titleAlt, 'Tense')
assert.equal(japaneseCard.rule, '過去の出来事には過去形を使います')
assert.equal(japaneseCard.example, 'I went there yesterday.')
assert.deepEqual(japaneseCard.correctedParts[1], { text: 'went', strong: true, strike: false })

const englishMarker = [
  '**English note — Agreement · Subject–verb agreement**  ',
  '“They **are** ready.”  ',
  'Rule: Use a plural verb with a plural subject.  ',
  'For example: “They are ready.”',
].join('\n')
const englishCard = parseEnglishNotes(englishMarker, 7)[0]
assert.equal(englishCard.rule, 'Use a plural verb with a plural subject')
assert.equal(englishCard.example, 'They are ready.')

// The original sentence is kept separate from the corrected quote.
const withOriginal = [
  '**English note — 主谓一致 · Subject–verb agreement**  ',
  '原文：“I want to test whether my new test and skill is work.”  ',
  '“I want to test whether my new plugin and skill **are working**.”  ',
  '规则：由 and 连接的两个主语是复数，be 动词用 are。  ',
  'For example: “My plugin and skill are working.”',
].join('\n')
const originalCard = parseEnglishNotes(withOriginal, 4)[0]
assert.equal(originalCard.original, 'I want to test whether my new test and skill is work.')
assert.equal(originalCard.sourceText, originalCard.original)
assert.equal(originalCard.corrected, 'I want to test whether my new plugin and skill are working.')
assert.deepEqual(originalCard.originalParts, [
  { text: 'I want to test whether my new test and skill is work.', strong: false, strike: false },
])
assert.equal(originalCard.rule, '由 and 连接的两个主语是复数，be 动词用 are')

// A quoted format template is documentation, never a collected card.
const template = [
  '**English note — [native pattern] · [English grammar term]**  ',
  '原文：“[original sentence]”  ',
  '“[Corrected English sentence with **changed words** bold].”  ',
  '规则：[one-sentence explanation in the learner’s native language]  ',
  'For example: “[short English example].”',
].join('\n')
assert.deepEqual(parseEnglishNotes(template, 8), [])

// The current combined-markup template is documentation too, even when its
// title looks like a real pattern.
const combinedTemplate = [
  '**English note — 主谓一致 · Subject–verb agreement**  ',
  '“[Full corrected sentence with ~~removed words~~ and **corrected words**].”  ',
  '规则：[one-sentence explanation in the learner’s native language]',
].join('\n')
assert.deepEqual(parseEnglishNotes(combinedTemplate, 8), [])

// Fenced examples are ignored even when the note text itself is real.
const fenced = ['```markdown', bilingual, '```'].join('\n')
assert.deepEqual(parseEnglishNotes(fenced, 9), [])

assert.equal(
  textOfMessage({ content: [{ type: 'text', text: 'a' }, { type: 'tool-call' }, { type: 'text', text: 'b' }] }),
  'a\nb',
)
assert.equal(textOfMessage({ content: 'plain' }), 'plain')
assert.equal(textOfMessage(null), '')

const initial = englishLearningCardsProjection.init({}, 0)
assert.deepEqual(initial, { cards: [], lastUser: null, turn: null })

const turnStart = { type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } }
const afterTurn = applyEnglishLearningCards(initial, turnStart)
assert.equal(afterTurn.turn, 1)
assert.equal(afterTurn.cards, initial.cards)

const userEvent = {
  type: 'user/message',
  seq: 1,
  time: 0,
  data: { id: 'msg-1', content: [{ type: 'text', text: 'I want to test my plugin.' }] },
}
const afterUser = applyEnglishLearningCards(afterTurn, userEvent)
assert.equal(afterUser.cards, initial.cards)
assert.equal(afterUser.lastUser.seq, 1)
assert.equal(afterUser.lastUser.messageId, 'msg-1')
assert.equal(afterUser.lastUser.turn, 1)

const plainReply = {
  type: 'assistant/message',
  seq: 2,
  time: 0,
  data: { turn: 1, message: { content: [{ type: 'text', text: 'Just an answer.' }] } },
}
assert.equal(applyEnglishLearningCards(afterUser, plainReply), afterUser)

const noteReply = {
  type: 'assistant/message',
  seq: 3,
  time: 0,
  data: { turn: 1, message: { content: [{ type: 'text', text: note }] } },
}
const withCard = applyEnglishLearningCards(afterUser, noteReply)
assert.equal(withCard.cards.length, 1)
assert.equal(withCard.cards[0].seq, 3)
assert.deepEqual(withCard.cards[0].source, { messageId: 'msg-1', userSeq: 1, turn: 1 })

const replay = applyEnglishLearningCards(withCard, noteReply)
assert.equal(replay, withCard)

const laterReply = { ...noteReply, seq: 9, data: { ...noteReply.data, turn: 2 } }
const updated = applyEnglishLearningCards(withCard, laterReply)
assert.equal(updated.cards.length, 1)
assert.equal(updated.cards[0].seq, 9)
assert.equal(updated.cards[0].source.turn, 2)

let capped = { cards: [], lastUser: null, turn: null }
for (let index = 0; index < MAX_CARDS + 5; index += 1) {
  capped = applyEnglishLearningCards(capped, {
    type: 'assistant/message',
    seq: 100 + index,
    time: 0,
    data: {
      turn: index + 1,
      message: {
        content: [
          {
            type: 'text',
            text: `**English note — Pattern ${index}**  “Example sentence ${index}.” Use rule ${index}. For example: “Example ${index}.”`,
          },
        ],
      },
    },
  })
}
assert.equal(capped.cards.length, MAX_CARDS)
assert.equal(capped.cards[MAX_CARDS - 1].title, `Pattern ${MAX_CARDS + 4}`)

assert.equal(englishLearningCardsProjection.key, 'englishLearningCards')
assert.equal(englishLearningCardsProjection.stateVersion, 7)
const viewA = englishLearningCardsProjection.wire.view(withCard)
const viewB = englishLearningCardsProjection.wire.view(withCard)
assert.equal(viewA, viewB)
assert.equal(viewA.cards, withCard.cards)
assert.equal(viewA.groups.length, 1)
assert.equal(viewA.groups[0].cards.length, 1)

// ── Fast capture tool ────────────────────────────────────────────

const capturedCard = captureCard({
  title: '主谓一致',
  titleAlt: 'Subject–verb agreement',
  original: 'My plugin and skill is working.',
  corrected: 'My plugin and skill **are** working.',
  rule: '由 and 连接的两个主语是复数，be 动词用 are。',
  example: 'My tests and docs are ready.',
})
assert.equal(capturedCard.title, '主谓一致')
assert.equal(capturedCard.titleAlt, 'Subject–verb agreement')

// `title` may carry the English term after `·` — the same convention the reply
// parser reads — so capture and fallback cards end up with one shape.
const combinedTitle = captureCard({
  title: '主谓一致 · Subject–verb agreement',
  original: 'My plugin and skill is working.',
  corrected: 'My plugin and skill **are** working.',
})
assert.equal(combinedTitle.title, '主谓一致')
assert.equal(combinedTitle.titleAlt, 'Subject–verb agreement')

// A card that repeats the term in both places does not store it twice.
const dedupedTitle = captureCard({
  title: '冠词 · Article',
  titleAlt: 'Article',
  original: 'I saw a elephant.',
  corrected: 'I saw **an** elephant.',
})
assert.equal(dedupedTitle.title, '冠词')
assert.equal(dedupedTitle.titleAlt, 'Article')
assert.equal(capturedCard.corrected, 'My plugin and skill are working.')
assert.deepEqual(capturedCard.correctedParts, [
  { text: 'My plugin and skill ', strong: false, strike: false },
  { text: 'is', strong: false, strike: true },
  { text: ' ', strong: false, strike: false },
  { text: 'are', strong: true, strike: false },
  { text: ' working.', strong: false, strike: false },
])
assert.equal(capturedCard.rule, '由 and 连接的两个主语是复数，be 动词用 are。')
assert.equal(capturedCard.example, 'My tests and docs are ready.')
assert.equal(captureCard({ title: 'x' }), null)
assert.equal(captureCard(null), null)

// An unmarked card still gets both sides of the change marked, so the deck
// highlights a capture that arrives without model-authored emphasis.
assert.equal(
  emphasizeChanges('can we use a simple function tool', 'can we use simple function tool'),
  'can we use **a** simple function tool',
)
assert.equal(
  emphasizeChanges('only Codex supports it', 'only codex support it'),
  'only ~~codex support~~ **Codex supports** it',
)
assert.equal(emphasizeChanges('Nothing changed.', 'Nothing changed.'), 'Nothing changed.')
assert.equal(emphasizeChanges('Already **marked**.', 'Already plain.'), 'Already ~~plain~~ **marked**.')
assert.equal(
  emphasizeChanges('A completely different sentence now.', 'The learner wrote something else.'),
  'A completely different sentence now.',
)
// A pure deletion gets strikethrough without a bold span.
assert.equal(emphasizeChanges('I like it.', 'I really like it.'), 'I ~~really~~ like it.')
// Model-authored markup that already contains strikethrough is trusted as-is.
assert.equal(
  emphasizeChanges('I ~~is~~ **am** ready.', 'I is ready.'),
  'I ~~is~~ **am** ready.',
)

const unmarkedCard = captureCard({
  title: 'Articles',
  original: 'can we use simple function tool',
  corrected: 'can we use a simple function tool',
})
assert.deepEqual(unmarkedCard.correctedParts, [
  { text: 'can we use ', strong: false, strike: false },
  { text: 'a', strong: true, strike: false },
  { text: ' simple function tool', strong: false, strike: false },
])

// The reply parser derives both spans when a note carries an original but no
// markup of its own.
const unmarkedNote = parseEnglishNotes(
  [
    '**English note — 主谓一致 · Subject–verb agreement**  ',
    '原文：“My plugin and skill is working.”  ',
    '“My plugin and skill are working.”',
  ].join('\n'),
  3,
)[0]
assert.deepEqual(unmarkedNote.correctedParts, [
  { text: 'My plugin and skill ', strong: false, strike: false },
  { text: 'is', strong: false, strike: true },
  { text: ' ', strong: false, strike: false },
  { text: 'are', strong: true, strike: false },
  { text: ' working.', strong: false, strike: false },
])
assert.equal(unmarkedNote.corrected, 'My plugin and skill are working.')

// ── Grouping cards by source text ──────────────────────────────
const sharedSource =
  '"dsh" is a name convention for deepseek harness plugin, no need to show it, replace "DSH 英语卡片" to 英语卡片'
const namingCard = captureCard({
  title: '固定搭配',
  titleAlt: 'Collocation',
  sourceText: sharedSource,
  original: sharedSource,
  corrected: sharedSource.replace('name convention', 'naming convention'),
  rule: 'rule naming',
  example: 'example naming',
})
const replaceCard = captureCard({
  title: '介词搭配',
  titleAlt: 'Preposition',
  sourceText: sharedSource,
  original: sharedSource,
  corrected: sharedSource.replace(' to 英语卡片', ' with 英语卡片'),
  rule: 'rule replace',
  example: 'example replace',
})
const pluralCard = captureCard({
  title: '名词单复数',
  titleAlt: 'Plural',
  sourceText: sharedSource,
  original: sharedSource,
  corrected: sharedSource.replace('plugin,', 'plugins,'),
  rule: 'rule plural',
  example: 'example plural',
})
const grouped = groupCards([namingCard, replaceCard, pluralCard])
assert.equal(grouped.length, 1)
assert.equal(grouped[0].cards.length, 3)
assert.equal(grouped[0].sourceText, sharedSource)
assert.equal(
  grouped[0].corrected,
  '"dsh" is a naming convention for deepseek harness plugins, no need to show it, replace "DSH 英语卡片" with 英语卡片',
)
assert.equal(grouped[0].correctedParts.filter((part) => part.strike).length, 3)
assert.equal(grouped[0].correctedParts.filter((part) => part.strong).length, 3)

// Independent sentences in one message stay in separate groups.
const independent = groupCards([
  captureCard({
    title: 'A',
    sourceText: 'I has a apple.',
    original: 'I has a apple.',
    corrected: 'I have an apple.',
  }),
  captureCard({
    title: 'B',
    sourceText: 'She go home.',
    original: 'She go home.',
    corrected: 'She goes home.',
  }),
])
assert.equal(independent.length, 2)
assert.equal(independent[0].cards.length, 1)

// Without sourceText, a multi-sentence original is narrowed to the sentence
// containing each correction, so independent sentences stay separate.
const splitCards = [
  captureCard({
    title: '主谓一致',
    original: 'I has a apple. She go home.',
    corrected: 'I have a apple. She go home.',
  }),
  captureCard({
    title: '时态',
    original: 'I has a apple. She go home.',
    corrected: 'I has a apple. She goes home.',
  }),
]
assert.equal(splitCards[0].sourceText, 'I has a apple.')
assert.equal(splitCards[0].corrected, 'I have a apple.')
assert.equal(splitCards[1].sourceText, 'She go home.')
assert.equal(splitCards[1].corrected, 'She goes home.')
const splitGroups = groupCards(splitCards)
assert.equal(splitGroups.length, 2)
assert.equal(splitGroups[0].cards.length, 1)
assert.equal(splitGroups[1].cards.length, 1)

// The same source text in a different user message is a different group.
const repeatedSource = {
  ...namingCard,
  source: { messageId: 'message-2', userSeq: 2, turn: 2 },
}
assert.equal(groupCards([namingCard, repeatedSource]).length, 2)

// A card without an explicit sourceText uses the learner's sentence.
const defaultSource = captureCard({
  title: 'Articles',
  original: 'A apple a day.',
  corrected: 'An apple a day.',
})
assert.equal(defaultSource.sourceText, 'A apple a day.')

// A source group with one card still exposes that card's correction.
const singleGroup = groupCards([namingCard])
assert.equal(singleGroup.length, 1)
assert.equal(singleGroup[0].cards.length, 1)
assert.ok(singleGroup[0].corrected.includes('naming'))


// A capture tool result folds into the deck with its turn source, without a
// text reply from the main model.
const captureState = englishLearningCardsProjection.init()
const captureTurnStart = { type: 'turn/start', seq: 10, time: 1, data: { turn: 7 } }
const userMessage = {
  type: 'user/message',
  seq: 11,
  time: 2,
  data: { id: 'user-1', message: { role: 'user', content: [{ type: 'text', text: 'Hello.' }] } },
}
const captured = [
  {
    title: '主谓一致',
    titleAlt: 'Subject–verb agreement',
    original: 'My plugin and skill is working.',
    corrected: 'My plugin and skill **are** working.',
    rule: '由 and 连接的两个主语是复数，be 动词用 are。',
    example: 'My tests and docs are ready.',
  },
  { title: 'Extra · Extra term', original: 'A extra one.', corrected: '**An** extra one.' },
]
const captureResult = {
  type: 'tool/result',
  seq: 12,
  time: 3,
  data: {
    turn: 7,
    step: 1,
    message: { role: 'tool', toolCallId: 'call-1', content: [{ type: 'text', text: 'Captured.' }] },
    meta: { [CAPTURE_META_KEY]: captured },
  },
}

let folded = applyEnglishLearningCards(captureState, captureTurnStart)
folded = applyEnglishLearningCards(folded, userMessage)
folded = applyEnglishLearningCards(folded, captureResult)
assert.equal(folded.cards.length, 2)
assert.equal(folded.cards[0].origin, 'capture')
assert.equal(folded.cards[0].seq, 12)
assert.equal(folded.cards[0].titleAlt, 'Subject–verb agreement')
assert.equal(folded.cards[1].title, 'Extra')
assert.equal(folded.cards[1].titleAlt, 'Extra term')
assert.deepEqual(folded.cards[0].source, { messageId: 'user-1', userSeq: 11, turn: 7 })

// The current turn travels with the cards, so a new message without cards
// stops the previous turn from looking current on the client.
const foldedView = englishLearningCardsProjection.wire.view(folded)
assert.equal(foldedView.turn, 7)
assert.equal(englishLearningCardsProjection.wire.view(folded), foldedView)
const nextTurnState = applyEnglishLearningCards(folded, {
  type: 'turn/start',
  seq: 20,
  time: 6,
  data: { turn: 8 },
})
const nextTurnView = englishLearningCardsProjection.wire.view(nextTurnState)
assert.equal(nextTurnView.turn, 8)
assert.notEqual(nextTurnView, foldedView)
assert.equal(nextTurnView.cards, foldedView.cards)


// A repeated capture is idempotent, and a foreign tool result changes nothing.
const repeated = applyEnglishLearningCards(folded, captureResult)
assert.equal(repeated, folded)
const foreign = applyEnglishLearningCards(folded, {
  type: 'tool/result',
  seq: 13,
  time: 4,
  data: { turn: 7, step: 1, message: { role: 'tool', content: [{ type: 'text', text: 'ok' }] } },
})
assert.equal(foreign, folded)

// The main model's later note for the same issue replaces the fast card instead
// of duplicating it.
const settled = applyEnglishLearningCards(folded, {
  type: 'assistant/message',
  seq: 14,
  time: 5,
  data: {
    turn: 7,
    step: 1,
    message: {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: [
            '**English note — 主谓一致 · Subject–verb agreement**  ',
            '原文：“My plugin and skill is working.”  ',
            '“My plugin and skill **are** working.”  ',
            '规则：由 and 连接的两个主语是复数，be 动词用 are。  ',
            '例句：“My tests and docs are ready.”',
          ].join('\n'),
        },
      ],
    },
  },
})
assert.equal(settled.cards.length, 2)
const merged = settled.cards.find((card) => card.title === '主谓一致')
assert.equal(merged.seq, 14)
assert.equal(merged.origin, undefined)

// The capture tool is pure: the model passes the cards it already found and
// the result travels through presentation metadata, so the deck fills in
// without waiting for the reply and without a host-side model call.
const tool = captureToolDefinition()
assert.equal(tool.name, CAPTURE_TOOL)
assert.equal(tool.name, 'english_cards_capture')
const toolResult = await tool.execute(
  {
    cards: [
      {
        title: '时态 · Past tense',
        titleAlt: 'Past tense',
        original: 'I go there yesterday.',
        corrected: 'I **went** there yesterday.',
        rule: '过去的时间状语用过去时。',
        example: 'I went there yesterday.',
      },
    ],
  },
  {},
)
assert.equal(toolResult.ok, true)
assert.equal(toolResult.cards.length, 1)
assert.equal(toolResult.cards[0].title, '时态 · Past tense')

// The input schema carries the language and title rules where the model fills
// the fields, and no longer asks for a language or a separate titleAlt.
const cardSchema = tool.parameters.properties.cards.items.properties
assert.equal(cardSchema.titleAlt, undefined)
assert.match(cardSchema.title.description, /native language/)
assert.match(cardSchema.title.description, /English grammar term/)
assert.match(cardSchema.rule.description, /native language/)
assert.equal(tool.parameters.properties.language, undefined)
assert.deepEqual(tool.parameters.required, ['cards'])
const toolMeta = tool.output.presentationMeta({}, toolResult)
assert.equal(toolMeta[CAPTURE_META_KEY].length, 1)
assert.match(tool.output.render({}, toolResult)[0].text, /Captured 1 English card/)

// No cards means the model found nothing worth teaching: the tool reports an
// empty deck instead of reaching for a model call of its own.
const empty = await tool.execute({}, {})
assert.deepEqual(empty, { ok: true, cards: [] })
assert.match(tool.output.render({}, empty)[0].text, /No English corrections/)
assert.deepEqual(tool.output.presentationMeta({}, empty), {})

// A failed capture hands the model the note format inline, so the fallback
// still parses without loading the skill.
const failed = tool.output.render({}, { ok: false, reason: 'boom' })
assert.match(failed[0].text, /Card capture failed \(boom\)/)
assert.match(failed[0].text, /English note — \[native pattern\]/)
assert.match(failed[0].text, /learner’s native language/)

// A card missing a required field is dropped rather than rendered broken.
assert.deepEqual((await tool.execute({ cards: [{ title: 'x' }] }, {})).cards, [])

// There is no card-count ceiling: a message with many issues keeps them all,
// in the order the model supplied them.
const many = Array.from({ length: 6 }, (_, index) => ({
  title: `t${index}`,
  original: `o${index}`,
  corrected: `**c${index}**`,
}))
const manyCards = (await tool.execute({ cards: many }, {})).cards
assert.equal(manyCards.length, 6)
assert.deepEqual(manyCards.map((card) => card.title), ['t0', 't1', 't2', 't3', 't4', 't5'])

// Wiring: `apply` registers the projection and the capture tool through the
// host services, and survives a host that cannot register the tool. The skill
// is documentation now, not a runtime registration.
const registeredTools = []
const registeredSections = []
let projectionRegistered = false
const fakeCtx = {
  effect(run) {
    run()
  },
  sessionProjections: {
    register() {
      projectionRegistered = true
      return () => {}
    },
  },
  inject(deps, callback) {
    if (deps.includes('tools')) {
      callback({
        tools: {
          register(tool) {
            registeredTools.push(tool)
            return () => {}
          },
        },
      })
    }
    if (deps.includes('systemPrompt')) {
      callback({
        systemPrompt: {
          section(entry) {
            registeredSections.push(entry)
            return () => {}
          },
          getSectionOrder() {
            return 0
          },
        },
      })
    }
    if (deps.includes('skills')) throw new Error('the plugin must not register a runtime skill')
  },
}
apply(fakeCtx)
assert.equal(projectionRegistered, true)
assert.equal(registeredSections.length, 1)
assert.match(registeredSections[0].text, /learner’s native language/)
assert.equal(registeredTools.length, 1)
assert.equal(registeredTools[0].name, CAPTURE_TOOL)
assert.equal(registeredTools[0].parameters.type, 'object')
assert.ok(
  registeredTools[0].parameters.properties.cards.items.properties.sourceText,
  'the capture tool should accept a sourceText',
)
assert.equal(typeof registeredTools[0].output.render, 'function')
assert.equal(typeof registeredTools[0].output.presentationMeta, 'function')

console.log('dsh-english-cards: parser and projection checks passed')
