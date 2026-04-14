import { useState, useCallback } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiFetch, S, SectionHeader, MessageBanner } from './shared'

export default function EnvKeysPanel({ groupKey, groupLabel, groupIcon }: { groupKey: string; groupLabel: string; groupIcon: string }) {
  const { data: allVars, mutate } = useApi('/settings/env', 0)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const vars = (allVars || []).filter((v: any) => v.group === groupKey)

  const handleSave = useCallback(async (key: string) => {
    try {
      await apiFetch('/settings/env', {
        method: 'PATCH',
        body: JSON.stringify({ key, value: editValue }),
      })
      setEditing(null)
      setEditValue('')
      mutate()
      setMsg({ text: `Saved ${key}`, ok: true })
    } catch (e: any) {
      setMsg({ text: `Error: ${e.message}`, ok: false })
    }
    setTimeout(() => setMsg(null), 3000)
  }, [editValue, mutate])

  const handleDelete = useCallback(async (key: string) => {
    if (!confirm(`Delete ${key}?`)) return
    try {
      await apiFetch(`/settings/env/${key}`, { method: 'DELETE' })
      mutate()
      setMsg({ text: `Deleted ${key}`, ok: true })
    } catch (e: any) {
      setMsg({ text: `Error: ${e.message}`, ok: false })
    }
    setTimeout(() => setMsg(null), 3000)
  }, [mutate])

  return (
    <div>
      <SectionHeader icon={groupIcon} title={groupLabel}>
        <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>
          {vars.filter((v: any) => v.has_value).length}/{vars.length} configured
        </span>
      </SectionHeader>

      {msg && <MessageBanner text={msg.text} ok={msg.ok} onDismiss={() => setMsg(null)} />}

      <div className="space-y-1">
        {vars.map((v: any) => (
          <div key={v.key} className="flex items-center gap-2 px-2 py-1.5" style={S.row}>
            {/* Status dot */}
            <div className="shrink-0 w-2 h-2 rounded-full" style={{
              background: v.has_value ? 'var(--hud-success)' : 'var(--hud-text-dim)',
            }} />

            {/* Label + key name */}
            <div className="flex-1 min-w-0">
              <div className="text-[13px]" style={{ color: 'var(--hud-text)' }}>{v.label}</div>
              <div className="text-[10px]" style={{ color: 'var(--hud-text-dim)' }}>{v.key}</div>
            </div>

            {/* Value display / edit */}
            {editing === v.key ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  type={v.password ? 'password' : 'text'}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="Enter value..."
                  className="flex-1 px-2 py-1 text-[12px] outline-none"
                  style={S.input}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSave(v.key)
                    if (e.key === 'Escape') { setEditing(null); setEditValue('') }
                  }}
                />
                <button onClick={() => handleSave(v.key)} className="px-2 py-1" style={S.primaryBtn}>Save</button>
                <button onClick={() => { setEditing(null); setEditValue('') }} className="px-2 py-1" style={S.ghostBtn}>Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {v.password ? (
                  <span className="text-[12px]" style={{ color: v.has_value ? 'var(--hud-success)' : 'var(--hud-text-dim)' }}>
                    {v.has_value ? '••••••••' : '(empty)'}
                  </span>
                ) : (
                  <span className="text-[12px] max-w-[200px] truncate" style={{ color: v.has_value ? 'var(--hud-text)' : 'var(--hud-text-dim)' }}>
                    {v.has_value ? v.value : '(empty)'}
                  </span>
                )}
                <button
                  onClick={() => { setEditing(v.key); setEditValue('') }}
                  className="text-[11px] px-1.5 py-0.5 cursor-pointer"
                  style={S.ghostBtn}
                >Edit</button>
                {v.has_value && (
                  <button onClick={() => handleDelete(v.key)} className="text-[11px] px-1 py-0.5 cursor-pointer" style={S.dangerBtn}>×</button>
                )}
                {v.url && (
                  <a href={v.url} target="_blank" rel="noreferrer" className="text-[11px]" style={{ color: 'var(--hud-primary)' }}>Get Key ↗</a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
