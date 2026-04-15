import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import Panel from './Panel'
import { timeAgo, truncate } from '../lib/utils'
import { useTranslation } from '../i18n'

async function cronFetch(jobId: string, action: string | null, method = 'POST') {
  const url = action ? `/api/cron/${jobId}/${action}` : `/api/cron/${jobId}`
  const res = await fetch(url, { method })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `${action ?? 'delete'} failed`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Job Form (create / edit)
// ---------------------------------------------------------------------------

interface JobFormData {
  name: string
  prompt: string
  schedule: string
  repeat: number | ''
  deliver: string
  skills: string
  model: string
  provider: string
  script: string
}

const EMPTY_FORM: JobFormData = {
  name: '', prompt: '', schedule: 'every 1h', repeat: '',
  deliver: 'local', skills: '', model: '', provider: '', script: '',
}

function JobForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: JobFormData
  onSubmit: (data: JobFormData) => Promise<void>
  onCancel: () => void
  submitLabel: string
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<JobFormData>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof JobFormData, val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const setNum = (key: keyof JobFormData, val: string) => {
    const v = val === '' ? '' : String(Number(val))
    setForm(prev => ({ ...prev, [key]: v as any }))
  }

  const handleSubmit = async () => {
    if (!form.prompt.trim()) { setError(t('cron.errPrompt', 'Prompt is required')); return }
    if (!form.schedule.trim()) { setError(t('cron.errSchedule', 'Schedule is required')); return }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(form)
    } catch (e: any) {
      setError(e.message || 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    background: 'var(--hud-bg-panel)',
    border: '1px solid var(--hud-border)',
    color: 'var(--hud-text)',
    borderRadius: 4,
    padding: '6px 8px',
    fontSize: 13,
    width: '100%',
  }

  return (
    <div className="p-4 space-y-3" style={{ background: 'var(--hud-bg-surface)', border: '1px solid var(--hud-border)' }}>
      {error && (
        <div className="text-[12px] px-2 py-1" style={{ color: 'var(--hud-error)' }}>{error}</div>
      )}

      {/* Name + Schedule row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
            {t('cron.formName', '名称')}
          </label>
          <input style={fieldStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="可选" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
            {t('cron.schedule', '调度')} *
          </label>
          <input style={fieldStyle} value={form.schedule} onChange={e => set('schedule', e.target.value)}
            placeholder="30m / every 2h / 0 9 * * *" />
        </div>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
          Prompt *
        </label>
        <textarea style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }}
          value={form.prompt} onChange={e => set('prompt', e.target.value)} placeholder="任务指令（自包含，agent 无上下文）" />
      </div>

      {/* Skills + Deliver + Repeat */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
            {t('cron.skills', '关联技能')}
          </label>
          <input style={fieldStyle} value={form.skills} onChange={e => set('skills', e.target.value)} placeholder="skill1, skill2" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
            {t('cron.deliver', '推送至')}
          </label>
          <select style={fieldStyle} value={form.deliver} onChange={e => set('deliver', e.target.value)}>
            <option value="local">local</option>
            <option value="origin">origin</option>
            <option value="telegram">telegram</option>
            <option value="discord">discord</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
            {t('cron.repeat', '重复次数')}
          </label>
          <input style={fieldStyle} type="number" value={form.repeat} onChange={e => setNum('repeat', e.target.value)}
            placeholder="空=永久" min={1} />
        </div>
      </div>

      {/* Model + Provider + Script */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
            Model
          </label>
          <input style={fieldStyle} value={form.model} onChange={e => set('model', e.target.value)} placeholder="默认" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
            Provider
          </label>
          <input style={fieldStyle} value={form.provider} onChange={e => set('provider', e.target.value)} placeholder="默认" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
            Script
          </label>
          <input style={fieldStyle} value={form.script} onChange={e => set('script', e.target.value)} placeholder="可选 .py 脚本" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSubmit} disabled={busy}
          className="px-4 py-1.5 text-[12px] cursor-pointer disabled:opacity-40"
          style={{ background: 'var(--hud-accent)', color: 'var(--hud-bg-deep)', borderRadius: 4 }}>
          {busy ? '...' : submitLabel}
        </button>
        <button onClick={onCancel}
          className="px-4 py-1.5 text-[12px] cursor-pointer"
          style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text-dim)', borderRadius: 4 }}>
          {t('memory.cancel')}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cron Panel
// ---------------------------------------------------------------------------

export default function CronPanel() {
  const { t } = useTranslation()
  const { data, isLoading, mutate } = useApi('/cron', 30000)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingJob, setEditingJob] = useState<any | null>(null)

  const act = async (jobId: string, action: string | null, method = 'POST') => {
    setBusy(`${jobId}:${action}`)
    setError(null)
    try {
      await cronFetch(jobId, action, method)
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(null)
      setConfirming(null)
    }
  }

  const handleCreate = async (form: JobFormData) => {
    const body: any = {
      prompt: form.prompt.trim(),
      schedule: form.schedule.trim(),
      deliver: form.deliver || 'local',
    }
    if (form.name.trim()) body.name = form.name.trim()
    if (form.repeat !== '' && form.repeat > 0) body.repeat = form.repeat
    if (form.skills.trim()) body.skills = form.skills.split(',').map(s => s.trim()).filter(Boolean)
    if (form.model.trim()) body.model = form.model.trim()
    if (form.provider.trim()) body.provider = form.provider.trim()
    if (form.script.trim()) body.script = form.script.trim()

    const res = await fetch('/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Create failed')
    }
    setShowCreate(false)
    await mutate()
  }

  const handleUpdate = async (form: JobFormData) => {
    if (!editingJob) return
    const body: any = {}
    if (form.name !== (editingJob.name || '')) body.name = form.name.trim() || undefined
    if (form.prompt !== (editingJob.prompt || '')) body.prompt = form.prompt.trim()
    if (form.schedule !== (editingJob.schedule?.display || editingJob.schedule_display || '')) body.schedule = form.schedule.trim()
    if (form.repeat !== '') body.repeat = form.repeat
    if (form.deliver !== (editingJob.deliver || 'local')) body.deliver = form.deliver
    if (form.skills.trim()) {
      body.skills = form.skills.split(',').map(s => s.trim()).filter(Boolean)
    } else {
      body.skills = []
    }
    if (form.model !== (editingJob.model || '')) body.model = form.model.trim() || null
    if (form.provider !== (editingJob.provider || '')) body.provider = form.provider.trim() || null
    if (form.script !== (editingJob.script || '')) body.script = form.script.trim() || null

    const res = await fetch(`/api/cron/${editingJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Update failed')
    }
    setEditingJob(null)
    await mutate()
  }

  if (isLoading && !data) {
    return <Panel title={t('cron.title')} className="col-span-full"><div className="glow text-[13px] animate-pulse">{t('cron.loading')}</div></Panel>
  }

  const jobs = data?.jobs || data || []

  return (
    <Panel title={t('cron.title')} className="col-span-full">
      {error && (
        <div className="mb-3 px-2 py-1.5 text-[12px]" style={{ color: 'var(--hud-error)', background: 'var(--hud-bg-surface)' }}>
          {error}
        </div>
      )}

      {/* Create button */}
      {!showCreate && !editingJob && (
        <button
          onClick={() => setShowCreate(true)}
          className="mb-3 px-4 py-1.5 text-[12px] cursor-pointer"
          style={{ background: 'var(--hud-accent)', color: 'var(--hud-bg-deep)', borderRadius: 4 }}>
          + {t('cron.create', '新建定时任务')}
        </button>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-4">
          <JobForm
            initial={EMPTY_FORM}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel={t('cron.create', '新建定时任务')}
          />
        </div>
      )}

      {/* Edit form */}
      {editingJob && (
        <div className="mb-4">
          <JobForm
            initial={{
              name: editingJob.name || '',
              prompt: editingJob.prompt || '',
              schedule: editingJob.schedule?.display || editingJob.schedule_display || '',
              repeat: editingJob.repeat?.times ?? '',
              deliver: editingJob.deliver || 'local',
              skills: (editingJob.skills || []).join(', '),
              model: editingJob.model || '',
              provider: editingJob.provider || '',
              script: editingJob.script || '',
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditingJob(null)}
            submitLabel={t('cron.update', '更新')}
          />
        </div>
      )}

      {/* Job list */}
      {!Array.isArray(jobs) || jobs.length === 0 ? (
        <div className="text-[13px]" style={{ color: 'var(--hud-text-dim)' }}>{t('cron.noJobs')}</div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const isPaused = job.state === 'paused'
            const isCompleted = job.state === 'completed'
            const isActive = job.enabled && !isPaused && !isCompleted
            const isBusy = (action: string) => busy === `${job.id}:${action}`
            const isConfirming = confirming === job.id

            return (
              <div key={job.id} className="p-3" style={{ background: 'var(--hud-bg-panel)', border: '1px solid var(--hud-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: isActive ? 'var(--hud-success)' : 'var(--hud-text-dim)' }} />
                  <span className="font-bold text-[13px] cursor-pointer" style={{ color: 'var(--hud-primary)' }}
                    onClick={() => setEditingJob(job)}>
                    {job.name || job.id}
                  </span>
                  <span className="text-[13px] px-1.5 py-0.5"
                    style={{
                      background: 'var(--hud-bg-hover)',
                      color: isActive ? 'var(--hud-success)' : 'var(--hud-text-dim)'
                    }}>
                    {job.state || 'unknown'}
                  </span>

                  <div className="ml-auto flex items-center gap-1.5">
                    {!isCompleted && (
                      isPaused ? (
                        <button
                          onClick={() => act(job.id, 'resume')}
                          disabled={!!busy}
                          className="px-2 py-0.5 text-[11px] cursor-pointer disabled:opacity-40"
                          style={{ background: 'var(--hud-success)', color: 'var(--hud-bg-deep)' }}
                        >
                          {isBusy('resume') ? '...' : t('cron.resume')}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => act(job.id, 'run')}
                            disabled={!!busy}
                            className="px-2 py-0.5 text-[11px] cursor-pointer disabled:opacity-40"
                            style={{ background: 'var(--hud-accent)', color: 'var(--hud-bg-deep)' }}
                          >
                            {isBusy('run') ? '...' : t('cron.run')}
                          </button>
                          <button
                            onClick={() => act(job.id, 'pause')}
                            disabled={!!busy}
                            className="px-2 py-0.5 text-[11px] cursor-pointer disabled:opacity-40"
                            style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text-dim)' }}
                          >
                            {isBusy('pause') ? '...' : t('cron.pause')}
                          </button>
                        </>
                      )
                    )}

                    <button
                      onClick={() => setEditingJob(job)}
                      className="px-2 py-0.5 text-[11px] cursor-pointer"
                      style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-accent)' }}
                    >
                      {t('cron.edit', '编辑')}
                    </button>

                    {isConfirming ? (
                      <>
                        <button
                          onClick={() => act(job.id, null, 'DELETE')}
                          disabled={!!busy}
                          className="px-2 py-0.5 text-[11px] cursor-pointer disabled:opacity-40"
                          style={{ background: 'var(--hud-error)', color: 'var(--hud-bg-deep)' }}
                        >
                          {isBusy('delete') ? '...' : t('cron.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="px-2 py-0.5 text-[11px] cursor-pointer"
                          style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-text-dim)' }}
                        >
                          {t('memory.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirming(job.id)}
                        disabled={!!busy}
                        className="px-2 py-0.5 text-[11px] cursor-pointer disabled:opacity-40"
                        style={{ background: 'var(--hud-bg-hover)', color: 'var(--hud-error)' }}
                      >
                        {t('memory.delete')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                  <div>
                    <div className="uppercase tracking-wider" style={{ color: 'var(--hud-text-dim)', fontSize: '10px' }}>{t('cron.schedule')}</div>
                    <div style={{ color: 'var(--hud-primary)' }}>{job.schedule_display || job.schedule || '-'}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wider" style={{ color: 'var(--hud-text-dim)', fontSize: '10px' }}>{t('cron.lastRun')}</div>
                    <div>
                      {timeAgo(job.last_run_at)}
                      {job.last_status && (
                        <span className="ml-1" style={{ color: job.last_status === 'ok' ? 'var(--hud-success)' : 'var(--hud-error)' }}>
                          {job.last_status === 'ok' ? '✔' : '✗'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wider" style={{ color: 'var(--hud-text-dim)', fontSize: '10px' }}>{t('cron.nextRun')}</div>
                    <div>{job.next_run_at ? new Date(job.next_run_at).toLocaleString() : '-'}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wider" style={{ color: 'var(--hud-text-dim)', fontSize: '10px' }}>{t('cron.deliver')}</div>
                    <div style={{ color: 'var(--hud-accent)' }}>{job.deliver || '-'}</div>
                  </div>
                </div>

                {job.repeat_completed != null && (
                  <div className="mt-2 text-[13px]" style={{ color: 'var(--hud-text-dim)' }}>
                    {t('cron.runsCompleted')}: {job.repeat_completed}{job.repeat_total ? ` / ${job.repeat_total}` : ''}
                    {job.skills?.length > 0 && <span className="ml-2">{t('cron.skills')}: {job.skills.join(', ')}</span>}
                  </div>
                )}

                {job.prompt && (
                  <div className="mt-2 text-[13px]" style={{ color: 'var(--hud-text-dim)' }}>
                    {truncate(job.prompt, 120)}
                  </div>
                )}

                {job.paused_reason && (
                  <div className="mt-1 text-[12px]" style={{ color: 'var(--hud-warning)' }}>
                    {t('cron.pausedReason')}: {job.paused_reason}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
