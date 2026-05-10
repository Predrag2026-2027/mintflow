import React from 'react'
import type { CreditOption, CreditInstallment } from './useCreditPayment'

interface Props {
  credits: CreditOption[]
  selectedCreditId: string
  onCreditChange: (id: string) => void
  installments: CreditInstallment[]
  selectedInstallmentIds: string[]
  onToggle: (id: string) => void
  onToggleAll: () => void
  selectedTotal: number
  error?: string
  theme?: 'light' | 'dark'
}

export default function CreditInstallmentSelector({
  credits, selectedCreditId, onCreditChange,
  installments, selectedInstallmentIds, onToggle, onToggleAll,
  selectedTotal, error, theme = 'light',
}: Props) {
  const dk = theme === 'dark'
  const sel: React.CSSProperties = {
    fontFamily: "'Inter',sans-serif", fontSize: '13px', padding: '8px 10px', width: '100%',
    border: dk ? '1px solid rgba(255,255,255,0.08)' : '0.5px solid #e5e5e5',
    borderRadius: '8px', background: dk ? '#111F30' : '#fff',
    color: dk ? '#DCE9F6' : '#111', outline: 'none',
  }
  return (
    <div>
      <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px',
        background: dk ? 'rgba(78,168,255,0.08)' : '#EBF5FF',
        border: dk ? '1px solid rgba(78,168,255,0.25)' : '0.5px solid #7FB8EE',
        color: dk ? '#4EA8FF' : '#0C447C' }}>
        Select the credit and installments being paid. They will be marked as paid in Bank Credits.
      </div>
      {error && (
        <div style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px',
          background: dk ? 'rgba(255,91,90,0.10)' : '#FCEBEB',
          border: dk ? '1px solid rgba(255,91,90,0.3)' : '0.5px solid #F5A9A9',
          color: dk ? '#FF5B5A' : '#A32D2D' }}>⚠️ {error}</div>
      )}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em',
          textTransform: 'uppercase' as const, marginBottom: '6px',
          color: dk ? 'rgba(255,255,255,0.30)' : '#888' }}>Credit</label>
        <select style={sel} value={selectedCreditId} onChange={e => onCreditChange(e.target.value)}>
          <option value="">Select credit...</option>
          {credits.map(c => (
            <option key={c.id} value={c.id}>{c.name} — {c.bank} ({c.rate_description})</option>
          ))}
        </select>
      </div>
      {selectedCreditId && installments.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center' as const, fontSize: '13px', borderRadius: '8px',
          color: dk ? '#7A9BB8' : '#888', background: dk ? 'rgba(255,255,255,0.03)' : '#f5f5f3' }}>
          ✓ All installments are already paid.
        </div>
      )}
      {installments.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em',
              textTransform: 'uppercase' as const, color: dk ? 'rgba(255,255,255,0.30)' : '#888' }}>
              Outstanding installments
            </label>
            <button onClick={onToggleAll} style={{ background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Inter',sans-serif", fontSize: '12px', color: dk ? '#4EA8FF' : '#1D9E75' }}>
              {selectedInstallmentIds.length === installments.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
            {installments.map(inst => {
              const sel2 = selectedInstallmentIds.includes(inst.id)
              const overdue = new Date(inst.due_date) < new Date()
              return (
                <div key={inst.id} onClick={() => onToggle(inst.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', cursor: 'pointer', borderRadius: '8px', transition: 'all 0.12s',
                  border: sel2
                    ? (dk ? '1.5px solid #4EA8FF' : '1.5px solid #1D9E75')
                    : (dk ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid #e5e5e5'),
                  background: sel2
                    ? (dk ? 'rgba(78,168,255,0.08)' : '#f0fdf8')
                    : (dk ? '#111F30' : '#fff'),
                }}>
                  <input type="checkbox" checked={sel2} onChange={() => {}}
                    style={{ cursor: 'pointer', accentColor: dk ? '#4EA8FF' : '#1D9E75', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: dk ? '#E8F1FB' : '#111' }}>
                        Installment #{inst.installment_no}
                      </span>
                      {overdue && (
                        <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', fontWeight: '600',
                          background: dk ? 'rgba(255,91,90,0.12)' : '#FCEBEB',
                          color: dk ? '#FF5B5A' : '#A32D2D' }}>Overdue</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: dk ? '#7A9BB8' : '#888' }}>
                      Due: <strong>{inst.due_date}</strong>
                      <span style={{ marginLeft: '10px', color: dk ? '#4EA8FF' : '#185FA5' }}>
                        Principal: {inst.principal_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span style={{ marginLeft: '10px', color: dk ? '#F5A623' : '#BA7517' }}>
                        Interest: {inst.interest_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: '600',
                    color: dk ? '#E8F1FB' : '#111', flexShrink: 0, textAlign: 'right' as const }}>
                    {inst.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} EUR
                  </div>
                </div>
              )
            })}
          </div>
          {selectedInstallmentIds.length > 0 && (
            <div style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '8px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: '13px',
              background: dk ? 'rgba(78,168,255,0.08)' : '#EBF5FF',
              border: dk ? '1px solid rgba(78,168,255,0.20)' : '0.5px solid #7FB8EE',
              color: dk ? '#4EA8FF' : '#0C447C' }}>
              <span>{selectedInstallmentIds.length} installment{selectedInstallmentIds.length > 1 ? 's' : ''} selected</span>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: '700' }}>
                {selectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} EUR
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
