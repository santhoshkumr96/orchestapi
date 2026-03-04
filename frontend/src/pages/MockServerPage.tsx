import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Table,
  Button,
  Space,
  Tag,
  message,
  Typography,
  Tabs,
  Switch,
  Popconfirm,
  Drawer,
  Collapse,
  Empty,
  Input,
  Modal,
  Form,
  Tooltip,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  ClearOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ApiOutlined,
  SearchOutlined,
  CloseCircleFilled,
} from '@ant-design/icons'
import type { FilterDropdownProps } from 'antd/es/table/interface'
import { useParams, useNavigate } from 'react-router-dom'
import type { MockServer, MockEndpoint, MockRequestLog, MockServerStatus } from '../types/mock'
import { mockApi } from '../services/mockApi'
import MockEndpointEditor from '../components/MockEndpointEditor'

const { Title, Text } = Typography

const METHOD_COLORS: Record<string, string> = {
  GET: '#52c41a',
  POST: '#1677ff',
  PUT: '#fa8c16',
  DELETE: '#ff4d4f',
  PATCH: '#722ed1',
  ANY: '#8c8c8c',
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

// ────────────────── Mock Server List View ──────────────────

function ServerListView() {
  const navigate = useNavigate()
  const [servers, setServers] = useState<MockServer[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editServer, setEditServer] = useState<MockServer | null>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await mockApi.listServers({
        page,
        size: 10,
        sortBy,
        sortDir,
        name: filters.name || undefined,
        description: filters.description || undefined,
      })
      setServers(res.content)
      setTotal(res.totalElements)
    } catch {
      message.error('Failed to load mock servers')
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
    setEditServer(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (s: MockServer) => {
    setEditServer(s)
    form.setFieldsValue({ name: s.name, description: s.description || '' })
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editServer) {
        await mockApi.updateServer(editServer.id, values)
        message.success('Mock server updated')
      } else {
        await mockApi.createServer(values)
        message.success('Mock server created')
      }
      setModalOpen(false)
      load()
    } catch (err: any) {
      if (err?.response?.data?.message) message.error(err.response.data.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await mockApi.deleteServer(id)
      message.success('Mock server deleted')
      load()
    } catch {
      message.error('Failed to delete')
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await mockApi.toggleStatus(id, enabled)
      setServers((prev) => prev.map((s) => s.id === id ? { ...s, enabled } : s))
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
      render: (name: string, s: MockServer) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/mock-server/${s.id}`)}>
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
      title: 'Endpoints',
      dataIndex: 'endpointCount',
      width: 90,
      align: 'center' as const,
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      width: 90,
      render: (enabled: boolean, s: MockServer) => (
        <Switch size="small" checked={enabled} onChange={(v) => handleToggle(s.id, v)} />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 150,
      sorter: true,
      render: (t: string) => t ? new Date(t).toLocaleDateString() : '-',
    },
    {
      title: 'Actions',
      width: 120,
      render: (_: unknown, s: MockServer) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/mock-server/${s.id}`)}>
            Configure
          </Button>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(s) }} />
          <Popconfirm title="Delete this mock server?" okType="danger" onConfirm={() => handleDelete(s.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={openCreate}>
          New Mock Server
        </Button>
      </div>

      <Table
        rowKey="id"
        dataSource={servers}
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
        title={editServer ? 'Edit Mock Server' : 'New Mock Server'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editServer ? 'Save' : 'Create'}
        width={440}
      >
        <Form form={form} layout="vertical" size="small" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Payment Service Mock" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ────────────────── Server Detail View ──────────────────

function ServerDetailView({ serverId }: { serverId: string }) {
  const navigate = useNavigate()
  const [server, setServer] = useState<MockServer | null>(null)
  const [status, setStatus] = useState<MockServerStatus | null>(null)
  const [endpoints, setEndpoints] = useState<MockEndpoint[]>([])
  const [logs, setLogs] = useState<MockRequestLog[]>([])
  const [logPage, setLogPage] = useState(0)
  const [logTotal, setLogTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [logDrawer, setLogDrawer] = useState<MockRequestLog | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [srv, st, eps] = await Promise.all([
        mockApi.getServer(serverId),
        mockApi.getStatusInfo(serverId),
        mockApi.listEndpoints(serverId),
      ])
      setServer(srv)
      setStatus(st)
      setEndpoints(eps)
    } catch {
      message.error('Failed to load mock server data')
    } finally {
      setLoading(false)
    }
  }, [serverId])

  const loadLogs = useCallback(async (page = 0) => {
    setLogsLoading(true)
    try {
      const res = await mockApi.getLogs(serverId, { page, size: 20 })
      setLogs(res.content)
      setLogTotal(res.totalElements)
      setLogPage(page)
    } catch {
      message.error('Failed to load request logs')
    } finally {
      setLogsLoading(false)
    }
  }, [serverId])

  useEffect(() => { loadAll() }, [loadAll])

  const handleToggle = async (enabled: boolean) => {
    setToggling(true)
    try {
      const srv = await mockApi.toggleStatus(serverId, enabled)
      setServer(srv)
      const st = await mockApi.getStatusInfo(serverId)
      setStatus(st)
      message.success(enabled ? 'Mock server enabled' : 'Mock server disabled')
    } catch {
      message.error('Failed to toggle mock server')
    } finally {
      setToggling(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await mockApi.deleteEndpoint(serverId, id)
      message.success('Endpoint deleted')
      setEndpoints((prev) => prev.filter((e) => e.id !== id))
      const st = await mockApi.getStatusInfo(serverId)
      setStatus(st)
    } catch {
      message.error('Failed to delete endpoint')
    }
  }

  const handleSaved = async () => {
    setAddingNew(false)
    setExpandedEndpoint(null)
    await loadAll()
  }

  const handleClearLogs = async () => {
    try {
      await mockApi.clearLogs(serverId)
      setLogs([])
      setLogTotal(0)
      message.success('Logs cleared')
    } catch {
      message.error('Failed to clear logs')
    }
  }

  const logColumns = [
    {
      title: 'S.No',
      width: 50,
      render: (_: unknown, __: unknown, idx: number) => logPage * 20 + idx + 1,
    },
    {
      title: 'Method',
      dataIndex: 'httpMethod',
      width: 80,
      render: (m: string) => (
        <Tag color={METHOD_COLORS[m] || '#8c8c8c'} style={{ fontWeight: 600, fontSize: 11 }}>{m}</Tag>
      ),
    },
    {
      title: 'Path',
      dataIndex: 'requestPath',
      ellipsis: true,
    },
    {
      title: 'Matched',
      dataIndex: 'matched',
      width: 80,
      render: (v: boolean) => v
        ? <CheckCircleOutlined style={{ color: '#389e0d' }} />
        : <CloseCircleOutlined style={{ color: '#cf1322' }} />,
    },
    {
      title: 'Status',
      dataIndex: 'responseStatus',
      width: 70,
      render: (s: number) => {
        const color = s < 300 ? '#389e0d' : s < 400 ? '#fa8c16' : '#cf1322'
        return <span style={{ color, fontWeight: 600 }}>{s}</span>
      },
    },
    {
      title: 'Duration',
      dataIndex: 'durationMs',
      width: 80,
      render: (ms: number) => ms != null ? `${ms}ms` : '-',
    },
    {
      title: 'Time',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => t ? new Date(t).toLocaleString() : '-',
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, log: MockRequestLog) => (
        <Button size="small" type="link" onClick={() => setLogDrawer(log)}>View</Button>
      ),
    },
  ]

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/mock-server')} type="text" size="small" />
        <Title level={5} className="page-title">{server?.name || 'Mock Server'}</Title>
        {server?.description && <Text type="secondary" style={{ fontSize: 12 }}>— {server.description}</Text>}
        <div style={{ flex: 1 }} />
        {status && (
          <Space size="middle">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 10px',
            }}>
              <ApiOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
              <Text copyable={{ text: status.mockUrl }} style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {status.mockUrl}
              </Text>
            </div>
            <Space size={4}>
              <Text style={{ fontSize: 12 }}>Enabled</Text>
              <Switch
                size="small"
                checked={server?.enabled}
                onChange={handleToggle}
                loading={toggling}
              />
            </Space>
          </Space>
        )}
      </div>

      <Tabs
        defaultActiveKey="endpoints"
        onChange={(key) => { if (key === 'logs') loadLogs(0) }}
        items={[
          {
            key: 'endpoints',
            label: `Endpoints (${endpoints.length})`,
            children: (
              <div>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="small"
                    onClick={() => { setAddingNew(true); setExpandedEndpoint(null) }}
                  >
                    Add Endpoint
                  </Button>
                </div>

                {addingNew && (
                  <div style={{
                    border: '1px dashed #1677ff', borderRadius: 6, padding: 12, marginBottom: 12,
                    background: '#fafbff',
                  }}>
                    <MockEndpointEditor
                      serverId={serverId}
                      endpoint={null}
                      onSave={handleSaved}
                      onCancel={() => setAddingNew(false)}
                    />
                  </div>
                )}

                {endpoints.length === 0 && !addingNew ? (
                  <Empty
                    description="No mock endpoints configured"
                    style={{
                      padding: 40, border: '1px dashed #d9d9d9', borderRadius: 6,
                      background: '#fafafa',
                    }}
                  />
                ) : (
                  <Collapse
                    accordion
                    activeKey={expandedEndpoint ? [expandedEndpoint] : []}
                    onChange={(keys) => {
                      const k = Array.isArray(keys) ? keys[0] : keys
                      setExpandedEndpoint(k || null)
                      if (k) setAddingNew(false)
                    }}
                    items={endpoints.map((ep) => ({
                      key: ep.id,
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag
                            color={METHOD_COLORS[ep.httpMethod] || '#8c8c8c'}
                            style={{ fontWeight: 600, fontSize: 11, minWidth: 48, textAlign: 'center' }}
                          >
                            {ep.httpMethod}
                          </Tag>
                          <Text code style={{ fontSize: 12 }}>{ep.pathPattern}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{ep.name}</Text>
                          {!ep.enabled && <Tag color="default">Disabled</Tag>}
                          {ep.matchRules.length > 0 && (
                            <Tag color="blue" style={{ fontSize: 10 }}>{ep.matchRules.length} rules</Tag>
                          )}
                          {ep.delayMs > 0 && (
                            <Tag color="orange" style={{ fontSize: 10 }}>{ep.delayMs}ms delay</Tag>
                          )}
                          <div style={{ flex: 1 }} />
                          <Tag>{ep.responseStatus}</Tag>
                        </div>
                      ),
                      extra: (
                        <Popconfirm
                          title="Delete this endpoint?"
                          okType="danger"
                          onConfirm={(e) => { e?.stopPropagation(); handleDelete(ep.id) }}
                          onCancel={(e) => e?.stopPropagation()}
                        >
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Popconfirm>
                      ),
                      children: (
                        <MockEndpointEditor
                          serverId={serverId}
                          endpoint={ep}
                          onSave={handleSaved}
                          onCancel={() => setExpandedEndpoint(null)}
                        />
                      ),
                    }))}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'logs',
            label: 'Request Log',
            children: (
              <div>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => loadLogs(logPage)}>
                    Refresh
                  </Button>
                  <Popconfirm title="Clear all logs?" okType="danger" onConfirm={handleClearLogs}>
                    <Button size="small" danger icon={<ClearOutlined />}>Clear</Button>
                  </Popconfirm>
                </div>
                <Table
                  rowKey="id"
                  dataSource={logs}
                  columns={logColumns}
                  loading={logsLoading}
                  size="small"
                  pagination={{
                    current: logPage + 1,
                    pageSize: 20,
                    total: logTotal,
                    onChange: (p) => loadLogs(p - 1),
                    showSizeChanger: false,
                    size: 'small',
                  }}
                />
              </div>
            ),
          },
        ]}
      />

      {/* Log Detail Drawer */}
      <Drawer
        title="Request Detail"
        open={!!logDrawer}
        onClose={() => setLogDrawer(null)}
        width={560}
      >
        {logDrawer && <LogDetail log={logDrawer} />}
      </Drawer>
    </div>
  )
}

// ────────────────── Log Detail ──────────────────

function LogDetail({ log }: { log: MockRequestLog }) {
  const sectionLabel: React.CSSProperties = {
    textTransform: 'uppercase',
    color: '#8c8c8c',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.3,
    marginTop: 16,
    marginBottom: 6,
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

  return (
    <div>
      <Space size="middle" style={{ marginBottom: 12 }}>
        <Tag color={METHOD_COLORS[log.httpMethod] || '#8c8c8c'} style={{ fontWeight: 600 }}>{log.httpMethod}</Tag>
        <Text code>{log.requestPath}</Text>
        <Tag color={log.matched ? 'green' : 'red'}>{log.matched ? 'Matched' : 'No Match'}</Tag>
        <Text type="secondary">{log.durationMs}ms</Text>
      </Space>

      <div style={sectionLabel}>REQUEST HEADERS</div>
      <div style={codeBlock}>{parseJson(log.requestHeaders)}</div>

      {log.queryParams && log.queryParams !== '{}' && (
        <>
          <div style={sectionLabel}>QUERY PARAMS</div>
          <div style={codeBlock}>{parseJson(log.queryParams)}</div>
        </>
      )}

      {log.requestBody && (
        <>
          <div style={sectionLabel}>REQUEST BODY</div>
          <div style={codeBlock}>{parseJson(log.requestBody)}</div>
        </>
      )}

      <div style={sectionLabel}>RESPONSE (STATUS {log.responseStatus})</div>
      <div style={codeBlock}>{parseJson(log.responseBody)}</div>

      <div style={{ ...sectionLabel, marginTop: 16 }}>TIMESTAMP</div>
      <Text type="secondary" style={{ fontSize: 12 }}>{new Date(log.createdAt).toLocaleString()}</Text>
    </div>
  )
}

// ────────────────── Main Export ──────────────────

export default function MockServerPage() {
  const { serverId } = useParams<{ serverId: string }>()

  if (serverId) {
    return <ServerDetailView serverId={serverId} />
  }
  return <ServerListView />
}
