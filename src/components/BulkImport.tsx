import React, { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabase'

interface Props {
  onClose: () => void
  onImported: () => void
}

interface ParsedRow {
  id: string
  date: string
  statement_number: string
  currency: string
  debit: number | null
  credit: number | null
  partner_name: string
  description: string
  reference_number: string
  model: string
  account_number: string
}

interface AIProposal {
  tx_type: 'direct' | 'invoice_payment'
  tx_subtype: 'expense' | 'revenue' | null
  pl_category: string
  department: string
  expense_description: string
  revenue_stream: string
  partner_match: string | null
  confidence: 'high' | 'medium' | 'low'
  notes: string
}

type RowStatus = 'pending' | 'accepted' | 'rejected'

interface ImportRow {
  parsed: ParsedRow
  proposal: AIProposal | null
  status: RowStatus
  editing: boolean
  // editable overrides
  override_tx_type: 'direct' | 'invoice_payment'
  override_tx_subtype: 'expense' | 'revenue'
  override_pl_category: string
  override_department: string
  override_expense_description: string
  override_revenue_stream: string
  override_partner_name: string
}

const PL_CATEGORIES = [
  'Employee and Labour',
  'Professional and Production Services',
  'Banking and Finance',
  'General Business',
  'Vehicle Expense',
  'Taxes',
]

const DEPARTMENTS = [
  'Marketing Expenses',
  'Development Expenses',
  'Product Expenses',
  'Design Expenses',
  'Sales Expenses',
  'CS Expenses',
  'Office & Administration',
  'Shareholder Expenses',
  'General Business Expenses',
  'Loans / Credit / Dividends',
]

const REVENUE_STREAMS = [
  'Social Growth', 'Aimfox', 'Outsourced Services',
  'VAT Claimed', 'Interest Received', 'Loans', 'Credit', 'Other',
]

function parseRaiffeisenTxt(content: string): ParsedRow[] {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const rows: ParsedRow[] = []
  const dataLines = lines.slice(1)

  dataLines.forEach((line, index) => {
    if (!line.trim()) return
    const cols = line.split('#')
    if (cols.length < 13) return

    const parseAmount = (s: string): number | null => {
      if (!s || !s.trim()) return null
      const cleaned = s.trim().replace(/\./g, '').replace(',', '.')
      const val = parseFloat(cleaned)
      return isNaN(val) ? null : val
    }

    const debit = parseAmount(cols[5])
    const credit = parseAmount(cols[6])
    if (debit === null && credit === null) return

    rows.push({
      id: `row_${index}`,  // stable index-based ID
      date: cols[1]?.trim() || '',
      statement_number: cols[2]?.trim() || '',
      currency: cols[3]?.trim() || 'RSD',
      debit,
      credit,
      partner_name: cols[11]?.trim() || '',
      description: cols[12]?.trim() || cols[8]?.trim() || '',
      reference_number: cols[15]?.trim() || cols[14]?.trim() || '',
      model: cols[17]?.trim() || cols[16]?.trim() || '',
      account_number: cols[10]?.trim() || '',
    })
  })

  return rows
}

function formatDate(d: string): string {
  if (!d) return ''
  const parts = d.split('.')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return d
}

function makeImportRow(parsed: ParsedRow): ImportRow {
  const isExpense = (parsed.debit || 0) > 0
  return {
    parsed,
    proposal: null,
    status: 'pending',
    editing: false,
    override_tx_type: 'direct',
    override_tx_subtype: isExpense ? 'expense' : 'revenue',
    override_pl_category: '',
    override_department: '',
    override_expense_description: '',
    override_revenue_stream: '',
    override_partner_name: parsed.partner_name,
  }
}

export default function BulkImport({ onClose, onImported }: Props) {
  const [step, setStep] = useState<'upload' | 'review' | 'posting' | 'done'>('upload')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [analyzeError, setAnalyzeError] = useState('')
  const [company, setCompany] = useState('')
  const [bank, setBank] = useState('')
  const [companies, setCompanies] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [allBanks, setAllBanks] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
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

  React.useEffect(() => {
    if (company) setBanks(allBanks.filter(b => b.company_id === company))
  }, [company, allBanks])

  const handleFile = async (file: File) => {
    setParseError('')
    setFileName(file.name)
    const text = await file.text()
    const parsed = parseRaiffeisenTxt(text)
    if (parsed.length === 0) {
      setParseError('Could not parse file. Make sure it is a valid bank export (# separator format).')
      return
    }
    setRows(parsed.map(makeImportRow))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const analyzeWithAI = async () => {
    if (!company || !bank) return
    setAnalyzing(true)
    setAnalyzeError('')
    setProgress(0)

    const partnerNames = partners.map(p => p.name).join(', ')
    const batchSize = 5
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
    const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

    // Work on a snapshot of rows
    const snapshot = [...rows]
    const result: ImportRow[] = snapshot.map(r => ({ ...r }))

    for (let i = 0; i < snapshot.length; i += batchSize) {
      const batch = snapshot.slice(i, i + batchSize)

      // Send stable IDs (index-based)
      const batchPayload = batch.map(r => ({
        row_id: r.parsed.id,
        date: r.parsed.date,
        partner: r.parsed.partner_name,
        description: r.parsed.description,
        debit: r.parsed.debit,
        credit: r.parsed.credit,
        reference: r.parsed.reference_number,
      }))

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/ai-categorize`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'apikey': supabaseAnonKey || '',
            },
            body: JSON.stringify({ rows: batchPayload, partnerNames }),
          }
        )

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`HTTP ${response.status}: ${errText}`)
        }

        const data = await response.json()
        let proposals: any[] = []
        try {
          const clean = (data.result || '[]').replace(/```json|```/g, '').trim()
          proposals = JSON.parse(clean)
        } catch {
          proposals = []
        }

        // Match by row_id
        for (let j = i; j < Math.min(i + batchSize, snapshot.length); j++) {
          const rowId = snapshot[j].parsed.id
          const proposal = proposals.find((p: any) => p.row_id === rowId)
          if (proposal) {
            const isExpense = (snapshot[j].parsed.debit || 0) > 0
            result[j] = {
              ...result[j],
              proposal,
              status: 'accepted',
              override_tx_type: proposal.tx_type || 'direct',
              override_tx_subtype: proposal.tx_subtype || (isExpense ? 'expense' : 'revenue'),
              override_pl_category: proposal.pl_category || '',
              override_department: proposal.department || '',
              override_expense_description: proposal.expense_description || '',
              override_revenue_stream: proposal.revenue_stream || '',
              override_partner_name: proposal.partner_match || snapshot[j].parsed.partner_name,
            }
          }
        }
      } catch (err: any) {
        console.error('AI batch error:', err)
        setAnalyzeError(`AI analysis failed: ${err.message}`)
        setAnalyzing(false)
        return
      }

      setProgress(Math.round(((i + batchSize) / snapshot.length) * 100))
    }

    setRows(result)
    setAnalyzing(false)
    setStep('review')
  }

  const updateRow = useCallback((id: string, updates: Partial<ImportRow>) => {
    setRows(prev => prev.map(r => r.parsed.id === id ? { ...r, ...updates } : r))
  }, [])

  const toggleExpand = (id: string) => setExpandedRow(prev => prev === id ? null : id)
  const acceptRow = (id: string) => updateRow(id, { status: 'accepted' })
  const rejectRow = (id: string) => updateRow(id, { status: 'rejected' })
  const acceptAll = () => setRows(prev => prev.map(r => ({ ...r, status: 'accepted' as RowStatus })))
  const rejectAll = () => setRows(prev => prev.map(r => ({ ...r, status: 'rejected' as RowStatus })))

  const postAccepted = async () => {
    setStep('posting')
    setProgress(0)
    const accepted = rows.filter(r => r.status === 'accepted')
    let done = 0
    const localPartners = [...partners]

    for (const row of accepted) {
      const p = row.parsed
      const isDirectWithPL = row.override_tx_type === 'direct'
      const isExpense = (p.debit || 0) > 0
      const amount = isExpense ? (p.debit || 0) : (p.credit || 0)

      // Find or create partner
      let partnerId: string | null = null
      const nameToMatch = row.override_partner_name || p.partner_name
      if (nameToMatch) {
        const existing = localPartners.find(pt => pt.name.toLowerCase() === nameToMatch.toLowerCase())
        if (existing) {
          partnerId = existing.id
        } else {
          const { data: newP } = await supabase.from('partners').insert({ name: nameToMatch }).select().single()
          if (newP) { partnerId = newP.id; localPartners.push(newP) }
        }
      }

      await supabase.from('transactions').insert({
        company_id: company,
        bank_id: bank,
        partner_id: partnerId,
        transaction_date: formatDate(p.date),
        statement_number: p.statement_number || null,
        type: row.override_tx_type,
        tx_subtype: row.override_tx_subtype,
        currency: p.currency,
        amount,
        exchange_rate: null,
        amount_usd: p.currency === 'USD' ? amount : null,
        pl_impact: isDirectWithPL,
        pl_category: isDirectWithPL ? (row.override_pl_category || null) : null,
        department: isDirectWithPL ? (row.override_department || null) : null,
        expense_description: isDirectWithPL ? (row.override_expense_description || null) : null,
        revenue_stream: isDirectWithPL ? (row.override_revenue_stream || null) : null,
        account_number: p.account_number || null,
        model: p.model || null,
        reference_number: p.reference_number || null,
        note: p.description || null,
        status: 'posted',
      })

      done++
      setProgress(Math.round((done / accepted.length) * 100))
    }

    setStep('done')
  }

  const accepted = rows.filter(r => r.status === 'accepted').length
  const rejected = rows.filter(r => r.status === 'rejected').length
  const pending = rows.filter(r => r.status === 'pending').length

  const confStyle = (c?: string) => {
    if (c === 'high') return { bg: '#E1F5EE', color: '#085041' }
    if (c === 'medium') return { bg: '#FAEEDA', color: '#633806' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }

  if (step === 'done') return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '260px' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '22px', color: '#111' }}>Import complete!</div>
        <div style={{ fontSize: '13px', color: '#888', textAlign: 'center' as const }}>
          {accepted} transaction{accepted !== 1 ? 's' : ''} posted.<br />{rejected} skipped.
        </div>
        <button style={s.btnPrimary} onClick={() => { onImported(); onClose() }}>View transactions</button>
      </div>
    </div>
  )

  if (step === 'posting') return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '260px' }}>
        <div style={{ fontSize: '13px', color: '#888' }}>Posting transactions... {progress}%</div>
        <div style={{ ...s.progressBar, width: '300px' }}>
          <div style={{ ...s.progressFill, width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>{step === 'upload' ? '📥 Bulk import — bank statement' : `📋 Review & post — ${rows.length} rows`}</div>
            <div style={s.headerSub}>{step === 'upload' ? 'Upload a bank export file. AI will categorize each row.' : `${accepted} accepted · ${rejected} rejected · ${pending} pending`}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={s.body}>
          {/* ── UPLOAD ── */}
          {step === 'upload' && (
            <>
              <div style={s.section}>
                <div style={s.sectionTitle}>Company & bank</div>
                <div style={s.row2}>
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
                </div>
              </div>

              <div style={s.section}>
                <div style={s.sectionTitle}>Upload file</div>
                <div style={s.dropZone} onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}>
                  <input ref={fileRef} type="file" accept=".txt,.csv" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
                  {fileName ? (
                    <div>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>📄</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1D9E75' }}>{fileName}</div>
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{rows.length} rows parsed — click to change</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>📂</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#111', marginBottom: '4px' }}>Drop file here or click to browse</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>Raiffeisen / Intesa TXT (# separator)</div>
                    </div>
                  )}
                </div>
                {parseError && <div style={s.errorMsg}>⚠️ {parseError}</div>}
              </div>

              {rows.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionTitle}>Parsed preview</div>
                  <div style={s.infoBox}>
                    <strong>{rows.length} rows</strong> · <strong>{rows.filter(r => (r.parsed.debit || 0) > 0).length} expenses</strong> · <strong>{rows.filter(r => (r.parsed.credit || 0) > 0).length} revenues</strong>
                  </div>
                  <div style={s.previewList}>
                    {rows.slice(0, 5).map(r => (
                      <div key={r.parsed.id} style={s.previewRow}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{r.parsed.partner_name || '—'}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{r.parsed.date} · {r.parsed.description?.slice(0, 60)}</div>
                        </div>
                        <div style={{ textAlign: 'right' as const }}>
                          {(r.parsed.debit || 0) > 0 && <div style={{ fontSize: '13px', fontWeight: '500', color: '#A32D2D' }}>-{r.parsed.debit?.toLocaleString('sr-RS')} {r.parsed.currency}</div>}
                          {(r.parsed.credit || 0) > 0 && <div style={{ fontSize: '13px', fontWeight: '500', color: '#1D9E75' }}>+{r.parsed.credit?.toLocaleString('sr-RS')} {r.parsed.currency}</div>}
                        </div>
                      </div>
                    ))}
                    {rows.length > 5 && <div style={{ padding: '8px 14px', fontSize: '12px', color: '#aaa', textAlign: 'center' as const }}>+{rows.length - 5} more rows...</div>}
                  </div>
                </div>
              )}

              {analyzing && (
                <div style={s.analyzingBox}>
                  <div style={{ fontSize: '13px', color: '#085041', marginBottom: '8px' }}>🤖 AI is analyzing {rows.length} rows...</div>
                  <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${progress}%`, transition: 'width 0.5s' }} /></div>
                  <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '6px' }}>{progress}% complete</div>
                </div>
              )}

              {analyzeError && (
                <div style={{ ...s.infoBox, background: '#FCEBEB', borderColor: '#F5A9A9', color: '#A32D2D', marginTop: '12px' }}>
                  ⚠️ {analyzeError}
                </div>
              )}
            </>
          )}

          {/* ── REVIEW ── */}
          {step === 'review' && (
            <>
              <div style={s.reviewSummary}>
                <div style={s.reviewStat}><span style={{ fontSize: '20px', fontWeight: '600', color: '#1D9E75' }}>{accepted}</span><span style={{ fontSize: '11px', color: '#888' }}>Accepted</span></div>
                <div style={s.reviewStat}><span style={{ fontSize: '20px', fontWeight: '600', color: '#A32D2D' }}>{rejected}</span><span style={{ fontSize: '11px', color: '#888' }}>Rejected</span></div>
                <div style={s.reviewStat}><span style={{ fontSize: '20px', fontWeight: '600', color: '#633806' }}>{pending}</span><span style={{ fontSize: '11px', color: '#888' }}>Pending</span></div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  <button style={s.btnSmallGreen} onClick={acceptAll}>✓ Accept all</button>
                  <button style={s.btnSmallRed} onClick={rejectAll}>✕ Reject all</button>
                </div>
              </div>

              <div style={s.reviewList}>
                {rows.map(row => {
                  const p = row.parsed
                  const isExpense = (p.debit || 0) > 0
                  const amount = isExpense ? p.debit : p.credit
                  const isExpanded = expandedRow === p.id
                  const conf = row.proposal?.confidence ? confStyle(row.proposal.confidence) : null

                  return (
                    <div key={p.id} style={{
                      ...s.reviewRow,
                      ...(row.status === 'accepted' ? s.reviewRowAccepted : {}),
                      ...(row.status === 'rejected' ? s.reviewRowRejected : {}),
                    }}>
                      {/* Main row header */}
                      <div style={s.reviewRowMain} onClick={() => toggleExpand(p.id)}>
                        <div style={{ flexShrink: 0, width: '14px', fontSize: '11px', color: '#bbb' }}>{isExpanded ? '▼' : '▶'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{row.override_partner_name || p.partner_name || '—'}</span>
                            {conf && row.proposal && (
                              <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: conf.bg, color: conf.color }}>{row.proposal.confidence}</span>
                            )}
                            <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: row.override_tx_type === 'direct' ? '#E1F5EE' : '#E6F1FB', color: row.override_tx_type === 'direct' ? '#085041' : '#0C447C' }}>
                              {row.override_tx_type === 'direct' ? '⚡ Direct' : '💳 Inv. payment'}
                            </span>
                            {!row.proposal && <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>No AI proposal</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{p.date} · {p.description?.slice(0, 65)}{(p.description?.length || 0) > 65 ? '...' : ''}</div>
                          {row.override_tx_type === 'direct' && row.override_pl_category && (
                            <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '2px' }}>📊 {row.override_pl_category}{row.override_department ? ` · ${row.override_department}` : ''}</div>
                          )}
                          {row.override_tx_type === 'invoice_payment' && (
                            <div style={{ fontSize: '11px', color: '#0C447C', marginTop: '2px' }}>💳 Cash flow only</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' as const, flexShrink: 0, marginRight: '10px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: isExpense ? '#A32D2D' : '#1D9E75' }}>{isExpense ? '-' : '+'}{amount?.toLocaleString('sr-RS')} {p.currency}</div>
                          <div style={{ fontSize: '10px', color: '#aaa' }}>Izvod #{p.statement_number}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button style={{ ...s.actionBtn, ...(row.status === 'accepted' ? s.actionBtnAccepted : {}) }} onClick={() => acceptRow(p.id)}>✓</button>
                          <button style={{ ...s.actionBtn, ...(row.status === 'rejected' ? s.actionBtnRejected : {}) }} onClick={() => rejectRow(p.id)}>✕</button>
                        </div>
                      </div>

                      {/* Expanded edit panel */}
                      {isExpanded && (
                        <div style={s.editPanel}>
                          {row.proposal && (
                            <div style={s.aiNotes}>
                              🤖 AI: {row.proposal.notes || 'No notes'}
                            </div>
                          )}

                          <div style={s.editGrid}>
                            {/* Partner */}
                            <div style={s.editField}>
                              <label style={s.editLbl}>Partner</label>
                              <input style={s.editInput} value={row.override_partner_name}
                                onChange={e => updateRow(p.id, { override_partner_name: e.target.value })} />
                            </div>

                            {/* Type */}
                            <div style={s.editField}>
                              <label style={s.editLbl}>Type</label>
                              <select style={s.editSelect} value={row.override_tx_type}
                                onChange={e => updateRow(p.id, { override_tx_type: e.target.value as any })}>
                                <option value="direct">⚡ Direct (P&L impact)</option>
                                <option value="invoice_payment">💳 Invoice payment (cash only)</option>
                              </select>
                            </div>

                            {/* Subtype */}
                            <div style={s.editField}>
                              <label style={s.editLbl}>Subtype</label>
                              <select style={s.editSelect} value={row.override_tx_subtype}
                                onChange={e => updateRow(p.id, { override_tx_subtype: e.target.value as any })}>
                                <option value="expense">Expense</option>
                                <option value="revenue">Revenue</option>
                              </select>
                            </div>

                            {/* P&L Category — only for direct */}
                            {row.override_tx_type === 'direct' && row.override_tx_subtype === 'expense' && (
                              <>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Category</label>
                                  <select style={s.editSelect} value={row.override_pl_category}
                                    onChange={e => updateRow(p.id, { override_pl_category: e.target.value })}>
                                    <option value="">Select category...</option>
                                    {PL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Department</label>
                                  <select style={s.editSelect} value={row.override_department}
                                    onChange={e => updateRow(p.id, { override_department: e.target.value })}>
                                    <option value="">Select department...</option>
                                    {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Expense description</label>
                                  <input style={s.editInput} value={row.override_expense_description}
                                    onChange={e => updateRow(p.id, { override_expense_description: e.target.value })}
                                    placeholder="e.g. Telekom, AWS, Rent..." />
                                </div>
                              </>
                            )}

                            {row.override_tx_type === 'direct' && row.override_tx_subtype === 'revenue' && (
                              <div style={s.editField}>
                                <label style={s.editLbl}>Revenue stream</label>
                                <select style={s.editSelect} value={row.override_revenue_stream}
                                  onChange={e => updateRow(p.id, { override_revenue_stream: e.target.value })}>
                                  <option value="">Select stream...</option>
                                  {REVENUE_STREAMS.map(r => <option key={r}>{r}</option>)}
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Accept button at bottom of edit panel */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', gap: '6px' }}>
                            <button style={s.btnSmallRed} onClick={() => rejectRow(p.id)}>✕ Reject</button>
                            <button style={s.btnSmallGreen} onClick={() => { acceptRow(p.id); toggleExpand(p.id) }}>✓ Accept & close</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          {step === 'upload' && (
            <>
              <span style={{ fontSize: '12px', color: '#888' }}>{rows.length > 0 ? `${rows.length} rows ready` : 'Upload a file to begin'}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={s.btnGhost} onClick={onClose}>Cancel</button>
                <button style={{ ...s.btnPrimary, opacity: (!company || !bank || rows.length === 0 || analyzing) ? 0.5 : 1 }}
                  onClick={analyzeWithAI} disabled={!company || !bank || rows.length === 0 || analyzing}>
                  {analyzing ? `🤖 Analyzing... ${progress}%` : '🤖 Analyze with AI'}
                </button>
              </div>
            </>
          )}
          {step === 'review' && (
            <>
              <span style={{ fontSize: '12px', color: '#888' }}>{accepted} transaction{accepted !== 1 ? 's' : ''} will be posted</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={s.btnGhost} onClick={() => setStep('upload')}>← Back</button>
                <button style={{ ...s.btnPrimary, opacity: accepted === 0 ? 0.5 : 1 }} onClick={postAccepted} disabled={accepted === 0}>
                  Post {accepted} transaction{accepted !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  dialog: { background: '#fff', borderRadius: '16px', width: '900px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { background: '#0a1628', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: '15px', fontWeight: '500', marginBottom: '3px' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: '12px' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  body: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '1rem 1.5rem', borderTop: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f5f5f3' },
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid #e5e5e5' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  lbl: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  req: { color: '#E24B4A' },
  select: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  dropZone: { border: '2px dashed #e5e5e5', borderRadius: '12px', padding: '2.5rem', textAlign: 'center' as const, cursor: 'pointer', background: '#fafaf9' },
  infoBox: { background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#085041', marginBottom: '12px' },
  errorMsg: { fontSize: '12px', color: '#E24B4A', marginTop: '8px' },
  previewList: { border: '0.5px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' },
  previewRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderBottom: '0.5px solid #f5f5f3', background: '#fff' },
  analyzingBox: { background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '10px', padding: '16px', textAlign: 'center' as const },
  progressBar: { width: '100%', height: '6px', background: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' },
  progressFill: { height: '100%', background: '#1D9E75', borderRadius: '3px' },
  reviewSummary: { display: 'flex', alignItems: 'center', gap: '24px', padding: '12px 16px', background: '#f5f5f3', borderRadius: '10px', marginBottom: '12px' },
  reviewStat: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px' },
  reviewList: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  reviewRow: { border: '0.5px solid #e5e5e5', borderRadius: '10px', background: '#fff', overflow: 'hidden' },
  reviewRowAccepted: { border: '1.5px solid #1D9E75', background: '#f0fdf8' },
  reviewRowRejected: { opacity: 0.45 },
  reviewRowMain: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer' },
  editPanel: { padding: '14px 16px', borderTop: '0.5px solid #e5e5e5', background: '#f9f9f7' },
  aiNotes: { fontSize: '11px', color: '#085041', background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '6px', padding: '6px 10px', marginBottom: '12px' },
  editGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  editField: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  editLbl: { fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  editInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  editSelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  actionBtn: { width: '28px', height: '28px', borderRadius: '6px', border: '0.5px solid #e5e5e5', background: '#f5f5f3', cursor: 'pointer', fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  actionBtnAccepted: { background: '#E1F5EE', border: '1.5px solid #1D9E75', color: '#085041' },
  actionBtnRejected: { background: '#FCEBEB', border: '1.5px solid #E24B4A', color: '#A32D2D' },
  btnSmallGreen: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer' },
  btnSmallRed: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', border: '0.5px solid #E24B4A', borderRadius: '6px', background: 'transparent', color: '#A32D2D', cursor: 'pointer' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}