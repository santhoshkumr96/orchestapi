import { useEffect, useRef } from 'react'
import { Badge, Button, Card, Collapse, Descriptions, Spin, Tabs, Tag, Typography, message } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, CloseOutlined, CopyOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons'
import type { SuiteExecutionResult, StepExecutionResult, VerificationResultDto } from '../services/testSuiteApi'
import type { TestStep } from '../types/testSuite'

const { Text, Title } = Typography

interface RunResultsPanelProps {
  result: SuiteExecutionResult
  allSteps: TestStep[]
  targetStepId?: string | null
  onClose: () => void
}

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'green',
  PARTIAL_FAILURE: 'orange',
  FAILURE: 'red',
  ERROR: 'red',
  SKIPPED: 'default',
  RETRIED: 'orange',
  VERIFICATION_FAILED: 'purple',
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  SUCCESS: 'success',
  PARTIAL_FAILURE: 'warning',
  FAILURE: 'error',
  VERIFICATION_FAILED: 'warning',
}

const METHOD_COLOR: Record<string, string> = {
  GET: '#52c41a',
  POST: '#1677ff',
  PUT: '#fa8c16',
  DELETE: '#ff4d4f',
  PATCH: '#722ed1',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatSize(text: string): string {
  const bytes = new Blob([text]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function syntaxHighlightJson(text: string): string {
  let json: string
  try {
    json = JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return escapeHtml(text)
  }
  json = escapeHtml(json)
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let color = '#b5cea8'
      if (/^"/.test(match)) {
        color = /:$/.test(match) ? '#9cdcfe' : '#ce9178'
      } else if (/true|false/.test(match)) {
        color = '#569cd6'
      } else if (/null/.test(match)) {
        color = '#569cd6'
      }
      return `<span style="color:${color}">${match}</span>`
    }
  )
}

function isJson(text: string): boolean {
  try { JSON.parse(text); return true } catch { return false }
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  return (
    <Button
      type="text"
      size="small"
      icon={<CopyOutlined />}
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        message.success(`${label || 'Text'} copied`)
      }}
      style={{ fontSize: 11, height: 20, padding: '0 4px' }}
    >
      Copy
    </Button>
  )
}

function buildCurlFromResult(step: StepExecutionResult, method?: string): string {
  const parts: string[] = [`curl -X ${method || 'GET'}`]
  if (step.requestHeaders) {
    Object.entries(step.requestHeaders).forEach(([key, value]) => {
      parts.push(`  -H '${key}: ${value.replace(/'/g, "'\\''")}'`)
    })
  }
  if (step.requestBody && step.requestBody.trim() && !step.requestBody.startsWith('[multipart/form-data')) {
    parts.push(`  -d '${step.requestBody.replace(/'/g, "'\\''")}'`)
  }
  parts.push(`  '${step.requestUrl || ''}'`)
  return parts.join(' \\\n')
}

const codeBlockStyle: React.CSSProperties = {
  marginTop: 4,
  padding: 8,
  background: '#f5f5f5',
  borderRadius: 4,
  maxHeight: 300,
  overflow: 'auto',
  fontFamily: 'monospace',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}

const darkCodeBlockStyle: React.CSSProperties = {
  ...codeBlockStyle,
  background: '#1e1e1e',
  color: '#d4d4d4',
}

/* ─── Verification Card (unchanged) ─── */

function VerificationCard({ v }: { v: VerificationResultDto }) {
  const isPassed = v.status === 'PASS'
  const bgColor = isPassed ? '#f6ffed' : '#fff2f0'
  const borderColor = isPassed ? '#b7eb8f' : '#ffa39e'

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isPassed
          ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
          : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />}
        <Tag color="blue" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 4px' }}>{v.connectorType}</Tag>
        <Text strong style={{ fontSize: 13 }}>{v.connectorName}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{formatDuration(v.durationMs)}</Text>
        <Tag color={isPassed ? 'green' : 'red'} style={{ margin: 0 }}>{v.status}</Tag>
      </div>

      <div>
        <Text type="secondary" style={{ fontSize: 11 }}>Query:</Text>
        <CopyBtn text={v.query} label="Query" />
        <pre style={{ margin: '2px 0 0 0', padding: 6, background: 'rgba(0,0,0,0.04)', borderRadius: 3, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {v.query}
        </pre>
      </div>

      {v.status !== 'PASS' && v.errorMessage && (
        <div style={{ color: '#ff4d4f', fontSize: 12 }}>{v.errorMessage}</div>
      )}

      {v.assertions && v.assertions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Assertions:</Text>
          {v.assertions.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, padding: '2px 0' }}>
              <code style={{ fontSize: 11, background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 2 }}>{a.jsonPath}</code>
              <Text type="secondary" style={{ fontSize: 11 }}>{a.operator}</Text>
              <code style={{ fontSize: 11, background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 2 }}>{a.expected}</code>
              {a.passed
                ? <Tag color="green" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>PASS</Tag>
                : <Tag color="red" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>FAIL (actual: {a.actual})</Tag>}
            </div>
          ))}
        </div>
      )}

      {v.rawResult && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: '#595959', fontSize: 11 }}>Raw Result</summary>
          <CopyBtn text={v.rawResult} label="Raw result" />
          <pre style={{ marginTop: 4, padding: 6, background: 'rgba(0,0,0,0.04)', borderRadius: 3, fontFamily: 'monospace', fontSize: 11, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {v.rawResult}
          </pre>
        </details>
      )}
    </div>
  )
}

/* ─── Tab-based Step Detail ─── */

function StepResultTabs({ step, method, depResults, allSteps }: {
  step: StepExecutionResult
  method?: string
  depResults: StepExecutionResult[]
  allSteps: TestStep[]
}) {
  const hasRequestHeaders = step.requestHeaders && Object.keys(step.requestHeaders).length > 0
  const hasResponseHeaders = step.responseHeaders && Object.keys(step.responseHeaders).length > 0
  const hasQueryParams = step.requestQueryParams && Object.keys(step.requestQueryParams).length > 0
  const hasRequestBody = step.requestBody && step.requestBody.trim().length > 0
  const hasExtractedVars = step.extractedVariables && Object.keys(step.extractedVariables).length > 0
  const hasVerifications = step.verificationResults && step.verificationResults.length > 0
  const hasWarnings = step.warnings && step.warnings.length > 0

  const tabItems = []

  /* ── Request Tab ── */
  tabItems.push({
    key: 'request',
    label: (
      <span>
        Request
        {hasRequestBody && <Tag style={{ margin: '0 0 0 6px', fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{formatSize(step.requestBody)}</Tag>}
        {hasWarnings && <WarningOutlined style={{ color: '#fa8c16', marginLeft: 6, fontSize: 12 }} />}
      </span>
    ),
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Unresolved variable warnings */}
        {hasWarnings && (
          <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4, padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <WarningOutlined style={{ color: '#fa8c16', fontSize: 13 }} />
              <Text strong style={{ color: '#ad6800', fontSize: 12 }}>Unresolved Variables ({step.warnings.length})</Text>
            </div>
            {step.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#ad6800', padding: '2px 0 2px 20px', wordBreak: 'break-word' }}>{w}</div>
            ))}
          </div>
        )}

        {/* cURL copy */}
        {step.requestUrl && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(buildCurlFromResult(step, method))
                message.success('cURL copied to clipboard')
              }}
            >
              Copy as cURL
            </Button>
          </div>
        )}

        {/* URL */}
        {step.requestUrl && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              {method && <Tag color={METHOD_COLOR[method]} style={{ margin: 0, fontWeight: 600 }}>{method}</Tag>}
              <Text type="secondary" style={{ fontSize: 11 }}>URL</Text>
              <CopyBtn text={step.requestUrl} label="URL" />
            </div>
            <pre style={{ ...codeBlockStyle, maxHeight: 80, margin: 0 }}>{step.requestUrl}</pre>
          </div>
        )}

        {/* Query Params */}
        {hasQueryParams && (
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Query Parameters</Text>
            <CopyBtn
              text={JSON.stringify(step.requestQueryParams, null, 2)}
              label="Query params"
            />
            <Descriptions
              size="small"
              column={1}
              bordered
              style={{ marginTop: 2 }}
              items={Object.entries(step.requestQueryParams).map(([key, value]) => ({
                key,
                label: <code style={{ fontSize: 11 }}>{key}</code>,
                children: <code style={{ fontSize: 12 }}>{value}</code>,
              }))}
            />
          </div>
        )}

        {/* Request Headers */}
        {hasRequestHeaders && (
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Headers ({Object.keys(step.requestHeaders).length})</Text>
            <CopyBtn
              text={JSON.stringify(step.requestHeaders, null, 2)}
              label="Request headers"
            />
            <Descriptions
              size="small"
              column={1}
              bordered
              style={{ marginTop: 2 }}
              items={Object.entries(step.requestHeaders).map(([key, value]) => ({
                key,
                label: <code style={{ fontSize: 11 }}>{key}</code>,
                children: <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{value}</span>,
              }))}
            />
          </div>
        )}

        {/* Request Body */}
        {hasRequestBody && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Body</Text>
              <CopyBtn text={step.requestBody} label="Request body" />
            </div>
            {isJson(step.requestBody) ? (
              <pre style={{ ...darkCodeBlockStyle, margin: 0 }} dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(step.requestBody) }} />
            ) : (
              <pre style={{ ...codeBlockStyle, margin: 0 }}>{step.requestBody}</pre>
            )}
          </div>
        )}

        {!step.requestUrl && !hasRequestBody && !hasQueryParams && !hasRequestHeaders && (
          <Text type="secondary" style={{ fontSize: 12 }}>No request data available</Text>
        )}
      </div>
    ),
  })

  /* ── Response Tab ── */
  tabItems.push({
    key: 'response',
    label: (
      <span>
        Response
        <Tag
          color={step.responseCode >= 200 && step.responseCode < 300 ? 'green' : step.responseCode >= 400 ? 'red' : 'blue'}
          style={{ margin: '0 0 0 6px', fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
        >
          {step.responseCode}
        </Tag>
        {step.responseBody && <Tag style={{ margin: '0 0 0 4px', fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{formatSize(step.responseBody)}</Tag>}
      </span>
    ),
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Error message */}
        {step.errorMessage && (
          <div style={{ background: '#fff2f0', border: '1px solid #ffa39e', borderRadius: 4, padding: 8 }}>
            <Text strong style={{ color: '#ff4d4f', fontSize: 12 }}>Error: </Text>
            <span style={{ color: '#ff4d4f', fontSize: 12 }}>{step.errorMessage}</span>
          </div>
        )}

        {/* Response Body */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Body</Text>
            {step.responseBody && <CopyBtn text={step.responseBody} label="Response body" />}
          </div>
          {step.responseBody && isJson(step.responseBody) ? (
            <pre style={{ ...darkCodeBlockStyle, margin: 0 }} dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(step.responseBody) }} />
          ) : (
            <pre style={{ ...codeBlockStyle, margin: 0 }}>{step.responseBody || '(empty)'}</pre>
          )}
        </div>

        {/* Response Headers */}
        {hasResponseHeaders && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Headers ({Object.keys(step.responseHeaders).length})</Text>
              <CopyBtn
                text={JSON.stringify(step.responseHeaders, null, 2)}
                label="Response headers"
              />
            </div>
            <Descriptions
              size="small"
              column={1}
              bordered
              style={{ marginTop: 2 }}
              items={Object.entries(step.responseHeaders).map(([key, value]) => ({
                key,
                label: <code style={{ fontSize: 11 }}>{key}</code>,
                children: <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{value}</span>,
              }))}
            />
          </div>
        )}
      </div>
    ),
  })

  /* ── Variables Tab ── */
  if (hasExtractedVars) {
    tabItems.push({
      key: 'variables',
      label: (
        <span>
          Variables
          <Tag style={{ margin: '0 0 0 6px', fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
            {Object.keys(step.extractedVariables).length}
          </Tag>
        </span>
      ),
      children: (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Extracted Variables</Text>
            <CopyBtn
              text={JSON.stringify(step.extractedVariables, null, 2)}
              label="Variables"
            />
          </div>
          <Descriptions
            size="small"
            column={1}
            bordered
            items={Object.entries(step.extractedVariables).map(([key, value]) => ({
              key,
              label: <code style={{ fontSize: 11, fontWeight: 600 }}>{key}</code>,
              children: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{ fontSize: 12, flex: 1, wordBreak: 'break-all' }}>{value}</code>
                  <CopyBtn text={value} label={key} />
                </div>
              ),
            }))}
          />
        </div>
      ),
    })
  }

  /* ── Verifications Tab ── */
  if (hasVerifications) {
    const passed = step.verificationResults.filter(v => v.status === 'PASS').length
    const total = step.verificationResults.length
    const allPassed = passed === total

    tabItems.push({
      key: 'verifications',
      label: (
        <span>
          Verifications
          <Tag color={allPassed ? 'green' : 'red'} style={{ margin: '0 0 0 6px', fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
            {passed}/{total}
          </Tag>
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {step.verificationResults.map((v, i) => (
            <VerificationCard key={i} v={v} />
          ))}
        </div>
      ),
    })
  }

  /* ── Dependencies Tab ── */
  if (depResults.length > 0) {
    tabItems.push({
      key: 'dependencies',
      label: (
        <span>
          Dependencies
          <Tag color="geekblue" style={{ margin: '0 0 0 6px', fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
            {depResults.length}
          </Tag>
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {depResults.map((dep) => {
            const depDef = allSteps.find((s) => s.id === dep.stepId)
            const depMethod = depDef?.method
            return (
              <Collapse
                key={dep.stepId}
                size="small"
                items={[{
                  key: dep.stepId,
                  label: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {depMethod && (
                        <Tag color={METHOD_COLOR[depMethod]} style={{ margin: 0, fontWeight: 600, minWidth: 46, textAlign: 'center', fontSize: 11 }}>{depMethod}</Tag>
                      )}
                      <Text strong style={{ fontSize: 12 }}>{dep.stepName}</Text>
                      <Tag color={STATUS_COLOR[dep.status] ?? 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{dep.status}</Tag>
                      <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{formatDuration(dep.durationMs)}</Tag>
                      <Tag
                        color={dep.responseCode >= 200 && dep.responseCode < 300 ? 'green' : dep.responseCode >= 400 ? 'red' : 'blue'}
                        style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                      >
                        {dep.responseCode}
                      </Tag>
                      {dep.fromCache
                        ? <Tag color="cyan" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>Cached</Tag>
                        : <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>Fresh</Tag>}
                    </div>
                  ),
                  children: (
                    <StepResultTabs
                      step={dep}
                      method={depMethod}
                      depResults={[]}
                      allSteps={allSteps}
                    />
                  ),
                }]}
              />
            )
          })}
        </div>
      ),
    })
  }

  return (
    <Tabs
      size="small"
      type="card"
      items={tabItems}
      style={{ marginTop: 4 }}
    />
  )
}

/* ─── Step Result Card (accordion header, tabs inside) ─── */

function StepResultCard({
  step,
  depResults,
  allSteps,
}: {
  step: StepExecutionResult
  depResults: StepExecutionResult[]
  allSteps: TestStep[]
}) {
  const stepDef = allSteps.find((s) => s.id === step.stepId)
  const method = stepDef?.method

  return (
    <Collapse
      size="small"
      items={[
        {
          key: step.stepId,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {method && (
                <Tag color={METHOD_COLOR[method]} style={{ margin: 0, fontWeight: 600, minWidth: 52, textAlign: 'center' }}>{method}</Tag>
              )}
              <Text strong>{step.stepName}</Text>
              <Tag color={STATUS_COLOR[step.status] ?? 'default'}>{step.status}</Tag>
              <Tag>{formatDuration(step.durationMs)}</Tag>
              <Tag color={step.responseCode >= 200 && step.responseCode < 300 ? 'green' : step.responseCode >= 400 ? 'red' : 'blue'}>
                {step.responseCode}
              </Tag>
              {step.responseBody && <Tag style={{ margin: 0 }}>{formatSize(step.responseBody)}</Tag>}
              {step.fromCache
                ? <Tag color="cyan">Cached</Tag>
                : <Tag color="orange">Fresh</Tag>}
              {depResults.length > 0 && (
                <Tag color="geekblue" style={{ margin: 0 }}>{depResults.length} dep{depResults.length > 1 ? 's' : ''}</Tag>
              )}
              {step.verificationResults?.length > 0 && (() => {
                const passed = step.verificationResults.filter(v => v.status === 'PASS').length
                const total = step.verificationResults.length
                return (
                  <Tag color={passed === total ? 'green' : 'red'} style={{ margin: 0 }}>{passed}/{total} checks</Tag>
                )
              })()}
              {step.warnings?.length > 0 && (
                <Tag color="warning" icon={<WarningOutlined />} style={{ margin: 0 }}>
                  {step.warnings.length} unresolved var{step.warnings.length > 1 ? 's' : ''}
                </Tag>
              )}
            </div>
          ),
          children: (
            <StepResultTabs
              step={step}
              method={method}
              depResults={depResults}
              allSteps={allSteps}
            />
          ),
        },
      ]}
    />
  )
}

/* ─── Main Panel ─── */

export default function RunResultsPanel({ result, allSteps, targetStepId, onClose }: RunResultsPanelProps) {
  const resultMap = new Map(result.steps.map((s) => [s.stepId, s]))
  const stepDefMap = new Map(allSteps.map((s) => [s.id, s]))

  const getDepResults = (stepId: string): StepExecutionResult[] => {
    const visited = new Set<string>()
    const deps: StepExecutionResult[] = []
    const walk = (id: string) => {
      const def = stepDefMap.get(id)
      if (!def) return
      for (const dep of def.dependencies) {
        if (visited.has(dep.dependsOnStepId)) continue
        visited.add(dep.dependsOnStepId)
        const depResult = resultMap.get(dep.dependsOnStepId)
        if (depResult) deps.push(depResult)
        walk(dep.dependsOnStepId)
      }
    }
    walk(stepId)
    return deps
  }

  const isStreaming = result.status === 'RUNNING'
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isStreaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [result.steps.length, isStreaming])

  const topLevelSteps = targetStepId
    ? result.steps.filter((s) => s.stepId === targetStepId)
    : result.steps

  return (
    <Card
      size="small"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Title level={5} style={{ margin: 0 }}>Run Results</Title>
          {isStreaming ? (
            <Tag icon={<LoadingOutlined spin />} color="processing">Running...</Tag>
          ) : (
            <>
              <Badge
                status={STATUS_BADGE[result.status] ?? 'default'}
                text={<Tag color={STATUS_COLOR[result.status] ?? 'default'}>{result.status}</Tag>}
              />
              <Text type="secondary">{formatDuration(result.totalDurationMs)}</Text>
            </>
          )}
        </div>
      }
      extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} size="small" />}
      style={{ marginTop: 12 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {topLevelSteps.map((step, index) => (
          <div key={step.stepId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {/* Timeline dot and line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 24, paddingTop: 10 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background:
                    step.status === 'SUCCESS' ? '#52c41a'
                    : step.status === 'ERROR' ? '#ff4d4f'
                    : step.status === 'VERIFICATION_FAILED' ? '#722ed1'
                    : step.status === 'SKIPPED' ? '#d9d9d9'
                    : '#fa8c16',
                  flexShrink: 0,
                }}
              />
              {(index < topLevelSteps.length - 1 || isStreaming) && (
                <div style={{ width: 2, flex: 1, minHeight: 20, background: '#e8e8e8', marginTop: 4 }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <StepResultCard
                step={step}
                depResults={getDepResults(step.stepId)}
                allSteps={allSteps}
              />
            </div>
          </div>
        ))}
        {isStreaming && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 4 }}>
            <Spin indicator={<LoadingOutlined spin style={{ fontSize: 16 }} />} />
            <Text type="secondary" style={{ fontSize: 12 }}>Waiting for next step...</Text>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </Card>
  )
}
