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
  Input,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  CloseCircleFilled,
} from '@ant-design/icons'
import type { FilterDropdownProps } from 'antd/es/table/interface'
import type { TestSuite, TestSuiteListParams } from '../types/testSuite'
import type { PageResponse } from '../types/environment'
import { testSuiteApi } from '../services/testSuiteApi'

const { Title } = Typography

const COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
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

export default function TestSuitesPage() {
  const navigate = useNavigate()

  const [data, setData] = useState<PageResponse<TestSuite>>({
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
        const params: TestSuiteListParams = {
          page: currentPage - 1,
          size: pageSize,
          sortBy,
          sortDir,
        }
        if (appliedFilters.name) params.name = appliedFilters.name

        const result = await testSuiteApi.list(params)
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) message.error('Failed to load test suites')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentPage, pageSize, sortBy, sortDir, appliedFilters, refreshKey])

  const handleDelete = async (id: string) => {
    try {
      await testSuiteApi.delete(id)
      message.success('Test suite deleted')
      setRefreshKey((k) => k + 1)
    } catch {
      message.error('Failed to delete test suite')
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
      render: (_: unknown, __: TestSuite, index: number) => (
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
      title: 'Steps',
      dataIndex: 'stepCount',
      key: 'stepCount',
      width: 80,
      render: (stepCount: number) => <Tag>{stepCount}</Tag>,
    },
    {
      title: 'Updated At',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      sorter: true,
      sortOrder: sortBy === 'updatedAt' ? (sortDir === 'asc' ? ('ascend' as const) : ('descend' as const)) : null,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: TestSuite) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Space>
            <Tooltip title="Edit">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => navigate(`/test-suites/${record.id}`)}
              />
            </Tooltip>
            <Popconfirm
              title="Delete this test suite?"
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
          Test Suites
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/test-suites/new')}
        >
          New Suite
        </Button>
      </div>

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
          onClick: () => navigate(`/test-suites/${record.id}`),
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
