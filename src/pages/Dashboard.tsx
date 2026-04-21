import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'
import { supabase } from '../supabase'

type Entity = 'constel' | 'sfbc' | 'constellation' | 'social'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [entity, setEntity] = useState<Entity>('constel')
  const [hoveredEntity, setHoveredEntity] = useState<Entity | null>(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [activeShortcut, setActiveShortcut] = useState('This month')

  // Real data
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    unpaidInvoices: 0,
    unpaidInvoicesCount: 0,
    overdueCount: 0,
    unmatchedPassthrough: 0,
    pendingTransactions: 0,
    openInvoicesCount: 0,
  })
  const [alerts, setAlerts] = useState<{ type: 'warn' | 'ok' | 'info'; text: string }[]>([])

  const pageMap: Record<string, string> = {
    'Dashboard': 'dashboard', 'Transactions': 'transactions',
    'P&L': 'pl', 'Cash Flow': 'cashflow', 'Reports': 'reports',
    'Partners': 'partners', 'Settings': 'settings',
  }

  const entities = [
    { id: 'constel' as Entity, name: 'Constel Group', sub: 'All companies · USD', badge: 'ALL', badgeColor: '#0B5E49', badgeBg: 'rgba(29,158,117,0.12)', iconColor: '#1D9E75', iconBg: 'rgba(29,158,117,0.10)', ringColor: 'rgba(29,158,117,0.5)' },
    { id: 'sfbc' as Entity, name: 'SFBC', sub: 'USD', badge: 'US', badgeColor: '#0C447C', badgeBg: 'rgba(24,95,165,0.10)', iconColor: '#185FA5', iconBg: 'rgba(24,95,165,0.08)', ringColor: 'rgba(24,95,165,0.45)' },
    { id: 'constellation' as Entity, name: 'Constellation LLC', sub: 'RSD/USD/EUR', badge: 'RS', badgeColor: '#633806', badgeBg: 'rgba(186,117,23,0.12)', iconColor: '#BA7517', iconBg: 'rgba(186,117,23,0.08)', ringColor: 'rgba(186,117,23,0.45)' },
    { id: 'social' as Entity, name: 'Social Growth', sub: 'USD/AED', badge: 'AE', badgeColor: '#72243E', badgeBg: 'rgba(212,83,126,0.12)', iconColor: '#D4537E', iconBg: 'rgba(212,83,126,0.08)', ringColor: 'rgba(212,83,126,0.45)' },
  ]

  const shortcuts = [
    { label: 'This month', from: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })(), to: new Date().toISOString().split('T')[0] },
    { label: 'This quarter', from: (() => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01` })(), to: new Date().toISOString().split('T')[0] },
    { label: 'YTD', from: `${new Date().getFullYear()}-01-01`, to: new Date().toISOString().split('T')[0] },
    { label: 'Last month', from: (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })(), to: (() => { const d = new Date(); d.setDate(0); return d.toISOString().split('T')[0] })() },
  ]

  const quickActions = [
    { label: 'New transaction', icon: '＋', page: 'transactions', accent: '#1D9E75' },
    { label: 'P&L report', icon: '↗', page: 'pl', accent: '#185FA5' },
    { label: 'Cash flow', icon: '⇄', page: 'cashflow', accent: '#185FA5' },
    { label: 'Partners', icon: '🤝', page: 'partners', accent: '#BA7517' },
    { label: 'Settings', icon: '⚙', page: 'settings', accent: '#888' },
  ]

  // Load companies
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('companies').select('id,name').order('name')
      if (data) setCompanies(data)
    }
    load()
  }, [])

  // Get company ID for selected entity
  const getCompanyId = useCallback(() => {
    if (entity === 'constel') return null
    const nameMap: Record<string, string> = {
      sfbc: 'SFBC',
      constellation: 'Constellation LLC',
      social: 'Social Growth LLC-FZ',
    }
    return companies.find(c => c.name === nameMap[entity])?.id || null
  }, [entity, companies])

  // Fetch real metrics
  const fetchMetrics = useCallback(async () => {
    setLoading(true)
    const companyId = getCompanyId()
    const today = new Date().toISOString().split('T')[0]

    try {
      // P&L entries for period
      let plQuery = supabase.from('v_pl_entries').select('tx_type,amount_usd')
        .gte('pl_date', dateFrom).lte('pl_date', dateTo)
      if (companyId) plQuery = plQuery.eq('company_id', companyId)
      const { data: plEntries } = await plQuery

      const revenue = (plEntries || [])
        .filter(e => e.tx_type === 'revenue' || e.tx_type === 'invoice_revenue')
        .reduce((s, e) => s + (e.amount_usd || 0), 0)
      const expenses = (plEntries || [])
        .filter(e => e.tx_type === 'expense' || e.tx_type === 'invoice_expense')
        .reduce((s, e) => s + (e.amount_usd || 0), 0)

      // Open invoices
      let invQuery = supabase.from('v_invoice_status').select('calculated_status,remaining_usd,due_date')
        .in('calculated_status', ['unpaid', 'partial'])
      if (companyId) invQuery = invQuery.eq('company_id', companyId)
      const { data: openInvoices } = await invQuery

      const unpaidTotal = (openInvoices || []).reduce((s, i) => s + (i.remaining_usd || 0), 0)
      const overdueCount = (openInvoices || []).filter(i => i.due_date && i.due_date < today).length

      // Unmatched passthrough
      let ptQuery = supabase.from('passthrough').select('id').eq('status', 'unpaired')
      if (companyId) ptQuery = ptQuery.eq('company_id', companyId)
      const { count: ptCount } = await ptQuery.select('id', { count: 'exact', head: true })

      // Build alerts
      const newAlerts: { type: 'warn' | 'ok' | 'info'; text: string }[] = []

      if (overdueCount > 0) {
        newAlerts.push({ type: 'warn', text: `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''} — payment past due date.` })
      }
      if ((openInvoices || []).length > 0) {
        newAlerts.push({ type: 'warn', text: `${(openInvoices || []).length} open invoice${(openInvoices || []).length > 1 ? 's' : ''} — $${unpaidTotal.toFixed(0)} remaining.` })
      }
      if ((ptCount || 0) > 0) {
        newAlerts.push({ type: 'warn', text: `${ptCount} pass-through entr${ptCount === 1 ? 'y' : 'ies'} waiting for pair.` })
      }
      if (newAlerts.length === 0) {
        newAlerts.push({ type: 'ok', text: 'All clear — no pending alerts for this period.' })
      }

      setMetrics({
        totalRevenue: revenue,
        totalExpenses: expenses,
        netProfit: revenue - expenses,
        unpaidInvoices: unpaidTotal,
        unpaidInvoicesCount: (openInvoices || []).length,
        overdueCount,
        unmatchedPassthrough: ptCount || 0,
        pendingTransactions: 0,
        openInvoicesCount: (openInvoices || []).length,
      })
      setAlerts(newAlerts)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    }
    setLoading(false)
  }, [dateFrom, dateTo, getCompanyId])

  useEffect(() => {
    if (companies.length > 0 || entity === 'constel') fetchMetrics()
  }, [fetchMetrics, companies, entity])

  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  const fmtN = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const username = user?.email?.split('@')[0] ?? 'admin'

  const metricCards = [
    {
      label: 'Revenue',
      value: loading ? '...' : fmt(metrics.totalRevenue),
      sub: `${dateFrom} – ${dateTo}`,
      accent: '#1D9E75', accentBg: 'rgba(29,158,117,0.07)', textColor: '#0B5E49',
    },
    {
      label: 'Expenses',
      value: loading ? '...' : fmt(metrics.totalExpenses),
      sub: `${dateFrom} – ${dateTo}`,
      accent: '#A32D2D', accentBg: 'rgba(163,45,45,0.07)', textColor: '#A32D2D',
    },
    {
      label: 'Net Profit / Loss',
      value: loading ? '...' : fmtN(metrics.netProfit),
      sub: metrics.netProfit >= 0 ? 'Profitable period' : 'Loss period',
      accent: metrics.netProfit >= 0 ? '#1D9E75' : '#A32D2D',
      accentBg: metrics.netProfit >= 0 ? 'rgba(29,158,117,0.07)' : 'rgba(163,45,45,0.07)',
      textColor: metrics.netProfit >= 0 ? '#0B5E49' : '#A32D2D',
    },
    {
      label: 'Open Invoices',
      value: loading ? '...' : metrics.openInvoicesCount > 0 ? `${metrics.openInvoicesCount} · ${fmt(metrics.unpaidInvoices)}` : 'None',
      sub: metrics.overdueCount > 0 ? `${metrics.overdueCount} overdue` : 'All on time',
      accent: metrics.overdueCount > 0 ? '#BA7517' : '#1D9E75',
      accentBg: metrics.overdueCount > 0 ? 'rgba(186,117,23,0.07)' : 'rgba(29,158,117,0.07)',
      textColor: metrics.overdueCount > 0 ? '#5C3205' : '#0B5E49',
    },
  ]

  return (
    <div style={s.root}>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.navLogo}>
          <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
            <polygon points="18,2 34,30 2,30" fill="none" stroke="#1D9E75" strokeWidth="2" />
            <circle cx="18" cy="2" r="2.5" fill="#1D9E75" />
            <circle cx="34" cy="30" r="2" fill="#5DCAA5" />
            <circle cx="2" cy="30" r="2" fill="#9FE1CB" />
          </svg>
          <span style={s.navLogoText}>Mint<span style={{ color: '#5DCAA5' }}>flow</span></span>
        </div>
        <div style={s.navLinks}>
          {['Dashboard', 'Transactions', 'P&L', 'Cash Flow', 'Reports', 'Partners', 'Settings'].map(l => (
            <span key={l} style={l === 'Dashboard' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l] as any)}>{l}</span>
          ))}
        </div>
        <div style={s.navRight}>
          <div style={s.navAvatar}>{user?.email?.substring(0, 2).toUpperCase()}</div>
          <div>
            <div style={s.navEmail}>{user?.email}</div>
            <div style={s.navRole}>Administrator</div>
          </div>
          <button style={s.navSignout} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div style={s.body}>
        {/* Greeting */}
        <div style={s.greeting}>
          <div style={s.greetingDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
          </div>
          <h1 style={s.greetingTitle}>
            {greeting},{' '}
            <span style={{ color: '#1D9E75', fontStyle: 'italic' }}>{username}</span>
          </h1>
          <p style={s.greetingSub}>Select an entity and period to review financial performance.</p>
        </div>

        {/* Entity selector */}
        <div style={s.sectionLabel}>Select entity</div>
        <div style={s.entityGrid}>
          {entities.map(e => {
            const isActive = entity === e.id
            const isHovered = hoveredEntity === e.id
            return (
              <div key={e.id}
                style={{ ...s.entityCard, background: isActive ? e.iconBg : '#fff', boxShadow: isActive ? `0 0 0 2px ${e.ringColor}, 0 8px 24px rgba(0,0,0,0.10)` : isHovered ? '0 6px 20px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}
                onClick={() => setEntity(e.id)}
                onMouseEnter={() => setHoveredEntity(e.id)}
                onMouseLeave={() => setHoveredEntity(null)}>
                <div style={{ ...s.entityBadge, color: e.badgeColor, background: e.badgeBg }}>{e.badge}</div>
                <div style={{ ...s.entityIcon, background: isActive ? `${e.iconColor}22` : e.iconBg }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={e.iconColor} strokeWidth="1.5">
                    <rect x="2" y="4" width="14" height="10" rx="2" /><path d="M6 4v10M2 8h14" />
                  </svg>
                </div>
                <div style={{ ...s.entityName, color: isActive ? '#0a2a22' : '#0D1B2A' }}>{e.name}</div>
                <div style={{ ...s.entitySub, color: isActive ? e.iconColor : '#999' }}>{e.sub}</div>
              </div>
            )
          })}
        </div>

        {/* Period bar */}
        <div style={s.periodBar}>
          <div style={s.periodGroup}>
            <span style={s.periodLabel}>From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={s.dateInput} />
          </div>
          <span style={s.periodArrow}>→</span>
          <div style={s.periodGroup}>
            <span style={s.periodLabel}>To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={s.dateInput} />
          </div>
          <div style={s.segmented}>
            {shortcuts.map(sc => (
              <button key={sc.label}
                style={activeShortcut === sc.label ? { ...s.shortcutBtn, ...s.shortcutActive } : s.shortcutBtn}
                onClick={() => { setDateFrom(sc.from); setDateTo(sc.to); setActiveShortcut(sc.label) }}>
                {sc.label}
              </button>
            ))}
          </div>
          <div style={s.periodDisplay}>
            {new Date(dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' – '}
            {new Date(dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Main content */}
        <div style={s.contentGrid}>
          <div>
            {/* Metric cards */}
            <div style={s.metricsGrid}>
              {metricCards.map(m => (
                <div key={m.label} style={{ ...s.metricCard, borderLeft: `3px solid ${m.accent}`, background: m.accentBg }}>
                  <div style={s.metricLabel}>{m.label}</div>
                  <div style={{ ...s.metricValue, color: m.textColor }}>{m.value}</div>
                  <div style={s.metricSub}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Alerts */}
            <div style={s.alertCard}>
              <div style={s.alertHeader}>
                <span style={s.alertTitle}>Alerts & notifications</span>
                <span style={s.alertCount}>{loading ? '...' : `${alerts.length} active`}</span>
              </div>
              {loading ? (
                <div style={{ padding: '12px', fontSize: '12px', color: '#aaa' }}>Loading alerts...</div>
              ) : alerts.map((a, i) => (
                <div key={i} style={{ ...s.alertItem, background: a.type === 'ok' ? 'rgba(29,158,117,0.05)' : a.type === 'warn' ? 'rgba(186,117,23,0.05)' : 'rgba(24,95,165,0.05)' }}>
                  <div style={{ ...s.alertDot, background: a.type === 'ok' ? '#1D9E75' : a.type === 'warn' ? '#BA7517' : '#185FA5', boxShadow: `0 0 0 4px ${a.type === 'ok' ? 'rgba(29,158,117,0.15)' : a.type === 'warn' ? 'rgba(186,117,23,0.15)' : 'rgba(24,95,165,0.15)'}` }} />
                  <span style={s.alertText}>{a.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div style={s.quickCard}>
            <div style={s.quickTitle}>Quick actions</div>
            {quickActions.map(action => (
              <button key={action.label} style={s.quickBtn} onClick={() => setPage(action.page as any)}>
                <span style={{ ...s.quickIcon, color: action.accent }}>{action.icon}</span>
                {action.label}
              </button>
            ))}

            {/* Mini stats */}
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '0.5px solid #f0f0ee' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '10px' }}>At a glance</div>
              {[
                { label: 'Pass-through unpaired', value: loading ? '...' : String(metrics.unmatchedPassthrough), warn: metrics.unmatchedPassthrough > 0 },
                { label: 'Overdue invoices', value: loading ? '...' : String(metrics.overdueCount), warn: metrics.overdueCount > 0 },
                { label: 'Open invoices', value: loading ? '...' : String(metrics.openInvoicesCount), warn: false },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid #f5f5f3' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>{item.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: '500', color: item.warn ? '#BA7517' : '#0B5E49' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#F7F6F3', fontFamily: "'DM Sans', system-ui, sans-serif" },
  nav: { background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: '56px', borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'sticky', top: 0, zIndex: 100 },
  navLogo: { display: 'flex', alignItems: 'center', gap: '9px' },
  navLogoText: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '19px', fontWeight: '400', color: '#fff', letterSpacing: '-0.01em' },
  navLinks: { display: 'flex', gap: '2px' },
  navLink: { fontSize: '13px', color: 'rgba(255,255,255,0.48)', padding: '6px 13px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' as const },
  navLinkActive: { fontSize: '13px', color: '#fff', fontWeight: '500', padding: '6px 13px', borderRadius: '6px', background: 'rgba(255,255,255,0.10)', cursor: 'pointer', userSelect: 'none' as const },
  navRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  navAvatar: { width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg,#1D9E75,#0B5E49)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: '#fff', flexShrink: 0 },
  navEmail: { fontSize: '12px', color: 'rgba(255,255,255,0.60)', lineHeight: '1.3' },
  navRole: { fontSize: '10px', color: '#5DCAA5', letterSpacing: '0.06em', fontWeight: '600' },
  navSignout: { background: 'transparent', border: '1px solid rgba(255,255,255,0.13)', color: 'rgba(255,255,255,0.45)', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '12px', padding: '5px 13px', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  body: { padding: '2.5rem 2rem', maxWidth: '1400px', margin: '0 auto' },
  greeting: { marginBottom: '2.5rem' },
  greetingDate: { fontSize: '10.5px', color: '#aaa', letterSpacing: '0.14em', marginBottom: '6px', fontWeight: '500' },
  greetingTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '34px', fontWeight: '400', color: '#0D1B2A', margin: '0 0 8px', lineHeight: '1.15' },
  greetingSub: { fontSize: '14px', color: '#aaa', margin: 0, fontWeight: '400' },
  sectionLabel: { fontSize: '11px', fontWeight: '600', color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.14em', marginBottom: '12px' },
  entityGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '1.5rem' },
  entityCard: { borderRadius: '14px', padding: '1.4rem', cursor: 'pointer', position: 'relative' as const },
  entityBadge: { position: 'absolute' as const, top: '12px', right: '12px', fontSize: '9px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  entityIcon: { width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' },
  entityName: { fontSize: '14px', fontWeight: '500', marginBottom: '4px', letterSpacing: '-0.01em' },
  entitySub: { fontSize: '11.5px', fontWeight: '400' },
  periodBar: { background: '#fff', borderRadius: '12px', padding: '0.85rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' as const, boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)' },
  periodGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  periodLabel: { fontSize: '11px', fontWeight: '600', color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.1em', whiteSpace: 'nowrap' as const },
  dateInput: { fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '13px', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '7px', padding: '6px 10px', color: '#0D1B2A', background: '#FAFAF9' },
  periodArrow: { fontSize: '14px', color: '#ddd' },
  segmented: { display: 'flex', gap: '3px', background: '#F1F0ED', borderRadius: '8px', padding: '3px' },
  shortcutBtn: { fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '12px', border: 'none', borderRadius: '6px', padding: '5px 12px', background: 'transparent', color: '#999', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontWeight: '500' },
  shortcutActive: { background: '#fff', color: '#0F6E56', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' },
  periodDisplay: { fontSize: '12px', color: '#0F6E56', fontWeight: '600', background: 'rgba(29,158,117,0.09)', padding: '5px 12px', borderRadius: '7px', marginLeft: 'auto', whiteSpace: 'nowrap' as const, letterSpacing: '-0.01em' },
  contentGrid: { display: 'grid', gridTemplateColumns: '1fr 280px', gap: '14px' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px', marginBottom: '14px' },
  metricCard: { borderRadius: '12px', padding: '1.1rem 1.1rem 1.1rem 1.3rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  metricLabel: { fontSize: '11px', color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px', fontWeight: '600' },
  metricValue: { fontSize: '26px', fontWeight: '400', lineHeight: '1', marginBottom: '5px', fontFamily: "'DM Serif Display', Georgia, serif" },
  metricSub: { fontSize: '11px', color: '#bbb', marginTop: '2px' },
  alertCard: { background: '#fff', borderRadius: '12px', padding: '1.1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)' },
  alertHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' },
  alertTitle: { fontSize: '13px', fontWeight: '600', color: '#0D1B2A', letterSpacing: '-0.01em' },
  alertCount: { fontSize: '11px', background: '#F1F0ED', color: '#999', padding: '2px 9px', borderRadius: '20px', fontWeight: '500' },
  alertItem: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 10px', borderRadius: '8px', marginBottom: '4px' },
  alertDot: { width: '7px', height: '7px', borderRadius: '50%', marginTop: '5px', flexShrink: 0 },
  alertText: { fontSize: '12.5px', color: '#555', lineHeight: '1.55', fontWeight: '400' },
  quickCard: { background: '#fff', borderRadius: '12px', padding: '1.1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)', alignSelf: 'start' as const },
  quickTitle: { fontSize: '13px', fontWeight: '600', color: '#0D1B2A', marginBottom: '12px', letterSpacing: '-0.01em' },
  quickBtn: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', background: '#FAFAF8', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '9px', padding: '10px 12px', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '13px', color: '#333', cursor: 'pointer', marginBottom: '6px', textAlign: 'left' as const, fontWeight: '400' },
  quickIcon: { fontSize: '14px', width: '20px', textAlign: 'center' as const, flexShrink: 0 },
}