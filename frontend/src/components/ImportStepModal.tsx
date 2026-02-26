import { useState } from 'react'
import { Modal, Input, Button, Alert, Space } from 'antd'
import { ImportOutlined } from '@ant-design/icons'
import { testStepApi } from '../services/testSuiteApi'

interface ImportStepModalProps {
  open: boolean
  suiteId: string
  onSuccess: () => void
  onCancel: () => void
}

export default function ImportStepModal({ open, suiteId, onSuccess, onCancel }: ImportStepModalProps) {
  const [curlValue, setCurlValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    setError(null)
    if (!curlValue.trim()) {
      setError('Please enter a curl command')
      return
    }
    setLoading(true)
    try {
      await testStepApi.importCurl(suiteId, curlValue.trim())
      setCurlValue('')
      setError(null)
      onSuccess()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } }
        setError(axiosErr.response?.data?.error ?? axiosErr.response?.data?.message ?? 'Import failed')
      } else {
        setError('Import failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setCurlValue('')
    setError(null)
    onCancel()
  }

  return (
    <Modal
      title="Import Step"
      open={open}
      onCancel={handleCancel}
      width={640}
      footer={
        <Space>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button
            type="primary"
            icon={<ImportOutlined />}
            onClick={handleImport}
            loading={loading}
          >
            Import
          </Button>
        </Space>
      }
    >
      <div>
        <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
          Paste a curl command to import it as a test step.
        </div>
        <Input.TextArea
          rows={10}
          value={curlValue}
          onChange={(e) => setCurlValue(e.target.value)}
          placeholder={`curl -X POST 'https://api.example.com/users' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer token' \\\n  -d '{"name":"test"}'`}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginTop: 12 }}
        />
      )}
    </Modal>
  )
}
