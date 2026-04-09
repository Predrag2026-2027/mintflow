import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TransactionDialog from '../components/TransactionDialog'
import { NavContext } from '../App'

export default function Transactions() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [showDialog, setShowDialog] = useState(false)
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch] = useState('')

  const mockTx = [
    { id:1, date:'2026-04-06', partner:'Basket Group', type:'expense', plCat:'General Business', desc:'Donation, sponsorships, gifts', dept:'General Business Expenses', currency:'RSD', amount:57600, amountUsd:490.2, status:'posted', company:'Constellation LLC' },
    { id:2, date:'2026-04-01', partner:'Privredna komora Srbije', type:'expense', plCat:'General Business', desc:'Registration fees and taxes', dept:'General Business Expenses', currency:'RSD', amount:54432, amountUsd:463.1, status:'posted', company:'Constellation LLC' },
    { id:3, date:'2026-03-31', partner:'Stuff Up Bro', type:'expense', plCat:'Professional and Production Services', desc:'Customer support services', dept:'CS Expenses', currency:'USD', amount:6013, amountUsd:6013, status:'posted', company:'Constellation LLC' },
    { id:4, date:'2026-03-31', partner:'Google Ireland Limited', type:'expense', plCat:'Professional and Production Services', desc:'Marketing expenses from abroad', dept:'Marketing Expenses', currency:'RSD', amount:4726450, amountUsd:40225, status:'pending', company:'Constellation LLC' },
    { id:5, date:'2026-03-31', partner:'S-Leasing doo Beograd', type:'expense', plCat:'General Business', desc:'Financial Leasing', dept:'General Business Expenses', currency:'RSD', amount:128327, amountUsd:1092.7, status:'posted', company:'Constellation LLC' },
    { id:6, date:'2026-03-31', partner:'Wiener Stadische', type:'expense', plCat:'General Business', desc:'Rent and Mortgage', dept:'General Business Expenses', currency:'EUR', amount:6074.46, amountUsd:6584.2, status:'pending', company:'Constellation LLC' },
    { id:7, date:'2026-03-15', partner:'Stuff Up Bro', type:'expense', plCat:'Professional and Production Services', desc:'Customer support services', dept:'CS Expenses', currency:'USD', amount:5000, amountUsd:5000, status:'posted', company:'Constellation LLC' },
    { id:8, date:'2026-03-10', partner:'Generali Osiguranje', type:'expense', plCat:'Employee and Labour', desc:'Private Health insurance', dept:'General Business Expenses', currency:'RSD', amount:119053, amountUsd:1014.1, status:'posted', company:'Constellation LLC' },
    { id:9, date:'2026-02-28', partner:'Stuff Up Bro', type:'expense', plCat:'Professional and Production Services', desc:'Customer support services', dept:'CS Expenses', currency:'USD', amount:5000, amountUsd:5000, status:'posted', company:'Constellation LLC' },
    { id:10, date:'2026-01-22', partner:'Galvin & Mathews', type:'expense', plCat:'General Business', desc:'Capital expenditures', dept:'General Business Expenses', currency:'RSD', amount:753331, amountUsd:7500, status:'posted', company:'Constellation LLC' },
  ]

  const typeColors: Record<string, {bg:string,color:string}> = {
    expense: { bg:'#FCEBEB', color:'#A32D2D' },
    revenue: { bg:'#E1F5EE', color:'#085041' },
    transfer: { bg:'#E6F1FB', color:'#0C447C' },
    intercompany: { bg:'#FAEEDA', color:'#633806' },
    passthrough: { bg:'#FBEAF0', color:'#72243E' },
  }

  const statusColors: Record<string, {bg:string,color:string}> = {
    posted: { bg:'#E1F5EE', color:'#085041' },
    pending: { bg:'#FAEEDA', color:'#633806' },
    draft: { bg:'#f0f0ee', color:'#666' },
  }

  const filtered = mockTx.filter(t => {
    const matchEntity = filterEntity==='all' || t.company.toLowerCase().includes(filterEntity)
    const matchType = filterType==='all' || t.type===filterType
    const matchSearch = !search || t.partner.toLowerCase().includes(search.toLowerCase()) || t.desc.toLowerCase().includes(search.toLowerCase())
    return matchEntity && matchType && matchSearch
  })

  const totalUsd = filtered.reduce((sum,t) => sum + t.amountUsd, 0)

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
            <span key={l} style={l==='Transactions' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l])}>{l}</span>
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
            <div style={s.pageTitle}>Transactions</div>
            <div style={s.pageSub}>All entries across Constel Group entities</div>
          </div>
          <button style={s.newBtn} onClick={() => setShowDialog(true)}>
            + New transaction
          </button>
        </div>

        <div style={s.filterBar}>
          <input
            type="text"
            placeholder="Search partner or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={s.searchInput}
          />
          <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={s.filterSelect}>
            <option value="all">All entities</option>
            <option value="sfbc">SFBC</option>
            <option value="constellation">Constellation LLC</option>
            <option value="social">Social Growth</option>
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={s.filterSelect}>
            <option value="all">All types</option>
            <option value="expense">Expense</option>
            <option value="revenue">Revenue</option>
            <option value="transfer">Transfer</option>
            <option value="intercompany">Intercompany</option>
            <option value="passthrough">Pass-through</option>
          </select>
          <div style={s.totalBadge}>
            {filtered.length} entries · <strong>${totalUsd.toLocaleString('en-US',{maximumFractionDigits:0})} USD</strong>
          </div>
        </div>

        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Date</th>
                <th style={s.th}>Partner</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>P&L Category</th>
                <th style={s.th}>Description</th>
                <th style={s.th}>Department</th>
                <th style={s.th}>Company</th>
                <th style={{...s.th, textAlign:'right'}}>Amount</th>
                <th style={{...s.th, textAlign:'right'}}>USD</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.id} style={{...s.tr, background: i%2===0?'#fff':'#fafaf9'}}>
                  <td style={s.td}><span style={s.dateCell}>{t.date}</span></td>
                  <td style={s.td}><span style={s.partnerCell}>{t.partner}</span></td>
                  <td style={s.td}>
                    <span style={{...s.badge, background:typeColors[t.type]?.bg, color:typeColors[t.type]?.color}}>{t.type}</span>
                  </td>
                  <td style={s.td}><span style={s.catCell}>{t.plCat}</span></td>
                  <td style={s.td}><span style={s.descCell}>{t.desc}</span></td>
                  <td style={s.td}><span style={s.deptCell}>{t.dept}</span></td>
                  <td style={s.td}><span style={s.compCell}>{t.company}</span></td>
                  <td style={{...s.td, textAlign:'right'}}><span style={s.amtCell}>{t.amount.toLocaleString()} {t.currency}</span></td>
                  <td style={{...s.td, textAlign:'right'}}><span style={s.usdCell}>${t.amountUsd.toLocaleString()}</span></td>
                  <td style={s.td}>
                    <span style={{...s.badge, background:statusColors[t.status]?.bg, color:statusColors[t.status]?.color}}>{t.status}</span>
                  </td>
                  <td style={s.td}><button style={s.editBtn}>···</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showDialog && <TransactionDialog onClose={() => setShowDialog(false)} />}
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
  newBtn: { background:'#1D9E75', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontFamily:'system-ui,sans-serif', fontSize:'13px', fontWeight:'500', cursor:'pointer' },
  filterBar: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'1rem', flexWrap:'wrap' },
  searchInput: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'0.5px solid #e5e5e5', borderRadius:'8px', padding:'8px 12px', outline:'none', background:'#fff', color:'#111', flex:'1', minWidth:'200px' },
  filterSelect: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'0.5px solid #e5e5e5', borderRadius:'8px', padding:'8px 12px', outline:'none', background:'#fff', color:'#111', cursor:'pointer' },
  totalBadge: { fontSize:'13px', color:'#666', background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'8px', padding:'8px 12px', marginLeft:'auto', whiteSpace:'nowrap' },
  tableWrap: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', overflow:'hidden' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'13px' },
  thead: { background:'#f5f5f3' },
  th: { padding:'10px 12px', textAlign:'left', fontSize:'10px', fontWeight:'500', color:'#888', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'0.5px solid #e5e5e5', whiteSpace:'nowrap' },
  tr: { borderBottom:'0.5px solid #f0f0ee', transition:'background 0.1s' },
  td: { padding:'10px 12px', verticalAlign:'middle', color:'#111' },
  dateCell: { fontSize:'12px', color:'#666', whiteSpace:'nowrap' },
  partnerCell: { fontSize:'13px', fontWeight:'500', color:'#111' },
  catCell: { fontSize:'11px', color:'#666' },
  descCell: { fontSize:'11px', color:'#888', maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' },
  deptCell: { fontSize:'11px', color:'#888' },
  compCell: { fontSize:'11px', color:'#888' },
  amtCell: { fontSize:'13px', fontWeight:'500', color:'#111', whiteSpace:'nowrap' },
  usdCell: { fontSize:'13px', fontWeight:'500', color:'#1D9E75', whiteSpace:'nowrap' },
  badge: { fontSize:'10px', fontWeight:'500', padding:'2px 8px', borderRadius:'20px', textTransform:'capitalize', whiteSpace:'nowrap' },
  editBtn: { background:'none', border:'0.5px solid #e5e5e5', borderRadius:'6px', padding:'4px 8px', cursor:'pointer', color:'#888', fontSize:'14px' },
}