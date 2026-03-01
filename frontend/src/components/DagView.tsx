import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
} from '@xyflow/react'
import dagre from 'dagre'
import '@xyflow/react/dist/style.css'
import { Select, Tag, Button } from 'antd'
import {
  SearchOutlined,
  AimOutlined,
  CompressOutlined,
  ExpandOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'

import StepNode, { type StepNodeData } from './StepNode'
import GroupNode, { type GroupNodeData } from './GroupNode'
import DagDetailPanel from './DagDetailPanel'
import type { TestStep } from '../types/testSuite'
import type { SuiteExecutionResult, StepExecutionResult } from '../services/testSuiteApi'

const STEP_WIDTH = 200
const STEP_HEIGHT = 70
const GROUP_WIDTH = 240
const GROUP_HEIGHT = 100

const nodeTypes: NodeTypes = { step: StepNode as any, group: GroupNode as any }

type DagMode = 'groups' | 'expanded' | 'chain'

/* ── dagre layout helper ────────────────────────────────────────── */

interface LayoutNode { id: string; width: number; height: number }
interface LayoutEdge { source: string; target: string }

function runDagreLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts?: { ranksep?: number; nodesep?: number },
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: opts?.nodesep ?? 30, ranksep: opts?.ranksep ?? 80, align: 'UL' })

  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const laid = g.node(n.id)
    if (laid) positions.set(n.id, { x: laid.x - n.width / 2, y: laid.y - n.height / 2 })
  }
  return positions
}

/* ── chain helper ───────────────────────────────────────────────── */

function getChainIds(stepId: string, steps: TestStep[]): Set<string> {
  const chain = new Set<string>()
  chain.add(stepId)
  const stepMap = new Map(steps.map(s => [s.id, s]))
  const childrenMap = new Map<string, string[]>()
  for (const step of steps) {
    for (const dep of step.dependencies) {
      const list = childrenMap.get(dep.dependsOnStepId) || []
      list.push(step.id)
      childrenMap.set(dep.dependsOnStepId, list)
    }
  }
  const traceBack = (id: string) => {
    const step = stepMap.get(id)
    if (!step) return
    for (const dep of step.dependencies) {
      if (!chain.has(dep.dependsOnStepId)) { chain.add(dep.dependsOnStepId); traceBack(dep.dependsOnStepId) }
    }
  }
  const traceForward = (id: string) => {
    for (const childId of childrenMap.get(id) || []) {
      if (!chain.has(childId)) { chain.add(childId); traceForward(childId) }
    }
  }
  traceBack(stepId)
  traceForward(stepId)
  return chain
}

/* ── status helpers ─────────────────────────────────────────────── */

function getStepStatus(stepId: string, runResult: SuiteExecutionResult | null, running: boolean): StepNodeData['status'] {
  if (!runResult) return 'default'
  const result = runResult.steps.find(s => s.stepId === stepId)
  if (result) return result.status as StepNodeData['status']
  if (running) return 'pending'
  return 'default'
}

function getStepResult(stepId: string, runResult: SuiteExecutionResult | null): StepExecutionResult | undefined {
  return runResult?.steps.find(s => s.stepId === stepId)
}

function getGroupStatus(
  groupSteps: TestStep[],
  runResult: SuiteExecutionResult | null,
  running: boolean,
): GroupNodeData['aggregateStatus'] {
  const statuses = groupSteps.map(s => getStepStatus(s.id, runResult, running))
  if (statuses.every(s => s === 'default')) return 'default'
  if (statuses.some(s => s === 'running')) return 'running'
  if (statuses.every(s => s === 'SUCCESS')) return 'success'
  if (statuses.some(s => s === 'ERROR')) return 'error'
  if (statuses.some(s => s === 'SUCCESS')) return 'partial'
  return 'default'
}

/* ── grouping helper ────────────────────────────────────────────── */

function buildGroupMap(steps: TestStep[]): Map<string, TestStep[]> {
  const map = new Map<string, TestStep[]>()
  for (const step of steps) {
    const gn = step.groupName?.trim() || 'Ungrouped'
    const list = map.get(gn) || []
    list.push(step)
    map.set(gn, list)
  }
  return map
}

function getMethodSummary(steps: TestStep[]): { method: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const s of steps) counts.set(s.method, (counts.get(s.method) || 0) + 1)
  return Array.from(counts.entries()).map(([method, count]) => ({ method, count }))
}

/* ── edge styling ───────────────────────────────────────────────── */

function makeEdge(
  id: string,
  source: string,
  target: string,
  opts?: { running?: boolean; isSuccess?: boolean; isFailed?: boolean; highlight?: boolean; thick?: boolean; label?: string },
): Edge {
  const { running, isSuccess, isFailed, highlight, thick, label } = opts || {}
  const color = isFailed ? '#f5222d' : isSuccess ? '#52c41a' : highlight ? '#1677ff' : '#d9d9d9'
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: (running && isSuccess) || (highlight && !running),
    label,
    labelStyle: label ? { fontSize: 10, fill: '#8c8c8c' } : undefined,
    labelBgStyle: label ? { fill: '#fff', fillOpacity: 0.85 } : undefined,
    labelBgPadding: label ? [4, 2] as [number, number] : undefined,
    style: {
      stroke: color,
      strokeWidth: thick ? 2.5 : highlight ? 2 : 1.5,
      transition: 'stroke 0.3s ease',
    },
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
  }
}

/* ── main props ──────────────────────────────────────────────────── */

interface Props {
  steps: TestStep[]
  runResult: SuiteExecutionResult | null
  running: boolean
  onEditStep?: (stepId: string) => void
  onRunStep?: (stepId: string) => void
}

function DagViewInner({ steps, runResult, running, onEditStep, onRunStep }: Props) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [dagMode, setDagMode] = useState<DagMode>('expanded')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [chainFocusStepId, setChainFocusStepId] = useState<string | null>(null)
  const prevModeRef = useRef<DagMode>('expanded')
  const { fitView } = useReactFlow()

  const groupMap = useMemo(() => buildGroupMap(steps), [steps])

  // Default: all groups expanded (show all steps)
  const initRef = useRef(false)
  useEffect(() => {
    if (!initRef.current && groupMap.size > 0) {
      initRef.current = true
      setExpandedGroups(new Set(groupMap.keys()))
    }
  }, [groupMap])

  // Which step does the step-id belong to (for group lookup)
  const stepGroupLookup = useMemo(() => {
    const m = new Map<string, string>()
    for (const [gn, gSteps] of groupMap) for (const s of gSteps) m.set(s.id, gn)
    return m
  }, [groupMap])

  // Chain for chain mode
  const chainIds = useMemo(() => {
    if (dagMode !== 'chain' || !chainFocusStepId) return null
    return getChainIds(chainFocusStepId, steps)
  }, [dagMode, chainFocusStepId, steps])

  /* ── GROUPS mode layout ───────────────────────────────────────── */

  const groupsLayout = useMemo(() => {
    if (dagMode !== 'groups') return { nodes: [] as Node[], edges: [] as Edge[] }

    const groupNames = Array.from(groupMap.keys())

    // Cross-group edge counts (deduplicated by source→target group)
    const crossEdges = new Map<string, number>()
    for (const step of steps) {
      const tg = stepGroupLookup.get(step.id) || 'Ungrouped'
      for (const dep of step.dependencies) {
        const sg = stepGroupLookup.get(dep.dependsOnStepId) || 'Ungrouped'
        if (sg !== tg) {
          const key = `${sg}->${tg}`
          crossEdges.set(key, (crossEdges.get(key) || 0) + 1)
        }
      }
    }

    // Layout
    const layoutNodes = groupNames.map(gn => ({ id: `group:${gn}`, width: GROUP_WIDTH, height: GROUP_HEIGHT }))
    const layoutEdges: LayoutEdge[] = []
    const edgeSet = new Set<string>()
    for (const key of crossEdges.keys()) {
      const [sg, tg] = key.split('->')
      const ek = `group:${sg}->group:${tg}`
      if (!edgeSet.has(ek)) { edgeSet.add(ek); layoutEdges.push({ source: `group:${sg}`, target: `group:${tg}` }) }
    }
    const positions = runDagreLayout(layoutNodes, layoutEdges, { ranksep: 100, nodesep: 40 })

    const nodes: Node[] = groupNames.map(gn => {
      const gSteps = groupMap.get(gn)!
      return {
        id: `group:${gn}`,
        type: 'group',
        position: positions.get(`group:${gn}`) || { x: 0, y: 0 },
        data: {
          groupName: gn,
          stepCount: gSteps.length,
          methods: getMethodSummary(gSteps),
          aggregateStatus: getGroupStatus(gSteps, runResult, running),
          selected: false,
          dimmed: false,
        } satisfies GroupNodeData,
      }
    })

    const edges: Edge[] = []
    for (const [key, count] of crossEdges) {
      const [sg, tg] = key.split('->')
      const eid = `group:${sg}->group:${tg}`
      if (edges.find(e => e.id === eid)) continue
      edges.push(makeEdge(eid, `group:${sg}`, `group:${tg}`, { thick: true, label: count > 1 ? `${count}` : undefined }))
    }

    return { nodes, edges }
  }, [dagMode, groupMap, stepGroupLookup, steps, runResult, running])

  /* ── EXPANDED mode layout ─────────────────────────────────────── */

  const expandedLayout = useMemo(() => {
    if (dagMode !== 'expanded') return { nodes: [] as Node[], edges: [] as Edge[] }

    const layoutNodes: LayoutNode[] = []
    const layoutEdges: LayoutEdge[] = []

    // Determine which step IDs are individually visible
    const visibleStepIds = new Set<string>()
    const collapsedGroupNames = new Set<string>()
    for (const [gn, gSteps] of groupMap) {
      if (expandedGroups.has(gn)) {
        for (const s of gSteps) visibleStepIds.add(s.id)
      } else {
        collapsedGroupNames.add(gn)
      }
    }

    // Layout nodes: individual steps + collapsed group nodes
    for (const sid of visibleStepIds) layoutNodes.push({ id: sid, width: STEP_WIDTH, height: STEP_HEIGHT })
    for (const gn of collapsedGroupNames) layoutNodes.push({ id: `group:${gn}`, width: GROUP_WIDTH, height: GROUP_HEIGHT })

    // Edges
    const edgeDedup = new Set<string>()
    for (const step of steps) {
      const isVisible = visibleStepIds.has(step.id)
      const targetNode = isVisible ? step.id : `group:${stepGroupLookup.get(step.id) || 'Ungrouped'}`

      for (const dep of step.dependencies) {
        const srcVisible = visibleStepIds.has(dep.dependsOnStepId)
        const sourceNode = srcVisible ? dep.dependsOnStepId : `group:${stepGroupLookup.get(dep.dependsOnStepId) || 'Ungrouped'}`

        if (sourceNode === targetNode) continue
        const ek = `${sourceNode}->${targetNode}`
        if (!edgeDedup.has(ek)) {
          edgeDedup.add(ek)
          layoutEdges.push({ source: sourceNode, target: targetNode })
        }
      }
    }

    const positions = runDagreLayout(layoutNodes, layoutEdges, { ranksep: 80, nodesep: 30 })

    const nodes: Node[] = []
    // Individual step nodes
    for (const step of steps) {
      if (!visibleStepIds.has(step.id)) continue
      nodes.push({
        id: step.id,
        type: 'step',
        position: positions.get(step.id) || { x: 0, y: 0 },
        data: {
          step,
          status: getStepStatus(step.id, runResult, running),
          durationMs: getStepResult(step.id, runResult)?.durationMs,
          selected: step.id === selectedStepId,
          depCount: step.dependencies.length,
          dimmed: false,
        } satisfies StepNodeData,
      })
    }
    // Collapsed group nodes
    for (const gn of collapsedGroupNames) {
      const gSteps = groupMap.get(gn)!
      nodes.push({
        id: `group:${gn}`,
        type: 'group',
        position: positions.get(`group:${gn}`) || { x: 0, y: 0 },
        data: {
          groupName: gn,
          stepCount: gSteps.length,
          methods: getMethodSummary(gSteps),
          aggregateStatus: getGroupStatus(gSteps, runResult, running),
          selected: false,
          dimmed: false,
        } satisfies GroupNodeData,
      })
    }

    const edges: Edge[] = []
    for (const ek of edgeDedup) {
      const [source, target] = ek.split('->')
      const sourceResult = source.startsWith('group:') ? null : getStepResult(source, runResult)
      edges.push(makeEdge(ek, source, target, {
        running,
        isSuccess: sourceResult?.status === 'SUCCESS',
        isFailed: sourceResult?.status === 'ERROR',
      }))
    }

    return { nodes, edges }
  }, [dagMode, expandedGroups, groupMap, stepGroupLookup, steps, runResult, running, selectedStepId])

  /* ── CHAIN mode layout ────────────────────────────────────────── */

  const chainLayout = useMemo(() => {
    if (dagMode !== 'chain' || !chainIds) return { nodes: [] as Node[], edges: [] as Edge[] }

    const chainSteps = steps.filter(s => chainIds.has(s.id))

    const layoutNodes = chainSteps.map(s => ({ id: s.id, width: STEP_WIDTH, height: STEP_HEIGHT }))
    const layoutEdges: LayoutEdge[] = []
    for (const step of chainSteps) {
      for (const dep of step.dependencies) {
        if (chainIds.has(dep.dependsOnStepId)) layoutEdges.push({ source: dep.dependsOnStepId, target: step.id })
      }
    }
    const positions = runDagreLayout(layoutNodes, layoutEdges, { ranksep: 80, nodesep: 30 })

    const nodes: Node[] = chainSteps.map(step => ({
      id: step.id,
      type: 'step',
      position: positions.get(step.id) || { x: 0, y: 0 },
      data: {
        step,
        status: getStepStatus(step.id, runResult, running),
        durationMs: getStepResult(step.id, runResult)?.durationMs,
        selected: step.id === selectedStepId,
        depCount: step.dependencies.filter(d => chainIds.has(d.dependsOnStepId)).length,
        dimmed: false,
      } satisfies StepNodeData,
    }))

    const edges: Edge[] = []
    for (const step of chainSteps) {
      for (const dep of step.dependencies) {
        if (!chainIds.has(dep.dependsOnStepId)) continue
        const sourceResult = getStepResult(dep.dependsOnStepId, runResult)
        edges.push(makeEdge(`${dep.dependsOnStepId}->${step.id}`, dep.dependsOnStepId, step.id, {
          running,
          isSuccess: sourceResult?.status === 'SUCCESS',
          isFailed: sourceResult?.status === 'ERROR',
          highlight: step.id === chainFocusStepId || dep.dependsOnStepId === chainFocusStepId,
        }))
      }
    }

    return { nodes, edges }
  }, [dagMode, chainIds, chainFocusStepId, steps, runResult, running, selectedStepId])

  /* ── pick the right layout for current mode ───────────────────── */

  const { computedNodes, computedEdges } = useMemo(() => {
    if (dagMode === 'groups') return { computedNodes: groupsLayout.nodes, computedEdges: groupsLayout.edges }
    if (dagMode === 'expanded') return { computedNodes: expandedLayout.nodes, computedEdges: expandedLayout.edges }
    return { computedNodes: chainLayout.nodes, computedEdges: chainLayout.edges }
  }, [dagMode, groupsLayout, expandedLayout, chainLayout])

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges)

  useEffect(() => { setNodes(computedNodes) }, [computedNodes, setNodes])
  useEffect(() => { setEdges(computedEdges) }, [computedEdges, setEdges])

  // fitView on mode / layout changes
  const modeCounterRef = useRef(0)
  useEffect(() => {
    modeCounterRef.current++
    const c = modeCounterRef.current
    setTimeout(() => {
      if (c === modeCounterRef.current) fitView({ padding: 0.2, duration: 400 })
    }, 80)
  }, [dagMode, expandedGroups, chainFocusStepId, fitView])

  /* ── event handlers ───────────────────────────────────────────── */

  const expandGroup = useCallback((groupName: string) => {
    prevModeRef.current = dagMode === 'chain' ? prevModeRef.current : dagMode
    setExpandedGroups(prev => { const next = new Set(prev); next.add(groupName); return next })
    setDagMode('expanded')
  }, [dagMode])

  const collapseGroup = useCallback((groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.delete(groupName)
      if (next.size === 0) setDagMode('groups')
      return next
    })
  }, [])

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set())
    setDagMode('groups')
  }, [])

  const showAll = useCallback(() => {
    setExpandedGroups(new Set(groupMap.keys()))
    setDagMode('expanded')
  }, [groupMap])

  const enterChainMode = useCallback((stepId: string) => {
    prevModeRef.current = dagMode === 'chain' ? prevModeRef.current : dagMode
    setChainFocusStepId(stepId)
    setSelectedStepId(stepId)
    setDagMode('chain')
  }, [dagMode])

  const exitChainMode = useCallback(() => {
    setChainFocusStepId(null)
    const restoreMode = prevModeRef.current
    if (restoreMode === 'expanded' && expandedGroups.size === 0) {
      // Ensure we have groups expanded when returning to expanded mode
      setExpandedGroups(new Set(groupMap.keys()))
    }
    setDagMode(restoreMode)
  }, [expandedGroups, groupMap])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'group') {
      const groupName = node.id.replace(/^group:/, '')
      expandGroup(groupName)
    } else {
      // Toggle: click same node again → deselect and exit chain
      if (selectedStepId === node.id) {
        setSelectedStepId(null)
        if (dagMode === 'chain') exitChainMode()
      } else {
        enterChainMode(node.id)
      }
    }
  }, [expandGroup, selectedStepId, dagMode, enterChainMode, exitChainMode])

  const onPaneClick = useCallback(() => {
    setSelectedStepId(null)
  }, [])

  const handleSearch = useCallback((stepId: string | undefined) => {
    if (!stepId) {
      // X button clicked — clear fires onChange(undefined) before onClear
      setSelectedStepId(null)
      if (dagMode === 'chain') exitChainMode()
      return
    }
    enterChainMode(stepId)
  }, [dagMode, enterChainMode, exitChainMode])

  const selectedStep = steps.find(s => s.id === selectedStepId)
  const selectedResult = selectedStepId ? getStepResult(selectedStepId, runResult) : undefined

  const searchOptions = useMemo(() =>
    steps.map(s => ({ value: s.id, label: `[${s.method}] ${s.name}` })),
    [steps],
  )

  if (steps.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#999', padding: 48 }}>
        Add steps to see the dependency graph.
      </div>
    )
  }

  /* ── render ───────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 320px)', minHeight: 400, border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchOutlined style={{ color: '#bbb', fontSize: 13 }} />
        <Select
          showSearch
          placeholder="Search steps..."
          size="small"
          style={{ flex: 1, maxWidth: 300 }}
          value={dagMode === 'chain' ? chainFocusStepId || undefined : undefined}
          onChange={handleSearch}
          allowClear
          filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
          options={searchOptions}
        />

        {/* Mode indicator */}
        {dagMode === 'groups' && (
          <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>Groups View</Tag>
        )}
        {dagMode === 'expanded' && (
          <Tag color="green" style={{ margin: 0, fontSize: 11 }}>{expandedGroups.size} expanded</Tag>
        )}
        {dagMode === 'chain' && chainIds && (
          <>
            <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
              <AimOutlined style={{ marginRight: 3 }} />
              Chain: {chainIds.size} node{chainIds.size > 1 ? 's' : ''}
            </Tag>
            <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={exitChainMode} style={{ fontSize: 11, height: 22, padding: '0 6px' }}>
              Back
            </Button>
          </>
        )}

        {/* Expanded group tags */}
        {dagMode === 'expanded' && Array.from(expandedGroups).map(gn => (
          <Tag key={gn} closable onClose={() => collapseGroup(gn)} style={{ margin: 0, fontSize: 11 }}>{gn}</Tag>
        ))}

        {/* Action buttons */}
        {dagMode === 'expanded' && expandedGroups.size > 0 && (
          <Button size="small" type="text" icon={<CompressOutlined />} onClick={collapseAll} style={{ fontSize: 11, height: 22, padding: '0 6px' }}>
            Collapse All
          </Button>
        )}
        {dagMode === 'groups' && groupMap.size > 1 && (
          <Button size="small" type="text" icon={<ExpandOutlined />} onClick={showAll} style={{ fontSize: 11, height: 22, padding: '0 6px' }}>
            Show All
          </Button>
        )}
      </div>

      {/* Graph + Panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <style>{`
            @keyframes dagPulse {
              0%, 100% { box-shadow: 0 0 4px rgba(22,119,255,0.2); }
              50% { box-shadow: 0 0 12px rgba(22,119,255,0.5); }
            }
          `}</style>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              nodeColor={(n: any) => {
                if (n.type === 'group') {
                  const gd = n.data as GroupNodeData | undefined
                  if (gd?.aggregateStatus === 'success') return '#52c41a'
                  if (gd?.aggregateStatus === 'error') return '#f5222d'
                  if (gd?.aggregateStatus === 'running') return '#1677ff'
                  if (gd?.aggregateStatus === 'partial' || gd?.aggregateStatus === 'mixed') return '#fa8c16'
                  return '#bfbfbf'
                }
                const d = n.data as StepNodeData | undefined
                if (d?.dimmed) return '#f0f0f0'
                const status = d?.status
                if (status === 'SUCCESS') return '#52c41a'
                if (status === 'ERROR') return '#f5222d'
                if (status === 'running') return '#1677ff'
                if (status === 'VERIFICATION_FAILED') return '#722ed1'
                if (status === 'VALIDATION_FAILED') return '#13c2c2'
                if (d?.selected) return '#1677ff'
                return '#d9d9d9'
              }}
              style={{ bottom: 8, right: 8, height: 80, width: 120 }}
            />
          </ReactFlow>
        </div>
        {selectedStep && (
          <DagDetailPanel
            step={selectedStep}
            result={selectedResult}
            allSteps={steps}
            running={running}
            onClose={() => setSelectedStepId(null)}
            onEditStep={(stepId) => { setSelectedStepId(null); onEditStep?.(stepId) }}
            onRunStep={onRunStep}
          />
        )}
      </div>
    </div>
  )
}

export default function DagView(props: Props) {
  return (
    <ReactFlowProvider>
      <DagViewInner {...props} />
    </ReactFlowProvider>
  )
}
