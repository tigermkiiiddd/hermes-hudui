import { useState, useCallback, useRef, useEffect } from 'react'
import { useI18n } from '../i18n'

// ── Types ─────────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: 'running' | 'complete' | 'error'
  result?: unknown
  error?: string
}

export interface ChatMessage {
  id: string | number
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  reasoning?: string
  timestamp: number | string | Date
  isStreaming?: boolean
}

export interface HermesSession {
  id: string
  source: string
  title: string | null
  started_at: string
  ended_at: string | null
  message_count: number
  tool_call_count: number
  model: string | null
  total_tokens: number
}

export interface ComposerState {
  model: string
  isStreaming: boolean
  contextTokens: number
}

export interface GatewayInstance {
  label: string
  host: string
  port: number
  url: string
  alive: boolean
  active: boolean
}

// ── Gateway hooks ─────────────────────────────────────────────────────────

export function useGateways() {
  const [gateways, setGateways] = useState<Record<string, GatewayInstance>>({})
  const [active, setActive] = useState<string>('stable')
  const [loading, setLoading] = useState(false)

  const loadGateways = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/chat/gateways')
      if (response.ok) {
        const data = await response.json()
        setGateways(data.gateways)
        setActive(data.active)
      }
    } catch (err) {
      console.error('Failed to load gateways:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const switchGateway = useCallback(async (instance: string) => {
    try {
      const response = await fetch('/api/chat/gateways/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance }),
      })
      if (response.ok) {
        const data = await response.json()
        setActive(data.active_instance)
        await loadGateways()
        return data
      }
    } catch (err) {
      console.error('Failed to switch gateway:', err)
    }
    return null
  }, [loadGateways])

  useEffect(() => {
    loadGateways()
  }, [loadGateways])

  return { gateways, active, loading, switchGateway, refresh: loadGateways }
}

export function useChatAvailability() {
  const [availability, setAvailability] = useState({
    available: false,
    gatewayAvailable: false,
    gatewayUrl: '',
    activeInstance: 'stable' as string,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch('/api/chat/available')
        if (response.ok) {
          const data = await response.json()
          setAvailability({
            available: data.available,
            gatewayAvailable: data.gateway_available,
            gatewayUrl: data.gateway_url || '',
            activeInstance: data.active_instance || 'stable',
          })
        }
      } catch (err) {
        console.error('Failed to check chat availability:', err)
      } finally {
        setLoading(false)
      }
    }
    check()
  }, [])

  return { ...availability, loading }
}

// ── Sessions from state.db ────────────────────────────────────────────────

export function useHermesSessions() {
  const [sessions, setSessions] = useState<HermesSession[]>([])
  const [loading, setLoading] = useState(true)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sessions')
      if (response.ok) {
        const data = await response.json()
        // /api/sessions returns { sessions: [...], total_sessions, ... }
        const list: HermesSession[] = data.sessions || data || []
        // Sort by started_at desc
        list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        setSessions(list)
      }
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  return { sessions, loading, refresh: loadSessions }
}

// ── Chat hook (direct gateway SSE) ────────────────────────────────────────

export function useChat(sessionId: string | null) {
  useI18n()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [composerState, setComposerState] = useState<ComposerState>({
    model: 'unknown',
    isStreaming: false,
    contextTokens: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const currentAssistantRef = useRef<string>('')
  const currentToolCallsRef = useRef<Record<string, ToolCall>>({})

  // Load message history when session changes
  useEffect(() => {
    if (!sessionId) {
      setMessages([])
      return
    }

    let cancelled = false
    setHistoryLoading(true)
    setError(null)

    ;(async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/messages?limit=200`)
        if (!response.ok) {
          setError('Failed to load messages')
          setMessages([])
          return
        }
        const data = await response.json()
        if (cancelled) return

        const loaded: ChatMessage[] = (data.messages || []).map((m: Record<string, unknown>) => ({
          id: m.id as string | number,
          role: m.role as string,
          content: (m.content as string) || '',
          timestamp: m.timestamp as number | string,
          reasoning: m.reasoning as string | undefined,
          isStreaming: false,
        }))
        setMessages(loaded)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load messages')
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [sessionId])

  const sendMessage = useCallback(async (content: string) => {
    if (!sessionId) {
      setError('No active session')
      return
    }

    // Cancel any ongoing stream
    if (abortRef.current) {
      abortRef.current.abort()
    }

    setError(null)
    setIsStreaming(true)
    currentAssistantRef.current = ''
    currentToolCallsRef.current = {}

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    // Placeholder assistant message
    const assistantId = `assistant-${Date.now()}`
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      toolCalls: [],
    }
    setMessages(prev => [...prev, assistantMsg])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Use the backend proxy endpoint that streams directly from gateway
      const response = await fetch(`/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          messages: [{ role: 'user', content }],
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(errText || `Gateway error ${response.status}`)
      }

      // Read SSE stream manually from ReadableStream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      let currentEvent = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // Track SSE event type
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
            continue
          }

          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') continue

            // Handle custom tool progress events
            if (currentEvent === 'hermes.tool.progress') {
              try {
                const payload = JSON.parse(dataStr)
                setMessages(prev =>
                  prev.map(msg => {
                    if (msg.id !== assistantId) return msg
                    const existing = msg.toolCalls || []
                    // Check if this tool already tracked
                    const found = existing.find(t => t.name === payload.tool)
                    if (found) return msg
                    return {
                      ...msg,
                      toolCalls: [...existing, {
                        id: `tp-${Date.now()}-${existing.length}`,
                        name: payload.tool,
                        arguments: {},
                        status: 'running' as const,
                      }],
                    }
                  })
                )
              } catch { /* ignore */ }
              currentEvent = ''
              continue
            }

            try {
              const chunk = JSON.parse(dataStr)
              const choices = chunk.choices || []
              if (choices.length > 0) {
                const delta = choices[0].delta || {}
                if (delta.content) {
                  currentAssistantRef.current += delta.content
                  const text = currentAssistantRef.current
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === assistantId
                        ? { ...msg, content: text }
                        : msg
                    )
                  )
                }
                if (delta.reasoning) {
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === assistantId
                        ? { ...msg, reasoning: delta.reasoning }
                        : msg
                    )
                  )
                }
                // Handle tool calls from SSE stream
                if (delta.tool_calls && delta.tool_calls.length > 0) {
                  setMessages(prev =>
                    prev.map(msg => {
                      if (msg.id !== assistantId) return msg
                      const existing = msg.toolCalls || []
                      const updated = [...existing]
                      for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? updated.length
                        if (updated[idx]) {
                          // Append to existing
                          if (tc.function?.name) updated[idx] = { ...updated[idx], name: updated[idx].name || tc.function.name }
                          if (tc.function?.arguments) {
                            try {
                              const args = JSON.parse(tc.function.arguments)
                              updated[idx] = { ...updated[idx], arguments: args, status: 'complete' as const }
                            } catch {
                              // Partial JSON — still streaming arguments
                              updated[idx] = { ...updated[idx], status: 'running' as const }
                            }
                          }
                          if (tc.id) updated[idx] = { ...updated[idx], id: tc.id }
                        } else {
                          // New tool call
                          let args: Record<string, unknown> = {}
                          if (tc.function?.arguments) {
                            try { args = JSON.parse(tc.function.arguments) } catch { /* partial */ }
                          }
                          updated[idx] = {
                            id: tc.id || `tc-${Date.now()}-${idx}`,
                            name: tc.function?.name || '',
                            arguments: args,
                            status: 'running' as const,
                          }
                        }
                      }
                      return { ...msg, toolCalls: updated }
                    })
                  )
                }
              }
            } catch {
              // Not JSON — skip
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled
      } else {
        setError(err instanceof Error ? err.message : 'Stream error')
      }
    } finally {
      setIsStreaming(false)
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantId
            ? { ...msg, isStreaming: false, content: currentAssistantRef.current || msg.content || '[no response]' }
            : msg
        )
      )
      abortRef.current = null
    }
  }, [sessionId])

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsStreaming(false)
  }, [])

  // Get model info from gateway
  useEffect(() => {
    const loadModel = async () => {
      try {
        const resp = await fetch('/api/chat/available')
        if (resp.ok) {
          const data = await resp.json()
          setComposerState(prev => ({
            ...prev,
            model: data.gateway_url ? 'hermes-agent' : 'unknown',
          }))
        }
      } catch { /* ignore */ }
    }
    loadModel()
  }, [])

  return {
    messages,
    isStreaming,
    composerState,
    error,
    historyLoading,
    sendMessage,
    cancelStream,
  }
}

// ── Deprecated exports (kept for compatibility) ──────────────────────────
export const saveMessages = (_id: string, _msgs: ChatMessage[]) => {}
export const loadMessages = (_id: string): ChatMessage[] => []
export const removeMessages = (_id: string) => {}
export const loadSavedSessions = (): unknown[] => []
export const clearSessionStorage = (_id: string) => {}
export function useChatSessions() {
  return { sessions: [], loading: false, createSession: async () => null, endSession: async () => false, refresh: async () => {} }
}
