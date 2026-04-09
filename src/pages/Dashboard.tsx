import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'

type Entity = 'constel' | 'sfbc' | 'constellation' | 'social'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [entity, setEntity] = useState<Entity>('constel')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })

  const entities = [
    { id:'constel' as Entity, name:'Constel Group', sub:'All companies · USD', badge:'Consolidated', badgeColor:'#0F6E56', badgeBg:'#E1F5EE', iconColor:'#1D9E75', iconBg:'#E1F5EE' },
    { id:'sfbc' as Entity, name:'SFBC', sub:'4 accounts · USD', badge:'US', badgeColor:'#0C447C', badgeBg:'#E6F1FB', iconColor:'#185FA5', iconBg:'#E6F1FB' },
    { id:'constellation' as Entity, name:'Constellation LLC', sub:'4 banks · RSD/USD/EUR', badge:'RS', badgeColor:'#633806', badgeBg:'#FAEEDA', iconColor:'#BA7517', iconBg:'#FAEEDA' },
    { id:'social' as Entity, name:'Social Growth', sub:'WIO Bank · USD/AED', badge:'AE', badgeColor:'#72243E', badgeBg:'#FBEAF0', iconColor:'#D4537E', iconBg:'#FBEAF0' },
  ]

  const shortcuts = [
    { label:'This month', from: (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` })(), to: new Date().toISOString().split('T')[0] },
    { label:'This quarter', from: (() => { const d=new Date(); const q=Math.floor(d.getMonth()/3); return `${d.getFullYear()}-${String(q*3+1).padStart(2,'0')}-01` })(), to: new Date().toISOString().split('T')[0] },
    { label:'YTD', from: `${new Date().getFullYear()}-01-01`, to: new Date().toISOString().split('T')[0] },
    { label:'Last month', from: (() => { const d=new Date(); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` })(), to: (() => { const d=new Date(); d.setDate(0); return d.toISOString().split('T')[0] })() },
  ]

  const alerts = [
    { type:'warn', text:'Constellation LLC — 5 invoices unmatched for current period.' },
    { type:'warn', text:'SFBC — 2 pass-through entries pending pair.' },
    { type:'ok', text:'NBS exchange rates updated for April 9, 2026.' },
  ]

  const metrics = [
    { label:'Unmatched invoices', value:'7', sub:'Across all entities', color:'#854F0B' },
    { label:'Pass-through status', value:'Balanced', sub:'SFBC · current period', color:'#0F6E56' },
    { label:'Pending entries', value:'3', sub:'Awaiting posting', color:'#854F0B' },
    { label:'IC transactions', value:'Matched', sub:'All periods clear', color:'#0F6E56' },
  ]

  const pageMap: Record<string, any> = {
    'Dashboard':'dashboard','Transactions':'transactions',
    'P&L':'pl','Cash Flow':'cashflow','Reports':'reports'
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
          {['Dashboard','Transactions','P&L','Cash Flow','Reports'].map(l => (
            <span key={l} style={l==='Dashboard' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l])}>{l}</span>
          ))}
        </div>
        <div style={s.navRight}>
          <div style={s.navAvatar}>{user?.email?.substring(0,2).toUpperCase()}</div>
          <span style={s.navEmail}>{user?.email}</span>
          <span style={s.navRole}>Administrator</span>
          <button style={s.navSignout} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div style={s.body}>
        <div style={s.greeting}>
          <div style={s.greetingDate}>{new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
          <div style={s.greetingTitle}>Good morning, <span style={{color:'#1D9E75'}}>{user?.email?.split('@')[0]}</span></div>
          <div style={s.greetingSub}>Select an entity to begin or review your alerts below.</div>
        </div>

        <div style={s.sectionLabel}>Select entity</div>
        <div style={s.entityGrid}>
          {entities.map(e => (
            <div key={e.id} style={{...s.entityCard, ...(entity===e.id ? s.entityActive : {})}} onClick={() => setEntity(e.id)}>
              <div style={{...s.entityBadge, color:e.badgeColor, background:e.badgeBg}}>{e.badge}</div>
              <div style={{...s.entityIcon, background:e.iconBg}}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={e.iconColor} strokeWidth="1.3">
                  <rect x="2" y="4" width="14" height="10" rx="2"/><path d="M6 4v10M2 8h14"/>
                </svg>
              </div>
              <div style={{...s.entityName, ...(entity===e.id?{color:'#085041'}:{})}}>{e.name}</div>
              <div style={{...s.entitySub, ...(entity===e.id?{color:'#0F6E56'}:{})}}>{e.sub}</div>
            </div>
          ))}
        </div>

        <div style={s.periodBar}>
          <div style={s.periodGroup}>
            <span style={s.periodLabel}>From</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={s.dateInput}/>
          </div>
          <span style={s.periodArrow}>→</span>
          <div style={s.periodGroup}>
            <span style={s.periodLabel}>To</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={s.dateInput}/>
          </div>
          <div style={s.shortcuts}>
            {shortcuts.map(sc => (
              <button key={sc.label} style={s.shortcutBtn} onClick={()=>{setDateFrom(sc.from);setDateTo(sc.to)}}>{sc.label}</button>
            ))}
          </div>
          <div style={s.periodDisplay}>{new Date(dateFrom).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} – {new Date(dateTo).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
        </div>

        <div style={s.contentGrid}>
          <div>
            <div style={s.metricsGrid}>
              {metrics.map(m => (
                <div key={m.label} style={s.metricCard}>
                  <div style={s.metricLabel}>{m.label}</div>
                  <div style={{...s.metricValue, color:m.color}}>{m.value}</div>
                  <div style={s.metricSub}>{m.sub}</div>
                </div>
              ))}
            </div>
            <div style={s.alertCard}>
              <div style={s.alertHeader}>
                <span style={s.alertTitle}>Alerts & notifications</span>
                <span style={s.alertCount}>{alerts.length} active</span>
              </div>
              {alerts.map((a,i) => (
                <div key={i} style={s.alertItem}>
                  <div style={{...s.alertDot, background:a.type==='ok'?'#1D9E75':'#BA7517'}}/>
                  <span style={s.alertText}>{a.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={s.quickCard}>
            <div style={s.quickTitle}>Quick actions</div>
            {[
              { label:'New transaction', page:'transactions' },
              { label:'P&L report', page:'pl' },
              { label:'Cash flow', page:'cashflow' },
              { label:'Unmatched invoices', page:'transactions' },
              { label:'User management', page:'reports' },
            ].map(action => (
              <button key={action.label} style={s.quickBtn} onClick={() => setPage(action.page as any)}>{action.label}</button>
            ))}
          </div>
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
  navRole: { fontSize:'10px', background:'rgba(29,158,117,0.2)', color:'#5DCAA5', padding:'2px 8px', borderRadius:'20px', letterSpacing:'0.06em' },
  navSignout: { background:'none', border:'0.5px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.5)', fontFamily:'system-ui,sans-serif', fontSize:'11px', padding:'5px 12px', borderRadius:'6px', cursor:'pointer' },
  body: { padding:'2rem 1.5rem' },
  greeting: { marginBottom:'2rem' },
  greetingDate: { fontSize:'11px', color:'#888', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'4px' },
  greetingTitle: { fontFamily:'Georgia,serif', fontSize:'26px', fontWeight:'400', color:'#111', marginBottom:'4px' },
  greetingSub: { fontSize:'13px', color:'#888' },
  sectionLabel: { fontSize:'11px', fontWeight:'500', color:'#888', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'1rem' },
  entityGrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'1.5rem' },
  entityCard: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', padding:'1.25rem', cursor:'pointer', position:'relative', transition:'border-color 0.15s' },
  entityActive: { border:'2px solid #1D9E75', background:'#E1F5EE' },
  entityBadge: { position:'absolute', top:'10px', right:'10px', fontSize:'9px', fontWeight:'500', padding:'2px 7px', borderRadius:'20px', textTransform:'uppercase' },
  entityIcon: { width:'36px', height:'36px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'12px' },
  entityName: { fontSize:'14px', fontWeight:'500', color:'#111', marginBottom:'2px' },
  entitySub: { fontSize:'11px', color:'#888' },
  periodBar: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', padding:'1rem 1.25rem', marginBottom:'1.5rem', display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' },
  periodGroup: { display:'flex', alignItems:'center', gap:'8px' },
  periodLabel: { fontSize:'11px', fontWeight:'500', color:'#888', textTransform:'uppercase', letterSpacing:'0.08em', whiteSpace:'nowrap' },
  dateInput: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'0.5px solid #e5e5e5', borderRadius:'6px', padding:'6px 10px', outline:'none', color:'#111', background:'#fff' },
  periodArrow: { fontSize:'13px', color:'#aaa' },
  shortcuts: { display:'flex', gap:'6px' },
  shortcutBtn: { fontFamily:'system-ui,sans-serif', fontSize:'11px', border:'0.5px solid #e5e5e5', borderRadius:'6px', padding:'5px 10px', background:'#f5f5f3', color:'#666', cursor:'pointer', whiteSpace:'nowrap' },
  periodDisplay: { fontSize:'12px', color:'#0F6E56', fontWeight:'500', background:'#E1F5EE', padding:'4px 10px', borderRadius:'6px', marginLeft:'auto' },
  contentGrid: { display:'grid', gridTemplateColumns:'1fr 280px', gap:'12px' },
  metricsGrid: { display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px', marginBottom:'12px' },
  metricCard: { background:'#f0f0ee', borderRadius:'8px', padding:'1rem' },
  metricLabel: { fontSize:'11px', color:'#888', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' },
  metricValue: { fontSize:'20px', fontWeight:'500' },
  metricSub: { fontSize:'11px', color:'#888', marginTop:'2px' },
  alertCard: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', padding:'1rem 1.25rem' },
  alertHeader: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' },
  alertTitle: { fontSize:'13px', fontWeight:'500', color:'#111' },
  alertCount: { fontSize:'11px', background:'#f0f0ee', color:'#888', padding:'2px 8px', borderRadius:'20px' },
  alertItem: { display:'flex', alignItems:'flex-start', gap:'8px', padding:'8px 0', borderTop:'0.5px solid #f0f0ee' },
  alertDot: { width:'6px', height:'6px', borderRadius:'50%', marginTop:'5px', flexShrink:0 },
  alertText: { fontSize:'12px', color:'#666', lineHeight:1.5 },
  quickCard: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', padding:'1rem 1.25rem' },
  quickTitle: { fontSize:'13px', fontWeight:'500', color:'#111', marginBottom:'12px' },
  quickBtn: { display:'block', width:'100%', background:'#f5f5f3', border:'0.5px solid #e5e5e5', borderRadius:'8px', padding:'10px 12px', fontFamily:'system-ui,sans-serif', fontSize:'12px', color:'#111', cursor:'pointer', marginBottom:'6px', textAlign:'left' },
}