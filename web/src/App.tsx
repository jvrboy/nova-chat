import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listChats, createChat, getMessages, sendChat,
  marketSymbols, marketAnalyze, marketStrategies, marketBacktest,
  cryptoOp, transformData, textStats,
  type ChatSummary, type SymbolInfo,
} from './api'
import { THEMES, applyTheme, getTheme } from './theme'
import { CATEGORIES, loadSettings, saveSettings, countSettings, type SettingDef, type SettingsValues } from './settings'
import { applyFonts, loadFontSettings, saveFontSettings, DEFAULT_FONTS, FONTS, type FontSlot, FONT_SLOTS } from './fonts'

type View = 'home' | 'chat' | 'projects' | 'starred' | 'artifacts' | 'studio' | 'customise' | 'settings'
type Msg = { role: 'user' | 'assistant'; content: string; ts: number; tool?: string | null }

const STARTERS = [
  'Think through a decision',
  'Shape some notes',
  'A polished brief or note',
  'A structured comparison or dataset',
]

const STAR_KEY = 'nova.starred'

function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((msg: string) => {
    setToast(msg)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2600)
  }, [])
  return { toast, show }
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [navOpen, setNavOpen] = useState(false)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [starred, setStarred] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(STAR_KEY) ?? '[]') } catch { return [] } })
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<SettingsValues>(loadSettings)
  const { toast, show } = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshChats = useCallback(async () => {
    try { setChats((await listChats()).chats) } catch { /* backend optional */ }
  }, [])

  useEffect(() => { refreshChats() }, [refreshChats])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

  // Apply appearance-related settings live.
  useEffect(() => {
    const scale = Number(settings['f.scale'] ?? 100)
    const radius = Number(settings['a.borderRadius'] ?? 65) / 100
    document.documentElement.style.setProperty('--nova-font-scale', `${scale}%`)
    document.documentElement.style.setProperty('--radius', `${(0.65 * radius).toFixed(3)}rem`)
    saveSettings(settings)
  }, [settings])

  function toggleStar(id: string) {
    setStarred((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
      localStorage.setItem(STAR_KEY, JSON.stringify(next))
      return next
    })
  }

  async function openChat(id: string) {
    setActiveChat(id); setView('chat'); setNavOpen(false)
    try {
      const rows = (await getMessages(id)).messages
      setMessages(rows.filter((r) => r.role === 'user' || r.role === 'assistant').map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content, ts: Date.parse(r.created_at), tool: r.tool_name })))
    } catch { setMessages([]) }
  }

  async function newChat(seed?: string) {
    try {
      const c = await createChat()
      setActiveChat(c.id); setMessages([]); setView('chat'); setNavOpen(false)
      if (seed) setInput(seed)
      refreshChats()
    } catch { show('Could not reach the backend') }
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    let chatId = activeChat
    if (!chatId) {
      try { chatId = (await createChat()).id; setActiveChat(chatId); setView('chat') } catch { show('Backend unreachable'); return }
    }
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }])
    setBusy(true)
    try {
      const res = await sendChat(chatId, text)
      setMessages((m) => [...m, { role: 'assistant', content: res.assistantMessage.text, ts: Date.now(), tool: res.assistantMessage.tool }])
      refreshChats()
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry — I couldn't get a reply from the backend. ${e instanceof Error ? e.message : ''}`, ts: Date.now() }])
    } finally { setBusy(false) }
  }

  const activeTitle = chats.find((c) => c.id === activeChat)?.title ?? ''
  const starredChats = chats.filter((c) => starred.includes(c.id))

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Nova</span>
        </div>
        <button className="btn primary" onClick={() => newChat()}>＋ New chat</button>
        <nav className="nav-group">
          <NavItem label="Chats" icon="❝" active={view === 'chat'} onClick={() => { setView('chat'); setNavOpen(false) }} />
          <NavItem label="Projects" icon="▦" active={view === 'projects'} onClick={() => { setView('projects'); setNavOpen(false) }} />
          <NavItem label="Starred" icon="★" active={view === 'starred'} onClick={() => { setView('starred'); setNavOpen(false) }} />
          <NavItem label="Artifacts" icon="◈" active={view === 'artifacts'} onClick={() => { setView('artifacts'); setNavOpen(false) }} />
          <NavItem label="Studio" icon="⚗" active={view === 'studio'} onClick={() => { setView('studio'); setNavOpen(false) }} />
          <NavItem label="Customise" icon="✦" active={view === 'customise'} onClick={() => { setView('customise'); setNavOpen(false) }} />
          <NavItem label="Settings" icon="⚙" active={view === 'settings'} onClick={() => { setView('settings'); setNavOpen(false) }} />
        </nav>
        <div className="nav-group" style={{ flex: 1, minHeight: 0 }}>
          <div className="nav-label">Recent chats</div>
          <div className="chat-list">
            {chats.slice(0, 20).map((c) => (
              <div key={c.id} className={`chat-row${c.id === activeChat ? ' active' : ''}`} onClick={() => openChat(c.id)}>
                <div className="t">{c.title}</div>
                <div className="s">{new Date(c.updated_at).toLocaleDateString()}</div>
              </div>
            ))}
            {!chats.length && <div className="chat-row"><div className="s">No conversations yet.</div></div>}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div>
              <div className="crumb">{view === 'chat' ? 'Chats' : view === 'home' ? 'Home' : view[0].toUpperCase() + view.slice(1)}</div>
              <div className="title">{view === 'chat' ? (activeTitle || 'Chat') : viewTitle(view)}</div>
            </div>
          </div>
          <div className="actions">
            {view === 'chat' && activeChat && (
              <button className="btn ghost" onClick={() => { toggleStar(activeChat); show(starred.includes(activeChat) ? 'Removed from starred' : 'Starred conversation') }}>
                {starred.includes(activeChat) ? '★ Starred' : '☆ Star'}
              </button>
            )}
            <button className="btn" onClick={() => newChat()}>New chat</button>
          </div>
        </div>

        {view === 'home' && <Home onStart={(s) => newChat(s)} />}
        {view === 'chat' && (
          <>
            <div className="chat-scroll" ref={scrollRef}>
              <div className="chat-inner">
                {!messages.length && (
                  <div className="hero" style={{ padding: '3rem 1rem' }}>
                    <h1>What are you <em>working on?</em></h1>
                    <p className="sub">A focused space for related conversations — turn a chat into a useful, editable output.</p>
                  </div>
                )}
                {messages.map((m, i) => <Message key={i} m={m} settings={settings} />)}
                {busy && (
                  <div className="msg">
                    <div className="avatar assistant">N</div>
                    <div className="bubble"><div className="role">Nova</div><div className="typing"><span /><span /><span /></div></div>
                  </div>
                )}
              </div>
            </div>
            <Composer input={input} setInput={setInput} onSend={send} busy={busy} settings={settings} />
          </>
        )}
        {view === 'projects' && <Projects />}
        {view === 'starred' && <Starred chats={starredChats} onOpen={openChat} onUnstar={toggleStar} />}
        {view === 'artifacts' && <Artifacts messages={messages} />}
        {view === 'studio' && <Studio show={show} />}
        {view === 'customise' && <Customise show={show} />}
        {view === 'settings' && <Settings values={settings} onChange={setSettings} show={show} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function viewTitle(v: View): string {
  switch (v) {
    case 'home': return 'What are you working on?'
    case 'chat': return 'Chat'
    case 'projects': return 'Projects'
    case 'starred': return 'Starred'
    case 'artifacts': return 'Artifacts'
    case 'studio': return 'Studio'
    case 'customise': return 'Customise'
    case 'settings': return 'Settings'
  }
}

function NavItem({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick}>
      <span className="dot" /><span style={{ width: 18, textAlign: 'center' }}>{icon}</span>{label}
    </button>
  )
}

function Home({ onStart }: { onStart: (s: string) => void }) {
  return (
    <div className="hero">
      <h1>What are you<br /><em>working on?</em></h1>
      <p className="sub">A focused space for related conversations — bring a question or a draft and turn it into a useful, editable output.</p>
      <div className="chips">
        {STARTERS.map((s) => <button key={s} className="chip" onClick={() => onStart(s)}>{s}</button>)}
      </div>
    </div>
  )
}

function Message({ m, settings }: { m: Msg; settings: SettingsValues }) {
  const isUser = m.role === 'user'
  const showTs = settings['c.timestamps'] !== false
  const showAv = settings['c.avatars'] !== false
  return (
    <div className={`msg ${isUser ? 'user' : 'assistant'}`}>
      {showAv && <div className={`avatar ${isUser ? 'user' : 'assistant'}`}>{isUser ? 'You' : 'N'}</div>}
      <div className="bubble">
        <div className="role">{isUser ? 'You' : 'Nova'}{m.tool ? ` · used ${m.tool}` : ''}</div>
        <div className="body">{m.content}</div>
        {showTs && <div className="time">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
      </div>
    </div>
  )
}

function Composer({ input, setInput, onSend, busy, settings }: { input: string; setInput: (s: string) => void; onSend: () => void; busy: boolean; settings: SettingsValues }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const enterSend = settings['c.enterSend'] !== false
  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="box">
          <textarea
            ref={ref}
            rows={Number(settings['c.composerRows'] ?? 1)}
            value={input}
            placeholder="Type a message…"
            onChange={(e) => { setInput(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, Number(settings['c.composerMax'] ?? 180)) + 'px' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && enterSend) { e.preventDefault(); onSend() } }}
          />
          <button className="icon-btn" title="Voice input" onClick={() => alert('Voice input is not supported in this browser.')}>🎙</button>
          <button className="icon-btn send" title="Send" disabled={busy || !input.trim()} onClick={onSend}>↑</button>
        </div>
      </div>
    </div>
  )
}

function Projects() {
  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Projects</h2><p>A focused space for related conversations. Tell Nova how to work in this project.</p></div>
      <div className="card-grid">
        {[
          { ic: '▦', t: 'New project', d: 'Group chats, notes, and artifacts around one effort.' },
          { ic: '❝', t: 'Research brief', d: 'Steps, milestones, and next actions in one place.' },
          { ic: '◈', t: 'Drafting space', d: 'Turn conversations into polished, editable output.' },
        ].map((c) => <div key={c.t} className="card"><div className="ic">{c.ic}</div><h3>{c.t}</h3><p>{c.d}</p></div>)}
      </div>
    </div></div>
  )
}

function Starred({ chats, onOpen, onUnstar }: { chats: ChatSummary[]; onOpen: (id: string) => void; onUnstar: (id: string) => void }) {
  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Starred</h2><p>Your starred conversations.</p></div>
      {!chats.length ? (
        <div className="artifact-empty"><div className="big">No starred chats</div><div>Star a conversation to find it here.</div></div>
      ) : (
        <div className="card-grid">
          {chats.map((c) => (
            <div key={c.id} className="card" onClick={() => onOpen(c.id)}>
              <div className="ic">★</div>
              <h3>{c.title}</h3>
              <p>{new Date(c.updated_at).toLocaleString()}</p>
              <button className="btn ghost" style={{ marginTop: '0.6rem' }} onClick={(e) => { e.stopPropagation(); onUnstar(c.id) }}>Unstar</button>
            </div>
          ))}
        </div>
      )}
    </div></div>
  )
}

function Artifacts({ messages }: { messages: Msg[] }) {
  const artifacts = messages.filter((m) => m.role === 'assistant' && m.content.length > 240)
  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Artifacts</h2><p>Turn your conversation into a useful, editable output. Show document and code previews.</p></div>
      {!artifacts.length ? (
        <div className="artifact-empty"><div className="big">Nothing here yet</div><div>Long-form Nova replies will appear here as artifacts.</div></div>
      ) : (
        <div className="card-grid">
          {artifacts.map((m, i) => (
            <div key={i} className="card"><div className="ic">◈</div><h3>Artifact {i + 1}</h3><p>{m.content.slice(0, 120)}…</p></div>
          ))}
        </div>
      )}
    </div></div>
  )
}

/* ---------- Studio: wires the new backend capabilities ---------- */
function Studio({ show }: { show: (s: string) => void }) {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([])
  const [symbol, setSymbol] = useState('EURUSD')
  const [timeframe, setTimeframe] = useState('1h')
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([])
  const [strategy, setStrategy] = useState('')
  const [analysis, setAnalysis] = useState<{ overallBias: string; overallConfidence: number; commentary: string } | null>(null)
  const [backtest, setBacktest] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const [cryptoText, setCryptoText] = useState('Nova')
  const [hashOut, setHashOut] = useState('')
  const [transformIn, setTransformIn] = useState('{"hello":"world","n":42}')
  const [transformOut, setTransformOut] = useState('')
  const [textIn, setTextIn] = useState('')
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    marketSymbols().then((r) => setSymbols(r.symbols)).catch(() => {})
    marketStrategies().then((r) => { setStrategies(r.strategies); setStrategy(r.strategies[0]?.id ?? '') }).catch(() => {})
  }, [])

  async function runAnalysis() { setBusy(true); try { setAnalysis(await marketAnalyze(symbol, timeframe)); show('Analysis complete') } catch { show('Analysis failed — is the backend reachable?') } finally { setBusy(false) } }
  async function runBacktest() { setBusy(true); try { setBacktest(await marketBacktest(symbol, timeframe, strategy || undefined)); show('Backtest complete') } catch { show('Backtest failed') } finally { setBusy(false) } }
  async function runHash() { try { const r = await cryptoOp({ op: 'hash', algorithm: 'SHA-256', text: cryptoText }); setHashOut(String(r.hex ?? '')) } catch { show('Hash failed') } }
  async function runTransform(to: string) { try { setTransformOut((await transformData('json', to, transformIn)).output) } catch (e) { setTransformOut(e instanceof Error ? e.message : 'Transform failed') } }
  async function runStats() { try { setStats(await textStats(textIn)) } catch { show('Text analysis failed') } }

  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Studio</h2><p>Workspace tools powered by the Nova edge backend — market analysis engine and insights.</p></div>

      <div className="pref-section">
        <h3>Market analysis</h3>
        <p className="desc">Unified technical analysis: regime, structure, Wyckoff, supply/demand, confluence, and a trade plan.</p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {symbols.map((s) => <option key={s.id} value={s.id}>{s.id} — {s.name}</option>)}
            {!symbols.length && <option value="EURUSD">EURUSD</option>}
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            {['15m', '1h', '4h', '1d'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn primary" disabled={busy} onClick={runAnalysis}>{busy ? 'Running…' : 'Analyze'}</button>
        </div>
        {analysis && (
          <div>
            <div style={{ marginBottom: '0.5rem' }}>
              <span className="chip" style={{ cursor: 'default', borderColor: analysis.overallBias === 'BULLISH' ? 'var(--accent-green)' : analysis.overallBias === 'BEARISH' ? 'var(--accent)' : 'var(--line-strong)' }}>
                {analysis.overallBias} · {(analysis.overallConfidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', lineHeight: 1.65, fontSize: '0.95rem' }}>{analysis.commentary}</p>
          </div>
        )}
      </div>

      <div className="pref-section">
        <h3>Strategy backtest</h3>
        <p className="desc">Run a built-in strategy over the symbol's bars and inspect the metrics.</p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn" disabled={busy} onClick={runBacktest}>Run backtest</button>
        </div>
        {backtest && (
          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {(['trades', 'winRate', 'netProfit', 'totalReturn', 'maxDrawdown', 'sharpe'] as const).map((k) => (
              <div key={k} className="card" style={{ padding: '0.8rem', cursor: 'default' }}>
                <div className="s" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>{k}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.05rem' }}>
                  {typeof backtest[k] === 'number' ? (Math.abs(Number(backtest[k])) < 10 ? Number(backtest[k]).toFixed(2) : Math.round(Number(backtest[k]))) : String(backtest[k] ?? '—')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pref-section">
        <h3>Crypto toolkit</h3>
        <p className="desc">SHA-256 hashing, HMAC, UUIDs, and secure random — computed at the edge.</p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input type="text" style={{ flex: 1, minWidth: 200 }} value={cryptoText} onChange={(e) => setCryptoText(e.target.value)} />
          <button className="btn" onClick={runHash}>SHA-256</button>
        </div>
        {hashOut && <pre style={{ background: 'var(--paper-deep)', padding: '0.7rem', borderRadius: 'var(--radius)', fontSize: '0.78rem', overflowX: 'auto', marginTop: '0.7rem' }}>{hashOut}</pre>}
      </div>

      <div className="pref-section">
        <h3>Data transformer</h3>
        <p className="desc">Convert between JSON, CSV, YAML, and Base64.</p>
        <textarea
          style={{ width: '100%', minHeight: 80, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', background: 'var(--background)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', padding: '0.6rem', color: 'var(--foreground)' }}
          value={transformIn} onChange={(e) => setTransformIn(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '0.5rem', margin: '0.6rem 0' }}>
          {['csv', 'yaml', 'base64'].map((t) => <button key={t} className="btn ghost" style={{ border: '1px solid var(--line-strong)' }} onClick={() => runTransform(t)}>→ {t.toUpperCase()}</button>)}
        </div>
        {transformOut && <pre style={{ background: 'var(--paper-deep)', padding: '0.7rem', borderRadius: 'var(--radius)', fontSize: '0.78rem', overflowX: 'auto' }}>{transformOut}</pre>}
      </div>

      <div className="pref-section">
        <h3>Text intelligence</h3>
        <p className="desc">Word, sentence, and readability statistics.</p>
        <textarea
          style={{ width: '100%', minHeight: 80, fontFamily: 'var(--font-sans)', fontSize: '0.88rem', background: 'var(--background)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', padding: '0.6rem', color: 'var(--foreground)' }}
          placeholder="Paste text to analyse…" value={textIn} onChange={(e) => setTextIn(e.target.value)}
        />
        <button className="btn" style={{ marginTop: '0.6rem' }} onClick={runStats}>Analyse</button>
        {stats && (
          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', marginTop: '0.8rem' }}>
            {(['words', 'sentences', 'uniqueWords', 'readingTimeMinutes'] as const).map((k) => (
              <div key={k} className="card" style={{ padding: '0.8rem', cursor: 'default' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>{k}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.05rem' }}>{String(stats[k] ?? '—')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div></div>
  )
}

/* ---------- Customise: quick theme + font switching ---------- */
function Customise({ show }: { show: (s: string) => void }) {
  const [theme, setTheme] = useState(localStorage.getItem('nova.theme') ?? 'warm-paper')
  const [fonts, setFonts] = useState<Record<FontSlot, string>>(loadFontSettings)

  function pickTheme(id: string) {
    setTheme(id); localStorage.setItem('nova.theme', id); applyTheme(id); show(`Theme: ${getTheme(id).label}`)
  }
  function pickFont(slot: FontSlot, id: string) {
    const next = { ...fonts, [slot]: id }; setFonts(next); saveFontSettings(next); show('Font updated')
  }

  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Customise</h2><p>Shape the look and feel — {THEMES.length} themes and {FONT_SLOTS.length} font roles, applied instantly.</p></div>

      <div className="pref-section">
        <h3>Colour theme</h3>
        <p className="desc">Applied instantly and remembered on this device.</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <div key={t.id} className={`theme-swatch${t.id === theme ? ' active' : ''}`} onClick={() => pickTheme(t.id)}>
              <div className="prev" style={{ background: t.background }}>
                <div className="bar" style={{ background: t.accent }} />
                <div className="bar" style={{ background: t.paper, bottom: 24, opacity: 0.9, width: '45%' }} />
              </div>
              <div className="nm">{t.label}{t.dark ? ' · dark' : ''}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <h3>Typography</h3>
        <p className="desc">Pick a typeface for each role. Loaded on demand.</p>
        {FONT_SLOTS.map((slot) => (
          <div className="pref-row" key={slot}>
            <div><div className="lbl">{slot[0].toUpperCase() + slot.slice(1)} font</div><div className="sub">{slot === 'sans' ? 'Interface' : slot === 'serif' ? 'Assistant prose' : slot === 'display' ? 'Headlines' : 'Code'}</div></div>
            <select value={fonts[slot]} onChange={(e) => pickFont(slot, e.target.value)}>
              {FONTS[slot].map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        ))}
        <button className="btn ghost" style={{ marginTop: '0.6rem' }} onClick={() => { setFonts({ ...DEFAULT_FONTS }); saveFontSettings({ ...DEFAULT_FONTS }); show('Fonts reset') }}>Reset fonts</button>
      </div>
    </div></div>
  )
}

/* ---------- Settings: professional, searchable, 150+ options ---------- */
function Settings({ values, onChange, show }: { values: SettingsValues; onChange: (v: SettingsValues) => void; show: (s: string) => void }) {
  const [cat, setCat] = useState('general')
  const [query, setQuery] = useState('')

  const setVal = (id: string, val: unknown) => onChange({ ...values, [id]: val })

  const allSettings = useMemo(() => {
    const out: { def: SettingDef; catTitle: string }[] = []
    for (const c of CATEGORIES) for (const g of c.groups) for (const s of g.settings) out.push({ def: s, catTitle: c.title })
    return out
  }, [])

  const filtered = query.trim()
    ? allSettings.filter(({ def }) => (def.label + ' ' + (def.hint ?? '')).toLowerCase().includes(query.toLowerCase()))
    : null

  const activeCat = CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[0]

  return (
    <div className="settings-layout">
      <aside className="settings-nav">
        <div className="settings-search">
          <input type="text" placeholder={`Search ${countSettings()} settings…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {CATEGORIES.map((c) => {
          const n = c.groups.reduce((m, g) => m + g.settings.length, 0)
          return (
            <button key={c.id} className={`settings-nav-item${!filtered && c.id === cat ? ' active' : ''}`} onClick={() => { setCat(c.id); setQuery('') }}>
              <span>{c.title}</span><span className="count">{n}</span>
            </button>
          )
        })}
        <div style={{ marginTop: 'auto', padding: '0.6rem 0.2rem', fontSize: '0.74rem', color: 'var(--ink-faint)' }}>
          {countSettings()} settings · saved on this device
        </div>
      </aside>

      <div className="settings-body">
        {filtered ? (
          <div className="pref-section">
            <h3>Search results</h3>
            <p className="desc">{filtered.length} setting{filtered.length === 1 ? '' : 's'} matching “{query}”.</p>
            {filtered.map(({ def }) => <SettingRow key={def.id} def={def} value={values[def.id]} onChange={setVal} />)}
            {!filtered.length && <p style={{ color: 'var(--ink-faint)' }}>No settings match your search.</p>}
          </div>
        ) : (
          <>
            <div className="panel-head" style={{ marginBottom: '1.2rem' }}>
              <h2>{activeCat.title}</h2>
              <p>{activeCat.blurb}</p>
            </div>
            {activeCat.groups.map((grp) => (
              <div className="pref-section" key={grp.name}>
                <h3>{grp.name}</h3>
                <p className="desc">{grp.settings.length} options</p>
                {grp.settings.map((def) => <SettingRow key={def.id} def={def} value={values[def.id]} onChange={setVal} />)}
              </div>
            ))}
          </>
        )}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
          <button className="btn ghost" onClick={() => { const d = loadSettings(); onChange(d); show('Settings reloaded') }}>Reload</button>
          <button className="btn" onClick={() => { localStorage.removeItem('nova.settings'); onChange(loadSettings()); show('Settings reset to defaults') }}>Reset to defaults</button>
        </div>
      </div>
    </div>
  )
}

function SettingRow({ def, value, onChange }: { def: SettingDef; value: unknown; onChange: (id: string, val: unknown) => void }) {
  const val = value === undefined ? def.def : value
  return (
    <div className="pref-row">
      <div>
        <div className="lbl">{def.label}</div>
        {def.hint && <div className="sub">{def.hint}</div>}
      </div>
      <div className="pref-control">
        {def.type === 'toggle' && (
          <button className={`toggle${val ? ' on' : ''}`} aria-label={def.label} onClick={() => onChange(def.id, !val)} />
        )}
        {def.type === 'select' && (
          <select value={String(val)} onChange={(e) => onChange(def.id, e.target.value)}>
            {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {def.type === 'slider' && (
          <span className="slider-wrap">
            <input type="range" min={def.min} max={def.max} step={def.step} value={Number(val)} onChange={(e) => onChange(def.id, Number(e.target.value))} />
            <span className="slider-val">{Number(val)}{def.unit ?? ''}</span>
          </span>
        )}
        {def.type === 'color' && (
          <input type="color" value={String(val)} onChange={(e) => onChange(def.id, e.target.value)} style={{ width: 44, height: 30, padding: 2, border: '1px solid var(--line-strong)', borderRadius: 6, background: 'var(--background)' }} />
        )}
        {def.type === 'text' && (
          <input type="text" value={String(val)} placeholder="—" onChange={(e) => onChange(def.id, e.target.value)} style={{ minWidth: 220 }} />
        )}
      </div>
    </div>
  )
}
