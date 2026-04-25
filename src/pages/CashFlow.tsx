import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'
import type { Page } from '../App'
import { supabase } from '../supabase'
import { fmtUSD, fmtUSDSigned, fmtAmount } from '../utils/formatters'

export default function CashFlow() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)

  const [companies, setCompanies] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('all')
  const [periodType, setPeriodType] = useState<'month' | 'quarter' | 'year'>('month')
  const [periodValue, setPeriodValue] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)

  const [transactions, setTransactions] = useState<any[]>([])
  const [passthroughs, setPassthroughs] = useState<any[]>([])

  const currentYear = new Date().getFullYear()

  const pageMap: Record<string, Page> = {
    'Dashboard': 'dashboard', 'Transactions': 'transactions',
    'P&L': 'pl', 'Cash Flow': 'cashflow', 'Reports': 'reports',
    'Partners': 'partners', 'Settings': 'settings',
  }

  useEffect(() => {
    const load = async () => {
      const [{ data: comp }, { data: bnk }] = await Promise.all([
        supabase.from('companies').select('id,name').order('name'),
        supabase.from('banks').select('id,name,company_id,currency').order('name'),
      ])
      if (comp) setCompanies(comp)
      if (bnk) setBanks(bnk)
    }
    load()
  }, [])

  const getDateRange = useCallback(() => {
    if (periodType === 'month') {
      const [y, m] = periodValue.split('-')
      const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
      return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` }
    }
    if (periodType === 'quarter') {
      const [y, q] = periodValue.split('-Q')
      const qNum = parseInt(q)
      const startMonth = (qNum - 1) * 3 + 1
      const endMonth = qNum * 3
      const lastDay = new Date(parseInt(y), endMonth, 0).getDate()
      return {
        start: `${y}-${String(startMonth).padStart(2, '0')}-01`,
        end: `${y}-${String(endMonth).padStart(2, '0')}-${lastDay}`,
      }
    }
    return { start: `${periodValue}-01-01`, end: `${periodValue}-12-31` }
  }, [periodType, periodValue])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { start, end } = getDateRange()

    let txQuery = supabase
      .from('transactions')
      .select('*, partners(name), banks(name,currency,company_id)')
      .gte('transaction_date', start)
      .lte('transaction_date', end)
      .eq('status', 'posted')
    if (companyId !== 'all') txQuery = txQuery.eq('company_id', companyId)

    let ptQuery = supabase
      .from('passthrough')
      .select('*, partners(name), banks(name,currency,company_id)')
      .gte('transaction_date', start)
      .lte('transaction_date', end)
    if (companyId !== 'all') ptQuery = ptQuery.eq('company_id', companyId)

    const [{ data: txData }, { data: ptData }] = await Promise.all([txQuery, ptQuery])
    setTransactions(txData || [])
    setPassthroughs(ptData || [])
    setLoading(false)
  }, [companyId, getDateRange])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Cash flow logic ───────────────────────────────────
  // Inflows: direct revenue transactions
  const operatingIn = transactions
    .filter(t => t.type === 'direct' && t.tx_subtype === 'revenue')
    .reduce((s, t) => s + (t.amount_usd || 0), 0)

  // Outflows: direct expense + invoice payments (mi plaćamo)
  // Excluding banking and taxes (separate line items)
  const operatingOut = transactions
    .filter(t =>
      (t.type === 'direct' && t.tx_subtype === 'expense') ||
      t.type === 'invoice_payment'
    )
    .filter(t => !['Banking and Finance', 'Taxes'].includes(t.pl_category || ''))
    .reduce((s, t) => s + (t.amount_usd || 0), 0)

  const bankingOut = transactions
    .filter(t => t.pl_category === 'Banking and Finance')
    .reduce((s, t) => s + (t.amount_usd || 0), 0)

  const taxOut = transactions
    .filter(t => t.pl_category === 'Taxes')
    .reduce((s, t) => s + (t.amount_usd || 0), 0)

  const ptIn = passthroughs.filter(p => p.direction === 'in').reduce((s, p) => s + (p.amount_usd || 0), 0)
  const ptOut = passthroughs.filter(p => p.direction === 'out').reduce((s, p) => s + (p.amount_usd || 0), 0)

  const totalInflows = operatingIn + ptIn
  const totalOutflows = operatingOut + bankingOut + taxOut + ptOut
  const netCashFlow = totalInflows - totalOutflows

  const filteredBanks = companyId === 'all' ? banks : banks.filter(b => b.company_id === companyId)

  const getBankFlow = (bankId: string) => {
    const bankTx = transactions.filter(t => t.bank_id === bankId)
    const income = bankTx
      .filter(t => t.type === 'direct' && t.tx_subtype === 'revenue')
      .reduce((s, t) => s + (t.amount_usd || 0), 0)
    const expense = bankTx
      .filter(t => (t.type === 'direct' && t.tx_subtype === 'expense') || t.type === 'invoice_payment')
      .reduce((s, t) => s + (t.amount_usd || 0), 0)
    return { income, expense, net: income - expense, txCount: bankTx.length }
  }

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return { value: `${currentYear}-${m}`, label: new Date(currentYear, i, 1).toLocaleString('en', { month: 'long', year: 'numeric' }) }
  })
  const quarters = [1, 2, 3, 4].map(q => ({ value: `${currentYear}-Q${q}`, label: `Q${q} ${currentYear}` }))
  const years = [currentYear - 1, currentYear].map(y => ({ value: String(y), label: String(y) }))

  const cashFlowSections = [
    {
      section: 'Operating Activities', color: '#0F6E56', bg: '#E1F5EE',
      items: [
        { name: 'Revenue received from customers', amount: operatingIn },
        { name: 'Payments to suppliers (invoices + direct)', amount: -operatingOut },
        { name: 'Banking fees & finance charges', amount: -bankingOut },
        { name: 'Taxes paid', amount: -taxOut },
      ]
    },
    {
      section: 'Pass-through Flows', color: '#0C447C', bg: '#E6F1FB',
      items: [
        { name: 'Pass-through inflows (IN)', amount: ptIn },
        { name: 'Pass-through outflows (OUT)', amount: -ptOut },
      ]
    },
  ]

  const sectionTotal = (items: { amount: number }[]) => items.reduce((s, i) => s + i.amount, 0)

  const currencyColor = (cur: string) => {
    if (cur === 'USD') return { bg: '#E6F1FB', color: '#0C447C' }
    if (cur === 'RSD') return { bg: '#FAEEDA', color: '#633806' }
    if (cur === 'EUR') return { bg: '#E1F5EE', color: '#085041' }
    return { bg: '#FBEAF0', color: '#72243E' }
  }

  const fmtAmt = (n: number) => {
    if (n === 0) return '—'
    return fmtUSDSigned(n)
  }

  return (
    <div style={s.root}>
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
            <span key={l} style={l === 'Cash Flow' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l])}>{l}</span>
          ))}
        </div>
        <div style={s.navRight}>
          <div style={s.navAvatar}>{user?.email?.substring(0, 2).toUpperCase()}</div>
          <span style={s.navEmail}>{user?.email}</span>
          <button style={s.navSignout} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Cash Flow</div>
            <div style={s.pageSub}>
              {loading ? 'Loading...' : `${transactions.length} transactions · ${passthroughs.length} pass-throughs · USD equiv.`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
            <select style={s.filterSelect} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="all">All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select style={s.filterSelect} value={periodType}
              onChange={e => {
                const t = e.target.value as 'month' | 'quarter' | 'year'
                setPeriodType(t)
                setPeriodValue(t === 'month' ? new Date().toISOString().slice(0, 7) : t === 'quarter' ? `${currentYear}-Q1` : String(currentYear))
              }}>
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="year">Annual</option>
            </select>
            <select style={s.filterSelect} value={periodValue} onChange={e => setPeriodValue(e.target.value)}>
              {periodType === 'month' && months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              {periodType === 'quarter' && quarters.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
              {periodType === 'year' && years.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
          </div>
        </div>

        {/* Summary cards */}
        <div style={s.summaryGrid}>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total inflows</div>
            <div style={{ ...s.summaryValue, color: '#0F6E56' }}>{loading ? '...' : fmtUSD(totalInflows)}</div>
            <div style={s.summarySub}>Revenue + pass-through IN</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total outflows</div>
            <div style={{ ...s.summaryValue, color: '#A32D2D' }}>{loading ? '...' : fmtUSD(totalOutflows)}</div>
            <div style={s.summarySub}>Expenses + invoices + pass-through OUT</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Net cash flow</div>
            <div style={{ ...s.summaryValue, color: netCashFlow >= 0 ? '#0F6E56' : '#A32D2D' }}>
              {loading ? '...' : fmtUSDSigned(netCashFlow)}
            </div>
            <div style={s.summarySub}>For selected period</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Pass-through balance</div>
            <div style={{ ...s.summaryValue, color: Math.abs(ptIn - ptOut) < 1 ? '#0F6E56' : '#BA7517' }}>
              {loading ? '...' : fmtUSDSigned(ptIn - ptOut)}
            </div>
            <div style={s.summarySub}>{passthroughs.filter(p => p.status === 'unpaired').length} unpaired entries</div>
          </div>
        </div>

        {!loading && transactions.length === 0 && passthroughs.length === 0 && (
          <div style={s.emptyState}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>💸</div>
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#111', marginBottom: '6px' }}>No cash flow data for this period</div>
            <div style={{ fontSize: '13px', color: '#888' }}>Post transactions to see real cash flow data here.</div>
          </div>
        )}

        {(transactions.length > 0 || passthroughs.length > 0 || loading) && (
          <div style={s.contentGrid}>
            <div>
              <div style={s.sectionLabel}>Cash flow statement</div>
              <div style={s.tableWrap}>
                {loading ? (
                  <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888', fontSize: '13px' }}>Loading...</div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr style={s.theadRow}>
                        <th style={{ ...s.th, width: '60%' }}>Item</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>Amount (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashFlowSections.map(sec => (
                        <React.Fragment key={sec.section}>
                          <tr>
                            <td colSpan={2} style={{ ...s.catCell, borderLeft: `3px solid ${sec.color}`, background: sec.bg, color: sec.color }}>
                              {sec.section.toUpperCase()}
                            </td>
                          </tr>
                          {sec.items.map(item => (
                            <tr key={item.name} style={s.dataRow}>
                              <td style={s.td}>{item.name}</td>
                              <td style={{ ...s.td, textAlign: 'right' as const, fontWeight: '500', color: item.amount > 0 ? '#0F6E56' : item.amount < 0 ? '#A32D2D' : '#888' }}>
                                {fmtAmt(item.amount)}
                              </td>
                            </tr>
                          ))}
                          <tr style={s.subTotalRow}>
                            <td style={s.subTotalCell}>Net {sec.section}</td>
                            <td style={{ ...s.subTotalCell, textAlign: 'right' as const, color: sectionTotal(sec.items) >= 0 ? '#0F6E56' : '#A32D2D' }}>
                              {fmtAmt(sectionTotal(sec.items))}
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr style={s.netRow}>
                        <td style={s.netCell}>NET CHANGE IN CASH</td>
                        <td style={{ ...s.netCell, textAlign: 'right' as const, color: netCashFlow >= 0 ? '#5DCAA5' : '#F09595' }}>
                          {fmtAmt(netCashFlow)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {!loading && transactions.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={s.sectionLabel}>Recent transactions</div>
                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr style={s.theadRow}>
                          <th style={s.th}>Date</th>
                          <th style={s.th}>Partner</th>
                          <th style={s.th}>Bank</th>
                          <th style={s.th}>Type</th>
                          <th style={{ ...s.th, textAlign: 'right' as const }}>Amount</th>
                          <th style={{ ...s.th, textAlign: 'right' as const }}>USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.slice(0, 15).map(tx => {
                          const isIn = tx.type === 'direct' && tx.tx_subtype === 'revenue'
                          return (
                            <tr key={tx.id} style={s.dataRow}>
                              <td style={s.td}>{tx.transaction_date}</td>
                              <td style={s.td}>{tx.partners?.name || '—'}</td>
                              <td style={s.td}>{tx.banks?.name || '—'}</td>
                              <td style={s.td}>
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: tx.type === 'direct' ? (tx.tx_subtype === 'revenue' ? '#E1F5EE' : '#FCEBEB') : '#E6F1FB', color: tx.type === 'direct' ? (tx.tx_subtype === 'revenue' ? '#085041' : '#A32D2D') : '#0C447C' }}>
                                  {tx.type === 'direct' ? (tx.tx_subtype === 'revenue' ? '📥 Direct IN' : '📤 Direct OUT') : '💳 Invoice payment'}
                                </span>
                              </td>
                              <td style={{ ...s.td, textAlign: 'right' as const, color: isIn ? '#0F6E56' : '#A32D2D', fontWeight: '500' }}>
                                {isIn ? '+' : '-'}{fmtAmount(tx.amount || 0, tx.currency || 'USD')}
                              </td>
                              <td style={{ ...s.td, textAlign: 'right' as const, color: '#888' }}>
                                {fmtUSD(tx.amount_usd || 0)}
                              </td>
                            </tr>
                          )
                        })}
                        {transactions.length > 15 && (
                          <tr style={s.dataRow}>
                            <td colSpan={6} style={{ ...s.td, textAlign: 'center' as const, color: '#aaa', fontStyle: 'italic' }}>
                              +{transactions.length - 15} more — go to Transactions tab to see all
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Bank accounts */}
            <div>
              <div style={s.sectionLabel}>Bank accounts</div>
              <div style={s.accountsWrap}>
                {filteredBanks.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center' as const, color: '#aaa', fontSize: '13px', background: '#fff', borderRadius: '10px', border: '0.5px solid #e5e5e5' }}>
                    No bank accounts found.
                  </div>
                ) : filteredBanks.map(bank => {
                  const flow = getBankFlow(bank.id)
                  const cc = currencyColor(bank.currency || 'USD')
                  const compName = companies.find(c => c.id === bank.company_id)?.name || '—'
                  return (
                    <div key={bank.id} style={s.accountCard}>
                      <div style={s.accountHeader}>
                        <div>
                          <div style={s.accountName}>{bank.name}</div>
                          <div style={s.accountCompany}>{compName}</div>
                        </div>
                        <span style={{ ...s.currBadge, background: cc.bg, color: cc.color }}>{bank.currency || 'USD'}</span>
                      </div>
                      <div style={s.accountBalances}>
                        <div>
                          <div style={s.balLabel}>Inflows</div>
                          <div style={{ ...s.balValue, color: '#0F6E56' }}>{fmtUSD(flow.income)}</div>
                        </div>
                        <div style={{ fontSize: '14px', color: '#aaa', alignSelf: 'flex-end', paddingBottom: '2px' }}>→</div>
                        <div>
                          <div style={s.balLabel}>Outflows</div>
                          <div style={{ ...s.balValue, color: '#A32D2D' }}>{fmtUSD(flow.expense)}</div>
                        </div>
                        <div style={{ ...s.diffBadge, background: flow.net >= 0 ? '#E1F5EE' : '#FCEBEB', color: flow.net >= 0 ? '#085041' : '#A32D2D' }}>
                          {fmtUSDSigned(flow.net)}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>
                        {flow.txCount} transaction{flow.txCount !== 1 ? 's' : ''} in period
                      </div>
                    </div>
                  )
                })}
              </div>

              {passthroughs.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={s.sectionLabel}>Pass-through entries</div>
                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr style={s.theadRow}>
                          <th style={s.th}>Date</th>
                          <th style={s.th}>Partner</th>
                          <th style={s.th}>Dir.</th>
                          <th style={{ ...s.th, textAlign: 'right' as const }}>USD</th>
                          <th style={s.th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {passthroughs.slice(0, 8).map(pt => (
                          <tr key={pt.id} style={s.dataRow}>
                            <td style={s.td}>{pt.transaction_date}</td>
                            <td style={s.td}>{pt.partners?.name || '—'}</td>
                            <td style={s.td}>
                              <span style={{ fontSize: '12px' }}>{pt.direction === 'in' ? '📥' : '📤'}</span>
                            </td>
                            <td style={{ ...s.td, textAlign: 'right' as const, color: pt.direction === 'in' ? '#0F6E56' : '#A32D2D' }}>
                              {pt.direction === 'in' ? '+' : '-'}{fmtUSD(pt.amount_usd || 0)}
                            </td>
                            <td style={s.td}>
                              <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: pt.status === 'balanced' ? '#E1F5EE' : pt.status === 'paired' ? '#FAEEDA' : '#FCEBEB', color: pt.status === 'balanced' ? '#085041' : pt.status === 'paired' ? '#633806' : '#A32D2D' }}>
                                {pt.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
  filterSelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#fff', color: '#111', cursor: 'pointer' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '1.5rem' },
  summaryCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '1rem 1.25rem' },
  summaryLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' },
  summaryValue: { fontSize: '22px', fontWeight: '500' },
  summarySub: { fontSize: '11px', color: '#888', marginTop: '4px' },
  emptyState: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '60px', textAlign: 'center' as const },
  contentGrid: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' },
  sectionLabel: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '10px' },
  tableWrap: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  theadRow: { background: '#0a1628' },
  th: { padding: '10px 16px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '500', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.1em' },
  catCell: { padding: '8px 16px', fontSize: '11px', fontWeight: '500', letterSpacing: '0.1em' },
  dataRow: { borderBottom: '0.5px solid #f0f0ee' },
  td: { padding: '9px 16px', color: '#333', fontSize: '13px' },
  subTotalRow: { background: '#f5f5f3', borderTop: '0.5px solid #e5e5e5' },
  subTotalCell: { padding: '8px 16px', fontSize: '12px', fontWeight: '500', color: '#666' },
  netRow: { background: '#0a1628' },
  netCell: { padding: '14px 16px', fontSize: '14px', fontWeight: '500', color: '#fff' },
  accountsWrap: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  accountCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '10px', padding: '12px 14px' },
  accountHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' },
  accountName: { fontSize: '13px', fontWeight: '500', color: '#111' },
  accountCompany: { fontSize: '11px', color: '#888', marginTop: '2px' },
  currBadge: { fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '20px' },
  accountBalances: { display: 'flex', alignItems: 'center', gap: '10px' },
  balLabel: { fontSize: '10px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' },
  balValue: { fontSize: '13px', fontWeight: '500', color: '#111' },
  diffBadge: { fontSize: '11px', fontWeight: '500', padding: '3px 8px', borderRadius: '20px', marginLeft: 'auto' },
}