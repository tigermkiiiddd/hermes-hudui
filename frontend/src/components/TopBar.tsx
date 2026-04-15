import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme, THEMES } from '../hooks/useTheme'
import { useI18n } from '../i18n'

export const TABS = [
  { id: 'dashboard', labelKey: 'tab.dashboard', key: '1' },
  { id: 'memory', labelKey: 'tab.memory', key: '2' },
  { id: 'skills', labelKey: 'tab.skills', key: '3' },
  { id: 'chat', labelKey: 'tab.chat', key: '4' },
  { id: 'cron', labelKey: 'tab.cron', key: '5' },
  { id: 'projects', labelKey: 'tab.projects', key: '6' },
  { id: 'agents', labelKey: 'tab.agents', key: '8' },
  { id: 'profiles', labelKey: 'tab.profiles', key: '0' },
  { id: 'token-costs', labelKey: 'tab.token-costs', key: null },
  { id: 'corrections', labelKey: 'tab.corrections', key: null },
  { id: 'patterns', labelKey: 'tab.patterns', key: null },
  { id: 'settings', labelKey: 'tab.settings', key: 's' },
  { id: 'constraints', labelKey: 'tab.constraints', key: null },
] as const

export type TabId = typeof TABS[number]['id']

interface TopBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export default function TopBar({ activeTab, onTabChange }: TopBarProps) {
  const { theme, setTheme, scanlines, setScanlines } = useTheme()
  const { t, lang, setLang } = useI18n()
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [time, setTime] = useState(new Date())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Switch to prev/next tab
  const switchTab = useCallback((dir: 'prev' | 'next') => {
    const idx = TABS.findIndex(t => t.id === activeTab)
    const newIdx = dir === 'prev' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= TABS.length) return
    onTabChange(TABS[newIdx].id)
  }, [activeTab, onTabChange])

  // Scroll active tab into view
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const btn = el.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeTab])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const num = parseInt(e.key)
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const tab = TABS.find(t => t.key === String(num))
        if (tab) { onTabChange(tab.id); return }
      }
      if (e.key === '0') { onTabChange('token-costs'); return }
      if (e.key === 's') { onTabChange('settings'); return }
      if (e.key === 't') setShowThemePicker(p => !p)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onTabChange])

  const tabBtnStyle = (isActive: boolean) => ({
    color: isActive ? 'var(--hud-primary)' : 'var(--hud-text-dim)',
    background: isActive ? 'var(--hud-bg-panel)' : 'transparent',
    borderBottom: isActive ? '2px solid var(--hud-primary)' : '2px solid transparent',
    textShadow: isActive ? '0 0 8px var(--hud-primary-glow)' : 'none',
    minHeight: '32px',
  })

  return (
    <div className="flex items-center gap-0 px-2 py-1.5 border-b"
         style={{ borderColor: 'var(--hud-border)', background: 'var(--hud-bg-surface)' }}>
      {/* Logo */}
      <span className="gradient-text font-bold text-[13px] mr-2 tracking-wider cursor-pointer shrink-0"
            onClick={() => onTabChange('dashboard')}>☤ HERMES</span>

      {/* Prev/Next arrows — always visible together */}
      <div className="shrink-0 flex items-center rounded"
           style={{ background: 'var(--hud-bg-panel)', border: '1px solid var(--hud-border)' }}>
        <button
          onClick={() => switchTab('prev')}
          disabled={activeTab === TABS[0].id}
          className="px-1.5 py-1 text-[12px] cursor-pointer disabled:opacity-30"
          style={{ color: 'var(--hud-text)', minHeight: '28px' }}
        >◀</button>
        <button
          onClick={() => switchTab('next')}
          disabled={activeTab === TABS[TABS.length - 1].id}
          className="px-1.5 py-1 text-[12px] cursor-pointer disabled:opacity-30"
          style={{ color: 'var(--hud-text)', borderLeft: '1px solid var(--hud-border)', minHeight: '28px' }}
        >▶</button>
      </div>

      {/* Tabs scrollable area */}
      <div
        ref={scrollRef}
        className="flex gap-0.5 flex-1 overflow-x-auto ml-1"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            data-tab={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="px-2 py-1.5 text-[13px] tracking-widest uppercase transition-all duration-150 shrink-0 cursor-pointer"
            style={tabBtnStyle(activeTab === tab.id)}
          >
            {tab.key && <span className="opacity-40 mr-1">{tab.key}</span>}
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Theme picker */}
      <div className="relative shrink-0 z-10">
        <button
          onClick={() => setShowThemePicker(p => !p)}
          className="px-2 py-1.5 text-[13px] tracking-wider uppercase cursor-pointer"
          style={{ color: 'var(--hud-text-dim)', minHeight: '32px' }}
          title="Theme (t)"
        >◆</button>
        {showThemePicker && (
          <div className="absolute right-0 top-full mt-1 z-50 py-1 min-w-[180px]"
               style={{ background: 'var(--hud-bg-panel)', border: '1px solid var(--hud-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
            {THEMES.map(themeItem => (
              <button
                key={themeItem.id}
                onClick={() => { setTheme(themeItem.id); setShowThemePicker(false) }}
                className="block w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer"
                style={{
                  color: theme === themeItem.id ? 'var(--hud-primary)' : 'var(--hud-text)',
                  background: theme === themeItem.id ? 'var(--hud-bg-hover)' : 'transparent',
                  minHeight: '36px',
                }}
              >
                {themeItem.icon} {t(themeItem.labelKey as any)}
              </button>
            ))}
            <div className="border-t my-1" style={{ borderColor: 'var(--hud-border)' }} />
            <button
              onClick={() => setScanlines(!scanlines)}
              className="block w-full text-left px-3 py-2 text-[13px] cursor-pointer"
              style={{ color: 'var(--hud-text-dim)', minHeight: '36px' }}
            >
              {scanlines ? '▣' : '□'} {t('theme.scanlines')}
            </button>
          </div>
        )}
      </div>

      {/* Clock */}
      <span className="text-[13px] ml-2 tabular-nums shrink-0 hidden sm:inline" style={{ color: 'var(--hud-text-dim)' }}>
        {time.toLocaleTimeString('en-US', { hour12: false })}
      </span>

      <select
        value={lang}
        onChange={e => setLang(e.target.value as any)}
        className="ml-2 px-2 py-0.5 text-[12px] font-bold tracking-wider cursor-pointer shrink-0 hud-lang-select"
        style={{
          color: 'var(--hud-primary)',
          border: '1px solid var(--hud-primary)',
          background: 'transparent',
          minHeight: '24px',
        }}
      >
        <option value="en" style={{ background: '#111' }}>EN</option>
        <option value="zh" style={{ background: '#111' }}>中文</option>
      </select>
    </div>
  )
}
