import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useDataRefresh } from '../contexts/DataRefreshContext'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Credit {
  id: string
  company_id: string
  name: string
  bank: string
  principal_amount: number
  currency: string
  interest_rate: number
  rate_type: 'fixed' | 'variable'
  rate_description: string
  disbursement_date: string | null
  first_payment_date: string | null
  last_payment_date: string | null
  monthly_annuity: number
  total_installments: number
  status: 'active' | 'closed' | 'restructured'
  notes: string | null
}

interface Installment {
  id: string
  credit_id: string
  installment_no: number
  due_date: string
  principal_amount: number
  interest_amount: number
  total_amount: number
  status: 'paid' | 'outstanding'
  transaction_id: string | null
  paid_date: string | null
  paid_amount: number | null
  notes: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtEUR(n: number): string {
  if (n === 0) return '—'
  return '€' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtEURCompact(n: number): string {
  if (n === 0) return '—'
  if (n >= 1000000) return `€${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `€${(n / 1000).toFixed(0)}K`
  return `€${n.toFixed(0)}`
}
function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / 86400000)
}
function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date()
}

// ─── New Credit Dialog ────────────────────────────────────────────────────────
function NewCreditDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', bank: '', principal_amount: '', currency: 'EUR',
    interest_rate: '', rate_type: 'fixed' as 'fixed' | 'variable',
    rate_description: '', disbursement_date: '', first_payment_date: '',
    last_payment_date: '', monthly_annuity: '', total_installments: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name || !form.bank || !form.principal_amount) {
      setError('Name, bank and principal amount are required.')
      return
    }
    setSaving(true)
    const { data: comp } = await supabase.from('companies').select('id').eq('name', 'Constellation LLC').single()
    const { error: err } = await supabase.from('credits').insert({
      company_id: comp?.id,
      name: form.name,
      bank: form.bank,
      principal_amount: parseFloat(form.principal_amount) || 0,
      currency: form.currency,
      interest_rate: parseFloat(form.interest_rate) || null,
      rate_type: form.rate_type,
      rate_description: form.rate_description || null,
      disbursement_date: form.disbursement_date || null,
      first_payment_date: form.first_payment_date || null,
      last_payment_date: form.last_payment_date || null,
      monthly_annuity: parseFloat(form.monthly_annuity) || null,
      total_installments: parseInt(form.total_installments) || null,
      status: 'active',
      notes: form.notes || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '6px' }}>{label}</div>
      {children}
    </div>
  )
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box' as const, fontFamily: "'Inter', sans-serif", fontSize: '13px', padding: '9px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', background: '#111F30', color: '#DCE9F6', outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        {/* Header */}
        <div style={{ background: '#0A1525', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '600', color: '#4EA8FF', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>New Credit</div>
            <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '20px', color: '#E8F1FB', fontWeight: '400' }}>Add Bank Credit</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#7A9BB8', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px', overflowY: 'auto', flex: 1 }}>
          {error && <div style={{ background: 'rgba(255,91,90,0.10)', border: '1px solid rgba(255,91,90,0.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#FF5B5A', marginBottom: '16px' }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Credit name *">
                <input style={inp} placeholder="e.g. Intesa 100k — Sep 2025" value={form.name} onChange={e => set('name', e.target.value)} />
              </Field>
            </div>
            <Field label="Bank *">
              <input style={inp} placeholder="e.g. Intesa Banka" value={form.bank} onChange={e => set('bank', e.target.value)} />
            </Field>
            <Field label="Currency">
              <select style={inp} value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field label="Principal amount *">
              <input style={inp} type="number" placeholder="100000" value={form.principal_amount} onChange={e => set('principal_amount', e.target.value)} />
            </Field>
            <Field label="Monthly annuity">
              <input style={inp} type="number" placeholder="5009.18" value={form.monthly_annuity} onChange={e => set('monthly_annuity', e.target.value)} />
            </Field>
            <Field label="Interest rate (%)">
              <input style={inp} type="number" step="0.01" placeholder="5.5" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
            </Field>
            <Field label="Rate type">
              <select style={inp} value={form.rate_type} onChange={e => set('rate_type', e.target.value as any)}>
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Rate description">
                <input style={inp} placeholder="e.g. 3.85% + 3M Euribor" value={form.rate_description} onChange={e => set('rate_description', e.target.value)} />
              </Field>
            </div>
            <Field label="Disbursement date">
              <input style={inp} type="date" value={form.disbursement_date} onChange={e => set('disbursement_date', e.target.value)} />
            </Field>
            <Field label="Broj installments">
              <input style={inp} type="number" placeholder="24" value={form.total_installments} onChange={e => set('total_installments', e.target.value)} />
            </Field>
            <Field label="Prva installments">
              <input style={inp} type="date" value={form.first_payment_date} onChange={e => set('first_payment_date', e.target.value)} />
            </Field>
            <Field label="Last installment">
              <input style={inp} type="date" value={form.last_payment_date} onChange={e => set('last_payment_date', e.target.value)} />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Notes">
                <textarea style={{ ...inp, height: '72px', resize: 'vertical' as const }} placeholder="Optional note..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0A1525', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
          <button onClick={onClose} style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#7A9BB8', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', fontWeight: '600', padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#4EA8FF', color: '#060E1A', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save credit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Interest Dialog ─────────────────────────────────────────────────────
function EditInterestDialog({ installment, onClose, onSaved }: { installment: Installment; onClose: () => void; onSaved: () => void }) {
  const [val, setVal] = useState(installment.interest_amount.toFixed(2))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const newInterest = parseFloat(val) || 0
    const newTotal = installment.principal_amount + newInterest
    setSaving(true)
    await supabase.from('credit_installments').update({
      interest_amount: newInterest,
      total_amount: newTotal,
      updated_at: new Date().toISOString(),
    }).eq('id', installment.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px', width: '380px', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: '10px', fontWeight: '600', color: '#F5A623', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Edit Interest</div>
        <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: '18px', color: '#E8F1FB', marginBottom: '6px' }}>Installment #{installment.installment_no}</div>
        <div style={{ fontSize: '12px', color: '#7A9BB8', marginBottom: '20px' }}>Due: {installment.due_date}</div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', color: '#7A9BB8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Principal (fixed)</span>
            <span style={{ fontFamily: "'DM Mono',monospace", color: '#4EA8FF' }}>{fmtEUR(installment.principal_amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Current interest</span>
            <span style={{ fontFamily: "'DM Mono',monospace", color: '#F5A623' }}>{fmtEUR(installment.interest_amount)}</span>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '6px' }}>New interest (EUR)</div>
          <input
            autoFocus
            type="number" step="0.01"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
            style={{ width: '100%', boxSizing: 'border-box' as const, fontFamily: "'DM Mono',monospace", fontSize: '18px', padding: '10px 12px', border: '1.5px solid #F5A623', borderRadius: '8px', background: '#0A1525', color: '#F5A623', outline: 'none' }}
          />
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '6px' }}>
            New annuity: <span style={{ fontFamily: "'DM Mono',monospace", color: '#DCE9F6' }}>{fmtEUR(installment.principal_amount + (parseFloat(val) || 0))}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#7A9BB8', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', fontWeight: '600', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#F5A623', color: '#060E1A', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Credit Row (expandable) ──────────────────────────────────────────────────
function CreditRow({ credit, onRefresh }: { credit: Credit; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [installments, setInstallments] = useState<Installment[]>([])
  const [loadingInst, setLoadingInst] = useState(false)
  const [editingInst, setEditingInst] = useState<Installment | null>(null)
  const [filter, setFilter] = useState<'all' | 'outstanding' | 'paid'>('outstanding')

  const loadInstallments = useCallback(async () => {
    setLoadingInst(true)
    const { data } = await supabase
      .from('credit_installments')
      .select('*')
      .eq('credit_id', credit.id)
      .order('installment_no')
    setInstallments(data || [])
    setLoadingInst(false)
  }, [credit.id])

  const handleExpand = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)
    if (newExpanded) loadInstallments()  // always refetch to get latest paid_amount
  }

  const outstanding = installments.filter(i => i.status === 'outstanding')
  const paid = installments.filter(i => i.status === 'paid')
  const outstandingTotal = outstanding.reduce((s, i) => s + i.total_amount, 0)
  const outstandingPrincipal = outstanding.reduce((s, i) => s + i.principal_amount, 0)
  const nextDue = outstanding.sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  const filteredInst = filter === 'all' ? installments : installments.filter(i => i.status === filter)

  const isVariable = credit.rate_type === 'variable'
  const accentColor = isVariable ? '#F5A623' : '#4EA8FF'

  return (
    <>
      {/* Main credit row */}
      <div
        onClick={handleExpand}
        style={{
          background: expanded ? '#101F32' : '#0D1B2C',
          border: `1px solid ${expanded ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'}`,
          borderLeft: `3px solid ${accentColor}`,
          borderRadius: expanded ? '12px 12px 0 0' : '12px',
          padding: '18px 20px',
          cursor: 'pointer',
          transition: 'all 0.18s',
          marginBottom: expanded ? '0' : '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Expand toggle */}
          <div style={{ color: accentColor, fontSize: '12px', width: '16px', flexShrink: 0, opacity: 0.7 }}>
            {expanded ? '▼' : '▶'}
          </div>

          {/* Name + bank */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: '16px', color: '#E8F1FB', fontWeight: '400', letterSpacing: '-0.01em', marginBottom: '3px' }}>
              {credit.name}
            </div>
            <div style={{ fontSize: '12px', color: '#7A9BB8' }}>
              {credit.bank}
              <span style={{ marginLeft: '10px', fontSize: '10px', fontWeight: '600', padding: '1px 7px', borderRadius: '20px', background: isVariable ? 'rgba(245,166,35,0.12)' : 'rgba(78,168,255,0.12)', color: accentColor, letterSpacing: '0.02em' }}>
                {isVariable ? 'VAR' : 'FIX'}
              </span>
              <span style={{ marginLeft: '8px', color: 'rgba(255,255,255,0.30)' }}>·</span>
              <span style={{ marginLeft: '8px', color: 'rgba(255,255,255,0.40)', fontSize: '12px' }}>{credit.rate_description}</span>
            </div>
          </div>

          {/* Remaining principal */}
          <div style={{ textAlign: 'right', minWidth: '130px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Remaining Principal</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: '500', color: accentColor }}>
              {fmtEURCompact(outstandingPrincipal || credit.principal_amount)}
            </div>
          </div>

          {/* Outstanding total */}
          <div style={{ textAlign: 'right', minWidth: '130px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Total Outstanding</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: '500', color: '#E8F1FB' }}>
              {fmtEURCompact(outstandingTotal)}
            </div>
          </div>

          {/* Next due */}
          <div style={{ textAlign: 'right', minWidth: '120px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Next Installment</div>
            {nextDue ? (
              <div>
                <div style={{ fontSize: '13px', color: isOverdue(nextDue.due_date) ? '#FF5B5A' : '#DCE9F6', fontWeight: isOverdue(nextDue.due_date) ? '600' : '400' }}>
                  {nextDue.due_date}
                </div>
                {nextDue.paid_amount && nextDue.paid_amount > 0 ? (
                  <span style={{ fontSize: '10px', color: '#F5A623', background: 'rgba(245,166,35,0.12)', padding: '1px 6px', borderRadius: '20px', fontWeight: '600' }}>
                    Partial — €{nextDue.paid_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} paid
                  </span>
                ) : isOverdue(nextDue.due_date) ? (
                  <span style={{ fontSize: '10px', color: '#FF5B5A', background: 'rgba(255,91,90,0.12)', padding: '1px 6px', borderRadius: '20px', fontWeight: '600' }}>
                    {Math.abs(daysUntil(nextDue.due_date))}d overdue
                  </span>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#00D47E' }}>Paid ✓</div>
            )}
          </div>

          {/* Stats */}
          <div style={{ textAlign: 'right', minWidth: '80px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Installments</div>
            <div style={{ fontSize: '12px', color: '#7A9BB8' }}>
              <span style={{ color: '#00D47E', fontWeight: '600' }}>{paid.length}</span> / {installments.length > 0 ? installments.length : credit.total_installments}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded installments */}
      {expanded && (
        <div style={{ background: '#080F1A', border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none', borderRadius: '0 0 12px 12px', marginBottom: '8px', overflow: 'hidden' }}>
          {/* Installments toolbar */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px', background: '#0A1525' }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', marginRight: '4px' }}>Show:</div>
            {(['outstanding', 'paid', 'all'] as const).map(f => (
              <button key={f} onClick={e => { e.stopPropagation(); setFilter(f) }}
                style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: '500', padding: '4px 12px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: filter === f ? (f === 'outstanding' ? 'rgba(255,91,90,0.12)' : f === 'paid' ? 'rgba(0,212,126,0.12)' : 'rgba(255,255,255,0.08)') : 'transparent', color: filter === f ? (f === 'outstanding' ? '#FF5B5A' : f === 'paid' ? '#00D47E' : '#DCE9F6') : 'rgba(255,255,255,0.30)', borderColor: filter === f ? (f === 'outstanding' ? 'rgba(255,91,90,0.4)' : f === 'paid' ? 'rgba(0,212,126,0.4)' : 'rgba(255,255,255,0.15)') : 'transparent' }}>
                {f === 'outstanding' ? `Outstanding (${outstanding.length})` : f === 'paid' ? `Paid (${paid.length})` : 'Sve'}
              </button>
            ))}
            {isVariable && (
              <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#F5A623', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', padding: '3px 10px', borderRadius: '20px' }}>
                Variable rate — click ✎ to edit interest
              </div>
            )}
          </div>

          {/* Table */}
          {loadingInst ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#7A9BB8', fontSize: '13px' }}>Loading...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0A1525' }}>
                  {['#', 'Due Date', 'Principal', 'Interest', 'Annuity', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '9px 16px', fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: h === 'Principal' || h === 'Interest' || h === 'Annuity' ? 'right' : 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredInst.map((inst, idx) => {
                  const overdue = inst.status === 'outstanding' && isOverdue(inst.due_date)
                  return (
                    <tr key={inst.id} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '9px 16px', fontSize: '12px', color: 'rgba(255,255,255,0.35)', fontFamily: "'DM Mono',monospace" }}>{inst.installment_no}</td>
                      <td style={{ padding: '9px 16px', fontSize: '12px', color: overdue ? '#FF5B5A' : '#DCE9F6', fontWeight: overdue ? '600' : '400' }}>
                        {inst.due_date}
                        {overdue && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#FF5B5A', background: 'rgba(255,91,90,0.12)', padding: '1px 5px', borderRadius: '10px' }}>overdue</span>}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '12px', color: inst.principal_amount > 0 ? '#4EA8FF' : 'rgba(255,255,255,0.20)' }}>
                        {inst.principal_amount > 0 ? inst.principal_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '12px', color: '#F5A623' }}>
                        {inst.interest_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: '500', color: '#E8F1FB' }}>
                        {inst.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '9px 16px' }}>
                        {(() => {
                          const isPartial = inst.status === 'outstanding' && inst.paid_amount && inst.paid_amount > 0
                          const paidPct = isPartial ? Math.min(100, (inst.paid_amount! / inst.total_amount) * 100) : 0
                          return (
                            <div>
                              <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px',
                                background: inst.status === 'paid' ? 'rgba(0,212,126,0.12)' : isPartial ? 'rgba(245,166,35,0.12)' : overdue ? 'rgba(255,91,90,0.12)' : 'rgba(255,255,255,0.06)',
                                color: inst.status === 'paid' ? '#00D47E' : isPartial ? '#F5A623' : overdue ? '#FF5B5A' : '#7A9BB8' }}>
                                {inst.status === 'paid' ? 'Paid' : isPartial ? 'Partial' : overdue ? 'Overdue' : 'Outstanding'}
                              </span>
                              {isPartial && (
                                <div style={{ marginTop: '4px', width: '90px' }}>
                                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${paidPct}%`, background: '#F5A623', borderRadius: '2px' }} />
                                  </div>
                                  <div style={{ fontSize: '9px', color: '#F5A623', marginTop: '2px', fontFamily: "'DM Mono',monospace" }}>
                                    €{inst.paid_amount!.toFixed(2)} / €{inst.total_amount.toFixed(2)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                        {inst.status === 'outstanding' && isVariable && (
                          <button
                            onClick={e => { e.stopPropagation(); setEditingInst(inst) }}
                            style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: '500', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(245,166,35,0.3)', background: 'rgba(245,166,35,0.06)', color: '#F5A623', cursor: 'pointer' }}>
                            ✎ Interest
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filteredInst.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#060E1A', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <td colSpan={2} style={{ padding: '10px 16px', fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Total ({filteredInst.length} installments)
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: '600', color: '#4EA8FF' }}>
                      {filteredInst.reduce((s, i) => s + i.principal_amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: '600', color: '#F5A623' }}>
                      {filteredInst.reduce((s, i) => s + i.interest_amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '14px', fontWeight: '700', color: '#E8F1FB' }}>
                      {filteredInst.reduce((s, i) => s + i.total_amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      )}

      {editingInst && (
        <EditInterestDialog
          installment={editingInst}
          onClose={() => setEditingInst(null)}
          onSaved={() => { setEditingInst(null); loadInstallments() }}
        />
      )}
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Credits() {
  const { versions } = useDataRefresh()

  const [credits, setCredits] = useState<Credit[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [refreshKey, setRefreshKey] = useState(0)

  // Aggregate stats from DB
  const [stats, setStats] = useState({ totalOutstanding: 0, totalPrincipal: 0, overdueCount: 0, nextDueDate: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('credits').select('*').order('first_payment_date')
    setCredits(data || [])

    // Fetch aggregate stats from installments
    const { data: instData } = await supabase
      .from('credit_installments')
      .select('total_amount, principal_amount, due_date, status')
      .eq('status', 'outstanding')
      .order('due_date')

    if (instData) {
      const today = new Date().toISOString().split('T')[0]
      const totalOut = instData.reduce((s, i) => s + (i.total_amount || 0), 0)
      const totalPrin = instData.reduce((s, i) => s + (i.principal_amount || 0), 0)
      const overdue = instData.filter(i => i.due_date < today).length
      const next = instData.find(i => i.due_date >= today)
      setStats({ totalOutstanding: totalOut, totalPrincipal: totalPrin, overdueCount: overdue, nextDueDate: next?.due_date || '' })
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Refetch + remount CreditRows when data invalidated from another page
  useEffect(() => {
    if (versions.credits > 0) { load(); setRefreshKey(k => k + 1) }
  }, [versions.credits, load]) // eslint-disable-line

  const filtered = statusFilter === 'active' ? credits.filter(c => c.status === 'active') : credits

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'Inter', system-ui, sans-serif", minHeight: '100vh', background: '#060E1A', color: '#DCE9F6' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '28px', gap: '24px' }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '28px', fontWeight: '400', color: '#E8F1FB', marginBottom: '5px', letterSpacing: '-0.01em' }}>
            Bank Credits
          </div>
          <div style={{ fontSize: '13px', color: '#7A9BB8' }}>
            Loan repayment schedule · Constellation LLC
          </div>
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', fontWeight: '600', padding: '9px 18px', border: 'none', borderRadius: '9px', background: '#4EA8FF', color: '#060E1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px' }}>
          + New Credit
        </button>
      </div>

      {/* ── KPI strip ── */}
      <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>
        Overview
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '28px' }}>
        {[
          { label: 'Active Credits', value: loading ? '—' : String(credits.filter(c => c.status === 'active').length), accent: '#4EA8FF', sub: 'total' },
          { label: 'Remaining Principal', value: loading ? '—' : fmtEURCompact(stats.totalPrincipal), accent: '#4EA8FF', sub: 'across all loans' },
          { label: 'Total Outstanding', value: loading ? '—' : fmtEURCompact(stats.totalOutstanding), accent: '#F5A623', sub: 'principal + interest' },
          { label: stats.overdueCount > 0 ? 'Overdue Installments' : 'Next Installment', value: loading ? '—' : stats.overdueCount > 0 ? String(stats.overdueCount) : (stats.nextDueDate || '—'), accent: stats.overdueCount > 0 ? '#FF5B5A' : '#00D47E', sub: stats.overdueCount > 0 ? 'require attention' : 'due date' },
        ].map(k => (
          <div key={k.label} style={{ background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.06)', borderTop: `2.5px solid ${k.accent}`, borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.11em', marginBottom: '10px' }}>{k.label}</div>
            <div style={{ fontFamily: "'DM Mono','Fira Mono',monospace", fontSize: '24px', fontWeight: '500', color: k.accent, letterSpacing: '-0.02em', lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Credits</div>
        <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
        {(['active', 'all'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: '500', padding: '4px 12px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: statusFilter === f ? 'rgba(78,168,255,0.12)' : 'transparent', color: statusFilter === f ? '#4EA8FF' : 'rgba(255,255,255,0.30)', borderColor: statusFilter === f ? 'rgba(78,168,255,0.4)' : 'transparent' }}>
            {f === 'active' ? 'Active' : 'All'}
          </button>
        ))}
      </div>

      {/* ── Credit list ── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#7A9BB8', fontSize: '13px', background: '#0D1B2C', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ marginBottom: '12px' }}>Loading credits...</div>
            <div style={{ width: '160px', height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', margin: '0 auto' }}>
              <div style={{ height: '100%', width: '60%', background: '#4EA8FF', borderRadius: '2px', animation: 'pulse 1.5s infinite' }} />
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#7A9BB8', background: '#0D1B2C', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', gap: '10px' }}>
          <div style={{ fontSize: '28px', opacity: 0.3 }}>🏦</div>
          <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6' }}>No credits found</div>
          <div style={{ fontSize: '13px' }}>Add your first credit using the "+ New Credit" button</div>
        </div>
      ) : (
        <div>
          {filtered.map(credit => (
            <CreditRow key={`${credit.id}-${refreshKey}`} credit={credit} onRefresh={load} />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {showNewDialog && (
        <NewCreditDialog onClose={() => setShowNewDialog(false)} onSaved={load} />
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  )
}