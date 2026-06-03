import React, { useState, useEffect, useCallback } from 'react'
import { NavContext } from '../App'
import type { Page } from '../App'
import { supabase } from '../supabase'
import { fmtUSD as fmt, fmtUSDSigned as fmtN } from '../utils/formatters'

// ── Halcom TKDIS format generator ────────────────────────
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
  // NBS format: BBB-CCCCCCCCCCCC-KK → ukupno 18 cifara bez crtica
  // Core dio mora biti tačno 12 cifara (padovan nulama lijevo)
  const raw = (acc || '').replace(/[\s]/g, '')
  const parts = raw.split('-')
  if (parts.length === 3) {
    const bank = parts[0].padStart(3, '0').slice(-3)
    const core = parts[1].padStart(12, '0').slice(-12)
    const ctrl = parts[2].padStart(2, '0').slice(-2)
    return bank + core + ctrl  // tačno 17 cifara — bez crtica, standardni NBS
  }
  // Ako već nema crtica, provjeri dužinu
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 18) return digits
  if (digits.length === 17) return digits
  // Pokušaj rekonstrukciju: prvih 3 = banka, zadnja 2 = kontrola, sredina = core
  if (digits.length > 5) {
    const bank = digits.slice(0, 3)
    const ctrl = digits.slice(-2)
    const core = digits.slice(3, -2).padStart(12, '0').slice(-12)
    return bank + core + ctrl
  }
  return digits
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
  const imeFirma = (companyProfile?.full_legal_name || 'CONSTELLATION D.O.O.').toUpperCase()
  const gradFirma = (companyProfile?.city || 'BEOGRAD').toUpperCase()
  const datum = fmtDatumDDMMYY(new Date())
  const brNaloga = invoices.length
  const ukupanIznosPare = invoices.reduce((s, i) => s + Math.round((i.amount || 0) * 100), 0)
  const lines: string[] = []
  lines.push(padR(racunPlatilac, 18) + padR(imeFirma, 35) + padR(gradFirma, 10) + datum + ' '.repeat(98) + 'MULTI E-BANK0')
  lines.push(padR(racunPlatilac, 18) + padR(imeFirma, 35) + padR(gradFirma, 10) + String(ukupanIznosPare).padStart(15, '0') + '0000' + String(brNaloga) + ' '.repeat(96) + '9')
  invoices.forEach(inv => {
    const iznos = Math.round((inv.amount || 0) * 100)
    const svrhaText = `UPLATA PO FAKTURI ${inv.invoice_number || ''}`.toUpperCase().substring(0, 34)
    const svrhaZona = (' '.repeat(25) + svrhaText).padEnd(61, ' ')
    const racunPrimaoca = cleanAccount(inv.selected_account_number || '')
    const poziv = padR(inv.reference_number || inv.invoice_number || '', 23)
    lines.push(padR(racunPrimaoca, 18) + padR((inv.partner_name || '').toUpperCase(), 35) + padR((inv.partner_address || '').toUpperCase(), 35) + padR((inv.partner_city || '').toUpperCase(), 10) + '0' + svrhaZona + '00000 ' + padR(halcomSifra, 3) + '  ' + String(iznos).padStart(13, '0') + '  ' + poziv + datum + '01')
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
  const [invoiceAccountMap, setInvoiceAccountMap] = useState<Record<string, { account_number: string; model: string; bank_name: string }>>({})
  const [partnerAccountsMap, setPartnerAccountsMap] = useState<Record<string, any[]>>({})
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: compData } = await supabase.from('companies').select('id').eq('name', 'Constellation LLC').single()
      if (!compData) { setLoading(false); return }
      const { data: bankData } = await supabase.from('company_bank_accounts').select('*').eq('company_id', compData.id).eq('currency', 'RSD').order('is_primary', { ascending: false })
      if (bankData && bankData.length > 0) { setBankAccounts(bankData); setSelectedBankId((bankData.find(b => b.is_primary) || bankData[0]).id) }
      const { data: profData } = await supabase.from('company_profiles').select('full_legal_name, city, address').eq('company_id', compData.id).single()
      if (profData) setCompanyProfile(profData)
      const { data: invData } = await supabase.from('invoices').select('*, partners(id, name, address, city)').eq('company_id', compData.id).in('status', ['unpaid', 'partial']).order('due_date', { ascending: true })
      // Fetch remaining amounts separately from v_invoice_status
      const invIds = (invData || []).map((i: any) => i.id)
      let remainingMap: Record<string, number> = {}
      if (invIds.length > 0) {
        const { data: remData } = await supabase.from('v_invoice_status').select('id,remaining_usd,calculated_status').in('id', invIds)
        if (remData) remData.forEach((r: any) => { remainingMap[r.id] = r.remaining_usd || 0 })
      }
      const invDataWithRemaining = (invData || []).map((i: any) => ({
        ...i,
        calculated_status: i.status,
        remaining_usd: i.status === 'partial' ? (remainingMap[i.id] ?? i.amount_usd) : 0,
      }))
      if (invData && invData.length > 0) {
        setInvoices(invDataWithRemaining)
        const partnerIds = [...new Set(invData.map(i => i.partner_id).filter(Boolean))]
        if (partnerIds.length > 0) {
          const { data: pAccounts } = await supabase.from('partner_accounts').select('*').in('partner_id', partnerIds).eq('currency', 'RSD').order('is_primary', { ascending: false })
          if (pAccounts) {
            const paMap: Record<string, any[]> = {}
            pAccounts.forEach(pa => { if (!paMap[pa.partner_id]) paMap[pa.partner_id] = []; paMap[pa.partner_id].push(pa) })
            setPartnerAccountsMap(paMap)
            const accMap: Record<string, { account_number: string; model: string; bank_name: string }> = {}
            invData.forEach(inv => {
              if (!inv.partner_id) return
              const accounts = paMap[inv.partner_id] || []
              if (inv.account_number) { accMap[inv.id] = { account_number: inv.account_number, model: inv.model || '97', bank_name: 'Iz fakture' }; return }
              const primary = accounts.find(a => a.is_primary) || accounts[0]
              if (primary) accMap[inv.id] = { account_number: primary.account_number, model: primary.model || inv.model || '97', bank_name: primary.bank_name || '' }
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
      const matchSearch = !search || partner.toLowerCase().includes(search.toLowerCase()) || (inv.invoice_number || '').toLowerCase().includes(search.toLowerCase())
      const isOverdue = inv.due_date && inv.due_date < today
      const matchStatus = filterStatus === 'all' || (filterStatus === 'overdue' && isOverdue) || (filterStatus === 'upcoming' && !isOverdue)
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      if (sortBy === 'amount') return (b.amount_usd || 0) - (a.amount_usd || 0)
      if (sortBy === 'partner') return (a.partners?.name || '').localeCompare(b.partners?.name || '')
      return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1
    })

  const totalUnpaid = filtered.reduce((s, i) => s + (i.calculated_status === 'partial' ? (i.remaining_usd || 0) : (i.amount_usd || 0)), 0)
  const overdueCount = filtered.filter(i => i.due_date && i.due_date < today).length
  const selectedInvoices = filtered.filter(i => selected.has(i.id))
  const selectedBank = bankAccounts.find(b => b.id === selectedBankId)

  const toggleSelect = (id: string) => { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleAll = () => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(i => i.id))) }

  const handleAccountSelect = (invId: string, accountId: string, partnerId: string) => {
    const accounts = partnerAccountsMap[partnerId] || []
    const acc = accounts.find(a => a.id === accountId)
    if (acc) setInvoiceAccountMap(prev => ({ ...prev, [invId]: { account_number: acc.account_number, model: acc.model || '97', bank_name: acc.bank_name || '' } }))
  }

  const handleExport = () => {
    const toExport = (selectedInvoices.length > 0 ? selectedInvoices : filtered).map(i => ({
      ...i, partner_name: i.partners?.name, partner_address: i.partners?.address || '', partner_city: i.partners?.city || '',
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

        {/* ── Header ── */}
        <div style={ps.header}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#F5A623', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: '5px' }}>
              Neplaćene fakture
            </div>
            <div style={ps.headerTitle}>Constellation LLC</div>
            <div style={ps.headerSub}>
              {loading ? 'Učitavanje...' : (
                <span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: '#F5A623', fontWeight: '600' }}>{fmt(totalUnpaid)}</span>
                  <span style={{ marginLeft: '10px', color: 'rgba(255,255,255,0.30)' }}>· {filtered.length} faktura</span>
                  {overdueCount > 0 && <span style={{ marginLeft: '8px', color: '#FF5B5A', fontWeight: '600' }}>· {overdueCount} kasni</span>}
                </span>
              )}
            </div>
          </div>
          <button style={ps.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* ── Toolbar ── */}
        <div style={ps.toolbar}>
          <input style={ps.searchInput} placeholder="Search partner or invoice #..." value={search} onChange={e => setSearch(e.target.value)} />
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

        {/* ── Export bar ── */}
        <div style={ps.exportBar}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
            <div style={{ fontSize: '12px', color: '#854F0B', fontWeight: '600' }}>
              Hal E-Bank — nalog za prenos (TKDIS format)
              {selected.size > 0 && <span style={{ marginLeft: '8px', color: '#7A9BB8', fontWeight: '400' }}>({selected.size} selektovano)</span>}
            </div>
            {bankAccounts.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#FF5B5A' }}>⚠ Nije pronađen RSD račun kompanije</div>
            ) : (
              <div style={{ fontSize: '11px', color: '#7A6030' }}>
                Platilac: {selectedBank?.bank_name} · {selectedBank?.account_number}
                {missingAccountCount > 0 && <span style={{ marginLeft: '8px', color: '#FF5B5A', fontWeight: '600' }}>⚠ {missingAccountCount} bez računa</span>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {bankAccounts.length > 1 && (
              <select style={{ ...ps.sel, fontSize: '11px' }} value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)}>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bank_name}{b.is_primary ? ' ★' : ''}</option>)}
              </select>
            )}
            <select style={{ ...ps.sel, fontSize: '11px' }} value={halcomSifra} onChange={e => setHalcomSifra(e.target.value)}>
              {HALCOM_SIFRE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button style={{ ...ps.exportBtn, opacity: bankAccounts.length === 0 ? 0.5 : 1 }} onClick={handleExport} disabled={bankAccounts.length === 0}>
              ↓ Export {selected.size > 0 ? `${selected.size}` : 'all'} naloga
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div style={ps.tableWrap}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center' as const, color: '#7A9BB8', fontSize: '13px' }}>Učitavanje...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '80px', textAlign: 'center' as const }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
              <div style={{ fontSize: '15px', fontWeight: '500', color: '#E8F1FB', marginBottom: '4px' }}>Nema neplaćenih faktura!</div>
              <div style={{ fontSize: '12px', color: '#7A9BB8' }}>Sve fakture su izmirene</div>
            </div>
          ) : (
            <table style={ps.table}>
              <thead>
                <tr style={ps.thead}>
                  <th style={ps.th}>
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#00D47E' }} />
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
                      background: isSelected
                        ? 'rgba(245,166,35,0.08)'
                        : isOverdue
                        ? 'rgba(255,91,90,0.05)'
                        : i % 2 === 0 ? '#0D1B2C' : '#0B1826',
                    }}>
                      <td style={ps.td}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.id)} style={{ cursor: 'pointer', accentColor: '#00D47E' }} />
                      </td>
                      <td style={ps.td}>
                        <span style={{ fontSize: '12px', fontWeight: isOverdue ? '600' : '400', color: isOverdue ? '#FF5B5A' : '#DCE9F6', whiteSpace: 'nowrap' as const }}>
                          {inv.due_date || '—'}
                        </span>
                      </td>
                      <td style={ps.td}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#E8F1FB' }}>{inv.partners?.name || '—'}</span>
                      </td>
                      <td style={ps.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: '5px', color: '#7A9BB8', border: '0.5px solid rgba(255,255,255,0.06)' }}>
                            {inv.invoice_number || '—'}
                          </span>
                          {inv.calculated_status === 'partial' && (
                            <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '20px', background: 'rgba(245,166,35,0.15)', color: '#F5A623', border: '0.5px solid rgba(245,166,35,0.3)', whiteSpace: 'nowrap' as const }}>
                              PARTIAL
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={ps.td}>
                        <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px', background: inv.type === 'expense' ? 'rgba(255,91,90,0.12)' : 'rgba(0,212,126,0.12)', color: inv.type === 'expense' ? '#FF5B5A' : '#00D47E', letterSpacing: '0.02em' }}>
                          {inv.type}
                        </span>
                      </td>
                      <td style={{ ...ps.td, textAlign: 'right' as const }}>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: '500', fontFamily: "'DM Mono', monospace", color: '#E8F1FB', whiteSpace: 'nowrap' as const }}>
                            {(inv.amount || 0).toLocaleString('sr-RS')} {inv.currency}
                          </span>
                          {inv.calculated_status === 'partial' && (inv.remaining_usd || 0) < (inv.amount_usd || 0) && (
                            <div style={{ fontSize: '10px', color: '#F5A623', marginTop: '2px', whiteSpace: 'nowrap' as const }}>
                              Preostalo: {((inv.remaining_usd || 0) * (inv.exchange_rate || 1)).toLocaleString('sr-RS', { maximumFractionDigits: 0 })} {inv.currency}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ ...ps.td, textAlign: 'right' as const }}>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: '600', fontFamily: "'DM Mono', monospace", color: inv.calculated_status === 'partial' ? '#F5A623' : '#00D47E' }}>
                            {fmt(inv.calculated_status === 'partial' ? (inv.remaining_usd || 0) : (inv.amount_usd || 0))}
                          </span>
                          {inv.calculated_status === 'partial' && (
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)', marginTop: '2px' }}>
                              od {fmt(inv.amount_usd || 0)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={ps.td}>
                        {partnerAccounts.length > 1 ? (
                          <select
                            style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', padding: '4px 7px', border: `0.5px solid ${hasAccount ? 'rgba(255,255,255,0.08)' : '#FF5B5A'}`, borderRadius: '6px', background: '#111F30', color: '#DCE9F6', maxWidth: '200px', cursor: 'pointer', outline: 'none' }}
                            value={partnerAccounts.find(a => a.account_number === selectedAcc?.account_number)?.id || ''}
                            onChange={e => handleAccountSelect(inv.id, e.target.value, partnerId)}
                          >
                            <option value="">Odaberi račun...</option>
                            {partnerAccounts.map(pa => (
                              <option key={pa.id} value={pa.id}>{pa.account_number}{pa.is_primary ? ' ★' : ''}{pa.bank_name ? ` — ${pa.bank_name.substring(0, 20)}` : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <div>
                            {hasAccount ? (
                              <div>
                                <div style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#7A9BB8' }}>{selectedAcc?.account_number || inv.account_number}</div>
                                {selectedAcc?.bank_name && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '1px' }}>{selectedAcc.bank_name.substring(0, 30)}</div>}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#FF5B5A', fontWeight: '500' }}>⚠ Nema računa</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={ps.td}>
                        {days === null ? (
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>Bez roka</span>
                        ) : days < 0 ? (
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#FF5B5A', background: 'rgba(255,91,90,0.12)', padding: '2px 8px', borderRadius: '20px' }}>{Math.abs(days)}d kasni</span>
                        ) : days === 0 ? (
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#F5A623', background: 'rgba(245,166,35,0.12)', padding: '2px 8px', borderRadius: '20px' }}>Danas!</span>
                        ) : (
                          <span style={{ fontSize: '11px', color: days <= 7 ? '#F5A623' : 'rgba(255,255,255,0.35)' }}>{days}d preostalo</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#060E1A', borderTop: '2px solid rgba(0,212,126,0.25)' }}>
                  <td colSpan={5} style={{ padding: '12px 16px', fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
                    Ukupno ({filtered.length} faktura)
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' as const }}></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' as const, fontFamily: "'DM Mono', monospace", fontSize: '15px', fontWeight: '700', color: '#00D47E' }}>
                    {fmt(totalUnpaid)}
                  </td>
                  <td colSpan={2} style={{ padding: '12px 16px', fontSize: '11px', color: overdueCount > 0 ? '#FF5B5A' : 'rgba(255,255,255,0.25)', fontWeight: overdueCount > 0 ? '600' : '400' }}>
                    {overdueCount > 0 ? `${overdueCount} faktura kasni` : 'Sve na vreme ✓'}
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
      let plQuery = supabase.from('v_pl_entries').select('tx_type,amount_usd').gte('pl_date', ytdStart).lte('pl_date', today)
      if (companyId !== 'all') plQuery = plQuery.eq('company_id', companyId)
      let invQuery = supabase.from('v_invoice_status').select('calculated_status,remaining_usd,due_date').in('calculated_status', ['unpaid', 'partial'])
      if (companyId !== 'all') invQuery = invQuery.eq('company_id', companyId)
      let ptQuery = supabase.from('passthrough').select('id').eq('status', 'unpaired')
      if (companyId !== 'all') ptQuery = ptQuery.eq('company_id', companyId)

      const [{ data: plData }, { data: invData }, { data: ptData }] = await Promise.all([plQuery, invQuery, ptQuery])
      const revenue = (plData || []).filter(e => e.tx_type === 'revenue' || e.tx_type === 'invoice_revenue').reduce((s, e) => s + (e.amount_usd || 0), 0)
      const expenses = (plData || []).filter(e => e.tx_type === 'expense' || e.tx_type === 'invoice_expense').reduce((s, e) => s + (e.amount_usd || 0), 0)
      const openAmt = (invData || []).reduce((s, i) => s + (i.remaining_usd || 0), 0)
      const overdue = (invData || []).filter(i => i.due_date && i.due_date < today).length
      setKpis({ netProfit: revenue - expenses, totalRevenue: revenue, totalExpenses: expenses, expenseRatio: revenue > 0 ? (expenses / revenue * 100) : 0, openInvoicesCount: (invData || []).length, openInvoicesAmount: openAmt, unmatchedPassthrough: (ptData || []).length, overdueCount: overdue })
    } catch (err) { console.error('Reports KPI fetch error:', err) }
    setLoading(false)
  }, [companyId, ytdStart, today])

  useEffect(() => { fetchKpis() }, [fetchKpis])

  const kpiCards = [
    { label: 'Net Profit (YTD)',    value: loading ? '...' : fmtN(kpis.netProfit),                                     sub: `${currentYear} year to date`,  up: kpis.netProfit >= 0,      trend: loading ? '' : kpis.netProfit >= 0 ? 'Profitable' : 'Loss',    accent: kpis.netProfit >= 0 ? '#00D47E' : '#FF5B5A' },
    { label: 'Total Revenue (YTD)', value: loading ? '...' : fmt(kpis.totalRevenue),                                    sub: `${currentYear} year to date`,  up: true,                     trend: loading ? '' : `${fmt(kpis.totalExpenses)} expenses`,           accent: '#00D47E' },
    { label: 'Expense Ratio',       value: loading ? '...' : `${kpis.expenseRatio.toFixed(1)}%`,                        sub: 'Expenses / Revenue YTD',       up: kpis.expenseRatio < 90,   trend: loading ? '' : kpis.expenseRatio < 80 ? 'Healthy' : kpis.expenseRatio < 90 ? 'Watch' : 'High', accent: kpis.expenseRatio < 80 ? '#00D47E' : kpis.expenseRatio < 90 ? '#F5A623' : '#FF5B5A' },
    { label: 'Open Invoices',       value: loading ? '...' : kpis.openInvoicesCount > 0 ? `${kpis.openInvoicesCount} · ${fmt(kpis.openInvoicesAmount)}` : 'None', sub: loading ? '' : kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : 'All on time', up: kpis.overdueCount === 0, trend: loading ? '' : kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : 'On time', accent: kpis.overdueCount > 0 ? '#FF5B5A' : '#4EA8FF' },
  ]

  const reports = [
    { id: 'pl-monthly',       title: 'Monthly P&L',          desc: 'Profit & Loss by month with revenue stream breakdown',            category: 'P&L',        icon: '📊', color: '#0F6E56', bg: '#E1F5EE', page: 'pl' as Page,           action: null },
    { id: 'pl-by-dept',       title: 'P&L by Department',    desc: 'Expense breakdown per organizational unit',                       category: 'P&L',        icon: '👥', color: '#0F6E56', bg: '#E1F5EE', page: 'pl' as Page,           action: null },
    { id: 'cashflow-monthly', title: 'Monthly Cash Flow',    desc: 'Operating and financing activities by period',                    category: 'Cash Flow',  icon: '💰', color: '#0C447C', bg: '#E6F1FB', page: 'cashflow' as Page,     action: null },
    { id: 'bank-rec',         title: 'Bank Reconciliation',  desc: 'Statement vs. recorded transactions per account',                 category: 'Cash Flow',  icon: '🏦', color: '#0C447C', bg: '#E6F1FB', page: 'cashflow' as Page,     action: null },
    { id: 'passthrough',      title: 'Pass-through Balance', desc: 'Pass-through IN vs. OUT monthly balance',                         category: 'Compliance', icon: '⚖️', color: '#633806', bg: '#FAEEDA', page: 'cashflow' as Page,     action: null },
    { id: 'unmatched',        title: 'Unmatched Invoices',   desc: 'Neplaćene fakture · Constellation LLC · Hal E-Bank TKDIS export', category: 'Compliance', icon: '⚠️', color: '#854F0B', bg: '#FAEEDA', page: 'reports' as Page,      action: 'unpaid' },
    { id: 'exchange-rates',   title: 'Exchange Rate Log',    desc: 'Rates used per period and transaction',                           category: 'Reference',  icon: '💱', color: '#444',    bg: '#f0f0ee', page: 'reports' as Page,      action: null },
    { id: 'partner-summary',  title: 'Partner Summary',      desc: 'Total transactions per partner across all entities',               category: 'Reference',  icon: '🤝', color: '#444',    bg: '#f0f0ee', page: 'partners' as Page,     action: null },
  ]

  const categories = ['P&L', 'Cash Flow', 'Compliance', 'Reference']
  const categoryColors: Record<string, { color: string; bg: string; accent: string }> = {
    'P&L':        { color: '#0F6E56', bg: '#E1F5EE', accent: '#00D47E' },
    'Cash Flow':  { color: '#0C447C', bg: '#E6F1FB', accent: '#4EA8FF' },
    'Compliance': { color: '#633806', bg: '#FAEEDA', accent: '#F5A623' },
    'Reference':  { color: '#555',    bg: '#f0f0ee', accent: '#7A9BB8' },
  }

  return (
    <div style={s.root}>
      <div style={s.body}>

        {/* ── Page header ── */}
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Reports</div>
            <div style={s.pageSub}>Financial reports and analytics · YTD {currentYear}</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select style={s.filterSelect} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="all">All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={fetchKpis} style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', padding: '8px 14px', border: '1px solid rgba(0,212,126,0.3)', borderRadius: '9px', background: 'rgba(0,212,126,0.06)', color: '#00D47E', cursor: 'pointer', fontWeight: '500' }}>↻ Refresh</button>
          </div>
        </div>

        {/* ── KPI section label ── */}
        <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: '10px' }}>
          Key metrics · {currentYear} year to date
        </div>

        {/* ── KPI grid ── */}
        <div style={s.kpiGrid}>
          {kpiCards.map(k => (
            <div key={k.label} style={{ ...s.kpiCard, borderTop: `2.5px solid ${k.accent}` }}>
              <div style={s.kpiLabel}>{k.label}</div>
              <div style={{ ...s.kpiValue, color: k.accent }}>{k.value}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                <span style={{ ...s.kpiTrend, color: k.up ? '#00D47E' : '#FF5B5A', background: k.up ? 'rgba(0,212,126,0.12)' : 'rgba(255,91,90,0.12)' }}>
                  {k.up ? '↑' : '↓'} {k.trend}
                </span>
                <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.25)' }}>{k.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Alert banner ── */}
        {!loading && (kpis.overdueCount > 0 || kpis.unmatchedPassthrough > 0) && (
          <div style={s.alertBox}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#F5A623', marginBottom: '8px', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>Attention required</div>
            {kpis.overdueCount > 0 && (
              <div style={s.alertRow}>
                <span style={s.alertDot} />
                <span style={{ fontSize: '12px', color: '#DCE9F6' }}>
                  {kpis.overdueCount} invoice{kpis.overdueCount > 1 ? 's' : ''} past due date —{' '}
                  <span style={{ color: '#F5A623', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(245,166,35,0.4)' }} onClick={() => setShowUnpaidPanel(true)}>
                    open Unmatched Invoices
                  </span>.
                </span>
              </div>
            )}
            {kpis.unmatchedPassthrough > 0 && (
              <div style={s.alertRow}>
                <span style={s.alertDot} />
                <span style={{ fontSize: '12px', color: '#DCE9F6' }}>{kpis.unmatchedPassthrough} pass-through entr{kpis.unmatchedPassthrough === 1 ? 'y' : 'ies'} unpaired — review Cash Flow tab.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Report categories ── */}
        {categories.map(cat => (
          <div key={cat} style={s.categorySection}>
            <div style={s.categoryHeader}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: categoryColors[cat].accent, flexShrink: 0 }} />
              <span style={{ ...s.categoryBadge, color: categoryColors[cat].color, background: categoryColors[cat].bg }}>{cat}</span>
              <span style={s.categoryCount}>{reports.filter(r => r.category === cat).length} reports</span>
              <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
            </div>
            <div style={s.reportsGrid}>
              {reports.filter(r => r.category === cat).map(report => (
                <ReportCard
                  key={report.id}
                  report={report}
                  active={activeReport === report.id}
                  onClick={() => setActiveReport(activeReport === report.id ? '' : report.id)}
                  onView={() => {
                    if (report.action === 'unpaid') setShowUnpaidPanel(true)
                    else setPage(report.page)
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showUnpaidPanel && <UnpaidInvoicesPanel onClose={() => setShowUnpaidPanel(false)} />}
    </div>
  )
}

// ── Report Card component ─────────────────────────────────
function ReportCard({ report, active, onClick, onView }: { report: any; active: boolean; onClick: () => void; onView: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...s.reportCard,
        border: active ? `1.5px solid ${report.color}` : hov ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
        background: active ? `${report.color}08` : hov ? '#111F30' : '#0D1B2C',
        transform: hov ? 'translateY(-1px)' : 'none',
      }}
      onClick={onClick}
    >
      <div style={{ ...s.reportIcon, background: active ? `${report.color}22` : report.bg }}>
        <span style={{ fontSize: '18px' }}>{report.icon}</span>
      </div>
      <div style={s.reportInfo}>
        <div style={s.reportTitle}>{report.title}</div>
        <div style={s.reportDesc}>{report.desc}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
        <button
          style={{ ...s.reportBtn, color: report.color, borderColor: report.color + '40', background: active ? `${report.color}18` : report.bg }}
          onClick={e => { e.stopPropagation(); onView() }}>
          View →
        </button>
      </div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#060E1A', fontFamily: "'Inter', system-ui, sans-serif" },
  body: { padding: '28px 32px' },
  pageHeader: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '28px', gap: '24px' },
  pageTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '28px', fontWeight: '400', color: '#E8F1FB', marginBottom: '5px', letterSpacing: '-0.01em', lineHeight: 1.1 },
  pageSub: { fontSize: '13px', color: '#7A9BB8', letterSpacing: '0.005em' },
  filterSelect: { fontFamily: "'Inter', sans-serif", fontSize: '13px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '9px', padding: '8px 14px', outline: 'none', background: '#0D1B2C', color: '#DCE9F6', cursor: 'pointer', minWidth: '180px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '10px' },
  kpiCard: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '18px 20px', position: 'relative' as const, overflow: 'hidden' },
  kpiLabel: { fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' as const, letterSpacing: '0.11em', marginBottom: '10px' },
  kpiValue: { fontFamily: "'DM Mono', 'Fira Mono', monospace", fontSize: '26px', fontWeight: '500', letterSpacing: '-0.02em', lineHeight: 1 },
  kpiTrend: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '600', padding: '3px 9px', borderRadius: '20px' },
  alertBox: { background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.20)', borderLeft: '3px solid #F5A623', borderRadius: '10px', padding: '14px 18px', marginBottom: '28px', marginTop: '10px' },
  alertRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  alertDot: { width: '5px', height: '5px', borderRadius: '50%', background: '#F5A623', flexShrink: 0 },
  categorySection: { marginBottom: '28px' },
  categoryHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  categoryBadge: { fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' as const, letterSpacing: '0.1em' },
  categoryCount: { fontSize: '11px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em' },
  reportsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' },
  reportCard: { background: '#0D1B2C', borderRadius: '12px', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s, transform 0.15s' },
  reportIcon: { width: '42px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reportInfo: { flex: 1, minWidth: 0 },
  reportTitle: { fontSize: '13.5px', fontWeight: '500', color: '#E8F1FB', marginBottom: '3px', letterSpacing: '-0.005em' },
  reportDesc: { fontSize: '11.5px', color: '#7A9BB8', lineHeight: 1.45 },
  reportActions: { display: 'flex', gap: '6px', flexShrink: 0 },
  reportBtn: { fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: '500', padding: '5px 13px', borderRadius: '7px', border: '1px solid', cursor: 'pointer' },
}

const ps: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', zIndex: 1000 },
  panel: { background: '#0B1929', width: '92vw', maxWidth: '1240px', height: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 48px rgba(0,0,0,0.6)', borderLeft: '1px solid rgba(255,255,255,0.06)' },
  header: { background: '#060E1A', padding: '18px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  headerTitle: { color: '#E8F1FB', fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '20px', fontWeight: '400', letterSpacing: '-0.01em' },
  headerSub: { color: '#7A9BB8', fontSize: '12px', marginTop: '4px' },
  closeBtn: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#7A9BB8', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '0', width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  toolbar: { display: 'flex', gap: '8px', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, flexWrap: 'wrap' as const, background: '#0D1B2C' },
  searchInput: { flex: 1, fontFamily: "'Inter', sans-serif", fontSize: '13px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 12px', outline: 'none', minWidth: '180px', background: '#111F30', color: '#DCE9F6' },
  sel: { fontFamily: "'Inter', sans-serif", fontSize: '13px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 10px', outline: 'none', background: '#111F30', color: '#DCE9F6', cursor: 'pointer' },
  exportBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: 'rgba(245,166,35,0.07)', borderBottom: '1px solid rgba(245,166,35,0.18)', borderLeft: '3px solid #F5A623', flexShrink: 0, flexWrap: 'wrap' as const, gap: '8px' },
  exportBtn: { fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: '700', padding: '7px 18px', borderRadius: '8px', border: 'none', background: '#F5A623', color: '#060E1A', cursor: 'pointer', letterSpacing: '0.02em' },
  tableWrap: { flex: 1, overflowY: 'auto' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  thead: { background: '#0A1525', position: 'sticky' as const, top: 0, zIndex: 10 },
  th: { padding: '10px 16px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' as const, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' as const },
  tr: { borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' },
  td: { padding: '11px 16px', verticalAlign: 'middle' as const },
}