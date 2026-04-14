import { useState, useCallback } from 'react'
import { useApi, refreshAll } from '../hooks/useApi'
import Panel from './Panel'
import { useTranslation } from '../i18n'

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t)
  }
  return res.json()
}

function ProjectCard({ p, onEdit, onDelete }: { p: any; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="p-2.5 text-[13px] group relative"
      style={{
        background: 'var(--hud-bg-panel)',
        borderLeft: `3px solid ${p.dirty_files > 0 ? 'var(--hud-warning)' : p.is_git ? 'var(--hud-primary)' : p.path ? 'var(--hud-text-dim)' : 'var(--hud-success)'}`,
      }}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-bold" style={{ color: 'var(--hud-primary)' }}>{p.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: p.dirty_files > 0 ? 'var(--hud-warning)' : p.is_git ? 'var(--hud-success)' : 'var(--hud-text-dim)' }}>
            {p.path ? (p.dirty_files > 0 ? `${p.dirty_files} ${t('projects.dirty')}` : p.is_git ? t('projects.clean') : 'no git') : 'logical'}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--hud-text-dim)' }}>{p.session_count} sess</span>
        </div>
      </div>
      {p.description && (
        <div className="truncate mb-0.5" style={{ color: 'var(--hud-text)', fontSize: '12px' }}>{p.description}</div>
      )}
      {p.is_git && (
        <>
          <div className="flex gap-3 mb-0.5" style={{ color: 'var(--hud-text-dim)' }}>
            {p.branch && <span>({p.branch})</span>}
            {p.total_commits != null && <span>{p.total_commits} {t('projects.commits')}</span>}
            {p.last_commit_ago && <span>{p.last_commit_ago}</span>}
          </div>
          {p.last_commit_msg && (
            <div className="truncate" style={{ color: 'var(--hud-text)' }}>{p.last_commit_msg}</div>
          )}
        </>
      )}
      <div className="flex gap-2 mt-1">
        {p.languages?.map((lang: string) => (
          <span key={lang} className="px-1.5 py-0.5" style={{ background: 'var(--hud-bg-hover)', fontSize: '9px' }}>{lang}</span>
        ))}
        {[p.has_readme && 'README', p.has_package_json && 'npm', (p.has_requirements || p.has_pyproject) && 'pip']
          .filter(Boolean).map((badge: any) => (
            <span key={badge} className="px-1.5 py-0.5" style={{ background: 'var(--hud-bg-hover)', fontSize: '9px', color: 'var(--hud-text-dim)' }}>{badge}</span>
          ))}
      </div>
      {/* Actions */}
      <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-1">
        <button onClick={onEdit} className="px-1.5 py-0.5 text-[10px] cursor-pointer"
          style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text-dim)' }}>edit</button>
        <button onClick={onDelete} className="px-1.5 py-0.5 text-[10px] cursor-pointer"
          style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-error)' }}>del</button>
      </div>
    </div>
  )
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await api('POST', '/projects', { name: name.trim(), path: path.trim() || null, description: desc.trim() || null })
      setName(''); setPath(''); setDesc('')
      refreshAll()
      onDone()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }, [name, path, desc, onDone])

  return (
    <div className="p-2.5 mb-2" style={{ background: 'var(--hud-bg-panel)', borderLeft: '3px solid var(--hud-primary)' }}>
      <div className="flex gap-2 mb-2">
        <input placeholder="name *" value={name} onChange={e => setName(e.target.value)}
          className="flex-1 px-2 py-1 text-[13px]" style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text)', border: 'none', outline: 'none' }} />
        <input placeholder="path (optional)" value={path} onChange={e => setPath(e.target.value)}
          className="flex-1 px-2 py-1 text-[13px]" style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text)', border: 'none', outline: 'none' }} />
      </div>
      <div className="flex gap-2">
        <input placeholder="description (optional)" value={desc} onChange={e => setDesc(e.target.value)}
          className="flex-1 px-2 py-1 text-[13px]" style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text)', border: 'none', outline: 'none' }} />
        <button onClick={submit} disabled={busy || !name.trim()}
          className="px-3 py-1 text-[13px] cursor-pointer"
          style={{ background: 'var(--hud-primary)', color: '#fff', opacity: busy || !name.trim() ? 0.5 : 1 }}>
          {busy ? '...' : 'Create'}
        </button>
      </div>
    </div>
  )
}

export default function ProjectsPanel() {
  const { t } = useTranslation()
  const { data, isLoading } = useApi('/projects', 60000)
  const [showCreate, setShowCreate] = useState(false)

  if (isLoading && !data) {
    return <Panel title={t('projects.title')} className="col-span-full"><div className="glow text-[13px] animate-pulse">{t('projects.loading')}</div></Panel>
  }

  const all: any[] = data?.projects || []
  if (!Array.isArray(all) || all.length === 0) {
    return (
      <Panel title={t('projects.title')} className="col-span-full">
        <div className="text-[13px] mb-2" style={{ color: 'var(--hud-text-dim)' }}>{t('projects.noProjects')}</div>
        <button onClick={() => setShowCreate(true)} className="px-3 py-1 text-[13px] cursor-pointer"
          style={{ background: 'var(--hud-primary)', color: '#fff' }}>+ New Project</button>
        {showCreate && <CreateForm onDone={() => setShowCreate(false)} />}
      </Panel>
    )
  }

  const { active, recent, stale, noGit, logical, dirtyCount } = all.reduce(
    (acc: any, p: any) => {
      if (!p.path) {
        acc.logical.push(p)
      } else if (p.is_git) {
        if (p.activity_level === 'active') acc.active.push(p)
        else if (p.activity_level === 'recent') acc.recent.push(p)
        else acc.stale.push(p)
      } else {
        acc.noGit.push(p)
      }
      if (p.dirty_files > 0) acc.dirtyCount++
      return acc
    },
    { active: [] as any[], recent: [] as any[], stale: [] as any[], noGit: [] as any[], logical: [] as any[], dirtyCount: 0 }
  )

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete project "${name}"?`)) return
    try {
      await api('DELETE', `/projects/${encodeURIComponent(name)}`)
      refreshAll()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const gitRepos = all.filter((p: any) => p.is_git)

  return (
    <Panel title={t('projects.title')} className="col-span-full">
      {/* Summary line */}
      <div className="text-[13px] mb-3 flex items-center gap-2">
        <span className="font-bold">{all.length}</span> {t('projects.projects')}
        <span style={{ color: 'var(--hud-text-dim)' }}>│</span>
        <span className="font-bold">{gitRepos.length}</span> {t('projects.gitRepos')}
        <span style={{ color: 'var(--hud-text-dim)' }}>│</span>
        <span style={{ color: 'var(--hud-success)' }}>{active.length} {t('projects.active')}</span>
        {logical.length > 0 && (
          <>
            <span style={{ color: 'var(--hud-text-dim)' }}>│</span>
            <span style={{ color: 'var(--hud-primary)' }}>{logical.length} logical</span>
          </>
        )}
        {dirtyCount > 0 && (
          <>
            <span style={{ color: 'var(--hud-text-dim)' }}>│</span>
            <span style={{ color: 'var(--hud-warning)' }}>{dirtyCount} {t('projects.dirty')}</span>
          </>
        )}
        <button onClick={() => setShowCreate(!showCreate)} className="ml-auto px-2 py-0.5 text-[11px] cursor-pointer"
          style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-primary)' }}>
          + new
        </button>
      </div>

      {showCreate && <CreateForm onDone={() => setShowCreate(false)} />}

      {/* ACTIVE */}
      {active.length > 0 && (
        <div className="mb-3">
          <div className="text-[13px] font-bold mb-2" style={{ color: 'var(--hud-success)' }}>{t('projects.sectionActive')}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {active.map((p: any) => <ProjectCard key={p.name} p={p} onEdit={() => {}} onDelete={() => handleDelete(p.name)} />)}
          </div>
        </div>
      )}

      {/* RECENT */}
      {recent.length > 0 && (
        <div className="mb-3">
          <div className="text-[13px] font-bold mb-2" style={{ color: 'var(--hud-warning)' }}>{t('projects.sectionRecent')}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {recent.map((p: any) => <ProjectCard key={p.name} p={p} onEdit={() => {}} onDelete={() => handleDelete(p.name)} />)}
          </div>
        </div>
      )}

      {/* STALE */}
      {stale.length > 0 && (
        <div className="mb-3">
          <div className="text-[13px] mb-2" style={{ color: 'var(--hud-text-dim)' }}>{t('projects.sectionStale')}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1">
            {stale.map((p: any) => (
              <div key={p.name} className="text-[13px] py-0.5 truncate group relative" style={{ color: 'var(--hud-text-dim)' }}>
                {p.name} ({p.branch}){p.dirty_files > 0 && <span style={{ color: 'var(--hud-error)' }}> ({p.dirty_files})</span>}
                {p.last_commit_ago && <span> — {p.last_commit_ago}</span>}
                <button onClick={() => handleDelete(p.name)} className="absolute right-0 top-0 hidden group-hover:block px-1 text-[10px] cursor-pointer"
                  style={{ background: 'var(--hud-bg-panel)', color: 'var(--hud-error)' }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LOGICAL (no path) */}
      {logical.length > 0 && (
        <div className="mb-3">
          <div className="text-[13px] font-bold mb-2" style={{ color: 'var(--hud-primary)' }}>◉ LOGICAL</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {logical.map((p: any) => <ProjectCard key={p.name} p={p} onEdit={() => {}} onDelete={() => handleDelete(p.name)} />)}
          </div>
        </div>
      )}

      {/* NO GIT (has path but not a repo) */}
      {noGit.length > 0 && (
        <div>
          <div className="text-[13px] mb-2" style={{ color: 'var(--hud-text-dim)' }}>{t('projects.sectionNoGit')}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1">
            {noGit.map((p: any) => (
              <div key={p.name} className="text-[13px] py-0.5 truncate group relative" style={{ color: 'var(--hud-text-dim)' }}>
                {p.name}{p.languages?.length > 0 && <span> [{p.languages.join(', ')}]</span>}
                <button onClick={() => handleDelete(p.name)} className="absolute right-0 top-0 hidden group-hover:block px-1 text-[10px] cursor-pointer"
                  style={{ background: 'var(--hud-bg-panel)', color: 'var(--hud-error)' }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
