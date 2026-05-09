#!/usr/bin/env python3
"""
Fix: normalize account numbers in BankStatementDialog too.
Run from project root:
  python3 patch_BankStatement_normalize.py
"""
import sys, os

path = 'src/components/BankStatementDialog.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found."); sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

# Add normalizeAccountNumber helper and fix accountInDB check
old_get_accounts = """  const getPartnerAccounts = (partnerId: string | null) => {
    if (!partnerId) return []
    return allPartnerAccounts.filter(pa => pa.partner_id === partnerId)
  }"""

new_get_accounts = """  const normalizeAccountNumber = (acc: string): string => {
    if (!acc) return ''
    const a = acc.trim().replace(/\\s/g, '')
    const parts = a.split('-')
    if (parts.length === 3) {
      const bank = parts[0].replace(/^0+/, '') || '0'
      const core = parts[1].replace(/^0+/, '') || '0'
      const ctrl = parts[2].replace(/^0+/, '') || '0'
      return `${bank}|${core}|${ctrl}`
    } else if (parts.length === 2) {
      const bank = parts[0].replace(/^0+/, '') || '0'
      const full = parts[1]
      if (full.length >= 3) {
        const core = full.slice(0, -2).replace(/^0+/, '') || '0'
        const ctrl = full.slice(-2).replace(/^0+/, '') || '0'
        return `${bank}|${core}|${ctrl}`
      }
      return `${bank}|${full.replace(/^0+/, '') || '0'}`
    }
    return a.replace(/\\D/g, '').replace(/^0+/, '') || '0'
  }

  const getPartnerAccounts = (partnerId: string | null) => {
    if (!partnerId) return []
    return allPartnerAccounts.filter(pa => pa.partner_id === partnerId)
  }"""

if old_get_accounts in src:
    src = src.replace(old_get_accounts, new_get_accounts, 1)
    print("OK: added normalizeAccountNumber in BankStatementDialog")
else:
    print("MISS: getPartnerAccounts not found")

# Fix accountInDB check in the "Sačuvaj račun" banner
old_check = """const accountInDB = parsedAccount && rowAccounts.some((a: any) =>
                                  a.account_number?.replace(/[-\\s]/g, '') === parsedAccount.replace(/[-\\s]/g, '')
                                )"""

new_check = """const accountInDB = parsedAccount && rowAccounts.some((a: any) =>
                                  normalizeAccountNumber(a.account_number || '') === normalizeAccountNumber(parsedAccount)
                                )"""

if old_check in src:
    src = src.replace(old_check, new_check, 1)
    print("OK: fixed accountInDB check in BankStatementDialog")
else:
    print("INFO: accountInDB check not found in BankStatementDialog (may not exist yet)")

if src == original:
    print("\nWARNING: No changes applied.")
else:
    print("\nPatches applied.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
