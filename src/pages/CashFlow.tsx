import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'

export default function CashFlow() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [entity, setEntity] = useState('constellation')
  const [period, setPeriod] = useState('2026-Q1')

  const pageMap: Record<string, any> = {
    'Dashboard':'dashboard','Transactions':'transactions',
    'P&L':'pl','Cash Flow':'cashflow','Reports':'reports'
  }

  const accounts = [
    { name:'Raiffeisen Bank (RSD)', company:'Constellation LLC', currency:'RSD', opening: 4250000, closing: 3890000 },
    { name:'Raiffeisen Bank (USD)', company:'Constellation LLC', currency:'USD', opening: 28400, closing: 31200 },
    { name:'Intesa Bank (RSD)', company:'Constellation LLC', currency:'RSD', opening: 1820000, closing: 2140000 },
    { name:'Unicredit Bank (RSD)', company:'Constellation LLC', currency:'RSD', opening: 980000, closing: 750000 },
    { name:'AIK Bank (RSD)', company:'Constellation LLC', currency:'RSD', opening: 540000, closing: 680000 },
    { name:'Truist Bank (USD)', company:'SFBC', currency:'USD', opening: 42000, closing: 38500 },
    { name:'BOA (USD)', company:'SFBC', currency:'USD', opening: 12000, closing: 9800 },
    { name:'WIO Bank (USD)', company:'Social Growth', currency:'USD', opening: 18500, closing: 24300 },
    { name:'WIO Bank (AED)', company:'Social Growth', currency:'AED', opening: 68000, closing: 89000 },
  ]

  const cashFlowData = [
    {
      section: 'Operating Activities',
      color: '#0F6E56',
      bg: '#E1F5EE',
      items: [
        { name:'Revenue received from customers', amount: 243820, type:'in' },
        { name:'Payments to suppliers and employees', amount: -187400, type:'out' },
        { name:'VAT paid', amount: -12400, type:'out' },
        { name:'Other operating receipts', amount: 4200, type:'in' },
      ]
    },
    {
      section: 'Investing Activities',
      color: '#0C447C',
      bg: '#E6F1FB',
      items: [
        { name:'Purchase of equipment and fixed assets', amount: -7500, type:'out' },
        { name:'Proceeds from sale of assets', amount: 0, type:'in' },
      ]
    },
    {
      section: 'Financing Activities',
      color: '#633806',
      bg: '#FAEEDA',
      items: [
        { name:'Loan repayments', amount: -8400, type:'out' },
        { name:'New loans received', amount: 15000, type:'in' },
        { name:'Shareholder distributions', amount: -5000, type:'out' },
        { name:'Intercompany transfers', amount: 0, type:'in' },
      ]
    },
  ]

  const fmt = (n: number, cur: string = 'USD') => {
    if (n === 0) return '—'
    const abs = Math.abs(n).toLocaleString('en-US', {maximumFractionDigits:0})
    return (n < 0 ? '-' : '+') + (cur === 'USD' ? '$' : '') + abs + (cur !== 'USD' ? ' ' + cur : '')
  }

  const fmtAmt = (n: number) => {
    if (n === 0) return '—'
    const abs = Math.abs(n).toLocaleString('en-US', {maximumFractionDigits:0})
    return (n < 0 ? '-$' : '+$') + abs
  }

  const sectionTotal = (items: {amount:number}[]) => items.reduce((s,i) => s+i.amount, 0)
  const netCashFlow = cashFlowData.reduce((s,sec) => s + sectionTotal(sec.items), 0)

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
            <span key={l} style={l==='Cash Flow' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l])}>{l}</span>
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
            <div style={s.pageTitle}>Cash Flow</div>
            <div style={s.pageSub}>Cash position and movement · All amounts in USD</div>
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
            <div style={s.summaryLabel}>Opening balance</div>
            <div style={{...s.summaryValue, color:'#111'}}>$148,490</div>
            <div style={s.summarySub}>All accounts · USD equiv.</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total inflows</div>
            <div style={{...s.summaryValue, color:'#0F6E56'}}>+$263,020</div>
            <div style={s.summarySub}>Operating + financing</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total outflows</div>
            <div style={{...s.summaryValue, color:'#A32D2D'}}>-$220,700</div>
            <div style={s.summarySub}>All categories</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Net cash flow</div>
            <div style={{...s.summaryValue, color: netCashFlow >= 0 ? '#0F6E56' : '#A32D2D'}}>{fmtAmt(netCashFlow)}</div>
            <div style={s.summarySub}>For selected period</div>
          </div>
        </div>

        <div style={s.contentGrid}>
          <div>
            <div style={s.sectionLabel}>Cash flow statement</div>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr style={s.theadRow}>
                    <th style={{...s.th, width:'60%'}}>Item</th>
                    <th style={{...s.th, textAlign:'right'}}>Amount (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlowData.map(sec => (
                    <React.Fragment key={sec.section}>
                      <tr>
                        <td colSpan={2} style={{...s.catCell, borderLeft:`3px solid ${sec.color}`, background:sec.bg, color:sec.color}}>
                          {sec.section.toUpperCase()}
                        </td>
                      </tr>
                      {sec.items.map(item => (
                        <tr key={item.name} style={s.dataRow}>
                          <td style={s.td}>{item.name}</td>
                          <td style={{...s.td, textAlign:'right', fontWeight:'500', color: item.amount > 0 ? '#0F6E56' : item.amount < 0 ? '#A32D2D' : '#888'}}>
                            {fmtAmt(item.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr style={s.subTotalRow}>
                        <td style={s.subTotalCell}>Net {sec.section}</td>
                        <td style={{...s.subTotalCell, textAlign:'right', color: sectionTotal(sec.items) >= 0 ? '#0F6E56' : '#A32D2D'}}>
                          {fmtAmt(sectionTotal(sec.items))}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                  <tr style={s.netRow}>
                    <td style={s.netCell}>NET CHANGE IN CASH</td>
                    <td style={{...s.netCell, textAlign:'right', color: netCashFlow >= 0 ? '#5DCAA5' : '#F09595'}}>
                      {fmtAmt(netCashFlow)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div style={s.sectionLabel}>Account balances</div>
            <div style={s.accountsWrap}>
              {accounts.map(acc => {
                const diff = acc.closing - acc.opening
                return (
                  <div key={acc.name} style={s.accountCard}>
                    <div style={s.accountHeader}>
                      <div>
                        <div style={s.accountName}>{acc.name}</div>
                        <div style={s.accountCompany}>{acc.company}</div>
                      </div>
                      <span style={{...s.currBadge, background: acc.currency==='USD'?'#E6F1FB': acc.currency==='RSD'?'#FAEEDA':'#FBEAF0', color: acc.currency==='USD'?'#0C447C': acc.currency==='RSD'?'#633806':'#72243E'}}>{acc.currency}</span>
                    </div>
                    <div style={s.accountBalances}>
                      <div>
                        <div style={s.balLabel}>Opening</div>
                        <div style={s.balValue}>{acc.opening.toLocaleString()}</div>
                      </div>
                      <div style={{fontSize:'14px',color:'#aaa',alignSelf:'flex-end',paddingBottom:'2px'}}>→</div>
                      <div>
                        <div style={s.balLabel}>Closing</div>
                        <div style={s.balValue}>{acc.closing.toLocaleString()}</div>
                      </div>
                      <div style={{...s.diffBadge, background: diff >= 0 ? '#E1F5EE' : '#FCEBEB', color: diff >= 0 ? '#085041' : '#A32D2D'}}>
                        {diff >= 0 ? '+' : ''}{diff.toLocaleString()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
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
  navSignout: { background:'none', border:'0.5px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.5)', fontFamily:'system-ui,sans-serif', fontSize:'11px', padding:'5px 12px', borderRadius:'6px', cursor:'pointer' },
  body: { padding:'2rem 1.5rem' },
  pageHeader: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1.5rem' },
  pageTitle: { fontFamily:'Georgia,serif', fontSize:'24px', fontWeight:'400', color:'#111', marginBottom:'4px' },
  pageSub: { fontSize:'13px', color:'#888' },
  filterSelect: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'0.5px solid #e5e5e5', borderRadius:'8px', padding:'8px 12px', outline:'none', background:'#fff', color:'#111', cursor:'pointer' },
  exportBtn: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'0.5px solid #e5e5e5', borderRadius:'8px', padding:'8px 16px', background:'#0a1628', color:'#fff', cursor:'pointer' },
  summaryGrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'1.5rem' },
  summaryCard: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', padding:'1rem 1.25rem' },
  summaryLabel: { fontSize:'11px', color:'#888', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' },
  summaryValue: { fontSize:'22px', fontWeight:'500' },
  summarySub: { fontSize:'11px', color:'#888', marginTop:'4px' },
  contentGrid: { display:'grid', gridTemplateColumns:'1fr 340px', gap:'16px' },
  sectionLabel: { fontSize:'11px', fontWeight:'500', color:'#888', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'10px' },
  tableWrap: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'12px', overflow:'hidden' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'13px' },
  theadRow: { background:'#0a1628' },
  th: { padding:'10px 16px', textAlign:'left', fontSize:'10px', fontWeight:'500', color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.1em' },
  catCell: { padding:'8px 16px', fontSize:'11px', fontWeight:'500', letterSpacing:'0.1em' },
  dataRow: { borderBottom:'0.5px solid #f0f0ee' },
  td: { padding:'9px 16px', color:'#333', fontSize:'13px' },
  subTotalRow: { background:'#f5f5f3', borderTop:'0.5px solid #e5e5e5' },
  subTotalCell: { padding:'8px 16px', fontSize:'12px', fontWeight:'500', color:'#666' },
  netRow: { background:'#0a1628' },
  netCell: { padding:'14px 16px', fontSize:'14px', fontWeight:'500', color:'#fff' },
  accountsWrap: { display:'flex', flexDirection:'column', gap:'8px' },
  accountCard: { background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:'10px', padding:'12px 14px' },
  accountHeader: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'10px' },
  accountName: { fontSize:'13px', fontWeight:'500', color:'#111' },
  accountCompany: { fontSize:'11px', color:'#888', marginTop:'2px' },
  currBadge: { fontSize:'10px', fontWeight:'500', padding:'2px 8px', borderRadius:'20px' },
  accountBalances: { display:'flex', alignItems:'center', gap:'10px' },
  balLabel: { fontSize:'10px', color:'#888', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'3px' },
  balValue: { fontSize:'13px', fontWeight:'500', color:'#111' },
  diffBadge: { fontSize:'11px', fontWeight:'500', padding:'3px 8px', borderRadius:'20px', marginLeft:'auto' },
}