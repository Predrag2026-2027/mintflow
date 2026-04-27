import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'
import type { Page } from '../App'
import { supabase } from '../supabase'
import InvoiceDialog from '../components/InvoiceDialog'
import TransactionDialog from '../components/TransactionDialog'
import PassthroughDialog from '../components/PassthroughDialog'
import ReconcilePanel from '../components/ReconcilePanel'
import BulkImport from '../components/BulkImport'
import { fmtUSD, fmtAmount } from '../utils/formatters'

type Tab = 'invoices' | 'transactions' | 'passthrough'

export default function Transactions() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)

  const [activeTab, setActiveTab] = useState<Tab>('invoices')

  // Dialogs
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false)
  const [showTransactionDialog, setShowTransactionDialog] = useState(false)
  const [showPassthroughDialog, setShowPassthroughDialog] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [editInvoice, setEditInvoice] = useState<any>(null)
  const [editTransaction, setEditTransaction] = useState<any>(null)
  const [editPassthrough, setEditPassthrough] = useState<any>(null)

  // Reconcile
  const [reconcileSource, setReconcileSource] = useState<{ type: 'transaction' | 'invoice'; id: string } | null>(null)

  // Context menus
  const [showMenu, setShowMenu] = useState<string | null>(null)

  // Filters
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')

  // Data
  const [invoices, setInvoices] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [passthroughs, setPassthroughs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const pageMap: Record<string, Page> = {
    'Dashboard': 'dashboard', 'Transactions': 'transactions',
    'P&L': 'pl', 'Cash Flow': 'cashflow', 'Reports': 'reports',
    'Partners': 'partners', 'Settings': 'settings',
  }

  const fetchInvoices = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('v_invoice_status')
      .select('*')
      .order('invoice_date', { ascending: false })
    if (!error && data) setInvoices(data)
    setLoading(false)
  }

  const fetchTransactions = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*, companies!transactions_company_id_fkey(name), banks!transactions_bank_id_fkey(name), partners!transactions_partner_id_fkey(name)')
      .order('transaction_date', { ascending: false })
    if (!error && data) setTransactions(data)
    setLoading(false)
  }

  const fetchPassthroughs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('passthrough')
      .select('*, companies(name), banks(name), partners(name)')
      .order('transaction_date', { ascending: false })
    if (!error && data) setPassthroughs(data)
    setLoading(false)
  }

  const fetchAll = () => {
    fetchInvoices()
    fetchTransactions()
    fetchPassthroughs()
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Edit handlers — fetch full data from DB ──────────
  const handleEditInvoice = async (inv: any) => {
    const { data } = await supabase
      .from('invoices')
      .select('*, companies(name,currencies), partners(name)')
      .eq('id', inv.id)
      .single()
    if (data) {
      setEditInvoice(data)
      setShowInvoiceDialog(true)
    }
    setShowMenu(null)
  }

  const handleEditTransaction = async (t: any) => {
    const { data } = await supabase
      .from('transactions')
      .select('*, companies(name,currencies), banks(name), partners(name)')
      .eq('id', t.id)
      .single()
    if (data) {
      setEditTransaction(data)
      setShowTransactionDialog(true)
    }
    setShowMenu(null)
  }

  const handleEditPassthrough = async (p: any) => {
    const { data } = await supabase
      .from('passthrough')
      .select('*, companies(name,currencies), banks(name), partners(name)')
      .eq('id', p.id)
      .single()
    if (data) {
      setEditPassthrough(data)
      setShowPassthroughDialog(true)
    }
    setShowMenu(null)
  }

  // ── Delete handlers ───────────────────────────────────
  const deleteInvoice = async (id: string) => {
    if (!window.confirm('Delete this invoice? This may affect P&L.')) return
    await supabase.from('invoices').delete().eq('id', id)
    fetchInvoices()
    setShowMenu(null)
  }

  const deleteTransaction = async (id: string) => {
    if (!window.confirm('Delete this transaction?')) return
    await supabase.from('transactions').delete().eq('id', id)
    fetchTransactions()
    setShowMenu(null)
  }

  const deletePassthrough = async (id: string) => {
    if (!window.confirm('Delete this pass-through entry?')) return
    await supabase.from('passthrough').delete().eq('id', id)
    fetchPassthroughs()
    setShowMenu(null)
  }

  const invoiceStatusColors: Record<string, { bg: string; color: string }> = {
    unpaid: { bg: '#FCEBEB', color: '#A32D2D' },
    partial: { bg: '#FAEEDA', color: '#633806' },
    paid: { bg: '#E1F5EE', color: '#085041' },
    overpaid: { bg: '#E6F1FB', color: '#0C447C' },
    overdue: { bg: '#2D0A0A', color: '#FF8A8A' },
    reconciled: { bg: '#f0f0ee', color: '#666' },
  }

  const txTypeColors: Record<string, { bg: string; color: string }> = {
    invoice_payment: { bg: '#E6F1FB', color: '#0C447C' },
    direct: { bg: '#E1F5EE', color: '#085041' },
    transfer: { bg: '#FAEEDA', color: '#633806' },
    intercompany: { bg: '#FBEAF0', color: '#72243E' },
  }

  const ptStatusColors: Record<string, { bg: string; color: string }> = {
    unpaired: { bg: '#FCEBEB', color: '#A32D2D' },
    paired: { bg: '#FAEEDA', color: '#633806' },
    balanced: { bg: '#E1F5EE', color: '#085041' },
  }

  const filteredInvoices = invoices.filter(inv => {
    const company = inv.company_name || ''
    const partner = inv.partner_name || ''
    const matchEntity = filterEntity === 'all' || company.toLowerCase().includes(filterEntity)
    const matchType = filterType === 'all' || inv.type === filterType
    const matchStatus = filterStatus === 'all' || inv.calculated_status === filterStatus
    const matchSearch = !search ||
      partner.toLowerCase().includes(search.toLowerCase()) ||
      (inv.invoice_number || '').toLowerCase().includes(search.toLowerCase())
    return matchEntity && matchType && matchStatus && matchSearch
  })

  const filteredTransactions = transactions.filter(t => {
    const company = t.companies?.name || ''
    const partner = t.partners?.name || ''
    const matchEntity = filterEntity === 'all' || company.toLowerCase().includes(filterEntity)
    const matchType = filterType === 'all' || t.type === filterType
    const matchSearch = !search ||
      partner.toLowerCase().includes(search.toLowerCase()) ||
      (t.note || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.pl_category || '').toLowerCase().includes(search.toLowerCase())
    return matchEntity && matchType && matchSearch
  })

  const filteredPassthroughs = passthroughs.filter(p => {
    const company = p.companies?.name || ''
    const partner = p.partners?.name || ''
    const matchEntity = filterEntity === 'all' || company.toLowerCase().includes(filterEntity)
    const matchStatus = filterStatus === 'all' || p.status === filterStatus
    const matchSearch = !search ||
      partner.toLowerCase().includes(search.toLowerCase()) ||
      (p.note || '').toLowerCase().includes(search.toLowerCase())
    return matchEntity && matchStatus && matchSearch
  })

  const unpaidTotal = invoices
    .filter(i => ['unpaid', 'partial'].includes(i.calculated_status))
    .reduce((s, i) => s + (i.remaining_usd || 0), 0)

  const overdueCount = invoices.filter(i =>
    i.due_date && new Date(i.due_date) < new Date() &&
    ['unpaid', 'partial'].includes(i.calculated_status)
  ).length

  const unpairedPt = passthroughs.filter(p => p.status === 'unpaired').length
  const directWithPL = transactions.filter(t => t.type === 'direct' && t.pl_impact && t.status !== 'reconciled').length

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setSearch('')
    setFilterType('all')
    setFilterStatus('all')
    setShowMenu(null)
  }

  return (
    <div style={s.root} onClick={() => setShowMenu(null)}>

      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.navLogo}>
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
            <polygon points="18,2 34,30 2,30" fill="none" stroke="#1D9E75" strokeWidth="1.5" />
            <circle cx="18" cy="2" r="2" fill="#1D9E75" />
            <circle cx="34" cy="30" r="2" fill="#5DCAA5" />
            <circle cx="2" cy="30" r="2" fill="#9FE1CB" />
          </svg>
          <span style={s.navLogoText}>Mint<span style={{ color: '#1D9E75' }}>flow</span></span>
        </div>
        <div style={s.navLinks}>
          {['Dashboard', 'Transactions', 'P&L', 'Cash Flow', 'Reports', 'Partners', 'Settings'].map(l => (
            <span key={l} style={l === 'Transactions' ? s.navLinkActive : s.navLink}
              onClick={() => setPage(pageMap[l])}>{l}</span>
          ))}
        </div>
        <div style={s.navRight}>
          <div style={s.navAvatar}>{user?.email?.substring(0, 2).toUpperCase()}</div>
          <span style={s.navEmail}>{user?.email}</span>
          <button style={s.navSignout} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div style={s.body}>

        {/* Page header */}
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Ledger</div>
            <div style={s.pageSub}>Invoices, transactions and pass-throughs across all entities</div>
          </div>
          <div style={s.btnGroup}>
            <button style={s.btnInvoice} onClick={() => { setEditInvoice(null); setShowInvoiceDialog(true) }}>📄 New invoice</button>
            <button style={s.btnTransaction} onClick={() => { setEditTransaction(null); setShowTransactionDialog(true) }}>💳 New transaction</button>            
            <button style={s.btnBulk} onClick={() => setShowBulkImport(true)}>📥 Bulk import</button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={s.summaryRow}>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Outstanding invoices</div>
            <div style={s.summaryVal}>{fmtUSD(unpaidTotal)}</div>
            <div style={s.summarySub}>{invoices.filter(i => ['unpaid', 'partial'].includes(i.calculated_status)).length} invoices unpaid</div>
          </div>
          <div style={{ ...s.summaryCard, ...(overdueCount > 0 ? s.summaryCardAlert : {}) }}>
            <div style={s.summaryLabel}>Overdue</div>
            <div style={{ ...s.summaryVal, ...(overdueCount > 0 ? { color: '#A32D2D' } : {}) }}>{overdueCount}</div>
            <div style={s.summarySub}>{overdueCount > 0 ? 'Invoices past due date' : 'All invoices on time'}</div>
          </div>
          <div style={{ ...s.summaryCard, ...(directWithPL > 0 ? s.summaryCardWarn : {}) }}>
            <div style={s.summaryLabel}>Pending reconcile</div>
            <div style={{ ...s.summaryVal, ...(directWithPL > 0 ? { color: '#633806' } : {}) }}>{directWithPL}</div>
            <div style={s.summarySub}>{directWithPL > 0 ? 'Direct tx awaiting invoice' : 'All direct tx reconciled'}</div>
          </div>
          <div style={{ ...s.summaryCard, ...(unpairedPt > 0 ? s.summaryCardWarn : {}) }}>
            <div style={s.summaryLabel}>Unpaired pass-throughs</div>
            <div style={{ ...s.summaryVal, ...(unpairedPt > 0 ? { color: '#633806' } : {}) }}>{unpairedPt}</div>
            <div style={s.summarySub}>{unpairedPt > 0 ? 'Waiting for matching entry' : 'All pass-throughs paired'}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={s.tabBar}>
          <div style={{ display: 'flex', gap: 0 }}>
            {([
              { id: 'invoices', label: '📄 Invoices', count: invoices.length },
              { id: 'transactions', label: '💳 Transactions', count: transactions.length },
              { id: 'passthrough', label: '⚡ Pass-through', count: passthroughs.length },
            ] as { id: Tab; label: string; count: number }[]).map(tab => (
              <button key={tab.id}
                style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
                onClick={() => handleTabChange(tab.id)}>
                {tab.label}
                <span style={{ ...s.tabCount, ...(activeTab === tab.id ? s.tabCountActive : {}) }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

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

          {activeTab === 'invoices' && (
            <>
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
            </>
          )}

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
            {activeTab === 'invoices' && (
              <>{filteredInvoices.length} invoices · <strong>{fmtUSD(filteredInvoices.reduce((s, i) => s + (i.amount_usd || 0), 0))} USD</strong></>
            )}
            {activeTab === 'transactions' && (
              <>{filteredTransactions.length} entries · <strong>{fmtUSD(filteredTransactions.reduce((s, t) => s + (t.amount_usd || 0), 0))} USD</strong></>
            )}
            {activeTab === 'passthrough' && (
              <>{filteredPassthroughs.length} entries</>
            )}
          </div>
        </div>

        {/* Table area */}
        <div style={s.tableWrap}>
          {loading ? (
            <div style={s.emptyState}>
              <div style={{ fontSize: '14px', color: '#888' }}>Loading...</div>
            </div>
          ) : (
            activeTab === 'invoices' && (
              filteredInvoices.length === 0 ? (
                <div style={s.emptyState}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: '#111', marginBottom: '6px' }}>No invoices yet</div>
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>Click "New invoice" to add your first P&L entry.</div>
                  <button style={s.btnInvoice} onClick={() => setShowInvoiceDialog(true)}>📄 New invoice</button>
                </div>
              ) : (
                <table style={s.table}>
                  <thead>
                    <tr style={s.thead}>
                      <th style={s.th}>Invoice date</th>
                      <th style={s.th}>Due date</th>
                      <th style={s.th}>Partner</th>
                      <th style={s.th}>Invoice #</th>
                      <th style={s.th}>Type</th>
                      <th style={s.th}>P&L Category</th>
                      <th style={s.th}>Company</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Remaining</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((inv, i) => {
                      const isOverdue = inv.due_date &&
                        new Date(inv.due_date) < new Date() &&
                        ['unpaid', 'partial'].includes(inv.calculated_status)
                      return (
                        <tr key={inv.id} style={{ ...s.tr, background: i % 2 === 0 ? '#fff' : '#fafaf9' }}>
                          <td style={s.td}><span style={s.dateCell}>{inv.invoice_date}</span></td>
                          <td style={s.td}>
                            <span style={{ ...s.dateCell, color: isOverdue ? '#A32D2D' : '#666', fontWeight: isOverdue ? '600' : '400' }}>
                              {inv.due_date || '—'}{isOverdue && ' ⚠️'}
                            </span>
                          </td>
                          <td style={s.td}><span style={s.partnerCell}>{inv.partner_name || '—'}</span></td>
                          <td style={s.td}><span style={s.invNumCell}>{inv.invoice_number || '—'}</span></td>
                          <td style={s.td}>
                            <span style={{ ...s.badge, background: inv.type === 'expense' ? '#FCEBEB' : '#E1F5EE', color: inv.type === 'expense' ? '#A32D2D' : '#085041' }}>
                              {inv.type}
                            </span>
                          </td>
                          <td style={s.td}><span style={s.catCell}>{inv.pl_category || inv.revenue_stream || '—'}</span></td>
                          <td style={s.td}><span style={s.compCell}>{inv.company_name || '—'}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}>
                            <span style={s.amtCell}>{fmtAmount(inv.amount || 0, inv.currency)}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' as const }}>
                            <span style={{ ...s.amtCell, color: (inv.remaining_usd || 0) > 0.01 ? '#A32D2D' : '#1D9E75' }}>
                              {fmtUSD(inv.remaining_usd || 0)}
                            </span>
                          </td>
                          <td style={s.td}>
                            <span style={{ ...s.badge, background: invoiceStatusColors[inv.calculated_status]?.bg, color: invoiceStatusColors[inv.calculated_status]?.color }}>
                              {inv.calculated_status}
                            </span>
                          </td>
                          <td style={s.td} onClick={e => e.stopPropagation()}>
                            <div style={{ position: 'relative' }}>
                              <button style={s.editBtn} onClick={() => setShowMenu(showMenu === inv.id ? null : inv.id)}>···</button>
                              {showMenu === inv.id && (
                                <div style={s.contextMenu}>
                                  <div style={s.contextItem} onClick={() => handleEditInvoice(inv)}>✏️ Edit</div>
                                  <div style={s.contextItem} onClick={() => { setReconcileSource({ type: 'invoice', id: inv.id }); setShowMenu(null) }}>🔗 Reconcile</div>
                                  <div style={{ ...s.contextItem, color: '#A32D2D' }} onClick={() => deleteInvoice(inv.id)}>🗑 Delete</div>
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
            )
          )}

          {!loading && activeTab === 'transactions' && (
            filteredTransactions.length === 0 ? (
              <div style={s.emptyState}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>💳</div>
                <div style={{ fontSize: '15px', fontWeight: '500', color: '#111', marginBottom: '6px' }}>No transactions yet</div>
                <div style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>Click "New transaction" or use Bulk import.</div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button style={s.btnTransaction} onClick={() => setShowTransactionDialog(true)}>💳 New transaction</button>
                  <button style={s.btnBulk} onClick={() => setShowBulkImport(true)}>📥 Bulk import</button>
                </div>
              </div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Partner</th>
                    <th style={s.th}>Type</th>
                    <th style={s.th}>P&L / Invoice</th>
                    <th style={s.th}>Note</th>
                    <th style={s.th}>Company</th>
                    <th style={s.th}>Bank</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>USD</th>
                    <th style={s.th}>P&L</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t, i) => (
                    <tr key={t.id} style={{ ...s.tr, background: i % 2 === 0 ? '#fff' : '#fafaf9' }}>
                      <td style={s.td}><span style={s.dateCell}>{t.transaction_date}</span></td>
                      <td style={s.td}><span style={s.partnerCell}>{t.partners?.name || '—'}</span></td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: txTypeColors[t.type]?.bg, color: txTypeColors[t.type]?.color }}>
                          {t.type === 'invoice_payment' ? 'Inv. payment' : t.type}
                        </span>
                      </td>
                      <td style={s.td}>
                        <span style={s.catCell}>
                          {t.pl_impact
                            ? (t.pl_category || t.revenue_stream || '—')
                            : <span style={{ color: '#aaa', fontSize: '11px' }}>via invoice</span>}
                        </span>
                      </td>
                      <td style={s.td}><span style={s.descCell}>{t.note || '—'}</span></td>
                      <td style={s.td}><span style={s.compCell}>{t.companies?.name || '—'}</span></td>
                      <td style={s.td}><span style={s.compCell}>{t.banks?.name || '—'}</span></td>
                      <td style={{ ...s.td, textAlign: 'right' as const }}>
                        <span style={s.amtCell}>{(t.amount || 0).toLocaleString()} {t.currency}</span>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' as const }}>
                        <span style={s.usdCell}>{fmtUSD(t.amount_usd || 0)}</span>
                      </td>
                      <td style={s.td}>
                        {t.pl_impact
                          ? <span style={{ ...s.badge, background: '#E1F5EE', color: '#085041' }}>✓ P&L</span>
                          : <span style={{ ...s.badge, background: '#f0f0ee', color: '#aaa' }}>Cash only</span>}
                      </td>
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        <div style={{ position: 'relative' }}>
                          <button style={s.editBtn} onClick={() => setShowMenu(showMenu === t.id ? null : t.id)}>···</button>
                          {showMenu === t.id && (
                            <div style={s.contextMenu}>
                              <div style={s.contextItem} onClick={() => handleEditTransaction(t)}>✏️ Edit</div>
                              {t.type === 'direct' && (
                                <div style={s.contextItem} onClick={() => { setReconcileSource({ type: 'transaction', id: t.id }); setShowMenu(null) }}>🔗 Reconcile</div>
                              )}
                              <div style={{ ...s.contextItem, color: '#A32D2D' }} onClick={() => deleteTransaction(t.id)}>🗑 Delete</div>
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
                <div style={{ fontSize: '15px', fontWeight: '500', color: '#111', marginBottom: '6px' }}>No pass-through entries</div>
                <div style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>Click "Pass-through" to add an IN or OUT entry.</div>
                <button style={s.btnPassthrough} onClick={() => setShowPassthroughDialog(true)}>⚡ Pass-through</button>
              </div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Period</th>
                    <th style={s.th}>Partner</th>
                    <th style={s.th}>Direction</th>
                    <th style={s.th}>Company</th>
                    <th style={s.th}>Bank</th>
                    <th style={s.th}>Note</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>USD</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPassthroughs.map((p, i) => (
                    <tr key={p.id} style={{ ...s.tr, background: i % 2 === 0 ? '#fff' : '#fafaf9' }}>
                      <td style={s.td}><span style={s.dateCell}>{p.transaction_date}</span></td>
                      <td style={s.td}><span style={s.dateCell}>{p.period_month}</span></td>
                      <td style={s.td}><span style={s.partnerCell}>{p.partners?.name || '—'}</span></td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: p.direction === 'in' ? '#E1F5EE' : '#FCEBEB', color: p.direction === 'in' ? '#085041' : '#A32D2D' }}>
                          {p.direction === 'in' ? '📥 IN' : '📤 OUT'}
                        </span>
                      </td>
                      <td style={s.td}><span style={s.compCell}>{p.companies?.name || '—'}</span></td>
                      <td style={s.td}><span style={s.compCell}>{p.banks?.name || '—'}</span></td>
                      <td style={s.td}><span style={s.descCell}>{p.note || '—'}</span></td>
                      <td style={{ ...s.td, textAlign: 'right' as const }}>
                        <span style={s.amtCell}>{(p.amount || 0).toLocaleString()} {p.currency}</span>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' as const }}>
                        <span style={s.usdCell}>${(p.amount_usd || 0).toLocaleString()}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: ptStatusColors[p.status]?.bg, color: ptStatusColors[p.status]?.color }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        <div style={{ position: 'relative' }}>
                          <button style={s.editBtn} onClick={() => setShowMenu(showMenu === p.id ? null : p.id)}>···</button>
                          {showMenu === p.id && (
                            <div style={s.contextMenu}>
                              <div style={s.contextItem} onClick={() => handleEditPassthrough(p)}>✏️ Edit</div>
                              <div style={{ ...s.contextItem, color: '#A32D2D' }} onClick={() => deletePassthrough(p.id)}>🗑 Delete</div>
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
      </div>

      {/* Dialogs */}
      {(showInvoiceDialog || editInvoice) && (
        <InvoiceDialog
          onClose={() => { setShowInvoiceDialog(false); setEditInvoice(null); fetchInvoices() }}
          invoice={editInvoice}
        />
      )}
      {(showTransactionDialog || editTransaction) && (
        <TransactionDialog
          onClose={() => { setShowTransactionDialog(false); setEditTransaction(null); fetchTransactions() }}
          transaction={editTransaction}
        />
      )}
      {(showPassthroughDialog || editPassthrough) && (
        <PassthroughDialog
          onClose={() => { setShowPassthroughDialog(false); setEditPassthrough(null); fetchPassthroughs() }}
          passthrough={editPassthrough}
        />
      )}
      {reconcileSource && (
        <ReconcilePanel
          sourceType={reconcileSource.type}
          sourceId={reconcileSource.id}
          onClose={() => setReconcileSource(null)}
          onReconciled={() => fetchAll()}
        />
      )}
      {showBulkImport && (
        <BulkImport
          onClose={() => setShowBulkImport(false)}
          onImported={() => fetchAll()}
        />
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#f5f5f3', fontFamily: 'system-ui,sans-serif' },
  nav: { background: '#0a1628', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: '52px' },
  navLogo: { display: 'flex', alignItems: 'center', gap: '8px' },
  navLogoText: { fontFamily: 'Georgia,serif', fontSize: '18px', fontWeight: '500', color: '#fff' },
  navLinks: { display: 'flex', gap: '4px' },
  navLink: { fontSize: '13px', color: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' },
  navLinkActive: { fontSize: '13px', color: '#fff', padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' },
  navRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  navAvatar: { width: '30px', height: '30px', borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '500', color: '#fff' },
  navEmail: { fontSize: '13px', color: 'rgba(255,255,255,0.7)' },
  navSignout: { background: 'none', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer' },
  body: { padding: '2rem 1.5rem' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle: { fontFamily: 'Georgia,serif', fontSize: '24px', fontWeight: '400', color: '#111', marginBottom: '4px' },
  pageSub: { fontSize: '13px', color: '#888' },
  btnGroup: { display: 'flex', gap: '8px' },
  btnInvoice: { background: '#1D9E75', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  btnTransaction: { background: '#0C447C', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  btnPassthrough: { background: 'transparent', color: '#633806', border: '0.5px solid #E5B96A', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  btnBulk: { background: 'transparent', color: '#0C447C', border: '0.5px solid #0C447C', borderRadius: '8px', padding: '9px 16px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '1.5rem' },
  summaryCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '14px 16px' },
  summaryCardAlert: { border: '0.5px solid #F5A9A9', background: '#FFF5F5' },
  summaryCardWarn: { border: '0.5px solid #E5B96A', background: '#FFFAF0' },
  summaryLabel: { fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '6px' },
  summaryVal: { fontSize: '22px', fontWeight: '500', color: '#111', marginBottom: '4px' },
  summarySub: { fontSize: '11px', color: '#aaa' },
  tabBar: { display: 'flex', alignItems: 'center', borderBottom: '0.5px solid #e5e5e5', marginBottom: '1rem' },
  tab: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '10px 18px', border: 'none', background: 'transparent', color: '#888', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-0.5px', display: 'flex', alignItems: 'center', gap: '6px' },
  tabActive: { color: '#111', borderBottomColor: '#1D9E75', fontWeight: '500' },
  tabCount: { fontSize: '10px', fontWeight: '500', padding: '1px 6px', borderRadius: '10px', background: '#f0f0ee', color: '#888' },
  tabCountActive: { background: '#E1F5EE', color: '#085041' },
  filterBar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap' as const },
  searchInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#fff', color: '#111', flex: '1', minWidth: '200px' },
  filterSelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#fff', color: '#111', cursor: 'pointer' },
  totalBadge: { fontSize: '13px', color: '#666', background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 12px', marginLeft: 'auto', whiteSpace: 'nowrap' as const },
  tableWrap: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', overflow: 'visible' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  thead: { background: '#f5f5f3' },
  th: { padding: '10px 12px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', borderBottom: '0.5px solid #e5e5e5', whiteSpace: 'nowrap' as const },
  tr: { borderBottom: '0.5px solid #f0f0ee' },
  td: { padding: '10px 12px', verticalAlign: 'middle' as const, color: '#111' },
  emptyState: { padding: '3rem', textAlign: 'center' as const },
  dateCell: { fontSize: '12px', color: '#666', whiteSpace: 'nowrap' as const },
  partnerCell: { fontSize: '13px', fontWeight: '500', color: '#111' },
  invNumCell: { fontSize: '11px', color: '#888', fontFamily: 'monospace', background: '#f5f5f3', padding: '2px 6px', borderRadius: '4px' },
  catCell: { fontSize: '11px', color: '#666' },
  descCell: { fontSize: '11px', color: '#888', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' },
  compCell: { fontSize: '11px', color: '#888' },
  amtCell: { fontSize: '13px', fontWeight: '500', color: '#111', whiteSpace: 'nowrap' as const },
  usdCell: { fontSize: '13px', fontWeight: '500', color: '#1D9E75', whiteSpace: 'nowrap' as const },
  badge: { fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '20px', textTransform: 'capitalize' as const, whiteSpace: 'nowrap' as const },
  editBtn: { background: 'none', border: '0.5px solid #e5e5e5', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#888', fontSize: '14px' },
  contextMenu: { position: 'fixed' as const, background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', zIndex: 9999, minWidth: '140px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
  contextItem: { padding: '8px 14px', fontSize: '13px', color: '#111', cursor: 'pointer', borderBottom: '0.5px solid #f0f0ee' },
}