import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getRate, convertToUSD } from '../services/currencyService'

interface Props {
  onClose: () => void
  invoice?: any
}

interface ValidationErrors { [key: string]: string }

export default function InvoiceDialog({ onClose, invoice }: Props) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showValidationSummary, setShowValidationSummary] = useState(false)

  // Reference data
  const [companies, setCompanies] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [plCategories, setPlCategories] = useState<any[]>([])
  const [plSubcategories, setPlSubcategories] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [deptSubcategories, setDeptSubcategories] = useState<any[]>([])
  const [expenseDescriptions, setExpenseDescriptions] = useState<any[]>([])

  // Direct transactions for linking (Step 1)
  const [directTransactions, setDirectTransactions] = useState<any[]>([])
  const [linkedTxId, setLinkedTxId] = useState('')
  const [reconcileSearch, setReconcileSearch] = useState('')
  const [plImpact, setPlImpact] = useState(true)

  // Partner accounts
  const [partnerAccounts, setPartnerAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')

  // Form state
  const [companyId, setCompanyId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [partnerSearch, setPartnerSearch] = useState('')
  const [newPartnerName, setNewPartnerName] = useState('')
  const [showNewPartner, setShowNewPartner] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [invType, setInvType] = useState<'expense' | 'revenue'>('expense')

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
  const [accNum, setAccNum] = useState('')
  const [model, setModel] = useState('')
  const [refNum, setRefNum] = useState('')
  const [currency, setCurrency] = useState('')
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

  const getPlSubs = (catId: string) => plSubcategories.filter(s => s.category_id === catId)
  const getDeptSubs = (dId: string) => deptSubcategories.filter(s => s.department_id === dId)
  const getExpDescs = (subId: string) => expenseDescriptions.filter(e => e.dept_subcategory_id === subId)

  const revenueStreams = ['Social Growth', 'Aimfox', 'Outsourced Services', 'VAT Claimed', 'Interest Received', 'Loans', 'Credit', 'Other']

  // ── Validation ────────────────────────────────────────
  const runValidation = () => {
    const e: ValidationErrors = {}
    if (!companyId) e.companyId = 'Company is required'
    if (!currency) e.currency = 'Currency is required'
    if (!invoiceDate) e.invoiceDate = 'Invoice date is required'
    if (!partnerId && !(showNewPartner && newPartnerName.trim())) e.partnerId = 'Partner is required'
    if (!amount || parseFloat(amount) <= 0) e.amount = 'Amount must be greater than 0'
    if (currency && currency !== 'USD' && (!exRate || parseFloat(exRate) <= 0)) e.exRate = 'Exchange rate is required'
    if (invType === 'expense' && plImpact && !linkedTxId) {
      if (!plCatId) e.plCat = 'P&L Category is required'
      if (!deptId) e.dept = 'Department is required'
    }
    if (invType === 'revenue' && !revStream) e.revStream = 'Revenue stream is required'
    return e
  }

  useEffect(() => {
    setErrors(runValidation())
  }, [companyId, currency, invoiceDate, partnerId, newPartnerName, showNewPartner, invType, plCatId, deptId, revStream, amount, exRate, plImpact, linkedTxId]) // eslint-disable-line

  // ── Load reference data ───────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [
        { data: comp }, { data: part },
        { data: plCat }, { data: plSub },
        { data: dept }, { data: deptSub }, { data: expD },
      ] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('partners').select('*').order('name'),
        supabase.from('pl_categories').select('id,name,type,sort_order').order('sort_order'),
        supabase.from('pl_subcategories').select('id,name,category_id,sort_order').order('sort_order'),
        supabase.from('departments').select('id,name,sort_order').order('sort_order'),
        supabase.from('dept_subcategories').select('id,name,department_id,sort_order').order('sort_order'),
        supabase.from('expense_descriptions').select('id,name,dept_subcategory_id,sort_order').order('sort_order'),
      ])
      if (comp) setCompanies(comp)
      if (part) setPartners(part)
      if (plCat) setPlCategories(plCat)
      if (plSub) setPlSubcategories(plSub)
      if (dept) setDepartments(dept)
      if (deptSub) setDeptSubcategories(deptSub)
      if (expD) setExpenseDescriptions(expD)
    }
    load()
  }, [])

  // ── Load direct transactions when company changes ─────
  useEffect(() => {
    if (!companyId) return
    const load = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, transaction_date, amount, amount_usd, currency, pl_category, pl_subcategory, department, dept_subcategory, expense_description, revenue_stream, exchange_rate, is_indexed, banks(id,name,currency), partners(id,name)')
        .eq('company_id', companyId)
        .eq('type', 'direct')
        .eq('status', 'posted')
        .order('transaction_date', { ascending: false })
        .limit(150)
      if (data) setDirectTransactions(data)
    }
    load()
  }, [companyId])

  // ── Load partner accounts when partner changes ────────
  useEffect(() => {
    if (!partnerId) { setPartnerAccounts([]); setSelectedAccountId(''); return }
    const load = async () => {
      const { data } = await supabase
        .from('partner_accounts')
        .select('*')
        .eq('partner_id', partnerId)
        .eq('currency', 'RSD')
        .order('is_primary', { ascending: false })
      if (data && data.length > 0) {
        setPartnerAccounts(data)
        const primary = data.find(a => a.is_primary) || data[0]
        setSelectedAccountId(primary.id)
        setAccNum(primary.account_number || '')
        setModel(primary.model || '')
        // Only set ref if not already set from invoice number
        if (!refNum) setRefNum(primary.reference_number || '')
      } else {
        // Fallback to partner.account_number
        const partner = partners.find(p => p.id === partnerId)
        if (partner?.account_number) setAccNum(partner.account_number)
        if (partner?.model) setModel(partner.model)
      }
    }
    load()
  }, [partnerId]) // eslint-disable-line

  // ── Auto-set refNum from invoiceNumber ────────────────
  useEffect(() => {
    if (invoiceNumber && !linkedTxId) setRefNum(invoiceNumber)
  }, [invoiceNumber]) // eslint-disable-line

  // ── When account is selected from dropdown ────────────
  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId)
    const acc = partnerAccounts.find(a => a.id === accountId)
    if (acc) {
      setAccNum(acc.account_number || '')
      setModel(acc.model || '')
    }
  }

  // ── Link to Direct transaction — auto-fill ALL fields ─
  const handleLinkTransaction = (tx: any) => {
    setLinkedTxId(tx.id)
    setPlImpact(false)

    // Auto-fill partner
    if (tx.partners) {
      setPartnerId(tx.partners.id || '')
      setPartnerSearch(tx.partners.name || '')
    }

    // Auto-fill P&L classification
    if (tx.pl_category) {
      const cat = plCategories.find(c => c.name === tx.pl_category)
      if (cat) { setPlCatId(cat.id); setPlCatName(cat.name) }
    }
    if (tx.pl_subcategory) {
      setPlSubName(tx.pl_subcategory)
      const sub = plSubcategories.find(s => s.name === tx.pl_subcategory)
      if (sub) setPlSubId(sub.id)
    }
    if (tx.department) {
      const dept = departments.find(d => d.name === tx.department)
      if (dept) { setDeptId(dept.id); setDeptName(dept.name) }
    }
    if (tx.dept_subcategory) {
      setDeptSubName(tx.dept_subcategory)
      const sub = deptSubcategories.find(s => s.name === tx.dept_subcategory)
      if (sub) setDeptSubId(sub.id)
    }
    if (tx.expense_description) setExpDesc(tx.expense_description)
    if (tx.revenue_stream) setRevStream(tx.revenue_stream)

    // Auto-fill amount & currency from transaction
    if (tx.amount) setAmount(tx.amount.toString())
    if (tx.currency) setCurrency(tx.currency)
    if (tx.exchange_rate) { setExRate(tx.exchange_rate.toString()); setRateSource('From transaction') }
    if (tx.is_indexed !== undefined) setIsIndexed(tx.is_indexed)

    // Auto-fill bank account based on which bank paid
    if (tx.banks) {
      // Use bank name to find company bank account for sender
      // For recipient (partner) — load from partner_accounts
    }

    // Auto-fill ref = invoice number
    if (invoiceNumber) setRefNum(invoiceNumber)
  }

  const handleUnlink = () => {
    setLinkedTxId('')
    setPlImpact(true)
    // Keep filled data — user may want to keep P&L classification
  }

  // ── Edit mode populate ────────────────────────────────
  useEffect(() => {
    if (!invoice) return
    setCompanyId(invoice.company_id || '')
    setPartnerId(invoice.partner_id || '')
    setPartnerSearch(invoice.partners?.name || '')
    setInvoiceNumber(invoice.invoice_number || '')
    setInvoiceDate(invoice.invoice_date || '')
    setDueDate(invoice.due_date || '')
    setInvType(invoice.type || 'expense')
    setPlCatName(invoice.pl_category || '')
    setPlSubName(invoice.pl_subcategory || '')
    setDeptName(invoice.department || '')
    setDeptSubName(invoice.dept_subcategory || '')
    setExpDesc(invoice.expense_description || '')
    setRevStream(invoice.revenue_stream || '')
    setRevAlloc(invoice.rev_alloc_type || 'sg100')
    setDeptSplit(invoice.dept_split_type || 'none')
    setNote(invoice.note || '')
    setTags(invoice.tags || [])
    setAccNum(invoice.account_number || '')
    setModel(invoice.model || '')
    setRefNum(invoice.reference_number || '')
    setCurrency(invoice.currency || '')
    setAmount(invoice.amount?.toString() || '')
    setExRate(invoice.exchange_rate?.toString() || '')
    setIsIndexed(invoice.is_indexed || false)
    setPlImpact(invoice.pl_impact !== false)
  }, [invoice])

  useEffect(() => {
    if (invoice && plCategories.length > 0) {
      const cat = plCategories.find(c => c.name === invoice.pl_category)
      if (cat) setPlCatId(cat.id)
    }
  }, [invoice, plCategories])

  useEffect(() => {
    if (invoice && plSubcategories.length > 0 && plCatId) {
      const sub = plSubcategories.find(s => s.name === invoice.pl_subcategory && s.category_id === plCatId)
      if (sub) setPlSubId(sub.id)
    }
  }, [invoice, plSubcategories, plCatId])

  useEffect(() => {
    if (invoice && departments.length > 0) {
      const dept = departments.find(d => d.name === invoice.department)
      if (dept) setDeptId(dept.id)
    }
  }, [invoice, departments])

  useEffect(() => {
    if (invoice && deptSubcategories.length > 0 && deptId) {
      const sub = deptSubcategories.find(s => s.name === invoice.dept_subcategory && s.department_id === deptId)
      if (sub) setDeptSubId(sub.id)
    }
  }, [invoice, deptSubcategories, deptId])

  const filteredPartners = partners.filter(p =>
    !partnerSearch || p.name.toLowerCase().includes(partnerSearch.toLowerCase())
  )

  const filteredDirectTx = directTransactions.filter(tx => {
    if (!reconcileSearch) return true
    const pn = tx.partners?.name || ''
    const cat = tx.pl_category || ''
    return pn.toLowerCase().includes(reconcileSearch.toLowerCase()) ||
      cat.toLowerCase().includes(reconcileSearch.toLowerCase()) ||
      (tx.transaction_date || '').includes(reconcileSearch)
  })

  const linkedTx = directTransactions.find(t => t.id === linkedTxId)

  const touch = (field: string) => setTouched(prev => ({ ...prev, [field]: true }))
  const fieldErr = (field: string) => touched[field] ? errors[field] : undefined
  const totalErrors = Object.keys(errors).length
  const isValid = totalErrors === 0

  const touchStep = (n: number) => {
    if (n === 1) setTouched(p => ({ ...p, companyId: true, currency: true, invoiceDate: true, partnerId: true }))
    if (n === 2) setTouched(p => ({ ...p, plCat: true, dept: true, revStream: true }))
    if (n === 3) setTouched(p => ({ ...p, amount: true, exRate: true }))
  }

  const stepHasError = (n: number) => {
    const stepFields: Record<number, string[]> = {
      1: ['companyId', 'currency', 'invoiceDate', 'partnerId'],
      2: ['plCat', 'dept', 'revStream'],
      3: ['amount', 'exRate'],
    }
    return (stepFields[n] || []).some(f => !!errors[f])
  }

  const fetchRate = async () => {
    if (!currency || currency === 'USD') { setExRate('1'); setRateSource('N/A'); return }
    setFetchingRate(true)
    try {
      const rateData = await getRate(currency, invoiceDate, isIndexed)
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

  const stepTitles = ['Basic information', 'Classification & P&L', 'Amount & currency', 'Review & post']

  // ── Post / Save ───────────────────────────────────────
  const handlePost = async () => {
    setTouched({ companyId: true, currency: true, invoiceDate: true, partnerId: true, plCat: true, dept: true, revStream: true, amount: true, exRate: true })
    const e = runValidation()
    if (Object.keys(e).length > 0) { setShowValidationSummary(true); return }
    setSaving(true)
    try {
      let finalPartnerId = partnerId
      if (showNewPartner && newPartnerName) {
        const { data: newP } = await supabase.from('partners').insert({ name: newPartnerName }).select().single()
        if (newP) finalPartnerId = newP.id
      }

      const effectivePlImpact = linkedTxId ? false : plImpact
      const effectiveStatus = linkedTxId ? 'paid' : 'unpaid'

      const payload = {
        company_id: companyId || null,
        partner_id: finalPartnerId || null,
        invoice_number: invoiceNumber || null,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        type: invType,
        pl_category: plCatName || null,
        pl_subcategory: plSubName || null,
        department: deptName || null,
        dept_subcategory: deptSubName || null,
        expense_description: expDesc || null,
        revenue_stream: invType === 'revenue' ? (revStream || null) : null,
        rev_alloc_type: revAlloc,
        dept_split_type: deptSplit,
        currency,
        amount: parseFloat(amount),
        exchange_rate: parseFloat(exRate) || null,
        amount_usd: usdAmount,
        is_indexed: isIndexed,
        account_number: accNum || null,
        model: model || null,
        reference_number: refNum || null,
        note: note || null,
        tags: tags.length > 0 ? tags : null,
        pl_impact: effectivePlImpact,
        status: effectiveStatus,
      }

      let invoiceId: string
      if (invoice?.id) {
        await supabase.from('invoices').update(payload).eq('id', invoice.id)
        invoiceId = invoice.id

        // Sync linked transaction P&L fields if changed
        if (linkedTxId && plCatName) {
          await supabase.from('transactions').update({
            pl_category: plCatName || null,
            pl_subcategory: plSubName || null,
            department: deptName || null,
            dept_subcategory: deptSubName || null,
            expense_description: expDesc || null,
            revenue_stream: revStream || null,
          }).eq('id', linkedTxId)
        }
      } else {
        const { data: newInv } = await supabase.from('invoices').insert(payload).select().single()
        invoiceId = newInv?.id

        // Sync linked transaction P&L fields on new invoice
        if (linkedTxId && plCatName) {
          await supabase.from('transactions').update({
            pl_category: plCatName || null,
            pl_subcategory: plSubName || null,
            department: deptName || null,
            dept_subcategory: deptSubName || null,
            expense_description: expDesc || null,
          }).eq('id', linkedTxId)
        }
      }

      // Create link record
      if (linkedTxId && invoiceId) {
        // Remove existing links first (upsert pattern)
        await supabase.from('invoice_transaction_links').delete().eq('invoice_id', invoiceId)
        await supabase.from('invoice_transaction_links').insert({
          invoice_id: invoiceId,
          transaction_id: linkedTxId,
          allocated_amount: parseFloat(amount),
          allocated_amount_usd: usdAmount,
          note: 'Reconciled — P&L already booked via Direct transaction',
        })
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
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '20px', color: '#111' }}>{invoice ? 'Invoice updated!' : 'Invoice posted!'}</div>
        <div style={{ fontSize: '13px', color: '#888' }}>
          {linkedTxId ? 'Reconciled — P&L synced with Direct transaction.' : 'Saved to P&L successfully.'}
        </div>
      </div>
    </div>
  )

  const expenseCategories = plCategories.filter(c => c.type !== 'revenue')
  const currentPlSubs = getPlSubs(plCatId)
  const currentDeptSubs = getDeptSubs(deptId)
  const currentExpDescs = getExpDescs(deptSubId)

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>{invoice ? 'Edit invoice' : 'New invoice'}</div>
            <div style={s.headerSub}>Step {step} of 4 — {stepTitles[step - 1]}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ ...s.invBadge, ...(linkedTxId ? { background: 'rgba(12,68,124,0.2)', color: '#7FB8EE', borderColor: 'rgba(12,68,124,0.3)' } : {}) }}>
              {linkedTxId ? '🔗 Reconciled' : 'P&L Impact'}
            </div>
            <span style={s.logoText}>Mintflow</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>

        {/* Steps bar */}
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
                {i < 3 && <div style={s.stepDiv} />}
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
              {/* 🔗 Link to Direct Transaction — TOP of step 1 */}
              {companyId && (
                <div style={{ ...s.reconcileBox, marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#0C447C' }}>🔗 Link to existing Direct transaction</div>
                      <div style={{ fontSize: '11px', color: '#7FB8EE', marginTop: '2px' }}>
                        Select a Direct tx to auto-fill all fields. Invoice will be marked paid with no duplicate P&L.
                      </div>
                    </div>
                    {linkedTxId && (
                      <button style={s.unlinkBtn} onClick={handleUnlink}>✕ Unlink</button>
                    )}
                  </div>

                  {linkedTx ? (
                    <div style={s.linkedTxCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>✅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#085041' }}>
                            {linkedTx.partners?.name || '—'}
                          </div>
                          <div style={{ fontSize: '11px', color: '#1D9E75' }}>
                            {linkedTx.transaction_date} · {linkedTx.pl_category || '—'} · {linkedTx.banks?.name || '—'} · ${(linkedTx.amount_usd || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div style={{ ...s.infoBox, marginTop: '10px', background: '#E6F1FB', borderColor: '#7FB8EE', color: '#0C447C', fontSize: '11px' }}>
                        ℹ️ Fields auto-filled from transaction. You can still edit them below. P&L will be synced on post.
                      </div>
                    </div>
                  ) : (
                    <>
                      <input style={{ ...s.input, marginBottom: '8px', width: '100%', boxSizing: 'border-box' as const }}
                        value={reconcileSearch} onChange={e => setReconcileSearch(e.target.value)}
                        placeholder="Search by partner, category or date..." />
                      {directTransactions.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#aaa', padding: '8px', textAlign: 'center' as const }}>
                          No Direct transactions for this company yet.
                        </div>
                      ) : (
                        <div style={s.txList}>
                          {filteredDirectTx.slice(0, 8).map(tx => (
                            <div key={tx.id} style={s.txRow} onClick={() => handleLinkTransaction(tx)}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '500', color: '#111' }}>{tx.partners?.name || '—'}</div>
                                <div style={{ fontSize: '11px', color: '#888' }}>
                                  {tx.transaction_date} · {tx.pl_category || '—'} · {tx.banks?.name || '—'}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: '500', color: '#A32D2D' }}>
                                  {(tx.amount || 0).toLocaleString('sr-RS')} {tx.currency}
                                </div>
                                <div style={{ fontSize: '11px', color: '#888' }}>${(tx.amount_usd || 0).toFixed(2)}</div>
                              </div>
                            </div>
                          ))}
                          {filteredDirectTx.length === 0 && reconcileSearch && (
                            <div style={{ fontSize: '12px', color: '#aaa', padding: '8px', textAlign: 'center' as const }}>
                              No results for "{reconcileSearch}"
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div style={s.section}>
                <div style={s.sectionTitle}>Company & invoice info</div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Company <span style={s.req}>*</span></label>
                    <select style={{ ...s.select, ...(fieldErr('companyId') ? s.inputError : {}) }} value={companyId}
                      onChange={e => { setCompanyId(e.target.value); setCurrency(''); setLinkedTxId(''); touch('companyId') }}
                      onBlur={() => touch('companyId')}>
                      <option value="">Select company...</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {fieldErr('companyId') && <span style={s.errorMsg}>{fieldErr('companyId')}</span>}
                  </div>
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
                </div>
                <div style={s.row3}>
                  <div style={s.field}>
                    <label style={s.lbl}>Invoice number</label>
                    <input style={s.input} value={invoiceNumber}
                      onChange={e => { setInvoiceNumber(e.target.value); setRefNum(e.target.value) }}
                      placeholder="e.g. INV-001/2026" />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Invoice date <span style={s.req}>*</span></label>
                    <input type="date" style={{ ...s.input, ...(fieldErr('invoiceDate') ? s.inputError : {}) }} value={invoiceDate}
                      onChange={e => { setInvoiceDate(e.target.value); touch('invoiceDate') }} onBlur={() => touch('invoiceDate')} />
                    {fieldErr('invoiceDate') && <span style={s.errorMsg}>{fieldErr('invoiceDate')}</span>}
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Due date</label>
                    <input type="date" style={s.input} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                </div>
              </div>

              <div style={s.section}>
                <div style={s.sectionTitle}>Partner & type</div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Partner <span style={s.req}>*</span></label>
                    {!showNewPartner ? (
                      <>
                        <input style={{ ...s.input, ...(fieldErr('partnerId') ? s.inputError : {}) }} value={partnerSearch}
                          onChange={e => { setPartnerSearch(e.target.value); setPartnerId(''); touch('partnerId') }}
                          onBlur={() => touch('partnerId')} placeholder="Search partner..." />
                        {partnerSearch && !partnerId && (
                          <div style={s.dropdown}>
                            {filteredPartners.slice(0, 8).map(p => (
                              <div key={p.id} style={s.dropdownItem}
                                onClick={() => { setPartnerId(p.id); setPartnerSearch(p.name) }}>
                                <div>{p.name}</div>
                                {p.account_number && <div style={{ fontSize: '11px', color: '#aaa' }}>{p.account_number}</div>}
                              </div>
                            ))}
                            <div style={{ ...s.dropdownItem, color: '#1D9E75' }}
                              onClick={() => { setShowNewPartner(true); setPartnerSearch('') }}>
                              + Add new partner
                            </div>
                          </div>
                        )}
                        {fieldErr('partnerId') && <span style={s.errorMsg}>{fieldErr('partnerId')}</span>}
                      </>
                    ) : (
                      <>
                        <input style={s.input} value={newPartnerName} onChange={e => setNewPartnerName(e.target.value)} placeholder="Enter partner name..." />
                        <button style={s.linkBtn} onClick={() => setShowNewPartner(false)}>← Back to search</button>
                      </>
                    )}
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Invoice type <span style={s.req}>*</span></label>
                    <div style={s.typeRow}>
                      <div style={{ ...s.typeChip, ...(invType === 'expense' ? s.typeChipExpense : {}) }} onClick={() => setInvType('expense')}>📤 Expense</div>
                      <div style={{ ...s.typeChip, ...(invType === 'revenue' ? s.typeChipRevenue : {}) }} onClick={() => setInvType('revenue')}>📥 Revenue</div>
                    </div>
                  </div>
                </div>

                {/* Payment details — always visible, auto-filled */}
                <div style={s.sectionTitle} >Payment details</div>
                <div style={s.row3}>
                  <div style={s.field}>
                    <label style={s.lbl}>Account number (RSD)</label>
                    {partnerAccounts.length > 1 ? (
                      <select style={s.select} value={selectedAccountId} onChange={e => handleAccountSelect(e.target.value)}>
                        {partnerAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.account_number}{acc.bank_name ? ` — ${acc.bank_name}` : ''}{acc.is_primary ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input style={s.input} value={accNum} onChange={e => setAccNum(e.target.value)}
                        placeholder="Partner bank account" />
                    )}
                    {partnerAccounts.length > 0 && (
                      <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '2px' }}>
                        {partnerAccounts.length} račun{partnerAccounts.length > 1 ? 'a' : ''} pronađeno
                      </div>
                    )}
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Model</label>
                    <input style={s.input} value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. 97" />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Poziv na broj</label>
                    <input style={s.input} value={refNum} onChange={e => setRefNum(e.target.value)}
                      placeholder="Auto = broj fakture" />
                    {invoiceNumber && refNum === invoiceNumber && (
                      <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '2px' }}>Auto iz broja fakture</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              {linkedTxId && (
                <div style={{ ...s.infoBox, marginBottom: '16px', background: '#E6F1FB', borderColor: '#7FB8EE', color: '#0C447C' }}>
                  🔗 Linked to Direct transaction — P&L fields auto-filled. You can edit them and changes will sync to the transaction on post.
                </div>
              )}
              {invType === 'expense' && (
                <>
                  <div style={s.section}>
                    <div style={s.sectionTitle}>P&L classification</div>
                    <div style={s.row2}>
                      <div style={s.field}>
                        <label style={s.lbl}>P&L Category {!linkedTxId && <span style={s.req}>*</span>}</label>
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
                        <label style={s.lbl}>Department {!linkedTxId && <span style={s.req}>*</span>}</label>
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
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Revenue stream allocation</div>
                    <div style={s.allocGrid}>
                      {[{ id: 'sg100', label: '100% Social Growth', sub: 'Full allocation' }, { id: 'af100', label: '100% Aimfox', sub: 'Full allocation' }, { id: 'shared', label: 'Shared 50/50', sub: 'Both streams' }, { id: 'byval', label: 'By value', sub: 'Custom split' }].map(a => (
                        <div key={a.id} style={{ ...s.allocBtn, ...(revAlloc === a.id ? s.allocBtnActive : {}) }} onClick={() => setRevAlloc(a.id)}>
                          <div style={s.allocLabel}>{a.label}</div>
                          <div style={s.allocSub}>{a.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {invType === 'revenue' && (
                <div style={s.section}>
                  <div style={s.sectionTitle}>Revenue details</div>
                  <div style={s.field}>
                    <label style={s.lbl}>Revenue stream <span style={s.req}>*</span></label>
                    <select style={{ ...s.select, ...(fieldErr('revStream') ? s.inputError : {}) }} value={revStream}
                      onChange={e => { setRevStream(e.target.value); touch('revStream') }} onBlur={() => touch('revStream')}>
                      <option value="">Select stream...</option>
                      {revenueStreams.map(r => <option key={r}>{r}</option>)}
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
                <div style={{ marginTop: '12px' }}>
                  <label style={s.lbl}>Note</label>
                  <textarea style={s.textarea} value={note} onChange={e => setNote(e.target.value)} placeholder="Additional notes..." />
                </div>
              </div>
            </>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Amount & currency conversion</div>
              <div style={s.toggleRow}>
                <span style={s.toggleLabel}>Amount indexed in foreign currency?</span>
                <label style={s.toggle}>
                  <input type="checkbox" checked={isIndexed} onChange={e => setIsIndexed(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ ...s.toggleSlider, background: isIndexed ? '#1D9E75' : '#ddd' }} />
                </label>
              </div>
              {linkedTxId && (
                <div style={{ ...s.infoBox, marginBottom: '10px', background: '#E6F1FB', borderColor: '#7FB8EE', color: '#0C447C', fontSize: '11px' }}>
                  🔗 Amount auto-filled from Direct transaction. Edit if invoice amount differs.
                </div>
              )}
              <div style={{ ...s.infoBox, margin: '10px 0' }}>
                {currency === 'USD' ? 'No conversion needed — amount is already in USD.' : 'Rate fetched on invoice date.'}
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
                <div><div style={s.convLabel}>Invoice amount</div><div style={s.convVal}>{amount ? `${parseFloat(amount).toLocaleString('sr-RS')} ${currency}` : '—'}</div></div>
                <div style={{ fontSize: '20px', color: '#aaa', alignSelf: 'flex-end', paddingBottom: '4px' }}>→</div>
                <div><div style={s.convLabel}>USD equivalent</div><div style={{ ...s.convVal, color: '#1D9E75' }}>${usdAmount > 0 ? usdAmount.toFixed(2) : '0.00'}</div></div>
              </div>
              {dueDate && <div style={{ ...s.infoBox, marginTop: '12px', background: '#FAEEDA', borderColor: '#E5B96A', color: '#633806' }}>📅 Due date: <strong>{dueDate}</strong></div>}
            </div>
          )}

          {/* ── STEP 4 ── */}
          {step === 4 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Review before posting</div>

              {isValid ? (
                <div style={{ ...s.infoBox, marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span>✅</span>
                  <div>
                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>All fields valid — ready to post</div>
                    <div style={{ fontSize: '11px', opacity: 0.85 }}>
                      {linkedTxId
                        ? 'Invoice will be reconciled. P&L fields synced to Direct transaction.'
                        : `Invoice will impact P&L on date ${invoiceDate}.`}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ ...s.validationBanner, marginBottom: '16px', position: 'relative' }}>
                  <span>⚠️</span>
                  <div>
                    <div style={{ fontWeight: '500', fontSize: '12px' }}>{totalErrors} required field{totalErrors > 1 ? 's' : ''} missing</div>
                    <div style={{ fontSize: '11px', marginTop: '2px' }}>{Object.values(errors).join(' · ')}</div>
                  </div>
                </div>
              )}

              {[
                {
                  title: 'Invoice info', rows: [
                    ['Company', companies.find(c => c.id === companyId)?.name || '—'],
                    ['Partner', showNewPartner ? newPartnerName : (partners.find(p => p.id === partnerId)?.name || partnerSearch || '—')],
                    ['Invoice number', invoiceNumber || '—'],
                    ['Invoice date', invoiceDate || '—'],
                    ['Due date', dueDate || '—'],
                    ['Type', invType],
                    ['P&L Impact', linkedTxId ? '❌ None — reconciled with Direct tx' : '✅ Yes'],
                    ['Account number', accNum || '—'],
                    ['Model / Poziv', model ? `${model} / ${refNum}` : refNum || '—'],
                  ]
                },
                {
                  title: 'P&L classification', rows: [
                    ['P&L Category', plCatName || '—'],
                    ['P&L Sub-category', plSubName || '—'],
                    ['Department', deptName || '—'],
                    ['Dept. sub-category', deptSubName || '—'],
                    ['Expense description', expDesc || '—'],
                    ['Revenue stream', revStream || '—'],
                  ]
                },
                {
                  title: 'Amounts', rows: [
                    ['Original amount', amount ? `${parseFloat(amount).toLocaleString('sr-RS')} ${currency}` : '—'],
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
          )}
        </div>

        <div style={s.footer}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>Step {step} of 4</span>
            {totalErrors > 0 && touched.companyId && (
              <span style={{ fontSize: '11px', color: '#A32D2D', background: '#FCEBEB', padding: '2px 8px', borderRadius: '20px' }}>
                {totalErrors} field{totalErrors > 1 ? 's' : ''} missing
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 1 && <button style={s.btnGhost} onClick={() => setStep(step - 1)}>Back</button>}
            {step < 4 && <button style={s.btnPrimary} onClick={() => { touchStep(step); setStep(step + 1) }}>Continue</button>}
            {step === 4 && <button style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handlePost} disabled={saving}>{saving ? 'Saving...' : invoice ? 'Update invoice' : 'Post invoice'}</button>}
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
  invBadge: { fontSize: '10px', fontWeight: '500', padding: '3px 8px', borderRadius: '20px', background: 'rgba(29,158,117,0.2)', color: '#5DCAA5', border: '0.5px solid rgba(29,158,117,0.3)' },
  stepsBar: { display: 'flex', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '0.5px solid #e5e5e5', gap: 0, overflowX: 'auto' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', whiteSpace: 'nowrap' },
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
  dropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginTop: '2px', maxHeight: '200px', overflowY: 'auto' as const },
  dropdownItem: { padding: '8px 12px', fontSize: '13px', color: '#111', cursor: 'pointer', borderBottom: '0.5px solid #f0f0ee' },
  linkBtn: { background: 'none', border: 'none', color: '#1D9E75', fontSize: '12px', cursor: 'pointer', padding: '4px 0', fontFamily: 'system-ui,sans-serif' },
  typeRow: { display: 'flex', gap: '8px' },
  typeChip: { flex: 1, padding: '9px 12px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#f5f5f3', fontSize: '13px', cursor: 'pointer', textAlign: 'center' as const, fontWeight: '500', color: '#888' },
  typeChipExpense: { border: '2px solid #E24B4A', background: '#FCEBEB', color: '#A32D2D' },
  typeChipRevenue: { border: '2px solid #1D9E75', background: '#E1F5EE', color: '#085041' },
  infoBox: { background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#085041' },
  allocGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' },
  allocBtn: { border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 6px', background: '#f5f5f3', cursor: 'pointer', textAlign: 'center' as const },
  allocBtnActive: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  allocLabel: { fontSize: '11px', fontWeight: '500', color: '#111' },
  allocSub: { fontSize: '10px', color: '#888', marginTop: '2px' },
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
  reconcileBox: { background: '#E6F1FB', border: '0.5px solid #7FB8EE', borderRadius: '10px', padding: '14px 16px' },
  linkedTxCard: { background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '8px', padding: '10px 12px' },
  unlinkBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '4px 10px', border: '0.5px solid #E24B4A', borderRadius: '6px', background: 'transparent', color: '#A32D2D', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  txList: { display: 'flex', flexDirection: 'column' as const, gap: '4px', maxHeight: '220px', overflowY: 'auto' as const },
  txRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', cursor: 'pointer' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}