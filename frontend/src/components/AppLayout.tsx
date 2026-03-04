import { Layout, theme } from 'antd'
import {
  ExperimentOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  CloudServerOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'

const { Sider, Content, Header } = Layout

const navItems = [
  { key: '/', icon: <ExperimentOutlined />, label: 'Suites' },
  { key: '/environments', icon: <SettingOutlined />, label: 'Envs' },
  { key: '/runs', icon: <PlayCircleOutlined />, label: 'Runs' },
  { key: '/mock-server', icon: <CloudServerOutlined />, label: 'Mock' },
  { key: '/webhooks', icon: <NodeIndexOutlined />, label: 'Webhooks' },
]

const pageLabelMap: Record<string, string> = {
  '/': 'Test Suites',
  '/test-suites': 'Test Suites',
  '/environments': 'Environments',
  '/runs': 'Runs',
  '/mock-server': 'Mock Server',
  '/webhooks': 'Webhooks',
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  const matchedKey = Object.keys(pageLabelMap)
    .filter((k) => location.pathname.startsWith(k) && k !== '/')
    .sort((a, b) => b.length - a.length)[0] ?? '/'

  // /test-suites paths should highlight the Suites nav item at /
  const selectedKey = matchedKey === '/test-suites' ? '/' : matchedKey
  const pageLabel = pageLabelMap[matchedKey] ?? 'Test Suites'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <a className="skip-to-content" href="#main-content">
        Skip to main content
      </a>
      <Sider
        collapsed
        collapsedWidth={72}
        style={{
          background: '#fff',
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
        }}
        theme="light"
        trigger={null}
      >
        {/* Logo */}
        <div
          style={{
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            background: 'linear-gradient(135deg, #0a2540, #0891b2)',
          }}
        >
          <img src="/icon.svg" alt="OrchestAPI" style={{ width: 24, height: 24 }} />
        </div>

        {/* Navigation — icon + label stacked */}
        <nav style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
          {navItems.map((item) => {
            const isActive = item.key === selectedKey
            return (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                aria-label={pageLabelMap[item.key] || item.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => navigate(item.key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(item.key) } }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '10px 4px',
                  cursor: 'pointer',
                  borderRadius: 6,
                  margin: '1px 8px',
                  background: isActive ? 'rgba(8,145,178,0.08)' : 'transparent',
                  color: isActive ? '#0891b2' : '#64748b',
                  transition: 'background 150ms ease, color 150ms ease',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#f1f5f9' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 18, lineHeight: 1, display: 'flex' }}>{item.icon}</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: 'var(--font-body)',
                  letterSpacing: 0.2,
                  lineHeight: 1.2,
                }}>{item.label}</span>
              </div>
            )
          })}
        </nav>
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 16px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            height: 40,
            lineHeight: '40px',
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              fontFamily: 'var(--font-heading)',
              letterSpacing: -0.3,
              color: '#1e293b',
            }}
          >
            {pageLabel}
          </span>
        </Header>
        <Content
          id="main-content"
          style={{ margin: 16, background: token.colorBgLayout }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
