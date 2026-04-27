import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'
import { NavContext } from '../App'
import type { Page } from '../App'
import { fmtUSD, fmtUSDSigned } from '../utils/formatters'
import MetricCard from '../components/MetricCard'

type Entity = 'constel' | 'sfbc' | 'constellation' | 'social'

// ── Area Chart ───────────────────────────────────────────
function AreaChart({ months, revenues, expenses }: { months: string[]; revenues: number[]; expenses: number[] }) {
  const [hovered, setHovered] = React.useState<number | null>(null)
  const W = 560
  const H = 140
  const padL = 42
  const padR = 16
  const padT = 10
  const padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const max = Math.max(...revenues, ...expenses, 0.01)
  const n = months.length

  const xPos = (i: number) => padL + (i / Math.max(n - 1, 1)) * chartW
  const yPos = (v: number) => padT + (1 - v / max) * chartH

  const revPts = revenues.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ')
  const expPts = expenses.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ')

  const revArea = `M ${xPos(0)},${yPos(0)} L ${revPts} L ${xPos(n - 1)},${padT + chartH} L ${xPos(0)},${padT + chartH} Z`
  const expArea = `M ${xPos(0)},${yPos(0)} L ${expPts} L ${xPos(n - 1)},${padT + chartH} L ${xPos(0)},${padT + chartH} Z`

  // Y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: max * f, y: padT + (1 - f) * chartH }))

  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D9E75" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1D9E75" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E24B4A" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#E24B4A" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#E8E7E2" strokeWidth="1" />
            <text x={padL - 6} y={t.y + 4} textAnchor="end" fontSize="9" fill="#ccc" fontFamily="system-ui">{fmt(t.v)}</text>
          </g>
        ))}

        {/* Area fills */}
        <path d={expArea} fill="url(#expGrad)" />
        <path d={revArea} fill="url(#revGrad)" />

        {/* Lines */}
        <polyline points={expPts} fill="none" stroke="#E24B4A" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
        <polyline points={revPts} fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Month labels */}
        {months.map((m, i) => (
          <text key={m} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="9" fill={hovered === i ? '#555' : '#bbb'} fontFamily="system-ui" fontWeight={hovered === i ? '600' : '400'}>{m}</text>
        ))}

        {/* Hover zones + dots */}
        {months.map((m, i) => (
          <g key={`h${i}`}>
            {hovered === i && (
              <>
                <line x1={xPos(i)} y1={padT} x2={xPos(i)} y2={padT + chartH} stroke="#e5e5e5" strokeWidth="1" strokeDasharray="3,2" />
                <circle cx={xPos(i)} cy={yPos(revenues[i])} r="4" fill="#1D9E75" stroke="#fff" strokeWidth="2" />
                <circle cx={xPos(i)} cy={yPos(expenses[i])} r="4" fill="#E24B4A" stroke="#fff" strokeWidth="2" />
                {/* Tooltip */}
                <rect x={Math.min(xPos(i) - 45, W - padR - 95)} y={padT + 4} width="90" height="42" rx="6" fill="#0D1B2A" opacity="0.88" />
                <text x={Math.min(xPos(i), W - padR - 50)} y={padT + 17} textAnchor="middle" fontSize="9.5" fill="#5DCAA5" fontFamily="system-ui" fontWeight="600">{m}</text>
                <text x={Math.min(xPos(i), W - padR - 50)} y={padT + 29} textAnchor="middle" fontSize="8.5" fill="#9FE1CB" fontFamily="system-ui">Rev: {fmt(revenues[i])}</text>
                <text x={Math.min(xPos(i), W - padR - 50)} y={padT + 40} textAnchor="middle" fontSize="8.5" fill="#F5A9A9" fontFamily="system-ui">Exp: {fmt(expenses[i])}</text>
              </>
            )}
            <rect
              x={xPos(i) - (i === 0 ? 0 : chartW / (n - 1) / 2)}
              y={padT}
              width={chartW / Math.max(n - 1, 1)}
              height={chartH}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          </g>
        ))}

        {/* Dots at ends */}
        {n > 0 && (
          <>
            <circle cx={xPos(n - 1)} cy={yPos(revenues[n - 1])} r="3" fill="#1D9E75" stroke="#fff" strokeWidth="1.5" />
            <circle cx={xPos(n - 1)} cy={yPos(expenses[n - 1])} r="3" fill="#E24B4A" stroke="#fff" strokeWidth="1.5" />
          </>
        )}
      </svg>
    </div>
  )
}

// ── Donut Chart ───────────────────────────────────────────
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (!total) return <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#f0f0ee' }} />
  const r = 45
  const cx = 60
  const cy = 60
  let angle = -90

  const arcs = segments.map(seg => {
    const pct = seg.value / total
    const sweep = pct * 360
    const startRad = (angle * Math.PI) / 180
    const endRad = ((angle + sweep) * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = sweep > 180 ? 1 : 0
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
    angle += sweep
    return { ...seg, d, pct }
  })

  return (
    <svg width={120} height={120} viewBox="0 0 120 120">
      {arcs.map((arc, i) => (
        <path key={i} d={arc.d} fill={arc.color} fillOpacity="0.9" stroke="#fff" strokeWidth="1.5" />
      ))}
      <circle cx={cx} cy={cy} r={28} fill="#fff" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="10" fill="#888" fontFamily="system-ui">EXPENSES</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="#aaa" fontFamily="system-ui">breakdown</text>
    </svg>
  )
}

// ── Horizontal Bar ────────────────────────────────────────
function HBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: '#444', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '60%' }}>{label}</span>
        <span style={{ fontSize: '12px', color: '#888', whiteSpace: 'nowrap' as const }}>{fmtUSD(value)}{sub ? ` · ${sub}` : ''}</span>
      </div>
      <div style={{ height: '5px', background: '#f0f0ee', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [entity, setEntity] = useState<Entity>('constel')
  const [dateFrom, setDateFrom] = useState(() => `${new Date().getFullYear()}-01-01`)
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [activeShortcut, setActiveShortcut] = useState('YTD')
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [metrics, setMetrics] = useState({
    totalRevenue: 0, totalExpenses: 0, netProfit: 0,
    unpaidInvoices: 0, openInvoicesCount: 0,
    overdueCount: 0, unmatchedPassthrough: 0,
    prevRevenue: 0, prevExpenses: 0,
  })
  const [monthlyData, setMonthlyData] = useState<{ month: string; revenue: number; expenses: number }[]>([])
  const [expenseByCategory, setExpenseByCategory] = useState<{ label: string; value: number; color: string }[]>([])
  const [topPartners, setTopPartners] = useState<{ name: string; amount: number; type: string }[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [alerts, setAlerts] = useState<{ type: 'warn' | 'ok' | 'info'; text: string }[]>([])

  const entities = [
    { id: 'constel' as Entity, name: 'Constel Group', sub: 'All entities', badge: 'ALL', color: '#1D9E75', bg: 'rgba(29,158,117,0.08)' },
    { id: 'sfbc' as Entity, name: 'SFBC', sub: 'USD', badge: 'US', color: '#185FA5', bg: 'rgba(24,95,165,0.08)' },
    { id: 'constellation' as Entity, name: 'Constellation LLC', sub: 'RSD/EUR', badge: 'RS', color: '#BA7517', bg: 'rgba(186,117,23,0.08)' },
    { id: 'social' as Entity, name: 'Social Growth', sub: 'USD/AED', badge: 'AE', color: '#D4537E', bg: 'rgba(212,83,126,0.08)' },
  ]

  const shortcuts = [
    { label: 'This month', from: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })(), to: new Date().toISOString().split('T')[0] },
    { label: 'This quarter', from: (() => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01` })(), to: new Date().toISOString().split('T')[0] },
    { label: 'YTD', from: `${new Date().getFullYear()}-01-01`, to: new Date().toISOString().split('T')[0] },
    { label: 'Last month', from: (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })(), to: (() => { const d = new Date(); d.setDate(0); return d.toISOString().split('T')[0] })() },
  ]

  const CATEGORY_COLORS = ['#1D9E75', '#185FA5', '#BA7517', '#D4537E', '#7C3AED', '#0891B2', '#DC2626', '#059669']

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('companies').select('id,name').order('name')
      if (data) setCompanies(data)
    }
    load()
  }, [])

  const getCompanyId = useCallback(() => {
    if (entity === 'constel') return null
    const nameMap: Record<string, string> = {
      sfbc: 'SFBC',
      constellation: 'Constellation LLC',
      social: 'Social Growth LLC-FZ',
    }
    return companies.find(c => c.name === nameMap[entity])?.id || null
  }, [entity, companies])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const companyId = getCompanyId()
    const today = new Date().toISOString().split('T')[0]

    try {
      // ── P&L entries for period ──
      let plQ = supabase.from('v_pl_entries').select('tx_type,amount_usd,pl_date,pl_category,partner_id')
        .gte('pl_date', dateFrom).lte('pl_date', dateTo)
      if (companyId) plQ = plQ.eq('company_id', companyId)
      const { data: plEntries } = await plQ

      const revenue = (plEntries || []).filter(e => e.tx_type === 'revenue' || e.tx_type === 'invoice_revenue').reduce((s, e) => s + (e.amount_usd || 0), 0)
      const expenses = (plEntries || []).filter(e => e.tx_type === 'expense' || e.tx_type === 'invoice_expense').reduce((s, e) => s + (e.amount_usd || 0), 0)

      // ── Monthly breakdown ──
      const monthMap: Record<string, { revenue: number; expenses: number }> = {}
      const start = new Date(dateFrom)
      const end = new Date(dateTo)
      for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthMap[key] = { revenue: 0, expenses: 0 }
      }
      ;(plEntries || []).forEach(e => {
        const key = (e.pl_date || '').slice(0, 7)
        if (!monthMap[key]) monthMap[key] = { revenue: 0, expenses: 0 }
        if (e.tx_type === 'revenue' || e.tx_type === 'invoice_revenue') monthMap[key].revenue += e.amount_usd || 0
        if (e.tx_type === 'expense' || e.tx_type === 'invoice_expense') monthMap[key].expenses += e.amount_usd || 0
      })
      const monthly = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({
        month: new Date(key + '-01').toLocaleString('en', { month: 'short' }),
        ...v,
      }))
      setMonthlyData(monthly)

      // ── Expense by category ──
      const catMap: Record<string, number> = {}
      ;(plEntries || []).filter(e => e.tx_type === 'expense' || e.tx_type === 'invoice_expense').forEach(e => {
        const cat = e.pl_category || 'Other'
        catMap[cat] = (catMap[cat] || 0) + (e.amount_usd || 0)
      })
      const cats = Object.entries(catMap).sort(([, a], [, b]) => b - a).slice(0, 6).map(([label, value], i) => ({
        label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]
      }))
      setExpenseByCategory(cats)

      // ── Open invoices ──
      let invQ = supabase.from('v_invoice_status').select('calculated_status,remaining_usd,due_date,partner_name,amount_usd').in('calculated_status', ['unpaid', 'partial'])
      if (companyId) invQ = invQ.eq('company_id', companyId)
      const { data: openInv } = await invQ
      const unpaidTotal = (openInv || []).reduce((s, i) => s + (i.remaining_usd || 0), 0)
      const overdueCount = (openInv || []).filter(i => i.due_date && i.due_date < today).length

      // ── Pass-through unmatched ──
      let ptQ = supabase.from('passthrough').select('id').eq('status', 'unpaired')
      if (companyId) ptQ = ptQ.eq('company_id', companyId)
      const { data: ptData } = await ptQ

      // ── Top partners by transaction volume ──
      let txQ = supabase.from('transactions')
        .select('amount_usd, partners!transactions_partner_id_fkey(name,type)')
        .gte('transaction_date', dateFrom).lte('transaction_date', dateTo)
        .not('partner_id', 'is', null)
      if (companyId) txQ = txQ.eq('company_id', companyId)
      const { data: txData } = await txQ
      const partnerMap: Record<string, { amount: number; type: string }> = {}
      ;(txData || []).forEach((t: any) => {
        const name = t.partners?.name || 'Unknown'
        const type = t.partners?.type || 'vendor'
        if (!partnerMap[name]) partnerMap[name] = { amount: 0, type }
        partnerMap[name].amount += t.amount_usd || 0
      })
      const topP = Object.entries(partnerMap).sort(([, a], [, b]) => b.amount - a.amount).slice(0, 5).map(([name, v]) => ({ name, ...v }))
      setTopPartners(topP)

      // ── Recent activity ──
      let actQ = supabase.from('transactions')
        .select('transaction_date,type,amount,currency,amount_usd,partners!transactions_partner_id_fkey(name),companies!transactions_company_id_fkey(name)')
        .order('transaction_date', { ascending: false }).limit(5)
      if (companyId) actQ = actQ.eq('company_id', companyId)
      const { data: actData } = await actQ
      setRecentActivity(actData || [])

      // ── Alerts ──
      const newAlerts: { type: 'warn' | 'ok' | 'info'; text: string }[] = []
      if (overdueCount > 0) newAlerts.push({ type: 'warn', text: `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''}` })
      if ((openInv || []).length > 0) newAlerts.push({ type: 'info', text: `${(openInv || []).length} open invoices · ${fmtUSD(unpaidTotal)} remaining` })
      if ((ptData || []).length > 0) newAlerts.push({ type: 'warn', text: `${(ptData || []).length} unpaired pass-through entries` })
      if (newAlerts.length === 0) newAlerts.push({ type: 'ok', text: 'All clear — no pending alerts' })

      setMetrics({
        totalRevenue: revenue, totalExpenses: expenses, netProfit: revenue - expenses,
        unpaidInvoices: unpaidTotal, openInvoicesCount: (openInv || []).length,
        overdueCount, unmatchedPassthrough: (ptData || []).length,
        prevRevenue: 0, prevExpenses: 0,
      })
      setAlerts(newAlerts)
    } catch (err) { console.error('Dashboard error:', err) }
    setLoading(false)
  }, [dateFrom, dateTo, getCompanyId]) // eslint-disable-line

  useEffect(() => {
    if (companies.length > 0 || entity === 'constel') fetchAll()
  }, [fetchAll, companies, entity])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const username = user?.email?.split('@')[0] ?? 'admin'
  const margin = metrics.totalRevenue > 0 ? (metrics.netProfit / metrics.totalRevenue * 100) : 0
  const activeEntity = entities.find(e => e.id === entity)!

  const sparkRevenue = monthlyData.map(m => m.revenue)
  const sparkExpenses = monthlyData.map(m => m.expenses)
  const maxPartner = topPartners[0]?.amount || 1

  return (
    <div style={s.root}>
      <div style={s.body}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <div style={s.greetingDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</div>
            <h1 style={s.greetingTitle}>{greeting}, <span style={{ color: '#1D9E75', fontStyle: 'italic' }}>{username}</span></h1>
          </div>
          {/* Period bar inline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
            <div style={s.segmented}>
              {shortcuts.map(sc => (
                <button key={sc.label}
                  style={activeShortcut === sc.label ? { ...s.shortcutBtn, ...s.shortcutActive } : s.shortcutBtn}
                  onClick={() => { setDateFrom(sc.from); setDateTo(sc.to); setActiveShortcut(sc.label) }}>
                  {sc.label}
                </button>
              ))}
            </div>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActiveShortcut('') }} style={s.dateInput} />
            <span style={{ color: '#ccc', fontSize: '12px' }}>→</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActiveShortcut('') }} style={s.dateInput} />
          </div>
        </div>

        {/* ENTITY SELECTOR */}
        <div style={s.entityRow}>
          {entities.map(e => {
            const active = entity === e.id
            return (
              <div key={e.id} style={{ ...s.entityChip, ...(active ? { ...s.entityChipActive, borderColor: e.color, background: e.bg } : {}) }}
                onClick={() => setEntity(e.id)}>
                <div style={{ ...s.entityDot, background: active ? e.color : '#ddd' }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: active ? '600' : '400', color: active ? '#111' : '#666' }}>{e.name}</div>
                  <div style={{ fontSize: '10px', color: active ? e.color : '#bbb', fontWeight: '500' }}>{e.sub}</div>
                </div>
                <div style={{ ...s.entityBadgePill, background: active ? e.color : '#f0f0ee', color: active ? '#fff' : '#aaa' }}>{e.badge}</div>
              </div>
            )
          })}
        </div>

        {/* TOP METRIC CARDS */}
        <div style={s.metricsRow}>
          <MetricCard
            label="Total Revenue"
            value={loading ? '—' : fmtUSD(metrics.totalRevenue)}
            sub={`YTD ${activeEntity.name}`}
            color="#1D9E75"
            darkColor="#0B5E49"
            sparklineData={sparkRevenue}
          />
          <MetricCard
            label="Total Expenses"
            value={loading ? '—' : fmtUSD(metrics.totalExpenses)}
            sub={metrics.totalRevenue > 0 ? `${((metrics.totalExpenses / metrics.totalRevenue) * 100).toFixed(0)}% of revenue` : 'No revenue'}
            color="#E24B4A"
            darkColor="#A32D2D"
            sparklineData={sparkExpenses}
          />
          <MetricCard
            label="Net Profit / Loss"
            value={loading ? '—' : fmtUSDSigned(metrics.netProfit)}
            sub={`${margin.toFixed(1)}% margin`}
            color={metrics.netProfit >= 0 ? '#1D9E75' : '#E24B4A'}
            darkColor={metrics.netProfit >= 0 ? '#0B5E49' : '#A32D2D'}
            sparklineData={monthlyData.map(m => m.revenue - m.expenses)}
          />
          <MetricCard
            label="Open Invoices"
            value={loading ? '—' : metrics.openInvoicesCount > 0 ? fmtUSD(metrics.unpaidInvoices) : '$0'}
            sub={`${metrics.openInvoicesCount} open${metrics.overdueCount > 0 ? ` · ${metrics.overdueCount} overdue` : ''}`}
            color={metrics.overdueCount > 0 ? '#BA7517' : '#1D9E75'}
            darkColor={metrics.overdueCount > 0 ? '#633806' : '#0B5E49'}
            sparklineData={[]}
          />
        </div>

        {/* MAIN GRID */}
        <div style={s.mainGrid}>

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '14px' }}>

            {/* Revenue vs Expenses Bar Chart */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Revenue vs Expenses</div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#1D9E75', opacity: 0.85 }} />
                    <span style={{ fontSize: '11px', color: '#888' }}>Revenue</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#E24B4A', opacity: 0.7 }} />
                    <span style={{ fontSize: '11px', color: '#888' }}>Expenses</span>
                  </div>
                </div>
              </div>
              {loading ? (
                <div style={s.loadingBox}>Loading chart data...</div>
              ) : monthlyData.length === 0 ? (
                <div style={s.emptyBox}>No data for selected period</div>
              ) : (
                <div style={{ padding: '0 4px' }}>
                  <AreaChart
                    months={monthlyData.map(m => m.month)}
                    revenues={monthlyData.map(m => m.revenue)}
                    expenses={monthlyData.map(m => m.expenses)}
                  />
                </div>
              )}
            </div>

            {/* Expense Breakdown + Top Partners side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

              {/* Expense by Category */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>Expense breakdown</div>
                </div>
                {loading ? <div style={s.loadingBox}>Loading...</div> : expenseByCategory.length === 0 ? (
                  <div style={s.emptyBox}>No expenses</div>
                ) : (
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                    <DonutChart segments={expenseByCategory} />
                    <div style={{ flex: 1, paddingTop: '8px' }}>
                      {expenseByCategory.map(cat => (
                        <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: cat.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '11px', color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{cat.label}</span>
                          <span style={{ fontSize: '11px', fontWeight: '500', color: '#333', whiteSpace: 'nowrap' as const }}>{fmtUSD(cat.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Top Partners */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>Top partners</div>
                  <span style={{ fontSize: '10px', color: '#bbb' }}>by volume</span>
                </div>
                {loading ? <div style={s.loadingBox}>Loading...</div> : topPartners.length === 0 ? (
                  <div style={s.emptyBox}>No partner data</div>
                ) : (
                  <div>
                    {topPartners.map((p, i) => (
                      <HBar
                        key={p.name}
                        label={p.name}
                        value={p.amount}
                        max={maxPartner}
                        color={i === 0 ? '#0C447C' : i === 1 ? '#185FA5' : i === 2 ? '#4A90D9' : '#7FB8EE'}
                        sub={p.type}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent activity */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Recent transactions</div>
                <button style={s.cardLink} onClick={() => setPage('transactions')}>View all →</button>
              </div>
              {loading ? <div style={s.loadingBox}>Loading...</div> : recentActivity.length === 0 ? (
                <div style={s.emptyBox}>No transactions yet</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['Date', 'Partner', 'Type', 'Amount', 'USD'].map(h => (
                        <th key={h} style={{ textAlign: 'left' as const, padding: '0 0 8px', fontSize: '9.5px', color: '#AAAAAA', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.map((t, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #E8E7E2' }}>
                        <td style={{ padding: '8px 0', color: '#555', whiteSpace: 'nowrap' as const }}>{t.transaction_date}</td>
                        <td style={{ padding: '8px 8px 8px 0', fontWeight: '500', color: '#111', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{(t.partners as any)?.name || '—'}</td>
                        <td style={{ padding: '8px 8px 8px 0' }}>
                          <span style={{ fontSize: '10px', fontWeight: '500', padding: '2px 7px', borderRadius: '20px', background: t.type === 'direct' ? '#E1F5EE' : '#E6F1FB', color: t.type === 'direct' ? '#085041' : '#0C447C' }}>
                            {t.type === 'invoice_payment' ? 'Inv. pay' : t.type}
                          </span>
                        </td>
                        <td style={{ padding: '8px 8px 8px 0', fontWeight: '500', color: '#111', whiteSpace: 'nowrap' as const }}>{(t.amount || 0).toLocaleString()} {t.currency}</td>
                        <td style={{ padding: '8px 0', fontWeight: '500', color: '#1D9E75', whiteSpace: 'nowrap' as const }}>{fmtUSD(t.amount_usd || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '14px' }}>

            {/* Alerts */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Alerts</div>
                <span style={{ fontSize: '10px', background: alerts.some(a => a.type === 'warn') ? '#FCEBEB' : '#E1F5EE', color: alerts.some(a => a.type === 'warn') ? '#A32D2D' : '#085041', padding: '2px 8px', borderRadius: '20px', fontWeight: '500' }}>
                  {alerts.length}
                </span>
              </div>
              {loading ? <div style={s.loadingBox}>Loading...</div> : alerts.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', borderRadius: '8px', marginBottom: '5px', background: a.type === 'ok' ? '#E1F5EE' : a.type === 'warn' ? 'rgba(186,117,23,0.10)' : '#E6F1FB' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', marginTop: '5px', flexShrink: 0, background: a.type === 'ok' ? '#1D9E75' : a.type === 'warn' ? '#BA7517' : '#185FA5' }} />
                  <span style={{ fontSize: '11px', color: '#111', lineHeight: '1.5' }}>{a.text}</span>
                </div>
              ))}
            </div>

            {/* At a glance */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>At a glance</div>
              </div>
              {[
                { label: 'Net margin', value: `${margin.toFixed(1)}%`, color: margin >= 0 ? '#0B5E49' : '#A32D2D' },
                { label: 'Pass-through unpaired', value: String(metrics.unmatchedPassthrough), color: metrics.unmatchedPassthrough > 0 ? '#BA7517' : '#0B5E49' },
                { label: 'Overdue invoices', value: String(metrics.overdueCount), color: metrics.overdueCount > 0 ? '#A32D2D' : '#0B5E49' },
                { label: 'Open invoices', value: String(metrics.openInvoicesCount), color: '#555' },
                { label: 'Expense categories', value: String(expenseByCategory.length), color: '#555' },
                { label: 'Active partners', value: String(topPartners.length), color: '#555' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #E8E7E2' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>{item.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: loading ? '#ccc' : item.color }}>{loading ? '...' : item.value}</span>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Quick actions</div>
              </div>
              {[
                { label: 'New invoice', icon: '📄', page: 'transactions' as Page, color: '#1D9E75' },
                { label: 'New transaction', icon: '💳', page: 'transactions' as Page, color: '#0C447C' },
                { label: 'Bulk import', icon: '📥', page: 'transactions' as Page, color: '#633806' },
                { label: 'P&L report', icon: '📊', page: 'pl' as Page, color: '#185FA5' },
                { label: 'Cash Flow', icon: '💧', page: 'cashflow' as Page, color: '#0891B2' },
                { label: 'Partners', icon: '🤝', page: 'partners' as Page, color: '#BA7517' },
              ].map(action => (
                <button key={action.label} style={s.quickBtn} onClick={() => setPage(action.page)}>
                  <span style={{ fontSize: '15px' }}>{action.icon}</span>
                  <span style={{ fontSize: '13px', color: '#333' }}>{action.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#ccc' }}>→</span>
                </button>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#FAF9F7', fontFamily: "'Inter', system-ui, sans-serif" },
  body: { padding: '24px 28px', maxWidth: '1400px', margin: '0 auto' },
  greetingDate: { fontSize: '10px', color: '#AAAAAA', letterSpacing: '0.13em', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' as const },
  greetingTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '28px', fontWeight: '400', color: '#111', margin: '0', lineHeight: '1.2' },
  segmented: { display: 'flex', gap: '2px', background: '#E8E7E2', borderRadius: '9px', padding: '3px' },
  shortcutBtn: { fontFamily: "'Inter', system-ui, sans-serif", fontSize: '11px', border: 'none', borderRadius: '6px', padding: '5px 11px', background: 'transparent', color: '#AAAAAA', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontWeight: '500' },
  shortcutActive: { background: '#fff', color: '#0B5E49', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' },
  dateInput: { fontFamily: "'Inter', system-ui, sans-serif", fontSize: '12px', border: '1px solid #E8E7E2', borderRadius: '7px', padding: '5px 9px', color: '#333', background: '#fff' },
  entityRow: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' as const },
  entityChip: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '9px', background: 'transparent', border: '1px solid #E8E7E2', cursor: 'pointer', flex: '1', minWidth: '150px', transition: 'border-color 0.15s, background 0.15s' },
  entityChipActive: { border: '1.5px solid', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  entityDot: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0 },
  entityBadgePill: { marginLeft: 'auto', fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '20px', letterSpacing: '0.06em', flexShrink: 0 },
  metricsRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '14px' },
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 280px', gap: '12px' },
  card: { background: '#fff', borderRadius: '12px', padding: '1rem 1.2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #E8E7E2' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  cardTitle: { fontSize: '12px', fontWeight: '600', color: '#111', letterSpacing: '-0.01em' },
  cardLink: { fontSize: '12px', color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif", padding: 0 },
  loadingBox: { padding: '24px', textAlign: 'center' as const, color: '#AAAAAA', fontSize: '12px' },
  emptyBox: { padding: '24px', textAlign: 'center' as const, color: '#AAAAAA', fontSize: '12px' },
  quickBtn: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', background: '#F5F4F1', border: '1px solid #E8E7E2', borderRadius: '8px', padding: '8px 11px', fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', marginBottom: '5px', textAlign: 'left' as const, transition: 'background 0.15s' },
}