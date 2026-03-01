import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Table,
  Button,
  Space,
  Tag,
  message,
  Typography,
  Switch,
  Popconfirm,
  Empty,
  Input,
  Modal,
  Form,
  InputNumber,
  Tooltip,
  Badge,
  Select,
  Collapse,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  ClearOutlined,
  SearchOutlined,
  CopyOutlined,
  LinkOutlined,
  DownloadOutlined,
  EyeOutlined,
  HolderOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import type { FilterDropdownProps } from 'antd/es/table/interface'
import { useParams, useNavigate } from 'react-router-dom'
import type { Webhook, WebhookRequestLog, WebhookResponseRuleDto, WebhookRuleConditionDto, WebhookConditionType } from '../types/webhook'
import type { WebhookRequest } from '../types/webhook'
import { webhookApi } from '../services/webhookApi'

const { Title, Text } = Typography

const METHOD_COLORS: Record<string, string> = {
  GET: '#52c41a',
  POST: '#1677ff',
  PUT: '#fa8c16',
  DELETE: '#ff4d4f',
  PATCH: '#722ed1',
  HEAD: '#8c8c8c',
  OPTIONS: '#8c8c8c',
}

const COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
}

// ────────────────── Column Search (shared) ──────────────────
function ColumnSearch({
  dataIndex,
  filterDropdownProps,
  appliedValue,
  onApply,
  onReset,
}: {
  dataIndex: string
  filterDropdownProps: FilterDropdownProps
  appliedValue: string
  onApply: (dataIndex: string, value: string) => void
  onReset: (dataIndex: string) => void
}) {
  const [localValue, setLocalValue] = useState(appliedValue)
  const inputRef = useRef<ReturnType<typeof Input>>(null)
  const { close } = filterDropdownProps

  useEffect(() => {
    if (filterDropdownProps.visible) {
      setLocalValue(appliedValue)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [filterDropdownProps.visible, appliedValue])

  return (
    <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
      <Input
        ref={inputRef}
        placeholder={`Search ${COLUMN_LABELS[dataIndex] ?? dataIndex}`}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onPressEnter={() => { onApply(dataIndex, localValue); close() }}
        style={{ marginBottom: 8, display: 'block' }}
        size="small"
      />
      <Space>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          size="small"
          onClick={() => { onApply(dataIndex, localValue); close() }}
        >
          Search
        </Button>
        <Button
          size="small"
          onClick={() => { onReset(dataIndex); close() }}
        >
          Reset
        </Button>
      </Space>
    </div>
  )
}

// ────────────────── Key-Value Editor (for response headers) ──────────────────

let _kvId = 0
function genKvId() { return `kv_${++_kvId}` }

interface KvRow { _clientId: string; key: string; value: string }

function KeyValueEditor({
  value,
  onChange,
}: {
  value: KvRow[]
  onChange: (rows: KvRow[]) => void
}) {
  const updateRow = (id: string, field: 'key' | 'value', val: string) => {
    onChange(value.map((r) => (r._clientId === id ? { ...r, [field]: val } : r)))
  }
  const removeRow = (id: string) => {
    onChange(value.filter((r) => r._clientId !== id))
  }
  const addRow = () => {
    onChange([...value, { _clientId: genKvId(), key: '', value: '' }])
  }

  return (
    <div>
      {value.map((row) => (
        <div key={row._clientId} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <Input
            size="small"
            placeholder="Header name"
            value={row.key}
            onChange={(e) => updateRow(row._clientId, 'key', e.target.value)}
            style={{ flex: 1 }}
          />
          <Input
            size="small"
            placeholder="Value"
            value={row.value}
            onChange={(e) => updateRow(row._clientId, 'value', e.target.value)}
            style={{ flex: 1 }}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeRow(row._clientId)}
          />
        </div>
      ))}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addRow} style={{ marginTop: 4 }}>
        Add Header
      </Button>
    </div>
  )
}

// ────────────────── Condition Type Options ──────────────────

const CONDITION_TYPE_OPTIONS: { value: WebhookConditionType; label: string }[] = [
  { value: 'HEADER', label: 'Header' },
  { value: 'QUERY_PARAM', label: 'Query Param' },
  { value: 'BODY_JSON_PATH', label: 'Body JSON Path' },
  { value: 'REQUEST_PATH', label: 'Request Path' },
]

// ────────────────── Response Rules Editor ──────────────────

let _ruleId = 0
function genRuleId() { return `rule_${++_ruleId}` }
let _condId = 0
function genCondId() { return `cond_${++_condId}` }

interface RuleEditorRow {
  _clientId: string
  id?: string
  name: string
  enabled: boolean
  responseStatus: number
  responseBody: string
  responseHeaders: KvRow[]
  conditions: ConditionRow[]
}

interface ConditionRow {
  _clientId: string
  id?: string
  conditionType: WebhookConditionType
  matchKey: string
  matchValue: string
}

function toRuleEditorRows(rules: WebhookResponseRuleDto[]): RuleEditorRow[] {
  return (rules || []).map((r) => ({
    _clientId: genRuleId(),
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    responseStatus: r.responseStatus,
    responseBody: r.responseBody || '',
    responseHeaders: (r.responseHeaders || []).map((h) => ({ _clientId: genKvId(), key: h.key, value: h.value })),
    conditions: (r.conditions || []).map((c) => ({
      _clientId: genCondId(),
      id: c.id,
      conditionType: c.conditionType,
      matchKey: c.matchKey,
      matchValue: c.matchValue || '',
    })),
  }))
}

function fromRuleEditorRows(rows: RuleEditorRow[]): WebhookResponseRuleDto[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    responseStatus: r.responseStatus,
    responseBody: r.responseBody || undefined,
    responseHeaders: r.responseHeaders.filter((h) => h.key.trim()).map((h) => ({ key: h.key.trim(), value: h.value })),
    conditions: r.conditions
      .filter((c) => c.matchKey.trim())
      .map((c) => ({
        id: c.id,
        conditionType: c.conditionType,
        matchKey: c.matchKey.trim(),
        matchValue: c.matchValue || undefined,
      })),
  }))
}

function ResponseRulesEditor({
  webhookId,
  initialRules,
  onSaved,
}: {
  webhookId: string
  initialRules: WebhookResponseRuleDto[]
  onSaved: (webhook: Webhook) => void
}) {
  const [rules, setRules] = useState<RuleEditorRow[]>(() => toRuleEditorRows(initialRules))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Sync when initialRules changes (e.g. after reload)
  useEffect(() => {
    setRules(toRuleEditorRows(initialRules))
    setDirty(false)
  }, [initialRules])

  const updateRule = (id: string, patch: Partial<RuleEditorRow>) => {
    setRules((prev) => prev.map((r) => (r._clientId === id ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r._clientId !== id))
    setDirty(true)
  }

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      {
        _clientId: genRuleId(),
        name: '',
        enabled: true,
        responseStatus: 200,
        responseBody: '',
        responseHeaders: [],
        conditions: [],
      },
    ])
    setDirty(true)
  }

  const addCondition = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r._clientId === ruleId
          ? {
              ...r,
              conditions: [
                ...r.conditions,
                { _clientId: genCondId(), conditionType: 'HEADER' as WebhookConditionType, matchKey: '', matchValue: '' },
              ],
            }
          : r,
      ),
    )
    setDirty(true)
  }

  const updateCondition = (ruleId: string, condId: string, patch: Partial<ConditionRow>) => {
    setRules((prev) =>
      prev.map((r) =>
        r._clientId === ruleId
          ? { ...r, conditions: r.conditions.map((c) => (c._clientId === condId ? { ...c, ...patch } : c)) }
          : r,
      ),
    )
    setDirty(true)
  }

  const removeCondition = (ruleId: string, condId: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r._clientId === ruleId ? { ...r, conditions: r.conditions.filter((c) => c._clientId !== condId) } : r,
      ),
    )
    setDirty(true)
  }

  const handleSave = async () => {
    // Validate: all rules must have names
    for (const rule of rules) {
      if (!rule.name.trim()) {
        message.error('All rules must have a name')
        return
      }
    }
    setSaving(true)
    try {
      const dtos = fromRuleEditorRows(rules)
      const wh = await webhookApi.updateResponseRules(webhookId, dtos)
      onSaved(wh)
      setDirty(false)
      message.success('Response rules saved')
    } catch (err: any) {
      if (err?.response?.data?.error) message.error(err.response.data.error)
      else message.error('Failed to save rules')
    } finally {
      setSaving(false)
    }
  }

  const conditionSummary = (conditions: ConditionRow[]) => {
    if (conditions.length === 0) return 'No conditions (always matches)'
    return conditions
      .filter((c) => c.matchKey.trim())
      .map((c) => {
        const typeLabel = CONDITION_TYPE_OPTIONS.find((o) => o.value === c.conditionType)?.label || c.conditionType
        if (c.conditionType === 'REQUEST_PATH') return `Path: ${c.matchKey}`
        return c.matchValue ? `${typeLabel}: ${c.matchKey} = ${c.matchValue}` : `${typeLabel}: ${c.matchKey} exists`
      })
      .join(' AND ')
  }

  return (
    <div style={{
      border: '1px solid #f0f0f0',
      borderLeft: '3px solid #722ed1',
      borderRadius: 4,
      padding: '6px 12px',
      marginBottom: 12,
      background: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: rules.length > 0 ? 8 : 0 }}>
        <div style={{
          width: 24, height: 24, background: '#722ed1', color: '#fff',
          borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600,
        }}>C</div>
        <Text strong style={{ fontSize: 12 }}>Response Rules</Text>
        <Tag style={{ fontSize: 11 }}>{rules.length} rule{rules.length !== 1 ? 's' : ''}</Tag>
        <div style={{ flex: 1 }} />
        {dirty && (
          <Button size="small" type="primary" loading={saving} onClick={handleSave}>
            Save Rules
          </Button>
        )}
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addRule}>
          Add Rule
        </Button>
      </div>

      {rules.length === 0 && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', padding: '4px 0' }}>
          No response rules. All requests will use the default response above.
        </Text>
      )}

      <Collapse
        size="small"
        items={rules.map((rule, idx) => ({
          key: rule._clientId,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <HolderOutlined style={{ color: '#bfbfbf', cursor: 'grab' }} />
              <Text strong style={{ fontSize: 12 }}>{rule.name || <Text type="secondary" italic>Untitled Rule</Text>}</Text>
              <Tag color={rule.enabled ? 'green' : 'default'} style={{ fontSize: 10 }}>
                {rule.enabled ? 'Enabled' : 'Disabled'}
              </Tag>
              <Tag style={{ fontSize: 10 }}>{rule.responseStatus}</Tag>
              <Text type="secondary" style={{ fontSize: 11, flex: 1 }} ellipsis>
                {conditionSummary(rule.conditions)}
              </Text>
            </div>
          ),
          extra: (
            <Space size={4} onClick={(e) => e.stopPropagation()}>
              <Switch
                size="small"
                checked={rule.enabled}
                onChange={(v) => updateRule(rule._clientId, { enabled: v })}
              />
              <Popconfirm title="Delete this rule?" okType="danger" onConfirm={() => removeRule(rule._clientId)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          ),
          children: (
            <div>
              {/* Rule Name */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ textTransform: 'uppercase', color: '#8c8c8c', fontSize: 11, fontWeight: 500, letterSpacing: 0.3, marginBottom: 4 }}>
                    RULE NAME
                  </div>
                  <Input
                    size="small"
                    placeholder="e.g. Error Response"
                    value={rule.name}
                    onChange={(e) => updateRule(rule._clientId, { name: e.target.value })}
                  />
                </div>
                <div>
                  <div style={{ textTransform: 'uppercase', color: '#8c8c8c', fontSize: 11, fontWeight: 500, letterSpacing: 0.3, marginBottom: 4 }}>
                    STATUS CODE
                  </div>
                  <InputNumber
                    size="small"
                    min={100}
                    max={599}
                    value={rule.responseStatus}
                    onChange={(v) => updateRule(rule._clientId, { responseStatus: v || 200 })}
                    style={{ width: 100 }}
                  />
                </div>
              </div>

              {/* Response Body */}
              <div style={{ textTransform: 'uppercase', color: '#8c8c8c', fontSize: 11, fontWeight: 500, letterSpacing: 0.3, marginBottom: 4 }}>
                RESPONSE BODY
              </div>
              <Input.TextArea
                size="small"
                rows={2}
                value={rule.responseBody}
                onChange={(e) => updateRule(rule._clientId, { responseBody: e.target.value })}
                placeholder='e.g. {"error":"bad request"}'
                style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}
              />

              {/* Response Headers */}
              <div style={{ textTransform: 'uppercase', color: '#8c8c8c', fontSize: 11, fontWeight: 500, letterSpacing: 0.3, marginBottom: 4 }}>
                RESPONSE HEADERS
              </div>
              <KeyValueEditor
                value={rule.responseHeaders}
                onChange={(headers) => updateRule(rule._clientId, { responseHeaders: headers })}
              />

              {/* Conditions */}
              <div style={{
                textTransform: 'uppercase', color: '#8c8c8c', fontSize: 11, fontWeight: 500,
                letterSpacing: 0.3, marginTop: 12, marginBottom: 4,
              }}>
                CONDITIONS ({rule.conditions.length})
              </div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                All conditions must match (AND logic). Leave value empty to check existence only.
              </Text>

              {rule.conditions.map((cond) => (
                <div key={cond._clientId} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <Select
                    size="small"
                    value={cond.conditionType}
                    onChange={(v) => updateCondition(rule._clientId, cond._clientId, { conditionType: v })}
                    options={CONDITION_TYPE_OPTIONS}
                    style={{ width: 140 }}
                  />
                  <Input
                    size="small"
                    placeholder={
                      cond.conditionType === 'BODY_JSON_PATH' ? '$.data.type'
                        : cond.conditionType === 'REQUEST_PATH' ? '/api/v1/test'
                          : 'key name'
                    }
                    value={cond.matchKey}
                    onChange={(e) => updateCondition(rule._clientId, cond._clientId, { matchKey: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <Input
                    size="small"
                    placeholder={cond.conditionType === 'REQUEST_PATH' ? '(not used)' : 'expected value (optional)'}
                    disabled={cond.conditionType === 'REQUEST_PATH'}
                    value={cond.matchValue}
                    onChange={(e) => updateCondition(rule._clientId, cond._clientId, { matchValue: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeCondition(rule._clientId, cond._clientId)}
                  />
                </div>
              ))}

              <Button
                size="small"
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => addCondition(rule._clientId)}
                style={{ marginTop: 4 }}
              >
                Add Condition
              </Button>
            </div>
          ),
        }))}
      />
    </div>
  )
}

// ────────────────── Webhook List View ──────────────────

function WebhookListView() {
  const navigate = useNavigate()
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [modalHeaders, setModalHeaders] = useState<KvRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await webhookApi.list({
        page,
        size: 10,
        sortBy,
        sortDir,
        name: filters.name || undefined,
        description: filters.description || undefined,
      })
      setWebhooks(res.content)
      setTotal(res.totalElements)
    } catch {
      message.error('Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [page, sortBy, sortDir, filters])

  useEffect(() => { load() }, [load])

  const applyFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(0)
  }
  const resetFilter = (key: string) => {
    setFilters((prev) => { const n = { ...prev }; delete n[key]; return n })
    setPage(0)
  }

  const handleTableChange = (_pagination: any, _filters: any, sorter: any) => {
    if (sorter.field && sorter.order) {
      setSortBy(sorter.field)
      setSortDir(sorter.order === 'descend' ? 'desc' : 'asc')
    }
  }

  const openCreate = () => {
    setEditWebhook(null)
    form.resetFields()
    form.setFieldsValue({ defaultResponseStatus: 200 })
    setModalHeaders([])
    setModalOpen(true)
  }

  const openEdit = (w: Webhook) => {
    setEditWebhook(w)
    form.setFieldsValue({
      name: w.name,
      description: w.description || '',
      defaultResponseStatus: w.defaultResponseStatus,
      defaultResponseBody: w.defaultResponseBody || '',
    })
    setModalHeaders(
      (w.defaultResponseHeaders || []).map((h) => ({ _clientId: genKvId(), key: h.key, value: h.value })),
    )
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const data: WebhookRequest = {
        name: values.name,
        description: values.description || undefined,
        defaultResponseStatus: values.defaultResponseStatus || 200,
        defaultResponseBody: values.defaultResponseBody || undefined,
        defaultResponseHeaders: modalHeaders
          .filter((h) => h.key.trim())
          .map((h) => ({ key: h.key.trim(), value: h.value })),
      }
      if (editWebhook) {
        await webhookApi.update(editWebhook.id, data)
        message.success('Webhook updated')
      } else {
        await webhookApi.create(data)
        message.success('Webhook created')
      }
      setModalOpen(false)
      load()
    } catch (err: any) {
      if (err?.response?.data?.error) message.error(err.response.data.error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await webhookApi.delete(id)
      message.success('Webhook deleted')
      load()
    } catch {
      message.error('Failed to delete')
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await webhookApi.toggleStatus(id, enabled)
      setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, enabled } : w)))
    } catch {
      message.error('Failed to toggle')
    }
  }

  const filterIcon = (dataIndex: string) => (
    <SearchOutlined style={{ color: filters[dataIndex] ? '#1677ff' : undefined }} />
  )

  const columns = [
    {
      title: 'S.No',
      width: 60,
      render: (_: unknown, __: unknown, idx: number) => page * 10 + idx + 1,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      sorter: true,
      filterDropdown: (props: FilterDropdownProps) => (
        <ColumnSearch
          dataIndex="name"
          filterDropdownProps={props}
          appliedValue={filters.name || ''}
          onApply={applyFilter}
          onReset={resetFilter}
        />
      ),
      filterIcon: () => filterIcon('name'),
      filteredValue: filters.name ? [filters.name] : null,
      render: (name: string, w: Webhook) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/webhooks/${w.id}`)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      filterDropdown: (props: FilterDropdownProps) => (
        <ColumnSearch
          dataIndex="description"
          filterDropdownProps={props}
          appliedValue={filters.description || ''}
          onApply={applyFilter}
          onReset={resetFilter}
        />
      ),
      filterIcon: () => filterIcon('description'),
      filteredValue: filters.description ? [filters.description] : null,
      render: (d: string) => d || <Text type="secondary">-</Text>,
    },
    {
      title: 'Requests',
      dataIndex: 'requestCount',
      width: 90,
      align: 'center' as const,
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      width: 90,
      render: (enabled: boolean, w: Webhook) => (
        <Switch size="small" checked={enabled} onChange={(v) => handleToggle(w.id, v)} />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 150,
      sorter: true,
      render: (t: string) => (t ? new Date(t).toLocaleDateString() : '-'),
    },
    {
      title: 'Actions',
      width: 120,
      render: (_: unknown, w: Webhook) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/webhooks/${w.id}`)}>
            Inspect
          </Button>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(w) }} />
          <Popconfirm title="Delete this webhook?" okType="danger" onConfirm={() => handleDelete(w.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>Webhooks</Title>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={openCreate}>
          New Webhook
        </Button>
      </div>

      <Table
        rowKey="id"
        dataSource={webhooks}
        columns={columns}
        loading={loading}
        size="small"
        onChange={handleTableChange}
        pagination={{
          current: page + 1,
          pageSize: 10,
          total,
          onChange: (p) => setPage(p - 1),
          showSizeChanger: false,
          showTotal: (t) => `${t} total`,
          size: 'small',
        }}
      />

      <Modal
        title={editWebhook ? 'Edit Webhook' : 'New Webhook'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editWebhook ? 'Save' : 'Create'}
        width={520}
      >
        <Form form={form} layout="vertical" size="small" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Payment Callback" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
          <Form.Item name="defaultResponseStatus" label="Default Response Status">
            <InputNumber min={100} max={599} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="defaultResponseBody" label="Default Response Body">
            <Input.TextArea rows={3} placeholder='e.g. {"status":"ok"}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
          <div style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 12 }}>Response Headers</Text>
          </div>
          <KeyValueEditor value={modalHeaders} onChange={setModalHeaders} />
        </Form>
      </Modal>
    </div>
  )
}

// ────────────────── Webhook Detail View ──────────────────

function WebhookDetailView({ webhookId }: { webhookId: string }) {
  const navigate = useNavigate()
  const [webhook, setWebhook] = useState<Webhook | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [sseConnected, setSseConnected] = useState(false)

  // Request list + detail
  const [requests, setRequests] = useState<WebhookRequestLog[]>([])
  const [reqPage, setReqPage] = useState(0)
  const [reqTotal, setReqTotal] = useState(0)
  const [reqLoading, setReqLoading] = useState(false)
  const [selectedReq, setSelectedReq] = useState<WebhookRequestLog | null>(null)

  // Response config editing
  const [editingResponse, setEditingResponse] = useState(false)
  const [respStatus, setRespStatus] = useState(200)
  const [respBody, setRespBody] = useState('')
  const [respHeaders, setRespHeaders] = useState<KvRow[]>([])
  const [savingResp, setSavingResp] = useState(false)

  const sseCleanupRef = useRef<(() => void) | null>(null)

  const loadWebhook = useCallback(async () => {
    setLoading(true)
    try {
      const [wh, urlRes] = await Promise.all([
        webhookApi.get(webhookId),
        webhookApi.getUrl(webhookId),
      ])
      setWebhook(wh)
      setWebhookUrl(urlRes.url)
      setRespStatus(wh.defaultResponseStatus)
      setRespBody(wh.defaultResponseBody || '')
      setRespHeaders(
        (wh.defaultResponseHeaders || []).map((h) => ({ _clientId: genKvId(), key: h.key, value: h.value })),
      )
    } catch {
      message.error('Failed to load webhook')
    } finally {
      setLoading(false)
    }
  }, [webhookId])

  const loadRequests = useCallback(async (page = 0) => {
    setReqLoading(true)
    try {
      const res = await webhookApi.getRequests(webhookId, { page, size: 20 })
      setRequests(res.content)
      setReqTotal(res.totalElements)
      setReqPage(page)
    } catch {
      message.error('Failed to load requests')
    } finally {
      setReqLoading(false)
    }
  }, [webhookId])

  useEffect(() => {
    loadWebhook()
    loadRequests(0)
  }, [loadWebhook, loadRequests])

  // SSE connection
  useEffect(() => {
    const cleanup = webhookApi.streamRequests(
      webhookId,
      (log) => {
        setRequests((prev) => {
          const next = [log, ...prev]
          return next.slice(0, 20) // Keep max 20 in view
        })
        setReqTotal((prev) => prev + 1)
      },
      () => {
        setSseConnected(false)
      },
    )
    sseCleanupRef.current = cleanup
    setSseConnected(true)

    return () => {
      cleanup()
      setSseConnected(false)
    }
  }, [webhookId])

  const handleToggle = async (enabled: boolean) => {
    setToggling(true)
    try {
      const wh = await webhookApi.toggleStatus(webhookId, enabled)
      setWebhook(wh)
      message.success(enabled ? 'Webhook enabled' : 'Webhook disabled')
    } catch {
      message.error('Failed to toggle')
    } finally {
      setToggling(false)
    }
  }

  const handleClearRequests = async () => {
    try {
      await webhookApi.clearRequests(webhookId)
      setRequests([])
      setReqTotal(0)
      setSelectedReq(null)
      message.success('Requests cleared')
    } catch {
      message.error('Failed to clear requests')
    }
  }

  const handleSaveResponse = async () => {
    if (!webhook) return
    setSavingResp(true)
    try {
      const data: WebhookRequest = {
        name: webhook.name,
        description: webhook.description,
        defaultResponseStatus: respStatus,
        defaultResponseBody: respBody || undefined,
        defaultResponseHeaders: respHeaders
          .filter((h) => h.key.trim())
          .map((h) => ({ key: h.key.trim(), value: h.value })),
      }
      const wh = await webhookApi.update(webhookId, data)
      setWebhook(wh)
      setEditingResponse(false)
      message.success('Response config saved')
    } catch (err: any) {
      if (err?.response?.data?.error) message.error(err.response.data.error)
      else message.error('Failed to save')
    } finally {
      setSavingResp(false)
    }
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    message.success('URL copied')
  }

  const reqColumns = [
    {
      title: 'Method',
      dataIndex: 'httpMethod',
      width: 70,
      render: (m: string) => (
        <Tag color={METHOD_COLORS[m] || '#8c8c8c'} style={{ fontWeight: 600, fontSize: 11 }}>{m}</Tag>
      ),
    },
    {
      title: 'Path',
      dataIndex: 'requestPath',
      ellipsis: true,
      render: (p: string) => <Text code style={{ fontSize: 11 }}>{p}</Text>,
    },
    {
      title: 'IP',
      dataIndex: 'sourceIp',
      width: 120,
      ellipsis: true,
      render: (ip: string) => <Text type="secondary" style={{ fontSize: 11 }}>{ip || '-'}</Text>,
    },
    {
      title: 'Time',
      dataIndex: 'createdAt',
      width: 140,
      render: (t: string) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {t ? new Date(t).toLocaleTimeString() : '-'}
        </Text>
      ),
    },
  ]

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading...</div>

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/webhooks')} type="text" size="small" />
        <Title level={5} style={{ margin: 0 }}>{webhook?.name || 'Webhook'}</Title>
        {webhook?.description && <Text type="secondary" style={{ fontSize: 12 }}>— {webhook.description}</Text>}
        <div style={{ flex: 1 }} />
        <Space size="middle">
          {/* Live indicator */}
          <Tooltip title={sseConnected ? 'Live — receiving requests in real-time' : 'Disconnected'}>
            <Badge
              status={sseConnected ? 'processing' : 'default'}
              text={<Text style={{ fontSize: 12 }}>{sseConnected ? 'Live' : 'Offline'}</Text>}
            />
          </Tooltip>

          {/* Webhook URL */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px',
          }}>
            <LinkOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
            <Text style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 300 }} ellipsis>
              {webhookUrl}
            </Text>
            <Button size="small" type="text" icon={<CopyOutlined />} onClick={copyUrl} style={{ marginLeft: 2 }} />
          </div>

          <Space size={4}>
            <Text style={{ fontSize: 12 }}>Enabled</Text>
            <Switch size="small" checked={webhook?.enabled} onChange={handleToggle} loading={toggling} />
          </Space>
        </Space>
      </div>

      {/* Response Config (collapsible) */}
      <div style={{
        border: '1px solid #f0f0f0',
        borderLeft: '3px solid #13c2c2',
        borderRadius: 4,
        padding: editingResponse ? 12 : '6px 12px',
        marginBottom: 12,
        background: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, background: '#13c2c2', color: '#fff',
            borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600,
          }}>R</div>
          <Text strong style={{ fontSize: 12 }}>Response Config</Text>
          <Tag style={{ fontSize: 11 }}>{webhook?.defaultResponseStatus || 200}</Tag>
          <div style={{ flex: 1 }} />
          {!editingResponse && (
            <Button size="small" type="link" onClick={() => setEditingResponse(true)}>
              Edit
            </Button>
          )}
        </div>
        {editingResponse && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ textTransform: 'uppercase', color: '#8c8c8c', fontSize: 11, fontWeight: 500, letterSpacing: 0.3, marginBottom: 4 }}>
                  STATUS CODE
                </div>
                <InputNumber size="small" min={100} max={599} value={respStatus} onChange={(v) => setRespStatus(v || 200)} style={{ width: 100 }} />
              </div>
            </div>
            <div style={{ textTransform: 'uppercase', color: '#8c8c8c', fontSize: 11, fontWeight: 500, letterSpacing: 0.3, marginBottom: 4 }}>
              RESPONSE BODY
            </div>
            <Input.TextArea
              size="small"
              rows={3}
              value={respBody}
              onChange={(e) => setRespBody(e.target.value)}
              placeholder='e.g. {"status":"ok"}'
              style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}
            />
            <div style={{ textTransform: 'uppercase', color: '#8c8c8c', fontSize: 11, fontWeight: 500, letterSpacing: 0.3, marginBottom: 4 }}>
              RESPONSE HEADERS
            </div>
            <KeyValueEditor value={respHeaders} onChange={setRespHeaders} />
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => {
                setEditingResponse(false)
                if (webhook) {
                  setRespStatus(webhook.defaultResponseStatus)
                  setRespBody(webhook.defaultResponseBody || '')
                  setRespHeaders(
                    (webhook.defaultResponseHeaders || []).map((h) => ({ _clientId: genKvId(), key: h.key, value: h.value })),
                  )
                }
              }}>
                Cancel
              </Button>
              <Button size="small" type="primary" loading={savingResp} onClick={handleSaveResponse}>
                Save Response Config
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Response Rules */}
      {webhook && (
        <ResponseRulesEditor
          webhookId={webhookId}
          initialRules={webhook.responseRules || []}
          onSaved={(wh) => setWebhook(wh)}
        />
      )}

      {/* Two-panel layout */}
      <div style={{ display: 'flex', gap: 12, minHeight: 400 }}>
        {/* Left: Request list (40%) */}
        <div style={{ flex: '0 0 40%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 12 }}>Incoming Requests</Text>
            <Space size={4}>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => loadRequests(reqPage)}>
                Refresh
              </Button>
              <Popconfirm title="Clear all requests?" okType="danger" onConfirm={handleClearRequests}>
                <Button size="small" danger icon={<ClearOutlined />}>Clear</Button>
              </Popconfirm>
            </Space>
          </div>
          <Table
            rowKey="id"
            dataSource={requests}
            columns={reqColumns}
            loading={reqLoading}
            size="small"
            onRow={(record) => ({
              onClick: () => setSelectedReq(record),
              style: {
                cursor: 'pointer',
                background: selectedReq?.id === record.id ? '#e6f4ff' : undefined,
              },
            })}
            pagination={{
              current: reqPage + 1,
              pageSize: 20,
              total: reqTotal,
              onChange: (p) => loadRequests(p - 1),
              showSizeChanger: false,
              size: 'small',
              showTotal: (t) => `${t} total`,
            }}
          />
        </div>

        {/* Right: Selected request detail (60%) */}
        <div style={{
          flex: 1,
          border: '1px solid #f0f0f0',
          borderRadius: 4,
          background: '#fff',
          padding: 12,
          overflow: 'auto',
        }}>
          {selectedReq ? (
            <RequestDetail log={selectedReq} />
          ) : (
            <Empty
              description="Select a request to view details"
              style={{ paddingTop: 80 }}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────── Request Detail ──────────────────

function RequestDetail({ log }: { log: WebhookRequestLog }) {
  const sectionLabel: React.CSSProperties = {
    textTransform: 'uppercase',
    color: '#8c8c8c',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.3,
    marginTop: 14,
    marginBottom: 4,
  }

  const codeBlock: React.CSSProperties = {
    background: '#fafafa',
    border: '1px solid #f0f0f0',
    borderRadius: 4,
    padding: 8,
    fontSize: 12,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: 300,
    overflow: 'auto',
  }

  const parseJson = (s: string | undefined | null): string => {
    if (!s) return ''
    try {
      return JSON.stringify(JSON.parse(s), null, 2)
    } catch {
      return s
    }
  }

  const isBinaryBody = log.contentType && (
    log.contentType.startsWith('image/') ||
    log.contentType.startsWith('audio/') ||
    log.contentType.startsWith('video/') ||
    log.contentType === 'application/octet-stream' ||
    log.contentType === 'application/pdf'
  )

  const isImage = log.contentType?.startsWith('image/')

  const files = log.files ? (() => {
    try { return JSON.parse(log.files) as { filename: string; contentType: string; size: number; contentBase64: string }[] }
    catch { return [] }
  })() : []

  return (
    <div>
      {/* Header line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Tag color={METHOD_COLORS[log.httpMethod] || '#8c8c8c'} style={{ fontWeight: 600, fontSize: 12 }}>
          {log.httpMethod}
        </Tag>
        <Text code style={{ fontSize: 12 }}>{log.requestPath}</Text>
        <div style={{ flex: 1 }} />
        {log.sourceIp && <Text type="secondary" style={{ fontSize: 11 }}>from {log.sourceIp}</Text>}
        <Text type="secondary" style={{ fontSize: 11 }}>
          {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
        </Text>
      </div>

      {log.contentType && (
        <div style={{ marginTop: 6 }}>
          <Tag style={{ fontSize: 10 }}>{log.contentType}</Tag>
          {log.contentLength != null && log.contentLength > 0 && (
            <Tag style={{ fontSize: 10 }}>{formatBytes(log.contentLength)}</Tag>
          )}
          {log.multipart && <Tag color="blue" style={{ fontSize: 10 }}>Multipart</Tag>}
        </div>
      )}

      {/* Matched Rule */}
      <div style={{ marginTop: 6 }}>
        {log.matchedRuleName ? (
          <Tag color="purple" icon={<CheckCircleOutlined />} style={{ fontSize: 10 }}>
            Matched: {log.matchedRuleName}
          </Tag>
        ) : (
          <Tag style={{ fontSize: 10 }}>Default Response</Tag>
        )}
      </div>

      {/* REQUEST HEADERS */}
      <div style={sectionLabel}>REQUEST HEADERS</div>
      <div style={codeBlock}>{parseJson(log.requestHeaders)}</div>

      {/* QUERY PARAMS */}
      {log.queryParams && log.queryParams !== '{}' && (
        <>
          <div style={sectionLabel}>QUERY PARAMS</div>
          <div style={codeBlock}>{parseJson(log.queryParams)}</div>
        </>
      )}

      {/* REQUEST BODY */}
      {log.requestBody && (
        <>
          <div style={sectionLabel}>REQUEST BODY</div>
          {isBinaryBody ? (
            <div style={{ ...codeBlock, textAlign: 'center' }}>
              {isImage ? (
                <img
                  src={`data:${log.contentType};base64,${log.requestBody}`}
                  alt="Request body"
                  style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 4 }}
                />
              ) : (
                <Text type="secondary">
                  Binary ({log.contentType}) — {log.requestBody.length} chars base64
                </Text>
              )}
            </div>
          ) : (
            <div style={codeBlock}>{parseJson(log.requestBody)}</div>
          )}
        </>
      )}

      {/* FILES (multipart) */}
      {files.length > 0 && (
        <>
          <div style={sectionLabel}>FILES ({files.length})</div>
          <Table
            dataSource={files}
            rowKey={(_, idx) => String(idx)}
            size="small"
            pagination={false}
            columns={[
              { title: 'Filename', dataIndex: 'filename', ellipsis: true },
              { title: 'Type', dataIndex: 'contentType', width: 150 },
              {
                title: 'Size',
                dataIndex: 'size',
                width: 80,
                render: (s: number) => formatBytes(s),
              },
              {
                title: 'Actions',
                width: 100,
                render: (_: unknown, file: { filename: string; contentType: string; size: number; contentBase64: string }) => (
                  <Space size={4}>
                    {file.contentType?.startsWith('image/') && (
                      <Tooltip title="Preview">
                        <Button
                          size="small"
                          type="text"
                          icon={<EyeOutlined />}
                          onClick={() => {
                            const w = window.open('')
                            if (w) {
                              w.document.write(`<img src="data:${file.contentType};base64,${file.contentBase64}" style="max-width:100%" />`)
                              w.document.title = file.filename || 'Preview'
                            }
                          }}
                        />
                      </Tooltip>
                    )}
                    <Tooltip title="Download">
                      <Button
                        size="small"
                        type="text"
                        icon={<DownloadOutlined />}
                        onClick={() => downloadBase64File(file.contentBase64, file.filename, file.contentType)}
                      />
                    </Tooltip>
                  </Space>
                ),
              },
            ]}
          />
          {/* Inline image previews */}
          {files.filter((f) => f.contentType?.startsWith('image/')).map((file, idx) => (
            <div key={idx} style={{
              marginTop: 8, padding: 8, background: '#fafafa', border: '1px solid #f0f0f0',
              borderRadius: 4, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>{file.filename}</div>
              <img
                src={`data:${file.contentType};base64,${file.contentBase64}`}
                alt={file.filename}
                style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 4 }}
              />
            </div>
          ))}
        </>
      )}

      {/* RESPONSE */}
      <div style={sectionLabel}>RESPONSE (STATUS {log.responseStatus})</div>
      <div style={codeBlock}>{log.responseBody ? parseJson(log.responseBody) : <Text type="secondary">Empty body</Text>}</div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function downloadBase64File(base64: string, filename: string, contentType: string) {
  const byteChars = atob(base64)
  const byteNumbers = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i)
  }
  const blob = new Blob([byteNumbers], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'download'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ────────────────── Main Export ──────────────────

export default function WebhookPage() {
  const { id } = useParams<{ id: string }>()

  if (id) {
    return <WebhookDetailView webhookId={id} />
  }
  return <WebhookListView />
}
