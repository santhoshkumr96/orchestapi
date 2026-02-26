import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Button,
  Space,
  Popconfirm,
  Tag,
  message,
  Typography,
  Tooltip,
  Modal,
  Input,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
  ImportOutlined,
  SearchOutlined,
  WarningOutlined,
  CloseCircleFilled,
} from '@ant-design/icons'
import type { FilterDropdownProps } from 'antd/es/table/interface'
import type { Environment, EnvironmentRequest, PageResponse } from '../types/environment'
import { environmentApi, type EnvironmentListParams } from '../services/environmentApi'

const { Title } = Typography

const COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
  baseUrl: 'Base URL',
}

function exportEnvironment(env: Environment) {
  const payload: EnvironmentRequest = {
    name: env.name,
    baseUrl: env.baseUrl,
    variables: env.variables.map(({ key, value, secret }) => ({ key, value, secret })),
    headers: env.headers.map(({ headerKey, valueType, headerValue }) => ({
      headerKey,
      valueType,
      headerValue,
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${env.name.toLowerCase().replace(/\s+/g, '-')}-environment.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

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
        onPressEnter={() => {
          onApply(dataIndex, localValue)
          close()
        }}
        style={{ marginBottom: 8, display: 'block' }}
        size="small"
      />
      <Space>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          size="small"
          onClick={() => {
            onApply(dataIndex, localValue)
            close()
          }}
        >
          Search
        </Button>
        <Button
          size="small"
          onClick={() => {
            setLocalValue('')
            onReset(dataIndex)
            close()
          }}
        >
          Reset
        </Button>
        <Button type="link" size="small" onClick={() => close()}>
          Close
        </Button>
      </Space>
    </div>
  )
}

export default function EnvironmentsPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [data, setData] = useState<PageResponse<Environment>>({
    content: [],
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const params: EnvironmentListParams = {
          page: currentPage - 1,
          size: pageSize,
          sortBy,
          sortDir,
        }
        if (appliedFilters.name) params.name = appliedFilters.name
        if (appliedFilters.baseUrl) params.baseUrl = appliedFilters.baseUrl

        const result = await environmentApi.list(params)
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) message.error('Failed to load environments')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentPage, pageSize, sortBy, sortDir, appliedFilters, refreshKey])

  const handleDelete = async (id: string) => {
    try {
      await environmentApi.delete(id)
      message.success('Environment deleted')
      setRefreshKey((k) => k + 1)
    } catch {
      message.error('Failed to delete environment')
    }
  }

  const handleApplyFilter = (dataIndex: string, value: string) => {
    setAppliedFilters((prev) => ({ ...prev, [dataIndex]: value }))
    setCurrentPage(1)
  }

  const handleResetFilter = (dataIndex: string) => {
    setAppliedFilters((prev) => {
      const next = { ...prev }
      delete next[dataIndex]
      return next
    })
    setCurrentPage(1)
  }

  const handleClearAllFilters = () => {
    setAppliedFilters({})
    setCurrentPage(1)
  }

  // --- Import logic ---
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [pendingImport, setPendingImport] = useState<EnvironmentRequest | null>(null)

  const doImport = async (importData: EnvironmentRequest) => {
    try {
      await environmentApi.create(importData)
      message.success(`Environment "${importData.name}" imported`)
      setPendingImport(null)
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } }
        const errorMsg = axiosErr.response?.data?.error ?? ''
        if (errorMsg.toLowerCase().includes('already exists')) {
          setPendingImport(importData)
          setRenameValue(importData.name)
          setRenameModalOpen(true)
        } else {
          message.error(errorMsg || 'Import failed')
        }
      } else if (err instanceof SyntaxError) {
        message.error('Invalid JSON file')
      } else {
        message.error('Import failed')
      }
    }
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onerror = () => message.error('Failed to read file')
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as EnvironmentRequest
        if (!parsed.name || !parsed.baseUrl) {
          message.error('Invalid file: missing name or baseUrl')
          return
        }
        await doImport({
          name: parsed.name,
          baseUrl: parsed.baseUrl,
          variables: parsed.variables ?? [],
          headers: parsed.headers ?? [],
        })
      } catch (err) {
        if (err instanceof SyntaxError) {
          message.error('Invalid JSON file')
        } else {
          message.error('Import failed')
        }
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleRenameImport = async () => {
    if (!pendingImport || !renameValue.trim()) return
    const trimmedName = renameValue.trim()
    // Close modal first — doImport will reopen if the new name also conflicts
    setRenameModalOpen(false)
    await doImport({ ...pendingImport, name: trimmedName })
  }

  const columnSearchProps = (dataIndex: string) => ({
    filterDropdown: (props: FilterDropdownProps) => (
      <ColumnSearch
        dataIndex={dataIndex}
        filterDropdownProps={props}
        appliedValue={appliedFilters[dataIndex] ?? ''}
        onApply={handleApplyFilter}
        onReset={handleResetFilter}
      />
    ),
    filterIcon: () => (
      <SearchOutlined style={{ color: appliedFilters[dataIndex] ? '#1677ff' : undefined }} />
    ),
    filtered: !!appliedFilters[dataIndex],
  })

  const activeFilterEntries = Object.entries(appliedFilters).filter(([, v]) => v)

  const columns = [
    {
      title: 'S.No',
      key: 'sno',
      width: 70,
      render: (_: unknown, __: Environment, index: number) => (
        <span style={{ color: '#888' }}>{(currentPage - 1) * pageSize + index + 1}</span>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      sortOrder: sortBy === 'name' ? (sortDir === 'asc' ? ('ascend' as const) : ('descend' as const)) : null,
      ...columnSearchProps('name'),
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
      sorter: true,
      sortOrder: sortBy === 'baseUrl' ? (sortDir === 'asc' ? ('ascend' as const) : ('descend' as const)) : null,
      ...columnSearchProps('baseUrl'),
    },
    {
      title: 'Variables',
      dataIndex: 'variables',
      key: 'variables',
      width: 100,
      render: (vars: Environment['variables']) => (
        <Space>
          <Tag>{vars.length}</Tag>
          {vars.some((v) => v.secret) && <Tag color="orange">secrets</Tag>}
        </Space>
      ),
    },
    {
      title: 'Headers',
      dataIndex: 'headers',
      key: 'headers',
      width: 80,
      render: (hdrs: Environment['headers']) => <Tag>{hdrs.length}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: Environment) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Space>
            <Tooltip title="Edit">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => navigate(`/environments/${record.id}`)}
              />
            </Tooltip>
            <Tooltip title="Export">
              <Button
                type="text"
                icon={<ExportOutlined />}
                onClick={() => exportEnvironment(record)}
              />
            </Tooltip>
            <Popconfirm
              title="Delete this environment?"
              onConfirm={() => handleDelete(record.id)}
              okText="Delete"
              okType="danger"
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>
          Environments
        </Title>
        <Space>
          <Button
            icon={<ImportOutlined />}
            onClick={() => fileInputRef.current?.click()}
          >
            Import
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/environments/new')}
          >
            New Environment
          </Button>
        </Space>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImport}
        aria-label="Import environment JSON file"
      />

      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            Name already exists
          </Space>
        }
        open={renameModalOpen}
        onOk={handleRenameImport}
        onCancel={() => {
          setRenameModalOpen(false)
          setPendingImport(null)
        }}
        okText="Import"
      >
        <p>
          An environment named <strong>{pendingImport?.name}</strong> already exists.
          Please enter a new name:
        </p>
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="New environment name"
          onPressEnter={handleRenameImport}
          autoFocus
        />
      </Modal>

      {activeFilterEntries.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: '#888', fontSize: 13 }}>Filters:</span>
          {activeFilterEntries.map(([key, value]) => (
            <Tag
              key={key}
              closable
              onClose={() => handleResetFilter(key)}
              color="blue"
              style={{ fontSize: 13 }}
            >
              {COLUMN_LABELS[key] ?? key}: {value}
            </Tag>
          ))}
          {activeFilterEntries.length > 1 && (
            <Button
              type="link"
              size="small"
              icon={<CloseCircleFilled />}
              onClick={handleClearAllFilters}
              style={{ fontSize: 12, padding: 0 }}
            >
              Clear all
            </Button>
          )}
        </div>
      )}

      <Table
        columns={columns}
        dataSource={data.content}
        rowKey="id"
        loading={loading}
        style={{ background: '#fff', borderRadius: 8, padding: '0 0 8px' }}
        onRow={(record) => ({
          onClick: () => navigate(`/environments/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: currentPage,
          pageSize,
          total: data.totalElements,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
          style: { padding: '0 16px' },
        }}
        onChange={(pagination, _filters, sorter) => {
          setCurrentPage(pagination.current ?? 1)
          setPageSize(pagination.pageSize ?? 10)
          if (!Array.isArray(sorter)) {
            if (sorter.field && sorter.order) {
              setSortBy(sorter.field as string)
              setSortDir(sorter.order === 'descend' ? 'desc' : 'asc')
            } else {
              // Sort cleared — reset to default
              setSortBy('name')
              setSortDir('asc')
            }
          }
        }}
      />
    </div>
  )
}
