import axios from 'axios'
import type { PageResponse } from '../types/environment'
import type { Webhook, WebhookRequest, WebhookRequestLog, WebhookResponseRuleDto } from '../types/webhook'

const BASE = '/api/webhooks'
const _basePath = import.meta.env.BASE_URL.replace(/\/$/, '')

export interface WebhookListParams {
  page?: number
  size?: number
  name?: string
  description?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export const webhookApi = {
  // ── CRUD ────────────────────────────────────────────────────────────

  list: (params: WebhookListParams = {}) =>
    axios.get<PageResponse<Webhook>>(BASE, { params }).then((r) => r.data),

  get: (id: string) =>
    axios.get<Webhook>(`${BASE}/${id}`).then((r) => r.data),

  create: (data: WebhookRequest) =>
    axios.post<Webhook>(BASE, data).then((r) => r.data),

  update: (id: string, data: WebhookRequest) =>
    axios.put<Webhook>(`${BASE}/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    axios.delete(`${BASE}/${id}`),

  toggleStatus: (id: string, enabled: boolean) =>
    axios.put<Webhook>(`${BASE}/${id}/status`, { enabled }).then((r) => r.data),

  // ── Response Rules ─────────────────────────────────────────────────

  updateResponseRules: (id: string, rules: WebhookResponseRuleDto[]) =>
    axios.put<Webhook>(`${BASE}/${id}/response-rules`, rules).then((r) => r.data),

  // ── URL ─────────────────────────────────────────────────────────────

  getUrl: (id: string) =>
    axios.get<{ url: string }>(`${BASE}/${id}/url`).then((r) => r.data),

  // ── Request Logs ────────────────────────────────────────────────────

  getRequests: (id: string, params: { page?: number; size?: number } = {}) =>
    axios
      .get<PageResponse<WebhookRequestLog>>(`${BASE}/${id}/requests`, { params })
      .then((r) => r.data),

  clearRequests: (id: string) =>
    axios.delete(`${BASE}/${id}/requests`),

  // ── SSE Stream ──────────────────────────────────────────────────────

  streamRequests: (
    id: string,
    onRequest: (log: WebhookRequestLog) => void,
    onError?: (msg: string) => void,
  ): (() => void) => {
    const url = `${_basePath}${BASE}/${id}/requests/stream`
    const eventSource = new EventSource(url)

    eventSource.addEventListener('request', ((e: MessageEvent) => {
      try {
        const log = JSON.parse(e.data) as WebhookRequestLog
        onRequest(log)
      } catch {
        // ignore parse errors
      }
    }) as EventListener)

    eventSource.addEventListener('connected', (() => {
      // Connection established
    }) as EventListener)

    eventSource.onerror = () => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        onError?.('Connection lost')
        eventSource.close()
      }
    }

    return () => eventSource.close()
  },
}
