import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Statistic, Table, Tag, Typography, Spin, Button, Space, Tooltip } from 'antd'
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  DashboardOutlined,
  WarningOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { TestSuite } from '../types/testSuite'
import type { TestRunResponse, DashboardStats } from '../types/run'
import { testSuiteApi } from '../services/testSuiteApi'
import { runApi } from '../services/runApi'

const { Title, Text } = Typography

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'green',
  FAILURE: 'red',
  PARTIAL_FAILURE: 'orange',
  RUNNING: 'processing',
  CANCELLED: 'default',
  VERIFICATION_FAILED: 'purple',
}

const TRIGGER_COLOR: Record<string, string> = {
  MANUAL: 'default',
  SCHEDULED: 'purple',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

interface SuiteHealth {
  id: string
  name: string
  stepCount: number
  lastRunStatus: string | null
  lastRunAt: string | null
  lastRunDuration: number | null
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentRuns, setRecentRuns] = useState<TestRunResponse[]>([])
  const [suiteHealth, setSuiteHealth] = useState<SuiteHealth[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [statsData, runsData, suitesData] = await Promise.all([
          runApi.stats(),
          runApi.list({ page: 0, size: 10, sortBy: 'startedAt', sortDir: 'desc' }),
          testSuiteApi.list({ page: 0, size: 100, sortBy: 'updatedAt', sortDir: 'desc' }),
        ])
        if (cancelled) return

        setStats(statsData)
        setRecentRuns(runsData.content)

        // Build suite health: for each suite, find its most recent run
        const suites: TestSuite[] = suitesData.content
        const healthList: SuiteHealth[] = suites.map((suite) => {
          // Find most recent run for this suite from the runs data
          const lastRun = runsData.content.find((r) => r.suiteId === suite.id)
          return {
            id: suite.id,
            name: suite.name,
            stepCount: suite.stepCount,
            lastRunStatus: lastRun?.status ?? null,
            lastRunAt: lastRun?.startedAt ?? null,
            lastRunDuration: lastRun?.totalDurationMs ?? null,
          }
        })
        setSuiteHealth(healthList)
      } catch {
        // silently fail — dashboard is non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  const passRate = stats && stats.totalRuns > 0
    ? ((stats.successCount / stats.totalRuns) * 100)
    : 0
  const passRateColor = passRate > 80 ? '#52c41a' : passRate > 50 ? '#faad14' : '#ff4d4f'

  const runColumns = [
    {
      title: 'Suite',
      dataIndex: 'suiteName',
      key: 'suiteName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Environment',
      dataIndex: 'environmentName',
      key: 'environmentName',
      ellipsis: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => (
        <Tag color={STATUS_COLOR[status] || 'default'}>{status.replace('_', ' ')}</Tag>
      ),
    },
    {
      title: 'Trigger',
      dataIndex: 'triggerType',
      key: 'triggerType',
      width: 100,
      render: (t: string) => (
        <Tag color={TRIGGER_COLOR[t] || 'default'}>
          {t === 'SCHEDULED' && <ClockCircleOutlined style={{ marginRight: 4 }} />}
          {t}
        </Tag>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'totalDurationMs',
      key: 'duration',
      width: 90,
      render: (ms: number) => <Text type="secondary">{formatDuration(ms)}</Text>,
    },
    {
      title: 'Started',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 160,
      render: (d: string) => (
        <Text type="secondary">{new Date(d).toLocaleString()}</Text>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 50,
      render: (_: unknown, record: TestRunResponse) => (
        <Tooltip title="View in Runs">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              navigate('/runs')
            }}
          />
        </Tooltip>
      ),
    },
  ]

  const healthColumns = [
    {
      title: 'Suite',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Steps',
      dataIndex: 'stepCount',
      key: 'stepCount',
      width: 70,
      render: (count: number) => <Tag>{count}</Tag>,
    },
    {
      title: 'Last Run',
      dataIndex: 'lastRunStatus',
      key: 'lastRunStatus',
      width: 130,
      render: (status: string | null) =>
        status ? (
          <Tag color={STATUS_COLOR[status] || 'default'}>{status.replace('_', ' ')}</Tag>
        ) : (
          <Text type="secondary">Never</Text>
        ),
    },
    {
      title: 'Duration',
      dataIndex: 'lastRunDuration',
      key: 'lastRunDuration',
      width: 90,
      render: (ms: number | null) =>
        ms != null ? (
          <Text type="secondary">{formatDuration(ms)}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Last Run At',
      dataIndex: 'lastRunAt',
      key: 'lastRunAt',
      width: 160,
      render: (d: string | null) =>
        d ? (
          <Text type="secondary">{new Date(d).toLocaleString()}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: '',
      key: 'action',
      width: 50,
      render: (_: unknown, record: SuiteHealth) => (
        <Tooltip title="Open suite">
          <Button
            type="text"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/test-suites/${record.id}`)
            }}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>Dashboard</Title>
        <Space>
          <Button
            icon={<ExperimentOutlined />}
            onClick={() => navigate('/test-suites/new')}
          >
            New Suite
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => navigate('/runs')}
          >
            View Runs
          </Button>
        </Space>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Card size="small">
          <Statistic
            title="Total Runs"
            value={stats?.totalRuns ?? 0}
            prefix={<DashboardOutlined />}
          />
        </Card>
        <Card size="small">
          <Statistic
            title="Pass Rate"
            value={stats?.totalRuns ? passRate.toFixed(1) : '—'}
            suffix={stats?.totalRuns ? '%' : ''}
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: stats?.totalRuns ? passRateColor : undefined }}
          />
        </Card>
        <Card size="small">
          <Statistic
            title="Active Schedules"
            value={stats?.activeSchedules ?? 0}
            prefix={<ClockCircleOutlined />}
            valueStyle={{ color: (stats?.activeSchedules ?? 0) > 0 ? '#722ed1' : undefined }}
          />
        </Card>
        <Card size="small">
          <Statistic
            title="Failures"
            value={(stats?.failureCount ?? 0) + (stats?.partialFailureCount ?? 0)}
            prefix={<CloseCircleOutlined />}
            valueStyle={{ color: ((stats?.failureCount ?? 0) + (stats?.partialFailureCount ?? 0)) > 0 ? '#ff4d4f' : '#52c41a' }}
          />
          {((stats?.runningCount ?? 0) > 0) && (
            <div style={{ marginTop: 4 }}>
              <Tag color="processing">{stats!.runningCount} running</Tag>
            </div>
          )}
        </Card>
      </div>

      {/* Recent Runs */}
      <Card
        size="small"
        title="Recent Runs"
        extra={
          <Button type="link" size="small" onClick={() => navigate('/runs')}>
            View all
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        {recentRuns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Text type="secondary">No runs yet. Run a test suite to see results here.</Text>
          </div>
        ) : (
          <Table
            columns={runColumns}
            dataSource={recentRuns}
            rowKey="id"
            pagination={false}
            size="small"
            onRow={() => ({
              onClick: () => navigate('/runs'),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </Card>

      {/* Suite Health */}
      <Card
        size="small"
        title={
          <Space>
            Suite Health
            {suiteHealth.some((s) => s.lastRunStatus === 'FAILURE') && (
              <Tag color="red" icon={<WarningOutlined />}>Issues</Tag>
            )}
          </Space>
        }
        extra={
          <Button type="link" size="small" onClick={() => navigate('/test-suites')}>
            View all
          </Button>
        }
      >
        {suiteHealth.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Text type="secondary">No test suites yet. Create one to get started.</Text>
          </div>
        ) : (
          <Table
            columns={healthColumns}
            dataSource={suiteHealth}
            rowKey="id"
            pagination={false}
            size="small"
            onRow={(record) => ({
              onClick: () => navigate(`/test-suites/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </Card>
    </div>
  )
}
