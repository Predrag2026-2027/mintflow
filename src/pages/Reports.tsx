import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'

export default function Reports() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [activeReport, setActiveReport] = useState('')

  const pageMap: Record<string, any> = {
    'Dashboard':'dashboard','Transactions':'transactions',
    'P&L':'pl','Cash Flow':'cashflow','Reports':'reports'
  }

  const reports = [
    {
      id: 'pl-monthly',
      title: 'Monthly P&L',
      desc: 'Profit & Loss by month with revenue stream breakdown',
      category: 'P&L',
      icon: '📊',
      color: '#0F6E56', bg: '#E1F5EE',
    },
    {
      id: 'pl-consolidated',
      title: 'Consolidated P&L',
      desc: 'Group-level P&L with IC eliminations',
      category: 'P&L',
      icon: '🏢',
      color: '#0F6E56', bg: '#E1F5EE',
    },
    {
      id: 'pl-by-dept',
      title: 'P&L by Department',
      desc: 'Expense breakdown per organizational unit',
      category: 'P&L',
      icon: '👥',
      color: '#0F6E56', bg: '#E1F5EE',
    },
    {
      id: 'cashflow-monthly',
      title: 'Monthly Cash Flow',
      desc: 'Operating, investing and financing activities',
      category: 'Cash Flow',
      icon: '💰',
      color: '#0C447C', bg: '#E6F1FB',
    },
    {
      id: 'bank-reconciliation',
      title: 'Bank Reconciliation',
      desc: 'Statement vs. recorded transactions per account',
      category: 'Cash Flow',
      icon: '🏦',
      color: '#0C447C', bg: '#E6F1FB',
    },
    {
      id: 'passthrough',
      title: 'Pass-through Balance',
      desc: 'SFBC pass-through IN vs. OUT monthly balance',
      category: 'Compliance',
      icon: '⚖️',
      color: '#633806', bg: '#FAEEDA',
    },
    {
      id: 'ic-elimination',
      title: 'IC Elimination Report',
      desc: 'Intercompany transactions flagged for consolidation',
      category: 'Compliance',
      icon: '🔗',
      color: '#633806', bg: '#FAEEDA',
    },
    {
      id: 'unmatched',
      title: 'Unmatched Invoices',
      desc: 'Invoices without corresponding payment transactions',
      category: 'Compliance',
      icon: '⚠️',
      color: '#854F0B', bg: '#FAEEDA',
    },
    {
      id: 'exchange-rates',
      title: 'Exchange Rate Log',
      desc: 'NBS and ExchangeRate-API rates used per period',
      category: 'Reference',
      icon: '💱',
      color: '#444', bg: '#f0f0ee',
    },
    {
      id: 'partner-summary',
      title: 'Partner Summary',
      desc: 'Total transactions per partner across all entities',
      category: 'Reference',
      icon: '🤝',
      color: '#444', bg: '#f0f0ee',
    },
  ]

  const categories = ['P&L', 'Cash Flow', 'Compliance', 'Reference']

  const categoryColors: Record<string, {color:string, bg:string}> = {
    'P&L': { color:'#0F6E56', bg:'#E1F5EE' },
    'Cash Flow': { color:'#0C447C', bg:'#E6F1FB' },
    'Compliance': { color:'#633806', bg:'#FAEEDA' },
    'Reference': { color:'#444', bg:'#f0f0ee' },
  }

  const kpis = [
    { label:'Net Profit (YTD)', value:'$42,320', trend:'+12.4%', up:true },
    { label:'Total Revenue (YTD)', value:'$243,820', trend:'+8.1%', up:true },
    { label:'Expense Ratio', value:'82.6%', trend:'-2.1%', up:true },
    { label:'Cash Position', value:'$103,480', trend:'+$18,200', up:true },
  ]

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
          {['Dashboard','Transactions','P&L','Cash Flow','Reports'].map(l => (
            <span key={l} style={l==='Reports' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l])}>{l}</span>
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
            <div style={s.pageTitle}>Reports</div>
            <div style={s.pageSub}>Financial reports and analytics for Constel Group</div>
          </div>
          <div style={{display:'flex',gap:'10px'}}>
            <select style={s.filterSelect}>
              <option>All entities</option>
              <option>SFBC</option>
              <option>Constellation LLC</option>
              <option>Social Growth LLC-FZ</option>
            </select>
            <select style={s.filterSelect}>
              <option>Q1 2026</option>
              <option>YTD 2026</option>
              <option>2025</option>
            </select>
          </div>
        </div>

        <div style={s.kpiGrid}>
          {kpis.map(k => (
            <div key={k.label} style={s.kpiCard}>
              <div style={s.kpiLabel}>{k.label}</div>
              <div style={s.kpiValue}>{k.value}</div>
              <div style={{...s.kpiTrend, color: k.up ? '#0F6E56' : '#A32D2D', background: k.up ? '#E1F5EE' : '#FCEBEB'}}>
                {k.up ? '↑' : '↓'} {k.trend}
              </div>
            </div>
          ))}
        </div>

        {categories.map(cat => (
          <div key={cat} style={s.categorySection}>
            <div style={s.categoryHeader}>
              <span style={{...s.categoryBadge, color:categoryColors[cat].color, background:categoryColors[cat].bg}}>{cat}</span>
              <span style={s.categoryCount}>{reports.filter(r=>r.category===cat).length} reports</span>
            </div>
            <div style={s.reportsGrid}>
              {reports.filter(r => r.category === cat).map(report => (
                <div
                  key={report.id}
                  style={{...s.reportCard, ...(activeReport===report.id ? s.reportCardActive : {})}}
                  onClick={() => setActiveReport(activeReport===report.id ? '' : report.id)}
                >
                  <div style={{...s.reportIcon, background:report.bg}}>
                    <span style={{fontSize:'18px'}}>{report.icon}</span>
                  </div>
                  <div style={s.reportInfo}>
                    <div style={s.reportTitle}>{report.title}</div>
                    <div style={s.reportDesc}>{report.desc}</div>
                  </div>
                  <div style={s.reportActions}>
                    <button style={{...s.reportBtn, color:report.color, borderColor:report.color+'40', background:report.bg}}
                      onClick={e => { e.stopPropagation(); setPage(report.id.startsWith('pl') ? 'pl' : report.id.startsWith('cashflow') || report.id === 'bank-reconciliation' ? 'cashflow' : 'reports') }}>
                      View
                    </button>
                    <button style={s.reportBtnGhost} onClick={e => e.stopPropagation()}>Export</button>
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
  kpiGrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'2rem' },
  kpiCard: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', padding:'1rem 1.25rem' },
  kpiLabel: { fontSize:'11px', color:'#888', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' },
  kpiValue: { fontSize:'22px', fontWeight:'500', color:'#111', marginBottom:'8px' },
  kpiTrend: { display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:'500', padding:'3px 8px', borderRadius:'20px' },
  categorySection: { marginBottom:'2rem' },
  categoryHeader: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' },
  categoryBadge: { fontSize:'11px', fontWeight:'500', padding:'3px 10px', borderRadius:'20px', textTransform:'uppercase', letterSpacing:'0.08em' },
  categoryCount: { fontSize:'12px', color:'#888' },
  reportsGrid: { display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'10px' },
  reportCard: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'12px', cursor:'pointer', transition:'border-color 0.15s' },
  reportCardActive: { border:'2px solid #1D9E75', background:'#E1F5EE' },
  reportIcon: { width:'44px', height:'44px', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  reportInfo: { flex:1 },
  reportTitle: { fontSize:'14px', fontWeight:'500', color:'#111', marginBottom:'3px' },
  reportDesc: { fontSize:'12px', color:'#888', lineHeight:1.4 },
  reportActions: { display:'flex', gap:'6px', flexShrink:0 },
  reportBtn: { fontFamily:'system-ui,sans-serif', fontSize:'11px', fontWeight:'500', padding:'5px 12px', borderRadius:'6px', border:'1px solid', cursor:'pointer' },
  reportBtnGhost: { fontFamily:'system-ui,sans-serif', fontSize:'11px', padding:'5px 12px', borderRadius:'6px', border:'0.5px solid #e5e5e5', background:'transparent', color:'#666', cursor:'pointer' },
}