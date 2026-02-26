import axios from 'axios'
import type { ConnectorType, Environment, EnvironmentFileResponse, EnvironmentRequest, PageResponse } from '../types/environment'

const BASE = '/api/environments'

export interface EnvironmentListParams {
  page?: number
  size?: number
  name?: string
  baseUrl?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export const environmentApi = {
  list: (params: EnvironmentListParams = {}) =>
    axios
      .get<PageResponse<Environment>>(BASE, { params })
      .then((r) => r.data),

  get: (id: string) => axios.get<Environment>(`${BASE}/${id}`).then((r) => r.data),

  create: (data: EnvironmentRequest) =>
    axios.post<Environment>(BASE, data).then((r) => r.data),

  update: (id: string, data: EnvironmentRequest) =>
    axios.put<Environment>(`${BASE}/${id}`, data).then((r) => r.data),

  delete: (id: string) => axios.delete(`${BASE}/${id}`),

  testConnector: (data: {
    type: ConnectorType
    config: Record<string, string>
    environmentId?: string
    connectorName?: string
  }) =>
    axios
      .post<{ success: boolean; message: string; durationMs: number }>(`${BASE}/test-connector`, data)
      .then((r) => r.data),

  // ── File management ─────────────────────────────────────────────

  listFiles: (envId: string) =>
    axios.get<EnvironmentFileResponse[]>(`${BASE}/${envId}/files`).then((r) => r.data),

  uploadFile: (envId: string, fileKey: string, file: File) => {
    const formData = new FormData()
    formData.append('fileKey', fileKey)
    formData.append('file', file)
    return axios
      .post<EnvironmentFileResponse>(`${BASE}/${envId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  downloadFile: (envId: string, fileId: string) =>
    axios
      .get<Blob>(`${BASE}/${envId}/files/${fileId}/download`, { responseType: 'blob' })
      .then((r) => r.data),

  deleteFile: (envId: string, fileId: string) =>
    axios.delete(`${BASE}/${envId}/files/${fileId}`),
}
