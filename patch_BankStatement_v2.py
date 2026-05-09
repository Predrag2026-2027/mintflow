#!/usr/bin/env python3
"""Fix: normalizeAccountNumber unused in BankStatementDialog - use it in partner account matching"""
import sys, os

path = 'src/components/BankStatementDialog.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found."); sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

# The partner dropdown shows accounts - fix the rowPartnerAccounts filter to use normalization
# Also fix the "already selected" account matching when partner has accounts
# Replace simple string comparison in getPartnerAccounts usage with normalized version

# Fix: use normalizeAccountNumber when finding matching account in the select defaultValue
old = """                            {rowPartnerAccounts.length > 0 ? (
                              <select style={s.select} value={row.account_number}
                                onChange={e => {
                                  const acc = rowPartnerAccounts.find(a => a.account_number === e.target.value)
                                  updateRow(row.id, { account_number: e.target.value, model: acc?.model || row.model })
                                }}>"""

new = """                            {rowPartnerAccounts.length > 0 ? (
                              <select style={s.select}
                                value={rowPartnerAccounts.find(a => normalizeAccountNumber(a.account_number) === normalizeAccountNumber(row.account_number))?.account_number || row.account_number}
                                onChange={e => {
                                  const acc = rowPartnerAccounts.find(a => a.account_number === e.target.value)
                                  updateRow(row.id, { account_number: e.target.value, model: acc?.model || row.model })
                                }}>"""

if old in src:
    src = src.replace(old, new, 1)
    print("OK: normalizeAccountNumber now used in account select matching")
else:
    print("MISS: account select not found, trying alternative fix")
    # Alternative: just remove the unused function and keep simple matching
    old2 = """  const normalizeAccountNumber = (acc: string): string => {
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

  """
    if old2 in src:
        src = src.replace(old2, "\n  ", 1)
        print("OK: removed unused normalizeAccountNumber from BankStatementDialog")
    else:
        print("MISS: could not find function to remove either")

if src == original:
    print("WARNING: No changes applied")
else:
    print("Patches applied.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
