import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import InlineCategoryAdd from './InlineCategoryAdd'
import { getRate, convertToUSD, getRatesForDate } from '../services/currencyService'
import CreditInstallmentSelector from './CreditInstallmentSelector'
// credit payment P&L logic is inline

interface Props {
  onClose: () => void
  onImported: () => void
}

interface StatementRow {
  id: string
  date: string
  partner_name: string
  partner_id: string | null
  description: string
  debit: string
  credit: string
  currency: string
  reference_number: string
  model: string
  account_number: string
  // Classification
  tx_type: 'direct' | 'invoice_payment' | 'passthrough' | 'credit_payment' | 'credit_payment'
  tx_subtype: 'expense' | 'revenue'
  pt_direction: 'in' | 'out'
  pt_period: string
  linked_invoice_id: string
  pl_category_id: string
  pl_category_name: string
  pl_subcategory_id: string
  pl_subcategory_name: string
  department_id: string
  department_name: string
  dept_subcategory_id: string
  dept_subcategory_name: string
  expense_description: string
  revenue_stream: string
  rev_alloc: string
  aimfox_val: string
  sg_val: string
  opex_type: string
  opex_val: string
  performance_val: string
  cf_type: string
  cf_frequency: string
  cf_next_month_est: string
  note: string
  selected_credit_id: string
  selected_installment_ids: string[]
}

const REVENUE_STREAMS = ['Social Growth', 'Aimfox', 'Outsourced Services', 'VAT Claimed', 'Interest Received', 'Loans', 'Credit', 'Other']

let rowCounter = 0
function makeRow(defaultCurrency = 'RSD'): StatementRow {
  rowCounter++
  return {
    id: `row_${rowCounter}`,
    date: new Date().toISOString().split('T')[0],
    partner_name: '', partner_id: null, description: '',
    debit: '', credit: '',
    currency: defaultCurrency,
    reference_number: '', model: '', account_number: '',
    tx_type: 'direct', tx_subtype: 'expense',
    pt_direction: 'out', pt_period: new Date().toISOString().slice(0, 7),
    linked_invoice_id: '',
    pl_category_id: '', pl_category_name: '',
    pl_subcategory_id: '', pl_subcategory_name: '',
    department_id: '', department_name: '',
    dept_subcategory_id: '', dept_subcategory_name: '',
    expense_description: '', revenue_stream: '',
    rev_alloc: 'sg100', aimfox_val: '', sg_val: '',
    opex_type: 'opex', opex_val: '', performance_val: '',
    cf_type: '', cf_frequency: 'monthly', cf_next_month_est: '',
    note: '',
    selected_credit_id: '',
    selected_installment_ids: [],
  }
}

export default function BankStatementDialog({ onClose, onImported }: Props) {
  const [company, setCompany] = useState('')
  const [bank, setBank] = useState('')
  const [statementNumber, setStatementNumber] = useState('')
  const [defaultCurrency, setDefaultCurrency] = useState('RSD')
  const [companies, setCompanies] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [allBanks, setAllBanks] = useState<any[]>([])
  const [openInvoices, setOpenInvoices] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [allPartnerAccounts, setAllPartnerAccounts] = useState<any[]>([])
  const [partnerSearch, setPartnerSearch] = useState<Record<string, string>>({})
  const [plCategories, setPlCategories] = useState<any[]>([])
  const [plSubcategories, setPlSubcategories] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [deptSubcategories, setDeptSubcategories] = useState<any[]>([])
  const [expenseDescriptions, setExpenseDescriptions] = useState<any[]>([])
  const [rows, setRows] = useState<StatementRow[]>([makeRow(), makeRow(), makeRow()])
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [credits, setCredits] = useState<any[]>([])
  const [rowInstallments, setRowInstallments] = useState<Record<string, any[]>>({})
  const [posted, setPosted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const [
        { data: comp }, { data: bnk }, { data: part },
        { data: plCat }, { data: plSub },
        { data: dept }, { data: deptSub }, { data: expDesc },
        { data: pacc },
      ] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('banks').select('*').order('name'),
        supabase.from('partners').select('*').order('name'),
        supabase.from('pl_categories').select('id,name,sort_order').order('sort_order'),
        supabase.from('pl_subcategories').select('id,name,category_id,sort_order').order('sort_order'),
        supabase.from('departments').select('id,name,sort_order').order('sort_order'),
        supabase.from('dept_subcategories').select('id,name,department_id,sort_order').order('sort_order'),
        supabase.from('expense_descriptions').select('id,name,dept_subcategory_id,sort_order').order('sort_order'),
        supabase.from('partner_accounts').select('id,partner_id,account_number,bank_name,currency,is_primary').order('is_primary', { ascending: false }),
      ])
      if (comp) setCompanies(comp)
      if (bnk) setAllBanks(bnk)
      if (part) setPartners(part)
      if (plCat) setPlCategories(plCat)
      if (plSub) setPlSubcategories(plSub)
      if (dept) setDepartments(dept)
      if (deptSub) setDeptSubcategories(deptSub)
      if (expDesc) setExpenseDescriptions(expDesc)
      if (pacc) setAllPartnerAccounts(pacc)
      const { data: creds } = await supabase
        .from('credits').select('id,name,bank,rate_description')
        .eq('status', 'active').order('name')
      if (creds) setCredits(creds)
    }
    load()
  }, [])

  useEffect(() => {
    if (company) setBanks(allBanks.filter(b => b.company_id === company))
    else setBanks([])
  }, [company, allBanks])

  useEffect(() => {
    if (!company) return
    supabase.from('v_invoice_status').select('*').eq('company_id', company)
      .in('calculated_status', ['unpaid', 'partial']).order('due_date', { ascending: true })
      .then(({ data }) => { if (data) setOpenInvoices(data) })
  }, [company])

  const getPlSubs = (catId: string) => plSubcategories.filter(s => s.category_id === catId)
  const getDeptSubs = (dId: string) => deptSubcategories.filter(s => s.department_id === dId)
  const getExpDescs = (subId: string) => expenseDescriptions.filter(e => e.dept_subcategory_id === subId)
  const normalizeAccountNumber = (acc: string): string => {
    if (!acc) return ''
    const a = acc.trim().replace(/\s/g, '')
    const parts = a.split('-')
    if (parts.length === 3) {
      const bank = parts[0].replace(/^0+/, '') || '0'
      const core = parts[1].replace(/^0+/, '') || '0'
      const ctrl = parts[2].replace(/^0+/, '') || '0'
      return `${bank}|${core}|${ctrl}`
    } else if (parts.length === 2) {
      const bank = parts[0].replace(/^0+/, '') || '0'
      const full = parts[1]
      if (full.length >= 3) {
        const core = full.slice(0, -2).replace(/^0+/, '') || '0'
        const ctrl = full.slice(-2).replace(/^0+/, '') || '0'
        return `${bank}|${core}|${ctrl}`
      }
      return `${bank}|${full.replace(/^0+/, '') || '0'}`
    }
    return a.replace(/\D/g, '').replace(/^0+/, '') || '0'
  }

  const getPartnerAccounts = (partnerId: string | null) => {
    if (!partnerId) return []
    return allPartnerAccounts.filter(pa => pa.partner_id === partnerId)
  }

  const loadRowInstallments = async (rowId: string, creditId: string) => {
    if (!creditId) return
    const { data } = await supabase
      .from('credit_installments')
      .select('id,installment_no,due_date,principal_amount,interest_amount,total_amount,status')
      .eq('credit_id', creditId).eq('status', 'outstanding').order('due_date')
    if (data) setRowInstallments(prev => ({ ...prev, [rowId]: data }))
  }


  const addRow = () => setRows(prev => [...prev, makeRow(defaultCurrency)])
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id))

  const updateRow = (id: string, updates: Partial<StatementRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }

  const validRows = rows.filter(r => r.date && (parseFloat(r.debit) > 0 || parseFloat(r.credit) > 0))
  const totalDebit = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0)

  const getRowSummary = (row: StatementRow) => {
    if (row.tx_type === 'credit_payment') return `🏦 Credit payment${row.selected_credit_id ? ' · ' + (credits.find(c => c.id === row.selected_credit_id)?.name || '') : ''}`
    if (row.tx_type === 'credit_payment') return `🏦 Credit payment${row.selected_credit_id ? ' · ' + (credits.find(c => c.id === row.selected_credit_id)?.name || '') : ''}`
    if (row.tx_type === 'passthrough') return `🔄 Pass-through ${row.pt_direction === 'in' ? 'IN' : 'OUT'}`
    if (row.tx_type === 'invoice_payment') {
      const inv = openInvoices.find(i => i.id === row.linked_invoice_id)
      return `💳 Invoice payment${inv ? ` · ${inv.partner_name}` : ''}`
    }
    if (row.tx_subtype === 'revenue') return `📥 Revenue${row.revenue_stream ? ` · ${row.revenue_stream}` : ''}`
    const parts = [row.pl_category_name, row.department_name].filter(Boolean)
    return `📤 Expense${parts.length ? ` · ${parts.join(' / ')}` : ' · unclassified'}`
  }

  const handlePost = async () => {
    if (!company || !bank) { setError('Please select company and bank.'); return }
    if (validRows.length === 0) { setError('Add at least one row with a date and amount.'); return }
    setPosting(true); setError('')

    const rateCache: Record<string, number> = {}
    const getExRate = async (cur: string, date: string) => {
      if (cur === 'USD') return 1
      const key = `${cur}_${date}`
      if (rateCache[key]) return rateCache[key]
      try {
        const rateData = await getRate(cur, date)
        rateCache[key] = rateData.rate; return rateData.rate
      } catch {
        const fallbacks: Record<string, number> = { RSD: 117.0, EUR: 1.08, AED: 0.272 }
        return fallbacks[cur] || 1
      }
    }

    try {
      for (const row of validRows) {
        const isExpense = parseFloat(row.debit) > 0
        const amount = isExpense ? parseFloat(row.debit) : parseFloat(row.credit)
        const cur = row.currency || defaultCurrency
        const exRate = await getExRate(cur, row.date)
        const amountUsd = convertToUSD(amount, cur, exRate)

        let partnerId: string | null = row.partner_id || null

        // If partner_id not set but name is, look up or create
        if (!partnerId && row.partner_name.trim()) {
          const { data: existing } = await supabase.from('partners').select('id').ilike('name', row.partner_name.trim()).single()
          if (existing) { partnerId = existing.id }
          else {
            const { data: newP } = await supabase.from('partners').insert({ name: row.partner_name.trim() }).select().single()
            if (newP) partnerId = newP.id
          }
        }

        if (row.tx_type === 'passthrough') {
          await supabase.from('passthrough').insert({
            company_id: company, bank_id: bank, partner_id: partnerId,
            transaction_date: row.date, direction: row.pt_direction,
            period_month: row.pt_period || null,
            currency: cur, amount, exchange_rate: exRate, amount_usd: amountUsd,
            note: row.note || row.description || null,
            account_number: row.account_number || null,
            model: row.model || null, reference_number: row.reference_number || null,
            status: 'unpaired',
          })
          continue
        }

        const isDirectWithPL = row.tx_type === 'direct'
        const aimfoxAmount = row.rev_alloc === 'byval' ? (parseFloat(row.aimfox_val) || null) : null
        const sgAmount = row.rev_alloc === 'byval' ? (parseFloat(row.sg_val) || null) : null
        const opexAmount = row.opex_type === 'split' ? (parseFloat(row.opex_val) || null) : null
        const perfAmount = row.opex_type === 'split' ? (parseFloat(row.performance_val) || null) : null

        const { data: newTx } = await supabase.from('transactions').insert({
          company_id: company, bank_id: bank, partner_id: partnerId,
          transaction_date: row.date, statement_number: statementNumber || null,
          type: row.tx_type, tx_subtype: row.tx_subtype,
          currency: cur, amount, exchange_rate: exRate, amount_usd: amountUsd,
          pl_impact: isDirectWithPL,
          pl_category: isDirectWithPL ? (row.pl_category_name || null) : null,
          pl_subcategory: isDirectWithPL ? (row.pl_subcategory_name || null) : null,
          department: isDirectWithPL ? (row.department_name || null) : null,
          dept_subcategory: isDirectWithPL ? (row.dept_subcategory_name || null) : null,
          expense_description: isDirectWithPL ? (row.expense_description || null) : null,
          revenue_stream: isDirectWithPL ? (row.revenue_stream || null) : null,
          rev_alloc_type: row.rev_alloc || 'sg100',
          rev_alloc_aimfox: aimfoxAmount, rev_alloc_sg: sgAmount,
          opex_type: isDirectWithPL && row.tx_subtype === 'expense' ? (row.opex_type || 'opex') : null,
          opex_amount: opexAmount, performance_amount: perfAmount,
          cf_type: isDirectWithPL && row.tx_subtype === 'expense' ? (row.cf_type || null) : null,
          cf_frequency: row.cf_type === 'recurring' ? row.cf_frequency : null,
          cf_next_month_est: row.cf_type === 'recurring' ? (row.cf_next_month_est ? parseFloat(row.cf_next_month_est) : (parseFloat(row.debit) || null)) : null,
          account_number: row.account_number || null,
          model: row.model || null, reference_number: row.reference_number || null,
          note: row.note || row.description || null, status: 'posted',
        }).select().single()

        if (row.tx_type === 'credit_payment' && row.selected_installment_ids.length > 0) {
          // EUR/USD = eurRsdRate / usdRsdRate (NBS zvanični kurs)
          let eurUsdRate = 1.08 // fallback
          try {
            const rates = await getRatesForDate(row.date)
            eurUsdRate = rates.eurRsdRate / rates.usdRsdRate
          } catch { /* use fallback */ }

          const creditName = credits.find((c: any) => c.id === row.selected_credit_id)?.name || 'Credit'

          for (const instId of row.selected_installment_ids) {
            const { data: inst } = await supabase
              .from('credit_installments')
              .select('id, installment_no, principal_amount, interest_amount')
              .eq('id', instId).single()
            if (!inst) continue

            if (inst.principal_amount > 0) {
              await supabase.from('transactions').insert({
                company_id: company, bank_id: bank,
                partner_id: partnerId, transaction_date: row.date,
                statement_number: statementNumber || null,
                type: 'credit_payment', tx_subtype: 'expense', currency: 'EUR',
                amount: inst.principal_amount, exchange_rate: eurUsdRate,
                amount_usd: Math.round(inst.principal_amount * eurUsdRate * 100) / 100,
                pl_impact: true, pl_category: 'Loans/Credits/Dividend',
                expense_description: `Principal — ${creditName} #${inst.installment_no}`,
                cf_type: 'recurring', cf_frequency: 'monthly',
                note: row.note || row.description || null, status: 'posted',
              })
            }
            if (inst.interest_amount > 0) {
              await supabase.from('transactions').insert({
                company_id: company, bank_id: bank,
                partner_id: partnerId, transaction_date: row.date,
                statement_number: statementNumber || null,
                type: 'credit_payment', tx_subtype: 'expense', currency: 'EUR',
                amount: inst.interest_amount, exchange_rate: eurUsdRate,
                amount_usd: Math.round(inst.interest_amount * eurUsdRate * 100) / 100,
                pl_impact: true, pl_category: 'Financial Expenses',
                pl_subcategory: 'Interest',
                expense_description: `Interest — ${creditName} #${inst.installment_no}`,
                cf_type: 'recurring', cf_frequency: 'monthly',
                note: row.note || row.description || null, status: 'posted',
              })
            }
            await supabase.from('credit_installments').update({
              status: 'paid', paid_date: row.date, updated_at: new Date().toISOString(),
            }).eq('id', instId)
          }
          if (row.selected_credit_id) {
            const { data: rem } = await supabase.from('credit_installments').select('id')
              .eq('credit_id', row.selected_credit_id).eq('status', 'outstanding')
            if (rem && rem.length === 0)
              await supabase.from('credits')
                .update({ status: 'closed', updated_at: new Date().toISOString() })
                .eq('id', row.selected_credit_id)
          }
          continue
        }

        if (row.tx_type === 'credit_payment' && row.selected_installment_ids.length > 0) {
          // EUR/USD = eurRsdRate / usdRsdRate (NBS zvanični kurs)
          let eurUsdRate = 1.08 // fallback
          try {
            const rates = await getRatesForDate(row.date)
            eurUsdRate = rates.eurRsdRate / rates.usdRsdRate
          } catch { /* use fallback */ }

          const creditName = credits.find((c: any) => c.id === row.selected_credit_id)?.name || 'Credit'

          for (const instId of row.selected_installment_ids) {
            const { data: inst } = await supabase
              .from('credit_installments')
              .select('id, installment_no, principal_amount, interest_amount')
              .eq('id', instId).single()
            if (!inst) continue

            if (inst.principal_amount > 0) {
              await supabase.from('transactions').insert({
                company_id: company, bank_id: bank,
                partner_id: partnerId, transaction_date: row.date,
                statement_number: statementNumber || null,
                type: 'credit_payment', tx_subtype: 'expense', currency: 'EUR',
                amount: inst.principal_amount, exchange_rate: eurUsdRate,
                amount_usd: Math.round(inst.principal_amount * eurUsdRate * 100) / 100,
                pl_impact: true, pl_category: 'Loans/Credits/Dividend',
                expense_description: `Principal — ${creditName} #${inst.installment_no}`,
                cf_type: 'recurring', cf_frequency: 'monthly',
                note: row.note || row.description || null, status: 'posted',
              })
            }
            if (inst.interest_amount > 0) {
              await supabase.from('transactions').insert({
                company_id: company, bank_id: bank,
                partner_id: partnerId, transaction_date: row.date,
                statement_number: statementNumber || null,
                type: 'credit_payment', tx_subtype: 'expense', currency: 'EUR',
                amount: inst.interest_amount, exchange_rate: eurUsdRate,
                amount_usd: Math.round(inst.interest_amount * eurUsdRate * 100) / 100,
                pl_impact: true, pl_category: 'Financial Expenses',
                pl_subcategory: 'Interest',
                expense_description: `Interest — ${creditName} #${inst.installment_no}`,
                cf_type: 'recurring', cf_frequency: 'monthly',
                note: row.note || row.description || null, status: 'posted',
              })
            }
            await supabase.from('credit_installments').update({
              status: 'paid', paid_date: row.date, updated_at: new Date().toISOString(),
            }).eq('id', instId)
          }
          if (row.selected_credit_id) {
            const { data: rem } = await supabase.from('credit_installments').select('id')
              .eq('credit_id', row.selected_credit_id).eq('status', 'outstanding')
            if (rem && rem.length === 0)
              await supabase.from('credits')
                .update({ status: 'closed', updated_at: new Date().toISOString() })
                .eq('id', row.selected_credit_id)
          }
          continue
        }

        if (row.tx_type === 'invoice_payment' && row.linked_invoice_id && newTx?.id) {
          const invAmount = amountUsd
          await supabase.from('invoice_transaction_links').insert({
            invoice_id: row.linked_invoice_id, transaction_id: newTx.id,
            allocated_amount: amount, allocated_amount_usd: cur === 'USD' ? amount : invAmount,
          })
          const { data: invStatus } = await supabase.from('v_invoice_status').select('calculated_status').eq('id', row.linked_invoice_id).single()
          if (invStatus) await supabase.from('invoices').update({ status: invStatus.calculated_status }).eq('id', row.linked_invoice_id)
        }
      }
      setPosted(true)
      setTimeout(() => { onImported(); onClose() }, 1500)
    } catch (err: any) {
      setError(`Error: ${err.message}`)
    }
    setPosting(false)
  }

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
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>🏦 Manual bank statement entry</div>
            <div style={s.headerSub}>Enter transactions row by row — click a row to classify it</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={s.body}>
          {/* Statement details */}
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
                <select style={s.select} value={defaultCurrency} onChange={e => setDefaultCurrency(e.target.value)}>
                  {['RSD', 'USD', 'EUR', 'AED', 'GBP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Rows */}
          <div style={s.section}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={s.sectionTitle}>Transactions — click row to classify</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#888' }}>{validRows.length} valid</span>
                <button style={s.addRowBtn} onClick={addRow}>+ Add row</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
              {rows.map((row) => {
                const isExpanded = expandedRow === row.id
                const hasAmount = parseFloat(row.debit) > 0 || parseFloat(row.credit) > 0
                const isValid = row.date && hasAmount
                const plSubs = getPlSubs(row.pl_category_id)
                const deptSubs = getDeptSubs(row.department_id)
                const expDescs = getExpDescs(row.dept_subcategory_id)
                const linkedInvoice = openInvoices.find(i => i.id === row.linked_invoice_id)
                const rowPartnerAccounts = getPartnerAccounts(row.partner_id)

                return (
                  <div key={row.id} style={{
                    border: isExpanded ? '1.5px solid #1D9E75' : isValid ? '1px solid #e5e5e5' : '1px dashed #ddd',
                    borderRadius: '10px',
                    // NOTE: no overflow:hidden here so dropdowns can overlay other rows
                    background: isExpanded ? '#f0fdf8' : isValid ? '#fff' : '#fafaf9',
                  }}>
                    {/* Row header — always visible */}
                    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr 100px 100px 70px auto 32px', gap: '6px', alignItems: 'center', padding: '8px 10px', cursor: 'pointer' }}
                      onClick={() => setExpandedRow(isExpanded ? null : row.id)}>
                      <input type="date" style={s.cellInput} value={row.date}
                        onChange={e => { e.stopPropagation(); updateRow(row.id, { date: e.target.value }) }}
                        onClick={e => e.stopPropagation()} />

                      {/* Partner search with dropdown */}
                      <div style={{ position: 'relative' as const }} onClick={e => e.stopPropagation()}>
                        <input style={s.cellInput} value={partnerSearch[row.id] ?? row.partner_name}
                          onChange={e => {
                            setPartnerSearch(prev => ({ ...prev, [row.id]: e.target.value }))
                            updateRow(row.id, { partner_name: e.target.value, partner_id: null })
                          }}
                          placeholder="Partner name" />
                        {(partnerSearch[row.id] ?? '').length > 0 && !row.partner_id && (
                          <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e5e5', borderRadius: '6px', zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '200px', overflowY: 'auto' as const }}>
                            {partners.filter(p => p.name.toLowerCase().includes((partnerSearch[row.id] ?? '').toLowerCase())).slice(0, 8).map(p => (
                              <div key={p.id} style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '0.5px solid #f5f5f3', display: 'flex', flexDirection: 'column' as const }}
                                onMouseDown={e => {
                                  e.preventDefault()
                                  updateRow(row.id, { partner_name: p.name, partner_id: p.id })
                                  setPartnerSearch(prev => ({ ...prev, [row.id]: p.name }))
                                }}>
                                <span style={{ fontWeight: '500', color: '#111' }}>{p.name}</span>
                                {allPartnerAccounts.filter(pa => pa.partner_id === p.id).length > 0 && (
                                  <span style={{ fontSize: '10px', color: '#7A9BB8' }}>
                                    {allPartnerAccounts.filter(pa => pa.partner_id === p.id).length} račun(a)
                                  </span>
                                )}
                              </div>
                            ))}
                            {partners.filter(p => p.name.toLowerCase().includes((partnerSearch[row.id] ?? '').toLowerCase())).length === 0 && (
                              <div style={{ padding: '7px 10px', fontSize: '12px', color: '#aaa' }}>Novi partner: "{partnerSearch[row.id]}"</div>
                            )}
                          </div>
                        )}
                      </div>

                      <input style={s.cellInput} value={row.description}
                        onChange={e => { e.stopPropagation(); updateRow(row.id, { description: e.target.value }) }}
                        onClick={e => e.stopPropagation()} placeholder="Description" />
                      <input type="number" style={{ ...s.cellInput, color: parseFloat(row.debit) > 0 ? '#A32D2D' : '#111' }}
                        value={row.debit} placeholder="Debit (out)"
                        onChange={e => { e.stopPropagation(); updateRow(row.id, { debit: e.target.value, credit: e.target.value ? '' : row.credit }) }}
                        onClick={e => e.stopPropagation()} />
                      <input type="number" style={{ ...s.cellInput, color: parseFloat(row.credit) > 0 ? '#1D9E75' : '#111' }}
                        value={row.credit} placeholder="Credit (in)"
                        onChange={e => { e.stopPropagation(); updateRow(row.id, { credit: e.target.value, debit: e.target.value ? '' : row.debit }) }}
                        onClick={e => e.stopPropagation()} />
                      <select style={s.cellInput} value={row.currency}
                        onChange={e => { e.stopPropagation(); updateRow(row.id, { currency: e.target.value }) }}
                        onClick={e => e.stopPropagation()}>
                        {['RSD', 'USD', 'EUR', 'AED', 'GBP'].map(c => <option key={c}>{c}</option>)}
                      </select>
                      <div style={{ fontSize: '10px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {hasAmount ? getRowSummary(row) : <span style={{ color: '#ccc' }}>click to classify</span>}
                      </div>
                      <button style={{ background: 'none', border: 'none', color: '#ccc', fontSize: '15px', cursor: 'pointer', padding: '2px' }}
                        onClick={e => { e.stopPropagation(); removeRow(row.id) }}>×</button>
                    </div>

                    {/* Expanded classification panel */}
                    {isExpanded && (
                      <div style={{ padding: '14px 16px', borderTop: '0.5px solid #e5e5e5', background: '#f9fff9' }}>

                        {/* Transaction type */}
                        <div style={s.classTitle}>Transaction type</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                          {[
                            { id: 'direct', icon: '⚡', label: 'Direct transaction', sub: 'Impacts P&L directly', activeColor: '#1D9E75', activeBg: '#E1F5EE' },
                            { id: 'invoice_payment', icon: '💳', label: 'Invoice payment', sub: 'Closes open invoices', activeColor: '#185FA5', activeBg: '#E6F1FB' },
                            { id: 'passthrough', icon: '🔄', label: 'Pass-through', sub: 'Money in transit', activeColor: '#E6B432', activeBg: '#FFFBEB' },
                            { id: 'credit_payment', icon: '🏦', label: 'Credit payment', sub: 'Close installments', activeColor: '#4EA8FF', activeBg: '#EBF5FF' },
                            { id: 'credit_payment', icon: '🏦', label: 'Credit payment', sub: 'Close installments', activeColor: '#4EA8FF', activeBg: '#EBF5FF' },
                          ].map(t => (
                            <div key={t.id} style={{
                              border: row.tx_type === t.id ? `2px solid ${t.activeColor}` : '0.5px solid #e5e5e5',
                              background: row.tx_type === t.id ? t.activeBg : '#fff',
                              borderRadius: '10px', padding: '12px', cursor: 'pointer', textAlign: 'center' as const,
                            }} onClick={() => updateRow(row.id, { tx_type: t.id as any })}>
                              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{t.icon}</div>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#111' }}>{t.label}</div>
                              <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{t.sub}</div>
                            </div>
                          ))}
                        </div>

                        {/* Pass-through */}
                        {row.tx_type === 'passthrough' && (
                          <>
                            <div style={s.classTitle}>Pass-through details</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                              <div style={s.field}>
                                <label style={s.lbl}>Direction</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  {[{ id: 'in', label: '📥 IN' }, { id: 'out', label: '📤 OUT' }].map(d => (
                                    <div key={d.id} style={{ flex: 1, textAlign: 'center' as const, padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                                      border: row.pt_direction === d.id ? `2px solid ${d.id === 'in' ? '#1D9E75' : '#E24B4A'}` : '0.5px solid #e5e5e5',
                                      background: row.pt_direction === d.id ? (d.id === 'in' ? '#E1F5EE' : '#FCEBEB') : '#fff',
                                      color: row.pt_direction === d.id ? (d.id === 'in' ? '#085041' : '#A32D2D') : '#666',
                                    }} onClick={() => updateRow(row.id, { pt_direction: d.id as any })}>{d.label}</div>
                                  ))}
                                </div>
                              </div>
                              <div style={s.field}>
                                <label style={s.lbl}>Period</label>
                                <input type="month" style={s.input} value={row.pt_period} onChange={e => updateRow(row.id, { pt_period: e.target.value })} />
                              </div>
                            </div>
                          </>
                        )}

                        {/* Invoice payment */}
                        {row.tx_type === 'invoice_payment' && (
                          <>
                            <div style={s.classTitle}>Link to open invoice</div>
                            <div style={{ marginBottom: '14px' }}>
                              {openInvoices.length === 0 ? (
                                <div style={{ fontSize: '12px', color: '#aaa', padding: '8px', background: '#f5f5f3', borderRadius: '8px' }}>
                                  No open invoices for this company. Select a company first.
                                </div>
                              ) : (
                                <select style={{ ...s.select, width: '100%' }} value={row.linked_invoice_id} onChange={e => updateRow(row.id, { linked_invoice_id: e.target.value })}>
                                  <option value="">— No invoice linked —</option>
                                  {openInvoices.map(inv => (
                                    <option key={inv.id} value={inv.id}>{inv.partner_name || '—'}{inv.invoice_number ? ` · ${inv.invoice_number}` : ''} · ${(inv.remaining_usd || 0).toFixed(0)} remaining</option>
                                  ))}
                                </select>
                              )}
                              {linkedInvoice && (
                                <div style={{ marginTop: '8px', background: '#E6F1FB', border: '0.5px solid #7FB8EE', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#0C447C' }}>
                                  💳 Closes: <strong>{linkedInvoice.partner_name}</strong> · Remaining: <strong>${(linkedInvoice.remaining_usd || 0).toFixed(2)}</strong>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* Direct — subtype */}
                        {row.tx_type === 'direct' && (
                          <>
                            <div style={s.classTitle}>Subtype</div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                              {[{ id: 'expense', label: '📤 Expense' }, { id: 'revenue', label: '📥 Revenue' }].map(sub => (
                                <div key={sub.id} style={{ flex: 1, textAlign: 'center' as const, padding: '9px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                                  border: row.tx_subtype === sub.id ? `2px solid ${sub.id === 'expense' ? '#E24B4A' : '#1D9E75'}` : '0.5px solid #e5e5e5',
                                  background: row.tx_subtype === sub.id ? (sub.id === 'expense' ? '#FCEBEB' : '#E1F5EE') : '#fff',
                                  color: row.tx_subtype === sub.id ? (sub.id === 'expense' ? '#A32D2D' : '#085041') : '#666',
                                }} onClick={() => updateRow(row.id, { tx_subtype: sub.id as any })}>{sub.label}</div>
                              ))}
                            </div>

                            {/* Expense classification */}
                            {row.tx_subtype === 'expense' && (
                              <>
                                <div style={s.classTitle}>P&L Classification</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                  <div style={s.field}>
                                    <label style={s.lbl}>P&L Category</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                    <select style={{ ...s.select, flex: 1 }} value={row.pl_category_id}
                                      onChange={e => { const c = plCategories.find(x => x.id === e.target.value); updateRow(row.id, { pl_category_id: e.target.value, pl_category_name: c?.name || '', pl_subcategory_id: '', pl_subcategory_name: '' }) }}>
                                      <option value="">Select category...</option>
                                      {plCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <InlineCategoryAdd table="pl_categories"
                                      currentCount={plCategories.length} theme="light"
                                      onAdded={item => { setPlCategories(prev => [...prev, { ...item, type: 'expense', sort_order: prev.length + 1 }]); updateRow(row.id, { pl_category_id: item.id, pl_category_name: item.name, pl_subcategory_id: '', pl_subcategory_name: '' }) }} />
                                    </div>
                                  </div>
                                  <div style={s.field}>
                                    <label style={s.lbl}>P&L Sub-category</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                    <select style={{ ...s.select, flex: 1 }} value={row.pl_subcategory_id}
                                      onChange={e => { const sub = plSubcategories.find(x => x.id === e.target.value); updateRow(row.id, { pl_subcategory_id: e.target.value, pl_subcategory_name: sub?.name || '' }) }}
                                      disabled={!row.pl_category_id || plSubs.length === 0}>
                                      <option value="">Select sub-category...</option>
                                      {plSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                    </select>
                                    <InlineCategoryAdd table="pl_subcategories" parentId={row.pl_category_id} parentField="category_id"
                                      currentCount={plSubs.length} theme="light" disabled={!row.pl_category_id}
                                      onAdded={item => { setPlSubcategories(prev => [...prev, { ...item, category_id: row.pl_category_id, sort_order: prev.length + 1 }]); updateRow(row.id, { pl_subcategory_id: item.id, pl_subcategory_name: item.name }) }} />
                                    </div>
                                  </div>
                                </div>

                                <div style={s.classTitle}>Department</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                  <div style={s.field}>
                                    <label style={s.lbl}>Department</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                    <select style={{ ...s.select, flex: 1 }} value={row.department_id}
                                      onChange={e => { const d = departments.find(x => x.id === e.target.value); updateRow(row.id, { department_id: e.target.value, department_name: d?.name || '', dept_subcategory_id: '', dept_subcategory_name: '', expense_description: '' }) }}>
                                      <option value="">Select department...</option>
                                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                    <InlineCategoryAdd table="departments"
                                      currentCount={departments.length} theme="light"
                                      onAdded={item => { setDepartments(prev => [...prev, { ...item, sort_order: prev.length + 1 }]); updateRow(row.id, { department_id: item.id, department_name: item.name, dept_subcategory_id: '', dept_subcategory_name: '', expense_description: '' }) }} />
                                    </div>
                                  </div>
                                  <div style={s.field}>
                                    <label style={s.lbl}>Dept. Sub-category</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                    <select style={{ ...s.select, flex: 1 }} value={row.dept_subcategory_id}
                                      onChange={e => { const sub = deptSubcategories.find(x => x.id === e.target.value); updateRow(row.id, { dept_subcategory_id: e.target.value, dept_subcategory_name: sub?.name || '', expense_description: '' }) }}
                                      disabled={!row.department_id || deptSubs.length === 0}>
                                      <option value="">Select sub-category...</option>
                                      {deptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                    </select>
                                    <InlineCategoryAdd table="dept_subcategories" parentId={row.department_id} parentField="department_id"
                                      currentCount={deptSubs.length} theme="light" disabled={!row.department_id}
                                      onAdded={item => { setDeptSubcategories(prev => [...prev, { ...item, department_id: row.department_id, sort_order: prev.length + 1 }]); updateRow(row.id, { dept_subcategory_id: item.id, dept_subcategory_name: item.name, expense_description: '' }) }} />
                                    </div>
                                  </div>
                                </div>

                                <div style={{ marginBottom: '10px' }}>
                                  <div style={s.field}>
                                    <label style={s.lbl}>Expense description</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                      {expDescs.length > 0 ? (
                                        <select style={{ ...s.select, flex: 1 }} value={row.expense_description} onChange={e => updateRow(row.id, { expense_description: e.target.value })}>
                                          <option value="">Select description...</option>
                                          {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                        </select>
                                      ) : (
                                        <input style={{ ...s.input, flex: 1 }} value={row.expense_description} onChange={e => updateRow(row.id, { expense_description: e.target.value })} placeholder="e.g. AWS, Telekom, Rent..." />
                                      )}
                                      <InlineCategoryAdd table="expense_descriptions" parentId={row.dept_subcategory_id} parentField="dept_subcategory_id"
                                        currentCount={expDescs.length} theme="light" disabled={!row.dept_subcategory_id}
                                        onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: row.dept_subcategory_id, sort_order: prev.length + 1 }]); updateRow(row.id, { expense_description: item.name }) }} />
                                    </div>
                                  </div>
                                </div>

                                {/* Revenue stream allocation */}
                                <div style={s.classTitle}>Revenue stream allocation</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '10px' }}>
                                  {[
                                    { id: 'sg100', label: '100% Social Growth' },
                                    { id: 'af100', label: '100% Aimfox' },
                                    { id: 'shared', label: 'Shared 50/50' },
                                    { id: 'byval', label: 'By value' },
                                  ].map(a => (
                                    <div key={a.id} style={{ ...s.allocBtn, ...(row.rev_alloc === a.id ? s.allocBtnActive : {}) }}
                                      onClick={() => updateRow(row.id, { rev_alloc: a.id, aimfox_val: '', sg_val: '' })}>
                                      <div style={{ fontSize: '11px', fontWeight: '500' }}>{a.label}</div>
                                    </div>
                                  ))}
                                </div>
                                {row.rev_alloc === 'byval' && (() => {
                                  const total = parseFloat(row.debit) || 0
                                  const af = parseFloat(row.aimfox_val) || 0
                                  const sg = parseFloat(row.sg_val) || 0
                                  const ok = total > 0 && Math.abs(af + sg - total) < 0.01
                                  return (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px', background: '#f5f5f3', padding: '10px', borderRadius: '8px' }}>
                                      <div style={s.field}>
                                        <label style={s.lbl}>Aimfox ({row.currency})</label>
                                        <input type="number" style={s.input} value={row.aimfox_val}
                                          onChange={e => { const v = parseFloat(e.target.value) || 0; updateRow(row.id, { aimfox_val: e.target.value, sg_val: total > 0 && v <= total ? (total - v).toFixed(2) : row.sg_val }) }} placeholder="0.00" />
                                      </div>
                                      <div style={s.field}>
                                        <label style={s.lbl}>Social Growth ({row.currency})</label>
                                        <input type="number" style={s.input} value={row.sg_val}
                                          onChange={e => { const v = parseFloat(e.target.value) || 0; updateRow(row.id, { sg_val: e.target.value, aimfox_val: total > 0 && v <= total ? (total - v).toFixed(2) : row.aimfox_val }) }} placeholder="0.00" />
                                      </div>
                                      {af > 0 && sg > 0 && <div style={{ gridColumn: '1/-1', fontSize: '11px', color: ok ? '#1D9E75' : '#A32D2D' }}>{ok ? '✓ Split valid' : `⚠ Sum ${(af+sg).toFixed(2)} ≠ total ${total.toFixed(2)}`}</div>}
                                    </div>
                                  )
                                })()}

                                {/* OPEX vs Performance */}
                                <div style={s.classTitle}>Expense type — OPEX vs Performance</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                  {[
                                    { id: 'opex', label: '🏢 100% OPEX', color: '#185FA5', bg: '#E6F1FB' },
                                    { id: 'performance', label: '🚀 100% Performance', color: '#BA7517', bg: '#FAEEDA' },
                                    { id: 'split', label: '⚖️ Split by value', color: '#555', bg: '#f0f0ee' },
                                  ].map(a => (
                                    <div key={a.id} style={{ ...s.allocBtn, ...(row.opex_type === a.id ? { border: `2px solid ${a.color}`, background: a.bg } : {}) }}
                                      onClick={() => updateRow(row.id, { opex_type: a.id, opex_val: '', performance_val: '' })}>
                                      <div style={{ fontSize: '11px', fontWeight: '600', color: row.opex_type === a.id ? a.color : '#111' }}>{a.label}</div>
                                    </div>
                                  ))}
                                </div>
                                {row.opex_type === 'split' && (() => {
                                  const total = parseFloat(row.debit) || 0
                                  const op = parseFloat(row.opex_val) || 0
                                  const perf = parseFloat(row.performance_val) || 0
                                  const ok = total > 0 && Math.abs(op + perf - total) < 0.01
                                  return (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px', background: '#f5f5f3', padding: '10px', borderRadius: '8px' }}>
                                      <div style={s.field}>
                                        <label style={s.lbl}>OPEX ({row.currency})</label>
                                        <input type="number" style={s.input} value={row.opex_val}
                                          onChange={e => { const v = parseFloat(e.target.value) || 0; updateRow(row.id, { opex_val: e.target.value, performance_val: total > 0 && v <= total ? (total - v).toFixed(2) : row.performance_val }) }} placeholder="0.00" />
                                      </div>
                                      <div style={s.field}>
                                        <label style={s.lbl}>Performance ({row.currency})</label>
                                        <input type="number" style={s.input} value={row.performance_val}
                                          onChange={e => { const v = parseFloat(e.target.value) || 0; updateRow(row.id, { performance_val: e.target.value, opex_val: total > 0 && v <= total ? (total - v).toFixed(2) : row.opex_val }) }} placeholder="0.00" />
                                      </div>
                                      {op > 0 && perf > 0 && <div style={{ gridColumn: '1/-1', fontSize: '11px', color: ok ? '#1D9E75' : '#A32D2D' }}>{ok ? '✓ Split valid' : `⚠ Sum ${(op+perf).toFixed(2)} ≠ total ${total.toFixed(2)}`}</div>}
                                    </div>
                                  )
                                })()}
                              </>
                            )}

                            {/* Cash Flow Classification */}
                            <div style={s.classTitle}>Cash flow classification</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '6px', marginBottom: '10px' }}>
                              {[
                                { id: 'recurring', label: '🔁 Recurring' },
                                { id: 'one_time', label: '1️⃣ One-time' },
                                { id: 'accrual', label: '📅 Accrual' },
                                { id: 'capex', label: '🏗 CapEx' },
                                { id: 'reimbursable', label: '↩️ Reimb.' },
                              ].map(a => (
                                <div key={a.id} style={{ ...s.allocBtn, padding: '6px 4px', ...(row.cf_type === a.id ? { border: '2px solid #1D9E75', background: '#E1F5EE' } : {}) }}
                                  onClick={() => updateRow(row.id, { cf_type: row.cf_type === a.id ? '' : a.id })}>
                                  <div style={{ fontSize: '10px', fontWeight: '600', color: row.cf_type === a.id ? '#085041' : '#111' }}>{a.label}</div>
                                </div>
                              ))}
                            </div>
                            {row.cf_type === 'recurring' && (
                              <div style={{ marginBottom: '10px', background: '#f5f5f3', borderRadius: '8px', padding: '10px', border: '0.5px solid #e5e5e5' }}>
                                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                  {[{ id: 'monthly', label: 'Monthly' }, { id: 'quarterly', label: 'Quarterly' }, { id: 'yearly', label: 'Yearly' }].map(f => (
                                    <div key={f.id}
                                      style={{ flex: 1, padding: '5px', border: row.cf_frequency === f.id ? '2px solid #1D9E75' : '0.5px solid #e5e5e5', borderRadius: '6px', background: row.cf_frequency === f.id ? '#E1F5EE' : '#fff', cursor: 'pointer', textAlign: 'center' as const, fontSize: '11px', color: row.cf_frequency === f.id ? '#085041' : '#666' }}
                                      onClick={() => updateRow(row.id, { cf_frequency: f.id })}>{f.label}</div>
                                  ))}
                                </div>
                                <div style={s.field}>
                                  <label style={s.lbl}>Next month estimate ({row.currency})</label>
                                  <input type="number" style={s.input} value={row.cf_next_month_est}
                                    onChange={e => updateRow(row.id, { cf_next_month_est: e.target.value })}
                                    placeholder={row.debit ? `Auto: ${parseFloat(row.debit).toLocaleString()}` : '0.00'} />
                                </div>
                              </div>
                            )}
                            {row.cf_type === 'one_time' && (
                              <div style={{ marginBottom: '10px', fontSize: '11px', color: '#888', background: '#f5f5f3', borderRadius: '6px', padding: '8px 10px' }}>
                                One-time — won't be included in future estimates.
                              </div>
                            )}

                            {/* Revenue */}
                            {row.tx_subtype === 'revenue' && (
                              <>
                                <div style={s.classTitle}>Revenue stream</div>
                                <div style={{ marginBottom: '10px' }}>
                                  <select style={{ ...s.select, width: '100%' }} value={row.revenue_stream} onChange={e => updateRow(row.id, { revenue_stream: e.target.value })}>
                                    <option value="">Select stream...</option>
                                    {REVENUE_STREAMS.map(r => <option key={r}>{r}</option>)}
                                  </select>
                                </div>
                              </>
                            )}
                          </>
                        )}

                        {/* Credit payment */}
                        {row.tx_type === 'credit_payment' && (
                          <>
                            <div style={s.classTitle}>Credit installments</div>
                            <div style={{ marginBottom: '14px' }}>
                              <CreditInstallmentSelector
                                credits={credits}
                                selectedCreditId={row.selected_credit_id}
                                onCreditChange={id => {
                                  updateRow(row.id, { selected_credit_id: id, selected_installment_ids: [] })
                                  loadRowInstallments(row.id, id)
                                }}
                                installments={rowInstallments[row.id] || []}
                                selectedInstallmentIds={row.selected_installment_ids}
                                onToggle={id => updateRow(row.id, {
                                  selected_installment_ids: row.selected_installment_ids.includes(id)
                                    ? row.selected_installment_ids.filter((x: string) => x !== id)
                                    : [...row.selected_installment_ids, id]
                                })}
                                onToggleAll={() => {
                                  const all = (rowInstallments[row.id] || []).map((i: any) => i.id)
                                  updateRow(row.id, {
                                    selected_installment_ids:
                                      row.selected_installment_ids.length === all.length ? [] : all
                                  })
                                }}
                                selectedTotal={(rowInstallments[row.id] || [])
                                  .filter((i: any) => row.selected_installment_ids.includes(i.id))
                                  .reduce((s: number, i: any) => s + i.total_amount, 0)}
                                theme="light"
                              />
                            </div>
                          </>
                        )}

                        {/* Credit payment */}
                        {row.tx_type === 'credit_payment' && (
                          <>
                            <div style={s.classTitle}>Credit installments</div>
                            <div style={{ marginBottom: '14px' }}>
                              <CreditInstallmentSelector
                                credits={credits}
                                selectedCreditId={row.selected_credit_id}
                                onCreditChange={id => {
                                  updateRow(row.id, { selected_credit_id: id, selected_installment_ids: [] })
                                  loadRowInstallments(row.id, id)
                                }}
                                installments={rowInstallments[row.id] || []}
                                selectedInstallmentIds={row.selected_installment_ids}
                                onToggle={id => updateRow(row.id, {
                                  selected_installment_ids: row.selected_installment_ids.includes(id)
                                    ? row.selected_installment_ids.filter((x: string) => x !== id)
                                    : [...row.selected_installment_ids, id]
                                })}
                                onToggleAll={() => {
                                  const all = (rowInstallments[row.id] || []).map((i: any) => i.id)
                                  updateRow(row.id, {
                                    selected_installment_ids:
                                      row.selected_installment_ids.length === all.length ? [] : all
                                  })
                                }}
                                selectedTotal={(rowInstallments[row.id] || [])
                                  .filter((i: any) => row.selected_installment_ids.includes(i.id))
                                  .reduce((s: number, i: any) => s + i.total_amount, 0)}
                                theme="light"
                              />
                            </div>
                          </>
                        )}

                        {/* Payment reference */}
                        <div style={s.classTitle}>Payment reference</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: '10px', marginBottom: '10px' }}>
                          <div style={s.field}>
                            <label style={s.lbl}>Account number {rowPartnerAccounts.length > 0 ? `(${rowPartnerAccounts.length} from partner)` : ''}</label>
                            {rowPartnerAccounts.length > 0 ? (
                              <select style={s.select}
                                value={rowPartnerAccounts.find(a => normalizeAccountNumber(a.account_number) === normalizeAccountNumber(row.account_number))?.account_number || row.account_number}
                                onChange={e => {
                                  const acc = rowPartnerAccounts.find(a => a.account_number === e.target.value)
                                  updateRow(row.id, { account_number: e.target.value, model: acc?.model || row.model })
                                }}>
                                <option value="">— Bez računa —</option>
                                {rowPartnerAccounts.map(acc => (
                                  <option key={acc.id} value={acc.account_number}>
                                    {acc.account_number}{acc.bank_name ? ` (${acc.bank_name})` : ''}{acc.is_primary ? ' ★' : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input style={s.input} value={row.account_number} onChange={e => updateRow(row.id, { account_number: e.target.value })} placeholder="265-..." />
                            )}
                          </div>
                          <div style={s.field}>
                            <label style={s.lbl}>Model</label>
                            <input style={s.input} value={row.model} onChange={e => updateRow(row.id, { model: e.target.value })} placeholder="97" />
                          </div>
                          <div style={s.field}>
                            <label style={s.lbl}>Reference number</label>
                            <input style={s.input} value={row.reference_number} onChange={e => updateRow(row.id, { reference_number: e.target.value })} placeholder="Poziv na broj" />
                          </div>
                        </div>

                        <div style={s.field}>
                          <label style={s.lbl}>Note</label>
                          <input style={s.input} value={row.note} onChange={e => updateRow(row.id, { note: e.target.value })} placeholder="Additional note..." />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                          <button style={{ fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '6px 16px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer' }}
                            onClick={() => setExpandedRow(null)}>✓ Done</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button style={{ ...s.addRowBtn, marginTop: '10px', width: '100%', padding: '10px' }} onClick={addRow}>+ Add row</button>
          </div>

          {error && (
            <div style={{ background: '#FCEBEB', border: '0.5px solid #F5A9A9', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#A32D2D', marginBottom: '12px' }}>⚠️ {error}</div>
          )}
        </div>

        <div style={s.footer}>
          <div style={{ fontSize: '12px', color: '#888' }}>
            {validRows.length} transaction{validRows.length !== 1 ? 's' : ''} ready
            {totalDebit > 0 && <span style={{ color: '#A32D2D', marginLeft: '12px' }}>Out: {totalDebit.toLocaleString()} {defaultCurrency}</span>}
            {totalCredit > 0 && <span style={{ color: '#1D9E75', marginLeft: '12px' }}>In: {totalCredit.toLocaleString()} {defaultCurrency}</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={s.btnGhost} onClick={onClose}>Cancel</button>
            <button style={{ ...s.btnPrimary, opacity: (!company || !bank || validRows.length === 0 || posting) ? 0.5 : 1 }}
              onClick={handlePost} disabled={!company || !bank || validRows.length === 0 || posting}>
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
  dialog: { background: '#fff', borderRadius: '16px', width: '1000px', maxWidth: '98vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { background: '#0a1628', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: '15px', fontWeight: '500' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: '12px', marginTop: '2px' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  body: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '1rem 1.5rem', borderTop: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f5f5f3' },
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid #e5e5e5' },
  classTitle: { fontSize: '10px', fontWeight: '500', color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px', marginTop: '4px', paddingBottom: '4px', borderBottom: '0.5px solid #e5e5e5' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  lbl: { fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  req: { color: '#E24B4A' },
  select: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  input: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none' },
  cellInput: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 7px', border: '0.5px solid #e5e5e5', borderRadius: '6px', background: '#fff', color: '#111', outline: 'none', width: '100%' },
  addRowBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '6px 14px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer' },
  allocBtn: { border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '8px 6px', background: '#f5f5f3', cursor: 'pointer', textAlign: 'center' as const },
  allocBtnActive: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}