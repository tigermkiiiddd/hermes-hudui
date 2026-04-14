import { useState, useCallback } from 'react'

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Shared styles ────────────────────────────────────────────────────────

export const S = {
  label: { color: 'var(--hud-text)', fontSize: '13px' } as React.CSSProperties,
  dimLabel: { color: 'var(--hud-text-dim)', fontSize: '11px' } as React.CSSProperties,
  input: {
    background: 'var(--hud-bg-deep)',
    border: '1px solid var(--hud-border)',
    color: 'var(--hud-text)',
    fontSize: '13px',
    outline: 'none',
  } as React.CSSProperties,
  row: { borderBottom: '1px solid var(--hud-border)', padding: '4px 8px' } as React.CSSProperties,
  primaryBtn: {
    background: 'var(--hud-primary)',
    color: 'var(--hud-bg-deep)',
    border: 'none',
    fontSize: '12px',
    cursor: 'pointer',
  } as React.CSSProperties,
  dangerBtn: {
    background: 'transparent',
    border: '1px solid var(--hud-error)',
    color: 'var(--hud-error)',
    fontSize: '12px',
    cursor: 'pointer',
    opacity: 0.7,
  } as React.CSSProperties,
  ghostBtn: {
    background: 'var(--hud-bg-deep)',
    border: '1px solid var(--hud-border)',
    color: 'var(--hud-text-dim)',
    fontSize: '12px',
    cursor: 'pointer',
  } as React.CSSProperties,
  badge: (color: string) => ({
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '3px',
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
  }) as React.CSSProperties,
  card: {
    background: 'var(--hud-bg-deep)',
    border: '1px solid var(--hud-border)',
    borderRadius: '4px',
    padding: '8px',
  } as React.CSSProperties,
}

// ── Reusable field editors ───────────────────────────────────────────────

export function Toggle({ value, onChange, label, description }: {
  value: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer py-1">
      <input
        type="checkbox"
        checked={!!value}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-[var(--hud-primary)]"
      />
      <span style={S.label}>{label}</span>
      {description && <span style={S.dimLabel}>— {description}</span>}
    </label>
  )
}

export function SelectField({ value, onChange, label, options, description }: {
  value: string
  onChange: (v: string) => void
  label: string
  options: string[]
  description?: string
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[13px] min-w-[140px]" style={{ color: 'var(--hud-text)' }}>{label}</span>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="flex-1 px-2 py-1 text-[13px] outline-none"
        style={S.input}
      >
        <option value="">(default)</option>
        {options.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      {description && <span style={S.dimLabel}>{description}</span>}
    </div>
  )
}

export function NumberField({ value, onChange, label, min, max, step = 1, description }: {
  value: number | null
  onChange: (v: number | null) => void
  label: string
  min?: number
  max?: number
  step?: number
  description?: string
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[13px] min-w-[140px]" style={{ color: 'var(--hud-text)' }}>{label}</span>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const v = parseFloat(e.target.value)
          onChange(isNaN(v) ? null : v)
        }}
        className="flex-1 px-2 py-1 text-[13px] outline-none"
        style={S.input}
      />
      {description && <span style={S.dimLabel}>{description}</span>}
    </div>
  )
}

export function TextField({ value, onChange, label, description, password }: {
  value: string
  onChange: (v: string) => void
  label: string
  description?: string
  password?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[13px] min-w-[140px]" style={{ color: 'var(--hud-text)' }}>{label}</span>
      <input
        type={password && !show ? 'password' : 'text'}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={description || ''}
        className="flex-1 px-2 py-1 text-[13px] outline-none"
        style={S.input}
      />
      {password && value && (
        <button onClick={() => setShow(!show)} className="text-[11px] px-1 cursor-pointer" style={{ color: 'var(--hud-text-dim)', background: 'none', border: 'none' }}>
          {show ? 'hide' : 'show'}
        </button>
      )}
    </div>
  )
}

export function ListField({ value, onChange, label, description }: {
  value: string[]
  onChange: (v: string[]) => void
  label: string
  description?: string
}) {
  return (
    <div className="py-1">
      <span className="text-[13px] block mb-1" style={{ color: 'var(--hud-text)' }}>{label}</span>
      <textarea
        value={Array.isArray(value) ? value.join('\n') : (value ?? '')}
        onChange={e => onChange(e.target.value.split('\n').filter(Boolean))}
        placeholder={description || ''}
        rows={3}
        className="w-full px-2 py-1 text-[13px] outline-none resize-y"
        style={S.input}
      />
    </div>
  )
}

// ── Section header ───────────────────────────────────────────────────────

export function SectionHeader({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: '1px solid var(--hud-border)' }}>
      <span className="text-[14px] font-bold" style={{ color: 'var(--hud-primary)' }}>{icon} {title}</span>
      <div className="flex-1" />
      {children}
    </div>
  )
}

// ── Message banner ───────────────────────────────────────────────────────

export function MessageBanner({ text, ok, onDismiss }: { text: string; ok: boolean; onDismiss: () => void }) {
  return (
    <div className="mb-2 px-2 py-1.5 text-[13px] rounded cursor-pointer flex items-center" onClick={onDismiss} style={{
      background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      color: ok ? 'var(--hud-success)' : 'var(--hud-error)',
      border: `1px solid ${ok ? 'var(--hud-success)' : 'var(--hud-error)'}`,
    }}>
      <span className="flex-1">{text}</span>
      <span style={{ color: 'var(--hud-text-dim)', fontSize: '11px' }}>click to dismiss</span>
    </div>
  )
}

// ── Save bar ─────────────────────────────────────────────────────────────

export function SaveBar({ count, saving, onSave, onCancel, t }: {
  count: number
  saving: boolean
  onSave: () => void
  onCancel: () => void
  t?: (key: string, fb?: string) => string
}) {
  if (count === 0) return null
  const _t = t || ((k: string, fb?: string) => fb || k)
  return (
    <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded" style={{ background: 'var(--hud-bg-hover)', border: '1px solid var(--hud-border)' }}>
      <span className="text-[13px] flex-1" style={{ color: 'var(--hud-warning)' }}>
        {count} {_t('msg.unsaved', 'unsaved change')}{count > 1 ? _t('msg.unsaved_plural', 's') : ''}
      </span>
      <button onClick={onCancel} className="px-3 py-1" style={S.ghostBtn}>{_t('btn.cancel', 'Cancel')}</button>
      <button onClick={onSave} disabled={saving} className="px-3 py-1 disabled:opacity-50" style={S.primaryBtn}>
        {saving ? _t('msg.saving', 'Saving...') : _t('btn.save', 'Save')}
      </button>
    </div>
  )
}

// ── Config value getter/setter for nested keys ───────────────────────────

export function useConfigFields(config: any, dirty: Record<string, any>, _onChange: (key: string, value: any) => void) {
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

  return getValue
}
