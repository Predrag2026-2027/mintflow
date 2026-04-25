import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getRate, convertToUSD } from '../services/currencyService'

interface Props {
  onClose: () => void
  transaction?: any
}

interface LinkedInvoice {
  invoice_id: string
  invoice_number: string
  partner_name: string
  invoice_date: string
  due_date: string
  currency: string
  amount: number
  amount_usd: number
  remaining_usd: number
  allocated_usd: number
}

interface ValidationErrors { [key: string]: string }

const REVENUE_STREAMS = [
  'Social Growth', 'Aimfox', 'Outsourced Services',
  'VAT Claimed', 'Interest Received', 'Loans', 'Credit', 'Other',
]

export default function TransactionDialog({ onClose, transaction }: Props) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showValidationSummary, setShowValidationSummary] = useState(false)

  // Reference data
  const [companies, setCompanies] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [allBanks, setAllBanks] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [openInvoices, setOpenInvoices] = useState<any[]>([])
  const [plCategories, setPlCategories] = useState<any[]>([])
  const [plSubcategories, setPlSubcategories] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [deptSubcategories, setDeptSubcategories] = useState<any[]>([])
  const [expenseDescriptions, setExpenseDescriptions] = useState<any[]>([])

  // Step 1
  const [companyId, setCompanyId] = useState('')
  const [bankId, setBankId] = useState('')
  const [currency, setCurrency] = useState('')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [statement, setStatement] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [partnerSearch, setPartnerSearch] = useState('')
  const [newPartnerName, setNewPartnerName] = useState('')
  const [showNewPartner, setShowNewPartner] = useState(false)
  const [showBankFields, setShowBankFields] = useState(false)
  const [accNum, setAccNum] = useState('')
  const [model, setModel] = useState('')
  const [refNum, setRefNum] = useState('')

  // Step 2
  const [txType, setTxType] = useState<'invoice_payment' | 'direct'>('invoice_payment')
  const [directSubtype, setDirectSubtype] = useState<'expense' | 'revenue'>('expense')
  const [linkedInvoices, setLinkedInvoices] = useState<LinkedInvoice[]>([])
  const [invoiceSearch, setInvoiceSearch] = useState('')

  // P&L
  const [plCatId, setPlCatId] = useState('')
  const [plCatName, setPlCatName] = useState('')
  const [plSubId, setPlSubId] = useState('')
  const [plSubName, setPlSubName] = useState('')
  const [deptId, setDeptId] = useState('')
  const [deptName, setDeptName] = useState('')
  const [deptSubId, setDeptSubId] = useState('')
  const [deptSubName, setDeptSubName] = useState('')
  const [expDesc, setExpDesc] = useState('')
  const [revStream, setRevStream] = useState('')
  const [revAlloc, setRevAlloc] = useState('sg100')
  const [deptSplit, setDeptSplit] = useState('none')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // ── By value split state ──────────────────────────────
  const [aimfoxVal, setAimfoxVal] = useState('')
  const [sgVal, setSgVal] = useState('')

  // Step 3
  const [amount, setAmount] = useState('')
  const [exRate, setExRate] = useState('')
  const [isIndexed, setIsIndexed] = useState(false)
  const [rateSource, setRateSource] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)

  const usdAmount = (() => {
    const a = parseFloat(amount) || 0
    const r = parseFloat(exRate) || 0
    return convertToUSD(a, currency, r)
  })()

  const totalAllocated = linkedInvoices.reduce((s, i) => s + (i.allocated_usd || 0), 0)
  const unallocated = usdAmount - totalAllocated

  // ── Auto-compute opposite split value ────────────────
  const handleAimfoxChange = (val: string) => {
    setAimfoxVal(val)
    const aimfox = parseFloat(val) || 0
    const total = parseFloat(amount) || 0
    if (total > 0 && aimfox >= 0 && aimfox <= total) {
      setSgVal((total - aimfox).toFixed(2))
    } else {
      setSgVal('')
    }
  }

  const handleSgChange = (val: string) => {
    setSgVal(val)
    const sg = parseFloat(val) || 0
    const total = parseFloat(amount) || 0
    if (total > 0 && sg >= 0 && sg <= total) {
      setAimfoxVal((total - sg).toFixed(2))
    } else {
      setAimfoxVal('')
    }
  }

  // Reset split values when amount changes
  useEffect(() => {
    if (revAlloc === 'byval') {
      setAimfoxVal('')
      setSgVal('')
    }
  }, [amount]) // eslint-disable-line

  // ── Split validation ─────────────────────────────────
  const splitTotal = (parseFloat(aimfoxVal) || 0) + (parseFloat(sgVal) || 0)
  const splitOk = revAlloc !== 'byval' || Math.abs(splitTotal - (parseFloat(amount) || 0)) < 0.01
  const splitPct = parseFloat(amount) > 0
    ? { af: ((parseFloat(aimfoxVal) || 0) / parseFloat(amount) * 100).toFixed(1), sg: ((parseFloat(sgVal) || 0) / parseFloat(amount) * 100).toFixed(1) }
    : { af: '0', sg: '0' }

  // ── Cascade helpers ──────────────────────────────────
  const expenseCategories = plCategories.filter(c => c.type !== 'revenue')
  const getPlSubs = (catId: string) => plSubcategories.filter(s => s.category_id === catId)
  const getDeptSubs = (dId: string) => deptSubcategories.filter(s => s.department_id === dId)
  const getExpDescs = (subId: string) => expenseDescriptions.filter(e => e.dept_subcategory_id === subId)

  const currentPlSubs = getPlSubs(plCatId)
  const currentDeptSubs = getDeptSubs(deptId)
  const currentExpDescs = getExpDescs(deptSubId)

  // ── Validation ───────────────────────────────────────
  const runValidation = () => {
    const e: ValidationErrors = {}
    if (!companyId) e.companyId = 'Company is required'
    if (!bankId) e.bankId = 'Bank is required'
    if (!currency) e.currency = 'Currency is required'
    if (!txDate) e.txDate = 'Transaction date is required'
    if (!amount || parseFloat(amount) <= 0) e.amount = 'Amount must be greater than 0'
    if (currency && currency !== 'USD' && (!exRate || parseFloat(exRate) <= 0)) e.exRate = 'Exchange rate is required'
    if (txType === 'invoice_payment' && linkedInvoices.length === 0) e.linkedInvoices = 'Select at least one invoice to close'
    if (txType === 'direct') {
      if (directSubtype === 'expense') {
        if (!plCatId) e.plCat = 'P&L Category is required'
        if (!deptId) e.dept = 'Department is required'
        if (revAlloc === 'byval' && !splitOk) e.split = 'Split values must sum to total amount'
      }
      if (directSubtype === 'revenue' && !revStream) e.revStream = 'Revenue stream is required'
    }
    return e
  }

  useEffect(() => {
    setErrors(runValidation())
  }, [companyId, bankId, currency, txDate, amount, exRate, txType, linkedInvoices, directSubtype, plCatId, deptId, revStream, revAlloc, aimfoxVal, sgVal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load reference data ──────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [
        { data: comp }, { data: bnk }, { data: part },
        { data: plCat }, { data: plSub },
        { data: dept }, { data: deptSub }, { data: expD },
      ] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('banks').select('*').order('name'),
        supabase.from('partners').select('*').order('name'),
        supabase.from('pl_categories').select('id,name,type,sort_order').order('sort_order'),
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
      if (expD) setExpenseDescriptions(expD)
    }
    load()
  }, [])

  useEffect(() => {
    if (companyId) {
      setBanks(allBanks.filter(b => b.company_id === companyId))
      if (!transaction) { setBankId(''); setCurrency('') }
    }
  }, [companyId, allBanks, transaction])

  useEffect(() => {
    if (!companyId) return
    const fetchOpenInvoices = async () => {
      const { data } = await supabase
        .from('v_invoice_status').select('*').eq('company_id', companyId)
        .in('calculated_status', ['unpaid', 'partial', 'overpaid'])
        .order('due_date', { ascending: true })
      if (data) setOpenInvoices(data)
    }
    fetchOpenInvoices()
  }, [companyId])

  // ── Populate form when editing ───────────────────────
  useEffect(() => {
    if (!transaction) return
    setCompanyId(transaction.company_id || '')
    setBankId(transaction.bank_id || '')
    setCurrency(transaction.currency || '')
    setStatement(transaction.statement_number || '')
    setTxDate(transaction.transaction_date || '')
    setPartnerId(transaction.partner_id || '')
    setPartnerSearch(transaction.partners?.name || '')
    setTxType(transaction.type || 'invoice_payment')
    setDirectSubtype(transaction.tx_subtype || 'expense')
    setNote(transaction.note || '')
    setAmount(transaction.amount?.toString() || '')
    setExRate(transaction.exchange_rate?.toString() || '')
    setIsIndexed(transaction.is_indexed || false)
    setPlCatName(transaction.pl_category || '')
    setPlSubName(transaction.pl_subcategory || '')
    setDeptName(transaction.department || '')
    setDeptSubName(transaction.dept_subcategory || '')
    setExpDesc(transaction.expense_description || '')
    setRevStream(transaction.revenue_stream || '')
    setRevAlloc(transaction.rev_alloc_type || 'sg100')
    setDeptSplit(transaction.dept_split_type || 'none')
    setTags(transaction.tags || [])
    setAccNum(transaction.account_number || '')
    setModel(transaction.model || '')
    setRefNum(transaction.reference_number || '')
  }, [transaction])

  useEffect(() => {
    if (transaction && plCategories.length > 0) {
      const cat = plCategories.find(c => c.name === transaction.pl_category)
      if (cat) setPlCatId(cat.id)
    }
  }, [transaction, plCategories])

  useEffect(() => {
    if (transaction && plSubcategories.length > 0 && plCatId) {
      const sub = plSubcategories.find(s => s.name === transaction.pl_subcategory && s.category_id === plCatId)
      if (sub) setPlSubId(sub.id)
    }
  }, [transaction, plSubcategories, plCatId])

  useEffect(() => {
    if (transaction && departments.length > 0) {
      const dept = departments.find(d => d.name === transaction.department)
      if (dept) setDeptId(dept.id)
    }
  }, [transaction, departments])

  useEffect(() => {
    if (transaction && deptSubcategories.length > 0 && deptId) {
      const sub = deptSubcategories.find(s => s.name === transaction.dept_subcategory && s.department_id === deptId)
      if (sub) setDeptSubId(sub.id)
    }
  }, [transaction, deptSubcategories, deptId])

  const filteredPartners = partners.filter(p =>
    !partnerSearch || p.name.toLowerCase().includes(partnerSearch.toLowerCase())
  )

  const filteredOpenInvoices = openInvoices.filter(inv => {
    if (!invoiceSearch) return true
    return (inv.partner_name || '').toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      (inv.invoice_number || '').toLowerCase().includes(invoiceSearch.toLowerCase())
  })

  const touch = (field: string) => setTouched(prev => ({ ...prev, [field]: true }))
  const fieldErr = (field: string) => touched[field] ? errors[field] : undefined
  const totalErrors = Object.keys(errors).length
  const isValid = totalErrors === 0

  const touchStep = (n: number) => {
    if (n === 1) setTouched(p => ({ ...p, companyId: true, bankId: true, currency: true, txDate: true }))
    if (n === 2) setTouched(p => ({ ...p, linkedInvoices: true, plCat: true, dept: true, revStream: true }))
    if (n === 3) setTouched(p => ({ ...p, amount: true, exRate: true }))
  }

  const stepHasError = (n: number) => {
    const stepFields: Record<number, string[]> = {
      1: ['companyId', 'bankId', 'currency', 'txDate'],
      2: ['linkedInvoices', 'plCat', 'dept', 'revStream', 'split'],
      3: ['amount', 'exRate'],
    }
    return (stepFields[n] || []).some(f => !!errors[f])
  }

  const isInvoiceLinked = (id: string) => linkedInvoices.some(l => l.invoice_id === id)

  const addInvoiceLink = (inv: any) => {
    if (isInvoiceLinked(inv.id)) return
    const remaining = inv.remaining_usd ?? inv.amount_usd ?? 0
    const suggested = Math.min(remaining, Math.max(0, usdAmount - totalAllocated))
    setLinkedInvoices(prev => [...prev, {
      invoice_id: inv.id,
      invoice_number: inv.invoice_number || '—',
      partner_name: inv.partner_name || '—',
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      currency: inv.currency,
      amount: inv.amount,
      amount_usd: inv.amount_usd,
      remaining_usd: remaining,
      allocated_usd: Math.max(0, suggested),
    }])
    touch('linkedInvoices')
  }

  const removeInvoiceLink = (invId: string) => setLinkedInvoices(prev => prev.filter(l => l.invoice_id !== invId))
  const updateAllocated = (invId: string, val: number) => setLinkedInvoices(prev => prev.map(l => l.invoice_id === invId ? { ...l, allocated_usd: val } : l))

  const fetchRate = async () => {
    if (!currency || currency === 'USD') { setExRate('1'); setRateSource('N/A'); return }
    setFetchingRate(true)
    try {
      const rateData = await getRate(currency, txDate, isIndexed)
      setExRate(rateData.rate.toString())
      setRateSource(rateData.source)
    } catch {
      const fallbacks: Record<string, number> = { RSD: 117.0, EUR: 1.08, AED: 0.272 }
      setExRate(fallbacks[currency]?.toString() || '')
      setRateSource('Fallback')
    }
    setFetchingRate(false)
  }

  const toggleTag = (t: string) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const stepTitles = ['Basic information', 'Type & classification', 'Amount & review']

  const getStatusStyle = (status: string): React.CSSProperties => {
    const map: Record<string, React.CSSProperties> = {
      unpaid: { background: '#FCEBEB', color: '#A32D2D' },
      partial: { background: '#FAEEDA', color: '#633806' },
      paid: { background: '#E1F5EE', color: '#085041' },
      reconciled: { background: '#f0f0ee', color: '#666' },
    }
    return map[status] || { background: '#f0f0ee', color: '#888' }
  }

  // ── Rev alloc label for review ───────────────────────
  const revAllocLabel = () => {
    if (revAlloc === 'sg100') return '100% Social Growth'
    if (revAlloc === 'af100') return '100% Aimfox'
    if (revAlloc === 'shared') return 'Shared 50/50'
    if (revAlloc === 'byval') {
      const af = parseFloat(aimfoxVal) || 0
      const sg = parseFloat(sgVal) || 0
      return `By value — Aimfox: ${amount ? currency : 'USD'} ${af.toFixed(2)} / Social Growth: ${amount ? currency : 'USD'} ${sg.toFixed(2)}`
    }
    return '—'
  }

  const handlePost = async () => {
    setTouched({ companyId: true, bankId: true, currency: true, txDate: true, linkedInvoices: true, plCat: true, dept: true, revStream: true, amount: true, exRate: true, split: true })
    const e = runValidation()
    if (Object.keys(e).length > 0) { setShowValidationSummary(true); return }

    setSaving(true)
    try {
      let finalPartnerId = partnerId
      if (showNewPartner && newPartnerName) {
        const { data: newP } = await supabase.from('partners').insert({ name: newPartnerName }).select().single()
        if (newP) finalPartnerId = newP.id
      }

      const isDirectWithPL = txType === 'direct'

      // Compute split amounts for byval
      const aimfoxAmount = revAlloc === 'byval' ? (parseFloat(aimfoxVal) || 0) : null
      const sgAmount = revAlloc === 'byval' ? (parseFloat(sgVal) || 0) : null

      const payload = {
        company_id: companyId || null,
        bank_id: bankId || null,
        partner_id: finalPartnerId || null,
        transaction_date: txDate,
        statement_number: statement || null,
        type: txType,
        tx_subtype: txType === 'direct' ? directSubtype : null,
        currency,
        amount: parseFloat(amount),
        exchange_rate: parseFloat(exRate) || null,
        amount_usd: usdAmount,
        is_indexed: isIndexed,
        pl_impact: isDirectWithPL,
        pl_category: isDirectWithPL ? (plCatName || null) : null,
        pl_subcategory: isDirectWithPL ? (plSubName || null) : null,
        department: isDirectWithPL ? (deptName || null) : null,
        dept_subcategory: isDirectWithPL ? (deptSubName || null) : null,
        expense_description: isDirectWithPL ? (expDesc || null) : null,
        revenue_stream: isDirectWithPL ? (revStream || null) : null,
        rev_alloc_type: revAlloc,
        dept_split_type: deptSplit,
        // Store byval split amounts
        rev_alloc_aimfox: aimfoxAmount,
        rev_alloc_sg: sgAmount,
        account_number: accNum || null,
        model: model || null,
        reference_number: refNum || null,
        note: note || null,
        tags: tags.length > 0 ? tags : null,
        status: 'posted',
      }

      let txId: string
      if (transaction?.id) {
        await supabase.from('transactions').update(payload).eq('id', transaction.id)
        txId = transaction.id
      } else {
        const { data: newTx } = await supabase.from('transactions').insert(payload).select().single()
        txId = newTx?.id
      }

      if (txType === 'invoice_payment' && linkedInvoices.length > 0 && txId) {
        for (const link of linkedInvoices) {
          await supabase.from('invoice_transaction_links').upsert({
            invoice_id: link.invoice_id,
            transaction_id: txId,
            allocated_amount: link.allocated_usd,
            allocated_amount_usd: link.allocated_usd,
          }, { onConflict: 'invoice_id,transaction_id' })
          const { data: invStatus } = await supabase.from('v_invoice_status').select('calculated_status').eq('id', link.invoice_id).single()
          if (invStatus) await supabase.from('invoices').update({ status: invStatus.calculated_status }).eq('id', link.invoice_id)
        }
      }

      setSuccess(true)
      setTimeout(() => { setSuccess(false); onClose() }, 1500)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  if (success) return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', minHeight: '220px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '20px', color: '#111' }}>{transaction ? 'Transaction updated!' : 'Transaction posted!'}</div>
        <div style={{ fontSize: '13px', color: '#888' }}>{txType === 'invoice_payment' ? `${linkedInvoices.length} invoice(s) updated.` : 'Posted to P&L and cash flow.'}</div>
      </div>
    </div>
  )

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>{transaction ? 'Edit transaction' : 'New transaction'}</div>
            <div style={s.headerSub}>Step {step} of 3 — {stepTitles[step - 1]}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {txType === 'direct' && <div style={s.plBadge}>P&L Impact</div>}
            {txType === 'invoice_payment' && <div style={s.cashBadge}>Cash Flow Only</div>}
            <span style={s.logoText}>Mintflow</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>

        <div style={s.stepsBar}>
          {stepTitles.map((t, i) => {
            const hasErr = step > i + 1 && stepHasError(i + 1)
            return (
              <React.Fragment key={i}>
                <div style={s.stepItem} onClick={() => { touchStep(step); setStep(i + 1) }}>
                  <div style={{ ...s.stepNum, ...(step === i + 1 ? s.stepActive : {}), ...(step > i + 1 && !hasErr ? s.stepDone : {}), ...(hasErr ? s.stepError : {}) }}>
                    {step > i + 1 ? (hasErr ? '!' : '✓') : i + 1}
                  </div>
                  <span style={{ ...s.stepLabel, ...(step === i + 1 ? { color: '#0F6E56', fontWeight: '500' } : {}) }}>{t}</span>
                </div>
                {i < 2 && <div style={s.stepDiv} />}
              </React.Fragment>
            )
          })}
        </div>

        {showValidationSummary && !isValid && (
          <div style={s.validationBanner}>
            <span>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '500', fontSize: '12px' }}>Fix {totalErrors} error{totalErrors > 1 ? 's' : ''} before posting:</div>
              <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.9 }}>{Object.values(errors).join(' · ')}</div>
            </div>
            <button style={s.bannerClose} onClick={() => setShowValidationSummary(false)}>×</button>
          </div>
        )}

        <div style={s.body}>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <div style={s.section}>
                <div style={s.sectionTitle}>Bank & account</div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Company <span style={s.req}>*</span></label>
                    <select style={{ ...s.select, ...(fieldErr('companyId') ? s.inputError : {}) }} value={companyId}
                      onChange={e => { setCompanyId(e.target.value); touch('companyId') }} onBlur={() => touch('companyId')}>
                      <option value="">Select company...</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {fieldErr('companyId') && <span style={s.errorMsg}>{fieldErr('companyId')}</span>}
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Bank / Account <span style={s.req}>*</span></label>
                    <select style={{ ...s.select, ...(fieldErr('bankId') ? s.inputError : {}) }} value={bankId}
                      onChange={e => { setBankId(e.target.value); touch('bankId') }} onBlur={() => touch('bankId')}>
                      <option value="">Select bank...</option>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    {fieldErr('bankId') && <span style={s.errorMsg}>{fieldErr('bankId')}</span>}
                  </div>
                </div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Currency <span style={s.req}>*</span></label>
                    <select style={{ ...s.select, ...(fieldErr('currency') ? s.inputError : {}) }} value={currency}
                      onChange={e => { setCurrency(e.target.value); touch('currency') }} onBlur={() => touch('currency')}>
                      <option value="">Select...</option>
                      {(companies.find(c => c.id === companyId)?.currencies || ['USD', 'RSD', 'EUR', 'AED']).map((cur: string) => (
                        <option key={cur}>{cur}</option>
                      ))}
                    </select>
                    {fieldErr('currency') && <span style={s.errorMsg}>{fieldErr('currency')}</span>}
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
                    <input type="date" style={{ ...s.input, ...(fieldErr('txDate') ? s.inputError : {}) }} value={txDate}
                      onChange={e => { setTxDate(e.target.value); touch('txDate') }} onBlur={() => touch('txDate')} />
                    {fieldErr('txDate') && <span style={s.errorMsg}>{fieldErr('txDate')}</span>}
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Partner</label>
                    {!showNewPartner ? (
                      <>
                        <input style={s.input} value={partnerSearch}
                          onChange={e => { setPartnerSearch(e.target.value); setPartnerId('') }} placeholder="Search partner..." />
                        {partnerSearch && !partnerId && (
                          <div style={s.dropdown}>
                            {filteredPartners.slice(0, 6).map(p => (
                              <div key={p.id} style={s.dropdownItem} onClick={() => { setPartnerId(p.id); setPartnerSearch(p.name) }}>{p.name}</div>
                            ))}
                            <div style={{ ...s.dropdownItem, color: '#1D9E75' }} onClick={() => { setShowNewPartner(true); setPartnerSearch('') }}>+ Add new partner</div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <input style={s.input} value={newPartnerName} onChange={e => setNewPartnerName(e.target.value)} placeholder="New partner name..." />
                        <button style={s.linkBtn} onClick={() => setShowNewPartner(false)}>← Back to search</button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div style={s.section}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={s.sectionTitle}>Payment reference</div>
                  <button style={s.linkBtn} onClick={() => setShowBankFields(!showBankFields)}>{showBankFields ? '− Hide' : '+ Show'}</button>
                </div>
                {showBankFields ? (
                  <div style={s.row3}>
                    <div style={s.field}><label style={s.lbl}>Account number</label><input style={s.input} value={accNum} onChange={e => setAccNum(e.target.value)} placeholder="Partner account" /></div>
                    <div style={s.field}><label style={s.lbl}>Model</label><input style={s.input} value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. 97" /></div>
                    <div style={s.field}><label style={s.lbl}>Reference number</label><input style={s.input} value={refNum} onChange={e => setRefNum(e.target.value)} placeholder="Poziv na broj" /></div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#aaa' }}>Account number, model, poziv na broj.</div>
                )}
              </div>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <div style={s.section}>
                <div style={s.sectionTitle}>Transaction type <span style={s.req}>*</span></div>
                <div style={s.typeGrid}>
                  <div style={{ ...s.typeCard, ...(txType === 'invoice_payment' ? s.typeCardPayment : {}) }} onClick={() => setTxType('invoice_payment')}>
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>💳</div>
                    <div style={s.typeCardTitle}>Invoice payment</div>
                    <div style={s.typeCardSub}>Closes one or more open invoices. No new P&L impact.</div>
                  </div>
                  <div style={{ ...s.typeCard, ...(txType === 'direct' ? s.typeCardDirect : {}) }} onClick={() => setTxType('direct')}>
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>⚡</div>
                    <div style={s.typeCardTitle}>Direct transaction</div>
                    <div style={s.typeCardSub}>No invoice exists or will exist. Impacts P&L directly.</div>
                  </div>
                </div>
              </div>

              {txType === 'invoice_payment' && (
                <div style={s.section}>
                  <div style={{ ...s.infoBox, marginBottom: '12px' }}>
                    This transaction will close the selected invoice(s). P&L was already booked when those invoices were posted.
                  </div>
                  {fieldErr('linkedInvoices') && (
                    <div style={{ ...s.infoBox, background: '#FCEBEB', borderColor: '#F5A9A9', color: '#A32D2D', marginBottom: '12px' }}>
                      ⚠️ {fieldErr('linkedInvoices')}
                    </div>
                  )}
                  <input style={{ ...s.input, marginBottom: '10px', width: '100%', boxSizing: 'border-box' as const }}
                    value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
                    placeholder="Search by partner or invoice number..." />
                  {filteredOpenInvoices.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center' as const, color: '#aaa', fontSize: '13px', background: '#f5f5f3', borderRadius: '8px' }}>
                      No open invoices found for this company.
                    </div>
                  ) : (
                    <div style={s.invoiceList}>
                      {filteredOpenInvoices.map(inv => {
                        const linked = isInvoiceLinked(inv.id)
                        return (
                          <div key={inv.id} style={{ ...s.invoiceRow, ...(linked ? s.invoiceRowLinked : {}) }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{inv.partner_name || '—'}</span>
                                {inv.invoice_number && <span style={s.invNumBadge}>{inv.invoice_number}</span>}
                                <span style={{ ...s.statusBadge, ...getStatusStyle(inv.calculated_status) }}>{inv.calculated_status}</span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#888' }}>
                                {inv.invoice_date}{inv.due_date && ` · Due: ${inv.due_date}`}
                                <span style={{ color: (inv.remaining_usd || 0) > 0 ? '#A32D2D' : '#1D9E75' }}> · Remaining: ${(inv.remaining_usd || 0).toFixed(2)}</span>
                              </div>
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: '#111', whiteSpace: 'nowrap' as const, marginRight: '10px' }}>
                              {(inv.amount || 0).toLocaleString()} {inv.currency}
                            </div>
                            {!linked
                              ? <button style={s.addBtn} onClick={() => addInvoiceLink(inv)}>+ Add</button>
                              : <button style={s.removeBtn} onClick={() => removeInvoiceLink(inv.id)}>✕ Remove</button>
                            }
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {linkedInvoices.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={s.sectionTitle}>Allocation per invoice</div>
                      {linkedInvoices.map(link => (
                        <div key={link.invoice_id} style={s.allocRow}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{link.partner_name}</div>
                            <div style={{ fontSize: '11px', color: '#888' }}>{link.invoice_number} · Remaining: ${link.remaining_usd.toFixed(2)}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#888' }}>USD</span>
                            <input type="number" style={{ ...s.input, width: '110px', textAlign: 'right' as const }}
                              value={link.allocated_usd} onChange={e => updateAllocated(link.invoice_id, parseFloat(e.target.value) || 0)} />
                          </div>
                        </div>
                      ))}
                      <div style={s.allocSummaryBox}>
                        <div style={s.allocSummaryRow}><span>Transaction total</span><span style={{ fontWeight: '500' }}>${usdAmount.toFixed(2)}</span></div>
                        <div style={s.allocSummaryRow}><span>Total allocated</span><span style={{ fontWeight: '500', color: '#1D9E75' }}>${totalAllocated.toFixed(2)}</span></div>
                        {Math.abs(unallocated) > 0.01 && (
                          <div style={{ ...s.allocSummaryRow, color: unallocated > 0 ? '#633806' : '#A32D2D' }}>
                            <span>{unallocated > 0 ? 'Unallocated' : 'Over-allocated'}</span>
                            <span style={{ fontWeight: '500' }}>${Math.abs(unallocated).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {txType === 'direct' && (
                <>
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Subtype</div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ ...s.typeChip, ...(directSubtype === 'expense' ? s.typeChipExpense : {}) }} onClick={() => setDirectSubtype('expense')}>📤 Expense</div>
                      <div style={{ ...s.typeChip, ...(directSubtype === 'revenue' ? s.typeChipRevenue : {}) }} onClick={() => setDirectSubtype('revenue')}>📥 Revenue</div>
                    </div>
                    <div style={{ ...s.infoBox, background: '#FFF3CD', borderColor: '#E5B96A', color: '#633806' }}>
                      ⚠️ Direct transactions impact P&L immediately. If an invoice arrives later, you can reconcile it.
                    </div>
                  </div>

                  {directSubtype === 'expense' && (
                    <>
                      <div style={s.section}>
                        <div style={s.sectionTitle}>P&L classification</div>
                        <div style={s.row2}>
                          <div style={s.field}>
                            <label style={s.lbl}>P&L Category <span style={s.req}>*</span></label>
                            <select style={{ ...s.select, ...(fieldErr('plCat') ? s.inputError : {}) }} value={plCatId}
                              onChange={e => { const cat = plCategories.find(c => c.id === e.target.value); setPlCatId(e.target.value); setPlCatName(cat?.name || ''); setPlSubId(''); setPlSubName(''); touch('plCat') }}
                              onBlur={() => touch('plCat')}>
                              <option value="">Select P&L category...</option>
                              {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {fieldErr('plCat') && <span style={s.errorMsg}>{fieldErr('plCat')}</span>}
                          </div>
                          <div style={s.field}>
                            <label style={s.lbl}>P&L Sub-category</label>
                            <select style={s.select} value={plSubId}
                              onChange={e => { const sub = plSubcategories.find(s => s.id === e.target.value); setPlSubId(e.target.value); setPlSubName(sub?.name || '') }}
                              disabled={!plCatId || currentPlSubs.length === 0}>
                              <option value="">Select sub-category...</option>
                              {currentPlSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={s.row2}>
                          <div style={s.field}>
                            <label style={s.lbl}>Department <span style={s.req}>*</span></label>
                            <select style={{ ...s.select, ...(fieldErr('dept') ? s.inputError : {}) }} value={deptId}
                              onChange={e => { const dept = departments.find(d => d.id === e.target.value); setDeptId(e.target.value); setDeptName(dept?.name || ''); setDeptSubId(''); setDeptSubName(''); setExpDesc(''); touch('dept') }}
                              onBlur={() => touch('dept')}>
                              <option value="">Select department...</option>
                              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {fieldErr('dept') && <span style={s.errorMsg}>{fieldErr('dept')}</span>}
                          </div>
                          <div style={s.field}>
                            <label style={s.lbl}>Dept. sub-category</label>
                            <select style={s.select} value={deptSubId}
                              onChange={e => { const sub = deptSubcategories.find(s => s.id === e.target.value); setDeptSubId(e.target.value); setDeptSubName(sub?.name || ''); setExpDesc('') }}
                              disabled={!deptId || currentDeptSubs.length === 0}>
                              <option value="">Select sub-category...</option>
                              {currentDeptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={s.field}>
                          <label style={s.lbl}>Expense description</label>
                          {currentExpDescs.length > 0 ? (
                            <select style={s.select} value={expDesc} onChange={e => setExpDesc(e.target.value)}>
                              <option value="">Select description...</option>
                              {currentExpDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                            </select>
                          ) : (
                            <input style={s.input} value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Enter expense description..." />
                          )}
                        </div>
                      </div>

                      {/* ── Revenue stream allocation ── */}
                      <div style={s.section}>
                        <div style={s.sectionTitle}>Revenue stream allocation</div>
                        <div style={s.allocGrid}>
                          {[
                            { id: 'sg100', label: '100% Social Growth', sub: 'Full allocation' },
                            { id: 'af100', label: '100% Aimfox', sub: 'Full allocation' },
                            { id: 'shared', label: 'Shared 50/50', sub: 'Both streams' },
                            { id: 'byval', label: 'By value', sub: 'Custom split' },
                          ].map(a => (
                            <div key={a.id}
                              style={{ ...s.allocBtn, ...(revAlloc === a.id ? s.allocBtnActive : {}) }}
                              onClick={() => { setRevAlloc(a.id); setAimfoxVal(''); setSgVal('') }}>
                              <div style={s.allocBtnLabel}>{a.label}</div>
                              <div style={s.allocBtnSub}>{a.sub}</div>
                            </div>
                          ))}
                        </div>

                        {/* ── By value input fields ── */}
                        {revAlloc === 'byval' && (
                          <div style={{ marginTop: '14px', background: '#f5f5f3', borderRadius: '10px', padding: '14px', border: '0.5px solid #e5e5e5' }}>
                            <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
                              Split po vrednosti — ukupno: {amount ? `${parseFloat(amount).toLocaleString('sr-RS')} ${currency}` : '—'}
                            </div>
                            <div style={s.row2}>
                              <div style={s.field}>
                                <label style={s.lbl}>Aimfox ({currency || '—'})</label>
                                <input
                                  type="number"
                                  style={{ ...s.input, ...(fieldErr('split') ? s.inputError : {}) }}
                                  value={aimfoxVal}
                                  onChange={e => handleAimfoxChange(e.target.value)}
                                  placeholder="0.00"
                                  min="0"
                                  max={amount}
                                />
                                {aimfoxVal && parseFloat(amount) > 0 && (
                                  <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '2px' }}>
                                    {splitPct.af}% od ukupnog
                                  </div>
                                )}
                              </div>
                              <div style={s.field}>
                                <label style={s.lbl}>Social Growth ({currency || '—'})</label>
                                <input
                                  type="number"
                                  style={{ ...s.input, ...(fieldErr('split') ? s.inputError : {}) }}
                                  value={sgVal}
                                  onChange={e => handleSgChange(e.target.value)}
                                  placeholder="0.00"
                                  min="0"
                                  max={amount}
                                />
                                {sgVal && parseFloat(amount) > 0 && (
                                  <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '2px' }}>
                                    {splitPct.sg}% od ukupnog
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Summary bar */}
                            <div style={{ marginTop: '10px', background: '#fff', borderRadius: '8px', padding: '10px 12px', border: '0.5px solid #e5e5e5' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                                <span style={{ color: '#888' }}>Aimfox</span>
                                <span style={{ fontWeight: '500', color: '#0C447C' }}>{aimfoxVal ? `${parseFloat(aimfoxVal).toLocaleString('sr-RS')} ${currency}` : '—'}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
                                <span style={{ color: '#888' }}>Social Growth</span>
                                <span style={{ fontWeight: '500', color: '#0F6E56' }}>{sgVal ? `${parseFloat(sgVal).toLocaleString('sr-RS')} ${currency}` : '—'}</span>
                              </div>
                              {/* Visual progress bar */}
                              {aimfoxVal && sgVal && parseFloat(amount) > 0 && (
                                <div style={{ height: '6px', borderRadius: '3px', background: '#e5e5e5', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${splitPct.af}%`, background: '#0C447C', borderRadius: '3px', display: 'inline-block' }} />
                                  <div style={{ height: '100%', width: `${splitPct.sg}%`, background: '#1D9E75', borderRadius: '3px', display: 'inline-block' }} />
                                </div>
                              )}
                              {/* Validation */}
                              {aimfoxVal && sgVal && !splitOk && (
                                <div style={{ fontSize: '11px', color: '#A32D2D', marginTop: '6px' }}>
                                  ⚠️ Zbir ({(splitTotal).toLocaleString('sr-RS')} {currency}) ne odgovara ukupnom iznosu ({parseFloat(amount).toLocaleString('sr-RS')} {currency})
                                </div>
                              )}
                              {aimfoxVal && sgVal && splitOk && (
                                <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '6px' }}>✓ Split je ispravan</div>
                              )}
                            </div>
                            {!amount && (
                              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '8px' }}>
                                ℹ️ Unesite iznos u Step 3 pa se vratite da popunite split.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {directSubtype === 'revenue' && (
                    <div style={s.section}>
                      <div style={s.sectionTitle}>Revenue details</div>
                      <div style={s.field}>
                        <label style={s.lbl}>Revenue stream <span style={s.req}>*</span></label>
                        <select style={{ ...s.select, ...(fieldErr('revStream') ? s.inputError : {}) }} value={revStream}
                          onChange={e => { setRevStream(e.target.value); touch('revStream') }} onBlur={() => touch('revStream')}>
                          <option value="">Select stream...</option>
                          {REVENUE_STREAMS.map(r => <option key={r}>{r}</option>)}
                        </select>
                        {fieldErr('revStream') && <span style={s.errorMsg}>{fieldErr('revStream')}</span>}
                      </div>
                    </div>
                  )}

                  <div style={s.section}>
                    <div style={s.sectionTitle}>Tags & note</div>
                    <div style={s.tagRow}>
                      {['Recurring', 'Prepayment', 'Accrual', 'Capital expenditure', 'Tax deductible', 'Reimbursable'].map(t => (
                        <span key={t} style={{ ...s.tag, ...(tags.includes(t) ? s.tagActive : {}) }} onClick={() => toggleTag(t)}>{t}</span>
                      ))}
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label style={s.lbl}>Note</label>
                      <textarea style={{ ...s.textarea, marginTop: '4px' }} value={note} onChange={e => setNote(e.target.value)} placeholder="Additional notes..." />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <>
              <div style={s.section}>
                <div style={s.sectionTitle}>Amount & currency conversion</div>
                <div style={s.toggleRow}>
                  <span style={s.toggleLabel}>Amount indexed in foreign currency?</span>
                  <label style={s.toggle}>
                    <input type="checkbox" checked={isIndexed} onChange={e => setIsIndexed(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ ...s.toggleSlider, background: isIndexed ? '#1D9E75' : '#ddd' }} />
                  </label>
                </div>
                <div style={{ ...s.infoBox, margin: '10px 0' }}>
                  {currency === 'USD' ? 'No conversion needed — amount is already in USD.' : `Rate fetched on transaction date (${txDate}).`}
                </div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Amount ({currency || '—'}) <span style={s.req}>*</span></label>
                    <input type="number" style={{ ...s.input, ...(fieldErr('amount') ? s.inputError : {}) }} value={amount}
                      onChange={e => { setAmount(e.target.value); touch('amount') }} onBlur={() => touch('amount')} placeholder="0.00" />
                    {fieldErr('amount') && <span style={s.errorMsg}>{fieldErr('amount')}</span>}
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Exchange rate {currency !== 'USD' && <span style={s.req}>*</span>}</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input type="number" style={{ ...s.input, flex: 1, ...(fieldErr('exRate') ? s.inputError : {}) }} value={exRate}
                        onChange={e => { setExRate(e.target.value); touch('exRate') }} onBlur={() => touch('exRate')}
                        placeholder={currency === 'USD' ? 'N/A' : 'Click Fetch'} />
                      {currency !== 'USD' && <button style={s.fetchBtn} onClick={fetchRate} disabled={fetchingRate}>{fetchingRate ? '...' : 'Fetch'}</button>}
                    </div>
                    {rateSource && <div style={{ fontSize: '11px', color: '#0F6E56', marginTop: '4px' }}>Source: {rateSource}</div>}
                    {fieldErr('exRate') && <span style={s.errorMsg}>{fieldErr('exRate')}</span>}
                  </div>
                </div>
                <div style={s.convRow}>
                  <div><div style={s.convLabel}>Original amount</div><div style={s.convVal}>{amount ? `${parseFloat(amount).toLocaleString()} ${currency}` : '—'}</div></div>
                  <div style={{ fontSize: '20px', color: '#aaa', alignSelf: 'flex-end', paddingBottom: '4px' }}>→</div>
                  <div><div style={s.convLabel}>USD equivalent</div><div style={{ ...s.convVal, color: '#1D9E75' }}>${usdAmount > 0 ? usdAmount.toFixed(2) : '0.00'}</div></div>
                </div>
              </div>

              <div style={s.section}>
                <div style={s.sectionTitle}>Review</div>
                {isValid ? (
                  <div style={{ ...s.infoBox, marginBottom: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span>✅</span>
                    <div>
                      <div style={{ fontWeight: '500', marginBottom: '2px' }}>All fields valid — ready to post</div>
                      <div style={{ fontSize: '11px', opacity: 0.85 }}>{txType === 'direct' ? 'This transaction will impact P&L directly.' : `This transaction closes ${linkedInvoices.length} invoice(s). No P&L impact.`}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ ...s.validationBanner, marginBottom: '14px', position: 'relative' }}>
                    <span>⚠️</span>
                    <div>
                      <div style={{ fontWeight: '500', fontSize: '12px' }}>{totalErrors} required field{totalErrors > 1 ? 's' : ''} missing</div>
                      <div style={{ fontSize: '11px', marginTop: '2px' }}>{Object.values(errors).join(' · ')}</div>
                    </div>
                  </div>
                )}
                {[
                  { title: 'Transaction info', rows: [
                    ['Company', companies.find(c => c.id === companyId)?.name || '—'],
                    ['Bank', banks.find(b => b.id === bankId)?.name || '—'],
                    ['Partner', showNewPartner ? newPartnerName : (partners.find(p => p.id === partnerId)?.name || partnerSearch || '—')],
                    ['Date', txDate],
                    ['Type', txType === 'invoice_payment' ? 'Invoice payment' : `Direct (${directSubtype})`],
                  ]},
                  ...(txType === 'invoice_payment' && linkedInvoices.length > 0 ? [{ title: 'Linked invoices', rows: linkedInvoices.map(l => [`${l.partner_name} (${l.invoice_number})`, `$${l.allocated_usd.toFixed(2)} allocated`]) }] : []),
                  ...(txType === 'direct' ? [{ title: 'P&L classification', rows: [
                    ['P&L Category', plCatName || '—'],
                    ['P&L Sub-category', plSubName || '—'],
                    ['Department', deptName || '—'],
                    ['Dept. Sub-category', deptSubName || '—'],
                    ['Description', expDesc || revStream || '—'],
                    ['Rev. stream alloc.', revAllocLabel()],
                  ]}] : []),
                  { title: 'Amounts', rows: [
                    ['Original amount', amount ? `${parseFloat(amount).toLocaleString()} ${currency}` : '—'],
                    ['Exchange rate', exRate ? `${parseFloat(exRate).toFixed(4)} (${rateSource || 'Manual'})` : 'N/A'],
                    ['USD equivalent', `$${usdAmount.toFixed(2)}`],
                  ]},
                ].map(sec => (
                  <div key={sec.title} style={s.reviewSection}>
                    <div style={s.reviewTitle}>{sec.title}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' }}>
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

        <div style={s.footer}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>Step {step} of 3</span>
            {totalErrors > 0 && Object.keys(touched).length > 0 && (
              <span style={{ fontSize: '11px', color: '#A32D2D', background: '#FCEBEB', padding: '2px 8px', borderRadius: '20px' }}>
                {totalErrors} field{totalErrors > 1 ? 's' : ''} missing
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 1 && <button style={s.btnGhost} onClick={() => setStep(step - 1)}>Back</button>}
            {step < 3 && <button style={s.btnPrimary} onClick={() => { touchStep(step); setStep(step + 1) }}>Continue</button>}
            {step === 3 && <button style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handlePost} disabled={saving}>{saving ? 'Saving...' : transaction ? 'Update transaction' : 'Post transaction'}</button>}
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
  plBadge: { fontSize: '10px', fontWeight: '500', padding: '3px 8px', borderRadius: '20px', background: 'rgba(29,158,117,0.2)', color: '#5DCAA5', border: '0.5px solid rgba(29,158,117,0.3)' },
  cashBadge: { fontSize: '10px', fontWeight: '500', padding: '3px 8px', borderRadius: '20px', background: 'rgba(12,68,124,0.2)', color: '#7FB8EE', border: '0.5px solid rgba(12,68,124,0.3)' },
  stepsBar: { display: 'flex', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '0.5px solid #e5e5e5', gap: 0, overflowX: 'auto' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', whiteSpace: 'nowrap' as const },
  stepNum: { width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '500', background: '#f0f0ee', color: '#888', border: '0.5px solid #e5e5e5', flexShrink: 0 },
  stepActive: { background: '#1D9E75', color: '#fff', borderColor: '#1D9E75' },
  stepDone: { background: '#E1F5EE', color: '#085041', borderColor: '#1D9E75' },
  stepError: { background: '#FCEBEB', color: '#A32D2D', borderColor: '#E24B4A' },
  stepLabel: { fontSize: '12px', color: '#888' },
  stepDiv: { width: '20px', height: '0.5px', background: '#e5e5e5', flexShrink: 0 },
  validationBanner: { display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#FCEBEB', borderBottom: '0.5px solid #F5A9A9', padding: '10px 1.5rem', color: '#A32D2D' },
  bannerClose: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#A32D2D', padding: '0', lineHeight: 1 },
  body: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '1rem 1.5rem', borderTop: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f5f5f3' },
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid #e5e5e5' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '4px', position: 'relative' as const },
  lbl: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  req: { color: '#E24B4A' },
  select: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  input: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  inputError: { border: '1.5px solid #E24B4A', background: '#FFF8F8' },
  errorMsg: { fontSize: '11px', color: '#E24B4A', marginTop: '2px' },
  textarea: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none', resize: 'vertical' as const, minHeight: '60px' },
  dropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginTop: '2px' },
  dropdownItem: { padding: '8px 12px', fontSize: '13px', color: '#111', cursor: 'pointer', borderBottom: '0.5px solid #f0f0ee' },
  linkBtn: { background: 'none', border: 'none', color: '#1D9E75', fontSize: '12px', cursor: 'pointer', padding: '4px 0', fontFamily: 'system-ui,sans-serif' },
  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  typeCard: { border: '0.5px solid #e5e5e5', borderRadius: '10px', padding: '16px', background: '#f5f5f3', cursor: 'pointer', textAlign: 'center' as const },
  typeCardPayment: { border: '2px solid #0C447C', background: '#E6F1FB' },
  typeCardDirect: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  typeCardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '4px' },
  typeCardSub: { fontSize: '11px', color: '#888', lineHeight: '1.4' },
  typeChip: { flex: 1, padding: '9px 12px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#f5f5f3', fontSize: '13px', cursor: 'pointer', textAlign: 'center' as const, fontWeight: '500', color: '#888' },
  typeChipExpense: { border: '2px solid #E24B4A', background: '#FCEBEB', color: '#A32D2D' },
  typeChipRevenue: { border: '2px solid #1D9E75', background: '#E1F5EE', color: '#085041' },
  infoBox: { background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#085041' },
  invoiceList: { display: 'flex', flexDirection: 'column' as const, gap: '6px', maxHeight: '240px', overflowY: 'auto' as const },
  invoiceRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff' },
  invoiceRowLinked: { border: '1.5px solid #1D9E75', background: '#f0fdf8' },
  invNumBadge: { fontSize: '11px', color: '#888', background: '#f0f0ee', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace' },
  statusBadge: { fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px' },
  addBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 12px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  removeBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 12px', border: '0.5px solid #E24B4A', borderRadius: '6px', background: 'transparent', color: '#A32D2D', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  allocRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#f5f5f3', borderRadius: '8px', marginBottom: '6px' },
  allocSummaryBox: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '10px 14px', marginTop: '8px' },
  allocSummaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666', padding: '3px 0', borderBottom: '0.5px solid #f5f5f3' },
  allocGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' },
  allocBtn: { border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 6px', background: '#f5f5f3', cursor: 'pointer', textAlign: 'center' as const },
  allocBtnActive: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  allocBtnLabel: { fontSize: '11px', fontWeight: '500', color: '#111' },
  allocBtnSub: { fontSize: '10px', color: '#888', marginTop: '2px' },
  tagRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '6px' },
  tag: { fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: '0.5px solid #e5e5e5', background: '#f5f5f3', color: '#666', cursor: 'pointer' },
  tagActive: { background: '#E1F5EE', borderColor: '#1D9E75', color: '#085041' },
  toggleRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#f5f5f3', borderRadius: '8px', border: '0.5px solid #e5e5e5', marginBottom: '8px' },
  toggleLabel: { fontSize: '13px', color: '#111', flex: 1 },
  toggle: { position: 'relative' as const, width: '36px', height: '20px', cursor: 'pointer', flexShrink: 0 },
  toggleSlider: { position: 'absolute' as const, inset: 0, borderRadius: '10px', transition: 'background 0.2s', display: 'block' },
  fetchBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#f5f5f3', color: '#666', cursor: 'pointer' },
  convRow: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center', marginTop: '12px', padding: '12px', background: '#f5f5f3', borderRadius: '8px' },
  convLabel: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  convVal: { fontSize: '16px', fontWeight: '500', color: '#111' },
  reviewSection: { background: '#f5f5f3', borderRadius: '8px', padding: '12px', marginBottom: '10px' },
  reviewTitle: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '8px' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}