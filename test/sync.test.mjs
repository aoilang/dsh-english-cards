import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { markupFromParts, sentencesFromCaptured } from '../index.js'
import { createSyncService, mcpEndpoint } from '../sync.js'

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isolateHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-english-cards-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  })
}

const SENTENCES = [{
  corrected: 'My skill ~~is~~ **are** ready.',
  source_text: 'My skill is ready.',
  cards: [{ title: '主谓一致', rule: '复数用 are。', example: 'They are ready.' }],
}]

test('markupFromParts rebuilds the server markers', () => {
  const parts = [
    { text: 'My skill ', strong: false, strike: false },
    { text: 'is', strong: false, strike: true },
    { text: ' ', strong: false, strike: false },
    { text: 'are', strong: true, strike: false },
    { text: ' ready.', strong: false, strike: false },
  ]
  assert.equal(markupFromParts(parts), 'My skill ~~is~~ **are** ready.')
})

test('sentencesFromCaptured groups cards under one corrected sentence', () => {
  const cards = [
    {
      title: '主谓一致 · Subject-verb agreement',
      original: 'My plugin and skill is working',
      corrected: 'My plugin and skill ~~is~~ **are** working',
      rule: '由 and 连接的两个主语是复数。',
      example: 'My tests and docs are ready.',
    },
    {
      title: '冠词 · Article',
      original: 'My plugin and skill is working',
      corrected: 'My plugin and skill ~~is~~ **are** working',
      rule: '复数名词前不加 a。',
      example: 'The plugins are ready.',
    },
  ]
  const sentences = sentencesFromCaptured(cards)
  assert.equal(sentences.length, 1)
  assert.equal(sentences[0].source_text, 'My plugin and skill is working')
  assert.equal(sentences[0].corrected, 'My plugin and skill ~~is~~ **are** working')
  assert.deepEqual(
    sentences[0].cards.map((card) => card.title),
    ['主谓一致 · Subject-verb agreement', '冠词 · Article'],
  )
})

test('mcpEndpoint accepts a base URL or the full MCP URL', () => {
  assert.equal(mcpEndpoint('https://aoilang.com'), 'https://aoilang.com/grammar/mcp/')
  assert.equal(mcpEndpoint('https://aoilang.com/'), 'https://aoilang.com/grammar/mcp/')
  assert.equal(
    mcpEndpoint('https://aoilang.com/grammar/mcp'),
    'https://aoilang.com/grammar/mcp/',
  )
})

test('sync is a no-op while disabled', (t) => {
  isolateHome(t)
  const service = createSyncService({ logger: () => {}, fetch: async () => jsonResponse({}) })
  service.start()
  t.after(() => service.dispose())
  assert.equal(service.enqueue(SENTENCES), false)
  assert.equal(service.publicState().pending, 0)
})

test('OAuth authorization stores tokens and enables sync', async (t) => {
  isolateHome(t)
  let authUrl = ''
  const requests = []
  const service = createSyncService({
    logger: () => {},
    callbackPort: 0,
    openUrl: (url) => {
      authUrl = url
    },
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init })
      const target = String(url)
      if (target.endsWith('/.well-known/oauth-authorization-server')) {
        return jsonResponse({
          authorization_endpoint: 'https://aoi.test/accounts/oauth/authorize',
          token_endpoint: 'https://aoi.test/accounts/oauth/token',
          registration_endpoint: 'https://aoi.test/accounts/oauth/register',
        })
      }
      if (target.endsWith('/.well-known/oauth-protected-resource')) {
        return jsonResponse({ resource: 'https://aoi.test/grammar/mcp' })
      }
      if (target.endsWith('/register')) {
        return jsonResponse({ client_id: 'client-1' }, 201)
      }
      if (target.endsWith('/token')) {
        return jsonResponse({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'grammar:read grammar:write',
        })
      }
      throw new Error(`unexpected request ${target}`)
    },
  })
  service.start()
  service.state.serverUrl = 'https://aoi.test'
  t.after(() => service.dispose())

  const started = service.startAuth()
  assert.equal(started.authPending, true)
  for (let attempt = 0; attempt < 50 && authUrl === ''; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.notEqual(authUrl, '')

  const authorize = new URL(authUrl)
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(authorize.searchParams.get('scope'), 'grammar:read grammar:write')
  assert.equal(authorize.searchParams.get('resource'), 'https://aoi.test/grammar/mcp')
  assert.notEqual(authorize.searchParams.get('state'), null)
  const redirectUri = authorize.searchParams.get('redirect_uri')
  assert.match(redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/)

  const callback = new URL(redirectUri)
  callback.searchParams.set('code', 'code-1')
  callback.searchParams.set('state', authorize.searchParams.get('state'))
  const response = await fetch(callback)
  assert.equal(response.status, 200)

  for (let attempt = 0; attempt < 50 && !service.publicState().enabled; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  const state = service.publicState()
  assert.equal(state.enabled, true)
  assert.equal(state.authenticated, true)
  assert.equal(state.needsAuth, false)
  assert.equal(service.state.oauth.accessToken, 'access-1')
  assert.equal(service.state.oauth.refreshToken, 'refresh-1')
  assert.equal(state.reviewUrl, 'https://aoi.test/grammar/review/')
  assert.equal(requests.some((request) => request.url.endsWith('/register')), true)
})

test('push uses the OAuth token and sends no native language', async (t) => {
  isolateHome(t)
  const requests = []
  const service = createSyncService({
    logger: () => {},
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init })
      const target = String(url)
      if (target.endsWith('/grammar/mcp/')) {
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: { structuredContent: { count: 1 } } })
      }
      throw new Error(`unexpected request ${target}`)
    },
  })
  service.start()
  t.after(() => service.dispose())
  service.state.serverUrl = 'https://aoi.test'
  service.state.oauth = {
    ...service.state.oauth,
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3_600_000,
    clientId: 'client-1',
  }
  service.state.enabled = true
  assert.equal(service.enqueue(SENTENCES), true)
  await service.flush()

  assert.equal(service.publicState().pending, 0)
  assert.equal(service.publicState().lastSyncAt > 0, true)
  const request = requests.find((entry) => entry.url.endsWith('/grammar/mcp/'))
  assert.equal(request.init.headers.authorization, 'Bearer access-1')
  const body = JSON.parse(request.init.body)
  const sentence = body.params.arguments.sentences[0]
  assert.equal(sentence.language, undefined)
  assert.equal(body.params.name, 'create_english_learning_cards')
})

test('backfill queues local history once and splits long batches', (t) => {
  isolateHome(t)
  const service = createSyncService({ logger: () => {}, fetch: async () => jsonResponse({}) })
  service.start()
  t.after(() => service.dispose())
  service.state.serverUrl = 'https://aoi.test'
  service.state.oauth = {
    ...service.state.oauth,
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3_600_000,
    clientId: 'client-1',
  }

  assert.equal(service.backfill(SENTENCES), false)
  service.state.enabled = true
  const many = Array.from({ length: 51 }, (_, index) => ({
    ...SENTENCES[0],
    source_text: `My skill is ready ${index}.`,
  }))
  assert.equal(service.backfill(many), true)
  assert.equal(service.publicState().backfilledAt > 0, true)
  assert.equal(service.publicState().pending, 2)
  assert.equal(service.backfill(SENTENCES), false)
  assert.equal(service.publicState().pending, 2)
})

test('a rejected refresh disables sync and asks for authorization', async (t) => {
  isolateHome(t)
  const service = createSyncService({
    logger: () => {},
    fetch: async (url) => {
      const target = String(url)
      if (target.endsWith('/.well-known/oauth-authorization-server')) {
        return jsonResponse({
          authorization_endpoint: 'https://aoi.test/accounts/oauth/authorize',
          token_endpoint: 'https://aoi.test/accounts/oauth/token',
          registration_endpoint: 'https://aoi.test/accounts/oauth/register',
        })
      }
      if (target.endsWith('/.well-known/oauth-protected-resource')) {
        return jsonResponse({ resource: 'https://aoi.test/grammar/mcp' })
      }
      if (target.endsWith('/token')) {
        return jsonResponse({ error: 'invalid_grant', error_description: 'refresh expired' }, 400)
      }
      throw new Error(`unexpected request ${target}`)
    },
  })
  service.start()
  t.after(() => service.dispose())
  service.state.serverUrl = 'https://aoi.test'
  service.state.oauth = {
    ...service.state.oauth,
    accessToken: 'expired',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() - 1_000,
    clientId: 'client-1',
  }
  service.state.enabled = true
  assert.equal(service.enqueue(SENTENCES), true)
  await service.flush()

  const state = service.publicState()
  assert.equal(state.enabled, false)
  assert.equal(state.needsAuth, true)
  assert.equal(state.pending, 1)
  assert.match(state.lastError, /refresh expired/)
})
