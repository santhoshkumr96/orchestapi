import { SuiteExecutionResult } from './testSuite'

export interface TestRunResponse {
  id: string
  suiteId: string
  suiteName: string
  environmentId: string
  environmentName: string
  triggerType: 'MANUAL' | 'SCHEDULED'
  scheduleId: string | null
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILURE' | 'CANCELLED'
  startedAt: string
  completedAt: string | null
  totalDurationMs: number
  resultData: SuiteExecutionResult | null
  createdAt: string
}

export interface RunScheduleResponse {
  id: string
  suiteId: string
  suiteName: string
  environmentId: string
  environmentName: string
  cronExpression: string
  active: boolean
  description: string | null
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RunScheduleRequest {
  suiteId: string
  environmentId: string
  cronExpression: string
  description?: string
}

export interface CronPreviewResponse {
  valid: boolean
  error: string | null
  nextFireTimes: string[]
}

export interface RunListParams {
  page?: number
  size?: number
  suiteName?: string
  status?: string
  environmentId?: string
  triggerType?: string
  from?: string
  to?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface ScheduleListParams {
  page?: number
  size?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface DashboardStats {
  totalRuns: number
  successCount: number
  failureCount: number
  partialFailureCount: number
  cancelledCount: number
  runningCount: number
  activeSchedules: number
  totalSuites: number
  totalEnvironments: number
}
