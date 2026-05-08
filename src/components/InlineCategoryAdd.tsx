import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'

interface Props {
  // Which table to insert into
  table: 'pl_categories' | 'pl_subcategories' | 'departments' | 'dept_subcategories' | 'expense_descriptions'
  // Parent ID required for subcategories
  parentId?: string
  parentField?: string  // e.g. 'category_id', 'department_id', 'dept_subcategory_id'
  // Current count for sort_order
  currentCount: number
  // Called after successful insert with new item {id, name}
  onAdded: (item: { id: string; name: string }) => void
  // Visual theme: 'light' (white dialogs) or 'dark' (dark dialogs)
  theme?: 'light' | 'dark'
  // Placeholder text
  placeholder?: string
  // Disabled (e.g. subcategory when no parent selected)
  disabled?: boolean
}

export default function InlineCategoryAdd({
  table, parentId, parentField, currentCount,
  onAdded, theme = 'light', placeholder, disabled = false
}: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    setOpen(true)
    setValue('')
    setError('')
  }

  const handleCancel = () => {
    setOpen(false)
    setValue('')
    setError('')
  }

  const handleSave = async () => {
    const trimmed = value.trim()
    if (!trimmed) return
    setSaving(true)
    setError('')

    // Build payload
    const payload: any = {
      name: trimmed,
      sort_order: currentCount + 1,
    }
    if (parentId && parentField) {
      payload[parentField] = parentId
    }

    const { data, error: err } = await supabase
      .from(table)
      .insert(payload)
      .select('id, name')
      .single()

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    if (data) {
      onAdded({ id: data.id, name: data.name })
      setOpen(false)
      setValue('')
    }
    setSaving(false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') handleCancel()
  }

  const isDark = theme === 'dark'

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        disabled={disabled}
        title={disabled ? 'Prvo odaberi nadređenu kategoriju' : 'Dodaj novu kategoriju'}
        style={{
          background: 'none',
          border: `1px solid ${disabled ? 'rgba(128,128,128,0.2)' : isDark ? 'rgba(0,212,126,0.4)' : 'rgba(29,158,117,0.4)'}`,
          borderRadius: '6px',
          color: disabled ? (isDark ? 'rgba(255,255,255,0.2)' : '#ccc') : (isDark ? '#00D47E' : '#1D9E75'),
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: '600',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
          padding: 0,
        }}
      >
        +
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      padding: '8px 10px',
      background: isDark ? 'rgba(0,212,126,0.07)' : '#f0fdf8',
      border: `1.5px solid ${isDark ? 'rgba(0,212,126,0.3)' : '#5DCAA5'}`,
      borderRadius: '8px',
      marginTop: '4px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: '500', color: isDark ? '#5DCAA5' : '#0F6E56', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Nova kategorija
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => { setValue(e.target.value); setError('') }}
          onKeyDown={handleKey}
          placeholder={placeholder || 'Unesi naziv...'}
          style={{
            flex: 1,
            fontFamily: 'system-ui,sans-serif',
            fontSize: '13px',
            padding: '6px 8px',
            border: `1px solid ${isDark ? 'rgba(0,212,126,0.3)' : '#5DCAA5'}`,
            borderRadius: '6px',
            background: isDark ? '#111F30' : '#fff',
            color: isDark ? '#DCE9F6' : '#111',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          style={{
            fontFamily: 'system-ui,sans-serif',
            fontSize: '12px',
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px',
            background: isDark ? '#00D47E' : '#1D9E75',
            color: isDark ? '#060E1A' : '#fff',
            cursor: saving || !value.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !value.trim() ? 0.6 : 1,
            whiteSpace: 'nowrap',
            fontWeight: '500',
          }}
        >
          {saving ? '...' : '✓ Dodaj'}
        </button>
        <button
          onClick={handleCancel}
          style={{
            background: 'none',
            border: 'none',
            color: isDark ? 'rgba(255,255,255,0.4)' : '#888',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      {error && (
        <div style={{ fontSize: '11px', color: '#E24B4A' }}>⚠️ {error}</div>
      )}
    </div>
  )
}