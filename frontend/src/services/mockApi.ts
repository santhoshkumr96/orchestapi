import axios from 'axios'
import type { PageResponse } from '../types/environment'
import type {
  MockServer,
  MockServerRequest,
  MockEndpoint,
  MockEndpointRequest,
  MockRequestLog,
  MockServerStatus,
} from '../types/mock'

const BASE = '/api/mock-servers'

export interface MockServerListParams {
  page?: number
  size?: number
  name?: string
  description?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export const mockApi = {
  // ── Mock Server CRUD ──────────────────────────────────────────────

  listServers: (params: MockServerListParams = {}) =>
    axios.get<PageResponse<MockServer>>(BASE, { params }).then((r) => r.data),

  getServer: (id: string) =>
    axios.get<MockServer>(`${BASE}/${id}`).then((r) => r.data),

  createServer: (data: MockServerRequest) =>
    axios.post<MockServer>(BASE, data).then((r) => r.data),

  updateServer: (id: string, data: MockServerRequest) =>
    axios.put<MockServer>(`${BASE}/${id}`, data).then((r) => r.data),

  deleteServer: (id: string) =>
    axios.delete(`${BASE}/${id}`),

  toggleStatus: (id: string, enabled: boolean) =>
    axios.put<MockServer>(`${BASE}/${id}/status`, { enabled }).then((r) => r.data),

  // ── Endpoint CRUD ─────────────────────────────────────────────────

  listEndpoints: (serverId: string) =>
    axios.get<MockEndpoint[]>(`${BASE}/${serverId}/endpoints`).then((r) => r.data),

  getEndpoint: (serverId: string, id: string) =>
    axios.get<MockEndpoint>(`${BASE}/${serverId}/endpoints/${id}`).then((r) => r.data),

  createEndpoint: (serverId: string, data: MockEndpointRequest) =>
    axios.post<MockEndpoint>(`${BASE}/${serverId}/endpoints`, data).then((r) => r.data),

  updateEndpoint: (serverId: string, id: string, data: MockEndpointRequest) =>
    axios.put<MockEndpoint>(`${BASE}/${serverId}/endpoints/${id}`, data).then((r) => r.data),

  deleteEndpoint: (serverId: string, id: string) =>
    axios.delete(`${BASE}/${serverId}/endpoints/${id}`),

  reorderEndpoints: (serverId: string, stepIds: string[]) =>
    axios.put<MockEndpoint[]>(`${BASE}/${serverId}/endpoints/reorder`, { stepIds }).then((r) => r.data),

  // ── Status Info ───────────────────────────────────────────────────

  getStatusInfo: (serverId: string) =>
    axios.get<MockServerStatus>(`${BASE}/${serverId}/status`).then((r) => r.data),

  // ── Request Logs ──────────────────────────────────────────────────

  getLogs: (serverId: string, params: { page?: number; size?: number } = {}) =>
    axios
      .get<PageResponse<MockRequestLog>>(`${BASE}/${serverId}/logs`, { params })
      .then((r) => r.data),

  clearLogs: (serverId: string) =>
    axios.delete(`${BASE}/${serverId}/logs`),
}
