export interface Webhook {
  id: string
  name: string
  description?: string
  enabled: boolean
  defaultResponseStatus: number
  defaultResponseBody?: string
  defaultResponseHeaders: { key: string; value: string }[]
  responseRules: WebhookResponseRuleDto[]
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

export type WebhookConditionType = 'HEADER' | 'QUERY_PARAM' | 'BODY_JSON_PATH' | 'REQUEST_PATH'

export interface WebhookRuleConditionDto {
  id?: string
  conditionType: WebhookConditionType
  matchKey: string
  matchValue?: string
}

export interface WebhookResponseRuleDto {
  id?: string
  name: string
  enabled: boolean
  responseStatus: number
  responseBody?: string
  responseHeaders: { key: string; value: string }[]
  conditions: WebhookRuleConditionDto[]
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
  matchedRuleName?: string
  createdAt: string
}
