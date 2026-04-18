import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getRate, convertToUSD } from '../services/currencyService'

interface Props {
  onClose: () => void
  transaction?: any
}

const plSubs: Record<string, string[]> = {
  'Employee and Labour': ['Net Salaries','Tax on salary','Contributions on behalf of the employee','Contributions on behalf of the employer','Transportation cost','Salary Expenses Abroad','Private Health insurance','Health care expenses paid by employer','Warm Meal expenses','FitPass expenses','Employee participation in benefits','Renumeration, allowances and other benefits','Education and training of employees'],
  'Professional and Production Services': ['Legal outsourced services','Domestic marketing expenses (product oriented)','Marketing expenses from abroad (product oriented)','Affiliates Payment','Linkbuilding and other SEO expenses','Marketing outsourced services','Dev&Product&Design Outsourced services','Customer support services (outsourced)','Subscriptions and licences fees','Cost of databases for sales and production services','Share profit expenses','Other'],
  'Banking and Finance': ['Bank Fees (domestic)','Bank Fees (abroad)','Interest Paid','PayPal Payment & Payout Fees','Stripe Payout Fees','Insurance','Loan Fees','Other banking, finance and currency differences'],
  'General Business': ['Rent and Mortgage of business premises','Rent of garage spaces','Office Maintenance and Repairs','Office Supplies','Non production professional services','Utilities','Telecommunication','Advertising, Marketing and Promotions','Domain, Website, Web hosting, cloud server','Financial Leasing','Office cleaning expenses','Subscriptions and licences fees','Penalty, fines and other forced fees','Postage and Shipping','Capital expenditures','Travel expenses','Job ads and hiring','Meals and Entertainment','Safety and protection expenses','Registration fees and taxes','Magazines and books','Donation, sponsorships, gifts','US Setup Fees',"Shareholder's Private & Business expenses",'Other general business expenses'],
  'Vehicle Expense': ['Fuel and gas expenses','Vehicle Maintenance and Repairs','Vehicle registration','Vehicle Insurance','Other vehicle expenses'],
  'Taxes': ['VAT tax expenses','City and ecological taxes','Expenses for Financing Disability Funds','Corporate income tax','Other taxes'],
}

const deptSubs: Record<string, string[]> = {
  'Marketing Expenses': ['SaaS expenses','Paid Advertising','Outsourcing expenses','Affiliates expenses','Salary expenses abroad','Salary expenses domestic'],
  'Development Expenses': ['SaaS expenses','Outsourcing services and Associates','Salary expenses abroad'],
  'Product Expenses': ['SaaS expenses','Outsourcing services and Associates','Salary expenses abroad','Salary expenses domestic'],
  'Design Expenses': ['SaaS expenses','Outsourcing services and Associates','Salary expenses abroad','Salary expenses domestic'],
  'Sales Expenses': ['SaaS expenses','Salary expenses domestic','Salary expenses abroad'],
  'CS Expenses': ['SaaS expenses','Outsourcing services','Salary expenses domestic'],
  'Office & Administration': ['SaaS expenses','Salary expenses domestic','Salary expenses abroad'],
  'Shareholder Expenses': ['Private & Business expenses','Salary expenses domestic','Salary expenses abroad'],
  'General Business Expenses': ['General expenses','SaaS expenses','Labour related expenses','Banking and Finance','Vehicle expenses','Taxes','Professional and production services','Setup Fees'],
  'Loans / Credit / Dividends': ['Loans','Credit','Dividends'],
}

const expDescs: Record<string, string[]> = {
  'SaaS expenses': ['Brevo','Klaviyo','Ahrefs','Figma','Canva','Adobe Creative cloud','Sentry','OpenAI','Amazon Web Services','GitHub','Cursor','Chargebee','Linear','Followiz','Intercom','Churnkey','Zapmail','Close CRM','Calendly','Notion','Odoo','Office licence','Other SaaS'],
  'Paid Advertising': ['Google Ads','Microsoft Ads','Meta Ads','Twitter Ads','LinkedIn Ads','Reddit Ads'],
  'Outsourcing expenses': ['Content Creation Services','Fiverr','Upwork','Offpage SEO','Other outsourcing'],
  'Affiliates expenses': ['Kicksta','Flock','Upleap','Kenji','Nitreo','AimFox'],
  'Outsourcing services and Associates': ['MGP25 Cyberint Services','Legali Veikla','Account Rental','Ninja Flows','Other'],
  'Outsourcing services': ['Stuff Up Bro','Phantombuster','HeyReach'],
  'General expenses': ['Rent and Mortgage','Rent of garage spaces','Maintenance and Repairs','Office Supplies','Utilities','Telecommunication','Advertising and Promotions','Financial Leasing','Office cleaning','Travel expenses','Meals and Entertainment','Safety expenses','Registration fees','Donation and gifts','Domain and website registration','Web hosting and cloud'],
  'Labour related expenses': ['Transportation cost','Private Health insurance','Warm Meal expenses','FitPass expenses','Renumeration and allowances','Education and training'],
  'Banking and Finance': ['Bank Fees (domestic)','Bank Fees (abroad)','PayPal Fees','Stripe Fees','Interest Paid','Insurance','Loan Fees'],
  'Vehicle expenses': ['Fuel and gas expenses','Vehicle Maintenance','Vehicle registration','Vehicle Insurance','Other vehicle expenses'],
  'Taxes': ['VAT tax','City and ecological taxes','Financing Disability Funds','Corporate income tax','Other taxes'],
  'Professional and production services': ['Legal outsourced services','Share profit expenses','Other'],
  'Setup Fees': ['US Setup Fees'],
  'Private & Business expenses': ['Food & Beverage','Restaurants & Hotels','Entertainment','SaaS software','Avio Tickets','Amex expenses','Fuel Expenses','Other expenses'],
  'Loans': ['Loan from shareholders','Bank credit','Loans from third parties'],
  'Credit': ['Bank credit line','Credit facility'],
  'Dividends': ['Dividends paid to shareholders'],
  'Salary expenses abroad': ['Tamar Zarandi','Sopo Tobagri','Nikola Grabovica','Yassien','Other salary abroad'],
  'Salary expenses domestic': ['Net Salary & Contributions','Other domestic salary'],
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
  allocated_usd: number // how much this tx allocates to this invoice
}

export default function TransactionDialog({ onClose, transaction }: Props) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const [companies, setCompanies] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [allBanks, setAllBanks] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [openInvoices, setOpenInvoices] = useState<any[]>([])

  // Step 1 — basic
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
  const [showBankFields, setShowBankFields] = useState(false)
  const [accNum, setAccNum] = useState('')
  const [model, setModel] = useState('')
  const [refNum, setRefNum] = useState('')

  // Step 2 — type & classification
  const [txType, setTxType] = useState<'invoice_payment' | 'direct'>('invoice_payment')
  const [directSubtype, setDirectSubtype] = useState<'expense' | 'revenue'>('expense')

  // Invoice payment — linked invoices
  const [linkedInvoices, setLinkedInvoices] = useState<LinkedInvoice[]>([])
  const [invoiceSearch, setInvoiceSearch] = useState('')

  // Direct — P&L
  const [plCat, setPlCat] = useState('')
  const [plSub, setPlSub] = useState('')
  const [dept, setDept] = useState('')
  const [deptSub, setDeptSub] = useState('')
  const [expDesc, setExpDesc] = useState('')
  const [revStream, setRevStream] = useState('')
  const [revAlloc, setRevAlloc] = useState('sg100')
  const [deptSplit, setDeptSplit] = useState('none')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // Step 3 — amounts
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

  // Total allocated to invoices
  const totalAllocated = linkedInvoices.reduce((s, i) => s + (i.allocated_usd || 0), 0)
  const unallocated = usdAmount - totalAllocated

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
      if (!transaction) { setBankId(''); setCurrency('') }
    }
  }, [companyId, allBanks, transaction])

  // Load open invoices when company changes
  useEffect(() => {
    if (!companyId) return
    const fetchOpenInvoices = async () => {
      const { data } = await supabase
        .from('v_invoice_status')
        .select('*')
        .eq('company_id', companyId)
        .in('calculated_status', ['unpaid', 'partial', 'overpaid'])
        .order('due_date', { ascending: true })
      if (data) setOpenInvoices(data)
    }
    fetchOpenInvoices()
  }, [companyId])

  useEffect(() => {
    if (transaction) {
      setCompanyId(transaction.company_id || '')
      setCompanyName(transaction.companies?.name || '')
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
      setPlCat(transaction.pl_category || '')
      setPlSub(transaction.pl_subcategory || '')
      setDept(transaction.department || '')
      setDeptSub(transaction.dept_subcategory || '')
      setExpDesc(transaction.expense_description || '')
      setRevStream(transaction.revenue_stream || '')
      setRevAlloc(transaction.rev_alloc_type || 'sg100')
      setDeptSplit(transaction.dept_split_type || 'none')
      setTags(transaction.tags || [])
      setAccNum(transaction.account_number || '')
      setModel(transaction.model || '')
      setRefNum(transaction.reference_number || '')
    }
  }, [transaction])

  const filteredPartners = partners.filter(p =>
    !partnerSearch || p.name.toLowerCase().includes(partnerSearch.toLowerCase())
  )

  const filteredOpenInvoices = openInvoices.filter(inv => {
    if (!invoiceSearch) return true
    const partnerName = inv.partner_name || ''
    const invNum = inv.invoice_number || ''
    return (
      partnerName.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      invNum.toLowerCase().includes(invoiceSearch.toLowerCase())
    )
  })

  const isInvoiceLinked = (invId: string) => linkedInvoices.some(l => l.invoice_id === invId)

  const addInvoiceLink = (inv: any) => {
    if (isInvoiceLinked(inv.id)) return
    setLinkedInvoices(prev => [...prev, {
      invoice_id: inv.id,
      invoice_number: inv.invoice_number || '—',
      partner_name: inv.partner_name || '—',
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      currency: inv.currency,
      amount: inv.amount,
      amount_usd: inv.amount_usd,
      remaining_usd: inv.remaining_usd,
      allocated_usd: Math.min(inv.remaining_usd, usdAmount),
    }])
  }

  const removeInvoiceLink = (invId: string) => {
    setLinkedInvoices(prev => prev.filter(l => l.invoice_id !== invId))
  }

  const updateAllocated = (invId: string, val: number) => {
    setLinkedInvoices(prev => prev.map(l =>
      l.invoice_id === invId ? { ...l, allocated_usd: val } : l
    ))
  }

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

  const toggleTag = (t: string) => setTags(prev =>
    prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
  )

  const stepTitles = ['Basic information', 'Type & classification', 'Amount & review']

  const handlePost = async () => {
    setSaving(true)
    try {
      let finalPartnerId = partnerId
      if (showNewPartner && newPartnerName) {
        const { data: newP } = await supabase
          .from('partners').insert({ name: newPartnerName }).select().single()
        if (newP) finalPartnerId = newP.id
      }

      const isDirectWithPL = txType === 'direct'

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
        pl_category: isDirectWithPL ? (plCat || null) : null,
        pl_subcategory: isDirectWithPL ? (plSub || null) : null,
        department: isDirectWithPL ? (dept || null) : null,
        dept_subcategory: isDirectWithPL ? (deptSub || null) : null,
        expense_description: isDirectWithPL ? (expDesc || null) : null,
        revenue_stream: isDirectWithPL ? (revStream || null) : null,
        rev_alloc_type: revAlloc,
        dept_split_type: deptSplit,
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
        const { data: newTx } = await supabase
          .from('transactions').insert(payload).select().single()
        txId = newTx?.id
      }

      // Save invoice links for invoice_payment type
      if (txType === 'invoice_payment' && linkedInvoices.length > 0 && txId) {
        for (const link of linkedInvoices) {
          // Upsert link
          await supabase.from('invoice_transaction_links').upsert({
            invoice_id: link.invoice_id,
            transaction_id: txId,
            allocated_amount: link.allocated_usd,
            allocated_amount_usd: link.allocated_usd,
          }, { onConflict: 'invoice_id,transaction_id' })

          // Update invoice status based on v_invoice_status calculated_status
          // The view handles this automatically, but we refresh status field too
          const { data: invStatus } = await supabase
            .from('v_invoice_status')
            .select('calculated_status')
            .eq('id', link.invoice_id)
            .single()

          if (invStatus) {
            await supabase
              .from('invoices')
              .update({ status: invStatus.calculated_status })
              .eq('id', link.invoice_id)
          }
        }
      }

      setSuccess(true)
      setTimeout(() => { setSuccess(false); onClose() }, 1500)
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  if (success) return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', minHeight: '220px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '20px', color: '#111' }}>
          {transaction ? 'Transaction updated!' : 'Transaction posted!'}
        </div>
        <div style={{ fontSize: '13px', color: '#888' }}>
          {txType === 'invoice_payment'
            ? `${linkedInvoices.length} invoice(s) updated.`
            : 'Posted to P&L and cash flow.'}
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
            <div style={s.headerTitle}>{transaction ? 'Edit transaction' : 'New transaction'}</div>
            <div style={s.headerSub}>Step {step} of 3 — {stepTitles[step - 1]}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {txType === 'direct' && (
              <div style={s.plBadge}>P&L Impact</div>
            )}
            {txType === 'invoice_payment' && (
              <div style={s.cashBadge}>Cash Flow Only</div>
            )}
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
                <span style={{ ...s.stepLabel, ...(step === i + 1 ? { color: '#0F6E56', fontWeight: '500' } : {}) }}>{t}</span>
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
              <div style={s.section}>
                <div style={s.sectionTitle}>Bank & account</div>
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
              </div>

              <div style={s.section}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={s.sectionTitle}>Payment reference</div>
                  <button style={s.linkBtn} onClick={() => setShowBankFields(!showBankFields)}>
                    {showBankFields ? '− Hide' : '+ Show'}
                  </button>
                </div>
                {showBankFields ? (
                  <div style={s.row3}>
                    <div style={s.field}>
                      <label style={s.lbl}>Account number</label>
                      <input style={s.input} value={accNum} onChange={e => setAccNum(e.target.value)} placeholder="Partner account" />
                    </div>
                    <div style={s.field}>
                      <label style={s.lbl}>Model</label>
                      <input style={s.input} value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. 97" />
                    </div>
                    <div style={s.field}>
                      <label style={s.lbl}>Reference number</label>
                      <input style={s.input} value={refNum} onChange={e => setRefNum(e.target.value)} placeholder="Poziv na broj" />
                    </div>
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
              {/* Type selector */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Transaction type <span style={s.req}>*</span></div>
                <div style={s.typeGrid}>
                  <div
                    style={{ ...s.typeCard, ...(txType === 'invoice_payment' ? s.typeCardPayment : {}) }}
                    onClick={() => setTxType('invoice_payment')}
                  >
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>💳</div>
                    <div style={s.typeCardTitle}>Invoice payment</div>
                    <div style={s.typeCardSub}>Closes one or more open invoices. No new P&L impact.</div>
                  </div>
                  <div
                    style={{ ...s.typeCard, ...(txType === 'direct' ? s.typeCardDirect : {}) }}
                    onClick={() => setTxType('direct')}
                  >
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>⚡</div>
                    <div style={s.typeCardTitle}>Direct transaction</div>
                    <div style={s.typeCardSub}>No invoice exists or will exist. Impacts P&L directly.</div>
                  </div>
                </div>
              </div>

              {/* Invoice payment — link invoices */}
              {txType === 'invoice_payment' && (
                <div style={s.section}>
                  <div style={s.infoBox}>
                    This transaction will close the selected invoice(s). P&L was already booked when those invoices were posted.
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <label style={s.lbl}>Search open invoices</label>
                    <input
                      style={{ ...s.input, marginTop: '4px', marginBottom: '10px' }}
                      value={invoiceSearch}
                      onChange={e => setInvoiceSearch(e.target.value)}
                      placeholder="Search by partner or invoice number..."
                    />

                    {/* Open invoices list */}
                    {filteredOpenInvoices.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '13px', background: '#f5f5f3', borderRadius: '8px' }}>
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
                                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>
                                    {inv.partner_name || '—'}
                                  </span>
                                  {inv.invoice_number && (
                                    <span style={{ fontSize: '11px', color: '#888', background: '#f0f0ee', padding: '1px 6px', borderRadius: '4px' }}>
                                      {inv.invoice_number}
                                    </span>
                                  )}
                                  <span style={{ ...s.statusBadge, ...getStatusStyle(inv.calculated_status) }}>
                                    {inv.calculated_status}
                                  </span>
                                </div>
                                <div style={{ fontSize: '11px', color: '#888' }}>
                                  Invoice: {inv.invoice_date}
                                  {inv.due_date && ` · Due: ${inv.due_date}`}
                                  {' · '}
                                  <span style={{ color: inv.remaining_usd > 0 ? '#A32D2D' : '#1D9E75' }}>
                                    Remaining: ${(inv.remaining_usd || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: '500', color: '#111', whiteSpace: 'nowrap', marginRight: '10px' }}>
                                {(inv.amount || 0).toLocaleString()} {inv.currency}
                              </div>
                              {!linked ? (
                                <button style={s.addBtn} onClick={() => addInvoiceLink(inv)}>+ Add</button>
                              ) : (
                                <button style={s.removeBtn} onClick={() => removeInvoiceLink(inv.id)}>✕ Remove</button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Linked invoices with allocation */}
                    {linkedInvoices.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <div style={s.sectionTitle}>Allocation per invoice</div>
                        {linkedInvoices.map(link => (
                          <div key={link.invoice_id} style={s.allocRow}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{link.partner_name}</div>
                              <div style={{ fontSize: '11px', color: '#888' }}>
                                {link.invoice_number} · Remaining: ${link.remaining_usd.toFixed(2)}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '12px', color: '#888' }}>Allocate USD</span>
                              <input
                                type="number"
                                style={{ ...s.input, width: '110px', textAlign: 'right' }}
                                value={link.allocated_usd}
                                onChange={e => updateAllocated(link.invoice_id, parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </div>
                        ))}

                        {/* Summary */}
                        <div style={s.allocSummary}>
                          <div style={s.allocSummaryRow}>
                            <span>Transaction total</span>
                            <span style={{ fontWeight: '500' }}>${usdAmount.toFixed(2)}</span>
                          </div>
                          <div style={s.allocSummaryRow}>
                            <span>Total allocated</span>
                            <span style={{ fontWeight: '500', color: '#1D9E75' }}>${totalAllocated.toFixed(2)}</span>
                          </div>
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
                </div>
              )}

              {/* Direct transaction */}
              {txType === 'direct' && (
                <>
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Subtype</div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                      <div style={{ ...s.typeChip, ...(directSubtype === 'expense' ? s.typeChipExpense : {}) }}
                        onClick={() => setDirectSubtype('expense')}>📤 Expense</div>
                      <div style={{ ...s.typeChip, ...(directSubtype === 'revenue' ? s.typeChipRevenue : {}) }}
                        onClick={() => setDirectSubtype('revenue')}>📥 Revenue</div>
                    </div>
                    <div style={{ ...s.infoBox, marginTop: '8px', background: '#FFF3CD', borderColor: '#E5B96A', color: '#633806' }}>
                      ⚠️ Direct transactions impact P&L immediately. If an invoice arrives later, you can reconcile it and reclassify.
                    </div>
                  </div>

                  {directSubtype === 'expense' && (
                    <>
                      <div style={s.section}>
                        <div style={s.sectionTitle}>P&L classification</div>
                        <div style={s.row2}>
                          <div style={s.field}>
                            <label style={s.lbl}>P&L Category <span style={s.req}>*</span></label>
                            <select style={s.select} value={plCat} onChange={e => { setPlCat(e.target.value); setPlSub('') }}>
                              <option value="">Select P&L category...</option>
                              {Object.keys(plSubs).map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                          <div style={s.field}>
                            <label style={s.lbl}>P&L Sub-category</label>
                            <select style={s.select} value={plSub} onChange={e => setPlSub(e.target.value)}>
                              <option value="">Select sub-category...</option>
                              {(plSubs[plCat] || []).map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={s.row2}>
                          <div style={s.field}>
                            <label style={s.lbl}>Department</label>
                            <select style={s.select} value={dept} onChange={e => { setDept(e.target.value); setDeptSub(''); setExpDesc('') }}>
                              <option value="">Select department...</option>
                              {Object.keys(deptSubs).map(d => <option key={d}>{d}</option>)}
                            </select>
                          </div>
                          <div style={s.field}>
                            <label style={s.lbl}>Dept. sub-category</label>
                            <select style={s.select} value={deptSub} onChange={e => { setDeptSub(e.target.value); setExpDesc('') }}>
                              <option value="">Select sub-category...</option>
                              {(deptSubs[dept] || []).map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={s.field}>
                          <label style={s.lbl}>Expense description</label>
                          <select style={s.select} value={expDesc} onChange={e => setExpDesc(e.target.value)}>
                            <option value="">Select description...</option>
                            {(expDescs[deptSub] || []).map(d => <option key={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>

                      <div style={s.section}>
                        <div style={s.sectionTitle}>Revenue stream allocation</div>
                        <div style={s.allocGrid}>
                          {[
                            { id: 'sg100', label: '100% Social Growth', sub: 'Full allocation' },
                            { id: 'af100', label: '100% Aimfox', sub: 'Full allocation' },
                            { id: 'shared', label: 'Shared 50/50', sub: 'Both streams' },
                            { id: 'byval', label: 'By value', sub: 'Custom split' },
                          ].map(a => (
                            <div key={a.id} style={{ ...s.allocBtn, ...(revAlloc === a.id ? s.allocBtnActive : {}) }} onClick={() => setRevAlloc(a.id)}>
                              <div style={s.allocLabel}>{a.label}</div>
                              <div style={s.allocSub}>{a.sub}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {directSubtype === 'revenue' && (
                    <div style={s.section}>
                      <div style={s.sectionTitle}>Revenue details</div>
                      <div style={s.field}>
                        <label style={s.lbl}>Revenue stream <span style={s.req}>*</span></label>
                        <select style={s.select} value={revStream} onChange={e => setRevStream(e.target.value)}>
                          <option value="">Select stream...</option>
                          <option>Social Growth</option><option>Aimfox</option>
                          <option>Outsourced Services</option><option>VAT Claimed</option>
                          <option>Interest Received</option><option>Loans</option>
                          <option>Credit</option><option>Other</option>
                        </select>
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
                    {rateSource && <div style={{ fontSize: '11px', color: '#0F6E56', marginTop: '4px' }}>Source: {rateSource}</div>}
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
                    <div style={{ ...s.convVal, color: '#1D9E75' }}>${usdAmount > 0 ? usdAmount.toFixed(2) : '0.00'}</div>
                  </div>
                </div>
              </div>

              {/* Review */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Review</div>

                <div style={{ ...s.infoBox, marginBottom: '14px', ...(txType === 'direct' ? {} : { background: '#E6F1FB', borderColor: '#7FB8EE', color: '#0C447C' }) }}>
                  {txType === 'direct'
                    ? '📊 This transaction will impact P&L directly.'
                    : `💳 This transaction closes ${linkedInvoices.length} invoice(s). No P&L impact.`}
                </div>

                {[
                  {
                    title: 'Transaction info', rows: [
                      ['Company', companies.find(c => c.id === companyId)?.name || '—'],
                      ['Bank', banks.find(b => b.id === bankId)?.name || '—'],
                      ['Partner', showNewPartner ? newPartnerName : (partners.find(p => p.id === partnerId)?.name || partnerSearch || '—')],
                      ['Date', txDate],
                      ['Statement', statement || '—'],
                      ['Type', txType === 'invoice_payment' ? 'Invoice payment' : `Direct (${directSubtype})`],
                    ]
                  },
                  ...(txType === 'invoice_payment' && linkedInvoices.length > 0 ? [{
                    title: 'Linked invoices', rows: linkedInvoices.map(l => [
                      `${l.partner_name} (${l.invoice_number})`,
                      `$${l.allocated_usd.toFixed(2)} allocated`
                    ])
                  }] : []),
                  ...(txType === 'direct' ? [{
                    title: 'P&L classification', rows: [
                      ['P&L Category', plCat || '—'],
                      ['Sub-category', plSub || '—'],
                      ['Department', dept || '—'],
                      ['Description', expDesc || revStream || '—'],
                    ]
                  }] : []),
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
                {saving ? 'Saving...' : transaction ? 'Update transaction' : 'Post transaction'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function getStatusStyle(status: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    unpaid: { background: '#FCEBEB', color: '#A32D2D' },
    partial: { background: '#FAEEDA', color: '#633806' },
    overpaid: { background: '#E6F1FB', color: '#0C447C' },
    paid: { background: '#E1F5EE', color: '#085041' },
  }
  return map[status] || { background: '#f0f0ee', color: '#666' }
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
  stepItem: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', whiteSpace: 'nowrap' },
  stepNum: { width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '500', background: '#f0f0ee', color: '#888', border: '0.5px solid #e5e5e5', flexShrink: 0 },
  stepActive: { background: '#1D9E75', color: '#fff', borderColor: '#1D9E75' },
  stepDone: { background: '#E1F5EE', color: '#085041', borderColor: '#1D9E75' },
  stepLabel: { fontSize: '12px', color: '#888' },
  stepDiv: { width: '20px', height: '0.5px', background: '#e5e5e5', flexShrink: 0 },
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
  statusBadge: { fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px' },
  addBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 12px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  removeBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 12px', border: '0.5px solid #E24B4A', borderRadius: '6px', background: 'transparent', color: '#A32D2D', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  allocRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#f5f5f3', borderRadius: '8px', marginBottom: '6px' },
  allocSummary: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '10px 14px', marginTop: '8px' },
  allocSummaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666', padding: '3px 0', borderBottom: '0.5px solid #f5f5f3' },
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
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}