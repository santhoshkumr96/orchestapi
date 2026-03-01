import { CaretRightOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Tag } from 'antd'
import type { TestStep } from '../types/testSuite'
import type { StepExecutionResult } from '../services/testSuiteApi'

const METHOD_COLORS: Record<string, string> = {
  GET: '#52c41a',
  POST: '#1677ff',
  PUT: '#fa8c16',
  DELETE: '#ff4d4f',
  PATCH: '#722ed1',
}

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: '#52c41a',
  ERROR: '#f5222d',
  SKIPPED: '#8c8c8c',
  VERIFICATION_FAILED: '#722ed1',
  VALIDATION_FAILED: '#13c2c2',
}

interface Props {
  step: TestStep
  result?: StepExecutionResult
  allSteps: TestStep[]
  running?: boolean
  onClose: () => void
  onEditStep: (stepId: string) => void
  onRunStep?: (stepId: string) => void
}

const label: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: '#8c8c8c',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  marginBottom: 2,
}

export default function DagDetailPanel({ step, result, allSteps, running, onClose, onEditStep, onRunStep }: Props) {
  const stepMap = new Map(allSteps.map(s => [s.id, s]))
  const depNames = step.dependencies.map(d => stepMap.get(d.dependsOnStepId)?.name || 'Unknown')

  return (
    <div
      style={{
        width: 300,
        borderLeft: '1px solid #f0f0f0',
        background: '#fff',
        padding: 16,
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tag color={METHOD_COLORS[step.method]} style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>
            {step.method}
          </Tag>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>{step.name}</span>
        </div>
        <CloseOutlined onClick={onClose} style={{ cursor: 'pointer', color: '#bfbfbf', fontSize: 12 }} />
      </div>

      {/* URL */}
      <div style={{ marginBottom: 12 }}>
        <div style={label}>URL</div>
        <div style={{ fontFamily: "'Fira Code', monospace", fontSize: 11, color: '#595959', wordBreak: 'break-all' }}>
          {step.url || '—'}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {onRunStep && (
          <Button
            size="small"
            icon={<CaretRightOutlined />}
            onClick={() => onRunStep(step.id)}
            disabled={running}
            style={{ flex: 1 }}
          >
            Run
          </Button>
        )}
        <Button
          type="primary"
          size="small"
          icon={<EditOutlined />}
          onClick={() => onEditStep(step.id)}
          style={{ flex: 1 }}
        >
          View / Edit
        </Button>
      </div>

      {/* Dependencies */}
      {depNames.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Dependencies ({depNames.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {depNames.map((n, i) => (
              <Tag key={i} style={{ fontSize: 11, margin: 0 }}>{n}</Tag>
            ))}
          </div>
        </div>
      )}

      {/* Flags */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {step.dependencyOnly && <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>Dep-Only</Tag>}
        {step.cacheable && <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>Cacheable</Tag>}
        {(step.responseHandlers?.length ?? 0) > 0 && <Tag color="gold" style={{ fontSize: 10, margin: 0 }}>{step.responseHandlers!.length} Handlers</Tag>}
        {(step.verifications?.length ?? 0) > 0 && <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>{step.verifications!.length} Verifications</Tag>}
        {(step.responseValidations?.length ?? 0) > 0 && <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>{step.responseValidations!.length} Validations</Tag>}
      </div>

      {/* Run Result */}
      {result && (
        <>
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 4 }}>
            <div style={label}>Execution Result</div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8, marginTop: 4 }}>
            <Tag color={STATUS_COLORS[result.status] || '#8c8c8c'} style={{ fontSize: 11, margin: 0 }}>
              {result.status}
            </Tag>
            {result.responseCode > 0 && (
              <Tag style={{ fontSize: 11, margin: 0, fontFamily: "'Fira Code', monospace" }}>{result.responseCode}</Tag>
            )}
          </div>

          {result.durationMs > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={label}>Duration</div>
              <span style={{ fontSize: 12, color: '#262626' }}>
                {result.durationMs < 1000 ? `${result.durationMs}ms` : `${(result.durationMs / 1000).toFixed(2)}s`}
              </span>
            </div>
          )}

          {result.errorMessage && (
            <div style={{ marginBottom: 8 }}>
              <div style={label}>Error</div>
              <div style={{ fontSize: 11, color: '#f5222d', background: '#fff2f0', padding: '6px 8px', borderRadius: 4, wordBreak: 'break-word' }}>
                {result.errorMessage}
              </div>
            </div>
          )}

          {result.fromCache && <Tag color="blue" style={{ fontSize: 10 }}>From Cache</Tag>}
        </>
      )}
    </div>
  )
}
