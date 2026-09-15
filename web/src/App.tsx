import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listChats, createChat, getMessages, sendChat,
  marketSymbols, marketAnalyze, marketStrategies, marketBacktest,
  cryptoOp, transformData, textStats,
  type ChatSummary, type SymbolInfo,
} from './api'
import { THEMES, applyTheme, getTheme } from './theme'

type View = 'home' | 'chat' | 'projects' | 'artifacts' | 'studio' | 'settings'
type Msg = { role: 'user' | 'assistant'; content: string; ts: number; tool?: string | null }

const STARTERS = [
  'What are you working through?',
  'Bring a question, a draft, or a half-formed idea.',
  'Think through a decision',
  'Shape some notes',
  'A polished brief or note',
  'A structured comparison or dataset',
]

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
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast, show } = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshChats = useCallback(async () => {
    try { setChats((await listChats()).chats) } catch { /* backend optional */ }
  }, [])

  useEffect(() => { refreshChats() }, [refreshChats])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

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
    } catch (e) { show('Could not reach the backend') }
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

  const activeTitle = chats.find((c) => c.id === activeChat)?.title ?? 'New conversation'

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Nova</span>
          <span className="brand-tag">Quiet intelligence</span>
        </div>
        <button className="btn primary" onClick={() => newChat()}>＋ New chat</button>
        <nav className="nav-group">
          <div className="nav-label">Your space</div>
          <NavItem label="Home" icon="⌂" active={view === 'home'} onClick={() => { setView('home'); setNavOpen(false) }} />
          <NavItem label="Chats" icon="❝" active={view === 'chat'} onClick={() => { setView('chat'); setNavOpen(false) }} />
          <NavItem label="Projects" icon="▦" active={view === 'projects'} onClick={() => { setView('projects'); setNavOpen(false) }} />
          <NavItem label="Artifacts" icon="◈" active={view === 'artifacts'} onClick={() => { setView('artifacts'); setNavOpen(false) }} />
          <NavItem label="Studio" icon="⚗" active={view === 'studio'} onClick={() => { setView('studio'); setNavOpen(false) }} />
          <NavItem label="Settings" icon="⚙" active={view === 'settings'} onClick={() => { setView('settings'); setNavOpen(false) }} />
        </nav>
        <div className="nav-group" style={{ flex: 1 }}>
          <div className="nav-label">Recent · Chats are sorted by recent activity</div>
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
            <button className="icon-btn" style={{ display: 'none' }} onClick={() => setNavOpen(!navOpen)}>☰</button>
            <div>
              <div className="crumb">Nova / {view === 'chat' ? 'Chats' : view[0].toUpperCase() + view.slice(1)}</div>
              <div className="title">{view === 'chat' ? activeTitle : view === 'home' ? 'What are you working through?' : view[0].toUpperCase() + view.slice(1)}</div>
            </div>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => show('Conversation is private to your workspace')}>Share</button>
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
                    <div className="eyebrow">Quiet intelligence</div>
                    <h1>Bring a question, a draft,<br />or a <em>half-formed idea</em>.</h1>
                    <p className="sub">This conversation is private to your workspace. Use Shift + Enter for a new line.</p>
                  </div>
                )}
                {messages.map((m, i) => <Message key={i} m={m} />)}
                {busy && (
                  <div className="msg">
                    <div className="avatar assistant">N</div>
                    <div className="bubble"><div className="role">Nova</div><div className="typing"><span /><span /><span /></div></div>
                  </div>
                )}
              </div>
            </div>
            <Composer input={input} setInput={setInput} onSend={send} busy={busy} />
          </>
        )}
        {view === 'projects' && <Projects />}
        {view === 'artifacts' && <Artifacts messages={messages} />}
        {view === 'studio' && <Studio show={show} />}
        {view === 'settings' && <Settings show={show} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
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
      <div className="eyebrow">Nova · Quiet intelligence</div>
      <h1>What are you<br /><em>working through?</em></h1>
      <p className="sub">Bring a question, a draft, or a half-formed idea. A focused space for related conversations — build alongside the conversation and turn it into a useful, editable output.</p>
      <div className="chips">
        {STARTERS.slice(2).map((s) => <button key={s} className="chip" onClick={() => onStart(s)}>{s}</button>)}
      </div>
    </div>
  )
}

function Message({ m }: { m: Msg }) {
  const isUser = m.role === 'user'
  return (
    <div className={`msg ${isUser ? 'user' : 'assistant'}`}>
      <div className={`avatar ${isUser ? 'user' : 'assistant'}`}>{isUser ? 'You' : 'N'}</div>
      <div className="bubble">
        <div className="role">{isUser ? 'You' : 'Nova'}{m.tool ? ` · used ${m.tool}` : ''}</div>
        <div className="body">{m.content}</div>
        <div className="time">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  )
}

function Composer({ input, setInput, onSend, busy }: { input: string; setInput: (s: string) => void; onSend: () => void; busy: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="box">
          <textarea
            ref={ref}
            rows={1}
            value={input}
            placeholder="What are you working through?"
            onChange={(e) => { setInput(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 180) + 'px' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          />
          <button className="icon-btn" title="Voice input" onClick={() => alert('Voice input is not supported in this browser.')}>🎙</button>
          <button className="icon-btn send" title="Send" disabled={busy || !input.trim()} onClick={onSend}>↑</button>
        </div>
        <div className="hint">Use Shift + Enter for a new line · Nova uses contextual drafting suggestions</div>
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
  const [cryptoText, setCryptoText] = useState('Nova — Quiet intelligence')
  const [hashOut, setHashOut] = useState('')
  const [transformIn, setTransformIn] = useState('{"hello":"world","n":42}')
  const [transformOut, setTransformOut] = useState('')
  const [textIn, setTextIn] = useState('')
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    marketSymbols().then((r) => setSymbols(r.symbols)).catch(() => {})
    marketStrategies().then((r) => { setStrategies(r.strategies); setStrategy(r.strategies[0]?.id ?? '') }).catch(() => {})
  }, [])

  async function runAnalysis() {
    setBusy(true)
    try { setAnalysis(await marketAnalyze(symbol, timeframe)); show('Analysis complete') }
    catch (e) { show('Analysis failed — is the backend reachable?') }
    finally { setBusy(false) }
  }
  async function runBacktest() {
    setBusy(true)
    try { setBacktest(await marketBacktest(symbol, timeframe, strategy || undefined)); show('Backtest complete') }
    catch { show('Backtest failed') }
    finally { setBusy(false) }
  }
  async function runHash() {
    try { const r = await cryptoOp({ op: 'hash', algorithm: 'SHA-256', text: cryptoText }); setHashOut(String(r.hex ?? '')) } catch { show('Hash failed') }
  }
  async function runTransform(to: string) {
    try { setTransformOut((await transformData('json', to, transformIn)).output) } catch (e) { setTransformOut(e instanceof Error ? e.message : 'Transform failed') }
  }
  async function runStats() {
    try { setStats(await textStats(textIn)) } catch { show('Text analysis failed') }
  }

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

/* ---------- Settings: full theme engine + preferences ---------- */
function Settings({ show }: { show: (s: string) => void }) {
  const [theme, setTheme] = useState(localStorage.getItem('nova.theme') ?? 'warm-paper')
  const [timestamps, setTimestamps] = useState(true)
  const [toolStatus, setToolStatus] = useState(true)
  const [sounds, setSounds] = useState(false)
  const [hints, setHints] = useState(true)

  function pick(id: string) {
    setTheme(id)
    localStorage.setItem('nova.theme', id)
    applyTheme(id)
    show(`Theme: ${getTheme(id).label}`)
  }

  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Shape your workspace</h2><p>Appearance &amp; accessibility, writing &amp; chat, and workspace preferences.</p></div>

      <div className="pref-section">
        <h3>Appearance &amp; accessibility</h3>
        <p className="desc">Change message surface geometry, fonts, and theme.</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <div key={t.id} className={`theme-swatch${t.id === theme ? ' active' : ''}`} onClick={() => pick(t.id)}>
              <div className="prev" style={{ background: t.background }}>
                <div className="bar" style={{ background: t.accent }} />
              </div>
              <div className="nm">{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <h3>Writing &amp; chat</h3>
        <p className="desc">Check text as you write and show helpful hints.</p>
        <PrefToggle label="Show timestamps" sub="Used for timestamps and schedules." on={timestamps} set={setTimestamps} />
        <PrefToggle label="Show tool status" sub="Show progress labels for long-running tools." on={toolStatus} set={setToolStatus} />
        <PrefToggle label="Show helpful hints" sub="Use Nova's contextual drafting suggestions." on={hints} set={setHints} />
        <PrefToggle label="Sound effects" sub="Use quiet interface sounds." on={sounds} set={setSounds} />
      </div>

      <div className="pref-section">
        <h3>Workspace</h3>
        <p className="desc">This conversation is private to your workspace.</p>
        <div className="pref-row"><div><div className="lbl">Backend</div><div className="sub">Cloudflare Workers + D1 edge API</div></div><span className="chip" style={{ cursor: 'default' }}>webapp-9ek.pages.dev</span></div>
      </div>
    </div></div>
  )
}

function PrefToggle({ label, sub, on, set }: { label: string; sub: string; on: boolean; set: (b: boolean) => void }) {
  return (
    <div className="pref-row">
      <div><div className="lbl">{label}</div><div className="sub">{sub}</div></div>
      <button className={`toggle${on ? ' on' : ''}`} onClick={() => set(!on)} aria-label={label} />
    </div>
  )
}
