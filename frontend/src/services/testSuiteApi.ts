import axios from 'axios'
import type {
  TestSuite,
  TestSuiteRequest,
  TestSuiteListParams,
  TestStep,
  TestStepRequest,
} from '../types/testSuite'
import type { PageResponse } from '../types/environment'

export interface AssertionResultDto {
  jsonPath: string
  operator: string
  expected: string
  actual: string
  passed: boolean
}

export interface VerificationResultDto {
  connectorName: string
  connectorType: string
  query: string
  status: string // PASS, FAIL, ERROR
  durationMs: number
  errorMessage: string
  rawResult: string
  assertions: AssertionResultDto[]
}

export interface StepExecutionResult {
  stepId: string
  stepName: string
  status: string // SUCCESS, ERROR, SKIPPED, RETRIED, VERIFICATION_FAILED
  responseCode: number
  responseBody: string
  responseHeaders: Record<string, string>
  durationMs: number
  errorMessage: string
  fromCache: boolean
  extractedVariables: Record<string, string>
  verificationResults: VerificationResultDto[]
  requestUrl: string
  requestBody: string
  requestHeaders: Record<string, string>
  requestQueryParams: Record<string, string>
  warnings: string[]
}

export interface SuiteExecutionResult {
  status: string // SUCCESS, PARTIAL_FAILURE, FAILURE
  steps: StepExecutionResult[]
  totalDurationMs: number
}

const SUITES_BASE = '/api/test-suites'

export const testSuiteApi = {
  list: (params: TestSuiteListParams = {}) =>
    axios
      .get<PageResponse<TestSuite>>(SUITES_BASE, { params })
      .then((r) => r.data),

  get: (id: string) =>
    axios.get<TestSuite>(`${SUITES_BASE}/${id}`).then((r) => r.data),

  create: (data: TestSuiteRequest) =>
    axios.post<TestSuite>(SUITES_BASE, data).then((r) => r.data),

  update: (id: string, data: TestSuiteRequest) =>
    axios.put<TestSuite>(`${SUITES_BASE}/${id}`, data).then((r) => r.data),

  delete: (id: string) => axios.delete(`${SUITES_BASE}/${id}`),

  run: (suiteId: string, environmentId?: string) =>
    axios
      .post<SuiteExecutionResult>(
        `${SUITES_BASE}/${suiteId}/run`,
        environmentId ? { environmentId } : {},
      )
      .then((r) => r.data),

  /** Stream suite run via SSE — returns cleanup function to close the connection. */
  streamRun: (
    suiteId: string,
    environmentId: string | undefined,
    onStep: (step: StepExecutionResult) => void,
    onComplete: (result: SuiteExecutionResult) => void,
    onError: (error: string) => void,
    onRunStarted?: (data: { runId: string }) => void,
    onInputRequired?: (data: { runId: string; stepId: string; stepName: string; fields: { name: string; defaultValue: string | null; cachedValue?: string | null }[] }) => void,
  ): (() => void) => {
    const params = new URLSearchParams()
    if (environmentId) params.set('environmentId', environmentId)
    const url = `${SUITES_BASE}/${suiteId}/run/stream?${params.toString()}`

    const eventSource = new EventSource(url)

    eventSource.addEventListener('step', ((e: MessageEvent) => {
      onStep(JSON.parse(e.data) as StepExecutionResult)
    }) as EventListener)

    eventSource.addEventListener('complete', ((e: MessageEvent) => {
      onComplete(JSON.parse(e.data) as SuiteExecutionResult)
      eventSource.close()
    }) as EventListener)

    eventSource.addEventListener('run-error', ((e: MessageEvent) => {
      const data = JSON.parse(e.data)
      onError(data.message || 'Unknown error')
      eventSource.close()
    }) as EventListener)

    eventSource.addEventListener('run-started', ((e: MessageEvent) => {
      onRunStarted?.(JSON.parse(e.data))
    }) as EventListener)

    eventSource.addEventListener('input-required', ((e: MessageEvent) => {
      onInputRequired?.(JSON.parse(e.data))
    }) as EventListener)

    eventSource.onerror = () => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        onError('Connection lost')
        eventSource.close()
      }
    }

    return () => eventSource.close()
  },

  submitManualInput: (suiteId: string, runId: string, values: Record<string, string>) =>
    axios.post(`${SUITES_BASE}/${suiteId}/run/${runId}/inputs`, { values }),

  cancelRun: (suiteId: string, runId: string) =>
    axios.post(`${SUITES_BASE}/${suiteId}/run/${runId}/cancel`),
}

export const testStepApi = {
  list: (suiteId: string) =>
    axios
      .get<TestStep[]>(`${SUITES_BASE}/${suiteId}/steps`)
      .then((r) => r.data),

  get: (suiteId: string, stepId: string) =>
    axios
      .get<TestStep>(`${SUITES_BASE}/${suiteId}/steps/${stepId}`)
      .then((r) => r.data),

  create: (suiteId: string, data: TestStepRequest) =>
    axios
      .post<TestStep>(`${SUITES_BASE}/${suiteId}/steps`, data)
      .then((r) => r.data),

  update: (suiteId: string, stepId: string, data: TestStepRequest) =>
    axios
      .put<TestStep>(`${SUITES_BASE}/${suiteId}/steps/${stepId}`, data)
      .then((r) => r.data),

  delete: (suiteId: string, stepId: string) =>
    axios.delete(`${SUITES_BASE}/${suiteId}/steps/${stepId}`),

  reorder: (suiteId: string, stepIds: string[]) =>
    axios.put(`${SUITES_BASE}/${suiteId}/steps/reorder`, { stepIds }),

  generateCurl: (suiteId: string, stepId: string, environmentId?: string) =>
    axios
      .get<{ curl: string }>(`${SUITES_BASE}/${suiteId}/steps/${stepId}/curl`, {
        params: environmentId ? { environmentId } : {},
      })
      .then((r) => r.data.curl),

  run: (suiteId: string, stepId: string, environmentId?: string) =>
    axios
      .post<SuiteExecutionResult>(
        `${SUITES_BASE}/${suiteId}/steps/${stepId}/run`,
        environmentId ? { environmentId } : {},
      )
      .then((r) => r.data),

  /** Stream single step run via SSE — returns cleanup function. */
  streamRun: (
    suiteId: string,
    stepId: string,
    environmentId: string | undefined,
    onStep: (step: StepExecutionResult) => void,
    onComplete: (result: SuiteExecutionResult) => void,
    onError: (error: string) => void,
    onRunStarted?: (data: { runId: string }) => void,
    onInputRequired?: (data: { runId: string; stepId: string; stepName: string; fields: { name: string; defaultValue: string | null; cachedValue?: string | null }[] }) => void,
  ): (() => void) => {
    const params = new URLSearchParams()
    if (environmentId) params.set('environmentId', environmentId)
    const url = `${SUITES_BASE}/${suiteId}/steps/${stepId}/run/stream?${params.toString()}`

    const eventSource = new EventSource(url)

    eventSource.addEventListener('step', ((e: MessageEvent) => {
      onStep(JSON.parse(e.data) as StepExecutionResult)
    }) as EventListener)

    eventSource.addEventListener('complete', ((e: MessageEvent) => {
      onComplete(JSON.parse(e.data) as SuiteExecutionResult)
      eventSource.close()
    }) as EventListener)

    eventSource.addEventListener('run-error', ((e: MessageEvent) => {
      const data = JSON.parse(e.data)
      onError(data.message || 'Unknown error')
      eventSource.close()
    }) as EventListener)

    eventSource.addEventListener('run-started', ((e: MessageEvent) => {
      onRunStarted?.(JSON.parse(e.data))
    }) as EventListener)

    eventSource.addEventListener('input-required', ((e: MessageEvent) => {
      onInputRequired?.(JSON.parse(e.data))
    }) as EventListener)

    eventSource.onerror = () => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        onError('Connection lost')
        eventSource.close()
      }
    }

    return () => eventSource.close()
  },

  submitManualInput: (suiteId: string, runId: string, values: Record<string, string>) =>
    axios.post(`${SUITES_BASE}/${suiteId}/run/${runId}/inputs`, { values }),

  cancelRun: (suiteId: string, runId: string) =>
    axios.post(`${SUITES_BASE}/${suiteId}/run/${runId}/cancel`),

  importCurl: (suiteId: string, curl: string) =>
    axios
      .post<TestStep>(`${SUITES_BASE}/${suiteId}/steps/import-curl`, { curl })
      .then((r) => r.data),

  importJson: (suiteId: string, json: string) =>
    axios
      .post<TestStep>(`${SUITES_BASE}/${suiteId}/steps/import-json`, { json })
      .then((r) => r.data),
}
