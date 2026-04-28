import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'
import InvoiceDialog from '../components/InvoiceDialog'
import TransactionDialog from '../components/TransactionDialog'
import PassthroughDialog from '../components/PassthroughDialog'
import ReconcilePanel from '../components/ReconcilePanel'
import BulkImport from '../components/BulkImport'
import { fmtUSD, fmtAmount } from '../utils/formatters'

type Tab = 'invoices' | 'transactions' | 'passthrough' | 'revenue'

const BRANDS = [
  'Kicksta', 'Flock', 'Nitreo', 'Kenji', 'Upleap',
  'EngagementBoost', 'Upgram', 'SocialFollow', 'Aimfox',
]

const PROCESSOR_LABELS: Record<string, string> = {
  stripe_uae: 'Stripe UAE', stripe_us: 'Stripe US',
  braintree: 'Braintree', paypal: 'PayPal',
  wire: 'Wire', other: 'Other',
}
const PROCESSOR_COLORS: Record<string, { bg: string; color: string }> = {
  stripe_uae: { bg: 'rgba(99,91,255,0.15)', color: '#9D97FF' },
  stripe_us: { bg: 'rgba(99,91,255,0.10)', color: '#7B75FF' },
  braintree: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
  paypal: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
  wire: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' },
  other: { bg: 'rgba(255,255,255,0.06)', color: '#7A9BB8' },
}
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' },
  partial: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
  collected: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
  cancelled: { bg: 'rgba(255,91,90,0.13)', color: '#FF5B5A' },
}
const STREAM_COLORS: Record<string, { bg: string; color: string }> = {
  aimfox: { bg: 'rgba(99,91,255,0.15)', color: '#9D97FF' },
  social_growth: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
  other: { bg: 'rgba(255,255,255,0.06)', color: '#7A9BB8' },
}

export default function Transactions() {
  useAuth()

  const [activeTab, setActiveTab] = useState<Tab>('invoices')
  const [showMenu, setShowMenu] = useState<string | null>(null)

  // Existing dialogs
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false)
  const [showTransactionDialog, setShowTransactionDialog] = useState(false)
  const [showPassthroughDialog, setShowPassthroughDialog] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [editInvoice, setEditInvoice] = useState<any>(null)
  const [editTransaction, setEditTransaction] = useState<any>(null)
  const [editPassthrough, setEditPassthrough] = useState<any>(null)
  const [reconcileSource, setReconcileSource] = useState<{ type: 'transaction' | 'invoice'; id: string } | null>(null)

  // Revenue dialogs
  const [showEntryDialog, setShowEntryDialog] = useState(false)
  const [showCollectionDialog, setShowCollectionDialog] = useState(false)
  const [editEntry, setEditEntry] = useState<any>(null)
  const [editCollection, setEditCollection] = useState<any>(null)
  const [showRevenueReconcile, setShowRevenueReconcile] = useState<any>(null)

  // Filters
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterStream, setFilterStream] = useState('all')
  const [filterBrand, setFilterBrand] = useState('all')
  const [revenueSubTab, setRevenueSubTab] = useState<'entries' | 'collections'>('entries')
  const [search, setSearch] = useState('')

  // Data
  const [invoices, setInvoices] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [passthroughs, setPassthroughs] = useState<any[]>([])
  const [revenueEntries, setRevenueEntries] = useState<any[]>([])
  const [revenueCollections, setRevenueCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchInvoices = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('v_invoice_status').select('*').order('invoice_date', { ascending: false })
    if (!error && data) setInvoices(data)
    setLoading(false)
  }

  const fetchTransactions = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('transactions')
      .select('*, companies!transactions_company_id_fkey(name), banks!transactions_bank_id_fkey(name), partners!transactions_partner_id_fkey(name)')
      .order('transaction_date', { ascending: false })
    if (!error && data) setTransactions(data)
    setLoading(false)
  }

  const fetchPassthroughs = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('passthrough')
      .select('*, companies(name), banks(name), partners(name)')
      .order('transaction_date', { ascending: false })
    if (!error && data) setPassthroughs(data)
    setLoading(false)
  }

  const fetchRevenueEntries = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('v_revenue_entry_status').select('*').order('period_month', { ascending: false })
    if (!error && data) setRevenueEntries(data)
    setLoading(false)
  }

  const fetchRevenueCollections = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('revenue_collections').select('*, companies(name), banks(name)').order('transaction_date', { ascending: false })
    if (!error && data) setRevenueCollections(data)
    setLoading(false)
  }

  const fetchAll = () => {
    fetchInvoices(); fetchTransactions(); fetchPassthroughs()
    fetchRevenueEntries(); fetchRevenueCollections()
  }

  useEffect(() => { fetchAll() }, []) // eslint-disable-line

  const handleEditInvoice = async (inv: any) => {
    const { data } = await supabase.from('invoices').select('*, companies(name,currencies), partners(name)').eq('id', inv.id).single()
    if (data) { setEditInvoice(data); setShowInvoiceDialog(true) }
    setShowMenu(null)
  }

  const handleEditTransaction = async (t: any) => {
    const { data } = await supabase.from('transactions').select('*, companies(name,currencies), banks(name), partners(name)').eq('id', t.id).single()
    if (data) { setEditTransaction(data); setShowTransactionDialog(true) }
    setShowMenu(null)
  }

  const handleEditPassthrough = async (p: any) => {
    const { data } = await supabase.from('passthrough').select('*, companies(name,currencies), banks(name), partners(name)').eq('id', p.id).single()
    if (data) { setEditPassthrough(data); setShowPassthroughDialog(true) }
    setShowMenu(null)
  }

  const deleteInvoice = async (id: string) => {
    if (!window.confirm('Delete this invoice?')) return
    await supabase.from('invoices').delete().eq('id', id)
    fetchInvoices(); setShowMenu(null)
  }

  const deleteTransaction = async (id: string) => {
    if (!window.confirm('Delete this transaction?')) return
    await supabase.from('transactions').delete().eq('id', id)
    fetchTransactions(); setShowMenu(null)
  }

  const deletePassthrough = async (id: string) => {
    if (!window.confirm('Delete this pass-through entry?')) return
    await supabase.from('passthrough').delete().eq('id', id)
    fetchPassthroughs(); setShowMenu(null)
  }

  const deleteRevenueEntry = async (id: string) => {
    if (!window.confirm('Delete this revenue entry?')) return
    await supabase.from('revenue_entries').delete().eq('id', id)
    fetchRevenueEntries(); setShowMenu(null)
  }

  const deleteRevenueCollection = async (id: string) => {
    if (!window.confirm('Delete this collection?')) return
    await supabase.from('revenue_collections').delete().eq('id', id)
    fetchRevenueCollections(); setShowMenu(null)
  }

  // ── Status colors ─────────────────────────────────────
  const invoiceStatusColors: Record<string, { bg: string; color: string }> = {
    unpaid: { bg: 'rgba(255,91,90,0.13)', color: '#FF5B5A' },
    partial: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' },
    paid: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
    overpaid: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
    overdue: { bg: 'rgba(255,91,90,0.20)', color: '#FF5B5A' },
    reconciled: { bg: 'rgba(255,255,255,0.06)', color: '#7A9BB8' },
  }
  const txTypeColors: Record<string, { bg: string; color: string }> = {
    invoice_payment: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
    direct: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
    transfer: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' },
    intercompany: { bg: 'rgba(212,83,126,0.13)', color: '#D4537E' },
  }
  const ptStatusColors: Record<string, { bg: string; color: string }> = {
    unpaired: { bg: 'rgba(255,91,90,0.13)', color: '#FF5B5A' },
    paired: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' },
    balanced: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
  }

  // ── Filters ───────────────────────────────────────────
  const filteredInvoices = invoices.filter(inv => {
    const company = inv.company_name || ''
    const partner = inv.partner_name || ''
    return (filterEntity === 'all' || company.toLowerCase().includes(filterEntity)) &&
      (filterType === 'all' || inv.type === filterType) &&
      (filterStatus === 'all' || inv.calculated_status === filterStatus) &&
      (!search || partner.toLowerCase().includes(search.toLowerCase()) || (inv.invoice_number || '').toLowerCase().includes(search.toLowerCase()))
  })

  const filteredTransactions = transactions.filter(t => {
    const company = t.companies?.name || ''
    const partner = t.partners?.name || ''
    return (filterEntity === 'all' || company.toLowerCase().includes(filterEntity)) &&
      (filterType === 'all' || t.type === filterType) &&
      (!search || partner.toLowerCase().includes(search.toLowerCase()) || (t.note || '').toLowerCase().includes(search.toLowerCase()))
  })

  const filteredPassthroughs = passthroughs.filter(p => {
    const company = p.companies?.name || ''
    const partner = p.partners?.name || ''
    return (filterEntity === 'all' || company.toLowerCase().includes(filterEntity)) &&
      (filterStatus === 'all' || p.status === filterStatus) &&
      (!search || partner.toLowerCase().includes(search.toLowerCase()) || (p.note || '').toLowerCase().includes(search.toLowerCase()))
  })

  const filteredEntries = revenueEntries.filter(e =>
    (filterStream === 'all' || e.revenue_stream === filterStream) &&
    (filterBrand === 'all' || e.brand === filterBrand) &&
    (filterStatus === 'all' || e.calculated_status === filterStatus) &&
    (!search || e.brand?.toLowerCase().includes(search.toLowerCase()) || (e.notes || '').toLowerCase().includes(search.toLowerCase()) || (e.invoice_ref || '').toLowerCase().includes(search.toLowerCase()))
  )

  const filteredCollections = revenueCollections.filter(c =>
    (filterStatus === 'all' || c.status === filterStatus) &&
    (!search || (c.reference || '').toLowerCase().includes(search.toLowerCase()) || (c.notes || '').toLowerCase().includes(search.toLowerCase()))
  )

  // ── Revenue summary stats ─────────────────────────────
  const totalOpen = revenueEntries.filter(e => e.calculated_status === 'open').reduce((s, e) => s + (e.amount_usd || 0), 0)
  const totalPartial = revenueEntries.filter(e => e.calculated_status === 'partial').reduce((s, e) => s + (e.remaining_usd || 0), 0)
  const totalCollected = revenueEntries.filter(e => e.calculated_status === 'collected').reduce((s, e) => s + (e.amount_usd || 0), 0)
  const unmatchedCollections = revenueCollections.filter(c => c.status === 'unmatched').length

  // ── Brand breakdown ───────────────────────────────────
  const brandTotals = BRANDS.map(brand => ({
    brand,
    stream: brand === 'Aimfox' ? 'aimfox' : 'social_growth',
    total: revenueEntries.filter(e => e.brand === brand).reduce((s, e) => s + (e.amount_usd || 0), 0),
    collected: revenueEntries.filter(e => e.brand === brand).reduce((s, e) => s + (e.collected_usd || 0), 0),
    count: revenueEntries.filter(e => e.brand === brand).length,
  })).filter(b => b.count > 0).sort((a, b) => b.total - a.total)
  const maxBrand = brandTotals[0]?.total || 1

  // ── Misc ──────────────────────────────────────────────
  const unpaidTotal = invoices.filter(i => ['unpaid', 'partial'].includes(i.calculated_status)).reduce((s, i) => s + (i.remaining_usd || 0), 0)
  const overdueCount = invoices.filter(i => i.due_date && new Date(i.due_date) < new Date() && ['unpaid', 'partial'].includes(i.calculated_status)).length
  const unpairedPt = passthroughs.filter(p => p.status === 'unpaired').length
  const directWithPL = transactions.filter(t => t.type === 'direct' && t.pl_impact && t.status !== 'reconciled').length

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab); setSearch(''); setFilterType('all')
    setFilterStatus('all'); setFilterStream('all'); setFilterBrand('all'); setShowMenu(null)
  }

  return (
    <div style={s.root} onClick={() => setShowMenu(null)}>
      <div style={s.body}>

        {/* Page header */}
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Ledger</div>
            <div style={s.pageSub}>Invoices, transactions, pass-throughs and revenue across all entities</div>
          </div>
          <div style={s.btnGroup}>
            {activeTab !== 'revenue' && <>
              <button style={s.btnInvoice} onClick={() => { setEditInvoice(null); setShowInvoiceDialog(true) }}>📄 New invoice</button>
              <button style={s.btnTransaction} onClick={() => { setEditTransaction(null); setShowTransactionDialog(true) }}>💳 New transaction</button>
              <button style={s.btnBulk} onClick={() => setShowBulkImport(true)}>📥 Bulk import</button>
            </>}
            {activeTab === 'revenue' && <>
              <button style={s.btnRevEntry} onClick={() => { setEditEntry(null); setShowEntryDialog(true) }}>📈 New entry</button>
              <button style={s.btnRevCollection} onClick={() => { setEditCollection(null); setShowCollectionDialog(true) }}>💰 New collection</button>
            </>}
          </div>
        </div>

        {/* Summary cards */}
        {activeTab !== 'revenue' ? (
          <div style={s.summaryRow}>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Outstanding invoices</div>
              <div style={s.summaryVal}>{fmtUSD(unpaidTotal)}</div>
              <div style={s.summarySub}>{invoices.filter(i => ['unpaid', 'partial'].includes(i.calculated_status)).length} invoices unpaid</div>
            </div>
            <div style={{ ...s.summaryCard, ...(overdueCount > 0 ? s.summaryCardAlert : {}) }}>
              <div style={s.summaryLabel}>Overdue</div>
              <div style={{ ...s.summaryVal, ...(overdueCount > 0 ? { color: '#FF5B5A' } : {}) }}>{overdueCount}</div>
              <div style={s.summarySub}>{overdueCount > 0 ? 'Invoices past due date' : 'All invoices on time'}</div>
            </div>
            <div style={{ ...s.summaryCard, ...(directWithPL > 0 ? s.summaryCardWarn : {}) }}>
              <div style={s.summaryLabel}>Pending reconcile</div>
              <div style={{ ...s.summaryVal, ...(directWithPL > 0 ? { color: '#F5A623' } : {}) }}>{directWithPL}</div>
              <div style={s.summarySub}>{directWithPL > 0 ? 'Direct tx awaiting invoice' : 'All direct tx reconciled'}</div>
            </div>
            <div style={{ ...s.summaryCard, ...(unpairedPt > 0 ? s.summaryCardWarn : {}) }}>
              <div style={s.summaryLabel}>Unpaired pass-throughs</div>
              <div style={{ ...s.summaryVal, ...(unpairedPt > 0 ? { color: '#F5A623' } : {}) }}>{unpairedPt}</div>
              <div style={s.summarySub}>{unpairedPt > 0 ? 'Waiting for matching entry' : 'All pass-throughs paired'}</div>
            </div>
          </div>
        ) : (
          <div style={s.summaryRow}>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Open (uncollected)</div>
              <div style={{ ...s.summaryVal, color: '#F5A623' }}>{fmtUSD(totalOpen)}</div>
              <div style={s.summarySub}>{revenueEntries.filter(e => e.calculated_status === 'open').length} entries</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Partially collected</div>
              <div style={{ ...s.summaryVal, color: '#4EA8FF' }}>{fmtUSD(totalPartial)}</div>
              <div style={s.summarySub}>{revenueEntries.filter(e => e.calculated_status === 'partial').length} entries · remaining</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Collected</div>
              <div style={{ ...s.summaryVal, color: '#00D47E' }}>{fmtUSD(totalCollected)}</div>
              <div style={s.summarySub}>{revenueEntries.filter(e => e.calculated_status === 'collected').length} entries closed</div>
            </div>
            <div style={{ ...s.summaryCard, ...(unmatchedCollections > 0 ? s.summaryCardWarn : {}) }}>
              <div style={s.summaryLabel}>Unmatched collections</div>
              <div style={{ ...s.summaryVal, ...(unmatchedCollections > 0 ? { color: '#F5A623' } : {}) }}>{unmatchedCollections}</div>
              <div style={s.summarySub}>{unmatchedCollections > 0 ? 'Processor receipts not matched' : 'All collections matched'}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={s.tabBar}>
          <div style={{ display: 'flex', gap: 0 }}>
            {([
              { id: 'invoices', label: '📄 Invoices', count: invoices.length },
              { id: 'transactions', label: '💳 Transactions', count: transactions.length },
              { id: 'passthrough', label: '⚡ Pass-through', count: passthroughs.length },
              { id: 'revenue', label: '📈 Revenue', count: revenueEntries.length },
            ] as { id: Tab; label: string; count: number }[]).map(tab => (
              <button key={tab.id}
                style={{ ...s.tab, ...(activeTab === tab.id ? { ...s.tabActive, ...(tab.id === 'revenue' ? s.tabActiveRevenue : {}) } : {}) }}
                onClick={() => handleTabChange(tab.id)}>
                {tab.label}
                <span style={{ ...s.tabCount, ...(activeTab === tab.id ? (tab.id === 'revenue' ? s.tabCountRevenue : s.tabCountActive) : {}) }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── REVENUE TAB ── */}
        {activeTab === 'revenue' && (
          <>
            {/* Sub-tabs */}
            <div style={s.subTabBar}>
              <button style={{ ...s.subTab, ...(revenueSubTab === 'entries' ? s.subTabActive : {}) }} onClick={() => setRevenueSubTab('entries')}>
                Entries (potraživanja) <span style={s.subTabCount}>{revenueEntries.length}</span>
              </button>
              <button style={{ ...s.subTab, ...(revenueSubTab === 'collections' ? s.subTabActive : {}) }} onClick={() => setRevenueSubTab('collections')}>
                Collections (uplate) <span style={s.subTabCount}>{revenueCollections.length}</span>
              </button>
            </div>

            {/* Brand breakdown widget */}
            {brandTotals.length > 0 && (
              <div style={s.brandWidget}>
                <div style={s.brandWidgetTitle}>Brand breakdown · {revenueEntries.length} entries</div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' as const }}>
                  {brandTotals.map(b => (
                    <div key={b.brand} style={{ ...s.brandCard, ...(filterBrand === b.brand ? s.brandCardActive : {}) }}
                      onClick={() => setFilterBrand(filterBrand === b.brand ? 'all' : b.brand)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#DCE9F6' }}>{b.brand}</span>
                        <span style={{ ...s.badge, ...STREAM_COLORS[b.stream] }}>{b.stream === 'aimfox' ? 'AF' : 'SG'}</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#00D47E', marginBottom: '4px' }}>{fmtUSD(b.total)}</div>
                      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginBottom: '4px' }}>
                        <div style={{ height: '100%', width: `${(b.total / maxBrand) * 100}%`, background: b.stream === 'aimfox' ? '#9D97FF' : '#00D47E', borderRadius: '2px' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: '#7A9BB8' }}>{b.count} entr{b.count > 1 ? 'ies' : 'y'} · {fmtUSD(b.collected)} collected</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter bar */}
            <div style={s.filterBar}>
              <input type="text" placeholder="Search brand, ref, notes..."
                value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput} />
              <select value={filterStream} onChange={e => setFilterStream(e.target.value)} style={s.filterSelect}>
                <option value="all">All streams</option>
                <option value="aimfox">Aimfox</option>
                <option value="social_growth">Social Growth</option>
                <option value="other">Other</option>
              </select>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={s.filterSelect}>
                <option value="all">All brands</option>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.filterSelect}>
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="partial">Partial</option>
                <option value="collected">Collected</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div style={s.totalBadge}>
                {revenueSubTab === 'entries'
                  ? <>{filteredEntries.length} entries · <strong>{fmtUSD(filteredEntries.reduce((s, e) => s + (e.amount_usd || 0), 0))} USD</strong></>
                  : <>{filteredCollections.length} collections · <strong>{fmtUSD(filteredCollections.reduce((s, c) => s + (c.amount_usd || 0), 0))} USD</strong></>
                }
              </div>
            </div>

            {/* Entries table */}
            {revenueSubTab === 'entries' && (
              <div style={s.tableWrap}>
                {loading ? (
                  <div style={s.emptyState}><div style={{ fontSize: '14px', color: '#7A9BB8' }}>Loading...</div></div>
                ) : filteredEntries.length === 0 ? (
                  <div style={s.emptyState}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📈</div>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6', marginBottom: '6px' }}>No revenue entries yet</div>
                    <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '20px' }}>Add your first revenue entry — from Chargebee, Invoice Ninja, or manually.</div>
                    <button style={s.btnRevEntry} onClick={() => { setEditEntry(null); setShowEntryDialog(true) }}>📈 New entry</button>
                  </div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr style={s.thead}>
                        <th style={s.th}>Period</th>
                        <th style={s.th}>Brand</th>
                        <th style={s.th}>Stream</th>
                        <th style={s.th}>Source</th>
                        <th style={s.th}>Ref</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>Collected</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>Remaining</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((e, i) => (
                        <tr key={e.id} style={{ ...s.tr, background: i % 2 === 0 ? '#0D1B2C' : '#111F30' }}>
                          <td style={s.td}><span style={s.dateCell}>{e.period_month}</span></td>
                          <td style={s.td}><span style={{ fontSize: '13px', fontWeight: '600', color: '#DCE9F6' }}>{e.brand}</span></td>
                          <td style={s.td}>
                            <span style={{ ...s.badge, ...STREAM_COLORS[e.revenue_stream] }}>
                              {e.revenue_stream === 'aimfox' ? 'Aimfox' : e.revenue_stream === 'social_growth' ? 'Social Growth' : 'Other'}
                            </span>
                          </td>
                          <td style={s.td}><span style={{ ...s.badge, background: 'rgba(255,255,255,0.06)', color: '#7A9BB8' }}>{e.source}</span></td>
                          <td style={s.td}><span style={s.invNumCell}>{e.invoice_ref || '—'}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}>
                            <span style={s.amtCell}>{fmtUSD(e.amount_usd || 0)}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}>
                            <span style={{ ...s.amtCell, color: '#00D47E' }}>{fmtUSD(e.collected_usd || 0)}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}>
                            <span style={{ ...s.amtCell, color: (e.remaining_usd || 0) > 0.01 ? '#F5A623' : '#7A9BB8' }}>
                              {fmtUSD(e.remaining_usd || 0)}
                            </span>
                          </td>
                          <td style={s.td}>
                            <span style={{ ...s.badge, ...STATUS_COLORS[e.calculated_status] }}>{e.calculated_status}</span>
                          </td>
                          <td style={s.td} onClick={ev => ev.stopPropagation()}>
                            <div style={{ position: 'relative' }}>
                              <button style={s.editBtn} onClick={() => setShowMenu(showMenu === e.id ? null : e.id)}>···</button>
                              {showMenu === e.id && (
                                <div style={s.contextMenu}>
                                  <div style={s.contextItem} onClick={() => { setEditEntry(e); setShowEntryDialog(true); setShowMenu(null) }}>✏️ Edit</div>
                                  <div style={s.contextItem} onClick={() => { setShowRevenueReconcile(e); setShowMenu(null) }}>🔗 Match collection</div>
                                  <div style={{ ...s.contextItem, color: '#FF5B5A' }} onClick={() => deleteRevenueEntry(e.id)}>🗑 Delete</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Collections table */}
            {revenueSubTab === 'collections' && (
              <div style={s.tableWrap}>
                {loading ? (
                  <div style={s.emptyState}><div style={{ fontSize: '14px', color: '#7A9BB8' }}>Loading...</div></div>
                ) : filteredCollections.length === 0 ? (
                  <div style={s.emptyState}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>💰</div>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6', marginBottom: '6px' }}>No collections yet</div>
                    <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '20px' }}>Record processor payouts — Stripe, Braintree, PayPal settlements.</div>
                    <button style={s.btnRevCollection} onClick={() => { setEditCollection(null); setShowCollectionDialog(true) }}>💰 New collection</button>
                  </div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr style={s.thead}>
                        <th style={s.th}>Date</th>
                        <th style={s.th}>Processor</th>
                        <th style={s.th}>Company</th>
                        <th style={s.th}>Bank</th>
                        <th style={s.th}>Reference</th>
                        <th style={s.th}>Notes</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>USD</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCollections.map((c, i) => (
                        <tr key={c.id} style={{ ...s.tr, background: i % 2 === 0 ? '#0D1B2C' : '#111F30' }}>
                          <td style={s.td}><span style={s.dateCell}>{c.transaction_date}</span></td>
                          <td style={s.td}>
                            <span style={{ ...s.badge, ...(PROCESSOR_COLORS[c.processor] || PROCESSOR_COLORS.other) }}>
                              {PROCESSOR_LABELS[c.processor] || c.processor}
                            </span>
                          </td>
                          <td style={s.td}><span style={s.compCell}>{c.companies?.name || '—'}</span></td>
                          <td style={s.td}><span style={s.compCell}>{c.banks?.name || '—'}</span></td>
                          <td style={s.td}><span style={s.invNumCell}>{c.reference || '—'}</span></td>
                          <td style={s.td}><span style={s.descCell}>{c.notes || '—'}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}>
                            <span style={s.amtCell}>{(c.amount || 0).toLocaleString()} {c.currency}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}>
                            <span style={s.usdCell}>{fmtUSD(c.amount_usd || 0)}</span>
                          </td>
                          <td style={s.td}>
                            {(() => {
                              const collStatusColors: Record<string, { bg: string; color: string }> = {
                                unmatched: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' },
                                partial: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
                                matched: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
                              }
                              return <span style={{ ...s.badge, ...(collStatusColors[c.status] || {}) }}>{c.status}</span>
                            })()}
                          </td>
                          <td style={s.td} onClick={ev => ev.stopPropagation()}>
                            <div style={{ position: 'relative' }}>
                              <button style={s.editBtn} onClick={() => setShowMenu(showMenu === c.id ? null : c.id)}>···</button>
                              {showMenu === c.id && (
                                <div style={s.contextMenu}>
                                  <div style={s.contextItem} onClick={() => { setEditCollection(c); setShowCollectionDialog(true); setShowMenu(null) }}>✏️ Edit</div>
                                  <div style={{ ...s.contextItem, color: '#FF5B5A' }} onClick={() => deleteRevenueCollection(c.id)}>🗑 Delete</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        {/* ── EXISTING TABS ── */}
        {activeTab !== 'revenue' && (
          <>
            {/* Filter bar */}
            <div style={s.filterBar}>
              <input type="text"
                placeholder={activeTab === 'invoices' ? 'Search partner or invoice number...' : 'Search partner, note or category...'}
                value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput} />
              <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={s.filterSelect}>
                <option value="all">All entities</option>
                <option value="sfbc">SFBC</option>
                <option value="constellation">Constellation LLC</option>
                <option value="social">Social Growth</option>
              </select>
              {activeTab === 'invoices' && (<>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={s.filterSelect}>
                  <option value="all">All types</option>
                  <option value="expense">Expense</option>
                  <option value="revenue">Revenue</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.filterSelect}>
                  <option value="all">All statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                  <option value="overpaid">Overpaid</option>
                  <option value="reconciled">Reconciled</option>
                </select>
              </>)}
              {activeTab === 'transactions' && (
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={s.filterSelect}>
                  <option value="all">All types</option>
                  <option value="invoice_payment">Invoice payment</option>
                  <option value="direct">Direct</option>
                </select>
              )}
              {activeTab === 'passthrough' && (
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.filterSelect}>
                  <option value="all">All statuses</option>
                  <option value="unpaired">Unpaired</option>
                  <option value="paired">Paired</option>
                  <option value="balanced">Balanced</option>
                </select>
              )}
              <div style={s.totalBadge}>
                {activeTab === 'invoices' && <>{filteredInvoices.length} invoices · <strong>{fmtUSD(filteredInvoices.reduce((s, i) => s + (i.amount_usd || 0), 0))} USD</strong></>}
                {activeTab === 'transactions' && <>{filteredTransactions.length} entries · <strong>{fmtUSD(filteredTransactions.reduce((s, t) => s + (t.amount_usd || 0), 0))} USD</strong></>}
                {activeTab === 'passthrough' && <>{filteredPassthroughs.length} entries</>}
              </div>
            </div>

            <div style={s.tableWrap}>
              {loading ? (
                <div style={s.emptyState}><div style={{ fontSize: '14px', color: '#7A9BB8' }}>Loading...</div></div>
              ) : activeTab === 'invoices' && (
                filteredInvoices.length === 0 ? (
                  <div style={s.emptyState}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6', marginBottom: '6px' }}>No invoices yet</div>
                    <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '20px' }}>Click "New invoice" to add your first P&L entry.</div>
                    <button style={s.btnInvoice} onClick={() => setShowInvoiceDialog(true)}>📄 New invoice</button>
                  </div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr style={s.thead}>
                        <th style={s.th}>Invoice date</th><th style={s.th}>Due date</th><th style={s.th}>Partner</th>
                        <th style={s.th}>Invoice #</th><th style={s.th}>Type</th><th style={s.th}>P&L Category</th>
                        <th style={s.th}>Company</th><th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>Remaining</th><th style={s.th}>Status</th><th style={s.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((inv, i) => {
                        const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && ['unpaid', 'partial'].includes(inv.calculated_status)
                        return (
                          <tr key={inv.id} style={{ ...s.tr, background: i % 2 === 0 ? '#0D1B2C' : '#111F30' }}>
                            <td style={s.td}><span style={s.dateCell}>{inv.invoice_date}</span></td>
                            <td style={s.td}><span style={{ ...s.dateCell, color: isOverdue ? '#FF5B5A' : '#7A9BB8', fontWeight: isOverdue ? '600' : '400' }}>{inv.due_date || '—'}{isOverdue && ' ⚠️'}</span></td>
                            <td style={s.td}><span style={s.partnerCell}>{inv.partner_name || '—'}</span></td>
                            <td style={s.td}><span style={s.invNumCell}>{inv.invoice_number || '—'}</span></td>
                            <td style={s.td}><span style={{ ...s.badge, background: inv.type === 'expense' ? '#FCEBEB' : '#E1F5EE', color: inv.type === 'expense' ? '#A32D2D' : '#085041' }}>{inv.type}</span></td>
                            <td style={s.td}><span style={s.catCell}>{inv.pl_category || inv.revenue_stream || '—'}</span></td>
                            <td style={s.td}><span style={s.compCell}>{inv.company_name || '—'}</span></td>
                            <td style={{ ...s.td, textAlign: 'right' as const }}><span style={s.amtCell}>{fmtAmount(inv.amount || 0, inv.currency)}</span></td>
                            <td style={{ ...s.td, textAlign: 'right' as const }}><span style={{ ...s.amtCell, color: (inv.remaining_usd || 0) > 0.01 ? '#FF5B5A' : '#00D47E' }}>{fmtUSD(inv.remaining_usd || 0)}</span></td>
                            <td style={s.td}><span style={{ ...s.badge, background: invoiceStatusColors[inv.calculated_status]?.bg, color: invoiceStatusColors[inv.calculated_status]?.color }}>{inv.calculated_status}</span></td>
                            <td style={s.td} onClick={e => e.stopPropagation()}>
                              <div style={{ position: 'relative' }}>
                                <button style={s.editBtn} onClick={() => setShowMenu(showMenu === inv.id ? null : inv.id)}>···</button>
                                {showMenu === inv.id && (
                                  <div style={s.contextMenu}>
                                    <div style={s.contextItem} onClick={() => handleEditInvoice(inv)}>✏️ Edit</div>
                                    <div style={s.contextItem} onClick={() => { setReconcileSource({ type: 'invoice', id: inv.id }); setShowMenu(null) }}>🔗 Reconcile</div>
                                    <div style={{ ...s.contextItem, color: '#FF5B5A' }} onClick={() => deleteInvoice(inv.id)}>🗑 Delete</div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              )}

              {!loading && activeTab === 'transactions' && (
                filteredTransactions.length === 0 ? (
                  <div style={s.emptyState}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>💳</div>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6', marginBottom: '6px' }}>No transactions yet</div>
                    <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '20px' }}>Click "New transaction" or use Bulk import.</div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button style={s.btnTransaction} onClick={() => setShowTransactionDialog(true)}>💳 New transaction</button>
                      <button style={s.btnBulk} onClick={() => setShowBulkImport(true)}>📥 Bulk import</button>
                    </div>
                  </div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr style={s.thead}>
                        <th style={s.th}>Date</th><th style={s.th}>Partner</th><th style={s.th}>Type</th>
                        <th style={s.th}>P&L / Invoice</th><th style={s.th}>Note</th><th style={s.th}>Company</th>
                        <th style={s.th}>Bank</th><th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>USD</th><th style={s.th}>P&L</th><th style={s.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((t, i) => (
                        <tr key={t.id} style={{ ...s.tr, background: i % 2 === 0 ? '#0D1B2C' : '#111F30' }}>
                          <td style={s.td}><span style={s.dateCell}>{t.transaction_date}</span></td>
                          <td style={s.td}><span style={s.partnerCell}>{t.partners?.name || '—'}</span></td>
                          <td style={s.td}><span style={{ ...s.badge, background: txTypeColors[t.type]?.bg, color: txTypeColors[t.type]?.color }}>{t.type === 'invoice_payment' ? 'Inv. payment' : t.type}</span></td>
                          <td style={s.td}><span style={s.catCell}>{t.pl_impact ? (t.pl_category || t.revenue_stream || '—') : <span style={{ color: 'rgba(255,255,255,0.30)', fontSize: '11px' }}>via invoice</span>}</span></td>
                          <td style={s.td}><span style={s.descCell}>{t.note || '—'}</span></td>
                          <td style={s.td}><span style={s.compCell}>{t.companies?.name || '—'}</span></td>
                          <td style={s.td}><span style={s.compCell}>{t.banks?.name || '—'}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}><span style={s.amtCell}>{(t.amount || 0).toLocaleString()} {t.currency}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}><span style={s.usdCell}>{fmtUSD(t.amount_usd || 0)}</span></td>
                          <td style={s.td}>{t.pl_impact ? <span style={{ ...s.badge, background: '#E1F5EE', color: '#085041' }}>✓ P&L</span> : <span style={{ ...s.badge, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.30)' }}>Cash only</span>}</td>
                          <td style={s.td} onClick={e => e.stopPropagation()}>
                            <div style={{ position: 'relative' }}>
                              <button style={s.editBtn} onClick={() => setShowMenu(showMenu === t.id ? null : t.id)}>···</button>
                              {showMenu === t.id && (
                                <div style={s.contextMenu}>
                                  <div style={s.contextItem} onClick={() => handleEditTransaction(t)}>✏️ Edit</div>
                                  {t.type === 'direct' && <div style={s.contextItem} onClick={() => { setReconcileSource({ type: 'transaction', id: t.id }); setShowMenu(null) }}>🔗 Reconcile</div>}
                                  <div style={{ ...s.contextItem, color: '#FF5B5A' }} onClick={() => deleteTransaction(t.id)}>🗑 Delete</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {!loading && activeTab === 'passthrough' && (
                filteredPassthroughs.length === 0 ? (
                  <div style={s.emptyState}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6', marginBottom: '6px' }}>No pass-through entries</div>
                    <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '20px' }}>Use "New transaction" and select Pass-through type.</div>
                  </div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr style={s.thead}>
                        <th style={s.th}>Date</th><th style={s.th}>Period</th><th style={s.th}>Partner</th>
                        <th style={s.th}>Direction</th><th style={s.th}>Company</th><th style={s.th}>Bank</th>
                        <th style={s.th}>Note</th><th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>USD</th><th style={s.th}>Status</th><th style={s.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPassthroughs.map((p, i) => (
                        <tr key={p.id} style={{ ...s.tr, background: i % 2 === 0 ? '#0D1B2C' : '#111F30' }}>
                          <td style={s.td}><span style={s.dateCell}>{p.transaction_date}</span></td>
                          <td style={s.td}><span style={s.dateCell}>{p.period_month}</span></td>
                          <td style={s.td}><span style={s.partnerCell}>{p.partners?.name || '—'}</span></td>
                          <td style={s.td}><span style={{ ...s.badge, background: p.direction === 'in' ? '#E1F5EE' : '#FCEBEB', color: p.direction === 'in' ? '#085041' : '#A32D2D' }}>{p.direction === 'in' ? '📥 IN' : '📤 OUT'}</span></td>
                          <td style={s.td}><span style={s.compCell}>{p.companies?.name || '—'}</span></td>
                          <td style={s.td}><span style={s.compCell}>{p.banks?.name || '—'}</span></td>
                          <td style={s.td}><span style={s.descCell}>{p.note || '—'}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}><span style={s.amtCell}>{(p.amount || 0).toLocaleString()} {p.currency}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}><span style={s.usdCell}>${(p.amount_usd || 0).toLocaleString()}</span></td>
                          <td style={s.td}><span style={{ ...s.badge, background: ptStatusColors[p.status]?.bg, color: ptStatusColors[p.status]?.color }}>{p.status}</span></td>
                          <td style={s.td} onClick={e => e.stopPropagation()}>
                            <div style={{ position: 'relative' }}>
                              <button style={s.editBtn} onClick={() => setShowMenu(showMenu === p.id ? null : p.id)}>···</button>
                              {showMenu === p.id && (
                                <div style={s.contextMenu}>
                                  <div style={s.contextItem} onClick={() => handleEditPassthrough(p)}>✏️ Edit</div>
                                  <div style={{ ...s.contextItem, color: '#FF5B5A' }} onClick={() => deletePassthrough(p.id)}>🗑 Delete</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* Existing Dialogs */}
      {(showInvoiceDialog || editInvoice) && (
        <InvoiceDialog onClose={() => { setShowInvoiceDialog(false); setEditInvoice(null); fetchInvoices() }} invoice={editInvoice} />
      )}
      {(showTransactionDialog || editTransaction) && (
        <TransactionDialog onClose={() => { setShowTransactionDialog(false); setEditTransaction(null); fetchTransactions() }} transaction={editTransaction} />
      )}
      {(showPassthroughDialog || editPassthrough) && (
        <PassthroughDialog onClose={() => { setShowPassthroughDialog(false); setEditPassthrough(null); fetchPassthroughs() }} passthrough={editPassthrough} />
      )}
      {reconcileSource && (
        <ReconcilePanel sourceType={reconcileSource.type} sourceId={reconcileSource.id} onClose={() => setReconcileSource(null)} onReconciled={() => fetchAll()} />
      )}
      {showBulkImport && (
        <BulkImport onClose={() => setShowBulkImport(false)} onImported={() => fetchAll()} />
      )}

      {/* Revenue dialogs — Korak 3 i 4 */}
      {showEntryDialog && (
        <RevenueEntryDialog
          entry={editEntry}
          onClose={() => { setShowEntryDialog(false); setEditEntry(null) }}
          onSaved={() => { setShowEntryDialog(false); setEditEntry(null); fetchRevenueEntries() }}
        />
      )}
      {showCollectionDialog && (
        <RevenueCollectionDialog
          collection={editCollection}
          onClose={() => { setShowCollectionDialog(false); setEditCollection(null) }}
          onSaved={() => { setShowCollectionDialog(false); setEditCollection(null); fetchRevenueCollections() }}
        />
      )}
      {showRevenueReconcile && (
        <RevenueReconcileDialog
          entry={showRevenueReconcile}
          onClose={() => setShowRevenueReconcile(null)}
          onSaved={() => { setShowRevenueReconcile(null); fetchRevenueEntries(); fetchRevenueCollections() }}
        />
      )}
    </div>
  )
}

// ── Placeholder dialogs — biće implementirani u Koraku 3 i 4 ──
function RevenueEntryDialog({ entry, onClose, onSaved }: any) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', width: '500px', textAlign: 'center' as const }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📈</div>
        <div style={{ fontSize: '18px', fontWeight: '500', color: '#DCE9F6', marginBottom: '8px' }}>Revenue Entry Dialog</div>
        <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '24px' }}>Korak 3 — dolazi uskoro</div>
        <button onClick={onClose} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontFamily: 'system-ui,sans-serif', fontSize: '13px' }}>Zatvori</button>
      </div>
    </div>
  )
}

function RevenueCollectionDialog({ collection, onClose, onSaved }: any) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', width: '500px', textAlign: 'center' as const }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>💰</div>
        <div style={{ fontSize: '18px', fontWeight: '500', color: '#DCE9F6', marginBottom: '8px' }}>Revenue Collection Dialog</div>
        <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '24px' }}>Korak 4 — dolazi uskoro</div>
        <button onClick={onClose} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontFamily: 'system-ui,sans-serif', fontSize: '13px' }}>Zatvori</button>
      </div>
    </div>
  )
}

function RevenueReconcileDialog({ entry, onClose, onSaved }: any) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', width: '500px', textAlign: 'center' as const }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔗</div>
        <div style={{ fontSize: '18px', fontWeight: '500', color: '#DCE9F6', marginBottom: '8px' }}>Match Collection to Entry</div>
        <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '24px' }}>Korak 5 — dolazi uskoro</div>
        <button onClick={onClose} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontFamily: 'system-ui,sans-serif', fontSize: '13px' }}>Zatvori</button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#060E1A', fontFamily: "'Inter', system-ui, sans-serif" },
  body: { padding: '24px 28px' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '24px', fontWeight: '400', color: '#DCE9F6', marginBottom: '4px' },
  pageSub: { fontSize: '13px', color: '#7A9BB8' },
  btnGroup: { display: 'flex', gap: '8px' },
  btnInvoice: { background: '#00D47E', color: '#060E1A', border: 'none', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  btnTransaction: { background: '#185FA5', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  btnPassthrough: { background: 'transparent', color: '#F5A623', border: '0.5px solid rgba(245,166,35,0.4)', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  btnBulk: { background: 'transparent', color: '#4EA8FF', border: '0.5px solid rgba(78,168,255,0.4)', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  btnRevEntry: { background: '#9D97FF', color: '#060E1A', border: 'none', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  btnRevCollection: { background: 'transparent', color: '#00D47E', border: '1px solid rgba(0,212,126,0.4)', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '1.5rem' },
  summaryCard: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', padding: '14px 16px' },
  summaryCardAlert: { border: '1px solid rgba(255,91,90,0.3)', background: 'rgba(255,91,90,0.07)' },
  summaryCardWarn: { border: '1px solid rgba(245,166,35,0.3)', background: 'rgba(245,166,35,0.07)' },
  summaryLabel: { fontSize: '10px', fontWeight: '500', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '6px' },
  summaryVal: { fontSize: '22px', fontWeight: '500', color: '#DCE9F6', marginBottom: '4px' },
  summarySub: { fontSize: '11px', color: '#7A9BB8' },
  tabBar: { display: 'flex', alignItems: 'center', borderBottom: '0.5px solid rgba(255,255,255,0.075)', marginBottom: '1rem' },
  tab: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '10px 18px', border: 'none', background: 'transparent', color: '#7A9BB8', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-0.5px', display: 'flex', alignItems: 'center', gap: '6px' },
  tabActive: { color: '#DCE9F6', borderBottomColor: '#00D47E', fontWeight: '500' },
  tabActiveRevenue: { borderBottomColor: '#9D97FF', color: '#9D97FF' },
  tabCount: { fontSize: '10px', fontWeight: '500', padding: '1px 6px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.30)' },
  tabCountActive: { background: 'rgba(0,212,126,0.12)', color: '#00D47E' },
  tabCountRevenue: { background: 'rgba(157,151,255,0.15)', color: '#9D97FF' },
  subTabBar: { display: 'flex', gap: '4px', marginBottom: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '4px', width: 'fit-content' },
  subTab: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '6px 14px', border: 'none', background: 'transparent', color: '#7A9BB8', cursor: 'pointer', borderRadius: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' },
  subTabActive: { background: 'rgba(157,151,255,0.15)', color: '#9D97FF' },
  subTabCount: { fontSize: '10px', background: 'rgba(255,255,255,0.08)', color: '#7A9BB8', padding: '1px 6px', borderRadius: '10px' },
  brandWidget: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', padding: '14px 16px', marginBottom: '14px' },
  brandWidgetTitle: { fontSize: '11px', fontWeight: '500', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '12px' },
  brandCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', minWidth: '140px', flex: '1' },
  brandCardActive: { border: '1px solid rgba(157,151,255,0.4)', background: 'rgba(157,151,255,0.07)' },
  filterBar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap' as const },
  searchInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#0D1B2C', color: '#DCE9F6', flex: '1', minWidth: '200px' },
  filterSelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#0D1B2C', color: '#DCE9F6', cursor: 'pointer' },
  totalBadge: { fontSize: '13px', color: '#7A9BB8', background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '8px', padding: '8px 12px', marginLeft: 'auto', whiteSpace: 'nowrap' as const },
  tableWrap: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', overflow: 'visible' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  thead: { background: '#111F30' },
  th: { padding: '10px 12px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '500', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.075)', whiteSpace: 'nowrap' as const },
  tr: { borderBottom: '0.5px solid rgba(255,255,255,0.05)' },
  td: { padding: '10px 12px', verticalAlign: 'middle' as const, color: '#DCE9F6' },
  emptyState: { padding: '3rem', textAlign: 'center' as const },
  dateCell: { fontSize: '12px', color: '#7A9BB8', whiteSpace: 'nowrap' as const },
  partnerCell: { fontSize: '13px', fontWeight: '500', color: '#DCE9F6' },
  invNumCell: { fontSize: '11px', color: '#7A9BB8', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' },
  catCell: { fontSize: '11px', color: '#7A9BB8' },
  descCell: { fontSize: '11px', color: '#7A9BB8', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' },
  compCell: { fontSize: '11px', color: '#7A9BB8' },
  amtCell: { fontSize: '13px', fontWeight: '500', color: '#DCE9F6', whiteSpace: 'nowrap' as const },
  usdCell: { fontSize: '13px', fontWeight: '500', color: '#00D47E', whiteSpace: 'nowrap' as const },
  badge: { fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '20px', textTransform: 'capitalize' as const, whiteSpace: 'nowrap' as const },
  editBtn: { background: 'none', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#7A9BB8', fontSize: '14px' },
  contextMenu: { position: 'fixed' as const, background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', zIndex: 9999, minWidth: '140px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' },
  contextItem: { padding: '8px 14px', fontSize: '13px', color: '#DCE9F6', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.05)' },
}