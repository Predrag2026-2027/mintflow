#!/usr/bin/env python3
"""
Run from mintflow project root:
  python3 patch_BulkImport_v2.py
"""
import sys, os

path = 'src/components/BulkImport.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found.")
    sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

# 1. Add override_partner_id to ImportRow interface
src = src.replace(
    "  override_partner_name: string\n  override_note: string\n}",
    "  override_partner_id: string\n  override_partner_name: string\n  override_note: string\n}"
, 1)

# 2. Add override_partner_id to makeImportRow
src = src.replace(
    "    override_partner_name: parsed.partner_name, override_note: '',",
    "    override_partner_id: '', override_partner_name: parsed.partner_name, override_note: '',"
, 1)

# 3. Upgrade partnerAccounts fetch to include id and bank info
src = src.replace(
    "        supabase.from('partner_accounts').select('partner_id,account_number'),",
    "        supabase.from('partner_accounts').select('id,partner_id,account_number,bank_name,is_primary').order('is_primary', { ascending: false }),"
, 1)

# 4. Add reviewPartnerSearch state after expandedRow state
src = src.replace(
    "  const [expandedRow, setExpandedRow] = useState<string | null>(null)\n  const fileRef = useRef<HTMLInputElement>(null)",
    "  const [expandedRow, setExpandedRow] = useState<string | null>(null)\n  const [reviewPartnerSearch, setReviewPartnerSearch] = useState<Record<string, string>>({})\n  const fileRef = useRef<HTMLInputElement>(null)"
, 1)

# 5. Replace partner plain input in review panel with dropdown search + account select
old_partner_field = """                          <div style={s.editGrid2}>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Partner</label>
                              <input style={s.editInput} value={row.override_partner_name} onChange={e => updateRow(p.id, { override_partner_name: e.target.value })} />
                            </div>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Type</label>"""

new_partner_field = """                          <div style={s.editGrid2}>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Partner</label>
                              <div style={{ position: 'relative' as const }}>
                                <input style={s.editInput}
                                  value={reviewPartnerSearch[p.id] ?? row.override_partner_name}
                                  onChange={e => {
                                    setReviewPartnerSearch(prev => ({ ...prev, [p.id]: e.target.value }))
                                    updateRow(p.id, { override_partner_name: e.target.value, override_partner_id: '' })
                                  }}
                                  placeholder="Pretraži partnera..." />
                                {(reviewPartnerSearch[p.id] ?? '').length > 0 && !row.override_partner_id && (
                                  <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e5e5', borderRadius: '6px', zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '180px', overflowY: 'auto' as const }}>
                                    {partners.filter(pt => pt.name.toLowerCase().includes((reviewPartnerSearch[p.id] ?? '').toLowerCase())).slice(0, 8).map(pt => (
                                      <div key={pt.id} style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '0.5px solid #f5f5f3', display: 'flex', flexDirection: 'column' as const }}
                                        onMouseDown={e => {
                                          e.preventDefault()
                                          updateRow(p.id, { override_partner_name: pt.name, override_partner_id: pt.id })
                                          setReviewPartnerSearch(prev => ({ ...prev, [p.id]: pt.name }))
                                        }}>
                                        <span style={{ fontWeight: '500', color: '#111' }}>{pt.name}</span>
                                        {partnerAccounts.filter((pa: any) => pa.partner_id === pt.id).length > 0 && (
                                          <span style={{ fontSize: '10px', color: '#7A9BB8' }}>
                                            {partnerAccounts.filter((pa: any) => pa.partner_id === pt.id).length} račun(a)
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                    {partners.filter(pt => pt.name.toLowerCase().includes((reviewPartnerSearch[p.id] ?? '').toLowerCase())).length === 0 && (
                                      <div style={{ padding: '7px 10px', fontSize: '12px', color: '#aaa' }}>Novi partner: "{reviewPartnerSearch[p.id]}"</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              {(() => {
                                const rowAccounts = partnerAccounts.filter((pa: any) => pa.partner_id === row.override_partner_id)
                                if (rowAccounts.length === 0) return null
                                return (
                                  <div style={{ marginTop: '6px' }}>
                                    <label style={{ ...s.editLbl, marginBottom: '4px', display: 'block' }}>Račun partnera</label>
                                    <select style={s.editSelect}
                                      value={rowAccounts.find((a: any) => a.account_number === p.account_number)?.account_number || ''}
                                      onChange={e => {
                                        const acc = rowAccounts.find((a: any) => a.account_number === e.target.value)
                                        if (acc) updateRow(p.id, { override_note: row.override_note })
                                        // account_number stays on parsed, just visual confirmation
                                      }}>
                                      <option value="">— Bez računa —</option>
                                      {rowAccounts.map((acc: any) => (
                                        <option key={acc.id} value={acc.account_number}>
                                          {acc.account_number}{acc.bank_name ? ` (${acc.bank_name})` : ''}{acc.is_primary ? ' ★' : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )
                              })()}
                            </div>
                            <div style={s.editField}>
                              <label style={s.editLbl}>Type</label>"""

src = src.replace(old_partner_field, new_partner_field, 1)

if src == original:
    print("WARNING: No changes applied. Check file content.")
else:
    changed = sum(1 for a, b in zip(original.splitlines(), src.splitlines()) if a != b)
    print(f"Applied patches ({changed} lines changed)")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print(f"Done! Saved to {path}")
