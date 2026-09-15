import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { appendAudit } from '../lib/db'
import {
  SYMBOLS,
  getSymbol,
  generateBars,
  lastBar,
  changePct,
  computeSeries,
  lastValues,
  analyzeSymbol,
  cascadingBias,
  runSymbol,
  smtScan,
  runDebate,
  sessionFor,
  hourlyProfile,
  STRATEGIES,
  runBacktest,
  formatPrice,
  type Timeframe,
  type Bar,
} from '../lib/market'

const market = new Hono<AppEnv>()

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '1d', '1w']

function validSymbol(id: string): boolean {
  return SYMBOLS.some((s) => s.id === id)
}

function validTimeframe(tf: string): tf is Timeframe {
  return (TIMEFRAMES as string[]).includes(tf)
}

function parseBars(body: unknown): Bar[] | null {
  if (!body || typeof body !== 'object') return null
  const arr = (body as Record<string, unknown>).bars
  if (!Array.isArray(arr)) return null
  const bars: Bar[] = []
  for (const b of arr) {
    if (!b || typeof b !== 'object') return null
    const o = b as Record<string, unknown>
    const bar: Bar = {
      timestamp: Number(o.timestamp) || Date.now(),
      open: Number(o.open),
      high: Number(o.high),
      low: Number(o.low),
      close: Number(o.close),
      volume: Number(o.volume) || 0,
    }
    if (!isFinite(bar.open) || !isFinite(bar.high) || !isFinite(bar.low) || !isFinite(bar.close)) return null
    bars.push(bar)
  }
  return bars.length >= 2 ? bars : null
}

// Resolve bars: use caller-provided OHLCV bars if present, else deterministic synthetic data.
function resolveBars(c: { req: { json: () => Promise<unknown>; param: (k: string) => string; query: (k: string) => string | undefined } }, body: unknown): { bars: Bar[]; source: 'provided' | 'synthetic'; symbol: string; timeframe: Timeframe } | { error: string; status: number } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const symbol = String(b.symbol ?? c.req.query('symbol') ?? 'EURUSD')
  const timeframe = String(b.timeframe ?? c.req.query('timeframe') ?? '1h')
  if (!validSymbol(symbol)) return { error: `Unknown symbol: ${symbol}. See GET /api/market/symbols.`, status: 400 }
  if (!validTimeframe(timeframe)) return { error: `Unknown timeframe: ${timeframe}. Valid: ${TIMEFRAMES.join(', ')}`, status: 400 }
  const provided = parseBars(body)
  if (provided) return { bars: provided, source: 'provided', symbol, timeframe: timeframe as Timeframe }
  const count = Math.min(Math.max(Number(b.count ?? c.req.query('count') ?? 200) || 200, 40), 480)
  return { bars: generateBars(symbol, timeframe as Timeframe, count), source: 'synthetic', symbol, timeframe: timeframe as Timeframe }
}

// List all supported symbols.
market.get('/symbols', (c) => {
  return c.json({ count: SYMBOLS.length, symbols: SYMBOLS })
})

// Latest quote + recent change for a symbol/timeframe.
market.get('/quote/:symbol', (c) => {
  const symbol = c.req.param('symbol')
  const tf = (c.req.query('timeframe') ?? '1h') as Timeframe
  if (!validSymbol(symbol)) return c.json({ error: `Unknown symbol: ${symbol}` }, 400)
  if (!validTimeframe(tf)) return c.json({ error: `Unknown timeframe: ${tf}` }, 400)
  const bar = lastBar(symbol, tf)
  const bars = generateBars(symbol, tf, 60)
  const info = getSymbol(symbol)
  return c.json({
    symbol,
    timeframe: tf,
    name: info.name,
    class: info.class,
    price: bar.close,
    priceFormatted: formatPrice(symbol, bar.close),
    changePct24: changePct(bars, 24),
    timestamp: bar.timestamp,
    source: 'synthetic',
  })
})

// OHLCV candle series.
market.get('/bars/:symbol', (c) => {
  const symbol = c.req.param('symbol')
  const tf = (c.req.query('timeframe') ?? '1h') as Timeframe
  const count = Math.min(Math.max(Number(c.req.query('count') ?? 200) || 200, 40), 480)
  if (!validSymbol(symbol)) return c.json({ error: `Unknown symbol: ${symbol}` }, 400)
  if (!validTimeframe(tf)) return c.json({ error: `Unknown timeframe: ${tf}` }, 400)
  return c.json({ symbol, timeframe: tf, count, source: 'synthetic', bars: generateBars(symbol, tf, count) })
})

// Raw technical indicator series (or just the latest values).
market.post('/indicators', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const resolved = resolveBars(c, body)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status as 400)
  const names = Array.isArray((body as Record<string, unknown>).names) ? ((body as Record<string, unknown>).names as string[]) : undefined
  const series = computeSeries(resolved.bars)
  const latest = lastValues(resolved.bars, names)
  const wantSeries = (body as Record<string, unknown>).full === true
  return c.json({
    symbol: resolved.symbol,
    timeframe: resolved.timeframe,
    source: resolved.source,
    bars: resolved.bars.length,
    latest,
    availableIndicators: Object.keys(series),
    ...(wantSeries ? { series } : {}),
  })
})

// Full unified analysis (regime, S/R, Wyckoff, fibonacci, structure, supply/demand,
// divergence, candlestick patterns, confluence, trade plan, natural-language commentary).
market.post('/analyze', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const body = await c.req.json().catch(() => ({}))
  const resolved = resolveBars(c, body)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status as 400)
  const lookback = Math.min(Math.max(Number((body as Record<string, unknown>).lookback ?? 20) || 20, 10), 100)
  try {
    const analysis = analyzeSymbol(resolved.bars, resolved.symbol, resolved.timeframe, lookback)
    const id = newId('mkt')
    await c.env.DB.prepare(
      'INSERT INTO market_analysis (id, workspace_id, actor_id, symbol, timeframe, source, overall_bias, overall_confidence, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(id, workspaceId, actorId, resolved.symbol, resolved.timeframe, resolved.source, analysis.overallBias, analysis.overallConfidence, JSON.stringify(analysis), nowIso())
      .run()
    await appendAudit(c.env.DB, { workspaceId, actorId, action: 'market.analyze', resource: 'market', resourceId: resolved.symbol, risk: 'low', metadata: { bias: analysis.overallBias, source: resolved.source } })
    return c.json({ id, ...analysis, source: resolved.source })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Analysis failed' }, 400)
  }
})

// Retrieve a previously-run analysis by id.
market.get('/analysis/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT * FROM market_analysis WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ id: row.id, symbol: row.symbol, timeframe: row.timeframe, source: row.source, overallBias: row.overall_bias, overallConfidence: row.overall_confidence, result: JSON.parse(String(row.result ?? '{}')), createdAt: row.created_at })
})

// List recent analyses for the workspace.
market.get('/history', async (c) => {
  const workspaceId = c.get('workspaceId')
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 100)
  const { results } = await c.env.DB.prepare(
    'SELECT id, symbol, timeframe, source, overall_bias, overall_confidence, created_at FROM market_analysis WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(workspaceId, limit).all()
  return c.json({ count: results.length, analyses: results })
})

// Multi-timeframe cascading bias for a symbol.
market.get('/topdown/:symbol', (c) => {
  const symbol = c.req.param('symbol')
  if (!validSymbol(symbol)) return c.json({ error: `Unknown symbol: ${symbol}` }, 400)
  const order: Timeframe[] = ['1d', '4h', '1h', '15m']
  const rowsByTf: Partial<Record<Timeframe, Bar[]>> = {}
  for (const tf of order) rowsByTf[tf] = generateBars(symbol, tf, 200)
  const result = cascadingBias(rowsByTf, order)
  return c.json({ symbol, timeframes: order, source: 'synthetic', ...result })
})

// Multi-timeframe aggregated votes / signal for a symbol.
market.get('/signal/:symbol', (c) => {
  const symbol = c.req.param('symbol')
  const primary = (c.req.query('timeframe') ?? '1h') as Timeframe
  if (!validSymbol(symbol)) return c.json({ error: `Unknown symbol: ${symbol}` }, 400)
  if (!validTimeframe(primary)) return c.json({ error: `Unknown timeframe: ${primary}` }, 400)
  const tfs: Timeframe[] = ['15m', '1h', '4h', '1d']
  const barsByTf: Partial<Record<Timeframe, Bar[]>> = {}
  for (const tf of tfs) barsByTf[tf] = generateBars(symbol, tf, 200)
  const result = runSymbol(barsByTf, symbol, primary)
  return c.json({ ...result, symbol, primaryTimeframe: primary, source: 'synthetic' })
})

// Smart-money-concepts (SMT) divergence scan across correlated pairs.
market.get('/smt', (c) => {
  const tf = (c.req.query('timeframe') ?? '1h') as Timeframe
  if (!validTimeframe(tf)) return c.json({ error: `Unknown timeframe: ${tf}` }, 400)
  const pairs = smtScan(tf)
  return c.json({ timeframe: tf, source: 'synthetic', count: pairs.length, pairs })
})

// Bull-vs-bear evidence debate for a symbol.
market.post('/debate', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const resolved = resolveBars(c, body)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status as 400)
  return c.json({ symbol: resolved.symbol, timeframe: resolved.timeframe, source: resolved.source, ...runDebate(resolved.bars) })
})

// Current trading session + hourly volatility profile.
market.post('/session', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const resolved = resolveBars(c, body)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status as 400)
  return c.json({ symbol: resolved.symbol, timeframe: resolved.timeframe, source: resolved.source, session: sessionFor(), hourlyProfile: hourlyProfile(resolved.bars) })
})

// List built-in trading strategies.
market.get('/strategies', (c) => {
  return c.json({ count: STRATEGIES.length, strategies: STRATEGIES })
})

// Backtest a built-in strategy (by id) or a custom strategy definition over bars.
market.post('/backtest', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const body = await c.req.json().catch(() => ({}))
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const resolved = resolveBars(c, body)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status as 400)
  let strategy = null
  if (b.strategy && typeof b.strategy === 'object') {
    strategy = b.strategy as (typeof STRATEGIES)[number]
  } else if (typeof b.strategyId === 'string') {
    strategy = STRATEGIES.find((s) => s.id === b.strategyId) ?? null
  } else {
    strategy = STRATEGIES[0]
  }
  if (!strategy) return c.json({ error: `Unknown strategyId: ${String(b.strategyId)}. See GET /api/market/strategies.`, status: 400 } as never, 400)
  const initial = Math.min(Math.max(Number(b.initial ?? 10000) || 10000, 100), 10_000_000)
  try {
    const result = runBacktest(resolved.bars, strategy, initial)
    await appendAudit(c.env.DB, { workspaceId, actorId, action: 'market.backtest', resource: 'market', resourceId: resolved.symbol, risk: 'low', metadata: { strategy: strategy.id, source: resolved.source } })
    return c.json({ ...result, symbol: resolved.symbol, timeframe: resolved.timeframe, source: resolved.source, strategy: { id: strategy.id, name: strategy.name }, initial })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Backtest failed' }, 400)
  }
})

export default market
