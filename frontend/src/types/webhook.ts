export interface Webhook {
  id: string
  name: string
  description?: string
  enabled: boolean
  defaultResponseStatus: number
  defaultResponseBody?: string
  defaultResponseHeaders: { key: string; value: string }[]
  requestCount: number
  createdAt: string
  updatedAt: string
}

export interface WebhookRequest {
  name: string
  description?: string
  defaultResponseStatus: number
  defaultResponseBody?: string
  defaultResponseHeaders: { key: string; value: string }[]
}

export interface WebhookRequestLog {
  id: string
  webhookId: string
  httpMethod: string
  requestPath: string
  requestHeaders: string
  requestBody?: string
  queryParams: string
  contentType?: string
  contentLength?: number
  sourceIp?: string
  multipart: boolean
  files?: string
  responseStatus: number
  responseBody?: string
  createdAt: string
}
