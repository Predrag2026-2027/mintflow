import React, { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../supabase'
import * as XLSX from 'xlsx'
import { getRate, convertToUSD } from '../services/currencyService'

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
  source_format: 'raiffeisen' | 'truist' | 'boa' | 'amex' | 'wio'
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
  override_tx_type: 'direct' | 'invoice_payment' | 'passthrough'
  override_tx_subtype: 'expense' | 'revenue'
  override_pt_direction: 'in' | 'out'
  override_pt_period: string
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
  override_aimfox_val: string
  override_sg_val: string
  override_opex_type: string
  override_opex_val: string
  override_performance_val: string
  override_partner_name: string
  override_note: string
}

const PAYMENT_METHODS = ['Wire transfer', 'ACH transfer', 'Cash', 'Check', 'Credit card', 'Direct debit', 'Other']
const REVENUE_STREAMS = ['Social Growth', 'Aimfox', 'Outsourced Services', 'VAT Claimed', 'Interest Received', 'Loans', 'Credit', 'Other']

function detectFormat(content: string, fileName: string): 'raiffeisen' | 'truist' | 'boa' | 'amex' | 'wio' | 'unknown' {
  if (fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')) return 'amex'
  const firstLine = content.split('\n')[0] || ''
  if (firstLine.includes('Account name') && firstLine.includes('Account IBAN') && firstLine.includes('Transaction type')) return 'wio'
  if (firstLine.includes('Br. ra') || firstLine.includes('Datum obrade') || firstLine.startsWith('265-') || firstLine.startsWith('160-') || firstLine.startsWith('170-')) return 'raiffeisen'
  if (firstLine.includes('Posted Date') && firstLine.includes('Transaction Date') && firstLine.includes('Merchant name')) return 'truist'
  if (firstLine.includes('Description') && firstLine.includes('Summary Amt')) return 'boa'
  return 'unknown'
}

function parseRaiffeisen(content: string): ParsedRow[] {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const rows: ParsedRow[] = []
  lines.slice(1).forEach((line, index) => {
    if (!line.trim()) return
    const cols = line.split('#')
    if (cols.length < 13) return
    const parseAmt = (s: string): number | null => {
      if (!s || !s.trim()) return null
      const v = parseFloat(s.trim().replace(/\./g, '').replace(',', '.'))
      return isNaN(v) ? null : v
    }
    const debit = parseAmt(cols[5])
    const credit = parseAmt(cols[6])
    if (debit === null && credit === null) return
    rows.push({
      id: `row_${index}`, source_format: 'raiffeisen',
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

function parseTruist(content: string): ParsedRow[] {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const rows: ParsedRow[] = []
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes }
      else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = '' }
      else { current += line[i] }
    }
    result.push(current.trim())
    return result
  }
  lines.slice(1).forEach((line, index) => {
    if (!line.trim()) return
    const cols = parseCSVLine(line)
    if (cols.length < 9) return
    const type = cols[2]?.trim().toLowerCase()
    const rawAmount = parseFloat(cols[8]?.replace(/[,$]/g, '') || '0') || 0
    if (rawAmount === 0) return
    const isExpense = type === 'debit' || type === 'pos'
    const debit = isExpense ? rawAmount : null
    const credit = isExpense ? null : rawAmount
    const rawDate = cols[1]?.trim() || cols[0]?.trim() || ''
    const dateParts = rawDate.split('/')
    const date = dateParts.length === 3 ? `${dateParts[1]}.${dateParts[0]}.${dateParts[2]}` : rawDate
    rows.push({
      id: `row_${index}`, source_format: 'truist',
      date, statement_number: '', currency: 'USD',
      debit, credit,
      partner_name: cols[5]?.trim() || '',
      description: cols[4]?.trim() || '',
      reference_number: cols[3]?.trim() || '',
      model: '', account_number: '',
    })
  })
  return rows
}

function parseBOA(content: string): ParsedRow[] {
  const lines = content.split('\n').filter(l => l.trim())
  const rows: ParsedRow[] = []
  let dataStart = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Date,') && lines[i].includes('Description') && lines[i].includes('Amount')) {
      dataStart = i + 1; break
    }
  }
  if (dataStart === 0) return []
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes }
      else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = '' }
      else { current += line[i] }
    }
    result.push(current.trim())
    return result
  }
  lines.slice(dataStart).forEach((line, index) => {
    if (!line.trim()) return
    const cols = parseCSVLine(line)
    if (cols.length < 3) return
    const rawDate = cols[0]?.trim() || ''
    const description = cols[1]?.trim() || ''
    const rawAmount = parseFloat(cols[2]?.replace(/[,$]/g, '') || '0') || 0
    if (rawAmount === 0) return
    if (description.toLowerCase().includes('beginning balance') || description.toLowerCase().includes('ending balance')) return
    const debit = rawAmount < 0 ? Math.abs(rawAmount) : null
    const credit = rawAmount > 0 ? rawAmount : null
    const dateParts = rawDate.split('/')
    const date = dateParts.length === 3 ? `${dateParts[1]}.${dateParts[0]}.${dateParts[2]}` : rawDate
    let partnerName = description
    if (description.includes('WIRE TYPE:')) {
      const bnfMatch = description.match(/BNF:([^I]+?)(?:\s+ID:|$)/)
      if (bnfMatch) partnerName = bnfMatch[1].trim()
    } else if (description.includes(' DES:')) {
      partnerName = description.split(' DES:')[0].trim()
    }
    rows.push({
      id: `row_${index}`, source_format: 'boa',
      date, statement_number: '', currency: 'USD',
      debit, credit,
      partner_name: partnerName.slice(0, 60),
      description: description.slice(0, 200),
      reference_number: '', model: '', account_number: '',
    })
  })
  return rows
}

function parseAmex(workbook: XLSX.WorkBook): ParsedRow[] {
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const rows: ParsedRow[] = []
  let headerRow = -1
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (row[0] === 'Date' && row[2] === 'Description' && row[3] === 'Amount') { headerRow = i; break }
  }
  if (headerRow === -1) return []
  data.slice(headerRow + 1).forEach((row, index) => {
    if (!row[0] || !row[3]) return
    const rawAmount = typeof row[3] === 'number' ? row[3] : parseFloat(String(row[3]).replace(/[,$]/g, '') || '0')
    if (isNaN(rawAmount) || rawAmount === 0) return
    const isPayment = String(row[2] || '').toLowerCase().includes('payment') && rawAmount < 0
    if (isPayment) return
    const debit = rawAmount > 0 ? rawAmount : null
    const credit = rawAmount < 0 ? Math.abs(rawAmount) : null
    const rawDate = String(row[0] || '')
    const dateParts = rawDate.split('/')
    const date = dateParts.length === 3 ? `${dateParts[1]}.${dateParts[0]}.${dateParts[2]}` : rawDate
    const description = String(row[2] || '').trim()
    const category = String(row[11] || '').trim()
    const city = String(row[7] || '').trim()
    let partnerName = description.split(/\s{2,}/)[0].trim()
    if (city) partnerName = partnerName.replace(city, '').trim()
    rows.push({
      id: `row_${index}`, source_format: 'amex',
      date, statement_number: String(row[10] || ''), currency: 'USD',
      debit, credit,
      partner_name: partnerName.slice(0, 60),
      description: `${description}${category ? ` [${category}]` : ''}`,
      reference_number: String(row[10] || ''),
      model: '', account_number: '',
    })
  })
  return rows
}

function parseWio(content: string): ParsedRow[] {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes }
      else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = '' }
      else { current += line[i] }
    }
    result.push(current.trim())
    return result
  }
  const rows: ParsedRow[] = []
  lines.slice(1).forEach((line, index) => {
    if (!line.trim()) return
    const cols = parseCSVLine(line.replace(/\r/g, ''))
    if (cols.length < 11) return
    const currency = cols[5]?.trim() || 'AED'
    const txType = cols[6]?.trim() || ''
    const rawDate = cols[7]?.trim() || ''
    const refNum = cols[8]?.trim() || ''
    const description = cols[9]?.trim() || ''
    const rawAmount = parseFloat(cols[10]?.replace(/,/g, '') || '0') || 0
    const notes = cols[13]?.trim() || ''
    if (rawAmount === 0) return
    if (txType === 'Currency exchange') return
    const dateParts = rawDate.split('/')
    const date = dateParts.length === 3 ? `${dateParts[0]}.${dateParts[1]}.${dateParts[2]}` : rawDate
    const debit = rawAmount < 0 ? Math.abs(rawAmount) : null
    const credit = rawAmount > 0 ? rawAmount : null
    let partnerName = description
    if (description.toLowerCase().startsWith('to ')) partnerName = description.slice(3)
    else if (description.toLowerCase().startsWith('from ')) partnerName = description.slice(5)
    const fullDesc = notes && notes !== 'N/A' && notes !== description ? `${description} — ${notes}` : description
    rows.push({
      id: `row_${index}`, source_format: 'wio' as any,
      date, statement_number: refNum, currency, debit, credit,
      partner_name: partnerName.slice(0, 80),
      description: fullDesc.slice(0, 200),
      reference_number: refNum, model: '',
      account_number: cols[3]?.trim() || '',
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
    override_pt_direction: isExpense ? 'out' : 'in',
    override_pt_period: new Date().toISOString().slice(0, 7),
    override_payment_method: 'Wire transfer',
    override_linked_invoice_id: '',
    override_pl_category_id: '', override_pl_category_name: '',
    override_pl_subcategory_id: '', override_pl_subcategory_name: '',
    override_department_id: '', override_department_name: '',
    override_dept_subcategory_id: '', override_dept_subcategory_name: '',
    override_expense_description: '', override_revenue_stream: '',
    override_rev_alloc: 'sg100',
    override_aimfox_val: '', override_sg_val: '',
    override_opex_type: 'opex',
    override_opex_val: '', override_performance_val: '',
    override_partner_name: parsed.partner_name, override_note: '',
  }
}

const FORMAT_LABELS: Record<string, string> = {
  raiffeisen: '🇷🇸 Raiffeisen/Intesa',
  truist: '🇺🇸 Truist',
  boa: '🇺🇸 Bank of America',
  amex: '💳 American Express',
  wio: '🇦🇪 Wio Bank',
}

export default function BulkImport({ onClose, onImported }: Props) {
  const [step, setStep] = useState<'upload' | 'review' | 'posting' | 'done'>('upload')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [detectedFormat, setDetectedFormat] = useState<string>('')
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

  useEffect(() => {
    if (!company) return
    const fetchInvoices = async () => {
      const { data } = await supabase.from('v_invoice_status').select('*').eq('company_id', company)
        .in('calculated_status', ['unpaid', 'partial']).order('due_date', { ascending: true })
      if (data) setOpenInvoices(data)
    }
    fetchInvoices()
  }, [company])

  const getPlSubs = (catId: string) => plSubcategories.filter(s => s.category_id === catId)
  const getDeptSubs = (deptId: string) => deptSubcategories.filter(s => s.department_id === deptId)
  const getExpDescs = (subId: string) => expenseDescriptions.filter(e => e.dept_subcategory_id === subId)

  const handleFile = async (file: File) => {
    setParseError('')
    setFileName(file.name)
    setDetectedFormat('')
    try {
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const parsed = parseAmex(workbook)
        if (parsed.length === 0) { setParseError('Could not parse Amex file.'); return }
        setDetectedFormat('amex')
        setRows(parsed.map(makeImportRow))
      } else {
        const text = await file.text()
        const format = detectFormat(text, file.name)
        if (format === 'unknown') { setParseError('Unknown file format.'); return }
        setDetectedFormat(format)
        let parsed: ParsedRow[] = []
        if (format === 'raiffeisen') parsed = parseRaiffeisen(text)
        else if (format === 'truist') parsed = parseTruist(text)
        else if (format === 'boa') parsed = parseBOA(text)
        else if (format === 'wio') parsed = parseWio(text)
        if (parsed.length === 0) { setParseError('No transactions found in file.'); return }
        setRows(parsed.map(makeImportRow))
      }
    } catch (err: any) {
      setParseError(`Failed to read file: ${err.message}`)
    }
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
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
    const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY
    const rateCache: Record<string, number> = {}
    const rowsWithRates = await Promise.all(rows.map(async (row) => {
      const { currency, date, debit, credit } = row.parsed
      if (currency === 'USD') return row
      const amount = (debit || 0) > 0 ? (debit || 0) : (credit || 0)
      if (!amount) return row
      const parts = date.split('.')
      const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date
      const cacheKey = `${currency}_${isoDate}`
      if (!rateCache[cacheKey]) {
        try {
          const rateData = await getRate(currency, isoDate)
          rateCache[cacheKey] = rateData.rate
        } catch {
          const fallbacks: Record<string, number> = { RSD: 117.4, EUR: 1.18, AED: 0.272 }
          rateCache[cacheKey] = fallbacks[currency] || 1
        }
      }
      const rate = rateCache[cacheKey]
      const amountUsd = convertToUSD(amount, currency, rate)
      return { ...row, parsed: { ...row.parsed, amount_usd: amountUsd, exchange_rate: rate } }
    }))
    setRows(rowsWithRates)
    const partnerNames = partners.map(p => p.name).join(', ')
    const batchSize = 5
    const snapshot = [...rowsWithRates]
    const result: ImportRow[] = snapshot.map(r => ({ ...r }))
    for (let i = 0; i < snapshot.length; i += batchSize) {
      const batch = snapshot.slice(i, i + batchSize)
      const batchPayload = batch.map(r => ({
        row_id: r.parsed.id, date: r.parsed.date, partner: r.parsed.partner_name,
        description: r.parsed.description, debit: r.parsed.debit, credit: r.parsed.credit,
        reference: r.parsed.reference_number,
      }))
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/ai-categorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}`, 'apikey': supabaseAnonKey || '' },
          body: JSON.stringify({ rows: batchPayload, partnerNames }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        let proposals: AIProposal[] = []
        try { proposals = JSON.parse((data.result || '[]').replace(/```json|```/g, '').trim()) } catch { proposals = [] }
        for (let j = i; j < Math.min(i + batchSize, snapshot.length); j++) {
          const proposal = proposals.find((p: any) => p.row_id === snapshot[j].parsed.id)
          if (proposal) {
            const isExpense = (snapshot[j].parsed.debit || 0) > 0
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
    const rateCache: Record<string, number> = {}
    const getAmountUsd = async (p: any, amount: number): Promise<{ amount_usd: number; exchange_rate: number | null }> => {
      if (p.currency === 'USD') return { amount_usd: amount, exchange_rate: 1 }
      if ((p as any).amount_usd) return { amount_usd: (p as any).amount_usd, exchange_rate: (p as any).exchange_rate }
      const parts = (p.date || '').split('.')
      const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : p.date
      const cacheKey = `${p.currency}_${isoDate}`
      if (!rateCache[cacheKey]) {
        try {
          const rateData = await getRate(p.currency, isoDate)
          rateCache[cacheKey] = rateData.rate
        } catch {
          const fallbacks: Record<string, number> = { RSD: 117.4, EUR: 1.18, AED: 0.272 }
          rateCache[cacheKey] = fallbacks[p.currency] || 1
        }
      }
      const rate = rateCache[cacheKey]
      return { amount_usd: convertToUSD(amount, p.currency, rate), exchange_rate: rate }
    }

    for (const row of accepted) {
      const p = row.parsed
      const isExpense = (p.debit || 0) > 0
      const amount = isExpense ? (p.debit || 0) : (p.credit || 0)
      let partnerId: string | null = null
      const nameToMatch = row.override_partner_name || p.partner_name
      if (nameToMatch) {
        const existing = localPartners.find(pt => pt.name.toLowerCase() === nameToMatch.toLowerCase())
        if (existing) { partnerId = existing.id }
        else {
          const { data: newP } = await supabase.from('partners').insert({ name: nameToMatch }).select().single()
          if (newP) { partnerId = newP.id; localPartners.push(newP) }
        }
      }
      if (row.override_tx_type === 'passthrough') {
        const { amount_usd, exchange_rate } = await getAmountUsd(p, amount)
        await supabase.from('passthrough').insert({
          company_id: company, bank_id: bank, partner_id: partnerId,
          transaction_date: formatDate(p.date), direction: row.override_pt_direction,
          period_month: row.override_pt_period || null, currency: p.currency, amount,
          exchange_rate, amount_usd, note: row.override_note || p.description || null,
          account_number: p.account_number || null, model: p.model || null,
          reference_number: p.reference_number || null, status: 'unpaired',
        })
        done++
        setProgress(Math.round((done / accepted.length) * 100))
        continue
      }
      const isDirectWithPL = row.override_tx_type === 'direct'
      const aimfoxAmount = row.override_rev_alloc === 'byval' ? (parseFloat(row.override_aimfox_val) || null) : null
      const sgAmount = row.override_rev_alloc === 'byval' ? (parseFloat(row.override_sg_val) || null) : null
      const opexAmount = row.override_opex_type === 'split' ? (parseFloat(row.override_opex_val) || null) : null
      const perfAmount = row.override_opex_type === 'split' ? (parseFloat(row.override_performance_val) || null) : null
      const { amount_usd, exchange_rate } = await getAmountUsd(p, amount)
      const { data: newTx } = await supabase.from('transactions').insert({
        company_id: company, bank_id: bank, partner_id: partnerId,
        transaction_date: formatDate(p.date), statement_number: p.statement_number || null,
        type: row.override_tx_type, tx_subtype: row.override_tx_subtype,
        payment_method: row.override_payment_method || null,
        currency: p.currency, amount, exchange_rate, amount_usd,
        pl_impact: isDirectWithPL,
        pl_category: isDirectWithPL ? (row.override_pl_category_name || null) : null,
        pl_subcategory: isDirectWithPL ? (row.override_pl_subcategory_name || null) : null,
        department: isDirectWithPL ? (row.override_department_name || null) : null,
        dept_subcategory: isDirectWithPL ? (row.override_dept_subcategory_name || null) : null,
        expense_description: isDirectWithPL ? (row.override_expense_description || null) : null,
        revenue_stream: isDirectWithPL ? (row.override_revenue_stream || null) : null,
        rev_alloc_type: row.override_rev_alloc || 'sg100',
        rev_alloc_aimfox: aimfoxAmount, rev_alloc_sg: sgAmount,
        opex_type: isDirectWithPL && row.override_tx_subtype === 'expense' ? (row.override_opex_type || 'opex') : null,
        opex_amount: opexAmount, performance_amount: perfAmount,
        account_number: p.account_number || null, model: p.model || null,
        reference_number: p.reference_number || null,
        note: row.override_note || p.description || null, status: 'posted',
      }).select().single()
      if (row.override_tx_type === 'invoice_payment' && row.override_linked_invoice_id && newTx?.id) {
        await supabase.from('invoice_transaction_links').insert({
          invoice_id: row.override_linked_invoice_id, transaction_id: newTx.id,
          allocated_amount: amount, allocated_amount_usd: p.currency === 'USD' ? amount : null,
        })
        const { data: invStatus } = await supabase.from('v_invoice_status').select('calculated_status').eq('id', row.override_linked_invoice_id).single()
        if (invStatus) await supabase.from('invoices').update({ status: invStatus.calculated_status }).eq('id', row.override_linked_invoice_id)
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

  const getTxTypeBadge = (type: string) => {
    if (type === 'direct') return { bg: '#E1F5EE', color: '#085041', label: '⚡ Direct' }
    if (type === 'passthrough') return { bg: '#FFFBEB', color: '#7A5A00', label: '🔄 Pass-through' }
    return { bg: '#E6F1FB', color: '#0C447C', label: '💳 Inv. payment' }
  }

  if (step === 'done') return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '260px' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '22px', color: '#111' }}>Import complete!</div>
        <div style={{ fontSize: '13px', color: '#888', textAlign: 'center' as const }}>
          {accepted} entr{accepted !== 1 ? 'ies' : 'y'} posted.<br />{rejected} skipped.
        </div>
        <button style={s.btnPrimary} onClick={() => { onImported(); onClose() }}>View transactions</button>
      </div>
    </div>
  )

  if (step === 'posting') return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '260px' }}>
        <div style={{ fontSize: '13px', color: '#888' }}>Posting... {progress}%</div>
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
            <div style={s.headerSub}>{step === 'upload' ? 'Supports: Raiffeisen/Intesa · Truist · Bank of America · Amex · Wio' : `${accepted} accepted · ${rejected} rejected · ${pending} pending`}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={s.body}>
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
                  <input ref={fileRef} type="file" accept=".txt,.csv,.xlsx,.xls" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
                  {fileName ? (
                    <div>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>📄</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1D9E75' }}>{fileName}</div>
                      {detectedFormat && <div style={{ fontSize: '12px', color: '#085041', marginTop: '4px', background: '#E1F5EE', padding: '3px 10px', borderRadius: '20px', display: 'inline-block' }}>{FORMAT_LABELS[detectedFormat]} detected</div>}
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>{rows.length} rows parsed — click to change</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>📂</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#111', marginBottom: '8px' }}>Drop file here or click to browse</div>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' as const }}>
                        {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                          <span key={k} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#f0f0ee', color: '#666' }}>{v}</span>
                        ))}
                      </div>
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
                    {detectedFormat && <span style={{ marginLeft: '8px', opacity: 0.8 }}>· {FORMAT_LABELS[detectedFormat]}</span>}
                  </div>
                  <div style={s.previewList}>
                    {rows.slice(0, 5).map(r => (
                      <div key={r.parsed.id} style={s.previewRow}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{r.parsed.partner_name || '—'}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{r.parsed.date} · {r.parsed.description?.slice(0, 60)}</div>
                        </div>
                        <div style={{ textAlign: 'right' as const }}>
                          {(r.parsed.debit || 0) > 0 && <div style={{ fontSize: '13px', fontWeight: '500', color: '#A32D2D' }}>-{r.parsed.debit?.toLocaleString()} {r.parsed.currency}</div>}
                          {(r.parsed.credit || 0) > 0 && <div style={{ fontSize: '13px', fontWeight: '500', color: '#1D9E75' }}>+{r.parsed.credit?.toLocaleString()} {r.parsed.currency}</div>}
                        </div>
                      </div>
                    ))}
                    {rows.length > 5 && <div style={{ padding: '8px 14px', fontSize: '12px', color: '#aaa', textAlign: 'center' as const }}>+{rows.length - 5} more rows...</div>}
                  </div>
                </div>
              )}
              {analyzing && (
                <div style={s.analyzingBox}>
                  <div style={{ fontSize: '13px', color: '#085041', marginBottom: '8px' }}>🤖 AI analyzing {rows.length} rows...</div>
                  <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${progress}%`, transition: 'width 0.5s' }} /></div>
                  <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '6px' }}>{progress}% complete</div>
                </div>
              )}
              {analyzeError && <div style={{ ...s.infoBox, background: '#FCEBEB', borderColor: '#F5A9A9', color: '#A32D2D', marginTop: '12px' }}>⚠️ {analyzeError}</div>}
            </>
          )}

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
                  const plSubs = getPlSubs(row.override_pl_category_id)
                  const deptSubs = getDeptSubs(row.override_department_id)
                  const expDescs = getExpDescs(row.override_dept_subcategory_id)
                  const linkedInvoice = openInvoices.find(i => i.id === row.override_linked_invoice_id)
                  const typeBadge = getTxTypeBadge(row.override_tx_type)

                  return (
                    <div key={p.id} style={{ ...s.reviewRow, ...(row.status === 'accepted' ? s.reviewRowAccepted : {}), ...(row.status === 'rejected' ? s.reviewRowRejected : {}), ...(row.override_tx_type === 'passthrough' ? s.reviewRowPassthrough : {}) }}>
                      <div style={s.reviewRowMain} onClick={() => toggleExpand(p.id)}>
                        <div style={{ flexShrink: 0, width: '14px', fontSize: '11px', color: '#bbb' }}>{isExpanded ? '▼' : '▶'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{row.override_partner_name || p.partner_name || '—'}</span>
                            {conf && row.proposal && <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: conf.bg, color: conf.color }}>{row.proposal.confidence}</span>}
                            <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: typeBadge.bg, color: typeBadge.color }}>{typeBadge.label}</span>
                            <span style={{ fontSize: '10px', color: '#aaa' }}>{FORMAT_LABELS[p.source_format]}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{p.date} · {p.description?.slice(0, 65)}{(p.description?.length || 0) > 65 ? '...' : ''}</div>
                          {row.override_tx_type === 'direct' && row.override_pl_category_name && (
                            <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '2px' }}>📊 {row.override_pl_category_name}{row.override_department_name ? ` · ${row.override_department_name}` : ''}</div>
                          )}
                          {row.override_tx_type === 'invoice_payment' && (
                            <div style={{ fontSize: '11px', color: '#0C447C', marginTop: '2px' }}>
                              💳 Cash flow only{linkedInvoice ? ` · Closes: ${linkedInvoice.partner_name || '—'}` : ' · No invoice linked'}
                            </div>
                          )}
                          {row.override_tx_type === 'passthrough' && (
                            <div style={{ fontSize: '11px', color: '#7A5A00', marginTop: '2px' }}>
                              🔄 {row.override_pt_direction === 'in' ? '📥 IN' : '📤 OUT'} · Period: {row.override_pt_period || '—'}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' as const, flexShrink: 0, marginRight: '10px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: isExpense ? '#A32D2D' : '#1D9E75' }}>{isExpense ? '-' : '+'}{amount?.toLocaleString()} {p.currency}</div>
                          <div style={{ fontSize: '10px', color: '#aaa' }}>{p.statement_number ? `Izvod #${p.statement_number}` : p.date}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button style={{ ...s.actionBtn, ...(row.status === 'accepted' ? s.actionBtnAccepted : {}) }} onClick={() => acceptRow(p.id)}>✓</button>
                          <button style={{ ...s.actionBtn, ...(row.status === 'rejected' ? s.actionBtnRejected : {}) }} onClick={() => rejectRow(p.id)}>✕</button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={s.editPanel}>
                          {row.proposal && <div style={s.aiNotes}>🤖 AI: {row.proposal.notes}</div>}

                          <div style={s.editGrid2}>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Partner</label>
                              <input style={s.editInput} value={row.override_partner_name} onChange={e => updateRow(p.id, { override_partner_name: e.target.value })} />
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
                                <option value="passthrough">🔄 Pass-through (transit)</option>
                              </select>
                            </div>
                          </div>

                          {row.override_tx_type === 'passthrough' && (
                            <>
                              <div style={s.editSectionTitle}>Pass-through details</div>
                              <div style={s.editGrid2}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Smer</label>
                                  <select style={s.editSelect} value={row.override_pt_direction}
                                    onChange={e => updateRow(p.id, { override_pt_direction: e.target.value as 'in' | 'out' })}>
                                    <option value="in">📥 IN — Uplata</option>
                                    <option value="out">📤 OUT — Isplata</option>
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Period (mesec)</label>
                                  <input type="month" style={s.editInput} value={row.override_pt_period}
                                    onChange={e => updateRow(p.id, { override_pt_period: e.target.value })} />
                                </div>
                              </div>
                              <div style={{ marginTop: '8px' }}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Napomena</label>
                                  <input style={s.editInput} value={row.override_note}
                                    onChange={e => updateRow(p.id, { override_note: e.target.value })}
                                    placeholder={p.description?.slice(0, 40)} />
                                </div>
                              </div>
                            </>
                          )}

                          {row.override_tx_type !== 'passthrough' && (
                            <div style={{ ...s.editGrid2, marginTop: '8px' }}>
                              <div style={s.editField}>
                                <label style={s.editLbl}>Subtype</label>
                                <select style={s.editSelect} value={row.override_tx_subtype} onChange={e => updateRow(p.id, { override_tx_subtype: e.target.value as any })}>
                                  <option value="expense">📤 Expense</option>
                                  <option value="revenue">📥 Revenue</option>
                                </select>
                              </div>
                              <div style={s.editField}>
                                <label style={s.editLbl}>Note</label>
                                <input style={s.editInput} value={row.override_note} onChange={e => updateRow(p.id, { override_note: e.target.value })} placeholder={p.description?.slice(0, 40)} />
                              </div>
                            </div>
                          )}

                          {row.override_tx_type === 'invoice_payment' && (
                            <>
                              <div style={s.editSectionTitle}>Payment details</div>
                              <div style={s.editGrid2}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Payment method</label>
                                  <select style={s.editSelect} value={row.override_payment_method} onChange={e => updateRow(p.id, { override_payment_method: e.target.value })}>
                                    {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Link to open invoice</label>
                                  <select style={s.editSelect} value={row.override_linked_invoice_id} onChange={e => updateRow(p.id, { override_linked_invoice_id: e.target.value })}>
                                    <option value="">— No invoice (standalone) —</option>
                                    {openInvoices.map(inv => (
                                      <option key={inv.id} value={inv.id}>{inv.partner_name || '—'}{inv.invoice_number ? ` · ${inv.invoice_number}` : ''} · ${(inv.remaining_usd || 0).toFixed(0)} rem.</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              {linkedInvoice && (
                                <div style={{ ...s.aiNotes, background: '#E6F1FB', borderColor: '#7FB8EE', color: '#0C447C', marginTop: '8px' }}>
                                  💳 Will close: <strong>{linkedInvoice.partner_name}</strong>{linkedInvoice.invoice_number ? ` · ${linkedInvoice.invoice_number}` : ''} · Remaining: <strong>${(linkedInvoice.remaining_usd || 0).toFixed(2)}</strong>
                                </div>
                              )}
                            </>
                          )}

                          {row.override_tx_type === 'direct' && row.override_tx_subtype === 'expense' && (
                            <>
                              <div style={s.editSectionTitle}>P&L Classification</div>
                              <div style={s.editGrid2}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Category</label>
                                  <select style={s.editSelect} value={row.override_pl_category_id}
                                    onChange={e => { const c = plCategories.find(x => x.id === e.target.value); updateRow(p.id, { override_pl_category_id: e.target.value, override_pl_category_name: c?.name || '', override_pl_subcategory_id: '', override_pl_subcategory_name: '' }) }}>
                                    <option value="">Select category...</option>
                                    {plCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Sub-category</label>
                                  <select style={s.editSelect} value={row.override_pl_subcategory_id}
                                    onChange={e => { const sub = plSubcategories.find(x => x.id === e.target.value); updateRow(p.id, { override_pl_subcategory_id: e.target.value, override_pl_subcategory_name: sub?.name || '' }) }}
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
                                    onChange={e => { const d = departments.find(x => x.id === e.target.value); updateRow(p.id, { override_department_id: e.target.value, override_department_name: d?.name || '', override_dept_subcategory_id: '', override_dept_subcategory_name: '', override_expense_description: '' }) }}>
                                    <option value="">Select department...</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                                </div>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Dept. Sub-category</label>
                                  <select style={s.editSelect} value={row.override_dept_subcategory_id}
                                    onChange={e => { const sub = deptSubcategories.find(x => x.id === e.target.value); updateRow(p.id, { override_dept_subcategory_id: e.target.value, override_dept_subcategory_name: sub?.name || '', override_expense_description: '' }) }}
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
                                    <select style={s.editSelect} value={row.override_expense_description} onChange={e => updateRow(p.id, { override_expense_description: e.target.value })}>
                                      <option value="">Select description...</option>
                                      {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                    </select>
                                  ) : (
                                    <input style={s.editInput} value={row.override_expense_description} onChange={e => updateRow(p.id, { override_expense_description: e.target.value })} placeholder="e.g. Telekom, AWS, Rent..." />
                                  )}
                                </div>
                              </div>

                              {/* ── Revenue stream allocation ── */}
                              <div style={s.editSectionTitle}>Revenue stream allocation</div>
                              <div style={s.allocGrid}>
                                {[{ id: 'sg100', label: '100% Social Growth', sub: 'Full allocation' }, { id: 'af100', label: '100% Aimfox', sub: 'Full allocation' }, { id: 'shared', label: 'Shared 50/50', sub: 'Both streams' }, { id: 'byval', label: 'By value', sub: 'Custom split' }].map(a => (
                                  <div key={a.id} style={{ ...s.allocBtn, ...(row.override_rev_alloc === a.id ? s.allocBtnActive : {}) }} onClick={() => updateRow(p.id, { override_rev_alloc: a.id, override_aimfox_val: '', override_sg_val: '' })}>
                                    <div style={{ fontSize: '11px', fontWeight: '500', color: '#111' }}>{a.label}</div>
                                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{a.sub}</div>
                                  </div>
                                ))}
                              </div>

                              {row.override_rev_alloc === 'byval' && (() => {
                                const total = (p.debit || 0)
                                const af = parseFloat(row.override_aimfox_val) || 0
                                const sg = parseFloat(row.override_sg_val) || 0
                                const splitOk = total > 0 && Math.abs(af + sg - total) < 0.01
                                const afPct = total > 0 ? (af / total * 100).toFixed(1) : '0'
                                const sgPct = total > 0 ? (sg / total * 100).toFixed(1) : '0'
                                return (
                                  <div style={{ marginTop: '10px', background: '#f5f5f3', borderRadius: '8px', padding: '12px', border: '0.5px solid #e5e5e5' }}>
                                    <div style={{ fontSize: '10px', color: '#888', fontWeight: '500', marginBottom: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
                                      Split by value · total: {total > 0 ? `${total.toLocaleString()} ${p.currency}` : '—'}
                                    </div>
                                    <div style={s.editGrid2}>
                                      <div style={s.editField}>
                                        <label style={s.editLbl}>Aimfox ({p.currency})</label>
                                        <input type="number" style={s.editInput} value={row.override_aimfox_val}
                                          onChange={e => { const val = e.target.value; const afNum = parseFloat(val) || 0; updateRow(p.id, { override_aimfox_val: val, override_sg_val: total > 0 && afNum >= 0 && afNum <= total ? (total - afNum).toFixed(2) : row.override_sg_val }) }}
                                          placeholder="0.00" />
                                        {row.override_aimfox_val && total > 0 && <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '2px' }}>{afPct}%</div>}
                                      </div>
                                      <div style={s.editField}>
                                        <label style={s.editLbl}>Social Growth ({p.currency})</label>
                                        <input type="number" style={s.editInput} value={row.override_sg_val}
                                          onChange={e => { const val = e.target.value; const sgNum = parseFloat(val) || 0; updateRow(p.id, { override_sg_val: val, override_aimfox_val: total > 0 && sgNum >= 0 && sgNum <= total ? (total - sgNum).toFixed(2) : row.override_aimfox_val }) }}
                                          placeholder="0.00" />
                                        {row.override_sg_val && total > 0 && <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '2px' }}>{sgPct}%</div>}
                                      </div>
                                    </div>
                                    {af > 0 && sg > 0 && (
                                      <div style={{ marginTop: '8px' }}>
                                        <div style={{ height: '5px', borderRadius: '3px', background: '#e5e5e5', overflow: 'hidden', display: 'flex' }}>
                                          <div style={{ height: '100%', width: `${afPct}%`, background: '#0C447C' }} />
                                          <div style={{ height: '100%', width: `${sgPct}%`, background: '#1D9E75' }} />
                                        </div>
                                        {splitOk ? <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '4px' }}>✓ Split ispravan</div> : <div style={{ fontSize: '10px', color: '#A32D2D', marginTop: '4px' }}>⚠ Zbir ≠ ukupno</div>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}

                              {/* ── OPEX vs Performance ── */}
                              <div style={s.editSectionTitle}>Expense type — OPEX vs Performance</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '6px' }}>
                                {[
                                  { id: 'opex', label: '🏢 100% OPEX', sub: 'Fixed operational', color: '#185FA5', bg: '#E6F1FB' },
                                  { id: 'performance', label: '🚀 100% Performance', sub: 'Revenue-driven', color: '#BA7517', bg: '#FAEEDA' },
                                  { id: 'split', label: '⚖️ Split by value', sub: 'Custom allocation', color: '#555', bg: '#f0f0ee' },
                                ].map(a => (
                                  <div key={a.id}
                                    style={{ ...s.allocBtn, ...(row.override_opex_type === a.id ? { border: `2px solid ${a.color}`, background: a.bg } : {}) }}
                                    onClick={() => updateRow(p.id, { override_opex_type: a.id, override_opex_val: '', override_performance_val: '' })}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: row.override_opex_type === a.id ? a.color : '#111' }}>{a.label}</div>
                                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{a.sub}</div>
                                  </div>
                                ))}
                              </div>

                              {row.override_opex_type === 'split' && (() => {
                                const total = (p.debit || 0)
                                const op = parseFloat(row.override_opex_val) || 0
                                const perf = parseFloat(row.override_performance_val) || 0
                                const splitOk = total > 0 && Math.abs(op + perf - total) < 0.01
                                const opPct = total > 0 ? (op / total * 100).toFixed(1) : '0'
                                const perfPct = total > 0 ? (perf / total * 100).toFixed(1) : '0'
                                return (
                                  <div style={{ marginTop: '10px', background: '#f5f5f3', borderRadius: '8px', padding: '12px', border: '0.5px solid #e5e5e5' }}>
                                    <div style={{ fontSize: '10px', color: '#888', fontWeight: '500', marginBottom: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
                                      Split by value · total: {total > 0 ? `${total.toLocaleString()} ${p.currency}` : '—'}
                                    </div>
                                    <div style={s.editGrid2}>
                                      <div style={s.editField}>
                                        <label style={s.editLbl}>OPEX ({p.currency})</label>
                                        <input type="number" style={s.editInput} value={row.override_opex_val}
                                          onChange={e => { const val = e.target.value; const opNum = parseFloat(val) || 0; updateRow(p.id, { override_opex_val: val, override_performance_val: total > 0 && opNum >= 0 && opNum <= total ? (total - opNum).toFixed(2) : row.override_performance_val }) }}
                                          placeholder="0.00" />
                                        {row.override_opex_val && total > 0 && <div style={{ fontSize: '10px', color: '#185FA5', marginTop: '2px' }}>{opPct}%</div>}
                                      </div>
                                      <div style={s.editField}>
                                        <label style={s.editLbl}>Performance ({p.currency})</label>
                                        <input type="number" style={s.editInput} value={row.override_performance_val}
                                          onChange={e => { const val = e.target.value; const perfNum = parseFloat(val) || 0; updateRow(p.id, { override_performance_val: val, override_opex_val: total > 0 && perfNum >= 0 && perfNum <= total ? (total - perfNum).toFixed(2) : row.override_opex_val }) }}
                                          placeholder="0.00" />
                                        {row.override_performance_val && total > 0 && <div style={{ fontSize: '10px', color: '#BA7517', marginTop: '2px' }}>{perfPct}%</div>}
                                      </div>
                                    </div>
                                    {op > 0 && perf > 0 && (
                                      <div style={{ marginTop: '8px' }}>
                                        <div style={{ height: '5px', borderRadius: '3px', background: '#e5e5e5', overflow: 'hidden', display: 'flex' }}>
                                          <div style={{ height: '100%', width: `${opPct}%`, background: '#185FA5' }} />
                                          <div style={{ height: '100%', width: `${perfPct}%`, background: '#BA7517' }} />
                                        </div>
                                        {splitOk ? <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '4px' }}>✓ Split ispravan</div> : <div style={{ fontSize: '10px', color: '#A32D2D', marginTop: '4px' }}>⚠ Zbir ≠ ukupno</div>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </>
                          )}

                          {row.override_tx_type === 'direct' && row.override_tx_subtype === 'revenue' && (
                            <div style={{ marginTop: '8px' }}>
                              <div style={s.editField}>
                                <label style={s.editLbl}>Revenue stream</label>
                                <select style={s.editSelect} value={row.override_revenue_stream} onChange={e => updateRow(p.id, { override_revenue_stream: e.target.value })}>
                                  <option value="">Select stream...</option>
                                  {REVENUE_STREAMS.map(r => <option key={r}>{r}</option>)}
                                </select>
                              </div>
                            </div>
                          )}

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
              <span style={{ fontSize: '12px', color: '#888' }}>{accepted} entr{accepted !== 1 ? 'ies' : 'y'} will be posted</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={s.btnGhost} onClick={() => setStep('upload')}>← Back</button>
                <button style={{ ...s.btnPrimary, opacity: accepted === 0 ? 0.5 : 1 }} onClick={postAccepted} disabled={accepted === 0}>
                  Post {accepted} entr{accepted !== 1 ? 'ies' : 'y'}
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
  reviewRowPassthrough: { border: '0.5px solid #E6B432', background: '#FFFDF0' },
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