// Real-time market data engine with multi-provider failover + key rotation.
// Finnhub (stocks/forex/crypto quotes) and Alpha Vantage (forex/stocks/time
// series) each take a pool of free keys; Deriv provides synthetic-index ticks.
// Results are cached briefly to respect free-tier rate limits.
import type { D1Database } from '@cloudflare/workers-types'
import type { Bindings } from './types'
import { parsePool, pickPoolEntry } from './credentialPool'

const TIMEOUT = 20_000

async function pickKey(env: Bindings, db: D1Database | undefined, provider: 'finnhub' | 'alphavantage'): Promise<string | undefined> {
  const raw = provider === 'finnhub' ? env.FINNHUB_KEYS_JSON : env.ALPHAVANTAGE_KEYS_JSON
  const pool = parsePool(raw)
  const pick = await pickPoolEntry(db, `rt-${provider}`, pool)
  return pick?.entry?.key
}

export type Quote = {
  symbol: string
  price: number
  change?: number
  changePct?: number
  high?: number
  low?: number
  open?: number
  prevClose?: number
  source: 'finnhub' | 'alphavantage' | 'deriv'
  ts: number
}

// ---- Finnhub ----
export async function finnhubQuote(env: Bindings, symbol: string, db?: D1Database): Promise<Quote> {
  const key = await pickKey(env, db, 'finnhub')
  if (!key) throw new Error('Finnhub not configured')
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw Object.assign(new Error(`Finnhub ${res.status}`), { status: res.status })
  const d = (await res.json()) as { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number }
  if (typeof d.c !== 'number' || d.c === 0) throw new Error('Finnhub returned no price')
  return { symbol, price: d.c, change: d.d, changePct: d.dp, high: d.h, low: d.l, open: d.o, prevClose: d.pc, source: 'finnhub', ts: Date.now() }
}

// ---- Alpha Vantage (forex + stocks) ----
export async function alphaQuote(env: Bindings, symbol: string, db?: D1Database): Promise<Quote> {
  const key = await pickKey(env, db, 'alphavantage')
  if (!key) throw new Error('Alpha Vantage not configured')
  // Forex pair (e.g. EURUSD) vs stock symbol.
  const isForex = /^[A-Z]{6}$/.test(symbol) && !symbol.includes('.')
  if (isForex) {
    const from = symbol.slice(0, 3)
    const to = symbol.slice(3)
    const res = await fetch(`https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(TIMEOUT) })
    if (!res.ok) throw Object.assign(new Error(`AlphaVantage ${res.status}`), { status: res.status })
    const d = (await res.json()) as { 'Realtime Currency Exchange Rate'?: { '5. Exchange Rate'?: string; '8. Bid Price'?: string; '9. Ask Price'?: string } }
    const rate = d['Realtime Currency Exchange Rate']
    const price = parseFloat(rate?.['5. Exchange Rate'] ?? '')
    if (!isFinite(price)) throw new Error('AlphaVantage returned no rate')
    return { symbol, price, source: 'alphavantage', ts: Date.now() }
  }
  const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw Object.assign(new Error(`AlphaVantage ${res.status}`), { status: res.status })
  const d = (await res.json()) as { 'Global Quote'?: Record<string, string> }
  const q = d['Global Quote']
  const price = parseFloat(q?.['05. price'] ?? '')
  if (!isFinite(price)) throw new Error('AlphaVantage returned no price')
  return {
    symbol,
    price,
    change: parseFloat(q?.['09. change'] ?? '0'),
    changePct: parseFloat((q?.['10. change percent'] ?? '0').replace('%', '')),
    high: parseFloat(q?.['03. high'] ?? '0'),
    low: parseFloat(q?.['04. low'] ?? '0'),
    open: parseFloat(q?.['02. open'] ?? '0'),
    prevClose: parseFloat(q?.['08. previous close'] ?? '0'),
    source: 'alphavantage',
    ts: Date.now(),
  }
}

// ---- Deriv (real-time tick for synthetic indices, via public WS app_id) ----
export async function derivTick(env: Bindings, symbol: string): Promise<Quote> {
  const appId = env.DERIV_APP_ID || '1089'
  const token = env.DERIV_TOKEN
  return new Promise<Quote>((resolve, reject) => {
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`
    // Cloudflare Workers WebSocket is event-listener based (addEventListener),
    // not the DOM onopen/onmessage handler properties.
    const ws = new WebSocket(url) as WebSocket
    const timer = setTimeout(() => { try { ws.close() } catch {} ; reject(new Error('Deriv timeout')) }, TIMEOUT)
    ws.addEventListener('open', () => {
      if (token) ws.send(JSON.stringify({ authorize: token }))
      ws.send(JSON.stringify({ ticks: symbol, subscribe: 0 }))
    })
    ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { tick?: { quote?: number; symbol?: string }; error?: { message?: string } }
        if (msg.error) { clearTimeout(timer); ws.close(); reject(new Error(msg.error.message ?? 'Deriv error')); return }
        if (msg.tick && typeof msg.tick.quote === 'number') {
          clearTimeout(timer); ws.close()
          resolve({ symbol: msg.tick.symbol ?? symbol, price: msg.tick.quote, source: 'deriv', ts: Date.now() })
        }
      } catch { /* keep waiting */ }
    })
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Deriv connection failed')) })
  })
}

/** Unified real-time quote with provider failover. */
export async function realtimeQuote(env: Bindings, symbol: string, db?: D1Database): Promise<Quote> {
  const sym = symbol.toUpperCase().trim()
  const errors: string[] = []
  // Synthetic/volatility indices -> Deriv
  if (/^(R_|BOOM|CRASH|VOL|1HZ|JD|STEP)/i.test(sym) || /^V\d+/i.test(sym)) {
    try { return await derivTick(env, sym) } catch (e) { errors.push(`deriv: ${e instanceof Error ? e.message : e}`) }
  }
  // Try Finnhub then Alpha Vantage.
  try { return await finnhubQuote(env, sym, db) } catch (e) { errors.push(`finnhub: ${e instanceof Error ? e.message : e}`) }
  try { return await alphaQuote(env, sym, db) } catch (e) { errors.push(`alphavantage: ${e instanceof Error ? e.message : e}`) }
  try { return await derivTick(env, sym) } catch (e) { errors.push(`deriv: ${e instanceof Error ? e.message : e}`) }
  throw new Error(`All real-time providers failed for ${sym}. ${errors.join(' | ')}`)
}

// ---- Alpha Vantage time series (for charts) ----
export async function alphaSeries(env: Bindings, symbol: string, db?: D1Database): Promise<{ symbol: string; points: { t: string; close: number }[] }> {
  const key = await pickKey(env, db, 'alphavantage')
  if (!key) throw new Error('Alpha Vantage not configured')
  const res = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=5min&outputsize=compact&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`AlphaVantage ${res.status}`)
  const d = (await res.json()) as { 'Time Series (5min)'?: Record<string, { '4. close': string }> }
  const series = d['Time Series (5min)'] ?? {}
  const points = Object.entries(series).map(([t, v]) => ({ t, close: parseFloat(v['4. close']) })).filter((p) => isFinite(p.close)).reverse()
  return { symbol, points }
}

export function realtimeStatus(env: Bindings) {
  return {
    finnhub: parsePool(env.FINNHUB_KEYS_JSON).length,
    alphavantage: parsePool(env.ALPHAVANTAGE_KEYS_JSON).length,
    deriv: env.DERIV_TOKEN ? 1 : 0,
  }
}
