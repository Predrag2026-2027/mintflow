import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Partners() {

  const [partners, setPartners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [showDialog, setShowDialog] = useState(false)
  const [editPartner, setEditPartner] = useState<any>(null)

  const fetchPartners = async () => {
    setLoading(true)
    const { data } = await supabase.from('partners').select('*').order('name')
    if (data) setPartners(data)
    setLoading(false)
  }

  useEffect(() => { fetchPartners() }, [])

  const deletePartner = async (id: string) => {
    if (!window.confirm('Delete this partner?')) return
    await supabase.from('partners').delete().eq('id', id)
    fetchPartners()
    setShowMenu(null)
  }

  const filtered = partners.filter(p => {
    const matchType = filterType === 'all' || p.type === filterType
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.tax_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.contact_email || '').toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const typeColors: Record<string, { bg: string; color: string }> = {
    vendor: { bg: 'rgba(255,91,90,0.13)', color: '#FF5B5A' },
    customer: { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' },
    both: { bg: 'rgba(78,168,255,0.13)', color: '#4EA8FF' },
    company: { bg: 'rgba(255,255,255,0.06)', color: '#7A9BB8' },
  }

  const typeLabels: Record<string, string> = {
    vendor: 'Vendor', customer: 'Customer', both: 'Both', company: 'Company',
  }

  return (
    <div style={s.root}>
      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Partners</div>
            <div style={s.pageSub}>Vendors, customers and all business contacts</div>
          </div>
          <button style={s.newBtn} onClick={() => { setEditPartner(null); setShowDialog(true) }}>
            + New partner
          </button>
        </div>

        <div style={s.summaryRow}>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total partners</div>
            <div style={s.summaryVal}>{partners.length}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Vendors</div>
            <div style={{ ...s.summaryVal, color: '#FF5B5A' }}>
              {partners.filter(p => p.type === 'vendor' || p.type === 'both').length}
            </div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Customers</div>
            <div style={{ ...s.summaryVal, color: '#00D47E' }}>
              {partners.filter(p => p.type === 'customer' || p.type === 'both').length}
            </div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Active</div>
            <div style={s.summaryVal}>{partners.filter(p => p.is_active !== false).length}</div>
          </div>
        </div>

        <div style={s.filterBar}>
          <input type="text" placeholder="Search name, tax ID or email..."
            value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput} />
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={s.filterSelect}>
            <option value="all">All types</option>
            <option value="vendor">Vendors</option>
            <option value="customer">Customers</option>
            <option value="both">Both</option>
            <option value="company">Company</option>
          </select>
          <div style={s.totalBadge}>{filtered.length} partners</div>
        </div>

        <div style={s.tableWrap}>
          {loading ? (
            <div style={s.emptyState}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={s.emptyState}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤝</div>
              <div style={{ fontSize: '15px', fontWeight: '500', color: '#DCE9F6', marginBottom: '6px' }}>No partners yet</div>
              <div style={{ fontSize: '13px', color: '#7A9BB8', marginBottom: '20px' }}>Add your first vendor or customer.</div>
              <button style={s.newBtn} onClick={() => setShowDialog(true)}>+ New partner</button>
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Type</th>
                  <th style={s.th}>Tax ID / PIB</th>
                  <th style={s.th}>City</th>
                  <th style={s.th}>Contact</th>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Phone</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} style={{ ...s.tr, background: i % 2 === 0 ? '#0D1B2C' : '#111F30', cursor: 'pointer' }}
                    onClick={() => { setEditPartner(p); setShowDialog(true) }}>
                    <td style={s.td}>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: '#00D47E' }}>{p.name}</div>
                      {p.address && <div style={{ fontSize: '11px', color: '#7A9BB8', marginTop: '1px' }}>{p.address}</div>}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: typeColors[p.type || 'vendor']?.bg || 'rgba(255,255,255,0.06)', color: typeColors[p.type || 'vendor']?.color || '#666' }}>
                        {typeLabels[p.type || 'vendor'] || p.type}
                      </span>
                    </td>
                    <td style={s.td}><span style={s.monoCell}>{p.tax_id || '—'}</span></td>
                    <td style={s.td}><span style={s.smallCell}>{p.city || '—'}</span></td>
                    <td style={s.td}><span style={s.smallCell}>{p.contact_name || '—'}</span></td>
                    <td style={s.td}><span style={s.smallCell}>{p.contact_email || '—'}</span></td>
                    <td style={s.td}><span style={s.smallCell}>{p.contact_phone || '—'}</span></td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: p.is_active !== false ? 'rgba(0,212,126,0.12)' : 'rgba(255,255,255,0.06)', color: p.is_active !== false ? '#085041' : '#888' }}>
                        {p.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={s.td} onClick={e => e.stopPropagation()}>
                      <button style={s.deleteBtn} onClick={() => deletePartner(p.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showDialog && (
        <PartnerDialog
          partner={editPartner}
          onClose={() => { setShowDialog(false); setEditPartner(null) }}
          onSaved={() => { setShowDialog(false); setEditPartner(null); fetchPartners() }}
        />
      )}
    </div>
  )
}

function PartnerDialog({ partner, onClose, onSaved }: { partner: any; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'accounts'>('info')

  // Partner fields
  const [name, setName] = useState(partner?.name || '')
  const [type, setType] = useState(partner?.type || 'vendor')
  const [taxId, setTaxId] = useState(partner?.tax_id || '')
  const [address, setAddress] = useState(partner?.address || '')
  const [city, setCity] = useState(partner?.city || '')
  const [country, setCountry] = useState(partner?.country || '')
  const [contactName, setContactName] = useState(partner?.contact_name || '')
  const [contactEmail, setContactEmail] = useState(partner?.contact_email || '')
  const [contactPhone, setContactPhone] = useState(partner?.contact_phone || '')
  const [note, setNote] = useState(partner?.note || '')
  const [isActive, setIsActive] = useState(partner?.is_active !== false)

  // Bank accounts
  const [accounts, setAccounts] = useState<any[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [newAccNum, setNewAccNum] = useState('')
  const [newBankName, setNewBankName] = useState('')
  const [newCurrency, setNewCurrency] = useState('RSD')
  const [newModel, setNewModel] = useState('')
  const [addingAccount, setAddingAccount] = useState(false)

  const fetchAccounts = async () => {
    if (!partner?.id) return
    setLoadingAccounts(true)
    const { data } = await supabase
      .from('partner_accounts')
      .select('*')
      .eq('partner_id', partner.id)
      .order('is_primary', { ascending: false })
    if (data) setAccounts(data)
    setLoadingAccounts(false)
  }

  useEffect(() => {
    if (partner?.id) fetchAccounts()
  }, [partner?.id]) // eslint-disable-line

  const setPrimary = async (accountId: string) => {
    // Ukloni primary sa svih
    await supabase.from('partner_accounts').update({ is_primary: false }).eq('partner_id', partner.id)
    // Postavi novi primary
    await supabase.from('partner_accounts').update({ is_primary: true }).eq('id', accountId)
    fetchAccounts()
  }

  const deleteAccount = async (accountId: string) => {
    if (!window.confirm('Delete this bank account?')) return
    await supabase.from('partner_accounts').delete().eq('id', accountId)
    fetchAccounts()
  }

  const addAccount = async () => {
    if (!newAccNum.trim()) return
    setAddingAccount(true)
    const isPrimary = accounts.length === 0
    await supabase.from('partner_accounts').insert({
      partner_id: partner.id,
      account_number: newAccNum.trim(),
      bank_name: newBankName.trim() || null,
      currency: newCurrency,
      model: newModel.trim() || null,
      is_primary: isPrimary,
    })
    setNewAccNum('')
    setNewBankName('')
    setNewModel('')
    setNewCurrency('RSD')
    fetchAccounts()
    setAddingAccount(false)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const payload = {
      name: name.trim(), type,
      tax_id: taxId || null, address: address || null,
      city: city || null, country: country || null,
      contact_name: contactName || null, contact_email: contactEmail || null,
      contact_phone: contactPhone || null, note: note || null,
      is_active: isActive,
    }
    if (partner?.id) {
      await supabase.from('partners').update(payload).eq('id', partner.id)
    } else {
      await supabase.from('partners').insert(payload)
    }
    setSuccess(true)
    setTimeout(() => { setSuccess(false); onSaved() }, 1200)
    setSaving(false)
  }

  if (success) return (
    <div style={ds.overlay}>
      <div style={{ ...ds.dialog, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minHeight: '180px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(0,212,126,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '18px', color: '#DCE9F6' }}>
          {partner ? 'Partner updated!' : 'Partner added!'}
        </div>
      </div>
    </div>
  )

  return (
    <div style={ds.overlay}>
      <div style={ds.dialog}>
        <div style={ds.header}>
          <div style={ds.headerTitle}>{partner ? 'Edit partner' : 'New partner'}</div>
          <button style={ds.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Tabs — samo za edit mode */}
        {partner?.id && (
          <div style={ds.tabBar}>
            <button style={{ ...ds.tab, ...(activeTab === 'info' ? ds.tabActive : {}) }} onClick={() => setActiveTab('info')}>
              📋 Basic info
            </button>
            <button style={{ ...ds.tab, ...(activeTab === 'accounts' ? ds.tabActive : {}) }} onClick={() => setActiveTab('accounts')}>
              🏦 Bank accounts
              {accounts.length > 0 && <span style={ds.tabBadge}>{accounts.length}</span>}
            </button>
          </div>
        )}

        <div style={ds.body}>

          {/* ── TAB: Basic info ── */}
          {activeTab === 'info' && (
            <>
              <div style={ds.section}>
                <div style={ds.sectionTitle}>Basic info</div>
                <div style={ds.row2}>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Name <span style={{ color: '#E24B4A' }}>*</span></label>
                    <input style={ds.input} value={name} onChange={e => setName(e.target.value)} placeholder="Partner name..." />
                  </div>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Type <span style={{ color: '#E24B4A' }}>*</span></label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[{ id: 'vendor', label: '📤 Vendor' }, { id: 'customer', label: '📥 Customer' }, { id: 'both', label: '🔄 Both' }, { id: 'company', label: '🏢 Company' }].map(t => (
                        <div key={t.id} style={{ ...ds.typeChip, ...(type === t.id ? ds.typeChipActive : {}) }} onClick={() => setType(t.id)}>
                          {t.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={ds.row2}>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Tax ID / PIB</label>
                    <input style={ds.input} value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="e.g. 123456789" />
                  </div>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Country</label>
                    <input style={ds.input} value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Serbia" />
                  </div>
                </div>
                <div style={ds.row2}>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Address</label>
                    <input style={ds.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address..." />
                  </div>
                  <div style={ds.field}>
                    <label style={ds.lbl}>City</label>
                    <input style={ds.input} value={city} onChange={e => setCity(e.target.value)} placeholder="City..." />
                  </div>
                </div>
              </div>

              <div style={ds.section}>
                <div style={ds.sectionTitle}>Contact</div>
                <div style={ds.row3}>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Contact person</label>
                    <input style={ds.input} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Full name..." />
                  </div>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Email</label>
                    <input style={ds.input} type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@example.com" />
                  </div>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Phone</label>
                    <input style={ds.input} value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+381..." />
                  </div>
                </div>
              </div>

              <div style={ds.section}>
                <div style={ds.sectionTitle}>Note & status</div>
                <div style={ds.field}>
                  <label style={ds.lbl}>Note</label>
                  <textarea style={ds.textarea} value={note} onChange={e => setNote(e.target.value)} placeholder="Additional notes..." />
                </div>
                <div style={{ ...ds.toggleRow, marginTop: '10px' }}>
                  <span style={{ fontSize: '13px', color: '#DCE9F6' }}>Active partner</span>
                  <label style={ds.toggle}>
                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ ...ds.toggleSlider, background: isActive ? '#1D9E75' : '#ddd' }} />
                  </label>
                </div>
              </div>
            </>
          )}

          {/* ── TAB: Bank accounts ── */}
          {activeTab === 'accounts' && (
            <div style={ds.section}>
              <div style={ds.sectionTitle}>Bank accounts</div>

              {loadingAccounts ? (
                <div style={{ padding: '20px', textAlign: 'center' as const, color: '#7A9BB8', fontSize: '13px' }}>Loading...</div>
              ) : accounts.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center' as const, color: 'rgba(255,255,255,0.30)', fontSize: '13px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '16px' }}>
                  No bank accounts yet.
                </div>
              ) : (
                <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                  {accounts.map(acc => (
                    <div key={acc.id} style={{ ...ds.accountRow, ...(acc.is_primary ? ds.accountRowPrimary : {}) }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#DCE9F6', fontFamily: 'monospace' }}>
                            {acc.account_number}
                          </span>
                          {acc.is_primary && (
                            <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: 'rgba(0,212,126,0.12)', color: '#00D47E' }}>
                              ★ Primary
                            </span>
                          )}
                          <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: 'rgba(255,255,255,0.06)', color: '#7A9BB8' }}>
                            {acc.currency || 'RSD'}
                          </span>
                        </div>
                        {acc.bank_name && (
                          <div style={{ fontSize: '11px', color: '#7A9BB8', marginTop: '2px' }}>{acc.bank_name}</div>
                        )}
                        {acc.model && (
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>Model: {acc.model}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {!acc.is_primary && (
                          <button style={ds.accountBtn} onClick={() => setPrimary(acc.id)}>
                            ★ Set primary
                          </button>
                        )}
                        <button style={{ ...ds.accountBtn, color: '#FF5B5A', borderColor: '#F5A9A9' }} onClick={() => deleteAccount(acc.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new account */}
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px', border: '0.5px solid #e5e5e5' }}>
                <div style={{ fontSize: '11px', fontWeight: '500', color: '#7A9BB8', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '10px' }}>
                  Add new account
                </div>
                <div style={ds.row2}>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Account number <span style={{ color: '#E24B4A' }}>*</span></label>
                    <input style={ds.input} value={newAccNum} onChange={e => setNewAccNum(e.target.value)} placeholder="e.g. 265-1234567-89" />
                  </div>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Bank name</label>
                    <input style={ds.input} value={newBankName} onChange={e => setNewBankName(e.target.value)} placeholder="e.g. Raiffeisen" />
                  </div>
                </div>
                <div style={ds.row2}>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Currency</label>
                    <select style={ds.select} value={newCurrency} onChange={e => setNewCurrency(e.target.value)}>
                      <option>RSD</option>
                      <option>EUR</option>
                      <option>USD</option>
                      <option>AED</option>
                    </select>
                  </div>
                  <div style={ds.field}>
                    <label style={ds.lbl}>Model</label>
                    <input style={ds.input} value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="e.g. 97" />
                  </div>
                </div>
                <button
                  style={{ ...ds.btnPrimary, opacity: !newAccNum.trim() || addingAccount ? 0.6 : 1 }}
                  onClick={addAccount}
                  disabled={!newAccNum.trim() || addingAccount}
                >
                  {addingAccount ? 'Adding...' : '+ Add account'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={ds.footer}>
          <button style={ds.btnGhost} onClick={onClose}>Cancel</button>
          {activeTab === 'info' && (
            <button style={ds.btnPrimary} onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : partner ? 'Update partner' : 'Save partner'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#060E1A', fontFamily: "'Inter', system-ui, sans-serif" },
  body: { padding: '24px 28px' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '24px', fontWeight: '400', color: '#DCE9F6', marginBottom: '4px' },
  pageSub: { fontSize: '13px', color: '#7A9BB8' },
  newBtn: { background: '#00D47E', color: '#060E1A', border: 'none', borderRadius: '8px', padding: '9px 18px', fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '500', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,212,126,0.3)' },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '1.5rem' },
  summaryCard: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', padding: '14px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' },
  summaryLabel: { fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '6px' },
  summaryVal: { fontSize: '26px', fontWeight: '600', color: '#DCE9F6' },
  filterBar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap' as const },
  searchInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#0D1B2C', color: '#DCE9F6', flex: '1', minWidth: '200px' },
  filterSelect: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '8px', padding: '8px 12px', outline: 'none', background: '#0D1B2C', color: '#DCE9F6', cursor: 'pointer' },
  totalBadge: { fontSize: '13px', color: '#7A9BB8', background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '8px', padding: '8px 12px', marginLeft: 'auto', whiteSpace: 'nowrap' as const, fontWeight: '500' },
  tableWrap: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', overflow: 'visible', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  thead: { background: '#060E1A' },
  th: { padding: '11px 12px', textAlign: 'left' as const, fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.075)', whiteSpace: 'nowrap' as const },
  tr: { borderBottom: '0.5px solid rgba(255,255,255,0.05)' },
  td: { padding: '10px 12px', verticalAlign: 'middle' as const },
  emptyState: { padding: '3rem', textAlign: 'center' as const, color: '#7A9BB8', fontSize: '14px' },
  badge: { fontSize: '11px', fontWeight: '500', padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap' as const },
  monoCell: { fontSize: '12px', fontFamily: 'monospace', color: '#7A9BB8', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', border: '0.5px solid rgba(255,255,255,0.10)' },
  smallCell: { fontSize: '12px', color: '#7A9BB8' },
  editBtn: { background: 'none', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#7A9BB8', fontSize: '14px' },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px', opacity: 0.3, transition: 'opacity 0.15s' },
  contextMenu: { position: 'fixed' as const, background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', zIndex: 9999, minWidth: '120px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' },
  contextItem: { padding: '8px 14px', fontSize: '13px', color: '#DCE9F6', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.05)' },
}

const ds: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  dialog: { background: '#0D1B2C', borderRadius: '16px', width: '720px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)' },
  header: { background: '#060E1A', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#DCE9F6', fontSize: '15px', fontWeight: '500' },
  closeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  tabBar: { display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.075)', background: '#111F30' },
  tab: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '10px 20px', border: 'none', background: 'transparent', color: '#7A9BB8', cursor: 'pointer', borderBottom: '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' },
  tabActive: { color: '#00D47E', borderBottom: '2px solid #00D47E', background: 'transparent', fontWeight: '500' },
  tabBadge: { fontSize: '10px', background: '#00D47E', color: '#060E1A', borderRadius: '20px', padding: '1px 6px', fontWeight: '500' },
  body: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  footer: { padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.075)', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#111F30' },
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '11px', fontWeight: '500', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.075)' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  lbl: { fontSize: '11px', fontWeight: '500', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  input: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', background: '#111F30', color: '#DCE9F6', outline: 'none' },
  select: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', background: '#111F30', color: '#DCE9F6', outline: 'none' },
  textarea: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', background: '#111F30', color: '#DCE9F6', outline: 'none', resize: 'vertical' as const, minHeight: '60px' },
  typeChip: { flex: 1, padding: '8px 6px', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', fontSize: '12px', cursor: 'pointer', textAlign: 'center' as const, color: '#7A9BB8' },
  typeChipActive: { border: '2px solid #00D47E', background: 'rgba(0,212,126,0.12)', color: '#00D47E', fontWeight: '500' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.075)' },
  toggle: { position: 'relative' as const, width: '36px', height: '20px', cursor: 'pointer', flexShrink: 0 },
  toggleSlider: { position: 'absolute' as const, inset: 0, borderRadius: '10px', transition: 'background 0.2s', display: 'block' },
  accountRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '8px', background: '#111F30' },
  accountRowPrimary: { border: '1.5px solid #00D47E', background: 'rgba(0,212,126,0.06)' },
  accountBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '6px', background: 'transparent', color: '#7A9BB8', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnGhost: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: '#7A9BB8', cursor: 'pointer' },
  btnPrimary: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#00D47E', color: '#060E1A', cursor: 'pointer', fontWeight: '500' },
}