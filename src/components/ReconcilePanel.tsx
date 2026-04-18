import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'

interface Props {
  // Can be opened from either side
  sourceType: 'transaction' | 'invoice'
  sourceId: string
  onClose: () => void
  onReconciled: () => void
}

interface LinkRow {
  id: string
  type: 'invoice' | 'transaction'
  date: string
  partner_name: string
  identifier: string   // invoice number or statement number
  currency: string
  amount: number
  amount_usd: number
  remaining_usd: number
  status: string
  pl_category?: string
  revenue_stream?: string
  allocated_usd: number
}

export default function ReconcilePanel({ sourceType, sourceId, onClose, onReconciled }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  // Source data (the thing we opened reconcile from)
  const [source, setSource] = useState<any>(null)

  // Candidates to link (opposite side)
  const [candidates, setCandidates] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Selected links with allocation
  const [links, setLinks] = useState<LinkRow[]>([])

  // Existing links (already reconciled before)
  const [existingLinks, setExistingLinks] = useState<any[]>([])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, sourceType])

  const loadData = async () => {
    setLoading(true)

    if (sourceType === 'transaction') {
      // Source = Direct transaction
      const { data: tx } = await supabase
        .from('transactions')
        .select(`*, companies(name), partners(name), banks(name)`)
        .eq('id', sourceId)
        .single()
      setSource(tx)

      // Candidates = open invoices for same company
      if (tx?.company_id) {
        const { data: invs } = await supabase
          .from('v_invoice_status')
          .select('*')
          .eq('company_id', tx.company_id)
          .in('calculated_status', ['unpaid', 'partial', 'reconciled'])
          .order('invoice_date', { ascending: false })
        setCandidates(invs || [])
      }

      // Existing links
      const { data: existing } = await supabase
        .from('invoice_transaction_links')
        .select(`*, invoices(invoice_number, invoice_date, partners(name))`)
        .eq('transaction_id', sourceId)
      setExistingLinks(existing || [])

    } else {
      // Source = Invoice
      const { data: inv } = await supabase
        .from('invoices')
        .select(`*, companies(name), partners(name)`)
        .eq('id', sourceId)
        .single()
      setSource(inv)

      // Candidates = Direct transactions for same company
      if (inv?.company_id) {
        const { data: txs } = await supabase
          .from('transactions')
          .select(`*, companies(name), partners(name), banks(name)`)
          .eq('company_id', inv.company_id)
          .eq('type', 'direct')
          .order('transaction_date', { ascending: false })
        setCandidates(txs || [])
      }

      // Existing links
      const { data: existing } = await supabase
        .from('invoice_transaction_links')
        .select(`*, transactions(transaction_date, statement_number, partners(name))`)
        .eq('invoice_id', sourceId)
      setExistingLinks(existing || [])
    }

    setLoading(false)
  }

  const isLinked = (id: string) => links.some(l => l.id === id)
  const isAlreadyReconciled = (id: string) => existingLinks.some(l =>
    sourceType === 'transaction' ? l.invoice_id === id : l.transaction_id === id
  )

  const addLink = (candidate: any) => {
    if (isLinked(candidate.id) || isAlreadyReconciled(candidate.id)) return

    const remaining = sourceType === 'transaction'
      ? (candidate.remaining_usd ?? candidate.amount_usd ?? 0)
      : (candidate.amount_usd ?? 0)

    const suggested = Math.min(remaining, sourceAmountUsd - totalAllocated)

    setLinks(prev => [...prev, {
      id: candidate.id,
      type: sourceType === 'transaction' ? 'invoice' : 'transaction',
      date: candidate.invoice_date || candidate.transaction_date,
      partner_name: candidate.partner_name || candidate.partners?.name || '—',
      identifier: candidate.invoice_number || candidate.statement_number || '—',
      currency: candidate.currency,
      amount: candidate.amount,
      amount_usd: candidate.amount_usd,
      remaining_usd: remaining,
      status: candidate.calculated_status || candidate.status || candidate.type,
      pl_category: candidate.pl_category || candidate.revenue_stream,
      allocated_usd: Math.max(0, suggested),
    }])
  }

  const removeLink = (id: string) => {
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  const updateAllocation = (id: string, val: number) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, allocated_usd: val } : l))
  }

  const sourceAmountUsd = source?.amount_usd ?? 0
  const totalAllocated = links.reduce((s, l) => s + (l.allocated_usd || 0), 0)
  const unallocated = sourceAmountUsd - totalAllocated - existingLinks.reduce((s, l) => s + (l.allocated_amount_usd || 0), 0)

  const filteredCandidates = candidates.filter(c => {
    if (!searchQuery) return true
    const partner = c.partner_name || c.partners?.name || ''
    const identifier = c.invoice_number || c.statement_number || ''
    return (
      partner.toLowerCase().includes(searchQuery.toLowerCase()) ||
      identifier.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  const handleSave = async () => {
    if (links.length === 0) return
    setSaving(true)

    try {
      for (const link of links) {
        const invoiceId = sourceType === 'transaction' ? link.id : sourceId
        const transactionId = sourceType === 'transaction' ? sourceId : link.id

        // Create link
        await supabase.from('invoice_transaction_links').upsert({
          invoice_id: invoiceId,
          transaction_id: transactionId,
          allocated_amount: link.allocated_usd,
          allocated_amount_usd: link.allocated_usd,
        }, { onConflict: 'invoice_id,transaction_id' })

        // Invoice becomes P&L source, transaction loses P&L impact
        await supabase.from('invoices')
          .update({ pl_impact: true })
          .eq('id', invoiceId)

        await supabase.from('transactions')
          .update({ pl_impact: false, status: 'reconciled' })
          .eq('id', transactionId)

        // Refresh invoice status from view
        const { data: invStatus } = await supabase
          .from('v_invoice_status')
          .select('calculated_status')
          .eq('id', invoiceId)
          .single()

        if (invStatus) {
          await supabase.from('invoices')
            .update({ status: invStatus.calculated_status })
            .eq('id', invoiceId)
        }
      }

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        onReconciled()
        onClose()
      }, 1800)

    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  // ── Helpers ──────────────────────────────────────────────
  const getStatusStyle = (status: string): React.CSSProperties => {
    const map: Record<string, React.CSSProperties> = {
      unpaid: { background: '#FCEBEB', color: '#A32D2D' },
      partial: { background: '#FAEEDA', color: '#633806' },
      paid: { background: '#E1F5EE', color: '#085041' },
      reconciled: { background: '#f0f0ee', color: '#666' },
      posted: { background: '#E1F5EE', color: '#085041' },
      direct: { background: '#E1F5EE', color: '#085041' },
    }
    return map[status] || { background: '#f0f0ee', color: '#888' }
  }

  // ── Success screen ───────────────────────────────────────
  if (success) return (
    <div style={s.overlay}>
      <div style={{ ...s.panel, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minHeight: '220px' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '20px', color: '#111' }}>Reconciled!</div>
        <div style={{ fontSize: '13px', color: '#888', textAlign: 'center' }}>
          {links.length} link(s) created.<br />
          Invoice is now the P&L source. Transaction marked as reconciled.
        </div>
      </div>
    </div>
  )

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>
              {sourceType === 'transaction' ? '🔗 Reconcile transaction with invoice' : '🔗 Reconcile invoice with transaction'}
            </div>
            <div style={s.headerSub}>
              {sourceType === 'transaction'
                ? 'Link this direct transaction to one or more invoices. Invoice will take over P&L.'
                : 'Link this invoice to one or more existing direct transactions.'}
            </div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={s.body}>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888', fontSize: '14px' }}>Loading...</div>
          ) : (
            <>
              {/* Source summary */}
              <div style={s.sourceCard}>
                <div style={s.sourceCardLabel}>
                  {sourceType === 'transaction' ? 'Direct transaction' : 'Invoice'}
                </div>
                <div style={s.sourceCardRow}>
                  <div>
                    <div style={s.sourceCardPartner}>{source?.partners?.name || '—'}</div>
                    <div style={s.sourceCardMeta}>
                      {sourceType === 'transaction'
                        ? `${source?.transaction_date} · ${source?.companies?.name} · ${source?.banks?.name}`
                        : `${source?.invoice_date} · ${source?.invoice_number || 'No invoice number'} · ${source?.companies?.name}`
                      }
                    </div>
                    {(source?.pl_category || source?.revenue_stream) && (
                      <div style={s.sourceCardMeta}>
                        P&L: {source?.pl_category || source?.revenue_stream}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={s.sourceCardAmount}>
                      {(source?.amount || 0).toLocaleString()} {source?.currency}
                    </div>
                    <div style={s.sourceCardUsd}>${(source?.amount_usd || 0).toFixed(2)}</div>
                  </div>
                </div>

                {/* Already reconciled links */}
                {existingLinks.length > 0 && (
                  <div style={s.existingLinks}>
                    <div style={s.existingLinksLabel}>Already linked</div>
                    {existingLinks.map(el => (
                      <div key={el.id} style={s.existingLinkRow}>
                        <span style={{ fontSize: '12px', color: '#666' }}>
                          {sourceType === 'transaction'
                            ? `${el.invoices?.partners?.name || '—'} · ${el.invoices?.invoice_number || '—'} · ${el.invoices?.invoice_date}`
                            : `${el.transactions?.partners?.name || '—'} · ${el.transactions?.statement_number || '—'} · ${el.transactions?.transaction_date}`
                          }
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: '500', color: '#1D9E75' }}>
                          ${(el.allocated_amount_usd || 0).toFixed(2)} allocated
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Allocation summary bar */}
              <div style={s.allocBar}>
                <div style={s.allocBarItem}>
                  <span style={s.allocBarLabel}>Total</span>
                  <span style={s.allocBarVal}>${sourceAmountUsd.toFixed(2)}</span>
                </div>
                <div style={s.allocBarDivider} />
                <div style={s.allocBarItem}>
                  <span style={s.allocBarLabel}>Previously linked</span>
                  <span style={{ ...s.allocBarVal, color: '#888' }}>
                    ${existingLinks.reduce((s, l) => s + (l.allocated_amount_usd || 0), 0).toFixed(2)}
                  </span>
                </div>
                <div style={s.allocBarDivider} />
                <div style={s.allocBarItem}>
                  <span style={s.allocBarLabel}>New allocation</span>
                  <span style={{ ...s.allocBarVal, color: '#1D9E75' }}>${totalAllocated.toFixed(2)}</span>
                </div>
                <div style={s.allocBarDivider} />
                <div style={s.allocBarItem}>
                  <span style={s.allocBarLabel}>Remaining</span>
                  <span style={{
                    ...s.allocBarVal,
                    color: Math.abs(unallocated) < 0.01 ? '#1D9E75' : unallocated < 0 ? '#A32D2D' : '#633806',
                    fontWeight: '600'
                  }}>
                    ${unallocated.toFixed(2)}
                    {Math.abs(unallocated) < 0.01 && ' ✓'}
                    {unallocated < 0 && ' ⚠️'}
                  </span>
                </div>
              </div>

              {/* P&L reclassification notice */}
              {links.length > 0 && (
                <div style={s.reclassNotice}>
                  <span style={{ fontSize: '15px' }}>📊</span>
                  <div>
                    <div style={{ fontWeight: '500', fontSize: '12px', marginBottom: '2px' }}>P&L will be reclassified</div>
                    <div style={{ fontSize: '11px', opacity: 0.85 }}>
                      {sourceType === 'transaction'
                        ? 'The transaction will lose P&L impact. The linked invoice(s) will become the P&L source with their own categories.'
                        : 'The linked transaction(s) will lose P&L impact. This invoice will be the P&L source.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Search */}
              <div style={{ marginBottom: '10px' }}>
                <input
                  style={s.searchInput}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={sourceType === 'transaction'
                    ? 'Search invoices by partner or invoice number...'
                    : 'Search transactions by partner or statement number...'}
                />
              </div>

              {/* Candidates list */}
              <div style={s.candidateList}>
                {filteredCandidates.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
                    No {sourceType === 'transaction' ? 'invoices' : 'direct transactions'} found for this company.
                  </div>
                ) : (
                  filteredCandidates.map(c => {
                    const linked = isLinked(c.id)
                    const alreadyDone = isAlreadyReconciled(c.id)
                    return (
                      <div key={c.id} style={{
                        ...s.candidateRow,
                        ...(linked ? s.candidateRowLinked : {}),
                        ...(alreadyDone ? s.candidateRowDone : {}),
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={s.candidatePartner}>
                              {c.partner_name || c.partners?.name || '—'}
                            </span>
                            {(c.invoice_number || c.statement_number) && (
                              <span style={s.candidateIdentifier}>
                                {c.invoice_number || c.statement_number}
                              </span>
                            )}
                            <span style={{ ...s.statusBadge, ...getStatusStyle(c.calculated_status || c.status || c.type) }}>
                              {c.calculated_status || c.status || c.type}
                            </span>
                            {alreadyDone && (
                              <span style={{ fontSize: '10px', color: '#1D9E75', fontWeight: '500' }}>✓ Linked</span>
                            )}
                          </div>
                          <div style={s.candidateMeta}>
                            {c.invoice_date || c.transaction_date}
                            {(c.pl_category || c.revenue_stream) && ` · ${c.pl_category || c.revenue_stream}`}
                            {sourceType === 'transaction' && c.remaining_usd !== undefined && (
                              <span style={{ color: c.remaining_usd > 0 ? '#A32D2D' : '#1D9E75' }}>
                                {' · '}Remaining: ${(c.remaining_usd || 0).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', marginRight: '10px', flexShrink: 0 }}>
                          <div style={s.candidateAmt}>{(c.amount || 0).toLocaleString()} {c.currency}</div>
                          <div style={s.candidateUsd}>${(c.amount_usd || 0).toFixed(2)}</div>
                        </div>
                        {!alreadyDone ? (
                          !linked ? (
                            <button style={s.addBtn} onClick={() => addLink(c)}>+ Link</button>
                          ) : (
                            <button style={s.removeBtn} onClick={() => removeLink(c.id)}>✕ Remove</button>
                          )
                        ) : (
                          <div style={{ width: '72px' }} />
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Allocation inputs for selected links */}
              {links.length > 0 && (
                <div style={s.allocationSection}>
                  <div style={s.allocationTitle}>Allocation per link</div>
                  {links.map(link => (
                    <div key={link.id} style={s.allocationRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{link.partner_name}</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          {link.identifier !== '—' ? link.identifier + ' · ' : ''}
                          {link.date}
                          {link.remaining_usd > 0 && ` · Remaining: $${link.remaining_usd.toFixed(2)}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span style={{ fontSize: '12px', color: '#888' }}>USD</span>
                        <input
                          type="number"
                          style={s.allocInput}
                          value={link.allocated_usd}
                          onChange={e => updateAllocation(link.id, parseFloat(e.target.value) || 0)}
                          min={0}
                        />
                        {link.remaining_usd > 0 && (
                          <button
                            style={s.maxBtn}
                            onClick={() => updateAllocation(link.id, Math.min(link.remaining_usd, unallocated + link.allocated_usd))}
                          >
                            Max
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <div style={{ fontSize: '12px', color: '#888' }}>
            {links.length === 0
              ? 'Select one or more entries to link'
              : `${links.length} link(s) ready · $${totalAllocated.toFixed(2)} allocated`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={s.btnGhost} onClick={onClose}>Cancel</button>
            <button
              style={{ ...s.btnPrimary, opacity: links.length === 0 || saving ? 0.5 : 1 }}
              onClick={handleSave}
              disabled={links.length === 0 || saving}
            >
              {saving ? 'Saving...' : `Save & reconcile (${links.length})`}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  panel: { background: '#fff', borderRadius: '16px', width: '860px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { background: '#0a1628', padding: '1rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  headerTitle: { color: '#fff', fontSize: '15px', fontWeight: '500', marginBottom: '3px' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: '12px', lineHeight: '1.4' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 },
  body: { padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '1rem 1.5rem', borderTop: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f5f5f3' },
  sourceCard: { background: '#f5f5f3', border: '0.5px solid #e5e5e5', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' },
  sourceCardLabel: { fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' },
  sourceCardRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  sourceCardPartner: { fontSize: '14px', fontWeight: '500', color: '#111', marginBottom: '3px' },
  sourceCardMeta: { fontSize: '12px', color: '#888', marginBottom: '2px' },
  sourceCardAmount: { fontSize: '15px', fontWeight: '500', color: '#111' },
  sourceCardUsd: { fontSize: '12px', color: '#1D9E75', fontWeight: '500' },
  existingLinks: { marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid #e5e5e5' },
  existingLinksLabel: { fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '6px' },
  existingLinkRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid #ececec' },
  allocBar: { display: 'flex', alignItems: 'center', background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '10px', padding: '10px 16px', marginBottom: '12px', gap: '0' },
  allocBarItem: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flex: 1 },
  allocBarLabel: { fontSize: '10px', color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' },
  allocBarVal: { fontSize: '14px', fontWeight: '500', color: '#111' },
  allocBarDivider: { width: '0.5px', height: '30px', background: '#e5e5e5', margin: '0 4px' },
  reclassNotice: { display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#E1F5EE', border: '0.5px solid #5DCAA5', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', color: '#085041' },
  searchInput: { width: '100%', fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 12px', border: '0.5px solid #e5e5e5', borderRadius: '8px', outline: 'none', background: '#fff', color: '#111', boxSizing: 'border-box' as const },
  candidateList: { display: 'flex', flexDirection: 'column' as const, gap: '6px', maxHeight: '280px', overflowY: 'auto' as const, marginBottom: '12px' },
  candidateRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff' },
  candidateRowLinked: { border: '1.5px solid #1D9E75', background: '#f0fdf8' },
  candidateRowDone: { background: '#fafaf9', opacity: 0.7 },
  candidatePartner: { fontSize: '13px', fontWeight: '500', color: '#111' },
  candidateIdentifier: { fontSize: '11px', color: '#888', background: '#f5f5f3', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace' },
  candidateMeta: { fontSize: '11px', color: '#888' },
  candidateAmt: { fontSize: '13px', fontWeight: '500', color: '#111', whiteSpace: 'nowrap' as const },
  candidateUsd: { fontSize: '11px', color: '#888' },
  statusBadge: { fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px' },
  addBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 14px', border: '0.5px solid #1D9E75', borderRadius: '6px', background: 'transparent', color: '#1D9E75', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  removeBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 14px', border: '0.5px solid #E24B4A', borderRadius: '6px', background: 'transparent', color: '#A32D2D', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  allocationSection: { background: '#f5f5f3', border: '0.5px solid #e5e5e5', borderRadius: '10px', padding: '12px 14px' },
  allocationTitle: { fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid #e5e5e5' },
  allocationRow: { display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '8px', marginBottom: '8px', borderBottom: '0.5px solid #ececec' },
  allocInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', background: '#fff', color: '#111', outline: 'none', width: '110px', textAlign: 'right' as const },
  maxBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 8px', border: '0.5px solid #e5e5e5', borderRadius: '6px', background: '#fff', color: '#666', cursor: 'pointer' },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'transparent', color: '#666', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: '500' },
}