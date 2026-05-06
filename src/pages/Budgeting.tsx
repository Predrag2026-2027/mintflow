import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Company { id: string; name: string }

interface BudgetCell {
  actual: number
  estimate: number
  isManual: boolean
  note?: string
}

interface BudgetRow {
  key: string
  label: string
  level: 0 | 1 | 2 | 3   // 0=category, 1=subcategory, 2=department, 3=description
  parent?: string
  cells: Record<string, BudgetCell>   // key = "2026-06"
  hasChildren: boolean
  cf_type?: string | null
}

interface MonthMeta {
  key: string       // "2026-06"
  label: string     // "Jun 2026"
  isPast: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return monthKey(d)
}

function fmtUSD(n: number, showSign = false): string {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  const str = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}K` : `$${abs.toFixed(0)}`
  if (showSign && n > 0) return `+${str}`
  if (showSign && n < 0) return `-${str}`
  return str
}

function varianceColor(variance: number): string {
  // variance = estimate - actual. Positive = under budget (good). Negative = over (bad).
  if (variance > 0) return '#1D9E75'
  if (variance < 0) return '#E24B4A'
  return '#888'
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Budgeting() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [months, setMonths] = useState<MonthMeta[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ rowKey: string; month: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(0)

  // Build 3-month window: current month + 2 ahead
  useEffect(() => {
    const now = new Date()
    const cur = monthKey(now)
    const mths: MonthMeta[] = [0, 1, 2].map(i => {
      const k = addMonths(cur, i)
      return { key: k, label: monthLabel(k), isPast: false }
    })
    // also show previous month as "actual reference"
    const prev = addMonths(cur, -1)
    setMonths([{ key: prev, label: monthLabel(prev), isPast: true }, ...mths])
  }, [])

  useEffect(() => {
    supabase.from('companies').select('id,name').order('name').then(({ data }) => {
      if (data) setCompanies(data)
    })
  }, [])

  // ── Load budget data ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!companyId || months.length === 0) return
    setLoading(true)

    const monthKeys = months.map(m => m.key)
    const firstMonth = monthKeys[0]
    const lastMonth = monthKeys[monthKeys.length - 1]

    // 1. Actuals — sum of posted expense transactions grouped by classification
    const { data: actuals } = await supabase
      .from('transactions')
      .select('transaction_date, pl_category, pl_subcategory, department, dept_subcategory, expense_description, amount_usd, cf_type, cf_frequency, cf_next_month_est')
      .eq('company_id', companyId)
      .eq('tx_subtype', 'expense')
      .eq('status', 'posted')
      .gte('transaction_date', `${firstMonth}-01`)
      .lte('transaction_date', `${lastMonth}-31`)

    // 2. Budget entries (manual overrides)
    const { data: budgetEntries } = await supabase
      .from('budget_entries')
      .select('*')
      .eq('company_id', companyId)
      .gte('budget_month', `${firstMonth}-01`)
      .lte('budget_month', `${lastMonth}-01`)

    // 3. Recurring transactions from last 3 months — for auto-estimate
    const threeMonthsAgo = addMonths(monthKey(new Date()), -3)
    const { data: recurring } = await supabase
      .from('transactions')
      .select('pl_category, pl_subcategory, department, dept_subcategory, expense_description, amount_usd, cf_type, cf_frequency, cf_next_month_est, transaction_date')
      .eq('company_id', companyId)
      .eq('tx_subtype', 'expense')
      .eq('status', 'posted')
      .not('cf_type', 'is', null)
      .gte('transaction_date', `${threeMonthsAgo}-01`)

    // ── Build row structure ──────────────────────────────────────────────────

    // Aggregate actuals by month + classification key
    const actualMap: Record<string, Record<string, number>> = {}
    // key format: "pl_cat|pl_sub|dept|dept_sub|desc"
    const makeKey = (t: any) => [
      t.pl_category || '', t.pl_subcategory || '',
      t.department || '', t.dept_subcategory || '',
      t.expense_description || '',
    ].join('|')

    for (const tx of (actuals || [])) {
      const mk = monthKey(new Date(tx.transaction_date))
      const ck = makeKey(tx)
      if (!actualMap[ck]) actualMap[ck] = {}
      actualMap[ck][mk] = (actualMap[ck][mk] || 0) + (tx.amount_usd || 0)
    }

    // Build estimate map from recurring txns
    const estimateMap: Record<string, Record<string, { amount: number; cf_type: string; cf_frequency: string }>> = {}
    for (const tx of (recurring || [])) {
      const ck = makeKey(tx)
      if (!estimateMap[ck]) estimateMap[ck] = {}
      const est = tx.cf_next_month_est || tx.amount_usd || 0
      const monthly = tx.cf_frequency === 'quarterly' ? est / 3
        : tx.cf_frequency === 'yearly' ? est / 12
        : est
      // Apply to future months only (not past actuals)
      for (const mk of monthKeys) {
        if (!estimateMap[ck][mk] || estimateMap[ck][mk].amount < monthly) {
          estimateMap[ck][mk] = { amount: monthly, cf_type: tx.cf_type, cf_frequency: tx.cf_frequency || 'monthly' }
        }
      }
    }

    // Manual budget entries override estimates
    const manualMap: Record<string, Record<string, { amount: number; note?: string }>> = {}
    for (const be of (budgetEntries || [])) {
      const ck = [
        be.pl_category || '', be.pl_subcategory || '',
        be.department || '', be.dept_subcategory || '',
        be.expense_description || '',
      ].join('|')
      const mk = monthKey(new Date(be.budget_month))
      if (!manualMap[ck]) manualMap[ck] = {}
      manualMap[ck][mk] = { amount: be.estimated_amount_usd || be.estimated_amount || 0, note: be.note }
    }

    // Collect all unique classification combos
    const allKeys = new Set<string>([
      ...Object.keys(actualMap),
      ...Object.keys(estimateMap),
      ...Object.keys(manualMap),
    ])

    // Build hierarchical rows
    const rowMap: Record<string, BudgetRow> = {}

    const ensureRow = (key: string, label: string, level: 0 | 1 | 2 | 3, parent?: string) => {
      if (!rowMap[key]) {
        rowMap[key] = { key, label, level, parent, cells: {}, hasChildren: false }
        if (parent && rowMap[parent]) rowMap[parent].hasChildren = true
      }
    }

    for (const ck of allKeys) {
      if (!ck || ck === '||||') continue
      const [plCat, plSub, dept, deptSub, desc] = ck.split('|')
      if (!plCat && !dept) continue

      // Category level
      const catKey = `cat:${plCat}`
      ensureRow(catKey, plCat || 'Uncategorized', 0)

      // Subcategory level (optional)
      let subKey = catKey
      if (plSub) {
        subKey = `sub:${plCat}|${plSub}`
        ensureRow(subKey, plSub, 1, catKey)
      }

      // Department level
      let deptKey = subKey
      if (dept) {
        deptKey = `dept:${plCat}|${plSub}|${dept}`
        ensureRow(deptKey, dept, 2, subKey)
      }

      // Dept subcategory level
      let deptSubKey = deptKey
      if (deptSub) {
        deptSubKey = `dsub:${plCat}|${plSub}|${dept}|${deptSub}`
        ensureRow(deptSubKey, deptSub, 3, deptKey)
      }

      // Leaf = description or deepest level
      const leafKey = desc
        ? `leaf:${ck}`
        : deptSubKey !== deptKey ? deptSubKey : deptKey

      if (desc && leafKey !== deptSubKey) {
        const leafLabel = desc
        const leafLevel: 3 = 3
        ensureRow(leafKey, leafLabel, leafLevel, deptSubKey)
      }

      // Assign cell data to leaf
      const row = rowMap[leafKey]
      if (!row) continue

      for (const mk of monthKeys) {
        const actual = actualMap[ck]?.[mk] || 0
        const estData = estimateMap[ck]?.[mk]
        const manual = manualMap[ck]?.[mk]

        const estimate = manual ? manual.amount : (estData?.amount || 0)
        const isManual = !!manual

        if (!row.cells[mk]) {
          row.cells[mk] = { actual, estimate, isManual, note: manual?.note }
        } else {
          row.cells[mk].actual += actual
          if (!row.cells[mk].isManual) row.cells[mk].estimate += estimate
        }
      }
    }

    // Bubble up to parents
    const sortedKeys = Object.keys(rowMap).sort((a, b) => {
      const la = rowMap[a].level, lb = rowMap[b].level
      return lb - la // deepest first for bubbling
    })

    for (const rk of sortedKeys) {
      const row = rowMap[rk]
      if (row.parent && rowMap[row.parent]) {
        const parent = rowMap[row.parent]
        for (const mk of monthKeys) {
          if (!parent.cells[mk]) parent.cells[mk] = { actual: 0, estimate: 0, isManual: false }
          parent.cells[mk].actual += row.cells[mk]?.actual || 0
          parent.cells[mk].estimate += row.cells[mk]?.estimate || 0
        }
      }
    }

    // Sort rows: by level then label
    const finalRows = Object.values(rowMap).sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level
      return a.label.localeCompare(b.label)
    })

    // Sort properly — children after parent
    const ordered: BudgetRow[] = []
    const visited = new Set<string>()

    const addRow = (key: string) => {
      if (visited.has(key)) return
      visited.add(key)
      const row = rowMap[key]
      if (!row) return
      ordered.push(row)
      // Add children
      const children = finalRows.filter(r => r.parent === key)
      children.sort((a, b) => a.label.localeCompare(b.label))
      for (const child of children) addRow(child.key)
    }

    const roots = finalRows.filter(r => !r.parent)
    roots.sort((a, b) => a.label.localeCompare(b.label))
    for (const root of roots) addRow(root.key)

    setRows(ordered)
    setLoading(false)
  }, [companyId, months, lastRefresh])

  useEffect(() => { loadData() }, [loadData])

  // ── Collapse/expand ────────────────────────────────────────────────────────
  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isVisible = (row: BudgetRow): boolean => {
    if (!row.parent) return true
    // Check all ancestors
    let p = row.parent
    while (p) {
      if (collapsed.has(p)) return false
      p = rows.find(r => r.key === p)?.parent || ''
    }
    return true
  }

  // ── Edit estimate ──────────────────────────────────────────────────────────
  const startEdit = (rowKey: string, month: string, currentEst: number) => {
    setEditing({ rowKey, month })
    setEditVal(currentEst > 0 ? currentEst.toFixed(0) : '')
  }

  const saveEdit = async () => {
    if (!editing) return
    const row = rows.find(r => r.key === editing.rowKey)
    if (!row) return

    setSaving(true)
    const [plCat, plSub, dept, deptSub, desc] = row.key.includes(':')
      ? (() => {
        const parts = row.key.split(':')[1]?.split('|') || []
        return [parts[0] || '', parts[1] || '', parts[2] || '', parts[3] || '', parts[4] || '']
      })()
      : ['', '', '', '', '']

    const amount = parseFloat(editVal) || 0
    const budgetMonth = `${editing.month}-01`

    const payload = {
      company_id: companyId,
      budget_month: budgetMonth,
      pl_category: plCat || null,
      pl_subcategory: plSub || null,
      department: dept || null,
      dept_subcategory: deptSub || null,
      expense_description: desc || null,
      estimated_amount: amount,
      estimated_amount_usd: amount,
      is_manual_override: true,
    }

    await supabase.from('budget_entries').upsert(payload, {
      onConflict: 'company_id,budget_month,pl_category,pl_subcategory,department,dept_subcategory,expense_description',
      ignoreDuplicates: false,
    })

    setEditing(null)
    setSaving(false)
    setLastRefresh(Date.now())
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals: Record<string, BudgetCell> = {}
  for (const m of months) {
    const rootRows = rows.filter(r => r.level === 0)
    totals[m.key] = {
      actual: rootRows.reduce((s, r) => s + (r.cells[m.key]?.actual || 0), 0),
      estimate: rootRows.reduce((s, r) => s + (r.cells[m.key]?.estimate || 0), 0),
      isManual: false,
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const levelIndent = [0, 20, 36, 50]
  const levelStyles: React.CSSProperties[] = [
    { fontWeight: '600', fontSize: '12px', color: '#0a1628', background: '#f5f5f3' },
    { fontWeight: '500', fontSize: '12px', color: '#333', background: '#fafaf9' },
    { fontWeight: '400', fontSize: '12px', color: '#555', background: '#fff' },
    { fontWeight: '400', fontSize: '11px', color: '#777', background: '#fff' },
  ]

  return (
    <div style={pg.page}>
      {/* ── Header ── */}
      <div style={pg.pageHeader}>
        <div>
          <div style={pg.pageTitle}>Budgeting</div>
          <div style={pg.pageSub}>Expense forecast · 3 months ahead · Actual vs Estimate</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select style={pg.companySelect} value={companyId} onChange={e => setCompanyId(e.target.value)}>
            <option value="">Select company...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {companyId && (
            <button style={pg.refreshBtn} onClick={() => setLastRefresh(Date.now())}>
              ↻ Refresh
            </button>
          )}
        </div>
      </div>

      {!companyId ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: '#333', marginBottom: '8px' }}>Select a company to view budget</div>
          <div style={{ fontSize: '13px', color: '#aaa' }}>Expense projection · Recurring detection · Manual override</div>
        </div>
      ) : loading ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '13px', color: '#aaa' }}>Loading budget data...</div>
          <div style={{ width: '200px', height: '4px', background: '#e5e5e5', borderRadius: '2px', marginTop: '16px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '60%', background: '#1D9E75', borderRadius: '2px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🌱</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: '#333', marginBottom: '8px' }}>No expense data yet</div>
          <div style={{ fontSize: '13px', color: '#aaa' }}>Start tagging transactions with Cash Flow Classification to populate the budget</div>
        </div>
      ) : (
        <div style={pg.tableWrap}>
          <table style={pg.table}>
            <thead>
              {/* Month headers */}
              <tr style={{ background: '#0a1628' }}>
                <th style={{ ...pg.th, textAlign: 'left', width: '260px', color: '#fff', paddingLeft: '16px' }}>
                  Expense category
                </th>
                {months.map(m => (
                  <th key={m.key} colSpan={3} style={{
                    ...pg.th, textAlign: 'center',
                    color: m.isPast ? 'rgba(255,255,255,0.45)' : '#fff',
                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '12px', fontWeight: '500',
                    background: m.isPast ? 'rgba(0,0,0,0.2)' : 'transparent',
                  }}>
                    {m.isPast ? `◀ ${m.label}` : m.label}
                  </th>
                ))}
              </tr>
              {/* Actual / Estimate / Variance sub-headers */}
              <tr style={{ background: '#0d1e38', borderBottom: '2px solid #1D9E75' }}>
                <th style={{ ...pg.th, textAlign: 'left', paddingLeft: '16px', color: 'rgba(255,255,255,0.45)', fontSize: '10px', fontWeight: '400' }} />
                {months.map(m => (
                  <React.Fragment key={m.key}>
                    <th style={{ ...pg.th, color: m.isPast ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)', fontSize: '10px', fontWeight: '500', letterSpacing: '0.08em', textAlign: 'right', paddingRight: '8px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>ACTUAL</th>
                    <th style={{ ...pg.th, color: m.isPast ? 'rgba(255,255,255,0.3)' : '#5DCAA5', fontSize: '10px', fontWeight: '500', letterSpacing: '0.08em', textAlign: 'right', paddingRight: '8px' }}>ESTIMATE</th>
                    <th style={{ ...pg.th, color: m.isPast ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: '500', letterSpacing: '0.08em', textAlign: 'right', paddingRight: '12px' }}>VAR</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.filter(isVisible).map(row => {
                const style = levelStyles[row.level]
                const isCollapsible = row.hasChildren
                const isCollapsed = collapsed.has(row.key)

                return (
                  <tr key={row.key} style={{
                    ...pg.tr,
                    background: style.background,
                    borderBottom: row.level === 0 ? '1px solid #e5e5e5' : '0.5px solid #f0f0ee',
                  }}>
                    {/* Label cell */}
                    <td style={{
                      ...pg.td,
                      paddingLeft: `${16 + levelIndent[row.level]}px`,
                      fontWeight: style.fontWeight,
                      fontSize: style.fontSize,
                      color: style.color,
                      cursor: isCollapsible ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                      onClick={() => isCollapsible && toggleCollapse(row.key)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isCollapsible && (
                          <span style={{ fontSize: '10px', color: '#aaa', width: '12px', flexShrink: 0 }}>
                            {isCollapsed ? '▶' : '▼'}
                          </span>
                        )}
                        {!isCollapsible && <span style={{ width: '12px', flexShrink: 0 }} />}
                        <span>{row.label}</span>
                      </div>
                    </td>

                    {/* Month cells */}
                    {months.map(m => {
                      const cell = row.cells[m.key] || { actual: 0, estimate: 0, isManual: false }
                      const variance = cell.estimate - cell.actual
                      const isEditingThis = editing?.rowKey === row.key && editing?.month === m.key
                      const canEdit = !row.hasChildren // only leaf rows editable

                      return (
                        <React.Fragment key={m.key}>
                          {/* Actual */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', borderLeft: '1px solid #f0f0ee', color: cell.actual > 0 ? '#A32D2D' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                            {cell.actual > 0 ? fmtUSD(cell.actual) : '—'}
                          </td>

                          {/* Estimate */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', fontVariantNumeric: 'tabular-nums' }}>
                            {isEditingThis ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                <input
                                  autoFocus
                                  type="number"
                                  style={pg.editInput}
                                  value={editVal}
                                  onChange={e => setEditVal(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveEdit()
                                    if (e.key === 'Escape') setEditing(null)
                                  }}
                                  onBlur={saveEdit}
                                />
                              </div>
                            ) : (
                              <div
                                style={{ cursor: canEdit ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => canEdit && startEdit(row.key, m.key, cell.estimate)}>
                                <span style={{ color: cell.isManual ? '#185FA5' : (cell.estimate > 0 ? '#1D9E75' : '#ccc') }}>
                                  {cell.estimate > 0 ? fmtUSD(cell.estimate) : (canEdit ? <span style={{ color: '#ddd', fontSize: '10px' }}>+ add</span> : '—')}
                                </span>
                                {cell.isManual && <span style={{ fontSize: '8px', color: '#7FB8EE' }} title="Manual override">✎</span>}
                              </div>
                            )}
                          </td>

                          {/* Variance */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '12px', fontVariantNumeric: 'tabular-nums' }}>
                            {(cell.actual > 0 || cell.estimate > 0) ? (
                              <span style={{ color: varianceColor(variance), fontSize: '11px', fontWeight: '500' }}>
                                {variance === 0 ? '—' : fmtUSD(variance, true)}
                              </span>
                            ) : '—'}
                          </td>
                        </React.Fragment>
                      )
                    })}
                  </tr>
                )
              })}

              {/* TOTALS row */}
              <tr style={{ background: '#0a1628', borderTop: '2px solid #1D9E75' }}>
                <td style={{ ...pg.td, paddingLeft: '16px', fontWeight: '700', fontSize: '12px', color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  TOTAL EXPENSES
                </td>
                {months.map(m => {
                  const cell = totals[m.key] || { actual: 0, estimate: 0, isManual: false }
                  const variance = cell.estimate - cell.actual
                  return (
                    <React.Fragment key={m.key}>
                      <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', color: cell.actual > 0 ? '#FF8080' : 'rgba(255,255,255,0.3)', fontWeight: '600', fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                        {cell.actual > 0 ? fmtUSD(cell.actual) : '—'}
                      </td>
                      <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', color: '#5DCAA5', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        {cell.estimate > 0 ? fmtUSD(cell.estimate) : '—'}
                      </td>
                      <td style={{ ...pg.td, textAlign: 'right', paddingRight: '12px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: varianceColor(variance) }}>
                          {(cell.actual > 0 || cell.estimate > 0) ? fmtUSD(variance, true) : '—'}
                        </span>
                      </td>
                    </React.Fragment>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Legend ── */}
      {rows.length > 0 && (
        <div style={pg.legend}>
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#A32D2D' }} /> Actual (posted transactions)</div>
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#1D9E75' }} /> Estimate (auto from recurring)</div>
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#185FA5' }} /> <span style={{ fontSize: '9px' }}>✎</span> Manual override (click estimate to edit)</div>
          <div style={pg.legendItem}><span style={{ color: '#1D9E75' }}>+</span> Under budget · <span style={{ color: '#E24B4A' }}>−</span> Over budget</div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        tbody tr:hover { filter: brightness(0.97); }
      `}</style>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pg: Record<string, React.CSSProperties> = {
  page: {
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '100vh',
    background: '#f7f7f5',
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
  },
  pageTitle: {
    fontSize: '22px',
    fontWeight: '600',
    color: '#0a1628',
    letterSpacing: '-0.02em',
    marginBottom: '4px',
  },
  pageSub: {
    fontSize: '13px',
    color: '#aaa',
  },
  companySelect: {
    fontFamily: 'system-ui,sans-serif',
    fontSize: '13px',
    padding: '8px 12px',
    border: '0.5px solid #e5e5e5',
    borderRadius: '8px',
    background: '#fff',
    color: '#111',
    outline: 'none',
    minWidth: '200px',
  },
  refreshBtn: {
    fontFamily: 'system-ui,sans-serif',
    fontSize: '12px',
    padding: '8px 14px',
    border: '0.5px solid #1D9E75',
    borderRadius: '8px',
    background: 'transparent',
    color: '#1D9E75',
    cursor: 'pointer',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: '#aaa',
    textAlign: 'center' as const,
  },
  tableWrap: {
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)',
    background: '#fff',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    tableLayout: 'fixed' as const,
  },
  th: {
    padding: '10px 8px',
    fontSize: '10px',
    fontWeight: '500',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.6)',
    whiteSpace: 'nowrap' as const,
  },
  tr: {
    transition: 'filter 0.1s',
  },
  td: {
    padding: '9px 8px',
    fontSize: '12px',
    color: '#333',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  editInput: {
    fontFamily: 'system-ui,sans-serif',
    fontSize: '12px',
    padding: '3px 6px',
    border: '1.5px solid #1D9E75',
    borderRadius: '5px',
    background: '#fff',
    color: '#111',
    outline: 'none',
    width: '80px',
    textAlign: 'right' as const,
  },
  legend: {
    display: 'flex',
    gap: '20px',
    marginTop: '12px',
    flexWrap: 'wrap' as const,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#888',
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
}