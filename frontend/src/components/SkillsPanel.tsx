import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import Panel from './Panel'

export default function SkillsPanel() {
  const { data, isLoading } = useApi('/skills', 60000)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)

  if (isLoading || !data) {
    return <Panel title="Skills" className="col-span-full"><div className="glow text-[12px] animate-pulse">Scanning skill library...</div></Panel>
  }

  const catCounts: Record<string, number> = data.category_counts || {}
  const byCategory: Record<string, any[]> = data.by_category || {}
  const recentlyMod = data.recently_modified || []

  // Sort categories by count descending
  const sorted = Object.entries(catCounts).sort((a: any, b: any) => b[1] - a[1])
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1

  // Skills in selected category
  const catSkills = selectedCat ? byCategory[selectedCat] || [] : []

  return (
    <>
      {/* Category overview */}
      <Panel title="Skill Library" className="col-span-1">
        <div className="flex gap-2 mb-3">
          <span className="text-[12px] px-2 py-0.5" style={{ background: 'var(--hud-bg-panel)', color: 'var(--hud-primary)' }}>
            {data.total} total
          </span>
          <span className="text-[12px] px-2 py-0.5" style={{ background: 'var(--hud-bg-panel)', color: 'var(--hud-accent)' }}>
            {data.custom_count} custom
          </span>
          <span className="text-[12px]" style={{ color: 'var(--hud-text-dim)' }}>
            {sorted.length} categories
          </span>
        </div>

        {/* Category bar chart — scannable at a glance */}
        <div className="space-y-1 text-[12px]">
          {sorted.map(([cat, count]) => {
            const pct = (count / maxCount) * 100
            const isSelected = selectedCat === cat
            return (
              <button
                key={cat}
                onClick={() => setSelectedCat(isSelected ? null : cat)}
                className="flex items-center gap-2 w-full py-1 px-2 text-left transition-colors"
                style={{
                  background: isSelected ? 'var(--hud-bg-hover)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--hud-primary)' : '2px solid transparent',
                }}
              >
                <span className="w-[140px] truncate" style={{ color: isSelected ? 'var(--hud-primary)' : 'var(--hud-text)' }}>
                  {cat}
                </span>
                <div className="flex-1 h-[6px]" style={{ background: 'var(--hud-bg-panel)' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: isSelected ? 'var(--hud-primary)' : 'var(--hud-primary-dim)',
                    }}
                  />
                </div>
                <span className="tabular-nums w-8 text-right" style={{ color: isSelected ? 'var(--hud-primary)' : 'var(--hud-text-dim)' }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </Panel>

      {/* Selected category skills OR recently modified */}
      {selectedCat ? (
        <Panel title={selectedCat}>
          <div className="space-y-2">
            {catSkills.map((skill: any) => (
              <div key={skill.name} className="py-2 px-2 text-[12px]" style={{ borderLeft: '2px solid var(--hud-border)' }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold" style={{ color: 'var(--hud-primary)' }}>{skill.name}</span>
                  {skill.is_custom && (
                    <span className="text-[10px] px-1" style={{ background: 'var(--hud-accent)', color: 'var(--hud-bg-deep)' }}>custom</span>
                  )}
                  <span className="text-[11px] ml-auto" style={{ color: 'var(--hud-text-dim)' }}>
                    {formatSize(skill.file_size)}
                  </span>
                </div>
                <div style={{ color: 'var(--hud-text-dim)' }}>
                  {skill.description?.slice(0, 120)}{skill.description?.length > 120 ? '...' : ''}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--hud-text-dim)' }}>
                  {skill.modified_at ? new Date(skill.modified_at).toLocaleDateString() : ''}
                  {' · '}{skill.path?.split('/').slice(-3).join('/')}
                </div>
              </div>
            ))}
            {catSkills.length === 0 && (
              <div className="text-[12px]" style={{ color: 'var(--hud-text-dim)' }}>No skills in this category</div>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title="Recently Modified">
          <div className="space-y-2">
            {recentlyMod.map((skill: any) => (
              <div key={skill.name} className="py-2 px-2 text-[12px]" style={{ borderLeft: '2px solid var(--hud-border)' }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold" style={{ color: 'var(--hud-primary)' }}>{skill.name}</span>
                  <span className="text-[11px] px-1" style={{ background: 'var(--hud-bg-panel)', color: 'var(--hud-text-dim)' }}>
                    {skill.category}
                  </span>
                  {skill.is_custom && (
                    <span className="text-[10px] px-1" style={{ background: 'var(--hud-accent)', color: 'var(--hud-bg-deep)' }}>custom</span>
                  )}
                </div>
                <div style={{ color: 'var(--hud-text-dim)' }}>
                  {skill.description?.slice(0, 100)}{skill.description?.length > 100 ? '...' : ''}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--hud-text-dim)' }}>
                  {skill.modified_at ? relativeTime(skill.modified_at) : ''}
                </div>
              </div>
            ))}
            {recentlyMod.length === 0 && (
              <div className="text-[12px]" style={{ color: 'var(--hud-text-dim)' }}>No recent modifications</div>
            )}
          </div>
        </Panel>
      )}
    </>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

function relativeTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const secs = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (secs < 0) return 'just now'
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}
