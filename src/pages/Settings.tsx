import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NavContext } from '../App'
import type { Page } from '../App'
import { supabase } from '../supabase'
import UserManagement from '../components/UserManagement'

type SettingsTab = 'companies' | 'pl' | 'departments' | 'descriptions' | 'users'

export default function Settings() {
  const { user, signOut, canManageSettings, canManageUsers } = useAuth()
  const { setPage } = React.useContext(NavContext)
  const [activeTab, setActiveTab] = useState<SettingsTab>('companies')

  const pageMap: Record<string, Page> = {
    'Dashboard': 'dashboard', 'Transactions': 'transactions',
    'P&L': 'pl', 'Cash Flow': 'cashflow', 'Reports': 'reports',
    'Partners': 'partners', 'Settings': 'settings',
  }

  return (
    <div style={s.root}>
      <nav style={s.nav}>
        <div style={s.navLogo}>
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
            <polygon points="18,2 34,30 2,30" fill="none" stroke="#1D9E75" strokeWidth="1.5" />
            <circle cx="18" cy="2" r="2" fill="#1D9E75" />
            <circle cx="34" cy="30" r="2" fill="#5DCAA5" />
            <circle cx="2" cy="30" r="2" fill="#9FE1CB" />
          </svg>
          <span style={s.navLogoText}>Mint<span style={{ color: '#1D9E75' }}>flow</span></span>
        </div>
        <div style={s.navLinks}>
          {['Dashboard', 'Transactions', 'P&L', 'Cash Flow', 'Reports', 'Partners', 'Settings'].map(l => (
            <span key={l} style={l === 'Settings' ? s.navLinkActive : s.navLink}
              onClick={() => setPage(pageMap[l])}>{l}</span>
          ))}
        </div>
        <div style={s.navRight}>
          <div style={s.navAvatar}>{user?.email?.substring(0, 2).toUpperCase()}</div>
          <span style={s.navEmail}>{user?.email}</span>
          <button style={s.navSignout} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Settings</div>
            <div style={s.pageSub}>Company profiles, P&L categories, departments and users</div>
          </div>
        </div>

        <div style={s.tabBar}>
          {([
            { id: 'companies', label: '🏢 Company profiles', show: true },
            { id: 'pl', label: '📊 P&L Categories', show: true },
            { id: 'departments', label: '🏗 Departments', show: true },
            { id: 'descriptions', label: '🏷 Expense descriptions', show: true },
            { id: 'users', label: '👥 Users', show: canManageUsers },
          ] as { id: SettingsTab; label: string; show: boolean }[]).filter(t => t.show).map(tab => (
            <button key={tab.id}
              style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'companies' && <CompanyProfilesTab canEdit={canManageSettings} />}
        {activeTab === 'pl' && <PLCategoriesTab canEdit={canManageSettings} />}
        {activeTab === 'departments' && <DepartmentsTab canEdit={canManageSettings} />}
        {activeTab === 'descriptions' && <DescriptionsTab canEdit={canManageSettings} />}
        {activeTab === 'users' && <UserManagement />}
      </div>
    </div>
  )
}

// ── Company Profiles Tab ─────────────────────────────────
function CompanyProfilesTab({ canEdit }: { canEdit: boolean }) {
  const [companies, setCompanies] = useState<any[]>([])
  const [profiles, setProfiles] = useState<Record<string, any>>({})
  const [bankAccounts, setBankAccounts] = useState<Record<string, any[]>>({})
  const [selectedCompany, setSelectedCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Profile form state
  const [fullLegalName, setFullLegalName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('Srbija')
  const [pib, setPib] = useState('')
  const [mb, setMb] = useState('')
  const [pdvNumber, setPdvNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')

  // Bank accounts
  const [companyBanks, setCompanyBanks] = useState<any[]>([])
  const [newBankName, setNewBankName] = useState('')
  const [newAccountNum, setNewAccountNum] = useState('')
  const [newCurrency, setNewCurrency] = useState('RSD')
  const [newSwift, setNewSwift] = useState('')
  const [newIban, setNewIban] = useState('')
  const [newIsPrimary, setNewIsPrimary] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: comp }, { data: prof }, { data: banks }] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('company_profiles').select('*'),
        supabase.from('company_bank_accounts').select('*').order('is_primary', { ascending: false }),
      ])
      if (comp) {
        setCompanies(comp)
        if (comp.length > 0) setSelectedCompany(comp[0])
      }
      if (prof) {
        const profileMap: Record<string, any> = {}
        prof.forEach(p => { profileMap[p.company_id] = p })
        setProfiles(profileMap)
      }
      if (banks) {
        const bankMap: Record<string, any[]> = {}
        banks.forEach(b => {
          if (!bankMap[b.company_id]) bankMap[b.company_id] = []
          bankMap[b.company_id].push(b)
        })
        setBankAccounts(bankMap)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedCompany) return
    const p = profiles[selectedCompany.id] || {}
    setFullLegalName(p.full_legal_name || '')
    setAddress(p.address || '')
    setCity(p.city || '')
    setCountry(p.country || 'Srbija')
    setPib(p.pib || '')
    setMb(p.mb || '')
    setPdvNumber(p.pdv_number || '')
    setPhone(p.phone || '')
    setEmail(p.email || '')
    setWebsite(p.website || '')
    setCompanyBanks(bankAccounts[selectedCompany.id] || [])
  }, [selectedCompany, profiles, bankAccounts])

  const saveProfile = async () => {
    if (!selectedCompany || !canEdit) return
    setSaving(true)
    const payload = {
      company_id: selectedCompany.id,
      full_legal_name: fullLegalName || null,
      address: address || null,
      city: city || null,
      country: country || null,
      pib: pib || null,
      mb: mb || null,
      pdv_number: pdvNumber || null,
      phone: phone || null,
      email: email || null,
      website: website || null,
      updated_at: new Date().toISOString(),
    }
    const existing = profiles[selectedCompany.id]
    if (existing) {
      await supabase.from('company_profiles').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('company_profiles').insert(payload)
    }
    // Refresh profiles
    const { data } = await supabase.from('company_profiles').select('*')
    if (data) {
      const m: Record<string, any> = {}
      data.forEach(p => { m[p.company_id] = p })
      setProfiles(m)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addBankAccount = async () => {
    if (!newBankName.trim() || !newAccountNum.trim() || !selectedCompany || !canEdit) return
    const payload = {
      company_id: selectedCompany.id,
      bank_name: newBankName.trim(),
      account_number: newAccountNum.trim(),
      currency: newCurrency,
      is_primary: newIsPrimary,
      swift: newSwift || null,
      iban: newIban || null,
    }
    // If marking as primary, unset others
    if (newIsPrimary) {
      await supabase.from('company_bank_accounts')
        .update({ is_primary: false })
        .eq('company_id', selectedCompany.id)
        .eq('currency', newCurrency)
    }
    await supabase.from('company_bank_accounts').insert(payload)
    const { data } = await supabase.from('company_bank_accounts').select('*')
      .eq('company_id', selectedCompany.id).order('is_primary', { ascending: false })
    setCompanyBanks(data || [])
    setBankAccounts(prev => ({ ...prev, [selectedCompany.id]: data || [] }))
    setNewBankName(''); setNewAccountNum(''); setNewCurrency('RSD')
    setNewSwift(''); setNewIban(''); setNewIsPrimary(false)
  }

  const deleteBankAccount = async (id: string) => {
    if (!canEdit || !window.confirm('Delete this bank account?')) return
    await supabase.from('company_bank_accounts').delete().eq('id', id)
    const updated = companyBanks.filter(b => b.id !== id)
    setCompanyBanks(updated)
    setBankAccounts(prev => ({ ...prev, [selectedCompany.id]: updated }))
  }

  const setPrimaryAccount = async (id: string, currency: string) => {
    if (!canEdit) return
    await supabase.from('company_bank_accounts')
      .update({ is_primary: false })
      .eq('company_id', selectedCompany.id)
      .eq('currency', currency)
    await supabase.from('company_bank_accounts').update({ is_primary: true }).eq('id', id)
    const { data } = await supabase.from('company_bank_accounts').select('*')
      .eq('company_id', selectedCompany.id).order('is_primary', { ascending: false })
    setCompanyBanks(data || [])
    setBankAccounts(prev => ({ ...prev, [selectedCompany.id]: data || [] }))
  }

  const currencyColor = (cur: string) => {
    if (cur === 'RSD') return { bg: '#FAEEDA', color: '#633806' }
    if (cur === 'USD') return { bg: '#E6F1FB', color: '#0C447C' }
    if (cur === 'EUR') return { bg: '#E1F5EE', color: '#085041' }
    return { bg: '#FBEAF0', color: '#72243E' }
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <>
      {!canEdit && <div style={s.readOnlyBanner}>👁 Read only — only administrators can modify company profiles.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'start' }}>

        {/* Company selector */}
        <div style={s.colPanel}>
          <div style={s.colHeader}>
            <div style={s.colTitle}>Companies</div>
            <span style={s.colCount}>{companies.length}</span>
          </div>
          <div style={s.itemList}>
            {companies.map(c => (
              <div key={c.id}
                style={{ ...s.itemRow, ...(selectedCompany?.id === c.id ? s.itemRowActive : {}), cursor: 'pointer' }}
                onClick={() => setSelectedCompany(c)}>
                <div>
                  <div style={s.itemName}>{c.name}</div>
                  <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>
                    {profiles[c.id] ? '✓ Profile set' : 'No profile yet'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Profile form */}
        {selectedCompany && (
          <div>
            {/* Legal info */}
            <div style={{ ...s.colPanel, marginBottom: '16px' }}>
              <div style={s.colHeader}>
                <div style={s.colTitle}>🏢 {selectedCompany.name} — Legal information</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {saved && <span style={{ fontSize: '12px', color: '#1D9E75', fontWeight: '500' }}>✓ Saved!</span>}
                  {canEdit && (
                    <button style={s.addBtn} onClick={saveProfile} disabled={saving}>
                      {saving ? 'Saving...' : 'Save changes'}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Full legal name</label>
                    <input style={s.formInput} value={fullLegalName} onChange={e => setFullLegalName(e.target.value)}
                      placeholder="e.g. Constellation d.o.o. Beograd" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>PIB (Tax ID)</label>
                    <input style={s.formInput} value={pib} onChange={e => setPib(e.target.value)}
                      placeholder="e.g. 109876543" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Matični broj (MB)</label>
                    <input style={s.formInput} value={mb} onChange={e => setMb(e.target.value)}
                      placeholder="e.g. 21234567" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>PDV broj</label>
                    <input style={s.formInput} value={pdvNumber} onChange={e => setPdvNumber(e.target.value)}
                      placeholder="e.g. RS109876543" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Address</label>
                    <input style={s.formInput} value={address} onChange={e => setAddress(e.target.value)}
                      placeholder="e.g. Resavska 23/1" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>City</label>
                    <input style={s.formInput} value={city} onChange={e => setCity(e.target.value)}
                      placeholder="e.g. Beograd" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Country</label>
                    <input style={s.formInput} value={country} onChange={e => setCountry(e.target.value)}
                      placeholder="e.g. Srbija" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Phone</label>
                    <input style={s.formInput} value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="e.g. +381 11 123 4567" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Email</label>
                    <input style={s.formInput} value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="e.g. office@constellation.rs" disabled={!canEdit} />
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Website</label>
                    <input style={s.formInput} value={website} onChange={e => setWebsite(e.target.value)}
                      placeholder="e.g. https://constellation.rs" disabled={!canEdit} />
                  </div>
                </div>
              </div>
            </div>

            {/* Bank accounts */}
            <div style={s.colPanel}>
              <div style={s.colHeader}>
                <div style={s.colTitle}>🏦 Bank accounts</div>
                <span style={s.colCount}>{companyBanks.length} account{companyBanks.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Existing accounts */}
              {companyBanks.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center' as const, color: '#aaa', fontSize: '13px' }}>
                  No bank accounts yet. Add one below.
                </div>
              ) : (
                <div style={{ padding: '8px 16px' }}>
                  {companyBanks.map(bank => {
                    const cc = currencyColor(bank.currency)
                    return (
                      <div key={bank.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '0.5px solid #f0f0ee' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{bank.bank_name}</span>
                            <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: cc.bg, color: cc.color }}>{bank.currency}</span>
                            {bank.is_primary && (
                              <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: '#E1F5EE', color: '#085041' }}>★ Primary</span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>{bank.account_number}</div>
                          {(bank.swift || bank.iban) && (
                            <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                              {bank.swift && `SWIFT: ${bank.swift}`}{bank.swift && bank.iban && ' · '}{bank.iban && `IBAN: ${bank.iban}`}
                            </div>
                          )}
                        </div>
                        {canEdit && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {!bank.is_primary && (
                              <button style={{ ...s.iconBtn, fontSize: '11px', padding: '3px 8px', border: '0.5px solid #e5e5e5', borderRadius: '6px' }}
                                onClick={() => setPrimaryAccount(bank.id, bank.currency)}>
                                Set primary
                              </button>
                            )}
                            <button style={s.iconBtn} onClick={() => deleteBankAccount(bank.id)}>🗑</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add new account */}
              {canEdit && (
                <div style={{ padding: '14px 16px', borderTop: '0.5px solid #e5e5e5', background: '#fafaf9' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px' }}>
                    Add bank account
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '8px', marginBottom: '8px' }}>
                    <div style={s.formField}>
                      <label style={s.formLabel}>Bank name</label>
                      <input style={s.formInput} value={newBankName} onChange={e => setNewBankName(e.target.value)}
                        placeholder="e.g. Raiffeisen Bank" />
                    </div>
                    <div style={s.formField}>
                      <label style={s.formLabel}>Account number</label>
                      <input style={s.formInput} value={newAccountNum} onChange={e => setNewAccountNum(e.target.value)}
                        placeholder="e.g. 265-1234567890-12" />
                    </div>
                    <div style={s.formField}>
                      <label style={s.formLabel}>Currency</label>
                      <select style={s.formInput} value={newCurrency} onChange={e => setNewCurrency(e.target.value)}>
                        <option>RSD</option>
                        <option>EUR</option>
                        <option>USD</option>
                        <option>AED</option>
                        <option>GBP</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'flex-end' }}>
                    <div style={s.formField}>
                      <label style={s.formLabel}>SWIFT (optional)</label>
                      <input style={s.formInput} value={newSwift} onChange={e => setNewSwift(e.target.value)}
                        placeholder="e.g. RZBSRSBG" />
                    </div>
                    <div style={s.formField}>
                      <label style={s.formLabel}>IBAN (optional)</label>
                      <input style={s.formInput} value={newIban} onChange={e => setNewIban(e.target.value)}
                        placeholder="e.g. RS35265..." />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                      <label style={{ ...s.formLabel, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newIsPrimary} onChange={e => setNewIsPrimary(e.target.checked)} />
                        Primary
                      </label>
                      <button style={s.addBtn} onClick={addBankAccount}>+ Add account</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── P&L Categories Tab ───────────────────────────────────
function PLCategoriesTab({ canEdit }: { canEdit: boolean }) {
  const [categories, setCategories] = useState<any[]>([])
  const [subcategories, setSubcategories] = useState<any[]>([])
  const [selectedCat, setSelectedCat] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [newCatName, setNewCatName] = useState('')
  const [newSubName, setNewSubName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('pl_categories').select('*').order('sort_order')
    if (data) { setCategories(data); if (!selectedCat && data.length > 0) setSelectedCat(data[0]) }
    setLoading(false)
  }, [selectedCat])

  const fetchSubcategories = useCallback(async (catId: string) => {
    const { data } = await supabase.from('pl_subcategories').select('*').eq('category_id', catId).order('sort_order')
    if (data) setSubcategories(data)
  }, [])

  useEffect(() => { fetchCategories() }, []) // eslint-disable-line
  useEffect(() => { if (selectedCat) fetchSubcategories(selectedCat.id) }, [selectedCat]) // eslint-disable-line

  const addCategory = async () => {
    if (!newCatName.trim() || !canEdit) return
    await supabase.from('pl_categories').insert({ name: newCatName.trim(), sort_order: categories.length + 1 })
    setNewCatName(''); fetchCategories()
  }

  const addSubcategory = async () => {
    if (!newSubName.trim() || !selectedCat || !canEdit) return
    await supabase.from('pl_subcategories').insert({ category_id: selectedCat.id, name: newSubName.trim(), sort_order: subcategories.length + 1 })
    setNewSubName(''); fetchSubcategories(selectedCat.id)
  }

  const updateName = async (table: string, id: string) => {
    if (!editingName.trim() || !canEdit) return
    await supabase.from(table).update({ name: editingName.trim() }).eq('id', id)
    setEditingId(null); setEditingName('')
    if (table === 'pl_categories') fetchCategories()
    else if (selectedCat) fetchSubcategories(selectedCat.id)
  }

  const deleteItem = async (table: string, id: string) => {
    if (!canEdit || !window.confirm('Delete this item?')) return
    await supabase.from(table).delete().eq('id', id)
    if (table === 'pl_categories') { fetchCategories(); setSelectedCat(null) }
    else if (selectedCat) fetchSubcategories(selectedCat.id)
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <>
      {!canEdit && <div style={s.readOnlyBanner}>👁 Read only — only administrators can modify categories.</div>}
      <div style={s.twoCol}>
        <div style={s.colPanel}>
          <div style={s.colHeader}>
            <div style={s.colTitle}>P&L Categories</div>
            <span style={s.colCount}>{categories.length}</span>
          </div>
          <div style={s.itemList}>
            {categories.map(cat => (
              <div key={cat.id}
                style={{ ...s.itemRow, ...(selectedCat?.id === cat.id ? s.itemRowActive : {}) }}
                onClick={() => setSelectedCat(cat)}>
                {editingId === cat.id ? (
                  <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') updateName('pl_categories', cat.id) }}
                    onClick={e => e.stopPropagation()} autoFocus />
                ) : (
                  <span style={s.itemName}>{cat.name}</span>
                )}
                {canEdit && (
                  <div style={s.itemActions} onClick={e => e.stopPropagation()}>
                    {editingId === cat.id
                      ? <button style={s.saveBtn} onClick={() => updateName('pl_categories', cat.id)}>✓</button>
                      : <button style={s.iconBtn} onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}>✏️</button>}
                    <button style={s.iconBtn} onClick={() => deleteItem('pl_categories', cat.id)}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <div style={s.addRow}>
              <input style={s.addInput} value={newCatName} onChange={e => setNewCatName(e.target.value)}
                placeholder="New category..." onKeyDown={e => { if (e.key === 'Enter') addCategory() }} />
              <button style={s.addBtn} onClick={addCategory}>+ Add</button>
            </div>
          )}
        </div>

        <div style={s.colPanel}>
          <div style={s.colHeader}>
            <div style={s.colTitle}>{selectedCat ? `Subcategories — ${selectedCat.name}` : 'Select a category'}</div>
            {selectedCat && <span style={s.colCount}>{subcategories.length}</span>}
          </div>
          {!selectedCat ? (
            <div style={s.emptyHint}>← Select a P&L category to manage its subcategories</div>
          ) : (
            <>
              <div style={s.itemList}>
                {subcategories.map(sub => (
                  <div key={sub.id} style={s.itemRow}>
                    {editingId === sub.id ? (
                      <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') updateName('pl_subcategories', sub.id) }} autoFocus />
                    ) : (
                      <span style={s.itemName}>{sub.name}</span>
                    )}
                    {canEdit && (
                      <div style={s.itemActions}>
                        {editingId === sub.id
                          ? <button style={s.saveBtn} onClick={() => updateName('pl_subcategories', sub.id)}>✓</button>
                          : <button style={s.iconBtn} onClick={() => { setEditingId(sub.id); setEditingName(sub.name) }}>✏️</button>}
                        <button style={s.iconBtn} onClick={() => deleteItem('pl_subcategories', sub.id)}>🗑</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div style={s.addRow}>
                  <input style={s.addInput} value={newSubName} onChange={e => setNewSubName(e.target.value)}
                    placeholder="New subcategory..." onKeyDown={e => { if (e.key === 'Enter') addSubcategory() }} />
                  <button style={s.addBtn} onClick={addSubcategory}>+ Add</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Departments Tab ──────────────────────────────────────
function DepartmentsTab({ canEdit }: { canEdit: boolean }) {
  const [departments, setDepartments] = useState<any[]>([])
  const [subcategories, setSubcategories] = useState<any[]>([])
  const [selectedDept, setSelectedDept] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [newDeptName, setNewDeptName] = useState('')
  const [newSubName, setNewSubName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const fetchDepartments = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('departments').select('*').order('sort_order')
    if (data) { setDepartments(data); if (!selectedDept && data.length > 0) setSelectedDept(data[0]) }
    setLoading(false)
  }, [selectedDept])

  const fetchSubcategories = useCallback(async (deptId: string) => {
    const { data } = await supabase.from('dept_subcategories').select('*').eq('department_id', deptId).order('sort_order')
    if (data) setSubcategories(data)
  }, [])

  useEffect(() => { fetchDepartments() }, []) // eslint-disable-line
  useEffect(() => { if (selectedDept) fetchSubcategories(selectedDept.id) }, [selectedDept]) // eslint-disable-line

  const addDepartment = async () => {
    if (!newDeptName.trim() || !canEdit) return
    await supabase.from('departments').insert({ name: newDeptName.trim(), sort_order: departments.length + 1 })
    setNewDeptName(''); fetchDepartments()
  }

  const addSubcategory = async () => {
    if (!newSubName.trim() || !selectedDept || !canEdit) return
    await supabase.from('dept_subcategories').insert({ department_id: selectedDept.id, name: newSubName.trim(), sort_order: subcategories.length + 1 })
    setNewSubName(''); fetchSubcategories(selectedDept.id)
  }

  const updateName = async (table: string, id: string) => {
    if (!editingName.trim() || !canEdit) return
    await supabase.from(table).update({ name: editingName.trim() }).eq('id', id)
    setEditingId(null); setEditingName('')
    if (table === 'departments') fetchDepartments()
    else if (selectedDept) fetchSubcategories(selectedDept.id)
  }

  const deleteItem = async (table: string, id: string) => {
    if (!canEdit || !window.confirm('Delete this item?')) return
    await supabase.from(table).delete().eq('id', id)
    if (table === 'departments') { fetchDepartments(); setSelectedDept(null) }
    else if (selectedDept) fetchSubcategories(selectedDept.id)
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <>
      {!canEdit && <div style={s.readOnlyBanner}>👁 Read only — only administrators can modify departments.</div>}
      <div style={s.twoCol}>
        <div style={s.colPanel}>
          <div style={s.colHeader}>
            <div style={s.colTitle}>Departments</div>
            <span style={s.colCount}>{departments.length}</span>
          </div>
          <div style={s.itemList}>
            {departments.map(dept => (
              <div key={dept.id}
                style={{ ...s.itemRow, ...(selectedDept?.id === dept.id ? s.itemRowActive : {}) }}
                onClick={() => setSelectedDept(dept)}>
                {editingId === dept.id ? (
                  <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') updateName('departments', dept.id) }}
                    onClick={e => e.stopPropagation()} autoFocus />
                ) : (
                  <span style={s.itemName}>{dept.name}</span>
                )}
                {canEdit && (
                  <div style={s.itemActions} onClick={e => e.stopPropagation()}>
                    {editingId === dept.id
                      ? <button style={s.saveBtn} onClick={() => updateName('departments', dept.id)}>✓</button>
                      : <button style={s.iconBtn} onClick={() => { setEditingId(dept.id); setEditingName(dept.name) }}>✏️</button>}
                    <button style={s.iconBtn} onClick={() => deleteItem('departments', dept.id)}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <div style={s.addRow}>
              <input style={s.addInput} value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                placeholder="New department..." onKeyDown={e => { if (e.key === 'Enter') addDepartment() }} />
              <button style={s.addBtn} onClick={addDepartment}>+ Add</button>
            </div>
          )}
        </div>

        <div style={s.colPanel}>
          <div style={s.colHeader}>
            <div style={s.colTitle}>{selectedDept ? `Subcategories — ${selectedDept.name}` : 'Select a department'}</div>
            {selectedDept && <span style={s.colCount}>{subcategories.length}</span>}
          </div>
          {!selectedDept ? (
            <div style={s.emptyHint}>← Select a department to manage its subcategories</div>
          ) : (
            <>
              <div style={s.itemList}>
                {subcategories.map(sub => (
                  <div key={sub.id} style={s.itemRow}>
                    {editingId === sub.id ? (
                      <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') updateName('dept_subcategories', sub.id) }} autoFocus />
                    ) : (
                      <span style={s.itemName}>{sub.name}</span>
                    )}
                    {canEdit && (
                      <div style={s.itemActions}>
                        {editingId === sub.id
                          ? <button style={s.saveBtn} onClick={() => updateName('dept_subcategories', sub.id)}>✓</button>
                          : <button style={s.iconBtn} onClick={() => { setEditingId(sub.id); setEditingName(sub.name) }}>✏️</button>}
                        <button style={s.iconBtn} onClick={() => deleteItem('dept_subcategories', sub.id)}>🗑</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div style={s.addRow}>
                  <input style={s.addInput} value={newSubName} onChange={e => setNewSubName(e.target.value)}
                    placeholder="New subcategory..." onKeyDown={e => { if (e.key === 'Enter') addSubcategory() }} />
                  <button style={s.addBtn} onClick={addSubcategory}>+ Add</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Expense Descriptions Tab ─────────────────────────────
function DescriptionsTab({ canEdit }: { canEdit: boolean }) {
  const [subcategories, setSubcategories] = useState<any[]>([])
  const [descriptions, setDescriptions] = useState<any[]>([])
  const [selectedSub, setSelectedSub] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchSub, setSearchSub] = useState('')
  const [newDescName, setNewDescName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const fetchSubcategories = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('dept_subcategories').select('*, departments(name)').order('name')
    if (data) setSubcategories(data)
    setLoading(false)
  }, [])

  const fetchDescriptions = useCallback(async (subId: string) => {
    const { data } = await supabase.from('expense_descriptions').select('*').eq('dept_subcategory_id', subId).order('sort_order')
    if (data) setDescriptions(data)
  }, [])

  useEffect(() => { fetchSubcategories() }, []) // eslint-disable-line
  useEffect(() => { if (selectedSub) fetchDescriptions(selectedSub.id) }, [selectedSub]) // eslint-disable-line

  const addDescription = async () => {
    if (!newDescName.trim() || !selectedSub || !canEdit) return
    await supabase.from('expense_descriptions').insert({ dept_subcategory_id: selectedSub.id, name: newDescName.trim(), sort_order: descriptions.length + 1 })
    setNewDescName(''); fetchDescriptions(selectedSub.id)
  }

  const updateName = async (id: string) => {
    if (!editingName.trim() || !canEdit) return
    await supabase.from('expense_descriptions').update({ name: editingName.trim() }).eq('id', id)
    setEditingId(null); setEditingName('')
    if (selectedSub) fetchDescriptions(selectedSub.id)
  }

  const deleteDesc = async (id: string) => {
    if (!canEdit || !window.confirm('Delete this description?')) return
    await supabase.from('expense_descriptions').delete().eq('id', id)
    if (selectedSub) fetchDescriptions(selectedSub.id)
  }

  const filteredSubs = subcategories.filter(sub =>
    !searchSub || sub.name.toLowerCase().includes(searchSub.toLowerCase()) ||
    (sub.departments?.name || '').toLowerCase().includes(searchSub.toLowerCase())
  )

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <>
      {!canEdit && <div style={s.readOnlyBanner}>👁 Read only — only administrators can modify descriptions.</div>}
      <div style={s.twoCol}>
        <div style={s.colPanel}>
          <div style={s.colHeader}>
            <div style={s.colTitle}>Dept. subcategories</div>
            <span style={s.colCount}>{subcategories.length}</span>
          </div>
          <div style={{ padding: '8px 12px', borderBottom: '0.5px solid #f0f0ee' }}>
            <input style={{ ...s.addInput, width: '100%', boxSizing: 'border-box' as const }}
              value={searchSub} onChange={e => setSearchSub(e.target.value)} placeholder="Search subcategories..." />
          </div>
          <div style={s.itemList}>
            {filteredSubs.map(sub => (
              <div key={sub.id} style={{ ...s.itemRow, ...(selectedSub?.id === sub.id ? s.itemRowActive : {}) }}
                onClick={() => setSelectedSub(sub)}>
                <div>
                  <div style={s.itemName}>{sub.name}</div>
                  <div style={{ fontSize: '10px', color: '#aaa' }}>{sub.departments?.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={s.colPanel}>
          <div style={s.colHeader}>
            <div style={s.colTitle}>{selectedSub ? `Descriptions — ${selectedSub.name}` : 'Select a subcategory'}</div>
            {selectedSub && <span style={s.colCount}>{descriptions.length}</span>}
          </div>
          {!selectedSub ? (
            <div style={s.emptyHint}>← Select a subcategory to manage its expense descriptions</div>
          ) : (
            <>
              <div style={s.itemList}>
                {descriptions.map(desc => (
                  <div key={desc.id} style={s.itemRow}>
                    {editingId === desc.id ? (
                      <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') updateName(desc.id) }} autoFocus />
                    ) : (
                      <span style={s.itemName}>{desc.name}</span>
                    )}
                    {canEdit && (
                      <div style={s.itemActions}>
                        {editingId === desc.id
                          ? <button style={s.saveBtn} onClick={() => updateName(desc.id)}>✓</button>
                          : <button style={s.iconBtn} onClick={() => { setEditingId(desc.id); setEditingName(desc.name) }}>✏️</button>}
                        <button style={s.iconBtn} onClick={() => deleteDesc(desc.id)}>🗑</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div style={s.addRow}>
                  <input style={s.addInput} value={newDescName} onChange={e => setNewDescName(e.target.value)}
                    placeholder="New description..." onKeyDown={e => { if (e.key === 'Enter') addDescription() }} />
                  <button style={s.addBtn} onClick={addDescription}>+ Add</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#f5f5f3', fontFamily: 'system-ui,sans-serif' },
  nav: { background: '#0a1628', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: '52px' },
  navLogo: { display: 'flex', alignItems: 'center', gap: '8px' },
  navLogoText: { fontFamily: 'Georgia,serif', fontSize: '18px', fontWeight: '500', color: '#fff' },
  navLinks: { display: 'flex', gap: '4px' },
  navLink: { fontSize: '13px', color: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' },
  navLinkActive: { fontSize: '13px', color: '#fff', padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' },
  navRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  navAvatar: { width: '30px', height: '30px', borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '500', color: '#fff' },
  navEmail: { fontSize: '13px', color: 'rgba(255,255,255,0.7)' },
  navSignout: { background: 'none', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer' },
  body: { padding: '2rem 1.5rem' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle: { fontFamily: 'Georgia,serif', fontSize: '24px', fontWeight: '400', color: '#111', marginBottom: '4px' },
  pageSub: { fontSize: '13px', color: '#888' },
  tabBar: { display: 'flex', gap: 0, borderBottom: '0.5px solid #e5e5e5', marginBottom: '1.5rem', overflowX: 'auto' as const },
  tab: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '10px 20px', border: 'none', background: 'transparent', color: '#888', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-0.5px', whiteSpace: 'nowrap' as const },
  tabActive: { color: '#111', borderBottomColor: '#1D9E75', fontWeight: '500' },
  readOnlyBanner: { background: '#FAEEDA', border: '0.5px solid #E5B96A', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', color: '#633806', marginBottom: '16px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' },
  colPanel: { background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' },
  colHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '0.5px solid #e5e5e5', background: '#f5f5f3' },
  colTitle: { fontSize: '13px', fontWeight: '500', color: '#111' },
  colCount: { fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '10px', background: '#E1F5EE', color: '#085041' },
  itemList: { maxHeight: '420px', overflowY: 'auto' as const },
  itemRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '0.5px solid #f5f5f3', cursor: 'pointer' },
  itemRowActive: { background: '#f0fdf8', borderLeft: '3px solid #1D9E75' },
  itemName: { fontSize: '13px', color: '#111' },
  itemActions: { display: 'flex', gap: '4px', flexShrink: 0 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '2px 4px', borderRadius: '4px', opacity: 0.6 },
  saveBtn: { background: '#1D9E75', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', color: '#fff' },
  inlineInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '4px 8px', border: '1px solid #1D9E75', borderRadius: '6px', outline: 'none', flex: 1, color: '#111' },
  addRow: { display: 'flex', gap: '6px', padding: '10px 12px', borderTop: '0.5px solid #e5e5e5', background: '#fafaf9' },
  addInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', outline: 'none', flex: 1, color: '#111', background: '#fff' },
  addBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '7px 14px', border: 'none', borderRadius: '8px', background: '#1D9E75', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  emptyHint: { padding: '2rem', textAlign: 'center' as const, color: '#aaa', fontSize: '13px' },
  loading: { padding: '2rem', textAlign: 'center' as const, color: '#888', fontSize: '14px' },
  formField: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  formLabel: { fontSize: '10px', fontWeight: '500', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  formInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '0.5px solid #e5e5e5', borderRadius: '8px', outline: 'none', color: '#111', background: '#fff' },
}