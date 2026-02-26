import axios from 'axios'
import type { PageResponse } from '../types/environment'
import type { TestRunResponse, RunListParams, DashboardStats } from '../types/run'

const BASE = '/api/runs'

export const runApi = {
  list: (params: RunListParams = {}) =>
    axios.get<PageResponse<TestRunResponse>>(BASE, { params }).then(r => r.data),

  get: (id: string) =>
    axios.get<TestRunResponse>(`${BASE}/${id}`).then(r => r.data),

  delete: (id: string) =>
    axios.delete(`${BASE}/${id}`),

  export: (id: string) =>
    axios.get<TestRunResponse>(`${BASE}/${id}/export`).then(r => r.data),

  stats: () =>
    axios.get<DashboardStats>(`${BASE}/stats`).then(r => r.data),
}
