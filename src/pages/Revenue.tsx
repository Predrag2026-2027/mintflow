import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { fmtUSD } from '../utils/formatters'

const BRANDS = ['Kicksta', 'Flock', 'Nitreo', 'Kenji', 'Upleap', 'EngagementBoost', 'Upgram', 'SocialFollow', 'Aimfox']
const CHARGEBEE_SITES = ['kicksta', 'aimfox', 'flocks', 'nitreo', 'kenji', 'upleap', 'engagementboostapp', 'upgram', 'stimsocial']

const PROCESSOR_LABELS: Record<string, string> = { stripe_uae: 'Stripe UAE', stripe_us: 'Stripe US', braintree: 'Braintree', paypal: 'PayPal', wire: 'Wire', other: 'Other' }
const PROCESSOR_COLORS: Record<string, { bg: string; color: string }> = {
  stripe_uae: { bg: 'rgba(99,91,255,0.15)', color: '#9D97FF' }, stripe_us: { bg: 'rgba(99,91,255,0.10)', color: '#7B75FF' },
  braintree: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' }, paypal: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
  wire: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' }, other: { bg: 'rgba(255,255,255,0.06)', color: '#7A9BB8' },
}
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' }, partial: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
  collected: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' }, cancelled: { bg: 'rgba(255,91,90,0.13)', color: '#FF5B5A' },
}
const STREAM_COLORS: Record<string, { bg: string; color: string }> = {
  aimfox: { bg: 'rgba(99,91,255,0.15)', color: '#9D97FF' }, social_growth: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
  other: { bg: 'rgba(255,255,255,0.06)', color: '#7A9BB8' },
}
const COLL_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  unmatched: { bg: 'rgba(245,166,35,0.13)', color: '#F5A623' }, partial: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
  matched: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
}

function getYTDMonths(): string[] {
  const now = new Date()
  const months: string[] = []
  for (let m = 0; m <= now.getMonth(); m++) {
    months.push(`${now.getFullYear()}-${String(m + 1).padStart(2, '0')}`)
  }
  return months
}

function formatMonth(m: string) {
  const [y, mo] = m.split('-')
  return new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' })
}

export default function Revenue() {
  const [subTab, setSubTab] = useState<'entries' | 'collections'>('entries')
  const [showMenu, setShowMenu] = useState<string | null>(null)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [showEntryDialog, setShowEntryDialog] = useState(false)
  const [showCollectionDialog, setShowCollectionDialog] = useState(false)
  const [showReconcileDialog, setShowReconcileDialog] = useState<any>(null)
  const [editEntry, setEditEntry] = useState<any>(null)
  const [editCollection, setEditCollection] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [filterStream, setFilterStream] = useState('all')
  const [filterBrand, setFilterBrand] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [entries, setEntries] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEntries = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('v_revenue_entry_status').select('*').order('period_month', { ascending: false })
    if (!error && data) setEntries(data)
    setLoading(false)
  }
  const fetchCollections = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('revenue_collections')
      .select('*, companies(name), banks(name)').order('transaction_date', { ascending: false })
    if (!error && data) setCollections(data)
    setLoading(false)
  }
  const fetchAll = () => { fetchEntries(); fetchCollections() }
  useEffect(() => { fetchAll() }, []) // eslint-disable-line

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this revenue entry?')) return
    await supabase.from('revenue_entries').delete().eq('id', id)
    fetchEntries(); setShowMenu(null)
  }
  const deleteCollection = async (id: string) => {
    if (!window.confirm('Delete this collection?')) return
    await supabase.from('revenue_collections').delete().eq('id', id)
    fetchCollections(); setShowMenu(null)
  }

  const filteredEntries = entries.filter(e =>
    (filterStream === 'all' || e.revenue_stream === filterStream) &&
    (filterBrand === 'all' || e.brand === filterBrand) &&
    (filterStatus === 'all' || e.calculated_status === filterStatus) &&
    (!search || (e.brand||'').toLowerCase().includes(search.toLowerCase()) ||
      (e.notes||'').toLowerCase().includes(search.toLowerCase()) ||
      (e.invoice_ref||'').toLowerCase().includes(search.toLowerCase()))
  )
  const filteredCollections = collections.filter(c =>
    (filterStatus === 'all' || c.status === filterStatus) &&
    (!search || (c.reference||'').toLowerCase().includes(search.toLowerCase()) ||
      (c.notes||'').toLowerCase().includes(search.toLowerCase()))
  )

  const totalOpen = entries.filter(e => e.calculated_status === 'open').reduce((s,e) => s+(e.amount_usd||0), 0)
  const totalPartialRemaining = entries.filter(e => e.calculated_status === 'partial').reduce((s,e) => s+(e.remaining_usd||0), 0)
  const totalCollected = entries.filter(e => e.calculated_status === 'collected').reduce((s,e) => s+(e.amount_usd||0), 0)
  const unmatchedCount = collections.filter(c => c.status === 'unmatched').length

  const brandTotals = BRANDS.map(brand => ({
    brand, stream: brand === 'Aimfox' ? 'aimfox' : 'social_growth',
    total: entries.filter(e => e.brand === brand).reduce((s,e) => s+(e.amount_usd||0), 0),
    collected: entries.filter(e => e.brand === brand).reduce((s,e) => s+(e.collected_usd||0), 0),
    count: entries.filter(e => e.brand === brand).length,
  })).filter(b => b.count > 0).sort((a,b) => b.total-a.total)
  const maxBrand = brandTotals[0]?.total || 1

  return (
    <div style={s.root} onClick={() => setShowMenu(null)}>
      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Revenue</div>
            <div style={s.pageSub}>Receivables and processor collections by brand and stream</div>
          </div>
          <div style={s.btnGroup}>
            <button style={{ ...s.btnSync, ...(showSyncPanel ? s.btnSyncActive : {}) }} onClick={() => setShowSyncPanel(!showSyncPanel)}>🔄 Sync data</button>
            <button style={s.btnEntry} onClick={() => { setEditEntry(null); setShowEntryDialog(true) }}>📈 New entry</button>
            <button style={s.btnCollection} onClick={() => { setEditCollection(null); setShowCollectionDialog(true) }}>💰 New collection</button>
          </div>
        </div>

        {showSyncPanel && <SyncPanel onDone={() => { setShowSyncPanel(false); fetchCollections() }} />}

        <div style={s.summaryRow}>
          <div style={{ ...s.summaryCard, borderTop: '2px solid #F5A623' }}>
            <div style={s.summaryLabel}>Open (uncollected)</div>
            <div style={{ ...s.summaryVal, color: '#F5A623' }}>{fmtUSD(totalOpen)}</div>
            <div style={s.summarySub}>{entries.filter(e => e.calculated_status === 'open').length} entries pending</div>
          </div>
          <div style={{ ...s.summaryCard, borderTop: '2px solid #4EA8FF' }}>
            <div style={s.summaryLabel}>Partially collected</div>
            <div style={{ ...s.summaryVal, color: '#4EA8FF' }}>{fmtUSD(totalPartialRemaining)}</div>
            <div style={s.summarySub}>{entries.filter(e => e.calculated_status === 'partial').length} entries · remaining</div>
          </div>
          <div style={{ ...s.summaryCard, borderTop: '2px solid #00D47E' }}>
            <div style={s.summaryLabel}>Collected</div>
            <div style={{ ...s.summaryVal, color: '#00D47E' }}>{fmtUSD(totalCollected)}</div>
            <div style={s.summarySub}>{entries.filter(e => e.calculated_status === 'collected').length} entries closed</div>
          </div>
          <div style={{ ...s.summaryCard, ...(unmatchedCount > 0 ? s.summaryCardWarn : {}), borderTop: `2px solid ${unmatchedCount > 0 ? '#F5A623' : 'rgba(255,255,255,0.1)'}` }}>
            <div style={s.summaryLabel}>Unmatched collections</div>
            <div style={{ ...s.summaryVal, ...(unmatchedCount > 0 ? { color: '#F5A623' } : {}) }}>{unmatchedCount}</div>
            <div style={s.summarySub}>{unmatchedCount > 0 ? 'Processor receipts not matched' : 'All collections matched'}</div>
          </div>
        </div>

        {brandTotals.length > 0 && (
          <div style={s.brandWidget}>
            <div style={s.brandWidgetTitle}>Brand breakdown · {entries.length} total entries</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
              {brandTotals.map(b => (
                <div key={b.brand} style={{ ...s.brandCard, ...(filterBrand === b.brand ? s.brandCardActive : {}) }} onClick={() => setFilterBrand(filterBrand === b.brand ? 'all' : b.brand)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#DCE9F6' }}>{b.brand}</span>
                    <span style={{ ...s.badge, ...STREAM_COLORS[b.stream] }}>{b.stream === 'aimfox' ? 'AF' : 'SG'}</span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#00D47E', marginBottom: '4px' }}>{fmtUSD(b.total)}</div>
                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden', marginBottom: '5px' }}>
                    <div style={{ height: '100%', width: `${(b.total/maxBrand)*100}%`, background: b.stream === 'aimfox' ? '#9D97FF' : '#00D47E', borderRadius: '2px' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: '#7A9BB8' }}>{b.count} entr{b.count>1?'ies':'y'} · {fmtUSD(b.collected)} collected</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={s.subTabBar}>
          <button style={{ ...s.subTab, ...(subTab === 'entries' ? s.subTabActive : {}) }} onClick={() => setSubTab('entries')}>
            Entries — receivables <span style={{ ...s.subTabCount, ...(subTab==='entries'?{background:'rgba(157,151,255,0.2)',color:'#9D97FF'}:{}) }}>{entries.length}</span>
          </button>
          <button style={{ ...s.subTab, ...(subTab === 'collections' ? s.subTabActive : {}) }} onClick={() => setSubTab('collections')}>
            Collections — processor payouts <span style={{ ...s.subTabCount, ...(subTab==='collections'?{background:'rgba(157,151,255,0.2)',color:'#9D97FF'}:{}) }}>{collections.length}</span>
          </button>
        </div>

        <div style={s.filterBar}>
          <input type="text" placeholder={subTab==='entries'?'Search brand, ref, notes...':'Search reference, notes...'} value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput} />
          {subTab === 'entries' && (<>
            <select value={filterStream} onChange={e => setFilterStream(e.target.value)} style={s.filterSelect}>
              <option value="all">All streams</option><option value="aimfox">Aimfox</option><option value="social_growth">Social Growth</option><option value="other">Other</option>
            </select>
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={s.filterSelect}>
              <option value="all">All brands</option>{BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </>)}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.filterSelect}>
            <option value="all">All statuses</option>
            {subTab === 'entries' ? <><option value="open">Open</option><option value="partial">Partial</option><option value="collected">Collected</option><option value="cancelled">Cancelled</option></>
              : <><option value="unmatched">Unmatched</option><option value="partial">Partial</option><option value="matched">Matched</option></>}
          </select>
          <div style={s.totalBadge}>
            {subTab === 'entries'
              ? <>{filteredEntries.length} entries · <strong>{fmtUSD(filteredEntries.reduce((s,e) => s+(e.amount_usd||0),0))} USD</strong></>
              : <>{filteredCollections.length} collections · <strong>{fmtUSD(filteredCollections.reduce((s,c) => s+(c.amount_usd||0),0))} USD</strong></>}
          </div>
        </div>

        {subTab === 'entries' && (
          <div style={s.tableWrap}>
            {loading ? <div style={s.emptyState}><div style={{ fontSize:'14px',color:'#7A9BB8' }}>Loading...</div></div>
            : filteredEntries.length === 0 ? (
              <div style={s.emptyState}>
                <div style={{ fontSize:'32px',marginBottom:'12px' }}>📈</div>
                <div style={{ fontSize:'15px',fontWeight:'500',color:'#DCE9F6',marginBottom:'6px' }}>No revenue entries yet</div>
                <div style={{ fontSize:'13px',color:'#7A9BB8',marginBottom:'20px' }}>Add your first revenue entry manually.</div>
                <button style={s.btnEntry} onClick={() => { setEditEntry(null); setShowEntryDialog(true) }}>📈 New entry</button>
              </div>
            ) : (
              <table style={s.table}>
                <thead><tr style={s.thead}>
                  <th style={s.th}>Period</th><th style={s.th}>Brand</th><th style={s.th}>Stream</th><th style={s.th}>Source</th><th style={s.th}>Ref</th>
                  <th style={{ ...s.th, textAlign:'right' as const }}>Amount USD</th><th style={{ ...s.th, textAlign:'right' as const }}>Collected</th>
                  <th style={{ ...s.th, textAlign:'right' as const }}>Remaining</th><th style={s.th}>Status</th><th style={s.th}></th>
                </tr></thead>
                <tbody>
                  {filteredEntries.map((e,i) => (
                    <tr key={e.id} style={{ ...s.tr, background: i%2===0?'#0D1B2C':'#111F30' }}>
                      <td style={s.td}><span style={s.dateCell}>{e.period_month}</span></td>
                      <td style={s.td}><span style={{ fontSize:'13px',fontWeight:'600',color:'#DCE9F6' }}>{e.brand}</span></td>
                      <td style={s.td}><span style={{ ...s.badge, ...(STREAM_COLORS[e.revenue_stream]||STREAM_COLORS.other) }}>{e.revenue_stream==='aimfox'?'Aimfox':e.revenue_stream==='social_growth'?'Social Growth':'Other'}</span></td>
                      <td style={s.td}><span style={{ ...s.badge, background:'rgba(255,255,255,0.06)',color:'#7A9BB8' }}>{e.source}</span></td>
                      <td style={s.td}><span style={s.monoCell}>{e.invoice_ref||'—'}</span></td>
                      <td style={{ ...s.td, textAlign:'right' as const }}><span style={s.amtCell}>{fmtUSD(e.amount_usd||0)}</span></td>
                      <td style={{ ...s.td, textAlign:'right' as const }}><span style={{ ...s.amtCell,color:'#00D47E' }}>{fmtUSD(e.collected_usd||0)}</span></td>
                      <td style={{ ...s.td, textAlign:'right' as const }}><span style={{ ...s.amtCell,color:(e.remaining_usd||0)>0.01?'#F5A623':'#7A9BB8' }}>{fmtUSD(e.remaining_usd||0)}</span></td>
                      <td style={s.td}><span style={{ ...s.badge, ...(STATUS_COLORS[e.calculated_status]||{}) }}>{e.calculated_status}</span></td>
                      <td style={s.td} onClick={ev => ev.stopPropagation()}>
                        <div style={{ position:'relative' }}>
                          <button style={s.editBtn} onClick={() => setShowMenu(showMenu===e.id?null:e.id)}>···</button>
                          {showMenu===e.id && <div style={s.contextMenu}>
                            <div style={s.contextItem} onClick={() => { setEditEntry(e); setShowEntryDialog(true); setShowMenu(null) }}>✏️ Edit</div>
                            <div style={s.contextItem} onClick={() => { setShowReconcileDialog(e); setShowMenu(null) }}>🔗 Match collection</div>
                            <div style={{ ...s.contextItem,color:'#FF5B5A' }} onClick={() => deleteEntry(e.id)}>🗑 Delete</div>
                          </div>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {subTab === 'collections' && (
          <div style={s.tableWrap}>
            {loading ? <div style={s.emptyState}><div style={{ fontSize:'14px',color:'#7A9BB8' }}>Loading...</div></div>
            : filteredCollections.length === 0 ? (
              <div style={s.emptyState}>
                <div style={{ fontSize:'32px',marginBottom:'12px' }}>💰</div>
                <div style={{ fontSize:'15px',fontWeight:'500',color:'#DCE9F6',marginBottom:'6px' }}>No collections yet</div>
                <div style={{ fontSize:'13px',color:'#7A9BB8',marginBottom:'20px' }}>Use 🔄 Sync data to import from Chargebee.</div>
                <button style={s.btnCollection} onClick={() => { setEditCollection(null); setShowCollectionDialog(true) }}>💰 New collection</button>
              </div>
            ) : (
              <table style={s.table}>
                <thead><tr style={s.thead}>
                  <th style={s.th}>Date</th><th style={s.th}>Processor</th><th style={s.th}>Brand</th><th style={s.th}>Reference</th>
                  <th style={{ ...s.th, textAlign:'right' as const }}>Amount</th><th style={{ ...s.th, textAlign:'right' as const }}>USD</th>
                  <th style={s.th}>Status</th><th style={s.th}></th>
                </tr></thead>
                <tbody>
                  {filteredCollections.map((c,i) => {
                    let brandLabel = ''
                    try { brandLabel = JSON.parse(c.notes||'{}').brand||'' } catch {}
                    const procKey = c.processor?.startsWith('chargebee_') ? 'braintree' : c.processor
                    return (
                      <tr key={c.id} style={{ ...s.tr, background: i%2===0?'#0D1B2C':'#111F30' }}>
                        <td style={s.td}><span style={s.dateCell}>{(c.transaction_date||'').slice(0,10)}</span></td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, ...(PROCESSOR_COLORS[procKey]||PROCESSOR_COLORS.other) }}>
                            {c.processor?.startsWith('chargebee_') ? `CB · ${c.processor.replace('chargebee_','')}` : (PROCESSOR_LABELS[c.processor]||c.processor)}
                          </span>
                        </td>
                        <td style={s.td}>
                          {brandLabel ? <span style={{ ...s.badge, ...STREAM_COLORS[brandLabel==='Aimfox'?'aimfox':'social_growth'] }}>{brandLabel}</span>
                            : <span style={{ color:'rgba(255,255,255,0.20)',fontSize:'12px' }}>—</span>}
                        </td>
                        <td style={s.td}><span style={s.monoCell}>{(c.reference||'—').slice(0,24)}</span></td>
                        <td style={{ ...s.td, textAlign:'right' as const }}><span style={s.amtCell}>{(c.amount||0).toLocaleString()} {c.currency}</span></td>
                        <td style={{ ...s.td, textAlign:'right' as const }}>
                          <span style={{ ...s.amtCell, color:(c.amount_usd||0)<0?'#FF5B5A':'#00D47E' }}>{fmtUSD(c.amount_usd||0)}</span>
                        </td>
                        <td style={s.td}><span style={{ ...s.badge, ...(COLL_STATUS_COLORS[c.status]||{}) }}>{c.status}</span></td>
                        <td style={s.td} onClick={ev => ev.stopPropagation()}>
                          <div style={{ position:'relative' }}>
                            <button style={s.editBtn} onClick={() => setShowMenu(showMenu===c.id?null:c.id)}>···</button>
                            {showMenu===c.id && <div style={s.contextMenu}>
                              <div style={s.contextItem} onClick={() => { setEditCollection(c); setShowCollectionDialog(true); setShowMenu(null) }}>✏️ Edit</div>
                              <div style={{ ...s.contextItem,color:'#FF5B5A' }} onClick={() => deleteCollection(c.id)}>🗑 Delete</div>
                            </div>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {showEntryDialog && <RevenueEntryDialog entry={editEntry} onClose={() => { setShowEntryDialog(false); setEditEntry(null) }} onSaved={() => { setShowEntryDialog(false); setEditEntry(null); fetchEntries() }} />}
      {showCollectionDialog && <RevenueCollectionDialog collection={editCollection} onClose={() => { setShowCollectionDialog(false); setEditCollection(null) }} onSaved={() => { setShowCollectionDialog(false); setEditCollection(null); fetchCollections() }} />}
      {showReconcileDialog && <RevenueReconcileDialog entry={showReconcileDialog} onClose={() => setShowReconcileDialog(null)} onSaved={() => { setShowReconcileDialog(null); fetchAll() }} />}
    </div>
  )
}

// ── Sync Panel ─────────────────────────────────────────────
function SyncPanel({ onDone }: { onDone: () => void }) {
  const ytdMonths = getYTDMonths()
  const [selectedMonths, setSelectedMonths] = useState<string[]>([ytdMonths[ytdMonths.length-1]])
  const [selectedSite, setSelectedSite] = useState<string>('all')
  const [syncing, setSyncing] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const toggleMonth = (m: string) => setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x!==m) : [...prev, m])
  const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://jkcuwfprfiasljpfglez.supabase.co'

  const runSync = async () => {
    if (selectedMonths.length === 0) return
    setSyncing(true); setResults([])
    const sitesToSync = selectedSite === 'all' ? CHARGEBEE_SITES : [selectedSite]
    const jobs: { site: string; month: string }[] = []
    for (const month of [...selectedMonths].sort()) {
      for (const site of sitesToSync) { jobs.push({ site, month }) }
    }
    setProgress({ done: 0, total: jobs.length })
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token || ''

    for (let i = 0; i < jobs.length; i++) {
      const { site, month } = jobs[i]
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/sync-chargebee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': token },
          body: JSON.stringify({ site, month }),
        })
        const data = await resp.json()
        setResults(prev => [...prev, data.results?.[0] || { site, month, status: 'error', error: data.error || 'Unknown' }])
      } catch (err: any) {
        setResults(prev => [...prev, { site, month, status: 'error', error: err.message }])
      }
      setProgress({ done: i+1, total: jobs.length })
    }
    setSyncing(false)
  }

  const totalCreated = results.reduce((s,r) => s+(r.created||0), 0)
  const errorCount = results.filter(r => r.status === 'error').length
  const totalJobs = selectedMonths.length * (selectedSite === 'all' ? CHARGEBEE_SITES.length : 1)

  return (
    <div style={sp.panel}>
      <div style={sp.header}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <span style={{ fontSize:'18px' }}>🔄</span>
          <div><div style={sp.title}>Chargebee Sync</div><div style={sp.sub}>Pull transaction data from Chargebee into Revenue Collections</div></div>
        </div>
        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
          {results.length > 0 && !syncing && (
            <span style={{ fontSize:'12px', color: totalCreated>0?'#00D47E':'#7A9BB8' }}>
              {totalCreated>0?`✓ ${totalCreated} new records`:'✓ All up to date'}
              {errorCount>0 && <span style={{ color:'#FF5B5A' }}> · {errorCount} errors</span>}
            </span>
          )}
          {!syncing && results.length > 0 && <button style={sp.doneBtn} onClick={onDone}>Done ✓</button>}
        </div>
      </div>
      <div style={sp.body}>
        <div style={sp.section}>
          <div style={sp.sectionLabel}>
            Months
            <button style={sp.linkBtn} onClick={() => setSelectedMonths([...ytdMonths])}>All</button>
            <button style={sp.linkBtn} onClick={() => setSelectedMonths([])}>Clear</button>
          </div>
          <div style={sp.monthGrid}>
            {ytdMonths.map(m => (
              <button key={m} style={{ ...sp.monthBtn, ...(selectedMonths.includes(m)?sp.monthBtnActive:{}) }} onClick={() => toggleMonth(m)} disabled={syncing}>
                {formatMonth(m)}
              </button>
            ))}
          </div>
        </div>
        <div style={sp.section}>
          <div style={sp.sectionLabel}>Chargebee site</div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' as const }}>
            <button style={{ ...sp.siteBtn, ...(selectedSite==='all'?sp.siteBtnActive:{}) }} onClick={() => setSelectedSite('all')} disabled={syncing}>All sites ({CHARGEBEE_SITES.length})</button>
            {CHARGEBEE_SITES.map(site => (
              <button key={site} style={{ ...sp.siteBtn, ...(selectedSite===site?sp.siteBtnActive:{}) }} onClick={() => setSelectedSite(site)} disabled={syncing}>{site}</button>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <button style={{ ...sp.runBtn, ...(syncing||selectedMonths.length===0?sp.runBtnDisabled:{}) }} onClick={runSync} disabled={syncing||selectedMonths.length===0}>
            {syncing ? '⟳ Syncing...' : `▶ Run sync · ${totalJobs} job${totalJobs!==1?'s':''}`}
          </button>
          {!syncing && selectedMonths.length > 0 && (
            <span style={{ fontSize:'11px', color:'#7A9BB8' }}>{selectedMonths.length} month{selectedMonths.length>1?'s':''} × {selectedSite==='all'?CHARGEBEE_SITES.length:1} site{selectedSite!=='all'?'':'s'}</span>
          )}
        </div>
        {progress && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
              <span style={{ fontSize:'11px', color:'#7A9BB8' }}>{syncing?`Processing ${progress.done} / ${progress.total}...`:`✓ Completed ${progress.done} / ${progress.total}`}</span>
              <span style={{ fontSize:'11px', color:'#7A9BB8' }}>{Math.round((progress.done/progress.total)*100)}%</span>
            </div>
            <div style={sp.progressTrack}><div style={{ ...sp.progressBar, width:`${(progress.done/progress.total)*100}%` }} /></div>
          </div>
        )}
        {results.length > 0 && (
          <div style={sp.resultsLog}>
            {results.map((r,i) => (
              <div key={i} style={sp.resultRow}>
                <span style={{ ...sp.resultDot, background: r.status==='success'?'#00D47E':r.status==='skipped'?'#7A9BB8':'#FF5B5A' }} />
                <span style={{ fontSize:'12px', color:'#DCE9F6', minWidth:'110px' }}>{r.site}</span>
                <span style={{ fontSize:'11px', color:'#7A9BB8', minWidth:'65px' }}>{r.month}</span>
                {r.status==='success' && <span style={{ fontSize:'11px', color:'#7A9BB8' }}>fetched <strong style={{ color:'#DCE9F6' }}>{r.fetched}</strong> · created <strong style={{ color:'#00D47E' }}>{r.created}</strong> · skipped {r.skipped}</span>}
                {r.status==='skipped' && <span style={{ fontSize:'11px', color:'#7A9BB8' }}>{r.reason}</span>}
                {r.status==='error' && <span style={{ fontSize:'11px', color:'#FF5B5A' }}>{r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RevenueEntryDialog({ entry, onClose }: any) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#0D1B2C', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', padding:'2.5rem', width:'520px', textAlign:'center' as const }}>
        <div style={{ fontSize:'36px', marginBottom:'14px' }}>📈</div>
        <div style={{ fontSize:'18px', fontWeight:'500', color:'#DCE9F6', marginBottom:'8px' }}>Revenue Entry</div>
        <div style={{ fontSize:'13px', color:'#7A9BB8', marginBottom:'8px' }}>{entry?'Edit entry':'New entry'}</div>
        <div style={{ fontSize:'12px', color:'rgba(157,151,255,0.8)', background:'rgba(157,151,255,0.08)', border:'1px solid rgba(157,151,255,0.2)', borderRadius:'8px', padding:'10px 16px', marginBottom:'24px' }}>Step 3 — coming soon</div>
        <button onClick={onClose} style={{ background:'#9D97FF', color:'#060E1A', border:'none', borderRadius:'8px', padding:'9px 24px', cursor:'pointer', fontFamily:'system-ui,sans-serif', fontSize:'13px', fontWeight:'600' }}>Close</button>
      </div>
    </div>
  )
}
function RevenueCollectionDialog({ collection, onClose }: any) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#0D1B2C', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', padding:'2.5rem', width:'520px', textAlign:'center' as const }}>
        <div style={{ fontSize:'36px', marginBottom:'14px' }}>💰</div>
        <div style={{ fontSize:'18px', fontWeight:'500', color:'#DCE9F6', marginBottom:'8px' }}>Revenue Collection</div>
        <div style={{ fontSize:'13px', color:'#7A9BB8', marginBottom:'8px' }}>{collection?'Edit collection':'New collection'}</div>
        <div style={{ fontSize:'12px', color:'rgba(0,212,126,0.8)', background:'rgba(0,212,126,0.08)', border:'1px solid rgba(0,212,126,0.2)', borderRadius:'8px', padding:'10px 16px', marginBottom:'24px' }}>Step 4 — coming soon</div>
        <button onClick={onClose} style={{ background:'#00D47E', color:'#060E1A', border:'none', borderRadius:'8px', padding:'9px 24px', cursor:'pointer', fontFamily:'system-ui,sans-serif', fontSize:'13px', fontWeight:'600' }}>Close</button>
      </div>
    </div>
  )
}
function RevenueReconcileDialog({ entry, onClose }: any) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#0D1B2C', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', padding:'2.5rem', width:'520px', textAlign:'center' as const }}>
        <div style={{ fontSize:'36px', marginBottom:'14px' }}>🔗</div>
        <div style={{ fontSize:'18px', fontWeight:'500', color:'#DCE9F6', marginBottom:'8px' }}>Match Collection</div>
        <div style={{ fontSize:'13px', color:'#7A9BB8', marginBottom:'8px' }}>Entry: <strong style={{ color:'#DCE9F6' }}>{entry?.brand} · {entry?.period_month}</strong></div>
        <div style={{ fontSize:'12px', color:'rgba(78,168,255,0.8)', background:'rgba(78,168,255,0.08)', border:'1px solid rgba(78,168,255,0.2)', borderRadius:'8px', padding:'10px 16px', marginBottom:'24px' }}>Step 5 — coming soon</div>
        <button onClick={onClose} style={{ background:'#185FA5', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 24px', cursor:'pointer', fontFamily:'system-ui,sans-serif', fontSize:'13px', fontWeight:'600' }}>Close</button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight:'100vh', background:'#060E1A', fontFamily:"'Inter', system-ui, sans-serif" },
  body: { padding:'24px 28px' },
  pageHeader: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1.5rem' },
  pageTitle: { fontFamily:'Georgia,serif', fontSize:'26px', fontWeight:'400', color:'#DCE9F6', marginBottom:'4px' },
  pageSub: { fontSize:'13px', color:'#7A9BB8' },
  btnGroup: { display:'flex', gap:'8px' },
  btnSync: { background:'transparent', color:'#7A9BB8', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'8px', padding:'9px 16px', fontFamily:'system-ui,sans-serif', fontSize:'13px', fontWeight:'500', cursor:'pointer' },
  btnSyncActive: { background:'rgba(157,151,255,0.10)', color:'#9D97FF', border:'1px solid rgba(157,151,255,0.3)' },
  btnEntry: { background:'#9D97FF', color:'#060E1A', border:'none', borderRadius:'8px', padding:'9px 16px', fontFamily:'system-ui,sans-serif', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  btnCollection: { background:'transparent', color:'#00D47E', border:'1px solid rgba(0,212,126,0.35)', borderRadius:'8px', padding:'9px 16px', fontFamily:'system-ui,sans-serif', fontSize:'13px', fontWeight:'500', cursor:'pointer' },
  summaryRow: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'1.5rem' },
  summaryCard: { background:'#0D1B2C', border:'1px solid rgba(255,255,255,0.075)', borderRadius:'10px', padding:'14px 16px' },
  summaryCardWarn: { border:'1px solid rgba(245,166,35,0.3)', background:'rgba(245,166,35,0.05)' },
  summaryLabel: { fontSize:'10px', fontWeight:'500', color:'rgba(255,255,255,0.30)', textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:'6px' },
  summaryVal: { fontSize:'22px', fontWeight:'500', color:'#DCE9F6', marginBottom:'4px' },
  summarySub: { fontSize:'11px', color:'#7A9BB8' },
  brandWidget: { background:'#0D1B2C', border:'1px solid rgba(255,255,255,0.075)', borderRadius:'10px', padding:'14px 16px', marginBottom:'16px' },
  brandWidgetTitle: { fontSize:'10px', fontWeight:'600', color:'rgba(255,255,255,0.30)', textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:'12px' },
  brandCard: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'8px', padding:'10px 12px', cursor:'pointer', minWidth:'130px', flex:'1', transition:'border 0.15s' },
  brandCardActive: { border:'1px solid rgba(157,151,255,0.4)', background:'rgba(157,151,255,0.06)' },
  subTabBar: { display:'flex', gap:'4px', marginBottom:'14px', background:'rgba(255,255,255,0.04)', borderRadius:'8px', padding:'4px', width:'fit-content' },
  subTab: { fontFamily:'system-ui,sans-serif', fontSize:'12px', padding:'7px 16px', border:'none', background:'transparent', color:'#7A9BB8', cursor:'pointer', borderRadius:'6px', fontWeight:'500', display:'flex', alignItems:'center', gap:'8px' },
  subTabActive: { background:'rgba(157,151,255,0.12)', color:'#9D97FF' },
  subTabCount: { fontSize:'10px', background:'rgba(255,255,255,0.07)', color:'#7A9BB8', padding:'1px 7px', borderRadius:'10px' },
  filterBar: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'1rem', flexWrap:'wrap' as const },
  searchInput: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'1px solid rgba(255,255,255,0.075)', borderRadius:'8px', padding:'8px 12px', outline:'none', background:'#0D1B2C', color:'#DCE9F6', flex:'1', minWidth:'200px' },
  filterSelect: { fontFamily:'system-ui,sans-serif', fontSize:'13px', border:'1px solid rgba(255,255,255,0.075)', borderRadius:'8px', padding:'8px 12px', outline:'none', background:'#0D1B2C', color:'#DCE9F6', cursor:'pointer' },
  totalBadge: { fontSize:'13px', color:'#7A9BB8', background:'#0D1B2C', border:'1px solid rgba(255,255,255,0.075)', borderRadius:'8px', padding:'8px 12px', marginLeft:'auto', whiteSpace:'nowrap' as const },
  tableWrap: { background:'#0D1B2C', border:'1px solid rgba(255,255,255,0.075)', borderRadius:'10px', overflow:'visible' },
  table: { width:'100%', borderCollapse:'collapse' as const, fontSize:'13px' },
  thead: { background:'#111F30' },
  th: { padding:'10px 12px', textAlign:'left' as const, fontSize:'10px', fontWeight:'500', color:'rgba(255,255,255,0.30)', textTransform:'uppercase' as const, letterSpacing:'0.08em', borderBottom:'1px solid rgba(255,255,255,0.075)', whiteSpace:'nowrap' as const },
  tr: { borderBottom:'0.5px solid rgba(255,255,255,0.05)' },
  td: { padding:'10px 12px', verticalAlign:'middle' as const, color:'#DCE9F6' },
  emptyState: { padding:'3rem', textAlign:'center' as const },
  dateCell: { fontSize:'12px', color:'#7A9BB8', whiteSpace:'nowrap' as const },
  monoCell: { fontSize:'11px', color:'#7A9BB8', fontFamily:'monospace', background:'rgba(255,255,255,0.05)', padding:'2px 6px', borderRadius:'4px' },
  amtCell: { fontSize:'13px', fontWeight:'500', color:'#DCE9F6', whiteSpace:'nowrap' as const },
  badge: { fontSize:'10px', fontWeight:'500', padding:'2px 8px', borderRadius:'20px', whiteSpace:'nowrap' as const },
  editBtn: { background:'none', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'6px', padding:'4px 8px', cursor:'pointer', color:'#7A9BB8', fontSize:'14px' },
  contextMenu: { position:'fixed' as const, background:'#0D1B2C', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'8px', zIndex:9999, minWidth:'150px', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' },
  contextItem: { padding:'8px 14px', fontSize:'13px', color:'#DCE9F6', cursor:'pointer', borderBottom:'0.5px solid rgba(255,255,255,0.05)' },
}

const sp: Record<string, React.CSSProperties> = {
  panel: { background:'#0D1B2C', border:'1px solid rgba(157,151,255,0.25)', borderRadius:'12px', marginBottom:'1.5rem', overflow:'hidden' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:'rgba(157,151,255,0.06)', borderBottom:'1px solid rgba(157,151,255,0.15)' },
  title: { fontSize:'13px', fontWeight:'600', color:'#DCE9F6' },
  sub: { fontSize:'11px', color:'#7A9BB8', marginTop:'2px' },
  body: { padding:'16px 18px', display:'flex', flexDirection:'column' as const, gap:'14px' },
  section: { display:'flex', flexDirection:'column' as const, gap:'8px' },
  sectionLabel: { fontSize:'10px', fontWeight:'600', color:'rgba(255,255,255,0.30)', textTransform:'uppercase' as const, letterSpacing:'0.08em', display:'flex', alignItems:'center', gap:'10px' },
  linkBtn: { fontSize:'10px', color:'#9D97FF', background:'none', border:'none', cursor:'pointer', padding:'0', textDecoration:'underline' },
  monthGrid: { display:'flex', gap:'6px', flexWrap:'wrap' as const },
  monthBtn: { fontFamily:'system-ui,sans-serif', fontSize:'11px', padding:'5px 12px', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'6px', background:'transparent', color:'#7A9BB8', cursor:'pointer' },
  monthBtnActive: { background:'rgba(157,151,255,0.15)', border:'1px solid rgba(157,151,255,0.4)', color:'#9D97FF', fontWeight:'500' },
  siteBtn: { fontFamily:'system-ui,sans-serif', fontSize:'11px', padding:'5px 12px', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'6px', background:'transparent', color:'#7A9BB8', cursor:'pointer' },
  siteBtnActive: { background:'rgba(0,212,126,0.12)', border:'1px solid rgba(0,212,126,0.3)', color:'#00D47E', fontWeight:'500' },
  runBtn: { fontFamily:'system-ui,sans-serif', fontSize:'13px', fontWeight:'600', padding:'9px 20px', border:'none', borderRadius:'8px', background:'#9D97FF', color:'#060E1A', cursor:'pointer' },
  runBtnDisabled: { background:'rgba(157,151,255,0.3)', color:'rgba(6,14,26,0.5)', cursor:'not-allowed' },
  doneBtn: { fontFamily:'system-ui,sans-serif', fontSize:'12px', padding:'6px 14px', border:'1px solid rgba(0,212,126,0.35)', borderRadius:'6px', background:'transparent', color:'#00D47E', cursor:'pointer' },
  progressTrack: { height:'6px', background:'rgba(255,255,255,0.07)', borderRadius:'3px', overflow:'hidden' },
  progressBar: { height:'100%', background:'#9D97FF', borderRadius:'3px', transition:'width 0.3s ease' },
  resultsLog: { background:'#060E1A', borderRadius:'8px', padding:'8px', maxHeight:'220px', overflowY:'auto' as const, display:'flex', flexDirection:'column' as const, gap:'2px' },
  resultRow: { display:'flex', alignItems:'center', gap:'10px', padding:'4px 6px', borderRadius:'4px' },
  resultDot: { width:'6px', height:'6px', borderRadius:'50%', flexShrink:0 },
}