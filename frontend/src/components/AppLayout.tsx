import { useState } from 'react'
import { Layout, Menu, theme } from 'antd'
import {
  DashboardOutlined,
  ExperimentOutlined,
  SettingOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'

const { Sider, Content, Header } = Layout

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/test-suites', icon: <ExperimentOutlined />, label: 'Test Suites' },
  { key: '/environments', icon: <SettingOutlined />, label: 'Environments' },
  { key: '/runs', icon: <PlayCircleOutlined />, label: 'Runs' },
]

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  const selectedKey = menuItems
    .filter((item) => location.pathname.startsWith(item.key) && item.key !== '/')
    .sort((a, b) => b.key.length - a.key.length)[0]?.key ?? '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
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
      >
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            fontWeight: 700,
            fontSize: collapsed ? 12 : 14,
            background: 'linear-gradient(135deg, #0a2540, #0891b2)',
            color: '#fff',
            letterSpacing: collapsed ? 0 : 0.5,
          }}
        >
          <img src="/icon.svg" alt="OrchestAPI" style={{ width: collapsed ? 24 : 22, height: collapsed ? 24 : 22 }} />
          {!collapsed && 'OrchestAPI'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none' }}
        />
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
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {menuItems.find((item) => item.key === selectedKey)?.label ?? 'Dashboard'}
          </span>
        </Header>
        <Content style={{ margin: 16, background: token.colorBgLayout }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
