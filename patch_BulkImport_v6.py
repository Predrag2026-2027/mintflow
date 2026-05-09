#!/usr/bin/env python3
"""
Fix: normalize Serbian bank account numbers for comparison.
Handles both NBS format (160-490637-43) and izvod format (160-000000049063743).

Run from project root:
  python3 patch_BulkImport_v6.py
"""
import sys, os

path = 'src/components/BulkImport.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found."); sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

# Replace the matchPartnerByAccount function with normalized version
old_match = """  const matchPartnerByAccount = (accountNum: string, pacc: any[], partList: any[]): { name: string; id: string } | null => {
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
  }"""

new_match = """  // Normalize Serbian bank account for comparison.
  // Handles both formats:
  //   NBS/baza format:  160-490637-43       (bank-account-control, 3 segments)
  //   Izvod format:     160-000000049063743  (bank-fullnumber, last 2 digits = control)
  const normalizeAccountNumber = (acc: string): string => {
    if (!acc) return ''
    const a = acc.trim().replace(/\\s/g, '')
    const parts = a.split('-')
    if (parts.length === 3) {
      // NBS format: bank-account-control
      const bank = parts[0].replace(/^0+/, '') || '0'
      const core = parts[1].replace(/^0+/, '') || '0'
      const ctrl = parts[2].replace(/^0+/, '') || '0'
      return `${bank}|${core}|${ctrl}`
    } else if (parts.length === 2) {
      // Izvod format: bank-fullnumber (last 2 = control, rest = account)
      const bank = parts[0].replace(/^0+/, '') || '0'
      const full = parts[1]
      if (full.length >= 3) {
        const core = full.slice(0, -2).replace(/^0+/, '') || '0'
        const ctrl = full.slice(-2).replace(/^0+/, '') || '0'
        return `${bank}|${core}|${ctrl}`
      }
      return `${bank}|${full.replace(/^0+/, '') || '0'}`
    }
    // Fallback: strip all non-digits and leading zeros
    return a.replace(/\\D/g, '').replace(/^0+/, '') || '0'
  }

  const matchPartnerByAccount = (accountNum: string, pacc: any[], partList: any[]): { name: string; id: string } | null => {
    if (!accountNum) return null
    const normalizedInput = normalizeAccountNumber(accountNum)
    if (!normalizedInput) return null
    const match = pacc.find((pa: any) => {
      const normalizedDB = normalizeAccountNumber(pa.account_number || '')
      return normalizedDB && normalizedDB === normalizedInput
    })
    if (!match) return null
    const partner = partList.find((p: any) => p.id === match.partner_id)
    if (!partner) return null
    return { name: partner.name, id: partner.id }
  }"""

if old_match in src:
    src = src.replace(old_match, new_match, 1)
    print("OK: replaced matchPartnerByAccount with normalized version")
else:
    print("MISS: matchPartnerByAccount not found with expected text")

# Also fix saveAccountToPartner — normalize before comparing in accountInDB check
# The check uses: a.account_number?.replace(/[-\s]/g, '') === parsedAccount.replace(/[-\s]/g, '')
# Replace with normalizeAccountNumber
old_check = """                                const accountInDB = parsedAccount && rowAccounts.some((a: any) =>
                                  a.account_number?.replace(/[-\\s]/g, '') === parsedAccount.replace(/[-\\s]/g, '')
                                )"""

new_check = """                                const accountInDB = parsedAccount && rowAccounts.some((a: any) =>
                                  normalizeAccountNumber(a.account_number || '') === normalizeAccountNumber(parsedAccount)
                                )"""

if old_check in src:
    src = src.replace(old_check, new_check, 1)
    print("OK: fixed accountInDB check to use normalizeAccountNumber")
else:
    print("MISS: accountInDB check not found (may use different whitespace)")
    # Try alternative find
    if "a.account_number?.replace(/[-" in src:
        print("  -> Found partial match, check formatting in file")

if src == original:
    print("\nWARNING: No changes applied.")
else:
    print("\nAll patches applied.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
