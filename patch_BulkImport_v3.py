#!/usr/bin/env python3
"""
Run from mintflow project root:
  python3 patch_BulkImport_v3.py

Fixes:
1. matchPartnerByAccount returns {name, id} so override_partner_id is set automatically
2. Partner field styled as editable (not flat)
3. Account select shows when partner matched automatically
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

# --- FIX 1: matchPartnerByAccount returns {name, id} ---
src = replace_once(src,
    """  const matchPartnerByAccount = (accountNum: string, pacc: any[], partList: any[]): string => {
    if (!accountNum) return ''
    const clean = accountNum.replace(/[-\\s]/g, '')
    if (!clean) return ''
    const match = pacc.find((pa: any) => {
      const paClean = (pa.account_number || '').replace(/[-\\s]/g, '')
      return paClean && paClean === clean
    })
    if (!match) return ''
    const partner = partList.find((p: any) => p.id === match.partner_id)
    return partner?.name || ''
  }""",
    """  const matchPartnerByAccount = (accountNum: string, pacc: any[], partList: any[]): { name: string; id: string } | null => {
    if (!accountNum) return null
    const clean = accountNum.replace(/[-\\s]/g, '')
    if (!clean) return null
    const match = pacc.find((pa: any) => {
      const paClean = (pa.account_number || '').replace(/[-\\s]/g, '')
      return paClean && paClean === clean
    })
    if (!match) return null
    const partner = partList.find((p: any) => p.id === match.partner_id)
    if (!partner) return null
    return { name: partner.name, id: partner.id }
  }""",
    "matchPartnerByAccount return type"
)

# --- FIX 2: Update callers of matchPartnerByAccount (xlsx branch) ---
src = replace_once(src,
    """        const importRows = parsed.map(makeImportRow)
        setRows(importRows.map(r => {
          const matched = matchPartnerByAccount(r.parsed.account_number, partnerAccounts, partners)
          return matched ? { ...r, override_partner_name: matched } : r
        }))
      } else {""",
    """        const importRows = parsed.map(makeImportRow)
        setRows(importRows.map(r => {
          const matched = matchPartnerByAccount(r.parsed.account_number, partnerAccounts, partners)
          return matched ? { ...r, override_partner_name: matched.name, override_partner_id: matched.id } : r
        }))
      } else {""",
    "caller xlsx branch"
)

# --- FIX 3: Update callers of matchPartnerByAccount (text branch) ---
src = replace_once(src,
    """        const importRows = parsed.map(makeImportRow)
        setRows(importRows.map(r => {
          const matched = matchPartnerByAccount(r.parsed.account_number, partnerAccounts, partners)
          return matched ? { ...r, override_partner_name: matched } : r
        }))
      }""",
    """        const importRows = parsed.map(makeImportRow)
        setRows(importRows.map(r => {
          const matched = matchPartnerByAccount(r.parsed.account_number, partnerAccounts, partners)
          return matched ? { ...r, override_partner_name: matched.name, override_partner_id: matched.id } : r
        }))
      }""",
    "caller text branch"
)

# --- FIX 4: Replace partner field in review panel with styled editable version ---
old_partner_block = """                            <div style={s.editField}>
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
                            </div>"""

new_partner_block = """                            <div style={s.editField}>
                              <label style={s.editLbl}>Partner</label>
                              <div style={{ position: 'relative' as const }}>
                                <input
                                  style={{
                                    ...s.editInput,
                                    border: row.override_partner_id ? '1.5px solid #1D9E75' : '1.5px solid #e5e5e5',
                                    background: '#fff',
                                    paddingRight: '28px',
                                  }}
                                  value={reviewPartnerSearch[p.id] !== undefined ? reviewPartnerSearch[p.id] : row.override_partner_name}
                                  onChange={e => {
                                    setReviewPartnerSearch(prev => ({ ...prev, [p.id]: e.target.value }))
                                    updateRow(p.id, { override_partner_name: e.target.value, override_partner_id: '' })
                                  }}
                                  placeholder="Pretraži ili unesi partnera..."
                                />
                                <span style={{ position: 'absolute' as const, right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: row.override_partner_id ? '#1D9E75' : '#bbb', pointerEvents: 'none' as const }}>
                                  {row.override_partner_id ? '✓' : '✎'}
                                </span>
                                {((reviewPartnerSearch[p.id] ?? '').length > 0 || (!row.override_partner_id && row.override_partner_name.length > 0)) && !row.override_partner_id && (
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

src = replace_once(src, old_partner_block, new_partner_block, "partner field in review panel")

if src == original:
    print("\nWARNING: No changes applied.")
else:
    print(f"\nTotal: {changes} patches applied successfully.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
