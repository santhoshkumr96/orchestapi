import { useCallback, useEffect, useRef, useState } from 'react'
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
  Select,
  DatePicker,
  Tabs,
  Drawer,
  Switch,
  Modal,
  Form,
  Spin,
} from 'antd'
import {
  EyeOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  CloseCircleFilled,
} from '@ant-design/icons'
import type { FilterDropdownProps } from 'antd/es/table/interface'
import type { Dayjs } from 'dayjs'
import cronstrue from 'cronstrue'
import type { PageResponse } from '../types/environment'
import type { TestRunResponse, RunScheduleResponse, RunScheduleRequest, CronPreviewResponse, RunListParams } from '../types/run'
import type { SuiteExecutionResult } from '../services/testSuiteApi'
import { runApi } from '../services/runApi'
import { scheduleApi } from '../services/scheduleApi'
import { testSuiteApi } from '../services/testSuiteApi'
import { environmentApi } from '../services/environmentApi'
import RunResultsPanel from '../components/RunResultsPanel'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const COLUMN_LABELS: Record<string, string> = {
  suiteName: 'Suite Name',
  environmentName: 'Environment',
}

const STATUS_TAG_COLOR: Record<string, string> = {
  SUCCESS: 'green',
  FAILURE: 'red',
  PARTIAL_FAILURE: 'orange',
  RUNNING: 'processing',
  CANCELLED: 'default',
}

const TRIGGER_TAG_COLOR: Record<string, string> = {
  MANUAL: 'default',
  SCHEDULED: 'purple',
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

// ────────────────── format helpers ──────────────────
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ────────────────── Main Component ──────────────────
export default function RunsPage() {
  // ──── Run History state ────
  const [data, setData] = useState<PageResponse<TestRunResponse>>({
    content: [],
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortBy, setSortBy] = useState('startedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  // Additional filters
  const [triggerFilter, setTriggerFilter] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  // View drawer
  const [viewDrawer, setViewDrawer] = useState<string | null>(null)
  const [viewDetail, setViewDetail] = useState<TestRunResponse | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  // ──── Schedules state ────
  const [scheduleData, setScheduleData] = useState<PageResponse<RunScheduleResponse>>({
    content: [],
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  })
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [schedulePage, setSchedulePage] = useState(1)
  const [schedulePageSize, setSchedulePageSize] = useState(10)
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0)

  // Schedule modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<RunScheduleResponse | null>(null)
  const [scheduleForm] = Form.useForm()
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false)

  // Dropdown options for schedule modal
  const [suiteOptions, setSuiteOptions] = useState<{ value: string; label: string }[]>([])
  const [envOptions, setEnvOptions] = useState<{ value: string; label: string }[]>([])

  // Cron preview
  const [cronValue, setCronValue] = useState('')
  const [cronPreview, setCronPreview] = useState<CronPreviewResponse | null>(null)
  const [cronPreviewLoading, setCronPreviewLoading] = useState(false)
  const cronDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ──── Run History: data fetch ────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const params: RunListParams = {
          page: currentPage - 1,
          size: pageSize,
          sortBy,
          sortDir,
        }
        if (appliedFilters.suiteName) params.suiteName = appliedFilters.suiteName
        if (triggerFilter) params.triggerType = triggerFilter
        if (dateRange && dateRange[0]) params.from = dateRange[0].startOf('day').toISOString()
        if (dateRange && dateRange[1]) params.to = dateRange[1].endOf('day').toISOString()

        const result = await runApi.list(params)
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) message.error('Failed to load runs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentPage, pageSize, sortBy, sortDir, appliedFilters, refreshKey, triggerFilter, dateRange])

  // ──── Schedules: data fetch ────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setScheduleLoading(true)
      try {
        const result = await scheduleApi.list({
          page: schedulePage - 1,
          size: schedulePageSize,
        })
        if (!cancelled) setScheduleData(result)
      } catch {
        if (!cancelled) message.error('Failed to load schedules')
      } finally {
        if (!cancelled) setScheduleLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [schedulePage, schedulePageSize, scheduleRefreshKey])

  // ──── Load dropdown options for schedule modal ────
  const loadDropdownOptions = useCallback(async () => {
    try {
      const [suitesRes, envsRes] = await Promise.all([
        testSuiteApi.list({ size: 1000 }),
        environmentApi.list({ size: 1000 }),
      ])
      setSuiteOptions(suitesRes.content.map((s) => ({ value: s.id, label: s.name })))
      setEnvOptions(envsRes.content.map((e) => ({ value: e.id, label: e.name })))
    } catch {
      message.error('Failed to load dropdown options')
    }
  }, [])

  // ──── Run History: handlers ────
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
    setTriggerFilter(undefined)
    setDateRange(null)
    setCurrentPage(1)
  }

  const handleViewRun = async (id: string) => {
    setViewDrawer(id)
    setViewLoading(true)
    setViewDetail(null)
    try {
      const detail = await runApi.get(id)
      setViewDetail(detail)
    } catch {
      message.error('Failed to load run details')
      setViewDrawer(null)
    } finally {
      setViewLoading(false)
    }
  }

  const handleExportRun = async (id: string) => {
    try {
      const exportData = await runApi.export(id)
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `run-${id}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch {
      message.error('Failed to export run')
    }
  }

  const handleDeleteRun = async (id: string) => {
    try {
      await runApi.delete(id)
      message.success('Run deleted')
      setRefreshKey((k) => k + 1)
    } catch {
      message.error('Failed to delete run')
    }
  }

  // ──── Schedule: handlers ────
  const handleToggleSchedule = async (id: string) => {
    // Optimistic update
    setScheduleData((prev) => ({
      ...prev,
      content: prev.content.map((s) =>
        s.id === id ? { ...s, active: !s.active } : s,
      ),
    }))
    try {
      await scheduleApi.toggle(id)
    } catch {
      message.error('Failed to toggle schedule')
      setScheduleRefreshKey((k) => k + 1) // revert by refetching
    }
  }

  const handleDeleteSchedule = async (id: string) => {
    try {
      await scheduleApi.delete(id)
      message.success('Schedule deleted')
      setScheduleRefreshKey((k) => k + 1)
    } catch {
      message.error('Failed to delete schedule')
    }
  }

  const openScheduleModal = (schedule?: RunScheduleResponse) => {
    setEditingSchedule(schedule ?? null)
    if (schedule) {
      scheduleForm.setFieldsValue({
        suiteId: schedule.suiteId,
        environmentId: schedule.environmentId,
        cronExpression: schedule.cronExpression,
        description: schedule.description ?? '',
      })
      setCronValue(schedule.cronExpression)
    } else {
      scheduleForm.resetFields()
      setCronValue('')
    }
    setCronPreview(null)
    setScheduleModalOpen(true)
    loadDropdownOptions()
  }

  const handleScheduleSubmit = async () => {
    try {
      const values = await scheduleForm.validateFields()
      setScheduleSubmitting(true)
      const payload: RunScheduleRequest = {
        suiteId: values.suiteId,
        environmentId: values.environmentId,
        cronExpression: values.cronExpression,
        description: values.description || undefined,
      }
      if (editingSchedule) {
        await scheduleApi.update(editingSchedule.id, payload)
        message.success('Schedule updated')
      } else {
        await scheduleApi.create(payload)
        message.success('Schedule created')
      }
      setScheduleModalOpen(false)
      setScheduleRefreshKey((k) => k + 1)
    } catch (err) {
      // Validation errors are handled by the form; only show API errors
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } }
        message.error(axiosErr.response?.data?.error || 'Failed to save schedule')
      }
    } finally {
      setScheduleSubmitting(false)
    }
  }

  // ──── Cron preview with debounce ────
  const handleCronChange = (val: string) => {
    setCronValue(val)
    scheduleForm.setFieldsValue({ cronExpression: val })

    if (cronDebounceRef.current) clearTimeout(cronDebounceRef.current)
    if (!val.trim()) {
      setCronPreview(null)
      return
    }
    cronDebounceRef.current = setTimeout(async () => {
      setCronPreviewLoading(true)
      try {
        const preview = await scheduleApi.preview(val)
        setCronPreview(preview)
      } catch {
        setCronPreview(null)
      } finally {
        setCronPreviewLoading(false)
      }
    }, 500)
  }

  // ──── Column search props factory ────
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

  // ──── Active filter entries (column search + trigger + date) ────
  const activeFilterEntries = Object.entries(appliedFilters).filter(([, v]) => v)
  const hasAdditionalFilters = !!triggerFilter || (dateRange && (dateRange[0] || dateRange[1]))
  const hasAnyFilter = activeFilterEntries.length > 0 || hasAdditionalFilters

  // ──── Cron readable text helper ────
  // cronstrue expects 5-field (standard) or 6-field (with seconds) cron.
  // We accept both formats — normalize for display.
  let cronReadable: { text: string; error: boolean } = { text: '', error: false }
  if (cronValue.trim()) {
    try {
      cronReadable = { text: cronstrue.toString(cronValue.trim()), error: false }
    } catch {
      cronReadable = { text: 'Invalid expression', error: true }
    }
  }

  // ──── Run History columns ────
  const runColumns = [
    {
      title: 'S.No',
      key: 'sno',
      width: 60,
      render: (_: unknown, __: TestRunResponse, index: number) => (
        <span style={{ color: '#888' }}>{(currentPage - 1) * pageSize + index + 1}</span>
      ),
    },
    {
      title: 'Suite Name',
      dataIndex: 'suiteName',
      key: 'suiteName',
      ...columnSearchProps('suiteName'),
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Environment',
      dataIndex: 'environmentName',
      key: 'environmentName',
      ...columnSearchProps('environmentName'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: TestRunResponse['status']) => (
        <Tag color={STATUS_TAG_COLOR[status] ?? 'default'}>{status.replace('_', ' ')}</Tag>
      ),
    },
    {
      title: 'Trigger',
      dataIndex: 'triggerType',
      key: 'triggerType',
      width: 100,
      render: (trigger: TestRunResponse['triggerType']) => (
        <Tag color={TRIGGER_TAG_COLOR[trigger] ?? 'default'}>{trigger}</Tag>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'totalDurationMs',
      key: 'totalDurationMs',
      width: 100,
      sorter: true,
      sortOrder: sortBy === 'totalDurationMs' ? (sortDir === 'asc' ? ('ascend' as const) : ('descend' as const)) : null,
      render: (ms: number) => (ms != null ? formatDuration(ms) : '\u2014'),
    },
    {
      title: 'Started At',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 170,
      sorter: true,
      sortOrder: sortBy === 'startedAt' ? (sortDir === 'asc' ? ('ascend' as const) : ('descend' as const)) : null,
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : '\u2014'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: TestRunResponse) => (
        <Space>
          <Tooltip title="View">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewRun(record.id)}
            />
          </Tooltip>
          <Tooltip title="Export">
            <Button
              type="text"
              icon={<DownloadOutlined />}
              onClick={() => handleExportRun(record.id)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this run?"
            onConfirm={() => handleDeleteRun(record.id)}
            okText="Delete"
            okType="danger"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // ──── Schedules columns ────
  const scheduleColumns = [
    {
      title: 'S.No',
      key: 'sno',
      width: 60,
      render: (_: unknown, __: RunScheduleResponse, index: number) => (
        <span style={{ color: '#888' }}>{(schedulePage - 1) * schedulePageSize + index + 1}</span>
      ),
    },
    {
      title: 'Suite Name',
      dataIndex: 'suiteName',
      key: 'suiteName',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Environment',
      dataIndex: 'environmentName',
      key: 'environmentName',
    },
    {
      title: 'Cron',
      dataIndex: 'cronExpression',
      key: 'cronExpression',
      width: 160,
      render: (text: string) => (
        <code style={{ fontSize: 12, background: '#f5f5f5', padding: '2px 6px', borderRadius: 3 }}>
          {text}
        </code>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string | null) => text || '\u2014',
    },
    {
      title: 'Next Run',
      dataIndex: 'nextRunAt',
      key: 'nextRunAt',
      width: 170,
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : '\u2014'),
    },
    {
      title: 'Last Run',
      dataIndex: 'lastRunAt',
      key: 'lastRunAt',
      width: 170,
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : 'Never'),
    },
    {
      title: 'Active',
      key: 'active',
      width: 70,
      render: (_: unknown, record: RunScheduleResponse) => (
        <Switch
          checked={record.active}
          onChange={() => handleToggleSchedule(record.id)}
          size="small"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: RunScheduleResponse) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openScheduleModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this schedule?"
            onConfirm={() => handleDeleteSchedule(record.id)}
            okText="Delete"
            okType="danger"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // ──── Render ────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>Runs</Title>
      </div>

      <Tabs
        defaultActiveKey="history"
        items={[
          {
            key: 'history',
            label: 'Run History',
            children: (
              <div>
                {/* Additional filters row */}
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Select
                    placeholder="Trigger type"
                    value={triggerFilter}
                    onChange={(val) => { setTriggerFilter(val || undefined); setCurrentPage(1) }}
                    allowClear
                    style={{ width: 150 }}
                    size="small"
                    options={[
                      { value: 'MANUAL', label: 'Manual' },
                      { value: 'SCHEDULED', label: 'Scheduled' },
                    ]}
                  />
                  <RangePicker
                    size="small"
                    value={dateRange as [Dayjs, Dayjs] | null}
                    onChange={(dates) => { setDateRange(dates); setCurrentPage(1) }}
                    style={{ width: 260 }}
                  />
                </div>

                {/* Active filter tags */}
                {hasAnyFilter && (
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
                    {triggerFilter && (
                      <Tag
                        closable
                        onClose={() => { setTriggerFilter(undefined); setCurrentPage(1) }}
                        color="blue"
                        style={{ fontSize: 13 }}
                      >
                        Trigger: {triggerFilter}
                      </Tag>
                    )}
                    {dateRange && dateRange[0] && dateRange[1] && (
                      <Tag
                        closable
                        onClose={() => { setDateRange(null); setCurrentPage(1) }}
                        color="blue"
                        style={{ fontSize: 13 }}
                      >
                        Date: {dateRange[0].format('YYYY-MM-DD')} to {dateRange[1].format('YYYY-MM-DD')}
                      </Tag>
                    )}
                    {(activeFilterEntries.length + (triggerFilter ? 1 : 0) + (dateRange && dateRange[0] ? 1 : 0)) > 1 && (
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
                  columns={runColumns}
                  dataSource={data.content}
                  rowKey="id"
                  loading={loading}
                  style={{ background: '#fff', borderRadius: 8, padding: '0 0 8px' }}
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
                        setSortBy('startedAt')
                        setSortDir('desc')
                      }
                    }
                  }}
                />
              </div>
            ),
          },
          {
            key: 'schedules',
            label: 'Schedules',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => openScheduleModal()}
                  >
                    Create Schedule
                  </Button>
                </div>

                <Table
                  columns={scheduleColumns}
                  dataSource={scheduleData.content}
                  rowKey="id"
                  loading={scheduleLoading}
                  style={{ background: '#fff', borderRadius: 8, padding: '0 0 8px' }}
                  pagination={{
                    current: schedulePage,
                    pageSize: schedulePageSize,
                    total: scheduleData.totalElements,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50'],
                    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
                    style: { padding: '0 16px' },
                  }}
                  onChange={(pagination) => {
                    setSchedulePage(pagination.current ?? 1)
                    setSchedulePageSize(pagination.pageSize ?? 10)
                  }}
                />
              </div>
            ),
          },
        ]}
      />

      {/* View Run Drawer */}
      <Drawer
        title="Run Details"
        open={!!viewDrawer}
        onClose={() => { setViewDrawer(null); setViewDetail(null) }}
        width={800}
        destroyOnClose
      >
        {viewLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : viewDetail?.resultData ? (
          <RunResultsPanel
            result={viewDetail.resultData as SuiteExecutionResult}
            allSteps={[]}
            targetStepId={null}
            onClose={() => { setViewDrawer(null); setViewDetail(null) }}
          />
        ) : (
          <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
            No result data available for this run.
          </div>
        )}
      </Drawer>

      {/* Schedule Modal */}
      <Modal
        title={editingSchedule ? 'Edit Schedule' : 'Create Schedule'}
        open={scheduleModalOpen}
        onOk={handleScheduleSubmit}
        onCancel={() => { setScheduleModalOpen(false); setEditingSchedule(null) }}
        okText={editingSchedule ? 'Update' : 'Create'}
        confirmLoading={scheduleSubmitting}
        destroyOnClose
        width={560}
      >
        <Form
          form={scheduleForm}
          layout="vertical"
          size="small"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="suiteId"
            label="Suite"
            rules={[{ required: true, message: 'Please select a test suite' }]}
          >
            <Select
              placeholder="Select test suite"
              showSearch
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={suiteOptions}
            />
          </Form.Item>

          <Form.Item
            name="environmentId"
            label="Environment"
            rules={[{ required: true, message: 'Please select an environment' }]}
          >
            <Select
              placeholder="Select environment"
              showSearch
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={envOptions}
            />
          </Form.Item>

          <Form.Item
            name="cronExpression"
            label="Cron Expression"
            rules={[{ required: true, message: 'Please enter a cron expression' }]}
            extra={
              <Text type="secondary" style={{ fontSize: 11 }}>
                5-field (min hr day mon dow) or 6-field (sec min hr day mon dow). Examples: */5 * * * * (every 5min) | 0 8 * * * (daily 8am) | 30 9 * * MON-FRI (weekdays 9:30am)
              </Text>
            }
          >
            <Input
              placeholder="e.g. */5 * * * * or 0 0 8 * * *"
              value={cronValue}
              onChange={(e) => handleCronChange(e.target.value)}
            />
          </Form.Item>

          {/* Cron readable description */}
          {cronValue.trim() && (
            <div style={{ marginTop: -12, marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: cronReadable.error ? '#ff4d4f' : '#52c41a',
                }}
              >
                {cronReadable.text}
              </Text>

              {/* Server-side preview: next 5 fire times */}
              {cronPreviewLoading && (
                <div style={{ marginTop: 4 }}>
                  <Spin size="small" /> <Text type="secondary" style={{ fontSize: 11 }}>Loading preview...</Text>
                </div>
              )}
              {!cronPreviewLoading && cronPreview && cronPreview.valid && cronPreview.nextFireTimes.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Next fire times:</Text>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 11, color: '#595959' }}>
                    {cronPreview.nextFireTimes.map((t, i) => (
                      <li key={i}>{new Date(t).toLocaleString()}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!cronPreviewLoading && cronPreview && !cronPreview.valid && cronPreview.error && (
                <div style={{ marginTop: 4 }}>
                  <Text type="danger" style={{ fontSize: 11 }}>{cronPreview.error}</Text>
                </div>
              )}
            </div>
          )}

          <Form.Item
            name="description"
            label="Description"
          >
            <Input placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
