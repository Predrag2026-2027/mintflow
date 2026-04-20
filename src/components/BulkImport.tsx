import React, { useState, useRef, useCallback, useEffect } from 'react'
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
  override_tx_type: 'direct' | 'invoice_payment'
  override_tx_subtype: 'expense' | 'revenue'
  override_payment_method: string
  override_linked_invoice_id: string
  override_pl_category_id: string
  override_pl_category_name: string
  override_pl_subcategory_id: string
  override_pl_subcategory_name: string
  override_department_id: string
  override_department_name: string
  override_dept_subcategory_id: string
  override_dept_subcategory_name: string
  override_expense_description: string
  override_revenue_stream: string
  override_rev_alloc: string
  override_partner_name: string
  override_note: string
}

const PAYMENT_METHODS = [
  'Wire transfer', 'ACH transfer', 'Cash', 'Check',
  'Credit card', 'Direct debit', 'Other',
]

const REVENUE_STREAMS = [
  'Social Growth', 'Aimfox', 'Outsourced Services',
  'VAT Claimed', 'Interest Received', 'Loans', 'Credit', 'Other',
]

function parseRaiffeisenTxt(content: string): ParsedRow[] {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const rows: ParsedRow[] = []
  lines.slice(1).forEach((line, index) => {
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
      id: `row_${index}`,
      date: cols[1]?.trim() || '',
      statement_number: cols[2]?.trim() || '',
      currency: cols[3]?.trim() || 'RSD',
      debit, credit,
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
    parsed, proposal: null, status: 'pending',
    override_tx_type: 'direct',
    override_tx_subtype: isExpense ? 'expense' : 'revenue',
    override_payment_method: 'Wire transfer',
    override_linked_invoice_id: '',
    override_pl_category_id: '', override_pl_category_name: '',
    override_pl_subcategory_id: '', override_pl_subcategory_name: '',
    override_department_id: '', override_department_name: '',
    override_dept_subcategory_id: '', override_dept_subcategory_name: '',
    override_expense_description: '', override_revenue_stream: '',
    override_rev_alloc: 'sg100',
    override_partner_name: parsed.partner_name, override_note: '',
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
  const [openInvoices, setOpenInvoices] = useState<any[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Category data from DB — stored with id + name
  const [plCategories, setPlCategories] = useState<any[]>([])
  const [plSubcategories, setPlSubcategories] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [deptSubcategories, setDeptSubcategories] = useState<any[]>([])
  const [expenseDescriptions, setExpenseDescriptions] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const [
        { data: comp }, { data: bnk }, { data: part },
        { data: plCat }, { data: plSub }, { data: dept },
        { data: deptSub }, { data: expDesc },
      ] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('banks').select('*').order('name'),
        supabase.from('partners').select('*').order('name'),
        supabase.from('pl_categories').select('id,name,sort_order').order('sort_order'),
supabase.from('pl_subcategories').select('id,name,category_id,sort_order').order('sort_order'),
supabase.from('departments').select('id,name,sort_order').order('sort_order'),
supabase.from('dept_subcategories').select('id,name,department_id,sort_order').order('sort_order'),
supabase.from('expense_descriptions').select('id,name,dept_subcategory_id,sort_order').order('sort_order'),
      ])
      if (comp) setCompanies(comp)
      if (bnk) setAllBanks(bnk)
      if (part) setPartners(part)
      if (plCat) setPlCategories(plCat)
      if (plSub) setPlSubcategories(plSub)
      if (dept) setDepartments(dept)
      if (deptSub) setDeptSubcategories(deptSub)
      if (expDesc) setExpenseDescriptions(expDesc)
    }
    load()
  }, [])

  useEffect(() => {
    if (company) setBanks(allBanks.filter(b => b.company_id === company))
  }, [company, allBanks])

  // Load open invoices when company changes
  useEffect(() => {
    if (!company) return
    const fetchInvoices = async () => {
      const { data } = await supabase
        .from('v_invoice_status')
        .select('*')
        .eq('company_id', company)
        .in('calculated_status', ['unpaid', 'partial'])
        .order('due_date', { ascending: true })
      if (data) setOpenInvoices(data)
    }
    fetchInvoices()
  }, [company])

  // Cascade helpers — by ID
  const getPlSubs = (categoryId: string) =>
    plSubcategories.filter(s => s.category_id === categoryId)

  const getDeptSubs = (departmentId: string) =>
    deptSubcategories.filter(s => s.department_id === departmentId)

  const getExpDescs = (deptSubId: string) =>
    expenseDescriptions.filter(e => e.dept_subcategory_id === deptSubId)

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
    const snapshot = [...rows]
    const result: ImportRow[] = snapshot.map(r => ({ ...r }))

    for (let i = 0; i < snapshot.length; i += batchSize) {
      const batch = snapshot.slice(i, i + batchSize)
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
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        let proposals: AIProposal[] = []
        try {
          const clean = (data.result || '[]').replace(/```json|```/g, '').trim()
          proposals = JSON.parse(clean)
        } catch { proposals = [] }

        for (let j = i; j < Math.min(i + batchSize, snapshot.length); j++) {
          const rowId = snapshot[j].parsed.id
          const proposal = proposals.find((p: any) => p.row_id === rowId)
          if (proposal) {
            const isExpense = (snapshot[j].parsed.debit || 0) > 0
            // Match category by name from AI
            const matchedCat = plCategories.find(c => c.name === proposal.pl_category)
            const matchedDept = departments.find(d => d.name === proposal.department)
            result[j] = {
              ...result[j], proposal, status: 'accepted',
              override_tx_type: proposal.tx_type || 'direct',
              override_tx_subtype: proposal.tx_subtype || (isExpense ? 'expense' : 'revenue'),
              override_pl_category_id: matchedCat?.id || '',
              override_pl_category_name: matchedCat?.name || proposal.pl_category || '',
              override_pl_subcategory_id: '', override_pl_subcategory_name: '',
              override_department_id: matchedDept?.id || '',
              override_department_name: matchedDept?.name || proposal.department || '',
              override_dept_subcategory_id: '', override_dept_subcategory_name: '',
              override_expense_description: proposal.expense_description || '',
              override_revenue_stream: proposal.revenue_stream || '',
              override_partner_name: proposal.partner_match || snapshot[j].parsed.partner_name,
            }
          }
        }
      } catch (err: any) {
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

      const { data: newTx } = await supabase.from('transactions').insert({
        company_id: company, bank_id: bank, partner_id: partnerId,
        transaction_date: formatDate(p.date), statement_number: p.statement_number || null,
        type: row.override_tx_type, tx_subtype: row.override_tx_subtype,
        payment_method: row.override_payment_method || null,
        currency: p.currency, amount,
        exchange_rate: null, amount_usd: p.currency === 'USD' ? amount : null,
        pl_impact: isDirectWithPL,
        pl_category: isDirectWithPL ? (row.override_pl_category_name || null) : null,
        pl_subcategory: isDirectWithPL ? (row.override_pl_subcategory_name || null) : null,
        department: isDirectWithPL ? (row.override_department_name || null) : null,
        dept_subcategory: isDirectWithPL ? (row.override_dept_subcategory_name || null) : null,
        expense_description: isDirectWithPL ? (row.override_expense_description || null) : null,
        revenue_stream: isDirectWithPL ? (row.override_revenue_stream || null) : null,
        rev_alloc_type: row.override_rev_alloc || 'sg100',
        account_number: p.account_number || null, model: p.model || null,
        reference_number: p.reference_number || null,
        note: row.override_note || p.description || null, status: 'posted',
      }).select().single()

      // Link to invoice if selected
      if (row.override_tx_type === 'invoice_payment' && row.override_linked_invoice_id && newTx?.id) {
        const usdAmount = p.currency === 'USD' ? amount : null
        await supabase.from('invoice_transaction_links').insert({
          invoice_id: row.override_linked_invoice_id,
          transaction_id: newTx.id,
          allocated_amount: amount,
          allocated_amount_usd: usdAmount,
        })
        // Update invoice status
        const { data: invStatus } = await supabase
          .from('v_invoice_status').select('calculated_status').eq('id', row.override_linked_invoice_id).single()
        if (invStatus) {
          await supabase.from('invoices').update({ status: invStatus.calculated_status }).eq('id', row.override_linked_invoice_id)
        }
      }

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
        <div style={{ ...s.progressBar, width: '300px' }}><div style={{ ...s.progressFill, width: `${progress}%` }} /></div>
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
                  <div style={{ fontSize: '13px', color: '#085041', marginBottom: '8px' }}>🤖 AI analyzes {rows.length} rows in batches of 5...</div>
                  <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${progress}%`, transition: 'width 0.5s' }} /></div>
                  <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '6px' }}>{progress}% complete</div>
                </div>
              )}
              {analyzeError && (
                <div style={{ ...s.infoBox, background: '#FCEBEB', borderColor: '#F5A9A9', color: '#A32D2D', marginTop: '12px' }}>⚠️ {analyzeError}</div>
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

                  // Cascaded options based on selected IDs
                  const plSubs = getPlSubs(row.override_pl_category_id)
                  const deptSubs = getDeptSubs(row.override_department_id)
                  const expDescs = getExpDescs(row.override_dept_subcategory_id)
                  const linkedInvoice = openInvoices.find(i => i.id === row.override_linked_invoice_id)

                  return (
                    <div key={p.id} style={{
                      ...s.reviewRow,
                      ...(row.status === 'accepted' ? s.reviewRowAccepted : {}),
                      ...(row.status === 'rejected' ? s.reviewRowRejected : {}),
                    }}>
                      {/* Row header */}
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
                          {row.override_tx_type === 'direct' && row.override_pl_category_name && (
                            <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '2px' }}>📊 {row.override_pl_category_name}{row.override_department_name ? ` · ${row.override_department_name}` : ''}</div>
                          )}
                          {row.override_tx_type === 'invoice_payment' && (
                            <div style={{ fontSize: '11px', color: '#0C447C', marginTop: '2px' }}>
                              💳 Cash flow only{linkedInvoice ? ` · Closes: ${linkedInvoice.partner_name || '—'} ${linkedInvoice.invoice_number ? `(${linkedInvoice.invoice_number})` : ''}` : ' · No invoice linked'}
                            </div>
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

                      {/* ── EDIT PANEL ── */}
                      {isExpanded && (
                        <div style={s.editPanel}>
                          {row.proposal && (
                            <div style={s.aiNotes}>🤖 AI: {row.proposal.notes}</div>
                          )}

                          {/* Basic fields */}
                          <div style={s.editGrid2}>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Partner</label>
                              <input style={s.editInput} value={row.override_partner_name}
                                onChange={e => updateRow(p.id, { override_partner_name: e.target.value })} />
                            </div>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Type</label>
                              <select style={s.editSelect} value={row.override_tx_type}
                                onChange={e => updateRow(p.id, {
                                  override_tx_type: e.target.value as any,
                                  override_pl_category_id: '', override_pl_category_name: '',
                                  override_pl_subcategory_id: '', override_pl_subcategory_name: '',
                                  override_department_id: '', override_department_name: '',
                                  override_dept_subcategory_id: '', override_dept_subcategory_name: '',
                                  override_expense_description: '',
                                })}>
                                <option value="direct">⚡ Direct (P&L impact)</option>
                                <option value="invoice_payment">💳 Invoice payment (cash only)</option>
                              </select>
                            </div>
                          </div>

                          <div style={{ ...s.editGrid2, marginTop: '8px' }}>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Subtype</label>
                              <select style={s.editSelect} value={row.override_tx_subtype}
                                onChange={e => updateRow(p.id, { override_tx_subtype: e.target.value as any })}>
                                <option value="expense">📤 Expense</option>
                                <option value="revenue">📥 Revenue</option>
                              </select>
                            </div>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Note</label>
                              <input style={s.editInput} value={row.override_note}
                                onChange={e => updateRow(p.id, { override_note: e.target.value })}
                                placeholder={p.description?.slice(0, 40)} />
                            </div>
                          </div>

                          {/* ── INVOICE PAYMENT ── */}
                          {row.override_tx_type === 'invoice_payment' && (
                            <>
                              <div style={s.editSectionTitle}>Payment details</div>
                              <div style={s.editGrid2}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Payment method</label>
                                  <select style={s.editSelect} value={row.override_payment_method}
                                    onChange={e => updateRow(p.id, { override_payment_method: e.target.value })}>
                                    {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Link to open invoice</label>
                                  <select style={s.editSelect} value={row.override_linked_invoice_id}
                                    onChange={e => updateRow(p.id, { override_linked_invoice_id: e.target.value })}>
                                    <option value="">— No invoice (post standalone) —</option>
                                    {openInvoices.map(inv => (
                                      <option key={inv.id} value={inv.id}>
                                        {inv.partner_name || '—'}{inv.invoice_number ? ` · ${inv.invoice_number}` : ''} · ${(inv.remaining_usd || 0).toFixed(0)} rem.
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              {row.override_linked_invoice_id && linkedInvoice && (
                                <div style={{ ...s.aiNotes, background: '#E6F1FB', borderColor: '#7FB8EE', color: '#0C447C', marginTop: '8px' }}>
                                  💳 Will close invoice: <strong>{linkedInvoice.partner_name}</strong>{linkedInvoice.invoice_number ? ` · ${linkedInvoice.invoice_number}` : ''} · Remaining: <strong>${(linkedInvoice.remaining_usd || 0).toFixed(2)}</strong>
                                </div>
                              )}
                            </>
                          )}

                          {/* ── DIRECT EXPENSE ── */}
                          {row.override_tx_type === 'direct' && row.override_tx_subtype === 'expense' && (
                            <>
                              <div style={s.editSectionTitle}>P&L Classification</div>
                              <div style={s.editGrid2}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Category</label>
                                  <select style={s.editSelect} value={row.override_pl_category_id}
                                    onChange={e => {
                                      const cat = plCategories.find(c => c.id === e.target.value)
                                      updateRow(p.id, {
                                        override_pl_category_id: e.target.value,
                                        override_pl_category_name: cat?.name || '',
                                        override_pl_subcategory_id: '', override_pl_subcategory_name: '',
                                      })
                                    }}>
                                    <option value="">Select category...</option>
                                    {plCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Sub-category</label>
                                  <select style={s.editSelect} value={row.override_pl_subcategory_id}
                                    onChange={e => {
                                      const sub = plSubcategories.find(s => s.id === e.target.value)
                                      updateRow(p.id, { override_pl_subcategory_id: e.target.value, override_pl_subcategory_name: sub?.name || '' })
                                    }}
                                    disabled={!row.override_pl_category_id || plSubs.length === 0}>
                                    <option value="">Select sub-category...</option>
                                    {plSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                  </select>
                                </div>
                              </div>

                              <div style={s.editSectionTitle}>Department</div>
                              <div style={s.editGrid2}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Department</label>
                                  <select style={s.editSelect} value={row.override_department_id}
                                    onChange={e => {
                                      const dept = departments.find(d => d.id === e.target.value)
                                      updateRow(p.id, {
                                        override_department_id: e.target.value,
                                        override_department_name: dept?.name || '',
                                        override_dept_subcategory_id: '', override_dept_subcategory_name: '',
                                        override_expense_description: '',
                                      })
                                    }}>
                                    <option value="">Select department...</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Dept. Sub-category</label>
                                  <select style={s.editSelect} value={row.override_dept_subcategory_id}
                                    onChange={e => {
                                      const sub = deptSubcategories.find(s => s.id === e.target.value)
                                      updateRow(p.id, {
                                        override_dept_subcategory_id: e.target.value,
                                        override_dept_subcategory_name: sub?.name || '',
                                        override_expense_description: '',
                                      })
                                    }}
                                    disabled={!row.override_department_id || deptSubs.length === 0}>
                                    <option value="">Select sub-category...</option>
                                    {deptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                  </select>
                                </div>
                              </div>

                              <div style={{ marginTop: '8px' }}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Expense description</label>
                                  {expDescs.length > 0 ? (
                                    <select style={s.editSelect} value={row.override_expense_description}
                                      onChange={e => updateRow(p.id, { override_expense_description: e.target.value })}>
                                      <option value="">Select description...</option>
                                      {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                    </select>
                                  ) : (
                                    <input style={s.editInput} value={row.override_expense_description}
                                      onChange={e => updateRow(p.id, { override_expense_description: e.target.value })}
                                      placeholder="e.g. Telekom, AWS, Rent..." />
                                  )}
                                </div>
                              </div>

                              <div style={s.editSectionTitle}>Revenue stream allocation</div>
                              <div style={s.allocGrid}>
                                {[
                                  { id: 'sg100', label: '100% Social Growth', sub: 'Full allocation' },
                                  { id: 'af100', label: '100% Aimfox', sub: 'Full allocation' },
                                  { id: 'shared', label: 'Shared 50/50', sub: 'Both streams' },
                                  { id: 'byval', label: 'By value', sub: 'Custom split' },
                                ].map(a => (
                                  <div key={a.id}
                                    style={{ ...s.allocBtn, ...(row.override_rev_alloc === a.id ? s.allocBtnActive : {}) }}
                                    onClick={() => updateRow(p.id, { override_rev_alloc: a.id })}>
                                    <div style={{ fontSize: '11px', fontWeight: '500', color: '#111' }}>{a.label}</div>
                                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{a.sub}</div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {/* ── DIRECT REVENUE ── */}
                          {row.override_tx_type === 'direct' && row.override_tx_subtype === 'revenue' && (
                            <div style={{ marginTop: '8px' }}>
                              <div style={s.editField}>
                                <label style={s.editLbl}>Revenue stream</label>
                                <select style={s.editSelect} value={row.override_revenue_stream}
                                  onChange={e => updateRow(p.id, { override_revenue_stream: e.target.value })}>
                                  <option value="">Select stream...</option>
                                  {REVENUE_STREAMS.map(r => <option key={r}>{r}</option>)}
                                </select>
                              </div>
                            </div>
                          )}

                          {/* Footer buttons */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '6px' }}>
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
  dialog: { background: '#fff', borderRadius: '16px', width: '920px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
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
  editSectionTitle: { fontSize: '10px', fontWeight: '500', color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: '14px', marginBottom: '8px', paddingBottom: '4px', borderBottom: '0.5px solid #e5e5e5' },
  editGrid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  editField: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  editLbl: { fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  editInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  editSelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  allocGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginTop: '6px' },
  allocBtn: { border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 6px', background: '#f5f5f3', cursor: 'pointer', textAlign: 'center' as const },
  allocBtnActive: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  actionBtn: { width: '28px', height: '28px', borderRadius: '6px', border: '0.5px solid #e5e5e5', background: '#f5f5f3', cursor: 'pointer', fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  actionBtnAccepted: { background: '#E1F5EE', border: '1.5px solid #1D9E75', color: '#085041' },
  actionBtnRejected: { background: '#FCEBEB', border: '1.5px solid #E24B4A', color: '#A32D2D' },
  btnSmallGreen: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer' },
  btnSmallRed: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', border: '0.5px solid #E24B4A', borderRadius: '6px', background: 'transparent', color: '#A32D2D', cursor: 'pointer' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}