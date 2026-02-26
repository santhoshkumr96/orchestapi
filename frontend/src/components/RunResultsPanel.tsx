import { useEffect, useRef } from 'react'
import { Badge, Button, Card, Collapse, Descriptions, Spin, Tag, Typography } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, CloseOutlined, LoadingOutlined } from '@ant-design/icons'
import type { SuiteExecutionResult, StepExecutionResult, VerificationResultDto } from '../services/testSuiteApi'
import type { TestStep } from '../types/testSuite'

const { Text, Title } = Typography

interface RunResultsPanelProps {
  result: SuiteExecutionResult
  allSteps: TestStep[]
  targetStepId?: string | null // null/undefined = suite run, string = single step run
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

function VerificationCard({ v }: { v: VerificationResultDto }) {
  const isPassed = v.status === 'PASS'
  const bgColor = isPassed ? '#f6ffed' : '#fff2f0'
  const borderColor = isPassed ? '#b7eb8f' : '#ffa39e'

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isPassed ? (
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
        ) : (
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />
        )}
        <Tag color="blue" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 4px' }}>
          {v.connectorType}
        </Tag>
        <Text strong style={{ fontSize: 13 }}>{v.connectorName}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{formatDuration(v.durationMs)}</Text>
        <Tag color={isPassed ? 'green' : 'red'} style={{ margin: 0 }}>{v.status}</Tag>
      </div>

      {/* Query */}
      <div>
        <Text type="secondary" style={{ fontSize: 11 }}>Query:</Text>
        <pre
          style={{
            margin: '2px 0 0 0',
            padding: 6,
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 3,
            fontFamily: 'monospace',
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {v.query}
        </pre>
      </div>

      {/* Error message for ERROR status */}
      {v.status !== 'PASS' && v.errorMessage && (
        <div style={{ color: '#ff4d4f', fontSize: 12 }}>{v.errorMessage}</div>
      )}

      {/* Assertions */}
      {v.assertions && v.assertions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Assertions:</Text>
          {v.assertions.map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                fontSize: 12,
                padding: '2px 0',
              }}
            >
              <code style={{ fontSize: 11, background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 2 }}>
                {a.jsonPath}
              </code>
              <Text type="secondary" style={{ fontSize: 11 }}>{a.operator}</Text>
              <code style={{ fontSize: 11, background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 2 }}>
                {a.expected}
              </code>
              {a.passed ? (
                <Tag color="green" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                  PASS
                </Tag>
              ) : (
                <Tag color="red" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                  FAIL (actual: {a.actual})
                </Tag>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Raw result (collapsible) */}
      {v.rawResult && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: '#595959', fontSize: 11 }}>
            Raw Result
          </summary>
          <pre
            style={{
              marginTop: 4,
              padding: 6,
              background: 'rgba(0,0,0,0.04)',
              borderRadius: 3,
              fontFamily: 'monospace',
              fontSize: 11,
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {v.rawResult}
          </pre>
        </details>
      )}
    </div>
  )
}

function StepResultDetail({ step }: { step: StepExecutionResult }) {
  const hasExtractedVars =
    step.extractedVariables && Object.keys(step.extractedVariables).length > 0
  const hasResponseHeaders =
    step.responseHeaders && Object.keys(step.responseHeaders).length > 0
  const hasRequestHeaders =
    step.requestHeaders && Object.keys(step.requestHeaders).length > 0
  const hasQueryParams =
    step.requestQueryParams && Object.keys(step.requestQueryParams).length > 0
  const hasRequestBody = step.requestBody && step.requestBody.trim().length > 0

  const preStyle: React.CSSProperties = {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Error message */}
      {step.errorMessage && (
        <div>
          <Text strong>Error:</Text>
          <div style={{ color: '#ff4d4f', marginTop: 4 }}>{step.errorMessage}</div>
        </div>
      )}

      {/* Request details */}
      {step.requestUrl && (
        <Collapse
          size="small"
          items={[{
            key: 'request',
            label: <Text strong style={{ fontSize: 12 }}>Request</Text>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Request URL */}
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>URL</Text>
                  <pre style={{ ...preStyle, maxHeight: 80, margin: '2px 0 0' }}>{step.requestUrl}</pre>
                </div>

                {/* Query Params */}
                {hasQueryParams && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Query Parameters</Text>
                    <Descriptions
                      size="small"
                      column={1}
                      bordered
                      style={{ marginTop: 2 }}
                      items={Object.entries(step.requestQueryParams).map(([key, value]) => ({
                        key,
                        label: key,
                        children: <code style={{ fontSize: 12 }}>{value}</code>,
                      }))}
                    />
                  </div>
                )}

                {/* Request Headers */}
                {hasRequestHeaders && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Headers</Text>
                    <Descriptions
                      size="small"
                      column={1}
                      bordered
                      style={{ marginTop: 2 }}
                      items={Object.entries(step.requestHeaders).map(([key, value]) => ({
                        key,
                        label: key,
                        children: value,
                      }))}
                    />
                  </div>
                )}

                {/* Request Body */}
                {hasRequestBody && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Body</Text>
                    <pre style={{ ...preStyle, margin: '2px 0 0' }}>{step.requestBody}</pre>
                  </div>
                )}
              </div>
            ),
          }]}
        />
      )}

      {/* Response body */}
      <div>
        <Text strong>Response Body:</Text>
        <pre style={preStyle}>
          {step.responseBody || '(empty)'}
        </pre>
      </div>

      {/* Response headers */}
      {hasResponseHeaders && (
        <div>
          <Text strong>Response Headers:</Text>
          <Descriptions
            size="small"
            column={1}
            bordered
            style={{ marginTop: 4 }}
            items={Object.entries(step.responseHeaders).map(([key, value]) => ({
              key,
              label: key,
              children: value,
            }))}
          />
        </div>
      )}

      {/* Extracted variables */}
      {hasExtractedVars && (
        <div>
          <Text strong>Extracted Variables:</Text>
          <Descriptions
            size="small"
            column={1}
            bordered
            style={{ marginTop: 4 }}
            items={Object.entries(step.extractedVariables).map(([key, value]) => ({
              key,
              label: key,
              children: (
                <code style={{ fontSize: 12 }}>{value}</code>
              ),
            }))}
          />
        </div>
      )}

      {/* Verification results */}
      {step.verificationResults && step.verificationResults.length > 0 && (
        <div>
          <Text strong>Verifications ({step.verificationResults.length}):</Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {step.verificationResults.map((v, i) => (
              <VerificationCard key={i} v={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StepResultCard({
  step,
  depResults,
  allSteps,
}: {
  step: StepExecutionResult
  depResults: StepExecutionResult[]
  allSteps: TestStep[]
}) {
  // Find method from allSteps definition
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
                <Tag color={METHOD_COLOR[method]} style={{ margin: 0, fontWeight: 600, minWidth: 52, textAlign: 'center' }}>
                  {method}
                </Tag>
              )}
              <Text strong>{step.stepName}</Text>
              <Tag color={STATUS_COLOR[step.status] ?? 'default'}>{step.status}</Tag>
              <Tag>{formatDuration(step.durationMs)}</Tag>
              <Tag color={step.responseCode >= 200 && step.responseCode < 300 ? 'green' : step.responseCode >= 400 ? 'red' : 'blue'}>
                {step.responseCode}
              </Tag>
              {step.fromCache ? (
                <Tag color="cyan">Cached</Tag>
              ) : (
                <Tag color="orange">Fresh</Tag>
              )}
              {depResults.length > 0 && (
                <Tag color="geekblue" style={{ margin: 0 }}>{depResults.length} dep{depResults.length > 1 ? 's' : ''}</Tag>
              )}
              {step.verificationResults?.length > 0 && (() => {
                const passed = step.verificationResults.filter(v => v.status === 'PASS').length
                const total = step.verificationResults.length
                const allPassed = passed === total
                return (
                  <Tag color={allPassed ? 'green' : 'red'} style={{ margin: 0 }}>
                    {passed}/{total} checks
                  </Tag>
                )
              })()}
            </div>
          ),
          children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* This step's own result detail */}
              <StepResultDetail step={step} />

              {/* Dependency results as accordion */}
              {depResults.length > 0 && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>Dependencies ({depResults.length})</Text>
                  <Collapse
                    size="small"
                    items={depResults.map((dep) => {
                      const depDef = allSteps.find((s) => s.id === dep.stepId)
                      const depMethod = depDef?.method
                      return {
                        key: dep.stepId,
                        label: (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {depMethod && (
                              <Tag color={METHOD_COLOR[depMethod]} style={{ margin: 0, fontWeight: 600, minWidth: 46, textAlign: 'center', fontSize: 11 }}>
                                {depMethod}
                              </Tag>
                            )}
                            <Text strong style={{ fontSize: 12 }}>{dep.stepName}</Text>
                            <Tag color={STATUS_COLOR[dep.status] ?? 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                              {dep.status}
                            </Tag>
                            <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                              {formatDuration(dep.durationMs)}
                            </Tag>
                            {dep.fromCache ? (
                              <Tag color="cyan" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                                Cached
                              </Tag>
                            ) : (
                              <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                                Fresh
                              </Tag>
                            )}
                          </div>
                        ),
                        children: <StepResultDetail step={dep} />,
                      }
                    })}
                  />
                </div>
              )}
            </div>
          ),
        },
      ]}
    />
  )
}

export default function RunResultsPanel({ result, allSteps, targetStepId, onClose }: RunResultsPanelProps) {
  // Build a lookup: stepId → StepExecutionResult
  const resultMap = new Map(result.steps.map((s) => [s.stepId, s]))

  // Build a lookup: stepId → direct dependency step IDs (from allSteps definitions)
  const stepDefMap = new Map(allSteps.map((s) => [s.id, s]))

  // Get transitive dependency results for a given stepId
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

  // Auto-scroll to latest step as results stream in
  useEffect(() => {
    if (isStreaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [result.steps.length, isStreaming])

  // Single step run: only show the target step at top level (deps go in tabs)
  // Suite run: show all steps at top level
  const topLevelSteps = targetStepId
    ? result.steps.filter((s) => s.stepId === targetStepId)
    : result.steps
  return (
    <Card
      size="small"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Title level={5} style={{ margin: 0 }}>
            Run Results
          </Title>
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
      extra={
        <Button type="text" icon={<CloseOutlined />} onClick={onClose} size="small" />
      }
      style={{ marginTop: 12 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {topLevelSteps.map((step, index) => (
          <div key={step.stepId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {/* Timeline dot and line */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 24,
                paddingTop: 10,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background:
                    step.status === 'SUCCESS'
                      ? '#52c41a'
                      : step.status === 'ERROR'
                        ? '#ff4d4f'
                        : step.status === 'VERIFICATION_FAILED'
                          ? '#722ed1'
                          : step.status === 'SKIPPED'
                            ? '#d9d9d9'
                            : '#fa8c16',
                  flexShrink: 0,
                }}
              />
              {(index < topLevelSteps.length - 1 || isStreaming) && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 20,
                    background: '#e8e8e8',
                    marginTop: 4,
                  }}
                />
              )}
            </div>
            {/* Step result card */}
            <div style={{ flex: 1 }}>
              <StepResultCard
                step={step}
                depResults={getDepResults(step.stepId)}
                allSteps={allSteps}
              />
            </div>
          </div>
        ))}
        {/* Streaming spinner */}
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
