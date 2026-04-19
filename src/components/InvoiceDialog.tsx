import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getRate, convertToUSD } from '../services/currencyService'

interface Props {
  onClose: () => void
  invoice?: any
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

interface ValidationErrors { [key: string]: string }

export default function InvoiceDialog({ onClose, invoice }: Props) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showValidationSummary, setShowValidationSummary] = useState(false)

  const [companies, setCompanies] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])

  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [partnerSearch, setPartnerSearch] = useState('')
  const [newPartnerName, setNewPartnerName] = useState('')
  const [showNewPartner, setShowNewPartner] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [invType, setInvType] = useState<'expense' | 'revenue'>('expense')
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
  const [accNum, setAccNum] = useState('')
  const [model, setModel] = useState('')
  const [refNum, setRefNum] = useState('')
  const [showPaymentDetails, setShowPaymentDetails] = useState(false)
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

  const runValidation = () => {
    const e: ValidationErrors = {}
    if (!companyId) e.companyId = 'Company is required'
    if (!currency) e.currency = 'Currency is required'
    if (!invoiceDate) e.invoiceDate = 'Invoice date is required'
    if (!partnerId && !(showNewPartner && newPartnerName.trim())) e.partnerId = 'Partner is required'
    if (!amount || parseFloat(amount) <= 0) e.amount = 'Amount must be greater than 0'
    if (currency && currency !== 'USD' && (!exRate || parseFloat(exRate) <= 0)) e.exRate = 'Exchange rate is required'
    if (invType === 'expense') {
      if (!plCat) e.plCat = 'P&L Category is required'
      if (!dept) e.dept = 'Department is required'
    }
    if (invType === 'revenue' && !revStream) e.revStream = 'Revenue stream is required'
    return e
  }

  useEffect(() => { setErrors(runValidation()) }, [companyId, currency, invoiceDate, partnerId, newPartnerName, showNewPartner, invType, plCat, dept, revStream, amount, exRate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const load = async () => {
      const [{ data: comp }, { data: part }] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('partners').select('*').order('name'),
      ])
      if (comp) setCompanies(comp)
      if (part) setPartners(part)
    }
    load()
  }, [])

  useEffect(() => {
    if (invoice) {
      setCompanyId(invoice.company_id || '')
      setCompanyName(invoice.companies?.name || '')
      setPartnerId(invoice.partner_id || '')
      setPartnerSearch(invoice.partners?.name || '')
      setInvoiceNumber(invoice.invoice_number || '')
      setInvoiceDate(invoice.invoice_date || '')
      setDueDate(invoice.due_date || '')
      setInvType(invoice.type || 'expense')
      setPlCat(invoice.pl_category || '')
      setPlSub(invoice.pl_subcategory || '')
      setDept(invoice.department || '')
      setDeptSub(invoice.dept_subcategory || '')
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
    }
  }, [invoice])

  const filteredPartners = partners.filter(p =>
    !partnerSearch || p.name.toLowerCase().includes(partnerSearch.toLowerCase())
  )

  const touch = (field: string) => setTouched(prev => ({ ...prev, [field]: true }))
  const fieldErr = (field: string) => touched[field] ? errors[field] : undefined
  const totalErrors = Object.keys(errors).length
  const isValid = totalErrors === 0

  const touchStep = (s: number) => {
    if (s === 1) setTouched(p => ({ ...p, companyId: true, currency: true, invoiceDate: true, partnerId: true }))
    if (s === 2) setTouched(p => ({ ...p, plCat: true, dept: true, revStream: true }))
    if (s === 3) setTouched(p => ({ ...p, amount: true, exRate: true }))
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

  const stepHasError = (n: number) => {
    const stepFields: Record<number, string[]> = {
      1: ['companyId', 'currency', 'invoiceDate', 'partnerId'],
      2: ['plCat', 'dept', 'revStream'],
      3: ['amount', 'exRate'],
    }
    return (stepFields[n] || []).some(f => !!errors[f])
  }

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
      const payload = {
        company_id: companyId || null, partner_id: finalPartnerId || null,
        invoice_number: invoiceNumber || null, invoice_date: invoiceDate,
        due_date: dueDate || null, type: invType,
        pl_category: plCat || null, pl_subcategory: plSub || null,
        department: dept || null, dept_subcategory: deptSub || null,
        expense_description: expDesc || null, revenue_stream: revStream || null,
        rev_alloc_type: revAlloc, dept_split_type: deptSplit, currency,
        amount: parseFloat(amount), exchange_rate: parseFloat(exRate) || null,
        amount_usd: usdAmount, is_indexed: isIndexed,
        account_number: accNum || null, model: model || null, reference_number: refNum || null,
        note: note || null, tags: tags.length > 0 ? tags : null,
        pl_impact: true, status: 'unpaid',
      }
      if (invoice?.id) { await supabase.from('invoices').update(payload).eq('id', invoice.id) }
      else { await supabase.from('invoices').insert(payload) }
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
        <div style={{ fontSize: '13px', color: '#888' }}>Saved to P&L successfully.</div>
      </div>
    </div>
  )

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>{invoice ? 'Edit invoice' : 'New invoice'}</div>
            <div style={s.headerSub}>Step {step} of 4 — {stepTitles[step - 1]}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={s.invBadge}>P&L Impact</div>
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

        {/* Validation banner */}
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
          {step === 1 && (
            <>
              <div style={s.section}>
                <div style={s.sectionTitle}>Company & invoice info</div>
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Company <span style={s.req}>*</span></label>
                    <select style={{ ...s.select, ...(fieldErr('companyId') ? s.inputError : {}) }} value={companyId}
                      onChange={e => { setCompanyId(e.target.value); setCompanyName(companies.find(c => c.id === e.target.value)?.name || ''); setCurrency(''); touch('companyId') }}
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
                      {companyName === 'SFBC' && <option>USD</option>}
                      {companyName === 'Constellation LLC' && <><option>RSD</option><option>USD</option><option>EUR</option></>}
                      {companyName === 'Social Growth LLC-FZ' && <><option>USD</option><option>AED</option></>}
                      {!companyName && <><option>USD</option><option>RSD</option><option>EUR</option><option>AED</option></>}
                    </select>
                    {fieldErr('currency') && <span style={s.errorMsg}>{fieldErr('currency')}</span>}
                  </div>
                </div>
                <div style={s.row3}>
                  <div style={s.field}>
                    <label style={s.lbl}>Invoice number</label>
                    <input style={s.input} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-001/2026" />
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
                {!showNewPartner ? (
                  <div style={s.row2}>
                    <div style={s.field}>
                      <label style={s.lbl}>Partner <span style={s.req}>*</span></label>
                      <input style={{ ...s.input, ...(fieldErr('partnerId') ? s.inputError : {}) }} value={partnerSearch}
                        onChange={e => { setPartnerSearch(e.target.value); setPartnerId(''); touch('partnerId') }}
                        onBlur={() => touch('partnerId')} placeholder="Search partner..." />
                      {partnerSearch && !partnerId && (
                        <div style={s.dropdown}>
                          {filteredPartners.slice(0, 6).map(p => (
                            <div key={p.id} style={s.dropdownItem} onClick={() => { setPartnerId(p.id); setPartnerSearch(p.name) }}>{p.name}</div>
                          ))}
                          <div style={{ ...s.dropdownItem, color: '#1D9E75' }} onClick={() => { setShowNewPartner(true); setPartnerSearch('') }}>+ Add new partner</div>
                        </div>
                      )}
                      {fieldErr('partnerId') && <span style={s.errorMsg}>{fieldErr('partnerId')}</span>}
                    </div>
                    <div style={s.field}>
                      <label style={s.lbl}>Invoice type <span style={s.req}>*</span></label>
                      <div style={s.typeRow}>
                        <div style={{ ...s.typeChip, ...(invType === 'expense' ? s.typeChipExpense : {}) }} onClick={() => setInvType('expense')}>📤 Expense</div>
                        <div style={{ ...s.typeChip, ...(invType === 'revenue' ? s.typeChipRevenue : {}) }} onClick={() => setInvType('revenue')}>📥 Revenue</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={s.row2}>
                    <div style={s.field}>
                      <label style={s.lbl}>New partner name <span style={s.req}>*</span></label>
                      <input style={s.input} value={newPartnerName} onChange={e => setNewPartnerName(e.target.value)} placeholder="Enter partner name..." />
                      <button style={s.linkBtn} onClick={() => setShowNewPartner(false)}>← Back to search</button>
                    </div>
                    <div style={s.field}>
                      <label style={s.lbl}>Invoice type <span style={s.req}>*</span></label>
                      <div style={s.typeRow}>
                        <div style={{ ...s.typeChip, ...(invType === 'expense' ? s.typeChipExpense : {}) }} onClick={() => setInvType('expense')}>📤 Expense</div>
                        <div style={{ ...s.typeChip, ...(invType === 'revenue' ? s.typeChipRevenue : {}) }} onClick={() => setInvType('revenue')}>📥 Revenue</div>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', marginBottom: '8px' }}>
                  <span style={s.sectionTitle}>Payment details</span>
                  <button style={s.linkBtn} onClick={() => setShowPaymentDetails(!showPaymentDetails)}>{showPaymentDetails ? '− Hide' : '+ Show'}</button>
                </div>
                {showPaymentDetails && (
                  <div style={s.row3}>
                    <div style={s.field}><label style={s.lbl}>Account number</label><input style={s.input} value={accNum} onChange={e => setAccNum(e.target.value)} placeholder="Partner bank account" /></div>
                    <div style={s.field}><label style={s.lbl}>Model</label><input style={s.input} value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. 97" /></div>
                    <div style={s.field}><label style={s.lbl}>Reference number</label><input style={s.input} value={refNum} onChange={e => setRefNum(e.target.value)} placeholder="Poziv na broj" /></div>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {invType === 'expense' && (
                <>
                  <div style={s.section}>
                    <div style={s.sectionTitle}>P&L classification</div>
                    <div style={s.row2}>
                      <div style={s.field}>
                        <label style={s.lbl}>P&L Category <span style={s.req}>*</span></label>
                        <select style={{ ...s.select, ...(fieldErr('plCat') ? s.inputError : {}) }} value={plCat}
                          onChange={e => { setPlCat(e.target.value); setPlSub(''); touch('plCat') }} onBlur={() => touch('plCat')}>
                          <option value="">Select P&L category...</option>
                          {Object.keys(plSubs).map(c => <option key={c}>{c}</option>)}
                        </select>
                        {fieldErr('plCat') && <span style={s.errorMsg}>{fieldErr('plCat')}</span>}
                      </div>
                      <div style={s.field}>
                        <label style={s.lbl}>P&L Sub-category</label>
                        <select style={s.select} value={plSub} onChange={e => setPlSub(e.target.value)}>
                          <option value="">Select sub-category...</option>
                          {(plSubs[plCat] || []).map(sc => <option key={sc}>{sc}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={s.row2}>
                      <div style={s.field}>
                        <label style={s.lbl}>Department <span style={s.req}>*</span></label>
                        <select style={{ ...s.select, ...(fieldErr('dept') ? s.inputError : {}) }} value={dept}
                          onChange={e => { setDept(e.target.value); setDeptSub(''); setExpDesc(''); touch('dept') }} onBlur={() => touch('dept')}>
                          <option value="">Select department...</option>
                          {Object.keys(deptSubs).map(d => <option key={d}>{d}</option>)}
                        </select>
                        {fieldErr('dept') && <span style={s.errorMsg}>{fieldErr('dept')}</span>}
                      </div>
                      <div style={s.field}>
                        <label style={s.lbl}>Dept. sub-category</label>
                        <select style={s.select} value={deptSub} onChange={e => { setDeptSub(e.target.value); setExpDesc('') }}>
                          <option value="">Select sub-category...</option>
                          {(deptSubs[dept] || []).map(sc => <option key={sc}>{sc}</option>)}
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
                      {[{ id:'sg100', label:'100% Social Growth', sub:'Full allocation' },{ id:'af100', label:'100% Aimfox', sub:'Full allocation' },{ id:'shared', label:'Shared 50/50', sub:'Both streams' },{ id:'byval', label:'By value', sub:'Custom split' }].map(a => (
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
                      <option>Social Growth</option><option>Aimfox</option><option>Outsourced Services</option>
                      <option>VAT Claimed</option><option>Interest Received</option><option>Loans</option><option>Credit</option><option>Other</option>
                    </select>
                    {fieldErr('revStream') && <span style={s.errorMsg}>{fieldErr('revStream')}</span>}
                  </div>
                </div>
              )}
              <div style={s.section}>
                <div style={s.sectionTitle}>Tags & note</div>
                <div style={s.tagRow}>
                  {['Recurring','Prepayment','Accrual','Capital expenditure','Tax deductible','Reimbursable'].map(t => (
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
                <div><div style={s.convLabel}>Invoice amount</div><div style={s.convVal}>{amount ? `${parseFloat(amount).toLocaleString()} ${currency}` : '—'}</div></div>
                <div style={{ fontSize: '20px', color: '#aaa', alignSelf: 'flex-end', paddingBottom: '4px' }}>→</div>
                <div><div style={s.convLabel}>USD equivalent</div><div style={{ ...s.convVal, color: '#1D9E75' }}>${usdAmount > 0 ? usdAmount.toFixed(2) : '0.00'}</div></div>
              </div>
              {dueDate && <div style={{ ...s.infoBox, marginTop: '12px', background: '#FAEEDA', borderColor: '#E5B96A', color: '#633806' }}>📅 Due date: <strong>{dueDate}</strong></div>}
            </div>
          )}

          {step === 4 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Review before posting</div>
              {isValid ? (
                <div style={{ ...s.infoBox, marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span>✅</span>
                  <div>
                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>All fields valid — ready to post</div>
                    <div style={{ fontSize: '11px', opacity: 0.85 }}>Invoice will impact P&L on date {invoiceDate}.</div>
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
                { title: 'Invoice info', rows: [['Company', companies.find(c => c.id === companyId)?.name || '—'],['Partner', showNewPartner ? newPartnerName : (partners.find(p => p.id === partnerId)?.name || partnerSearch || '—')],['Invoice number', invoiceNumber || '—'],['Invoice date', invoiceDate || '—'],['Due date', dueDate || '—'],['Type', invType]] },
                { title: 'P&L classification', rows: [['P&L Category', plCat || '—'],['Department', dept || '—'],['Revenue stream', revStream || '—']] },
                { title: 'Amounts', rows: [['Original amount', amount ? `${parseFloat(amount).toLocaleString()} ${currency}` : '—'],['Exchange rate', exRate ? `${parseFloat(exRate).toFixed(4)} (${rateSource || 'Manual'})` : 'N/A'],['USD equivalent', `$${usdAmount.toFixed(2)}`]] },
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
  dropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginTop: '2px' },
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
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}