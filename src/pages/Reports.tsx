import React, { useState, useEffect, useCallback } from 'react'
import { NavContext } from '../App'
import type { Page } from '../App'
import { supabase } from '../supabase'
import InvoiceDialog from '../components/InvoiceDialog'

// ─── Types ──────────────────────────────────────────────────────────────────
interface KPI {
  revenueYTD: number
  expensesYTD: number
  netProfitYTD: number
  unpaidReceivables: number
  unpaidPayables: number
  cashOnHand: number
  upcomingExpenses30d: number
  overdueCount: number
}

interface UnpaidInvoice {
  id: string
  invoice_number: string
  partner_name: string
  company_name: string
  invoice_date: string
  due_date: string | null
  amount: number
  amount_usd: number
  currency: string
  outstanding_amount: number
  outstanding_amount_usd: number
  type: 'receivable' | 'payable'
  days_overdue: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtUSD(n: number, compact = false): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`
  }
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function Reports() {
  const { setPage } = React.useContext(NavContext)
  const [kpi, setKpi] = useState<KPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUnpaid, setShowUnpaid] = useState<'receivables' | 'payables' | null>(null)

  const loadKPI = useCallback(async () => {
    setLoading(true)
    const yr = new Date().getFullYear()
    const start = `${yr}-01-01`
    const end = `${yr}-12-31`

    const [
      { data: txs },
      { data: invR },
      { data: invP },
      { data: banks },
      { data: upcoming },
    ] = await Promise.all([
      supabase.from('transactions').select('amount_usd, tx_subtype').eq('status', 'posted').gte('transaction_date', start).lte('transaction_date', end),
      supabase.from('invoices').select('outstanding_amount_usd, due_date').eq('type', 'receivable').neq('status', 'paid').neq('status', 'cancelled'),
      supabase.from('invoices').select('outstanding_amount_usd, due_date').eq('type', 'payable').neq('status', 'paid').neq('status', 'cancelled'),
      supabase.from('banks').select('current_balance_usd'),
      supabase.from('transactions').select('amount_usd').eq('tx_subtype', 'expense').eq('status', 'pending').gte('transaction_date', new Date().toISOString().split('T')[0]).lte('transaction_date', new Date(Date.now() + 30*24*3600*1000).toISOString().split('T')[0]),
    ])

    const revenueYTD = (txs || []).filter(t => t.tx_subtype === 'income').reduce((s, t) => s + (t.amount_usd || 0), 0)
    const expensesYTD = (txs || []).filter(t => t.tx_subtype === 'expense').reduce((s, t) => s + (t.amount_usd || 0), 0)
    const unpaidReceivables = (invR || []).reduce((s, i) => s + (i.outstanding_amount_usd || 0), 0)
    const unpaidPayables = (invP || []).reduce((s, i) => s + (i.outstanding_amount_usd || 0), 0)
    const cashOnHand = (banks || []).reduce((s, b) => s + (b.current_balance_usd || 0), 0)
    const upcomingExpenses30d = (upcoming || []).reduce((s, t) => s + (t.amount_usd || 0), 0)
    const today = new Date().toISOString().split('T')[0]
    const overdueCount = [...(invR || []), ...(invP || [])].filter(i => i.due_date && i.due_date < today).length

    setKpi({
      revenueYTD, expensesYTD, netProfitYTD: revenueYTD - expensesYTD,
      unpaidReceivables, unpaidPayables, cashOnHand, upcomingExpenses30d, overdueCount,
    })
    setLoading(false)
  }, [])

  useEffect(() => { loadKPI() }, [loadKPI])

  const reportCards = [
    { id: 'pl',           title: 'Profit & Loss',      desc: 'Income vs expenses, by month and category',     page: 'pl' as Page },
    { id: 'cashflow',     title: 'Cash Flow',          desc: 'Cash position, runway, and projections',        page: 'cashflow' as Page },
    { id: 'budgeting',    title: 'Budgeting',          desc: 'Forecast vs actual, 3-month outlook',           page: 'budgeting' as Page },
    { id: 'transactions', title: 'Transactions',       desc: 'Full transaction ledger with filters',          page: 'transactions' as Page },
    { id: 'invoices',     title: 'Invoices',           desc: 'AR/AP aging, unpaid, partial, paid',            page: 'invoices' as Page },
    { id: 'partners',     title: 'Partners',           desc: 'Customer & vendor performance',                  page: 'partners' as Page },
  ]

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageTitle}>Reports</div>
          <div style={s.pageSub}>Financial overview and detailed analytics</div>
        </div>
        <button style={s.refreshBtn} onClick={loadKPI}>↻ Refresh</button>
      </div>

      {/* KPI Strip */}
      <div style={s.kpiGrid}>
        <KPICard label="Revenue YTD"      value={loading ? '—' : fmtUSD(kpi?.revenueYTD || 0, true)}      accent="#00D47E" />
        <KPICard label="Expenses YTD"     value={loading ? '—' : fmtUSD(kpi?.expensesYTD || 0, true)}     accent="#FF5B5A" />
        <KPICard label="Net Profit YTD"   value={loading ? '—' : fmtUSD(kpi?.netProfitYTD || 0, true)}    accent={kpi && kpi.netProfitYTD >= 0 ? '#00D47E' : '#FF5B5A'} />
        <KPICard label="Cash on Hand"     value={loading ? '—' : fmtUSD(kpi?.cashOnHand || 0, true)}      accent="#4EA8FF" />
      </div>

      <div style={s.kpiGrid}>
        <KPICard label="Unpaid Receivables" value={loading ? '—' : fmtUSD(kpi?.unpaidReceivables || 0, true)} accent="#00D47E" onClick={() => setShowUnpaid('receivables')} clickable />
        <KPICard label="Unpaid Payables"    value={loading ? '—' : fmtUSD(kpi?.unpaidPayables || 0, true)}    accent="#F5A623" onClick={() => setShowUnpaid('payables')}    clickable />
        <KPICard label="Upcoming 30d Exp."  value={loading ? '—' : fmtUSD(kpi?.upcomingExpenses30d || 0, true)} accent="#A78BFA" />
        <KPICard label="Overdue Invoices"   value={loading ? '—' : String(kpi?.overdueCount || 0)}            accent={kpi && kpi.overdueCount > 0 ? '#FF5B5A' : '#7A9BB8'} />
      </div>

      {/* Alert if cash low */}
      {!loading && kpi && kpi.cashOnHand < kpi.upcomingExpenses30d && (
        <div style={s.alert}>
          <div style={s.alertIcon}>⚠</div>
          <div>
            <div style={{ fontWeight: '600', fontSize: '13px', color: '#F5A623', marginBottom: '3px' }}>
              Upcoming expenses exceed cash on hand
            </div>
            <div style={{ fontSize: '12px', color: '#DCE9F6' }}>
              Pending expenses for the next 30 days ({fmtUSD(kpi.upcomingExpenses30d)}) are higher than current cash balance ({fmtUSD(kpi.cashOnHand)}).
            </div>
          </div>
        </div>
      )}

      {/* Report Cards */}
      <div style={{ marginTop: '24px', marginBottom: '12px', fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        Detailed reports
      </div>
      <div style={s.reportGrid}>
        {reportCards.map(r => (
          <button key={r.id} style={s.reportCard} onClick={() => setPage(r.page)}>
            <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '17px', color: '#DCE9F6', fontWeight: '400', marginBottom: '4px', letterSpacing: '-0.01em' }}>
              {r.title}
            </div>
            <div style={{ fontSize: '12px', color: '#7A9BB8', lineHeight: 1.5 }}>{r.desc}</div>
            <div style={s.reportArrow}>→</div>
          </button>
        ))}
      </div>

      {showUnpaid && (
        <UnpaidInvoicesPanel type={showUnpaid} onClose={() => { setShowUnpaid(null); loadKPI() }} />
      )}
    </div>
  )
}

// ─── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ label, value, accent, onClick, clickable }: {
  label: string
  value: string
  accent: string
  onClick?: () => void
  clickable?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      disabled={!clickable}
      style={{
        background: '#0D1B2C',
        border: '1px solid rgba(255,255,255,0.075)',
        borderTop: `2.5px solid ${accent}`,
        borderRadius: '10px',
        padding: '14px 16px',
        textAlign: 'left' as const,
        cursor: clickable ? 'pointer' : 'default',
        boxShadow: hovered && clickable ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.10)' : '0 4px 20px rgba(0,0,0,0.4)',
        transform: hovered && clickable ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.15s, box-shadow 0.15s',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'DM Mono', 'Fira Mono', monospace",
        fontSize: '24px',
        fontWeight: '500',
        color: accent,
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {clickable && (
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)', marginTop: '6px' }}>
          Click to view details →
        </div>
      )}
    </button>
  )
}

// ─── Unpaid Invoices Panel ──────────────────────────────────────────────────
function UnpaidInvoicesPanel({ type, onClose }: { type: 'receivables' | 'payables'; onClose: () => void }) {
  const [list, setList] = useState<UnpaidInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_date, due_date,
        amount, amount_usd, currency,
        outstanding_amount, outstanding_amount_usd, type,
        partners(name), companies(name)
      `)
      .eq('type', type === 'receivables' ? 'receivable' : 'payable')
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true, nullsFirst: false })

    const today = new Date()
    const mapped: UnpaidInvoice[] = (data || []).map((inv: any) => {
      let days_overdue = 0
      if (inv.due_date) {
        const due = new Date(inv.due_date)
        days_overdue = Math.floor((today.getTime() - due.getTime()) / (24*3600*1000))
      }
      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        partner_name: (inv.partners as any)?.name || '—',
        company_name: (inv.companies as any)?.name || '—',
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        amount: inv.amount,
        amount_usd: inv.amount_usd,
        currency: inv.currency,
        outstanding_amount: inv.outstanding_amount,
        outstanding_amount_usd: inv.outstanding_amount_usd,
        type: inv.type,
        days_overdue,
      }
    })
    setList(mapped)
    setLoading(false)
  }, [type])

  useEffect(() => { load() }, [load])

  const handleEdit = async (invoiceId: string) => {
    const { data } = await supabase
      .from('invoices')
      .select('*, partners(name)')
      .eq('id', invoiceId)
      .single()
    if (data) setEditing(data)
  }

  const handleEditDone = () => {
    setEditing(null)
    load()
  }

  const total = list.reduce((s, i) => s + (i.outstanding_amount_usd || 0), 0)
  const overdueCount = list.filter(i => i.days_overdue > 0).length

  if (editing) return <InvoiceDialog invoice={editing} onClose={handleEditDone} />

  return (
    <div style={ps.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={ps.modal}>
        <div style={ps.header}>
          <div>
            <div style={ps.headerKicker}>UNPAID {type === 'receivables' ? 'RECEIVABLES' : 'PAYABLES'}</div>
            <div style={ps.headerTitle}>
              {type === 'receivables' ? "Money owed to you" : "Money you owe"}
            </div>
            <div style={ps.headerSub}>
              {!loading && (
                <span style={{ fontFamily: "'DM Mono', monospace", color: type === 'receivables' ? '#00D47E' : '#F5A623', fontWeight: '600' }}>
                  {fmtUSD(total)} total
                </span>
              )}
              {overdueCount > 0 && (
                <span style={{ marginLeft: '12px', color: '#FF5B5A', fontWeight: '500' }}>
                  · {overdueCount} overdue
                </span>
              )}
            </div>
          </div>
          <button style={ps.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={ps.body}>
          {loading ? (
            <div style={ps.empty}>Loading…</div>
          ) : list.length === 0 ? (
            <div style={ps.empty}>No unpaid {type} 🎉</div>
          ) : (
            <table style={ps.table}>
              <thead>
                <tr>
                  <th style={ps.th}>Invoice</th>
                  <th style={ps.th}>Partner</th>
                  <th style={ps.th}>Due Date</th>
                  <th style={{ ...ps.th, textAlign: 'right' }}>Outstanding</th>
                  <th style={ps.th}></th>
                </tr>
              </thead>
              <tbody>
                {list.map(inv => (
                  <tr key={inv.id} style={ps.tr}>
                    <td style={ps.td}>
                      <div style={{ fontWeight: '500', color: '#DCE9F6', fontSize: '12px' }}>
                        {inv.invoice_number}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>{inv.company_name}</div>
                    </td>
                    <td style={ps.td}>
                      <span style={{ fontSize: '12px', color: '#7A9BB8' }}>{inv.partner_name}</span>
                    </td>
                    <td style={ps.td}>
                      {inv.due_date ? (
                        <div>
                          <div style={{ fontSize: '12px', color: '#DCE9F6' }}>{inv.due_date}</div>
                          {inv.days_overdue > 0 && (
                            <div style={{ fontSize: '10px', color: '#FF5B5A', fontWeight: '500' }}>
                              {inv.days_overdue}d overdue
                            </div>
                          )}
                        </div>
                      ) : <span style={{ color: 'rgba(255,255,255,0.20)' }}>—</span>}
                    </td>
                    <td style={{ ...ps.td, textAlign: 'right' }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: '600', color: type === 'receivables' ? '#00D47E' : '#F5A623', fontSize: '12px' }}>
                        {fmtUSD(inv.outstanding_amount_usd || 0)}
                      </div>
                      {inv.currency !== 'USD' && (
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)', fontFamily: "'DM Mono', monospace" }}>
                          {(inv.outstanding_amount || 0).toLocaleString()} {inv.currency}
                        </div>
                      )}
                    </td>
                    <td style={{ ...ps.td, textAlign: 'right' }}>
                      <button style={ps.editBtn} onClick={() => handleEdit(inv.id)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={ps.footer}>
          <button style={ps.closeFooterBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    padding: '24px 28px',
    fontFamily: "'Inter', system-ui, sans-serif",
    minHeight: '100vh',
    background: '#060E1A',
    color: '#DCE9F6',
  },
  pageHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: '1.5rem',
  },
  pageTitle: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '24px', fontWeight: '400', color: '#DCE9F6',
    letterSpacing: '-0.01em', marginBottom: '4px',
  },
  pageSub: { fontSize: '13px', color: '#7A9BB8' },
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
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '12px',
  },
  alert: {
    marginTop: '12px',
    padding: '14px 16px',
    background: 'rgba(245,166,35,0.08)',
    border: '1px solid rgba(245,166,35,0.30)',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  alertIcon: {
    fontSize: '20px',
    color: '#F5A623',
    lineHeight: 1,
    flexShrink: 0,
  },
  reportGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  reportCard: {
    position: 'relative' as const,
    background: '#0D1B2C',
    border: '1px solid rgba(255,255,255,0.075)',
    borderRadius: '10px',
    padding: '18px 18px 22px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: "'Inter', sans-serif",
    transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  },
  reportArrow: {
    position: 'absolute' as const,
    bottom: '14px',
    right: '16px',
    fontSize: '14px',
    color: '#00D47E',
    opacity: 0.7,
  },
}

const ps: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1001,
  },
  modal: {
    background: '#0D1B2C',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '16px',
    width: '900px', maxWidth: '95vw', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column' as const,
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
    fontSize: '10px', fontWeight: '600',
    letterSpacing: '0.1em',
    marginBottom: '4px',
  },
  headerTitle: {
    color: '#DCE9F6',
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '18px', fontWeight: '400',
    marginBottom: '3px',
    letterSpacing: '-0.01em',
  },
  headerSub: { color: '#7A9BB8', fontSize: '12px' },
  closeBtn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#7A9BB8',
    fontSize: '20px', cursor: 'pointer',
    width: '28px', height: '28px',
    borderRadius: '8px', lineHeight: 1, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  body: {
    padding: '0',
    overflowY: 'auto' as const,
    flex: 1,
  },
  empty: {
    padding: '60px 40px',
    textAlign: 'center' as const,
    color: '#7A9BB8',
    fontSize: '13px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    padding: '10px 16px',
    fontSize: '10px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.30)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    textAlign: 'left' as const,
    background: '#0A1525',
    borderBottom: '1px solid rgba(255,255,255,0.075)',
    whiteSpace: 'nowrap' as const,
  },
  tr: {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    transition: 'background 0.1s',
  },
  td: {
    padding: '10px 16px',
    fontSize: '12px',
    color: '#DCE9F6',
    verticalAlign: 'top' as const,
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
  },
  footer: {
    padding: '0.75rem 1.5rem',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', justifyContent: 'flex-end',
    background: '#0A1525',
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
}