import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'
import type { Page } from '../App'
import { supabase } from '../supabase'
import { fmtUSD as fmt, fmtUSDSigned as fmtN } from '../utils/formatters'

export default function Reports() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [activeReport, setActiveReport] = useState('')
  const [companies, setCompanies] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('all')
  const [loading, setLoading] = useState(true)

  const [kpis, setKpis] = useState({
    netProfit: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    expenseRatio: 0,
    openInvoicesCount: 0,
    openInvoicesAmount: 0,
    unmatchedPassthrough: 0,
    overdueCount: 0,
  })

  const currentYear = new Date().getFullYear()
  const ytdStart = `${currentYear}-01-01`
  const today = new Date().toISOString().split('T')[0]

  const pageMap: Record<string, Page> = {
    'Dashboard': 'dashboard', 'Transactions': 'transactions',
    'P&L': 'pl', 'Cash Flow': 'cashflow', 'Reports': 'reports',
    'Partners': 'partners', 'Settings': 'settings',
  }

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('companies').select('id,name').order('name')
      if (data) setCompanies(data)
    }
    load()
  }, [])

  const fetchKpis = useCallback(async () => {
    setLoading(true)
    try {
      let plQuery = supabase.from('v_pl_entries').select('tx_type,amount_usd')
        .gte('pl_date', ytdStart).lte('pl_date', today)
      if (companyId !== 'all') plQuery = plQuery.eq('company_id', companyId)

      let invQuery = supabase.from('v_invoice_status').select('calculated_status,remaining_usd,due_date')
        .in('calculated_status', ['unpaid', 'partial'])
      if (companyId !== 'all') invQuery = invQuery.eq('company_id', companyId)

      let ptQuery = supabase.from('passthrough').select('id', { count: 'exact', head: true }).eq('status', 'unpaired')
      if (companyId !== 'all') ptQuery = ptQuery.eq('company_id', companyId)

      const [{ data: plData }, { data: invData }, { count: ptCount }] = await Promise.all([
        plQuery, invQuery, ptQuery,
      ])

      const revenue = (plData || []).filter(e => e.tx_type === 'revenue' || e.tx_type === 'invoice_revenue').reduce((s, e) => s + (e.amount_usd || 0), 0)
      const expenses = (plData || []).filter(e => e.tx_type === 'expense' || e.tx_type === 'invoice_expense').reduce((s, e) => s + (e.amount_usd || 0), 0)
      const openAmt = (invData || []).reduce((s, i) => s + (i.remaining_usd || 0), 0)
      const overdue = (invData || []).filter(i => i.due_date && i.due_date < today).length

      setKpis({
        netProfit: revenue - expenses,
        totalRevenue: revenue,
        totalExpenses: expenses,
        expenseRatio: revenue > 0 ? (expenses / revenue * 100) : 0,
        openInvoicesCount: (invData || []).length,
        openInvoicesAmount: openAmt,
        unmatchedPassthrough: ptCount || 0,
        overdueCount: overdue,
      })
    } catch (err) {
      console.error('Reports KPI fetch error:', err)
    }
    setLoading(false)
  }, [companyId, ytdStart, today])

  useEffect(() => { fetchKpis() }, [fetchKpis])

  const kpiCards = [
    {
      label: 'Net Profit (YTD)',
      value: loading ? '...' : fmtN(kpis.netProfit),
      sub: `${currentYear} year to date`,
      up: kpis.netProfit >= 0,
      trend: loading ? '' : kpis.netProfit >= 0 ? 'Profitable' : 'Loss',
    },
    {
      label: 'Total Revenue (YTD)',
      value: loading ? '...' : fmt(kpis.totalRevenue),
      sub: `${currentYear} year to date`,
      up: true,
      trend: loading ? '' : `${fmt(kpis.totalExpenses)} expenses`,
    },
    {
      label: 'Expense Ratio',
      value: loading ? '...' : `${kpis.expenseRatio.toFixed(1)}%`,
      sub: 'Expenses / Revenue YTD',
      up: kpis.expenseRatio < 90,
      trend: loading ? '' : kpis.expenseRatio < 80 ? 'Healthy' : kpis.expenseRatio < 90 ? 'Watch' : 'High',
    },
    {
      label: 'Open Invoices',
      value: loading ? '...' : kpis.openInvoicesCount > 0 ? `${kpis.openInvoicesCount} · ${fmt(kpis.openInvoicesAmount)}` : 'None',
      sub: loading ? '' : kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : 'All on time',
      up: kpis.overdueCount === 0,
      trend: loading ? '' : kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : 'On time',
    },
  ]

  const reports = [
    { id: 'pl-monthly', title: 'Monthly P&L', desc: 'Profit & Loss by month with revenue stream breakdown', category: 'P&L', icon: '📊', color: '#0F6E56', bg: '#E1F5EE', page: 'pl' },
    { id: 'pl-by-dept', title: 'P&L by Department', desc: 'Expense breakdown per organizational unit', category: 'P&L', icon: '👥', color: '#0F6E56', bg: '#E1F5EE', page: 'pl' },
    { id: 'cashflow-monthly', title: 'Monthly Cash Flow', desc: 'Operating and financing activities by period', category: 'Cash Flow', icon: '💰', color: '#0C447C', bg: '#E6F1FB', page: 'cashflow' },
    { id: 'bank-reconciliation', title: 'Bank Reconciliation', desc: 'Statement vs. recorded transactions per account', category: 'Cash Flow', icon: '🏦', color: '#0C447C', bg: '#E6F1FB', page: 'cashflow' },
    { id: 'passthrough', title: 'Pass-through Balance', desc: 'Pass-through IN vs. OUT monthly balance', category: 'Compliance', icon: '⚖️', color: '#633806', bg: '#FAEEDA', page: 'cashflow' },
    { id: 'unmatched', title: 'Unmatched Invoices', desc: 'Open invoices without corresponding payment', category: 'Compliance', icon: '⚠️', color: '#854F0B', bg: '#FAEEDA', page: 'reports' },
    { id: 'exchange-rates', title: 'Exchange Rate Log', desc: 'Rates used per period and transaction', category: 'Reference', icon: '💱', color: '#444', bg: '#f0f0ee', page: 'reports' },
    { id: 'partner-summary', title: 'Partner Summary', desc: 'Total transactions per partner across all entities', category: 'Reference', icon: '🤝', color: '#444', bg: '#f0f0ee', page: 'partners' },
  ]

  const categories = ['P&L', 'Cash Flow', 'Compliance', 'Reference']
  const categoryColors: Record<string, { color: string; bg: string }> = {
    'P&L': { color: '#0F6E56', bg: '#E1F5EE' },
    'Cash Flow': { color: '#0C447C', bg: '#E6F1FB' },
    'Compliance': { color: '#633806', bg: '#FAEEDA' },
    'Reference': { color: '#444', bg: '#f0f0ee' },
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
            <span key={l} style={l === 'Reports' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l] as Page)}>{l}</span>
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
            <div style={s.pageTitle}>Reports</div>
            <div style={s.pageSub}>Financial reports and analytics · YTD {currentYear}</div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <select style={s.filterSelect} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="all">All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* KPI cards */}
        <div style={s.kpiGrid}>
          {kpiCards.map(k => (
            <div key={k.label} style={s.kpiCard}>
              <div style={s.kpiLabel}>{k.label}</div>
              <div style={s.kpiValue}>{k.value}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ ...s.kpiTrend, color: k.up ? '#0F6E56' : '#A32D2D', background: k.up ? '#E1F5EE' : '#FCEBEB' }}>
                  {k.up ? '↑' : '↓'} {k.trend}
                </span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>{k.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Compliance alerts */}
        {!loading && (kpis.overdueCount > 0 || kpis.unmatchedPassthrough > 0) && (
          <div style={s.alertBox}>
            <div style={{ fontSize: '12px', fontWeight: '500', color: '#633806', marginBottom: '8px' }}>⚠️ Attention required</div>
            {kpis.overdueCount > 0 && (
              <div style={s.alertRow}>
                <span style={s.alertDot} />
                <span style={{ fontSize: '12px', color: '#555' }}>{kpis.overdueCount} invoice{kpis.overdueCount > 1 ? 's' : ''} past due date — review Unmatched Invoices report.</span>
              </div>
            )}
            {kpis.unmatchedPassthrough > 0 && (
              <div style={s.alertRow}>
                <span style={s.alertDot} />
                <span style={{ fontSize: '12px', color: '#555' }}>{kpis.unmatchedPassthrough} pass-through entr{kpis.unmatchedPassthrough === 1 ? 'y' : 'ies'} unpaired — review Cash Flow tab.</span>
              </div>
            )}
          </div>
        )}

        {/* Report categories */}
        {categories.map(cat => (
          <div key={cat} style={s.categorySection}>
            <div style={s.categoryHeader}>
              <span style={{ ...s.categoryBadge, color: categoryColors[cat].color, background: categoryColors[cat].bg }}>{cat}</span>
              <span style={s.categoryCount}>{reports.filter(r => r.category === cat).length} reports</span>
            </div>
            <div style={s.reportsGrid}>
              {reports.filter(r => r.category === cat).map(report => (
                <div key={report.id}
                  style={{ ...s.reportCard, ...(activeReport === report.id ? s.reportCardActive : {}) }}
                  onClick={() => setActiveReport(activeReport === report.id ? '' : report.id)}>
                  <div style={{ ...s.reportIcon, background: report.bg }}>
                    <span style={{ fontSize: '18px' }}>{report.icon}</span>
                  </div>
                  <div style={s.reportInfo}>
                    <div style={s.reportTitle}>{report.title}</div>
                    <div style={s.reportDesc}>{report.desc}</div>
                  </div>
                  <div style={s.reportActions}>
                    <button style={{ ...s.reportBtn, color: report.color, borderColor: report.color + '40', background: report.bg }}
                      onClick={e => { e.stopPropagation(); setPage(report.page as any) }}>
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
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
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '1.5rem' },
  kpiCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '1rem 1.25rem' },
  kpiLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' },
  kpiValue: { fontSize: '22px', fontWeight: '500', color: '#111' },
  kpiTrend: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '500', padding: '3px 8px', borderRadius: '20px' },
  alertBox: { background: '#FAEEDA', border: '0.5px solid #E5B96A', borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem' },
  alertRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  alertDot: { width: '6px', height: '6px', borderRadius: '50%', background: '#BA7517', flexShrink: 0 },
  categorySection: { marginBottom: '2rem' },
  categoryHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  categoryBadge: { fontSize: '11px', fontWeight: '500', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
  categoryCount: { fontSize: '12px', color: '#888' },
  reportsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' },
  reportCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' },
  reportCardActive: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  reportIcon: { width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reportInfo: { flex: 1 },
  reportTitle: { fontSize: '14px', fontWeight: '500', color: '#111', marginBottom: '3px' },
  reportDesc: { fontSize: '12px', color: '#888', lineHeight: 1.4 },
  reportActions: { display: 'flex', gap: '6px', flexShrink: 0 },
  reportBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', fontWeight: '500', padding: '5px 12px', borderRadius: '6px', border: '1px solid', cursor: 'pointer' },
}