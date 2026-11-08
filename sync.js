/**
 * Optional sync to the Aoi grammar service.
 *
 * The deck and the card library stay local and keep working when this is off.
 * When the learner turns sync on in the card library header, the plugin runs
 * an OAuth 2.1 authorization-code + PKCE flow in the system browser, keeps the
 * resulting tokens on the host, and pushes each capture in the background.
 *
 * Tokens are stored with owner-only permissions. A failed push never blocks
 * the tool that captured the cards; the server dedupes by source sentence, so
 * retrying a queued job is safe.
 */

import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { execFile } from 'node:child_process'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Public origin of the Aoi grammar service used when none is saved. */
export const DEFAULT_SERVER_URL =
  process.env.DSH_ENGLISH_CARDS_SERVER || 'https://aoilang.com'

/** Scopes the plugin needs: read for the review links and write for captures. */
const OAUTH_SCOPE = 'grammar:read grammar:write'

/** Stable loopback port makes the registered redirect URI reusable. */
const DEFAULT_CALLBACK_PORT = 53682

const CALLBACK_PATH = '/callback'

/** The browser has five minutes to finish login and consent. */
const AUTH_TIMEOUT_MS = 5 * 60 * 1000

/** Outbox bound: a long offline stretch must not grow the file forever. */
const MAX_JOBS = 200

/** Recent validation failures kept for the panel, not retried. */
const MAX_DEAD = 20

/** Backoff after a transient failure, in milliseconds. */
const RETRY_STEPS = [60_000, 5 * 60_000, 30 * 60_000, 60 * 60_000]

/** A request stops waiting after this long. */
const REQUEST_TIMEOUT_MS = 20_000

/** How often the outbox is retried while cards are waiting. */
const FLUSH_INTERVAL_MS = 30_000

/** Host directory holding the settings, tokens, and outbox. */
function stateDir() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'english-cards-sync')
}

function stateFile() {
  return join(stateDir(), 'state.json')
}

/** Fresh, disabled defaults; no network request happens with this state. */
function defaultState() {
  return {
    version: 2,
    enabled: false,
    serverUrl: DEFAULT_SERVER_URL,
    oauth: {
      origin: '',
      clientId: '',
      redirectUri: '',
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
      scope: '',
      tokenType: 'Bearer',
    },
    queue: [],
    dead: [],
    lastSyncAt: 0,
    lastError: '',
    retryAt: 0,
    failures: 0,
    needsAuth: false,
    backfilledAt: 0,
    backfillVersion: 2,
  }
}

function normalizeOAuth(raw) {
  if (raw === null || typeof raw !== 'object') return defaultState().oauth
  return {
    origin: typeof raw.origin === 'string' ? raw.origin.replace(/\/+$/, '') : '',
    clientId: typeof raw.clientId === 'string' ? raw.clientId : '',
    redirectUri: typeof raw.redirectUri === 'string' ? raw.redirectUri : '',
    accessToken: typeof raw.accessToken === 'string' ? raw.accessToken : '',
    refreshToken: typeof raw.refreshToken === 'string' ? raw.refreshToken : '',
    expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : 0,
    scope: typeof raw.scope === 'string' ? raw.scope : '',
    tokenType: typeof raw.tokenType === 'string' ? raw.tokenType : 'Bearer',
  }
}

/** Keep one persisted job usable even after a hand-edited or old file. */
function normalizeJob(job) {
  if (job === null || typeof job !== 'object') return null
  const sentences = Array.isArray(job.sentences) ? job.sentences : []
  const clean = sentences
    .filter((sentence) => sentence !== null && typeof sentence === 'object')
    .map((sentence) => ({
      corrected: typeof sentence.corrected === 'string' ? sentence.corrected : '',
      source_text: typeof sentence.source_text === 'string' ? sentence.source_text : '',
      cards: Array.isArray(sentence.cards)
        ? sentence.cards
            .filter((card) => card !== null && typeof card === 'object')
            .map((card) => ({
              title: typeof card.title === 'string' ? card.title : '',
              rule: typeof card.rule === 'string' ? card.rule : '',
              example: typeof card.example === 'string' ? card.example : '',
            }))
            .filter((card) => card.title.length > 0)
        : [],
    }))
    .filter((sentence) => sentence.corrected.length > 0 && sentence.cards.length > 0)
  if (clean.length === 0) return null
  return {
    id: typeof job.id === 'string' && job.id.length > 0 ? job.id : `${Date.now()}`,
    at: typeof job.at === 'number' && Number.isFinite(job.at) ? job.at : Date.now(),
    sentences: clean,
  }
}

/** Turn a persisted or partially written file into the current shape. */
function normalizeState(raw) {
  const base = defaultState()
  if (raw === null || typeof raw !== 'object') return base
  const oauth = normalizeOAuth(raw.oauth)
  const authenticated = oauth.refreshToken.length > 0 ||
    (oauth.accessToken.length > 0 && oauth.expiresAt > Date.now())
  const queue = Array.isArray(raw.queue) ? raw.queue.map(normalizeJob).filter(Boolean) : []
  const needsAuth = raw.needsAuth === true ||
    (raw.enabled === true && !authenticated)
  const backfillVersion = typeof raw.backfillVersion === 'number' ? raw.backfillVersion : 0
  return {
    ...base,
    enabled: raw.enabled === true && authenticated && needsAuth !== true,
    serverUrl:
      typeof raw.serverUrl === 'string' && raw.serverUrl.trim().length > 0
        ? raw.serverUrl.trim()
        : base.serverUrl,
    oauth,
    queue: queue.slice(-MAX_JOBS),
    dead: Array.isArray(raw.dead) ? raw.dead.slice(-MAX_DEAD) : [],
    lastSyncAt: typeof raw.lastSyncAt === 'number' ? raw.lastSyncAt : 0,
    lastError:
      (needsAuth || (raw.enabled === true && authenticated)) && typeof raw.lastError === 'string'
        ? raw.lastError
        : '',
    retryAt: typeof raw.retryAt === 'number' ? raw.retryAt : 0,
    failures: typeof raw.failures === 'number' ? raw.failures : 0,
    needsAuth,
    // Version 2 sends history oldest-first; existing installs re-run the
    // backfill once so updated_at ordering repairs the already-created rows.
    backfilledAt: backfillVersion < 2
      ? 0
      : typeof raw.backfilledAt === 'number'
        ? raw.backfilledAt
        : 0,
    backfillVersion: 2,
  }
}

/** Build the MCP endpoint from a user-entered base URL. */
export function mcpEndpoint(serverUrl) {
  const base = String(serverUrl || '').trim().replace(/\/+$/, '') || DEFAULT_SERVER_URL
  if (/\/grammar\/mcp$/i.test(base)) return `${base}/`
  return `${base}/grammar/mcp/`
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pkcePair() {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function authPage(title, message) {
  return [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#151517;color:#f9fafb;font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}',
    'main{max-width:420px;padding:32px;border:1px solid #303035;border-radius:16px;background:#1d1d20;text-align:center}',
    'h1{margin:0 0 8px;font-size:18px;font-weight:600}',
    'p{margin:0;color:#a1a1aa}',
    '</style>',
    '<main>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(message)}</p>`,
    '</main>',
  ].join('')
}

export function createSyncService(options = {}) {
  const log = typeof options.logger === 'function' ? options.logger : console.warn
  const fetchImpl = options.fetch ?? globalThis.fetch
  const openUrl = typeof options.openUrl === 'function' ? options.openUrl : null
  const callbackPort =
    typeof options.callbackPort === 'number' ? options.callbackPort : DEFAULT_CALLBACK_PORT

  const service = {
    state: defaultState(),
    timer: null,
    scheduled: null,
    flushing: false,
    authPending: false,
    authUrl: '',
    pendingAuth: null,
    metadata: null,

    /** Load saved state and begin retrying any queued cards. */
    start() {
      try {
        this.state = normalizeState(JSON.parse(readFileSync(stateFile(), 'utf8')))
      } catch {
        this.state = defaultState()
      }
      this.timer = setInterval(() => {
        if (this.state.enabled && this.state.queue.length > 0) void this.flush()
      }, FLUSH_INTERVAL_MS)
      if (typeof this.timer?.unref === 'function') this.timer.unref()
      if (this.state.enabled && this.state.queue.length > 0) this.schedule(1_500)
      return this
    },

    /** Stop timers and any in-flight authorization. */
    dispose() {
      if (this.timer !== null) {
        clearInterval(this.timer)
        this.timer = null
      }
      if (this.scheduled !== null) {
        clearTimeout(this.scheduled)
        this.scheduled = null
      }
      this.finishAuth()
    },

    /** Panel-facing state. Tokens never cross the wire. */
    publicState() {
      const oauth = this.state.oauth
      const authenticated = this.authenticated()
      return {
        ok: true,
        enabled: this.state.enabled === true,
        authenticated,
        needsAuth: this.state.needsAuth === true,
        pending: this.state.queue.length,
        dead: this.state.dead.length,
        lastSyncAt: this.state.lastSyncAt,
        lastError: this.state.lastError,
        backfilledAt: this.state.backfilledAt,
        authPending: this.authPending,
        authUrl: this.authUrl,
        reviewUrl: this.reviewUrl(),
        serverUrl: this.state.serverUrl,
      }
    },

    authenticated() {
      const oauth = this.state.oauth
      return oauth.refreshToken.length > 0 ||
        (oauth.accessToken.length > 0 && oauth.expiresAt > Date.now())
    },

    origin() {
      return String(this.state.serverUrl || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '') ||
        DEFAULT_SERVER_URL
    },

    reviewUrl() {
      return `${this.origin()}/grammar/review/`
    },

    /** Toggle sync; enabling without tokens is refused so the panel can authorize. */
    updateSettings(patch) {
      if (patch === null || typeof patch !== 'object') return false
      if (typeof patch.enabled !== 'boolean') return false
      if (!patch.enabled) {
        this.state.enabled = false
        this.save()
        return true
      }
      if (!this.authenticated() || this.state.needsAuth === true) {
        this.state.needsAuth = true
        this.save()
        return false
      }
      this.state.enabled = true
      this.state.retryAt = 0
      this.state.failures = 0
      this.state.lastError = ''
      this.save()
      this.schedule(100)
      return true
    },

    /** Start the browser authorization flow; returns the panel state immediately. */
    startAuth() {
      if (this.authPending) return this.publicState()
      this.authPending = true
      this.authUrl = ''
      this.state.lastError = ''
      this.save()
      void this.beginAuth().catch((error) => {
        this.failAuth(error instanceof Error ? error.message : String(error))
      })
      return this.publicState()
    },

    async beginAuth() {
      const origin = this.origin()
      const metadata = await this.discover()
      const server = createServer((request, response) => {
        void this.handleCallback(request, response)
      })
      const port = await this.listen(server)
      const pending = {
        server,
        port,
        redirectUri: '',
        clientId: '',
        verifier: '',
        state: '',
        metadata,
        timeout: null,
        used: false,
      }
      this.pendingAuth = pending
      try {
        const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`
        const clientId = await this.ensureClient(metadata, origin, redirectUri)
        const pkce = pkcePair()
        const state = base64url(randomBytes(24))
        const authUrl = new URL(metadata.authorizationEndpoint)
        const params = {
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: OAUTH_SCOPE,
          state,
          code_challenge: pkce.challenge,
          code_challenge_method: 'S256',
          resource: metadata.resource,
        }
        for (const [key, value] of Object.entries(params)) {
          authUrl.searchParams.set(key, value)
        }
        const timeout = setTimeout(() => {
          this.failAuth('授权超时，请重新打开同步')
        }, AUTH_TIMEOUT_MS)
        if (typeof timeout?.unref === 'function') timeout.unref()
        pending.redirectUri = redirectUri
        pending.clientId = clientId
        pending.verifier = pkce.verifier
        pending.state = state
        pending.timeout = timeout
        this.authUrl = authUrl.toString()
        this.save()
        this.openBrowser(this.authUrl)
      } catch (error) {
        this.failAuth(error instanceof Error ? error.message : String(error))
      }
    },

    /** Close the callback server and clear the pending authorization. */
    finishAuth() {
      const pending = this.pendingAuth
      if (pending?.timeout !== undefined) clearTimeout(pending.timeout)
      if (pending?.server !== undefined) {
        try {
          pending.server.close()
        } catch {
          // Already closed.
        }
      }
      this.pendingAuth = null
      this.authPending = false
      this.authUrl = ''
      this.save()
    },

    failAuth(message) {
      this.state.enabled = false
      this.state.needsAuth = true
      this.state.lastError = message
      this.state.retryAt = 0
      this.save()
      this.finishAuth()
    },

    async handleCallback(request, response) {
      const pending = this.pendingAuth
      if (pending === null) {
        this.respond(response, 400, '授权会话已结束', '请回到 DeepSeek Harness 重新打开同步。')
        return
      }
      let url
      try {
        url = new URL(request.url || '/', 'http://127.0.0.1')
      } catch {
        this.respond(response, 400, '无效请求', '无法读取授权回调。')
        return
      }
      if (url.pathname !== CALLBACK_PATH) {
        this.respond(response, 404, '未找到', '这个地址不是授权回调。')
        return
      }
      if (pending.used) {
        this.respond(response, 400, '授权已处理', '这次授权已经完成。')
        return
      }
      if (!safeEqual(url.searchParams.get('state') || '', pending.state)) {
        this.state.needsAuth = true
        this.state.lastError = '授权校验失败，请重新打开同步'
        this.save()
        this.respond(response, 400, '授权校验失败', 'state 不匹配，请重新打开同步。')
        setTimeout(() => this.finishAuth(), 300)
        return
      }
      pending.used = true
      const error = url.searchParams.get('error')
      if (error) {
        const message = url.searchParams.get('error_description') || error
        this.state.enabled = false
        this.state.needsAuth = true
        this.state.lastError = message
        this.save()
        this.respond(response, 400, '授权未完成', message)
        setTimeout(() => this.finishAuth(), 300)
        return
      }
      const code = url.searchParams.get('code')
      if (!code) {
        this.state.enabled = false
        this.state.needsAuth = true
        this.state.lastError = '授权回调缺少 code'
        this.save()
        this.respond(response, 400, '授权未完成', '回调缺少 code，请重新打开同步。')
        setTimeout(() => this.finishAuth(), 300)
        return
      }
      try {
        const token = await this.exchangeCode(pending, code)
        this.storeTokens(token)
        this.state.enabled = true
        this.state.needsAuth = false
        this.state.lastError = ''
        this.state.retryAt = 0
        this.state.failures = 0
        this.save()
        this.respond(response, 200, '同步已开启', '可以关闭此页，回到 DeepSeek Harness 继续使用。')
        setTimeout(() => {
          this.finishAuth()
          this.schedule(200)
        }, 300)
      } catch (exchangeError) {
        const message = exchangeError instanceof Error ? exchangeError.message : String(exchangeError)
        this.state.enabled = false
        this.state.needsAuth = true
        this.state.lastError = message
        this.save()
        this.respond(response, 500, '授权失败', message)
        setTimeout(() => this.finishAuth(), 300)
      }
    },

    respond(response, status, title, message) {
      const body = authPage(title, message)
      response.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      response.end(body)
    },

    async exchangeCode(pending, code) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
        code_verifier: pending.verifier,
        resource: pending.metadata.resource,
      })
      const response = await fetchImpl(pending.metadata.tokenEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data === null || typeof data.access_token !== 'string') {
        const message =
          data?.error_description || data?.error || `授权服务器返回 HTTP ${response.status}`
        throw new Error(message)
      }
      return data
    },

    storeTokens(data) {
      const expiresIn = Number(data.expires_in)
      const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600
      this.state.oauth = {
        ...this.state.oauth,
        accessToken: data.access_token,
        refreshToken:
          typeof data.refresh_token === 'string' && data.refresh_token.length > 0
            ? data.refresh_token
            : this.state.oauth.refreshToken,
        expiresAt: Date.now() + seconds * 1000,
        scope: typeof data.scope === 'string' ? data.scope : OAUTH_SCOPE,
        tokenType: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
      }
    },

    /** Discover same-origin OAuth endpoints, falling back to the known paths. */
    async discover() {
      const origin = this.origin()
      if (this.metadata !== null && this.metadata.origin === origin) return this.metadata
      let authorizationEndpoint = `${origin}/accounts/oauth/authorize`
      let tokenEndpoint = `${origin}/accounts/oauth/token`
      let registrationEndpoint = `${origin}/accounts/oauth/register`
      let resource = `${origin}/grammar/mcp`
      try {
        const response = await fetchImpl(`${origin}/.well-known/oauth-authorization-server`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        const data = await response.json().catch(() => null)
        if (response.ok && data !== null) {
          if (sameOrigin(data.authorization_endpoint, origin)) {
            authorizationEndpoint = data.authorization_endpoint
          }
          if (sameOrigin(data.token_endpoint, origin)) tokenEndpoint = data.token_endpoint
          if (sameOrigin(data.registration_endpoint, origin)) {
            registrationEndpoint = data.registration_endpoint
          }
        }
      } catch {
        // Fall back to the documented paths.
      }
      try {
        const response = await fetchImpl(`${origin}/.well-known/oauth-protected-resource`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        const data = await response.json().catch(() => null)
        if (response.ok && data !== null && sameOrigin(data.resource, origin)) {
          resource = data.resource.replace(/\/+$/, '')
        }
      } catch {
        // Keep the default resource.
      }
      this.metadata = {
        origin,
        authorizationEndpoint,
        tokenEndpoint,
        registrationEndpoint,
        resource,
      }
      return this.metadata
    },

    async ensureClient(metadata, origin, redirectUri) {
      const oauth = this.state.oauth
      if (
        oauth.clientId.length > 0 &&
        oauth.redirectUri === redirectUri &&
        oauth.origin === origin
      ) {
        return oauth.clientId
      }
      const response = await fetchImpl(metadata.registrationEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          client_name: 'DeepSeek Harness · English Cards',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data === null || typeof data.client_id !== 'string') {
        const message = data?.error_description || data?.error || `注册客户端失败（HTTP ${response.status}）`
        throw new Error(message)
      }
      this.state.oauth = {
        ...this.state.oauth,
        origin,
        clientId: data.client_id,
        redirectUri,
      }
      this.save()
      return data.client_id
    },

    /** Bind the loopback callback server, falling back to a random port. */
    listen(server) {
      return new Promise((resolve, reject) => {
        const attempt = (port) => {
          const onError = (error) => {
            server.removeListener('error', onError)
            if (port !== 0 && error?.code === 'EADDRINUSE') {
              attempt(0)
              return
            }
            reject(error)
          }
          server.once('error', onError)
          server.listen(port, '127.0.0.1', () => {
            server.removeListener('error', onError)
            const address = server.address()
            if (address === null || typeof address === 'string') {
              reject(new Error('无法启动本地授权回调服务'))
              return
            }
            resolve(address.port)
          })
        }
        attempt(callbackPort)
      })
    },

    openBrowser(url) {
      if (openUrl !== null) {
        try {
          openUrl(url)
        } catch (error) {
          log(`dsh-english-cards: could not open the authorization page: ${error?.message ?? error}`)
        }
        return
      }
      const platform = process.platform
      const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
      const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
      execFile(command, args, { windowsHide: true }, (error) => {
        if (error !== null) {
          log(`dsh-english-cards: could not open the authorization page: ${error.message}`)
        }
      })
    },

    /** Refresh the access token; permanent failures disable sync and ask for auth. */
    async refreshAccessToken() {
      const oauth = this.state.oauth
      if (oauth.refreshToken.length === 0 || oauth.clientId.length === 0) {
        this.markNeedsAuth('授权已失效，请重新打开同步')
        return { ok: false, permanent: true, error: this.state.lastError }
      }
      let metadata
      try {
        metadata = await this.discover()
      } catch (error) {
        return { ok: false, retry: true, error: error instanceof Error ? error.message : String(error) }
      }
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: oauth.refreshToken,
        client_id: oauth.clientId,
        resource: metadata.resource,
      })
      let response
      try {
        response = await fetchImpl(metadata.tokenEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        return { ok: false, retry: true, error: `network: ${error?.message ?? error}` }
      }
      const data = await response.json().catch(() => null)
      if (response.ok && data !== null && typeof data.access_token === 'string') {
        this.storeTokens(data)
        this.state.needsAuth = false
        this.state.lastError = ''
        this.save()
        return { ok: true }
      }
      const message =
        data?.error_description || data?.error || `刷新授权失败（HTTP ${response.status}）`
      if (response.status === 429 || response.status >= 500) {
        return { ok: false, retry: true, error: message }
      }
      this.markNeedsAuth(message)
      return { ok: false, permanent: true, error: message }
    },

    markNeedsAuth(message) {
      this.state.enabled = false
      this.state.needsAuth = true
      this.state.lastError = message
      this.state.retryAt = Number.MAX_SAFE_INTEGER
      this.state.oauth = {
        ...this.state.oauth,
        accessToken: '',
        refreshToken: '',
        expiresAt: 0,
      }
      this.save()
    },

    async ensureAccessToken() {
      const oauth = this.state.oauth
      if (oauth.accessToken.length > 0 && oauth.expiresAt > Date.now() + 60_000) {
        return { ok: true }
      }
      if (oauth.refreshToken.length > 0) return this.refreshAccessToken()
      this.markNeedsAuth('请重新打开同步完成授权')
      return { ok: false, permanent: true, error: this.state.lastError }
    },

    /** Add one capture's sentences to the outbox; no-op when sync is off. */
    enqueue(sentences) {
      if (!this.state.enabled) return false
      return this.queueSentences(sentences)
    },

    /** Add already-built sentences to the outbox, splitting batches of 50. */
    queueSentences(sentences, front = false) {
      const list = Array.isArray(sentences) ? sentences : []
      if (list.length === 0) return false
      const jobs = []
      for (let start = 0; start < list.length; start += 50) {
        const job = normalizeJob({
          id: `${Date.now()}-${start}-${Math.random().toString(36).slice(2, 8)}`,
          at: Date.now(),
          sentences: list.slice(start, start + 50),
        })
        if (job !== null) jobs.push(job)
      }
      if (jobs.length === 0) return false
      if (front) this.state.queue = [...jobs, ...this.state.queue].slice(0, MAX_JOBS)
      else this.state.queue.push(...jobs)
      if (this.state.queue.length > MAX_JOBS) {
        this.state.queue.splice(0, this.state.queue.length - MAX_JOBS)
      }
      this.save()
      this.schedule(150)
      return true
    },

    /**
     * One-time backfill of cards that existed before sync was enabled. The
     * server dedupes by source sentence, so re-sending a card is safe. Mark
     * the attempt even when there was nothing to send so the panel stops
     * offering it.
     */
    backfill(sentences) {
      if (this.state.backfilledAt > 0) return false
      if (!this.state.enabled || !this.authenticated()) return false
      this.queueSentences(sentences, true)
      this.state.backfilledAt = Date.now()
      this.save()
      this.schedule(200)
      return true
    },

    /** Push queued jobs in order. Safe to call repeatedly. */
    async flush() {
      if (this.flushing) return
      if (!this.state.enabled) return
      if (Date.now() < this.state.retryAt) return
      this.flushing = true
      try {
        while (this.state.queue.length > 0) {
          const job = this.state.queue[0]
          let result
          try {
            result = await this.push(job)
          } catch (error) {
            result = {
              ok: false,
              kind: 'retry',
              error: error instanceof Error ? error.message : String(error),
            }
          }
          if (result.ok) {
            this.state.queue.shift()
            this.state.lastSyncAt = Date.now()
            this.state.lastError = ''
            this.state.failures = 0
            this.state.retryAt = 0
            this.save()
            continue
          }
          this.state.lastError = result.error
          if (result.kind === 'auth') {
            this.state.enabled = false
            this.state.needsAuth = true
            this.state.retryAt = Number.MAX_SAFE_INTEGER
            this.save()
            return
          }
          if (result.kind === 'drop') {
            this.state.queue.shift()
            this.state.dead = [
              ...this.state.dead,
              { id: job.id, at: job.at, error: result.error },
            ].slice(-MAX_DEAD)
            this.save()
            continue
          }
          this.state.failures = Math.min(this.state.failures + 1, RETRY_STEPS.length)
          const delay = RETRY_STEPS[Math.min(this.state.failures - 1, RETRY_STEPS.length - 1)]
          this.state.retryAt = Date.now() + delay
          this.save()
          return
        }
      } finally {
        this.flushing = false
      }
    },

    async push(job) {
      const ensured = await this.ensureAccessToken()
      if (!ensured.ok) {
        return {
          ok: false,
          kind: ensured.permanent ? 'auth' : 'retry',
          error: ensured.error || '授权失败',
        }
      }
      const sentences = job.sentences.map((sentence) => ({
        corrected: sentence.corrected,
        source_text: sentence.source_text,
        cards: sentence.cards,
      }))
      const response = await this.rpc('tools/call', {
        name: 'create_english_learning_cards',
        arguments: { sentences },
      })
      if (!response.ok) return response
      const result = response.payload?.result
      if (result?.isError === true) {
        if (result._meta?.['mcp/www_authenticate'] !== undefined) {
          return { ok: false, kind: 'auth', error: '需要重新授权' }
        }
        const text = Array.isArray(result.content)
          ? result.content.map((item) => (typeof item?.text === 'string' ? item.text : '')).join(' ')
          : ''
        return { ok: false, kind: 'drop', error: text || 'server rejected the cards' }
      }
      return { ok: true, count: sentences.length }
    },

    /** One JSON-RPC call, refreshing once when the access token is rejected. */
    async rpc(method, params, retried = false) {
      const accessToken = this.state.oauth.accessToken
      if (accessToken.length === 0) {
        return { ok: false, kind: 'auth', error: '请重新授权' }
      }
      const url = mcpEndpoint(this.state.serverUrl)
      const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
      let response
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        return {
          ok: false,
          kind: 'retry',
          error: `network: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (response.status === 401 || response.status === 403) {
        if (retried) return { ok: false, kind: 'auth', error: '授权已失效' }
        const refreshed = await this.refreshAccessToken()
        if (!refreshed.ok) {
          return {
            ok: false,
            kind: refreshed.permanent ? 'auth' : 'retry',
            error: refreshed.error,
          }
        }
        return this.rpc(method, params, true)
      }
      if (!response.ok) {
        const detail =
          payload?.error?.message ||
          (response.status === 429 || response.status >= 500
            ? `HTTP ${response.status}`
            : `HTTP ${response.status}`)
        return {
          ok: false,
          kind: response.status === 429 || response.status >= 500 ? 'retry' : 'drop',
          error: detail,
        }
      }
      if (payload === null) {
        return { ok: false, kind: 'retry', error: 'unreadable server response' }
      }
      if (payload.error) {
        return {
          ok: false,
          kind: payload.error.code === -32001 ? 'auth' : 'drop',
          error: payload.error.message || 'JSON-RPC error',
        }
      }
      return { ok: true, payload }
    },

    /** HTTP handler for the panel: status, settings, auth, or a manual flush. */
    async handleRequest(request) {
      if (request.method === 'GET') {
        return Response.json(this.publicState())
      }
      let body = null
      try {
        body = await request.json()
      } catch {
        return Response.json({ ok: false, error: 'invalid JSON' }, { status: 400 })
      }
      const action = body?.action
      if (action === 'auth') {
        return Response.json(this.startAuth())
      }
      if (action === 'settings') {
        this.updateSettings(body)
        return Response.json(this.publicState())
      }
      if (action === 'backfill') {
        this.backfill(body?.sentences)
        return Response.json(this.publicState())
      }
      if (action === 'flush') {
        this.state.retryAt = 0
        this.save()
        await this.flush()
        return Response.json(this.publicState())
      }
      return Response.json({ ok: false, error: 'unknown action' }, { status: 400 })
    },

    /** Defer a flush so the capture tool returns immediately. */
    schedule(delay) {
      if (this.scheduled !== null) return
      this.scheduled = setTimeout(() => {
        this.scheduled = null
        void this.flush()
      }, delay)
      if (typeof this.scheduled?.unref === 'function') this.scheduled.unref()
    },

    /** Write state atomically with owner-only permissions. */
    save() {
      try {
        mkdirSync(stateDir(), { recursive: true, mode: 0o700 })
        const target = stateFile()
        const temp = `${target}.tmp`
        writeFileSync(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 })
        renameSync(temp, target)
        try {
          chmodSync(target, 0o600)
        } catch {
          // Windows ignores POSIX modes.
        }
      } catch (error) {
        log(`dsh-english-cards: could not save sync state: ${error?.message ?? error}`)
      }
    },
  }

  return service
}

function sameOrigin(value, origin) {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    return new URL(value).origin === origin
  } catch {
    return false
  }
}
