import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { useI18n, LANG_LABELS, type Lang } from '../i18n'
import Panel from './Panel'
import SchemaPanel from './settings/SchemaPanel'
import ProvidersPanel from './settings/ProvidersPanel'
import AuxiliaryPanel from './settings/AuxiliaryPanel'
import EnvKeysPanel from './settings/EnvKeysPanel'
import type { SectionDef } from './settings/types'

const SECTION_KEYS: SectionDef[] = [
  { key: '_providers', icon: '🔌', labelKey: 'nav.providers', type: 'providers' },
  { key: '_env-tool', icon: '🔧', labelKey: 'nav.env-tool', type: 'env-tool' },
  { key: '_env-messaging', icon: '💬', labelKey: 'nav.env-messaging', type: 'env-messaging' },
  { key: '_auxiliary', icon: '🧩', labelKey: 'nav.auxiliary', type: 'auxiliary' },
  { key: 'display', icon: '🎨', labelKey: 'nav.display', type: 'schema' },
  { key: 'agent', icon: '⚡', labelKey: 'nav.agent', type: 'schema' },
  { key: 'memory', icon: '🧠', labelKey: 'nav.memory', type: 'schema' },
  { key: 'compression', icon: '🗜️', labelKey: 'nav.compression', type: 'schema' },
  { key: 'terminal', icon: '💻', labelKey: 'nav.terminal', type: 'schema' },
  { key: 'browser', icon: '🌐', labelKey: 'nav.browser', type: 'schema' },
  { key: 'checkpoints', icon: '📸', labelKey: 'nav.checkpoints', type: 'schema' },
  { key: 'tts', icon: '🔊', labelKey: 'nav.tts', type: 'schema' },
  { key: 'stt', icon: '🎙️', labelKey: 'nav.stt', type: 'schema' },
  { key: 'voice', icon: '🎤', labelKey: 'nav.voice', type: 'schema' },
  { key: 'approvals', icon: '🛡️', labelKey: 'nav.approvals', type: 'schema' },
  { key: 'delegation', icon: '🔀', labelKey: 'nav.delegation', type: 'schema' },
  { key: 'smart_routing', icon: '🧭', labelKey: 'nav.smart_routing', type: 'schema' },
  { key: 'security', icon: '🔒', labelKey: 'nav.security', type: 'schema' },
  { key: 'privacy', icon: '🕵️', labelKey: 'nav.privacy', type: 'schema' },
  { key: 'logging', icon: '📋', labelKey: 'nav.logging', type: 'schema' },
  { key: 'network', icon: '📶', labelKey: 'nav.network', type: 'schema' },
  { key: 'cron_settings', icon: '⏰', labelKey: 'nav.cron', type: 'schema' },
  { key: 'human_delay', icon: '⏳', labelKey: 'nav.human_delay', type: 'schema' },
  { key: 'context', icon: '🧩', labelKey: 'nav.context', type: 'schema' },
  { key: 'toolsets', icon: '🔧', labelKey: 'nav.toolsets', type: 'schema' },
  { key: 'discord', icon: '💬', labelKey: 'nav.discord', type: 'schema' },
]

const ENV_PANEL_META: Record<string, { labelKey: string; icon: string }> = {
  'env-tool': { labelKey: 'nav.env-tool', icon: '🔧' },
  'env-messaging': { labelKey: 'nav.env-messaging', icon: '💬' },
}

// ── Main Panel ────────────────────────────────────────────────────────────

export default function SettingsPanel() {
  const { data: schema } = useApi('/settings/schema', 0)
  const [active, setActive] = useState<string>('_providers')
  const [search, setSearch] = useState('')
  const { t, lang, setLang } = useI18n()

  const schemaTyped = schema as Record<string, any> || {}

  const filtered = search
    ? SECTION_KEYS.filter(s => t(s.labelKey).toLowerCase().includes(search.toLowerCase()) || s.key.includes(search.toLowerCase()))
    : SECTION_KEYS

  const activeSection = SECTION_KEYS.find(s => s.key === active)

  const langs: Lang[] = ['en', 'zh']

  return (
    <Panel title="Settings" className="col-span-1 h-full" noPadding>
      <div className="flex min-h-0 flex-1">
        {/* Left nav — independent scroll */}
        <div className="shrink-0 flex flex-col min-h-0" style={{ width: '180px', borderRight: '1px solid var(--hud-border)' }}>
          {/* Search — pinned top */}
          <div className="shrink-0 px-1 pt-1 pb-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('btn.search')}
              className="w-full px-2 py-1 text-[12px] outline-none"
              style={{
                background: 'var(--hud-bg-deep)',
                border: '1px solid var(--hud-border)',
                color: 'var(--hud-text)',
              }}
            />
          </div>

          {/* Nav list — scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-0.5">
            {filtered.map(sec => {
              const isActive = active === sec.key
              return (
                <button
                  key={sec.key}
                  onClick={() => setActive(sec.key)}
                  className="w-full text-left px-2 py-1.5 text-[13px] cursor-pointer flex items-center gap-2 rounded-sm"
                  style={{
                    background: isActive ? 'var(--hud-bg-hover)' : 'transparent',
                    color: isActive ? 'var(--hud-primary)' : 'var(--hud-text-dim)',
                    borderLeft: isActive ? '2px solid var(--hud-primary)' : '2px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--hud-bg-hover)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <span className="text-[12px]">{sec.icon}</span>
                  <span className="truncate">{t(sec.labelKey)}</span>
                </button>
              )
            })}
          </div>

          {/* Language switcher — pinned bottom */}
          <div className="shrink-0 flex border-t px-1 py-1.5 gap-1" style={{ borderColor: 'var(--hud-border)' }}>
            {langs.map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className="flex-1 px-1 py-0.5 text-[11px] cursor-pointer rounded"
                style={{
                  background: lang === l ? 'var(--hud-primary)' : 'transparent',
                  color: lang === l ? 'var(--hud-bg-deep)' : 'var(--hud-text-dim)',
                  border: `1px solid ${lang === l ? 'var(--hud-primary)' : 'var(--hud-border)'}`,
                }}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        {/* Right content — independent scroll */}
        <div className="flex-1 overflow-y-auto min-h-0 pl-3 pr-1 pb-4">
          {activeSection && renderContent(activeSection, schemaTyped)}
        </div>
      </div>
    </Panel>
  )

  function renderContent(sec: SectionDef, schemaData: Record<string, any>) {
    switch (sec.type) {
      case 'providers':
        return <ProvidersPanel />
      case 'auxiliary':
        return <AuxiliaryPanel />
      case 'env-tool':
      case 'env-messaging': {
        const meta = ENV_PANEL_META[sec.type]
        return <EnvKeysPanel groupKey={sec.type.replace('env-', '')} groupLabel={t(meta.labelKey)} groupIcon={meta.icon} />
      }
      case 'schema': {
        const secSchema = schemaData[sec.key]
        if (!secSchema) return <div className="text-[13px] py-4 text-center" style={{ color: 'var(--hud-text-dim)' }}>{t('msg.loading')}</div>
        return <SchemaPanel section={sec.key} schema={secSchema} sectionLabel={t(sec.labelKey)} />
      }
      default:
        return null
    }
  }
}
