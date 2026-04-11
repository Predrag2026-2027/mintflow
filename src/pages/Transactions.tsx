import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'
import { supabase } from '../supabase'
import TransactionDialog from '../components/TransactionDialog'

export default function Transactions() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [showDialog, setShowDialog] = useState(false)
  const [editTransaction, setEditTransaction] = useState<any>(null)
  const [showMenu, setShowMenu] = useState<string | null>(null)
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch] = useState('')
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const pageMap: Record<string, any> = {
    'Dashboard':'dashboard','Transactions':'transactions',
    'P&L':'pl','Cash Flow':'cashflow','Reports':'reports'
  }

  const fetchTransactions = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select(`*, companies!transactions_company_id_fkey(name), banks!transactions_bank_id_fkey(name), partners!transactions_partner_id_fkey(name)`)
      .order('transaction_date', { ascending: false })
    if (!error && data) setTransactions(data)
    setLoading(false)
  }

  const deleteTransaction = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return
    await supabase.from('transactions').delete().eq('id', id)
    fetchTransactions()
    setShowMenu(null)
  }

  useEffect(() => { fetchTransactions() }, [])

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

  const filtered = transactions.filter(t => {
    const companyName = t.companies?.name || ''
    const partnerName = t.partners?.name || ''
    const matchEntity = filterEntity==='all' || companyName.toLowerCase().includes(filterEntity)
    const matchType = filterType==='all' || t.type===filterType
    const matchSearch = !search || partnerName.toLowerCase().includes(search.toLowerCase()) || (t.note||'').toLowerCase().includes(search.toLowerCase())
    return matchEntity && matchType && matchSearch
  })

  const totalUsd = filtered.reduce((sum,t) => sum + (t.amount_usd||0), 0)

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
          <button style={s.newBtn} onClick={() => setShowDialog(true)}>+ New transaction</button>
        </div>

        <div style={s.filterBar}>
          <input type="text" placeholder="Search partner or description..." value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput}/>
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
          <div style={s.totalBadge}>{filtered.length} entries · <strong>${totalUsd.toLocaleString('en-US',{maximumFractionDigits:0})} USD</strong></div>
        </div>

        <div style={s.tableWrap}>
          {loading ? (
            <div style={{padding:'3rem', textAlign:'center', color:'#888', fontSize:'14px'}}>Loading transactions...</div>
          ) : filtered.length === 0 ? (
            <div style={{padding:'3rem', textAlign:'center'}}>
              <div style={{fontSize:'32px', marginBottom:'12px'}}>📭</div>
              <div style={{fontSize:'15px', fontWeight:'500', color:'#111', marginBottom:'6px'}}>No transactions yet</div>
              <div style={{fontSize:'13px', color:'#888', marginBottom:'20px'}}>Click "+ New transaction" to add your first entry.</div>
              <button style={s.newBtn} onClick={() => setShowDialog(true)}>+ New transaction</button>
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Partner</th>
                  <th style={s.th}>Type</th>
                  <th style={s.th}>P&L Category</th>
                  <th style={s.th}>Note</th>
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
                    <td style={s.td}><span style={s.dateCell}>{t.transaction_date}</span></td>
                    <td style={s.td}><span style={s.partnerCell}>{t.partners?.name || '—'}</span></td>
                    <td style={s.td}><span style={{...s.badge, background:typeColors[t.type]?.bg, color:typeColors[t.type]?.color}}>{t.type}</span></td>
                    <td style={s.td}><span style={s.catCell}>{t.revenue_stream || '—'}</span></td>
                    <td style={s.td}><span style={s.descCell}>{t.note || '—'}</span></td>
                    <td style={s.td}><span style={s.compCell}>{t.companies?.name || '—'}</span></td>
                    <td style={{...s.td, textAlign:'right'}}><span style={s.amtCell}>{(t.amount||0).toLocaleString()} {t.currency}</span></td>
                    <td style={{...s.td, textAlign:'right'}}><span style={s.usdCell}>${(t.amount_usd||0).toLocaleString()}</span></td>
                    <td style={s.td}><span style={{...s.badge, background:statusColors[t.status]?.bg, color:statusColors[t.status]?.color}}>{t.status}</span></td>
                    <td style={s.td}>
                      <div style={{position:'relative'}}>
                        <button style={s.editBtn} onClick={() => setShowMenu(showMenu===t.id ? null : t.id)}>···</button>
                        {showMenu===t.id && (
                          <div style={s.contextMenu}>
                            <div style={s.contextItem} onClick={() => { setEditTransaction(t); setShowMenu(null) }}>Edit</div>
                            <div style={{...s.contextItem, color:'#A32D2D'}} onClick={() => deleteTransaction(t.id)}>Delete</div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {(showDialog || editTransaction) && (
        <TransactionDialog
          onClose={() => { setShowDialog(false); setEditTransaction(null); fetchTransactions() }}
          transaction={editTransaction}
        />
      )}
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
  tr: { borderBottom:'0.5px solid #f0f0ee' },
  td: { padding:'10px 12px', verticalAlign:'middle', color:'#111' },
  dateCell: { fontSize:'12px', color:'#666', whiteSpace:'nowrap' },
  partnerCell: { fontSize:'13px', fontWeight:'500', color:'#111' },
  catCell: { fontSize:'11px', color:'#666' },
  descCell: { fontSize:'11px', color:'#888', maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' },
  compCell: { fontSize:'11px', color:'#888' },
  amtCell: { fontSize:'13px', fontWeight:'500', color:'#111', whiteSpace:'nowrap' },
  usdCell: { fontSize:'13px', fontWeight:'500', color:'#1D9E75', whiteSpace:'nowrap' },
  badge: { fontSize:'10px', fontWeight:'500', padding:'2px 8px', borderRadius:'20px', textTransform:'capitalize', whiteSpace:'nowrap' },
  editBtn: { background:'none', border:'0.5px solid #e5e5e5', borderRadius:'6px', padding:'4px 8px', cursor:'pointer', color:'#888', fontSize:'14px' },
  contextMenu: { position:'absolute', right:0, top:'100%', background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'8px', zIndex:100, minWidth:'120px', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' },
  contextItem: { padding:'8px 14px', fontSize:'13px', color:'#111', cursor:'pointer', borderBottom:'0.5px solid #f0f0ee' },
}