export type HttpMethodType = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
export type ResponseActionType = 'SUCCESS' | 'ERROR' | 'FIRE_SIDE_EFFECT' | 'RETRY'
export type ExtractionSourceType = 'RESPONSE_BODY' | 'RESPONSE_HEADER' | 'STATUS_CODE' | 'REQUEST_BODY' | 'REQUEST_HEADER' | 'QUERY_PARAM' | 'REQUEST_URL'
export type BodyType = 'NONE' | 'JSON' | 'FORM_DATA'

export interface FormDataField {
  key: string
  type: 'text' | 'file'
  value: string
}

export type AssertionOperatorType =
  | 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'NOT_CONTAINS'
  | 'REGEX' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'EXISTS' | 'NOT_EXISTS'

export interface AssertionDto {
  id?: string
  jsonPath: string
  operator: AssertionOperatorType
  expectedValue: string
}

export interface VerificationDto {
  id?: string
  connectorName: string
  query: string
  timeoutSeconds: number
  queryTimeoutSeconds: number
  preListen: boolean
  assertions: AssertionDto[]
}

export type ResponseValidationType = 'HEADER' | 'BODY_EXACT_MATCH' | 'BODY_FIELD' | 'BODY_DATA_TYPE'
export type ExpectedDataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT' | 'NULL'

export interface ResponseValidationDto {
  id?: string
  validationType: ResponseValidationType
  headerName?: string
  jsonPath?: string
  operator?: AssertionOperatorType
  expectedValue?: string
  expectedBody?: string
  matchMode?: 'STRICT' | 'FLEXIBLE' | 'STRUCTURE'
  expectedType?: ExpectedDataType
}

export interface KeyValuePair {
  key: string
  value: string
}

export interface StepDependencyDto {
  id?: string
  dependsOnStepId: string
  dependsOnStepName?: string
  useCache: boolean
  reuseManualInput: boolean
}

export interface StepResponseHandlerDto {
  id?: string
  matchCode: string
  action: ResponseActionType
  sideEffectStepId?: string
  retryCount: number
  retryDelaySeconds: number
  priority: number
}

export interface StepExtractVariableDto {
  id?: string
  variableName: string
  jsonPath: string
  source: ExtractionSourceType
}

export interface TestStep {
  id: string
  suiteId: string
  name: string
  method: HttpMethodType
  url: string
  headers: KeyValuePair[]
  bodyType: BodyType
  body: string
  formDataFields: FormDataField[]
  queryParams: KeyValuePair[]
  cacheable: boolean
  cacheTtlSeconds: number
  dependencyOnly: boolean
  disabledDefaultHeaders: string[]
  groupName: string
  sortOrder: number
  dependencies: StepDependencyDto[]
  responseHandlers: StepResponseHandlerDto[]
  extractVariables: StepExtractVariableDto[]
  verifications: VerificationDto[]
  responseValidations: ResponseValidationDto[]
  createdAt: string
  updatedAt: string
}

export interface TestStepRequest {
  name: string
  method: HttpMethodType
  url: string
  headers: KeyValuePair[]
  bodyType: BodyType
  body: string
  formDataFields: FormDataField[]
  queryParams: KeyValuePair[]
  cacheable: boolean
  cacheTtlSeconds: number
  dependencyOnly: boolean
  disabledDefaultHeaders: string[]
  groupName: string
  dependencies: StepDependencyDto[]
  responseHandlers: StepResponseHandlerDto[]
  extractVariables: StepExtractVariableDto[]
  verifications: VerificationDto[]
  responseValidations: ResponseValidationDto[]
}

export interface TestSuite {
  id: string
  name: string
  description: string
  defaultEnvironmentId: string | null
  stepCount: number
  createdAt: string
  updatedAt: string
}

export interface TestSuiteRequest {
  name: string
  description: string
  defaultEnvironmentId: string | null
}

export interface TestSuiteListParams {
  page?: number
  size?: number
  name?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}
