import { useState, useCallback, useEffect, useRef } from 'react'
import Panel, { Sparkline } from './Panel'
import { useApi } from '../hooks/useApi'
import { useChat, useChatAvailability, useHermesSessions, useGateways } from '../hooks/useChat'
import MessageThread from './chat/MessageThread'
import MessageBubble from './chat/MessageBubble'
import Composer from './chat/Composer'

function sourceColor(source: string) {
  return source === 'telegram' ? 'var(--hud-accent)' : 'var(--hud-primary)'
}

// ── Transcript modal (from old SessionsPanel) ────────────────────────────────

function TranscriptViewer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { data, isLoading } = useApi(`/sessions/${sessionId}/messages`, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="flex flex-col w-full max-w-3xl mx-4 rounded"
        style={{
          background: 'var(--hud-bg-panel)',
          border: '1px solid var(--hud-border)',
          maxHeight: '80vh',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b" style={{ borderColor: 'var(--hud-border)' }}>
          <div>
            <span className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--hud-primary)' }}>
              {data?.title || sessionId.slice(0, 8)}
            </span>
            {data?.source && (
              <span className="ml-2 text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>{data.source}</span>
            )}
          </div>
          <button onClick={onClose} className="text-[13px] px-2 py-0.5 cursor-pointer" style={{ color: 'var(--hud-text-dim)' }}>
            ✕ Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading && <div className="text-[13px] animate-pulse" style={{ color: 'var(--hud-text-dim)' }}>Loading transcript...</div>}
          {!isLoading && data?.messages?.length === 0 && <div className="text-[13px]" style={{ color: 'var(--hud-text-dim)' }}>No messages found.</div>}
          {!isLoading && data?.messages?.map((msg: any) => (
            <div key={msg.id}>
              <MessageBubble role={msg.role} content={msg.content} />
              {msg.token_count > 0 && (
                <div className="text-[10px] mb-1 text-right" style={{ color: 'var(--hud-text-dim)', marginTop: '-8px' }}>
                  {msg.token_count.toLocaleString()} tokens
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Todo bar ────────────────────────────────────────────────────────────────

const TODO_KEY = 'hud-chat-todos'

interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
}

function loadTodos(): TodoItem[] {
  try {
    return JSON.parse(localStorage.getItem(TODO_KEY) || '[]')
  } catch { return [] }
}

function saveTodos(todos: TodoItem[]) {
  localStorage.setItem(TODO_KEY, JSON.stringify(todos))
}

function TodoBar() {
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos)
  const [editing, setEditing] = useState(false)
  const [newText, setNewText] = useState('')

  const active = todos.filter(t => t.status === 'pending' || t.status === 'in_progress')
  if (active.length === 0 && !editing) return null

  const toggleStatus = (id: string) => {
    const next = todos.map(t => {
      if (t.id !== id) return t
      const cycle: Record<string, TodoItem['status']> = { pending: 'in_progress', in_progress: 'completed', completed: 'pending' }
      return { ...t, status: cycle[t.status] || 'pending' }
    })
    setTodos(next)
    saveTodos(next)
  }

  const addTodo = () => {
    if (!newText.trim()) return
    const next = [...todos, { id: Date.now().toString(), content: newText.trim(), status: 'pending' as const }]
    setTodos(next)
    saveTodos(next)
    setNewText('')
  }

  const removeTodo = (id: string) => {
    const next = todos.filter(t => t.id !== id)
    setTodos(next)
    saveTodos(next)
  }

  const markers: Record<string, string> = { in_progress: '▸', pending: '○', completed: '✓', cancelled: '✗' }

  return (
    <div className="flex items-center gap-1 px-2 py-1 text-[12px] shrink-0 flex-wrap" style={{ borderBottom: '1px solid var(--hud-border)', background: 'var(--hud-bg-surface)' }}>
      <span style={{ color: 'var(--hud-text-dim)' }}>📋</span>
      {active.map(t => (
        <span key={t.id} className="flex items-center gap-0.5 px-1 py-0.5 cursor-pointer" style={{ border: '1px solid var(--hud-border)', background: 'var(--hud-bg-panel)' }}
          onClick={() => toggleStatus(t.id)}
        >
          <span style={{ color: t.status === 'in_progress' ? 'var(--hud-primary)' : 'var(--hud-text-dim)' }}>{markers[t.status]}</span>
          <span style={{ color: 'var(--hud-text)' }}>{t.content.slice(0, 40)}</span>
          <button onClick={(e) => { e.stopPropagation(); removeTodo(t.id) }} className="ml-0.5 cursor-pointer" style={{ color: 'var(--hud-error)', border: 'none', background: 'none', fontSize: '10px' }}>✕</button>
        </span>
      ))}
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); addTodo() }} className="flex items-center gap-1">
          <input
            value={newText} onChange={e => setNewText(e.target.value)}
            placeholder="新任务..."
            className="px-1 py-0.5 text-[12px] outline-none" style={{ background: 'var(--hud-bg-deep)', border: '1px solid var(--hud-border)', color: 'var(--hud-text)', width: '120px' }}
            autoFocus
          />
          <button type="submit" className="px-1 py-0.5 text-[11px] cursor-pointer" style={{ background: 'var(--hud-primary)', color: 'var(--hud-bg-deep)', border: 'none' }}>+</button>
          <button type="button" onClick={() => { setEditing(false); setNewText('') }} className="px-1 py-0.5 text-[11px] cursor-pointer" style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text-dim)', border: '1px solid var(--hud-border)' }}>✕</button>
        </form>
      ) : (
        <button onClick={() => setEditing(true)} className="px-1 py-0.5 text-[11px] cursor-pointer" style={{ color: 'var(--hud-text-dim)', border: '1px solid var(--hud-border)', background: 'transparent' }}>+</button>
      )}
    </div>
  )
}

// ── Main Chat Panel ──────────────────────────────────────────────────────────

export default function ChatPanel() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [activeTranscript, setActiveTranscript] = useState<string | null>(null)

  useChatAvailability()
  const { sessions, loading: loadingSessions, refresh: refreshSessions } = useHermesSessions()
  const { gateways, active: activeGateway, switchGateway } = useGateways()
  const { data: sessionStats } = useApi('/sessions', 30000)
  const { data: searchResults, isLoading: searching } = useApi(
    submittedQuery ? `/sessions/search?q=${encodeURIComponent(submittedQuery)}` : '',
    0
  )

  const {
    messages,
    isStreaming,
    composerState,
    error,
    historyLoading,
    sendMessage,
    cancelStream,
  } = useChat(activeSessionId)

  const handleSwitchGateway = useCallback(async (instance: string) => {
    await switchGateway(instance)
    refreshSessions()
  }, [switchGateway, refreshSessions])

  // Auto-select most recent session
  const initialSelectRef = useRef(false)
  useEffect(() => {
    if (!initialSelectRef.current && sessions.length > 0 && !activeSessionId) {
      initialSelectRef.current = true
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId])

  const handleSendMessage = useCallback(async (content: string) => {
    if (activeSessionId) await sendMessage(content)
  }, [activeSessionId, sendMessage])

  const handleSearch = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault()
    setSubmittedQuery(searchQuery.trim())
  }, [searchQuery])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
    setSubmittedQuery('')
  }, [])

  // Derived stats
  const dailyStats = sessionStats?.daily_stats || []
  const bySource = sessionStats?.by_source || {}
  const dailyMessages = dailyStats.map((d: any) => d.messages)
  const dailySessions = dailyStats.map((d: any) => d.sessions)

  const showSearch = submittedQuery.length > 0

  return (
    <>
      {/* Transcript modal */}
      {activeTranscript && (
        <TranscriptViewer sessionId={activeTranscript} onClose={() => setActiveTranscript(null)} />
      )}

      <Panel title="Chat" className="h-full" noPadding>
        <div className="flex flex-col h-full">
          {/* Top bar: gateway + stats */}
          <div className="flex items-center gap-3 px-3 py-1.5 shrink-0 flex-wrap" style={{ background: 'var(--hud-bg-surface)', borderBottom: '1px solid var(--hud-border)' }}>
            {/* Gateway switcher */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--hud-text-dim)' }}>GW:</span>
              {Object.entries(gateways).map(([key, gw]) => (
                <button
                  key={key}
                  onClick={() => handleSwitchGateway(key)}
                  disabled={isStreaming}
                  className="px-1.5 py-0.5 text-[11px] cursor-pointer border"
                  style={{
                    background: key === activeGateway ? 'var(--hud-primary)' : 'transparent',
                    color: key === activeGateway ? 'var(--hud-bg-deep)' : 'var(--hud-text-dim)',
                    borderColor: key === activeGateway ? 'var(--hud-primary)' : 'var(--hud-border)',
                    opacity: isStreaming ? 0.5 : 1,
                  }}
                >
                  {gw.label.split(' ')[0]}
                  <span style={{ color: gw.alive ? '#4ade80' : '#f87171', marginLeft: 3 }}>●</span>
                </button>
              ))}
            </div>

            {/* Separator */}
            <span style={{ color: 'var(--hud-border)' }}>│</span>

            {/* Compact stats */}
            <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>
              <span><span style={{ color: 'var(--hud-text)' }}>{sessionStats?.total_sessions || 0}</span> sess</span>
              <span><span style={{ color: 'var(--hud-text)' }}>{(sessionStats?.total_messages || 0).toLocaleString()}</span> msg</span>
              <span><span style={{ color: 'var(--hud-text)' }}>{(sessionStats?.total_tokens || 0).toLocaleString()}</span> tok</span>
              {Object.entries(bySource).map(([src, count]: any) => (
                <span key={src}><span style={{ color: sourceColor(src) }}>{count}</span> {src}</span>
              ))}
            </div>

            {/* Sparklines */}
            {dailyMessages.length > 0 && (
              <div className="flex items-center gap-2">
                <Sparkline values={dailyMessages} width={80} height={18} />
                <Sparkline values={dailySessions} width={80} height={14} />
              </div>
            )}
          </div>

          {/* Todo bar */}
          <TodoBar />

          {/* Main area: sidebar + chat */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar */}
            <div className="w-52 shrink-0 overflow-hidden flex flex-col" style={{ borderRight: '1px solid var(--hud-border)', background: 'var(--hud-bg-panel)' }}>
              {/* Search */}
              <div className="px-2 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--hud-border)' }}>
                <form onSubmit={handleSearch} className="flex gap-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search sessions..."
                    className="flex-1 px-1.5 py-0.5 text-[12px] outline-none"
                    style={{ background: 'var(--hud-bg-deep)', border: '1px solid var(--hud-border)', color: 'var(--hud-text)' }}
                  />
                  {showSearch ? (
                    <button type="button" onClick={handleClearSearch} className="px-1.5 py-0.5 text-[11px] cursor-pointer" style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text-dim)', border: '1px solid var(--hud-border)' }}>✕</button>
                  ) : (
                    <button type="submit" disabled={!searchQuery.trim()} className="px-1.5 py-0.5 text-[11px] cursor-pointer disabled:opacity-40" style={{ background: 'var(--hud-primary)', color: 'var(--hud-bg-deep)', border: 'none' }}>⏎</button>
                  )}
                </form>
              </div>

              {/* Header */}
              <div className="px-2 py-1 shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid var(--hud-border)' }}>
                <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--hud-text-dim)' }}>
                  {showSearch ? `Results` : 'Sessions'}
                </span>
                <button onClick={() => { refreshSessions(); handleClearSearch() }} disabled={loadingSessions} className="text-[11px] px-1.5 py-0.5 cursor-pointer" style={{ background: 'var(--hud-primary)', color: 'var(--hud-bg-deep)', opacity: loadingSessions ? 0.5 : 1 }}>
                  ↻
                </button>
              </div>

              {/* Session list */}
              <div className="flex-1 overflow-y-auto">
                {showSearch ? (
                  // Search results
                  searching ? (
                    <div className="p-2 text-[12px] animate-pulse" style={{ color: 'var(--hud-text-dim)' }}>Searching...</div>
                  ) : (searchResults || []).length === 0 ? (
                    <div className="p-2 text-[12px]" style={{ color: 'var(--hud-text-dim)' }}>No results for "{submittedQuery}"</div>
                  ) : (
                    (searchResults || []).map((r: any) => (
                      <button
                        key={r.session_id}
                        onClick={() => { setActiveSessionId(r.session_id); handleClearSearch() }}
                        className="w-full text-left px-2 py-1.5 text-[12px] cursor-pointer"
                        style={{ borderBottom: '1px solid var(--hud-border)', background: activeSessionId === r.session_id ? 'var(--hud-bg-hover)' : 'transparent', borderLeft: activeSessionId === r.session_id ? '2px solid var(--hud-primary)' : '2px solid transparent' }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sourceColor(r.source) }} />
                          <span className="flex-1 truncate">{r.title}</span>
                        </div>
                        {r.snippet && <div className="mt-0.5 ml-3 text-[10px] truncate" style={{ color: 'var(--hud-text-dim)' }}>{r.snippet}</div>}
                      </button>
                    ))
                  )
                ) : (
                  // Normal session list
                  loadingSessions && sessions.length === 0 ? (
                    <div className="p-2 text-[12px] animate-pulse" style={{ color: 'var(--hud-text-dim)' }}>Loading...</div>
                  ) : sessions.length === 0 ? (
                    <div className="p-2 text-[12px]" style={{ color: 'var(--hud-text-dim)' }}>No sessions.</div>
                  ) : (
                    sessions.map((s) => (
                      <div
                        key={s.id}
                        className="group w-full px-2 py-1.5 text-left cursor-pointer relative"
                        onClick={() => setActiveSessionId(s.id)}
                        onDoubleClick={() => setActiveTranscript(s.id)}
                        style={{
                          background: activeSessionId === s.id ? 'var(--hud-bg-hover)' : 'transparent',
                          borderLeft: activeSessionId === s.id ? '2px solid var(--hud-primary)' : '2px solid transparent',
                        }}
                        title="Double-click for transcript"
                      >
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm('Delete this session?')) return
                            await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' })
                            if (activeSessionId === s.id) setActiveSessionId(null)
                            refreshSessions()
                          }}
                          className="absolute top-1 right-1 px-1 py-0.5 text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'var(--hud-error)', color: '#fff', border: 'none', borderRadius: 2 }}
                        >✕</button>
                        <div className="text-[12px] font-bold truncate" style={{ color: 'var(--hud-text)' }}>
                          {s.title || s.id.slice(0, 12) + '…'}
                        </div>
                        <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--hud-text-dim)' }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sourceColor(s.source) }} />
                          {s.source} · {s.message_count}m {s.tool_call_count}t
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>

            {/* Chat area */}
            <div className="flex-1 flex flex-col min-w-0">
              {activeSessionId ? (
                <>
                  {historyLoading && <div className="px-3 py-1 text-[12px]" style={{ color: 'var(--hud-text-dim)', background: 'var(--hud-bg-surface)' }}>Loading messages...</div>}
                  {error && <div className="px-3 py-1 text-[12px]" style={{ color: 'var(--hud-error)', background: 'var(--hud-bg-surface)' }}>{error}</div>}
                  <MessageThread messages={messages} />
                  <Composer
                    onSend={handleSendMessage}
                    onCancel={cancelStream}
                    isStreaming={isStreaming}
                    model={composerState.model}
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center" style={{ color: 'var(--hud-text-dim)' }}>
                    <div className="text-[14px] mb-1">Select a session</div>
                    <div className="text-[12px]">Choose from sidebar · Double-click for transcript</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </>
  )
}
