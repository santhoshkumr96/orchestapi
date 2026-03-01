import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
} from '@xyflow/react'
import dagre from 'dagre'
import '@xyflow/react/dist/style.css'

import StepNode, { type StepNodeData } from './StepNode'
import DagDetailPanel from './DagDetailPanel'
import type { TestStep } from '../types/testSuite'
import type { SuiteExecutionResult, StepExecutionResult } from '../services/testSuiteApi'

const NODE_WIDTH = 200
const NODE_HEIGHT = 70

const nodeTypes: NodeTypes = { step: StepNode as any }

function getLayout(steps: TestStep[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 80, align: 'UL' })

  for (const step of steps) {
    g.setNode(step.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const step of steps) {
    for (const dep of step.dependencies) {
      g.setEdge(dep.dependsOnStepId, step.id)
    }
  }

  dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  for (const step of steps) {
    const node = g.node(step.id)
    if (node) {
      positions.set(step.id, { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2 })
    }
  }
  return positions
}

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

interface Props {
  steps: TestStep[]
  runResult: SuiteExecutionResult | null
  running: boolean
  onEditStep?: (stepId: string) => void
}

export default function DagView({ steps, runResult, running, onEditStep }: Props) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)

  const positions = useMemo(() => getLayout(steps), [steps])

  const initialNodes: Node[] = useMemo(() =>
    steps.map(step => ({
      id: step.id,
      type: 'step',
      position: positions.get(step.id) || { x: 0, y: 0 },
      data: {
        step,
        status: getStepStatus(step.id, runResult, running),
        durationMs: getStepResult(step.id, runResult)?.durationMs,
        selected: step.id === selectedStepId,
        depCount: step.dependencies.length,
      } satisfies StepNodeData,
    })),
    [steps, runResult, running, selectedStepId, positions]
  )

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = []
    for (const step of steps) {
      for (const dep of step.dependencies) {
        const sourceResult = getStepResult(dep.dependsOnStepId, runResult)
        const isSuccess = sourceResult?.status === 'SUCCESS'
        const isFailed = sourceResult?.status === 'ERROR'
        edges.push({
          id: `${dep.dependsOnStepId}->${step.id}`,
          source: dep.dependsOnStepId,
          target: step.id,
          type: 'smoothstep',
          animated: running && isSuccess,
          style: {
            stroke: isFailed ? '#f5222d' : isSuccess ? '#52c41a' : '#d9d9d9',
            strokeWidth: 1.5,
            transition: 'stroke 0.3s ease',
          },
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: isFailed ? '#f5222d' : isSuccess ? '#52c41a' : '#d9d9d9' },
        })
      }
    }
    return edges
  }, [steps, runResult, running])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => { setNodes(initialNodes) }, [initialNodes, setNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges, setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedStepId(prev => prev === node.id ? null : node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedStepId(null)
  }, [])

  const selectedStep = steps.find(s => s.id === selectedStepId)
  const selectedResult = selectedStepId ? getStepResult(selectedStepId, runResult) : undefined

  if (steps.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#999', padding: 48 }}>
        Add steps to see the dependency graph.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: 420, border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
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
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            nodeColor={(n: any) => {
              const status = n.data?.status
              if (status === 'SUCCESS') return '#52c41a'
              if (status === 'ERROR') return '#f5222d'
              if (status === 'running') return '#1677ff'
              if (status === 'VERIFICATION_FAILED') return '#722ed1'
              if (status === 'VALIDATION_FAILED') return '#13c2c2'
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
          onClose={() => setSelectedStepId(null)}
          onEditStep={(stepId) => { setSelectedStepId(null); onEditStep?.(stepId) }}
        />
      )}
    </div>
  )
}
