import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { fmtUSD, fmtUSDSigned } from '../utils/formatters'

type ViewMode = 'category' | 'department'

export default function PL() {

  const [companies, setCompanies] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('all')
  const [periodType, setPeriodType] = useState<'month' | 'quarter' | 'year'>('month')
  const [periodValue, setPeriodValue] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<any[]>([])
  const [plCategories, setPlCategories] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('category')

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    const load = async () => {
      const [{ data: comp }, { data: plCat }] = await Promise.all([
        supabase.from('companies').select('id,name').order('name'),
        supabase.from('pl_categories').select('id,name,type,sort_order').order('sort_order'),
      ])
      if (comp) setCompanies(comp)
      if (plCat) setPlCategories(plCat)
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

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { start, end } = getDateRange()
    let query = supabase.from('v_pl_entries').select('*').gte('pl_date', start).lte('pl_date', end)
    if (companyId !== 'all') query = query.eq('company_id', companyId)
    const { data } = await query
    setEntries(data || [])
    setLoading(false)
  }, [companyId, getDateRange])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // ── Allocation helper ────────────────────────────────
  const allocAmount = (e: any, stream: 'sg' | 'af') => {
    const amt = e.amount_usd || 0
    if (e.rev_alloc_type === 'sg100') return stream === 'sg' ? amt : 0
    if (e.rev_alloc_type === 'af100') return stream === 'af' ? amt : 0
    if (e.rev_alloc_type === 'byval') {
      // byval — 50/50 fallback if specific values not stored
      return amt / 2
    }
    return amt / 2 // shared
  }

  // ── Revenue ──────────────────────────────────────────
  const revenueEntries = entries.filter(e => e.tx_type === 'revenue' || e.tx_type === 'invoice_revenue')
  const revenueByStream: Record<string, { sg: number; af: number; total: number }> = {}
  revenueEntries.forEach(e => {
    const key = e.revenue_stream || e.pl_subcategory || 'Other Income'
    if (!revenueByStream[key]) revenueByStream[key] = { sg: 0, af: 0, total: 0 }
    revenueByStream[key].sg += allocAmount(e, 'sg')
    revenueByStream[key].af += allocAmount(e, 'af')
    revenueByStream[key].total += e.amount_usd || 0
  })

  // ── Reductions ───────────────────────────────────────
  const reductionCat = plCategories.find(c => c.name === 'Reductions')
  const reductionByName: Record<string, { sg: number; af: number; total: number }> = {}
  entries.filter(e => reductionCat && e.pl_category === reductionCat.name).forEach(e => {
    const key = e.pl_subcategory || e.expense_description || 'Reductions'
    if (!reductionByName[key]) reductionByName[key] = { sg: 0, af: 0, total: 0 }
    reductionByName[key].sg += allocAmount(e, 'sg')
    reductionByName[key].af += allocAmount(e, 'af')
    reductionByName[key].total += e.amount_usd || 0
  })

  // ── Expenses by Category ─────────────────────────────
  const expenseCategories = plCategories.filter(c => c.type === 'expense' && c.name !== 'Reductions')
  const expenseEntries = entries.filter(e => e.tx_type === 'expense' || e.tx_type === 'invoice_expense')

  const getExpensesForCategory = (catName: string) => {
    const bySubcat: Record<string, { sg: number; af: number; total: number }> = {}
    expenseEntries.filter(e => e.pl_category === catName).forEach(e => {
      const key = e.pl_subcategory || e.expense_description || catName
      if (!bySubcat[key]) bySubcat[key] = { sg: 0, af: 0, total: 0 }
      bySubcat[key].sg += allocAmount(e, 'sg')
      bySubcat[key].af += allocAmount(e, 'af')
      bySubcat[key].total += e.amount_usd || 0
    })
    return bySubcat
  }

  // ── Expenses by Department ───────────────────────────
  const getDepartments = () => {
    const depts: Record<string, {
      subcategories: Record<string, { sg: number; af: number; total: number }>
      total: number
    }> = {}

    expenseEntries.forEach(e => {
      const dept = e.department || 'Unassigned'
      const sub = e.dept_subcategory || e.expense_description || e.pl_subcategory || 'General'

      if (!depts[dept]) depts[dept] = { subcategories: {}, total: 0 }
      if (!depts[dept].subcategories[sub]) depts[dept].subcategories[sub] = { sg: 0, af: 0, total: 0 }

      depts[dept].subcategories[sub].sg += allocAmount(e, 'sg')
      depts[dept].subcategories[sub].af += allocAmount(e, 'af')
      depts[dept].subcategories[sub].total += e.amount_usd || 0
      depts[dept].total += e.amount_usd || 0
    })

    return depts
  }

  // ── Totals ───────────────────────────────────────────
  const totalRevenueSG = Object.values(revenueByStream).reduce((s, r) => s + r.sg, 0)
  const totalRevenueAF = Object.values(revenueByStream).reduce((s, r) => s + r.af, 0)
  const totalRevenue = Object.values(revenueByStream).reduce((s, r) => s + r.total, 0)

  const totalReductionsSG = Object.values(reductionByName).reduce((s, r) => s + r.sg, 0)
  const totalReductionsAF = Object.values(reductionByName).reduce((s, r) => s + r.af, 0)
  const totalReductions = Object.values(reductionByName).reduce((s, r) => s + r.total, 0)

  const grossProfitSG = totalRevenueSG - totalReductionsSG
  const grossProfitAF = totalRevenueAF - totalReductionsAF
  const grossProfit = totalRevenue - totalReductions

  const totalExpensesSG = expenseEntries.reduce((s, e) => s + allocAmount(e, 'sg'), 0)
  const totalExpensesAF = expenseEntries.reduce((s, e) => s + allocAmount(e, 'af'), 0)
  const totalExpenses = expenseEntries.reduce((s, e) => s + (e.amount_usd || 0), 0)

  const netProfitSG = grossProfitSG - totalExpensesSG
  const netProfitAF = grossProfitAF - totalExpensesAF
  const netProfit = grossProfit - totalExpenses
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return { value: `${currentYear}-${m}`, label: new Date(currentYear, i, 1).toLocaleString('en', { month: 'long', year: 'numeric' }) }
  })
  const quarters = [1, 2, 3, 4].map(q => ({ value: `${currentYear}-Q${q}`, label: `Q${q} ${currentYear}` }))
  const years = [currentYear - 1, currentYear].map(y => ({ value: String(y), label: String(y) }))

  const hasData = entries.length > 0
  const departments = getDepartments()

  return (
    <div style={s.root}>
      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Profit & Loss</div>
            <div style={s.pageSub}>
              {loading ? 'Loading...' : hasData ? `${entries.length} entries · All amounts in USD` : 'No data for selected period'}
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
          {[
            { label: 'Total Revenue', value: fmtUSD(totalRevenue), color: '#0F6E56' },
            { label: 'Gross Profit', value: fmtUSD(grossProfit), color: grossProfit >= 0 ? '#0F6E56' : '#A32D2D' },
            { label: 'Total Expenses', value: fmtUSD(totalExpenses), color: '#FF5B5A' },
            { label: 'Net Profit / Loss', value: fmtUSDSigned(netProfit), color: netProfit >= 0 ? '#0F6E56' : '#A32D2D', sub: `${margin.toFixed(1)}% margin` },
          ].map(card => (
            <div key={card.label} style={s.summaryCard}>
              <div style={s.summaryLabel}>{card.label}</div>
              <div style={{ ...s.summaryValue, color: card.color }}>{card.value}</div>
              {'sub' in card && card.sub && <div style={{ fontSize: '11px', color: card.color, marginTop: '4px', opacity: 0.8 }}>{card.sub}</div>}
            </div>
          ))}
        </div>

        {!loading && !hasData && (
          <div style={s.emptyState}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6', marginBottom: '6px' }}>No P&L data for this period</div>
            <div style={{ fontSize: '13px', color: '#7A9BB8' }}>Post invoices or direct transactions to see real P&L data here.</div>
          </div>
        )}

        {(hasData || loading) && (
          <div style={s.tableWrap}>
            {/* ── View toggle ── */}
            <div style={s.toggleBar}>
              <div style={s.toggleGroup}>
                <button
                  style={{ ...s.toggleBtn, ...(viewMode === 'category' ? s.toggleBtnActive : {}) }}
                  onClick={() => setViewMode('category')}
                >
                  📊 By Category
                </button>
                <button
                  style={{ ...s.toggleBtn, ...(viewMode === 'department' ? s.toggleBtnActive : {}) }}
                  onClick={() => setViewMode('department')}
                >
                  🏗 By Department
                </button>
              </div>
              <div style={{ fontSize: '11px', color: '#7A9BB8' }}>
                {viewMode === 'category' ? 'Expenses grouped by P&L category' : 'Expenses grouped by department'}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center' as const, color: '#7A9BB8', fontSize: '13px' }}>Loading P&L data...</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.theadRow}>
                    <th style={{ ...s.th, width: '50%' }}>Item</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>Social Growth</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>Aimfox</th>
                    <th style={{ ...s.th, textAlign: 'right' as const, color: 'rgba(255,255,255,0.30)' }}>Total USD</th>
                  </tr>
                </thead>
                <tbody>

                  {/* ── REVENUE — isti za oba view-a ── */}
                  <tr style={s.catRow}><td colSpan={4} style={s.catCell}>REVENUE</td></tr>
                  {Object.keys(revenueByStream).length === 0
                    ? <tr style={s.dataRow}><td style={{ ...s.td, color: 'rgba(255,255,255,0.30)', fontStyle: 'italic' }} colSpan={4}>No revenue entries for this period</td></tr>
                    : Object.entries(revenueByStream).map(([name, r]) => (
                      <tr key={name} style={s.dataRow}>
                        <td style={s.td}>{name}</td>
                        <td style={{ ...s.td, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(r.sg)}</td>
                        <td style={{ ...s.td, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(r.af)}</td>
                        <td style={{ ...s.td, textAlign: 'right' as const, fontWeight: '500', color: '#0F6E56' }}>{fmtUSD(r.total)}</td>
                      </tr>
                    ))
                  }
                  <tr style={s.totalRow}>
                    <td style={s.totalCell}>TOTAL REVENUE</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#0F6E56' }}>{fmtUSD(totalRevenueSG)}</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#0F6E56' }}>{fmtUSD(totalRevenueAF)}</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#0F6E56' }}>{fmtUSD(totalRevenue)}</td>
                  </tr>

                  {/* ── REDUCTIONS — isti za oba view-a ── */}
                  <tr style={s.catRow}><td colSpan={4} style={s.catCell}>REDUCTIONS</td></tr>
                  {Object.keys(reductionByName).length === 0
                    ? <tr style={s.dataRow}><td style={{ ...s.td, color: 'rgba(255,255,255,0.30)', fontStyle: 'italic' }} colSpan={4}>No reductions for this period</td></tr>
                    : Object.entries(reductionByName).map(([name, r]) => (
                      <tr key={name} style={s.dataRow}>
                        <td style={s.td}>{name}</td>
                        <td style={{ ...s.td, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(r.sg)}</td>
                        <td style={{ ...s.td, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(r.af)}</td>
                        <td style={{ ...s.td, textAlign: 'right' as const, fontWeight: '500', color: '#FF5B5A' }}>{fmtUSD(r.total)}</td>
                      </tr>
                    ))
                  }
                  <tr style={s.totalRow}>
                    <td style={s.totalCell}>TOTAL REDUCTIONS</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#FF5B5A' }}>{fmtUSD(totalReductionsSG)}</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#FF5B5A' }}>{fmtUSD(totalReductionsAF)}</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#FF5B5A' }}>{fmtUSD(totalReductions)}</td>
                  </tr>

                  {/* ── GROSS PROFIT ── */}
                  <tr style={s.grossRow}>
                    <td style={s.grossCell}>GROSS PROFIT</td>
                    <td style={{ ...s.grossCell, textAlign: 'right' as const, color: grossProfitSG >= 0 ? '#085041' : '#A32D2D' }}>{fmtUSDSigned(grossProfitSG)}</td>
                    <td style={{ ...s.grossCell, textAlign: 'right' as const, color: grossProfitAF >= 0 ? '#085041' : '#A32D2D' }}>{fmtUSDSigned(grossProfitAF)}</td>
                    <td style={{ ...s.grossCell, textAlign: 'right' as const, color: grossProfit >= 0 ? '#085041' : '#A32D2D' }}>{fmtUSDSigned(grossProfit)}</td>
                  </tr>

                  {/* ── EXPENSES ── */}
                  <tr style={s.catRow}><td colSpan={4} style={s.catCell}>EXPENSES</td></tr>

                  {viewMode === 'category' ? (
                    // ── BY CATEGORY VIEW ──
                    <>
                      {expenseCategories.map(cat => {
                        const items = getExpensesForCategory(cat.name)
                        const catTotal = Object.values(items).reduce((sum, i) => sum + i.total, 0)
                        return (
                          <React.Fragment key={cat.id}>
                            <tr style={s.subCatRow}>
                              <td colSpan={4} style={s.subCatCell}>{cat.name}</td>
                            </tr>
                            {Object.keys(items).length === 0
                              ? <tr style={s.dataRow}><td style={{ ...s.td, paddingLeft: '2rem', color: 'rgba(255,255,255,0.30)', fontStyle: 'italic' }} colSpan={4}>No entries</td></tr>
                              : Object.entries(items).map(([name, item]) => (
                                <tr key={name} style={s.dataRow}>
                                  <td style={{ ...s.td, paddingLeft: '2rem' }}>{name}</td>
                                  <td style={{ ...s.td, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(item.sg)}</td>
                                  <td style={{ ...s.td, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(item.af)}</td>
                                  <td style={{ ...s.td, textAlign: 'right' as const, fontWeight: '500', color: item.total > 0 ? '#A32D2D' : '#888' }}>{fmtUSD(item.total)}</td>
                                </tr>
                              ))
                            }
                            <tr style={s.subTotalRow}>
                              <td style={{ ...s.subTotalCell, paddingLeft: '1rem' }}>Total {cat.name}</td>
                              <td style={{ ...s.subTotalCell, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(Object.values(items).reduce((s, i) => s + i.sg, 0))}</td>
                              <td style={{ ...s.subTotalCell, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(Object.values(items).reduce((s, i) => s + i.af, 0))}</td>
                              <td style={{ ...s.subTotalCell, textAlign: 'right' as const, color: catTotal > 0 ? '#A32D2D' : '#888' }}>{fmtUSD(catTotal)}</td>
                            </tr>
                          </React.Fragment>
                        )
                      })}
                    </>
                  ) : (
                    // ── BY DEPARTMENT VIEW ──
                    <>
                      {Object.keys(departments).length === 0 ? (
                        <tr style={s.dataRow}>
                          <td style={{ ...s.td, color: 'rgba(255,255,255,0.30)', fontStyle: 'italic' }} colSpan={4}>No department expenses for this period</td>
                        </tr>
                      ) : Object.entries(departments)
                          .sort(([, a], [, b]) => b.total - a.total)
                          .map(([dept, data]) => (
                        <React.Fragment key={dept}>
                          {/* Department header */}
                          <tr style={s.deptRow}>
                            <td colSpan={4} style={s.deptCell}>
                              <span style={s.deptIcon}>🏗</span>
                              {dept}
                              <span style={s.deptBadge}>{fmtUSD(data.total)}</span>
                            </td>
                          </tr>
                          {/* Subcategories */}
                          {Object.entries(data.subcategories)
                            .sort(([, a], [, b]) => b.total - a.total)
                            .map(([sub, item]) => (
                            <tr key={sub} style={s.dataRow}>
                              <td style={{ ...s.td, paddingLeft: '2rem' }}>{sub}</td>
                              <td style={{ ...s.td, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(item.sg)}</td>
                              <td style={{ ...s.td, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(item.af)}</td>
                              <td style={{ ...s.td, textAlign: 'right' as const, fontWeight: '500', color: '#FF5B5A' }}>{fmtUSD(item.total)}</td>
                            </tr>
                          ))}
                          {/* Department subtotal */}
                          <tr style={s.subTotalRow}>
                            <td style={{ ...s.subTotalCell, paddingLeft: '1rem' }}>Total {dept}</td>
                            <td style={{ ...s.subTotalCell, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(Object.values(data.subcategories).reduce((s, i) => s + i.sg, 0))}</td>
                            <td style={{ ...s.subTotalCell, textAlign: 'right' as const, color: '#7A9BB8' }}>{fmtUSD(Object.values(data.subcategories).reduce((s, i) => s + i.af, 0))}</td>
                            <td style={{ ...s.subTotalCell, textAlign: 'right' as const, color: '#FF5B5A' }}>{fmtUSD(data.total)}</td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </>
                  )}

                  <tr style={s.totalRow}>
                    <td style={s.totalCell}>TOTAL EXPENSES</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#FF5B5A' }}>{fmtUSD(totalExpensesSG)}</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#FF5B5A' }}>{fmtUSD(totalExpensesAF)}</td>
                    <td style={{ ...s.totalCell, textAlign: 'right' as const, color: '#FF5B5A' }}>{fmtUSD(totalExpenses)}</td>
                  </tr>

                  {/* ── NET PROFIT ── */}
                  <tr style={s.netRow}>
                    <td style={s.netCell}>NET PROFIT / LOSS</td>
                    <td style={{ ...s.netCell, textAlign: 'right' as const, color: netProfitSG >= 0 ? '#00D47E' : '#FF5B5A' }}>{fmtUSDSigned(netProfitSG)}</td>
                    <td style={{ ...s.netCell, textAlign: 'right' as const, color: netProfitAF >= 0 ? '#00D47E' : '#FF5B5A' }}>{fmtUSDSigned(netProfitAF)}</td>
                    <td style={{ ...s.netCell, textAlign: 'right' as const, color: netProfit >= 0 ? '#00D47E' : '#FF5B5A' }}>{fmtUSDSigned(netProfit)}</td>
                  </tr>

                </tbody>
              </table>
            )}
          </div>
        )}
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
  filterSelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#0D1B2C', color: '#DCE9F6', cursor: 'pointer' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '1.5rem' },
  summaryCard: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', padding: '1rem 1.25rem' },
  summaryLabel: { fontSize: '11px', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' },
  summaryValue: { fontSize: '22px', fontWeight: '500' },
  emptyState: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', padding: '60px', textAlign: 'center' as const },
  tableWrap: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', overflow: 'hidden' },
  // Toggle
  toggleBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.075)', background: '#111F30' },
  toggleGroup: { display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '3px' },
  toggleBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', fontWeight: '500', padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.44)', cursor: 'pointer', transition: 'all 0.15s' },
  toggleBtnActive: { background: 'rgba(255,255,255,0.12)', color: '#DCE9F6', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  // Table
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  theadRow: { background: '#060E1A' },
  th: { padding: '10px 16px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '500', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.1em' },
  catRow: { background: 'rgba(255,255,255,0.04)' },
  catCell: { padding: '8px 16px', fontSize: '11px', fontWeight: '500', color: '#7A9BB8', textTransform: 'uppercase' as const, letterSpacing: '0.1em' },
  subCatRow: { background: '#0D1B2C' },
  subCatCell: { padding: '7px 16px', fontSize: '12px', fontWeight: '500', color: '#7A9BB8', borderTop: '0.5px solid rgba(255,255,255,0.05)' },
  // Department rows
  deptRow: { background: 'rgba(78,168,255,0.08)', borderTop: '1px solid rgba(78,168,255,0.2)' },
  deptCell: { padding: '9px 16px', fontSize: '12px', fontWeight: '600', color: '#4EA8FF', display: 'flex', alignItems: 'center', gap: '8px' },
  deptIcon: { fontSize: '14px' },
  deptBadge: { marginLeft: 'auto', fontSize: '12px', fontWeight: '600', color: '#FF5B5A', background: 'rgba(255,91,90,0.13)', padding: '2px 8px', borderRadius: '12px' },
  dataRow: { borderBottom: '0.5px solid rgba(255,255,255,0.05)' },
  td: { padding: '8px 16px', color: '#DCE9F6', fontSize: '13px' },
  totalRow: { background: '#111F30', borderTop: '1px solid rgba(255,255,255,0.10)' },
  totalCell: { padding: '10px 16px', fontSize: '12px', fontWeight: '500', color: '#DCE9F6' },
  subTotalRow: { background: '#0D1B2C', borderTop: '0.5px solid rgba(255,255,255,0.05)' },
  subTotalCell: { padding: '7px 16px', fontSize: '11px', fontWeight: '500', color: '#7A9BB8' },
  grossRow: { background: 'rgba(0,212,126,0.08)', borderTop: '2px solid #00D47E' },
  grossCell: { padding: '12px 16px', fontSize: '13px', fontWeight: '500', color: '#00D47E' },
  netRow: { background: '#060E1A', borderTop: '2px solid rgba(255,255,255,0.14)' },
  netCell: { padding: '14px 16px', fontSize: '14px', fontWeight: '500', color: '#DCE9F6' },
}