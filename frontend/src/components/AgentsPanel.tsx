import { useApi } from '../hooks/useApi'
import Panel from './Panel'
import { formatDur } from '../lib/utils'
import { useTranslation } from '../i18n'

const ROLE_STYLES: Record<string, { color: string; label: string }> = {
  gateway: { color: 'var(--hud-success)', label: 'GW' },
  cli: { color: 'var(--hud-accent)', label: 'CLI' },
  hudui: { color: 'var(--hud-secondary)', label: 'HUD' },
  dashboard: { color: 'var(--hud-text-dim)', label: 'DASH' },
  cron: { color: 'var(--hud-warning)', label: 'CRON' },
  background: { color: 'var(--hud-text-dim)', label: 'BG' },
  other: { color: 'var(--hud-text-dim)', label: '?' },
}

const VARIANT_STYLES: Record<string, { color: string; label: string }> = {
  stable: { color: 'var(--hud-success)', label: 'stable' },
  dev: { color: 'var(--hud-warning)', label: 'dev' },
}

const PLAT_STATE_COLORS: Record<string, string> = {
  connected: 'var(--hud-success)',
  running: 'var(--hud-success)',
  retrying: 'var(--hud-warning)',
  fatal: 'var(--hud-error, #f44)',
  unknown: 'var(--hud-text-dim)',
}

const SOURCE_STYLES: Record<string, { color: string; label: string }> = {
  cli: { color: 'var(--hud-success)', label: 'cli' },
  telegram: { color: 'var(--hud-secondary)', label: 'tg' },
  cron: { color: 'var(--hud-warning)', label: 'cron' },
}

function RoleBadge({ role }: { role: string }) {
  const s = ROLE_STYLES[role] || ROLE_STYLES.other
  return (
    <span className="px-1.5 py-0.5 text-[11px] font-bold flex-shrink-0" style={{ background: 'var(--hud-bg-panel)', color: s.color, borderLeft: `2px solid ${s.color}` }}>
      {s.label}
    </span>
  )
}

function VariantBadge({ variant }: { variant?: string | null }) {
  if (!variant) return null
  const s = VARIANT_STYLES[variant] || { color: 'var(--hud-text-dim)', label: variant }
  return (
    <span className="px-1 py-0.5 text-[11px] flex-shrink-0" style={{ background: 'var(--hud-bg-panel)', color: s.color }}>
      {s.label}
    </span>
  )
}

function PlatformBadge({ name, state }: { name: string; state: string }) {
  const color = PLAT_STATE_COLORS[state] || PLAT_STATE_COLORS.unknown
  const icon = state === 'connected' ? '●' : state === 'fatal' ? '✕' : state === 'retrying' ? '◌' : '○'
  return (
    <span className="px-1 py-0.5 text-[11px] flex-shrink-0" style={{ background: 'var(--hud-bg-panel)', color }}>
      {icon} {name}
    </span>
  )
}

export default function AgentsPanel() {
  const { t } = useTranslation()
  const { data, isLoading } = useApi('/agents', 15000)

  if (isLoading && !data) {
    return <Panel title={t('agents.title')} className="col-span-full"><div className="glow text-[13px] animate-pulse">{t('agents.loading')}</div></Panel>
  }

  const processes = data.processes || []
  const live = processes.filter((p: any) => p.running)
  const recentSessions = data.recent_sessions || []
  const alerts = data.operator_alerts || []
  const tmuxPanes = data.tmux_panes || []

  // Group by role for display
  const gateways = live.filter((p: any) => p.role === 'gateway')
  const clis = live.filter((p: any) => p.role === 'cli')
  const services = live.filter((p: any) => ['hudui', 'dashboard'].includes(p.role))
  const others = live.filter((p: any) => !['gateway', 'cli', 'hudui', 'dashboard'].includes(p.role))
  const idle = processes.filter((p: any) => !p.running)

  return (
    <>
      {/* Live agents grouped by role */}
      <Panel title={`${t('agents.liveAgents')} — ${live.length} ${t('agents.live')}`}>
        {/* Operator alerts */}
        {alerts.length > 0 && (
          <div className="mb-3">
            <div className="text-[13px] font-bold mb-1" style={{ color: 'var(--hud-warning)' }}>
              {t('agents.operatorQueue')} — {alerts.length} {t('agents.waiting')}
            </div>
            {alerts.map((a: any, i: number) => (
              <div key={i} className="py-1 text-[13px]" style={{ borderLeft: '2px solid var(--hud-warning)' }}>
                <span style={{ color: 'var(--hud-warning)' }}>⚠</span>
                <span className="font-bold ml-1">{a.agent_name}</span>
                <span className="ml-1 text-[13px]" style={{ color: 'var(--hud-text-dim)' }}>[{a.alert_type}]</span>
                <span className="ml-2">"{a.summary}"</span>
                {a.jump_hint && <span className="ml-1 text-[13px]" style={{ color: 'var(--hud-text-dim)' }}>→ {a.jump_hint}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {/* Gateway section */}
          {gateways.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                {t('agents.gateways') || 'Gateways'}
              </div>
              {gateways.map((proc: any, i: number) => (
                <ProcessCard key={`gw-${proc.pid}-${i}`} proc={proc} t={t} />
              ))}
            </div>
          )}

          {/* CLI section */}
          {clis.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                {t('agents.cliSessions') || 'CLI Sessions'}
              </div>
              {clis.map((proc: any, i: number) => (
                <ProcessCard key={`cli-${proc.pid}-${i}`} proc={proc} t={t} />
              ))}
            </div>
          )}

          {/* Services section (hudui, dashboard) */}
          {services.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                {t('agents.services') || 'Services'}
              </div>
              {services.map((proc: any, i: number) => (
                <ProcessCard key={`svc-${proc.pid}-${i}`} proc={proc} t={t} />
              ))}
            </div>
          )}

          {/* Other running processes */}
          {others.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                {t('agents.other') || 'Other'}
              </div>
              {others.map((proc: any, i: number) => (
                <ProcessCard key={`other-${proc.pid}-${i}`} proc={proc} t={t} />
              ))}
            </div>
          )}

          {/* Idle agents — compact inline */}
          {idle.length > 0 && (
            <div className="text-[13px] mt-2">
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
                {t('agents.notRunning')}
              </div>
              <div className="flex flex-wrap gap-2">
                {idle.map((proc: any, i: number) => (
                  <span key={`idle-${proc.name}-${i}`} className="px-2 py-0.5 text-[12px]" style={{ background: 'var(--hud-bg-panel)', color: 'var(--hud-text-dim)' }}>
                    {proc.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* tmux panes if present */}
        {data.has_tmux && tmuxPanes.length > 0 && (
          <div className="mt-3 text-[13px]">
            <div className="uppercase tracking-wider mb-1" style={{ color: 'var(--hud-text-dim)' }}>
              {t('agents.tmuxPanes')} — {tmuxPanes.length} {t('agents.total')}, {data.matched_pane_count} {t('agents.mapped')}
            </div>
            {data.unmatched_interesting_panes?.map((pane: any, i: number) => (
              <div key={i} style={{ color: 'var(--hud-text-dim)' }}>
                {pane.pane_id}  {pane.session_name}:{pane.window_index}.{pane.pane_index}  {pane.current_command}  ({t('agents.unmatched')})
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Recent sessions */}
      <Panel title={`${t('agents.recentActivity')} — ${t('agents.lastSessions')} ${recentSessions.length} ${t('agents.sessions')}`}>
        <div className="space-y-0.5">
          {recentSessions.map((sess: any, i: number) => {
            const style = SOURCE_STYLES[sess.source] || { color: 'var(--hud-text-dim)', label: sess.source }
            return (
              <div key={sess.session_id || i} className="flex items-center gap-2 py-1 text-[13px]"
                style={{ borderBottom: '1px solid var(--hud-border)' }}>
                <span className="text-[13px] tabular-nums w-[80px] flex-shrink-0" style={{ color: 'var(--hud-text-dim)' }}>
                  {sess.started_at ? `${sess.started_at.slice(5, 10)} ${sess.started_at.slice(11, 16)}` : ''}
                </span>
                <span className="px-1.5 py-0.5 text-[13px] flex-shrink-0" style={{ background: 'var(--hud-bg-panel)', color: style.color }}>
                  {style.label}
                </span>
                <span className="truncate flex-1">
                  {sess.title || t('agents.untitled')}
                </span>
                <span className="text-[13px] flex-shrink-0 tabular-nums" style={{ color: 'var(--hud-text-dim)' }}>
                  {sess.message_count}m
                  {sess.tool_call_count > 0 && <> {sess.tool_call_count}t</>}
                  {sess.duration_minutes && <span className="ml-1">{formatDur(sess.duration_minutes)}</span>}
                </span>
              </div>
            )
          })}
        </div>
      </Panel>
    </>
  )
}


function ProcessCard({ proc, t }: { proc: any; t: (key: string, fallback?: string) => string }) {
  const borderColor = proc.role === 'gateway' ? 'var(--hud-success)' : 'var(--hud-accent)'

  return (
    <div className="p-2" style={{ background: 'var(--hud-bg-panel)', borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-center gap-2 text-[13px] flex-wrap">
        <RoleBadge role={proc.role} />
        {proc.variant && <VariantBadge variant={proc.variant} />}
        <span className="font-bold">{proc.name}</span>
        {proc.pid && <span className="text-[12px] tabular-nums" style={{ color: 'var(--hud-text-dim)' }}>[{proc.pid}]</span>}
        {proc.profile && <span className="text-[12px] px-1" style={{ background: 'var(--hud-bg)', color: 'var(--hud-text-dim)' }}>~{proc.profile}</span>}
        <span className="text-[13px]" style={{ color: 'var(--hud-success)' }}>{t('agents.alive')}</span>
        {proc.uptime && <span className="text-[13px]" style={{ color: 'var(--hud-text-dim)' }}>{proc.uptime}</span>}
        {proc.mem_mb && <span className="text-[13px]" style={{ color: 'var(--hud-text-dim)' }}>{proc.mem_mb} MB</span>}
        {proc.tmux_jump_hint && <span className="text-[13px]" style={{ color: 'var(--hud-accent)' }}>→ {proc.tmux_jump_hint}</span>}
      </div>
      {/* Platform badges for gateways */}
      {proc.platforms && proc.platforms.length > 0 && (
        <div className="flex gap-1 mt-1 ml-1 flex-wrap">
          {proc.platforms.map((p: any, i: number) => (
            <PlatformBadge key={i} name={p.name} state={p.state} />
          ))}
        </div>
      )}
      {/* Gateway state warning */}
      {proc.gateway_state && proc.gateway_state !== 'running' && (
        <div className="text-[12px] mt-1 ml-1" style={{ color: 'var(--hud-warning)' }}>
          ⚠ {proc.gateway_state}
        </div>
      )}
    </div>
  )
}
