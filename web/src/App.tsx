import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listChats, createChat, getMessages, sendChat,
  marketSymbols, marketAnalyze, marketStrategies, marketBacktest,
  cryptoOp, transformData, textStats,
  type ChatSummary, type SymbolInfo,
  getSyncKey, setSyncKey, pullRemoteSettings, pushRemoteSettings,
  listProjects, createProject, listProjectTasks, setTaskStatus, deleteChat, updateChat, generateMidi,
  type Project, type ProjectTask,
} from './api'
import { THEMES, applyTheme, getTheme } from './theme'
import { sounds, configureSounds, unlockAudio } from './sounds'
import { extractArtifacts, loadArtifacts, saveArtifacts, mergeArtifacts, downloadArtifact, openHtmlInNewTab, artifactIcon, type Artifact } from './artifacts'
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
    sounds.notify()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2600)
  }, [])
  return { toast, show }
}


// ---- URL routing: each view maps to a real path so refresh/deep-link works ----
const VIEW_PATH: Record<string, string> = { home: '/', chat: '/chat', projects: '/projects', starred: '/starred', artifacts: '/artifacts', studio: '/studio', customise: '/customise', settings: '/settings' }
function pathToView(pathname: string): View {
  const p = pathname.replace(/\/+$/, '') || '/'
  for (const [v, path] of Object.entries(VIEW_PATH)) if (path === p) return v as View
  return 'home'
}

export default function App() {
  const [view, setViewState] = useState<View>(() => pathToView(window.location.pathname))
  const setView = (v: View) => { setViewState(v); const path = VIEW_PATH[v] ?? '/'; if (window.location.pathname !== path) window.history.pushState({}, '', path) }
  const [artifacts, setArtifacts] = useState<Artifact[]>(loadArtifacts)
  const [navOpen, setNavOpen] = useState(false)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [starred, setStarred] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(STAR_KEY) ?? '[]') } catch { return [] } })
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<SettingsValues>(loadSettings)
  const { toast, show } = useToast()
  useEffect(() => { (window as any).__novaToast = show }, [show])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Wire the sound engine to the sound settings and unlock audio on first tap.
  useEffect(() => {
    configureSounds({
      enabled: settings['n.sounds'] === true,
      volume: Number(settings['n.volume'] ?? 50),
      sendSound: settings['n.sendSound'] === true,
      receiveSound: settings['n.receiveSound'] !== false,
    })
  }, [settings])
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    const onPop = () => setViewState(pathToView(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('popstate', onPop) }
  }, [])

  const refreshChats = useCallback(async () => {
    try { setChats((await listChats()).chats) } catch { /* backend optional */ }
  }, [])

  useEffect(() => { refreshChats() }, [refreshChats])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

  // Apply appearance-related settings live.
  useEffect(() => {
    const scale = Number(settings['f.scale'] ?? 100)
    const radius = Number(settings['a.borderRadius'] ?? 65) / 100
    const blur = Number(settings['a.blurAmount'] ?? 8)
    const uiScale = Number(settings['a.uiScale'] ?? 100) / 100
    const sideW = Number(settings['a.sidebarWidth'] ?? 288)
    const root = document.documentElement
    root.style.setProperty('--nova-font-scale', `${scale}%`)
    root.style.setProperty('--radius', `${(0.65 * radius).toFixed(3)}rem`)
    root.style.setProperty('--app-blur', `${blur}px`)
    root.style.setProperty('--ui-scale', String(uiScale))
    root.style.setProperty('--sidebar-w', `${sideW}px`)
    root.style.setProperty('--chat-scale', String(Number(settings['f.chatSize'] ?? 100) / 100))
    root.style.setProperty('--line-h', String(Number(settings['f.lineHeight'] ?? 165) / 100))
    document.body.classList.toggle('glass', settings['a.glassFx'] === true)
    document.body.classList.toggle('reduce-motion', settings['a.reduceMotion'] === true || settings['y.reduceMotionA11y'] === true)
    document.body.classList.toggle('compact', settings['a.compact'] === true)
    saveSettings(settings)
    // Push to cloud for cross-device sync (debounced-ish, best effort).
    if (settings['g.cloudSync'] !== false && getSyncKey()) pushRemoteSettings(settings)
  }, [settings])
  // Pull remote settings on load when a sync key is set.
  useEffect(() => {
    if (!getSyncKey()) return
    pullRemoteSettings().then((remote) => { if (remote && Object.keys(remote).length) setSettings((cur) => ({ ...cur, ...remote })) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const msgs = rows.filter((r) => r.role === 'user' || r.role === 'assistant').map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content, ts: Date.parse(r.created_at), tool: r.tool_name }))
      setMessages(msgs)
      // Backfill artifacts from existing conversation history (fixes pre-fix chats).
      const backfill = msgs.flatMap((m) => extractArtifacts(m))
      if (backfill.length) setArtifacts((prev) => { const next = mergeArtifacts(prev, backfill); saveArtifacts(next); return next })
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
    sounds.send()
    try {
      const res = await sendChat(chatId, text)
      sounds.receive()
      const replyMsg: Msg = { role: 'assistant', content: res.assistantMessage.text, ts: Date.now(), tool: res.assistantMessage.tool }
      setMessages((m) => [...m, replyMsg])
      const found = extractArtifacts(replyMsg)
      if (found.length) { setArtifacts((prev) => { const next = mergeArtifacts(prev, found); saveArtifacts(next); return next }); show(`Artifact created: ${found[0].title}`) }
      refreshChats()
    } catch (e) {
      sounds.error()
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry — I couldn't get a reply from the backend. ${e instanceof Error ? e.message : ''}`, ts: Date.now() }])
    } finally { setBusy(false) }
  }

  const activeTitle = chats.find((c) => c.id === activeChat)?.title ?? ''
  const starredChats = chats.filter((c) => starred.includes(c.id))

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Nova</span>
        </div>
        <button className="btn primary" onClick={() => { sounds.pop(); newChat() }}>＋ New chat</button>
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
                <div className="t" style={{ flex: 1 }}>{c.title}</div>
                <div className="s" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{new Date(c.updated_at).toLocaleDateString()}</span>
                  <button className="chat-del" title="Delete conversation" onClick={async (e) => { e.stopPropagation(); try { await deleteChat(c.id); show('Conversation deleted'); if (activeChat === c.id) { setActiveChat(null); setMessages([]) } refreshChats() } catch { show('Could not delete') } }}>×</button>
                </div>
              </div>
            ))}
            {!chats.length && <div className="chat-row"><div className="s">No conversations yet.</div></div>}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
            <button className="icon-btn nav-toggle" aria-label="Toggle navigation" onClick={() => setNavOpen(!navOpen)}>☰</button>
            <div style={{ minWidth: 0 }}>
              <div className="crumb">{view === 'chat' ? 'Chats' : view === 'home' ? 'Home' : view[0].toUpperCase() + view.slice(1)}</div>
              <div className="title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{view === 'chat' ? (activeTitle || 'Chat') : viewTitle(view)}</div>
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
        {view === 'chat' && !activeChat && <ChatsManager chats={chats} activeChat={activeChat} onOpen={openChat} onChanged={refreshChats} show={show} />}
        {view === 'chat' && activeChat !== null && (
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
            <Composer input={input} setInput={setInput} onSend={send} busy={busy} settings={settings} show={show} />
          </>
        )}
        {view === 'projects' && <Projects show={show} onOpenChat={() => setView('chat')} />}
        {view === 'starred' && <Starred chats={starredChats} onOpen={openChat} onUnstar={toggleStar} />}
        {view === 'artifacts' && <Artifacts items={artifacts} />}
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

function ChatsManager({ chats, activeChat, onOpen, onChanged, show }: { chats: ChatSummary[]; activeChat: string | null; onOpen: (id: string) => void; onChanged: () => void; show: (s: string) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState('')
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const all = selected.size === chats.length && chats.length > 0
  async function bulk(action: 'archive' | 'delete') {
    for (const id of selected) { try { action === 'delete' ? await deleteChat(id) : await updateChat(id, { archived: true }) } catch {} }
    setSelected(new Set()); onChanged(); show(action === 'delete' ? `Deleted ${selected.size} chat(s)` : `Archived ${selected.size} chat(s)`)
  }
  async function rename(id: string) { const t = name.trim(); if (!t) { setRenaming(null); return } try { await updateChat(id, { title: t }); show('Renamed'); setRenaming(null); onChanged() } catch { show('Rename failed') } }
  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Chats</h2><p>{chats.length} conversation{chats.length === 1 ? '' : 's'} — select to manage in bulk.</p></div>
      {chats.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={() => setSelected(all ? new Set() : new Set(chats.map((c) => c.id)))}>{all ? 'Clear all' : 'Select all'}</button>
          <button className="btn ghost" disabled={!selected.size} onClick={() => bulk('archive')}>Archive ({selected.size})</button>
          <button className="btn ghost" disabled={!selected.size} style={{ color: 'var(--danger)' }} onClick={() => bulk('delete')}>Delete ({selected.size})</button>
        </div>
      )}
      {!chats.length && <div className="artifact-empty"><div className="big">No conversations yet</div><div>Start a new chat from the sidebar.</div></div>}
      <div className="chat-manage-list">
        {chats.map((c) => (
          <div key={c.id} className={`chat-manage-row${selected.has(c.id) ? ' selected' : ''}`}>
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            {renaming === c.id ? (
              <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') rename(c.id); if (e.key === 'Escape') setRenaming(null) }} onBlur={() => rename(c.id)} style={{ flex: 1 }} />
            ) : (
              <span className="cmr-title" onClick={() => onOpen(c.id)} style={{ fontWeight: c.id === activeChat ? 700 : 500 }}>{c.title}</span>
            )}
            <span className="cmr-date">{new Date(c.updated_at).toLocaleDateString()}</span>
            <button className="btn ghost" style={{ padding: '0.15rem 0.5rem' }} onClick={() => { setRenaming(c.id); setName(c.title) }}>Rename</button>
          </div>
        ))}
      </div>
    </div></div>
  )
}
function MidiCard({ show }: { show: (s: string) => void }) {
  const [key, setKey] = useState('Am'); const [tempo, setTempo] = useState(122); const [style, setStyle] = useState('edm'); const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ filename: string; meta: Record<string, unknown> } | null>(null)
  async function gen() {
    setBusy(true)
    try {
      const r = await generateMidi({ key, tempo, style })
      const bin = atob(r.base64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'audio/midi' }); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url)
      setRes(r); show(`MIDI ready — ${(r.meta.events as number) ?? 0} events, ${(r.meta.sections as string[])?.length ?? 0} sections`)
    } catch { show('MIDI generation failed') } finally { setBusy(false) }
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <select value={key} onChange={(e) => setKey(e.target.value)}>{['C','Cm','D','Dm','E','Em','F','G','Am','A','Bm','B'].map((k) => <option key={k}>{k}</option>)}</select>
        <select value={style} onChange={(e) => setStyle(e.target.value)}>{['edm','house','lofi','ballad'].map((x) => <option key={x}>{x}</option>)}</select>
        <input type="range" min={70} max={160} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} style={{ flex: 1, minWidth: 120 }} />
        <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', alignSelf: 'center' }}>{tempo} BPM</span>
        <button className="btn primary" disabled={busy} onClick={gen}>{busy ? 'Composing…' : 'Generate MIDI'}</button>
      </div>
      {res && <p style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>Downloaded {res.filename} · features: {((res.meta.features as string[]) ?? []).join(', ')}</p>}
    </div>
  )
}
function NavItem({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={() => { sounds.tap(); onClick() }}>
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
        <div className="msg-actions">
          <button className="msg-act" title="Copy response" onClick={() => { navigator.clipboard?.writeText(m.content).then(() => (window as any).__novaToast?.('Copied')).catch(() => {}) }}>⧉ Copy</button>
        </div>
        {showTs && <div className="time">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
      </div>
    </div>
  )
}

function Composer({ input, setInput, onSend, busy, settings, show }: { input: string; setInput: (s: string) => void; onSend: () => void; busy: boolean; settings: SettingsValues; show: (s: string) => void }) {
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
          <button className="icon-btn" title="Voice input" onClick={() => {
            const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            if (!SR) { show('Voice input is not supported in this browser.'); return }
            try {
              const rec = new SR()
              rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
              show('Listening…')
              rec.onresult = (e: any) => { const t = e.results?.[0]?.[0]?.transcript ?? ''; if (t) setInput((input ? input + ' ' : '') + t); show('Transcribed into the draft') }
              rec.onerror = () => show('Voice input failed.')
              rec.onend = () => {}
              rec.start()
            } catch { show('Voice input failed to start.') }
          }}>🎙</button>
          <button className="icon-btn send" title="Send" disabled={busy || !input.trim()} onClick={onSend}>↑</button>
        </div>
      </div>
    </div>
  )
}

function Projects({ show, onOpenChat }: { show: (s: string) => void; onOpenChat: () => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Record<string, ProjectTask[]>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    try { setProjects((await listProjects()).projects) } catch { show('Could not load projects') } finally { setLoading(false) }
  }, [show])
  useEffect(() => { refresh() }, [refresh])

  async function add() {
    const n = name.trim(); if (!n) return
    try { await createProject(n); setName(''); show('Project created with a starter plan'); refresh() } catch { show('Could not create project') }
  }
  async function toggle(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!tasks[id]) { try { const t = (await listProjectTasks(id)).tasks; setTasks((m) => ({ ...m, [id]: t })) } catch { /* ignore */ } }
  }
  async function cycleStatus(taskId: string, projectId: string) {
    const order = ['backlog', 'todo', 'in_progress', 'blocked', 'done']
    const cur = (tasks[projectId] ?? []).find((t) => t.id === taskId)
    const next = order[(order.indexOf(cur?.status ?? 'todo') + 1) % order.length]
    try {
      await setTaskStatus(taskId, next)
      setTasks((m) => ({ ...m, [projectId]: (m[projectId] ?? []).map((t) => (t.id === taskId ? { ...t, status: next } : t)) }))
    } catch { show('Could not update task') }
  }

  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Projects</h2><p>A focused space for related conversations. Each project starts with a starter plan.</p></div>
      <div className="pref-section" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <input type="text" placeholder="New project name…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} style={{ flex: 1 }} />
          <button className="btn primary" onClick={add}>Create</button>
        </div>
      </div>
      {loading ? <p style={{ color: 'var(--ink-faint)' }}>Loading…</p> : !projects.length ? (
        <div className="artifact-empty"><div className="big">No projects yet</div><div>Create your first project above — it comes with a starter plan of tasks.</div></div>
      ) : (
        <div className="card-grid">
          {projects.map((pr) => (
            <div key={pr.id} className="card" onClick={() => toggle(pr.id)}>
              <div className="ic" style={{ color: pr.color }}>▦</div>
              <h3>{pr.name}</h3>
              <p>{pr.description || 'Project'} · {new Date(pr.updated_at).toLocaleDateString()}</p>
              {expanded === pr.id && (
                <div style={{ marginTop: '0.7rem', borderTop: '1px solid var(--line)', paddingTop: '0.6rem' }} onClick={(e) => e.stopPropagation()}>
                  {(tasks[pr.id] ?? []).map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.86rem' }}>
                      <button className="btn ghost" style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }} onClick={() => cycleStatus(t.id, pr.id)}>{t.status}</button>
                      <span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--ink-faint)' : 'inherit' }}>{t.title}</span>
                    </div>
                  ))}
                  {!tasks[pr.id]?.length && <p style={{ color: 'var(--ink-faint)', fontSize: '0.82rem' }}>No tasks.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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

function Artifacts({ items }: { items: Artifact[] }) {
  const [open, setOpen] = useState<Artifact | null>(null)
  return (
    <div className="panel-scroll"><div className="panel-inner">
      <div className="panel-head"><h2>Artifacts</h2><p>Code, documents, and media from your conversations — with native playback and preview.</p></div>
      {!items.length ? (
        <div className="artifact-empty"><div className="big">Nothing here yet</div><div>Ask Nova to build something — code, a document, or media — and it appears here.</div></div>
      ) : (
        <div className="card-grid">
          {items.map((a) => (
            <div key={a.id} className="card" onClick={() => setOpen(a)}>
              <div className="ic">{artifactIcon(a.type)}</div>
              <h3>{a.title}</h3>
              <p>{a.type}{a.language ? ` · ${a.language}` : ''} · {new Date(a.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="artifact-modal" onClick={() => setOpen(null)}>
          <div className="artifact-modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="artifact-modal-head">
              <strong>{artifactIcon(open.type)} {open.title}</strong>
              <span>
                {open.type === 'html' && <button className="btn ghost" onClick={() => openHtmlInNewTab(open)}>Open app</button>}
                {!open.previewUrl && <button className="btn ghost" onClick={() => downloadArtifact(open)}>Download</button>}
                <button className="btn" onClick={() => setOpen(null)}>Close</button>
              </span>
            </div>
            <div className="artifact-modal-content">
              {open.type === 'html' && <iframe title={open.title} sandbox="allow-scripts" srcDoc={open.content} style={{ width: '100%', height: 420, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />}
              {open.type === 'code' && <pre style={{ overflowX: 'auto', fontSize: '0.8rem', lineHeight: 1.5 }}><code>{open.content}</code></pre>}
              {open.type === 'document' && <div style={{ fontFamily: 'var(--font-serif)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{open.content}</div>}
              {open.type === 'image' && open.previewUrl && <img src={open.previewUrl} alt={open.title} style={{ maxWidth: '100%', borderRadius: 8 }} />}
              {open.type === 'audio' && open.previewUrl && <audio controls src={open.previewUrl} style={{ width: '100%' }} />}
              {open.type === 'midi' && open.previewUrl && (
                <div>
                  <audio controls src={open.previewUrl} style={{ width: '100%' }} />
                  <p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem' }}>MIDI file — <a href={open.previewUrl} target="_blank" rel="noopener">download to play in a MIDI player</a>.</p>
                </div>
              )}
            </div>
          </div>
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

      <div className="pref-section">
        <h3>MIDI composer</h3>
        <p className="desc">Professional song-structure MIDI: humanized timing & velocity, extended voicings with voice leading, motif transformation, modulation & pitch-bend automation, phrasing with rests.</p>
        <MidiCard show={show} />
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
        <div className="pref-section">
          <h3>Sync across devices</h3>
          <p className="desc">Enter the same sync key on every device to share chats and settings.</p>
          <SyncKeyRow show={show} />
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
          <button className="btn ghost" onClick={() => { const d = loadSettings(); onChange(d); show('Settings reloaded') }}>Reload</button>
          <button className="btn" onClick={() => { localStorage.removeItem('nova.settings'); onChange(loadSettings()); show('Settings reset to defaults') }}>Reset to defaults</button>
        </div>
      </div>
    </div>
  )
}

function SyncKeyRow({ show }: { show: (s: string) => void }) {
  const [key, setKey] = useState(getSyncKey())
  return (
    <div className="pref-row">
      <div><div className="lbl">Sync key</div><div className="sub">A passphrase you invent — same on all your devices.</div></div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input type="text" value={key} placeholder="e.g. my-nova-key" onChange={(e) => setKey(e.target.value)} style={{ minWidth: 200 }} />
        <button className="btn" onClick={() => { setSyncKey(key); show(key ? 'Sync enabled — reload to sync' : 'Sync key cleared') }}>Save</button>
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
