import React, { useState, useEffect, useCallback } from 'react'
import { NavContext } from '../App'
import type { Page } from '../App'
import { supabase } from '../supabase'
import InvoiceDialog from '../components/InvoiceDialog'

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

function fmtUSD(n: number, compact = false): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`
  }
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const REPORT_GROUPS = [
  {
    group: 'Performance',
    accent: '#00D47E',
    items: [
      { id: 'pl',        title: 'Profit & Loss',   desc: 'Income vs expenses, by month and category',  page: 'pl' as Page },
      { id: 'cashflow',  title: 'Cash Flow',        desc: 'Cash position, runway, and projections',     page: 'cashflow' as Page },
      { id: 'budgeting', title: 'Budgeting',        desc: 'Forecast vs actual, 3-month outlook',        page: 'budgeting' as Page },
    ],
  },
  {
    group: 'Ledger',
    accent: '#4EA8FF',
    items: [
      { id: 'transactions', title: 'Transactions', desc: 'Full transaction ledger with filters',        page: 'transactions' as Page },
      { id: 'invoices',     title: 'Invoices',     desc: 'AR/AP aging, unpaid, partial, paid',         page: 'invoices' as Page },
      { id: 'partners',     title: 'Partners',     desc: 'Customer & vendor performance summary',       page: 'partners' as Page },
    ],
  },
]

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
      { data: txs }, { data: invR }, { data: invP },
      { data: banks }, { data: upcoming },
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
    setKpi({ revenueYTD, expensesYTD, netProfitYTD: revenueYTD - expensesYTD, unpaidReceivables, unpaidPayables, cashOnHand, upcomingExpenses30d, overdueCount })
    setLoading(false)
  }, [])

  useEffect(() => { loadKPI() }, [loadKPI])

  const yr = new Date().getFullYear()
  const isLoss = kpi && kpi.netProfitYTD < 0
  const isCashLow = !loading && kpi && kpi.cashOnHand < kpi.upcomingExpenses30d

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageTitle}>Reports</div>
          <div style={s.pageSub}>Financial overview · {yr} year to date</div>
        </div>
        <button style={s.refreshBtn} onClick={loadKPI}>↻ Refresh</button>
      </div>

      <div style={s.kpiSectionLabel}>Profit & Loss — {yr} YTD</div>
      <div style={s.kpiGrid}>
        <KPITile label="Revenue" value={loading ? '—' : fmtUSD(kpi?.revenueYTD || 0, true)} accent="#00D47E" sub="Total income posted" />
        <KPITile label="Expenses" value={loading ? '—' : fmtUSD(kpi?.expensesYTD || 0, true)} accent="#FF5B5A" sub="Total outflows posted" />
        <KPITile
          label="Net profit"
          value={loading ? '—' : fmtUSD(kpi?.netProfitYTD || 0, true)}
          accent={isLoss ? '#FF5B5A' : '#00D47E'}
          sub={isLoss ? 'Operating at a loss' : 'Profitable YTD'}
          pill={isLoss
            ? { label: 'Loss', color: '#FF5B5A', bg: 'rgba(255,91,90,0.12)' }
            : { label: 'Profitable', color: '#00D47E', bg: 'rgba(0,212,126,0.12)' }}
        />
        <KPITile label="Cash on hand" value={loading ? '—' : fmtUSD(kpi?.cashOnHand || 0, true)} accent="#4EA8FF" sub="Across all bank accounts" />
      </div>

      <div style={{ ...s.kpiSectionLabel, marginTop: '20px' }}>Receivables & Payables</div>
      <div style={s.kpiGrid}>
        <KPITile label="Unpaid receivables" value={loading ? '—' : fmtUSD(kpi?.unpaidReceivables || 0, true)} accent="#00D47E" sub="Click to view & edit" clickable onClick={() => setShowUnpaid('receivables')} />
        <KPITile label="Unpaid payables" value={loading ? '—' : fmtUSD(kpi?.unpaidPayables || 0, true)} accent="#F5A623" sub="Click to view & edit" clickable onClick={() => setShowUnpaid('payables')} />
        <KPITile label="Upcoming 30d expenses" value={loading ? '—' : fmtUSD(kpi?.upcomingExpenses30d || 0, true)} accent="#A78BFA" sub="Pending within 30 days" />
        <KPITile
          label="Overdue invoices"
          value={loading ? '—' : String(kpi?.overdueCount || 0)}
          accent={kpi && kpi.overdueCount > 0 ? '#FF5B5A' : '#7A9BB8'}
          sub={kpi && kpi.overdueCount > 0 ? 'Past due date' : 'All invoices on time'}
          pill={kpi && kpi.overdueCount > 0 ? { label: 'Action needed', color: '#FF5B5A', bg: 'rgba(255,91,90,0.12)' } : undefined}
        />
      </div>

      {isCashLow && (
        <div style={s.alert}>
          <div style={s.alertIconWrap}>⚠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', fontSize: '13px', color: '#F5A623', marginBottom: '3px' }}>Upcoming expenses exceed cash on hand</div>
            <div style={{ fontSize: '12px', color: '#7A9BB8', lineHeight: 1.5 }}>
              Pending expenses for the next 30 days ({fmtUSD(kpi!.upcomingExpenses30d)}) exceed current cash balance ({fmtUSD(kpi!.cashOnHand)}).
            </div>
          </div>
        </div>
      )}

      {REPORT_GROUPS.map(grp => (
        <div key={grp.group} style={{ marginTop: '28px' }}>
          <div style={s.groupHeader}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: grp.accent, flexShrink: 0 }} />
            <span style={s.groupLabel}>{grp.group}</span>
            <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div style={s.reportGrid}>
            {grp.items.map(r => (
              <ReportCard key={r.id} title={r.title} desc={r.desc} accent={grp.accent} onClick={() => setPage(r.page)} />
            ))}
          </div>
        </div>
      ))}

      {showUnpaid && (
        <UnpaidInvoicesPanel type={showUnpaid} onClose={() => { setShowUnpaid(null); loadKPI() }} />
      )}
    </div>
  )
}

function KPITile({ label, value, accent, sub, clickable, onClick, pill }: {
  label: string; value: string; accent: string; sub?: string
  clickable?: boolean; onClick?: () => void
  pill?: { label: string; color: string; bg: string }
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onClick} disabled={!clickable}
      style={{
        background: hov && clickable ? '#101F32' : '#0D1B2C',
        border: `1px solid ${hov && clickable ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: '10px', padding: '16px 18px',
        textAlign: 'left' as const, cursor: clickable ? 'pointer' : 'default',
        transform: hov && clickable ? 'translateY(-2px)' : 'none',
        boxShadow: hov && clickable ? '0 8px 28px rgba(0,0,0,0.45)' : '0 2px 12px rgba(0,0,0,0.25)',
        transition: 'all 0.18s', fontFamily: "'Inter', sans-serif",
        display: 'flex', flexDirection: 'column' as const, gap: '10px',
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono', 'Fira Mono', monospace", fontSize: '26px', fontWeight: '500', color: accent, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
        {pill && <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px', background: pill.bg, color: pill.color, letterSpacing: '0.02em' }}>{pill.label}</span>}
        {sub && !pill && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>{sub}</span>}
        {clickable && <span style={{ fontSize: '10px', color: accent, opacity: 0.7, marginLeft: 'auto' }}>View →</span>}
      </div>
    </button>
  )
}

function ReportCard({ title, desc, accent, onClick }: { title: string; desc: string; accent: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        background: hov ? '#101F32' : '#0D1B2C',
        border: `1px solid ${hov ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: '10px', padding: '18px 20px', cursor: 'pointer',
        textAlign: 'left' as const, fontFamily: "'Inter', sans-serif",
        display: 'flex', alignItems: 'center', gap: '16px',
        transform: hov ? 'translateY(-1px)' : 'none',
        boxShadow: hov ? '0 6px 24px rgba(0,0,0,0.4)' : '0 2px 10px rgba(0,0,0,0.2)',
        transition: 'all 0.18s',
      }}
    >
      <div style={{ width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0, background: `${accent}18`, border: `1px solid ${accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '16px', height: '2px', background: accent, borderRadius: '1px', boxShadow: `0 4px 0 ${accent}, 0 -4px 0 ${accent}` }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '15px', fontWeight: '400', color: '#DCE9F6', letterSpacing: '-0.01em', marginBottom: '3px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#7A9BB8', lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{ color: hov ? accent : 'rgba(255,255,255,0.20)', fontSize: '18px', transition: 'all 0.18s', transform: hov ? 'translateX(2px)' : 'none', flexShrink: 0 }}>→</div>
    </button>
  )
}

function UnpaidInvoicesPanel({ type, onClose }: { type: 'receivables' | 'payables'; onClose: () => void }) {
  const [list, setList] = useState<UnpaidInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select(`id, invoice_number, invoice_date, due_date, amount, amount_usd, currency, outstanding_amount, outstanding_amount_usd, type, partners(name), companies(name)`)
      .eq('type', type === 'receivables' ? 'receivable' : 'payable')
      .neq('status', 'paid').neq('status', 'cancelled')
      .order('due_date', { ascending: true, nullsFirst: false })
    const today = new Date()
    const mapped: UnpaidInvoice[] = (data || []).map((inv: any) => {
      let days_overdue = 0
      if (inv.due_date) {
        const due = new Date(inv.due_date)
        days_overdue = Math.floor((today.getTime() - due.getTime()) / (24 * 3600 * 1000))
      }
      return { id: inv.id, invoice_number: inv.invoice_number, partner_name: (inv.partners as any)?.name || '—', company_name: (inv.companies as any)?.name || '—', invoice_date: inv.invoice_date, due_date: inv.due_date, amount: inv.amount, amount_usd: inv.amount_usd, currency: inv.currency, outstanding_amount: inv.outstanding_amount, outstanding_amount_usd: inv.outstanding_amount_usd, type: inv.type, days_overdue }
    })
    setList(mapped)
    setLoading(false)
  }, [type])

  useEffect(() => { load() }, [load])

  const handleEdit = async (invoiceId: string) => {
    const { data } = await supabase.from('invoices').select('*, partners(name)').eq('id', invoiceId).single()
    if (data) setEditing(data)
  }

  const handleEditDone = () => { setEditing(null); load() }

  const filtered = list.filter(inv =>
    !search ||
    inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    inv.partner_name?.toLowerCase().includes(search.toLowerCase())
  )

  const total = filtered.reduce((s, i) => s + (i.outstanding_amount_usd || 0), 0)
  const overdueCount = filtered.filter(i => i.days_overdue > 0).length
  const accent = type === 'receivables' ? '#00D47E' : '#F5A623'

  if (editing) return <InvoiceDialog invoice={editing} onClose={handleEditDone} />

  return (
    <div style={ps.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={ps.modal}>
        <div style={ps.header}>
          <div>
            <div style={ps.headerKicker}>{type === 'receivables' ? 'UNPAID RECEIVABLES' : 'UNPAID PAYABLES'}</div>
            <div style={ps.headerTitle}>{type === 'receivables' ? 'Money owed to you' : 'Money you owe'}</div>
            {!loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", color: accent, fontWeight: '600', fontSize: '14px' }}>{fmtUSD(total)}</span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>· {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</span>
                {overdueCount > 0 && <span style={{ fontSize: '11px', color: '#FF5B5A', fontWeight: '600' }}>· {overdueCount} overdue</span>}
              </div>
            )}
          </div>
          <button style={ps.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={ps.searchBar}>
          <input style={ps.searchInput} placeholder="Search by invoice # or partner…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.30)', cursor: 'pointer', fontSize: '16px', padding: '0 2px' }} onClick={() => setSearch('')}>×</button>}
        </div>

        <div style={ps.body}>
          {loading ? (
            <div style={ps.empty}><div style={{ fontSize: '13px', color: '#7A9BB8' }}>Loading…</div></div>
          ) : filtered.length === 0 ? (
            <div style={ps.empty}>
              <div style={{ fontSize: '14px', color: '#DCE9F6', fontWeight: '500', marginBottom: '4px' }}>All clear!</div>
              <div style={{ fontSize: '12px', color: '#7A9BB8' }}>No unpaid {type}{search ? ` matching "${search}"` : ''}</div>
            </div>
          ) : (
            <table style={ps.table}>
              <thead>
                <tr>
                  <th style={ps.th}>Invoice</th>
                  <th style={ps.th}>Partner</th>
                  <th style={ps.th}>Due date</th>
                  <th style={{ ...ps.th, textAlign: 'right' as const }}>Outstanding</th>
                  <th style={{ ...ps.th, width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const isOverdue = inv.days_overdue > 0
                  const isDueSoon = !isOverdue && inv.days_overdue > -8
                  return (
                    <tr key={inv.id} style={ps.tr}>
                      <td style={ps.td}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: '#DCE9F6', fontWeight: '500' }}>{inv.invoice_number || '—'}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{inv.company_name}</div>
                      </td>
                      <td style={ps.td}><span style={{ fontSize: '13px', color: '#DCE9F6' }}>{inv.partner_name}</span></td>
                      <td style={ps.td}>
                        {inv.due_date ? (
                          <div>
                            <div style={{ fontSize: '12px', color: isOverdue ? '#FF5B5A' : '#DCE9F6', fontWeight: isOverdue ? '600' : '400' }}>{inv.due_date}</div>
                            {isOverdue && <span style={{ fontSize: '10px', color: '#FF5B5A', background: 'rgba(255,91,90,0.12)', padding: '1px 6px', borderRadius: '20px', fontWeight: '600', display: 'inline-block', marginTop: '2px' }}>{inv.days_overdue}d overdue</span>}
                            {isDueSoon && <span style={{ fontSize: '10px', color: '#F5A623', background: 'rgba(245,166,35,0.12)', padding: '1px 6px', borderRadius: '20px', display: 'inline-block', marginTop: '2px' }}>Due soon</span>}
                          </div>
                        ) : <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: '12px' }}>—</span>}
                      </td>
                      <td style={{ ...ps.td, textAlign: 'right' as const }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: '600', color: accent, fontSize: '13px' }}>{fmtUSD(inv.outstanding_amount_usd || 0)}</div>
                        {inv.currency !== 'USD' && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Mono', monospace", marginTop: '2px' }}>{(inv.outstanding_amount || 0).toLocaleString()} {inv.currency}</div>}
                      </td>
                      <td style={{ ...ps.td, textAlign: 'right' as const }}>
                        <button style={ps.editBtn} onClick={() => handleEdit(inv.id)}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={ps.footer}>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.30)' }}>{filtered.length} invoice{filtered.length !== 1 ? 's' : ''} · total {fmtUSD(total)}</div>
          <button style={ps.closeFooterBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '24px 28px', fontFamily: "'Inter', system-ui, sans-serif", minHeight: '100vh', background: '#060E1A', color: '#DCE9F6' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' },
  pageTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '26px', fontWeight: '400', color: '#DCE9F6', letterSpacing: '-0.01em', marginBottom: '4px' },
  pageSub: { fontSize: '13px', color: '#7A9BB8' },
  refreshBtn: { fontFamily: "'Inter', sans-serif", fontSize: '12px', padding: '7px 14px', border: '1px solid rgba(0,212,126,0.3)', borderRadius: '8px', background: 'rgba(0,212,126,0.06)', color: '#00D47E', cursor: 'pointer', fontWeight: '500' },
  kpiSectionLabel: { fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: '10px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' },
  alert: { marginTop: '16px', padding: '14px 18px', background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.20)', borderLeft: '3px solid #F5A623', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '14px' },
  alertIconWrap: { width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(245,166,35,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px', color: '#F5A623' },
  groupHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  groupLabel: { fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const },
  reportGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' },
}

const ps: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 },
  modal: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', width: '860px', maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' },
  header: { background: '#0A1525', padding: '18px 22px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 },
  headerKicker: { color: '#7A9BB8', fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', marginBottom: '4px' },
  headerTitle: { color: '#DCE9F6', fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '19px', fontWeight: '400', letterSpacing: '-0.01em' },
  closeBtn: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#7A9BB8', fontSize: '20px', cursor: 'pointer', width: '30px', height: '30px', borderRadius: '8px', lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  searchBar: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#0D1B2C', flexShrink: 0 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#DCE9F6', fontFamily: "'Inter', sans-serif" },
  body: { overflowY: 'auto' as const, flex: 1 },
  empty: { padding: '60px', textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { padding: '10px 16px', fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', textAlign: 'left' as const, background: '#0A1525', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  tr: { borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' },
  td: { padding: '11px 16px', fontSize: '12px', color: '#DCE9F6', verticalAlign: 'middle' as const },
  editBtn: { fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: '500', padding: '5px 12px', border: '1px solid rgba(0,212,126,0.3)', borderRadius: '6px', background: 'rgba(0,212,126,0.06)', color: '#00D47E', cursor: 'pointer' },
  footer: { padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0A1525', flexShrink: 0 },
  closeFooterBtn: { fontFamily: "'Inter', sans-serif", fontSize: '13px', padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#7A9BB8', cursor: 'pointer' },
}