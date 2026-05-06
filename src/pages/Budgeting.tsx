import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import TransactionDialog from '../components/TransactionDialog'
import InvoiceDialog from '../components/InvoiceDialog'

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
  level: 0 | 1 | 2 | 3
  parent?: string
  cells: Record<string, BudgetCell>
  hasChildren: boolean
  classKey?: string // "pl_cat|pl_sub|dept|dept_sub|desc" for drill-down
}

interface MonthMeta {
  key: string
  label: string
  isPast: boolean
}

interface DrillTx {
  id: string
  transaction_date: string
  amount: number
  amount_usd: number
  currency: string
  partner_name: string
  pl_category: string
  department: string
  expense_description: string
  cf_type: string | null
  type: string
  note: string | null
  // invoice linkage
  invoice_id?: string
  invoice_number?: string
  is_invoice_driven?: boolean
}

interface DrillState {
  rowKey: string
  rowLabel: string
  month: string
  monthLabel: string
  mode: 'actual' | 'estimate'
  classKey?: string
  // for parent rows — list of leaf classKeys
  leafClassKeys?: string[]
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
  if (variance > 0) return '#1D9E75'
  if (variance < 0) return '#E24B4A'
  return '#888'
}

const CF_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  recurring:    { label: '🔁 Recurring',    color: '#085041', bg: '#E1F5EE' },
  one_time:     { label: '1️⃣ One-time',     color: '#633806', bg: '#FAEEDA' },
  accrual:      { label: '📅 Accrual',      color: '#0C447C', bg: '#E6F1FB' },
  capex:        { label: '🏗 CapEx',        color: '#555',    bg: '#f0f0ee' },
  reimbursable: { label: '↩️ Reimb.',       color: '#6B21A8', bg: '#F3E8FF' },
}

// ─── Drill-down Modal ────────────────────────────────────────────────────────

function DrillModal({
  drill, companyIds, allRows,
  onClose, onEditDone,
}: {
  drill: DrillState
  companyIds: string[]
  allRows: BudgetRow[]
  onClose: () => void
  onEditDone: () => void
}) {
  const [txList, setTxList] = useState<DrillTx[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTx, setEditingTx] = useState<any | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      if (drill.mode === 'actual') {
        // Build pl_category filter from classKey
        const classKey = drill.classKey
        const [plCat, plSub, dept, deptSub, desc] = (classKey || '||||').split('|')

        // Get leaf classKeys for parent rows
        const leafKeys = drill.leafClassKeys || (classKey ? [classKey] : [])

        // Build filters for each leaf
        let query = supabase
          .from('transactions')
          .select(`
            id, transaction_date, amount, amount_usd, currency,
            pl_category, pl_subcategory, department, dept_subcategory,
            expense_description, cf_type, type, note, status,
            partners(name),
            invoice_transaction_links(
              invoice_id,
              invoices(id, invoice_number)
            )
          `)
          .in('company_id', companyIds)
          .eq('tx_subtype', 'expense')
          .eq('status', 'posted')
          .gte('transaction_date', `${drill.month}-01`)
          .lte('transaction_date', `${drill.month}-31`)

        // Filter by classification
        if (plCat) query = query.eq('pl_category', plCat)
        if (plSub) query = query.eq('pl_subcategory', plSub)
        if (dept) query = query.eq('department', dept)
        if (deptSub) query = query.eq('dept_subcategory', deptSub)
        if (desc) query = query.eq('expense_description', desc)

        const { data } = await query.order('transaction_date', { ascending: false })

        const mapped: DrillTx[] = (data || []).map((tx: any) => {
          const link = tx.invoice_transaction_links?.[0]
          return {
            id: tx.id,
            transaction_date: tx.transaction_date,
            amount: tx.amount,
            amount_usd: tx.amount_usd,
            currency: tx.currency,
            partner_name: tx.partners?.name || '—',
            pl_category: tx.pl_category || '—',
            department: tx.department || '—',
            expense_description: tx.expense_description || '',
            cf_type: tx.cf_type,
            type: tx.type,
            note: tx.note,
            invoice_id: link?.invoice_id,
            invoice_number: link?.invoices?.invoice_number,
            is_invoice_driven: !!link?.invoice_id,
          }
        })
        setTxList(mapped)
      }
      setLoading(false)
    }
    load()
  }, [drill, companyIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = async (tx: DrillTx) => {
    // Fetch full transaction or invoice object for dialog
    if (tx.is_invoice_driven && tx.invoice_id) {
      const { data } = await supabase
        .from('invoices')
        .select('*, partners(name)')
        .eq('id', tx.invoice_id)
        .single()
      if (data) setEditingInvoice(data)
    } else {
      const { data } = await supabase
        .from('transactions')
        .select('*, partners(name), banks(name)')
        .eq('id', tx.id)
        .single()
      if (data) setEditingTx(data)
    }
  }

  const handleEditDone = () => {
    setEditingTx(null)
    setEditingInvoice(null)
    onEditDone()
    // Reload drill list
    setLoading(true)
    setTxList([])
  }

  const total = txList.reduce((s, t) => s + (t.amount_usd || 0), 0)

  if (editingTx) return (
    <TransactionDialog
      transaction={editingTx}
      onClose={handleEditDone}
    />
  )

  if (editingInvoice) return (
    <InvoiceDialog
      invoice={editingInvoice}
      onClose={handleEditDone}
    />
  )

  return (
    <div style={dm.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={dm.modal}>
        {/* Header */}
        <div style={dm.header}>
          <div>
            <div style={dm.headerTitle}>
              {drill.mode === 'actual' ? '📊 Actual transactions' : '🎯 Budget estimate'}
            </div>
            <div style={dm.headerSub}>
              {drill.rowLabel} · {drill.monthLabel}
              {drill.mode === 'actual' && !loading && (
                <span style={{ marginLeft: '10px', color: '#FF8080', fontWeight: '600' }}>
                  {fmtUSD(total)} total
                </span>
              )}
            </div>
          </div>
          <button style={dm.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div style={dm.body}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
              Loading...
            </div>
          ) : drill.mode === 'actual' ? (
            txList.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
                No transactions found for this category and month.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {txList.map(tx => {
                  const cfBadge = tx.cf_type ? CF_BADGES[tx.cf_type] : null
                  return (
                    <div key={tx.id} style={dm.txRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>
                            {tx.partner_name}
                          </span>
                          {tx.is_invoice_driven && (
                            <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: '#E6F1FB', color: '#0C447C', fontWeight: '500' }}>
                              💳 {tx.invoice_number || 'Invoice'}
                            </span>
                          )}
                          {cfBadge && (
                            <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: cfBadge.bg, color: cfBadge.color, fontWeight: '500' }}>
                              {cfBadge.label}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          {tx.transaction_date}
                          {tx.pl_category && <span> · {tx.pl_category}</span>}
                          {tx.department && <span> / {tx.department}</span>}
                          {tx.expense_description && <span> · {tx.expense_description}</span>}
                        </div>
                        {tx.note && (
                          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px', fontStyle: 'italic' }}>
                            {tx.note.slice(0, 80)}{tx.note.length > 80 ? '...' : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#A32D2D' }}>
                          {tx.amount.toLocaleString()} {tx.currency}
                        </div>
                        {tx.currency !== 'USD' && (
                          <div style={{ fontSize: '11px', color: '#aaa' }}>
                            ${tx.amount_usd?.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <button
                        style={dm.editBtn}
                        onClick={() => handleEdit(tx)}
                        title={tx.is_invoice_driven ? 'Edit invoice' : 'Edit transaction'}>
                        {tx.is_invoice_driven ? '🧾 Edit invoice' : '✏️ Edit'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            // Estimate mode — show info + inline edit hint
            <div style={{ padding: '20px' }}>
              <div style={{ background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '10px', padding: '16px', fontSize: '13px', color: '#085041', marginBottom: '16px' }}>
                💡 This estimate is auto-generated from recurring transactions tagged with Cash Flow Classification.
                Click the estimate value in the table to manually override it.
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                To change the estimate for <strong>{drill.rowLabel}</strong> in <strong>{drill.monthLabel}</strong>,
                close this panel and click the green estimate value in the table row.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={dm.footer}>
          {drill.mode === 'actual' && !loading && txList.length > 0 && (
            <div style={{ fontSize: '12px', color: '#888' }}>
              {txList.length} transaction{txList.length !== 1 ? 's' : ''} · click ✏️ Edit to modify
            </div>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button style={dm.closeFooterBtn} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Budgeting() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState('')   // '' = all (Constel Group)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [months, setMonths] = useState<MonthMeta[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ rowKey: string; month: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [drill, setDrill] = useState<DrillState | null>(null)
  const refresh = () => setRefreshTick(t => t + 1)

  // Build 4-month window: previous + current + 2 ahead
  useEffect(() => {
    const now = new Date()
    const cur = monthKey(now)
    const prev = addMonths(cur, -1)
    const mths: MonthMeta[] = [
      { key: prev, label: monthLabel(prev), isPast: true },
      ...[0, 1, 2].map(i => ({ key: addMonths(cur, i), label: monthLabel(addMonths(cur, i)), isPast: false })),
    ]
    setMonths(mths)
  }, [])

  useEffect(() => {
    supabase.from('companies').select('id,name').order('name').then(({ data }) => {
      if (data) setCompanies(data)
    })
  }, [])

  // companyIds to query — '' means all companies
  const companyIds = companyId
    ? [companyId]
    : companies.map(c => c.id)

  // ── Load budget data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (months.length === 0 || companyIds.length === 0) return
    let cancelled = false

    const run = async () => {
      setLoading(true)

      const monthKeys = months.map(m => m.key)
      const firstMonth = monthKeys[0]
      const lastMonth = monthKeys[monthKeys.length - 1]

      // 1. Actuals
      const { data: actuals } = await supabase
        .from('transactions')
        .select('transaction_date, pl_category, pl_subcategory, department, dept_subcategory, expense_description, amount_usd, cf_type, cf_frequency, cf_next_month_est')
        .in('company_id', companyIds)
        .eq('tx_subtype', 'expense')
        .eq('status', 'posted')
        .gte('transaction_date', `${firstMonth}-01`)
        .lte('transaction_date', `${lastMonth}-31`)

      // 2. Budget entries
      const { data: budgetEntries } = await supabase
        .from('budget_entries')
        .select('*')
        .in('company_id', companyIds)
        .gte('budget_month', `${firstMonth}-01`)
        .lte('budget_month', `${lastMonth}-01`)

      // 3. Recurring from last 3 months
      const threeMonthsAgo = addMonths(monthKey(new Date()), -3)
      const { data: recurring } = await supabase
        .from('transactions')
        .select('pl_category, pl_subcategory, department, dept_subcategory, expense_description, amount_usd, cf_type, cf_frequency, cf_next_month_est, transaction_date')
        .in('company_id', companyIds)
        .eq('tx_subtype', 'expense')
        .eq('status', 'posted')
        .not('cf_type', 'is', null)
        .gte('transaction_date', `${threeMonthsAgo}-01`)

      // ── Build maps ────────────────────────────────────────────────────────

      const makeKey = (t: any) => [
        t.pl_category || '', t.pl_subcategory || '',
        t.department || '', t.dept_subcategory || '',
        t.expense_description || '',
      ].join('|')

      const actualMap: Record<string, Record<string, number>> = {}
      for (const tx of (actuals || [])) {
        const mk = monthKey(new Date(tx.transaction_date))
        const ck = makeKey(tx)
        if (!actualMap[ck]) actualMap[ck] = {}
        actualMap[ck][mk] = (actualMap[ck][mk] || 0) + (tx.amount_usd || 0)
      }

      const estimateMap: Record<string, Record<string, { amount: number }>> = {}
      for (const tx of (recurring || [])) {
        const ck = makeKey(tx)
        if (!estimateMap[ck]) estimateMap[ck] = {}
        const est = tx.cf_next_month_est || tx.amount_usd || 0
        const monthly = tx.cf_frequency === 'quarterly' ? est / 3
          : tx.cf_frequency === 'yearly' ? est / 12 : est
        for (const mk of monthKeys) {
          if (!estimateMap[ck][mk] || estimateMap[ck][mk].amount < monthly) {
            estimateMap[ck][mk] = { amount: monthly }
          }
        }
      }

      const manualMap: Record<string, Record<string, { amount: number; note?: string }>> = {}
      for (const be of (budgetEntries || [])) {
        const ck = makeKey(be)
        const mk = monthKey(new Date(be.budget_month))
        if (!manualMap[ck]) manualMap[ck] = {}
        manualMap[ck][mk] = { amount: be.estimated_amount_usd || be.estimated_amount || 0, note: be.note }
      }

      const allKeys = new Set<string>([
        ...Object.keys(actualMap),
        ...Object.keys(estimateMap),
        ...Object.keys(manualMap),
      ])

      // ── Build hierarchy ───────────────────────────────────────────────────

      const rowMap: Record<string, BudgetRow> = {}

      const ensureRow = (key: string, label: string, level: 0 | 1 | 2 | 3, parent?: string, classKey?: string) => {
        if (!rowMap[key]) {
          rowMap[key] = { key, label, level, parent, cells: {}, hasChildren: false, classKey }
          if (parent && rowMap[parent]) rowMap[parent].hasChildren = true
        }
      }

      for (const ck of allKeys) {
        if (!ck || ck === '||||') continue
        const [plCat, plSub, dept, deptSub, desc] = ck.split('|')
        if (!plCat && !dept) continue

        const catKey = `cat:${plCat}`
        ensureRow(catKey, plCat || 'Uncategorized', 0)

        let subKey = catKey
        if (plSub) {
          subKey = `sub:${plCat}|${plSub}`
          ensureRow(subKey, plSub, 1, catKey)
        }

        let deptKey = subKey
        if (dept) {
          deptKey = `dept:${plCat}|${plSub}|${dept}`
          ensureRow(deptKey, dept, 2, subKey)
        }

        let deptSubKey = deptKey
        if (deptSub) {
          deptSubKey = `dsub:${plCat}|${plSub}|${dept}|${deptSub}`
          ensureRow(deptSubKey, deptSub, 3, deptKey)
        }

        const leafKey = desc ? `leaf:${ck}` : deptSubKey !== deptKey ? deptSubKey : deptKey
        if (desc && leafKey !== deptSubKey) ensureRow(leafKey, desc, 3, deptSubKey, ck)

        const row = rowMap[leafKey]
        if (!row) continue
        if (!row.classKey) row.classKey = ck

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

      // Bubble up to parents (deepest first)
      const sortedKeys = Object.keys(rowMap).sort((a, b) => rowMap[b].level - rowMap[a].level)
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

      // Build ordered list
      const finalRows = Object.values(rowMap)
      const ordered: BudgetRow[] = []
      const visited = new Set<string>()

      const addRow = (key: string) => {
        if (visited.has(key)) return
        visited.add(key)
        const row = rowMap[key]
        if (!row) return
        ordered.push(row)
        const children = finalRows.filter(r => r.parent === key)
        children.sort((a, b) => a.label.localeCompare(b.label))
        for (const child of children) addRow(child.key)
      }

      const roots = finalRows.filter(r => !r.parent)
      roots.sort((a, b) => a.label.localeCompare(b.label))
      for (const root of roots) addRow(root.key)

      if (!cancelled) {
        setRows(ordered)
        setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [companyId, months, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const isVisible = (row: BudgetRow): boolean => {
    if (!row.parent) return true
    const rowByKey = Object.fromEntries(rows.map(r => [r.key, r]))
    const ancestors: string[] = []
    let cur = row.parent
    while (cur) {
      ancestors.push(cur)
      cur = rowByKey[cur]?.parent || ''
    }
    return ancestors.every(a => !collapsed.has(a))
  }

  const startEdit = (rowKey: string, month: string, currentEst: number) => {
    setEditing({ rowKey, month })
    setEditVal(currentEst > 0 ? currentEst.toFixed(0) : '')
  }

  const saveEdit = async () => {
    if (!editing) return
    const row = rows.find(r => r.key === editing.rowKey)
    if (!row) return

    const parts = row.classKey?.split('|') || ['', '', '', '', '']
    const [plCat, plSub, dept, deptSub, desc] = parts
    const amount = parseFloat(editVal) || 0
    const budgetMonth = `${editing.month}-01`
    const targetCompanyId = companyId || (companies[0]?.id || '')

    await supabase.from('budget_entries').upsert({
      company_id: targetCompanyId,
      budget_month: budgetMonth,
      pl_category: plCat || null,
      pl_subcategory: plSub || null,
      department: dept || null,
      dept_subcategory: deptSub || null,
      expense_description: desc || null,
      estimated_amount: amount,
      estimated_amount_usd: amount,
      is_manual_override: true,
    }, { onConflict: 'company_id,budget_month,pl_category,pl_subcategory,department,dept_subcategory,expense_description', ignoreDuplicates: false })

    setEditing(null)
    refresh()
  }

  // Get all leaf classKeys under a row (for parent drill-down)
  const getLeafClassKeys = (rowKey: string): string[] => {
    const descendants = rows.filter(r => {
      const rowByKey = Object.fromEntries(rows.map(x => [x.key, x]))
      let cur = r.parent
      while (cur) {
        if (cur === rowKey) return true
        cur = rowByKey[cur]?.parent || ''
      }
      return false
    })
    return descendants.filter(r => !r.hasChildren && r.classKey).map(r => r.classKey!)
  }

  const openDrill = (row: BudgetRow, m: MonthMeta, mode: 'actual' | 'estimate') => {
    if (mode === 'estimate') {
      // For estimate — just show info panel or open inline edit
      if (!row.hasChildren) {
        startEdit(row.key, m.key, row.cells[m.key]?.estimate || 0)
        return
      }
    }
    const leafClassKeys = row.hasChildren ? getLeafClassKeys(row.key) : undefined
    setDrill({
      rowKey: row.key,
      rowLabel: row.label,
      month: m.key,
      monthLabel: m.label,
      mode,
      classKey: row.classKey,
      leafClassKeys,
    })
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

  const levelIndent = [0, 20, 36, 50]
  const levelStyles = [
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
          <div style={pg.pageSub}>
            Expense forecast · 3 months ahead · Actual vs Estimate
            {companyId === '' && companies.length > 0 && (
              <span style={{ marginLeft: '8px', color: '#E6B432', fontWeight: '500' }}>
                · Constel Group (all companies)
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            style={pg.companySelect}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            <option value="">🏢 Constel Group (consolidated)</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(companyId !== '' || companies.length > 0) && (
            <button style={pg.refreshBtn} onClick={refresh}>↻ Refresh</button>
          )}
        </div>
      </div>

      {companies.length === 0 && !loading ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '13px', color: '#aaa' }}>Loading companies...</div>
        </div>
      ) : loading ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '13px', color: '#aaa' }}>Loading budget data...</div>
          <div style={{ width: '200px', height: '4px', background: '#e5e5e5', borderRadius: '2px', marginTop: '16px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '60%', background: '#1D9E75', borderRadius: '2px', animation: 'bgtpulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🌱</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: '#333', marginBottom: '8px' }}>No expense data yet</div>
          <div style={{ fontSize: '13px', color: '#aaa' }}>Tag transactions with Cash Flow Classification to populate the budget</div>
        </div>
      ) : (
        <div style={pg.tableWrap}>
          <table style={pg.table}>
            <thead>
              <tr style={{ background: '#0a1628' }}>
                <th style={{ ...pg.th, textAlign: 'left', width: '240px', color: '#fff', paddingLeft: '16px' }}>
                  Expense category
                </th>
                {months.map(m => (
                  <th key={m.key} colSpan={3} style={{
                    ...pg.th, textAlign: 'center',
                    color: m.isPast ? 'rgba(255,255,255,0.4)' : '#fff',
                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '12px', fontWeight: '500',
                    background: m.isPast ? 'rgba(0,0,0,0.15)' : 'transparent',
                  }}>
                    {m.isPast ? `◀ ${m.label}` : m.label}
                  </th>
                ))}
              </tr>
              <tr style={{ background: '#0d1e38', borderBottom: '2px solid #1D9E75' }}>
                <th style={{ ...pg.th, textAlign: 'left', paddingLeft: '16px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '400' }}>
                  {companyId === '' ? '🏢 All companies' : companies.find(c => c.id === companyId)?.name}
                </th>
                {months.map(m => (
                  <React.Fragment key={m.key}>
                    <th style={{ ...pg.th, color: m.isPast ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)', fontSize: '10px', fontWeight: '500', letterSpacing: '0.07em', textAlign: 'right', paddingRight: '8px', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>ACTUAL</th>
                    <th style={{ ...pg.th, color: m.isPast ? 'rgba(255,255,255,0.25)' : '#5DCAA5', fontSize: '10px', fontWeight: '500', letterSpacing: '0.07em', textAlign: 'right', paddingRight: '8px' }}>ESTIMATE</th>
                    <th style={{ ...pg.th, color: m.isPast ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.35)', fontSize: '10px', fontWeight: '500', letterSpacing: '0.07em', textAlign: 'right', paddingRight: '12px' }}>VAR</th>
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
                  <tr key={row.key} style={{ ...pg.tr, background: style.background, borderBottom: row.level === 0 ? '1px solid #e5e5e5' : '0.5px solid #f0f0ee' }}>
                    <td style={{
                      ...pg.td,
                      paddingLeft: `${16 + levelIndent[row.level]}px`,
                      fontWeight: style.fontWeight,
                      fontSize: style.fontSize,
                      color: style.color,
                      cursor: isCollapsible ? 'pointer' : 'default',
                      userSelect: 'none',
                    }} onClick={() => isCollapsible && toggleCollapse(row.key)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isCollapsible
                          ? <span style={{ fontSize: '10px', color: '#bbb', width: '12px', flexShrink: 0 }}>{isCollapsed ? '▶' : '▼'}</span>
                          : <span style={{ width: '12px', flexShrink: 0 }} />
                        }
                        {row.label}
                      </div>
                    </td>

                    {months.map(m => {
                      const cell = row.cells[m.key] || { actual: 0, estimate: 0, isManual: false }
                      const variance = cell.estimate - cell.actual
                      const isEditingThis = editing?.rowKey === row.key && editing?.month === m.key
                      const canEdit = !row.hasChildren

                      return (
                        <React.Fragment key={m.key}>
                          {/* ── ACTUAL ── clickable */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', borderLeft: '1px solid #f0f0ee', fontVariantNumeric: 'tabular-nums' }}>
                            {cell.actual > 0 ? (
                              <span
                                style={{ color: '#A32D2D', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                                title="Click to view transactions"
                                onClick={() => openDrill(row, m, 'actual')}
                              >
                                {fmtUSD(cell.actual)}
                              </span>
                            ) : <span style={{ color: '#ddd' }}>—</span>}
                          </td>

                          {/* ── ESTIMATE ── clickable / editable */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', fontVariantNumeric: 'tabular-nums' }}>
                            {isEditingThis ? (
                              <input
                                autoFocus
                                type="number"
                                style={pg.editInput}
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                                onBlur={saveEdit}
                              />
                            ) : (
                              <span
                                style={{ color: cell.isManual ? '#185FA5' : (cell.estimate > 0 ? '#1D9E75' : '#ccc'), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                title={cell.estimate > 0 ? 'Click to edit estimate' : 'Click to add estimate'}
                                onClick={() => openDrill(row, m, 'estimate')}
                              >
                                {cell.estimate > 0 ? fmtUSD(cell.estimate) : (canEdit ? <span style={{ color: '#ddd', fontSize: '10px' }}>+ add</span> : '—')}
                                {cell.isManual && <span style={{ fontSize: '8px', color: '#7FB8EE' }}>✎</span>}
                              </span>
                            )}
                          </td>

                          {/* ── VARIANCE ── */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '12px', fontVariantNumeric: 'tabular-nums' }}>
                            {(cell.actual > 0 || cell.estimate > 0)
                              ? <span style={{ color: varianceColor(variance), fontSize: '11px', fontWeight: '500' }}>{variance === 0 ? '—' : fmtUSD(variance, true)}</span>
                              : <span style={{ color: '#ddd' }}>—</span>}
                          </td>
                        </React.Fragment>
                      )
                    })}
                  </tr>
                )
              })}

              {/* TOTALS */}
              <tr style={{ background: '#0a1628', borderTop: '2px solid #1D9E75' }}>
                <td style={{ ...pg.td, paddingLeft: '16px', fontWeight: '700', fontSize: '12px', color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  TOTAL EXPENSES
                </td>
                {months.map(m => {
                  const cell = totals[m.key] || { actual: 0, estimate: 0, isManual: false }
                  const variance = cell.estimate - cell.actual
                  return (
                    <React.Fragment key={m.key}>
                      <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', color: cell.actual > 0 ? '#FF8080' : 'rgba(255,255,255,0.25)', fontWeight: '600', fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
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

      {/* Legend */}
      {rows.length > 0 && (
        <div style={pg.legend}>
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#A32D2D' }} /> Actual — click to view transactions</div>
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#1D9E75' }} /> Estimate — click to edit</div>
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#185FA5' }} /> <span style={{ fontSize: '9px' }}>✎</span> Manual override</div>
          <div style={pg.legendItem}><span style={{ color: '#1D9E75' }}>+</span> Under budget · <span style={{ color: '#E24B4A' }}>−</span> Over budget</div>
        </div>
      )}

      {/* Drill-down modal */}
      {drill && (
        <DrillModal
          drill={drill}
          companyIds={companyIds}
          allRows={rows}
          onClose={() => setDrill(null)}
          onEditDone={() => { setDrill(null); refresh() }}
        />
      )}

      <style>{`
        @keyframes bgtpulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        tbody tr:hover { filter: brightness(0.97); }
      `}</style>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pg: Record<string, React.CSSProperties> = {
  page: { padding: '2rem', fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh', background: '#f7f7f5' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle: { fontSize: '22px', fontWeight: '600', color: '#0a1628', letterSpacing: '-0.02em', marginBottom: '4px' },
  pageSub: { fontSize: '13px', color: '#aaa' },
  companySelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 12px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none', minWidth: '240px' },
  refreshBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '8px 14px', border: '0.5px solid #1D9E75', borderRadius: '8px', background: 'transparent', color: '#1D9E75', cursor: 'pointer' },
  empty: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: '#aaa', textAlign: 'center' as const },
  tableWrap: { borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08),0 4px 16px rgba(0,0,0,0.04)', background: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse' as const, tableLayout: 'fixed' as const },
  th: { padding: '10px 8px', fontSize: '10px', fontWeight: '500', letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' as const },
  tr: { transition: 'filter 0.1s' },
  td: { padding: '9px 8px', fontSize: '12px', color: '#333', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  editInput: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '3px 6px', border: '1.5px solid #1D9E75', borderRadius: '5px', background: '#fff', color: '#111', outline: 'none', width: '80px', textAlign: 'right' as const },
  legend: { display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap' as const },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888' },
  legendDot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
}

const dm: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 },
  modal: { background: '#fff', borderRadius: '16px', width: '760px', maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  header: { background: '#0a1628', padding: '1rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: '15px', fontWeight: '500', marginBottom: '3px' },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: '12px' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '24px', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 },
  body: { padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '0.75rem 1.5rem', borderTop: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', background: '#f5f5f3' },
  txRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '0.5px solid #e5e5e5', borderRadius: '10px', background: '#fff', marginBottom: '4px' },
  editBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 12px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  closeFooterBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
}