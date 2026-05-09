#!/usr/bin/env python3
"""
Run from mintflow project root:
  python3 patch_BulkImport_v4.py

Adds:
1. "Dodaj partnera" button when partner not in DB
2. "Sačuvaj račun" button when account not in partner's accounts
3. Confirms all accounts are checked (not just primary)
"""
import sys, os

path = 'src/components/BulkImport.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found."); sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src
changes = 0

def replace_once(src, old, new, label):
    global changes
    if old not in src:
        print(f"  MISS: {label}")
        return src
    changes += 1
    print(f"  OK:   {label}")
    return src.replace(old, new, 1)

# --- 1. Add creatingPartner and savingAccount state after reviewPartnerSearch ---
src = replace_once(src,
    "  const [reviewPartnerSearch, setReviewPartnerSearch] = useState<Record<string, string>>({})\n  const fileRef = useRef<HTMLInputElement>(null)",
    "  const [reviewPartnerSearch, setReviewPartnerSearch] = useState<Record<string, string>>({})\n  const [creatingPartner, setCreatingPartner] = useState<Record<string, boolean>>({})\n  const [savingAccount, setSavingAccount] = useState<Record<string, boolean>>({})\n  const fileRef = useRef<HTMLInputElement>(null)",
    "state: creatingPartner + savingAccount"
)

# --- 2. Add helper functions after matchPartnerByAccount ---
src = replace_once(src,
    "  const handleFile = async (file: File) => {",
    """  const createPartnerFromRow = async (rowId: string, name: string, type: string = 'both') => {
    if (!name.trim()) return
    setCreatingPartner(prev => ({ ...prev, [rowId]: true }))
    try {
      const { data: newP } = await supabase.from('partners').insert({ name: name.trim(), type }).select().single()
      if (newP) {
        setPartners(prev => [...prev, newP])
        updateRow(rowId, { override_partner_name: newP.name, override_partner_id: newP.id })
        setReviewPartnerSearch(prev => ({ ...prev, [rowId]: newP.name }))
      }
    } catch (err) { console.error('createPartner error', err) }
    setCreatingPartner(prev => ({ ...prev, [rowId]: false }))
  }

  const saveAccountToPartner = async (rowId: string, partnerId: string, accountNumber: string) => {
    if (!partnerId || !accountNumber.trim()) return
    setSavingAccount(prev => ({ ...prev, [rowId]: true }))
    try {
      const { data: newAcc } = await supabase.from('partner_accounts').insert({
        partner_id: partnerId,
        account_number: accountNumber.trim(),
        is_primary: false,
      }).select().single()
      if (newAcc) {
        setPartnerAccounts(prev => [...prev, newAcc])
      }
    } catch (err) { console.error('saveAccount error', err) }
    setSavingAccount(prev => ({ ...prev, [rowId]: false }))
  }

  const handleFile = async (file: File) => {""",
    "helper functions createPartnerFromRow + saveAccountToPartner"
)

# --- 3. Replace the partner field block in review panel ---
# Find the current "Novi partner" text block and replace the whole partner field
old_partner_ui = """                                {((reviewPartnerSearch[p.id] ?? '').length > 0 || (!row.override_partner_id && row.override_partner_name.length > 0)) && !row.override_partner_id && (
                                  <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e5e5', borderRadius: '6px', zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '180px', overflowY: 'auto' as const }}>
                                    {partners.filter(pt => pt.name.toLowerCase().includes((reviewPartnerSearch[p.id] ?? row.override_partner_name).toLowerCase())).slice(0, 8).map(pt => (
                                      <div key={pt.id} style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '0.5px solid #f5f5f3', display: 'flex', flexDirection: 'column' as const }}
                                        onMouseDown={e => {
                                          e.preventDefault()
                                          updateRow(p.id, { override_partner_name: pt.name, override_partner_id: pt.id })
                                          setReviewPartnerSearch(prev => ({ ...prev, [p.id]: pt.name }))
                                        }}>
                                        <span style={{ fontWeight: '500', color: '#111' }}>{pt.name}</span>
                                        {partnerAccounts.filter((pa: any) => pa.partner_id === pt.id).length > 0 && (
                                          <span style={{ fontSize: '10px', color: '#1D9E75' }}>
                                            {partnerAccounts.filter((pa: any) => pa.partner_id === pt.id).length} račun(a) u bazi
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                    {partners.filter(pt => pt.name.toLowerCase().includes((reviewPartnerSearch[p.id] ?? row.override_partner_name).toLowerCase())).length === 0 && (
                                      <div style={{ padding: '7px 10px', fontSize: '12px', color: '#aaa' }}>
                                        Novi partner — biće kreiran pri postovanju
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              {(() => {
                                const rowAccounts = partnerAccounts.filter((pa: any) => pa.partner_id === row.override_partner_id)
                                if (rowAccounts.length === 0) return null
                                return (
                                  <div style={{ marginTop: '6px' }}>
                                    <label style={{ ...s.editLbl, display: 'block', marginBottom: '4px' }}>Račun partnera ({rowAccounts.length})</label>
                                    <select style={{ ...s.editSelect, border: '1.5px solid #1D9E75', background: '#f0fdf8' }}
                                      defaultValue={rowAccounts.find((a: any) => a.is_primary)?.account_number || rowAccounts[0]?.account_number || ''}>
                                      <option value="">— Bez računa —</option>
                                      {rowAccounts.map((acc: any) => (
                                        <option key={acc.id} value={acc.account_number}>
                                          {acc.account_number}{acc.bank_name ? ` · ${acc.bank_name}` : ''}{acc.is_primary ? ' ★' : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )
                              })()}
                            </div>"""

new_partner_ui = """                                {((reviewPartnerSearch[p.id] ?? '').length > 0 || (!row.override_partner_id && row.override_partner_name.length > 0)) && !row.override_partner_id && (
                                  <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e5e5', borderRadius: '6px', zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '220px', overflowY: 'auto' as const }}>
                                    {partners.filter(pt => pt.name.toLowerCase().includes((reviewPartnerSearch[p.id] ?? row.override_partner_name).toLowerCase())).slice(0, 8).map(pt => (
                                      <div key={pt.id} style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '0.5px solid #f5f5f3', display: 'flex', flexDirection: 'column' as const }}
                                        onMouseDown={e => {
                                          e.preventDefault()
                                          updateRow(p.id, { override_partner_name: pt.name, override_partner_id: pt.id })
                                          setReviewPartnerSearch(prev => ({ ...prev, [p.id]: pt.name }))
                                        }}>
                                        <span style={{ fontWeight: '500', color: '#111' }}>{pt.name}</span>
                                        {partnerAccounts.filter((pa: any) => pa.partner_id === pt.id).length > 0 && (
                                          <span style={{ fontSize: '10px', color: '#1D9E75' }}>
                                            {partnerAccounts.filter((pa: any) => pa.partner_id === pt.id).length} račun(a) u bazi
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                    {(() => {
                                      const searchTerm = reviewPartnerSearch[p.id] ?? row.override_partner_name
                                      const noMatch = partners.filter(pt => pt.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0
                                      if (!noMatch || !searchTerm.trim()) return null
                                      return (
                                        <div style={{ padding: '8px 10px', borderTop: '0.5px solid #e5e5e5', background: '#f9f9f7' }}>
                                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>"{searchTerm}" nije u bazi partnera</div>
                                          <button
                                            style={{ fontFamily: 'system-ui,sans-serif', fontSize: '12px', padding: '5px 12px', border: 'none', borderRadius: '6px', background: '#1D9E75', color: '#fff', cursor: 'pointer', width: '100%' }}
                                            onMouseDown={e => { e.preventDefault(); createPartnerFromRow(p.id, searchTerm) }}>
                                            {creatingPartner[p.id] ? '⏳ Kreiranje...' : `➕ Dodaj "${searchTerm}" kao novog partnera`}
                                          </button>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                )}
                              </div>
                              {(() => {
                                const rowAccounts = partnerAccounts.filter((pa: any) => pa.partner_id === row.override_partner_id)
                                const parsedAccount = p.account_number?.trim()
                                const accountInDB = parsedAccount && rowAccounts.some((a: any) =>
                                  a.account_number?.replace(/[-\\s]/g, '') === parsedAccount.replace(/[-\\s]/g, '')
                                )
                                return (
                                  <>
                                    {rowAccounts.length > 0 && (
                                      <div style={{ marginTop: '6px' }}>
                                        <label style={{ ...s.editLbl, display: 'block', marginBottom: '4px' }}>Račun partnera ({rowAccounts.length})</label>
                                        <select style={{ ...s.editSelect, border: '1.5px solid #1D9E75', background: '#f0fdf8' }}
                                          defaultValue={rowAccounts.find((a: any) => a.is_primary)?.account_number || rowAccounts[0]?.account_number || ''}>
                                          <option value="">— Bez računa —</option>
                                          {rowAccounts.map((acc: any) => (
                                            <option key={acc.id} value={acc.account_number}>
                                              {acc.account_number}{acc.bank_name ? ` · ${acc.bank_name}` : ''}{acc.is_primary ? ' ★' : ''}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                    {row.override_partner_id && parsedAccount && !accountInDB && (
                                      <div style={{ marginTop: '6px', background: '#FAEEDA', border: '0.5px solid #E5B96A', borderRadius: '6px', padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#633806' }}>
                                          Račun <strong>{parsedAccount}</strong> nije u bazi za ovog partnera
                                        </span>
                                        <button
                                          style={{ fontFamily: 'system-ui,sans-serif', fontSize: '11px', padding: '3px 10px', border: 'none', borderRadius: '5px', background: '#E6B432', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                                          onClick={() => saveAccountToPartner(p.id, row.override_partner_id, parsedAccount)}>
                                          {savingAccount[p.id] ? '⏳' : '➕ Sačuvaj račun'}
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                            </div>"""

src = replace_once(src, old_partner_ui, new_partner_ui, "partner field: add partner button + save account button")

if src == original:
    print("\nWARNING: No changes applied.")
else:
    print(f"\nTotal: {changes} patches applied successfully.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
