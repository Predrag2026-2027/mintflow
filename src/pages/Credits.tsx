import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

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
  notes: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtRSD(n: number): string {
  if (n === 0) return '—'
  return n.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD'
}
function fmtRSDCompact(n: number): string {
  if (n === 0) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M RSD`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K RSD`
  return `${n.toFixed(0)} RSD`
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
    name: '', bank: '', principal_amount: '', currency: 'RSD',
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
      setError('Naziv, banka i iznos glavnice su obavezni.')
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
            <div style={{ fontSize: '10px', fontWeight: '600', color: '#4EA8FF', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Novi kredit</div>
            <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '20px', color: '#E8F1FB', fontWeight: '400' }}>Dodaj bankarski kredit</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#7A9BB8', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px', overflowY: 'auto', flex: 1 }}>
          {error && <div style={{ background: 'rgba(255,91,90,0.10)', border: '1px solid rgba(255,91,90,0.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#FF5B5A', marginBottom: '16px' }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Naziv kredita *">
                <input style={inp} placeholder="npr. Intesa 100k — Sep 2025" value={form.name} onChange={e => set('name', e.target.value)} />
              </Field>
            </div>
            <Field label="Banka *">
              <input style={inp} placeholder="Intesa Banka" value={form.bank} onChange={e => set('bank', e.target.value)} />
            </Field>
            <Field label="Valuta">
              <select style={inp} value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option value="RSD">RSD</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field label="Iznos glavnice *">
              <input style={inp} type="number" placeholder="100000" value={form.principal_amount} onChange={e => set('principal_amount', e.target.value)} />
            </Field>
            <Field label="Mesečni anuitet">
              <input style={inp} type="number" placeholder="5009.18" value={form.monthly_annuity} onChange={e => set('monthly_annuity', e.target.value)} />
            </Field>
            <Field label="Kamatna stopa (%)">
              <input style={inp} type="number" step="0.01" placeholder="5.5" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
            </Field>
            <Field label="Tip kamate">
              <select style={inp} value={form.rate_type} onChange={e => set('rate_type', e.target.value as any)}>
                <option value="fixed">Fiksna</option>
                <option value="variable">Varijabilna</option>
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Opis kamatne stope">
                <input style={inp} placeholder="npr. 3.85% + 3M Euribor" value={form.rate_description} onChange={e => set('rate_description', e.target.value)} />
              </Field>
            </div>
            <Field label="Datum isplate kredita">
              <input style={inp} type="date" value={form.disbursement_date} onChange={e => set('disbursement_date', e.target.value)} />
            </Field>
            <Field label="Broj rata">
              <input style={inp} type="number" placeholder="24" value={form.total_installments} onChange={e => set('total_installments', e.target.value)} />
            </Field>
            <Field label="Prva rata">
              <input style={inp} type="date" value={form.first_payment_date} onChange={e => set('first_payment_date', e.target.value)} />
            </Field>
            <Field label="Poslednja rata">
              <input style={inp} type="date" value={form.last_payment_date} onChange={e => set('last_payment_date', e.target.value)} />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Napomena">
                <textarea style={{ ...inp, height: '72px', resize: 'vertical' as const }} placeholder="Opciona napomena..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0A1525', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
          <button onClick={onClose} style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#7A9BB8', cursor: 'pointer' }}>Odustani</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', fontWeight: '600', padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#4EA8FF', color: '#060E1A', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Čuvanje...' : 'Sačuvaj kredit'}
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
        <div style={{ fontSize: '10px', fontWeight: '600', color: '#F5A623', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Uredi kamatu</div>
        <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: '18px', color: '#E8F1FB', marginBottom: '6px' }}>Rata #{installment.installment_no}</div>
        <div style={{ fontSize: '12px', color: '#7A9BB8', marginBottom: '20px' }}>Dospeće: {installment.due_date}</div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', color: '#7A9BB8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Glavnica (fiksna)</span>
            <span style={{ fontFamily: "'DM Mono',monospace", color: '#4EA8FF' }}>{fmtRSD(installment.principal_amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Trenutna kamata</span>
            <span style={{ fontFamily: "'DM Mono',monospace", color: '#F5A623' }}>{fmtRSD(installment.interest_amount)}</span>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '6px' }}>Nova kamata (RSD)</div>
          <input
            autoFocus
            type="number" step="0.01"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
            style={{ width: '100%', boxSizing: 'border-box' as const, fontFamily: "'DM Mono',monospace", fontSize: '18px', padding: '10px 12px', border: '1.5px solid #F5A623', borderRadius: '8px', background: '#0A1525', color: '#F5A623', outline: 'none' }}
          />
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '6px' }}>
            Novi anuitet: <span style={{ fontFamily: "'DM Mono',monospace", color: '#DCE9F6' }}>{fmtRSD(installment.principal_amount + (parseFloat(val) || 0))}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#7A9BB8', cursor: 'pointer' }}>Odustani</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', fontWeight: '600', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#F5A623', color: '#060E1A', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Čuvanje...' : 'Sačuvaj'}
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
    setExpanded(e => !e)
    if (!expanded && installments.length === 0) loadInstallments()
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
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Preostala glavnica</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: '500', color: accentColor }}>
              {fmtRSDCompact(outstandingPrincipal || credit.principal_amount)}
            </div>
          </div>

          {/* Outstanding total */}
          <div style={{ textAlign: 'right', minWidth: '130px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Ukupno preostalo</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '16px', fontWeight: '500', color: '#E8F1FB' }}>
              {fmtRSDCompact(outstandingTotal)}
            </div>
          </div>

          {/* Next due */}
          <div style={{ textAlign: 'right', minWidth: '120px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Sledeća rata</div>
            {nextDue ? (
              <div>
                <div style={{ fontSize: '13px', color: isOverdue(nextDue.due_date) ? '#FF5B5A' : '#DCE9F6', fontWeight: isOverdue(nextDue.due_date) ? '600' : '400' }}>
                  {nextDue.due_date}
                </div>
                {isOverdue(nextDue.due_date) && (
                  <span style={{ fontSize: '10px', color: '#FF5B5A', background: 'rgba(255,91,90,0.12)', padding: '1px 6px', borderRadius: '20px', fontWeight: '600' }}>
                    {Math.abs(daysUntil(nextDue.due_date))}d kasni
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#00D47E' }}>Plaćen ✓</div>
            )}
          </div>

          {/* Stats */}
          <div style={{ textAlign: 'right', minWidth: '80px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '4px' }}>Rate</div>
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
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', marginRight: '4px' }}>Prikaži:</div>
            {(['outstanding', 'paid', 'all'] as const).map(f => (
              <button key={f} onClick={e => { e.stopPropagation(); setFilter(f) }}
                style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: '500', padding: '4px 12px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: filter === f ? (f === 'outstanding' ? 'rgba(255,91,90,0.12)' : f === 'paid' ? 'rgba(0,212,126,0.12)' : 'rgba(255,255,255,0.08)') : 'transparent', color: filter === f ? (f === 'outstanding' ? '#FF5B5A' : f === 'paid' ? '#00D47E' : '#DCE9F6') : 'rgba(255,255,255,0.30)', borderColor: filter === f ? (f === 'outstanding' ? 'rgba(255,91,90,0.4)' : f === 'paid' ? 'rgba(0,212,126,0.4)' : 'rgba(255,255,255,0.15)') : 'transparent' }}>
                {f === 'outstanding' ? `Preostale (${outstanding.length})` : f === 'paid' ? `Plaćene (${paid.length})` : 'Sve'}
              </button>
            ))}
            {isVariable && (
              <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#F5A623', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', padding: '3px 10px', borderRadius: '20px' }}>
                Varijabilna kamata — klikni ✎ za izmenu
              </div>
            )}
          </div>

          {/* Table */}
          {loadingInst ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#7A9BB8', fontSize: '13px' }}>Učitavanje...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0A1525' }}>
                  {['#', 'Datum dospeća', 'Glavnica', 'Kamata', 'Anuitet', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '9px 16px', fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: h === 'Glavnica' || h === 'Kamata' || h === 'Anuitet' ? 'right' : 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
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
                        {overdue && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#FF5B5A', background: 'rgba(255,91,90,0.12)', padding: '1px 5px', borderRadius: '10px' }}>kasni</span>}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '12px', color: inst.principal_amount > 0 ? '#4EA8FF' : 'rgba(255,255,255,0.20)' }}>
                        {inst.principal_amount > 0 ? inst.principal_amount.toLocaleString('sr-RS', { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '12px', color: '#F5A623' }}>
                        {inst.interest_amount.toLocaleString('sr-RS', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: '500', color: '#E8F1FB' }}>
                        {inst.total_amount.toLocaleString('sr-RS', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '9px 16px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px', background: inst.status === 'paid' ? 'rgba(0,212,126,0.12)' : overdue ? 'rgba(255,91,90,0.12)' : 'rgba(255,255,255,0.06)', color: inst.status === 'paid' ? '#00D47E' : overdue ? '#FF5B5A' : '#7A9BB8' }}>
                          {inst.status === 'paid' ? 'Plaćeno' : overdue ? 'Kasni' : 'Preostalo'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                        {inst.status === 'outstanding' && isVariable && (
                          <button
                            onClick={e => { e.stopPropagation(); setEditingInst(inst) }}
                            style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: '500', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(245,166,35,0.3)', background: 'rgba(245,166,35,0.06)', color: '#F5A623', cursor: 'pointer' }}>
                            ✎ Kamata
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
                      Ukupno ({filteredInst.length} rata)
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: '600', color: '#4EA8FF' }}>
                      {filteredInst.reduce((s, i) => s + i.principal_amount, 0).toLocaleString('sr-RS', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: '600', color: '#F5A623' }}>
                      {filteredInst.reduce((s, i) => s + i.interest_amount, 0).toLocaleString('sr-RS', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: '14px', fontWeight: '700', color: '#E8F1FB' }}>
                      {filteredInst.reduce((s, i) => s + i.total_amount, 0).toLocaleString('sr-RS', { minimumFractionDigits: 2 })}
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
  const [credits, setCredits] = useState<Credit[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')

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
            Planski otplatni krediti · Constellation LLC
          </div>
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          style={{ fontFamily: "'Inter',sans-serif", fontSize: '13px', fontWeight: '600', padding: '9px 18px', border: 'none', borderRadius: '9px', background: '#4EA8FF', color: '#060E1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px' }}>
          + Novi kredit
        </button>
      </div>

      {/* ── KPI strip ── */}
      <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>
        Pregled stanja
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '28px' }}>
        {[
          { label: 'Aktivni krediti', value: loading ? '—' : String(credits.filter(c => c.status === 'active').length), accent: '#4EA8FF', sub: 'ukupno' },
          { label: 'Preostala glavnica', value: loading ? '—' : fmtRSDCompact(stats.totalPrincipal), accent: '#4EA8FF', sub: 'svih kredita' },
          { label: 'Preostale obaveze', value: loading ? '—' : fmtRSDCompact(stats.totalOutstanding), accent: '#F5A623', sub: 'glavnica + kamata' },
          { label: stats.overdueCount > 0 ? 'Kasnele rate' : 'Sledeća rata', value: loading ? '—' : stats.overdueCount > 0 ? String(stats.overdueCount) : (stats.nextDueDate || '—'), accent: stats.overdueCount > 0 ? '#FF5B5A' : '#00D47E', sub: stats.overdueCount > 0 ? 'zahtevaju pažnju' : 'datum dospeća' },
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
        <div style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Krediti</div>
        <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
        {(['active', 'all'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: '500', padding: '4px 12px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: statusFilter === f ? 'rgba(78,168,255,0.12)' : 'transparent', color: statusFilter === f ? '#4EA8FF' : 'rgba(255,255,255,0.30)', borderColor: statusFilter === f ? 'rgba(78,168,255,0.4)' : 'transparent' }}>
            {f === 'active' ? 'Aktivni' : 'Svi'}
          </button>
        ))}
      </div>

      {/* ── Credit list ── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#7A9BB8', fontSize: '13px', background: '#0D1B2C', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ marginBottom: '12px' }}>Učitavanje kredita...</div>
            <div style={{ width: '160px', height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', margin: '0 auto' }}>
              <div style={{ height: '100%', width: '60%', background: '#4EA8FF', borderRadius: '2px', animation: 'pulse 1.5s infinite' }} />
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#7A9BB8', background: '#0D1B2C', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', gap: '10px' }}>
          <div style={{ fontSize: '28px', opacity: 0.3 }}>🏦</div>
          <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6' }}>Nema kredita</div>
          <div style={{ fontSize: '13px' }}>Dodaj prvi kredit klikom na "+ Novi kredit"</div>
        </div>
      ) : (
        <div>
          {filtered.map(credit => (
            <CreditRow key={credit.id} credit={credit} onRefresh={load} />
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