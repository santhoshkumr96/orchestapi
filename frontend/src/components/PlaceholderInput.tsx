import { useRef, useState, useLayoutEffect } from 'react'
import { Input, Tag, Typography } from 'antd'

// ---- Types ----

export interface DepStepInfo {
  name: string
  variables: string[] // extracted variable names (hints, not exhaustive)
}

interface PlaceholderInputProps {
  mode?: 'input' | 'textarea'
  value: string
  onChange: (value: string) => void
  envVars: string[]
  depSteps: DepStepInfo[]
  fileKeys?: string[]
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  style?: React.CSSProperties
  rows?: number
}

// ---- Trigger detection ----

interface Trigger {
  type: 'env' | 'step' | 'stepVar' | 'file'
  partial: string
  start: number // char index where partial begins
  stepName?: string // only for stepVar
}

function detectTrigger(text: string, cursor: number): Trigger | null {
  const before = text.substring(0, cursor)

  // {{stepName.partial — step variable (step names can contain spaces)
  const stepVarMatch = before.match(/\{\{([\w ]+)\.(\w*)$/)
  if (stepVarMatch) {
    return {
      type: 'stepVar',
      stepName: stepVarMatch[1],
      partial: stepVarMatch[2],
      start: cursor - stepVarMatch[2].length,
    }
  }

  // {{partial — step name (allow spaces for multi-word names like "Create User")
  const stepMatch = before.match(/\{\{([\w ]*)$/)
  if (stepMatch) {
    return {
      type: 'step',
      partial: stepMatch[1],
      start: cursor - stepMatch[1].length,
    }
  }

  // ${FILE:partial — file reference (must check before env)
  const fileMatch = before.match(/\$\{FILE:([\w-]*)$/)
  if (fileMatch) {
    return {
      type: 'file',
      partial: fileMatch[1],
      start: cursor - fileMatch[1].length,
    }
  }

  // ${partial — env variable
  const envMatch = before.match(/\$\{(\w*)$/)
  if (envMatch) {
    return {
      type: 'env',
      partial: envMatch[1],
      start: cursor - envMatch[1].length,
    }
  }

  return null
}

// ---- Suggestion items ----

interface Suggestion {
  label: string
  insertText: string
  tag?: string
  tagColor?: string
  description?: string
}

function buildSuggestions(
  trigger: Trigger,
  envVars: string[],
  depSteps: DepStepInfo[],
  fileKeys: string[] = [],
): Suggestion[] {
  const lower = trigger.partial.toLowerCase()

  if (trigger.type === 'file') {
    return fileKeys
      .filter((k) => k.toLowerCase().includes(lower))
      .map((k) => ({
        label: k,
        insertText: k + '}',
        tag: 'file',
        tagColor: 'orange',
      }))
  }

  if (trigger.type === 'env') {
    return envVars
      .filter((v) => v.toLowerCase().includes(lower))
      .map((v) => ({
        label: v,
        insertText: v + '}',
        tag: 'env',
        tagColor: 'green',
      }))
  }

  if (trigger.type === 'step') {
    return depSteps
      .filter((s) => s.name.toLowerCase().includes(lower))
      .map((s) => ({
        label: s.name,
        insertText: s.name + '.',
        tag: `${s.variables.length} vars`,
        tagColor: 'blue',
        description:
          s.variables.length > 0
            ? s.variables.slice(0, 3).join(', ') + (s.variables.length > 3 ? '...' : '')
            : 'type any response path',
      }))
  }

  if (trigger.type === 'stepVar' && trigger.stepName) {
    const step = depSteps.find((s) => s.name === trigger.stepName)
    if (!step) return []

    const items: Suggestion[] = step.variables
      .filter((v) => v.toLowerCase().includes(lower))
      .map((v) => ({
        label: v,
        insertText: v + '}}',
        tag: 'extracted',
        tagColor: 'purple',
      }))

    // Add custom path option when typing something not in the list
    if (lower.length > 0 && !step.variables.some((v) => v.toLowerCase() === lower)) {
      items.push({
        label: `${trigger.partial} (custom path)`,
        insertText: trigger.partial + '}}',
        tag: 'custom',
        tagColor: 'default',
      })
    }

    return items
  }

  return []
}

// ---- Helper: get native input/textarea from wrapper ----

function getNativeEl(wrapper: HTMLDivElement): HTMLInputElement | HTMLTextAreaElement | null {
  return wrapper.querySelector('textarea') ?? wrapper.querySelector('input')
}

// ---- Highlight rendering ----

function renderHighlights(text: string): React.ReactNode[] {
  if (!text) return []

  const regex = /(\$\{[^}]*\}|\{\{[^}]*\}\}|#\{[^}]*\})/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }
    const matched = match[0]
    const isEnv = matched.startsWith('${')
    const isManual = matched.startsWith('#{')
    parts.push(
      <span
        key={match.index}
        style={{
          color: isManual ? '#d4380d' : isEnv ? '#389e0d' : '#1677ff',
          backgroundColor: isManual ? '#fff7e6' : isEnv ? '#f6ffed' : '#e6f4ff',
          borderRadius: 2,
          padding: '0 1px',
        }}
      >
        {matched}
      </span>,
    )
    lastIndex = match.index + matched.length
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts
}

// ---- Component ----

export default function PlaceholderInput({
  mode = 'input',
  value,
  onChange,
  envVars,
  depSteps,
  fileKeys = [],
  placeholder,
  size = 'small',
  style,
  rows,
}: PlaceholderInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [visible, setVisible] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [emptyHint, setEmptyHint] = useState<string | null>(null)
  const triggerRef = useRef<Trigger | null>(null)
  const skipNextCheck = useRef(false)

  // Sync backdrop text styles with actual input element
  useLayoutEffect(() => {
    const el = wrapperRef.current ? getNativeEl(wrapperRef.current) : null
    const bd = backdropRef.current
    if (!el || !bd) return

    const cs = window.getComputedStyle(el)
    bd.style.fontFamily = cs.fontFamily
    bd.style.fontSize = cs.fontSize
    bd.style.lineHeight = cs.lineHeight
    bd.style.letterSpacing = cs.letterSpacing
    bd.style.wordSpacing = cs.wordSpacing
    bd.style.padding = cs.padding
    bd.style.borderWidth = cs.borderWidth
    bd.style.borderStyle = 'solid'
    bd.style.borderColor = 'transparent'
    bd.style.boxSizing = cs.boxSizing
    bd.style.textIndent = cs.textIndent

    if (mode === 'textarea') {
      bd.style.whiteSpace = 'pre-wrap'
      bd.style.overflowWrap = 'break-word'
    } else {
      bd.style.whiteSpace = 'pre'
      bd.style.overflow = 'hidden'
    }
  }, [mode])

  // Scroll sync (textarea horizontal/vertical, input horizontal)
  useLayoutEffect(() => {
    const el = wrapperRef.current ? getNativeEl(wrapperRef.current) : null
    if (!el) return

    const syncScroll = () => {
      const bd = backdropRef.current
      if (bd) {
        bd.scrollTop = el.scrollTop
        bd.scrollLeft = el.scrollLeft
      }
    }

    el.addEventListener('scroll', syncScroll)
    return () => el.removeEventListener('scroll', syncScroll)
  }, [mode])

  const checkForTrigger = () => {
    if (skipNextCheck.current) {
      skipNextCheck.current = false
      return
    }

    const el = wrapperRef.current ? getNativeEl(wrapperRef.current) : null
    if (!el) return

    const cursor = el.selectionStart ?? 0
    const text = el.value
    const trigger = detectTrigger(text, cursor)
    triggerRef.current = trigger

    if (!trigger) {
      setVisible(false)
      setEmptyHint(null)
      return
    }

    const items = buildSuggestions(trigger, envVars, depSteps, fileKeys)
    if (items.length === 0) {
      setSuggestions([])
      setVisible(true)
      setEmptyHint(
        trigger.type === 'file'
          ? 'No files uploaded — upload files in Environment detail page'
          : trigger.type === 'env'
            ? 'No environment variables found'
            : trigger.type === 'step'
              ? 'No dependent steps — add dependencies first'
              : `Step "${trigger.stepName}" not found in dependencies`,
      )
      return
    }

    setEmptyHint(null)
    setSuggestions(items)
    setSelectedIdx(0)
    setVisible(true)
  }

  const applySuggestion = (suggestion: Suggestion) => {
    const trigger = triggerRef.current
    const el = wrapperRef.current ? getNativeEl(wrapperRef.current) : null
    if (!trigger || !el) return

    const cursor = el.selectionStart ?? trigger.start + trigger.partial.length
    const before = value.substring(0, trigger.start)
    const after = value.substring(cursor)
    const newValue = before + suggestion.insertText + after
    const newCursor = trigger.start + suggestion.insertText.length

    skipNextCheck.current = true
    onChange(newValue)
    setVisible(false)
    setEmptyHint(null)

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(newCursor, newCursor)
      // After inserting a step name (ends with "."), re-trigger to show variables
      if (suggestion.insertText.endsWith('.')) {
        skipNextCheck.current = false
        setTimeout(checkForTrigger, 20)
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Space to force-open suggestions
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault()
      checkForTrigger()
      return
    }

    if (!visible || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      applySuggestion(suggestions[selectedIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setVisible(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value)
    // Check for trigger after the value updates and cursor settles
    setTimeout(checkForTrigger, 0)
  }

  const handleBlur = () => {
    setTimeout(() => {
      setVisible(false)
      setEmptyHint(null)
    }, 200)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Highlight backdrop — sits behind the input, renders colored variable text */}
      <div
        ref={backdropRef}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          color: '#000',
          background: '#fff',
          borderRadius: 4,
          overflow: 'hidden',
          zIndex: 0,
        }}
      >
        {renderHighlights(value)}
      </div>

      {mode === 'textarea' ? (
        <Input.TextArea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          size={size}
          rows={rows ?? 8}
          style={{
            fontFamily: 'monospace',
            position: 'relative',
            zIndex: 1,
            background: 'transparent',
            ...(value ? { color: 'transparent', caretColor: '#000' } : {}),
            ...style,
          }}
        />
      ) : (
        <Input
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          size={size}
          style={{
            position: 'relative',
            zIndex: 1,
            background: 'transparent',
            ...(value ? { color: 'transparent', caretColor: '#000' } : {}),
            ...style,
          }}
        />
      )}

      {/* Suggestion dropdown — positioned below the input */}
      {visible && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 2,
            zIndex: 1050,
            background: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            minWidth: 220,
            maxWidth: 380,
            maxHeight: 220,
            overflowY: 'auto',
            padding: 4,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {emptyHint ? (
            <Typography.Text type="secondary" style={{ display: 'block', padding: '6px 8px', fontSize: 12 }}>
              {emptyHint}
            </Typography.Text>
          ) : (
            <>
              {/* Hint header */}
              <div
                style={{
                  padding: '2px 8px 4px',
                  color: '#999',
                  fontSize: 11,
                  borderBottom: '1px solid #f0f0f0',
                  marginBottom: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  {triggerRef.current?.type === 'file' && '${FILE:___}'}
                  {triggerRef.current?.type === 'env' && '${___}'}
                  {triggerRef.current?.type === 'step' && '{{stepName.___}}'}
                  {triggerRef.current?.type === 'stepVar' &&
                    `{{${triggerRef.current.stepName}.___}}`}
                </span>
                <span>Tab / Enter to select</span>
              </div>
              {suggestions.map((s, i) => (
                <div
                  key={s.label}
                  onClick={() => applySuggestion(s)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  style={{
                    padding: '5px 8px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    background: i === selectedIdx ? '#e6f4ff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}>
                    {s.label}
                  </span>
                  {s.tag && (
                    <Tag
                      color={s.tagColor}
                      style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                    >
                      {s.tag}
                    </Tag>
                  )}
                  {s.description && (
                    <span
                      style={{
                        color: '#999',
                        fontSize: 11,
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.description}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
