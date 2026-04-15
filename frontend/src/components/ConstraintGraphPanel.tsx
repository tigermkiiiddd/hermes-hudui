import { useEffect, useRef, useState } from 'react'
import { Network } from 'vis-network/standalone'
import { useApi } from '../hooks/useApi'
import Panel from './Panel'

const TYPE_COLORS: Record<string, string> = {
  fact: '#4ade80',
  preference: '#facc15',
  rule: '#60a5fa',
  assumption: '#a78bfa',
}

const TYPE_LABELS: Record<string, string> = {
  fact: '事实',
  preference: '偏好',
  rule: '规则',
  assumption: '假设',
}

export default function ConstraintGraphPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedNode, setSelectedNode] = useState<any>(null)

  const { data: projectsData } = useApi<{ projects: { name: string; node_count: number }[] }>('/constraints/projects', 30000)
  const projects = projectsData?.projects || []

  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      setSelectedProject(projects[0].name)
    }
  }, [projects, selectedProject])

  const { data: graphData } = useApi<{ nodes: any[]; edges: any[] }>(
    selectedProject ? `/constraints/graph/${encodeURIComponent(selectedProject)}` : '',
    15000,
  )

  const { data: stats } = useApi<{ total_nodes: number; total_relations: number; verified: number; overturned: number; unverified: number }>(
    selectedProject ? `/constraints/stats/${encodeURIComponent(selectedProject)}` : '',
    15000,
  )

  useEffect(() => {
    if (!containerRef.current || !graphData) return

    if (networkRef.current) {
      networkRef.current.destroy()
      networkRef.current = null
    }

    if (graphData.nodes.length === 0) return

    const options = {
      nodes: {
        shape: 'dot',
        font: {
          color: '#e5e7eb',
          size: 13,
          face: 'Inter, system-ui, sans-serif',
        },
        borderWidth: 2,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.3)',
          size: 5,
        },
      },
      edges: {
        smooth: {
          enabled: true,
          type: 'continuous',
          roundness: 0.3,
        } as any,
        font: {
          color: '#9ca3af',
          size: 10,
          strokeWidth: 0,
        },
      },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -80,
          centralGravity: 0.01,
          springLength: 120,
          springConstant: 0.08,
          damping: 0.4,
        },
        maxVelocity: 50,
        solver: 'forceAtlas2Based',
        timestep: 0.35,
        stabilization: {
          iterations: 150,
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true,
        dragView: true,
        multiselect: true,
      },
      layout: {
        improvedLayout: true,
      },
    }

    const network = new Network(containerRef.current, graphData, options)
    networkRef.current = network

    network.on('click', (params: any) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0]
        const node = graphData.nodes.find((n: any) => n.id === nodeId)
        setSelectedNode(node?.metadata || null)
      } else {
        setSelectedNode(null)
      }
    })

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy()
        networkRef.current = null
      }
    }
  }, [graphData])

  return (
    <div className="flex gap-2 h-full min-h-0">
      {/* Graph area */}
      <Panel title={selectedNode ? `🧠 ${selectedNode.key}` : '🧠 Constraint Graph'} className="flex-1 flex flex-col min-h-0">
        {/* Project selector + stats */}
        <div className="flex items-center gap-3 mb-2 px-1 shrink-0">
          <select
            value={selectedProject}
            onChange={e => { setSelectedProject(e.target.value); setSelectedNode(null) }}
            className="px-2 py-1 rounded text-sm"
            style={{ background: 'var(--hud-card)', color: 'var(--hud-text)', border: '1px solid var(--hud-border)' }}
          >
            {projects.map(p => (
              <option key={p.name} value={p.name}>{p.name} ({p.node_count})</option>
            ))}
          </select>

          {stats && (
            <div className="flex gap-3 text-xs" style={{ color: 'var(--hud-text-dim)' }}>
              <span>节点 {stats.total_nodes}</span>
              <span>边 {stats.total_relations}</span>
              <span style={{ color: '#22c55e' }}>✓{stats.verified}</span>
              <span style={{ color: '#ef4444' }}>✗{stats.overturned}</span>
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-2 ml-auto text-xs" style={{ color: 'var(--hud-text-dim)' }}>
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                {TYPE_LABELS[type] || type}
              </span>
            ))}
          </div>
        </div>

        {/* Graph container */}
        <div className="flex-1 min-h-0 relative">
          {graphData && graphData.nodes.length > 0 ? (
            <div ref={containerRef} className="w-full h-full" style={{ background: 'var(--hud-card)', borderRadius: 8 }} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--hud-text-dim)' }}>
              {selectedProject ? '暂无约束数据' : '选择一个项目查看约束图'}
            </div>
          )}
        </div>
      </Panel>

      {/* Node detail sidebar */}
      {selectedNode && (
        <div className="w-64 shrink-0">
          <Panel title="节点详情">
            <div className="space-y-2 text-sm" style={{ color: 'var(--hud-text)' }}>
              <div>
                <span style={{ color: 'var(--hud-text-dim)' }}>Key:</span>{' '}
                <span className="font-medium">{selectedNode.key}</span>
              </div>
              <div>
                <span style={{ color: 'var(--hud-text-dim)' }}>Value:</span>
                <p className="mt-0.5 text-xs whitespace-pre-wrap" style={{ color: 'var(--hud-text)' }}>
                  {selectedNode.value}
                </p>
              </div>
              <div className="flex gap-2">
                <span
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: TYPE_COLORS[selectedNode.type] || '#555', color: '#000' }}
                >
                  {TYPE_LABELS[selectedNode.type] || selectedNode.type}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: 'var(--hud-card)', border: '1px solid var(--hud-border)' }}
                >
                  {selectedNode.inference_hardness}
                </span>
              </div>
              <div className="flex gap-3 text-xs" style={{ color: 'var(--hud-text-dim)' }}>
                <span>置信度 {selectedNode.confidence?.toFixed(2)}</span>
                <span>挑战 {selectedNode.challenge_count}</span>
              </div>
              {selectedNode.overturned && (
                <div className="text-xs px-2 py-1 rounded" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
                  已推翻
                </div>
              )}
              {selectedNode.challenge_count >= 3 && !selectedNode.overturned && (
                <div className="text-xs px-2 py-1 rounded" style={{ background: '#14532d', color: '#86efac' }}>
                  ✓ 已验证
                </div>
              )}
              <div className="text-xs" style={{ color: 'var(--hud-text-dim)' }}>
                来源: {selectedNode.source}
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
