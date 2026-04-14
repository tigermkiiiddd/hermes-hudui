import { useState, useCallback } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiFetch, S, SectionHeader, MessageBanner, TextField } from './shared'

export default function CredentialPoolPanel() {
  const { data, mutate } = useApi('/settings/credential-pool', 0)
  const [adding, setAdding] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newBaseUrl, setNewBaseUrl] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const pools = data?.pools || {}
  const strategiesAvailable = data?.strategies_available || []

  const handleAdd = useCallback(async (provider: string) => {
    if (!newKey.trim()) return
    try {
      await apiFetch('/settings/credential-pool/add', {
        method: 'POST',
        body: JSON.stringify({ provider, label: newLabel || `${provider}-new`, api_key: newKey, base_url: newBaseUrl }),
      })
      setAdding(null)
      setNewLabel('')
      setNewKey('')
      setNewBaseUrl('')
      mutate()
      setMsg({ text: 'Credential added', ok: true })
    } catch (e: any) {
      setMsg({ text: `Error: ${e.message}`, ok: false })
    }
    setTimeout(() => setMsg(null), 3000)
  }, [newKey, newLabel, newBaseUrl, mutate])

  const handleRemove = useCallback(async (provider: string, credId: string) => {
    if (!confirm('Remove this credential?')) return
    try {
      await apiFetch('/settings/credential-pool/remove', {
        method: 'POST',
        body: JSON.stringify({ provider, credential_id: credId }),
      })
      mutate()
      setMsg({ text: 'Credential removed', ok: true })
    } catch (e: any) {
      setMsg({ text: `Error: ${e.message}`, ok: false })
    }
    setTimeout(() => setMsg(null), 3000)
  }, [mutate])

  const handleStrategy = useCallback(async (provider: string, strategy: string) => {
    try {
      await apiFetch('/settings/credential-pool/strategy', {
        method: 'PATCH',
        body: JSON.stringify({ provider, strategy }),
      })
      mutate()
    } catch (e: any) {
      setMsg({ text: `Error: ${e.message}`, ok: false })
      setTimeout(() => setMsg(null), 3000)
    }
  }, [mutate])

  const poolEntries = Object.entries(pools)

  return (
    <div>
      <SectionHeader icon="🔑" title="Credential Pool & Key Rotation" />

      {msg && <MessageBanner text={msg.text} ok={msg.ok} onDismiss={() => setMsg(null)} />}

      {poolEntries.length === 0 && (
        <div className="text-[13px] py-4 text-center" style={{ color: 'var(--hud-text-dim)' }}>
          No credential pools configured. Add keys via Provider Keys section.
        </div>
      )}

      <div className="space-y-3">
        {poolEntries.map(([provider, pool]: [string, any]) => (
          <div key={provider} style={S.card}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium" style={{ color: 'var(--hud-primary)' }}>{provider}</span>
              <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>
                {pool.credentials.length} credential{pool.credentials.length !== 1 ? 's' : ''}
              </span>
              <div className="flex-1" />
              <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>Strategy:</span>
              <select
                value={pool.strategy}
                onChange={e => handleStrategy(provider, e.target.value)}
                className="px-1 py-0.5 text-[11px] outline-none"
                style={S.input}
              >
                {strategiesAvailable.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              {pool.credentials.map((cred: any) => (
                <div key={cred.id} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: 'var(--hud-bg)' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{
                    background: cred.last_status === 'ok' ? 'var(--hud-success)' :
                      cred.last_status === 'error' ? 'var(--hud-error)' : 'var(--hud-text-dim)'
                  }} />
                  <span className="text-[12px] flex-1" style={{ color: 'var(--hud-text)' }}>
                    {cred.label}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--hud-text-dim)' }}>
                    #{cred.priority}
                    {cred.base_url && ` · ${cred.base_url}`}
                  </span>
                  <button onClick={() => handleRemove(provider, cred.id)} className="text-[11px] px-1" style={{ color: 'var(--hud-error)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add new credential */}
            {adding === provider ? (
              <div className="mt-2 space-y-1 p-2 rounded" style={{ background: 'var(--hud-bg)', border: '1px dashed var(--hud-border)' }}>
                <TextField label="Label" value={newLabel} onChange={setNewLabel} />
                <TextField label="API Key" value={newKey} onChange={setNewKey} password />
                <TextField label="Base URL (optional)" value={newBaseUrl} onChange={setNewBaseUrl} />
                <div className="flex gap-2 mt-1">
                  <button onClick={() => handleAdd(provider)} className="px-2 py-1" style={S.primaryBtn}>Add</button>
                  <button onClick={() => { setAdding(null); setNewLabel(''); setNewKey(''); setNewBaseUrl('') }} className="px-2 py-1" style={S.ghostBtn}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(provider)} className="mt-2 text-[11px] px-2 py-0.5" style={S.ghostBtn}>
                + Add Credential
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
