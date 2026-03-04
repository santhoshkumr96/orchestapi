import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider, Result, Button } from 'antd'
import AppLayout from './components/AppLayout'
import EnvironmentsPage from './pages/EnvironmentsPage'
import EnvironmentDetailPage from './pages/EnvironmentDetailPage'
import TestSuitesPage from './pages/TestSuitesPage'
import TestSuiteDetailPage from './pages/TestSuiteDetailPage'
import RunsPage from './pages/RunsPage'
import MockServerPage from './pages/MockServerPage'
import WebhookPage from './pages/WebhookPage'

function NotFoundPage() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'
  return (
    <Result
      status="404"
      title="Page not found"
      extra={<Button type="primary" href={base}>Go to Test Suites</Button>}
    />
  )
}

function App() {
  return (
    <ConfigProvider
      componentSize="small"
      theme={{
        token: {
          colorPrimary: '#0891b2',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: "'Outfit', sans-serif",
        },
      }}
    >
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<TestSuitesPage />} />
            <Route path="/environments" element={<EnvironmentsPage />} />
            <Route path="/environments/:id" element={<EnvironmentDetailPage />} />
            <Route path="/test-suites" element={<TestSuitesPage />} />
            <Route path="/test-suites/:id" element={<TestSuiteDetailPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/mock-server" element={<MockServerPage />} />
            <Route path="/mock-server/:serverId" element={<MockServerPage />} />
            <Route path="/webhooks" element={<WebhookPage />} />
            <Route path="/webhooks/:id" element={<WebhookPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
