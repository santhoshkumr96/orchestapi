import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

const METHOD_COLORS: Record<string, string> = {
  GET: '#52c41a',
  POST: '#1677ff',
  PUT: '#fa8c16',
  DELETE: '#ff4d4f',
  PATCH: '#722ed1',
}

type AggregateStatus = 'default' | 'running' | 'success' | 'error' | 'mixed' | 'partial'

const STATUS_STYLES: Record<AggregateStatus, { border: string; bg: string; leftBorder?: string }> = {
  default: { border: '#d9d9d9', bg: '#fafafa' },
  running: { border: '#1677ff', bg: '#e6f4ff' },
  success: { border: '#52c41a', bg: '#f6ffed', leftBorder: '#52c41a' },
  error: { border: '#f5222d', bg: '#fff2f0', leftBorder: '#f5222d' },
  mixed: { border: '#fa8c16', bg: '#fff7e6', leftBorder: '#fa8c16' },
  partial: { border: '#fa8c16', bg: '#fff7e6', leftBorder: '#fa8c16' },
}

export interface GroupNodeData {
  groupName: string
  stepCount: number
  methods: { method: string; count: number }[]
  aggregateStatus: AggregateStatus
  selected: boolean
  dimmed: boolean
}

function GroupNode({ data }: NodeProps & { data: GroupNodeData }) {
  const { groupName, stepCount, methods, aggregateStatus, selected, dimmed } = data
  const style = STATUS_STYLES[aggregateStatus] || STATUS_STYLES.default

  const MAX_DOTS = 8
  const dots = methods.slice(0, MAX_DOTS)
  const extraCount = methods.slice(MAX_DOTS).reduce((sum, m) => sum + m.count, 0)

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: '#d9d9d9', width: 6, height: 6 }} />
      <div
        style={{
          width: 240,
          height: 100,
          padding: '12px 14px',
          background: style.bg,
          border: `2px dashed ${selected ? '#1677ff' : style.border}`,
          borderLeft: style.leftBorder ? `3px solid ${style.leftBorder}` : undefined,
          borderRadius: 8,
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 1px #1677ff' : aggregateStatus === 'running' ? '0 0 8px rgba(22,119,255,0.3)' : '0 1px 3px rgba(0,0,0,0.08)',
          animation: aggregateStatus === 'running' ? 'dagPulse 1.5s ease-in-out infinite' : undefined,
          opacity: dimmed ? 0.15 : 1,
          transition: 'all 0.3s ease',
          display: 'flex',
          flexDirection: 'column' as const,
          justifyContent: 'space-between',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {groupName}
          </span>
          <span style={{ fontSize: 14, color: '#bfbfbf', marginLeft: 6, flexShrink: 0 }}>&#x276F;</span>
        </div>

        {/* Step count */}
        <div style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 500 }}>
          {stepCount} step{stepCount !== 1 ? 's' : ''}
        </div>

        {/* Method dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          {dots.map((m, i) => (
            <span
              key={i}
              title={`${m.method} (${m.count})`}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: METHOD_COLORS[m.method] || '#999',
                display: 'inline-block',
              }}
            />
          ))}
          {extraCount > 0 && (
            <span style={{ fontSize: 9, color: '#bfbfbf', lineHeight: '8px' }}>+{extraCount}</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#d9d9d9', width: 6, height: 6 }} />
    </>
  )
}

export default memo(GroupNode)
