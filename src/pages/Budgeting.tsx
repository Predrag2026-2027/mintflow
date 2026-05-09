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
  classKey?: string
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
  if (variance > 0) return '#00D47E'
  if (variance < 0) return '#FF5B5A'
  return '#7A9BB8'
}

const CF_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  recurring:    { label: 'Recurring',    color: '#00D47E', bg: 'rgba(0,212,126,0.12)' },
  one_time:     { label: 'One-time',     color: '#F5A623', bg: 'rgba(245,166,35,0.12)' },
  accrual:      { label: 'Accrual',      color: '#4EA8FF', bg: 'rgba(78,168,255,0.12)' },
  capex:        { label: 'CapEx',        color: '#7A9BB8', bg: 'rgba(255,255,255,0.05)' },
  reimbursable: { label: 'Reimb.',       color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
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
        const rk = drill.rowKey
        let plCat = '', plSub = '', dept = '', deptSub = '', desc = ''

        if (rk.startsWith('leaf:')) {
          const parts = rk.slice(5).split('|')
          ;[plCat, plSub, dept, deptSub, desc] = parts
        } else if (rk.startsWith('dsub:')) {
          const parts = rk.slice(5).split('|')
          ;[plCat, plSub, dept, deptSub] = parts
        } else if (rk.startsWith('dept:')) {
          const parts = rk.slice(5).split('|')
          ;[plCat, plSub, dept] = parts
        } else if (rk.startsWith('sub:')) {
          const parts = rk.slice(4).split('|')
          ;[plCat, plSub] = parts
        } else if (rk.startsWith('cat:')) {
          plCat = rk.slice(4)
        }

        const [yr, mo] = drill.month.split('-').map(Number)
        const lastDay = new Date(yr, mo, 0).getDate()

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
          .lte('transaction_date', `${drill.month}-${String(lastDay).padStart(2, '0')}`)

        if (plCat) query = query.eq('pl_category', plCat)
        if (plSub) query = query.eq('pl_subcategory', plSub)
        if (dept) query = query.eq('department', dept)
        if (deptSub) query = query.eq('dept_subcategory', deptSub)
        if (desc) query = query.eq('expense_description', desc)

        const { data } = await query.order('transaction_date', { ascending: false })

        const mapped: DrillTx[] = (data || []).map((tx: any) => {
          const link = (tx.invoice_transaction_links as any[])?.[0]
          return {
            id: tx.id,
            transaction_date: tx.transaction_date,
            amount: tx.amount,
            amount_usd: tx.amount_usd,
            currency: tx.currency,
            partner_name: (tx.partners as any)?.name || '—',
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
            <div style={dm.headerKicker}>
              {drill.mode === 'actual' ? 'ACTUAL TRANSACTIONS' : 'BUDGET ESTIMATE'}
            </div>
            <div style={dm.headerTitle}>
              {drill.rowLabel}
            </div>
            <div style={dm.headerSub}>
              {drill.monthLabel}
              {drill.mode === 'actual' && !loading && (
                <span style={{ marginLeft: '12px', color: '#FF5B5A', fontWeight: '600', fontFamily: "'DM Mono', monospace" }}>
                  {fmtUSD(total)} total
                </span>
              )}
            </div>
          </div>
          <button style={dm.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div style={dm.body}>
          {loading ? (
            <div style={dm.empty}>Loading…</div>
          ) : drill.mode === 'actual' ? (
            txList.length === 0 ? (
              <div style={dm.empty}>No transactions found for this category and month.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {txList.map(tx => {
                  const cfBadge = tx.cf_type ? CF_BADGES[tx.cf_type] : null
                  return (
                    <div key={tx.id} style={dm.txRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#DCE9F6' }}>
                            {tx.partner_name}
                          </span>
                          {tx.is_invoice_driven && (
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(78,168,255,0.12)', color: '#4EA8FF', fontWeight: '500', letterSpacing: '0.02em' }}>
                              {tx.invoice_number || 'Invoice'}
                            </span>
                          )}
                          {cfBadge && (
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: cfBadge.bg, color: cfBadge.color, fontWeight: '500' }}>
                              {cfBadge.label}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#7A9BB8' }}>
                          {tx.transaction_date}
                          {tx.pl_category && <span> · {tx.pl_category}</span>}
                          {tx.department && <span> / {tx.department}</span>}
                          {tx.expense_description && <span> · {tx.expense_description}</span>}
                        </div>
                        {tx.note && (
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', marginTop: '3px', fontStyle: 'italic' }}>
                            {tx.note.slice(0, 80)}{tx.note.length > 80 ? '…' : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#FF5B5A', fontFamily: "'DM Mono', monospace" }}>
                          {tx.amount.toLocaleString()} {tx.currency}
                        </div>
                        {tx.currency !== 'USD' && (
                          <div style={{ fontSize: '11px', color: '#7A9BB8', fontFamily: "'DM Mono', monospace" }}>
                            ${tx.amount_usd?.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <button
                        style={dm.editBtn}
                        onClick={() => handleEdit(tx)}
                        title={tx.is_invoice_driven ? 'Edit invoice' : 'Edit transaction'}>
                        Edit
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            // Estimate mode
            <div style={{ padding: '8px 4px' }}>
              <div style={dm.infoBox}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#00D47E', marginBottom: '6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>How estimates work</div>
                <div style={{ fontSize: '13px', color: '#DCE9F6', lineHeight: 1.55 }}>
                  This estimate is auto-generated from recurring transactions tagged with Cash Flow Classification.
                  Click the estimate value in the table to manually override it.
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#7A9BB8', lineHeight: 1.55 }}>
                To change the estimate for <strong style={{ color: '#DCE9F6' }}>{drill.rowLabel}</strong> in <strong style={{ color: '#DCE9F6' }}>{drill.monthLabel}</strong>,
                close this panel and click the green estimate value in the table row.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={dm.footer}>
          {drill.mode === 'actual' && !loading && txList.length > 0 && (
            <div style={{ fontSize: '12px', color: '#7A9BB8' }}>
              {txList.length} transaction{txList.length !== 1 ? 's' : ''} · click Edit to modify
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
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [months, setMonths] = useState<MonthMeta[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ rowKey: string; month: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [drill, setDrill] = useState<DrillState | null>(null)
  const refresh = () => setRefreshTick(t => t + 1)

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

  const companyIds = companyId
    ? [companyId]
    : companies.map(c => c.id)

  useEffect(() => {
    if (months.length === 0 || companyIds.length === 0) return
    let cancelled = false

    const run = async () => {
      setLoading(true)

      const monthKeys = months.map(m => m.key)
      const firstMonth = monthKeys[0]
      const lastMonth = monthKeys[monthKeys.length - 1]

      const { data: actuals } = await supabase
        .from('transactions')
        .select('transaction_date, pl_category, pl_subcategory, department, dept_subcategory, expense_description, amount_usd, cf_type, cf_frequency, cf_next_month_est')
        .in('company_id', companyIds)
        .eq('tx_subtype', 'expense')
        .eq('status', 'posted')
        .gte('transaction_date', `${firstMonth}-01`)
        .lte('transaction_date', (() => { const [y,m] = lastMonth.split('-').map(Number); return `${lastMonth}-${new Date(y,m,0).getDate()}` })())

      const { data: budgetEntries } = await supabase
        .from('budget_entries')
        .select('*')
        .in('company_id', companyIds)
        .gte('budget_month', `${firstMonth}-01`)
        .lte('budget_month', `${lastMonth}-01`)

      const threeMonthsAgo = addMonths(monthKey(new Date()), -3)
      const { data: recurring } = await supabase
        .from('transactions')
        .select('pl_category, pl_subcategory, department, dept_subcategory, expense_description, amount_usd, cf_type, cf_frequency, cf_next_month_est, transaction_date')
        .in('company_id', companyIds)
        .eq('tx_subtype', 'expense')
        .eq('status', 'posted')
        .not('cf_type', 'is', null)
        .gte('transaction_date', `${threeMonthsAgo}-01`)

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

  const saveEdit = async (val?: string) => {
    if (!editing) return
    const row = rows.find(r => r.key === editing.rowKey)
    if (!row) return

    const parts = row.classKey?.split('|') || ['', '', '', '', '']
    const [plCat, plSub, dept, deptSub, desc] = parts
    const amount = parseFloat(val ?? editVal) || 0
    const budgetMonth = `${editing.month}-01`
    const targetCompanyId = companyId || (companies[0]?.id || '')

    // Close immediately so UI feels snappy
    setEditing(null)

    const { error } = await supabase.from('budget_entries').upsert({
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

    if (error) {
      console.error('[saveEdit] upsert failed:', error)
      alert(`Failed to save estimate: ${error.message}`)
    }
    refresh()
  }

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
      if (!row.hasChildren) {
        startEdit(row.key, m.key, row.cells[m.key]?.estimate || 0)
        return
      }
    }
    const leafClassKeys = row.hasChildren
      ? getLeafClassKeys(row.key)
      : (row.classKey ? [row.classKey] : [])

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

  // Totals
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
    { fontWeight: '600', fontSize: '12px', color: '#DCE9F6', background: 'rgba(255,255,255,0.025)' },
    { fontWeight: '500', fontSize: '12px', color: '#DCE9F6', background: 'transparent' },
    { fontWeight: '400', fontSize: '12px', color: '#7A9BB8', background: 'transparent' },
    { fontWeight: '400', fontSize: '11px', color: '#7A9BB8', background: 'transparent' },
  ] as const

  return (
    <div style={pg.page}>
      {/* Header */}
      <div style={pg.pageHeader}>
        <div>
          <div style={pg.pageTitle}>Budgeting</div>
          <div style={pg.pageSub}>
            Expense forecast · 3 months ahead · Actual vs Estimate
            {companyId === '' && companies.length > 0 && (
              <span style={{ marginLeft: '10px', color: '#F5A623', fontWeight: '500' }}>
                · Constel Group (all companies)
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            style={pg.companySelect}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            <option value="">Constel Group (consolidated)</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(companyId !== '' || companies.length > 0) && (
            <button style={pg.refreshBtn} onClick={refresh}>↻ Refresh</button>
          )}
        </div>
      </div>

      {companies.length === 0 && !loading ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '13px', color: '#7A9BB8' }}>Loading companies…</div>
        </div>
      ) : loading ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '13px', color: '#7A9BB8' }}>Loading budget data…</div>
          <div style={{ width: '200px', height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '16px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '60%', background: '#00D47E', borderRadius: '2px', animation: 'bgtpulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div style={pg.empty}>
          <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6', marginBottom: '8px' }}>No expense data yet</div>
          <div style={{ fontSize: '13px', color: '#7A9BB8' }}>Tag transactions with Cash Flow Classification to populate the budget</div>
        </div>
      ) : (
        <div style={pg.tableWrap}>
          <table style={pg.table}>
            <thead>
              <tr>
                <th style={{ ...pg.th, textAlign: 'left', width: '240px', paddingLeft: '16px', background: '#0A1525' }}>
                  Expense category
                </th>
                {months.map(m => (
                  <th key={m.key} colSpan={3} style={{
                    ...pg.th, textAlign: 'center',
                    color: m.isPast ? 'rgba(255,255,255,0.30)' : '#DCE9F6',
                    fontSize: '12px', fontWeight: '500', textTransform: 'none', letterSpacing: '0',
                    background: m.isPast ? '#070F1C' : '#0A1525',
                    borderLeft: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {m.isPast ? `← ${m.label}` : m.label}
                  </th>
                ))}
              </tr>
              <tr>
                <th style={{ ...pg.thSub, paddingLeft: '16px', textAlign: 'left' }}>
                  {companyId === '' ? 'All companies' : companies.find(c => c.id === companyId)?.name}
                </th>
                {months.map(m => (
                  <React.Fragment key={m.key}>
                    <th style={{ ...pg.thSub, color: m.isPast ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.45)', textAlign: 'right', paddingRight: '8px', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>ACTUAL</th>
                    <th style={{ ...pg.thSub, color: m.isPast ? 'rgba(255,255,255,0.20)' : '#5DCAA5', textAlign: 'right', paddingRight: '8px' }}>ESTIMATE</th>
                    <th style={{ ...pg.thSub, color: m.isPast ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.30)', textAlign: 'right', paddingRight: '12px' }}>VAR</th>
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
                  <tr key={row.key} style={{ background: style.background, borderBottom: row.level === 0 ? '1px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(255,255,255,0.03)' }}>
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
                          ? <span style={{ fontSize: '9px', color: '#7A9BB8', width: '12px', flexShrink: 0 }}>{isCollapsed ? '▶' : '▼'}</span>
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
                          {/* ACTUAL */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', borderLeft: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', 'Fira Mono', monospace" }}>
                            {cell.actual > 0 ? (
                              <span
                                style={{ color: '#FF8080', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'rgba(255,128,128,0.4)', textUnderlineOffset: '3px' }}
                                title="Click to view transactions"
                                onClick={() => openDrill(row, m, 'actual')}
                              >
                                {fmtUSD(cell.actual)}
                              </span>
                            ) : <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>}
                          </td>

                          {/* ESTIMATE */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', 'Fira Mono', monospace" }}>
                            {isEditingThis ? (
                              <input
                                autoFocus
                                type="number"
                                style={pg.editInput}
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const v = (e.target as HTMLInputElement).value
                                    saveEdit(v)
                                  }
                                  if (e.key === 'Escape') setEditing(null)
                                }}
                              />
                            ) : (
                              <span
                                style={{ color: cell.isManual ? '#4EA8FF' : (cell.estimate > 0 ? '#00D47E' : 'rgba(255,255,255,0.15)'), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title={cell.estimate > 0 ? 'Click to edit estimate' : 'Click to add estimate'}
                                onClick={() => openDrill(row, m, 'estimate')}
                              >
                                {cell.estimate > 0 ? fmtUSD(cell.estimate) : (canEdit ? <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: '10px', fontFamily: "'Inter', sans-serif" }}>+ add</span> : '—')}
                                {cell.isManual && <span style={{ fontSize: '8px', color: '#4EA8FF' }}>✎</span>}
                              </span>
                            )}
                          </td>

                          {/* VARIANCE */}
                          <td style={{ ...pg.td, textAlign: 'right', paddingRight: '12px', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', 'Fira Mono', monospace" }}>
                            {(cell.actual > 0 || cell.estimate > 0)
                              ? <span style={{ color: varianceColor(variance), fontSize: '11px', fontWeight: '500' }}>{variance === 0 ? '—' : fmtUSD(variance, true)}</span>
                              : <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>}
                          </td>
                        </React.Fragment>
                      )
                    })}
                  </tr>
                )
              })}

              {/* TOTALS */}
              <tr style={{ background: '#0A1525', borderTop: '2px solid #00D47E' }}>
                <td style={{ ...pg.td, paddingLeft: '16px', fontWeight: '700', fontSize: '11px', color: '#DCE9F6', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Total expenses
                </td>
                {months.map(m => {
                  const cell = totals[m.key] || { actual: 0, estimate: 0, isManual: false }
                  const variance = cell.estimate - cell.actual
                  return (
                    <React.Fragment key={m.key}>
                      <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', color: cell.actual > 0 ? '#FF8080' : 'rgba(255,255,255,0.20)', fontWeight: '600', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace", borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                        {cell.actual > 0 ? fmtUSD(cell.actual) : '—'}
                      </td>
                      <td style={{ ...pg.td, textAlign: 'right', paddingRight: '8px', color: '#00D47E', fontWeight: '600', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace" }}>
                        {cell.estimate > 0 ? fmtUSD(cell.estimate) : '—'}
                      </td>
                      <td style={{ ...pg.td, textAlign: 'right', paddingRight: '12px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace" }}>
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
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#FF8080' }} /> Actual — click to view transactions</div>
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#00D47E' }} /> Estimate — click to edit</div>
          <div style={pg.legendItem}><span style={{ ...pg.legendDot, background: '#4EA8FF' }} /> <span style={{ fontSize: '9px' }}>✎</span> Manual override</div>
          <div style={pg.legendItem}><span style={{ color: '#00D47E', fontWeight: '600' }}>+</span> Under budget · <span style={{ color: '#FF5B5A', fontWeight: '600' }}>−</span> Over budget</div>
        </div>
      )}

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
        tbody tr:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>
    </div>
  )
}

// ─── Styles (Obsidian) ───────────────────────────────────────────────────────

const pg: Record<string, React.CSSProperties> = {
  page: {
    padding: '24px 28px',
    fontFamily: "'Inter', system-ui, sans-serif",
    minHeight: '100vh',
    background: '#060E1A',
    color: '#DCE9F6',
  },
  pageHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: '1.25rem',
  },
  pageTitle: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '24px',
    fontWeight: '400',
    color: '#DCE9F6',
    letterSpacing: '-0.01em',
    marginBottom: '4px',
  },
  pageSub: {
    fontSize: '13px',
    color: '#7A9BB8',
  },
  companySelect: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '13px',
    padding: '7px 12px',
    border: '1px solid rgba(255,255,255,0.075)',
    borderRadius: '8px',
    background: '#0D1B2C',
    color: '#DCE9F6',
    outline: 'none',
    minWidth: '240px',
    cursor: 'pointer',
  },
  refreshBtn: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    padding: '7px 14px',
    border: '1px solid rgba(0,212,126,0.4)',
    borderRadius: '8px',
    background: 'rgba(0,212,126,0.08)',
    color: '#00D47E',
    cursor: 'pointer',
    fontWeight: '500',
  },
  empty: {
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    minHeight: '400px',
    color: '#7A9BB8',
    textAlign: 'center' as const,
    background: '#0D1B2C',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
  },
  tableWrap: {
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    background: '#0D1B2C',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    tableLayout: 'fixed' as const,
  },
  th: {
    padding: '11px 8px',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#DCE9F6',
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  thSub: {
    padding: '7px 8px',
    fontSize: '9.5px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    background: '#0A1525',
    borderBottom: '1px solid rgba(0,212,126,0.25)',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '9px 8px',
    fontSize: '12px',
    color: '#DCE9F6',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  editInput: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '12px',
    padding: '4px 6px',
    border: '1.5px solid #00D47E',
    borderRadius: '5px',
    background: '#0A1525',
    color: '#DCE9F6',
    outline: 'none',
    width: '80px',
    textAlign: 'right' as const,
  },
  legend: {
    display: 'flex',
    gap: '20px',
    marginTop: '14px',
    flexWrap: 'wrap' as const,
    padding: '10px 14px',
    background: '#0D1B2C',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#7A9BB8',
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
}

const dm: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1001,
  },
  modal: {
    background: '#0D1B2C',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '16px',
    width: '760px', maxWidth: '95vw', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
  },
  header: {
    background: '#0A1525',
    padding: '1.1rem 1.5rem',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerKicker: {
    color: '#00D47E',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    marginBottom: '4px',
  },
  headerTitle: {
    color: '#DCE9F6',
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '18px',
    fontWeight: '400',
    marginBottom: '3px',
    letterSpacing: '-0.01em',
  },
  headerSub: {
    color: '#7A9BB8',
    fontSize: '12px',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#7A9BB8',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    lineHeight: 1,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: '1.25rem 1.5rem',
    overflowY: 'auto' as const,
    flex: 1,
  },
  empty: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#7A9BB8',
    fontSize: '13px',
  },
  footer: {
    padding: '0.75rem 1.5rem',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center',
    background: '#0A1525',
  },
  txRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '11px 14px',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
    background: '#111F30',
    marginBottom: '4px',
    transition: 'border-color 0.15s, background 0.15s',
  },
  editBtn: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '11px',
    fontWeight: '500',
    padding: '5px 12px',
    border: '1px solid rgba(0,212,126,0.4)',
    borderRadius: '6px',
    background: 'rgba(0,212,126,0.08)',
    color: '#00D47E',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  closeFooterBtn: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '13px',
    padding: '7px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'transparent',
    color: '#7A9BB8',
    cursor: 'pointer',
  },
  infoBox: {
    background: 'rgba(0,212,126,0.06)',
    border: '1px solid rgba(0,212,126,0.25)',
    borderRadius: '10px',
    padding: '14px 16px',
    marginBottom: '14px',
  },
}