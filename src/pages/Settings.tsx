import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'
import UserManagement from '../components/UserManagement'

type SettingsTab = 'companies' | 'pl' | 'departments' | 'descriptions' | 'users' | 'integrations'

const CHARGEBEE_SITES = [
  'kicksta', 'aimfox', 'flocks', 'nitreo', 'kenji', 'upleap',
  'socialfollow', 'engagementboostapp', 'upgram', 'stimsocial', 'jump-gram',
]

const PROCESSORS = [
  {
    id: 'braintree', label: 'Braintree', icon: '💳', color: '#4EA8FF',
    desc: 'SocialGrowth brands — CC processing (SGP* descriptors)',
    fields: [
      { key: 'merchant_id', label: 'Merchant ID',  placeholder: 'e.g. sunnyfloridaboatcompany', secret: false },
      { key: 'api_key',     label: 'Public Key',   placeholder: 'e.g. public_xxx',              secret: false },
      { key: 'api_secret',  label: 'Private Key',  placeholder: 'e.g. private_xxx',             secret: true  },
    ],
  },
  {
    id: 'paypal', label: 'PayPal', icon: '🅿️', color: '#F5A623',
    desc: 'All brands — support@socialgrowthpay.com account',
    fields: [
      { key: 'api_key',    label: 'Client ID',     placeholder: 'e.g. AxxxxYYYY',  secret: false },
      { key: 'api_secret', label: 'Client Secret', placeholder: 'e.g. ExxxxZZZZ',  secret: true  },
    ],
  },
  {
    id: 'stripe_us', label: 'Stripe US', icon: '💜', color: '#635BFF',
    desc: 'Kicksta — US Stripe account',
    fields: [
      { key: 'api_key', label: 'Secret Key', placeholder: 'sk_live_...', secret: true },
    ],
  },
  {
    id: 'stripe_uae', label: 'Stripe UAE', icon: '🟣', color: '#9D97FF',
    desc: 'AimFox — SocialGrowth L.L.C-FZ account',
    fields: [
      { key: 'api_key', label: 'Secret Key', placeholder: 'sk_live_...', secret: true },
    ],
  },
]

export default function Settings() {
  const { canManageSettings, canManageUsers } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('companies')

  return (
    <div style={s.root}>
      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.pageTitle}>Settings</div>
            <div style={s.pageSub}>Company profiles, P&L categories, departments and users</div>
          </div>
        </div>

        <div style={s.tabBar}>
          {([
            { id: 'companies',    label: '🏢 Company profiles',    show: true },
            { id: 'pl',           label: '📊 P&L Categories',      show: true },
            { id: 'departments',  label: '🏗 Departments',          show: true },
            { id: 'descriptions', label: '🏷 Expense descriptions', show: true },
            { id: 'integrations', label: '🔌 Integrations',         show: canManageSettings },
            { id: 'users',        label: '👥 Users',                show: canManageUsers },
          ] as { id: SettingsTab; label: string; show: boolean }[]).filter(t => t.show).map(tab => (
            <button key={tab.id}
              style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'companies'    && <CompanyProfilesTab canEdit={canManageSettings} />}
        {activeTab === 'pl'           && <PLCategoriesTab canEdit={canManageSettings} />}
        {activeTab === 'departments'  && <DepartmentsTab canEdit={canManageSettings} />}
        {activeTab === 'descriptions' && <DescriptionsTab canEdit={canManageSettings} />}
        {activeTab === 'integrations' && <IntegrationsTab canEdit={canManageSettings} />}
        {activeTab === 'users'        && <UserManagement />}
      </div>
    </div>
  )
}

// ── Integrations Tab ─────────────────────────────────────
function IntegrationsTab({ canEdit }: { canEdit: boolean }) {
  const [credentials, setCredentials] = useState<Record<string, any>>({})
  const [syncLogs, setSyncLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: creds }, { data: logs }] = await Promise.all([
      supabase.from('integration_credentials').select('*'),
      supabase.from('sync_logs').select('*').order('started_at', { ascending: false }).limit(20),
    ])
    if (creds) {
      const map: Record<string, any> = {}
      creds.forEach(c => { map[`${c.provider}__${c.site || ''}`] = c })
      setCredentials(map)
      const f: Record<string, Record<string, string>> = {}
      creds.forEach(c => {
        const key = `${c.provider}__${c.site || ''}`
        f[key] = { merchant_id: c.merchant_id || '', api_key: c.api_key || '', api_secret: c.api_secret || '' }
      })
      setForms(f)
    }
    if (logs) setSyncLogs(logs)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const getForm = (provider: string, site = '') => forms[`${provider}__${site}`] || {}

  const setField = (provider: string, site: string, field: string, value: string) => {
    const key = `${provider}__${site}`
    setForms(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }

  const saveCredential = async (provider: string, site = '') => {
    if (!canEdit) return
    const key = `${provider}__${site}`
    const form = forms[key] || {}
    setSaving(key)
    const payload = {
      provider, site: site || null,
      merchant_id: form.merchant_id || null,
      api_key: form.api_key || null,
      api_secret: form.api_secret || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    const existing = credentials[key]
    if (existing) {
      await supabase.from('integration_credentials').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('integration_credentials').insert(payload)
    }
    await fetchData()
    setSaving(null); setSaved(key)
    setTimeout(() => setSaved(null), 2500)
  }

  const toggleActive = async (provider: string, site = '') => {
    if (!canEdit) return
    const existing = credentials[`${provider}__${site}`]
    if (!existing) return
    await supabase.from('integration_credentials').update({ is_active: !existing.is_active }).eq('id', existing.id)
    await fetchData()
  }

  const getLastSync = (provider: string, site = '') =>
    syncLogs.find(l => l.provider === provider && (l.site === site || (!l.site && !site)))

  const formatSyncTime = (log: any) => {
    if (!log) return 'Never synced'
    const diff = Date.now() - new Date(log.started_at).getTime()
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(log.started_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }

  const statusDot = (log: any) => {
    if (!log) return { color: 'rgba(255,255,255,0.20)', label: 'No sync yet' }
    if (log.status === 'success') return { color: '#00D47E', label: `✓ ${log.records_created} new · ${log.records_skipped} skipped` }
    if (log.status === 'running') return { color: '#F5A623', label: '⟳ Running...' }
    return { color: '#FF5B5A', label: `✗ ${log.error_message || 'Error'}` }
  }

  if (loading) return <div style={s.loading}>Loading integrations...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '20px' }}>

      {!canEdit && (
        <div style={s.readOnlyBanner}>👁 Read only — only administrators can manage API credentials.</div>
      )}

      {/* ── CHARGEBEE ── */}
      <div style={s.colPanel}>
        <div style={s.colHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>📋</span>
            <div>
              <div style={s.colTitle}>Chargebee — Billing &amp; Subscriptions</div>
              <div style={{ fontSize: '11px', color: '#7A9BB8', marginTop: '2px' }}>11 sites · Full-Access API key required per site</div>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#7A9BB8' }}>Settings → Configure Chargebee → API Keys → Full-Access</div>
        </div>

        <div style={{ padding: '4px 0' }}>
          {CHARGEBEE_SITES.map((site, idx) => {
            const key = `chargebee__${site}`
            const cred = credentials[key]
            const form = getForm('chargebee', site)
            const isSaving = saving === key
            const isSaved = saved === key
            const lastSync = getLastSync('chargebee', site)
            const dot = statusDot(lastSync)
            const isRevealed = revealed[key]

            return (
              <div key={site} style={{
                display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: '12px', alignItems: 'center',
                padding: '10px 16px',
                borderBottom: idx < CHARGEBEE_SITES.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: cred?.is_active ? '#00D47E' : 'rgba(255,255,255,0.20)', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#DCE9F6' }}>{site}</span>
                    <span style={{ fontSize: '10px', color: '#7A9BB8' }}>.chargebee.com</span>
                  </div>
                  <div style={{ fontSize: '10px', color: dot.color, marginTop: '3px', paddingLeft: '13px' }}>
                    {formatSyncTime(lastSync)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    style={{ ...s.formInput, flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
                    type={isRevealed ? 'text' : 'password'}
                    value={form.api_key || ''}
                    onChange={e => setField('chargebee', site, 'api_key', e.target.value)}
                    placeholder={cred ? '••••••••••••••••' : 'live_xxxx... (Full-Access key)'}
                    disabled={!canEdit}
                  />
                  {cred && (
                    <button style={s.iconBtn} onClick={() => setRevealed(prev => ({ ...prev, [key]: !prev[key] }))}>
                      {isRevealed ? '🙈' : '👁'}
                    </button>
                  )}
                  {cred && canEdit && (
                    <button style={{ ...s.iconBtn, opacity: 0.7 }} onClick={() => toggleActive('chargebee', site)} title={cred.is_active ? 'Disable' : 'Enable'}>
                      {cred.is_active ? '⏸' : '▶️'}
                    </button>
                  )}
                </div>

                {canEdit && (
                  <button
                    style={{
                      ...s.addBtn, minWidth: '64px',
                      background: isSaved ? '#00D47E' : cred ? 'rgba(255,255,255,0.08)' : '#00D47E',
                      color: isSaved ? '#060E1A' : cred ? '#DCE9F6' : '#060E1A',
                    }}
                    onClick={() => saveCredential('chargebee', site)}
                    disabled={isSaving}
                  >
                    {isSaving ? '...' : isSaved ? '✓' : cred ? 'Update' : 'Save'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── PAYMENT PROCESSORS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {PROCESSORS.map(proc => {
          const key = `${proc.id}__`
          const cred = credentials[key]
          const form = getForm(proc.id, '')
          const isSaving = saving === key
          const isSaved = saved === key
          const lastSync = getLastSync(proc.id)
          const dot = statusDot(lastSync)

          return (
            <div key={proc.id} style={{ ...s.colPanel, borderTop: `2px solid ${proc.color}` }}>
              <div style={s.colHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px' }}>{proc.icon}</span>
                  <div>
                    <div style={{ ...s.colTitle, color: proc.color }}>{proc.label}</div>
                    <div style={{ fontSize: '11px', color: '#7A9BB8', marginTop: '2px' }}>{proc.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: cred?.is_active ? '#00D47E' : 'rgba(255,255,255,0.20)', display: 'inline-block' }} />
                  <span style={{ fontSize: '10px', color: cred?.is_active ? '#00D47E' : 'rgba(255,255,255,0.30)' }}>
                    {cred?.is_active ? 'Active' : cred ? 'Disabled' : 'Not configured'}
                  </span>
                </div>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
                {proc.fields.map((field: any) => {
                  const revKey = `${key}_${field.key}`
                  const isRev = revealed[revKey]
                  return (
                    <div key={field.key} style={s.formField}>
                      <label style={s.formLabel}>{field.label}</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          style={{ ...s.formInput, flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
                          type={field.secret && !isRev ? 'password' : 'text'}
                          value={form[field.key] || ''}
                          onChange={e => setField(proc.id, '', field.key, e.target.value)}
                          placeholder={cred?.[field.key] ? '••••••••••••••••' : field.placeholder}
                          disabled={!canEdit}
                        />
                        {field.secret && cred?.[field.key] && (
                          <button style={s.iconBtn} onClick={() => setRevealed(prev => ({ ...prev, [revKey]: !prev[revKey] }))}>
                            {isRev ? '🙈' : '👁'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', color: dot.color }}>
                    {lastSync ? `Last sync: ${formatSyncTime(lastSync)} · ${dot.label}` : 'Never synced'}
                  </div>
                  {cred && canEdit && (
                    <button style={{ ...s.iconBtn, fontSize: '11px', padding: '3px 8px', border: '0.5px solid rgba(255,255,255,0.10)', borderRadius: '6px', opacity: 0.7 }} onClick={() => toggleActive(proc.id)}>
                      {cred.is_active ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </div>

                {canEdit && (
                  <button
                    style={{ ...s.addBtn, width: '100%', background: isSaved ? '#00D47E' : proc.color, color: '#fff', marginTop: '4px' }}
                    onClick={() => saveCredential(proc.id)}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : isSaved ? '✓ Saved!' : cred ? 'Update credentials' : 'Save credentials'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── SYNC LOG ── */}
      {syncLogs.length > 0 && (
        <div style={s.colPanel}>
          <div style={s.colHeader}>
            <div style={s.colTitle}>🕐 Recent sync activity</div>
            <span style={s.colCount}>{syncLogs.length} entries</span>
          </div>
          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#060E1A' }}>
                  {['Provider', 'Site', 'Status', 'Started', 'Duration', 'Fetched', 'Created', 'Skipped', 'Error'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left' as const, fontSize: '10px', color: 'rgba(255,255,255,0.30)', fontWeight: '500', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {syncLogs.map(log => {
                  const dur = log.finished_at ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000) : null
                  return (
                    <tr key={log.id} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px 12px', color: '#DCE9F6' }}>{log.provider}</td>
                      <td style={{ padding: '8px 12px', color: '#7A9BB8' }}>{log.site || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '10px',
                          background: log.status === 'success' ? 'rgba(0,212,126,0.12)' : log.status === 'running' ? 'rgba(245,166,35,0.12)' : 'rgba(255,91,90,0.12)',
                          color: log.status === 'success' ? '#00D47E' : log.status === 'running' ? '#F5A623' : '#FF5B5A',
                        }}>{log.status}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#7A9BB8' }}>{new Date(log.started_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ padding: '8px 12px', color: '#7A9BB8' }}>{dur !== null ? `${dur}s` : '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#DCE9F6' }}>{log.records_fetched ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#00D47E' }}>{log.records_created ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#7A9BB8' }}>{log.records_skipped ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#FF5B5A', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{log.error_message || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── WHERE TO FIND KEYS ── */}
      <div style={{ ...s.colPanel, borderTop: '2px solid rgba(245,166,35,0.4)' }}>
        <div style={s.colHeader}>
          <div style={s.colTitle}>🗝 Where to find your API keys</div>
        </div>
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[
            { label: 'Chargebee', color: '#F5A623', steps: ['Settings → Configure Chargebee → API Keys & Events', 'Copy Full-Access key (live_xxx...)', 'Repeat for each of 11 sites'] },
            { label: 'Braintree', color: '#4EA8FF', steps: ['Login → Settings → API Keys', 'Generate new key or use existing', 'Copy Merchant ID + Public Key + Private Key'] },
            { label: 'PayPal', color: '#F5A623', steps: ['developer.paypal.com → My Apps & Credentials', 'Switch to Live (not Sandbox)', 'Create App or use existing → Client ID + Secret'] },
            { label: 'Stripe (US & UAE)', color: '#635BFF', steps: ['dashboard.stripe.com → Developers → API Keys', 'Reveal Secret key (sk_live_...)', 'Switch accounts for US vs UAE'] },
          ].map(item => (
            <div key={item.label} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: `1px solid ${item.color}22` }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: item.color, marginBottom: '8px' }}>{item.label}</div>
              {item.steps.map((step, i) => (
                <div key={i} style={{ fontSize: '11px', color: '#7A9BB8', marginBottom: '4px', display: 'flex', gap: '6px' }}>
                  <span style={{ color: item.color, fontWeight: '600', flexShrink: 0 }}>{i + 1}.</span>
                  {step}
                </div>
              ))}
            </div>
          ))}
        </div>
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
      if (comp) { setCompanies(comp); if (comp.length > 0) setSelectedCompany(comp[0]) }
      if (prof) { const m: Record<string, any> = {}; prof.forEach(p => { m[p.company_id] = p }); setProfiles(m) }
      if (banks) { const m: Record<string, any[]> = {}; banks.forEach(b => { if (!m[b.company_id]) m[b.company_id] = []; m[b.company_id].push(b) }); setBankAccounts(m) }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedCompany) return
    const p = profiles[selectedCompany.id] || {}
    setFullLegalName(p.full_legal_name || ''); setAddress(p.address || ''); setCity(p.city || '')
    setCountry(p.country || 'Srbija'); setPib(p.pib || ''); setMb(p.mb || '')
    setPdvNumber(p.pdv_number || ''); setPhone(p.phone || ''); setEmail(p.email || ''); setWebsite(p.website || '')
    setCompanyBanks(bankAccounts[selectedCompany.id] || [])
  }, [selectedCompany, profiles, bankAccounts])

  const saveProfile = async () => {
    if (!selectedCompany || !canEdit) return
    setSaving(true)
    const payload = {
      company_id: selectedCompany.id, full_legal_name: fullLegalName || null, address: address || null,
      city: city || null, country: country || null, pib: pib || null, mb: mb || null,
      pdv_number: pdvNumber || null, phone: phone || null, email: email || null, website: website || null,
      updated_at: new Date().toISOString(),
    }
    const existing = profiles[selectedCompany.id]
    if (existing) { await supabase.from('company_profiles').update(payload).eq('id', existing.id) }
    else { await supabase.from('company_profiles').insert(payload) }
    const { data } = await supabase.from('company_profiles').select('*')
    if (data) { const m: Record<string, any> = {}; data.forEach(p => { m[p.company_id] = p }); setProfiles(m) }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const addBankAccount = async () => {
    if (!newBankName.trim() || !newAccountNum.trim() || !selectedCompany || !canEdit) return
    const payload = { company_id: selectedCompany.id, bank_name: newBankName.trim(), account_number: newAccountNum.trim(), currency: newCurrency, is_primary: newIsPrimary, swift: newSwift || null, iban: newIban || null }
    if (newIsPrimary) await supabase.from('company_bank_accounts').update({ is_primary: false }).eq('company_id', selectedCompany.id).eq('currency', newCurrency)
    await supabase.from('company_bank_accounts').insert(payload)
    const { data } = await supabase.from('company_bank_accounts').select('*').eq('company_id', selectedCompany.id).order('is_primary', { ascending: false })
    setCompanyBanks(data || []); setBankAccounts(prev => ({ ...prev, [selectedCompany.id]: data || [] }))
    setNewBankName(''); setNewAccountNum(''); setNewCurrency('RSD'); setNewSwift(''); setNewIban(''); setNewIsPrimary(false)
  }

  const deleteBankAccount = async (id: string) => {
    if (!canEdit || !window.confirm('Delete this bank account?')) return
    await supabase.from('company_bank_accounts').delete().eq('id', id)
    const updated = companyBanks.filter(b => b.id !== id)
    setCompanyBanks(updated); setBankAccounts(prev => ({ ...prev, [selectedCompany.id]: updated }))
  }

  const setPrimaryAccount = async (id: string, currency: string) => {
    if (!canEdit) return
    await supabase.from('company_bank_accounts').update({ is_primary: false }).eq('company_id', selectedCompany.id).eq('currency', currency)
    await supabase.from('company_bank_accounts').update({ is_primary: true }).eq('id', id)
    const { data } = await supabase.from('company_bank_accounts').select('*').eq('company_id', selectedCompany.id).order('is_primary', { ascending: false })
    setCompanyBanks(data || []); setBankAccounts(prev => ({ ...prev, [selectedCompany.id]: data || [] }))
  }

  const currencyColor = (cur: string) => {
    if (cur === 'RSD') return { bg: '#FAEEDA', color: '#633806' }
    if (cur === 'USD') return { bg: '#E6F1FB', color: '#0C447C' }
    if (cur === 'EUR') return { bg: 'rgba(0,212,126,0.12)', color: '#00D47E' }
    return { bg: '#FBEAF0', color: '#72243E' }
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <>
      {!canEdit && <div style={s.readOnlyBanner}>👁 Read only — only administrators can modify company profiles.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'start' }}>
        <div style={s.colPanel}>
          <div style={s.colHeader}><div style={s.colTitle}>Companies</div><span style={s.colCount}>{companies.length}</span></div>
          <div style={s.itemList}>
            {companies.map(c => (
              <div key={c.id} style={{ ...s.itemRow, ...(selectedCompany?.id === c.id ? s.itemRowActive : {}), cursor: 'pointer' }} onClick={() => setSelectedCompany(c)}>
                <div>
                  <div style={s.itemName}>{c.name}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)', marginTop: '2px' }}>{profiles[c.id] ? '✓ Profile set' : 'No profile yet'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedCompany && (
          <div>
            <div style={{ ...s.colPanel, marginBottom: '16px' }}>
              <div style={s.colHeader}>
                <div style={s.colTitle}>🏢 {selectedCompany.name} — Legal information</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {saved && <span style={{ fontSize: '12px', color: '#00D47E', fontWeight: '500' }}>✓ Saved!</span>}
                  {canEdit && <button style={s.addBtn} onClick={saveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>}
                </div>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  {[
                    ['Full legal name', fullLegalName, setFullLegalName, 'e.g. Constellation d.o.o. Beograd'],
                    ['PIB (Tax ID)', pib, setPib, 'e.g. 109876543'],
                    ['Matični broj (MB)', mb, setMb, 'e.g. 21234567'],
                    ['PDV broj', pdvNumber, setPdvNumber, 'e.g. RS109876543'],
                    ['Address', address, setAddress, 'e.g. Resavska 23/1'],
                    ['City', city, setCity, 'e.g. Beograd'],
                    ['Country', country, setCountry, 'e.g. Srbija'],
                    ['Phone', phone, setPhone, 'e.g. +381 11 123 4567'],
                    ['Email', email, setEmail, 'e.g. office@constellation.rs'],
                    ['Website', website, setWebsite, 'e.g. https://constellation.rs'],
                  ].map(([label, value, setter, placeholder]: any) => (
                    <div key={label} style={s.formField}>
                      <label style={s.formLabel}>{label}</label>
                      <input style={s.formInput} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} disabled={!canEdit} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={s.colPanel}>
              <div style={s.colHeader}>
                <div style={s.colTitle}>🏦 Bank accounts</div>
                <span style={s.colCount}>{companyBanks.length} account{companyBanks.length !== 1 ? 's' : ''}</span>
              </div>
              {companyBanks.length === 0
                ? <div style={{ padding: '20px', textAlign: 'center' as const, color: 'rgba(255,255,255,0.30)', fontSize: '13px' }}>No bank accounts yet. Add one below.</div>
                : (
                  <div style={{ padding: '8px 16px' }}>
                    {companyBanks.map(bank => {
                      const cc = currencyColor(bank.currency)
                      return (
                        <div key={bank.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '500', color: '#DCE9F6' }}>{bank.bank_name}</span>
                              <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: cc.bg, color: cc.color }}>{bank.currency}</span>
                              {bank.is_primary && <span style={{ fontSize: '10px', fontWeight: '500', padding: '1px 7px', borderRadius: '20px', background: 'rgba(0,212,126,0.12)', color: '#00D47E' }}>★ Primary</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: '#7A9BB8', fontFamily: 'monospace' }}>{bank.account_number}</div>
                            {(bank.swift || bank.iban) && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', marginTop: '2px' }}>{bank.swift && `SWIFT: ${bank.swift}`}{bank.swift && bank.iban && ' · '}{bank.iban && `IBAN: ${bank.iban}`}</div>}
                          </div>
                          {canEdit && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {!bank.is_primary && <button style={{ ...s.iconBtn, fontSize: '11px', padding: '3px 8px', border: '0.5px solid rgba(255,255,255,0.10)', borderRadius: '6px' }} onClick={() => setPrimaryAccount(bank.id, bank.currency)}>Set primary</button>}
                              <button style={s.iconBtn} onClick={() => deleteBankAccount(bank.id)}>🗑</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              }
              {canEdit && (
                <div style={{ padding: '14px 16px', borderTop: '0.5px solid rgba(255,255,255,0.075)', background: '#111F30' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: '#7A9BB8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px' }}>Add bank account</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '8px', marginBottom: '8px' }}>
                    <div style={s.formField}><label style={s.formLabel}>Bank name</label><input style={s.formInput} value={newBankName} onChange={e => setNewBankName(e.target.value)} placeholder="e.g. Raiffeisen Bank" /></div>
                    <div style={s.formField}><label style={s.formLabel}>Account number</label><input style={s.formInput} value={newAccountNum} onChange={e => setNewAccountNum(e.target.value)} placeholder="e.g. 265-1234567890-12" /></div>
                    <div style={s.formField}><label style={s.formLabel}>Currency</label><select style={s.formInput} value={newCurrency} onChange={e => setNewCurrency(e.target.value)}><option>RSD</option><option>EUR</option><option>USD</option><option>AED</option><option>GBP</option></select></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'flex-end' }}>
                    <div style={s.formField}><label style={s.formLabel}>SWIFT (optional)</label><input style={s.formInput} value={newSwift} onChange={e => setNewSwift(e.target.value)} placeholder="e.g. RZBSRSBG" /></div>
                    <div style={s.formField}><label style={s.formLabel}>IBAN (optional)</label><input style={s.formInput} value={newIban} onChange={e => setNewIban(e.target.value)} placeholder="e.g. RS35265..." /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                      <label style={{ ...s.formLabel, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}><input type="checkbox" checked={newIsPrimary} onChange={e => setNewIsPrimary(e.target.checked)} />Primary</label>
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
          <div style={s.colHeader}><div style={s.colTitle}>P&L Categories</div><span style={s.colCount}>{categories.length}</span></div>
          <div style={s.itemList}>
            {categories.map(cat => (
              <div key={cat.id} style={{ ...s.itemRow, ...(selectedCat?.id === cat.id ? s.itemRowActive : {}) }} onClick={() => setSelectedCat(cat)}>
                {editingId === cat.id
                  ? <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') updateName('pl_categories', cat.id) }} onClick={e => e.stopPropagation()} autoFocus />
                  : <span style={s.itemName}>{cat.name}</span>}
                {canEdit && (
                  <div style={s.itemActions} onClick={e => e.stopPropagation()}>
                    {editingId === cat.id ? <button style={s.saveBtn} onClick={() => updateName('pl_categories', cat.id)}>✓</button> : <button style={s.iconBtn} onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}>✏️</button>}
                    <button style={s.iconBtn} onClick={() => deleteItem('pl_categories', cat.id)}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canEdit && <div style={s.addRow}><input style={s.addInput} value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category..." onKeyDown={e => { if (e.key === 'Enter') addCategory() }} /><button style={s.addBtn} onClick={addCategory}>+ Add</button></div>}
        </div>
        <div style={s.colPanel}>
          <div style={s.colHeader}><div style={s.colTitle}>{selectedCat ? `Subcategories — ${selectedCat.name}` : 'Select a category'}</div>{selectedCat && <span style={s.colCount}>{subcategories.length}</span>}</div>
          {!selectedCat ? <div style={s.emptyHint}>← Select a P&L category to manage its subcategories</div> : (
            <>
              <div style={s.itemList}>
                {subcategories.map(sub => (
                  <div key={sub.id} style={s.itemRow}>
                    {editingId === sub.id ? <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') updateName('pl_subcategories', sub.id) }} autoFocus /> : <span style={s.itemName}>{sub.name}</span>}
                    {canEdit && <div style={s.itemActions}>{editingId === sub.id ? <button style={s.saveBtn} onClick={() => updateName('pl_subcategories', sub.id)}>✓</button> : <button style={s.iconBtn} onClick={() => { setEditingId(sub.id); setEditingName(sub.name) }}>✏️</button>}<button style={s.iconBtn} onClick={() => deleteItem('pl_subcategories', sub.id)}>🗑</button></div>}
                  </div>
                ))}
              </div>
              {canEdit && <div style={s.addRow}><input style={s.addInput} value={newSubName} onChange={e => setNewSubName(e.target.value)} placeholder="New subcategory..." onKeyDown={e => { if (e.key === 'Enter') addSubcategory() }} /><button style={s.addBtn} onClick={addSubcategory}>+ Add</button></div>}
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
          <div style={s.colHeader}><div style={s.colTitle}>Departments</div><span style={s.colCount}>{departments.length}</span></div>
          <div style={s.itemList}>
            {departments.map(dept => (
              <div key={dept.id} style={{ ...s.itemRow, ...(selectedDept?.id === dept.id ? s.itemRowActive : {}) }} onClick={() => setSelectedDept(dept)}>
                {editingId === dept.id ? <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') updateName('departments', dept.id) }} onClick={e => e.stopPropagation()} autoFocus /> : <span style={s.itemName}>{dept.name}</span>}
                {canEdit && (
                  <div style={s.itemActions} onClick={e => e.stopPropagation()}>
                    {editingId === dept.id ? <button style={s.saveBtn} onClick={() => updateName('departments', dept.id)}>✓</button> : <button style={s.iconBtn} onClick={() => { setEditingId(dept.id); setEditingName(dept.name) }}>✏️</button>}
                    <button style={s.iconBtn} onClick={() => deleteItem('departments', dept.id)}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canEdit && <div style={s.addRow}><input style={s.addInput} value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder="New department..." onKeyDown={e => { if (e.key === 'Enter') addDepartment() }} /><button style={s.addBtn} onClick={addDepartment}>+ Add</button></div>}
        </div>
        <div style={s.colPanel}>
          <div style={s.colHeader}><div style={s.colTitle}>{selectedDept ? `Subcategories — ${selectedDept.name}` : 'Select a department'}</div>{selectedDept && <span style={s.colCount}>{subcategories.length}</span>}</div>
          {!selectedDept ? <div style={s.emptyHint}>← Select a department to manage its subcategories</div> : (
            <>
              <div style={s.itemList}>
                {subcategories.map(sub => (
                  <div key={sub.id} style={s.itemRow}>
                    {editingId === sub.id ? <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') updateName('dept_subcategories', sub.id) }} autoFocus /> : <span style={s.itemName}>{sub.name}</span>}
                    {canEdit && <div style={s.itemActions}>{editingId === sub.id ? <button style={s.saveBtn} onClick={() => updateName('dept_subcategories', sub.id)}>✓</button> : <button style={s.iconBtn} onClick={() => { setEditingId(sub.id); setEditingName(sub.name) }}>✏️</button>}<button style={s.iconBtn} onClick={() => deleteItem('dept_subcategories', sub.id)}>🗑</button></div>}
                  </div>
                ))}
              </div>
              {canEdit && <div style={s.addRow}><input style={s.addInput} value={newSubName} onChange={e => setNewSubName(e.target.value)} placeholder="New subcategory..." onKeyDown={e => { if (e.key === 'Enter') addSubcategory() }} /><button style={s.addBtn} onClick={addSubcategory}>+ Add</button></div>}
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
          <div style={s.colHeader}><div style={s.colTitle}>Dept. subcategories</div><span style={s.colCount}>{subcategories.length}</span></div>
          <div style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
            <input style={{ ...s.addInput, width: '100%', boxSizing: 'border-box' as const }} value={searchSub} onChange={e => setSearchSub(e.target.value)} placeholder="Search subcategories..." />
          </div>
          <div style={s.itemList}>
            {filteredSubs.map(sub => (
              <div key={sub.id} style={{ ...s.itemRow, ...(selectedSub?.id === sub.id ? s.itemRowActive : {}) }} onClick={() => setSelectedSub(sub)}>
                <div><div style={s.itemName}>{sub.name}</div><div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>{sub.departments?.name}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div style={s.colPanel}>
          <div style={s.colHeader}><div style={s.colTitle}>{selectedSub ? `Descriptions — ${selectedSub.name}` : 'Select a subcategory'}</div>{selectedSub && <span style={s.colCount}>{descriptions.length}</span>}</div>
          {!selectedSub ? <div style={s.emptyHint}>← Select a subcategory to manage its expense descriptions</div> : (
            <>
              <div style={s.itemList}>
                {descriptions.map(desc => (
                  <div key={desc.id} style={s.itemRow}>
                    {editingId === desc.id ? <input style={s.inlineInput} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') updateName(desc.id) }} autoFocus /> : <span style={s.itemName}>{desc.name}</span>}
                    {canEdit && <div style={s.itemActions}>{editingId === desc.id ? <button style={s.saveBtn} onClick={() => updateName(desc.id)}>✓</button> : <button style={s.iconBtn} onClick={() => { setEditingId(desc.id); setEditingName(desc.name) }}>✏️</button>}<button style={s.iconBtn} onClick={() => deleteDesc(desc.id)}>🗑</button></div>}
                  </div>
                ))}
              </div>
              {canEdit && <div style={s.addRow}><input style={s.addInput} value={newDescName} onChange={e => setNewDescName(e.target.value)} placeholder="New description..." onKeyDown={e => { if (e.key === 'Enter') addDescription() }} /><button style={s.addBtn} onClick={addDescription}>+ Add</button></div>}
            </>
          )}
        </div>
      </div>
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#060E1A', fontFamily: "'Inter', system-ui, sans-serif" },
  body: { padding: '24px 28px' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle: { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '24px', fontWeight: '400', color: '#DCE9F6', marginBottom: '4px' },
  pageSub: { fontSize: '13px', color: '#7A9BB8' },
  tabBar: { display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.075)', marginBottom: '1.5rem', overflowX: 'auto' as const },
  tab: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '10px 20px', border: 'none', background: 'transparent', color: '#7A9BB8', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-0.5px', whiteSpace: 'nowrap' as const },
  tabActive: { color: '#DCE9F6', borderBottomColor: '#00D47E', fontWeight: '500' },
  readOnlyBanner: { background: 'rgba(245,166,35,0.10)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', color: '#F5A623', marginBottom: '16px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' },
  colPanel: { background: '#0D1B2C', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '10px', overflow: 'hidden' },
  colHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.075)', background: '#111F30' },
  colTitle: { fontSize: '13px', fontWeight: '500', color: '#DCE9F6' },
  colCount: { fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '10px', background: 'rgba(0,212,126,0.12)', color: '#00D47E' },
  itemList: { maxHeight: '420px', overflowY: 'auto' as const },
  itemRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', cursor: 'pointer' },
  itemRowActive: { background: 'rgba(0,212,126,0.06)', borderLeft: '3px solid #00D47E' },
  itemName: { fontSize: '13px', color: '#DCE9F6' },
  itemActions: { display: 'flex', gap: '4px', flexShrink: 0 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '2px 4px', borderRadius: '4px', opacity: 0.6 },
  saveBtn: { background: '#00D47E', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', color: '#060E1A' },
  inlineInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '4px 8px', border: '1px solid #00D47E', borderRadius: '6px', outline: 'none', flex: 1, color: '#DCE9F6', background: '#111F30' },
  addRow: { display: 'flex', gap: '6px', padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.075)', background: '#111F30' },
  addInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', outline: 'none', flex: 1, color: '#DCE9F6', background: '#0D1B2C' },
  addBtn: { fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '7px 14px', border: 'none', borderRadius: '8px', background: '#00D47E', color: '#060E1A', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  emptyHint: { padding: '2rem', textAlign: 'center' as const, color: 'rgba(255,255,255,0.30)', fontSize: '13px' },
  loading: { padding: '2rem', textAlign: 'center' as const, color: '#7A9BB8', fontSize: '14px' },
  formField: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  formLabel: { fontSize: '10px', fontWeight: '500', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  formInput: { fontFamily: 'system-ui,sans-serif', fontSize: '13px', padding: '7px 10px', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', outline: 'none', color: '#DCE9F6', background: '#111F30' },
}