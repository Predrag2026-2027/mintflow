import React, { useState, useRef } from 'react'
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
  raw: string
}

interface AIProposal {
  row_id: string
  tx_type: 'direct' | 'invoice_payment'
  tx_subtype: 'expense' | 'revenue' | null
  pl_category: string
  pl_subcategory: string
  department: string
  dept_subcategory: string
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
}

// ── Parser ────────────────────────────────────────────────
function parseRaiffeisenTxt(content: string): ParsedRow[] {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const dataLines = lines.slice(1)
  const rows: ParsedRow[] = []

  for (const line of dataLines) {
    if (!line.trim()) continue
    const cols = line.split('#')
    if (cols.length < 13) continue

    const parseAmount = (s: string): number | null => {
      if (!s || s === '') return null
      const cleaned = s.replace(/\./g, '').replace(',', '.').trim()
      const val = parseFloat(cleaned)
      return isNaN(val) ? null : val
    }

    rows.push({
      id: `row_${Math.random().toString(36).substr(2, 9)}`,
      date: cols[1]?.trim() || '',
      statement_number: cols[2]?.trim() || '',
      currency: cols[3]?.trim() || 'RSD',
      debit: parseAmount(cols[5]?.trim()),
      credit: parseAmount(cols[6]?.trim()),
      partner_name: cols[11]?.trim() || '',
      description: cols[12]?.trim() || cols[8]?.trim() || '',
      reference_number: cols[15]?.trim() || cols[14]?.trim() || '',
      model: cols[17]?.trim() || cols[16]?.trim() || '',
      account_number: cols[10]?.trim() || '',
      raw: line,
    })
  }

  return rows.filter(r => r.debit !== null || r.credit !== null)
}

function formatDate(d: string): string {
  if (!d) return ''
  const parts = d.split('.')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return d
}

// ── Main Component ────────────────────────────────────────
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
    setRows(parsed.map(p => ({ parsed: p, proposal: null, status: 'pending' })))
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
    const result: ImportRow[] = rows.map(r => ({ ...r }))

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)

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
        const { data, error } = await supabase.functions.invoke('ai-categorize', {
          body: { rows: batchPayload, partnerNames },
        })

        if (error) throw new Error(error.message)

        let proposals: AIProposal[] = []
        try {
          const clean = (data.result || '[]').replace(/```json|```/g, '').trim()
          proposals = JSON.parse(clean)
        } catch {
          proposals = []
        }

        // Apply proposals to correct rows by row_id
        for (let j = i; j < Math.min(i + batchSize, rows.length); j++) {
          const proposal = proposals.find(p => p.row_id === rows[j].parsed.id)
          if (proposal) {
            result[j] = { ...result[j], proposal, status: 'accepted' }
          }
        }

      } catch (err: any) {
        console.error('AI batch error:', err)
        setAnalyzeError(`AI analysis failed: ${err.message}. Check Edge Function logs in Supabase.`)
        setAnalyzing(false)
        return
      }

      setProgress(Math.round(((i + batchSize) / rows.length) * 100))
    }

    setRows(result)
    setAnalyzing(false)
    setStep('review')
  }

  const toggleRow = (id: string) => setExpandedRow(prev => prev === id ? null : id)
  const acceptRow = (id: string) => setRows(prev => prev.map(r => r.parsed.id === id ? { ...r, status: 'accepted' } : r))
  const rejectRow = (id: string) => setRows(prev => prev.map(r => r.parsed.id === id ? { ...r, status: 'rejected' } : r))
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
      const prop = row.proposal
      const isExpense = (p.debit || 0) > 0
      const amount = isExpense ? (p.debit || 0) : (p.credit || 0)

      // Find or create partner
      let partnerId: string | null = null
      const nameToMatch = prop?.partner_match || p.partner_name
      if (nameToMatch) {
        const existing = localPartners.find(pt => pt.name.toLowerCase() === nameToMatch.toLowerCase())
        if (existing) {
          partnerId = existing.id
        } else {
          const { data: newP } = await supabase.from('partners').insert({ name: p.partner_name }).select().single()
          if (newP) { partnerId = newP.id; localPartners.push(newP) }
        }
      }

      const isDirectWithPL = prop?.tx_type === 'direct'

      await supabase.from('transactions').insert({
        company_id: company,
        bank_id: bank,
        partner_id: partnerId,
        transaction_date: formatDate(p.date),
        statement_number: p.statement_number || null,
        type: prop?.tx_type || 'direct',
        tx_subtype: prop?.tx_subtype || null,
        currency: p.currency,
        amount: amount,
        exchange_rate: null,
        amount_usd: p.currency === 'USD' ? amount : null,
        pl_impact: isDirectWithPL,
        pl_category: isDirectWithPL ? (prop?.pl_category || null) : null,
        pl_subcategory: isDirectWithPL ? (prop?.pl_subcategory || null) : null,
        department: isDirectWithPL ? (prop?.department || null) : null,
        dept_subcategory: isDirectWithPL ? (prop?.dept_subcategory || null) : null,
        expense_description: isDirectWithPL ? (prop?.expense_description || null) : null,
        revenue_stream: isDirectWithPL ? (prop?.revenue_stream || null) : null,
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

  const confidenceStyle = (c: string) => {
    if (c === 'high') return { bg: '#E1F5EE', color: '#085041' }
    if (c === 'medium') return { bg: '#FAEEDA', color: '#633806' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }

  // ── DONE ──
  if (step === 'done') return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '260px' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '22px', color: '#111' }}>Import complete!</div>
        <div style={{ fontSize: '13px', color: '#888', textAlign: 'center' }}>
          {accepted} transaction{accepted !== 1 ? 's' : ''} posted.<br />
          {rejected} row{rejected !== 1 ? 's' : ''} skipped.
        </div>
        <button style={s.btnPrimary} onClick={() => { onImported(); onClose() }}>View transactions</button>
      </div>
    </div>
  )

  // ── POSTING ──
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
            <div style={s.headerTitle}>
              {step === 'upload' ? '📥 Bulk import — bank statement' : `📋 Review & post — ${rows.length} rows`}
            </div>
            <div style={s.headerSub}>
              {step === 'upload'
                ? 'Upload a bank export file. AI will categorize each row automatically.'
                : `${accepted} accepted · ${rejected} rejected · ${pending} pending`}
            </div>
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
                  <input ref={fileRef} type="file" accept=".txt,.csv,.xls,.xlsx" style={{ display: 'none' }}
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
                      <div style={{ fontSize: '12px', color: '#888' }}>Supports: Raiffeisen/Intesa TXT (# separator)</div>
                    </div>
                  )}
                </div>
                {parseError && <div style={s.errorMsg}>⚠️ {parseError}</div>}
              </div>

              {rows.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionTitle}>Parsed preview</div>
                  <div style={s.infoBox}>
                    <strong>{rows.length} rows</strong> detected ·{' '}
                    <strong>{rows.filter(r => (r.parsed.debit || 0) > 0).length} expenses</strong> ·{' '}
                    <strong>{rows.filter(r => (r.parsed.credit || 0) > 0).length} revenues</strong>
                  </div>
                  <div style={s.previewList}>
                    {rows.slice(0, 5).map(r => (
                      <div key={r.parsed.id} style={s.previewRow}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{r.parsed.partner_name || '—'}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{r.parsed.date} · {r.parsed.description?.slice(0, 60)}</div>
                        </div>
                        <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                          {(r.parsed.debit || 0) > 0 && <div style={{ fontSize: '13px', fontWeight: '500', color: '#A32D2D' }}>-{r.parsed.debit?.toLocaleString('sr-RS')} {r.parsed.currency}</div>}
                          {(r.parsed.credit || 0) > 0 && <div style={{ fontSize: '13px', fontWeight: '500', color: '#1D9E75' }}>+{r.parsed.credit?.toLocaleString('sr-RS')} {r.parsed.currency}</div>}
                        </div>
                      </div>
                    ))}
                    {rows.length > 5 && <div style={{ padding: '8px 14px', fontSize: '12px', color: '#aaa', textAlign: 'center' }}>+{rows.length - 5} more rows...</div>}
                  </div>
                </div>
              )}

              {analyzing && (
                <div style={s.analyzingBox}>
                  <div style={{ fontSize: '13px', color: '#085041', marginBottom: '8px' }}>🤖 AI is analyzing {rows.length} rows in batches of 5...</div>
                  <div style={s.progressBar}>
                    <div style={{ ...s.progressFill, width: `${progress}%`, transition: 'width 0.5s' }} />
                  </div>
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
                <div style={s.reviewStat}>
                  <span style={{ fontSize: '20px', fontWeight: '600', color: '#1D9E75' }}>{accepted}</span>
                  <span style={{ fontSize: '11px', color: '#888' }}>Accepted</span>
                </div>
                <div style={s.reviewStat}>
                  <span style={{ fontSize: '20px', fontWeight: '600', color: '#A32D2D' }}>{rejected}</span>
                  <span style={{ fontSize: '11px', color: '#888' }}>Rejected</span>
                </div>
                <div style={s.reviewStat}>
                  <span style={{ fontSize: '20px', fontWeight: '600', color: '#633806' }}>{pending}</span>
                  <span style={{ fontSize: '11px', color: '#888' }}>Pending</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  <button style={s.btnSmallGreen} onClick={acceptAll}>✓ Accept all</button>
                  <button style={s.btnSmallRed} onClick={rejectAll}>✕ Reject all</button>
                </div>
              </div>

              <div style={s.reviewList}>
                {rows.map(row => {
                  const p = row.parsed
                  const prop = row.proposal
                  const isExpense = (p.debit || 0) > 0
                  const amount = isExpense ? p.debit : p.credit
                  const isExpanded = expandedRow === p.id
                  const conf = prop?.confidence ? confidenceStyle(prop.confidence) : null

                  return (
                    <div key={p.id} style={{
                      ...s.reviewRow,
                      ...(row.status === 'accepted' ? s.reviewRowAccepted : {}),
                      ...(row.status === 'rejected' ? s.reviewRowRejected : {}),
                    }}>
                      <div style={s.reviewRowMain} onClick={() => toggleRow(p.id)}>
                        <div style={{ flexShrink: 0, width: '14px', fontSize: '11px', color: '#bbb' }}>
                          {isExpanded ? '▼' : '▶'}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{p.partner_name || '—'}</span>
                            {conf && prop && (
                              <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: conf.bg, color: conf.color }}>
                                {prop.confidence}
                              </span>
                            )}
                            {prop?.tx_type && (
                              <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: prop.tx_type === 'direct' ? '#E1F5EE' : '#E6F1FB', color: prop.tx_type === 'direct' ? '#085041' : '#0C447C' }}>
                                {prop.tx_type === 'direct' ? '⚡ Direct' : '💳 Inv. payment'}
                              </span>
                            )}
                            {!prop && (
                              <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>No AI proposal</span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#888' }}>
                            {p.date} · {p.description?.slice(0, 70)}{(p.description?.length || 0) > 70 ? '...' : ''}
                          </div>
                          {prop?.pl_category && (
                            <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '2px' }}>
                              📊 {prop.pl_category}{prop.department ? ` · ${prop.department}` : ''}
                            </div>
                          )}
                          {prop?.tx_type === 'invoice_payment' && (
                            <div style={{ fontSize: '11px', color: '#0C447C', marginTop: '2px' }}>
                              💳 Cash flow only — closes an existing invoice
                            </div>
                          )}
                        </div>

                        <div style={{ textAlign: 'right' as const, flexShrink: 0, marginRight: '10px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: isExpense ? '#A32D2D' : '#1D9E75' }}>
                            {isExpense ? '-' : '+'}{amount?.toLocaleString('sr-RS')} {p.currency}
                          </div>
                          <div style={{ fontSize: '10px', color: '#aaa' }}>Izvod #{p.statement_number}</div>
                        </div>

                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button style={{ ...s.actionBtn, ...(row.status === 'accepted' ? s.actionBtnAccepted : {}) }} onClick={() => acceptRow(p.id)}>✓</button>
                          <button style={{ ...s.actionBtn, ...(row.status === 'rejected' ? s.actionBtnRejected : {}) }} onClick={() => rejectRow(p.id)}>✕</button>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div style={s.expandedDetail}>
                          {prop ? (
                            <div style={s.detailGrid}>
                              <div style={s.detailItem}><span style={s.detailLabel}>Type</span><span style={s.detailValue}>{prop.tx_type === 'direct' ? 'Direct transaction' : 'Invoice payment'}</span></div>
                              <div style={s.detailItem}><span style={s.detailLabel}>Subtype</span><span style={s.detailValue}>{prop.tx_subtype || '—'}</span></div>
                              <div style={s.detailItem}><span style={s.detailLabel}>P&L Category</span><span style={s.detailValue}>{prop.pl_category || '— (invoice payment)'}</span></div>
                              <div style={s.detailItem}><span style={s.detailLabel}>Department</span><span style={s.detailValue}>{prop.department || '— (invoice payment)'}</span></div>
                              <div style={s.detailItem}><span style={s.detailLabel}>Expense description</span><span style={s.detailValue}>{prop.expense_description || '—'}</span></div>
                              <div style={s.detailItem}><span style={s.detailLabel}>Revenue stream</span><span style={s.detailValue}>{prop.revenue_stream || '—'}</span></div>
                              <div style={s.detailItem}><span style={s.detailLabel}>Partner match</span><span style={s.detailValue}>{prop.partner_match || p.partner_name || '—'}</span></div>
                              <div style={s.detailItem}><span style={s.detailLabel}>Reference</span><span style={s.detailValue}>{p.reference_number || '—'}</span></div>
                              <div style={{ ...s.detailItem, gridColumn: '1 / -1' }}><span style={s.detailLabel}>AI notes</span><span style={s.detailValue}>{prop.notes || '—'}</span></div>
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic' }}>
                              No AI proposal available for this row. It will be posted as a direct transaction without P&L categorization.
                            </div>
                          )}
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
              <span style={{ fontSize: '12px', color: '#888' }}>
                {rows.length > 0 ? `${rows.length} rows ready` : 'Upload a file to begin'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={s.btnGhost} onClick={onClose}>Cancel</button>
                <button
                  style={{ ...s.btnPrimary, opacity: (!company || !bank || rows.length === 0 || analyzing) ? 0.5 : 1 }}
                  onClick={analyzeWithAI}
                  disabled={!company || !bank || rows.length === 0 || analyzing}
                >
                  {analyzing ? `🤖 Analyzing... ${progress}%` : '🤖 Analyze with AI'}
                </button>
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <span style={{ fontSize: '12px', color: '#888' }}>
                {accepted} transaction{accepted !== 1 ? 's' : ''} will be posted
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={s.btnGhost} onClick={() => setStep('upload')}>← Back</button>
                <button
                  style={{ ...s.btnPrimary, opacity: accepted === 0 ? 0.5 : 1 }}
                  onClick={postAccepted}
                  disabled={accepted === 0}
                >
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
  reviewList: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  reviewRow: { border: '0.5px solid #e5e5e5', borderRadius: '10px', background: '#fff', overflow: 'hidden' },
  reviewRowAccepted: { border: '1.5px solid #1D9E75', background: '#f0fdf8' },
  reviewRowRejected: { border: '0.5px solid #e5e5e5', background: '#fafaf9', opacity: 0.5 },
  reviewRowMain: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer' },
  expandedDetail: { padding: '12px 16px', borderTop: '0.5px solid #f0f0ee', background: '#f9f9f7' },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  detailItem: { display: 'flex', flexDirection: 'column' as const, gap: '3px' },
  detailLabel: { fontSize: '10px', fontWeight: '500', color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  detailValue: { fontSize: '12px', color: '#333', fontWeight: '500' },
  actionBtn: { width: '28px', height: '28px', borderRadius: '6px', border: '0.5px solid #e5e5e5', background: '#f5f5f3', cursor: 'pointer', fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  actionBtnAccepted: { background: '#E1F5EE', border: '1.5px solid #1D9E75', color: '#085041' },
  actionBtnRejected: { background: '#FCEBEB', border: '1.5px solid #E24B4A', color: '#A32D2D' },
  btnSmallGreen: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer' },
  btnSmallRed: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', border: '0.5px solid #E24B4A', borderRadius: '6px', background: 'transparent', color: '#A32D2D', cursor: 'pointer' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}