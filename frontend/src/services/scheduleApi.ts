import axios from 'axios'
import type { PageResponse } from '../types/environment'
import type {
  RunScheduleResponse,
  RunScheduleRequest,
  CronPreviewResponse,
  ScheduleListParams,
} from '../types/run'

const BASE = '/api/run-schedules'

export const scheduleApi = {
  list: (params: ScheduleListParams = {}) =>
    axios.get<PageResponse<RunScheduleResponse>>(BASE, { params }).then(r => r.data),

  get: (id: string) =>
    axios.get<RunScheduleResponse>(`${BASE}/${id}`).then(r => r.data),

  getBySuite: (suiteId: string) =>
    axios.get<RunScheduleResponse[]>(`${BASE}/by-suite/${suiteId}`).then(r => r.data),

  create: (data: RunScheduleRequest) =>
    axios.post<RunScheduleResponse>(BASE, data).then(r => r.data),

  update: (id: string, data: RunScheduleRequest) =>
    axios.put<RunScheduleResponse>(`${BASE}/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    axios.delete(`${BASE}/${id}`),

  toggle: (id: string) =>
    axios.patch<RunScheduleResponse>(`${BASE}/${id}/toggle`).then(r => r.data),

  preview: (cron: string) =>
    axios.get<CronPreviewResponse>(`${BASE}/preview`, { params: { cron } }).then(r => r.data),
}
