interface Env {
  RUNWAY_CACHE: KVNamespace
  FOLD_MCP_URL: string
  FOLD_MCP_TOKEN?: string
  RUNWAY_API_TOKEN: string
  ALLOWED_ORIGIN?: string
}

type OAuthTokens = {
  access_token: string
  refresh_token?: string
  expires_at: number
  token_type?: string
  scope?: string
}

type OAuthClient = { client_id: string }

type MoneySummary = {
  total: number
  categories: Array<{ category_name: string; amount: number }> | null
  untagged: null | { amount: number }
  month: number
  year: number
}

export type RunwaySnapshot = {
  version: 1
  currency: string
  syncedAt: string
  liquid: number
  investments: number
  debt: number
  burn: number
  monthlyBurn: Array<{ label: string; value: number; month: number; year: number }>
  runway: {
    liquidDays: number
    totalDays: number
    totalMonths: number
    throughDate: string
  }
  methodology: { months: number; excludedCategories: string[] }
}

const CACHE_KEY = 'runway:v1'
const FOLD_ISSUER = 'https://mcp.fold.money'
const OAUTH_CLIENT_KEY = 'oauth:client:v1'
const OAUTH_TOKENS_KEY = 'oauth:tokens:v1'
const excluded = new Set(['return', 'returns', 'investment', 'investments', 'lent', 'support', 'business', 'top-up', 'top up'])

class FoldMcpClient {
  private id = 0
  private sessionId: string | null = null

  constructor(private env: Env, private accessToken: string) {}

  async initialize() {
    await this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'personal-runway-worker', version: '1.0.0' },
    })
    await this.rpc('notifications/initialized', {}, true)
  }

  async callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await this.rpc('tools/call', { name, arguments: args }) as {
      isError?: boolean
      structuredContent?: T
      content?: Array<{ type: string; text?: string }>
    }
    if (result.isError) throw new Error(`Fold tool ${name} returned an error`)
    if (result.structuredContent) return result.structuredContent
    const text = result.content?.find(item => item.type === 'text')?.text
    if (!text) throw new Error(`Fold tool ${name} returned no structured data`)
    return JSON.parse(text) as T
  }

  private async rpc(method: string, params: Record<string, unknown>, notification = false): Promise<unknown> {
    const body: Record<string, unknown> = { jsonrpc: '2.0', method, params }
    if (!notification) body.id = ++this.id
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${this.accessToken}`,
    }
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId
    const response = await fetch(this.env.FOLD_MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`Fold MCP request failed (${response.status})`)
    this.sessionId ||= response.headers.get('mcp-session-id')
    if (notification || response.status === 202) return null
    const raw = await response.text()
    const payload = response.headers.get('content-type')?.includes('text/event-stream')
      ? parseSse(raw)
      : JSON.parse(raw)
    if (payload.error) throw new Error(`Fold MCP error: ${payload.error.message ?? 'unknown error'}`)
    return payload.result
  }
}

function parseSse(raw: string): any {
  const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).filter(Boolean).at(-1)
  if (!data) throw new Error('Fold MCP returned an empty event stream')
  return JSON.parse(data)
}

function previousMonths(now: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + index, 1))
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, label: date.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) }
  })
}

export function adjustedBurn(summary: MoneySummary) {
  const categorized = (summary.categories ?? [])
    .filter(item => !excluded.has(item.category_name.trim().toLowerCase()))
    .reduce((sum, item) => sum + item.amount, 0)
  return categorized + (summary.untagged?.amount ?? 0)
}

function base64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomUrlSafe(size = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)))
}

async function sha256(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

async function oauthClient(env: Env, redirectUri: string): Promise<OAuthClient> {
  const existing = await env.RUNWAY_CACHE.get<OAuthClient>(OAUTH_CLIENT_KEY, 'json')
  if (existing?.client_id) return existing
  const response = await fetch(`${FOLD_ISSUER}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Personal Runway',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp:read offline_access',
    }),
  })
  if (!response.ok) throw new Error(`Fold client registration failed (${response.status})`)
  const client = await response.json<OAuthClient>()
  if (!client.client_id) throw new Error('Fold client registration returned no client ID')
  await env.RUNWAY_CACHE.put(OAUTH_CLIENT_KEY, JSON.stringify(client))
  return client
}

async function beginOAuth(request: Request, env: Env) {
  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/oauth/callback`
  const client = await oauthClient(env, redirectUri)
  const state = randomUrlSafe()
  const verifier = randomUrlSafe(48)
  await env.RUNWAY_CACHE.put(`oauth:state:${state}`, JSON.stringify({ verifier, redirectUri, expiresAt: Date.now() + 600_000 }), { expirationTtl: 600 })
  const authorizationUrl = new URL(`${FOLD_ISSUER}/oauth/authorize`)
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: redirectUri,
    scope: 'mcp:read offline_access',
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
    resource: FOLD_ISSUER,
  }).toString()
  return authorizationUrl.toString()
}

async function saveTokenResponse(env: Env, payload: any, previousRefreshToken?: string) {
  if (!payload.access_token) throw new Error('Fold token response did not include an access token')
  const tokens: OAuthTokens = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? previousRefreshToken,
    expires_at: Date.now() + Math.max(60, Number(payload.expires_in ?? 3600)) * 1000,
    token_type: payload.token_type,
    scope: payload.scope,
  }
  await env.RUNWAY_CACHE.put(OAUTH_TOKENS_KEY, JSON.stringify(tokens))
  return tokens
}

async function exchangeCode(url: URL, env: Env) {
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  if (!state || !code || url.searchParams.get('error')) throw new Error('Fold authorization was denied or incomplete')
  const stateKey = `oauth:state:${state}`
  const saved = await env.RUNWAY_CACHE.get<{ verifier: string; redirectUri: string; expiresAt: number }>(stateKey, 'json')
  await env.RUNWAY_CACHE.delete(stateKey)
  if (!saved || saved.expiresAt < Date.now()) throw new Error('OAuth state is invalid or expired')
  const client = await env.RUNWAY_CACHE.get<OAuthClient>(OAUTH_CLIENT_KEY, 'json')
  if (!client?.client_id) throw new Error('OAuth client is not registered')
  const response = await fetch(`${FOLD_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code,
      redirect_uri: saved.redirectUri,
      code_verifier: saved.verifier,
      resource: FOLD_ISSUER,
    }),
  })
  if (!response.ok) throw new Error(`Fold token exchange failed (${response.status})`)
  return saveTokenResponse(env, await response.json())
}

async function accessToken(env: Env) {
  if (env.FOLD_MCP_TOKEN) return env.FOLD_MCP_TOKEN
  const tokens = await env.RUNWAY_CACHE.get<OAuthTokens>(OAUTH_TOKENS_KEY, 'json')
  if (!tokens) throw new Error('Fold is not connected. Complete OAuth first.')
  if (tokens.expires_at > Date.now() + 60_000) return tokens.access_token
  if (!tokens.refresh_token) throw new Error('Fold authorization expired without a refresh token')
  const client = await env.RUNWAY_CACHE.get<OAuthClient>(OAUTH_CLIENT_KEY, 'json')
  if (!client?.client_id) throw new Error('OAuth client is not registered')
  const response = await fetch(`${FOLD_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: client.client_id,
      refresh_token: tokens.refresh_token,
      scope: 'mcp:read offline_access',
      resource: FOLD_ISSUER,
    }),
  })
  if (!response.ok) throw new Error(`Fold token refresh failed (${response.status})`)
  return (await saveTokenResponse(env, await response.json(), tokens.refresh_token)).access_token
}

function oauthPage(success: boolean) {
  const title = success ? 'Fold connected' : 'Connection failed'
  const message = success
    ? 'Your runway snapshot is ready. You can close this tab and return to the app.'
    : 'Fold could not be connected. Return to the app and try the connection again.'
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:16px system-ui;background:#f4f2ec;color:#191c18;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:480px;padding:40px;border:1px solid #d8d6cf;border-radius:24px;background:white}h1{font-size:34px;margin:0 0 12px}p{color:#666;line-height:1.55}</style><main class="card"><h1>${title}</h1><p>${message}</p></main>`, {
    status: success ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" },
  })
}

async function buildSnapshot(env: Env): Promise<RunwaySnapshot> {
  if (!env.FOLD_MCP_URL) throw new Error('Fold MCP URL is not configured')
  const client = new FoldMcpClient(env, await accessToken(env))
  await client.initialize()
  const months = previousMonths(new Date(), 3)
  const [netWorth, ...spending] = await Promise.all([
    client.callTool<{ currency: string; groups: { liquid: number; investments: number; debt: number } }>('get_net_worth'),
    ...months.map(item => client.callTool<MoneySummary>('get_spending_summary', { year: item.year, month: item.month })),
  ])
  const monthlyBurn = spending.map((summary, index) => ({ ...months[index], value: Math.round(adjustedBurn(summary)) }))
  const burn = Math.round(monthlyBurn.reduce((sum, item) => sum + item.value, 0) / monthlyBurn.length)
  const available = netWorth.groups.liquid + netWorth.groups.investments - netWorth.groups.debt
  const totalMonths = burn > 0 ? available / burn : 0
  const through = new Date()
  through.setUTCDate(through.getUTCDate() + Math.round(totalMonths * 30.44))
  return {
    version: 1,
    currency: netWorth.currency,
    syncedAt: new Date().toISOString(),
    liquid: roundMoney(netWorth.groups.liquid),
    investments: roundMoney(netWorth.groups.investments),
    debt: roundMoney(netWorth.groups.debt),
    burn,
    monthlyBurn,
    runway: {
      liquidDays: Math.round((netWorth.groups.liquid / burn) * 30.44),
      totalDays: Math.round(totalMonths * 30.44),
      totalMonths: Math.round(totalMonths * 10) / 10,
      throughDate: through.toISOString().slice(0, 10),
    },
    methodology: { months: 3, excludedCategories: [...excluded] },
  }
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

async function refresh(env: Env) {
  const snapshot = await buildSnapshot(env)
  await env.RUNWAY_CACHE.put(CACHE_KEY, JSON.stringify(snapshot))
  return snapshot
}

function cors(env: Env, request: Request) {
  const origin = request.headers.get('origin')
  const allowed = env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN ? origin : ''
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'Origin',
  }
}

function authorized(request: Request, env: Env) {
  const expected = `Bearer ${env.RUNWAY_API_TOKEN}`
  return env.RUNWAY_API_TOKEN?.length >= 24 && request.headers.get('authorization') === expected
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { 'cache-control': 'private, no-store', ...headers } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const headers = cors(env, request)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (url.pathname === '/health') return json({ ok: true }, 200, headers)
    if (url.pathname === '/oauth/callback' && request.method === 'GET') {
      try {
        await exchangeCode(url, env)
        await refresh(env)
        return oauthPage(true)
      } catch (error) {
        console.error('Fold OAuth callback failed', error)
        return oauthPage(false)
      }
    }
    if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401, headers)
    try {
      if (url.pathname === '/oauth/start' && request.method === 'POST') {
        return json({ authorizationUrl: await beginOAuth(request, env) }, 200, headers)
      }
      if (url.pathname === '/oauth/status' && request.method === 'GET') {
        const tokens = await env.RUNWAY_CACHE.get<OAuthTokens>(OAUTH_TOKENS_KEY, 'json')
        return json({ connected: Boolean(tokens?.refresh_token || env.FOLD_MCP_TOKEN) }, 200, headers)
      }
      if (url.pathname === '/api/runway' && request.method === 'GET') {
        const cached = await env.RUNWAY_CACHE.get<RunwaySnapshot>(CACHE_KEY, 'json')
        return cached ? json(cached, 200, headers) : json({ error: 'No snapshot yet. Trigger /api/refresh once.' }, 503, headers)
      }
      if (url.pathname === '/api/refresh' && request.method === 'POST') return json(await refresh(env), 200, headers)
      return json({ error: 'Not found' }, 404, headers)
    } catch (error) {
      console.error(error)
      return json({ error: 'Refresh failed; the previous cached snapshot remains available.' }, 502, headers)
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refresh(env).catch(error => console.error('Scheduled Fold refresh failed', error)))
  },
} satisfies ExportedHandler<Env>
