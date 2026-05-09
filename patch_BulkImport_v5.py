#!/usr/bin/env python3
"""
Run from mintflow project root:
  python3 patch_BulkImport_v5.py

Changes:
1. Import PartnerDialog component
2. Add showPartnerDialog state (rowId + initialName + initialAccount)  
3. Replace createPartnerFromRow with openPartnerDialog
4. Fix saveAccountToPartner with proper error handling
5. Render PartnerDialog when open
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

# 1. Add PartnerDialog import after existing imports
src = replace_once(src,
    "import { getRate, convertToUSD } from '../services/currencyService'",
    "import { getRate, convertToUSD } from '../services/currencyService'\nimport PartnerDialog from './PartnerDialog'",
    "import PartnerDialog"
)

# 2. Add showPartnerDialog state after creatingPartner state
src = replace_once(src,
    "  const [creatingPartner, setCreatingPartner] = useState<Record<string, boolean>>({})\n  const [savingAccount, setSavingAccount] = useState<Record<string, boolean>>({})",
    "  const [creatingPartner, setCreatingPartner] = useState<Record<string, boolean>>({})\n  const [savingAccount, setSavingAccount] = useState<Record<string, boolean>>({})\n  const [partnerDialogRow, setPartnerDialogRow] = useState<{ rowId: string; initialName: string; initialAccount: string } | null>(null)",
    "partnerDialogRow state"
)

# 3. Replace createPartnerFromRow with openPartnerDialog
src = replace_once(src,
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
  }""",
    """  const openPartnerDialog = (rowId: string, name: string, accountNumber: string) => {
    setPartnerDialogRow({ rowId, initialName: name, initialAccount: accountNumber })
  }""",
    "replace createPartnerFromRow with openPartnerDialog"
)

# 4. Fix saveAccountToPartner with error handling and state refresh
src = replace_once(src,
    """  const saveAccountToPartner = async (rowId: string, partnerId: string, accountNumber: string) => {
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
  }""",
    """  const saveAccountToPartner = async (rowId: string, partnerId: string, accountNumber: string) => {
    if (!partnerId || !accountNumber.trim()) return
    setSavingAccount(prev => ({ ...prev, [rowId]: true }))
    const { data: newAcc, error } = await supabase.from('partner_accounts').insert({
      partner_id: partnerId,
      account_number: accountNumber.trim(),
      currency: 'RSD',
      is_primary: false,
    }).select('id,partner_id,account_number,bank_name,is_primary').single()
    if (error) {
      console.error('saveAccount error:', error)
      alert(`Greška pri čuvanju računa: ${error.message}`)
    } else if (newAcc) {
      setPartnerAccounts(prev => [...prev, newAcc])
    }
    setSavingAccount(prev => ({ ...prev, [rowId]: false }))
  }""",
    "fix saveAccountToPartner"
)

# 5. Replace the "Dodaj" button in dropdown to use openPartnerDialog
src = replace_once(src,
    """                                          onMouseDown={e => { e.preventDefault(); createPartnerFromRow(p.id, searchTerm) }}>
                                            {creatingPartner[p.id] ? '⏳ Kreiranje...' : `➕ Dodaj "${searchTerm}" kao novog partnera`}""",
    """                                          onMouseDown={e => { e.preventDefault(); setReviewPartnerSearch(prev => ({ ...prev, [p.id]: '' })); openPartnerDialog(p.id, searchTerm, p.account_number || '') }}>
                                            {`➕ Dodaj "${searchTerm}" kao novog partnera (sa NBS lookup-om)`}""",
    "button uses openPartnerDialog"
)

# 6. Add PartnerDialog render just before the closing </div> of the main overlay
src = replace_once(src,
    "      </div>\n    </div>\n  )\n}\n\nconst s: Record<string, React.CSSProperties>",
    """      </div>

      {partnerDialogRow && (
        <PartnerDialog
          initialName={partnerDialogRow.initialName}
          initialAccountNumber={partnerDialogRow.initialAccount}
          onClose={() => setPartnerDialogRow(null)}
          onSaved={(newPartner) => {
            setPartners(prev => [...prev, newPartner])
            setPartnerAccounts(prev => {
              // Reload accounts from DB after partner saved
              supabase.from('partner_accounts').select('id,partner_id,account_number,bank_name,is_primary')
                .eq('partner_id', newPartner.id)
                .then(({ data }) => { if (data) setPartnerAccounts(all => [...all, ...data]) })
              return prev
            })
            const rowId = partnerDialogRow.rowId
            updateRow(rowId, { override_partner_name: newPartner.name, override_partner_id: newPartner.id })
            setReviewPartnerSearch(prev => ({ ...prev, [rowId]: newPartner.name }))
            setPartnerDialogRow(null)
          }}
        />
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties>""",
    "render PartnerDialog"
)

if src == original:
    print("\nWARNING: No changes applied.")
else:
    print(f"\nTotal: {changes} patches applied successfully.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
