import { useState, useCallback } from 'react'
import { useApi } from '../../hooks/useApi'
import { useI18n } from '../../i18n'
import { S, MessageBanner, SaveBar } from './shared'
import type { FieldSchema } from './types'

export default function SchemaPanel({ section, schema, sectionLabel }: { section: string; schema: { label: string; icon: string; fields: Record<string, FieldSchema> }; sectionLabel?: string }) {
  const { data: config, mutate } = useApi('/settings', 0)
  const { t } = useI18n()
  const [dirty, setDirty] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const getValue = useCallback((key: string) => {
    if (key in dirty) return dirty[key]
    if (!config) return undefined
    const parts = key.split('.')
    let val: any = config
    for (const p of parts) {
      if (val == null || typeof val !== 'object') return undefined
      val = val[p]
    }
    return val
  }, [config, dirty])

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
      setMsg({ text: `${t('msg.saved')} ${Object.keys(dirty).length}`, ok: true })
    } catch (e: any) {
      setMsg({ text: `${t('msg.error')}: ${e.message}`, ok: false })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 3000)
    }
  }, [dirty, mutate, t])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: '1px solid var(--hud-border)' }}>
        <span className="text-[14px] font-bold" style={{ color: 'var(--hud-primary)' }}>{schema.icon} {sectionLabel || schema.label}</span>
        <div className="flex-1" />
        <button onClick={async () => {
          if (!confirm(t('schema.reset_confirm', `Reset "${sectionLabel || section}"?`))) return
          await fetch(`/api/settings/reset-section/${section}`, { method: 'POST' })
          mutate()
          setDirty({})
        }} style={S.dangerBtn} className="px-2 py-1">{t('btn.reset')}</button>
      </div>

      {msg && <MessageBanner text={msg.text} ok={msg.ok} onDismiss={() => setMsg(null)} />}
      <SaveBar count={Object.keys(dirty).length} saving={saving} onSave={handleSave} onCancel={() => setDirty({})} t={t} />

      <div className="space-y-0.5">
        {Object.entries(schema.fields).map(([fieldKey, fieldSchema]) => (
          <div key={fieldKey} style={S.row}>
            <FieldEditor fieldKey={fieldKey} schema={fieldSchema} value={getValue(fieldKey)} onChange={(k, v) => setDirty(p => ({ ...p, [k]: v }))} />
          </div>
        ))}
      </div>
    </div>
  )
}

function FieldEditor({ fieldKey, schema, value, onChange }: {
  fieldKey: string
  schema: FieldSchema
  value: any
  onChange: (key: string, val: any) => void
}) {
  if (schema.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer py-1">
        <input type="checkbox" checked={!!value} onChange={e => onChange(fieldKey, e.target.checked)} className="w-4 h-4 accent-[var(--hud-primary)]" />
        <span className="text-[13px]" style={{ color: 'var(--hud-text)' }}>{schema.label}</span>
        {schema.description && <span className="text-[11px] ml-1" style={{ color: 'var(--hud-text-dim)' }}>— {schema.description}</span>}
      </label>
    )
  }

  if (schema.enum) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-[13px] min-w-[140px]" style={{ color: 'var(--hud-text)' }}>{schema.label}</span>
        <select value={value || ''} onChange={e => onChange(fieldKey, e.target.value)} className="flex-1 px-2 py-1 text-[13px] outline-none" style={S.input}>
          <option value="">(default)</option>
          {schema.enum.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    )
  }

  if (schema.type === 'integer' || schema.type === 'float') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-[13px] min-w-[140px]" style={{ color: 'var(--hud-text)' }}>{schema.label}</span>
        <input
          type="number"
          value={value ?? ''}
          min={schema.min}
          max={schema.max}
          step={schema.step || (schema.type === 'float' ? 0.1 : 1)}
          onChange={e => {
            const v = schema.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value)
            onChange(fieldKey, isNaN(v) ? null : v)
          }}
          className="flex-1 px-2 py-1 text-[13px] outline-none"
          style={S.input}
        />
        {schema.description && <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>{schema.description}</span>}
      </div>
    )
  }

  if (schema.type === 'list') {
    return (
      <div className="py-1">
        <span className="text-[13px] block mb-1" style={{ color: 'var(--hud-text)' }}>{schema.label}</span>
        <textarea
          value={Array.isArray(value) ? value.join('\n') : (value ?? '')}
          onChange={e => onChange(fieldKey, e.target.value.split('\n').filter(Boolean))}
          placeholder={schema.description || ''}
          rows={3}
          className="w-full px-2 py-1 text-[13px] outline-none resize-y"
          style={S.input}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[13px] min-w-[140px]" style={{ color: 'var(--hud-text)' }}>{schema.label}</span>
      <input type="text" value={value ?? ''} onChange={e => onChange(fieldKey, e.target.value)} placeholder={schema.description || ''} className="flex-1 px-2 py-1 text-[13px] outline-none" style={S.input} />
    </div>
  )
}
