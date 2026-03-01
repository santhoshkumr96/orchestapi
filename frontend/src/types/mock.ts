export interface MockServer {
  id: string
  name: string
  description?: string
  enabled: boolean
  endpointCount: number
  createdAt: string
  updatedAt: string
}

export interface MockServerRequest {
  name: string
  description?: string
}

export type MockMatchRuleType = 'HEADER' | 'QUERY_PARAM' | 'BODY_JSON_PATH'

export interface MockMatchRuleDto {
  id?: string
  ruleType: MockMatchRuleType
  matchKey: string
  matchValue?: string
}

export interface MockEndpoint {
  id: string
  name: string
  description?: string
  httpMethod: string
  pathPattern: string
  responseStatus: number
  responseBody?: string
  responseHeaders: { key: string; value: string }[]
  delayMs: number
  enabled: boolean
  sortOrder: number
  matchRules: MockMatchRuleDto[]
  createdAt: string
  updatedAt: string
}

export interface MockEndpointRequest {
  name: string
  description?: string
  httpMethod: string
  pathPattern: string
  responseStatus: number
  responseBody?: string
  responseHeaders: { key: string; value: string }[]
  delayMs: number
  enabled: boolean
  matchRules: MockMatchRuleDto[]
}

export interface MockRequestLog {
  id: string
  mockServerId: string
  matchedEndpointId?: string
  httpMethod: string
  requestPath: string
  requestHeaders: string
  requestBody?: string
  queryParams: string
  responseStatus: number
  responseBody?: string
  matched: boolean
  durationMs: number
  createdAt: string
}

export interface MockServerStatus {
  enabled: boolean
  mockUrl: string
  endpointCount: number
  enabledEndpointCount: number
}
