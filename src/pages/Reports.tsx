import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'
import type { Page } from '../App'
import { supabase } from '../supabase'
import { fmtUSD as fmt, fmtUSDSigned as fmtN } from '../utils/formatters'

// ── Halcom TKDIS format generator ────────────────────────
// Halcom kombinovane šifre platnog prometa (polje [166:169] u red 3)
const HALCOM_SIFRE = [
  { value: '221', label: '221 – Bezgotovinsko (robe i usluge)' },
  { value: '240', label: '240 – Zarade' },
  { value: '253', label: '253 – Javni prihodi' },
  { value: '254', label: '254 – Porezi i doprinosi (objedinjena naplata)' },
  { value: '260', label: '260 – Premije osiguranja' },
  { value: '263', label: '263 – Ostali transferi' },
  { value: '270', label: '270 – Kratkoročni krediti' },
  { value: '271', label: '271 – Dugoročni krediti' },
]

function padR(s: string, n: number): string {
  return (s || '').substring(0, n).padEnd(n, ' ')
}
function cleanAccount(acc: string): string {
  return (acc || '').replace(/[-\s]/g, '')
}
function fmtDatumDDMMYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = String(date.getFullYear()).slice(-2)
  return `${d}${m}${y}`
}

function exportHalcom(invoices: any[], companyBankAccount: any, companyProfile: any, halcomSifra: string = '221') {
  if (!companyBankAccount) {
    alert('Nije pronađen bankovni račun kompanije. Dodajte ga u Settings → Company profiles → Bank accounts.')
    return
  }
  const missing = invoices.filter(i => !i.selected_account_number)
  if (missing.length > 0) {
    alert(`${missing.length} faktura nema račun primaoca. Odaberite račun za svaku fakturu.`)
    return
  }

  const racunPlatilac = cleanAccount(companyBankAccount.account_number)
  // Ime i grad iz company_profiles, fallback na hardkodovane vrednosti
  const imeFirma = (companyProfile?.full_legal_name || 'CONSTELLATION D.O.O.').toUpperCase()
  const gradFirma = (companyProfile?.city || 'BEOGRAD').toUpperCase()
  const datum = fmtDatumDDMMYY(new Date())
  const brNaloga = invoices.length
  const ukupanIznosPare = invoices.reduce((s, i) => s + Math.round((i.amount || 0) * 100), 0)

  const lines: string[] = []

  // Red 1: header (180 chars)
  lines.push(
    padR(racunPlatilac, 18) +
    padR(imeFirma, 35) +
    padR(gradFirma, 10) +
    datum +
    ' '.repeat(98) +
    'MULTI E-BANK0'
  )

  // Red 2: kontrolni (180 chars)
  lines.push(
    padR(racunPlatilac, 18) +
    padR(imeFirma, 35) +
    padR(gradFirma, 10) +
    String(ukupanIznosPare).padStart(15, '0') +
    '0000' +
    String(brNaloga) +
    ' '.repeat(96) +
    '9'
  )

  // Red 3+: stavke (217 chars)
  invoices.forEach(inv => {
    const iznos = Math.round((inv.amount || 0) * 100)
    const svrhaText = `UPLATA PO FAKTURI ${inv.invoice_number || ''}`.toUpperCase().substring(0, 34)
    const svrhaZona = (' '.repeat(25) + svrhaText).padEnd(61, ' ')
    const racunPrimaoca = cleanAccount(inv.selected_account_number || '')
    // Halcom šifra platnog prometa (polje [166:169]) — NE model plaćanja
    const poziv = padR(inv.reference_number || inv.invoice_number || '', 23)

    lines.push(
      padR(racunPrimaoca, 18) +
      padR((inv.partner_name || '').toUpperCase(), 35) +
      padR((inv.partner_address || '').toUpperCase(), 35) +
      padR((inv.partner_city || '').toUpperCase(), 10) +
      '0' +
      svrhaZona +
      '00000 ' +
      padR(halcomSifra, 3) +
      '  ' +
      String(iznos).padStart(13, '0') +
      '  ' +
      poziv +
      datum +
      '01'
    )
  })

  const content = lines.join('\r\n') + '\r\n\x1a'
  const bytes = new Uint8Array(content.length)
  for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i) & 0xff
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `nalozi_${datum}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Unpaid Invoices Panel ────────────────────────────────
function UnpaidInvoicesPanel({ onClose }: { onClose: () => void }) {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'due_date' | 'amount' | 'partner'>('due_date')
  const [filterStatus, setFilterStatus] = useState<'all' | 'overdue' | 'upcoming'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [halcomSifra, setHalcomSifra] = useState('221')
  const [companyProfile, setCompanyProfile] = useState<any>(null)
  // Map: invoice_id → { account_number, model } — odabrani račun po fakturi
  const [invoiceAccountMap, setInvoiceAccountMap] = useState<Record<string, { account_number: string; model: string; bank_name: string }>>({})
  // Map: partner_id → lista računa
  const [partnerAccountsMap, setPartnerAccountsMap] = useState<Record<string, any[]>>({})
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: compData } = await supabase
        .from('companies').select('id').eq('name', 'Constellation LLC').single()
      if (!compData) { setLoading(false); return }

      // Bankovni računi kompanije
      const { data: bankData } = await supabase
        .from('company_bank_accounts')
        .select('*').eq('company_id', compData.id).eq('currency', 'RSD')
        .order('is_primary', { ascending: false })
      if (bankData && bankData.length > 0) {
        setBankAccounts(bankData)
        setSelectedBankId((bankData.find(b => b.is_primary) || bankData[0]).id)
      }

      // Profil kompanije (ime, grad za TKDIS header)
      const { data: profData } = await supabase
        .from('company_profiles')
        .select('full_legal_name, city, address')
        .eq('company_id', compData.id)
        .single()
      if (profData) setCompanyProfile(profData)

      // Fakture
      const { data: invData } = await supabase
        .from('invoices')
        .select('*, partners(id, name, address, city)')
        .eq('company_id', compData.id)
        .in('status', ['unpaid', 'partial'])
        .order('due_date', { ascending: true })

      if (invData && invData.length > 0) {
        setInvoices(invData)

        // Povuci sve partner račune odjednom
        const partnerIds = [...new Set(invData.map(i => i.partner_id).filter(Boolean))]
        if (partnerIds.length > 0) {
          const { data: pAccounts } = await supabase
            .from('partner_accounts')
            .select('*')
            .in('partner_id', partnerIds)
            .eq('currency', 'RSD')
            .order('is_primary', { ascending: false })

          if (pAccounts) {
            // Grupiši po partner_id
            const paMap: Record<string, any[]> = {}
            pAccounts.forEach(pa => {
              if (!paMap[pa.partner_id]) paMap[pa.partner_id] = []
              paMap[pa.partner_id].push(pa)
            })
            setPartnerAccountsMap(paMap)

            // Auto-selektuj primarni račun za svaku fakturu
            const accMap: Record<string, { account_number: string; model: string; bank_name: string }> = {}
            invData.forEach(inv => {
              if (!inv.partner_id) return
              const accounts = paMap[inv.partner_id] || []
              // Faktura već ima account_number (ručno unet) — prioritet
              if (inv.account_number) {
                accMap[inv.id] = {
                  account_number: inv.account_number,
                  model: inv.model || '97',
                  bank_name: 'Iz fakture',
                }
                return
              }
              // Inače uzmi primarni račun
              const primary = accounts.find(a => a.is_primary) || accounts[0]
              if (primary) {
                accMap[inv.id] = {
                  account_number: primary.account_number,
                  model: primary.model || inv.model || '97',
                  bank_name: primary.bank_name || '',
                }
              }
            })
            setInvoiceAccountMap(accMap)
          }
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = invoices
    .filter(inv => {
      const partner = inv.partners?.name || ''
      const matchSearch = !search ||
        partner.toLowerCase().includes(search.toLowerCase()) ||
        (inv.invoice_number || '').toLowerCase().includes(search.toLowerCase())
      const isOverdue = inv.due_date && inv.due_date < today
      const matchStatus = filterStatus === 'all' ||
        (filterStatus === 'overdue' && isOverdue) ||
        (filterStatus === 'upcoming' && !isOverdue)
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      if (sortBy === 'amount') return (b.amount_usd || 0) - (a.amount_usd || 0)
      if (sortBy === 'partner') return (a.partners?.name || '').localeCompare(b.partners?.name || '')
      return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1
    })

  const totalUnpaid = filtered.reduce((s, i) => s + (i.amount_usd || 0), 0)
  const overdueCount = filtered.filter(i => i.due_date && i.due_date < today).length
  const selectedInvoices = filtered.filter(i => selected.has(i.id))
  const selectedBank = bankAccounts.find(b => b.id === selectedBankId)

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(i => i.id)))
  }

  const handleAccountSelect = (invId: string, accountId: string, partnerId: string) => {
    const accounts = partnerAccountsMap[partnerId] || []
    const acc = accounts.find(a => a.id === accountId)
    if (acc) {
      setInvoiceAccountMap(prev => ({
        ...prev,
        [invId]: { account_number: acc.account_number, model: acc.model || '97', bank_name: acc.bank_name || '' }
      }))
    }
  }

  const handleExport = () => {
    const toExport = (selectedInvoices.length > 0 ? selectedInvoices : filtered).map(i => ({
      ...i,
      partner_name: i.partners?.name,
      partner_address: i.partners?.address || '',
      partner_city: i.partners?.city || '',
      selected_account_number: invoiceAccountMap[i.id]?.account_number || i.account_number || '',
      selected_model: invoiceAccountMap[i.id]?.model || i.model || '97',
    }))
    exportHalcom(toExport, selectedBank, companyProfile, halcomSifra)
  }

  const daysUntilDue = (dueDate: string | null) => {
    if (!dueDate) return null
    return Math.ceil((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000)
  }

  const missingAccountCount = filtered.filter(i => !invoiceAccountMap[i.id]?.account_number && !i.account_number).length

  return (
    <div style={ps.overlay} onClick={onClose}>
      <div style={ps.panel} onClick={e => e.stopPropagation()}>
        <div style={ps.header}>
          <div>
            <div style={ps.headerTitle}>⚠️ Unpaid Invoices — Constellation LLC</div>
            <div style={ps.headerSub}>
              {loading ? 'Loading...' : `${filtered.length} invoices · ${fmt(totalUnpaid)} total · ${overdueCount} overdue`}
            </div>
          </div>
          <button style={ps.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={ps.toolbar}>
          <input style={ps.searchInput} placeholder="Search partner or invoice #..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <select style={ps.sel} value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
            <option value="all">All unpaid</option>
            <option value="overdue">Overdue only</option>
            <option value="upcoming">Upcoming</option>
          </select>
          <select style={ps.sel} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
            <option value="due_date">Sort: Due date</option>
            <option value="amount">Sort: Amount</option>
            <option value="partner">Sort: Partner</option>
          </select>
        </div>

        {/* Export bar */}
        <div style={ps.exportBar}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
            <div style={{ fontSize: '12px', color: '#633806', fontWeight: '500' }}>
              🏦 Hal E-Bank — nalog za prenos (TKDIS format)
              {selected.size > 0 && <span style={{ marginLeft: '8px', color: '#888', fontWeight: '400' }}>({selected.size} selektovano)</span>}
            </div>
            {bankAccounts.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#A32D2D' }}>⚠️ Nije pronađen RSD račun kompanije</div>
            ) : (
              <div style={{ fontSize: '11px', color: '#854F0B' }}>
                Platilac: {selectedBank?.bank_name} · {selectedBank?.account_number}
                {missingAccountCount > 0 && (
                  <span style={{ marginLeft: '8px', color: '#A32D2D', fontWeight: '500' }}>
                    ⚠️ {missingAccountCount} faktura bez računa primaoca
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {bankAccounts.length > 1 && (
              <select style={{ ...ps.sel, fontSize: '11px' }} value={selectedBankId}
                onChange={e => setSelectedBankId(e.target.value)}>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bank_name}{b.is_primary ? ' ★' : ''}</option>
                ))}
              </select>
            )}
            <select
              style={{ ...ps.sel, fontSize: '11px' }}
              value={halcomSifra}
              onChange={e => setHalcomSifra(e.target.value)}
            >
              {HALCOM_SIFRE.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              style={{ ...ps.exportBtn, opacity: bankAccounts.length === 0 ? 0.5 : 1 }}
              onClick={handleExport} disabled={bankAccounts.length === 0}>
              📥 Export {selected.size > 0 ? `${selected.size}` : 'all'} naloga
            </button>
          </div>
        </div>

        <div style={ps.tableWrap}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' as const, color: '#888' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' as const }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>✅</div>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#111' }}>Nema neplaćenih faktura!</div>
            </div>
          ) : (
            <table style={ps.table}>
              <thead>
                <tr style={ps.thead}>
                  <th style={ps.th}>
                    <input type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th style={ps.th}>Datum dospeća</th>
                  <th style={ps.th}>Partner</th>
                  <th style={ps.th}>Broj fakture</th>
                  <th style={ps.th}>Tip</th>
                  <th style={{ ...ps.th, textAlign: 'right' as const }}>Iznos</th>
                  <th style={{ ...ps.th, textAlign: 'right' as const }}>USD</th>
                  <th style={ps.th}>Račun primaoca</th>
                  <th style={ps.th}>Preostalo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, i) => {
                  const isOverdue = inv.due_date && inv.due_date < today
                  const days = daysUntilDue(inv.due_date)
                  const isSelected = selected.has(inv.id)
                  const partnerId = inv.partner_id
                  const partnerAccounts = partnerAccountsMap[partnerId] || []
                  const selectedAcc = invoiceAccountMap[inv.id]
                  const hasAccount = !!(selectedAcc?.account_number || inv.account_number)

                  return (
                    <tr key={inv.id} style={{
                      ...ps.tr,
                      background: isSelected ? '#FFF8E6' : isOverdue ? '#FFF5F5' : i % 2 === 0 ? '#fff' : '#fafaf9'
                    }}>
                      <td style={ps.td}>
                        <input type="checkbox" checked={isSelected}
                          onChange={() => toggleSelect(inv.id)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={ps.td}>
                        <span style={{ fontSize: '12px', fontWeight: isOverdue ? '600' : '400', color: isOverdue ? '#A32D2D' : '#333', whiteSpace: 'nowrap' as const }}>
                          {inv.due_date || '—'} {isOverdue && '⚠️'}
                        </span>
                      </td>
                      <td style={ps.td}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{inv.partners?.name || '—'}</span>
                      </td>
                      <td style={ps.td}>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', background: '#f5f5f3', padding: '2px 6px', borderRadius: '4px', color: '#666' }}>
                          {inv.invoice_number || '—'}
                        </span>
                      </td>
                      <td style={ps.td}>
                        <span style={{ fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '20px', background: inv.type === 'expense' ? '#FCEBEB' : '#E1F5EE', color: inv.type === 'expense' ? '#A32D2D' : '#085041' }}>
                          {inv.type}
                        </span>
                      </td>
                      <td style={{ ...ps.td, textAlign: 'right' as const }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' as const }}>
                          {(inv.amount || 0).toLocaleString('sr-RS')} {inv.currency}
                        </span>
                      </td>
                      <td style={{ ...ps.td, textAlign: 'right' as const }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#1D9E75' }}>{fmt(inv.amount_usd || 0)}</span>
                      </td>
                      {/* Račun primaoca — dropdown ako ima više računa */}
                      <td style={ps.td}>
                        {partnerAccounts.length > 1 ? (
                          <select
                            style={{ fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '4px 6px', border: `0.5px solid ${hasAccount ? '#e5e5e5' : '#E24B4A'}`, borderRadius: '6px', background: '#fff', color: '#111', maxWidth: '200px', cursor: 'pointer' }}
                            value={partnerAccounts.find(a => a.account_number === selectedAcc?.account_number)?.id || ''}
                            onChange={e => handleAccountSelect(inv.id, e.target.value, partnerId)}
                          >
                            <option value="">Odaberi račun...</option>
                            {partnerAccounts.map(pa => (
                              <option key={pa.id} value={pa.id}>
                                {pa.account_number}{pa.is_primary ? ' ★' : ''}{pa.bank_name ? ` — ${pa.bank_name.substring(0, 20)}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div>
                            {hasAccount ? (
                              <div>
                                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#111' }}>
                                  {selectedAcc?.account_number || inv.account_number}
                                </div>
                                {selectedAcc?.bank_name && (
                                  <div style={{ fontSize: '10px', color: '#888', marginTop: '1px' }}>
                                    {selectedAcc.bank_name.substring(0, 30)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#A32D2D' }}>⚠️ Nema računa</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={ps.td}>
                        {days === null ? (
                          <span style={{ fontSize: '11px', color: '#aaa' }}>Bez roka</span>
                        ) : days < 0 ? (
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#A32D2D', background: '#FCEBEB', padding: '2px 8px', borderRadius: '20px' }}>
                            {Math.abs(days)}d kasni
                          </span>
                        ) : days === 0 ? (
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#BA7517', background: '#FAEEDA', padding: '2px 8px', borderRadius: '20px' }}>
                            Danas!
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: days <= 7 ? '#BA7517' : '#888' }}>
                            {days}d preostalo
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0a1628' }}>
                  <td colSpan={5} style={{ padding: '12px 14px', fontSize: '12px', fontWeight: '500', color: '#fff' }}>
                    UKUPNO ({filtered.length} faktura)
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' as const, color: '#fff' }}></td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' as const, fontSize: '14px', fontWeight: '600', color: '#5DCAA5' }}>
                    {fmt(totalUnpaid)}
                  </td>
                  <td colSpan={2} style={{ padding: '12px 14px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {overdueCount > 0 ? `${overdueCount} faktura kasni` : 'Sve na vreme'}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Reports page ────────────────────────────────────
export default function Reports() {
  const { user, signOut } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [activeReport, setActiveReport] = useState('')
  const [showUnpaidPanel, setShowUnpaidPanel] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('all')
  const [loading, setLoading] = useState(true)

  const [kpis, setKpis] = useState({
    netProfit: 0, totalRevenue: 0, totalExpenses: 0, expenseRatio: 0,
    openInvoicesCount: 0, openInvoicesAmount: 0, unmatchedPassthrough: 0, overdueCount: 0,
  })

  const currentYear = new Date().getFullYear()
  const ytdStart = `${currentYear}-01-01`
  const today = new Date().toISOString().split('T')[0]

  const pageMap: Record<string, Page> = {
    'Dashboard': 'dashboard', 'Transactions': 'transactions',
    'P&L': 'pl', 'Cash Flow': 'cashflow', 'Reports': 'reports',
    'Partners': 'partners', 'Settings': 'settings',
  }

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('companies').select('id,name').order('name')
      if (data) setCompanies(data)
    }
    load()
  }, [])

  const fetchKpis = useCallback(async () => {
    setLoading(true)
    try {
      let plQuery = supabase.from('v_pl_entries').select('tx_type,amount_usd')
        .gte('pl_date', ytdStart).lte('pl_date', today)
      if (companyId !== 'all') plQuery = plQuery.eq('company_id', companyId)
      let invQuery = supabase.from('v_invoice_status').select('calculated_status,remaining_usd,due_date')
        .in('calculated_status', ['unpaid', 'partial'])
      if (companyId !== 'all') invQuery = invQuery.eq('company_id', companyId)
      let ptQuery = supabase.from('passthrough').select('id').eq('status', 'unpaired')
      if (companyId !== 'all') ptQuery = ptQuery.eq('company_id', companyId)

      const [{ data: plData }, { data: invData }, { data: ptData }] = await Promise.all([plQuery, invQuery, ptQuery])
      const revenue = (plData || []).filter(e => e.tx_type === 'revenue' || e.tx_type === 'invoice_revenue').reduce((s, e) => s + (e.amount_usd || 0), 0)
      const expenses = (plData || []).filter(e => e.tx_type === 'expense' || e.tx_type === 'invoice_expense').reduce((s, e) => s + (e.amount_usd || 0), 0)
      const openAmt = (invData || []).reduce((s, i) => s + (i.remaining_usd || 0), 0)
      const overdue = (invData || []).filter(i => i.due_date && i.due_date < today).length
      setKpis({
        netProfit: revenue - expenses, totalRevenue: revenue, totalExpenses: expenses,
        expenseRatio: revenue > 0 ? (expenses / revenue * 100) : 0,
        openInvoicesCount: (invData || []).length, openInvoicesAmount: openAmt,
        unmatchedPassthrough: (ptData || []).length, overdueCount: overdue,
      })
    } catch (err) { console.error('Reports KPI fetch error:', err) }
    setLoading(false)
  }, [companyId, ytdStart, today])

  useEffect(() => { fetchKpis() }, [fetchKpis])

  const kpiCards = [
    { label: 'Net Profit (YTD)', value: loading ? '...' : fmtN(kpis.netProfit), sub: `${currentYear} year to date`, up: kpis.netProfit >= 0, trend: loading ? '' : kpis.netProfit >= 0 ? 'Profitable' : 'Loss' },
    { label: 'Total Revenue (YTD)', value: loading ? '...' : fmt(kpis.totalRevenue), sub: `${currentYear} year to date`, up: true, trend: loading ? '' : `${fmt(kpis.totalExpenses)} expenses` },
    { label: 'Expense Ratio', value: loading ? '...' : `${kpis.expenseRatio.toFixed(1)}%`, sub: 'Expenses / Revenue YTD', up: kpis.expenseRatio < 90, trend: loading ? '' : kpis.expenseRatio < 80 ? 'Healthy' : kpis.expenseRatio < 90 ? 'Watch' : 'High' },
    { label: 'Open Invoices', value: loading ? '...' : kpis.openInvoicesCount > 0 ? `${kpis.openInvoicesCount} · ${fmt(kpis.openInvoicesAmount)}` : 'None', sub: loading ? '' : kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : 'All on time', up: kpis.overdueCount === 0, trend: loading ? '' : kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : 'On time' },
  ]

  const reports = [
    { id: 'pl-monthly', title: 'Monthly P&L', desc: 'Profit & Loss by month with revenue stream breakdown', category: 'P&L', icon: '📊', color: '#0F6E56', bg: '#E1F5EE', page: 'pl' as Page, action: null },
    { id: 'pl-by-dept', title: 'P&L by Department', desc: 'Expense breakdown per organizational unit', category: 'P&L', icon: '👥', color: '#0F6E56', bg: '#E1F5EE', page: 'pl' as Page, action: null },
    { id: 'cashflow-monthly', title: 'Monthly Cash Flow', desc: 'Operating and financing activities by period', category: 'Cash Flow', icon: '💰', color: '#0C447C', bg: '#E6F1FB', page: 'cashflow' as Page, action: null },
    { id: 'bank-reconciliation', title: 'Bank Reconciliation', desc: 'Statement vs. recorded transactions per account', category: 'Cash Flow', icon: '🏦', color: '#0C447C', bg: '#E6F1FB', page: 'cashflow' as Page, action: null },
    { id: 'passthrough', title: 'Pass-through Balance', desc: 'Pass-through IN vs. OUT monthly balance', category: 'Compliance', icon: '⚖️', color: '#633806', bg: '#FAEEDA', page: 'cashflow' as Page, action: null },
    { id: 'unmatched', title: 'Unmatched Invoices', desc: 'Neplaćene fakture · Constellation LLC · Hal E-Bank TKDIS export', category: 'Compliance', icon: '⚠️', color: '#854F0B', bg: '#FAEEDA', page: 'reports' as Page, action: 'unpaid' },
    { id: 'exchange-rates', title: 'Exchange Rate Log', desc: 'Rates used per period and transaction', category: 'Reference', icon: '💱', color: '#444', bg: '#f0f0ee', page: 'reports' as Page, action: null },
    { id: 'partner-summary', title: 'Partner Summary', desc: 'Total transactions per partner across all entities', category: 'Reference', icon: '🤝', color: '#444', bg: '#f0f0ee', page: 'partners' as Page, action: null },
  ]

  const categories = ['P&L', 'Cash Flow', 'Compliance', 'Reference']
  const categoryColors: Record<string, { color: string; bg: string }> = {
    'P&L': { color: '#0F6E56', bg: '#E1F5EE' },
    'Cash Flow': { color: '#0C447C', bg: '#E6F1FB' },
    'Compliance': { color: '#633806', bg: '#FAEEDA' },
    'Reference': { color: '#444', bg: '#f0f0ee' },
  }

  return (
    <div style={s.root}>
      <nav style={s.nav}>
        <div style={s.navLogo}>
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
            <polygon points="18,2 34,30 2,30" fill="none" stroke="#1D9E75" strokeWidth="1.5" />
            <circle cx="18" cy="2" r="2" fill="#1D9E75" />
            <circle cx="34" cy="30" r="2" fill="#5DCAA5" />
            <circle cx="2" cy="30" r="2" fill="#9FE1CB" />
          </svg>
          <span style={s.navLogoText}>Mint<span style={{ color: '#1D9E75' }}>flow</span></span>
        </div>
        <div style={s.navLinks}>
          {['Dashboard', 'Transactions', 'P&L', 'Cash Flow', 'Reports', 'Partners', 'Settings'].map(l => (
            <span key={l} style={l === 'Reports' ? s.navLinkActive : s.navLink} onClick={() => setPage(pageMap[l])}>{l}</span>
          ))}
        </div>
        <div style={s.navRight}>
          <div style={s.navAvatar}>{user?.email?.substring(0, 2).toUpperCase()}</div>
          <span style={s.navEmail}>{user?.email}</span>
          <button style={s.navSignout} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Reports</div>
            <div style={s.pageSub}>Financial reports and analytics · YTD {currentYear}</div>
          </div>
          <select style={s.filterSelect} value={companyId} onChange={e => setCompanyId(e.target.value)}>
            <option value="all">All companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={s.kpiGrid}>
          {kpiCards.map(k => (
            <div key={k.label} style={s.kpiCard}>
              <div style={s.kpiLabel}>{k.label}</div>
              <div style={s.kpiValue}>{k.value}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ ...s.kpiTrend, color: k.up ? '#0F6E56' : '#A32D2D', background: k.up ? '#E1F5EE' : '#FCEBEB' }}>
                  {k.up ? '↑' : '↓'} {k.trend}
                </span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>{k.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {!loading && (kpis.overdueCount > 0 || kpis.unmatchedPassthrough > 0) && (
          <div style={s.alertBox}>
            <div style={{ fontSize: '12px', fontWeight: '500', color: '#633806', marginBottom: '8px' }}>⚠️ Attention required</div>
            {kpis.overdueCount > 0 && (
              <div style={s.alertRow}>
                <span style={s.alertDot} />
                <span style={{ fontSize: '12px', color: '#555' }}>
                  {kpis.overdueCount} invoice{kpis.overdueCount > 1 ? 's' : ''} past due date —{' '}
                  <span style={{ color: '#854F0B', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setShowUnpaidPanel(true)}>
                    open Unmatched Invoices report
                  </span>.
                </span>
              </div>
            )}
            {kpis.unmatchedPassthrough > 0 && (
              <div style={s.alertRow}>
                <span style={s.alertDot} />
                <span style={{ fontSize: '12px', color: '#555' }}>{kpis.unmatchedPassthrough} pass-through entr{kpis.unmatchedPassthrough === 1 ? 'y' : 'ies'} unpaired — review Cash Flow tab.</span>
              </div>
            )}
          </div>
        )}

        {categories.map(cat => (
          <div key={cat} style={s.categorySection}>
            <div style={s.categoryHeader}>
              <span style={{ ...s.categoryBadge, color: categoryColors[cat].color, background: categoryColors[cat].bg }}>{cat}</span>
              <span style={s.categoryCount}>{reports.filter(r => r.category === cat).length} reports</span>
            </div>
            <div style={s.reportsGrid}>
              {reports.filter(r => r.category === cat).map(report => (
                <div key={report.id}
                  style={{ ...s.reportCard, ...(activeReport === report.id ? s.reportCardActive : {}) }}
                  onClick={() => setActiveReport(activeReport === report.id ? '' : report.id)}>
                  <div style={{ ...s.reportIcon, background: report.bg }}>
                    <span style={{ fontSize: '18px' }}>{report.icon}</span>
                  </div>
                  <div style={s.reportInfo}>
                    <div style={s.reportTitle}>{report.title}</div>
                    <div style={s.reportDesc}>{report.desc}</div>
                  </div>
                  <div style={s.reportActions}>
                    <button
                      style={{ ...s.reportBtn, color: report.color, borderColor: report.color + '40', background: report.bg }}
                      onClick={e => {
                        e.stopPropagation()
                        if (report.action === 'unpaid') setShowUnpaidPanel(true)
                        else setPage(report.page)
                      }}>
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showUnpaidPanel && <UnpaidInvoicesPanel onClose={() => setShowUnpaidPanel(false)} />}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#f5f5f3', fontFamily: 'system-ui,sans-serif' },
  nav: { background: '#0a1628', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: '52px' },
  navLogo: { display: 'flex', alignItems: 'center', gap: '8px' },
  navLogoText: { fontFamily: 'Georgia,serif', fontSize: '18px', fontWeight: '500', color: '#fff' },
  navLinks: { display: 'flex', gap: '4px' },
  navLink: { fontSize: '13px', color: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' },
  navLinkActive: { fontSize: '13px', color: '#fff', padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' },
  navRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  navAvatar: { width: '30px', height: '30px', borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '500', color: '#fff' },
  navEmail: { fontSize: '13px', color: 'rgba(255,255,255,0.7)' },
  navSignout: { background: 'none', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer' },
  body: { padding: '2rem 1.5rem' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle: { fontFamily: 'Georgia,serif', fontSize: '24px', fontWeight: '400', color: '#111', marginBottom: '4px' },
  pageSub: { fontSize: '13px', color: '#888' },
  filterSelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#fff', color: '#111', cursor: 'pointer' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '1.5rem' },
  kpiCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '1rem 1.25rem' },
  kpiLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' },
  kpiValue: { fontSize: '22px', fontWeight: '500', color: '#111' },
  kpiTrend: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '500', padding: '3px 8px', borderRadius: '20px' },
  alertBox: { background: '#FAEEDA', border: '0.5px solid #E5B96A', borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem' },
  alertRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  alertDot: { width: '6px', height: '6px', borderRadius: '50%', background: '#BA7517', flexShrink: 0 },
  categorySection: { marginBottom: '2rem' },
  categoryHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  categoryBadge: { fontSize: '11px', fontWeight: '500', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
  categoryCount: { fontSize: '12px', color: '#888' },
  reportsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' },
  reportCard: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' },
  reportCardActive: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  reportIcon: { width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reportInfo: { flex: 1 },
  reportTitle: { fontSize: '14px', fontWeight: '500', color: '#111', marginBottom: '3px' },
  reportDesc: { fontSize: '12px', color: '#888', lineHeight: 1.4 },
  reportActions: { display: 'flex', gap: '6px', flexShrink: 0 },
  reportBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', fontWeight: '500', padding: '5px 12px', borderRadius: '6px', border: '1px solid', cursor: 'pointer' },
}

const ps: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', zIndex: 1000 },
  panel: { background: '#fff', width: '90vw', maxWidth: '1200px', height: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' },
  header: { background: '#0a1628', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  headerTitle: { color: '#fff', fontSize: '15px', fontWeight: '500' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: '12px', marginTop: '3px' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '24px', cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
  toolbar: { display: 'flex', gap: '10px', padding: '12px 16px', borderBottom: '0.5px solid #e5e5e5', flexShrink: 0, flexWrap: 'wrap' as const },
  searchInput: { flex: 1, fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '7px 12px', outline: 'none', minWidth: '180px' },
  sel: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '7px 10px', outline: 'none', background: '#fff', cursor: 'pointer' },
  exportBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#FAEEDA', borderBottom: '0.5px solid #E5B96A', flexShrink: 0, flexWrap: 'wrap' as const, gap: '8px' },
  exportBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', fontWeight: '500', padding: '7px 16px', borderRadius: '8px', border: 'none', background: '#633806', color: '#fff', cursor: 'pointer' },
  tableWrap: { flex: 1, overflowY: 'auto' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  thead: { background: '#f5f5f3', position: 'sticky' as const, top: 0, zIndex: 10 },
  th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', borderBottom: '0.5px solid #e5e5e5', whiteSpace: 'nowrap' as const },
  tr: { borderBottom: '0.5px solid #f0f0ee' },
  td: { padding: '10px 14px', verticalAlign: 'middle' as const },
}