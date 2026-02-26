import { useRef, useState } from 'react'
import {
  Collapse,
  Input,
  Select,
  Button,
  Switch,
  InputNumber,
  Table,
  Popconfirm,
  Space,
  Checkbox,
  message,
} from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type {
  TestStep,
  TestStepRequest,
  HttpMethodType,
  BodyType,
  FormDataField,
  KeyValuePair,
  StepDependencyDto,
  StepResponseHandlerDto,
  StepExtractVariableDto,
  ResponseActionType,
  ExtractionSourceType,
  AssertionOperatorType,
  AssertionDto,
  VerificationDto,
} from '../types/testSuite'
import type { ConnectorType } from '../types/environment'
import { testStepApi } from '../services/testSuiteApi'
import PlaceholderInput from './PlaceholderInput'
import type { DepStepInfo } from './PlaceholderInput'

// ---- Types ----

interface StepEditorProps {
  step: TestStep | null // null = new step
  suiteId: string
  allSteps: TestStep[] // for dependency picker (exclude self)
  envVarNames: string[] // environment variable names for autocomplete
  connectorNames?: { name: string; type: ConnectorType }[] // available connectors from environment
  fileKeys?: string[] // environment file keys for ${FILE:key} autocomplete
  onSave: () => void // called after successful save to refresh parent
  onCancel: () => void // collapse/cancel
}

type KVRow = KeyValuePair & { _clientId: string }
type DependencyRow = StepDependencyDto & { _clientId: string }
type HandlerRow = StepResponseHandlerDto & { _clientId: string }
type ExtractRow = StepExtractVariableDto & { _clientId: string }
type FormDataRow = FormDataField & { _clientId: string }
type AssertionRow = AssertionDto & { _clientId: string }
type VerificationRow = Omit<VerificationDto, 'assertions'> & { _clientId: string; assertions: AssertionRow[] }

// Kafka query helpers: separate topic/key fields stored as newline-separated query
function parseKafkaQuery(query: string): { topic: string; key: string } {
  let topic = '', key = ''
  const sep = query.includes('\n') ? '\n' : /\s+/
  for (const part of query.trim().split(sep)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim()
      const v = trimmed.slice(eqIdx + 1).trim()
      if (k === 'topic') topic = v
      else if (k === 'key') key = v
    }
  }
  return { topic, key }
}

function buildKafkaQuery(topic: string, key: string): string {
  let q = `topic=${topic}`
  if (key.trim()) q += `\nkey=${key}`
  return q
}

const METHOD_OPTIONS: { label: string; value: HttpMethodType; color: string }[] = [
  { label: 'GET', value: 'GET', color: '#52c41a' },
  { label: 'POST', value: 'POST', color: '#1677ff' },
  { label: 'PUT', value: 'PUT', color: '#fa8c16' },
  { label: 'DELETE', value: 'DELETE', color: '#ff4d4f' },
  { label: 'PATCH', value: 'PATCH', color: '#722ed1' },
]

const ACTION_OPTIONS: { label: string; value: ResponseActionType }[] = [
  { label: 'SUCCESS', value: 'SUCCESS' },
  { label: 'ERROR', value: 'ERROR' },
  { label: 'FIRE_SIDE_EFFECT', value: 'FIRE_SIDE_EFFECT' },
  { label: 'RETRY', value: 'RETRY' },
]

const SOURCE_OPTIONS: { label: string; value: ExtractionSourceType }[] = [
  { label: 'Response Body', value: 'RESPONSE_BODY' },
  { label: 'Response Header', value: 'RESPONSE_HEADER' },
  { label: 'Status Code', value: 'STATUS_CODE' },
  { label: 'Request Body', value: 'REQUEST_BODY' },
  { label: 'Request Header', value: 'REQUEST_HEADER' },
  { label: 'Query Param', value: 'QUERY_PARAM' },
  { label: 'Request URL', value: 'REQUEST_URL' },
]

const ASSERTION_OPERATOR_OPTIONS: { label: string; value: AssertionOperatorType }[] = [
  { label: 'Equals', value: 'EQUALS' },
  { label: 'Not Equals', value: 'NOT_EQUALS' },
  { label: 'Contains', value: 'CONTAINS' },
  { label: 'Not Contains', value: 'NOT_CONTAINS' },
  { label: 'Regex', value: 'REGEX' },
  { label: 'Greater Than', value: 'GT' },
  { label: 'Less Than', value: 'LT' },
  { label: 'Greater or Equal', value: 'GTE' },
  { label: 'Less or Equal', value: 'LTE' },
  { label: 'Exists', value: 'EXISTS' },
  { label: 'Not Exists', value: 'NOT_EXISTS' },
]

// ---- Component ----

export default function StepEditor({ step, suiteId, allSteps, envVarNames, connectorNames = [], fileKeys = [], onSave, onCancel }: StepEditorProps) {
  const clientIdCounter = useRef(1)
  const genClientId = () => `_new_${clientIdCounter.current++}`

  const isNew = step === null

  // ---- Basic Info state ----
  const [name, setName] = useState(step?.name ?? '')
  const [method, setMethod] = useState<HttpMethodType>(step?.method ?? 'GET')
  const [url, setUrl] = useState(step?.url ?? '')

  // ---- Headers state ----
  const [headers, setHeaders] = useState<KVRow[]>(
    () => step?.headers.map((h) => ({ ...h, _clientId: genClientId() })) ?? [],
  )

  // ---- Query Params state ----
  const [queryParams, setQueryParams] = useState<KVRow[]>(
    () => step?.queryParams.map((p) => ({ ...p, _clientId: genClientId() })) ?? [],
  )

  // ---- Body state ----
  const [bodyType, setBodyType] = useState<BodyType>(step?.bodyType ?? 'NONE')
  const [body, setBody] = useState(step?.body ?? '')
  const [formDataFields, setFormDataFields] = useState<FormDataRow[]>(
    () => (step?.formDataFields ?? []).map((f) => ({ ...f, _clientId: genClientId() })),
  )
  const [jsonError, setJsonError] = useState<string | null>(null)

  // ---- Dependencies state ----
  const [dependencies, setDependencies] = useState<DependencyRow[]>(
    () =>
      step?.dependencies.map((d) => ({ ...d, _clientId: genClientId() })) ?? [],
  )

  // ---- Response Handlers state ----
  const [responseHandlers, setResponseHandlers] = useState<HandlerRow[]>(
    () =>
      step?.responseHandlers.map((h) => ({ ...h, _clientId: genClientId() })) ?? [],
  )

  // ---- Extract Variables state ----
  const [extractVariables, setExtractVariables] = useState<ExtractRow[]>(
    () =>
      step?.extractVariables.map((v) => ({ ...v, _clientId: genClientId() })) ?? [],
  )

  // ---- Verifications state ----
  const [verifications, setVerifications] = useState<VerificationRow[]>(
    () =>
      (step?.verifications ?? []).map((v) => ({
        ...v,
        _clientId: genClientId(),
        assertions: (v.assertions ?? []).map((a) => ({ ...a, _clientId: genClientId() })),
      })),
  )

  // ---- Dependency Only state ----
  const [dependencyOnly, setDependencyOnly] = useState(step?.dependencyOnly ?? false)

  // ---- Cache Settings state ----
  const [cacheable, setCacheable] = useState(step?.cacheable ?? false)
  const [cacheTtlSeconds, setCacheTtlSeconds] = useState(step?.cacheTtlSeconds ?? 0)

  const [saving, setSaving] = useState(false)

  // Steps available for dependency / side-effect picker (exclude self)
  const otherSteps = allSteps.filter((s) => s.id !== step?.id)

  // Resolve transitive dependency chain for autocomplete (only dependent steps)
  const depStepInfos: DepStepInfo[] = (() => {
    const stepMap = new Map(allSteps.map((s) => [s.id, s]))
    const visited = new Set<string>()
    const result: DepStepInfo[] = []

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return
      visited.add(stepId)
      const s = stepMap.get(stepId)
      if (!s) return
      for (const dep of s.dependencies) {
        visit(dep.dependsOnStepId)
      }
      // Only add the dependency steps, not self
      if (stepId !== step?.id) {
        result.push({
          name: s.name,
          variables: s.extractVariables.map((v) => v.variableName),
        })
      }
    }

    // Also walk dependencies from current editor state (for new/changed deps)
    for (const dep of dependencies) {
      if (dep.dependsOnStepId) visit(dep.dependsOnStepId)
    }

    return result
  })()

  // For verification fields: include current step's own variables (available after extraction, before verification runs)
  const verificationDepStepInfos: DepStepInfo[] = (() => {
    const selfVars = extractVariables.map((v) => v.variableName).filter(Boolean)
    if (selfVars.length === 0 || !name.trim()) return depStepInfos
    const selfInfo: DepStepInfo = { name: name.trim(), variables: selfVars }
    // Avoid duplicate if somehow already present
    if (depStepInfos.some((d) => d.name === name.trim())) return depStepInfos
    return [...depStepInfos, selfInfo]
  })()

  // ====================
  // Headers helpers
  // ====================
  const addHeader = () => {
    setHeaders([...headers, { _clientId: genClientId(), key: '', value: '' }])
  }
  const updateHeader = (index: number, field: keyof KeyValuePair, value: string) => {
    const updated = [...headers]
    updated[index] = { ...updated[index], [field]: value }
    setHeaders(updated)
  }
  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index))
  }

  // ====================
  // Query Params helpers
  // ====================
  const addQueryParam = () => {
    setQueryParams([...queryParams, { _clientId: genClientId(), key: '', value: '' }])
  }
  const updateQueryParam = (index: number, field: keyof KeyValuePair, value: string) => {
    const updated = [...queryParams]
    updated[index] = { ...updated[index], [field]: value }
    setQueryParams(updated)
  }
  const removeQueryParam = (index: number) => {
    setQueryParams(queryParams.filter((_, i) => i !== index))
  }

  // ====================
  // Dependencies helpers
  // ====================
  const addDependency = () => {
    setDependencies([
      ...dependencies,
      { _clientId: genClientId(), dependsOnStepId: '', useCache: true, reuseManualInput: true },
    ])
  }
  const updateDependency = (
    index: number,
    field: keyof StepDependencyDto,
    value: string | boolean,
  ) => {
    const updated = [...dependencies]
    updated[index] = { ...updated[index], [field]: value }
    setDependencies(updated)
  }
  const removeDependency = (index: number) => {
    setDependencies(dependencies.filter((_, i) => i !== index))
  }

  // ====================
  // Response Handlers helpers
  // ====================
  const addHandler = () => {
    setResponseHandlers([
      ...responseHandlers,
      {
        _clientId: genClientId(),
        matchCode: '',
        action: 'SUCCESS',
        retryCount: 0,
        retryDelaySeconds: 0,
        priority: 0,
      },
    ])
  }
  const updateHandler = (
    index: number,
    field: keyof StepResponseHandlerDto,
    value: string | number | undefined,
  ) => {
    const updated = [...responseHandlers]
    updated[index] = { ...updated[index], [field]: value } as HandlerRow
    setResponseHandlers(updated)
  }
  const removeHandler = (index: number) => {
    setResponseHandlers(responseHandlers.filter((_, i) => i !== index))
  }

  // ====================
  // Extract Variables helpers
  // ====================
  const addExtractVariable = () => {
    setExtractVariables([
      ...extractVariables,
      {
        _clientId: genClientId(),
        variableName: '',
        jsonPath: '',
        source: 'RESPONSE_BODY',
      },
    ])
  }
  const updateExtractVariable = (
    index: number,
    field: keyof StepExtractVariableDto,
    value: string,
  ) => {
    const updated = [...extractVariables]
    updated[index] = { ...updated[index], [field]: value }
    setExtractVariables(updated)
  }
  const removeExtractVariable = (index: number) => {
    setExtractVariables(extractVariables.filter((_, i) => i !== index))
  }

  // ====================
  // Verifications helpers
  // ====================
  const addVerification = () => {
    setVerifications([
      ...verifications,
      {
        _clientId: genClientId(),
        connectorName: '',
        query: '',
        timeoutSeconds: 0,
        queryTimeoutSeconds: 30,
        preListen: false,
        assertions: [],
      },
    ])
  }

  const updateVerification = (index: number, field: string, value: unknown) => {
    const updated = [...verifications]
    updated[index] = { ...updated[index], [field]: value }
    setVerifications(updated)
  }

  const removeVerification = (index: number) => {
    setVerifications(verifications.filter((_, i) => i !== index))
  }

  const addAssertion = (verificationIndex: number) => {
    const updated = [...verifications]
    updated[verificationIndex] = {
      ...updated[verificationIndex],
      assertions: [
        ...updated[verificationIndex].assertions,
        { _clientId: genClientId(), jsonPath: '', operator: 'EQUALS' as AssertionOperatorType, expectedValue: '' },
      ],
    }
    setVerifications(updated)
  }

  const updateAssertion = (vIndex: number, aIndex: number, field: string, value: string) => {
    const updated = [...verifications]
    const assertions = [...updated[vIndex].assertions]
    assertions[aIndex] = { ...assertions[aIndex], [field]: value }
    updated[vIndex] = { ...updated[vIndex], assertions }
    setVerifications(updated)
  }

  const removeAssertion = (vIndex: number, aIndex: number) => {
    const updated = [...verifications]
    updated[vIndex] = {
      ...updated[vIndex],
      assertions: updated[vIndex].assertions.filter((_, i) => i !== aIndex),
    }
    setVerifications(updated)
  }

  // ====================
  // Form Data helpers
  // ====================
  const addFormDataField = () => {
    setFormDataFields([...formDataFields, { _clientId: genClientId(), key: '', type: 'text', value: '' }])
  }
  const updateFormDataField = (index: number, field: keyof FormDataField, value: string) => {
    const updated = [...formDataFields]
    updated[index] = { ...updated[index], [field]: value }
    // Auto-switch type to 'file' when a ${FILE:...} value is entered
    if (field === 'value' && /^\$\{FILE:.+\}$/.test(value.trim())) {
      updated[index] = { ...updated[index], type: 'file' }
    }
    setFormDataFields(updated)
  }
  const removeFormDataField = (index: number) => {
    setFormDataFields(formDataFields.filter((_, i) => i !== index))
  }

  // JSON body validation
  const handleBodyChange = (val: string) => {
    setBody(val)
    if (bodyType === 'JSON' && val.trim()) {
      try {
        JSON.parse(val)
        setJsonError(null)
      } catch (e) {
        setJsonError((e as Error).message)
      }
    } else {
      setJsonError(null)
    }
  }

  // ====================
  // Save
  // ====================
  const handleSave = async () => {
    if (!name.trim()) {
      message.error('Step name is required')
      return
    }
    if (!url.trim()) {
      message.error('URL is required')
      return
    }

    if (bodyType === 'JSON' && body.trim() && jsonError) {
      message.error('Fix JSON syntax errors before saving')
      return
    }

    const request: TestStepRequest = {
      name: name.trim(),
      method,
      url: url.trim(),
      headers: headers.map(({ _clientId: _, ...rest }) => rest),
      bodyType,
      body: bodyType === 'JSON' ? body : bodyType === 'NONE' ? '' : body,
      formDataFields: bodyType === 'FORM_DATA' ? formDataFields.map(({ _clientId: _, ...rest }) => rest) : [],
      queryParams: queryParams.map(({ _clientId: _, ...rest }) => rest),
      cacheable,
      cacheTtlSeconds: cacheable ? cacheTtlSeconds : 0,
      dependencyOnly,
      dependencies: dependencies.map(({ _clientId: _, ...rest }) => rest),
      responseHandlers: responseHandlers.map(({ _clientId: _, ...rest }) => rest),
      extractVariables: extractVariables.map(({ _clientId: _, ...rest }) => rest),
      verifications: verifications.map(({ _clientId: _, assertions, ...rest }) => ({
        ...rest,
        assertions: assertions.map(({ _clientId: __, ...aRest }) => aRest),
      })),
    }

    try {
      setSaving(true)
      if (isNew) {
        await testStepApi.create(suiteId, request)
        message.success('Step created')
      } else {
        await testStepApi.update(suiteId, step.id, request)
        message.success('Step updated')
      }
      onSave()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } }
        message.error(axiosErr.response?.data?.error ?? 'Failed to save step')
      } else {
        message.error('Failed to save step')
      }
    } finally {
      setSaving(false)
    }
  }

  // ====================
  // Column definitions
  // ====================

  const kvColumns = (
    updateFn: (index: number, field: keyof KeyValuePair, value: string) => void,
    removeFn: (index: number) => void,
  ) => [
    {
      title: 'Key',
      dataIndex: 'key',
      width: '40%',
      render: (_: string, record: KVRow, index: number) => (
        <Input
          placeholder="Key"
          value={record.key}
          onChange={(e) => updateFn(index, 'key', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: 'Value',
      dataIndex: 'value',
      width: '45%',
      render: (_: string, record: KVRow, index: number) => (
        <PlaceholderInput
          placeholder="Value"
          value={record.value}
          onChange={(val) => updateFn(index, 'value', val)}
          envVars={envVarNames}
          depSteps={depStepInfos}
          size="small"
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: '8%',
      render: (_: unknown, _record: KVRow, index: number) => (
        <Popconfirm title="Remove?" onConfirm={() => removeFn(index)} okType="danger">
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ]

  const dependencyColumns = [
    {
      title: 'Depends On',
      dataIndex: 'dependsOnStepId',
      width: '40%',
      render: (_: string, record: DependencyRow, index: number) => (
        <Select
          showSearch
          value={record.dependsOnStepId || undefined}
          onChange={(val) => updateDependency(index, 'dependsOnStepId', val)}
          placeholder="Select step"
          size="small"
          style={{ width: '100%' }}
          options={otherSteps.map((s) => ({ label: s.name, value: s.id }))}
          filterOption={(input, option) =>
            (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
          }
        />
      ),
    },
    {
      title: 'Use Cache',
      dataIndex: 'useCache',
      width: '12%',
      render: (_: boolean, record: DependencyRow, index: number) => (
        <Switch
          size="small"
          checked={record.useCache}
          onChange={(checked) => updateDependency(index, 'useCache', checked)}
        />
      ),
    },
    {
      title: 'Reuse Input',
      dataIndex: 'reuseManualInput',
      width: '12%',
      render: (_: boolean, record: DependencyRow, index: number) => (
        <Switch
          size="small"
          checked={record.reuseManualInput ?? true}
          onChange={(checked) => updateDependency(index, 'reuseManualInput', checked)}
        />
      ),
    },
    {
      title: 'TTL',
      key: 'ttl',
      width: '18%',
      render: (_: unknown, record: DependencyRow) => {
        if (!record.useCache) return null
        const producer = allSteps.find((s) => s.id === record.dependsOnStepId)
        if (!producer) return <span style={{ color: '#999' }}>-</span>
        if (!producer.cacheable)
          return <span style={{ color: '#999' }}>Not cacheable</span>
        if (producer.cacheTtlSeconds === 0)
          return <span>Entire run</span>
        return <span>{producer.cacheTtlSeconds}s</span>
      },
    },
    {
      title: '',
      key: 'actions',
      width: '8%',
      render: (_: unknown, _record: DependencyRow, index: number) => (
        <Popconfirm title="Remove?" onConfirm={() => removeDependency(index)} okType="danger">
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ]

  const handlerColumns = [
    {
      title: 'Match Code',
      dataIndex: 'matchCode',
      width: '15%',
      render: (_: string, record: HandlerRow, index: number) => (
        <Input
          placeholder="200, 2xx, 404, 5xx"
          value={record.matchCode}
          onChange={(e) => updateHandler(index, 'matchCode', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: '18%',
      render: (_: string, record: HandlerRow, index: number) => (
        <Select
          value={record.action}
          onChange={(val) => updateHandler(index, 'action', val)}
          options={ACTION_OPTIONS}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Side Effect Step',
      key: 'sideEffectStepId',
      width: '18%',
      render: (_: unknown, record: HandlerRow, index: number) => {
        if (record.action !== 'FIRE_SIDE_EFFECT') return null
        return (
          <Select
            showSearch
            value={record.sideEffectStepId || undefined}
            onChange={(val) => updateHandler(index, 'sideEffectStepId', val)}
            placeholder="Select step"
            size="small"
            style={{ width: '100%' }}
            options={otherSteps.map((s) => ({ label: s.name, value: s.id }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      },
    },
    {
      title: 'Retry Count',
      key: 'retryCount',
      width: '12%',
      render: (_: unknown, record: HandlerRow, index: number) => {
        if (record.action !== 'RETRY') return null
        return (
          <InputNumber
            value={record.retryCount}
            onChange={(val) => updateHandler(index, 'retryCount', val ?? 0)}
            size="small"
            style={{ width: '100%' }}
            min={0}
          />
        )
      },
    },
    {
      title: 'Retry Delay (s)',
      key: 'retryDelaySeconds',
      width: '12%',
      render: (_: unknown, record: HandlerRow, index: number) => {
        if (record.action !== 'RETRY') return null
        return (
          <InputNumber
            value={record.retryDelaySeconds}
            onChange={(val) => updateHandler(index, 'retryDelaySeconds', val ?? 0)}
            size="small"
            style={{ width: '100%' }}
            min={0}
          />
        )
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: '10%',
      render: (_: number, record: HandlerRow, index: number) => (
        <InputNumber
          value={record.priority}
          onChange={(val) => updateHandler(index, 'priority', val ?? 0)}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: '6%',
      render: (_: unknown, _record: HandlerRow, index: number) => (
        <Popconfirm title="Remove?" onConfirm={() => removeHandler(index)} okType="danger">
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ]

  const extractColumns = [
    {
      title: 'Variable Name',
      dataIndex: 'variableName',
      width: '30%',
      render: (_: string, record: ExtractRow, index: number) => (
        <Input
          placeholder="e.g. authToken"
          value={record.variableName}
          onChange={(e) => updateExtractVariable(index, 'variableName', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: 'JSON Path / Key',
      dataIndex: 'jsonPath',
      width: '30%',
      render: (_: string, record: ExtractRow, index: number) => {
        const ph = record.source === 'RESPONSE_HEADER' || record.source === 'REQUEST_HEADER'
          ? 'Header name, e.g. Authorization'
          : record.source === 'QUERY_PARAM'
            ? 'Param name, e.g. page'
            : record.source === 'STATUS_CODE' || record.source === 'REQUEST_URL'
              ? '(not used)'
              : 'e.g. $.data.accessToken'
        return (
          <Input
            placeholder={ph}
            value={record.jsonPath}
            onChange={(e) => updateExtractVariable(index, 'jsonPath', e.target.value)}
            size="small"
            disabled={record.source === 'STATUS_CODE' || record.source === 'REQUEST_URL'}
          />
        )
      },
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: '25%',
      render: (_: string, record: ExtractRow, index: number) => (
        <Select
          value={record.source}
          onChange={(val) => updateExtractVariable(index, 'source', val)}
          options={SOURCE_OPTIONS}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: '8%',
      render: (_: unknown, _record: ExtractRow, index: number) => (
        <Popconfirm title="Remove?" onConfirm={() => removeExtractVariable(index)} okType="danger">
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ]

  // ====================
  // Default active keys
  // ====================
  const defaultActiveKeys = isNew
    ? ['basic', 'headers', 'queryParams', 'body', 'dependencies', 'responseHandlers', 'extractVariables', 'cacheSettings', 'verifications']
    : ['basic']

  // ====================
  // Render
  // ====================
  return (
    <div>
      <Collapse
        defaultActiveKey={defaultActiveKeys}
        style={{ background: 'transparent' }}
        items={[
          {
            key: 'basic',
            label: 'Basic Info',
            children: (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Input
                    placeholder="Step name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    size="small"
                    style={{ flex: 1 }}
                  />
                  <Select
                    showSearch
                    value={method}
                    onChange={(val) => setMethod(val)}
                    size="small"
                    style={{ width: 120 }}
                    filterOption={(input, option) =>
                      (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                    }
                    options={METHOD_OPTIONS.map((opt) => ({
                      label: (
                        <span style={{ color: opt.color, fontWeight: 600 }}>{opt.label}</span>
                      ),
                      value: opt.value,
                    }))}
                  />
                  <div style={{ flex: 2 }}>
                    <PlaceholderInput
                      placeholder="e.g. /api/users/${userId} or /posts/{{step.id}}"
                      value={url}
                      onChange={setUrl}
                      envVars={envVarNames}
                      depSteps={depStepInfos}
                      size="small"
                    />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Space>
                    <Switch size="small" checked={dependencyOnly} onChange={setDependencyOnly} />
                    <span style={{ color: '#595959', fontSize: 12 }}>Dependency only (skip during suite runs)</span>
                  </Space>
                </div>
              </>
            ),
          },
          {
            key: 'headers',
            label: 'Headers',
            extra: (
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  addHeader()
                }}
              >
                Add Header
              </Button>
            ),
            children: (
              <Table
                columns={kvColumns(updateHeader, removeHeader)}
                dataSource={headers}
                rowKey="_clientId"
                pagination={false}
                size="small"
                locale={{ emptyText: 'No headers. Click "Add Header" to create one.' }}
              />
            ),
          },
          {
            key: 'queryParams',
            label: 'Query Params',
            extra: (
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  addQueryParam()
                }}
              >
                Add Param
              </Button>
            ),
            children: (
              <Table
                columns={kvColumns(updateQueryParam, removeQueryParam)}
                dataSource={queryParams}
                rowKey="_clientId"
                pagination={false}
                size="small"
                locale={{ emptyText: 'No query params. Click "Add Param" to create one.' }}
              />
            ),
          },
          {
            key: 'body',
            label: (
              <span>
                Body
                <Select
                  size="small"
                  value={bodyType}
                  onChange={(val) => { setBodyType(val); setJsonError(null) }}
                  options={[
                    { label: 'None', value: 'NONE' },
                    { label: 'JSON', value: 'JSON' },
                    { label: 'Form Data', value: 'FORM_DATA' },
                  ]}
                  style={{ width: 120, marginLeft: 8 }}
                  onClick={(e) => e.stopPropagation()}
                />
              </span>
            ),
            extra: bodyType === 'FORM_DATA' ? (
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => { e.stopPropagation(); addFormDataField() }}
              >
                Add Field
              </Button>
            ) : undefined,
            children: bodyType === 'NONE' ? (
              <div style={{ color: '#999', fontSize: 12, padding: '8px 0' }}>No request body. Select JSON or Form Data above.</div>
            ) : bodyType === 'JSON' ? (
              <div>
                <PlaceholderInput
                  mode="textarea"
                  rows={8}
                  value={body}
                  onChange={handleBodyChange}
                  envVars={envVarNames}
                  depSteps={depStepInfos}
                  placeholder='Request body (JSON). Supports: ${VAR} and {{stepName.path}}'
                />
                {jsonError && (
                  <div style={{ color: '#ff4d4f', fontSize: 11, marginTop: 4 }}>JSON Error: {jsonError}</div>
                )}
              </div>
            ) : (
              <Table
                columns={[
                  {
                    title: 'Key',
                    dataIndex: 'key',
                    width: '25%',
                    render: (_: unknown, __: unknown, index: number) => (
                      <Input
                        size="small"
                        value={formDataFields[index].key}
                        onChange={(e) => updateFormDataField(index, 'key', e.target.value)}
                        placeholder="Field name"
                      />
                    ),
                  },
                  {
                    title: 'Type',
                    dataIndex: 'type',
                    width: 100,
                    render: (_: unknown, __: unknown, index: number) => (
                      <Select
                        size="small"
                        value={formDataFields[index].type}
                        onChange={(val) => updateFormDataField(index, 'type', val)}
                        options={[
                          { label: 'Text', value: 'text' },
                          { label: 'File', value: 'file' },
                        ]}
                        style={{ width: '100%' }}
                      />
                    ),
                  },
                  {
                    title: 'Value',
                    dataIndex: 'value',
                    render: (_: unknown, __: unknown, index: number) => (
                      <PlaceholderInput
                        value={formDataFields[index].value}
                        onChange={(val) => updateFormDataField(index, 'value', val)}
                        envVars={envVarNames}
                        depSteps={depStepInfos}
                        fileKeys={fileKeys}
                        placeholder={formDataFields[index].type === 'file' ? '${FILE:fileKey}' : 'Value or ${VAR}'}
                      />
                    ),
                  },
                  {
                    title: '',
                    width: 40,
                    render: (_: unknown, __: unknown, index: number) => (
                      <Popconfirm title="Remove?" onConfirm={() => removeFormDataField(index)} okType="danger">
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ),
                  },
                ]}
                dataSource={formDataFields}
                rowKey="_clientId"
                pagination={false}
                size="small"
                locale={{ emptyText: 'No fields. Click "Add Field" to create one.' }}
              />
            ),
          },
          {
            key: 'dependencies',
            label: 'Dependencies',
            extra: (
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  addDependency()
                }}
              >
                Add Dependency
              </Button>
            ),
            children: (
              <Table
                columns={dependencyColumns}
                dataSource={dependencies}
                rowKey="_clientId"
                pagination={false}
                size="small"
                locale={{ emptyText: 'No dependencies. Click "Add Dependency" to create one.' }}
              />
            ),
          },
          {
            key: 'responseHandlers',
            label: 'Response Handlers',
            extra: (
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  addHandler()
                }}
              >
                Add Handler
              </Button>
            ),
            children: (
              <Table
                columns={handlerColumns}
                dataSource={responseHandlers}
                rowKey="_clientId"
                pagination={false}
                size="small"
                locale={{
                  emptyText: 'No response handlers. Click "Add Handler" to create one.',
                }}
              />
            ),
          },
          {
            key: 'extractVariables',
            label: 'Extract Variables',
            extra: (
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  addExtractVariable()
                }}
              >
                Add Variable
              </Button>
            ),
            children: (
              <Table
                columns={extractColumns}
                dataSource={extractVariables}
                rowKey="_clientId"
                pagination={false}
                size="small"
                locale={{
                  emptyText: 'No extract variables. Click "Add Variable" to create one.',
                }}
              />
            ),
          },
          {
            key: 'cacheSettings',
            label: 'Cache Settings',
            children: (
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <Space>
                  <span>Cacheable:</span>
                  <Switch
                    size="small"
                    checked={cacheable}
                    onChange={(checked) => setCacheable(checked)}
                  />
                </Space>
                {cacheable && (
                  <Space>
                    <span>Cache TTL (seconds):</span>
                    <InputNumber
                      value={cacheTtlSeconds}
                      onChange={(val) => setCacheTtlSeconds(val ?? 0)}
                      min={0}
                      placeholder="0 = entire run"
                      size="small"
                      style={{ width: 160 }}
                    />
                  </Space>
                )}
              </div>
            ),
          },
          {
            key: 'verifications',
            label: `Verifications (${verifications.length})`,
            extra: (
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  addVerification()
                }}
              >
                Add Verification
              </Button>
            ),
            children: verifications.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>
                No verifications. Click &quot;Add Verification&quot; to create one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {verifications.map((v, vIdx) => {
                  const connectorType = connectorNames.find((c) => c.name === v.connectorName)?.type
                  const showPreListen = connectorType === 'KAFKA' || connectorType === 'RABBITMQ'
                  return (
                    <div
                      key={v._clientId}
                      style={{
                        border: '1px solid #f0f0f0',
                        borderRadius: 4,
                        padding: 12,
                        background: '#fafafa',
                      }}
                    >
                      {/* Verification header row */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Connector</div>
                          <Select
                            showSearch
                            value={v.connectorName || undefined}
                            onChange={(val) => updateVerification(vIdx, 'connectorName', val)}
                            placeholder="Select connector"
                            size="small"
                            style={{ width: '100%' }}
                            options={connectorNames.map((c) => ({ label: `${c.name} (${c.type})`, value: c.name }))}
                            filterOption={(input, option) =>
                              (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                            }
                          />
                        </div>
                        <div style={{ width: 90 }}>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>
                            {showPreListen ? 'Timeout (s)' : 'Delay (s)'}
                          </div>
                          <InputNumber
                            value={v.timeoutSeconds}
                            onChange={(val) => updateVerification(vIdx, 'timeoutSeconds', val ?? (showPreListen ? 30 : 0))}
                            min={0}
                            size="small"
                            style={{ width: '100%' }}
                          />
                        </div>
                        {!showPreListen && (
                          <div style={{ width: 110 }}>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Query Timeout (s)</div>
                            <InputNumber
                              value={v.queryTimeoutSeconds}
                              onChange={(val) => updateVerification(vIdx, 'queryTimeoutSeconds', val ?? 30)}
                              min={1}
                              size="small"
                              style={{ width: '100%' }}
                            />
                          </div>
                        )}
                        {showPreListen && (
                          <div style={{ paddingTop: 22 }}>
                            <Checkbox
                              checked={v.preListen}
                              onChange={(e) => updateVerification(vIdx, 'preListen', e.target.checked)}
                            >
                              Pre-Listen
                            </Checkbox>
                          </div>
                        )}
                        <div style={{ paddingTop: 18 }}>
                          <Popconfirm title="Remove verification?" onConfirm={() => removeVerification(vIdx)} okType="danger">
                            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                          </Popconfirm>
                        </div>
                      </div>

                      {/* Query — Kafka gets separate Topic + Key fields, others get generic textarea */}
                      {connectorType === 'KAFKA' ? (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Topic</div>
                            <PlaceholderInput
                              value={parseKafkaQuery(v.query).topic}
                              onChange={(val) => updateVerification(vIdx, 'query', buildKafkaQuery(val, parseKafkaQuery(v.query).key))}
                              envVars={envVarNames}
                              depSteps={verificationDepStepInfos}
                              placeholder="e.g. order-events or ${TOPIC_NAME}"
                              size="small"
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Key <span style={{ color: '#999' }}>(optional)</span></div>
                            <PlaceholderInput
                              value={parseKafkaQuery(v.query).key}
                              onChange={(val) => updateVerification(vIdx, 'query', buildKafkaQuery(parseKafkaQuery(v.query).topic, val))}
                              envVars={envVarNames}
                              depSteps={verificationDepStepInfos}
                              placeholder="e.g. {{stepName.id}} or ${VAR}"
                              size="small"
                            />
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Query</div>
                          <PlaceholderInput
                            mode="textarea"
                            rows={3}
                            value={v.query}
                            onChange={(val) => updateVerification(vIdx, 'query', val)}
                            envVars={envVarNames}
                            depSteps={verificationDepStepInfos}
                            placeholder="SQL query, Redis command, etc. Supports ${VAR} and {{stepName.path}}"
                            size="small"
                          />
                        </div>
                      )}


                      {/* Assertions */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: '#595959' }}>Assertions ({v.assertions.length})</span>
                          <Button
                            type="dashed"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => addAssertion(vIdx)}
                          >
                            Add Assertion
                          </Button>
                        </div>
                        <Table
                          columns={[
                            {
                              title: 'JSON Path',
                              dataIndex: 'jsonPath',
                              width: '35%',
                              render: (_: string, record: AssertionRow, aIdx: number) => (
                                <Input
                                  placeholder="e.g. $.count or $[0].status"
                                  value={record.jsonPath}
                                  onChange={(e) => updateAssertion(vIdx, aIdx, 'jsonPath', e.target.value)}
                                  size="small"
                                />
                              ),
                            },
                            {
                              title: 'Operator',
                              dataIndex: 'operator',
                              width: '22%',
                              render: (_: string, record: AssertionRow, aIdx: number) => (
                                <Select
                                  value={record.operator}
                                  onChange={(val) => updateAssertion(vIdx, aIdx, 'operator', val)}
                                  options={ASSERTION_OPERATOR_OPTIONS}
                                  size="small"
                                  style={{ width: '100%' }}
                                />
                              ),
                            },
                            {
                              title: 'Expected Value',
                              dataIndex: 'expectedValue',
                              width: '33%',
                              render: (_: string, record: AssertionRow, aIdx: number) => (
                                <PlaceholderInput
                                  placeholder="Expected value"
                                  value={record.expectedValue}
                                  onChange={(val) => updateAssertion(vIdx, aIdx, 'expectedValue', val)}
                                  envVars={envVarNames}
                                  depSteps={verificationDepStepInfos}
                                  size="small"
                                />
                              ),
                            },
                            {
                              title: '',
                              key: 'actions',
                              width: '8%',
                              render: (_: unknown, _record: AssertionRow, aIdx: number) => (
                                <Popconfirm title="Remove?" onConfirm={() => removeAssertion(vIdx, aIdx)} okType="danger">
                                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                                </Popconfirm>
                              ),
                            },
                          ]}
                          dataSource={v.assertions}
                          rowKey="_clientId"
                          pagination={false}
                          size="small"
                          locale={{ emptyText: 'No assertions. Click "Add Assertion" to create one.' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ),
          },
        ]}
      />

      {/* Save / Cancel buttons */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" onClick={handleSave} loading={saving}>
          Save
        </Button>
      </div>
    </div>
  )
}
