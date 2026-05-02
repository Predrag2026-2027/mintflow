import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getRate, convertToUSD } from '../services/currencyService'

interface Props {
  onClose: () => void
  onImported: () => void
}

interface StatementRow {
  id: string
  date: string
  partner_name: string
  description: string
  debit: string
  credit: string
  reference_number: string
  model: string
  account_number: string
  currency: string
}

function makeRow(id: number): StatementRow {
  return {
    id: `row_${id}`,
    date: new Date().toISOString().split('T')[0],
    partner_name: '',
    description: '',
    debit: '',
    credit: '',
    reference_number: '',
    model: '',
    account_number: '',
    currency: '',
  }
}

export default function BankStatementDialog({ onClose, onImported }: Props) {
  const [company, setCompany] = useState('')
  const [bank, setBank] = useState('')
  const [statementNumber, setStatementNumber] = useState('')
  const [currency, setCurrency] = useState('RSD')
  const [companies, setCompanies] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [allBanks, setAllBanks] = useState<any[]>([])
  const [rows, setRows] = useState<StatementRow[]>([makeRow(1), makeRow(2), makeRow(3)])
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState(false)
  const [error, setError] = useState('')
  const [rowCounter, setRowCounter] = useState(4)

  useEffect(() => {
    const load = async () => {
      const [{ data: comp }, { data: bnk }] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('banks').select('*').order('name'),
      ])
      if (comp) setCompanies(comp)
      if (bnk) setAllBanks(bnk)
    }
    load()
  }, [])

  useEffect(() => {
    if (company) setBanks(allBanks.filter(b => b.company_id === company))
    else setBanks([])
  }, [company, allBanks])

  const addRow = () => {
    setRows(prev => [...prev, makeRow(rowCounter)])
    setRowCounter(prev => prev + 1)
  }

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const updateRow = (id: string, field: keyof StatementRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const validRows = rows.filter(r => r.date && (parseFloat(r.debit) > 0 || parseFloat(r.credit) > 0))

  const handlePost = async () => {
    if (!company || !bank) { setError('Please select company and bank.'); return }
    if (validRows.length === 0) { setError('Add at least one row with a date and amount.'); return }
    setPosting(true)
    setError('')

    const rateCache: Record<string, number> = {}
    const getExRate = async (cur: string, date: string) => {
      if (cur === 'USD') return 1
      const key = `${cur}_${date}`
      if (rateCache[key]) return rateCache[key]
      try {
        const rateData = await getRate(cur, date)
        rateCache[key] = rateData.rate
        return rateData.rate
      } catch {
        const fallbacks: Record<string, number> = { RSD: 117.0, EUR: 1.08, AED: 0.272 }
        return fallbacks[cur] || 1
      }
    }

    try {
      for (const row of validRows) {
        const isExpense = parseFloat(row.debit) > 0
        const amount = isExpense ? parseFloat(row.debit) : parseFloat(row.credit)
        const rowCurrency = row.currency || currency
        const exRate = await getExRate(rowCurrency, row.date)
        const amountUsd = convertToUSD(amount, rowCurrency, exRate)

        // Find or create partner
        let partnerId: string | null = null
        if (row.partner_name.trim()) {
          const { data: existing } = await supabase.from('partners')
            .select('id').ilike('name', row.partner_name.trim()).single()
          if (existing) {
            partnerId = existing.id
          } else {
            const { data: newP } = await supabase.from('partners')
              .insert({ name: row.partner_name.trim() }).select().single()
            if (newP) partnerId = newP.id
          }
        }

        await supabase.from('transactions').insert({
          company_id: company,
          bank_id: bank,
          partner_id: partnerId,
          transaction_date: row.date,
          statement_number: statementNumber || null,
          type: 'direct',
          tx_subtype: isExpense ? 'expense' : 'revenue',
          currency: rowCurrency,
          amount,
          exchange_rate: exRate,
          amount_usd: amountUsd,
          pl_impact: false,
          account_number: row.account_number || null,
          model: row.model || null,
          reference_number: row.reference_number || null,
          note: row.description || null,
          status: 'posted',
        })
      }
      setPosted(true)
      setTimeout(() => { onImported(); onClose() }, 1500)
    } catch (err: any) {
      setError(`Error posting: ${err.message}`)
    }
    setPosting(false)
  }

  const totalDebit = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0)

  if (posted) return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '220px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '20px', color: '#111' }}>Statement posted!</div>
        <div style={{ fontSize: '13px', color: '#888' }}>{validRows.length} transaction{validRows.length !== 1 ? 's' : ''} added.</div>
      </div>
    </div>
  )

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>🏦 Manual bank statement entry</div>
            <div style={s.headerSub}>Enter transactions row by row from your bank statement</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={s.body}>
          {/* Company / Bank / Statement */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Statement details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px 120px', gap: '12px' }}>
              <div style={s.field}>
                <label style={s.lbl}>Company <span style={s.req}>*</span></label>
                <select style={s.select} value={company} onChange={e => setCompany(e.target.value)}>
                  <option value="">Select company...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.lbl}>Bank account <span style={s.req}>*</span></label>
                <select style={s.select} value={bank} onChange={e => setBank(e.target.value)} disabled={!company}>
                  <option value="">Select bank...</option>
                  {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.lbl}>Statement #</label>
                <input style={s.input} value={statementNumber} onChange={e => setStatementNumber(e.target.value)} placeholder="e.g. 2026-05" />
              </div>
              <div style={s.field}>
                <label style={s.lbl}>Default currency</label>
                <select style={s.select} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {['RSD', 'USD', 'EUR', 'AED', 'GBP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Rows table */}
          <div style={s.section}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={s.sectionTitle}>Transactions</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#888' }}>{validRows.length} valid row{validRows.length !== 1 ? 's' : ''}</span>
                <button style={s.addRowBtn} onClick={addRow}>+ Add row</button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f3' }}>
                    {['Date', 'Partner', 'Description', 'Debit (out)', 'Credit (in)', 'Curr.', 'Acc. number', 'Model', 'Ref. number', ''].map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: 'left' as const, fontSize: '10px', color: '#888', fontWeight: '500', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' as const, borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const hasAmount = parseFloat(row.debit) > 0 || parseFloat(row.credit) > 0
                    const isValid = row.date && hasAmount
                    return (
                      <tr key={row.id} style={{ borderBottom: '0.5px solid #f0f0ee', background: isValid ? '#f9fff9' : idx % 2 === 0 ? '#fff' : '#fafaf9' }}>
                        <td style={{ padding: '4px 4px' }}>
                          <input type="date" style={{ ...s.cellInput, width: '130px' }} value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <input style={{ ...s.cellInput, width: '130px' }} value={row.partner_name} onChange={e => updateRow(row.id, 'partner_name', e.target.value)} placeholder="Partner name" />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <input style={{ ...s.cellInput, width: '160px' }} value={row.description} onChange={e => updateRow(row.id, 'description', e.target.value)} placeholder="Description / note" />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <input type="number" style={{ ...s.cellInput, width: '90px', color: parseFloat(row.debit) > 0 ? '#A32D2D' : '#111' }}
                            value={row.debit} onChange={e => { updateRow(row.id, 'debit', e.target.value); if (e.target.value) updateRow(row.id, 'credit', '') }}
                            placeholder="0.00" min="0" />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <input type="number" style={{ ...s.cellInput, width: '90px', color: parseFloat(row.credit) > 0 ? '#1D9E75' : '#111' }}
                            value={row.credit} onChange={e => { updateRow(row.id, 'credit', e.target.value); if (e.target.value) updateRow(row.id, 'debit', '') }}
                            placeholder="0.00" min="0" />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <select style={{ ...s.cellInput, width: '70px' }} value={row.currency || currency} onChange={e => updateRow(row.id, 'currency', e.target.value)}>
                            {['RSD', 'USD', 'EUR', 'AED', 'GBP'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <input style={{ ...s.cellInput, width: '120px', fontFamily: 'monospace' }} value={row.account_number} onChange={e => updateRow(row.id, 'account_number', e.target.value)} placeholder="265-..." />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <input style={{ ...s.cellInput, width: '50px' }} value={row.model} onChange={e => updateRow(row.id, 'model', e.target.value)} placeholder="97" />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <input style={{ ...s.cellInput, width: '110px', fontFamily: 'monospace' }} value={row.reference_number} onChange={e => updateRow(row.id, 'reference_number', e.target.value)} placeholder="Poziv na broj" />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <button style={s.removeBtn} onClick={() => removeRow(row.id)} title="Remove row">×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f5f5f3', borderTop: '1px solid #e5e5e5' }}>
                    <td colSpan={3} style={{ padding: '8px', fontSize: '11px', color: '#888', fontWeight: '500' }}>Totals ({rows.length} rows, {validRows.length} valid)</td>
                    <td style={{ padding: '8px', fontSize: '13px', fontWeight: '600', color: '#A32D2D' }}>{totalDebit > 0 ? totalDebit.toLocaleString() : '—'}</td>
                    <td style={{ padding: '8px', fontSize: '13px', fontWeight: '600', color: '#1D9E75' }}>{totalCredit > 0 ? totalCredit.toLocaleString() : '—'}</td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <button style={{ ...s.addRowBtn, marginTop: '10px', width: '100%', padding: '10px' }} onClick={addRow}>
              + Add row
            </button>
          </div>

          {error && (
            <div style={{ background: '#FCEBEB', border: '0.5px solid #F5A9A9', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#A32D2D', marginBottom: '12px' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#085041' }}>
            💡 Transactions will be posted as <strong>Direct</strong> type without P&L classification. You can edit them individually afterwards to add P&L category, department, etc.
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <div style={{ fontSize: '12px', color: '#888' }}>
            {validRows.length} transaction{validRows.length !== 1 ? 's' : ''} ready to post
            {totalDebit > 0 && <span style={{ color: '#A32D2D', marginLeft: '12px' }}>Out: {totalDebit.toLocaleString()} {currency}</span>}
            {totalCredit > 0 && <span style={{ color: '#1D9E75', marginLeft: '12px' }}>In: {totalCredit.toLocaleString()} {currency}</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={s.btnGhost} onClick={onClose}>Cancel</button>
            <button
              style={{ ...s.btnPrimary, opacity: (!company || !bank || validRows.length === 0 || posting) ? 0.5 : 1 }}
              onClick={handlePost}
              disabled={!company || !bank || validRows.length === 0 || posting}>
              {posting ? 'Posting...' : `Post ${validRows.length} transaction${validRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  dialog: { background: '#fff', borderRadius: '16px', width: '1100px', maxWidth: '98vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { background: '#0a1628', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: '15px', fontWeight: '500' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: '12px', marginTop: '2px' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  body: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '1rem 1.5rem', borderTop: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f5f5f3' },
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid #e5e5e5' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  lbl: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  req: { color: '#E24B4A' },
  select: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  input: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  cellInput: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 7px', border: '0.5px solid #e5e5e5', borderRadius: '6px', background: '#fff', color: '#111', outline: 'none' },
  addRowBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '6px 14px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer' },
  removeBtn: { background: 'none', border: 'none', color: '#ccc', fontSize: '16px', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', lineHeight: 1 },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}