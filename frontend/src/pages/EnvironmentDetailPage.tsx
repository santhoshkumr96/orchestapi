import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Collapse,
  Form,
  Input,
  Button,
  Space,
  Switch,
  Select,
  Table,
  Popconfirm,
  Tooltip,
  Typography,
  Modal,
  Upload,
  message,
  Spin,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SaveOutlined,
  ApiOutlined,
  UploadOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import type { VariableDto, HeaderDto, HeaderValueType, VariableValueType, ConnectorDto, ConnectorType, EnvironmentFileResponse } from '../types/environment'
import { environmentApi } from '../services/environmentApi'

const { Title } = Typography

const VALUE_TYPE_OPTIONS: { label: string; value: HeaderValueType }[] = [
  { label: 'Static', value: 'STATIC' },
  { label: 'Variable', value: 'VARIABLE' },
  { label: 'UUID', value: 'UUID' },
  { label: 'ISO Timestamp', value: 'ISO_TIMESTAMP' },
]

const VARIABLE_VALUE_TYPE_OPTIONS: { label: string; value: VariableValueType }[] = [
  { label: 'Static', value: 'STATIC' },
  { label: 'UUID', value: 'UUID' },
  { label: 'ISO Timestamp', value: 'ISO_TIMESTAMP' },
]

interface ConnectorFieldDef {
  key: string
  label: string
  secret?: boolean
  type?: 'text' | 'toggle' | 'textarea'
  showWhen?: string
}

const SSL_FIELDS: ConnectorFieldDef[] = [
  { key: 'ssl', label: 'Enable SSL/TLS', type: 'toggle' },
  { key: 'caCertificate', label: 'CA Certificate (PEM)', type: 'textarea', showWhen: 'ssl' },
]

const CONNECTOR_CONFIG_FIELDS: Record<ConnectorType, ConnectorFieldDef[]> = {
  MYSQL: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port' },
    { key: 'database', label: 'Database' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    ...SSL_FIELDS,
  ],
  POSTGRES: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port' },
    { key: 'database', label: 'Database' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    ...SSL_FIELDS,
  ],
  ORACLE: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port' },
    { key: 'database', label: 'Database' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    ...SSL_FIELDS,
  ],
  SQLSERVER: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port' },
    { key: 'database', label: 'Database' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    ...SSL_FIELDS,
  ],
  REDIS: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port' },
    { key: 'password', label: 'Password', secret: true },
    { key: 'database', label: 'Database (0-15)' },
    ...SSL_FIELDS,
  ],
  ELASTICSEARCH: [
    { key: 'url', label: 'URL' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    ...SSL_FIELDS,
  ],
  KAFKA: [
    { key: 'brokers', label: 'Brokers' },
    { key: 'groupId', label: 'Group ID' },
    { key: 'securityProtocol', label: 'Security Protocol' },
    { key: 'saslMechanism', label: 'SASL Mechanism' },
    { key: 'saslUsername', label: 'SASL Username' },
    { key: 'saslPassword', label: 'SASL Password', secret: true },
    ...SSL_FIELDS,
  ],
  RABBITMQ: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port' },
    { key: 'virtualHost', label: 'Virtual Host' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    ...SSL_FIELDS,
  ],
  MONGODB: [
    { key: 'connectionString', label: 'Connection String' },
    ...SSL_FIELDS,
  ],
}

const CONNECTOR_TYPE_OPTIONS: { label: string; value: ConnectorType }[] = [
  { label: 'MySQL', value: 'MYSQL' },
  { label: 'PostgreSQL', value: 'POSTGRES' },
  { label: 'Oracle', value: 'ORACLE' },
  { label: 'SQL Server', value: 'SQLSERVER' },
  { label: 'Redis', value: 'REDIS' },
  { label: 'Elasticsearch', value: 'ELASTICSEARCH' },
  { label: 'Kafka', value: 'KAFKA' },
  { label: 'RabbitMQ', value: 'RABBITMQ' },
  { label: 'MongoDB', value: 'MONGODB' },
]

// Stable client-side ID for new rows
let nextClientId = 1

type VariableRow = VariableDto & { _clientId: string }
type HeaderRow = HeaderDto & { _clientId: string }
type ConnectorRow = ConnectorDto & { _clientId: string }

function getDuplicateIndices<T>(items: T[], getKey: (item: T) => string): Set<number> {
  const seen = new Map<string, number[]>()
  items.forEach((item, i) => {
    const k = getKey(item).trim()
    if (k) {
      seen.set(k, [...(seen.get(k) ?? []), i])
    }
  })
  const dupes = new Set<number>()
  seen.forEach((indices) => {
    if (indices.length > 1) indices.forEach((i) => dupes.add(i))
  })
  return dupes
}

export default function EnvironmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const isNew = id === 'new'

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [variables, setVariables] = useState<VariableRow[]>([])
  const [headers, setHeaders] = useState<HeaderRow[]>([])
  const [connectors, setConnectors] = useState<ConnectorRow[]>([])
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [showErrors, setShowErrors] = useState(false)
  const [testingConnector, setTestingConnector] = useState<Record<string, boolean>>({})
  const [files, setFiles] = useState<EnvironmentFileResponse[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadFileKey, setUploadFileKey] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const clientIdCounter = useRef(nextClientId)

  const genClientId = () => {
    const cid = `_new_${clientIdCounter.current++}`
    return cid
  }

  useEffect(() => {
    if (isNew || !id) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const env = await environmentApi.get(id)
        if (cancelled) return
        form.setFieldsValue({ name: env.name, baseUrl: env.baseUrl })
        setVariables(env.variables.map((v) => ({ ...v, _clientId: v.id ?? genClientId() })))
        setHeaders(env.headers.map((h) => ({ ...h, _clientId: h.id ?? genClientId() })))
        setConnectors((env.connectors ?? []).map((c) => ({ ...c, _clientId: c.id ?? genClientId() })))
      } catch {
        if (cancelled) return
        message.error('Failed to load environment')
        navigate('/environments')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew])

  // --- Load files for existing environments ---
  const loadFiles = async () => {
    if (isNew || !id) return
    setFilesLoading(true)
    try {
      const data = await environmentApi.listFiles(id)
      setFiles(data)
    } catch {
      // Silently fail — files are optional
    } finally {
      setFilesLoading(false)
    }
  }

  useEffect(() => {
    if (!isNew && id) loadFiles()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew])

  const handleUploadFile = async () => {
    if (!id || !uploadFileKey.trim() || !uploadFile) {
      message.error('File key and file are required')
      return
    }
    setUploading(true)
    try {
      await environmentApi.uploadFile(id, uploadFileKey.trim(), uploadFile)
      message.success('File uploaded')
      setUploadModalOpen(false)
      setUploadFileKey('')
      setUploadFile(null)
      loadFiles()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } }
        message.error(axiosErr.response?.data?.error ?? 'Upload failed')
      } else {
        message.error('Upload failed')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDownloadFile = async (file: EnvironmentFileResponse) => {
    if (!id) return
    try {
      const blob = await environmentApi.downloadFile(id, file.id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      message.error('Download failed')
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    if (!id) return
    try {
      await environmentApi.deleteFile(id, fileId)
      message.success('File deleted')
      loadFiles()
    } catch {
      message.error('Delete failed')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // --- Validation for empty fields ---
  const emptyVarKeys = new Set(variables.map((v, i) => !v.key.trim() ? i : -1).filter((i) => i >= 0))
  const emptyVarValues = new Set(variables.map((v, i) => (v.valueType !== 'UUID' && v.valueType !== 'ISO_TIMESTAMP' && !v.value.trim()) ? i : -1).filter((i) => i >= 0))
  const emptyHdrKeys = new Set(headers.map((h, i) => !h.headerKey.trim() ? i : -1).filter((i) => i >= 0))
  const emptyConnNames = new Set(connectors.map((c, i) => !c.name.trim() ? i : -1).filter((i) => i >= 0))
  const hasEmptyFields = emptyVarKeys.size > 0 || emptyVarValues.size > 0 || emptyHdrKeys.size > 0 || emptyConnNames.size > 0

  const handleSave = async () => {
    setShowErrors(true)
    if (hasDuplicates) {
      message.error('Please fix duplicate keys before saving')
      return
    }
    if (hasEmptyFields) {
      message.error('Please fill in all required fields')
      return
    }
    try {
      const values = await form.validateFields()
      setSaving(true)

      const request = {
        name: values.name,
        baseUrl: values.baseUrl,
        variables: variables.map(({ _clientId, ...rest }) => rest),
        headers: headers.map(({ _clientId, ...rest }) => rest),
        connectors: connectors.map(({ _clientId, ...rest }) => rest),
      }

      if (isNew) {
        await environmentApi.create(request)
        message.success('Environment created')
      } else {
        await environmentApi.update(id!, request)
        message.success('Environment updated')
      }
      navigate('/environments')
    } catch (err: unknown) {
      // Ant Design form validation errors have errorFields — just let the form highlight them
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return
      }
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } }
        message.error(axiosErr.response?.data?.error ?? 'Failed to save')
      } else {
        message.error('Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  // --- Variables helpers ---
  const addVariable = () => {
    setVariables([...variables, { _clientId: genClientId(), key: '', value: '', valueType: 'STATIC', secret: false }])
  }

  const updateVariable = (index: number, field: keyof VariableDto, value: string | boolean) => {
    const updated = [...variables]
    updated[index] = { ...updated[index], [field]: value }
    setVariables(updated)
  }

  const removeVariable = (index: number) => {
    const removedId = variables[index]._clientId
    setVariables(variables.filter((_, i) => i !== index))
    setRevealedIds((prev) => {
      const next = new Set(prev)
      next.delete(removedId)
      return next
    })
  }

  const toggleReveal = (clientId: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) {
        next.delete(clientId)
      } else {
        next.add(clientId)
      }
      return next
    })
  }

  // --- Headers helpers ---
  const addHeader = () => {
    setHeaders([...headers, { _clientId: genClientId(), headerKey: '', valueType: 'STATIC', headerValue: '' }])
  }

  const updateHeader = (index: number, field: keyof HeaderDto, value: string) => {
    const updated = [...headers]
    updated[index] = { ...updated[index], [field]: value }
    // Clear headerValue when switching to auto-generated types
    if (field === 'valueType' && (value === 'UUID' || value === 'ISO_TIMESTAMP')) {
      updated[index].headerValue = ''
    }
    setHeaders(updated)
  }

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index))
  }

  // --- Connectors helpers ---
  const addConnector = () => {
    setConnectors([...connectors, { _clientId: genClientId(), name: '', type: 'MYSQL', config: {} }])
  }

  const updateConnector = (index: number, field: string, value: unknown) => {
    const updated = [...connectors]
    if (field === 'type') {
      // Reset config when type changes
      updated[index] = { ...updated[index], type: value as ConnectorType, config: {} }
    } else if (field === 'config') {
      updated[index] = { ...updated[index], config: value as Record<string, string> }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    setConnectors(updated)
  }

  const updateConnectorConfig = (index: number, key: string, value: string) => {
    const updated = [...connectors]
    updated[index] = { ...updated[index], config: { ...updated[index].config, [key]: value } }
    setConnectors(updated)
  }

  const removeConnector = (index: number) => {
    setConnectors(connectors.filter((_, i) => i !== index))
  }

  const handleTestConnector = async (index: number) => {
    const conn = connectors[index]
    const clientId = conn._clientId
    setTestingConnector((prev) => ({ ...prev, [clientId]: true }))
    try {
      const result = await environmentApi.testConnector({
        type: conn.type,
        config: conn.config,
        environmentId: !isNew ? id : undefined,
        connectorName: conn.name || undefined,
      })
      if (result.success) {
        message.success(`Connection successful (${result.durationMs}ms)`)
      } else {
        message.error(result.message || 'Connection failed')
      }
    } catch {
      message.error('Failed to test connection')
    } finally {
      setTestingConnector((prev) => ({ ...prev, [clientId]: false }))
    }
  }

  // --- Duplicate detection ---
  const dupVarIndices = getDuplicateIndices(variables, (v) => v.key)
  const dupHdrIndices = getDuplicateIndices(headers, (h) => h.headerKey)
  const dupConnIndices = getDuplicateIndices(connectors, (c) => c.name)
  const hasDuplicates = dupVarIndices.size > 0 || dupHdrIndices.size > 0 || dupConnIndices.size > 0

  // --- Variable key options for VARIABLE type headers ---
  const variableKeyOptions = variables
    .filter((v) => v.key.trim() !== '')
    .map((v) => ({ label: v.key, value: v.key }))

  // --- Table columns ---
  const varColumns = [
    {
      title: 'Key',
      dataIndex: 'key',
      width: '25%',
      render: (_: string, record: VariableRow, index: number) => {
        const isDup = dupVarIndices.has(index)
        const isEmpty = showErrors && emptyVarKeys.has(index)
        const hasError = isDup || isEmpty
        const errorMsg = isDup ? 'Duplicate variable key' : isEmpty ? 'Key is required' : undefined
        return (
          <Tooltip title={errorMsg} color="red" open={hasError ? undefined : false}>
            <Input
              placeholder="e.g. API_KEY"
              value={record.key}
              onChange={(e) => updateVariable(index, 'key', e.target.value)}
              size="small"
              status={hasError ? 'error' : undefined}
            />
          </Tooltip>
        )
      },
    },
    {
      title: 'Value Type',
      dataIndex: 'valueType',
      width: '15%',
      render: (_: string, record: VariableRow, index: number) => (
        <Select
          showSearch
          value={record.valueType || 'STATIC'}
          onChange={(val) => updateVariable(index, 'valueType', val)}
          options={VARIABLE_VALUE_TYPE_OPTIONS}
          size="small"
          style={{ width: '100%' }}
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
      ),
    },
    {
      title: 'Value',
      dataIndex: 'value',
      width: '30%',
      render: (_: string, record: VariableRow, index: number) => {
        if (record.valueType === 'UUID' || record.valueType === 'ISO_TIMESTAMP') {
          return (
            <span style={{ color: '#999', fontStyle: 'italic', fontSize: 12 }}>
              (auto-generated)
            </span>
          )
        }
        const isMasked = record.secret && !revealedIds.has(record._clientId)
        const isEmpty = showErrors && emptyVarValues.has(index)
        return (
          <Tooltip title={isEmpty ? 'Value is required' : undefined} color="red" open={isEmpty ? undefined : false}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="Value"
                value={record.value}
                onChange={(e) => updateVariable(index, 'value', e.target.value)}
                type={isMasked ? 'password' : 'text'}
                size="small"
                status={isEmpty ? 'error' : undefined}
              />
            {record.secret && (
              <Button
                size="small"
                type="text"
                icon={revealedIds.has(record._clientId) ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => toggleReveal(record._clientId)}
              />
            )}
            </Space.Compact>
          </Tooltip>
        )
      },
    },
    {
      title: 'Secret',
      dataIndex: 'secret',
      width: '10%',
      render: (_: boolean, record: VariableRow, index: number) => (
        <Switch
          size="small"
          checked={record.secret}
          onChange={(checked) => updateVariable(index, 'secret', checked)}
          disabled={record.valueType === 'UUID' || record.valueType === 'ISO_TIMESTAMP'}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: '8%',
      render: (_: unknown, record: VariableRow) => {
        const index = variables.indexOf(record)
        return (
          <Popconfirm title="Remove?" onConfirm={() => removeVariable(index)} okType="danger">
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        )
      },
    },
  ]

  const headerColumns = [
    {
      title: 'Header Key',
      dataIndex: 'headerKey',
      width: '28%',
      render: (_: string, record: HeaderRow, index: number) => {
        const isDup = dupHdrIndices.has(index)
        const isEmpty = showErrors && emptyHdrKeys.has(index)
        const hasError = isDup || isEmpty
        const errorMsg = isDup ? 'Duplicate header key' : isEmpty ? 'Header key is required' : undefined
        return (
          <Tooltip title={errorMsg} color="red" open={hasError ? undefined : false}>
            <Input
              placeholder="e.g. Content-Type"
              value={record.headerKey}
              onChange={(e) => updateHeader(index, 'headerKey', e.target.value)}
              size="small"
              status={hasError ? 'error' : undefined}
            />
          </Tooltip>
        )
      },
    },
    {
      title: 'Value Type',
      dataIndex: 'valueType',
      width: '22%',
      render: (_: string, record: HeaderRow, index: number) => (
        <Select
          showSearch
          value={record.valueType}
          onChange={(val) => updateHeader(index, 'valueType', val)}
          options={VALUE_TYPE_OPTIONS}
          size="small"
          style={{ width: '100%' }}
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
      ),
    },
    {
      title: 'Value',
      dataIndex: 'headerValue',
      width: '30%',
      render: (_: string, record: HeaderRow, index: number) => {
        const type = record.valueType
        if (type === 'UUID' || type === 'ISO_TIMESTAMP') {
          return (
            <span style={{ color: '#999', fontStyle: 'italic', fontSize: 12 }}>
              (auto-generated)
            </span>
          )
        }
        if (type === 'VARIABLE') {
          return (
            <Select
              showSearch
              value={record.headerValue || undefined}
              onChange={(val) => updateHeader(index, 'headerValue', val)}
              options={variableKeyOptions}
              placeholder="Select variable"
              size="small"
              style={{ width: '100%' }}
              allowClear
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          )
        }
        return (
          <Input
            placeholder="e.g. application/json"
            value={record.headerValue}
            onChange={(e) => updateHeader(index, 'headerValue', e.target.value)}
            size="small"
          />
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: '8%',
      render: (_: unknown, _record: HeaderRow, index: number) => (
        <Popconfirm title="Remove?" onConfirm={() => removeHeader(index)} okType="danger">
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ]

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/environments')} />
          <Title level={5} style={{ margin: 0 }}>
            {isNew ? 'New Environment' : 'Edit Environment'}
          </Title>
        </Space>
        <Tooltip title={hasDuplicates ? 'Fix duplicate keys before saving' : (showErrors && hasEmptyFields) ? 'Fill in all required fields' : undefined}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            disabled={hasDuplicates || (showErrors && hasEmptyFields)}
          >
            Save
          </Button>
        </Tooltip>
      </div>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Form form={form} layout="vertical" size="small">
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true, message: 'Name is required' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="e.g. DEV, QA, STAGING" />
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label="Base URL"
              rules={[
                { required: true, message: 'Base URL is required' },
                { pattern: /^https?:\/\//, message: 'Must start with http:// or https://' },
              ]}
              style={{ flex: 2 }}
            >
              <Input placeholder="e.g. https://api-dev.example.com" />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card
        size="small"
        title="Variables"
        extra={
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addVariable}>
            Add Variable
          </Button>
        }
        style={{ marginBottom: 12 }}
      >
        <Table
          columns={varColumns}
          dataSource={variables}
          rowKey="_clientId"
          pagination={false}
          size="small"
          locale={{ emptyText: 'No variables yet. Click "Add Variable" to create one.' }}
        />
      </Card>

      <Card
        size="small"
        title="Default Headers"
        extra={
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addHeader}>
            Add Header
          </Button>
        }
      >
        <Table
          columns={headerColumns}
          dataSource={headers}
          rowKey="_clientId"
          pagination={false}
          size="small"
          locale={{ emptyText: 'No default headers yet. Click "Add Header" to create one.' }}
        />
      </Card>

      {!isNew && (
        <Card
          size="small"
          title="Files"
          extra={
            <Button type="dashed" size="small" icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
              Upload File
            </Button>
          }
          style={{ marginTop: 12 }}
        >
          <Table
            columns={[
              { title: 'File Key', dataIndex: 'fileKey', key: 'fileKey', width: 200 },
              { title: 'File Name', dataIndex: 'fileName', key: 'fileName' },
              { title: 'Type', dataIndex: 'contentType', key: 'contentType', width: 160 },
              { title: 'Size', dataIndex: 'fileSize', key: 'fileSize', width: 100, render: (v: number) => formatFileSize(v) },
              {
                title: 'Actions',
                key: 'actions',
                width: 100,
                render: (_: unknown, record: EnvironmentFileResponse) => (
                  <Space size={4}>
                    <Tooltip title="Download">
                      <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadFile(record)} />
                    </Tooltip>
                    <Popconfirm title="Delete this file?" onConfirm={() => handleDeleteFile(record.id)} okType="danger">
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
            dataSource={files}
            rowKey="id"
            pagination={false}
            size="small"
            loading={filesLoading}
            locale={{ emptyText: 'No files yet. Upload files to reference them in form-data steps via ${FILE:key}.' }}
          />
          <Modal
            title="Upload File"
            open={uploadModalOpen}
            onCancel={() => { setUploadModalOpen(false); setUploadFileKey(''); setUploadFile(null) }}
            onOk={handleUploadFile}
            confirmLoading={uploading}
            okText="Upload"
            okButtonProps={{ disabled: !uploadFileKey.trim() || !uploadFile }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>File Key (used in ${'{'}FILE:key{'}'} references)</div>
                <Input
                  size="small"
                  value={uploadFileKey}
                  onChange={(e) => setUploadFileKey(e.target.value)}
                  placeholder="e.g. my-certificate, test-payload"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>File (max 50MB)</div>
                <Upload
                  beforeUpload={(file) => { setUploadFile(file); return false }}
                  maxCount={1}
                  fileList={uploadFile ? [{ uid: '-1', name: uploadFile.name, status: 'done' as const }] : []}
                  onRemove={() => setUploadFile(null)}
                >
                  <Button size="small" icon={<UploadOutlined />}>Select File</Button>
                </Upload>
              </div>
            </div>
          </Modal>
        </Card>
      )}

      <Card
        size="small"
        title="Connectors"
        extra={
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addConnector}>
            Add Connector
          </Button>
        }
        style={{ marginTop: 12 }}
      >
        {connectors.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '12px 0' }}>
            No connectors yet. Click &quot;Add Connector&quot; to create one.
          </div>
        ) : (
          <Collapse
            size="small"
            items={connectors.map((conn, index) => {
              const isDupName = dupConnIndices.has(index)
              const isEmptyName = showErrors && emptyConnNames.has(index)
              const configFields = CONNECTOR_CONFIG_FIELDS[conn.type] ?? []
              return {
                key: conn._clientId,
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Select
                      showSearch
                      value={conn.type}
                      onChange={(val) => updateConnector(index, 'type', val)}
                      options={CONNECTOR_TYPE_OPTIONS}
                      size="small"
                      style={{ width: 140 }}
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Tooltip title={isDupName ? 'Duplicate connector name' : isEmptyName ? 'Connector name is required' : undefined} color="red" open={isDupName || isEmptyName ? undefined : false}>
                      <Input
                        placeholder="Connector name"
                        value={conn.name}
                        onChange={(e) => { e.stopPropagation(); updateConnector(index, 'name', e.target.value) }}
                        onClick={(e) => e.stopPropagation()}
                        size="small"
                        style={{ width: 200 }}
                        status={isDupName || isEmptyName ? 'error' : undefined}
                      />
                    </Tooltip>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      <Tooltip title="Test Connection">
                        <Button
                          type="text"
                          icon={<ApiOutlined />}
                          size="small"
                          loading={testingConnector[conn._clientId]}
                          onClick={(e) => { e.stopPropagation(); handleTestConnector(index) }}
                        />
                      </Tooltip>
                      <Popconfirm title="Remove connector?" onConfirm={() => removeConnector(index)} okType="danger">
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={(e) => e.stopPropagation()} />
                      </Popconfirm>
                    </div>
                  </div>
                ),
                children: (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {configFields
                      .filter((field) => !field.showWhen || conn.config[field.showWhen] === 'true')
                      .map((field) => (
                      <div key={field.key} style={field.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>{field.label}</div>
                        {field.type === 'toggle' ? (
                          <Switch
                            size="small"
                            checked={conn.config[field.key] === 'true'}
                            onChange={(checked) => updateConnectorConfig(index, field.key, checked ? 'true' : 'false')}
                          />
                        ) : field.type === 'textarea' ? (
                          <Input.TextArea
                            size="small"
                            rows={3}
                            value={conn.config[field.key] ?? ''}
                            onChange={(e) => updateConnectorConfig(index, field.key, e.target.value)}
                            placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
                            style={{ fontFamily: 'monospace', fontSize: 11 }}
                          />
                        ) : field.secret ? (
                          <Input.Password
                            size="small"
                            value={conn.config[field.key] ?? ''}
                            onChange={(e) => updateConnectorConfig(index, field.key, e.target.value)}
                            placeholder={field.label}
                          />
                        ) : (
                          <Input
                            size="small"
                            value={conn.config[field.key] ?? ''}
                            onChange={(e) => updateConnectorConfig(index, field.key, e.target.value)}
                            placeholder={field.label}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ),
              }
            })}
          />
        )}
      </Card>
    </div>
  )
}
