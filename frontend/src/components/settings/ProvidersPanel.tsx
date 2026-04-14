import { useState, useCallback } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiFetch, S, SectionHeader, MessageBanner } from './shared'

export default function ProvidersPanel() {
  const { data: provData, mutate: mutateProviders } = useApi('/settings/providers', 0)
  const { data: poolData, mutate: mutatePool } = useApi('/settings/credential-pool', 0)
  const [switching, setSwitching] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editKeyValue, setEditKeyValue] = useState('')
  const [editingBase, setEditingBase] = useState<string | null>(null)
  const [editBaseValue, setEditBaseValue] = useState('')
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const [editModelValue, setEditModelValue] = useState('')
  const [editCtxValue, setEditCtxValue] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const providers = provData?.providers || []
  const currentProvider = provData?.current_provider || ''
  const currentModel = provData?.current_model || ''
  const pools = poolData?.pools || []

  const showMsg = useCallback((text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }, [])

  const handleSwitch = useCallback(async (providerId: string, model?: string, contextLength?: number) => {
    setSwitching(true)
    try {
      const body: any = { provider: providerId }
      if (model) body.model = model
      if (contextLength) body.context_length = contextLength
      await apiFetch('/settings/switch-provider', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      mutateProviders()
      showMsg(`Switched to ${providerId}${model ? ` / ${model}` : ''}`, true)
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, false)
    } finally {
      setSwitching(false)
    }
  }, [mutateProviders, showMsg])

  const handleSaveKey = useCallback(async (envKey: string) => {
    try {
      await apiFetch('/settings/env', {
        method: 'PATCH',
        body: JSON.stringify({ key: envKey, value: editKeyValue }),
      })
      setEditingKey(null)
      setEditKeyValue('')
      mutateProviders()
      showMsg(`Saved ${envKey}`, true)
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, false)
    }
  }, [editKeyValue, mutateProviders, showMsg])

  const handleDeleteKey = useCallback(async (envKey: string) => {
    if (!confirm(`Delete ${envKey}?`)) return
    try {
      await apiFetch(`/settings/env/${envKey}`, { method: 'DELETE' })
      mutateProviders()
      showMsg(`Deleted ${envKey}`, true)
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, false)
    }
  }, [mutateProviders, showMsg])

  const handleSaveBase = useCallback(async (_providerId: string, baseUrlEnv: string) => {
    try {
      await apiFetch('/settings/env', {
        method: 'PATCH',
        body: JSON.stringify({ key: baseUrlEnv, value: editBaseValue }),
      })
      setEditingBase(null)
      setEditBaseValue('')
      mutateProviders()
      showMsg('Base URL saved', true)
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, false)
    }
  }, [editBaseValue, mutateProviders, showMsg])

  const handleAddCred = useCallback(async (provider: string, label: string, apiKey: string, baseUrl: string) => {
    try {
      await apiFetch('/settings/credential-pool/add', {
        method: 'POST',
        body: JSON.stringify({ provider, label, api_key: apiKey, base_url: baseUrl }),
      })
      mutatePool()
      showMsg('Credential added', true)
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, false)
    }
  }, [mutatePool, showMsg])

  const handleRemoveCred = useCallback(async (provider: string, credId: string) => {
    if (!confirm('Remove this credential?')) return
    try {
      await apiFetch('/settings/credential-pool/remove', {
        method: 'POST',
        body: JSON.stringify({ provider, credential_id: credId }),
      })
      mutatePool()
      showMsg('Credential removed', true)
    } catch (e: any) {
      showMsg(`Error: ${e.message}`, false)
    }
  }, [mutatePool, showMsg])

  return (
    <div>
      <SectionHeader icon="🔌" title="Providers">
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>
            Active: <span style={{ color: 'var(--hud-primary)' }}>{currentProvider}</span>
            {currentModel && <span> / {currentModel}</span>}
          </span>
        </div>
      </SectionHeader>

      {msg && <MessageBanner text={msg.text} ok={msg.ok} onDismiss={() => setMsg(null)} />}

      <div className="space-y-1.5">
        {providers.map((p: any) => {
          const isExpanded = expanded === p.id
          const pool = pools[p.id]
          const poolCreds = pool?.credentials || []
          const isOauth = p.auth_type !== 'api_key'

          return (
            <div key={p.id} style={{
              ...S.card,
              border: p.is_active ? '1px solid var(--hud-primary)' : '1px solid var(--hud-border)',
              background: p.is_active ? 'rgba(var(--hud-primary-rgb, 59,130,246), 0.05)' : 'var(--hud-bg-deep)',
            }}>
              {/* Header row — always visible */}
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : p.id)}
              >
                <div className="shrink-0 w-2 h-2 rounded-full" style={{
                  background: p.has_key ? 'var(--hud-success)' : 'var(--hud-text-dim)',
                }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium" style={{ color: p.is_active ? 'var(--hud-primary)' : 'var(--hud-text)' }}>
                      {p.name}
                    </span>
                    <span className="text-[10px] px-1 rounded" style={{
                      ...S.badge(p.has_key ? 'var(--hud-success)' : 'var(--hud-text-dim)'),
                    }}>
                      {p.has_key ? 'key ✓' : 'no key'}
                    </span>
                    {p.is_active && <span className="text-[10px] px-1 rounded" style={S.badge('var(--hud-primary)')}>active</span>}
                    {isOauth && <span className="text-[10px] px-1 rounded" style={S.badge('var(--hud-accent)')}>oauth</span>}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>
                    {p.custom_base_url || p.default_base_url}
                  </div>
                </div>
                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  {!p.is_active && p.has_key && (
                    <button
                      onClick={() => {
                        const m = prompt('Model name (leave empty to keep current):')
                        if (m === null) return
                        handleSwitch(p.id, m || undefined)
                      }}
                      disabled={switching}
                      className="px-2 py-1 disabled:opacity-50"
                      style={S.primaryBtn}
                    >Switch</button>
                  )}
                </div>
                <span className="text-[11px] shrink-0" style={{ color: 'var(--hud-text-dim)' }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-2 pt-2 space-y-2" style={{ borderTop: '1px solid var(--hud-border)' }}>

                  {/* API Keys section */}
                  {p.keys?.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                        API Keys
                      </div>
                      {p.keys.map((k: any) => (
                        <div key={k.env_key} className="flex items-center gap-2 py-1">
                          <span className="text-[11px] w-[160px] shrink-0" style={{ color: 'var(--hud-text-dim)' }}>
                            {k.env_key}
                          </span>
                          {editingKey === k.env_key ? (
                            <div className="flex items-center gap-1 flex-1">
                              <input
                                type="password"
                                value={editKeyValue}
                                onChange={e => setEditKeyValue(e.target.value)}
                                placeholder="Enter API key..."
                                className="flex-1 px-2 py-1 text-[12px] outline-none"
                                style={S.input}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveKey(k.env_key)
                                  if (e.key === 'Escape') { setEditingKey(null); setEditKeyValue('') }
                                }}
                              />
                              <button onClick={() => handleSaveKey(k.env_key)} className="px-2 py-1" style={S.primaryBtn}>Save</button>
                              <button onClick={() => { setEditingKey(null); setEditKeyValue('') }} className="px-2 py-1" style={S.ghostBtn}>Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-1">
                              <span className="text-[12px]" style={{ color: k.has_value ? 'var(--hud-success)' : 'var(--hud-text-dim)' }}>
                                {k.has_value ? '••••••••' : '(empty)'}
                              </span>
                              <button onClick={() => { setEditingKey(k.env_key); setEditKeyValue('') }} className="text-[11px] px-1.5 py-0.5 cursor-pointer" style={S.ghostBtn}>
                                Edit
                              </button>
                              {k.has_value && (
                                <button onClick={() => handleDeleteKey(k.env_key)} className="text-[11px] px-1 py-0.5 cursor-pointer" style={S.dangerBtn}>×</button>
                              )}
                              {k.url && (
                                <a href={k.url} target="_blank" rel="noreferrer" className="text-[11px]" style={{ color: 'var(--hud-primary)' }}>Get Key ↗</a>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Base URL */}
                  {p.base_url_env && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                        Base URL
                      </div>
                      {editingBase === p.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editBaseValue}
                            onChange={e => setEditBaseValue(e.target.value)}
                            placeholder={p.default_base_url}
                            className="flex-1 px-2 py-1 text-[12px] outline-none"
                            style={S.input}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveBase(p.id, p.base_url_env)
                              if (e.key === 'Escape') { setEditingBase(null); setEditBaseValue('') }
                            }}
                          />
                          <button onClick={() => handleSaveBase(p.id, p.base_url_env)} className="px-2 py-1" style={S.primaryBtn}>Save</button>
                          <button onClick={() => { setEditingBase(null); setEditBaseValue('') }} className="px-2 py-1" style={S.ghostBtn}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px]" style={{ color: p.custom_base_url ? 'var(--hud-text)' : 'var(--hud-text-dim)' }}>
                            {p.custom_base_url || `(default: ${p.default_base_url})`}
                          </span>
                          <button onClick={() => { setEditingBase(p.id); setEditBaseValue(p.custom_base_url || '') }} className="text-[11px] px-1.5 py-0.5 cursor-pointer" style={S.ghostBtn}>
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Model + Context Length */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                      Model
                    </div>
                    {editingModel === p.id ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] shrink-0 w-[50px]" style={{ color: 'var(--hud-text-dim)' }}>Name</span>
                          <input
                            type="text"
                            value={editModelValue}
                            onChange={e => setEditModelValue(e.target.value)}
                            placeholder={p.is_active ? currentModel : 'e.g. gpt-4o'}
                            className="flex-1 px-2 py-1 text-[12px] outline-none"
                            style={S.input}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Escape') { setEditingModel(null); setEditModelValue(''); setEditCtxValue('') }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] shrink-0 w-[50px]" style={{ color: 'var(--hud-text-dim)' }}>Ctx Len</span>
                          <input
                            type="number"
                            value={editCtxValue}
                            onChange={e => setEditCtxValue(e.target.value)}
                            placeholder="0 = auto"
                            className="flex-1 px-2 py-1 text-[12px] outline-none"
                            style={S.input}
                            onKeyDown={e => {
                              if (e.key === 'Escape') { setEditingModel(null); setEditModelValue(''); setEditCtxValue('') }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              handleSwitch(p.id, editModelValue || undefined, parseInt(editCtxValue) || 0)
                              setEditingModel(null)
                              setEditModelValue('')
                              setEditCtxValue('')
                            }}
                            className="px-2 py-1" style={S.primaryBtn}
                          >Apply</button>
                          <button onClick={() => { setEditingModel(null); setEditModelValue(''); setEditCtxValue('') }} className="px-2 py-1" style={S.ghostBtn}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px]" style={{ color: p.is_active && currentModel ? 'var(--hud-text)' : 'var(--hud-text-dim)' }}>
                          {p.is_active && currentModel ? currentModel : '(not set)'}
                        </span>
                        {p.context_length > 0 && (
                          <span className="text-[10px] px-1 rounded" style={S.badge('var(--hud-accent)')}>
                            {p.context_length >= 1000 ? `${Math.round(p.context_length / 1000)}k` : p.context_length} ctx
                          </span>
                        )}
                        <button onClick={() => {
                          setEditingModel(p.id)
                          setEditModelValue(p.is_active ? currentModel : '')
                          setEditCtxValue(p.context_length ? String(p.context_length) : '')
                        }} className="text-[11px] px-1.5 py-0.5 cursor-pointer" style={S.ghostBtn}>
                          Edit
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Credential Pool */}
                  {poolCreds.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                        Credential Pool ({poolCreds.length})
                      </div>
                      {poolCreds.map((cred: any) => (
                        <div key={cred.id} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: 'var(--hud-bg)' }}>
                          <div className="w-1.5 h-1.5 rounded-full" style={{
                            background: cred.last_status === 'ok' ? 'var(--hud-success)' :
                              cred.last_status === 'error' ? 'var(--hud-error)' : 'var(--hud-text-dim)'
                          }} />
                          <span className="text-[12px] flex-1" style={{ color: 'var(--hud-text)' }}>{cred.label}</span>
                          <span className="text-[10px]" style={{ color: 'var(--hud-text-dim)' }}>
                            #{cred.priority}{cred.base_url && ` · ${cred.base_url}`}
                          </span>
                          <button onClick={() => handleRemoveCred(p.id, cred.id)} className="text-[11px] px-1" style={{ color: 'var(--hud-error)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add credential (inline) */}
                  <AddCredentialInline providerId={p.id} onAdd={handleAddCred} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AddCredentialInline({ providerId, onAdd }: { providerId: string; onAdd: (prov: string, label: string, key: string, baseUrl: string) => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] px-2 py-0.5" style={S.ghostBtn}>
        + Add Credential
      </button>
    )
  }

  return (
    <div className="p-2 rounded" style={{ background: 'var(--hud-bg)', border: '1px dashed var(--hud-border)' }}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-[80px] shrink-0" style={{ color: 'var(--hud-text-dim)' }}>Label</span>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder={`${providerId}-new`} className="flex-1 px-2 py-1 text-[12px] outline-none" style={S.input} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-[80px] shrink-0" style={{ color: 'var(--hud-text-dim)' }}>API Key</span>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter key..." className="flex-1 px-2 py-1 text-[12px] outline-none" style={S.input} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-[80px] shrink-0" style={{ color: 'var(--hud-text-dim)' }}>Base URL</span>
          <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="(optional)" className="flex-1 px-2 py-1 text-[12px] outline-none" style={S.input} />
        </div>
        <div className="flex gap-2 mt-1">
          <button onClick={() => { onAdd(providerId, label || `${providerId}-new`, apiKey, baseUrl); setOpen(false); setLabel(''); setApiKey(''); setBaseUrl('') }} className="px-2 py-1" style={S.primaryBtn}>Add</button>
          <button onClick={() => { setOpen(false); setLabel(''); setApiKey(''); setBaseUrl('') }} className="px-2 py-1" style={S.ghostBtn}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
