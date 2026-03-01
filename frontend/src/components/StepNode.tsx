import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TestStep } from '../types/testSuite'

const METHOD_COLORS: Record<string, string> = {
  GET: '#52c41a',
  POST: '#1677ff',
  PUT: '#fa8c16',
  DELETE: '#ff4d4f',
  PATCH: '#722ed1',
}

type StepStatus = 'default' | 'pending' | 'running' | 'SUCCESS' | 'ERROR' | 'SKIPPED' | 'VERIFICATION_FAILED' | 'VALIDATION_FAILED'

const STATUS_STYLES: Record<StepStatus, { border: string; bg: string; leftBorder?: string }> = {
  default: { border: '#d9d9d9', bg: '#fff' },
  pending: { border: '#d9d9d9', bg: '#fafafa' },
  running: { border: '#1677ff', bg: '#e6f4ff' },
  SUCCESS: { border: '#52c41a', bg: '#f6ffed', leftBorder: '#52c41a' },
  ERROR: { border: '#f5222d', bg: '#fff2f0', leftBorder: '#f5222d' },
  SKIPPED: { border: '#8c8c8c', bg: '#fafafa' },
  VERIFICATION_FAILED: { border: '#722ed1', bg: '#f9f0ff', leftBorder: '#722ed1' },
  VALIDATION_FAILED: { border: '#13c2c2', bg: '#e6fffb', leftBorder: '#13c2c2' },
}

export interface StepNodeData {
  step: TestStep
  status: StepStatus
  durationMs?: number
  selected: boolean
  depCount: number
  dimmed: boolean
}

function StepNode({ data }: NodeProps & { data: StepNodeData }) {
  const { step, status, durationMs, selected, depCount, dimmed } = data
  const style = STATUS_STYLES[status] || STATUS_STYLES.default
  const methodColor = METHOD_COLORS[step.method] || '#666'

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: '#d9d9d9', width: 6, height: 6 }} />
      <div
        style={{
          width: 200,
          padding: '8px 10px',
          background: style.bg,
          border: `1.5px ${step.dependencyOnly ? 'dashed' : 'solid'} ${selected ? '#1677ff' : style.border}`,
          borderLeft: style.leftBorder ? `3px solid ${style.leftBorder}` : undefined,
          borderRadius: 6,
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 1px #1677ff' : status === 'running' ? '0 0 8px rgba(22,119,255,0.3)' : '0 1px 2px rgba(0,0,0,0.06)',
          animation: status === 'running' ? 'dagPulse 1.5s ease-in-out infinite' : undefined,
          opacity: dimmed ? 0.15 : 1,
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#fff',
              background: methodColor,
              borderRadius: 3,
              padding: '1px 5px',
              lineHeight: '16px',
            }}
          >
            {step.method}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#262626',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              fontStyle: step.dependencyOnly ? 'italic' : undefined,
            }}
          >
            {step.name}
          </span>
        </div>
        <div
          style={{
            fontSize: 10,
            color: '#8c8c8c',
            fontFamily: "'Fira Code', monospace",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {step.url || '—'}
        </div>
        {(depCount > 0 || durationMs != null) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#bfbfbf', marginTop: 3 }}>
            {depCount > 0 ? <span>{depCount} dep{depCount > 1 ? 's' : ''}</span> : <span />}
            {durationMs != null ? <span>{durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}</span> : null}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#d9d9d9', width: 6, height: 6 }} />
    </>
  )
}

export default memo(StepNode)
