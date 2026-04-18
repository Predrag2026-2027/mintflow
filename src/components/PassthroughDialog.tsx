import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getRate, convertToUSD } from '../services/currencyService'

interface Props {
  onClose: () => void
  passthrough?: any
}

export default function PassthroughDialog({ onClose, passthrough }: Props) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const [companies, setCompanies] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [allBanks, setAllBanks] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [unpaired, setUnpaired] = useState<any[]>([])

  // Step 1
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [bankId, setBankId] = useState('')
  const [currency, setCurrency] = useState('')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [statement, setStatement] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [partnerSearch, setPartnerSearch] = useState('')
  const [newPartnerName, setNewPartnerName] = useState('')
  const [showNewPartner, setShowNewPartner] = useState(false)

  // Step 2
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [pairId, setPairId] = useState('')
  const [periodMonth, setPeriodMonth] = useState(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  )
  const [note, setNote] = useState('')

  // Step 3
  const [amount, setAmount] = useState('')
  const [exRate, setExRate] = useState('')
  const [rateSource, setRateSource] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)

  const usdAmount = (() => {
    const a = parseFloat(amount) || 0
    const r = parseFloat(exRate) || 0
    return convertToUSD(a, currency, r)
  })()

  useEffect(() => {
    const load = async () => {
      const [{ data: comp }, { data: bnk }, { data: part }] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('banks').select('*').order('name'),
        supabase.from('partners').select('*').order('name'),
      ])
      if (comp) setCompanies(comp)
      if (bnk) setAllBanks(bnk)
      if (part) setPartners(part)
    }
    load()
  }, [])

  useEffect(() => {
    if (companyId) {
      setBanks(allBanks.filter(b => b.company_id === companyId))
      if (!passthrough) { setBankId(''); setCurrency('') }
    }
  }, [companyId, allBanks, passthrough])

  // Load unpaired passthroughs for pairing
  useEffect(() => {
    if (!companyId) return
    const fetchUnpaired = async () => {
      const { data } = await supabase
        .from('passthrough')
        .select('*, partners(name), banks(name)')
        .eq('company_id', companyId)
        .eq('status', 'unpaired')
        .neq('direction', direction) // only show opposite direction
        .order('transaction_date', { ascending: false })
      if (data) setUnpaired(data)
    }
    fetchUnpaired()
  }, [companyId, direction])

  useEffect(() => {
    if (passthrough) {
      setCompanyId(passthrough.company_id || '')
      setCompanyName(passthrough.companies?.name || '')
      setBankId(passthrough.bank_id || '')
      setCurrency(passthrough.currency || '')
      setTxDate(passthrough.transaction_date || '')
      setStatement(passthrough.statement_number || '')
      setPartnerId(passthrough.partner_id || '')
      setPartnerSearch(passthrough.partners?.name || '')
      setDirection(passthrough.direction || 'in')
      setPairId(passthrough.pair_id || '')
      setPeriodMonth(passthrough.period_month || new Date().toISOString().slice(0, 7))
      setNote(passthrough.note || '')
      setAmount(passthrough.amount?.toString() || '')
      setExRate(passthrough.exchange_rate?.toString() || '')
    }
  }, [passthrough])

  const filteredPartners = partners.filter(p =>
    !partnerSearch || p.name.toLowerCase().includes(partnerSearch.toLowerCase())
  )

  const fetchRate = async () => {
    if (!currency || currency === 'USD') { setExRate('1'); setRateSource('N/A'); return }
    setFetchingRate(true)
    try {
      const rateData = await getRate(currency, txDate, false)
      setExRate(rateData.rate.toString())
      setRateSource(rateData.source)
    } catch {
      const fallbacks: Record<string, number> = { RSD: 117.0, EUR: 1.08, AED: 0.272 }
      setExRate(fallbacks[currency]?.toString() || '')
      setRateSource('Fallback')
    }
    setFetchingRate(false)
  }

  const stepTitles = ['Basic information', 'Direction & pairing', 'Amount & review']

  const handlePost = async () => {
    setSaving(true)
    try {
      let finalPartnerId = partnerId
      if (showNewPartner && newPartnerName) {
        const { data: newP } = await supabase
          .from('partners').insert({ name: newPartnerName }).select().single()
        if (newP) finalPartnerId = newP.id
      }

      const payload = {
        company_id: companyId || null,
        bank_id: bankId || null,
        partner_id: finalPartnerId || null,
        direction,
        pair_id: pairId || null,
        period_month: periodMonth,
        currency,
        amount: parseFloat(amount),
        exchange_rate: parseFloat(exRate) || null,
        amount_usd: usdAmount,
        transaction_date: txDate,
        statement_number: statement || null,
        note: note || null,
        pl_impact: false,
        status: pairId ? 'paired' : 'unpaired',
      }

      let ptId: string

      if (passthrough?.id) {
        await supabase.from('passthrough').update(payload).eq('id', passthrough.id)
        ptId = passthrough.id
      } else {
        const { data: newPt } = await supabase
          .from('passthrough').insert(payload).select().single()
        ptId = newPt?.id
      }

      // If paired, update the pair's status too
      if (pairId && ptId) {
        await supabase
          .from('passthrough')
          .update({ pair_id: ptId, status: 'paired' })
          .eq('id', pairId)

        // Check if both sides are now balanced (same amount)
        const { data: pairData } = await supabase
          .from('passthrough').select('amount_usd').eq('id', pairId).single()

        if (pairData && Math.abs(pairData.amount_usd - usdAmount) < 0.01) {
          await supabase.from('passthrough').update({ status: 'balanced' }).eq('id', pairId)
          await supabase.from('passthrough').update({ status: 'balanced' }).eq('id', ptId)
        }
      }

      setSuccess(true)
      setTimeout(() => { setSuccess(false); onClose() }, 1500)
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  // Balance check for selected pair
  const selectedPair = unpaired.find(p => p.id === pairId)
  const balanceDiff = selectedPair
    ? Math.abs((selectedPair.amount_usd || 0) - usdAmount)
    : null
  const isBalanced = balanceDiff !== null && balanceDiff < 0.01

  if (success) return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', minHeight: '220px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '20px', color: '#111' }}>
          Pass-through posted!
        </div>
        <div style={{ fontSize: '13px', color: '#888' }}>
          {pairId
            ? isBalanced ? 'Paired and balanced ✓' : 'Paired — amounts differ, check balance.'
            : 'Unpaired — waiting for matching entry.'}
        </div>
      </div>
    </div>
  )

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>{passthrough ? 'Edit pass-through' : 'New pass-through'}</div>
            <div style={s.headerSub}>Step {step} of 3 — {stepTitles[step - 1]}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={s.ptBadge}>Cash Flow Only</div>
            <span style={s.logoText}>Mintflow</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>

        {/* Steps bar */}
        <div style={s.stepsBar}>
          {stepTitles.map((t, i) => (
            <React.Fragment key={i}>
              <div style={s.stepItem} onClick={() => setStep(i + 1)}>
                <div style={{ ...s.stepNum, ...(step === i + 1 ? s.stepActive : {}), ...(step > i + 1 ? s.stepDone : {}) }}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span style={{ ...s.stepLabel, ...(step === i + 1 ? { color: '#0C447C', fontWeight: '500' } : {}) }}>{t}</span>
              </div>
              {i < 2 && <div style={s.stepDiv} />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div style={s.body}>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <div style={s.infoBox}>
                Pass-through entries affect <strong>cash flow only</strong> — never P&L. IN and OUT entries must balance to zero. They may span across months.
              </div>

              <div style={{ ...s.section, marginTop: '16px' }}>
                <div style={s.sectionTitle}>Company & bank</div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Company <span style={s.req}>*</span></label>
                    <select style={s.select} value={companyId} onChange={e => {
                      setCompanyId(e.target.value)
                      setCompanyName(companies.find(c => c.id === e.target.value)?.name || '')
                    }}>
                      <option value="">Select company...</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Bank / Account <span style={s.req}>*</span></label>
                    <select style={s.select} value={bankId} onChange={e => setBankId(e.target.value)}>
                      <option value="">Select bank...</option>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Currency <span style={s.req}>*</span></label>
                    <select style={s.select} value={currency} onChange={e => setCurrency(e.target.value)}>
                      <option value="">Select...</option>
                      {companyName === 'SFBC' && <option>USD</option>}
                      {companyName === 'Constellation LLC' && <><option>RSD</option><option>USD</option><option>EUR</option></>}
                      {companyName === 'Social Growth LLC-FZ' && <><option>USD</option><option>AED</option></>}
                      {!companyName && <><option>USD</option><option>RSD</option><option>EUR</option><option>AED</option></>}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Statement number</label>
                    <input style={s.input} value={statement} onChange={e => setStatement(e.target.value)} placeholder="e.g. 2026-001" />
                  </div>
                </div>
              </div>

              <div style={s.section}>
                <div style={s.sectionTitle}>Date & partner</div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Transaction date <span style={s.req}>*</span></label>
                    <input type="date" style={s.input} value={txDate} onChange={e => setTxDate(e.target.value)} />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Period month <span style={s.req}>*</span></label>
                    <input type="month" style={s.input} value={periodMonth} onChange={e => setPeriodMonth(e.target.value)} />
                  </div>
                </div>
                <div style={s.field}>
                  <label style={s.lbl}>Partner</label>
                  {!showNewPartner ? (
                    <>
                      <input style={s.input} value={partnerSearch}
                        onChange={e => { setPartnerSearch(e.target.value); setPartnerId('') }}
                        placeholder="Search partner..." />
                      {partnerSearch && !partnerId && (
                        <div style={s.dropdown}>
                          {filteredPartners.slice(0, 6).map(p => (
                            <div key={p.id} style={s.dropdownItem}
                              onClick={() => { setPartnerId(p.id); setPartnerSearch(p.name) }}>
                              {p.name}
                            </div>
                          ))}
                          <div style={{ ...s.dropdownItem, color: '#1D9E75' }}
                            onClick={() => { setShowNewPartner(true); setPartnerSearch('') }}>
                            + Add new partner
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <input style={s.input} value={newPartnerName}
                        onChange={e => setNewPartnerName(e.target.value)}
                        placeholder="New partner name..." />
                      <button style={s.linkBtn} onClick={() => setShowNewPartner(false)}>← Back to search</button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <div style={s.section}>
                <div style={s.sectionTitle}>Direction <span style={s.req}>*</span></div>
                <div style={s.dirGrid}>
                  <div
                    style={{ ...s.dirCard, ...(direction === 'in' ? s.dirCardIn : {}) }}
                    onClick={() => { setDirection('in'); setPairId('') }}
                  >
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>📥</div>
                    <div style={s.dirTitle}>Pass-through IN</div>
                    <div style={s.dirSub}>Money received on behalf of a third party. Will need a matching OUT.</div>
                  </div>
                  <div
                    style={{ ...s.dirCard, ...(direction === 'out' ? s.dirCardOut : {}) }}
                    onClick={() => { setDirection('out'); setPairId('') }}
                  >
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>📤</div>
                    <div style={s.dirTitle}>Pass-through OUT</div>
                    <div style={s.dirSub}>Money paid out on behalf of a third party. Will need a matching IN.</div>
                  </div>
                </div>
              </div>

              <div style={s.section}>
                <div style={s.sectionTitle}>Pair with existing entry</div>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
                  Optionally link this entry to an existing unpaired {direction === 'in' ? 'OUT' : 'IN'} entry from the same company. This can be done now or later.
                </div>

                {unpaired.length === 0 ? (
                  <div style={s.emptyState}>
                    No unpaired {direction === 'in' ? 'OUT' : 'IN'} entries found for this company. You can pair later.
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={s.lbl}>Select pair (optional)</label>
                    </div>
                    <div style={s.pairList}>
                      {/* No pair option */}
                      <div
                        style={{ ...s.pairRow, ...(!pairId ? s.pairRowSelected : {}) }}
                        onClick={() => setPairId('')}
                      >
                        <div style={s.pairRadio}>
                          <div style={{ ...s.pairRadioInner, ...((!pairId) ? s.pairRadioActive : {}) }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#888' }}>No pair — post as unpaired</div>
                          <div style={{ fontSize: '11px', color: '#aaa' }}>Match later when the other side arrives.</div>
                        </div>
                      </div>

                      {unpaired.map(p => (
                        <div
                          key={p.id}
                          style={{ ...s.pairRow, ...(pairId === p.id ? s.pairRowSelected : {}) }}
                          onClick={() => setPairId(p.id)}
                        >
                          <div style={s.pairRadio}>
                            <div style={{ ...s.pairRadioInner, ...(pairId === p.id ? s.pairRadioActive : {}) }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>
                                {p.partners?.name || '—'}
                              </span>
                              <span style={{ fontSize: '11px', color: '#888', background: '#f0f0ee', padding: '1px 6px', borderRadius: '4px' }}>
                                {direction === 'in' ? 'OUT' : 'IN'}
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                              {p.transaction_date} · Period: {p.period_month} · {p.banks?.name}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' as const }}>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>
                              {(p.amount || 0).toLocaleString()} {p.currency}
                            </div>
                            <div style={{ fontSize: '11px', color: '#888' }}>
                              ${(p.amount_usd || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Balance check */}
                    {pairId && usdAmount > 0 && (
                      <div style={{
                        ...s.balanceBox,
                        ...(isBalanced ? s.balanceBoxOk : s.balanceBoxWarn)
                      }}>
                        {isBalanced ? (
                          <>✅ Amounts match — this pair will be marked as <strong>balanced</strong>.</>
                        ) : (
                          <>⚠️ Amounts differ by <strong>${balanceDiff?.toFixed(2)}</strong>. Pair will be marked as <strong>paired</strong> but not yet balanced.</>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={s.section}>
                <div style={s.sectionTitle}>Note</div>
                <textarea style={s.textarea} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Description of this pass-through entry..." />
              </div>
            </>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <>
              <div style={s.section}>
                <div style={s.sectionTitle}>Amount & currency conversion</div>
                <div style={{ ...s.infoBox, marginBottom: '12px' }}>
                  {currency === 'USD'
                    ? 'No conversion needed — amount is already in USD.'
                    : `Rate fetched on transaction date (${txDate}).`}
                </div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Amount ({currency || '—'}) <span style={s.req}>*</span></label>
                    <input type="number" style={s.input} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Exchange rate</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input type="number" style={{ ...s.input, flex: 1 }} value={exRate}
                        onChange={e => setExRate(e.target.value)}
                        placeholder={currency === 'USD' ? 'N/A' : 'Click Fetch'} />
                      {currency !== 'USD' && (
                        <button style={s.fetchBtn} onClick={fetchRate} disabled={fetchingRate}>
                          {fetchingRate ? '...' : 'Fetch'}
                        </button>
                      )}
                    </div>
                    {rateSource && <div style={{ fontSize: '11px', color: '#0C447C', marginTop: '4px' }}>Source: {rateSource}</div>}
                  </div>
                </div>
                <div style={s.convRow}>
                  <div>
                    <div style={s.convLabel}>Original amount</div>
                    <div style={s.convVal}>{amount ? `${parseFloat(amount).toLocaleString()} ${currency}` : '—'}</div>
                  </div>
                  <div style={{ fontSize: '20px', color: '#aaa', alignSelf: 'flex-end', paddingBottom: '4px' }}>→</div>
                  <div>
                    <div style={s.convLabel}>USD equivalent</div>
                    <div style={{ ...s.convVal, color: '#0C447C' }}>${usdAmount > 0 ? usdAmount.toFixed(2) : '0.00'}</div>
                  </div>
                </div>
              </div>

              {/* Balance re-check after amount is entered */}
              {pairId && usdAmount > 0 && selectedPair && (
                <div style={{
                  ...s.balanceBox,
                  marginBottom: '16px',
                  ...(isBalanced ? s.balanceBoxOk : s.balanceBoxWarn)
                }}>
                  {isBalanced
                    ? <>✅ Amounts match — pair will be marked as <strong>balanced</strong>.</>
                    : <>⚠️ Difference of <strong>${balanceDiff?.toFixed(2)}</strong> with paired entry (${(selectedPair.amount_usd || 0).toFixed(2)}). Pair will be <strong>paired but not balanced</strong>.</>
                  }
                </div>
              )}

              {/* Review */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Review</div>

                {[
                  {
                    title: 'Entry info', rows: [
                      ['Company', companies.find(c => c.id === companyId)?.name || '—'],
                      ['Bank', banks.find(b => b.id === bankId)?.name || '—'],
                      ['Partner', showNewPartner ? newPartnerName : (partners.find(p => p.id === partnerId)?.name || partnerSearch || '—')],
                      ['Date', txDate],
                      ['Period month', periodMonth],
                      ['Statement', statement || '—'],
                      ['Direction', direction === 'in' ? '📥 Pass-through IN' : '📤 Pass-through OUT'],
                    ]
                  },
                  {
                    title: 'Pairing & status', rows: [
                      ['Pair', pairId
                        ? (selectedPair ? `${selectedPair.partners?.name || '—'} · ${selectedPair.transaction_date}` : 'Selected')
                        : 'None — will be unpaired'],
                      ['Expected status', pairId ? (isBalanced ? 'Balanced ✅' : 'Paired (amounts differ) ⚠️') : 'Unpaired'],
                      ['P&L impact', 'None — cash flow only'],
                    ]
                  },
                  {
                    title: 'Amounts', rows: [
                      ['Original amount', amount ? `${parseFloat(amount).toLocaleString()} ${currency}` : '—'],
                      ['Exchange rate', exRate ? `${parseFloat(exRate).toFixed(4)} (${rateSource || 'Manual'})` : 'N/A'],
                      ['USD equivalent', `$${usdAmount.toFixed(2)}`],
                    ]
                  },
                ].map(sec => (
                  <div key={sec.title} style={s.reviewSection}>
                    <div style={s.reviewTitle}>{sec.title}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      {sec.rows.map(([k, v]) => (
                        <tr key={k}>
                          <td style={{ color: '#888', padding: '5px 0', width: '45%', borderBottom: '0.5px solid #f0f0ee' }}>{k}</td>
                          <td style={{ fontWeight: '500', color: '#111', padding: '5px 0', borderBottom: '0.5px solid #f0f0ee' }}>{v}</td>
                        </tr>
                      ))}
                    </table>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <span style={{ fontSize: '12px', color: '#888' }}>Step {step} of 3</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 1 && <button style={s.btnGhost} onClick={() => setStep(step - 1)}>Back</button>}
            {step < 3 && <button style={s.btnPrimary} onClick={() => setStep(step + 1)}>Continue</button>}
            {step === 3 && (
              <button style={s.btnPrimary} onClick={handlePost} disabled={saving}>
                {saving ? 'Saving...' : passthrough ? 'Update entry' : 'Post entry'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  dialog: { background: '#fff', borderRadius: '16px', width: '800px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { background: '#0a1628', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: '15px', fontWeight: '500' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: '12px', marginTop: '2px' },
  logoText: { color: '#1D9E75', fontFamily: 'Georgia,serif', fontSize: '14px' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  ptBadge: { fontSize: '10px', fontWeight: '500', padding: '3px 8px', borderRadius: '20px', background: 'rgba(12,68,124,0.2)', color: '#7FB8EE', border: '0.5px solid rgba(12,68,124,0.3)' },
  stepsBar: { display: 'flex', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '0.5px solid #e5e5e5', gap: 0, overflowX: 'auto' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', whiteSpace: 'nowrap' },
  stepNum: { width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '500', background: '#f0f0ee', color: '#888', border: '0.5px solid #e5e5e5', flexShrink: 0 },
  stepActive: { background: '#0C447C', color: '#fff', borderColor: '#0C447C' },
  stepDone: { background: '#E6F1FB', color: '#0C447C', borderColor: '#0C447C' },
  stepLabel: { fontSize: '12px', color: '#888' },
  stepDiv: { width: '20px', height: '0.5px', background: '#e5e5e5', flexShrink: 0 },
  body: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '1rem 1.5rem', borderTop: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f5f5f3' },
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid #e5e5e5' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '4px', position: 'relative' as const },
  lbl: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  req: { color: '#E24B4A' },
  select: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  input: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  textarea: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none', resize: 'vertical' as const, minHeight: '70px', width: '100%', boxSizing: 'border-box' as const },
  dropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginTop: '2px' },
  dropdownItem: { padding: '8px 12px', fontSize: '13px', color: '#111', cursor: 'pointer', borderBottom: '0.5px solid #f0f0ee' },
  linkBtn: { background: 'none', border: 'none', color: '#1D9E75', fontSize: '12px', cursor: 'pointer', padding: '4px 0', fontFamily: 'system-ui,sans-serif' },
  infoBox: { background: '#E6F1FB', border: '0.5px solid #7FB8EE', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#0C447C' },
  dirGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  dirCard: { border: '0.5px solid #e5e5e5', borderRadius: '10px', padding: '18px 16px', background: '#f5f5f3', cursor: 'pointer', textAlign: 'center' as const },
  dirCardIn: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  dirCardOut: { border: '2px solid #A32D2D', background: '#FCEBEB' },
  dirTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '6px' },
  dirSub: { fontSize: '11px', color: '#888', lineHeight: '1.5' },
  emptyState: { padding: '16px', textAlign: 'center' as const, color: '#aaa', fontSize: '13px', background: '#f5f5f3', borderRadius: '8px' },
  pairList: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  pairRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', cursor: 'pointer' },
  pairRowSelected: { border: '1.5px solid #0C447C', background: '#E6F1FB' },
  pairRadio: { width: '16px', height: '16px', borderRadius: '50%', border: '1.5px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pairRadioInner: { width: '8px', height: '8px', borderRadius: '50%', background: 'transparent' },
  pairRadioActive: { background: '#0C447C' },
  balanceBox: { padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginTop: '12px' },
  balanceBoxOk: { background: '#E1F5EE', border: '0.5px solid #5DCAA5', color: '#085041' },
  balanceBoxWarn: { background: '#FAEEDA', border: '0.5px solid #E5B96A', color: '#633806' },
  convRow: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center', marginTop: '12px', padding: '12px', background: '#f5f5f3', borderRadius: '8px' },
  convLabel: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  convVal: { fontSize: '16px', fontWeight: '500', color: '#111' },
  fetchBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#f5f5f3', color: '#666', cursor: 'pointer' },
  reviewSection: { background: '#f5f5f3', borderRadius: '8px', padding: '12px', marginBottom: '10px' },
  reviewTitle: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '8px' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#0C447C', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}