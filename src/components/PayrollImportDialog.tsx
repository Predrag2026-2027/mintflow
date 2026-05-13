import React, { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import { getRate, convertToUSD } from '../services/currencyService'

interface Props {
  onClose: () => void
  onPosted: () => void
}

interface ParsedDeduction {
  id: string
  name: string
  amount: number
  partner_id: string
  partner_name: string
  type: 'third_party' | 'fitpass' | 'penalty'
}

interface ParsedEmployee {
  id: string
  employee_name: string
  partner_id: string
  net_salary: number
  tax_on_salary: number
  contrib_employee: number
  contrib_employer: number
  deductions: ParsedDeduction[]
  gross_salary: number
  // editable overrides
  department_id: string
  department_name: string
  dept_subcategory_id: string
  dept_subcategory_name: string
  rev_alloc_type: string
  opex_type: string
  cf_type: string
  expanded: boolean
  accepted: boolean
}

interface PayrollHeader {
  company_name: string
  period_label: string
  invoice_date: string
  payment_date: string
  tax_filing_ref: string
}

let empCounter = 0
let dedCounter = 0

// ─── PARSER ──────────────────────────────────────────────────────────────────
function parsePayrollXlsx(workbook: XLSX.WorkBook): { header: PayrollHeader; employees: ParsedEmployee[] } {
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  const getText = (row: any[]): string =>
    row.filter(v => v != null && String(v).trim()).map(v => String(v).trim()).join(' ')

  const getNum = (v: any): number => {
    if (v == null) return 0
    const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'))
    return isNaN(n) ? 0 : Math.abs(n)
  }

  // Parse header from first employee block
  const header: PayrollHeader = {
    company_name: '',
    period_label: '',
    invoice_date: '',
    payment_date: '',
    tax_filing_ref: '',
  }

  const employees: ParsedEmployee[] = []

  // Find all employee blocks — identified by pattern "NNN – Ime Prezime" in column A
  const empNameRegex = /^\d{3}\s*[–-]\s*(.+)$/

  let i = 0
  while (i < data.length) {
    const row = data[i]
    if (!row) { i++; continue }
    const cellA = row[0] != null ? String(row[0]).trim() : ''

    // Detect company header (appears before each employee)
    if (cellA && !header.company_name &&
        !cellA.match(empNameRegex) &&
        !cellA.match(/^\d/) &&
        cellA.length > 5 &&
        !cellA.includes('датум') &&
        !cellA.includes('Адреса') &&
        !cellA.includes('обрачун') &&
        !cellA.includes('Исплата')) {
      header.company_name = cellA
    }

    // Detect period label "обрачун: Team X 2026-01"
    if (cellA.startsWith('обрачун:') && !header.period_label) {
      header.period_label = cellA.replace('обрачун:', '').trim()
      header.tax_filing_ref = header.period_label
    }

    // Detect invoice date "датум обрачуна: 31.01.2026."
    if (cellA.startsWith('датум обрачуна:') && !header.invoice_date) {
      header.invoice_date = cellA.replace('датум обрачуна:', '').trim().replace(/\.$/, '')
    }

    // Detect payment date "датум исплате:" — value may be in next cell
    if (cellA.startsWith('датум исплате:') && !header.payment_date) {
      const val = row.find((v: any, idx: number) => idx > 0 && v != null)
      if (val) header.payment_date = String(val).trim().replace(/\.$/, '')
      else {
        const dateMatch = cellA.match(/(\d{1,2}\.\d{1,2}\.\d{4})/)
        if (dateMatch) header.payment_date = dateMatch[1]
      }
    }

    // Detect employee block start
    const empMatch = cellA.match(empNameRegex)
    if (empMatch) {
      const employeeName = empMatch[1].trim()
      empCounter++

      // Now scan forward within this employee block
      let net_salary = 0
      let contrib_employee = 0
      let contrib_employer = 0
      const deductions: ParsedDeduction[] = []
      let inDeductionsSection = false
      let employerContribSection = false

      let j = i + 1
      // Each block ends when next employee starts (NNN – ) or end of data
      while (j < data.length) {
        const r = data[j]
        if (!r) { j++; continue }
        const a = r[0] != null ? String(r[0]).trim() : ''
        const rowText = getText(r)

        // End of this employee block
        if (a.match(empNameRegex) && j > i + 2) break
        // Stop at next company header (repeated)
        if (a === header.company_name && j > i + 5) break

        // "порез и доприноси на терет запосленог" → contrib_employee total
        if (rowText.includes('порез и доприноси на терет запосленог')) {
          const lastNum = r.slice().reverse().find((v: any) => v != null && !isNaN(parseFloat(String(v))))
          if (lastNum) contrib_employee = getNum(lastNum)
        }

        // "нето за исплату" → net_salary (after all deductions)
        if (a === '8' && rowText.includes('нето за исплату')) {
          const lastNum = r.slice().reverse().find((v: any) => v != null && !isNaN(parseFloat(String(v))))
          if (lastNum) net_salary = getNum(lastNum)
          inDeductionsSection = false
        }

        // "обуставе" section
        if (a === '7' && rowText.includes('обуставе')) {
          inDeductionsSection = true
        }

        // Deduction lines (between "обуставе" and "нето за исплату")
        if (inDeductionsSection && a !== '7' && a !== '8') {
          const dedName = r.find((v: any, idx: number) => idx === 0 && v != null && String(v).trim() && !String(v).match(/^\d+$/) && !String(v).includes('банка'))
            || r.find((v: any, idx: number) => idx < 3 && v != null && String(v).trim().length > 3 && !String(v).match(/^[\d.,]+$/))
          const dedAmt = r.slice().reverse().find((v: any) => v != null && !isNaN(parseFloat(String(v))) && parseFloat(String(v)) > 0)

          if (dedName && dedAmt) {
            const nameStr = String(dedName).trim()
            const amt = getNum(dedAmt)
            if (amt > 0 && nameStr && !nameStr.includes('банка') && !nameStr.match(/^\d+$/)) {
              dedCounter++
              const isFitpass = nameStr.toLowerCase().includes('fitpass')
              const isPenalty = nameStr.toLowerCase().includes('penalty') || nameStr.toLowerCase().includes('казна')
              deductions.push({
                id: `ded_${dedCounter}`,
                name: nameStr,
                amount: amt,
                partner_id: '',
                partner_name: isFitpass ? '' : '',
                type: isFitpass ? 'fitpass' : isPenalty ? 'penalty' : 'third_party',
              })
            }
          }
        }

        // "доприноси на терет послодавца" section
        if (rowText.includes('доприноси на терет послодавца') && !employerContribSection) {
          const lastNum = r.slice().reverse().find((v: any) => v != null && !isNaN(parseFloat(String(v))) && parseFloat(String(v)) > 10)
          if (lastNum) {
            contrib_employer = getNum(lastNum)
            employerContribSection = true
          }
        }

        j++
      }

      // tax_on_salary = contrib_employee total - PIO - zdravstveno - nezaposlenost
      // Actually contrib_employee from row already includes tax, so we leave as-is
      // The "порез и доприноси на терет запосленог" includes BOTH tax and contributions
      // We don't split them here — user can adjust in review

      const gross = net_salary + contrib_employee + contrib_employer +
        deductions.filter(d => d.type === 'third_party').reduce((s, d) => s + d.amount, 0)

      employees.push({
        id: `emp_${empCounter}`,
        employee_name: employeeName,
        partner_id: '',
        net_salary,
        tax_on_salary: 0, // will be split by user or left as part of contrib_employee
        contrib_employee,
        contrib_employer,
        deductions,
        gross_salary: gross,
        department_id: '',
        department_name: '',
        dept_subcategory_id: '',
        dept_subcategory_name: '',
        rev_alloc_type: 'sg100',
        opex_type: 'opex',
        cf_type: 'recurring',
        expanded: true,
        accepted: true,
      })

      i = j
      continue
    }

    i++
  }

  return { header, employees }
}

// Convert Serbian date "31.01.2026." → "2026-01-31"
function parseSerDate(d: string): string {
  if (!d) return new Date().toISOString().split('T')[0]
  const m = d.replace(/\.$/, '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return d
}

// Last working day of month
function lastWorkDay(isoDate: string): string {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  while (last.getDay() === 0 || last.getDay() === 6) last.setDate(last.getDate() - 1)
  return last.toISOString().split('T')[0]
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function PayrollImportDialog({ onClose, onPosted }: Props) {
  const [step, setStep] = useState<'upload' | 'review' | 'posting' | 'done'>('upload')
  const [header, setHeader] = useState<PayrollHeader | null>(null)
  const [employees, setEmployees] = useState<ParsedEmployee[]>([])
  const [parseError, setParseError] = useState('')
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState(0)
  const [taxPartnerId, setTaxPartnerId] = useState('')
  const [taxPartnerSearch, setTaxPartnerSearch] = useState('Poreska uprava')
  const [currency, setCurrency] = useState('RSD')
  const [exchangeRate, setExchangeRate] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)
  const [companyId, setCompanyId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [companies, setCompanies] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [deptSubs, setDeptSubs] = useState<any[]>([])
  const [taxDropdown, setTaxDropdown] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const load = async () => {
      const [{ data: comp }, { data: part }, { data: dept }, { data: ds }] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('partners').select('id,name').order('name'),
        supabase.from('departments').select('id,name,sort_order').order('sort_order'),
        supabase.from('dept_subcategories').select('id,name,department_id').order('sort_order'),
      ])
      if (comp) setCompanies(comp)
      if (part) setPartners(part)
      if (dept) setDepartments(dept)
      if (ds) setDeptSubs(ds)

      // Pre-match Poreska uprava
      if (part) {
        const pu = part.find((p: any) => p.name.toLowerCase().includes('poreska uprava') || p.name.toLowerCase().includes('poreska'))
        if (pu) { setTaxPartnerId(pu.id); setTaxPartnerSearch(pu.name) }
      }
    }
    load()
  }, [])

  const handleFile = async (file: File) => {
    setParseError(''); setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const { header: h, employees: emps } = parsePayrollXlsx(wb)
      if (emps.length === 0) { setParseError('No employees found in file.'); return }

      // Try to match partners by name
      const { data: part } = await supabase.from('partners').select('id,name').order('name')
      const partList = part || []
      setPartners(partList)

      const matched = emps.map(emp => {
        const found = partList.find((p: any) =>
          p.name.toLowerCase().includes(emp.employee_name.toLowerCase().split(' ')[0]) ||
          emp.employee_name.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])
        )
        return { ...emp, partner_id: found?.id || '', partner_id_confirmed: !!found }
      })

      setHeader(h)
      setEmployees(matched as any)
      if (h.invoice_date) setDueDate(lastWorkDay(parseSerDate(h.invoice_date)))
      setStep('review')
    } catch (err: any) {
      setParseError(`Parse error: ${err.message}`)
    }
  }

  const updateEmployee = useCallback((id: string, updates: Partial<ParsedEmployee>) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
  }, [])

  const updateDeduction = (empId: string, dedId: string, updates: Partial<ParsedDeduction>) => {
    setEmployees(prev => prev.map(e => e.id === empId
      ? { ...e, deductions: e.deductions.map(d => d.id === dedId ? { ...d, ...updates } : d) }
      : e))
  }

  const fetchRate = async (payDate: string) => {
    if (currency === 'USD') { setExchangeRate('1'); return }
    setFetchingRate(true)
    try {
      const r = await getRate(currency, payDate)
      setExchangeRate(r.rate.toString())
    } catch { setExchangeRate('117') }
    setFetchingRate(false)
  }

  const toUsd = (amt: number) => {
    const r = parseFloat(exchangeRate) || 117
    return convertToUSD(amt, currency, r)
  }

  const accepted = employees.filter(e => e.accepted)
  const payDate = header ? parseSerDate(header.payment_date) : new Date().toISOString().split('T')[0]
  const invDate = header ? parseSerDate(header.invoice_date) : payDate

  const handlePost = async () => {
    if (!companyId) { alert('Please select a company.'); return }
    setStep('posting'); setProgress(0)
    const localPartners = [...partners]

    const usdRate = parseFloat(exchangeRate) || 117

    try {
      // 1. Create payroll_record
      const { data: record } = await supabase.from('payroll_records').insert({
        company_id: companyId,
        period_month: invDate.slice(0, 7),
        payment_date: payDate,
        due_date: dueDate || null,
        tax_filing_ref: header?.tax_filing_ref || null,
        currency,
        exchange_rate: usdRate,
        amount_usd: toUsd(accepted.reduce((s, e) => s + e.gross_salary, 0)),
        note: header?.period_label || null,
        status: 'posted',
      }).select().single()

      let done = 0

      for (const emp of accepted) {
        // Resolve partner
        let partnerId = emp.partner_id || null
        if (!partnerId && emp.employee_name) {
          const ex = localPartners.find(p => p.name.toLowerCase() === emp.employee_name.toLowerCase())
          if (ex) { partnerId = ex.id }
          else {
            const { data: newP } = await supabase.from('partners').insert({ name: emp.employee_name }).select().single()
            if (newP) { partnerId = newP.id; localPartners.push(newP) }
          }
        }

        // 2. Save payroll_line
        if (record?.id) {
          await supabase.from('payroll_lines').insert({
            payroll_id: record.id,
            partner_id: partnerId,
            employee_name: emp.employee_name,
            department_id: emp.department_id || null,
            department_name: emp.department_name || null,
            dept_subcategory_id: emp.dept_subcategory_id || null,
            dept_subcategory_name: emp.dept_subcategory_name || null,
            gross_salary: emp.gross_salary,
            net_salary: emp.net_salary,
            tax_on_salary: emp.tax_on_salary,
            contrib_employee: emp.contrib_employee,
            contrib_employer: emp.contrib_employer,
            deductions_third_party: emp.deductions.filter(d => d.type === 'third_party').map(d => ({ name: d.name, amount: d.amount, partner_id: d.partner_id })),
            deductions_retained: emp.deductions.filter(d => d.type !== 'third_party').map(d => ({ type: d.type, amount: d.amount })),
            rev_alloc_type: emp.rev_alloc_type,
            opex_type: emp.opex_type,
            cf_type: emp.cf_type,
          })
        }

        // 3. Net salary invoice
        if (emp.net_salary > 0) {
          await supabase.from('invoices').insert({
            company_id: companyId, partner_id: partnerId,
            invoice_date: invDate, due_date: dueDate || null,
            type: 'expense', pl_category: 'Employee and Labour', pl_subcategory: 'Net Salaries',
            department: emp.department_name || null, dept_subcategory: emp.dept_subcategory_name || null,
            expense_description: emp.employee_name,
            rev_alloc_type: emp.rev_alloc_type || 'sg100', opex_type: emp.opex_type || 'opex',
            cf_type: emp.cf_type || 'recurring', cf_frequency: 'monthly', cf_next_month_est: emp.net_salary,
            currency, amount: emp.net_salary, exchange_rate: usdRate, amount_usd: toUsd(emp.net_salary),
            pl_impact: true, status: 'unpaid',
            note: `Payroll ${invDate.slice(0,7)} — Net salary — ${emp.employee_name}`,
          })
        }

        // 4. Third-party deduction invoices
        for (const ded of emp.deductions.filter(d => d.type === 'third_party')) {
          let dedPartnerId = ded.partner_id || null
          if (!dedPartnerId && ded.partner_name) {
            const ex = localPartners.find(p => p.name.toLowerCase() === ded.partner_name.toLowerCase())
            if (ex) { dedPartnerId = ex.id }
          }
          await supabase.from('invoices').insert({
            company_id: companyId, partner_id: dedPartnerId,
            invoice_date: invDate, due_date: dueDate || null,
            type: 'expense', pl_category: 'Employee and Labour', pl_subcategory: 'Net Salaries',
            department: emp.department_name || null, dept_subcategory: emp.dept_subcategory_name || null,
            expense_description: emp.employee_name,
            rev_alloc_type: emp.rev_alloc_type || 'sg100', opex_type: emp.opex_type || 'opex',
            cf_type: emp.cf_type || 'recurring', cf_frequency: 'monthly', cf_next_month_est: ded.amount,
            currency, amount: ded.amount, exchange_rate: usdRate, amount_usd: toUsd(ded.amount),
            pl_impact: true, status: 'unpaid',
            note: `Payroll ${invDate.slice(0,7)} — Deduction: ${ded.name} — ${emp.employee_name}`,
          })
        }

        // 5. Retained deductions — storno transactions
        for (const ded of emp.deductions.filter(d => d.type !== 'third_party')) {
          const isFitpass = ded.type === 'fitpass'
          await supabase.from('transactions').insert({
            company_id: companyId, partner_id: null,
            transaction_date: payDate, type: 'direct', tx_subtype: 'expense',
            currency, amount: -ded.amount, exchange_rate: usdRate, amount_usd: -toUsd(ded.amount),
            pl_impact: true,
            pl_category: isFitpass ? 'Employee and Labour' : 'General Business Expenses',
            pl_subcategory: isFitpass ? 'FitPass expenses' : 'Penalty, fines and other forced fees',
            department: isFitpass ? 'General Business Expenses' : 'General Business Expenses',
            dept_subcategory: isFitpass ? 'Labour related expenses' : 'General expenses',
            expense_description: isFitpass ? 'FitPass expenses' : 'Penalty, fines and other forced fees',
            rev_alloc_type: 'sg100', opex_type: 'opex',
            note: `Payroll ${invDate.slice(0,7)} — Storno: ${ded.name} — ${emp.employee_name}`,
            status: 'posted',
          })
        }

        done++
        setProgress(Math.round((done / accepted.length) * 80))
      }

      // 6. Tax & contributions invoice (single, combined)
      const totalContribEmp = accepted.reduce((s, e) => s + e.contrib_employee, 0)
      const totalContribEmpr = accepted.reduce((s, e) => s + e.contrib_employer, 0)
      const totalTax = accepted.reduce((s, e) => s + e.tax_on_salary, 0)
      const totalObl = totalContribEmp + totalContribEmpr + totalTax

      if (totalObl > 0) {
        await supabase.from('invoices').insert({
          company_id: companyId, partner_id: taxPartnerId || null,
          invoice_date: invDate, due_date: dueDate || null,
          type: 'expense', pl_category: 'Employee and Labour', pl_subcategory: 'Tax on salary',
          expense_description: `Tax & contributions — ${header?.tax_filing_ref || invDate.slice(0,7)}`,
          rev_alloc_type: 'sg100', opex_type: 'opex',
          cf_type: 'recurring', cf_frequency: 'monthly', cf_next_month_est: totalObl,
          currency, amount: totalObl, exchange_rate: usdRate, amount_usd: toUsd(totalObl),
          pl_impact: true, status: 'unpaid',
          note: `Payroll ${invDate.slice(0,7)} — Tax+EE contrib ${totalContribEmp.toFixed(0)} + ER contrib ${totalContribEmpr.toFixed(0)}`,
        })
      }

      setProgress(100)
      setTimeout(() => { onPosted(); onClose() }, 1000)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
      setStep('review')
    }
  }

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const totalNet = accepted.reduce((s, e) => s + e.net_salary, 0)
  const totalContribEmp = accepted.reduce((s, e) => s + e.contrib_employee, 0)
  const totalContribEmpr = accepted.reduce((s, e) => s + e.contrib_employer, 0)
  const totalGross = accepted.reduce((s, e) => s + e.gross_salary, 0)
  const totalThird = accepted.reduce((s, e) => s + e.deductions.filter(d => d.type === 'third_party').reduce((ss, d) => ss + d.amount, 0), 0)
  const totalRetained = accepted.reduce((s, e) => s + e.deductions.filter(d => d.type !== 'third_party').reduce((ss, d) => ss + d.amount, 0), 0)

  if (step === 'posting') return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, alignItems: 'center', justifyContent: 'center', gap: '20px', minHeight: '260px' }}>
        <div style={{ fontSize: '14px', color: '#7A9BB8' }}>Posting payroll... {progress}%</div>
        <div style={{ width: '320px', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: '#00D47E', transition: 'width 0.4s' }} />
        </div>
      </div>
    </div>
  )

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={s.headerIcon}>📊</div>
            <div>
              <div style={s.headerTitle}>Payroll import — from Excel</div>
              <div style={s.headerSub}>
                {step === 'upload' ? 'Upload isplatnih listića' : `${employees.length} employees parsed · ${accepted.length} accepted`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={s.logoBadge}>Mintflow</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>

        <div style={s.body}>

          {/* ── UPLOAD ── */}
          {step === 'upload' && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Upload Excel file (isplatni listići)</div>
              <div style={s.dropZone}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📂</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#DCE9F6', marginBottom: '6px' }}>
                  {fileName || 'Drop Excel file or click to browse'}
                </div>
                <div style={{ fontSize: '12px', color: '#7A9BB8' }}>
                  Format: Obracun zarada — MMP software export (.xlsx)
                </div>
              </div>
              {parseError && (
                <div style={{ marginTop: '12px', background: 'rgba(255,91,90,0.1)', border: '1px solid rgba(255,91,90,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#FF5B5A', fontSize: '13px' }}>
                  ⚠️ {parseError}
                </div>
              )}
            </div>
          )}

          {/* ── REVIEW ── */}
          {step === 'review' && header && (
            <>
              {/* Filing info + settings */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Filing & posting settings</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div style={s.field}>
                    <label style={s.lbl}>Company <span style={s.req}>*</span></label>
                    <select style={s.select} value={companyId} onChange={e => setCompanyId(e.target.value)}>
                      <option value="">Select company...</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Invoice due date</label>
                    <input type="date" style={s.input} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Currency</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select style={{ ...s.select, flex: 1 }} value={currency} onChange={e => setCurrency(e.target.value)}>
                        {['RSD','EUR','USD'].map(c => <option key={c}>{c}</option>)}
                      </select>
                      {currency !== 'USD' && (
                        <button style={s.fetchBtn} onClick={() => fetchRate(payDate)} disabled={fetchingRate}>
                          {fetchingRate ? '...' : 'Fetch'}
                        </button>
                      )}
                    </div>
                    {exchangeRate && <div style={{ fontSize: '10px', color: '#7A9BB8', marginTop: '3px' }}>Rate: {exchangeRate}</div>}
                  </div>
                </div>
                <div style={s.grid2}>
                  <div style={s.field}>
                    <label style={s.lbl}>Tax authority partner (for tax invoice)</label>
                    <div style={{ position: 'relative' }}>
                      <input style={{ ...s.input, border: taxPartnerId ? '1.5px solid #00D47E' : undefined }}
                        value={taxPartnerSearch}
                        onChange={e => { setTaxPartnerSearch(e.target.value); setTaxPartnerId(''); setTaxDropdown(true) }}
                        onFocus={() => setTaxDropdown(true)}
                        onBlur={() => setTimeout(() => setTaxDropdown(false), 150)}
                        placeholder="e.g. Poreska uprava..." />
                      {taxPartnerId && <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#00D47E', fontSize: '12px' }}>✓</span>}
                      {taxDropdown && taxPartnerSearch && (
                        <div style={s.dropdown}>
                          {partners.filter(p => p.name.toLowerCase().includes(taxPartnerSearch.toLowerCase())).slice(0, 8).map(p => (
                            <div key={p.id} style={s.dropdownItem}
                              onMouseDown={() => { setTaxPartnerId(p.id); setTaxPartnerSearch(p.name); setTaxDropdown(false) }}>
                              {p.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Parsed filing info</label>
                    <div style={{ fontSize: '12px', color: '#7A9BB8', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div><strong style={{ color: '#DCE9F6' }}>{header.company_name}</strong></div>
                      <div>{header.period_label}</div>
                      <div>Invoice date: {header.invoice_date} · Payment: {header.payment_date}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary totals */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Summary — {accepted.length} of {employees.length} accepted</div>
                <div style={s.summaryGrid}>
                  {[
                    { label: 'Net salaries', val: totalNet, color: '#00D47E', tag: 'invoices' },
                    { label: 'Third-party deductions', val: totalThird, color: '#4EA8FF', tag: 'invoices' },
                    { label: 'Retained storno', val: totalRetained, color: '#FF5B5A', tag: 'storno' },
                    { label: 'Contrib. employee (tax+EE)', val: totalContribEmp, color: '#F5A623', tag: 'tax inv.' },
                    { label: 'Contrib. employer (ER)', val: totalContribEmpr, color: '#F5A623', tag: 'tax inv.' },
                    { label: 'GROSS total', val: totalGross, color: '#DCE9F6', tag: '' },
                  ].map(row => (
                    <div key={row.label} style={s.summaryRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#7A9BB8' }}>{row.label}</span>
                        {row.tag && <span style={{ fontSize: '10px', color: row.color, background: `${row.color}18`, padding: '1px 6px', borderRadius: '20px' }}>{row.tag}</span>}
                      </div>
                      <span style={{ fontWeight: '600', color: row.color, fontSize: '13px' }}>
                        {row.val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Employee cards */}
              <div style={s.section}>
                <div style={s.sectionTitle}>
                  <span>Employees</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={s.smallBtn} onClick={() => setEmployees(prev => prev.map(e => ({ ...e, accepted: true })))}>✓ Accept all</button>
                    <button style={{ ...s.smallBtn, color: '#FF5B5A', borderColor: 'rgba(255,91,90,0.3)' }} onClick={() => setEmployees(prev => prev.map(e => ({ ...e, accepted: false })))}>✕ Reject all</button>
                  </div>
                </div>

                {employees.map((emp, idx) => {
                  const empDeptSubs = deptSubs.filter(d => d.department_id === emp.department_id)
                  const empGross = emp.net_salary + emp.contrib_employee + emp.contrib_employer +
                    emp.deductions.filter(d => d.type === 'third_party').reduce((s, d) => s + d.amount, 0)

                  return (
                    <div key={emp.id} style={{ ...s.empCard, opacity: emp.accepted ? 1 : 0.45, borderColor: emp.accepted ? 'rgba(255,255,255,0.08)' : 'rgba(255,91,90,0.3)' }}>
                      {/* Card header */}
                      <div style={s.empCardHeader} onClick={() => updateEmployee(emp.id, { expanded: !emp.expanded })}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                          <div style={s.empIdx}>{idx + 1}</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#DCE9F6' }}>{emp.employee_name}</div>
                            <div style={{ fontSize: '11px', color: emp.partner_id ? '#00D47E' : '#F5A623', marginTop: '2px' }}>
                              {emp.partner_id ? '✓ Partner matched' : '⚠ Partner not matched — will create'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#00D47E' }}>{empGross.toLocaleString('en-US', { maximumFractionDigits: 0 })} {currency}</span>
                          <button style={{ ...s.acceptBtn, background: emp.accepted ? 'rgba(0,212,126,0.15)' : 'rgba(255,91,90,0.12)', color: emp.accepted ? '#00D47E' : '#FF5B5A', borderColor: emp.accepted ? 'rgba(0,212,126,0.4)' : 'rgba(255,91,90,0.4)' }}
                            onClick={e => { e.stopPropagation(); updateEmployee(emp.id, { accepted: !emp.accepted }) }}>
                            {emp.accepted ? '✓ Accept' : '✕ Reject'}
                          </button>
                          <span style={{ fontSize: '11px', color: '#7A9BB8' }}>{emp.expanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {emp.expanded && (
                        <div style={s.empBody}>
                          {/* Partner match */}
                          <div style={s.grid2}>
                            <div style={s.field}>
                              <label style={s.lbl}>Partner (employee)</label>
                              <div style={{ position: 'relative' }}>
                                <input style={{ ...s.input, border: emp.partner_id ? '1.5px solid #00D47E' : '1px solid rgba(245,166,35,0.5)' }}
                                  value={emp.partner_id ? emp.employee_name : (emp as any).partnerSearch ?? emp.employee_name}
                                  onChange={e => updateEmployee(emp.id, { partner_id: '', employee_name: e.target.value } as any)}
                                  placeholder="Search partner..."
                                />
                                {!(emp as any).partner_id && (
                                  <div style={s.dropdown}>
                                    {partners.filter(p => p.name.toLowerCase().includes(emp.employee_name.toLowerCase().slice(0, 4))).slice(0, 6).map(p => (
                                      <div key={p.id} style={s.dropdownItem}
                                        onMouseDown={e => { e.preventDefault(); updateEmployee(emp.id, { partner_id: p.id, employee_name: p.name } as any) }}>
                                        {p.name}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={s.field}>
                              <label style={s.lbl}>Department</label>
                              <select style={s.select} value={emp.department_id}
                                onChange={e => { const d = departments.find(x => x.id === e.target.value); updateEmployee(emp.id, { department_id: e.target.value, department_name: d?.name || '', dept_subcategory_id: '', dept_subcategory_name: '' }) }}>
                                <option value="">Select department...</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                            </div>
                          </div>
                          {emp.department_id && (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={s.field}>
                                <label style={s.lbl}>Dept. subcategory</label>
                                <select style={s.select} value={emp.dept_subcategory_id}
                                  onChange={e => { const d = deptSubs.find(x => x.id === e.target.value); updateEmployee(emp.id, { dept_subcategory_id: e.target.value, dept_subcategory_name: d?.name || '' }) }}>
                                  <option value="">Select subcategory...</option>
                                  {empDeptSubs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                              </div>
                            </div>
                          )}

                          {/* Salary components (read-only parsed values) */}
                          <div style={s.empSection}>Parsed salary data</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '10px' }}>
                            {[
                              { label: 'Net salary', val: emp.net_salary, color: '#00D47E' },
                              { label: 'Tax + contrib EE', val: emp.contrib_employee, color: '#F5A623' },
                              { label: 'Contrib. employer', val: emp.contrib_employer, color: '#F5A623' },
                            ].map(item => (
                              <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: '10px', color: '#7A9BB8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{item.label}</div>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: item.color }}>{item.val.toLocaleString('en-US', { maximumFractionDigits: 2 })} {currency}</div>
                              </div>
                            ))}
                          </div>

                          {/* Deductions */}
                          {emp.deductions.length > 0 && (
                            <>
                              <div style={s.empSection}>Deductions</div>
                              {emp.deductions.map(ded => (
                                <div key={ded.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' as const }}>
                                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: ded.type === 'fitpass' ? 'rgba(78,168,255,0.12)' : ded.type === 'penalty' ? 'rgba(255,91,90,0.12)' : 'rgba(0,212,126,0.10)', color: ded.type === 'fitpass' ? '#4EA8FF' : ded.type === 'penalty' ? '#FF5B5A' : '#00D47E' }}>
                                    {ded.type === 'fitpass' ? '🏋️ FitPass' : ded.type === 'penalty' ? '⚠️ Penalty' : '→ Third party'}
                                  </span>
                                  <span style={{ fontSize: '12px', color: '#DCE9F6', flex: 1 }}>{ded.name}</span>
                                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#DCE9F6' }}>{ded.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} {currency}</span>
                                  {ded.type === 'third_party' && (
                                    <div style={{ position: 'relative', minWidth: '160px' }}>
                                      <input style={{ ...s.input, fontSize: '11px', padding: '5px 8px', border: ded.partner_id ? '1.5px solid #00D47E' : undefined }}
                                        value={ded.partner_name}
                                        onChange={e => updateDeduction(emp.id, ded.id, { partner_name: e.target.value, partner_id: '' })}
                                        placeholder="Partner (payee)" />
                                      {ded.partner_name && !ded.partner_id && (
                                        <div style={{ ...s.dropdown, zIndex: 400 }}>
                                          {partners.filter(p => p.name.toLowerCase().includes(ded.partner_name.toLowerCase())).slice(0, 5).map(p => (
                                            <div key={p.id} style={s.dropdownItem}
                                              onMouseDown={e => { e.preventDefault(); updateDeduction(emp.id, ded.id, { partner_id: p.id, partner_name: p.name }) }}>
                                              {p.name}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </>
                          )}

                          {/* P&L allocation */}
                          <div style={s.empSection}>P&L allocation</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
                            {[{ id: 'sg100', label: '100% SG' }, { id: 'af100', label: '100% AF' }, { id: 'shared', label: '50/50' }].map(a => (
                              <div key={a.id} style={{ padding: '5px 12px', border: emp.rev_alloc_type === a.id ? '2px solid #00D47E' : '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', fontWeight: '500', color: emp.rev_alloc_type === a.id ? '#00D47E' : '#7A9BB8', background: emp.rev_alloc_type === a.id ? 'rgba(0,212,126,0.08)' : 'transparent' }}
                                onClick={() => updateEmployee(emp.id, { rev_alloc_type: a.id })}>
                                {a.label}
                              </div>
                            ))}
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
          <div style={{ fontSize: '12px', color: '#7A9BB8' }}>
            {step === 'review' && `${accepted.length} employees · Gross: ${totalGross.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={s.btnGhost} onClick={step === 'upload' ? onClose : () => setStep('upload')}>
              {step === 'upload' ? 'Cancel' : '← Back'}
            </button>
            {step === 'review' && (
              <button style={{ ...s.btnPrimary, opacity: (!companyId || accepted.length === 0) ? 0.5 : 1 }}
                onClick={handlePost} disabled={!companyId || accepted.length === 0}>
                📊 Post {accepted.length} employees
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  dialog: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', width: '940px', maxWidth: '97vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { background: '#060E1A', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  headerIcon: { fontSize: '20px', width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(0,212,126,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#DCE9F6', fontSize: '15px', fontWeight: '600' },
  headerSub: { color: '#7A9BB8', fontSize: '12px', marginTop: '2px' },
  logoBadge: { color: '#00D47E', fontFamily: 'Georgia,serif', fontSize: '13px' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 },
  body: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#060E1A' },
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '10px', fontWeight: '600', color: '#7A9BB8', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  lbl: { fontSize: '10px', fontWeight: '500', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  req: { color: '#FF5B5A' },
  select: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: '#111F30', color: '#DCE9F6', outline: 'none' },
  input: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: '#111F30', color: '#DCE9F6', outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  fetchBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '8px 10px', border: '1px solid rgba(0,212,126,0.3)', borderRadius: '8px', background: 'rgba(0,212,126,0.08)', color: '#00D47E', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  dropZone: { border: '2px dashed rgba(255,255,255,0.12)', borderRadius: '12px', padding: '3rem', textAlign: 'center' as const, cursor: 'pointer', background: 'rgba(255,255,255,0.02)' },
  dropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#111F30', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxHeight: '200px', overflowY: 'auto' as const, marginTop: '2px' },
  dropdownItem: { padding: '8px 12px', fontSize: '13px', color: '#DCE9F6', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  summaryGrid: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', overflow: 'hidden' },
  summaryRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  empCard: { border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0D1B2C', marginBottom: '8px', overflow: 'hidden' },
  empCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', background: '#111F30' },
  empIdx: { width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,212,126,0.15)', color: '#00D47E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  empBody: { padding: '14px 16px' },
  empSection: { fontSize: '10px', fontWeight: '600', color: '#7A9BB8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px', marginTop: '12px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  acceptBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', fontWeight: '600', padding: '4px 12px', borderRadius: '20px', border: '1.5px solid', cursor: 'pointer', background: 'transparent' },
  smallBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '3px 10px', border: '1px solid rgba(0,212,126,0.3)', borderRadius: '6px', background: 'rgba(0,212,126,0.06)', color: '#00D47E', cursor: 'pointer' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#7A9BB8', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#00D47E', color: '#060E1A', cursor: 'pointer', fontWeight: '600' },
}