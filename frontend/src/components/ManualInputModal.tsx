import { useEffect, useState } from 'react'
import { Modal, Input, Form, Button, Space, Typography } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'

const { Text } = Typography

interface ManualInputField {
  name: string
  defaultValue: string | null
  cachedValue?: string | null
}

interface ManualInputModalProps {
  open: boolean
  stepName: string
  fields: ManualInputField[]
  onSubmit: (values: Record<string, string>) => void
  onCancel: () => void
}

export default function ManualInputModal({ open, stepName, fields, onSubmit, onCancel }: ManualInputModalProps) {
  const [values, setValues] = useState<Record<string, string>>({})

  const hasCachedFields = fields.some((f) => f.cachedValue != null)

  // Initialize with cached or default values when fields change
  useEffect(() => {
    if (open && fields.length > 0) {
      const initial: Record<string, string> = {}
      for (const f of fields) {
        // Pre-fill with cached value (dep re-execution) or default value
        initial[f.name] = f.cachedValue ?? f.defaultValue ?? ''
      }
      setValues(initial)
    }
  }, [open, fields])

  const allFilled = fields.every((f) => (values[f.name] ?? '').trim().length > 0)

  const handleSubmit = () => {
    if (allFilled) onSubmit(values)
  }

  const isSensitive = (name: string) => {
    const lower = name.toLowerCase()
    return lower.includes('password') || lower.includes('secret') || lower.includes('otp') || lower.includes('token') || lower.includes('pin')
  }

  return (
    <Modal
      open={open}
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#d4380d' }} />
          <span>Input Required &mdash; {stepName}</span>
        </Space>
      }
      closable={false}
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={onCancel}>Cancel Run</Button>
          <Button type="primary" disabled={!allFilled} onClick={handleSubmit}>
            Submit
          </Button>
        </Space>
      }
      width={480}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {hasCachedFields
          ? 'This dependency is being re-executed. Previous values are pre-filled.'
          : 'This step requires manual input to continue execution.'}
      </Text>
      <Form layout="vertical" size="small">
        {fields.map((f, idx) => (
          <Form.Item key={f.name} label={<Text strong>{f.name}</Text>} style={{ marginBottom: 12 }}>
            {isSensitive(f.name) ? (
              <Input.Password
                autoFocus={idx === 0}
                value={values[f.name] ?? ''}
                placeholder={f.defaultValue ? `Default: ${f.defaultValue}` : `Enter ${f.name}`}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                onPressEnter={allFilled ? handleSubmit : undefined}
              />
            ) : (
              <Input
                autoFocus={idx === 0}
                value={values[f.name] ?? ''}
                placeholder={f.defaultValue ? `Default: ${f.defaultValue}` : `Enter ${f.name}`}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                onPressEnter={allFilled ? handleSubmit : undefined}
              />
            )}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  )
}
