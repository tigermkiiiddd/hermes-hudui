import { useState, useCallback } from 'react'
import { useApi } from '../../hooks/useApi'
import { S, SectionHeader, MessageBanner, SaveBar, TextField, NumberField, SelectField } from './shared'

const AUX_MODULES = [
  { key: 'vision', label: 'Vision', icon: '👁️', desc: 'Image analysis' },
  { key: 'web_extract', label: 'Web Extract', icon: '🌐', desc: 'Web page summarization' },
  { key: 'compression', label: 'Compression', icon: '🗜️', desc: 'Context compression' },
  { key: 'session_search', label: 'Session Search', icon: '🔍', desc: 'Search past sessions' },
  { key: 'skills_hub', label: 'Skills Hub', icon: '📦', desc: 'Skill search & install' },
  { key: 'approval', label: 'Approval', icon: '✅', desc: 'Auto-approve decisions' },
  { key: 'mcp', label: 'MCP', icon: '🔌', desc: 'MCP tool routing' },
  { key: 'flush_memories', label: 'Flush Memories', icon: '💾', desc: 'Memory consolidation' },
]

export default function AuxiliaryPanel() {
  const { data: config, mutate } = useApi('/settings', 0)
  const [dirty, setDirty] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const aux = config?.auxiliary || {}

  const handleSave = useCallback(async () => {
    if (Object.keys(dirty).length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: Object.entries(dirty).map(([key, value]) => ({ key, value })) }),
      })
      if (!res.ok) throw new Error(await res.text())
      setDirty({})
      mutate()
      setMsg({ text: `Saved ${Object.keys(dirty).length} changes`, ok: true })
    } catch (e: any) {
      setMsg({ text: `Error: ${e.message}`, ok: false })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 3000)
    }
  }, [dirty, mutate])

  const getVal = (moduleKey: string, field: string) => {
    const fullKey = `auxiliary.${moduleKey}.${field}`
    if (fullKey in dirty) return dirty[fullKey]
    return aux[moduleKey]?.[field] ?? ''
  }

  const setVal = (moduleKey: string, field: string, value: any) => {
    setDirty(prev => ({ ...prev, [`auxiliary.${moduleKey}.${field}`]: value }))
  }

  return (
    <div>
      <SectionHeader icon="🧩" title="Auxiliary Models">
        <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>
          Separate provider/model for each side task
        </span>
      </SectionHeader>

      {msg && <MessageBanner text={msg.text} ok={msg.ok} onDismiss={() => setMsg(null)} />}
      <SaveBar count={Object.keys(dirty).length} saving={saving} onSave={handleSave} onCancel={() => setDirty({})} />

      <div className="space-y-1.5">
        {AUX_MODULES.map(mod => {
          const cfg = aux[mod.key] || {}
          const isExpanded = expanded === mod.key
          const hasOverride = cfg.provider && cfg.provider !== 'auto'

          return (
            <div key={mod.key} style={S.card}>
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : mod.key)}
              >
                <span>{mod.icon}</span>
                <span className="text-[13px] flex-1" style={{ color: 'var(--hud-text)' }}>{mod.label}</span>
                <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>{cfg.provider || 'auto'}</span>
                {hasOverride && <span className="text-[10px] px-1 rounded" style={S.badge('var(--hud-primary)')}>custom</span>}
                <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div className="mt-2 space-y-1 pl-6" style={{ borderLeft: '2px solid var(--hud-border)' }}>
                  <SelectField
                    label="Provider"
                    value={getVal(mod.key, 'provider')}
                    onChange={v => setVal(mod.key, 'provider', v)}
                    options={['auto', 'openrouter', 'nous', 'zai', 'anthropic', 'gemini', 'deepseek', 'custom']}
                  />
                  <TextField
                    label="Model"
                    value={getVal(mod.key, 'model')}
                    onChange={v => setVal(mod.key, 'model', v)}
                    description="Empty = provider default"
                  />
                  <TextField
                    label="Base URL"
                    value={getVal(mod.key, 'base_url')}
                    onChange={v => setVal(mod.key, 'base_url', v)}
                    description="Direct endpoint (overrides provider)"
                  />
                  <TextField
                    label="API Key"
                    value={getVal(mod.key, 'api_key')}
                    onChange={v => setVal(mod.key, 'api_key', v)}
                    description="Key for base_url"
                    password
                  />
                  <NumberField
                    label="Timeout (s)"
                    value={getVal(mod.key, 'timeout') ?? 30}
                    onChange={v => setVal(mod.key, 'timeout', v)}
                    min={5}
                    max={600}
                    description={mod.desc}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
