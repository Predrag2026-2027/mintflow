import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'

export default function PL() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [entity, setEntity] = useState('constellation')
  const [period, setPeriod] = useState('2026-Q1')

  const pageMap: Record<string, any> = {
    'Dashboard':'dashboard','Transactions':'transactions',
    'P&L':'pl','Cash Flow':'cashflow','Reports':'reports',
    'Partners':'partners','Settings':'settings'
  }

  const plData = {
    revenue: [
      { name:'Income from service provided', sg: 145000, af: 98000, total: 243000 },
      { name:'Income from sold goods', sg: 0, af: 0, total: 0 },
      { name:'Interest Received', sg: 120, af: 0, total: 120 },
      { name:'Other Income', sg: 500, af: 200, total: 700 },
    ],
    reductions: [
      { name:'Refunds', sg: 1200, af: 800, total: 2000 },
      { name:'Chargebacks', sg: 340, af: 210, total: 550 },
      { name:'Fees', sg: 2100, af: 1400, total: 3500 },
    ],
    expenses: [
      {
        category: 'Employee and Labour',
        items: [
          { name:'Net Salaries', sg: 18000, af: 12000, total: 30000 },
          { name:'Tax on salary', sg: 3600, af: 2400, total: 6000 },
          { name:'Contributions on behalf of employer', sg: 2700, af: 1800, total: 4500 },
          { name:'Transportation cost', sg: 400, af: 200, total: 600 },
          { name:'Private Health insurance', sg: 800, af: 400, total: 1200 },
          { name:'Warm Meal expenses', sg: 300, af: 150, total: 450 },
        ]
      },
      {
        category: 'Professional and Production Services',
        items: [
          { name:'Legal outsourced services', sg: 2000, af: 1000, total: 3000 },
          { name:'Affiliates Payment', sg: 8000, af: 12000, total: 20000 },
          { name:'Dev&Product&Design Outsourced services', sg: 5000, af: 8000, total: 13000 },
          { name:'Customer support services (outsourced)', sg: 6013, af: 0, total: 6013 },
          { name:'Subscriptions and licences fees', sg: 3200, af: 4100, total: 7300 },
          { name:'Marketing expenses from abroad', sg: 40225, af: 0, total: 40225 },
        ]
      },
      {
        category: 'Banking and Finance',
        items: [
          { name:'Bank Fees (domestic)', sg: 120, af: 0, total: 120 },
          { name:'Bank Fees (abroad)', sg: 80, af: 60, total: 140 },
          { name:'Interest Paid', sg: 1200, af: 0, total: 1200 },
          { name:'Insurance', sg: 1014, af: 0, total: 1014 },
        ]
      },
      {
        category: 'General Business',
        items: [
          { name:'Rent and Mortgage of business premises', sg: 6584, af: 0, total: 6584 },
          { name:'Financial Leasing', sg: 1093, af: 0, total: 1093 },
          { name:'Donation, sponsorships, gifts', sg: 490, af: 0, total: 490 },
          { name:'Registration fees and taxes', sg: 463, af: 0, total: 463 },
          { name:'Capital expenditures', sg: 7500, af: 0, total: 7500 },
        ]
      },
      {
        category: 'Vehicle Expense',
        items: [
          { name:'Fuel and gas expenses', sg: 280, af: 0, total: 280 },
          { name:'Vehicle Insurance', sg: 420, af: 0, total: 420 },
        ]
      },
      {
        category: 'Taxes',
        items: [
          { name:'VAT tax expenses', sg: 1200, af: 0, total: 1200 },
          { name:'City and ecological taxes', sg: 180, af: 0, total: 180 },
        ]
      },
    ]
  }

  const totalRevenue = plData.revenue.reduce((s,r) => s+r.total, 0)
  const totalReductions = plData.reductions.reduce((s,r) => s+r.total, 0)
  const grossProfit = totalRevenue - totalReductions
  const totalExpenses = plData.expenses.reduce((s,cat) => s + cat.items.reduce((ss,i) => ss+i.total, 0), 0)
  const netProfit = grossProfit - totalExpenses
  const margin = totalRevenue > 0 ? (netProfit/totalRevenue*100) : 0

  const fmt = (n: number) => n === 0 ? '—' : '$' + n.toLocaleString('en-US', {maximumFractionDigits:0})
  const fmtN = (n: number) => {
    if (n === 0) return '—'
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', {maximumFractionDigits:0})
  }

  return (
    <div style={s.root}>
      <nav style={s.nav}>
        <div style={s.navLogo}>
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
            <polygon points="18,2 34,30 2,30" fill="none" stroke="#1D9E75" strokeWidth="1.5"/>
            <circle cx="18" cy="2" r="2" fill="#1D9E75"/>
            <circle cx="34" cy="30" r="2" fill="#5DCAA5"/>
            <circle cx="2" cy="30" r="2" fill="#9FE1CB"/>
          </svg>
          <span style={s.navLogoText}>Mint<span style={{color:'#1D9E75'}}>flow</span></span>
        </div>
        <div style={s.navLinks}>
          {['Dashboard','Transactions','P&L','Cash Flow','Reports','Partners','Settings'].map(l => (
            <span key={l} style={l==='P&L' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l])}>{l}</span>
          ))}
        </div>
        <div style={s.navRight}>
          <div style={s.navAvatar}>{user?.email?.substring(0,2).toUpperCase()}</div>
          <span style={s.navEmail}>{user?.email}</span>
          <button style={s.navSignout} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Profit & Loss</div>
            <div style={s.pageSub}>Monthly P&L report · All amounts in USD</div>
          </div>
          <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
            <select style={s.filterSelect} value={entity} onChange={e=>setEntity(e.target.value)}>
              <option value="constel">Constel Group (Consolidated)</option>
              <option value="sfbc">SFBC</option>
              <option value="constellation">Constellation LLC</option>
              <option value="social">Social Growth LLC-FZ</option>
            </select>
            <select style={s.filterSelect} value={period} onChange={e=>setPeriod(e.target.value)}>
              <option value="2026-Q1">Q1 2026</option>
              <option value="2026-01">January 2026</option>
              <option value="2026-02">February 2026</option>
              <option value="2026-03">March 2026</option>
              <option value="2026-04">April 2026</option>
            </select>
            <button style={s.exportBtn}>Export PDF</button>
          </div>
        </div>

        <div style={s.summaryGrid}>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total Revenue</div>
            <div style={{...s.summaryValue, color:'#0F6E56'}}>{fmt(totalRevenue)}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Gross Profit</div>
            <div style={{...s.summaryValue, color:'#0F6E56'}}>{fmt(grossProfit)}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total Expenses</div>
            <div style={{...s.summaryValue, color:'#A32D2D'}}>{fmt(totalExpenses)}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Net Profit / Loss</div>
            <div style={{...s.summaryValue, color: netProfit >= 0 ? '#0F6E56' : '#A32D2D'}}>{fmtN(netProfit)}</div>
            <div style={{fontSize:'11px', color: netProfit >= 0 ? '#1D9E75' : '#E24B4A', marginTop:'4px'}}>{margin.toFixed(1)}% margin</div>
          </div>
        </div>

        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.theadRow}>
                <th style={{...s.th, width:'50%'}}>Item</th>
                <th style={{...s.th, textAlign:'right'}}>Social Growth</th>
                <th style={{...s.th, textAlign:'right'}}>Aimfox</th>
                <th style={{...s.th, textAlign:'right', color:'#111'}}>Total USD</th>
              </tr>
            </thead>
            <tbody>
              <tr style={s.catRow}>
                <td colSpan={4} style={s.catCell}>REVENUE</td>
              </tr>
              {plData.revenue.map(r => (
                <tr key={r.name} style={s.dataRow}>
                  <td style={s.td}>{r.name}</td>
                  <td style={{...s.td, textAlign:'right', color:'#666'}}>{fmt(r.sg)}</td>
                  <td style={{...s.td, textAlign:'right', color:'#666'}}>{fmt(r.af)}</td>
                  <td style={{...s.td, textAlign:'right', fontWeight:'500', color: r.total > 0 ? '#0F6E56' : '#888'}}>{fmt(r.total)}</td>
                </tr>
              ))}
              <tr style={s.totalRow}>
                <td style={s.totalCell}>TOTAL REVENUE</td>
                <td style={{...s.totalCell, textAlign:'right'}}></td>
                <td style={{...s.totalCell, textAlign:'right'}}></td>
                <td style={{...s.totalCell, textAlign:'right', color:'#0F6E56'}}>{fmt(totalRevenue)}</td>
              </tr>

              <tr style={s.catRow}>
                <td colSpan={4} style={s.catCell}>REDUCTIONS</td>
              </tr>
              {plData.reductions.map(r => (
                <tr key={r.name} style={s.dataRow}>
                  <td style={s.td}>{r.name}</td>
                  <td style={{...s.td, textAlign:'right', color:'#666'}}>{fmt(r.sg)}</td>
                  <td style={{...s.td, textAlign:'right', color:'#666'}}>{fmt(r.af)}</td>
                  <td style={{...s.td, textAlign:'right', fontWeight:'500', color:'#A32D2D'}}>{fmt(r.total)}</td>
                </tr>
              ))}
              <tr style={s.totalRow}>
                <td style={s.totalCell}>TOTAL REDUCTIONS</td>
                <td style={{...s.totalCell, textAlign:'right'}}></td>
                <td style={{...s.totalCell, textAlign:'right'}}></td>
                <td style={{...s.totalCell, textAlign:'right', color:'#A32D2D'}}>{fmt(totalReductions)}</td>
              </tr>

              <tr style={s.grossRow}>
                <td style={s.grossCell}>GROSS PROFIT</td>
                <td style={{...s.grossCell, textAlign:'right'}}></td>
                <td style={{...s.grossCell, textAlign:'right'}}></td>
                <td style={{...s.grossCell, textAlign:'right', color:'#0F6E56'}}>{fmt(grossProfit)}</td>
              </tr>

              <tr style={s.catRow}>
                <td colSpan={4} style={s.catCell}>EXPENSES</td>
              </tr>
              {plData.expenses.map(cat => (
                <React.Fragment key={cat.category}>
                  <tr style={s.subCatRow}>
                    <td colSpan={4} style={s.subCatCell}>{cat.category}</td>
                  </tr>
                  {cat.items.map(item => (
                    <tr key={item.name} style={s.dataRow}>
                      <td style={{...s.td, paddingLeft:'2rem'}}>{item.name}</td>
                      <td style={{...s.td, textAlign:'right', color:'#666'}}>{fmt(item.sg)}</td>
                      <td style={{...s.td, textAlign:'right', color:'#666'}}>{fmt(item.af)}</td>
                      <td style={{...s.td, textAlign:'right', fontWeight:'500', color: item.total > 0 ? '#A32D2D' : '#888'}}>{fmt(item.total)}</td>
                    </tr>
                  ))}
                  <tr style={s.subTotalRow}>
                    <td style={{...s.subTotalCell, paddingLeft:'1rem'}}>Total {cat.category}</td>
                    <td style={{...s.subTotalCell, textAlign:'right'}}></td>
                    <td style={{...s.subTotalCell, textAlign:'right'}}></td>
                    <td style={{...s.subTotalCell, textAlign:'right', color:'#A32D2D'}}>{fmt(cat.items.reduce((s,i)=>s+i.total,0))}</td>
                  </tr>
                </React.Fragment>
              ))}

              <tr style={s.totalRow}>
                <td style={s.totalCell}>TOTAL EXPENSES</td>
                <td style={{...s.totalCell, textAlign:'right'}}></td>
                <td style={{...s.totalCell, textAlign:'right'}}></td>
                <td style={{...s.totalCell, textAlign:'right', color:'#A32D2D'}}>{fmt(totalExpenses)}</td>
              </tr>

              <tr style={s.netRow}>
                <td style={s.netCell}>NET PROFIT / LOSS</td>
                <td style={{...s.netCell, textAlign:'right'}}></td>
                <td style={{...s.netCell, textAlign:'right'}}></td>
                <td style={{...s.netCell, textAlign:'right', color: netProfit >= 0 ? '#0F6E56' : '#A32D2D'}}>{fmtN(netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight:'100vh', background:'#f5f5f3', fontFamily:'system-ui,sans-serif' },
  nav: { background:'#0a1628', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.5rem', height:'52px' },
  navLogo: { display:'flex', alignItems:'center', gap:'8px' },
  navLogoText: { fontFamily:'Georgia,serif', fontSize:'18px', fontWeight:'500', color:'#fff' },
  navLinks: { display:'flex', gap:'4px' },
  navLink: { fontSize:'13px', color:'rgba(255,255,255,0.5)', padding:'6px 12px', borderRadius:'6px', cursor:'pointer' },
  navLinkActive: { fontSize:'13px', color:'#fff', padding:'6px 12px', borderRadius:'6px', background:'rgba(255,255,255,0.08)', cursor:'pointer' },
  navRight: { display:'flex', alignItems:'center', gap:'10px' },
  navAvatar: { width:'30px', height:'30px', borderRadius:'50%', background:'#1D9E75', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'500', color:'#fff' },
  navEmail: { fontSize:'13px', color:'rgba(255,255,255,0.7)' },
  navSignout: { background:'none', border:'0.5px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.5)', fontFamily:'system-ui,sans-serif', fontSize:'11px', padding:'5px 12px', borderRadius:'6px', cursor:'pointer' },
  body: { padding:'2rem 1.5rem' },
  pageHeader: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1.5rem' },
  pageTitle: { fontFamily:'Georgia,serif', fontSize:'24px', fontWeight:'400', color:'#111', marginBottom:'4px' },
  pageSub: { fontSize:'13px', color:'#888' },
  filterSelect: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'0.5px solid #e5e5e5', borderRadius:'8px', padding:'8px 12px', outline:'none', background:'#fff', color:'#111', cursor:'pointer' },
  exportBtn: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'0.5px solid #e5e5e5', borderRadius:'8px', padding:'8px 16px', background:'#0a1628', color:'#fff', cursor:'pointer' },
  summaryGrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'1.5rem' },
  summaryCard: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', padding:'1rem 1.25rem' },
  summaryLabel: { fontSize:'11px', color:'#888', textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:'8px' },
  summaryValue: { fontSize:'22px', fontWeight:'500' },
  tableWrap: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', overflow:'hidden' },
  table: { width:'100%', borderCollapse:'collapse' as const, fontSize:'13px' },
  theadRow: { background:'#0a1628' },
  th: { padding:'10px 16px', textAlign:'left' as const, fontSize:'10px', fontWeight:'500', color:'rgba(255,255,255,0.5)', textTransform:'uppercase' as const, letterSpacing:'0.1em' },
  catRow: { background:'#f0f0ee' },
  catCell: { padding:'8px 16px', fontSize:'11px', fontWeight:'500', color:'#444', textTransform:'uppercase' as const, letterSpacing:'0.1em' },
  subCatRow: { background:'#fafaf9' },
  subCatCell: { padding:'7px 16px', fontSize:'12px', fontWeight:'500', color:'#666', borderTop:'0.5px solid #e5e5e5' },
  dataRow: { borderBottom:'0.5px solid #f0f0ee' },
  td: { padding:'8px 16px', color:'#333', fontSize:'13px' },
  totalRow: { background:'#f5f5f3', borderTop:'1px solid #e5e5e5' },
  totalCell: { padding:'10px 16px', fontSize:'12px', fontWeight:'500', color:'#111' },
  subTotalRow: { background:'#fafaf9', borderTop:'0.5px solid #e5e5e5' },
  subTotalCell: { padding:'7px 16px', fontSize:'11px', fontWeight:'500', color:'#666' },
  grossRow: { background:'#E1F5EE', borderTop:'2px solid #1D9E75' },
  grossCell: { padding:'12px 16px', fontSize:'13px', fontWeight:'500', color:'#085041' },
  netRow: { background:'#0a1628', borderTop:'2px solid #0a1628' },
  netCell: { padding:'14px 16px', fontSize:'14px', fontWeight:'500', color:'#fff' },
}